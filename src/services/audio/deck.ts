// One playback deck: an <audio> element plus what the engine needs to know
// about the stream loaded into it.
//
// Loudness is set on the element's own volume (volume × ReplayGain × fade),
// which keeps working whether or not the equaliser's Web Audio graph is
// attached, and needs no CORS for plain playback.

export interface DeckTrack {
  url: string;
  // Volume levelling for this track, in dB (0 = off), and its peak (1 when
  // unknown), so a boost never pushes it past full scale.
  replayGainDb: number;
  peak: number;
  // Seconds into the track the stream begins at, when the server started it
  // part-way (a seek on a transcode).
  startOffset?: number;
  // False for a live transcode, which can't be scrubbed in place.
  canSeek?: boolean;
  // Length from the track's metadata, for streams that can't report their own.
  duration?: number;
}

// The element surface the deck relies on. Narrow so tests can provide a fake.
export type MediaElement = Pick<
  HTMLAudioElement,
  | "src"
  | "preload"
  | "volume"
  | "currentTime"
  | "duration"
  | "paused"
  | "seekable"
  | "error"
  | "crossOrigin"
  | "play"
  | "pause"
  | "load"
  | "removeAttribute"
  | "addEventListener"
  | "removeEventListener"
>;

// ReplayGain dB → a volume multiplier, held down so the peak stays ≤ 1.
// Values outside ±12 dB are tag errors, not intentions.
export function levelFor(db: number, peak: number): number {
  if (!Number.isFinite(db) || db === 0) return 1;
  const gain = 10 ** (Math.max(-12, Math.min(12, db)) / 20);
  return peak > 0 ? Math.min(gain, 1 / peak) : gain;
}

export class Deck {
  url: string | null = null;
  offset = 0;
  scrubbable = true;
  knownLength = 0;
  level = 1;

  constructor(readonly el: MediaElement) {
    el.preload = "auto";
  }

  get loaded(): boolean {
    return this.url !== null;
  }

  // Position in the track, counting any server-side start offset.
  get position(): number {
    return this.el.currentTime + this.offset;
  }

  // The best length available: an exact file reports its own; a live
  // transcode reports Infinity or a guess that drifts, so metadata wins there.
  get length(): number {
    const own = Number.isFinite(this.el.duration) ? this.el.duration : 0;
    return this.scrubbable ? own || this.knownLength : this.knownLength || own;
  }

  // Note what's about to play, without touching the element.
  describe(track: DeckTrack): void {
    this.url = track.url;
    this.offset = track.startOffset ?? 0;
    this.scrubbable = track.canSeek !== false;
    this.knownLength = track.duration ?? 0;
    this.level = levelFor(track.replayGainDb, track.peak);
  }

  // Point the element at the track and start buffering it.
  load(track: DeckTrack): void {
    this.describe(track);
    this.el.src = track.url;
    this.el.load();
  }

  // Back to the start, when the element allows it yet (assigning currentTime
  // before metadata throws in some browsers; a fresh stream starts at 0 anyway).
  rewind(): void {
    if (this.el.currentTime === 0 || this.el.seekable.length === 0) return;
    try {
      this.el.currentTime = 0;
    } catch {
      // Not seekable yet.
    }
  }

  setVolume(value: number): void {
    this.el.volume = Math.min(1, Math.max(0, value));
  }

  unload(): void {
    this.el.pause();
    this.el.removeAttribute("src");
    this.el.load();
    this.url = null;
    this.offset = 0;
    this.scrubbable = true;
    this.knownLength = 0;
    this.level = 1;
  }

  // Switch the element to CORS mode (the equaliser needs readable samples)
  // and reload what it had, at the same position and play state.
  enableCors(): void {
    if (this.el.crossOrigin === "anonymous") return;
    this.el.crossOrigin = "anonymous";
    if (!this.url) return;
    const resumeAt = this.el.currentTime;
    const wasPlaying = !this.el.paused;
    this.el.src = this.url;
    this.el.load();
    if (resumeAt > 0) {
      const seekBack = () => {
        this.el.removeEventListener("loadedmetadata", seekBack);
        try {
          this.el.currentTime = resumeAt;
        } catch {
          // Not seekable after all; it plays from the start.
        }
      };
      this.el.addEventListener("loadedmetadata", seekBack);
    }
    if (wasPlaying) void this.el.play();
  }
}
