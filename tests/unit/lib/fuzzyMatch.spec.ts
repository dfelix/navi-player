// Typo-tolerant matching used by search and the command palette.
import { createPinia, setActivePinia } from "pinia";
import type { NavidromeClient } from "@/api/client";
import type { SearchResult } from "@/api/types";
import { matchScore, searchVariants, simplify } from "@/lib/fuzzyMatch";
import { searchLibrary } from "@/lib/librarySearch";

beforeEach(() => setActivePinia(createPinia()));

describe("matchScore", () => {
  it("ranks exact, then prefix, then word-start, then contained matches", () => {
    const exact = matchScore("lighthouse", "Lighthouse");
    const prefix = matchScore("light", "Lighthouse");
    const wordStart = matchScore("pale", "Lighthouse Pale Sky");
    const inside = matchScore("ghtho", "Lighthouse");
    expect(exact).toBe(1);
    expect(prefix).toBeLessThan(exact);
    expect(wordStart).toBeLessThan(prefix);
    expect(inside).toBeLessThan(wordStart);
    expect(inside).toBeGreaterThan(0);
  });

  it("ignores case, accents and punctuation", () => {
    expect(matchScore("cafe ebene", "Café Ébène")).toBe(1);
    expect(matchScore("exit", "EX/IT")).toBeGreaterThan(0);
    expect(simplify("  Renée — Écho! ")).toBe("renee echo");
  });

  it("forgives a typo in a longer word", () => {
    expect(matchScore("ligthhouse", "Lighthouse")).toBeGreaterThan(0.5);
    expect(matchScore("petalina", "Petallina")).toBeGreaterThan(0.5);
    expect(matchScore("northern statik", "Northern Static")).toBeGreaterThan(0.5);
  });

  it("is strict with short words, and says 0 for no match", () => {
    expect(matchScore("abc", "abd")).toBe(0);
    expect(matchScore("velvet", "Slate Harbour")).toBe(0);
    expect(matchScore("", "anything")).toBe(0);
  });
});

describe("searchVariants", () => {
  it("adds each word and the start of the longest one", () => {
    expect(searchVariants("northern statik")).toEqual([
      "northern statik",
      "northern",
      "statik",
      "nor",
    ]);
    expect(searchVariants("ligthhouse")).toEqual(["ligthhouse", "lig"]);
    expect(searchVariants("  ")).toEqual([]);
  });
});

describe("searchLibrary", () => {
  it("merges the looser searches and ranks by what was typed", async () => {
    const results: Record<string, SearchResult> = {
      petalina: { artist: [], album: [], song: [] },
      pet: {
        artist: [{ id: "p", name: "Petallina" }],
        album: [{ id: "a1", name: "Paper Gardens", artist: "Petallina" }],
        song: [
          { id: "s1", title: "Embers", artist: "Petallina" },
          { id: "s2", title: "Petrichor", artist: "Someone" },
        ],
      },
    };
    const client = {
      search: jest.fn(async (q: string) => results[q] ?? { artist: [], album: [], song: [] }),
    } as unknown as NavidromeClient;

    const out = await searchLibrary(client, "petalina", [{ id: "x", name: "Petrol" }]);
    expect(out.artist.map((a) => a.name)).toEqual(["Petallina"]);
    expect(out.album.map((a) => a.name)).toEqual(["Paper Gardens"]);
    expect(out.song.map((s) => s.title)).toEqual(["Embers"]);
  });

  it("still finds artists from the local list when the server finds nothing", async () => {
    const client = {
      search: jest.fn(async () => {
        throw new Error("down");
      }),
    } as unknown as NavidromeClient;
    const out = await searchLibrary(client, "ligthhouse", [
      { id: "l", name: "Lighthouse" },
      { id: "v", name: "Velvet Orchid" },
    ]);
    expect(out.artist.map((a) => a.name)).toEqual(["Lighthouse"]);
  });
});
