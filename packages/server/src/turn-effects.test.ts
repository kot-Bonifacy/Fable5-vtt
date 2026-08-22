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
  ChatMessageView,
  CharacterView,
  CombatView,
  CombatantView,
  CpredCharacterData,
  DamageLogEntry,
  InvitationSummary,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenView,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Smoke tests of the turn's automatic half (stage 14e) on real sockets.
 *
 * The arithmetic is proved in `statuses.test.ts` and `turn.test.ts` of the
 * shared package. What is proved here is the seam: that ending a turn really
 * does burn whoever is on fire, that the damage lands as an ordinary undoable
 * card, that a wound written on the tracker really does take the *next* turn's
 * Action away, and — the one that needed a schema change — that none of it
 * happens twice when the GM steps the pointer back and forward.
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
    payload: { name: 'Kampania automatów' },
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

describe('turn automation', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;
  let vexCharacterId: string;
  let vexTokenId: string;
  let thugTokenId: string;

  /** Every chat message the GM has seen, newest last. */
  const chat: ChatMessageView[] = [];

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

  async function tokenOf(tokenId: string): Promise<TokenView> {
    const sync = waitFor<StateSyncPayload>(gm, 'state:sync');
    await emitAck(gm, 'state:request');
    const token = (await sync).tokens.find((t) => t.id === tokenId);
    if (!token) throw new Error('token missing from sync');
    return token;
  }

  async function sheetOf(characterId: string): Promise<CpredCharacterData> {
    const sync = waitFor<StateSyncPayload>(gm, 'state:sync');
    await emitAck(gm, 'state:request');
    const character = (await sync).characters.find((c) => c.id === characterId);
    if (!character) throw new Error('character missing from sync');
    return character.data as CpredCharacterData;
  }

  /** Drags a token along the x axis, in metres. */
  function drag(socket: ClientSocket, tokenId: string, toMetresX: number) {
    return emitAck<{ x: number; y: number }>(socket, 'token:move', {
      tokenId,
      x: toMetresX * PX_PER_M,
      y: 0,
      final: true,
    });
  }

  /** Hands the turn to the participant on this token. */
  async function giveTurnTo(tokenId: string): Promise<CombatView> {
    for (let step = 0; step < 8; step += 1) {
      const view = data(await emitAck<CombatView>(gm, 'combat:next', {}), 'combat:next');
      if (view.activeCombatantId === rowOf(view, tokenId).id) return view;
    }
    throw new Error('turn never reached that participant');
  }

  /** Damage cards for one token, oldest first. */
  function damageCardsFor(tokenId: string): DamageLogEntry[] {
    return chat
      .filter((message) => message.kind === 'damage' && message.damage)
      .map((message) => message.damage!)
      .filter((entry) => entry.targetTokenId === tokenId);
  }

  /** Sets a token's HP without spending anybody's turn. */
  async function setHp(tokenId: string, current: number, max: number): Promise<void> {
    await emitAck(gm, 'token:update', { tokenId, patch: { hp: { current, max } } });
  }

  async function setInjuries(
    characterId: string,
    injuries: CpredCharacterData['criticalInjuries'],
  ): Promise<void> {
    await emitAck(gm, 'character:update', {
      characterId,
      patch: { data: { criticalInjuries: injuries } },
    });
  }

  it('sets the table: a gridless alley, a player with RUCH 6 and a GM thug', async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);
    gm.on('chat:message', (payload: ChatMessageBroadcast) => chat.push(payload.message));

    const vex = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Vex', ownerId: playerId }),
      'character:create',
    );
    vexCharacterId = vex.id;
    await emitAck(gm, 'character:update', {
      characterId: vexCharacterId,
      patch: {
        data: {
          stats: { ...(vex.data as CpredCharacterData).stats, ref: 8, move: 6, body: 6, will: 6 },
        },
      },
    });

    const scene = data(await emitAck<SceneView>(gm, 'scene:create', { name: 'Pożar' }), 'scene');
    sceneId = scene.id;
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'open' });
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
        hp: { current: 30, max: 30 },
      }),
      'token:create',
    ).id;

    const combat = data(
      await emitAck<CombatView>(gm, 'combat:start', {
        sceneId,
        tokenIds: [vexTokenId, thugTokenId],
      }),
      'combat:start',
    );
    // Fixed initiative: Vex first, then the thug — every test below counts on
    // „next" walking that pair in that order.
    await emitAck(gm, 'combat:set-initiative', {
      combatantId: rowOf(combat, vexTokenId).id,
      initiative: 20,
    });
    await emitAck(gm, 'combat:set-initiative', {
      combatantId: rowOf(combat, thugTokenId).id,
      initiative: 10,
    });
    expect((await tracker()).combatants).toHaveLength(2);
  });

  /* --- fire, poison, drowning ------------------------------------- */

  it('burns a statist at the end of his own turn, without touching armor', async () => {
    await setHp(thugTokenId, 30, 30);
    // A GM-set status with a dial: the barrel that lit him is not in the model,
    // but what it costs per turn is.
    expect(
      (
        await emitAck(gm, 'token:effect', {
          tokenId: thugTokenId,
          statusId: 'on-fire',
          active: true,
          damage: 4,
        })
      ).ok,
    ).toBe(true);

    await giveTurnTo(thugTokenId);
    expect((await tokenOf(thugTokenId)).hp?.current).toBe(30);
    // Ending his turn is what costs him: nobody clicked anything.
    await emitAck(gm, 'combat:next', {});

    expect((await tokenOf(thugTokenId)).hp?.current).toBe(26);
    const card = damageCardsFor(thugTokenId).at(-1);
    expect(card?.armorSp).toBe(0);
    expect(card?.hpLost).toBe(4);
    expect(card?.injuryNote).toContain('Podpalony');
  });

  it('does not burn him again when the GM steps the pointer back and forward', async () => {
    const before = (await tokenOf(thugTokenId)).hp?.current ?? 0;
    const cardsBefore = damageCardsFor(thugTokenId).length;
    // The pointer correction of stage 14b: it hands out a fresh budget, which
    // is exactly why the ledger cannot live inside one.
    await emitAck(gm, 'combat:previous', {});
    await emitAck(gm, 'combat:next', {});
    expect((await tokenOf(thugTokenId)).hp?.current).toBe(before);
    expect(damageCardsFor(thugTokenId)).toHaveLength(cardsBefore);
  });

  it('takes the dial the GM turned, one rung up', async () => {
    await emitAck(gm, 'token:effect', {
      tokenId: thugTokenId,
      statusId: 'on-fire',
      active: true,
      damage: 6,
    });
    const before = (await tokenOf(thugTokenId)).hp?.current ?? 0;
    await giveTurnTo(thugTokenId);
    await emitAck(gm, 'combat:next', {});
    expect((await tokenOf(thugTokenId)).hp?.current).toBe(before - 6);
  });

  it('lets the Action „Ugaszenie" end it, and the next turn costs nothing', async () => {
    await giveTurnTo(thugTokenId);
    const combatantId = rowOf(await tracker(), thugTokenId).id;
    expect((await emitAck(gm, 'combat:action', { actionId: 'extinguish', combatantId })).ok).toBe(
      true,
    );
    expect((await tokenOf(thugTokenId)).statuses).not.toContain('on-fire');

    const before = (await tokenOf(thugTokenId)).hp?.current ?? 0;
    await emitAck(gm, 'combat:next', {});
    expect((await tokenOf(thugTokenId)).hp?.current).toBe(before);
  });

  it('refuses a dial on drowning and charges BODY at the start of the turn', async () => {
    // BODY is the rule's own number; a client asking for 99 must not get it.
    await emitAck(gm, 'token:effect', {
      tokenId: vexTokenId,
      statusId: 'drowning',
      active: true,
      damage: 99,
    });
    const before = (await sheetOf(vexCharacterId)).hpCurrent;
    await giveTurnTo(vexTokenId);
    // BODY 6, so six points — at the *start*, before Vex does anything.
    expect((await sheetOf(vexCharacterId)).hpCurrent).toBe(before - 6);
    await emitAck(gm, 'token:effect', {
      tokenId: vexTokenId,
      statusId: 'drowning',
      active: false,
    });
  });

  it('never burns a statist who has no HP at all', async () => {
    const looseId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Przechodzień',
        x: 600,
        y: 600,
      }),
      'token:create',
    ).id;
    await emitAck(gm, 'combat:add', { tokenIds: [looseId] });
    await emitAck(gm, 'token:effect', {
      tokenId: looseId,
      statusId: 'on-fire',
      active: true,
      damage: 4,
    });
    const cardsBefore = damageCardsFor(looseId).length;
    await giveTurnTo(looseId);
    await emitAck(gm, 'combat:next', {});
    expect(damageCardsFor(looseId)).toHaveLength(cardsBefore);
    await emitAck(gm, 'combat:remove', { combatantId: rowOf(await tracker(), looseId).id });
    await emitAck(gm, 'token:delete', { tokenId: looseId });
  });

  it('lifts „Przygwożdżony" at the end of the pinned token’s own turn', async () => {
    await giveTurnTo(vexTokenId);
    await emitAck(gm, 'token:update', {
      tokenId: thugTokenId,
      patch: { statuses: ['suppressed'] },
    });
    // Somebody else's turn ending leaves the pin alone: it is his to sit out.
    await emitAck(gm, 'combat:next', {});
    expect((await tokenOf(thugTokenId)).statuses).toContain('suppressed');
    // His own does lift it — „wygasa z końcem jego tury".
    await emitAck(gm, 'combat:next', {});
    expect((await tokenOf(thugTokenId)).statuses).not.toContain('suppressed');
  });

  /* --- Critical Injuries with machine effects ---------------------- */

  it('re-opens broken ribs after a long walk, and leaves a short one alone', async () => {
    await setInjuries(vexCharacterId, [
      { id: 'injury.body-zebra', name: 'Złamane żebra', effect: 'Testowa', dotAfterRun: true },
    ]);
    await drag(gm, vexTokenId, 0);

    // Three metres: under the threshold, nothing happens.
    await giveTurnTo(vexTokenId);
    let before = (await sheetOf(vexCharacterId)).hpCurrent;
    await drag(player, vexTokenId, 3);
    await emitAck(gm, 'combat:next', {});
    expect((await sheetOf(vexCharacterId)).hpCurrent).toBe(before);

    // Six metres: „ponad 4 m na piechotę" — the wound bites back for 5.
    await drag(gm, vexTokenId, 0);
    await giveTurnTo(vexTokenId);
    before = (await sheetOf(vexCharacterId)).hpCurrent;
    await drag(player, vexTokenId, 6);
    await emitAck(gm, 'combat:next', {});
    expect((await sheetOf(vexCharacterId)).hpCurrent).toBe(before - 5);
    expect(damageCardsFor(vexTokenId).at(-1)?.injuryNote).toContain('Złamane żebra');
  });

  it('measures the ribs in ground covered, not in budget spent', async () => {
    await drag(gm, vexTokenId, 0);
    await giveTurnTo(vexTokenId);
    // „Ruch utrudniony" doubles the *cost* of three metres to six of budget.
    // The rib does not know what the ground was like: three metres is three.
    await emitAck(player, 'combat:terrain', { hard: true });
    const before = (await sheetOf(vexCharacterId)).hpCurrent;
    await drag(player, vexTokenId, 3);
    const row = rowOf(await tracker(), vexTokenId);
    expect(row.turn?.distance?.used).toBe(6);
    await emitAck(gm, 'combat:next', {});
    expect((await sheetOf(vexCharacterId)).hpCurrent).toBe(before);
  });

  it('costs a torn ear the next turn’s Move Action, but not its Action', async () => {
    await setInjuries(vexCharacterId, [
      { id: 'injury.head-ucho', name: 'Uraz ucha', effect: 'Testowa', noMoveAfterRun: true },
    ]);
    await drag(gm, vexTokenId, 0);
    await giveTurnTo(vexTokenId);
    await drag(player, vexTokenId, 6);
    await emitAck(gm, 'combat:next', {});

    // The debt is visible before the turn it will cost — that is the point of
    // showing it on the tracker rather than only refusing later.
    expect(rowOf(await tracker(), vexTokenId).owes?.[0]).toContain('Uraz ucha');

    await giveTurnTo(vexTokenId);
    const refused = await drag(player, vexTokenId, 2);
    expect(refused).toEqual({ ok: false, error: 'MOVE_REFUSED' });
    // The Action is untouched: only the walking was taken away.
    const combatantId = rowOf(await tracker(), vexTokenId).id;
    expect((await emitAck(player, 'combat:action', { actionId: 'skill', combatantId })).ok).toBe(
      true,
    );
    // And the debt is spent: the turn after this one walks normally again.
    await giveTurnTo(vexTokenId);
    expect((await drag(player, vexTokenId, 2)).ok).toBe(true);
    await setInjuries(vexCharacterId, []);
  });

  it('tells the player which wound refused them, not just that something did', async () => {
    await setInjuries(vexCharacterId, [
      { id: 'injury.head-ucho', name: 'Uraz ucha', effect: 'Testowa', noMoveAfterRun: true },
    ]);
    await drag(gm, vexTokenId, 0);
    await giveTurnTo(vexTokenId);
    await drag(player, vexTokenId, 6);
    const refusal = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    await emitAck(gm, 'combat:next', {});
    await giveTurnTo(vexTokenId);
    await drag(player, vexTokenId, 2);
    // The refusal card the GM sees carries the wound's own sentence.
    const cards = chat.filter((m) => m.action?.refusal).map((m) => m.action!.refusal!);
    expect(cards.at(-1)?.message).toContain('Uraz ucha');
    await refusal.catch(() => undefined);
    await setInjuries(vexCharacterId, []);
  });

  /* --- the debt a wound creates the moment it lands ---------------- */

  it('takes the next turn’s Action away when a spine injury is drawn mid-round', async () => {
    for (let roll = 2; roll <= 12; roll++) {
      await emitAck(gm, 'compendium:upsert', {
        entry: {
          category: 'criticalInjury',
          name: `Uraz kręgosłupa ${roll}`,
          table: 'body',
          roll,
          description: 'W swojej kolejnej Turze nie możesz wykonać Akcji.',
          noActionNextTurn: true,
        },
      });
    }
    await emitAck(gm, 'character:update', {
      characterId: vexCharacterId,
      patch: {
        data: {
          weapons: [{ id: 'w-big', name: 'Kowadło', damage: '10k6', compendiumId: null }],
        },
      },
    });

    let messageId: number | null = null;
    for (let attempt = 0; attempt < 25 && messageId === null; attempt++) {
      const broadcast = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
      const ack = data(
        await emitAck<{ messageId: number }>(gm, 'character:roll', {
          characterId: vexCharacterId,
          request: { kind: 'damage', weaponRowId: 'w-big' },
          visibility: 'public',
        }),
        'character:roll',
      );
      if ((await broadcast).message.roll?.criticalDamage) messageId = ack.messageId;
    }
    if (messageId === null) throw new Error('no critical damage in 25 rolls of 10k6');

    // Vex is the target, and the hit lands while somebody else is acting.
    await giveTurnTo(thugTokenId);
    await emitAck(gm, 'token:update', { tokenId: vexTokenId, patch: { hp: undefined } });
    await emitAck(gm, 'character:update', {
      characterId: vexCharacterId,
      patch: { data: { hpCurrent: 40 } },
    });
    expect(
      (await emitAck(gm, 'damage:apply', { messageId, tokenId: vexTokenId, armorSp: 0 })).ok,
    ).toBe(true);
    expect(rowOf(await tracker(), vexTokenId).owes?.[0]).toContain('nie wykonujesz Akcji');

    await giveTurnTo(vexTokenId);
    const combatantId = rowOf(await tracker(), vexTokenId).id;
    const refused = await emitAck(player, 'combat:action', { actionId: 'skill', combatantId });
    expect(refused).toEqual({ ok: false, error: 'ACTION_BLOCKED' });
    // The sentence travels on the resource itself, not only in the notes: the
    // action bar greys its buttons out and has to say *why*, and „Akcja w tej
    // turze już wykorzystana" would blame the player for a turn they never had
    // (fixed 22.08).
    const action = rowOf(await tracker(), vexTokenId).turn?.resources.find(
      (resource) => resource.id === 'action',
    );
    expect(action?.used).toBe(1);
    expect(action?.blocked).toContain('nie wykonujesz Akcji');
    // „…ale możesz wykonać Akcję Ruchu" — the half of the rule that is easy to
    // lose when a block is implemented as „the turn is over".
    expect((await drag(player, vexTokenId, 4)).ok).toBe(true);
    await setInjuries(vexCharacterId, []);
  });
});
