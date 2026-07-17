import { randomBytes } from 'node:crypto';
import { basename, extname, join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { imageSize } from 'image-size';
import type { MapUploadResult, TokenAssetView } from '@vtt/shared';
import { SCENE_DIMENSION_MAX, TOKEN_NAME_MAX_LENGTH } from '@vtt/shared';
import type { AppContext } from '../context.js';
import { requireGm } from '../auth/guards.js';
import { getActiveCampaign } from './helpers.js';

export const MAX_MAP_UPLOAD_BYTES = 40 * 1024 * 1024;
export const MAX_TOKEN_UPLOAD_BYTES = 8 * 1024 * 1024;
export const TOKEN_IMAGE_MAX_SIDE = 2048;

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

  app.post('/api/uploads/tokens', { preHandler: requireGm }, async (request, reply) => {
    const campaign = await getActiveCampaign(ctx.prisma);
    if (!campaign) {
      return reply.code(409).send({ error: 'NO_CAMPAIGN' });
    }
    const file = await request.file({ limits: { fileSize: MAX_TOKEN_UPLOAD_BYTES } });
    if (!file) {
      return reply.code(400).send({ error: 'NO_FILE' });
    }

    let buffer: Buffer;
    try {
      buffer = await file.toBuffer();
    } catch {
      return reply.code(413).send({ error: 'FILE_TOO_LARGE' });
    }

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
    if (width > TOKEN_IMAGE_MAX_SIDE || height > TOKEN_IMAGE_MAX_SIDE) {
      return reply.code(400).send({ error: 'IMAGE_TOO_LARGE' });
    }

    const tokensDir = join(ctx.config.uploadsDir, 'tokens');
    await mkdir(tokensDir, { recursive: true });
    const filename = `${randomBytes(12).toString('base64url')}.${extension}`;
    await writeFile(join(tokensDir, filename), buffer);

    // Library display name from the original file name, sans extension.
    const original = basename(file.filename ?? 'token');
    const name = (original.slice(0, original.length - extname(original).length) || 'token').slice(
      0,
      TOKEN_NAME_MAX_LENGTH,
    );

    const asset = await ctx.prisma.tokenAsset.create({
      data: { campaignId: campaign.id, name, url: `/uploads/tokens/${filename}`, width, height },
    });
    const result: TokenAssetView = {
      id: asset.id,
      name: asset.name,
      url: asset.url,
      width: asset.width,
      height: asset.height,
    };
    return reply.code(201).send(result);
  });

  app.get('/api/token-assets', { preHandler: requireGm }, async (_request, reply) => {
    const campaign = await getActiveCampaign(ctx.prisma);
    if (!campaign) {
      return reply.send([]);
    }
    const assets = await ctx.prisma.tokenAsset.findMany({
      where: { campaignId: campaign.id },
      orderBy: { createdAt: 'desc' },
    });
    const views: TokenAssetView[] = assets.map((a) => ({
      id: a.id,
      name: a.name,
      url: a.url,
      width: a.width,
      height: a.height,
    }));
    return reply.send(views);
  });
}
