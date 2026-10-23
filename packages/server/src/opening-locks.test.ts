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
  CpredCharacterData,
  OpeningPickResult,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenView,
  WallView,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { joinUrl } from './test-join.js';
import { paceTesting } from './realtime/pace.js';

paceTesting.off = true;

/**
 * Zamek drzwi przez gracza (etap 58c) na prawdziwych gniazdach.
 *
 * Pole to 100 px i 2 m. Drzwi stoją pionowo na x = 500 (od y = 0 do 200),
 * figura Iskry przy klamce stoi na (400, 0) — środek 1 m od drzwi — a daleko
 * na (0, 0), 9 m. Scena jest odkryta, więc drzwi zasłania tylko ściana. Iskra ma TECH 2 i Otwieranie zamków 0, więc wynik to
 * 2 + kość — kości ustawia `VTT_DICE_SCRIPT` (bez 1 i 10, które dorzucają).
 */

const TEST_DB = `./.test-${randomBytes(6).toString('hex')}.db`;
const GM_PASSWORD = 'test-haslo';

const DICE = join(mkdtempSync(join(tmpdir(), 'vtt-lock-dice-')), 'dice.txt');
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

function okay(ack: SocketAck<unknown>, what: string): void {
  if (!ack.ok) throw new Error(`${what} failed: ${ack.error}`);
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
    payload: { name: 'Kampania zamków' },
  });
  const campaignId = (campaignRes.json() as CampaignSummary).id;
  const joinRes = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, campaignId, 'Iskra'),
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

describe('picking the lock of a door (stage 58c)', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;
  let characterId: string;
  let tokenId: string;
  let doorId: number;
  let privateDoorId: number;

  /** Rzut z kubka na wezwanie zamka — kości ustawione z góry. */
  async function roll(callMessageId: number, faces: number[]): Promise<void> {
    scriptDice(faces);
    data(
      await emitAck(player, 'character:roll', {
        characterId,
        request: { kind: 'skill', skillId: 'pick-lock', luckSpent: 0 },
        callMessageId,
      }),
      'character:roll (zamek)',
    );
  }

  function pick(payload: Record<string, unknown> = {}): Promise<SocketAck<OpeningPickResult>> {
    return emitAck<OpeningPickResult>(player, 'opening:pick', { wallId: doorId, ...payload });
  }

  async function gmDoor(): Promise<WallView> {
    const door = (await roundTrip(gm)).walls.find((wall) => wall.id === doorId);
    if (!door) throw new Error('door missing from the GM sync');
    return door;
  }

  async function playerDoor(): Promise<WallView | undefined> {
    return (await roundTrip(player)).openings.find((wall) => wall.id === doorId);
  }

  /** MG stawia figurę Iskry — bez trasy i bez puli. */
  async function place(x: number): Promise<void> {
    data(
      await emitAck<{ x: number; y: number }>(gm, 'token:move', { tokenId, x, y: 0, final: true }),
      'token:move (MG)',
    );
  }

  async function bolt(wallId = doorId): Promise<void> {
    data(
      await emitAck<WallView>(gm, 'wall:update', { wallId, patch: { locked: true } }),
      'wall:update (rygiel)',
    );
  }

  it('sets the table: a room behind a wall, Iskra and two bolted doors', async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);

    const character = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Iskra', ownerId: playerId }),
      'character:create',
    );
    characterId = character.id;
    await emitAck(gm, 'character:update', {
      characterId,
      patch: {
        data: {
          stats: { ...(character.data as CpredCharacterData).stats, tech: 2 },
          skills: { 'pick-lock': 0 },
        },
      },
    });

    const scene = data(await emitAck<SceneView>(gm, 'scene:create', { name: 'Klatka' }), 'scene');
    sceneId = scene.id;
    await emitAck(gm, 'scene:update', { sceneId, patch: { playerMove: 'explore' } });
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'open' });
    const activated = waitFor(player, 'scene:activate');
    await emitAck(gm, 'scene:activate', { sceneId });
    await activated;

    tokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Iskra',
        x: 0,
        y: 0,
        ownerId: playerId,
        characterId,
      }),
      'token:create',
    ).id;

    const create = async (playerToggle: boolean, y: number) =>
      data(
        await emitAck<WallView[]>(gm, 'wall:create', {
          sceneId,
          points: [
            { x: 500, y },
            { x: 500, y: y + 200 },
          ],
          kind: 'door',
          playerToggle,
        }),
        'wall:create',
      )[0]!.id;
    doorId = await create(true, 0);
    privateDoorId = await create(false, 200);
    await bolt();
    await bolt(privateDoorId);
  });

  it('keeps the refusal order of opening:toggle — unseen first, then reach', async () => {
    // Za ścianą drzwi „nie ma”: ta sama odmowa co dla numeru, którego nie ma wcale.
    const screen = data(
      await emitAck<WallView[]>(gm, 'wall:create', {
        sceneId,
        points: [
          { x: 300, y: -600 },
          { x: 300, y: 1000 },
        ],
        kind: 'wall',
      }),
      'wall:create (ściana)',
    )[0]!.id;
    const unseen = await pick();
    expect(unseen).toEqual({ ok: false, error: 'WALL_NOT_FOUND' });
    expect(await emitAck(player, 'opening:pick', { wallId: 999_999 })).toEqual(unseen);
    expect(await emitAck(player, 'opening:toggle', { wallId: doorId })).toEqual(unseen);
    okay(await emitAck(gm, 'wall:delete', { wallId: screen }), 'wall:delete');

    expect(await emitAck(player, 'opening:pick', { wallId: privateDoorId })).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });

    // Daleko od klamki zamek milczy — „zamknięte na klucz” mówi dopiero ręka.
    for (const event of ['opening:toggle', 'opening:pick']) {
      expect(await emitAck(player, event, { wallId: doorId })).toEqual({
        ok: false,
        error: 'OPENING_OUT_OF_REACH',
      });
    }

    await place(400);
    expect(await emitAck(player, 'opening:toggle', { wallId: doorId })).toEqual({
      ok: false,
      error: 'OPENING_LOCKED',
    });
  });

  it('never hands the player the lock — not the bolt, not the DV', async () => {
    okay(
      await emitAck(gm, 'opening:lock-config', { wallId: doorId, dv: 13 }),
      'opening:lock-config',
    );
    expect((await gmDoor()).lockRule).toMatchObject({ dv: 13, skills: ['pick-lock'] });
    expect(await playerDoor()).toMatchObject({ locked: false, lockRule: null });
  });

  it('a failed Test puts Iskra on the list, and the second try is refused', async () => {
    expect(await pick({ skillId: 'electronics-security' })).toEqual({
      ok: false,
      error: 'LOCK_SKILL',
    });

    const callMessage = waitForMessage(player, (message) => message.kind === 'check');
    const call = data(await pick(), 'opening:pick');
    expect(call.outcome).toBe('test');
    const card = await callMessage;
    expect(card.id).toBe(call.callMessageId);
    expect(card.check).toMatchObject({ dv: 13, calledByName: 'Drzwi', prompt: 'Zamek: Drzwi' });
    // Drugi klik przed rzutem wraca do tego samego wezwania.
    expect(data(await pick(), 'opening:pick (again)')).toEqual(call);

    await roll(call.callMessageId!, [5]); // 2 + 0 + 5 = 7 ≤ 13
    const door = await gmDoor();
    expect(door).toMatchObject({ locked: true, open: false });
    expect(door.lockRule).toMatchObject({ tried: [characterId] });
    expect(await pick()).toEqual({ ok: false, error: 'LOCK_TRIED' });
  });

  it('„Pozwól spróbować znowu” gives a new cup, and a passed Test opens the door', async () => {
    okay(
      await emitAck(gm, 'opening:lock-config', { wallId: doorId, resetTries: true, dv: 8 }),
      'opening:lock-config (reset)',
    );
    const call = data(await pick(), 'opening:pick (after reset)');
    expect(call.outcome).toBe('test');

    await roll(call.callMessageId!, [9]); // 2 + 0 + 9 = 11 > 8
    expect(await gmDoor()).toMatchObject({ locked: false, open: true });
    expect(await playerDoor()).toMatchObject({ open: true });
  });

  it('a key opens a bolted door at the handle, without a Test', async () => {
    await emitAck(gm, 'opening:toggle', { wallId: doorId, open: false });
    await bolt();
    okay(
      await emitAck(gm, 'opening:lock-config', { wallId: doorId, issueKeyTo: characterId }),
      'opening:lock-config (klucz)',
    );
    const sheet = (await roundTrip(player)).characters.find((row) => row.id === characterId)!;
    const key = (sheet.data as CpredCharacterData).gear.find((row) => row.key);
    expect(key?.name).toBe('Klucz: Drzwi');

    // Daleko klucz nie pomaga — kolejność odmów zostaje.
    await place(0);
    expect(await emitAck(player, 'opening:toggle', { wallId: doorId })).toEqual({
      ok: false,
      error: 'OPENING_OUT_OF_REACH',
    });
    await place(400);
    const opened = data(
      await emitAck<WallView>(player, 'opening:toggle', { wallId: doorId }),
      'opening:toggle (klucz)',
    );
    expect(opened).toMatchObject({ open: true, locked: false, lockRule: null });
    expect(await gmDoor()).toMatchObject({ locked: false, open: true });
  });

  it('the lock config is the GM’s alone', async () => {
    expect(await emitAck(player, 'opening:lock-config', { wallId: doorId, dv: 6 })).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
  });
});
