import { defineConfig, devices } from "@playwright/test";

// A port of its own, so the tests never collide with a dev server you have
// running on Vite's default 5173.
const PORT = Number(process.env.E2E_PORT ?? 5180);

// Browser tests: app.spec.ts drives the real app against a mocked Navidrome.
// See e2e/README.md.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
        launchOptions: {
          // Optional: use an already-installed Chromium instead of the build
          // this Playwright version pins (avoids a download).
          executablePath: process.env.PW_CHROMIUM_PATH || undefined,
        },
      },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    // Makes the dev server proxy the API on its own origin. Nothing listens
    // here: app.spec.ts answers every API request itself.
    // VITE_APP_NAME is pinned empty (the default name) so a local .env that
    // renames the app can't change what the tests see; real environment
    // variables take precedence over .env files.
    env: { VITE_NAVIDROME_URL: "http://127.0.0.1:9", VITE_APP_NAME: "" },
  },
});
