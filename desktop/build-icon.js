// Regenerates desktop/icon.png (512px, window/tray fallback) and icon.ico
// (multi-size, used for the exe resource and the Windows window/tray icons).
//
// icon.svg is the single source of the mark; app-icon.svg is an unused older
// design and must not be wired back in here.
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, 'icon.svg');
const pngPath = path.join(__dirname, 'icon.png');
const icoPath = path.join(__dirname, 'icon.ico');

// Windows picks a native frame instead of rescaling one big bitmap, so the
// small sizes must exist in the ico.
const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256];
// Bitmaps are the most compatible frame format; keep them for the sizes the
// shell uses at 100-150% scaling and let the larger ones be PNG-compressed.
const BITMAP_MAX_SIZE = 48;

function bitmapFrame(rgba, size) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0); // biSize
  header.writeInt32LE(size, 4); // biWidth
  header.writeInt32LE(size * 2, 8); // biHeight (xor + and mask)
  header.writeUInt16LE(1, 12); // biPlanes
  header.writeUInt16LE(32, 14); // biBitCount
  header.writeUInt32LE(0, 16); // biCompression
  header.writeUInt32LE(size * size * 4, 20); // biSizeImage

  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    const srcRow = (size - 1 - y) * size * 4; // bottom-up
    for (let x = 0; x < size; x += 1) {
      const src = srcRow + x * 4;
      const dst = (y * size + x) * 4;
      pixels[dst] = rgba[src + 2]; // B
      pixels[dst + 1] = rgba[src + 1]; // G
      pixels[dst + 2] = rgba[src]; // R
      pixels[dst + 3] = rgba[src + 3]; // A
    }
  }

  const maskRowBytes = Math.ceil(size / 32) * 4;
  const mask = Buffer.alloc(maskRowBytes * size); // all opaque; alpha does the work
  return Buffer.concat([header, pixels, mask]);
}

async function render(size) {
  const resized = sharp(svgPath).resize(size, size, { fit: 'contain' });
  return {
    rgba: await resized.clone().ensureAlpha().raw().toBuffer(),
    png: await resized.clone().png().toBuffer(),
  };
}

function buildIco(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // icon type
  header.writeUInt16LE(frames.length, 4);

  let offset = 6 + frames.length * 16;
  const entries = [];
  const blobs = [];
  for (const { size, data } of frames) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0);
    entry.writeUInt8(size === 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bit count
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    blobs.push(data);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...blobs]);
}

async function main() {
  await sharp(svgPath).resize(512, 512).png().toFile(pngPath);
  console.log('Icon created: icon.png (512)');

  const frames = [];
  for (const size of ICO_SIZES) {
    const { rgba, png } = await render(size);
    frames.push({ size, data: size <= BITMAP_MAX_SIZE ? bitmapFrame(rgba, size) : png });
  }
  fs.writeFileSync(icoPath, buildIco(frames));
  console.log(`Icon created: icon.ico (${ICO_SIZES.join(', ')})`);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
