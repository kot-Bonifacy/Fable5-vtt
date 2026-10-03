import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { Server } from 'socket.io';
import { MUSIC_MAX_BYTES } from '@vtt/shared';
import { requireGm } from '../auth/guards.js';
import type { AppContext } from '../context.js';
import { musicExtension, updateMusic } from '../music.js';
import { broadcastMusic } from '../realtime/music.js';
import { getUserActiveCampaign } from './helpers.js';
import { campaignUploadTarget } from '../campaign-uploads.js';
import { registerMusicImportRoutes } from './music-import.js';

export function registerMusicRoutes(app: FastifyInstance, ctx: AppContext, io: Server) {
  registerMusicImportRoutes(app, ctx, io);
  app.post<{ Params: { campaignId: string } }>(
    '/api/music/:campaignId/upload',
    { preHandler: requireGm },
    async (request, reply) => {
      // Aktywna kampania tego MG (etap 44b) — cudza odpada jak nieaktywna.
      const campaign = await getUserActiveCampaign(ctx.prisma, request.user!);
      if (campaign?.id !== request.params.campaignId) {
        return reply.code(409).send({ error: 'NO_CAMPAIGN' });
      }
      const file = await request.file({ limits: { fileSize: MUSIC_MAX_BYTES } });
      if (!file) return reply.code(400).send({ error: 'NO_FILE' });
      let buffer: Buffer;
      try {
        buffer = await file.toBuffer();
      } catch {
        return reply.code(413).send({ error: 'FILE_TOO_LARGE' });
      }
      const extension = musicExtension(buffer);
      if (!extension) return reply.code(400).send({ error: 'UNSUPPORTED_AUDIO' });
      const id = randomUUID();
      const target = await campaignUploadTarget(
        ctx.config.uploadsDir,
        campaign.id,
        'music',
        `${id}.${extension}`,
      );
      await writeFile(target.path, buffer);
      const track = {
        id,
        name: basename(file.filename, extname(file.filename)).slice(0, 100) || 'Podkład',
        url: target.url,
      };
      const state = await updateMusic(ctx.prisma, campaign.id, (state) => {
        state.tracks.push(track);
      });
      await broadcastMusic({ io }, state);
      return reply.code(201).send(track);
    },
  );
}
