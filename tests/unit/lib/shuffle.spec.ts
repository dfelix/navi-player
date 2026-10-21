// The artist-spreading shuffle. The property that matters most is that it is
// still a permutation — a shuffle that silently drops tracks would be far worse
// than one that clumps.
import type { Song } from "@/api/types";
import { shuffled, shuffleSpreadingArtists } from "@/lib/shuffle";

const song = (id: string, artist: string) => ({ id, title: id, artist }) as Song;
const adjacentRepeats = (list: Song[]) =>
  list.slice(1).filter((s, i) => s.artist === list[i]?.artist).length;

const heavy = [
  ...Array.from({ length: 8 }, (_, i) => song(`a${i}`, "Alpha")),
  ...Array.from({ length: 3 }, (_, i) => song(`b${i}`, "Beta")),
  ...Array.from({ length: 2 }, (_, i) => song(`c${i}`, "Gamma")),
  song("d0", "Delta"),
];

describe("shuffleSpreadingArtists", () => {
  it("is a permutation", () => {
    for (let trial = 0; trial < 40; trial++) {
      const out = shuffleSpreadingArtists(heavy);
      expect(out).toHaveLength(heavy.length);
      expect(new Set(out.map((s) => s.id)).size).toBe(heavy.length);
    }
  });

  it("spreads same-artist tracks better than a uniform shuffle", () => {
    const TRIALS = 60;
    let spread = 0;
    let plain = 0;
    for (let i = 0; i < TRIALS; i++) {
      spread += adjacentRepeats(shuffleSpreadingArtists(heavy));
      plain += adjacentRepeats(shuffled(heavy));
    }
    expect(spread / TRIALS).toBeLessThan(plain / TRIALS);
    // 8 of 14 tracks share an artist, so one adjacent repeat is unavoidable.
    expect(spread / TRIALS).toBeLessThanOrEqual(1.2);
  });

  it("produces no repeats when every artist differs", () => {
    const distinct = Array.from({ length: 10 }, (_, i) => song(`x${i}`, `Artist ${i}`));
    const out = shuffleSpreadingArtists(distinct);
    expect(new Set(out.map((s) => s.id)).size).toBe(10);
    expect(adjacentRepeats(out)).toBe(0);
  });

  it("never repeats an artist when the mix allows it", () => {
    // No artist has more than half the tracks, so a repeat is always avoidable.
    // Regression: two of the last three tracks by one artist used to clump.
    const mix = [
      ...Array.from({ length: 3 }, (_, i) => song(`a${i}`, "Alpha")),
      ...Array.from({ length: 3 }, (_, i) => song(`b${i}`, "Beta")),
      ...Array.from({ length: 3 }, (_, i) => song(`c${i}`, "Gamma")),
      ...Array.from({ length: 2 }, (_, i) => song(`d${i}`, "Delta")),
    ];
    let state = 1;
    const random = () => ((state = (state * 48271) % 2147483647) - 1) / 2147483646;
    for (let trial = 0; trial < 500; trial++)
      expect(adjacentRepeats(shuffleSpreadingArtists(mix, "Alpha", random))).toBe(0);
  });

  it("avoids starting with the artist it follows", () => {
    const mix = [song("a", "Alpha"), song("b", "Beta"), song("c", "Gamma"), song("d", "Alpha")];
    for (let i = 0; i < 20; i++)
      expect(shuffleSpreadingArtists(mix, "Alpha")[0]?.artist).not.toBe("Alpha");
  });

  it.each([1, 2, 5])("keeps every track of a %i-track single-artist list", (n) => {
    const same = Array.from({ length: n }, (_, i) => song(`s${i}`, "Same"));
    expect(shuffleSpreadingArtists(same)).toHaveLength(n);
  });
});
