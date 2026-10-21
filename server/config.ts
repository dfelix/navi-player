// The server's settings, read once at startup from the environment (and a
// .env file in the working folder, if there is one; real environment
// variables win). A setting that's present but wrong stops the server with a
// message saying why, rather than failing later on every request.

import { resolve } from "node:path";
import { normalizeAppName } from "./appName.js";

try {
  process.loadEnvFile();
} catch {
  // No .env: the environment is all there is.
}

function stop(message: string): never {
  console.error(message);
  process.exit(1);
}

const env = (name: string) => process.env[name]?.trim() ?? "";

// The Navidrome to proxy, as `origin + base path` without a trailing slash, or
// "" for direct mode (the app talks to the URL it was built with).
function navidromeUrl(): string {
  const raw = env("VITE_NAVIDROME_URL");
  if (!raw) return "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    stop(`VITE_NAVIDROME_URL is not a valid URL: "${raw}"`);
  }
  const plain =
    ["http:", "https:"].includes(url.protocol) &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash;
  if (!plain) {
    stop(
      "VITE_NAVIDROME_URL must be a plain http(s) base URL without credentials, query string or fragment.",
    );
  }
  return url.origin + url.pathname.replace(/\/+$/, "");
}

function uploadLimitMb(): number {
  const raw = env("UPLOAD_MAX_MB");
  if (!raw) return 2048;
  const mb = Number(raw);
  if (!(mb > 0) || !Number.isFinite(mb)) {
    stop(`UPLOAD_MAX_MB must be a positive number of megabytes (got "${raw}").`);
  }
  return mb;
}

const navidrome = navidromeUrl();
const uploadMb = uploadLimitMb();
const previewUser = process.env.NAVIDROME_OG_USER ?? "";
const previewPassword = process.env.NAVIDROME_OG_PASS ?? "";

export const config = {
  port: Number(env("PORT") || 8080),
  distDir: resolve(env("DIST_DIR") || "./dist"),
  navidrome,
  // Absolute, so path checks compare like with like even for "./music".
  musicDir: env("MUSIC_DIR") ? resolve(env("MUSIC_DIR")) : "",
  uploadMb,
  uploadBytes: Math.floor(uploadMb * 1024 * 1024),
  // Set: pages and the manifest are renamed as they're served. Unset: the
  // name the app was built with stays.
  appName: normalizeAppName(process.env.VITE_APP_NAME),
  // A read-only Navidrome account for link-preview cards. Server-side only.
  preview: { user: previewUser, password: previewPassword },
  get uploadsEnabled(): boolean {
    return !!(navidrome && this.musicDir);
  },
  get previewsEnabled(): boolean {
    return !!(navidrome && previewUser && previewPassword);
  },
};
