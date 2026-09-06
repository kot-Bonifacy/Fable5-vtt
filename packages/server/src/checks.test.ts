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
  CheckRequestEntry,
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

/**
 * Etap 40 — prośba gracza o Test.
 *
 * Ta sama trójka pytań, co przy wezwaniu, tylko z drugiej strony stołu: **kto
 * widzi prośbę**, **czego proszący nie może sobie nazwać** (cudza karta, próg)
 * i **czy prośba rozstrzyga się dokładnie raz**.
 */
describe('prośba gracza o Test', () => {
  let gm: ClientSocket;
  let vex: ClientSocket;
  let rogue: ClientSocket;
  let characterId: string;
  let rogueCharacterId: string;
  /** Wszystko, co kiedykolwiek dotarło do postronnego gracza — wykrywacz wycieku. */
  const rogueTraffic: ChatMessageBroadcast[] = [];

  /** Prośba wystawiona i od razu zamknięta — sprzątanie po limicie trzech. */
  async function askAndClose(): Promise<number> {
    const asked = await emitAck<{ messageId: number }>(vex, 'check:request', {
      characterId,
      request: { kind: 'skill', skillId: 'perception' },
    });
    if (!asked.ok || !asked.data) throw new Error('check:request failed');
    const closed = await emitAck(gm, 'check:request-resolve', {
      messageId: asked.data.messageId,
      approve: false,
    });
    expect(closed.ok).toBe(true);
    return asked.data.messageId;
  }

  it('stawia dwie karty: Vexa i cudzą', async () => {
    const gmConn = createSocket(gmCookie);
    const vexConn = createSocket(vexCookie);
    const rogueConn = createSocket(rogueCookie);
    gm = gmConn.socket;
    vex = vexConn.socket;
    rogue = rogueConn.socket;
    rogue.on('chat:message', (payload: ChatMessageBroadcast) => rogueTraffic.push(payload));
    rogue.on('chat:update', (payload: ChatMessageBroadcast) => rogueTraffic.push(payload));
    await Promise.all([gmConn.firstSync, vexConn.firstSync, rogueConn.firstSync]);

    const mine = await emitAck<CharacterView>(gm, 'character:create', {
      name: 'Czterdziestka',
      ownerId: vexId,
    });
    if (!mine.ok || !mine.data) throw new Error('character:create failed');
    characterId = mine.data.id;

    const stats = (mine.data.data as CpredCharacterData).stats;
    const updated = await emitAck<CharacterView>(gm, 'character:update', {
      characterId,
      patch: { data: { stats: { ...stats, int: 7 }, skills: { perception: 4 } } },
    });
    expect(updated.ok).toBe(true);

    const theirs = await emitAck<CharacterView>(gm, 'character:create', { name: 'Cudza' });
    if (!theirs.ok || !theirs.data) throw new Error('character:create failed');
    rogueCharacterId = theirs.data.id;
  });

  it('prosi się WŁASNĄ kartą — cudzej nie ruszasz nawet znając jej id', async () => {
    const ack = await emitAck(vex, 'check:request', {
      characterId: rogueCharacterId,
      request: { kind: 'skill', skillId: 'perception' },
    });
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.error).toBe('CHARACTER_NOT_YOURS');
  });

  it('nieznaną Umiejętność odrzuca u proszącego, nie MG przy klikaniu szczebla', async () => {
    const ack = await emitAck(vex, 'check:request', {
      characterId,
      request: { kind: 'skill', skillId: 'nie-ma-takiej' },
    });
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.error).toBe('UNKNOWN_SKILL');
  });

  it('prośba dociera do MG i proszącego, nigdy do stołu', async () => {
    const toGm = waitForMatch<ChatMessageBroadcast>(
      gm,
      'chat:message',
      (payload) => payload.message.kind === 'request',
    );
    const ack = await emitAck<{ messageId: number }>(vex, 'check:request', {
      characterId,
      request: { kind: 'skill', skillId: 'perception' },
      reason: 'Chcę zrozumieć, co znaczy ta mina.',
    });
    expect(ack.ok).toBe(true);

    const entry = (await toGm).message.request as CheckRequestEntry;
    expect(entry.characterName).toBe('Czterdziestka');
    expect(entry.rollLabel).toContain('(INT)');
    expect(entry.askedByName).toBe('Vex');
    expect(entry.reason).toBe('Chcę zrozumieć, co znaczy ta mina.');
    // Progu w prośbie nie ma i być nie może — ustala go MG.
    expect((entry as unknown as { dv?: number }).dv).toBeUndefined();
    expect(entry.resolution).toBeUndefined();
    expect(rogueTraffic.some((payload) => payload.message.kind === 'request')).toBe(false);

    if (!ack.ok || !ack.data) throw new Error('check:request failed');
    const closed = await emitAck(gm, 'check:request-resolve', {
      messageId: ack.data.messageId,
      approve: false,
    });
    expect(closed.ok).toBe(true);
  });

  it('zgoda robi ZWYKŁE wezwanie z 32 i zostawia na prośbie chip z progiem', async () => {
    const asked = await emitAck<{ messageId: number }>(vex, 'check:request', {
      characterId,
      request: { kind: 'skill', skillId: 'perception' },
      reason: 'Chcę odczytać jego minę.',
    });
    if (!asked.ok || !asked.data) throw new Error('check:request failed');

    const callCard = waitForMatch<ChatMessageBroadcast>(
      vex,
      'chat:message',
      (payload) => payload.message.kind === 'check',
    );
    const updated = waitForMatch<ChatMessageBroadcast>(
      vex,
      'chat:update',
      (payload) => payload.message.id === asked.data!.messageId,
    );

    const ack = await emitAck<{ callMessageId?: number }>(gm, 'check:request-resolve', {
      messageId: asked.data.messageId,
      approve: true,
      dv: 15,
      // Umiejętność podrobiona co do joty — serwer ma ją zignorować i wziąć tę
      // z zapisanej prośby.
      request: { kind: 'skill', skillId: 'first-aid' },
    });
    expect(ack.ok).toBe(true);

    const card = await callCard;
    const call = card.message.check as CheckCallEntry;
    expect(call.rollLabel).toContain('Percepcja');
    expect(call.dv).toBe(15);
    expect(call.dvLabel).toBe('Trudny');
    expect(call.ownerId).toBe(vexId);
    // Zdanie „po co" od gracza jedzie dalej jako opis wydarzenia.
    expect(call.prompt).toBe('Chcę odczytać jego minę.');

    const request = (await updated).message.request as CheckRequestEntry;
    expect(request.resolution?.kind).toBe('approved');
    expect(request.resolution?.targetText).toBe('PT 15 (Trudny)');
    expect(request.resolution?.callMessageId).toBe(card.message.id);
    expect(rogueTraffic.some((payload) => payload.message.kind === 'check')).toBe(false);
  });

  it('rozstrzyga się dokładnie raz: druga zgoda, zgoda po odmowie i po wycofaniu odpadają', async () => {
    const twice = await emitAck<{ messageId: number }>(vex, 'check:request', {
      characterId,
      request: { kind: 'stat', statId: 'emp' },
    });
    if (!twice.ok || !twice.data) throw new Error('check:request failed');
    const first = await emitAck(gm, 'check:request-resolve', {
      messageId: twice.data.messageId,
      approve: true,
      dv: 13,
    });
    expect(first.ok).toBe(true);
    const second = await emitAck(gm, 'check:request-resolve', {
      messageId: twice.data.messageId,
      approve: true,
      dv: 13,
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toBe('REQUEST_CLOSED');

    const refused = await emitAck<{ messageId: number }>(vex, 'check:request', {
      characterId,
      request: { kind: 'stat', statId: 'emp' },
    });
    if (!refused.ok || !refused.data) throw new Error('check:request failed');
    const refusal = await emitAck(gm, 'check:request-resolve', {
      messageId: refused.data.messageId,
      approve: false,
      note: 'Nie ma na to rzutu.',
    });
    expect(refusal.ok).toBe(true);
    const afterRefusal = await emitAck(gm, 'check:request-resolve', {
      messageId: refused.data.messageId,
      approve: true,
      dv: 13,
    });
    expect(afterRefusal.ok).toBe(false);
    if (!afterRefusal.ok) expect(afterRefusal.error).toBe('REQUEST_CLOSED');

    const withdrawn = await emitAck<{ messageId: number }>(vex, 'check:request', {
      characterId,
      request: { kind: 'stat', statId: 'emp' },
    });
    if (!withdrawn.ok || !withdrawn.data) throw new Error('check:request failed');
    // Cudzej prośby nie wycofa nikt poza autorem.
    const stolen = await emitAck(rogue, 'check:request-cancel', {
      messageId: withdrawn.data.messageId,
    });
    expect(stolen.ok).toBe(false);
    if (!stolen.ok) expect(stolen.error).toBe('REQUEST_NOT_YOURS');
    const cancelled = await emitAck(vex, 'check:request-cancel', {
      messageId: withdrawn.data.messageId,
    });
    expect(cancelled.ok).toBe(true);
    const afterWithdrawal = await emitAck(gm, 'check:request-resolve', {
      messageId: withdrawn.data.messageId,
      approve: true,
      dv: 13,
    });
    expect(afterWithdrawal.ok).toBe(false);
    if (!afterWithdrawal.ok) expect(afterWithdrawal.error).toBe('REQUEST_CLOSED');
  });

  it('gracz nie rozstrzyga próśb — także własnych', async () => {
    const asked = await emitAck<{ messageId: number }>(vex, 'check:request', {
      characterId,
      request: { kind: 'skill', skillId: 'perception' },
    });
    if (!asked.ok || !asked.data) throw new Error('check:request failed');
    const ack = await emitAck(vex, 'check:request-resolve', {
      messageId: asked.data.messageId,
      approve: true,
      dv: 9,
    });
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.error).toBe('FORBIDDEN');
    const cancelled = await emitAck(vex, 'check:request-cancel', {
      messageId: asked.data.messageId,
    });
    expect(cancelled.ok).toBe(true);
  });

  it('trzy otwarte prośby na gracza i ani jednej więcej', async () => {
    const open: number[] = [];
    for (let i = 0; i < 3; i++) {
      const ack = await emitAck<{ messageId: number }>(vex, 'check:request', {
        characterId,
        request: { kind: 'skill', skillId: 'perception' },
      });
      if (!ack.ok || !ack.data) throw new Error('check:request failed');
      open.push(ack.data.messageId);
    }
    const fourth = await emitAck(vex, 'check:request', {
      characterId,
      request: { kind: 'skill', skillId: 'perception' },
    });
    expect(fourth.ok).toBe(false);
    if (!fourth.ok) expect(fourth.error).toBe('REQUEST_LIMIT');

    // Zamknięcie jednej robi miejsce — limit liczy CZEKAJĄCE, nie wysłane.
    const closed = await emitAck(gm, 'check:request-resolve', {
      messageId: open[0]!,
      approve: false,
    });
    expect(closed.ok).toBe(true);
    const fifth = await emitAck<{ messageId: number }>(vex, 'check:request', {
      characterId,
      request: { kind: 'skill', skillId: 'perception' },
    });
    expect(fifth.ok).toBe(true);
    if (fifth.ok && fifth.data) open.push(fifth.data.messageId);
    for (const messageId of open.slice(1)) {
      await emitAck(gm, 'check:request-resolve', { messageId, approve: false });
    }
  });

  it('zgoda na prośbę o skasowaną kartę wraca odmową i ZOSTAWIA na karcie ślad', async () => {
    const doomed = await emitAck<CharacterView>(gm, 'character:create', {
      name: 'Znikająca',
      ownerId: vexId,
    });
    if (!doomed.ok || !doomed.data) throw new Error('character:create failed');

    const asked = await emitAck<{ messageId: number }>(vex, 'check:request', {
      characterId: doomed.data.id,
      request: { kind: 'stat', statId: 'int' },
    });
    if (!asked.ok || !asked.data) throw new Error('check:request failed');

    const deleted = await emitAck(gm, 'character:delete', { characterId: doomed.data.id });
    expect(deleted.ok).toBe(true);

    const updated = waitForMatch<ChatMessageBroadcast>(
      vex,
      'chat:update',
      (payload) => payload.message.id === asked.data!.messageId,
    );
    const ack = await emitAck(gm, 'check:request-resolve', {
      messageId: asked.data.messageId,
      approve: true,
      dv: 13,
    });
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.error).toBe('CHARACTER_NOT_FOUND');

    const entry = (await updated).message.request as CheckRequestEntry;
    expect(entry.resolution?.kind).toBe('refused');
    expect(entry.resolution?.note).toContain('już nie ma');
  });

  it('„Ustaw…" wystawia wezwanie i zamyka prośbę JEDNYM żądaniem', async () => {
    const asked = await emitAck<{ messageId: number }>(vex, 'check:request', {
      characterId,
      request: { kind: 'skill', skillId: 'perception' },
      reason: 'Chcę go przejrzeć.',
    });
    if (!asked.ok || !asked.data) throw new Error('check:request failed');

    const updated = waitForMatch<ChatMessageBroadcast>(
      vex,
      'chat:update',
      (payload) => payload.message.id === asked.data!.messageId,
    );
    // Pełne okno wezwania: MG podmienia Umiejętność — i tu wolno mu to zrobić,
    // bo żądanie idzie przez `check:call`, a nie przez zgodę na prośbę.
    const called = await emitAck<{ messageId: number }>(gm, 'check:call', {
      characterId,
      request: { kind: 'skill', skillId: 'first-aid' },
      dv: 17,
      prompt: 'Rozpoznajesz w nim ranę, nie złość.',
      visibility: 'gm',
      requestMessageId: asked.data.messageId,
    });
    expect(called.ok).toBe(true);
    if (!called.ok || !called.data) throw new Error('check:call failed');

    const entry = (await updated).message.request as CheckRequestEntry;
    expect(entry.resolution?.kind).toBe('approved');
    expect(entry.resolution?.targetText).toBe('PT 17 (Profesjonalny)');
    expect(entry.resolution?.callMessageId).toBe(called.data.messageId);
  });

  it('prośba nie wchodzi postronnemu graczowi do historii czatu', async () => {
    // Sprawdzane PRZEŁADOWANIEM, nie rozgłoszeniem: `visibleTo` jest białą
    // listą rodzajów, a wiersz spoza niej dociera na żywo i znika przy
    // pierwszym odświeżeniu — z konta autora wygląda wtedy na w pełni sprawny
    // (klauzula `authorId`). Dokładnie tak siedziały dwa błędy naraz w 37 i 30b.
    const messageId = await askAndClose();

    const outsider = await createSocket(rogueCookie).firstSync;
    expect(outsider.messages.some((row) => row.id === messageId)).toBe(false);
    expect(outsider.messages.some((row) => row.kind === 'request')).toBe(false);

    for (const cookie of [gmCookie, vexCookie]) {
      const sync = await createSocket(cookie).firstSync;
      expect(sync.messages.some((row) => row.id === messageId)).toBe(true);
    }
  });
});
