import type {
  CombatActionLogEntry,
  ScenePoint,
  SessionUser,
  TurnPointer,
  VehicleDriveContact,
  VehicleDriveContactInfo,
  VehicleDrivePayload,
  VehicleDriveResult,
} from '@vtt/shared';
import {
  CPRED_ACTION_MOVE,
  CPRED_ACTION_NITRO,
  ROLE_GM,
  chaseAnchorShift,
  chaseAnchorVehicle,
  chaseBodyHalfExtents,
  chaseDriveStep,
  chaseFirstContact,
  chaseIsHorizontal,
  chaseLaneOf,
  chaseLaneTarget,
  chaseObstacleUnbreakable,
  chaseOffscreen,
  chaseShiftAlong,
  cpredCanSlowBehind,
  cpredCoastSpeed,
  cpredDriveAdvance,
  cpredLostControlLane,
  cpredLostControlNote,
  cpredLostControlSpeed,
  cpredMarkRammed,
  cpredPedalProblem,
  cpredPedalSpeed,
  cpredSlowBehindSpeed,
  cpredStartSpeed,
  cpredVehicleWrecked,
  isCpredPedal,
  nextTurn,
  readCpredTurn,
  readCpredVehicle,
  sortCombatants,
  type CpredPedal,
} from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { Scene, Token } from '../generated/prisma/client.js';
import {
  carryPassengers,
  chaseBodyOf,
  chaseGeometry,
  chaseRoundOf,
  driverCapable,
  emitChase,
  moveSceneVehicle,
  placedOnScene,
  placedView,
  requireChaseCampaignId,
  requirePlaced,
  seatedOnScene,
  vehicleMotion,
  type PlacedVehicle,
} from './chase.js';
import { crossSpikes, driftObstaclesRound, obstaclePendingFor } from './chase-obstacles.js';
import { firstChaseContact, obstacleBoxId, pushVehicleBehind, resolveRam } from './chase-ram.js';
import {
  applyTurnPointer,
  emitCombatOfScene,
  emitReloadedFor,
  findCombatantForToken,
  loadCombat,
  spendTurnForCombatant,
  toCombatView,
  type CombatRow,
  type CombatantRow,
} from './combat.js';
import { requireTurnSpend } from './combat-actions.js';
import { logSpentAction } from './combat-log.js';
import { createMixedRng } from './dice-rng.js';
import { clearGrapplesOf } from './grapple-state.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { emitSceneView } from './scenes.js';
import { emitSceneTokensToPlayers, emitTokensById } from './tokens.js';

/**
 * Jazda w pościgu od etapu 72 (`docs/etapy/etap-72-poscig-kokpit.md`).
 *
 * Auto ma **prędkość trwającą między turami** i **pas ruchu**; rusza się raz
 * na rundę, **w turze swojego kierowcy**: o `(prędkość − prędkość pościgu) / 4`
 * kratek wzdłuż drogi (+ zryw z Wyścigu, + Nitro) i najwyżej o pas w poprzek
 * (`vehicle:drive`). Kierowca, który skończy turę bez „Jedź”, jedzie sam — bez
 * pedału i zmiany pasa (`chaseTurnEnd`). Auto bez tury (bez kierowcy w walce)
 * jedzie na początku rundy.
 *
 * Na początku rundy (`startChaseRound`) prędkość pościgu bierze się z auta
 * kadru, a wszystko na drodze przesuwa się sztywno, żeby auto kadru wróciło na
 * swoje miejsce — to ruch kamery, odległości między autami się nie zmieniają.
 * Nic nie rusza auta poza tymi dwiema chwilami i ręką MG.
 *
 * Liczby (pedały, mil/h, utrata kontroli) są w `shared/systems/cpred/chase-drive.ts`,
 * geometria (pasy, krok, kadr) — w `shared/chase-drive.ts`.
 */

type PlacedWithScene = PlacedVehicle & { scene: Scene };

/**
 * O ile kratek przed przód auta sięga sonda zderzenia: auto, które stoi
 * zderzak w zderzak z wolniejszym (zatrzymane po „Zwolnij za nim” albo po
 * cofnięciu się poprzednika), dojeżdża do niego od razu — inaczej jego krok
 * zerowej długości niczego by nie wykrył.
 */
const TOUCH_PROBE_SQ = 0.1;

// ───────────────────────── Kierowca ─────────────────────────

/** Figura w fotelu kierowcy tego auta albo `null`. */
export async function driverOf(
  prisma: PrismaClient,
  sceneVehicleId: string,
): Promise<Token | null> {
  return prisma.token.findFirst({ where: { sceneVehicleId, vehicleSeat: 0 } });
}

/**
 * Kierowca, którym ten gracz prowadzi auto: jego jawna figura w fotelu 0,
 * zdolna do działania, w aucie, które jedzie w kadrze.
 */
export async function requireOwnDriver(
  prisma: PrismaClient,
  placed: PlacedWithScene,
  user: SessionUser,
): Promise<Token> {
  if (placed.scene.kind !== 'chase') throw new RealtimeError('NOT_A_CHASE');
  if (placed.status !== 'racing') throw new RealtimeError('VEHICLE_NOT_RACING');
  const driver = await driverOf(prisma, placed.id);
  if (!driver || driver.hidden || driver.ownerId !== user.id) {
    throw new RealtimeError('NOT_DRIVER');
  }
  if (!driverCapable(driver)) throw new RealtimeError('DRIVER_INCAPABLE');
  return driver;
}

/** Ta sama kontrola przed ruchem: silnik i panowanie nad autem. */
export function requireControllable(placed: PlacedWithScene): void {
  // Wrak nie jedzie (s. 191, 65d1) — przed silnikiem, bo to on mówi, dlaczego.
  if (cpredVehicleWrecked(readCpredVehicle(placed.vehicle.system))) {
    throw new RealtimeError('VEHICLE_WRECKED');
  }
  if (!placed.started) throw new RealtimeError('VEHICLE_NOT_STARTED');
  if (placed.lostControl) throw new RealtimeError('VEHICLE_OUT_OF_CONTROL');
}

/**
 * Wiersz kolejki kierowcy tego auta, gdy trwa jego tura — tylko wtedy liczy się
 * „jeden taran na turę” (decyzja MG z 06.11.2026 po rozegraniu „Zastawu”:
 * Nitro i trzy tarany w jednej Akcji Ruchu zrobiły z furgonu wrak). Ręka MG
 * poza turą kierowcy (poprawki, auto bez kierowcy) limitu nie ma, tak samo
 * jak wymuszona odpowiedź na przeszkodę przed zderzakiem (`chase:vehicle-answer`).
 */
async function driverTurnRow(
  prisma: PrismaClient,
  placed: PlacedWithScene,
): Promise<{ id: string; turnState: string | null } | null> {
  const driver = await prisma.token.findFirst({
    where: { sceneVehicleId: placed.id, vehicleSeat: 0 },
    select: { id: true },
  });
  if (!driver) return null;
  const found = await findCombatantForToken(prisma, placed.sceneId, driver.id);
  if (!found || found.combat.activeCombatantId !== found.combatant.id) return null;
  return { id: found.combatant.id, turnState: found.combatant.turnState };
}

/** Odmowa drugiego taranu w tej samej turze kierowcy (`RAM_USED`). */
export async function requireRamLeft(prisma: PrismaClient, placed: PlacedWithScene): Promise<void> {
  const row = await driverTurnRow(prisma, placed);
  if (row && readCpredTurn(row.turnState ?? undefined).rammed === true) {
    throw new RealtimeError('RAM_USED');
  }
}

/** Tura kierowcy z taranem — następny wybór nie zaproponuje już drugiego. */
async function markRammed(
  deps: RealtimeDeps,
  campaignId: string,
  placed: PlacedWithScene,
): Promise<void> {
  const row = await driverTurnRow(deps.ctx.prisma, placed);
  if (!row) return;
  await deps.ctx.prisma.combatant.update({
    where: { id: row.id },
    data: { turnState: JSON.stringify(cpredMarkRammed(readCpredTurn(row.turnState ?? undefined))) },
  });
  await emitCombatOfScene(deps, campaignId, placed.scene);
}

/** Czy kierowca tego auta odpalił w bieżącej turze Nitro (Akcja tury to Nitro). */
async function nitroThisTurn(prisma: PrismaClient, placed: PlacedWithScene): Promise<boolean> {
  const row = await driverTurnRow(prisma, placed);
  return (
    row !== null && readCpredTurn(row.turnState ?? undefined).action?.id === CPRED_ACTION_NITRO
  );
}

// ───────────────────────── Jazda z zderzeniami ─────────────────────────

/**
 * Jazda w walce z zderzeniami (65d2): auto jedzie do `target`, a gdy po drodze
 * trafi na inne auto albo pieszego — bez `ram` staje przed nim, z `ram` taranuje
 * (`resolveRam`) i jedzie dalej, jeśli przeszkoda ustąpiła, do następnej
 * przeszkody albo celu. `free` — jazda w turze kierowcy, wzdłuż bez przycięcia
 * do sceny (etap 72).
 */
export async function driveWithContacts(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  placed: PlacedWithScene,
  target: ScenePoint,
  ram: boolean,
  options: { free?: boolean } = {},
): Promise<void> {
  const prisma = deps.ctx.prisma;
  const from = { x: placed.x, y: placed.y };
  // Kolczatki na przejechanej drodze (65e) rzucają po każdym odcinku jazdy.
  const done = () => crossSpikes(deps, campaignId, user, placed, from);
  const contact = await firstChaseContact(prisma, placed, from, target);
  if (!contact) {
    await moveSceneVehicle(deps, campaignId, placed, target, options);
    return done();
  }
  await moveSceneVehicle(deps, campaignId, placed, contact.centre, options);
  if (!ram) return done();

  await markRammed(deps, campaignId, placed);
  const atContact = await requirePlaced(prisma, campaignId, placed.id);
  const goesOn = await resolveRam(
    deps,
    campaignId,
    user,
    atContact,
    contact.obstacle,
    contact.front,
  );
  if (!goesOn) {
    // Przeszkoda, która przeżyła taranowanie, reaguje tylko z pierwszym autem
    // i znika (04.11.2026); beton zostaje — auto rozbiło się na nim.
    if (
      contact.obstacle.kind === 'obstacle' &&
      !chaseObstacleUnbreakable(contact.obstacle.obstacle.kind)
    ) {
      await prisma.chaseObstacle.deleteMany({ where: { id: contact.obstacle.id } });
      await emitChase(deps, campaignId, placed.sceneId);
    }
    return done();
  }
  const after = await requirePlaced(prisma, campaignId, placed.id);
  // Taranujący, którego zderzenie samo rozbiło, dalej nie jedzie (s. 191).
  if (cpredVehicleWrecked(readCpredVehicle(after.vehicle.system))) return done();
  const skip = new Set([
    contact.obstacle.kind === 'token'
      ? `token:${contact.obstacle.id}`
      : contact.obstacle.kind === 'obstacle'
        ? obstacleBoxId(contact.obstacle.id)
        : contact.obstacle.id,
  ]);
  const next = await firstChaseContact(prisma, after, after, target, skip);
  await moveSceneVehicle(deps, campaignId, after, next?.centre ?? target, options);
  // Auto, przez które taranujący przejechał (wrak), nie zostaje pod nim: ląduje
  // za jego tylnym zderzakiem, jak przeszkoda z 65e (decyzja MG z 03.11).
  if (contact.obstacle.kind === 'vehicle') {
    await pushVehicleBehind(deps, campaignId, placed.scene, contact.obstacle.id, placed.id);
  }
  return done();
}

// ───────────────────────── Plan ruchu ─────────────────────────

/** Jak auto jedzie: kierowca wybrał, serwer za niego (koniec tury) albo automat bez kontroli. */
type DriveMode = 'driver' | 'auto' | 'lost';

interface DriveOrder {
  pedal: CpredPedal | null;
  laneDelta: -1 | 0 | 1;
  mode: DriveMode;
}

/** Zderzenie na drodze ruchu, które czeka na wybór (albo rozstrzyga je tryb). */
interface PlannedContact {
  info: VehicleDriveContactInfo;
  /** Środek auta przy zderzaku blokującego. */
  centre: ScenePoint;
  /** Auto cofa się (wolniejsze od pościgu) i staje przed tym, co jedzie za nim. */
  rear: boolean;
  /**
   * Dokąd jedzie taran: koniec odcinka ruchu, a przy samym styku (zderzak
   * w zderzak) — koniec sondy, inaczej krok zerowej długości niczego nie trafi.
   */
  ramTo: ScenePoint;
}

interface DrivePlan {
  from: ScenePoint;
  to: ScenePoint;
  /** Prędkość z początku tury (sprzed pedału) — od niej „Zwolnij za nim”. */
  speedBefore: number;
  /** Prędkość po pedale. */
  speed: number;
  maxSpeed: number;
  contact: PlannedContact | null;
}

/**
 * Ruch auta w tej turze bez wykonywania: pas, przesunięcie wzdłuż i pierwsze
 * zderzenie na drodze. Zderzenie liczy się, gdy bryły zachodzą na siebie na
 * odcinku ruchu albo gdy auto stoi zderzak w zderzak z czymś wolniejszym
 * (`TOUCH_PROBE_SQ`). Zjazd tyłem na auto z tyłu to nie zderzenie tego
 * kierowcy — auto staje, a wybór ma tamten, gdy dojedzie (decyzja MG 19.11).
 */
async function planDrive(
  prisma: PrismaClient,
  placed: PlacedWithScene,
  order: DriveOrder,
): Promise<DrivePlan> {
  const stats = readCpredVehicle(placed.vehicle.system);
  const maxSpeed = Math.max(0, stats.move);
  const { settings, frame } = chaseGeometry(placed.scene);
  const from = { x: placed.x, y: placed.y };
  const lane = chaseLaneOf(from, settings.lanes, settings, frame);
  const target = chaseLaneTarget(lane, order.laneDelta, settings.lanes);
  if (target === null && order.mode === 'driver') throw new RealtimeError('LANE_EDGE');
  const speedBefore = Math.max(0, placed.speed);
  const speed = cpredPedalSpeed(speedBefore, maxSpeed, order.pedal);
  const advanceSq = cpredDriveAdvance({
    speed,
    pursuitSpeed: placed.scene.chasePursuitSpeed ?? speed,
    raceBonus: placed.raceBonus,
    nitroMove: (await nitroThisTurn(prisma, placed)) ? maxSpeed : 0,
  });
  const step = chaseDriveStep({
    centre: from,
    lane: target ?? lane,
    advanceSq,
    lanes: settings.lanes,
    settings,
    scene: frame,
  });
  const plan: DrivePlan = { from, to: step.to, speedBefore, speed, maxSpeed, contact: null };

  const grid = placed.scene.gridSizePx;
  const real = await firstChaseContact(prisma, placed, from, step.to);
  const probeTo = chaseShiftAlong(step.to, settings.direction, TOUCH_PROBE_SQ, grid);
  const touching =
    real || advanceSq < 0 ? null : await firstChaseContact(prisma, placed, from, probeTo);
  const contact = real ?? touching;
  if (!contact) return plan;
  const blockerSpeed = contact.obstacle.kind === 'vehicle' ? contact.obstacle.vehicle.speed : 0;
  // Sam styk liczy się tylko wtedy, gdy auto dojeżdża do wolniejszego.
  if (!real && (!contact.front || speed <= blockerSpeed)) return plan;
  const horizontal = chaseIsHorizontal(settings.direction);
  const alongAxis = horizontal ? 'x' : 'y';
  const side = !contact.front && contact.axis !== alongAxis;
  const rear = !contact.front && !side;
  plan.contact = {
    centre: contact.centre,
    rear,
    ramTo: real ? step.to : probeTo,
    info: {
      name:
        contact.obstacle.kind === 'vehicle'
          ? contact.obstacle.vehicle.vehicle.name
          : contact.obstacle.kind === 'obstacle'
            ? contact.obstacle.obstacle.name
            : contact.obstacle.token.name,
      kind: contact.obstacle.kind,
      side,
      canSlow: !side && !rear && cpredCanSlowBehind(speedBefore, blockerSpeed),
      speed: blockerSpeed,
    },
  };
  return plan;
}

/** Co auto robi ze zderzeniem: wybór kierowcy albo reguła trybu (koniec tury, utrata kontroli). */
function contactDecision(
  plan: DrivePlan,
  mode: DriveMode,
  chosen: VehicleDriveContact | undefined,
): 'stop' | VehicleDriveContact | null {
  const contact = plan.contact;
  if (!contact) return null;
  if (contact.rear) return 'stop';
  // Automat utraty kontroli: „co stanie na drodze, rozstrzyga resolveRam”.
  if (mode === 'lost') return 'ram';
  // Koniec tury bez „Jedź” (decyzja MG 19.11): zwolnij, a gdy hamulec nie
  // wystarcza — uderz, bo kierowca nie zareagował.
  if (mode === 'auto') return contact.info.side ? 'stop' : contact.info.canSlow ? 'slow' : 'ram';
  if (!chosen) return null;
  if (chosen === 'slow' && !contact.info.canSlow) throw new RealtimeError('CANT_SLOW_BEHIND');
  return chosen;
}

/**
 * Wykonanie ruchu: prędkość, runda ruchu, jazda z zderzeniami. Auto, które
 * wyjechało za krawędź, odpada dopiero na początku rundy — po przesunięciu
 * kadru (kamera jedzie za autem kadru, więc liczy się kadr z tej chwili).
 */
async function executeDrive(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  placed: PlacedWithScene,
  plan: DrivePlan,
  decision: 'stop' | VehicleDriveContact | null,
  round: number,
): Promise<void> {
  const prisma = deps.ctx.prisma;
  const speed =
    decision === 'slow' && plan.contact
      ? cpredSlowBehindSpeed(plan.contact.info.speed, plan.maxSpeed)
      : plan.speed;
  await prisma.sceneVehicle.update({
    where: { id: placed.id },
    data: { speed, movedRound: round },
  });
  const fresh = await requirePlaced(prisma, campaignId, placed.id);
  const target = !plan.contact
    ? plan.to
    : decision === 'slow' || decision === 'stop'
      ? plan.contact.centre
      : decision === 'ram'
        ? plan.contact.ramTo
        : plan.to;
  await driveWithContacts(deps, campaignId, user, fresh, target, decision === 'ram', {
    free: true,
  });
  await emitChase(deps, campaignId, placed.sceneId);
}

/**
 * Utrata kontroli (etap 72, automat zamiast ręki MG): prędkość spada od razu
 * o 10 Ruchu. Jeśli trwa tura kierowcy, a auto jeszcze nie jechało, jedzie od
 * razu automatem (`lostControlDrive`); inaczej — na koniec tury kierowcy.
 */
export async function loseControl(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  sceneVehicleId: string,
): Promise<void> {
  const prisma = deps.ctx.prisma;
  const placed = await prisma.sceneVehicle.findUnique({
    where: { id: sceneVehicleId },
    include: { vehicle: true, scene: true },
  });
  if (!placed) return;
  await prisma.sceneVehicle.update({
    where: { id: placed.id },
    data: { lostControl: true, speed: cpredLostControlSpeed(placed.speed) },
  });
  const round = chaseRoundOf(placed.scene);
  if (round === null || placed.movedRound >= round) return;
  if (!(await driverTurnRow(prisma, placed))) return;
  await lostControlDrive(deps, campaignId, user, placed.id, round);
}

/** Ruch auta bez kontroli: 1k6 wybiera tor, zderzenie rozstrzyga taranowanie. */
async function lostControlDrive(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  sceneVehicleId: string,
  round: number,
): Promise<void> {
  const placed = await requirePlaced(deps.ctx.prisma, campaignId, sceneVehicleId);
  const lane = cpredLostControlLane(createMixedRng());
  const plan = await planDrive(deps.ctx.prisma, placed, {
    pedal: null,
    laneDelta: lane.laneDelta,
    mode: 'lost',
  });
  await logSpentAction(deps, campaignId, user, {
    combatantId: '',
    actorName: placed.vehicle.name,
    actionId: 'chase-lost-control',
    actionName: 'Utrata kontroli',
    note: `auto jedzie samo · ${cpredLostControlNote(lane)}`,
  });
  await executeDrive(
    deps,
    campaignId,
    user,
    placed,
    plan,
    contactDecision(plan, 'lost', undefined),
    round,
  );
}

// ───────────────────────── vehicle:drive ─────────────────────────

function readPedal(raw: unknown): CpredPedal | null {
  if (raw === null || raw === undefined) return null;
  if (!isCpredPedal(raw)) throw new RealtimeError('BAD_REQUEST');
  return raw;
}

function readLaneDelta(raw: unknown): -1 | 0 | 1 {
  if (raw === undefined || raw === 0) return 0;
  if (raw === -1 || raw === 1) return raw;
  throw new RealtimeError('BAD_REQUEST');
}

function readContactChoice(raw: unknown): VehicleDriveContact | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (raw === 'ram' || raw === 'slow') return raw;
  throw new RealtimeError('BAD_REQUEST');
}

/**
 * `vehicle:drive` — kierowca prowadzi auto w swojej turze (etap 72): pedał,
 * pas i — gdy coś stoi na drodze — wybór „Taranuj” albo „Zwolnij za nim”.
 * Zanim cokolwiek wyda, serwer sprawdza drogę: zderzenie bez wyboru wraca
 * jako pytanie (`moved: false`). Gaz, hamulec i zmiana pasa kosztują Akcję
 * Ruchu, jazda prosto nic. MG prowadzi tak każde auto z kierowcą w jego turze.
 */
export const vehicleDriveEvent = defineEvent<VehicleDrivePayload, VehicleDriveResult>({
  name: 'vehicle:drive',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireChaseCampaignId(socket.data);
    const prisma = deps.ctx.prisma;
    const placed = await requirePlaced(prisma, campaignId, payload?.sceneVehicleId);
    const pedal = readPedal(payload?.pedal);
    const laneDelta = readLaneDelta(payload?.laneDelta);
    const chosen = readContactChoice(payload?.onContact);
    if (placed.scene.kind !== 'chase') throw new RealtimeError('NOT_A_CHASE');
    if (placed.status !== 'racing') throw new RealtimeError('VEHICLE_NOT_RACING');
    const round = chaseRoundOf(placed.scene);
    const combat = await loadCombat(prisma, placed.sceneId);
    if (!combat || round === null) throw new RealtimeError('DRIVE_COMBAT_ONLY');
    const driver =
      user.role === ROLE_GM
        ? await driverOf(prisma, placed.id)
        : await requireOwnDriver(prisma, placed, user);
    if (!driver) throw new RealtimeError('NOT_DRIVER');
    if (!driverCapable(driver)) throw new RealtimeError('DRIVER_INCAPABLE');
    const found = await findCombatantForToken(prisma, placed.sceneId, driver.id);
    if (!found) throw new RealtimeError('DRIVER_NOT_IN_COMBAT');
    if (found.combat.activeCombatantId !== found.combatant.id) {
      throw new RealtimeError('NOT_YOUR_TURN');
    }
    requireControllable(placed);
    if (placed.movedRound >= round) throw new RealtimeError('ALREADY_DROVE');
    // Przeszkoda przed zderzakiem (65e) czeka na odpowiedź — najpierw Manewr albo taranowanie.
    if (await obstaclePendingFor(prisma, placed.id)) throw new RealtimeError('OBSTACLE_PENDING');
    const stats = readCpredVehicle(placed.vehicle.system);
    if (pedal) {
      const problem = cpredPedalProblem(placed.speed, stats.move, pedal);
      if (problem) throw new RealtimeError(problem);
    }

    const order: DriveOrder = { pedal, laneDelta, mode: 'driver' };
    const plan = await planDrive(prisma, placed, order);
    const decision = contactDecision(plan, 'driver', chosen);
    if (plan.contact && decision === null) {
      return { moved: false, contact: plan.contact.info };
    }
    // Jeden taran na turę (06.11.2026) — odmowa, zanim cokolwiek pójdzie z budżetu.
    if (decision === 'ram') await requireRamLeft(prisma, placed);

    const costs = pedal !== null || laneDelta !== 0;
    if (costs) {
      const dry = await spendTurnForCombatant(
        deps,
        found.combat,
        found.combatant,
        { kind: 'move' },
        user,
        { dryRun: true },
      );
      if (dry.kind === 'refused') {
        // Odmowę z powodem i kartą daje prawdziwy wydatek.
        await requireTurnSpend(
          deps,
          campaignId,
          placed.scene,
          driver.id,
          { kind: 'move' },
          user,
          CPRED_ACTION_MOVE,
        );
      }
    }
    // Słaby kierowca rzuca Test zwykłej jazdy w Wyścigu na początku rundy
    // (72c) — przy „Jedź” już nie; utrata kontroli odmawia wyżej.
    if (costs) {
      await requireTurnSpend(
        deps,
        campaignId,
        placed.scene,
        driver.id,
        { kind: 'move' },
        user,
        CPRED_ACTION_MOVE,
        { silent: true },
      );
    }
    await executeDrive(deps, campaignId, user, placed, plan, decision, round);
    return { moved: true, vehicle: await placedView(prisma, placed.sceneId, placed.id) };
  },
});

// ───────────────────────── Koniec tury kierowcy ─────────────────────────

/**
 * Koniec tury kierowcy (hak `advanceTurn`): auto, które w tej rundzie jeszcze
 * nie jechało, jedzie samo — bez pedału i zmiany pasa, a bez kontroli
 * automatem (1k6 na pas). Zderzenie na drodze: „Zwolnij za nim”, gdy wystarcza
 * hamulec, inaczej taranowanie (decyzja MG 19.11). Także wrak i auto ze
 * zgaszonym silnikiem z kierowcą w kolejce — droga zabiera je w tył.
 */
export async function chaseTurnEnd(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  combatant: CombatantRow,
  /** Runda, której tura się kończy — cofnięta i ponowiona tura starej rundy nie jedzie. */
  turnRound: number,
  user: SessionUser,
): Promise<void> {
  if (scene.kind !== 'chase' || !combatant.tokenId) return;
  const prisma = deps.ctx.prisma;
  const token = await prisma.token.findUnique({
    where: { id: combatant.tokenId },
    select: { sceneVehicleId: true, vehicleSeat: true },
  });
  if (!token || token.sceneVehicleId === null || token.vehicleSeat !== 0) return;
  const placed = await prisma.sceneVehicle.findUnique({
    where: { id: token.sceneVehicleId },
    include: { vehicle: true, scene: true },
  });
  if (!placed || placed.status !== 'racing') return;
  const round = chaseRoundOf(placed.scene);
  if (round === null || round !== turnRound || placed.movedRound >= round) return;
  if (placed.lostControl) {
    await lostControlDrive(deps, campaignId, user, placed.id, round);
    return;
  }
  const plan = await planDrive(prisma, placed, { pedal: null, laneDelta: 0, mode: 'auto' });
  await executeDrive(
    deps,
    campaignId,
    user,
    placed,
    plan,
    contactDecision(plan, 'auto', undefined),
    round,
  );
}

// ───────────────────────── Początek rundy ─────────────────────────

/** Auto odpada z pościgu: status, załoga znika graczom i wychodzi z kolejki, wiersz czatu. */
async function dropFromChase(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  scene: Scene,
  combat: CombatRow,
  dropped: readonly { id: string; name: string; status: 'behind' | 'escaped' }[],
): Promise<void> {
  const prisma = deps.ctx.prisma;
  const leaving = new Set<string>();
  for (const entry of dropped) {
    await prisma.sceneVehicle.update({
      where: { id: entry.id },
      data: { status: entry.status, blockingId: null, lostControl: false },
    });
    await prisma.sceneVehicle.updateMany({
      where: { sceneId: scene.id, blockingId: entry.id },
      data: { blockingId: null },
    });
    const crew = await prisma.token.findMany({
      where: { sceneVehicleId: entry.id },
      select: { id: true },
    });
    for (const token of crew) leaving.add(token.id);
  }
  // Załoga auta, które odpadło, znika graczom razem z autem (66c).
  await emitSceneTokensToPlayers(deps, campaignId, scene);
  for (const combatant of combat.combatants) {
    if (combatant.tokenId === null || !leaving.has(combatant.tokenId)) continue;
    await clearGrapplesOf(deps, campaignId, combat, combatant);
    await prisma.combatant.deleteMany({ where: { id: combatant.id } });
  }
  for (const entry of dropped) {
    const line: CombatActionLogEntry = {
      combatantId: '',
      actorName: entry.name,
      actionId: entry.status === 'behind' ? 'chase-behind' : 'chase-escaped',
      actionName: entry.status === 'behind' ? 'Zostaje w tyle' : 'Ucieka',
      note: 'odpada z pościgu',
    };
    await logSpentAction(deps, campaignId, user, line);
  }
}

/**
 * Początek rundy na scenie pościgu (etap 72, zastępuje dryf z 65c):
 *
 * 1. prędkości — w pierwszej rundzie walki prędkość startowa sceny
 *    (`cpredStartSpeed`), potem auto bez kierowcy albo ze zgaszonym silnikiem
 *    zwalnia o połowę (`cpredCoastSpeed`), wrak stoi; utrata kontroli mija;
 * 2. auto kadru (`chaseAnchorVehicle`) i prędkość pościgu — jego prędkość,
 *    stała przez całą rundę;
 * 3. sztywne przesunięcie: auta, figury w fotelach i przeszkody o tyle, żeby
 *    auto kadru stanęło na swoim miejscu (`chaseAnchorShift`);
 * 4. auta bez tury (kierowcy nie ma w kolejce) jadą od razu — od rundy 2;
 *    cofające się na auto z kontrolą staje przed nim i czeka na wybór jego
 *    kierowcy (`chase:vehicle-answer`), na auto bez kontroli — zderzenie;
 * 5. przeszkody zbliżają się o drogę rundy (`prędkość pościgu / 4`);
 * 6. auto, którego bryła cała wyjechała za krawędź kadru, odpada.
 *
 * Raz na rundę (`chaseRace.round`) — MG cofający i ponawiający turę nie
 * przesuwa kadru drugi raz. Zwraca `true`, gdy z kolejki zdjęto figury.
 */
export async function startChaseRound(
  deps: RealtimeDeps,
  campaignId: string,
  sceneRow: Scene,
  combat: CombatRow,
  round: number,
  user: SessionUser,
): Promise<boolean> {
  if (sceneRow.kind !== 'chase') return false;
  const prisma = deps.ctx.prisma;
  const scene = await prisma.scene.findUnique({ where: { id: sceneRow.id } });
  if (!scene) return false;
  const last = chaseRoundOf(scene);
  if (last !== null && last >= round) return false;
  const first = last === null;
  const { settings, frame } = chaseGeometry(scene);
  const grid = scene.gridSizePx;
  const placed = await placedOnScene(prisma, scene.id);
  const seated = await seatedOnScene(prisma, placed);
  const racing = placed.filter((row) => row.status === 'racing');
  const inQueue = new Set(
    combat.combatants.map((row) => row.tokenId).filter((id): id is string => id !== null),
  );
  const drivers = await prisma.token.findMany({
    where: { sceneVehicleId: { in: racing.map((row) => row.id) }, vehicleSeat: 0 },
    select: { id: true, sceneVehicleId: true },
  });
  const hasTurn = new Set(
    drivers.filter((token) => inQueue.has(token.id)).map((token) => token.sceneVehicleId!),
  );

  // 1. Prędkości.
  const lostBefore = new Set(racing.filter((row) => row.lostControl).map((row) => row.id));
  const motions = new Map(
    racing.map((row) => [row.id, vehicleMotion(row, seated, scene)] as const),
  );
  const speeds = new Map<string, number>();
  const wrecked = new Set<string>();
  for (const row of racing) {
    const stats = readCpredVehicle(row.vehicle.system);
    const wreck = cpredVehicleWrecked(stats);
    if (wreck) wrecked.add(row.id);
    const control = motions.get(row.id)!.control;
    const speed = first
      ? cpredStartSpeed(stats.move, scene.chaseTempo, {
          started: row.started,
          driven: control !== 'none',
          wrecked: wreck,
        })
      : wreck
        ? 0
        : !row.started || control === 'none'
          ? cpredCoastSpeed(row.speed)
          : Math.min(Math.max(0, stats.move), Math.max(0, row.speed));
    speeds.set(row.id, speed);
  }

  // 2. Auto kadru i prędkość pościgu.
  const anchorId = chaseAnchorVehicle(
    racing.map((row) => ({
      id: row.id,
      status: wrecked.has(row.id) ? ('wrecked' as const) : ('racing' as const),
      party: motions.get(row.id)!.party,
      control: motions.get(row.id)!.control,
      speed: speeds.get(row.id)!,
    })),
    scene.chaseAnchorId,
  );
  const anchor = anchorId ? racing.find((row) => row.id === anchorId)! : null;
  const pursuit = anchor ? speeds.get(anchor.id)! : 0;
  const shiftSq = anchor
    ? chaseAnchorShift({ x: anchor.x, y: anchor.y }, settings.direction, settings.role, frame)
    : 0;

  // 3. Sztywne przesunięcie kadru.
  const centres = new Map<string, ScenePoint>();
  for (const row of racing) {
    centres.set(row.id, chaseShiftAlong(row, settings.direction, shiftSq, grid));
  }
  if (shiftSq !== 0) {
    const obstacles = await prisma.chaseObstacle.findMany({ where: { sceneId: scene.id } });
    for (const obstacle of obstacles) {
      const at = chaseShiftAlong(obstacle, settings.direction, shiftSq, grid);
      await prisma.chaseObstacle.update({ where: { id: obstacle.id }, data: at });
    }
  }
  const starts = new Map(centres);

  // 4. Auta bez tury jadą od razu (od rundy 2 — pierwszą ustawia MG).
  const byId = new Map(racing.map((row) => [row.id, row] as const));
  const riders = new Set(
    racing
      .filter(
        (row) => row.blockingId !== null && row.blockingId !== row.id && byId.has(row.blockingId),
      )
      .map((row) => row.id),
  );
  const crashes: { rammerId: string; struckId: string }[] = [];
  const blockedNow: { stalled: string; driven: string }[] = [];
  const blockings = new Map<string, string>();
  const halves = (id: string) =>
    chaseBodyHalfExtents(chaseBodyOf(byId.get(id)!.vehicle), settings.direction, grid);
  const controlled = async (id: string): Promise<boolean> => {
    const row = byId.get(id)!;
    if (lostBefore.has(id) || !row.started || wrecked.has(id)) return false;
    const driver = await driverOf(prisma, id);
    return driver !== null && driverCapable(driver);
  };
  const moved = new Set<string>();
  if (!first) {
    for (const row of racing) {
      if (hasTurn.has(row.id) || riders.has(row.id)) continue;
      moved.add(row.id);
      const advance = (speeds.get(row.id)! - pursuit) / 4;
      if (advance === 0) continue;
      const from = centres.get(row.id)!;
      const to = chaseShiftAlong(from, settings.direction, advance, grid);
      const contact = chaseFirstContact(
        from,
        to,
        halves(row.id),
        racing
          .filter((other) => other.id !== row.id)
          .map((other) => ({ id: other.id, centre: centres.get(other.id)!, ...halves(other.id) })),
      );
      centres.set(row.id, contact?.centre ?? to);
      if (!contact) continue;
      if (advance < 0) {
        // Auto cofa się na to, co jedzie za nim — to tamto dojeżdża do niego.
        if (await controlled(contact.id)) {
          blockings.set(row.id, contact.id);
          blockedNow.push({ stalled: row.id, driven: contact.id });
        } else crashes.push({ rammerId: contact.id, struckId: row.id });
      } else if (motions.get(row.id)!.control === 'none') {
        crashes.push({ rammerId: row.id, struckId: contact.id });
      }
    }
  }

  // Zapis aut: miejsce, prędkość, koniec utraty kontroli, zryw do zera.
  const tokensMoved: string[] = [];
  for (const row of racing) {
    const centre = centres.get(row.id)!;
    const updated = await prisma.sceneVehicle.update({
      where: { id: row.id },
      data: {
        x: centre.x,
        y: centre.y,
        speed: speeds.get(row.id)!,
        lostControl: false,
        raceBonus: 0,
        ...(moved.has(row.id) ? { movedRound: round } : {}),
        ...(blockings.has(row.id) ? { blockingId: blockings.get(row.id)! } : {}),
      },
    });
    tokensMoved.push(
      ...(await carryPassengers(prisma, scene, { ...updated, vehicle: row.vehicle })),
    );
  }
  await prisma.scene.update({
    where: { id: scene.id },
    data: {
      chasePursuitSpeed: pursuit,
      chaseShiftSq: scene.chaseShiftSq + shiftSq,
      chaseRace: JSON.stringify({ round }),
    },
  });
  await emitTokensById(deps, campaignId, tokensMoved, { moved: true });
  for (const { stalled, driven } of blockedNow) {
    await logSpentAction(deps, campaignId, user, {
      combatantId: '',
      actorName: byId.get(driven)!.vehicle.name,
      actionId: 'chase-obstacle',
      actionName: 'Przeszkoda na drodze',
      note: `${byId.get(stalled)!.vehicle.name} — Gwałtowny skręt albo taranowanie`,
    });
  }
  for (const crash of crashes) {
    const rammer = await prisma.sceneVehicle.findUnique({
      where: { id: crash.rammerId },
      include: { vehicle: true, scene: true },
    });
    const struck = await prisma.sceneVehicle.findUnique({
      where: { id: crash.struckId },
      include: { vehicle: true },
    });
    if (!rammer || !struck) continue;
    await resolveRam(
      deps,
      campaignId,
      user,
      rammer,
      { kind: 'vehicle', id: struck.id, vehicle: struck },
      true,
    );
    await pushVehicleBehind(deps, campaignId, scene, struck.id, rammer.id);
  }

  // 5. Przeszkody jadą z drogą: o prędkość pościgu / 4 w tył kadru.
  const fresh = await prisma.scene.findUnique({ where: { id: scene.id } });
  const moves = new Map<string, { from: ScenePoint; to: ScenePoint }>();
  for (const row of racing)
    moves.set(row.id, { from: starts.get(row.id)!, to: centres.get(row.id)! });
  await driftObstaclesRound(
    deps,
    campaignId,
    fresh ?? scene,
    round,
    user,
    moves,
    lostBefore,
    pursuit,
  );

  // 6. Odpadanie z pościgu.
  const after = await placedOnScene(prisma, scene.id);
  const dropped: { id: string; name: string; status: 'behind' | 'escaped' }[] = [];
  for (const row of after) {
    if (row.status !== 'racing') continue;
    const off = chaseOffscreen(row, chaseBodyOf(row.vehicle), settings.direction, frame);
    if (off) dropped.push({ id: row.id, name: row.vehicle.name, status: off });
  }
  if (dropped.length > 0) await dropFromChase(deps, campaignId, user, scene, combat, dropped);
  await emitChase(deps, campaignId, scene.id);
  // Prędkość pościgu i suma przesunięć kadru jadą w widoku sceny — z nich
  // klient wie, że walka trwa (kokpit), i przesuwa drogę razem z autami.
  await emitSceneView(deps, campaignId, scene.id);
  return dropped.length > 0;
}

/**
 * Wskaźnik tury po początku rundy: jeśli figura, która miała zacząć rundę,
 * właśnie odpadła z pościgu, rundę zaczyna pierwszy, kto został.
 */
export function pointerAfterDrift(combat: CombatRow, pointer: TurnPointer): TurnPointer {
  if (combat.combatants.some((row) => row.id === pointer.activeCombatantId)) return pointer;
  const first = sortCombatants(toCombatView(combat).combatants).find((row) => !row.out);
  return { round: pointer.round, activeCombatantId: first?.id ?? null };
}

/**
 * MG: auto ucieka z pościgu ręką (zaległość z 04.11). Kto ma turę w tym aucie,
 * oddaje ją dalej — jak `combat:remove`.
 */
export async function escapeFromChase(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  placed: PlacedWithScene,
): Promise<void> {
  const prisma = deps.ctx.prisma;
  const { scene } = placed;
  const combat = await loadCombat(prisma, scene.id);
  if (combat) {
    const crew = await prisma.token.findMany({
      where: { sceneVehicleId: placed.id },
      select: { id: true },
    });
    const leaving = new Set(crew.map((token) => token.id));
    const active = combat.combatants.find((row) => row.id === combat.activeCombatantId);
    if (active?.tokenId && leaving.has(active.tokenId)) {
      const view = toCombatView(combat);
      const staying = {
        ...view,
        combatants: view.combatants.filter(
          (row) => row.id === active.id || !row.tokenId || !leaving.has(row.tokenId),
        ),
      };
      const pointer = nextTurn(staying);
      await applyTurnPointer(
        deps,
        combat,
        {
          ...pointer,
          activeCombatantId:
            pointer.activeCombatantId === active.id ? null : pointer.activeCombatantId,
        },
        true,
      );
    }
    await dropFromChase(deps, campaignId, user, scene, combat, [
      { id: placed.id, name: placed.vehicle.name, status: 'escaped' },
    ]);
    await emitReloadedFor(deps, campaignId, scene, combat.id, null);
  } else {
    await prisma.sceneVehicle.update({
      where: { id: placed.id },
      data: { status: 'escaped', blockingId: null, lostControl: false },
    });
    await prisma.sceneVehicle.updateMany({
      where: { sceneId: scene.id, blockingId: placed.id },
      data: { blockingId: null },
    });
    await emitSceneTokensToPlayers(deps, campaignId, scene);
    await logSpentAction(deps, campaignId, user, {
      combatantId: '',
      actorName: placed.vehicle.name,
      actionId: 'chase-escaped',
      actionName: 'Ucieka',
      note: 'odpada z pościgu',
    });
  }
  await emitChase(deps, campaignId, scene.id);
}
