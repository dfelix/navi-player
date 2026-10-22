import type { Song } from "@/api/types";
import { collectionEntryNames, sanitizeName, songFileName } from "@/lib/downloadNames";

const s = (title: string, extra: Partial<Song> = {}) => ({ id: title, title, ...extra }) as Song;

describe("download names", () => {
  it("replaces characters file systems refuse", () => {
    expect(sanitizeName('EX/IT: "Run" <for> Cover?')).toBe("EX_IT_ _Run_ _for_ Cover_");
    expect(sanitizeName("   ")).toBe("untitled");
  });

  it("names a single song by track number, or artist and title", () => {
    expect(songFileName(s("Airbag", { track: 1, suffix: "flac" }))).toBe("01 Airbag.flac");
    expect(songFileName(s("Low Tide", { artist: "Lighthouse" }), "mp3")).toBe(
      "Lighthouse - Low Tide.mp3",
    );
    expect(songFileName(s("Untitled"))).toBe("Untitled.mp3");
  });

  it("numbers albums by disc and track, playlists by position, and keeps names unique", () => {
    const album = [
      s("One", { track: 1, suffix: "flac" }),
      s("Two", { track: 2, discNumber: 2, suffix: "flac" }),
    ];
    expect(collectionEntryNames(album, undefined, true)).toEqual(["01 One.flac", "2-02 Two.flac"]);
    const playlist = [s("Song", { track: 5 }), s("Song", { track: 5 }), s("song", { track: 5 })];
    expect(collectionEntryNames(playlist, "opus", false)).toEqual([
      "01 Song.opus",
      "02 Song.opus",
      "03 song.opus",
    ]);
    expect(collectionEntryNames(playlist, "opus", true)).toEqual([
      "05 Song.opus",
      "05 Song (2).opus",
      "05 song (3).opus",
    ]);
  });
});
