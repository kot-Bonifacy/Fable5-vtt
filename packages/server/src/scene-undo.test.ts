import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  CampaignSummary,
  CoverSyncBroadcast,
  CoverView,
  DrawingView,
  InvitationSummary,
  LightSyncBroadcast,
  LightView,
  NetAccessPointView,
  SceneUndoResult,
  SceneView,
  SocketAck,
  StateSyncPayload,
  WallSyncBroadcast,
  WallView,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { resetUndoBuffer } from './realtime/undo-buffer.js';

/**
 * Etap 27k — `Ctrl+Z` po usunięciu obiektu ze sceny, plus dwa brakujące kosze.
 *
 * Testowane jest to, czego klient nie umiałby zrobić sam i co było powodem
 * przeniesienia cofania na serwer:
 *
 *  - **wiersz wraca z tym samym id** (a nie „taki sam, tylko nowy"),
 *  - **kosz to jedna pozycja cofania**, więc jedno wciśnięcie wraca całą grupę,
 *  - **cofa wyłącznie ten, kto usunął** — bufor jest kluczowany osobą, nie rolą,
 *  - **filtr sceny**: pozycja z innej mapy nie wskakuje pod ręką.
 *
 * Scena jest pusta i płaska (widoczność `open`): nic tu nie zależy od ścian,
 * a te, które stawiamy, są materiałem do skasowania.
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
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), 3000);
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

function waitFor<T>(socket: ClientSocket, event: string, ms = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
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
    payload: { name: 'Kampania sprzątania' },
  });
  const campaignId = (campaignRes.json() as CampaignSummary).id;

  const inviteRes = await built.app.inject({
    method: 'POST',
    url: `/api/campaigns/${campaignId}/invitations`,
    headers: { cookie: gmCookie },
    payload: {},
  });
  const token = (inviteRes.json() as InvitationSummary).token;

  const joinRes = await built.app.inject({
    method: 'POST',
    url: `/api/join/${token}`,
    payload: { name: 'Rogue' },
  });
  playerCookie = cookieOf(joinRes.headers['set-cookie']);
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

describe('kasowanie i cofanie obiektów sceny', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;

  beforeAll(async () => {
    const gmConn = createSocket(gmCookie);
    gm = gmConn.socket;
    await gmConn.firstSync;

    const scene = data(await emitAck<SceneView>(gm, 'scene:create', { name: 'Magazyn' }), 'scene');
    sceneId = scene.id;
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'open' });
    await emitAck(gm, 'scene:activate', { sceneId });

    const playerConn = createSocket(playerCookie);
    player = playerConn.socket;
    await playerConn.firstSync;
  }, 30_000);

  // Bufor cofania to stan procesu serwera, wspólny dla wszystkich przypadków w
  // tym pliku. Zerujemy go między nimi, żeby „pusty stos" znaczyło pusty stos,
  // a nie „stos z resztkami po poprzednim teście".
  beforeEach(() => {
    resetUndoBuffer();
  });

  it('usunięta ściana wraca z tym samym id i z założonym zamkiem', async () => {
    const created = data(
      await emitAck<WallView[]>(gm, 'wall:create', {
        sceneId,
        kind: 'door',
        points: [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
        ],
      }),
      'wall:create',
    );
    const door = created[0]!;
    await emitAck(gm, 'wall:update', { wallId: door.id, patch: { locked: true } });

    const afterDelete = waitFor<WallSyncBroadcast>(gm, 'wall:sync');
    expect(errorOf(await emitAck(gm, 'wall:delete', { wallId: door.id }))).toBeUndefined();
    expect((await afterDelete).walls).toHaveLength(0);

    const afterUndo = waitFor<WallSyncBroadcast>(gm, 'wall:sync');
    const result = data(
      await emitAck<SceneUndoResult>(gm, 'scene:undo', { sceneId }),
      'scene:undo',
    );
    expect(result).toMatchObject({ kind: 'wall', count: 1 });
    expect(result.note).toBe('Przywrócono ścianę.');

    const walls = (await afterUndo).walls;
    expect(walls).toHaveLength(1);
    // To jest sedno przeniesienia cofania na serwer: id i zamek wracają. Klient
    // odtwarzający ścianę własnym `wall:create` dostałby nowe id, a `locked`
    // musiałby dosłać osobnym `wall:update`.
    expect(walls[0]!.id).toBe(door.id);
    expect(walls[0]!.locked).toBe(true);
    expect(walls[0]!.kind).toBe('door');

    await emitAck(gm, 'wall:clear', { sceneId });
  }, 20_000);

  it('kosz świateł istnieje, a jedno cofnięcie wraca całą grupę', async () => {
    const lamps: LightView[] = [];
    for (const x of [100, 300, 500]) {
      lamps.push(
        data(
          await emitAck<LightView>(gm, 'light:create', { sceneId, x, y: 200, dimM: 6 }),
          'light:create',
        ),
      );
    }

    const cleared = waitFor<LightSyncBroadcast>(gm, 'light:sync');
    expect(errorOf(await emitAck(gm, 'light:clear', { sceneId }))).toBeUndefined();
    expect((await cleared).lights).toHaveLength(0);

    const restored = waitFor<LightSyncBroadcast>(gm, 'light:sync');
    const result = data(
      await emitAck<SceneUndoResult>(gm, 'scene:undo', { sceneId }),
      'scene:undo',
    );
    // Jedna pozycja na cały kosz — to jest to, co zastąpiło okno potwierdzenia.
    expect(result).toMatchObject({ kind: 'light', count: 3 });
    expect(result.note).toBe('Przywrócono 3 światła.');
    expect((await restored).lights.map((lamp) => lamp.id).sort()).toEqual(
      lamps.map((lamp) => lamp.id).sort(),
    );

    await emitAck(gm, 'light:clear', { sceneId });
  }, 20_000);

  it('kosz gniazd istnieje i też cofa się w całości', async () => {
    const first = data(
      await emitAck<NetAccessPointView>(gm, 'netpoint:place', {
        sceneId,
        x: 50,
        y: 50,
        name: 'Terminal A',
      }),
      'netpoint:place',
    );
    const second = data(
      await emitAck<NetAccessPointView>(gm, 'netpoint:place', {
        sceneId,
        x: 250,
        y: 50,
        name: 'Terminal B',
      }),
      'netpoint:place',
    );

    expect(errorOf(await emitAck(gm, 'netpoint:clear', { sceneId }))).toBeUndefined();
    expect(await built.prisma.netAccessPoint.count({ where: { sceneId } })).toBe(0);

    const result = data(
      await emitAck<SceneUndoResult>(gm, 'scene:undo', { sceneId }),
      'scene:undo',
    );
    expect(result).toMatchObject({ kind: 'netpoint', count: 2 });
    expect(result.note).toBe('Przywrócono 2 punkty dostępu.');

    const points = await built.prisma.netAccessPoint.findMany({ where: { sceneId } });
    // Nazwa i notatka wracają razem z id — `netpoint:place` nie przyjmuje notatki,
    // więc odtworzenie u klienta gubiłoby ją bezpowrotnie.
    expect(points.map((point) => point.id).sort()).toEqual([first.id, second.id].sort());
    expect(points.find((point) => point.id === first.id)?.name).toBe('Terminal A');

    await emitAck(gm, 'netpoint:clear', { sceneId });
  }, 20_000);

  it('kosz osłon wraca w całości — zaległość „kasuje bez pytania i bez cofnięcia"', async () => {
    const covers: CoverView[] = [];
    for (const x of [0, 400]) {
      covers.push(
        data(
          await emitAck<CoverView>(gm, 'cover:create', {
            sceneId,
            typeId: 'car',
            x,
            y: 600,
            width: 100,
            height: 200,
          }),
          'cover:create',
        ),
      );
    }
    // Świeży wrak: cofnięcie ma oddać **bieżące** PW, a nie te z katalogu.
    await emitAck(gm, 'cover:update', {
      coverId: covers[0]!.id,
      patch: { hpCurrent: 3 },
    });

    const cleared = waitFor<CoverSyncBroadcast>(gm, 'cover:sync');
    await emitAck(gm, 'cover:clear', { sceneId });
    expect((await cleared).covers).toHaveLength(0);

    const restored = waitFor<CoverSyncBroadcast>(gm, 'cover:sync');
    const result = data(
      await emitAck<SceneUndoResult>(gm, 'scene:undo', { sceneId }),
      'scene:undo',
    );
    expect(result).toMatchObject({ kind: 'cover', count: 2 });
    // Bieżące PW, nie te z katalogu: `cover:create` ich nie przyjmuje, więc
    // odtworzenie u klienta postawiłoby wrak z powrotem jako całą maskę.
    const back = (await restored).covers;
    expect(back.find((cover) => cover.id === covers[0]!.id)?.hpCurrent).toBe(3);

    await emitAck(gm, 'cover:clear', { sceneId });
  }, 20_000);

  it('gracz cofa własny rysunek; usunięcie MG zostaje MG', async () => {
    const mine = data(
      await emitAck<DrawingView>(player, 'drawing:create', {
        sceneId,
        shape: {
          kind: 'path',
          points: [
            { x: 10, y: 10 },
            { x: 60, y: 40 },
          ],
        },
        style: { color: '#22d3ee', width: 6, filled: false },
      }),
      'drawing:create',
    );

    expect(
      errorOf(await emitAck(player, 'drawing:delete', { drawingId: mine.id })),
    ).toBeUndefined();

    // MG na tej samej scenie ma pusty stos — bufor jest kluczowany osobą, nie
    // rolą, więc cudze usunięcie nie jest dla niego widoczne.
    expect(errorOf(await emitAck(gm, 'scene:undo', { sceneId }))).toBe('NOTHING_TO_UNDO');

    const result = data(
      await emitAck<SceneUndoResult>(player, 'scene:undo', { sceneId }),
      'scene:undo',
    );
    expect(result).toMatchObject({ kind: 'drawing', count: 1 });
    const rows = await built.prisma.mapDrawing.findMany({ where: { sceneId } });
    expect(rows.map((row) => row.id)).toEqual([mine.id]);

    await emitAck(player, 'drawing:clear', { sceneId, scope: 'mine' });
  }, 20_000);

  it('pusty stos odmawia zdaniem, a nie ciszą', async () => {
    expect(errorOf(await emitAck(gm, 'scene:undo', { sceneId }))).toBe('NOTHING_TO_UNDO');
  });

  it('pozycja z innej sceny nie wskakuje pod ręką', async () => {
    const other = data(
      await emitAck<SceneView>(gm, 'scene:create', { name: 'Dach' }),
      'scene:create',
    );
    const wall = data(
      await emitAck<WallView[]>(gm, 'wall:create', {
        sceneId: other.id,
        kind: 'wall',
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
      }),
      'wall:create',
    )[0]!;
    await emitAck(gm, 'wall:delete', { wallId: wall.id });

    // Ta sama kampania, inna scena: `Ctrl+Z` przy magazynie nie ma przywracać
    // ściany z dachu, bo nikt by tego nie zobaczył.
    expect(errorOf(await emitAck(gm, 'scene:undo', { sceneId }))).toBe('NOTHING_TO_UNDO');
    expect(errorOf(await emitAck(gm, 'scene:undo', { sceneId: other.id }))).toBeUndefined();
    expect(await built.prisma.wall.count({ where: { sceneId: other.id } })).toBe(1);
  }, 20_000);

  it('usunięcie sceny zabiera ze sobą jej pozycje cofania', async () => {
    const doomed = data(
      await emitAck<SceneView>(gm, 'scene:create', { name: 'Piwnica' }),
      'scene:create',
    );
    const wall = data(
      await emitAck<WallView[]>(gm, 'wall:create', {
        sceneId: doomed.id,
        kind: 'wall',
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
      }),
      'wall:create',
    )[0]!;
    await emitAck(gm, 'wall:delete', { wallId: wall.id });
    expect(errorOf(await emitAck(gm, 'scene:delete', { sceneId: doomed.id }))).toBeUndefined();

    // Scena zniknęła, więc `scene:undo` nie ma nawet do czego się odwołać —
    // a pozycja z jej `sceneId` nie może zostać w buforze i wywrócić bazy.
    expect(errorOf(await emitAck(gm, 'scene:undo', { sceneId: doomed.id }))).toBe(
      'SCENE_NOT_FOUND',
    );
  }, 20_000);
});
