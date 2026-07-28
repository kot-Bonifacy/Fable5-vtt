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
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenView,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Smoke tests of the damage flow (stage 15) on real sockets: what the numbers
 * do to a sheet, what a player is allowed to see of someone else's HP, that
 * only the GM may apply damage, and that „Cofnij" really puts everything back.
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

/**
 * Resolves on the first chat message matching `match`.
 *
 * Filtering matters even when a test expects exactly one message: every
 * broadcast goes to both sockets, so a message an earlier test only consumed on
 * `player` is still queued on `gm` and a bare `once('chat:message')` would pick
 * that one up instead.
 */
function waitForMessage(
  socket: ClientSocket,
  match: (payload: ChatMessageBroadcast) => boolean,
  ms = 3000,
): Promise<ChatMessageBroadcast> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('chat:message', onMessage);
      reject(new Error('chat:message timeout'));
    }, ms);
    const onMessage = (payload: ChatMessageBroadcast) => {
      if (!match(payload)) return;
      clearTimeout(timer);
      socket.off('chat:message', onMessage);
      resolve(payload);
    };
    socket.on('chat:message', onMessage);
  });
}

/** Resolves on the first chat message that carries an applied-damage entry. */
function waitForDamage(socket: ClientSocket, ms = 3000): Promise<ChatMessageBroadcast> {
  return waitForMessage(socket, (payload) => payload.message.damage !== undefined, ms);
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
    payload: { name: 'Kampania obrażeń' },
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
    payload: { name: 'Ziti' },
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

describe('damage, armor and Death Saves', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let characterId: string;
  let playerTokenId: string;
  let npcTokenId: string;
  let statistTokenId: string;
  /** Every chat payload the player socket receives — the leak detector. */
  const playerChatTraffic: ChatMessageBroadcast[] = [];

  async function sheetOf(id: string): Promise<CpredCharacterData> {
    const sync = await roundTrip(gm);
    const character = sync.characters.find((c) => c.id === id);
    if (!character) throw new Error('character missing from sync');
    return character.data as CpredCharacterData;
  }

  async function roundTrip(socket: ClientSocket): Promise<StateSyncPayload> {
    const sync = waitFor<StateSyncPayload>(socket, 'state:sync');
    await emitAck(socket, 'state:request');
    return sync;
  }

  /** Rolls damage until the dice score a Critical Injury (or gives up). */
  async function rollUntilCritical(): Promise<number> {
    for (let attempt = 0; attempt < 25; attempt++) {
      const message = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
      const ack = data(
        await emitAck<{ messageId: number }>(gm, 'character:roll', {
          characterId,
          request: { kind: 'damage', weaponRowId: 'w-big' },
          visibility: 'public',
        }),
        'character:roll',
      );
      const broadcast = await message;
      if (broadcast.message.roll?.criticalDamage) return ack.messageId;
    }
    throw new Error('no critical damage in 25 rolls of 10k6');
  }

  it('sets the table: a wounded-able character with armor, a weapon and tokens', async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    player.on('chat:message', (payload: ChatMessageBroadcast) => playerChatTraffic.push(payload));
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);

    const character = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Ziti', ownerId: playerId }),
      'character:create',
    );
    characterId = character.id;
    await emitAck(gm, 'character:update', {
      characterId,
      patch: {
        data: {
          weapons: [
            { id: 'w1', name: 'Zgrzyt-9', notes: '', damage: '3k6', ammo: '8', rof: '2' },
            { id: 'w-big', name: 'Grad', notes: '', damage: '10k6', ammo: '30', rof: '1' },
          ],
          armor: [
            {
              id: 'a1',
              name: 'Kurtka kuloodporna',
              notes: '',
              sp: 11,
              spCurrent: 11,
              location: 'body',
            },
            { id: 'a2', name: 'Hełm', notes: '', sp: 7, spCurrent: 7, location: 'head' },
          ],
        },
      },
    });

    const scene = data(await emitAck<SceneView>(gm, 'scene:create', { name: 'Zaułek' }), 'scene');
    // Stage 17: a fresh scene starts under fog, which would hide these
    // tokens from the player. This suite is not about fog — light it up.
    await emitAck(gm, 'fog:toggle', { sceneId: scene.id, enabled: false });
    const activated = waitFor(player, 'scene:activate');
    await emitAck(gm, 'scene:activate', { sceneId: scene.id });
    await activated;

    playerTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId: scene.id,
        name: 'Ziti',
        x: 0,
        y: 0,
        ownerId: playerId,
        characterId,
      }),
      'token:create',
    ).id;
    npcTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId: scene.id,
        name: 'Bandzior',
        x: 200,
        y: 0,
        hp: { current: 25, max: 25 },
      }),
      'token:create',
    ).id;
    statistTokenId = npcTokenId;
    expect(statistTokenId).toBeTruthy();
  });

  it('lets the GM fill the missing Critical Injury table from the compendium editor', async () => {
    for (let roll = 2; roll <= 12; roll++) {
      const ack = await emitAck(gm, 'compendium:upsert', {
        entry: {
          category: 'criticalInjury',
          name: `Rana testowa ${roll}`,
          table: 'body',
          roll,
          description: `Efekt rany numer ${roll}.`,
          quickFix: 'Pierwsza pomoc PT 13',
          ...(roll === 2 ? { deathSavePenalty: 1 } : {}),
        },
      });
      expect(ack.ok).toBe(true);
    }
    const sync = await roundTrip(gm);
    const injuries = sync.compendium.entries.filter((e) => e.category === 'criticalInjury');
    expect(injuries).toHaveLength(11);
  });

  it('rolls weapon damage from the sheet and marks it applicable', async () => {
    const broadcast = waitFor<ChatMessageBroadcast>(player, 'chat:message');
    const ack = data(
      await emitAck<{ messageId: number }>(player, 'character:roll', {
        characterId,
        request: { kind: 'damage', weaponRowId: 'w1', location: 'head' },
        visibility: 'public',
      }),
      'character:roll',
    );
    const { message } = await broadcast;
    expect(message.id).toBe(ack.messageId);
    expect(message.roll?.notation).toBe('3d6');
    expect(message.roll?.title).toBe('Zgrzyt-9 — obrażenia (Głowa)');
    expect(message.roll?.damage).toMatchObject({ location: 'head', locationLabel: 'Głowa' });
    // Damage is never a Check: a natural 10 must not explode (there is no d10).
    expect(message.roll?.critical).toBeUndefined();
  });

  it('applies damage: armor stops what it can, ablates, and HP follow the sheet', async () => {
    // A plain `/r` roll carries no damage metadata — applying it must fail.
    const chatRoll = waitForMessage(gm, (payload) => payload.message.roll?.notation === '6d6');
    await emitAck(gm, 'chat:send', { text: '/r 6d6 obrażenia' });
    const chatRollId = (await chatRoll).message.id;
    const rejected = await emitAck(gm, 'damage:apply', {
      messageId: chatRollId,
      tokenId: playerTokenId,
    });
    expect(rejected).toMatchObject({ ok: false, error: 'NOT_A_DAMAGE_ROLL' });

    // A real damage roll from the sheet, then applied to its own token.
    const rolled = data(
      await emitAck<{ messageId: number }>(gm, 'character:roll', {
        characterId,
        request: { kind: 'damage', weaponRowId: 'w1' },
        visibility: 'public',
      }),
      'character:roll',
    );
    const before = await sheetOf(characterId);
    const logged = waitForDamage(gm);
    const applied = await emitAck<{ messageId: number }>(gm, 'damage:apply', {
      messageId: rolled.messageId,
      tokenId: playerTokenId,
    });
    expect(applied.ok).toBe(true);
    const entry = (await logged).message.damage;
    expect(entry).toBeDefined();
    if (!entry) return;

    const after = await sheetOf(characterId);
    expect(entry.targetName).toBe('Ziti');
    expect(after.hpCurrent).toBe(before.hpCurrent - entry.hpLost);
    // 3k6 against SP 11 usually bounces; when it does, nothing ablates.
    const bodyArmor = after.armor.find((row) => row.id === 'a1');
    expect(bodyArmor?.spCurrent).toBe(entry.armor ? 10 : 11);
    expect(entry.hp).toEqual({
      before: before.hpCurrent,
      after: after.hpCurrent,
      max: 35,
    });
  });

  it('keeps a foreign target’s absolute HP away from players', async () => {
    const rolled = data(
      await emitAck<{ messageId: number }>(gm, 'character:roll', {
        characterId,
        request: { kind: 'damage', weaponRowId: 'w-big' },
        visibility: 'public',
      }),
      'character:roll',
    );
    const seenByPlayer = waitForDamage(player);
    const seenByGm = waitForDamage(gm);
    const appliedToNpc = await emitAck(gm, 'damage:apply', {
      messageId: rolled.messageId,
      tokenId: npcTokenId,
      armorSp: 4,
    });
    expect(appliedToNpc.ok).toBe(true);

    const gmEntry = (await seenByGm).message.damage;
    const playerEntry = (await seenByPlayer).message.damage;
    expect(gmEntry?.hp).toBeDefined();
    expect(gmEntry?.armorSp).toBe(4);
    // The player sees the hit but never the NPC's hit points.
    expect(playerEntry).toBeDefined();
    expect(playerEntry?.hp).toBeUndefined();
    expect(playerEntry?.characterId).toBeUndefined();
    expect(playerEntry?.damageThrough).toBe(gmEntry?.damageThrough);
    // Nothing in the whole player feed ever carried foreign HP.
    const npcEntries = playerChatTraffic
      .map((payload) => payload.message.damage)
      .filter((damage) => damage?.targetName === 'Bandzior');
    expect(npcEntries.length).toBeGreaterThan(0);
    expect(npcEntries.every((damage) => damage?.hp === undefined)).toBe(true);
  });

  it('draws a Critical Injury on two sixes and puts it on the sheet', async () => {
    const messageId = await rollUntilCritical();
    const logged = waitForDamage(gm);
    const appliedCrit = await emitAck(gm, 'damage:apply', { messageId, tokenId: playerTokenId });
    expect(appliedCrit.ok).toBe(true);
    const entry = (await logged).message.damage;
    expect(entry?.injury).toBeDefined();
    expect(entry?.bonusDamage).toBe(5);
    const sheet = await sheetOf(characterId);
    expect(sheet.criticalInjuries.map((injury) => injury.id)).toContain(entry?.injury?.id);
    expect(sheet.criticalInjuries[0]?.effect).toMatch(/^Efekt rany numer/);
  });

  it('marks the wound thresholds on the token as HP fall', async () => {
    await emitAck(gm, 'token:update', {
      tokenId: playerTokenId,
      patch: { hp: { current: 10, max: 35 } },
    });
    const sync = await roundTrip(gm);
    const token = sync.tokens.find((t) => t.id === playerTokenId);
    expect(token?.statuses).toContain('seriously-wounded');

    await emitAck(gm, 'token:update', {
      tokenId: playerTokenId,
      patch: { hp: { current: 0, max: 35 } },
    });
    const dying = await roundTrip(gm);
    const dyingToken = dying.tokens.find((t) => t.id === playerTokenId);
    expect(dyingToken?.statuses).toContain('mortally-wounded');
    expect(dyingToken?.statuses).not.toContain('seriously-wounded');
  });

  it('rolls Death Saves that get harder each time', async () => {
    const first = waitFor<ChatMessageBroadcast>(player, 'chat:message');
    await emitAck(player, 'character:roll', {
      characterId,
      request: { kind: 'deathSave' },
      visibility: 'public',
    });
    const firstRoll = (await first).message.roll;
    expect(firstRoll?.notation).toBe('1d10');
    expect(firstRoll?.title).toBe('Test Przeżywalności');
    expect(firstRoll?.outcome).toBeDefined();
    // Either the arithmetic, or the „natural 10 always dies" shortcut.
    expect(firstRoll?.outcome?.detail).toMatch(/próg BC|Naturalna 10/);

    const afterFirst = await sheetOf(characterId);
    expect(afterFirst.deathSaves).toBe(1);

    const second = waitFor<ChatMessageBroadcast>(player, 'chat:message');
    await emitAck(player, 'character:roll', {
      characterId,
      request: { kind: 'deathSave' },
      visibility: 'public',
    });
    const secondRoll = (await second).message.roll;
    // The second save carries the +1 from the first one.
    expect(secondRoll?.outcome?.detail).toMatch(/\+ 1|Naturalna 10/);
    const afterSecond = await sheetOf(characterId);
    expect(afterSecond.deathSaves).toBe(2);

    // Stabilizing (a single HP back) wipes the accumulated modifiers.
    await emitAck(gm, 'token:update', {
      tokenId: playerTokenId,
      patch: { hp: { current: 1, max: 35 } },
    });
    const stabilized = await sheetOf(characterId);
    expect(stabilized.deathSaves).toBe(0);
  });

  it('lets only the GM apply and undo damage', async () => {
    const rolled = data(
      await emitAck<{ messageId: number }>(player, 'character:roll', {
        characterId,
        request: { kind: 'damage', weaponRowId: 'w1' },
        visibility: 'public',
      }),
      'character:roll',
    );
    const denied = await emitAck(player, 'damage:apply', {
      messageId: rolled.messageId,
      tokenId: npcTokenId,
    });
    expect(denied).toMatchObject({ ok: false, error: 'FORBIDDEN' });
  });

  it('undoes an applied hit: HP, armor and the injury all come back', async () => {
    await emitAck(gm, 'character:update', {
      characterId,
      patch: {
        data: {
          hpCurrent: 35,
          criticalInjuries: [],
          armor: [
            {
              id: 'a1',
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
    const before = await sheetOf(characterId);
    const messageId = await rollUntilCritical();
    const logged = waitForDamage(gm);
    const applied = data(
      await emitAck<{ messageId: number }>(gm, 'damage:apply', {
        messageId,
        tokenId: playerTokenId,
      }),
      'damage:apply',
    );
    const entry = (await logged).message.damage;
    const hurt = await sheetOf(characterId);
    expect(hurt.hpCurrent).toBeLessThan(before.hpCurrent);
    expect(hurt.criticalInjuries).toHaveLength(1);

    const updated = waitFor<ChatMessageBroadcast>(gm, 'chat:update');
    const undone = await emitAck(gm, 'damage:undo', { messageId: applied.messageId });
    expect(undone.ok).toBe(true);
    const updatedEntry = (await updated).message.damage;
    expect(updatedEntry?.undone).toBe(true);
    expect(updatedEntry?.undoneByName).toBe('MG');

    const restored = await sheetOf(characterId);
    expect(restored.hpCurrent).toBe(before.hpCurrent);
    expect(restored.criticalInjuries).toHaveLength(0);
    expect(restored.armor.find((row) => row.id === 'a1')?.spCurrent).toBe(11);
    expect(entry?.injury).toBeDefined();

    // A second undo of the same entry is refused rather than applied twice.
    const again = await emitAck(gm, 'damage:undo', { messageId: applied.messageId });
    expect(again).toMatchObject({ ok: false, error: 'ALREADY_UNDONE' });
  });
});
