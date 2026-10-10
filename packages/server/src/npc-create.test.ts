import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  CharacterUpsertBroadcast,
  CharacterView,
  CpredCharacterData,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenView,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { joinUrl } from './test-join.js';

/**
 * Okno „Nowa postać” i wzorce statystów (etap 49a, zlecenie MG z 10.10.2026).
 *
 * MG zakłada NPC-a statblokiem (Cechy, PW, broń i pancerz z Kompendium,
 * Umiejętności), a karta-wzorzec statysty nigdy nie staje na mapie: każda
 * figura postawiona z niej dostaje własną kopię karty z numerem — jak
 * niepowiązany aktor w Foundry VTT.
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

function createSocket(cookie: string): {
  socket: ClientSocket;
  firstSync: Promise<StateSyncPayload>;
} {
  const socket = ioClient(baseUrl, {
    extraHeaders: { cookie },
    reconnection: false,
    timeout: 3000,
  });
  openSockets.push(socket);
  const firstSync = new Promise<StateSyncPayload>((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error('state:sync timeout')), 4000);
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    socket.once('state:sync', (payload: StateSyncPayload) => {
      clearTimeout(timer);
      resolvePromise(payload);
    });
  });
  return { socket, firstSync };
}

function emitAck<T = undefined>(
  socket: ClientSocket,
  event: string,
  payload?: unknown,
): Promise<SocketAck<T>> {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), 5000);
    const ack = (response: SocketAck<T>) => {
      clearTimeout(timer);
      resolvePromise(response);
    };
    if (payload === undefined) socket.emit(event, ack);
    else socket.emit(event, payload, ack);
  });
}

function data<T>(ack: SocketAck<T>, what: string): T {
  if (!ack.ok || ack.data === undefined) throw new Error(`${what} failed: ${JSON.stringify(ack)}`);
  return ack.data;
}

function waitFor<T>(socket: ClientSocket, event: string, ms = 4000): Promise<T> {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolvePromise(payload);
    });
  });
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
    payload: { name: 'Zaułek gangu' },
  });
  const join = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, (campaignRes.json() as { id: string }).id, 'Marek'),
  });
  playerCookie = cookieOf(join.headers['set-cookie']);
  playerId = (join.json() as { user: { id: string } }).user.id;
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

describe('okno „Nowa postać” i wzorce statystów (etap 49a)', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;
  let templateId: string;

  async function sync(socket: ClientSocket): Promise<StateSyncPayload> {
    const next = waitFor<StateSyncPayload>(socket, 'state:sync');
    await emitAck(socket, 'state:request');
    return next;
  }

  it('zakłada kartę ze statbloku: broń i pancerz z Kompendium, Umiejętności, PW', async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);
    sceneId = data(
      await emitAck<SceneView>(gm, 'scene:create', { name: 'Zaułek' }),
      'scene:create',
    ).id;
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'open' });
    await emitAck(gm, 'scene:activate', { sceneId });

    const leaked: CharacterUpsertBroadcast[] = [];
    player.on('character:upsert', (payload: CharacterUpsertBroadcast) => leaked.push(payload));

    const ganger = data(
      await emitAck<CharacterView>(gm, 'character:create', {
        name: 'Ganger',
        template: true,
        npc: {
          stats: { ref: 6, body: 7, will: 4 },
          hpMax: null,
          skills: { handgun: 4, evasion: 3, 'nie-ma-takiej': 5 },
          weaponIds: ['weapon.zgrzyt-9'],
          armorHeadId: 'armor.helm-kurierski',
          armorBodyId: 'armor.kurtka-warsztatowa',
        },
      }),
      'character:create',
    );
    templateId = ganger.id;
    expect(ganger.template).toBe(true);
    expect(ganger.templateId).toBeNull();
    const sheet = ganger.data as CpredCharacterData;
    expect(sheet.stats.ref).toBe(6);
    expect(sheet.skills).toMatchObject({ handgun: 4, evasion: 3 });
    expect(sheet.skills['nie-ma-takiej']).toBeUndefined();
    expect(sheet.weapons.map((row) => row.compendiumId)).toContain('weapon.zgrzyt-9');
    expect(sheet.armor.map((row) => [row.compendiumId, row.location])).toEqual([
      ['armor.helm-kurierski', 'head'],
      ['armor.kurtka-warsztatowa', 'body'],
    ]);
    expect(sheet.hpCurrent).toBe(10 + 5 * Math.ceil((7 + 4) / 2));

    // Karta NPC-a nie opuszcza serwera w stronę gracza.
    await new Promise((settle) => setTimeout(settle, 200));
    expect(leaked).toEqual([]);
  });

  it('każda figura z wzorca dostaje własną kopię karty z numerem', async () => {
    const place = async (x: number) =>
      data(
        await emitAck<TokenView>(gm, 'token:create', {
          sceneId,
          name: 'Ganger',
          imageUrl: null,
          x,
          y: 0,
          characterId: templateId,
        }),
        'token:create',
      );
    const first = await place(0);
    const second = await place(200);
    expect(first.name).toBe('Ganger 1');
    expect(second.name).toBe('Ganger 2');
    expect(first.characterId).not.toBe(templateId);
    expect(second.characterId).not.toBe(first.characterId);

    const state = await sync(gm);
    const copy = state.characters.find((row) => row.id === first.characterId);
    expect(copy?.name).toBe('Ganger 1');
    expect(copy?.templateId).toBe(templateId);
    expect(copy?.template).toBe(false);
    expect((copy?.data as CpredCharacterData).weapons.map((row) => row.compendiumId)).toContain(
      'weapon.zgrzyt-9',
    );
    // Wzorzec nie stoi na mapie.
    expect(state.tokens.some((row) => row.characterId === templateId)).toBe(false);

    // Kopia kopii należy do tego samego wzorca i ma własną kartę.
    const third = data(
      await emitAck<TokenView>(gm, 'token:duplicate', { tokenId: second.id }),
      'token:duplicate',
    );
    expect(third.name).toBe('Ganger 3');
    const thirdCard = (await sync(gm)).characters.find((row) => row.id === third.characterId);
    expect(thirdCard?.templateId).toBe(templateId);
  });

  it('nazwany NPC ma jedną kartę i każda figura stoi na niej', async () => {
    const fixer = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Fikserka', npc: {} }),
      'character:create',
    );
    expect(fixer.template).toBe(false);
    const token = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Fikserka',
        imageUrl: null,
        x: 400,
        y: 0,
        characterId: fixer.id,
      }),
      'token:create',
    );
    expect(token.characterId).toBe(fixer.id);
    expect(token.name).toBe('Fikserka');
  });

  it('wzorzec przełącza tylko MG, a karta gracza wzorcem nie zostaje', async () => {
    const own = data(
      await emitAck<CharacterView>(gm, 'character:create', {
        name: 'Kowal',
        ownerId: playerId,
        template: true,
      }),
      'character:create',
    );
    expect(own.template).toBe(false);
    const refused = await emitAck(player, 'character:update', {
      characterId: own.id,
      patch: { template: true },
    });
    expect(refused.ok).toBe(false);

    const off = data(
      await emitAck<CharacterView>(gm, 'character:update', {
        characterId: templateId,
        patch: { template: false },
      }),
      'character:update',
    );
    expect(off.template).toBe(false);
    expect(
      (await emitAck(gm, 'character:update', { characterId: templateId, patch: { template: 1 } }))
        .ok,
    ).toBe(false);
  });
});
