// The built app (DIST_DIR): its files, and the page shell for every other
// path so the app's own router can take over (deep links, reloads).

import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { Readable } from "node:stream";
import type { Context, Hono } from "hono";
import { config } from "./config.js";
import { previewPage } from "./previews.js";
import { pageShell, renamed, renamedManifest } from "./shell.js";

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  js: "application/javascript",
  css: "text/css",
  json: "application/json",
  webmanifest: "application/manifest+json",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  txt: "text/plain",
};

const NEVER_CACHE = "no-cache, no-store, must-revalidate";

function cachingFor(pathname: string): string {
  // Build output has content hashes in its names: it never changes.
  if (pathname.startsWith("/assets/")) return "public, max-age=31536000, immutable";
  // A cached service worker would hold every visitor on an old version.
  if (pathname === "/sw.js") return NEVER_CACHE;
  return "public, max-age=600";
}

// The file a request path names, if it exists inside the app folder. Paths
// that would resolve outside it ("/../../etc/passwd") never match.
async function fileFor(pathname: string): Promise<string | null> {
  const root = config.distDir;
  const options = [
    resolve(root, `.${pathname}`),
    resolve(root, `.${pathname.replace(/\/$/, "")}/index.html`),
  ];
  for (const path of options) {
    if (path !== root && !path.startsWith(root + sep)) continue;
    if ((await stat(path).catch(() => null))?.isFile()) return path;
  }
  return null;
}

const html = (body: string) =>
  new Response(body, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": NEVER_CACHE },
  });

async function serve(c: Context): Promise<Response> {
  const preview = await previewPage(c);
  if (preview) return preview;

  const { pathname } = new URL(c.req.url);
  const path = await fileFor(pathname);
  if (!path) return html(await pageShell());

  // Pages and the manifest carry the display name.
  if (path.endsWith(".html")) return html(renamed(await readFile(path, "utf8")));
  if (config.appName && pathname === "/manifest.webmanifest") {
    return c.json(await renamedManifest(path), 200, {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "no-cache",
    });
  }
  const type = TYPES[path.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
  return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, {
    headers: { "Content-Type": type, "Cache-Control": cachingFor(pathname) },
  });
}

export function mountStaticFiles(app: Hono): void {
  app.all("*", serve);
}
