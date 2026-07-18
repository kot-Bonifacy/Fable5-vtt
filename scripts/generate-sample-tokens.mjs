// Generates simple, copyright-free sample token portraits (256×256 PNG)
// into data/public/tokens/. Run: node scripts/generate-sample-tokens.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZE = 256;
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'public', 'tokens');

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
  for (let y = 0; y < SIZE; y++) {
    raw[y * (SIZE * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Flat-shaded "netrunner bust": hooded silhouette with a glowing visor. */
function drawToken({ bg, skin, visor, accent }) {
  const px = Buffer.alloc(SIZE * SIZE * 4);
  const set = (x, y, [r, g, b], a = 255) => {
    const i = (y * SIZE + x) * 4;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = a;
  };
  const C = SIZE / 2;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const d = Math.hypot(x - C, y - C);
      if (d > 126) continue; // transparent corners
      // Background disc with a subtle vertical gradient.
      const shade = 1 - (y / SIZE) * 0.35;
      set(
        x,
        y,
        bg.map((v) => Math.round(v * shade)),
      );
      // Shoulders.
      const sy = y - 170;
      if (sy > 0 && Math.abs(x - C) < 78 - sy * 0.25) set(x, y, accent);
      // Head (hood) — ellipse.
      const hx = (x - C) / 52;
      const hy = (y - 108) / 62;
      if (hx * hx + hy * hy < 1) set(x, y, skin);
      // Visor stripe across the face.
      if (y > 96 && y < 112 && Math.abs(x - C) < 44) set(x, y, visor);
      // Neon ear-line detail.
      if (x > C + 40 && x < C + 46 && y > 120 && y < 150) set(x, y, visor);
    }
  }
  return px;
}

const TOKENS = {
  'solo-red.png': {
    bg: [58, 16, 24],
    skin: [46, 40, 44],
    visor: [255, 64, 80],
    accent: [24, 10, 14],
  },
  'netrunner-cyan.png': {
    bg: [10, 40, 52],
    skin: [38, 44, 50],
    visor: [64, 224, 255],
    accent: [8, 20, 28],
  },
  'fixer-gold.png': {
    bg: [52, 40, 12],
    skin: [48, 42, 38],
    visor: [255, 200, 64],
    accent: [26, 18, 6],
  },
};

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, palette] of Object.entries(TOKENS)) {
  writeFileSync(join(OUT_DIR, name), encodePng(drawToken(palette)));
  console.log('written', name);
}
