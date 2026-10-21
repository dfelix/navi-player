// Colours taken from album art: the album page's backdrop, and the full-screen
// player's glow and fade.
//
// The cover is drawn small onto a canvas and its pixels grouped into coarse
// colour cells; the busiest cells are the swatches. All colour maths (OKLCH,
// perceptual distance, gamut clamping) is done by culori.
//
// Reading pixels needs a CORS-clean image: same-origin covers (the bundled
// server or a same-origin proxy) or a server that sends CORS headers. A tainted
// canvas throws, so callers treat colours as optional.

import { clampChroma, differenceEuclidean, formatHex, oklch, parse, type Oklch } from "culori";

export interface CoverColours {
  // Most common first.
  swatches: string[];
  // The swatch that works best as a highlight: colourful, neither near-black
  // nor near-white.
  accent: string;
}

// Small on purpose: enough pixels for a palette, cheap to read.
const SAMPLE_SIZE = 40;
// Each channel is cut into this many steps, so near-identical shades share a cell.
const CELL_STEPS = 12;
const MAX_SWATCHES = 8;
const FALLBACK_ACCENT = "#14b8a6";

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Cover could not be loaded: ${url}`));
    img.src = url;
  });
}

function samplePixels(img: HTMLImageElement): Uint8ClampedArray {
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  return ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
}

// Group RGBA pixels into cells and return each cell's mean colour, busiest
// first. Exported for tests.
export function swatchesFromPixels(data: ArrayLike<number>, max = MAX_SWATCHES): string[] {
  const cells = new Map<number, { n: number; r: number; g: number; b: number }>();
  const step = 256 / CELL_STEPS;
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3]! < 128) continue; // transparent edges of a cover
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const key =
      Math.floor(r / step) * CELL_STEPS * CELL_STEPS +
      Math.floor(g / step) * CELL_STEPS +
      Math.floor(b / step);
    const cell = cells.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    cell.n++;
    cell.r += r;
    cell.g += g;
    cell.b += b;
    cells.set(key, cell);
  }
  return [...cells.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, max)
    .map((c) =>
      formatHex({ mode: "rgb", r: c.r / c.n / 255, g: c.g / c.n / 255, b: c.b / c.n / 255 }),
    );
}

// The most usable highlight among the swatches: chroma counts most, and
// colours too dark or too light to read against the UI are skipped.
export function pickAccent(swatches: string[]): string {
  let best: { hex: string; score: number } | null = null;
  swatches.forEach((hex, rank) => {
    const c = oklch(parse(hex));
    if (!c || c.l < 0.3 || c.l > 0.9) return;
    // Earlier swatches are more common, so they get a small head start.
    const score = (c.c ?? 0) * (1 - rank * 0.05);
    if (!best || score > best.score) best = { hex, score };
  });
  return (best as { hex: string } | null)?.hex ?? swatches[0] ?? FALLBACK_ACCENT;
}

export async function readCoverColours(url: string): Promise<CoverColours> {
  const swatches = swatchesFromPixels(samplePixels(await loadImage(url)));
  if (swatches.length === 0) throw new Error("Cover has no opaque pixels");
  return { swatches, accent: pickAccent(swatches) };
}

const distance = differenceEuclidean("oklab");

// Up to `n` colours that are visibly different from each other, keeping the
// input's order of preference.
export function pickDistinct(colours: string[], n: number, minDistance = 0.08): string[] {
  const out: string[] = [];
  for (const hex of colours) {
    if (out.length >= n) break;
    if (out.every((kept) => distance(kept, hex) >= minDistance)) out.push(hex);
  }
  return out;
}

// The same hue at a set lightness, with its chroma capped, so any cover gives
// a backdrop that sits quietly behind white text.
function toned(hex: string, l: number, maxChroma: number): string {
  const c = oklch(parse(hex)) ?? ({ mode: "oklch", l, c: 0, h: 0 } as Oklch);
  return formatHex(
    clampChroma({ mode: "oklch", l, c: Math.min(c.c ?? 0, maxChroma), h: c.h }, "oklch"),
  );
}

// A top-to-bottom fade from the cover's colours into the page background.
export function fadeBackdrop(colours: string[]): string {
  if (colours.length === 0) return "";
  const top = toned(colours[0]!, 0.42, 0.12);
  const middle = toned(colours[1] ?? colours[0]!, 0.28, 0.08);
  return `linear-gradient(180deg, ${top} 0%, ${middle} 45%, transparent 100%)`;
}

// Three soft glows in the corners, one per colour (repeating when there are
// fewer), for the full-screen player.
export function glowLayers(colours: string[]): string {
  if (colours.length === 0) return "";
  const at = (i: number) => toned(colours[i % colours.length]!, 0.5, 0.16);
  return [
    `radial-gradient(60% 55% at 15% 20%, ${at(0)} 0%, transparent 70%)`,
    `radial-gradient(55% 60% at 85% 30%, ${at(1)} 0%, transparent 70%)`,
    `radial-gradient(70% 60% at 50% 95%, ${at(2)} 0%, transparent 75%)`,
  ].join(", ");
}

// A diagonal blend of the cover's colours, for the album page header.
export function diagonalBlend(colours: string[]): string {
  if (colours.length === 0) return "";
  const stops = colours.length === 1 ? [colours[0], colours[0]] : colours;
  return `linear-gradient(135deg, ${stops.join(", ")})`;
}
