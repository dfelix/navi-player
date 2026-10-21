// What's playing: the queue, the position in it, transport controls, and the
// radio features that keep a queue going. It drives the audio engine and
// reports plays to Navidrome; the queue itself lives in the browser.

import { defineStore } from "pinia";
import { computed, reactive, ref, watch } from "vue";
import type { NavidromeClient } from "@/api/client";
import type { Song } from "@/api/types";
import { buildArtistRadioBatch, type ArtistStation } from "@/lib/artistRadio";
import { canPlayContainer } from "@/lib/codecs";
import { replayGainFor, scrobbleThreshold } from "@/lib/playbackRules";
import { buildRadioBatch } from "@/lib/radio";
import { pickRadioSeed } from "@/lib/recommendations";
import { loadQueue, saveQueue } from "@/lib/savedQueue";
import { shuffleSpreadingArtists } from "@/lib/shuffle";
import { AudioEngine, type DeckTrack } from "@/services/audioEngine";
import { useHistoryStore } from "./history";
import { useSessionStore } from "./session";
import { useSettingsStore } from "./settings";

// Whether the browser can play this file as it is. Anything else is asked
// for as an MP3 transcode.
export function isFormatSupported(song: Song): boolean {
  return canPlayContainer(song.contentType || song.suffix, song.codec);
}

export type RepeatMode = "off" | "all" | "one";
// null: off; "end": stop after this track; a number: the time (ms) to pause at.
export type SleepMode = null | "end" | number;

export interface PlayerState {
  queue: Song[];
  index: number; // -1 when nothing is loaded
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number; // 0..1
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
}

const REPEAT_ORDER: RepeatMode[] = ["off", "all", "one"];

const sameAccount = (a: NavidromeClient, b: NavidromeClient) =>
  a.serverUrl === b.serverUrl && a.username === b.username;

// Infinite radio adds a few tracks once the last one starts, so a short queue
// you built isn't buried in suggestions before you've heard it; a bigger batch
// when the queue has actually run out.
const RADIO = { topUpWhenLeft: 1, topUp: 5, refill: 10 };
// Artist radio is a station: a full run at the start, and always a few ahead.
const STATION = { start: 25, topUpWhenLeft: 5, topUp: 15 };

// "Previous" restarts the track when it's further in than this.
const RESTART_AFTER_S = 3;
// How often the position is saved while playing.
const SAVE_EVERY_MS = 4000;
// MediaError codes for "can't decode" and "format not supported".
const UNDECODABLE = new Set([3, 4]);
// A track that won't play is skipped. This many in a row (or every track in a
// shorter queue) means the server or the files are the problem, not one
// track: playback stops instead of cycling through the queue for ever.
const MAX_FAILED_IN_A_ROW = 5;

export const usePlayerStore = defineStore("player", () => {
  const session = useSessionStore();
  const settings = useSettingsStore();
  const history = useHistoryStore();

  const state = reactive<PlayerState>({
    queue: [],
    index: -1,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: settings.playback.defaultVolume / 100,
    muted: false,
    shuffle: false,
    repeat: "off",
  });
  const current = computed<Song | undefined>(() => state.queue[state.index]);
  const station = ref<ArtistStation | null>(null);
  const sleepMode = ref<SleepMode>(null);

  // Per-track bookkeeping.
  const track = {
    scrobbled: false, // the play has been reported
    retriedAsMp3: null as string | null, // id of a track already retried transcoded
    resumeAt: 0, // where to start the restored track on first play
    attempt: 0, // increases with each start; a slow start that's been overtaken gives up
  };
  // The next track, already loaded into the engine's spare deck.
  let buffered: { songId: string; deck: DeckTrack } | null = null;
  let lastSaved = 0;
  let fetchingMore = false;
  let failedInARow = 0;
  let sleepTimer: ReturnType<typeof setTimeout> | undefined;

  const engine = new AudioEngine({
    onProgress(time, duration) {
      state.currentTime = time;
      // Streams that can't tell their length report 0; keep the metadata's.
      if (duration > 0) state.duration = duration;
      reportPlayIfDue();
      if (performance.now() - lastSaved > SAVE_EVERY_MS) {
        lastSaved = performance.now();
        persist();
      }
    },
    onEnded: () => advance({ natural: true }),
    onPlayingChange(playing) {
      state.isPlaying = playing;
      if (playing) failedInARow = 0;
    },
    onCrossfadeStart: () => moveToNextWithoutLoading(),
    onError(code) {
      const song = current.value;
      if (!song) return;
      // The browser can't decode what the server sent: try once as MP3.
      if (code !== undefined && UNDECODABLE.has(code) && track.retriedAsMp3 !== song.id) {
        track.retriedAsMp3 = song.id;
        void start(state.index, { at: engine.getCurrentTime(), forceMp3: true });
        return;
      }
      skipFailed();
    },
    onSeekUnsupported(time) {
      // Reopen the stream at that point; it's the same play, not a new one.
      state.currentTime = time;
      void start(state.index, { at: time, samePlay: true });
    },
  });
  engine.setVolume(state.volume);
  syncCrossfade();
  syncEqualizer();

  function syncCrossfade(): void {
    engine.setCrossfade(settings.playback.crossfadeSeconds);
  }

  function syncEqualizer(): boolean {
    const { enabled, preampDb, gains } = settings.playback.equalizer;
    return engine.setEqualizer({ enabled, preampDb, gains });
  }

  // ---- Loading tracks ----

  function deckFor(song: Song, forceMp3 = false): DeckTrack {
    const client = session.client;
    if (!client) return { url: "", replayGainDb: 0, peak: 1 };
    const mp3 = forceMp3 || !isFormatSupported(song);
    const { db, peak } = replayGainFor(song, settings.playback.replayGain);
    return {
      url: client.streamUrl(
        song.id,
        settings.playback.maxBitRate || undefined,
        mp3 ? "mp3" : undefined,
      ),
      replayGainDb: db,
      peak,
      duration: song.duration,
    };
  }

  async function start(
    index: number,
    opts: { at?: number; forceMp3?: boolean; samePlay?: boolean } = {},
  ): Promise<void> {
    const song = state.queue[index];
    if (!song) return;
    const at = opts.at ?? 0;
    const attempt = ++track.attempt;

    // Show the new track straight away, from its metadata.
    state.index = index;
    state.currentTime = at;
    state.duration = song.duration ?? 0;
    if (!opts.samePlay) track.scrobbled = false;
    if (!opts.forceMp3) track.retriedAsMp3 = null;

    // The track that's been buffering: hand the engine that exact deck, so it
    // recognises it and keeps what's buffered.
    const reuse = !opts.forceMp3 && at === 0 && buffered?.songId === song.id ? buffered.deck : null;
    buffered = null;

    await engine.play(reuse ?? deckFor(song, opts.forceMp3));
    if (attempt !== track.attempt) return; // overtaken by a newer start

    if (at > 0 && engine.isSeekable()) engine.seek(at);
    trackStarted(song);
  }

  // Load the track that would play next, for gapless playback and crossfade.
  function bufferNext(): void {
    const index = settings.power.prefetch.enabled ? nextIndex() : null;
    const song = index === null ? undefined : state.queue[index];
    // Nothing next, or repeat-one (the same track replays from its deck).
    if (!song || song.id === current.value?.id) {
      buffered = null;
      engine.prepareNext(null);
      return;
    }
    // Already buffering it: leave it be, rebuilding would throw the buffer away.
    if (buffered?.songId !== song.id) buffered = { songId: song.id, deck: deckFor(song) };
    engine.prepareNext(buffered.deck);
  }

  function nextIndex(): number | null {
    const { queue, index, repeat } = state;
    if (queue.length === 0) return null;
    if (repeat === "one") return index;
    if (index + 1 < queue.length) return index + 1;
    return repeat === "all" ? 0 : null;
  }

  function previousIndex(): number | null {
    const { queue, index, repeat } = state;
    if (queue.length === 0) return null;
    if (index > 0) return index - 1;
    return repeat === "all" ? queue.length - 1 : null;
  }

  function trackStarted(song: Song): void {
    history.record(song); // local, whatever the scrobble setting says
    if (settings.playback.scrobble) session.client?.scrobble(song.id, false).catch(() => {});
    bufferNext();
    void keepRadioGoing();
  }

  // ---- Queue ----

  function playNow(songs: Song[], startIndex = 0): void {
    if (songs.length === 0) return;
    // Jumping within the station's own queue keeps the station; anything else
    // replaces it.
    if (songs !== state.queue) station.value = null;
    let queue = [...songs];
    let index = startIndex;
    if (state.shuffle) {
      const chosen = songs[startIndex];
      const others = songs.filter((_, i) => i !== startIndex);
      queue = chosen ? [chosen, ...shuffleSpreadingArtists(others, chosen.artist)] : others;
      index = 0;
    }
    state.queue = queue;
    state.index = -1;
    failedInARow = 0; // a fresh choice gets a fresh run
    void start(index);
    persist();
  }

  function addToQueue(songs: Song[]): void {
    state.queue = [...state.queue, ...songs];
    if (state.index === -1) void start(0);
    else bufferNext();
    persist();
  }

  function playNext(songs: Song[]): void {
    const queue = [...state.queue];
    queue.splice(state.index + 1, 0, ...songs);
    state.queue = queue;
    bufferNext();
    persist();
  }

  function removeAt(index: number): void {
    if (index < 0 || index >= state.queue.length) return;
    const removingCurrent = index === state.index;
    state.queue = state.queue.filter((_, i) => i !== index);
    if (index < state.index) state.index--;
    if (!removingCurrent) bufferNext();
    else if (state.queue.length === 0) stop();
    else void start(Math.min(state.index, state.queue.length - 1));
    persist();
  }

  function moveInQueue(from: number, to: number): void {
    const queue = [...state.queue];
    const [moved] = queue.splice(from, 1);
    if (!moved) return;
    queue.splice(to, 0, moved);
    state.queue = queue;
    // Keep pointing at the same track.
    const i = state.index;
    if (from === i) state.index = to;
    else if (from < i && to >= i) state.index = i - 1;
    else if (from > i && to <= i) state.index = i + 1;
    bufferNext();
    persist();
  }

  function clearQueue(): void {
    stop();
    station.value = null;
    state.queue = [];
    state.index = -1;
    persist();
  }

  // ---- Transport ----

  function togglePlay(): void {
    if (state.index === -1) {
      if (state.queue.length > 0) void start(0);
    } else if (state.isPlaying) {
      engine.pause();
    } else if (engine.hasActiveTrack()) {
      engine.resume();
    } else {
      // First play after a reload: from where it was left.
      const at = track.resumeAt;
      track.resumeAt = 0;
      void start(state.index, { at });
    }
  }

  function next(): void {
    advance({ natural: false });
  }

  function previous(): void {
    if (engine.getCurrentTime() > RESTART_AFTER_S) {
      engine.seek(0);
      return;
    }
    const index = previousIndex();
    if (index === null) engine.seek(0);
    else void start(index);
  }

  // `natural`: the track ended by itself (repeat-one and the sleep timer
  // apply), as opposed to the user skipping.
  function advance({ natural }: { natural: boolean }): void {
    if (natural && sleepMode.value === "end") return sleepNow();
    if (natural && state.repeat === "one") {
      void start(state.index);
      return;
    }
    const index = nextIndex();
    if (index !== null) {
      void start(index);
    } else if (natural && (station.value || settings.playback.autoplay)) {
      void continueWithRadio();
    } else {
      stop();
    }
  }

  // The current track couldn't be played: move on, unless that's been
  // happening track after track, or it's the one track on repeat.
  function skipFailed(): void {
    failedInARow++;
    if (
      state.repeat === "one" ||
      failedInARow >= Math.min(MAX_FAILED_IN_A_ROW, state.queue.length)
    ) {
      failedInARow = 0;
      stop();
      return;
    }
    advance({ natural: true });
  }

  // A crossfade already started the next track's audio: catch the state up.
  function moveToNextWithoutLoading(): void {
    const index = nextIndex();
    if (index === null) return;
    const song = state.queue[index];
    state.index = index;
    state.currentTime = 0;
    state.duration = song?.duration ?? 0;
    track.scrobbled = false;
    buffered = null; // it's the deck now playing
    if (song) trackStarted(song);
  }

  function stop(): void {
    engine.stop();
    state.isPlaying = false;
    state.currentTime = 0;
    state.duration = 0;
  }

  function seek(time: number): void {
    engine.seek(time);
    state.currentTime = time;
  }

  function seekBy(seconds: number): void {
    seek(engine.getCurrentTime() + seconds);
  }

  function setVolume(value: number): void {
    const volume = Math.min(1, Math.max(0, value));
    state.volume = volume;
    state.muted = false;
    engine.setVolume(volume);
    engine.setMuted(false);
  }

  function changeVolume(delta: number): void {
    setVolume(state.volume + delta);
  }

  function toggleMute(): void {
    state.muted = !state.muted;
    engine.setMuted(state.muted);
  }

  function toggleShuffle(): void {
    state.shuffle = !state.shuffle;
  }

  function cycleRepeat(): void {
    state.repeat = REPEAT_ORDER[(REPEAT_ORDER.indexOf(state.repeat) + 1) % REPEAT_ORDER.length]!;
    bufferNext();
  }

  // ---- Radio: Infinite radio and artist stations ----

  // Tracks not to suggest again: already queued, or heard lately.
  function alreadyHeard(): Set<string> {
    return new Set([...state.queue.map((s) => s.id), ...history.recentlyPlayedIds()]);
  }

  // Append songs not yet in the queue; returns how many were added.
  function append(songs: Song[]): number {
    const queued = new Set(state.queue.map((s) => s.id));
    const fresh = songs.filter((s) => !queued.has(s.id));
    if (fresh.length === 0) return 0;
    state.queue = [...state.queue, ...fresh];
    persist();
    bufferNext();
    return fresh.length;
  }

  // Run one background fetch at a time; failures add nothing and are tried
  // again on the next track.
  async function fetchMore(get: () => Promise<Song[]>): Promise<number> {
    if (fetchingMore) return 0;
    fetchingMore = true;
    try {
      return append(await get());
    } catch {
      return 0;
    } finally {
      fetchingMore = false;
    }
  }

  // Infinite radio: tracks like the last one the user chose (never like a
  // suggestion, or each batch drifts further from what they picked), marked so
  // the queue can show which ones they didn't pick.
  function similarTracks(count: number): Promise<number> {
    const client = session.client;
    const seed = pickRadioSeed(state.queue, state.index);
    if (!client || !seed) return Promise.resolve(0);
    return fetchMore(async () => {
      const batch = await buildRadioBatch(client, seed, count, alreadyHeard());
      return batch.map((song) => ({ ...song, autoQueued: true }));
    });
  }

  // The station's next batch, built around the same artist every time.
  function stationTracks(count: number): Promise<number> {
    const client = session.client;
    const active = station.value;
    if (!client || !active) return Promise.resolve(0);
    return fetchMore(async () => {
      const batch = await buildArtistRadioBatch(client, active, count, {
        queued: new Set(state.queue.map((s) => s.id)),
        recent: history.recentlyPlayedIds(),
        opening: false,
      });
      // Something else started while this was loading.
      return station.value === active ? batch : [];
    });
  }

  // Called as each track starts: add more before the queue runs out.
  async function keepRadioGoing(): Promise<void> {
    if (state.index < 0) return;
    const left = state.queue.length - 1 - state.index;
    if (station.value) {
      if (left <= STATION.topUpWhenLeft) await stationTracks(STATION.topUp);
    } else if (settings.playback.autoplay && left <= RADIO.topUpWhenLeft) {
      await similarTracks(RADIO.topUp);
    }
  }

  // The queue has run out (the top-up above didn't happen or failed).
  async function continueWithRadio(): Promise<void> {
    const firstNew = state.queue.length;
    const added = station.value
      ? await stationTracks(RADIO.refill)
      : await similarTracks(RADIO.refill);
    if (added > 0) void start(firstNew);
    else stop();
  }

  // Start "<Artist> Radio". Returns false, leaving the queue alone, when
  // nothing could be found for that artist.
  async function startArtistRadio(artist: { id: string; name: string }): Promise<boolean> {
    const client = session.client;
    if (!client) return false;
    const next: ArtistStation = { kind: "artist", id: artist.id, name: artist.name };
    const batch = await buildArtistRadioBatch(client, next, STATION.start, {
      recent: history.recentlyPlayedIds(),
      opening: true,
    });
    if (batch.length === 0 || session.client !== client) return false;
    station.value = next;
    state.queue = batch;
    state.index = -1;
    void start(0);
    persist();
    return true;
  }

  // Keep the queue, stop adding to it.
  function stopStation(): void {
    station.value = null;
    persist();
  }

  // ---- Sleep timer ----

  function clearSleepTimer(): void {
    clearTimeout(sleepTimer);
    sleepTimer = undefined;
  }

  // Fade out and pause, or just pause for people who prefer reduced motion.
  function sleepNow(): void {
    clearSleepTimer();
    sleepMode.value = null;
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) engine.pause();
    else engine.fadeOutAndPause(5);
  }

  // Minutes from now, "end" of this track, or null to cancel.
  function setSleepTimer(mode: number | "end" | null): void {
    clearSleepTimer();
    if (typeof mode !== "number") {
      sleepMode.value = mode;
      return;
    }
    sleepMode.value = Date.now() + mode * 60_000;
    sleepTimer = setTimeout(sleepNow, mode * 60_000);
  }

  // ---- Reporting plays ----

  function reportPlayIfDue(): void {
    const song = current.value;
    if (!song || track.scrobbled || !settings.playback.scrobble || state.duration <= 0) return;
    if (state.currentTime < scrobbleThreshold(state.duration)) return;
    track.scrobbled = true;
    session.client?.scrobble(song.id, true).catch(() => {});
  }

  // ---- Saving the queue ----

  function persist(): void {
    const client = session.client;
    if (!client || !settings.playback.resumeQueueOnLaunch) return;
    saveQueue(client.username, {
      queue: state.queue,
      index: state.index,
      time: state.currentTime,
      station: station.value,
    });
  }

  function restore(): void {
    const client = session.client;
    if (!client || !settings.playback.resumeQueueOnLaunch) return;
    const saved = loadQueue(client.username);
    if (!saved) return;
    // Loaded, not playing: browsers only allow sound after a click anyway.
    track.resumeAt = saved.time;
    state.queue = saved.queue;
    state.index = saved.index;
    state.currentTime = saved.time;
    state.duration = saved.queue[saved.index]?.duration ?? 0;
    station.value = saved.station;
  }

  // Signing in, out, or as someone else: drop what was playing and load that
  // account's own queue. The same account signing in again (after its session
  // expired) keeps playing; only the next track is reloaded, as its stream
  // address carries the old sign-in.
  watch(
    () => session.client,
    (client, previous) => {
      if (client && previous && sameAccount(client, previous)) {
        buffered = null;
        bufferNext();
        return;
      }
      engine.stop();
      buffered = null;
      track.resumeAt = 0;
      station.value = null;
      Object.assign(state, { queue: [], index: -1, isPlaying: false, currentTime: 0, duration: 0 });
      restore();
    },
    { immediate: true },
  );

  return {
    state,
    current,
    station,
    sleepMode,
    playNow,
    addToQueue,
    playNext,
    removeAt,
    moveInQueue,
    clearQueue,
    togglePlay,
    next,
    previous,
    stop,
    seek,
    seekBy,
    isSeekable: () => engine.isSeekable(),
    setVolume,
    changeVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeat,
    syncCrossfade,
    syncEqualizer,
    equalizerAvailable: () => engine.isEqualizerAvailable(),
    setSleepTimer,
    startArtistRadio,
    stopStation,
  };
});
