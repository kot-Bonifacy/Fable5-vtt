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
  HiddenSpottedBroadcast,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenHaltBroadcast,
  TokenSyncBroadcast,
  TokenUpsertBroadcast,
  TokenView,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { joinUrl } from './test-join.js';
import { paceTesting } from './realtime/pace.js';

paceTesting.off = true;

/**
 * Ukryta figura przeciw Percepcji (etap 58d) na prawdziwych gniazdach.
 *
 * Ukryty NPC (ZW 6, Skradanie 6) nie istnieje dla gracza, dopóki postać
 * gracza nie przejdzie obok niego, nie stanie i nie wygra Testu Percepcji
 * przeciw jego Skradaniu (PT = 12 + 1k10 z chwili wezwania). Potem istnieje
 * **tylko dla tego konta**, a ruch figury przez MG zabiera ją i daje nowy rzut.
 *
 * Pokój: kratka 100 px i 2 m, czyli metr to 50 px; zasięg Percepcji 4 m = 200 px.
 */

const TEST_DB = `./.test-${randomBytes(6).toString('hex')}.db`;
const GM_PASSWORD = 'test-haslo';

/** Kości rzutu z kubka na wezwanie (58a) — `VTT_DICE_SCRIPT`, jak w `surgery.test.ts`. */
const DICE = join(mkdtempSync(join(tmpdir(), 'vtt-hidden-dice-')), 'dice.txt');
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
let otherCookie: string;
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
    payload: { name: 'Kampania ukrytych' },
  });
  const campaignId = (campaignRes.json() as CampaignSummary).id;

  // Etap 44b: linki są imienne — wystawia je `joinUrl` przy każdym wejściu.
  const invite = campaignId;

  const joinRes = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, invite, 'Kolec'),
  });
  playerCookie = cookieOf(joinRes.headers['set-cookie']);
  playerId = (joinRes.json() as { user: { id: string } }).user.id;
  const otherRes = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, invite, 'Vex'),
  });
  otherCookie = cookieOf(otherRes.headers['set-cookie']);
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

describe('ukryta figura przeciw Skradaniu (etap 58d)', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let other: ClientSocket;
  let sceneId: string;
  let characterId: string;
  let iskraId: string;
  let zbirId: string;
  let cienId: string;

  /** Otwarte wezwania do Percepcji gracza: id karty → karta postaci. */
  const calls = new Map<number, string>();
  const heard: ChatMessageView[] = [];
  const track = ({ message }: ChatMessageBroadcast) => {
    heard.push(message);
    const call = message.check;
    if (message.kind !== 'check' || !call || call.resolved || call.cancelled) return;
    if (call.rollLabel.includes('Percepcja')) calls.set(message.id, call.characterId);
  };
  async function answer(faces: number[]): Promise<void> {
    for (const [callMessageId, character] of [...calls]) {
      calls.delete(callMessageId);
      scriptDice(faces);
      data(
        await emitAck(player, 'character:roll', {
          characterId: character,
          request: { kind: 'skill', skillId: 'perception', luckSpent: 0 },
          callMessageId,
        }),
        'character:roll (Percepcja z wezwania)',
      );
    }
  }

  /** Marsz gracza klatkami co pół pola; zwraca ostatnią przyjętą pozycję. */
  async function march(tokenId: string, y: number, toX: number, fromX: number) {
    data(await emitAck(player, 'token:walk', { tokenId, route: [{ x: toX, y }] }), 'token:walk');
    let last: { x: number; y: number } | null = null;
    let refused = false;
    const step = toX > fromX ? 50 : -50;
    for (let x = fromX + step; step > 0 ? x <= toX : x >= toX; x += step) {
      const ack = await emitAck<{ x: number; y: number }>(player, 'token:move', {
        tokenId,
        x,
        y,
        final: false,
      });
      if (ack.ok && !refused) last = ack.data ?? null;
      if (!ack.ok) refused = true;
    }
    if (!refused) {
      last = data(
        await emitAck<{ x: number; y: number }>(player, 'token:move', {
          tokenId,
          x: toX,
          y,
          final: true,
        }),
        'token:move (koniec marszu)',
      );
    }
    return { last, refused };
  }

  async function gmMove(tokenId: string, x: number, y: number): Promise<void> {
    data(await emitAck(gm, 'token:move', { tokenId, x, y, final: true }), 'token:move (MG)');
  }

  /** Najbliższy `token:upsert` tej figury u MG, który spełnia warunek. */
  function gmUpsert(tokenId: string, test: (token: TokenView) => boolean): Promise<TokenView> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        gm.off('token:upsert', listener);
        reject(new Error('token:upsert (MG) timeout'));
      }, 4000);
      const listener = ({ token }: TokenUpsertBroadcast) => {
        if (token.id !== tokenId || !test(token)) return;
        clearTimeout(timer);
        gm.off('token:upsert', listener);
        resolve(token);
      };
      gm.on('token:upsert', listener);
    });
  }

  const has = (sync: StateSyncPayload, tokenId: string) =>
    sync.tokens.find((token) => token.id === tokenId);

  it('zastawia stół: zaułek, Iskra gracza i ukryty Zbir ze Skradaniem 6', async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    const otherConn = createSocket(otherCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    other = otherConn.socket;
    player.on('chat:message', track);
    await Promise.all([gmConn.firstSync, playerConn.firstSync, otherConn.firstSync]);

    const iskra = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Iskra', ownerId: playerId }),
      'character:create (Iskra)',
    );
    characterId = iskra.id;
    // INT 8 + Percepcja 10 = 18.
    await emitAck(gm, 'character:update', {
      characterId,
      patch: {
        data: {
          stats: { ...(iskra.data as CpredCharacterData).stats, int: 8 },
          skills: { perception: 10 },
        },
      },
    });
    const zbir = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Zbir' }),
      'character:create (Zbir)',
    );
    // ZW 6 + Skradanie 6 = 12.
    await emitAck(gm, 'character:update', {
      characterId: zbir.id,
      patch: {
        data: {
          stats: { ...(zbir.data as CpredCharacterData).stats, dex: 6 },
          skills: { stealth: 6 },
        },
      },
    });

    const scene = data(await emitAck<SceneView>(gm, 'scene:create', { name: 'Zaułek' }), 'scene');
    sceneId = scene.id;
    await emitAck(gm, 'scene:update', { sceneId, patch: { playerMove: 'explore' } });
    await emitAck(gm, 'scene:update', { sceneId, patch: { width: 4000, height: 3000 } });
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'open' });
    const activated = waitFor(player, 'scene:activate');
    await emitAck(gm, 'scene:activate', { sceneId });
    await activated;

    iskraId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Iskra',
        x: 0,
        y: 400,
        ownerId: playerId,
        characterId,
      }),
      'token:create (Iskra)',
    ).id;
    zbirId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Zbir',
        x: 2000,
        y: 400,
        hidden: true,
        characterId: zbir.id,
      }),
      'token:create (Zbir)',
    ).id;
    cienId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Cień',
        x: 1000,
        y: 1600,
        hidden: true,
      }),
      'token:create (Cień)',
    ).id;

    expect(has(await roundTrip(player), zbirId)).toBeUndefined();
    expect(has(await roundTrip(other), zbirId)).toBeUndefined();
    expect(has(await roundTrip(gm), zbirId)).toMatchObject({ hidden: true, spotDv: null });
  });

  it('marsz staje 4 m przed ukrytym; przegrany rzut przeciwstawny niczego nie odsłania', async () => {
    const halted = waitFor<TokenHaltBroadcast>(player, 'token:halt');
    const gmLines: ChatMessageView[] = [];
    const onGm = ({ message }: ChatMessageBroadcast) => {
      if (message.kind === 'gmaction') gmLines.push(message);
    };
    gm.on('chat:message', onGm);
    heard.length = 0;
    // Skradanie Zbira: 12 + 8 = 20 — rzuca serwer w chwili wezwania.
    scriptDice([8]);
    const { last, refused } = await march(iskraId, 400, 1900, 0);
    expect(refused).toBe(true);
    expect(await halted).toMatchObject({ sceneId, tokenIds: [iskraId], reason: 'notice' });
    // Środek Iskry najwyżej 200 px od lewej krawędzi Zbira (x = 2000).
    expect(2000 - (last!.x + 50)).toBeLessThanOrEqual(200);

    const card = heard.find((message) => message.kind === 'check');
    expect(card?.check).toMatchObject({ dv: 20, visibility: 'gm', characterId });
    expect(card?.check?.prompt).toBeUndefined();
    expect(card?.check?.opponentBonus).toBeUndefined();
    expect(card?.check?.system).not.toHaveProperty('hiddenTokenId');
    expect(JSON.stringify(card)).not.toContain(zbirId);
    expect(JSON.stringify(card)).not.toContain('Zbir');

    // Do rzutu figura stoi.
    expect(
      await emitAck(player, 'token:walk', { tokenId: iskraId, route: [{ x: 0, y: 400 }] }),
    ).toEqual({ ok: false, error: 'NOTICE_ROLL_PENDING' });

    // 18 + 2 = 20 — remis wygrywa ukryty.
    await answer([2]);
    await expect.poll(() => gmLines.length).toBeGreaterThanOrEqual(2);
    gm.off('chat:message', onGm);
    expect(gmLines[0]!.action?.note).toContain('Zbir kryje się: Skradanie się 12 + 8 = 20');
    expect(gmLines.at(-1)!.action?.note).toContain('wynik 20 vs PT 20 — nie zauważa: Zbir');
    expect(JSON.stringify(heard)).not.toContain('Zbir');
    const sync = await roundTrip(player);
    expect(has(sync, zbirId)).toBeUndefined();
    expect(JSON.stringify(sync.messages)).not.toContain('Zbir');
  });

  it('ta sama postać przy tej samej kryjówce nie staje drugi raz', async () => {
    let haltedAgain = false;
    const onHalt = () => {
      haltedAgain = true;
    };
    player.on('token:halt', onHalt);
    const at = has(await roundTrip(gm), iskraId)!;
    const { refused } = await march(iskraId, 400, at.x + 50, at.x);
    player.off('token:halt', onHalt);
    expect(refused).toBe(false);
    expect(haltedAgain).toBe(false);
    expect(calls.size).toBe(0);
  });

  it('ruch Zbira przez MG to nowa kryjówka; wygrany rzut odsłania go tylko temu kontu', async () => {
    await gmMove(zbirId, 3000, 400);
    const at = has(await roundTrip(gm), iskraId)!;
    const halted = waitFor<TokenHaltBroadcast>(player, 'token:halt');
    // Skradanie 12 + 2 = 14.
    scriptDice([2]);
    await march(iskraId, 400, 2900, at.x);
    await halted;
    expect(calls.size).toBe(1);

    const spotted = waitFor<HiddenSpottedBroadcast>(player, 'hidden:spotted');
    const synced = waitFor<TokenSyncBroadcast>(player, 'token:sync');
    const toGm = gmUpsert(zbirId, (token) => token.spottedBy === 1);
    await answer([5]); // 18 + 5 = 23 > 14
    // MG dostaje „zauważona” na żywo, nie dopiero po przeładowaniu.
    expect(await toGm).toMatchObject({ hidden: true, spottedBy: 1 });
    expect(await spotted).toEqual({
      sceneId,
      tokenId: iskraId,
      actorName: 'Iskra',
      names: ['Zbir'],
    });
    // Gracz dostaje figurę jako zwykłą — bez `hidden: true` i bez sekretów MG.
    const seen = (await synced).tokens.find((token) => token.id === zbirId);
    expect(seen).toMatchObject({ hidden: false, name: 'Zbir', x: 3000, y: 400 });
    expect(seen).not.toHaveProperty('spotDv');
    expect(has(await roundTrip(player), zbirId)).toMatchObject({ hidden: false });
    // Drugi gracz — nic.
    expect(has(await roundTrip(other), zbirId)).toBeUndefined();
    // MG widzi, że ktoś go zauważył.
    expect(has(await roundTrip(gm), zbirId)).toMatchObject({ hidden: true, spottedBy: 1 });

    // Zauważonego da się wskazać jako cel; niezauważonego — jak nieistniejącego.
    expect(
      await emitAck(player, 'token:target', { tokenId: iskraId, targetId: zbirId }),
    ).toMatchObject({ ok: true });
  });

  it('kolejny ruch Zbira zabiera go zauważającemu', async () => {
    const synced = waitFor<TokenSyncBroadcast>(player, 'token:sync');
    const toGm = gmUpsert(zbirId, (token) => token.spottedBy === 0);
    await gmMove(zbirId, 3000, 1200);
    expect((await synced).tokens.some((token) => token.id === zbirId)).toBe(false);
    await toGm;
    expect(has(await roundTrip(gm), zbirId)).toMatchObject({ spottedBy: 0 });
    expect(await emitAck(player, 'token:target', { tokenId: iskraId, targetId: zbirId })).toEqual({
      ok: false,
      error: 'TOKEN_NOT_FOUND',
    });
  });

  it('figura bez karty i bez PT — żadnego rzutu ani zatrzymania; PT od MG daje rzut', async () => {
    await gmMove(iskraId, 0, 1600);
    let halted = false;
    const onHalt = () => {
      halted = true;
    };
    player.on('token:halt', onHalt);
    const { refused } = await march(iskraId, 1600, 900, 0);
    player.off('token:halt', onHalt);
    expect(refused).toBe(false);
    expect(halted).toBe(false);
    expect(calls.size).toBe(0);

    data(
      await emitAck(gm, 'token:update', { tokenId: cienId, patch: { spotDv: 10 } }),
      'token:update (PT Cienia)',
    );
    expect(has(await roundTrip(gm), cienId)).toMatchObject({ spotDv: 10 });
    // MG przeciąga Iskrę obok Cienia — lądowanie bez trasy liczy całą drogę.
    heard.length = 0;
    await gmMove(iskraId, 0, 1600);
    await expect.poll(() => calls.size).toBe(1);
    expect(heard.find((message) => message.kind === 'check')?.check?.dv).toBe(10);
    await answer([5]); // 18 + 5 = 23 > 10
    await expect
      .poll(async () => has(await roundTrip(player), cienId))
      .toMatchObject({ name: 'Cień' });
  });

  it('zauważony wróg zakłada walkę z zauważenia (56) jak każdy widoczny', async () => {
    data(
      await emitAck(gm, 'token:update', { tokenId: zbirId, patch: { disposition: 'hostile' } }),
      'token:update (wrogi Zbir)',
    );
    await gmMove(zbirId, 3000, 2400);
    await gmMove(iskraId, 2400, 2400);
    expect((await roundTrip(gm)).combat).toBeNull();
    const halted = waitFor<TokenHaltBroadcast>(player, 'token:halt');
    scriptDice([3]); // 12 + 3 = 15
    await march(iskraId, 2400, 2900, 2400);
    await halted;
    // Niezauważony wróg niczego nie zaczyna.
    expect((await roundTrip(gm)).combat).toBeNull();
    await answer([9]); // 18 + 9 = 27 > 15
    await expect
      .poll(async () => (await roundTrip(gm)).combat?.sighting?.foeIds ?? [])
      .toContain(zbirId);
  });
});
