// The browser side of adding music to the library (admins, and only when
// NaviPlayer's server has MUSIC_DIR set; see server/library.ts):
// - Upload: send audio files, folders or ZIPs; the server sorts each track
//   into an "Artist - Album" folder from its tags.
// - Organize: list audio files lying loose at the top of the music folder,
//   then move the chosen ones into album folders.

import { t } from "@/i18n";

export interface UploadFile {
  file: File;
  path: string; // where it sits in what was picked; tells duplicates apart
}

export interface UploadResult {
  written: string[];
  skipped?: string[]; // already in the library under that name: left alone
  scanStarted: boolean;
}

export interface CleanupFile {
  name: string;
  size: number;
  hasTags: boolean;
}

export interface CleanupGroup {
  folder: string;
  artist: string;
  album: string;
  hasTags: boolean;
  files: CleanupFile[];
}

export interface ApplyResult {
  moved: string[];
  errors: { file: string; error: string }[];
  scanStarted: boolean;
}

// The same list the server accepts.
const UPLOADABLE = new Set(
  "zip mp3 flac ogg opus m4a aac wav wv ape mpc wma aiff aif dsf dff".split(" "),
);

export function isAudioOrZip(name: string): boolean {
  return UPLOADABLE.has(name.split(".").pop()?.toLowerCase() ?? "");
}

// macOS "._name.flac" sidecars, .DS_Store, other hidden files and __MACOSX
// folders. They can have audio extensions, but no real track starts with a dot.
export function isJunkPath(path: string): boolean {
  return path.split(/[/\\]/).some((part) => part.startsWith(".") || part === "__MACOSX");
}

export function keepFile(name: string, path: string): boolean {
  return isAudioOrZip(name) && !isJunkPath(path);
}

const usable = (picked: UploadFile[]) =>
  picked.filter(({ file, path }) => keepFile(file.name, path));

// Files from a file or folder picker. A folder pick gives each file its path
// inside the folder.
export function collectFiles(files: FileList | File[]): UploadFile[] {
  return usable(
    Array.from(files, (file) => ({
      file,
      path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
    })),
  );
}

// Add newly picked files to the list, ignoring ones already in it.
export function mergeUploadFiles(current: UploadFile[], added: UploadFile[]): UploadFile[] {
  const have = new Set(current.map(({ path }) => path));
  return [...current, ...added.filter(({ path }) => !have.has(path))];
}

// ---- Drag and drop ----

const fileOf = (entry: FileSystemFileEntry) =>
  new Promise<File | null>((resolve) => entry.file(resolve, () => resolve(null)));

// A folder's entries, all of them: readEntries hands them over in batches.
async function childrenOf(folder: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = folder.createReader();
  const all: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve) =>
      reader.readEntries(resolve, () => resolve([])),
    );
    if (batch.length === 0) return all;
    all.push(...batch);
  }
}

async function filesIn(entry: FileSystemEntry, folder: string): Promise<UploadFile[]> {
  if (entry.isFile) {
    const file = await fileOf(entry as FileSystemFileEntry);
    return file ? [{ file, path: folder + file.name }] : [];
  }
  if (!entry.isDirectory) return [];
  const inside = `${folder}${entry.name}/`;
  const nested = await Promise.all(
    (await childrenOf(entry as FileSystemDirectoryEntry)).map((child) => filesIn(child, inside)),
  );
  return nested.flat();
}

// Dropped files and folders, flattened, with their paths kept.
export async function readDroppedEntries(entries: FileSystemEntry[]): Promise<UploadFile[]> {
  const lists = await Promise.all(entries.map((entry) => filesIn(entry, "")));
  return usable(lists.flat());
}

// ---- Requests ----

// The server's own message when it gives one.
function failure(status: number, body: string): Error {
  try {
    const message = (JSON.parse(body) as { error?: string }).error;
    if (message) return new Error(message);
  } catch {
    // Not JSON.
  }
  return new Error(t("errors.http", { status }));
}

// Send one file, reporting progress 0–100. XMLHttpRequest, because fetch can't
// report upload progress.
export function uploadOne(
  upload: UploadFile,
  authHeaders: Record<string, string>,
  onProgress: (percent: number) => void,
): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", upload.file);
  form.append("path", upload.path);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/upload");
    Object.entries(authHeaders).forEach(([name, value]) => xhr.setRequestHeader(name, value));
    xhr.upload.onprogress = ({ lengthComputable, loaded, total }) => {
      if (lengthComputable) onProgress(Math.round((100 * loaded) / total));
    };
    xhr.onerror = () => reject(new Error(t("errors.network")));
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300)
        return reject(failure(xhr.status, xhr.responseText));
      try {
        resolve(JSON.parse(xhr.responseText) as UploadResult);
      } catch {
        // Accepted, but no details came back.
        resolve({ written: [upload.path], scanStarted: false });
      }
    };
    xhr.send(form);
  });
}

async function post<T>(path: string, headers: Record<string, string>, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: body === undefined ? headers : { ...headers, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw failure(res.status, await res.text());
  return (await res.json()) as T;
}

export async function scanLooseFiles(authHeaders: Record<string, string>): Promise<CleanupGroup[]> {
  return (await post<{ groups: CleanupGroup[] }>("/cleanup/scan", authHeaders)).groups;
}

export function applyCleanup(
  authHeaders: Record<string, string>,
  folders: string[],
): Promise<ApplyResult> {
  return post<ApplyResult>("/cleanup/apply", authHeaders, { folders });
}
