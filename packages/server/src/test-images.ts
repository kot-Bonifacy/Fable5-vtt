import sharp from 'sharp';

/**
 * A map-like PNG: busy enough to pass the size floor, regular enough for WebP
 * to win. The left quarter is fully transparent but keeps its colour, which
 * only `exact` survives.
 */
export async function patternPng(side = 512, depth: 8 | 16 = 8): Promise<Buffer> {
  const raw = Buffer.alloc(side * side * 4);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const i = (y * side + x) * 4;
      raw[i] = (x * y) & 255;
      raw[i + 1] = (x + 3 * y) & 255;
      raw[i + 2] = (x ^ y) & 255;
      raw[i + 3] = x < side / 4 ? 0 : 128 + ((x * 7 + y) & 127);
    }
  }
  const image = sharp(raw, { raw: { width: side, height: side, channels: 4 } });
  return (depth === 16 ? image.toColourspace('rgb16') : image).png().toBuffer();
}
