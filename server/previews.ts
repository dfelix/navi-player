// Link previews: when a chat app or social site fetches an album, artist,
// playlist or song link, it gets a page with that item's title, description
// and cover in Open Graph / Twitter tags, instead of the bare app shell.
// People opening the same link get the normal app.
//
// Lookups use a read-only Navidrome account configured on the server
// (NAVIDROME_OG_USER / NAVIDROME_OG_PASS), and covers are served through
// /og/cover so crawlers, which can't sign in, can load them. All of it is off
// until that account is set.

import type { Context, Hono } from "hono";
import { config } from "./config.js";
import { previewQuery, restUrl, subsonicGet } from "./navidrome.js";
import { escapeHtml, pageShell, servedName, withTitle } from "./shell.js";

const CRAWLERS =
  /bot|facebookexternalhit|twitterbot|slackbot|discordbot|whatsapp|telegrambot|embed|preview|pinterest|redditbot|applebot|linkedinbot|skypeuripreview|bluesky|bsky|mastodon|iframely|vkshare|quora|google-inspectiontool|developers\.google\.com/i;

const LINKABLE = /^\/(album|artist|playlist|song)\/([^/?#]+)/;

interface Preview {
  title: string;
  description: string;
  cover?: string;
  type: string; // og:type
}

// Crawlers read these, so they stay in English.
const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;
const joined = (parts: unknown[], fallback: string) =>
  parts.filter(Boolean).join(" · ") || fallback;
const byArtist = (name: string, artist?: string) => (artist ? `${name} — ${artist}` : name);

type Lookup = (id: string) => Promise<Preview | null>;

function lookup<T>(endpoint: string, read: (body: T, id: string) => Preview | undefined): Lookup {
  return async (id) => {
    const body = await subsonicGet<T>(restUrl(endpoint, previewQuery({ id })));
    return (body && read(body, id)) ?? null;
  };
}

const LOOKUPS: Record<string, Lookup> = {
  album: lookup<{
    album?: { name: string; artist?: string; songCount?: number; year?: number; coverArt?: string };
  }>(
    "getAlbum.view",
    ({ album: a }, id) =>
      a && {
        title: byArtist(a.name, a.artist),
        description: joined(
          [a.artist, a.songCount != null && plural(a.songCount, "track"), a.year],
          "Album",
        ),
        cover: a.coverArt ?? id,
        type: "music.album",
      },
  ),
  playlist: lookup<{
    playlist?: { name: string; comment?: string; songCount?: number; coverArt?: string };
  }>(
    "getPlaylist.view",
    ({ playlist: p }, id) =>
      p && {
        title: p.name,
        description: joined(
          [p.comment, p.songCount != null && plural(p.songCount, "track")],
          "Playlist",
        ),
        cover: p.coverArt ?? id,
        type: "music.playlist",
      },
  ),
  song: lookup<{
    song?: { title: string; artist?: string; album?: string; year?: number; coverArt?: string };
  }>(
    "getSong.view",
    ({ song: s }, id) =>
      s && {
        title: byArtist(s.title, s.artist),
        description: joined([s.album, s.year], "Track"),
        cover: s.coverArt ?? id,
        type: "music.song",
      },
  ),
  artist: lookup<{
    artist?: {
      name: string;
      albumCount?: number;
      coverArt?: string;
      album?: { coverArt?: string }[];
    };
  }>(
    "getArtist.view",
    ({ artist: a }) =>
      a && {
        title: a.name,
        description: a.albumCount != null ? plural(a.albumCount, "album") : "Artist",
        cover: a.coverArt ?? a.album?.[0]?.coverArt,
        type: "profile",
      },
  ),
};

// The public address the request came in on. Behind a reverse proxy that's in
// X-Forwarded-*; anyone can send those, so only well-formed values are used
// (and preview pages are marked private, so a forged one reaches no one else).
const HOST = /^[a-z0-9.-]+(?::\d{1,5})?$|^\[[0-9a-f:.]+\](?::\d{1,5})?$/i;
function publicOrigin(c: Context): string {
  const proto = c.req.header("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const host = c.req.header("x-forwarded-host")?.split(",")[0]?.trim() ?? c.req.header("host");
  if ((proto === "http" || proto === "https") && host && HOST.test(host))
    return `${proto}://${host}`;
  return new URL(c.req.url).origin;
}

function withPreview(shell: string, p: Preview, pageUrl: string, origin: string): string {
  const site = servedName(shell);
  const title = `${p.title} · ${site}`;
  const image = p.cover ? `${origin}/og/cover/${encodeURIComponent(p.cover)}` : "";
  const tags: [string, string, string][] = [
    ["property", "og:site_name", site],
    ["property", "og:type", p.type],
    ["property", "og:title", title],
    ["property", "og:description", p.description],
    ["property", "og:url", pageUrl],
    ["property", "og:image", image],
    ["name", "twitter:card", image ? "summary_large_image" : "summary"],
    ["name", "twitter:title", title],
    ["name", "twitter:description", p.description],
    ["name", "twitter:image", image],
    ["name", "description", p.description],
  ];
  const meta = tags
    .filter(([, , value]) => value)
    .map(([attr, key, value]) => `<meta ${attr}="${key}" content="${escapeHtml(value)}" />`)
    .join("\n    ");
  return withTitle(shell, escapeHtml(title)).replace(/<\/head>/i, () => `    ${meta}\n  </head>`);
}

// The preview page for this request, or null to serve the app as usual.
export async function previewPage(c: Context): Promise<Response | null> {
  if (!config.previewsEnabled || c.req.method !== "GET") return null;
  if (!CRAWLERS.test(c.req.header("user-agent") ?? "")) return null;
  const { pathname } = new URL(c.req.url);
  const [, kind, rawId] = LINKABLE.exec(pathname) ?? [];
  if (!kind || !rawId) return null;
  try {
    const preview = await LOOKUPS[kind]!(decodeURIComponent(rawId));
    if (!preview) return null;
    const origin = publicOrigin(c);
    return new Response(withPreview(await pageShell(), preview, origin + pathname, origin), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        // Private: its absolute URLs come from the request's headers.
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return null;
  }
}

export function mountPreviewCovers(app: Hono): void {
  app.get("/og/cover/:id", async (c) => {
    if (!config.previewsEnabled) return c.notFound();
    const url = restUrl("getCoverArt.view", previewQuery({ id: c.req.param("id"), size: "1200" }));
    const cover = await fetch(url).catch(() => null);
    if (!cover?.ok) return c.notFound();
    return new Response(cover.body, {
      headers: {
        "Content-Type": cover.headers.get("content-type") ?? "image/jpeg",
        "Cache-Control": "public, max-age=86400",
      },
    });
  });
}
