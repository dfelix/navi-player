// Reading lyrics text: LRC (time-stamped) and plain.
//
// An LRC line starts with one or more stamps, "[mm:ss]", "[mm:ss.xx]" or
// "[mm:ss.xxx]", then the words. Several stamps mean the line is sung at each
// of those times (a repeated chorus). Lines starting with a tag such as
// "[ar: Artist]" are metadata and skipped.

import type { LyricsLine } from "@/api/types";

const STAMP = /^\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/;

// "5" → 500 ms, "05" → 50, "050" → 50: the digits are a decimal fraction.
const fractionMs = (digits = "") => Number(digits.padEnd(3, "0").slice(0, 3));

export function parseLrc(text: string): LyricsLine[] {
  const lines: LyricsLine[] = [];
  let repeated = false;
  for (const raw of text.split(/\r?\n/)) {
    let rest = raw.trim();
    const starts: number[] = [];
    for (let m = STAMP.exec(rest); m; m = STAMP.exec(rest)) {
      const [stamp, minutes, seconds, fraction] = m;
      starts.push(Number(minutes) * 60_000 + Number(seconds) * 1000 + fractionMs(fraction));
      rest = rest.slice(stamp.length);
    }
    if (starts.length > 1) repeated = true;
    // An empty line is kept: it marks an instrumental gap, and dropping it
    // would move the highlight on before the music does.
    const value = rest.trim();
    for (const start of starts) lines.push({ start, value });
  }
  // Repeated lines are listed once, so put everything back in time order.
  return repeated ? lines.sort((a, b) => a.start! - b.start!) : lines;
}

// Plain lyrics as lines, without blank lines at the very start or end.
export function plainLines(text: string): LyricsLine[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  while (lines.length > 0 && !lines[0]) lines.shift();
  while (lines.length > 0 && !lines.at(-1)) lines.pop();
  return lines.map((value) => ({ value }));
}
