// Figures for the Stats page that no single API call provides.
//
// Subsonic has no totals and no per-user play counts. Navidrome's own API has
// both, per album and per track, but only for a password sign-in (it needs the
// JWT). So these are computed by walking Navidrome's lists, and everything
// that can't be known is left undefined rather than guessed: the page shows
// only what it gets, and says why something is missing.

import { t } from "@/i18n";
import type { Album, ArtistSummary, Genre, Song } from "./types";
import type { Transport } from "./transport";

export interface LibraryStats {
  artistCount: number;
  albumCount: number;
  songCount: number;
  // Bytes on disk; undefined when it couldn't be determined.
  totalSize?: number;
}

// The current user's listening. Every field is optional.
export interface UserStats {
  tracksPlayed?: number; // distinct tracks played at least once
  totalPlays?: number; // every play, repeats included
  listeningSeconds?: number; // plays × track length
  albumsPlayed?: number;
  artistsPlayed?: number;
  favoriteSongs?: number;
  favoriteAlbums?: number;
  favoriteArtists?: number;
  lastPlayed?: string; // ISO date of the most recent play
  topSongs?: Song[];
  topAlbums?: Album[];
  topArtists?: ArtistSummary[];
  // The play walk below is capped; true when the cap, not the data, ended it,
  // so the totals are a lower bound.
  approximate?: boolean;
  // Why play counts are missing altogether, in the user's language.
  unavailableReason?: string;
}

// What these calculations need from the client, so they can be tested alone.
export interface StatsSource {
  transport: Transport;
  getArtists(): Promise<ArtistSummary[]>;
  getGenres(): Promise<Genre[]>;
  getStarred(): Promise<{ artist: ArtistSummary[]; album: Album[]; song: Song[] }>;
  getAlbumList(type: "frequent", opts: { size: number }): Promise<Album[]>;
  getSong(id: string): Promise<Song>;
}

const PAGE = 500;
// 20 pages of played tracks (10,000) is plenty for a personal library and
// keeps one page view from turning into hundreds of requests.
const MAX_PLAY_PAGES = 20;
const LEADERBOARD = 8;

// Every page of a native list, in order, until a short page or `stop` says so.
async function* pages<T>(
  transport: Transport,
  resource: string,
  query: Record<string, string>,
  maxPages = Infinity,
): AsyncGenerator<T[], boolean> {
  for (let n = 0; n < maxPages; n++) {
    const rows = await transport.nativeList<T>(resource, {
      ...query,
      _start: n * PAGE,
      _end: (n + 1) * PAGE,
    });
    if (rows.length > 0) yield rows;
    if (rows.length < PAGE) return true; // reached the end
  }
  return false; // stopped by the cap
}

export async function libraryStats(src: StatsSource): Promise<LibraryStats> {
  const artists = await src.getArtists();
  const artistCount = artists.length;

  if (src.transport.hasJwt) {
    try {
      // Album records carry their own song count and size, and there are far
      // fewer of them than tracks.
      let albumCount = 0;
      let songCount = 0;
      let totalSize = 0;
      for await (const rows of pages<{ songCount?: number; size?: number }>(
        src.transport,
        "album",
        { _sort: "name" },
      )) {
        albumCount += rows.length;
        for (const album of rows) {
          songCount += album.songCount ?? 0;
          totalSize += album.size ?? 0;
        }
      }
      return { artistCount, albumCount, songCount, totalSize };
    } catch {
      // Fall back to what Subsonic can tell us.
    }
  }

  // Subsonic only: artists know their album counts and genres their song
  // counts. No way to learn the size.
  const genres = await src.getGenres();
  return {
    artistCount,
    albumCount: artists.reduce((n, a) => n + (a.albumCount ?? 0), 0),
    songCount: genres.reduce((n, g) => n + (g.songCount ?? 0), 0),
  };
}

interface PlayedRow {
  id: string;
  artist?: string;
  artistId?: string;
  albumId?: string;
  duration?: number;
  playCount?: number;
  playDate?: string;
}

export async function userStats(src: StatsSource): Promise<UserStats> {
  // These work for any sign-in.
  const [starred, frequent] = await Promise.allSettled([
    src.getStarred(),
    src.getAlbumList("frequent", { size: LEADERBOARD }),
  ]);
  const favourites = starred.status === "fulfilled" ? starred.value : null;
  const base: UserStats = {
    favoriteSongs: favourites?.song.length,
    favoriteAlbums: favourites?.album.length,
    favoriteArtists: favourites?.artist.length,
    topAlbums: frequent.status === "fulfilled" ? frequent.value : undefined,
  };

  if (!src.transport.hasJwt) return { ...base, unavailableReason: t("stats.needsNative") };
  try {
    return { ...base, ...(await playStats(src)) };
  } catch {
    return { ...base, unavailableReason: t("stats.nativeDown") };
  }
}

// Walk tracks from most played down, stopping at the first never-played one:
// in that order only tracks that count are read.
async function playStats(src: StatsSource): Promise<UserStats> {
  let tracksPlayed = 0;
  let totalPlays = 0;
  let listeningSeconds = 0;
  const albums = new Set<string>();
  const artists = new Map<string, { name: string; plays: number }>();
  const topIds: string[] = [];

  const walk = pages<PlayedRow>(
    src.transport,
    "song",
    { _sort: "playCount", _order: "DESC" },
    MAX_PLAY_PAGES,
  );
  let finished = false;
  for (;;) {
    const step = await walk.next();
    if (step.done) {
      finished = step.value;
      break;
    }
    const played = step.value.filter((row) => (row.playCount ?? 0) > 0);
    for (const row of played) {
      const plays = row.playCount!;
      if (topIds.length < LEADERBOARD) topIds.push(row.id);
      tracksPlayed++;
      totalPlays += plays;
      listeningSeconds += plays * (row.duration ?? 0);
      if (row.albumId) albums.add(row.albumId);
      if (row.artistId) {
        const entry = artists.get(row.artistId) ?? { name: "", plays: 0 };
        entry.plays += plays;
        entry.name ||= row.artist ?? "";
        artists.set(row.artistId, entry);
      }
    }
    // Sorted by plays, so a never-played row means the rest are too.
    if (played.length < step.value.length) {
      finished = true;
      await walk.return(true);
      break;
    }
  }

  // The latest play is a separate question: the walk is ordered by count.
  const lastPlayed = await src.transport
    .nativeList<PlayedRow>("song", { _start: 0, _end: 1, _sort: "playDate", _order: "DESC" })
    .then((rows) => rows[0]?.playDate)
    .catch(() => undefined);

  // Native rows have no cover art, so read the leaders back as full songs.
  const topSongs = (
    await Promise.all(topIds.map((id) => src.getSong(id).catch(() => null)))
  ).filter((s): s is Song => s !== null);

  const topArtists: ArtistSummary[] = [...artists]
    .sort(([, a], [, b]) => b.plays - a.plays)
    .slice(0, LEADERBOARD)
    .map(([id, { name, plays }]) => ({
      id,
      name: name || t("common.unknownArtist"),
      playCount: plays,
    }));

  return {
    tracksPlayed,
    totalPlays,
    listeningSeconds,
    albumsPlayed: albums.size,
    artistsPlayed: artists.size,
    lastPlayed,
    topSongs,
    topArtists,
    approximate: !finished,
  };
}
