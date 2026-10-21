// Lyrics for the current track, shared by the side panel and the full-screen
// player: the query (one cache entry per track), the best version to show, and
// which synced line is active at the current playback position.

import { useQuery } from "@tanstack/vue-query";
import { computed, toValue, watchEffect, type MaybeRefOrGetter } from "vue";
import { fetchLyrics, lyricsKey, lyricsStaleTime, prefetchLyrics } from "@/services/lyrics";
import { usePlayerStore } from "@/stores/player";
import { useSessionStore } from "@/stores/session";

export function useLyrics(enabled: MaybeRefOrGetter<boolean>) {
  const player = usePlayerStore();
  const session = useSessionStore();
  const song = computed(() => player.current);

  const query = useQuery(() => ({
    queryKey: lyricsKey(song.value?.id ?? ""),
    queryFn: () => fetchLyrics(song.value!),
    enabled: !!session.client && !!song.value && toValue(enabled),
    staleTime: lyricsStaleTime,
  }));

  // While lyrics are on screen, fetch the next track's before it starts, so
  // the view doesn't drop back to a spinner between songs.
  watchEffect(() => {
    if (!song.value || !toValue(enabled)) return;
    prefetchLyrics(player.state.queue[player.state.index + 1]);
  });

  // Prefer a synced version when the server has several.
  const best = computed(() => {
    const list = query.data.value?.list ?? [];
    return list.find((l) => l.synced) ?? list[0];
  });

  // Index of the active synced line for the current playback time.
  const activeLine = computed(() => {
    const l = best.value;
    if (!l?.synced) return -1;
    const ms = player.state.currentTime * 1000;
    let idx = -1;
    for (let i = 0; i < l.line.length; i++) {
      if ((l.line[i]?.start ?? 0) <= ms) idx = i;
      else break;
    }
    return idx;
  });

  const source = computed(() => query.data.value?.source ?? null);

  return { song, isLoading: query.isLoading, best, activeLine, source };
}
