import { join } from 'node:path';
import type { Socket } from 'socket.io';
import type {
  BotVoice,
  SpeechPreviewPayload,
  SpeechPreviewResult,
  SpeechStatus,
  SpeechTogglePayload,
  SpeechTrack,
  TtsVoicePreset,
} from '@vtt/shared';
import { ROLE_GM, SPEECH_PREVIEW_TEXT, parseBotData, publicSpeechStatus } from '@vtt/shared';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { campaignRoom } from './state.js';

/**
 * Speech of bots (stage 12) — the session-wide switch, the status, and the
 * synthesis of a single line.
 *
 * Degradation is the rule here: everything in this module may fail (gateway
 * down, engine unloaded, voice deleted) and the only consequence must be a
 * chat line without audio. Nothing throws into the bot turn.
 */

/** Session-wide state as the GM sees it; players get `publicSpeechStatus`. */
export function speechStatusFor(deps: RealtimeDeps, enabled: boolean): SpeechStatus {
  const tts = deps.ctx.ai.getStatus().tts;
  return {
    available: tts?.available === true && deps.ctx.voices.presets.length > 0,
    enabled,
    engine: tts?.engine ?? 'none',
    device: tts?.device ?? '-',
    loaded: tts?.loaded ?? false,
    voices: deps.ctx.voices.presets.length,
    queueLength: tts?.queueLength ?? 0,
    syntheses: tts?.syntheses ?? 0,
    lastSynthMs: tts?.lastSynthMs ?? null,
  };
}

export async function readSpeechEnabled(deps: RealtimeDeps, campaignId: string): Promise<boolean> {
  const campaign = await deps.ctx.prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { speechEnabled: true },
  });
  return campaign?.speechEnabled ?? false;
}

export async function sendSpeechStatus(deps: RealtimeDeps, socket: Socket): Promise<void> {
  const campaignId = socket.data.campaign?.id;
  const enabled = campaignId ? await readSpeechEnabled(deps, campaignId) : false;
  const status = speechStatusFor(deps, enabled);
  socket.emit(
    'speech:status',
    socket.data.user.role === ROLE_GM ? status : publicSpeechStatus(status),
  );
}

/** Pushes the switch to everyone — players see only `available` + `enabled`. */
export async function broadcastSpeechStatus(
  deps: RealtimeDeps,
  campaignId: string,
  enabled: boolean,
): Promise<void> {
  const status = speechStatusFor(deps, enabled);
  const forPlayer = publicSpeechStatus(status);
  const sockets = await deps.io.in(campaignRoom(campaignId)).fetchSockets();
  for (const socket of sockets) {
    const isGm = (socket.data as { user?: { role?: string } }).user?.role === ROLE_GM;
    socket.emit('speech:status', isGm ? status : forPlayer);
  }
}

/** Preset a bot speaks with, or null when it has no usable voice. */
export function resolveVoice(
  deps: RealtimeDeps,
  voice: BotVoice,
): { preset: TtsVoicePreset; samplePath: string | null } | null {
  if (!voice.enabled) return null;
  const preset = voice.presetId
    ? deps.ctx.voices.byId.get(voice.presetId)
    : deps.ctx.voices.presets[0];
  if (!preset) return null;
  return { preset, samplePath: samplePathOf(deps, voice.sampleUrl) };
}

/** `/uploads/voices/x.wav` → absolute path; anything else is rejected. */
function samplePathOf(deps: RealtimeDeps, sampleUrl: string | null): string | null {
  if (!sampleUrl) return null;
  const match = /^\/uploads\/voices\/([A-Za-z0-9_-]+\.wav)$/.exec(sampleUrl);
  if (!match) return null;
  return join(deps.ctx.config.uploadsDir, 'voices', match[1]!);
}

export interface SpeechRequest {
  campaignId: string;
  botId: string;
  voice: BotVoice;
  text: string;
}

/**
 * Synthesizes one bot line. Returns null whenever audio cannot be produced —
 * speech off for the session, bot muted, gateway down, synthesis failed — and
 * the caller then delivers the line the old way: whole text, immediately.
 */
export async function synthesizeLine(
  deps: RealtimeDeps,
  request: SpeechRequest,
): Promise<SpeechTrack | null> {
  if (!(await readSpeechEnabled(deps, request.campaignId))) return null;
  const resolved = resolveVoice(deps, request.voice);
  if (!resolved) return null;
  if (deps.ctx.ai.getStatus().tts?.available !== true) return null;

  const result = await deps.ctx.tts.synthesize({
    text: request.text,
    preset: resolved.preset,
    rate: request.voice.rate,
    pitch: request.voice.pitch,
    samplePath: resolved.samplePath,
    botId: request.botId,
  });
  if (!result) return null;

  return {
    audioUrl: `/api/tts/${result.id}`,
    durationMs: result.durationMs,
    reveal: result.reveal,
    voiceId: resolved.preset.id,
  };
}

/** GM's session-wide switch: „mowa botów" on or off for everyone. */
export const speechToggleEvent = defineEvent<SpeechTogglePayload, { enabled: boolean }>({
  name: 'speech:toggle',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    if (!socket.data.campaign) throw new RealtimeError('NO_CAMPAIGN');
    const enabled = payload?.enabled === true;
    await deps.ctx.prisma.campaign.update({
      where: { id: socket.data.campaign.id },
      data: { speechEnabled: enabled },
    });
    await broadcastSpeechStatus(deps, socket.data.campaign.id, enabled);
    return { enabled };
  },
});

/**
 * „Posłuchaj" in the bot editor: synthesizes a sample outside the session, so
 * the GM can judge a voice without saying anything at the table.
 */
export const speechPreviewEvent = defineEvent<SpeechPreviewPayload, SpeechPreviewResult>({
  name: 'speech:preview',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    if (!socket.data.campaign) throw new RealtimeError('NO_CAMPAIGN');
    if (deps.ctx.ai.getStatus().tts?.available !== true) throw new RealtimeError('TTS_UNAVAILABLE');

    let voice: BotVoice = {
      enabled: true,
      presetId: payload?.presetId ?? null,
      sampleUrl: null,
      rate: payload?.rate ?? 1,
      pitch: payload?.pitch ?? 1,
    };
    if (payload?.botId) {
      const bot = await deps.ctx.prisma.botProfile.findUnique({
        where: { id: payload.botId },
        select: { campaignId: true, data: true },
      });
      if (!bot || bot.campaignId !== socket.data.campaign.id) {
        throw new RealtimeError('BOT_NOT_FOUND');
      }
      const stored = parseBotData(bot.data).voice;
      voice = {
        enabled: true,
        presetId: payload.presetId ?? stored.presetId,
        sampleUrl: stored.sampleUrl,
        rate: payload.rate ?? stored.rate,
        pitch: payload.pitch ?? stored.pitch,
      };
    }

    const resolved = resolveVoice(deps, voice);
    if (!resolved) throw new RealtimeError('VOICE_NOT_FOUND');

    const text = (payload?.text ?? '').trim() || SPEECH_PREVIEW_TEXT;
    const result = await deps.ctx.tts.synthesize({
      text: text.slice(0, 400),
      preset: resolved.preset,
      rate: voice.rate,
      pitch: voice.pitch,
      samplePath: resolved.samplePath,
    });
    if (!result) throw new RealtimeError('TTS_FAILED');

    return {
      audioUrl: `/api/tts/${result.id}`,
      durationMs: result.durationMs,
      reveal: result.reveal,
      spokenText: result.spokenText,
      synthMs: result.synthMs,
    };
  },
});
