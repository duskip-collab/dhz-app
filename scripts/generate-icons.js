'use strict';
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT_DIR = path.join(__dirname, '..', 'public', 'icons');
const RED = [0xC6, 0x28, 0x28, 0xFF];
const WHITE = [0xFF, 0xFF, 0xFF, 0xFF];

function createCanvas(size) {
  const canvas = [];
  const center = Math.floor(size / 2);
  const radius = Math.floor(size / 4);
  for (let y = 0; y < size; y++) {
    const row = [];
    for (let x = 0; x < size; x++) {
      const dx = Math.abs(x - center);
      const dy = Math.abs(y - center);
      if (dx < radius && dy < radius) {
        row.push([...RED]);
      } else {
        row.push([...WHITE]);
      }
    }
    canvas.push(row);
  }
  return canvas;
}

function canvasToPng(canvas, size) {
  const w = size;
  const h = size;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const idx = y * (w * 4 + 1) + x * 4 + 1;
      const [r, g, b, a] = canvas[y][x];
      raw[idx] = r;
      raw[idx + 1] = g;
      raw[idx + 2] = b;
      raw[idx + 3] = a;
    }
  }
  return sharp(raw, { raw: { width: w, height: h, channels: 4, depth: 'uchar' } })
    .png()
    .toBuffer();
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const specs = [
    { file: 'icon-192.png', size: 192 },
    { file: 'icon-512.png', size: 512 },
    { file: 'apple-touch-icon.png', size: 180 },
  ];
  for (const spec of specs) {
    const png = await canvasToPng(createCanvas(spec.size), spec.size);
    const outPath = path.join(OUT_DIR, spec.file);
    fs.writeFileSync(outPath, await png);
    console.log(`Created ${outPath} (${spec.size}x${spec.size})`);
  }
  console.log('All icons created.');
}
main().catch((err) => {

  console.error('Error:', err);
  process.exit(1);
});
