import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  CampaignSummary,
  ChatMessageBroadcast,
  ChatMessageView,
  CharacterView,
  CompendiumEntry,
  CpredCharacterData,
  DefenseZoneDisarmResult,
  DefenseZoneView,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenView,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { joinUrl } from './test-join.js';
import { paceTesting } from './realtime/pace.js';

paceTesting.off = true;

/**
 * Rozbrajanie pułapki przez gracza (etap 58b) na prawdziwych gniazdach.
 *
 * Korytarz jak w `zones.test.ts`: pole to 100 px i 2 m, więc metr to 50 px.
 * Podłoga elektryczna leży od x = 500 do x = 900 (10–18 m), wpis daje PT 13
 * rozbrojenia i minutę pracy. Kolec ma TECH 2 i Elektronikę 0, więc wynik to
 * 2 + kość — kości ustawia `VTT_DICE_SCRIPT` (bez 1 i 10, które dorzucają).
 */

const TEST_DB = `./.test-${randomBytes(6).toString('hex')}.db`;
const GM_PASSWORD = 'test-haslo';
const PX_PER_M = 50;
const ZONE_X = 10 * PX_PER_M;

const DICE = join(mkdtempSync(join(tmpdir(), 'vtt-disarm-dice-')), 'dice.txt');
const previousDiceScript = process.env.VTT_DICE_SCRIPT;
function scriptDice(faces: number[]): void {
  writeFileSync(DICE, faces.join(' '));
}

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
  const firstSync = new Promise<StateSyncPayload>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('state:sync timeout')), 4000);
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    socket.once('state:sync', (payload: StateSyncPayload) => {
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
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), 4000);
    const ack = (response: SocketAck<T>) => {
      clearTimeout(timer);
      resolve(response);
    };
    if (payload === undefined) socket.emit(event, ack);
    else socket.emit(event, payload, ack);
  });
}

function data<T>(ack: SocketAck<T>, what: string): T {
  if (!ack.ok) throw new Error(`${what} failed: ${ack.error}`);
  if (ack.data === undefined) throw new Error(`${what} returned no data`);
  return ack.data;
}

function waitFor<T>(socket: ClientSocket, event: string, ms = 4000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

/** Następna wiadomość czatu, która spełnia warunek — inne po drodze przepuszcza. */
function waitForMessage(
  socket: ClientSocket,
  test: (message: ChatMessageView) => boolean,
  ms = 4000,
): Promise<ChatMessageView> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('chat:message', listener);
      reject(new Error('chat:message (warunek) timeout'));
    }, ms);
    const listener = ({ message }: ChatMessageBroadcast) => {
      if (!test(message)) return;
      clearTimeout(timer);
      socket.off('chat:message', listener);
      resolve(message);
    };
    socket.on('chat:message', listener);
  });
}

async function roundTrip(socket: ClientSocket): Promise<StateSyncPayload> {
  const sync = waitFor<StateSyncPayload>(socket, 'state:sync');
  await emitAck(socket, 'state:request');
  return sync;
}

beforeAll(async () => {
  process.env.VTT_DICE_SCRIPT = DICE;
  scriptDice([]);
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
    payload: { name: 'Kampania rozbrajania' },
  });
  const campaignId = (campaignRes.json() as CampaignSummary).id;
  const joinRes = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, campaignId, 'Kolec'),
  });
  playerCookie = cookieOf(joinRes.headers['set-cookie']);
  playerId = (joinRes.json() as { user: { id: string } }).user.id;
}, 60_000);

afterAll(async () => {
  if (previousDiceScript === undefined) delete process.env.VTT_DICE_SCRIPT;
  else process.env.VTT_DICE_SCRIPT = previousDiceScript;
  for (const socket of openSockets) socket.disconnect();
  await built.app.close();
  try {
    unlinkSync(TEST_DB);
  } catch {
    // best effort — Windows may still hold the file
  }
});

describe('disarming a trap (stage 58b)', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;
  let characterId: string;
  let tokenId: string;
  let zoneId: number;

  /** Rzut z kubka na wezwanie rozbrajania — kości ustawione z góry. */
  async function roll(callMessageId: number, faces: number[]): Promise<void> {
    scriptDice(faces);
    data(
      await emitAck(player, 'character:roll', {
        characterId,
        request: { kind: 'skill', skillId: 'electronics-security', luckSpent: 0 },
        callMessageId,
      }),
      'character:roll (rozbrajanie)',
    );
  }

  async function disarm(): Promise<SocketAck<DefenseZoneDisarmResult>> {
    return emitAck<DefenseZoneDisarmResult>(player, 'zone:disarm', { zoneId, characterId });
  }

  async function gmZone(): Promise<DefenseZoneView> {
    const zone = (await roundTrip(gm)).zones.find((row) => row.id === zoneId);
    if (!zone) throw new Error('zone missing from the GM sync');
    return zone;
  }

  async function hp(): Promise<number> {
    const sheet = (await roundTrip(player)).characters.find((row) => row.id === characterId);
    return (sheet!.data as CpredCharacterData).hpCurrent;
  }

  async function clock(): Promise<number> {
    return (await roundTrip(gm)).gameTime.minutes;
  }

  /** MG stawia figurę Kolca — bez trasy, bez puli, bez rzutu Percepcji (strefa jawna). */
  async function place(x: number): Promise<void> {
    data(
      await emitAck<{ x: number; y: number }>(gm, 'token:move', { tokenId, x, y: 0, final: true }),
      'token:move (MG)',
    );
  }

  it('sets the table: a corridor, Kolec and a disarmable floor', async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);

    const character = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Kolec', ownerId: playerId }),
      'character:create',
    );
    characterId = character.id;
    await emitAck(gm, 'character:update', {
      characterId,
      patch: {
        data: {
          stats: { ...(character.data as CpredCharacterData).stats, body: 8, will: 8, tech: 2 },
          skills: { 'electronics-security': 0 },
        },
      },
    });

    const scene = data(await emitAck<SceneView>(gm, 'scene:create', { name: 'Korytarz' }), 'scene');
    sceneId = scene.id;
    await emitAck(gm, 'scene:update', { sceneId, patch: { playerMove: 'explore' } });
    await emitAck(gm, 'scene:update', { sceneId, patch: { width: 4000 } });
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'open' });
    const activated = waitFor(player, 'scene:activate');
    await emitAck(gm, 'scene:activate', { sceneId });
    await activated;

    tokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Kolec',
        x: 0,
        y: 0,
        ownerId: playerId,
        characterId,
      }),
      'token:create',
    ).id;

    data(
      await emitAck<CompendiumEntry>(gm, 'compendium:upsert', {
        entry: {
          category: 'netDefense',
          name: 'Podłoga elektryczna',
          cost: 1000,
          defenseKind: 'environment',
          disableDv: 13,
          disableMinutes: 1,
          hp: 20,
          spotDv: 17,
          trigger: 'Cel wchodzi na zelektryfikowany obszar.',
          effects: { damage: '6k6', noAblation: true },
        },
      }),
      'compendium:upsert',
    );
    zoneId = data(
      await emitAck<DefenseZoneView>(gm, 'zone:create', {
        sceneId,
        entryId: 'defense.podloga-elektryczna',
        x: ZONE_X,
        y: 0,
        width: 8 * PX_PER_M,
        height: 4 * PX_PER_M,
      }),
      'zone:create',
    ).id;
  });

  it('refuses a zone the player has not spotted exactly as one that does not exist', async () => {
    // Strefa ukryta i niezauważona: gracz nie ma jej w payloadzie, więc odmowa
    // nie może się różnić od odmowy dla numeru, którego nie ma wcale.
    const hidden = await disarm();
    const missing = await emitAck(player, 'zone:disarm', { zoneId: 999_999, characterId });
    expect(hidden).toEqual({ ok: false, error: 'ZONE_NOT_FOUND' });
    expect(missing).toEqual(hidden);
  });

  it('wants the figure within arm’s reach of the zone’s edge', async () => {
    await emitAck(gm, 'zone:update', { zoneId, patch: { hidden: false } });
    expect(await disarm()).toEqual({ ok: false, error: 'OUT_OF_REACH' });
    // Pole tuż przed strefą: środek 1 m od krawędzi.
    await place(ZONE_X - 2 * PX_PER_M);
  });

  it('a small failure keeps the trap armed, spends the try and the minute', async () => {
    const before = await clock();
    const call = data(await disarm(), 'zone:disarm');
    // Drugi klik nie wystawia drugiego wezwania.
    expect(data(await disarm(), 'zone:disarm (again)')).toEqual(call);

    const gmLine = waitForMessage(gm, (message) => message.kind === 'gmaction');
    await roll(call.callMessageId, [9]); // 2 + 9 = 11 vs PT 13 — porażka o 2
    expect((await gmLine).action?.note).toContain('nie rozbraja');

    const zone = await gmZone();
    expect(zone.armed).toBe(true);
    expect(zone.disarmTried).toEqual([characterId]);
    expect(await clock()).toBe(before + 1);
    expect(await disarm()).toEqual({ ok: false, error: 'DISARM_TRIED' });
  });

  it('a failure by 5 or more sets the system off at the one disarming it', async () => {
    await emitAck(gm, 'zone:update', { zoneId, patch: { resetDisarmTries: true } });
    expect((await gmZone()).disarmTried).toEqual([]);
    const before = await hp();
    const call = data(await disarm(), 'zone:disarm');
    const gmLine = waitForMessage(gm, (message) => message.kind === 'gmaction');
    await roll(call.callMessageId, [5, 1, 1, 1, 1, 1, 1]); // 2 + 5 = 7 vs PT 13 — o 6
    expect((await gmLine).action?.note).toContain('system odpala');
    expect(await hp()).toBe(before - 6);
    expect((await gmZone()).armed).toBe(true);
  });

  it('a success disarms it, the player still reads it as armed, and walking in does not hurt', async () => {
    await emitAck(gm, 'zone:update', { zoneId, patch: { resetDisarmTries: true, disarmDv: 6 } });
    expect((await gmZone()).disarmDv).toBe(6);
    const call = data(await disarm(), 'zone:disarm');
    await roll(call.callMessageId, [9]); // 2 + 9 = 11 vs PT 6 (nadpisanie MG)

    expect((await gmZone()).armed).toBe(false);
    const seen = (await roundTrip(player)).zones.find((row) => row.id === zoneId)!;
    expect(seen.armed).toBe(true);
    expect(seen.disarmDv).toBeUndefined();
    expect(seen.disarmTried).toBeUndefined();

    const before = await hp();
    data(
      await emitAck(player, 'token:move', { tokenId, x: ZONE_X + PX_PER_M * 2, y: 0, final: true }),
      'token:move (gracz na strefę)',
    );
    expect(await hp()).toBe(before);
  });

  it('refuses in combat with its own code, and the clock stays', async () => {
    await emitAck(gm, 'zone:update', {
      zoneId,
      patch: { armed: true, resetDisarmTries: true, disarmDv: null },
    });
    await place(ZONE_X - 2 * PX_PER_M);
    data(await emitAck(gm, 'combat:start', { sceneId, tokenIds: [tokenId] }), 'combat:start');
    const before = await clock();
    expect(await disarm()).toEqual({ ok: false, error: 'DISARM_IN_COMBAT' });
    expect(await clock()).toBe(before);
    await emitAck(gm, 'combat:end', { sceneId });
  });
});
