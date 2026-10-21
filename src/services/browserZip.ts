// Building a ZIP of tracks in the browser, for transcoded album or playlist
// downloads when there's no NaviPlayer server to do it (static hosting).
//
// Tracks are fetched one after another and streamed into the archive without
// compression (audio is already compressed). Where the browser can write
// straight to a file the user picks (Chromium's File System Access API), the
// archive never has to fit in memory; elsewhere it's collected and saved at
// the end, which is fine for an album.

import { Zip, ZipPassThrough } from "fflate";

export interface ZipEntrySource {
  name: string;
  url: string;
}

interface WritableFile {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}

type SaveFilePicker = (options: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<{ createWritable(): Promise<WritableFile> }>;

// A file to stream into, or null to collect in memory instead (no API, or the
// user closed the picker).
async function pickFile(name: string): Promise<WritableFile | null> {
  const picker = (window as Window & { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  if (typeof picker !== "function") return null;
  try {
    const handle = await picker.call(window, {
      suggestedName: name,
      types: [{ description: "ZIP archive", accept: { "application/zip": [".zip"] } }],
    });
    return await handle.createWritable();
  } catch {
    return null;
  }
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  // Give the download time to start before the URL goes.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// Fetch each entry into one archive called `zipName`. Unreachable tracks are
// skipped rather than failing the whole download.
export async function zipInBrowser(
  zipName: string,
  entries: ZipEntrySource[],
  opts: { onProgress?: (done: number, total: number) => void; signal?: AbortSignal } = {},
): Promise<void> {
  const file = await pickFile(zipName);
  const collected: Uint8Array[] = [];
  let writes = Promise.resolve();

  let done!: () => void;
  let failed!: (err: Error) => void;
  const written = new Promise<void>((resolve, reject) => {
    done = resolve;
    failed = reject;
  });
  const zip = new Zip((err, chunk, last) => {
    if (err) return failed(err);
    if (file) writes = writes.then(() => file.write(chunk));
    else collected.push(chunk);
    if (last) done();
  });

  try {
    for (const [i, entry] of entries.entries()) {
      opts.signal?.throwIfAborted();
      const res = await fetch(entry.url, { signal: opts.signal });
      if (res.ok && res.body) {
        const item = new ZipPassThrough(entry.name);
        zip.add(item);
        const reader = res.body.getReader();
        for (let part = await reader.read(); !part.done; part = await reader.read()) {
          item.push(part.value);
        }
        item.push(new Uint8Array(0), true);
      }
      opts.onProgress?.(i + 1, entries.length);
    }
    zip.end();
    await written;
    await writes;
  } catch (err) {
    zip.terminate();
    await file?.abort().catch(() => {});
    throw err;
  }

  if (file) await file.close();
  else saveBlob(new Blob(collected as BlobPart[], { type: "application/zip" }), zipName);
}
