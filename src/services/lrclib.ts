// Online lyrics from LRCLIB (https://lrclib.net), for tracks your music server
// has no lyrics for.
//
// LRCLIB is a free, open lyrics database with no accounts or ads, aimed at
// self-hosted players; most of its entries are time-synced. Looking lyrics up
// there is a setting, off by default, since it's the one place track details
// leave your own servers. The browser asks NaviPlayer's server, which relays
// to LRCLIB (server/lrclib.ts says why): LRCLIB sees the artist, title, album
// and length of the track, from the server's address, and nothing about who
// is listening.

import type { Song, StructuredLyrics } from "@/api/types";
import { log } from "@/lib/log";
import { parseLrc, plainLines } from "@/lib/lrc";

export { parseLrc } from "@/lib/lrc";

// The relay on NaviPlayer's own origin (production and dev server alike).
const BASE = "/lyrics/lrclib";

// How far (seconds) a search result's length may be from the track's for its
// timings to be trusted.
const DURATION_TOLERANCE_S = 5;

// Longer than the relay's worst case: two attempts plus a rate-limit wait.
const REQUEST_TIMEOUT_MS = 20_000;

// LRCLIB couldn't answer right now (rate limited, down, unreachable). Unlike
// "not found", this says nothing about the track, so it must not be remembered
// as "no lyrics".
export class LrclibUnavailableError extends Error {
  constructor(readonly reason: string) {
    super(`LRCLIB unavailable: ${reason}`);
    this.name = "LrclibUnavailableError";
  }
}

interface LrclibTrack {
  id: number;
  trackName: string;
  artistName: string;
  albumName?: string;
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

// What the listener sees: synced lyrics when there are any, else plain, else
// a note for instrumentals. Null when the record has nothing usable.
function toStructured(track: LrclibTrack): StructuredLyrics | null {
  const credit = { displayArtist: track.artistName, displayTitle: track.trackName };
  if (track.instrumental) return { synced: false, line: [{ value: "♪ Instrumental" }], ...credit };
  const synced = track.syncedLyrics ? parseLrc(track.syncedLyrics) : [];
  if (synced.length > 0) return { synced: true, line: synced, ...credit };
  const plain = track.plainLyrics ? plainLines(track.plainLyrics) : [];
  return plain.length > 0 ? { synced: false, line: plain, ...credit } : null;
}

// Milliseconds since `start`, rounded, for log lines.
function since(start: number): number {
  return Math.round(performance.now() - start);
}

// What a lookup is about, for log lines: enough to tell tracks apart in the
// console, and nothing that isn't already in the request LRCLIB sees.
function describe(song: Song): string {
  return `"${song.artist ?? ""} — ${song.title ?? ""}"`;
}

// The relay's answer when LRCLIB itself didn't give one: what to tell the user
// in the log.
function relayReason(status: number, body: { error?: string; retryAfter?: number }): string {
  if (status === 429) {
    return `rate limited by LRCLIB${body.retryAfter ? `, retry after ${body.retryAfter}s` : ""}`;
  }
  if (body.error === "timeout") return "LRCLIB timed out";
  if (body.error === "unreachable") return "the server could not reach LRCLIB";
  if (body.error === "upstream") return "LRCLIB returned an error";
  return `HTTP ${status}`;
}

// null means LRCLIB doesn't have it; LrclibUnavailableError means it couldn't
// say.
async function request<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value));
  const url = `${BASE}${path}?${query}`;
  const start = performance.now();
  log.debug("lrclib", `GET ${url}`);
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (err) {
    const reason =
      err instanceof DOMException && err.name === "TimeoutError"
        ? `no answer after ${REQUEST_TIMEOUT_MS} ms`
        : "could not reach this app's server";
    log.warn("lrclib", `${path}: ${reason} (${since(start)} ms)`, err);
    throw new LrclibUnavailableError(reason);
  }
  // A 404 just means LRCLIB doesn't have this track.
  if (res.status === 404 && isJson(res)) {
    log.debug("lrclib", `${path} → 404 not found (${since(start)} ms)`);
    return null;
  }
  if (!isJson(res)) {
    // The SPA fallback or a plain 404 page: a static deployment without the relay.
    const reason = "this server has no LRCLIB relay (see README → Online lyrics)";
    log.warn("lrclib", `${path}: ${reason}, HTTP ${res.status}`);
    throw new LrclibUnavailableError(reason);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; retryAfter?: number };
    const reason = relayReason(res.status, body);
    log.warn("lrclib", `${path}: ${reason} (${since(start)} ms)`);
    throw new LrclibUnavailableError(reason);
  }
  try {
    const body = (await res.json()) as T;
    log.debug("lrclib", `${path} → ${res.status} (${since(start)} ms)`);
    return body;
  } catch (err) {
    log.warn("lrclib", `${path}: unreadable response (${since(start)} ms)`, err);
    throw new LrclibUnavailableError("unreadable response");
  }
}

function isJson(res: Response): boolean {
  return (res.headers.get("content-type") ?? "").includes("application/json");
}

// Which kind of lyrics a record carries, for log lines.
function kindOf(track: LrclibTrack): string {
  if (track.instrumental) return "instrumental";
  if (track.syncedLyrics) return "synced";
  if (track.plainLyrics) return "plain";
  return "empty";
}

// The search result to trust. Same title and artist can be a live take or a
// radio edit with different timings, so only a result of about the same
// length counts: synced before plain, then the closest length. Without a
// length to compare, only synced lyrics are worth the gamble.
function chooseHit(hits: LrclibTrack[], length: number): LrclibTrack | undefined {
  if (!length) return hits.find((h) => h.syncedLyrics);
  const off = (h: LrclibTrack) => Math.abs((h.duration ?? 0) - length);
  const rank = (h: LrclibTrack) => (h.syncedLyrics ? 0 : 1000) + off(h);
  return hits
    .filter((h) => off(h) <= DURATION_TOLERANCE_S)
    .reduce<LrclibTrack | undefined>(
      (best, h) => (!best || rank(h) < rank(best) ? h : best),
      undefined,
    );
}

export async function fetchLyricsFromLrclib(song: Song): Promise<StructuredLyrics | null> {
  const start = performance.now();
  try {
    const result = await lookup(song);
    const outcome = result ? `${result.synced ? "synced" : "plain"} lyrics` : "no lyrics";
    log.info("lrclib", `${describe(song)}: ${outcome} (${since(start)} ms)`);
    return result;
  } catch (err) {
    if (err instanceof LrclibUnavailableError) {
      log.info("lrclib", `${describe(song)}: not looked up — ${err.reason} (${since(start)} ms)`);
    }
    throw err;
  }
}

async function lookup(song: Song): Promise<StructuredLyrics | null> {
  const [artist, title, album] = [song.artist, song.title, song.album].map((v) => (v ?? "").trim());
  if (!artist || !title) {
    log.debug("lrclib", `skipped ${describe(song)}: missing artist or title`);
    return null;
  }
  const seconds = song.duration ? String(Math.round(song.duration)) : "";

  // First the exact record for this release (album and length included), whose
  // timings are the ones that fit this file.
  const record = await request<LrclibTrack>("/get", {
    artist_name: artist,
    track_name: title,
    album_name: album,
    duration: seconds,
  });
  const fromRecord = record && toStructured(record);
  if (record) {
    log.debug(
      "lrclib",
      fromRecord
        ? `exact match #${record.id} (${kindOf(record)})`
        : `exact match #${record.id} has no usable lyrics; searching`,
    );
  }
  if (fromRecord) return fromRecord;

  // Then a search by artist and title alone: library tags often differ from
  // LRCLIB's (a compilation's album name, a slightly different length). The
  // results are checked against the track before one is used.
  const hits = await request<LrclibTrack[]>("/search", { artist_name: artist, track_name: title });
  if (!Array.isArray(hits) || hits.length === 0) {
    log.debug("lrclib", "search returned nothing");
    return null;
  }
  const length = song.duration ?? 0;
  const withLyrics = hits.filter((h) => h.syncedLyrics || h.plainLyrics || h.instrumental);
  const best = chooseHit(withLyrics, length);
  if (!best) {
    log.debug(
      "lrclib",
      length
        ? `search: ${hits.length} results, ${withLyrics.length} with lyrics, none within ±${DURATION_TOLERANCE_S}s of ${Math.round(length)}s`
        : `search: ${hits.length} results, none synced (no local duration to verify plain ones)`,
    );
    return null;
  }
  log.debug(
    "lrclib",
    `search match #${best.id} (${kindOf(best)}, ${best.duration ?? "?"}s, album "${best.albumName ?? ""}") out of ${hits.length} results`,
  );
  return toStructured(best);
}
