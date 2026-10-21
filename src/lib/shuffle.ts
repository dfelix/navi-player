// Shuffling.
//
// A uniform shuffle often plays the same artist two or three times in a row,
// which people hear as "not random". The artist-spreading shuffle builds the
// list one song at a time: each next song comes from a random artist other
// than the one just played, weighted by how many of their tracks are left, so
// big groups are spread through the whole list. When one artist has so many
// tracks left that they can't all be kept apart, they go next, which keeps
// unavoidable repeats to the minimum.

import type { Song } from "@/api/types";

export function shuffled<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const artistKey = (song: Song) => (song.artist ?? "").trim().toLowerCase();

// `afterArtist`: the artist playing just before this list starts (the chosen
// track when shuffling a queue), so the list doesn't open with them again.
export function shuffleSpreadingArtists(
  songs: Song[],
  afterArtist?: string,
  random: () => number = Math.random,
): Song[] {
  const left = new Map<string, Song[]>();
  for (const song of shuffled(songs, random)) {
    const key = artistKey(song);
    left.set(key, [...(left.get(key) ?? []), song]);
  }

  const out: Song[] = [];
  let previous = afterArtist?.trim().toLowerCase() ?? null;
  let remaining = songs.length;
  while (remaining > 0) {
    const others = [...left].filter(([key, list]) => key !== previous && list.length > 0);
    const [key, list] = others.length === 0 ? [previous!, left.get(previous!)!] : choose(others);
    out.push(list.pop()!);
    previous = key;
    remaining--;
  }
  return out;

  // An artist that needs every other slot from here on goes now; otherwise a
  // random artist, weighted by tracks left.
  function choose(options: [string, Song[]][]): [string, Song[]] {
    const urgent = options.find(([, list]) => list.length * 2 > remaining);
    if (urgent) return urgent;
    let ticket = random() * options.reduce((n, [, list]) => n + list.length, 0);
    for (const option of options) {
      ticket -= option[1].length;
      if (ticket < 0) return option;
    }
    return options.at(-1)!;
  }
}
