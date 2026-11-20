import type {
  ChaseAutopilotPayload,
  ChaseAutopilotPlan,
  ChaseIntent,
  ChaseIntentPayload,
  ChaseIntentView,
  ChaseObstacleBox,
  ChaseSettings,
  SceneVehicleView,
} from '@vtt/shared';
import {
  CPRED_MOVE_PER_SQUARE,
  ROLE_GM,
  chaseAlongFromRear,
  chaseIsHorizontal,
  chaseIntentNeedsTarget,
  chaseLaneOf,
  chaseLaneSpanPx,
  cpredChaseAutopilot,
  cpredVehicleWrecked,
  isChaseIntent,
  readCpredVehicle,
  type CpredPilotBody,
} from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { Scene, SceneVehicle } from '../generated/prisma/client.js';
import {
  chaseGeometry,
  chaseRoundOf,
  driverCapable,
  emitChase,
  requireChaseCampaignId,
  requirePlaced,
  type PlacedVehicle,
} from './chase.js';
import { obstaclePendingFor } from './chase-obstacles.js';
import { chaseObstaclesFor } from './chase-ram.js';
import { RealtimeError, defineEvent } from './registry.js';
import { emitSceneView, requireCampaignScene } from './scenes.js';

/**
 * Autopilot aut NPC-ów w pościgu (etap 72e, decyzje MG z 15.11 i 20.11).
 *
 * MG nadaje autu zamiar (`chase:intent`), a w turze kierowcy-NPC-a serwer
 * liczy plan — pedał i pas (`cpredChaseAutopilot`) — i wysyła go **tylko MG**
 * w widoku auta (`ChaseIntentView.plan`): kokpit MG ma go od razu wybrany,
 * a mapa pokazuje ducha. Bez „Jedź” auto jedzie tak na koniec tury
 * (`chaseTurnEnd` → `autopilotOrder`), w miejsce jazdy prosto; MG może plan
 * nadpisać kokpitem. Hamulec całej sceny — `chase:autopilot`.
 *
 * Autopilot prowadzi tylko auto z kierowcą-NPC-em (figura bez właściciela),
 * zdolnym do działania, z pracującym silnikiem i kontrolą, w turze tego
 * kierowcy, póki auto nie jechało. Na przeszkodę przed zderzakiem nie
 * odpowiada — to wybór MG — i nie odpala Nitro ani Manewrów.
 */

type PlacedWithScene = PlacedVehicle & { scene: Scene };

/** Bryła ruchu ulicznego bliżej niż tyle kratek od sąsiedniego pasa tylko o niego ociera. */
const LANE_GRAZE_SQ = 0.15;

function readIntent(raw: string): ChaseIntent {
  return isChaseIntent(raw) ? raw : 'manual';
}

/** Zamiar auta w widoku MG — plan dokłada `placedViews` dla auta w turze. */
export function intentViewOf(
  row: Pick<SceneVehicle, 'intent' | 'intentTargetId' | 'intentGapSq'>,
  plan: ChaseAutopilotPlan | null,
): ChaseIntentView {
  const intent = readIntent(row.intent);
  return {
    intent,
    targetId: chaseIntentNeedsTarget(intent) ? row.intentTargetId : null,
    gapSq: intent === 'keep' ? row.intentGapSq : null,
    plan,
  };
}

/** Widok auta dla gracza: bez zamiaru (tajemnica MG). */
export function playerVehicleView(view: SceneVehicleView): SceneVehicleView {
  if (view.intent === undefined) return view;
  const { intent: _intent, ...rest } = view;
  return rest;
}

/** Środek wzdłuż drogi w kratkach (większe — dalej z przodu). */
function alongSq(
  point: { x: number; y: number },
  scene: Pick<Scene, 'width' | 'height' | 'gridSizePx'>,
  settings: Pick<ChaseSettings, 'direction'>,
): number {
  return chaseAlongFromRear(point, settings.direction, scene) / scene.gridSizePx;
}

/** Bryła na drodze w oczach autopilota: położenie wzdłuż, długość i pasy, na które zachodzi. */
function pilotBody(
  box: ChaseObstacleBox,
  scene: Scene,
  speed: number,
  pending: number,
): CpredPilotBody {
  const { settings, frame } = chaseGeometry(scene);
  const grid = scene.gridSizePx;
  const horizontal = chaseIsHorizontal(settings.direction);
  const across = horizontal ? box.centre.y : box.centre.x;
  const half = horizontal ? box.hy : box.hx;
  const lanes: number[] = [];
  for (let lane = 0; lane < settings.lanes; lane += 1) {
    const span = chaseLaneSpanPx(lane, settings.lanes, settings, frame);
    const overlap = Math.min(span.to, across + half) - Math.max(span.from, across - half);
    if (overlap > LANE_GRAZE_SQ * grid) lanes.push(lane);
  }
  const lane = chaseLaneOf(box.centre, settings.lanes, settings, frame);
  return {
    id: box.id,
    along: alongSq(box.centre, scene, settings),
    lengthSq: (2 * (horizontal ? box.hx : box.hy)) / grid,
    lane,
    lanes: lanes.length > 0 ? lanes : [lane],
    speed,
    pending,
  };
}

/** Czy autopilot prowadzi to auto w tej chwili (bez planu — sam warunek). */
async function pilotDrives(prisma: PrismaClient, placed: PlacedWithScene): Promise<boolean> {
  const scene = placed.scene;
  if (scene.kind !== 'chase' || !scene.chaseAutopilot) return false;
  if (readIntent(placed.intent) === 'manual') return false;
  const round = chaseRoundOf(scene);
  if (round === null || placed.movedRound >= round) return false;
  if (placed.status !== 'racing' || !placed.started || placed.lostControl) return false;
  if (cpredVehicleWrecked(readCpredVehicle(placed.vehicle.system))) return false;
  const driver = await prisma.token.findFirst({
    where: { sceneVehicleId: placed.id, vehicleSeat: 0 },
    select: { ownerId: true, statuses: true },
  });
  // Auto prowadzone przez figurę gracza jedzie wyłącznie jego kokpitem.
  if (!driver || driver.ownerId !== null || !driverCapable(driver)) return false;
  // Przeszkoda przed zderzakiem czeka na odpowiedź MG — autopilot jej nie daje.
  return !(await obstaclePendingFor(prisma, placed.id));
}

/**
 * Plan autopilota dla auta w turze jego kierowcy: pedał i zmiana pasa albo
 * `null`, gdy autopilot nie prowadzi (zamiar „Ręcznie”, hamulec sceny, gracz
 * za kierownicą, cel poza kadrem…). `nitroMove` — Ruch pojazdu, gdy kierowca
 * odpalił w tej turze Nitro.
 */
export async function autopilotPlan(
  prisma: PrismaClient,
  placed: PlacedWithScene,
  nitroMove = 0,
): Promise<ChaseAutopilotPlan | null> {
  if (!(await pilotDrives(prisma, placed))) return null;
  const intent = readIntent(placed.intent);
  if (intent === 'manual') return null;
  const scene = placed.scene;
  const { settings, frame } = chaseGeometry(scene);
  const pursuit = scene.chasePursuitSpeed ?? 0;
  const round = chaseRoundOf(scene) ?? 0;
  const { boxes, byId } = await chaseObstaclesFor(prisma, placed);
  const bodies = boxes.map((box) => {
    const entry = byId.get(box.id);
    if (entry?.kind !== 'vehicle') return pilotBody(box, scene, 0, 0);
    const row = entry.vehicle;
    const wreck = cpredVehicleWrecked(readCpredVehicle(row.vehicle.system));
    const speed = wreck ? 0 : Math.max(0, row.speed);
    // Auto, które jeszcze nie jechało w tej rundzie, pojedzie swoją prędkością.
    const pending =
      row.movedRound >= round ? 0 : (speed - pursuit) / CPRED_MOVE_PER_SQUARE + row.raceBonus;
    return pilotBody(box, scene, speed, pending);
  });
  const targetId = chaseIntentNeedsTarget(intent) ? placed.intentTargetId : null;
  const target = targetId ? (bodies.find((body) => body.id === targetId) ?? null) : null;
  if (chaseIntentNeedsTarget(intent) && !target) return null;
  const stats = readCpredVehicle(placed.vehicle.system);
  return cpredChaseAutopilot({
    intent,
    self: {
      along: alongSq(placed, scene, settings),
      lengthSq: placed.vehicle.lengthSq,
      lane: chaseLaneOf(placed, settings.lanes, settings, frame),
      speed: Math.max(0, placed.speed),
      maxSpeed: Math.max(0, stats.move),
      raceBonus: placed.raceBonus,
      nitroMove,
    },
    pursuitSpeed: pursuit,
    lanes: settings.lanes,
    target,
    keepGapSq: placed.intentGapSq,
    others: bodies.filter((body) => body !== target),
  });
}

// ───────────────────────── Zdarzenia MG ─────────────────────────

/**
 * MG: `chase:intent` — zamiar auta NPC-a. Cel musi być innym autem w kadrze
 * tej sceny; „Trzymaj dystans” zapamiętuje odstęp środków z tej chwili.
 * Auto z figurą gracza za kierownicą zamiaru nie dostaje (`PLAYER_DRIVES`).
 */
export const chaseIntentEvent = defineEvent<ChaseIntentPayload, { ok: true }>({
  name: 'chase:intent',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireChaseCampaignId(socket.data);
    const prisma = deps.ctx.prisma;
    const placed = await requirePlaced(prisma, campaignId, payload?.sceneVehicleId);
    if (placed.scene.kind !== 'chase') throw new RealtimeError('NOT_A_CHASE');
    const intent = payload?.intent;
    if (!isChaseIntent(intent)) throw new RealtimeError('BAD_REQUEST');
    if (intent !== 'manual') {
      const driver = await prisma.token.findFirst({
        where: { sceneVehicleId: placed.id, vehicleSeat: 0 },
        select: { ownerId: true },
      });
      if (driver && driver.ownerId !== null) throw new RealtimeError('PLAYER_DRIVES');
    }
    let targetId: string | null = null;
    let gapSq: number | null = null;
    if (chaseIntentNeedsTarget(intent)) {
      if (typeof payload?.targetId !== 'string' || payload.targetId === placed.id) {
        throw new RealtimeError('INTENT_TARGET_NEEDED');
      }
      const target = await prisma.sceneVehicle.findUnique({ where: { id: payload.targetId } });
      if (!target || target.sceneId !== placed.sceneId || target.status !== 'racing') {
        throw new RealtimeError('INTENT_TARGET_NEEDED');
      }
      targetId = target.id;
      if (intent === 'keep') {
        const { settings } = chaseGeometry(placed.scene);
        gapSq = alongSq(placed, placed.scene, settings) - alongSq(target, placed.scene, settings);
      }
    }
    await prisma.sceneVehicle.update({
      where: { id: placed.id },
      data: { intent, intentTargetId: targetId, intentGapSq: gapSq },
    });
    await emitChase(deps, campaignId, placed.sceneId);
    return { ok: true };
  },
});

/** MG: `chase:autopilot` — hamulec autopilota całej sceny. */
export const chaseAutopilotEvent = defineEvent<ChaseAutopilotPayload, { ok: true }>({
  name: 'chase:autopilot',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireChaseCampaignId(socket.data);
    const prisma = deps.ctx.prisma;
    const scene = await requireCampaignScene(prisma, campaignId, payload?.sceneId);
    if (scene.kind !== 'chase') throw new RealtimeError('NOT_A_CHASE');
    if (typeof payload?.on !== 'boolean') throw new RealtimeError('BAD_REQUEST');
    await prisma.scene.update({ where: { id: scene.id }, data: { chaseAutopilot: payload.on } });
    await emitSceneView(deps, campaignId, scene.id);
    await emitChase(deps, campaignId, scene.id);
    return { ok: true };
  },
});
