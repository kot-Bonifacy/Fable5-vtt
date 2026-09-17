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
  CpredCharacterData,
  CpredCreationDraft,
  CpredDataPayload,
  CreationDraftView,
  CreationFinishResult,
  CreationRankDraft,
  InvitationSummary,
  PortraitAssetView,
  SocketAck,
  StateSyncPayload,
} from '@vtt/shared';
import {
  CPRED_STAT_IDS,
  buildCpredRegistry,
  withCreationData,
  creationAvailableSkills,
  creationOutcome,
  creationSkillCost,
  creationSkillPointsSpent,
  creationStatPool,
  cpredSkillNeedsSpecialty,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * The character creator (stage 25a), on live sockets.
 *
 * Runs on the committed sample `creation.json` — the same „fresh clone without
 * data/private" path every other suite uses — so the numbers below are the
 * sample's, not the rulebook's.
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
let vexCookie: string;
let vexId: string;
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

/** The refusal code of an ack that must have failed — narrows for `tsc`. */
function refusal<T>(ack: SocketAck<T>): string {
  if (ack.ok) throw new Error('oczekiwano odmowy, a zdarzenie przeszło');
  return ack.error;
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

type Draft = CreationDraftView<CpredCreationDraft>;

async function patch(socket: ClientSocket, body: Record<string, unknown>): Promise<Draft> {
  return data(await emitAck<Draft>(socket, 'creation:patch', { patch: body }), 'creation:patch');
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
    payload: { name: 'Sesja zerowa' },
  });
  const campaignId = (campaignRes.json() as CampaignSummary).id;
  await built.prisma.portraitAsset.createMany({
    data: ['test', 'na-scenie'].map((name) => ({
      campaignId,
      name,
      url: `/uploads/portraits/${name}.png`,
      width: 100,
      height: 100,
    })),
  });

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

describe('wybór portretu w galerii', () => {
  it('reserves atomically, permits draft cropping, releases choices and hides owners', async () => {
    const campaign = await built.prisma.campaign.findFirstOrThrow();
    const invite = await built.app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaign.id}/invitations`,
      headers: { cookie: gmCookie },
      payload: {},
    });
    const token = (invite.json() as InvitationSummary).token;
    const cookies: string[] = [];
    const sockets: ClientSocket[] = [];
    for (const name of ['Portret A', 'Portret B']) {
      const joined = await built.app.inject({
        method: 'POST',
        url: `/api/join/${token}`,
        payload: { name },
      });
      const cookie = cookieOf(joined.headers['set-cookie']);
      cookies.push(cookie);
      const connection = createSocket(cookie);
      await connection.firstSync;
      sockets.push(connection.socket);
      data(await emitAck<Draft>(connection.socket, 'creation:start'), 'start');
    }
    const asset = await built.prisma.portraitAsset.create({
      data: {
        campaignId: campaign.id,
        name: 'Własny rysunek',
        url: '/uploads/portraits/selection-test.png',
        width: 100,
        height: 100,
      },
    });
    const choice = { patch: { portraitUrl: asset.url } };
    const results = await Promise.all(
      sockets.map((socket) => emitAck<Draft>(socket, 'creation:patch', choice)),
    );
    expect(results.filter((ack) => ack.ok)).toHaveLength(1);
    expect(results.filter((ack) => !ack.ok)).toEqual([{ ok: false, error: 'PORTRAIT_TAKEN' }]);
    const winner = results.findIndex((ack) => ack.ok);
    const loser = 1 - winner;
    const list = await built.app.inject({
      method: 'GET',
      url: '/api/portrait-assets',
      headers: { cookie: cookies[loser]! },
    });
    const shown = (list.json() as PortraitAssetView[]).find((row) => row.id === asset.id)!;
    expect(shown.assigned).toBe(true);
    expect(Object.keys(shown).sort()).toEqual([
      'assigned',
      'crop',
      'height',
      'id',
      'name',
      'retired',
      'url',
      'width',
    ]);
    const crop = { assetId: asset.id, crop: { x: 0.3, y: 0.4, zoom: 2 } };
    expect((await emitAck(sockets[winner]!, 'portrait:crop', crop)).ok).toBe(true);
    expect(await emitAck(sockets[loser]!, 'portrait:crop', crop)).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
    await patch(sockets[winner]!, { portraitUrl: null });
    expect((await emitAck(sockets[loser]!, 'creation:patch', choice)).ok).toBe(true);
    await emitAck(sockets[loser]!, 'creation:discard');
    expect((await emitAck(sockets[winner]!, 'creation:patch', choice)).ok).toBe(true);
    expect(
      await emitAck(sockets[winner]!, 'creation:patch', {
        patch: { portraitUrl: '/uploads/portraits/not-in-pool.png' },
      }),
    ).toEqual({ ok: false, error: 'PORTRAIT_NOT_AVAILABLE' });
    await built.prisma.portraitAsset.update({ where: { id: asset.id }, data: { retired: true } });
    expect((await emitAck(sockets[winner]!, 'creation:patch', choice)).ok).toBe(true);
    await patch(sockets[winner]!, { portraitUrl: null });
    expect(await emitAck(sockets[winner]!, 'creation:patch', choice)).toEqual({
      ok: false,
      error: 'PORTRAIT_NOT_AVAILABLE',
    });
    await emitAck(sockets[winner]!, 'creation:discard');
  });
});

describe('GET /api/cpred/data', () => {
  it('serves the registry the server itself validates against', async () => {
    const res = await built.app.inject({
      method: 'GET',
      url: '/api/cpred/data',
      headers: { cookie: vexCookie },
    });
    expect(res.statusCode).toBe(200);
    const payload = res.json() as CpredDataPayload;
    expect(payload.skills.length).toBeGreaterThan(0);
    expect(payload.roles.length).toBe(10);
    const registry = withCreationData(
      buildCpredRegistry({ skills: payload.skills }, { roles: payload.roles }),
      payload.creation,
    );
    expect(registry.creation?.roles).toHaveLength(10);
  });

  it('is not open to the street', async () => {
    const res = await built.app.inject({ method: 'GET', url: '/api/cpred/data' });
    expect(res.statusCode).toBe(401);
  });
});

describe('kreator postaci', () => {
  let vex: ClientSocket;
  let gm: ClientSocket;
  let roleSkills: string[] = [];

  // Existing scenario fixtures must now allocate every point, just like users.
  async function allocateRemaining(socket: ClientSocket): Promise<Draft> {
    const response = await built.app.inject({
      method: 'GET',
      url: '/api/cpred/data',
      headers: { cookie: gmCookie },
    });
    const payload = response.json() as CpredDataPayload;
    const registry = withCreationData(
      buildCpredRegistry({ skills: payload.skills }, { roles: payload.roles }),
      payload.creation,
    );
    const rules = registry.creation!;
    const current = data(await emitAck<Draft>(socket, 'creation:start'), 'start');
    const draft = current.draft;
    const skills = Object.fromEntries(rules.basicSkills.map((id) => [id, rules.limits.skillMin]));
    let remaining =
      rules.skillPoints - creationSkillPointsSpent({ ...draft, skills }, rules, registry);
    for (const id of creationAvailableSkills(draft, rules, registry)) {
      if (id === rules.freeLanguage?.skillId) continue;
      const cost = creationSkillCost(id, 1, rules, registry);
      while ((skills[id] ?? 0) < rules.limits.skillMax && remaining >= cost) {
        skills[id] = (skills[id] ?? 0) + 1;
        remaining -= cost;
      }
    }
    expect(remaining).toBe(0);
    const stats = { ...draft.stats };
    if (draft.method === 'complete') {
      let remainingStats =
        creationStatPool(rules, draft) -
        CPRED_STAT_IDS.reduce((sum, id) => sum + (stats[id] ?? 0), 0);
      for (const id of CPRED_STAT_IDS) {
        const add = Math.min(rules.limits.statMax - (stats[id] ?? 0), remainingStats);
        stats[id] = (stats[id] ?? 0) + add;
        remainingStats -= add;
      }
      expect(remainingStats).toBe(0);
      expect(
        (
          await emitAck(gm, 'creation:set-rank', {
            draftId: current.id,
            statRankId: draft.statRankId,
          })
        ).ok,
      ).toBe(true);
    }
    return patch(socket, {
      skills,
      ...(draft.method === 'complete' ? { stats } : {}),
      skillSpecialties: Object.fromEntries(
        Object.keys(skills)
          .filter(cpredSkillNeedsSpecialty)
          .map((id) => [id, 'Testowa dziedzina']),
      ),
      lifepath: { ...draft.lifepath, language: draft.lifepath.language || 'Testowy' },
    });
  }

  it('opens a fresh draft and hands the same one back on a second click', async () => {
    const vexConn = createSocket(vexCookie);
    const gmConn = createSocket(gmCookie);
    vex = vexConn.socket;
    gm = gmConn.socket;
    await Promise.all([vexConn.firstSync, gmConn.firstSync]);

    const first = data(await emitAck<Draft>(vex, 'creation:start'), 'creation:start');
    expect(first.draft.step).toBe('role');
    expect(first.draft.roleId).toBeNull();

    await patch(vex, { name: 'Zgrzyt' });
    const second = data(await emitAck<Draft>(vex, 'creation:start'), 'creation:start');
    expect(second.draft.name).toBe('Zgrzyt');
  });

  it('refuses a Role that is not in the data files', async () => {
    const ack = await emitAck<Draft>(vex, 'creation:patch', { patch: { roleId: 'wampir' } });
    expect(refusal(ack)).toBe('INVALID_DATA');
  });

  it('refuses stats written by hand when the method is the one that rolls them', async () => {
    await patch(vex, { method: 'edgerunner', roleId: 'solo' });
    const ack = await emitAck<Draft>(vex, 'creation:patch', {
      patch: { stats: Object.fromEntries(CPRED_STAT_IDS.map((id) => [id, 8])) },
    });
    expect(refusal(ack)).toBe('INVALID_DATA');
  });

  it('rolls the spread on the server and puts the card on the chat', async () => {
    const card = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    const rolled = data(await emitAck<Draft>(vex, 'creation:roll'), 'creation:roll');

    for (const id of CPRED_STAT_IDS) {
      const roll = rolled.draft.statRolls[id];
      expect(roll).toBeGreaterThanOrEqual(1);
      expect(roll).toBeLessThanOrEqual(10);
      expect(rolled.draft.stats[id]).toBeGreaterThan(0);
    }

    const message = await card;
    const roll = message.message.roll;
    expect(roll?.notation).toBe('10k10');
    expect(roll?.title).toContain('Rozkład Cech');
    // The card's total is what the spread is worth, not the meaningless sum of
    // ten row numbers.
    const spread = CPRED_STAT_IDS.reduce((sum, id) => sum + (rolled.draft.stats[id] ?? 0), 0);
    expect(roll?.total).toBe(spread);
    expect(roll?.breakdown).toHaveLength(CPRED_STAT_IDS.length);
  });

  it('carries the cup gesture onto the card, so the throw animates for everyone', async () => {
    const card = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    data(
      await emitAck<Draft>(vex, 'creation:roll', {
        gesture: {
          entropy: 'a1b2c3d4',
          strength: 2,
          toss: { dirX: 0, dirY: -1, originX: 0.5, originY: 0.9 },
        },
      }),
      'creation:roll',
    );
    const roll = (await card).message.roll;
    expect(roll?.tossStrength).toBe(2);
    expect(roll?.toss?.dirY).toBe(-1);
  });

  it('reads every rolled stat out of the Role template, not out of thin air', async () => {
    const res = await built.app.inject({
      method: 'GET',
      url: '/api/cpred/data',
      headers: { cookie: vexCookie },
    });
    const payload = res.json() as CpredDataPayload;
    const registry = withCreationData(
      buildCpredRegistry({ skills: payload.skills }, { roles: payload.roles }),
      payload.creation,
    );
    const creation = registry.creation!;
    const solo = creation.roles.find((role) => role.id === 'solo')!;
    roleSkills = solo.skills;

    const current = data(await emitAck<Draft>(vex, 'creation:start'), 'creation:start');
    for (const id of CPRED_STAT_IDS) {
      const roll = current.draft.statRolls[id]!;
      const column = creation.statOrder.indexOf(id);
      expect(current.draft.stats[id]).toBe(solo.statTemplates[roll - 1]![column]);
    }
  });

  it('will not roll for the method that buys its stats', async () => {
    await patch(vex, { method: 'complete' });
    const ack = await emitAck<Draft>(vex, 'creation:roll');
    expect(refusal(ack)).toBe('METHOD_DOES_NOT_ROLL');
    // Switching the method threw the rolled spread away — it was read off a
    // template this method never looks at.
    const back = data(await emitAck<Draft>(vex, 'creation:start'), 'creation:start');
    expect(back.draft.stats.body).toBeUndefined();
  });

  it('drops skills that leave the Role list when the Role changes', async () => {
    await patch(vex, { method: 'edgerunner', roleId: 'netrunner' });
    const netrunner = data(await emitAck<Draft>(vex, 'creation:start'), 'creation:start');
    // Cryptography is a Netrunner's; a Solo has never heard of it.
    await patch(vex, { skills: { ...netrunner.draft.skills, cryptography: 4 } });
    const withCrypto = data(await emitAck<Draft>(vex, 'creation:start'), 'creation:start');
    expect(withCrypto.draft.skills.cryptography).toBe(4);

    const back = await patch(vex, { roleId: 'solo' });
    expect(back.draft.skills.cryptography).toBeUndefined();
  });

  it('refuses to finish a draft the rules are still unhappy about', async () => {
    const ack = await emitAck<CharacterView>(vex, 'creation:finish');
    expect(refusal(ack)).toBe('CREATION_INCOMPLETE');
  });

  it('finishes into a real sheet the player owns, and the draft is gone', async () => {
    await patch(vex, { method: 'edgerunner', roleId: 'solo', name: 'Zgrzyt' });
    data(await emitAck<Draft>(vex, 'creation:roll'), 'creation:roll');
    await patch(vex, { skills: Object.fromEntries(roleSkills.map((id) => [id, 4])) });

    await allocateRemaining(vex);
    const character = data(await emitAck<CharacterView>(vex, 'creation:finish'), 'creation:finish');
    expect(character.name).toBe('Zgrzyt');
    expect(character.ownerId).toBe(vexId);
    const sheet = character.data as CpredCharacterData;
    expect(sheet.roleId).toBe('solo');
    expect(sheet.roleAbilityRank).toBe(4);
    expect(sheet.hpCurrent).toBeGreaterThan(0);
    expect(sheet.skills.athletics).toBe(6);
    // Naprawa 3a: a player's character moves into a container on kibble (s. 105)
    // instead of being skipped by the monthly settlement.
    expect(sheet.lifestyle).toEqual({ level: 'kibble', housing: 'container' });

    // The wizard opens on a clean sheet afterwards, not on the finished one.
    const fresh = data(await emitAck<Draft>(vex, 'creation:start'), 'creation:start');
    expect(fresh.draft.roleId).toBeNull();
    expect(fresh.draft.name).toBe('');
  });

  it('keeps the draft across a reconnect — that is why it is in the database', async () => {
    await patch(vex, { roleId: 'fixer', name: 'Kolec' });
    vex.disconnect();
    const again = createSocket(vexCookie);
    vex = again.socket;
    await again.firstSync;
    const restored = data(await emitAck<Draft>(vex, 'creation:start'), 'creation:start');
    expect(restored.draft.roleId).toBe('fixer');
    expect(restored.draft.name).toBe('Kolec');
  });

  it('throws the draft away on request', async () => {
    const ack = await emitAck(vex, 'creation:discard');
    expect(ack.ok).toBe(true);
    const fresh = data(await emitAck<Draft>(vex, 'creation:start'), 'creation:start');
    expect(fresh.draft.roleId).toBeNull();
  });

  /**
   * The Lifepath (stage 25b), on the committed sample tables.
   *
   * The point of every case here is the same one the stage is built on: the
   * dice are the server's. The wizard may pick a row by hand, but it may not
   * roll one — and what a throw wrote must survive a reconnect, because session
   * zero is a long evening.
   */
  describe('Ścieżka Życia', () => {
    it('rolls one table on the server and writes the row into the draft', async () => {
      await emitAck(vex, 'creation:discard');
      data(await emitAck<Draft>(vex, 'creation:start'), 'creation:start');
      await patch(vex, { roleId: 'solo', name: 'Zgrzyt' });

      const card = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
      const rolled = data(
        await emitAck<Draft>(vex, 'creation:lifepath-roll', { tableIds: ['lifeGoal'] }),
        'creation:lifepath-roll',
      );
      expect(rolled.draft.lifepath.lifeGoal).not.toBe('');

      // The card is the audit trail: „rzuciłem, słowo honoru" is worth nothing.
      const broadcast = await card;
      expect(broadcast.message.roll?.title).toContain('Ścieżka Życia');
      expect(broadcast.message.roll?.breakdown?.[0]?.label).toContain(
        rolled.draft.lifepath.lifeGoal,
      );
    });

    it('answers every question of the path in one throw', async () => {
      const before = data(await emitAck<Draft>(vex, 'creation:start'), 'creation:start');
      const ids = [
        'culture',
        'personality',
        'clothing',
        'hair',
        'affectation',
        'familyBackground',
        'solo.typ',
      ];
      const rolled = data(
        await emitAck<Draft>(vex, 'creation:lifepath-roll', { tableIds: ids }),
        'creation:lifepath-roll',
      );
      expect(rolled.draft.lifepath.culture).not.toBe('');
      expect(rolled.draft.lifepath.hair).not.toBe('');
      expect(rolled.draft.lifepath.familyBackground).not.toBe('');
      // The Role's own question lands among the answers, not in a field.
      expect(rolled.draft.lifepath.roleAnswers.map((a) => a.id)).toContain('solo.typ');
      expect(before.draft.lifepath.culture).toBe('');
    });

    it('refuses a table the chosen Role does not have', async () => {
      const ack = await emitAck<Draft>(vex, 'creation:lifepath-roll', {
        tableIds: ['netrunner.typ'],
      });
      expect(refusal(ack)).toBe('LIFEPATH_TABLE_UNKNOWN');
    });

    it('drops the Role answers when the Role changes, and keeps the rest', async () => {
      const before = data(await emitAck<Draft>(vex, 'creation:start'), 'creation:start');
      expect(before.draft.lifepath.roleAnswers.length).toBeGreaterThan(0);
      const switched = await patch(vex, { roleId: 'netrunner' });
      expect(switched.draft.lifepath.roleAnswers).toEqual([]);
      expect(switched.draft.lifepath.culture).toBe(before.draft.lifepath.culture);
      await patch(vex, { roleId: 'solo' });
    });

    it('rolls how many enemies there are, then a row for each of them', async () => {
      const counted = data(
        await emitAck<Draft>(vex, 'creation:lifepath-count', { group: 'enemies' }),
        'creation:lifepath-count',
      );
      // 1k10 − 7, minimum 0 — three is the most the throw can give.
      expect(counted.draft.lifepath.enemies.length).toBeLessThanOrEqual(3);

      const grown = await patch(vex, {
        lifepath: {
          ...counted.draft.lifepath,
          enemies: [{ id: 'enemy1', name: 'Vex', who: '', cause: '', resources: '', revenge: '' }],
        },
      });
      expect(grown.draft.lifepath.enemies).toHaveLength(1);

      const rolled = data(
        await emitAck<Draft>(vex, 'creation:lifepath-roll', {
          tableIds: ['enemyWho', 'enemyCause'],
          index: 0,
        }),
        'creation:lifepath-roll',
      );
      expect(rolled.draft.lifepath.enemies[0]?.name).toBe('Vex');
      expect(rolled.draft.lifepath.enemies[0]?.who).not.toBe('');
      expect(rolled.draft.lifepath.enemies[0]?.cause).not.toBe('');
    });

    it('refuses a row-bound roll aimed at somebody who is not on the list', async () => {
      const ack = await emitAck<Draft>(vex, 'creation:lifepath-roll', {
        tableIds: ['enemyWho'],
        index: 9,
      });
      expect(refusal(ack)).toBe('LIFEPATH_TARGET_UNKNOWN');
    });

    it('carries the Lifepath onto the finished sheet, Styl line and all', async () => {
      const draft = data(await emitAck<Draft>(vex, 'creation:start'), 'creation:start');
      await patch(vex, {
        lifepath: { ...draft.draft.lifepath, language: 'Polski' },
        skills: Object.fromEntries(roleSkills.map((id) => [id, 2])),
        name: 'Zgrzyt',
      });
      data(await emitAck<Draft>(vex, 'creation:roll'), 'creation:roll');

      await allocateRemaining(vex);
      const character = data(
        await emitAck<CharacterView>(vex, 'creation:finish'),
        'creation:finish',
      );
      const sheet = character.data as CpredCharacterData;
      expect(sheet.lifepath.culture).not.toBe('');
      expect(sheet.lifepath.language).toBe('Polski');
      expect(sheet.lifepath.enemies[0]?.name).toBe('Vex');
      // „Styl" on page one is filled from the three appearance rows rather than
      // left for the player to copy by hand.
      expect(sheet.style).toContain(sheet.lifepath.clothing);
    });
  });

  /* ─────────────────── etap 25c: zakupy, opis, żeton ─────────────────── */

  describe('wyposażenie startowe', () => {
    /** A draft far enough along that only shopping is left to test. */
    async function readyDraft(socket: ClientSocket, name: string): Promise<void> {
      data(await emitAck<Draft>(socket, 'creation:start'), 'creation:start');
      await patch(socket, { method: 'edgerunner', roleId: 'solo', name });
      data(await emitAck<Draft>(socket, 'creation:roll'), 'creation:roll');
    }

    it('takes an item into the basket and back out of it', async () => {
      await readyDraft(vex, 'Kupiec');
      const bought = data(
        await emitAck<Draft>(vex, 'creation:buy', { entryId: 'gear.latarka-taktyczna', delta: 1 }),
        'creation:buy',
      );
      expect(bought.draft.purchases['gear.latarka-taktyczna']).toBe(1);

      const twice = data(
        await emitAck<Draft>(vex, 'creation:buy', { entryId: 'gear.latarka-taktyczna', delta: 1 }),
        'creation:buy',
      );
      expect(twice.draft.purchases['gear.latarka-taktyczna']).toBe(2);

      const back = data(
        await emitAck<Draft>(vex, 'creation:buy', { entryId: 'gear.latarka-taktyczna', delta: -1 }),
        'creation:buy',
      );
      expect(back.draft.purchases['gear.latarka-taktyczna']).toBe(1);
    });

    it('refuses an item above the level the creator shops at', async () => {
      // „Kufer szmuglerski" is 5000 ed — level 4, and session zero shops at 1.
      const ack = await emitAck<Draft>(vex, 'creation:buy', {
        entryId: 'gear.kufer-szmuglerski',
        delta: 1,
      });
      expect(refusal(ack)).toBe('SHOP_TIER_LOCKED:4:1');
    });

    it('refuses the same item to the GM — the starting kit is the point', async () => {
      await readyDraft(gm, 'Handlarz');
      const ack = await emitAck<Draft>(gm, 'creation:buy', {
        entryId: 'weapon.szpon',
        delta: 1,
      });
      expect(refusal(ack)).toBe('SHOP_TIER_LOCKED:2:1');
    });

    it('refuses a basket the budget cannot carry', async () => {
      // A Krawędziarz has 500 ed; ten pistols at 50 ed each is exactly that,
      // and the eleventh is one too many.
      for (let bought = 0; bought < 9; bought += 1) {
        data(
          await emitAck<Draft>(vex, 'creation:buy', { entryId: 'weapon.zgrzyt-9', delta: 1 }),
          'creation:buy',
        );
      }
      // 9 × 50 + the flashlight already in the basket = 470 ed.
      const tenth = await emitAck<Draft>(vex, 'creation:buy', {
        entryId: 'weapon.zgrzyt-9',
        delta: 1,
      });
      expect(refusal(tenth)).toBe('NOT_ENOUGH_EDDIES');
    });

    it('refuses what nobody can carry off a catalogue card', async () => {
      const ack = await emitAck<Draft>(vex, 'creation:buy', {
        entryId: 'cyberware.oko-przykladowe',
        delta: 1,
      });
      expect(refusal(ack)).toBe('NOT_PURCHASABLE');
    });

    it('will not let a patch write the basket', async () => {
      const ack = await emitAck<Draft>(vex, 'creation:patch', {
        patch: { purchases: { 'weapon.zgrzyt-9': 99 } },
      });
      expect(refusal(ack)).toBe('INVALID_DATA');
    });

    it('writes the goods, the change and the audit when the wizard finishes', async () => {
      const skills = Object.fromEntries(roleSkills.map((id) => [id, 2]));
      await patch(vex, { skills, portraitUrl: '/uploads/portraits/test.png', placeToken: false });

      await allocateRemaining(vex);
      const character = data(
        await emitAck<CharacterView>(vex, 'creation:finish'),
        'creation:finish',
      );
      const sheet = character.data as CpredCharacterData;
      // Nine pistols and one flashlight: 470 ed of a 500 ed budget.
      expect(sheet.weapons).toHaveLength(9);
      expect(sheet.gear).toHaveLength(1);
      expect(sheet.eddies).toBe(30);
      expect(character.portraitUrl).toBe('/uploads/portraits/test.png');

      const history = data(
        await emitAck<{ entries: { kind: string; amount: number; label: string }[] }>(
          vex,
          'economy:history',
          { characterId: character.id },
        ),
        'economy:history',
      );
      // The wallet starts at zero and is credited, so the audit answers
      // „skąd te 500 ed" from its first line rather than starting mid-story.
      const kinds = history.entries.map((entry) => entry.kind);
      expect(kinds).toContain('starting');
      expect(kinds.filter((kind) => kind === 'purchase')).toHaveLength(2);
      const cash = history.entries.find((entry) => entry.kind === 'starting');
      expect(cash?.amount).toBe(500);
      expect(cash?.label).toContain('Krawędziarz');
      const guns = history.entries.find((entry) => entry.label.startsWith('Zgrzyt 9'));
      expect(guns?.amount).toBe(-450);
      expect(guns?.label).toBe('Zgrzyt 9 ×9');
    });
  });

  describe('żeton po zakończeniu', () => {
    it('walks the finished character onto the active scene', async () => {
      const scene = data(
        await emitAck<{ id: string }>(gm, 'scene:create', { name: 'Zaułek' }),
        'scene:create',
      );
      expect((await emitAck(gm, 'scene:activate', { sceneId: scene.id })).ok).toBe(true);

      data(await emitAck<Draft>(vex, 'creation:start'), 'creation:start');
      await patch(vex, { method: 'edgerunner', roleId: 'solo', name: 'Na scenie' });
      data(await emitAck<Draft>(vex, 'creation:roll'), 'creation:roll');
      await patch(vex, {
        skills: Object.fromEntries(roleSkills.map((id) => [id, 2])),
        portraitUrl: '/uploads/portraits/na-scenie.png',
      });

      const appeared = waitFor<{ token: { name: string; imageUrl: string | null } }>(
        gm,
        'token:upsert',
      );
      await allocateRemaining(vex);
      const character = data(
        await emitAck<CharacterView>(vex, 'creation:finish'),
        'creation:finish',
      );
      const token = (await appeared).token;
      expect(token.name).toBe('Na scenie');
      // The portrait doubles as the token's art until somebody picks another.
      expect(token.imageUrl).toBe('/uploads/portraits/na-scenie.png');
      expect(character.name).toBe('Na scenie');
    });
  });

  describe('poziom sklepu', () => {
    let shopper: CharacterView;

    it('refuses a player the shelf the campaign has not unlocked', async () => {
      shopper = data(
        await emitAck<CharacterView>(gm, 'character:create', {
          name: 'Kupujący',
          ownerId: vexId,
        }),
        'character:create',
      );
      data(
        await emitAck(gm, 'economy:adjust', { characterId: shopper.id, balance: 5000 }),
        'economy:adjust',
      );
      // „Szpon" is 100 ed — level 2, and a fresh campaign stands at 1.
      const ack = await emitAck(vex, 'economy:buy', {
        characterId: shopper.id,
        entryId: 'weapon.szpon',
      });
      expect(refusal(ack)).toBe('SHOP_TIER_LOCKED:2:1');
    });

    it('lets the GM buy through it — the dial paces the table, not the GM', async () => {
      data(
        await emitAck<{ balance: number }>(gm, 'economy:buy', {
          characterId: shopper.id,
          entryId: 'weapon.szpon',
        }),
        'economy:buy',
      );
    });

    it('reaches every player the moment the GM moves it', async () => {
      const heard = waitFor<{ tier: number }>(vex, 'shop:tier');
      const ack = data(await emitAck<{ tier: number }>(gm, 'shop:tier', { tier: 3 }), 'shop:tier');
      expect(ack.tier).toBe(3);
      expect((await heard).tier).toBe(3);

      // The same purchase the player was refused a moment ago.
      const bought = data(
        await emitAck<{ balance: number }>(vex, 'economy:buy', {
          characterId: shopper.id,
          entryId: 'weapon.szpon',
        }),
        'economy:buy',
      );
      expect(bought.balance).toBeLessThan(5000);
    });

    it('rides along in state:sync for whoever joins later', async () => {
      const late = createSocket(vexCookie);
      expect((await late.firstSync).shopTier).toBe(3);
    });

    it('refuses a level that is not one of the four, and anybody but the GM', async () => {
      expect(refusal(await emitAck(gm, 'shop:tier', { tier: 7 }))).toBe('BAD_REQUEST');
      expect(refusal(await emitAck(vex, 'shop:tier', { tier: 2 }))).toBe('FORBIDDEN');
    });
  });

  it('gives the GM the same wizard, with a character that belongs to nobody', async () => {
    data(await emitAck<Draft>(gm, 'creation:start'), 'creation:start');
    await patch(gm, { method: 'complete', roleId: 'medtech', name: 'Doktor' });
    await patch(gm, { stats: Object.fromEntries(CPRED_STAT_IDS.map((id) => [id, 6])) });
    const res = await built.app.inject({
      method: 'GET',
      url: '/api/cpred/data',
      headers: { cookie: gmCookie },
    });
    const payload = res.json() as CpredDataPayload;
    const registry = withCreationData(
      buildCpredRegistry({ skills: payload.skills }, { roles: payload.roles }),
      payload.creation,
    );
    const basics = registry.creation!.basicSkills;
    await patch(gm, { skills: Object.fromEntries(basics.map((id) => [id, 2])) });

    await allocateRemaining(gm);
    const character = data(await emitAck<CharacterView>(gm, 'creation:finish'), 'creation:finish');
    expect(character.name).toBe('Doktor');
    expect(character.ownerId).toBeNull();
    expect((character.data as CpredCharacterData).stats.body).toBe(6);
    // An NPC pays no rent — the settlement skips a sheet without a lifestyle.
    expect((character.data as CpredCharacterData).lifestyle).toBeNull();
  });

  describe('naprawa 1 — autorytet MG i odporność operacji', () => {
    it('requires a GM-selected rank per draft, ignores legacy self-selected ranks and preserves allocation', async () => {
      await emitAck(vex, 'creation:discard');
      const fresh = data(await emitAck<Draft>(vex, 'creation:start'), 'start');
      const stored = await built.prisma.characterDraft.findUniqueOrThrow({
        where: { id: fresh.id },
      });
      await built.prisma.characterDraft.update({
        where: { id: fresh.id },
        data: { data: JSON.stringify({ ...JSON.parse(stored.data), statRankId: 'minor-hero' }) },
      });
      expect(data(await emitAck<Draft>(vex, 'creation:start'), 'start').draft.statRankId).toBe(
        'starting',
      );
      expect(
        refusal(
          await emitAck(vex, 'creation:patch', {
            patch: { method: 'complete', statRankId: 'minor-hero' },
          }),
        ),
      ).toBe('FORBIDDEN');
      expect(refusal(await emitAck(vex, 'creation:ranks'))).toBe('FORBIDDEN');
      expect(
        refusal(
          await emitAck(vex, 'creation:set-rank', { draftId: fresh.id, statRankId: 'minor-hero' }),
        ),
      ).toBe('FORBIDDEN');
      await patch(vex, { method: 'complete', roleId: 'solo' });
      // Naprawa 2a: no new stats before the GM's rank; stats saved earlier stay.
      expect(refusal(await emitAck(vex, 'creation:patch', { patch: { stats: { body: 7 } } }))).toBe(
        'CREATION_RANK_PENDING',
      );
      const legacy = await built.prisma.characterDraft.findUniqueOrThrow({
        where: { id: fresh.id },
      });
      await built.prisma.characterDraft.update({
        where: { id: fresh.id },
        data: {
          data: JSON.stringify({ ...JSON.parse(legacy.data), stats: { body: 7 } }),
        },
      });
      expect(refusal(await emitAck(vex, 'creation:finish', { draftId: fresh.id }))).toBe(
        'CREATION_RANK_PENDING',
      );
      const notified = waitFor<{ draftId: string; statRankId: string }>(vex, 'creation:rank');
      expect(
        (await emitAck(gm, 'creation:set-rank', { draftId: fresh.id, statRankId: 'minor-hero' }))
          .ok,
      ).toBe(true);
      expect((await notified).draftId).toBe(fresh.id);
      const resumed = data(await emitAck<Draft>(vex, 'creation:start'), 'start');
      expect(resumed.rankApproved).toBe(true);
      expect(resumed.draft.stats.body).toBe(7);
      expect(
        (await patch(vex, { stats: { ...resumed.draft.stats, will: 5 } })).draft.stats,
      ).toEqual({ body: 7, will: 5 });
      await patch(vex, { method: 'edgerunner' });
      const back = await patch(vex, { method: 'complete' });
      expect(back.draft.statRankId).toBe('minor-hero');
      const rows = data(await emitAck<CreationRankDraft[]>(gm, 'creation:ranks'), 'ranks');
      expect(rows.find((row) => row.id === fresh.id)?.statRankId).toBe('minor-hero');
      const own = data(await emitAck<Draft>(gm, 'creation:start'), 'start');
      expect(own.draft.statRankId).toBe('starting');
    });

    it('serializes concurrent patches, rejects stale snapshots and deduplicates a repeated request', async () => {
      await emitAck(gm, 'creation:discard');
      const current = data(await emitAck<Draft>(gm, 'creation:start'), 'start');
      const first = {
        draftId: current.id,
        revision: current.revision,
        requestId: 'first',
        patch: { name: 'Pierwsza' },
      };
      const second = {
        draftId: current.id,
        revision: current.revision,
        requestId: 'second',
        patch: { name: 'Nieaktualna' },
      };
      const replies = await Promise.all([
        emitAck<Draft>(gm, 'creation:patch', first),
        emitAck<Draft>(gm, 'creation:patch', second),
      ]);
      expect(data(replies[0]!, 'first').draft.name).toBe('Pierwsza');
      expect(refusal(replies[1]!)).toBe('DRAFT_CHANGED');
      const retry = data(await emitAck<Draft>(gm, 'creation:patch', first), 'retry');
      expect(retry.revision).toBe(current.revision + 1);
      expect(retry.draft.name).toBe('Pierwsza');
      await emitAck(gm, 'creation:discard');
      await emitAck(gm, 'creation:start');
      expect(refusal(await emitAck(gm, 'creation:patch', first))).toBe('DRAFT_NOT_FOUND');
    });

    it('blocks unspent points for the GM as well as the player', async () => {
      await patch(gm, { method: 'complete', roleId: 'solo', name: 'Punkty' });
      expect(refusal(await emitAck(gm, 'creation:finish'))).toBe('CREATION_INCOMPLETE');
    });

    it('rolls back character, money and goods on a purchase ledger failure, then finishes exactly once', async () => {
      await emitAck(gm, 'creation:discard');
      await emitAck(gm, 'creation:start');
      await patch(gm, {
        method: 'complete',
        roleId: 'solo',
        name: 'Awaria zakupu',
        placeToken: false,
        stats: Object.fromEntries(CPRED_STAT_IDS.map((id) => [id, 6])),
      });
      const ready = await allocateRemaining(gm);
      expect((await emitAck(gm, 'creation:buy', { entryId: 'weapon.zgrzyt-9', delta: 1 })).ok).toBe(
        true,
      );
      const before = await built.prisma.character.count();
      const ledgerBefore = await built.prisma.ledgerEntry.count();
      await built.prisma.$executeRawUnsafe(
        `CREATE TRIGGER fail_creation_purchase BEFORE INSERT ON LedgerEntry WHEN NEW.kind = 'purchase' BEGIN SELECT RAISE(ABORT, 'test purchase failure'); END`,
      );
      try {
        expect(refusal(await emitAck(gm, 'creation:finish', { draftId: ready.id }))).toBe(
          'INTERNAL',
        );
        expect(await built.prisma.character.count()).toBe(before);
        expect(await built.prisma.ledgerEntry.count()).toBe(ledgerBefore);
        expect(
          data(await emitAck<Draft>(gm, 'creation:start'), 'start').draft.purchases[
            'weapon.zgrzyt-9'
          ],
        ).toBe(1);
      } finally {
        await built.prisma.$executeRawUnsafe('DROP TRIGGER fail_creation_purchase');
      }
      const [one, two] = await Promise.all([
        emitAck<CreationFinishResult>(gm, 'creation:finish', { draftId: ready.id }),
        emitAck<CreationFinishResult>(gm, 'creation:finish', { draftId: ready.id }),
      ]);
      const character = data(one, 'finish');
      expect(data(two, 'retry').id).toBe(character.id);
      expect(await built.prisma.character.count()).toBe(before + 1);
      expect((character.data as CpredCharacterData).weapons).toHaveLength(1);
      expect((character.data as CpredCharacterData).eddies).toBe(2500);
      expect(await built.prisma.ledgerEntry.count({ where: { characterId: character.id } })).toBe(
        2,
      );
      expect(await built.prisma.characterDraft.findUnique({ where: { id: ready.id } })).toBeNull();
      // A lost acknowledgement retried after another sketch was opened does not consume that sketch.
      const next = data(await emitAck<Draft>(gm, 'creation:start'), 'new draft');
      expect(
        data(
          await emitAck<CreationFinishResult>(gm, 'creation:finish', { draftId: ready.id }),
          'retry',
        ).id,
      ).toBe(character.id);
      expect(data(await emitAck<Draft>(gm, 'creation:start'), 'start').id).toBe(next.id);
      expect(refusal(await emitAck(vex, 'creation:finish', { draftId: ready.id }))).toBe(
        'DRAFT_NOT_FOUND',
      );
    });

    it('reports token failure separately and repairs it without duplicating the character or token', async () => {
      await emitAck(gm, 'creation:discard');
      await emitAck(gm, 'creation:start');
      await patch(gm, {
        method: 'complete',
        roleId: 'solo',
        name: 'Awaria żetonu',
        placeToken: true,
        stats: Object.fromEntries(CPRED_STAT_IDS.map((id) => [id, 6])),
      });
      const ready = await allocateRemaining(gm);
      await built.prisma.$executeRawUnsafe(
        `CREATE TRIGGER fail_creation_token BEFORE INSERT ON Token BEGIN SELECT RAISE(ABORT, 'test token failure'); END`,
      );
      let result: CreationFinishResult;
      try {
        result = data(
          await emitAck<CreationFinishResult>(gm, 'creation:finish', { draftId: ready.id }),
          'finish',
        );
        expect(result.tokenStatus).toBe('failed');
        expect((result.data as CpredCharacterData).eddies).toBe(2550);
      } finally {
        await built.prisma.$executeRawUnsafe('DROP TRIGGER fail_creation_token');
      }
      const repaired = data(
        await emitAck<CreationFinishResult>(gm, 'creation:finish', { draftId: ready.id }),
        'retry',
      );
      expect(repaired.id).toBe(result!.id);
      expect(repaired.tokenStatus).toBe('placed');
      await emitAck(gm, 'creation:finish', { draftId: ready.id });
      expect(await built.prisma.token.count({ where: { characterId: repaired.id } })).toBe(1);
    });
    it('does not discard a newer draft when an old discard request is repeated', async () => {
      const old = data(await emitAck<Draft>(gm, 'creation:start'), 'start');
      await emitAck(gm, 'creation:discard', { draftId: old.id });
      const newer = data(await emitAck<Draft>(gm, 'creation:start'), 'start');
      await emitAck(gm, 'creation:discard', { draftId: old.id });
      expect(data(await emitAck<Draft>(gm, 'creation:start'), 'start').id).toBe(newer.id);
    });

    it('lets a player write built before the GM set the rank through, with that rank in the reply', async () => {
      await emitAck(vex, 'creation:discard');
      const before = data(await emitAck<Draft>(vex, 'creation:start'), 'start');
      expect(
        (await emitAck(gm, 'creation:set-rank', { draftId: before.id, statRankId: 'minor-hero' }))
          .ok,
      ).toBe(true);
      // The player never saw `creation:rank` (in flight, or briefly offline).
      const reply = data(
        await emitAck<Draft>(vex, 'creation:patch', {
          draftId: before.id,
          revision: before.revision,
          requestId: 'after-rank',
          patch: { name: 'Po randze' },
        }),
        'patch',
      );
      expect(reply.draft.name).toBe('Po randze');
      expect(reply.rankApproved).toBe(true);
      expect(reply.draft.statRankId).toBe('minor-hero');
    });

    it('finishes without an active scene and repairs placement after a scene becomes available', async () => {
      await emitAck(gm, 'creation:discard');
      await emitAck(gm, 'creation:start');
      await patch(gm, {
        method: 'complete',
        roleId: 'solo',
        name: 'Czeka na scenę',
        placeToken: true,
        stats: Object.fromEntries(CPRED_STAT_IDS.map((id) => [id, 6])),
      });
      const ready = await allocateRemaining(gm);
      const active = await built.prisma.scene.findFirstOrThrow({ where: { active: true } });
      await built.prisma.scene.update({ where: { id: active.id }, data: { active: false } });
      let result: CreationFinishResult;
      try {
        result = data(
          await emitAck<CreationFinishResult>(gm, 'creation:finish', { draftId: ready.id }),
          'finish',
        );
        expect(result.tokenStatus).toBe('no-scene');
      } finally {
        await built.prisma.scene.update({ where: { id: active.id }, data: { active: true } });
      }
      const repaired = data(
        await emitAck<CreationFinishResult>(gm, 'creation:finish', { draftId: ready.id }),
        'retry',
      );
      expect(repaired.id).toBe(result!.id);
      expect(repaired.tokenStatus).toBe('placed');
      expect(await built.prisma.token.count({ where: { characterId: repaired.id } })).toBe(1);
    });
  });

  describe('naprawa 2a — minima i Cechy przed rangą', () => {
    it('grants the basic minimums once, keeps them through a reopen and leaves an older draft alone', async () => {
      await emitAck(vex, 'creation:discard');
      await emitAck(vex, 'creation:start');
      const complete = await patch(vex, { method: 'complete' });
      const response = await built.app.inject({
        method: 'GET',
        url: '/api/cpred/data',
        headers: { cookie: gmCookie },
      });
      const payload = response.json() as CpredDataPayload;
      const registry = withCreationData(
        buildCpredRegistry({ skills: payload.skills }, { roles: payload.roles }),
        payload.creation,
      );
      const rules = registry.creation!;
      expect(rules.basicSkills.length).toBeGreaterThan(0);
      for (const id of rules.basicSkills)
        expect(complete.draft.skills[id]).toBe(rules.limits.skillMin);
      const spent = creationSkillPointsSpent(complete.draft, rules, registry);

      const reopened = data(await emitAck<Draft>(vex, 'creation:start'), 'start');
      expect(creationSkillPointsSpent(reopened.draft, rules, registry)).toBe(spent);
      const lowered = await patch(vex, { skills: { [rules.basicSkills[0]!]: 0 } });
      expect(lowered.draft.skills[rules.basicSkills[0]!]).toBe(rules.limits.skillMin);

      // A draft saved before the repair: its skills are what the player left.
      const stored = await built.prisma.characterDraft.findUniqueOrThrow({
        where: { id: reopened.id },
      });
      const old = JSON.parse(stored.data) as Record<string, unknown>;
      delete old.skillMinimaAuto;
      await built.prisma.characterDraft.update({
        where: { id: reopened.id },
        data: { data: JSON.stringify({ ...old, skills: {} }) },
      });
      const legacy = await patch(vex, { roleId: 'solo' });
      expect(legacy.draft.skillMinimaAuto).toBe(false);
      expect(legacy.draft.skills).toEqual({});
      const accepted = await patch(vex, { skillMinimaAuto: true });
      expect(creationSkillPointsSpent(accepted.draft, rules, registry)).toBe(spent);
    });

    it('holds player stats until the GM sets the rank, but never the GM own draft', async () => {
      await emitAck(vex, 'creation:discard');
      const fresh = data(await emitAck<Draft>(vex, 'creation:start'), 'start');
      await patch(vex, { method: 'complete', roleId: 'solo' });
      expect(refusal(await emitAck(vex, 'creation:patch', { patch: { stats: { body: 6 } } }))).toBe(
        'CREATION_RANK_PENDING',
      );
      expect(
        (await emitAck(gm, 'creation:set-rank', { draftId: fresh.id, statRankId: 'starting' })).ok,
      ).toBe(true);
      expect((await patch(vex, { stats: { body: 6 } })).draft.stats.body).toBe(6);

      await emitAck(gm, 'creation:discard');
      await emitAck(gm, 'creation:start');
      await patch(gm, { method: 'complete', roleId: 'solo' });
      expect((await patch(gm, { stats: { body: 4 } })).draft.stats.body).toBe(4);
    });
  });

  describe('naprawa 2b — lista rang MG na żywo', () => {
    it('pushes only the players Kompletny Pakiet drafts to the GM, waiting ones first', async () => {
      let last: CreationRankDraft[] | null = null;
      let leaked = false;
      const onGm = (rows: CreationRankDraft[]) => {
        last = rows;
      };
      const onPlayer = () => {
        leaked = true;
      };
      // The push rides the GM's connection and the ack the player's, so their
      // order is not guaranteed: wait for the list to say what is expected.
      const until = async (check: (rows: CreationRankDraft[]) => boolean) => {
        for (let attempt = 0; attempt < 80; attempt += 1) {
          if (last && check(last)) return;
          await new Promise((done) => setTimeout(done, 25));
        }
        throw new Error(`creation:ranks-sync never matched: ${JSON.stringify(last)}`);
      };
      gm.on('creation:ranks-sync', onGm);
      vex.on('creation:ranks-sync', onPlayer);
      try {
        await emitAck(vex, 'creation:discard');
        const fresh = data(await emitAck<Draft>(vex, 'creation:start'), 'start');
        // A Krawędziarz rolls his stats — no rank to wait for.
        const listed = data(await emitAck<CreationRankDraft[]>(gm, 'creation:ranks'), 'ranks');
        expect(listed.some((row) => row.id === fresh.id)).toBe(false);

        await patch(vex, { method: 'complete' });
        await until((rows) =>
          rows.some((row) => row.id === fresh.id && !row.rankApproved && row.statRankId === null),
        );
        await patch(vex, { name: 'Zgrzyt' });
        await until((rows) =>
          rows.some((row) => row.id === fresh.id && row.characterName === 'Zgrzyt'),
        );
        expect(
          (await emitAck(gm, 'creation:set-rank', { draftId: fresh.id, statRankId: 'minor-hero' }))
            .ok,
        ).toBe(true);
        await until((rows) =>
          rows.some(
            (row) => row.id === fresh.id && row.rankApproved && row.statRankId === 'minor-hero',
          ),
        );

        // The GM's own draft never waits for anybody.
        await emitAck(gm, 'creation:discard');
        await emitAck(gm, 'creation:start');
        await patch(gm, { method: 'complete' });
        const withGm = data(await emitAck<CreationRankDraft[]>(gm, 'creation:ranks'), 'ranks');
        expect(withGm.map((row) => row.userName)).toEqual(['Vex']);

        await emitAck(vex, 'creation:discard');
        await until((rows) => !rows.some((row) => row.id === fresh.id));
        expect(leaked).toBe(false);
      } finally {
        gm.off('creation:ranks-sync', onGm);
        vex.off('creation:ranks-sync', onPlayer);
      }
    });
  });

  describe('naprawa 3a — podsumowanie zgodne z kartą', () => {
    it('writes exactly the sheet the summary computed: goods, change and lifestyle', async () => {
      await emitAck(vex, 'creation:discard');
      data(await emitAck<Draft>(vex, 'creation:start'), 'creation:start');
      const started = await patch(vex, {
        method: 'complete',
        roleId: 'exec',
        name: 'Garnitur',
        placeToken: false,
      });
      expect(
        (
          await emitAck(gm, 'creation:set-rank', {
            draftId: started.id,
            statRankId: started.draft.statRankId,
          })
        ).ok,
      ).toBe(true);
      await patch(vex, { stats: Object.fromEntries(CPRED_STAT_IDS.map((id) => [id, 6])) });
      for (const entryId of ['weapon.zgrzyt-9', 'weapon.zgrzyt-9', 'gear.latarka-taktyczna']) {
        data(await emitAck<Draft>(vex, 'creation:buy', { entryId, delta: 1 }), 'creation:buy');
      }
      const ready = await allocateRemaining(vex);

      // What the client has: the registry of /api/cpred/data and the catalogue
      // of state:sync — nothing the server keeps to itself.
      const res = await built.app.inject({
        method: 'GET',
        url: '/api/cpred/data',
        headers: { cookie: vexCookie },
      });
      const payload = res.json() as CpredDataPayload;
      const registry = withCreationData(
        buildCpredRegistry({ skills: payload.skills }, { roles: payload.roles }),
        payload.creation,
      );
      const { compendium } = await createSocket(vexCookie).firstSync;
      const entries = new Map(compendium.entries.map((entry) => [entry.id, entry]));
      const outcome = creationOutcome(
        ready.draft,
        registry.creation!,
        registry,
        (entryId) => entries.get(entryId),
        { weaponTypeById: new Map(compendium.weaponTypes.map((type) => [type.id, type])) },
        true,
      );

      const finished = data(
        await emitAck<CreationFinishResult>(vex, 'creation:finish', { draftId: ready.id }),
        'creation:finish',
      );
      const sheet = finished.data as CpredCharacterData;
      // Row ids are the only thing the server makes up on its own.
      const withoutRowIds = (value: CpredCharacterData) => ({
        ...value,
        weapons: value.weapons.map(({ id: _id, ...row }) => row),
        armor: value.armor.map(({ id: _id, ...row }) => row),
        gear: value.gear.map(({ id: _id, ...row }) => row),
      });
      expect(withoutRowIds(sheet)).toEqual(withoutRowIds(outcome.sheet));
      expect(outcome.spent).toBe(2 * 50 + 20);
      expect(sheet.eddies).toBe(outcome.budget - outcome.spent);
      expect(sheet.weapons).toHaveLength(2);
      // A Korpo starts in the company conapt on a good prepack (s. 105).
      expect(sheet.lifestyle).toEqual({ level: 'goodPrepack', housing: 'corpoConapt' });
    });
  });
});
