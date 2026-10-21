// Writing to the music library: browser uploads (single files or ZIPs) and
// "organize", which moves loose files in the top of the music folder into
// album folders. Admin-only, and only when MUSIC_DIR is set.
//
// Navidrome groups tracks into albums by their tags, not their folders. Files
// are placed the same way: into an "Artist - Album" folder named from their
// tags (album artist first, so compilations stay together), whatever folders
// they arrived in. Nothing already in the library is ever replaced.

import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { unzipSync } from "fflate";
import type { Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { parseBuffer, parseFile } from "music-metadata";
import { config } from "./config.js";
import { callerAuth, isAdmin, startScan } from "./navidrome.js";

const AUDIO = new Set("mp3 flac ogg opus m4a aac wav wv ape mpc wma aiff aif dsf dff".split(" "));

const extensionOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";
const isAudio = (name: string) => AUDIO.has(extensionOf(name));
const fileNameOf = (path: string) => path.split(/[/\\]/).pop() || path;

// macOS leaves "._name.flac" sidecars, .DS_Store and __MACOSX folders in
// archives; they can carry audio extensions but aren't audio.
const isJunk = (path: string) =>
  path.split(/[/\\]/).some((part) => part === "__MACOSX" || part.startsWith("."));

// `relative` inside `base`, or an error if it would land outside.
export function insideFolder(base: string, relative: string): string {
  const full = resolve(base, relative);
  const prefix = base.endsWith(sep) ? base : base + sep;
  if (full !== base && !full.startsWith(prefix)) throw new Error("Path escapes the folder");
  return full;
}

// ---- Album folders from tags ----

interface AlbumTags {
  artist: string | null;
  album: string | null;
}

type Common = { albumartist?: string; artist?: string; artists?: string[]; album?: string };

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

function albumTagsOf(common: Common = {}): AlbumTags {
  return {
    artist: text(common.albumartist) ?? text(common.artist) ?? text(common.artists?.[0]),
    album: text(common.album),
  };
}

// Tags only: no cover images, no duration scan.
const TAG_OPTIONS = { duration: false, skipCovers: true } as const;
const NO_TAGS: AlbumTags = { artist: null, album: null };

const tagsOfBytes = (bytes: Uint8Array, name: string) =>
  parseBuffer(bytes, { path: name }, TAG_OPTIONS).then(
    (m) => albumTagsOf(m.common),
    () => NO_TAGS,
  );

const tagsOfFile = (path: string) =>
  parseFile(path, TAG_OPTIONS).then(
    (m) => albumTagsOf(m.common),
    () => NO_TAGS,
  );

// One safe path segment on any OS: no reserved or control characters, no
// leading or trailing dots and spaces, and not absurdly long.
function segment(name: string): string {
  return name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s.]+|[\s.]+$/g, "")
    .slice(0, 120)
    .trim();
}

function albumFolderFor(tags: AlbumTags): string {
  return `${segment(tags.artist ?? "") || "Unknown Artist"} - ${segment(tags.album ?? "") || "Unknown Album"}`;
}

// ---- Shared request handling ----

const tooLarge = (c: Context) =>
  c.json({ error: `The upload is larger than this server accepts (${config.uploadMb} MB).` }, 413);

// The checks every library route starts with: configured, and an admin.
async function refuse(c: Context): Promise<Response | null> {
  if (!config.uploadsEnabled) {
    return c.json(
      {
        error:
          "Uploads are off on this server (MUSIC_DIR and VITE_NAVIDROME_URL must both be set).",
      },
      503,
    );
  }
  if (!(await isAdmin(callerAuth(c))))
    return c.json({ error: "Only Navidrome admins can change the library." }, 403);
  return null;
}

// Audio entries of a ZIP, with clean relative paths. Throws "too-large" when
// the archive says it would unpack to more than twice the upload limit (a ZIP
// bomb), before anything is inflated.
function audioFromZip(bytes: Uint8Array): [string, Uint8Array][] {
  let unpacked = 0;
  const clean = (name: string) => (isJunk(name) ? null : name.split("/").filter(Boolean).join("/"));
  const files = unzipSync(bytes, {
    filter(entry) {
      const path = clean(entry.name);
      if (!path || !isAudio(path)) return false;
      unpacked += entry.originalSize;
      if (unpacked > config.uploadBytes * 2) throw new Error("too-large");
      return true;
    },
  });
  return Object.entries(files).map(([name, data]) => [clean(name)!, data]);
}

// ---- Routes ----

export function mountLibrary(app: Hono): void {
  app.post("/upload", bodyLimit({ maxSize: config.uploadBytes, onError: tooLarge }), async (c) => {
    const refused = await refuse(c);
    if (refused) return refused;

    const form = await c.req.formData().catch(() => null);
    if (!form) return c.json({ error: "The upload couldn't be read." }, 400);
    const file = form.get("file");
    if (!(file instanceof File)) return c.json({ error: "The upload had no file in it." }, 400);

    const bytes = new Uint8Array(await file.arrayBuffer());
    let items: [string, Uint8Array][];
    if (extensionOf(file.name) === "zip") {
      try {
        items = audioFromZip(bytes);
      } catch (err) {
        if ((err as Error).message === "too-large") return tooLarge(c);
        return c.json({ error: "That ZIP file is damaged or isn't a ZIP." }, 400);
      }
    } else if (isAudio(file.name)) {
      items = [[file.name, bytes]];
    } else {
      return c.json({ error: "Only audio files and ZIP archives can be uploaded." }, 400);
    }

    const written: string[] = [];
    const skipped: string[] = []; // already in the library: left as they are
    try {
      for (const [name, data] of items) {
        if (isJunk(name)) continue;
        const relative = `${albumFolderFor(await tagsOfBytes(data, name))}/${fileNameOf(name)}`;
        let target: string;
        try {
          target = insideFolder(config.musicDir, relative);
        } catch {
          continue;
        }
        await mkdir(dirname(target), { recursive: true });
        try {
          // "wx" fails instead of overwriting, in one step.
          await writeFile(target, data, { flag: "wx" });
          written.push(relative);
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
          skipped.push(relative);
        }
      }
    } catch (err) {
      console.error("Saving an upload failed:", err);
      return c.json({ error: "The file couldn't be saved to the music folder." }, 500);
    }

    const scanStarted = written.length > 0 && (await startScan(callerAuth(c)));
    return c.json({ written, skipped, scanStarted });
  });

  // Loose top-level audio files, grouped into the folders "organize" would
  // create. Subfolders are taken to be albums already and left alone.
  async function looseFiles() {
    const groups = new Map<
      string,
      {
        folder: string;
        artist: string;
        album: string;
        hasTags: boolean;
        files: { name: string; size: number; hasTags: boolean }[];
      }
    >();
    for (const entry of await readdir(config.musicDir, { withFileTypes: true })) {
      if (!entry.isFile() || !isAudio(entry.name) || isJunk(entry.name)) continue;
      const path = join(config.musicDir, entry.name);
      const tags = await tagsOfFile(path);
      const folder = albumFolderFor(tags);
      const hasTags = !!(tags.artist || tags.album);
      const size = await stat(path).then(
        (s) => s.size,
        () => 0,
      );
      const group = groups.get(folder) ?? {
        folder,
        artist: tags.artist ?? "Unknown Artist",
        album: tags.album ?? "Unknown Album",
        hasTags,
        files: [],
      };
      group.files.push({ name: entry.name, size, hasTags });
      groups.set(folder, group);
    }
    return [...groups.values()].sort((a, b) => a.folder.localeCompare(b.folder));
  }

  app.post("/cleanup/scan", async (c) => {
    const refused = await refuse(c);
    if (refused) return refused;
    try {
      const groups = await looseFiles();
      return c.json({ groups, totalFiles: groups.reduce((n, g) => n + g.files.length, 0) });
    } catch (err) {
      console.error("Reading the music folder failed:", err);
      return c.json({ error: "The music folder couldn't be read." }, 500);
    }
  });

  app.post("/cleanup/apply", async (c) => {
    const refused = await refuse(c);
    if (refused) return refused;
    const body = (await c.req.json().catch(() => null)) as { folders?: unknown } | null;
    if (!body) return c.json({ error: "That request couldn't be understood." }, 400);
    const chosen = new Set(
      Array.isArray(body.folders) ? body.folders.filter((f) => typeof f === "string") : [],
    );
    if (chosen.size === 0) return c.json({ error: "Choose at least one album to organize." }, 400);

    let groups;
    try {
      groups = await looseFiles();
    } catch {
      return c.json({ error: "The music folder couldn't be read." }, 500);
    }

    const moved: string[] = [];
    const errors: { file: string; error: string }[] = [];
    // The grouping is worked out here again rather than taken from the
    // request, so files only ever go where this server would put them.
    for (const group of groups.filter((g) => chosen.has(g.folder))) {
      for (const { name } of group.files) {
        const relative = `${group.folder}/${fileNameOf(name)}`;
        let target: string;
        try {
          target = insideFolder(config.musicDir, relative);
        } catch {
          errors.push({ file: name, error: "Invalid path" });
          continue;
        }
        if (existsSync(target)) {
          errors.push({ file: name, error: "Target already exists" });
          continue;
        }
        const source = join(config.musicDir, name);
        try {
          await mkdir(dirname(target), { recursive: true });
          // A rename can't cross file systems; copy and delete instead.
          await rename(source, target).catch(async () => {
            await copyFile(source, target);
            await unlink(source);
          });
          moved.push(relative);
        } catch (err) {
          console.error(`Moving ${name} failed:`, err);
          errors.push({ file: name, error: "Move failed" });
        }
      }
    }

    const scanStarted = moved.length > 0 && (await startScan(callerAuth(c)));
    return c.json({ moved, errors, scanStarted });
  });
}
