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
  CombatView,
  CombatantView,
  CpredCharacterData,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenPaceBroadcast,
  TokenView,
} from '@vtt/shared';
import { PACE_REFILL_MS } from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { paceClock } from './realtime/pace.js';
import { joinUrl } from './test-join.js';

/**
 * Etap 45 „Ruch i widzenie drużyny" na prawdziwych gniazdach.
 *
 * Rachunek puli siedzi w `shared/pace.test.ts`; tu szew: tryb sceny zatrzymuje
 * i puszcza graczy (MG nigdy), pula bierze wielkość z karty i odmawia
 * `MOVE_PACE`, w walce rachunek prowadzi Tura, a figury drużyny widzi każdy
 * gracz — w czerni mgły i oczami kolegi w Dynamicznej. Do tego błąd z diagnozy
 * 08.10: figura karty idzie za nowym właścicielem karty.
 */

const TEST_DB = `./.test-${randomBytes(6).toString('hex')}.db`;
const GM_PASSWORD = 'test-haslo';
/** Scene scale of the fixture: a 2 m grid cell drawn 100 px wide. */
const PX_PER_M = 50;

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
let olaCookie: string;
let olaId: string;
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
    payload: { name: 'Kampania drużyny' },
  });
  const campaignId = (campaignRes.json() as CampaignSummary).id;

  // Etap 44b: linki są imienne — wystawia je `joinUrl` przy każdym wejściu.
  const invite = campaignId;

  const joinRes = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, invite, 'Vex'),
  });
  playerCookie = cookieOf(joinRes.headers['set-cookie']);
  playerId = (joinRes.json() as { user: { id: string } }).user.id;
  const olaRes = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, invite, 'Ola'),
  });
  olaCookie = cookieOf(olaRes.headers['set-cookie']);
  olaId = (olaRes.json() as { user: { id: string } }).user.id;
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

describe('ruch graczy i widzenie drużyny (etap 45)', () => {
  let gm: ClientSocket;
  let vex: ClientSocket;
  let ola: ClientSocket;
  let sceneId: string;
  let vexCharacterId: string;
  let vexTokenId: string;
  let olaTokenId: string;
  let npcTokenId: string;

  async function stateOf(socket: ClientSocket): Promise<StateSyncPayload> {
    const sync = waitFor<StateSyncPayload>(socket, 'state:sync');
    await emitAck(socket, 'state:request');
    return sync;
  }

  async function seenBy(socket: ClientSocket): Promise<string[]> {
    return (await stateOf(socket)).tokens.map((token) => token.id);
  }

  /** Ciągnie figurę na (x m, y m) od lewego górnego rogu sceny. */
  function move(
    socket: ClientSocket,
    tokenId: string,
    xM: number,
    yM: number,
    final = true,
  ): Promise<SocketAck<{ x: number; y: number }>> {
    return emitAck(socket, 'token:move', { tokenId, x: xM * PX_PER_M, y: yM * PX_PER_M, final });
  }

  function setMode(mode: SceneView['playerMove']): Promise<SocketAck<SceneView>> {
    return emitAck<SceneView>(gm, 'scene:update', { sceneId, patch: { playerMove: mode } });
  }

  it('zakłada stół: nowa scena w Stop i Dynamicznej, Vex z RUCH 6, Ola, NPC', async () => {
    const gmConn = createSocket(gmCookie);
    const vexConn = createSocket(playerCookie);
    const olaConn = createSocket(olaCookie);
    gm = gmConn.socket;
    vex = vexConn.socket;
    ola = olaConn.socket;
    await Promise.all([gmConn.firstSync, vexConn.firstSync, olaConn.firstSync]);

    const scene = data(await emitAck<SceneView>(gm, 'scene:create', { name: 'Ulica' }), 'scene');
    sceneId = scene.id;
    expect(scene.playerMove).toBe('stop');
    expect(scene.visibility).toBe('dynamic');
    await emitAck(gm, 'scene:update', {
      sceneId,
      patch: { width: 4000, height: 4000, grid: { sizePx: 100 }, metersPerSquare: 2 },
    });
    // Bez siatki: pula liczy dokładne metry, a przyciąganie do pól 2 m
    // zaokrąglałoby każdy krok.
    await emitAck(gm, 'scene:update', { sceneId, patch: { gridMode: 'gridless' } });
    const activated = waitFor(vex, 'scene:activate');
    await emitAck(gm, 'scene:activate', { sceneId });
    await activated;

    const card = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Vex', ownerId: playerId }),
      'character:create',
    );
    vexCharacterId = card.id;
    await emitAck(gm, 'character:update', {
      characterId: vexCharacterId,
      patch: {
        data: { stats: { ...(card.data as CpredCharacterData).stats, ref: 6, move: 6, body: 6 } },
      },
    });
    // Bez jawnego `ownerId`: figura karty gracza bierze rękę właściciela karty.
    const vexToken = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Vex',
        x: 2 * PX_PER_M,
        y: 2 * PX_PER_M,
        characterId: vexCharacterId,
      }),
      'token:create',
    );
    vexTokenId = vexToken.id;
    expect(vexToken.ownerId).toBe(playerId);
    olaTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Ola',
        x: 2 * PX_PER_M,
        y: 6 * PX_PER_M,
        ownerId: olaId,
      }),
      'token:create',
    ).id;
    npcTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Fixer',
        x: 2 * PX_PER_M,
        y: 10 * PX_PER_M,
      }),
      'token:create',
    ).id;
  });

  it('w Stop gracz nie rusza figury nawet o klatkę, a MG tak', async () => {
    expect(await move(vex, vexTokenId, 4, 2)).toEqual({ ok: false, error: 'MOVE_LOCKED' });
    expect(await move(vex, vexTokenId, 4, 2, false)).toEqual({ ok: false, error: 'MOVE_LOCKED' });
    expect((await move(gm, vexTokenId, 3, 2)).ok).toBe(true);
    expect((await move(gm, vexTokenId, 2, 2)).ok).toBe(true);
  });

  it('w Swobodnym gracz idzie bez limitu', async () => {
    expect((await setMode('free')).ok).toBe(true);
    expect((await move(vex, vexTokenId, 40, 2)).ok).toBe(true);
    expect((await move(vex, vexTokenId, 2, 2)).ok).toBe(true);
  });

  it('w Eksploracji pula z karty (RUCH 6 → 12 m) odmawia MOVE_PACE i odnawia się w ~10 s', async () => {
    let now = 1_000_000;
    paceClock.now = () => now;
    expect((await setMode('explore')).ok).toBe(true);

    const own = (await stateOf(vex)).tokens.find((token) => token.id === vexTokenId);
    expect(own?.paceCapM).toBe(12);
    const foreign = (await stateOf(ola)).tokens.find((token) => token.id === vexTokenId);
    expect(foreign?.paceCapM).toBeUndefined();

    const paid = waitFor<TokenPaceBroadcast>(vex, 'token:pace');
    expect((await move(vex, vexTokenId, 12, 2)).ok).toBe(true);
    expect(await paid).toEqual({ tokenId: vexTokenId, owedM: 10 });

    const refusedPace = waitFor<TokenPaceBroadcast>(vex, 'token:pace');
    expect(await move(vex, vexTokenId, 17, 2)).toEqual({ ok: false, error: 'MOVE_PACE' });
    expect((await refusedPace).owedM).toBe(10);

    // Pół odnowy oddaje pół puli: 2 m zapasu + 6 m = 8 m.
    now += PACE_REFILL_MS / 2;
    expect((await move(vex, vexTokenId, 20, 2)).ok).toBe(true);
    expect(await move(vex, vexTokenId, 21, 2)).toEqual({ ok: false, error: 'MOVE_PACE' });

    // MG nie płaci nigdy.
    expect((await move(gm, vexTokenId, 2, 2)).ok).toBe(true);
    now += PACE_REFILL_MS;
    expect((await move(vex, vexTokenId, 14, 2)).ok).toBe(true);
    expect((await move(gm, vexTokenId, 2, 2)).ok).toBe(true);
  });

  it('w walce uczestnik chodzi z budżetu tury, a Stop zatrzymuje także jego', async () => {
    let now = 2_000_000;
    paceClock.now = () => now;
    // Pula pusta, zanim padnie inicjatywa: gdyby walka liczyła z puli, krok by nie przeszedł.
    expect((await move(vex, vexTokenId, 14, 2)).ok).toBe(true);
    expect((await move(gm, vexTokenId, 2, 2)).ok).toBe(true);

    const combat = data(
      await emitAck<CombatView>(gm, 'combat:start', { sceneId, tokenIds: [vexTokenId] }),
      'combat:start',
    );
    const row = combat.combatants.find((entry: CombatantView) => entry.tokenId === vexTokenId);
    if (!row) throw new Error('Vex missing from the tracker');
    await emitAck(gm, 'combat:set-initiative', { combatantId: row.id, initiative: 20 });
    data(await emitAck<CombatView>(gm, 'combat:next', {}), 'combat:next');

    expect((await move(vex, vexTokenId, 8, 2)).ok).toBe(true);
    expect((await setMode('stop')).ok).toBe(true);
    expect(await move(vex, vexTokenId, 10, 2)).toEqual({ ok: false, error: 'MOVE_LOCKED' });

    await emitAck(gm, 'combat:end', {});
    now += PACE_REFILL_MS;
    expect((await setMode('free')).ok).toBe(true);
    expect((await move(gm, vexTokenId, 2, 2)).ok).toBe(true);
  });

  it('w Dynamicznej gracz widzi figurę kolegi za ścianą i patrzy jej oczami', async () => {
    // Środki figur: Vex y = 3 m, Ola 7 m, NPC 11 m. Ściany na 4 m i 9 m
    // odcinają Olę od obu sąsiadów.
    for (const yM of [4, 9]) {
      await emitAck(gm, 'wall:create', {
        sceneId,
        kind: 'wall',
        points: [
          { x: 0, y: yM * PX_PER_M },
          { x: 3000, y: yM * PX_PER_M },
        ],
      });
    }
    const state = await stateOf(ola);
    expect(state.tokens.map((token) => token.id)).toContain(vexTokenId);
    expect(state.tokens.find((token) => token.id === vexTokenId)?.partyVision).toBe(true);
    // Dwa źródła wzroku: własna figura i figura Vexa.
    expect(state.vision?.polygons).toHaveLength(2);
    // NPC MG za ścianą — nie.
    expect(state.tokens.map((token) => token.id)).not.toContain(npcTokenId);
  });

  it('w całkiem czarnej ręcznej mgle drużyna widzi się nawzajem, a NPC tylko z „oczami drużyny”', async () => {
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'fog' });
    expect(await seenBy(ola)).toEqual(expect.arrayContaining([vexTokenId, olaTokenId]));
    expect(await seenBy(ola)).not.toContain(npcTokenId);

    await emitAck(gm, 'token:update', { tokenId: npcTokenId, patch: { sharedVision: true } });
    expect(await seenBy(ola)).toContain(npcTokenId);
    await emitAck(gm, 'token:update', { tokenId: npcTokenId, patch: { sharedVision: null } });
    expect(await seenBy(ola)).not.toContain(npcTokenId);
  });

  it('figura z wyłączonymi „oczami drużyny” albo ukryta znika koledze', async () => {
    await emitAck(gm, 'token:update', { tokenId: vexTokenId, patch: { sharedVision: false } });
    expect(await seenBy(ola)).not.toContain(vexTokenId);
    expect(await seenBy(vex)).toContain(vexTokenId);
    const gmView = (await stateOf(gm)).tokens.find((token) => token.id === vexTokenId);
    expect(gmView?.sharedVision).toBe(false);

    await emitAck(gm, 'token:update', { tokenId: vexTokenId, patch: { sharedVision: null } });
    expect(await seenBy(ola)).toContain(vexTokenId);

    await emitAck(gm, 'token:update', { tokenId: vexTokenId, patch: { hidden: true } });
    expect(await seenBy(ola)).not.toContain(vexTokenId);
    await emitAck(gm, 'token:update', { tokenId: vexTokenId, patch: { hidden: false } });
  });

  it('ruch kolegi w czerni mgły dochodzi do drużyny', async () => {
    // Pod ręczną mgłą gracz chodzi tylko po odsłoniętym (14.09), więc rusza MG.
    const seen = waitFor<{ tokenId: string; final: boolean }>(ola, 'token:move');
    expect((await move(gm, vexTokenId, 3, 2)).ok).toBe(true);
    expect((await seen).tokenId).toBe(vexTokenId);
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'dynamic' });
  });

  it('karta przekazana innemu graczowi zabiera ze sobą figurę bez innego właściciela', async () => {
    const card = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Zapas' }),
      'character:create',
    );
    const token = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Zapas',
        x: 10 * PX_PER_M,
        y: 2 * PX_PER_M,
        characterId: card.id,
      }),
      'token:create',
    );
    expect(token.ownerId).toBeNull();

    await emitAck(gm, 'character:update', { characterId: card.id, patch: { ownerId: olaId } });
    const afterOla = (await stateOf(gm)).tokens.find((entry) => entry.id === token.id);
    expect(afterOla?.ownerId).toBe(olaId);
    expect((await move(ola, token.id, 11, 2)).ok).toBe(true);

    await emitAck(gm, 'character:update', { characterId: card.id, patch: { ownerId: playerId } });
    const afterVex = (await stateOf(gm)).tokens.find((entry) => entry.id === token.id);
    expect(afterVex?.ownerId).toBe(playerId);
    expect(await move(ola, token.id, 12, 2)).toEqual({ ok: false, error: 'FORBIDDEN' });
  });

  it('podpięcie figury bez właściciela pod kartę gracza daje ją graczowi', async () => {
    const loose = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Luzem',
        x: 14 * PX_PER_M,
        y: 2 * PX_PER_M,
      }),
      'token:create',
    );
    const linked = data(
      await emitAck<TokenView>(gm, 'token:update', {
        tokenId: loose.id,
        patch: { characterId: vexCharacterId },
      }),
      'token:update',
    );
    expect(linked.ownerId).toBe(playerId);
  });
});
