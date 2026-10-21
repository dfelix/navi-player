// The Recap page's top artists. Subsonic has no play count per artist, but its
// most-played albums carry one each, so an artist's plays are their albums'
// plays added up.

import type { Album } from "@/api/types";
import { t } from "@/i18n";

export interface TopArtist {
  id?: string;
  name: string;
  plays: number;
  coverArt?: string;
}

export function topArtistsFromAlbums(albums: Album[], limit = 8): TopArtist[] {
  const artists = new Map<string, TopArtist>();
  for (const album of albums) {
    const key = album.artistId || album.artist || album.id;
    const artist = artists.get(key) ?? {
      id: album.artistId,
      name: album.artist ?? t("common.unknownArtist"),
      plays: 0,
      coverArt: album.coverArt,
    };
    artist.plays += album.playCount ?? 0;
    artists.set(key, artist);
  }
  return [...artists.values()].sort((a, b) => b.plays - a.plays).slice(0, limit);
}
