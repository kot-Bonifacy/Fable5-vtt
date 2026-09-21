import type { MusicCommand, MusicState } from '@vtt/shared';
import { ROLE_GM, youtubeVideoId } from '@vtt/shared';
import { musicFor, readMusic, updateMusic } from '../music.js';
import { defineEvent, RealtimeError, type RealtimeDeps } from './registry.js';
import { campaignRoom } from './state.js';

export async function broadcastMusic(deps: Pick<RealtimeDeps, 'io'>, state: MusicState) {
  const sockets = await deps.io.in(campaignRoom(state.campaignId)).fetchSockets();
  for (const socket of sockets) socket.emit('music:state', musicFor(state, socket.data.user));
}

export const musicStateEvent = defineEvent<undefined, MusicState>({
  name: 'music:request',
  async handler({ deps, socket, user }) {
    const id = socket.data.campaign?.id;
    if (!id) throw new RealtimeError('NO_CAMPAIGN');
    const campaign = await deps.ctx.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new RealtimeError('NO_CAMPAIGN');
    return musicFor(readMusic(id, campaign.music), user);
  },
});

export const musicControlEvent = defineEvent<MusicCommand>({
  name: 'music:control',
  role: ROLE_GM,
  async handler({ deps, socket, payload }) {
    const id = socket.data.campaign?.id;
    if (!id || !payload || payload.campaignId !== id) throw new RealtimeError('NO_CAMPAIGN');
    const state = await updateMusic(deps.ctx.prisma, id, (state) => {
      const playback = state.playback;
      switch (payload.action) {
        case 'play': {
          const track = state.tracks.find((t) => t.id === payload.trackId);
          if (!track) throw new RealtimeError('NOT_FOUND');
          if (youtubeVideoId(track.url)) throw new RealtimeError('IMPORT_REQUIRED');
          state.playback = {
            track,
            playing: true,
            position: 0,
            startedAt: state.serverNow,
            loop: playback?.loop ?? true,
            volume: playback?.volume ?? 70,
          };
          break;
        }
        case 'stop':
          state.playback = null;
          break;
        case 'remove':
          if (!state.tracks.some((t) => t.id === payload.trackId))
            throw new RealtimeError('NOT_FOUND');
          state.tracks = state.tracks.filter((t) => t.id !== payload.trackId);
          if (playback?.track.id === payload.trackId) state.playback = null;
          break;
        case 'pause':
          if (playback?.playing) {
            playback.position += Math.max(0, state.serverNow - playback.startedAt) / 1000;
            playback.playing = false;
          }
          break;
        case 'resume':
          if (playback && !playback.playing) {
            playback.startedAt = state.serverNow;
            playback.playing = true;
          }
          break;
        case 'loop':
          if (typeof payload.loop !== 'boolean') throw new RealtimeError('INVALID_PAYLOAD');
          if (playback) playback.loop = payload.loop;
          break;
        case 'volume':
          if (!Number.isFinite(payload.volume) || payload.volume < 0 || payload.volume > 100)
            throw new RealtimeError('INVALID_PAYLOAD');
          if (playback) playback.volume = payload.volume;
          break;
        default:
          throw new RealtimeError('INVALID_PAYLOAD');
      }
    });
    await broadcastMusic(deps, state);
  },
});
