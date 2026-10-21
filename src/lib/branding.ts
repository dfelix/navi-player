// Product identity in one place. Everything user-visible and everything we
// announce to the server reads from here.

import { normalizeAppName, resolveAppName } from "@/lib/appName";
import { APP_NAME_ENV } from "@/lib/env";

// The display name, set per deployment with VITE_APP_NAME. The page carries it
// in <meta name="application-name">: the build writes it there, and the bundled
// server rewrites it when VITE_APP_NAME is set at runtime, so the page is the
// authority. The build-time value covers anything without that tag.
export function appNameFromPage(doc: Document | undefined = globalThis.document): string | null {
  const meta = doc?.querySelector<HTMLMetaElement>('meta[name="application-name"]');
  return normalizeAppName(meta?.content);
}

export const APP_NAME: string = appNameFromPage() ?? resolveAppName(APP_NAME_ENV);
export const APP_TAGLINE = "your Navidrome library, beautifully";
export const APP_DESCRIPTION = "A modern web client for your Navidrome music library";
// Injected by Vite from package.json at build time — see vite.config.ts.
declare const __APP_VERSION__: string;

export const APP_VERSION: string =
  typeof __APP_VERSION__ === "string" && __APP_VERSION__ ? __APP_VERSION__ : "0.0.0";

// Identifier announced to Navidrome as the Subsonic `c` parameter (and to
// LRCLIB). Fixed whatever the display name: Navidrome creates one "player"
// record per client name and hangs its per-player transcoding settings off it,
// so renaming a deployment must not orphan them.
export const SUBSONIC_CLIENT = "navi-player";
