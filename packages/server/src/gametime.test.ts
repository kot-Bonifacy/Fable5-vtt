import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  CampaignSummary,
  ChatMessageBroadcast,
  GameTimeAck,
  GameTimeBroadcast,
  InvitationSummary,
  JournalEntryView,
  SocketAck,
  StateSyncPayload,
} from '@vtt/shared';
import { GAME_TIME_DEFAULT, gameMonthKey, gameTimeFromInput, settleDue } from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Etap 37: zegar świata.
 *
 * Testy pilnują trzech rzeczy, dla których ten etap powstał, i **jednej,
 * której nie ma**: zegar podpowiada, ale nigdy nie rządzi. Stąd asercje
 * o saldzie i PW obok asercji o dacie — skok o miesiąc, który sam pobrałby
 * czynsz, przeszedłby naiwny test daty i złamałby jedyną zasadę tego etapu.
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
let campaignId: string;
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

/** Przesunięcie zegara, które ma się udać. */
async function setTime(socket: ClientSocket, payload: unknown): Promise<GameTimeAck> {
  const ack = await emitAck<GameTimeAck>(socket, 'time:set', payload);
  if (!ack.ok || !ack.data) throw new Error(`time:set failed: ${!ack.ok ? ack.error : 'no data'}`);
  return ack.data;
}

/** Stan zegara prosto z bazy — dowód, że zmiana przeżyła handler. */
async function storedTime(): Promise<{ gameTime: number; settledMonth: string | null }> {
  const row = await built.prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    select: { gameTime: true, settledMonth: true },
  });
  return row;
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
    payload: { password: GM_PASSWORD },
  });
  gmCookie = cookieOf(login.headers['set-cookie']);

  const campaignRes = await built.app.inject({
    method: 'POST',
    url: '/api/campaigns',
    headers: { cookie: gmCookie },
    payload: { name: 'Zegar Night City' },
  });
  campaignId = (campaignRes.json() as CampaignSummary).id;

  const inviteRes = await built.app.inject({
    method: 'POST',
    url: `/api/campaigns/${campaignId}/invitations`,
    headers: { cookie: gmCookie },
    payload: {},
  });
  const token = (inviteRes.json() as InvitationSummary).token;
  const join = await built.app.inject({
    method: 'POST',
    url: `/api/join/${token}`,
    payload: { name: 'Tony' },
  });
  playerCookie = cookieOf(join.headers['set-cookie']);
}, 60_000);

afterAll(async () => {
  for (const socket of openSockets) socket.disconnect();
  await built.app.close();
  try {
    unlinkSync(TEST_DB);
  } catch {
    // best effort — Windows may still hold the file
  }
});

describe('zegar świata (etap 37)', () => {
  let gm: ClientSocket;
  let player: ClientSocket;

  it('nowa kampania startuje 1 stycznia 2045 i ma ten miesiąc za rozliczony', async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    const [gmSync, playerSync] = await Promise.all([gmConn.firstSync, playerConn.firstSync]);

    // Zegar jest publiczny: data i pora dnia są wspólne dla stołu.
    expect(gmSync.gameTime).toEqual({ minutes: GAME_TIME_DEFAULT, settledMonth: '2045-01' });
    expect(playerSync.gameTime).toEqual(gmSync.gameTime);
    // Świeży stół nie zaczyna od zaległego czynszu.
    expect(settleDue(gmSync.gameTime)).toBe(false);
  });

  it('gracz zegara nie przesuwa', async () => {
    expect(await emitAck(player, 'time:set', { step: 'hour' })).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
    expect((await storedTime()).gameTime).toBe(GAME_TIME_DEFAULT);
  });

  it('skok liczy serwer z identyfikatora, a nie klient z minut', async () => {
    const ack = await setTime(gm, { step: 'hour' });
    expect(ack.time.minutes).toBe(GAME_TIME_DEFAULT + 60);
    expect(ack.days).toBe(0);
    expect((await storedTime()).gameTime).toBe(GAME_TIME_DEFAULT + 60);

    // Skok, którego katalog nie zna, jest błędem żądania — nie cichym zerem.
    expect(await emitAck(gm, 'time:set', { step: 'century' })).toEqual({
      ok: false,
      error: 'BAD_REQUEST',
    });
    expect(await emitAck(gm, 'time:set', {})).toEqual({ ok: false, error: 'BAD_REQUEST' });
    expect(await emitAck(gm, 'time:set', { minutes: 10 })).toEqual({
      ok: false,
      error: 'BAD_REQUEST',
    });
    expect((await storedTime()).gameTime).toBe(GAME_TIME_DEFAULT + 60);
  });

  it('nowa data dociera do gracza rozgłoszeniem, nie po przeładowaniu', async () => {
    const incoming = waitFor<GameTimeBroadcast>(player, 'time:set');
    // Karta czatu tego skoku jest odbierana **tutaj**, choć sprawdza ją dopiero
    // test niżej. Bez tego zostawała w locie i trafiała w `once('chat:message')`
    // następnego testu, który dostawał „Minęło dziesięć minut" zamiast „Minęła
    // doba" — wyścig widziany raz na kilkanaście przebiegów (05.09).
    const card = waitFor<ChatMessageBroadcast>(player, 'chat:message');
    const ack = await setTime(gm, { step: 'min10' });
    const broadcast = await incoming;
    expect(broadcast.time.minutes).toBe(ack.time.minutes);
    expect(broadcast.seq).toBeGreaterThan(0);
    expect((await card).message.time?.title).toBe('Minęło dziesięć minut');
  });

  it('skok o dobę zostawia kartę na czacie i mówi, ile dób minęło', async () => {
    const incoming = waitFor<ChatMessageBroadcast>(player, 'chat:message');
    const ack = await setTime(gm, { step: 'day' });
    expect(ack.days).toBe(1);

    const message = (await incoming).message;
    expect(message.kind).toBe('time');
    // Karta jest publiczna: „minęła doba" dotyczy całego stołu.
    expect(message.time?.title).toBe('Minęła doba');
    expect(message.time?.days).toBe(1);
    // Karta jest cezurą, nie stemplem czasu: godziny nie ma na niej wcale —
    // ani dla gracza, ani dla MG (rozstrzygnięcie MG z 05.09).
    expect(message.time?.to).toBe('2 stycznia 2045 · rano');
    expect(message.time?.from).toBe('1 stycznia 2045 · rano');
    expect(message.time?.to).not.toMatch(/\d{2}:\d{2}/);
    expect(message.time?.backwards).toBeUndefined();
  });

  it('karta zegara jest publiczna i PRZEŻYWA przeładowanie u gracza', async () => {
    // Błąd znaleziony 05.09 przy oględzinach dwóch sesji obok siebie: `visibleTo`
    // jest **białą listą rodzajów**, a `time` na niej nie było — więc karta
    // docierała do gracza wyłącznie rozgłoszeniem na żywo i znikała przy
    // pierwszym przeładowaniu. MG jej nie tracił, bo jest jej autorem, co
    // maskowało błąd przy oględzinach z jednego konta.
    const fresh = createSocket(playerCookie);
    const sync = await fresh.firstSync;
    const times = sync.messages.filter((m) => m.kind === 'time');
    expect(times.length).toBeGreaterThan(0);
    // …i niesie ten sam kształt, co u MG — nie okrojony.
    expect(times.at(-1)?.time?.to).toBe('2 stycznia 2045 · rano');
    expect(times.at(-1)?.time?.title).toBe('Minęła doba');
  });

  it('„do rana" skacze do najbliższej szóstej, nie o stałą liczbę godzin', async () => {
    // Wieczór 3 stycznia; „do rana" ma dać 4 stycznia, 06:00.
    const evening = gameTimeFromInput('2045-01-03', '22:30')!;
    await setTime(gm, { minutes: evening });
    const ack = await setTime(gm, { step: 'morning' });
    expect(ack.time.minutes).toBe(gameTimeFromInput('2045-01-04', '06:00'));
    expect(ack.days).toBe(1);
  });

  it('ustawienie zegara tam, gdzie już stoi, nie jest skokiem', async () => {
    const before = (await storedTime()).gameTime;
    const ack = await setTime(gm, { minutes: before });
    expect(ack.days).toBe(0);
    expect(ack.time.minutes).toBe(before);
  });

  it('data spoza kalendarza i spoza granic jest odmawiana', async () => {
    const before = (await storedTime()).gameTime;
    for (const minutes of [1.5, -1, 10_000_000_000]) {
      expect(await emitAck(gm, 'time:set', { minutes })).toEqual({
        ok: false,
        error: 'BAD_REQUEST',
      });
    }
    expect((await storedTime()).gameTime).toBe(before);
  });
});

describe('zegar a rozliczenie miesiąca', () => {
  let gm: ClientSocket;

  it('przekroczenie pierwszego dnia miesiąca zapala monit, ale nic nie pobiera', async () => {
    const gmConn = createSocket(gmCookie);
    gm = gmConn.socket;
    await gmConn.firstSync;

    const character = await built.prisma.character.create({
      data: {
        campaignId,
        name: 'Rico',
        data: JSON.stringify({ eddies: 1000, lifestyle: { housing: 'apartament', rent: 0 } }),
      },
    });

    const ack = await setTime(gm, { minutes: gameTimeFromInput('2045-02-01', '09:00')! });
    // Monit to wniosek z dwóch liczb, nie osobne pole: miesiąc zegara różni się
    // od ostatniego rozliczonego.
    expect(settleDue(ack.time)).toBe(true);
    expect(ack.time.settledMonth).toBe('2045-01');

    // …i to jest CAŁY skutek skoku. Saldo stoi nietknięte.
    const stored = await built.prisma.character.findUniqueOrThrow({
      where: { id: character.id },
      select: { data: true },
    });
    expect((JSON.parse(stored.data) as { eddies: number }).eddies).toBe(1000);
    const ledger = await built.prisma.ledgerEntry.count({ where: { characterId: character.id } });
    expect(ledger).toBe(0);
  });

  it('podgląd rozliczenia monitu nie gasi — gasi go dopiero prawdziwe', async () => {
    const preview = await emitAck(gm, 'economy:settle', { preview: true });
    expect(preview.ok).toBe(true);
    expect((await storedTime()).settledMonth).toBe('2045-01');

    const settled = await emitAck(gm, 'economy:settle', {});
    expect(settled.ok).toBe(true);
    const after = await storedTime();
    expect(after.settledMonth).toBe('2045-02');
    expect(settleDue({ minutes: after.gameTime, settledMonth: after.settledMonth })).toBe(false);
  });

  it('cofnięcie zegara nie odwraca rozliczenia i mówi to wprost', async () => {
    const incoming = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    const ack = await setTime(gm, { minutes: gameTimeFromInput('2045-01-15', '12:00')! });
    const message = (await incoming).message;
    expect(message.kind).toBe('time');
    expect(message.time?.title).toBe('Zegar cofnięty');
    expect(message.time?.backwards).toBe(true);
    expect(message.time?.days).toBe(0);

    // Luty zostaje rozliczony, choć zegar stoi w styczniu — i właśnie dlatego
    // monit się nie zapala drugi raz.
    expect(ack.time.settledMonth).toBe('2045-02');
    expect(gameMonthKey(ack.time.minutes)).toBe('2045-01');
    expect(settleDue(ack.time)).toBe(false);
  });
});

describe('zegar a dziennik kampanii', () => {
  it('wpis dziennika niesie datę świata obok daty realnej', async () => {
    const gmConn = createSocket(gmCookie);
    const gm = gmConn.socket;
    await gmConn.firstSync;

    await setTime(gm, { minutes: gameTimeFromInput('2045-03-15', '23:00')! });
    const ack = await emitAck<JournalEntryView>(gm, 'journal:upsert', {
      title: 'Noc w Kabuki',
      body: 'Drużyna wyszła z tego z jednym magazynkiem i bez zapłaty.',
      sessionDate: '2026-09-05',
      tags: [],
      visibility: 'gm',
    });
    if (!ack.ok || !ack.data) throw new Error('journal:upsert failed');
    // Dwie daty, dwa pytania: kiedy grano i kiedy to się działo.
    expect(ack.data.sessionDate).toBe('2026-09-05');
    expect(ack.data.worldDate).toBe('2045-03-15');

    // Data świata stempluje się przy powstaniu wpisu i nie wędruje za zegarem.
    await setTime(gm, { step: 'day' });
    const edited = await emitAck<JournalEntryView>(gm, 'journal:upsert', {
      id: ack.data.id,
      title: 'Noc w Kabuki',
      body: 'Drużyna wyszła z tego z jednym magazynkiem i bez zapłaty. (poprawka)',
      sessionDate: '2026-09-05',
      tags: [],
      visibility: 'gm',
    });
    if (!edited.ok || !edited.data) throw new Error('journal:upsert (edit) failed');
    expect(edited.data.worldDate).toBe('2045-03-15');
  });
});
