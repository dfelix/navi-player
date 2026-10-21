// Colours from album art, from raw pixels (the canvas step needs a browser).
import { formatHex, oklch, parse } from "culori";
import {
  diagonalBlend,
  fadeBackdrop,
  pickAccent,
  pickDistinct,
  swatchesFromPixels,
} from "@/lib/artColours";

// n RGBA pixels of one colour.
const px = (hex: string, n: number, alpha = 255) => {
  const { r, g, b } = parse(hex) as { r: number; g: number; b: number };
  return Array.from({ length: n }, () => [r * 255, g * 255, b * 255, alpha]).flat();
};

describe("swatchesFromPixels", () => {
  it("lists the cover's colours, most common first", () => {
    const data = [...px("#204080", 30), ...px("#e0c020", 60), ...px("#101010", 10)];
    expect(swatchesFromPixels(data)).toEqual(["#e0c020", "#204080", "#101010"]);
  });

  it("merges near-identical shades and ignores transparent pixels", () => {
    const data = [...px("#204080", 10), ...px("#214181", 10), ...px("#ff0000", 50, 0)];
    expect(swatchesFromPixels(data)).toHaveLength(1);
  });
});

describe("pickAccent", () => {
  it("prefers a colourful swatch over a more common grey", () => {
    expect(pickAccent(["#777777", "#2f6fe0"])).toBe("#2f6fe0");
  });

  it("skips near-black and near-white", () => {
    expect(pickAccent(["#050505", "#fafafa", "#a03030"])).toBe("#a03030");
  });

  it("falls back to the first swatch, or the app accent", () => {
    expect(pickAccent(["#000000"])).toBe("#000000");
    expect(pickAccent([])).toBe("#14b8a6");
  });
});

describe("pickDistinct", () => {
  it("drops colours too close to one already picked", () => {
    expect(pickDistinct(["#ff0000", "#fe0101", "#0000ff", "#00ff00"], 3)).toEqual([
      "#ff0000",
      "#0000ff",
      "#00ff00",
    ]);
  });
});

describe("backdrops", () => {
  it("keeps the cover's hue but tones it down to sit behind text", () => {
    const top = /linear-gradient\(180deg, (#[0-9a-f]{6})/.exec(fadeBackdrop(["#ff0000"]))![1]!;
    const c = oklch(parse(top))!;
    expect(c.l).toBeCloseTo(0.42, 1);
    expect(c.c).toBeLessThanOrEqual(0.121);
    expect(Math.abs((c.h ?? 0) - oklch(parse("#ff0000"))!.h!)).toBeLessThan(10);
  });

  it("blends one colour or several diagonally", () => {
    expect(diagonalBlend([])).toBe("");
    expect(diagonalBlend(["#112233"])).toBe("linear-gradient(135deg, #112233, #112233)");
    expect(diagonalBlend(["#112233", "#445566"])).toBe("linear-gradient(135deg, #112233, #445566)");
    expect(formatHex("#112233")).toBe("#112233");
  });
});
