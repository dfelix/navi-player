// The app's display name, configurable per deployment with VITE_APP_NAME.
// Shared by the Vite build (vite.config.ts) and the app; server/appName.ts keeps
// a copy in step, since the server is compiled on its own.

export const DEFAULT_APP_NAME = "NaviPlayer";
export const APP_NAME_MAX_LENGTH = 40;

// Clean a configured name: trim, drop control characters, collapse whitespace
// and cap the length. Returns null when nothing usable is left.
export function normalizeAppName(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const name = raw
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!name) return null;
  return [...name].slice(0, APP_NAME_MAX_LENGTH).join("").trim();
}

export function resolveAppName(raw: string | null | undefined): string {
  return normalizeAppName(raw) ?? DEFAULT_APP_NAME;
}
