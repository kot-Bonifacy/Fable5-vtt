import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { Server } from 'socket.io';
import { MUSIC_MAX_BYTES } from '@vtt/shared';
import { requireGm } from '../auth/guards.js';
import type { AppContext } from '../context.js';
import { musicExtension, updateMusic } from '../music.js';
import { broadcastMusic } from '../realtime/music.js';

export function registerMusicRoutes(app: FastifyInstance, ctx: AppContext, io: Server) {
  app.post<{ Params: { campaignId: string } }>(
    '/api/music/:campaignId/upload',
    { preHandler: requireGm },
    async (request, reply) => {
      const campaign = await ctx.prisma.campaign.findUnique({
        where: { id: request.params.campaignId },
      });
      if (!campaign?.active) return reply.code(409).send({ error: 'NO_CAMPAIGN' });
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
      const dir = join(ctx.config.uploadsDir, 'music');
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, `${id}.${extension}`), buffer);
      const track = {
        id,
        name: basename(file.filename, extname(file.filename)).slice(0, 100) || 'Podkład',
        url: `/uploads/music/${id}.${extension}`,
      };
      const state = await updateMusic(ctx.prisma, campaign.id, (state) => {
        state.tracks.push(track);
      });
      await broadcastMusic({ io }, state);
      return reply.code(201).send(track);
    },
  );
}
