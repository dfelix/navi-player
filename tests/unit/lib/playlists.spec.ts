// Telling your playlists from other people's public ones.
import type { Playlist } from "@/api/types";
import { ownsPlaylist, splitPlaylists } from "@/lib/playlists";

const pl = (id: string, owner?: string, isPublic = false) =>
  ({ id, name: id, owner, public: isPublic, songCount: 0, duration: 0 }) as Playlist;

describe("ownsPlaylist", () => {
  it("is yours when you own it, or when there's no owner to compare", () => {
    expect(ownsPlaylist(pl("a", "alice"), "alice")).toBe(true);
    expect(ownsPlaylist(pl("a", "bob"), "alice")).toBe(false);
    expect(ownsPlaylist(pl("a"), "alice")).toBe(true);
    expect(ownsPlaylist(pl("a", "bob"), undefined)).toBe(true);
  });
});

describe("splitPlaylists", () => {
  it("keeps all of yours, and only the public ones of others", () => {
    const { mine, others } = splitPlaylists(
      [
        pl("mine-private", "alice"),
        pl("mine-public", "alice", true),
        pl("bob-public", "bob", true),
        pl("bob-private", "bob"),
      ],
      "alice",
    );
    expect(mine.map((p) => p.id)).toEqual(["mine-private", "mine-public"]);
    expect(others.map((p) => p.id)).toEqual(["bob-public"]);
  });
});
