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
  CheckCallEntry,
  CpredCharacterData,
  InvitationSummary,
  SocketAck,
  StateSyncPayload,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Etap 32 — wezwanie MG do Testu.
 *
 * Suite pilnuje trzech rzeczy, o które ta ścieżka może się rozbić: **kto widzi
 * wezwanie i wynik**, **czego klient nie może sobie nazwać** (Umiejętność, PT,
 * modyfikator, widoczność — wszystko idzie z zapisanej karty) i **czy wezwanie
 * zamyka się dokładnie raz**.
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
let vexCookie: string;
let vexId: string;
let rogueCookie: string;
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

function waitForMatch<T>(
  socket: ClientSocket,
  event: string,
  matches: (payload: T) => boolean,
  ms = 3000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, listener);
      reject(new Error(`${event} timeout`));
    }, ms);
    const listener = (payload: T) => {
      if (!matches(payload)) return;
      clearTimeout(timer);
      socket.off(event, listener);
      resolve(payload);
    };
    socket.on(event, listener);
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
    payload: { name: 'Kampania wezwań' },
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
  vexId = (joinVex.json() as { user: { id: string } }).user.id;

  const joinRogue = await built.app.inject({
    method: 'POST',
    url: `/api/join/${token}`,
    payload: { name: 'Rogue' },
  });
  rogueCookie = cookieOf(joinRogue.headers['set-cookie']);
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

describe('wezwanie do Testu', () => {
  let gm: ClientSocket;
  let vex: ClientSocket;
  let rogue: ClientSocket;
  let characterId: string;
  /** Wszystko, co kiedykolwiek dotarło do postronnego gracza — wykrywacz wycieku. */
  const rogueTraffic: ChatMessageBroadcast[] = [];

  it('stawia postać Vexa, którą da się wezwać', async () => {
    const gmConn = createSocket(gmCookie);
    const vexConn = createSocket(vexCookie);
    const rogueConn = createSocket(rogueCookie);
    gm = gmConn.socket;
    vex = vexConn.socket;
    rogue = rogueConn.socket;
    rogue.on('chat:message', (payload: ChatMessageBroadcast) => rogueTraffic.push(payload));
    await Promise.all([gmConn.firstSync, vexConn.firstSync, rogueConn.firstSync]);

    const created = await emitAck<CharacterView>(gm, 'character:create', {
      name: 'Forty',
      ownerId: vexId,
    });
    if (!created.ok || !created.data) throw new Error('character:create failed');
    characterId = created.data.id;

    const stats = (created.data.data as CpredCharacterData).stats;
    const updated = await emitAck<CharacterView>(gm, 'character:update', {
      characterId,
      patch: { data: { stats: { ...stats, int: 7 }, skills: { perception: 4 } } },
    });
    expect(updated.ok).toBe(true);
  });

  it('gracz nie wystawia wezwań', async () => {
    const ack = await emitAck(vex, 'check:call', {
      characterId,
      request: { kind: 'skill', skillId: 'perception' },
      dv: 13,
      visibility: 'public',
    });
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.error).toBe('FORBIDDEN');
  });

  it('odmawia wezwania bez progu i wezwania z dwoma progami naraz', async () => {
    const neither = await emitAck(gm, 'check:call', {
      characterId,
      request: { kind: 'skill', skillId: 'perception' },
      visibility: 'public',
    });
    expect(neither.ok).toBe(false);
    if (!neither.ok) expect(neither.error).toBe('BAD_REQUEST');

    const both = await emitAck(gm, 'check:call', {
      characterId,
      request: { kind: 'skill', skillId: 'perception' },
      dv: 13,
      opponentBonus: 10,
      visibility: 'public',
    });
    expect(both.ok).toBe(false);
    if (!both.ok) expect(both.error).toBe('BAD_REQUEST');
  });

  it('nieznaną Umiejętność odrzuca przy wystawianiu, nie przy rzucie', async () => {
    const ack = await emitAck(gm, 'check:call', {
      characterId,
      request: { kind: 'skill', skillId: 'nie-ma-takiej' },
      dv: 13,
      visibility: 'public',
    });
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.error).toBe('UNKNOWN_SKILL');
  });

  it('wezwanie dociera do MG i wezwanego, nigdy do stołu', async () => {
    const toVex = waitForMatch<ChatMessageBroadcast>(
      vex,
      'chat:message',
      (payload) => payload.message.kind === 'check',
    );
    const ack = await emitAck<{ messageId: number }>(gm, 'check:call', {
      characterId,
      request: { kind: 'skill', skillId: 'perception' },
      dv: 60,
      modifier: -2,
      prompt: 'Coś brzęknęło pod twoją stopą.',
      visibility: 'public',
    });
    expect(ack.ok).toBe(true);

    const delivered = await toVex;
    const entry = delivered.message.check as CheckCallEntry;
    expect(entry.characterName).toBe('Forty');
    expect(entry.rollLabel).toContain('(INT)');
    expect(entry.dv).toBe(60);
    expect(entry.modifier).toBe(-2);
    expect(entry.prompt).toBe('Coś brzęknęło pod twoją stopą.');
    expect(entry.resolved).toBeUndefined();
    // Wezwanie nie jest linią dla stołu — Rogue nie dostał ani jednej kopii.
    expect(rogueTraffic.some((payload) => payload.message.kind === 'check')).toBe(false);
  });

  it('rzut na wezwanie bierze Umiejętność i PT z karty wezwania, nie z żądania', async () => {
    const called = await emitAck<{ messageId: number }>(gm, 'check:call', {
      characterId,
      request: { kind: 'skill', skillId: 'perception' },
      // PT 60 jest nieosiągalne (maks. 7 + 4 + 10 + 10 = 31), więc werdykt
      // jest pewny bez ustawiania kości.
      dv: 60,
      visibility: 'public',
    });
    if (!called.ok || !called.data) throw new Error('check:call failed');
    const callId = called.data.messageId;

    const rollCard = waitForMatch<ChatMessageBroadcast>(
      vex,
      'chat:message',
      (payload) => payload.message.roll?.outcome !== undefined,
    );
    const updated = waitForMatch<ChatMessageBroadcast>(
      vex,
      'chat:update',
      (payload) => payload.message.id === callId,
    );

    const ack = await emitAck<{ messageId: number }>(vex, 'character:roll', {
      // Podrobione co do joty: inna karta, inna Umiejętność, własny modyfikator
      // i własna widoczność. Serwer ma to zignorować w całości.
      characterId: 'nie-moja-karta',
      request: { kind: 'skill', skillId: 'first-aid', modifier: 20, luckSpent: 0 },
      visibility: 'gm',
      callMessageId: callId,
    });
    expect(ack.ok).toBe(true);

    const card = await rollCard;
    expect(card.message.kind).toBe('roll');
    expect(card.message.roll?.title).toContain('Wezwanie');
    expect(card.message.roll?.title).toContain('(INT)');
    expect(card.message.roll?.outcome?.success).toBe(false);
    expect(card.message.roll?.outcome?.label).toBe('Niezdane');
    expect(card.message.roll?.outcome?.detail).toContain('PT 60');
    // Modyfikator +20 z podrobionego żądania nie wszedł do rozbicia.
    const breakdown = card.message.roll?.breakdown ?? [];
    expect(breakdown.some((entry) => entry.value === 20)).toBe(false);
    expect(breakdown.some((entry) => entry.label.includes('Percepcja'))).toBe(true);

    const call = (await updated).message.check as CheckCallEntry;
    expect(call.resolved?.success).toBe(false);
    expect(call.resolved?.byName).toBe('Vex');
    expect(call.resolved?.messageId).toBe(card.message.id);

    // Zamknięte wezwanie nie przyjmuje drugiego rzutu.
    const again = await emitAck(vex, 'character:roll', {
      request: { kind: 'skill', skillId: 'perception' },
      visibility: 'public',
      callMessageId: callId,
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toBe('CALL_CLOSED');
  });

  it('PT 1 zdaje się zawsze — i tak samo mówi karta wezwania', async () => {
    const called = await emitAck<{ messageId: number }>(gm, 'check:call', {
      characterId,
      // Percepcja, nie sama Cecha: INT 7 + Percepcja 4 = 11, więc nawet
      // naturalna 1 z dorzutem −10 kończy się na 2, czyli powyżej PT 1. Sama
      // Cecha (7) spadłaby na fumble'u do −2 i test by migotał — dokładnie ta
      // pułapka, o której mówi `pulapki-dev.md`.
      request: { kind: 'skill', skillId: 'perception' },
      dv: 1,
      visibility: 'public',
    });
    if (!called.ok || !called.data) throw new Error('check:call failed');

    const rollCard = waitForMatch<ChatMessageBroadcast>(
      vex,
      'chat:message',
      (payload) => payload.message.roll?.outcome !== undefined,
    );
    await emitAck(vex, 'character:roll', {
      request: { kind: 'skill', skillId: 'perception' },
      visibility: 'public',
      callMessageId: called.data.messageId,
    });
    const card = await rollCard;
    expect(card.message.roll?.outcome?.success).toBe(true);
    expect(card.message.roll?.outcome?.label).toBe('Zdane');
  });

  it('cudzego wezwania nie da się przejąć', async () => {
    const called = await emitAck<{ messageId: number }>(gm, 'check:call', {
      characterId,
      request: { kind: 'skill', skillId: 'perception' },
      dv: 13,
      visibility: 'public',
    });
    if (!called.ok || !called.data) throw new Error('check:call failed');

    const stolen = await emitAck(rogue, 'character:roll', {
      request: { kind: 'skill', skillId: 'perception' },
      visibility: 'public',
      callMessageId: called.data.messageId,
    });
    expect(stolen.ok).toBe(false);
    if (!stolen.ok) expect(stolen.error).toBe('CALL_NOT_YOURS');

    // …a MG odwołuje je bez rzutu i wtedy nie przyjmuje go nikt.
    const withdrawn = waitForMatch<ChatMessageBroadcast>(
      vex,
      'chat:update',
      (payload) => payload.message.id === called.data!.messageId,
    );
    const cancel = await emitAck(gm, 'check:cancel', { messageId: called.data.messageId });
    expect(cancel.ok).toBe(true);
    const entry = (await withdrawn).message.check as CheckCallEntry;
    expect(entry.cancelled?.byName).toBe('MG');

    const late = await emitAck(vex, 'character:roll', {
      request: { kind: 'skill', skillId: 'perception' },
      visibility: 'public',
      callMessageId: called.data.messageId,
    });
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.error).toBe('CALL_CLOSED');
  });

  it('wezwanie „tylko MG i wezwany" nie pokazuje wyniku stołowi', async () => {
    const called = await emitAck<{ messageId: number }>(gm, 'check:call', {
      characterId,
      request: { kind: 'skill', skillId: 'perception' },
      dv: 13,
      visibility: 'gm',
    });
    if (!called.ok || !called.data) throw new Error('check:call failed');

    const rollCard = waitForMatch<ChatMessageBroadcast>(
      vex,
      'chat:message',
      (payload) => payload.message.roll?.outcome !== undefined,
    );
    await emitAck(vex, 'character:roll', {
      request: { kind: 'skill', skillId: 'perception' },
      visibility: 'public',
      callMessageId: called.data.messageId,
    });
    const card = await rollCard;
    expect(card.message.kind).toBe('gmroll');
    expect(rogueTraffic.some((payload) => payload.message.id === card.message.id)).toBe(false);
  });

  it('MG rzuca za nieobecnego gracza, a karta i tak dochodzi do właściciela', async () => {
    const called = await emitAck<{ messageId: number }>(gm, 'check:call', {
      characterId,
      request: { kind: 'skill', skillId: 'perception' },
      dv: 13,
      visibility: 'gm',
    });
    if (!called.ok || !called.data) throw new Error('check:call failed');

    const toOwner = waitForMatch<ChatMessageBroadcast>(
      vex,
      'chat:message',
      (payload) => payload.message.kind === 'gmroll',
    );
    const ack = await emitAck(gm, 'character:roll', {
      request: { kind: 'skill', skillId: 'perception' },
      visibility: 'public',
      callMessageId: called.data.messageId,
    });
    expect(ack.ok).toBe(true);
    const card = await toOwner;
    expect(card.message.roll?.actor).toBe('Forty');
    expect(card.message.roll?.outcome).toBeDefined();
  });

  it('rzut przeciwstawny dorzuca 1k10 drugiej stronie', async () => {
    const called = await emitAck<{ messageId: number }>(gm, 'check:call', {
      characterId,
      request: { kind: 'skill', skillId: 'perception' },
      // 30 + 1k10 to od 31 w górę; postać wyciąga najwyżej 31, a remis
      // wygrywa Broniący, więc porażka jest pewna.
      opponentBonus: 30,
      visibility: 'public',
    });
    if (!called.ok || !called.data) throw new Error('check:call failed');

    const rollCard = waitForMatch<ChatMessageBroadcast>(
      vex,
      'chat:message',
      (payload) => payload.message.roll?.outcome !== undefined,
    );
    await emitAck(vex, 'character:roll', {
      request: { kind: 'skill', skillId: 'perception' },
      visibility: 'public',
      callMessageId: called.data.messageId,
    });
    const card = await rollCard;
    expect(card.message.roll?.outcome?.success).toBe(false);
    expect(card.message.roll?.outcome?.detail).toContain('druga strona: 30 + 1k10');
  });
});
