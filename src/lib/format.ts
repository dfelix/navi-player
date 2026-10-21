// Turning numbers into text for the interface. Words come from the locale
// files; digits, dates and plurals follow the interface language.

import { intlLocale, t } from "@/i18n";

const valid = (n: number | undefined): n is number => !!n && Number.isFinite(n) && n > 0;
const two = (n: number) => String(n).padStart(2, "0");

// A track position or length: "3:07", "1:02:45".
export function formatDuration(seconds: number | undefined): string {
  if (!valid(seconds)) return "0:00";
  const total = Math.floor(seconds);
  const [h, m, s] = [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60];
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString(intlLocale());
}

// An album or playlist length: "47 min", "1 hr 23 min".
export function formatLongDuration(seconds: number | undefined): string {
  if (!valid(seconds)) return t("duration.minutes", { m: 0 });
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds - hours * 3600) / 60);
  return hours
    ? t("duration.hoursMinutes", { h: hours, m: minutes })
    : t("duration.minutes", { m: minutes });
}

// Total listening time. Past two days it's counted in days and hours: at
// "4,132 hr" the number has stopped meaning anything.
export function formatListeningTime(seconds: number | undefined): string {
  if (!valid(seconds)) return t("duration.minutes", { m: 0 });
  if (seconds < 2 * 86_400) return formatLongDuration(seconds);
  const totalHours = Math.round(seconds / 3600);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const dayText = t("duration.days", { d: formatNumber(days) }, days);
  return hours ? t("duration.daysHours", { days: dayText, h: hours }) : dayText;
}

// "1 track", "12 faixas": the language's own plural rules.
export type CountNoun = "track" | "album" | "file";
export function formatCount(n: number, noun: CountNoun): string {
  return t(`count.${noun}`, { n: formatNumber(n) }, n);
}

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB"];

// "1.2 GB", in 1024s like file managers count.
export function formatBytes(bytes: number | undefined): string {
  if (!valid(bytes)) return "0 B";
  let unit = 0;
  let value = bytes;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  const shown =
    unit === 0
      ? String(value)
      : value.toLocaleString(intlLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${shown} ${BYTE_UNITS[unit]}`;
}

// A date like "3 Oct 2026", or "" for none.
export function formatRelativeDate(iso: string | undefined): string {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(intlLocale(), { year: "numeric", month: "short", day: "numeric" });
}
