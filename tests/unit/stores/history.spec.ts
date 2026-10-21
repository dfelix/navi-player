import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import type { Song } from "@/api/types";
import { saveCredentials } from "@/api/credentials";
import { useHistoryStore } from "@/stores/history";
import { useSessionStore } from "@/stores/session";

jest.mock("@/lib/env", () => ({ NAVIDROME_URL_ENV: "http://navidrome.test" }));

const song = (id: string) => ({ id, title: id, artist: "A", duration: 100 }) as Song;

function signIn(username: string) {
  saveCredentials({
    serverUrl: "http://navidrome.test",
    username,
    authMethod: "subsonic",
    subsonicSalt: "s",
    subsonicToken: "t",
    savedAt: 0,
  });
  useSessionStore().init(false);
}

describe("history store", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("records plays newest-first and ignores a quick replay of the same track", async () => {
    signIn("alice");
    const history = useHistoryStore();
    await nextTick();
    history.record(song("a"));
    history.record(song("a"));
    history.record(song("b"));
    expect(history.entries.map((e) => e.id)).toEqual(["b", "a"]);
    expect(history.recentlyPlayedIds()).toEqual(new Set(["b", "a"]));
  });

  it("keeps a separate log per account", async () => {
    signIn("alice");
    useHistoryStore().record(song("a"));

    setActivePinia(createPinia());
    signIn("bob");
    const bobs = useHistoryStore();
    await nextTick();
    expect(bobs.entries).toEqual([]);
  });

  it("counts the most played tracks in a window", () => {
    signIn("alice");
    const history = useHistoryStore();
    const now = Date.now();
    history.entries = [
      { id: "a", title: "a", playedAt: now - 1000 },
      { id: "b", title: "b", playedAt: now - 2000 },
      { id: "a", title: "a", playedAt: now - 3000 },
    ];
    expect(history.top(60_000).map((t) => [t.entry.id, t.plays])).toEqual([
      ["a", 2],
      ["b", 1],
    ]);
  });

  it("clears the log", () => {
    signIn("alice");
    const history = useHistoryStore();
    history.record(song("a"));
    history.clear();
    expect(history.entries).toEqual([]);
    expect(localStorage.getItem("navi-player:history:alice")).toBeNull();
  });
});
