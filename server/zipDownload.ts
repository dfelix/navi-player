// POST /download/zip: an album or playlist converted by Navidrome's
// transcoder, streamed back as one ZIP.
//
// The browser posts a form (into a hidden frame, so the response downloads
// straight to disk) carrying the caller's own Subsonic credentials and the
// tracks with their file names (services/download). Each track is fetched in
// turn and stored in the archive uncompressed, as audio is compressed
// already. A track that can't be fetched is left out rather than failing the
// whole archive.

import { Zip, ZipPassThrough } from "fflate";
import type { Hono } from "hono";
import { config } from "./config.js";
import { restUrl, subsonicQuery } from "./navidrome.js";

interface ZipOrder {
  zipName?: string;
  format?: string;
  bitRate?: number;
  tracks?: { id: string; name: string }[];
  u?: string;
  t?: string;
  s?: string;
}

// An ASCII name for old clients and the exact UTF-8 one (RFC 6266/5987).
function attachment(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

// Archive entries must be unique; a clash gets underscores in front.
function uniqueNames(order: Required<Pick<ZipOrder, "tracks" | "format">>): string[] {
  const used = new Set<string>();
  return order.tracks.map(({ id, name }) => {
    let entry = name || `${id}.${order.format}`;
    while (used.has(entry.toLowerCase())) entry = `_${entry}`;
    used.add(entry.toLowerCase());
    return entry;
  });
}

export function mountZipDownload(app: Hono): void {
  app.post("/download/zip", async (c) => {
    if (!config.navidrome) {
      return c.json(
        { error: "Transcoded downloads require proxy mode (set VITE_NAVIDROME_URL)" },
        503,
      );
    }
    let order: ZipOrder;
    try {
      const payload = (await c.req.formData()).get("payload");
      order = JSON.parse(typeof payload === "string" ? payload : "{}") as ZipOrder;
    } catch {
      return c.json({ error: "That request couldn't be understood." }, 400);
    }
    const { u, t, s, format, bitRate } = order;
    const tracks = order.tracks ?? [];
    if (!u || !t || !s || !format || tracks.length === 0) {
      return c.json(
        { error: "The download request needs credentials and at least one track." },
        400,
      );
    }

    const names = uniqueNames({ tracks, format });
    const urlFor = (id: string) =>
      restUrl(
        "stream.view",
        subsonicQuery(
          u,
          t,
          s,
          { id, format, ...(bitRate ? { maxBitRate: String(bitRate) } : {}) },
          { json: false },
        ),
      );

    const archive = new ReadableStream<Uint8Array>({
      start(out) {
        const zip = new Zip((err, chunk, last) => {
          if (err) return out.error(err);
          out.enqueue(chunk);
          if (last) out.close();
        });
        void (async () => {
          for (const [i, track] of tracks.entries()) {
            const res = await fetch(urlFor(track.id)).catch(() => null);
            if (!res?.ok || !res.body) continue;
            const entry = new ZipPassThrough(names[i]!);
            zip.add(entry);
            for await (const chunk of res.body) entry.push(chunk);
            entry.push(new Uint8Array(0), true);
          }
          zip.end();
        })().catch((err: unknown) => out.error(err));
      },
    });

    const zipName = (order.zipName || "download.zip").replace(/[/\\]/g, "_");
    return new Response(archive, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": attachment(zipName),
        "Cache-Control": "no-store",
      },
    });
  });
}
