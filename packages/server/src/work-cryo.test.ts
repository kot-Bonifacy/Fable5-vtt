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
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { joinUrl } from './test-join.js';

/**
 * Etap 71d2 na żywych gniazdach: Praca Twórcy (G13 — Ulepszanie przedmiotu
 * i Wytwarzanie Testem) i kriopompa Medyka (G19). Planer i tabele sprawdzają
 * `fabrication.test.ts` i `cryo.test.ts` w `shared`; tu — szew: cel z cudzej
 * karty drużyny, warunki pracy wpisane przez serwer, skutek po kościach,
 * surowce przy sukcesie, odmowy, stan „w kriośnie” i jego koniec.
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
    payload: { name: 'Pracownia' },
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

const PX_PER_M = 50;

describe('etap 71d2: Praca Twórcy i kriopompa', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let techId: string;
  let soloId: string;
  let medicId: string;
  let sceneId: string;
  let soloTokenId: string;
  const pistol = {
    id: 'w1',
    name: 'Zgrzyt 9',
    notes: '',
    damage: '2k6',
    ammoCurrent: 10,
    ammoMax: 10,
    ammoType: '',
    rof: '2',
    compendiumId: 'weapon.zgrzyt-9',
  };

  async function sync(): Promise<StateSyncPayload> {
    const next = waitFor<StateSyncPayload>(gm, 'state:sync');
    gm.emit('state:request');
    return next;
  }
  const sheetOf = async (id: string) =>
    (await sync()).characters.find((entry) => entry.id === id)!.data as CpredCharacterData;
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
  const cryo = (payload: Record<string, unknown>, socket?: ClientSocket) =>
    emitAck<{ charges?: number; paid?: number }>(socket ?? player, 'character:cryo', payload);

  it('stawia stół: Technik, Solo i Medyk gracza na jednej scenie', async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);
    const make = async (name: string, extra: object) => {
      const card = data(
        await emitAck<CharacterView>(gm, 'character:create', { name, ownerId: playerId }),
        'character:create',
      );
      expect(
        (await emitAck(gm, 'character:update', { characterId: card.id, patch: { data: extra } }))
          .ok,
      ).toBe(true);
      return card.id;
    };
    techId = await make('Śrubka', {
      roleId: 'tech',
      roleAbilityRank: 4,
      fabrication: { repair: 2, upgrade: 3, fabricate: 2 },
      skills: { 'basic-tech': 6, weaponstech: 6 },
      eddies: 200,
    });
    soloId = await make('Kord', { roleId: 'solo', roleAbilityRank: 2, weapons: [pistol] });
    medicId = await make('Kira', {
      roleId: 'medtech',
      roleAbilityRank: 4,
      medicine: { surgery: 2, cryo: 1 },
      eddies: 1000,
    });
    sceneId = data(await emitAck<SceneView>(gm, 'scene:create', { name: 'Klinika' }), 'scene').id;
    await emitAck(gm, 'scene:activate', { sceneId });
    const place = async (characterId: string, name: string, x: number) =>
      data(
        await emitAck<TokenView>(gm, 'token:create', { sceneId, name, x, y: 0, characterId }),
        'token:create',
      ).id;
    await place(medicId, 'Kira', 0);
    soloTokenId = await place(soloId, 'Kord', PX_PER_M);
  });

  it('lista robót: rzeczy drużyny do Ulepszania z PT, czasem i surowcami pasma', async () => {
    const ack = data(
      await emitAck<CpredRepairTargetsAck>(player, 'repair:targets', { characterId: techId }),
      'repair:targets',
    );
    const gun = ack.items?.find((row) => row.target.rowId === 'w1');
    expect(gun).toMatchObject({
      name: 'Zgrzyt 9',
      ownerName: 'Kord',
      skillId: 'weaponstech',
      task: { dv: 13, minutes: 360 },
      cost: 500,
    });
    expect(gun?.upgradeIds).toEqual(expect.arrayContaining(['slot', 'excellent', 'fastRepair']));
    expect(gun?.upgradeIds).not.toContain('invention');
    // Solo bez Ulepszania — lista bez rzeczy do ulepszenia.
    const solo = data(
      await emitAck<CpredRepairTargetsAck>(player, 'repair:targets', { characterId: soloId }),
      'repair:targets',
    );
    expect(solo.items).toBeUndefined();
  });

  it('G13 Ulepszanie: surowce przed kośćmi, porażka nic nie zjada, sukces stempluje cudzą broń', async () => {
    const upgrade = (upgradeId: string, modifier = 20) =>
      roll(techId, {
        kind: 'itemUpgrade',
        repairTarget: { kind: 'item', characterId: soloId, list: 'weapons', rowId: 'w1' },
        itemUpgradeId: upgradeId,
        modifier,
        work: { dv: -5, minutes: 1, targetName: 'oszustwo', cost: 0 },
      });
    expect(await upgrade('invention')).toEqual({ ok: false, error: 'UPGRADE_BY_GM' });
    expect(await upgrade('armorSp')).toEqual({ ok: false, error: 'UPGRADE_NOT_FOR_ITEM' });
    expect(await upgrade('excellent')).toEqual({ ok: false, error: 'NOT_ENOUGH_EDDIES' });
    await emitAck(gm, 'character:update', {
      characterId: techId,
      patch: { data: { eddies: 900 } },
    });

    expect((await upgrade('excellent', -20)).ok).toBe(true);
    const failed = await lastRoll();
    expect(failed.outcome).toMatchObject({ success: false, label: 'Trzeba zacząć od nowa' });
    expect(failed.outcome?.detail).toContain('PT 13');
    expect(failed.outcome?.detail).toContain('surowce zostają');
    expect(failed.clock?.minutes).toBe(180);
    expect((await sheetOf(techId)).eddies).toBe(900);
    expect((await sheetOf(soloId)).weapons[0]!.upgrade).toBeUndefined();

    expect((await upgrade('excellent')).ok).toBe(true);
    const card = await lastRoll();
    expect(card.title).toBe('Ulepszanie: Zgrzyt 9 (Kord) — Jakość Doskonała');
    expect(card.outcome).toMatchObject({ success: true, label: 'Ulepszone' });
    expect(card.breakdown?.map((row) => row.label)).toContain('Ulepszanie 3');
    expect(card.breakdown?.map((row) => row.label)).not.toContain('Naprawa 2');
    expect(card.clock).toEqual({
      minutes: 360,
      label: 'Ulepszanie: Zgrzyt 9 (Kord) — Jakość Doskonała',
    });
    expect((await sheetOf(techId)).eddies).toBe(400);
    expect((await sheetOf(soloId)).weapons[0]!.upgrade).toBe('excellent');
    expect(await upgrade('slot')).toEqual({ ok: false, error: 'ALREADY_UPGRADED' });
  });

  it('G13 Wytwarzanie: rzecz na kartę Technika, surowce o pasmo niżej, poziom sklepu gracza', async () => {
    const make = (characterId: string, entryId: string, modifier = 20) =>
      roll(characterId, {
        kind: 'fabricate',
        repairTarget: { kind: 'entry', entryId },
        modifier,
      });
    expect(await make(soloId, 'gear.latarka-taktyczna')).toEqual({
      ok: false,
      error: 'NO_FABRICATE_SPECIALTY',
    });
    expect(await make(techId, 'ammo.sample-standard')).toEqual({
      ok: false,
      error: 'NOT_FABRICABLE',
    });
    // Kufer szmuglerski (Luksusowy) stoi ponad poziomem sklepu nowej kampanii.
    const locked = await make(techId, 'gear.kufer-szmuglerski');
    expect(locked.ok).toBe(false);
    expect(String((locked as { error?: string }).error)).toMatch(/^SHOP_TIER_LOCKED/);

    const before = (await sheetOf(techId)).gear.length;
    expect((await make(techId, 'gear.latarka-taktyczna')).ok).toBe(true);
    const card = await lastRoll();
    expect(card.title).toBe('Wytwarzanie: Latarka taktyczna');
    expect(card.outcome).toMatchObject({ success: true, label: 'Wytworzone' });
    expect(card.breakdown?.map((row) => row.label)).toContain('Wytwarzanie 2');
    // Codzienne → surowce z pasma Tanie (10 ed × 3 drobnego sprzętu).
    expect(card.outcome?.detail).toContain('surowce −30 ed');
    expect(card.clock?.minutes).toBe(60);
    const tech = await sheetOf(techId);
    expect(tech.eddies).toBe(370);
    expect(tech.gear).toHaveLength(before + 1);
    expect(tech.gear.at(-1)).toMatchObject({
      name: 'Latarka taktyczna',
      compendiumId: 'gear.latarka-taktyczna',
    });
  });

  it('G19 kriopompa: pierwszy punkt daje pompę, raz', async () => {
    expect(await cryo({ action: 'grant', characterId: soloId })).toEqual({
      ok: false,
      error: 'NOT_A_MEDIC',
    });
    expect(data(await cryo({ action: 'grant', characterId: medicId }), 'grant')).toEqual({
      charges: 1,
    });
    expect(await cryo({ action: 'grant', characterId: medicId })).toEqual({
      ok: false,
      error: 'PUMP_GRANTED',
    });
    const medic = await sheetOf(medicId);
    expect(medic.cryoPumpGranted).toBe(true);
    expect(medic.gear.at(-1)).toMatchObject({ name: 'Kriopompa', qty: 1 });
    // Znacznika odbioru nie wpisze łata gracza.
    expect(
      await emitAck(player, 'character:update', {
        characterId: medicId,
        patch: { data: { cryoPumpGranted: false } },
      }),
    ).toEqual({ ok: false, error: 'FORBIDDEN' });
  });

  it('G19 zamrożenie: ładunek, Nieprzytomny, bez rzutu przeciw śmierci; rozmrożenie zdejmuje status', async () => {
    const pumpId = (await sheetOf(medicId)).gear.at(-1)!.id;
    expect(
      data(
        await cryo({
          action: 'freeze',
          characterId: medicId,
          gearRowId: pumpId,
          targetTokenId: soloTokenId,
        }),
        'freeze',
      ),
    ).toEqual({ charges: 0 });
    const kord = await sheetOf(soloId);
    expect(kord.cryo).toMatchObject({ by: 'Kira', byCharacterId: medicId, addedUnconscious: true });
    expect(kord.cryo?.expiresAtMinute).toBeGreaterThan(0);
    const token = (await sync()).tokens.find((row) => row.id === soloTokenId)!;
    expect(token.statuses).toContain('unconscious');
    expect((await sheetOf(medicId)).gear.at(-1)!.cryoUsed).toBe(1);

    expect(await roll(soloId, { kind: 'deathSave' })).toEqual({ ok: false, error: 'IN_CRYO' });
    expect(
      await emitAck(player, 'character:update', {
        characterId: soloId,
        patch: { data: { cryo: null } },
      }),
    ).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(
      await cryo({
        action: 'freeze',
        characterId: medicId,
        gearRowId: pumpId,
        targetTokenId: soloTokenId,
      }),
    ).toEqual({ ok: false, error: 'NO_CHARGES' });

    expect(data(await cryo({ action: 'thaw', characterId: soloId }), 'thaw')).toEqual({});
    expect((await sheetOf(soloId)).cryo).toBeNull();
    expect((await sync()).tokens.find((row) => row.id === soloTokenId)!.statuses).not.toContain(
      'unconscious',
    );
    expect(await cryo({ action: 'thaw', characterId: soloId })).toEqual({
      ok: false,
      error: 'NOT_FROZEN',
    });
  });

  it('G19 uzupełnienie: 150 ed za ładunek; tydzień w kriośnie mija sam', async () => {
    const pumpId = (await sheetOf(medicId)).gear.at(-1)!.id;
    expect(
      data(await cryo({ action: 'refill', characterId: medicId, gearRowId: pumpId }), 'refill'),
    ).toEqual({ charges: 1, paid: 150 });
    expect((await sheetOf(medicId)).eddies).toBe(850);
    expect(await cryo({ action: 'refill', characterId: medicId, gearRowId: pumpId })).toEqual({
      ok: false,
      error: 'NOTHING_TO_REFILL',
    });

    expect(
      (
        await cryo({
          action: 'freeze',
          characterId: medicId,
          gearRowId: pumpId,
          targetTokenId: soloTokenId,
        })
      ).ok,
    ).toBe(true);
    const until = (await sheetOf(soloId)).cryo!.expiresAtMinute!;
    expect((await emitAck(gm, 'time:set', { minutes: until })).ok).toBe(true);
    expect((await sheetOf(soloId)).cryo).toBeNull();
    const swept = await built.prisma.chatMessage.findFirstOrThrow({
      where: { text: 'Efekty wygasły' },
      orderBy: { id: 'desc' },
    });
    expect(swept.payload).toContain('kriostaza minęła');
  });
});
