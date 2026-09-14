import sharp from 'sharp';
import { imageSize } from 'image-size';
import {
  PORTRAIT_MAX_INPUT_PIXELS,
  PORTRAIT_MIN_INPUT_SIDE,
  PORTRAIT_WEBP_QUALITY,
  UPLOAD_LIMITS,
} from '@vtt/shared';

export class PortraitImageError extends Error {}

/** Decode the whole image before saving; headers alone do not prove it is valid. */
export async function preparePortraitImage(input: Buffer) {
  if (input.length > UPLOAD_LIMITS.portrait.maxBytes) {
    throw new PortraitImageError('FILE_TOO_LARGE');
  }
  let dimensions;
  try {
    dimensions = imageSize(input);
  } catch {
    throw new PortraitImageError('INVALID_IMAGE');
  }
  if (!['png', 'jpg', 'webp'].includes(dimensions.type ?? '')) {
    throw new PortraitImageError('UNSUPPORTED_IMAGE');
  }
  if (dimensions.width * dimensions.height > PORTRAIT_MAX_INPUT_PIXELS) {
    throw new PortraitImageError('IMAGE_TOO_LARGE');
  }
  if (Math.min(dimensions.width, dimensions.height) < PORTRAIT_MIN_INPUT_SIDE) {
    throw new PortraitImageError('IMAGE_TOO_SMALL');
  }
  try {
    const image = sharp(input, { limitInputPixels: PORTRAIT_MAX_INPUT_PIXELS, failOn: 'warning' });
    const metadata = await image.metadata();
    if ((metadata.pages ?? 1) > 1) throw new PortraitImageError('ANIMATED_IMAGE');
    const { data, info } = await image
      .rotate()
      .resize({
        width: UPLOAD_LIMITS.portrait.maxSidePx,
        height: UPLOAD_LIMITS.portrait.maxSidePx,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: PORTRAIT_WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });
    return { buffer: data, width: info.width, height: info.height };
  } catch (error) {
    if (error instanceof PortraitImageError) throw error;
    throw new PortraitImageError('INVALID_IMAGE');
  }
}
