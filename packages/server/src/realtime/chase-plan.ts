import {
  CHASE_PLAN_ANSWERS,
  ROLE_GM,
  chaseAnchorVehicle,
  chasePlanDue,
  chasePlanTitle,
  chasePlanVehicleRefs,
  cpredManeuversFor,
  cpredSpeedMph,
  cpredVehicleManeuver,
  cpredVehicleWrecked,
  mergeChasePlan,
  parseChasePlan,
  readChasePlanEvents,
  readCpredVehicle,
  type ChasePlanAnswer,
  type ChasePlanAnswerPayload,
  type ChasePlanEntry,
  type ChasePlanLogEntry,
  type ChasePlanPayload,
  type SessionUser,
} from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { Scene } from '../generated/prisma/client.js';
import { campaignGmUser } from './campaign-gm.js';
import {
  chaseGeometry,
  emitChase,
  placedOnScene,
  placedViews,
  requireChaseCampaignId,
  requirePlaced,
} from './chase.js';
import { callManeuver, restoreToChase } from './chase-driving.js';
import { spawnObstacleOnLane } from './chase-obstacles.js';
import { INCLUDE_CHAT_NAMES, deliverChatMessageTo, toChatMessageView } from './chat-io.js';
import { loadCombat } from './combat.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { requireCampaignScene } from './scenes.js';

/**
 * Plan rund pościgu (etap 72f3, decyzja MG 11 z 15.11 i z 21.11).
 *
 * MG wpisuje „runda N → zdarzenie” w oknie „Pościg” albo w kreatorze
 * (`chase:plan`, stan w `Scene.chasePlan`). Na początku rundy (`advanceTurn`,
 * zaraz po `startChaseRound`) serwer wystawia za każde czekające zdarzenie
 * kartę czatu `chaseplan` — **wyłącznie dla MG** (plan jest tajemnicą) —
 * którą panel decyzji pokazuje od razu. Runda przy tym **nie stoi**,
 * a zdarzenie bez odpowiedzi czeka dalej. „Wypuść” wykonuje zdarzenie tymi
 * samymi funkcjami co okno (posiłki — `restoreToChase`, przeszkoda —
 * `spawnObstacleOnLane`, Manewr — `callManeuver`), „Odłóż o rundę” pyta znowu
 * na początku następnej, „Pomiń” zamyka. Nowa walka zaczyna plan od nowa.
 */

// ───────────────────────── Stan ─────────────────────────

export function readScenePlan(scene: Pick<Scene, 'chasePlan'>): ChasePlanEntry[] {
  return parseChasePlan(scene.chasePlan);
}

async function savePlan(
  prisma: PrismaClient,
  sceneId: string,
  plan: readonly ChasePlanEntry[],
): Promise<void> {
  await prisma.scene.update({ where: { id: sceneId }, data: { chasePlan: JSON.stringify(plan) } });
}

/** Nagłówek zdarzenia z nazwami aut sceny i Manewrów systemu. */
async function titleOf(prisma: PrismaClient, scene: Scene, entry: ChasePlanEntry): Promise<string> {
  const cars = new Map(
    (await placedOnScene(prisma, scene.id)).map((row) => [row.id, row.vehicle.name]),
  );
  return chasePlanTitle(
    entry,
    {
      vehicle: (id) => cars.get(id) ?? null,
      maneuver: (id) => {
        const maneuver = cpredVehicleManeuver(id);
        return maneuver ? `${maneuver.name} (PT ${maneuver.dv})` : null;
      },
      metersPerSquare: scene.metersPerSquare,
    },
    cpredSpeedMph,
  );
}

// ───────────────────────── Karta ─────────────────────────

async function deliverToGms(
  deps: RealtimeDeps,
  campaignId: string,
  stored: Parameters<typeof toChatMessageView>[0],
  event: 'chat:message' | 'chat:update',
): Promise<void> {
  await deliverChatMessageTo(deps, campaignId, toChatMessageView(stored), [], true, event);
}

async function updateCard(
  deps: RealtimeDeps,
  campaignId: string,
  messageId: number,
  entry: ChasePlanLogEntry,
): Promise<void> {
  const stored = await deps.ctx.prisma.chatMessage.update({
    where: { id: messageId },
    data: { payload: JSON.stringify(entry) },
    include: INCLUDE_CHAT_NAMES,
  });
  await deliverToGms(deps, campaignId, stored, 'chat:update');
}

/**
 * Początek rundy `round`: karta za każde zdarzenie planu, którego runda
 * nadeszła. Raz na zdarzenie — cofnięta i ponowiona tura nie pyta drugi raz,
 * bo zdarzenie jest już `asked`.
 */
export async function askChasePlan(
  deps: RealtimeDeps,
  campaignId: string,
  sceneId: string,
  round: number,
): Promise<void> {
  const prisma = deps.ctx.prisma;
  const scene = await prisma.scene.findUnique({ where: { id: sceneId } });
  if (!scene || scene.kind !== 'chase') return;
  const plan = readScenePlan(scene);
  const due = chasePlanDue(plan, round);
  if (due.length === 0) return;
  // Karta MG, choć rundę mógł ruszyć gracz końcem tury — inaczej autor-gracz
  // dostałby ją w historii (`visibleTo`: własne wiersze).
  const gm = await campaignGmUser(prisma, campaignId);
  if (!gm) return;
  for (const entry of due) {
    const card: ChasePlanLogEntry = {
      sceneId,
      round,
      entryId: entry.id,
      kind: entry.kind,
      title: await titleOf(prisma, scene, entry),
      text: entry.kind === 'note' ? null : entry.text,
      status: 'waiting',
    };
    const stored = await prisma.chatMessage.create({
      data: {
        campaignId,
        authorId: gm.id,
        kind: 'chaseplan',
        text: `Plan rundy ${round}: ${card.title}`,
        payload: JSON.stringify(card),
      },
      include: INCLUDE_CHAT_NAMES,
    });
    entry.status = 'asked';
    entry.dueRound = round;
    entry.messageId = stored.id;
    await deliverToGms(deps, campaignId, stored, 'chat:message');
  }
  await savePlan(prisma, sceneId, plan);
  await emitChase(deps, campaignId, sceneId);
}

/**
 * Walka się skończyła albo zaczęła od nowa: otwarte karty planu gasną jako
 * przerwane. Stan planu zeruje potem `resetChaseCombat`.
 */
export async function cancelChasePlanCards(
  deps: RealtimeDeps,
  campaignId: string,
  sceneId: string,
): Promise<void> {
  const prisma = deps.ctx.prisma;
  const scene = await prisma.scene.findUnique({ where: { id: sceneId } });
  if (!scene || scene.kind !== 'chase') return;
  for (const entry of readScenePlan(scene)) {
    if (entry.status !== 'asked' || entry.messageId === null) continue;
    const stored = await prisma.chatMessage.findUnique({ where: { id: entry.messageId } });
    if (!stored || stored.kind !== 'chaseplan' || !stored.payload) continue;
    const card = JSON.parse(stored.payload) as ChasePlanLogEntry;
    if (card.status !== 'waiting') continue;
    await updateCard(deps, campaignId, stored.id, { ...card, status: 'cancelled' });
  }
}

// ───────────────────────── Wykonanie ─────────────────────────

/** Zdarzenie planu dzieje się — odmowa zostawia kartę otwartą. */
async function releaseEntry(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  entry: ChasePlanEntry,
): Promise<void> {
  const prisma = deps.ctx.prisma;
  const lanes = chaseGeometry(scene).settings.lanes;
  switch (entry.kind) {
    case 'reinforce': {
      const placed = await requirePlaced(prisma, campaignId, entry.vehicleId);
      if (placed.sceneId !== scene.id) throw new RealtimeError('VEHICLE_NOT_FOUND');
      if (placed.status !== 'behind' && placed.status !== 'escaped') {
        throw new RealtimeError('PLAN_ALREADY_IN_CHASE');
      }
      await restoreToChase(deps, campaignId, placed, {
        lane: Math.min(entry.lane, lanes - 1),
        side: entry.side,
        ...(entry.speed !== null ? { speed: entry.speed } : {}),
      });
      return;
    }
    case 'obstacle': {
      // Auto z planu, a gdy wypadło z kadru — auto kadru; odstęp pusty — przy krawędzi.
      let beforeId: string | null = null;
      if (entry.gapSq !== null) {
        const views = await placedViews(prisma, scene.id, { gm: true });
        const chosen = views.find((view) => view.id === entry.beforeId && view.status === 'racing');
        const anchorId = chaseAnchorVehicle(views, scene.chaseAnchorId);
        const anchor = views.find((view) => view.id === anchorId && view.status === 'racing');
        beforeId = chosen?.id ?? anchor?.id ?? null;
      }
      await spawnObstacleOnLane(deps, campaignId, scene, {
        sceneId: scene.id,
        kind: entry.obstacle,
        lane: Math.min(entry.lane, lanes - 1),
        ...(beforeId !== null && entry.gapSq !== null ? { beforeId, gapSq: entry.gapSq } : {}),
      });
      return;
    }
    case 'maneuver': {
      if (entry.vehicleId !== null) {
        const placed = await requirePlaced(prisma, campaignId, entry.vehicleId);
        if (placed.sceneId !== scene.id || placed.status !== 'racing') {
          throw new RealtimeError('VEHICLE_NOT_FOUND');
        }
        await callManeuver(prisma, placed, entry.maneuver);
      } else {
        // Każde auto w kadrze, które jedzie, ma kierowcę i zna ten Manewr.
        let called = 0;
        for (const row of await placedOnScene(prisma, scene.id)) {
          if (row.status !== 'racing') continue;
          const stats = readCpredVehicle(row.vehicle.system);
          if (cpredVehicleWrecked(stats)) continue;
          if (!cpredManeuversFor(stats.kind).some((m) => m.id === entry.maneuver)) continue;
          const driver = await prisma.token.findFirst({
            where: { sceneVehicleId: row.id, vehicleSeat: 0 },
          });
          if (!driver) continue;
          await callManeuver(prisma, { ...row, scene }, entry.maneuver);
          called += 1;
        }
        if (called === 0) throw new RealtimeError('PLAN_NO_DRIVERS');
      }
      await emitChase(deps, campaignId, scene.id);
      return;
    }
    case 'note':
      return;
  }
}

// ───────────────────────── Zdarzenia MG ─────────────────────────

/** MG: `chase:plan` — cały plan sceny; zwraca go ze stanem. */
export const chasePlanEvent = defineEvent<ChasePlanPayload, { plan: ChasePlanEntry[] }>({
  name: 'chase:plan',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireChaseCampaignId(socket.data);
    const prisma = deps.ctx.prisma;
    const scene = await requireCampaignScene(prisma, campaignId, payload?.sceneId);
    if (scene.kind !== 'chase') throw new RealtimeError('NOT_A_CHASE');
    const events = readChasePlanEvents(payload?.plan);
    if (!events) throw new RealtimeError('BAD_REQUEST');
    const cars = new Set((await placedOnScene(prisma, scene.id)).map((row) => row.id));
    if (chasePlanVehicleRefs(events).some((ref) => !cars.has(ref))) {
      throw new RealtimeError('VEHICLE_NOT_FOUND');
    }
    for (const event of events) {
      if (event.kind === 'maneuver' && !cpredVehicleManeuver(event.maneuver)) {
        throw new RealtimeError('UNKNOWN_MANEUVER');
      }
    }
    const plan = mergeChasePlan(readScenePlan(scene), events);
    await savePlan(prisma, scene.id, plan);
    await emitChase(deps, campaignId, scene.id);
    return { plan };
  },
});

/** MG: `chase:plan-answer` — „Wypuść”, „Pomiń” albo „Odłóż o rundę”. */
export const chasePlanAnswerEvent = defineEvent<ChasePlanAnswerPayload, void>({
  name: 'chase:plan-answer',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireChaseCampaignId(socket.data);
    await answerChasePlan(deps, campaignId, user, payload?.messageId, payload?.answer);
  },
});

export async function answerChasePlan(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  messageId: unknown,
  answer: unknown,
): Promise<void> {
  const prisma = deps.ctx.prisma;
  if (typeof messageId !== 'number' || !Number.isInteger(messageId)) {
    throw new RealtimeError('BAD_REQUEST');
  }
  if (!(CHASE_PLAN_ANSWERS as readonly unknown[]).includes(answer)) {
    throw new RealtimeError('BAD_REQUEST');
  }
  const stored = await prisma.chatMessage.findUnique({ where: { id: messageId } });
  if (!stored || stored.campaignId !== campaignId || stored.kind !== 'chaseplan') {
    throw new RealtimeError('PLAN_NOT_FOUND');
  }
  const card = JSON.parse(stored.payload ?? '{}') as ChasePlanLogEntry;
  if (card.status !== 'waiting') throw new RealtimeError('PLAN_NOT_WAITING');
  const scene = await prisma.scene.findUnique({ where: { id: card.sceneId } });
  if (!scene || scene.campaignId !== campaignId) throw new RealtimeError('SCENE_NOT_FOUND');
  const plan = readScenePlan(scene);
  const entry = plan.find((row) => row.id === card.entryId);
  if (!entry || entry.status !== 'asked' || entry.messageId !== messageId) {
    throw new RealtimeError('PLAN_NOT_WAITING');
  }

  let next: ChasePlanLogEntry;
  switch (answer as ChasePlanAnswer) {
    case 'release':
      await releaseEntry(deps, campaignId, scene, entry);
      entry.status = 'done';
      next = { ...card, status: 'released', byName: user.name };
      break;
    case 'skip':
      entry.status = 'skipped';
      next = { ...card, status: 'skipped', byName: user.name };
      break;
    case 'defer': {
      const combat = await loadCombat(prisma, scene.id);
      const round = Math.max(card.round, combat?.round ?? card.round) + 1;
      entry.status = 'planned';
      entry.dueRound = round;
      next = { ...card, status: 'deferred', deferredTo: round, byName: user.name };
      break;
    }
  }
  // Wykonanie mogło zmienić scenę (posiłki) — plan czyta się świeżo i podmienia wiersz.
  const fresh = await prisma.scene.findUnique({ where: { id: scene.id } });
  const latest = (fresh ? readScenePlan(fresh) : plan).map((row) =>
    row.id === entry.id ? entry : row,
  );
  await savePlan(prisma, scene.id, latest);
  await updateCard(deps, campaignId, messageId, next);
  await emitChase(deps, campaignId, scene.id);
}
