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
  CombatView,
  ContainerCreateResult,
  ContainerOpenResult,
  CpredCharacterData,
  ExchangeCounterpartsResult,
  ExchangeCounterpartView,
  InventoryDropResult,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenView,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { joinUrl } from './test-join.js';

/**
 * Etap 46b: pojemniki na prawdziwych gniazdach — skrzynia na zamek, Test
 * zamka przez wezwanie, klucz, wkładanie i wyjmowanie, stos z upuszczenia,
 * który znika pusty, i pojemnik poza walką. Reguły zamka sprawdza
 * `container.test.ts` w `shared`; tu chodzi o szew: że zawartość zamkniętej
 * skrzyni nie wyjeżdża do gracza ani jedną ramką, a stan zamka pisze serwer.
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

/** Ack bez danych, który musiał przejść. */
function done(ack: SocketAck<unknown>, what: string): void {
  if (!ack.ok) throw new Error(`${what} failed: ${JSON.stringify(ack)}`);
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
    payload: { name: 'Kampania pojemników' },
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

/** Nazwa, której gracz nie ma prawa zobaczyć, dopóki skrzynia jest zamknięta. */
const CANARY = 'Kanarek-skrzyni-46b';

describe('etap 46b — pojemniki', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;
  let vexId: string;
  let vexTokenId: string;
  let chest: ContainerCreateResult;
  /** Wszystko, co przyszło do gracza — kanarek zawartości zamkniętej skrzyni. */
  const playerFrames: string[] = [];

  async function syncOf(socket: ClientSocket): Promise<StateSyncPayload> {
    const sync = waitFor<StateSyncPayload>(socket, 'state:sync');
    await emitAck(socket, 'state:request');
    return sync;
  }

  async function sheetOf(id: string): Promise<CpredCharacterData> {
    const character = (await syncOf(gm)).characters.find((c) => c.id === id);
    if (!character) throw new Error('character missing from sync');
    return character.data as CpredCharacterData;
  }

  async function tokenFor(socket: ClientSocket, tokenId: string): Promise<TokenView | undefined> {
    return (await syncOf(socket)).tokens.find((t) => t.id === tokenId);
  }

  async function gmPatch(characterId: string, patch: Record<string, unknown>): Promise<void> {
    data(await emitAck(gm, 'character:update', { characterId, patch: { data: patch } }), 'patch');
  }

  async function counterpart(tokenId: string): Promise<ExchangeCounterpartView | undefined> {
    const result = data(
      await emitAck<ExchangeCounterpartsResult>(player, 'exchange:counterparts', {
        characterId: vexId,
      }),
      'exchange:counterparts',
    );
    return result.counterparts.find((c) => c.tokenId === tokenId);
  }

  function open(tokenId: string, extra: Record<string, unknown> = {}) {
    return emitAck<ContainerOpenResult>(player, 'container:open', {
      tokenId,
      characterId: vexId,
      ...extra,
    });
  }

  function rollCall(callMessageId: number) {
    return emitAck(player, 'character:roll', {
      characterId: vexId,
      request: { kind: 'skill', skillId: 'pick-lock', luckSpent: 0 },
      callMessageId,
    });
  }

  /** Czeka na stan zamka — rozliczenie Testu leci po karcie rzutu. */
  async function lockOf(tokenId: string, want: string): Promise<string | undefined> {
    for (let i = 0; i < 20; i += 1) {
      const lock = (await tokenFor(player, tokenId))?.container?.lock;
      if (lock === want) return lock;
      await new Promise((r) => setTimeout(r, 100));
    }
    return (await tokenFor(player, tokenId))?.container?.lock;
  }

  /** Czeka, aż lista prób zamka pokaże to, czego się spodziewamy. */
  async function triedOf(characterId: string, want: number): Promise<string[] | undefined> {
    for (let i = 0; i < 20; i += 1) {
      const tried = (await sheetOf(characterId)).container?.tried;
      if (tried?.length === want) return tried;
      await new Promise((r) => setTimeout(r, 100));
    }
    return (await sheetOf(characterId)).container?.tried;
  }

  it('stawia stół: Vex przy skrzyni, w skrzyni kanarek', async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);
    player.onAny((event: string, ...args: unknown[]) => {
      playerFrames.push(`${event} ${JSON.stringify(args)}`);
    });

    const vex = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Vex', ownerId: playerId }),
      'character:create',
    );
    vexId = vex.id;
    await gmPatch(vexId, {
      stats: { ...(vex.data as CpredCharacterData).stats, dex: 8 },
      skills: { 'pick-lock': 6 },
      gear: [
        { id: 'g-rope', name: 'Lina', notes: '', qty: 1 },
        { id: 'g-torch', name: 'Latarka', notes: '', qty: 2 },
      ],
      eddies: 100,
    });

    const scene = data(await emitAck<SceneView>(gm, 'scene:create', { name: 'Magazyn' }), 'scene');
    sceneId = scene.id;
    await emitAck(gm, 'scene:update', { sceneId, patch: { width: 3000, height: 2000 } });
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
        characterId: vexId,
      }),
      'token',
    ).id;

    chest = data(
      await emitAck<ContainerCreateResult>(gm, 'container:create', {
        sceneId,
        x: 2 * PX_PER_M,
        y: 0,
        preset: 'chest',
      }),
      'container:create',
    );
    await gmPatch(chest.characterId, {
      gear: [{ id: 'c-canary', name: CANARY, notes: '', qty: 1 }],
      eddies: 50,
    });
    done(
      await emitAck(gm, 'container:config', {
        characterId: chest.characterId,
        lock: 'locked',
        dv: 60,
        skills: ['pick-lock'],
      }),
      'container:config',
    );
  });

  it('gracz widzi skrzynię i jej zamek, ale ani paska PW, ani zawartości', async () => {
    const token = await tokenFor(player, chest.tokenId);
    expect(token?.name).toBe('Skrzynia');
    expect(token?.container).toEqual({ lock: 'locked', pile: false });
    expect(token?.hpShare ?? null).toBeNull();
    expect(token?.imageUrl).toBe('/public/tokens/containers/chest.svg');

    const entry = await counterpart(chest.tokenId);
    expect(entry).toMatchObject({ kind: 'container', lock: 'locked', lockSkills: ['pick-lock'] });
    expect(entry?.items).toBeUndefined();
    expect((await syncOf(player)).characters.some((c) => c.id === chest.characterId)).toBe(false);
  });

  it('MG widzi zawartość zawsze, a łata karty nie zmienia zamka — także MG', async () => {
    const result = data(
      await emitAck<ExchangeCounterpartsResult>(gm, 'exchange:counterparts', {
        characterId: vexId,
        tokenId: chest.tokenId,
      }),
      'gm counterparts',
    );
    const mine = result.counterparts.filter((c) => c.tokenId === chest.tokenId);
    expect(mine.map((c) => c.kind)).toEqual(expect.arrayContaining(['container', 'gm']));
    expect(mine.find((c) => c.kind === 'container')?.items?.map((i) => i.name)).toEqual([CANARY]);
    expect(
      await emitAck(gm, 'character:update', {
        characterId: chest.characterId,
        patch: { data: { container: { lock: 'open' } } },
      }),
    ).toMatchObject({ ok: false, error: 'FORBIDDEN' });
    const config = await emitAck(player, 'container:config', {
      characterId: chest.characterId,
      lock: 'open',
    });
    expect(config.ok).toBe(false);
    const create = await emitAck(player, 'container:create', {
      sceneId,
      x: 0,
      y: 0,
      preset: 'chest',
    });
    expect(create.ok).toBe(false);
  });

  it('z zamkniętej skrzyni nie da się nic wziąć ani włożyć', async () => {
    expect(
      await emitAck(player, 'inventory:take', {
        fromTokenId: chest.tokenId,
        toCharacterId: vexId,
        items: [{ list: 'gear', rowId: 'c-canary' }],
      }),
    ).toMatchObject({ ok: false, error: 'CONTAINER_LOCKED' });
    expect(
      await emitAck(player, 'container:put', {
        fromCharacterId: vexId,
        tokenId: chest.tokenId,
        items: [{ list: 'gear', rowId: 'g-rope' }],
      }),
    ).toMatchObject({ ok: false, error: 'CONTAINER_LOCKED' });
  });

  it('Test zamka: nieudany zapisuje próbę, drugiej nie ma bez zgody MG', async () => {
    const first = data(await open(chest.tokenId), 'open');
    expect(first.outcome).toBe('test');
    expect(typeof first.callMessageId).toBe('number');
    // Drugie „Otwórz zamek” nie wystawia drugiego wezwania.
    expect(data(await open(chest.tokenId), 'open again').callMessageId).toBe(first.callMessageId);
    // Rzut bez wezwania nie otwiera niczego, nawet z adresem skrzyni w żądaniu.
    await emitAck(player, 'character:roll', {
      characterId: vexId,
      request: {
        kind: 'skill',
        skillId: 'pick-lock',
        luckSpent: 0,
        containerTokenId: chest.tokenId,
      },
    });
    expect((await rollCall(first.callMessageId!)).ok).toBe(true);
    expect(await triedOf(chest.characterId, 1)).toEqual([vexId]);
    expect(await lockOf(chest.tokenId, 'locked')).toBe('locked');
    expect(await open(chest.tokenId)).toMatchObject({ ok: false, error: 'LOCK_TRIED' });
    expect((await counterpart(chest.tokenId))?.lockTried).toBe(true);
    expect(playerFrames.some((frame) => frame.includes(CANARY))).toBe(false);
  });

  it('po „Pozwól spróbować znowu” zdany Test otwiera skrzynię i zawartość przychodzi', async () => {
    done(
      await emitAck(gm, 'container:config', {
        characterId: chest.characterId,
        resetTries: true,
        dv: 1,
      }),
      'reset',
    );
    const call = data(await open(chest.tokenId), 'open');
    expect(call.outcome).toBe('test');
    expect((await rollCall(call.callMessageId!)).ok).toBe(true);
    expect(await lockOf(chest.tokenId, 'open')).toBe('open');
    const entry = await counterpart(chest.tokenId);
    expect(entry?.items?.map((i) => i.name)).toEqual([CANARY]);
    expect(entry?.eddies).toBe(50);
  });

  it('wkłada i bierze od ręki, nic nie ginie', async () => {
    done(
      await emitAck(player, 'container:put', {
        fromCharacterId: vexId,
        tokenId: chest.tokenId,
        items: [{ list: 'gear', rowId: 'g-rope' }],
        eddies: 20,
      }),
      'put',
    );
    expect((await sheetOf(chest.characterId)).gear.map((g) => g.name)).toEqual([CANARY, 'Lina']);
    done(
      await emitAck(player, 'inventory:take', {
        fromTokenId: chest.tokenId,
        toCharacterId: vexId,
        items: [{ list: 'gear', rowId: 'c-canary' }],
        eddies: 70,
      }),
      'take',
    );
    const vex = await sheetOf(vexId);
    expect(vex.gear.map((g) => g.name).sort()).toEqual([CANARY, 'Latarka'].sort());
    expect(vex.eddies).toBe(150);
    const box = await sheetOf(chest.characterId);
    expect(box.gear.map((g) => g.name)).toEqual(['Lina']);
    expect(box.eddies).toBe(0);
  });

  it('klucz otwiera swój zamek bez Testu, cudzego nie', async () => {
    const trunk = data(
      await emitAck<ContainerCreateResult>(gm, 'container:create', {
        sceneId,
        x: 0,
        y: 2 * PX_PER_M,
        preset: 'trunk',
      }),
      'trunk',
    );
    const stash = data(
      await emitAck<ContainerCreateResult>(gm, 'container:create', {
        sceneId,
        x: 2 * PX_PER_M,
        y: 2 * PX_PER_M,
        preset: 'stash',
      }),
      'stash',
    );
    for (const box of [trunk, stash]) {
      done(
        await emitAck(gm, 'container:config', { characterId: box.characterId, lock: 'locked' }),
        'lock',
      );
    }
    done(
      await emitAck(gm, 'container:config', { characterId: trunk.characterId, issueKeyTo: vexId }),
      'issue key',
    );
    const key = (await sheetOf(vexId)).gear.find((g) => g.key);
    expect(key?.name).toBe('Klucz: Bagażnik');
    expect((await counterpart(trunk.tokenId))?.hasKey).toBe(true);
    expect(data(await open(trunk.tokenId), 'key').outcome).toBe('open');
    expect(await lockOf(trunk.tokenId, 'open')).toBe('open');
    expect(data(await open(stash.tokenId), 'no key').outcome).toBe('test');
  });

  it('pojemnik nie wchodzi do walki i nie jest celem', async () => {
    const combat = data(
      await emitAck<CombatView>(gm, 'combat:start', {
        sceneId,
        tokenIds: [vexTokenId, chest.tokenId],
      }),
      'combat:start',
    );
    expect(combat.combatants.map((c) => c.tokenId)).toEqual([vexTokenId]);
    const added = data(
      await emitAck<CombatView>(gm, 'combat:add', { tokenIds: [chest.tokenId] }),
      'combat:add',
    );
    expect(added.combatants.map((c) => c.tokenId)).toEqual([vexTokenId]);
    expect(
      await emitAck(player, 'attack:roll', {
        characterId: vexId,
        attackerTokenId: vexTokenId,
        targetTokenId: chest.tokenId,
        request: { weaponRowId: 'x', mode: 'single' },
      }),
    ).toMatchObject({ ok: false, error: 'NOT_A_TARGET' });
    const look = data(
      await emitAck<{ sighting: unknown }>(player, 'sighting:look', { tokenId: chest.tokenId }),
      'sighting:look',
    );
    expect(look.sighting).toBeNull();
    await emitAck(gm, 'combat:end', {});
  });

  it('gracz nie przesuwa figury pojemnika', async () => {
    const moved = await emitAck(player, 'token:move', {
      tokenId: chest.tokenId,
      x: 4 * PX_PER_M,
      y: 0,
      final: true,
    });
    expect(moved.ok).toBe(false);
  });

  it('upuszczenie robi stos, drugie dokłada do niego, pusty stos znika', async () => {
    const torch = { list: 'gear', rowId: 'g-torch', qty: 1 };
    expect(
      await emitAck(player, 'inventory:drop', {
        fromCharacterId: vexId,
        x: 20 * PX_PER_M,
        y: 0,
        items: [torch],
      }),
    ).toMatchObject({ ok: false, error: 'OUT_OF_REACH' });

    const first = data(
      await emitAck<InventoryDropResult>(player, 'inventory:drop', {
        fromCharacterId: vexId,
        x: 0,
        y: 0,
        items: [torch],
      }),
      'drop',
    );
    const second = data(
      await emitAck<InventoryDropResult>(player, 'inventory:drop', {
        fromCharacterId: vexId,
        x: 0,
        y: 0,
        items: [torch],
      }),
      'drop again',
    );
    expect(second.tokenId).toBe(first.tokenId);
    const pile = await tokenFor(player, first.tokenId);
    expect(pile?.container).toEqual({ lock: 'open', pile: true });
    expect(pile?.name).toBe('Stos');
    const entry = await counterpart(first.tokenId);
    // Latarka wpisana ręką nie ma wpisu katalogu, więc się nie skleja — dwa wiersze.
    expect(entry?.items?.map((i) => [i.name, i.qty])).toEqual([
      ['Latarka', 1],
      ['Latarka', 1],
    ]);

    const gone = waitFor<{ tokenId: string }>(player, 'token:delete');
    done(
      await emitAck(player, 'inventory:take', {
        fromTokenId: first.tokenId,
        toCharacterId: vexId,
        items: entry!.items!.map((item) => ({ list: 'gear', rowId: item.rowId })),
      }),
      'take all',
    );
    expect((await gone).tokenId).toBe(first.tokenId);
    expect(await tokenFor(player, first.tokenId)).toBeUndefined();
    expect((await sheetOf(vexId)).gear.filter((g) => g.name === 'Latarka')).toHaveLength(2);
  });
});
