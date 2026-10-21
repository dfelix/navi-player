// LRCLIB relay: the app's online-lyrics lookups go through this server rather
// than from the browser straight to lrclib.net.
//
// Why: LRCLIB rate-limits with 429 responses that carry no CORS headers, so a
// browser can't read them — it only sees an opaque network error and can't
// back off. The custom identification header a browser has to use instead of
// User-Agent also costs a CORS preflight per request, doubling the traffic.
// From here the status and Retry-After are visible, the client is identified
// with a real User-Agent, repeat lookups are answered from a small cache, and
// LRCLIB sees this server's address instead of each listener's.
//
// Only the two lookups the app uses are relayed, with only their documented
// parameters, so this can't be used to fetch anything else.
//
// Shared by the production server (server/index.ts) and the Vite dev server
// (vite.config.ts); it has no dependencies beyond fetch.

export const LRCLIB_API = "https://lrclib.net/api";
export const LRCLIB_ROUTE = "/lyrics/lrclib";

const PARAMS = {
  get: ["artist_name", "track_name", "album_name", "duration"],
  search: ["artist_name", "track_name"],
} as const;
type Endpoint = keyof typeof PARAMS;

// Track names are short; anything longer is not a lookup the app would make.
const MAX_PARAM_LENGTH = 300;

// Per attempt. The browser waits longer than two attempts plus the retry wait.
const ATTEMPT_TIMEOUT_MS = 6_000;

// LRCLIB normally asks for a second. A longer wait isn't worth holding the
// request open for; the app shows "no lyrics" and asks again later.
const MAX_RETRY_WAIT_MS = 3_000;

// Lyrics don't change, and a track is often looked up again (the next song is
// prefetched, both lyrics views ask, a song is replayed).
const CACHE_TTL_MS = 60 * 60_000;
const CACHE_MAX_ENTRIES = 500;

export interface RelayResult {
  status: number;
  body: string;
  headers: Record<string, string>;
}

export interface RelayOptions {
  userAgent: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  log?: (message: string) => void;
}

export type LrclibRelay = (endpoint: string, query: URLSearchParams) => Promise<RelayResult>;

function reply(status: number, body: unknown, extra: Record<string, string> = {}): RelayResult {
  return {
    status,
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json", "cache-control": "no-store", ...extra },
  };
}

// Seconds or an HTTP date; anything unreadable counts as one second.
function retryAfterMs(header: string | null, now: number): number {
  if (!header) return 1_000;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? 1_000 : Math.max(0, date - now);
}

export function createLrclibRelay(options: RelayOptions): LrclibRelay {
  const doFetch = options.fetch ?? fetch;
  const sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = options.now ?? Date.now;
  const log = options.log ?? ((message) => console.warn(message));

  const cache = new Map<string, { expires: number; result: RelayResult }>();
  const pending = new Map<string, Promise<RelayResult>>();
  // While LRCLIB has asked us to wait, don't ask again: answer 429 directly.
  let coolDownUntil = 0;

  function rateLimited(): RelayResult {
    const seconds = Math.max(1, Math.ceil((coolDownUntil - now()) / 1_000));
    return reply(
      429,
      { error: "rate-limited", retryAfter: seconds },
      { "retry-after": String(seconds) },
    );
  }

  async function attempt(url: string): Promise<Response> {
    return doFetch(url, {
      headers: { "user-agent": options.userAgent, accept: "application/json" },
      signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
    });
  }

  async function lookup(endpoint: Endpoint, upstreamQuery: string): Promise<RelayResult> {
    const url = `${LRCLIB_API}/${endpoint}?${upstreamQuery}`;
    try {
      let res = await attempt(url);
      if (res.status === 429) {
        const wait = retryAfterMs(res.headers.get("retry-after"), now());
        if (wait <= MAX_RETRY_WAIT_MS) {
          await sleep(wait);
          res = await attempt(url);
        }
        if (res.status === 429) {
          const again = retryAfterMs(res.headers.get("retry-after"), now());
          coolDownUntil = now() + Math.max(again, 1_000);
          log(`LRCLIB rate limited this server; pausing lookups for ${Math.ceil(again / 1_000)}s`);
          return rateLimited();
        }
      }
      if (res.status === 200 || res.status === 404) {
        const body = await res.text();
        const result = reply(res.status, body, { "cache-control": "private, max-age=3600" });
        return result;
      }
      log(`LRCLIB /${endpoint} answered HTTP ${res.status}`);
      return reply(502, { error: "upstream", status: res.status });
    } catch (err) {
      if (err instanceof DOMException && err.name === "TimeoutError") {
        log(`LRCLIB /${endpoint} timed out after ${ATTEMPT_TIMEOUT_MS} ms`);
        return reply(504, { error: "timeout" });
      }
      log(`LRCLIB /${endpoint} unreachable: ${(err as Error).message}`);
      return reply(502, { error: "unreachable" });
    }
  }

  return async (endpoint, query) => {
    if (!Object.hasOwn(PARAMS, endpoint)) return reply(404, { error: "not-found" });
    const allowed = PARAMS[endpoint as Endpoint];

    const upstream = new URLSearchParams();
    for (const name of allowed) {
      const value = (query.get(name) ?? "").trim();
      if (value.length > MAX_PARAM_LENGTH) return reply(400, { error: "bad-request" });
      if (value) upstream.set(name, value);
    }
    if (!upstream.get("artist_name") || !upstream.get("track_name")) {
      return reply(400, { error: "bad-request" });
    }
    const duration = upstream.get("duration");
    if (duration !== null && !/^\d{1,5}$/.test(duration)) {
      return reply(400, { error: "bad-request" });
    }

    upstream.sort();
    const key = `${endpoint}?${upstream}`;

    const hit = cache.get(key);
    if (hit && hit.expires > now()) return hit.result;
    if (hit) cache.delete(key);
    if (coolDownUntil > now()) return rateLimited();

    // Both lyrics views and the prefetch can ask for the same track at once.
    const inFlight = pending.get(key);
    if (inFlight) return inFlight;

    const promise = lookup(endpoint as Endpoint, upstream.toString()).finally(() =>
      pending.delete(key),
    );
    pending.set(key, promise);
    const result = await promise;

    // Only definite answers are kept; failures should be asked again.
    if (result.status === 200 || result.status === 404) {
      if (cache.size >= CACHE_MAX_ENTRIES) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(key, { expires: now() + CACHE_TTL_MS, result });
    }
    return result;
  };
}
