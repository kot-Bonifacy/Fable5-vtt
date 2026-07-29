import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  CampaignSummary,
  CharacterUpsertBroadcast,
  CharacterView,
  ChatMessageBroadcast,
  CpredCharacterData,
  InvitationSummary,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenUpsertBroadcast,
  TokenView,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Stage 08 smoke tests: sheet-driven rolls (permissions, wound penalty, Luck)
 * and the token ↔ character link (HP flowing both ways, visibility).
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
  // Deliberately absent: tests run on the committed sample compendium,
  // which is also the "fresh clone without data/private" path.
  dataPrivateDir: resolve(import.meta.dirname, 'fixtures/no-private-data'),
  // The gateway is never reachable in these suites — bots stay unavailable.
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
let vexCookie: string;
let vexId: string;
let rogueCookie: string;
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

/**
 * Waits for the first matching event. The GM receives both the public
 * (HP-less) and the private copy of a token upsert — tests want the latter.
 */
function waitForMatch<T>(
  socket: ClientSocket,
  event: string,
  matches: (payload: T) => boolean,
  ms = 3000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, listener);
      reject(new Error(`${event} timeout`));
    }, ms);
    const listener = (payload: T) => {
      if (!matches(payload)) return;
      clearTimeout(timer);
      socket.off(event, listener);
      resolve(payload);
    };
    socket.on(event, listener);
  });
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

async function roundTrip(socket: ClientSocket): Promise<StateSyncPayload> {
  const sync = waitFor<StateSyncPayload>(socket, 'state:sync');
  await emitAck(socket, 'state:request');
  return sync;
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
    payload: { name: 'Kampania rzutów' },
  });
  const campaignId = (campaignRes.json() as CampaignSummary).id;

  const inviteRes = await built.app.inject({
    method: 'POST',
    url: `/api/campaigns/${campaignId}/invitations`,
    headers: { cookie: gmCookie },
    payload: {},
  });
  const token = (inviteRes.json() as InvitationSummary).token;

  const joinVex = await built.app.inject({
    method: 'POST',
    url: `/api/join/${token}`,
    payload: { name: 'Vex' },
  });
  vexCookie = cookieOf(joinVex.headers['set-cookie']);
  vexId = (joinVex.json() as { user: { id: string } }).user.id;

  const joinRogue = await built.app.inject({
    method: 'POST',
    url: `/api/join/${token}`,
    payload: { name: 'Rogue' },
  });
  rogueCookie = cookieOf(joinRogue.headers['set-cookie']);
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

describe('sheet rolls', () => {
  let gm: ClientSocket;
  let vex: ClientSocket;
  let rogue: ClientSocket;
  let characterId: string;
  /** Every chat message Rogue's socket ever receives — leak detector. */
  const rogueChatTraffic: ChatMessageBroadcast[] = [];

  it('sets up a character owned by Vex', async () => {
    const gmConn = createSocket(gmCookie);
    const vexConn = createSocket(vexCookie);
    const rogueConn = createSocket(rogueCookie);
    gm = gmConn.socket;
    vex = vexConn.socket;
    rogue = rogueConn.socket;
    rogue.on('chat:message', (payload: ChatMessageBroadcast) => rogueChatTraffic.push(payload));
    await Promise.all([gmConn.firstSync, vexConn.firstSync, rogueConn.firstSync]);

    const ack = await emitAck<CharacterView>(gm, 'character:create', {
      name: 'Forty',
      ownerId: vexId,
    });
    if (!ack.ok || !ack.data) throw new Error('character:create failed');
    characterId = ack.data.id;

    const stats = (ack.data.data as CpredCharacterData).stats;
    const updated = await emitAck<CharacterView>(gm, 'character:update', {
      characterId,
      patch: {
        data: {
          stats: { ...stats, int: 7, luck: 6 },
          // Raising the maximum never refills the pool — set it explicitly.
          luckCurrent: 6,
          skills: { perception: 4 },
        },
      },
    });
    if (!updated.ok || !updated.data) throw new Error('character:update failed');
    const data = updated.data.data as CpredCharacterData;
    expect(data.stats.int).toBe(7);
    expect(data.luckCurrent).toBe(6);
  });

  it('rolls a skill: 1d10 + stat + level, with the breakdown on the chat card', async () => {
    const gmMessage = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    const rogueMessage = waitFor<ChatMessageBroadcast>(rogue, 'chat:message');
    const ack = await emitAck<{ messageId: number }>(vex, 'character:roll', {
      characterId,
      visibility: 'public',
      request: { kind: 'skill', skillId: 'perception' },
    });
    expect(ack.ok).toBe(true);

    const broadcast = await gmMessage;
    const roll = broadcast.message.roll;
    expect(roll).toBeDefined();
    if (!roll) return;
    expect(roll.actor).toBe('Forty');
    expect(roll.title).toBe('Percepcja (INT)');
    expect(roll.notation).toBe('1d10+11'); // INT 7 + Percepcja 4
    expect(roll.breakdown).toEqual([
      { label: 'Inteligencja (INT)', value: 7, kind: 'stat' },
      { label: 'Percepcja', value: 4, kind: 'skill' },
    ]);
    // The server rolled it: total = die (+ crit/fumble extra) + 11.
    const die = (roll.terms[0] as { rolls: number[] }).rolls[0]!;
    const extra = roll.critical
      ? roll.critical.type === 'crit'
        ? roll.critical.extraRoll
        : -roll.critical.extraRoll
      : 0;
    expect(roll.total).toBe(die + extra + 11);
    // A public roll reaches every player.
    expect((await rogueMessage).message.id).toBe(broadcast.message.id);
  });

  it('refuses to roll someone else’s character (stage criterion)', async () => {
    const ack = await emitAck(rogue, 'character:roll', {
      characterId,
      visibility: 'public',
      request: { kind: 'skill', skillId: 'perception' },
    });
    expect(ack).toEqual({ ok: false, error: 'CHARACTER_NOT_FOUND' });
  });

  it('applies the wound penalty automatically and shows it in the breakdown', async () => {
    // 35 HP max → 17 left is at or below half: seriously wounded (−2).
    const wounded = await emitAck<CharacterView>(vex, 'character:update', {
      characterId,
      patch: { data: { hpCurrent: 17 } },
    });
    expect(wounded.ok).toBe(true);

    const gmMessage = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    await emitAck(vex, 'character:roll', {
      characterId,
      visibility: 'public',
      request: { kind: 'skill', skillId: 'perception' },
    });
    const roll = (await gmMessage).message.roll;
    expect(roll?.breakdown).toContainEqual({
      label: 'Poważnie ranny',
      value: -2,
      kind: 'wound',
    });
    expect(roll?.notation).toBe('1d10+9');

    await emitAck(vex, 'character:update', { characterId, patch: { data: { hpCurrent: 35 } } });
  });

  it('spends Luck from the pool and rejects overspending', async () => {
    const upsert = waitFor<CharacterUpsertBroadcast>(gm, 'character:upsert');
    const ack = await emitAck(vex, 'character:roll', {
      characterId,
      visibility: 'public',
      request: { kind: 'stat', statId: 'cool', modifier: 2, luckSpent: 3 },
    });
    expect(ack.ok).toBe(true);

    const data = (await upsert).character.data as CpredCharacterData;
    expect(data.luckCurrent).toBe(3); // 6 − 3

    const tooMuch = await emitAck(vex, 'character:roll', {
      characterId,
      visibility: 'public',
      request: { kind: 'stat', statId: 'cool', luckSpent: 99 },
    });
    expect(tooMuch).toEqual({ ok: false, error: 'NOT_ENOUGH_LUCK' });

    const badModifier = await emitAck(vex, 'character:roll', {
      characterId,
      visibility: 'public',
      request: { kind: 'stat', statId: 'cool', modifier: 999 },
    });
    expect(badModifier).toEqual({ ok: false, error: 'BAD_MODIFIER' });
  });

  it('keeps a private sheet roll away from other players', async () => {
    await roundTrip(rogue); // flush anything still in flight
    const before = rogueChatTraffic.length;
    const gmMessage = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    const ack = await emitAck(vex, 'character:roll', {
      characterId,
      visibility: 'gm',
      request: { kind: 'stat', statId: 'ref' },
    });
    expect(ack.ok).toBe(true);
    expect((await gmMessage).message.kind).toBe('gmroll');

    // Flush Rogue's socket: anything in flight would have arrived by now.
    await roundTrip(rogue);
    expect(rogueChatTraffic).toHaveLength(before);
    const rogueSync = await roundTrip(rogue);
    expect(rogueSync.messages.some((m) => m.kind === 'gmroll')).toBe(false);
  });
});

describe('token ↔ character link', () => {
  let gm: ClientSocket;
  let vex: ClientSocket;
  let rogue: ClientSocket;
  let characterId: string;
  let tokenId: string;

  it('links a token to a sheet: the bar mirrors the sheet’s HP', async () => {
    const gmConn = createSocket(gmCookie);
    const vexConn = createSocket(vexCookie);
    const rogueConn = createSocket(rogueCookie);
    gm = gmConn.socket;
    vex = vexConn.socket;
    rogue = rogueConn.socket;
    await Promise.all([gmConn.firstSync, vexConn.firstSync, rogueConn.firstSync]);

    const character = await emitAck<CharacterView>(gm, 'character:create', {
      name: 'Mover',
      ownerId: vexId,
    });
    if (!character.ok || !character.data) throw new Error('character:create failed');
    characterId = character.data.id;
    const stats = (character.data.data as CpredCharacterData).stats;
    await emitAck(gm, 'character:update', {
      characterId,
      patch: { data: { stats: { ...stats, body: 7, will: 6 }, hpCurrent: 40 } },
    });

    const scene = await emitAck<SceneView>(gm, 'scene:create', { name: 'Magazyn' });
    if (!scene.ok || !scene.data) throw new Error('scene:create failed');
    // Stage 17: a fresh scene starts under fog, which would hide these
    // tokens from the player. This suite is not about fog — light it up.
    await emitAck(gm, 'scene:visibility', { sceneId: scene.data.id, visibility: 'open' });
    const activated = waitFor(vex, 'scene:activate');
    await emitAck(gm, 'scene:activate', { sceneId: scene.data.id });
    await activated;

    const token = await emitAck<TokenView>(gm, 'token:create', {
      sceneId: scene.data.id,
      name: 'Mover',
      x: 200,
      y: 200,
      ownerId: vexId,
      characterId,
    });
    if (!token.ok || !token.data) throw new Error('token:create failed');
    tokenId = token.data.id;
    // hpMax(7,6) = 10 + 5*ceil(13/2) = 45; current from the sheet.
    expect(token.data.hp).toEqual({ current: 40, max: 45 });
    expect(token.data.characterId).toBe(characterId);
  });

  it('delivers HP and the link only to the GM and the sheet’s owner', async () => {
    const vexSync = await roundTrip(vex);
    const vexToken = vexSync.tokens.find((t) => t.id === tokenId);
    expect(vexToken?.hp).toEqual({ current: 40, max: 45 });
    expect(vexToken?.characterId).toBe(characterId);

    const rogueSync = await roundTrip(rogue);
    const rogueToken = rogueSync.tokens.find((t) => t.id === tokenId);
    expect(rogueToken).toBeDefined();
    expect(rogueToken && 'hp' in rogueToken).toBe(false);
    expect(rogueToken && 'characterId' in rogueToken).toBe(false);
  });

  it('a GM quick HP change on the token writes through to the sheet', async () => {
    const sheetUpdate = waitFor<CharacterUpsertBroadcast>(vex, 'character:upsert');
    const ack = await emitAck<TokenView>(gm, 'token:update', {
      tokenId,
      patch: { hp: { current: 22, max: 45 } },
    });
    expect(ack.ok).toBe(true);
    expect(ack.ok && ack.data?.hp).toEqual({ current: 22, max: 45 });

    const data = (await sheetUpdate).character.data as CpredCharacterData;
    expect(data.hpCurrent).toBe(22);
  });

  it('a sheet HP change refreshes the token bar on the map', async () => {
    const tokenUpsert = waitForMatch<TokenUpsertBroadcast>(
      gm,
      'token:upsert',
      (payload) => payload.token.id === tokenId && payload.token.hp !== undefined,
    );
    await emitAck(vex, 'character:update', { characterId, patch: { data: { hpCurrent: 9 } } });
    const view = (await tokenUpsert).token;
    expect(view.id).toBe(tokenId);
    expect(view.hp).toEqual({ current: 9, max: 45 });
  });

  it('rejects linking a token to a character from another campaign', async () => {
    const ack = await emitAck(gm, 'token:update', {
      tokenId,
      patch: { characterId: 'nie-istnieje' },
    });
    expect(ack).toEqual({ ok: false, error: 'CHARACTER_NOT_FOUND' });
  });

  it('deleting the character unlinks the token and falls back to its own HP', async () => {
    const tokenUpsert = waitForMatch<TokenUpsertBroadcast>(
      gm,
      'token:upsert',
      (payload) => payload.token.id === tokenId && payload.token.hp !== undefined,
    );
    await emitAck(gm, 'character:delete', { characterId });
    const view = (await tokenUpsert).token;
    expect(view.id).toBe(tokenId);
    expect(view.characterId).toBeNull();
    expect(view.hp).toBeNull();
  });
});
