import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  CampaignSummary,
  ChatMessageBroadcast,
  CharacterView,
  CombatView,
  CpredAttackMeta,
  CpredCharacterData,
  DamageLogEntry,
  InvitationSummary,
  RulerBroadcast,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenView,
  WallView,
  TokenUpsertBroadcast,
} from '@vtt/shared';
import { statistQuick } from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Smoke tests of ranged combat (stage 16) on real sockets.
 *
 * The point of most of these is the same: the *distance is measured on the
 * server*. The client only names a target token, so the tests move tokens and
 * assert that the DV, the range band and the verdict follow the map.
 *
 * The scene defaults are 100 px per square and 2 m per square, so one metre is
 * 50 px and a token at x = 250 stands 5 m from a token at x = 0.
 */

const TEST_DB = `./.test-${randomBytes(6).toString('hex')}.db`;
const GM_PASSWORD = 'test-haslo';
/** Scene pixels per metre, with the default grid (100 px = 2 m). */
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

function waitFor<T>(socket: ClientSocket, event: string, ms = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function emitAck<T = undefined>(
  socket: ClientSocket,
  event: string,
  payload?: unknown,
): Promise<SocketAck<T>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), 5000);
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
    payload: { name: 'Kampania strzelania' },
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

describe('ranged combat from the map', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;
  let characterId: string;
  let shooterTokenId: string;
  let targetTokenId: string;
  let hiddenTokenId: string;

  /** The attack metadata of a roll message, as the card reads it. */
  interface AttackCard {
    hit?: boolean;
    detail: string;
    label: string;
    damageNotation?: string;
    damageMultiplier?: number;
    forcedChecks?: { name: string; detail: string; success: boolean }[];
    /**
     * The planner's meta plus the two numbers the *server* adds when it judges
     * the roll (`realtime/attacks.ts`). Named rather than `Record<string,
     * unknown>`: an index signature makes every field `unknown`, and `unknown`
     * silently swallows a misspelled assertion instead of failing to compile.
     */
    system: CpredAttackMeta & { margin: number; multiplier?: number };
  }

  /**
   * Reads the attack card off a roll message — the **only** place this file
   * casts.
   *
   * `RollAttackMeta.system` is `Record<string, unknown>` on purpose: the dice
   * engine carries what the system module computed without knowing CP RED
   * (`dice.ts`). The test does know it, so the shape is named once here and
   * every assertion below reads a real field instead of an `unknown` that
   * would swallow a typo.
   */
  function attackCard(broadcast: ChatMessageBroadcast): AttackCard | undefined {
    return broadcast.message.roll?.attack as unknown as AttackCard | undefined;
  }

  /** Same, where a missing card is the test failing rather than a branch. */
  function requireAttackCard(broadcast: ChatMessageBroadcast): AttackCard {
    const card = attackCard(broadcast);
    if (!card) throw new Error('roll message carried no attack card');
    return card;
  }

  async function sheetOf(id: string): Promise<CpredCharacterData> {
    const sync = waitFor<StateSyncPayload>(gm, 'state:sync');
    await emitAck(gm, 'state:request');
    const character = (await sync).characters.find((c) => c.id === id);
    if (!character) throw new Error('character missing from sync');
    return character.data as CpredCharacterData;
  }

  /** Puts the target token `metres` away from the shooter and waits for the move. */
  async function placeTargetAt(metres: number): Promise<void> {
    await emitAck(gm, 'token:move', {
      tokenId: targetTokenId,
      x: metres * PX_PER_M,
      y: 0,
      final: true,
    });
  }

  /** Fires and returns the attack card off the broadcast chat message. */
  async function attack(request: Record<string, unknown>): Promise<AttackCard> {
    const message = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    const ack = await emitAck<{ messageId: number }>(player, 'attack:roll', {
      characterId,
      targetTokenId,
      attackerTokenId: shooterTokenId,
      request,
    });
    if (!ack.ok) throw new Error(`attack:roll failed: ${JSON.stringify(ack)}`);
    return requireAttackCard(await message);
  }

  it('sets the table: a shooter with a pistol and a rifle, and two targets', async () => {
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
          // REF 6 + Broń krótka 5 = +11; Ogień ciągły 4 → +10 on bursts.
          stats: { ...(character.data as CpredCharacterData).stats, ref: 6, will: 6, dex: 5 },
          skills: { handgun: 5, autofire: 4, evasion: 3, concentration: 2 },
          weapons: [
            {
              id: 'w-pistol',
              name: 'Zgrzyt 9',
              notes: '',
              compendiumId: 'weapon.zgrzyt-9',
              damage: '2k6',
              ammoCurrent: 10,
              ammoMax: 10,
              ammoType: '',
              rof: '2',
            },
            {
              id: 'w-rifle',
              name: 'Grzechotnik',
              notes: '',
              compendiumId: 'weapon.grzechotnik',
              damage: '5k6',
              ammoCurrent: 25,
              ammoMax: 25,
              ammoType: '',
              rof: '1',
            },
            {
              id: 'w-blade',
              name: 'Szpon',
              notes: '',
              compendiumId: 'weapon.szpon',
              damage: '3k6',
              ammoCurrent: 0,
              ammoMax: 0,
              ammoType: '',
              rof: '2',
            },
          ],
        },
      },
    });

    const scene = data(await emitAck<SceneView>(gm, 'scene:create', { name: 'Ulica' }), 'scene');
    sceneId = scene.id;
    // 20 000 px = 400 m of street: room to stand past every range band.
    await emitAck(gm, 'scene:update', { sceneId, patch: { width: 20_000 } });
    // Stage 17: a fresh scene starts under fog, which would hide these
    // tokens from the player. This suite is not about fog — light it up.
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
    hiddenTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Snajper',
        x: 30 * PX_PER_M,
        y: 0,
        hidden: true,
      }),
      'token:create',
    ).id;

    expect(shooterTokenId).toBeTruthy();
    expect(targetTokenId).toBeTruthy();
  });

  it('reads a different DV for the same pistol at 6 m and at 44 m', async () => {
    await placeTargetAt(6);
    const near = await attack({ weaponRowId: 'w-pistol', mode: 'single' });
    expect(near.system.dv).toBe(12); // sample pistol, band 0–6
    expect(near.system.metres).toBe(6);
    expect(near.detail).toContain('PT 12');

    await placeTargetAt(44);
    const far = await attack({ weaponRowId: 'w-pistol', mode: 'single' });
    expect(far.system.dv).toBe(24); // band 26–50
    expect(far.system.metres).toBe(44);
    expect(far.detail).toContain('PT 24');
  });

  /**
   * Stage 27j: shooting turns the shooter. The shooter stands at (0, 0) and
   * every target of this suite is placed due east of it, so „he is looking at
   * what he fired at" has exactly one right answer.
   */
  it('turns the shooter to face what they shot at', async () => {
    await placeTargetAt(6);
    const turned = waitFor<TokenUpsertBroadcast>(gm, 'token:upsert');
    await attack({ weaponRowId: 'w-pistol', mode: 'single' });
    const upsert = await turned;
    expect(upsert.token.id).toBe(shooterTokenId);
    expect(upsert.token.facing).toBe(90);
  });

  it('measures the distance itself — a client-sent one is ignored', async () => {
    await placeTargetAt(44);
    const card = await attack({ weaponRowId: 'w-pistol', mode: 'single', metres: 1, dv: 5 });
    expect(card.system.metres).toBe(44);
    expect(card.system.dv).toBe(24);
  });

  it('refuses a target past the weapon’s last range band', async () => {
    await placeTargetAt(300);
    const ack = await emitAck(player, 'attack:roll', {
      characterId,
      targetTokenId,
      attackerTokenId: shooterTokenId,
      request: { weaponRowId: 'w-pistol', mode: 'single' },
    });
    expect(ack).toEqual({ ok: false, error: 'OUT_OF_RANGE' });
  });

  it('spends one round per shot and blocks an empty magazine', async () => {
    await placeTargetAt(10);
    const before = (await sheetOf(characterId)).weapons.find((w) => w.id === 'w-pistol');
    const card = await attack({ weaponRowId: 'w-pistol', mode: 'single' });
    const after = (await sheetOf(characterId)).weapons.find((w) => w.id === 'w-pistol');
    expect(after?.ammoCurrent).toBe((before?.ammoCurrent ?? 0) - 1);
    expect(card.system.ammoCost).toBe(1);

    // Empty it, then try again.
    await emitAck(gm, 'character:update', {
      characterId,
      patch: {
        data: {
          weapons: (await sheetOf(characterId)).weapons.map((w) =>
            w.id === 'w-pistol' ? { ...w, ammoCurrent: 0 } : w,
          ),
        },
      },
    });
    const ack = await emitAck(player, 'attack:roll', {
      characterId,
      targetTokenId,
      attackerTokenId: shooterTokenId,
      request: { weaponRowId: 'w-pistol', mode: 'single' },
    });
    expect(ack).toEqual({ ok: false, error: 'NOT_ENOUGH_AMMO' });
  });

  it('reloads the magazine to full', async () => {
    const ack = data(
      await emitAck<{ ammo: number }>(player, 'weapon:reload', {
        characterId,
        weaponRowId: 'w-pistol',
      }),
      'weapon:reload',
    );
    expect(ack.ammo).toBe(10);
    const row = (await sheetOf(characterId)).weapons.find((w) => w.id === 'w-pistol');
    expect(row?.ammoCurrent).toBe(10);
  });

  it('fires a burst against the autofire table, spending ten rounds', async () => {
    await placeTargetAt(14);
    const card = await attack({ weaponRowId: 'w-rifle', mode: 'autofire' });
    expect(card.system.dv).toBe(16); // sample rifle autofire, band 13–25
    expect(card.system.ammoCost).toBe(10);
    expect(card.system.autofireMax).toBe(4);
    expect(card.system.damage).toBe('2k6');
    const row = (await sheetOf(characterId)).weapons.find((w) => w.id === 'w-rifle');
    expect(row?.ammoCurrent).toBe(15);
  });

  it('caps the burst multiplier at the weapon’s limit and offers 2k6 damage', async () => {
    await placeTargetAt(14);
    // Reload first — the previous burst left 15 rounds, enough for one more.
    const card = await attack({ weaponRowId: 'w-rifle', mode: 'autofire' });
    if (card.hit) {
      const multiplier = (card.damageMultiplier ?? 1) as number;
      expect(multiplier).toBeGreaterThanOrEqual(1);
      expect(multiplier).toBeLessThanOrEqual(4);
      expect(card.damageNotation).toBe('2k6');
      expect(multiplier).toBe(Math.min(4, card.system.margin as number));
    } else {
      expect(card.damageNotation).toBeUndefined();
    }
  });

  it('refuses a burst from a weapon that has no autofire', async () => {
    await placeTargetAt(10);
    const ack = await emitAck(player, 'attack:roll', {
      characterId,
      targetTokenId,
      attackerTokenId: shooterTokenId,
      request: { weaponRowId: 'w-pistol', mode: 'autofire' },
    });
    expect(ack).toEqual({ ok: false, error: 'NO_AUTOFIRE' });
  });

  it('forces a WILL check on everyone within 25 m of suppressive fire', async () => {
    await emitAck(player, 'weapon:reload', { characterId, weaponRowId: 'w-rifle' });
    await placeTargetAt(10);
    const card = await attack({ weaponRowId: 'w-rifle', mode: 'suppressive' });

    expect(card.system.dv).toBeNull();
    // The Ganger at 10 m and the hidden Sniper at 30 m: only the first is in.
    const names = (card.forcedChecks ?? []).map((check) => check.name);
    expect(names).toContain('Ganger');
    expect(names).not.toContain('Snajper');
    for (const check of card.forcedChecks ?? []) {
      expect(check.detail).toContain('SW+Koncentracja');
      expect(typeof check.success).toBe('boolean');
    }
    expect(card.detail).toContain('PT dla celów');
  });

  /**
   * Stage 14e closes the loop the card opened (POMYSLY, 28.07): whoever failed
   * the check is marked „Przygwożdżony" on the map, not only in a sentence.
   * Soft by design — the status nags, and nothing refuses.
   */
  it('marks the tokens that failed the check as „Przygwożdżony"', async () => {
    await emitAck(player, 'weapon:reload', { characterId, weaponRowId: 'w-rifle' });
    await placeTargetAt(10);
    // Ten volleys: the WILL check is a die roll, so at least one target fails.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const card = await attack({ weaponRowId: 'w-rifle', mode: 'suppressive' });
      const pinned = (card.forcedChecks ?? []).some((check) => check.success === false);
      await emitAck(player, 'weapon:reload', { characterId, weaponRowId: 'w-rifle' });
      if (!pinned) continue;
      const sync = waitFor<StateSyncPayload>(gm, 'state:sync');
      await emitAck(gm, 'state:request');
      const wearing = (await sync).tokens.filter((token) => token.statuses.includes('suppressed'));
      expect(wearing.length).toBeGreaterThan(0);
      return;
    }
    throw new Error('nobody failed a WILL check in ten volleys');
  });

  it('needs the target within 2 m for a melee attack', async () => {
    await placeTargetAt(6);
    const tooFar = await emitAck(player, 'attack:roll', {
      characterId,
      targetTokenId,
      attackerTokenId: shooterTokenId,
      request: { weaponRowId: 'w-blade', mode: 'single' },
    });
    expect(tooFar).toEqual({ ok: false, error: 'MELEE_OUT_OF_REACH' });

    await placeTargetAt(2);
    const card = await attack({ weaponRowId: 'w-blade', mode: 'single' });
    expect(card.system.melee).toBe(true);
    expect(card.system.dvSource).toBe('everyday'); // the Ganger has no sheet
    expect(card.detail).toContain('zwarcie');
  });

  it('refuses a swing through a barrier, and lets a round through it (stage 42a)', async () => {
    // Vex's middle is at x = 50, the Ganger's (2 m out) at x = 150.
    const fence = data(
      await emitAck<WallView[]>(gm, 'wall:create', {
        sceneId,
        kind: 'barrier',
        points: [
          { x: 2 * PX_PER_M, y: -2 * PX_PER_M },
          { x: 2 * PX_PER_M, y: 4 * PX_PER_M },
        ],
      }),
      'wall:create barrier',
    )[0]!;
    await placeTargetAt(2);
    const swing = await emitAck(player, 'attack:roll', {
      characterId,
      targetTokenId,
      attackerTokenId: shooterTokenId,
      request: { weaponRowId: 'w-blade', mode: 'single' },
    });
    expect(swing).toEqual({ ok: false, error: 'MELEE_BLOCKED' });

    // The mesh stops nothing that flies — how much it takes off is stage 42b.
    await emitAck(player, 'weapon:reload', { characterId, weaponRowId: 'w-pistol' });
    await placeTargetAt(6);
    const card = await attack({ weaponRowId: 'w-pistol', mode: 'single' });
    expect(card.system.melee).toBe(false);
    await emitAck(gm, 'wall:delete', { wallId: fence.id });
  });

  it('never lets a player target a hidden token', async () => {
    const ack = await emitAck(player, 'attack:roll', {
      characterId,
      targetTokenId: hiddenTokenId,
      attackerTokenId: shooterTokenId,
      request: { weaponRowId: 'w-pistol', mode: 'single' },
    });
    expect(ack).toEqual({ ok: false, error: 'TOKEN_NOT_FOUND' });
  });

  it('never lets a player attack with someone else’s character', async () => {
    const other = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Cudza' }),
      'character:create',
    );
    const ack = await emitAck(player, 'attack:roll', {
      characterId: other.id,
      targetTokenId,
      attackerTokenId: shooterTokenId,
      request: { weaponRowId: 'w-pistol', mode: 'single' },
    });
    expect(ack).toEqual({ ok: false, error: 'CHARACTER_NOT_FOUND' });
  });

  it('refuses to shoot with a token that is not the character’s', async () => {
    const ack = await emitAck(player, 'attack:roll', {
      characterId,
      targetTokenId,
      attackerTokenId: targetTokenId,
      request: { weaponRowId: 'w-pistol', mode: 'single' },
    });
    expect(ack).toEqual({ ok: false, error: 'ATTACKER_NOT_LINKED' });
  });

  it('chains a hit into a damage roll that keeps the burst multiplier', async () => {
    await emitAck(player, 'weapon:reload', { characterId, weaponRowId: 'w-rifle' });
    await placeTargetAt(14);

    // Keep firing until something lands — the burst DV at 14 m is 16 against +10.
    let hitMessageId = 0;
    let expectedMultiplier = 1;
    for (let attempt = 0; attempt < 40 && hitMessageId === 0; attempt++) {
      await emitAck(player, 'weapon:reload', { characterId, weaponRowId: 'w-rifle' });
      const message = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
      const ack = await emitAck<{ messageId: number }>(player, 'attack:roll', {
        characterId,
        targetTokenId,
        attackerTokenId: shooterTokenId,
        request: { weaponRowId: 'w-rifle', mode: 'autofire' },
      });
      const broadcast = await message;
      const card = attackCard(broadcast);
      if (card?.hit && ack.ok && ack.data) {
        hitMessageId = ack.data.messageId;
        expectedMultiplier = (card.damageMultiplier ?? 1) as number;
      }
    }
    expect(hitMessageId).toBeGreaterThan(0);

    const damageMessage = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    await emitAck(player, 'character:roll', {
      characterId,
      request: { kind: 'damage', weaponRowId: 'w-rifle', attackMessageId: hitMessageId },
      visibility: 'public',
    });
    const roll = (await damageMessage).message.roll;
    // The burst rolls 2k6 whatever the rifle prints, and carries the factor.
    expect(roll?.notation).toBe('2d6');
    expect(roll?.damage?.multiplier ?? 1).toBe(expectedMultiplier);
    expect(roll?.damage?.targetTokenId).toBe(targetTokenId);
  });

  it('refuses a damage roll that claims a hit which never happened', async () => {
    const missMessage = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    const ack = data(
      await emitAck<{ messageId: number }>(gm, 'character:roll', {
        characterId,
        request: { kind: 'skill', skillId: 'handgun' },
        visibility: 'public',
      }),
      'character:roll',
    );
    await missMessage;
    const denied = await emitAck(player, 'character:roll', {
      characterId,
      request: { kind: 'damage', weaponRowId: 'w-rifle', attackMessageId: ack.messageId },
      visibility: 'public',
    });
    expect(denied).toEqual({ ok: false, error: 'NOT_A_HIT' });
  });

  it('lets the defender contest a hit, and only once', async () => {
    // A target with a sheet: melee now reads its stand-in Evasion DV.
    const defender = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Ganger' }),
      'character:create',
    );
    await emitAck(gm, 'character:update', {
      characterId: defender.id,
      patch: {
        data: {
          stats: { ...(defender.data as CpredCharacterData).stats, dex: 6 },
          skills: { evasion: 4 },
        },
      },
    });
    const defenderToken = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Ganger z karty',
        x: 2 * PX_PER_M,
        y: 0,
        characterId: defender.id,
      }),
      'token:create',
    );

    // ZW 6 + Unik 4 + połowa kości 5 = PT 15.
    const message = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    const ack = data(
      await emitAck<{ messageId: number }>(player, 'attack:roll', {
        characterId,
        targetTokenId: defenderToken.id,
        attackerTokenId: shooterTokenId,
        request: { weaponRowId: 'w-blade', mode: 'single' },
      }),
      'attack:roll',
    );
    const card = requireAttackCard(await message);
    expect(card.system.dvSource).toBe('evasion');
    expect(card.system.dv).toBe(15);

    const update = waitFor<ChatMessageBroadcast>(gm, 'chat:update');
    const evaded = data(
      await emitAck<{ total: number; hit: boolean }>(gm, 'attack:evade', {
        messageId: ack.messageId,
        characterId: defender.id,
      }),
      'attack:evade',
    );
    const rewritten = requireAttackCard(await update);
    expect(rewritten.detail).toContain('Unik Ganger');
    expect(rewritten.hit).toBe(evaded.hit);

    // The dodge is a one-off: a second try must not re-roll it.
    const again = await emitAck(gm, 'attack:evade', {
      messageId: ack.messageId,
      characterId: defender.id,
    });
    expect(again).toEqual({ ok: false, error: 'ALREADY_EVADED' });
  });

  /**
   * Stage 14e: „Odcięta noga … Nie możesz Unikać ataków". The refusal has to
   * come from the *sheet*, not from the token's statuses — a severed leg is a
   * Critical Injury, and nothing paints it on the map.
   */
  it('refuses the dodge of a defender whose leg is gone', async () => {
    const cripple = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Kuternoga' }),
      'character:create',
    );
    await emitAck(gm, 'character:update', {
      characterId: cripple.id,
      patch: {
        data: {
          stats: { ...(cripple.data as CpredCharacterData).stats, dex: 6 },
          skills: { evasion: 4 },
          criticalInjuries: [
            {
              id: 'injury.body-odcieta-noga',
              name: 'Odcięta noga',
              effect: 'Nie możesz Unikać ataków.',
              noDodge: true,
            },
          ],
        },
      },
    });
    const crippleToken = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Kuternoga',
        x: 2 * PX_PER_M,
        y: 0,
        characterId: cripple.id,
      }),
      'token:create',
    );
    const message = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    const ack = data(
      await emitAck<{ messageId: number }>(player, 'attack:roll', {
        characterId,
        targetTokenId: crippleToken.id,
        attackerTokenId: shooterTokenId,
        request: { weaponRowId: 'w-blade', mode: 'single' },
      }),
      'attack:roll',
    );
    await message;
    const refused = await emitAck(gm, 'attack:evade', {
      messageId: ack.messageId,
      characterId: cripple.id,
    });
    expect(refused).toEqual({ ok: false, error: 'DODGE_BLOCKED' });
    await emitAck(gm, 'token:delete', { tokenId: crippleToken.id });
  });

  it('never lets a bystander dodge someone else’s attack', async () => {
    await placeTargetAt(10);
    const ack = data(
      await emitAck<{ messageId: number }>(player, 'attack:roll', {
        characterId,
        targetTokenId,
        attackerTokenId: shooterTokenId,
        request: { weaponRowId: 'w-pistol', mode: 'single' },
      }),
      'attack:roll',
    );
    // The shooter's own sheet is not the target of the shot.
    const denied = await emitAck(player, 'attack:evade', {
      messageId: ack.messageId,
      characterId,
    });
    expect(denied).toEqual({ ok: false, error: 'NOT_THE_TARGET' });
  });

  it('shares a ruler with the other viewers of the scene, but not with its author', async () => {
    const seen = waitFor<RulerBroadcast>(gm, 'ruler:update');
    const ack = await emitAck(player, 'ruler:update', {
      sceneId,
      points: [
        { x: 0, y: 0 },
        { x: 1200, y: 0 },
      ],
    });
    expect(ack).toEqual({ ok: true });
    const broadcast = await seen;
    expect(broadcast.userId).toBe(playerId);
    expect(broadcast.points).toHaveLength(2);
    expect(broadcast.sceneId).toBe(sceneId);
  });

  it('keeps a private GM measurement off the players’ screens', async () => {
    const received: RulerBroadcast[] = [];
    player.on('ruler:update', (payload: RulerBroadcast) => received.push(payload));
    const ack = await emitAck(gm, 'ruler:update', {
      sceneId,
      private: true,
      points: [
        { x: 0, y: 0 },
        { x: 500, y: 500 },
      ],
    });
    expect(ack).toEqual({ ok: true });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(received).toHaveLength(0);
  });

  /**
   * Stage 16b: what stands between the two tokens.
   *
   * The scene runs at 50 px per metre along the x axis, so a wall drawn as a
   * vertical segment at x = 500 stands 10 m out from the shooter at x = 0. The
   * walls are cleared at the end of each test — the rest of the suite fires
   * down the same street.
   */
  describe('line of fire', () => {
    /** A vertical segment `metres` out from the shooter, tall enough to matter. */
    async function wallAt(metres: number, kind: 'wall' | 'door' | 'window' = 'wall') {
      const x = metres * PX_PER_M;
      return emitAck(gm, 'wall:create', {
        sceneId,
        kind,
        points: [
          { x, y: -400 },
          { x, y: 400 },
        ],
      });
    }

    // Both halves matter: a leftover wall would refuse the next suite's shots,
    // and a shooter left standing where the previous test moved it would change
    // every distance measured after it.
    afterEach(async () => {
      await emitAck(gm, 'wall:clear', { sceneId });
      await emitAck(gm, 'token:move', { tokenId: shooterTokenId, x: 0, y: 0, final: true });
    });

    it('refuses a shot at a target behind a wall', async () => {
      await placeTargetAt(20);
      await wallAt(10);
      const ack = await emitAck(player, 'attack:roll', {
        characterId,
        targetTokenId,
        attackerTokenId: shooterTokenId,
        request: { weaponRowId: 'w-pistol', mode: 'single' },
      });
      expect(ack).toEqual({ ok: false, error: 'NO_LINE_OF_FIRE' });
    });

    it('lets the same shot through once the door in that wall is open', async () => {
      await placeTargetAt(20);
      const created = data(
        await emitAck<{ id: number }[]>(gm, 'wall:create', {
          sceneId,
          kind: 'door',
          points: [
            { x: 10 * PX_PER_M, y: -400 },
            { x: 10 * PX_PER_M, y: 400 },
          ],
        }),
        'wall:create',
      );
      const shut = await emitAck(player, 'attack:roll', {
        characterId,
        targetTokenId,
        attackerTokenId: shooterTokenId,
        request: { weaponRowId: 'w-pistol', mode: 'single' },
      });
      expect(shut).toEqual({ ok: false, error: 'NO_LINE_OF_FIRE' });

      await emitAck(gm, 'opening:toggle', { wallId: created[0]!.id, open: true });
      const card = await attack({ weaponRowId: 'w-pistol', mode: 'single' });
      // Through the doorway the shot is an ordinary one again: the DV comes off
      // the range table, not off the wall.
      expect(card.system.metres).toBe(20);
      expect(card.system.dv).toBe(19); // sample pistol, band 13–25
    });

    it('a wall behind the target does not block the target', async () => {
      await placeTargetAt(10);
      await wallAt(20);
      const card = await attack({ weaponRowId: 'w-pistol', mode: 'single' });
      expect(card.system.metres).toBe(10);
    });

    /**
     * Glass is not cover in the rules („szyby … nie są osłoną", s. 180), so the
     * pane itself never stops a round. What refuses the shot from across the
     * street is the net curtain of stage 18d: from there the target simply
     * cannot be made out. Walk up to the window and you fire through it.
     */
    it('stops a shot through a closed window from far, and lets it through from close', async () => {
      await placeTargetAt(20);
      await wallAt(10, 'window');
      const far = await emitAck(player, 'attack:roll', {
        characterId,
        targetTokenId,
        attackerTokenId: shooterTokenId,
        request: { weaponRowId: 'w-pistol', mode: 'single' },
      });
      expect(far).toEqual({ ok: false, error: 'NO_LINE_OF_FIRE' });

      // Tokens snap to the grid, so the shooter stands on even metres: 8 m puts
      // its centre one metre from the pane, inside the 2 m reach of stage 18d.
      await emitAck(gm, 'token:move', {
        tokenId: shooterTokenId,
        x: 8 * PX_PER_M,
        y: 0,
        final: true,
      });
      const card = await attack({ weaponRowId: 'w-pistol', mode: 'single' });
      expect(card.system.metres).toBe(12);
    });

    it('stops a fist too — a wall is not only about bullets', async () => {
      // The target's centre is 2 m out; the wall at x = 100 px stands halfway
      // between the two centres, which is what „a wall between us" means here.
      await placeTargetAt(2);
      await wallAt(2);
      const ack = await emitAck(player, 'attack:roll', {
        characterId,
        targetTokenId,
        attackerTokenId: shooterTokenId,
        request: { weaponRowId: 'w-blade', mode: 'single' },
      });
      expect(ack).toEqual({ ok: false, error: 'NO_LINE_OF_FIRE' });
    });

    /** RAW s. 174: „wszystkie … osoby w zasięgu 25 m, **które widzisz**". */
    it('keeps suppressive fire off a target standing behind a wall', async () => {
      await emitAck(player, 'weapon:reload', { characterId, weaponRowId: 'w-rifle' });
      await placeTargetAt(20);
      const open = await attack({ weaponRowId: 'w-rifle', mode: 'suppressive' });
      expect((open.forcedChecks ?? []).map((check) => check.name)).toContain('Ganger');

      await emitAck(player, 'weapon:reload', { characterId, weaponRowId: 'w-rifle' });
      await wallAt(10);
      const walled = await attack({ weaponRowId: 'w-rifle', mode: 'suppressive' });
      expect((walled.forcedChecks ?? []).map((check) => check.name)).not.toContain('Ganger');
    });
  });

  /**
   * Stage 16b: a token with no character sheet fights from its own profile.
   *
   * The point of these is the identity claimed in `systems/cpred/statist.ts` —
   * the statist is dressed as a sheet, so everything downstream (the DV from
   * the range table, the magazine, the turn budget, the chat card) behaves
   * exactly as it does for a player character.
   */
  describe('statist combat profile', () => {
    let statistTokenId: string;

    const PROFILE = {
      ref: 7,
      dex: 5,
      body: 6,
      will: 5,
      skillLevel: 4,
      evasion: 3,
      armorSp: 11,
      weaponId: 'weapon.zgrzyt-9',
      weaponName: 'Zgrzyt 9',
      weaponDamage: '2k6',
      ammoCurrent: 10,
      ammoMax: 10,
    };

    /**
     * Sześć pól figury, odczytane z jej **karty** (etap 38a) na świeżym syncu.
     * Do 38a stała tu kolumna profilu bojowego żetonu.
     */
    async function profileOf(tokenId: string): Promise<Record<string, unknown>> {
      const sync = waitFor<StateSyncPayload>(gm, 'state:sync');
      await emitAck(gm, 'state:request');
      const state = await sync;
      const token = state.tokens.find((entry) => entry.id === tokenId);
      const card = state.characters.find((entry) => entry.id === token?.characterId);
      if (!card) throw new Error('figure carries no character sheet');
      return statistQuick(card.data as CpredCharacterData) as unknown as Record<string, unknown>;
    }

    it('stats a bare token from the GM side', async () => {
      statistTokenId = data(
        await emitAck<TokenView>(gm, 'token:create', {
          sceneId,
          name: 'Ochroniarz',
          x: 4 * PX_PER_M,
          y: 4 * PX_PER_M,
          hp: { current: 25, max: 25 },
        }),
        'token:create',
      ).id;
      const ack = await emitAck<TokenView>(gm, 'token:stat', {
        tokenId: statistTokenId,
        quick: PROFILE,
      });
      expect(ack.ok).toBe(true);
      expect(await profileOf(statistTokenId)).toMatchObject({ ref: 7, armorSp: 11 });
    });

    it('repairs a profile the client sent out of range instead of refusing it', async () => {
      await emitAck(gm, 'token:stat', {
        tokenId: statistTokenId,
        quick: { ...PROFILE, ref: 99, ammoCurrent: 900 },
      });
      const stored = await profileOf(statistTokenId);
      expect(stored.ref).toBe(10);
      expect(stored.ammoCurrent).toBe(10);
      await emitAck(gm, 'token:stat', {
        tokenId: statistTokenId,
        quick: PROFILE,
      });
    });

    it('fires without a character sheet, reading the DV off the range table', async () => {
      await placeTargetAt(20);
      const message = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
      const ack = await emitAck<{ messageId: number }>(gm, 'attack:roll', {
        targetTokenId,
        attackerTokenId: statistTokenId,
        request: { weaponRowId: 'statist-weapon', mode: 'single' },
      });
      expect(ack.ok).toBe(true);
      const card = attackCard(await message);
      if (!card) throw new Error('roll message carried no attack card');
      // REF 7 + the profile's skill level 4, and a DV from the map like anyone's.
      expect(card.system.dv).toBe(19);
      expect(card.label).toContain('Zgrzyt 9');
      expect((await profileOf(statistTokenId)).ammoCurrent).toBe(9);
    });

    it('refuses to fire with a token nobody has statted', async () => {
      const bare = data(
        await emitAck<TokenView>(gm, 'token:create', {
          sceneId,
          name: 'Przechodzień',
          x: 6 * PX_PER_M,
          y: 6 * PX_PER_M,
        }),
        'token:create',
      ).id;
      const ack = await emitAck(gm, 'attack:roll', {
        targetTokenId,
        attackerTokenId: bare,
        request: { weaponRowId: 'statist-weapon', mode: 'single' },
      });
      expect(ack).toEqual({ ok: false, error: 'TOKEN_HAS_NO_PROFILE' });
      await emitAck(gm, 'token:delete', { tokenId: bare });
    });

    it('never lets a player fire with a statist that is not theirs', async () => {
      const ack = await emitAck(player, 'attack:roll', {
        targetTokenId,
        attackerTokenId: statistTokenId,
        request: { weaponRowId: 'statist-weapon', mode: 'single' },
      });
      expect(ack).toEqual({ ok: false, error: 'CHARACTER_NOT_FOUND' });
    });

    it('keeps the profile off a player’s copy of the token', async () => {
      const sync = waitFor<StateSyncPayload>(player, 'state:sync');
      await emitAck(player, 'state:request');
      const seen = (await sync).tokens.find((entry) => entry.id === statistTokenId);
      expect(seen).toBeDefined();
      // The gun and the armour are private the same way the HP bar is: a player
      // finds out what an NPC is wearing by shooting at it.
      expect(seen?.characterId ?? null).toBeNull();
    });

    /**
     * 29.08: przeładowanie przestało być przywilejem karty postaci. Magazynek
     * statysty siedzi w profilu, więc do tej sesji uzupełniało się go ręczną
     * edycją tokenu w środku walki — przy pustym SMG przeciwnika MG musiał
     * otwierać „Edytuj…" zamiast kliknąć jeden guzik.
     */
    it('przeładowuje statystę tym samym zdarzeniem, co kartę', async () => {
      await emitAck(gm, 'token:stat', {
        tokenId: statistTokenId,
        quick: { ...PROFILE, ammoCurrent: 2 },
      });
      const ack = await emitAck<{ ammo: number }>(gm, 'weapon:reload', {
        attackerTokenId: statistTokenId,
        weaponRowId: 'statist-weapon',
      });
      expect(ack.ok && ack.data?.ammo).toBe(10);
      expect((await profileOf(statistTokenId)).ammoCurrent).toBe(10);
    });

    it('nie robi nic przy pełnym magazynku — klik był pomyłką, nie Akcją', async () => {
      const ack = await emitAck<{ ammo: number }>(gm, 'weapon:reload', {
        attackerTokenId: statistTokenId,
        weaponRowId: 'statist-weapon',
      });
      expect(ack.ok && ack.data?.ammo).toBe(10);
    });

    it('odmawia przeładowania broni, której nabojów nikt nie liczy', async () => {
      await emitAck(gm, 'token:stat', {
        tokenId: statistTokenId,
        quick: { ...PROFILE, ammoCurrent: 0, ammoMax: 0 },
      });
      const ack = await emitAck(gm, 'weapon:reload', {
        attackerTokenId: statistTokenId,
        weaponRowId: 'statist-weapon',
      });
      expect(ack).toEqual({ ok: false, error: 'WEAPON_HAS_NO_MAGAZINE' });
      await emitAck(gm, 'token:stat', {
        tokenId: statistTokenId,
        quick: PROFILE,
      });
    });

    it('nie pozwala graczowi przeładować cudzego statysty', async () => {
      const ack = await emitAck(player, 'weapon:reload', {
        attackerTokenId: statistTokenId,
        weaponRowId: 'statist-weapon',
      });
      expect(ack).toEqual({ ok: false, error: 'CHARACTER_NOT_FOUND' });
    });

    /**
     * The defence half of the profile (stage 16b decision): before it, every
     * extra defended a swing at the everyday DV of 13 whatever the GM intended.
     */
    it('defends a melee swing with its own DEX + Unik instead of the everyday DV', async () => {
      await emitAck(gm, 'token:move', {
        tokenId: statistTokenId,
        x: 2 * PX_PER_M,
        y: 0,
        final: true,
      });
      const message = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
      const ack = await emitAck<{ messageId: number }>(player, 'attack:roll', {
        characterId,
        targetTokenId: statistTokenId,
        attackerTokenId: shooterTokenId,
        request: { weaponRowId: 'w-blade', mode: 'single' },
      });
      expect(ack.ok).toBe(true);
      const card = attackCard(await message);
      if (!card) throw new Error('roll message carried no attack card');
      // ZW 5 + Unik 3 + half a die (5) = 13 by coincidence of the numbers, so
      // the source is what this asserts, not the total.
      expect(card.system.dvSource).toBe('evasion');
      expect(card.detail).toContain('Unik celu');
    });

    /**
     * Unik figury bez karty (sesja naprawcza 22.08).
     *
     * PT obrony statysty liczy się z jego profilu od etapu 16b, ale zdarzenie
     * `attack:evade` wymagało **karty postaci** — więc przycisk „Unik" nigdy
     * się dla niego nie pojawiał i bierna obrona była jedyną, jaką miał.
     */
    it('dodges with the same profile its passive DV is read from', async () => {
      await emitAck(gm, 'token:move', {
        tokenId: statistTokenId,
        x: 2 * PX_PER_M,
        y: 0,
        final: true,
      });
      const message = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
      const ack = data(
        await emitAck<{ messageId: number }>(player, 'attack:roll', {
          characterId,
          targetTokenId: statistTokenId,
          attackerTokenId: shooterTokenId,
          request: { weaponRowId: 'w-blade', mode: 'single' },
        }),
        'attack:roll',
      );
      await message;

      const update = waitFor<ChatMessageBroadcast>(gm, 'chat:update');
      const evaded = data(
        await emitAck<{ total: number; hit: boolean }>(gm, 'attack:evade', {
          messageId: ack.messageId,
        }),
        'attack:evade',
      );
      const rewritten = requireAttackCard(await update);
      // Karta nazywa figurę, a nie kartę, której nie ma.
      expect(rewritten.detail).toContain('Unik Ochroniarz');
      expect(rewritten.hit).toBe(evaded.hit);
      // Rzut jest rzutem: k10 w CP RED wybucha i pęka, więc żadnego przedziału
      // nie da się tu obiecać — liczy się to, że **jakiś** rzut padł i że kartę
      // przepisano jego wynikiem.
      expect(Number.isInteger(evaded.total)).toBe(true);

      // Jak przy karcie: raz.
      expect(await emitAck(gm, 'attack:evade', { messageId: ack.messageId })).toEqual({
        ok: false,
        error: 'ALREADY_EVADED',
      });
    });

    it('never lets a player dodge for a statist that is not theirs', async () => {
      await emitAck(gm, 'token:move', {
        tokenId: statistTokenId,
        x: 2 * PX_PER_M,
        y: 0,
        final: true,
      });
      const message = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
      const ack = data(
        await emitAck<{ messageId: number }>(player, 'attack:roll', {
          characterId,
          targetTokenId: statistTokenId,
          attackerTokenId: shooterTokenId,
          request: { weaponRowId: 'w-blade', mode: 'single' },
        }),
        'attack:roll',
      );
      await message;
      expect(await emitAck(player, 'attack:evade', { messageId: ack.messageId })).toMatchObject({
        ok: false,
        error: 'NOT_THE_TARGET',
      });
    });

    /** RAW: armour stops the damage and wears down by one when it does. */
    it('applies and ablates the profile’s armour without the GM typing it', async () => {
      // SP 4 against the rifle's 5k6: the lowest possible roll still gets
      // through, so „did the armour stop everything?" cannot make this flaky.
      await emitAck(gm, 'token:stat', {
        tokenId: statistTokenId,
        quick: { ...PROFILE, armorSp: 4 },
      });

      const damageMessage = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
      const rolled = data(
        await emitAck<{ messageId: number }>(gm, 'character:roll', {
          characterId,
          request: { kind: 'damage', weaponRowId: 'w-rifle' },
          visibility: 'public',
        }),
        'character:roll',
      );
      await damageMessage;

      const applied = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
      const ack = await emitAck<{ messageId: number }>(gm, 'damage:apply', {
        messageId: rolled.messageId,
        tokenId: statistTokenId,
      });
      expect(ack.ok).toBe(true);
      const entry = (await applied).message.damage;
      expect(entry?.armorSp).toBe(4);
      expect(entry?.armor).toMatchObject({ before: 4, after: 3 });
      expect(await profileOf(statistTokenId)).toMatchObject({ armorSp: 3 });

      // „Cofnij" puts the armour back up with the HP — a half-undo is what
      // stage 14d fixed for statuses, and this is the same shape of bug.
      const undone = waitFor<ChatMessageBroadcast>(gm, 'chat:update');
      await emitAck(gm, 'damage:undo', { messageId: data(ack, 'damage:apply').messageId });
      await undone;
      expect(await profileOf(statistTokenId)).toMatchObject({ armorSp: 4 });
    });

    /**
     * Obrażenia figury bez karty (zaległość z 23.08).
     *
     * Statysta strzelał od etapu 16b, ale karta ataku szukała atakującego
     * wyłącznie wśród kart postaci — trafienie było, przycisku „Obrażenia" nie
     * było, a MG odejmował PW ręcznie. Naprawa idzie wzorcem, którym 22.08
     * naprawiono jego Unik: rzut zna figurę po żetonie zapisanym na karcie.
     */
    describe('damage from a figure that has no sheet', () => {
      /** Fires until something lands, and returns the card's message id. */
      async function landHit(): Promise<number> {
        await emitAck(gm, 'token:move', {
          tokenId: statistTokenId,
          x: 4 * PX_PER_M,
          y: 4 * PX_PER_M,
          final: true,
        });
        await placeTargetAt(4);
        for (let attempt = 0; attempt < 40; attempt++) {
          // Magazine back to full: forty attempts would empty ten rounds.
          await emitAck(gm, 'token:stat', {
            tokenId: statistTokenId,
            quick: PROFILE,
          });
          const message = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
          const ack = await emitAck<{ messageId: number }>(gm, 'attack:roll', {
            targetTokenId,
            attackerTokenId: statistTokenId,
            request: { weaponRowId: 'statist-weapon', mode: 'single' },
          });
          const card = attackCard(await message);
          if (card?.hit && ack.ok && ack.data) return ack.data.messageId;
        }
        throw new Error('the statist never landed a shot in forty attempts');
      }

      it('names the shooter on the card, so the damage roll has something to find', async () => {
        const message = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
        await emitAck(gm, 'attack:roll', {
          targetTokenId,
          attackerTokenId: statistTokenId,
          request: { weaponRowId: 'statist-weapon', mode: 'single' },
        });
        const card = attackCard(await message);
        if (!card) throw new Error('roll message carried no attack card');
        expect(card.system.attackerTokenId).toBe(statistTokenId);
      });

      it('rolls the profile’s damage without a character sheet', async () => {
        const hitMessageId = await landHit();

        const damageMessage = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
        const ack = await emitAck<{ messageId: number }>(gm, 'character:roll', {
          attackerTokenId: statistTokenId,
          request: {
            kind: 'damage',
            weaponRowId: 'statist-weapon',
            attackMessageId: hitMessageId,
          },
          visibility: 'public',
        });
        expect(ack.ok).toBe(true);
        const roll = (await damageMessage).message.roll;
        // The profile's own notation, its own name on the card, and the target
        // read off the stored attack — the same three things a sheet gets.
        expect(roll?.notation).toBe('2d6');
        expect(roll?.actor).toBe('Ochroniarz');
        expect(roll?.damage?.targetTokenId).toBe(targetTokenId);
      });

      it('lands on the target through „Zastosuj", exactly as a sheet’s damage does', async () => {
        const hitMessageId = await landHit();
        const before = data(
          await emitAck<TokenView>(gm, 'token:update', {
            tokenId: targetTokenId,
            patch: { hp: { current: 40, max: 40 } },
          }),
          'token:update',
        );
        expect(before.hp?.current).toBe(40);

        const damageMessage = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
        const rolled = data(
          await emitAck<{ messageId: number }>(gm, 'character:roll', {
            attackerTokenId: statistTokenId,
            request: {
              kind: 'damage',
              weaponRowId: 'statist-weapon',
              attackMessageId: hitMessageId,
            },
            visibility: 'public',
          }),
          'character:roll',
        );
        const total = (await damageMessage).message.roll?.total ?? 0;

        const applied = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
        const ack = await emitAck(gm, 'damage:apply', {
          messageId: rolled.messageId,
          tokenId: targetTokenId,
        });
        expect(ack.ok).toBe(true);
        const entry = (await applied).message.damage;
        // The number the dice showed reaches the target's HP bar: what the
        // GM used to type in by hand after doing the arithmetic themselves.
        expect(entry?.damageRolled).toBe(total);
        expect(entry?.targetTokenId).toBe(targetTokenId);
        expect(entry?.hp?.before).toBe(40);
        expect(entry?.hp?.after).toBe(40 - (entry?.hpLost ?? 0));
      });

      it('refuses a statist roll that is not damage', async () => {
        const ack = await emitAck(gm, 'character:roll', {
          attackerTokenId: statistTokenId,
          request: { kind: 'skill', skillId: 'evasion' },
          visibility: 'public',
        });
        expect(ack).toEqual({ ok: false, error: 'STATIST_CANNOT_ROLL_THIS' });
      });

      it('refuses to roll damage for a token nobody has statted', async () => {
        const hitMessageId = await landHit();
        const bare = data(
          await emitAck<TokenView>(gm, 'token:create', {
            sceneId,
            name: 'Gap',
            x: 9 * PX_PER_M,
            y: 9 * PX_PER_M,
          }),
          'token:create',
        ).id;
        const ack = await emitAck(gm, 'character:roll', {
          attackerTokenId: bare,
          request: {
            kind: 'damage',
            weaponRowId: 'statist-weapon',
            attackMessageId: hitMessageId,
          },
          visibility: 'public',
        });
        expect(ack).toEqual({ ok: false, error: 'TOKEN_HAS_NO_PROFILE' });
        await emitAck(gm, 'token:delete', { tokenId: bare });
      });

      it('never lets a player roll damage for a statist that is not theirs', async () => {
        const hitMessageId = await landHit();
        const ack = await emitAck(player, 'character:roll', {
          attackerTokenId: statistTokenId,
          request: {
            kind: 'damage',
            weaponRowId: 'statist-weapon',
            attackMessageId: hitMessageId,
          },
          visibility: 'public',
        });
        expect(ack).toEqual({ ok: false, error: 'CHARACTER_NOT_FOUND' });
      });
    });
  });

  it('rejects a malformed ruler line', async () => {
    const ack = await emitAck(player, 'ruler:update', {
      sceneId,
      points: [{ x: 0, y: 0 }],
    });
    expect(ack).toEqual({ ok: false, error: 'BAD_REQUEST' });
  });

  /**
   * Celowanie (s. 170). The head has been half of this suite since stage 16;
   * these are the other two aim points, whose whole effect happens *after* the
   * damage lands — a leg breaks, a gun falls out of somebody's hands.
   */
  /**
   * 29.08: „Obrażenia zadane każdym rodzajem broni białej ignorują połowę
   * pancerza Broniącego się, zaokrąglając w górę" (s. 176). Do tej sesji flaga
   * nie istniała, więc każde cięcie w VTT rozbijało się o pełne OB — a to
   * najczęstszy atak wręcz w grze. Test jedzie całą drogą: karta ataku niesie
   * flagę, karta obrażeń ją odczytuje, a ślad na czacie to mówi.
   */
  describe('broń biała tnie przez połowę pancerza', () => {
    let vestCharacterId = '';
    let vestTokenId = '';

    it('stawia cel w kurtce OB 11 w zasięgu ostrza', async () => {
      const target = data(
        await emitAck<CharacterView>(gm, 'character:create', { name: 'Kamizelka' }),
        'character:create',
      );
      vestCharacterId = target.id;
      await emitAck(gm, 'character:update', {
        characterId: vestCharacterId,
        patch: {
          data: {
            // ZW 2, żeby Unik nie zjadał połowy przebiegów pętli niżej.
            stats: { ...(target.data as CpredCharacterData).stats, dex: 2 },
            armor: [
              {
                id: 'a-vest',
                name: 'Kurtka kuloodporna',
                notes: '',
                sp: 11,
                spCurrent: 11,
                location: 'body',
              },
            ],
          },
        },
      });
      vestTokenId = data(
        await emitAck<TokenView>(gm, 'token:create', {
          sceneId,
          name: 'Kamizelka',
          x: 2 * PX_PER_M,
          y: 0,
          characterId: vestCharacterId,
        }),
        'token:create',
      ).id;
      expect(vestTokenId).toBeTruthy();
    });

    it('niesie flagę na karcie ataku i odejmuje połowę OB przy rozliczeniu', async () => {
      for (let attempt = 0; attempt < 40; attempt++) {
        const message = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
        const ack = await emitAck<{ messageId: number }>(player, 'attack:roll', {
          characterId,
          targetTokenId: vestTokenId,
          attackerTokenId: shooterTokenId,
          request: { weaponRowId: 'w-blade', mode: 'single', modifier: 20 },
        });
        const card = attackCard(await message);
        if (!card?.hit || !ack.ok || !ack.data) continue;
        // Flaga jedzie kartą, a nie żądaniem klienta — inaczej klient sam
        // decydowałby, ile warta jest kamizelka celu.
        expect(card.system.halvesArmor).toBe(true);

        const damage = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
        await emitAck(player, 'character:roll', {
          characterId,
          request: { kind: 'damage', weaponRowId: 'w-blade', attackMessageId: ack.data.messageId },
          visibility: 'public',
        });
        const rolledId = (await damage).message.id;
        const logged = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
        await emitAck(gm, 'damage:apply', { messageId: rolledId, tokenId: vestTokenId });
        const entry = (await logged).message.damage;
        if (!entry) throw new Error('brak wpisu obrażeń na karcie');

        // OB 11 → 6 przy tym cięciu, ale ściera się cały pancerz (s. 176).
        expect(entry.armorHalved).toBe(true);
        expect(entry.armorSp).toBe(6);
        if (entry.armor) {
          expect(entry.armor.before).toBe(11);
          expect(entry.armor.after).toBe(10);
        }
        return;
      }
      throw new Error('ostrze nie trafiło w 40 próbach');
    });

    it('nie dzieli pancerza przy strzale — to zasada walki wręcz', async () => {
      for (let attempt = 0; attempt < 40; attempt++) {
        await emitAck(player, 'weapon:reload', { characterId, weaponRowId: 'w-pistol' });
        const message = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
        const ack = await emitAck<{ messageId: number }>(player, 'attack:roll', {
          characterId,
          targetTokenId: vestTokenId,
          attackerTokenId: shooterTokenId,
          request: { weaponRowId: 'w-pistol', mode: 'single', modifier: 20 },
        });
        const card = attackCard(await message);
        if (!card?.hit || !ack.ok || !ack.data) continue;
        expect(card.system.halvesArmor).toBeUndefined();

        const damage = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
        await emitAck(player, 'character:roll', {
          characterId,
          request: { kind: 'damage', weaponRowId: 'w-pistol', attackMessageId: ack.data.messageId },
          visibility: 'public',
        });
        const rolledId = (await damage).message.id;
        const logged = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
        await emitAck(gm, 'damage:apply', { messageId: rolledId, tokenId: vestTokenId });
        const entry = (await logged).message.damage;
        if (!entry) throw new Error('brak wpisu obrażeń na karcie');
        expect(entry.armorHalved).toBeUndefined();
        return;
      }
      throw new Error('pistolet nie trafił w 40 próbach');
    });
  });

  describe('an Aimed Shot at a leg and at a held item', () => {
    let kneeCharacterId = '';
    let kneeTokenId = '';

    /**
     * Fires the rifle at the aim point until something lands, and applies it.
     *
     * `healLegBetweenTries` jest dla testu, który chce **zdrowej** nogi: ten sam
     * rzut obrażeń potrafi wylosować ranę z tabeli (dwie szóstki na 5k6 to około
     * jedna piąta strzałów), a korpus tej atrapy ma wyłącznie ósemkę — więc raz
     * na kilkadziesiąt przebiegów Celowanie trafiało w nogę już złamaną
     * i słusznie nie dokładało nic. Test obok chce dokładnie tej sytuacji, więc
     * ponawianie musi być na życzenie, nie domyślne.
     */
    async function shootAndApply(
      aimedAt: string,
      healLegBetweenTries = false,
    ): Promise<DamageLogEntry> {
      for (let attempt = 0; attempt < 40; attempt++) {
        await emitAck(player, 'weapon:reload', { characterId, weaponRowId: 'w-rifle' });
        const message = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
        const ack = await emitAck<{ messageId: number }>(player, 'attack:roll', {
          characterId,
          targetTokenId: kneeTokenId,
          attackerTokenId: shooterTokenId,
          // +20 buys the hit; the −8 of the aim is what this test is about.
          request: { weaponRowId: 'w-rifle', mode: 'single', aimedAt, modifier: 20 },
        });
        const card = attackCard(await message);
        if (!card?.hit || !ack.ok || !ack.data) continue;

        const damage = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
        await emitAck(player, 'character:roll', {
          characterId,
          request: { kind: 'damage', weaponRowId: 'w-rifle', attackMessageId: ack.data.messageId },
          visibility: 'public',
        });
        const rolledId = (await damage).message.id;
        const logged = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
        await emitAck(gm, 'damage:apply', { messageId: rolledId, tokenId: kneeTokenId });
        const entry = (await logged).message.damage;
        if (!entry) throw new Error('no damage entry on the card');
        // Ten sam rzut obrażeń potrafi wylosować ranę z tabeli (dwie szóstki na
        // 5k6 to około jedna piąta strzałów), a tabela tej atrapy ma w korpusie
        // wyłącznie ósemkę — więc raz na kilkadziesiąt przebiegów Celowanie
        // trafiało w nogę **już złamaną** i słusznie nie dokładało nic. To nie
        // regres reguły: wystarczy oddać celowi zdrową nogę i strzelić jeszcze
        // raz (migotanie znalezione 29.08, naprawione tutaj).
        if (healLegBetweenTries && !entry.injuryAimed && entry.aimNote) {
          await emitAck(gm, 'character:update', {
            characterId: kneeCharacterId,
            patch: { data: { criticalInjuries: [], hpCurrent: 35 } },
          });
          continue;
        }
        return entry;
      }
      throw new Error('nothing landed in 40 attempts');
    }

    it('sets the table: the eight of the body table, and somebody to shoot at', async () => {
      const ack = await emitAck(gm, 'compendium:upsert', {
        entry: {
          category: 'criticalInjury',
          name: 'Złamana noga',
          table: 'body',
          roll: 8,
          description: '-4 do Ruchu (minimum 1)',
          movePenalty: -4,
          quickFix: 'Ratownictwo medyczne PT 13',
        },
      });
      expect(ack.ok).toBe(true);

      const knee = data(
        await emitAck<CharacterView>(gm, 'character:create', { name: 'Kolano' }),
        'character:create',
      );
      kneeCharacterId = knee.id;
      // No armour at all: this suite is about what the aim costs, not about
      // whether a vest stops it — that half is `resolveCpredDamage`'s own test.
      await emitAck(gm, 'character:update', {
        characterId: kneeCharacterId,
        patch: { data: { stats: { ...(knee.data as CpredCharacterData).stats, dex: 2 } } },
      });
      kneeTokenId = data(
        await emitAck<TokenView>(gm, 'token:create', {
          sceneId,
          name: 'Kolano',
          x: 10 * PX_PER_M,
          y: 0,
          characterId: kneeCharacterId,
        }),
        'token:create',
      ).id;
      expect(kneeTokenId).toBeTruthy();
    });

    it('breaks the leg the shot was aimed at, by name rather than by 2k6', async () => {
      const entry = await shootAndApply('leg', true);
      expect(entry.aimedAt).toBe('Noga');
      expect(entry.injuryAimed?.name).toBe('Złamana noga');
      // „Jeśli przez pancerz na ciele celu przejdzie choć jeden punkt…” — the
      // armour is what this is measured against, so the hit lands on the body.
      expect(entry.location).toBe('body');

      const sheet = await sheetOf(kneeCharacterId);
      expect(sheet.criticalInjuries.some((row) => row.name === 'Złamana noga')).toBe(true);
      // Nobody rolled for it, so the sheet must not claim a 2k6 happened.
      const wound = sheet.criticalInjuries.find((row) => row.name === 'Złamana noga');
      expect(wound?.rolled).toBeUndefined();
      expect(wound?.movePenalty).toBe(-4);
    });

    it('stops at one leg: the second shot says so instead of breaking it again', async () => {
      const entry = await shootAndApply('leg');
      expect(entry.injuryAimed).toBeUndefined();
      expect(entry.aimNote).toContain('Złamana noga');

      const sheet = await sheetOf(kneeCharacterId);
      const broken = sheet.criticalInjuries.filter((row) => row.name === 'Złamana noga');
      expect(broken).toHaveLength(1);
    });

    it('knocks a held item loose with a sentence, and no wound', async () => {
      const before = await sheetOf(kneeCharacterId);
      const entry = await shootAndApply('heldItem');
      expect(entry.aimedAt).toBe('Trzymany przedmiot');
      expect(entry.aimNote).toContain('upuszcza');
      expect(entry.injuryAimed).toBeUndefined();

      const after = await sheetOf(kneeCharacterId);
      expect(after.criticalInjuries).toHaveLength(before.criticalInjuries.length);
    });
  });
  /**
   * Wykrycie słabości (etap 30a, s. 146): „+1 do obrażeń (przed uwzględnieniem
   * pancerza) zadanych pierwszym udanym Atakiem w Rundzie".
   *
   * Kartę ataku wypełnia planer całym przydziałem Solo; to serwer rozstrzyga,
   * czy ten cios na niego zasłużył — bo Runda jest stanem walki, nie karty.
   * Dlatego tu musi stać prawdziwa kolejka inicjatywy.
   */
  describe('Wykrycie słabości — pierwszy udany Atak w Rundzie', () => {
    /**
     * Strzela z ręki MG (nigdy nie odmawia mu budżetu) aż do trafienia.
     *
     * Przeładowanie w pętli, a nie przed nią: pistolet ma skończony magazynek,
     * a trzydzieści prób to więcej naboi, niż w nim jest. Bez tego test padał
     * raz na kilkanaście przebiegów z `NOT_ENOUGH_AMMO` i wyglądał jak regres
     * Wykrycia słabości — a mówił tylko o pechowej serii kości.
     */
    /**
     * Czeka na kafel **ataku**, a nie na pierwszą wiadomość czatu.
     *
     * W trwającej walce jeden strzał wysyła dwie: wpis dziennika Akcji
     * z trackera i dopiero potem kartę rzutu. `once('chat:message')` łapał tę
     * pierwszą, `roll.attack` był `undefined` i pętla wystrzeliwała cały
     * licznik, meldując „ani jednego trafienia" — a trafień było w bród.
     */
    function waitForAttackCard(ms = 3000): Promise<AttackCard | undefined> {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          gm.off('chat:message', onMessage);
          reject(new Error('chat:message timeout'));
        }, ms);
        const onMessage = (payload: ChatMessageBroadcast) => {
          const card = attackCard(payload);
          if (!card) return;
          clearTimeout(timer);
          gm.off('chat:message', onMessage);
          resolve(card);
        };
        gm.on('chat:message', onMessage);
      });
    }

    async function hitOnce(): Promise<AttackCard> {
      let refills = 0;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const message = waitForAttackCard();
        const ack = await emitAck<{ messageId: number }>(gm, 'attack:roll', {
          characterId,
          targetTokenId,
          attackerTokenId: shooterTokenId,
          request: { weaponRowId: 'w-pistol', mode: 'single' },
        });
        if (!ack.ok) {
          // Strzał, którego nie było, nie wyśle kafla — porzuconą obietnicę
          // trzeba wyciszyć, inaczej jej limit czasu wywróci cały przebieg.
          message.catch(() => {});
          if (ack.error !== 'NOT_ENOUGH_AMMO' || refills >= 6) {
            throw new Error(`attack:roll failed: ${JSON.stringify(ack)}`);
          }
          // Magazynek uzupełniany łatą karty, nie Przeładowaniem: trwa walka,
          // a `weapon:reload` kosztuje w niej Akcję i sam potrafi odmówić —
          // wtedy pętla dostrzeliwałaby pustym pistoletem do końca licznika.
          const sheet = await sheetOf(characterId);
          await emitAck(gm, 'character:update', {
            characterId,
            patch: {
              data: {
                weapons: sheet.weapons.map((weapon) =>
                  weapon.id === 'w-pistol' ? { ...weapon, ammoCurrent: weapon.ammoMax } : weapon,
                ),
              },
            },
          });
          refills += 1;
          attempt -= 1;
          continue;
        }
        const card = await message;
        if (card?.hit === true) return card;
      }
      throw new Error('30 strzałów i ani jednego trafienia');
    }

    it('daje bonus pierwszemu trafieniu Rundy i odbiera go drugiemu', async () => {
      await placeTargetAt(6);
      // Vex staje się Solo na czas tego testu — bez Roli nie ma czego rozdzielać.
      await emitAck(gm, 'character:update', {
        characterId,
        patch: { data: { roleId: 'solo', roleAbilityRank: 6 } },
      });
      const allocated = await emitAck(gm, 'character:combat-awareness', {
        characterId,
        allocation: { weakSpot: 3 },
      });
      expect(allocated.ok).toBe(true);

      const combat = data(
        await emitAck<CombatView>(gm, 'combat:start', {
          sceneId,
          tokenIds: [shooterTokenId, targetTokenId],
        }),
        'combat:start',
      );
      const shooterRow = combat.combatants.find((row) => row.tokenId === shooterTokenId);
      if (!shooterRow) throw new Error('shooter missing from tracker');
      await emitAck(gm, 'combat:set-initiative', { combatantId: shooterRow.id, initiative: 20 });
      const round1 = data(await emitAck<CombatView>(gm, 'combat:next', {}), 'combat:next');
      expect(round1.round).toBe(1);

      expect((await hitOnce()).system.weakSpot).toBe(3);
      expect((await hitOnce()).system.weakSpot).toBeUndefined();

      // Nowa Runda — i znowu należy się pierwszemu trafieniu.
      await emitAck<CombatView>(gm, 'combat:next', {});
      const round2 = data(await emitAck<CombatView>(gm, 'combat:next', {}), 'combat:next');
      expect(round2.round).toBe(2);
      expect((await hitOnce()).system.weakSpot).toBe(3);

      // Sprzątanie: reszta pliku strzela poza walką i nie chce tu kolejki.
      await emitAck(gm, 'combat:end', {});
      await emitAck(gm, 'character:combat-awareness', { characterId, allocation: {} });
      await emitAck(gm, 'character:update', { characterId, patch: { data: { roleId: null } } });
    });
  });
  /**
   * Dodatki do broni (etap 31, s. 342–344) — na prawdziwych gniazdach.
   *
   * Czysta logika ma własny plik w `shared`; tu sprawdzamy trzy rzeczy, których
   * tam nie widać: że montaż przepisuje magazynek z tabeli **na karcie**, że
   * strzał z broni podwieszanej opróżnia jej własny magazynek, a nie karabinu,
   * i że +1 smartguna zależy od chromu, którego serwer nie bierze z żądania.
   */
  describe('dodatki do broni', () => {
    const DRUM = 'attachment.sample-drum';
    const EXTENDED = 'attachment.sample-extended';
    const BAYONET = 'attachment.sample-bayonet';
    const UNDERBARREL = 'attachment.sample-underbarrel';
    const LINK = 'attachment.sample-link';

    interface MountResult {
      attachmentIds: string[];
      slotsFree: number;
      ammoMax: number;
      ammoCurrent: number;
    }

    async function mount(attachmentId: string, action: 'mount' | 'unmount' = 'mount') {
      return emitAck<MountResult>(player, 'weapon:attachment', {
        characterId,
        weaponRowId: 'w-rifle',
        attachmentId,
        action,
      });
    }

    async function rifleRow() {
      return (await sheetOf(characterId)).weapons.find((w) => w.id === 'w-rifle');
    }

    it('bęben przepisuje magazynek z tabeli i zajmuje jedno gniazdo', async () => {
      const result = data(await mount(DRUM), 'weapon:attachment');
      expect(result.attachmentIds).toEqual([DRUM]);
      // Karabin przykładowy: 25 → 45 w kolumnie „Bębnowy".
      expect(result.ammoMax).toBe(45);
      expect(result.slotsFree).toBe(2);
      const row = await rifleRow();
      expect(row?.ammoMax).toBe(45);
      expect(row?.attachmentIds).toEqual([DRUM]);
    });

    it('drugiego magazynka nie przyjmie', async () => {
      // „Do danej broni można doczepić tylko jeden magazynek naraz" (s. 343).
      expect(await mount(EXTENDED)).toEqual({ ok: false, error: 'ATTACHMENT_GROUP_TAKEN' });
    });

    it('tego samego dodatku nie przyjmie dwa razy', async () => {
      expect(await mount(DRUM)).toEqual({ ok: false, error: 'ATTACHMENT_ALREADY_FITTED' });
    });

    it('zdjęcie bębna oddaje magazynek i przycina to, co w nim zostało', async () => {
      await emitAck(player, 'weapon:reload', { characterId, weaponRowId: 'w-rifle' });
      expect((await rifleRow())?.ammoCurrent).toBe(45);
      const result = data(await mount(DRUM, 'unmount'), 'weapon:attachment');
      expect(result.ammoMax).toBe(25);
      // Dwadzieścia naboi poszło razem z bębnem — nie zostają w karabinie.
      expect(result.ammoCurrent).toBe(25);
      expect((await rifleRow())?.attachmentIds).toBeUndefined();
    });

    it('nie da się dokręcić dodatku do broni, której podręcznik nim nie obsługuje', async () => {
      // Kolec podlufowy pasuje do Broni długiej; „Zgrzyt 9" to pistolet.
      const ack = await emitAck(player, 'weapon:attachment', {
        characterId,
        weaponRowId: 'w-pistol',
        attachmentId: BAYONET,
        action: 'mount',
      });
      expect(ack).toEqual({ ok: false, error: 'ATTACHMENT_DOES_NOT_FIT' });
    });

    it('bagnetem bije się jak bronią białą, a magazynek karabinu stoi', async () => {
      data(await mount(BAYONET), 'weapon:attachment');
      const before = (await rifleRow())?.ammoCurrent;
      await placeTargetAt(1);
      const card = await attack({ weaponRowId: 'w-rifle', mode: 'single', attachmentId: BAYONET });
      expect(card.system.melee).toBe(true);
      // Ostrze przykładowe tnie przez połowę pancerza (s. 176).
      expect(card.system.halvesArmor).toBe(true);
      expect(card.system.attachmentName).toBe('Kolec podlufowy');
      expect(card.system.ammoCost).toBe(0);
      expect((await rifleRow())?.ammoCurrent).toBe(before);
      data(await mount(BAYONET, 'unmount'), 'weapon:attachment');
    });

    it('strzelba podwieszana strzela ze swojego magazynka, nie z karabinowego', async () => {
      const mounted = data(await mount(UNDERBARREL), 'weapon:attachment');
      // Dwa gniazda z trzech — „Zajmuje 2 gniazda na dodatki".
      expect(mounted.slotsFree).toBe(1);
      // Broń podwieszana przychodzi załadowana: nikt nie kupuje pustej.
      expect((await rifleRow())?.attachmentAmmo?.[UNDERBARREL]).toBe(2);

      const rifleAmmo = (await rifleRow())?.ammoCurrent;
      await placeTargetAt(6);
      const card = await attack({
        weaponRowId: 'w-rifle',
        mode: 'single',
        attachmentId: UNDERBARREL,
      });
      expect(card.system.ammoCost).toBe(1);
      expect(card.system.damage).toBe('5k6');
      const row = await rifleRow();
      expect(row?.attachmentAmmo?.[UNDERBARREL]).toBe(1);
      // Karabin nie stracił ani jednego naboju.
      expect(row?.ammoCurrent).toBe(rifleAmmo);
    });

    it('przeładowanie podwieszanej broni napełnia jej własny magazynek', async () => {
      const ack = data(
        await emitAck<{ ammo: number }>(player, 'weapon:reload', {
          characterId,
          weaponRowId: 'w-rifle',
          attachmentId: UNDERBARREL,
        }),
        'weapon:reload',
      );
      expect(ack.ammo).toBe(2);
      expect((await rifleRow())?.attachmentAmmo?.[UNDERBARREL]).toBe(2);
    });

    /**
     * Nabój broni podwieszanej (zaległość z 01.09, naprawiona 02.09).
     *
     * Do naprawy `weapon:reload` z `attachmentId` przyjmowało **samo**
     * `attachmentId`, a planer zerował profil naboju dla każdego strzału
     * dodatkiem — więc z granatnika podwieszanego nie dało się wystrzelić dymu
     * ani gazu. Trzy rzeczy są tu pilnowane: że nabój ma własne pole, że pasuje
     * się go do **broni podwieszanej**, nie do karabinu, i że strzał go czyta.
     */
    it('ładuje broń podwieszaną nabojem, który pasuje do niej, nie do karabinu', async () => {
      // „Nabój wachlarzowy" (shell) pasuje do strzelby podwieszanej i **nie**
      // pasuje do karabinu, który bierze wyłącznie kule — czyli sprawdzenie
      // musi iść po broni podwieszanej.
      const ack = data(
        await emitAck<{ ammo: number }>(player, 'weapon:reload', {
          characterId,
          weaponRowId: 'w-rifle',
          attachmentId: UNDERBARREL,
          ammoId: 'ammo.sample-shot',
        }),
        'weapon:reload',
      );
      expect(ack.ammo).toBe(2);
      const row = await rifleRow();
      expect(row?.attachmentAmmoId?.[UNDERBARREL]).toBe('ammo.sample-shot');
      // Komora karabinu nietknięta — to dwa magazynki i dwa naboje.
      expect(row?.ammoId).toBeUndefined();
    });

    it('strzał z podwieszanej niesie jej własny nabój na kartę', async () => {
      await placeTargetAt(4);
      const card = await attack({
        weaponRowId: 'w-rifle',
        mode: 'single',
        attachmentId: UNDERBARREL,
      });
      expect(card.system.ammo?.id).toBe('ammo.sample-shot');
      // Przeładowanie wróciło do dwóch, strzał zabrał jeden.
      expect((await rifleRow())?.attachmentAmmo?.[UNDERBARREL]).toBe(1);
    });

    it('odmawia naboju, który do broni podwieszanej nie pasuje', async () => {
      // Dymny jest granatem; strzelba podwieszana bierze kule i śrut.
      expect(
        await emitAck(player, 'weapon:reload', {
          characterId,
          weaponRowId: 'w-rifle',
          attachmentId: UNDERBARREL,
          ammoId: 'ammo.sample-smoke',
        }),
      ).toEqual({ ok: false, error: 'AMMO_MISMATCH' });
    });

    it('demontaż zabiera dodatkowi i magazynek, i załadowany nabój', async () => {
      data(await mount(UNDERBARREL, 'unmount'), 'weapon:attachment');
      const row = await rifleRow();
      expect(row?.attachmentAmmo?.[UNDERBARREL]).toBeUndefined();
      expect(row?.attachmentAmmoId?.[UNDERBARREL]).toBeUndefined();
    });

    it('smartgun daje +1 dopiero temu, kto ma się czym podpiąć', async () => {
      data(await mount(LINK), 'weapon:attachment');
      await placeTargetAt(10);

      /** Rozbicie rzutu z karty na czacie — jedyne miejsce, gdzie widać +1. */
      async function breakdownOfShot() {
        const message = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
        await emitAck(player, 'attack:roll', {
          characterId,
          targetTokenId,
          attackerTokenId: shooterTokenId,
          request: { weaponRowId: 'w-rifle', mode: 'single' },
        });
        return (await message).message.roll?.breakdown ?? [];
      }

      const bare = await breakdownOfShot();
      expect(bare.some((entry) => entry.label === 'Sprzęgło celownicze')).toBe(false);

      await emitAck(gm, 'character:update', {
        characterId,
        patch: {
          data: {
            cyberware: [{ id: 'cw-link', name: 'Sprzęg neuralny przykładowy', notes: '' }],
          },
        },
      });
      expect(await breakdownOfShot()).toContainEqual({
        label: 'Sprzęgło celownicze',
        value: 1,
        kind: 'situational',
      });

      // Sprzątanie: reszta pliku strzela bez chromu i bez dodatków.
      await emitAck(gm, 'character:update', { characterId, patch: { data: { cyberware: [] } } });
      data(await mount(LINK, 'unmount'), 'weapon:attachment');
    });
  });

  describe('jakość broni (s. 244)', () => {
    /** The sheet's pistol row as it stands right now. */
    async function pistolRow() {
      return (await sheetOf(characterId)).weapons.find((row) => row.id === 'w-pistol');
    }

    /** Marks the row jammed the way a Critical Failure would have. */
    async function jamPistol(): Promise<void> {
      const weapons = (await sheetOf(characterId)).weapons.map((row) =>
        row.id === 'w-pistol' ? { ...row, jammed: true } : row,
      );
      await emitAck(gm, 'character:update', { characterId, patch: { data: { weapons } } });
    }

    it('nie wypuszcza strzału z zaciętej broni', async () => {
      await placeTargetAt(4);
      await jamPistol();
      expect(
        await emitAck(player, 'attack:roll', {
          characterId,
          targetTokenId,
          attackerTokenId: shooterTokenId,
          request: { weaponRowId: 'w-pistol', mode: 'single' },
        }),
      ).toEqual({ ok: false, error: 'WEAPON_JAMMED' });
      // Zacięcie siedzi na tej broni, nie na postaci — karabin strzela dalej.
      expect((await attack({ weaponRowId: 'w-rifle', mode: 'single' })).hit).toBeDefined();
    });

    it('usuwa usterkę bez Testu i oddaje broń do użytku', async () => {
      expect((await pistolRow())?.jammed).toBe(true);
      expect(
        await emitAck(player, 'weapon:clear-jam', { characterId, weaponRowId: 'w-pistol' }),
      ).toEqual({ ok: true, data: { jammed: false } });
      expect((await pistolRow())?.jammed).toBeUndefined();
      expect((await attack({ weaponRowId: 'w-pistol', mode: 'single' })).hit).toBeDefined();
    });

    it('zacina broń niskiej jakości na Krytycznej Porażce, a doskonałej dodaje +1', async () => {
      // Dwie broni z tego samego typu, różniące się wyłącznie jakością.
      const base = (await sheetOf(characterId)).weapons;
      await emitAck(gm, 'character:update', {
        characterId,
        patch: {
          data: {
            weapons: [
              ...base,
              {
                id: 'w-rust',
                name: 'Zardzewiak',
                notes: '',
                compendiumId: 'weapon.zardzewiak',
                damage: '2k6',
                ammoCurrent: 10,
                ammoMax: 10,
                ammoType: '',
                rof: '2',
              },
              {
                id: 'w-fine',
                name: 'Iglica TW',
                notes: '',
                compendiumId: 'weapon.iglica-tw',
                damage: '2k6',
                ammoCurrent: 10,
                ammoMax: 10,
                ammoType: '',
                rof: '2',
              },
            ],
          },
        },
      });
      await placeTargetAt(4);

      // „+1 do Testów ataku" widać na rozbiciu karty, bez czekania na kości.
      const card = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
      await emitAck(player, 'attack:roll', {
        characterId,
        targetTokenId,
        attackerTokenId: shooterTokenId,
        request: { weaponRowId: 'w-fine', mode: 'single' },
      });
      expect((await card).message.roll?.breakdown).toContainEqual({
        label: 'Broń doskonałej jakości',
        value: 1,
        kind: 'situational',
      });

      // Zacięcie wymaga naturalnej jedynki — strzelamy, aż padnie. Kości są
      // prawdziwe (crypto RNG), więc pętla jest jedyną drogą; przy 10% na
      // strzał sto prób pudłuje raz na ~40 tysięcy przebiegów.
      let jammed = false;
      for (let shot = 0; shot < 100 && !jammed; shot += 1) {
        const weapons = (await sheetOf(characterId)).weapons.map((row) =>
          row.id === 'w-rust' ? { ...row, ammoCurrent: row.ammoMax } : row,
        );
        await emitAck(gm, 'character:update', { characterId, patch: { data: { weapons } } });
        await attack({ weaponRowId: 'w-rust', mode: 'single' });
        jammed =
          (await sheetOf(characterId)).weapons.find((row) => row.id === 'w-rust')?.jammed === true;
      }
      expect(jammed).toBe(true);

      // Sprzątanie: reszta pliku nie wie o tych dwóch wierszach.
      await emitAck(gm, 'character:update', { characterId, patch: { data: { weapons: base } } });
    });

    it('nie robi nic, gdy broń jest sprawna, i nie zna cudzych kart', async () => {
      expect(
        await emitAck(player, 'weapon:clear-jam', { characterId, weaponRowId: 'w-pistol' }),
      ).toEqual({ ok: true, data: { jammed: false } });
      expect(
        await emitAck(player, 'weapon:clear-jam', { characterId, weaponRowId: 'nie-ma-takiej' }),
      ).toEqual({ ok: false, error: 'UNKNOWN_WEAPON' });
    });
  });
});
