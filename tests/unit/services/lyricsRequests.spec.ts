// How many round trips a lyrics lookup costs. The miss path — a library with no
// lyrics tags, which is most of them — must ask both endpoints at once, and not
// look the song up again when the caller already knows artist and title.
import { NavidromeClient } from "@/api/client";
import type { ServerCredentials } from "@/api/credentials";
import { mockFetch, subsonicOk } from "../../helpers";

const creds: ServerCredentials = {
  serverUrl: "http://navidrome.test",
  username: "tester",
  authMethod: "subsonic",
  subsonicSalt: "salt",
  subsonicToken: "token",
  savedAt: 0,
};
const HINTS = { artist: "Artist", title: "Title" };

function server(opts: { structured: boolean; plain: boolean }) {
  let inFlight = 0;
  let maxInFlight = 0;
  const mock = mockFetch(async (url) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    // Hold briefly so genuinely parallel requests overlap.
    await new Promise((r) => setTimeout(r, 20));
    inFlight--;
    const endpoint = url.pathname.split("/").pop();
    if (endpoint === "getLyricsBySongId.view") {
      return subsonicOk({
        lyricsList: {
          structuredLyrics: opts.structured
            ? [{ synced: true, line: [{ start: 0, value: "structured" }] }]
            : [],
        },
      });
    }
    if (endpoint === "getLyrics.view")
      return subsonicOk({ lyrics: opts.plain ? { value: "plain words" } : {} });
    if (endpoint === "getSong.view")
      return subsonicOk({ song: { id: "s1", title: "Title", artist: "Artist" } });
    return subsonicOk();
  });
  const endpoints = () => mock.calls.map((u) => u.pathname.split("/").pop());
  return { endpoints, maxInFlight: () => maxInFlight };
}

describe("NavidromeClient.getLyrics", () => {
  const api = new NavidromeClient(creds);

  it("asks both endpoints at once, and nothing else, when there are none", async () => {
    const s = server({ structured: false, plain: false });
    expect(await api.getLyrics("s1", HINTS)).toEqual([]);
    expect(s.endpoints().sort()).toEqual(["getLyrics.view", "getLyricsBySongId.view"]);
    expect(s.maxInFlight()).toBe(2);
  });

  it("prefers structured lyrics", async () => {
    server({ structured: true, plain: false });
    const out = await api.getLyrics("s1", HINTS);
    expect(out).toHaveLength(1);
    expect(out[0]?.synced).toBe(true);
  });

  it("falls back to plain lyrics", async () => {
    server({ structured: false, plain: true });
    const out = await api.getLyrics("s1", HINTS);
    expect(out[0]?.synced).toBe(false);
    expect(out[0]?.line[0]?.value).toBe("plain words");
  });

  it("looks the song up only when the caller has no artist/title", async () => {
    const s = server({ structured: false, plain: true });
    const out = await api.getLyrics("s1");
    expect(out[0]?.line[0]?.value).toBe("plain words");
    expect(s.endpoints()).toContain("getSong.view");
  });
});
