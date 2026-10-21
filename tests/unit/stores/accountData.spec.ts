// One account's cached data must never be shown to the next one: library
// queries (playlists, favourites, stats are per user) and cover art, whose
// cached URLs carry the Subsonic token.

import { readFileSync } from "node:fs";
import { createPinia, setActivePinia } from "pinia";
import { qk, queryClient } from "@/lib/query";
import { ART_CACHE } from "@/lib/swCaches";
import { useSessionStore } from "@/stores/session";
import { json, mockFetch } from "../../helpers";

jest.mock("@/lib/env", () => ({ NAVIDROME_URL_ENV: "http://navidrome.test" }));

const cacheDelete = jest.fn(async () => true);

function signInAnyone() {
  mockFetch(async (url, init) => {
    if (url.pathname !== "/auth/login") return new Response("not found", { status: 404 });
    const { username } = JSON.parse(String(init?.body)) as { username: string };
    return json({ username, token: "jwt", subsonicSalt: "s", subsonicToken: "t" });
  });
}

const cachedPlaylists = () => queryClient.getQueryData(qk.playlists());

beforeEach(() => {
  setActivePinia(createPinia());
  queryClient.clear();
  cacheDelete.mockClear();
  Object.defineProperty(globalThis, "caches", {
    configurable: true,
    value: { delete: cacheDelete },
  });
  signInAnyone();
});

afterEach(() => {
  delete (globalThis as { caches?: unknown }).caches;
});

describe("account data", () => {
  it("is forgotten on logout", async () => {
    const session = useSessionStore();
    session.init(false);
    await session.login("alice", "pw");
    queryClient.setQueryData(qk.playlists(), ["alice's private playlist"]);

    session.logout();

    expect(cachedPlaylists()).toBeUndefined();
    expect(cacheDelete).toHaveBeenCalledWith(ART_CACHE);
  });

  it("is forgotten when a different account signs in without logging out", async () => {
    const session = useSessionStore();
    session.init(false);
    await session.login("alice", "pw");
    queryClient.setQueryData(qk.playlists(), ["alice's private playlist"]);

    // e.g. the session expired and someone else signed in on the prompt.
    session.reauthRequired = true;
    await session.login("bob", "pw");

    expect(cachedPlaylists()).toBeUndefined();
    expect(cacheDelete).toHaveBeenCalledWith(ART_CACHE);
  });

  it("is kept when the same account signs in again after an expiry", async () => {
    const session = useSessionStore();
    session.init(false);
    await session.login("alice", "pw");
    queryClient.setQueryData(qk.playlists(), ["alice's private playlist"]);

    session.reauthRequired = true;
    await session.login("alice", "pw");

    expect(cachedPlaylists()).toEqual(["alice's private playlist"]);
    expect(cacheDelete).not.toHaveBeenCalled();
  });
});

describe("cover art cache name", () => {
  it("matches the one the service worker uses", () => {
    const sw = readFileSync("public/sw.js", "utf8");
    expect(sw).toContain(`const ART_CACHE = "${ART_CACHE}";`);
  });
});
