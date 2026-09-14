import sharp from 'sharp';
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  CampaignSummary,
  CharacterDeleteBroadcast,
  CharacterUpsertBroadcast,
  CharacterView,
  CpredCharacterData,
  InvitationSummary,
  PortraitAssetView,
  SocketAck,
  StateSyncPayload,
} from '@vtt/shared';
import { CPRED_SCHEMA_VERSION, DEFAULT_PORTRAIT_CROP } from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

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
  // Deliberately absent: tests run on the committed sample compendium,
  // which is also the "fresh clone without data/private" path.
  dataPrivateDir: resolve(import.meta.dirname, 'fixtures/no-private-data'),
  // The gateway is never reachable in these suites — bots stay unavailable.
  aiGatewayUrl: 'http://127.0.0.1:1',
  aiGatewayApiKey: '',
  aiHealthIntervalMs: 60_000,
  aiRequestTimeoutMs: 1000,
};

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

let built: BuiltApp;
let baseUrl: string;
let gmCookie: string;
let vexCookie: string;
let vexId: string;
let rogueCookie: string;
let rogueId: string;
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

function waitFor<T>(socket: ClientSocket, event: string, ms = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

/** Round-trips `state:request` → `state:sync`, flushing in-flight traffic. */
async function roundTrip(socket: ClientSocket): Promise<StateSyncPayload> {
  const sync = waitFor<StateSyncPayload>(socket, 'state:sync');
  await emitAck(socket, 'state:request');
  return sync;
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

function multipartBody(
  filename: string,
  content: Buffer,
): { payload: Buffer; headers: Record<string, string> } {
  const boundary = `----vtt${randomBytes(8).toString('hex')}`;
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat([head, content, tail]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
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
    payload: { name: 'Kampania postaci' },
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
  rogueId = (joinRogue.json() as { user: { id: string } }).user.id;
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

describe('characters', () => {
  let gm: ClientSocket;
  let vex: ClientSocket;
  let rogue: ClientSocket;
  let vexCharacterId: string;
  /** Every character event Rogue's socket ever receives — leak detector. */
  const rogueCharacterTraffic: unknown[] = [];

  it('GM creates a character assigned to a player; only that player is notified', async () => {
    const gmConn = createSocket(gmCookie);
    const vexConn = createSocket(vexCookie);
    const rogueConn = createSocket(rogueCookie);
    gm = gmConn.socket;
    vex = vexConn.socket;
    rogue = rogueConn.socket;
    for (const event of ['character:upsert', 'character:delete']) {
      rogue.on(event, (payload: unknown) => rogueCharacterTraffic.push(payload));
    }
    await Promise.all([gmConn.firstSync, vexConn.firstSync, rogueConn.firstSync]);

    const vexUpsert = waitFor<CharacterUpsertBroadcast>(vex, 'character:upsert');
    const ack = await emitAck<CharacterView>(gm, 'character:create', {
      name: 'Forty',
      ownerId: vexId,
    });
    expect(ack.ok).toBe(true);
    if (!ack.ok || !ack.data) throw new Error('create failed');
    vexCharacterId = ack.data.id;
    expect(ack.data.ownerId).toBe(vexId);
    const data = ack.data.data as CpredCharacterData;
    expect(data.schemaVersion).toBe(CPRED_SCHEMA_VERSION);
    expect(data.hpCurrent).toBe(35); // default stats 5/5

    const received = await vexUpsert;
    expect(received.character.id).toBe(vexCharacterId);

    // Rogue (another player) saw nothing.
    const rogueSync = await roundTrip(rogue);
    expect(rogueSync.characters).toHaveLength(0);
    expect(rogueCharacterTraffic).toHaveLength(0);
  });

  it('state:sync filters characters per viewer (GM: all, player: own)', async () => {
    const npcAck = await emitAck<CharacterView>(gm, 'character:create', { name: 'Ziti' });
    expect(npcAck.ok).toBe(true);

    const gmSync = await roundTrip(gm);
    expect(gmSync.characters.map((c) => c.name).sort()).toEqual(['Forty', 'Ziti']);

    const vexSync = await roundTrip(vex);
    expect(vexSync.characters.map((c) => c.name)).toEqual(['Forty']);
  });

  it('a player creating a character always owns it', async () => {
    const ack = await emitAck<CharacterView>(rogue, 'character:create', {
      name: 'Sznur',
      ownerId: vexId, // ignored for players
    });
    expect(ack.ok).toBe(true);
    if (!ack.ok || !ack.data) throw new Error('create failed');
    expect(ack.data.ownerId).toBe(rogueId);
    await emitAck(rogue, 'character:delete', { characterId: ack.data.id });
  });

  it('owner edits propagate live to the GM, with derived HP recomputed', async () => {
    const gmUpsert = waitFor<CharacterUpsertBroadcast>(gm, 'character:upsert');
    const sync = await roundTrip(vex);
    const current = sync.characters[0]!.data as CpredCharacterData;

    const ack = await emitAck<CharacterView>(vex, 'character:update', {
      characterId: vexCharacterId,
      patch: { data: { stats: { ...current.stats, body: 2, will: 2 } } },
    });
    expect(ack.ok).toBe(true);
    if (!ack.ok || !ack.data) throw new Error('update failed');
    const data = ack.data.data as CpredCharacterData;
    // 10 + 5*ceil((2+2)/2) = 20; hpCurrent clamped down from 35.
    expect(data.hpCurrent).toBe(20);

    const received = await gmUpsert;
    expect((received.character.data as CpredCharacterData).stats.body).toBe(2);
  });

  it('rejects invalid sheet data and foreign edits', async () => {
    const sync = await roundTrip(vex);
    const current = sync.characters[0]!.data as CpredCharacterData;
    const badStats = await emitAck(vex, 'character:update', {
      characterId: vexCharacterId,
      patch: { data: { stats: { ...current.stats, int: 11 } } },
    });
    expect(badStats).toEqual({ ok: false, error: 'INVALID_DATA' });

    // Rogue must not even learn the character exists.
    const foreign = await emitAck(rogue, 'character:update', {
      characterId: vexCharacterId,
      patch: { name: 'Przejęta' },
    });
    expect(foreign).toEqual({ ok: false, error: 'CHARACTER_NOT_FOUND' });

    const foreignDelete = await emitAck(rogue, 'character:delete', {
      characterId: vexCharacterId,
    });
    expect(foreignDelete).toEqual({ ok: false, error: 'CHARACTER_NOT_FOUND' });

    // Owner cannot reassign ownership — that is a GM action.
    const ownerChange = await emitAck(vex, 'character:update', {
      characterId: vexCharacterId,
      patch: { ownerId: null },
    });
    expect(ownerChange).toEqual({ ok: false, error: 'FORBIDDEN' });
  });

  it('reassigning the owner moves the character between players', async () => {
    const rogueUpsert = waitFor<CharacterUpsertBroadcast>(rogue, 'character:upsert');
    const vexDelete = waitFor<CharacterDeleteBroadcast>(vex, 'character:delete');

    const ack = await emitAck<CharacterView>(gm, 'character:update', {
      characterId: vexCharacterId,
      patch: { ownerId: rogueId },
    });
    expect(ack.ok).toBe(true);

    expect((await rogueUpsert).character.id).toBe(vexCharacterId);
    expect((await vexDelete).characterId).toBe(vexCharacterId);

    const vexSync = await roundTrip(vex);
    expect(vexSync.characters).toHaveLength(0);
    const rogueSync = await roundTrip(rogue);
    expect(rogueSync.characters.map((c) => c.id)).toContain(vexCharacterId);
  });

  it('unknown skills are dropped, known ones persist', async () => {
    const ack = await emitAck<CharacterView>(gm, 'character:update', {
      characterId: vexCharacterId,
      patch: { data: { skills: { handgun: 6, 'made-up-skill': 3 } } },
    });
    expect(ack.ok).toBe(true);
    if (!ack.ok || !ack.data) throw new Error('update failed');
    expect((ack.data.data as CpredCharacterData).skills).toEqual({ handgun: 6 });
  });

  // Stage 27c — page two and page three of the printed sheet.
  it('the player writes their own page two and places their own chrome', async () => {
    // Wiersz należy teraz do gracza `rogue` — poprzedni przypadek przeniósł
    // właściciela; ważne jest, że pisze go **gracz**, a nie MG.
    const ack = await emitAck<CharacterView>(rogue, 'character:update', {
      characterId: vexCharacterId,
      patch: {
        data: {
          aliases: 'Kolec',
          lifepath: { culture: 'Europa Środkowa', language: 'Czeski', enemies: [{ name: 'Vex' }] },
          cyberware: [
            { id: 'eye1', name: 'Cyberoko', notes: '', type: 'cyberoptics', bodySlot: 'eyeLeft' },
          ],
        },
      },
    });
    expect(ack.ok).toBe(true);
    if (!ack.ok || !ack.data) throw new Error('update failed');
    const data = ack.data.data as CpredCharacterData;
    expect(data.aliases).toBe('Kolec');
    expect(data.lifepath.culture).toBe('Europa Środkowa');
    expect(data.lifepath.enemies[0]?.name).toBe('Vex');
    expect(data.cyberware[0]?.bodySlot).toBe('eyeLeft');
  });

  /**
   * Etap 29a: licznik PD i to, co się z niego kupuje, wychodzą spod ręki
   * gracza. „Gracze mogą wydawać Punkty Doświadczenia" (s. 411) zostaje w mocy —
   * tyle że przez `character:advance`, który liczy cenę, a nie przez wpisanie
   * liczby. Te same drzwi, które `eddies` zamknęły w 23b.
   */
  it('the player may no longer type PD, a skill level or the ability rank', async () => {
    for (const data of [
      { improvementPoints: 45 },
      { skills: { perception: 7 } },
      { roleAbilityRank: 6 },
      { roleId: 'solo' },
    ]) {
      const ack = await emitAck<CharacterView>(rogue, 'character:update', {
        characterId: vexCharacterId,
        patch: { data },
      });
      expect(ack.ok).toBe(false);
      if (!ack.ok) expect(ack.error).toBe('FORBIDDEN');
    }
  });

  /**
   * Znalezione przy oględzinach 30b. `roleId` jedzie u MG zwykłą łatą (29a),
   * więc zmiana Roli zabierała Zdolność, zostawiając jej sakiewkę — a wtedy
   * `cpredSpecialtiesProblem` odrzucał tę samą łatę zdaniem „Ta postać nie ma
   * tej Zdolności Specjalnej". Medyka z wydanymi punktami nie dało się zrobić
   * niczym innym, dopóki ktoś ręcznie nie wyzerował Specjalizacji.
   */
  it('lets the GM change the Role of a Medyk who has spent Specialty points', async () => {
    const spent = await emitAck<CharacterView>(gm, 'character:update', {
      characterId: vexCharacterId,
      patch: { data: { roleId: 'medtech', roleAbilityRank: 4, medicine: { surgery: 3 } } },
    });
    expect(spent.ok).toBe(true);

    const changed = await emitAck<CharacterView>(gm, 'character:update', {
      characterId: vexCharacterId,
      patch: { data: { roleId: 'tech' } },
    });
    expect(changed.ok).toBe(true);
    if (!changed.ok || !changed.data) throw new Error('role change failed');
    const data = changed.data.data as CpredCharacterData;
    expect(data.roleId).toBe('tech');
    // Punkty bez Zdolności, która je kupiła, schodzą z karty — inaczej wracają
    // przy każdej następnej łacie jako odmowa.
    expect(data.medicine).toEqual({});
  });
});

describe('portrait uploads', () => {
  /**
   * Od 23.08 pliki portretów dokłada **wyłącznie MG** — gracz wybiera z puli
   * kampanii (`/api/portrait-assets`, testy w `tokens.test.ts`). Wcześniej ta
   * trasa stała na `requireAuth` i każdy wgrywał, co chciał.
   *
   * Od 12.09 jest to **jedna trasa**: `/api/uploads/portraits`, która zapisywała
   * plik bez wiersza w bazie, zniknęła. Portret bez wiersza nie miał gdzie
   * trzymać kadru na mapie i nikomu drugi raz się nie przydawał.
   */
  it('accepts a GM upload and refuses players and anonymous alike', async () => {
    const { payload, headers } = multipartBody(
      'portret.png',
      await sharp({ create: { width: 256, height: 256, channels: 3, background: 'red' } })
        .png()
        .toBuffer(),
    );
    const res = await built.app.inject({
      method: 'POST',
      url: '/api/uploads/portrait-assets',
      headers: { ...headers, cookie: gmCookie },
      payload,
    });
    expect(res.statusCode).toBe(201);
    const result = res.json() as PortraitAssetView;
    expect(result.url).toMatch(/^\/uploads\/portraits\/.+\.webp$/);
    // Świeży portret ma kadr domyślny, czyli dokładnie to ujęcie, które mapa
    // rysowała przed 12.09 — wgranie niczego nie przestawia samo z siebie.
    expect(result.crop).toEqual(DEFAULT_PORTRAIT_CROP);

    const player = await built.app.inject({
      method: 'POST',
      url: '/api/uploads/portrait-assets',
      headers: { ...headers, cookie: vexCookie },
      payload,
    });
    expect(player.statusCode).toBe(403);

    const anonymous = await built.app.inject({
      method: 'POST',
      url: '/api/uploads/portrait-assets',
      headers,
      payload,
    });
    expect(anonymous.statusCode).toBe(401);
  });

  /** Trasa zdjęta 12.09 — gdyby wróciła, wróciłby portret bez kadru. */
  it('no longer answers the crop-less direct route', async () => {
    const { payload, headers } = multipartBody('portret.png', PNG_1X1);
    const res = await built.app.inject({
      method: 'POST',
      url: '/api/uploads/portraits',
      headers: { ...headers, cookie: gmCookie },
      payload,
    });
    expect(res.statusCode).toBe(404);
  });
});
