import { stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import sharp from 'sharp';
import { MAP_PREVIEW_MAX_SIDE, SCENE_DIMENSION_MAX } from '@vtt/shared';

/** A preview weighs tens of kB, so a few dozen of them cost next to nothing. */
const CACHE_LIMIT = 64;
const PREVIEW_QUALITY = 70;

/**
 * Small previews of uploaded maps (`/uploads/…?preview`), made on first ask
 * and kept in memory. Uploaded files never change in place (every upload gets
 * a new random name), but the key carries size and mtime anyway, so a file
 * swapped by hand on the disk does not keep serving its old preview.
 *
 * Players opening a scene together ask at once, so the work is shared: one
 * encode per file, everybody awaits the same promise.
 */
export class MapPreviews {
  private readonly cache = new Map<string, Promise<Buffer | null>>();

  constructor(private readonly uploadsDir: string) {}

  /** The preview for an `/uploads/…` path, or null when there is no such image. */
  async get(urlPath: string): Promise<Buffer | null> {
    const root = resolve(this.uploadsDir);
    const file = resolve(root, urlPath.replace(/^\/uploads\//, ''));
    if (!file.startsWith(root + sep)) return null;
    let key: string;
    try {
      const info = await stat(file);
      if (!info.isFile()) return null;
      key = `${file}:${info.size}:${info.mtimeMs}`;
    } catch {
      return null;
    }

    let preview = this.cache.get(key);
    if (preview) {
      // Most recently used goes to the end; the oldest is first to leave.
      this.cache.delete(key);
    } else {
      preview = encodePreview(file);
      if (this.cache.size >= CACHE_LIMIT) {
        this.cache.delete(this.cache.keys().next().value!);
      }
    }
    this.cache.set(key, preview);
    const result = await preview;
    // A file sharp cannot read is not worth remembering.
    if (!result) this.cache.delete(key);
    return result;
  }
}

async function encodePreview(file: string): Promise<Buffer | null> {
  try {
    return await sharp(file, { limitInputPixels: SCENE_DIMENSION_MAX * SCENE_DIMENSION_MAX })
      .resize({
        width: MAP_PREVIEW_MAX_SIDE,
        height: MAP_PREVIEW_MAX_SIDE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: PREVIEW_QUALITY })
      .toBuffer();
  } catch {
    return null;
  }
}
