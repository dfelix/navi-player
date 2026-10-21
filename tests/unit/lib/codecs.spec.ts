// Deciding which files play as stored, with a browser that knows a fixed set
// of formats (like Firefox: no ALAC, everything open).

const SUPPORTED = new Set([
  "audio/mpeg",
  'audio/mp4; codecs="mp4a.40.2"',
  "audio/flac",
  'audio/ogg; codecs="vorbis"',
  'audio/ogg; codecs="opus"',
  'audio/ogg; codecs="flac"',
  'audio/wav; codecs="1"',
]);

// A fresh copy of the module per test: it remembers what it detected, and
// Jest undoes mocks after every test.
let codecs: typeof import("@/lib/codecs");

beforeEach(async () => {
  jest
    .spyOn(HTMLMediaElement.prototype, "canPlayType")
    .mockImplementation((type: string) => (SUPPORTED.has(type) ? "maybe" : ""));
  jest.resetModules();
  codecs = await import("@/lib/codecs");
});

describe("codecs", () => {
  it("normalises suffixes and MIME types", () => {
    expect(codecs.normalizeContainer("audio/x-flac")).toBe("flac");
    expect(codecs.normalizeContainer("M4B")).toBe("m4a");
    expect(codecs.normalizeContainer("mpeg, mp3")).toBe("mp3");
    expect(codecs.normalizeContainer(undefined)).toBe("");
  });

  it("plays what the browser decodes and transcodes the rest", () => {
    expect(codecs.canPlayContainer("flac")).toBe(true);
    expect(codecs.canPlayContainer("audio/mp4", "aac")).toBe(true);
    expect(codecs.canPlayContainer("m4a", "alac")).toBe(false);
    expect(codecs.canPlayContainer("ogg", "opus")).toBe(true);
    expect(codecs.canPlayContainer("ape")).toBe(false);
    expect(codecs.canPlayContainer("dsf")).toBe(false);
  });

  it("lets the browser try a container it has never heard of", () => {
    expect(codecs.canPlayContainer("xyz")).toBe(true);
  });

  it("lists playable formats, best first", () => {
    expect(codecs.playableFormats()).toEqual(["FLAC", "WAV", "Opus", "Vorbis", "AAC", "MP3"]);
  });
});
