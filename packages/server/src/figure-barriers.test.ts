import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import {
  isPointVisible,
  type CampaignSummary,
  type InvitationSummary,
  type SocketAck,
  type StateSyncPayload,
  type TokenView,
  type WallView,
  type SceneView,
  type MapFxBroadcast,
} from '@vtt/shared';
import { loadVisionContext, tokenSightFor, isPointObservable } from './realtime/vision.js';
import { emitMapFx } from './realtime/fx.js';
import type { RealtimeDeps } from './realtime/registry.js';
import type { CharacterView, CpredCharacterData, ChatMessageBroadcast } from '@vtt/shared';
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
  if (!ack.ok || ack.data === undefined) throw new Error(`${what} failed: ${JSON.stringify(ack)}`);
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
    payload: { name: 'Kampania za siatką' },
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
    payload: { name: 'Vex' },
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

describe.each(['open', 'fog', 'dynamic'] as const)('figure barriers in %s scenes', (visibility) => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;
  let actor: TokenView;
  let target: TokenView;
  let barrier: WallView;

  async function sync() {
    const pending = waitFor<StateSyncPayload>(player, 'state:sync');
    await emitAck(player, 'state:request');
    return pending;
  }

  beforeAll(async () => {
    const g = createSocket(gmCookie),
      p = createSocket(playerCookie);
    gm = g.socket;
    player = p.socket;
    await Promise.all([g.firstSync, p.firstSync]);
    sceneId = data(
      await emitAck<SceneView>(gm, 'scene:create', { name: `Zasłona ${visibility}` }),
      'scene',
    ).id;
    await emitAck(gm, 'scene:update', {
      sceneId,
      patch: { width: 1000, height: 1000, playerMoveLocked: false },
    });
    await emitAck(gm, 'scene:visibility', { sceneId, visibility });
    await emitAck(gm, 'scene:activate', { sceneId });
    if (visibility === 'fog') await emitAck(gm, 'fog:reset', { sceneId, mode: 'reveal' });
    actor = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Obserwator',
        x: 100,
        y: 100,
        ownerId: playerId,
      }),
      'actor',
    );
    target = data(
      await emitAck<TokenView>(gm, 'token:create', { sceneId, name: 'Za zasłoną', x: 700, y: 100 }),
      'target',
    );
    barrier = data(
      await emitAck<WallView[]>(gm, 'wall:create', {
        sceneId,
        kind: 'gate',
        playerToggle: true,
        hidesFigures: true,
        concealPenalty: -6,
        points: [
          { x: 500, y: 0 },
          { x: 500, y: 1000 },
        ],
      }),
      'barrier',
    )[0]!;
  }, 60_000);

  it('sends map visibility but never the concealed figure, including after an upsert', async () => {
    const state = await sync();
    expect(state.tokens.some((row) => row.id === target.id)).toBe(false);
    if (visibility !== 'dynamic') expect(state.vision!.polygons).toEqual([]);
    expect(isPointVisible({ x: 750, y: 150 }, state.vision!.figurePolygons!)).toBe(false);
    if (visibility === 'dynamic')
      expect(isPointVisible({ x: 750, y: 150 }, state.vision!.polygons)).toBe(true);
    const received: TokenView[] = [];
    const listen = (payload: { token: TokenView }) => received.push(payload.token);
    player.on('token:upsert', listen);
    await emitAck(gm, 'token:update', { tokenId: target.id, patch: { name: 'Nadal ukryty' } });
    await sync();
    player.off('token:upsert', listen);
    expect(received.some((row) => row.id === target.id)).toBe(false);
  });

  it('the bot uses the same polygon and cannot choose the hidden target', async () => {
    const scene = await built.prisma.scene.findUniqueOrThrow({ where: { id: sceneId } });
    const row = await built.prisma.token.findUniqueOrThrow({ where: { id: actor.id } });
    const ctx = await loadVisionContext(built.prisma, scene);
    const sight = tokenSightFor(scene, row, ctx);
    expect(
      isPointObservable(
        { x: 750, y: 150 },
        sight.polygons,
        sight.lighting,
        ctx.overrides,
        sight.figurePolygons,
      ),
    ).toBe(false);
  });

  it('inspection cannot name a concealed figure', async () => {
    expect(errorOf(await emitAck(player, 'sighting:look', { tokenId: target.id }))).toBe(
      'TOKEN_NOT_FOUND',
    );
  });

  it('validates concealment fields and scrubs them from the player gate payload', async () => {
    expect(
      errorOf(
        await emitAck(gm, 'wall:update', { wallId: barrier.id, patch: { concealPenalty: 2 } }),
      ),
    ).toBe('BAD_REQUEST');
    expect(
      errorOf(
        await emitAck(gm, 'wall:update', { wallId: barrier.id, patch: { hidesFigures: 'yes' } }),
      ),
    ).toBe('BAD_REQUEST');
    const state = await sync();
    for (const opening of state.openings)
      expect(opening).toMatchObject({ concealPenalty: 0, hidesFigures: false });
    const other = data(
      await emitAck<WallView[]>(gm, 'wall:create', {
        sceneId,
        kind: 'barrier',
        hidesFigures: true,
        concealPenalty: -8,
        points: [
          { x: 900, y: 500 },
          { x: 900, y: 600 },
        ],
      }),
      'other',
    )[0]!;
    const retyped = data(
      await emitAck<WallView>(gm, 'wall:update', { wallId: other.id, patch: { kind: 'window' } }),
      'retype',
    );
    expect(retyped).toMatchObject({ hidesFigures: false, concealPenalty: -4 });
    await emitAck(gm, 'wall:delete', { wallId: other.id });
  });

  it('updates figure visibility during a drag before the position is persisted', async () => {
    await sync();
    const pending = waitFor<{ tokens: TokenView[] }>(player, 'token:sync');
    expect(
      await emitAck(gm, 'token:move', { tokenId: target.id, x: 200, y: 100, final: false }),
    ).toMatchObject({ ok: true });
    expect((await pending).tokens.some((row) => row.id === target.id)).toBe(true);
    const stored = await built.prisma.token.findUniqueOrThrow({ where: { id: target.id } });
    expect(stored.x).toBe(target.x);
    await emitAck(gm, 'token:move', { tokenId: target.id, x: target.x, y: target.y, final: true });
    expect((await sync()).tokens.some((row) => row.id === target.id)).toBe(false);
  });

  it('manual reveal does not remove a figure barrier', async () => {
    if (visibility !== 'dynamic') return;
    await emitAck(gm, 'fog:paint', {
      sceneId,
      shape: { kind: 'rect', mode: 'reveal', x: 600, y: 0, width: 400, height: 400 },
    });
    expect((await sync()).tokens.some((row) => row.id === target.id)).toBe(false);
    await emitAck(gm, 'fog:reset', { sceneId, mode: 'clear' });
  });

  it('trims the hidden muzzle and floating damage, while the explosion stays on the map', async () => {
    const scene = await built.prisma.scene.findUniqueOrThrow({ where: { id: sceneId } });
    const pending = waitFor<MapFxBroadcast>(player, 'fx:play');
    await emitMapFx(
      { io: built.io, ctx: { prisma: built.prisma } } as RealtimeDeps,
      scene.campaignId,
      scene,
      [
        {
          kind: 'shot',
          style: 'bullet',
          from: { x: 750, y: 150 },
          to: { x: 150, y: 150 },
          hit: true,
          shots: 1,
          sound: 'shot-pistol',
        },
        { kind: 'float', at: { x: 750, y: 150 }, text: '12', tone: 'damage' },
        { kind: 'blast', at: { x: 750, y: 150 }, sideM: 2, sound: 'explosion' },
      ],
    );
    const payload = await pending;
    expect(payload.effects).toHaveLength(2);
    expect(payload.effects[0]).toMatchObject({ kind: 'shot', from: null, sound: null });
    expect(payload.effects[1]).toMatchObject({ kind: 'blast' });
  });

  it('another owned figure reveals the target, then moving away conceals it again', async () => {
    const scout = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Zwiadowca',
        x: 800,
        y: 100,
        ownerId: playerId,
      }),
      'scout',
    );
    expect((await sync()).tokens.some((row) => row.id === target.id)).toBe(true);
    await emitAck(gm, 'token:move', { tokenId: scout.id, x: 100, y: 300, final: true });
    expect((await sync()).tokens.some((row) => row.id === target.id)).toBe(false);
  });

  it('refuses unseen attack targets identically to nonexistent ones; GM and a second observer allow a penalized shot', async () => {
    const character = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Strzelec', ownerId: playerId }),
      'character',
    );
    await emitAck(gm, 'character:update', {
      characterId: character.id,
      patch: {
        data: {
          stats: { ...(character.data as CpredCharacterData).stats, ref: 6 },
          skills: { handgun: 6 },
          weapons: [
            {
              id: 'pistol',
              name: 'Zgrzyt 9',
              notes: '',
              compendiumId: 'weapon.zgrzyt-9',
              damage: '2k6',
              ammoCurrent: 20,
              ammoMax: 20,
              ammoType: '',
              rof: '2',
            },
          ],
        },
      },
    });
    const shooter = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Strzelec',
        x: 100,
        y: 100,
        characterId: character.id,
        ownerId: playerId,
      }),
      'shooter',
    );
    const request = {
      characterId: character.id,
      attackerTokenId: shooter.id,
      targetTokenId: target.id,
      request: { weaponRowId: 'pistol', mode: 'single', modifier: 20 },
    };
    expect(errorOf(await emitAck(player, 'attack:roll', request))).toBe('TOKEN_NOT_FOUND');
    expect(
      errorOf(await emitAck(player, 'attack:roll', { ...request, targetTokenId: 'missing' })),
    ).toBe('TOKEN_NOT_FOUND');
    for (const socket of [gm, player]) {
      let scout: TokenView | null = null;
      if (socket === player)
        scout = data(
          await emitAck<TokenView>(gm, 'token:create', {
            sceneId,
            name: 'Oko',
            x: 800,
            y: 300,
            ownerId: playerId,
          }),
          'scout',
        );
      const message = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
      expect(await emitAck(socket, 'attack:roll', request)).toMatchObject({ ok: true });
      expect((await message).message.roll?.breakdown).toContainEqual({
        label: 'Cel zasłonięty barierą',
        value: -6,
        kind: 'situational',
      });
      if (scout) await emitAck(gm, 'token:delete', { tokenId: scout.id });
    }
    expect((await sync()).tokens.some((row) => row.id === target.id)).toBe(false);
  });

  it('opening the gate removes the shadow, closing restores it, deleting removes stale polygons', async () => {
    await emitAck(gm, 'opening:toggle', { wallId: barrier.id, open: true });
    expect((await sync()).tokens.some((row) => row.id === target.id)).toBe(true);
    await emitAck(gm, 'opening:toggle', { wallId: barrier.id, open: false });
    expect((await sync()).tokens.some((row) => row.id === target.id)).toBe(false);
    await emitAck(gm, 'wall:delete', { wallId: barrier.id });
    const state = await sync();
    expect(state.tokens.some((row) => row.id === target.id)).toBe(true);
    expect(state.vision?.figurePolygons ?? null).toBeNull();
  });

  it('a player without any figure is unfiltered outside dynamic vision', async () => {
    await emitAck(gm, 'wall:create', {
      sceneId,
      kind: 'barrier',
      hidesFigures: true,
      points: [
        { x: 500, y: 0 },
        { x: 500, y: 1000 },
      ],
    });
    const owned = await built.prisma.token.findMany({
      where: { sceneId, OR: [{ ownerId: playerId }, { character: { ownerId: playerId } }] },
    });
    for (const row of owned) await emitAck(gm, 'token:delete', { tokenId: row.id });
    const state = await sync();
    expect(state.tokens.some((row) => row.id === target.id)).toBe(visibility !== 'dynamic');
    expect(state.vision?.figurePolygons).toEqual(visibility === 'dynamic' ? [] : null);
  });
});
