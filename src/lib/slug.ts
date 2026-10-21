// Readable URL segments, e.g. the artist part of /listen/sigur-ros/<id>.
// Cosmetic: links are resolved by id, so two artists sharing a slug is fine.

export function slugify(text: string | undefined, fallback = "unknown"): string {
  const words = (text ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .match(/[a-z0-9]+/g);
  return words ? words.join("-") : fallback;
}
