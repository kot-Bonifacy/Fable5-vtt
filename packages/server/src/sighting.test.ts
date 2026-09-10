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
  CpredSighting,
  InvitationSummary,
  SceneView,
  SightingLookResult,
  SocketAck,
  StateSyncPayload,
  TokenView,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Oględziny i ręce (etap 41), na żywych gniazdach.
 *
 * Kształt samego rzutu oka sprawdza `shared/systems/cpred/sighting.test.ts`;
 * tutaj chodzi o **szew**, czyli o trzy rzeczy, których czysta funkcja nie
 * widzi:
 *
 *  1. czy z karty MG do gracza jedzie **wyłącznie** to, co widać — bo to jest
 *     dokładnie ta droga, którą etap otwiera po raz pierwszy,
 *  2. czy odmowa „nie masz tego w rękach" trafia w figury **z zadeklarowanymi
 *     rękami** i tylko w nie (decyzja MG z 10.09.2026),
 *  3. czy schowanie broni kosztuje Akcję, a dobycie nie.
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
let vexUserId: string;
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

function waitFor<T>(socket: ClientSocket, event: string, ms = 3000): Promise<T> {
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
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), 3000);
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

/** Pistolet: jedna ręka, „Pistolet przykładowy" w katalogu testowym. */
function pistol(id: string) {
  return {
    id,
    name: 'Zgrzyt 9',
    notes: '',
    compendiumId: 'weapon.zgrzyt-9',
    damage: '2k6',
    ammoCurrent: 12,
    ammoMax: 30,
    ammoType: 'Pistoletowa',
    rof: '2',
  };
}

/** Karabin: dwie ręce — czyli obie. */
function rifle(id: string) {
  return {
    id,
    name: 'Grzechotnik',
    notes: '',
    compendiumId: 'weapon.grzechotnik',
    damage: '5k6',
    ammoCurrent: 25,
    ammoMax: 25,
    ammoType: 'Karabinowa',
    rof: '1',
  };
}

/** Nóż: jedna ręka, więc mieści się obok pistoletu. */
function blade(id: string) {
  return {
    id,
    name: 'Szpon',
    notes: '',
    compendiumId: 'weapon.szpon',
    damage: '1k6',
    ammoCurrent: 0,
    ammoMax: 0,
    ammoType: '',
    rof: '1',
  };
}

let sceneId: string;
let vexCharacterId: string;
let gangerCharacterId: string;
let gangerTokenId: string;
let vexTokenId: string;
let hiddenTokenId: string;

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
    payload: { name: 'Zaułek' },
  });
  const campaignId = (campaignRes.json() as CampaignSummary).id;

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
  vexUserId = (joinVex.json() as { user: { id: string } }).user.id;
}, 60_000);

afterAll(async () => {
  for (const socket of openSockets) socket.disconnect();
  await built.app.close();
  try {
    unlinkSync(TEST_DB);
  } catch {
    // best effort — Windows potrafi jeszcze trzymać plik
  }
});

describe('oględziny wyposażenia', () => {
  let gm: ClientSocket;
  let vex: ClientSocket;

  it('stawia scenę: ganger w hełmie i kamizelce, z pistoletem i nożem', async () => {
    const gmConn = createSocket(gmCookie);
    const vexConn = createSocket(vexCookie);
    gm = gmConn.socket;
    vex = vexConn.socket;
    await Promise.all([gmConn.firstSync, vexConn.firstSync]);

    vexCharacterId = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Vex', ownerId: vexUserId }),
      'character:create',
    ).id;
    gangerCharacterId = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Ganger' }),
      'character:create',
    ).id;

    expect(
      (
        await emitAck(gm, 'character:update', {
          characterId: gangerCharacterId,
          patch: {
            data: {
              weapons: [pistol('w-pistol'), blade('w-blade'), rifle('w-rifle')],
              armor: [
                {
                  id: 'a-head',
                  name: 'Hełm bojowy',
                  notes: '',
                  sp: 11,
                  spCurrent: 7,
                  location: 'head',
                },
                {
                  id: 'a-body',
                  name: 'Kurtka Kevlarowa',
                  notes: '',
                  sp: 11,
                  spCurrent: 11,
                  location: 'body',
                },
                // Zapasowa kurtka w plecaku — nie chroni i nie ma jej być widać.
                {
                  id: 'a-spare',
                  name: 'Kamizelka zapasowa',
                  notes: '',
                  sp: 7,
                  spCurrent: 7,
                  location: 'body',
                  equipped: false,
                },
              ],
              cyberware: [
                { id: 'c-arm', name: 'Cyberręka Arasaki', notes: '', type: 'cyberlimb' },
                { id: 'c-neural', name: 'Neuroprocesor', notes: '', type: 'neuralware' },
              ],
            },
          },
        })
      ).ok,
    ).toBe(true);

    // Vex też potrzebuje broni — to jego karta odmawia strzału w dalszych testach.
    expect(
      (
        await emitAck(vex, 'character:update', {
          characterId: vexCharacterId,
          patch: { data: { weapons: [pistol('v-pistol'), rifle('v-rifle'), blade('v-blade')] } },
        })
      ).ok,
    ).toBe(true);

    const scene = data(await emitAck<SceneView>(gm, 'scene:create', { name: 'Zaułek' }), 'scene');
    sceneId = scene.id;
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'open' });
    const activated = waitFor(vex, 'scene:activate');
    await emitAck(gm, 'scene:activate', { sceneId });
    await activated;

    vexTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Vex',
        x: 0,
        y: 0,
        ownerId: vexUserId,
        characterId: vexCharacterId,
      }),
      'token:create',
    ).id;
    gangerTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Ganger',
        x: 100,
        y: 0,
        characterId: gangerCharacterId,
      }),
      'token:create',
    ).id;
    hiddenTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Zasadzka',
        x: 300,
        y: 0,
        hidden: true,
        characterId: gangerCharacterId,
      }),
      'token:create',
    ).id;
  });

  it('daje graczowi rzut oka: co na głowie, co w rękach — i ani jednej liczby', async () => {
    const result = data(
      await emitAck<SightingLookResult>(vex, 'sighting:look', { tokenId: gangerTokenId }),
      'sighting:look',
    );
    const sighting = result.sighting as unknown as CpredSighting;
    expect(sighting.detailed).toBe(false);

    // Pancerz: dwie założone sztuki, głowa pierwsza, bez marki i bez OB.
    expect(sighting.armor.map((row) => row.location)).toEqual(['head', 'body']);
    expect(sighting.armor[0]!.name).toBe('Ochrona głowy');
    expect(sighting.armor[0]!.sp).toBeUndefined();
    expect(sighting.armor[0]!.spCurrent).toBeUndefined();
    // Kurtka w plecaku nie jest pancerzem na kimś.
    expect(sighting.armor).toHaveLength(2);

    // Ręce: nikt nie deklarował, więc widać pierwszą broń z karty — jako klasę.
    expect(sighting.weapons.map((row) => row.name)).toEqual(['Pistolet przykładowy']);
    expect(sighting.weapons[0]!.damage).toBeUndefined();
    expect(sighting.weapons[0]!.ammoMax).toBeUndefined();

    // Chrom: widać rękę, nie widać neuroprocesora.
    expect(sighting.chrome.map((row) => row.name)).toEqual(['Cyberkończyny']);
  });

  it('nie pozwala graczowi przyjrzeć się figurze ukrytej przez MG', async () => {
    const ack = await emitAck(vex, 'sighting:look', { tokenId: hiddenTokenId });
    expect(ack.ok).toBe(false);
    // Nie `FORBIDDEN`: samo „ta figura istnieje" jest informacją.
    if (!ack.ok) expect(ack.error).toBe('TOKEN_NOT_FOUND');
  });

  it('pokazuje gołą głowę, gdy hełm zjedzie z karty', async () => {
    expect(
      (
        await emitAck(gm, 'character:update', {
          characterId: gangerCharacterId,
          patch: {
            data: {
              armor: [
                {
                  id: 'a-body',
                  name: 'Kurtka Kevlarowa',
                  notes: '',
                  sp: 11,
                  spCurrent: 11,
                  location: 'body',
                },
              ],
            },
          },
        })
      ).ok,
    ).toBe(true);
    const result = data(
      await emitAck<SightingLookResult>(vex, 'sighting:look', { tokenId: gangerTokenId }),
      'sighting:look',
    );
    const sighting = result.sighting as unknown as CpredSighting;
    expect(sighting.armor.some((row) => row.location === 'head')).toBe(false);
  });
});

describe('ręce: co postać trzyma', () => {
  let gm: ClientSocket;
  let vex: ClientSocket;

  it('otwiera gniazda', async () => {
    const gmConn = createSocket(gmCookie);
    const vexConn = createSocket(vexCookie);
    gm = gmConn.socket;
    vex = vexConn.socket;
    await Promise.all([gmConn.firstSync, vexConn.firstSync]);
    expect(sceneId).toBeTruthy();
  });

  it('niezadeklarowane ręce niczego nie zabraniają — domysł nie jest deklaracją', async () => {
    // Decyzja MG z 10.09.2026. Vex nigdy nie dobywał broni, a strzela z karabinu,
    // czyli **nie** z pierwszego wiersza karty. Ma mu wyjść.
    const ack = await emitAck(vex, 'attack:roll', {
      characterId: vexCharacterId,
      attackerTokenId: vexTokenId,
      targetTokenId: gangerTokenId,
      request: { weaponRowId: 'v-rifle', mode: 'single' },
    });
    expect(ack.ok).toBe(true);
  });

  it('schowanie broni deklaruje ręce i zamyka strzał z tego, co schowane', async () => {
    // Pierwsze `weapon:draw` bierze za punkt wyjścia to, co pokazywały oględziny
    // — czyli pistolet. Po schowaniu ręce są puste i **żadna** broń nie strzela.
    const holster = await emitAck<{ hands: string[] }>(vex, 'weapon:draw', {
      characterId: vexCharacterId,
      weaponRowId: 'v-pistol',
      mode: 'holster',
    });
    expect(data(holster, 'weapon:draw').hands).toEqual([]);

    const ack = await emitAck(vex, 'attack:roll', {
      characterId: vexCharacterId,
      attackerTokenId: vexTokenId,
      targetTokenId: gangerTokenId,
      request: { weaponRowId: 'v-rifle', mode: 'single' },
    });
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.error).toBe('WEAPON_NOT_DRAWN');
  });

  it('dobycie otwiera strzał z powrotem', async () => {
    const drawn = await emitAck<{ hands: string[] }>(vex, 'weapon:draw', {
      characterId: vexCharacterId,
      weaponRowId: 'v-rifle',
    });
    expect(data(drawn, 'weapon:draw').hands).toEqual(['v-rifle']);

    const ack = await emitAck(vex, 'attack:roll', {
      characterId: vexCharacterId,
      attackerTokenId: vexTokenId,
      targetTokenId: gangerTokenId,
      request: { weaponRowId: 'v-rifle', mode: 'single' },
    });
    expect(ack.ok).toBe(true);
  });

  it('karabin zajmuje obie ręce, więc noża już się nie dobierze', async () => {
    const ack = await emitAck(vex, 'weapon:draw', {
      characterId: vexCharacterId,
      weaponRowId: 'v-blade',
    });
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.error).toBe('HANDS_FULL');
  });

  it('ale pistolet i nóż mieszczą się naraz — ręce są dwie', async () => {
    await emitAck(vex, 'weapon:draw', {
      characterId: vexCharacterId,
      weaponRowId: 'v-rifle',
      mode: 'drop',
    });
    await emitAck(vex, 'weapon:draw', { characterId: vexCharacterId, weaponRowId: 'v-pistol' });
    const both = await emitAck<{ hands: string[] }>(vex, 'weapon:draw', {
      characterId: vexCharacterId,
      weaponRowId: 'v-blade',
    });
    expect(data(both, 'weapon:draw').hands).toEqual(['v-pistol', 'v-blade']);
  });

  it('rzut oka pokazuje obie bronie w rękach', async () => {
    const result = data(
      await emitAck<SightingLookResult>(gm, 'sighting:look', { tokenId: vexTokenId }),
      'sighting:look',
    );
    const sighting = result.sighting as unknown as CpredSighting;
    expect(sighting.weapons.map((row) => row.name)).toEqual([
      'Pistolet przykładowy',
      'Ostrze przykładowe',
    ]);
  });

  it('rąk nie da się przestawić łatą karty — także MG', async () => {
    // Schowanie broni kosztuje Akcję (s. 168), a łata karty nie ma czym jej
    // zapłacić. Ta sama umowa, co przy Zmyśle Walki i eurodolcach.
    const asPlayer = await emitAck(vex, 'character:update', {
      characterId: vexCharacterId,
      patch: { data: { drawnWeaponRowIds: [] } },
    });
    expect(asPlayer.ok).toBe(false);
    if (!asPlayer.ok) expect(asPlayer.error).toBe('FORBIDDEN');

    const asGm = await emitAck(gm, 'character:update', {
      characterId: gangerCharacterId,
      patch: { data: { drawnWeaponRowIds: ['w-rifle'] } },
    });
    expect(asGm.ok).toBe(false);
    if (!asGm.ok) expect(asGm.error).toBe('FORBIDDEN');
  });

  it('broń zabrana z karty zostawia puste ręce, a nie inną broń', async () => {
    expect(
      (
        await emitAck(vex, 'character:update', {
          characterId: vexCharacterId,
          patch: { data: { weapons: [rifle('v-rifle')] } },
        })
      ).ok,
    ).toBe(true);
    const result = data(
      await emitAck<SightingLookResult>(gm, 'sighting:look', { tokenId: vexTokenId }),
      'sighting:look',
    );
    const sighting = result.sighting as unknown as CpredSighting;
    // Ręce trzymały pistolet i nóż; oba zeszły z karty, więc nie ma w nich nic —
    // karabin, który został, nie wskakuje do rąk sam.
    expect(sighting.weapons).toEqual([]);
  });
});
