import { randomBytes } from 'node:crypto';
import { basename, extname, join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { imageSize } from 'image-size';
import type { HandoutImage, MapUploadResult, PortraitAssetView, TokenAssetView } from '@vtt/shared';
import {
  PORTRAIT_NAME_MAX_LENGTH,
  SCENE_DIMENSION_MAX,
  TOKEN_NAME_MAX_LENGTH,
  UPLOAD_LIMITS,
} from '@vtt/shared';
import type { AppContext } from '../context.js';
import { requireAuth, requireGm } from '../auth/guards.js';
import { toPortraitAssetView } from '../portraits.js';
import { getActiveCampaign } from './helpers.js';

// The numbers themselves live in `shared/src/uploads.ts`, because the client
// builds its refusal sentences from the same pair — a limit tightened here and
// nowhere else used to leave the panel promising the old one.
export const MAX_MAP_UPLOAD_BYTES = UPLOAD_LIMITS.map.maxBytes;
export const MAX_TOKEN_UPLOAD_BYTES = UPLOAD_LIMITS.token.maxBytes;
export const TOKEN_IMAGE_MAX_SIDE = UPLOAD_LIMITS.token.maxSidePx;
export const MAX_PORTRAIT_UPLOAD_BYTES = UPLOAD_LIMITS.portrait.maxBytes;
export const PORTRAIT_IMAGE_MAX_SIDE = UPLOAD_LIMITS.portrait.maxSidePx;
/** Handout image (stage 24a): a district map may be far bigger than a portrait. */
export const MAX_HANDOUT_UPLOAD_BYTES = UPLOAD_LIMITS.handout.maxBytes;
export const HANDOUT_IMAGE_MAX_SIDE = UPLOAD_LIMITS.handout.maxSidePx;

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

  // Handout images (stage 24a) — GM only, like maps: a handout is material the
  // GM hands out, and nobody else creates one.
  app.post('/api/uploads/handouts', { preHandler: requireGm }, async (request, reply) => {
    const file = await request.file({ limits: { fileSize: MAX_HANDOUT_UPLOAD_BYTES } });
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
    if (width > HANDOUT_IMAGE_MAX_SIDE || height > HANDOUT_IMAGE_MAX_SIDE) {
      return reply.code(400).send({ error: 'IMAGE_TOO_LARGE' });
    }

    const handoutsDir = join(ctx.config.uploadsDir, 'handouts');
    await mkdir(handoutsDir, { recursive: true });
    const filename = `${randomBytes(12).toString('base64url')}.${extension}`;
    await writeFile(join(handoutsDir, filename), buffer);

    const result: HandoutImage = { url: `/uploads/handouts/${filename}`, width, height };
    return reply.code(201).send(result);
  });

  /**
   * Pula portretów kampanii — dokłada wyłącznie MG.
   *
   * Bliźniak `/api/uploads/tokens`: ta sama walidacja, inny katalog i inna
   * publiczność listy niżej.
   *
   * **Od 12.09 to jedyna trasa portretu.** Do tej pory obok niej stała
   * `/api/uploads/portraits`, którą karta, kreator i edytor bota wgrywały plik
   * *bez* wiersza w bazie — a portret bez wiersza nie ma gdzie trzymać kadru na
   * mapie i nikomu drugi raz się nie przyda. Teraz każdy wgrany portret wraca
   * w puli i da się go skadrować (decyzja MG z 12.09).
   */
  app.post('/api/uploads/portrait-assets', { preHandler: requireGm }, async (request, reply) => {
    const campaign = await getActiveCampaign(ctx.prisma);
    if (!campaign) {
      return reply.code(409).send({ error: 'NO_CAMPAIGN' });
    }
    const file = await request.file({ limits: { fileSize: MAX_PORTRAIT_UPLOAD_BYTES } });
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
    if (width > PORTRAIT_IMAGE_MAX_SIDE || height > PORTRAIT_IMAGE_MAX_SIDE) {
      return reply.code(400).send({ error: 'IMAGE_TOO_LARGE' });
    }

    const portraitsDir = join(ctx.config.uploadsDir, 'portraits');
    await mkdir(portraitsDir, { recursive: true });
    const filename = `${randomBytes(12).toString('base64url')}.${extension}`;
    await writeFile(join(portraitsDir, filename), buffer);

    const original = basename(file.filename ?? 'portret');
    const name = (original.slice(0, original.length - extname(original).length) || 'portret').slice(
      0,
      PORTRAIT_NAME_MAX_LENGTH,
    );

    const asset = await ctx.prisma.portraitAsset.create({
      data: { campaignId: campaign.id, name, url: `/uploads/portraits/${filename}`, width, height },
    });
    const result: PortraitAssetView = toPortraitAssetView(asset);
    return reply.code(201).send(result);
  });

  // Listę widzi **każdy zalogowany** — to z niej gracz wybiera portret.
  app.get('/api/portrait-assets', { preHandler: requireAuth }, async (_request, reply) => {
    const campaign = await getActiveCampaign(ctx.prisma);
    if (!campaign) {
      return reply.send([]);
    }
    const assets = await ctx.prisma.portraitAsset.findMany({
      where: { campaignId: campaign.id },
      orderBy: { createdAt: 'desc' },
    });
    const views: PortraitAssetView[] = assets.map(toPortraitAssetView);
    return reply.send(views);
  });

  /**
   * Zdjęcie portretu z puli — MG.
   *
   * Kasuje sam wpis biblioteki; plik z dysku zabiera `uploads-gc.ts`, o ile
   * nie trzyma go już żadna karta. Portret wybrany wcześniej na czyjejś karcie
   * zostaje na niej — usunięcie z puli znaczy „nie proponuj tego dalej", nie
   * „odbierz komuś obrazek".
   */
  app.delete('/api/portrait-assets/:id', { preHandler: requireGm }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const asset = await ctx.prisma.portraitAsset.findUnique({ where: { id } });
    if (!asset) {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }
    await ctx.prisma.portraitAsset.delete({ where: { id } });
    return reply.code(204).send();
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
