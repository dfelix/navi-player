// Pure helpers behind the History, Recap and Stats pages.
import type { Album } from "@/api/types";
import { fadeBackdrop, glowLayers } from "@/lib/artColours";
import { slugify } from "@/lib/slug";
import { DAY_MS, dayLabel, groupByDay, historyEntryToSong } from "@/lib/history";
import { topArtistsFromAlbums } from "@/lib/recap";
import { libraryCards, listeningCards, localListening } from "@/lib/stats";

describe("history helpers", () => {
  const now = new Date(2026, 9, 15, 12, 0);
  const at = (daysAgo: number, hour = 10) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, hour).getTime();

  it("labels today and yesterday", () => {
    expect(dayLabel(at(0), now)).toBe("Today");
    expect(dayLabel(at(1), now)).toBe("Yesterday");
    expect(dayLabel(at(5), now)).not.toMatch(/Today|Yesterday/);
  });

  it("groups consecutive entries by day", () => {
    const entries = [at(0, 11), at(0, 9), at(1), at(3)].map((playedAt, i) => ({
      id: `${i}`,
      title: "t",
      playedAt,
    }));
    expect(groupByDay(entries, now).map((g) => [g.label, g.entries.length])).toEqual([
      ["Today", 2],
      ["Yesterday", 1],
      [dayLabel(at(3), now), 1],
    ]);
  });

  it("widens an entry back into a playable song", () => {
    expect(historyEntryToSong({ id: "x", title: "X", playedAt: 0 })).toMatchObject({
      id: "x",
      title: "X",
      duration: 0,
    });
    expect(DAY_MS).toBe(86_400_000);
  });
});

describe("recap", () => {
  it("ranks artists by summing their albums' plays", () => {
    const albums = [
      { id: "1", name: "a", artist: "Alpha", artistId: "al", playCount: 5 },
      { id: "2", name: "b", artist: "Beta", artistId: "be", playCount: 7 },
      { id: "3", name: "c", artist: "Alpha", artistId: "al", playCount: 4 },
    ] as Album[];
    expect(topArtistsFromAlbums(albums).map((a) => [a.name, a.plays])).toEqual([
      ["Alpha", 9],
      ["Beta", 7],
    ]);
  });
});

describe("stats cards", () => {
  it("shows the library size only when the server reported it", () => {
    expect(
      libraryCards({ artistCount: 1, albumCount: 2, songCount: 3 }).map((c) => c.label),
    ).toEqual(["Artists", "Albums", "Songs"]);
    expect(
      libraryCards({ artistCount: 1, albumCount: 2, songCount: 3, totalSize: 2048 }).at(-1),
    ).toMatchObject({
      label: "Total size",
      value: "2.0 KB",
    });
  });

  it("leaves out figures the server didn't provide, never showing zeroes", () => {
    expect(listeningCards({ favoriteSongs: 4, favoriteAlbums: 1 }).map((c) => c.label)).toEqual([
      "Favourites",
    ]);
    expect(listeningCards(undefined)).toEqual([]);
  });

  it("relates tracks played to the library size", () => {
    const card = listeningCards({ tracksPlayed: 25 }, 100).find(
      (c) => c.label === "Different songs",
    );
    expect(card?.hint).toBe("25% of the library");
  });

  it("summarises the local log", () => {
    expect(localListening([])).toBeNull();
    expect(
      localListening([
        { id: "a", title: "a", artist: "X", duration: 60, playedAt: 2 },
        { id: "a", title: "a", artist: "X", duration: 60, playedAt: 1 },
      ]),
    ).toMatchObject({ plays: 2, tracks: 1, artists: 1, seconds: 120 });
  });
});

describe("cover palette", () => {
  it("slugs artist names for /listen URLs", () => {
    expect(slugify("Sigur Rós")).toBe("sigur-ros");
    expect(slugify("  AC/DC ")).toBe("ac-dc");
    expect(slugify("")).toBe("unknown");
  });

  it("builds backgrounds only when there are colours", () => {
    expect(fadeBackdrop([])).toBe("");
    expect(glowLayers([])).toBe("");
    expect(fadeBackdrop(["#ff0000", "#0000ff"])).toMatch(/^linear-gradient/);
    expect(glowLayers(["#ff0000"]).split("radial-gradient")).toHaveLength(4);
  });
});
