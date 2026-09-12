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
  InventorySourcesResult,
  InvitationSummary,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenView,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Testy dymne przedmiotów między kartami (etap 38b), na żywych gniazdach.
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
let gangerCharacterId: string;
let gangerTokenId: string;
let vexTokenId: string;
let ricoTokenId: string;
/** Ganger stojący na nogach — przeszukać go nie wolno. */
let guardTokenId: string;

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
    payload: { password: GM_PASSWORD },
  });
  gmCookie = cookieOf(login.headers['set-cookie']);

  const campaignRes = await built.app.inject({
    method: 'POST',
    url: '/api/campaigns',
    headers: { cookie: gmCookie },
    payload: { name: 'Zaułek' },
  });
  const campaignId = (campaignRes.json() as CampaignSummary).id;

  const inviteRes = await built.app.inject({
    method: 'POST',
    url: `/api/campaigns/${campaignId}/invitations`,
    headers: { cookie: gmCookie },
    payload: {},
  });
  const token = (inviteRes.json() as InvitationSummary).token;

  const joinVex = await built.app.inject({
    method: 'POST',
    url: `/api/join/${token}`,
    payload: { name: 'Vex' },
  });
  vexCookie = cookieOf(joinVex.headers['set-cookie']);
  vexUserId = (joinVex.json() as { user: { id: string } }).user.id;

  const joinRico = await built.app.inject({
    method: 'POST',
    url: `/api/join/${token}`,
    payload: { name: 'Rico' },
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

describe('przedmioty między kartami', () => {
  let gm: ClientSocket;
  let vex: ClientSocket;
  let rico: ClientSocket;

  it('stawia scenę: dwie karty graczy i ganger leżący obok Vex', async () => {
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
    gangerCharacterId = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Ganger' }),
      'character:create',
    ).id;

    expect(
      (
        await emitAck(vex, 'character:update', {
          characterId: vexCharacterId,
          patch: { data: { gear: [gearRow('g-vex', 3)] } },
        })
      ).ok,
    ).toBe(true);
    // Ganger leży: zero PW plus broń, pancerz i gotówka w kieszeni.
    expect(
      (
        await emitAck(gm, 'character:update', {
          characterId: gangerCharacterId,
          patch: {
            data: {
              hpCurrent: 0,
              weapons: [weaponRow('w-ganger')],
              armor: [
                {
                  id: 'a-ganger',
                  name: 'Kurtka Kevlarowa',
                  notes: '',
                  sp: 11,
                  spCurrent: 7,
                  location: 'body',
                  equipped: true,
                },
              ],
              gear: [gearRow('g-ganger', 2)],
            },
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (await emitAck(gm, 'economy:adjust', { characterId: gangerCharacterId, balance: 350 })).ok,
    ).toBe(true);

    const scene = data(await emitAck<SceneView>(gm, 'scene:create', { name: 'Zaułek' }), 'scene');
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
    // Dokładnie 2 m — zasięg ramienia, mierzony od środka do środka.
    gangerTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Ganger',
        x: 2 * PX_PER_M,
        y: 0,
        characterId: gangerCharacterId,
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
    expect(vexTokenId && gangerTokenId && ricoTokenId).toBeTruthy();
  });

  it('gracz widzi leżącego gangera na liście źródeł, razem z jego ekwipunkiem', async () => {
    const result = data(
      await emitAck<InventorySourcesResult>(vex, 'inventory:sources', {
        characterId: vexCharacterId,
      }),
      'inventory:sources',
    );
    const ganger = result.sources.find((row) => row.name === 'Ganger');
    expect(ganger).toBeDefined();
    expect(ganger?.metres).toBe(2);
    expect(ganger?.eddies).toBe(350);
    expect(ganger?.items.map((item) => item.name).sort()).toEqual([
      'Kurtka Kevlarowa',
      'Stimpak',
      'Zgrzyt 9',
    ]);
    // Kartę Rico — gracza — ma widzieć jako **cel**, nie jako źródło.
    expect(result.sources.some((row) => row.name === 'Rico')).toBe(false);
    expect(result.targets.map((row) => row.name).sort()).toEqual(['Ganger', 'Rico']);
  });

  it('gracz zabiera broń z ciała razem z magazynkiem i przykręconym celownikiem', async () => {
    const card = waitFor<ChatMessageBroadcast>(vex, 'chat:message');
    const ack = await emitAck<{ messageId: number }>(vex, 'inventory:take', {
      fromTokenId: gangerTokenId,
      toCharacterId: vexCharacterId,
      items: [{ list: 'weapons', rowId: 'w-ganger' }],
    });
    expect(ack.ok).toBe(true);

    const vexSheet = await sheetOf(vex, vexCharacterId);
    expect(vexSheet.weapons).toHaveLength(1);
    expect(vexSheet.weapons[0]).toMatchObject({
      name: 'Zgrzyt 9',
      ammoCurrent: 12,
      ammoMax: 30,
      attachmentIds: ['attachment.celownik'],
    });
    expect((await sheetOf(gm, gangerCharacterId)).weapons).toEqual([]);

    const message = (await card).message;
    expect(message.kind).toBe('inventory');
    expect(message.inventory?.kind).toBe('take');
    expect(message.inventory?.lines).toEqual(['Zgrzyt 9 (12/30 · Pistoletowa · 1 dodatek)']);
    // Łup nie czeka na niczyją zgodę — nie ma kogo pytać.
    expect(message.inventory?.resolution?.kind).toBe('accepted');
  });

  it('pancerz z ciała przychodzi zdjęty, ze zużytym OB', async () => {
    expect(
      (
        await emitAck(vex, 'inventory:take', {
          fromTokenId: gangerTokenId,
          toCharacterId: vexCharacterId,
          items: [{ list: 'armor', rowId: 'a-ganger' }],
        })
      ).ok,
    ).toBe(true);
    const armor = (await sheetOf(vex, vexCharacterId)).armor[0]!;
    expect(armor.spCurrent).toBe(7);
    expect(armor.equipped).toBe(false);
  });

  it('gotówka z kieszeni zostawia wpis w historii obu kart', async () => {
    expect(
      (
        await emitAck(vex, 'inventory:take', {
          fromTokenId: gangerTokenId,
          toCharacterId: vexCharacterId,
          items: [{ list: 'gear', rowId: 'g-ganger', qty: 1 }],
          eddies: 350,
        })
      ).ok,
    ).toBe(true);
    expect((await sheetOf(vex, vexCharacterId)).eddies).toBe(350);
    expect((await sheetOf(gm, gangerCharacterId)).eddies).toBe(0);
    // Dwie fiolki gangera, jedna zabrana: druga zostaje na ciele.
    expect((await sheetOf(gm, gangerCharacterId)).gear[0]?.qty).toBe(1);
    // Stimpaki skleiły się z tymi, które Vex już miał (ta sama pozycja katalogu).
    const vexGear = (await sheetOf(vex, vexCharacterId)).gear;
    expect(vexGear).toHaveLength(1);
    expect(vexGear[0]?.qty).toBe(4);
  });

  it('gracz nie zabierze niczego z karty innego gracza', async () => {
    expect(
      await emitAck(vex, 'inventory:take', {
        fromTokenId: ricoTokenId,
        toCharacterId: vexCharacterId,
        items: [{ list: 'gear', rowId: 'whatever' }],
      }),
    ).toEqual({ ok: false, error: 'NOT_YOURS' });
  });

  it('gracz nie przeszuka figury, która stoi na nogach', async () => {
    const standing = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Wartownik' }),
      'character:create',
    );
    await emitAck(gm, 'character:update', {
      characterId: standing.id,
      patch: { data: { gear: [gearRow('g-guard', 1)] } },
    });
    guardTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Wartownik',
        x: 2 * PX_PER_M,
        y: 0,
        characterId: standing.id,
      }),
      'token:create',
    ).id;
    expect(
      await emitAck(vex, 'inventory:take', {
        fromTokenId: guardTokenId,
        toCharacterId: vexCharacterId,
        items: [{ list: 'gear', rowId: 'g-guard' }],
      }),
    ).toEqual({ ok: false, error: 'STILL_STANDING' });
    // …i nie widzi go na liście źródeł, choć stoi tuż obok.
    const sources = data(
      await emitAck<InventorySourcesResult>(vex, 'inventory:sources', {
        characterId: vexCharacterId,
      }),
      'inventory:sources',
    );
    expect(sources.sources.some((row) => row.name === 'Wartownik')).toBe(false);
  });

  it('odejście od ciała odcina łup — zasięg to długość ramienia', async () => {
    expect(
      (
        await emitAck(gm, 'token:move', {
          tokenId: vexTokenId,
          x: 30 * PX_PER_M,
          y: 0,
          final: true,
        })
      ).ok,
    ).toBe(true);
    expect(
      await emitAck(vex, 'inventory:take', {
        fromTokenId: gangerTokenId,
        toCharacterId: vexCharacterId,
        items: [{ list: 'gear', rowId: 'g-ganger' }],
      }),
    ).toEqual({ ok: false, error: 'OUT_OF_REACH' });
    expect(
      (await emitAck(gm, 'token:move', { tokenId: vexTokenId, x: 0, y: 0, final: true })).ok,
    ).toBe(true);
  });

  it('przekazanie graczowi czeka na „Przyjmij" i dopiero wtedy rusza karty', async () => {
    const ricoCard = waitFor<ChatMessageBroadcast>(rico, 'chat:message');
    const ack = data(
      await emitAck<{ messageId: number }>(vex, 'inventory:give', {
        fromCharacterId: vexCharacterId,
        toCharacterId: ricoCharacterId,
        items: [{ list: 'gear', rowId: 'g-vex', qty: 2 }],
        note: 'za opatrunek',
      }),
      'inventory:give',
    );
    const offered = (await ricoCard).message;
    expect(offered.inventory?.resolution).toBeUndefined();
    expect(offered.inventory?.note).toBe('za opatrunek');
    expect(offered.inventory?.lines).toEqual(['Stimpak × 2']);

    // Nic się jeszcze nie ruszyło — propozycja to nie przelew.
    expect((await sheetOf(rico, ricoCharacterId)).gear).toEqual([]);

    const update = waitFor<ChatMessageBroadcast>(vex, 'chat:update');
    expect(
      (await emitAck(rico, 'inventory:respond', { messageId: ack.messageId, accept: true })).ok,
    ).toBe(true);
    expect((await update).message.inventory?.resolution?.kind).toBe('accepted');
    expect((await sheetOf(rico, ricoCharacterId)).gear[0]?.qty).toBe(2);
    expect((await sheetOf(vex, vexCharacterId)).gear[0]?.qty).toBe(2);

    // Drugie „Przyjmij" nie przeniesie tego samego dwa razy.
    expect(
      await emitAck(rico, 'inventory:respond', { messageId: ack.messageId, accept: true }),
    ).toEqual({ ok: false, error: 'OFFER_CLOSED' });
  });

  it('karta przekazania PRZEŻYWA przeładowanie u obu stron', async () => {
    // `visibleTo` jest białą listą rodzajów, a wiersza, którego na niej nie ma,
    // historia nie zwraca — tak zginęły `time` (37) i `recovery` (30b).
    // `inventory` jedzie wzorem szeptu: autor przez `authorId`, odbiorca przez
    // `recipientId`, MG przez białą listę.
    const freshVex = createSocket(vexCookie);
    const freshRico = createSocket(ricoCookie);
    const freshGm = createSocket(gmCookie);
    const [vexSync, ricoSync, gmSync] = await Promise.all([
      freshVex.firstSync,
      freshRico.firstSync,
      freshGm.firstSync,
    ]);
    expect(vexSync.messages.filter((m) => m.kind === 'inventory').length).toBeGreaterThan(0);
    expect(ricoSync.messages.filter((m) => m.kind === 'inventory').length).toBeGreaterThan(0);
    // MG rozlicza każde przeniesienie, także takie, o które go nikt nie pytał.
    expect(gmSync.messages.filter((m) => m.kind === 'inventory').length).toBeGreaterThanOrEqual(
      vexSync.messages.filter((m) => m.kind === 'inventory').length,
    );
  });

  it('odrzucenie zamyka propozycję i nie rusza żadnej karty', async () => {
    const before = (await sheetOf(vex, vexCharacterId)).gear[0]?.qty;
    const ack = data(
      await emitAck<{ messageId: number }>(vex, 'inventory:give', {
        fromCharacterId: vexCharacterId,
        toCharacterId: ricoCharacterId,
        items: [{ list: 'gear', rowId: 'g-vex', qty: 1 }],
      }),
      'inventory:give',
    );
    expect(
      (await emitAck(rico, 'inventory:respond', { messageId: ack.messageId, accept: false })).ok,
    ).toBe(true);
    expect((await sheetOf(vex, vexCharacterId)).gear[0]?.qty).toBe(before);
    expect(
      await emitAck(rico, 'inventory:respond', { messageId: ack.messageId, accept: true }),
    ).toEqual({ ok: false, error: 'OFFER_CLOSED' });
  });

  it('wysyłający wycofuje własną propozycję, postronny nie tknie jej wcale', async () => {
    const ack = data(
      await emitAck<{ messageId: number }>(vex, 'inventory:give', {
        fromCharacterId: vexCharacterId,
        toCharacterId: ricoCharacterId,
        items: [{ list: 'gear', rowId: 'g-vex', qty: 1 }],
      }),
      'inventory:give',
    );
    // Vex nie jest odbiorcą, więc „Przyjmij" mu nie wolno…
    expect(
      await emitAck(vex, 'inventory:respond', { messageId: ack.messageId, accept: true }),
    ).toEqual({ ok: false, error: 'OFFER_NOT_YOURS' });
    // …a wycofać własną propozycję już tak.
    expect(
      (await emitAck(vex, 'inventory:respond', { messageId: ack.messageId, accept: false })).ok,
    ).toBe(true);
  });

  it('gracz nie oddaje z cudzej karty', async () => {
    expect(
      await emitAck(rico, 'inventory:give', {
        fromCharacterId: vexCharacterId,
        toCharacterId: ricoCharacterId,
        items: [{ list: 'gear', rowId: 'g-vex' }],
      }),
    ).toEqual({ ok: false, error: 'CHARACTER_NOT_FOUND' });
  });

  it('oddanie na kartę BEZ właściciela idzie od ręki — nie ma kogo pytać o zgodę', async () => {
    const totalGear = (data: CpredCharacterData) =>
      data.gear.reduce((sum, row) => sum + row.qty, 0);
    const before = totalGear(await sheetOf(gm, gangerCharacterId));
    const ack = data(
      await emitAck<{ messageId: number; pending: boolean }>(vex, 'inventory:give', {
        fromCharacterId: vexCharacterId,
        toCharacterId: gangerCharacterId,
        items: [{ list: 'gear', rowId: 'g-vex', qty: 1 }],
      }),
      'inventory:give',
    );
    expect(ack.pending).toBe(false);
    // Wiersz się nie mnoży, tylko rośnie: to ta sama pozycja katalogu.
    expect(totalGear(await sheetOf(gm, gangerCharacterId))).toBe(before + 1);
  });

  it('MG przenoszący na kartę gracza wystawia propozycję, a nie przelew', async () => {
    const ack = data(
      await emitAck<{ messageId: number; pending: boolean }>(gm, 'inventory:give', {
        fromCharacterId: gangerCharacterId,
        toCharacterId: ricoCharacterId,
        items: [{ list: 'gear', rowId: 'g-ganger' }],
      }),
      'inventory:give',
    );
    expect(ack.pending).toBe(true);
    // Rico ma właściciela, więc ta propozycja czeka…
    expect((await sheetOf(gm, gangerCharacterId)).gear.length).toBeGreaterThan(0);
    expect(
      (await emitAck(gm, 'inventory:respond', { messageId: ack.messageId, accept: true })).ok,
    ).toBe(true);
    expect((await sheetOf(gm, gangerCharacterId)).gear).toEqual([]);
  });

  it('odmawia pustego żądania i pozycji, której nie ma', async () => {
    expect(
      await emitAck(vex, 'inventory:give', {
        fromCharacterId: vexCharacterId,
        toCharacterId: ricoCharacterId,
        items: [],
      }),
    ).toEqual({ ok: false, error: 'NO_ITEMS' });
    expect(
      await emitAck(vex, 'inventory:give', {
        fromCharacterId: vexCharacterId,
        toCharacterId: ricoCharacterId,
        items: [{ list: 'weapons', rowId: 'nie-ma' }],
      }),
    ).toEqual({ ok: false, error: 'ITEM_NOT_FOUND' });
  });
});
