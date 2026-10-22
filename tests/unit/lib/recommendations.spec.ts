// Infinite radio's choices: which track to follow, and how candidates rank.
import { createPinia, setActivePinia } from "pinia";
import type { Song } from "@/api/types";
import {
  applyDiscoveryFilters,
  buildSurpriseQueue,
  pickRadioSeed,
  rankRadioCandidates,
  scoreCandidate,
} from "@/lib/recommendations";
import { useSettingsStore } from "@/stores/settings";

const track = (id: string, extra: Partial<Song> = {}) =>
  ({ id, title: id, artist: "Someone", duration: 200, ...extra }) as Song;
const ids = (songs: Song[]) => songs.map((s) => s.id);
const steady = { jitter: () => 0 };

beforeEach(() => setActivePinia(createPinia()));

describe("pickRadioSeed", () => {
  const chosen = (id: string) => track(id);
  const added = (id: string) => track(id, { autoQueued: true });
  const queue = [chosen("a"), chosen("b"), added("r1"), added("r2"), added("r3")];

  it("follows the last track you picked, however far radio has run on", () => {
    expect(pickRadioSeed(queue, 1)?.id).toBe("b");
    expect(pickRadioSeed(queue, 4)?.id).toBe("b");
  });

  it("uses what's playing when nothing left was picked by you", () => {
    expect(pickRadioSeed([added("x"), added("y")], 1)?.id).toBe("y");
    expect(pickRadioSeed([], -1)).toBeUndefined();
  });
});

describe("scoring and ranking", () => {
  const seed = track("seed", {
    artist: "Moth Choir",
    albumId: "lanterns",
    genre: "Indie Rock",
    year: 1989,
  });

  it("ranks shared genres first", () => {
    const pool = [
      track("pop", { genre: "Pop", year: 2015, artist: "X" }),
      track("indie", { genre: "Indie Rock; Alternative", year: 1991, artist: "Y" }),
    ];
    expect(ids(rankRadioCandidates(seed, pool, 1, steady))).toEqual(["indie"]);
  });

  it("prefers another band in the genre to more of the same album", () => {
    const sameAlbum = track("same", {
      artist: "Moth Choir",
      albumId: "lanterns",
      genre: "Indie Rock",
      year: 1989,
    });
    const otherBand = track("other", { artist: "Paper Cranes", genre: "Indie Rock", year: 1990 });
    expect(scoreCandidate(seed, otherBand, steady)).toBeGreaterThan(
      scoreCandidate(seed, sameAlbum, steady),
    );
  });

  it("never offers the seed back", () => {
    expect(scoreCandidate(seed, seed, steady)).toBe(-Infinity);
    expect(ids(rankRadioCandidates(seed, [seed, track("z")], 5, steady))).toEqual(["z"]);
  });

  it("puts excluded tracks last rather than dropping them", () => {
    const pool = [track("heard", { genre: "Indie Rock" }), track("new", { genre: "Pop" })];
    const ranked = rankRadioCandidates(seed, pool, 2, { ...steady, exclude: new Set(["heard"]) });
    expect(ids(ranked)).toEqual(["new", "heard"]);
  });

  it("spreads a batch across artists before repeating one", () => {
    const pool = [
      ...Array.from({ length: 9 }, (_, n) =>
        track(`big${n}`, { artist: "Big", genre: "Indie Rock" }),
      ),
      track("small1", { artist: "Small One" }),
      track("small2", { artist: "Small Two" }),
    ];
    const batch = rankRadioCandidates(seed, pool, 6, { ...steady, maxPerArtist: 2 });
    expect(batch).toHaveLength(6);
    expect(ids(batch)).toEqual(expect.arrayContaining(["small1", "small2"]));
    expect(batch.filter((s) => s.artist === "Big")).toHaveLength(4);
  });

  it("returns what there is when the pool is small", () => {
    expect(rankRadioCandidates(seed, [track("only")], 10, steady)).toHaveLength(1);
  });
});

describe("Forgotten Gems", () => {
  it("drops much-played tracks only when switched on", () => {
    const songs = [track("new", { playCount: 0 }), track("worn", { playCount: 9 })];
    expect(ids(applyDiscoveryFilters(songs))).toEqual(["new", "worn"]);
    useSettingsStore().playback.forgottenGems = true;
    expect(ids(applyDiscoveryFilters(songs))).toEqual(["new"]);
  });
});

describe("buildSurpriseQueue", () => {
  it("starts with the seed and doesn't repeat it", () => {
    const queue = buildSurpriseQueue(track("s"), [track("a"), track("s"), track("b")]);
    expect(queue[0]!.id).toBe("s");
    expect(ids(queue).sort()).toEqual(["a", "b", "s"]);
  });

  it("never plays the same artist twice in a row", () => {
    // Navidrome's similar songs come grouped by artist.
    const by = (artist: string, n: number) =>
      Array.from({ length: n }, (_, i) => track(`${artist}${i}`, { artist }));
    const seed = track("seed", { artist: "A" });
    const similar = [...by("A", 3), ...by("B", 3), ...by("C", 3), ...by("D", 2)];
    for (let run = 0; run < 20; run++) {
      const artists = buildSurpriseQueue(seed, similar).map((s) => s.artist);
      expect(artists).toHaveLength(12);
      artists.slice(1).forEach((artist, i) => expect(artist).not.toBe(artists[i]));
    }
  });
});
