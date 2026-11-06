import type {
  ChaseEscapePayload,
  ChaseMovePayload,
  ChaseRestorePayload,
  CombatActionLogEntry,
  SceneVehicleView,
  SessionUser,
  TurnPointer,
  VehicleControlPayload,
  VehicleEnginePayload,
  VehicleManeuverCallPayload,
  VehicleManeuverPayload,
  VehicleNitroPayload,
  VehicleRefillPayload,
  ScenePoint,
} from '@vtt/shared';
import {
  CPRED_ACTION_MANEUVER,
  CPRED_OBSTACLE_MANEUVER_ID,
  CPRED_ACTION_MOVE,
  CPRED_ACTION_NITRO,
  CPRED_ACTION_VEHICLE_START,
  CPRED_ACTION_VEHICLE_STOP,
  CPRED_DRIVING_TEST_DV,
  ROLE_GM,
  chaseBodyHalfExtents,
  chaseDriftedCentre,
  chaseFirstContact,
  chaseOffscreen,
  clampChaseVehicle,
  cpredDrivingTestNeeded,
  cpredEffectiveStat,
  cpredManeuverTitle,
  cpredMarkDrivingTested,
  cpredMarkRammed,
  cpredManeuversFor,
  cpredSkillLevel,
  cpredVehicleChase,
  cpredVehicleSkillId,
  chaseObstacleUnbreakable,
  cpredVehicleWrecked,
  parseCharacterData,
  readCpredTurn,
  readCpredVehicle,
  nextTurn,
  sortCombatants,
} from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { Scene, Token } from '../generated/prisma/client.js';
import {
  carryPassengers,
  chaseBodyOf,
  chaseGeometry,
  driverCapable,
  emitChase,
  moveSceneVehicle,
  placedOnScene,
  placedView,
  requireChaseCampaignId,
  sceneMotion,
  seatedOnScene,
  requirePlaced,
  requirePoint,
  type PlacedVehicle,
} from './chase.js';
import {
  crossSpikes,
  driftObstaclesRound,
  obstaclePendingFor,
  passObstacleAhead,
} from './chase-obstacles.js';
import {
  firstChaseContact,
  obstacleBoxId,
  postServerRoll,
  pushVehicleBehind,
  resolveRam,
} from './chase-ram.js';
import {
  applyTurnPointer,
  emitCombatOfScene,
  emitReloadedFor,
  findCombatantForToken,
  loadCombat,
  loadCombatById,
  renumberOrder,
  spendTurnForCombatant,
  toCombatView,
  upcomingTurn,
  type CombatRow,
} from './combat.js';
import { requireTurnSpend } from './combat-actions.js';
import { logSpentAction } from './combat-log.js';
import { rollServerSkillTest } from './character-rolls.js';
import { clearGrapplesOf } from './grapple-state.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { emitSceneTokensToPlayers, emitTokensById } from './tokens.js';

/**
 * Jazda w pościgu (etap 65c): kierowca przesuwa swoje auto, silnik, Nitro,
 * Test zwykłej jazdy, dryf na początku rundy i odpadanie z pościgu.
 *
 * Budżet auta to budżet tury kierowcy (`chase-budget.ts`): Akcja Ruchu kupuje
 * `Ruch / 4` kratek, Nitro za Akcję drugą taką porcję, a Bieg odpada. Poza
 * walką kierowca przesuwa auto bez budżetu, a dryfu nie ma — nie ma rund.
 */

type PlacedWithScene = PlacedVehicle & { scene: Scene };

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
 * „Zwykła jazda” (s. 192): kierowca z REF + Prowadzenie ≤ 9 w każdej swojej
 * Turze rzuca Test PT 10 — serwer rzuca go sam przy pierwszym ruchu auta
 * w turze, karta rzutu leci do stołu z kośćmi 3D. Porażka to utrata kontroli
 * do następnej rundy (MG prowadzi auto).
 *
 * Test idzie **w ramach Akcji Ruchu** (decyzja MG z 03.11): Akcja zostaje
 * wolna, więc słaby kierowca dalej strzela jedną ręką albo odpala Nitro.
 * Turę z rzuconym Testem pamięta `drivingTested` w budżecie tury.
 */
async function requireDrivingTest(
  deps: RealtimeDeps,
  campaignId: string,
  placed: PlacedWithScene,
  driver: Token,
  combatant: { id: string; turnState: string | null },
  user: SessionUser,
): Promise<void> {
  if (!driver.characterId) return;
  const character = await deps.ctx.prisma.character.findUnique({
    where: { id: driver.characterId },
  });
  if (!character) return;
  const data = parseCharacterData(character.data, deps.ctx.cpred);
  const skillId = cpredVehicleSkillId(readCpredVehicle(placed.vehicle.system).kind);
  if (!cpredDrivingTestNeeded(cpredEffectiveStat(data, 'ref'), cpredSkillLevel(data, skillId))) {
    return;
  }
  const turn = readCpredTurn(combatant.turnState ?? undefined);
  // Manewr (65d2) to Test prowadzenia trudniejszy od zwykłej jazdy — zastępuje go.
  if (turn.drivingTested === true || turn.action?.id === CPRED_ACTION_MANEUVER) return;
  await deps.ctx.prisma.combatant.update({
    where: { id: combatant.id },
    data: { turnState: JSON.stringify(cpredMarkDrivingTested(turn)) },
  });
  const roll = await rollServerSkillTest(deps, driver, skillId, CPRED_DRIVING_TEST_DV);
  if (roll) {
    roll.title = `Zwykła jazda: ${roll.title ?? ''}`.trim();
    await postServerRoll(deps, campaignId, user, placed.sceneId, roll);
  }
  if (roll?.outcome?.success === true) return;
  await deps.ctx.prisma.sceneVehicle.update({
    where: { id: placed.id },
    data: { lostControl: true },
  });
  await emitChase(deps, campaignId, placed.sceneId);
  throw new RealtimeError('VEHICLE_OUT_OF_CONTROL');
}

/**
 * `chase:move` — MG przesuwa każde auto bez budżetu (65b), gracz swoje auto
 * z fotela kierowcy: poza walką bez budżetu, w walce w swojej turze za metry
 * Akcji Ruchu kierowcy (po Teście zwykłej jazdy, gdy jest winien).
 */
export const chaseMoveEvent = defineEvent<ChaseMovePayload, SceneVehicleView>({
  name: 'chase:move',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireChaseCampaignId(socket.data);
    const placed = await requirePlaced(deps.ctx.prisma, campaignId, payload?.sceneVehicleId);
    const point = requirePoint(payload);
    const ram = payload?.ram === true;
    if (user.role === ROLE_GM) {
      // Poza walką MG ustawia szyk — auta przechodzą przez siebie (65d2).
      if (!(await loadCombat(deps.ctx.prisma, placed.sceneId))) {
        return moveSceneVehicle(deps, campaignId, placed, point);
      }
      if (ram) await requireRamLeft(deps.ctx.prisma, placed);
      const { settings, frame } = chaseGeometry(placed.scene);
      const target = clampChaseVehicle(point, chaseBodyOf(placed.vehicle), settings, frame);
      return driveWithContacts(deps, campaignId, user, placed, target, ram);
    }

    const driver = await requireOwnDriver(deps.ctx.prisma, placed, user);
    requireControllable(placed);
    // Przeszkoda przed zderzakiem (65e) czeka na odpowiedź — najpierw Manewr albo taranowanie.
    if (await obstaclePendingFor(deps.ctx.prisma, placed.id)) {
      throw new RealtimeError('OBSTACLE_PENDING');
    }
    // Jeden taran na turę (06.11.2026) — odmowa, zanim cokolwiek pójdzie z budżetu.
    if (ram) await requireRamLeft(deps.ctx.prisma, placed);
    const { settings, frame } = chaseGeometry(placed.scene);
    const target = clampChaseVehicle(point, chaseBodyOf(placed.vehicle), settings, frame);
    const pixels = Math.hypot(target.x - placed.x, target.y - placed.y);
    if (pixels < 0.5) return placedView(deps.ctx.prisma, placed.sceneId, placed.id);
    const found = await findCombatantForToken(deps.ctx.prisma, placed.sceneId, driver.id);
    if (!found) return moveSceneVehicle(deps, campaignId, placed, target);

    // Bez taranowania auto staje przed przeszkodą i płaci tylko za drogę do
    // niej; z taranowaniem płaci za całą drogę — jeśli zderzenie je zatrzyma,
    // reszta Akcji Ruchu przepada razem z jazdą.
    const contact = ram ? null : await firstChaseContact(deps.ctx.prisma, placed, placed, target);
    const paidTo = contact?.centre ?? target;
    const metres =
      (Math.hypot(paidTo.x - placed.x, paidTo.y - placed.y) / placed.scene.gridSizePx) *
      placed.scene.metersPerSquare;
    // Test zwykłej jazdy idzie w ramach Akcji Ruchu — rzuca się tylko, gdy ten
    // ruch zmieści się w budżecie; odmowę z powodem daje wydatek niżej.
    const dry = await spendTurnForCombatant(
      deps,
      found.combat,
      found.combatant,
      { kind: 'move', metres },
      user,
      { dryRun: true },
    );
    if (dry.kind !== 'refused') {
      await requireDrivingTest(deps, campaignId, placed, driver, found.combatant, user);
    }
    await requireTurnSpend(
      deps,
      campaignId,
      placed.scene,
      driver.id,
      { kind: 'move', metres },
      user,
      CPRED_ACTION_MOVE,
      { silent: true },
    );
    return driveWithContacts(deps, campaignId, user, placed, target, ram);
  },
});

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
async function requireRamLeft(prisma: PrismaClient, placed: PlacedWithScene): Promise<void> {
  const row = await driverTurnRow(prisma, placed);
  if (row && readCpredTurn(row.turnState ?? undefined).rammed === true) {
    throw new RealtimeError('RAM_USED');
  }
}

/** Tura kierowcy z taranem — pasek „Zderzenie” nie zaproponuje już drugiego. */
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

/**
 * Jazda w walce z zderzeniami (65d2): auto jedzie do `target`, a gdy po drodze
 * trafi na inne auto albo pieszego — bez `ram` staje przed nim, z `ram` taranuje
 * (`resolveRam`) i jedzie dalej, jeśli przeszkoda ustąpiła, do następnej
 * przeszkody albo celu.
 */
async function driveWithContacts(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  placed: PlacedWithScene,
  target: ScenePoint,
  ram: boolean,
): Promise<SceneVehicleView> {
  const prisma = deps.ctx.prisma;
  const from = { x: placed.x, y: placed.y };
  // Kolczatki na przejechanej drodze (65e) rzucają po każdym odcinku jazdy.
  const done = async (view: SceneVehicleView): Promise<SceneVehicleView> => {
    await crossSpikes(deps, campaignId, user, placed, from);
    return placedView(prisma, placed.sceneId, view.id);
  };
  const contact = await firstChaseContact(prisma, placed, from, target);
  if (!contact) return done(await moveSceneVehicle(deps, campaignId, placed, target));
  const stopped = await moveSceneVehicle(deps, campaignId, placed, contact.centre);
  if (!ram) return done(stopped);

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
    return done(await placedView(prisma, placed.sceneId, placed.id));
  }
  const after = await requirePlaced(prisma, campaignId, placed.id);
  // Taranujący, którego zderzenie samo rozbiło, dalej nie jedzie (s. 191).
  if (cpredVehicleWrecked(readCpredVehicle(after.vehicle.system))) {
    return done(await placedView(prisma, placed.sceneId, placed.id));
  }
  const skip = new Set([
    contact.obstacle.kind === 'token'
      ? `token:${contact.obstacle.id}`
      : contact.obstacle.kind === 'obstacle'
        ? obstacleBoxId(contact.obstacle.id)
        : contact.obstacle.id,
  ]);
  const next = await firstChaseContact(prisma, after, after, target, skip);
  const view = await moveSceneVehicle(deps, campaignId, after, next?.centre ?? target);
  // Auto, przez które taranujący przejechał (wrak), nie zostaje pod nim: ląduje
  // za jego tylnym zderzakiem, jak przeszkoda z 65e (decyzja MG z 03.11).
  if (contact.obstacle.kind === 'vehicle') {
    await pushVehicleBehind(deps, campaignId, placed.scene, contact.obstacle.id, placed.id);
  }
  return done(view);
}

/**
 * Przesuwa kierowcę na początek kolejki (s. 192: „Kierowca natychmiast
 * przesuwa się na początek Kolejki Inicjatywy”) — inicjatywa o jeden wyżej od
 * najwyższej, wzorem LOD-a (`pushNetFoeIntoQueue`). Kierowca działa teraz, więc
 * kolejka wraca potem do tego, kto był następny (`resumeCombatantId`), a nie
 * liczy od nowego miejsca — inaczej ktoś zagrałby w tej rundzie drugi raz.
 */
async function leadQueue(
  prisma: PrismaClient,
  combat: CombatRow,
  combatantId: string,
): Promise<void> {
  const fresh = await loadCombatById(prisma, combat.id);
  const others = fresh.combatants.filter((row) => row.id !== combatantId);
  const top = others.reduce((best, row) => Math.max(best, row.initiative ?? 0), 0);
  const self = fresh.combatants.find((row) => row.id === combatantId);
  if (!self || (self.initiative !== null && self.initiative > top)) return;
  const next = upcomingTurn(fresh);
  await prisma.combatant.update({ where: { id: combatantId }, data: { initiative: top + 1 } });
  await renumberOrder(prisma, await loadCombatById(prisma, combat.id));
  if (fresh.activeCombatantId === combatantId && next.activeCombatantId !== combatantId) {
    await prisma.combat.update({
      where: { id: combat.id },
      data: {
        resumeCombatantId: next.activeCombatantId,
        resumeRound: next.activeCombatantId === null ? null : next.round,
      },
    });
  }
}

/**
 * `vehicle:engine` — uruchomienie albo zatrzymanie auta (s. 191: oba są
 * Akcją). Kierowca w walce płaci Akcją, a uruchomienie przesuwa go na początek
 * kolejki. MG przełącza silnik bez kosztu.
 */
export const vehicleEngineEvent = defineEvent<VehicleEnginePayload, SceneVehicleView>({
  name: 'vehicle:engine',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireChaseCampaignId(socket.data);
    const placed = await requirePlaced(deps.ctx.prisma, campaignId, payload?.sceneVehicleId);
    if (typeof payload?.on !== 'boolean') throw new RealtimeError('BAD_REQUEST');
    // Wraku nie da się uruchomić, „dopóki nie zostanie naprawiony” (s. 191).
    if (payload.on && cpredVehicleWrecked(readCpredVehicle(placed.vehicle.system))) {
      throw new RealtimeError('VEHICLE_WRECKED');
    }
    if (placed.started === payload.on) {
      return placedView(deps.ctx.prisma, placed.sceneId, placed.id);
    }
    if (user.role !== ROLE_GM) {
      const driver = await requireOwnDriver(deps.ctx.prisma, placed, user);
      const found = await findCombatantForToken(deps.ctx.prisma, placed.sceneId, driver.id);
      if (found) {
        const actionId = payload.on ? CPRED_ACTION_VEHICLE_START : CPRED_ACTION_VEHICLE_STOP;
        await requireTurnSpend(
          deps,
          campaignId,
          placed.scene,
          driver.id,
          { kind: 'action', actionId },
          user,
          actionId,
        );
        if (payload.on) await leadQueue(deps.ctx.prisma, found.combat, found.combatant.id);
      }
    }
    await deps.ctx.prisma.sceneVehicle.update({
      where: { id: placed.id },
      data: { started: payload.on },
    });
    await emitChase(deps, campaignId, placed.sceneId);
    return placedView(deps.ctx.prisma, placed.sceneId, placed.id);
  },
});

/**
 * `vehicle:nitro` — kierowca w walce za Akcję dostaje drugi Ruch pojazdu
 * (s. 163). Zbiornik zużywa się na ten pościg; MG odpala Nitro auta NPC-a
 * tak samo, z budżetu jego kierowcy.
 */
export const vehicleNitroEvent = defineEvent<VehicleNitroPayload, SceneVehicleView>({
  name: 'vehicle:nitro',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireChaseCampaignId(socket.data);
    const placed = await requirePlaced(deps.ctx.prisma, campaignId, payload?.sceneVehicleId);
    const driver =
      user.role === ROLE_GM
        ? await driverOf(deps.ctx.prisma, placed.id)
        : await requireOwnDriver(deps.ctx.prisma, placed, user);
    if (!driver) throw new RealtimeError('NOT_DRIVER');
    requireControllable(placed);
    const chase = cpredVehicleChase(readCpredVehicle(placed.vehicle.system), {
      tempo: placed.scene.chaseTempo,
      started: placed.started,
      nitroUsed: placed.nitroUsed,
    });
    if (chase.nitroLeft <= 0) throw new RealtimeError('NO_NITRO');
    const found = await findCombatantForToken(deps.ctx.prisma, placed.sceneId, driver.id);
    if (!found) throw new RealtimeError('NITRO_COMBAT_ONLY');
    await requireTurnSpend(
      deps,
      campaignId,
      placed.scene,
      driver.id,
      { kind: 'action', actionId: CPRED_ACTION_NITRO },
      user,
      CPRED_ACTION_NITRO,
    );
    await deps.ctx.prisma.sceneVehicle.update({
      where: { id: placed.id },
      data: { nitroUsed: { increment: 1 } },
    });
    await emitChase(deps, campaignId, placed.sceneId);
    return placedView(deps.ctx.prisma, placed.sceneId, placed.id);
  },
});

/**
 * MG: `vehicle:refill` — pełne zbiorniki Nitro i pełna wyrzutnia kolczatki.
 * Podręcznik daje zbiornik „raz dziennie”, a VTT nie liczy doby auta, więc
 * uzupełnienie to gest MG (decyzja z 03.11), także w trakcie walki.
 */
export const vehicleRefillEvent = defineEvent<VehicleRefillPayload, SceneVehicleView>({
  name: 'vehicle:refill',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireChaseCampaignId(socket.data);
    const placed = await requirePlaced(deps.ctx.prisma, campaignId, payload?.sceneVehicleId);
    if (placed.nitroUsed !== 0 || placed.spikesUsed !== 0) {
      await deps.ctx.prisma.sceneVehicle.update({
        where: { id: placed.id },
        data: { nitroUsed: 0, spikesUsed: 0 },
      });
      await emitChase(deps, campaignId, placed.sceneId);
    }
    return placedView(deps.ctx.prisma, placed.sceneId, placed.id);
  },
});

/** MG: auto, które odpadło z pościgu, wraca przy krawędzi, za którą wypadło. */
export const chaseRestoreEvent = defineEvent<ChaseRestorePayload, SceneVehicleView>({
  name: 'chase:restore',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireChaseCampaignId(socket.data);
    const placed = await requirePlaced(deps.ctx.prisma, campaignId, payload?.sceneVehicleId);
    if (placed.status !== 'behind' && placed.status !== 'escaped') {
      return placedView(deps.ctx.prisma, placed.sceneId, placed.id);
    }
    const { scene, ...row } = placed;
    const { settings, frame } = chaseGeometry(scene);
    const centre = clampChaseVehicle(row, chaseBodyOf(row.vehicle), settings, frame);
    const updated = await deps.ctx.prisma.sceneVehicle.update({
      where: { id: row.id },
      data: { ...centre, status: 'racing' },
    });
    const moved = await carryPassengers(deps.ctx.prisma, scene, {
      ...updated,
      vehicle: row.vehicle,
    });
    await emitChase(deps, campaignId, scene.id);
    await emitTokensById(deps, campaignId, moved, { moved: true });
    // Załoga wraca graczom z autem (66c) — także wtedy, gdy auto w rezerwie
    // stało już w kadrze i nikt się nie ruszył.
    await emitSceneTokensToPlayers(deps, campaignId, scene);
    return placedView(deps.ctx.prisma, scene.id, row.id);
  },
});

/**
 * MG: auto ucieka z pościgu (zaległość z 04.11 — eskorta zablokowana Wozem na
 * stojącej drodze nie miała jak odjechać). To samo, co wyjazd za przednią
 * krawędź w dryfie: `escaped`, załoga znika graczom i wychodzi z kolejki,
 * czat mówi „Ucieka”. Auto zostaje, gdzie stało — „Przywróć do pościgu”
 * stawia je z powrotem w kadrze.
 */
export const chaseEscapeEvent = defineEvent<ChaseEscapePayload, SceneVehicleView>({
  name: 'chase:escape',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireChaseCampaignId(socket.data);
    const prisma = deps.ctx.prisma;
    const placed = await requirePlaced(prisma, campaignId, payload?.sceneVehicleId);
    if (placed.status !== 'racing') return placedView(prisma, placed.sceneId, placed.id);
    const { scene } = placed;
    await prisma.sceneVehicle.update({
      where: { id: placed.id },
      data: { status: 'escaped', blockingId: null, lostControl: false },
    });
    // Stojące auto, które czekało przed jego zderzakiem, już na nie nie czeka.
    await prisma.sceneVehicle.updateMany({
      where: { sceneId: scene.id, blockingId: placed.id },
      data: { blockingId: null },
    });
    const crew = await prisma.token.findMany({
      where: { sceneVehicleId: placed.id },
      select: { id: true },
    });
    const leaving = new Set(crew.map((token) => token.id));
    const combat = await loadCombat(prisma, scene.id);
    if (combat && leaving.size > 0) {
      // Kto ma turę w uciekającym aucie, oddaje ją dalej — jak `combat:remove`.
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
      for (const combatant of combat.combatants) {
        if (combatant.tokenId === null || !leaving.has(combatant.tokenId)) continue;
        await clearGrapplesOf(deps, campaignId, combat, combatant);
        await prisma.combatant.deleteMany({ where: { id: combatant.id } });
      }
      await emitReloadedFor(deps, campaignId, scene, combat.id, null);
    }
    await emitChase(deps, campaignId, scene.id);
    // Załoga auta, które odpadło, znika graczom razem z autem (66c).
    await emitSceneTokensToPlayers(deps, campaignId, scene);
    const line: CombatActionLogEntry = {
      combatantId: '',
      actorName: placed.vehicle.name,
      actionId: 'chase-escaped',
      actionName: 'Ucieka',
      note: 'odpada z pościgu',
    };
    await logSpentAction(deps, campaignId, user, line);
    return placedView(prisma, scene.id, placed.id);
  },
});

/** MG: kierowca odzyskuje kontrolę przed następną rundą. */
export const vehicleControlEvent = defineEvent<VehicleControlPayload, SceneVehicleView>({
  name: 'vehicle:control',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireChaseCampaignId(socket.data);
    const placed = await requirePlaced(deps.ctx.prisma, campaignId, payload?.sceneVehicleId);
    await deps.ctx.prisma.sceneVehicle.update({
      where: { id: placed.id },
      data: { lostControl: false },
    });
    await emitChase(deps, campaignId, placed.sceneId);
    return placedView(deps.ctx.prisma, placed.sceneId, placed.id);
  },
});

/** Manewr z listy pasującej do tego pojazdu albo odmowa. */
function requireManeuver(placed: PlacedWithScene, maneuverId: unknown) {
  const kind = readCpredVehicle(placed.vehicle.system).kind;
  const maneuver = cpredManeuversFor(kind).find((entry) => entry.id === maneuverId);
  if (!maneuver) throw new RealtimeError('UNKNOWN_MANEUVER');
  return maneuver;
}

/**
 * `vehicle:maneuver` — Manewr pojazdem (65d2, s. 192): Test REF + Umiejętność
 * prowadzenia + 1k10 przeciw PT Manewru, rzucony przez serwer jawnie, z kośćmi
 * 3D. Porażka to natychmiastowa utrata kontroli (MG prowadzi auto do następnej
 * rundy). Kierowca deklarujący Manewr sam płaci w walce Akcją — Akcją Ruchu
 * jest sama jazda, którą Manewr się dzieje. Na wezwanie MG (`maneuverCall`)
 * i za kierowcę-NPC-a, którym rzuca MG, Manewr nic nie kosztuje: to MG
 * zdecydował, że sytuacja go wymaga.
 */
export const vehicleManeuverEvent = defineEvent<VehicleManeuverPayload, SceneVehicleView>({
  name: 'vehicle:maneuver',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireChaseCampaignId(socket.data);
    const placed = await requirePlaced(deps.ctx.prisma, campaignId, payload?.sceneVehicleId);
    if (placed.scene.kind !== 'chase') throw new RealtimeError('NOT_A_CHASE');
    const maneuver = requireManeuver(placed, payload?.maneuverId);
    const driver =
      user.role === ROLE_GM
        ? await driverOf(deps.ctx.prisma, placed.id)
        : await requireOwnDriver(deps.ctx.prisma, placed, user);
    if (!driver) throw new RealtimeError('NOT_DRIVER');
    if (!driverCapable(driver)) throw new RealtimeError('DRIVER_INCAPABLE');
    requireControllable(placed);
    const called = placed.maneuverCall === maneuver.id;
    if (user.role !== ROLE_GM && !called) {
      const found = await findCombatantForToken(deps.ctx.prisma, placed.sceneId, driver.id);
      if (found) {
        await requireTurnSpend(
          deps,
          campaignId,
          placed.scene,
          driver.id,
          { kind: 'action', actionId: CPRED_ACTION_MANEUVER },
          user,
          CPRED_ACTION_MANEUVER,
          { silent: true },
        );
      }
    }
    const skillId = cpredVehicleSkillId(readCpredVehicle(placed.vehicle.system).kind);
    const roll = await rollServerSkillTest(deps, driver, skillId, maneuver.dv);
    if (roll) {
      roll.title = `${cpredManeuverTitle(maneuver)} — ${roll.title ?? ''}`.trim();
      await postServerRoll(deps, campaignId, user, placed.sceneId, roll);
    }
    const failed = roll?.outcome?.success !== true;
    await deps.ctx.prisma.sceneVehicle.update({
      where: { id: placed.id },
      data: { maneuverCall: null, ...(failed ? { lostControl: true } : {}) },
    });
    if (failed) {
      const line: CombatActionLogEntry = {
        combatantId: '',
        actorName: placed.vehicle.name,
        actionId: 'chase-lost-control',
        actionName: 'Utrata kontroli',
        note: `${maneuver.name} nieudany — MG prowadzi auto do końca rundy`,
      };
      await logSpentAction(deps, campaignId, user, line);
    } else if (maneuver.id === CPRED_OBSTACLE_MANEUVER_ID) {
      const passed = await passObstacleAhead(deps, placed);
      if (passed) {
        await logSpentAction(deps, campaignId, user, {
          combatantId: '',
          actorName: placed.vehicle.name,
          actionId: 'chase-swerve-past',
          actionName: maneuver.name,
          note: `omija: ${passed}`,
        });
      }
    }
    await emitChase(deps, campaignId, placed.sceneId);
    return placedView(deps.ctx.prisma, placed.sceneId, placed.id);
  },
});

/**
 * MG: `vehicle:maneuver-call` — „MG decyduje, kiedy prowadzenie pojazdu wymaga
 * wykonania Manewru” (s. 192). Wezwanie czeka na aucie, dopóki kierowca go nie
 * wykona albo MG nie odwoła (`maneuverId: null`); kierowca-gracz widzi pasek.
 */
export const vehicleManeuverCallEvent = defineEvent<VehicleManeuverCallPayload, SceneVehicleView>({
  name: 'vehicle:maneuver-call',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireChaseCampaignId(socket.data);
    const placed = await requirePlaced(deps.ctx.prisma, campaignId, payload?.sceneVehicleId);
    const maneuverCall =
      payload?.maneuverId === null ? null : requireManeuver(placed, payload?.maneuverId).id;
    if (maneuverCall && !(await driverOf(deps.ctx.prisma, placed.id))) {
      throw new RealtimeError('NOT_DRIVER');
    }
    await deps.ctx.prisma.sceneVehicle.update({
      where: { id: placed.id },
      data: { maneuverCall },
    });
    await emitChase(deps, campaignId, placed.sceneId);
    return placedView(deps.ctx.prisma, placed.sceneId, placed.id);
  },
});

/**
 * Początek rundy na scenie pościgu (decyzja MG 12): każde auto w kadrze dryfuje
 * o `(prędkość − rama) / 4` kratek wzdłuż drogi, a utrata kontroli z poprzedniej
 * rundy mija. Prędkość to Ruch auta z kierowcą, a bez niego malejący pęd
 * (`SceneVehicle.momentum`); rama to tempo sceny, chyba że auto drużyny stoi
 * (`chaseFrameTempo`, decyzja MG z 05.11.2026). Auto, którego bryła cała wyjechała za tylną krawędź, zostaje
 * w tyle (`behind`), za przednią — ucieka (`escaped`): znika graczom, jego
 * figury wychodzą z kolejki, a stół czyta o tym na czacie.
 *
 * Raz na rundę (`driftRound`) — MG cofający i ponawiający turę nie przesuwa
 * aut drugi raz. Droga, która stoi (`chaseRunning`), nie dryfuje.
 *
 * Zwraca kolejkę po zdjęciu figur, gdy coś zdjęto; wołający poprawia wskaźnik.
 */
export async function driftChaseRound(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  combat: CombatRow,
  round: number,
  user: SessionUser,
): Promise<boolean> {
  if (scene.kind !== 'chase') return false;
  const prisma = deps.ctx.prisma;
  const placed = await placedOnScene(prisma, scene.id);
  if (placed.length === 0) {
    // Same przeszkody (65e) też jadą — auta mogą wrócić z „Przywróć”.
    await driftObstaclesRound(deps, campaignId, scene, round, user, new Map());
    await emitChase(deps, campaignId, scene.id);
    return false;
  }
  const { settings, frame } = chaseGeometry(scene);
  const moved: string[] = [];
  const dropped: { name: string; status: 'behind' | 'escaped'; passengers: string[] }[] = [];
  // Utrata kontroli mija z początkiem rundy — ale zderzenia tej chwili (stojące
  // auto, przeszkoda) jeszcze widzą auto, które jej nie odzyskało (przegląd 03.11).
  const lostBefore = new Set(placed.filter((row) => row.lostControl).map((row) => row.id));
  // Gdzie auta stoją w trakcie dryfu (65d2): auto dryfujące na inne staje przy
  // jego zderzaku bez obrażeń — taranowanie to decyzja kierowcy w jego turze.
  const centres = new Map(placed.map((row) => [row.id, { x: row.x, y: row.y }]));
  // Skąd auto ruszyło w tej rundzie — tor przeszkód (65e) liczy się ruchem względnym.
  const starts = new Map<string, ScenePoint>();
  const gone = new Set<string>();
  const byId = new Map(placed.map((row) => [row.id, row] as const));
  const racing = (id: string | null) =>
    id !== null && byId.get(id)?.status === 'racing' ? byId.get(id)! : null;
  // Stojące auto, które czeka przed czyimś zderzakiem, jedzie z tym autem (jak przeszkoda).
  const riders = placed.filter(
    (row) =>
      row.status === 'racing' &&
      row.driftRound < round &&
      row.blockingId !== row.id &&
      racing(row.blockingId) !== null,
  );
  const riding = new Set(riders.map((row) => row.id));
  const crashes: { rammerId: string; struckId: string }[] = [];
  const blockedNow: { stalled: PlacedVehicle; driven: PlacedVehicle }[] = [];
  // Rama tej rundy (decyzja MG z 05.11.2026): auto bez kierowcy toczy się
  // malejącym pędem, a kadr jedzie z autem drużyny — gdy ono stoi, droga stoi,
  // a jadące auta odpływają do przodu. Prędkość rundy staje się nowym pędem.
  const { motions, nextFrameTempo: frameTempo } = sceneMotion(
    placed,
    await seatedOnScene(prisma, placed),
    scene.chaseTempo,
  );
  const speedOf = (id: string) => motions.get(id)?.nextSpeed ?? 0;
  // Stojące auto → jadące, które dojechało do niego od tyłu (zapis po pętli).
  const forwardBlocks = new Map<string, string>();
  for (const row of placed) {
    if (row.status !== 'racing' || row.driftRound >= round || riding.has(row.id)) continue;
    const speed = speedOf(row.id);
    const chase = cpredVehicleChase(readCpredVehicle(row.vehicle.system), {
      tempo: frameTempo,
      started: row.started,
      nitroUsed: row.nitroUsed,
      speed,
    });
    const squares = scene.chaseRunning ? chase.driftSq : 0;
    const body = chaseBodyOf(row.vehicle);
    const drifted =
      squares === 0
        ? { x: row.x, y: row.y }
        : chaseDriftedCentre(row, body, settings, frame, squares);
    const contact =
      squares === 0
        ? null
        : chaseFirstContact(
            { x: row.x, y: row.y },
            drifted,
            chaseBodyHalfExtents(body, settings.direction, scene.gridSizePx),
            placed
              .filter((other) => other.id !== row.id && other.status === 'racing')
              .map((other) => ({
                id: other.id,
                centre: centres.get(other.id)!,
                ...chaseBodyHalfExtents(
                  chaseBodyOf(other.vehicle),
                  settings.direction,
                  scene.gridSizePx,
                ),
              })),
          );
    const centre = contact?.centre ?? drifted;
    centres.set(row.id, centre);
    starts.set(row.id, { x: row.x, y: row.y });
    // Stojące auto (wrak, zgaszony silnik) wjechało dryfem przed jadące auto:
    // jego kierowca wybiera Gwałtowny skręt albo taranowanie, a auto bez
    // kontroli wjeżdża w nie od razu — jak w przeszkodę MG (decyzja MG z 03.11).
    let blockingId: string | null = null;
    const struckBy = contact ? racing(contact.id) : null;
    if (contact && struckBy && speed === 0 && squares < 0) {
      const driver = await driverOf(prisma, struckBy.id);
      const stalledToo = speedOf(struckBy.id) === 0;
      if (!stalledToo) {
        const controlled = driver !== null && driverCapable(driver) && !lostBefore.has(struckBy.id);
        if (controlled) {
          blockingId = struckBy.id;
          blockedNow.push({ stalled: row, driven: struckBy });
        } else crashes.push({ rammerId: struckBy.id, struckId: row.id });
      }
    }
    // Odwrotnie (05.11.2026): auto drużyny stoi, więc rama stoi, a jadące auto
    // dojeżdża dryfem do stojącego od tyłu — to samo pytanie do kierowcy.
    if (contact && struckBy && speed > 0 && squares > 0 && speedOf(struckBy.id) === 0) {
      if (motions.get(row.id)?.control === 'driver') {
        forwardBlocks.set(struckBy.id, row.id);
        blockedNow.push({ stalled: struckBy, driven: row });
      } else crashes.push({ rammerId: row.id, struckId: struckBy.id });
    }
    const off =
      squares === 0 || contact ? null : chaseOffscreen(centre, body, settings.direction, frame);
    const updated = await prisma.sceneVehicle.update({
      where: { id: row.id },
      data: {
        x: centre.x,
        y: centre.y,
        driftRound: round,
        lostControl: false,
        blockingId,
        momentum: speed,
        ...(off ? { status: off } : {}),
      },
    });
    moved.push(...(await carryPassengers(prisma, scene, { ...updated, vehicle: row.vehicle })));
    if (off) {
      gone.add(row.id);
      const passengers = await prisma.token.findMany({
        where: { sceneVehicleId: row.id },
        select: { id: true },
      });
      dropped.push({
        name: row.vehicle.name,
        status: off,
        passengers: passengers.map((token) => token.id),
      });
    }
  }
  for (const [stalledId, drivenId] of forwardBlocks) {
    if (gone.has(drivenId)) continue;
    await prisma.sceneVehicle.update({ where: { id: stalledId }, data: { blockingId: drivenId } });
  }
  for (const row of riders) {
    const target = row.blockingId!;
    const from = starts.get(target) ?? centres.get(target)!;
    const to = centres.get(target)!;
    const centre = { x: row.x + to.x - from.x, y: row.y + to.y - from.y };
    centres.set(row.id, centre);
    starts.set(row.id, { x: row.x, y: row.y });
    const updated = await prisma.sceneVehicle.update({
      where: { id: row.id },
      data: {
        ...centre,
        driftRound: round,
        lostControl: false,
        momentum: speedOf(row.id),
        ...(gone.has(target) ? { blockingId: null } : {}),
      },
    });
    moved.push(...(await carryPassengers(prisma, scene, { ...updated, vehicle: row.vehicle })));
  }
  // Przeszkody (65e) po autach: auto w kadrze, które w tej rundzie dryfowało
  // (albo stało), z miejscem przed i po — stojące ze startu rundy też się liczy.
  const moves = new Map<string, { from: ScenePoint; to: ScenePoint }>();
  for (const row of placed) {
    if (row.status !== 'racing' || gone.has(row.id)) continue;
    const to = centres.get(row.id)!;
    moves.set(row.id, { from: starts.get(row.id) ?? to, to });
  }
  await emitTokensById(deps, campaignId, moved, { moved: true });
  for (const { stalled, driven } of blockedNow) {
    const line: CombatActionLogEntry = {
      combatantId: '',
      actorName: driven.vehicle.name,
      actionId: 'chase-obstacle',
      actionName: 'Przeszkoda na drodze',
      note: `${stalled.vehicle.name} — Gwałtowny skręt albo taranowanie`,
    };
    await logSpentAction(deps, campaignId, user, line);
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
  await driftObstaclesRound(deps, campaignId, scene, round, user, moves, lostBefore, frameTempo);
  await emitChase(deps, campaignId, scene.id);
  if (dropped.length === 0) return false;
  // Załoga auta, które odpadło, znika graczom razem z autem (66c).
  await emitSceneTokensToPlayers(deps, campaignId, scene);

  const leaving = new Set(dropped.flatMap((entry) => entry.passengers));
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
  return true;
}

/**
 * Pęd aut na start rundy 1 (decyzja MG z 05.11.2026): auto z kierowcą jedzie
 * swoim Ruchem, bez kierowcy stoi. Od tej chwili kierowca, który zniknie albo
 * padnie, zostawia auto toczące się tym pędem (`driftChaseRound` go zmniejsza).
 */
export async function startChaseMomentum(prisma: PrismaClient, scene: Scene): Promise<void> {
  if (scene.kind !== 'chase') return;
  const placed = await placedOnScene(prisma, scene.id);
  const { motions } = sceneMotion(placed, await seatedOnScene(prisma, placed), scene.chaseTempo);
  for (const row of placed) {
    const momentum = motions.get(row.id)?.speed ?? 0;
    if (row.momentum === momentum) continue;
    await prisma.sceneVehicle.update({ where: { id: row.id }, data: { momentum } });
  }
}

/**
 * Wskaźnik tury po dryfie: jeśli figura, która miała zacząć rundę, właśnie
 * odpadła z pościgu, rundę zaczyna pierwszy, kto został.
 */
export function pointerAfterDrift(combat: CombatRow, pointer: TurnPointer): TurnPointer {
  if (combat.combatants.some((row) => row.id === pointer.activeCombatantId)) return pointer;
  const first = sortCombatants(toCombatView(combat).combatants).find((row) => !row.out);
  return { round: pointer.round, activeCombatantId: first?.id ?? null };
}
