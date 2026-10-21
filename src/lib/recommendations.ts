// Choosing suggested tracks: Infinite radio's batches, Surprise Me, and the
// "Forgotten Gems" setting that every suggestion respects.
//
// Navidrome's own similar-songs list is good with Last.fm and thin without it,
// so radio doesn't rely on it alone: candidates come from several sources
// (lib/radio) and are ranked here against what any library has — genre,
// artist, album, year — plus the listener's favourites.

import type { Song } from "@/api/types";
import { shuffleSpreadingArtists } from "@/lib/shuffle";
import { useSettingsStore } from "@/stores/settings";

// ---- Forgotten Gems ----

// With the setting on, suggestions skip tracks you've played more than this
// many times, so less-heard music comes up. Never-played tracks always stay.
const GEM_MAX_PLAYS = 2;

export function applyDiscoveryFilters(songs: Song[]): Song[] {
  if (!useSettingsStore().playback.forgottenGems) return songs;
  return songs.filter((song) => (song.playCount ?? 0) <= GEM_MAX_PLAYS);
}

// The same, except it never empties a non-empty list: a suggestion you've
// heard is better than playback stopping.
function gemsOrAll(songs: Song[]): Song[] {
  const gems = applyDiscoveryFilters(songs);
  return gems.length > 0 ? gems : songs;
}

// ---- Surprise Me ----

// The random seed track, then the tracks similar to it. Navidrome lists those
// grouped by artist, so they're shuffled apart: no artist twice in a row,
// starting with someone other than the seed's artist.
export function buildSurpriseQueue(
  seed: Song,
  similar: Song[],
  random: () => number = Math.random,
): Song[] {
  const rest = gemsOrAll(similar.filter((song) => song.id !== seed.id));
  return [seed, ...shuffleSpreadingArtists(rest, seed.artist, random)];
}

// ---- Ranking radio candidates ----

export interface ScoreOptions {
  // Kept as a last resort: already queued, or heard recently.
  exclude?: ReadonlySet<string>;
  // How many tracks one artist may have in a batch before others are
  // preferred, so a batch doesn't turn into one artist's radio.
  maxPerArtist?: number;
  // Random variety between runs; tests pass a constant.
  jitter?: () => number;
}

// How much each signal is worth. Genre leads: it's what most self-hosted
// libraries tag reliably, and what made server-only radio feel random.
const WEIGHT = {
  genre: 6, // × share of genres in common
  sameArtist: 2, // some is welcome; the per-artist cap does the limiting
  sameAlbum: -3, // straight back into the record playing is never the point
  closeYear: 2, // within 3 years
  nearYear: 1, // within 8
  farYear: -1, // more than 25 apart
  favourite: 1.5,
  excluded: -10,
  jitter: 0.75,
};

function genresOf(song: Song): Set<string> {
  return new Set(
    (song.genre ?? "")
      .toLowerCase()
      .split(/[;,/|]/)
      .map((g) => g.trim())
      .filter(Boolean),
  );
}

// Shared genres, relative to the shorter list: "Rock" and "Rock; Indie" share
// everything the first has.
function genreOverlap(a: Song, b: Song): number {
  const x = genresOf(a);
  const y = genresOf(b);
  if (x.size === 0 || y.size === 0) return 0;
  const shared = [...x].filter((g) => y.has(g)).length;
  return shared / Math.min(x.size, y.size);
}

function eraScore(seed: Song, candidate: Song): number {
  if (!seed.year || !candidate.year) return 0;
  const gap = Math.abs(seed.year - candidate.year);
  if (gap <= 3) return WEIGHT.closeYear;
  if (gap <= 8) return WEIGHT.nearYear;
  return gap > 25 ? WEIGHT.farYear : 0;
}

// How well a candidate follows the seed; higher is better, -Infinity never.
export function scoreCandidate(seed: Song, candidate: Song, opts: ScoreOptions = {}): number {
  if (candidate.id === seed.id) return -Infinity;
  const random = opts.jitter ?? Math.random;
  let score = WEIGHT.genre * genreOverlap(seed, candidate) + eraScore(seed, candidate);
  if (seed.artist && candidate.artist === seed.artist) score += WEIGHT.sameArtist;
  if (seed.albumId && candidate.albumId === seed.albumId) score += WEIGHT.sameAlbum;
  if (candidate.starred) score += WEIGHT.favourite;
  if (opts.exclude?.has(candidate.id)) score += WEIGHT.excluded;
  return score + random() * WEIGHT.jitter;
}

// The best `count` candidates, spread across artists.
//
// The cap is relaxed one step at a time: first at most `maxPerArtist` each,
// then one more each, and so on. Filling the rest from the top of the list
// after one capped pass would hand a pool dominated by one artist straight
// back to that artist, which is exactly when the cap matters.
export function rankRadioCandidates(
  seed: Song,
  candidates: Song[],
  count: number,
  opts: ScoreOptions = {},
): Song[] {
  const seen = new Set<string>();
  const ranked = candidates
    .filter((song) => !seen.has(song.id) && (seen.add(song.id), true))
    .map((song) => ({ song, score: scoreCandidate(seed, song, opts) }))
    .filter(({ score }) => score > -Infinity)
    .sort((a, b) => b.score - a.score)
    .map(({ song }) => song);

  const picked: Song[] = [];
  const taken = new Set<string>();
  const perArtist = new Map<string, number>();
  for (let cap = opts.maxPerArtist ?? 2; picked.length < count; cap++) {
    const before = picked.length;
    for (const song of ranked) {
      if (picked.length >= count) break;
      const artist = (song.artist ?? "").toLowerCase();
      const used = perArtist.get(artist) ?? 0;
      if (taken.has(song.id) || (artist && used >= cap)) continue;
      taken.add(song.id);
      perArtist.set(artist, used + 1);
      picked.push(song);
    }
    if (picked.length === before) break; // nothing left to place
  }
  return gemsOrAll(picked);
}

// The track Infinite radio's next batch should be like.
//
// Always one the user chose: seeding from the radio's own suggestions makes
// each batch a recommendation of a recommendation, and the queue wanders off.
// So walk back from what's playing to the last track that wasn't auto-added.
export function pickRadioSeed(queue: Song[], index: number): Song | undefined {
  for (let i = Math.min(index, queue.length - 1); i >= 0; i--) {
    if (!queue[i]!.autoQueued) return queue[i];
  }
  // A long session whose original track was removed: use what's playing.
  return queue[index];
}
