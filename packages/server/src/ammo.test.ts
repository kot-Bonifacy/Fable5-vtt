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
  DamageLogEntry,
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
 * Smoke tests of special ammunition (stage 16g) on real sockets.
 *
 * The maths and the matching are proved in `shared/systems/cpred/ammo.test.ts`;
 * what only the server can answer is asked here:
 *
 *  - a **shell sprays a cone** from the muzzle, and a wall in it spares whoever
 *    is behind the wall — the geometry is measured server-side, as always;
 *  - **armour-piercing** wears two points of SP off the target's armour, and the
 *    card says so by name rather than quietly;
 *  - **rubber** leaves a target on 1 HP, takes no armour with it and draws no
 *    Critical Injury;
 *  - **incendiary** sets the target alight at the round's own intensity, and
 *    „Cofnij" puts the fire out again;
 *  - the **round is chosen through a reload**, so changing it in a fight costs
 *    the Action a magazine change costs at the table.
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
    payload: { name: 'Kampania nabojów' },
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

describe('special ammunition', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;
  let characterId: string;
  let shooterTokenId: string;
  /** Two metres in front of the muzzle — well inside the 6 m cone. */
  let nearTokenId: string;
  /** Four metres in front, and armoured: the one damage is applied to. */
  let armouredTokenId: string;
  /** Inside the cone, but with a wall between it and the shooter. */
  let shelteredTokenId: string;
  /** Ten metres away — in the line of fire, past the cone's reach. */
  let farTokenId: string;

  interface AttackCard {
    hit?: boolean;
    detail: string;
    damageNotation?: string;
    area?: RollAreaMeta;
    system: Record<string, unknown>;
  }

  /** The shooter stands at the west end, everyone else is due east of them. */
  const SHOOTER = { x: 100, y: 400 };

  /**
   * Fires and returns the card that was posted (as the GM sees it, i.e.
   * unredacted). A big situational modifier decides hit or miss outright —
   * this suite is about ammunition, not about the dice.
   */
  async function fire(
    weaponRowId: string,
    targetTokenId: string,
    request: Record<string, unknown> = {},
  ): Promise<{ card: AttackCard; messageId: number }> {
    const message = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    const ack = await emitAck<AttackRollResult>(player, 'attack:roll', {
      characterId,
      attackerTokenId: shooterTokenId,
      targetTokenId,
      request: { weaponRowId, mode: 'single', modifier: 20, ...request },
    });
    if (!ack.ok) throw new Error(`attack:roll failed: ${JSON.stringify(ack)}`);
    const broadcast = await message;
    const card = broadcast.message.roll?.attack as AttackCard | undefined;
    if (!card) throw new Error('roll message carried no attack card');
    return { card, messageId: broadcast.message.id };
  }

  /** Rolls the damage the attack card offers, and returns its message id. */
  async function rollDamage(weaponRowId: string, attackMessageId: number): Promise<number> {
    const broadcast = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    await emitAck(player, 'character:roll', {
      characterId,
      request: { kind: 'damage', weaponRowId, attackMessageId },
    });
    return (await broadcast).message.id;
  }

  /** GM applies that damage to one token and returns the log entry. */
  async function applyDamage(
    messageId: number,
    tokenId: string,
  ): Promise<{ entry: DamageLogEntry; messageId: number }> {
    const broadcast = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    await emitAck(gm, 'damage:apply', { messageId, tokenId, location: 'body' });
    const message = (await broadcast).message;
    if (!message.damage) throw new Error('no damage entry on the card');
    return { entry: message.damage, messageId: message.id };
  }

  /** The token as the GM currently sees it. */
  async function tokenOf(tokenId: string): Promise<TokenView> {
    const sync = waitFor<StateSyncPayload>(gm, 'state:sync');
    await emitAck(gm, 'state:request');
    const token = (await sync).tokens.find((entry) => entry.id === tokenId);
    if (!token) throw new Error('token not found');
    return token;
  }

  /** The weapon row as it is stored right now. */
  async function weaponRow(rowId: string): Promise<CpredCharacterData['weapons'][number]> {
    const sync = waitFor<StateSyncPayload>(gm, 'state:sync');
    await emitAck(gm, 'state:request');
    const character = (await sync).characters?.find((entry) => entry.id === characterId);
    const row = (character?.data as CpredCharacterData | undefined)?.weapons.find(
      (weapon) => weapon.id === rowId,
    );
    if (!row) throw new Error('weapon row not found');
    return row;
  }

  it('sets the table: a shotgun, a flamer, and four figures down the street', async () => {
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
          skills: { 'shoulder-arms': 4, handgun: 4, 'heavy-weapons': 4 },
          weapons: [
            {
              id: 'w-shotgun',
              name: 'Huk 12',
              notes: '',
              compendiumId: 'weapon.huk-12',
              damage: '5k6',
              ammoCurrent: 40,
              ammoMax: 40,
              ammoType: 'Pocisk przykładowy',
              rof: '1',
            },
            {
              id: 'w-pistol',
              name: 'Zgrzyt 9',
              notes: '',
              compendiumId: 'weapon.zgrzyt-9',
              damage: '2k6',
              ammoCurrent: 40,
              ammoMax: 40,
              ammoType: '',
              rof: '2',
            },
            {
              id: 'w-flamer',
              name: 'Zapalarka',
              notes: '',
              compendiumId: 'weapon.zapalarka',
              damage: '5k6',
              ammoCurrent: 40,
              ammoMax: 40,
              ammoType: '',
              rof: '1',
            },
          ],
        },
      },
    });

    const scene = data(await emitAck<SceneView>(gm, 'scene:create', { name: 'Ulica' }), 'scene');
    sceneId = scene.id;
    await emitAck(gm, 'scene:update', { sceneId, patch: { width: 4000, height: 2000 } });
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'open' });
    const activated = waitFor(player, 'scene:activate');
    await emitAck(gm, 'scene:activate', { sceneId });
    await activated;

    // Tokens are 100 px wide, so a centre sits half a square in: (x+50, y+50).
    shooterTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Vex',
        x: SHOOTER.x - 50,
        y: SHOOTER.y - 50,
        ownerId: playerId,
        characterId,
      }),
      'token:create',
    ).id;
    nearTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Ganger',
        x: SHOOTER.x - 50 + 2 * PX_PER_M,
        y: SHOOTER.y - 50,
        hp: { current: 30, max: 30 },
      }),
      'token:create',
    ).id;
    armouredTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Ochroniarz',
        x: SHOOTER.x - 50 + 4 * PX_PER_M,
        y: SHOOTER.y - 50,
        hp: { current: 30, max: 30 },
      }),
      'token:create',
    ).id;
    // Stage 16b's combat profile is what gives a bare token armour to wear out.
    await emitAck(gm, 'token:update', {
      tokenId: armouredTokenId,
      patch: {
        combatProfile: {
          ref: 5,
          dex: 5,
          body: 6,
          will: 5,
          skillLevel: 3,
          evasion: 2,
          armorSp: 4,
          weaponId: 'weapon.zgrzyt-9',
          weaponName: 'Zgrzyt 9',
          weaponDamage: '2k6',
          ammoCurrent: 10,
          ammoMax: 10,
        },
      },
    });
    // Five metres out, one metre north, with a wall in between.
    shelteredTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Ostrożny',
        x: SHOOTER.x - 50 + 5 * PX_PER_M,
        y: SHOOTER.y - 50 - PX_PER_M,
        hp: { current: 30, max: 30 },
      }),
      'token:create',
    ).id;
    farTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Daleki',
        x: SHOOTER.x - 50 + 10 * PX_PER_M,
        y: SHOOTER.y - 50,
        hp: { current: 30, max: 30 },
      }),
      'token:create',
    ).id;

    // A short wall standing between the shooter and „Ostrożny" only.
    const wall = data(
      await emitAck<WallView[]>(gm, 'wall:create', {
        sceneId,
        kind: 'wall',
        // Vertical, two metres east of the muzzle: it crosses the line to
        // „Ostrożny" (who stands a metre north) and stops just short of the
        // line to the two figures standing dead ahead.
        points: [
          { x: 250, y: 250 },
          { x: 250, y: 440 },
        ],
      }),
      'wall:create',
    );
    expect(wall.length).toBeGreaterThan(0);
  });

  describe('choosing the round', () => {
    it('loads it through a reload, and the row remembers it', async () => {
      const ack = await emitAck<{ ammo: number }>(player, 'weapon:reload', {
        characterId,
        weaponRowId: 'w-shotgun',
        ammoId: 'ammo.sample-shot',
      });
      expect(ack.ok).toBe(true);
      const row = await weaponRow('w-shotgun');
      expect(row.ammoId).toBe('ammo.sample-shot');
      // A change tops the magazine up, which is what a magazine change does.
      expect(row.ammoCurrent).toBe(row.ammoMax);
    });

    it('refuses a round the weapon does not chamber', async () => {
      const ack = await emitAck(player, 'weapon:reload', {
        characterId,
        weaponRowId: 'w-pistol',
        ammoId: 'ammo.sample-shot',
      });
      expect(errorOf(ack)).toBe('AMMO_MISMATCH');
      expect((await weaponRow('w-pistol')).ammoId).toBeUndefined();
    });

    it('refuses a round that is not in the catalogue at all', async () => {
      const ack = await emitAck(player, 'weapon:reload', {
        characterId,
        weaponRowId: 'w-shotgun',
        ammoId: 'ammo.nie-ma-takiego',
      });
      expect(errorOf(ack)).toBe('UNKNOWN_AMMO');
    });

    it('refuses a round a weapon with a fixed load does not take', async () => {
      // The flamer chambers shells, but the catalogue names the only one it
      // fires — so shot is the right shape and still the wrong round (s. 348).
      const ack = await emitAck(player, 'weapon:reload', {
        characterId,
        weaponRowId: 'w-flamer',
        ammoId: 'ammo.sample-shot',
      });
      expect(errorOf(ack)).toBe('AMMO_MISMATCH');
    });

    it('goes back to ordinary ammunition when the round is cleared', async () => {
      await emitAck(player, 'weapon:reload', {
        characterId,
        weaponRowId: 'w-shotgun',
        ammoId: null,
      });
      expect((await weaponRow('w-shotgun')).ammoId).toBeUndefined();
      // …and the ordinary reload path still works, without touching the round.
      await emitAck(player, 'weapon:reload', { characterId, weaponRowId: 'w-shotgun' });
      expect((await weaponRow('w-shotgun')).ammoId).toBeUndefined();
    });
  });

  describe('a shell sprays a cone (s. 174)', () => {
    it('names the round on the card and rolls the shell’s damage', async () => {
      await emitAck(player, 'weapon:reload', {
        characterId,
        weaponRowId: 'w-shotgun',
        ammoId: 'ammo.sample-shot',
      });
      const { card } = await fire('w-shotgun', nearTokenId);
      expect(card.hit).toBe(true);
      expect(card.detail).toContain('Nabój wachlarzowy');
      // The shell's own numbers, not the shotgun's 5k6 and not the range table.
      expect(card.damageNotation).toBe('3k6');
      expect(card.detail).toContain('PT 13');
    });

    it('finds everyone in the wedge and leaves the shooter out of it', async () => {
      const { card } = await fire('w-shotgun', nearTokenId);
      expect(card.area?.shape).toBe('cone');
      expect(card.area?.cone?.rangeM).toBe(6);
      const names = (card.area?.targets ?? []).map((entry) => entry.name);
      expect(names).toContain('Ganger');
      expect(names).toContain('Ochroniarz');
      // Past the cone's reach, and never in it however wide the wedge is.
      expect(card.area?.targets.some((entry) => entry.tokenId === farTokenId)).toBe(false);
      expect(names).not.toContain('Daleki');
      expect(names).not.toContain('Vex');
    });

    it('spares whoever the wall stands in front of', async () => {
      const { card } = await fire('w-shotgun', nearTokenId);
      const sheltered = card.area?.targets.find((entry) => entry.tokenId === shelteredTokenId);
      expect(sheltered?.spared).toBe('wall');
    });

    it('offers one damage roll for the whole cone', async () => {
      const { card, messageId } = await fire('w-shotgun', nearTokenId);
      expect(card.damageNotation).toBe('3k6');
      const broadcast = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
      await emitAck(player, 'character:roll', {
        characterId,
        request: { kind: 'damage', weaponRowId: 'w-shotgun', attackMessageId: messageId },
      });
      const rolled = (await broadcast).message.roll;
      const names = (rolled?.damage?.areaTargets ?? []).map((entry) => entry.name);
      expect(names).toContain('Ganger');
      expect(names).not.toContain('Ostrożny');
    });

    it('cannot be aimed at the head', async () => {
      const { card } = await fire('w-shotgun', nearTokenId, { aimed: true });
      expect(card.system.aimed).toBe(false);
      expect(card.system.location).toBe('body');
    });

    it('does not spray when the shot misses', async () => {
      const { card } = await fire('w-shotgun', nearTokenId, { modifier: -20 });
      expect(card.hit).toBe(false);
      // „Jeśli rzut się uda, każdy cel … otrzymuje 3k6" — a miss is a miss, and
      // unlike a grenade there is nothing left standing in the street.
      expect(card.area).toBeUndefined();
      expect(card.damageNotation).toBeUndefined();
    });
  });

  describe('what the round does to the damage', () => {
    /** Fires the pistol with `ammoId` loaded and applies the hit to a target. */
    async function shootAndApply(ammoId: string | null, tokenId: string) {
      await emitAck(player, 'weapon:reload', {
        characterId,
        weaponRowId: 'w-pistol',
        ammoId,
      });
      const { messageId } = await fire('w-pistol', tokenId);
      const damageId = await rollDamage('w-pistol', messageId);
      return applyDamage(damageId, tokenId);
    }

    it('an armour-piercing round takes two points of SP, and the card says so', async () => {
      const before = (await tokenOf(armouredTokenId)).combatProfile as { armorSp: number } | null;
      const { entry } = await shootAndApply('ammo.sample-piercing', armouredTokenId);
      expect(entry.armor).toBeDefined();
      expect(entry.armor!.before - entry.armor!.after).toBe(2);
      expect(entry.ammo?.name).toBe('Nabój przebijający');
      expect(entry.ammo?.notes?.join(' ')).toContain('pancerz −2');
      expect(before?.armorSp).toBeGreaterThan(0);
    });

    it('a rubber round wears no armour and leaves the target standing', async () => {
      // Everything but one point of HP first, so the next hit would kill.
      await emitAck(gm, 'token:update', {
        tokenId: nearTokenId,
        patch: { hp: { current: 1, max: 30 } },
      });
      const { entry } = await shootAndApply('ammo.sample-blunt', nearTokenId);
      expect(entry.armor).toBeUndefined();
      expect(entry.injury).toBeUndefined();
      expect(entry.hp?.after).toBeGreaterThanOrEqual(0);
      expect(entry.ammo?.name).toBe('Nabój obezwładniający');
    });

    it('holds a target that had more than one point on exactly one', async () => {
      // Two points left: whatever the dice show, the round would take the
      // target below one — which is exactly the case the floor exists for.
      await emitAck(gm, 'token:update', {
        tokenId: nearTokenId,
        patch: { hp: { current: 2, max: 30 } },
      });
      const { entry } = await shootAndApply('ammo.sample-blunt', nearTokenId);
      expect(entry.hp?.after).toBe(1);
      expect(entry.ammo?.notes?.join(' ')).toContain('1 PW');
    });

    it('an incendiary round sets the target alight at its own intensity', async () => {
      await emitAck(gm, 'token:update', {
        tokenId: nearTokenId,
        patch: { hp: { current: 30, max: 30 } },
      });
      const { entry, messageId } = await shootAndApply('ammo.sample-burning', nearTokenId);
      expect(entry.statusesAdded).toContain('on-fire');
      const token = await tokenOf(nearTokenId);
      expect(token.statuses).toContain('on-fire');
      expect(entry.ammo?.notes?.join(' ')).toContain('Podpalony');

      // „Cofnij" puts the fire out again — a restored sheet that keeps burning
      // is the half-undo stage 14d fixed for statuses.
      await emitAck(gm, 'damage:undo', { messageId });
      expect((await tokenOf(nearTokenId)).statuses).not.toContain('on-fire');
    });

    it('an ordinary round changes nothing about the hit', async () => {
      const { entry } = await shootAndApply(null, armouredTokenId);
      expect(entry.ammo).toBeUndefined();
      if (entry.armor) expect(entry.armor.before - entry.armor.after).toBe(1);
    });
  });

  describe('a weapon with a fixed load', () => {
    it('is loaded with its own round without anybody saying so', async () => {
      const { card } = await fire('w-flamer', nearTokenId);
      expect(card.detail).toContain('Nabój zapalarki');
      // Its round is a shell, so it sprays like any other shell.
      expect(card.area?.shape).toBe('cone');
      expect(card.damageNotation).toBe('3k6');
    });

    it('burns hotter than an ordinary incendiary round (s. 348)', async () => {
      await emitAck(gm, 'token:update', {
        tokenId: nearTokenId,
        patch: { hp: { current: 30, max: 30 } },
      });
      const { messageId } = await fire('w-flamer', nearTokenId);
      const damageId = await rollDamage('w-flamer', messageId);
      const { entry } = await applyDamage(damageId, nearTokenId);
      expect(entry.ammo?.notes?.join(' ')).toContain('4 obr./turę');
      // …and no Critical Injury, whatever the dice showed.
      expect(entry.injury).toBeUndefined();
    });
  });
});
