// Whose playlist is whose. Navidrome lists your own playlists along with
// everyone else's public ones, and only an owner can change a playlist.

import type { Playlist } from "@/api/types";

// Yours, or with no owner to say otherwise (or no one signed in to compare).
export function ownsPlaylist(playlist: Pick<Playlist, "owner">, username?: string): boolean {
  return !username || !playlist.owner || playlist.owner === username;
}

// Your playlists, and the public ones other people have made.
export function splitPlaylists(
  playlists: Playlist[],
  username?: string,
): { mine: Playlist[]; others: Playlist[] } {
  const mine: Playlist[] = [];
  const others: Playlist[] = [];
  for (const pl of playlists) {
    if (ownsPlaylist(pl, username)) mine.push(pl);
    else if (pl.public) others.push(pl);
  }
  return { mine, others };
}
