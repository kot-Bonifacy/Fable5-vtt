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
  ChatMessageBroadcast,
  CpredCharacterData,
  InvitationSummary,
  RollResult,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenView,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Stage 23c smoke tests: Reputacja i Konfrontacja, on live sockets.
 *
 * The dice are the server's and cannot be forced, so every assertion about a
 * verdict is set up to be **arithmetically inevitable**. Working out those
 * bounds means remembering that a Konfrontacja is a Check and a Check explodes:
 * a natural 10 adds another d10, a natural 1 subtracts one. So the die is worth
 * −9…+20, not 1…10, and:
 *
 *  - Rico (CHA 10 + Reputacja 10) rolls **11 at worst** — more than the flat 10
 *    a statist stares back with, so he cannot lose to one;
 *  - Kolec (CHA 1 − zła sława 10) rolls **11 at best** — less than Rico's
 *    stand-in of 25, so he cannot win against him.
 *
 * Where the outcome genuinely depends on a die (the recognition roll, and the
 * one contest where both ranges touch at 11) the test asserts the card is
 * *consistent with its own numbers* rather than asserting which number fell.
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
  const firstSync = new Promise<StateSyncPayload>((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error('state:sync timeout')), 4000);
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    socket.once('state:sync', (payload: StateSyncPayload) => {
      clearTimeout(timer);
      resolvePromise(payload);
    });
  });
  return { socket, firstSync };
}

function waitFor<T>(socket: ClientSocket, event: string, ms = 4000): Promise<T> {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolvePromise(payload);
    });
  });
}

function emitAck<T = undefined>(
  socket: ClientSocket,
  event: string,
  payload?: unknown,
): Promise<SocketAck<T>> {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), 4000);
    const ack = (response: SocketAck<T>) => {
      clearTimeout(timer);
      resolvePromise(response);
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
    payload: { name: 'Kampania Konfrontacji' },
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

describe('reputacja i konfrontacja', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;
  /** The famous one: CHA 10, Reputation 10 — cannot roll under 21. */
  let heroId: string;
  let heroTokenId: string;
  /** The scared one: CHA 1, and famous only for running away. */
  let cowardId: string;
  let cowardTokenId: string;
  /** Nobody ever statted him: flat 10 in a Konfrontacja, no sheet to answer with. */
  let statistTokenId: string;

  /** The sheet as the server has it right now. */
  async function sheetOf(socket: ClientSocket, characterId: string): Promise<CpredCharacterData> {
    const ack = await emitAck<CharacterView>(socket, 'character:update', {
      characterId,
      patch: {},
    });
    return data(ack, 'character:update').data as CpredCharacterData;
  }

  /** Statuses of a token as the GM currently sees them. */
  async function statusesOf(tokenId: string): Promise<string[]> {
    const sync = waitFor<StateSyncPayload>(gm, 'state:sync');
    await emitAck(gm, 'state:request');
    const token = (await sync).tokens.find((row) => row.id === tokenId);
    if (!token) throw new Error(`token ${tokenId} not in sync`);
    return token.statuses;
  }

  /** Stares somebody down and returns the card the roll produced. */
  async function faceDown(
    socket: ClientSocket,
    characterId: string,
    targetTokenId: string,
  ): Promise<{ messageId: number; roll: RollResult }> {
    const card = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    const ack = await emitAck<{ messageId: number }>(socket, 'facedown:attempt', {
      characterId,
      targetTokenId,
    });
    const { messageId } = data(ack, 'facedown:attempt');
    const roll = (await card).message.roll;
    if (!roll) throw new Error('no roll on the facedown card');
    return { messageId, roll };
  }

  it('stawia scenę: sławny bohater, tchórz i statysta bez karty', async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);

    heroId = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Rico', ownerId: playerId }),
      'character:create',
    ).id;
    cowardId = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Kolec' }),
      'character:create',
    ).id;

    const base = (await sheetOf(gm, heroId)).stats;
    await emitAck(gm, 'character:update', {
      characterId: heroId,
      patch: {
        data: {
          stats: { ...base, cool: 10 },
          reputationSources: [
            { id: 'r1', level: 4, note: 'Bójka w Kabuki', at: '2026-01-05' },
            { id: 'r2', level: 10, note: 'Koncert w Afterlife', at: '2026-08-01' },
          ],
        },
      },
    });
    await emitAck(gm, 'character:update', {
      characterId: cowardId,
      patch: {
        data: {
          stats: { ...base, cool: 1 },
          // „Jeśli słyniesz z tchórzostwa, twój poziom Reputacji traktuje się
          // jako wartość ujemną" — CHA 1 minus 10 is −9 before the die falls.
          reputationSources: [
            { id: 'r1', level: 10, note: 'Uciekł spod Afterlife', notorious: true },
          ],
        },
      },
    });

    const scene = data(await emitAck<SceneView>(gm, 'scene:create', { name: 'Ulica' }), 'scene');
    sceneId = scene.id;
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'open' });
    const activated = waitFor(player, 'scene:activate');
    await emitAck(gm, 'scene:activate', { sceneId });
    await activated;

    heroTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Rico',
        x: 0,
        y: 0,
        ownerId: playerId,
        characterId: heroId,
      }),
      'token:create',
    ).id;
    cowardTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Kolec',
        x: 4 * PX_PER_M,
        y: 0,
        characterId: cowardId,
      }),
      'token:create',
    ).id;
    statistTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Punk',
        x: 8 * PX_PER_M,
        y: 0,
        hp: { current: 20, max: 20 },
      }),
      'token:create',
    ).id;
    expect(heroTokenId).toBeTruthy();
  });

  it('bierze najwyższy poziom Reputacji i nazywa wyczyn w rozbiciu', async () => {
    const { roll } = await faceDown(player, heroId, statistTokenId);
    // Not 4: „zastąpi poprzednią tylko wtedy, jeśli będzie wyższa" (s. 193).
    const reputation = roll.breakdown?.find((row) => row.label.startsWith('Reputacja'));
    expect(reputation?.value).toBe(10);
    expect(reputation?.label).toContain('Koncert w Afterlife');
    expect(roll.breakdown?.find((row) => row.label.startsWith('Charakter'))?.value).toBe(10);
    // CHA 10 + Reputacja 10 + a die worth −9 at its very worst (natural 1,
    // fumbled into a second d10 subtracted).
    expect(roll.total).toBeGreaterThanOrEqual(11);
  });

  it('wygrana Konfrontacja stawia przegranemu pytanie, a nie od razu karę', async () => {
    const { messageId, roll } = await faceDown(player, heroId, statistTokenId);
    expect(roll.opposed?.outcome).toBe('win');
    // The stand-in of a token nobody statted: CHA 5 + Reputacja 0 + pół kości.
    expect(roll.opposed?.detail).toContain('Punk: 10');
    expect(roll.opposed?.detail).toContain('cel bez karty postaci');
    // A statist has no sheet, so „Postaw się" is not offered to anybody.
    expect(roll.opposed?.answerLabel).toBeUndefined();
    expect(roll.opposed?.concede).toMatchObject({
      loserTokenId: statistTokenId,
      winnerTokenId: heroTokenId,
      winnerName: 'Rico',
    });
    expect(roll.opposed?.concede?.chosen).toBeUndefined();
    // Nothing has been applied yet — the loser has not decided.
    expect(await statusesOf(statistTokenId)).not.toContain('intimidated');
    expect(messageId).toBeGreaterThan(0);
  });

  it('„wycofuję się" nie zostawia na tokenie niczego', async () => {
    const { messageId } = await faceDown(player, heroId, statistTokenId);
    const updated = waitFor<ChatMessageBroadcast>(gm, 'chat:update');
    const ack = await emitAck(gm, 'facedown:concede', { messageId, choice: 'withdraw' });
    expect(ack.ok).toBe(true);
    expect((await updated).message.roll?.opposed?.concede?.chosen).toBe('withdraw');
    expect(await statusesOf(statistTokenId)).not.toContain('intimidated');
  });

  it('„nie ustępuję" nakleja Onieśmielonego i zapamiętuje, kogo dotyczy', async () => {
    const { messageId } = await faceDown(player, heroId, statistTokenId);
    const ack = await emitAck(gm, 'facedown:concede', { messageId, choice: 'stand' });
    expect(ack.ok).toBe(true);
    expect(await statusesOf(statistTokenId)).toContain('intimidated');
  });

  it('nie da się rozstrzygnąć tej samej Konfrontacji dwa razy', async () => {
    const { messageId } = await faceDown(player, heroId, statistTokenId);
    expect((await emitAck(gm, 'facedown:concede', { messageId, choice: 'stand' })).ok).toBe(true);
    const again = await emitAck(gm, 'facedown:concede', { messageId, choice: 'withdraw' });
    expect(again).toEqual({ ok: false, error: 'FACEDOWN_ALREADY_SETTLED' });
  });

  it('o wycofaniu decyduje przegrany, nie zwycięzca', async () => {
    const { messageId } = await faceDown(player, heroId, cowardTokenId);
    // Kolec is a GM's NPC; the player who won has no say in what he does.
    const ack = await emitAck(player, 'facedown:concede', { messageId, choice: 'withdraw' });
    expect(ack).toEqual({ ok: false, error: 'FACEDOWN_NOT_THE_LOSER' });
  });

  it('zła sława wchodzi do rzutu ze znakiem minus', async () => {
    // Against Rico, whose stand-in is 25 — out of reach of Kolec's best roll.
    const { roll } = await faceDown(gm, cowardId, heroTokenId);
    const reputation = roll.breakdown?.find((row) => row.label.startsWith('zła sława'));
    expect(reputation?.value).toBe(-10);
    expect(roll.total).toBeLessThanOrEqual(11);
    expect(roll.opposed?.detail).toContain('Rico: 25');
    expect(roll.opposed?.outcome).toBe('loss');
    // The challenger lost their own Konfrontacja, so they are the one who picks.
    expect(roll.opposed?.concede?.loserTokenId).toBe(cowardTokenId);
    expect(roll.opposed?.concede?.winnerName).toBe('Rico');
  });

  /** Karta obrażeń, którą następny test bierze z powrotem. */
  let undoableDamageId = 0;

  it('kara −2 dochodzi do ataku wymierzonego w zwycięzcę i tylko w niego', async () => {
    const { messageId } = await faceDown(gm, cowardId, heroTokenId);
    await emitAck(gm, 'facedown:concede', { messageId, choice: 'stand' });

    await emitAck(gm, 'character:update', {
      characterId: cowardId,
      patch: {
        data: {
          skills: { handgun: 4 },
          weapons: [
            {
              id: 'w1',
              name: 'Zgrzyt 9',
              notes: '',
              compendiumId: 'weapon.zgrzyt-9',
              damage: '2k6',
              ammoCurrent: 8,
              ammoMax: 8,
              ammoType: '',
              rof: '2',
            },
          ],
        },
      },
    });

    const atHero = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    await emitAck(gm, 'attack:roll', {
      characterId: cowardId,
      targetTokenId: heroTokenId,
      request: { weaponRowId: 'w1', mode: 'single' },
    });
    const fearful = (await atHero).message.roll?.breakdown ?? [];
    expect(fearful.find((row) => row.label === 'Przegrana Konfrontacja')?.value).toBe(-2);

    const atPunk = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    await emitAck(gm, 'attack:roll', {
      characterId: cowardId,
      targetTokenId: statistTokenId,
      request: { weaponRowId: 'w1', mode: 'single' },
    });
    const steady = (await atPunk).message.roll?.breakdown ?? [];
    expect(steady.find((row) => row.label === 'Przegrana Konfrontacja')).toBeUndefined();
  });

  it('strach znika, gdy przegrany w końcu powali swojego wroga', async () => {
    // Kolec is still wearing the sticker the previous test put on him.
    expect(await statusesOf(cowardTokenId)).toContain('intimidated');

    // One hit point left, no armour: the weakest 2k6 puts Rico on the floor.
    await emitAck(gm, 'character:update', {
      characterId: heroId,
      patch: { data: { hpCurrent: 1, armor: [] } },
    });

    const damageCard = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    await emitAck(gm, 'character:roll', {
      characterId: cowardId,
      request: { kind: 'damage', weaponRowId: 'w1' },
    });
    const damageMessageId = (await damageCard).message.id;
    const applied = await emitAck<{ messageId: number }>(gm, 'damage:apply', {
      messageId: damageMessageId,
      tokenId: heroTokenId,
    });
    expect(applied.ok).toBe(true);
    expect((await sheetOf(gm, heroId)).hpCurrent).toBe(0);

    // „Modyfikator ... znika, gdy tylko uda ci się pokonać wroga" (s. 194).
    expect(await statusesOf(cowardTokenId)).not.toContain('intimidated');
    // Kartą do cofnięcia jest ta z *zastosowania* obrażeń, nie z ich rzutu.
    undoableDamageId = applied.ok ? (applied.data?.messageId ?? 0) : 0;
  });

  it('„Cofnij" na karcie obrażeń przywraca strach razem z punktami życia', async () => {
    // Rico nigdy nie padł, więc Konfrontacja, którą Kolec przegrał, jest nadal
    // przegrana. Bez tego „Cofnij" oddawałby PW i zostawiał wygraną — połowiczne
    // cofnięcie, którego nikt przy stole nie widzi (sesja naprawcza 21.08).
    const undone = await emitAck(gm, 'damage:undo', { messageId: undoableDamageId });
    expect(undone.ok).toBe(true);
    expect((await sheetOf(gm, heroId)).hpCurrent).toBe(1);
    expect(await statusesOf(cowardTokenId)).toContain('intimidated');

    // Naklejka to połowa kary — druga to adres zwycięzcy przy figurze. Dowodem,
    // że wróciły obie, jest rzut: sama naklejka nie dokłada do niego niczego.
    const atHero = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    await emitAck(gm, 'attack:roll', {
      characterId: cowardId,
      targetTokenId: heroTokenId,
      request: { weaponRowId: 'w1', mode: 'single' },
    });
    const breakdown = (await atHero).message.roll?.breakdown ?? [];
    expect(breakdown.find((row) => row.label === 'Przegrana Konfrontacja')?.value).toBe(-2);
  });

  it('odmawia Konfrontacji z samym sobą', async () => {
    const ack = await emitAck(player, 'facedown:attempt', {
      characterId: heroId,
      targetTokenId: heroTokenId,
    });
    expect(ack).toEqual({ ok: false, error: 'FACEDOWN_SELF' });
  });

  it('„Postaw się" zastępuje pół kości prawdziwym rzutem', async () => {
    // Kolec has a sheet, so the card invites him to answer with real dice.
    const { messageId, roll } = await faceDown(player, heroId, cowardTokenId);
    expect(roll.opposed?.answerLabel).toBe('Postaw się');
    expect(roll.opposed?.defenderTokenId).toBe(cowardTokenId);

    const updated = waitFor<ChatMessageBroadcast>(gm, 'chat:update');
    const ack = await emitAck<{ total: number; outcome: string }>(gm, 'facedown:resist', {
      messageId,
      characterId: cowardId,
    });
    const answer = data(ack, 'facedown:resist');
    // CHA 1 minus a Reputation of 10 for cowardice: 11 at the outside.
    expect(answer.total).toBeLessThanOrEqual(11);
    // Both ranges touch at exactly 11, so the verdict is checked against the
    // two totals rather than asserted outright — a one-in-ten-thousand tie is
    // still a flaky test.
    const expected = roll.total > answer.total ? 'win' : roll.total < answer.total ? 'loss' : 'tie';
    expect(answer.outcome).toBe(expected);
    const card = (await updated).message.roll?.opposed;
    expect(card?.answered).toBe(true);
    expect(card?.answerLabel).toBeUndefined();
    expect(card?.detail).toContain('odpowiedź');
    expect(card?.detail).toContain(`Kolec: ${answer.total}`);
  });

  it('nie pozwala odpowiedzieć drugi raz na tę samą kartę', async () => {
    const { messageId } = await faceDown(player, heroId, cowardTokenId);
    expect((await emitAck(gm, 'facedown:resist', { messageId, characterId: cowardId })).ok).toBe(
      true,
    );
    const again = await emitAck(gm, 'facedown:resist', { messageId, characterId: cowardId });
    expect(again).toEqual({ ok: false, error: 'ALREADY_ANSWERED' });
  });

  it('Reputację przydziela MG — gracz nie dopisze sobie wyczynu', async () => {
    const ack = await emitAck(player, 'character:update', {
      characterId: heroId,
      patch: { data: { reputationSources: [{ id: 'x', level: 10, note: 'sam sobie wpisałem' }] } },
    });
    expect(ack).toEqual({ ok: false, error: 'FORBIDDEN' });
    // …and the sheet still says what the GM wrote.
    const sheet = await sheetOf(gm, heroId);
    expect(sheet.reputationSources.map((row) => row.note)).toEqual([
      'Bójka w Kabuki',
      'Koncert w Afterlife',
    ]);
  });

  it('rzut na rozpoznanie idzie na szept i zgadza się ze swoją własną kością', async () => {
    const ack = await emitAck<{ messageId: number; roll: number; known: boolean }>(
      player,
      'reputation:recognise',
      { characterId: heroId, targetTokenId: cowardTokenId },
    );
    const answer = data(ack, 'reputation:recognise');
    expect(answer.roll).toBeGreaterThanOrEqual(1);
    expect(answer.roll).toBeLessThanOrEqual(10);
    // Kolec is known at level 10 — „niższy od" means a natural 10 still misses.
    expect(answer.known).toBe(answer.roll < 10);
  });

  it('nikt nie rozpoznaje statysty, o którym nikt nie słyszał', async () => {
    const ack = await emitAck<{ roll: number; known: boolean }>(player, 'reputation:recognise', {
      characterId: heroId,
      targetTokenId: statistTokenId,
    });
    // Reputation 0 has no winning roll at all: 1k10 is never below zero.
    expect(data(ack, 'reputation:recognise').known).toBe(false);
  });
});
