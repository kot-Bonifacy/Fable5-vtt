import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  CampaignSummary,
  CharacterView,
  CpredCharacterData,
  CpredGearRow,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenView,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { joinUrl } from './test-join.js';

/**
 * Latarka z ekwipunku (31.10.2026): zapalony wiersz „Latarka" na karcie świeci
 * figurą tej karty, a przełącznik latarki na mapie zapisuje ten sam wiersz.
 */

const TEST_DB = `./.test-${randomBytes(6).toString('hex')}.db`;
const GM_PASSWORD = 'test-haslo';

const config: ServerConfig = {
  port: 0,
  host: '127.0.0.1',
  clientOrigin: 'http://localhost:5173',
  databaseUrl: `file:${TEST_DB}`,
  gmName: 'MG',
  gmPassword: GM_PASSWORD,
  cookieSecret: 'test-cookie-secret',
  sessionTtlDays: 1,
  uploadsDir: mkdtempSync(join(tmpdir(), 'vtt-uploads-')),
  dataPublicDir: resolve(import.meta.dirname, '../../../data/public'),
  dataPrivateDir: resolve(import.meta.dirname, 'fixtures/no-private-data'),
  aiGatewayUrl: 'http://127.0.0.1:1',
  aiGatewayApiKey: '',
  aiHealthIntervalMs: 60_000,
  aiRequestTimeoutMs: 1000,
};

let built: BuiltApp;
let baseUrl: string;
let gmCookie: string;
let playerCookie: string;
let playerId: string;
const openSockets: ClientSocket[] = [];

function cookieOf(setCookieHeader: string | string[] | undefined): string {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  if (!raw) throw new Error('missing set-cookie header');
  return raw.split(';')[0]!;
}

function createSocket(cookie: string): { socket: ClientSocket; firstSync: Promise<unknown> } {
  const socket = ioClient(baseUrl, {
    extraHeaders: { cookie },
    reconnection: false,
    timeout: 3000,
  });
  openSockets.push(socket);
  const firstSync = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('state:sync timeout')), 4000);
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    socket.once('state:sync', (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
  return { socket, firstSync };
}

function emitAck<T = undefined>(
  socket: ClientSocket,
  event: string,
  payload?: unknown,
): Promise<SocketAck<T>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), 3000);
    socket.emit(event, payload, (response: SocketAck<T>) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

function data<T>(ack: SocketAck<T>, what: string): T {
  if (!ack.ok) throw new Error(`${what} failed: ${ack.error}`);
  if (ack.data === undefined) throw new Error(`${what} returned no data`);
  return ack.data;
}

async function tokenOf(socket: ClientSocket, tokenId: string): Promise<TokenView> {
  const sync = new Promise<StateSyncPayload>((resolve) => socket.once('state:sync', resolve));
  await emitAck(socket, 'state:request');
  const token = (await sync).tokens.find((t) => t.id === tokenId);
  if (!token) throw new Error('token missing from state:sync');
  return token;
}

beforeAll(async () => {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: config.databaseUrl },
    stdio: 'pipe',
  });
  built = await buildApp(config, { logger: false });
  await built.app.listen({ port: 0, host: '127.0.0.1' });
  const address = built.app.server.address();
  if (address === null || typeof address === 'string') throw new Error('no server address');
  baseUrl = `http://127.0.0.1:${address.port}`;

  const login = await built.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { login: 'MG', password: GM_PASSWORD },
  });
  gmCookie = cookieOf(login.headers['set-cookie']);
  const campaignRes = await built.app.inject({
    method: 'POST',
    url: '/api/campaigns',
    headers: { cookie: gmCookie },
    payload: { name: 'Kampania latarek' },
  });
  const campaignId = (campaignRes.json() as CampaignSummary).id;
  const joinRes = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, campaignId, 'Rogue'),
  });
  playerCookie = cookieOf(joinRes.headers['set-cookie']);
  playerId = (joinRes.json() as { user: { id: string } }).user.id;
}, 60_000);

afterAll(async () => {
  for (const socket of openSockets) socket.disconnect();
  await built.app.close();
  try {
    unlinkSync(TEST_DB);
  } catch {
    // best effort — Windows may still hold the file
  }
});

describe('a torch in the inventory lights the figure', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let characterId: string;
  let tokenId: string;

  async function gearOf(): Promise<CpredGearRow[]> {
    const sync = new Promise<StateSyncPayload>((resolve) => player.once('state:sync', resolve));
    await emitAck(player, 'state:request');
    const sheet = (await sync).characters.find((c) => c.id === characterId)!;
    return (sheet.data as CpredCharacterData).gear;
  }

  beforeAll(async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);

    characterId = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Rogue', ownerId: playerId }),
      'character:create',
    ).id;
    data(
      await emitAck(gm, 'character:update', {
        characterId,
        patch: {
          data: {
            gear: [
              { id: 'g-rope', name: 'Lina', notes: '', qty: 1 },
              { id: 'g-torch', name: 'Latarka', notes: '', qty: 1, compendiumId: 'gear.latarka' },
            ],
          },
        },
      }),
      'gear',
    );
    const scene = data(await emitAck<SceneView>(gm, 'scene:create', { name: 'Kanał' }), 'scene');
    await emitAck(gm, 'scene:activate', { sceneId: scene.id });
    tokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId: scene.id,
        name: 'Rogue',
        x: 100,
        y: 100,
        ownerId: playerId,
        characterId,
      }),
      'token:create',
    ).id;
  }, 30_000);

  it('a figure whose sheet holds a torch gets a lamp, switched off', async () => {
    const token = await tokenOf(gm, tokenId);
    expect(token.light).toMatchObject({ brightM: 6, dimM: 12, on: false });
  });

  it('lighting the torch on the sheet lights the figure', async () => {
    const gear = await gearOf();
    const ack = await emitAck(player, 'character:update', {
      characterId,
      patch: {
        data: { gear: gear.map((row) => (row.id === 'g-torch' ? { ...row, lit: true } : row)) },
      },
    });
    expect(ack.ok).toBe(true);
    expect((await tokenOf(gm, tokenId)).light?.on).toBe(true);
  });

  it('the map switch puts the torch out on the sheet too', async () => {
    data(await emitAck<TokenView>(player, 'token:light', { tokenId }), 'token:light');
    expect((await tokenOf(gm, tokenId)).light?.on).toBe(false);
    expect((await gearOf()).find((row) => row.id === 'g-torch')?.lit).toBeUndefined();

    data(await emitAck<TokenView>(player, 'token:light', { tokenId, on: true }), 'token:light on');
    expect((await gearOf()).find((row) => row.id === 'g-torch')?.lit).toBe(true);
    expect((await tokenOf(gm, tokenId)).light?.on).toBe(true);
  });

  it('a rope cannot be lit', async () => {
    const gear = await gearOf();
    await emitAck(player, 'character:update', {
      characterId,
      patch: {
        data: { gear: gear.map((row) => (row.id === 'g-rope' ? { ...row, lit: true } : row)) },
      },
    });
    expect((await gearOf()).find((row) => row.id === 'g-rope')?.lit).toBeUndefined();
  });

  it('dropping the lit torch from the sheet puts the figure in the dark', async () => {
    const gear = await gearOf();
    await emitAck(gm, 'character:update', {
      characterId,
      patch: { data: { gear: gear.filter((row) => row.id !== 'g-torch') } },
    });
    expect((await tokenOf(gm, tokenId)).light).toBeNull();
  });

  it('leaves a lamp the GM gave by hand alone', async () => {
    const lamp = { brightM: 3, dimM: 9, color: '#ffd9a0', flicker: false, on: true };
    data(await emitAck(gm, 'token:update', { tokenId, patch: { light: lamp } }), 'token:update');
    await emitAck(gm, 'character:update', { characterId, patch: { data: { eddies: 5 } } });
    expect((await tokenOf(gm, tokenId)).light).toMatchObject(lamp);
  });
});
