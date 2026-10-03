import { randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, open, rm, stat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { Server } from 'socket.io';
import { youtubeVideoId, type MusicImportStatus, type MusicTrack } from '@vtt/shared';
import type { AppContext } from '../context.js';
import { requireGm } from '../auth/guards.js';
import { musicExtension, updateMusic } from '../music.js';
import { broadcastMusic } from '../realtime/music.js';
import { importYoutubeAudio, YOUTUBE_AUDIO_MAX_BYTES } from '../youtube-import.js';
import { getUserActiveCampaign, ownCampaign } from './helpers.js';
import { campaignUploadTarget } from '../campaign-uploads.js';

export function registerMusicImportRoutes(app: FastifyInstance, ctx: AppContext, io: Server) {
  const jobs = new Map<string, MusicImportStatus>();
  let running: { campaignId: string; abort: AbortController; done: Promise<void> } | null = null;
  const idle = (campaignId: string): MusicImportStatus => ({
    campaignId,
    phase: 'idle',
    progress: 0,
  });
  const path = '/api/music/:campaignId/youtube';
  app.get<{ Params: { campaignId: string } }>(
    path,
    { preHandler: requireGm },
    async (request, reply) => {
      // Stan importu tylko dla MG tej kampanii (etap 44b).
      if (!(await ownCampaign(ctx.prisma, request.params.campaignId, request.user!.id))) {
        return reply.code(404).send({ error: 'NOT_FOUND' });
      }
      return jobs.get(request.params.campaignId) ?? idle(request.params.campaignId);
    },
  );
  app.post<{ Params: { campaignId: string }; Body: { url?: unknown; name?: unknown } }>(
    path,
    { preHandler: requireGm },
    async (request, reply) => {
      const campaignId = request.params.campaignId;
      // Aktywna kampania tego MG (etap 44b) — cudza odpada jak nieaktywna.
      const campaign = await getUserActiveCampaign(ctx.prisma, request.user!);
      if (campaign?.id !== campaignId) return reply.code(409).send({ error: 'NO_CAMPAIGN' });
      const videoId = youtubeVideoId(request.body?.url);
      const name = request.body?.name ?? '';
      if (!videoId || typeof name !== 'string' || name.length > 120)
        return reply.code(400).send({ error: 'INVALID_URL' });
      const requestedName = name.trim();
      if (running) return reply.code(409).send({ error: 'IMPORT_BUSY' });
      const abort = new AbortController();
      const status: MusicImportStatus = {
        campaignId,
        phase: 'downloading',
        progress: 0,
        name: requestedName,
      };
      jobs.set(campaignId, status);
      async function run() {
        let directory: string | null = null;
        let output: string | null = null;
        try {
          directory = await mkdtemp(join(tmpdir(), 'vtt-youtube-'));
          const title = await importYoutubeAudio(
            videoId!,
            directory,
            abort.signal,
            (update) => {
              Object.assign(status, update, { name: requestedName || update.name });
            },
            ctx.config.audioPython,
          );
          abort.signal.throwIfAborted();
          const source = join(directory, 'audio.mp3');
          const size = (await stat(source)).size;
          if (!size || size > YOUTUBE_AUDIO_MAX_BYTES) throw new Error('FILE_TOO_LARGE');
          const file = await open(source, 'r');
          const header = Buffer.alloc(16);
          try {
            await file.read(header, 0, 16, 0);
          } finally {
            await file.close();
          }
          if (musicExtension(header) !== 'mp3') throw new Error('INVALID_AUDIO');
          const id = randomUUID();
          const target = await campaignUploadTarget(
            ctx.config.uploadsDir,
            campaignId,
            'music',
            `${id}.mp3`,
          );
          output = target.path;
          await copyFile(source, output);
          const track: MusicTrack = {
            id,
            name: requestedName || title,
            url: target.url,
          };
          const state = await updateMusic(ctx.prisma, campaignId, (state) => {
            abort.signal.throwIfAborted();
            const legacy = state.tracks.find((t) => youtubeVideoId(t.url) === videoId);
            if (legacy) {
              track.id = legacy.id;
              state.tracks = state.tracks.map((t) => (t.id === legacy.id ? track : t));
            } else state.tracks.push(track);
          });
          output = null; // committed: normal upload GC owns this file now
          Object.assign(status, { phase: 'complete', progress: 100, name: track.name });
          await broadcastMusic({ io }, state);
        } catch (error) {
          status.phase = abort.signal.aborted ? 'cancelled' : 'error';
          status.error = error instanceof Error ? error.message : 'VIDEO_UNAVAILABLE';
        } finally {
          if (output) await unlink(output).catch(() => undefined);
          if (
            directory &&
            dirname(resolve(directory)) === resolve(tmpdir()) &&
            basename(directory).startsWith('vtt-youtube-')
          )
            await rm(directory, { recursive: true, force: true }).catch(() => undefined);
          running = null;
        }
      }
      running = { campaignId, abort, done: run() };
      return reply.code(202).send(status);
    },
  );
  app.post<{ Params: { campaignId: string } }>(
    `${path}/cancel`,
    { preHandler: requireGm },
    async (request, reply) => {
      if (!(await ownCampaign(ctx.prisma, request.params.campaignId, request.user!.id))) {
        return reply.code(404).send({ error: 'NOT_FOUND' });
      }
      if (running?.campaignId === request.params.campaignId) running.abort.abort();
      return { ok: true };
    },
  );
  app.addHook('onClose', async () => {
    const job = running;
    job?.abort.abort();
    await job?.done;
  });
}
