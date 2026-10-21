// How the player store reacts to what the audio engine reports: failing
// streams, retries, signing in again, radio running out. The engine is a fake
// whose callbacks the tests fire by hand.
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import type { Song } from "@/api/types";
import { saveCredentials } from "@/api/credentials";
import type { EngineCallbacks } from "@/services/audioEngine";
import { usePlayerStore } from "@/stores/player";
import { useSessionStore } from "@/stores/session";
import { flushPromises } from "@vue/test-utils";
import { mockFetch, subsonicOk } from "../../helpers";

jest.mock("@/lib/env", () => ({ NAVIDROME_URL_ENV: "http://navidrome.test" }));

let engine: FakeEngine;
class FakeEngine {
  played: string[] = [];
  stopped = 0;
  constructor(readonly cb: EngineCallbacks) {}
  play = jest.fn(async (track: { url: string }) => {
    this.played.push(new URL(track.url).searchParams.get("id")!);
  });
  stop = jest.fn(() => {
    this.stopped++;
  });
  prepareNext = jest.fn();
  setVolume() {}
  setMuted() {}
  setCrossfade() {}
  setEqualizer() {
    return true;
  }
  isEqualizerAvailable() {
    return false;
  }
  getCurrentTime() {
    return 0;
  }
  isSeekable() {
    return true;
  }
  hasActiveTrack() {
    return true;
  }
  seek() {}
  pause() {}
  resume() {}
  fadeOutAndPause() {}
}
jest.mock("@/services/audioEngine", () => ({
  AudioEngine: jest.fn((cb: EngineCallbacks) => (engine = new FakeEngine(cb))),
}));

const song = (id: string) => ({ id, title: id, artist: id, duration: 200, suffix: "mp3" }) as Song;
const NETWORK_ERROR = 2;

function signIn(username = "alice") {
  saveCredentials({
    serverUrl: "http://navidrome.test",
    username,
    authMethod: "subsonic",
    subsonicSalt: "salt",
    subsonicToken: "token",
    savedAt: 0,
  });
  useSessionStore().init(false);
}

let scrobbles: URL[];
let player: ReturnType<typeof usePlayerStore>;

beforeEach(async () => {
  localStorage.clear();
  setActivePinia(createPinia());
  scrobbles = [];
  mockFetch((url) => {
    if (url.pathname.endsWith("/scrobble.view")) scrobbles.push(url);
    return subsonicOk();
  });
  signIn();
  player = usePlayerStore();
  await flushPromises();
  // Creating the store resets the engine once; count from here.
  engine.stopped = 0;
  engine.played = [];
});

describe("tracks that won't play", () => {
  it("skips one, and plays on once the next track works", async () => {
    player.playNow([song("a"), song("b"), song("c")]);
    await flushPromises();
    engine.cb.onError(NETWORK_ERROR);
    await flushPromises();
    expect(player.current?.id).toBe("b");
    engine.cb.onPlayingChange(true);
    expect(engine.stopped).toBe(0);
  });

  it("stops instead of cycling for ever when nothing in the queue plays", async () => {
    player.cycleRepeat(); // all
    player.playNow([song("a"), song("b"), song("c")]);
    await flushPromises();
    for (let i = 0; i < 10 && engine.stopped === 0; i++) {
      engine.cb.onError(NETWORK_ERROR);
      await flushPromises();
    }
    expect(engine.played).toEqual(["a", "b", "c"]);
    expect(engine.stopped).toBe(1);
  });

  it("gives up after a run of failures in a long queue", async () => {
    player.playNow(Array.from({ length: 20 }, (_, i) => song(`s${i}`)));
    await flushPromises();
    for (let i = 0; i < 20 && engine.stopped === 0; i++) {
      engine.cb.onError(NETWORK_ERROR);
      await flushPromises();
    }
    expect(engine.played).toHaveLength(5);
  });

  it("doesn't replay a failing track on repeat-one", async () => {
    player.cycleRepeat();
    player.cycleRepeat(); // one
    player.playNow([song("a"), song("b")]);
    await flushPromises();
    engine.cb.onError(NETWORK_ERROR);
    await flushPromises();
    expect(engine.played).toEqual(["a"]);
    expect(engine.stopped).toBe(1);
  });
});

describe("signing in again", () => {
  it("keeps the queue playing when the same account signs back in", async () => {
    player.playNow([song("a"), song("b"), song("c")], 1);
    player.addToQueue([song("d")]);
    await flushPromises();
    engine.prepareNext.mockClear();

    signIn(); // the session expired and alice entered her password again
    await nextTick();
    expect(engine.stopped).toBe(0);
    expect(player.state.queue.map((s) => s.id)).toEqual(["a", "b", "c", "d"]);
    expect(player.current?.id).toBe("b");
    // The next track is reloaded with the new sign-in.
    expect(engine.prepareNext).toHaveBeenCalledTimes(1);
  });

  it("still starts over for a different account", async () => {
    player.playNow([song("a")]);
    await flushPromises();
    signIn("bob");
    await nextTick();
    expect(engine.stopped).toBe(1);
    expect(player.state.queue).toEqual([]);
  });
});
