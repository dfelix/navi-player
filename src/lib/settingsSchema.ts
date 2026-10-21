// Everything a listener can set, with its defaults.
//
// Saved per browser in localStorage ("navi-player:settings", apart from the
// sign-in) and used as-is by Settings → Backup's export and import, so the key
// names are a stored format: rename one and existing settings lose it. There
// are no colour settings; the palette is fixed (src/styles/global.css).

export const SETTINGS_VERSION = 1 as const;

export type Density = "compact" | "comfortable" | "spacious";
export type CoverArtSize = "small" | "medium" | "large";
export type LandingPage =
  "home" | "albums" | "artists" | "playlists" | "recently-added" | "recently-played";
export type ReplayGainMode = "off" | "track" | "album";
export type LogLevel = "silent" | "error" | "info" | "debug";
export type LanguageSetting = "auto" | "en" | "pt"; // "auto": the browser's

// ---- Equaliser ----

// Ten bands an octave apart, at the usual graphic-equaliser centres (Hz).
export const EQ_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;
export const EQ_BAND_COUNT = EQ_FREQUENCIES.length;
export const EQ_GAIN_LIMIT = 12; // dB either way, for bands and pre-amp
export const EQ_BAND_LABELS = EQ_FREQUENCIES.map((hz) => (hz < 1000 ? `${hz}` : `${hz / 1000}K`));

export interface EqualizerPreset {
  id: string;
  name: string;
  gains: number[]; // dB, one per band
}

export interface EqualizerSettings {
  enabled: boolean;
  preset: string; // a built-in id, a saved preset's id, or "custom"
  preampDb: number;
  gains: number[];
  userPresets: EqualizerPreset[];
}

// The built-in curves (names are in the locale files, equalizer.preset.<id>).
// Kept moderate: noticeable, but no band near the ±12 dB limit.
//                    31   62  125  250  500   1K   2K   4K   8K  16K
export const EQ_PRESETS: { id: string; gains: number[] }[] = [
  { id: "flat", gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { id: "bass-boost", gains: [6, 6, 4, 2, 0, 0, 0, 0, 0, 0] },
  { id: "bass-reducer", gains: [-6, -6, -4, -2, 0, 0, 0, 0, 0, 0] },
  { id: "treble-boost", gains: [0, 0, 0, 0, 0, 0, 2, 4, 6, 6] },
  { id: "vocal", gains: [-3, -2, -1, 0, 3, 4, 4, 2, 0, -1] },
  { id: "rock", gains: [4, 3, 2, 0, -1, 0, 2, 3, 4, 4] },
  { id: "pop", gains: [-1, 0, 1, 3, 4, 3, 1, 0, 0, -1] },
  { id: "jazz", gains: [2, 2, 1, 1, 0, -1, 0, 1, 2, 3] },
  { id: "classical", gains: [3, 2, 2, 1, 0, 0, 0, 1, 2, 3] },
  { id: "electronic", gains: [5, 4, 2, 0, -1, 0, 1, 2, 4, 5] },
  { id: "acoustic", gains: [3, 3, 2, 1, 1, 2, 2, 3, 2, 1] },
  { id: "loudness", gains: [5, 4, 1, 0, -1, -1, 0, 1, 4, 5] },
  { id: "podcast", gains: [-5, -3, -1, 2, 3, 4, 3, 1, 0, -2] },
];

// ---- Keyboard shortcuts ----

export type ShortcutAction =
  | "playPause"
  | "next"
  | "previous"
  | "seekForward"
  | "seekBackward"
  | "volumeUp"
  | "volumeDown"
  | "toggleMute"
  | "toggleQueue"
  | "toggleLyrics"
  | "focusSearch"
  | "toggleShuffle"
  | "toggleRepeat"
  | "starCurrent";

export const DEFAULT_SHORTCUTS: Record<ShortcutAction, string> = {
  playPause: "Space",
  next: "Ctrl+ArrowRight",
  previous: "Ctrl+ArrowLeft",
  seekForward: "ArrowRight",
  seekBackward: "ArrowLeft",
  volumeUp: "ArrowUp",
  volumeDown: "ArrowDown",
  toggleMute: "m",
  toggleQueue: "q",
  toggleLyrics: "l",
  focusSearch: "/",
  toggleShuffle: "s",
  toggleRepeat: "r",
  starCurrent: "f",
};

// ---- The settings, by section ----

export interface ProfileSettings {
  displayName: string; // used instead of the username in greetings; "" = username
  language: LanguageSetting;
}

export interface LayoutSettings {
  density: Density;
  coverArtSize: CoverArtSize;
  showQueuePanel: boolean;
  showLyricsPanel: boolean;
  showSidebar: boolean;
  defaultLanding: LandingPage;
  showPlayCounts: boolean;
  // The full-screen player's blurred cover backdrop and colour glow; off for
  // plain art on a plain background.
  fullScreenBackdrop: boolean;
}

export interface PlaybackSettings {
  defaultVolume: number; // 0–100
  crossfadeSeconds: number; // 0 = none, up to 12
  gapless: boolean;
  scrobble: boolean;
  replayGain: { mode: ReplayGainMode; preAmpDb: number };
  resumeQueueOnLaunch: boolean;
  maxBitRate: number; // kbps; 0 = the original file
  equalizer: EqualizerSettings;
  autoplay: boolean; // Infinite radio (the stored name predates the feature's)
  forgottenGems: boolean; // suggestions favour tracks you've rarely played
  onlineLyrics: boolean; // ask LRCLIB when the server has no lyrics
}

export interface PowerSettings {
  shortcuts: Record<ShortcutAction, string>;
  prefetch: { enabled: boolean }; // buffer the next track (gapless, crossfade)
  coverArtCacheMB: number;
  polling: { libraryStaleMs: number }; // how long library lists count as fresh
  developer: { debugPanel: boolean; logLevel: LogLevel };
}

export interface Settings {
  version: typeof SETTINGS_VERSION;
  profile: ProfileSettings;
  layout: LayoutSettings;
  playback: PlaybackSettings;
  power: PowerSettings;
}

export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  profile: { displayName: "", language: "auto" },
  layout: {
    density: "comfortable",
    coverArtSize: "medium",
    showQueuePanel: false,
    showLyricsPanel: false,
    showSidebar: true,
    defaultLanding: "home",
    showPlayCounts: true,
    fullScreenBackdrop: true,
  },
  playback: {
    defaultVolume: 80,
    crossfadeSeconds: 0,
    gapless: true,
    scrobble: true,
    // Per track: in radio and mixed queues every song should land at about
    // the same loudness. Album mode keeps an album's own dynamics.
    replayGain: { mode: "track", preAmpDb: 0 },
    resumeQueueOnLaunch: true,
    maxBitRate: 0,
    equalizer: {
      enabled: false,
      preset: "flat",
      preampDb: 0,
      gains: Array<number>(EQ_BAND_COUNT).fill(0),
      userPresets: [],
    },
    autoplay: true,
    forgottenGems: false,
    // Off until chosen: it sends what you're playing to an outside service.
    onlineLyrics: false,
  },
  power: {
    shortcuts: { ...DEFAULT_SHORTCUTS },
    prefetch: { enabled: true },
    coverArtCacheMB: 100,
    polling: { libraryStaleMs: 5 * 60_000 },
    developer: { debugPanel: false, logLevel: "error" },
  },
};
