import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  CharacterView,
  CombatantView,
  CpredCharacterData,
  CpredStatEffect,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenView,
} from '@vtt/shared';
import {
  CPRED_HOUR_S,
  CPRED_STAT_EFFECTS_MAX,
  GAME_TIME_DEFAULT,
  cpredEffectiveStats,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Efekty czasowe na Cechach na żywych gniazdach (etap 39).
 *
 * `stateffects.test.ts` w `shared` liczy arytmetykę; tutaj sprawdzany jest
 * **szew**: że efekt jest polem pisanym wyłącznie zdarzeniem, że liczba pada
 * raz i zostaje zapisana, że oba zegary go zdejmują, i że cofnięcie zegara
 * niczego nie przywraca. Do ostatniego z nich potrzebna jest druga para oczu:
 * gracz musi zobaczyć na swojej karcie to samo, co MG.
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
    payload: { name: 'Nerwosol' },
  });
  const inviteRes = await built.app.inject({
    method: 'POST',
    url: `/api/campaigns/${(campaignRes.json() as { id: string }).id}/invitations`,
    headers: { cookie: gmCookie },
    payload: {},
  });
  const join = await built.app.inject({
    method: 'POST',
    url: `/api/join/${(inviteRes.json() as { token: string }).token}`,
    payload: { name: 'Tony' },
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

describe('efekty czasowe na Cechach (etap 39)', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let characterId: string;
  let sceneId: string;
  let tokenId: string;

  async function sync(socket: ClientSocket): Promise<StateSyncPayload> {
    const next = waitFor<StateSyncPayload>(socket, 'state:sync');
    await emitAck(socket, 'state:request');
    return next;
  }

  async function sheetOf(socket: ClientSocket): Promise<CpredCharacterData> {
    const character = (await sync(socket)).characters.find((row) => row.id === characterId);
    if (!character) throw new Error('character missing from sync');
    return character.data as CpredCharacterData;
  }

  async function effects(socket: ClientSocket = gm): Promise<CpredStatEffect[]> {
    return (await sheetOf(socket)).statEffects;
  }

  it('stawia stół: karta gracza z REF 8 na scenie', async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);

    characterId = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Tony', ownerId: playerId }),
      'character:create',
    ).id;
    const base = await sheetOf(gm);
    expect(
      await emitAck(gm, 'character:update', {
        characterId,
        patch: { data: { stats: { ...base.stats, ref: 8, move: 6 } } },
      }),
    ).toMatchObject({ ok: true });

    sceneId = data(
      await emitAck<SceneView>(gm, 'scene:create', { name: 'Zaułek' }),
      'scene:create',
    ).id;
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'open' });
    await emitAck(gm, 'scene:activate', { sceneId });
    tokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Tony',
        x: 100,
        y: 100,
        characterId,
        ownerId: playerId,
      }),
      'token:create',
    ).id;

    expect((await sheetOf(gm)).stats.ref).toBe(8);
    expect(await effects()).toEqual([]);
  });

  it('gracz nie nakłada efektów, i nie wpisuje ich łatą karty', async () => {
    expect(
      await emitAck(player, 'character:stat-effect', {
        characterId,
        stat: 'ref',
        value: -3,
        source: 'sam sobie',
      }),
    ).toEqual({ ok: false, error: 'FORBIDDEN' });

    // Furtka, którą `eddies` zamknęło w 23b: łata karty niosąca listę efektów.
    // Odmowa dotyczy **także MG** — lista wpisana ręką byłaby listą bez
    // terminów, czyli takich efektów, które nie zejdą nigdy.
    const patch = {
      characterId,
      patch: {
        data: {
          statEffects: [
            { id: 'x', stat: 'ref', value: 5, source: 'sam sobie', durationS: CPRED_HOUR_S },
          ],
        },
      },
    };
    expect(await emitAck(player, 'character:update', patch)).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
    expect(await emitAck(gm, 'character:update', patch)).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
    expect(await effects()).toEqual([]);
  });

  it('MG nakłada efekt liczbą, a karta gracza widzi go od razu', async () => {
    const incoming = waitFor<{ character: CharacterView }>(player, 'character:upsert');
    const ack = data(
      await emitAck<{ effect: CpredStatEffect }>(gm, 'character:stat-effect', {
        characterId,
        stat: 'ref',
        value: -3,
        source: 'Lisz',
      }),
      'character:stat-effect',
    );
    expect(ack.effect).toMatchObject({ stat: 'ref', value: -3, source: 'Lisz' });
    // Godzina to domyślna długość — jedyna, jakiej podręcznik używa.
    expect(ack.effect.durationS).toBe(CPRED_HOUR_S);
    // Poza walką termin rundowy nie powstaje, a termin świata **zawsze**.
    expect(ack.effect.expiresAtRound).toBeUndefined();
    expect(ack.effect.expiresAtMinute).toBe(GAME_TIME_DEFAULT + 60);

    const seen = (await incoming).character.data as CpredCharacterData;
    expect(seen.statEffects).toHaveLength(1);
    expect(cpredEffectiveStats(seen).ref).toBe(5);
  });

  it('odmawia zmiany o zero, o za dużo i bez źródła', async () => {
    for (const payload of [
      { characterId, stat: 'ref', value: 0, source: 'nic' },
      { characterId, stat: 'ref', value: 99, source: 'za dużo' },
      { characterId, stat: 'ref', value: -1, source: '   ' },
      { characterId, stat: 'nos', value: -1, source: 'Lisz' },
      { characterId, stat: 'ref', value: -1, source: 'Lisz', durationS: 0 },
    ]) {
      expect(await emitAck(gm, 'character:stat-effect', payload)).toMatchObject({ ok: false });
    }
    expect(await effects()).toHaveLength(1);
  });

  it('rzuca notację raz i zapisuje wynik jako liczbę', async () => {
    const ack = data(
      await emitAck<{ effect: CpredStatEffect }>(gm, 'character:stat-effect', {
        characterId,
        stat: 'int',
        formula: '1k6',
        negative: true,
        source: 'Nerwosol',
      }),
      'character:stat-effect',
    );
    expect(ack.effect.value).toBeLessThanOrEqual(-1);
    expect(ack.effect.value).toBeGreaterThanOrEqual(-6);
    expect(ack.effect.rolled).toBe('1k6');

    // Odczytana z bazy jest ta sama liczba, a nie kolejny rzut: efekt trzymający
    // formułę zmieniałby kartę, ilekroć ktoś na nią spojrzy.
    const stored = (await effects()).find((row) => row.id === ack.effect.id);
    expect(stored?.value).toBe(ack.effect.value);
    expect((await effects()).find((row) => row.id === ack.effect.id)?.value).toBe(ack.effect.value);

    // Dwa wejścia naraz są odmową, a nie cichym wyborem jednego z nich.
    expect(
      await emitAck(gm, 'character:stat-effect', {
        characterId,
        stat: 'int',
        formula: '1k6',
        value: -2,
        source: 'oba',
      }),
    ).toEqual({ ok: false, error: 'BAD_VALUE' });
  });

  it('MG zdejmuje jeden efekt, a drugi zostaje', async () => {
    const before = await effects();
    expect(before).toHaveLength(2);
    const removed = data(
      await emitAck<{ removed: CpredStatEffect }>(gm, 'character:stat-effect', {
        characterId,
        effectId: before[1]!.id,
      }),
      'character:stat-effect',
    );
    expect(removed.removed.source).toBe('Nerwosol');
    const after = await effects();
    expect(after.map((row) => row.source)).toEqual(['Lisz']);

    // Ten sam efekt drugi raz to odmowa, nie cisza.
    expect(
      await emitAck(gm, 'character:stat-effect', { characterId, effectId: before[1]!.id }),
    ).toEqual({ ok: false, error: 'EFFECT_NOT_FOUND' });
  });

  it('skok zegara o godzinę zdejmuje efekt sam, a gracz widzi to bez przeładowania', async () => {
    expect(await effects()).toHaveLength(1);
    const incoming = waitFor<{ character: CharacterView }>(player, 'character:upsert');
    await emitAck(gm, 'time:set', { step: 'hour' });
    const seen = (await incoming).character.data as CpredCharacterData;
    expect(seen.statEffects).toEqual([]);
    expect(cpredEffectiveStats(seen).ref).toBe(8);
    expect(await effects()).toEqual([]);
  });

  it('krótszy skok nie zdejmuje niczego przed czasem', async () => {
    await emitAck(gm, 'character:stat-effect', {
      characterId,
      stat: 'dex',
      value: -2,
      source: 'Lisz',
    });
    await emitAck(gm, 'time:set', { step: 'min10' });
    expect(await effects()).toHaveLength(1);
    await emitAck(gm, 'time:set', { step: 'hour' });
    expect(await effects()).toEqual([]);
  });

  it('cofnięty zegar niczego nie przywraca', async () => {
    const applied = data(
      await emitAck<{ effect: CpredStatEffect }>(gm, 'character:stat-effect', {
        characterId,
        stat: 'ref',
        value: -2,
        source: 'Lisz',
      }),
      'character:stat-effect',
    ).effect;
    await emitAck(gm, 'time:set', { step: 'day' });
    expect(await effects()).toEqual([]);
    // Zegar wstecz jest dozwolony i nic nie odwraca — dokładnie jak pobrany
    // czynsz i wyleczone PW z etapu 37.
    await emitAck(gm, 'time:set', { minutes: applied.expiresAtMinute! - 600 });
    expect(await effects()).toEqual([]);
  });

  it('w walce efekt liczy rundy, a nie minuty świata', async () => {
    await emitAck(gm, 'combat:start', { sceneId, tokenIds: [tokenId] });
    await emitAck(gm, 'combat:roll-all', { sceneId });
    // Runda 0 znaczy „zebrani, nikt nie działał"; pierwsze `next` otwiera 1.
    const opened = data(await emitAck<{ round: number }>(gm, 'combat:next'), 'combat:next');
    expect(opened.round).toBe(1);

    const short = data(
      await emitAck<{ effect: CpredStatEffect }>(gm, 'character:stat-effect', {
        characterId,
        stat: 'ref',
        value: -2,
        source: 'Gaz',
        durationS: 60,
      }),
      'character:stat-effect',
    ).effect;
    // Sześć rund na minutę — i termin świata obok, na wypadek końca walki.
    // Runda czyta się ze sceny **celu**, a nie z tej, którą ogląda MG.
    expect(short.expiresAtRound).toBe(1 + 6);
    expect(short.expiresAtMinute).toBeGreaterThan(0);

    // Minuta świata nie ruszyła się ani o krok, a efekt i tak schodzi.
    for (let step = 0; step < 6; step += 1) await emitAck(gm, 'combat:next');
    expect((await sync(gm)).combat?.round).toBe(short.expiresAtRound);
    expect(await effects()).toEqual([]);
    await emitAck(gm, 'combat:end', { sceneId });
  });

  it('nie przyjmuje więcej efektów, niż mieści karta', async () => {
    const room = CPRED_STAT_EFFECTS_MAX - (await effects()).length;
    for (let index = 0; index < room; index += 1) {
      expect(
        await emitAck(gm, 'character:stat-effect', {
          characterId,
          stat: 'ref',
          value: -1,
          source: `Lisz ${index}`,
        }),
      ).toMatchObject({ ok: true });
    }
    expect(
      await emitAck(gm, 'character:stat-effect', {
        characterId,
        stat: 'ref',
        value: -1,
        source: 'jeden za dużo',
      }),
    ).toEqual({ ok: false, error: 'TOO_MANY_EFFECTS' });

    // Podłoga trzyma mimo dwudziestu czterech efektów po −1 na REF 8.
    expect(cpredEffectiveStats(await sheetOf(gm)).ref).toBe(1);
  });
});

/** Ostrzega przed zmianą typu, którą kompilator by przepuścił. */
export type CombatantSanity = CombatantView;
