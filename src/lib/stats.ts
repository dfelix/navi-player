// The Stats page's cards. A figure the server couldn't provide gets no card
// at all, rather than a misleading zero.

import type { LibraryStats, UserStats } from "@/api/client";
import type { IconName } from "@/components/base/icons";
import { t } from "@/i18n";
import type { HistoryEntry } from "@/stores/history";
import {
  formatBytes,
  formatCount,
  formatListeningTime,
  formatNumber,
  formatRelativeDate,
} from "./format";

export interface StatCard {
  icon: IconName;
  label: string;
  value: string;
  hint?: string;
}

const card = (icon: IconName, label: string, value: string, hint?: string): StatCard =>
  hint ? { icon, label, value, hint } : { icon, label, value };

export function libraryCards(stats: LibraryStats | undefined): StatCard[] {
  if (!stats) return [];
  return [
    card("mic", t("nav.artists"), formatNumber(stats.artistCount)),
    card("disc", t("nav.albums"), formatNumber(stats.albumCount)),
    card("list", t("stats.songs"), formatNumber(stats.songCount)),
    ...(stats.totalSize === undefined
      ? []
      : [card("server", t("stats.totalSize"), formatBytes(stats.totalSize))]),
  ];
}

export function listeningCards(stats: UserStats | undefined, librarySongs?: number): StatCard[] {
  if (!stats) return [];
  const s = stats;
  const floor = (hint: string) => (s.approximate ? hint : undefined);
  const cards: (StatCard | null)[] = [
    s.totalPlays === undefined
      ? null
      : card(
          "play",
          t("stats.songsPlayed"),
          formatNumber(s.totalPlays),
          floor(t("stats.countedFromTop")),
        ),
    s.listeningSeconds === undefined
      ? null
      : card(
          "clock",
          t("stats.timeListened"),
          formatListeningTime(s.listeningSeconds),
          floor(t("stats.atLeast")),
        ),
    s.tracksPlayed === undefined
      ? null
      : card(
          "check",
          t("stats.differentSongs"),
          formatNumber(s.tracksPlayed),
          // How much of the library that is: what makes the number mean something.
          librarySongs
            ? t("stats.shareOfLibrary", { pct: Math.round((100 * s.tracksPlayed) / librarySongs) })
            : undefined,
        ),
    s.albumsPlayed === undefined
      ? null
      : card("disc", t("stats.albumsPlayed"), formatNumber(s.albumsPlayed)),
    s.artistsPlayed === undefined
      ? null
      : card("mic", t("stats.artistsPlayed"), formatNumber(s.artistsPlayed)),
    s.favoriteSongs === undefined
      ? null
      : card(
          "heart",
          t("nav.favourites"),
          formatNumber(s.favoriteSongs),
          [
            s.favoriteAlbums === undefined ? "" : formatCount(s.favoriteAlbums, "album"),
            s.favoriteArtists === undefined
              ? ""
              : t("stats.artistCount", { n: formatNumber(s.favoriteArtists) }, s.favoriteArtists),
          ]
            .filter(Boolean)
            .join(" · "),
        ),
    s.lastPlayed && formatRelativeDate(s.lastPlayed)
      ? card("calendar", t("stats.lastPlayed"), formatRelativeDate(s.lastPlayed))
      : null,
  ];
  return cards.filter((c): c is StatCard => c !== null);
}

// Totals from this browser's own play log. It only holds the latest few
// hundred plays, so the page presents it as "recently", not all time.
export function localListening(entries: HistoryEntry[]) {
  if (entries.length === 0) return null;
  const distinct = (values: (string | undefined)[]) => new Set(values.filter(Boolean)).size;
  return {
    plays: entries.length,
    tracks: distinct(entries.map((e) => e.id)),
    artists: distinct(entries.map((e) => e.artist)),
    seconds: entries.reduce((total, e) => total + (e.duration ?? 0), 0),
    since: new Date(entries.at(-1)!.playedAt).toISOString(),
  };
}
