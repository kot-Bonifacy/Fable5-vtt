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
  ChatMessageBroadcast,
  CpredCharacterData,
  ExchangeCounterpartsResult,
  TradeUpdateBroadcast,
  TradeView,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenView,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { joinUrl } from './test-join.js';

/**
 * Testy dymne handlu (etap 38c), na żywych gniazdach.
 *
 * Arytmetykę wymiany sprawdza `cpredSwapItems` w `shared`, a zgody i wersje —
 * `shared/src/trade.test.ts`. Tutaj szew: kto widzi handel, kto może co
 * kliknąć, czy wymiana rusza obie karty naraz i czy nie wykona się dwa razy.
 *
 * (Nagłówek poniżej jest wspólny z testem 38b, z którego ten plik wyszedł.)
 *
 * Arytmetykę przenoszenia sprawdza `shared/systems/cpred/inventory.test.ts`;
 * tutaj chodzi o **szew**: kto ma prawo co ruszyć, czy karta czatu dociera do
 * obu stron i czy przeżywa przeładowanie, i czy przyjęta propozycja zamyka się
 * dokładnie raz. Trzy z tych pytań to trzy różne błędy, które ten projekt już
 * kiedyś popełnił.
 */

const TEST_DB = `./.test-${randomBytes(6).toString('hex')}.db`;
const GM_PASSWORD = 'test-haslo';
/** Domyślna skala sceny: 50 px na metr. */
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
let vexCookie: string;
let vexUserId: string;
let ricoCookie: string;
let ricoUserId: string;
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

function waitFor<T>(socket: ClientSocket, event: string, ms = 3000): Promise<T> {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolvePromise(payload);
    });
  });
}

function emitAck<T = undefined>(
  socket: ClientSocket,
  event: string,
  payload?: unknown,
): Promise<SocketAck<T>> {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), 3000);
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

/** Karta tak, jak trzyma ją teraz serwer. */
async function sheetOf(socket: ClientSocket, characterId: string): Promise<CpredCharacterData> {
  const view = data(
    await emitAck<CharacterView>(socket, 'character:update', { characterId, patch: {} }),
    'character:update',
  );
  return view.data as CpredCharacterData;
}

function weaponRow(id: string) {
  return {
    id,
    name: 'Zgrzyt 9',
    notes: '',
    compendiumId: 'weapon.zgrzyt-9',
    damage: '2k6',
    ammoCurrent: 12,
    ammoMax: 30,
    ammoType: 'Pistoletowa',
    rof: '2',
    attachmentIds: ['attachment.celownik'],
  };
}

function gearRow(id: string, qty: number) {
  return { id, name: 'Stimpak', notes: '', compendiumId: 'gear.stimpak', qty };
}

let sceneId: string;
let vexCharacterId: string;
let ricoCharacterId: string;
let vexTokenId: string;
let ricoTokenId: string;

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
    payload: { name: 'Zaułek' },
  });
  const campaignId = (campaignRes.json() as CampaignSummary).id;

  // Etap 44b: linki są imienne — wystawia je `joinUrl` przy każdym wejściu.
  const token = campaignId;

  const joinVex = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, token, 'Vex'),
  });
  vexCookie = cookieOf(joinVex.headers['set-cookie']);
  vexUserId = (joinVex.json() as { user: { id: string } }).user.id;

  const joinRico = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, token, 'Rico'),
  });
  ricoCookie = cookieOf(joinRico.headers['set-cookie']);
  ricoUserId = (joinRico.json() as { user: { id: string } }).user.id;
}, 60_000);

afterAll(async () => {
  for (const socket of openSockets) socket.disconnect();
  await built.app.close();
  try {
    unlinkSync(TEST_DB);
  } catch {
    // best effort — Windows potrafi jeszcze trzymać plik
  }
});

/** Następny `trade:update` (opcjonalnie: dopiero taki, który ma ten status). */
function nextTrade(socket: ClientSocket, status?: TradeView['status']): Promise<TradeView> {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error('trade:update timeout')), 3000);
    const listener = (payload: TradeUpdateBroadcast) => {
      if (status && payload.trade.status !== status) return;
      clearTimeout(timer);
      socket.off('trade:update', listener);
      resolvePromise(payload.trade);
    };
    socket.on('trade:update', listener);
  });
}

describe('handel', () => {
  let gm: ClientSocket;
  let vex: ClientSocket;
  let rico: ClientSocket;
  let paserCharacterId: string;
  let paserTokenId: string;
  let tradeId: string;

  it('stawia scenę: Vex, Rico obok siebie i paser NPC', async () => {
    const gmConn = createSocket(gmCookie);
    const vexConn = createSocket(vexCookie);
    const ricoConn = createSocket(ricoCookie);
    gm = gmConn.socket;
    vex = vexConn.socket;
    rico = ricoConn.socket;
    await Promise.all([gmConn.firstSync, vexConn.firstSync, ricoConn.firstSync]);

    vexCharacterId = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Vex', ownerId: vexUserId }),
      'character:create',
    ).id;
    ricoCharacterId = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Rico', ownerId: ricoUserId }),
      'character:create',
    ).id;
    paserCharacterId = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Paser Mirek' }),
      'character:create',
    ).id;

    await emitAck(gm, 'character:update', {
      characterId: vexCharacterId,
      patch: { data: { weapons: [weaponRow('w-vex')] } },
    });
    await emitAck(gm, 'character:update', {
      characterId: ricoCharacterId,
      patch: { data: { gear: [gearRow('g-rico', 3)] } },
    });
    await emitAck(gm, 'character:update', {
      characterId: paserCharacterId,
      patch: { data: { gear: [gearRow('g-paser', 5)] } },
    });
    await emitAck(gm, 'economy:adjust', { characterId: vexCharacterId, balance: 500 });
    await emitAck(gm, 'economy:adjust', { characterId: ricoCharacterId, balance: 300 });

    const scene = data(await emitAck<SceneView>(gm, 'scene:create', { name: 'Targ' }), 'scene');
    sceneId = scene.id;
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'open' });
    const activated = waitFor(vex, 'scene:activate');
    await emitAck(gm, 'scene:activate', { sceneId });
    await activated;

    vexTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Vex',
        x: 0,
        y: 0,
        ownerId: vexUserId,
        characterId: vexCharacterId,
      }),
      'token:create',
    ).id;
    ricoTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Rico',
        x: PX_PER_M,
        y: 0,
        ownerId: ricoUserId,
        characterId: ricoCharacterId,
      }),
      'token:create',
    ).id;
    paserTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Paser Mirek',
        x: 0,
        y: PX_PER_M,
        characterId: paserCharacterId,
      }),
      'token:create',
    ).id;
    expect(vexTokenId && ricoTokenId && paserTokenId).toBeTruthy();
  });

  it('lista drugich stron: gracz obok i NPC do handlu, bez id karty NPC-a', async () => {
    const result = data(
      await emitAck<ExchangeCounterpartsResult>(vex, 'exchange:counterparts', {
        characterId: vexCharacterId,
      }),
      'exchange:counterparts',
    );
    const trades = result.counterparts.filter((row) => row.kind === 'trade');
    expect(trades.map((row) => row.name).sort()).toEqual(['Paser Mirek', 'Rico']);
    const paser = trades.find((row) => row.name === 'Paser Mirek');
    expect(paser?.tokenId).toBe(paserTokenId);
    expect(paser?.characterId).toBeUndefined();
  });

  it('zaproszenie widzą zaproszony i MG; zapraszający kładzie rzeczy od razu, zaproszony po „Przyjmij"', async () => {
    const ricoSees = nextTrade(rico, 'invited');
    const gmSees = nextTrade(gm, 'invited');
    const invited = data(
      await emitAck<{ trade: TradeView }>(vex, 'trade:invite', {
        fromCharacterId: vexCharacterId,
        toTokenId: ricoTokenId,
      }),
      'trade:invite',
    ).trade;
    tradeId = invited.id;
    expect(invited.status).toBe('invited');
    expect(invited.sides[0]).toMatchObject({ name: 'Vex', mine: true });
    const forRico = await ricoSees;
    expect(forRico.sides[1]).toMatchObject({ name: 'Rico', mine: true });
    // Etap 46a: karta kolegi z drużyny niesie id (umowa #40 i tak je daje) —
    // po nim „Wyślij bez czekania” wysyła pole jako propozycję z 38b.
    expect(forRico.sides[0].characterId).toBe(vexCharacterId);
    // MG widzi, ale żadnej strony handlu dwóch graczy nie prowadzi.
    expect((await gmSees).sides.map((side) => side.mine)).toEqual([false, false]);

    // Etap 46a: jedno okno — zapraszający ma pole od razu („Wyślij bez
    // czekania” musi mieć co wysłać), zaproszony dostaje je po „Przyjmij”.
    expect((await emitAck(vex, 'trade:offer', { tradeId, items: [], eddies: 10 })).ok).toBe(true);
    expect(await emitAck(rico, 'trade:offer', { tradeId, items: [], eddies: 10 })).toEqual({
      ok: false,
      error: 'TRADE_NOT_OPEN',
    });
    expect((await emitAck(vex, 'trade:offer', { tradeId, items: [], eddies: 0 })).ok).toBe(true);
    // Vex nie przyjmie zaproszenia za Rico.
    expect(await emitAck(vex, 'trade:respond', { tradeId, accept: true })).toEqual({
      ok: false,
      error: 'NOT_YOURS',
    });

    const opened = nextTrade(vex, 'open');
    expect((await emitAck(rico, 'trade:respond', { tradeId, accept: true })).ok).toBe(true);
    expect((await opened).status).toBe('open');
  });

  it('karta w handlu nie zacznie drugiego', async () => {
    expect(
      await emitAck(gm, 'trade:invite', {
        fromCharacterId: paserCharacterId,
        toCharacterId: ricoCharacterId,
      }),
    ).toEqual({ ok: false, error: 'CHARACTER_BUSY' });
  });

  it('zmiana pola wymiany zdejmuje zgodę drugiej strony, a stara wersja nie przechodzi', async () => {
    let seen = nextTrade(rico);
    expect(
      (
        await emitAck(vex, 'trade:offer', {
          tradeId,
          items: [{ list: 'weapons', rowId: 'w-vex' }],
          eddies: 100,
        })
      ).ok,
    ).toBe(true);
    const afterVex = await seen;
    expect(afterVex.sides[0].items.map((item) => item.name)).toEqual(['Zgrzyt 9']);
    expect(afterVex.sides[0].eddies).toBe(100);

    seen = nextTrade(vex);
    expect(
      (
        await emitAck(rico, 'trade:offer', {
          tradeId,
          items: [{ list: 'gear', rowId: 'g-rico', qty: 2 }],
          eddies: 0,
        })
      ).ok,
    ).toBe(true);
    const afterRico = await seen;

    seen = nextTrade(rico);
    expect(
      (await emitAck(vex, 'trade:accept', { tradeId, version: afterRico.version, accepted: true }))
        .ok,
    ).toBe(true);
    expect((await seen).sides[0].accepted).toBe(true);

    // Rico dokłada sztukę — zgoda Vex przepada.
    seen = nextTrade(vex);
    await emitAck(rico, 'trade:offer', {
      tradeId,
      items: [{ list: 'gear', rowId: 'g-rico', qty: 3 }],
      eddies: 0,
    });
    const changed = await seen;
    expect(changed.sides.map((side) => side.accepted)).toEqual([false, false]);
    expect(
      await emitAck(vex, 'trade:accept', { tradeId, version: afterRico.version, accepted: true }),
    ).toEqual({ ok: false, error: 'TRADE_CHANGED' });
  });

  it('MG nie zatwierdzi za gracza i nie ruszy jego pola', async () => {
    const view = data(await emitAck<{ trades: TradeView[] }>(gm, 'trade:list'), 'trade:list');
    const version = view.trades.find((trade) => trade.id === tradeId)!.version;
    expect(await emitAck(gm, 'trade:accept', { tradeId, version, accepted: true })).toEqual({
      ok: false,
      error: 'NOT_YOURS',
    });
    expect(await emitAck(gm, 'trade:offer', { tradeId, items: [], eddies: 0 })).toEqual({
      ok: false,
      error: 'NOT_YOURS',
    });
  });

  it('dwie zgody wymieniają rzeczy i gotówkę naraz, z kartą czatu u obu', async () => {
    const list = data(await emitAck<{ trades: TradeView[] }>(vex, 'trade:list'), 'trade:list');
    const version = list.trades[0]!.version;
    expect((await emitAck(vex, 'trade:accept', { tradeId, version, accepted: true })).ok).toBe(
      true,
    );

    const vexCard = waitFor<ChatMessageBroadcast>(vex, 'chat:message');
    const done = nextTrade(vex, 'done');
    expect((await emitAck(rico, 'trade:accept', { tradeId, version, accepted: true })).ok).toBe(
      true,
    );
    expect((await done).closedBy).toBe('Rico');

    const vexSheet = await sheetOf(vex, vexCharacterId);
    const ricoSheet = await sheetOf(rico, ricoCharacterId);
    expect(vexSheet.weapons).toEqual([]);
    expect(vexSheet.gear.map((row) => row.qty)).toEqual([3]);
    expect(vexSheet.eddies).toBe(400);
    expect(ricoSheet.weapons[0]).toMatchObject({ name: 'Zgrzyt 9', ammoCurrent: 12 });
    expect(ricoSheet.gear).toEqual([]);
    expect(ricoSheet.eddies).toBe(400);

    const message = (await vexCard).message;
    expect(message.inventory?.kind).toBe('trade');
    expect(message.inventory?.lines).toEqual([
      'Zgrzyt 9 (12/30 · Pistoletowa · 1 dodatek)',
      'Gotówka: 100 ed',
    ]);
    expect(message.inventory?.returnLines).toEqual(['Stimpak × 3']);

    // Po wykonaniu handlu już nie ma — drugi klik nie wymieni niczego drugi raz.
    expect(await emitAck(rico, 'trade:accept', { tradeId, version, accepted: true })).toEqual({
      ok: false,
      error: 'TRADE_NOT_FOUND',
    });
  });

  it('karta handlu przeżywa przeładowanie u obu graczy', async () => {
    const freshVex = createSocket(vexCookie);
    const freshRico = createSocket(ricoCookie);
    const [vexSync, ricoSync] = await Promise.all([freshVex.firstSync, freshRico.firstSync]);
    const traded = (messages: StateSyncPayload['messages']) =>
      messages.filter((m) => m.kind === 'inventory' && m.inventory?.kind === 'trade').length;
    expect(traded(vexSync.messages)).toBe(1);
    expect(traded(ricoSync.messages)).toBe(1);
  });

  it('handel z NPC-em: stronę pasera prowadzi MG', async () => {
    const gmSees = nextTrade(gm, 'invited');
    const invited = data(
      await emitAck<{ trade: TradeView }>(vex, 'trade:invite', {
        fromCharacterId: vexCharacterId,
        toTokenId: paserTokenId,
      }),
      'trade:invite',
    ).trade;
    // Karta NPC-a nie jest drużyną — id zostaje u MG (#40).
    expect(invited.sides[1].characterId).toBeUndefined();
    expect((await gmSees).sides[1].mine).toBe(true);
    expect((await emitAck(gm, 'trade:respond', { tradeId: invited.id, accept: true })).ok).toBe(
      true,
    );

    let seen = nextTrade(vex);
    await emitAck(gm, 'trade:offer', {
      tradeId: invited.id,
      items: [{ list: 'gear', rowId: 'g-paser', qty: 1 }],
      eddies: 0,
    });
    await seen;
    seen = nextTrade(gm);
    await emitAck(vex, 'trade:offer', { tradeId: invited.id, items: [], eddies: 50 });
    const offered = await seen;

    await emitAck(gm, 'trade:accept', {
      tradeId: invited.id,
      version: offered.version,
      accepted: true,
    });
    const done = nextTrade(vex, 'done');
    const vexCard = waitFor<ChatMessageBroadcast>(vex, 'chat:message');
    expect(
      (
        await emitAck(vex, 'trade:accept', {
          tradeId: invited.id,
          version: offered.version,
          accepted: true,
        })
      ).ok,
    ).toBe(true);
    await done;
    // Karta czatu „Vex ⇄ Paser" nie niesie graczowi id karty pasera (#40).
    const card = (await vexCard).message.inventory;
    expect(card?.toName).toBe('Paser Mirek');
    expect(card).not.toHaveProperty('toCharacterId');
    expect(JSON.stringify(card)).not.toContain(paserCharacterId);
    const vexSheet = await sheetOf(vex, vexCharacterId);
    expect(vexSheet.eddies).toBe(350);
    expect(vexSheet.gear[0]?.qty).toBe(4);
    const paserSheet = await sheetOf(gm, paserCharacterId);
    expect(paserSheet.gear[0]?.qty).toBe(4);
    expect(paserSheet.eddies).toBe(50);
  });

  it('zużyta w międzyczasie rzecz zdejmuje zgody zamiast pojechać w innym stanie', async () => {
    const invited = data(
      await emitAck<{ trade: TradeView }>(vex, 'trade:invite', {
        fromCharacterId: vexCharacterId,
        toTokenId: ricoTokenId,
      }),
      'trade:invite',
    ).trade;
    await emitAck(rico, 'trade:respond', { tradeId: invited.id, accept: true });
    const stimpaks = (await sheetOf(vex, vexCharacterId)).gear[0]!;
    let seen = nextTrade(rico);
    await emitAck(vex, 'trade:offer', {
      tradeId: invited.id,
      items: [{ list: 'gear', rowId: stimpaks.id, qty: 4 }],
      eddies: 0,
    });
    const offered = await seen;
    await emitAck(rico, 'trade:accept', {
      tradeId: invited.id,
      version: offered.version,
      accepted: true,
    });

    // Vex zużywa jedną fiolkę z tego, co leży w polu wymiany.
    await emitAck(vex, 'character:update', {
      characterId: vexCharacterId,
      patch: { data: { gear: [{ ...stimpaks, qty: 3 }] } },
    });

    seen = nextTrade(rico);
    expect(
      await emitAck(vex, 'trade:accept', {
        tradeId: invited.id,
        version: offered.version,
        accepted: true,
      }),
    ).toEqual({ ok: false, error: 'OFFER_STALE' });
    const refused = await seen;
    expect(refused.notice).toBe('OFFER_STALE');
    expect(refused.sides.map((side) => side.accepted)).toEqual([false, false]);
    expect((await sheetOf(rico, ricoCharacterId)).gear).toEqual([]);

    // MG przerywa handel dwóch graczy.
    const cancelled = nextTrade(vex, 'cancelled');
    expect((await emitAck(gm, 'trade:cancel', { tradeId: invited.id })).ok).toBe(true);
    expect((await cancelled).closedBy).toBe('MG');
  });

  it('za daleko — zaproszenie nie wychodzi', async () => {
    await emitAck(gm, 'token:move', { tokenId: ricoTokenId, x: 20 * PX_PER_M, y: 0, final: true });
    expect(
      await emitAck(vex, 'trade:invite', {
        fromCharacterId: vexCharacterId,
        toTokenId: ricoTokenId,
      }),
    ).toEqual({ ok: false, error: 'OUT_OF_REACH' });
  });

  it('gracz nie zaprosi ukrytej figury ani karty NPC-a po id', async () => {
    await emitAck(gm, 'token:update', { tokenId: paserTokenId, patch: { hidden: true } });
    expect(
      await emitAck(vex, 'trade:invite', {
        fromCharacterId: vexCharacterId,
        toTokenId: paserTokenId,
      }),
    ).toEqual({ ok: false, error: 'TOKEN_NOT_FOUND' });
    expect(
      await emitAck(vex, 'trade:invite', {
        fromCharacterId: vexCharacterId,
        toCharacterId: paserCharacterId,
      }),
    ).toEqual({ ok: false, error: 'CHARACTER_NOT_FOUND' });
  });
});
