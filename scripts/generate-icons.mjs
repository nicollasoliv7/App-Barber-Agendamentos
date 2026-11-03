/**
 * Gera public/icons/icon-192.png e icon-512.png a partir de src/app/icon.svg usando sharp.
 * Uso: node scripts/generate-icons.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const src = resolve(root, "src/app/icon.svg");
const outDir = resolve(root, "public/icons");

const svg = readFileSync(src);

for (const size of [192, 512]) {
  await sharp(svg)
    .resize(size, size)
    .png()
    .toFile(resolve(outDir, `icon-${size}.png`));
  console.log(`✓ icon-${size}.png`);
}
