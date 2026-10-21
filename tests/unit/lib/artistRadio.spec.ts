// Artist radio: what goes into the station and how it's mixed.
import { createPinia, setActivePinia } from "pinia";
import type { NavidromeClient } from "@/api/client";
import type { Song } from "@/api/types";
import {
  gatherArtistRadio,
  mixArtistRadio,
  type ArtistRadioPool,
  type ArtistStation,
} from "@/lib/artistRadio";
import { useSettingsStore } from "@/stores/settings";

const STATION: ArtistStation = { kind: "artist", id: "am", name: "Arctic Monkeys" };

const song = (id: string, artist: string, extra: Partial<Song> = {}) =>
  ({
    id,
    title: id,
    artist,
    artistId: artist === STATION.name ? STATION.id : undefined,
    ...extra,
  }) as Song;
const own = (n: number) => Array.from({ length: n }, (_, i) => song(`own${i}`, STATION.name));
const by = (artist: string, n: number) =>
  Array.from({ length: n }, (_, i) => song(`${artist}${i}`, artist));

// Deterministic: no jitter, so the sources' order is kept.
const NO_RANDOM = () => 0;

beforeEach(() => setActivePinia(createPinia()));

describe("mixArtistRadio", () => {
  const pool: ArtistRadioPool = {
    own: own(10),
    others: [...by("Strokes", 6), ...by("Kooks", 6), ...by("Libertines", 6)],
    sources: {},
  };

  it("opens with the artist, then one in three of theirs", () => {
    const batch = mixArtistRadio(pool, 12, { random: NO_RANDOM });
    expect(batch).toHaveLength(12);
    const isOwn = batch.map((s) => s.artist === STATION.name);
    expect(isOwn).toEqual([
      true,
      false,
      false,
      true,
      false,
      false,
      true,
      false,
      false,
      true,
      false,
      false,
    ]);
  });

  it("never plays the same artist twice in a row while there's a choice", () => {
    const batch = mixArtistRadio(pool, 25, { random: Math.random });
    for (let i = 1; i < batch.length; i++) {
      expect(batch[i]!.artist).not.toBe(batch[i - 1]!.artist);
    }
  });

  it("spreads the other artists instead of playing one out", () => {
    const batch = mixArtistRadio(pool, 9, { random: NO_RANDOM });
    const others = batch.filter((s) => s.artist !== STATION.name).map((s) => s.artist);
    expect(new Set(others)).toEqual(new Set(["Strokes", "Kooks", "Libertines"]));
  });

  it("continues the pattern on a top-up rather than restarting with the artist", () => {
    const batch = mixArtistRadio(pool, 3, { random: NO_RANDOM, opening: false });
    expect(batch.map((s) => s.artist === STATION.name)).toEqual([false, false, true]);
  });

  it("skips what's queued and saves what you just heard for last", () => {
    const queued = new Set(["own0", "Strokes0"]);
    const recent = new Set(["own1"]);
    const batch = mixArtistRadio(pool, 40, { random: NO_RANDOM, queued, recent });
    const ids = batch.map((s) => s.id);
    expect(ids).not.toContain("own0");
    expect(ids).not.toContain("Strokes0");
    const ownIds = batch.filter((s) => s.artist === STATION.name).map((s) => s.id);
    expect(ownIds.at(-1)).toBe("own1");
  });

  it("keeps going with whatever is left when one side runs out", () => {
    expect(mixArtistRadio({ own: own(2), others: [], sources: {} }, 5)).toHaveLength(2);
    const onlyOthers = mixArtistRadio({ own: [], others: by("Strokes", 3), sources: {} }, 5);
    expect(onlyOthers).toHaveLength(3);
  });

  it("applies Forgotten Gems to the discovery part only", () => {
    useSettingsStore().playback.forgottenGems = true;
    const worn = {
      ...pool,
      own: own(3).map((s) => ({ ...s, playCount: 50 })),
      others: [
        song("fresh", "Strokes", { playCount: 0 }),
        song("worn", "Kooks", { playCount: 50 }),
      ],
    };
    const ids = mixArtistRadio(worn, 10, { random: NO_RANDOM }).map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["own0", "own1", "own2", "fresh"]));
    expect(ids).not.toContain("worn");
  });
});

describe("gatherArtistRadio", () => {
  function client(over: Partial<Record<keyof NavidromeClient, unknown>> = {}) {
    const base = {
      getTopSongs: jest.fn(async (artist: string) =>
        artist === STATION.name ? own(15) : by(artist, 10),
      ),
      getSimilarSongs: jest.fn(async () => [...by("Mix", 3), song("selfmix", STATION.name)]),
      getArtistInfo: jest.fn(async () => ({
        similarArtist: [
          { id: "s", name: "Strokes" },
          { id: "k", name: "Kooks" },
        ],
      })),
      getArtist: jest.fn(async () => ({
        id: STATION.id,
        name: STATION.name,
        albums: [{ id: "al1" }],
      })),
      getAlbum: jest.fn(async () => ({
        id: "al1",
        song: own(20).map((s, i) => ({ ...s, id: `alb${i}`, playCount: i })),
      })),
      getSongsByGenre: jest.fn(async (g: string) => by(`genre-${g}`, 5)),
      ...over,
    };
    return base as unknown as NavidromeClient & typeof base;
  }

  it("uses the artist's top songs and similar artists, closest first, taking turns", async () => {
    const c = client();
    const pool = await gatherArtistRadio(c, STATION);
    expect(pool.own).toHaveLength(15);
    expect(pool.others.slice(0, 4).map((s) => s.artist)).toEqual([
      "Strokes",
      "Kooks",
      "Strokes",
      "Kooks",
    ]);
    // The artist's own songs never count as "similar".
    expect(pool.others.some((s) => s.artist === STATION.name)).toBe(false);
    expect(c.getArtist).not.toHaveBeenCalled();
    expect(c.getSongsByGenre).not.toHaveBeenCalled();
  });

  it("falls back to the artist's albums, most played first, without a top-songs list", async () => {
    const c = client({ getTopSongs: jest.fn(async () => []) });
    const pool = await gatherArtistRadio(c, STATION);
    expect(pool.own[0]?.id).toBe("alb19");
    expect(pool.sources.albums).toBe(20);
  });

  it("falls back to the artist's genres when nothing similar is known", async () => {
    const c = client({
      getTopSongs: jest.fn(async (artist: string) =>
        artist === STATION.name ? own(15).map((s) => ({ ...s, genre: "Indie Rock" })) : [],
      ),
      getSimilarSongs: jest.fn(async () => []),
      getArtistInfo: jest.fn(async () => ({})),
    });
    const pool = await gatherArtistRadio(c, STATION);
    expect(c.getSongsByGenre).toHaveBeenCalledWith("Indie Rock", 60);
    expect(pool.others.map((s) => s.artist)).toEqual(Array(5).fill("genre-Indie Rock"));
  });

  it("carries on when a source fails", async () => {
    const c = client({
      getArtistInfo: jest.fn(async () => {
        throw new Error("no agent");
      }),
    });
    const pool = await gatherArtistRadio(c, STATION);
    expect(pool.own).toHaveLength(15);
    expect(pool.others.map((s) => s.artist)).toContain("Mix");
  });
});
