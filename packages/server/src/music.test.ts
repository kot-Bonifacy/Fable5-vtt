import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import type { MusicState, MusicTrack, SocketAck } from '@vtt/shared';
import { buildApp, type BuiltApp } from './app.js';
import { musicExtension } from './music.js';
import { exportCampaign } from './archive.js';
import { referencedUploadUrls } from './uploads-gc.js';

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
    payload: { password: 'test-password' },
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
