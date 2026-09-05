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
  CombatUpdateBroadcast,
  CombatView,
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
 * Smoke tests of the initiative tracker (stage 14) on real sockets: what the
 * GM sees, what a player is allowed to see and do, and that a hidden
 * participant never appears in a player's payload.
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

async function roundTrip(socket: ClientSocket): Promise<StateSyncPayload> {
  const sync = waitFor<StateSyncPayload>(socket, 'state:sync');
  await emitAck(socket, 'state:request');
  return sync;
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
    payload: { name: 'Kampania walki' },
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

describe('combat tracker', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;
  let playerTokenId: string;
  let npcTokenId: string;
  let hiddenTokenId: string;
  let characterId: string;
  let combat: CombatView;
  /** Every combat payload the player socket ever receives — leak detector. */
  const playerCombatTraffic: CombatUpdateBroadcast[] = [];

  it('sets the table: a scene, a player character and three tokens', async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    player.on('combat:update', (payload: CombatUpdateBroadcast) =>
      playerCombatTraffic.push(payload),
    );
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);

    const character = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Ziti', ownerId: playerId }),
      'character:create',
    );
    characterId = character.id;
    const stats = (character.data as CpredCharacterData).stats;
    // REF 8 — the initiative modifier and the tie-breaker.
    await emitAck(gm, 'character:update', {
      characterId,
      patch: { data: { stats: { ...stats, ref: 8 } } },
    });

    const scene = data(await emitAck<SceneView>(gm, 'scene:create', { name: 'Dach' }), 'scene');
    sceneId = scene.id;
    // Stage 17: a fresh scene starts under fog, which would hide these
    // tokens from the player. This suite is not about fog — light it up.
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'open' });
    const activated = waitFor(player, 'scene:activate');
    await emitAck(gm, 'scene:activate', { sceneId });
    await activated;

    playerTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Ziti',
        x: 0,
        y: 0,
        ownerId: playerId,
        characterId,
      }),
      'token:create',
    ).id;
    npcTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', { sceneId, name: 'Bandzior', x: 200, y: 0 }),
      'token:create',
    ).id;
    hiddenTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Snajper',
        x: 400,
        y: 0,
        hidden: true,
      }),
      'token:create',
    ).id;
  });

  it('starts a fight with the selected tokens', async () => {
    combat = data(
      await emitAck<CombatView>(gm, 'combat:start', {
        sceneId,
        tokenIds: [playerTokenId, npcTokenId, hiddenTokenId],
      }),
      'combat:start',
    );
    expect(combat.round).toBe(0);
    expect(combat.activeCombatantId).toBeNull();
    expect(combat.combatants).toHaveLength(3);
    expect(combat.combatants.every((c) => c.initiative === null)).toBe(true);
  });

  it('hides the hidden participant from the player, including the round pointer', async () => {
    const sync = await roundTrip(player);
    expect(sync.combat).not.toBeNull();
    expect(sync.combat?.combatants.map((c) => c.name).sort()).toEqual(['Bandzior', 'Ziti']);
    expect(JSON.stringify(sync.combat)).not.toContain('Snajper');
    // Nothing that ever reached the player mentions the hidden participant.
    expect(JSON.stringify(playerCombatTraffic)).not.toContain('Snajper');
  });

  /**
   * The alias reaches the tracker too (03.09) — a name hidden on the map and
   * printed in the initiative queue would be no name hidden at all.
   */
  it('names an aliased figure in the tracker the way the table knows it', async () => {
    expect(
      (
        await emitAck(gm, 'token:update', {
          tokenId: npcTokenId,
          patch: { name: 'Bosman Maelstromu', publicName: 'Zbir' },
        })
      ).ok,
    ).toBe(true);

    try {
      const playerSync = await roundTrip(player);
      expect(playerSync.combat?.combatants.map((c) => c.name).sort()).toEqual(['Zbir', 'Ziti']);
      expect(JSON.stringify(playerSync.combat)).not.toContain('Bosman Maelstromu');
      expect(JSON.stringify(playerCombatTraffic)).not.toContain('Bosman Maelstromu');

      // MG czyta obie: alias jest tym, co mówi stołowi, nie tym, co sam widzi.
      const gmRow = (await roundTrip(gm)).combat?.combatants.find((c) => c.tokenId === npcTokenId);
      expect(gmRow?.name).toBe('Bosman Maelstromu');
      expect(gmRow?.publicName).toBe('Zbir');
    } finally {
      // Reszta pliku zna tę figurę jako „Bandzior" i szuka jej po nazwie —
      // nazwa wraca także wtedy, gdy asercja wyżej padnie.
      await emitAck(gm, 'token:update', {
        tokenId: npcTokenId,
        patch: { name: 'Bandzior', publicName: null },
      });
    }
  });

  it('rolls initiative for everyone at once, silently', async () => {
    const chatSeen: ChatMessageBroadcast[] = [];
    gm.on('chat:message', (payload: ChatMessageBroadcast) => chatSeen.push(payload));
    combat = data(await emitAck<CombatView>(gm, 'combat:roll-all', {}), 'combat:roll-all');
    expect(combat.combatants.every((c) => c.initiative !== null)).toBe(true);
    // 1d10 + REF 8 for the linked sheet, bare 1d10 for the statists.
    const ziti = combat.combatants.find((c) => c.name === 'Ziti');
    expect(ziti?.tieBreak).toBe(8);
    expect(ziti?.initiative).toBeGreaterThanOrEqual(9);
    expect(ziti?.initiative).toBeLessThanOrEqual(18);
    const npc = combat.combatants.find((c) => c.name === 'Bandzior');
    expect(npc?.tieBreak).toBeNull();
    expect(npc?.initiative).toBeGreaterThanOrEqual(1);
    expect(npc?.initiative).toBeLessThanOrEqual(10);
    // The mass roll stays off chat — five NPCs would bury the conversation.
    await roundTrip(gm);
    expect(chatSeen).toHaveLength(0);
    gm.off('chat:message');
  });

  it('keeps the tracker sorted by initiative', async () => {
    const values = combat.combatants.map((c) => c.initiative ?? -99);
    expect([...values].sort((a, b) => b - a)).toEqual(values);
  });

  it('lets a player roll their own initiative and puts the card on chat', async () => {
    const card = waitFor<ChatMessageBroadcast>(player, 'chat:message');
    const ack = await emitAck<{ initiative: number }>(player, 'combat:roll', {
      combatantId: combat.combatants.find((c) => c.name === 'Ziti')!.id,
    });
    const rolled = data(ack, 'combat:roll');
    const message = await card;
    expect(message.message.roll?.title).toBe('Inicjatywa');
    expect(message.message.roll?.actor).toBe('Ziti');
    expect(message.message.roll?.total).toBe(rolled.initiative);
    // Initiative is not a Skill Check — a natural 10 must not explode.
    expect(message.message.roll?.critical).toBeUndefined();
    expect(message.message.roll?.breakdown?.[0]?.value).toBe(8);
  });

  it('ciężki pancerz obniża Inicjatywę i rozstrzyganie remisów (s. 185)', async () => {
    /** Tabliczka remisu tej postaci, prosto z odświeżonej kolejki. */
    const tieBreakOfZiti = async (): Promise<number | null> => {
      const sync = await roundTrip(gm);
      const row = sync.combat?.combatants.find((entry) => entry.name === 'Ziti');
      if (!row) throw new Error('combatant missing from tracker');
      return row.tieBreak;
    };

    // „Metalgear … −4 REF, ZW i RUCH": REF 8 idzie na 4, a razem z nim tabliczka
    // remisu — bo remis rozstrzyga się właśnie REF-em i drugiego REF-u nie ma.
    expect(
      (
        await emitAck(gm, 'character:update', {
          characterId,
          patch: {
            data: {
              armor: [
                {
                  id: 'a1',
                  name: 'Metalgear',
                  notes: '',
                  sp: 18,
                  spCurrent: 18,
                  location: 'body',
                  penalty: -4,
                },
              ],
            },
          },
        })
      ).ok,
    ).toBe(true);

    const card = waitFor<ChatMessageBroadcast>(player, 'chat:message');
    const rolled = data(
      await emitAck<{ initiative: number }>(player, 'combat:roll', {
        combatantId: combat.combatants.find((c) => c.name === 'Ziti')!.id,
      }),
      'combat:roll',
    );
    expect(rolled.initiative).toBeGreaterThanOrEqual(5);
    expect(rolled.initiative).toBeLessThanOrEqual(14);
    const breakdown = (await card).message.roll?.breakdown?.[0];
    expect(breakdown?.value).toBe(4);
    expect(breakdown?.label).toContain('Pancerz');
    expect(await tieBreakOfZiti()).toBe(4);

    // Zdjęty pancerz oddaje oba: to modyfikator, nie trwała strata Cechy.
    await emitAck(gm, 'character:update', { characterId, patch: { data: { armor: [] } } });
    await emitAck(player, 'combat:roll', {
      combatantId: combat.combatants.find((c) => c.name === 'Ziti')!.id,
    });
    expect(await tieBreakOfZiti()).toBe(8);
  });

  it('refuses a player rolling for somebody else', async () => {
    const npc = combat.combatants.find((c) => c.name === 'Bandzior')!;
    const ack = await emitAck(player, 'combat:roll', { combatantId: npc.id });
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.error).toBe('FORBIDDEN');
  });

  it('hides even the existence of a hidden participant from a player', async () => {
    const sync = await roundTrip(gm);
    const hidden = sync.combat!.combatants.find((c) => c.name === 'Snajper')!;
    const ack = await emitAck(player, 'combat:roll', { combatantId: hidden.id });
    expect(ack.ok).toBe(false);
    // Not FORBIDDEN: a player must not be able to confirm that the id exists.
    if (!ack.ok) expect(ack.error).toBe('COMBATANT_NOT_FOUND');
  });

  it('walks the turn order and opens the next round', async () => {
    const first = data(await emitAck<CombatView>(gm, 'combat:next'), 'combat:next');
    expect(first.round).toBe(1);
    expect(first.activeCombatantId).toBe(first.combatants[0]!.id);

    const second = data(await emitAck<CombatView>(gm, 'combat:next'), 'combat:next');
    expect(second.activeCombatantId).toBe(second.combatants[1]!.id);

    const third = data(await emitAck<CombatView>(gm, 'combat:next'), 'combat:next');
    expect(third.activeCombatantId).toBe(third.combatants[2]!.id);

    const nextRound = data(await emitAck<CombatView>(gm, 'combat:next'), 'combat:next');
    expect(nextRound.round).toBe(2);
    expect(nextRound.activeCombatantId).toBe(nextRound.combatants[0]!.id);

    const back = data(await emitAck<CombatView>(gm, 'combat:previous'), 'combat:previous');
    expect(back.round).toBe(1);
    expect(back.activeCombatantId).toBe(back.combatants[2]!.id);
  });

  it("lets the acting player end their own turn but nobody else's", async () => {
    // Park the turn on somebody else's participant first.
    let state = data(await emitAck<CombatView>(gm, 'combat:next'), 'combat:next');
    while (state.combatants.find((c) => c.id === state.activeCombatantId)?.ownerId === playerId) {
      state = data(await emitAck<CombatView>(gm, 'combat:next'), 'combat:next');
    }
    const foreign = await emitAck(player, 'combat:next');
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.error).toBe('FORBIDDEN');

    // Now hand the turn to the player's character.
    const ziti = state.combatants.find((c) => c.ownerId === playerId)!;
    while (state.activeCombatantId !== ziti.id) {
      state = data(await emitAck<CombatView>(gm, 'combat:next'), 'combat:next');
    }
    const own = await emitAck<CombatView>(player, 'combat:next');
    expect(own.ok).toBe(true);
    expect(data(own, 'combat:next').activeCombatantId).not.toBe(ziti.id);

    // The GM steps back so later assertions start from a known place.
    await emitAck(gm, 'combat:previous');
  });

  it('resolves a tie by re-rolling it (RAW) and by hand', async () => {
    const [a, b] = combat.combatants;
    await emitAck(gm, 'combat:set-initiative', { combatantId: a!.id, initiative: 14 });
    let state = data(
      await emitAck<CombatView>(gm, 'combat:set-initiative', {
        combatantId: b!.id,
        initiative: 14,
      }),
      'combat:set-initiative',
    );
    const tied = state.combatants.filter((c) => c.initiative === 14).map((c) => c.id);
    expect(tied).toHaveLength(2);

    state = data(
      await emitAck<CombatView>(gm, 'combat:reroll-tie', { combatantIds: tied }),
      'combat:reroll-tie',
    );
    const afterReroll = state.combatants.filter((c) => tied.includes(c.id));
    expect(afterReroll.every((c) => c.initiative !== null)).toBe(true);

    // Manual drag: same initiative, GM decides the order.
    await emitAck(gm, 'combat:set-initiative', { combatantId: a!.id, initiative: 20 });
    state = data(
      await emitAck<CombatView>(gm, 'combat:set-initiative', {
        combatantId: b!.id,
        initiative: 20,
      }),
      'combat:set-initiative',
    );
    const order = state.combatants.map((c) => c.id);
    const dragged = [order[1]!, order[0]!, ...order.slice(2)];
    state = data(
      await emitAck<CombatView>(gm, 'combat:order', { combatantIds: dragged }),
      'combat:order',
    );
    expect(state.combatants.slice(0, 2).map((c) => c.id)).toEqual(dragged.slice(0, 2));
  });

  it('rejects a reorder that is not a permutation of the roster', async () => {
    const ack = await emitAck(gm, 'combat:order', {
      combatantIds: [combat.combatants[0]!.id],
    });
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.error).toBe('BAD_REQUEST');
  });

  it('adds reinforcements mid-combat and drops the dead', async () => {
    const latecomer = data(
      await emitAck<TokenView>(gm, 'token:create', { sceneId, name: 'Posiłki', x: 600, y: 0 }),
      'token:create',
    );
    let state = data(
      await emitAck<CombatView>(gm, 'combat:add', { tokenIds: [latecomer.id] }),
      'combat:add',
    );
    expect(state.combatants).toHaveLength(4);
    expect(state.combatants.find((c) => c.name === 'Posiłki')?.initiative).toBeNull();

    // Deleting the token pulls it out of the fight (DB cascade + broadcast).
    const update = waitFor<CombatUpdateBroadcast>(gm, 'combat:update');
    await emitAck(gm, 'token:delete', { tokenId: latecomer.id });
    await update;
    state = (await roundTrip(gm)).combat!;
    expect(state.combatants.map((c) => c.name)).not.toContain('Posiłki');
  });

  it('hands the turn on when the acting participant is removed', async () => {
    let state = (await roundTrip(gm)).combat!;
    while (state.activeCombatantId === null) {
      state = data(await emitAck<CombatView>(gm, 'combat:next'), 'combat:next');
    }
    const acting = state.activeCombatantId;
    state = data(
      await emitAck<CombatView>(gm, 'combat:remove', { combatantId: acting }),
      'combat:remove',
    );
    expect(state.combatants.map((c) => c.id)).not.toContain(acting);
    expect(state.activeCombatantId).not.toBe(acting);
    expect(state.activeCombatantId).not.toBeNull();
  });

  it('pulls a participant from the players tracker when its token is hidden', async () => {
    const state = (await roundTrip(gm)).combat!;
    const visibleNpc = state.combatants.find((c) => c.hidden !== true && c.ownerId === null);
    if (visibleNpc) {
      const update = waitFor<CombatUpdateBroadcast>(player, 'combat:update');
      await emitAck(gm, 'token:update', {
        tokenId: visibleNpc.tokenId,
        patch: { hidden: true },
      });
      const broadcast = await update;
      expect(broadcast.combat?.combatants.map((c) => c.id)).not.toContain(visibleNpc.id);
    }
    const sync = await roundTrip(player);
    expect(sync.combat?.combatants.every((c) => c.hidden === undefined)).toBe(true);
  });

  it('refuses combat control to players', async () => {
    for (const event of ['combat:start', 'combat:roll-all', 'combat:previous', 'combat:end']) {
      const ack = await emitAck(player, event, { sceneId, tokenIds: [playerTokenId] });
      expect(ack.ok, event).toBe(false);
      if (!ack.ok) expect(ack.error, event).toBe('FORBIDDEN');
    }
  });

  it('ends the fight and clears the tracker for everyone', async () => {
    const playerUpdate = waitFor<CombatUpdateBroadcast>(player, 'combat:update');
    expect((await emitAck(gm, 'combat:end')).ok).toBe(true);
    expect((await playerUpdate).combat).toBeNull();
    expect((await roundTrip(gm)).combat).toBeNull();
    expect((await roundTrip(player)).combat).toBeNull();
  });
});
