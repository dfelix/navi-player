// Infinite radio's candidate pool.
import { createPinia, setActivePinia } from "pinia";
import type { NavidromeClient } from "@/api/client";
import type { Song } from "@/api/types";
import { buildRadioBatch, gatherRadioCandidates } from "@/lib/radio";

const s = (id: string, extra: Partial<Song> = {}) => ({ id, title: id, ...extra }) as Song;
const seed = s("seed", { artist: "Lighthouse", artistId: "lh", genre: "Rock; Alternative; Indie" });

function client(over: Record<string, jest.Mock> = {}) {
  const mocks = {
    getSimilarSongs: jest.fn(async () => [s("mix1"), s("mix2")]),
    getSongsByGenre: jest.fn(async (g: string) => [s(`g-${g}`, { genre: g })]),
    getTopSongs: jest.fn(async (name: string) => [s(`top-${name}`, { artist: name })]),
    getArtistInfo: jest.fn(async () => ({
      similarArtist: ["A", "B", "C", "D"].map((name) => ({ id: name, name })),
    })),
    ...over,
  };
  return Object.assign(mocks as unknown as NavidromeClient, { mocks });
}

beforeEach(() => setActivePinia(createPinia()));

describe("gatherRadioCandidates", () => {
  it("pools every source, using the first two genres and three similar artists", async () => {
    const c = client();
    const { candidates, sources } = await gatherRadioCandidates(c, seed);
    expect(c.mocks.getSongsByGenre.mock.calls.map((call) => call[0])).toEqual([
      "Rock",
      "Alternative",
    ]);
    expect(c.mocks.getTopSongs.mock.calls.map((call) => call[0])).toEqual([
      "Lighthouse",
      "A",
      "B",
      "C",
    ]);
    expect(sources).toEqual({ serverMix: 2, genre: 2, artist: 1, similarArtists: 3 });
    expect(candidates).toHaveLength(8);
  });

  it("carries on when sources fail", async () => {
    const c = client({
      getSimilarSongs: jest.fn(async () => {
        throw new Error("down");
      }),
      getArtistInfo: jest.fn(async () => {
        throw new Error("no agent");
      }),
    });
    const { sources } = await gatherRadioCandidates(c, seed);
    expect(sources).toEqual({ serverMix: 0, genre: 2, artist: 1, similarArtists: 0 });
  });
});

describe("buildRadioBatch", () => {
  it("ranks the pool down to the batch size", async () => {
    const batch = await buildRadioBatch(client(), seed, 3, new Set());
    expect(batch).toHaveLength(3);
    expect(batch.map((x) => x.id)).not.toContain("seed");
  });
});
