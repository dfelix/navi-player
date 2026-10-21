// The app's page shell (index.html) and manifest, renamed on the way out when
// VITE_APP_NAME is set, so a prebuilt image can carry any display name.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_APP_NAME, normalizeAppName } from "./appName.js";
import { config } from "./config.js";

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

export const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (ch) => ENTITIES[ch]!);

function unescapeHtml(s: string): string {
  const named = Object.fromEntries(Object.entries(ENTITIES).map(([ch, entity]) => [entity, ch]));
  return s.replace(/&#(\d+);|&(?:amp|lt|gt|quot);/g, (entity, code?: string) =>
    code ? String.fromCharCode(Number(code)) : named[entity]!,
  );
}

const TITLE = /<title>[\s\S]*?<\/title>/i;
const NAME_TAGS =
  /(<meta\s+name="(?:application-name|apple-mobile-web-app-title)"\s+content=")[^"]*(")/gi;

// Replacements are functions throughout: with a string, a name containing
// "$&" or "$1" would be read as a substitution pattern.
export function withTitle(html: string, title: string): string {
  return html.replace(TITLE, () => `<title>${title}</title>`);
}

export function renamed(html: string): string {
  if (!config.appName) return html;
  const name = escapeHtml(config.appName);
  return withTitle(html, name).replace(
    NAME_TAGS,
    (_all, open: string, close: string) => open + name + close,
  );
}

// The name the page is served under: the override, else the one it was built
// with, else the default.
export function servedName(html: string): string {
  if (config.appName) return config.appName;
  const built = /<meta\s+name="application-name"\s+content="([^"]*)"/i.exec(html)?.[1];
  return normalizeAppName(built === undefined ? null : unescapeHtml(built)) ?? DEFAULT_APP_NAME;
}

export async function pageShell(): Promise<string> {
  return renamed(await readFile(join(config.distDir, "index.html"), "utf8"));
}

export async function renamedManifest(path: string): Promise<Record<string, unknown>> {
  const manifest = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  return { ...manifest, name: config.appName, short_name: config.appName };
}
