import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { TtsVoicePreset } from '@vtt/shared';
import {
  VOICE_SAMPLE_MAX_BYTES,
  VOICE_SAMPLE_MAX_SECONDS,
  VOICE_SAMPLE_MIN_SECONDS,
} from '@vtt/shared';
import type { AppContext } from '../context.js';
import { requireAuth, requireGm } from '../auth/guards.js';

/**
 * Serving bot audio and uploading voice samples.
 *
 * Audio is public within the session (any logged-in user): the line it belongs
 * to is already on their chat, and guessing a 128-bit cache id is not a threat
 * model worth a per-message ACL.
 */
export function registerTtsRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get<{ Params: { id: string } }>(
    '/api/tts/:id',
    { preHandler: requireAuth },
    async (request, reply) => {
      const id = request.params.id.replace(/\.wav$/, '');
      const audio = await ctx.tts.readAudio(id);
      if (!audio) {
        // Swept from cache — the client falls back to showing the line at once.
        return reply.code(404).send({ error: 'AUDIO_NOT_FOUND' });
      }
      return reply
        .header('content-type', 'audio/wav')
        .header('cache-control', 'public, max-age=86400, immutable')
        .header('content-length', String(audio.length))
        .send(audio);
    },
  );

  /** Voice presets for the editor's dropdown. */
  app.get('/api/tts/voices', { preHandler: requireGm }, async (_request, reply) => {
    const presets: TtsVoicePreset[] = ctx.voices.presets;
    return reply.send({ voices: presets, engine: ctx.ai.getStatus().tts?.engine ?? 'none' });
  });

  /** Cloning sample for a bot voice — GM only, WAV to keep validation honest. */
  app.post('/api/uploads/voices', { preHandler: requireGm }, async (request, reply) => {
    const file = await request.file({ limits: { fileSize: VOICE_SAMPLE_MAX_BYTES } });
    if (!file) return reply.code(400).send({ error: 'NO_FILE' });

    let buffer: Buffer;
    try {
      buffer = await file.toBuffer();
    } catch {
      return reply.code(413).send({ error: 'FILE_TOO_LARGE' });
    }

    const info = readWavHeader(buffer);
    if (!info) return reply.code(400).send({ error: 'UNSUPPORTED_AUDIO' });
    if (info.seconds < VOICE_SAMPLE_MIN_SECONDS) {
      return reply.code(400).send({ error: 'SAMPLE_TOO_SHORT' });
    }
    if (info.seconds > VOICE_SAMPLE_MAX_SECONDS) {
      return reply.code(400).send({ error: 'SAMPLE_TOO_LONG' });
    }

    const dir = join(ctx.config.uploadsDir, 'voices');
    await mkdir(dir, { recursive: true });
    const filename = `${randomBytes(12).toString('base64url')}.wav`;
    await writeFile(join(dir, filename), buffer);

    return reply.code(201).send({
      url: `/uploads/voices/${filename}`,
      seconds: Math.round(info.seconds * 10) / 10,
    });
  });
}

interface WavInfo {
  seconds: number;
  sampleRate: number;
}

/**
 * Minimal RIFF/WAVE reader — enough to reject anything that is not a WAV and to
 * measure its length. Pulling in a decoder for a sanity check would be overkill.
 */
function readWavHeader(buffer: Buffer): WavInfo | null {
  if (buffer.length < 44) return null;
  if (buffer.toString('ascii', 0, 4) !== 'RIFF') return null;
  if (buffer.toString('ascii', 8, 12) !== 'WAVE') return null;

  let offset = 12;
  let sampleRate = 0;
  let byteRate = 0;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (chunkId === 'fmt ' && offset + 16 <= buffer.length) {
      sampleRate = buffer.readUInt32LE(offset + 12);
      byteRate = buffer.readUInt32LE(offset + 16);
    } else if (chunkId === 'data') {
      if (byteRate <= 0) return null;
      return { seconds: chunkSize / byteRate, sampleRate };
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  return null;
}
