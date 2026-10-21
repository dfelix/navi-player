import type { Song } from "@/api/types";
import { replayGainFor, scrobbleThreshold } from "@/lib/playbackRules";
import { loadQueue, saveQueue } from "@/lib/savedQueue";

describe("scrobbleThreshold", () => {
  it("is half the track, but never more than four minutes", () => {
    expect(scrobbleThreshold(200)).toBe(100);
    expect(scrobbleThreshold(1200)).toBe(240);
  });
});

describe("replayGainFor", () => {
  const song = {
    id: "s",
    title: "s",
    replayGain: { trackGain: -7, albumGain: -5, trackPeak: 0.9, albumPeak: 0.95 },
  } as Song;

  it("uses the track or album values plus the pre-amp", () => {
    expect(replayGainFor(song, { mode: "track", preAmpDb: 2 })).toEqual({ db: -5, peak: 0.9 });
    expect(replayGainFor(song, { mode: "album", preAmpDb: 0 })).toEqual({ db: -5, peak: 0.95 });
  });

  it("does nothing when off or untagged", () => {
    expect(replayGainFor(song, { mode: "off", preAmpDb: 6 })).toEqual({ db: 0, peak: 1 });
    expect(replayGainFor({ id: "x", title: "x" }, { mode: "track", preAmpDb: 6 })).toEqual({
      db: 0,
      peak: 1,
    });
  });
});

describe("saved queue", () => {
  beforeEach(() => localStorage.clear());
  const songs = [
    { id: "a", title: "a" },
    { id: "b", title: "b" },
  ] as Song[];

  it("round-trips per account", () => {
    saveQueue("alice", { queue: songs, index: 1, time: 42, station: null });
    expect(loadQueue("alice")).toEqual({ queue: songs, index: 1, time: 42, station: null });
    expect(loadQueue("bob")).toBeNull();
  });

  it("repairs what it can and drops what it can't", () => {
    localStorage.setItem(
      "navi-player:queue:alice",
      JSON.stringify({ queue: songs, index: 9, time: -3, station: { kind: "genre", id: 1 } }),
    );
    expect(loadQueue("alice")).toEqual({ queue: songs, index: 1, time: 0, station: null });
    localStorage.setItem("navi-player:queue:alice", "{not json");
    expect(loadQueue("alice")).toBeNull();
    localStorage.setItem("navi-player:queue:alice", JSON.stringify({ queue: [] }));
    expect(loadQueue("alice")).toBeNull();
  });
});
