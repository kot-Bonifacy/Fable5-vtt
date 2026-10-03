import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import type { MusicState, MusicTrack, SocketAck, SceneView, StateSyncPayload } from '@vtt/shared';
import { buildApp, type BuiltApp } from './app.js';
import { importYoutubeAudio } from './youtube-import.js';
import { writeFile, access } from 'node:fs/promises';
import { musicExtension, readMusic, updateMusic } from './music.js';
import { exportCampaign, exportScene } from './archive.js';
import { referencedUploadUrls } from './uploads-gc.js';

vi.mock('./youtube-import.js', () => ({
  importYoutubeAudio: vi.fn(),
  YOUTUBE_AUDIO_MAX_BYTES: 128 * 1024 * 1024,
}));

const db = `./.test-music-${randomUUID()}.db`;
let built: BuiltApp;
let gmCookie: string;
let playerCookie: string;
let campaignId: string;
let gm: Socket;
let player: Socket;
let track: MusicTrack;
const sockets: Socket[] = [];
const cookie = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0]! : value!).split(';')[0]!;
function ack<T = undefined>(
  socket: Socket,
  event: string,
  payload?: unknown,
): Promise<SocketAck<T>> {
  return new Promise((resolve, reject) =>
    socket
      .timeout(4000)
      .emit(event, payload, (error: Error | null, result: SocketAck<T>) =>
        error ? reject(error) : resolve(result),
      ),
  );
}
async function connect(cookie: string) {
  const address = built.app.server.address();
  if (!address || typeof address === 'string') throw new Error('No address');
  const socket = io(`http://127.0.0.1:${address.port}`, {
    extraHeaders: { cookie },
    reconnection: false,
  });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('state:sync', () => resolve());
    socket.once('connect_error', reject);
  });
  return socket;
}
beforeAll(async () => {
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: `file:${db}` },
    stdio: 'pipe',
  });
  built = await buildApp(
    {
      port: 0,
      host: '127.0.0.1',
      clientOrigin: 'http://localhost:5173',
      databaseUrl: `file:${db}`,
      gmName: 'MG',
      gmPassword: 'test-password',
      cookieSecret: 'test-cookie-secret',
      sessionTtlDays: 1,
      uploadsDir: mkdtempSync(join(tmpdir(), 'vtt-music-')),
      dataPublicDir: resolve(import.meta.dirname, '../../../data/public'),
      dataPrivateDir: resolve(import.meta.dirname, 'fixtures/no-private-data'),
      aiGatewayUrl: 'http://127.0.0.1:1',
      aiGatewayApiKey: '',
      aiHealthIntervalMs: 60000,
      aiRequestTimeoutMs: 1000,
    },
    { logger: false, sweepUploads: false },
  );
  await built.app.listen({ port: 0, host: '127.0.0.1' });
  const login = await built.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { login: 'MG', password: 'test-password' },
  });
  gmCookie = cookie(login.headers['set-cookie']);
  const campaign = await built.app.inject({
    method: 'POST',
    url: '/api/campaigns',
    headers: { cookie: gmCookie },
    payload: { name: 'Test muzyki' },
  });
  campaignId = campaign.json().id;
  const invite = await built.app.inject({
    method: 'POST',
    url: `/api/campaigns/${campaignId}/invitations`,
    headers: { cookie: gmCookie },
    payload: {},
  });
  const joined = await built.app.inject({
    method: 'POST',
    url: `/api/join/${invite.json().token}`,
    payload: { name: 'Słuchacz' },
  });
  playerCookie = cookie(joined.headers['set-cookie']);
  gm = await connect(gmCookie);
  player = await connect(playerCookie);
}, 60000);
afterAll(async () => {
  for (const socket of sockets) socket.disconnect();
  await built?.app.close();
  try {
    unlinkSync(db);
  } catch {
    /* Windows may hold the test database. */
  }
});

function uploadPayload() {
  const wav = Buffer.alloc(64);
  wav.write('RIFF');
  wav.writeUInt32LE(56, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(20, 40);
  return Buffer.concat([
    Buffer.from(
      '--music\r\nContent-Disposition: form-data; name="file"; filename="Night.wav"\r\nContent-Type: audio/wav\r\n\r\n',
    ),
    wav,
    Buffer.from('\r\n--music--\r\n'),
  ]);
}
it('sniffs audio and rejects HTML regardless of extension', () => {
  expect(musicExtension(Buffer.from('<html>malicious.wav</html>'))).toBeNull();
  expect(musicExtension(Buffer.from('OggS000000000000'))).toBe('ogg');
  expect(musicExtension(Buffer.from('ID30000000000000'))).toBe('mp3');
});
it('allows only GM uploads and persists the library in backup/export references', async () => {
  const request = {
    method: 'POST' as const,
    url: `/api/music/${campaignId}/upload`,
    payload: uploadPayload(),
  };
  const refused = await built.app.inject({
    ...request,
    headers: { cookie: playerCookie, 'content-type': 'multipart/form-data; boundary=music' },
  });
  expect(refused.statusCode).toBe(403);
  const response = await built.app.inject({
    ...request,
    headers: { cookie: gmCookie, 'content-type': 'multipart/form-data; boundary=music' },
  });
  expect(response.statusCode).toBe(201);
  track = response.json();
  expect(await referencedUploadUrls(built.prisma)).toContain(track.url);
  const archive = await exportCampaign(built.prisma, campaignId, { includeChat: false });
  expect(JSON.stringify(archive)).toContain(track.url);
  const list = await ack<MusicState>(gm, 'music:request');
  expect(list.ok && list.data?.tracks).toHaveLength(1);
});
it('keeps the library private and rejects player controls and foreign campaigns', async () => {
  const state = await ack<MusicState>(player, 'music:request');
  expect(state.ok && state.data?.tracks).toEqual([]);
  expect(
    await ack(player, 'music:control', { campaignId, action: 'play', trackId: track.id }),
  ).toEqual({ ok: false, error: 'FORBIDDEN' });
  expect(await ack(gm, 'music:control', { campaignId: 'foreign', action: 'stop' })).toEqual({
    ok: false,
    error: 'NO_CAMPAIGN',
  });
  expect(await ack(gm, 'music:control', { campaignId, action: 'volume', volume: -1 })).toEqual({
    ok: false,
    error: 'INVALID_PAYLOAD',
  });
});
it('broadcasts playback, resumes on reconnect, pauses, loops and stops for everyone', async () => {
  const broadcast = new Promise<MusicState>((resolve) => player.once('music:state', resolve));
  expect(
    (await ack(gm, 'music:control', { campaignId, action: 'play', trackId: track.id })).ok,
  ).toBe(true);
  const playing = await broadcast;
  expect(playing.tracks).toEqual([]);
  expect(playing.playback?.track.id).toBe(track.id);
  const reconnected = await connect(playerCookie);
  const fresh = await ack<MusicState>(reconnected, 'music:request');
  expect(fresh.ok && fresh.data?.playback?.startedAt).toBe(playing.playback?.startedAt);
  for (const command of [
    { action: 'pause' },
    { action: 'loop', loop: false },
    { action: 'volume', volume: 30 },
  ])
    expect((await ack(gm, 'music:control', { campaignId, ...command })).ok).toBe(true);
  const paused = await ack<MusicState>(player, 'music:request');
  expect(paused.ok && paused.data?.playback).toMatchObject({
    playing: false,
    loop: false,
    volume: 30,
  });
  await ack(gm, 'music:control', { campaignId, action: 'resume' });
  const resumed = await ack<MusicState>(player, 'music:request');
  expect(resumed.ok && resumed.data?.playback?.playing).toBe(true);
  await ack(gm, 'music:control', { campaignId, action: 'remove', trackId: track.id });
  const stopped = await ack<MusicState>(player, 'music:request');
  expect(stopped.ok && stopped.data?.playback).toBeNull();
  expect(await referencedUploadUrls(built.prisma)).not.toContain(track.url);
});

it('saves scene ambience, protects GM control and sends only the viewed scene', async () => {
  const created = await ack<SceneView>(gm, 'scene:create', { name: 'Otoczenie' });
  if (!created.ok || !created.data) throw new Error('missing scene');
  const sceneId = created.data.id;
  expect(created.data.ambience).toBe('none');
  const change = { sceneId, patch: { ambience: 'rain' } };
  expect(await ack(player, 'scene:update', change)).toEqual({ ok: false, error: 'FORBIDDEN' });
  expect(await ack(gm, 'scene:update', { sceneId, patch: { ambience: '../private' } })).toEqual({
    ok: false,
    error: 'BAD_REQUEST',
  });
  const updated = await ack<SceneView>(gm, 'scene:update', change);
  expect(updated.ok && updated.data?.ambience).toBe('rain');
  expect((await built.prisma.scene.findUniqueOrThrow({ where: { id: sceneId } })).ambience).toBe(
    'rain',
  );
  const exported = await exportScene(built.prisma, sceneId);
  expect(JSON.stringify(exported)).toContain('"ambience":"rain"');
  await ack(gm, 'scene:activate', { sceneId });
  const sync = new Promise<StateSyncPayload>((resolve) => player.once('state:sync', resolve));
  player.emit('state:request');
  expect((await sync).scene?.ambience).toBe('rain');
  const other = await ack<SceneView>(gm, 'scene:create', { name: 'Ukryte otoczenie' });
  if (!other.ok || !other.data) throw new Error('missing scene');
  await ack(gm, 'scene:update', { sceneId: other.data.id, patch: { ambience: 'fire' } });
  const resync = new Promise<StateSyncPayload>((resolve) => player.once('state:sync', resolve));
  player.emit('state:request');
  expect((await resync).scene?.ambience).toBe('rain');
});

it('imports only audio for GM, broadcasts a private MP3 and includes it in export/GC', async () => {
  let temporary = '';
  vi.mocked(importYoutubeAudio).mockImplementationOnce(async (id, directory, _signal, progress) => {
    expect(id).toBe('jNQXAC9IVRw');
    temporary = directory;
    progress({ phase: 'converting', progress: 0 });
    await writeFile(join(directory, 'audio.mp3'), Buffer.from('ID3000000000000000000'));
    return 'Title from video';
  });
  const request = {
    method: 'POST' as const,
    url: `/api/music/${campaignId}/youtube`,
    payload: { url: 'https://youtu.be/jNQXAC9IVRw', name: 'Audio only' },
  };
  expect(
    (await built.app.inject({ ...request, headers: { cookie: playerCookie } })).statusCode,
  ).toBe(403);
  expect(
    (
      await built.app.inject({
        ...request,
        headers: { cookie: gmCookie },
        payload: { url: 'http://localhost/private' },
      })
    ).statusCode,
  ).toBe(400);
  expect((await built.app.inject({ ...request, headers: { cookie: gmCookie } })).statusCode).toBe(
    202,
  );
  await vi.waitFor(async () => {
    const status = await built.app.inject({ url: request.url, headers: { cookie: gmCookie } });
    expect(status.json().phase).toBe('complete');
  });
  const state = await ack<MusicState>(gm, 'music:request');
  if (!state.ok || !state.data) throw new Error('missing music');
  const imported = state.data.tracks.find((track) => track.name === 'Audio only')!;
  expect(imported.url).toMatch(/^\/uploads\/music\/[\w-]+\.mp3$/);
  expect(imported).not.toHaveProperty('youtubeId');
  expect(await referencedUploadUrls(built.prisma)).toContain(imported.url);
  expect(
    JSON.stringify(await exportCampaign(built.prisma, campaignId, { includeChat: false })),
  ).toContain(imported.url);
  await vi.waitFor(async () => {
    await expect(access(temporary)).rejects.toThrow();
  });
  await ack(gm, 'music:control', { campaignId, action: 'play', trackId: imported.id });
  const playback = await ack<MusicState>(player, 'music:request');
  expect(playback.ok && playback.data?.playback?.track).toEqual(imported);
  expect(playback.ok && playback.data?.tracks).toEqual([]);
  await ack(gm, 'music:control', { campaignId, action: 'stop' });
});

it('limits concurrent imports, allows cancellation and leaves no incomplete track', async () => {
  vi.mocked(importYoutubeAudio).mockImplementationOnce(
    async (_id, _directory, signal) =>
      new Promise((_resolve, reject) => {
        if (signal.aborted) reject(new Error('IMPORT_CANCELLED'));
        else
          signal.addEventListener('abort', () => reject(new Error('IMPORT_CANCELLED')), {
            once: true,
          });
      }),
  );
  const request = {
    method: 'POST' as const,
    url: `/api/music/${campaignId}/youtube`,
    headers: { cookie: gmCookie },
    payload: { url: 'https://youtu.be/jNQXAC9IVRw' },
  };
  expect((await built.app.inject(request)).statusCode).toBe(202);
  expect((await built.app.inject(request)).json().error).toBe('IMPORT_BUSY');
  expect(
    (
      await built.app.inject({
        method: 'POST',
        url: `${request.url}/cancel`,
        headers: { cookie: playerCookie },
      })
    ).statusCode,
  ).toBe(403);
  await built.app.inject({
    method: 'POST',
    url: `${request.url}/cancel`,
    headers: request.headers,
  });
  await vi.waitFor(async () => {
    expect(
      (await built.app.inject({ url: request.url, headers: request.headers })).json().phase,
    ).toBe('cancelled');
  });
  vi.mocked(importYoutubeAudio).mockRejectedValueOnce(new Error('VIDEO_UNAVAILABLE'));
  await vi.waitFor(async () => {
    expect((await built.app.inject(request)).statusCode).toBe(202);
  });
  await vi.waitFor(async () => {
    expect(
      (await built.app.inject({ url: request.url, headers: request.headers })).json(),
    ).toMatchObject({ phase: 'error', error: 'VIDEO_UNAVAILABLE' });
  });
  const state = await ack<MusicState>(gm, 'music:request');
  expect(state.ok && state.data?.tracks).toHaveLength(1);
});

it('rejects malformed converter output and cleans it without adding a library entry', async () => {
  let temporary = '';
  vi.mocked(importYoutubeAudio).mockImplementationOnce(async (_id, directory) => {
    temporary = directory;
    await writeFile(join(directory, 'audio.mp3'), '<html>not audio</html>');
    return 'Invalid';
  });
  const url = `/api/music/${campaignId}/youtube`;
  expect((await built.app.inject({ url, headers: { cookie: playerCookie } })).statusCode).toBe(403);
  await built.app.inject({
    method: 'POST',
    url,
    headers: { cookie: gmCookie },
    payload: { url: 'https://youtu.be/jNQXAC9IVRw' },
  });
  await vi.waitFor(async () => {
    expect((await built.app.inject({ url, headers: { cookie: gmCookie } })).json()).toMatchObject({
      phase: 'error',
      error: 'INVALID_AUDIO',
    });
    await expect(access(temporary)).rejects.toThrow();
  });
  const state = await ack<MusicState>(gm, 'music:request');
  expect(state.ok && state.data?.tracks).toHaveLength(1);
});

it('replaces a legacy embedded link in place and never tries to play its HTML URL', async () => {
  const legacy = {
    id: 'legacy-id',
    name: 'Existing music',
    url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
  };
  await updateMusic(built.prisma, campaignId, (state) => {
    state.tracks.push(legacy);
    state.playback = {
      track: legacy,
      playing: true,
      position: 0,
      startedAt: Date.now(),
      loop: true,
      volume: 70,
    };
  });
  const stored = await built.prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  expect(readMusic(campaignId, stored.music).playback).toBeNull();
  expect(
    await ack(gm, 'music:control', { campaignId, action: 'play', trackId: legacy.id }),
  ).toEqual({ ok: false, error: 'IMPORT_REQUIRED' });
  vi.mocked(importYoutubeAudio).mockImplementationOnce(async (_id, directory) => {
    await writeFile(join(directory, 'audio.mp3'), Buffer.from('ID3000000000000000000'));
    return 'Source title';
  });
  const url = `/api/music/${campaignId}/youtube`;
  await built.app.inject({
    method: 'POST',
    url,
    headers: { cookie: gmCookie },
    payload: { url: legacy.url, name: legacy.name },
  });
  await vi.waitFor(async () => {
    expect((await built.app.inject({ url, headers: { cookie: gmCookie } })).json().phase).toBe(
      'complete',
    );
  });
  const state = await ack<MusicState>(gm, 'music:request');
  if (!state.ok || !state.data) throw new Error('missing music');
  expect(state.data.tracks).toHaveLength(2);
  expect(state.data.tracks.find((track) => track.id === legacy.id)).toMatchObject({
    name: legacy.name,
    url: expect.stringMatching(/\.mp3$/),
  });
});
