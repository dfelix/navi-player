// Typo-tolerant matching used by search and the command palette.
import { createPinia, setActivePinia } from "pinia";
import type { NavidromeClient } from "@/api/client";
import type { SearchResult } from "@/api/types";
import { matchScore, searchVariants, simplify } from "@/lib/fuzzyMatch";
import { searchLibrary } from "@/lib/librarySearch";

beforeEach(() => setActivePinia(createPinia()));

describe("matchScore", () => {
  it("ranks exact, then prefix, then word-start, then contained matches", () => {
    const exact = matchScore("radiohead", "Radiohead");
    const prefix = matchScore("radio", "Radiohead");
    const wordStart = matchScore("kid", "Radiohead Kid A");
    const inside = matchScore("diohe", "Radiohead");
    expect(exact).toBe(1);
    expect(prefix).toBeLessThan(exact);
    expect(wordStart).toBeLessThan(prefix);
    expect(inside).toBeLessThan(wordStart);
    expect(inside).toBeGreaterThan(0);
  });

  it("ignores case, accents and punctuation", () => {
    expect(matchScore("sigur ros", "Sigur Rós")).toBe(1);
    expect(matchScore("acdc", "AC/DC")).toBeGreaterThan(0);
    expect(simplify("  Beyoncé — Halo! ")).toBe("beyonce halo");
  });

  it("forgives a typo in a longer word", () => {
    expect(matchScore("radoihead", "Radiohead")).toBeGreaterThan(0.5);
    expect(matchScore("metalica", "Metallica")).toBeGreaterThan(0.5);
    expect(matchScore("arctic monkies", "Arctic Monkeys")).toBeGreaterThan(0.5);
  });

  it("is strict with short words, and says 0 for no match", () => {
    expect(matchScore("abc", "abd")).toBe(0);
    expect(matchScore("queen", "Pink Floyd")).toBe(0);
    expect(matchScore("", "anything")).toBe(0);
  });
});

describe("searchVariants", () => {
  it("adds each word and the start of the longest one", () => {
    expect(searchVariants("arctic monkies")).toEqual([
      "arctic monkies",
      "arctic",
      "monkies",
      "mon",
    ]);
    expect(searchVariants("radoihead")).toEqual(["radoihead", "rad"]);
    expect(searchVariants("  ")).toEqual([]);
  });
});

describe("searchLibrary", () => {
  it("merges the looser searches and ranks by what was typed", async () => {
    const results: Record<string, SearchResult> = {
      metalica: { artist: [], album: [], song: [] },
      met: {
        artist: [{ id: "m", name: "Metallica" }],
        album: [{ id: "a1", name: "Master of Puppets", artist: "Metallica" }],
        song: [
          { id: "s1", title: "One", artist: "Metallica" },
          { id: "s2", title: "Metropolis", artist: "Someone" },
        ],
      },
    };
    const client = {
      search: jest.fn(async (q: string) => results[q] ?? { artist: [], album: [], song: [] }),
    } as unknown as NavidromeClient;

    const out = await searchLibrary(client, "metalica", [{ id: "x", name: "Metric" }]);
    expect(out.artist.map((a) => a.name)).toEqual(["Metallica"]);
    expect(out.album.map((a) => a.name)).toEqual(["Master of Puppets"]);
    expect(out.song.map((s) => s.title)).toEqual(["One"]);
  });

  it("still finds artists from the local list when the server finds nothing", async () => {
    const client = {
      search: jest.fn(async () => {
        throw new Error("down");
      }),
    } as unknown as NavidromeClient;
    const out = await searchLibrary(client, "radoihead", [
      { id: "r", name: "Radiohead" },
      { id: "q", name: "Queen" },
    ]);
    expect(out.artist.map((a) => a.name)).toEqual(["Radiohead"]);
  });
});
