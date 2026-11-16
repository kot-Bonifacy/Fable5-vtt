import { createDefaultCharacterData } from '@vtt/shared';
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
  EconomyHistoryResult,
  MerchantConfigResult,
  MerchantDealResult,
  MerchantViewResult,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenView,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { joinUrl } from './test-join.js';

/**
 * Etap 71e — handel i pieniądze po weryfikacji Ról (G20–G23, G25, G26, P6), na
 * żywych gniazdach. Arytmetykę targu liczy `shared/.../haggling.test.ts`; tu szew:
 * suma drugiej strony z karty handlarza, blokada drugiego rzutu, rata na karcie
 * i jej termin, opłata za następcę, figura pracownika obok Korpo i Lojalność po
 * zamknięciu sesji.
 *
 * (Nagłówek niżej odziedziczony z testów handlarzy 46a.)
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

/** Pełny blok Cech — łata karty nie przyjmie samej CHA. */
const BASE_STATS = createDefaultCharacterData().stats;

describe('71e: handel i pieniądze', () => {
  let gm: ClientSocket;
  let vex: ClientSocket;
  let rico: ClientSocket;
  let vexId: string;
  let ricoId: string;
  let korpoId: string;
  let wiktorId: string;
  let merchantId: string;
  let budkaMerchantId: string;
  let sceneId: string;

  const deal = (
    socket: ClientSocket,
    characterId: string,
    body: { buy?: unknown[]; sell?: unknown[]; expectTotal: number },
  ) =>
    emitAck<MerchantDealResult>(socket, 'merchant:deal', {
      merchantId,
      characterId,
      buy: body.buy ?? [],
      sell: body.sell ?? [],
      expectTotal: body.expectTotal,
    });

  /** Fixer Vex wygrywa targ przy ladzie Wiktora — MG zdejmuje przegrany rzut i próbuje dalej. */
  async function vexStrikes(dealId: string): Promise<void> {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const result = data(
        await emitAck<{ won: boolean }>(vex, 'character:haggle', {
          characterId: vexId,
          dealId,
          merchantId,
        }),
        'character:haggle',
      );
      if (result.won) return;
      await emitAck(gm, 'character:haggle', { characterId: vexId, clear: true });
    }
    throw new Error('Vex nie wygrał targu w sześciu próbach');
  }

  it('stawia ladę: Wiktor (Fixer 4) i Budka bez Znajomości, Vex (Fixer 9), Rico i Korpo', async () => {
    const gmConn = createSocket(gmCookie);
    const vexConn = createSocket(vexCookie);
    const ricoConn = createSocket(ricoCookie);
    gm = gmConn.socket;
    vex = vexConn.socket;
    rico = ricoConn.socket;
    await Promise.all([gmConn.firstSync, vexConn.firstSync, ricoConn.firstSync]);

    const create = async (body: object, patch: object) => {
      const id = data(await emitAck<CharacterView>(gm, 'character:create', body), 'create').id;
      data(
        await emitAck(gm, 'character:update', { characterId: id, patch: { data: patch } }),
        'patch',
      );
      return id;
    };
    const zgrzyt = {
      id: 'w-zgrzyt',
      name: 'Zgrzyt 9',
      notes: '',
      compendiumId: 'weapon.zgrzyt-9',
      damage: '2k6',
      ammoCurrent: 12,
      ammoMax: 12,
      ammoType: 'Pistoletowa',
      rof: '2',
    };
    vexId = await create(
      { name: 'Vex', ownerId: vexUserId },
      {
        roleId: 'fixer',
        roleAbilityRank: 9,
        stats: { ...BASE_STATS, cool: 8 },
        skills: { trading: 6 },
      },
    );
    ricoId = await create({ name: 'Rico', ownerId: ricoUserId }, { weapons: [zgrzyt] });
    korpoId = await create(
      { name: 'Pani Prezes', ownerId: ricoUserId },
      { roleId: 'exec', roleAbilityRank: 5 },
    );
    wiktorId = await create(
      { name: 'Wiktor' },
      {
        roleId: 'fixer',
        roleAbilityRank: 4,
        stats: { ...BASE_STATS, cool: 6 },
        skills: { trading: 4 },
        gear: [
          {
            id: 'g-apt',
            name: 'Apteczka polowa',
            notes: '',
            compendiumId: 'gear.apteczka-polowa',
            qty: 20,
          },
          {
            id: 'g-lux',
            name: 'Złoty zegarek',
            notes: '',
            compendiumId: 'gear.apteczka-polowa',
            qty: 5,
          },
        ],
      },
    );
    const budkaId = await create({ name: 'Budka' }, {});
    await emitAck(gm, 'economy:adjust', { characterId: vexId, balance: 20_000 });
    await emitAck(gm, 'economy:adjust', { characterId: wiktorId, balance: 50_000 });
    await emitAck(gm, 'economy:adjust', { characterId: korpoId, balance: 100 });

    merchantId = data(
      await emitAck<MerchantConfigResult>(gm, 'merchant:config', {
        characterId: wiktorId,
        merchant: { sign: 'Wiktor', access: 'remote', open: true, priceMul: 100, buyBackPct: 50 },
      }),
      'merchant:config',
    ).merchantId!;
    budkaMerchantId = data(
      await emitAck<MerchantConfigResult>(gm, 'merchant:config', {
        characterId: budkaId,
        merchant: { sign: 'Budka', access: 'remote', open: true },
      }),
      'merchant:config',
    ).merchantId!;
    // Zegarek za 6000 ed — rzecz Luksusowa (cena MG na nakładce).
    expect(
      (
        await emitAck(gm, 'merchant:row', {
          merchantId,
          list: 'gear',
          rowId: 'g-lux',
          overlay: { price: 6000 },
        })
      ).ok,
    ).toBe(true);

    const scene = data(await emitAck<SceneView>(gm, 'scene:create', { name: 'Biuro' }), 'scene');
    sceneId = scene.id;
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'open' });
    await emitAck(gm, 'scene:activate', { sceneId });
    data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Pani Prezes',
        x: 5 * PX_PER_M,
        y: 5 * PX_PER_M,
        ownerId: ricoUserId,
        characterId: korpoId,
      }),
      'token:create',
    );
  });

  it('G20 FIX-14 półka mówi o cięciu skupu; nie-Fixer rzuca raz przy ladzie, transakcja zdejmuje rzut', async () => {
    const view = data(
      await emitAck<MerchantViewResult>(rico, 'merchant:view', { merchantId }),
      'merchant:view',
    );
    expect(view.merchant.saleCut).toBe(10);

    const card = waitFor<ChatMessageBroadcast>(rico, 'chat:message');
    const roll = data(
      await emitAck<{ won: boolean; dealId: string | null }>(rico, 'character:haggle', {
        characterId: ricoId,
        merchantId,
      }),
      'character:haggle',
    );
    expect(roll.dealId).toBeNull();
    const message = (await card).message;
    // Druga strona z karty Wiktora: CHA 6 + Znajomości 4 (rejestr testowy bez
    // danych prywatnych nie zna Umiejętności Handel — łata ją pomija).
    expect(message.roll?.opposed?.detail).toContain('Wiktor: 10 + 1k10');
    expect((await sheetOf(rico, ricoId)).counterHaggle).toMatchObject({
      merchantId,
      won: roll.won,
    });
    expect(await emitAck(rico, 'character:haggle', { characterId: ricoId, merchantId })).toEqual({
      ok: false,
      error: 'ALREADY_HAGGLED',
    });

    // Zgrzyt: 500 × 50% = 250; przegrany oddaje Wiktorowi 10%.
    const total = roll.won ? -250 : -225;
    expect(
      data(
        await deal(rico, ricoId, {
          sell: [{ list: 'weapons', rowId: 'w-zgrzyt' }],
          expectTotal: total,
        }),
        'deal',
      ).total,
    ).toBe(total);
    expect((await sheetOf(rico, ricoId)).counterHaggle).toBeNull();
  });

  it('G20 u handlarza bez Znajomości nie-Fixer nie ma o co rzucać; łata nie podrobi rzutu', async () => {
    expect(
      await emitAck(rico, 'character:haggle', { characterId: ricoId, merchantId: budkaMerchantId }),
    ).toEqual({ ok: false, error: 'NOTHING_TO_HAGGLE' });
    expect(
      await emitAck(gm, 'character:update', {
        characterId: vexId,
        patch: { data: { counterHaggle: { merchantId, won: true, note: '' } } },
      }),
    ).toEqual({ ok: false, error: 'FORBIDDEN' });
  });

  it('G23 pół teraz, pół za miesiąc: połowa na ratę z terminem, spłata z karty', async () => {
    await vexStrikes('halfLater');
    const struck = (await sheetOf(vex, vexId)).haggle;
    expect(struck).toMatchObject({ dealId: 'halfLater', merchantId });

    const before = (await sheetOf(vex, vexId)).eddies;
    expect(
      data(
        await deal(vex, vexId, {
          buy: [{ list: 'gear', rowId: 'g-lux', qty: 1 }],
          expectTotal: 3000,
        }),
        'deal',
      ).balance,
    ).toBe(before - 3000);
    const after = await sheetOf(vex, vexId);
    expect(after.haggle).toBeNull();
    expect(after.counterHaggle).toBeNull();
    expect(after.debts).toHaveLength(1);
    expect(after.debts[0]).toMatchObject({ amount: 3000, creditor: 'Wiktor' });

    expect(
      await emitAck(gm, 'character:update', { characterId: vexId, patch: { data: { debts: [] } } }),
    ).toEqual({ ok: false, error: 'FORBIDDEN' });
    const debtId = after.debts[0]!.id;
    expect(
      await emitAck(vex, 'character:debt', { characterId: vexId, debtId, action: 'forgive' }),
    ).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(
      (await emitAck(vex, 'character:debt', { characterId: vexId, debtId, action: 'pay' })).ok,
    ).toBe(true);
    const paid = await sheetOf(vex, vexId);
    expect(paid.debts).toEqual([]);
    expect(paid.eddies).toBe(before - 6000);
    const ledger = await ledgerOf(vex, vexId);
    expect(ledger.some((row) => row.label.startsWith('Rata: Wiktor'))).toBe(true);
  });

  it('G23 niespłacona rata po terminie zamyka targ na zawsze i pisze MG', async () => {
    await vexStrikes('halfLater');
    await deal(vex, vexId, { buy: [{ list: 'gear', rowId: 'g-lux', qty: 1 }], expectTotal: 3000 });
    const due = (await sheetOf(vex, vexId)).debts[0]!.dueAtMinute;
    const heard = collect<ChatMessageBroadcast>(gm, 'chat:message');
    expect((await emitAck(gm, 'time:set', { minutes: due + 60 })).ok).toBe(true);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
    expect(heard.some((row) => row.message.text.includes('minął termin raty'))).toBe(true);
    const sheet = await sheetOf(vex, vexId);
    expect(sheet.halfLaterClosed).toBe(true);
    expect(sheet.debts[0]!.overdue).toBe(true);
    expect(
      await emitAck(vex, 'character:haggle', {
        characterId: vexId,
        dealId: 'halfLater',
        merchantId,
      }),
    ).toEqual({ ok: false, error: 'DEAL_CLOSED' });
  });

  it('G21 G22 szósta sztuka gratis; targ procentowy podnosi sprzedaż', async () => {
    await emitAck(gm, 'character:haggle', { characterId: vexId, clear: true });
    await vexStrikes('sixthFree');
    // 6 apteczek × 150 ed, jedna gratis.
    expect(
      data(
        await deal(vex, vexId, {
          buy: [{ list: 'gear', rowId: 'g-apt', qty: 6 }],
          expectTotal: 750,
        }),
        'deal',
      ).total,
    ).toBe(750);
    await vexStrikes('percent20');
    // Apteczka z powrotem: 150 × 50% = 75 (Vex wygrał rzut — bez cięcia), +20% = 90.
    const apt = (await sheetOf(vex, vexId)).gear.find(
      (row) => row.compendiumId === 'gear.apteczka-polowa',
    )!;
    expect(
      data(
        await deal(vex, vexId, {
          sell: [{ list: 'gear', rowId: apt.id, qty: 1 }],
          expectTotal: -90,
        }),
        'deal',
      ).total,
    ).toBe(-90);
  });

  it('P6 G26 pracownik staje obok Korpo; następca kosztuje 200 ed z karty', async () => {
    const hired = data(
      await emitAck<CharacterView>(rico, 'character:team-hire', {
        characterId: korpoId,
        professionId: 'bodyguard',
        name: 'Bodzio',
      }),
      'team-hire',
    );
    const memberId = (hired.data as CpredCharacterData).team[0]!.characterId;
    const tokens = await built.prisma.token.findMany({ where: { sceneId } });
    const boss = tokens.find((token) => token.characterId === korpoId)!;
    const worker = tokens.find((token) => token.characterId === memberId);
    expect(worker, 'figura pracownika na aktywnej scenie').toBeDefined();
    const dx = Math.abs(worker!.x - boss.x);
    const dy = Math.abs(worker!.y - boss.y);
    expect(dx + dy).toBeGreaterThan(0);
    expect(Math.max(dx, dy)).toBeLessThanOrEqual(PX_PER_M * 2);

    // 100 ed na karcie — HR nie przysyła następcy na kredyt.
    expect(
      await emitAck(rico, 'character:team-hire', {
        characterId: korpoId,
        professionId: 'driver',
        name: 'Szofer',
        replacement: true,
      }),
    ).toEqual({ ok: false, error: 'NOT_ENOUGH_EDDIES' });
    await emitAck(gm, 'economy:adjust', { characterId: korpoId, balance: 1000 });
    const second = data(
      await emitAck<CharacterView>(rico, 'character:team-hire', {
        characterId: korpoId,
        professionId: 'driver',
        name: 'Szofer',
        replacement: true,
      }),
      'team-hire',
    );
    const sheet = second.data as CpredCharacterData;
    expect(sheet.eddies).toBe(800);
    expect(sheet.team.find((row) => row.name === 'Szofer')?.loyalty).toBe(1);
    const ledger = await ledgerOf(rico, korpoId);
    expect(ledger.some((row) => row.label.includes('opłata manipulacyjna'))).toBe(true);
  });

  it('G25 koniec sesji: ścięcie do 10, propozycja −1 bez wzrostu, przypomnienie o odejściu', async () => {
    const team = (await sheetOf(gm, korpoId)).team;
    const [bodzio, szofer] = [team[0]!, team[1]!];
    const change = (memberId: string, changeId: string) =>
      emitAck(gm, 'character:team-loyalty', { characterId: korpoId, memberId, changeId });
    // Bodzio: +8 +8 → ponad 10. Szofer: −2 → −1, bez wzrostu.
    await change(bodzio.characterId, 'risk');
    await change(bodzio.characterId, 'risk');
    await change(szofer.characterId, 'criticism');
    expect((await sheetOf(gm, korpoId)).team[0]!.grew).toBe(true);

    expect((await emitAck(gm, 'session:start', { campaignId })).ok).toBe(true);
    const heard = collect<ChatMessageBroadcast>(gm, 'chat:message');
    expect((await emitAck(gm, 'session:end', { campaignId })).ok).toBe(true);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
    const after = (await sheetOf(gm, korpoId)).team;
    expect(after[0]).toMatchObject({ loyalty: 10 });
    expect(after[0]).not.toHaveProperty('grew');
    expect(after[0]).not.toHaveProperty('neglectDue');
    expect(after[1]).toMatchObject({ loyalty: -1, neglectDue: true });
    const line = heard.find((row) => row.message.text.startsWith('Koniec sesji — zespół'));
    expect(line?.message.text).toContain('Bodzio');
    expect(line?.message.text).toContain('propozycja −1');
    expect(line?.message.text).toContain('odchodzi');

    // MG pomija propozycję — znacznik schodzi, Lojalność zostaje.
    expect(
      (
        await emitAck(gm, 'character:team-loyalty', {
          characterId: korpoId,
          memberId: szofer.characterId,
          dismissNeglect: true,
        })
      ).ok,
    ).toBe(true);
    const settled = (await sheetOf(gm, korpoId)).team[1]!;
    expect(settled.loyalty).toBe(-1);
    expect(settled).not.toHaveProperty('neglectDue');
  });
});
