// Typo-tolerant matching for search and the command palette.
//
// A score from 0 to 1 of how well a query fits a piece of text: exact and
// prefix matches score highest, then contained matches, then word-by-word
// matches that allow a typo or two (edit distance). Anything below MIN_SCORE
// is reported as 0, so callers can simply drop zeroes.

const MIN_SCORE = 0.45;

// Lowercase, no accents, words separated by single spaces: "Sigur Rós!" and
// "sigur ros" compare equal.
export function simplify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// Optimal string alignment distance: insertions, deletions, substitutions and
// swapping two neighbouring letters each cost one.
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) =>
    Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, d[i - 2]![j - 2]! + 1);
      }
      d[i]![j] = best;
    }
  }
  return d[a.length]![b.length]!;
}

// How close one query word is to one text word, 0..1. A word the query is the
// start of counts as close ("radiohe" → "radiohead"), and so does one within
// a typo or two of it, scaled by length so short words need to be exact.
function wordSimilarity(q: string, w: string): number {
  if (w === q) return 1;
  if (w.startsWith(q)) return 0.9 - Math.min(0.2, (w.length - q.length) * 0.02);
  const allowed = q.length <= 3 ? 0 : q.length <= 6 ? 1 : 2;
  // Compare against the word cut to the query's length too, so a typo in a
  // prefix still matches ("radoihe" → "radiohead").
  const dist = Math.min(editDistance(q, w), editDistance(q, w.slice(0, q.length)));
  if (dist > allowed) return 0;
  return 0.8 - dist * 0.1;
}

export function matchScore(query: string, text: string): number {
  const q = simplify(query);
  const t = simplify(text);
  if (!q || !t) return 0;
  if (t === q) return 1;
  if (t.startsWith(q)) return 0.95;
  if (t.includes(` ${q}`)) return 0.9;
  if (t.includes(q)) return 0.8;
  // Spacing typed differently: "acdc" for "AC/DC", "pinkfloyd".
  const compact = t.replaceAll(" ", "");
  if (compact.startsWith(q.replaceAll(" ", ""))) return 0.85;

  // Word by word: every query word has to find a reasonable partner.
  const textWords = t.split(" ");
  const parts = q.split(" ").map((qw) => Math.max(...textWords.map((w) => wordSimilarity(qw, w))));
  if (parts.some((p) => p === 0)) return 0;
  const score = (parts.reduce((a, b) => a + b, 0) / parts.length) * 0.9;
  return score >= MIN_SCORE ? score : 0;
}

// Server searches only find substrings, so a typo finds nothing. Asking for a
// few looser forms of the query as well (each long word on its own, and the
// query's start) gives the local scorer candidates to rank.
export function searchVariants(query: string, max = 4): string[] {
  const q = query.trim();
  if (!q) return [];
  const out = new Set<string>([q]);
  const words = simplify(q)
    .split(" ")
    .filter((w) => w.length >= 3);
  if (words.length > 1) for (const w of words) out.add(w);
  const longest = [...words].sort((a, b) => b.length - a.length)[0];
  // The first few letters survive most typos made later in the word.
  if (longest && longest.length >= 5) out.add(longest.slice(0, 3));
  return [...out].slice(0, max);
}
