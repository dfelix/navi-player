// Small rules the player follows, kept apart from the store so they can be
// read (and tested) on their own.

import type { Song } from "@/api/types";
import type { ReplayGainMode } from "./settingsSchema";

export interface ReplayGainSettings {
  mode: ReplayGainMode;
  preAmpDb: number;
}

// When a play counts as a listen, Last.fm-style: half the track or four
// minutes, whichever comes first.
export function scrobbleThreshold(durationSeconds: number): number {
  return Math.min(durationSeconds / 2, 240);
}

// The ReplayGain adjustment (dB) and peak to use for a song, given the
// volume-levelling setting.
export function replayGainFor(
  song: Song,
  settings: ReplayGainSettings,
): { db: number; peak: number } {
  const rg = song.replayGain;
  if (settings.mode === "off" || !rg) return { db: 0, peak: 1 };
  const byAlbum = settings.mode === "album";
  const gain = byAlbum ? rg.albumGain : rg.trackGain;
  const peak = byAlbum ? rg.albumPeak : rg.trackPeak;
  return { db: (gain ?? 0) + settings.preAmpDb, peak: peak ?? 1 };
}
