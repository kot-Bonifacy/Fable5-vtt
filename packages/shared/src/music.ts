export const MUSIC_MAX_BYTES = 40 * 1024 * 1024;
export const MUSIC_ACCEPT = '.mp3,.ogg,.wav';
export interface MusicTrack {
  id: string;
  name: string;
  url: string;
}
export interface MusicPlayback {
  track: MusicTrack;
  playing: boolean;
  position: number;
  startedAt: number;
  loop: boolean;
  volume: number;
}
export interface MusicState {
  campaignId: string;
  revision: number;
  tracks: MusicTrack[];
  playback: MusicPlayback | null;
  serverNow: number;
}
export type MusicCommand =
  | { action: 'play'; trackId: string; campaignId: string }
  | { action: 'pause' | 'resume' | 'stop'; campaignId: string }
  | { action: 'loop'; loop: boolean; campaignId: string }
  | { action: 'volume'; volume: number; campaignId: string }
  | { action: 'remove'; trackId: string; campaignId: string };

/** Only individual videos on recognized YouTube hosts; never arbitrary embeds. */
export function youtubeVideoId(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  try {
    const url = new URL(raw.trim());
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port)
      return null;
    let id: string | null = null;
    if (url.hostname === 'youtu.be') id = url.pathname.slice(1);
    else if (
      ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(
        url.hostname,
      )
    ) {
      if (url.pathname === '/watch') id = url.searchParams.get('v');
      else id = /^\/(?:shorts|live|embed)\/([^/]+)\/?$/.exec(url.pathname)?.[1] ?? null;
    }
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export const AMBIENCE_PRESETS = {
  none: 'Cisza',
  rain: 'Deszcz',
  wind: 'Wiatr',
  fire: 'Ogień',
  street: 'Ulica',
} as const;
export type AmbiencePreset = keyof typeof AMBIENCE_PRESETS;
export function isAmbiencePreset(value: unknown): value is AmbiencePreset {
  return typeof value === 'string' && Object.hasOwn(AMBIENCE_PRESETS, value);
}

export interface MusicImportStatus {
  campaignId: string;
  phase: 'idle' | 'downloading' | 'converting' | 'complete' | 'error' | 'cancelled';
  progress: number;
  name?: string;
  error?: string;
}
