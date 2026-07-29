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
  CpredCharacterData,
  InvitationSummary,
  RulerBroadcast,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenView,
} from '@vtt/shared';
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
    system: Record<string, unknown>;
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
    const broadcast = await message;
    const card = broadcast.message.roll?.attack as AttackCard | undefined;
    if (!card) throw new Error('roll message carried no attack card');
    return card;
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
      const card = broadcast.message.roll?.attack as AttackCard | undefined;
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
    const card = (await message).message.roll?.attack as AttackCard;
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
    const rewritten = (await update).message.roll?.attack as AttackCard;
    expect(rewritten.detail).toContain('Unik Ganger');
    expect(rewritten.hit).toBe(evaded.hit);

    // The dodge is a one-off: a second try must not re-roll it.
    const again = await emitAck(gm, 'attack:evade', {
      messageId: ack.messageId,
      characterId: defender.id,
    });
    expect(again).toEqual({ ok: false, error: 'ALREADY_EVADED' });
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

  it('rejects a malformed ruler line', async () => {
    const ack = await emitAck(player, 'ruler:update', {
      sceneId,
      points: [{ x: 0, y: 0 }],
    });
    expect(ack).toEqual({ ok: false, error: 'BAD_REQUEST' });
  });
});
