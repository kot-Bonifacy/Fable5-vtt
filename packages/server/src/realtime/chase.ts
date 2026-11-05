import type {
  ChaseObstacleView,
  ChasePlacePayload,
  ChaseRemovePayload,
  ChaseSettings,
  ChaseSyncBroadcast,
  SceneVehicleView,
  SessionUser,
  VehicleAllowDriverPayload,
  VehicleSeatPayload,
} from '@vtt/shared';
import {
  CPRED_ACTION_MOVE,
  CPRED_ACTION_VEHICLE_ENTER,
  ROLE_GM,
  VEHICLE_LAYOUTS,
  cpredDriverIncapable,
  cpredCoastSpeed,
  cpredVehicleChase,
  cpredVehicleDerived,
  cpredVehicleSpeed,
  cpredVehicleHasPlow,
  cpredVehicleUpgradeNames,
  cpredVehicleWindows,
  cpredVehicleWrecked,
  cpredManeuversFor,
  cpredMountDefinition,
  cpredVehicleManeuver,
  cpredVehicleSpikesLeft,
  isChaseObstacleKind,
  readCpredVehicle,
  chaseBodyContains,
  chaseFrameTempo,
  clampChaseVehicle,
  isSceneVehicleStatus,
  isVehicleLayoutId,
  seatAtPoint,
  seatedTokenPosition,
  vehicleSeatCentre,
  type ChaseBody,
  type ChaseControl,
  type ChaseFrameVehicle,
  type ScenePoint,
} from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type {
  ChaseObstacle,
  Scene,
  SceneVehicle,
  Token,
  Vehicle,
} from '../generated/prisma/client.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { chaseSettingsOf, requireCampaignScene } from './scenes.js';
import { campaignRoom, gmRoom } from './state.js';
import { emitTokensById, requireCampaignToken } from './tokens.js';
import { requireTurnSpend } from './combat-actions.js';

/**
 * Scena pościgu (etap 65b): auta na bieżni i figury w fotelach.
 *
 * Auto na scenie to wiersz `SceneVehicle` (środek bryły w pikselach sceny),
 * a figura w fotelu wskazuje go `Token.sceneVehicleId` + `vehicleSeat`.
 * **Każdy ruch auta przelicza `x`, `y` figur w fotelach i zapisuje je jak
 * zwykły ruch** (`emitTokensById` z `moved`) — zasięg, linia strzału, PT,
 * auto-unik i boty liczą z figur, nic nie wiedząc o pojazdach.
 *
 * Kierownica (decyzja MG 11): fotel 0 bierze właściciel auta albo karta, której
 * on (lub MG) dał zgodę (`vehicle:allow-driver`); MG sadza każdego. Gracz
 * przesiada się w obrębie auta albo wsiada z drogi; przeskok do innego auta
 * i wyskok na jezdnię — tylko MG (decyzja 4).
 */

export type PlacedVehicle = SceneVehicle & { vehicle: Vehicle };

export function requireChaseCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

export function readDrivers(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === 'string')
      : [];
  } catch {
    return [];
  }
}

export function chaseBodyOf(vehicle: Vehicle): ChaseBody {
  return {
    widthSq: vehicle.widthSq,
    lengthSq: vehicle.lengthSq,
    layout: isVehicleLayoutId(vehicle.layout) ? vehicle.layout : 'car-4',
  };
}

function readStatuses(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/** Czy figura za kierownicą panuje nad autem (Nieprzytomny, Martwy, Śmiertelnie Ranny — nie). */
export function driverCapable(token: Pick<Token, 'statuses'>): boolean {
  return !cpredDriverIncapable(readStatuses(token.statuses));
}

/**
 * Widok auta. `driverTokens` to figury sceny z kartą z listy zgód, a `driver`
 * — figura w fotelu kierowcy; podaje je `placedViews`, który zna figury.
 */
function toSceneVehicleView(
  row: PlacedVehicle,
  context: {
    running: boolean;
    driverTokens: readonly Pick<Token, 'id' | 'characterId'>[];
    motion: VehicleMotion;
    /** Prędkość ramy w następnej rundzie — od niej dryf w menu auta. */
    nextFrameTempo: number;
  },
): SceneVehicleView {
  const body = chaseBodyOf(row.vehicle);
  const drivers = new Set(readDrivers(row.drivers));
  const driverTokens = context.driverTokens;
  const stats = readCpredVehicle(row.vehicle.system);
  const { motion } = context;
  const chase = cpredVehicleChase(stats, {
    tempo: context.nextFrameTempo,
    started: row.started,
    nitroUsed: row.nitroUsed,
    speed: motion.nextSpeed,
  });
  const derived = cpredVehicleDerived(stats);
  const stored = isSceneVehicleStatus(row.status) ? row.status : 'racing';
  // Wrak (65d1) to PUK 0, nie kolumna: auto w kadrze z zerem pokazuje się jako
  // `wrecked`, a za krawędzią zostaje `behind` / `escaped` jak każde inne.
  const status = stored === 'racing' && cpredVehicleWrecked(stats) ? 'wrecked' : stored;
  return {
    id: row.id,
    sceneId: row.sceneId,
    vehicleId: row.vehicleId,
    x: row.x,
    y: row.y,
    status,
    name: row.vehicle.name,
    imageUrl: row.vehicle.imageUrl,
    widthSq: body.widthSq,
    lengthSq: body.lengthSq,
    layout: body.layout,
    ownerCharacterId: row.vehicle.ownerCharacterId,
    driverTokenIds: driverTokens
      .filter((token) => token.characterId !== null && drivers.has(token.characterId))
      .map((token) => token.id),
    started: row.started,
    control: motion.control,
    moveSq: chase.moveSq,
    driftSq: chase.driftSq,
    nitroLeft: chase.nitroLeft,
    spikesLeft: cpredVehicleSpikesLeft(stats, row.spikesUsed),
    refillable:
      (row.nitroUsed > 0 && derived.nitroTanks > 0) ||
      (row.spikesUsed > 0 && (derived.counts.spikes ?? 0) > 0),
    hp: stats.hp,
    hpMax: derived.hpMax,
    armorSp: derived.hullSp,
    windows: cpredVehicleWindows(stats),
    upgrades: cpredVehicleUpgradeNames(stats),
    ramPlow: cpredVehicleHasPlow(stats),
    maneuvers: cpredManeuversFor(stats.kind).map(maneuverOption),
    maneuverCall: maneuverCallOf(row.maneuverCall),
    mounts: stats.upgrades
      .filter((upgrade) => cpredMountDefinition(upgrade.upgradeId) !== null)
      .map((upgrade) => ({
        id: upgrade.id,
        upgradeId: upgrade.upgradeId,
        ...(stats.mountAmmo[upgrade.id] !== undefined ? { ammo: stats.mountAmmo[upgrade.id] } : {}),
      })),
    moving: context.running && motion.speed > 0,
    speed: motion.speed,
    party: motion.party,
    blockingVehicleId: row.blockingId,
  };
}

/** Manewr jako pozycja menu auta: „Gwałtowny skręt (PT 13)”. */
function maneuverOption(maneuver: { id: string; name: string; dv: number }): {
  id: string;
  label: string;
} {
  return { id: maneuver.id, label: `${maneuver.name} (PT ${maneuver.dv})` };
}

function maneuverCallOf(raw: string | null): { id: string; label: string } | null {
  const maneuver = raw ? cpredVehicleManeuver(raw) : null;
  return maneuver ? maneuverOption(maneuver) : null;
}

/** Auto jedzie: silnik pracuje, droga jedzie i auto nie jest wrakiem (65d2). */
export function vehicleMoving(
  row: Pick<SceneVehicle, 'started'>,
  stats: ReturnType<typeof readCpredVehicle>,
  running: boolean,
): boolean {
  return row.started && running && !cpredVehicleWrecked(stats);
}

/**
 * Ruch auta w ramie pościgu (decyzja MG z 05.11.2026): kto prowadzi, czy wiezie
 * drużynę, prędkość teraz i w następnej rundzie (bez kierowcy — pęd zwalnia).
 */
export interface VehicleMotion {
  control: ChaseControl;
  party: boolean;
  /** Własna prędkość teraz (`cpredVehicleSpeed`). */
  speed: number;
  /** Własna prędkość na następny dryf — bez kierowcy połowa pędu (`cpredCoastSpeed`). */
  nextSpeed: number;
}

/** Figura w fotelu — tyle, ile ruch auta o niej musi wiedzieć. */
type SeatedToken = Pick<Token, 'sceneVehicleId' | 'vehicleSeat' | 'statuses' | 'ownerId'>;

/** Ruch auta z jego wiersza i figur w fotelach. */
export function vehicleMotion(row: PlacedVehicle, seated: readonly SeatedToken[]): VehicleMotion {
  const stats = readCpredVehicle(row.vehicle.system);
  const inside = seated.filter((token) => token.sceneVehicleId === row.id);
  const driver = inside.find((token) => token.vehicleSeat === 0) ?? null;
  const control: ChaseControl = row.lostControl
    ? 'lost'
    : driver && driverCapable(driver)
      ? 'driver'
      : 'none';
  const driven = control !== 'none';
  const state = { started: row.started, driven, momentum: row.momentum };
  const speed = cpredVehicleSpeed(stats, state);
  const nextSpeed = cpredVehicleSpeed(stats, {
    ...state,
    momentum: cpredCoastSpeed(row.momentum ?? 0),
  });
  const party =
    row.vehicle.ownerCharacterId !== null || inside.some((token) => token.ownerId !== null);
  return { control, party, speed, nextSpeed };
}

/** Rama auta do `chaseFrameTempo` — status w kadrze liczy się jak w widoku (wrak z PUK 0). */
export function frameVehicle(
  row: PlacedVehicle,
  motion: VehicleMotion,
  speed: number,
): ChaseFrameVehicle {
  return {
    status: isSceneVehicleStatus(row.status) ? row.status : 'racing',
    party: motion.party,
    speed,
    control: motion.control,
  };
}

/** Figury w fotelach aut tej sceny. */
export async function seatedOnScene(
  prisma: PrismaClient,
  rows: readonly Pick<SceneVehicle, 'id'>[],
): Promise<SeatedToken[]> {
  if (rows.length === 0) return [];
  return prisma.token.findMany({
    where: { sceneVehicleId: { in: rows.map((row) => row.id) } },
    select: { sceneVehicleId: true, vehicleSeat: true, statuses: true, ownerId: true },
  });
}

/** Ruch wszystkich aut sceny i prędkości ramy: teraz i na następny dryf. */
export function sceneMotion(
  rows: readonly PlacedVehicle[],
  seated: readonly SeatedToken[],
  tempo: number,
): { motions: Map<string, VehicleMotion>; frameTempo: number; nextFrameTempo: number } {
  const motions = new Map(rows.map((row) => [row.id, vehicleMotion(row, seated)] as const));
  const frameTempo = chaseFrameTempo(
    tempo,
    rows.map((row) => frameVehicle(row, motions.get(row.id)!, motions.get(row.id)!.speed)),
  );
  const nextFrameTempo = chaseFrameTempo(
    tempo,
    rows.map((row) => frameVehicle(row, motions.get(row.id)!, motions.get(row.id)!.nextSpeed)),
  );
  return { motions, frameTempo, nextFrameTempo };
}

/** Auta sceny jako widoki, z figurami, którym wolno prowadzić, i kierowcami. */
export async function placedViews(
  prisma: PrismaClient,
  sceneId: string,
): Promise<SceneVehicleView[]> {
  const rows = await placedOnScene(prisma, sceneId);
  if (rows.length === 0) return [];
  const scene = await prisma.scene.findUnique({
    where: { id: sceneId },
    select: { chaseTempo: true, chaseRunning: true },
  });
  const allowed = new Set(rows.flatMap((row) => readDrivers(row.drivers)));
  const tokens =
    allowed.size === 0
      ? []
      : await prisma.token.findMany({
          where: { sceneId, characterId: { in: [...allowed] } },
          select: { id: true, characterId: true },
        });
  const seated = await seatedOnScene(prisma, rows);
  const { motions, nextFrameTempo } = sceneMotion(rows, seated, scene?.chaseTempo ?? 0);
  return rows.map((row) =>
    toSceneVehicleView(row, {
      running: scene?.chaseRunning ?? false,
      driverTokens: tokens,
      motion: motions.get(row.id)!,
      nextFrameTempo,
    }),
  );
}

/** Widok jednego auta tej sceny — odpowiedź zdarzeń, które je zmieniły. */
export async function placedView(
  prisma: PrismaClient,
  sceneId: string,
  sceneVehicleId: string,
): Promise<SceneVehicleView> {
  const views = await placedViews(prisma, sceneId);
  const view = views.find((entry) => entry.id === sceneVehicleId);
  if (!view) throw new RealtimeError('VEHICLE_NOT_FOUND');
  return view;
}

export async function placedOnScene(
  prisma: PrismaClient,
  sceneId: string,
): Promise<PlacedVehicle[]> {
  return prisma.sceneVehicle.findMany({
    where: { sceneId },
    include: { vehicle: true },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Auta sceny dla widza: MG wszystkie, gracz — te w kadrze (`racing`
 * i `wrecked`). Auto, które odpadło z pościgu (65c), znika graczom z oczu.
 */
export async function fetchSceneVehiclesFor(
  prisma: PrismaClient,
  sceneId: string,
  user: SessionUser,
): Promise<SceneVehicleView[]> {
  const views = await placedViews(prisma, sceneId);
  return user.role === ROLE_GM ? views : views.filter(visibleToPlayers);
}

function visibleToPlayers(view: SceneVehicleView): boolean {
  return view.status === 'racing' || view.status === 'wrecked';
}

/** Przeszkoda sceny pościgu (65e) jako widok — jawna dla całego stołu. */
export function toObstacleView(row: ChaseObstacle): ChaseObstacleView {
  return {
    id: row.id,
    sceneId: row.sceneId,
    kind: isChaseObstacleKind(row.kind) ? row.kind : 'custom',
    name: row.name,
    x: row.x,
    y: row.y,
    widthSq: row.widthSq,
    lengthSq: row.lengthSq,
    hp: row.hp,
    hpMax: row.hpMax,
    imageUrl: row.imageUrl,
    wreckTint: row.kind === 'wreck',
    blockingVehicleId: row.blockingId,
  };
}

/** Przeszkody sceny po kolei wstawienia. */
export async function obstacleViews(
  prisma: PrismaClient,
  sceneId: string,
): Promise<ChaseObstacleView[]> {
  const rows = await prisma.chaseObstacle.findMany({
    where: { sceneId },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(toObstacleView);
}

/**
 * Rozsyła listę aut sceny: MG całą, graczom oglądającym scenę — przyciętą.
 * Przeszkody (65e) jadą tym samym zdarzeniem, całe do wszystkich.
 */
export async function emitChase(
  deps: RealtimeDeps,
  campaignId: string,
  sceneId: string,
): Promise<void> {
  const views = await placedViews(deps.ctx.prisma, sceneId);
  const obstacles = await obstacleViews(deps.ctx.prisma, sceneId);
  deps.io
    .to(gmRoom(campaignId))
    .emit('chase:sync', { sceneId, vehicles: views, obstacles } satisfies ChaseSyncBroadcast);
  const players = views.filter(visibleToPlayers);
  const sockets = await deps.io.in(campaignRoom(campaignId)).fetchSockets();
  for (const member of sockets) {
    const data = member.data as { user: SessionUser; viewedSceneId: string | null };
    if (data.user.role === ROLE_GM || data.viewedSceneId !== sceneId) continue;
    member.emit('chase:sync', {
      sceneId,
      vehicles: players,
      obstacles,
    } satisfies ChaseSyncBroadcast);
  }
}

/** Geometria sceny potrzebna do przycięcia auta i foteli. */
export function chaseGeometry(scene: Scene): {
  settings: ChaseSettings;
  frame: {
    width: number;
    height: number;
    gridSizePx: number;
    gridOffsetX: number;
    gridOffsetY: number;
  };
} {
  return {
    settings: chaseSettingsOf(scene),
    frame: {
      width: scene.width,
      height: scene.height,
      gridSizePx: scene.gridSizePx,
      gridOffsetX: scene.gridOffsetX,
      gridOffsetY: scene.gridOffsetY,
    },
  };
}

function clampOnScene(scene: Scene, body: ChaseBody, point: ScenePoint): ScenePoint {
  const { settings, frame } = chaseGeometry(scene);
  return clampChaseVehicle(point, body, settings, frame);
}

/** Lewy górny róg figury w fotelu `seat` auta stojącego w `centre`. */
function seatPosition(
  scene: Scene,
  body: ChaseBody,
  centre: ScenePoint,
  seat: number,
  size: number,
): ScenePoint | null {
  const { settings } = chaseGeometry(scene);
  const at = vehicleSeatCentre(centre, body, seat, settings.direction, scene.gridSizePx);
  return at ? seatedTokenPosition(at, size, scene.gridSizePx) : null;
}

/**
 * Przesadza figury z foteli auta na jego obecne miejsce. Figura w fotelu,
 * którego układ już nie ma (mniejszy pojazd), wysiada na miejscu.
 * Zwraca figury, które trzeba rozesłać.
 */
export async function carryPassengers(
  prisma: PrismaClient,
  scene: Scene,
  placed: PlacedVehicle,
): Promise<string[]> {
  const body = chaseBodyOf(placed.vehicle);
  const passengers = await prisma.token.findMany({ where: { sceneVehicleId: placed.id } });
  const changed: string[] = [];
  for (const token of passengers) {
    const at =
      token.vehicleSeat === null
        ? null
        : seatPosition(scene, body, placed, token.vehicleSeat, token.size);
    if (!at) {
      await prisma.token.update({
        where: { id: token.id },
        data: { sceneVehicleId: null, vehicleSeat: null },
      });
      changed.push(token.id);
      continue;
    }
    if (at.x === token.x && at.y === token.y) continue;
    await prisma.token.update({ where: { id: token.id }, data: { x: at.x, y: at.y } });
    changed.push(token.id);
  }
  return changed;
}

/**
 * Po zmianie sceny (rodzaj, kierunek, pas, tło, kratka): `chase → map` zdejmuje
 * auta z drogi i wysadza figury na miejscu, reszta przycina auta do nowej
 * geometrii i przesadza figury w fotelach.
 */
export async function settleChaseAfterSceneChange(
  deps: RealtimeDeps,
  campaignId: string,
  after: Scene,
): Promise<void> {
  if (after.kind !== 'chase') {
    // Przeszkody (65e) żyją tylko na drodze pościgu.
    const cleared = await deps.ctx.prisma.chaseObstacle.deleteMany({
      where: { sceneId: after.id },
    });
    if (cleared.count > 0) await emitChase(deps, campaignId, after.id);
  }
  const placed = await placedOnScene(deps.ctx.prisma, after.id);
  if (placed.length === 0) return;
  if (after.kind !== 'chase') {
    const passengers = await deps.ctx.prisma.token.findMany({
      where: { sceneVehicleId: { in: placed.map((row) => row.id) } },
      select: { id: true },
    });
    await deps.ctx.prisma.sceneVehicle.deleteMany({ where: { sceneId: after.id } });
    await emitTokensById(
      deps,
      campaignId,
      passengers.map((row) => row.id),
    );
    await emitChase(deps, campaignId, after.id);
    return;
  }
  const moved: string[] = [];
  for (const row of placed) {
    const centre = clampOnScene(after, chaseBodyOf(row.vehicle), row);
    const current =
      centre.x === row.x && centre.y === row.y
        ? row
        : {
            ...row,
            ...(await deps.ctx.prisma.sceneVehicle.update({ where: { id: row.id }, data: centre })),
          };
    moved.push(...(await carryPassengers(deps.ctx.prisma, after, current)));
  }
  await emitTokensById(deps, campaignId, moved, { moved: true });
  await emitChase(deps, campaignId, after.id);
}

/**
 * Pojazd zmienił się w kampanii (nazwa, grafika, bryła, układ foteli) — jego
 * miejsce na drodze idzie za nim: przycięcie do pasa, fotele, lista aut.
 * Woła to `emitVehicleUpsert`, czyli każda droga zmiany pojazdu.
 */
export async function refreshVehiclePlacement(
  deps: RealtimeDeps,
  campaignId: string,
  vehicleId: string,
): Promise<void> {
  const placed = await deps.ctx.prisma.sceneVehicle.findUnique({
    where: { vehicleId },
    include: { vehicle: true, scene: true },
  });
  if (!placed) return;
  const { scene, ...row } = placed;
  const centre = clampOnScene(scene, chaseBodyOf(row.vehicle), row);
  const current =
    centre.x === row.x && centre.y === row.y
      ? row
      : {
          ...row,
          ...(await deps.ctx.prisma.sceneVehicle.update({ where: { id: row.id }, data: centre })),
        };
  await emitTokensById(deps, campaignId, await carryPassengers(deps.ctx.prisma, scene, current), {
    moved: true,
  });
  await emitChase(deps, campaignId, scene.id);
}

/**
 * Pojazd zniknął z kampanii — jego miejsce zeszło kaskadą, a figury z foteli
 * zostały na miejscu (`SetNull`). Odświeża sceny pościgu kampanii.
 */
export async function refreshChaseScenes(deps: RealtimeDeps, campaignId: string): Promise<void> {
  const scenes = await deps.ctx.prisma.scene.findMany({
    where: { campaignId, kind: 'chase' },
    select: { id: true },
  });
  for (const scene of scenes) {
    const orphans = await deps.ctx.prisma.token.findMany({
      where: { sceneId: scene.id, sceneVehicleId: null, vehicleSeat: { not: null } },
      select: { id: true },
    });
    if (orphans.length > 0) {
      await deps.ctx.prisma.token.updateMany({
        where: { id: { in: orphans.map((row) => row.id) } },
        data: { vehicleSeat: null },
      });
      await emitTokensById(
        deps,
        campaignId,
        orphans.map((row) => row.id),
      );
    }
    await emitChase(deps, campaignId, scene.id);
  }
}

export async function requirePlaced(
  prisma: PrismaClient,
  campaignId: string,
  sceneVehicleId: unknown,
): Promise<PlacedVehicle & { scene: Scene }> {
  if (typeof sceneVehicleId !== 'string' || sceneVehicleId.length === 0) {
    throw new RealtimeError('BAD_REQUEST');
  }
  const row = await prisma.sceneVehicle.findUnique({
    where: { id: sceneVehicleId },
    include: { vehicle: true, scene: true },
  });
  if (!row || row.scene.campaignId !== campaignId) throw new RealtimeError('VEHICLE_NOT_FOUND');
  return row;
}

export function requirePoint(payload: { x?: unknown; y?: unknown } | undefined): ScenePoint {
  const x = payload?.x;
  const y = payload?.y;
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  ) {
    throw new RealtimeError('BAD_REQUEST');
  }
  return { x, y };
}

/** Przesuwa auto na scenie i figury w jego fotelach — bez gniazd (65c doda budżet). */
export async function moveSceneVehicle(
  deps: RealtimeDeps,
  campaignId: string,
  placed: PlacedVehicle & { scene: Scene },
  target: ScenePoint,
): Promise<SceneVehicleView> {
  const { scene, ...row } = placed;
  const centre = clampOnScene(scene, chaseBodyOf(row.vehicle), target);
  const shifted = Math.hypot(centre.x - row.x, centre.y - row.y) >= 0.5;
  const updated = await deps.ctx.prisma.sceneVehicle.update({
    where: { id: row.id },
    // Auto stojące na drodze, które ktoś przestawił, nikogo już nie blokuje.
    data: { ...centre, ...(shifted ? { blockingId: null } : {}) },
  });
  if (shifted) await releaseBlocking(deps.ctx.prisma, row.id);
  const current = { ...updated, vehicle: row.vehicle };
  const moved = await carryPassengers(deps.ctx.prisma, scene, current);
  await emitChase(deps, campaignId, scene.id);
  await emitTokensById(deps, campaignId, moved, { moved: true });
  return placedView(deps.ctx.prisma, scene.id, row.id);
}

/**
 * Auto, które ruszyło (MG przeciągnął je w walce), zostawia przeszkody i stojące
 * auta, które czekały przed jego zderzakiem — inaczej zostałyby w kadrze tam,
 * gdzie stanęły, z wezwaniem do kierowcy, którego już przed nimi nie ma
 * (przegląd 03.11). Jeśli dalej stoją mu na torze, następna runda zawoła znowu.
 */
export async function releaseBlocking(prisma: PrismaClient, sceneVehicleId: string): Promise<void> {
  await prisma.chaseObstacle.updateMany({
    where: { blockingId: sceneVehicleId },
    data: { blockingId: null },
  });
  await prisma.sceneVehicle.updateMany({
    where: { blockingId: sceneVehicleId },
    data: { blockingId: null },
  });
}

/** MG stawia auto kampanii na drodze sceny pościgu (albo przestawia je z innej). */
export const chasePlaceEvent = defineEvent<ChasePlacePayload, SceneVehicleView>({
  name: 'chase:place',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireChaseCampaignId(socket.data);
    const scene = await requireCampaignScene(deps.ctx.prisma, campaignId, payload?.sceneId);
    if (scene.kind !== 'chase') throw new RealtimeError('NOT_A_CHASE');
    const point = requirePoint(payload);
    if (typeof payload?.vehicleId !== 'string') throw new RealtimeError('BAD_REQUEST');
    const vehicle = await deps.ctx.prisma.vehicle.findUnique({ where: { id: payload.vehicleId } });
    if (!vehicle || vehicle.campaignId !== campaignId) throw new RealtimeError('VEHICLE_NOT_FOUND');

    const existing = await deps.ctx.prisma.sceneVehicle.findUnique({
      where: { vehicleId: vehicle.id },
      include: { vehicle: true, scene: true },
    });
    if (existing && existing.sceneId === scene.id) {
      return moveSceneVehicle(deps, campaignId, existing, point);
    }
    // Jedno auto stoi na jednej scenie naraz: przestawienie z innej sceny
    // zostawia tam figury na miejscu, w którym siedziały.
    if (existing) {
      const passengers = await deps.ctx.prisma.token.findMany({
        where: { sceneVehicleId: existing.id },
        select: { id: true },
      });
      await deps.ctx.prisma.token.updateMany({
        where: { sceneVehicleId: existing.id },
        data: { sceneVehicleId: null, vehicleSeat: null },
      });
      await deps.ctx.prisma.sceneVehicle.delete({ where: { id: existing.id } });
      await emitTokensById(
        deps,
        campaignId,
        passengers.map((row) => row.id),
      );
      await emitChase(deps, campaignId, existing.sceneId);
    }
    const centre = clampOnScene(scene, chaseBodyOf(vehicle), point);
    const created = await deps.ctx.prisma.sceneVehicle.create({
      data: { sceneId: scene.id, vehicleId: vehicle.id, x: centre.x, y: centre.y },
    });
    await emitChase(deps, campaignId, scene.id);
    return placedView(deps.ctx.prisma, scene.id, created.id);
  },
});

/** MG zdejmuje auto z drogi — figury zostają tam, gdzie siedziały. */
export const chaseRemoveEvent = defineEvent<ChaseRemovePayload, void>({
  name: 'chase:remove',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireChaseCampaignId(socket.data);
    const placed = await requirePlaced(deps.ctx.prisma, campaignId, payload?.sceneVehicleId);
    const passengers = await deps.ctx.prisma.token.findMany({
      where: { sceneVehicleId: placed.id },
      select: { id: true },
    });
    await deps.ctx.prisma.token.updateMany({
      where: { sceneVehicleId: placed.id },
      data: { sceneVehicleId: null, vehicleSeat: null },
    });
    await deps.ctx.prisma.sceneVehicle.delete({ where: { id: placed.id } });
    await emitTokensById(
      deps,
      campaignId,
      passengers.map((row) => row.id),
    );
    await emitChase(deps, campaignId, placed.sceneId);
  },
});

/** Konto, które prowadzi kartę właściciela auta; `null` — auto MG albo NPC-a. */
export async function ownerUserOf(prisma: PrismaClient, vehicle: Vehicle): Promise<string | null> {
  if (!vehicle.ownerCharacterId) return null;
  const row = await prisma.character.findUnique({
    where: { id: vehicle.ownerCharacterId },
    select: { ownerId: true },
  });
  return row?.ownerId ?? null;
}

/**
 * Czy gracz może posadzić tę figurę za kierownicą: właściciel auta (konto jego
 * karty) albo karta figury z listy zgód. MG sadza zawsze.
 */
export async function mayTakeWheel(
  prisma: PrismaClient,
  placed: PlacedVehicle,
  token: Pick<Token, 'characterId'>,
  user: SessionUser,
): Promise<boolean> {
  if (user.role === ROLE_GM) return true;
  if ((await ownerUserOf(prisma, placed.vehicle)) === user.id) return true;
  return token.characterId !== null && readDrivers(placed.drivers).includes(token.characterId);
}

/** Sadza figurę w fotelu i ustawia ją na nim; zwraca nowy wiersz. */
async function seatToken(
  prisma: PrismaClient,
  scene: Scene,
  placed: PlacedVehicle,
  token: Token,
  seat: number,
): Promise<void> {
  const at = seatPosition(scene, chaseBodyOf(placed.vehicle), placed, seat, token.size);
  if (!at) throw new RealtimeError('SEAT_NOT_FOUND');
  await prisma.token.update({
    where: { id: token.id },
    data: { sceneVehicleId: placed.id, vehicleSeat: seat, x: at.x, y: at.y },
  });
}

async function seatTaken(
  prisma: PrismaClient,
  placed: PlacedVehicle,
  seat: number,
  tokenId: string,
): Promise<boolean> {
  const other = await prisma.token.findFirst({
    where: { sceneVehicleId: placed.id, vehicleSeat: seat, id: { not: tokenId } },
    select: { id: true },
  });
  return other !== null;
}

/**
 * Figura siada w fotelu. Gracz: własna, jawna figura, wolny fotel tego auta,
 * w którym już siedzi, albo dowolnego, gdy stoi na drodze; kierownica tylko
 * z `mayTakeWheel`. MG: każda figura, każdy fotel.
 */
export const vehicleSeatEvent = defineEvent<VehicleSeatPayload, void>({
  name: 'vehicle:seat',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireChaseCampaignId(socket.data);
    const { token, scene } = await requireCampaignToken(
      deps.ctx.prisma,
      campaignId,
      payload?.tokenId,
    );
    const isGm = user.role === ROLE_GM;
    if (!isGm && token.hidden) throw new RealtimeError('TOKEN_NOT_FOUND');
    if (!isGm && token.ownerId !== user.id) throw new RealtimeError('FORBIDDEN');
    const placed = await requirePlaced(deps.ctx.prisma, campaignId, payload?.sceneVehicleId);
    if (placed.sceneId !== scene.id || scene.kind !== 'chase') {
      throw new RealtimeError('VEHICLE_NOT_FOUND');
    }
    const seat = payload?.seat;
    const layout = chaseBodyOf(placed.vehicle).layout;
    if (typeof seat !== 'number' || !Number.isInteger(seat) || !VEHICLE_LAYOUTS[layout][seat]) {
      throw new RealtimeError('SEAT_NOT_FOUND');
    }
    if (!isGm && token.sceneVehicleId !== null && token.sceneVehicleId !== placed.id) {
      throw new RealtimeError('VEHICLE_SWITCH_GM_ONLY');
    }
    if (token.sceneVehicleId === placed.id && token.vehicleSeat === seat) return;
    if (await seatTaken(deps.ctx.prisma, placed, seat, token.id)) {
      throw new RealtimeError('SEAT_TAKEN');
    }
    if (seat === 0 && (await isBotFigure(deps.ctx.prisma, campaignId, token))) {
      throw new RealtimeError('BOT_CANNOT_DRIVE');
    }
    if (seat === 0 && !(await mayTakeWheel(deps.ctx.prisma, placed, token, user))) {
      throw new RealtimeError('DRIVER_SEAT_FORBIDDEN');
    }
    // Etap 65c: w walce gracz płaci za fotel — przesiadka w aucie to Akcja
    // Ruchu, wejście z jezdni to Akcja („Wejście do pojazdu”, s. 191).
    if (!isGm) {
      const switching = token.sceneVehicleId === placed.id;
      await requireTurnSpend(
        deps,
        campaignId,
        scene,
        token.id,
        { kind: 'action', actionId: switching ? CPRED_ACTION_MOVE : CPRED_ACTION_VEHICLE_ENTER },
        user,
        switching ? CPRED_ACTION_MOVE : CPRED_ACTION_VEHICLE_ENTER,
      );
    }
    await seatToken(deps.ctx.prisma, scene, placed, token, seat);
    await emitTokensById(deps, campaignId, [token.id], { moved: true });
    await emitChase(deps, campaignId, scene.id);
  },
});

/**
 * Bot-towarzysz jedzie tylko jako pasażer (decyzja MG 9): strzela i unika,
 * ale nie prowadzi (`BOT_CANNOT_DRIVE`). Rozpoznaje go karta przypięta do
 * profilu bota, jak w `autoEvasionHandsOf`.
 */
export async function isBotFigure(
  prisma: PrismaClient,
  campaignId: string,
  token: Pick<Token, 'characterId'>,
): Promise<boolean> {
  if (!token.characterId) return false;
  const bot = await prisma.botProfile.findFirst({
    where: { campaignId, archived: false, characterId: token.characterId },
    select: { id: true },
  });
  return bot !== null;
}

/** Właściciel auta (albo MG) daje karcie kierownicę albo ją odbiera. */
export const vehicleAllowDriverEvent = defineEvent<VehicleAllowDriverPayload, SceneVehicleView>({
  name: 'vehicle:allow-driver',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireChaseCampaignId(socket.data);
    const placed = await requirePlaced(deps.ctx.prisma, campaignId, payload?.sceneVehicleId);
    if (user.role !== ROLE_GM && (await ownerUserOf(deps.ctx.prisma, placed.vehicle)) !== user.id) {
      throw new RealtimeError('FORBIDDEN');
    }
    if (typeof payload.allow !== 'boolean') throw new RealtimeError('BAD_REQUEST');
    const { token } = await requireCampaignToken(deps.ctx.prisma, campaignId, payload.tokenId);
    if (token.hidden && user.role !== ROLE_GM) throw new RealtimeError('TOKEN_NOT_FOUND');
    // Zgoda trzyma się karty — figura bez karty kierownicę dostaje od MG ręką.
    if (!token.characterId) throw new RealtimeError('NO_CHARACTER');
    const drivers = new Set(readDrivers(placed.drivers));
    if (payload.allow) drivers.add(token.characterId);
    else drivers.delete(token.characterId);
    await deps.ctx.prisma.sceneVehicle.update({
      where: { id: placed.id },
      data: { drivers: JSON.stringify([...drivers]) },
    });
    await emitChase(deps, campaignId, placed.sceneId);
    return placedView(deps.ctx.prisma, placed.sceneId, placed.id);
  },
});

/**
 * MG upuścił figurę na scenie pościgu (65b): na wolnym fotelu — figura siada
 * (także w innym aucie), poza fotelem — wysiada na jezdnię tam, gdzie stanęła.
 * Wołane po zapisanym lądowaniu z ręki MG (`token:move`, `final`).
 */
export async function settleSeatAfterGmDrop(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  tokenId: string,
): Promise<void> {
  if (scene.kind !== 'chase') return;
  const token = await deps.ctx.prisma.token.findUnique({ where: { id: tokenId } });
  if (!token) return;
  const centre = {
    x: token.x + (token.size * scene.gridSizePx) / 2,
    y: token.y + (token.size * scene.gridSizePx) / 2,
  };
  const { settings } = chaseGeometry(scene);
  const placedAll = await placedOnScene(deps.ctx.prisma, scene.id);
  let onBody = false;
  for (const placed of placedAll) {
    const body = chaseBodyOf(placed.vehicle);
    if (!chaseBodyContains(placed, body, settings.direction, scene.gridSizePx, centre)) continue;
    onBody = true;
    const seat = seatAtPoint(placed, body, settings.direction, scene.gridSizePx, centre);
    if (seat === null || (await seatTaken(deps.ctx.prisma, placed, seat, token.id))) continue;
    if (seat === 0 && (await isBotFigure(deps.ctx.prisma, campaignId, token))) continue;
    await seatToken(deps.ctx.prisma, scene, placed, token, seat);
    await emitTokensById(deps, campaignId, [token.id], { moved: true });
    return;
  }
  if (token.sceneVehicleId === null) return;
  // Upuszczona na auto, ale nie na wolny fotel — wraca na swój. Wysiada tylko
  // ta, którą MG postawił na jezdni.
  const own = placedAll.find((row) => row.id === token.sceneVehicleId);
  if (onBody && own && token.vehicleSeat !== null) {
    await seatToken(deps.ctx.prisma, scene, own, token, token.vehicleSeat);
    await emitTokensById(deps, campaignId, [token.id], { moved: true });
    return;
  }
  await deps.ctx.prisma.token.update({
    where: { id: token.id },
    data: { sceneVehicleId: null, vehicleSeat: null },
  });
  await emitTokensById(deps, campaignId, [token.id]);
}
