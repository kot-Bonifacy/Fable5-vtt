import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  CharacterUpsertBroadcast,
  CharacterView,
  CpredCharacterData,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenUpsertBroadcast,
  TokenView,
} from '@vtt/shared';
import { cpredSheetHpMax } from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { joinUrl } from './test-join.js';

/**
 * MG leczy i nakłada stany ręką (zaległość z 10.10.2026).
 *
 * Efekty na Cechach (`stat-effects.test.ts`) i efekty żetonu w turze
 * (`turn-effects.test.ts`) mają własne pliki. Tu jest reszta tego, co MG robi
 * przy stole bez rzutu: wpisuje PW na cudzej karcie i na figurze bez karty,
 * kładzie postać gracza do łóżka, podaje za nią dawkę i przełącza naklejki
 * stanów. Każdy krok sprawdza dwie rzeczy — co zapisał serwer i co **gracz**
 * dostał na gnieździe bez przeładowania strony.
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
let playerId: string;
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
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), 5000);
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

function waitFor<T>(socket: ClientSocket, event: string, ms = 4000): Promise<T> {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolvePromise(payload);
    });
  });
}

/**
 * Pierwsza paczka zdarzenia, która spełnia warunek. Gracz dostaje po drodze
 * cudze figury i odświeżenia, więc „pierwsze `token:upsert`” nie wystarcza —
 * łapiemy to, które dotyczy sprawdzanej figury w sprawdzanym stanie.
 */
function waitForMatch<T>(
  socket: ClientSocket,
  event: string,
  match: (payload: T) => boolean,
  ms = 4000,
): Promise<T> {
  return new Promise((resolvePromise, reject) => {
    const listener = (payload: T) => {
      if (!match(payload)) return;
      clearTimeout(timer);
      socket.off(event, listener);
      resolvePromise(payload);
    };
    const timer = setTimeout(() => {
      socket.off(event, listener);
      reject(new Error(`${event} matching payload timeout`));
    }, ms);
    socket.on(event, listener);
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
    payload: { login: 'MG', password: GM_PASSWORD },
  });
  gmCookie = cookieOf(login.headers['set-cookie']);

  const campaignRes = await built.app.inject({
    method: 'POST',
    url: '/api/campaigns',
    headers: { cookie: gmCookie },
    payload: { name: 'Szpital polowy' },
  });
  const join = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, (campaignRes.json() as { id: string }).id, 'Marek'),
  });
  playerCookie = cookieOf(join.headers['set-cookie']);
  playerId = (join.json() as { user: { id: string } }).user.id;
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

describe('MG leczy i przełącza stany ręką (zaległość 10.10)', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let characterId: string;
  let tokenId: string;
  let thugTokenId: string;
  let hpMax: number;

  async function sync(socket: ClientSocket): Promise<StateSyncPayload> {
    const next = waitFor<StateSyncPayload>(socket, 'state:sync');
    await emitAck(socket, 'state:request');
    return next;
  }

  async function sheetOf(socket: ClientSocket = gm): Promise<CpredCharacterData> {
    const character = (await sync(socket)).characters.find((row) => row.id === characterId);
    if (!character) throw new Error('character missing from sync');
    return character.data as CpredCharacterData;
  }

  async function tokenOf(id: string, socket: ClientSocket = gm): Promise<TokenView> {
    const token = (await sync(socket)).tokens.find((row) => row.id === id);
    if (!token) throw new Error('token missing from sync');
    return token;
  }

  /** Echo karty u gracza — `character:upsert` z danym stanem PW. */
  function playerSheetEcho(hp: number): Promise<CharacterUpsertBroadcast> {
    return waitForMatch<CharacterUpsertBroadcast>(
      player,
      'character:upsert',
      (payload) =>
        payload.character.id === characterId &&
        (payload.character.data as CpredCharacterData).hpCurrent === hp,
    );
  }

  /**
   * Figura u gracza po zmianie — `token:upsert` tej figury z danym warunkiem.
   * Właściciel dostaje dwie paczki: publiczną (odsetek PW) i zaraz po niej
   * prywatną (liczby). `own` czeka na prywatną — tę, którą klient zostawia.
   */
  function playerTokenEcho(
    id: string,
    match: (token: TokenView) => boolean,
  ): Promise<TokenUpsertBroadcast> {
    return waitForMatch<TokenUpsertBroadcast>(
      player,
      'token:upsert',
      (payload) => payload.token.id === id && match(payload.token),
    );
  }

  function ownTokenEcho(match: (token: TokenView) => boolean): Promise<TokenUpsertBroadcast> {
    return playerTokenEcho(tokenId, (token) => token.hp !== undefined && match(token));
  }

  async function setHp(hpCurrent: number): Promise<SocketAck<CharacterView>> {
    return emitAck<CharacterView>(gm, 'character:update', {
      characterId,
      patch: { data: { hpCurrent } },
    });
  }

  it('stawia stół: karta gracza z figurą i statysta bez karty', async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);

    characterId = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Kowal', ownerId: playerId }),
      'character:create',
    ).id;
    const base = await sheetOf();
    // BC 6 i SW 6 → 10 + 5 × 6 = 40 PW; próg Poważnie Rannego to 20.
    expect(
      await emitAck(gm, 'character:update', {
        characterId,
        patch: { data: { stats: { ...base.stats, body: 6, will: 6 }, hpCurrent: 40 } },
      }),
    ).toMatchObject({ ok: true });
    hpMax = cpredSheetHpMax(await sheetOf());
    expect(hpMax).toBe(40);

    const sceneId = data(
      await emitAck<SceneView>(gm, 'scene:create', { name: 'Ambulatorium' }),
      'scene:create',
    ).id;
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'open' });
    await emitAck(gm, 'scene:activate', { sceneId });
    tokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Kowal',
        x: 100,
        y: 100,
        characterId,
        ownerId: playerId,
      }),
      'token:create',
    ).id;
    thugTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Zbir',
        x: 300,
        y: 100,
        hp: { current: 20, max: 20 },
      }),
      'token:create',
    ).id;

    expect((await sheetOf()).hpCurrent).toBe(40);
    expect((await tokenOf(tokenId, player)).hp).toEqual({ current: 40, max: 40 });
  });

  describe('(1) PW cudzej karty z `character:update`', () => {
    it('gracz od razu widzi nowe PW na karcie i na pasku swojej figury', async () => {
      const sheetEcho = playerSheetEcho(25);
      const tokenEcho = ownTokenEcho((token) => token.hp?.current === 25);
      expect(await setHp(25)).toMatchObject({ ok: true });

      await sheetEcho;
      expect((await tokenEcho).token.hp).toEqual({ current: 25, max: 40 });
      expect((await sheetOf(player)).hpCurrent).toBe(25);
    });

    it('zejście przez próg nakleja „Poważnie ranny”, a powrót nad próg ją zdejmuje', async () => {
      const down = ownTokenEcho((token) => token.statuses.includes('seriously-wounded'));
      expect(await setHp(20)).toMatchObject({ ok: true });
      expect((await down).token.hp).toEqual({ current: 20, max: 40 });

      const dying = ownTokenEcho((token) => token.statuses.includes('mortally-wounded'));
      expect(await setHp(0)).toMatchObject({ ok: true });
      // Naklejki ran są wyłączne: Śmiertelnie Ranny nie jest przy tym Poważnie Rannym.
      expect((await dying).token.statuses).not.toContain('seriously-wounded');

      const up = ownTokenEcho((token) => token.hp?.current === 21 && token.statuses.length === 0);
      expect(await setHp(21)).toMatchObject({ ok: true });
      await up;
      expect((await tokenOf(tokenId)).statuses).toEqual([]);
    });

    it('PW ponad maksimum przycina do maksimum, a ujemnych nie przyjmuje', async () => {
      const full = playerSheetEcho(hpMax);
      expect(await setHp(999)).toMatchObject({ ok: true });
      await full;
      expect((await sheetOf()).hpCurrent).toBe(hpMax);

      expect(await setHp(-3)).toMatchObject({ ok: false, error: 'INVALID_DATA' });
      expect((await sheetOf()).hpCurrent).toBe(hpMax);
    });
  });

  describe('(2) PW figury bez karty z menu żetonu (`token:update`)', () => {
    it('MG wpisuje PW, serwer przycina je do 0–max i pilnuje naklejek', async () => {
      const hurt = data(
        await emitAck<TokenView>(gm, 'token:update', {
          tokenId: thugTokenId,
          patch: { hp: { current: 5, max: 20 } },
        }),
        'token:update',
      );
      expect(hurt.hp).toEqual({ current: 5, max: 20 });
      expect(hurt.statuses).toEqual(['seriously-wounded']);

      const over = data(
        await emitAck<TokenView>(gm, 'token:update', {
          tokenId: thugTokenId,
          patch: { hp: { current: 50, max: 20 } },
        }),
        'token:update',
      );
      expect(over.hp).toEqual({ current: 20, max: 20 });
      expect(over.statuses).toEqual([]);

      const below = data(
        await emitAck<TokenView>(gm, 'token:update', {
          tokenId: thugTokenId,
          patch: { hp: { current: -4, max: 20 } },
        }),
        'token:update',
      );
      expect(below.hp).toEqual({ current: 0, max: 20 });
      expect(below.statuses).toEqual(['mortally-wounded']);
    });

    it('gracz widzi tylko odsetek PW statysty, nigdy liczby', async () => {
      const echo = playerTokenEcho(
        thugTokenId,
        (token) => token.hpShare != null && token.statuses.includes('seriously-wounded'),
      );
      await emitAck(gm, 'token:update', {
        tokenId: thugTokenId,
        patch: { hp: { current: 10, max: 20 } },
      });
      const seen = (await echo).token;
      expect(seen.hp).toBeUndefined();
      expect(seen.statuses).toEqual(['seriously-wounded']);
    });

    it('gracz nie wpisze PW żadnej figurze — także swojej', async () => {
      for (const id of [thugTokenId, tokenId]) {
        expect(
          await emitAck(player, 'token:update', {
            tokenId: id,
            patch: { hp: { current: 1, max: 20 } },
          }),
        ).toEqual({ ok: false, error: 'FORBIDDEN' });
      }
      expect((await tokenOf(thugTokenId)).hp).toEqual({ current: 10, max: 20 });
    });
  });

  describe('(3) odpoczynek i dawka za postać gracza', () => {
    it('MG kładzie postać gracza do łóżka: doba zwraca BC punktów', async () => {
      expect(
        await emitAck(gm, 'character:update', {
          characterId,
          patch: { data: { hpCurrent: 18, recovery: { stabilized: true, antibioticDays: 0 } } },
        }),
      ).toMatchObject({ ok: true });

      const echo = playerSheetEcho(24);
      const rested = data(
        await emitAck<{ healed: number; hpCurrent: number }>(gm, 'character:rest', {
          characterId,
        }),
        'character:rest',
      );
      expect(rested).toMatchObject({ healed: 6, hpCurrent: 24 });
      await echo;
    });

    it('MG podaje dawkę z ekwipunku postaci gracza: fiolka schodzi, PW wracają', async () => {
      const sheet = await sheetOf();
      const vial = {
        id: 'turbo-row',
        name: 'Turbo uzdrawiacz',
        notes: '',
        qty: 2,
        consumable: 'pharma.turbo-uzdrawiacz',
      };
      // Podać środek umie tylko Medyk z punktem w Farmaceutykach (s. 149).
      expect(
        await emitAck(gm, 'character:update', {
          characterId,
          patch: {
            data: {
              roleId: 'medtech',
              roleAbilityRank: 1,
              medicine: { pharma: 1 },
              gear: [...sheet.gear, vial],
            },
          },
        }),
      ).toMatchObject({ ok: true });

      // Turbo uzdrawiacz: natychmiast BC + SW = 12 PW.
      const echo = playerSheetEcho(36);
      const dose = data(
        await emitAck<{ qtyLeft: number; healed: number }>(gm, 'character:use-dose', {
          characterId,
          gearRowId: vial.id,
        }),
        'character:use-dose',
      );
      expect(dose).toMatchObject({ qtyLeft: 1, healed: 12 });
      await echo;
      const after = await sheetOf(player);
      expect(after.hpCurrent).toBe(36);
      expect(after.gear.find((row) => row.id === vial.id)?.qty).toBe(1);
    });
  });

  describe('(4) naklejki stanów na figurze gracza', () => {
    it('MG zakłada i zdejmuje stan, a gracz widzi to od razu', async () => {
      const on = ownTokenEcho((token) => token.statuses.includes('prone'));
      expect(
        await emitAck(gm, 'token:update', { tokenId, patch: { statuses: ['prone'] } }),
      ).toMatchObject({ ok: true });
      await on;

      const off = ownTokenEcho((token) => !token.statuses.includes('prone'));
      expect(await emitAck(gm, 'token:update', { tokenId, patch: { statuses: [] } })).toMatchObject(
        { ok: true },
      );
      await off;
      expect((await tokenOf(tokenId, player)).statuses).toEqual([]);
    });

    it('gracz nie przełączy stanu nawet na własnej figurze', async () => {
      expect(
        await emitAck(player, 'token:update', { tokenId, patch: { statuses: ['prone'] } }),
      ).toEqual({ ok: false, error: 'FORBIDDEN' });
      expect((await tokenOf(tokenId)).statuses).toEqual([]);
    });
  });
});
