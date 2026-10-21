// Infinite radio's candidates for a seed track, before ranking.
//
// Several sources are asked at once and pooled: Navidrome's similar-songs mix,
// songs from the seed's genres, the seed artist's top tracks, and the top
// tracks of a few similar artists. The last two come from Last.fm in Navidrome
// and are empty without it, which is why none of them is the only source. A
// source that fails or finds nothing just adds nothing. lib/recommendations
// then ranks the pool down to a batch.

import type { NavidromeClient } from "@/api/client";
import type { Song } from "@/api/types";
import { log } from "./log";
import { rankRadioCandidates } from "./recommendations";

// How many to ask each source for. Generous: ranking throws most away, and a
// wide pool is what makes a batch hang together.
const ASK = { serverMix: 40, perGenre: 60, artistTop: 20, perSimilarArtist: 10 };
// A track tagged with many genres is usually over-tagged; the first two count.
const GENRES_USED = 2;
const SIMILAR_ARTISTS_USED = 3;

type Source = { name: string; songs: Promise<Song[]> };

function seedGenres(seed: Song): string[] {
  return (seed.genre ?? "")
    .split(/[;,/|]/)
    .map((g) => g.trim())
    .filter(Boolean)
    .slice(0, GENRES_USED);
}

async function similarArtistsTop(client: NavidromeClient, seed: Song): Promise<Song[]> {
  if (!seed.artistId) return [];
  const info = await client.getArtistInfo(seed.artistId);
  const artists = (info.similarArtist ?? []).slice(0, SIMILAR_ARTISTS_USED);
  const lists = await Promise.all(
    artists.map((a) => client.getTopSongs(a.name, ASK.perSimilarArtist).catch(() => [])),
  );
  return lists.flat();
}

function sourcesFor(client: NavidromeClient, seed: Song): Source[] {
  return [
    { name: "serverMix", songs: client.getSimilarSongs(seed.id, ASK.serverMix) },
    ...seedGenres(seed).map((g) => ({
      name: `genre:${g}`,
      songs: client.getSongsByGenre(g, ASK.perGenre),
    })),
    {
      name: "artist",
      songs: seed.artist ? client.getTopSongs(seed.artist, ASK.artistTop) : Promise.resolve([]),
    },
    { name: "similarArtists", songs: similarArtistsTop(client, seed) },
  ];
}

// Every source's songs, pooled, with how many each contributed.
export async function gatherRadioCandidates(
  client: NavidromeClient,
  seed: Song,
): Promise<{ candidates: Song[]; sources: Record<string, number> }> {
  const sources = sourcesFor(client, seed);
  const results = await Promise.all(
    sources.map(({ name, songs }) =>
      songs.catch((err: unknown) => {
        log.debug("radio", `${name} failed`, err);
        return [] as Song[];
      }),
    ),
  );
  const counts: Record<string, number> = {};
  sources.forEach(({ name }, i) => {
    const key = name.startsWith("genre:") ? "genre" : name;
    counts[key] = (counts[key] ?? 0) + results[i]!.length;
  });
  return { candidates: results.flat(), sources: counts };
}

// The next `count` tracks to follow `seed`, avoiding `exclude` where possible.
export async function buildRadioBatch(
  client: NavidromeClient,
  seed: Song,
  count: number,
  exclude: ReadonlySet<string>,
): Promise<Song[]> {
  const { candidates, sources } = await gatherRadioCandidates(client, seed);
  const batch =
    candidates.length > 0 ? rankRadioCandidates(seed, candidates, count, { exclude }) : [];
  log.debug("radio", `${candidates.length} candidates → ${batch.length} picked`, sources);
  return batch;
}
