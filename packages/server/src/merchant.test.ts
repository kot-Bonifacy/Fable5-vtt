import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  CampaignSummary,
  CatalogShoppingBroadcast,
  CharacterView,
  ChatMessageBroadcast,
  CpredCharacterData,
  EconomyHistoryResult,
  ExchangeCounterpartsResult,
  MerchantConfigResult,
  MerchantDealResult,
  MerchantListResult,
  MerchantUpdateBroadcast,
  MerchantViewResult,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenView,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { exportCampaign } from './archive.js';
import { joinUrl } from './test-join.js';

/**
 * Testy dymne handlarzy (etap 46a), na żywych gniazdach.
 *
 * Ceny, odkup, targ i przenoszenie liczy `shared/systems/cpred/merchant.test.ts`.
 * Tutaj szew: kto widzi półkę i co z niej (ukryty towar, id karty handlarza),
 * kto może kupić (otwarte, zasięg, sesja), czy transakcja rusza obie karty
 * i historię naraz — i czy dwa zakupy ostatnich sztuk kończą się jedną
 * sprzedażą, a nie dwiema albo awarią.
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
let campaignId: string;
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

/** Wszystko, co usłyszało gniazdo pod jedną nazwą zdarzenia — od teraz. */
function collect<T>(socket: ClientSocket, event: string): T[] {
  const heard: T[] = [];
  socket.on(event, (payload: T) => heard.push(payload));
  return heard;
}

async function sheetOf(socket: ClientSocket, characterId: string): Promise<CpredCharacterData> {
  const view = data(
    await emitAck<CharacterView>(socket, 'character:update', { characterId, patch: {} }),
    'character:update',
  );
  return view.data as CpredCharacterData;
}

async function ledgerOf(socket: ClientSocket, characterId: string) {
  return data(
    await emitAck<EconomyHistoryResult>(socket, 'economy:history', { characterId }),
    'economy:history',
  ).entries;
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
    payload: { name: 'Knajpa' },
  });
  campaignId = (campaignRes.json() as CampaignSummary).id;

  const joinVex = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, campaignId, 'Vex'),
  });
  vexCookie = cookieOf(joinVex.headers['set-cookie']);
  vexUserId = (joinVex.json() as { user: { id: string } }).user.id;
  const joinRico = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, campaignId, 'Rico'),
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

describe('handlarze', () => {
  let gm: ClientSocket;
  let vex: ClientSocket;
  let rico: ClientSocket;
  let vexId: string;
  let ricoId: string;
  let paserId: string;
  let ricoTokenId: string;
  let merchantId: string;

  const deal = (
    socket: ClientSocket,
    characterId: string,
    body: { buy?: unknown[]; sell?: unknown[]; expectTotal: number },
    id = merchantId,
  ) =>
    emitAck<MerchantDealResult>(socket, 'merchant:deal', {
      merchantId: id,
      characterId,
      buy: body.buy ?? [],
      sell: body.sell ?? [],
      expectTotal: body.expectTotal,
    });

  it('stawia bar: Vex przy Paserze, Rico w drugim końcu sali', async () => {
    const gmConn = createSocket(gmCookie);
    const vexConn = createSocket(vexCookie);
    const ricoConn = createSocket(ricoCookie);
    gm = gmConn.socket;
    vex = vexConn.socket;
    rico = ricoConn.socket;
    await Promise.all([gmConn.firstSync, vexConn.firstSync, ricoConn.firstSync]);
    expect((await vexConn.firstSync).catalogShopping).toBe('everywhere');

    const create = async (body: object) =>
      data(await emitAck<CharacterView>(gm, 'character:create', body), 'character:create').id;
    vexId = await create({ name: 'Vex', ownerId: vexUserId });
    ricoId = await create({ name: 'Rico', ownerId: ricoUserId });
    paserId = await create({ name: 'Paser Mirek' });

    await emitAck(gm, 'character:update', {
      characterId: vexId,
      patch: {
        data: {
          weapons: [
            {
              id: 'w-zgrzyt',
              name: 'Zgrzyt 9',
              notes: '',
              compendiumId: 'weapon.zgrzyt-9',
              damage: '2k6',
              ammoCurrent: 12,
              ammoMax: 12,
              ammoType: 'Pistoletowa',
              rof: '2',
            },
          ],
          gear: [{ id: 'g-chip', name: 'Chip z kodem', notes: '', qty: 1 }],
        },
      },
    });
    await emitAck(gm, 'character:update', {
      characterId: paserId,
      patch: {
        data: {
          gear: [
            {
              id: 'g-apt',
              name: 'Apteczka polowa',
              notes: '',
              compendiumId: 'gear.apteczka-polowa',
              qty: 3,
            },
          ],
          weapons: [
            {
              id: 'w-szpon',
              name: 'Szpon',
              notes: '',
              compendiumId: 'weapon.szpon',
              damage: '3k6',
              ammoCurrent: 0,
              ammoMax: 0,
              ammoType: '',
              rof: '2',
            },
          ],
        },
      },
    });
    await emitAck(gm, 'economy:adjust', { characterId: vexId, balance: 1000 });
    await emitAck(gm, 'economy:adjust', { characterId: ricoId, balance: 1000 });
    await emitAck(gm, 'economy:adjust', { characterId: paserId, balance: 500 });

    const scene = data(await emitAck<SceneView>(gm, 'scene:create', { name: 'Bar' }), 'scene');
    await emitAck(gm, 'scene:visibility', { sceneId: scene.id, visibility: 'open' });
    const activated = waitFor(vex, 'scene:activate');
    await emitAck(gm, 'scene:activate', { sceneId: scene.id });
    await activated;
    const token = async (body: object) =>
      data(
        await emitAck<TokenView>(gm, 'token:create', { sceneId: scene.id, ...body }),
        'token:create',
      ).id;
    await token({ name: 'Vex', x: 0, y: 0, ownerId: vexUserId, characterId: vexId });
    ricoTokenId = await token({
      name: 'Rico',
      x: 20 * PX_PER_M,
      y: 0,
      ownerId: ricoUserId,
      characterId: ricoId,
    });
    await token({ name: 'Paser Mirek', x: 0, y: PX_PER_M, characterId: paserId });
  });

  it('sklepem zostaje wyłącznie karta NPC-a i wyłącznie z ręki MG', async () => {
    expect(
      await emitAck(vex, 'merchant:config', { characterId: paserId, merchant: { open: true } }),
    ).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(
      await emitAck(gm, 'merchant:config', { characterId: vexId, merchant: { open: true } }),
    ).toEqual({ ok: false, error: 'NOT_NPC' });
    expect(
      await emitAck(gm, 'merchant:config', { characterId: paserId, merchant: { priceMul: 0 } }),
    ).toEqual({ ok: false, error: 'BAD_REQUEST' });
    const shops = waitFor(vex, 'merchant:shops');
    merchantId = data(
      await emitAck<MerchantConfigResult>(gm, 'merchant:config', {
        characterId: paserId,
        merchant: { sign: 'Spod lady', priceMul: 120, buyBackPct: 50 },
      }),
      'merchant:config',
    ).merchantId!;
    expect(merchantId).toBeTruthy();
    // Sklep przy figurze nie trafia do doku gracza — tam są tylko zdalne.
    expect((await shops) as unknown).toEqual({ merchants: [] });
  });

  it('zamknięty sklep pokazuje półkę z napisem „Zamknięte” i nie sprzedaje', async () => {
    const view = data(
      await emitAck<MerchantViewResult>(vex, 'merchant:view', { merchantId }),
      'merchant:view',
    ).merchant;
    expect(view.closed).toBe('closed');
    expect(view.name).toBe('Spod lady');
    expect(
      await deal(vex, vexId, { buy: [{ list: 'gear', rowId: 'g-apt', qty: 1 }], expectTotal: 60 }),
    ).toEqual({ ok: false, error: 'MERCHANT_CLOSED' });
  });

  it('ukryty towar, cena MG i id karty handlarza nie docierają do gracza', async () => {
    expect(
      (
        await emitAck(gm, 'merchant:row', {
          merchantId,
          list: 'weapons',
          rowId: 'w-szpon',
          overlay: { hidden: true },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await emitAck(gm, 'merchant:row', {
          merchantId,
          list: 'gear',
          rowId: 'g-apt',
          overlay: { infinite: true },
        })
      ).ok,
    ).toBe(true);
    expect(
      await emitAck(gm, 'merchant:row', {
        merchantId,
        list: 'gear',
        rowId: 'nie-ma',
        overlay: { hidden: true },
      }),
    ).toEqual({ ok: false, error: 'ROW_NOT_FOUND' });
    expect(
      await emitAck(vex, 'merchant:row', {
        merchantId,
        list: 'gear',
        rowId: 'g-apt',
        overlay: null,
      }),
    ).toEqual({ ok: false, error: 'FORBIDDEN' });

    const raw = await new Promise<string>((resolvePromise) => {
      vex.emit('merchant:view', { merchantId }, (ack: unknown) =>
        resolvePromise(JSON.stringify(ack)),
      );
    });
    expect(raw).not.toContain('Szpon');
    expect(raw).not.toContain(paserId);
    expect(raw).not.toContain('hidden');
    const forVex = data(JSON.parse(raw) as SocketAck<MerchantViewResult>, 'merchant:view').merchant;
    expect(forVex.rows).toEqual([
      expect.objectContaining({ rowId: 'g-apt', price: 60, infinite: true }),
    ]);
    expect(forVex.cash).toBe(500);

    const forGm = data(
      await emitAck<MerchantViewResult>(gm, 'merchant:view', { merchantId }),
      'merchant:view',
    ).merchant;
    expect(forGm.characterId).toBe(paserId);
    expect(forGm.rows.find((row) => row.rowId === 'w-szpon')).toMatchObject({
      hidden: true,
      price: 120,
    });
  });

  it('otwarty sklep sprzedaje od ręki; zła suma to QUOTE_CHANGED, a nie inna cena', async () => {
    expect(
      (await emitAck(gm, 'merchant:config', { characterId: paserId, merchant: { open: true } })).ok,
    ).toBe(true);
    const body = {
      buy: [{ list: 'gear', rowId: 'g-apt', qty: 2 }],
      sell: [{ list: 'weapons', rowId: 'w-zgrzyt' }],
    };
    // Apteczki: 2 × 50 × 120% = 120; Zgrzyt: 50 × 50% = 25 → płaci 95.
    expect(await deal(vex, vexId, { ...body, expectTotal: 90 })).toEqual({
      ok: false,
      error: 'QUOTE_CHANGED',
    });
    const ricoHeard = collect<ChatMessageBroadcast>(rico, 'chat:message');
    const vexCard = waitFor<ChatMessageBroadcast>(vex, 'chat:message');
    expect(data(await deal(vex, vexId, { ...body, expectTotal: 95 }), 'deal')).toEqual({
      total: 95,
      balance: 905,
    });
    const card = (await vexCard).message;
    expect(card.kind).toBe('inventory');
    expect(JSON.stringify(card)).not.toContain(paserId);

    const vexSheet = await sheetOf(gm, vexId);
    expect(vexSheet.eddies).toBe(905);
    expect(vexSheet.weapons).toHaveLength(0);
    expect(vexSheet.gear.find((row) => row.compendiumId === 'gear.apteczka-polowa')?.qty).toBe(2);
    const paserSheet = await sheetOf(gm, paserId);
    // Wiersz „∞” nie ubywa; odkupiony Zgrzyt od razu leży na półce.
    expect(paserSheet.gear.find((row) => row.id === 'g-apt')?.qty).toBe(3);
    expect(paserSheet.weapons.map((row) => row.name).sort()).toEqual(['Szpon', 'Zgrzyt 9']);
    expect(paserSheet.eddies).toBe(595);

    const vexLedger = await ledgerOf(vex, vexId);
    expect(vexLedger.slice(0, 2).map((row) => [row.kind, row.amount])).toEqual([
      ['sale', 25],
      ['purchase', -120],
    ]);
    const paserLedger = await ledgerOf(gm, paserId);
    expect(paserLedger.slice(0, 2).map((row) => [row.kind, row.amount])).toEqual([
      ['purchase', -25],
      ['sale', 120],
    ]);
    // Karta zakupu: kupujący i MG, nie cały stół.
    await new Promise((settle) => setTimeout(settle, 100));
    expect(ricoHeard).toHaveLength(0);
  });

  it('rzecz bez katalogu i sklep bez odkupu nie biorą nic', async () => {
    expect(
      await deal(vex, vexId, { sell: [{ list: 'gear', rowId: 'g-chip' }], expectTotal: 0 }),
    ).toEqual({ ok: false, error: 'NO_PRICE' });
    await emitAck(gm, 'merchant:config', { characterId: paserId, merchant: { buyBackPct: 0 } });
    const apteczka = (await sheetOf(gm, vexId)).gear.find(
      (row) => row.compendiumId === 'gear.apteczka-polowa',
    )!;
    expect(
      await deal(vex, vexId, {
        sell: [{ list: 'gear', rowId: apteczka.id, qty: 1 }],
        expectTotal: -25,
      }),
    ).toEqual({ ok: false, error: 'NOT_BUYING' });
    await emitAck(gm, 'merchant:config', { characterId: paserId, merchant: { buyBackPct: 50 } });
  });

  it('podrobiony adres ukrytego wiersza nie istnieje', async () => {
    expect(
      await deal(vex, vexId, {
        buy: [{ list: 'weapons', rowId: 'w-szpon', qty: 1 }],
        expectTotal: 120,
      }),
    ).toEqual({ ok: false, error: 'ROW_NOT_FOUND' });
  });

  it('z drugiego końca sali: wyszarzony „Za daleko” i OUT_OF_REACH', async () => {
    const forRico = data(
      await emitAck<ExchangeCounterpartsResult>(rico, 'exchange:counterparts', {
        characterId: ricoId,
      }),
      'exchange:counterparts',
    ).counterparts;
    expect(forRico.find((row) => row.kind === 'merchant')).toMatchObject({
      merchantId,
      name: 'Spod lady',
      unavailable: 'OUT_OF_REACH',
    });
    expect(JSON.stringify(forRico)).not.toContain(paserId);
    expect(
      await deal(rico, ricoId, {
        buy: [{ list: 'gear', rowId: 'g-apt', qty: 1 }],
        expectTotal: 60,
      }),
    ).toEqual({ ok: false, error: 'OUT_OF_REACH' });
    expect((await sheetOf(gm, ricoId)).eddies).toBe(1000);

    const forVex = data(
      await emitAck<ExchangeCounterpartsResult>(vex, 'exchange:counterparts', {
        characterId: vexId,
      }),
      'exchange:counterparts',
    ).counterparts;
    expect(forVex[0]).toMatchObject({ kind: 'merchant', merchantId });
    expect(forVex[0]!.unavailable).toBeUndefined();
    expect(forVex[0]!.characterId).toBeUndefined();
  });

  it('dwa zakupy naraz o ostatnie sztuki: dokładnie jedna sprzedaż, ed się zgadzają', async () => {
    await emitAck(gm, 'merchant:row', { merchantId, list: 'gear', rowId: 'g-apt', overlay: null });
    await emitAck(gm, 'token:move', { tokenId: ricoTokenId, x: PX_PER_M, y: 0, final: true });
    const before = await Promise.all([vexId, ricoId, paserId].map((id) => sheetOf(gm, id)));
    const sum = (sheets: CpredCharacterData[]) => sheets.reduce((acc, s) => acc + s.eddies, 0);

    const buyTwo = { buy: [{ list: 'gear', rowId: 'g-apt', qty: 2 }], expectTotal: 120 };
    const results = await Promise.all([deal(vex, vexId, buyTwo), deal(rico, ricoId, buyTwo)]);
    expect(results.filter((ack) => ack.ok)).toHaveLength(1);
    expect(results.find((ack) => !ack.ok)).toEqual({ ok: false, error: 'OUT_OF_STOCK' });

    const after = await Promise.all([vexId, ricoId, paserId].map((id) => sheetOf(gm, id)));
    expect(sum(after)).toBe(sum(before));
    expect(after[2]!.gear.find((row) => row.id === 'g-apt')?.qty).toBe(1);
  });

  it('kasa handlarza: za mało ed — odmowa; „bez dna” — płaci bez wpisu w jego historii', async () => {
    await emitAck(gm, 'character:update', {
      characterId: vexId,
      patch: {
        data: {
          weapons: [
            {
              id: 'w-iglica',
              name: 'Iglica TW',
              notes: '',
              compendiumId: 'weapon.iglica-tw',
              damage: '5k6',
              ammoCurrent: 4,
              ammoMax: 4,
              ammoType: 'Karabinowa',
              rof: '1',
            },
          ],
        },
      },
    });
    await emitAck(gm, 'economy:adjust', { characterId: paserId, balance: 100 });
    const sell = { sell: [{ list: 'weapons', rowId: 'w-iglica' }], expectTotal: -250 };
    expect(await deal(vex, vexId, sell)).toEqual({ ok: false, error: 'MERCHANT_NO_CASH' });

    await emitAck(gm, 'merchant:config', {
      characterId: paserId,
      merchant: { cashInfinite: true },
    });
    const paserBefore = (await ledgerOf(gm, paserId)).length;
    expect(data(await deal(vex, vexId, sell), 'deal').total).toBe(-250);
    expect(await ledgerOf(gm, paserId)).toHaveLength(paserBefore);
    expect((await sheetOf(gm, paserId)).eddies).toBe(100);
    const view = data(
      await emitAck<MerchantViewResult>(vex, 'merchant:view', { merchantId }),
      'merchant:view',
    ).merchant;
    expect(view.cash).toBeNull();
  });

  it('półka odświeża się u oglądającego, gdy MG dopisze towar w karcie', async () => {
    const sheet = await sheetOf(gm, paserId);
    // Każdy zapis karty handlarza (także pusty z `sheetOf`) odświeża półkę —
    // czekamy na tę, która niesie nowy wiersz.
    const update = new Promise<MerchantUpdateBroadcast>((resolvePromise, reject) => {
      const timer = setTimeout(() => reject(new Error('merchant:update timeout')), 3000);
      const listener = (payload: MerchantUpdateBroadcast) => {
        if (!payload.merchant.rows.some((row) => row.rowId === 'g-lat')) return;
        clearTimeout(timer);
        vex.off('merchant:update', listener);
        resolvePromise(payload);
      };
      vex.on('merchant:update', listener);
    });
    await emitAck(gm, 'character:update', {
      characterId: paserId,
      patch: {
        data: {
          gear: [
            ...sheet.gear,
            {
              id: 'g-lat',
              name: 'Latarka taktyczna',
              notes: '',
              compendiumId: 'gear.latarka-taktyczna',
              qty: 1,
            },
          ],
        },
      },
    });
    const rows = (await update).merchant.rows;
    expect(rows.find((row) => row.rowId === 'g-lat')).toMatchObject({ price: 24 });
  });

  it('sklep zdalny „między sesjami”: działa bez figury i bez sesji, Paser — nie', async () => {
    const siecId = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Kontakt z Militechu' }),
      'character:create',
    ).id;
    await emitAck(gm, 'character:update', {
      characterId: siecId,
      patch: {
        data: {
          gear: [
            {
              id: 'g-agent',
              name: 'Agent kieszonkowy',
              notes: '',
              compendiumId: 'gear.agent-kieszonkowy',
              qty: 2,
            },
          ],
        },
      },
    });
    const shops = waitFor<{ merchants: { name: string }[] }>(vex, 'merchant:shops');
    const siec = data(
      await emitAck<MerchantConfigResult>(gm, 'merchant:config', {
        characterId: siecId,
        merchant: {
          sign: 'Sieć Militechu',
          access: 'remote',
          betweenSessions: true,
          open: true,
          cashInfinite: true,
        },
      }),
      'merchant:config',
    ).merchantId!;
    expect((await shops).merchants.map((row) => row.name)).toEqual(['Sieć Militechu']);

    // Rico w sesji, daleko od wszystkiego — sklep zdalny nie pyta o zasięg.
    await emitAck(gm, 'token:move', { tokenId: ricoTokenId, x: 20 * PX_PER_M, y: 0, final: true });
    expect(
      data(
        await deal(
          rico,
          ricoId,
          { buy: [{ list: 'gear', rowId: 'g-agent', qty: 1 }], expectTotal: 100 },
          siec,
        ),
        'deal',
      ).total,
    ).toBe(100);

    const vexMoved = waitFor(vex, 'session:changed');
    expect((await emitAck(gm, 'session:end', { campaignId })).ok).toBe(true);
    await vexMoved;
    const listed = data(await emitAck<MerchantListResult>(vex, 'merchant:list'), 'list');
    expect(listed.merchants.map((row) => row.name)).toEqual(['Sieć Militechu']);
    expect(
      data(
        await deal(
          vex,
          vexId,
          { buy: [{ list: 'gear', rowId: 'g-agent', qty: 1 }], expectTotal: 100 },
          siec,
        ),
        'deal',
      ).total,
    ).toBe(100);
    expect(
      await deal(vex, vexId, { buy: [{ list: 'gear', rowId: 'g-apt', qty: 1 }], expectTotal: 60 }),
    ).toEqual({ ok: false, error: 'SESSION_NOT_RUNNING' });
    expect(await emitAck(vex, 'merchant:view', { merchantId })).toEqual({
      ok: false,
      error: 'SESSION_NOT_RUNNING',
    });

    const vexBack = waitFor(vex, 'session:changed');
    expect((await emitAck(gm, 'session:start', { campaignId })).ok).toBe(true);
    await vexBack;
  });

  it('„Zakupy z katalogu: tylko u handlarzy” zamyka „Kup” graczowi, nie MG', async () => {
    expect(await emitAck(gm, 'campaign:catalog-shopping', { mode: 'nigdzie' })).toEqual({
      ok: false,
      error: 'BAD_REQUEST',
    });
    expect(await emitAck(vex, 'campaign:catalog-shopping', { mode: 'merchants' })).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
    const heard = waitFor<CatalogShoppingBroadcast>(vex, 'campaign:catalog-shopping');
    expect((await emitAck(gm, 'campaign:catalog-shopping', { mode: 'merchants' })).ok).toBe(true);
    expect((await heard).mode).toBe('merchants');
    expect(
      await emitAck(vex, 'economy:buy', { characterId: vexId, entryId: 'gear.latarka-taktyczna' }),
    ).toEqual({ ok: false, error: 'CATALOG_CLOSED' });
    expect(
      (await emitAck(gm, 'economy:buy', { characterId: vexId, entryId: 'gear.latarka-taktyczna' }))
        .ok,
    ).toBe(true);
  });

  it('martwy handlarz nie sprzedaje, a jego ciało jest łupem', async () => {
    await emitAck(gm, 'character:update', {
      characterId: paserId,
      patch: { data: { hpCurrent: 0 } },
    });
    expect(
      await deal(vex, vexId, { buy: [{ list: 'gear', rowId: 'g-apt', qty: 1 }], expectTotal: 60 }),
    ).toEqual({ ok: false, error: 'MERCHANT_CLOSED' });
    const list = data(
      await emitAck<ExchangeCounterpartsResult>(vex, 'exchange:counterparts', {
        characterId: vexId,
      }),
      'exchange:counterparts',
    ).counterparts;
    const body = list.find((row) => row.kind === 'loot');
    expect(body?.name).toBe('Paser Mirek');
    // Ukrycie dotyczy półki, nie kieszeni — ciało przeszukuje się w całości.
    expect(body?.items?.map((item) => item.name)).toContain('Szpon');
    expect(list.some((row) => row.kind === 'merchant' && row.merchantId === merchantId)).toBe(
      false,
    );
  });

  it('handlarz zdalny, który padł, znika z doku sklepów od razu (46a2)', async () => {
    const budkaId = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Budka z kebabem' }),
      'character:create',
    ).id;
    const opened = waitFor<{ merchants: { name: string }[] }>(vex, 'merchant:shops');
    const budka = data(
      await emitAck<MerchantConfigResult>(gm, 'merchant:config', {
        characterId: budkaId,
        merchant: { sign: 'Budka', access: 'remote', open: true },
      }),
      'merchant:config',
    ).merchantId!;
    expect((await opened).merchants.map((row) => row.name)).toContain('Budka');
    // MG widzi przełącznik „Otwarte” na liście — menu figury pisze z niego
    // „Otwórz / Zamknij sklep”.
    const forGm = data(await emitAck<MerchantListResult>(gm, 'merchant:list'), 'list');
    expect(forGm.merchants.find((row) => row.id === budka)).toMatchObject({
      open: true,
      characterId: budkaId,
    });
    const forVex = data(await emitAck<MerchantListResult>(vex, 'merchant:list'), 'list');
    expect(forVex.merchants.find((row) => row.id === budka)).not.toHaveProperty('open');

    const closed = waitFor<{ merchants: { name: string }[] }>(vex, 'merchant:shops');
    await emitAck(gm, 'character:update', {
      characterId: budkaId,
      patch: { data: { hpCurrent: 0 } },
    });
    expect((await closed).merchants.map((row) => row.name)).not.toContain('Budka');
  });

  it('eksport kampanii zabiera sklepy i przełącznik katalogu', async () => {
    const file = await exportCampaign(built.prisma, campaignId, { includeChat: false });
    expect(file?.payload.merchants).toHaveLength(3);
    expect(file?.payload.campaign.catalogShopping).toBe('merchants');
  });

  it('usunięcie sklepu zamyka półkę u oglądającego', async () => {
    await emitAck(vex, 'merchant:view', { merchantId }).catch(() => undefined);
    const gone = waitFor<{ merchantId: string }>(vex, 'merchant:gone');
    expect(
      (await emitAck(gm, 'merchant:config', { characterId: paserId, merchant: null })).ok,
    ).toBe(true);
    expect((await gone).merchantId).toBe(merchantId);
    expect(await emitAck(vex, 'merchant:view', { merchantId })).toEqual({
      ok: false,
      error: 'MERCHANT_NOT_FOUND',
    });
  });
});
