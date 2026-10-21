// Copy of src/lib/appName.ts for the server, which is compiled on its own.
// tests/unit/lib/appName.spec.ts checks the two stay identical in behaviour.

export const DEFAULT_APP_NAME = "NaviPlayer";
export const APP_NAME_MAX_LENGTH = 40;

export function normalizeAppName(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const name = raw
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!name) return null;
  return [...name].slice(0, APP_NAME_MAX_LENGTH).join("").trim();
}
