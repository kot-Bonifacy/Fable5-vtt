import type { MusicState, SessionUser } from '@vtt/shared';
import { ROLE_GM } from '@vtt/shared';
import type { PrismaClient } from './db.js';
import { RealtimeError } from './realtime/registry.js';

export function readMusic(campaignId: string, raw: string): MusicState {
  const saved = JSON.parse(raw) as Partial<MusicState>;
  return {
    campaignId,
    revision: saved.revision ?? 0,
    tracks: saved.tracks ?? [],
    playback: saved.playback ?? null,
    serverNow: Date.now(),
  };
}

export function musicFor(state: MusicState, user: SessionUser): MusicState {
  return { ...state, tracks: user.role === ROLE_GM ? state.tracks : [] };
}

/** Transaction keeps simultaneous uploads and GM controls from losing updates. */
export async function updateMusic(
  prisma: PrismaClient,
  campaignId: string,
  change: (state: MusicState) => void,
): Promise<MusicState> {
  return prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign?.active) throw new RealtimeError('NO_CAMPAIGN');
    const state = readMusic(campaignId, campaign.music);
    change(state);
    state.revision++;
    await tx.campaign.update({ where: { id: campaignId }, data: { music: JSON.stringify(state) } });
    return state;
  });
}

/** Sniff supported containers; never serve arbitrary uploaded HTML as audio. */
export function musicExtension(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  if (buffer.toString('ascii', 0, 4) === 'OggS') return 'ogg';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE')
    return 'wav';
  if (
    buffer.toString('ascii', 0, 3) === 'ID3' ||
    (buffer[0] === 0xff && (buffer[1]! & 0xe0) === 0xe0 && (buffer[1]! & 6) !== 0)
  )
    return 'mp3';
  return null;
}
