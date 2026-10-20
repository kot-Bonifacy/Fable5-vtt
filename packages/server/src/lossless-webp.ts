import sharp from 'sharp';

/**
 * PNG gains little below this — and a tiny file is not what makes a scene slow.
 */
export const LOSSLESS_WEBP_MIN_BYTES = 64 * 1024;
/**
 * Above this the encode takes tens of seconds on the VPS and the raw pixel
 * comparison holds two copies of the image in memory; such a map stays PNG.
 * 25 Mpx is 5000 × 5000 — a 4096 map encodes in ~5 s.
 */
export const LOSSLESS_WEBP_MAX_PIXELS = 25_000_000;

/**
 * An uploaded PNG re-encoded as lossless WebP, or `null` when the PNG stays.
 *
 * The result is kept only when it decodes to exactly the same pixels as the
 * PNG (alpha included) and is smaller. `exact` keeps the colour under fully
 * transparent pixels, which libwebp would otherwise rewrite. 16-bit PNGs stay,
 * because WebP has 8 bits per channel; so do animated ones (APNG), because
 * only the first frame would survive. Any sharp failure keeps the PNG: the
 * upload must not depend on the conversion.
 */
export async function pngAsLosslessWebp(png: Buffer): Promise<Buffer | null> {
  if (png.length < LOSSLESS_WEBP_MIN_BYTES) return null;
  try {
    const metadata = await sharp(png).metadata();
    if (metadata.format !== 'png' || metadata.depth !== 'uchar') return null;
    if ((metadata.pages ?? 1) > 1) return null;
    if ((metadata.width ?? 0) * (metadata.height ?? 0) > LOSSLESS_WEBP_MAX_PIXELS) return null;

    const webp = await sharp(png)
      .keepIccProfile()
      .webp({ lossless: true, exact: true, effort: 4 })
      .toBuffer();
    if (webp.length >= png.length) return null;

    const [before, after] = await Promise.all([
      sharp(png).ensureAlpha().raw().toBuffer(),
      sharp(webp).ensureAlpha().raw().toBuffer(),
    ]);
    return before.equals(after) ? webp : null;
  } catch {
    return null;
  }
}
