import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { createDefaultCharacterData } from '@vtt/shared';
import type {
  CampaignSummary,
  ChatMessageBroadcast,
  CharacterView,
  CombatView,
  CombatantView,
  CpredCharacterData,
  DamageLogEntry,
  InvitationSummary,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenView,
} from '@vtt/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { loadCpredRegistry } from './cpred.js';
import { readSheetInitiative } from './sheets.js';

/**
 * Zmysł Walki na żywych gniazdach (etap 30a).
 *
 * `roleability.test.ts` liczy progi i efekty; tutaj sprawdzany jest **szew**:
 * że przydział jedzie własnym zdarzeniem, że łata karty go nie przepuszcza,
 * że zmiana w środku walki naprawdę kosztuje Akcję — i że „pierwsze obrażenia
 * otrzymane w tej Rundzie" (s. 146) są pierwsze raz na Rundę, a nie raz na cios.
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

/** Cichy logger dla `loadCpredRegistry` — ten test nie sprawdza ostrzeżeń. */
const log = {
  warn: () => {},
  info: () => {},
  error: () => {},
  debug: () => {},
  trace: () => {},
  fatal: () => {},
} as unknown as FastifyBaseLogger;

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

/** Resolves on the first chat message that carries an applied-damage entry. */
function waitForDamage(socket: ClientSocket, ms = 3000): Promise<ChatMessageBroadcast> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('chat:message', onMessage);
      reject(new Error('chat:message timeout'));
    }, ms);
    const onMessage = (payload: ChatMessageBroadcast) => {
      if (payload.message.damage === undefined) return;
      clearTimeout(timer);
      socket.off('chat:message', onMessage);
      resolve(payload);
    };
    socket.on('chat:message', onMessage);
  });
}

function emitAck<T = undefined>(
  socket: ClientSocket,
  event: string,
  payload?: unknown,
): Promise<SocketAck<T>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), 5000);
    const ack = (response: SocketAck<T>) => {
      clearTimeout(timer);
      resolve(response);
    };
    if (payload === undefined) socket.emit(event, ack);
    else socket.emit(event, payload, ack);
  });
}

/** Unwraps an ack that must have succeeded. */
function data<T>(ack: SocketAck<T>, what: string): T {
  if (!ack.ok || ack.data === undefined) throw new Error(`${what} failed: ${JSON.stringify(ack)}`);
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
    payload: { name: 'Kampania Zmysłu Walki' },
  });
  const campaignId = (campaignRes.json() as CampaignSummary).id;

  const inviteRes = await built.app.inject({
    method: 'POST',
    url: `/api/campaigns/${campaignId}/invitations`,
    headers: { cookie: gmCookie },
    payload: {},
  });
  const invite = (inviteRes.json() as InvitationSummary).token;

  const joinRes = await built.app.inject({
    method: 'POST',
    url: `/api/join/${invite}`,
    payload: { name: 'Kelsa' },
  });
  playerCookie = cookieOf(joinRes.headers['set-cookie']);
  playerId = (joinRes.json() as { user: { id: string } }).user.id;
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

/**
 * Błyskawiczna reakcja (s. 146): „Każdy przydzielony punkt to +1 do rzutów na
 * Inicjatywę". Sprawdzana wprost na `readSheetInitiative`, bo rzut kolejki
 * jest losowy, a pytanie brzmi o modyfikator, nie o wynik.
 */
describe('Błyskawiczna reakcja w Inicjatywie', () => {
  function sheetWith(data: Partial<CpredCharacterData>) {
    return {
      data: JSON.stringify({
        ...createDefaultCharacterData(),
        stats: { ...createDefaultCharacterData().stats, ref: 7 },
        ...data,
      }),
    };
  }

  it('podnosi modyfikator, ale nie rozstrzygnięcie remisu', async () => {
    const registry = await loadCpredRegistry(config.dataPublicDir, config.dataPrivateDir, log);
    const initiative = readSheetInitiative(
      sheetWith({ roleId: 'solo', roleAbilityRank: 6, combatAwareness: { fastReflexes: 3 } }),
      registry,
    );
    expect(initiative.modifier).toBe(10);
    // RAW rozstrzyga remis po ZR, a trening to nie odruchy.
    expect(initiative.tieBreak).toBe(7);
    expect(initiative.label).toContain('Błyskawiczna reakcja 3');
  });

  it('zostawia kartę bez Zmysłu Walki dokładnie tam, gdzie była', async () => {
    const registry = await loadCpredRegistry(config.dataPublicDir, config.dataPrivateDir, log);
    const initiative = readSheetInitiative(sheetWith({ roleId: 'netrunner' }), registry);
    expect(initiative.modifier).toBe(7);
    expect(initiative.label).not.toContain('Błyskawiczna');
  });
});

describe('Zmysł Walki: przydział punktów i Redukcja obrażeń', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;
  let soloCharacterId: string;
  let soloTokenId: string;
  let mookCharacterId: string;
  let mookTokenId: string;

  function rowOf(view: CombatView, tokenId: string): CombatantView {
    const row = view.combatants.find((c) => c.tokenId === tokenId);
    if (!row) throw new Error('combatant missing from tracker');
    return row;
  }

  async function sync(): Promise<StateSyncPayload> {
    const next = waitFor<StateSyncPayload>(gm, 'state:sync');
    await emitAck(gm, 'state:request');
    return next;
  }

  async function sheetOf(id: string): Promise<CpredCharacterData> {
    const character = (await sync()).characters.find((c) => c.id === id);
    if (!character) throw new Error('character missing from sync');
    return character.data as CpredCharacterData;
  }

  /** Spent/max of one turn resource, as the tracker reports it right now. */
  async function actionUsed(tokenId: string): Promise<number | undefined> {
    const combat = (await sync()).combat as CombatView | null;
    if (!combat) throw new Error('no combat in sync');
    return rowOf(combat, tokenId).turn?.resources.find((r) => r.id === 'action')?.used;
  }

  /** The mook swings, and the damage lands on whoever is named. */
  async function hit(tokenId: string): Promise<DamageLogEntry> {
    const rolled = data(
      await emitAck<{ messageId: number }>(gm, 'character:roll', {
        characterId: mookCharacterId,
        request: { kind: 'damage', weaponRowId: 'w1' },
        visibility: 'public',
      }),
      'character:roll',
    );
    const logged = waitForDamage(gm);
    const applied = await emitAck(gm, 'damage:apply', { messageId: rolled.messageId, tokenId });
    expect(applied.ok).toBe(true);
    const entry = (await logged).message.damage;
    if (!entry) throw new Error('damage entry missing from the card');
    return entry;
  }

  it('stawia stół: Solo ze Zmysłem Walki 6 i zbir z pałką', async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);

    const solo = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Kelsa', ownerId: playerId }),
      'character:create',
    );
    soloCharacterId = solo.id;
    // Bez pancerza i z wysokim BC: test mówi o Redukcji obrażeń, nie o OB,
    // a Solo ma przeżyć trzy ciosy pałką.
    await emitAck(gm, 'character:update', {
      characterId: soloCharacterId,
      patch: {
        data: {
          roleId: 'solo',
          roleAbilityRank: 6,
          armor: [],
          stats: { ...(solo.data as CpredCharacterData).stats, body: 8, will: 8 },
        },
      },
    });

    const mook = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Zbir' }),
      'character:create',
    );
    mookCharacterId = mook.id;
    await emitAck(gm, 'character:update', {
      characterId: mookCharacterId,
      patch: {
        data: {
          weapons: [{ id: 'w1', name: 'Pałka', notes: '', damage: '1k6', ammo: '', rof: '1' }],
        },
      },
    });

    const scene = data(
      await emitAck<SceneView>(gm, 'scene:create', { name: 'Magazyn' }),
      'scene:create',
    );
    sceneId = scene.id;
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'open' });
    const activated = waitFor(player, 'scene:activate');
    await emitAck(gm, 'scene:activate', { sceneId });
    await activated;

    soloTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Kelsa',
        x: 0,
        y: 0,
        ownerId: playerId,
        characterId: soloCharacterId,
      }),
      'token:create',
    ).id;
    mookTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Zbir',
        x: 200,
        y: 0,
        characterId: mookCharacterId,
      }),
      'token:create',
    ).id;
  });

  it('zapisuje przydział własnym zdarzeniem — i tylko nim', async () => {
    const ack = await emitAck(player, 'character:combat-awareness', {
      characterId: soloCharacterId,
      allocation: { damageReduction: 4, fastReflexes: 2 },
    });
    expect(ack.ok).toBe(true);
    expect((await sheetOf(soloCharacterId)).combatAwareness).toEqual({
      damageReduction: 4,
      fastReflexes: 2,
    });

    // Łata karty jest zamknięta — inaczej Akcję dałoby się ominąć autozapisem.
    const patched = await emitAck(player, 'character:update', {
      characterId: soloCharacterId,
      patch: { data: { combatAwareness: { weakSpot: 6 } } },
    });
    expect(patched).toMatchObject({ ok: false, error: 'FORBIDDEN' });
    expect((await sheetOf(soloCharacterId)).combatAwareness).toEqual({
      damageReduction: 4,
      fastReflexes: 2,
    });
  });

  it('odmawia przydziału spoza progu, ponad pulę i bez Zdolności', async () => {
    // 4 punkty w Precyzyjny atak kupują to, co 3 — progi to 3/6/9 (s. 146).
    expect(
      await emitAck(player, 'character:combat-awareness', {
        characterId: soloCharacterId,
        allocation: { preciseAttack: 4 },
      }),
    ).toMatchObject({ ok: false, error: 'BAD_STEP' });

    expect(
      await emitAck(player, 'character:combat-awareness', {
        characterId: soloCharacterId,
        allocation: { damageReduction: 10 },
      }),
    ).toMatchObject({ ok: false, error: 'NOT_ENOUGH_POINTS' });

    // Zbir nie ma Roli, więc nie ma czego rozdzielać.
    expect(
      await emitAck(gm, 'character:combat-awareness', {
        characterId: mookCharacterId,
        allocation: { weakSpot: 1 },
      }),
    ).toMatchObject({ ok: false, error: 'NO_ABILITY' });
  });

  it('poza walką zmiana przydziału jest darmowa', async () => {
    const ack = await emitAck(player, 'character:combat-awareness', {
      characterId: soloCharacterId,
      allocation: { damageReduction: 4 },
      tokenId: soloTokenId,
    });
    expect(ack.ok).toBe(true);
    expect((await sheetOf(soloCharacterId)).combatAwareness).toEqual({ damageReduction: 4 });
  });

  it('redukuje pierwsze obrażenia Rundy i nie rusza drugich', async () => {
    const combat = data(
      await emitAck<CombatView>(gm, 'combat:start', {
        sceneId,
        tokenIds: [soloTokenId, mookTokenId],
      }),
      'combat:start',
    );
    // Ustalona kolejka, żeby „czyja tura" nie zależało od kości: 20 / 10.
    await emitAck(gm, 'combat:set-initiative', {
      combatantId: rowOf(combat, mookTokenId).id,
      initiative: 20,
    });
    await emitAck(gm, 'combat:set-initiative', {
      combatantId: rowOf(combat, soloTokenId).id,
      initiative: 10,
    });
    const round1 = data(await emitAck<CombatView>(gm, 'combat:next', {}), 'combat:next');
    expect(round1.round).toBe(1);

    const first = await hit(soloTokenId);
    expect(first.damageReduced).toBe(2);
    expect(first.damageThrough).toBe(first.damageRolled - 2);

    const second = await hit(soloTokenId);
    expect(second.damageReduced).toBeUndefined();
    // Ten sam trening, ten sam pancerz (żaden) — różnicę robi wyłącznie Runda.
    expect(second.damageThrough).toBe(second.damageRolled);
  });

  it('nowa Runda wraca do pierwszego ciosu', async () => {
    await emitAck<CombatView>(gm, 'combat:next', {});
    const round2 = data(await emitAck<CombatView>(gm, 'combat:next', {}), 'combat:next');
    expect(round2.round).toBe(2);

    const third = await hit(soloTokenId);
    expect(third.damageReduced).toBe(2);
  });

  it('w trakcie walki zapis przydziału kosztuje Akcję', async () => {
    // Kolejka stoi na zbirze (inicjatywa 20); krok dalej to tura Solo.
    const view = data(await emitAck<CombatView>(gm, 'combat:next', {}), 'combat:next');
    expect(view.activeCombatantId).toBe(rowOf(view, soloTokenId).id);
    expect(await actionUsed(soloTokenId)).toBe(0);

    const ack = await emitAck(player, 'character:combat-awareness', {
      characterId: soloCharacterId,
      allocation: { weakSpot: 6 },
      tokenId: soloTokenId,
    });
    expect(ack.ok).toBe(true);
    expect(await actionUsed(soloTokenId)).toBe(1);

    // „Jeśli Solo nie zmieni przydziału tych punktów, zakłada się przydział
    // taki, jaki był do tej pory" (s. 146) — a za to się nie płaci.
    const again = await emitAck(player, 'character:combat-awareness', {
      characterId: soloCharacterId,
      allocation: { weakSpot: 6 },
      tokenId: soloTokenId,
    });
    expect(again.ok).toBe(true);
    expect(await actionUsed(soloTokenId)).toBe(1);
  });
});
