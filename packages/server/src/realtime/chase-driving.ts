import type {
  ChaseAnchorPayload,
  ChaseEscapePayload,
  ChaseMovePayload,
  ChaseRestorePayload,
  ChaseSetSpeedPayload,
  SceneVehicleView,
  VehicleControlPayload,
  VehicleEnginePayload,
  VehicleManeuverCallPayload,
  VehicleManeuverPayload,
  VehicleNitroPayload,
  VehicleRefillPayload,
} from '@vtt/shared';
import {
  CPRED_ACTION_MANEUVER,
  CPRED_OBSTACLE_MANEUVER_ID,
  CPRED_SUDDEN_STOP_ID,
  CPRED_ACTION_NITRO,
  CPRED_ACTION_VEHICLE_START,
  CPRED_ACTION_VEHICLE_STOP,
  CHASE_TEMPO_MAX,
  CHASE_TEMPO_MIN,
  ROLE_GM,
  chaseEntryCentre,
  clampChaseVehicle,
  cpredManeuverTitle,
  cpredManeuversFor,
  cpredVehicleDerived,
  cpredVehicleSkillId,
  cpredVehicleWrecked,
  readCpredVehicle,
} from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { Scene } from '../generated/prisma/client.js';
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
  requirePoint,
  type PlacedVehicle,
} from './chase.js';
import {
  driveWithContacts,
  driverOf,
  escapeFromChase,
  loseControl,
  requireControllable,
  requireOwnDriver,
  requireRamLeft,
} from './chase-drive.js';
import { passObstacleAhead } from './chase-obstacles.js';
import { postServerRoll } from './chase-ram.js';
import {
  findCombatantForToken,
  loadCombat,
  loadCombatById,
  renumberOrder,
  upcomingTurn,
  type CombatRow,
} from './combat.js';
import { requireTurnSpend } from './combat-actions.js';
import { logSpentAction } from './combat-log.js';
import { rollServerSkillTest } from './character-rolls.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { emitSceneView, requireCampaignScene } from './scenes.js';
import { emitSceneTokensToPlayers, emitTokensById } from './tokens.js';

/**
 * Pościg poza samą jazdą (etap 65c, od 72 bez dryfu i budżetu metrów): ręka MG
 * na aucie, silnik, Nitro, Manewry, przywracanie i ucieczka. Jazdę w turze
 * kierowcy, koniec tury i początek rundy prowadzi `chase-drive.ts`.
 */

type PlacedWithScene = PlacedVehicle & { scene: Scene };

/**
 * `chase:move` — przeciągnięcie auta. MG przesuwa każde auto (poza walką szyk,
 * w walce darmowa ręka z zderzeniami); gracz-kierowca — swoje auto **tylko
 * poza walką**. W walce gracz prowadzi kokpitem (`vehicle:drive`, etap 72).
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
      await driveWithContacts(deps, campaignId, user, placed, target, ram);
      return placedView(deps.ctx.prisma, placed.sceneId, placed.id);
    }

    await requireOwnDriver(deps.ctx.prisma, placed, user);
    if (await loadCombat(deps.ctx.prisma, placed.sceneId)) throw new RealtimeError('USE_COCKPIT');
    requireControllable(placed);
    return moveSceneVehicle(deps, campaignId, placed, point);
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
 * `vehicle:nitro` — kierowca w walce za Akcję odpala zbiornik (s. 163). Od
 * etapu 72 Nitro dokłada jednorazowo `Ruch / 4` kratek do ruchu auta w tej
 * turze (prędkości trwałej nie zmienia), więc idzie **przed „Jedź”**. MG
 * odpala Nitro auta NPC-a tak samo, z budżetu jego kierowcy.
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
    const tanks = cpredVehicleDerived(readCpredVehicle(placed.vehicle.system)).nitroTanks;
    if (tanks - placed.nitroUsed <= 0) throw new RealtimeError('NO_NITRO');
    const found = await findCombatantForToken(deps.ctx.prisma, placed.sceneId, driver.id);
    if (!found) throw new RealtimeError('NITRO_COMBAT_ONLY');
    const round = chaseRoundOf(placed.scene);
    if (round !== null && placed.movedRound >= round) throw new RealtimeError('NITRO_AFTER_DRIVE');
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

/** Prędkość z ładunku w punktach Ruchu: liczba skończona, zaokrąglona, nieujemna. */
function readSpeed(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
    throw new RealtimeError('BAD_REQUEST');
  }
  return Math.round(raw);
}

/**
 * MG: auto, które odpadło z pościgu (także rezerwa wzorca i posiłki spoza
 * sceny, które trafiły na nią poza kadrem — STR-12), wraca do kadru. Z okna
 * „Pościg” (72f2) — na wybranym pasie przy wybranej krawędzi (pierwsze wolne
 * miejsce w głąb), w walce z prędkością z pola albo prędkością pościgu. Bez
 * pasa i strony — przy krawędzi, za którą wypadło (menu auta).
 */
export const chaseRestoreEvent = defineEvent<ChaseRestorePayload, SceneVehicleView>({
  name: 'chase:restore',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireChaseCampaignId(socket.data);
    const prisma = deps.ctx.prisma;
    const placed = await requirePlaced(prisma, campaignId, payload?.sceneVehicleId);
    if (placed.status !== 'behind' && placed.status !== 'escaped') {
      return placedView(prisma, placed.sceneId, placed.id);
    }
    await restoreToChase(deps, campaignId, placed, {
      ...(payload?.side !== undefined ? { side: payload.side } : {}),
      ...(payload?.lane !== undefined ? { lane: payload.lane } : {}),
      ...(payload?.speed !== undefined ? { speed: payload.speed } : {}),
    });
    return placedView(prisma, placed.sceneId, placed.id);
  },
});

/**
 * Auto spoza kadru wraca do pościgu — `chase:restore` i posiłki z planu rund
 * (72f3). Pas i strona razem albo wcale; prędkość w punktach Ruchu (tylko
 * w walce, brak — prędkość pościgu).
 */
export async function restoreToChase(
  deps: RealtimeDeps,
  campaignId: string,
  placed: PlacedWithScene,
  entry: { lane?: unknown; side?: unknown; speed?: unknown },
): Promise<void> {
  const prisma = deps.ctx.prisma;
  const { scene, ...row } = placed;
  const { settings, frame } = chaseGeometry(scene);
  const body = chaseBodyOf(row.vehicle);
  const { side, lane } = entry;
  let centre: { x: number; y: number };
  if (side !== undefined || lane !== undefined) {
    if (side !== 'front' && side !== 'rear') throw new RealtimeError('BAD_REQUEST');
    if (typeof lane !== 'number' || !Number.isInteger(lane) || lane < 0 || lane >= settings.lanes) {
      throw new RealtimeError('BAD_REQUEST');
    }
    const parked = (await placedOnScene(prisma, scene.id))
      .filter(
        (other) => other.id !== row.id && other.status !== 'behind' && other.status !== 'escaped',
      )
      .map((other) => ({ x: other.x, y: other.y, ...chaseBodyOf(other.vehicle) }));
    centre = chaseEntryCentre({
      lane,
      lanes: settings.lanes,
      side,
      body,
      parked,
      settings,
      scene: frame,
    });
  } else {
    centre = clampChaseVehicle(row, body, settings, frame);
  }
  // W walce auto wjeżdża z prędkością: z pola okna albo prędkością pościgu
  // (trzyma się kadru) — bez tego rezerwa ze wzorca miałaby 0 i odpadła od razu.
  const pursuit = scene.chasePursuitSpeed;
  const max = Math.max(0, readCpredVehicle(row.vehicle.system).move);
  const speed =
    pursuit === null
      ? undefined
      : Math.min(max, entry.speed !== undefined ? readSpeed(entry.speed) : pursuit);
  const updated = await prisma.sceneVehicle.update({
    where: { id: row.id },
    data: {
      ...centre,
      status: 'racing',
      ...(speed !== undefined ? { speed, raceBonus: 0 } : {}),
    },
  });
  const moved = await carryPassengers(prisma, scene, {
    ...updated,
    vehicle: row.vehicle,
  });
  await emitChase(deps, campaignId, scene.id);
  await emitTokensById(deps, campaignId, moved, { moved: true });
  // Załoga wraca graczom z autem (66c) — także wtedy, gdy auto w rezerwie
  // stało już w kadrze i nikt się nie ruszył.
  await emitSceneTokensToPlayers(deps, campaignId, scene);
}

/**
 * MG: `chase:set-speed` — poprawka prędkości auta bez kosztu (etap 72f2, okno
 * „Pościg”). W walce to prędkość trwała (0…Ruch auta; ruch tej rundy liczy się
 * od niej, prędkość pościgu zostaje do końca rundy), przed walką — własna
 * prędkość startowa auta (decyzja MG 21.11), `null` — ze sceny.
 */
export const chaseSetSpeedEvent = defineEvent<ChaseSetSpeedPayload, SceneVehicleView>({
  name: 'chase:set-speed',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireChaseCampaignId(socket.data);
    const prisma = deps.ctx.prisma;
    const placed = await requirePlaced(prisma, campaignId, payload?.sceneVehicleId);
    if (placed.scene.kind !== 'chase') throw new RealtimeError('NOT_A_CHASE');
    const stats = readCpredVehicle(placed.vehicle.system);
    if (placed.scene.chasePursuitSpeed !== null) {
      if (payload?.speed === null) throw new RealtimeError('BAD_REQUEST');
      if (cpredVehicleWrecked(stats)) throw new RealtimeError('VEHICLE_WRECKED');
      const speed = Math.min(Math.max(0, stats.move), readSpeed(payload?.speed));
      await prisma.sceneVehicle.update({ where: { id: placed.id }, data: { speed } });
    } else {
      const startSpeed =
        payload?.speed === null
          ? null
          : Math.min(CHASE_TEMPO_MAX, Math.max(CHASE_TEMPO_MIN, readSpeed(payload?.speed)));
      await prisma.sceneVehicle.update({ where: { id: placed.id }, data: { startSpeed } });
    }
    await emitChase(deps, campaignId, placed.sceneId);
    // Bieżnia poza walką jedzie prędkością auta kadru (`chaseFrameTempo`).
    await emitSceneView(deps, campaignId, placed.sceneId);
    return placedView(prisma, placed.sceneId, placed.id);
  },
});

/**
 * MG: `chase:anchor` — auto, którego trzyma się kadr (etap 72f2). Serwer czyta
 * wybór na początku rundy (`startChaseRound`), więc w walce działa od
 * następnej; auto poza kadrem nic nie zmienia (reguła domyślna).
 */
export const chaseAnchorEvent = defineEvent<ChaseAnchorPayload, { ok: true }>({
  name: 'chase:anchor',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireChaseCampaignId(socket.data);
    const prisma = deps.ctx.prisma;
    const scene = await requireCampaignScene(prisma, campaignId, payload?.sceneId);
    if (scene.kind !== 'chase') throw new RealtimeError('NOT_A_CHASE');
    let anchorId: string | null = null;
    if (payload?.vehicleId !== null) {
      const car = await requirePlaced(prisma, campaignId, payload?.vehicleId);
      if (car.sceneId !== scene.id) throw new RealtimeError('VEHICLE_NOT_FOUND');
      anchorId = car.id;
    }
    await prisma.scene.update({ where: { id: scene.id }, data: { chaseAnchorId: anchorId } });
    await emitSceneView(deps, campaignId, scene.id);
    return { ok: true };
  },
});

/**
 * MG: auto ucieka z pościgu (zaległość z 04.11 — eskorta zablokowana Wozem na
 * stojącej drodze nie miała jak odjechać). To samo, co wyjazd za przednią
 * krawędź na początku rundy: `escaped`, załoga znika graczom i wychodzi
 * z kolejki, czat mówi „Ucieka”. Auto zostaje, gdzie stało — „Przywróć do
 * pościgu” stawia je z powrotem w kadrze.
 */
export const chaseEscapeEvent = defineEvent<ChaseEscapePayload, SceneVehicleView>({
  name: 'chase:escape',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireChaseCampaignId(socket.data);
    const prisma = deps.ctx.prisma;
    const placed = await requirePlaced(prisma, campaignId, payload?.sceneVehicleId);
    if (placed.status !== 'racing') return placedView(prisma, placed.sceneId, placed.id);
    await escapeFromChase(deps, campaignId, user, placed);
    return placedView(prisma, placed.sceneId, placed.id);
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
 * 3D. Porażka to natychmiastowa utrata kontroli (etap 72: auto jedzie samo
 * automatem do końca rundy). Kierowca deklarujący Manewr sam płaci w walce Akcją — Akcją Ruchu
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
    const round = chaseRoundOf(placed.scene);
    await deps.ctx.prisma.sceneVehicle.update({
      where: { id: placed.id },
      data: {
        maneuverCall: null,
        // Nagłe zatrzymanie (etap 72): udane zbija prędkość do zera od razu.
        ...(!failed && maneuver.id === CPRED_SUDDEN_STOP_ID ? { speed: 0 } : {}),
        // Gwałtowny skręt (etap 72d): w tej rundzie „Jedź” zmieni pas o dwa naraz.
        ...(!failed && maneuver.id === CPRED_OBSTACLE_MANEUVER_ID && round !== null
          ? { swerveRound: round }
          : {}),
      },
    });
    if (failed) {
      await logSpentAction(deps, campaignId, user, {
        combatantId: '',
        actorName: placed.vehicle.name,
        actionId: 'chase-lost-control',
        actionName: 'Utrata kontroli',
        note: `${maneuver.name} nieudany — auto jedzie samo do końca rundy`,
      });
      await loseControl(deps, campaignId, user, placed.id);
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
    await callManeuver(deps.ctx.prisma, placed, payload?.maneuverId);
    await emitChase(deps, campaignId, placed.sceneId);
    return placedView(deps.ctx.prisma, placed.sceneId, placed.id);
  },
});

/**
 * Wezwanie do Manewru na aucie (`null` — odwołane) — `vehicle:maneuver-call`
 * i plan rund (72f3). Bez rozsyłania: woła je ten, kto zmienia więcej aut.
 */
export async function callManeuver(
  prisma: PrismaClient,
  placed: PlacedWithScene,
  maneuverId: unknown,
): Promise<void> {
  const maneuverCall = maneuverId === null ? null : requireManeuver(placed, maneuverId).id;
  if (maneuverCall && !(await driverOf(prisma, placed.id))) {
    throw new RealtimeError('NOT_DRIVER');
  }
  // Auto bez kontroli Manewru nie wykona (`requireControllable`) — wezwanie
  // wisiałoby u kierowcy z przyciskiem, który zawsze odmawia (21.11.2026).
  if (maneuverCall && placed.lostControl) throw new RealtimeError('VEHICLE_OUT_OF_CONTROL');
  await prisma.sceneVehicle.update({ where: { id: placed.id }, data: { maneuverCall } });
}
