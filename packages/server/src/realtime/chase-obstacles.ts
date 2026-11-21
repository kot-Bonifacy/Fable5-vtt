import type {
  ChaseObstacleAnswerPayload,
  ChaseObstacleChoice,
  ChaseObstacleRemovePayload,
  ChaseObstacleSpawnPayload,
  ChaseObstacleView,
  ChaseVehicleAnswerPayload,
  CombatActionLogEntry,
  ScenePoint,
  SceneVehicleView,
  SessionUser,
  VehicleNitroPayload,
} from '@vtt/shared';
import {
  CHASE_OBSTACLE_PRESETS,
  CPRED_ACTION_SPIKES,
  CPRED_OBSTACLE_MANEUVER_ID,
  CPRED_SUDDEN_STOP_ID,
  cpredLostControlSpeed,
  chaseObstacleUnbreakable,
  CPRED_SPIKES_DAMAGE,
  CPRED_SPIKES_DV,
  ROLE_GM,
  chaseBodyHalfExtents,
  chaseHeadingDeg,
  chaseObstacleDrifted,
  chaseObstacleGone,
  chaseObstacleDropCentre,
  chaseObstacleMaxGapSq,
  chaseObstacleSweep,
  chaseSpikesCrossed,
  chaseSpikesDropCentre,
  cpredManeuverTitle,
  cpredSpikesAffect,
  cpredVehicleManeuver,
  cpredVehicleSkillId,
  cpredVehicleSpikesLeft,
  cpredVehicleWrecked,
  isChaseObstacleKind,
  readChaseObstacleHp,
  readChaseObstacleName,
  readCpredVehicle,
  type ChaseSweepVehicle,
} from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { ChaseObstacle, Scene, Token } from '../generated/prisma/client.js';
import {
  chaseBodyOf,
  chaseGeometry,
  driverCapable,
  emitChase,
  placedOnScene,
  placedView,
  readDrivers,
  requireChaseCampaignId,
  requirePlaced,
  toObstacleView,
  type PlacedVehicle,
} from './chase.js';
import {
  firstChaseContact,
  postServerRoll,
  pushVehicleBehind,
  resolveRam,
  rollRamDamage,
} from './chase-ram.js';
import { findCombatantForToken, loadCombat } from './combat.js';
import { requireTurnSpend } from './combat-actions.js';
import { logSpentAction } from './combat-log.js';
import { rollServerSkillTest } from './character-rolls.js';
import { requireCampaignScene } from './scenes.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';

/**
 * Przeszkody i ruch uliczny na scenie pościgu (etap 65e, s. 165 i 192).
 *
 * MG wypuszcza przeszkodę w walce przy przedniej krawędzi kadru. Stoi na
 * drodze, więc na początku każdej rundy jedzie w kadrze w tył o `tempo / 4`
 * kratek (`driftObstaclesRound`, hak dryfu aut). Gdy jej tor przetnie bryłę
 * auta (ruch względny, `chaseObstacleSweep`), staje przy jego zderzaku i czeka
 * na kierowcę: Gwałtowny skręt (PT 13, porażka — utrata kontroli i zderzenie)
 * albo taranowanie (`chase:obstacle-answer`). Auto bez kontroli wjeżdża
 * w przeszkodę od razu. Kolczatka nie zatrzymuje — każde auto z oponami,
 * które po niej przejedzie, rzuca Prowadzenie PT 17 albo bierze 4k6 w słaby
 * punkt.
 */

type Placed = PlacedVehicle & { scene: Scene };

function readPassed(raw: string): string[] {
  return readDrivers(raw);
}

async function driverOf(prisma: PrismaClient, sceneVehicleId: string): Promise<Token | null> {
  return prisma.token.findFirst({ where: { sceneVehicleId, vehicleSeat: 0 } });
}

/**
 * Grafika własnej przeszkody MG: wbudowana z `/art/` albo grafika z biblioteki
 * „Grafik” tej kampanii. Inny adres odpada po cichu — przeszkoda dostaje bryłę.
 */
async function obstacleImage(
  prisma: PrismaClient,
  campaignId: string,
  raw: unknown,
): Promise<string | null> {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 500) return null;
  if (/^\/art\/(obstacles|vehicles)\/[a-z0-9-]+\.(webp|png|jpg)$/.test(raw)) return raw;
  const asset = await prisma.tokenAsset.findFirst({ where: { campaignId, url: raw } });
  return asset ? raw : null;
}

async function requireObstacle(
  prisma: PrismaClient,
  campaignId: string,
  obstacleId: unknown,
): Promise<ChaseObstacle & { scene: Scene }> {
  if (typeof obstacleId !== 'string' || obstacleId.length === 0) {
    throw new RealtimeError('BAD_REQUEST');
  }
  const row = await prisma.chaseObstacle.findUnique({
    where: { id: obstacleId },
    include: { scene: true },
  });
  if (!row || row.scene.campaignId !== campaignId) throw new RealtimeError('OBSTACLE_NOT_FOUND');
  return row;
}

/** Pas z ładunku: liczba całkowita w granicach jezdni albo odmowa. */
function requireLane(raw: unknown, lanes: number): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0 || raw >= lanes) {
    throw new RealtimeError('BAD_REQUEST');
  }
  return raw;
}

/**
 * MG: `chase:obstacle-spawn` — przeszkoda z okna „Pościg” (etap 72f2): rodzaj,
 * pas i odległość przed wybranym autem (bez auta — przy przedniej krawędzi).
 * Zawsze w kadrze (decyzja MG 21.11): za daleko — przycięta do przedniej
 * krawędzi, auto bez miejsca przed sobą — `OBSTACLE_NO_ROOM`. Tylko w walce:
 * poza nią nie ma rund, więc przeszkoda by nie jechała.
 */
export const chaseObstacleSpawnEvent = defineEvent<ChaseObstacleSpawnPayload, ChaseObstacleView>({
  name: 'chase:obstacle-spawn',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireChaseCampaignId(socket.data);
    const scene = await requireCampaignScene(deps.ctx.prisma, campaignId, payload?.sceneId);
    return spawnObstacleOnLane(deps, campaignId, scene, payload);
  },
});

/**
 * Przeszkoda na pas przed autem — `chase:obstacle-spawn` i plan rund (72f3).
 * Rozsyła listę przeszkód i zwraca nową.
 */
export async function spawnObstacleOnLane(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  payload: Partial<ChaseObstacleSpawnPayload> | undefined,
): Promise<ChaseObstacleView> {
  const prisma = deps.ctx.prisma;
  if (scene.kind !== 'chase') throw new RealtimeError('NOT_A_CHASE');
  if (!payload || !isChaseObstacleKind(payload.kind)) throw new RealtimeError('BAD_REQUEST');
  const { settings, frame } = chaseGeometry(scene);
  const lane = requireLane(payload.lane, settings.lanes);
  const preset = CHASE_OBSTACLE_PRESETS[payload.kind];
  const body = { widthSq: preset.widthSq, lengthSq: preset.lengthSq };
  let before: { centre: ScenePoint; body: ReturnType<typeof chaseBodyOf>; gapSq: number } | null =
    null;
  if (payload.beforeId !== undefined) {
    const car = await requirePlaced(prisma, campaignId, payload.beforeId);
    if (car.sceneId !== scene.id || car.status !== 'racing') {
      throw new RealtimeError('VEHICLE_NOT_FOUND');
    }
    const gapSq = payload.gapSq;
    if (typeof gapSq !== 'number' || !Number.isFinite(gapSq) || gapSq < 0) {
      throw new RealtimeError('BAD_REQUEST');
    }
    before = { centre: { x: car.x, y: car.y }, body: chaseBodyOf(car.vehicle), gapSq };
    if (chaseObstacleMaxGapSq(before, body, settings.direction, frame) < 0) {
      throw new RealtimeError('OBSTACLE_NO_ROOM');
    }
  }
  const combat = await loadCombat(prisma, scene.id);
  if (!combat) throw new RealtimeError('OBSTACLE_COMBAT_ONLY');
  const name = readChaseObstacleName(payload.name) ?? preset.label;
  const hp = payload.kind === 'spikes' ? 0 : (readChaseObstacleHp(payload.hp) ?? preset.hp);
  const own = await obstacleImage(prisma, campaignId, payload.imageUrl);
  // Kilka grafik (ruch uliczny) — byle jaka z nich; nic na tym nie polega.
  const art = own ?? preset.art[Math.floor(Math.random() * preset.art.length)] ?? null;
  const centre = chaseObstacleDropCentre({
    lane,
    lanes: settings.lanes,
    body,
    settings,
    scene: frame,
    before,
  });
  const created = await prisma.chaseObstacle.create({
    data: {
      sceneId: scene.id,
      kind: payload.kind,
      name,
      imageUrl: art,
      x: centre.x,
      y: centre.y,
      ...body,
      hp,
      hpMax: hp,
      // Wypuszczona w tej rundzie rusza dopiero z następną.
      driftRound: combat.round,
    },
  });
  await emitChase(deps, campaignId, scene.id);
  return toObstacleView(created);
}

/** MG: `chase:obstacle-remove` — przeszkoda schodzi z drogi. */
export const chaseObstacleRemoveEvent = defineEvent<ChaseObstacleRemovePayload, void>({
  name: 'chase:obstacle-remove',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireChaseCampaignId(socket.data);
    const row = await requireObstacle(deps.ctx.prisma, campaignId, payload?.obstacleId);
    await deps.ctx.prisma.chaseObstacle.delete({ where: { id: row.id } });
    await emitChase(deps, campaignId, row.sceneId);
  },
});

/**
 * Przeszkoda po spotkaniu z autem (Manewr udany albo zderzenie, które
 * przeżyła) znika z drogi — poza betonem, który zostaje. Reaguje tylko z pierwszym autem (decyzja MG
 * z 04.11.2026): do tego dnia lądowała za tylnym zderzakiem, także na aucie,
 * które jechało tuż za nim, i chowała się pod nim.
 */
async function letPast(deps: RealtimeDeps, obstacle: ChaseObstacle, placed: Placed): Promise<void> {
  const prisma = deps.ctx.prisma;
  // Beton zostaje na drodze (04.11.2026) — dryfuje dalej i może zatrzymać
  // następne auto; tego, które go minęło albo się na nim rozbiło, już nie.
  if (chaseObstacleUnbreakable(obstacle.kind)) {
    const fresh = await prisma.chaseObstacle.findUnique({ where: { id: obstacle.id } });
    if (!fresh) return;
    await prisma.chaseObstacle.update({
      where: { id: fresh.id },
      data: {
        blockingId: null,
        passed: JSON.stringify([...new Set([...readPassed(fresh.passed), placed.id])]),
      },
    });
    return;
  }
  await prisma.chaseObstacle.deleteMany({ where: { id: obstacle.id } });
}

/**
 * Udany Gwałtowny skręt z menu auta (zaległość 66d z 06.11.2026): przeszkoda
 * MG stojąca wprost przed zderzakiem — po „Zatrzymaj się przed” albo zanim
 * dryf przyniósł pasek — zostaje ominięta tak samo jak po odpowiedzi na pasek
 * (`letPast`: znika, beton zostaje za autem). Wcześniej skręt zużywał Akcję,
 * a przeszkodę rozstrzygał dopiero pasek w następnej rundzie. Patrzy pół
 * kratki przed przód auta, tą samą geometrią co taranowanie; inne auta i piesi
 * zostają, gdzie są. Zwraca nazwę ominiętej przeszkody albo null.
 */
export async function passObstacleAhead(
  deps: RealtimeDeps,
  placed: Placed,
): Promise<string | null> {
  const { settings } = chaseGeometry(placed.scene);
  const rad = (chaseHeadingDeg(settings.direction) * Math.PI) / 180;
  const reach = placed.scene.gridSizePx / 2;
  const from = { x: placed.x, y: placed.y };
  const to = { x: placed.x + Math.sin(rad) * reach, y: placed.y - Math.cos(rad) * reach };
  const contact = await firstChaseContact(deps.ctx.prisma, placed, from, to);
  if (!contact || contact.obstacle.kind !== 'obstacle') return null;
  await letPast(deps, contact.obstacle.obstacle, placed);
  return contact.obstacle.obstacle.name;
}

/**
 * Zderzenie auta z przeszkodą, która stoi przed jego zderzakiem — rozstrzyga
 * je `resolveRam` jak każde taranowanie (przeszkoda uderza w przód auta, więc
 * Pług bojowy działa). Ocalała przeszkoda znika z drogi (04.11.2026).
 */
async function collide(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  placed: Placed,
  obstacle: ChaseObstacle,
): Promise<void> {
  await resolveRam(
    deps,
    campaignId,
    user,
    placed,
    { kind: 'obstacle', id: obstacle.id, obstacle },
    true,
  );
  await letPast(deps, obstacle, placed);
}

/** Wybór odpowiedzi na przeszkodę albo odmowa. */
function readObstacleChoice(raw: unknown): ChaseObstacleChoice {
  if (raw === 'swerve' || raw === 'stop' || raw === 'ram') return raw;
  throw new RealtimeError('BAD_REQUEST');
}

/**
 * Manewr w odpowiedzi na przeszkodę (Gwałtowny skręt albo — od 72d — Nagłe
 * zatrzymanie, oba PT 13): Test REF + Umiejętność prowadzenia rzucony przez
 * serwer. Udany — `passed`; porażka — utrata kontroli (prędkość −10 od razu),
 * wpis w dzienniku i `crash` (zderzenie z tym, co stoi).
 */
async function answerWithManeuver(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  placed: Placed,
  driver: Token | null,
  choice: 'swerve' | 'stop',
  blockerName: string,
  outcome: { passed: () => Promise<void>; crash: () => Promise<void> },
): Promise<void> {
  const prisma = deps.ctx.prisma;
  if (!driver) throw new RealtimeError('NOT_DRIVER');
  if (!driverCapable(driver)) throw new RealtimeError('DRIVER_INCAPABLE');
  const maneuver = cpredVehicleManeuver(
    choice === 'stop' ? CPRED_SUDDEN_STOP_ID : CPRED_OBSTACLE_MANEUVER_ID,
  )!;
  const skillId = cpredVehicleSkillId(readCpredVehicle(placed.vehicle.system).kind);
  const roll = await rollServerSkillTest(deps, driver, skillId, maneuver.dv);
  if (roll) {
    roll.title = `${cpredManeuverTitle(maneuver)} — ${roll.title ?? ''}`.trim();
    await postServerRoll(deps, campaignId, user, placed.sceneId, roll);
  }
  if (roll?.outcome?.success === true) {
    await outcome.passed();
    return;
  }
  // Etap 72: utrata kontroli zbija prędkość od razu o 10 Ruchu.
  await prisma.sceneVehicle.update({
    where: { id: placed.id },
    data: { lostControl: true, speed: cpredLostControlSpeed(placed.speed) },
  });
  const line: CombatActionLogEntry = {
    combatantId: '',
    actorName: placed.vehicle.name,
    actionId: 'chase-lost-control',
    actionName: 'Utrata kontroli',
    note: `${maneuver.name} nieudany — wjeżdża w: ${blockerName}`,
  };
  await logSpentAction(deps, campaignId, user, line);
  await outcome.crash();
}

/**
 * Udane Nagłe zatrzymanie przed tym, co stoi (etap 72d): auto staje (prędkość
 * 0) zderzak w zderzak, a przeszkoda przestaje na nie czekać. Stojącego auta
 * nic już nie najedzie — przeszkoda i auto stoją na drodze, więc kadr zabiera
 * je w tył razem (`driftObstaclesRound` zatrzymuje przeszkodę przy zderzaku
 * auta, które stoi). Dalej kierowca zmienia pas albo taranuje gazem.
 */
async function stopBefore(deps: RealtimeDeps, placed: Placed): Promise<void> {
  await deps.ctx.prisma.sceneVehicle.update({ where: { id: placed.id }, data: { speed: 0 } });
}

/**
 * `chase:obstacle-answer` — kierowca auta, przed którym stanęła przeszkoda,
 * wybiera: Gwałtowny skręt albo Nagłe zatrzymanie (Test REF + Prowadzenie
 * PT 13 rzucony przez serwer, porażka — utrata kontroli i zderzenie) albo
 * taranowanie. Odpowiedź nic nie kosztuje (przeszkoda przychodzi na początku
 * rundy, poza czyjąkolwiek turą). MG odpowiada za każde auto — także za
 * kierowcę-NPC-a.
 */
export const chaseObstacleAnswerEvent = defineEvent<ChaseObstacleAnswerPayload, SceneVehicleView>({
  name: 'chase:obstacle-answer',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireChaseCampaignId(socket.data);
    const prisma = deps.ctx.prisma;
    const obstacle = await requireObstacle(prisma, campaignId, payload?.obstacleId);
    const choice = readObstacleChoice(payload?.choice);
    if (!obstacle.blockingId) throw new RealtimeError('OBSTACLE_NOT_BLOCKING');
    const placed = await requirePlaced(prisma, campaignId, obstacle.blockingId);
    const driver = await driverOf(prisma, placed.id);
    if (user.role !== ROLE_GM && (!driver || driver.hidden || driver.ownerId !== user.id)) {
      throw new RealtimeError('NOT_DRIVER');
    }
    if (choice === 'ram') {
      await collide(deps, campaignId, user, placed, obstacle);
      await emitChase(deps, campaignId, placed.sceneId);
      return placedView(prisma, placed.sceneId, placed.id);
    }

    await answerWithManeuver(deps, campaignId, user, placed, driver, choice, obstacle.name, {
      passed: async () => {
        if (choice === 'swerve') {
          await letPast(deps, obstacle, placed);
          return;
        }
        await stopBefore(deps, placed);
        await prisma.chaseObstacle.update({
          where: { id: obstacle.id },
          data: { blockingId: null },
        });
      },
      crash: () => collide(deps, campaignId, user, placed, obstacle),
    });
    await emitChase(deps, campaignId, placed.sceneId);
    return placedView(prisma, placed.sceneId, placed.id);
  },
});

/**
 * `vehicle:spikes` — kierowca za Akcję zrzuca kolczatkę za auto (s. 165). MG
 * zrzuca ją za kierowcę-NPC-a z jego budżetu, jak Nitro. Tylko w walce.
 */
export const vehicleSpikesEvent = defineEvent<VehicleNitroPayload, SceneVehicleView>({
  name: 'vehicle:spikes',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireChaseCampaignId(socket.data);
    const prisma = deps.ctx.prisma;
    const placed = await requirePlaced(prisma, campaignId, payload?.sceneVehicleId);
    if (placed.scene.kind !== 'chase') throw new RealtimeError('NOT_A_CHASE');
    if (placed.status !== 'racing') throw new RealtimeError('VEHICLE_NOT_RACING');
    const driver = await driverOf(prisma, placed.id);
    if (!driver) throw new RealtimeError('NOT_DRIVER');
    if (user.role !== ROLE_GM && (driver.hidden || driver.ownerId !== user.id)) {
      throw new RealtimeError('NOT_DRIVER');
    }
    if (!driverCapable(driver)) throw new RealtimeError('DRIVER_INCAPABLE');
    const stats = readCpredVehicle(placed.vehicle.system);
    if (cpredVehicleWrecked(stats)) throw new RealtimeError('VEHICLE_WRECKED');
    if (cpredVehicleSpikesLeft(stats, placed.spikesUsed) <= 0) throw new RealtimeError('NO_SPIKES');
    const combat = await loadCombat(prisma, placed.sceneId);
    const found = combat ? await findCombatantForToken(prisma, placed.sceneId, driver.id) : null;
    if (!combat || !found) throw new RealtimeError('SPIKES_COMBAT_ONLY');
    await requireTurnSpend(
      deps,
      campaignId,
      placed.scene,
      driver.id,
      { kind: 'action', actionId: CPRED_ACTION_SPIKES },
      user,
      CPRED_ACTION_SPIKES,
    );
    const preset = CHASE_OBSTACLE_PRESETS.spikes;
    const body = { widthSq: preset.widthSq, lengthSq: preset.lengthSq };
    const { settings } = chaseGeometry(placed.scene);
    const centre = chaseSpikesDropCentre(
      { x: placed.x, y: placed.y, ...chaseBodyOf(placed.vehicle) },
      body,
      settings.direction,
      placed.scene.gridSizePx,
    );
    await prisma.chaseObstacle.create({
      data: {
        sceneId: placed.sceneId,
        kind: 'spikes',
        name: preset.label,
        imageUrl: preset.art[0] ?? null,
        ...centre,
        ...body,
        hp: 0,
        hpMax: 0,
        driftRound: combat.round,
        passed: JSON.stringify([placed.id]),
        droppedById: placed.id,
      },
    });
    await prisma.sceneVehicle.update({
      where: { id: placed.id },
      data: { spikesUsed: { increment: 1 } },
    });
    await emitChase(deps, campaignId, placed.sceneId);
    return placedView(prisma, placed.sceneId, placed.id);
  },
});

/**
 * Auto wjechało na kolczatkę (s. 165): kierowca rzuca Prowadzenie PT 17
 * (serwer, jawnie, z kośćmi 3D), porażka — 4k6 w słaby punkt (po OB ×2) przez
 * kartę obrażeń z „Cofnij”. Bez kierowcy zdolnego do jazdy Testu nie ma. Auto
 * bez opon (łódź, poduszkowiec) przejeżdża bez szkody.
 */
async function spikesHit(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  scene: Scene,
  placed: PlacedVehicle,
  spikes: ChaseObstacle,
): Promise<void> {
  const stats = readCpredVehicle(placed.vehicle.system);
  if (!cpredSpikesAffect(stats)) return;
  const driver = await driverOf(deps.ctx.prisma, placed.id);
  const roll =
    driver && driverCapable(driver)
      ? await rollServerSkillTest(deps, driver, cpredVehicleSkillId(stats.kind), CPRED_SPIKES_DV)
      : null;
  if (roll) {
    roll.title = `${spikes.name}: ${roll.title ?? ''}`.trim();
    await postServerRoll(deps, campaignId, user, scene.id, roll);
    if (roll.outcome?.success === true) return;
  }
  await rollRamDamage(
    deps,
    campaignId,
    user,
    scene,
    CPRED_SPIKES_DAMAGE,
    `${spikes.name} → ${placed.vehicle.name}`,
    { vehicleId: placed.id },
    { name: spikes.name, weakSpot: true },
  );
}

/**
 * Kierowca przejechał autem `from → to` w swojej turze (`chase:move` w walce):
 * każda kolczatka na tej drodze, której to auto jeszcze nie przejechało,
 * wzywa Test.
 */
export async function crossSpikes(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  placed: Placed,
  from: ScenePoint,
): Promise<void> {
  const prisma = deps.ctx.prisma;
  const spikes = await prisma.chaseObstacle.findMany({
    where: { sceneId: placed.sceneId, kind: 'spikes' },
  });
  const open = spikes.filter(
    (row) => row.droppedById !== placed.id && !readPassed(row.passed).includes(placed.id),
  );
  if (open.length === 0) return;
  const now = await prisma.sceneVehicle.findUnique({ where: { id: placed.id } });
  if (!now) return;
  const { settings } = chaseGeometry(placed.scene);
  const grid = placed.scene.gridSizePx;
  const crossed = chaseSpikesCrossed(
    from,
    { x: now.x, y: now.y },
    chaseBodyHalfExtents(chaseBodyOf(placed.vehicle), settings.direction, grid),
    open.map((row) => ({
      id: row.id,
      centre: { x: row.x, y: row.y },
      ...chaseBodyHalfExtents(row, settings.direction, grid),
    })),
  );
  for (const id of crossed) {
    const row = open.find((entry) => entry.id === id)!;
    // Kolczatka reaguje tylko z pierwszym autem, potem znika — jak przeszkoda
    // (decyzja MG z 04.11.2026).
    await prisma.chaseObstacle.deleteMany({ where: { id: row.id } });
    await spikesHit(deps, campaignId, user, placed.scene, placed, row);
  }
  if (crossed.length > 0) await emitChase(deps, campaignId, placed.sceneId);
}

/** Czy przed tym autem czeka przeszkoda — kierowca-gracz najpierw odpowiada. */
export async function obstaclePendingFor(
  prisma: PrismaClient,
  sceneVehicleId: string,
): Promise<boolean> {
  const row = await prisma.chaseObstacle.findFirst({
    where: { blockingId: sceneVehicleId },
    select: { id: true },
  });
  if (row !== null) return true;
  // Stojące auto przed zderzakiem (przegląd 03.11) czeka tak samo.
  const stalled = await prisma.sceneVehicle.findFirst({
    where: { blockingId: sceneVehicleId },
    select: { id: true },
  });
  return stalled !== null;
}

/**
 * `chase:vehicle-answer` — przed autem dryfem stanęło auto stojące na drodze
 * (wrak, zgaszony silnik; przegląd 03.11). Kierowca wybiera jak przy
 * przeszkodzie MG: Gwałtowny skręt (PT 13, porażka — utrata kontroli
 * i zderzenie) albo taranowanie (`resolveRam`, auto z auto). Po obu stojące auto
 * zostaje za tylnym zderzakiem. Odpowiedź nic nie kosztuje; MG za każdego.
 */
export const chaseVehicleAnswerEvent = defineEvent<ChaseVehicleAnswerPayload, SceneVehicleView>({
  name: 'chase:vehicle-answer',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireChaseCampaignId(socket.data);
    const prisma = deps.ctx.prisma;
    const stalled = await requirePlaced(prisma, campaignId, payload?.sceneVehicleId);
    const choice = readObstacleChoice(payload?.choice);
    if (!stalled.blockingId) throw new RealtimeError('OBSTACLE_NOT_BLOCKING');
    const placed = await requirePlaced(prisma, campaignId, stalled.blockingId);
    const driver = await driverOf(prisma, placed.id);
    if (user.role !== ROLE_GM && (!driver || driver.hidden || driver.ownerId !== user.id)) {
      throw new RealtimeError('NOT_DRIVER');
    }
    const crash = async () => {
      await resolveRam(
        deps,
        campaignId,
        user,
        placed,
        { kind: 'vehicle', id: stalled.id, vehicle: stalled },
        true,
      );
      await pushVehicleBehind(deps, campaignId, placed.scene, stalled.id, placed.id);
    };
    if (choice === 'ram') {
      await crash();
      await emitChase(deps, campaignId, placed.sceneId);
      return placedView(prisma, placed.sceneId, placed.id);
    }
    await answerWithManeuver(deps, campaignId, user, placed, driver, choice, stalled.vehicle.name, {
      passed: async () => {
        if (choice === 'swerve') {
          await pushVehicleBehind(deps, campaignId, placed.scene, stalled.id, placed.id);
          return;
        }
        await stopBefore(deps, placed);
        await prisma.sceneVehicle.update({ where: { id: stalled.id }, data: { blockingId: null } });
      },
      crash,
    });
    await emitChase(deps, campaignId, placed.sceneId);
    return placedView(prisma, placed.sceneId, placed.id);
  },
});

/**
 * Początek rundy (65e), po dryfie aut: każda przeszkoda jedzie w kadrze w tył
 * o `rama / 4` kratek (tempo sceny, a gdy auto drużyny stoi — mniej, 05.11.2026), raz na rundę (`driftRound`). `lostBefore` to auta,
 * które weszły w rundę bez kontroli — dryf już ją oddał, ale przeszkoda tej
 * chwili jeszcze ich nie omija (przegląd 03.11). `moves` to auta w kadrze
 * z miejscem przed i po dryfie — tor przeszkody przecina się z ich bryłami
 * ruchem względnym. Przeszkoda czekająca na kierowcę jedzie przy zderzaku
 * swojego auta. Kolczatka przejeżdża pod autami i wzywa Testy; reszta staje
 * przed pierwszym autem i czeka na wybór kierowcy, a auto bez kontroli
 * wjeżdża w nią od razu. Przeszkoda za tylną krawędzią znika.
 */
export async function driftObstaclesRound(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  round: number,
  user: SessionUser,
  moves: ReadonlyMap<string, { from: ScenePoint; to: ScenePoint }>,
  lostBefore: ReadonlySet<string> = new Set(),
  /** Prędkość ramy tej rundy (`chaseFrameTempo`) — przeszkoda stoi na drodze, więc jedzie z nią. */
  frameTempo: number = scene.chaseTempo,
): Promise<void> {
  const prisma = deps.ctx.prisma;
  const obstacles = await prisma.chaseObstacle.findMany({
    where: { sceneId: scene.id, driftRound: { lt: round } },
    orderBy: { createdAt: 'asc' },
  });
  if (obstacles.length === 0) return;
  const { settings, frame } = chaseGeometry(scene);
  const grid = scene.gridSizePx;
  const placed = new Map(
    (await placedOnScene(prisma, scene.id)).map((row) => [row.id, row] as const),
  );
  const sweepers: ChaseSweepVehicle[] = [];
  for (const [id, move] of moves) {
    const row = placed.get(id);
    if (!row) continue;
    sweepers.push({
      id,
      ...move,
      ...chaseBodyHalfExtents(chaseBodyOf(row.vehicle), settings.direction, grid),
    });
  }
  const crashes: { vehicle: PlacedVehicle; obstacle: ChaseObstacle }[] = [];
  const spikeHits: { vehicle: PlacedVehicle; obstacle: ChaseObstacle }[] = [];
  const blocked: { vehicle: PlacedVehicle; obstacle: ChaseObstacle }[] = [];

  for (const obstacle of obstacles) {
    const from = { x: obstacle.x, y: obstacle.y };
    const waiting = obstacle.blockingId ? moves.get(obstacle.blockingId) : undefined;
    if (waiting) {
      // Czeka na wybór kierowcy — jedzie przy zderzaku swojego auta.
      await prisma.chaseObstacle.update({
        where: { id: obstacle.id },
        data: {
          x: from.x + waiting.to.x - waiting.from.x,
          y: from.y + waiting.to.y - waiting.from.y,
          driftRound: round,
        },
      });
      continue;
    }
    const to = chaseObstacleDrifted(from, { ...settings, tempo: frameTempo }, grid);
    const passed = new Set(readPassed(obstacle.passed));
    const candidates = sweepers.filter(
      (row) => !passed.has(row.id) && row.id !== obstacle.droppedById,
    );
    const hits = chaseObstacleSweep(
      { from, to, ...chaseBodyHalfExtents(obstacle, settings.direction, grid) },
      candidates,
    );
    let centre = to;
    let blockingId: string | null = null;
    if (obstacle.kind === 'spikes') {
      // Tylko pierwsze auto na drodze kolczatki — potem znika jak przeszkoda
      // (decyzja MG z 04.11.2026; do tego dnia jechała dalej przez kolejne auta).
      const vehicle = hits[0] ? placed.get(hits[0].id) : undefined;
      if (vehicle) {
        spikeHits.push({ vehicle, obstacle });
        await prisma.chaseObstacle.delete({ where: { id: obstacle.id } });
        continue;
      }
    } else if (hits[0]) {
      const vehicle = placed.get(hits[0].id);
      centre = hits[0].centre;
      if (vehicle) {
        const driver = await driverOf(prisma, vehicle.id);
        const controlled =
          driver !== null &&
          driverCapable(driver) &&
          !vehicle.lostControl &&
          !lostBefore.has(vehicle.id) &&
          vehicle.started;
        // Auto, które stoi (prędkość 0 — np. po Nagłym zatrzymaniu, etap 72d),
        // stoi na drodze tak jak przeszkoda: nic na nie nie najeżdża. Przeszkoda
        // staje przy zderzaku (`centre`) bez czekania na wybór kierowcy.
        if (vehicle.speed > 0 && controlled) {
          blockingId = vehicle.id;
          blocked.push({ vehicle, obstacle });
        } else if (vehicle.speed > 0) crashes.push({ vehicle, obstacle });
      }
    }
    if (!blockingId && chaseObstacleGone(centre, obstacle, settings.direction, frame)) {
      await prisma.chaseObstacle.delete({ where: { id: obstacle.id } });
      continue;
    }
    await prisma.chaseObstacle.update({
      where: { id: obstacle.id },
      data: {
        x: centre.x,
        y: centre.y,
        driftRound: round,
        blockingId,
        passed: JSON.stringify([...passed]),
      },
    });
  }

  for (const { vehicle, obstacle } of blocked) {
    const line: CombatActionLogEntry = {
      combatantId: '',
      actorName: vehicle.vehicle.name,
      actionId: 'chase-obstacle',
      actionName: 'Przeszkoda na drodze',
      note: `${obstacle.name} — Gwałtowny skręt albo taranowanie`,
    };
    await logSpentAction(deps, campaignId, user, line);
  }
  for (const { vehicle, obstacle } of crashes) {
    const fresh = await prisma.chaseObstacle.findUnique({ where: { id: obstacle.id } });
    if (!fresh) continue;
    await collide(deps, campaignId, user, { ...vehicle, scene }, fresh);
  }
  for (const { vehicle, obstacle } of spikeHits) {
    await spikesHit(deps, campaignId, user, scene, vehicle, obstacle);
  }
}
