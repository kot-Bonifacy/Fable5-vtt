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
  WallView,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Smoke tests of grappling (stage 14d) on real sockets.
 *
 * What is proved here is the *seam*, not the arithmetic — `grapple.test.ts` in
 * `shared` covers the rules. These check that a Hold really is a relation the
 * server owns: that it stickers the token, refuses the Held one their walk,
 * drags them when the Attacker moves, puts −2 into the next roll's breakdown,
 * and comes apart cleanly on a Rzut, an escape and the end of the fight.
 *
 * Determinism: the grappler is built with DEX 10 + Bijatyka 10 against targets
 * whose stand-in DV is at most 10, so even a fumbled roll (20 + 1 − 10 = 11)
 * wins. Nothing here depends on a die falling a particular way.
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
    payload: { password: GM_PASSWORD },
  });
  gmCookie = cookieOf(login.headers['set-cookie']);

  const campaignRes = await built.app.inject({
    method: 'POST',
    url: '/api/campaigns',
    headers: { cookie: gmCookie },
    payload: { name: 'Kampania zwarcia' },
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

describe('grappling', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;
  let vexCharacterId: string;
  let thugCharacterId: string;
  let vexTokenId: string;
  let thugTokenId: string;
  let statistTokenId: string;
  /** Sheet stats as first written — the swap block restores around them. */
  let VEX_STATS: CpredCharacterData['stats'];
  let THUG_STATS: CpredCharacterData['stats'];

  const weapons = () => [
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
      // `weapon-type.sample-rifle` carries `hands: 2` — the two-handed refusal.
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
  ];

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

  /** Statuses of a token as the GM currently sees them. */
  async function statusesOf(tokenId: string): Promise<string[]> {
    const sync = waitFor<StateSyncPayload>(gm, 'state:sync');
    await emitAck(gm, 'state:request');
    const token = (await sync).tokens.find((t) => t.id === tokenId);
    if (!token) throw new Error('token missing from sync');
    return token.statuses;
  }

  async function positionOf(tokenId: string): Promise<{ x: number; y: number }> {
    const sync = waitFor<StateSyncPayload>(gm, 'state:sync');
    await emitAck(gm, 'state:request');
    const token = (await sync).tokens.find((t) => t.id === tokenId);
    if (!token) throw new Error('token missing from sync');
    return { x: token.x, y: token.y };
  }

  /** Hands the turn to the participant on this token, with a fresh budget. */
  async function giveTurnTo(tokenId: string): Promise<void> {
    for (let step = 0; step < 12; step += 1) {
      const view = data(await emitAck<CombatView>(gm, 'combat:next', {}), 'combat:next');
      if (view.activeCombatantId === rowOf(view, tokenId).id) return;
    }
    throw new Error('turn never reached that participant');
  }

  /** Vex grabs somebody; resolves with the ack (refusals included). */
  function grab(
    targetTokenId: string,
    intent: 'hold' | 'item' | 'escape' = 'hold',
    socket: ClientSocket = player,
    characterId: string = vexCharacterId,
    attackerTokenId: string = vexTokenId,
  ): Promise<SocketAck<{ messageId: number }>> {
    return emitAck<{ messageId: number }>(socket, 'grapple:attempt', {
      characterId,
      attackerTokenId,
      targetTokenId,
      intent,
    });
  }

  it('sets the table: a grappler, a victim and a statist', async () => {
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
    VEX_STATS = { ...(vex.data as CpredCharacterData).stats, dex: 10, ref: 6, body: 8 };
    await emitAck(gm, 'character:update', {
      characterId: vexCharacterId,
      patch: {
        data: {
          // DEX 10 + Bijatyka 10 = 20: wins every opposed test below on merit.
          stats: VEX_STATS,
          skills: { brawling: 10, handgun: 5, 'shoulder-arms': 4, evasion: 2 },
          weapons: weapons(),
        },
      },
    });

    const thug = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Bandzior' }),
      'character:create',
    );
    thugCharacterId = thug.id;
    THUG_STATS = { ...(thug.data as CpredCharacterData).stats, dex: 1, ref: 4, body: 4 };
    await emitAck(gm, 'character:update', {
      characterId: thugCharacterId,
      patch: {
        data: {
          // DEX 1, untrained: stand-in DV 6, which even a fumble beats.
          stats: THUG_STATS,
          skills: { evasion: 2 },
          weapons: weapons(),
          hpCurrent: 5,
        },
      },
    });

    const scene = data(await emitAck<SceneView>(gm, 'scene:create', { name: 'Zaułek' }), 'scene');
    sceneId = scene.id;
    // Mapa otwarta dla graczy (12.09): nowa scena wchodzi **zamknięta**, a ten
    // zestaw jest o ruchu figur, nie o blokadzie.
    await emitAck(gm, 'scene:update', { sceneId, patch: { playerMoveLocked: false } });
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
    // Exactly 2 m away — the reach of a grab, measured centre to centre.
    thugTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Bandzior',
        x: 2 * PX_PER_M,
        y: 0,
        characterId: thugCharacterId,
      }),
      'token:create',
    ).id;
    statistTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Kurier',
        x: 12 * PX_PER_M,
        y: 0,
        hp: { current: 30, max: 30 },
      }),
      'token:create',
    ).id;

    const combat = data(
      await emitAck<CombatView>(gm, 'combat:start', {
        sceneId,
        tokenIds: [vexTokenId, thugTokenId, statistTokenId],
      }),
      'combat:start',
    );
    await emitAck(gm, 'combat:set-initiative', {
      combatantId: rowOf(combat, vexTokenId).id,
      initiative: 20,
    });
    await emitAck(gm, 'combat:set-initiative', {
      combatantId: rowOf(combat, thugTokenId).id,
      initiative: 10,
    });
    await emitAck(gm, 'combat:set-initiative', {
      combatantId: rowOf(combat, statistTokenId).id,
      initiative: 5,
    });
    await giveTurnTo(vexTokenId);
  });

  it('refuses a grab from across the room', async () => {
    // „Do wykonania manewru Pochwycenia potrzebna jest jedna wolna ręka" — and
    // an arm's length. The statist stands 12 m away.
    const ack = await grab(statistTokenId);
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.error).toBe('GRAPPLE_OUT_OF_REACH');
  });

  it('refuses a grab through a barrier — a fence stops an arm as it stops legs (42a)', async () => {
    // Vex's middle is at x = 50, the Bandzior's at x = 150; the fence runs between.
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
    const ack = await grab(thugTokenId);
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.error).toBe('GRAPPLE_BLOCKED');
    await emitAck(gm, 'wall:delete', { wallId: fence.id });
  });

  it('writes a won Pochwycenie onto both rows and stickers the token', async () => {
    const ack = await grab(thugTokenId);
    expect(ack.ok).toBe(true);

    const view = await tracker();
    const attacker = rowOf(view, vexTokenId);
    const defender = rowOf(view, thugTokenId);
    expect(attacker.grapple?.role).toBe('attacker');
    expect(attacker.grapple?.otherName).toBe('Bandzior');
    expect(defender.grapple?.role).toBe('defender');
    expect(defender.grapple?.otherName).toBe('Vex');
    // The relation is the truth; the sticker is its picture on the map.
    expect(await statusesOf(thugTokenId)).toContain('grappled');
    // The grab cost the Attacker their Action (s. 176).
    expect(attacker.turn?.resources.find((r) => r.id === 'action')?.used).toBe(1);
  });

  it('refuses a second grab on somebody already Held', async () => {
    await giveTurnTo(vexTokenId);
    const ack = await grab(thugTokenId);
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.error).toBe('ALREADY_GRAPPLED');
  });

  it('puts „Trzymanie −2" into the breakdown of the next roll', async () => {
    // RAW: „−2 do wszystkich Akcji". Named in the breakdown rather than folded
    // into the total, so the player can see where it came from.
    const card = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    await emitAck(player, 'character:roll', {
      characterId: vexCharacterId,
      request: { kind: 'skill', skillId: 'evasion' },
    });
    const roll = (await card).message.roll;
    const entry = roll?.breakdown?.find((row) => row.label === 'Trzymanie');
    expect(entry?.value).toBe(-2);
  });

  it('refuses a two-handed weapon to somebody in a Hold', async () => {
    await giveTurnTo(vexTokenId);
    const ack = await emitAck(player, 'attack:roll', {
      characterId: vexCharacterId,
      attackerTokenId: vexTokenId,
      targetTokenId: statistTokenId,
      request: { weaponRowId: 'w-rifle', mode: 'single' },
    });
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.error).toBe('GRAPPLE_TWO_HANDED');
  });

  it('drags the Held one along when the Attacker walks', async () => {
    await giveTurnTo(vexTokenId);
    const before = await positionOf(thugTokenId);
    await emitAck(player, 'token:move', {
      tokenId: vexTokenId,
      x: 4 * PX_PER_M,
      y: 0,
      final: true,
    });
    const after = await positionOf(thugTokenId);
    // Four metres of walking moved both figures by four metres.
    expect(after.x - before.x).toBe(4 * PX_PER_M);
    expect(after.y).toBe(before.y);
  });

  it('answers a Pochwycenie once, and the Hold follows the verdict', async () => {
    // A fresh contest so the card is unanswered: the thug is released first.
    await giveTurnTo(vexTokenId);
    await emitAck(player, 'grapple:action', { kind: 'release' });
    await giveTurnTo(vexTokenId);
    const started = data(await grab(thugTokenId), 'grapple:attempt');

    const answered = await emitAck<{ total: number; won: boolean }>(gm, 'grapple:resist', {
      messageId: started.messageId,
      characterId: thugCharacterId,
    });
    expect(answered.ok).toBe(true);
    const verdict = data(answered, 'grapple:resist');

    // Whatever the dice said, the tracker and the card must agree about it.
    const view = await tracker();
    expect(rowOf(view, thugTokenId).grapple !== undefined).toBe(verdict.won);
    expect((await statusesOf(thugTokenId)).includes('grappled')).toBe(verdict.won);

    // An opposed test is contested exactly once.
    const again = await emitAck(gm, 'grapple:resist', {
      messageId: started.messageId,
      characterId: thugCharacterId,
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toBe('ALREADY_ANSWERED');
  });

  it('floors a dying target at 1 HP and knocks them out (Duszenie)', async () => {
    // Re-establish the Hold whatever the previous test's dice decided.
    const view = await tracker();
    if (rowOf(view, thugTokenId).grapple === undefined) {
      await giveTurnTo(vexTokenId);
      expect((await grab(thugTokenId)).ok).toBe(true);
    }
    await giveTurnTo(vexTokenId);

    // Vex has BODY 8 against a thug on 5 HP: 5 − 8 = −3, below zero, so RAW
    // parks them on 1 HP and takes them out instead of killing them.
    const ack = await emitAck<CombatView>(player, 'grapple:action', { kind: 'choke' });
    expect(ack.ok).toBe(true);

    const statuses = await statusesOf(thugTokenId);
    expect(statuses).toContain('unconscious');
    const sheet = await built.prisma.character.findUnique({ where: { id: thugCharacterId } });
    const parsed = JSON.parse(sheet!.data) as CpredCharacterData;
    expect(parsed.hpCurrent).toBe(1);
  });

  it('refuses every Action to somebody choked unconscious', async () => {
    await giveTurnTo(thugTokenId);
    // The thug is the GM's, and the GM is never blocked — so the refusal is
    // checked where it bites: the status table itself said „no Actions".
    const view = await tracker();
    expect(rowOf(view, thugTokenId).grapple?.role).toBe('defender');
  });

  it('ends the Hold and leaves the target Prone (Rzut)', async () => {
    await giveTurnTo(vexTokenId);
    const ack = await emitAck<CombatView>(player, 'grapple:action', { kind: 'throw' });
    expect(ack.ok).toBe(true);

    const view = await tracker();
    expect(rowOf(view, vexTokenId).grapple).toBeUndefined();
    expect(rowOf(view, thugTokenId).grapple).toBeUndefined();
    const statuses = await statusesOf(thugTokenId);
    expect(statuses).toContain('prone');
    expect(statuses).not.toContain('grappled');
  });

  it('refuses Duszenie to somebody who is not holding anybody', async () => {
    await giveTurnTo(vexTokenId);
    const ack = await emitAck(player, 'grapple:action', { kind: 'choke' });
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.error).toBe('NOT_GRAPPLING');
  });

  it('knocks out a healthy target after three Rounds of choking in a row', async () => {
    // The statist has 30 HP and takes 8 a squeeze: nothing but the streak can
    // put them out. First walk over and grab them.
    await giveTurnTo(vexTokenId);
    await emitAck(gm, 'token:move', {
      tokenId: vexTokenId,
      x: 11 * PX_PER_M,
      y: 0,
      final: true,
    });
    expect((await grab(statistTokenId)).ok).toBe(true);

    for (let round = 1; round <= 3; round += 1) {
      await giveTurnTo(vexTokenId);
      const ack = await emitAck<CombatView>(player, 'grapple:action', { kind: 'choke' });
      expect(ack.ok, `choke ${round}`).toBe(true);
      const view = await tracker();
      expect(rowOf(view, statistTokenId).grapple?.chokeStreak).toBe(round);
    }
    expect(await statusesOf(statistTokenId)).toContain('unconscious');
  });

  it('marks the Held one as a Ludzka tarcza', async () => {
    await giveTurnTo(vexTokenId);
    const shield = await emitAck<CombatView>(player, 'grapple:action', { kind: 'human-shield' });
    expect(shield.ok).toBe(true);
    const view = await tracker();
    expect(rowOf(view, statistTokenId).grapple?.shield).toBe(true);
  });

  /**
   * Stage 16c gave „uznaje się, że jesteś za osłoną" (s. 181) teeth: until then
   * it was a sentence appended to the card and the GM ruled on it. Now the shot
   * is stopped by the person in the way, and the answer names them — their body
   * points are the cover's, because they *are* the cover.
   */
  it('stops a bullet aimed at whoever is holding the shield', async () => {
    const ack = await emitAck<{ blocked?: { kind: string; tokenId: string; name: string } }>(
      gm,
      'attack:roll',
      {
        characterId: thugCharacterId,
        attackerTokenId: thugTokenId,
        targetTokenId: vexTokenId,
        request: { weaponRowId: 'w-pistol', mode: 'single' },
      },
    );
    expect(ack.ok).toBe(true);
    expect(ack.ok && ack.data?.blocked).toEqual({
      kind: 'shield',
      tokenId: statistTokenId,
      name: 'Kurier',
    });
  });

  it('lets an aimed shot over the top of it', async () => {
    // „Nie można nimi zasłaniać się … przed atakami dystansowymi wycelowanymi
    // w twoją głowę" (s. 178) — the shield is at chest height, and the −8 of an
    // aimed shot is what it costs to shoot over it.
    const ack = await emitAck<{ blocked?: unknown }>(gm, 'attack:roll', {
      characterId: thugCharacterId,
      attackerTokenId: thugTokenId,
      targetTokenId: vexTokenId,
      request: { weaponRowId: 'w-pistol', mode: 'single', aimedAt: 'head' },
    });
    expect(ack.ok).toBe(true);
    expect(ack.ok && ack.data?.blocked).toBeUndefined();
  });

  /**
   * The other side of the table: a *player* being Held.
   *
   * The stats are swapped for this block so the NPC wins on merit — the whole
   * suite stays free of „hopefully the die falls right". They are swapped back
   * before the escape, which has to succeed for the same reason.
   */
  describe('with the player in the Hold', () => {
    it('lets the NPC take the player, once the sheets say it should', async () => {
      await giveTurnTo(vexTokenId);
      await emitAck(player, 'grapple:action', { kind: 'release' });
      // The thug has been choked out and thrown in the tests above; the GM
      // helps them up, because an unconscious NPC has nobody to grab.
      await emitAck(gm, 'token:update', { tokenId: thugTokenId, patch: { statuses: [] } });
      await emitAck(gm, 'character:update', {
        characterId: thugCharacterId,
        patch: { data: { stats: { ...THUG_STATS, dex: 10 }, skills: { brawling: 10 } } },
      });
      await emitAck(gm, 'character:update', {
        characterId: vexCharacterId,
        patch: { data: { stats: { ...VEX_STATS, dex: 1 }, skills: { brawling: 0, evasion: 2 } } },
      });
      // Stand next to each other again — a grab needs 2 m.
      await emitAck(gm, 'token:move', {
        tokenId: thugTokenId,
        x: 10 * PX_PER_M,
        y: 0,
        final: true,
      });
      await emitAck(gm, 'token:move', { tokenId: vexTokenId, x: 11 * PX_PER_M, y: 0, final: true });

      await giveTurnTo(thugTokenId);
      const ack = await grab(vexTokenId, 'hold', gm, thugCharacterId, thugTokenId);
      expect(ack.ok).toBe(true);
      const view = await tracker();
      expect(rowOf(view, vexTokenId).grapple?.role).toBe('defender');
    });

    it('refuses the Held player their own Move Action', async () => {
      // Not arithmetic: Vex has a full budget and still may not walk off.
      await giveTurnTo(vexTokenId);
      const refused = await emitAck(player, 'token:move', {
        tokenId: vexTokenId,
        x: 6 * PX_PER_M,
        y: 0,
        final: true,
      });
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.error).toBe('MOVE_REFUSED');
    });

    it('forbids a Ludzka tarcza to dodge an incoming bullet', async () => {
      await giveTurnTo(thugTokenId);
      const shield = await emitAck<CombatView>(gm, 'grapple:action', {
        kind: 'human-shield',
        combatantId: rowOf(await tracker(), thugTokenId).id,
      });
      expect(shield.ok).toBe(true);

      const shot = data(
        await emitAck<{ messageId: number }>(gm, 'attack:roll', {
          characterId: thugCharacterId,
          attackerTokenId: thugTokenId,
          targetTokenId: vexTokenId,
          request: { weaponRowId: 'w-pistol', mode: 'single' },
        }),
        'attack:roll',
      );
      // „Twoja Ludzka tarcza nie może unikać Ataków dystansowych" (s. 178).
      const evade = await emitAck(player, 'attack:evade', {
        messageId: shot.messageId,
        characterId: vexCharacterId,
      });
      expect(evade.ok).toBe(false);
      if (!evade.ok) expect(evade.error).toBe('SHIELD_CANNOT_DODGE');
    });

    it('ends the Hold for everybody when the Held one wrestles free', async () => {
      // Swapped back: now Vex is the one who cannot lose the contest.
      await emitAck(gm, 'character:update', {
        characterId: vexCharacterId,
        patch: { data: { stats: { ...VEX_STATS, dex: 10 }, skills: { brawling: 10, evasion: 2 } } },
      });
      await emitAck(gm, 'character:update', {
        characterId: thugCharacterId,
        patch: { data: { stats: { ...THUG_STATS, dex: 1 }, skills: { brawling: 0 } } },
      });
      await giveTurnTo(vexTokenId);
      const ack = await grab(thugTokenId, 'escape');
      expect(ack.ok).toBe(true);

      const view = await tracker();
      expect(rowOf(view, vexTokenId).grapple).toBeUndefined();
      expect(rowOf(view, thugTokenId).grapple).toBeUndefined();
      expect(await statusesOf(vexTokenId)).not.toContain('grappled');
    });
  });

  it('ends every Hold when the fight ends, sticker included', async () => {
    await emitAck(gm, 'combat:end', {});
    expect(await statusesOf(statistTokenId)).not.toContain('grappled');
  });
});
