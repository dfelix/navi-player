// What was played in this browser, track by track, newest first.
//
// Navidrome keeps play counts but no log of individual plays, so the History
// page, "most played this week" and radio's "don't repeat what I just heard"
// all come from this. Saved per account, so people sharing a browser each have
// their own.

import { defineStore } from "pinia";
import { ref, watch } from "vue";
import type { Song } from "@/api/types";
import { useSessionStore } from "./session";

export interface HistoryEntry {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  albumId?: string;
  artistId?: string;
  coverArt?: string;
  duration?: number;
  playedAt: number; // ms since 1970
}

const PREFIX = "navi-player:history";
// Months of listening in around 100 KB of storage.
const KEEP = 500;
// The same track again this soon is a restart or a skip back, not a new play.
const SAME_PLAY_MS = 30_000;

export const useHistoryStore = defineStore("history", () => {
  const session = useSessionStore();
  const entries = ref<HistoryEntry[]>([]);

  const storageKey = () => (session.client ? `${PREFIX}:${session.client.username}` : null);

  function save(): void {
    const key = storageKey();
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify(entries.value));
    } catch {
      // Storage full: keep the newer half rather than nothing.
      entries.value = entries.value.slice(0, Math.floor(entries.value.length / 2));
      try {
        localStorage.setItem(key, JSON.stringify(entries.value));
      } catch {
        // No storage at all; history lasts until the page closes.
      }
    }
  }

  function load(): void {
    const key = storageKey();
    let saved: unknown = [];
    try {
      saved = key ? JSON.parse(localStorage.getItem(key) ?? "[]") : [];
    } catch {
      saved = [];
    }
    entries.value = Array.isArray(saved) ? (saved as HistoryEntry[]) : [];
  }

  watch(() => session.client, load, { immediate: true });

  function record(song: Song): void {
    if (!song.id) return;
    const now = Date.now();
    const latest = entries.value[0];
    if (latest?.id === song.id && now - latest.playedAt < SAME_PLAY_MS) return;
    const { id, title, artist, album, albumId, artistId, coverArt, duration } = song;
    entries.value = [
      { id, title, artist, album, albumId, artistId, coverArt, duration, playedAt: now },
      ...entries.value,
    ].slice(0, KEEP);
    save();
  }

  // The last `limit` different tracks played.
  function recentlyPlayedIds(limit = 150): Set<string> {
    const ids = new Set<string>();
    for (const { id } of entries.value) {
      if (ids.size >= limit) break;
      ids.add(id);
    }
    return ids;
  }

  function clear(): void {
    entries.value = [];
    const key = storageKey();
    try {
      if (key) localStorage.removeItem(key);
    } catch {
      // Nothing to remove.
    }
  }

  // The most played tracks within the last `windowMs`.
  function top(windowMs: number, limit = 10): { entry: HistoryEntry; plays: number }[] {
    const since = Date.now() - windowMs;
    const tally = new Map<string, { entry: HistoryEntry; plays: number }>();
    for (const entry of entries.value) {
      if (entry.playedAt < since) break; // newest first: the rest are older still
      const counted = tally.get(entry.id) ?? { entry, plays: 0 };
      counted.plays++;
      tally.set(entry.id, counted);
    }
    return [...tally.values()].sort((a, b) => b.plays - a.plays).slice(0, limit);
  }

  return { entries, load, record, recentlyPlayedIds, clear, top };
});
