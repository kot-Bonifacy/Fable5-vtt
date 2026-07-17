import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { imageSize } from 'image-size';
import type { MapUploadResult } from '@vtt/shared';
import { SCENE_DIMENSION_MAX } from '@vtt/shared';
import type { AppContext } from '../context.js';
import { requireGm } from '../auth/guards.js';

export const MAX_MAP_UPLOAD_BYTES = 40 * 1024 * 1024;

/** Formats we accept and serve; keyed by the type sniffed from file content. */
const IMAGE_EXTENSIONS: Record<string, string> = {
  png: 'png',
  jpg: 'jpg',
  webp: 'webp',
};

export function registerUploadRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.post('/api/uploads/maps', { preHandler: requireGm }, async (request, reply) => {
    const file = await request.file();
    if (!file) {
      return reply.code(400).send({ error: 'NO_FILE' });
    }

    let buffer: Buffer;
    try {
      buffer = await file.toBuffer();
    } catch {
      // Thrown by @fastify/multipart when the stream exceeds the size limit.
      return reply.code(413).send({ error: 'FILE_TOO_LARGE' });
    }

    // Trust the sniffed content type, not the client-declared mimetype.
    let width: number;
    let height: number;
    let type: string | undefined;
    try {
      ({ width, height, type } = imageSize(buffer));
    } catch {
      return reply.code(400).send({ error: 'UNSUPPORTED_IMAGE' });
    }
    const extension = type ? IMAGE_EXTENSIONS[type] : undefined;
    if (!extension) {
      return reply.code(400).send({ error: 'UNSUPPORTED_IMAGE' });
    }
    if (width > SCENE_DIMENSION_MAX || height > SCENE_DIMENSION_MAX) {
      return reply.code(400).send({ error: 'IMAGE_TOO_LARGE' });
    }

    const mapsDir = join(ctx.config.uploadsDir, 'maps');
    await mkdir(mapsDir, { recursive: true });
    const filename = `${randomBytes(12).toString('base64url')}.${extension}`;
    await writeFile(join(mapsDir, filename), buffer);

    const result: MapUploadResult = { url: `/uploads/maps/${filename}`, width, height };
    return reply.code(201).send(result);
  });
}
