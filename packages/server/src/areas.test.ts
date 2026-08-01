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
  CoverView,
  CpredCharacterData,
  InvitationSummary,
  RollAreaMeta,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenView,
  WallView,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Smoke tests of area attacks (stage 16d) on real sockets.
 *
 * The geometry itself is proved in `shared/systems/cpred/areas.test.ts`; what
 * only the server can answer is asked here:
 *
 *  - a charge is aimed at a **square**, and the square decides who is in it;
 *  - a **wall** and a **cover** take somebody out of the blast, and the line is
 *    drawn from the crater rather than from the thrower;
 *  - a **miss still explodes**, somewhere else, and the card says where;
 *  - the roster of the blast is **not public** — a player reads only their own
 *    figures off it, because a grenade into a dark room would otherwise be the
 *    cheapest scouting tool in the game.
 *
 * The street: one square is 100 px and 2 m, so a metre is 50 px.
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
    payload: { name: 'Kampania granatów' },
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

describe('grenades and blast areas', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;
  let characterId: string;
  let throwerTokenId: string;
  /** Standing in the open, right where the charge is aimed. */
  let mookTokenId: string;
  /** Two metres from the first one — inside the same 10 m square. */
  let neighbourTokenId: string;
  /** Inside the square too, but with a wall between it and the crater. */
  let shelteredTokenId: string;

  interface AttackCard {
    hit?: boolean;
    detail: string;
    damageNotation?: string;
    area?: RollAreaMeta;
    system: Record<string, unknown>;
  }

  /**
   * The square the charge is aimed at. Squares are 100 px, so their centres sit
   * at 50, 150, 250 … — this one is 10 m east of the thrower.
   *
   * Everything is laid out in **positive** coordinates on purpose: `token:create`
   * clamps a figure into the scene, so a token placed at y = −200 quietly lands
   * on y = 0 and every „is there a wall between them" test silently becomes a
   * test of two figures standing on the same spot.
   */
  const AIM = { x: 550, y: 450 };

  /**
   * Throws and returns the card that was posted (as the GM sees it, i.e.
   * unredacted). A big situational modifier decides hit or miss outright — this
   * suite is about areas, not about the dice.
   */
  async function lob(
    payload: Record<string, unknown>,
    request: Record<string, unknown> = {},
  ): Promise<{ card: AttackCard; messageId: number }> {
    const message = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    const ack = await emitAck<AttackRollResult>(player, 'attack:roll', {
      characterId,
      attackerTokenId: throwerTokenId,
      ...payload,
      request: { weaponRowId: 'w-grenade', mode: 'single', modifier: 20, ...request },
    });
    if (!ack.ok) throw new Error(`attack:roll failed: ${JSON.stringify(ack)}`);
    const broadcast = await message;
    const card = broadcast.message.roll?.attack as AttackCard | undefined;
    if (!card) throw new Error('roll message carried no attack card');
    return { card, messageId: broadcast.message.id };
  }

  function targetOf(area: RollAreaMeta | undefined, tokenId: string) {
    return area?.targets.find((entry) => entry.tokenId === tokenId);
  }

  it('sets the table: a thrower, three figures round one square, a wall by one of them', async () => {
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
          skills: { athletics: 4, evasion: 3 },
          weapons: [
            {
              id: 'w-grenade',
              name: 'Puszka hukowa',
              notes: '',
              compendiumId: 'weapon.puszka-hukowa',
              damage: '4k6',
              ammoCurrent: 40,
              ammoMax: 40,
              ammoType: '',
              rof: '1',
            },
            {
              id: 'w-knife',
              name: 'Nóż',
              notes: '',
              compendiumId: null,
              damage: '1k6',
              ammoCurrent: 0,
              ammoMax: 0,
              ammoType: '',
              rof: '2',
            },
          ],
        },
      },
    });

    const scene = data(await emitAck<SceneView>(gm, 'scene:create', { name: 'Podwórze' }), 'scene');
    sceneId = scene.id;
    await emitAck(gm, 'scene:update', { sceneId, patch: { width: 8000, height: 4000 } });
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'open' });
    const activated = waitFor(player, 'scene:activate');
    await emitAck(gm, 'scene:activate', { sceneId });
    await activated;

    throwerTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Vex',
        x: 0,
        y: AIM.y - 50,
        ownerId: playerId,
        characterId,
      }),
      'token:create',
    ).id;
    // Tokens are 100 px wide, so a centre sits half a square in: (x+50, y+50).
    mookTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Ganger',
        x: AIM.x - 50,
        y: AIM.y - 50,
        hp: { current: 30, max: 30 },
      }),
      'token:create',
    ).id;
    neighbourTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Kumpel',
        x: AIM.x + 50,
        y: AIM.y - 50,
        hp: { current: 30, max: 30 },
      }),
      'token:create',
    ).id;
    // Four metres north of the crater: inside the 10 m square, behind a wall.
    shelteredTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Ostrożny',
        x: AIM.x - 50,
        y: AIM.y - 50 - 4 * PX_PER_M,
        hp: { current: 30, max: 30 },
      }),
      'token:create',
    ).id;

    const wall = data(
      await emitAck<WallView[]>(gm, 'wall:create', {
        sceneId,
        kind: 'wall',
        points: [
          { x: AIM.x - 4 * PX_PER_M, y: AIM.y - 2 * PX_PER_M },
          { x: AIM.x + 4 * PX_PER_M, y: AIM.y - 2 * PX_PER_M },
        ],
      }),
      'wall:create',
    );
    expect(wall.length).toBeGreaterThan(0);
  });

  it('centres the blast on a square and finds everyone standing in it', async () => {
    const { card } = await lob({ targetPoint: AIM });
    expect(card.hit).toBe(true);
    expect(card.area?.sideM).toBe(10);
    // The click was already a square centre, so the server changed nothing.
    expect(card.area?.centre).toEqual(AIM);
    expect(targetOf(card.area, mookTokenId)?.spared).toBeUndefined();
    expect(targetOf(card.area, neighbourTokenId)?.spared).toBeUndefined();
    // The thrower is 10 m away — outside the square, and not on the list.
    expect(targetOf(card.area, throwerTokenId)).toBeUndefined();
  });

  it('spares whoever the wall stands in front of', async () => {
    const { card } = await lob({ targetPoint: AIM });
    const sheltered = targetOf(card.area, shelteredTokenId);
    expect(sheltered).toBeDefined();
    expect(sheltered?.spared).toBe('wall');
    // Spared is not the same as absent: the card says why, so the table can
    // disagree with it.
    expect(sheltered?.metres).toBeGreaterThan(0);
  });

  it('snaps a click taken anywhere in a square to that square centre', async () => {
    const { card } = await lob({ targetPoint: { x: AIM.x + 30, y: AIM.y + 30 } });
    expect(card.area?.centre).toEqual(AIM);
  });

  it('offers the damage roll to everyone the blast reached, and to nobody else', async () => {
    const { card, messageId } = await lob({ targetPoint: AIM });
    expect(card.damageNotation).toBe('4k6');

    const damageBroadcast = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    await emitAck(player, 'character:roll', {
      characterId,
      request: { kind: 'damage', weaponRowId: 'w-grenade', attackMessageId: messageId },
    });
    const rolled = (await damageBroadcast).message.roll;
    const names = (rolled?.damage?.areaTargets ?? []).map((entry) => entry.name);
    expect(names).toContain('Ganger');
    expect(names).toContain('Kumpel');
    // The wall did its job all the way through to „Zastosuj wszystkim".
    expect(names).not.toContain('Ostrożny');
  });

  it('explodes anyway when the throw misses, and says where it went', async () => {
    const { card } = await lob({ targetPoint: AIM }, { modifier: -20 });
    expect(card.hit).toBe(false);
    // A miss is about the square that was aimed at, not about whether anything
    // went off: the area is still resolved and the damage still offered.
    expect(card.area).toBeDefined();
    expect(card.damageNotation).toBe('4k6');
    expect(card.area?.scatter).toMatch(/kierunek 1k10/);
    expect(card.area?.centre).not.toEqual(AIM);
    // The house rule keeps it inside the rulebook's 10×10 m box: at most two
    // squares from where it was aimed, on both axes.
    expect(Math.abs(card.area!.centre.x - AIM.x)).toBeLessThanOrEqual(4 * PX_PER_M);
    expect(Math.abs(card.area!.centre.y - AIM.y)).toBeLessThanOrEqual(4 * PX_PER_M);
  });

  it('keeps the roster of the blast off the players screens', async () => {
    // The same card, delivered to a player: they see the explosion and their
    // own figure, never the list of who else was standing there.
    const playerCard = waitFor<ChatMessageBroadcast>(player, 'chat:message');
    const { card } = await lob({ targetPoint: AIM });
    const seen = (await playerCard).message.roll?.attack as AttackCard | undefined;

    expect(card.area?.targets.length).toBeGreaterThan(0);
    expect(seen?.area).toBeDefined();
    expect(seen?.area?.targets).toEqual([]);
    // …and the summary line must not leak the count either.
    expect(seen?.detail).not.toMatch(/\d+\s*cel/);
  });

  it('refuses a throw past the reach of an arm', async () => {
    // The sample charge reaches 20 m; this square is 60 m down the street.
    const ack = await emitAck<AttackRollResult>(player, 'attack:roll', {
      characterId,
      attackerTokenId: throwerTokenId,
      targetPoint: { x: 60 * PX_PER_M, y: 50 },
      request: { weaponRowId: 'w-grenade', mode: 'single', modifier: 20 },
    });
    expect(errorOf(ack)).toBe('OUT_OF_RANGE');
  });

  it('refuses a fire mode nothing thrown has', async () => {
    const ack = await emitAck<AttackRollResult>(player, 'attack:roll', {
      characterId,
      attackerTokenId: throwerTokenId,
      targetPoint: AIM,
      request: { weaponRowId: 'w-grenade', mode: 'autofire' },
    });
    expect(errorOf(ack)).toBe('NO_AUTOFIRE');
  });

  it('spends exactly one charge per throw', async () => {
    const first = await lob({ targetPoint: AIM });
    const second = await lob({ targetPoint: AIM });
    const before = (first.card.system as { ammoBefore: number }).ammoBefore;
    expect((first.card.system as { ammoAfter: number }).ammoAfter).toBe(before - 1);
    expect((second.card.system as { ammoBefore: number }).ammoBefore).toBe(before - 1);
  });
});

describe('cover, throwing objects and jumping clear', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;
  let characterId: string;
  let throwerTokenId: string;
  let hiderTokenId: string;
  let nimbleTokenId: string;
  let nimbleCharacterId: string;

  interface AttackCard {
    hit?: boolean;
    detail: string;
    area?: RollAreaMeta;
    system: Record<string, unknown>;
  }

  const AIM = { x: 550, y: 450 };

  async function lob(
    payload: Record<string, unknown>,
    request: Record<string, unknown> = {},
  ): Promise<{ card: AttackCard; messageId: number; blocked?: AttackRollResult['blocked'] }> {
    const message = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    const ack = await emitAck<AttackRollResult>(player, 'attack:roll', {
      characterId,
      attackerTokenId: throwerTokenId,
      ...payload,
      request: { weaponRowId: 'w-grenade', mode: 'single', modifier: 20, ...request },
    });
    if (!ack.ok) throw new Error(`attack:roll failed: ${JSON.stringify(ack)}`);
    if (ack.data && 'blocked' in ack.data && ack.data.blocked) {
      throw new Error(`throw was blocked: ${JSON.stringify(ack.data.blocked)}`);
    }
    const broadcast = await message;
    const card = broadcast.message.roll?.attack as AttackCard | undefined;
    if (!card) throw new Error('roll message carried no attack card');
    return { card, messageId: broadcast.message.id };
  }

  it('sets the table: a car by the crater and a nimble figure next to it', async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);

    const character = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Rzucacz', ownerId: playerId }),
      'character:create',
    );
    characterId = character.id;
    await emitAck(gm, 'character:update', {
      characterId,
      patch: {
        data: {
          stats: { ...(character.data as CpredCharacterData).stats, ref: 6, dex: 6 },
          skills: { athletics: 4 },
          weapons: [
            {
              id: 'w-grenade',
              name: 'Puszka hukowa',
              notes: '',
              compendiumId: 'weapon.puszka-hukowa',
              damage: '4k6',
              ammoCurrent: 40,
              ammoMax: 40,
              ammoType: '',
              rof: '1',
            },
            {
              id: 'w-blade',
              name: 'Nóż rzucany',
              notes: '',
              compendiumId: 'weapon.szpon',
              damage: '2k6',
              ammoCurrent: 0,
              ammoMax: 0,
              ammoType: '',
              rof: '2',
            },
          ],
        },
      },
    });

    // The figure that will jump clear: REF 8 is the price of admission (s. 174).
    const nimble = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Zwinny', ownerId: playerId }),
      'character:create',
    );
    nimbleCharacterId = nimble.id;
    await emitAck(gm, 'character:update', {
      characterId: nimbleCharacterId,
      patch: {
        data: {
          stats: { ...(nimble.data as CpredCharacterData).stats, ref: 8, dex: 8 },
          skills: { evasion: 6 },
        },
      },
    });

    const scene = data(await emitAck<SceneView>(gm, 'scene:create', { name: 'Parking' }), 'scene');
    sceneId = scene.id;
    await emitAck(gm, 'scene:update', { sceneId, patch: { width: 8000, height: 4000 } });
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'open' });
    const activated = waitFor(player, 'scene:activate');
    await emitAck(gm, 'scene:activate', { sceneId });
    await activated;

    throwerTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Rzucacz',
        x: 0,
        y: AIM.y - 50,
        ownerId: playerId,
        characterId,
      }),
      'token:create',
    ).id;
    // Four metres north of the crater, with the car between the two.
    hiderTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Schowany',
        x: AIM.x - 50,
        y: AIM.y - 50 - 4 * PX_PER_M,
        hp: { current: 30, max: 30 },
      }),
      'token:create',
    ).id;
    nimbleTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Zwinny',
        x: AIM.x + 50,
        y: AIM.y - 50,
        ownerId: playerId,
        characterId: nimbleCharacterId,
      }),
      'token:create',
    ).id;

    const car = data(
      await emitAck<CoverView>(gm, 'cover:create', {
        sceneId,
        typeId: 'car',
        x: AIM.x - 2 * PX_PER_M,
        y: AIM.y - 3 * PX_PER_M,
        width: 4 * PX_PER_M,
        height: 100,
      }),
      'cover:create',
    );
    expect(car.hpMax).toBeGreaterThan(0);
  });

  it('lets the charge over the bonnet — a cover never blocks a throw', async () => {
    // The car sits between the thrower and the square; an ordinary shot would
    // come back as „cel za osłoną", a grenade goes over it. `lob` throws if the
    // server refuses, so reaching the assertion is the assertion.
    const { card } = await lob({ targetPoint: AIM });
    expect(card.hit).toBe(true);
  });

  it('spares whoever the car is between, and counts the car itself as a target', async () => {
    const { card } = await lob({ targetPoint: AIM });
    const hider = card.area?.targets.find((entry) => entry.tokenId === hiderTokenId);
    expect(hider?.spared).toBe('cover');
    expect(hider?.sparedBy).toBe('Samochód');
    // „wszystkim celom (w tym terenowi)" — the bonnet takes it too.
    expect(card.area?.targets.some((entry) => entry.coverId !== undefined)).toBe(true);
  });

  it('lets REF 8+ jump clear, and only once', async () => {
    const { card, messageId } = await lob({ targetPoint: AIM });
    const nimble = card.area?.targets.find((entry) => entry.tokenId === nimbleTokenId);
    expect(nimble?.canEvade).toBe(true);

    const updated = waitFor<ChatMessageBroadcast>(gm, 'chat:update');
    const ack = await emitAck<{ total: number; hit: boolean }>(player, 'attack:evade', {
      messageId,
      characterId: nimbleCharacterId,
      tokenId: nimbleTokenId,
    });
    if (!ack.ok) throw new Error(`attack:evade failed: ${JSON.stringify(ack)}`);
    const rewritten = (await updated).message.roll?.attack as AttackCard | undefined;
    const row = rewritten?.area?.targets.find((entry) => entry.tokenId === nimbleTokenId);
    // Whether the dodge landed is up to the dice; either way the attempt is
    // spent and the card says what happened.
    expect(row?.canEvade).toBe(false);
    expect(rewritten?.detail).toMatch(/Odskok Zwinny/);
    if (ack.data && !ack.data.hit) expect(row?.spared).toBe('evaded');

    expect(
      errorOf(
        await emitAck(player, 'attack:evade', {
          messageId,
          characterId: nimbleCharacterId,
          tokenId: nimbleTokenId,
        }),
      ),
    ).toBeDefined();
  });

  it('refuses a jump from somebody the wall already saved', async () => {
    const { messageId } = await lob({ targetPoint: AIM });
    const ack = await emitAck(player, 'attack:evade', {
      messageId,
      characterId: nimbleCharacterId,
      tokenId: hiderTokenId,
    });
    expect(errorOf(ack)).toBe('ALREADY_EVADED');
  });

  it('throws an ordinary object down the same path, without an area', async () => {
    const message = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    const ack = await emitAck<AttackRollResult>(player, 'attack:roll', {
      characterId,
      attackerTokenId: throwerTokenId,
      targetTokenId: nimbleTokenId,
      request: { weaponRowId: 'w-blade', mode: 'single', modifier: 20, thrown: true },
    });
    if (!ack.ok) throw new Error(`attack:roll failed: ${JSON.stringify(ack)}`);
    const card = (await message).message.roll?.attack as AttackCard | undefined;
    // A knife let go of is a ranged attack at 10 m — which as a melee weapon it
    // could never have been — and it rains on nobody but the person it hits.
    expect(card?.area).toBeUndefined();
    expect((card?.system as { thrown?: boolean }).thrown).toBe(true);
    expect((card?.system as { metres?: number }).metres ?? 0).toBeGreaterThan(2);
  });
});
