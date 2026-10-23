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
  CharacterView,
  CombatView,
  CombatantView,
  CpredCharacterData,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenView,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { joinUrl } from './test-join.js';
import { dropBottomlessAmmo, withoutBottomlessAmmo } from './ammo-sweep.js';

/**
 * Etap 46c: zapas amunicji na prawdziwych gniazdach — przeładowanie, rzut,
 * zakup i bramka łaty karty. Arytmetykę pudełek sprawdza `ammostock.test.ts`
 * w `shared`; tu chodzi o szew: że odmowa `NO_AMMO` naprawdę nie zjada Akcji,
 * że kule się nie kończą (zasada domowa MG z 23.10), ładunki liczy każda karta
 * — także NPC — a gracz nie dopisze sobie naboi łatą karty.
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
    payload: { login: 'MG', password: GM_PASSWORD },
  });
  gmCookie = cookieOf(login.headers['set-cookie']);

  const campaignRes = await built.app.inject({
    method: 'POST',
    url: '/api/campaigns',
    headers: { cookie: gmCookie },
    payload: { name: 'Kampania zapasu' },
  });
  const campaignId = (campaignRes.json() as CampaignSummary).id;

  // Etap 44b: linki są imienne — wystawia je `joinUrl` przy każdym wejściu.
  const invite = campaignId;

  const joinRes = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, invite, 'Vex'),
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

/** Kaliber pistoletu z publicznej próbki (`weapon-type.sample-pistol`). */
const PISTOL = 'Nabój pistoletowy (przykład)';
/** Kaliber ładunku rzucanego z próbki (`weapon-type.sample-grenade`). */
const CHARGES = 'Ładunki przykładowe';

function box(qty: number, calibre = CHARGES, ammoId: string | null = null, id = `b-${qty}`) {
  return {
    id,
    name: `${ammoId ?? 'zwykła'} · ${calibre}`,
    notes: '',
    qty,
    ammo: { ammoId, calibre, pattern: calibre === CHARGES ? 'grenade' : 'bullet' },
  };
}

describe('etap 46c — zapas amunicji', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;
  let vexId: string;
  let thugId: string;
  let vexTokenId: string;
  let thugTokenId: string;
  let targetTokenId: string;
  let combat: CombatView;

  const pistol = (ammoCurrent: number) => ({
    id: 'w-pistol',
    name: 'Zgrzyt 9',
    notes: '',
    compendiumId: 'weapon.zgrzyt-9',
    damage: '2k6',
    ammoCurrent,
    ammoMax: 10,
    ammoType: PISTOL,
    rof: '2',
  });
  /** Ładunki z magazynkiem — granatnik z próbki: przeładowuje się z zapasu. */
  const launcher = (ammoCurrent: number, ammoMax = 2) => ({
    id: 'w-launch',
    name: 'Wyrzutnia puszek',
    notes: '',
    compendiumId: 'weapon.puszka-hukowa',
    damage: '4k6',
    ammoCurrent,
    ammoMax,
    ammoType: CHARGES,
    rof: '1',
  });
  const can = {
    id: 'w-can',
    name: 'Puszka hukowa',
    notes: '',
    compendiumId: 'weapon.puszka-hukowa',
    damage: '4k6',
    ammoCurrent: 0,
    ammoMax: 0,
    ammoType: CHARGES,
    rof: '1',
  };

  async function sheetOf(id: string): Promise<CpredCharacterData> {
    const sync = waitFor<StateSyncPayload>(gm, 'state:sync');
    await emitAck(gm, 'state:request');
    const character = (await sync).characters.find((c) => c.id === id);
    if (!character) throw new Error('character missing from sync');
    return character.data as CpredCharacterData;
  }

  async function gmPatch(characterId: string, patch: Record<string, unknown>): Promise<void> {
    data(await emitAck(gm, 'character:update', { characterId, patch: { data: patch } }), 'patch');
  }

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

  function actionUsed(view: CombatView, tokenId: string): number {
    return rowOf(view, tokenId).turn?.resources.find((r) => r.id === 'action')?.used ?? -1;
  }

  async function giveTurnTo(tokenId: string): Promise<void> {
    for (let step = 0; step < 8; step += 1) {
      const view = data(await emitAck<CombatView>(gm, 'combat:next', {}), 'combat:next');
      if (view.activeCombatantId === rowOf(view, tokenId).id) return;
    }
    throw new Error('turn never reached that participant');
  }

  function reload(
    socket: ClientSocket,
    characterId: string,
    extra: Record<string, unknown> = {},
    weaponRowId = 'w-launch',
  ) {
    return emitAck<{ ammo: number }>(socket, 'weapon:reload', {
      characterId,
      weaponRowId,
      ...extra,
    });
  }

  it('stawia stół: Vex z pistoletem, wyrzutnią i puszką, Bandzior MG, cel', async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);

    const vex = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Vex', ownerId: playerId }),
      'character:create',
    );
    vexId = vex.id;
    await gmPatch(vexId, {
      stats: { ...(vex.data as CpredCharacterData).stats, ref: 6, dex: 5 },
      skills: { handgun: 5, athletics: 4 },
      weapons: [pistol(2), launcher(1), can],
      eddies: 500,
    });
    const thug = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Bandzior' }),
      'character:create',
    );
    thugId = thug.id;
    await gmPatch(thugId, { skills: { handgun: 3 }, weapons: [pistol(0), launcher(0)] });

    const scene = data(await emitAck<SceneView>(gm, 'scene:create', { name: 'Magazyn' }), 'scene');
    sceneId = scene.id;
    await emitAck(gm, 'scene:update', { sceneId, patch: { width: 3000, height: 2000 } });
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'open' });
    const activated = waitFor(player, 'scene:activate');
    await emitAck(gm, 'scene:activate', { sceneId });
    await activated;

    const token = async (patch: Record<string, unknown>) =>
      data(await emitAck<TokenView>(gm, 'token:create', { sceneId, ...patch }), 'token').id;
    vexTokenId = await token({ name: 'Vex', x: 0, y: 0, ownerId: playerId, characterId: vexId });
    thugTokenId = await token({ name: 'Bandzior', x: 4 * PX_PER_M, y: 0, characterId: thugId });
    targetTokenId = await token({
      name: 'Kurier',
      x: 8 * PX_PER_M,
      y: 0,
      hp: { current: 30, max: 30 },
    });

    combat = data(
      await emitAck<CombatView>(gm, 'combat:start', {
        sceneId,
        tokenIds: [vexTokenId, thugTokenId, targetTokenId],
      }),
      'combat:start',
    );
    for (const [tokenId, initiative] of [
      [vexTokenId, 20],
      [thugTokenId, 10],
      [targetTokenId, 5],
    ] as const) {
      combat = data(
        await emitAck<CombatView>(gm, 'combat:set-initiative', {
          combatantId: rowOf(combat, tokenId).id,
          initiative,
        }),
        'combat:set-initiative',
      );
    }
  });

  it('bez ładunków przeładowanie wyrzutni odmawia NO_AMMO, a Akcja zostaje', async () => {
    await giveTurnTo(vexTokenId);
    expect(await reload(player, vexId)).toEqual({ ok: false, error: 'NO_AMMO' });
    expect(actionUsed(await tracker(), vexTokenId)).toBe(0);
    expect((await sheetOf(vexId)).weapons[1]!.ammoCurrent).toBe(1);
  });

  it('z zapasu: magazynek pełny, zapas mniejszy dokładnie o tyle, ile weszło, Akcja wydana', async () => {
    await gmPatch(vexId, { gear: [box(5)] });
    expect(await reload(player, vexId)).toEqual({ ok: true, data: { ammo: 2 } });
    expect(actionUsed(await tracker(), vexTokenId)).toBe(1);
    const sheet = await sheetOf(vexId);
    expect(sheet.weapons[1]!.ammoCurrent).toBe(2);
    expect(sheet.gear.map((row) => row.qty)).toEqual([4]);
  });

  it('NPC MG też liczy ładunki, a kule nie kończą się nikomu (23.10)', async () => {
    await giveTurnTo(thugTokenId);
    expect(await reload(gm, thugId)).toEqual({ ok: false, error: 'NO_AMMO' });
    expect(await reload(gm, thugId, {}, 'w-pistol')).toEqual({ ok: true, data: { ammo: 10 } });
    expect((await emitAck(gm, 'combat:end', { sceneId })).ok).toBe(true);
    // Pistolet gracza: pełny magazynek bez pudełek, a ładunki w ekwipunku nietknięte.
    expect(await reload(player, vexId, {}, 'w-pistol')).toEqual({ ok: true, data: { ammo: 10 } });
    expect((await sheetOf(vexId)).gear.map((row) => row.qty)).toEqual([4]);
  });

  it('mały zapas ładuje resztę, a puste pudełko znika', async () => {
    await gmPatch(vexId, { weapons: [pistol(10), launcher(0), can], gear: [box(1)] });
    expect(await reload(player, vexId)).toEqual({ ok: true, data: { ammo: 1 } });
    expect((await sheetOf(vexId)).gear).toEqual([]);
  });

  it('zmiana rodzaju oddaje sztuki z magazynka do zapasu swojego rodzaju', async () => {
    await gmPatch(vexId, {
      weapons: [pistol(3), launcher(1, 4), can],
      gear: [box(3, CHARGES, null, 'zw'), box(6, CHARGES, 'ammo.sample-gas', 'gaz')],
    });
    expect(await reload(player, vexId, { ammoId: 'ammo.sample-gas' })).toEqual({
      ok: true,
      data: { ammo: 4 },
    });
    const sheet = await sheetOf(vexId);
    expect(sheet.weapons[1]).toMatchObject({ ammoCurrent: 4, ammoId: 'ammo.sample-gas' });
    expect(sheet.gear.map((row) => [row.id, row.qty])).toEqual([
      ['zw', 4],
      ['gaz', 2],
    ]);
  });

  it('zmiana rodzaju kul nic nie bierze ani nie oddaje (23.10)', async () => {
    const before = (await sheetOf(vexId)).gear;
    expect(await reload(player, vexId, { ammoId: 'ammo.sample-piercing' }, 'w-pistol')).toEqual({
      ok: true,
      data: { ammo: 10 },
    });
    const sheet = await sheetOf(vexId);
    expect(sheet.weapons[0]).toMatchObject({ ammoCurrent: 10, ammoId: 'ammo.sample-piercing' });
    expect(sheet.gear).toEqual(before);
  });

  it('gracz naboi ręką tylko odejmuje — także kul; pudełek nie dopisze', async () => {
    const loaded = { ...pistol(10), ammoId: 'ammo.sample-piercing' };
    const gas = { ...launcher(4, 4), ammoId: 'ammo.sample-gas' };
    const lower = await emitAck(player, 'character:update', {
      characterId: vexId,
      patch: { data: { weapons: [{ ...loaded, ammoCurrent: 9 }, gas, can] } },
    });
    expect(lower.ok).toBe(true);
    // Magazynek napełnia Przeładowanie (w walce za Akcję), nie łata karty.
    const raise = await emitAck(player, 'character:update', {
      characterId: vexId,
      patch: { data: { weapons: [loaded, gas, can] } },
    });
    expect(raise).toEqual({ ok: false, error: 'AMMO_LOCKED' });
    const more = await emitAck(player, 'character:update', {
      characterId: vexId,
      patch: { data: { gear: [box(99, CHARGES, null, 'zw')] } },
    });
    // Od 48c pudełko to zwykły wiersz wyposażenia: ilości gracz tylko ubywa
    // na każdej karcie, więc odmawia ogólna blokada przedmiotów.
    expect(more).toEqual({ ok: false, error: 'ITEM_LOCKED' });
  });

  it('kupuje paczki ładunków do kalibru i skleja je z pudełkiem tego rodzaju; kul nie', async () => {
    const before = await sheetOf(vexId);
    // Kule się nie kończą (23.10) — nie ma czego kupować.
    expect(
      await emitAck(player, 'economy:buy', {
        characterId: vexId,
        entryId: 'ammo.sample-standard',
        weaponTypeId: 'weapon-type.sample-pistol',
        packs: 2,
      }),
    ).toEqual({ ok: false, error: 'AMMO_MISMATCH' });
    expect(
      await emitAck(gm, 'economy:buy', { characterId: vexId, entryId: 'ammo.sample-gas' }),
    ).toEqual({ ok: false, error: 'AMMO_CALIBRE_REQUIRED' });
    // Ładunek drażniący na sztuki, ponad poziom stołu — kupuje MG na kartę Vex.
    const bought = await emitAck<{ balance: number }>(gm, 'economy:buy', {
      characterId: vexId,
      entryId: 'ammo.sample-gas',
      weaponTypeId: 'weapon-type.sample-grenade',
      packs: 2,
    });
    expect(bought).toEqual({ ok: true, data: { balance: before.eddies - 200 } });
    const after = await sheetOf(vexId);
    expect(after.gear.find((row) => row.id === 'gaz')?.qty).toBe(2 + 2);
    expect(after.gear).toHaveLength(before.gear.length);
  });

  it('ładunek rzucany bez magazynka bierze sztukę z zapasu, a pusty zapas odmawia', async () => {
    await gmPatch(vexId, { gear: [] });
    const throwCan = () =>
      emitAck<AttackRollResult>(player, 'attack:roll', {
        characterId: vexId,
        attackerTokenId: vexTokenId,
        targetPoint: { x: 6 * PX_PER_M, y: 4 * PX_PER_M },
        request: { weaponRowId: 'w-can', mode: 'single' },
      });
    expect(await throwCan()).toEqual({ ok: false, error: 'NO_AMMO' });
    // Zwykły ładunek: na sztuki, 100 ed (amunicja ×1) i poziom 3 (decyzja MG 4 z 09.10) —
    // gracz go nie kupi na starcie kampanii, więc kupuje MG na kartę Vex.
    expect(
      await emitAck(player, 'economy:buy', {
        characterId: vexId,
        entryId: 'ammo.sample-blast',
        weaponTypeId: 'weapon-type.sample-grenade',
      }),
    ).toEqual({ ok: false, error: 'SHOP_TIER_LOCKED:3:1' });
    const before = (await sheetOf(vexId)).eddies;
    data(
      await emitAck(gm, 'economy:buy', {
        characterId: vexId,
        entryId: 'ammo.sample-blast',
        weaponTypeId: 'weapon-type.sample-grenade',
        packs: 1,
      }),
      'economy:buy',
    );
    const stocked = await sheetOf(vexId);
    expect(stocked.eddies).toBe(before - 100);
    expect(stocked.gear.find((row) => row.ammo?.calibre === CHARGES)).toMatchObject({
      qty: 1,
      ammo: { ammoId: null, pattern: 'grenade' },
    });
    expect((await throwCan()).ok).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect((await sheetOf(vexId)).gear.some((row) => row.ammo?.calibre === CHARGES)).toBe(false);
    expect(await throwCan()).toEqual({ ok: false, error: 'NO_AMMO' });
  });
});

describe('sprzątanie bazy po zasadzie z 23.10 — dropBottomlessAmmo', () => {
  it('zdejmuje pudełka kul, śrutu i strzał oraz „Licz amunicję”, granaty zostają', async () => {
    const campaign = await built.prisma.campaign.findFirstOrThrow();
    const raw = {
      eddies: 7,
      ammoTracked: true,
      gear: [
        box(30, PISTOL, null, 'kule'),
        box(2, CHARGES, 'ammo.sample-gas', 'gaz'),
        { id: 'lina', name: 'Lina', notes: '', qty: 1 },
      ],
    };
    const old = await built.prisma.character.create({
      data: { campaignId: campaign.id, name: 'Sprzed zasady', data: JSON.stringify(raw) },
    });
    expect(await dropBottomlessAmmo(built.prisma, built.app.log)).toBeGreaterThanOrEqual(1);
    const after = JSON.parse(
      (await built.prisma.character.findUniqueOrThrow({ where: { id: old.id } })).data,
    ) as Record<string, unknown>;
    expect(after).toEqual({
      eddies: 7,
      gear: [raw.gear[1], raw.gear[2]],
    });
    // Drugi start niczego już nie rusza.
    expect(withoutBottomlessAmmo(JSON.stringify(after))).toBeNull();
  });
});
