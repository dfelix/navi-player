// Showing the listening history: day headings, times, and turning an entry
// back into something the player can play.

import type { Song } from "@/api/types";
import { intlLocale, t } from "@/i18n";
import type { HistoryEntry } from "@/stores/history";

export const DAY_MS = 86_400_000;

// Entries keep only what's needed to show and replay a track.
export function historyEntryToSong(entry: HistoryEntry): Song {
  const { playedAt, duration, ...song } = entry;
  void playedAt;
  return { ...song, duration: duration ?? 0 };
}

const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

// "Today", "Yesterday", or the date (with the year only when it isn't this one).
export function dayLabel(timestamp: number, now = new Date()): string {
  const today = midnight(now);
  if (timestamp >= today) return t("history.today");
  if (timestamp >= today - DAY_MS) return t("history.yesterday");
  const date = new Date(timestamp);
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(intlLocale(), {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function timeLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(intlLocale(), {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Newest-first entries in runs of the same day.
export function groupByDay(
  entries: HistoryEntry[],
  now = new Date(),
): { label: string; entries: HistoryEntry[] }[] {
  const days: { label: string; entries: HistoryEntry[] }[] = [];
  for (const entry of entries) {
    const label = dayLabel(entry.playedAt, now);
    if (days.at(-1)?.label === label) days.at(-1)!.entries.push(entry);
    else days.push({ label, entries: [entry] });
  }
  return days;
}
