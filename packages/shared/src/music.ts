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
