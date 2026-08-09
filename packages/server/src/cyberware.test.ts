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
  InvitationSummary,
  SocketAck,
  StateSyncPayload,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Stage 23a smoke tests: chrome in, chrome out, therapy.
 *
 * What they are really guarding is the one thing the client must never decide —
 * how much Humanity a piece of cyberware took. Every assertion below reads the
 * number back off the sheet the server saved, not off the payload that asked
 * for the install.
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

/** The sheet as the server has it right now. */
async function sheetOf(socket: ClientSocket, characterId: string): Promise<CpredCharacterData> {
  const ack = await emitAck<CharacterView>(socket, 'character:update', {
    characterId,
    patch: {},
  });
  if (!ack.ok || !ack.data) throw new Error('character:update failed');
  return ack.data.data as CpredCharacterData;
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
    payload: { name: 'Klinika' },
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

describe('cyborgizacje i człowieczeństwo', () => {
  let gm: ClientSocket;
  let vex: ClientSocket;
  let rogue: ClientSocket;
  let characterId: string;

  it('zakłada postać z EMP 6, czyli 60 punktami Człowieczeństwa', async () => {
    const gmConn = createSocket(gmCookie);
    const vexConn = createSocket(vexCookie);
    const rogueConn = createSocket(rogueCookie);
    gm = gmConn.socket;
    vex = vexConn.socket;
    rogue = rogueConn.socket;
    await Promise.all([gmConn.firstSync, vexConn.firstSync, rogueConn.firstSync]);

    const ack = await emitAck<CharacterView>(gm, 'character:create', {
      name: 'Kai',
      ownerId: vexId,
    });
    if (!ack.ok || !ack.data) throw new Error('character:create failed');
    characterId = ack.data.id;

    const stats = (ack.data.data as CpredCharacterData).stats;
    const updated = await emitAck<CharacterView>(gm, 'character:update', {
      characterId,
      patch: {
        data: {
          stats: { ...stats, emp: 6 },
          humanityCurrent: 60,
          skills: { empathy: 4 },
          // Stage 23b: chrome costs money, so a ripperdoc's client needs some.
          eddies: 20_000,
        },
      },
    });
    if (!updated.ok || !updated.data) throw new Error('character:update failed');
    expect((updated.data.data as CpredCharacterData).humanityCurrent).toBe(60);
    expect((updated.data.data as CpredCharacterData).eddies).toBe(20_000);
  });

  it('nie instaluje chromu, na który postaci nie stać (etap 23b)', async () => {
    const broke = await emitAck<CharacterView>(gm, 'character:create', { name: 'Bez grosza' });
    if (!broke.ok || !broke.data) throw new Error('character:create failed');
    // Ramownica: 1000 ed wszczepu + 1000 ed za szpital — na koncie zero.
    const ack = await emitAck(gm, 'character:cyberware', {
      characterId: broke.data.id,
      action: 'install',
      entryId: 'cyberware.ramownica-przykladowa',
    });
    expect(ack).toEqual({ ok: false, error: 'NOT_ENOUGH_EDDIES' });
    // Odmowa przyszła PRZED rzutem: karta pozostała bez wszczepu.
    const sheet = await sheetOf(gm, broke.data.id);
    expect(sheet.cyberware).toHaveLength(0);
    await emitAck(gm, 'character:delete', { characterId: broke.data.id });
  });

  it('instaluje wszczep: rzut na czacie, wiersz na karcie, Człowieczeństwo w dół', async () => {
    const card = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    const ack = await emitAck<{ messageId: number }>(vex, 'character:cyberware', {
      characterId,
      action: 'install',
      entryId: 'cyberware.oko-przykladowe',
    });
    expect(ack.ok).toBe(true);

    const roll = (await card).message.roll;
    expect(roll?.title).toBe('Utrata Człowieczeństwa — Cyberoko przykładowe');
    expect(roll?.actor).toBe('Kai');
    expect(roll?.notation).toBe('2d6');
    const rolled = roll?.total ?? 0;
    expect(rolled).toBeGreaterThanOrEqual(2);
    expect(rolled).toBeLessThanOrEqual(12);

    const data = await sheetOf(vex, characterId);
    expect(data.cyberware).toHaveLength(1);
    // Karta niesie własną kopię zasad wpisu — nie odsyła do katalogu.
    expect(data.cyberware[0]).toMatchObject({
      compendiumId: 'cyberware.oko-przykladowe',
      type: 'cyberoptics',
      install: 'clinic',
      foundation: true,
      slots: 3,
      humanityMaxPenalty: 2,
      humanityLoss: rolled,
    });
    // Sufit spadł o 2, a pula o tyle, ile padło na kościach.
    expect(data.humanityCurrent).toBe(Math.min(60 - rolled, 58));
    // Etap 23b: 100 ed za oko + 500 ed za montaż w klinice (s. 375).
    expect(data.eddies).toBe(20_000 - 600);
    expect(roll?.outcome?.detail).toContain('600 ed');
  });

  it('nie pozwala instalować cudzego chromu', async () => {
    const ack = await emitAck(rogue, 'character:cyberware', {
      characterId,
      action: 'install',
      entryId: 'cyberware.oko-przykladowe',
    });
    expect(ack).toEqual({ ok: false, error: 'CHARACTER_NOT_FOUND' });
  });

  it('odrzuca istniejący wpis, który nie jest cyborgizacją', async () => {
    const ack = await emitAck(vex, 'character:cyberware', {
      characterId,
      action: 'install',
      entryId: 'weapon.zgrzyt-9',
    });
    expect(ack).toEqual({ ok: false, error: 'ENTRY_NOT_FOUND' });
  });

  it('połowi utratę w górę, gdy wpis tak każe', async () => {
    const before = await sheetOf(vex, characterId);
    const card = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    const ack = await emitAck<{ messageId: number }>(vex, 'character:cyberware', {
      characterId,
      action: 'install',
      entryId: 'cyberware.wkladka-teleoptyczna',
    });
    expect(ack.ok).toBe(true);
    const roll = (await card).message.roll;
    expect(roll?.notation).toBe('1d6');
    const expected = Math.ceil((roll?.total ?? 0) / 2);
    expect(roll?.outcome?.detail).toContain('1k6 / 2 w górę');

    const after = await sheetOf(vex, characterId);
    expect(before.humanityCurrent - after.humanityCurrent).toBe(expected);
    expect(after.cyberware[1]?.slotCost).toBe(2);
  });

  it('ozdoba bez UC nie rusza ani puli, ani sufitu', async () => {
    const before = await sheetOf(vex, characterId);
    const ack = await emitAck<{ messageId: number }>(vex, 'character:cyberware', {
      characterId,
      action: 'install',
      entryId: 'cyberware.tatuaz-przykladowy',
    });
    expect(ack.ok).toBe(true);
    const after = await sheetOf(vex, characterId);
    expect(after.humanityCurrent).toBe(before.humanityCurrent);
    expect(after.cyberware.at(-1)?.humanityMaxPenalty).toBeUndefined();
  });

  it('borgizacja kosztuje sufit podwójnie', async () => {
    const before = await sheetOf(vex, characterId);
    const beforeCeiling =
      60 - before.cyberware.reduce((s, r) => s + (r.humanityMaxPenalty ?? 0), 0);
    const ack = await emitAck<{ messageId: number }>(vex, 'character:cyberware', {
      characterId,
      action: 'install',
      entryId: 'cyberware.ramownica-przykladowa',
    });
    expect(ack.ok).toBe(true);
    const after = await sheetOf(vex, characterId);
    expect(after.cyberware.at(-1)?.humanityMaxPenalty).toBe(4);
    const afterCeiling = 60 - after.cyberware.reduce((s, r) => s + (r.humanityMaxPenalty ?? 0), 0);
    expect(beforeCeiling - afterCeiling).toBe(4);
  });

  it('usunięcie oddaje sufit, ale nie oddaje punktów', async () => {
    const before = await sheetOf(vex, characterId);
    const rowId = before.cyberware.at(-1)?.id;
    const ack = await emitAck<{ messageId: number }>(vex, 'character:cyberware', {
      characterId,
      action: 'remove',
      rowId,
    });
    expect(ack.ok).toBe(true);
    const after = await sheetOf(vex, characterId);
    expect(after.cyberware.some((row) => row.id === rowId)).toBe(false);
    expect(after.humanityCurrent).toBe(before.humanityCurrent);
  });

  it('odmawia usunięcia wiersza, którego na karcie nie ma', async () => {
    const ack = await emitAck(vex, 'character:cyberware', {
      characterId,
      action: 'remove',
      rowId: 'nie-ma-takiego',
    });
    expect(ack).toEqual({ ok: false, error: 'ROW_NOT_FOUND' });
  });

  it('terapia oddaje 2k6 i nigdy nie przekracza sufitu', async () => {
    // Najpierw zjedź nisko, żeby terapia miała co odrabiać.
    await emitAck<CharacterView>(vex, 'character:update', {
      characterId,
      patch: { data: { humanityCurrent: 10 } },
    });
    const before = await sheetOf(vex, characterId);
    const card = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    const ack = await emitAck<{ messageId: number }>(gm, 'character:cyberware', {
      characterId,
      action: 'therapy',
      therapy: 'ordinary',
    });
    expect(ack.ok).toBe(true);
    const roll = (await card).message.roll;
    expect(roll?.notation).toBe('2d6');
    expect(roll?.title).toContain('Terapia');

    const after = await sheetOf(vex, characterId);
    expect(after.humanityCurrent).toBe(10 + (roll?.total ?? 0));
    // Etap 23b: tydzień u Medyka to 500 ed (s. 375).
    expect(before.eddies - after.eddies).toBe(500);

    // Druga tura terapii z poziomu tuż pod sufitem — nadwyżka przepada.
    const ceiling = 60 - after.cyberware.reduce((s, r) => s + (r.humanityMaxPenalty ?? 0), 0);
    await emitAck<CharacterView>(vex, 'character:update', {
      characterId,
      patch: { data: { humanityCurrent: ceiling - 1 } },
    });
    const second = await emitAck<{ messageId: number }>(gm, 'character:cyberware', {
      characterId,
      action: 'therapy',
      therapy: 'extreme',
    });
    expect(second.ok).toBe(true);
    const capped = await sheetOf(vex, characterId);
    expect(capped.humanityCurrent).toBe(ceiling);
  });

  it('odrzuca nieznaną terapię', async () => {
    const ack = await emitAck(gm, 'character:cyberware', {
      characterId,
      action: 'therapy',
      therapy: 'cudowna',
    });
    expect(ack).toEqual({ ok: false, error: 'BAD_REQUEST' });
  });

  it('rzut na EMP idzie z Człowieczeństwa, nie z cechy na karcie', async () => {
    await emitAck<CharacterView>(vex, 'character:update', {
      characterId,
      patch: { data: { humanityCurrent: 34 } },
    });
    const card = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    const ack = await emitAck<{ messageId: number }>(vex, 'character:roll', {
      characterId,
      visibility: 'public',
      request: { kind: 'stat', statId: 'emp' },
    });
    expect(ack.ok).toBe(true);
    const roll = (await card).message.roll;
    // EMP bazowe 6, Człowieczeństwo 34 → EMP bieżące 3.
    expect(roll?.notation).toBe('1d10+3');
    expect(roll?.breakdown?.[0]?.label).toContain('obniżona Człowieczeństwem');
  });

  it('Człowieczeństwo poniżej zera przechodzi przez zapis i daje ostrą cyberpsychozę', async () => {
    const ack = await emitAck<CharacterView>(gm, 'character:update', {
      characterId,
      patch: { data: { humanityCurrent: -4 } },
    });
    expect(ack.ok).toBe(true);
    const data = await sheetOf(gm, characterId);
    expect(data.humanityCurrent).toBe(-4);
  });
});
