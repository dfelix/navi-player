// The cache for everything read from Navidrome (TanStack Query), and the keys
// it's filed under. Changes the app makes (favourites, playlist edits)
// invalidate the affected keys, so the next read fetches the server's version.

import { QueryClient } from "@tanstack/vue-query";
import { useSettingsStore } from "@/stores/settings";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Looked up on every use, so changing "Library cache lifetime" applies at once.
      staleTime: () => useSettingsStore().power.polling.libraryStaleMs,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const key =
  <A extends unknown[]>(name: string) =>
  (...args: A) =>
    [name, ...args] as const;

export const qk = {
  artists: key<[]>("artists"),
  artist: key<[id: string]>("artist"),
  artistInfo: key<[id: string]>("artistInfo"),
  album: key<[id: string]>("album"),
  albumList: key<[type: string, opts?: unknown]>("albumList"),
  genres: key<[]>("genres"),
  songsByGenre: key<[genre: string]>("songsByGenre"),
  starred: key<[]>("starred"),
  playlists: key<[]>("playlists"),
  playlist: key<[id: string]>("playlist"),
  search: key<[query: string]>("search"),
  lyrics: key<[songId: string]>("lyrics"),
  randomSongs: key<[]>("randomSongs"),
  libraryStats: key<[]>("libraryStats"),
  userStats: key<[]>("userStats"),
};

// A favourite changed: everything that shows hearts may be out of date.
const SHOWS_FAVOURITES = ["starred", "album", "artist", "playlist", "albumList", "search"];

export function invalidateStarSensitive(): void {
  for (const name of SHOWS_FAVOURITES) void queryClient.invalidateQueries({ queryKey: [name] });
}
