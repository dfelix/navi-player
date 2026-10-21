// Dragging tracks onto a sidebar playlist. The track ids travel under a type
// of our own, so dropping them anywhere else (a text field, another app) does
// nothing instead of pasting stray text.

export const SONGS_MIME = "application/x-navi-player-songs";

export function readSongIds(transfer: DataTransfer | null): string[] {
  let ids: unknown;
  try {
    ids = JSON.parse(transfer?.getData(SONGS_MIME) || "[]");
  } catch {
    return [];
  }
  return Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
}
