// The Navidrome client against a scripted server: what it sends, how it reads
// answers, and what it does when the session is refused.
import { createPinia, setActivePinia } from "pinia";
import { NavidromeClient } from "@/api/client";
import { saveCredentials, loadCredentials, type ServerCredentials } from "@/api/credentials";
import { ApiError } from "@/api/types";
import { json, mockFetch, subsonicOk } from "../../helpers";

jest.mock("@/lib/env", () => ({ NAVIDROME_URL_ENV: "http://nd.test" }));

const creds = (extra: Partial<ServerCredentials> = {}): ServerCredentials => ({
  serverUrl: "http://nd.test",
  username: "alice",
  authMethod: "native",
  subsonicSalt: "salt",
  subsonicToken: "tok",
  jwt: "jwt-1",
  savedAt: 0,
  ...extra,
});

const subsonicFail = (code: number, message = "nope") =>
  json({ "subsonic-response": { status: "failed", error: { code, message } } });

beforeEach(() => setActivePinia(createPinia()));

describe("Subsonic requests", () => {
  it("carries the credentials and protocol fields, and repeats array parameters", async () => {
    const { calls } = mockFetch(() => subsonicOk({ playlist: { id: "p1" } }));
    await new NavidromeClient(creds()).createPlaylist("Mix", ["a", "b"]);
    const q = calls[0]!.searchParams;
    expect(calls[0]!.pathname).toBe("/rest/createPlaylist.view");
    expect(Object.fromEntries(["u", "t", "s", "c", "f"].map((k) => [k, q.get(k)]))).toEqual({
      u: "alice",
      t: "tok",
      s: "salt",
      c: "navi-player",
      f: "json",
    });
    expect(q.getAll("songId")).toEqual(["a", "b"]);
  });

  it("leaves the JSON format off binary URLs", () => {
    const c = new NavidromeClient(creds());
    const stream = new URL(c.streamUrl("s1", 192, "mp3"));
    expect(stream.searchParams.get("f")).toBeNull();
    expect(stream.searchParams.get("maxBitRate")).toBe("192");
    expect(new URL(c.downloadUrl("al1")).searchParams.get("f")).toBeNull();
    expect(c.coverArtUrl(undefined)).toBe("");
  });

  it("reports refused credentials once, as an auth error", async () => {
    const onAuthError = jest.fn();
    mockFetch(() => subsonicFail(40, "Wrong username or password"));
    const err = await new NavidromeClient(creds(), { onAuthError }).ping().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      code: 40,
      isAuthError: true,
      message: "Wrong username or password",
    });
    expect(onAuthError).toHaveBeenCalledTimes(1);
  });

  it("treats other failures as plain errors", async () => {
    const onAuthError = jest.fn();
    mockFetch(() => subsonicFail(70, "Not found"));
    await expect(new NavidromeClient(creds(), { onAuthError }).getSong("x")).rejects.toMatchObject({
      code: 70,
      isAuthError: false,
    });
    mockFetch(() => new Response("oops", { status: 500 }));
    await expect(new NavidromeClient(creds()).getSong("x")).rejects.toThrow("HTTP 500");
    mockFetch(() => {
      throw new TypeError("offline");
    });
    await expect(new NavidromeClient(creds()).getSong("x")).rejects.toBeInstanceOf(ApiError);
    expect(onAuthError).not.toHaveBeenCalled();
  });
});

describe("library calls", () => {
  it("flattens the artist index and renames an artist's albums", async () => {
    mockFetch((url) =>
      url.pathname.endsWith("getArtists.view")
        ? subsonicOk({
            artists: {
              index: [
                { artist: [{ id: "1", name: "A" }] },
                { artist: [{ id: "2", name: "B" }] },
                {},
              ],
            },
          })
        : subsonicOk({ artist: { id: "1", name: "A", album: [{ id: "al", name: "X" }] } }),
    );
    const c = new NavidromeClient(creds());
    expect((await c.getArtists()).map((a) => a.id)).toEqual(["1", "2"]);
    const artist = await c.getArtist("1");
    expect(artist.albums.map((a) => a.id)).toEqual(["al"]);
    expect(artist).not.toHaveProperty("album");
  });

  it("falls back to the original similar-songs endpoint when v2 has nothing", async () => {
    const { calls } = mockFetch((url) =>
      url.pathname.endsWith("getSimilarSongs2.view")
        ? subsonicOk({ similarSongs2: {} })
        : subsonicOk({ similarSongs: { song: [{ id: "s", title: "S" }] } }),
    );
    expect((await new NavidromeClient(creds()).getSimilarSongs("x")).map((s) => s.id)).toEqual([
      "s",
    ]);
    expect(calls.map((u) => u.pathname)).toEqual([
      "/rest/getSimilarSongs2.view",
      "/rest/getSimilarSongs.view",
    ]);
  });

  it("stars albums and artists with the right parameter", async () => {
    const { calls } = mockFetch(() => subsonicOk());
    const c = new NavidromeClient(creds());
    await c.star("al", "album");
    await c.unstar("ar", "artist");
    await c.star("so");
    expect(
      calls.map((u) => [
        u.pathname,
        u.searchParams.get("albumId") ?? u.searchParams.get("artistId") ?? u.searchParams.get("id"),
      ]),
    ).toEqual([
      ["/rest/star.view", "al"],
      ["/rest/unstar.view", "ar"],
      ["/rest/star.view", "so"],
    ]);
  });
});

describe("playlists", () => {
  it("makes new playlists private, finding the id when the server doesn't return it", async () => {
    const { calls } = mockFetch((url) => {
      if (url.pathname.endsWith("getPlaylists.view")) {
        return subsonicOk({
          playlists: {
            playlist: [
              { id: "old", name: "Mix", owner: "alice", created: "2020-01-01" },
              { id: "new", name: "Mix", owner: "alice", created: "2026-01-01" },
              { id: "theirs", name: "Mix", owner: "bob", created: "2027-01-01" },
            ],
          },
        });
      }
      return subsonicOk();
    });
    expect(await new NavidromeClient(creds()).createPlaylist("Mix")).toBe("new");
    const update = calls.find((u) => u.pathname.endsWith("updatePlaylist.view"))!;
    expect(update.searchParams.get("playlistId")).toBe("new");
    expect(update.searchParams.get("public")).toBe("false");
  });

  it("reorders by removing every entry, last first, then adding the new order", async () => {
    const { calls } = mockFetch(() => subsonicOk());
    await new NavidromeClient(creds()).overwritePlaylist("p", ["c", "a", "b"], 3);
    expect(calls[0]!.searchParams.getAll("songIndexToRemove")).toEqual(["2", "1", "0"]);
    expect(calls[1]!.searchParams.getAll("songIdToAdd")).toEqual(["c", "a", "b"]);
  });
});

describe("lyrics", () => {
  it("asks for structured and plain lyrics together when artist and title are known", async () => {
    const { calls } = mockFetch((url) =>
      url.pathname.endsWith("getLyrics.view")
        ? subsonicOk({ lyrics: { value: "one\ntwo" } })
        : subsonicOk({ lyricsList: {} }),
    );
    const out = await new NavidromeClient(creds()).getLyrics("s", { artist: "A", title: "T" });
    expect(out).toEqual([{ synced: false, line: [{ value: "one" }, { value: "two" }] }]);
    expect(calls).toHaveLength(2);
    expect(calls.some((u) => u.pathname.endsWith("getSong.view"))).toBe(false);
  });

  it("looks the song up only when needed, and prefers structured lyrics", async () => {
    const structured = [{ synced: true, line: [{ start: 0, value: "hi" }] }];
    const { calls } = mockFetch(() => subsonicOk({ lyricsList: { structuredLyrics: structured } }));
    expect(await new NavidromeClient(creds()).getLyrics("s")).toEqual(structured);
    expect(calls).toHaveLength(1);
  });
});

describe("Navidrome's own API", () => {
  it("sends the JWT and keeps the refreshed one it gets back", async () => {
    saveCredentials(creds());
    const seen: string[] = [];
    mockFetch((_url, init) => {
      seen.push(new Headers(init?.headers).get("x-nd-authorization") ?? "");
      return new Response(JSON.stringify({ id: "sh1" }), {
        headers: { "content-type": "application/json", "x-nd-authorization": "Bearer jwt-2" },
      });
    });
    const c = new NavidromeClient(creds());
    expect(await c.createShare(["al"])).toBe("http://nd.test/share/sh1");
    await c.createShare(["al"]);
    expect(seen).toEqual(["Bearer jwt-1", "Bearer jwt-2"]);
    expect(loadCredentials("http://nd.test")?.jwt).toBe("jwt-2");
  });

  it("says 'no permission' for someone else's playlist cover rather than signing out", async () => {
    const onAuthError = jest.fn();
    mockFetch(() => new Response("", { status: 403 }));
    const c = new NavidromeClient(creds(), { onAuthError });
    await expect(c.uploadPlaylistImage("p", new File(["x"], "c.png"))).rejects.toMatchObject({
      code: 403,
      isAuthError: false,
    });
    expect(onAuthError).not.toHaveBeenCalled();
  });

  it("is off for a Subsonic-token session", async () => {
    const { calls } = mockFetch(() => json({}));
    const c = new NavidromeClient(creds({ jwt: undefined, authMethod: "subsonic" }));
    expect(c.hasNativeSession).toBe(false);
    expect(await c.createShare(["al"])).toBeNull();
    await expect(c.uploadPlaylistImage("p", new File(["x"], "c.png"))).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(calls).toHaveLength(0);
  });
});

describe("listening stats", () => {
  const row = (id: string, playCount: number, extra = {}) => ({
    id,
    playCount,
    duration: 100,
    albumId: `al-${id}`,
    artistId: `ar-${id.slice(0, 1)}`,
    artist: `Artist ${id.slice(0, 1)}`,
    ...extra,
  });

  it("walks played tracks only, stopping at the first never-played one", async () => {
    const { calls } = mockFetch((url) => {
      if (url.pathname === "/api/song") {
        if (url.searchParams.get("_sort") === "playDate")
          return json([{ id: "a1", playDate: "2026-10-01" }]);
        return json([row("a1", 5), row("a2", 3), row("b1", 2), row("c1", 0), row("c2", 0)]);
      }
      if (url.pathname.endsWith("getSong.view")) {
        return subsonicOk({ song: { id: url.searchParams.get("id"), title: "t" } });
      }
      return subsonicOk({ starred2: { song: [{ id: "x" }] }, albumList2: { album: [] } });
    });
    const stats = await new NavidromeClient(creds()).getUserStats();
    expect(stats).toMatchObject({
      tracksPlayed: 3,
      totalPlays: 10,
      listeningSeconds: 1000,
      albumsPlayed: 3,
      artistsPlayed: 2,
      lastPlayed: "2026-10-01",
      favoriteSongs: 1,
      approximate: false,
    });
    expect(stats.topArtists?.map((a) => [a.name, a.playCount])).toEqual([
      ["Artist a", 8],
      ["Artist b", 2],
    ]);
    expect(stats.topSongs?.map((s) => s.id)).toEqual(["a1", "a2", "b1"]);
    expect(
      calls.filter(
        (u) => u.pathname === "/api/song" && u.searchParams.get("_sort") === "playCount",
      ),
    ).toHaveLength(1);
  });

  it("marks the totals approximate when the walk hits its cap", async () => {
    const full = Array.from({ length: 500 }, (_, i) => row(`a${i}`, 1));
    mockFetch((url) =>
      url.pathname === "/api/song" ? json(full) : subsonicOk({ song: { id: "s" } }),
    );
    const stats = await new NavidromeClient(creds()).getUserStats();
    expect(stats.approximate).toBe(true);
    expect(stats.tracksPlayed).toBe(20 * 500);
  });

  it("explains missing play counts on a Subsonic-token session", async () => {
    mockFetch(() => subsonicOk({ starred2: {}, albumList2: { album: [] } }));
    const stats = await new NavidromeClient(creds({ jwt: undefined })).getUserStats();
    expect(stats.unavailableReason).toBeTruthy();
    expect(stats.totalPlays).toBeUndefined();
    expect(stats.favoriteSongs).toBe(0);
  });

  it("adds up the library from album records, or estimates without the native API", async () => {
    mockFetch((url) =>
      url.pathname === "/api/album"
        ? json([
            { songCount: 10, size: 1000 },
            { songCount: 5, size: 500 },
          ])
        : subsonicOk({
            artists: { index: [{ artist: [{ id: "1", name: "A", albumCount: 2 }] }] },
            genres: { genre: [{ value: "Rock", songCount: 7, albumCount: 1 }] },
          }),
    );
    expect(await new NavidromeClient(creds()).getLibraryStats()).toEqual({
      artistCount: 1,
      albumCount: 2,
      songCount: 15,
      totalSize: 1500,
    });
    expect(await new NavidromeClient(creds({ jwt: undefined })).getLibraryStats()).toEqual({
      artistCount: 1,
      albumCount: 2,
      songCount: 7,
    });
  });
});
