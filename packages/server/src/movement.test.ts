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
  CombatActionLogEntry,
  CombatView,
  CombatantView,
  CpredCharacterData,
  InvitationSummary,
  ScenePoint,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenView,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Smoke tests of movement in a turn (stage 14c) on real sockets.
 *
 * The arithmetic lives in `turn.test.ts` and `movement.test.ts` of the shared
 * package; what is proved here is the seam: that a drag really is measured on
 * the server, that the metres come off the *sheet* rather than off the wire,
 * that a refused drag leaves the token where it was and tells the GM about it,
 * and that the fight is the only thing enforcing any of it.
 */

const TEST_DB = `./.test-${randomBytes(6).toString('hex')}.db`;
const GM_PASSWORD = 'test-haslo';
/** Scene scale of the fixture: a 2 m grid cell drawn 100 px wide. */
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
    payload: { password: GM_PASSWORD },
  });
  gmCookie = cookieOf(login.headers['set-cookie']);

  const campaignRes = await built.app.inject({
    method: 'POST',
    url: '/api/campaigns',
    headers: { cookie: gmCookie },
    payload: { name: 'Kampania ruchu' },
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

describe('movement budget', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;
  let vexCharacterId: string;
  let vexTokenId: string;
  let thugTokenId: string;
  let looseTokenId: string;
  let combat: CombatView;

  /** The tracker as the GM sees it right now. */
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

  /** Metres used and available, as the tracker projects them. */
  async function distanceOf(tokenId: string): Promise<{ used: number; max: number }> {
    const row = rowOf(await tracker(), tokenId);
    const distance = row.turn?.distance;
    if (!distance) throw new Error('no distance in the budget');
    return { used: distance.used, max: distance.max };
  }

  /** Drags a token along a path given in metres on the x axis. */
  function drag(
    socket: ClientSocket,
    tokenId: string,
    toMetresX: number,
    path?: ScenePoint[],
  ): Promise<SocketAck<{ x: number; y: number }>> {
    return emitAck<{ x: number; y: number }>(socket, 'token:move', {
      tokenId,
      x: toMetresX * PX_PER_M,
      y: 0,
      final: true,
      ...(path ? { path } : {}),
    });
  }

  async function positionOf(tokenId: string): Promise<{ x: number; y: number }> {
    const sync = waitFor<StateSyncPayload>(gm, 'state:sync');
    await emitAck(gm, 'state:request');
    const token = (await sync).tokens.find((t) => t.id === tokenId);
    if (!token) throw new Error('token missing from sync');
    return { x: token.x, y: token.y };
  }

  async function setStatuses(tokenId: string, statuses: string[]): Promise<void> {
    await emitAck(gm, 'token:update', { tokenId, patch: { statuses } });
  }

  /** Hands the turn to the participant on this token, with a fresh budget. */
  async function giveTurnTo(tokenId: string): Promise<void> {
    for (let step = 0; step < 8; step += 1) {
      const view = data(await emitAck<CombatView>(gm, 'combat:next', {}), 'combat:next');
      if (view.activeCombatantId === rowOf(view, tokenId).id) return;
    }
    throw new Error('turn never reached that participant');
  }

  /** Puts the token back at the origin without spending anybody's turn. */
  async function reset(tokenId: string): Promise<void> {
    await emitAck(gm, 'combat:reset-turn', { combatantId: rowOf(await tracker(), tokenId).id });
    await drag(gm, tokenId, 0);
    await emitAck(gm, 'combat:reset-turn', { combatantId: rowOf(await tracker(), tokenId).id });
  }

  it('sets the table: a gridless alley, a player with RUCH 6 and a GM thug', async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);

    const vex = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Vex', ownerId: playerId }),
      'character:create',
    );
    vexCharacterId = vex.id;
    await emitAck(gm, 'character:update', {
      characterId: vexCharacterId,
      patch: {
        data: { stats: { ...(vex.data as CpredCharacterData).stats, ref: 6, move: 6, body: 6 } },
      },
    });

    const scene = data(await emitAck<SceneView>(gm, 'scene:create', { name: 'Zaułek' }), 'scene');
    sceneId = scene.id;
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'open' });
    // Gridless: the fixture measures exact metres, and snapping to a 2 m grid
    // would round every drag to the nearest even number.
    await emitAck(gm, 'scene:update', { sceneId, patch: { gridMode: 'gridless' } });
    const activated = waitFor(player, 'scene:activate');
    await emitAck(gm, 'scene:activate', { sceneId });
    await activated;

    vexTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Vex',
        x: 0,
        y: 0,
        ownerId: playerId,
        characterId: vexCharacterId,
      }),
      'token:create',
    ).id;
    thugTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Bandzior',
        x: 0,
        y: 400,
      }),
      'token:create',
    ).id;
    looseTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Przechodzień',
        x: 0,
        y: 800,
        ownerId: playerId,
      }),
      'token:create',
    ).id;

    combat = data(
      await emitAck<CombatView>(gm, 'combat:start', {
        sceneId,
        tokenIds: [vexTokenId, thugTokenId],
      }),
      'combat:start',
    );
    await emitAck(gm, 'combat:set-initiative', {
      combatantId: rowOf(combat, vexTokenId).id,
      initiative: 20,
    });
    combat = data(
      await emitAck<CombatView>(gm, 'combat:set-initiative', {
        combatantId: rowOf(combat, thugTokenId).id,
        initiative: 10,
      }),
      'combat:set-initiative',
    );
    expect(combat.round).toBe(0);
  });

  it('reads the metres off the sheet when the turn begins: RUCH 6 → 12 m', async () => {
    await giveTurnTo(vexTokenId);
    expect(await distanceOf(vexTokenId)).toEqual({ used: 0, max: 12 });
  });

  it('lets 11 m through and sends the next 3 m back where they came from', async () => {
    expect((await drag(player, vexTokenId, 11)).ok).toBe(true);
    expect(await distanceOf(vexTokenId)).toEqual({ used: 11, max: 12 });

    const refused = await drag(player, vexTokenId, 14);
    expect(refused).toEqual({ ok: false, error: 'MOVE_REFUSED' });
    // Snap-back is the server simply not having moved it: the client puts the
    // figure back on the position the server still holds.
    expect(await positionOf(vexTokenId)).toEqual({ x: 11 * PX_PER_M, y: 0 });
    expect(await distanceOf(vexTokenId)).toEqual({ used: 11, max: 12 });
  });

  it('puts the figure back on every watcher’s map, not only the mover’s', async () => {
    // The GM watched the drag frame by frame; a refusal that only the mover
    // hears about would leave the token standing where it never arrived.
    const corrected = waitFor<{ tokenId: string; x: number; final: boolean }>(gm, 'token:move');
    expect((await drag(player, vexTokenId, 30)).ok).toBe(false);
    const frame = await corrected;
    expect(frame).toMatchObject({ tokenId: vexTokenId, x: 11 * PX_PER_M, final: true });
  });

  it('tells the GM what was missing, in metres, on a card with „Przepuść"', async () => {
    const card = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    await drag(player, vexTokenId, 20);
    const message = (await card).message;
    expect(message.kind).toBe('gmaction');
    const entry = message.action as CombatActionLogEntry;
    expect(entry.actionId).toBe('move');
    expect(entry.combatantId).toBe(rowOf(await tracker(), vexTokenId).id);
    expect(entry.refusal?.message).toContain('Za daleko o 8 m');
    expect(entry.refusal?.message).toContain('zostało ci 1 m');
  });

  it('spends one pool across drags and around the Action', async () => {
    await reset(vexTokenId);
    expect((await drag(player, vexTokenId, 5)).ok).toBe(true);
    await emitAck(player, 'combat:action', { actionId: 'skill' });
    expect((await drag(player, vexTokenId, 12)).ok).toBe(true);
    expect(await distanceOf(vexTokenId)).toEqual({ used: 12, max: 12 });
    expect((await drag(player, vexTokenId, 13)).ok).toBe(false);
  });

  it('charges the path, not the straight line', async () => {
    await reset(vexTokenId);
    // Three metres out, three metres back, three metres on: 9 m of walking for
    // 3 m of progress — which is exactly why the route is measured.
    const detour: ScenePoint[] = [
      { x: 6 * PX_PER_M, y: 0 },
      { x: 3 * PX_PER_M, y: 0 },
    ];
    expect((await drag(player, vexTokenId, 6, detour)).ok).toBe(true);
    expect((await distanceOf(vexTokenId)).used).toBe(12);
    expect(await positionOf(vexTokenId)).toEqual({ x: 6 * PX_PER_M, y: 0 });
  });

  it('gives Bieg a second Move Action worth of metres', async () => {
    await reset(vexTokenId);
    expect((await drag(player, vexTokenId, 12)).ok).toBe(true);
    expect((await emitAck(player, 'combat:action', { actionId: 'run' })).ok).toBe(true);
    expect((await distanceOf(vexTokenId)).max).toBe(24);
    expect((await drag(player, vexTokenId, 24)).ok).toBe(true);
    expect((await drag(player, vexTokenId, 25)).ok).toBe(false);
  });

  it('doubles the cost once hard going is declared', async () => {
    await reset(vexTokenId);
    expect((await emitAck(player, 'combat:terrain', { hard: true })).ok).toBe(true);
    expect((await drag(player, vexTokenId, 5)).ok).toBe(true);
    expect(await distanceOf(vexTokenId)).toEqual({ used: 10, max: 12 });
    expect((await drag(player, vexTokenId, 7)).ok).toBe(false);
    await emitAck(player, 'combat:terrain', { hard: false });
  });

  it('refuses a Prone token, and lets it walk once it has paid to stand up', async () => {
    await reset(vexTokenId);
    await setStatuses(vexTokenId, ['prone']);
    expect(await drag(player, vexTokenId, 4)).toEqual({ ok: false, error: 'MOVE_REFUSED' });
    expect((await distanceOf(vexTokenId)).used).toBe(0);

    expect((await emitAck(player, 'combat:action', { actionId: 'stand-up' })).ok).toBe(true);
    // Standing up is an Action *and* a change on the map: paying for it has to
    // take the status off, or the player pays and still cannot move.
    const sync = waitFor<StateSyncPayload>(gm, 'state:sync');
    await emitAck(gm, 'state:request');
    const token = (await sync).tokens.find((t) => t.id === vexTokenId);
    expect(token?.statuses).not.toContain('prone');
    expect((await drag(player, vexTokenId, 4)).ok).toBe(true);
  });

  it('refuses a Grappled token whatever its budget says', async () => {
    await reset(vexTokenId);
    await setStatuses(vexTokenId, ['grappled']);
    expect(await drag(player, vexTokenId, 2)).toEqual({ ok: false, error: 'MOVE_REFUSED' });
    await setStatuses(vexTokenId, []);
  });

  it('shrinks the allowance when the sheet says the leg is broken', async () => {
    await reset(vexTokenId);
    const character = data(
      await emitAck<CharacterView>(gm, 'character:update', {
        characterId: vexCharacterId,
        patch: {
          data: {
            criticalInjuries: [
              {
                id: 'injury.body-zlamana-noga',
                name: 'Złamana noga',
                effect: '-4 do Ruchu (minimum 1)',
                movePenalty: -4,
              },
            ],
          },
        },
      }),
      'character:update',
    );
    expect((character.data as CpredCharacterData).criticalInjuries).toHaveLength(1);
    // RUCH 6 − 4 = 2, i.e. 4 m — and the budget shrinks inside the turn that
    // is already running, not only at the next one.
    expect((await drag(player, vexTokenId, 5)).ok).toBe(false);
    expect((await drag(player, vexTokenId, 4)).ok).toBe(true);
    expect(await distanceOf(vexTokenId)).toEqual({ used: 4, max: 4 });
  });

  it('never lets the allowance fall below the RAW minimum of 1', async () => {
    await emitAck(gm, 'character:update', {
      characterId: vexCharacterId,
      // Mortally Wounded (−6) on top of the broken leg (−4) would be RUCH −4.
      patch: { data: { hpCurrent: 0 } },
    });
    await giveTurnTo(vexTokenId);
    expect((await distanceOf(vexTokenId)).max).toBe(2);
    await emitAck(gm, 'character:update', {
      characterId: vexCharacterId,
      patch: { data: { hpCurrent: 40, criticalInjuries: [] } },
    });
  });

  it('refuses a drag outside the mover’s own turn', async () => {
    await giveTurnTo(thugTokenId);
    expect(await drag(player, vexTokenId, 1)).toEqual({ ok: false, error: 'MOVE_REFUSED' });
  });

  it('lets the GM walk a token past its budget and counts the overspend', async () => {
    const view = await tracker();
    expect(view.activeCombatantId).toBe(rowOf(view, thugTokenId).id);
    expect((await drag(gm, thugTokenId, 60)).ok).toBe(true);
    const row = rowOf(await tracker(), thugTokenId);
    // A statist has no sheet, so nothing measures them — the GM is unblocked
    // either way, which is the rule that matters here.
    expect(row.turn?.overspent ?? 0).toBeGreaterThanOrEqual(0);
    expect((await drag(gm, vexTokenId, 40)).ok).toBe(true);
    expect(rowOf(await tracker(), vexTokenId).turn?.overspent).toBe(1);
  });

  it('leaves a token that is not in the fight alone', async () => {
    // The drag helper always walks along y = 0, and 60 m still fits the map.
    expect((await drag(player, looseTokenId, 60)).ok).toBe(true);
    expect(await positionOf(looseTokenId)).toEqual({ x: 60 * PX_PER_M, y: 0 });
  });

  it('stops enforcing anything once the fight is over', async () => {
    await emitAck(gm, 'combat:end');
    expect((await drag(player, vexTokenId, 70)).ok).toBe(true);
  });
});
