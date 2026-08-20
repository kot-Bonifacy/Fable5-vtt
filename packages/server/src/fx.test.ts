import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  AttackRollResult,
  CampaignSummary,
  ChatMessageBroadcast,
  CharacterView,
  CpredCharacterData,
  InvitationSummary,
  MapFxBroadcast,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenView,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Smoke tests of the map effect channel (stage 27i) on real sockets.
 *
 * The trimming rules themselves are proved in `shared/fx.test.ts`, which is
 * where the pure function lives. What only a running server can answer is asked
 * here, and it is all one question in four shapes: **does an effect ever tell a
 * player something the token list would not?**
 *
 *  - a shot reaches the GM whole, with both ends and the weapon's own bang;
 *  - the batch names the roll card it belongs to, so the bang waits for the
 *    dice instead of beating them to the verdict;
 *  - a player who cannot see the shooter gets the impact with **no muzzle and
 *    no sound** — hearing „pistol" would name a gun nobody has seen;
 *  - a player who can see neither end gets **nothing at all**, not an empty
 *    envelope;
 *  - applying damage floats the number the card already prints.
 *
 * The street: one square is 100 px and 2 m, so a metre is 50 px.
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

function waitFor<T>(socket: ClientSocket, event: string, ms = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

/** Collects every `fx:play` a socket gets until told to stop. */
function record(socket: ClientSocket): { stop: () => MapFxBroadcast[] } {
  const seen: MapFxBroadcast[] = [];
  const handler = (payload: MapFxBroadcast) => seen.push(payload);
  socket.on('fx:play', handler);
  return {
    stop: () => {
      socket.off('fx:play', handler);
      return seen;
    },
  };
}

/** Lets whatever the server is still pushing land before we look. */
function settle(ms = 250): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    payload: { name: 'Kampania efektów' },
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

describe('map effects', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;
  let characterId: string;
  /** The player's own figure, on the left of the street. */
  let shooterTokenId: string;
  /** An NPC eight metres east of it. */
  let mookTokenId: string;

  const SHOOTER = { x: 100, y: 100 };
  const MOOK = { x: 500, y: 100 };
  /** Centres: tokens are one square (100 px) wide. */
  const SHOOTER_CENTRE = { x: 150, y: 150 };
  const MOOK_CENTRE = { x: 550, y: 150 };

  /**
   * Fires one shot and returns what the GM and the player each got.
   *
   * `as` exists because of one refusal: a player may not even *aim* at a figure
   * the fog is hiding — `attack:roll` answers `TOKEN_NOT_FOUND`, which is the
   * older and stronger half of the same rule (stage 16b). So the „nobody can
   * see either end" case has to be fired by the GM, for whom no fog exists.
   */
  async function fire(as: 'player' | 'gm' = 'player'): Promise<{
    messageId: number;
    gmFx: MapFxBroadcast[];
    playerFx: MapFxBroadcast[];
  }> {
    const gmSeen = record(gm);
    const playerSeen = record(player);
    const message = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    const ack = await emitAck<AttackRollResult>(as === 'gm' ? gm : player, 'attack:roll', {
      characterId,
      attackerTokenId: shooterTokenId,
      targetTokenId: mookTokenId,
      request: { weaponRowId: 'w-pistol', mode: 'single', modifier: 20 },
    });
    if (!ack.ok) throw new Error(`attack:roll failed: ${JSON.stringify(ack)}`);
    const messageId = (await message).message.id;
    await settle();
    return { messageId, gmFx: gmSeen.stop(), playerFx: playerSeen.stop() };
  }

  it('sets the table: a pistol on the left, a mook eight metres east', async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);

    const character = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Vex', ownerId: playerId }),
      'character:create',
    );
    characterId = character.id;
    const upd = await emitAck(gm, 'character:update', {
      characterId,
      patch: {
        data: {
          stats: { ...(character.data as CpredCharacterData).stats, ref: 6, dex: 5 },
          skills: { handgun: 4 },
          weapons: [
            {
              id: 'w-pistol',
              name: 'Zgrzyt 9',
              notes: '',
              compendiumId: 'weapon.zgrzyt-9',
              damage: '2k6',
              ammoCurrent: 8,
              ammoMax: 8,
              ammoType: '',
              rof: '2',
            },
          ],
        },
      },
    });
    if (!upd.ok) throw new Error(`character:update failed: ${JSON.stringify(upd)}`);

    const scene = data(await emitAck<SceneView>(gm, 'scene:create', { name: 'Ulica' }), 'scene');
    sceneId = scene.id;
    await emitAck(gm, 'scene:update', { sceneId, patch: { width: 2000, height: 1200 } });
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'open' });
    const activated = waitFor(player, 'scene:activate');
    await emitAck(gm, 'scene:activate', { sceneId });
    await activated;

    shooterTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Vex',
        ...SHOOTER,
        ownerId: playerId,
        characterId,
      }),
      'token:create',
    ).id;
    mookTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Ganger',
        ...MOOK,
        hp: { current: 30, max: 30 },
      }),
      'token:create',
    ).id;
  });

  it('draws the shot from muzzle to target, with the weapon’s own voice', async () => {
    const { messageId, gmFx } = await fire();
    expect(gmFx).toHaveLength(1);
    const batch = gmFx[0]!;
    expect(batch.sceneId).toBe(sceneId);
    // The bang waits for the 3D dice: without this the map would announce the
    // verdict three seconds before the card that carries it.
    expect(batch.afterMessageId).toBe(messageId);

    const shot = batch.effects.find((effect) => effect.kind === 'shot');
    if (shot?.kind !== 'shot') throw new Error('no shot in the batch');
    expect(shot.from).toEqual(SHOOTER_CENTRE);
    expect(shot.to).toEqual(MOOK_CENTRE);
    expect(shot.hit).toBe(true);
    expect(shot.shots).toBe(1);
    // A heavy pistol is not a shotgun — the sound comes off the weapon type.
    expect(shot.sound).toBe('shot-pistol');
    expect(shot.style).toBe('bullet');
  });

  it('says “PUDŁO” over the target when the shot misses, and nothing when it lands', async () => {
    const hit = await fire();
    expect(hit.gmFx[0]!.effects.some((effect) => effect.kind === 'float')).toBe(false);

    const gmSeen = record(gm);
    const message = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    // −20 cannot beat any DV this range table offers.
    await emitAck(player, 'attack:roll', {
      characterId,
      attackerTokenId: shooterTokenId,
      targetTokenId: mookTokenId,
      request: { weaponRowId: 'w-pistol', mode: 'single', modifier: -20 },
    });
    await message;
    await settle();
    const missed = gmSeen.stop()[0]!;
    const float = missed.effects.find((effect) => effect.kind === 'float');
    if (float?.kind !== 'float') throw new Error('a miss said nothing');
    expect(float.text).toBe('PUDŁO');
    expect(float.tone).toBe('miss');
    expect(float.at).toEqual(MOOK_CENTRE);
  });

  it('floats the number a hit cost, over the figure that paid it', async () => {
    const { messageId } = await fire();
    const damageCard = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    await emitAck(player, 'character:roll', {
      characterId,
      request: { kind: 'damage', weaponRowId: 'w-pistol', attackMessageId: messageId },
    });
    const damageMessageId = (await damageCard).message.id;

    const gmSeen = record(gm);
    await emitAck(gm, 'damage:apply', { messageId: damageMessageId, tokenId: mookTokenId });
    await settle();
    const batch = gmSeen.stop()[0];
    if (!batch) throw new Error('applying damage drew nothing');
    // Applying damage writes a plain card, not a roll — nothing to wait for.
    expect(batch.afterMessageId).toBeUndefined();
    expect(batch.effects.some((effect) => effect.kind === 'spark')).toBe(true);
    const float = batch.effects.find((effect) => effect.kind === 'float');
    if (float?.kind !== 'float') throw new Error('no number floated');
    expect(float.at).toEqual(MOOK_CENTRE);
    // Either the vest ate it or it hurt — both are said, neither is „−0".
    expect(float.text === 'PANCERZ' || /^−\d+$/.test(float.text)).toBe(true);
  });

  describe('behind the fog', () => {
    it('gives the player the impact but neither the muzzle nor the bang', async () => {
      await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'fog' });
      await emitAck(gm, 'fog:reset', { sceneId, mode: 'hide' });
      // A window over the mook only: the shooter's own square stays covered.
      // (Its owner still sees their own figure — that exemption is about the
      // token list, and an effect is not a token.)
      await emitAck(gm, 'fog:paint', {
        sceneId,
        shape: { kind: 'rect', mode: 'reveal', x: 450, y: 50, width: 200, height: 200 },
      });

      const { playerFx } = await fire();
      expect(playerFx).toHaveLength(1);
      const shot = playerFx[0]!.effects.find((effect) => effect.kind === 'shot');
      if (shot?.kind !== 'shot') throw new Error('the player saw no shot at all');
      expect(shot.to).toEqual(MOOK_CENTRE);
      expect(shot.from).toBeNull();
      expect(shot.sound).toBeNull();
    });

    it('sends the player nothing when neither end of the shot is in view', async () => {
      await emitAck(gm, 'fog:reset', { sceneId, mode: 'hide' });

      const { gmFx, playerFx } = await fire('gm');
      // The GM still gets everything — the fog is not theirs.
      expect(gmFx).toHaveLength(1);
      // Not an empty envelope: silence.
      expect(playerFx).toHaveLength(0);
    });

    it('gives the player everything back once the whole street is revealed', async () => {
      await emitAck(gm, 'fog:reset', { sceneId, mode: 'reveal' });

      const { playerFx } = await fire();
      const shot = playerFx[0]?.effects.find((effect) => effect.kind === 'shot');
      if (shot?.kind !== 'shot') throw new Error('the player saw no shot');
      expect(shot.from).toEqual(SHOOTER_CENTRE);
      expect(shot.to).toEqual(MOOK_CENTRE);
      expect(shot.sound).toBe('shot-pistol');
    });
  });
});
