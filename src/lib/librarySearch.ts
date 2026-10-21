// Library search that forgives typos.
//
// The server's search3 only finds substrings. So the query is sent in a few
// looser forms (lib/fuzzyMatch → searchVariants), the results are merged, and
// everything is ranked here by how well it actually matches what was typed.
// The full artist list, which the Artists page caches anyway, is searched
// locally too, so a misspelt artist is found even when the server finds nothing.

import type { NavidromeClient } from "@/api/client";
import type { Album, ArtistSummary, SearchResult, Song } from "@/api/types";
import { matchScore, searchVariants } from "./fuzzyMatch";

const LIMITS = { artist: 20, album: 20, song: 50 };
// Results scoring below this are noise from the looser query forms.
const KEEP_ABOVE = 0.5;

const EMPTY: SearchResult = { artist: [], album: [], song: [] };

// The best of several weighted fields: a title match outranks an artist match.
function best(query: string, fields: [string | undefined, number][]): number {
  let top = 0;
  for (const [text, weight] of fields) {
    if (text) top = Math.max(top, matchScore(query, text) * weight);
  }
  return top;
}

const scoreSong = (q: string, s: Song) =>
  best(q, [
    [s.title, 1],
    [`${s.artist ?? ""} ${s.title}`, 0.92],
    [s.artist, 0.85],
    [s.album, 0.75],
  ]);

const scoreAlbum = (q: string, a: Album) =>
  best(q, [
    [a.name, 1],
    [`${a.artist ?? ""} ${a.name}`, 0.92],
    [a.artist, 0.8],
  ]);

const scoreArtist = (q: string, a: ArtistSummary) => best(q, [[a.name, 1]]);

function ranked<T extends { id: string }>(
  lists: T[][],
  score: (item: T) => number,
  limit: number,
): T[] {
  const unique = new Map<string, T>();
  for (const item of lists.flat()) if (!unique.has(item.id)) unique.set(item.id, item);
  return [...unique.values()]
    .map((item) => ({ item, score: score(item) }))
    .filter((x) => x.score >= KEEP_ABOVE)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.item);
}

export async function searchLibrary(
  client: NavidromeClient,
  query: string,
  allArtists: ArtistSummary[] = [],
): Promise<SearchResult> {
  const responses = await Promise.all(
    searchVariants(query).map((v) => client.search(v).catch(() => EMPTY)),
  );
  return {
    artist: ranked(
      [...responses.map((r) => r.artist), allArtists],
      (a) => scoreArtist(query, a),
      LIMITS.artist,
    ),
    album: ranked(
      responses.map((r) => r.album),
      (a) => scoreAlbum(query, a),
      LIMITS.album,
    ),
    song: ranked(
      responses.map((r) => r.song),
      (s) => scoreSong(query, s),
      LIMITS.song,
    ),
  };
}
