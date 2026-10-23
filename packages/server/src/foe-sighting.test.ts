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
  CombatJoinedBroadcast,
  CombatView,
  CpredCharacterData,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenHaltBroadcast,
  TokenView,
} from '@vtt/shared';
import { PACE_REFILL_MS } from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { paceClock } from './realtime/pace.js';
import { joinUrl } from './test-join.js';

/**
 * Walka z zauważenia wroga (etap 56, zlecenie MG z 19.10.2026), na prawdziwych
 * gniazdach.
 *
 * Plan (kratka 100 px = 2 m, widzenie Dynamiczne, jasno): ściana x = 1000,
 * y 0…1000. Bandzior stoi za nią na (1400, 100), środek (1450, 150). Vex
 * startuje z (500, 1100) i idzie na wschód wzdłuż y = 1100: z (700, 1100)
 * ściana jeszcze zasłania, z (900, 1100) linia wzroku mija koniec ściany.
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

function waitFor<T>(socket: ClientSocket, event: string, ms = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function emitAck<T = undefined>(
  socket: ClientSocket,
  event: string,
  payload?: unknown,
): Promise<SocketAck<T>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), 3000);
    const ack = (response: SocketAck<T>) => {
      clearTimeout(timer);
      resolve(response);
    };
    if (payload === undefined) socket.emit(event, ack);
    else socket.emit(event, payload, ack);
  });
}

function data<T>(ack: SocketAck<T>, what: string): T {
  if (!ack.ok || ack.data === undefined) throw new Error(`${what} failed: ${JSON.stringify(ack)}`);
  return ack.data;
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
    payload: { name: 'Kampania zasadzki' },
  });
  const campaignId = (campaignRes.json() as CampaignSummary).id;

  const joinRes = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, campaignId, 'Vex'),
  });
  playerCookie = cookieOf(joinRes.headers['set-cookie']);
  playerId = (joinRes.json() as { user: { id: string } }).user.id;
}, 60_000);

afterAll(async () => {
  paceClock.now = () => Date.now();
  for (const socket of openSockets) socket.disconnect();
  await built.app.close();
  try {
    unlinkSync(TEST_DB);
  } catch {
    // best effort — Windows may still hold the file
  }
});

describe('walka z zauważenia wroga (etap 56)', () => {
  let gm: ClientSocket;
  let vex: ClientSocket;
  let sceneId: string;
  let vexTokenId: string;
  let foeTokenId: string;
  let barmanTokenId: string;
  const START = { x: 500, y: 1100 };
  let now = 7_000_000;

  async function stateOf(socket: ClientSocket): Promise<StateSyncPayload> {
    const sync = waitFor<StateSyncPayload>(socket, 'state:sync');
    await emitAck(socket, 'state:request');
    return sync;
  }

  const walk = (route: { x: number; y: number }[]) =>
    emitAck<{ tokenId: string }>(vex, 'token:walk', { tokenId: vexTokenId, route });
  const step = (socket: ClientSocket, x: number, y: number, final: boolean) =>
    emitAck<{ x: number; y: number }>(socket, 'token:move', { tokenId: vexTokenId, x, y, final });

  async function combatOf(socket: ClientSocket): Promise<CombatView | null> {
    return (await stateOf(socket)).combat;
  }

  it('zakłada stół: Eksploracja, Vex, Barman na widoku, Bandzior za ścianą', async () => {
    paceClock.now = () => now;
    const gmConn = createSocket(gmCookie);
    const vexConn = createSocket(playerCookie);
    gm = gmConn.socket;
    vex = vexConn.socket;
    await Promise.all([gmConn.firstSync, vexConn.firstSync]);

    sceneId = data(await emitAck<SceneView>(gm, 'scene:create', { name: 'Zaułek' }), 'scene').id;
    await emitAck(gm, 'scene:update', {
      sceneId,
      patch: { width: 2000, height: 2000, grid: { sizePx: 100 }, metersPerSquare: 2 },
    });
    await emitAck(gm, 'scene:update', { sceneId, patch: { playerMove: 'explore' } });
    const activated = waitFor(vex, 'scene:activate');
    await emitAck(gm, 'scene:activate', { sceneId });
    await activated;

    const card = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Vex', ownerId: playerId }),
      'character:create',
    );
    await emitAck(gm, 'character:update', {
      characterId: card.id,
      patch: {
        data: { stats: { ...(card.data as CpredCharacterData).stats, ref: 6, move: 10, body: 6 } },
      },
    });
    const create = async (name: string, at: { x: number; y: number }, characterId?: string) =>
      data(
        await emitAck<TokenView>(gm, 'token:create', {
          sceneId,
          name,
          ...at,
          ...(characterId ? { characterId } : {}),
        }),
        `token:create ${name}`,
      ).id;
    vexTokenId = await create('Vex', START, card.id);
    foeTokenId = await create('Bandzior', { x: 1400, y: 100 });
    barmanTokenId = await create('Barman', { x: 300, y: 1100 });
    const wall = await emitAck(gm, 'wall:create', {
      sceneId,
      kind: 'wall',
      points: [
        { x: 1000, y: 0 },
        { x: 1000, y: 1000 },
      ],
    });
    expect(wall.ok).toBe(true);
    const seen = (await stateOf(vex)).tokens.map((token) => token.id);
    expect(seen).toContain(barmanTokenId);
    expect(seen).not.toContain(foeTokenId);
  });

  it('postawa: „samo” to null u MG, MG ją zmienia, gracz jej nie dostaje', async () => {
    const gmView = (await stateOf(gm)).tokens.find((token) => token.id === barmanTokenId);
    expect(gmView?.disposition).toBeNull();
    const patched = await emitAck(gm, 'token:update', {
      tokenId: barmanTokenId,
      patch: { disposition: 'friendly' },
    });
    expect(patched.ok).toBe(true);
    const playerView = (await stateOf(vex)).tokens.find((token) => token.id === barmanTokenId);
    expect(playerView).toBeDefined();
    expect(playerView).not.toHaveProperty('disposition');
    const refused = await emitAck(gm, 'token:update', {
      tokenId: barmanTokenId,
      patch: { disposition: 'wrogi' },
    });
    expect(refused.ok).toBe(false);
  });

  it('wróg za ścianą nie zaczyna walki, nawet oznaczony', async () => {
    await emitAck(gm, 'token:update', { tokenId: foeTokenId, patch: { disposition: 'hostile' } });
    expect(await combatOf(gm)).toBeNull();
  });

  it('marsz za róg staje na polu, z którego Vex zobaczył wroga — i zakłada starcie', async () => {
    now += PACE_REFILL_MS;
    expect((await walk([{ x: 1100, y: 1100 }])).ok).toBe(true);
    expect(await step(vex, 700, 1100, false)).toEqual({ ok: true, data: { x: 700, y: 1100 } });
    expect(await combatOf(gm)).toBeNull();

    const halt = waitFor<TokenHaltBroadcast>(vex, 'token:halt');
    expect(await step(vex, 900, 1100, false)).toEqual({ ok: true, data: { x: 900, y: 1100 } });
    expect(await halt).toEqual({ sceneId, tokenIds: [vexTokenId] });

    const combat = await combatOf(gm);
    expect(combat?.round).toBe(0);
    expect(combat?.sighting).toEqual({ spotterIds: [vexTokenId], foeIds: [foeTokenId] });
    expect(combat?.combatants.map((row) => row.tokenId).sort()).toEqual(
      [vexTokenId, foeTokenId].sort(),
    );
    // Gracz wie, że trwa „Przed walką”, ale nie, kto kogo zobaczył.
    expect(await combatOf(vex)).not.toHaveProperty('sighting');
    // Pole zatrzymania leży w bazie — tu stoi Vex dla całego stołu.
    const standing = (await stateOf(gm)).tokens.find((token) => token.id === vexTokenId);
    expect(standing).toMatchObject({ x: 900, y: 1100 });
  });

  it('przed walką gracz stoi: klatka, lądowanie, trasa i skok odmawiają, MG rusza', async () => {
    expect(await step(vex, 1100, 1100, false)).toEqual({ ok: false, error: 'COMBAT_PENDING' });
    expect(await step(vex, 1100, 1100, true)).toEqual({ ok: false, error: 'COMBAT_PENDING' });
    expect(await walk([{ x: 900, y: 1300 }])).toEqual({ ok: false, error: 'COMBAT_PENDING' });
    const jump = await emitAck(vex, 'token:jump', { tokenId: vexTokenId, dx: 0, dy: 1 });
    expect(jump).toEqual({ ok: false, error: 'COMBAT_PENDING' });
    const gmMove = await emitAck(gm, 'token:move', {
      tokenId: barmanTokenId,
      x: 300,
      y: 1300,
      final: true,
    });
    expect(gmMove.ok).toBe(true);
  });

  it('„Odwołaj” uspokaja widocznego wroga: dalszy marsz nie zakłada starcia', async () => {
    expect((await emitAck(gm, 'combat:end')).ok).toBe(true);
    now += PACE_REFILL_MS;
    expect((await walk([{ x: 1100, y: 1100 }])).ok).toBe(true);
    expect((await step(vex, 1100, 1100, true)).ok).toBe(true);
    expect(await combatOf(gm)).toBeNull();
    const foe = (await stateOf(gm)).tokens.find((token) => token.id === foeTokenId);
    expect(foe?.disposition).toBe('neutral');
  });

  it('uspokojony wróg, który zniknął z oczu i wrócił, dalej nie zaczyna walki', async () => {
    await emitAck(gm, 'token:update', { tokenId: foeTokenId, patch: { hidden: true } });
    await emitAck(gm, 'token:update', { tokenId: foeTokenId, patch: { hidden: false } });
    expect(await combatOf(gm)).toBeNull();
  });

  it('MG przełącza uspokojonego na Wroga — walka zaczyna się od nowa', async () => {
    await emitAck(gm, 'token:update', { tokenId: foeTokenId, patch: { disposition: 'hostile' } });
    const combat = await combatOf(gm);
    expect(combat?.round).toBe(0);
    expect(combat?.sighting?.foeIds).toEqual([foeTokenId]);
  });

  it('wróg zdjęty przez MG ze starcia przechodzi na Neutralną i nie wraca', async () => {
    const before = await combatOf(gm);
    const foeRow = before!.combatants.find((row) => row.tokenId === foeTokenId)!;
    expect((await emitAck(gm, 'combat:remove', { combatantId: foeRow.id })).ok).toBe(true);
    const moved = await emitAck(gm, 'token:move', {
      tokenId: foeTokenId,
      x: 1400,
      y: 300,
      final: true,
    });
    expect(moved.ok).toBe(true);
    expect((await combatOf(gm))?.combatants.map((row) => row.tokenId)).toEqual([vexTokenId]);
    await emitAck(gm, 'token:update', { tokenId: foeTokenId, patch: { hidden: true } });
    await emitAck(gm, 'token:update', { tokenId: foeTokenId, patch: { hidden: false } });
    expect((await combatOf(gm))?.combatants.map((row) => row.tokenId)).toEqual([vexTokenId]);
    await emitAck(gm, 'token:update', { tokenId: foeTokenId, patch: { disposition: 'hostile' } });
    expect((await combatOf(gm))?.combatants.map((row) => row.tokenId).sort()).toEqual(
      [vexTokenId, foeTokenId].sort(),
    );
  });

  it('w trwającej walce zauważony wróg dołącza sam z inicjatywą od serwera', async () => {
    expect((await emitAck(gm, 'combat:next')).ok).toBe(true);
    const sniper = data(
      await emitAck<TokenView>(gm, 'token:create', { sceneId, name: 'Snajper', x: 1600, y: 1300 }),
      'token:create Snajper',
    );
    const joined = waitFor<CombatJoinedBroadcast>(gm, 'combat:joined');
    await emitAck(gm, 'token:update', { tokenId: sniper.id, patch: { disposition: 'hostile' } });
    expect(await joined).toEqual({ sceneId, tokenIds: [sniper.id] });
    const row = (await combatOf(gm))?.combatants.find((c) => c.tokenId === sniper.id);
    expect(row?.initiative).toEqual(expect.any(Number));
  });

  it('NPC dołożony ręką MG w trakcie walki też dostaje inicjatywę', async () => {
    const added = data(
      await emitAck<CombatView>(gm, 'combat:add', { tokenIds: [barmanTokenId] }),
      'combat:add',
    );
    const row = added.combatants.find((c) => c.tokenId === barmanTokenId);
    expect(row?.initiative).toEqual(expect.any(Number));
    expect((await emitAck(gm, 'combat:end')).ok).toBe(true);
  });

  it('klatka, która przyszła razem z klatką zauważenia, nie wyprowadza figury za pole zatrzymania', async () => {
    // Bandzior znika z oczu, Vex wraca na start, a MG przywraca mu wrogość.
    await emitAck(gm, 'token:update', { tokenId: foeTokenId, patch: { hidden: true } });
    expect((await step(gm, START.x, START.y, true)).ok).toBe(true);
    await emitAck(gm, 'token:update', {
      tokenId: foeTokenId,
      patch: { hidden: false, disposition: 'hostile' },
    });
    expect(await combatOf(gm)).toBeNull();
    now += PACE_REFILL_MS;
    expect((await walk([{ x: 1100, y: 1100 }])).ok).toBe(true);

    const seen: { x: number }[] = [];
    const record = (payload: {
      tokenId?: string;
      token?: { id: string; x: number };
      x?: number;
    }) => {
      if (payload.tokenId === vexTokenId && typeof payload.x === 'number')
        seen.push({ x: payload.x });
      if (payload.token?.id === vexTokenId) seen.push({ x: payload.token.x });
    };
    vex.on('token:move', record);
    vex.on('token:upsert', record);
    const [first, second] = await Promise.all([
      step(vex, 900, 1100, false),
      step(vex, 1000, 1100, false),
    ]);
    vex.off('token:move', record);
    vex.off('token:upsert', record);
    // Która klatka wejdzie pierwsza, rozstrzyga serwer — jedna staje, druga
    // dostaje odmowę, a baza i klient Vexa kończą na tym samym polu.
    const acks = [first, second];
    const stoodAck = acks.find((ack) => ack.ok);
    expect(acks.filter((ack) => !ack.ok)).toEqual([{ ok: false, error: 'COMBAT_PENDING' }]);
    const stood = (await stateOf(gm)).tokens.find((t) => t.id === vexTokenId)!;
    expect(stoodAck).toEqual({ ok: true, data: { x: stood.x, y: 1100 } });
    expect([900, 1000]).toContain(stood.x);
    expect(seen.at(-1)).toEqual({ x: stood.x });
    expect((await emitAck(gm, 'combat:end')).ok).toBe(true);
  });

  it('nieprzytomny wróg walki nie zaczyna', async () => {
    await emitAck(gm, 'token:update', { tokenId: foeTokenId, patch: { hidden: true } });
    await emitAck(gm, 'token:update', {
      tokenId: foeTokenId,
      patch: { hidden: false, statuses: ['unconscious'], disposition: 'hostile' },
    });
    expect(await combatOf(gm)).toBeNull();
  });
});
