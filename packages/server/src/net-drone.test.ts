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
  ExplorationMask,
  NetAccessPointView,
  NetArchitectureView,
  NetRunAbilityResult,
  NetRunPayload,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenView,
} from '@vtt/shared';
import { decodeFlagRuns } from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { joinUrl } from './test-join.js';

/**
 * Przejęty dron i oczy urządzeń (etap 70c) na żywych gniazdach.
 *
 * Ciemna hala 2000 × 2000 (pole 100 px = 2 m), ściana przez całą szerokość na
 * y = 1000. Netrunner stoi nad nią przy gnieździe i widzi w ciemności na 2 m,
 * a pod ścianą stoją: dron (wzrok 6 m), Kot 4 m pod dronem, Zbir 12 m na
 * wschód od drona, wieżyczka (wzrok 6 m) i Strażnik 4 m pod nią. Bez Kontroli
 * żaden gracz nie widzi niczego pod ścianą.
 *
 * Sprawdzane jest to, czego testy `shared` nie dosięgną: oczy wieżyczki
 * i drona w ciemności tylko u netrunnera i bez pamięci mapy, marsz drona
 * z budżetu aktywacji (podjazd i strzał za jedną Akcję Sieciową), odmowy
 * cudzej ręki i figury, która stoi, oraz naklejka „Wyłączony” z turą
 * oddawaną przez kolejkę.
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
let bystanderCookie: string;
let bystanderId: string;
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

/** Czy drużyna tu była — z maski pamięci mapy z drutu. */
function exploredAt(mask: ExplorationMask | null, point: { x: number; y: number }): boolean {
  if (!mask) return false;
  const col = Math.floor(point.x / mask.cell);
  const row = Math.floor(point.y / mask.cell);
  if (col < 0 || row < 0 || col >= mask.cols || row >= mask.rows) return false;
  return decodeFlagRuns(mask.runs, mask.cols * mask.rows)[row * mask.cols + col] === 1;
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
    payload: { name: 'Kampania drona' },
  });
  const invite = (campaignRes.json() as CampaignSummary).id;

  const joinRes = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, invite, 'Kolec'),
  });
  playerCookie = cookieOf(joinRes.headers['set-cookie']);
  playerId = (joinRes.json() as { user: { id: string } }).user.id;

  const bystanderRes = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, invite, 'Gapa'),
  });
  bystanderCookie = cookieOf(bystanderRes.headers['set-cookie']);
  bystanderId = (bystanderRes.json() as { user: { id: string } }).user.id;
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

describe('przejęty dron i oczy urządzeń (etap 70c)', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let bystander: ClientSocket;
  let sceneId: string;
  let runId: string;
  let runnerTokenId: string;
  let droneTokenId: string;
  let turretTokenId: string;
  let targetTokenId: string;

  /** Statysta z bronią — ten sam szkielet dla drona i wieżyczki. */
  const STATIST = {
    ref: 3,
    dex: 3,
    body: 5,
    will: 5,
    skillLevel: 1,
    evasion: 1,
    armorSp: 0,
    weaponId: 'weapon.zgrzyt-9',
    weaponName: 'Zgrzyt 9',
    weaponDamage: '2k6',
    ammoCurrent: 10,
    ammoMax: 10,
  };

  async function token(name: string, x: number, y: number, extra: Record<string, unknown> = {}) {
    return data(
      await emitAck<TokenView>(gm, 'token:create', { sceneId, name, x, y, ...extra }),
      `token:create ${name}`,
    ).id;
  }

  it('stawia halę: ściana, netrunner nad nią, dron, wieżyczka i trzy cele pod nią', async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    const bystanderConn = createSocket(bystanderCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    bystander = bystanderConn.socket;
    await Promise.all([gmConn.firstSync, playerConn.firstSync, bystanderConn.firstSync]);

    const netrunner = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Kolec', ownerId: playerId }),
      'character:create',
    );
    await emitAck(gm, 'character:update', {
      characterId: netrunner.id,
      patch: {
        data: {
          roleId: 'netrunner',
          roleAbilityRank: 10,
          cyberdeck: { name: 'Cyberdek zwykłej jakości', slots: 7, installed: [] },
        },
      },
    });

    // Dron bojowy z RUCH-em 4 (8 m na aktywację) i Wartością bojową 12.
    data(
      await emitAck<CompendiumEntry>(gm, 'compendium:upsert', {
        entry: {
          category: 'netDefense',
          name: 'Dron bojowy',
          cost: 1000,
          defenseKind: 'drone',
          hp: 20,
          move: 4,
          combatValue: 12,
          disableDv: 15,
        },
      }),
      'compendium:upsert (dron)',
    );

    sceneId = data(await emitAck<SceneView>(gm, 'scene:create', { name: 'Hala' }), 'scene').id;
    await emitAck(gm, 'scene:update', {
      sceneId,
      patch: {
        width: 2000,
        height: 2000,
        grid: { sizePx: 100 },
        metersPerSquare: 2,
        playerMove: 'explore',
      },
    });
    const activated = waitFor(player, 'scene:activate');
    await emitAck(gm, 'scene:activate', { sceneId });
    await activated;
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'dynamic' });
    data(await emitAck(gm, 'scene:lighting', { sceneId, dark: true, darkSightM: 2 }), 'ciemno');
    await emitAck(gm, 'wall:create', {
      sceneId,
      kind: 'wall',
      points: [
        { x: 0, y: 1000 },
        { x: 2000, y: 1000 },
      ],
    });

    runnerTokenId = await token('Kolec', 0, 0, { ownerId: playerId, characterId: netrunner.id });
    await token('Gapa', 300, 0, { ownerId: bystanderId });
    droneTokenId = await token('Szerszeń', 300, 1300, { hp: { current: 20, max: 20 } });
    turretTokenId = await token('Grzechot', 1600, 1300, { hp: { current: 25, max: 25 } });
    for (const id of [droneTokenId, turretTokenId]) {
      await emitAck(gm, 'token:stat', { tokenId: id, quick: STATIST });
      await emitAck(gm, 'token:update', { tokenId: id, patch: { visionRange: 6 } });
    }
    await token('Kot', 300, 1500);
    targetTokenId = await token('Zbir', 900, 1300, { hp: { current: 30, max: 30 } });
    await token('Strażnik', 1600, 1500);

    const architectureId = data(
      await emitAck<NetArchitectureView>(gm, 'net:save', {
        architecture: {
          name: 'Sieć hali',
          difficulty: 'standard',
          branches: [
            {
              id: 'trunk',
              parentFloor: null,
              floors: [
                {
                  id: 'f0',
                  kind: 'controlNode',
                  label: 'Obrona',
                  dv: 1,
                  devices: [
                    {
                      id: 'dev-drone',
                      name: 'Szerszeń',
                      deviceKind: 'drone',
                      tokenId: droneTokenId,
                      entryId: 'defense.dron-bojowy',
                    },
                    {
                      id: 'dev-turret',
                      name: 'Grzechot',
                      deviceKind: 'turret',
                      tokenId: turretTokenId,
                    },
                  ],
                },
              ],
            },
          ],
        },
      }),
      'net:save',
    ).id;
    const point = data(
      await emitAck<NetAccessPointView>(gm, 'netpoint:place', {
        sceneId,
        x: 50,
        y: 50,
        name: 'Terminal',
        architectureId,
        hidden: false,
      }),
      'netpoint:place',
    );
    runId = data(
      await emitAck<NetRunPayload>(player, 'netrun:start', {
        tokenId: runnerTokenId,
        accessPointId: point.id,
      }),
      'netrun:start',
    ).runId;
  });

  async function namesSeenBy(socket: ClientSocket): Promise<string[]> {
    return (await roundTrip(socket)).tokens.map((entry) => entry.name).sort();
  }

  async function operatedOf(id: string) {
    const sync = await roundTrip(player);
    return sync.netRuns
      .find((entry) => entry.runId === runId)
      ?.operated.find((figure) => figure.tokenId === id);
  }

  function walk(socket: ClientSocket, tokenId: string, x: number, y: number) {
    return emitAck<{ tokenId: string }>(socket, 'token:walk', {
      tokenId,
      route: [{ x, y }],
    });
  }

  /** Marsz klikiem: trasa zatwierdzona `token:walk`, potem lądowanie. */
  async function drive(socket: ClientSocket, tokenId: string, x: number, y: number) {
    const approved = await walk(socket, tokenId, x, y);
    if (!approved.ok) return approved;
    return emitAck<{ x: number; y: number }>(socket, 'token:move', { tokenId, x, y, final: true });
  }

  it('bez Kontroli nikt z graczy nie widzi niczego pod ścianą', async () => {
    const seen = await namesSeenBy(player);
    for (const name of ['Szerszeń', 'Kot', 'Zbir', 'Grzechot', 'Strażnik']) {
      expect(seen).not.toContain(name);
    }
  });

  it('po Kontroli dron i wieżyczka pożyczają oczy w ciemności — tylko netrunnerowi', async () => {
    let result = data(
      await emitAck<NetRunAbilityResult>(player, 'netrun:ability', { runId, ability: 'control' }),
      'netrun:ability',
    );
    for (let attempt = 1; attempt < 6 && !result.success; attempt += 1) {
      result = data(
        await emitAck<NetRunAbilityResult>(player, 'netrun:ability', { runId, ability: 'control' }),
        'netrun:ability',
      );
    }
    expect(result.success).toBe(true);

    const seen = await namesSeenBy(player);
    // Koło 6 m wokół drona i wokół wieżyczki — w czerni hali.
    expect(seen).toContain('Kot');
    expect(seen).toContain('Strażnik');
    // Zbir stoi 12 m od drona i 14 m od wieżyczki.
    expect(seen).not.toContain('Zbir');
    expect(await namesSeenBy(bystander)).not.toContain('Kot');
  });

  it('pamięć mapy drużyny nie rośnie o to, co pokazują oczy urządzeń', async () => {
    const sync = await roundTrip(player);
    expect(exploredAt(sync.exploration, { x: 350, y: 1550 })).toBe(false);
    expect(exploredAt(sync.exploration, { x: 1650, y: 1550 })).toBe(false);
  });

  it('ładunek runu niesie RUCH drona; wieżyczka metrów nie ma', async () => {
    const drone = await operatedOf(droneTokenId);
    expect(drone).toMatchObject({ deviceKind: 'drone', moveM: 8, state: 'free' });
    expect(drone?.moveLeftM).toBeUndefined();
    expect((await operatedOf(turretTokenId))?.moveM).toBeUndefined();
  });

  it('cudza ręka i figura, która stoi, nie jeżdżą', async () => {
    expect(errorOf(await walk(bystander, droneTokenId, 300, 1100))).toBe('FORBIDDEN');
    expect(errorOf(await walk(player, turretTokenId, 1600, 1100))).toBe('NET_DEVICE_STATIONARY');
  });

  it('w walce dron w jednej aktywacji podjeżdża i strzela; trzecia czynność odmawia', async () => {
    const combat = data(
      await emitAck<CombatView>(gm, 'combat:start', {
        sceneId,
        tokenIds: [runnerTokenId, droneTokenId, targetTokenId],
      }),
      'combat:start',
    );
    const initiative = { [runnerTokenId]: 15, [droneTokenId]: 10, [targetTokenId]: 5 };
    for (const row of combat.combatants) {
      await emitAck(gm, 'combat:set-initiative', {
        combatantId: row.id,
        initiative: initiative[row.tokenId!],
      });
    }
    await emitAck(gm, 'combat:next');
    const runnerTurn = async () =>
      JSON.stringify(
        (await roundTrip(gm)).combat?.combatants.find((row) => row.tokenId === runnerTokenId)
          ?.turn ?? null,
      );
    const before = await runnerTurn();
    expect(await operatedOf(droneTokenId)).toMatchObject({ state: 'ready', moveM: 8 });

    // 10 m przy budżecie 8 m: odmowa na sucho, nic nie zapłacone.
    expect(errorOf(await walk(player, droneTokenId, 800, 1300))).toBe('NET_DEVICE_NO_MOVE_LEFT');
    expect(await runnerTurn()).toEqual(before);

    // Podjazd 8 m na wschód: Akcja Sieciowa netrunnera, metry z aktywacji.
    data(await drive(player, droneTokenId, 700, 1300), 'marsz drona');
    expect(await runnerTurn()).not.toEqual(before);
    expect(await operatedOf(droneTokenId)).toMatchObject({ state: 'active', moveLeftM: 0 });
    // Dron widzi teraz Zbira (4 m) — i netrunner razem z nim.
    expect(await namesSeenBy(player)).toContain('Zbir');
    const spent = await runnerTurn();

    // Strzał w tej samej aktywacji — bez drugiej Akcji Sieciowej, Wartością bojową 12.
    const card = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    data(
      await emitAck<{ messageId?: number }>(player, 'attack:roll', {
        attackerTokenId: droneTokenId,
        targetTokenId,
        request: { weaponRowId: 'statist-weapon' },
      }),
      'strzał drona',
    );
    const roll = (await card).message.roll;
    expect(roll?.actor).toBe('Szerszeń');
    expect(roll?.breakdown?.find((row) => row.kind === 'skill')?.value).toBe(12);
    expect(await runnerTurn()).toEqual(spent);
    expect((await operatedOf(droneTokenId))?.state).toBe('spent');

    // Ani metra, ani drugiego strzału.
    expect(errorOf(await walk(player, droneTokenId, 700, 1100))).toBe('NET_DEVICE_NO_MOVE_LEFT');
    expect(
      errorOf(
        await emitAck(player, 'attack:roll', {
          attackerTokenId: droneTokenId,
          targetTokenId,
          request: { weaponRowId: 'statist-weapon' },
        }),
      ),
    ).toBe('NET_DEVICE_SPENT');
    // Gracz spoza runu nie ruszy drona także w walce.
    expect(errorOf(await walk(bystander, droneTokenId, 700, 1100))).toBe('FORBIDDEN');
    await emitAck(gm, 'combat:end');
  });

  it('ukryty dron jeździ ręką netrunnera; dla reszty stołu nie istnieje', async () => {
    await emitAck(gm, 'token:update', { tokenId: droneTokenId, patch: { hidden: true } });
    expect(errorOf(await walk(bystander, droneTokenId, 700, 1100))).toBe('TOKEN_NOT_FOUND');
    // Poza walką aktywacja nic nie kosztuje i nie ma limitu metrów.
    data(await drive(player, droneTokenId, 700, 1100), 'marsz ukrytego drona');
    const drone = (await roundTrip(gm)).tokens.find((entry) => entry.id === droneTokenId);
    expect({ x: drone?.x, y: drone?.y }).toEqual({ x: 700, y: 1100 });
    await emitAck(gm, 'token:update', { tokenId: droneTokenId, patch: { hidden: false } });
  });

  it('„Wyłącz” daje naklejkę „Wyłączony”, oddaje figurę i gasi jej oczy', async () => {
    data(
      await emitAck(player, 'netrun:device', {
        runId,
        floorId: 'f0',
        deviceId: 'dev-drone',
        operation: 'off',
      }),
      'netrun:device off',
    );
    const drone = (await roundTrip(gm)).tokens.find((entry) => entry.id === droneTokenId);
    expect(drone?.statuses).toContain('net-off');
    expect(drone?.statuses).not.toContain('net-seized');
    expect(await operatedOf(droneTokenId)).toBeUndefined();
    expect(errorOf(await walk(player, droneTokenId, 700, 1300))).toBe('FORBIDDEN');
  });

  it('wyłączona figura nie gra tury; „Włącz” zdejmuje naklejkę i oddaje figurę', async () => {
    const combat = data(
      await emitAck<CombatView>(gm, 'combat:start', {
        sceneId,
        tokenIds: [runnerTokenId, droneTokenId],
      }),
      'combat:start',
    );
    const runner = combat.combatants.find((row) => row.tokenId === runnerTokenId)!;
    const drone = combat.combatants.find((row) => row.tokenId === droneTokenId)!;
    await emitAck(gm, 'combat:set-initiative', { combatantId: drone.id, initiative: 20 });
    await emitAck(gm, 'combat:set-initiative', { combatantId: runner.id, initiative: 10 });
    const lines: string[] = [];
    const onMessage = (payload: ChatMessageBroadcast) => {
      lines.push(JSON.stringify(payload.message.action ?? {}));
    };
    gm.on('chat:message', onMessage);
    const started = data(await emitAck<CombatView>(gm, 'combat:next'), 'combat:next');
    await roundTrip(gm);
    gm.off('chat:message', onMessage);
    // Tura drona przeszła sama — kolejka stoi na netrunnerze, czat mówi czemu.
    const now = (await roundTrip(gm)).combat;
    expect(now?.activeCombatantId ?? started.activeCombatantId).toBe(runner.id);
    expect(lines.some((line) => line.includes('wyłączona w Sieci'))).toBe(true);

    data(
      await emitAck(player, 'netrun:device', {
        runId,
        floorId: 'f0',
        deviceId: 'dev-drone',
        operation: 'on',
      }),
      'netrun:device on',
    );
    const back = (await roundTrip(gm)).tokens.find((entry) => entry.id === droneTokenId);
    expect(back?.statuses).not.toContain('net-off');
    expect(back?.statuses).toContain('net-seized');
    expect((await operatedOf(droneTokenId))?.deviceKind).toBe('drone');
    await emitAck(gm, 'combat:end');
  });
});
