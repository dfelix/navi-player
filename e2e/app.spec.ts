// End-to-end checks of the real app in a browser, against a mocked Navidrome.
//
// The dev server proxies the API on its own origin (VITE_NAVIDROME_URL is set
// in playwright.config.ts), and every /rest and /auth request is answered here
// with page.route, so no real server is needed. What's verified is what the
// Navidrome-only adaptation promises: a login screen with only a username and
// password, no theme presets, no desktop/update/Jellyfin settings, the fixed
// dark + teal palette, and every API call going to the configured server.

import { test, expect, type Page, type Route } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const SHOTS = join("test-results", "app");
mkdirSync(SHOTS, { recursive: true });

const ALBUMS = Array.from({ length: 6 }, (_, i) => ({
  id: `al-${i}`,
  name: `Album ${i + 1}`,
  artist: `Artist ${i + 1}`,
  artistId: `ar-${i}`,
  songCount: 10,
  duration: 2400,
  year: 2000 + i,
}));

// Last.fm's shape for a name several acts share: one run-on paragraph.
const LUMEN_BIO =
  "There are multiple artists named Lumen: 1) Lumen, also known as BIG LUMEN, is a rapper from Atlanta. " +
  "2) Lumen is a Portuguese rock band formed in 2002 after The Quiet Hours ended. Their debut album, " +
  "Bom Dia, reached 6th place in the charts. 3) Lumen was a 1990s club project; the album Rising came " +
  "out in 1996. 4) Lumen was a Norwegian composer. 5) Lumen was a New Zealand rock band. " +
  '<a href="https://www.last.fm/music/Lumen">Read more on Last.fm</a>';

const ok = (body: Record<string, unknown> = {}) => ({
  "subsonic-response": {
    status: "ok",
    version: "1.16.1",
    type: "navidrome",
    serverVersion: "0.55.0",
    ...body,
  },
});

// Answers for the Subsonic endpoints the pages touch; anything else gets an
// empty "ok" envelope.
function subsonic(endpoint: string): Record<string, unknown> {
  switch (endpoint) {
    case "getAlbumList2.view":
      return ok({ albumList2: { album: ALBUMS } });
    case "getArtists.view":
      return ok({
        artists: {
          index: [{ name: "A", artist: [{ id: "ar-0", name: "Artist 1", albumCount: 1 }] }],
        },
      });
    case "getPlaylists.view":
      return ok({
        playlists: {
          playlist: [
            { id: "pl-1", name: "Road trip", owner: "alice", songCount: 3, public: false },
          ],
        },
      });
    case "getStarred2.view":
      return ok({ starred2: {} });
    case "getGenres.view":
      return ok({ genres: { genre: [] } });
    case "getArtist.view":
      return ok({
        artist: {
          id: "ar-lumen",
          name: "Lumen",
          albumCount: 1,
          album: [
            { id: "al-bom", name: "Bom Dia", artist: "Lumen", artistId: "ar-lumen", year: 2004 },
          ],
        },
      });
    case "getArtistInfo2.view":
      return ok({ artistInfo2: { biography: LUMEN_BIO } });
    case "getRandomSongs.view":
      return ok({ randomSongs: { song: [] } });
    default:
      return ok();
  }
}

interface Seen {
  api: string[];
}

async function mockNavidrome(page: Page, seen: Seen): Promise<void> {
  // Matched on the path start: Vite serves source modules from /src/auth/…
  // and /src/api/…, which must not be caught.
  await page.route(
    (url) => /^\/(rest|auth|api)\//.test(url.pathname),
    async (route: Route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/config") return route.fallback();
      seen.api.push(url.href);
      if (url.pathname === "/auth/login") {
        const body = route.request().postDataJSON() as { username: string; password: string };
        if (body.password !== "secret") {
          return route.fulfill({ status: 401, json: { error: "Invalid username or password" } });
        }
        return route.fulfill({
          json: {
            id: "u1",
            name: "Alice",
            username: body.username,
            isAdmin: false,
            token: "jwt",
            subsonicSalt: "s4lt",
            subsonicToken: "t0ken",
          },
        });
      }
      if (url.pathname.startsWith("/rest/getCoverArt")) {
        return route.fulfill({ status: 404, body: "" });
      }
      if (url.pathname.startsWith("/rest/")) {
        return route.fulfill({ json: subsonic(url.pathname.split("/").pop() ?? "") });
      }
      // Native API (stats, etc.): empty pages.
      return route.fulfill({ json: [] });
    },
  );
}

async function signIn(page: Page): Promise<void> {
  await page.getByLabel("Username").fill("alice");
  await page.getByLabel("Password", { exact: true }).fill("secret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator(".sidebar-brand-name")).toHaveText("NaviPlayer");
}

test.describe("NaviPlayer", () => {
  let seen: Seen;

  test.beforeEach(async ({ page }) => {
    seen = { api: [] };
    await mockNavidrome(page, seen);
    await page.goto("/");
  });

  test("login screen has only username and password", async ({ page }) => {
    await expect(page).toHaveTitle("NaviPlayer");
    await expect(page.getByRole("heading", { name: "NaviPlayer" })).toBeVisible();

    const form = page.locator("form.login-form");
    await expect(form.locator("input")).toHaveCount(2);
    await expect(page.getByLabel("Username")).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "password");

    // No server URL, provider choice or advanced options.
    const text = (await page.locator(".login-card").innerText()).toLowerCase();
    for (const gone of [
      "server url",
      "advanced",
      "jellyfin",
      "salt",
      "token",
      "quick connect",
      "recent servers",
    ]) {
      expect(text, `login screen mentions "${gone}"`).not.toContain(gone);
    }

    // The show/hide toggle reveals the password.
    await page.getByLabel("Password", { exact: true }).fill("hunter2");
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Hide password" }).click();

    await page.screenshot({ path: join(SHOTS, "login.png") });
  });

  test("a wrong password shows an error and stays on the login screen", async ({ page }) => {
    await page.getByLabel("Username").fill("alice");
    await page.getByLabel("Password", { exact: true }).fill("wrong");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toContainText("Invalid username or password");
    await expect(page.locator(".sidebar")).toHaveCount(0);
    // No Subsonic fallback attempt after a definitive 401.
    expect(seen.api.some((u) => u.includes("/rest/ping.view"))).toBe(false);
  });

  test("signs in, uses the configured server and keeps the session", async ({ page, baseURL }) => {
    await signIn(page);
    await expect(page.locator(".sidebar")).toContainText("Road trip");

    // Every API request went to the configured server (proxied on this origin).
    expect(seen.api.length).toBeGreaterThan(1);
    for (const u of seen.api) expect(u.startsWith(`${baseURL}/`)).toBe(true);

    // The password never lands in storage.
    const storage = await page.evaluate(() => JSON.stringify(localStorage));
    expect(storage).not.toContain("secret");

    // The drawer button is for phones only; the sidebar is always there here.
    await expect(page.getByRole("button", { name: "Open menu" })).toBeHidden();

    // Navigation: no Radio (it was Jellyfin Live TV).
    const nav = await page.locator(".sidebar-nav").innerText();
    expect(nav).not.toMatch(/radio/i);

    // Refresh restores the session.
    await page.reload();
    await expect(page.locator(".sidebar-brand-name")).toHaveText("NaviPlayer");
    await page.screenshot({ path: join(SHOTS, "home.png") });
  });

  test("uses the fixed dark and teal palette", async ({ page }) => {
    // The boot splash shows until the deployment config is resolved.
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    const colours = await page.evaluate(() => {
      const css = getComputedStyle(document.documentElement);
      return {
        body: getComputedStyle(document.body).backgroundColor,
        accent: css.getPropertyValue("--accent").trim(),
        content: css.getPropertyValue("--page").trim(),
        primary: getComputedStyle(document.querySelector(".btn-primary")!).backgroundColor,
      };
    });
    expect(colours.body).toBe("rgb(18, 18, 18)");
    expect(colours.content).toBe("#121212");
    expect(colours.accent).toBe("#14b8a6");
    expect(colours.primary).toBe("rgb(20, 184, 166)");
  });

  test("settings have no theme presets, desktop, update or Jellyfin features", async ({ page }) => {
    await signIn(page);
    await page.goto("/settings");

    const tabs = page.locator(".settings-tab");
    await expect(tabs).toHaveText(["Appearance", "Playback", "Connection", "Advanced"]);

    const banned = [
      /theme/i,
      /preset(?!s? ?…)/i,
      /desktop app/i,
      /update/i,
      /jellyfin/i,
      /app icon/i,
      /accent colour/i,
    ];
    for (let i = 0; i < 4; i++) {
      await tabs.nth(i).click();
      const name = (await tabs.nth(i).innerText()).trim();
      const content = page.locator(".settings-content");
      let text = await content.innerText();
      // The equalizer's *audio* presets (Bass Boost, Rock…) are not themes.
      text = text.replace(/Preset[\s\S]*?Save preset/g, "");
      for (const re of banned) expect(text, `${name} tab matches ${re}`).not.toMatch(re);
      await page.screenshot({
        path: join(SHOTS, `settings-${name.toLowerCase()}.png`),
        fullPage: true,
      });
    }

    await tabs.nth(2).click();
    const connection = page.locator(".settings-content");
    await expect(connection).toContainText("Server version0.55.0");
    await expect(connection).not.toContainText(/navidrome|subsonic/i);
    await expect(connection).toContainText("Install as an app");
    // The server is configuration, not a setting: nothing to type into.
    await expect(connection.locator("input[type=text], input[type=url]")).toHaveCount(0);
  });

  test("logout returns to the login screen", async ({ page }) => {
    await signIn(page);
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    // Nothing about the session is left behind.
    const storage = await page.evaluate(() => localStorage.getItem("navi-player:auth"));
    expect(storage).toBeNull();
  });

  test("mobile layout", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: join(SHOTS, "login-mobile.png") });
    await signIn(page);
    await expect(page.locator(".mobile-nav")).toBeVisible();
    await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
    await expect(page.getByText("Album 1").first()).toBeVisible();
    // No horizontal page scroll at phone width.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: join(SHOTS, "home-mobile.png") });
  });

  test("artist page picks this artist's entry from a shared Last.fm bio", async ({ page }) => {
    await signIn(page);
    await page.goto("/artist/ar-lumen");
    const bio = page.locator(".bio");
    await expect(bio).toContainText("Portuguese rock band");
    await expect(bio).not.toContainText("Atlanta");
    await expect(bio).not.toContainText("Read more");
    await page.screenshot({ path: join(SHOTS, "artist-bio-match.png") });

    await bio.getByRole("button", { name: /Last\.fm lists 5 artists/ }).click();
    await expect(bio.locator("li")).toHaveCount(5);
    await expect(bio.locator("li.bio-match")).toContainText("Portuguese");
    await page.screenshot({ path: join(SHOTS, "artist-bio-all.png") });
  });
});
