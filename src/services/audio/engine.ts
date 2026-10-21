// Playback engine: two decks, so the next track can buffer while this one
// plays (gapless) and both can sound at once for a crossfade.
//
// The player store tells it what to play and gets told what happens; it knows
// nothing about queues. Volume, crossfade and ReplayGain work on each element's
// own volume, so plain playback needs no Web Audio and no CORS. Only the
// equaliser does: switching it on puts the elements into CORS mode, which works
// when streams come from the same origin (the bundled server) or the music
// server sends CORS headers.

import { Deck, type DeckTrack, type MediaElement } from "./deck";
import { Equalizer, equalizerSupported, type EqualizerState } from "./equalizer";

export interface EngineCallbacks {
  onProgress: (time: number, duration: number) => void;
  onEnded: () => void;
  onPlayingChange: (playing: boolean) => void;
  // A crossfade began: the next track is now the one playing.
  onCrossfadeStart: () => void;
  // The element couldn't play the stream (MediaError code). The player decides
  // whether to retry as a transcode or move on.
  onError: (code: number | undefined) => void;
  // A seek was asked of a stream that can't be scrubbed; the player reopens
  // the stream at `time` instead.
  onSeekUnsupported: (time: number) => void;
}

const MAX_CROSSFADE_S = 12;
// After a crossfade, the outgoing deck is stopped a little after it reached
// silence, so the last frame of the ramp is never cut short.
const FADE_TAIL_MS = 100;
const MIN_SLEEP_FADE_MS = 200;

export class AudioEngine {
  private readonly decks: [Deck, Deck];
  private current = 0;
  private volume = 0.8;
  private muted = false;
  private crossfadeMs = 0;
  // Set while a crossfade is under way: when it began, and the timer that
  // stops the outgoing deck once it's silent.
  private fadeStartedAt: number | null = null;
  private fadeTimer: ReturnType<typeof setTimeout> | null = null;
  // The next track asked for mid-fade, while the spare deck is still the
  // outgoing one: it loads once the fade is over (null: nothing is next).
  private nextAfterFade: DeckTrack | null | undefined;
  private frame = 0;
  private readonly eq = new Equalizer();

  constructor(
    private readonly cb: EngineCallbacks,
    makeElement: () => MediaElement = () => new Audio(),
  ) {
    this.decks = [new Deck(makeElement()), new Deck(makeElement())];
    this.decks.forEach((deck) => this.listen(deck));
  }

  private get live(): Deck {
    return this.decks[this.current];
  }

  private get spare(): Deck {
    return this.decks[1 - this.current];
  }

  private get fading(): boolean {
    return this.fadeStartedAt !== null;
  }

  private listen(deck: Deck): void {
    const isLive = () => deck === this.live;
    deck.el.addEventListener("playing", () => {
      if (!isLive()) return;
      this.cb.onPlayingChange(true);
      this.startTicking();
    });
    deck.el.addEventListener("pause", () => {
      // The outgoing deck pausing at the end of a crossfade is not a pause.
      if (!isLive() || this.fading) return;
      this.cb.onPlayingChange(false);
      this.stopTicking();
    });
    deck.el.addEventListener("ended", () => {
      if (isLive() && !this.fading) this.cb.onEnded();
    });
    deck.el.addEventListener("error", () => {
      // Unloading a deck can raise an error on it; only a deck that's meant
      // to be playing something counts.
      if (!isLive() || !deck.loaded) return;
      this.cb.onPlayingChange(false);
      this.stopTicking();
      this.cb.onError(deck.el.error?.code);
    });
  }

  // ---- Levels ----

  // `fade` is the crossfade envelope, 0..1.
  private applyLevel(deck: Deck, fade = 1): void {
    deck.setVolume(this.muted ? 0 : this.volume * deck.level * fade);
  }

  setVolume(value: number): void {
    this.volume = Math.min(1, Math.max(0, value));
    if (!this.fading) this.applyLevel(this.live);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.decks.forEach((deck) => this.applyLevel(deck));
  }

  setCrossfade(seconds: number): void {
    this.crossfadeMs = Math.min(MAX_CROSSFADE_S, Math.max(0, seconds)) * 1000;
  }

  // ---- Equaliser ----

  isEqualizerAvailable(): boolean {
    return equalizerSupported();
  }

  // Returns false when the equaliser was asked for but couldn't be started.
  setEqualizer(state: EqualizerState): boolean {
    if (state.enabled && !this.eq.built) {
      this.decks.forEach((deck) => deck.enableCors());
      if (!this.eq.build(this.decks.map((deck) => deck.el as HTMLMediaElement))) return false;
    }
    this.eq.set(state);
    return true;
  }

  // ---- Transport ----

  // Buffer the track expected to play next (null: nothing is).
  prepareNext(track: DeckTrack | null): void {
    if (this.fading) {
      // The spare deck is still sounding the fade's tail; loading it now
      // would cut the fade off.
      this.nextAfterFade = track;
      return;
    }
    if (!track) {
      this.spare.url = null;
      return;
    }
    if (this.spare.url !== track.url) this.spare.load(track);
  }

  async play(track: DeckTrack): Promise<void> {
    this.cancelFade();
    this.eq.wake();

    if (this.spare.url === track.url) {
      // It's the one already buffering: switch to it.
      this.current = 1 - this.current;
      this.live.describe(track);
    } else {
      // Always reload, even for the same URL: replaying a track needs a fresh
      // stream, not one that has already run to its end.
      this.live.load(track);
    }
    this.spare.el.pause();
    this.applyLevel(this.live);
    this.live.rewind();

    try {
      await this.live.el.play();
    } catch (err) {
      console.warn("Playback could not start:", err);
      this.cb.onPlayingChange(false);
      this.stopTicking();
      throw err;
    }
  }

  resume(): void {
    if (!this.live.el.src) return;
    this.eq.wake();
    void this.live.el.play();
  }

  pause(): void {
    this.live.el.pause();
  }

  stop(): void {
    this.cancelFade();
    this.decks.forEach((deck) => deck.unload());
    this.cb.onPlayingChange(false);
    this.stopTicking();
  }

  // For the sleep timer: drift to silence, then pause, leaving the level
  // ready for the next play.
  fadeOutAndPause(seconds = 4): void {
    const deck = this.live;
    if (deck.el.paused) return;
    const from = deck.el.volume;
    const start = performance.now();
    const span = Math.max(MIN_SLEEP_FADE_MS, seconds * 1000);
    const step = () => {
      if (deck.el.paused) return; // someone pressed pause meanwhile
      const progress = Math.min(1, (performance.now() - start) / span);
      deck.setVolume(from * (1 - progress));
      if (progress < 1) {
        requestAnimationFrame(step);
        return;
      }
      deck.el.pause();
      this.applyLevel(deck);
    };
    requestAnimationFrame(step);
  }

  // `time` counts from the start of the track, whatever offset the stream has.
  seek(time: number): void {
    const target = Math.max(0, time);
    const deck = this.live;
    if (!deck.scrubbable) {
      this.cb.onSeekUnsupported(target);
      return;
    }
    if (!Number.isFinite(deck.el.duration)) return;
    deck.el.currentTime = Math.min(deck.el.duration, Math.max(0, target - deck.offset));
  }

  getCurrentTime(): number {
    return this.live.position;
  }

  isSeekable(): boolean {
    return this.live.scrubbable;
  }

  hasActiveTrack(): boolean {
    return this.live.loaded;
  }

  // ---- The clock: progress, crossfade timing ----

  private startTicking(): void {
    if (this.frame) return;
    const tick = () => {
      this.onTick(performance.now());
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  private stopTicking(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  // One frame: report the position, move a crossfade along, or start one.
  // Public for tests, which drive the clock by hand.
  onTick(now: number): void {
    const deck = this.live;
    const length = deck.length;
    this.cb.onProgress(deck.position, length);

    if (this.fadeStartedAt !== null && this.crossfadeMs > 0) {
      const t = Math.min(1, (now - this.fadeStartedAt) / this.crossfadeMs);
      this.applyLevel(this.live, t);
      this.applyLevel(this.spare, 1 - t);
      return;
    }

    const remainingMs = (length - deck.position) * 1000;
    if (
      this.crossfadeMs > 0 &&
      length > 0 &&
      this.spare.loaded &&
      remainingMs <= this.crossfadeMs
    ) {
      this.startCrossfade(now);
    }
  }

  private startCrossfade(now: number): void {
    const outgoing = this.live;
    const incoming = this.spare;
    incoming.rewind();
    this.applyLevel(incoming, 0);
    void incoming.el.play();

    this.fadeStartedAt = now;
    this.current = 1 - this.current;
    this.fadeTimer = setTimeout(() => this.finishFade(outgoing), this.crossfadeMs + FADE_TAIL_MS);
    this.cb.onCrossfadeStart();
  }

  private finishFade(outgoing: Deck): void {
    this.fadeTimer = null;
    this.fadeStartedAt = null;
    outgoing.el.pause();
    outgoing.url = null;
    this.applyLevel(this.live);
    const next = this.nextAfterFade;
    this.nextAfterFade = undefined;
    if (next !== undefined) this.prepareNext(next);
  }

  // A play or stop mid-fade takes over: the fade's timer must not later stop
  // a deck that's been given something else to do.
  private cancelFade(): void {
    if (this.fadeTimer) clearTimeout(this.fadeTimer);
    this.fadeTimer = null;
    this.fadeStartedAt = null;
    this.nextAfterFade = undefined;
  }
}
