// LRCLIB lyrics lookup, against a mocked LRCLIB so the contract is pinned
// without depending on a third-party service being up.
import { createPinia, setActivePinia } from "pinia";
import type { Song } from "@/api/types";
import { LrclibUnavailableError, fetchLyricsFromLrclib, parseLrc } from "@/services/lrclib";
import { useSettingsStore } from "@/stores/settings";
import { json, mockFetch } from "../../helpers";

const SYNCED = "[00:00.67] First line\n[00:04.52] Second line\n[01:05.10] After a minute";
const track = (extra: Record<string, unknown> = {}) => ({
  id: 1,
  trackName: "A Kind of Magic",
  artistName: "Queen",
  albumName: "A Kind of Magic",
  duration: 262,
  syncedLyrics: SYNCED,
  plainLyrics: "First line\nSecond line",
  ...extra,
});
const song = (extra: Partial<Song> = {}) =>
  ({
    id: "1",
    title: "A Kind of Magic",
    artist: "Queen",
    album: "A Kind of Magic",
    duration: 262,
    ...extra,
  }) as Song;

// The relay passes LRCLIB's JSON 404 through as-is.
const notFound = () => json({ code: 404, name: "TrackNotFound" }, 404);

beforeEach(() => setActivePinia(createPinia()));

describe("parseLrc", () => {
  const lines = parseLrc(
    [
      "[ar: Queen]",
      "[00:00.67] First line",
      "[01:05.10] After a minute",
      "[02:03.456] Precise",
      "[00:12.00]",
      "untimed",
    ].join("\n"),
  );

  it("skips metadata tags and untimed text", () => {
    expect(lines).toHaveLength(4);
    expect(lines.some((l) => l.value === "untimed")).toBe(false);
  });

  it("converts timestamps to milliseconds", () => {
    expect(lines.map((l) => l.start)).toEqual([670, 65_100, 123_456, 12_000]);
  });

  it("keeps blank lines (instrumental gaps) and trims text", () => {
    expect(lines[0]?.value).toBe("First line");
    expect(lines[3]?.value).toBe("");
  });

  it("repeats a line sung at several times, in time order", () => {
    const chorus = parseLrc("[00:30.00][01:10.00] Chorus\n[00:50.00] Verse");
    expect(chorus.map((l) => [l.start, l.value])).toEqual([
      [30_000, "Chorus"],
      [50_000, "Verse"],
      [70_000, "Chorus"],
    ]);
  });

  it("reads two-digit fractions as centiseconds", () => {
    expect(parseLrc("[00:01.5] x")[0]?.start).toBe(1_500);
    expect(parseLrc("[00:01.05] x")[0]?.start).toBe(1_050);
  });
});

describe("fetchLyricsFromLrclib", () => {
  it("uses the exact /get match when there is one", async () => {
    const { calls } = mockFetch((url) =>
      url.pathname === "/lyrics/lrclib/get" ? json(track()) : json([]),
    );
    const out = await fetchLyricsFromLrclib(song());
    expect(out?.synced).toBe(true);
    expect(out?.line).toHaveLength(3);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.searchParams.get("duration")).toBe("262");
  });

  it("falls back to /search when the tags don't match exactly", async () => {
    mockFetch((url) =>
      url.pathname === "/lyrics/lrclib/get" ? notFound() : json([track({ duration: 264 })]),
    );
    const out = await fetchLyricsFromLrclib(song({ album: "Some Compilation", duration: 264 }));
    expect(out?.synced).toBe(true);
    expect(out?.displayTitle).toBe("A Kind of Magic");
  });

  it("rejects a search result whose length doesn't match", async () => {
    mockFetch((url) => (url.pathname === "/lyrics/lrclib/get" ? notFound() : json([track()])));
    expect(await fetchLyricsFromLrclib(song({ duration: 30 }))).toBeNull();
  });

  it("returns null when LRCLIB has nothing", async () => {
    mockFetch((url) => (url.pathname === "/lyrics/lrclib/get" ? notFound() : json([])));
    expect(await fetchLyricsFromLrclib(song())).toBeNull();
  });

  it("makes no request without an artist", async () => {
    const { calls } = mockFetch(() => json([]));
    expect(await fetchLyricsFromLrclib(song({ artist: "" }))).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("asks this app's server, not lrclib.net", async () => {
    const { calls, fn } = mockFetch(() => json(track()));
    await fetchLyricsFromLrclib(song());
    expect(calls[0]?.origin).toBe("http://localhost");
    expect(calls[0]?.pathname).toBe("/lyrics/lrclib/get");
    // No custom header, so no CORS preflight; the relay identifies the client.
    expect((fn.mock.calls[0] as unknown[])[1]).not.toHaveProperty("headers");
  });

  it("reports a rate limit as 'unavailable', not 'no lyrics'", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    const { calls } = mockFetch(() => json({ error: "rate-limited", retryAfter: 2 }, 429));
    const err = await fetchLyricsFromLrclib(song()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LrclibUnavailableError);
    expect((err as LrclibUnavailableError).reason).toBe("rate limited by LRCLIB, retry after 2s");
    // No point searching while rate limited.
    expect(calls).toHaveLength(1);
  });

  it("reports network failures and a missing relay as 'unavailable'", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    mockFetch(() => {
      throw new TypeError("network down");
    });
    await expect(fetchLyricsFromLrclib(song())).rejects.toBeInstanceOf(LrclibUnavailableError);

    // A static host without the relay answers with the app's index.html.
    mockFetch(() => new Response("<!doctype html>", { headers: { "content-type": "text/html" } }));
    await expect(fetchLyricsFromLrclib(song())).rejects.toThrow(/no LRCLIB relay/);
  });
});

describe("logging", () => {
  // Everything LRCLIB-related goes through the app logger under one tag, so it
  // follows the Log level setting and can be filtered in the console.
  function capture(level: "error" | "info" | "debug") {
    useSettingsStore().power.developer.logLevel = level;
    const lines: string[] = [];
    const record =
      (method: string) =>
      (...args: unknown[]) =>
        lines.push(`${method} ${args.map(String).join(" ")}`);
    for (const method of ["error", "warn", "log", "debug"] as const) {
      jest.spyOn(console, method).mockImplementation(record(method));
    }
    return lines;
  }

  afterEach(() => jest.restoreAllMocks());

  it("reports each lookup's outcome at info level", async () => {
    const lines = capture("info");
    mockFetch((url) => (url.pathname === "/lyrics/lrclib/get" ? json(track()) : json([])));
    await fetchLyricsFromLrclib(song());
    expect(lines).toEqual([
      expect.stringMatching(/^log \[lrclib\] "Queen — A Kind of Magic": synced lyrics \(\d+ ms\)$/),
    ]);
  });

  it("traces requests and why a search result was rejected at debug level", async () => {
    const lines = capture("debug");
    mockFetch((url) => (url.pathname === "/lyrics/lrclib/get" ? notFound() : json([track()])));
    await fetchLyricsFromLrclib(song({ duration: 30 }));
    const text = lines.join("\n");
    expect(text).toContain("GET /lyrics/lrclib/get?artist_name=Queen");
    expect(text).toMatch(/\/get → 404 not found/);
    expect(text).toMatch(/\/search → 200/);
    expect(text).toContain("none within ±5s of 30s");
    expect(text).toMatch(/: no lyrics \(\d+ ms\)/);
  });

  it("warns about failures even at the default level", async () => {
    const lines = capture("error");
    mockFetch(() => json({ error: "unreachable" }, 502));
    await fetchLyricsFromLrclib(song()).catch(() => {});
    expect(lines).toEqual([
      expect.stringMatching(/^warn \[lrclib\] \/get: the server could not reach LRCLIB/),
    ]);
  });

  it("says when a lookup was skipped and why", async () => {
    const lines = capture("info");
    mockFetch(() => json({ error: "rate-limited", retryAfter: 1 }, 429));
    await fetchLyricsFromLrclib(song()).catch(() => {});
    expect(lines.at(-1)).toMatch(
      /^log \[lrclib\] "Queen — A Kind of Magic": not looked up — rate limited by LRCLIB/,
    );
  });

  it("names timeouts as such", async () => {
    const lines = capture("error");
    mockFetch(() => {
      throw new DOMException("signal timed out", "TimeoutError");
    });
    await fetchLyricsFromLrclib(song()).catch(() => {});
    expect(lines[0]).toMatch(/^warn \[lrclib\] \/get: no answer after 20000 ms/);
  });

  it("stays quiet when the log level is silent", async () => {
    const lines = capture("error");
    useSettingsStore().power.developer.logLevel = "silent";
    mockFetch(() => json({ error: "upstream", status: 503 }, 502));
    await fetchLyricsFromLrclib(song()).catch(() => {});
    expect(lines).toEqual([]);
  });
});

describe("fetchLyrics with LRCLIB unavailable", () => {
  it("returns a provisional 'none' that is asked again within a minute", async () => {
    const { fetchLyrics, lyricsStaleTime, LYRICS_STALE_MS } = await import("@/services/lyrics");
    const { useSessionStore } = await import("@/stores/session");
    jest.spyOn(console, "warn").mockImplementation(() => {});
    const session = useSessionStore();
    (session as unknown as { client: unknown }).client = { getLyrics: async () => [] };
    useSettingsStore().playback.onlineLyrics = true;
    mockFetch(() => json({ error: "rate-limited", retryAfter: 1 }, 429));

    const result = await fetchLyrics(song());
    expect(result).toEqual({ source: null, list: [], provisional: true });
    expect(lyricsStaleTime({ state: { data: result } })).toBe(60_000);
    expect(lyricsStaleTime({ state: { data: { source: null, list: [] } } })).toBe(LYRICS_STALE_MS);
  });
});
