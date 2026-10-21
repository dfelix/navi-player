// Downloading songs, albums and playlists, in original or converted quality.
//
// - Original quality comes straight from Navidrome: the file for a song, and
//   for an album or playlist a ZIP Navidrome builds itself.
// - Converted quality goes through Navidrome's transcoder. One song is fetched
//   and saved under a proper name. A whole collection is zipped by
//   NaviPlayer's server when there is one (POST /download/zip), or in the
//   browser otherwise (./browserZip).

import type { Song } from "@/api/types";
import { t } from "@/i18n";
import { collectionEntryNames, sanitizeName, songFileName } from "@/lib/downloadNames";
import { useSessionStore } from "@/stores/session";
import { saveBlob, zipInBrowser } from "./browserZip";

export { sanitizeName, songFileName } from "@/lib/downloadNames";

// Labels are in the locale files, under download.quality.<id>.
export interface Quality {
  id: "original" | "opus" | "mp3-320" | "mp3-128";
  format?: string; // the transcoder's format; undefined for the original file
  bitRate?: number; // kbps
  ext?: string; // file extension of the converted file
}

const converted = (id: Quality["id"], format: string, bitRate: number): Quality => ({
  id,
  format,
  bitRate,
  ext: format,
});

export const QUALITIES: Quality[] = [
  { id: "original" },
  converted("opus", "opus", 192),
  converted("mp3-320", "mp3", 320),
  converted("mp3-128", "mp3", 128),
];

export function isLossy(quality: Quality): boolean {
  return quality.format !== undefined;
}

// Open a URL whose response is a file attachment: the browser streams it to
// disk itself, without holding it in memory.
function openAttachment(url: string): void {
  const link = Object.assign(document.createElement("a"), { href: url, download: "" });
  document.body.append(link);
  link.click();
  link.remove();
}

function client() {
  return useSessionStore().client;
}

function trackUrl(song: Song, quality: Quality): string {
  const c = client()!;
  return isLossy(quality)
    ? c.streamUrl(song.id, quality.bitRate, quality.format)
    : c.downloadUrl(song.id);
}

export async function downloadSong(song: Song, quality: Quality): Promise<void> {
  const c = client();
  if (!c) return;
  if (!isLossy(quality)) {
    openAttachment(c.downloadUrl(song.id));
    return;
  }
  // Fetched rather than opened, so the file gets a sensible name and extension.
  const res = await fetch(trackUrl(song, quality));
  if (!res.ok) throw new Error(t("download.http", { status: res.status }));
  saveBlob(await res.blob(), songFileName(song, quality.ext));
}

// An album or playlist as Navidrome's ZIP of the original files.
export function downloadCollectionOriginal(id: string): void {
  const c = client();
  if (c) openAttachment(c.downloadUrl(id));
}

interface CollectionDownload {
  songs: Song[];
  quality: Quality;
  zipBaseName: string;
  // Albums are numbered by track, playlists by position.
  byTrackNumber: boolean;
}

// A converted album or playlist, zipped in the browser.
export async function downloadCollectionClientZip(
  opts: CollectionDownload & {
    onProgress?: (done: number, total: number) => void;
    signal?: AbortSignal;
  },
): Promise<void> {
  if (!client()) return;
  const names = collectionEntryNames(opts.songs, opts.quality.ext, opts.byTrackNumber);
  await zipInBrowser(
    `${sanitizeName(opts.zipBaseName)}.zip`,
    opts.songs.map((song, i) => ({ name: names[i]!, url: trackUrl(song, opts.quality) })),
    { onProgress: opts.onProgress, signal: opts.signal },
  );
}

// A converted album or playlist, zipped by NaviPlayer's server. The request is
// a form posted into a hidden frame, so the ZIP streams to disk as a normal
// download instead of passing through JavaScript.
export function downloadCollectionZip(opts: CollectionDownload): void {
  const c = client();
  if (!c || !isLossy(opts.quality)) return;
  const names = collectionEntryNames(opts.songs, opts.quality.ext, opts.byTrackNumber);
  const payload = JSON.stringify({
    zipName: `${sanitizeName(opts.zipBaseName)}.zip`,
    format: opts.quality.format,
    bitRate: opts.quality.bitRate,
    tracks: opts.songs.map((song, i) => ({ id: song.id, name: names[i] })),
    ...c.subsonicAuth,
  });

  const target = `download-${Date.now()}`;
  const frame = Object.assign(document.createElement("iframe"), { name: target, hidden: true });
  const form = Object.assign(document.createElement("form"), {
    method: "POST",
    action: "/download/zip",
    target,
  });
  form.append(
    Object.assign(document.createElement("input"), {
      type: "hidden",
      name: "payload",
      value: payload,
    }),
  );
  document.body.append(frame, form);
  form.submit();
  // Long enough for a big archive to finish arriving.
  setTimeout(() => {
    form.remove();
    frame.remove();
  }, 5 * 60_000);
}
