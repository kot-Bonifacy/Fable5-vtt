import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { preparePortraitImage } from './portrait-image.js';

const picture = (width: number, height: number) =>
  sharp({
    create: { width, height, channels: 4, background: { r: 120, g: 30, b: 60, alpha: 0.5 } },
  });

describe('portrait conversion', () => {
  it.each(['png', 'jpeg', 'webp'] as const)(
    'converts %s without cropping or enlarging',
    async (format) => {
      const input = await picture(256, 512).toFormat(format).toBuffer();
      const result = await preparePortraitImage(input);
      expect([result.width, result.height]).toEqual([256, 512]);
      expect((await sharp(result.buffer).metadata()).format).toBe('webp');
    },
  );

  it('fits a large portrait proportionally and preserves transparency', async () => {
    const result = await preparePortraitImage(await picture(3000, 4500).png().toBuffer());
    expect([result.width, result.height]).toEqual([1365, 2048]);
    expect((await sharp(result.buffer).metadata()).hasAlpha).toBe(true);
  });

  it('applies EXIF orientation and strips metadata', async () => {
    const input = await picture(400, 800).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const result = await preparePortraitImage(input);
    expect([result.width, result.height]).toEqual([800, 400]);
    expect((await sharp(result.buffer).metadata()).exif).toBeUndefined();
  });

  it('rejects too small, too heavy and excessive pixel counts', async () => {
    await expect(preparePortraitImage(await picture(255, 512).png().toBuffer())).rejects.toThrow(
      'IMAGE_TOO_SMALL',
    );
    await expect(preparePortraitImage(Buffer.alloc(10 * 1024 * 1024 + 1))).rejects.toThrow(
      'FILE_TOO_LARGE',
    );
    const input = await picture(256, 256).png().toBuffer();
    input.writeUInt32BE(5000, 16);
    input.writeUInt32BE(4001, 20);
    await expect(preparePortraitImage(input)).rejects.toThrow('IMAGE_TOO_LARGE');
  });

  it('rejects unsupported formats and corrupt pixel data', async () => {
    await expect(preparePortraitImage(await picture(256, 256).gif().toBuffer())).rejects.toThrow(
      'UNSUPPORTED_IMAGE',
    );
    const input = await picture(256, 256).png().toBuffer();
    await expect(preparePortraitImage(input.subarray(0, 50))).rejects.toThrow('INVALID_IMAGE');
  });
});
