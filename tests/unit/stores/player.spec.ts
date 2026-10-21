// Queue behaviour of the player store, with a signed-in session so stream URLs
// are built and the queue is saved per account. Audio itself is inert in jsdom.
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import type { Song } from "@/api/types";
import { usePlayerStore } from "@/stores/player";
import { useSessionStore } from "@/stores/session";
import { useSettingsStore } from "@/stores/settings";
import { saveCredentials } from "@/api/credentials";
import { flushPromises } from "@vue/test-utils";
import { mockFetch, subsonicOk } from "../../helpers";

jest.mock("@/lib/env", () => ({ NAVIDROME_URL_ENV: "http://navidrome.test" }));

const song = (id: string, artist = "A") =>
  ({ id, title: id, artist, duration: 200, suffix: "mp3" }) as Song;
const ids = (list: Song[]) => list.map((s) => s.id);

function signIn(username = "alice") {
  saveCredentials({
    serverUrl: "http://navidrome.test",
    username,
    authMethod: "subsonic",
    subsonicSalt: "salt",
    subsonicToken: "token",
    savedAt: 0,
  });
  const session = useSessionStore();
  session.init(false);
  return session;
}

describe("player store", () => {
  let player: ReturnType<typeof usePlayerStore>;

  beforeEach(() => {
    setActivePinia(createPinia());
    // Scrobbles and radio lookups go nowhere.
    mockFetch(() => subsonicOk());
    signIn();
    player = usePlayerStore();
  });

  it("plays a list from the chosen track", () => {
    player.playNow([song("a"), song("b"), song("c")], 1);
    expect(ids(player.state.queue)).toEqual(["a", "b", "c"]);
    expect(player.state.index).toBe(1);
    expect(player.current?.id).toBe("b");
  });

  it("keeps the chosen track first when shuffling", () => {
    player.toggleShuffle();
    const list = Array.from({ length: 10 }, (_, i) => song(`s${i}`, `Artist ${i % 3}`));
    player.playNow(list, 4);
    expect(player.state.index).toBe(0);
    expect(player.current?.id).toBe("s4");
    expect(new Set(ids(player.state.queue)).size).toBe(10);
  });

  it("queues next and last", () => {
    player.playNow([song("a"), song("b")], 0);
    player.playNext([song("n")]);
    player.addToQueue([song("z")]);
    expect(ids(player.state.queue)).toEqual(["a", "n", "b", "z"]);
  });

  it("keeps pointing at the same track when the queue is reordered", () => {
    player.playNow([song("a"), song("b"), song("c"), song("d")], 2);
    player.moveInQueue(0, 3); // a moves after the current track
    expect(ids(player.state.queue)).toEqual(["b", "c", "d", "a"]);
    expect(player.current?.id).toBe("c");
    player.moveInQueue(2, 0); // the current track moves
    expect(player.current?.id).toBe("c");
  });

  it("removes tracks before the current one without changing what plays", () => {
    player.playNow([song("a"), song("b"), song("c")], 2);
    player.removeAt(0);
    expect(ids(player.state.queue)).toEqual(["b", "c"]);
    expect(player.current?.id).toBe("c");
  });

  it("cycles repeat off → all → one", () => {
    expect(player.state.repeat).toBe("off");
    player.cycleRepeat();
    expect(player.state.repeat).toBe("all");
    player.cycleRepeat();
    expect(player.state.repeat).toBe("one");
    player.cycleRepeat();
    expect(player.state.repeat).toBe("off");
  });

  it("clamps volume and unmutes when it changes", () => {
    player.toggleMute();
    player.setVolume(1.7);
    expect(player.state.volume).toBe(1);
    expect(player.state.muted).toBe(false);
    player.changeVolume(-2);
    expect(player.state.volume).toBe(0);
  });

  it("saves the queue per account and restores it on the next session", async () => {
    player.playNow([song("a"), song("b")], 1);
    expect(localStorage.getItem("navi-player:queue:alice")).toContain('"b"');

    setActivePinia(createPinia());
    mockFetch(() => subsonicOk());
    signIn();
    const restored = usePlayerStore();
    await nextTick();
    expect(ids(restored.state.queue)).toEqual(["a", "b"]);
    expect(restored.state.index).toBe(1);
    expect(restored.state.isPlaying).toBe(false);
  });

  it("doesn't hand one account's queue to another", async () => {
    player.playNow([song("a")], 0);

    setActivePinia(createPinia());
    mockFetch(() => subsonicOk());
    signIn("bob");
    const other = usePlayerStore();
    await nextTick();
    expect(other.state.queue).toEqual([]);
  });

  it("clears the queue when signing out", async () => {
    player.playNow([song("a")], 0);
    useSessionStore().logout();
    await nextTick();
    expect(player.state.queue).toEqual([]);
  });
});

// A library where Arctic Monkeys have plenty of songs and Last.fm knows four
// similar artists.
function artistRadioServer() {
  const SIMILAR = ["Strokes", "Kooks", "Libertines", "Blossoms"];
  const many = (artist: string, n: number, artistId?: string) =>
    Array.from({ length: n }, (_, i) => ({ ...song(`${artist}-${i}`, artist), artistId }));
  return mockFetch((url) => {
    const endpoint = url.pathname.split("/").pop();
    const p = url.searchParams;
    if (endpoint === "getTopSongs.view") {
      const artist = p.get("artist")!;
      const list = artist === "Arctic Monkeys" ? many(artist, 40, "am") : many(artist, 10);
      return subsonicOk({ topSongs: { song: list } });
    }
    if (endpoint === "getArtistInfo2.view") {
      return subsonicOk({
        artistInfo2: { similarArtist: SIMILAR.map((name) => ({ id: name, name })) },
      });
    }
    if (endpoint === "getSimilarSongs2.view") {
      return subsonicOk({ similarSongs2: { song: many("Mix", 30) } });
    }
    return subsonicOk();
  });
}

describe("artist radio", () => {
  let player: ReturnType<typeof usePlayerStore>;
  const AM = { id: "am", name: "Arctic Monkeys" };

  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    artistRadioServer();
    signIn();
    player = usePlayerStore();
  });

  it("starts a station that opens with the artist and mixes in similar artists", async () => {
    expect(await player.startArtistRadio(AM)).toBe(true);
    expect(player.station).toEqual({ kind: "artist", ...AM });
    expect(player.state.queue).toHaveLength(25);
    expect(player.current?.artist).toBe("Arctic Monkeys");
    const own = player.state.queue.filter((s) => s.artist === "Arctic Monkeys").length;
    expect(own).toBeGreaterThanOrEqual(8);
    expect(own).toBeLessThanOrEqual(10);
  });

  it("keeps the station topped up, even with Infinite radio off", async () => {
    useSettingsStore().playback.autoplay = false;
    await player.startArtistRadio(AM);
    for (let i = 0; i < 20; i++) player.next();
    await flushPromises();
    expect(player.state.queue.length).toBeGreaterThan(25);
    expect(new Set(ids(player.state.queue)).size).toBe(player.state.queue.length);
  });

  it("stays on the station when jumping within its queue, and ends it otherwise", async () => {
    await player.startArtistRadio(AM);
    player.playNow(player.state.queue, 3);
    expect(player.station?.name).toBe("Arctic Monkeys");
    player.playNow([song("x")], 0);
    expect(player.station).toBeNull();
  });

  it("can be stopped without losing the queue", async () => {
    await player.startArtistRadio(AM);
    player.stopStation();
    expect(player.station).toBeNull();
    expect(player.state.queue).toHaveLength(25);
  });

  it("is remembered with the queue", async () => {
    await player.startArtistRadio(AM);
    setActivePinia(createPinia());
    artistRadioServer();
    signIn();
    const restored = usePlayerStore();
    await nextTick();
    expect(restored.station).toEqual({ kind: "artist", ...AM });
  });

  it("leaves the queue alone when there's nothing to play", async () => {
    mockFetch(() => subsonicOk());
    player.playNow([song("a")], 0);
    expect(await player.startArtistRadio({ id: "x", name: "Nobody" })).toBe(false);
    expect(ids(player.state.queue)).toEqual(["a"]);
    expect(player.station).toBeNull();
  });
});
