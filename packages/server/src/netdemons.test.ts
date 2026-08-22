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
  CombatView,
  CompendiumEntry,
  InvitationSummary,
  NetAccessPointView,
  NetArchitectureView,
  NetRunAbilityResult,
  NetRunPayload,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenView,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Demony (etap 26e) na żywych gniazdach.
 *
 * Testy czyste w `shared` opisują same zasady; tutaj sprawdzane jest to, czego
 * one dosięgnąć nie mogą:
 *
 *  - **Demon nie istnieje w payloadzie gracza**, dopóki nie zacznie go ścigać —
 *    nie jest przygaszony, po prostu go tam nie ma, a jego id nie da się zgadnąć;
 *  - **obrona Demona to Test Interfejsu** — widać to w notacji rzutu obronnego
 *    na karcie, nie w żadnej kolumnie OBR;
 *  - **Tura Demona jednym klikiem** naprawdę robi trzy rzeczy po kolei: odbiera
 *    węzeł, strzela z wieżyczki Wartością bojową i Pafa netrunnera;
 *  - **PT odebrania węzła Demonowi** to wynik jego Testu Kontroli.
 *
 * Liczby wpisów są dobrane tak, żeby rzuty nie decydowały o wyniku testu — ta
 * sama sztuczka, którą 26c zrobiło z „Zawsze trafia" i „Nigdy nie trafia".
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
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), 4000);
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

function errorOf(ack: SocketAck<unknown>): string | undefined {
  return ack.ok ? undefined : ack.error;
}

function waitFor<T>(socket: ClientSocket, event: string, ms = 4000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

async function roundTrip(socket: ClientSocket): Promise<StateSyncPayload> {
  const sync = waitFor<StateSyncPayload>(socket, 'state:sync');
  await emitAck(socket, 'state:request');
  return sync;
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
    payload: { name: 'Kampania Demonów' },
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
    payload: { name: 'Kolec' },
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
    // Windows may still hold the file; nothing to clean up.
  }
});

describe('Demony na żywych gniazdach', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;
  let characterId: string;
  let tokenId: string;
  let turretTokenId: string;
  let pointId: number;
  let runId: string;

  /** Id nadawane przez `netDemonInstance`: piętro plus numer wpisu na nim. */
  const WEAK = 'demon-f1-0';
  const STRONG = 'demon-f2-0';

  const TURRET_PROFILE = {
    ref: 3,
    dex: 3,
    body: 5,
    will: 5,
    skillLevel: 1,
    evasion: 1,
    armorSp: 0,
    weaponId: 'weapon.zgrzyt-9',
    weaponName: 'Zgrzyt 9',
    weaponDamage: '2k6',
    ammoCurrent: 10,
    ammoMax: 10,
  };

  function architecture() {
    return {
      name: 'Sieć banku',
      difficulty: 'standard',
      branches: [
        {
          id: 'trunk',
          parentFloor: null,
          floors: [
            {
              id: 'f0',
              kind: 'controlNode',
              label: 'Węzeł ochrony',
              // PT 1: rzut jest prawdziwy, a test ma być o zasadach, nie o szczęściu.
              dv: 1,
              devices: [{ id: 'dev-turret', name: 'Grzechot', deviceKind: 'turret', tokenId: '' }],
            },
            { id: 'f1', kind: 'demon', label: 'Kotłownia', programIds: ['demon.slaby-demon'] },
            { id: 'f2', kind: 'demon', label: 'Serce sieci', programIds: ['demon.mur'] },
          ],
        },
      ],
    };
  }

  async function runOf(socket: ClientSocket): Promise<NetRunPayload | undefined> {
    const sync = await roundTrip(socket);
    return sync.netRuns.find((entry) => entry.runId === runId);
  }

  function nodeOf(run: NetRunPayload) {
    return run.run.branches[0]!.floors.find((floor) => floor.id === 'f0');
  }

  it('stawia stół: netrunner z Mieczem, wieżyczka i dwa Demony', async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);

    // „Słaby Demon" broni się Interfejsem 0, więc netrunner zawsze go trafia;
    // „Mur" Interfejsem 30, więc jego obrona jest widoczna w notacji rzutu.
    data(
      await emitAck<CompendiumEntry>(gm, 'compendium:upsert', {
        entry: {
          category: 'netDefense',
          defenseKind: 'demon',
          name: 'Słaby Demon',
          rez: 20,
          interfaceRank: 0,
          netActions: 1,
          combatValue: 10,
        },
      }),
      'compendium:upsert (słaby)',
    );
    data(
      await emitAck<CompendiumEntry>(gm, 'compendium:upsert', {
        entry: {
          category: 'netDefense',
          defenseKind: 'demon',
          name: 'Mur',
          rez: 30,
          interfaceRank: 30,
          netActions: 3,
          combatValue: 14,
        },
      }),
      'compendium:upsert (mur)',
    );

    const character = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Kolec', ownerId: playerId }),
      'character:create',
    );
    characterId = character.id;
    await emitAck(gm, 'character:update', {
      characterId,
      patch: {
        data: {
          roleId: 'netrunner',
          roleAbilityRank: 10,
          cyberdeck: {
            name: 'Dek testowy',
            slots: 6,
            installed: [
              {
                id: 'deck-sword',
                kind: 'program',
                name: 'Miecz',
                slotCost: 1,
                program: {
                  programClass: 'attacker',
                  target: 'antiProgram',
                  atk: 1,
                  def: 0,
                  rez: 0,
                  // Dwie różne kolumny obrażeń: Demon czyta tę pierwszą.
                  effects: { vsProgram: 3, vsBlackIce: 1 },
                },
              },
            ],
          },
        },
      },
    });

    const scene = data(await emitAck<SceneView>(gm, 'scene:create', { name: 'Skarbiec' }), 'scene');
    sceneId = scene.id;
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'open' });
    const activated = waitFor(player, 'scene:activate');
    await emitAck(gm, 'scene:activate', { sceneId });
    await activated;

    tokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Kolec',
        x: 0,
        y: 0,
        ownerId: playerId,
        characterId,
      }),
      'token:create',
    ).id;
    turretTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Grzechot',
        x: 0,
        y: 6 * PX_PER_M,
        hp: { current: 25, max: 25 },
      }),
      'token:create',
    ).id;
    await emitAck(gm, 'token:update', {
      tokenId: turretTokenId,
      patch: { combatProfile: TURRET_PROFILE },
    });

    const shaft = architecture();
    shaft.branches[0]!.floors[0]!.devices![0]!.tokenId = turretTokenId;
    const architectureId = data(
      await emitAck<NetArchitectureView>(gm, 'net:save', { architecture: shaft }),
      'net:save',
    ).id;

    pointId = data(
      await emitAck<NetAccessPointView>(gm, 'netpoint:place', {
        sceneId,
        x: 50,
        y: 50,
        name: 'Bankomat',
        architectureId,
        hidden: false,
      }),
      'netpoint:place',
    ).id;

    runId = data(
      await emitAck<NetRunPayload>(player, 'netrun:start', { tokenId, accessPointId: pointId }),
      'netrun:start',
    ).runId;
    expect(runId).toBeTruthy();
  });

  it('stawia Demony już przy podłączeniu, ale wyłącznie w oczach MG', async () => {
    // „Demon wie o wszystkim, co dzieje się w jego Architekturze" (s. 212) —
    // więc istnieje od pierwszej chwili, a nie od otwarcia drzwi jak LOD z 26c.
    const forGm = await runOf(gm);
    expect(forGm?.run.demons.map((demon) => demon.name)).toEqual(['Słaby Demon', 'Mur']);
    expect(forGm?.run.demons[0]).toMatchObject({ mode: 'lurking', rezCurrent: 20, rezMax: 20 });
    // Nie „przygaszony" u gracza — nieobecny.
    expect((await runOf(player))?.run.demons).toEqual([]);
  });

  it('nie daje graczowi zaatakować Demona, o którym nie wie', async () => {
    expect(errorOf(await emitAck(player, 'netrun:attack', { runId, demonId: WEAK }))).toBe(
      'NET_DEMON_UNKNOWN',
    );
  });

  it('nie daje Demonowi Tury, dopóki nie wykryje intruza', async () => {
    expect(errorOf(await emitAck(gm, 'netrun:demon:turn', { runId, demonId: WEAK }))).toBe(
      'NET_DEMON_NOT_DETECTED',
    );
  });

  it('wpuszcza Demona na czoło Kolejki Inicjatywy, gdy MG powie, że wykrył', async () => {
    const combat = data(
      await emitAck<CombatView>(gm, 'combat:start', { sceneId, tokenIds: [tokenId] }),
      'combat:start',
    );
    await emitAck(gm, 'combat:set-initiative', {
      combatantId: combat.combatants[0]!.id,
      initiative: 12,
    });
    await emitAck(gm, 'combat:next');

    const detected = data(
      await emitAck<NetRunAbilityResult>(gm, 'netrun:demon:detect', { runId, demonId: WEAK }),
      'netrun:demon:detect',
    );
    expect(detected.summary).toContain('wie już o intruzie');

    const queue = (await roundTrip(gm)).combat?.combatants ?? [];
    const row = queue.find((entry) => entry.name === 'Słaby Demon');
    // „Zajmuje pierwsze miejsce w Kolejce, o jeden punkt wyżej" — wstawka, nie
    // przerzut, i bez figury na mapie (możliwe od 26c).
    expect(row?.initiative).toBe(13);
    expect(row?.tokenId ?? null).toBeNull();

    // Dopiero teraz gracz go widzi — i to bez liczb MG.
    const seen = (await runOf(player))?.run.demons ?? [];
    expect(seen.map((demon) => demon.name)).toEqual(['Słaby Demon']);
    expect(seen[0]).toMatchObject({ mode: 'hunting', rezCurrent: 20 });
    expect(seen[0]?.interfaceRank).toBeUndefined();
    expect(seen[0]?.combatValue).toBeUndefined();
    expect((await runOf(gm))?.run.demons[0]?.combatValue).toBe(10);
  });

  it('odmawia drugiego wykrycia tego samego Demona', async () => {
    expect(errorOf(await emitAck(gm, 'netrun:demon:detect', { runId, demonId: WEAK }))).toBe(
      'NET_DEMON_ALREADY_DETECTED',
    );
  });

  it('broni Demona Testem Interfejsu, a nie kolumną OBR', async () => {
    data(
      await emitAck<NetRunAbilityResult>(gm, 'netrun:demon:detect', { runId, demonId: STRONG }),
      'netrun:demon:detect (Mur)',
    );

    const weakCard = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    data(
      await emitAck<NetRunAbilityResult>(player, 'netrun:attack', {
        runId,
        demonId: WEAK,
        rowId: 'deck-sword',
      }),
      'netrun:attack (słaby)',
    );
    // Interfejs 0 nie dokłada nic do rzutu obronnego — goła kość.
    expect((await weakCard).message.roll?.opposed?.detail).toContain('obrona 1d10 =');

    const strongCard = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    data(
      await emitAck<NetRunAbilityResult>(player, 'netrun:attack', {
        runId,
        demonId: STRONG,
        rowId: 'deck-sword',
      }),
      'netrun:attack (Mur)',
    );
    // Interfejs 30 — i to jest cała obrona Demona, bo OBR-u nie ma.
    expect((await strongCard).message.roll?.opposed?.detail).toContain('obrona 1d10+30 =');
  });

  it('zdejmuje REZ trafionemu Demonowi zwykłą kolumną obrażeń', async () => {
    const before = (await runOf(gm))?.run.demons.find((demon) => demon.id === WEAK)?.rezCurrent;
    const hit = data(
      await emitAck<NetRunAbilityResult>(player, 'netrun:attack', {
        runId,
        demonId: WEAK,
        rowId: 'deck-sword',
      }),
      'netrun:attack',
    );
    const after = (await runOf(gm))?.run.demons.find((demon) => demon.id === WEAK)?.rezCurrent;
    // Interfejs 10 + ATK 1 + 1k10 przebija goły 1k10 obrony **prawie** zawsze:
    // dziesiątka na obronie dorzuca i raz na kilkadziesiąt przebiegów wygrywa.
    // Test jest o tym, co robi trafienie, więc pyta warunkowo zamiast zakładać
    // wynik rzutu — inaczej migocze na czerwono bez winy kodu.
    if (hit.success) {
      // „3k6 Programom" — Demon nie jest Czarnym LOD-em, więc nie 1k6.
      expect(hit.summary).toContain('3k6');
      expect(after).toBeLessThan(before!);
    } else {
      expect(hit.summary).toContain('nie przebija obrony');
      expect(after).toBe(before);
    }
  });

  it('odmawia Ślizgu przed Demonem po polsku', async () => {
    const ack = await emitAck(player, 'netrun:slide', { runId, demonId: WEAK });
    expect(errorOf(ack)).toBe('NET_SLIDE_VS_DEMON');
  });

  it('daje przejąć węzeł po PT wypisanym na piętrze, dopóki Demon o niego nie rzucił', async () => {
    const taken = data(
      await emitAck<NetRunAbilityResult>(player, 'netrun:ability', { runId, ability: 'control' }),
      'netrun:ability (control)',
    );
    expect(taken.success).toBe(true);
    expect(nodeOf((await runOf(player))!)?.controlledDv).toBe(taken.total);
  });

  it('rozgrywa Turę Demona jednym klikiem: węzeł, wieżyczka, Paf', async () => {
    const cards: ChatMessageBroadcast[] = [];
    const collect = (message: ChatMessageBroadcast) => cards.push(message);
    gm.on('chat:message', collect);
    const turn = data(
      await emitAck<NetRunAbilityResult>(gm, 'netrun:demon:turn', { runId, demonId: STRONG }),
      'netrun:demon:turn',
    );
    gm.off('chat:message', collect);
    // Kolejność ze s. 212: najpierw węzły, Paf dopiero z resztek.
    expect(turn.summary).toContain('odebrany');
    expect(turn.summary).toContain('strzela do: Kolec');
    expect(turn.summary).toContain('Paf');

    // Węzeł zmienił ręce.
    expect(nodeOf((await runOf(player))!)?.controlledDv).toBeUndefined();
    // Wieżyczka naprawdę strzeliła — magazynek jest jej i to on się opróżnia.
    const turret = (await roundTrip(gm)).tokens.find((entry) => entry.id === turretTokenId);
    expect((turret?.combatProfile as { ammoCurrent: number } | null)?.ammoCurrent).toBe(9);

    // …i rzuciła Wartością bojową Demona, a nie własnym profilem (REF 3,
    // Umiejętność 1). „Test Wartości bojowej + 1k10" to jedna liczba, więc
    // siedzi w Umiejętności, a Cechy maszyny są zerowe.
    const shot = cards.find((entry) => entry.message.roll?.actor === 'Grzechot')?.message.roll;
    expect(shot?.breakdown?.find((row) => row.kind === 'skill')?.value).toBe(14);
    expect(shot?.breakdown?.find((row) => row.kind === 'stat')?.value).toBe(0);
  });

  it('liczy PT odebrania węzła Demonowi jego własnym Testem Kontroli', async () => {
    const card = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    await emitAck<NetRunAbilityResult>(player, 'netrun:ability', { runId, ability: 'control' });
    const title = (await card).message.roll?.title ?? '';
    const dv = Number.parseInt(title.split('PT ')[1] ?? '0', 10);
    // Mur rzuca Interfejsem 30, więc jego wynik nie zejdzie poniżej 31 — a to
    // jest teraz PT węzła, nie wypisane na piętrze PT 1.
    expect(dv).toBeGreaterThanOrEqual(31);
  });

  it('nie daje Demonowi dwóch Tur w jednej Rundzie', async () => {
    expect(errorOf(await emitAck(gm, 'netrun:demon:turn', { runId, demonId: STRONG }))).toBe(
      'NET_DEMON_ALREADY_ACTED',
    );
    // Nowa Runda otwiera Turę z powrotem.
    await emitAck(gm, 'combat:next');
    expect((await emitAck(gm, 'netrun:demon:turn', { runId, demonId: STRONG })).ok).toBe(true);
  });

  it('zabiera Demona z kolejki razem z odłączeniem netrunnera', async () => {
    // Odłącza MG: gracz jest w środku Rundy, w której zdążył już wydać swoje
    // Akcje Sieciowe, a MG jest z budżetu tury zwolniony.
    expect((await emitAck(gm, 'netrun:leave', { runId })).ok).toBe(true);
    const queue = (await roundTrip(gm)).combat?.combatants ?? [];
    expect(queue.find((entry) => entry.name === 'Słaby Demon')).toBeUndefined();
    expect(queue.find((entry) => entry.name === 'Mur')).toBeUndefined();
    await emitAck(gm, 'combat:end');
  });
});
