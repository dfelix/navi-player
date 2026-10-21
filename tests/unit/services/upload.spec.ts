import { collectFiles, isJunkPath, keepFile, mergeUploadFiles } from "@/services/upload";

const file = (name: string) => new File(["x"], name);

describe("upload file filtering", () => {
  it.each(["song.mp3", "Song.FLAC", "track.opus", "album.zip"])("accepts %s", (name) => {
    expect(keepFile(name, name)).toBe(true);
  });

  it.each(["cover.jpg", "notes.txt", "playlist.m3u"])("rejects non-audio %s", (name) => {
    expect(keepFile(name, name)).toBe(false);
  });

  it.each(["._track.flac", "Album/.DS_Store", "__MACOSX/Album/track.mp3", "Album/.hidden/x.mp3"])(
    "treats OS junk %s as junk",
    (path) => {
      expect(isJunkPath(path)).toBe(true);
    },
  );

  it("collects only usable files", () => {
    const out = collectFiles([file("a.mp3"), file("cover.jpg"), file("._a.mp3")]);
    expect(out.map((u) => u.path)).toEqual(["a.mp3"]);
  });

  it("merges picks without duplicating paths", () => {
    const first = collectFiles([file("a.mp3")]);
    const merged = mergeUploadFiles(first, collectFiles([file("a.mp3"), file("b.mp3")]));
    expect(merged.map((u) => u.path)).toEqual(["a.mp3", "b.mp3"]);
  });
});
