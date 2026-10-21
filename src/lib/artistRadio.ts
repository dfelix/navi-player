// Artist radio: an endless station built around one artist, the way Spotify's
// "<Artist> Radio" works — the artist's best-known songs, interleaved with
// songs by the artists people listen to alongside them.
//
// Unlike Infinite radio (lib/radio), which follows the track you chose, every
// batch here goes back to the same artist, so a long session never drifts off
// into something unrelated.
//
// Sources, all best-effort and fetched in parallel; whichever return nothing
// simply contribute nothing:
// - the artist's top tracks (Navidrome fills these from Last.fm), topped up
//   with the artist's own albums when that list is short;
// - Navidrome's similar artists (also Last.fm), and their top tracks;
// - Navidrome's similar-songs mix seeded from the artist;
// - when the similar-artist sources are thin, songs from the artist's genres.

import type { NavidromeClient } from "@/api/client";
import type { Song } from "@/api/types";
import { log } from "./log";
import { applyDiscoveryFilters } from "./recommendations";

export interface ArtistStation {
  kind: "artist";
  id: string;
  name: string;
}

// About one in three tracks is the artist's own: enough that it is
// recognisably their station, not so many that it's their discography.
const OWN_EVERY = 3;

const TOP_SONGS = 30;
// Fewer than this from the top-songs list and the artist's albums are read too.
const MIN_OWN = 12;
const MAX_ALBUMS = 8;
const MAX_SIMILAR_ARTISTS = 8;
const PER_SIMILAR_ARTIST = 10;
const SERVER_MIX = 50;
// Fewer than this from the similar sources and genre is used to fill in.
const MIN_OTHERS = 20;
const PER_GENRE = 60;
const MAX_GENRES = 2;
// Within one batch, at most this many by any one other artist.
const MAX_PER_OTHER_ARTIST = 2;

export interface ArtistRadioPool {
  own: Song[];
  others: Song[];
  sources: Record<string, number>;
}

async function settled(promise: Promise<Song[]>, label: string): Promise<Song[]> {
  try {
    return await promise;
  } catch (err) {
    log.debug("radio", `${label} failed`, err);
    return [];
  }
}

const norm = (s: string | undefined) => (s ?? "").trim().toLowerCase();

function isBy(song: Song, station: ArtistStation): boolean {
  return song.artistId === station.id || norm(song.artist) === norm(station.name);
}

function genresOf(songs: Song[]): string[] {
  const counts = new Map<string, number>();
  for (const song of songs) {
    for (const g of (song.genre ?? "").split(/[;,/|]+/)) {
      const genre = g.trim();
      if (genre) counts.set(genre, (counts.get(genre) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_GENRES)
    .map(([genre]) => genre);
}

async function albumSongs(client: NavidromeClient, station: ArtistStation): Promise<Song[]> {
  const artist = await client.getArtist(station.id);
  const albums = (artist.albums ?? []).slice(0, MAX_ALBUMS);
  const full = await Promise.all(albums.map((a) => client.getAlbum(a.id).catch(() => null)));
  return full.flatMap((album) => album?.song ?? []);
}

// Everything the station can draw from, split into the artist's own songs
// (best first) and everyone else's (in the order the sources rank them).
export async function gatherArtistRadio(
  client: NavidromeClient,
  station: ArtistStation,
): Promise<ArtistRadioPool> {
  const [top, mix, similar] = await Promise.all([
    settled(client.getTopSongs(station.name, TOP_SONGS), "artist top"),
    settled(client.getSimilarSongs(station.id, SERVER_MIX), "server mix"),
    settled(
      client.getArtistInfo(station.id).then(async (info) => {
        const artists = (info?.similarArtist ?? []).slice(0, MAX_SIMILAR_ARTISTS);
        const lists = await Promise.all(
          artists.map((a) => settled(client.getTopSongs(a.name, PER_SIMILAR_ARTIST), "similar")),
        );
        // Round-robin, so the closest artists come first but each gets a turn.
        const out: Song[] = [];
        for (let i = 0; i < PER_SIMILAR_ARTIST; i++) {
          for (const list of lists) if (list[i]) out.push(list[i]!);
        }
        return out;
      }),
      "similar artists",
    ),
  ]);

  let own = top.filter((s) => isBy(s, station));
  let fromAlbums = 0;
  if (own.length < MIN_OWN) {
    // No top-songs list for this artist: rank their own tracks by what you
    // play and favourite instead.
    const extra = (await settled(albumSongs(client, station), "albums"))
      .filter((s) => isBy(s, station))
      .sort(
        (a, b) =>
          Number(!!b.starred) - Number(!!a.starred) || (b.playCount ?? 0) - (a.playCount ?? 0),
      );
    fromAlbums = extra.length;
    own = [...own, ...extra];
  }

  let others = [...similar, ...mix].filter((s) => !isBy(s, station));
  let fromGenre = 0;
  if (others.length < MIN_OTHERS) {
    const genres = genresOf(own);
    const lists = await Promise.all(
      genres.map((g) => settled(client.getSongsByGenre(g, PER_GENRE), `genre:${g}`)),
    );
    const genreSongs = lists.flat().filter((s) => !isBy(s, station));
    fromGenre = genreSongs.length;
    others = [...others, ...genreSongs];
  }

  return {
    own: dedupe(own),
    others: dedupe(others),
    sources: {
      top: top.length,
      albums: fromAlbums,
      similarArtists: similar.length,
      serverMix: mix.length,
      genre: fromGenre,
    },
  };
}

function dedupe(songs: Song[]): Song[] {
  const seen = new Set<string>();
  return songs.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
}

// Keep the sources' ranking roughly, but vary it from run to run: each song
// moves by up to a few places.
function jitter(songs: Song[], random: () => number): Song[] {
  return songs
    .map((song, i) => ({ song, key: i + random() * 6 }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.song);
}

// The artist's own songs in station order: the best-known first, but not the
// same first five every time — each run picks from a sliding window.
function orderOwn(own: Song[], random: () => number): Song[] {
  const pool = [...own];
  const out: Song[] = [];
  while (pool.length > 0) {
    const window = Math.min(pool.length, 4);
    const [pick] = pool.splice(Math.floor(random() * window), 1);
    out.push(pick!);
  }
  return out;
}

// Pick the next "other" song: not by the artist just played, and within the
// per-artist cap for this batch when possible. Returns null when the only
// songs left are by the artist just played, so the caller can play something
// else first.
function takeOther(pool: Song[], previousArtist: string, used: Map<string, number>): Song | null {
  let overCap = -1;
  for (let i = 0; i < pool.length; i++) {
    const key = norm(pool[i]!.artist);
    if (key === previousArtist) continue;
    if ((used.get(key) ?? 0) < MAX_PER_OTHER_ARTIST) return takeAt(pool, i, used);
    if (overCap === -1) overCap = i;
  }
  return overCap === -1 ? null : takeAt(pool, overCap, used);
}

function takeAt(pool: Song[], i: number, used: Map<string, number>): Song {
  const song = pool.splice(i, 1)[0]!;
  const key = norm(song.artist);
  used.set(key, (used.get(key) ?? 0) + 1);
  return song;
}

export interface MixOptions {
  // Already queued: never repeated.
  queued?: ReadonlySet<string>;
  // Heard recently: only used once everything else has run out.
  recent?: ReadonlySet<string>;
  // Whether this batch opens the station (it then starts with the artist).
  opening?: boolean;
  random?: () => number;
}

// Interleave the pool into a batch of `count`: every third track the artist's
// own, the rest spread across the similar artists, never the same artist twice
// in a row when there's any alternative. Pure, so it can be tested directly.
export function mixArtistRadio(
  pool: ArtistRadioPool,
  count: number,
  opts: MixOptions = {},
): Song[] {
  const random = opts.random ?? Math.random;
  const queued = opts.queued ?? new Set<string>();
  const recent = opts.recent ?? new Set<string>();

  // Never what's already queued; what you heard recently only as a last resort.
  const notQueued = (songs: Song[]) => songs.filter((s) => !queued.has(s.id));
  const unheard = (songs: Song[]) => songs.filter((s) => !recent.has(s.id));
  const heard = (songs: Song[]) => songs.filter((s) => recent.has(s.id));

  const ownPool = notQueued(pool.own);
  const own = [...orderOwn(unheard(ownPool), random), ...heard(ownPool)];

  // Forgotten Gems applies to the discovery part, never the artist's own hits.
  const othersPool = notQueued(pool.others);
  const filtered = applyDiscoveryFilters(othersPool);
  const others = [
    ...jitter(unheard(filtered.length > 0 ? filtered : othersPool), random),
    ...heard(othersPool),
  ];

  const out: Song[] = [];
  const used = new Map<string, number>();
  // An opening batch starts with the artist; a top-up continues the pattern.
  let slot = opts.opening === false ? 1 : 0;
  while (out.length < count && (own.length > 0 || others.length > 0)) {
    const previous = norm(out.at(-1)?.artist);
    const wantOwn = slot % OWN_EVERY === 0;
    // In order: the slot's kind; the other kind; and only then a repeat of the
    // artist just played, rather than ending the station early.
    const next =
      (wantOwn && previous !== norm(own[0]?.artist) ? own.shift() : undefined) ??
      takeOther(others, previous, used) ??
      (previous !== norm(own[0]?.artist) ? own.shift() : undefined) ??
      own.shift() ??
      (others.length > 0 ? takeAt(others, 0, used) : undefined);
    if (!next) break;
    out.push(next);
    slot++;
  }
  return out;
}

// Gather and mix one batch.
export async function buildArtistRadioBatch(
  client: NavidromeClient,
  station: ArtistStation,
  count: number,
  opts: Omit<MixOptions, "random"> = {},
): Promise<Song[]> {
  const pool = await gatherArtistRadio(client, station);
  const batch = mixArtistRadio(pool, count, opts);
  log.debug(
    "radio",
    `${station.name} radio: ${pool.own.length} own + ${pool.others.length} others → ${batch.length}`,
    pool.sources,
  );
  return batch;
}
