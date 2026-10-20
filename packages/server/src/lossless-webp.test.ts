import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { LOSSLESS_WEBP_MIN_BYTES, pngAsLosslessWebp } from './lossless-webp.js';
import { patternPng } from './test-images.js';

const pixels = (image: Buffer) => sharp(image).ensureAlpha().raw().toBuffer();

describe('PNG → lossless WebP', () => {
  it('returns a smaller WebP with exactly the same pixels, transparent ones included', async () => {
    const png = await patternPng();
    expect(png.length).toBeGreaterThanOrEqual(LOSSLESS_WEBP_MIN_BYTES);
    const webp = await pngAsLosslessWebp(png);
    expect(webp).not.toBeNull();
    expect((await sharp(webp!).metadata()).format).toBe('webp');
    expect(webp!.length).toBeLessThan(png.length);
    expect((await pixels(webp!)).equals(await pixels(png))).toBe(true);
  });

  it('leaves a small PNG alone', async () => {
    const png = await sharp({
      create: { width: 64, height: 64, channels: 3, background: '#203040' },
    })
      .png()
      .toBuffer();
    expect(await pngAsLosslessWebp(png)).toBeNull();
  });

  it('leaves a 16-bit PNG alone — WebP would drop half of every channel', async () => {
    const png = await patternPng(512, 16);
    expect((await sharp(png).metadata()).depth).toBe('ushort');
    expect(await pngAsLosslessWebp(png)).toBeNull();
  });

  it('keeps the PNG when sharp cannot read the file', async () => {
    const broken = Buffer.concat([
      (await patternPng()).subarray(0, 100),
      Buffer.alloc(LOSSLESS_WEBP_MIN_BYTES),
    ]);
    expect(await pngAsLosslessWebp(broken)).toBeNull();
  });
});
