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
  CpredCharacterData,
  InvitationSummary,
  NetAccessPointView,
  NetArchitectureView,
  NetRunAbilityResult,
  NetRunPayload,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenView,
  WallView,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Węzły kontrolne i urządzenia (etap 26d) na żywych gniazdach.
 *
 * Testy czyste w `shared` opisują same zasady; tutaj sprawdzane jest to, czego
 * one dosięgnąć nie mogą:
 *
 *  - **lista urządzeń nie istnieje w payloadzie**, dopóki węzeł nie zostanie
 *    przejęty — nie jest ukryta, tylko jej tam nie ma;
 *  - **wieżyczka strzela silnikiem z etapu 16 Umiejętnościami netrunnera** —
 *    w rozbiciu rzutu stoi REF i Broń krótka *jego* karty, a nie profil figury;
 *  - **PT odebrania węzła** to wynik Testu, którym go przejęto — widać go
 *    w tytule karty rzutu drugiego netrunnera;
 *  - **węzeł działa raz na Turę**, ale dopiero gdy Tury w ogóle istnieją.
 *
 * Mapa: jedno pole to 100 px i 2 m, czyli metr ma 50 px.
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
    payload: { name: 'Kampania węzłów' },
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
    // Windows may still hold the file; nothing to clean up.
  }
});

describe('węzły kontrolne na żywych gniazdach', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;
  let architectureId: string;
  let characterId: string;
  let tokenId: string;
  let turretTokenId: string;
  let targetTokenId: string;
  let doorWallId: number;
  let pointId: number;
  let runId: string;

  /** Wieżyczka jako figura z profilem statysty z 16b — celowo słaba. */
  const TURRET_PROFILE = {
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

  function architecture() {
    return {
      name: 'Sieć magazynu',
      difficulty: 'standard',
      branches: [
        {
          id: 'trunk',
          parentFloor: null,
          floors: [
            {
              id: 'f0',
              kind: 'controlNode',
              label: 'Węzeł ochrony',
              // PT 1: rzut jest prawdziwy, a test ma być o zasadach, nie o szczęściu.
              dv: 1,
              devices: [
                { id: 'dev-cam', name: 'Kamera nad bramą', deviceKind: 'camera' },
                { id: 'dev-turret', name: 'Grzechot', deviceKind: 'turret', tokenId: '' },
                { id: 'dev-door', name: 'Brama towarowa', deviceKind: 'door', wallId: 0 },
              ],
            },
            { id: 'f1', kind: 'empty', label: 'Serwerownia' },
          ],
        },
      ],
    };
  }

  async function runOf(socket: ClientSocket): Promise<NetRunPayload | undefined> {
    const sync = await roundTrip(socket);
    return sync.netRuns.find((entry) => entry.runId === runId) ?? sync.netRuns[0];
  }

  function nodeOf(run: NetRunPayload) {
    return run.run.branches[0]!.floors.find((floor) => floor.id === 'f0');
  }

  /** Jedna obsługa urządzenia, z ręki gracza. */
  function operate(
    deviceId: string,
    operation: string,
    extra: Record<string, unknown> = {},
  ): Promise<SocketAck<NetRunAbilityResult>> {
    return emitAck<NetRunAbilityResult>(player, 'netrun:device', {
      runId,
      floorId: 'f0',
      deviceId,
      operation,
      ...extra,
    });
  }

  it('stawia stół: netrunner, wieżyczka z profilem, cel i brama', async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);

    const netrunner = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Kolec', ownerId: playerId }),
      'character:create',
    );
    characterId = netrunner.id;
    await emitAck(gm, 'character:update', {
      characterId,
      patch: {
        data: {
          roleId: 'netrunner',
          // Interfejs 10 z tego samego powodu co PT 1 na węźle.
          roleAbilityRank: 10,
          // REF 8 i Broń krótka 9 — liczby, których wieżyczka nie ma i mieć nie może.
          stats: { ...(netrunner.data as CpredCharacterData).stats, ref: 8 },
          skills: { handgun: 9, evasion: 2 },
          cyberdeck: { name: 'Cyberdek zwykłej jakości', slots: 7, installed: [] },
        },
      },
    });

    const scene = data(await emitAck<SceneView>(gm, 'scene:create', { name: 'Magazyn' }), 'scene');
    sceneId = scene.id;
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
        characterId,
      }),
      'token:create',
    ).id;
    turretTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Grzechot',
        x: 0,
        y: 6 * PX_PER_M,
        hp: { current: 25, max: 25 },
      }),
      'token:create',
    ).id;
    await emitAck(gm, 'token:update', {
      tokenId: turretTokenId,
      patch: { combatProfile: TURRET_PROFILE },
    });
    targetTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Zbir',
        x: 4 * PX_PER_M,
        y: 6 * PX_PER_M,
        hp: { current: 30, max: 30 },
      }),
      'token:create',
    ).id;

    const walls = data(
      await emitAck<WallView[]>(gm, 'wall:create', {
        sceneId,
        kind: 'door',
        // Daleko od linii strzału wieżyczki — brama jest tu po to, żeby ją otworzyć.
        points: [
          { x: 600, y: 600 },
          { x: 700, y: 600 },
        ],
      }),
      'wall:create',
    );
    doorWallId = walls[0]!.id;
    expect(walls[0]!.open).toBe(false);

    const shaft = architecture();
    const devices = shaft.branches[0]!.floors[0]!.devices!;
    devices[1]!.tokenId = turretTokenId;
    devices[2]!.wallId = doorWallId;
    architectureId = data(
      await emitAck<NetArchitectureView>(gm, 'net:save', { architecture: shaft }),
      'net:save',
    ).id;

    const point = data(
      await emitAck<NetAccessPointView>(gm, 'netpoint:place', {
        sceneId,
        x: 50,
        y: 50,
        name: 'Terminal ochrony',
        architectureId,
        hidden: false,
      }),
      'netpoint:place',
    );
    pointId = point.id;

    runId = data(
      await emitAck<NetRunPayload>(player, 'netrun:start', { tokenId, accessPointId: pointId }),
      'netrun:start',
    ).runId;
    expect(runId).toBeTruthy();
  });

  it('nie przysyła graczowi listy urządzeń, dopóki węzeł nie jest przejęty', async () => {
    const run = await runOf(player);
    const node = nodeOf(run!);
    expect(node?.kind).toBe('controlNode');
    // Nie „ukryte" — po prostu nieobecne w payloadzie.
    expect(node?.devices).toBeUndefined();
    // MG widzi je zawsze: to jego własna budowla.
    expect(nodeOf((await runOf(gm))!)?.devices).toHaveLength(3);
  });

  /** Jeden Test Kontroli węzła przez gracza. */
  async function takeNode(): Promise<NetRunAbilityResult> {
    return data(
      await emitAck<NetRunAbilityResult>(player, 'netrun:ability', { runId, ability: 'control' }),
      'netrun:ability',
    );
  }

  it('odmawia obsługi urządzenia przy nieprzejętym węźle', async () => {
    expect(errorOf(await operate('dev-cam', 'turn'))).toBe('NET_NODE_NOT_HELD');
  });

  it('przejmuje węzeł Kontrolą i dopiero wtedy pokazuje, co do niego podłączono', async () => {
    // Interfejs 10 przeciw PT 1 przegrywa **dokładnie raz na sto**: naturalna
    // jedynka każe dorzucić kość i ją odjąć (dorzut sam już nie wybucha), więc
    // najniższy możliwy wynik to równo 1 — a Test wymaga „więcej niż PT".
    // Ten jeden rzut trzymał w garści pięć testów niżej: bez węzła każdy
    // `operate` wraca z `NET_NODE_NOT_HELD`. Test jest o tym, **skąd bierze się
    // PT**, nie o tym, czy kości były łaskawe, więc powtarza. Tu jest to darmowe
    // — walka zaczyna się dopiero niżej, a poza walką nie ma budżetu Akcji
    // Sieciowych (`spendTurnForToken` zwraca „not-in-combat").
    let result = await takeNode();
    for (let attempt = 1; attempt < 6 && !result.success; attempt += 1) result = await takeNode();
    expect(result.success).toBe(true);
    expect(result.summary).toContain(`${result.total}`);

    const node = nodeOf((await runOf(player))!);
    expect(node?.controlledDv).toBe(result.total);
    expect(node?.devices?.map((device) => device.name)).toEqual([
      'Kamera nad bramą',
      'Grzechot',
      'Brama towarowa',
    ]);
    // Wpis kompendium jest opcjonalny — bez niego urządzenie nadal działa.
    expect(node?.devices?.[0]?.operations).toContain('turn');
  });

  it('obraca kamerę, a stan przeżywa odłączenie', async () => {
    const turned = data(await operate('dev-cam', 'turn'), 'netrun:device');
    expect(turned.summary).toContain('nie patrzy');
    expect(nodeOf((await runOf(player))!)?.devices?.[0]?.turned).toBe(true);

    // „Tracisz kontrolę nad wszystkimi węzłami" (s. 199) — ale kamera została
    // obrócona w prawdziwym świecie i tam zostaje.
    await emitAck(player, 'netrun:leave', { runId });
    runId = data(
      await emitAck<NetRunPayload>(player, 'netrun:start', { tokenId, accessPointId: pointId }),
      'netrun:start',
    ).runId;
    const back = await runOf(gm);
    expect(nodeOf(back!)?.devices?.[0]?.turned).toBe(true);
    // Sama kontrola nad węzłem — nie.
    expect(nodeOf((await runOf(player))!)?.controlledDv).toBeUndefined();
  });

  it('odmawia obsługi, której to urządzenie nie zna, i strzału bez figury', async () => {
    // Węzeł jest już przejęty testem wyżej; ten rzut niczego nie zmienia,
    // a jego wynik nie ma tu znaczenia — porażka nie oddaje węzła.
    await takeNode();
    expect(errorOf(await operate('dev-cam', 'fire'))).toBe('NET_DEVICE_WRONG_OPERATION');
    expect(errorOf(await operate('dev-cam', 'open'))).toBe('NET_DEVICE_WRONG_OPERATION');
    expect(errorOf(await operate('nie-ma-takiego', 'turn'))).toBe('NET_DEVICE_UNKNOWN');
  });

  it('otwiera bramę na mapie z drugiego końca kabla', async () => {
    const opened = data(await operate('dev-door', 'open'), 'netrun:device');
    expect(opened.summary).toContain('otwarte');
    const walls = (await roundTrip(gm)).walls ?? [];
    expect(walls.find((wall) => wall.id === doorWallId)?.open).toBe(true);
  });

  it('strzela wieżyczką Umiejętnościami netrunnera, nie profilem figury', async () => {
    const message = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    const shot = data(
      await operate('dev-turret', 'fire', { targetTokenId }),
      'netrun:device — strzał',
    );
    expect(shot.summary).toContain('Grzechot');

    const roll = (await message).message.roll;
    const stat = roll?.breakdown?.find((row) => row.kind === 'stat');
    const skill = roll?.breakdown?.find((row) => row.kind === 'skill');
    // REF 8 i Broń krótka 9 są netrunnera; profil wieżyczki niesie 3 i 1.
    expect(stat?.value).toBe(8);
    expect(skill?.value).toBe(9);
    // Ale magazynek jest wieżyczki i to on się opróżnia.
    const turret = (await roundTrip(gm)).tokens.find((entry) => entry.id === turretTokenId);
    expect((turret?.combatProfile as { ammoCurrent: number } | null)?.ammoCurrent).toBe(9);
    // A karta ataku wyszła z figury wieżyczki, nie z karty netrunnera.
    expect(roll?.actor).toBe('Grzechot');
  });

  it('wyłączonego urządzenia nie da się obsłużyć, dopóki nie wróci', async () => {
    data(await operate('dev-cam', 'off'), 'netrun:device');
    expect(errorOf(await operate('dev-cam', 'turn'))).toBe('NET_DEVICE_OFF');
    data(await operate('dev-cam', 'on'), 'netrun:device');
    expect((await operate('dev-cam', 'turn')).ok).toBe(true);
  });

  it('odmierza węzłowi jedną aktywację na Turę, gdy Tury w ogóle są', async () => {
    const combat = data(
      await emitAck<CombatView>(gm, 'combat:start', { sceneId, tokenIds: [tokenId] }),
      'combat:start',
    );
    await emitAck(gm, 'combat:set-initiative', {
      combatantId: combat.combatants[0]!.id,
      initiative: 12,
    });
    await emitAck(gm, 'combat:next');

    const first = await operate('dev-cam', 'turn');
    expect(first.ok).toBe(true);
    // „Dany węzeł kontrolny można aktywować tylko raz na Turę" (s. 199).
    expect(errorOf(await operate('dev-door', 'close'))).toBe('NET_NODE_USED');

    // Nowa Runda otwiera węzeł z powrotem.
    await emitAck(gm, 'combat:next');
    expect((await operate('dev-door', 'close')).ok).toBe(true);
    await emitAck(gm, 'combat:end');
  });

  it('rozlicza odebranie węzła PT równym wynikowi Testu, którym go przejęto', async () => {
    // Drugi netrunner przy tym samym gnieździe.
    const rivalSheet = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Ćma' }),
      'character:create',
    );
    await emitAck(gm, 'character:update', {
      characterId: rivalSheet.id,
      patch: {
        data: {
          roleId: 'netrunner',
          roleAbilityRank: 4,
          cyberdeck: { name: 'Cyberdek zwykłej jakości', slots: 7, installed: [] },
        },
      },
    });
    const rivalTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Ćma',
        x: 0,
        y: 0,
        characterId: rivalSheet.id,
      }),
      'token:create',
    ).id;
    const rivalRunId = data(
      await emitAck<NetRunPayload>(gm, 'netrun:start', {
        tokenId: rivalTokenId,
        accessPointId: pointId,
      }),
      'netrun:start',
    ).runId;

    const heldDv = nodeOf((await runOf(player))!)?.controlledDv;
    expect(heldDv).toBeGreaterThan(1);

    const card = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    const attempt = await emitAck<NetRunAbilityResult>(gm, 'netrun:ability', {
      runId: rivalRunId,
      ability: 'control',
    });
    // Tytuł karty niesie PT, przeciw któremu naprawdę rzucono — a to jest
    // wynik pierwszego Testu Kontroli, nie PT 1 wypisane na piętrze.
    expect((await card).message.roll?.title).toContain(`PT ${heldDv}`);

    const outcome = data(attempt, 'netrun:ability');
    const holderNow = (await roundTrip(gm)).netRuns
      .filter((entry) => entry.run.branches[0]!.floors[0]!.controlledDv !== undefined)
      .map((entry) => entry.runId);
    // Węzeł ma dokładnie jednego właściciela, kimkolwiek by nie był.
    expect(holderNow).toHaveLength(1);
    expect(holderNow[0]).toBe(outcome.success ? rivalRunId : runId);
    expect(outcome.summary).toContain(outcome.success ? 'odebrany' : 'cudzych');
  });
});
