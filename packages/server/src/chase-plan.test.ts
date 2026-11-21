import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  CampaignSummary,
  CharacterView,
  ChasePlanEntry,
  ChatMessageView,
  CombatView,
  CpredCharacterData,
  SceneVehicleView,
  SceneView,
  SocketAck,
  TokenView,
  VehicleView,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { joinUrl } from './test-join.js';
import { paceTesting } from './realtime/pace.js';

paceTesting.off = true;

/**
 * Etap 72f3 na żywych gniazdach — plan rund pościgu: `chase:plan` (tylko MG,
 * auta tej sceny), karta `chaseplan` na początku rundy wyłącznie u MG
 * (runda nie stoi), „Wypuść” wykonuje posiłki, przeszkodę i Manewr na
 * wezwanie, „Odłóż o rundę” pyta znowu, „Pomiń” zamyka; edycja nie rusza
 * otwartego pytania, a koniec walki gasi karty i zeruje plan.
 */

const TEST_DB = `./.test-${randomBytes(6).toString('hex')}.db`;
const GM_PASSWORD = 'test-haslo';
const DICE = join(mkdtempSync(join(tmpdir(), 'vtt-plan-dice-')), 'dice.txt');
const previousDiceScript = process.env.VTT_DICE_SCRIPT;
function scriptDice(faces: number[]): void {
  writeFileSync(DICE, faces.join(' '));
}

const PUBLIC_DIR = resolve(import.meta.dirname, '../../../data/public');
const PRIVATE_DIR = mkdtempSync(join(tmpdir(), 'vtt-plan-private-'));
const INJURY_ID = 'injury.test-whiplash';

function writeFixtureCompendium(): void {
  const dir = join(PRIVATE_DIR, 'cpred', 'compendium');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'sample.json'),
    readFileSync(join(PUBLIC_DIR, 'cpred', 'compendium', 'sample.json'), 'utf8'),
  );
  writeFileSync(
    join(dir, 'chase.json'),
    JSON.stringify({
      schemaVersion: 1,
      source: 'test 65d2 — wymyślone',
      weaponTypes: [],
      entries: [
        {
          id: 'weapon.assault-rifle',
          category: 'weapon',
          name: 'Karabin testowy',
          weaponTypeId: 'weapon-type.sample-rifle',
          quality: 'standard',
          cost: 50,
          costCategory: 'costly',
        },
        {
          id: INJURY_ID,
          category: 'criticalInjury',
          name: 'Odgięciowy uraz kręgosłupa szyjnego',
          table: 'head',
          roll: 8,
          description: 'Wymyślony opis do testu.',
          cost: null,
          source: 'test',
          quickFix: 'test',
          treatment: 'test',
          deathSavePenalty: 1,
        },
      ],
    }),
  );
}

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
  dataPublicDir: PUBLIC_DIR,
  dataPrivateDir: PRIVATE_DIR,
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

function connect(cookie: string): Promise<ClientSocket> {
  const socket = ioClient(baseUrl, {
    extraHeaders: { cookie },
    reconnection: false,
    timeout: 3000,
  });
  openSockets.push(socket);
  return new Promise((resolveSocket, reject) => {
    const timer = setTimeout(() => reject(new Error('state:sync timeout')), 4000);
    socket.once('connect_error', reject);
    socket.once('state:sync', () => {
      clearTimeout(timer);
      resolveSocket(socket);
    });
  });
}

function waitFor(socket: ClientSocket, event: string, ms = 4000): Promise<unknown> {
  return new Promise((resolveEvent, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), ms);
    socket.once(event, (payload: unknown) => {
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
  process.env.VTT_DICE_SCRIPT = DICE;
  scriptDice([]);
  writeFixtureCompendium();
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
    payload: { name: 'Plan 72f3' },
  });
  const campaignId = (campaignRes.json() as CampaignSummary).id;
  const joinRes = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, campaignId, 'Vex'),
  });
  playerCookie = cookieOf(joinRes.headers['set-cookie']);
  playerId = (joinRes.json() as { user: { id: string } }).user.id;
}, 60_000);

afterAll(async () => {
  if (previousDiceScript === undefined) delete process.env.VTT_DICE_SCRIPT;
  else process.env.VTT_DICE_SCRIPT = previousDiceScript;
  for (const socket of openSockets) socket.disconnect();
  await built.app.close();
  try {
    unlinkSync(TEST_DB);
  } catch {
    // best effort — Windows may still hold the file
  }
});

describe('etap 72f3: plan rund pościgu', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let scene: SceneView;
  let carA: SceneVehicleView;
  let carB: SceneVehicleView;
  let reserve: SceneVehicleView;
  let vexToken: TokenView;
  let gangerToken: TokenView;
  const playerSaw: ChatMessageView[] = [];
  const gmCards: ChatMessageView[] = [];

  const placedRow = (id: string) => built.prisma.sceneVehicle.findUniqueOrThrow({ where: { id } });
  const storedPlan = async () =>
    JSON.parse(
      (await built.prisma.scene.findUniqueOrThrow({ where: { id: scene.id } })).chasePlan,
    ) as ChasePlanEntry[];
  const cardsOfRound = (round: number) =>
    gmCards.filter((message) => message.chasePlan?.round === round);

  /** „Następna tura” MG; runda stojąca na Wyścigu (kubek Vex) — drugie kliknięcie go pomija. */
  const next = async (label: string) => {
    const view = data(await emitAck<CombatView>(gm, 'combat:next'), label);
    if (view.round < 1 || view.activeCombatantId !== null) return view;
    return data(await emitAck<CombatView>(gm, 'combat:next'), `${label} — pomija Wyścig`);
  };
  const answer = async (messageId: number, choice: string) =>
    expect((await emitAck(gm, 'chase:plan-answer', { messageId, answer: choice })).ok).toBe(true);
  /** Do początku następnej rundy. */
  const nextRound = async (label: string) => {
    const before = (await built.prisma.combat.findFirstOrThrow({ where: { sceneId: scene.id } }))
      .round;
    let view = await next(label);
    while (view.round === before) view = await next(label);
    return view;
  };

  it('stawia scenę: Vex z przodu, gang z tyłu, radiowóz w rezerwie', async () => {
    gm = await connect(gmCookie);
    player = await connect(playerCookie);
    player.on('chat:message', (payload: { message: ChatMessageView }) =>
      playerSaw.push(payload.message),
    );
    gm.on('chat:message', (payload: { message: ChatMessageView }) => {
      if (payload.message.kind === 'chaseplan') gmCards.push(payload.message);
    });
    scene = data(
      await emitAck<SceneView>(gm, 'scene:create', { name: 'Plan', kind: 'chase' }),
      'scene:create',
    );
    scene = data(
      await emitAck<SceneView>(gm, 'scene:update', {
        sceneId: scene.id,
        patch: {
          width: 3000,
          height: 1800,
          grid: { sizePx: 100 },
          chase: { direction: 'right', road: { from: 0, to: 18 }, tempo: 20 },
        },
      }),
      'scene:update',
    );
    await built.prisma.scene.update({
      where: { id: scene.id },
      data: { chaseLanes: 3, chaseRole: 'flee' },
    });
    const activated = waitFor(player, 'scene:activate');
    await emitAck(gm, 'scene:activate', { sceneId: scene.id });
    await activated;

    const sheet = async (name: string, ownerId?: string) =>
      data(
        await emitAck<CharacterView<CpredCharacterData>>(gm, 'character:create', {
          name,
          ...(ownerId ? { ownerId } : {}),
        }),
        `character:create ${name}`,
      );
    const vex = await sheet('Vex', playerId);
    const ganger = await sheet('Ganger');
    const car = async (catalogId: string, ownerCharacterId?: string) =>
      data(
        await emitAck<VehicleView>(gm, 'vehicle:create', {
          catalogId,
          ...(ownerCharacterId ? { ownerCharacterId } : {}),
        }),
        `vehicle:create ${catalogId}`,
      );
    const ours = await car('vehicle.sample-kompakt', vex.id);
    const theirs = await car('vehicle.sample-strzala');
    const police = await car('vehicle.sample-kompakt');
    const place = async (vehicleId: string, x: number, y: number) =>
      data(
        await emitAck<SceneVehicleView>(gm, 'chase:place', { sceneId: scene.id, vehicleId, x, y }),
        'chase:place',
      );
    carA = await place(ours.id, 1800, 300);
    carB = await place(theirs.id, 300, 300);
    reserve = await place(police.id, 1200, 1500);
    await built.prisma.sceneVehicle.update({
      where: { id: reserve.id },
      data: { status: 'behind' },
    });

    vexToken = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId: scene.id,
        name: 'Vex',
        x: 100,
        y: 100,
        ownerId: playerId,
        characterId: vex.id,
      }),
      'token:create vex',
    );
    gangerToken = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId: scene.id,
        name: 'Ganger',
        x: 100,
        y: 1500,
        characterId: ganger.id,
      }),
      'token:create ganger',
    );
    const seat = async (socket: ClientSocket, tokenId: string, sceneVehicleId: string) =>
      expect((await emitAck(socket, 'vehicle:seat', { tokenId, sceneVehicleId, seat: 0 })).ok).toBe(
        true,
      );
    await seat(player, vexToken.id, carA.id);
    await seat(gm, gangerToken.id, carB.id);
  });

  it('MG zapisuje plan; gracz go nie może ani nie widzi', async () => {
    const plan = [
      {
        id: 'cop',
        round: 2,
        text: 'NCPD wchodzi',
        kind: 'reinforce',
        vehicleId: reserve.id,
        lane: 2,
        side: 'rear',
        speed: null,
      },
      {
        id: 'wall',
        round: 1,
        text: null,
        kind: 'obstacle',
        obstacle: 'barricade',
        lane: 1,
        beforeId: carA.id,
        gapSq: 4,
      },
      { id: 'skid', round: 2, text: null, kind: 'maneuver', vehicleId: null, maneuver: 'swerve' },
      { id: 'horn', round: 3, text: 'megafon z dachu', kind: 'note' },
    ];
    expect(await emitAck(player, 'chase:plan', { sceneId: scene.id, plan })).toMatchObject({
      ok: false,
    });
    expect(
      await emitAck(gm, 'chase:plan', {
        sceneId: scene.id,
        plan: [{ ...plan[0], vehicleId: 'obce-auto' }],
      }),
    ).toMatchObject({ ok: false, error: 'VEHICLE_NOT_FOUND' });
    expect(
      await emitAck(gm, 'chase:plan', { sceneId: scene.id, plan: [{ ...plan[3], round: 0 }] }),
    ).toMatchObject({ ok: false, error: 'BAD_REQUEST' });

    const gmSync = waitFor(gm, 'chase:sync') as Promise<{ plan?: ChasePlanEntry[] }>;
    const playerSync = waitFor(player, 'chase:sync') as Promise<{ plan?: ChasePlanEntry[] }>;
    const saved = data(
      await emitAck<{ plan: ChasePlanEntry[] }>(gm, 'chase:plan', { sceneId: scene.id, plan }),
      'chase:plan',
    );
    expect(saved.plan.map((entry) => [entry.id, entry.status, entry.dueRound])).toEqual([
      ['wall', 'planned', 1],
      ['cop', 'planned', 2],
      ['skid', 'planned', 2],
      ['horn', 'planned', 3],
    ]);
    expect((await gmSync).plan).toHaveLength(4);
    expect((await playerSync).plan).toBeUndefined();
  });

  it('runda 1: karta przeszkody tylko u MG, runda nie stoi, „Wypuść” stawia barykadę', async () => {
    const started = data(
      await emitAck<CombatView>(gm, 'combat:start', {
        sceneId: scene.id,
        tokenIds: [vexToken.id, gangerToken.id],
      }),
      'combat:start',
    );
    for (const row of started.combatants) {
      await built.prisma.combatant.update({
        where: { id: row.id },
        data: { initiative: row.tokenId === vexToken.id ? 15 : 12 },
      });
    }
    await next('runda 1');
    const [card] = cardsOfRound(1);
    expect(card?.chasePlan).toMatchObject({
      entryId: 'wall',
      status: 'waiting',
      title: expect.stringContaining('Przeszkoda: Barykada — pas 2'),
    });
    expect(playerSaw.some((message) => message.kind === 'chaseplan')).toBe(false);
    // Runda ruszyła (po Wyścigu) — plan jej nie zatrzymał.
    const combat = await built.prisma.combat.findFirstOrThrow({ where: { sceneId: scene.id } });
    expect(combat.round).toBe(1);
    expect(combat.activeCombatantId).not.toBeNull();
    expect((await storedPlan()).find((entry) => entry.id === 'wall')).toMatchObject({
      status: 'asked',
      messageId: card!.id,
    });

    expect(
      await emitAck(player, 'chase:plan-answer', { messageId: card!.id, answer: 'release' }),
    ).toMatchObject({ ok: false });
    const update = waitFor(gm, 'chat:update') as Promise<{ message: ChatMessageView }>;
    expect(
      (await emitAck(gm, 'chase:plan-answer', { messageId: card!.id, answer: 'release' })).ok,
    ).toBe(true);
    expect((await update).message.chasePlan).toMatchObject({ status: 'released', byName: 'MG' });
    const obstacles = await built.prisma.chaseObstacle.findMany({ where: { sceneId: scene.id } });
    // Vex po kadrze na 2100 (70% od tyłu), zderzak na 2350; 4 kratki dalej — pas 2 (900).
    expect(obstacles).toMatchObject([{ kind: 'barricade', x: 2800, y: 900 }]);
    expect((await storedPlan()).find((entry) => entry.id === 'wall')?.status).toBe('done');
    expect(
      await emitAck(gm, 'chase:plan-answer', { messageId: card!.id, answer: 'skip' }),
    ).toMatchObject({ ok: false, error: 'PLAN_NOT_WAITING' });
    await built.prisma.chaseObstacle.deleteMany({ where: { sceneId: scene.id } });
  });

  it('runda 2: posiłki wjeżdżają od tyłu, Manewr odłożony o rundę', async () => {
    await nextRound('runda 2');
    const cards = cardsOfRound(2);
    expect(cards.map((message) => message.chasePlan?.entryId)).toEqual(['cop', 'skid']);
    const [cop, skid] = cards;
    expect(cop!.chasePlan).toMatchObject({ text: 'NCPD wchodzi', kind: 'reinforce' });
    await answer(cop!.id, 'release');
    const pursuit = (await built.prisma.scene.findUniqueOrThrow({ where: { id: scene.id } }))
      .chasePursuitSpeed;
    expect(await placedRow(reserve.id)).toMatchObject({
      status: 'racing',
      x: 250,
      y: 1500,
      speed: pursuit,
    });
    await answer(skid!.id, 'defer');
    expect((await storedPlan()).find((entry) => entry.id === 'skid')).toMatchObject({
      status: 'planned',
      dueRound: 3,
    });
    expect(playerSaw.some((message) => message.kind === 'chaseplan')).toBe(false);
  });

  it('runda 3: odłożony Manewr wzywa wszystkie auta z kierowcą; edycja nie rusza otwartej notatki', async () => {
    await nextRound('runda 3');
    const cards = cardsOfRound(3);
    expect(cards.map((message) => message.chasePlan?.entryId)).toEqual(['skid', 'horn']);
    const [skid, horn] = cards;
    await answer(skid!.id, 'release');
    expect(await placedRow(carA.id)).toMatchObject({ maneuverCall: 'swerve' });
    expect(await placedRow(carB.id)).toMatchObject({ maneuverCall: 'swerve' });
    // Radiowóz nie ma kierowcy — wezwanie go omija.
    expect(await placedRow(reserve.id)).toMatchObject({ maneuverCall: null });

    // Edycja bez notatki: pytanie czeka, więc notatka zostaje bez zmian.
    const edited = data(
      await emitAck<{ plan: ChasePlanEntry[] }>(gm, 'chase:plan', {
        sceneId: scene.id,
        plan: [{ id: 'late', round: 1, text: 'spóźniona', kind: 'note' }],
      }),
      'chase:plan edycja',
    );
    expect(edited.plan.map((entry) => [entry.id, entry.status])).toEqual([
      ['late', 'planned'],
      ['horn', 'asked'],
    ]);
    expect(horn!.chasePlan?.status).toBe('waiting');
  });

  it('koniec walki gasi otwartą kartę i zeruje plan; historia gracza bez kart planu', async () => {
    const update = waitFor(gm, 'chat:update') as Promise<{ message: ChatMessageView }>;
    expect((await emitAck(gm, 'combat:end')).ok).toBe(true);
    expect((await update).message.chasePlan).toMatchObject({
      entryId: 'horn',
      status: 'cancelled',
    });
    expect((await storedPlan()).map((entry) => [entry.id, entry.status, entry.messageId])).toEqual([
      ['late', 'planned', null],
      ['horn', 'planned', null],
    ]);
    const playerAgain = await connect(playerCookie);
    const playerSync = (await new Promise((resolveSync) => {
      playerAgain.once('state:sync', resolveSync);
      playerAgain.emit('state:request');
    })) as { messages: ChatMessageView[]; scenePlan: ChasePlanEntry[] };
    expect(playerSync.messages.some((message) => message.kind === 'chaseplan')).toBe(false);
    expect(playerSync.scenePlan).toEqual([]);
    const gmAgain = await connect(gmCookie);
    const gmSync = (await new Promise((resolveSync) => {
      gmAgain.once('state:sync', resolveSync);
      gmAgain.emit('state:request');
    })) as { messages: ChatMessageView[]; scenePlan: ChasePlanEntry[] };
    expect(gmSync.messages.filter((message) => message.kind === 'chaseplan')).toHaveLength(5);
    expect(gmSync.scenePlan).toHaveLength(2);
  });
});
