import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  AttackRollResult,
  CampaignSummary,
  ChatMessageBroadcast,
  CharacterView,
  CoverSyncBroadcast,
  CoverView,
  CpredCharacterData,
  DamageLogEntry,
  InvitationSummary,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenView,
} from '@vtt/shared';
import { buildCoverCatalogue, cpredCoverPresetHp } from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Smoke tests of cover (stage 16c) on real sockets.
 *
 * What is tested here is the part the geometry tests in `shared` cannot reach:
 * that cover is **client-visible** where a wall is not, that its body points are
 * read from the catalogue on the server rather than taken off the wire, and
 * that a shot at somebody behind it comes back as a *choice* rather than as a
 * roll — with nothing spent while the table makes it.
 *
 * The street: one square is 100 px and 2 m, so a metre is 50 px. The shooter
 * stands at x = 0, the target 20 m away at x = 1000, and the car is parked
 * across the line between them.
 */

const TEST_DB = `./.test-${randomBytes(6).toString('hex')}.db`;
const GM_PASSWORD = 'test-haslo';
const PX_PER_M = 50;

/**
 * Body points the committed catalogue gives „Samochód", read from the file
 * rather than written down here.
 *
 * The public file carries **invented** numbers on purpose (the material table
 * of s. 180 is rulebook content, and this repository is public — see
 * `licensing.test.ts`), so a hard-coded 25 would be both a licence leak and a
 * test that breaks the day somebody edits the samples. What is being tested is
 * that the server reads the catalogue at all, not what the catalogue says.
 */
const CAR_HP = cpredCoverPresetHp(
  buildCoverCatalogue(
    JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../../../data/public/cpred/covers.json'), 'utf8'),
    ),
  ),
  'car',
);

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
  ttsTimeoutMs: 5000,
  ttsCacheMaxBytes: 8 * 1024 * 1024,
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

async function roundTrip(socket: ClientSocket): Promise<StateSyncPayload> {
  const sync = waitFor<StateSyncPayload>(socket, 'state:sync');
  await emitAck(socket, 'state:request');
  return sync;
}

function errorOf(ack: SocketAck<unknown>): string | undefined {
  return ack.ok ? undefined : ack.error;
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
    payload: { name: 'Kampania osłon' },
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

describe('cover as an object on the scene', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;
  let characterId: string;
  let shooterTokenId: string;
  let targetTokenId: string;
  let carId: number;

  /** The attack metadata of a roll message, as the card reads it. */
  interface AttackCard {
    hit?: boolean;
    detail: string;
    label: string;
    damageNotation?: string;
    targetTokenId?: string;
    targetCoverId?: number;
    system: Record<string, unknown>;
  }

  /**
   * Fires and returns either the card that was posted, or what stood in the
   * way. A big situational modifier keeps the hit certain — this suite is about
   * cover, not about the dice.
   */
  async function shoot(
    target: { targetTokenId?: string; targetCoverId?: number },
    request: Record<string, unknown> = {},
  ): Promise<{ card?: AttackCard; blocked?: AttackRollResult['blocked']; messageId?: number }> {
    const message = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    const ack = await emitAck<AttackRollResult>(player, 'attack:roll', {
      characterId,
      ...target,
      attackerTokenId: shooterTokenId,
      request: { weaponRowId: 'w-pistol', mode: 'single', modifier: 20, ...request },
    });
    if (!ack.ok) throw new Error(`attack:roll failed: ${JSON.stringify(ack)}`);
    if (ack.data && 'blocked' in ack.data && ack.data.blocked) {
      return { blocked: ack.data.blocked };
    }
    const broadcast = await message;
    const card = broadcast.message.roll?.attack as AttackCard | undefined;
    if (!card) throw new Error('roll message carried no attack card');
    return { card, messageId: broadcast.message.id };
  }

  /** The whole stage-15 chain against a cover: roll damage, then apply it. */
  async function damageCover(attackMessageId: number): Promise<DamageLogEntry> {
    const damageBroadcast = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    await emitAck(player, 'character:roll', {
      characterId,
      request: { kind: 'damage', weaponRowId: 'w-pistol', attackMessageId },
    });
    const damageMessage = await damageBroadcast;
    // The damage roll knows what it was aimed at, so „Zastosuj" cannot land it
    // on a person by accident.
    expect(damageMessage.message.roll?.damage?.targetCoverId).toBe(carId);

    const logBroadcast = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    const applied = await emitAck<{ messageId: number }>(gm, 'damage:apply', {
      messageId: damageMessage.message.id,
      coverId: carId,
    });
    if (!applied.ok) throw new Error(`damage:apply failed: ${JSON.stringify(applied)}`);
    const entry = (await logBroadcast).message.damage;
    if (!entry) throw new Error('damage message carried no log entry');
    return entry;
  }

  it('sets the table: a shooter, a target 20 m away and a car between them', async () => {
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
    await emitAck(gm, 'character:update', {
      characterId,
      patch: {
        data: {
          stats: { ...(character.data as CpredCharacterData).stats, ref: 6, dex: 5, will: 6 },
          skills: { handgun: 5, evasion: 3 },
          weapons: [
            {
              id: 'w-pistol',
              name: 'Zgrzyt 9',
              notes: '',
              compendiumId: 'weapon.zgrzyt-9',
              damage: '2k6',
              ammoCurrent: 60,
              ammoMax: 60,
              ammoType: '',
              rof: '2',
            },
          ],
        },
      },
    });

    const scene = data(await emitAck<SceneView>(gm, 'scene:create', { name: 'Ulica' }), 'scene');
    sceneId = scene.id;
    await emitAck(gm, 'scene:update', { sceneId, patch: { width: 8000 } });
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'open' });
    const activated = waitFor(player, 'scene:activate');
    await emitAck(gm, 'scene:activate', { sceneId });
    await activated;

    shooterTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Vex',
        x: 0,
        y: 0,
        ownerId: playerId,
        characterId,
      }),
      'token:create',
    ).id;
    targetTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Ganger',
        x: 20 * PX_PER_M,
        y: 0,
        hp: { current: 30, max: 30 },
      }),
      'token:create',
    ).id;
    expect(shooterTokenId).toBeTruthy();
  });

  it('reads the body points out of the catalogue, not off the wire', async () => {
    // Tokens are 100 px wide, so both centres sit at y = 50. The car straddles
    // that line halfway down the street.
    const car = data(
      await emitAck<CoverView>(gm, 'cover:create', {
        sceneId,
        typeId: 'car',
        x: 10 * PX_PER_M,
        y: 0,
        width: 100,
        height: 200,
        // A client cannot ask for its own toughness — there is no field for it,
        // and anything extra is ignored.
        hpMax: 9999,
      }),
      'cover:create',
    );
    carId = car.id;
    expect(CAR_HP).toBeGreaterThan(0);
    expect(car.hpMax).toBe(CAR_HP);
    expect(car.hpCurrent).toBe(CAR_HP);
    expect(car.name).toBe('Samochód');
  });

  it('refuses a preset the table gives no body points', async () => {
    // Thin plasterboard is 0 PW, which is the rulebook saying it is not cover.
    const ack = await emitAck(gm, 'cover:create', {
      sceneId,
      typeId: 'nonexistent-preset',
      x: 0,
      y: 3000,
      width: 100,
      height: 100,
    });
    expect(errorOf(ack)).toBe('UNKNOWN_COVER_TYPE');
  });

  it('refuses a stray click and a cover for a player', async () => {
    expect(
      errorOf(
        await emitAck(gm, 'cover:create', {
          sceneId,
          typeId: 'car',
          x: 0,
          y: 3000,
          width: 2,
          height: 2,
        }),
      ),
    ).toBe('BAD_REQUEST');
    expect(
      errorOf(
        await emitAck(player, 'cover:create', {
          sceneId,
          typeId: 'car',
          x: 0,
          y: 3000,
          width: 200,
          height: 200,
        }),
      ),
    ).toBe('FORBIDDEN');
  });

  it('reaches the *player* — unlike a wall', async () => {
    const sync = await roundTrip(player);
    expect(sync.walls).toEqual([]);
    expect(sync.covers.map((cover) => cover.id)).toContain(carId);
    expect(sync.covers.find((cover) => cover.id === carId)?.hpCurrent).toBe(CAR_HP);
  });

  it('stops a shot at the target and names what is in the way', async () => {
    const result = await shoot({ targetTokenId });
    expect(result.blocked).toEqual({
      kind: 'cover',
      coverId: carId,
      name: 'Samochód',
      hpCurrent: CAR_HP,
      hpMax: CAR_HP,
    });
    // Nothing was rolled, so nothing was spent: the magazine is untouched.
    const sync = await roundTrip(gm);
    const sheet = sync.characters.find((c) => c.id === characterId)?.data as CpredCharacterData;
    expect(sheet.weapons[0]!.ammoCurrent).toBe(60);
  });

  it('lets the table rule that the target leaned out', async () => {
    const result = await shoot({ targetTokenId }, { ignoreCover: true });
    expect(result.blocked).toBeUndefined();
    expect(result.card?.detail).toContain('mimo osłony');
    expect(result.card?.hit).toBe(true);
  });

  it('does not stop the shot of somebody standing at it', async () => {
    // One metre short of the bonnet — inside arm's reach (2 m).
    await emitAck(gm, 'token:move', {
      tokenId: shooterTokenId,
      x: 9 * PX_PER_M,
      y: 0,
      final: true,
    });
    const result = await shoot({ targetTokenId });
    expect(result.blocked).toBeUndefined();
    await emitAck(gm, 'token:move', { tokenId: shooterTokenId, x: 0, y: 0, final: true });
  });

  it('takes the shot when the car itself is the target', async () => {
    const result = await shoot({ targetCoverId: carId });
    expect(result.blocked).toBeUndefined();
    expect(result.card?.targetCoverId).toBe(carId);
    expect(result.card?.targetTokenId).toBeUndefined();
    expect(result.card?.label).toContain('Samochód');
    expect(result.card?.hit).toBe(true);
  });

  it('takes the damage off its body points, with no armour and no injury', async () => {
    const shot = await shoot({ targetCoverId: carId });
    const entry = await damageCover(shot.messageId!);
    expect(entry.targetCoverId).toBe(carId);
    expect(entry.targetTokenId).toBeUndefined();
    expect(entry.armorSp).toBe(0);
    expect(entry.injury).toBeUndefined();
    expect(entry.hp?.after).toBeLessThan(CAR_HP);

    const sync = await roundTrip(player);
    expect(sync.covers.find((cover) => cover.id === carId)?.hpCurrent).toBe(entry.hp?.after);
  });

  it('loses the overflow when the car goes to zero, and stops blocking', async () => {
    // Dent it by hand down to 2 PW, then hit it for more than that.
    await emitAck(gm, 'cover:update', { coverId: carId, patch: { hpCurrent: 2 } });
    const shot = await shoot({ targetCoverId: carId });
    const entry = await damageCover(shot.messageId!);
    expect(entry.hp?.after).toBe(0);
    // „Pozostałe obrażenia tego ataku przepadają" (s. 179): the loss is capped
    // by what the cover had left, whatever the dice said.
    expect(entry.hpLost).toBe(2);
    expect(entry.woundLabel).toContain('zniszczona');

    // A wreck is still on the map…
    const sync = await roundTrip(player);
    expect(sync.covers.find((cover) => cover.id === carId)?.hpCurrent).toBe(0);
    // …and stops nothing: the same shot that was refused now goes through, with
    // nobody having moved.
    const result = await shoot({ targetTokenId });
    expect(result.blocked).toBeUndefined();
    expect(result.card?.hit).toBe(true);
  });

  it('puts the wreck back together on „Cofnij"', async () => {
    await emitAck(gm, 'cover:update', { coverId: carId, patch: { hpCurrent: 5 } });
    const shot = await shoot({ targetCoverId: carId });
    const damageBroadcast = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    await emitAck(player, 'character:roll', {
      characterId,
      request: { kind: 'damage', weaponRowId: 'w-pistol', attackMessageId: shot.messageId },
    });
    const damageMessage = await damageBroadcast;
    const logBroadcast = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    await emitAck(gm, 'damage:apply', { messageId: damageMessage.message.id, coverId: carId });
    const logId = (await logBroadcast).message.id;

    await emitAck(gm, 'damage:undo', { messageId: logId });
    const sync = await roundTrip(player);
    expect(sync.covers.find((cover) => cover.id === carId)?.hpCurrent).toBe(5);
  });

  it('never touches what anybody can see', async () => {
    // The scene is „open", so this is about the token list rather than about a
    // raycast: a cover must not filter anybody out of it the way a wall does.
    await emitAck(gm, 'cover:update', { coverId: carId, patch: { hpCurrent: CAR_HP } });
    const sync = await roundTrip(player);
    expect(sync.tokens.map((token) => token.id)).toContain(targetTokenId);
  });

  it('clears the scene when the GM says so', async () => {
    const covers = waitFor<CoverSyncBroadcast>(player, 'cover:sync');
    await emitAck(gm, 'cover:clear', { sceneId });
    expect((await covers).covers).toEqual([]);
    const result = await shoot({ targetTokenId });
    expect(result.blocked).toBeUndefined();
  });
});
