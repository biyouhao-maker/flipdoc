import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const srcPng = path.join(root, "public", "icon-512.png");
const outDir = path.join(root, "desktop-app", "assets");
fs.mkdirSync(outDir, { recursive: true });

const sizes = [16, 32, 48, 256];
const pngBuffers = await Promise.all(
  sizes.map((s) => sharp(srcPng).resize(s, s).png().toBuffer())
);

// Build standard Windows ICO binary (ICONDIR + ICONDIRENTRY[] + PNG payloads)
const count = sizes.length;
const headerSize = 6 + count * 16;
let offset = headerSize;

const header = Buffer.alloc(headerSize);
header.writeUInt16LE(0, 0); // Reserved
header.writeUInt16LE(1, 2); // Type 1 = ICO
header.writeUInt16LE(count, 4);

for (let i = 0; i < count; i++) {
  const s = sizes[i];
  const buf = pngBuffers[i];
  const entryPos = 6 + i * 16;
  header.writeUInt8(s === 256 ? 0 : s, entryPos + 0); // Width (0 means 256)
  header.writeUInt8(s === 256 ? 0 : s, entryPos + 1); // Height
  header.writeUInt8(0, entryPos + 2); // Palette
  header.writeUInt8(0, entryPos + 3); // Reserved
  header.writeUInt16LE(1, entryPos + 4); // Color planes
  header.writeUInt16LE(32, entryPos + 6); // Bits per pixel
  header.writeUInt32LE(buf.length, entryPos + 8); // Size of image data
  header.writeUInt32LE(offset, entryPos + 12); // Offset
  offset += buf.length;
}

const icoBuffer = Buffer.concat([header, ...pngBuffers]);
fs.writeFileSync(path.join(outDir, "icon.ico"), icoBuffer);
await sharp(srcPng).resize(256, 256).png().toFile(path.join(outDir, "icon.png"));
console.log("Generated desktop-app/assets/icon.ico and icon.png OK!");
