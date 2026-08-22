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
  CombatView,
  CompendiumEntry,
  CpredCharacterData,
  DamageLogEntry,
  InvitationSummary,
  RollAreaMeta,
  RollForcedCheck,
  SceneView,
  SmokeView,
  SocketAck,
  StateSyncPayload,
  TokenView,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Smoke tests of ammunition that deals no damage (stage 16h), on real sockets.
 *
 * The arithmetic is proved in `shared/systems/cpred/{ammo,timed}.test.ts`; what
 * only a running server can answer is asked here:
 *
 *  - a gas round **forces a check on everybody it reaches** and offers no
 *    damage roll at all;
 *  - failing it **costs what the catalogue says** — direct damage the armour
 *    does not stop, statuses that carry a timer;
 *  - the timer **runs on rounds**: six of them and the status is gone, whether
 *    or not its carrier is in the initiative queue;
 *  - outside a fight nothing counts, so the card carries the GM's button and
 *    the button is the only way off;
 *  - a smoke round **lays a square on the map**, and a shot fired from inside it
 *    carries a named −4;
 *  - a smart round **offers a second roll** after a near miss, and taking it
 *    rewrites the stored card;
 *  - the roster of checks is **not public** — the leak suppressive fire has had
 *    since stage 16.
 *
 * The street: one square is 100 px and 2 m, so a metre is 50 px.
 */

const TEST_DB = `./.test-${randomBytes(6).toString('hex')}.db`;
const GM_PASSWORD = 'test-haslo';
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
  if (!ack.ok) throw new Error(`${what} failed: ${ack.error}`);
  if (ack.data === undefined) throw new Error(`${what} returned no data`);
  return ack.data;
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

/** Every chat message posted while `run` was working, in arrival order. */
function collect(socket: ClientSocket): { stop: () => ChatMessageBroadcast[] } {
  const seen: ChatMessageBroadcast[] = [];
  const listener = (broadcast: ChatMessageBroadcast) => seen.push(broadcast);
  socket.on('chat:message', listener);
  return {
    stop: () => {
      socket.off('chat:message', listener);
      return seen;
    },
  };
}

/** Lets the server finish the cards it posts after acking an attack. */
function settle(ms = 250): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    payload: { name: 'Kampania gazu' },
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

describe('ammunition that deals no damage', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;
  let characterId: string;
  let throwerTokenId: string;
  /** Standing on the aimed square — always inside the blast. */
  let mookTokenId: string;
  /** Two metres east of it — also inside. */
  let neighbourTokenId: string;

  interface AttackCard {
    hit?: boolean;
    detail: string;
    damageNotation?: string;
    area?: RollAreaMeta;
    forcedChecks?: RollForcedCheck[];
    smart?: { missedBy: number; bonus: number; requires?: string };
    system: Record<string, unknown>;
  }

  /** The crater: the middle of a square, well clear of the thrower. */
  const AIM = { x: 1000, y: 1000 };

  /** Throws the loaded grenade at a square and returns the card the GM sees. */
  async function lob(
    request: Record<string, unknown> = {},
  ): Promise<{ card: AttackCard; messageId: number; posted: ChatMessageBroadcast[] }> {
    const feed = collect(gm);
    const ack = await emitAck<AttackRollResult>(player, 'attack:roll', {
      characterId,
      attackerTokenId: throwerTokenId,
      targetPoint: AIM,
      request: { weaponRowId: 'w-grenade', mode: 'single', modifier: 20, ...request },
    });
    if (!ack.ok) throw new Error(`attack:roll failed: ${JSON.stringify(ack)}`);
    await settle();
    const posted = feed.stop();
    const rollMessage = posted.find((entry) => entry.message.roll?.attack);
    const card = rollMessage?.message.roll?.attack as AttackCard | undefined;
    if (!card || !rollMessage) throw new Error('roll message carried no attack card');
    return { card, messageId: rollMessage.message.id, posted };
  }

  /** The token as the GM currently sees it. */
  async function tokenOf(tokenId: string): Promise<TokenView> {
    const sync = waitFor<StateSyncPayload>(gm, 'state:sync');
    await emitAck(gm, 'state:request');
    const token = (await sync).tokens.find((entry) => entry.id === tokenId);
    if (!token) throw new Error('token not found');
    return token;
  }

  /** Clouds hanging on the scene right now, as the player sees them. */
  async function smokeOf(socket: ClientSocket = player): Promise<SmokeView[]> {
    const sync = waitFor<StateSyncPayload>(socket, 'state:sync');
    await emitAck(socket, 'state:request');
    return (await sync).smoke;
  }

  /** Loads a round into the grenade row (the reload path from stage 16g). */
  async function load(ammoId: string | null): Promise<void> {
    const ack = await emitAck(player, 'weapon:reload', {
      characterId,
      weaponRowId: 'w-grenade',
      ammoId,
    });
    if (!ack.ok) throw new Error(`weapon:reload failed: ${JSON.stringify(ack)}`);
  }

  it('sets the table: a thrower and two figures round one square', async () => {
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
          skills: { athletics: 4, handgun: 4, 'resist-torture-drugs': 2 },
          weapons: [
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
            {
              id: 'w-pistol',
              name: 'Zgrzyt 9',
              notes: '',
              compendiumId: 'weapon.zgrzyt-9',
              damage: '2k6',
              ammoCurrent: 40,
              ammoMax: 40,
              ammoType: '',
              rof: '2',
            },
          ],
        },
      },
    });

    const scene = data(await emitAck<SceneView>(gm, 'scene:create', { name: 'Zaułek' }), 'scene');
    sceneId = scene.id;
    await emitAck(gm, 'scene:update', { sceneId, patch: { width: 8000, height: 4000 } });
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'open' });
    const activated = waitFor(player, 'scene:activate');
    await emitAck(gm, 'scene:activate', { sceneId });
    await activated;

    // Well outside the 10 m square, so the thrower is never in their own gas.
    throwerTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Vex',
        x: AIM.x - 50 - 12 * PX_PER_M,
        y: AIM.y - 50,
        ownerId: playerId,
        characterId,
      }),
      'token:create',
    ).id;
    // Tokens are 100 px wide, so a centre sits half a square in: (x+50, y+50).
    mookTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Ganger',
        x: AIM.x - 50,
        y: AIM.y - 50,
        hp: { current: 30, max: 30 },
      }),
      'token:create',
    ).id;
    neighbourTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Kumpel',
        x: AIM.x - 50 + 2 * PX_PER_M,
        y: AIM.y - 50,
        hp: { current: 30, max: 30 },
      }),
      'token:create',
    ).id;
    expect(mookTokenId).not.toBe(neighbourTokenId);
  });

  describe('a forced check instead of a damage roll', () => {
    it('offers no damage and rolls a check for everybody in the square', async () => {
      await load('ammo.sample-gas');
      const { card } = await lob();

      expect(card.hit).toBe(true);
      // „Ta amunicja nie zadaje obrażeń" — no notation, so no „Obrażenia" button.
      expect(card.damageNotation).toBeUndefined();
      // The line says what was rolled against what, without a head count.
      expect(card.detail).toContain('PT 13');
      const names = (card.forcedChecks ?? []).map((check) => check.name);
      expect(names).toContain('Ganger');
      expect(names).toContain('Kumpel');
      // The thrower stands 12 m away and is not in his own gas.
      expect(names).not.toContain('Vex');
    });

    it('takes hit points off whoever failed, and nothing off whoever did not', async () => {
      await load('ammo.sample-gas');
      const before = (await tokenOf(mookTokenId)).hp?.current ?? 0;
      const { card } = await lob();
      const row = (card.forcedChecks ?? []).find((check) => check.name === 'Ganger');
      expect(row).toBeDefined();
      const after = (await tokenOf(mookTokenId)).hp?.current ?? 0;
      if (row!.success) {
        expect(after).toBe(before);
        expect(row!.effect).toBeUndefined();
      } else {
        expect(after).toBeLessThan(before);
        // The card says what it cost, in the table's own words.
        expect(row!.effect).toContain('bezpośrednich');
      }
    });

    it('posts an undoable damage card for each failure, with the round named', async () => {
      await load('ammo.sample-gas');
      const { posted, card } = await lob();
      const failures = (card.forcedChecks ?? []).filter((check) => !check.success);
      const damageCards = posted.filter((entry) => entry.message.damage);
      expect(damageCards).toHaveLength(failures.length);
      for (const entry of damageCards) {
        const log = entry.message.damage as DamageLogEntry;
        expect(log.ammo?.name).toContain('drażniący');
        // Direct damage: the armour neither stops it nor wears down.
        expect(log.armorSp).toBe(0);
        expect(log.armor).toBeUndefined();
      }
    });
  });

  /**
   * Błąd #6 z sesji testów walki 08.08: figura z kartą dostawała czytelne
   * „Uraz oka · na minutę", a statysta — „injury.head-uraz-oka · na minutę".
   * Rana statysty nie jest nigdzie zapisywana (nie ma karty), więc nazwy nie
   * było skąd wziąć i odzywał się fallback na surowe id z pliku amunicji.
   */
  describe('a wound on a figure without a sheet (bug #6)', () => {
    it('names the injury on the card instead of printing its compendium id', async () => {
      const injury = data(
        await emitAck<CompendiumEntry>(gm, 'compendium:upsert', {
          entry: {
            category: 'criticalInjury',
            name: 'Uraz oka (test)',
            table: 'head',
            roll: 4,
            description: 'Widzisz podwójnie.',
          },
        }),
        'compendium:upsert (injury)',
      );
      const round = data(
        await emitAck<CompendiumEntry>(gm, 'compendium:upsert', {
          entry: {
            category: 'ammo',
            name: 'Nabój łzawiący (test)',
            cost: 100,
            costCategory: 'premium',
            patterns: ['grenade'],
            noDamage: true,
            check: {
              skillId: 'resist-torture-drugs',
              skillLabel: 'Odporność na tortury/narkotyki',
              statId: 'will',
              // PT, którego nie da się zdać — karta ma paść za każdym przebiegiem.
              dv: 40,
              failure: { damage: '1k6', injuries: [injury.id], durationS: 60 },
            },
          },
        }),
        'compendium:upsert (ammo)',
      );

      await load(round.id);
      const { card, posted } = await lob();
      const row = (card.forcedChecks ?? []).find((check) => check.name === 'Ganger');
      expect(row?.success).toBe(false);
      expect(row?.effect).toContain('Uraz oka (test)');
      expect(row?.effect).not.toContain('injury.');

      const knocked = posted.find(
        (entry) =>
          (entry.message.damage as DamageLogEntry | undefined)?.targetTokenId === mookTokenId,
      );
      const log = knocked?.message.damage as DamageLogEntry | undefined;
      // Statysta nadal nie dostaje rany na żadną kartę — ale stół wie, o którą
      // ranę chodzi, i to jest cała różnica.
      expect(log?.injuryNote).toContain('Uraz oka (test)');
      expect(log?.injuryNote).toContain('statysta nie ma karty');
      expect(log?.injuryNote).not.toContain('injury.');
      await load('ammo.sample-gas');
    });
  });

  describe('effects that last a minute', () => {
    /** Takes the sleep off both NPCs, so the next round can put it on again. */
    async function wakeEverybody(): Promise<void> {
      for (const tokenId of [mookTokenId, neighbourTokenId]) {
        for (const statusId of ['prone', 'unconscious']) {
          await emitAck(gm, 'token:effect', { tokenId, statusId, active: false });
        }
      }
    }

    /**
     * Throws the sleep round until somebody actually fails the check.
     *
     * Everyone is woken first, and that is not tidiness: a status only counts as
     * „added" when it was not already there, so a target left asleep by the
     * previous test would never produce the card this helper is looking for.
     */
    async function gasUntilAsleep(): Promise<{
      tokenId: string;
      log: DamageLogEntry;
      messageId: number;
    }> {
      for (let attempt = 0; attempt < 25; attempt += 1) {
        await wakeEverybody();
        await load('ammo.sample-sleeper');
        const { posted } = await lob();
        const knocked = posted.find(
          (entry) => (entry.message.damage as DamageLogEntry | undefined)?.statusesAdded?.length,
        );
        if (knocked) {
          const log = knocked.message.damage as DamageLogEntry;
          return { tokenId: log.targetTokenId!, log, messageId: knocked.message.id };
        }
      }
      throw new Error('nobody ever failed the check — the RNG or the round is broken');
    }

    it('puts the statuses on the token and marks them as timed', async () => {
      const { tokenId, log } = await gasUntilAsleep();
      const token = await tokenOf(tokenId);
      expect(token.statuses).toContain('unconscious');
      expect(token.statuses).toContain('prone');

      // Outside a fight nothing counts, so the card carries the GM's button and
      // says as much — this is the whole of the session's „minute" decision.
      expect(log.timed?.statusIds).toEqual(expect.arrayContaining(['prone', 'unconscious']));
      expect(log.timed?.label).toContain('zdejmuje MG');
    }, 20_000);

    it('lets the GM end the minute by hand, and the card stops offering it', async () => {
      const { tokenId, messageId } = await gasUntilAsleep();
      const ack = await emitAck<{ removed: string[] }>(gm, 'effect:expire', {
        tokenId,
        statusIds: ['prone', 'unconscious'],
        messageId,
      });
      expect(data(ack, 'effect:expire').removed.length).toBeGreaterThan(0);
      const token = await tokenOf(tokenId);
      expect(token.statuses).not.toContain('unconscious');
      expect(token.statuses).not.toContain('prone');
    }, 20_000);

    it('refuses a player the button — a minute is the GM’s to call', async () => {
      const { tokenId } = await gasUntilAsleep();
      const ack = await emitAck(player, 'effect:expire', { tokenId, statusIds: ['unconscious'] });
      expect(ack.ok).toBe(false);
    }, 20_000);

    it('drops the statuses by itself once six rounds have passed', async () => {
      // A fight makes the clock run: „na minutę" is six rounds of ten seconds.
      //
      // Only the victims stand in the queue. The thrower deliberately does not:
      // a participant pays an Action per throw, and the helper above may need
      // several before somebody fails their check.
      const combat = data(
        await emitAck<CombatView>(gm, 'combat:start', {
          sceneId,
          tokenIds: [mookTokenId, neighbourTokenId],
        }),
        'combat:start',
      );
      for (const row of combat.combatants) {
        await emitAck(gm, 'combat:set-initiative', { combatantId: row.id, initiative: 10 });
      }
      // Round 1 begins.
      await emitAck(gm, 'combat:next', {});

      const { tokenId } = await gasUntilAsleep();
      expect((await tokenOf(tokenId)).statuses).toContain('unconscious');

      // Two participants, so two „next" per round; fourteen of them clear six.
      try {
        for (let step = 0; step < 14; step += 1) await emitAck(gm, 'combat:next', {});
        expect((await tokenOf(tokenId)).statuses).not.toContain('unconscious');
      } finally {
        // A fight left running would refuse every reload in the tests below.
        await emitAck(gm, 'combat:end', { sceneId });
      }
    }, 30_000);
  });

  describe('smoke', () => {
    it('lays a square on the map that every viewer receives', async () => {
      await load('ammo.sample-smoke');
      const { card } = await lob();
      expect(card.detail).toContain('dym');
      const clouds = await smokeOf(player);
      expect(clouds).toHaveLength(1);
      expect(clouds[0]!.sideM).toBe(10);
      expect(clouds[0]!.penalty).toBe(-4);
      // Snapped to a square centre, exactly as the blast is — which is up to
      // half a square from the point that was aimed at.
      expect(Math.abs(clouds[0]!.x - AIM.x)).toBeLessThanOrEqual(PX_PER_M);
      expect(Math.abs(clouds[0]!.y - AIM.y)).toBeLessThanOrEqual(PX_PER_M);
    });

    it('charges a named −4 to a shot fired from inside it', async () => {
      // Move the shooter onto the cloud, then fire an ordinary round.
      await emitAck(gm, 'token:move', {
        tokenId: throwerTokenId,
        x: AIM.x - 50,
        y: AIM.y - 50 + 2 * PX_PER_M,
        final: true,
      });
      await load(null);
      const feed = collect(gm);
      const ack = await emitAck<AttackRollResult>(player, 'attack:roll', {
        characterId,
        attackerTokenId: throwerTokenId,
        targetTokenId: neighbourTokenId,
        request: { weaponRowId: 'w-pistol', mode: 'single' },
      });
      await settle();
      expect(ack.ok).toBe(true);
      const roll = feed.stop().find((entry) => entry.message.roll?.attack);
      const breakdown = roll?.message.roll?.breakdown ?? [];
      expect(breakdown.some((entry) => entry.label === 'Dym' && entry.value === -4)).toBe(true);
    });

    it('lets the GM clear it, and refuses a player the eraser', async () => {
      expect((await emitAck(player, 'smoke:clear', { sceneId })).ok).toBe(false);
      const ack = await emitAck<{ cleared: number }>(gm, 'smoke:clear', { sceneId });
      expect(data(ack, 'smoke:clear').cleared).toBeGreaterThan(0);
      expect(await smokeOf(player)).toHaveLength(0);
    });
  });

  describe('the roster of checks is not public', () => {
    /** Throws the loaded round and returns the card each side actually got. */
    async function lobAndCompare(): Promise<{
      gmChecks?: RollForcedCheck[];
      playerChecks?: RollForcedCheck[];
    }> {
      const playerFeed = collect(player);
      const gmFeed = collect(gm);
      await emitAck<AttackRollResult>(player, 'attack:roll', {
        characterId,
        attackerTokenId: throwerTokenId,
        targetPoint: AIM,
        request: { weaponRowId: 'w-grenade', mode: 'single', modifier: 20 },
      });
      await settle();
      const gmCard = gmFeed.stop().find((entry) => entry.message.roll?.attack)?.message.roll
        ?.attack as { forcedChecks?: RollForcedCheck[] } | undefined;
      const playerCard = playerFeed.stop().find((entry) => entry.message.roll?.attack)?.message.roll
        ?.attack as { forcedChecks?: RollForcedCheck[] } | undefined;
      return { gmChecks: gmCard?.forcedChecks, playerChecks: playerCard?.forcedChecks };
    }

    it('shows a player their own figures and nobody else’s', async () => {
      // The thrower is still standing where the smoke tests left him — inside
      // the square, which is exactly the case worth proving: he sees himself.
      await load('ammo.sample-gas');
      const { gmChecks, playerChecks } = await lobAndCompare();

      expect((gmChecks ?? []).map((check) => check.name)).toEqual(
        expect.arrayContaining(['Vex', 'Ganger', 'Kumpel']),
      );
      expect((playerChecks ?? []).map((check) => check.name)).toEqual(['Vex']);
    });

    it('drops the list entirely when none of it is the player’s', async () => {
      await emitAck(gm, 'token:move', {
        tokenId: throwerTokenId,
        x: AIM.x - 50 - 12 * PX_PER_M,
        y: AIM.y - 50,
        final: true,
      });
      await load('ammo.sample-gas');
      const { gmChecks, playerChecks } = await lobAndCompare();

      expect((gmChecks ?? []).length).toBeGreaterThan(0);
      // Not `[]`: an empty array makes the card say „nikt nie stał w zasięgu",
      // which would be a lie told to the player whose figures simply are not on
      // the list. No field at all means „nothing here for you".
      expect(playerChecks).toBeUndefined();
    });
  });

  describe('smart ammunition', () => {
    it('offers a second roll after a near miss and takes it against the same DV', async () => {
      await emitAck(gm, 'token:move', {
        tokenId: throwerTokenId,
        x: AIM.x - 50 - 12 * PX_PER_M,
        y: AIM.y - 50,
        final: true,
      });
      await emitAck(player, 'weapon:reload', {
        characterId,
        weaponRowId: 'w-pistol',
        ammoId: 'ammo.sample-guided',
      });

      // A modifier that lands the roll just short: the pistol's DV at this range
      // is 15, so 1d10 − 3 tops out at 7 and „brakło" is always more than 4…
      // which is exactly the case the round must *not* offer to fix.
      let offered: { card: AttackCard; messageId: number } | null = null;
      for (let attempt = 0; attempt < 40 && !offered; attempt += 1) {
        const feed = collect(gm);
        await emitAck<AttackRollResult>(player, 'attack:roll', {
          characterId,
          attackerTokenId: throwerTokenId,
          targetTokenId: neighbourTokenId,
          request: { weaponRowId: 'w-pistol', mode: 'single' },
        });
        await settle(80);
        const message = feed.stop().find((entry) => entry.message.roll?.attack);
        const card = message?.message.roll?.attack as AttackCard | undefined;
        if (card?.smart) offered = { card, messageId: message!.message.id };
      }
      expect(offered).not.toBeNull();
      expect(offered!.card.hit).toBe(false);
      expect(offered!.card.smart!.missedBy).toBeLessThanOrEqual(4);
      expect(offered!.card.smart!.bonus).toBe(10);
      expect(offered!.card.smart!.requires).toBe('Celownik przykładowy');

      const updated = waitFor<{
        message: { roll?: { total: number; critical?: { type: string }; attack?: AttackCard } };
      }>(gm, 'chat:update');
      const ack = await emitAck<{ total: number; hit: boolean }>(player, 'attack:smart', {
        messageId: offered!.messageId,
        characterId,
      });
      const result = data(ack, 'attack:smart');
      // 1k10 + 10 wychodzi najmniej 11 — chyba że padła naturalna jedynka,
      // która zgodnie z zasadą krytyka odejmuje kolejną k10 i schodzi wtedy
      // najniżej do 1 (1 + 10 − 10). Uwaga na kształt: `critical` jest
      // **obiektem** `{ type, extraRoll }`, a nie napisem — poprawka z 15.08
      // porównywała go z `'failure'`, więc nigdy nie łapała fumbla i test dalej
      // pękał, tyle że na naturalnej jedynce, czyli raz na dziesięć przebiegów.
      const rewrittenRoll = (await updated).message.roll;
      expect(result.total).toBeGreaterThanOrEqual(
        rewrittenRoll?.critical?.type === 'fumble' ? 1 : 11,
      );
      const rewritten = rewrittenRoll?.attack;
      expect(rewritten?.detail).toContain('poprawka naboju');
      // The card shows the roll it now claims: one die, the round's bonus, and
      // a total that follows from both.
      expect(rewrittenRoll?.total).toBe(result.total);
      // The offer is spent: pressing it twice must find nothing.
      expect(rewritten?.smart).toBeUndefined();
      const second = await emitAck(player, 'attack:smart', {
        messageId: offered!.messageId,
        characterId,
      });
      expect(second.ok).toBe(false);
    }, 30_000);
  });
});
