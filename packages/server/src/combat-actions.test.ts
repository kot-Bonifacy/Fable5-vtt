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
  CombatView,
  CombatantView,
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
 * Smoke tests of the action economy (stage 14b) on real sockets.
 *
 * What is being proved here is not arithmetic — `turn.test.ts` covers the
 * rules — but the *seam*: that a player's third attack really is refused over
 * the wire, that the GM's own NPC really is not, that „przepuść" really does
 * let one attempt through, and that a reconnect brings the spent budget back
 * rather than a fresh turn.
 */

const TEST_DB = `./.test-${randomBytes(6).toString('hex')}.db`;
const GM_PASSWORD = 'test-haslo';
/** Default scene scale: 100 px per metre grid cell of 2 m (see stage 04). */
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
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), 3000);
    const ack = (response: SocketAck<T>) => {
      clearTimeout(timer);
      resolve(response);
    };
    if (payload === undefined) socket.emit(event, ack);
    else socket.emit(event, payload, ack);
  });
}

/** Unwraps an ack that must have succeeded. */
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
    payload: { name: 'Kampania akcji' },
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

describe('action economy', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;
  let vexCharacterId: string;
  let thugCharacterId: string;
  let vexTokenId: string;
  let thugTokenId: string;
  let targetTokenId: string;
  let combat: CombatView;

  const weapons = (extra: Record<string, unknown>[] = []) => [
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
    ...extra,
  ];

  /** One attack from a socket; resolves with the ack (refusals included). */
  function attack(
    socket: ClientSocket,
    characterId: string,
    attackerTokenId: string,
    request: Record<string, unknown>,
  ): Promise<SocketAck<{ messageId: number }>> {
    return emitAck<{ messageId: number }>(socket, 'attack:roll', {
      characterId,
      targetTokenId,
      attackerTokenId,
      request,
    });
  }

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

  type Spent = { used: number; max: number };

  /** „Ruch"/„Akcja"/„Ataki" of a participant, as numbers. */
  function budget(row: CombatantView): Record<string, Spent> {
    const out: Record<string, Spent> = {};
    for (const resource of row.turn?.resources ?? []) {
      out[resource.id] = { used: resource.used, max: resource.max };
    }
    return out;
  }

  /** One named resource of a participant — fails loudly when it is missing. */
  function spent(row: CombatantView, id: string): Spent {
    const found = budget(row)[id];
    if (!found) throw new Error(`no „${id}" in the budget`);
    return found;
  }

  /** Hands the turn to the participant on this token, with a fresh budget. */
  async function giveTurnTo(tokenId: string): Promise<void> {
    for (let step = 0; step < 8; step += 1) {
      const view = data(await emitAck<CombatView>(gm, 'combat:next', {}), 'combat:next');
      if (view.activeCombatantId === rowOf(view, tokenId).id) return;
    }
    throw new Error('turn never reached that participant');
  }

  it('sets the table: a player, a GM thug and a target to shoot at', async () => {
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
        data: {
          stats: { ...(vex.data as CpredCharacterData).stats, ref: 6, dex: 5, tech: 6 },
          skills: { handgun: 5, 'shoulder-arms': 4, 'melee-weapon': 4, paramedic: 6 },
          weapons: weapons(),
        },
      },
    });

    const thug = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Bandzior' }),
      'character:create',
    );
    thugCharacterId = thug.id;
    await emitAck(gm, 'character:update', {
      characterId: thugCharacterId,
      patch: {
        data: {
          stats: { ...(thug.data as CpredCharacterData).stats, ref: 4 },
          skills: { handgun: 3 },
          weapons: weapons(),
        },
      },
    });

    const scene = data(await emitAck<SceneView>(gm, 'scene:create', { name: 'Zaułek' }), 'scene');
    sceneId = scene.id;
    // Stage 17: a fresh scene starts under fog, which would hide the target.
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'open' });
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
        x: 4 * PX_PER_M,
        y: 0,
        characterId: thugCharacterId,
      }),
      'token:create',
    ).id;
    targetTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Kurier',
        x: 8 * PX_PER_M,
        y: 0,
        hp: { current: 30, max: 30 },
      }),
      'token:create',
    ).id;

    combat = data(
      await emitAck<CombatView>(gm, 'combat:start', {
        sceneId,
        tokenIds: [vexTokenId, thugTokenId, targetTokenId],
      }),
      'combat:start',
    );
    // Fixed order, so „whose turn is it" never depends on a die: 20 / 10 / 5.
    await emitAck(gm, 'combat:set-initiative', {
      combatantId: rowOf(combat, vexTokenId).id,
      initiative: 20,
    });
    await emitAck(gm, 'combat:set-initiative', {
      combatantId: rowOf(combat, thugTokenId).id,
      initiative: 10,
    });
    combat = data(
      await emitAck<CombatView>(gm, 'combat:set-initiative', {
        combatantId: rowOf(combat, targetTokenId).id,
        initiative: 5,
      }),
      'combat:set-initiative',
    );
    expect(combat.round).toBe(0);
  });

  it('hands out a fresh budget when a turn begins', async () => {
    await giveTurnTo(vexTokenId);
    const view = await tracker();
    expect(view.round).toBe(1);
    expect(budget(rowOf(view, vexTokenId))).toEqual({
      move: { used: 0, max: 1 },
      action: { used: 0, max: 1 },
      attacks: { used: 0, max: 2 },
    });
  });

  it('fits exactly two attacks of an LA 2 weapon into one Action, then refuses', async () => {
    const first = await attack(player, vexCharacterId, vexTokenId, {
      weaponRowId: 'w-pistol',
      mode: 'single',
    });
    expect(first.ok).toBe(true);
    const second = await attack(player, vexCharacterId, vexTokenId, {
      weaponRowId: 'w-pistol',
      mode: 'single',
    });
    expect(second.ok).toBe(true);

    const third = await attack(player, vexCharacterId, vexTokenId, {
      weaponRowId: 'w-pistol',
      mode: 'single',
    });
    expect(third).toEqual({ ok: false, error: 'ROF_EXCEEDED' });

    const view = await tracker();
    expect(spent(rowOf(view, vexTokenId), 'attacks')).toEqual({ used: 2, max: 2 });
    expect(rowOf(view, vexTokenId).turn?.note).toBe('Atak: Zgrzyt 9 + Zgrzyt 9');
  });

  it('lets an LA 1 weapon fire once and closes the Attack Action behind it', async () => {
    await giveTurnTo(vexTokenId);
    const first = await attack(player, vexCharacterId, vexTokenId, {
      weaponRowId: 'w-rifle',
      mode: 'single',
    });
    expect(first.ok).toBe(true);
    // Not even the fast pistol fits after a slow weapon took the whole Action.
    const second = await attack(player, vexCharacterId, vexTokenId, {
      weaponRowId: 'w-pistol',
      mode: 'single',
    });
    expect(second).toEqual({ ok: false, error: 'ROF_EXCEEDED' });
    expect(spent(rowOf(await tracker(), vexTokenId), 'attacks')).toEqual({ used: 1, max: 1 });
  });

  it('refuses an LA 1 weapon as the second half of an Attack Action', async () => {
    await giveTurnTo(vexTokenId);
    expect((await attack(player, vexCharacterId, vexTokenId, { weaponRowId: 'w-pistol' })).ok).toBe(
      true,
    );
    expect(await attack(player, vexCharacterId, vexTokenId, { weaponRowId: 'w-rifle' })).toEqual({
      ok: false,
      error: 'ROF_EXCEEDED',
    });
  });

  it('spends the whole Action on an aimed shot', async () => {
    await giveTurnTo(vexTokenId);
    const aimed = await attack(player, vexCharacterId, vexTokenId, {
      weaponRowId: 'w-pistol',
      mode: 'single',
      aimed: true,
    });
    expect(aimed.ok).toBe(true);
    expect(await attack(player, vexCharacterId, vexTokenId, { weaponRowId: 'w-pistol' })).toEqual({
      ok: false,
      error: 'ROF_EXCEEDED',
    });
  });

  it('charges reloading an Action, which then blocks the attack', async () => {
    await giveTurnTo(vexTokenId);
    const logged = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    const reload = await emitAck(player, 'weapon:reload', {
      characterId: vexCharacterId,
      weaponRowId: 'w-pistol',
    });
    expect(reload.ok).toBe(true);
    // Reloading produces no roll card, so the chat line is its only trace.
    const line = await logged;
    expect(line.message.kind).toBe('action');
    expect(line.message.action?.actionName).toBe('Przeładowanie');

    expect(await attack(player, vexCharacterId, vexTokenId, { weaponRowId: 'w-pistol' })).toEqual({
      ok: false,
      error: 'NO_ACTION_LEFT',
    });
    expect(spent(rowOf(await tracker(), vexTokenId), 'action')).toEqual({ used: 1, max: 1 });
  });

  it('refuses an action outside your own turn and shows the GM a „przepuść" card', async () => {
    await giveTurnTo(thugTokenId);
    const card = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    const refused = await attack(player, vexCharacterId, vexTokenId, { weaponRowId: 'w-pistol' });
    expect(refused).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });

    const message = (await card).message;
    expect(message.kind).toBe('gmaction');
    expect(message.action?.refusal?.code).toBe('NOT_YOUR_TURN');
    expect(message.action?.combatantId).toBe(rowOf(await tracker(), vexTokenId).id);

    // The pass lets exactly one attempt through, and is gone afterwards.
    await emitAck(gm, 'combat:allow', {
      combatantId: message.action!.combatantId,
      messageId: message.id,
    });
    expect(rowOf(await tracker(), vexTokenId).turn?.bypass).toBe(true);

    const allowed = await attack(player, vexCharacterId, vexTokenId, { weaponRowId: 'w-pistol' });
    expect(allowed.ok).toBe(true);
    const after = rowOf(await tracker(), vexTokenId);
    expect(after.turn?.bypass).toBeUndefined();

    const refusedAgain = await attack(player, vexCharacterId, vexTokenId, {
      weaponRowId: 'w-rifle',
    });
    expect(refusedAgain).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });
  });

  it('never blocks the GM, and counts the overspend', async () => {
    await giveTurnTo(thugTokenId);
    for (let shot = 0; shot < 3; shot += 1) {
      const ack = await attack(gm, thugCharacterId, thugTokenId, { weaponRowId: 'w-pistol' });
      expect(ack.ok).toBe(true);
    }
    const row = rowOf(await tracker(), thugTokenId);
    expect(spent(row, 'attacks').used).toBe(3);
    expect(row.turn?.overspent).toBe(1);
  });

  it('keeps the spent budget across a reconnect', async () => {
    await giveTurnTo(vexTokenId);
    expect((await attack(player, vexCharacterId, vexTokenId, { weaponRowId: 'w-pistol' })).ok).toBe(
      true,
    );

    const fresh = createSocket(playerCookie);
    const sync = await fresh.firstSync;
    const row = sync.combat?.combatants.find((c) => c.tokenId === vexTokenId);
    expect(row?.turn?.resources.find((r) => r.id === 'attacks')?.used).toBe(1);
    // …and the reconnected socket is still held to it.
    expect(
      await attack(fresh.socket, vexCharacterId, vexTokenId, { weaponRowId: 'w-rifle' }),
    ).toEqual({ ok: false, error: 'ROF_EXCEEDED' });
    fresh.socket.disconnect();
  });

  it('fires a held Action by itself when the queue reaches the declared value', async () => {
    await giveTurnTo(vexTokenId);
    const held = await emitAck<CombatView>(player, 'combat:hold', { initiative: 12 });
    expect(held.ok).toBe(true);
    const declared = rowOf(await tracker(), vexTokenId);
    expect(declared.held).toEqual({ trigger: null, initiative: 12 });
    // Holding reserves the Action — it is not spent yet.
    expect(spent(declared, 'action')).toEqual({ used: 0, max: 1 });

    // The next participant would be the thug at 10; 12 comes first.
    const after = data(await emitAck<CombatView>(gm, 'combat:next', {}), 'combat:next');
    const vex = rowOf(after, vexTokenId);
    expect(after.activeCombatantId).toBe(vex.id);
    expect(vex.initiative).toBe(12);
    expect(vex.held).toBeUndefined();

    // And the reserved Action is still there to be spent.
    expect((await attack(player, vexCharacterId, vexTokenId, { weaponRowId: 'w-rifle' })).ok).toBe(
      true,
    );
  });

  it('refuses a hold that declares neither a trigger nor a queue value', async () => {
    await giveTurnTo(vexTokenId);
    expect(await emitAck(player, 'combat:hold', {})).toEqual({
      ok: false,
      error: 'HOLD_NEEDS_DECLARATION',
    });
  });

  it('spends an Action on a generic action and logs it publicly', async () => {
    await giveTurnTo(vexTokenId);
    const logged = waitFor<ChatMessageBroadcast>(player, 'chat:message');
    const ack = await emitAck<CombatView>(player, 'combat:action', { actionId: 'stand-up' });
    expect(ack.ok).toBe(true);
    const line = await logged;
    expect(line.message.kind).toBe('action');
    expect(line.message.action?.actionName).toBe('Wstanie');

    expect(await emitAck(player, 'combat:action', { actionId: 'grapple' })).toEqual({
      ok: false,
      error: 'NO_ACTION_LEFT',
    });
  });

  it('grants Bieg a second Move Action only after the first one is gone', async () => {
    await giveTurnTo(vexTokenId);
    expect(await emitAck(player, 'combat:action', { actionId: 'run' })).toEqual({
      ok: false,
      error: 'RUN_NEEDS_MOVE',
    });
    expect((await emitAck(player, 'combat:action', { actionId: 'move' })).ok).toBe(true);
    expect((await emitAck(player, 'combat:action', { actionId: 'run' })).ok).toBe(true);
    expect(spent(rowOf(await tracker(), vexTokenId), 'move')).toEqual({ used: 1, max: 2 });
  });

  it('hands a participant their whole turn back on the GM’s reset', async () => {
    const before = rowOf(await tracker(), vexTokenId);
    expect(spent(before, 'action').used).toBe(1);
    await emitAck(gm, 'combat:reset-turn', { combatantId: before.id });
    expect(budget(rowOf(await tracker(), vexTokenId))).toEqual({
      move: { used: 0, max: 1 },
      action: { used: 0, max: 1 },
      attacks: { used: 0, max: 2 },
    });
  });

  it('stabilizes a mortally wounded target back to 1 HP, for an Action', async () => {
    await giveTurnTo(vexTokenId);
    // Put the courier below zero: a Mortally Wounded target, PT 15.
    await emitAck(gm, 'token:update', {
      tokenId: targetTokenId,
      patch: { hp: { current: 0, max: 30 } },
    });

    const card = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    const ack = await emitAck<{ messageId: number }>(player, 'character:roll', {
      characterId: vexCharacterId,
      visibility: 'public',
      request: { kind: 'stabilize', stabilizeTokenId: targetTokenId },
    });
    expect(ack.ok).toBe(true);
    const outcome = (await card).message.roll?.outcome;
    expect(outcome?.label === 'Ustabilizowany' || outcome?.label === 'Nie udało się').toBe(true);
    expect(outcome?.detail).toContain('PT 15');

    // Whatever the dice said, the Action is gone.
    expect(spent(rowOf(await tracker(), vexTokenId), 'action')).toEqual({ used: 1, max: 1 });
  });
});
