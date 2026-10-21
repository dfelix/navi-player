// Turning the biography Navidrome passes on from Last.fm into something
// readable.
//
// Last.fm keeps one page per artist name, so a name shared by several acts
// ("Pluto") gets a disambiguation text: "There are multiple artists named
// Pluto: 1) a rapper from Atlanta… 2) a Portuguese rock band… 3) …", often as
// one run-on paragraph. We split that into its entries and, when one of them
// names an album in the library, show that one.

export type ArtistBio =
  | { kind: "single"; paragraphs: string[] }
  | { kind: "several"; intro: string; entries: string[]; match: number | null };

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === "#") {
      const code =
        name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : +name.slice(1);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

// Plain text with paragraph breaks kept. Links (Last.fm's "Read more on
// Last.fm") go entirely; other markup is dropped. The result is only ever
// shown as text, never as HTML.
export function bioToText(raw: string): string {
  const text = raw
    .replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]*>/g, "");
  return decodeEntities(text)
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// "1) ", "2) "… in order, at the start of the text or after a space or line
// break. Only the next expected number counts, so "(born 1950) " or a stray
// "3) " out of sequence stays part of an entry.
function splitNumbered(text: string): { intro: string; entries: string[] } | null {
  const starts: { at: number; body: number }[] = [];
  let expected = 1;
  const marker = /(^|\s)(\d{1,2})[).]\s+/g;
  for (let m = marker.exec(text); m; m = marker.exec(text)) {
    if (Number(m[2]) !== expected) continue;
    starts.push({ at: m.index + m[1].length, body: m.index + m[0].length });
    expected += 1;
  }
  if (starts.length < 2) return null;
  const entries = starts.map(({ body }, i) =>
    text
      .slice(body, starts[i + 1]?.at ?? text.length)
      .trim()
      .replace(/\s*\n\s*/g, " "),
  );
  return { intro: text.slice(0, starts[0].at).trim(), entries };
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

// The entry that names the most of the artist's albums, if exactly one does
// best. Very short titles ("I", "II") would match almost anything, so they
// don't count.
function matchingEntry(entries: string[], albumNames: string[]): number | null {
  const titles = [...new Set(albumNames.map((n) => fold(n).trim()))].filter((n) => n.length >= 3);
  if (titles.length === 0) return null;
  const scores = entries.map((entry) => {
    const text = fold(entry);
    return titles.filter((title) => {
      const at = text.indexOf(title);
      if (at < 0) return false;
      const before = text[at - 1] ?? " ";
      const after = text[at + title.length] ?? " ";
      return !/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after);
    }).length;
  });
  const best = Math.max(...scores);
  if (best === 0 || scores.filter((s) => s === best).length > 1) return null;
  return scores.indexOf(best);
}

// Disambiguation texts open by saying so; other bios with a numbered list in
// them stay as they are.
const SEVERAL =
  /\b(multiple|several|many|various|\d+|two|three|four|five|six|seven|eight|nine|ten)\b[^.:]{0,40}\b(artists?|bands?|acts?|groups?)\b/i;

export function parseBio(raw: string | undefined, albumNames: string[] = []): ArtistBio | null {
  const text = raw ? bioToText(raw) : "";
  if (!text) return null;
  const numbered = splitNumbered(text);
  if (numbered && (SEVERAL.test(numbered.intro) || numbered.intro === "")) {
    return { kind: "several", ...numbered, match: matchingEntry(numbered.entries, albumNames) };
  }
  return { kind: "single", paragraphs: text.split(/\n{2,}/).map((p) => p.replace(/\n/g, " ")) };
}
