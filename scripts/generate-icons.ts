// Generates every app icon from the master logo, branding/logo.svg, and copies
// it in as the in-app logo. Run `npm run icons` after replacing it. The master
// should be a square SVG with a transparent background, cropped close to the
// logo; any transparent margin is trimmed for the icons, so each icon below
// controls its own padding.

import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MASTER = join(ROOT, "branding/logo.svg");
// Rasterise the SVG large (about 4000 px) so every icon is scaled down from it.
const DENSITY = 300;

// The app background (--bg in src/styles/global.css), for icons that must be
// opaque.
const BACKGROUND = { r: 0x12, g: 0x12, b: 0x12, alpha: 1 };
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

interface Icon {
  file: string;
  size: number;
  // Share of the canvas the logo spans.
  scale: number;
  opaque?: boolean;
}

const ICONS: Icon[] = [
  { file: "public/favicon-32.png", size: 32, scale: 1 },
  // Installed app ("any" purpose): the platform shows the transparent shape.
  { file: "public/icons/icon-192.png", size: 192, scale: 0.92 },
  { file: "public/icons/icon-512.png", size: 512, scale: 0.92 },
  // Maskable: launchers crop to their own shape and only guarantee the centre
  // circle (80 % of the width), so the logo sits well inside it on a solid fill.
  { file: "public/icons/icon-maskable-512.png", size: 512, scale: 0.62, opaque: true },
  // iOS paints transparency black and rounds the corners itself.
  { file: "public/icons/apple-touch-icon.png", size: 180, scale: 0.8, opaque: true },
];

async function render(icon: Icon, logo: Buffer): Promise<void> {
  const inner = Math.round(icon.size * icon.scale);
  const mark = await sharp(logo)
    .resize(inner, inner, { fit: "contain", background: TRANSPARENT })
    .toBuffer();
  const out = join(ROOT, icon.file);
  mkdirSync(dirname(out), { recursive: true });
  await sharp({
    create: {
      width: icon.size,
      height: icon.size,
      channels: 4,
      background: icon.opaque ? BACKGROUND : TRANSPARENT,
    },
  })
    .composite([{ input: mark, gravity: "center" }])
    .png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 })
    .toFile(out);
  console.log(`${icon.file} (${icon.size}×${icon.size})`);
}

// Trim the transparent margin once; every icon is sized from the visible logo.
const logo = await sharp(MASTER, { density: DENSITY }).trim().png().toBuffer();
// In-app mark (sidebar, login screen): the vector itself, sharp at any zoom.
copyFileSync(MASTER, join(ROOT, "src/assets/logo.svg"));
console.log("src/assets/logo.svg (copy)");
for (const icon of ICONS) await render(icon, logo);
