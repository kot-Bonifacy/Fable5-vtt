import type {
  ChaseMovePayload,
  ChaseRestorePayload,
  CombatActionLogEntry,
  SceneVehicleView,
  SessionUser,
  TurnPointer,
  VehicleControlPayload,
  VehicleEnginePayload,
  VehicleNitroPayload,
} from '@vtt/shared';
import {
  CPRED_ACTION_DRIVE_TEST,
  CPRED_ACTION_MOVE,
  CPRED_ACTION_NITRO,
  CPRED_ACTION_VEHICLE_START,
  CPRED_ACTION_VEHICLE_STOP,
  CPRED_DRIVING_TEST_DV,
  ROLE_GM,
  chaseDriftedCentre,
  chaseOffscreen,
  clampChaseVehicle,
  cpredDrivingTestNeeded,
  cpredEffectiveStat,
  cpredSkillLevel,
  cpredVehicleChase,
  cpredVehicleSkillId,
  cpredVehicleWrecked,
  parseCharacterData,
  readCpredTurn,
  readCpredVehicle,
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
  requirePlaced,
  requirePoint,
  type PlacedVehicle,
} from './chase.js';
import {
  findCombatantForToken,
  loadCombatById,
  renumberOrder,
  toCombatView,
  upcomingTurn,
  type CombatRow,
} from './combat.js';
import { requireTurnSpend } from './combat-actions.js';
import { logSpentAction } from './combat-log.js';
import { rollServerSkillTest } from './character-rolls.js';
import { INCLUDE_CHAT_NAMES, deliverRollMessage, toChatMessageView } from './chat-io.js';
import { clearGrapplesOf } from './grapple-state.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { emitTokensById } from './tokens.js';

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
async function driverOf(prisma: PrismaClient, sceneVehicleId: string): Promise<Token | null> {
  return prisma.token.findFirst({ where: { sceneVehicleId, vehicleSeat: 0 } });
}

/**
 * Kierowca, którym ten gracz prowadzi auto: jego jawna figura w fotelu 0,
 * zdolna do działania, w aucie, które jedzie w kadrze.
 */
async function requireOwnDriver(
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
function requireControllable(placed: PlacedWithScene): void {
  // Wrak nie jedzie (s. 191, 65d1) — przed silnikiem, bo to on mówi, dlaczego.
  if (cpredVehicleWrecked(readCpredVehicle(placed.vehicle.system))) {
    throw new RealtimeError('VEHICLE_WRECKED');
  }
  if (!placed.started) throw new RealtimeError('VEHICLE_NOT_STARTED');
  if (placed.lostControl) throw new RealtimeError('VEHICLE_OUT_OF_CONTROL');
}

/**
 * „Zwykła jazda” (s. 192): kierowca z REF + Prowadzenie ≤ 9 w każdej swojej
 * Turze rzuca w ramach Akcji Test PT 10 — serwer rzuca go sam przy pierwszym
 * ruchu auta w turze, karta rzutu leci do stołu z kośćmi 3D. Porażka to
 * utrata kontroli do następnej rundy (MG prowadzi auto).
 */
async function requireDrivingTest(
  deps: RealtimeDeps,
  campaignId: string,
  placed: PlacedWithScene,
  driver: Token,
  turnState: string | null,
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
  const turn = readCpredTurn(turnState ?? undefined);
  if (turn.action?.id === CPRED_ACTION_DRIVE_TEST) return;
  if (turn.action !== null) throw new RealtimeError('DRIVING_TEST_NEEDS_ACTION');
  await requireTurnSpend(
    deps,
    campaignId,
    placed.scene,
    driver.id,
    { kind: 'action', actionId: CPRED_ACTION_DRIVE_TEST },
    user,
    CPRED_ACTION_DRIVE_TEST,
    { silent: true },
  );
  const roll = await rollServerSkillTest(deps, driver, skillId, CPRED_DRIVING_TEST_DV);
  if (roll) {
    roll.title = `Zwykła jazda: ${roll.title ?? ''}`.trim();
    const stored = await deps.ctx.prisma.chatMessage.create({
      data: {
        campaignId,
        authorId: user.id,
        kind: 'roll',
        text: roll.title,
        payload: JSON.stringify(roll),
        sceneId: placed.sceneId,
      },
      include: INCLUDE_CHAT_NAMES,
    });
    await deliverRollMessage(deps, campaignId, user.id, toChatMessageView(stored));
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
    if (user.role === ROLE_GM) return moveSceneVehicle(deps, campaignId, placed, point);

    const driver = await requireOwnDriver(deps.ctx.prisma, placed, user);
    requireControllable(placed);
    const { settings, frame } = chaseGeometry(placed.scene);
    const target = clampChaseVehicle(point, chaseBodyOf(placed.vehicle), settings, frame);
    const pixels = Math.hypot(target.x - placed.x, target.y - placed.y);
    if (pixels < 0.5) return placedView(deps.ctx.prisma, placed.sceneId, placed.id);
    const found = await findCombatantForToken(deps.ctx.prisma, placed.sceneId, driver.id);
    if (found) {
      await requireDrivingTest(deps, campaignId, placed, driver, found.combatant.turnState, user);
      const metres = (pixels / placed.scene.gridSizePx) * placed.scene.metersPerSquare;
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
    }
    return moveSceneVehicle(deps, campaignId, placed, target);
  },
});

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
    return placedView(deps.ctx.prisma, scene.id, row.id);
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

/**
 * Początek rundy na scenie pościgu (decyzja MG 12): każde auto w kadrze dryfuje
 * o `(Ruch − tempo) / 4` kratek wzdłuż drogi, a utrata kontroli z poprzedniej
 * rundy mija. Auto, którego bryła cała wyjechała za tylną krawędź, zostaje
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
  if (placed.length === 0) return false;
  const { settings, frame } = chaseGeometry(scene);
  const moved: string[] = [];
  const dropped: { name: string; status: 'behind' | 'escaped'; passengers: string[] }[] = [];
  for (const row of placed) {
    if (row.status !== 'racing' || row.driftRound >= round) continue;
    const chase = cpredVehicleChase(readCpredVehicle(row.vehicle.system), {
      tempo: scene.chaseTempo,
      started: row.started,
      nitroUsed: row.nitroUsed,
    });
    const squares = scene.chaseRunning ? chase.driftSq : 0;
    const body = chaseBodyOf(row.vehicle);
    const centre =
      squares === 0
        ? { x: row.x, y: row.y }
        : chaseDriftedCentre(row, body, settings, frame, squares);
    const off = squares === 0 ? null : chaseOffscreen(centre, body, settings.direction, frame);
    const updated = await prisma.sceneVehicle.update({
      where: { id: row.id },
      data: {
        x: centre.x,
        y: centre.y,
        driftRound: round,
        lostControl: false,
        ...(off ? { status: off } : {}),
      },
    });
    moved.push(...(await carryPassengers(prisma, scene, { ...updated, vehicle: row.vehicle })));
    if (off) {
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
  await emitTokensById(deps, campaignId, moved, { moved: true });
  await emitChase(deps, campaignId, scene.id);
  if (dropped.length === 0) return false;

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
 * Wskaźnik tury po dryfie: jeśli figura, która miała zacząć rundę, właśnie
 * odpadła z pościgu, rundę zaczyna pierwszy, kto został.
 */
export function pointerAfterDrift(combat: CombatRow, pointer: TurnPointer): TurnPointer {
  if (combat.combatants.some((row) => row.id === pointer.activeCombatantId)) return pointer;
  const first = sortCombatants(toCombatView(combat).combatants).find((row) => !row.out);
  return { round: pointer.round, activeCombatantId: first?.id ?? null };
}
