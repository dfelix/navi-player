// The queue as it was when the page closed, per account, so a reload (or the
// next visit) picks up where you were. Two people sharing a browser each get
// their own.

import type { Song } from "@/api/types";
import type { ArtistStation } from "./artistRadio";

const PREFIX = "navi-player:queue";

export interface SavedQueue {
  queue: Song[];
  index: number;
  time: number; // seconds into the current track
  station: ArtistStation | null;
}

const keyFor = (username: string) => `${PREFIX}:${username}`;

export function saveQueue(username: string, saved: SavedQueue): void {
  try {
    localStorage.setItem(keyFor(username), JSON.stringify(saved));
  } catch {
    // Full or unavailable storage: the queue just won't survive a reload.
  }
}

function asStation(value: unknown): ArtistStation | null {
  const s = value as Partial<ArtistStation> | null | undefined;
  return s?.kind === "artist" && typeof s.id === "string" && typeof s.name === "string"
    ? { kind: "artist", id: s.id, name: s.name }
    : null;
}

// The saved queue, checked and clamped, or null when there's nothing usable.
export function loadQueue(username: string): SavedQueue | null {
  let parsed: Partial<SavedQueue> & { station?: unknown };
  try {
    const raw = localStorage.getItem(keyFor(username));
    if (!raw) return null;
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const queue = Array.isArray(parsed.queue) ? parsed.queue : [];
  if (queue.length === 0) return null;
  const index = Number.isInteger(parsed.index) ? (parsed.index as number) : 0;
  return {
    queue,
    index: Math.min(Math.max(index, 0), queue.length - 1),
    time: Math.max(0, Number(parsed.time) || 0),
    station: asStation(parsed.station),
  };
}
