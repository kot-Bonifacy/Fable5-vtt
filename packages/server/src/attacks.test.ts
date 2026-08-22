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
  CpredCharacterData,
  InvitationSummary,
  RulerBroadcast,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenView,
  TokenUpsertBroadcast,
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

    /** The statist's stored profile, read back off a fresh sync. */
    async function profileOf(tokenId: string): Promise<Record<string, unknown>> {
      const sync = waitFor<StateSyncPayload>(gm, 'state:sync');
      await emitAck(gm, 'state:request');
      const token = (await sync).tokens.find((entry) => entry.id === tokenId);
      if (!token?.combatProfile) throw new Error('token carries no combat profile');
      return token.combatProfile as Record<string, unknown>;
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
      const ack = await emitAck<TokenView>(gm, 'token:update', {
        tokenId: statistTokenId,
        patch: { combatProfile: PROFILE },
      });
      expect(ack.ok).toBe(true);
      expect(await profileOf(statistTokenId)).toMatchObject({ ref: 7, armorSp: 11 });
    });

    it('repairs a profile the client sent out of range instead of refusing it', async () => {
      await emitAck(gm, 'token:update', {
        tokenId: statistTokenId,
        patch: { combatProfile: { ...PROFILE, ref: 99, ammoCurrent: 900 } },
      });
      const stored = await profileOf(statistTokenId);
      expect(stored.ref).toBe(10);
      expect(stored.ammoCurrent).toBe(10);
      await emitAck(gm, 'token:update', {
        tokenId: statistTokenId,
        patch: { combatProfile: PROFILE },
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
      const card = (await message).message.roll?.attack as AttackCard | undefined;
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
      expect(seen?.combatProfile ?? null).toBeNull();
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
      const card = (await message).message.roll?.attack as AttackCard | undefined;
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
      const rewritten = (await update).message.roll?.attack as AttackCard;
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
      await emitAck(gm, 'token:update', {
        tokenId: statistTokenId,
        patch: { combatProfile: { ...PROFILE, armorSp: 4 } },
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
  });

  it('rejects a malformed ruler line', async () => {
    const ack = await emitAck(player, 'ruler:update', {
      sceneId,
      points: [{ x: 0, y: 0 }],
    });
    expect(ack).toEqual({ ok: false, error: 'BAD_REQUEST' });
  });
});
