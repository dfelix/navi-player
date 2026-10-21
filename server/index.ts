// NaviPlayer's server: serves the built app and, when VITE_NAVIDROME_URL is
// set, passes the app's requests to Navidrome from the same address (so no
// CORS is needed). It also does what a browser can't on its own: admin
// uploads into the music folder, transcoded album ZIPs, link-preview cards,
// and relaying LRCLIB lyrics lookups. Settings: ./config.ts and the README.

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { config } from "./config.js";
import { mountLibrary } from "./library.js";
import { LRCLIB_ROUTE, createLrclibRelay } from "./lrclib.js";
import { mountPreviewCovers } from "./previews.js";
import { PROXIED_PREFIXES, mountProxy } from "./proxy.js";
import { mountStaticFiles } from "./staticFiles.js";
import { mountZipDownload } from "./zipDownload.js";
import { readFileSync } from "node:fs";

const app = new Hono();

// Security headers on everything this server answers itself. Navidrome's own
// responses pass through untouched: its share pages need inline scripts that
// a strict policy would block. HSTS belongs on the HTTPS proxy in front.
const fromNavidrome = (path: string) =>
  PROXIED_PREFIXES.some((prefix) => path.startsWith(prefix)) && path !== "/api/config";
app.use("*", async (c, next) => {
  await next();
  if (fromNavidrome(c.req.path)) return;
  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("Referrer-Policy", "no-referrer");
  c.res.headers.set("X-Frame-Options", "DENY");
  c.res.headers.set("Content-Security-Policy", "frame-ancestors 'none'; base-uri 'self'");
});

// What the app should expect from this server (stores/serverConfig).
app.get("/api/config", (c) =>
  c.json({
    proxyMode: !!config.navidrome,
    uploadEnabled: config.uploadsEnabled,
    linkPreviews: config.previewsEnabled,
  }),
);

// Online lyrics; independent of Navidrome, so also in direct mode.
const version = (() => {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    return typeof pkg.version === "string" ? (pkg.version as string) : "dev";
  } catch {
    return "dev";
  }
})();
const lrclib = createLrclibRelay({ userAgent: `navi-player/${version}` });
app.get(`${LRCLIB_ROUTE}/:endpoint`, async (c) => {
  const answer = await lrclib(c.req.param("endpoint"), new URL(c.req.url).searchParams);
  return c.body(answer.body, answer.status as 200, answer.headers);
});

mountLibrary(app);
mountZipDownload(app);
mountProxy(app);
mountPreviewCovers(app);
mountStaticFiles(app); // last: it answers every remaining path

const server = serve({ fetch: app.fetch, port: config.port }, ({ port }) => {
  console.log(`Server listening on port ${port}`);
});

// As a container's first process, Node ignores SIGTERM unless told otherwise,
// and `docker stop` would wait ten seconds and kill it. Nothing needs draining.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    server.close();
    process.exit(0);
  });
}

if (config.appName) console.log(`Display name: "${config.appName}" (VITE_APP_NAME)`);
console.log(
  config.navidrome
    ? `Proxy mode: forwarding /rest, /auth, /api and /share → ${config.navidrome}`
    : "Direct mode: VITE_NAVIDROME_URL is not set here, so browsers use the URL the app was built with",
);
if (config.musicDir) {
  console.log(
    `Upload mode: writing to ${config.musicDir} (up to ${config.uploadMb} MB per upload)`,
  );
}
if (config.previewsEnabled) {
  console.log(`Link previews: rich cards for crawlers via account "${config.preview.user}"`);
}
