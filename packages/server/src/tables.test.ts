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
  InvitationSummary,
  RandomTableListPayload,
  RandomTableUpsertPayload,
  RandomTableView,
  SocketAck,
  StateSyncPayload,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Etap 34: tabele losowe.
 *
 * Testy pilnują trzech rzeczy, z których dwie widać dopiero z drugiego konta:
 *
 *  1. **Cicha karta losowania nie dociera do gracza — także po przeładowaniu.**
 *     To ta sama klasa błędu, która przeżyła dwa etapy przy `time` i `recovery`
 *     (05.09): `visibleTo` jest białą listą rodzajów, więc pominięcie w niej
 *     rodzaju widać wyłącznie oczami gracza, i to dopiero po `state:sync`.
 *     Tutaj sprawdzamy odwrotność: `gmrolltable` NIE ma się tam znaleźć, a
 *     `rolltable` ma.
 *  2. **„Pokaż stołowi" dokłada wiersz**, a nie odsłania stary — stary zostaje
 *     cichy i po drugim kliknięciu nie wysyła drugiej kopii.
 *  3. **Zakresy i graf podrzutów odmawiane są przy zapisie**, ze zdaniem, które
 *     da się przeczytać przy stole.
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

/**
 * Wiadomości czatu, które ten socket zbiera od tej chwili.
 *
 * `seen` jest **żywą** tablicą, a `stop()` tylko odpina słuchacza — pierwsza
 * wersja zwracała listę ze `stop()`, więc pętla wołająca `stop()` w każdym
 * obrocie gasiła nasłuch po pierwszym przebiegu i test przechodził losowo.
 */
function collectMessages(socket: ClientSocket): {
  seen: ChatMessageBroadcast[];
  stop: () => ChatMessageBroadcast[];
} {
  const seen: ChatMessageBroadcast[] = [];
  const handler = (broadcast: ChatMessageBroadcast) => seen.push(broadcast);
  socket.on('chat:message', handler);
  return {
    seen,
    stop: () => {
      socket.off('chat:message', handler);
      return seen;
    },
  };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function saveTable(
  socket: ClientSocket,
  payload: RandomTableUpsertPayload,
): Promise<RandomTableView> {
  const ack = await emitAck<RandomTableView>(socket, 'table:upsert', payload);
  if (!ack.ok || !ack.data) {
    throw new Error(`table:upsert failed: ${!ack.ok ? ack.error : 'no data'}`);
  }
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
    payload: { password: GM_PASSWORD },
  });
  gmCookie = cookieOf(login.headers['set-cookie']);

  const campaignRes = await built.app.inject({
    method: 'POST',
    url: '/api/campaigns',
    headers: { cookie: gmCookie },
    payload: { name: 'Losowe Night City' },
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

describe('tabele losowe (etap 34)', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let encounters: RandomTableView;
  let loot: RandomTableView;

  it('MG zakłada tabelę, gracz jej nie zakłada', async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);

    encounters = await saveTable(gm, {
      name: 'Spotkania dzienne',
      formula: '1d10',
      description: 'Przejście przez Watson za dnia',
      visibility: 'gm',
      rows: [
        { min: 1, max: 5, text: 'Patrol miejscowej policji' },
        { min: 6, max: 10, text: 'Cybergang Piranhas' },
      ],
    });
    expect(encounters.rows).toHaveLength(2);
    expect(encounters.formula).toBe('1d10');

    const refused = await emitAck(player, 'table:upsert', {
      name: 'Moja tabela',
      formula: '1d10',
      description: '',
      visibility: 'public',
      rows: [{ min: 1, max: 10, text: 'nic' }],
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toBe('FORBIDDEN');
  });

  it('dziura w zakresach kończy się czytelną odmową', async () => {
    const ack = await emitAck(gm, 'table:upsert', {
      name: 'Dziurawa',
      formula: '1d10',
      description: '',
      visibility: 'gm',
      rows: [
        { min: 1, max: 3, text: 'raz' },
        { min: 7, max: 10, text: 'dwa' },
      ],
    });
    expect(ack.ok).toBe(false);
    if (!ack.ok) {
      expect(ack.error).toContain('INVALID_TABLE:');
      expect(ack.error).toContain('4–6');
    }
  });

  it('druga tabela o tej samej nazwie jest odmawiana — nazwa jest adresem', async () => {
    const ack = await emitAck(gm, 'table:upsert', {
      name: 'spotkania DZIENNE',
      formula: '1d10',
      description: '',
      visibility: 'gm',
      rows: [{ min: 1, max: 10, text: 'nic' }],
    });
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.error).toContain('już istnieje');
  });

  it('„Losuj" daje kartę widoczną tylko dla MG — także po przeładowaniu', async () => {
    const gmSeen = collectMessages(gm);
    const playerSeen = collectMessages(player);
    const ack = await emitAck(gm, 'table:roll', { id: encounters.id });
    expect(ack.ok).toBe(true);
    await wait(150);

    const gmCards = gmSeen.stop().filter((entry) => entry.message.kind === 'gmrolltable');
    expect(gmCards).toHaveLength(1);
    const entry = gmCards[0]!.message.rolltable;
    expect(entry?.tableName).toBe('Spotkania dzienne');
    expect(entry?.steps).toHaveLength(1);
    expect(entry!.steps[0]!.text.length).toBeGreaterThan(0);
    // Kość tabeli nie eksploduje: bez `checkRule: false` dziesiątka dałaby 11+.
    expect(entry!.steps[0]!.value).toBeGreaterThanOrEqual(1);
    expect(entry!.steps[0]!.value).toBeLessThanOrEqual(10);

    expect(playerSeen.stop()).toHaveLength(0);

    // Oczami gracza po przeładowaniu — tu przeżyły dwa błędy z 05.09.
    const reload = createSocket(playerCookie);
    const sync = await reload.firstSync;
    expect(sync.messages.some((message) => message.kind === 'gmrolltable')).toBe(false);
  });

  it('„Pokaż stołowi" dokłada publiczny wiersz i nie robi tego dwa razy', async () => {
    const gmSeen = collectMessages(gm);
    await emitAck(gm, 'table:roll', { id: encounters.id });
    await wait(150);
    const secret = gmSeen.stop().find((entry) => entry.message.kind === 'gmrolltable');
    expect(secret).toBeDefined();
    const messageId = secret!.message.id;
    const rolled = secret!.message.rolltable!.steps[0]!;

    const playerSeen = collectMessages(player);
    const ack = await emitAck(gm, 'table:show', { messageId });
    expect(ack.ok).toBe(true);
    await wait(150);

    const shown = playerSeen.stop().filter((entry) => entry.message.kind === 'rolltable');
    expect(shown).toHaveLength(1);
    // Ten sam wynik, nie nowy rzut.
    expect(shown[0]!.message.rolltable!.steps[0]!.value).toBe(rolled.value);
    expect(shown[0]!.message.rolltable!.steps[0]!.text).toBe(rolled.text);

    const again = await emitAck(gm, 'table:show', { messageId });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toBe('ALREADY_SHOWN');

    // Publiczny wiersz przeżywa przeładowanie u gracza, cichy nadal nie.
    const reload = createSocket(playerCookie);
    const sync = await reload.firstSync;
    expect(sync.messages.some((message) => message.kind === 'rolltable')).toBe(true);
    expect(sync.messages.some((message) => message.kind === 'gmrolltable')).toBe(false);
  });

  it('cykl podrzutów jest odmawiany przy zapisie', async () => {
    loot = await saveTable(gm, {
      name: 'Łup z kieszeni',
      formula: '1d10',
      description: '',
      visibility: 'gm',
      rows: [
        { min: 1, max: 5, text: 'Zmięte eddiesy' },
        { min: 6, max: 10, text: 'Broń przy ciele', subTableId: encounters.id },
      ],
    });
    expect(loot.rows[1]!.subTableName).toBe('Spotkania dzienne');

    const cycle = await emitAck(gm, 'table:upsert', {
      id: encounters.id,
      name: encounters.name,
      formula: '1d10',
      description: '',
      visibility: 'gm',
      rows: [
        { min: 1, max: 5, text: 'Patrol' },
        { min: 6, max: 10, text: 'A przy nim…', subTableId: loot.id },
      ],
    });
    expect(cycle.ok).toBe(false);
    if (!cycle.ok) expect(cycle.error).toContain('zapętlają');
  });

  it('wiersz z podrzutem losuje obie tabele w jednym kliknięciu', async () => {
    const gmSeen = collectMessages(gm);
    // Kość jest prawdziwa (RNG serwera), a podrzut siedzi na połowie zakresu,
    // więc losujemy do skutku: czterdzieści prób bez trafienia w 6–10 to szansa
    // rzędu 1 : 10^12 — a test ma pilnować podrzutu, nie rozkładu kości.
    const deepest = () =>
      Math.max(
        1,
        ...gmSeen.seen
          .filter((entry) => entry.message.kind === 'gmrolltable')
          .map((entry) => entry.message.rolltable?.steps.length ?? 1),
      );
    for (let attempt = 0; attempt < 40 && deepest() < 2; attempt += 1) {
      await emitAck(gm, 'table:roll', { id: loot.id });
      await wait(60);
    }
    const nested = gmSeen
      .stop()
      .find((entry) => (entry.message.rolltable?.steps.length ?? 0) === 2);
    expect(nested).toBeDefined();
    const steps = nested!.message.rolltable!.steps;
    expect(steps[0]!.tableName).toBe('Łup z kieszeni');
    expect(steps[1]!.tableName).toBe('Spotkania dzienne');
    expect(steps[1]!.text.length).toBeGreaterThan(0);
  });

  it('/tab daje ten sam wynik co przycisk, a gracz go nie dostaje', async () => {
    const gmSeen = collectMessages(gm);
    const playerSeen = collectMessages(player);
    gm.emit('chat:send', { text: '/tab spotkania dzienne' });
    await wait(200);

    const cards = gmSeen.stop().filter((entry) => entry.message.kind === 'gmrolltable');
    expect(cards).toHaveLength(1);
    expect(cards[0]!.message.rolltable?.tableName).toBe('Spotkania dzienne');
    expect(playerSeen.stop()).toHaveLength(0);

    const refused = await emitAck(player, 'chat:send', { text: '/tab spotkania dzienne' });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toBe('FORBIDDEN');
  });

  it('tabela publiczna losuje od razu dla stołu, a przełącznik ją wycisza', async () => {
    const radio = await saveTable(gm, {
      name: 'Co leci w radiu',
      formula: '1d10',
      description: '',
      visibility: 'public',
      rows: [{ min: 1, max: 10, text: 'Samurai — Chippin’ In' }],
    });

    const playerSeen = collectMessages(player);
    await emitAck(gm, 'table:roll', { id: radio.id });
    await wait(150);
    expect(playerSeen.stop().filter((entry) => entry.message.kind === 'rolltable')).toHaveLength(1);

    const quiet = collectMessages(player);
    await emitAck(gm, 'table:roll', { id: radio.id, visibility: 'gm' });
    await wait(150);
    expect(quiet.stop()).toHaveLength(0);
  });

  it('usunięta tabela zabiera podrzut, ale zostawia wiersz', async () => {
    const doomed = await saveTable(gm, {
      name: 'Do skasowania',
      formula: '1d10',
      description: '',
      visibility: 'gm',
      rows: [{ min: 1, max: 10, text: 'nic' }],
    });
    await saveTable(gm, {
      id: loot.id,
      name: loot.name,
      formula: '1d10',
      description: '',
      visibility: 'gm',
      rows: [
        { min: 1, max: 5, text: 'Zmięte eddiesy' },
        { min: 6, max: 10, text: 'Coś jeszcze', subTableId: doomed.id },
      ],
    });

    const removed = await emitAck(gm, 'table:delete', { id: doomed.id });
    expect(removed.ok).toBe(true);

    const list = await emitAck<RandomTableListPayload>(gm, 'table:list');
    expect(list.ok).toBe(true);
    const after = list.ok ? list.data!.tables.find((table) => table.id === loot.id) : undefined;
    expect(after?.rows).toHaveLength(2);
    expect(after?.rows[1]!.text).toBe('Coś jeszcze');
    expect(after?.rows[1]!.subTableId).toBeNull();
  });

  it('lista tabel nie dociera do gracza', async () => {
    const ack = await emitAck(player, 'table:list');
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.error).toBe('FORBIDDEN');
  });
});
