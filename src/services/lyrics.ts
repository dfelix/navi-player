// Lyrics for a track, for both the lyrics panel and the full-screen player:
// they share one cached answer, so whichever opens second shows it at once.
//
// The music server is asked first. LRCLIB only when the server has nothing and
// the listener turned online lyrics on (see services/lrclib for what's sent).

import type { Song, StructuredLyrics } from "@/api/types";
import { log } from "@/lib/log";
import { queryClient, qk } from "@/lib/query";
import { LrclibUnavailableError, fetchLyricsFromLrclib } from "@/services/lrclib";
import { useSessionStore } from "@/stores/session";
import { useSettingsStore } from "@/stores/settings";

// `source` says where the words came from, so LRCLIB can be credited.
export interface LyricsResult {
  source: "server" | "lrclib" | null;
  list: StructuredLyrics[];
  // The online lookup couldn't be made (e.g. LRCLIB rate limiting), so "none"
  // is provisional and worth asking again soon.
  provisional?: boolean;
}

const NOTHING: LyricsResult = { source: null, list: [] };

// Lyrics don't change: an answer is good for an hour, which also spares LRCLIB,
// a free service, repeat questions.
export const LYRICS_STALE_MS = 60 * 60_000;
const PROVISIONAL_STALE_MS = 60_000;

export function lyricsStaleTime(query: { state: { data?: LyricsResult } }): number {
  return query.state.data?.provisional ? PROVISIONAL_STALE_MS : LYRICS_STALE_MS;
}

// Whether online lyrics are on is part of the key: switching it on must ask
// again, not reuse the "nothing" cached while it was off.
export function lyricsKey(songId: string) {
  return [...qk.lyrics(songId), useSettingsStore().playback.onlineLyrics] as const;
}

export async function fetchLyrics(song: Song): Promise<LyricsResult> {
  const c = useSessionStore().client;
  if (!c) return NOTHING;

  // With the artist and title given, the server is asked once instead of twice.
  const server = await c
    .getLyrics(song.id, { artist: song.artist, title: song.title })
    .catch((err: unknown) => {
      log.warn("lyrics", `server lyrics lookup failed for ${song.id}`, err);
      return [];
    });
  const found = server.filter((lyrics) => lyrics.line.length > 0);
  if (found.length > 0) return { source: "server", list: found };

  if (!useSettingsStore().playback.onlineLyrics) {
    log.debug("lyrics", `server has none for ${song.id}; online lyrics are off`);
    return NOTHING;
  }
  log.debug("lyrics", `server has none for ${song.id}; asking LRCLIB`);
  try {
    const fromLrclib = await fetchLyricsFromLrclib(song);
    return fromLrclib ? { source: "lrclib", list: [fromLrclib] } : NOTHING;
  } catch (err) {
    if (err instanceof LrclibUnavailableError) return { ...NOTHING, provisional: true };
    throw err;
  }
}

// Look up the next track's lyrics ahead of time while lyrics are on screen, so
// changing track doesn't show a spinner.
export function prefetchLyrics(song: Song | undefined): void {
  if (!song?.id || !useSessionStore().client) return;
  void queryClient.prefetchQuery({
    queryKey: lyricsKey(song.id),
    queryFn: () => fetchLyrics(song),
    staleTime: lyricsStaleTime,
  });
}
