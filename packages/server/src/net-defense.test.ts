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
  CombatUpdateBroadcast,
  CombatView,
  CompendiumEntry,
  NetAccessPointView,
  NetArchitectureView,
  NetRunAbilityResult,
  NetRunPayload,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenView,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { joinUrl } from './test-join.js';
import { runFloor } from './test-net.js';

/**
 * Automat obrony Sieci (etap 70e, decyzja MG nr 4 z 11.11) na żywych gniazdach.
 *
 * Do etapu Czarny LOD i Demon ruszały się wyłącznie na klik MG. Teraz:
 *
 *  - zjazd na piętro LOD-u sam daje test wykrycia, a przegrana — darmowy atak
 *    i miejsce na czele kolejki, bez żadnego zdarzenia MG;
 *  - wskaźnik kolejki na wierszu LOD-u albo Demona gra jego Turę i idzie dalej,
 *    a stan kolejki ze wskaźnikiem na LOD-zie wychodzi **przed** jego kośćmi;
 *  - przejęcie węzła budzi Demona, a jego Tura w kolejce odbiera węzeł;
 *  - hamulec MG (`netrun:defense:pause`) wstrzymuje wszystko naraz, a ręczne
 *    przyciski MG działają w obu trybach.
 *
 * Rozstrzygnięcia wymuszają liczby wpisów, nie atrapa losowości — jak w 26c:
 * „Zawsze trafia” ma PRĘ i ATK 30, „Mur” Interfejs 30. Oba LOD-y tylko kradną
 * Akcję Sieciową, a Demon ma jedną Akcję, więc nikt nie ginie po drodze.
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

function errorOf(ack: SocketAck<unknown>): string | undefined {
  return ack.ok ? undefined : ack.error;
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

/** What one socket heard during `work`, in wire order. */
async function listen<T>(
  socket: ClientSocket,
  work: () => Promise<T>,
): Promise<{ result: T; heard: { event: string; payload: unknown }[] }> {
  const heard: { event: string; payload: unknown }[] = [];
  const onAny = (event: string, payload: unknown) => heard.push({ event, payload });
  socket.onAny(onAny);
  try {
    const result = await work();
    // Odłożone widoki wychodzą tuż po potwierdzeniu — chwila na ich dojście.
    await new Promise((done) => setTimeout(done, 150));
    return { result, heard };
  } finally {
    socket.offAny(onAny);
  }
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
    payload: { name: 'Kampania automatu obrony' },
  });
  const campaignId = (campaignRes.json() as CampaignSummary).id;

  const joinRes = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, campaignId, 'Kolec'),
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
    // Windows may still hold the file; nothing to clean up.
  }
});

describe('obrona Sieci działa sama (etap 70e)', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;
  let tokenId: string;
  let runId: string;
  let gmUserId: string;

  /** Id nadawane przy spotkaniu: piętro i numer Programu na nim. */
  const KRUK = 'ice-f1-0';
  const SECOND_ICE = 'ice-f2-0';
  const MUR = 'demon-f4-0';

  async function runOf(socket: ClientSocket): Promise<NetRunPayload> {
    const sync = await roundTrip(socket);
    const run = sync.netRuns.find((entry) => entry.runId === runId);
    if (!run) throw new Error('run missing from sync');
    return run;
  }

  async function combatOf(): Promise<CombatView> {
    const combat = (await roundTrip(gm)).combat;
    if (!combat) throw new Error('no combat');
    return combat;
  }

  const rowNamed = (combat: CombatView, name: string) =>
    combat.combatants.find((row) => row.name === name);

  async function moveTo(floor: number): Promise<NetRunPayload> {
    return data(
      await emitAck<NetRunPayload>(player, 'netrun:move', {
        runId,
        to: { branchId: 'trunk', floor },
      }),
      `netrun:move (${floor})`,
    );
  }

  it('stawia stół: netrunner w walce, dwa Czarne LOD-y, węzeł i Demon', async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);
    const me = await built.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: gmCookie },
    });
    gmUserId = (me.json() as { user: { id: string } }).user.id;

    data(
      await emitAck<CompendiumEntry>(gm, 'compendium:upsert', {
        entry: {
          category: 'program',
          name: 'Zawsze trafia',
          programClass: 'attacker',
          target: 'antiPersonnel',
          blackIce: true,
          atk: 30,
          def: 0,
          rez: 24,
          per: 0,
          speed: 30,
          effects: { hooks: ['stealNetAction'] },
        },
      }),
      'compendium:upsert (Zawsze trafia)',
    );
    data(
      await emitAck<CompendiumEntry>(gm, 'compendium:upsert', {
        entry: {
          category: 'program',
          name: 'Drugi strażnik',
          programClass: 'attacker',
          target: 'antiPersonnel',
          blackIce: true,
          atk: 0,
          def: 30,
          rez: 30,
          per: 30,
          speed: 0,
          effects: { hooks: ['stealNetAction'] },
        },
      }),
      'compendium:upsert (Drugi strażnik)',
    );
    data(
      await emitAck<CompendiumEntry>(gm, 'compendium:upsert', {
        entry: {
          category: 'netDefense',
          defenseKind: 'demon',
          name: 'Mur',
          rez: 30,
          interfaceRank: 30,
          netActions: 1,
          combatValue: 14,
        },
      }),
      'compendium:upsert (Mur)',
    );

    const character = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Kolec', ownerId: playerId }),
      'character:create',
    );
    await emitAck(gm, 'character:update', {
      characterId: character.id,
      patch: {
        data: {
          roleId: 'netrunner',
          roleAbilityRank: 10,
          cyberdeck: { name: 'Dek testowy', slots: 6, installed: [] },
        },
      },
    });

    sceneId = data(
      await emitAck<SceneView>(gm, 'scene:create', { name: 'Serwerownia' }),
      'scene:create',
    ).id;
    await emitAck(gm, 'scene:update', { sceneId, patch: { playerMove: 'explore' } });
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'open' });
    const activated = waitFor(player, 'scene:activate');
    await emitAck(gm, 'scene:activate', { sceneId });
    await activated;

    tokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Kolec',
        x: 0,
        y: 0,
        ownerId: playerId,
        characterId: character.id,
      }),
      'token:create',
    ).id;

    const architectureId = data(
      await emitAck<NetArchitectureView>(gm, 'net:save', {
        architecture: {
          name: 'Sieć serwerowni',
          difficulty: 'standard',
          branches: [
            {
              id: 'trunk',
              parentFloor: null,
              floors: [
                { id: 'f0', kind: 'empty', label: 'Wejście' },
                { id: 'f1', kind: 'ice', label: 'Kruk', programIds: ['program.zawsze-trafia'] },
                {
                  id: 'f2',
                  kind: 'ice',
                  label: 'Drugi',
                  programIds: ['program.drugi-straznik'],
                },
                // PT 1: Kontrola ma się udać, test jest o Demonie, nie o kości.
                { id: 'f3', kind: 'controlNode', label: 'Węzeł', dv: 1 },
                { id: 'f4', kind: 'demon', label: 'Serce', programIds: ['demon.mur'] },
              ],
            },
          ],
        },
      }),
      'net:save',
    ).id;
    const pointId = data(
      await emitAck<NetAccessPointView>(gm, 'netpoint:place', {
        sceneId,
        x: 50,
        y: 50,
        name: 'Szafa serwerowa',
        architectureId,
        hidden: false,
      }),
      'netpoint:place',
    ).id;

    const combat = data(
      await emitAck<CombatView>(gm, 'combat:start', { sceneId, tokenIds: [tokenId] }),
      'combat:start',
    );
    await emitAck(gm, 'combat:set-initiative', {
      combatantId: combat.combatants[0]!.id,
      initiative: 12,
    });
    await emitAck(gm, 'combat:next');

    runId = data(
      await emitAck<NetRunPayload>(player, 'netrun:start', { tokenId, accessPointId: pointId }),
      'netrun:start',
    ).runId;
    // Piętro wejścia jest puste — nic nie czyha, Demon śpi.
    const gmRun = await runOf(gm);
    expect(gmRun.run.combat.ice).toEqual([]);
    expect(gmRun.run.demons[0]).toMatchObject({ id: MUR, mode: 'lurking' });
    expect(gmRun.run.defensePaused).toBe(false);
  });

  it('wykrywa intruza sam: zjazd na piętro LOD-u daje test wykrycia i darmowy atak bez MG', async () => {
    const { heard } = await listen(player, () => moveTo(1));

    const run = await runOf(player);
    const kruk = run.run.combat.ice.find((entry) => entry.id === KRUK);
    expect(kruk).toMatchObject({ mode: 'hunting', detected: true });
    // PRĘ 30 przeciw Interfejsowi 10 — darmowy atak jest pewny: kradnie Akcję.
    expect(run.run.combat.netActionDebt).toBeGreaterThan(0);

    // Karta wykrycia doszła do gracza — z kośćmi, ręką MG (#39), nie jego kontem.
    const card = heard
      .filter((entry) => entry.event === 'chat:message')
      .map((entry) => (entry.payload as ChatMessageBroadcast).message)
      .find((message) => message.roll?.title === 'Wykrycie — Zawsze trafia');
    expect(card).toBeDefined();
    expect(card!.authorId).toBe(gmUserId);
    expect(card!.roll?.opposed?.won).toBe(false);

    // „Zajmuje pierwsze miejsce w Kolejce, o jeden punkt wyżej".
    const queue = await combatOf();
    expect(rowNamed(queue, 'Zawsze trafia')?.initiative).toBe(13);
    // Wskaźnik został na Kolcu — wykrycie nie jest Turą LOD-u.
    expect(queue.activeCombatantId).toBe(rowNamed(queue, 'Kolec')!.id);
  });

  it('w następnej Rundzie LOD gra Turę sam, a kolejka idzie dalej', async () => {
    const before = (await runOf(gm)).run.combat.netActionDebt;
    const { result, heard } = await listen(gm, async () =>
      data(await emitAck<CombatView>(player, 'combat:next'), 'combat:next (Kolec)'),
    );
    const iceRow = rowNamed(result, 'Zawsze trafia')!;
    expect(result.round).toBe(2);
    expect(result.activeCombatantId).toBe(rowNamed(result, 'Kolec')!.id);

    // Stół widzi wskaźnik na LOD-zie, zanim polecą jego kości.
    const onIce = heard.findIndex(
      (entry) =>
        entry.event === 'combat:update' &&
        (entry.payload as CombatUpdateBroadcast).combat?.activeCombatantId === iceRow.id,
    );
    const attack = heard.findIndex(
      (entry) =>
        entry.event === 'chat:message' &&
        (entry.payload as ChatMessageBroadcast).message.roll?.actor === 'Zawsze trafia',
    );
    expect(onIce).toBeGreaterThanOrEqual(0);
    expect(attack).toBeGreaterThan(onIce);
    // ATK 30 przeciw Interfejsowi 10 + 1k10 — trafienie jest pewne.
    const after = (await runOf(gm)).run.combat.netActionDebt;
    expect(after).toBeGreaterThanOrEqual(before);
    expect(
      heard.some(
        (entry) =>
          entry.event === 'chat:message' &&
          JSON.stringify(entry.payload).includes('Tura Czarnego LOD-u'),
      ),
    ).toBe(true);
  });

  it('„Następna tura” MG z kolejki sprzed kości LOD-u nie przeskakuje Kolca', async () => {
    // Klient MG pokazuje kolejkę za kośćmi: Tura LOD-u może się u niego jeszcze
    // toczyć, gdy wskaźnik stoi już na Kolcu. Klik w to, co widzi, jest odmową.
    const queue = await combatOf();
    const kolec = rowNamed(queue, 'Kolec')!.id;
    const kruk = rowNamed(queue, 'Zawsze trafia')!.id;
    expect(
      errorOf(await emitAck(gm, 'combat:next', { activeCombatantId: kruk, round: queue.round })),
    ).toBe('TURN_MOVED_ON');
    expect(errorOf(await emitAck(gm, 'combat:next', { activeCombatantId: kolec, round: 1 }))).toBe(
      'TURN_MOVED_ON',
    );
    const still = await combatOf();
    expect([still.round, still.activeCombatantId]).toEqual([queue.round, kolec]);
  });

  it('hamulec MG: gracz go nie dotknie, MG widzi go w oknie, gracz nie wie o nim nic', async () => {
    expect(errorOf(await emitAck(player, 'netrun:defense:pause', { runId, paused: true }))).toBe(
      'FORBIDDEN',
    );
    expect(errorOf(await emitAck(gm, 'netrun:defense:pause', { runId }))).toBe('BAD_REQUEST');
    expect((await emitAck(gm, 'netrun:defense:pause', { runId, paused: true })).ok).toBe(true);
    expect((await runOf(gm)).run.defensePaused).toBe(true);
    expect('defensePaused' in (await runOf(player)).run).toBe(false);
  });

  it('z hamulcem nie dzieje się nic, dopóki MG nie kliknie — przyciski działają', async () => {
    await moveTo(2);
    const second = (await runOf(gm)).run.combat.ice.find((entry) => entry.id === SECOND_ICE);
    expect(second).toMatchObject({ mode: 'lurking', detected: false });

    // Ręczne „LOD wykrywa intruza” działa z hamulcem.
    data(
      await emitAck<NetRunAbilityResult>(gm, 'netrun:ice:detect', { runId, iceId: SECOND_ICE }),
      'netrun:ice:detect',
    );
    // Koniec Tury Kolca: Runda 3 zaczyna się od LOD-u — i wskaźnik na nim stoi.
    const ended = data(await emitAck<CombatView>(player, 'combat:next'), 'combat:next (Kolec)');
    expect(ended.round).toBe(3);
    expect(ended.activeCombatantId).toBe(rowNamed(ended, 'Drugi strażnik')!.id);

    // „Tura LOD-a” MG działa w obu trybach; „Następna tura” MG idzie dalej.
    expect((await emitAck(gm, 'netrun:ice:turn', { runId, iceId: SECOND_ICE })).ok).toBe(true);
    const next = data(await emitAck<CombatView>(gm, 'combat:next'), 'combat:next (MG)');
    expect(next.activeCombatantId).toBe(rowNamed(next, 'Zawsze trafia')!.id);
  });

  it('zdjęty hamulec nie nadrabia niczego wstecz', async () => {
    expect((await emitAck(gm, 'netrun:defense:pause', { runId, paused: false })).ok).toBe(true);
    expect((await runOf(gm)).run.defensePaused).toBe(false);
    const queue = await combatOf();
    // Wskaźnik dalej stoi na LOD-zie, na którym go zostawił hamulec.
    expect(queue.activeCombatantId).toBe(rowNamed(queue, 'Zawsze trafia')!.id);
    // Następna tura MG: ten LOD nie dostaje już Tury, kolejka idzie do Kolca.
    const next = data(await emitAck<CombatView>(gm, 'combat:next'), 'combat:next (MG)');
    expect(next.activeCombatantId).toBe(rowNamed(next, 'Kolec')!.id);
  });

  it('Kontrola węzła budzi Demona, a jego Tura w kolejce sama odbiera węzeł', async () => {
    await moveTo(3);
    let taken = data(
      await emitAck<NetRunAbilityResult>(player, 'netrun:ability', { runId, ability: 'control' }),
      'netrun:ability (control)',
    );
    // Interfejs 10 przeciw PT 1 przegrywa tylko na krytycznej jedynce — raz na sto.
    if (!taken.success) {
      taken = data(
        await emitAck<NetRunAbilityResult>(player, 'netrun:ability', {
          runId,
          ability: 'control',
        }),
        'netrun:ability (control, powtórka)',
      );
    }
    expect(taken.success).toBe(true);
    expect(runFloor(await runOf(player), 'f3')?.controlledDv).toBe(taken.total);

    // Demon wie — gracz go widzi, a w kolejce stoi najwyżej.
    expect((await runOf(player)).run.demons.map((demon) => [demon.id, demon.mode])).toEqual([
      [MUR, 'hunting'],
    ]);
    const queue = await combatOf();
    const top = Math.max(...queue.combatants.map((row) => row.initiative ?? 0));
    expect(rowNamed(queue, 'Mur')?.initiative).toBe(top);

    // Koniec Tury Kolca: Runda 4 — Mur, dwa LOD-y i z powrotem Kolec, bez MG.
    const { result, heard } = await listen(gm, async () =>
      data(await emitAck<CombatView>(player, 'combat:next'), 'combat:next (Kolec)'),
    );
    expect(result.round).toBe(4);
    expect(result.activeCombatantId).toBe(rowNamed(result, 'Kolec')!.id);
    expect(
      heard.some(
        (entry) =>
          entry.event === 'chat:message' && JSON.stringify(entry.payload).includes('Tura Demona'),
      ),
    ).toBe(true);
    // Mur rzuca Interfejsem 30 przeciw PT z Kontroli Kolca — węzeł wraca do obrony.
    expect(runFloor(await runOf(player), 'f3')?.controlledDv).toBeUndefined();
  });

  it('odłączenie zabiera z kolejki całą obronę tego runu', async () => {
    expect((await emitAck(gm, 'netrun:leave', { runId })).ok).toBe(true);
    const queue = await combatOf();
    expect(queue.combatants.map((row) => row.name)).toEqual(['Kolec']);
    await emitAck(gm, 'combat:end');
  });
});
