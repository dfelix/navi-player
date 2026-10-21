// File names for downloads: safe on every file system and inside a ZIP, and
// sorted the way the album or playlist plays.

import type { Song } from "@/api/types";

// Characters Windows, macOS or ZIP tools refuse in names.
const RESERVED = /[\\/:*?"<>|]/g;

export function sanitizeName(name: string): string {
  const clean = (name ?? "").replace(RESERVED, "_").replace(/\s+/g, " ").trim();
  return clean || "untitled";
}

const twoDigits = (n: number) => (n < 10 ? `0${n}` : String(n));

// One song on its own: "07 Title.flac" when it has a track number, otherwise
// "Artist - Title.flac".
export function songFileName(song: Song, ext?: string): string {
  const extension = ext || song.suffix || "mp3";
  let stem = song.title;
  if (song.track) stem = `${twoDigits(song.track)} ${song.title}`;
  else if (song.artist) stem = `${song.artist} - ${song.title}`;
  return `${sanitizeName(stem)}.${extension}`;
}

// Names for every song in a collection ZIP. Albums number by track (with the
// disc in front from disc 2 on: "2-03 Title"); playlists by position. Two
// songs that would get the same name are told apart with " (2)", " (3)"…
export function collectionEntryNames(
  songs: Song[],
  ext: string | undefined,
  byTrackNumber: boolean,
): string[] {
  const used = new Map<string, number>();
  return songs.map((song, position) => {
    const extension = ext || song.suffix || "mp3";
    const number = byTrackNumber && song.track ? song.track : position + 1;
    const disc = byTrackNumber && (song.discNumber ?? 1) > 1 ? `${song.discNumber}-` : "";
    const stem = sanitizeName(`${disc}${twoDigits(number)} ${song.title}`);
    const key = `${stem}.${extension}`.toLowerCase();
    const n = (used.get(key) ?? 0) + 1;
    used.set(key, n);
    return n === 1 ? `${stem}.${extension}` : `${stem} (${n}).${extension}`;
  });
}
