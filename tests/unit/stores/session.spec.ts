// Sign-in and session handling against a mocked Navidrome served under a base
// path (ND_BASEURL=/nd), driving the real session store, credentials and API
// client.

import { createHash } from "node:crypto";
import { createPinia, setActivePinia } from "pinia";
import { useSessionStore } from "@/stores/session";
import { loadCredentials } from "@/api/credentials";
import { json, mockFetch, subsonicOk } from "../../helpers";

jest.mock("@/lib/env", () => ({ NAVIDROME_URL_ENV: "http://navidrome.test/nd/" }));

const BASE = "http://navidrome.test/nd";
const USER = "alice";
const PASS = "correct horse battery staple";
const md5 = (s: string) => createHash("md5").update(s).digest("hex");
const stored = () => localStorage.getItem("navi-player:auth") ?? "";

// A fake Navidrome. `nativeRouted: false` simulates a reverse proxy that only
// forwards /rest, so /auth/login 404s.
function fakeNavidrome(opts: { nativeRouted?: boolean } = {}) {
  const { nativeRouted = true } = opts;
  return mockFetch(async (url, init) => {
    if (!url.pathname.startsWith("/nd/")) return new Response("not found", { status: 404 });
    const path = url.pathname.slice(3);

    if (path === "/auth/login") {
      if (!nativeRouted) return new Response("not found", { status: 404 });
      const body = JSON.parse(String(init?.body)) as { username: string; password: string };
      if (body.username !== USER || body.password !== PASS) {
        return json({ error: "Invalid username or password" }, 401);
      }
      return json({
        username: USER,
        isAdmin: false,
        token: "jwt-token",
        subsonicSalt: "abc123",
        subsonicToken: md5(PASS + "abc123"),
      });
    }

    if (path === "/rest/ping.view") {
      const p = url.searchParams;
      const ok = p.get("u") === USER && p.get("t") === md5(PASS + (p.get("s") ?? ""));
      return ok
        ? subsonicOk({ type: "navidrome", serverVersion: "0.55.0" })
        : json({
            "subsonic-response": {
              status: "failed",
              error: { code: 40, message: "Wrong username or password" },
            },
          });
    }

    return new Response("not found", { status: 404 });
  });
}

describe("session store", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("resolves the configured server on init", () => {
    const session = useSessionStore();
    session.init(false);
    expect(session.apiBase).toBe(BASE);
    expect(session.configError).toBeNull();
    expect(session.ready).toBe(true);
    expect(session.client).toBeNull();
  });

  it("uses this origin when the bundled server proxies Navidrome", () => {
    const session = useSessionStore();
    session.init(true);
    expect(session.apiBase).toBe(window.location.origin);
    expect(session.apiIsSameOrigin).toBe(true);
  });

  it("signs in with Navidrome's native login and never stores the password", async () => {
    fakeNavidrome();
    const session = useSessionStore();
    session.init(false);
    await session.login(USER, PASS);

    expect(session.isAuthenticated).toBe(true);
    expect(session.client?.hasNativeSession).toBe(true);
    expect(stored()).not.toContain(PASS);
    expect(JSON.parse(stored()).serverUrl).toBe(BASE);
  });

  it("builds every URL against the configured base", async () => {
    const { calls } = fakeNavidrome();
    const session = useSessionStore();
    session.init(false);
    await session.login(USER, PASS);
    const c = session.client!;

    expect(c.streamUrl("s1")).toMatch(new RegExp(`^${BASE}/rest/stream\\.view\\?`));
    expect(c.coverArtUrl("al-1", 300)).toMatch(new RegExp(`^${BASE}/rest/getCoverArt\\.view\\?`));
    expect(c.downloadUrl("al-1")).toMatch(new RegExp(`^${BASE}/rest/download\\.view\\?`));
    expect(new URL(c.streamUrl("s1")).searchParams.get("c")).toBe("navi-player");

    expect((await c.getServerInfo())?.version).toBe("0.55.0");
    expect(calls.every((u) => u.href.startsWith(`${BASE}/`))).toBe(true);
  });

  it("treats a wrong password as final: no Subsonic fallback attempt", async () => {
    const { calls } = fakeNavidrome();
    const session = useSessionStore();
    session.init(false);

    await expect(session.login(USER, "nope")).rejects.toThrow(/invalid username or password/i);
    expect(calls.some((u) => u.pathname.endsWith("/rest/ping.view"))).toBe(false);
    expect(session.client).toBeNull();
    expect(stored()).toBe("");
  });

  it("falls back to Subsonic token auth when /auth isn't routed", async () => {
    const { calls } = fakeNavidrome({ nativeRouted: false });
    const session = useSessionStore();
    session.init(false);
    await session.login(USER, PASS);

    expect(calls[0]?.pathname).toBe("/nd/auth/login");
    expect(session.client?.hasNativeSession).toBe(false);
    expect(stored()).not.toContain(PASS);
  });

  it("rejects a wrong password through the fallback too", async () => {
    fakeNavidrome({ nativeRouted: false });
    const session = useSessionStore();
    session.init(false);
    await expect(session.login(USER, "nope")).rejects.toThrow();
    expect(session.client).toBeNull();
  });

  it("asks for both fields before contacting the server", async () => {
    const { calls } = fakeNavidrome();
    const session = useSessionStore();
    session.init(false);
    await expect(session.login("", "")).rejects.toThrow(/username and password/i);
    expect(calls).toHaveLength(0);
  });

  it("restores a saved session for the same server on the next boot", async () => {
    fakeNavidrome();
    const first = useSessionStore();
    first.init(false);
    await first.login(USER, PASS);

    setActivePinia(createPinia());
    const next = useSessionStore();
    next.init(false);
    expect(next.isAuthenticated).toBe(true);
    expect(next.username).toBe(USER);
  });

  it("discards a session saved for a different server", async () => {
    fakeNavidrome();
    const session = useSessionStore();
    session.init(false);
    await session.login(USER, PASS);

    expect(loadCredentials("https://other.example.com")).toBeNull();
    expect(stored()).toBe("");
  });

  it("logs out by dropping the client and the stored credentials", async () => {
    fakeNavidrome();
    const session = useSessionStore();
    session.init(false);
    await session.login(USER, PASS);
    session.logout();
    expect(session.client).toBeNull();
    expect(stored()).toBe("");
  });

  it("asks for the password again when the server rejects the session", async () => {
    const session = useSessionStore();
    session.init(false);
    fakeNavidrome();
    await session.login(USER, PASS);

    mockFetch(() =>
      json({ "subsonic-response": { status: "failed", error: { code: 40, message: "expired" } } }),
    );
    await expect(session.client!.getArtists()).rejects.toThrow();
    expect(session.reauthRequired).toBe(true);
    expect(session.isAuthenticated).toBe(false);
  });
});
