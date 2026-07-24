// Generates the copyright-free test battlemap: a Night City four-way intersection.
// 4096x4096 px, no grid burned in (the VTT draws it), no text.
//
// Scale: CP RED uses 1 grid square = 2 m and the VTT defaults to 100 px squares,
// so 50 px = 1 m and the whole map is ~82 x 82 m — one intersection with four
// corner parcels. Every street/block edge lands on a multiple of 100 px so the
// grid lines up with offset 0.
//
// Run: node scripts/generate-test-map.mjs [outfile]
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZE = 4096;
const GRID = 100; // px per grid square
const M = GRID / 2; // px per metre

const OUT =
  process.argv[2] ??
  join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'data',
    'public',
    'maps',
    'test-map-4096.png',
  );

// ---------------------------------------------------------------- palette --
// Cool, desaturated night city; every accent is neon so it pops against it.
const C = {
  asphalt: [24, 28, 35],
  asphaltHi: [37, 42, 51],
  gutter: [17, 20, 26],
  walk: [50, 55, 64],
  walkHi: [61, 66, 76],
  walkSeam: [38, 42, 50],
  curb: [80, 86, 98],
  lot: [33, 37, 45],
  roof: [55, 60, 69],
  roofAlt: [33, 37, 44],
  roofTar: [30, 33, 40],
  parapet: [72, 78, 89],
  concrete: [63, 68, 77],
  metal: [96, 103, 114],
  metalDark: [55, 60, 69],
  rust: [104, 66, 46],
  dirt: [62, 54, 43],
  paint: [198, 203, 208],
  paintY: [206, 168, 62],
  glass: [70, 92, 104],
  cyan: [72, 232, 255],
  magenta: [255, 60, 148],
  lime: [176, 245, 70],
  amber: [255, 168, 48],
  red: [255, 74, 68],
  violet: [168, 104, 255],
  lamp: [255, 214, 152],
};

// ------------------------------------------------------------- raw buffer --
const buf = new Uint8Array(SIZE * SIZE * 3);

function blend(i, r, g, b, a) {
  if (a >= 1) {
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
    return;
  }
  buf[i] += (r - buf[i]) * a + 0.5;
  buf[i + 1] += (g - buf[i + 1]) * a + 0.5;
  buf[i + 2] += (b - buf[i + 2]) * a + 0.5;
}

function add(i, r, g, b, k) {
  buf[i] = Math.min(255, buf[i] + r * k);
  buf[i + 1] = Math.min(255, buf[i + 1] + g * k);
  buf[i + 2] = Math.min(255, buf[i + 2] + b * k);
}

function scale(i, k) {
  buf[i] *= k;
  buf[i + 1] *= k;
  buf[i + 2] *= k;
}

// -------------------------------------------------------- noise & random --
function hash2(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise; `cell` is the feature size in px. */
function vnoise(x, y, cell, seed) {
  const fx = x / cell;
  const fy = y / cell;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = fx - ix;
  const ty = fy - iy;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  const top = a + (b - a) * sx;
  const bot = c + (d - c) * sx;
  return top + (bot - top) * sy;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

// ---------------------------------------------------------------- shapes --
function rect(x0, y0, w, h, c, a = 1) {
  const X0 = Math.max(0, Math.round(x0));
  const Y0 = Math.max(0, Math.round(y0));
  const X1 = Math.min(SIZE, Math.round(x0 + w));
  const Y1 = Math.min(SIZE, Math.round(y0 + h));
  for (let y = Y0; y < Y1; y++) {
    let i = (y * SIZE + X0) * 3;
    for (let x = X0; x < X1; x++, i += 3) blend(i, c[0], c[1], c[2], a);
  }
}

/** Per-pixel rect; `fn(x, y)` returns [r,g,b,a] or null. */
function rectFn(x0, y0, w, h, fn) {
  const X0 = Math.max(0, Math.round(x0));
  const Y0 = Math.max(0, Math.round(y0));
  const X1 = Math.min(SIZE, Math.round(x0 + w));
  const Y1 = Math.min(SIZE, Math.round(y0 + h));
  for (let y = Y0; y < Y1; y++) {
    let i = (y * SIZE + X0) * 3;
    for (let x = X0; x < X1; x++, i += 3) {
      const c = fn(x, y);
      if (c) blend(i, c[0], c[1], c[2], c[3] ?? 1);
    }
  }
}

function outline(x0, y0, w, h, c, a = 1, t = 2) {
  rect(x0, y0, w, t, c, a);
  rect(x0, y0 + h - t, w, t, c, a);
  rect(x0, y0 + t, t, h - 2 * t, c, a);
  rect(x0 + w - t, y0 + t, t, h - 2 * t, c, a);
}

/** Rotated rect. `fn(lx, ly)` gets local coords (origin at centre) -> [r,g,b,a]. */
function rotRect(cx, cy, w, h, ang, fn) {
  const cos = Math.cos(-ang);
  const sin = Math.sin(-ang);
  const r = Math.ceil(Math.hypot(w, h) / 2) + 2;
  const X0 = Math.max(0, Math.round(cx - r));
  const Y0 = Math.max(0, Math.round(cy - r));
  const X1 = Math.min(SIZE, Math.round(cx + r));
  const Y1 = Math.min(SIZE, Math.round(cy + r));
  const hw = w / 2;
  const hh = h / 2;
  for (let y = Y0; y < Y1; y++) {
    let i = (y * SIZE + X0) * 3;
    for (let x = X0; x < X1; x++, i += 3) {
      const dx = x - cx;
      const dy = y - cy;
      const lx = dx * cos - dy * sin;
      const ly = dx * sin + dy * cos;
      const cov = clamp01(Math.min(hw - Math.abs(lx), hh - Math.abs(ly)) + 0.5);
      if (cov <= 0) continue;
      const c = fn(lx, ly);
      if (c) blend(i, c[0], c[1], c[2], (c[3] ?? 1) * cov);
    }
  }
}

function disc(cx, cy, r, c, a = 1) {
  const X0 = Math.max(0, Math.floor(cx - r - 1));
  const Y0 = Math.max(0, Math.floor(cy - r - 1));
  const X1 = Math.min(SIZE, Math.ceil(cx + r + 1));
  const Y1 = Math.min(SIZE, Math.ceil(cy + r + 1));
  for (let y = Y0; y < Y1; y++) {
    let i = (y * SIZE + X0) * 3;
    for (let x = X0; x < X1; x++, i += 3) {
      const cov = clamp01(r - Math.hypot(x - cx, y - cy) + 0.5);
      if (cov > 0) blend(i, c[0], c[1], c[2], a * cov);
    }
  }
}

function ellipse(cx, cy, rx, ry, c, a = 1) {
  const X0 = Math.max(0, Math.floor(cx - rx - 1));
  const Y0 = Math.max(0, Math.floor(cy - ry - 1));
  const X1 = Math.min(SIZE, Math.ceil(cx + rx + 1));
  const Y1 = Math.min(SIZE, Math.ceil(cy + ry + 1));
  for (let y = Y0; y < Y1; y++) {
    let i = (y * SIZE + X0) * 3;
    for (let x = X0; x < X1; x++, i += 3) {
      const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
      if (d < 1) blend(i, c[0], c[1], c[2], a * clamp01((1 - d) * Math.min(rx, ry)));
    }
  }
}

/** Soft-edged ellipse — for anything atmospheric (puddles, holo pools, grime). */
function blob(cx, cy, rx, ry, c, a = 1, power = 2) {
  const X0 = Math.max(0, Math.floor(cx - rx));
  const Y0 = Math.max(0, Math.floor(cy - ry));
  const X1 = Math.min(SIZE, Math.ceil(cx + rx));
  const Y1 = Math.min(SIZE, Math.ceil(cy + ry));
  for (let y = Y0; y < Y1; y++) {
    let i = (y * SIZE + X0) * 3;
    for (let x = X0; x < X1; x++, i += 3) {
      const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
      if (d < 1) blend(i, c[0], c[1], c[2], a * Math.pow(1 - d, power));
    }
  }
}

function ring(cx, cy, r, t, c, a = 1) {
  const X0 = Math.max(0, Math.floor(cx - r - t));
  const Y0 = Math.max(0, Math.floor(cy - r - t));
  const X1 = Math.min(SIZE, Math.ceil(cx + r + t));
  const Y1 = Math.min(SIZE, Math.ceil(cy + r + t));
  for (let y = Y0; y < Y1; y++) {
    let i = (y * SIZE + X0) * 3;
    for (let x = X0; x < X1; x++, i += 3) {
      const cov = clamp01(t / 2 - Math.abs(Math.hypot(x - cx, y - cy) - r) + 0.5);
      if (cov > 0) blend(i, c[0], c[1], c[2], a * cov);
    }
  }
}

/** Additive radial glow — the workhorse for neon and street lamps. */
function glow(cx, cy, r, c, strength) {
  const X0 = Math.max(0, Math.floor(cx - r));
  const Y0 = Math.max(0, Math.floor(cy - r));
  const X1 = Math.min(SIZE, Math.ceil(cx + r));
  const Y1 = Math.min(SIZE, Math.ceil(cy + r));
  for (let y = Y0; y < Y1; y++) {
    let i = (y * SIZE + X0) * 3;
    for (let x = X0; x < X1; x++, i += 3) {
      const f = 1 - Math.hypot(x - cx, y - cy) / r;
      if (f > 0) add(i, c[0], c[1], c[2], f * f * strength);
    }
  }
}

/** Additive glow spreading `r` px outwards from a rect (neon tubes, signs). */
function glowRect(x0, y0, w, h, r, c, strength) {
  const X0 = Math.max(0, Math.floor(x0 - r));
  const Y0 = Math.max(0, Math.floor(y0 - r));
  const X1 = Math.min(SIZE, Math.ceil(x0 + w + r));
  const Y1 = Math.min(SIZE, Math.ceil(y0 + h + r));
  for (let y = Y0; y < Y1; y++) {
    let i = (y * SIZE + X0) * 3;
    for (let x = X0; x < X1; x++, i += 3) {
      const dx = Math.max(x0 - x, 0, x - (x0 + w));
      const dy = Math.max(y0 - y, 0, y - (y0 + h));
      const f = 1 - Math.hypot(dx, dy) / r;
      if (f > 0) add(i, c[0], c[1], c[2], f * f * strength);
    }
  }
}

/** Ambient occlusion ring: darkens everything within `r` px outside a rect. */
function ao(x0, y0, w, h, r, strength) {
  const X0 = Math.max(0, Math.floor(x0 - r));
  const Y0 = Math.max(0, Math.floor(y0 - r));
  const X1 = Math.min(SIZE, Math.ceil(x0 + w + r));
  const Y1 = Math.min(SIZE, Math.ceil(y0 + h + r));
  for (let y = Y0; y < Y1; y++) {
    let i = (y * SIZE + X0) * 3;
    for (let x = X0; x < X1; x++, i += 3) {
      const dx = Math.max(x0 - x, 0, x - (x0 + w));
      const dy = Math.max(y0 - y, 0, y - (y0 + h));
      const d = Math.hypot(dx, dy);
      if (d === 0 || d >= r) continue;
      const f = 1 - d / r;
      scale(i, 1 - strength * f * f);
    }
  }
}

function dashesV(x, y0, y1, w, on, off, c, a = 1) {
  for (let y = y0; y < y1; y += on + off) rect(x - w / 2, y, w, Math.min(on, y1 - y), c, a);
}

function dashesH(y, x0, x1, h, on, off, c, a = 1) {
  for (let x = x0; x < x1; x += on + off) rect(x, y - h / 2, Math.min(on, x1 - x), h, c, a);
}

// ------------------------------------------------------------ png output --
const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(b) {
  let c = 0xffffffff;
  for (const byte of b) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
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

/** Truecolour 8-bit PNG with per-scanline adaptive filtering (keeps the file small). */
function encodePng(rgb, w, h) {
  const bpp = 3;
  const stride = w * bpp;
  const raw = Buffer.allocUnsafe((stride + 1) * h);
  const cand = Buffer.allocUnsafe(stride);
  const best = Buffer.allocUnsafe(stride);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const line = rgb.subarray(y * stride, (y + 1) * stride);
    let bestType = 0;
    let bestScore = Infinity;
    for (let t = 0; t < 5; t++) {
      let s = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? line[i - bpp] : 0;
        const b = prev[i];
        let v;
        if (t === 0) v = line[i];
        else if (t === 1) v = line[i] - a;
        else if (t === 2) v = line[i] - b;
        else if (t === 3) v = line[i] - ((a + b) >> 1);
        else {
          const c = i >= bpp ? prev[i - bpp] : 0;
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          v = line[i] - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
        }
        v &= 0xff;
        cand[i] = v;
        s += v < 128 ? v : 256 - v;
      }
      if (s < bestScore) {
        bestScore = s;
        bestType = t;
        cand.copy(best);
      }
    }
    raw[y * (stride + 1)] = bestType;
    best.copy(raw, y * (stride + 1) + 1);
    prev = line;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- layout --
const AVE = { x0: 1400, x1: 2400 }; // north-south avenue, 20 m
const CROSS = { y0: 2400, y1: 3000 }; // east-west street, 12 m
const WALK = 200; // sidewalk depth, 4 m
const CORNER_R = 150; // kerb radius at the intersection, 3 m
const AVE_MID = (AVE.x0 + AVE.x1) / 2;
const CROSS_MID = (CROSS.y0 + CROSS.y1) / 2;
const PARK_W = 110; // kerbside parking lane, 2.2 m
const MEDIAN_W = 100; // raised median, 2 m
const AVE_LANE = (AVE_MID - MEDIAN_W / 2 - (AVE.x0 + PARK_W)) / 2; // 170 px = 3.4 m
const CROSS_LANE = CROSS_MID - (CROSS.y0 + PARK_W); // 190 px = 3.8 m

// Right-hand traffic. On the avenue the east half runs north and the west half
// runs south; on the cross street the north lane runs west and the south lane
// runs east. Every vehicle, arrow and stop bar is positioned from these.
const HEAD = { n: -Math.PI / 2, s: Math.PI / 2, e: 0, w: Math.PI };
const LANE = {
  parkW: AVE.x0 + PARK_W / 2,
  parkE: AVE.x1 - PARK_W / 2,
  sbOuter: AVE.x0 + PARK_W + AVE_LANE / 2,
  sbInner: AVE.x0 + PARK_W + AVE_LANE * 1.5,
  nbInner: AVE.x1 - PARK_W - AVE_LANE * 1.5,
  nbOuter: AVE.x1 - PARK_W - AVE_LANE / 2,
  parkN: CROSS.y0 + PARK_W / 2,
  parkS: CROSS.y1 - PARK_W / 2,
  wb: CROSS.y0 + PARK_W + CROSS_LANE / 2,
  eb: CROSS.y1 - PARK_W - CROSS_LANE / 2,
};

// Kerb corners: quarter-circle centred so the arc is tangent to both kerb lines.
const CORNERS = [
  {
    cx: AVE.x0 - CORNER_R,
    cy: CROSS.y0 - CORNER_R,
    x0: AVE.x0 - CORNER_R,
    y0: CROSS.y0 - CORNER_R,
  },
  { cx: AVE.x1 + CORNER_R, cy: CROSS.y0 - CORNER_R, x0: AVE.x1, y0: CROSS.y0 - CORNER_R },
  { cx: AVE.x0 - CORNER_R, cy: CROSS.y1 + CORNER_R, x0: AVE.x0 - CORNER_R, y0: CROSS.y1 },
  { cx: AVE.x1 + CORNER_R, cy: CROSS.y1 + CORNER_R, x0: AVE.x1, y0: CROSS.y1 },
].map((c) => ({ ...c, x1: c.x0 + CORNER_R, y1: c.y0 + CORNER_R }));

const KIND_ROAD = 0;
const KIND_WALK = 1;
const KIND_BLOCK = 2;
const kind = new Uint8Array(SIZE * SIZE);

function classify() {
  for (let y = 0; y < SIZE; y++) {
    const inCross = y >= CROSS.y0 && y < CROSS.y1;
    const nearCross = y >= CROSS.y0 - WALK && y < CROSS.y1 + WALK;
    for (let x = 0; x < SIZE; x++) {
      const inAve = x >= AVE.x0 && x < AVE.x1;
      let k;
      if (inAve || inCross) k = KIND_ROAD;
      else if (nearCross || (x >= AVE.x0 - WALK && x < AVE.x1 + WALK)) k = KIND_WALK;
      else k = KIND_BLOCK;
      if (k === KIND_WALK) {
        for (const c of CORNERS) {
          if (x >= c.x0 && x < c.x1 && y >= c.y0 && y < c.y1) {
            if (Math.hypot(x - c.cx, y - c.cy) > CORNER_R) k = KIND_ROAD;
            break;
          }
        }
      }
      kind[y * SIZE + x] = k;
    }
  }
}

// ------------------------------------------------------------ ground pass --
function ground() {
  for (let y = 0; y < SIZE; y++) {
    let i = y * SIZE * 3;
    let j = y * SIZE;
    for (let x = 0; x < SIZE; x++, i += 3, j++) {
      const k = kind[j];
      const n = vnoise(x, y, 220, 11) * 0.6 + vnoise(x, y, 34, 12) * 0.4;
      let c;
      if (k === KIND_ROAD) {
        c = mix(C.asphalt, C.asphaltHi, n * 0.85);
      } else if (k === KIND_WALK) {
        // Paving slabs: 3 m grid, seams a touch darker than the slab face.
        const seam = (x + 40) % 150 < 4 || (y + 70) % 150 < 4;
        c = mix(C.walk, C.walkHi, n * 0.7);
        if (seam) c = mix(c, C.walkSeam, 0.75);
      } else {
        c = mix(C.lot, shade(C.lot, 1.35), n * 0.8);
      }
      buf[i] = c[0];
      buf[i + 1] = c[1];
      buf[i + 2] = c[2];
    }
  }
}

/** Kerb face + gutter shadow, derived from the class map so rounded corners work. */
function kerbs() {
  for (let y = 1; y < SIZE - 1; y++) {
    for (let x = 1; x < SIZE - 1; x++) {
      const j = y * SIZE + x;
      const k = kind[j];
      if (k === KIND_ROAD) {
        if (
          kind[j - 1] === KIND_WALK ||
          kind[j + 1] === KIND_WALK ||
          kind[j - SIZE] === KIND_WALK ||
          kind[j + SIZE] === KIND_WALK
        ) {
          blend(j * 3, C.gutter[0], C.gutter[1], C.gutter[2], 0.85);
        }
      } else if (k === KIND_WALK) {
        if (
          kind[j - 1] === KIND_ROAD ||
          kind[j + 1] === KIND_ROAD ||
          kind[j - SIZE] === KIND_ROAD ||
          kind[j + SIZE] === KIND_ROAD
        ) {
          blend(j * 3, C.curb[0], C.curb[1], C.curb[2], 0.9);
        }
      }
    }
  }
}

/**
 * Widen the kerb highlight and darken the gutter, following the kerb line itself
 * (including the rounded corners) via a capped chamfer distance transform.
 */
function kerbShading() {
  const CAP = 40;
  const d = new Uint8Array(SIZE * SIZE).fill(CAP);
  for (let y = 1; y < SIZE - 1; y++) {
    for (let x = 1; x < SIZE - 1; x++) {
      const j = y * SIZE + x;
      const k = kind[j];
      if (k === KIND_BLOCK) continue;
      const other = k === KIND_ROAD ? KIND_WALK : KIND_ROAD;
      if (
        kind[j - 1] === other ||
        kind[j + 1] === other ||
        kind[j - SIZE] === other ||
        kind[j + SIZE] === other
      ) {
        d[j] = 0;
      }
    }
  }
  for (let y = 1; y < SIZE; y++) {
    for (let x = 1; x < SIZE; x++) {
      const j = y * SIZE + x;
      const v = Math.min(d[j], d[j - 1] + 1, d[j - SIZE] + 1, d[j - SIZE - 1] + 2);
      d[j] = v > CAP ? CAP : v;
    }
  }
  for (let y = SIZE - 2; y >= 0; y--) {
    for (let x = SIZE - 2; x >= 0; x--) {
      const j = y * SIZE + x;
      const v = Math.min(d[j], d[j + 1] + 1, d[j + SIZE] + 1, d[j + SIZE + 1] + 2);
      d[j] = v > CAP ? CAP : v;
    }
  }
  for (let j = 0; j < SIZE * SIZE; j++) {
    const dist = d[j];
    if (dist >= 30) continue;
    const k = kind[j];
    if (k === KIND_WALK && dist < 16) {
      blend(j * 3, C.curb[0], C.curb[1], C.curb[2], 0.42 * (1 - dist / 16));
    } else if (k === KIND_ROAD && dist < 28) {
      blend(j * 3, C.gutter[0], C.gutter[1], C.gutter[2], 0.5 * (1 - dist / 28));
    }
  }
}

/** Wear and tear: repair patches, oil stains, cracks, tyre polish, drains. */
function asphaltWear() {
  const r = rng(9001);
  // Repair patches — slightly different mix, dark seam around them.
  for (let n = 0; n < 22; n++) {
    const x = r() * SIZE;
    const y = r() * SIZE;
    if (kind[(Math.floor(y) * SIZE + Math.floor(x)) | 0] !== KIND_ROAD) continue;
    const w = 120 + r() * 420;
    const h = 100 + r() * 300;
    rect(x, y, w, h, shade(C.asphalt, 0.82 + r() * 0.5), 0.5);
    outline(x, y, w, h, C.gutter, 0.5, 3);
  }
  // Oil stains and puddle-dark blotches.
  for (let n = 0; n < 60; n++) {
    const x = r() * SIZE;
    const y = r() * SIZE;
    if (kind[Math.floor(y) * SIZE + Math.floor(x)] !== KIND_ROAD) continue;
    blob(x, y, 26 + r() * 110, 20 + r() * 85, C.gutter, 0.18 + r() * 0.2);
  }
  // Tyre polish down the driving lanes.
  for (const c of [LANE.sbOuter, LANE.sbInner, LANE.nbInner, LANE.nbOuter]) {
    const x = c - 50; // the two tracks below straddle x .. x + 100
    rect(x - 34, 0, 68, SIZE, C.asphaltHi, 0.07);
    rect(x + 66, 0, 68, SIZE, C.asphaltHi, 0.07);
  }
  for (const c of [LANE.wb, LANE.eb]) {
    const y = c - 50;
    rect(0, y - 34, SIZE, 68, C.asphaltHi, 0.07);
    rect(0, y + 66, SIZE, 68, C.asphaltHi, 0.07);
  }
  // Cracks: short random walks.
  for (let n = 0; n < 90; n++) {
    let x = r() * SIZE;
    let y = r() * SIZE;
    if (kind[Math.floor(y) * SIZE + Math.floor(x)] !== KIND_ROAD) continue;
    let a = r() * Math.PI * 2;
    const len = 40 + r() * 260;
    for (let s = 0; s < len; s += 2) {
      a += (r() - 0.5) * 0.5;
      x += Math.cos(a) * 2;
      y += Math.sin(a) * 2;
      if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) break;
      if (kind[Math.floor(y) * SIZE + Math.floor(x)] !== KIND_ROAD) break;
      disc(x, y, 1.6, C.gutter, 0.55);
    }
  }
  // Manhole covers and storm drains.
  for (const [x, y] of [
    [1520, 900],
    [2280, 1850],
    [1900, 2700],
    [1610, 3500],
    [900, 2500],
    [3300, 2900],
    [2330, 640],
  ]) {
    disc(x, y, 46, shade(C.metalDark, 0.9), 1);
    ring(x, y, 40, 4, C.metal, 0.5);
    ring(x, y, 24, 3, C.metal, 0.28);
    for (let a = 0; a < 14; a++) {
      const t = (a / 14) * Math.PI * 2;
      disc(x + Math.cos(t) * 33, y + Math.sin(t) * 33, 4, C.metal, 0.3);
    }
  }
  for (const [x, y, w, h] of [
    [AVE.x0 + 6, 1200, 20, 90],
    [AVE.x1 - 26, 3400, 20, 90],
    [700, CROSS.y1 - 26, 90, 20],
    [3100, CROSS.y0 + 6, 90, 20],
  ]) {
    rect(x, y, w, h, [10, 12, 16], 0.9);
    outline(x - 4, y - 4, w + 8, h + 8, C.metal, 0.4, 3);
  }
}

// -------------------------------------------------------- road markings --
function markings() {
  const stopGap = 40;
  // Lane dividers on the avenue (two lanes each way), skipping the junction box.
  for (const x of [(LANE.sbOuter + LANE.sbInner) / 2, (LANE.nbInner + LANE.nbOuter) / 2]) {
    dashesV(x, 0, CROSS.y0 - 260, 12, 160, 240, C.paint, 0.55);
    dashesV(x, CROSS.y1 + 260, SIZE, 12, 160, 240, C.paint, 0.55);
  }
  // Centre line of the cross street.
  dashesH(CROSS_MID, 0, AVE.x0 - 260, 12, 150, 220, C.paint, 0.55);
  dashesH(CROSS_MID, AVE.x1 + 260, SIZE, 12, 150, 220, C.paint, 0.55);
  // Parking-lane edge lines.
  rect(AVE.x0 + PARK_W - 5, 0, 10, CROSS.y0 - 300, C.paint, 0.3);
  rect(AVE.x0 + PARK_W - 5, CROSS.y1 + 300, 10, SIZE, C.paint, 0.3);
  rect(AVE.x1 - PARK_W - 5, 0, 10, CROSS.y0 - 300, C.paint, 0.3);
  rect(AVE.x1 - PARK_W - 5, CROSS.y1 + 300, 10, SIZE, C.paint, 0.3);

  // Raised median with a kerb, away from the junction.
  for (const [y0, y1] of [
    [0, CROSS.y0 - 500],
    [CROSS.y1 + 500, SIZE],
  ]) {
    const face = mix(C.walk, C.asphalt, 0.12);
    const noseLen = 140;
    const tipY = y0 === 0 ? y1 : y0; // free end facing the junction
    const bodyY0 = y0 === 0 ? y0 : y0 + noseLen;
    const bodyY1 = y0 === 0 ? y1 - noseLen : y1;
    rect(AVE_MID - 56, bodyY0, 112, bodyY1 - bodyY0, C.gutter, 0.6); // shadow onto the road
    rect(AVE_MID - 50, bodyY0, 100, bodyY1 - bodyY0, face, 1);
    rect(AVE_MID - 50, bodyY0, 9, bodyY1 - bodyY0, C.curb, 0.9);
    rect(AVE_MID + 41, bodyY0, 9, bodyY1 - bodyY0, C.curb, 0.9);
    rectFn(AVE_MID - 41, bodyY0, 82, bodyY1 - bodyY0, (x, y) => {
      const n = vnoise(x, y, 26, 31);
      return [C.walkSeam[0], C.walkSeam[1], C.walkSeam[2], n * 0.4];
    });
    // Chamfered nose, painted with a hazard hatch rather than a solid wedge.
    const noseY0 = y0 === 0 ? tipY - noseLen : tipY;
    rectFn(AVE_MID - 56, noseY0, 112, noseLen, (x, y) => {
      const t = Math.abs(y - tipY); // 0 at the tip, noseLen at full width
      const w = 100 * (t / noseLen);
      const off = Math.abs(x + 0.5 - AVE_MID);
      if (off > w / 2) {
        if (off > w / 2 + 6) return null; // leave the road as it is
        return [...C.gutter, 0.5]; // kerb shadow following the chamfer
      }
      return (x + y) % 96 < 42 ? [...C.paintY, 0.55] : [...face, 1];
    });
  }
  // Bollards along the median.
  for (const [y0, y1] of [
    [120, CROSS.y0 - 560],
    [CROSS.y1 + 560, SIZE - 120],
  ]) {
    for (let y = y0; y < y1; y += 420) {
      disc(AVE_MID, y, 13, C.metalDark, 1);
      ring(AVE_MID, y, 13, 4, C.metal, 0.7);
      disc(AVE_MID, y, 5, C.amber, 0.8);
    }
  }

  // Zebra crossings on all four approaches (stripes run with the traffic).
  const zebra = (x0, y0, w, h, vertical) => {
    if (vertical) {
      for (let x = x0 + 20; x < x0 + w - 20; x += 100) rect(x, y0, 52, h, C.paint, 0.62);
    } else {
      for (let y = y0 + 20; y < y0 + h - 20; y += 100) rect(x0, y, w, 52, C.paint, 0.62);
    }
  };
  zebra(AVE.x0, CROSS.y0 - 220, AVE.x1 - AVE.x0, 200, true);
  zebra(AVE.x0, CROSS.y1 + 20, AVE.x1 - AVE.x0, 200, true);
  zebra(AVE.x0 - 220, CROSS.y0, 200, CROSS.y1 - CROSS.y0, false);
  zebra(AVE.x1 + 20, CROSS.y0, 200, CROSS.y1 - CROSS.y0, false);

  // Stop bars, one per approach, on the near half of the roadway.
  const laneSpan = AVE_LANE * 2;
  // Southbound approaches from the north, northbound from the south, and so on.
  rect(AVE.x0 + PARK_W, CROSS.y0 - 220 - stopGap - 24, laneSpan, 24, C.paint, 0.7);
  rect(AVE_MID + MEDIAN_W / 2, CROSS.y1 + 220 + stopGap, laneSpan, 24, C.paint, 0.7);
  rect(AVE.x0 - 220 - stopGap - 24, CROSS_MID, 24, CROSS_LANE, C.paint, 0.7);
  rect(AVE.x1 + 220 + stopGap, CROSS.y0 + PARK_W, 24, CROSS_LANE, C.paint, 0.7);

  // Lane arrows on the approaches.
  const arrow = (cx, cy, ang) => {
    rotRect(cx, cy, 150, 26, ang, () => C.paint.concat(0.6));
    for (let s = 0; s < 60; s++) {
      const w = 78 * (1 - s / 60);
      const px = cx + Math.cos(ang) * (75 + s);
      const py = cy + Math.sin(ang) * (75 + s);
      rotRect(px, py, 1.6, w, ang, () => C.paint.concat(0.6));
    }
  };
  arrow(LANE.sbOuter, 1300, HEAD.s);
  arrow(LANE.sbInner, 1300, HEAD.s);
  arrow(LANE.nbInner, 3650, HEAD.n);
  arrow(LANE.nbOuter, 3650, HEAD.n);
  arrow(880, LANE.eb, HEAD.e);
  arrow(3160, LANE.wb, HEAD.w);

  // Tactile paving at the crossing landings.
  const pads = [
    [AVE.x0 - 200, CROSS.y0 - 200],
    [AVE.x1, CROSS.y0 - 200],
    [AVE.x0 - 200, CROSS.y1],
    [AVE.x1, CROSS.y1],
  ];
  for (const [px, py] of pads) {
    for (let y = 0; y < 200; y += 26) {
      for (let x = 0; x < 200; x += 26) {
        if (kind[Math.floor(py + y + 13) * SIZE + Math.floor(px + x + 13)] !== KIND_WALK) continue;
        disc(px + x + 13, py + y + 13, 7, C.paintY, 0.22);
      }
    }
  }
}

// ------------------------------------------------------------- buildings --
const placed = [];

function overlaps(x, y, w, h) {
  return placed.some((p) => x < p.x + p.w && x + w > p.x && y < p.y + p.h && y + h > p.y);
}

function roofClutter(x0, y0, w, h, seed, density = 1) {
  const r = rng(seed);
  placed.length = 0;
  const pad = 60;
  const put = (cw, ch, draw) => {
    for (let t = 0; t < 40; t++) {
      const x = x0 + pad + r() * (w - 2 * pad - cw);
      const y = y0 + pad + r() * (h - 2 * pad - ch);
      if (x < x0 + pad || y < y0 + pad) continue;
      if (overlaps(x - 30, y - 30, cw + 60, ch + 60)) continue;
      placed.push({ x, y, w: cw, h: ch });
      draw(x, y, cw, ch);
      return;
    }
  };

  // Tar seams across the whole roof.
  for (let y = y0 + 150; y < y0 + h; y += 150) rect(x0, y, w, 3, C.roofTar, 0.5);
  for (let x = x0 + 150; x < x0 + w; x += 150) rect(x, y0, 3, h, C.roofTar, 0.5);

  const area = (w * h) / (1000 * 1000);
  // HVAC units (2 x 1.5 m) with a fan grille.
  for (let n = 0; n < Math.round(4 * area * density); n++) {
    put(100, 75, (x, y, cw, ch) => {
      rect(x + 8, y + 10, cw, ch, [0, 0, 0], 0.35);
      rect(x, y, cw, ch, C.metalDark, 1);
      rect(x + 4, y + 4, cw - 8, ch - 8, C.metal, 0.55);
      disc(x + cw / 2, y + ch / 2, ch / 2 - 10, shade(C.metalDark, 0.8), 1);
      for (let a = 0; a < 6; a++) {
        const t = (a / 6) * Math.PI * 2;
        rotRect(x + cw / 2, y + ch / 2, ch - 22, 4, t, () => C.metal.concat(0.6));
      }
    });
  }
  // Water tanks.
  for (let n = 0; n < Math.round(1.2 * area * density); n++) {
    put(125, 125, (x, y, cw) => {
      const cx = x + cw / 2;
      const cy = y + cw / 2;
      disc(cx + 8, cy + 10, cw / 2, [0, 0, 0], 0.35);
      disc(cx, cy, cw / 2, C.metalDark, 1);
      ring(cx, cy, cw / 2 - 6, 5, C.metal, 0.7);
      ring(cx, cy, cw / 2 - 26, 4, C.metal, 0.4);
      disc(cx, cy, 10, C.metal, 0.6);
    });
  }
  // Skylights, faintly lit from inside.
  for (let n = 0; n < Math.round(1.6 * area * density); n++) {
    put(180, 110, (x, y, cw, ch) => {
      rect(x, y, cw, ch, C.metalDark, 1);
      rect(x + 8, y + 8, cw - 16, ch - 16, C.glass, 0.9);
      const tint = r() > 0.5 ? C.amber : C.cyan;
      rect(x + 8, y + 8, cw - 16, ch - 16, tint, 0.18);
      rect(x + cw / 2 - 3, y + 8, 6, ch - 16, C.metalDark, 0.8);
      glowRect(x + 8, y + 8, cw - 16, ch - 16, 55, tint, 0.07);
    });
  }
  // Vent pipes.
  for (let n = 0; n < Math.round(5 * area * density); n++) {
    put(34, 34, (x, y, cw) => {
      disc(x + cw / 2 + 4, y + cw / 2 + 5, cw / 2, [0, 0, 0], 0.3);
      disc(x + cw / 2, y + cw / 2, cw / 2, C.metalDark, 1);
      disc(x + cw / 2, y + cw / 2, cw / 2 - 6, [12, 14, 18], 0.9);
    });
  }
  // Satellite dishes.
  for (let n = 0; n < Math.round(0.9 * area * density); n++) {
    put(110, 110, (x, y, cw) => {
      const cx = x + cw / 2;
      const cy = y + cw / 2;
      disc(cx + 7, cy + 9, cw / 2 - 6, [0, 0, 0], 0.3);
      disc(cx, cy, cw / 2 - 6, C.concrete, 1);
      ring(cx, cy, cw / 2 - 8, 5, C.metal, 0.6);
      disc(cx, cy, 12, C.metalDark, 1);
      rotRect(cx, cy, cw / 2, 6, r() * Math.PI, () => C.metal.concat(0.8));
    });
  }
  // Stairwell head-house with a door.
  put(200, 150, (x, y, cw, ch) => {
    rect(x + 10, y + 14, cw, ch, [0, 0, 0], 0.4);
    rect(x, y, cw, ch, mix(C.roof, C.concrete, 0.5), 1);
    outline(x, y, cw, ch, C.parapet, 0.7, 5);
    rect(x + cw / 2 - 30, y + ch - 8, 60, 8, C.metalDark, 1);
    disc(x + cw / 2, y + ch + 10, 26, C.lamp, 0.1);
  });
  // Roof grime, water stains and the odd tag.
  for (let n = 0; n < 10; n++) {
    blob(x0 + r() * w, y0 + r() * h, 60 + r() * 190, 45 + r() * 140, C.roofTar, 0.16 + r() * 0.14);
  }
  if (r() > 0.55) {
    const gx = x0 + 140 + r() * (w - 380);
    const gy = y0 + 140 + r() * (h - 320);
    const col = shade([C.magenta, C.lime, C.cyan][Math.floor(r() * 3)], 0.55);
    for (let s = 0; s < 5; s++) {
      rotRect(gx + s * 34, gy + Math.sin(s) * 34, 20, 80 + r() * 50, r() * 0.7 - 0.35, () =>
        col.concat(0.16),
      );
    }
  }
}

function building(x0, y0, w, h, opts = {}) {
  const { tone = 0, seed = 1, density = 1, clutter = true, gravel = false } = opts;
  // Offset drop shadow first, then a soft occlusion ring, so the mass reads as tall.
  rect(x0 + 24, y0 + 30, w, h, [0, 0, 0], 0.18);
  ao(x0, y0, w, h, 80, 0.5);
  const base = mix(C.roof, C.roofAlt, tone);
  rectFn(x0, y0, w, h, (x, y) => {
    const n = vnoise(x, y, 190, 41 + seed) * 0.55 + vnoise(x, y, 30, 42 + seed) * 0.45;
    const c = mix(shade(base, 0.86), shade(base, 1.12), n);
    return [c[0], c[1], c[2], 1];
  });
  // Ballast gravel on flat roofs — coarse enough to survive PNG compression.
  if (gravel) {
    rectFn(x0, y0, w, h, (x, y) => {
      const n = hash2(Math.floor(x / 3), Math.floor(y / 3), seed);
      if (n < 0.84) return null;
      const c = shade(C.concrete, 0.55 + n * 0.5);
      return [c[0], c[1], c[2], 0.4];
    });
  }
  // Parapet: light cap outside, dark shadow inside.
  outline(x0, y0, w, h, C.parapet, 0.85, 14);
  outline(x0 + 14, y0 + 14, w - 28, h - 28, C.roofTar, 0.5, 8);
  if (clutter) roofClutter(x0, y0, w, h, seed * 977, density);
}

// ----------------------------------------------------------- alley props --
function alley(x0, y0, w, h, seed) {
  const r = rng(seed);
  rectFn(x0, y0, w, h, (x, y) => {
    const n = vnoise(x, y, 120, 61) * 0.6 + vnoise(x, y, 22, 62) * 0.4;
    const c = mix(shade(C.lot, 0.75), C.lot, n);
    return [c[0], c[1], c[2], 1];
  });
  // Grime creeping out of the corners.
  for (let n = 0; n < 14; n++) {
    blob(x0 + r() * w, y0 + r() * h, 26 + r() * 90, 20 + r() * 65, [10, 12, 16], 0.24);
  }
  const horizontal = w > h;
  const narrow = horizontal ? h : w;
  // Fire escapes hugging the walls (never more than a third of a tight alley).
  const steps = horizontal ? Math.floor(w / 700) : Math.floor(h / 700);
  for (let s = 0; s < steps; s++) {
    const along = (horizontal ? w : h) * ((s + 0.5) / steps);
    const depth = Math.min(55, narrow * 0.3);
    const side = r() > 0.5 ? 0 : 1;
    const px = horizontal ? x0 + along - 130 : side ? x0 + w - depth : x0;
    const py = horizontal ? (side ? y0 + h - depth : y0) : y0 + along - 130;
    const pw = horizontal ? 260 : depth;
    const ph = horizontal ? depth : 260;
    rect(px, py, pw, ph, C.metalDark, 0.95);
    for (let t = 8; t < (horizontal ? pw : ph); t += 16) {
      if (horizontal) rect(px + t, py + 5, 7, ph - 10, C.metal, 0.4);
      else rect(px + 5, py + t, pw - 10, 7, C.metal, 0.4);
    }
  }
  // Dumpsters, crates and bags.
  const n = Math.max(2, Math.round((w * h) / 400000));
  for (let s = 0; s < n; s++) {
    // Keep props inside the walls — a 2 m alley has no room to scatter them.
    const cx = x0 + Math.min(120, w / 2) + r() * Math.max(0, w - 240);
    const cy = y0 + Math.min(90, h / 2) + r() * Math.max(0, h - 180);
    const ang = (horizontal ? 0 : Math.PI / 2) + (r() - 0.5) * 0.25;
    const col = r() > 0.5 ? [46, 78, 62] : C.rust;
    rotRect(cx + 10, cy + 12, 92, 62, ang, () => [0, 0, 0, 0.4]);
    rotRect(cx, cy, 92, 62, ang, (lx, ly) => {
      const edge = Math.abs(lx) > 40 || Math.abs(ly) > 25;
      const k = 1 - Math.abs(ly) / 60;
      return [...(edge ? shade(col, 0.7) : shade(col, k)), 1];
    });
    rotRect(cx, cy, 84, 6, ang, () => shade(C.metalDark, 1.2).concat(0.9));
  }
  for (let s = 0; s < n * 4; s++) {
    const cx = x0 + Math.min(40, w / 2) + r() * Math.max(0, w - 80);
    const cy = y0 + Math.min(40, h / 2) + r() * Math.max(0, h - 80);
    if (r() > 0.5) {
      disc(cx, cy, 12 + r() * 14, [26, 26, 30], 0.9);
      disc(cx - 4, cy - 4, 6, [44, 44, 50], 0.5);
    } else {
      rotRect(cx, cy, 40 + r() * 30, 34 + r() * 20, r() * Math.PI, (lx, ly) => {
        const edge = Math.abs(lx) > 14 || Math.abs(ly) > 12;
        return [...(edge ? shade(C.dirt, 0.8) : C.dirt), 0.9];
      });
    }
  }
  // A single door light spilling into the alley.
  const dx = horizontal ? x0 + w * 0.35 : x0 + (r() > 0.5 ? w : 0);
  const dy = horizontal ? y0 + (r() > 0.5 ? h : 0) : y0 + h * 0.4;
  glow(dx, dy, 170, C.amber, 0.13);
  disc(dx, dy, 12, C.amber, 0.85);
}

// --------------------------------------------------------------- vehicles --
function car(cx, cy, ang, body, opts = {}) {
  const { len = 230, wid = 95, underglow = null, taxi = false, lightsOn = false } = opts;
  rotRect(cx + 12, cy + 14, len + 14, wid + 14, ang, () => [0, 0, 0, 0.45]);
  // Body: brightest along the centre line, falling off towards the flanks.
  rotRect(cx, cy, len, wid, ang, (lx, ly) => {
    const t = Math.abs(ly) / (wid / 2);
    const k = 1 - t * t * 0.55;
    const nose = Math.abs(lx) > len / 2 - 20 ? 0.7 : 1;
    return [...shade(body, k * nose), 1];
  });
  // Roof panel — sheet metal catches a little more of the street light.
  rotRect(
    cx - Math.cos(ang) * len * 0.02,
    cy - Math.sin(ang) * len * 0.02,
    len * 0.34,
    wid * 0.8,
    ang,
    (lx, ly) => {
      const t = Math.abs(ly) / (wid * 0.4);
      return [...shade(body, 1.25 - t * 0.35), 1];
    },
  );
  // Glass reads dark from directly above at night, with a thin specular streak.
  const glassC = mix([16, 20, 28], body, 0.2);
  rotRect(
    cx + Math.cos(ang) * len * 0.24,
    cy + Math.sin(ang) * len * 0.24,
    len * 0.15,
    wid * 0.78,
    ang,
    (lx) => [...shade(glassC, 1 + lx / (len * 0.4)), 1],
  );
  rotRect(
    cx - Math.cos(ang) * len * 0.245,
    cy - Math.sin(ang) * len * 0.245,
    len * 0.12,
    wid * 0.74,
    ang,
    () => [...glassC, 1],
  );
  rotRect(cx + Math.cos(ang) * len * 0.28, cy + Math.sin(ang) * len * 0.28, 5, wid * 0.6, ang, () =>
    shade(C.glass, 1.4).concat(0.35),
  );
  // Side mirrors.
  for (const s of [-1, 1]) {
    rotRect(
      cx + Math.cos(ang) * len * 0.16 - Math.sin(ang) * s * (wid / 2 + 8),
      cy + Math.sin(ang) * len * 0.16 + Math.cos(ang) * s * (wid / 2 + 8),
      22,
      12,
      ang,
      () => shade(body, 0.75).concat(1),
    );
  }
  const nx = Math.cos(ang);
  const ny = Math.sin(ang);
  const px = -ny;
  const py = nx;
  const fx = cx + nx * (len / 2 - 10);
  const fy = cy + ny * (len / 2 - 10);
  const bx = cx - nx * (len / 2 - 10);
  const by = cy - ny * (len / 2 - 10);
  for (const s of [-1, 1]) {
    disc(
      fx + px * s * 32,
      fy + py * s * 32,
      11,
      lightsOn ? [255, 250, 235] : [150, 150, 140],
      0.95,
    );
    disc(bx + px * s * 32, by + py * s * 32, 10, C.red, 0.85);
    if (lightsOn) {
      glow(fx + px * s * 32, fy + py * s * 32, 165, C.lamp, 0.16);
      glow(bx + px * s * 32, by + py * s * 32, 60, C.red, 0.12);
    } else {
      glow(bx + px * s * 32, by + py * s * 32, 40, C.red, 0.07);
    }
  }
  if (taxi) {
    rotRect(cx + nx * 8, cy + ny * 8, 34, 60, ang, () => C.amber.concat(0.95));
    glow(cx + nx * 8, cy + ny * 8, 80, C.amber, 0.14);
  }
  if (underglow) {
    glowRect(cx - len / 2, cy - wid / 2, len, wid, 85, underglow, 0.16);
  }
}

/** Box van — reads as a long flat roof with a short cab. */
function van(cx, cy, ang, body, cargo = [178, 182, 188]) {
  const len = 320;
  const wid = 125;
  rotRect(cx + 14, cy + 18, len + 16, wid + 16, ang, () => [0, 0, 0, 0.45]);
  rotRect(cx, cy, len, wid, ang, (lx, ly) => {
    const t = Math.abs(ly) / (wid / 2);
    const isCab = lx > len / 2 - 95;
    const c = isCab ? body : cargo;
    return [...shade(c, 1 - t * t * 0.5), 1];
  });
  rotRect(
    cx + Math.cos(ang) * (len / 2 - 24),
    cy + Math.sin(ang) * (len / 2 - 24),
    34,
    wid * 0.8,
    ang,
    () => mix([16, 20, 28], body, 0.2).concat(1),
  );
  // Ribs on the cargo box.
  for (let s = -2; s <= 2; s++) {
    rotRect(
      cx - Math.cos(ang) * (40 + s * 46),
      cy - Math.sin(ang) * (40 + s * 46),
      5,
      wid - 14,
      ang,
      () => shade(cargo, 0.72).concat(0.8),
    );
  }
  const nx = Math.cos(ang);
  const ny = Math.sin(ang);
  for (const s of [-1, 1]) {
    disc(
      cx + nx * (len / 2 - 10) - ny * s * 44,
      cy + ny * (len / 2 - 10) + nx * s * 44,
      11,
      [150, 150, 140],
      0.9,
    );
    disc(
      cx - nx * (len / 2 - 10) - ny * s * 44,
      cy - ny * (len / 2 - 10) + nx * s * 44,
      10,
      C.red,
      0.85,
    );
  }
}

/** Motorbike — small enough to sit between the parked cars. */
function bike(cx, cy, ang, body) {
  rotRect(cx + 6, cy + 8, 96, 44, ang, () => [0, 0, 0, 0.4]);
  rotRect(cx, cy, 92, 40, ang, (lx, ly) => {
    const t = Math.abs(ly) / 20;
    return [...shade(body, 1 - t * t * 0.5), 1];
  });
  rotRect(cx, cy, 100, 14, ang, () => [22, 24, 30, 1]);
  rotRect(cx, cy, 20, 56, ang, () => shade(C.metalDark, 1.1).concat(1));
  disc(cx + Math.cos(ang) * 44, cy + Math.sin(ang) * 44, 8, [190, 190, 178], 0.9);
  disc(cx - Math.cos(ang) * 44, cy - Math.sin(ang) * 44, 7, C.red, 0.85);
}

function cone(x, y) {
  disc(x + 3, y + 4, 20, [0, 0, 0], 0.35);
  disc(x, y, 20, [196, 88, 30], 1);
  ring(x, y, 13, 7, [230, 230, 226], 0.85);
  disc(x, y, 6, [150, 62, 22], 1);
}

/** A hole in the road with cones and a barrier around it. */
function roadworks(x, y) {
  disc(x, y, 62, [8, 9, 12], 0.95);
  ring(x, y, 62, 8, C.metalDark, 0.9);
  rect(x - 90, y - 74, 180, 22, [200, 96, 34], 0.95);
  for (let s = 0; s < 4; s++) rect(x - 90 + s * 46, y - 74, 22, 22, [226, 226, 222], 0.9);
  for (const [dx, dy] of [
    [-130, -110],
    [-10, -130],
    [110, -100],
    [130, 40],
    [-120, 60],
  ]) {
    cone(x + dx, y + dy);
  }
  glow(x, y - 74, 130, C.amber, 0.1);
}

// --------------------------------------------------------------- fixtures --
function streetLamp(x, y, dir) {
  // Pole on the sidewalk, arm reaching over the roadway.
  const armLen = 240;
  rotRect(
    x + dir[0] * armLen * 0.5,
    y + dir[1] * armLen * 0.5,
    armLen,
    16,
    Math.atan2(dir[1], dir[0]),
    () => C.metalDark.concat(0.9),
  );
  disc(x, y, 22, C.metalDark, 1);
  ring(x, y, 22, 5, C.metal, 0.6);
  const hx = x + dir[0] * armLen;
  const hy = y + dir[1] * armLen;
  rotRect(hx, hy, 74, 34, Math.atan2(dir[1], dir[0]), () => C.metalDark.concat(1));
  disc(hx, hy, 13, [255, 246, 224], 1);
  glow(hx, hy, 340, C.lamp, 0.13);
  glow(hx, hy, 105, C.lamp, 0.2);
}

function trafficLight(x, y, dir, lit) {
  const ang = Math.atan2(dir[1], dir[0]);
  const armLen = 300;
  rotRect(x + dir[0] * armLen * 0.5, y + dir[1] * armLen * 0.5, armLen, 14, ang, () =>
    C.metalDark.concat(0.9),
  );
  disc(x, y, 24, C.metalDark, 1);
  ring(x, y, 24, 6, C.metal, 0.55);
  const hx = x + dir[0] * armLen;
  const hy = y + dir[1] * armLen;
  rotRect(hx + 8, hy + 10, 46, 116, ang + Math.PI / 2, () => [0, 0, 0, 0.4]);
  rotRect(hx, hy, 46, 116, ang + Math.PI / 2, () => C.metalDark.concat(1));
  const cols = [C.red, C.amber, [80, 240, 120]];
  for (let s = 0; s < 3; s++) {
    const off = (s - 1) * 36;
    const lx = hx + Math.cos(ang + Math.PI / 2) * off;
    const ly = hy + Math.sin(ang + Math.PI / 2) * off;
    const on = s === lit;
    disc(lx, ly, 14, on ? cols[s] : shade(cols[s], 0.22), 1);
    if (on) glow(lx, ly, 115, cols[s], 0.18);
  }
}

function bollard(x, y) {
  disc(x + 3, y + 4, 13, [0, 0, 0], 0.4);
  disc(x, y, 13, C.metalDark, 1);
  ring(x, y, 13, 4, C.metal, 0.6);
  ring(x, y, 7, 4, C.amber, 0.45);
}

function trashCan(x, y) {
  disc(x + 4, y + 5, 27, [0, 0, 0], 0.4);
  disc(x, y, 27, C.metalDark, 1);
  ring(x, y, 22, 5, C.metal, 0.5);
  disc(x, y, 13, [16, 18, 22], 0.9);
}

function hydrant(x, y) {
  disc(x + 3, y + 4, 15, [0, 0, 0], 0.4);
  disc(x, y, 15, C.red, 1);
  disc(x, y, 7, shade(C.red, 1.4), 1);
}

/** Neon strip mounted on a facade edge, glowing over the street. */
function neonStrip(x, y, w, h, col, strength = 0.7) {
  rect(x, y, w, h, shade(col, 0.35), 1);
  rect(x + 3, y + 3, w - 6, h - 6, col, 1);
  glowRect(x, y, w, h, 190, col, strength * 0.22);
  glowRect(x, y, w, h, 55, col, strength * 0.34);
}

/** Blade sign hanging out over the sidewalk, perpendicular to the facade. */
function bladeSign(x, y, w, h, col) {
  rect(x + 12, y + 16, w, h, [0, 0, 0], 0.45);
  rect(x, y, w, h, shade(C.metalDark, 0.9), 1);
  rect(x + 8, y + 8, w - 16, h - 16, shade(col, 0.4), 1);
  const stripes = Math.max(2, Math.floor((w > h ? w : h) / 44));
  for (let s = 0; s < stripes; s++) {
    if (w > h) rect(x + 16 + s * 44, y + 16, 22, h - 32, col, 1);
    else rect(x + 16, y + 16 + s * 44, w - 32, 22, col, 1);
  }
  glowRect(x, y, w, h, 230, col, 0.2);
  glowRect(x, y, w, h, 70, col, 0.3);
}

/** Market awning: striped canopy protruding from the facade. */
function awning(x, y, w, h, col, alongX) {
  rect(x + 10, y + 14, w, h, [0, 0, 0], 0.4);
  rect(x, y, w, h, [222, 224, 228], 1);
  const step = 60;
  if (alongX) {
    for (let s = 0; s * step < w; s++) if (s % 2 === 0) rect(x + s * step, y, step, h, col, 0.92);
  } else {
    for (let s = 0; s * step < h; s++) if (s % 2 === 0) rect(x, y + s * step, w, step, col, 0.92);
  }
  rect(x, y, alongX ? w : 8, alongX ? 8 : h, shade(col, 0.5), 0.8);
  glowRect(x, y, w, h, 200, C.lamp, 0.13);
}

/** Chain-link fence: posts plus a faint mesh band. */
function fence(x0, y0, w, h, seed) {
  const r = rng(seed);
  const draw = (x, y, len, horizontal) => {
    if (horizontal) rect(x, y - 4, len, 8, C.metal, 0.28);
    else rect(x - 4, y, 8, len, C.metal, 0.28);
    for (let s = 0; s <= len; s += 180) {
      const px = horizontal ? x + s : x;
      const py = horizontal ? y : y + s;
      disc(px, py, 9, C.metalDark, 1);
      disc(px, py, 5, C.metal, 0.6);
    }
  };
  draw(x0, y0, w, true);
  draw(x0, y0 + h, w, true);
  draw(x0, y0, h, false);
  draw(x0 + w, y0, h, false);
  void r;
}

/** Shipping container, 6 x 2.4 m, with corrugation. */
function container(cx, cy, ang, col) {
  const w = 300;
  const h = 120;
  rotRect(cx + 14, cy + 18, w, h, ang, () => [0, 0, 0, 0.45]);
  rotRect(cx, cy, w, h, ang, (lx, ly) => {
    const corr = Math.sin(lx / 9) * 0.06;
    const edge = Math.abs(lx) > w / 2 - 12 || Math.abs(ly) > h / 2 - 10;
    const k = 1 + corr - Math.abs(ly) / h;
    return [...(edge ? shade(col, 0.65) : shade(col, k)), 1];
  });
  rotRect(cx, cy, 6, h - 16, ang, () => shade(col, 0.5).concat(0.9));
}

// ------------------------------------------------------------ composition --
function blocks() {
  // --- NW block: mid-rise + corner building, L-shaped service alley ---------
  alley(0, 900, 1200, 100, 71);
  alley(600, 1000, 100, 1200, 72);
  building(0, 0, 1200, 900, { tone: 0.2, seed: 3, density: 1 });
  building(0, 1000, 600, 1200, { tone: 0.75, seed: 5, density: 0.9, gravel: true });
  building(700, 1000, 500, 1200, { tone: 0.05, seed: 7, density: 1.1 });

  // --- NE block: megabuilding with helipad, tower, parking lot -------------
  alley(2600, 1300, 1100, 200, 73);
  alley(3700, 0, 100, 1500, 74);
  building(2600, 0, 1100, 1300, { tone: 0.35, seed: 11, density: 0.55 });
  building(3800, 0, 296, 1500, { tone: 0.6, seed: 13, density: 1, gravel: true });
  building(3300, 1500, 796, 700, { tone: 0.1, seed: 17, density: 1.2 });
  parkingLot(2600, 1500, 700, 700);

  // --- SW block: market strip + narrow tenement ----------------------------
  alley(400, 3200, 100, 896, 75);
  building(500, 3200, 700, 896, { tone: 0.15, seed: 19, density: 1 });
  building(0, 3200, 400, 896, { tone: 0.8, seed: 23, density: 0.9, gravel: true });

  // --- SE block: construction lot + block of flats -------------------------
  constructionLot(2600, 3200, 800, 896);
  building(3400, 3200, 696, 896, { tone: 0.45, seed: 29, density: 1.1, gravel: true });

  helipad(3150, 650);
}

function parkingLot(x0, y0, w, h) {
  rectFn(x0, y0, w, h, (x, y) => {
    const n = vnoise(x, y, 150, 81) * 0.6 + vnoise(x, y, 26, 82) * 0.4;
    const c = mix(shade(C.asphalt, 1.1), C.asphaltHi, n * 0.8);
    return [c[0], c[1], c[2], 1];
  });
  for (let n = 0; n < 16; n++) {
    const r = rng(700 + n);
    blob(x0 + r() * w, y0 + r() * h, 38 + r() * 85, 26 + r() * 60, C.gutter, 0.2);
  }
  // Painted bays, 2.5 x 5 m.
  for (let x = x0 + 60; x < x0 + w - 60; x += 125) {
    rect(x, y0 + 80, 8, 250, C.paint, 0.35);
    rect(x, y0 + h - 330, 8, 250, C.paint, 0.35);
  }
  rect(x0 + 60, y0 + 80, w - 120, 8, C.paint, 0.3);
  rect(x0 + 60, y0 + h - 88, w - 120, 8, C.paint, 0.3);
  fence(x0 + 20, y0 + 20, w - 40, h - 40, 91);
  // Cars in the bays.
  const r = rng(555);
  const bodies = [
    [58, 70, 96],
    [96, 52, 60],
    [70, 74, 82],
    [40, 60, 66],
    [110, 96, 70],
  ];
  for (let n = 0; n < 5; n++) {
    const bay = Math.floor(r() * 4);
    const top = r() > 0.5;
    car(
      x0 + 122 + bay * 125,
      top ? y0 + 200 : y0 + h - 210,
      Math.PI / 2 + (r() - 0.5) * 0.06,
      bodies[n % bodies.length],
      { len: 220, wid: 92 },
    );
  }
  streetLamp(x0 + w / 2, y0 + h / 2, [0, -1]);
}

function constructionLot(x0, y0, w, h) {
  const r = rng(313);
  rectFn(x0, y0, w, h, (x, y) => {
    const n = vnoise(x, y, 130, 91) * 0.6 + vnoise(x, y, 20, 92) * 0.4;
    const c = mix(shade(C.dirt, 0.55), shade(C.dirt, 0.95), n);
    return [c[0], c[1], c[2], 1];
  });
  // Exposed slab in one corner.
  rect(x0 + 80, y0 + 380, 420, 400, C.concrete, 0.35);
  outline(x0 + 80, y0 + 380, 420, 400, C.concrete, 0.5, 6);
  // Spoil heaps.
  for (let n = 0; n < 6; n++) {
    const cx = x0 + 120 + r() * (w - 240);
    const cy = y0 + 120 + r() * (h - 240);
    for (let s = 0; s < 5; s++) {
      ellipse(cx, cy, 130 - s * 22, 95 - s * 16, mix(C.dirt, [110, 98, 80], s / 5), 0.5);
    }
  }
  // Rubble.
  for (let n = 0; n < 220; n++) {
    const cx = x0 + Math.min(40, w / 2) + r() * Math.max(0, w - 80);
    const cy = y0 + Math.min(40, h / 2) + r() * Math.max(0, h - 80);
    rotRect(cx, cy, 8 + r() * 26, 6 + r() * 20, r() * Math.PI, () =>
      shade(C.concrete, 0.6 + r() * 0.6).concat(0.85),
    );
  }
  container(x0 + 260, y0 + 170, 0, [58, 92, 84]);
  container(x0 + 430, y0 + 900, Math.PI / 2, C.rust);
  // Stacked pipes.
  for (let s = 0; s < 6; s++) {
    disc(x0 + 620 + (s % 3) * 78, y0 + 620 + Math.floor(s / 3) * 70, 36, C.metalDark, 1);
    ring(x0 + 620 + (s % 3) * 78, y0 + 620 + Math.floor(s / 3) * 70, 26, 8, C.metal, 0.5);
  }
  fence(x0 + 20, y0 + 20, w - 40, h - 40, 97);
  // Hazard tape on the street side.
  for (let x = x0 + 30; x < x0 + w - 30; x += 90) rect(x, y0 + 16, 48, 10, C.paintY, 0.6);
  // Work light on a mast.
  disc(x0 + 700, y0 + 200, 18, C.metalDark, 1);
  disc(x0 + 700, y0 + 200, 9, [255, 250, 230], 1);
  glow(x0 + 700, y0 + 200, 420, C.lamp, 0.13);
}

function helipad(cx, cy) {
  disc(cx, cy, 230, shade(C.roofTar, 1.15), 0.85);
  ring(cx, cy, 200, 14, C.paint, 0.6);
  ring(cx, cy, 176, 5, C.paint, 0.3);
  // "H" — the one bit of lettering that belongs on a rooftop.
  rect(cx - 66, cy - 90, 26, 180, C.paint, 0.75);
  rect(cx + 40, cy - 90, 26, 180, C.paint, 0.75);
  rect(cx - 66, cy - 14, 132, 26, C.paint, 0.75);
  for (let a = 0; a < 10; a++) {
    const t = (a / 10) * Math.PI * 2;
    const lx = cx + Math.cos(t) * 218;
    const ly = cy + Math.sin(t) * 218;
    disc(lx, ly, 9, C.amber, 1);
    glow(lx, ly, 55, C.amber, 0.16);
  }
}

function streetLife() {
  // Kerbside parking — each car faces the way the adjacent lane flows, and the
  // gaps are wide enough that no two vehicles touch.
  const parked = [
    [LANE.parkW, 260, HEAD.s, [62, 74, 100]],
    [LANE.parkW, 560, HEAD.s, [92, 50, 58]],
    [LANE.parkW, 1220, HEAD.s, [72, 76, 84]],
    [LANE.parkW, 1520, HEAD.s, [46, 62, 70]],
    [LANE.parkW, 3520, HEAD.s, [86, 78, 62]],
    [LANE.parkW, 3820, HEAD.s, [58, 64, 78]],
    [LANE.parkE, 420, HEAD.n, [70, 72, 80]],
    [LANE.parkE, 720, HEAD.n, [50, 70, 78]],
    [LANE.parkE, 1780, HEAD.n, [96, 60, 52]],
    [LANE.parkE, 3420, HEAD.n, [64, 68, 88]],
    [LANE.parkE, 3720, HEAD.n, [80, 84, 92]],
    [420, LANE.parkN, HEAD.w, [74, 60, 92]],
    [760, LANE.parkN, HEAD.w, [60, 72, 80]],
    [3420, LANE.parkS, HEAD.e, [88, 62, 56]],
    [3760, LANE.parkS, HEAD.e, [66, 70, 80]],
  ];
  for (const [x, y, ang, col] of parked) car(x, y, ang, col, { len: 226, wid: 92 });

  // The avenue has a red light, so southbound traffic is stacked at the bar.
  car(LANE.sbOuter, 2000, HEAD.s, [40, 46, 62], { lightsOn: true, underglow: C.cyan });
  car(LANE.sbInner, 2000, HEAD.s, [78, 40, 46], { lightsOn: true });
  car(LANE.sbOuter, 1700, HEAD.s, [56, 62, 74], { lightsOn: true });
  // Northbound traffic that already cleared the junction.
  car(LANE.nbInner, 1980, HEAD.n, [70, 58, 84], { lightsOn: true, underglow: C.magenta });
  car(LANE.nbOuter, 1700, HEAD.n, [188, 150, 46], { taxi: true, lightsOn: true });
  car(LANE.nbInner, 3900, HEAD.n, [60, 66, 80], { lightsOn: true });
  // The cross street has green.
  car(880, LANE.wb, HEAD.w, [56, 62, 74], { lightsOn: true });
  car(3450, LANE.wb, HEAD.w, [70, 58, 84], { lightsOn: true });
  car(300, LANE.eb, HEAD.e, [64, 68, 88], { lightsOn: true });

  // Larger vehicles and bikes break up the long empty stretches of tarmac.
  van(LANE.nbInner, 1080, HEAD.n, [58, 66, 84]);
  van(LANE.parkW, 1950, HEAD.s, [52, 60, 70], [120, 126, 132]);
  van(3080, LANE.parkS, HEAD.e, [74, 56, 52], [150, 148, 152]);
  bike(LANE.parkE, 1400, HEAD.n, [128, 44, 52]);
  bike(LANE.parkE, 1520, HEAD.n, [40, 52, 78]);
  bike(LANE.parkW, 3300, HEAD.s, [58, 60, 68]);
  bike(1000, LANE.parkS, HEAD.e, [92, 88, 46]);

  // A dug-up patch of the eastbound carriageway, which is why it is empty.
  roadworks(620, 2860);

  // Litter drifting against the kerbs.
  const lr = rng(8123);
  for (let n = 0; n < 150; n++) {
    const along = lr() * SIZE;
    const kerb = [
      [AVE.x0 + 14 + lr() * 26, along],
      [AVE.x1 - 14 - lr() * 26, along],
      [along, CROSS.y0 + 14 + lr() * 26],
      [along, CROSS.y1 - 14 - lr() * 26],
    ][Math.floor(lr() * 4)];
    const [x, y] = kerb;
    if (kind[Math.floor(y) * SIZE + Math.floor(x)] !== KIND_ROAD) continue;
    if (lr() > 0.4) {
      rotRect(x, y, 6 + lr() * 16, 5 + lr() * 12, lr() * Math.PI, () =>
        shade([86, 88, 92], 0.6 + lr() * 0.6).concat(0.5),
      );
    } else {
      disc(x, y, 3 + lr() * 6, [90, 92, 96], 0.45);
    }
  }

  // Street lamps along both kerbs, arms over the roadway.
  for (const y of [420, 1180, 1940, 3380, 3900]) {
    streetLamp(AVE.x0 - 90, y, [1, 0]);
    streetLamp(AVE.x1 + 90, y + 220, [-1, 0]);
  }
  for (const x of [340, 900, 3080, 3760]) {
    streetLamp(x, CROSS.y0 - 90, [0, 1]);
    streetLamp(x + 260, CROSS.y1 + 90, [0, -1]);
  }

  // Signals on all four corners.
  trafficLight(AVE.x0 - 100, CROSS.y0 - 100, [1, 0], 0);
  trafficLight(AVE.x1 + 100, CROSS.y1 + 100, [-1, 0], 0);
  trafficLight(AVE.x0 - 100, CROSS.y1 + 100, [0, -1], 2);
  trafficLight(AVE.x1 + 100, CROSS.y0 - 100, [0, 1], 2);

  // Sidewalk clutter.
  for (const y of [640, 1400, 2060, 3300]) {
    trashCan(AVE.x0 - 150, y);
    bollard(AVE.x0 - 60, y + 120);
    bollard(AVE.x0 - 60, y + 220);
  }
  for (const y of [880, 1660, 3560]) trashCan(AVE.x1 + 150, y);
  hydrant(AVE.x0 - 62, 2040);
  hydrant(AVE.x1 + 62, 3260);
  for (const x of [520, 1020, 3220, 3880]) {
    trashCan(x, CROSS.y0 - 140);
    bollard(x + 140, CROSS.y1 + 60);
  }

  // Bus shelter on the east sidewalk.
  const sx = AVE.x1 + 44;
  const sy = 1180;
  rect(sx + 12, sy + 16, 150, 420, [0, 0, 0], 0.4);
  rect(sx, sy, 150, 420, mix(C.glass, C.metalDark, 0.45), 0.9);
  outline(sx, sy, 150, 420, C.metal, 0.7, 7);
  rect(sx + 20, sy + 40, 34, 340, C.metalDark, 0.8);
  rect(sx + 108, sy + 60, 30, 300, C.cyan, 0.85); // lit ad panel
  glowRect(sx + 108, sy + 60, 30, 300, 170, C.cyan, 0.16);

  // Noodle stand on the SW corner, awnings over the sidewalk.
  awning(500, 3040, 420, 160, C.magenta, true);
  awning(940, 3040, 260, 160, C.amber, true);
  // Counters and crates spilling out from under the awnings onto the sidewalk.
  for (let s = 0; s < 4; s++) {
    const bx = 540 + s * 165;
    rect(bx + 8, 3212, 120, 62, [0, 0, 0], 0.4);
    rect(bx, 3204, 120, 62, shade(C.metal, 0.75), 1);
    rect(bx + 6, 3210, 108, 22, shade(C.metal, 1.15), 0.8);
    rect(bx + 20, 3240, 80, 18, C.rust, 0.7);
  }
  for (const [bx, by] of [
    [1020, 3212],
    [1090, 3230],
    [960, 3244],
  ]) {
    rotRect(bx, by, 56, 46, 0.2, (lx, ly) => {
      const edge = Math.abs(lx) > 22 || Math.abs(ly) > 17;
      return [...(edge ? shade(C.dirt, 0.7) : C.dirt), 1];
    });
  }
  glowRect(500, 3040, 700, 160, 210, C.amber, 0.1);
  // Food cart parked at the kerb.
  rotRect(1080, 3320, 190, 110, 0, (lx, ly) => {
    const edge = Math.abs(lx) > 84 || Math.abs(ly) > 46;
    return [...(edge ? shade(C.metal, 0.6) : C.metal), 1];
  });
  rect(1000, 3250, 170, 24, C.lime, 0.9);
  glowRect(1000, 3250, 170, 24, 160, C.lime, 0.18);
}

function neon() {
  // Facades along the avenue.
  neonStrip(1176, 1120, 24, 340, C.cyan, 0.65);
  neonStrip(1176, 1640, 24, 260, C.magenta, 0.7);
  neonStrip(2600, 240, 24, 520, C.magenta, 0.75);
  neonStrip(2600, 1700, 24, 380, C.lime, 0.6);
  neonStrip(1176, 3320, 24, 420, C.amber, 0.6);
  neonStrip(2600, 3400, 24, 300, C.violet, 0.6);
  // Facades along the cross street.
  neonStrip(760, 2176, 300, 24, C.violet, 0.6);
  neonStrip(3420, 2176, 420, 24, C.cyan, 0.65);
  neonStrip(3500, 3200, 380, 24, C.magenta, 0.6);
  neonStrip(180, 3200, 200, 24, C.lime, 0.55);

  // Blade signs hanging over the sidewalk.
  bladeSign(1200, 1300, 150, 70, C.cyan);
  bladeSign(1200, 1880, 130, 70, C.magenta);
  bladeSign(2470, 520, 130, 70, C.magenta);
  bladeSign(2470, 1860, 150, 70, C.lime);
  bladeSign(1250, 2210, 70, 150, C.amber);
  bladeSign(3600, 3030, 70, 150, C.cyan);

  // Rooftop signs on the megabuilding and the corner block.
  rect(2660, 300, 70, 700, shade(C.metalDark, 0.8), 1);
  rect(2672, 320, 46, 660, C.magenta, 1);
  glowRect(2660, 300, 70, 700, 280, C.magenta, 0.16);
  glowRect(2660, 300, 70, 700, 80, C.magenta, 0.26);
  rect(900, 1080, 260, 60, shade(C.metalDark, 0.8), 1);
  rect(912, 1092, 236, 36, C.cyan, 1);
  glowRect(900, 1080, 260, 60, 240, C.cyan, 0.15);
  glowRect(900, 1080, 260, 60, 70, C.cyan, 0.25);

  // Holographic ad pools projected onto the roadway.
  blob(1980, 1600, 520, 700, C.magenta, 0.05);
  blob(1720, 3400, 460, 620, C.cyan, 0.045);
  blob(900, CROSS_MID, 700, 320, C.violet, 0.04);
}

function puddles() {
  const r = rng(2718);
  // Standing water collects along the gutters, so bias placement towards kerbs.
  const spots = [
    [AVE.x0 + 60, 780],
    [AVE.x0 + 70, 1690],
    [AVE.x1 - 70, 990],
    [AVE.x1 - 60, 2020],
    [AVE.x0 + 80, 3640],
    [AVE.x1 - 80, 3280],
    [620, CROSS.y0 + 70],
    [1180, CROSS.y1 - 70],
    [3320, CROSS.y0 + 80],
    [2960, CROSS.y1 - 60],
    [1820, 2480],
    [2160, 2930],
    [1520, 3180],
    [2340, 2260],
  ];
  for (const [sx, sy] of spots) {
    const x = sx + (r() - 0.5) * 90;
    const y = sy + (r() - 0.5) * 90;
    if (kind[Math.floor(y) * SIZE + Math.floor(x)] === KIND_BLOCK) continue;
    const rx = 55 + r() * 130;
    const ry = 34 + r() * 80;
    // Water reads as a slightly lighter, bluer, low-contrast sheen — not a hole.
    blob(x, y, rx, ry, [52, 72, 92], 0.2, 1.4);
    blob(x, y, rx * 0.55, ry * 0.55, [70, 94, 116], 0.14, 1.2);
    // A smeared neon reflection, stretched across the water.
    const col = [C.cyan, C.magenta, C.amber, C.lime][Math.floor(r() * 4)];
    for (let s = 0; s < 2; s++) {
      blob(
        x + (r() - 0.5) * rx * 0.8,
        y + (r() - 0.5) * ry * 0.5,
        8 + r() * 12,
        ry * (0.35 + r() * 0.35),
        col,
        0.13,
        1.6,
      );
    }
  }
  // Broad wet sheen across the junction.
  blob(AVE_MID, CROSS_MID, 760, 500, [46, 66, 86], 0.06, 1.5);
}

function grade() {
  // Vignette plus a faint cool cast, so the eye lands on the intersection.
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const maxD = Math.hypot(cx, cy);
  for (let y = 0; y < SIZE; y++) {
    let i = y * SIZE * 3;
    for (let x = 0; x < SIZE; x++, i += 3) {
      const d = Math.hypot(x - cx, y - cy) / maxD;
      scale(i, 1 - 0.22 * d * d);
    }
  }
  // Corner calibration dots — confirm at a glance that the full 4096 px loaded.
  disc(26, 26, 20, C.cyan, 0.9);
  disc(SIZE - 26, 26, 20, C.lime, 0.9);
  disc(26, SIZE - 26, 20, C.amber, 0.9);
  disc(SIZE - 26, SIZE - 26, 20, C.magenta, 0.9);
}

// -------------------------------------------------------------------- run --
const t0 = Date.now();
const step = (name, fn) => {
  fn();
  console.log(`  ${name} — ${((Date.now() - t0) / 1000).toFixed(1)}s`);
};

step('classify', classify);
step('ground', ground);
step('kerb shading', kerbShading);
step('kerbs', kerbs);
step('asphalt wear', asphaltWear);
step('markings', markings);
step('blocks', blocks);
step('street life', streetLife);
step('neon', neon);
step('puddles', puddles);
step('grade', grade);

const png = encodePng(buf, SIZE, SIZE);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, png);
console.log(
  `written ${OUT} — ${SIZE}x${SIZE}, ${(png.length / 1024 / 1024).toFixed(2)} MB, ${((Date.now() - t0) / 1000).toFixed(1)}s`,
);
void GRID;
void M;
