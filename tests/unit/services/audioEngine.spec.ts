// The playback engine with fake audio elements, so timing can be driven by
// hand: gapless hand-over, levels, crossfade and seeking.
import { AudioEngine, type EngineCallbacks } from "@/services/audioEngine";
import { levelFor, type MediaElement } from "@/services/audio/deck";

class FakeAudio extends EventTarget {
  src = "";
  preload = "";
  volume = 1;
  currentTime = 0;
  duration = NaN;
  paused = true;
  error: MediaError | null = null;
  crossOrigin: string | null = null;
  seekable = { length: 1 } as TimeRanges;
  loads = 0;
  async play() {
    this.paused = false;
    this.dispatchEvent(new Event("playing"));
  }
  pause() {
    if (this.paused) return;
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  }
  load() {
    this.loads++;
    this.currentTime = 0;
  }
  removeAttribute(name: string) {
    if (name === "src") this.src = "";
  }
}

function setup() {
  const els: FakeAudio[] = [];
  const cb: { [K in keyof EngineCallbacks]: jest.Mock } = {
    onProgress: jest.fn(),
    onEnded: jest.fn(),
    onPlayingChange: jest.fn(),
    onCrossfadeStart: jest.fn(),
    onError: jest.fn(),
    onSeekUnsupported: jest.fn(),
  };
  const engine = new AudioEngine(cb, () => {
    const el = new FakeAudio();
    els.push(el);
    return el as unknown as MediaElement;
  });
  return { engine, cb, els };
}

const track = (url: string, extra = {}) => ({ url, replayGainDb: 0, peak: 1, ...extra });

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(globalThis, "requestAnimationFrame").mockImplementation(() => 1);
  jest.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("levelFor", () => {
  it("turns ReplayGain into a volume multiplier that never clips", () => {
    expect(levelFor(0, 1)).toBe(1);
    expect(levelFor(-6, 1)).toBeCloseTo(0.501, 3);
    expect(levelFor(6, 0.9)).toBeCloseTo(1 / 0.9, 5);
    expect(levelFor(40, 0)).toBeCloseTo(10 ** (12 / 20), 5);
    expect(levelFor(NaN, 1)).toBe(1);
  });
});

describe("AudioEngine", () => {
  it("plays a track at volume × ReplayGain and reports it", async () => {
    const { engine, cb, els } = setup();
    engine.setVolume(0.5);
    await engine.play(track("a", { replayGainDb: -6 }));
    expect(els[0]!.src).toBe("a");
    expect(els[0]!.volume).toBeCloseTo(0.5 * 0.501, 3);
    expect(cb.onPlayingChange).toHaveBeenLastCalledWith(true);
    engine.setMuted(true);
    expect(els[0]!.volume).toBe(0);
  });

  it("switches to the buffered deck for the next track instead of reloading", async () => {
    const { engine, els } = setup();
    await engine.play(track("a"));
    engine.prepareNext(track("b"));
    expect(els[1]!.src).toBe("b");
    const loadsBefore = els[1]!.loads;
    await engine.play(track("b"));
    expect(els[1]!.loads).toBe(loadsBefore);
    expect(els[1]!.paused).toBe(false);
    expect(els[0]!.paused).toBe(true);
  });

  it("reloads when the same track is played again", async () => {
    const { engine, els } = setup();
    await engine.play(track("a"));
    await engine.play(track("a"));
    expect(els[0]!.loads).toBe(2);
  });

  it("only reports the end of the deck that's playing", async () => {
    const { engine, cb, els } = setup();
    await engine.play(track("a"));
    engine.prepareNext(track("b"));
    els[1]!.dispatchEvent(new Event("ended"));
    expect(cb.onEnded).not.toHaveBeenCalled();
    els[0]!.dispatchEvent(new Event("ended"));
    expect(cb.onEnded).toHaveBeenCalledTimes(1);
  });

  it("crossfades into the next track over the set time", async () => {
    const { engine, cb, els } = setup();
    engine.setCrossfade(4);
    engine.setVolume(1);
    await engine.play(track("a"));
    engine.prepareNext(track("b"));
    els[0]!.duration = 200;

    els[0]!.currentTime = 190;
    engine.onTick(0);
    expect(cb.onCrossfadeStart).not.toHaveBeenCalled();

    els[0]!.currentTime = 196.5;
    engine.onTick(1000);
    expect(cb.onCrossfadeStart).toHaveBeenCalledTimes(1);
    expect(els[1]!.paused).toBe(false);
    expect(els[1]!.volume).toBe(0);

    engine.onTick(3000); // halfway
    expect(els[1]!.volume).toBeCloseTo(0.5);
    expect(els[0]!.volume).toBeCloseTo(0.5);
    // The outgoing deck pausing mid-fade is not a pause of playback.
    expect(cb.onPlayingChange).not.toHaveBeenLastCalledWith(false);

    jest.advanceTimersByTime(4100);
    expect(els[0]!.paused).toBe(true);
    expect(els[1]!.volume).toBe(1);
    expect(engine.hasActiveTrack()).toBe(true);
  });

  it("buffers the track after next only once the fade is over, so every change fades", async () => {
    const { engine, cb, els } = setup();
    engine.setCrossfade(4);
    engine.setVolume(1);
    await engine.play(track("a"));
    engine.prepareNext(track("b"));
    els[0]!.duration = 200;
    els[0]!.currentTime = 197;
    engine.onTick(0);
    expect(cb.onCrossfadeStart).toHaveBeenCalledTimes(1);

    // The player asks for the next track as soon as the fade begins.
    engine.prepareNext(track("c"));
    expect(els[0]!.src).toBe("a");
    expect(els[0]!.paused).toBe(false);

    jest.advanceTimersByTime(4100);
    expect(els[0]!.src).toBe("c");

    // And b → c crossfades too.
    els[1]!.duration = 200;
    els[1]!.currentTime = 197;
    engine.onTick(10_000);
    expect(cb.onCrossfadeStart).toHaveBeenCalledTimes(2);
    expect(els[0]!.paused).toBe(false);
  });

  it("keeps a track picked mid-fade playing when the fade's timer runs out", async () => {
    const { engine, cb, els } = setup();
    engine.setCrossfade(4);
    engine.setVolume(1);
    await engine.play(track("a"));
    engine.prepareNext(track("b"));
    els[0]!.duration = 200;
    els[0]!.currentTime = 197;
    engine.onTick(0);

    // Previous, a second into the fade: back to a, on the deck that was fading out.
    await engine.play(track("a"));
    expect(els[0]!.paused).toBe(false);
    expect(els[1]!.paused).toBe(true);

    jest.advanceTimersByTime(4100);
    expect(els[0]!.paused).toBe(false);
    expect(els[0]!.volume).toBe(1);
    expect(engine.hasActiveTrack()).toBe(true);
    expect(cb.onPlayingChange).toHaveBeenLastCalledWith(true);
  });

  it("doesn't crossfade without a next track, or with crossfade off", async () => {
    const { engine, cb, els } = setup();
    engine.setCrossfade(4);
    await engine.play(track("a"));
    els[0]!.duration = 200;
    els[0]!.currentTime = 199;
    engine.onTick(0);
    engine.setCrossfade(0);
    engine.prepareNext(track("b"));
    engine.onTick(1);
    expect(cb.onCrossfadeStart).not.toHaveBeenCalled();
  });

  it("asks the player to reopen a live transcode instead of scrubbing it", async () => {
    const { engine, cb, els } = setup();
    await engine.play(track("t", { canSeek: false, startOffset: 30, duration: 300 }));
    engine.seek(90);
    expect(cb.onSeekUnsupported).toHaveBeenCalledWith(90);

    await engine.play(track("f", { startOffset: 30 }));
    els[0]!.duration = 200;
    engine.seek(90);
    expect(els[0]!.currentTime).toBe(60);
    expect(engine.getCurrentTime()).toBe(90);
  });

  it("uses the metadata length for a transcode, the file's own otherwise", async () => {
    const { engine, cb, els } = setup();
    await engine.play(track("t", { canSeek: false, duration: 245 }));
    els[0]!.duration = Infinity;
    engine.onTick(0);
    expect(cb.onProgress).toHaveBeenLastCalledWith(0, 245);
    await engine.play(track("f", { duration: 245 }));
    els[0]!.duration = 244.6;
    engine.onTick(0);
    expect(cb.onProgress).toHaveBeenLastCalledWith(0, 244.6);
  });

  it("reports a stream the element refuses, but not one being unloaded", async () => {
    const { engine, cb, els } = setup();
    await engine.play(track("a"));
    els[0]!.error = { code: 4 } as MediaError;
    els[0]!.dispatchEvent(new Event("error"));
    expect(cb.onError).toHaveBeenCalledWith(4);
    engine.stop();
    els[0]!.dispatchEvent(new Event("error"));
    expect(cb.onError).toHaveBeenCalledTimes(1);
    expect(engine.hasActiveTrack()).toBe(false);
  });
});
