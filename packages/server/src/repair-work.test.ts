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
  CpredCharacterData,
  CpredRepairTargetsAck,
  RollResult,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenView,
  VehicleView,
} from '@vtt/shared';
import { readCpredVehicle } from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { joinUrl } from './test-join.js';

/**
 * Etap 71c2 na żywych gniazdach: zwykła naprawa pancerza i auta Testem (G11)
 * i montaż ulepszenia auta przez Technika (G10). Planer i tabele sprawdza
 * `repair-work.test.ts` w `shared`; tu — szew: cel z cudzej karty drużyny,
 * warunki pracy wpisane przez serwer (podrobione wycina), skutek po kościach,
 * surowce przy sukcesie, odmowy i przycisk zegara MG.
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

function waitFor<T>(socket: ClientSocket, event: string, ms = 4000): Promise<T> {
  return new Promise((resolveEvent, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolveEvent(payload);
    });
  });
}

function emitAck<T = undefined>(
  socket: ClientSocket,
  event: string,
  payload?: unknown,
): Promise<SocketAck<T>> {
  return new Promise((resolveAck, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), 6000);
    socket.emit(event, payload, (response: SocketAck<T>) => {
      clearTimeout(timer);
      resolveAck(response);
    });
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
    payload: { name: 'Warsztat' },
  });
  const campaignId = (campaignRes.json() as CampaignSummary).id;
  const joinRes = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, campaignId, 'Bartek'),
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

describe('etap 71c2: zwykła naprawa i montaż Technikiem', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let techId: string;
  let soloId: string;
  let npcId: string;
  let carId: string;
  const jacket = (spCurrent: number) => ({
    id: 'a1',
    name: 'Kurtka',
    notes: '',
    sp: 11,
    spCurrent,
    location: 'body' as const,
  });

  async function sync(): Promise<StateSyncPayload> {
    const next = waitFor<StateSyncPayload>(gm, 'state:sync');
    gm.emit('state:request');
    return next;
  }
  const sheetOf = async (id: string) =>
    (await sync()).characters.find((entry) => entry.id === id)!.data as CpredCharacterData;
  const carStats = async () =>
    readCpredVehicle((await sync()).vehicles.find((row: VehicleView) => row.id === carId)!.system);
  const lastRoll = async (): Promise<RollResult> => {
    const row = await built.prisma.chatMessage.findFirstOrThrow({
      where: { kind: { in: ['roll', 'gmroll'] } },
      orderBy: { id: 'desc' },
    });
    return JSON.parse(row.payload!) as RollResult;
  };
  const roll = (characterId: string, request: Record<string, unknown>) =>
    emitAck<{ messageId: number }>(player, 'character:roll', {
      characterId,
      request,
      visibility: 'public',
    });

  it('stawia stół: Technik i Solo gracza, NPC MG, auto Solo', async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);
    const make = async (name: string, ownerId: string | null, extra: object) => {
      const card = data(
        await emitAck<CharacterView>(gm, 'character:create', {
          name,
          ...(ownerId ? { ownerId } : {}),
        }),
        'character:create',
      );
      expect(
        (await emitAck(gm, 'character:update', { characterId: card.id, patch: { data: extra } }))
          .ok,
      ).toBe(true);
      return card.id;
    };
    techId = await make('Śrubka', playerId, {
      roleId: 'tech',
      roleAbilityRank: 4,
      fabrication: { repair: 2, upgrade: 2 },
      skills: { 'basic-tech': 6, 'land-vehicle-tech': 4 },
      eddies: 1000,
    });
    soloId = await make('Kord', playerId, {
      roleId: 'solo',
      roleAbilityRank: 2,
      armor: [jacket(5)],
    });
    npcId = await make('Ochroniarz', null, { armor: [jacket(4)] });
    const tech = await sheetOf(techId);
    await emitAck(gm, 'character:update', {
      characterId: techId,
      patch: { data: { stats: { ...tech.stats, tech: 8 } } },
    });
    carId = data(
      await emitAck<VehicleView>(gm, 'vehicle:create', {
        catalogId: 'vehicle.sample-kompakt',
        ownerCharacterId: soloId,
      }),
      'vehicle:create',
    ).id;
  });

  it('lista robót: zbroja i auto drużyny, bez NPC-a; ulepszenia tylko z progu Moto 1', async () => {
    const ack = data(
      await emitAck<CpredRepairTargetsAck>(player, 'repair:targets', { characterId: techId }),
      'repair:targets',
    );
    const armor = ack.targets.filter((row) => row.target.kind === 'armor');
    expect(armor.map((row) => row.ownerName)).toEqual(['Kord']);
    expect(armor[0]).toMatchObject({ state: 'OB 5/11', repair: { dv: 13, minutes: 360 } });
    const car = ack.targets.find((row) => row.target.kind === 'vehicle')!;
    expect(car).toMatchObject({ ownerName: 'Kord', state: 'całe', repair: null });
    expect(car.upgrades?.map((row) => row.upgradeId)).toContain('spikes');
    expect(car.upgrades?.map((row) => row.upgradeId)).not.toContain('armoredHull');
    // Cudzą listę gracz dostaje tylko dla własnej karty.
    expect(await emitAck(player, 'repair:targets', { characterId: npcId })).toEqual({
      ok: false,
      error: 'CHARACTER_NOT_FOUND',
    });
  });

  it('porażka: rzecz bez zmian, pół czasu na propozycji zegara; podrobione PT wycięte', async () => {
    const ack = await roll(soloId, {
      kind: 'repair',
      repairTarget: { kind: 'armor', characterId: soloId, armorRowId: 'a1' },
      modifier: -20,
      work: { dv: -99, minutes: 1, targetName: 'oszustwo' },
    });
    expect(ack.ok, JSON.stringify(ack)).toBe(true);
    const card = await lastRoll();
    expect(card.title).toBe('Naprawa: Kurtka (Kord)');
    expect(card.outcome).toMatchObject({ success: false, label: 'Trzeba zacząć od nowa' });
    expect(card.outcome?.detail).toContain('PT 13');
    expect(card.clock).toEqual({ minutes: 180, label: 'Naprawa: Kurtka (Kord)' });
    expect((await sheetOf(soloId)).armor[0]!.spCurrent).toBe(5);
  });

  it('Technik naprawia cudzą kurtkę drużyny; NPC-a MG nie tknie', async () => {
    expect(
      await roll(techId, {
        kind: 'repair',
        repairTarget: { kind: 'armor', characterId: npcId, armorRowId: 'a1' },
      }),
    ).toEqual({ ok: false, error: 'CHARACTER_NOT_FOUND' });
    const ack = await roll(techId, {
      kind: 'repair',
      repairTarget: { kind: 'armor', characterId: soloId, armorRowId: 'a1' },
      modifier: 20,
    });
    expect(ack.ok, JSON.stringify(ack)).toBe(true);
    const card = await lastRoll();
    expect(card.breakdown?.map((row) => row.label)).toContain('Naprawa 2');
    expect(card.outcome).toMatchObject({ success: true, label: 'Naprawione' });
    expect(card.clock).toEqual({ minutes: 360, label: 'Naprawa: Kurtka (Kord)' });
    expect((await sheetOf(soloId)).armor[0]!.spCurrent).toBe(11);
    // Cała — drugi raz nie ma czego naprawiać.
    expect(
      await roll(techId, {
        kind: 'repair',
        repairTarget: { kind: 'armor', characterId: soloId, armorRowId: 'a1' },
      }),
    ).toEqual({ ok: false, error: 'NOTHING_TO_REPAIR' });
  });

  it('roll:clock: tylko MG, raz na kartę, zegar idzie o czas pracy', async () => {
    const before = (await sync()).gameTime.minutes;
    const messageId = (
      await built.prisma.chatMessage.findFirstOrThrow({
        where: { kind: 'roll' },
        orderBy: { id: 'desc' },
      })
    ).id;
    const refused = await emitAck(player, 'roll:clock', { messageId });
    expect(refused.ok).toBe(false);
    expect(data(await emitAck(gm, 'roll:clock', { messageId }), 'roll:clock')).toEqual({
      minutes: 360,
    });
    expect((await sync()).gameTime.minutes).toBe(before + 360);
    expect((await lastRoll()).clock?.applied).toBe(true);
    expect(await emitAck(gm, 'roll:clock', { messageId })).toEqual({
      ok: false,
      error: 'CLOCK_ALREADY_MOVED',
    });
    const timeCard = await built.prisma.chatMessage.findFirstOrThrow({
      where: { kind: 'time' },
      orderBy: { id: 'desc' },
    });
    expect(timeCard.text).toBe('Minęło 6 godzin — Naprawa: Kurtka (Kord)');
  });

  it('auto: PT i czas ze stopnia uszkodzeń, Naprawa pojazdów lądowych', async () => {
    const stats = await carStats();
    expect(
      (
        await emitAck(gm, 'vehicle:update', {
          vehicleId: carId,
          patch: { system: { ...stats, hp: Math.floor(stats.hpMax / 2) } },
        })
      ).ok,
    ).toBe(true);
    const ack = await roll(techId, {
      kind: 'repair',
      repairTarget: { kind: 'vehicle', vehicleId: carId },
      modifier: 20,
    });
    expect(ack.ok, JSON.stringify(ack)).toBe(true);
    const card = await lastRoll();
    expect(card.outcome?.detail).toContain('PT 13');
    expect(card.clock?.minutes).toBe(24 * 60);
    expect(card.breakdown?.[1]?.label).toContain('Naprawa pojazdów lądowych');
    expect((await carStats()).hp).toBe(stats.hpMax);
  });

  it('montaż: Moto 1 tylko, surowce przed kośćmi i z portfela przy sukcesie, raz na auto', async () => {
    const upgrade = (upgradeId: string, modifier = 20) =>
      roll(techId, {
        kind: 'vehicleUpgrade',
        repairTarget: { kind: 'vehicle', vehicleId: carId },
        vehicleUpgradeId: upgradeId,
        modifier,
      });
    expect(await upgrade('armoredHull')).toEqual({ ok: false, error: 'NOT_MOTO_ONE' });
    // Solo bez Ulepszania — odmowa planera.
    expect(
      await roll(soloId, {
        kind: 'vehicleUpgrade',
        repairTarget: { kind: 'vehicle', vehicleId: carId },
        vehicleUpgradeId: 'nitro',
      }),
    ).toEqual({ ok: false, error: 'NO_UPGRADE_SPECIALTY' });
    expect(await upgrade('spikes')).toEqual({ ok: false, error: 'NOT_ENOUGH_EDDIES' });
    await emitAck(gm, 'character:update', {
      characterId: techId,
      patch: { data: { eddies: 5000 } },
    });
    // Porażka: surowce zostają, auto bez zmian, tydzień na zegarze.
    expect((await upgrade('spikes', -20)).ok).toBe(true);
    expect((await lastRoll()).clock?.minutes).toBe(7 * 24 * 60);
    expect((await sheetOf(techId)).eddies).toBe(5000);
    expect((await carStats()).upgrades).toEqual([]);

    expect((await upgrade('spikes')).ok).toBe(true);
    const card = await lastRoll();
    expect(card.outcome).toMatchObject({ success: true, label: 'Zamontowane' });
    expect(card.breakdown?.map((row) => row.label)).toContain('Ulepszanie 2');
    expect(card.clock?.minutes).toBe(14 * 24 * 60);
    expect((await sheetOf(techId)).eddies).toBe(2000);
    expect((await carStats()).upgrades).toMatchObject([{ upgradeId: 'spikes', techUpgrade: true }]);
    expect(await upgrade('nitro')).toEqual({ ok: false, error: 'TECH_UPGRADE_USED' });
  });

  it('w walce naprawy nie ma — od tego jest Prowizorka', async () => {
    await emitAck(gm, 'character:update', {
      characterId: soloId,
      patch: { data: { armor: [jacket(6)] } },
    });
    const sceneId = data(
      await emitAck<SceneView>(gm, 'scene:create', { name: 'Hala' }),
      'scene',
    ).id;
    await emitAck(gm, 'scene:activate', { sceneId });
    const npc = data(
      await emitAck<TokenView>(gm, 'token:create', { sceneId, name: 'Dron', x: 0, y: 0 }),
      'token:create',
    );
    expect((await emitAck(gm, 'combat:start', { sceneId, tokenIds: [npc.id] })).ok).toBe(true);
    expect(
      await roll(techId, {
        kind: 'repair',
        repairTarget: { kind: 'armor', characterId: soloId, armorRowId: 'a1' },
        modifier: 20,
      }),
    ).toEqual({ ok: false, error: 'COMBAT_LOCKED' });
    expect((await sheetOf(soloId)).armor[0]!.spCurrent).toBe(6);
  });
});

describe('P5 bieżące OB własnego pancerza gracz tylko obniża', () => {
  it('łata gracza z wyższym bieżącym OB dostaje ITEM_LOCKED', async () => {
    const playerConn = createSocket(playerCookie);
    const sync = await playerConn.firstSync;
    const kord = sync.characters.find((entry) => entry.name === 'Kord')!;
    const armor = (kord.data as CpredCharacterData).armor;
    const up = armor.map((row) => ({ ...row, spCurrent: row.spCurrent + 1 }));
    expect(
      await emitAck(playerConn.socket, 'character:update', {
        characterId: kord.id,
        patch: { data: { armor: up } },
      }),
    ).toEqual({ ok: false, error: 'ITEM_LOCKED' });
    const down = armor.map((row) => ({ ...row, spCurrent: row.spCurrent - 1 }));
    expect(
      (
        await emitAck(playerConn.socket, 'character:update', {
          characterId: kord.id,
          patch: { data: { armor: down } },
        })
      ).ok,
    ).toBe(true);
  });
});
