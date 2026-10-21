// Which audio formats this browser can play as stored.
//
// The player streams a file untouched when the browser can decode it, and asks
// Navidrome for an MP3 transcode when it can't. Both mistakes cost: claiming
// support that isn't there breaks playback, and denying support that is sends
// every track through the transcoder. So each format is checked once with
// canPlayType, against MIME types that leave no room for guessing.

type Format = "mp3" | "aac" | "alac" | "flac" | "oggFlac" | "vorbis" | "opus" | "webm" | "wav";

// A format counts as playable if the browser accepts any of these. canPlayType
// answers "maybe" whenever it can't be sure without trying; for these types
// that means yes.
const PROBES: Record<Format, string[]> = {
  mp3: ["audio/mpeg"],
  aac: ['audio/mp4; codecs="mp4a.40.2"', "audio/aac"],
  alac: ['audio/mp4; codecs="alac"'],
  flac: ["audio/flac", 'audio/mp4; codecs="flac"'],
  oggFlac: ['audio/ogg; codecs="flac"'],
  vorbis: ['audio/ogg; codecs="vorbis"'],
  opus: ['audio/ogg; codecs="opus"', 'audio/webm; codecs="opus"'],
  webm: ['audio/webm; codecs="opus"', 'audio/webm; codecs="vorbis"'],
  wav: ['audio/wav; codecs="1"', "audio/wav"],
};

// Without a DOM (tests, server rendering): what every browser plays.
const BASELINE = new Set<Format>(["mp3", "aac", "wav"]);

let supported: Set<Format> | null = null;

function supportedFormats(): Set<Format> {
  if (supported) return supported;
  if (typeof document === "undefined") return BASELINE;
  const audio = document.createElement("audio");
  const plays = (type: string) => {
    try {
      return audio.canPlayType(type) !== "";
    } catch {
      return false;
    }
  };
  supported = new Set(
    (Object.keys(PROBES) as Format[]).filter((format) => PROBES[format].some(plays)),
  );
  return supported;
}

// The formats this browser plays natively, best quality first (Settings →
// Connection lists them).
export function playableFormats(): string[] {
  const has = supportedFormats();
  const shown: [string, boolean][] = [
    ["FLAC", has.has("flac") || has.has("oggFlac")],
    ["WAV", has.has("wav")],
    ["ALAC", has.has("alac")],
    ["Opus", has.has("opus")],
    ["Vorbis", has.has("vorbis") || has.has("webm")],
    ["AAC", has.has("aac")],
    ["MP3", has.has("mp3")],
  ];
  return shown.filter(([, ok]) => ok).map(([name]) => name);
}

// Servers describe containers by file suffix or MIME type, in many spellings.
const CONTAINER_NAMES: Record<string, string> = {
  mpeg: "mp3",
  mpeg3: "mp3",
  mp4: "m4a",
  m4b: "m4a",
  aac: "m4a",
  oga: "ogg",
  wave: "wav",
  webma: "webm",
};

// "audio/x-flac" → "flac", "M4B" → "m4a", "mp3, mpeg" → "mp3".
export function normalizeContainer(raw?: string): string {
  const first = (raw ?? "").split(",")[0]!.trim().toLowerCase();
  const name = first.includes("/") ? first.slice(first.indexOf("/") + 1).replace(/^x-/, "") : first;
  return CONTAINER_NAMES[name] ?? name;
}

// Formats browsers don't play at all.
const NEVER = new Set(["ape", "wv", "dsf", "dff", "wma", "aiff", "aif", "mpc", "shn", "tta"]);

// Whether a file in this container (and codec, when it matters) plays as is.
export function canPlayContainer(container?: string, codec?: string): boolean {
  const has = supportedFormats();
  const kind = normalizeContainer(container);
  const inside = normalizeContainer(codec);
  switch (kind) {
    case "mp3":
    case "flac":
    case "opus":
    case "wav":
    case "webm":
      return has.has(kind);
    case "m4a":
      // AAC and Apple Lossless share the container: the codec decides.
      return has.has(inside === "alac" ? "alac" : "aac");
    case "ogg":
      if (inside === "opus") return has.has("opus");
      if (inside === "flac") return has.has("oggFlac");
      return has.has("vorbis") || has.has("opus");
    default:
      // Unknown: let the browser try before asking for a transcode.
      return !NEVER.has(kind);
  }
}
