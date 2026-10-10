import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  CampaignSummary,
  CharacterView,
  ChatMessageBroadcast,
  CpredCharacterData,
  CyberwareSurgeonsResult,
  EconomyHistoryResult,
  SocketAck,
  StateSyncPayload,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { joinUrl } from './test-join.js';

/**
 * Prośba o operację u Medyka innego gracza (#41, 30.09.2026), na żywych gniazdach.
 *
 * Pacjent (Kowal, gracz Marek) prosi Medyka (Iskra, graczka Ola); Iskra podaje
 * cenę. Cena nie wyższa od domyślnej operuje od razu, wyższa czeka na zgodę
 * pacjenta, a cała kwota jedzie na kartę Medyka. Test montażu rzuca się za
 * Iskrę; kości ustawia skrypt (`VTT_DICE_SCRIPT`), żeby wynik nie zależał od
 * losowania.
 */

const TEST_DB = `./.test-${randomBytes(6).toString('hex')}.db`;
const GM_PASSWORD = 'test-haslo';
const DICE = join(mkdtempSync(join(tmpdir(), 'vtt-dice-')), 'dice.txt');
/** Tatuaż z galerii: PT 13, 100 ed (i montaż znalezionego — też 100), bez Utraty Człowieczeństwa. */
const TATTOO = 'cyberware.tatuaz-przykladowy';

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
const cookies: Record<'gm' | 'marek' | 'ola' | 'obcy', string> = {
  gm: '',
  marek: '',
  ola: '',
  obcy: '',
};
const userIds: Record<'marek' | 'ola' | 'obcy', string> = { marek: '', ola: '', obcy: '' };
const openSockets: ClientSocket[] = [];
const previousDiceScript = process.env.VTT_DICE_SCRIPT;

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

/** Zbiera wszystko, co przyjdzie danym zdarzeniem, do chwili wywołania `stop`. */
function collect<T>(socket: ClientSocket, event: string): { seen: T[]; stop: () => T[] } {
  const seen: T[] = [];
  const listener = (payload: T) => seen.push(payload);
  socket.on(event, listener);
  return {
    seen,
    stop: () => {
      socket.off(event, listener);
      return seen;
    },
  };
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

async function sheetOf(socket: ClientSocket, characterId: string): Promise<CpredCharacterData> {
  const view = data(
    await emitAck<CharacterView>(socket, 'character:update', { characterId, patch: {} }),
    'character:update',
  );
  return view.data as CpredCharacterData;
}

function scriptDice(faces: number[]): void {
  writeFileSync(DICE, faces.join(' '));
}

async function joinAs(token: string, name: 'Marek' | 'Ola' | 'Obcy') {
  const res = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, token, name),
  });
  const key = name.toLowerCase() as 'marek' | 'ola' | 'obcy';
  cookies[key] = cookieOf(res.headers['set-cookie']);
  userIds[key] = (res.json() as { user: { id: string } }).user.id;
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
  cookies.gm = cookieOf(login.headers['set-cookie']);
  const campaignRes = await built.app.inject({
    method: 'POST',
    url: '/api/campaigns',
    headers: { cookie: cookies.gm },
    payload: { name: 'Klinika' },
  });
  const campaignId = (campaignRes.json() as CampaignSummary).id;
  // Etap 44b: linki są imienne — wystawia je `joinUrl` przy każdym wejściu.
  const token = campaignId;
  await joinAs(token, 'Marek');
  await joinAs(token, 'Ola');
  await joinAs(token, 'Obcy');
}, 60_000);

afterAll(async () => {
  for (const socket of openSockets) socket.disconnect();
  await built.app.close();
  if (previousDiceScript === undefined) delete process.env.VTT_DICE_SCRIPT;
  else process.env.VTT_DICE_SCRIPT = previousDiceScript;
  try {
    unlinkSync(TEST_DB);
  } catch {
    // best effort — Windows potrafi jeszcze trzymać plik
  }
});

describe('prośba o operację u Medyka innego gracza (#41)', () => {
  let gm: ClientSocket;
  let marek: ClientSocket;
  let ola: ClientSocket;
  let obcy: ClientSocket;
  let kowalId: string;
  let iskraId: string;

  async function request(payment: 'full' | 'installOnly' = 'full'): Promise<number> {
    return data(
      await emitAck<{ messageId: number }>(marek, 'cyberware:request', {
        patientId: kowalId,
        surgeonId: iskraId,
        entryId: TATTOO,
        payment,
      }),
      'cyberware:request',
    ).messageId;
  }

  it('stawia pacjenta Kowala (Marek) i Medyczkę Iskrę z Chirurgią (Ola)', async () => {
    const conns = {
      gm: createSocket(cookies.gm),
      marek: createSocket(cookies.marek),
      ola: createSocket(cookies.ola),
      obcy: createSocket(cookies.obcy),
    };
    gm = conns.gm.socket;
    marek = conns.marek.socket;
    ola = conns.ola.socket;
    obcy = conns.obcy.socket;
    await Promise.all(Object.values(conns).map((conn) => conn.firstSync));

    const create = async (name: string, ownerId: string) =>
      data(
        await emitAck<CharacterView>(gm, 'character:create', { name, ownerId }),
        'character:create',
      ).id;
    kowalId = await create('Kowal', userIds.marek);
    iskraId = await create('Iskra', userIds.ola);
    await emitAck(gm, 'character:update', {
      characterId: kowalId,
      patch: { data: { eddies: 10_000, humanityCurrent: 60 } },
    });
    await emitAck(gm, 'character:update', {
      characterId: iskraId,
      patch: { data: { roleId: 'medtech', roleAbilityRank: 3, medicine: { surgery: 3 } } },
    });
  });

  it('pacjent widzi Medyków innych graczy; własnym Medykiem przez tę listę nie prosi', async () => {
    const result = data(
      await emitAck<CyberwareSurgeonsResult>(marek, 'cyberware:surgeons', { patientId: kowalId }),
      'cyberware:surgeons',
    );
    expect(result.surgeons.map((row) => row.name)).toEqual(['Iskra']);
    expect(result.surgeons[0]?.surgery).toBeGreaterThan(0);
    // Cudza karta jako pacjent — ta sama odmowa, co wszędzie.
    expect(await emitAck(obcy, 'cyberware:surgeons', { patientId: kowalId })).toEqual({
      ok: false,
      error: 'CHARACTER_NOT_FOUND',
    });
  });

  it('montaż wprost z cudzym Medykiem dalej odpada — drogą jest prośba', async () => {
    expect(
      await emitAck(marek, 'character:cyberware', {
        characterId: kowalId,
        action: 'install',
        entryId: TATTOO,
        payment: 'full',
        surgeon: { kind: 'character', characterId: iskraId },
      }),
    ).toEqual({ ok: false, error: 'CHARACTER_NOT_FOUND' });
  });

  it('prośba dochodzi do Medyka i MG, obcy jej nie widzi i nie tknie', async () => {
    const olaCard = waitFor<ChatMessageBroadcast>(ola, 'chat:message');
    const gmCard = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    const stranger = collect<ChatMessageBroadcast>(obcy, 'chat:message');
    const messageId = await request();
    const card = (await olaCard).message;
    expect(card.kind).toBe('surgery');
    expect(card.surgery).toMatchObject({
      patientName: 'Kowal',
      surgeonName: 'Iskra',
      defaultPrice: 1000, // 100 ed w próbce, ×10 w cenniku domowym (etap 47a)
      dv: 13,
    });
    expect((await gmCard).message.id).toBe(messageId);
    expect(stranger.stop()).toEqual([]);

    // Pacjent nie operuje, obcy nie wycofa; MG odmawia za Medyka.
    expect(
      await emitAck(marek, 'cyberware:respond', { messageId, action: 'operate', price: 0 }),
    ).toEqual({ ok: false, error: 'SURGERY_NOT_YOURS' });
    expect(await emitAck(obcy, 'cyberware:respond', { messageId, action: 'cancel' })).toEqual({
      ok: false,
      error: 'SURGERY_NOT_YOURS',
    });
    expect((await emitAck(gm, 'cyberware:respond', { messageId, action: 'decline' })).ok).toBe(
      true,
    );
    expect(
      await emitAck(ola, 'cyberware:respond', { messageId, action: 'operate', price: 0 }),
    ).toEqual({ ok: false, error: 'SURGERY_CLOSED' });
  });

  it('Medyk operuje za darmo: Test za Iskrę, wszczep u Kowala, nikt nie płaci', async () => {
    const messageId = await request();
    const before = await sheetOf(gm, kowalId);
    const update = waitFor<ChatMessageBroadcast>(marek, 'chat:update');
    const rolls = collect<ChatMessageBroadcast>(marek, 'chat:message');
    scriptDice([9]);
    const ack = data(
      await emitAck<{ pending: boolean }>(ola, 'cyberware:respond', {
        messageId,
        action: 'operate',
        price: 0,
      }),
      'cyberware:respond',
    );
    expect(ack.pending).toBe(false);
    expect((await update).message.surgery?.resolution).toMatchObject({
      kind: 'operated',
      byName: 'Ola',
      price: 0,
    });
    const test = rolls.stop().find((row) => row.message.roll?.title?.startsWith('Montaż'));
    expect(test?.message.roll?.actor).toBe('Iskra');
    expect(test?.message.roll?.outcome?.success).toBe(true);

    const after = await sheetOf(gm, kowalId);
    expect(after.cyberware.length).toBe(before.cyberware.length + 1);
    expect(after.eddies).toBe(before.eddies);
    expect((await sheetOf(gm, iskraId)).eddies).toBe(0);
    // Drugie „Operuję" nie zoperuje drugi raz.
    expect(
      await emitAck(ola, 'cyberware:respond', { messageId, action: 'operate', price: 0 }),
    ).toEqual({ ok: false, error: 'SURGERY_CLOSED' });
  });

  it('etap 48c: „Znaleziony” bez wszczepu w Wyposażeniu — prośby nie ma', async () => {
    expect(
      await emitAck(marek, 'cyberware:request', {
        patientId: kowalId,
        surgeonId: iskraId,
        entryId: TATTOO,
        payment: 'installOnly',
      }),
    ).toEqual({ ok: false, error: 'CYBERWARE_NOT_IN_GEAR' });
  });

  it('cena poniżej domyślnej operuje od razu, a pieniądze jadą na kartę Medyka', async () => {
    // Etap 48c: znaleziony wszczep leży w Wyposażeniu pacjenta (od MG).
    const gear = (await sheetOf(gm, kowalId)).gear;
    expect(
      (
        await emitAck(gm, 'character:update', {
          characterId: kowalId,
          patch: {
            data: {
              gear: [
                ...gear,
                { id: 'found', name: 'Tatuaż', notes: '', compendiumId: TATTOO, qty: 1 },
              ],
            },
          },
        })
      ).ok,
    ).toBe(true);
    const messageId = await request('installOnly');
    scriptDice([9]);
    const ack = data(
      await emitAck<{ pending: boolean }>(ola, 'cyberware:respond', {
        messageId,
        action: 'operate',
        price: 600,
      }),
      'cyberware:respond',
    );
    expect(ack.pending).toBe(false);
    expect((await sheetOf(gm, kowalId)).eddies).toBe(9400);
    expect((await sheetOf(gm, iskraId)).eddies).toBe(600);
    // Wszczep zszedł z plecaka — za robociznę montuje się go raz.
    expect((await sheetOf(gm, kowalId)).gear.some((row) => row.compendiumId === TATTOO)).toBe(
      false,
    );
    const ledger = data(
      await emitAck<EconomyHistoryResult>(ola, 'economy:history', { characterId: iskraId }),
      'economy:history',
    );
    expect(ledger.entries[0]).toMatchObject({ kind: 'transfer', amount: 600 });
    expect(ledger.entries[0]?.label).toContain('Kowal');
  });

  it('cena wyższa od domyślnej czeka na zgodę pacjenta', async () => {
    const messageId = await request();
    const quoted = waitFor<ChatMessageBroadcast>(marek, 'chat:update');
    const ack = data(
      await emitAck<{ pending: boolean }>(ola, 'cyberware:respond', {
        messageId,
        action: 'operate',
        price: 3000,
      }),
      'cyberware:respond',
    );
    expect(ack.pending).toBe(true);
    expect((await quoted).message.surgery?.quote).toBe(3000);
    // Nic się jeszcze nie stało — wycena to nie operacja.
    expect((await sheetOf(gm, kowalId)).eddies).toBe(9400);
    // Medyk nie przebije własnej wyceny drugim „Operuję”.
    expect(
      await emitAck(ola, 'cyberware:respond', { messageId, action: 'operate', price: 0 }),
    ).toEqual({ ok: false, error: 'SURGERY_QUOTED' });
    // Zgodę daje pacjent, nie Medyk.
    expect(await emitAck(ola, 'cyberware:respond', { messageId, action: 'approve' })).toEqual({
      ok: false,
      error: 'SURGERY_NOT_YOURS',
    });

    scriptDice([9]);
    expect((await emitAck(marek, 'cyberware:respond', { messageId, action: 'approve' })).ok).toBe(
      true,
    );
    expect((await sheetOf(gm, kowalId)).eddies).toBe(6400);
    expect((await sheetOf(gm, iskraId)).eddies).toBe(3600);
  });

  it('pacjent wycofuje prośbę albo odrzuca wycenę', async () => {
    const first = await request();
    expect(
      (await emitAck(marek, 'cyberware:respond', { messageId: first, action: 'cancel' })).ok,
    ).toBe(true);

    const second = await request();
    await emitAck(ola, 'cyberware:respond', {
      messageId: second,
      action: 'operate',
      price: 50_000,
    });
    expect(
      (await emitAck(marek, 'cyberware:respond', { messageId: second, action: 'cancel' })).ok,
    ).toBe(true);
    expect(
      await emitAck(marek, 'cyberware:respond', { messageId: second, action: 'approve' }),
    ).toEqual({ ok: false, error: 'SURGERY_CLOSED' });
    expect((await sheetOf(gm, kowalId)).eddies).toBe(6400);
  });

  it('pacjenta nie stać — prośba zostaje otwarta, Medyk może zejść z ceny', async () => {
    const messageId = await request();
    await emitAck(gm, 'economy:adjust', { characterId: kowalId, balance: 500 });
    expect(
      await emitAck(ola, 'cyberware:respond', { messageId, action: 'operate', price: 1000 }),
    ).toEqual({ ok: false, error: 'NOT_ENOUGH_EDDIES' });
    scriptDice([9]);
    expect(
      (await emitAck(ola, 'cyberware:respond', { messageId, action: 'operate', price: 500 })).ok,
    ).toBe(true);
    expect((await sheetOf(gm, kowalId)).eddies).toBe(0);
  });

  it('MG nie składa prośby — montuje wprost', async () => {
    expect(
      await emitAck(gm, 'cyberware:request', {
        patientId: kowalId,
        surgeonId: iskraId,
        entryId: TATTOO,
        payment: 'full',
      }),
    ).toEqual({ ok: false, error: 'FORBIDDEN' });
  });

  it('karta prośby przeżywa przeładowanie u obu stron i u MG, obcy jej nie ma', async () => {
    const fresh = {
      marek: createSocket(cookies.marek),
      ola: createSocket(cookies.ola),
      gm: createSocket(cookies.gm),
      obcy: createSocket(cookies.obcy),
    };
    const [marekSync, olaSync, gmSync, obcySync] = await Promise.all([
      fresh.marek.firstSync,
      fresh.ola.firstSync,
      fresh.gm.firstSync,
      fresh.obcy.firstSync,
    ]);
    const count = (sync: StateSyncPayload) =>
      sync.messages.filter((m) => m.kind === 'surgery').length;
    expect(count(marekSync)).toBe(7);
    expect(count(olaSync)).toBe(7);
    expect(count(gmSync)).toBe(7);
    expect(count(obcySync)).toBe(0);
  });
});
