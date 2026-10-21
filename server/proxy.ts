// Passing the app's requests on to Navidrome, so the browser only ever talks
// to this server: no CORS, and streams and covers count as same-origin (which
// the equaliser and album colours need).

import type { Context, Hono } from "hono";
import { config } from "./config.js";

// Request headers worth passing on: auth, range requests for seeking, and
// conditional requests so cached covers revalidate with a cheap 304.
const REQUEST_HEADERS = [
  "content-type",
  "accept",
  "range",
  "authorization",
  "x-nd-authorization",
  "x-nd-client-unique-id",
  "if-none-match",
  "if-modified-since",
];

// Response headers passed back. Caching headers only for images and audio:
// covers are content-addressed and safe to cache, while library JSON must
// never be served stale from a heuristic cache.
const RESPONSE_HEADERS = ["content-type", "content-range", "accept-ranges", "x-nd-authorization"];
const MEDIA_CACHE_HEADERS = ["cache-control", "etag", "last-modified", "expires", "vary", "age"];

export const PROXIED_PREFIXES = ["/rest/", "/auth/", "/api/", "/share/"];

function pick(from: (name: string) => string | null | undefined, names: string[]) {
  const out: Record<string, string> = {};
  for (const name of names) {
    const value = from(name);
    if (value) out[name] = value;
  }
  return out;
}

async function forward(c: Context): Promise<Response> {
  if (!config.navidrome) {
    return c.json({ error: "VITE_NAVIDROME_URL is not configured on this server" }, 503);
  }
  const { pathname, search } = new URL(c.req.url);
  const hasBody = !["GET", "HEAD"].includes(c.req.method);

  let upstream: Response;
  try {
    upstream = await fetch(config.navidrome + pathname + search, {
      method: c.req.method,
      headers: pick((n) => c.req.header(n), REQUEST_HEADERS),
      body: hasBody ? await c.req.arrayBuffer() : undefined,
    });
  } catch (err) {
    // Navidrome's address is internal: it goes to the log, not the response.
    console.error(`Could not reach Navidrome at ${config.navidrome}:`, (err as Error).message);
    return c.json({ error: "Could not reach the music server" }, 502);
  }

  const get = (n: string) => upstream.headers.get(n);
  const headers = pick(get, RESPONSE_HEADERS);
  // fetch() has already decompressed an encoded body, so its Content-Length
  // (the compressed size) would cut it short. Only plain bodies keep theirs,
  // which is what range requests on audio need.
  const length = get("content-length");
  if (length && !get("content-encoding")) headers["content-length"] = length;
  if (/^(image|audio)\//i.test(get("content-type") ?? "")) {
    Object.assign(headers, pick(get, MEDIA_CACHE_HEADERS));
  }
  // The body is streamed through, never buffered: tracks can be large.
  return new Response(upstream.body, { status: upstream.status, headers });
}

export function mountProxy(app: Hono): void {
  for (const prefix of PROXIED_PREFIXES) app.all(`${prefix}*`, forward);
}
