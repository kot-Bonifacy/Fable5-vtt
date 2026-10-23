import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  CampaignSummary,
  CharacterView,
  CombatView,
  CombatantView,
  CpredCharacterData,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenView,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { joinUrl } from './test-join.js';
import { paceTesting } from './realtime/pace.js';

paceTesting.off = true;

/**
 * Wrestling free of a Hold (audit 24.10.2026) — the two seams `grapple.test.ts`
 * did not reach:
 *
 *  - the escape is a test against the **holder** („Test Pochwycenia
 *    Atakującego”, s. 177), so a third party aiming it at the Held one is
 *    refused instead of rolling against the victim's own Bijatyka;
 *  - a stand-in DV that lost has already ended the Hold, and a holder who wins
 *    „Broń się” gets it back as it was, choke streak included.
 *
 * Determinism: the escaper beats any stand-in on merit (DEX 10 + Bijatyka 10
 * against 2 + 0 + 5 − 2), and the card's total is then rewritten in the
 * database so the holder's real roll wins (or loses) whatever the die says —
 * the test is about what the server does with the verdict, not about the dice.
 */

const TEST_DB = `./.test-${randomBytes(6).toString('hex')}.db`;
const GM_PASSWORD = 'test-haslo';
/** Default scene scale: 50 px per metre (grid cell of 100 px = 2 m). */
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
    payload: { login: 'MG', password: GM_PASSWORD },
  });
  gmCookie = cookieOf(login.headers['set-cookie']);

  const campaignRes = await built.app.inject({
    method: 'POST',
    url: '/api/campaigns',
    headers: { cookie: gmCookie },
    payload: { name: 'Kampania wyrywania' },
  });
  const campaignId = (campaignRes.json() as CampaignSummary).id;

  const joinRes = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, campaignId, 'Vex'),
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

describe('wrestling free of a Hold', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let vexId: string;
  let thugId: string;
  let rookId: string;
  let vexTok: string;
  let thugTok: string;
  let rookTok: string;

  async function tracker(): Promise<CombatView> {
    const sync = waitFor<StateSyncPayload>(gm, 'state:sync');
    await emitAck(gm, 'state:request');
    const fresh = (await sync).combat;
    if (!fresh) throw new Error('no combat in sync');
    return fresh;
  }

  function rowOf(view: CombatView, tokenId: string): CombatantView {
    const row = view.combatants.find((c) => c.tokenId === tokenId);
    if (!row) throw new Error('combatant missing from tracker');
    return row;
  }

  async function giveTurnTo(tokenId: string): Promise<void> {
    for (let step = 0; step < 12; step += 1) {
      const view = data(await emitAck<CombatView>(gm, 'combat:next', {}), 'combat:next');
      if (view.activeCombatantId === rowOf(view, tokenId).id) return;
    }
    throw new Error('turn never reached that participant');
  }

  /** The thug holds Vex, two Rounds into a choke — written straight to the rows. */
  async function holdVexByThug(): Promise<void> {
    const view = await tracker();
    await built.prisma.combatant.updateMany({ data: { grappledById: null } });
    await built.prisma.combatant.update({
      where: { id: rowOf(view, vexTok).id },
      data: { grappledById: rowOf(view, thugTok).id, chokeStreak: 2, chokeRound: view.round },
    });
  }

  /** Rewrites the escaper's total on a stored card — the dice are not the point. */
  async function setCardTotal(messageId: number, total: number): Promise<void> {
    const stored = await built.prisma.chatMessage.findUniqueOrThrow({ where: { id: messageId } });
    await built.prisma.chatMessage.update({
      where: { id: messageId },
      data: { payload: JSON.stringify({ ...JSON.parse(stored.payload!), total }) },
    });
  }

  async function escape(): Promise<number> {
    return data(
      await emitAck<{ messageId: number }>(player, 'grapple:attempt', {
        characterId: vexId,
        attackerTokenId: vexTok,
        targetTokenId: thugTok,
        intent: 'escape',
      }),
      'grapple:attempt',
    ).messageId;
  }

  async function sheet(name: string, dex: number, brawling: number, ownerId?: string) {
    const created = data(
      await emitAck<CharacterView>(gm, 'character:create', ownerId ? { name, ownerId } : { name }),
      'character:create',
    );
    await emitAck(gm, 'character:update', {
      characterId: created.id,
      patch: {
        data: {
          stats: { ...(created.data as CpredCharacterData).stats, dex },
          skills: { brawling },
        },
      },
    });
    return created.id;
  }

  it('sets the table: Vex Held by the thug, Rook next to both', async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);

    vexId = await sheet('Vex', 10, 10, playerId);
    thugId = await sheet('Bandzior', 2, 0);
    rookId = await sheet('Rook', 10, 10);

    const scene = data(await emitAck<SceneView>(gm, 'scene:create', { name: 'Zaułek' }), 'scene');
    await emitAck(gm, 'scene:update', { sceneId: scene.id, patch: { playerMove: 'explore' } });
    await emitAck(gm, 'scene:visibility', { sceneId: scene.id, visibility: 'open' });
    const activated = waitFor(player, 'scene:activate');
    await emitAck(gm, 'scene:activate', { sceneId: scene.id });
    await activated;

    const token = async (
      name: string,
      x: number,
      y: number,
      characterId: string,
      ownerId?: string,
    ): Promise<string> =>
      data(
        await emitAck<TokenView>(gm, 'token:create', {
          sceneId: scene.id,
          name,
          x,
          y,
          characterId,
          ...(ownerId ? { ownerId } : {}),
        }),
        'token:create',
      ).id;
    vexTok = await token('Vex', 0, 0, vexId, playerId);
    thugTok = await token('Bandzior', 2 * PX_PER_M, 0, thugId);
    // Within 2 m of both — a rescuer.
    rookTok = await token('Rook', PX_PER_M, PX_PER_M, rookId);

    const combat = data(
      await emitAck<CombatView>(gm, 'combat:start', {
        sceneId: scene.id,
        tokenIds: [vexTok, thugTok, rookTok],
      }),
      'combat:start',
    );
    let initiative = 20;
    for (const tokenId of [vexTok, thugTok, rookTok]) {
      await emitAck(gm, 'combat:set-initiative', {
        combatantId: rowOf(combat, tokenId).id,
        initiative,
      });
      initiative -= 5;
    }
    await holdVexByThug();
  });

  it('refuses a rescue aimed at the Held one — the test is against the holder', async () => {
    await giveTurnTo(rookTok);
    const ack = await emitAck(gm, 'grapple:attempt', {
      characterId: rookId,
      attackerTokenId: rookTok,
      targetTokenId: vexTok,
      intent: 'escape',
    });
    expect(ack).toEqual({ ok: false, error: 'ESCAPE_TARGETS_HOLDER' });
    expect(rowOf(await tracker(), vexTok).grapple?.role).toBe('defender');
  });

  it('gives the Hold back, streak and all, when the holder wins „Broń się”', async () => {
    await holdVexByThug();
    await giveTurnTo(vexTok);
    const messageId = await escape();
    // The stand-in lost: Vex is free for now.
    expect(rowOf(await tracker(), vexTok).grapple).toBeUndefined();

    await setCardTotal(messageId, -100);
    const answered = data(
      await emitAck<{ total: number; won: boolean }>(gm, 'grapple:resist', {
        messageId,
        characterId: thugId,
      }),
      'grapple:resist',
    );
    expect(answered.won).toBe(false);

    const grapple = rowOf(await tracker(), vexTok).grapple;
    expect(grapple?.role).toBe('defender');
    expect(grapple?.chokeStreak).toBe(2);
  });

  it('keeps Vex free when the holder answers and still loses', async () => {
    await holdVexByThug();
    await giveTurnTo(vexTok);
    const messageId = await escape();
    // DEX 2 + Bijatyka 0 cannot reach 100, exploding die or not.
    await setCardTotal(messageId, 100);
    const answered = data(
      await emitAck<{ total: number; won: boolean }>(gm, 'grapple:resist', {
        messageId,
        characterId: thugId,
      }),
      'grapple:resist',
    );
    expect(answered.won).toBe(true);
    expect(rowOf(await tracker(), vexTok).grapple).toBeUndefined();
  });

  it('ends the fight cleanly', async () => {
    const ended = await emitAck(gm, 'combat:end', {});
    expect(ended.ok).toBe(true);
  });
});
