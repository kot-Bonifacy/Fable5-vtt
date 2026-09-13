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
  CpredAttackMeta,
  CpredCharacterData,
  DamageLogEntry,
  InvitationSummary,
  RollAreaMeta,
  RollResult,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenView,
  WallView,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Smoke tests of stage 42b on real sockets: a barrier's armour takes its share of
 * a shot and of a blast before the target's own armour does.
 *
 * What only the server can answer is asked here — the shared engine proves the
 * arithmetic (`damage.test.ts`, `walls-armor.test.ts`):
 *
 *  - the number is measured **when the shot is fired** and rides the cards all the
 *    way to „Zastosuj", never from a client;
 *  - „Zastosuj" moved onto somebody the attack never named measures the line
 *    **again**, from where the shooter stands now (decision of the GM, 13.09.2026);
 *  - a blast measures one line per figure and per car it reaches;
 *  - SP 0 and an open gate change nothing.
 *
 * The damage dice are random, so every expectation is written as the formula
 * the house rule gives, with a Critical Injury's +5 allowed for.
 *
 * The yard: one square is 100 px and 2 m, so a metre is 50 px, and a token's
 * middle sits half a square in from its corner.
 *
 *       x=0        300              600
 *   y=0  Vex ───── ║ F1 (OB 7) ──── Pancerny (kurtka OB 11)
 *   100            ║                Zza siatki
 *   200            ║
 *   250                        ┌──┐ Samochód
 *   600  Przechodzień          └──┘
 *
 * and, further out, the grenade yard round the square centred at (1450, 1050),
 * with a fence along x = 1500 (OB 5) between the crater and „Za".
 */

const TEST_DB = `./.test-${randomBytes(6).toString('hex')}.db`;
const GM_PASSWORD = 'test-haslo';
const CRIT_BONUS = 5;

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

/**
 * Resolves on the first chat message matching `match` — every broadcast reaches
 * both sockets, so a bare `once` could pick up one an earlier test left queued.
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

describe('barrier armour on shots and blasts (stage 42b)', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;
  let characterId: string;
  let armoredId: string;
  let shooterTokenId: string;
  let armoredTokenId: string;
  let passerbyTokenId: string;
  let fencedTokenId: string;
  let fenceId: number;
  let carId: number;

  interface AttackCard {
    hit?: boolean;
    detail: string;
    damageNotation?: string;
    area?: RollAreaMeta;
    system: CpredAttackMeta & { margin?: number; multiplier?: number };
  }

  /** Fires with a modifier that makes the hit certain; returns the card and its id. */
  async function fire(
    target: {
      targetTokenId?: string;
      targetCoverId?: number;
      targetPoint?: { x: number; y: number };
    },
    request: Record<string, unknown>,
  ): Promise<{ card: AttackCard; messageId: number }> {
    const message = waitForMessage(gm, (payload) => payload.message.roll?.attack !== undefined);
    const ack = await emitAck<AttackRollResult>(player, 'attack:roll', {
      characterId,
      attackerTokenId: shooterTokenId,
      ...target,
      request: { mode: 'single', modifier: 20, ...request },
    });
    if (!ack.ok) throw new Error(`attack:roll failed: ${JSON.stringify(ack)}`);
    const broadcast = await message;
    const card = broadcast.message.roll?.attack as unknown as AttackCard | undefined;
    if (!card) throw new Error('roll message carried no attack card');
    return { card, messageId: broadcast.message.id };
  }

  /** Rolls the damage an attack card offers and returns the stored roll. */
  async function rollDamage(
    weaponRowId: string,
    attackMessageId: number,
    modifier = 0,
  ): Promise<{ roll: RollResult; messageId: number }> {
    const message = waitForMessage(gm, (payload) => payload.message.roll?.damage !== undefined);
    data(
      await emitAck<{ messageId: number }>(player, 'character:roll', {
        characterId,
        request: {
          kind: 'damage',
          weaponRowId,
          attackMessageId,
          ...(modifier !== 0 ? { modifier } : {}),
        },
      }),
      'character:roll damage',
    );
    const broadcast = await message;
    return { roll: broadcast.message.roll!, messageId: broadcast.message.id };
  }

  /** Applies a stored damage roll to one figure or car and returns the log entry. */
  async function apply(
    messageId: number,
    target: { tokenId: string } | { coverId: number },
  ): Promise<DamageLogEntry> {
    const logged = waitForMessage(gm, (payload) => payload.message.damage !== undefined);
    data(
      await emitAck<{ messageId: number }>(gm, 'damage:apply', {
        messageId,
        ...target,
        ...('tokenId' in target ? { location: 'body' } : {}),
      }),
      'damage:apply',
    );
    return (await logged).message.damage!;
  }

  function damageOf(roll: RollResult): number {
    return roll.total * (roll.damage?.multiplier ?? 1);
  }

  function bonusOf(roll: RollResult): number {
    return roll.criticalDamage ? CRIT_BONUS : 0;
  }

  /** HP a figure without armour loses to `damage` through `barrierSp`. */
  function lossThrough(entry: DamageLogEntry, damage: number, barrierSp: number, bonus: number) {
    const before = entry.hp!.before;
    return Math.min(before, Math.max(0, damage - barrierSp) + bonus);
  }

  async function sheetOf(id: string): Promise<CpredCharacterData> {
    const sync = waitFor<StateSyncPayload>(gm, 'state:sync');
    await emitAck(gm, 'state:request');
    const character = (await sync).characters.find((c) => c.id === id);
    if (!character) throw new Error('character missing from sync');
    return character.data as CpredCharacterData;
  }

  async function moveToken(tokenId: string, x: number, y: number): Promise<void> {
    const ack = await emitAck(gm, 'token:move', { tokenId, x, y, final: true });
    if (!ack.ok) throw new Error(`token:move failed: ${ack.error}`);
  }

  async function statist(name: string, x: number, y: number): Promise<string> {
    return data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name,
        x,
        y,
        // Plenty, so no hit in this file is cut short by a figure running out.
        hp: { current: 400, max: 400 },
      }),
      'token:create',
    ).id;
  }

  it('sets the yard: a shooter, an armoured target, two bystanders, a fence and a car', async () => {
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
          skills: { handgun: 5, autofire: 4, athletics: 4, evasion: 3 },
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
          ],
        },
      },
    });

    const armored = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Pancerny' }),
      'character:create armored',
    );
    armoredId = armored.id;
    await emitAck(gm, 'character:update', {
      characterId: armoredId,
      patch: {
        data: {
          stats: { ...(armored.data as CpredCharacterData).stats, body: 8, will: 8 },
          hpCurrent: 50,
          armor: [
            {
              id: 'a-jacket',
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

    const scene = data(await emitAck<SceneView>(gm, 'scene:create', { name: 'Plac' }), 'scene');
    sceneId = scene.id;
    await emitAck(gm, 'scene:update', { sceneId, patch: { width: 4000, height: 3000 } });
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
      'token:create shooter',
    ).id;
    armoredTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Pancerny',
        x: 600,
        y: 0,
        characterId: armoredId,
      }),
      'token:create armored',
    ).id;
    passerbyTokenId = await statist('Przechodzień', 0, 600);
    fencedTokenId = await statist('Zza siatki', 600, 100);

    fenceId = data(
      await emitAck<WallView[]>(gm, 'wall:create', {
        sceneId,
        kind: 'barrier',
        armor: 7,
        points: [
          { x: 300, y: 0 },
          { x: 300, y: 200 },
        ],
      }),
      'wall:create fence',
    )[0]!.id;
    carId = data(
      await emitAck<CoverView>(gm, 'cover:create', {
        sceneId,
        typeId: 'car',
        x: 500,
        y: 250,
        width: 100,
        height: 100,
      }),
      'cover:create',
    ).id;

    // Enough to take the heaviest pistol hit below without bottoming out.
    expect((await sheetOf(armoredId)).hpCurrent).toBeGreaterThan(20);
  });

  it('keeps the armour on a barrier and a gate only, and refuses a malformed number', async () => {
    const created = data(
      await emitAck<WallView[]>(gm, 'wall:create', {
        sceneId,
        kind: 'wall',
        armor: 7,
        points: [
          { x: 3000, y: 2000 },
          { x: 3200, y: 2000 },
        ],
      }),
      'wall:create wall',
    )[0]!;
    // A wall has no armour to give — the number is not kept.
    expect(created.armor).toBe(0);
    await emitAck(gm, 'wall:delete', { wallId: created.id });

    expect(
      errorOf(
        await emitAck(gm, 'wall:create', {
          sceneId,
          kind: 'barrier',
          armor: -3,
          points: [
            { x: 3000, y: 2000 },
            { x: 3200, y: 2000 },
          ],
        }),
      ),
    ).toBe('BAD_REQUEST');
    expect(
      errorOf(await emitAck(gm, 'wall:update', { wallId: fenceId, patch: { armor: 7.5 } })),
    ).toBe('BAD_REQUEST');

    // Barrier ↔ gate keeps it; anything else loses it.
    const gate = data(
      await emitAck<WallView>(gm, 'wall:update', { wallId: fenceId, patch: { kind: 'gate' } }),
      'wall:update gate',
    );
    expect(gate.armor).toBe(7);
    const pane = data(
      await emitAck<WallView>(gm, 'wall:update', { wallId: fenceId, patch: { kind: 'window' } }),
      'wall:update window',
    );
    expect(pane.armor).toBe(0);
    const back = data(
      await emitAck<WallView>(gm, 'wall:update', {
        wallId: fenceId,
        patch: { kind: 'barrier', armor: 7 },
      }),
      'wall:update barrier',
    );
    expect(back).toMatchObject({ kind: 'barrier', armor: 7 });

    // A player never hears the number: walls do not reach them at all.
    expect(
      errorOf(await emitAck(player, 'wall:update', { wallId: fenceId, patch: { armor: 0 } })),
    ).toBe('FORBIDDEN');
  });

  it('20 through a fence of SP 7 into a jacket of SP 11 costs 2 HP and wears the jacket, not the fence', async () => {
    const { card, messageId } = await fire(
      { targetTokenId: armoredTokenId },
      { weaponRowId: 'w-pistol' },
    );
    expect(card.hit).toBe(true);
    expect(card.system.barrierSp).toBe(7);
    // Decision of the GM: the attack card itself says nothing about the fence.
    expect(card.detail).not.toContain('bariera');

    // 2k6 + 18 is 20 at the least — always past both layers, so the jacket wears.
    const { roll, messageId: damageId } = await rollDamage('w-pistol', messageId, 18);
    expect(roll.damage?.system?.barrierSp).toBe(7);
    const damage = damageOf(roll);
    expect(damage).toBeGreaterThanOrEqual(20);

    const before = await sheetOf(armoredId);
    const entry = await apply(damageId, { tokenId: armoredTokenId });
    const after = await sheetOf(armoredId);

    expect(entry.barrierSp).toBe(7);
    expect(entry.armorSp).toBe(11);
    expect(entry.damageThrough).toBe(damage - 7 - 11);
    expect(before.hpCurrent - after.hpCurrent).toBe(damage - 18 + bonusOf(roll));
    expect(after.armor.find((row) => row.id === 'a-jacket')?.spCurrent).toBe(10);
    expect(entry.armor).toMatchObject({ before: 11, after: 10 });

    const fence = await built.prisma.wall.findUniqueOrThrow({ where: { id: fenceId } });
    expect(fence.armor).toBe(7);
  });

  it('measures the line again when „Zastosuj" is moved onto somebody else', async () => {
    const { messageId } = await fire(
      { targetTokenId: armoredTokenId },
      { weaponRowId: 'w-pistol' },
    );
    const { roll, messageId: damageId } = await rollDamage('w-pistol', messageId, 18);
    const damage = damageOf(roll);
    const bonus = bonusOf(roll);

    // Straight down from the shooter: nothing in the way.
    const open = await apply(damageId, { tokenId: passerbyTokenId });
    expect(open.barrierSp).toBeUndefined();
    expect(open.hp!.before - open.hp!.after).toBe(lossThrough(open, damage, 0, bonus));

    // Behind the same fence as the target was.
    const fenced = await apply(damageId, { tokenId: fencedTokenId });
    expect(fenced.barrierSp).toBe(7);
    expect(fenced.hp!.before - fenced.hp!.after).toBe(lossThrough(fenced, damage, 7, bonus));

    // The shooter steps south, below the end of the fence: from where they stand
    // now the line to the same figure passes it by.
    await moveToken(shooterTokenId, 0, 300);
    const stepped = await apply(damageId, { tokenId: fencedTokenId });
    expect(stepped.barrierSp).toBeUndefined();
    await moveToken(shooterTokenId, 0, 0);
  });

  it('takes the fence off a car shot through it', async () => {
    const { card, messageId } = await fire({ targetCoverId: carId }, { weaponRowId: 'w-pistol' });
    expect(card.system.barrierSp).toBe(7);
    const { roll, messageId: damageId } = await rollDamage('w-pistol', messageId, 18);
    const entry = await apply(damageId, { coverId: carId });
    expect(entry.barrierSp).toBe(7);
    expect(entry.hp!.before - entry.hp!.after).toBe(Math.min(entry.hp!.before, damageOf(roll) - 7));
  });

  it('takes the fence off a burst once, not once per round', async () => {
    const { card, messageId } = await fire(
      { targetTokenId: fencedTokenId },
      { weaponRowId: 'w-rifle', mode: 'autofire' },
    );
    expect(card.system.barrierSp).toBe(7);
    const { roll, messageId: damageId } = await rollDamage('w-rifle', messageId);
    expect(roll.damage?.multiplier ?? 1).toBeGreaterThan(1);
    const entry = await apply(damageId, { tokenId: fencedTokenId });
    expect(entry.barrierSp).toBe(7);
    expect(entry.hp!.before - entry.hp!.after).toBe(
      lossThrough(entry, damageOf(roll), 7, bonusOf(roll)),
    );
  });

  it('adds up two fences and charges nothing for SP 0 or an open gate', async () => {
    const second = data(
      await emitAck<WallView[]>(gm, 'wall:create', {
        sceneId,
        kind: 'barrier',
        armor: 5,
        points: [
          { x: 500, y: 0 },
          { x: 500, y: 200 },
        ],
      }),
      'wall:create second fence',
    )[0]!;
    const twice = await fire({ targetTokenId: armoredTokenId }, { weaponRowId: 'w-pistol' });
    expect(twice.card.system.barrierSp).toBe(12);
    await emitAck(gm, 'wall:delete', { wallId: second.id });

    await emitAck(gm, 'wall:update', { wallId: fenceId, patch: { armor: 0 } });
    const zero = await fire({ targetTokenId: armoredTokenId }, { weaponRowId: 'w-pistol' });
    expect(zero.card.system.barrierSp).toBeUndefined();

    await emitAck(gm, 'wall:update', { wallId: fenceId, patch: { kind: 'gate', armor: 9 } });
    const shut = await fire({ targetTokenId: armoredTokenId }, { weaponRowId: 'w-pistol' });
    expect(shut.card.system.barrierSp).toBe(9);

    await emitAck(gm, 'opening:toggle', { wallId: fenceId, open: true });
    const open = await fire({ targetTokenId: armoredTokenId }, { weaponRowId: 'w-pistol' });
    expect(open.card.system.barrierSp).toBeUndefined();
    const { roll, messageId: damageId } = await rollDamage('w-pistol', open.messageId);
    expect(roll.damage?.system?.barrierSp).toBeUndefined();
    const entry = await apply(damageId, { tokenId: armoredTokenId });
    expect(entry.barrierSp).toBeUndefined();

    await emitAck(gm, 'opening:toggle', { wallId: fenceId, open: false });
    await emitAck(gm, 'wall:update', { wallId: fenceId, patch: { kind: 'barrier', armor: 7 } });
  });

  it('a grenade behind a fence of SP 5 costs the figure behind it 5 HP less than the one in front', async () => {
    // The grenade yard: the crater at (1450, 1050), „Przed" west of it in the
    // open, „Za" east of it behind a fence along x = 1500, and a car south-east
    // of the crater behind the same fence.
    await moveToken(shooterTokenId, 1000, 1000);
    const front = await statist('Przed', 1300, 1000);
    const behind = await statist('Za', 1600, 1000);
    const car = data(
      await emitAck<CoverView>(gm, 'cover:create', {
        sceneId,
        typeId: 'car',
        x: 1550,
        y: 1150,
        width: 100,
        height: 100,
      }),
      'cover:create yard car',
    );
    await emitAck(gm, 'wall:create', {
      sceneId,
      kind: 'barrier',
      armor: 5,
      points: [
        { x: 1500, y: 900 },
        { x: 1500, y: 1200 },
      ],
    });

    const { card, messageId } = await fire(
      { targetPoint: { x: 1450, y: 1050 } },
      { weaponRowId: 'w-grenade' },
    );
    expect(card.area?.centre).toEqual({ x: 1450, y: 1050 });
    const inFront = card.area?.targets.find((row) => row.tokenId === front);
    const behindRow = card.area?.targets.find((row) => row.tokenId === behind);
    const carRow = card.area?.targets.find((row) => row.coverId === car.id);
    expect(inFront).toBeDefined();
    expect(behindRow).toBeDefined();
    expect(carRow).toBeDefined();
    expect(inFront?.spared).toBeUndefined();
    expect(inFront?.barrierArmor).toBeUndefined();
    // The fence stops nothing — the figure behind it is still in the blast.
    expect(behindRow?.spared).toBeUndefined();
    expect(behindRow?.barrierArmor).toBe(5);
    expect(carRow?.barrierArmor).toBe(5);

    const { roll, messageId: damageId } = await rollDamage('w-grenade', messageId);
    const damage = damageOf(roll);
    expect(roll.damage?.areaTargets?.find((row) => row.tokenId === behind)?.barrierArmor).toBe(5);

    const hitFront = await apply(damageId, { tokenId: front });
    const hitBehind = await apply(damageId, { tokenId: behind });
    const lostFront = hitFront.hp!.before - hitFront.hp!.after;
    const lostBehind = hitBehind.hp!.before - hitBehind.hp!.after;
    expect(hitFront.barrierSp).toBeUndefined();
    expect(hitBehind.barrierSp).toBe(5);
    expect(lostFront - lostBehind).toBe(Math.min(5, damage));

    const hitCar = await apply(damageId, { coverId: car.id });
    expect(hitCar.barrierSp).toBe(5);
    expect(hitCar.hp!.before - hitCar.hp!.after).toBe(
      Math.min(hitCar.hp!.before, Math.max(0, damage - 5)),
    );
  });
});
