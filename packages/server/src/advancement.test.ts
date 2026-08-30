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
  CharacterXpAwardResult,
  CharacterXpHistoryResult,
  CpredCharacterData,
  InvitationSummary,
  SocketAck,
  StateSyncPayload,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Punkty Doświadczenia na żywych gniazdach (etap 29a).
 *
 * `advancement.test.ts` w `shared` liczy trzy drabinki i planer; tutaj
 * sprawdzany jest szew: że wydatek naprawdę schodzi z licznika i podnosi
 * poziom **jednym zapisem**, że rejestr zapamiętuje, co kupiono, że MG rozdaje
 * pulę całemu stołowi jednym zdarzeniem — i że gracz nie ma jak obejść ceny
 * łatą karty.
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
  const firstSync = new Promise<StateSyncPayload>((resolveSync, reject) => {
    const timer = setTimeout(() => reject(new Error('state:sync timeout')), 4000);
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    socket.once('state:sync', (payload: StateSyncPayload) => {
      clearTimeout(timer);
      resolveSync(payload);
    });
  });
  return { socket, firstSync };
}

function emitAck<T = undefined>(
  socket: ClientSocket,
  event: string,
  payload?: unknown,
): Promise<SocketAck<T>> {
  return new Promise((resolveAck, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), 6000);
    const ack = (response: SocketAck<T>) => {
      clearTimeout(timer);
      resolveAck(response);
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
    payload: { name: 'Awanse' },
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
    payload: { name: 'Cyra' },
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

describe('etap 29a: Punkty Doświadczenia', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let soloId: string;
  let npcId: string;

  async function sheetOf(socket: ClientSocket, characterId: string): Promise<CpredCharacterData> {
    const sync = new Promise<StateSyncPayload>((resolveSync, reject) => {
      const timer = setTimeout(() => reject(new Error('state:sync timeout')), 4000);
      socket.once('state:sync', (payload: StateSyncPayload) => {
        clearTimeout(timer);
        resolveSync(payload);
      });
    });
    socket.emit('state:request');
    const found = (await sync).characters.find((entry) => entry.id === characterId);
    if (!found) throw new Error('character missing from sync');
    return found.data as CpredCharacterData;
  }

  it('stawia stół: Solo gracza i BN bez właściciela', async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);

    soloId = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Kord', ownerId: playerId }),
      'character:create',
    ).id;
    npcId = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Barman', ownerId: null }),
      'character:create',
    ).id;
    expect(
      (
        await emitAck(gm, 'character:update', {
          characterId: soloId,
          patch: { data: { roleId: 'solo', roleAbilityRank: 3, skills: { perception: 4 } } },
        })
      ).ok,
    ).toBe(true);
  });

  it('MG rozdaje pulę całemu stołowi jednym zdarzeniem, BN-a pomijając', async () => {
    const result = data(
      await emitAck<CharacterXpAwardResult>(gm, 'character:xp-award', {
        everyone: true,
        amount: 60,
        label: 'sesja 30.08',
      }),
      'character:xp-award',
    );
    // „Po każdej sesji gry MG przyznaje wszystkim graczom" — postać bez
    // właściciela nie jest niczyim graczem.
    expect(result.awarded).toBe(1);
    expect((await sheetOf(player, soloId)).improvementPoints).toBe(60);
    expect((await sheetOf(gm, npcId)).improvementPoints).toBe(0);
  });

  it('gracz nie kupi poziomu, na który go nie stać', async () => {
    const ack = await emitAck(player, 'character:advance', {
      characterId: soloId,
      kind: 'skill',
      skillId: 'perception',
      to: 5,
    });
    expect(ack).toEqual({ ok: false, error: 'NO_POINTS' });
    expect((await sheetOf(player, soloId)).improvementPoints).toBe(60);
  });

  it('wydatek schodzi z licznika i podnosi poziom jednym zapisem', async () => {
    expect(
      (
        await emitAck(gm, 'character:xp-award', {
          characterId: soloId,
          amount: 240,
          label: 'dopłata',
        })
      ).ok,
    ).toBe(true);
    const view = data(
      await emitAck<CharacterView>(player, 'character:advance', {
        characterId: soloId,
        kind: 'skill',
        skillId: 'perception',
        to: 5,
      }),
      'character:advance',
    );
    const sheet = view.data as CpredCharacterData;
    expect(sheet.skills.perception).toBe(5);
    expect(sheet.improvementPoints).toBe(200);
  });

  it('odmawia przeskoku poziomu, choćby PD starczyło', async () => {
    expect(
      await emitAck(player, 'character:advance', {
        characterId: soloId,
        kind: 'skill',
        skillId: 'perception',
        to: 7,
      }),
    ).toEqual({ ok: false, error: 'LEVEL_SKIP' });
  });

  it('Zdolność Specjalna kupuje się drabinką 60/120/…, nie drabinką Umiejętności', async () => {
    // Ranga 3 → 4 kosztuje 240; w sakiewce jest 200, więc najpierw odmowa.
    expect(
      await emitAck(player, 'character:advance', { characterId: soloId, kind: 'ability', to: 4 }),
    ).toEqual({ ok: false, error: 'NO_POINTS' });
    expect((await emitAck(gm, 'character:xp-award', { characterId: soloId, amount: 40 })).ok).toBe(
      true,
    );
    const view = data(
      await emitAck<CharacterView>(player, 'character:advance', {
        characterId: soloId,
        kind: 'ability',
        to: 4,
      }),
      'character:advance',
    );
    const sheet = view.data as CpredCharacterData;
    expect(sheet.roleAbilityRank).toBe(4);
    expect(sheet.improvementPoints).toBe(0);
  });

  it('rejestr pamięta, co kupiono i ile zostało', async () => {
    const history = data(
      await emitAck<CharacterXpHistoryResult>(player, 'character:xp-history', {
        characterId: soloId,
      }),
      'character:xp-history',
    );
    const top = history.entries.slice(0, 4);
    expect(top.map((entry) => entry.kind)).toEqual(['spend', 'award', 'spend', 'award']);
    expect(top[0]).toMatchObject({ label: 'Zmysł Walki 3 → 4', amount: -240, balance: 0 });
    expect(top[2]).toMatchObject({ label: 'Percepcja 4 → 5', amount: -100, balance: 200 });
    // Najstarszy wiersz to pula rozdana całemu stołowi.
    expect(history.entries.at(-1)).toMatchObject({ kind: 'award', label: 'sesja 30.08' });
  });

  it('ręczna zmiana licznika przez MG też zostawia wiersz', async () => {
    expect(
      (
        await emitAck(gm, 'character:update', {
          characterId: soloId,
          patch: { data: { improvementPoints: 25 } },
        })
      ).ok,
    ).toBe(true);
    const history = data(
      await emitAck<CharacterXpHistoryResult>(gm, 'character:xp-history', {
        characterId: soloId,
      }),
      'character:xp-history',
    );
    expect(history.entries[0]).toMatchObject({
      kind: 'adjust',
      amount: 25,
      balance: 25,
      label: 'ręczna zmiana licznika',
    });
  });

  it('cudzej karty gracz nie awansuje i nie widzi jej rejestru', async () => {
    expect(
      await emitAck(player, 'character:advance', {
        characterId: npcId,
        kind: 'skill',
        skillId: 'perception',
        to: 1,
      }),
    ).toEqual({ ok: false, error: 'CHARACTER_NOT_FOUND' });
    expect(await emitAck(player, 'character:xp-history', { characterId: npcId })).toEqual({
      ok: false,
      error: 'CHARACTER_NOT_FOUND',
    });
    expect(
      await emitAck(player, 'character:xp-award', { characterId: soloId, amount: 500 }),
    ).toEqual({ ok: false, error: 'FORBIDDEN' });
  });
});

/**
 * Wieloklasowość na żywych gniazdach (etap 29b, s. 143).
 *
 * `advancement.test.ts` w `shared` sprawdza bramkę i cenę; tutaj szew: że
 * zmiana Roli naprawdę schodzi z licznika **jednym zapisem**, że poprzednia
 * Rola zostaje na karcie i dalej rośnie, i że gracz nie obejdzie ani bramki,
 * ani ceny łatą karty.
 */
describe('etap 29b: wieloklasowość', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let heroId: string;

  async function sheetOf(socket: ClientSocket, characterId: string): Promise<CpredCharacterData> {
    const sync = new Promise<StateSyncPayload>((resolveSync, reject) => {
      const timer = setTimeout(() => reject(new Error('state:sync timeout')), 4000);
      socket.once('state:sync', (payload: StateSyncPayload) => {
        clearTimeout(timer);
        resolveSync(payload);
      });
    });
    socket.emit('state:request');
    const found = (await sync).characters.find((entry) => entry.id === characterId);
    if (!found) throw new Error('character missing from sync');
    return found.data as CpredCharacterData;
  }

  it('stawia stół: Solo ze Zmysłem Walki 3', async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);
    // Kartę stawia gniazdo MG: od 29a łata gracza dotykająca Roli i rangi
    // dostaje FORBIDDEN, a przygotowanie stołu wygląda w teście jak tło.
    heroId = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Wilk', ownerId: playerId }),
      'character:create',
    ).id;
    expect(
      (
        await emitAck(gm, 'character:update', {
          characterId: heroId,
          patch: { data: { roleId: 'solo', roleAbilityRank: 3 } },
        })
      ).ok,
    ).toBe(true);
  });

  it('poniżej czwartego poziomu Zdolności Roli się nie zmienia', async () => {
    expect((await emitAck(gm, 'character:xp-award', { characterId: heroId, amount: 600 })).ok).toBe(
      true,
    );
    expect(
      await emitAck(player, 'character:role-change', { characterId: heroId, roleId: 'nomad' }),
    ).toEqual({ ok: false, error: 'RANK_TOO_LOW' });
  });

  it('kupiony czwarty poziom otwiera drzwi, a nowa Rola kosztuje 60 PD i startuje od 1', async () => {
    // Ranga 3 → 4 kosztuje 240; zostaje 360.
    expect(
      (await emitAck(player, 'character:advance', { characterId: heroId, kind: 'ability', to: 4 }))
        .ok,
    ).toBe(true);
    const view = data(
      await emitAck<CharacterView>(player, 'character:role-change', {
        characterId: heroId,
        roleId: 'nomad',
      }),
      'character:role-change',
    );
    const sheet = view.data as CpredCharacterData;
    expect(sheet.roleId).toBe('nomad');
    expect(sheet.roleAbilityRank).toBe(1);
    expect(sheet.formerRoles).toEqual([{ roleId: 'solo', rank: 4 }]);
    expect(sheet.improvementPoints).toBe(300);
  });

  it('poprzednia Rola rośnie dalej i płaci własnym szczeblem', async () => {
    // Zmysł Walki 4 → 5 kosztuje 300; Moto zostaje na jedynce.
    const view = data(
      await emitAck<CharacterView>(player, 'character:advance', {
        characterId: heroId,
        kind: 'ability',
        roleId: 'solo',
        to: 5,
      }),
      'character:advance',
    );
    const sheet = view.data as CpredCharacterData;
    expect(sheet.formerRoles).toEqual([{ roleId: 'solo', rank: 5 }]);
    expect(sheet.roleAbilityRank).toBe(1);
    expect(sheet.improvementPoints).toBe(0);
  });

  it('rejestr nazywa obie rzeczy po imieniu', async () => {
    const history = data(
      await emitAck<CharacterXpHistoryResult>(player, 'character:xp-history', {
        characterId: heroId,
      }),
      'character:xp-history',
    );
    expect(history.entries[0]).toMatchObject({
      kind: 'spend',
      label: 'Zmysł Walki 4 → 5',
      amount: -300,
    });
    expect(history.entries[1]).toMatchObject({
      kind: 'role',
      label: 'Nomada — nowa Rola (Moto 1)',
      amount: -60,
      balance: 300,
    });
  });

  it('powrót jest darmowy, ale bramka pyta bieżącą Rolę i tak', async () => {
    // Moto stoi na jedynce, więc drzwi są zamknięte — mimo że Zmysł Walki na
    // liście poprzednich Ról ma pięć. „Poprzedniej Roli" z s. 143 znaczy „tej,
    // którą jesteś teraz", i to jest cała bramka trzeciej Roli.
    expect(
      await emitAck(player, 'character:role-change', { characterId: heroId, roleId: 'solo' }),
    ).toEqual({ ok: false, error: 'RANK_TOO_LOW' });
  });

  it('Moto doprowadzone do czwórki otwiera powrót — i nie kosztuje ani punktu', async () => {
    // 1 → 4 to 120 + 180 + 240 = 540 PD.
    expect((await emitAck(gm, 'character:xp-award', { characterId: heroId, amount: 540 })).ok).toBe(
      true,
    );
    for (const to of [2, 3, 4]) {
      expect(
        (await emitAck(player, 'character:advance', { characterId: heroId, kind: 'ability', to }))
          .ok,
      ).toBe(true);
    }
    const view = data(
      await emitAck<CharacterView>(player, 'character:role-change', {
        characterId: heroId,
        roleId: 'solo',
      }),
      'character:role-change',
    );
    const sheet = view.data as CpredCharacterData;
    expect(sheet.roleId).toBe('solo');
    expect(sheet.roleAbilityRank).toBe(5);
    expect(sheet.formerRoles).toEqual([{ roleId: 'nomad', rank: 4 }]);
    // Zero PD w sakiewce, a zmiana i tak przeszła.
    expect(sheet.improvementPoints).toBe(0);
  });

  it('gracz nie dopisze sobie Roli łatą karty', async () => {
    expect(
      await emitAck(player, 'character:update', {
        characterId: heroId,
        patch: { data: { formerRoles: [{ roleId: 'medtech', rank: 9 }] } },
      }),
    ).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect((await sheetOf(player, heroId)).formerRoles).toEqual([{ roleId: 'nomad', rank: 4 }]);
  });

  it('nawet MG nie postawi tej samej Roli dwa razy', async () => {
    expect(
      await emitAck(gm, 'character:update', {
        characterId: heroId,
        patch: { data: { formerRoles: [{ roleId: 'solo', rank: 9 }] } },
      }),
    ).toEqual({ ok: false, error: 'ROLE_TWICE' });
    expect(
      await emitAck(gm, 'character:update', {
        characterId: heroId,
        patch: { data: { formerRoles: [{ roleId: 'zjadacz-ognia', rank: 2 }] } },
      }),
    ).toEqual({ ok: false, error: 'UNKNOWN_ROLE' });
  });
});
