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
  CharacterView,
  CombatView,
  CompendiumEntry,
  CpredCharacterData,
  DefenseZoneSyncBroadcast,
  DefenseZoneView,
  InvitationSummary,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenView,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Smoke tests of defended zones (stage 26f) on real sockets.
 *
 * What is tested here is the half the pure geometry in `shared` cannot reach:
 *
 *  - **the numbers come from the catalogue**, so a client cannot place a floor
 *    that hurts for 20k6 by editing a packet;
 *  - **a walk sets the system off**, through the one hook every move already
 *    lands on — and a figure with a pass walks across untouched;
 *  - **a hidden zone is absent from a player's payload**, which is the whole of
 *    „Percepcja PT 17, by zauważyć": a flag would be a client-side secret.
 *
 * The room: one square is 100 px and 2 m, so a metre is 50 px. The trapped floor
 * runs from x = 500 to x = 900 across the whole corridor.
 */

const TEST_DB = `./.test-${randomBytes(6).toString('hex')}.db`;
const GM_PASSWORD = 'test-haslo';
const PX_PER_M = 50;

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

function emitAck<T = undefined>(
  socket: ClientSocket,
  event: string,
  payload?: unknown,
): Promise<SocketAck<T>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), 4000);
    const ack = (response: SocketAck<T>) => {
      clearTimeout(timer);
      resolve(response);
    };
    if (payload === undefined) socket.emit(event, ack);
    else socket.emit(event, payload, ack);
  });
}

function data<T>(ack: SocketAck<T>, what: string): T {
  if (!ack.ok) throw new Error(`${what} failed: ${ack.error}`);
  if (ack.data === undefined) throw new Error(`${what} returned no data`);
  return ack.data;
}

function waitFor<T>(socket: ClientSocket, event: string, ms = 4000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

async function roundTrip(socket: ClientSocket): Promise<StateSyncPayload> {
  const sync = waitFor<StateSyncPayload>(socket, 'state:sync');
  await emitAck(socket, 'state:request');
  return sync;
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
    payload: { name: 'Kampania stref' },
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
    payload: { name: 'Kolec' },
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

describe('defended zones on a scene', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;
  let characterId: string;
  let runnerTokenId: string;
  let guardTokenId: string;
  let floorZoneId: number;
  let slickZoneId: number;

  /** Walks the figure and waits for the server to finish with the move. */
  async function walk(
    socket: ClientSocket,
    tokenId: string,
    x: number,
    y: number,
    path?: { x: number; y: number }[],
  ): Promise<SocketAck<{ x: number; y: number }>> {
    return emitAck<{ x: number; y: number }>(socket, 'token:move', {
      tokenId,
      x,
      y,
      final: true,
      ...(path ? { path } : {}),
    });
  }

  /** Hit points on the player's own sheet, read back off a fresh sync. */
  async function hp(): Promise<number> {
    const sync = await roundTrip(player);
    const sheet = sync.characters.find((entry) => entry.id === characterId);
    if (!sheet) throw new Error('sheet missing from sync');
    return (sheet.data as CpredCharacterData).hpCurrent;
  }

  /**
   * Puts Kolec back on full Hit Points, and returns the number.
   *
   * Every test measuring „PW spadły" starts here rather than inheriting
   * whatever the tests before it left: the floor bills 6k6 a time against a
   * sheet holding 50 (BC 8, SW 8), so a few jolts take him to zero — and at
   * zero the server refuses a *player* any movement at all. The walk then never
   * happens, the drop is 0 → 0, and the test fails on the assertion instead of
   * on the state that broke it.
   */
  async function healUp(): Promise<number> {
    const full = 10 + 5 * Math.ceil((8 + 8) / 2); // hpMax(BC 8, SW 8) = 50
    await emitAck(gm, 'character:update', {
      characterId,
      patch: { data: { hpCurrent: full } },
    });
    return full;
  }

  it('sets the table: a corridor, two figures and two catalogue rows', async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);

    const character = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Kolec', ownerId: playerId }),
      'character:create',
    );
    characterId = character.id;
    await emitAck(gm, 'character:update', {
      characterId,
      patch: {
        data: {
          stats: {
            ...(character.data as CpredCharacterData).stats,
            body: 8,
            will: 8,
            dex: 4,
            int: 2,
          },
          // Percepcja 0 na INT 2: taka postać nie zauważy pułapki o PT 17
          // z żadnym rzutem, co jest dokładnie tym, czego ten test potrzebuje.
          skills: { athletics: 0, perception: 0 },
        },
      },
    });

    const scene = data(await emitAck<SceneView>(gm, 'scene:create', { name: 'Korytarz' }), 'scene');
    sceneId = scene.id;
    await emitAck(gm, 'scene:update', { sceneId, patch: { width: 4000 } });
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'open' });
    const activated = waitFor(player, 'scene:activate');
    await emitAck(gm, 'scene:activate', { sceneId });
    await activated;

    runnerTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Kolec',
        x: 0,
        y: 0,
        ownerId: playerId,
        characterId,
      }),
      'token:create',
    ).id;
    guardTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Ochroniarz',
        x: 0,
        y: 400,
        hp: { current: 40, max: 40 },
      }),
      'token:create',
    ).id;

    // Dwa wpisy „Obrona Sieci" — z efektem jako danymi, jak po imporcie z 26f.
    data(
      await emitAck<CompendiumEntry>(gm, 'compendium:upsert', {
        entry: {
          category: 'netDefense',
          name: 'Podłoga elektryczna',
          cost: 1000,
          defenseKind: 'environment',
          disableDv: 13,
          hp: 20,
          spotDv: 17,
          trigger: 'Cel wchodzi na zelektryfikowany obszar.',
          effects: { damage: '6k6', noAblation: true, repeats: true },
        },
      }),
      'compendium:upsert (podłoga)',
    );
    data(
      await emitAck<CompendiumEntry>(gm, 'compendium:upsert', {
        entry: {
          category: 'netDefense',
          name: 'Ślizgawka',
          cost: 1000,
          defenseKind: 'environment',
          disableDv: 13,
          hp: 10,
          spotDv: 17,
          trigger: 'Cel wchodzi na broniony obszar.',
          effects: {
            when: 'move',
            check: { skillId: 'athletics', skillLabel: 'Atletyka', statId: 'dex', dv: 15 },
            statuses: ['prone'],
          },
        },
      }),
      'compendium:upsert (ślizgawka)',
    );
    expect(runnerTokenId).toBeTruthy();
  });

  it('reads the body points out of the catalogue, not off the wire', async () => {
    const zone = data(
      await emitAck<DefenseZoneView>(gm, 'zone:create', {
        sceneId,
        entryId: 'defense.podloga-elektryczna',
        x: 10 * PX_PER_M,
        y: 0,
        width: 8 * PX_PER_M,
        height: 4 * PX_PER_M,
        // Nie ma pola na PW i nic, co klient dopisze, nie zostanie przeczytane.
        hpMax: 9999,
      }),
      'zone:create',
    );
    floorZoneId = zone.id;
    expect(zone.hpMax).toBe(20);
    expect(zone.hpCurrent).toBe(20);
    expect(zone.name).toBe('Podłoga elektryczna');
    // System środowiskowy ma PT zauważenia, więc startuje ukryty.
    expect(zone.hidden).toBe(true);
    expect(zone.armed).toBe(true);
  });

  it('refuses a zone whose catalogue row does not exist', async () => {
    const ack = await emitAck(gm, 'zone:create', {
      sceneId,
      entryId: 'defense.nie-ma-takiego',
      x: 0,
      y: 2000,
      width: 100,
      height: 100,
    });
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.error).toBe('ZONE_UNKNOWN_ENTRY');
  });

  it('never lets a player near a hidden zone, or near the GM’s plan for a visible one', async () => {
    const hiddenView = await roundTrip(player);
    expect(hiddenView.zones).toHaveLength(0);

    await emitAck(gm, 'zone:update', { zoneId: floorZoneId, patch: { hidden: false } });
    const shownView = await roundTrip(player);
    expect(shownView.zones).toHaveLength(1);
    const seen = shownView.zones[0]!;
    // Prostokąt i nazwa — tak; przepustki, notatka i węzeł kontrolny — nie.
    expect(seen.name).toBe('Podłoga elektryczna');
    expect(seen.exempt).toBeUndefined();
    expect(seen.notes).toBeUndefined();
    expect(seen.architectureId).toBeUndefined();

    const gmView = await roundTrip(gm);
    expect(gmView.zones[0]!.exempt).toEqual([]);
    await emitAck(gm, 'zone:update', { zoneId: floorZoneId, patch: { hidden: true } });
  });

  it('goes off when a figure walks onto it, and the card can be taken back', async () => {
    const before = await healUp();
    const card = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    await walk(player, runnerTokenId, 12 * PX_PER_M, 0);
    // Pierwsza wiadomość to karta obrażeń albo linia „Wejście na broniony
    // obszar"; obie lecą, więc bierzemy tę, która niesie rozliczenie.
    await card;
    const after = await hp();
    expect(after).toBeLessThan(before);
  });

  it('does not go off a second time for a figure already standing on it', async () => {
    const before = await healUp();
    // Ruch wewnątrz obszaru: „cel WCHODZI na broniony obszar" już się zdarzyło.
    await walk(player, runnerTokenId, 14 * PX_PER_M, 0);
    const after = await hp();
    expect(after).toBe(before);
  });

  it('lets a figure with a pass walk across untouched', async () => {
    await emitAck(gm, 'zone:update', {
      zoneId: floorZoneId,
      patch: { exempt: [guardTokenId] },
    });
    const guardBefore = (await roundTrip(gm)).tokens.find((token) => token.id === guardTokenId);
    // Ochroniarz wchodzi na podłogę tą samą drogą, którą Kolec dostał 6k6.
    await walk(gm, guardTokenId, 12 * PX_PER_M, 400);
    const sync = await roundTrip(gm);
    const guardAfter = sync.tokens.find((token) => token.id === guardTokenId);
    expect(guardAfter?.hp?.current).toBe(guardBefore?.hp?.current);
  });

  it('a disarmed system hurts nobody', async () => {
    await emitAck(gm, 'zone:update', { zoneId: floorZoneId, patch: { armed: false } });
    // Kolec schodzi i wraca — przy uzbrojonym systemie to byłoby drugie 6k6.
    await walk(player, runnerTokenId, 0, 0);
    const before = await healUp();
    await walk(player, runnerTokenId, 12 * PX_PER_M, 0);
    expect(await hp()).toBe(before);
    await emitAck(gm, 'zone:update', { zoneId: floorZoneId, patch: { armed: true } });
  });

  it('reads the whole recorded path, not just where the walk ended', async () => {
    await walk(player, runnerTokenId, 0, 0);
    const before = await healUp();
    // Cel po drugiej stronie podłogi: prosta „skąd–dokąd" też ją przecina, ale
    // ścieżka z 16e jest tym, co silnik ma czytać.
    await walk(player, runnerTokenId, 30 * PX_PER_M, 0, [
      { x: 0, y: 0 },
      { x: 12 * PX_PER_M, y: 0 },
      { x: 30 * PX_PER_M, y: 0 },
    ]);
    expect(await hp()).toBeLessThan(before);
  });

  it('a slick floor answers movement inside it, not only the step onto it', async () => {
    const slick = data(
      await emitAck<DefenseZoneView>(gm, 'zone:create', {
        sceneId,
        entryId: 'defense.slizgawka',
        x: 40 * PX_PER_M,
        y: 0,
        width: 10 * PX_PER_M,
        height: 4 * PX_PER_M,
        hidden: false,
      }),
      'zone:create (ślizgawka)',
    );
    slickZoneId = slick.id;
    await walk(player, runnerTokenId, 42 * PX_PER_M, 0);
    // Drugi ruch — już wewnątrz obszaru. Test Atletyki idzie na ZR 4 + 0, więc
    // przy PT 15 nie ma jak wyjść; interesuje nas to, że w ogóle się odbywa.
    const line = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    await walk(player, runnerTokenId, 44 * PX_PER_M, 0);
    const text = (await line).message.action?.actionName ?? '';
    expect(text).toContain('Ruch na bronionym obszarze');
  });

  it('the GM can fire a system by hand, and refuses when nobody is standing on it', async () => {
    const empty = await emitAck(gm, 'zone:fire', { zoneId: slickZoneId });
    // Kolec stoi na ślizgawce z poprzedniego testu, więc pusta jest podłoga.
    expect(empty.ok).toBe(true);

    await walk(player, runnerTokenId, 0, 0);
    const nobody = await emitAck(gm, 'zone:fire', { zoneId: slickZoneId });
    expect(nobody.ok).toBe(false);
    if (!nobody.ok) expect(nobody.error).toBe('ZONE_NOBODY_INSIDE');
  });

  it('a player may not place, edit or clear a zone', async () => {
    const created = await emitAck(player, 'zone:create', {
      sceneId,
      entryId: 'defense.podloga-elektryczna',
      x: 0,
      y: 3000,
      width: 100,
      height: 100,
    });
    expect(created.ok).toBe(false);
    const updated = await emitAck(player, 'zone:update', {
      zoneId: floorZoneId,
      patch: { armed: false },
    });
    expect(updated.ok).toBe(false);
    const cleared = await emitAck(player, 'zone:clear', { sceneId });
    expect(cleared.ok).toBe(false);
  });

  it('the whole list goes back out after every change', async () => {
    const sync = waitFor<DefenseZoneSyncBroadcast>(gm, 'zone:sync');
    await emitAck(gm, 'zone:update', { zoneId: floorZoneId, patch: { name: 'Podłoga w windzie' } });
    const broadcast = await sync;
    expect(broadcast.sceneId).toBe(sceneId);
    expect(broadcast.zones.find((zone) => zone.id === floorZoneId)?.name).toBe('Podłoga w windzie');
  });

  it('a sticky floor lowers RUCH while you stand on it and lets go when you leave', async () => {
    data(
      await emitAck<CompendiumEntry>(gm, 'compendium:upsert', {
        entry: {
          category: 'netDefense',
          name: 'Maź',
          cost: 1000,
          defenseKind: 'environment',
          disableDv: 13,
          hp: 10,
          spotDv: 17,
          trigger: 'Cel wchodzi na broniony obszar.',
          effects: { moveDrain: '2k6' },
        },
      }),
      'compendium:upsert (maź)',
    );
    const goo = data(
      await emitAck<DefenseZoneView>(gm, 'zone:create', {
        sceneId,
        entryId: 'defense.maz',
        x: 60 * PX_PER_M,
        y: 0,
        width: 6 * PX_PER_M,
        height: 4 * PX_PER_M,
        hidden: false,
      }),
      'zone:create (maź)',
    );

    await walk(player, runnerTokenId, 62 * PX_PER_M, 0);
    const stuck = (await roundTrip(gm)).tokens.find((token) => token.id === runnerTokenId);
    expect(stuck?.statuses).toContain('slowed');

    // „dopóki cel … nie opuści bronionego obszaru" (s. 216): zejście z mazi
    // zdejmuje i naklejkę, i liczbę przy niej.
    await walk(player, runnerTokenId, 0, 0);
    const free = (await roundTrip(gm)).tokens.find((token) => token.id === runnerTokenId);
    expect(free?.statuses ?? []).not.toContain('slowed');
    await emitAck(gm, 'zone:delete', { zoneId: goo.id });
  });

  it('rolls Perception once per character, and a success puts the trap in that account’s payload', async () => {
    // Postać z okiem: INT 8 + Percepcja 10 przebija PT 17 każdą kostką.
    const sharp = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Oko', ownerId: playerId }),
      'character:create (Oko)',
    );
    await emitAck(gm, 'character:update', {
      characterId: sharp.id,
      patch: {
        data: {
          stats: { ...(sharp.data as CpredCharacterData).stats, int: 8 },
          skills: { perception: 10 },
        },
      },
    });
    const sharpTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Oko',
        x: 0,
        y: 800,
        ownerId: playerId,
        characterId: sharp.id,
      }),
      'token:create (Oko)',
    ).id;

    const trap = data(
      await emitAck<DefenseZoneView>(gm, 'zone:create', {
        sceneId,
        entryId: 'defense.podloga-elektryczna',
        x: 70 * PX_PER_M,
        y: 800,
        width: 6 * PX_PER_M,
        height: 4 * PX_PER_M,
      }),
      'zone:create (pułapka)',
    );
    expect(trap.hidden).toBe(true);
    // Póki nikt jej nie widział, u gracza jej po prostu nie ma.
    expect((await roundTrip(player)).zones.some((zone) => zone.id === trap.id)).toBe(false);

    // Podejście na dwa pola od krawędzi — dość blisko na rzut, za daleko na wejście.
    await walk(player, sharpTokenId, 66 * PX_PER_M, 800);
    const spotted = (await roundTrip(player)).zones.find((zone) => zone.id === trap.id);
    expect(spotted).toBeTruthy();
    // Gracz dostaje prostokąt, ale nadal nie dostaje planu MG.
    expect(spotted?.spotted).toBe(true);
    expect(spotted?.exempt).toBeUndefined();
    await emitAck(gm, 'zone:delete', { zoneId: trap.id });
  });

  it('never gives a second Perception roll to a character who already failed one', async () => {
    const trap = data(
      await emitAck<DefenseZoneView>(gm, 'zone:create', {
        sceneId,
        entryId: 'defense.podloga-elektryczna',
        x: 90 * PX_PER_M,
        y: 0,
        width: 6 * PX_PER_M,
        height: 4 * PX_PER_M,
      }),
      'zone:create (druga pułapka)',
    );
    // Kolec ma INT 2 i Percepcję 0 — 1k10 + 2 nigdy nie przebije PT 17.
    await walk(player, runnerTokenId, 86 * PX_PER_M, 0);
    await walk(player, runnerTokenId, 0, 0);
    await walk(player, runnerTokenId, 86 * PX_PER_M, 0);
    expect((await roundTrip(player)).zones.some((zone) => zone.id === trap.id)).toBe(false);

    // Przycisk MG jest drogą obok nieudanego rzutu — i jedyną.
    await emitAck(gm, 'zone:update', { zoneId: trap.id, patch: { hidden: false } });
    expect((await roundTrip(player)).zones.some((zone) => zone.id === trap.id)).toBe(true);
    await walk(player, runnerTokenId, 0, 0);
  });

  it('an emplacement with no figure on the map says so instead of shooting', async () => {
    data(
      await emitAck<CompendiumEntry>(gm, 'compendium:upsert', {
        entry: {
          category: 'netDefense',
          name: 'Automatyczna wieżyczka',
          cost: 5000,
          defenseKind: 'emplacement',
          disableDv: 17,
          hp: 25,
          combatValue: 14,
          trigger: 'Cel bez przepustki wchodzi na strzeżony obszar.',
          effects: { fires: true },
        },
      }),
      'compendium:upsert (wieżyczka)',
    );
    const post = data(
      await emitAck<DefenseZoneView>(gm, 'zone:create', {
        sceneId,
        entryId: 'defense.automatyczna-wiezyczka',
        x: 4 * PX_PER_M,
        y: 1200,
        width: 6 * PX_PER_M,
        height: 4 * PX_PER_M,
        hidden: false,
      }),
      'zone:create (wieżyczka)',
    );
    // Stanowisko bez żetonu to nadal wpis w katalogu, a nie karabin.
    expect(post.tokenId).toBeUndefined();
    // Ochroniarz staje obok strefy, a potem na nią wchodzi — dwa osobne ruchy,
    // żeby wyzwalacz „wejście" miał skąd wejść.
    await walk(gm, guardTokenId, 4 * PX_PER_M, 1600);
    const line = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    await walk(gm, guardTokenId, 6 * PX_PER_M, 1200);
    const note = (await line).message.action?.note ?? '';
    expect(note).toContain('nie ma żetonu na scenie');
    await emitAck(gm, 'zone:delete', { zoneId: post.id });
  });

  it('the electric floor bills again at the end of every Turn spent standing on it', async () => {
    // „Cel otrzymuje ponownie 6k6 obrażeń na koniec swojej kolejnej Tury oraz
    // na koniec każdej kolejnej Tury, chyba że zejdzie z podłogi" (s. 216).
    // Kolec przeszedł przez podłogę już kilka razy; ten test jest o powtórce,
    // nie o dobijaniu, więc karta wraca do pełni.
    const full = await healUp();
    await emitAck(gm, 'zone:update', { zoneId: floorZoneId, patch: { armed: true } });
    // Wejście na podłogę **przed** walką: w turze ruch gracza zależy od tego,
    // czyja jest tura, a ten test jest o tym, co dzieje się bez klikania.
    await walk(player, runnerTokenId, 12 * PX_PER_M, 0);
    const afterEntry = await hp();
    expect(afterEntry).toBeLessThan(full);

    data(
      await emitAck<CombatView>(gm, 'combat:start', {
        sceneId,
        tokenIds: [runnerTokenId, guardTokenId],
      }),
      'combat:start',
    );
    await emitAck(gm, 'combat:roll-all');
    // Kolejne Tury: pierwsza zaczyna walkę, każda następna kończy czyjąś —
    // a koniec Tury Kolca stojącego na podłodze musi go zaboleć jeszcze raz.
    for (let step = 0; step < 3; step++) {
      await emitAck<CombatView>(gm, 'combat:next');
    }
    expect(await hp()).toBeLessThan(afterEntry);
  });

  // „Pułapka zajmuje pierwsze miejsce w Kolejce Inicjatywy" (s. 216). Do 22.08
  // wiersz trackera zakładał MG ręcznie — hak ruchu pomijał wyzwalacz `turn`
  // w całości, więc jedyną drogą do windy z gazem był przycisk „Odpal system".
  it('a trap with a Turn of its own walks into the initiative queue by itself', async () => {
    data(
      await emitAck<CompendiumEntry>(gm, 'compendium:upsert', {
        entry: {
          category: 'netDefense',
          name: 'Winda z gazem',
          cost: 1000,
          defenseKind: 'environment',
          disableDv: 13,
          hp: 10,
          trigger: 'Pułapka zajmuje pierwsze miejsce w Kolejce Inicjatywy.',
          effects: { when: 'turn', damage: '2k6' },
        },
      }),
      'compendium:upsert (winda)',
    );
    const lift = data(
      await emitAck<DefenseZoneView>(gm, 'zone:create', {
        sceneId,
        entryId: 'defense.winda-z-gazem',
        x: 30 * PX_PER_M,
        y: 0,
        width: 4 * PX_PER_M,
        height: 4 * PX_PER_M,
        hidden: false,
      }),
      'zone:create (winda)',
    );

    data(
      await emitAck<CombatView>(gm, 'combat:start', {
        sceneId,
        tokenIds: [runnerTokenId, guardTokenId],
      }),
      'combat:start',
    );
    await emitAck(gm, 'combat:roll-all');
    const rolled = data(await emitAck<CombatView>(gm, 'combat:next'), 'combat:next');
    const highest = rolled.combatants.reduce((best, row) => Math.max(best, row.initiative ?? 0), 0);

    // Krok robi MG figurą NPC: w trwającej walce ruch gracza poza jego Turą
    // jest odrzucany, więc pułapka nigdy by się nie obudziła z tego kroku.
    data(await walk(gm, guardTokenId, 31 * PX_PER_M, 0), 'token:move (winda)');

    const withTrap = await roundTrip(gm);
    const trapRow = withTrap.combat?.combatants.find((row) => row.name === 'Winda z gazem');
    expect(trapRow).toBeTruthy();
    // Pierwsze miejsce, nie ostatnie: o punkt wyżej niż najwyższa inicjatywa.
    expect(trapRow!.initiative).toBe(highest + 1);
    // Wiersz bez figury — pułapka nie stoi nigdzie na mapie, tak jak Czarny LOD.
    expect(trapRow!.tokenId).toBeNull();

    // Drugie wejście nie dokłada drugiego wiersza.
    await walk(gm, guardTokenId, 25 * PX_PER_M, 0);
    await walk(gm, guardTokenId, 31 * PX_PER_M, 0);
    const again = await roundTrip(gm);
    expect(again.combat?.combatants.filter((row) => row.name === 'Winda z gazem')).toHaveLength(1);

    // Rozbrojona pułapka nie ma czym zająć swojej Tury i wypada z kolejki.
    await emitAck(gm, 'zone:update', { zoneId: lift.id, patch: { armed: false } });
    const disarmed = await roundTrip(gm);
    expect(disarmed.combat?.combatants.some((row) => row.name === 'Winda z gazem')).toBe(false);

    await emitAck(gm, 'combat:end', { sceneId });
  });

  it('clearing the scene removes every zone at once', async () => {
    await emitAck(gm, 'zone:clear', { sceneId });
    const sync = await roundTrip(gm);
    expect(sync.zones).toHaveLength(0);
  });
});
