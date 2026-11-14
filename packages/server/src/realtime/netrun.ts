import type {
  ChatMessageView,
  CpredNetPosition,
  CpredNetRunState,
  CpredNetRuntime,
  NetAbilityId,
  NetAccessPointClearPayload,
  NetForgetScenePayload,
  NetForgetSceneResult,
  NetAccessPointIdPayload,
  NetAccessPointPlacePayload,
  NetAccessPointUpdatePayload,
  NetAccessPointView,
  NetRunAbilityPayload,
  NetScanPayload,
  NetRunAbilityResult,
  NetRunCopyPayload,
  NetRunIdPayload,
  NetRunMovePayload,
  NetRunPayload,
  NetRunStartPayload,
  RollBreakdownEntry,
  RollFormula,
  RollGesture,
  RollResult,
  SessionUser,
} from '@vtt/shared';
import {
  CPRED_ACTION_NET,
  CPRED_ACTION_SCANNER,
  NET_ACCESS_RANGE_M,
  NET_RUN_PROBLEM_MESSAGES,
  ROLE_GM,
  cpredInterfaceRank,
  freshNetCombat,
  freshNetDemonState,
  freshNetRun,
  metresBetween,
  netAbility,
  netAbilityBonuses,
  netCanMove,
  netEntryPosition,
  netFloorAt,
  netGlueHolds,
  netIsBottom,
  netMove,
  netMoveAllowedFor,
  netMoveGoesDeeper,
  netMoveRefusal,
  netScoutReveal,
  parseCharacterData,
  readNetRuntime,
  netTrySpent,
  netTrySpentBy,
  netRecordTry,
  netCloakState,
  netRecordCloak,
  netCloakWatcher,
  netCloakPlan,
  netDifficultyDv,
  netrunningDataOf,
  NET_CLOAK_EASY_DV,
  netClearTries,
  netForgetScene,
  netRestoreRun,
  readNetRunState,
  netForgetHold,
  rollFormula,
  tokenCentre,
  tokenTableName,
} from '@vtt/shared';
import type { Character, Token } from '../generated/prisma/client.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { spendCharacterLuck } from './character-rolls.js';
import { netLuckBonus, netLuckOf, requireNetLuck } from './net-luck.js';
import { rememberDeletion, scalarRow } from './undo-buffer.js';
import { emitTokensById, requireCampaignToken } from './tokens.js';
import { requireCampaignScene, toSceneView } from './scenes.js';
import { requireTurnSpend } from './combat-actions.js';
import { sheetSituationModifiers } from '../sheets.js';
import { createMixedRng } from './dice-rng.js';
import { sanitizeGesture } from './chat.js';
import { sceneNetArchitecture } from './net-scene.js';
import { INCLUDE_CHAT_NAMES, deliverRollMessage, toChatMessageView } from './chat-io.js';
import {
  architectureOf,
  controlsRun,
  emitAccessPoints,
  emitRuns,
  fetchRunsFor,
  loadRunForToken,
  logNetLine,
  logNetLineWithSecret,
  loadRunRow,
  netAccessVerdict,
  netActionsForRun,
  readFullRun,
  releaseNodeHold,
  rivalNodeHold,
  runnerOwnerOf,
  saveRunState,
  saveRuntime,
  updateRuntime,
  netLeaveFloors,
  runOwnerOf,
  rememberRun,
  toAccessPointView,
} from './netrun-io.js';
import { dropRunFromQueue, emergencyJackOut, type FullRunState } from './netice.js';
import { postExchange, rollExchange, roundOfScene, spawnIceOnFloors } from './netcombat.js';
import { netrunnerControlDv, releaseDemonHold, spawnDemons } from './netdemons.js';
import { answerNetDefense } from './net-defense.js';
import { raiseTracesAlarm } from './net-encounter.js';
import { refuseMoveBeforeSightedFight } from './foe-sighting.js';

/**
 * The run (stage 26b) — jacking in, walking the shaft and the seven Interface
 * abilities that are not a fight.
 *
 * Three decisions are worth reading before the code:
 *
 *  1. **Every Check is one roll.** `Interfejs + 1k10 przeciw PT` (s. 199) with
 *     the exploding ten, like every other Check in this project. The abilities
 *     differ only in where the DV comes from and what a success writes down, so
 *     they share `runAbility` and split at the very end.
 *  2. **Chat says two different things to two audiences.** The netrunner and the
 *     GM get the roll card with its DV („Backdoor · PT 8"); the table gets one
 *     line saying it happened. „Reszta stołu widzi skrót działań netrunnera, nie
 *     zawartość Architektury" is a rule about payloads, not about styling.
 *  3. **Nothing is measured twice.** The 6 m and the wall come from
 *     `netAccessVerdict`, which is the shooting geometry of 16b; the Net Action
 *     budget comes from `requireTurnSpend`, which is the action economy of 14b.
 *     Stage 26b adds no second opinion about either.
 */

const ACCESS_POINT_NAME_MAX = 60;
const ACCESS_POINT_NOTES_MAX = 500;
const VIRUS_DESCRIPTION_MAX = 500;
const VIRUS_ACTIONS_MAX = 20;
const ACCESS_POINTS_PER_SCENE_MAX = 24;

function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

function text(raw: unknown, max: number): string {
  return typeof raw === 'string' ? raw.trim().slice(0, max) : '';
}

// ─────────────────────────── punkty dostępu (MG) ───────────────────────────

export const netPointPlaceEvent = defineEvent<NetAccessPointPlacePayload, NetAccessPointView>({
  name: 'netpoint:place',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const scene = await requireCampaignScene(deps.ctx.prisma, campaignId, payload?.sceneId);
    if (typeof payload?.x !== 'number' || typeof payload?.y !== 'number') {
      throw new RealtimeError('BAD_REQUEST');
    }
    const count = await deps.ctx.prisma.netAccessPoint.count({ where: { sceneId: scene.id } });
    if (count >= ACCESS_POINTS_PER_SCENE_MAX) throw new RealtimeError('TOO_MANY_ACCESS_POINTS');

    const architectureId = await resolveArchitectureId(deps, campaignId, payload?.architectureId);
    const row = await deps.ctx.prisma.netAccessPoint.create({
      data: {
        sceneId: scene.id,
        x: payload.x,
        y: payload.y,
        name: text(payload?.name, ACCESS_POINT_NAME_MAX) || 'Punkt dostępu',
        architectureId,
        // Hidden by default: „Skaner … znajdujesz położenie punktów dostępu"
        // only means something when there was something to find.
        hidden: payload?.hidden !== false,
      },
      include: { architecture: { select: { name: true } } },
    });
    await emitAccessPoints(deps, campaignId, scene.id);
    return toAccessPointView(row, true);
  },
});

/**
 * Nowe położenie gniazda albo `null`, gdy patch go nie rusza (etap 27l).
 *
 * Brakujące pole bierze się z wiersza, tak samo jak przy prostokącie osłony:
 * uchwyt przesuwa gniazdo w dwóch osiach naraz, a patch z jedną liczbą jest
 * chybionym gestem, nie prośbą o przesunięcie po linii.
 */
function accessPointPosition(
  payload: NetAccessPointUpdatePayload | undefined,
  row: { x: number; y: number },
): { x: number; y: number } | null {
  if (payload?.x === undefined && payload?.y === undefined) return null;
  const x = payload.x ?? row.x;
  const y = payload.y ?? row.y;
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new RealtimeError('BAD_REQUEST');
  return { x: Math.round(x), y: Math.round(y) };
}

export const netPointUpdateEvent = defineEvent<NetAccessPointUpdatePayload, NetAccessPointView>({
  name: 'netpoint:update',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const row = await requireAccessPoint(deps, campaignId, payload?.id);
    const architectureId =
      payload?.architectureId === undefined
        ? undefined
        : await resolveArchitectureId(deps, campaignId, payload.architectureId);
    const position = accessPointPosition(payload, row);
    const updated = await deps.ctx.prisma.netAccessPoint.update({
      where: { id: row.id },
      data: {
        ...(payload?.name !== undefined
          ? { name: text(payload.name, ACCESS_POINT_NAME_MAX) || 'Punkt dostępu' }
          : {}),
        ...(architectureId !== undefined ? { architectureId } : {}),
        ...(payload?.hidden !== undefined ? { hidden: payload.hidden === true } : {}),
        ...(payload?.notes !== undefined
          ? { notes: text(payload.notes, ACCESS_POINT_NOTES_MAX) }
          : {}),
        // Przesunięcie gniazda (etap 27l). Para, nie dwa osobne pola: gniazdo
        // z nowym X i starym Y wylądowałoby na ścianie obok tej, na której
        // wisi — a zasięg podłączenia liczy się od tego punktu.
        ...(position ?? {}),
      },
      include: { architecture: { select: { name: true } } },
    });
    await emitAccessPoints(deps, campaignId, row.sceneId);
    return toAccessPointView(updated, true);
  },
});

export const netPointRemoveEvent = defineEvent<NetAccessPointIdPayload, void>({
  name: 'netpoint:remove',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const row = await requireAccessPoint(deps, campaignId, payload?.id);
    // Runs hanging off this socket end with it — the cable was pulled.
    const orphaned = await deps.ctx.prisma.netRun.findMany({ where: { accessPointId: row.id } });
    for (const run of orphaned) await dropRunFromQueue(deps, campaignId, run.id);
    await deps.ctx.prisma.netRun.deleteMany({ where: { accessPointId: row.id } });
    // Cofnięcie przywraca **samo gniazdo** — zerwany run zostaje zerwany.
    // Świadome uproszczenie z 27k: run niesie stan walki w Sieci, a wskrzeszenie
    // go razem z kablem znaczyłoby odtworzenie tury, którą wszyscy już widzieli.
    rememberDeletion({
      campaignId,
      userId: user.id,
      sceneId: row.sceneId,
      kind: 'netpoint',
      rows: [scalarRow(row)],
    });
    await deps.ctx.prisma.netAccessPoint.delete({ where: { id: row.id } });
    await emitAccessPoints(deps, campaignId, row.sceneId);
    if (orphaned.length > 0) await emitRuns(deps, campaignId);
  },
});

/** Kosz warstwy gniazd (etap 27k) — bliźniak `light:clear`, z tą samą regułą. */
export const netPointClearEvent = defineEvent<NetAccessPointClearPayload, void>({
  name: 'netpoint:clear',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const scene = await requireCampaignScene(deps.ctx.prisma, campaignId, payload?.sceneId);
    const doomed = await deps.ctx.prisma.netAccessPoint.findMany({ where: { sceneId: scene.id } });
    if (doomed.length === 0) return;
    const ids = doomed.map((point) => point.id);
    const orphaned = await deps.ctx.prisma.netRun.findMany({
      where: { accessPointId: { in: ids } },
    });
    for (const run of orphaned) await dropRunFromQueue(deps, campaignId, run.id);
    await deps.ctx.prisma.netRun.deleteMany({ where: { accessPointId: { in: ids } } });
    rememberDeletion({
      campaignId,
      userId: user.id,
      sceneId: scene.id,
      kind: 'netpoint',
      rows: doomed.map(scalarRow),
    });
    await deps.ctx.prisma.netAccessPoint.deleteMany({ where: { sceneId: scene.id } });
    await emitAccessPoints(deps, campaignId, scene.id);
    if (orphaned.length > 0) await emitRuns(deps, campaignId);
  },
});

async function requireAccessPoint(deps: RealtimeDeps, campaignId: string, id: unknown) {
  if (typeof id !== 'number' || !Number.isInteger(id)) throw new RealtimeError('BAD_REQUEST');
  const row = await deps.ctx.prisma.netAccessPoint.findUnique({
    where: { id },
    include: { scene: { select: { campaignId: true } } },
  });
  if (!row || row.scene.campaignId !== campaignId)
    throw new RealtimeError('ACCESS_POINT_NOT_FOUND');
  return row;
}

async function resolveArchitectureId(
  deps: RealtimeDeps,
  campaignId: string,
  raw: unknown,
): Promise<string | null> {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw !== 'string') throw new RealtimeError('BAD_REQUEST');
  const row = await deps.ctx.prisma.netArchitecture.findUnique({
    where: { id: raw },
    select: { campaignId: true },
  });
  if (!row || row.campaignId !== campaignId) throw new RealtimeError('ARCHITECTURE_NOT_FOUND');
  return raw;
}

// ────────────────────────────── podłączenie ──────────────────────────────

export const netRunStartEvent = defineEvent<NetRunStartPayload, NetRunPayload>({
  name: 'netrun:start',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const { token, scene } = await requireCampaignToken(
      deps.ctx.prisma,
      campaignId,
      payload?.tokenId,
    );
    if (user.role !== ROLE_GM && token.ownerId !== user.id) throw new RealtimeError('FORBIDDEN');
    const character = await requireNetrunner(deps, token);

    const point = await requireAccessPoint(deps, campaignId, payload?.accessPointId);
    if (point.sceneId !== scene.id) throw new RealtimeError('ACCESS_POINT_NOT_FOUND');
    // A player must not confirm a socket they have not found by naming its id.
    if (point.hidden && user.role !== ROLE_GM) throw new RealtimeError('ACCESS_POINT_NOT_FOUND');

    const existing = await loadRunForToken(deps.ctx.prisma, token.id);
    if (existing) throw new RealtimeError('NET_ALREADY_JACKED');

    const verdict = await netAccessVerdict(deps.ctx.prisma, scene, token, point);
    if (!verdict.ok) {
      throw new RealtimeError(verdict.reason === 'wall' ? 'NET_WALL_BLOCKS' : 'NET_OUT_OF_RANGE');
    }

    // Etap 62: figury z ikoną urządzenia są urządzeniami Sieci — gniazdo bez
    // Architektury składa Sieć ze sceny, a do gotowej dochodzą niepodpięte.
    const architecture = await sceneNetArchitecture(deps, campaignId, scene, point);
    const entry = netEntryPosition(architecture);
    if (!entry) throw new RealtimeError('NET_ARCHITECTURE_EMPTY');

    // Jacking in is itself a Net Action (s. 198) — the first of the turn, so it
    // is what claims the Action a Soma attack would otherwise have taken.
    const { actions } = await netActionsForRun(deps.ctx.prisma, deps.ctx.cpred, character.id);
    await requireTurnSpend(
      deps,
      campaignId,
      scene,
      token.id,
      { kind: 'net', label: 'Podłączenie', max: Math.max(1, actions) },
      user,
      CPRED_ACTION_NET,
      { silent: true },
    );

    const entryFloor = netFloorAt(architecture, entry);
    // Every half from the start (26c, 26e): a run with no `rezzed` list is a run
    // whose first Program would have nowhere to go.
    let state: FullRunState = {
      ...freshNetRun(entry, entryFloor?.id ?? ''),
      ...freshNetCombat(),
      ...freshNetDemonState(),
    };
    if (entryFloor?.id) {
      state = await spawnIceOnFloors(deps, campaignId, architecture, state, [entryFloor.id]);
    }
    // A Black ICE is met by opening its door; a Demon is simply there from the
    // moment somebody jacks in — „wie o wszystkim, co dzieje się w jego
    // Architekturze" (s. 212). The netrunner does not see it until it hunts.
    state = await spawnDemons(deps, campaignId, architecture, state);
    // Zlecenie MG z 02.11: what this character already did here on this scene
    // comes back — broken passwords, read Files, scouted floors, held nodes
    // (unless another run holds one now; the Demon lets go of the rest).
    const others = await deps.ctx.prisma.netRun.findMany({
      where: { architectureId: architecture.id },
      select: { data: true },
    });
    const heldByOthers = new Set(
      others.flatMap(
        (other) => readNetRunState(other.data)?.controlled.map((h) => h.floorId) ?? [],
      ),
    );
    const architectureRow = await deps.ctx.prisma.netArchitecture.findUnique({
      where: { id: architecture.id },
      select: { runtime: true },
    });
    const restored = netRestoreRun(
      state,
      readNetRuntime(architectureRow?.runtime ?? '{}'),
      { characterId: character.id, sceneId: scene.id },
      (floorId) => heldByOthers.has(floorId),
    );
    state = restored.state;
    for (const floorId of restored.restoredHolds) state = releaseDemonHold(state, floorId);
    const created = await deps.ctx.prisma.netRun.create({
      data: {
        campaignId,
        architectureId: architecture.id,
        accessPointId: point.id,
        tokenId: token.id,
        characterId: character.id,
        data: JSON.stringify(state),
      },
    });

    await logNetLine(
      deps,
      campaignId,
      user,
      tokenTableName(token, character.name),
      'Podłączenie do Sieci',
      point.name,
    );
    await emitRuns(deps, campaignId);
    const mine = await myRun(deps, campaignId, token.id, user);
    if (!mine) throw new RealtimeError('NET_NOT_JACKED');
    // Etap 70e: piętro wejścia to pierwsze piętro, na którym netrunner staje —
    // czyhający tam LOD wykrywa, a Demon z tego piętra zaczyna ścigać.
    if (!entryFloor?.id) return mine;
    const answered = await answerNetDefense(deps, {
      campaignId,
      user,
      runId: created.id,
      cue: { kind: 'entered', floorIds: [entryFloor.id] },
    });
    return answered ? ((await myRun(deps, campaignId, token.id, user)) ?? mine) : mine;
  },
});

export const netRunLeaveEvent = defineEvent<NetRunIdPayload, void>({
  name: 'netrun:leave',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const { row, state } = await requireRun(deps, campaignId, user, payload?.runId);
    const { scene, token } = await requireCampaignToken(deps.ctx.prisma, campaignId, row.tokenId);

    // „Nie może … bezpiecznie się odłączyć (choć wciąż może wykonać awaryjne
    // odłączenie)" (s. 204) — the glue closes this door, never the other one.
    if (netGlueHolds(state, await roundOfScene(deps, scene.id))) {
      throw new RealtimeError('NET_GLUED');
    }

    const { actions } = await netActionsForRun(deps.ctx.prisma, deps.ctx.cpred, row.characterId);
    await requireTurnSpend(
      deps,
      campaignId,
      scene,
      token.id,
      { kind: 'net', label: 'Odłączenie', max: Math.max(1, actions) },
      user,
      CPRED_ACTION_NET,
      { silent: true },
    );

    await deps.ctx.prisma.netRun.delete({ where: { id: row.id } });
    // „Odłączenie resetuje obronę Architektury" — a Black ICE that was chasing
    // this run leaves the initiative queue with it (stage 26c).
    await dropRunFromQueue(deps, campaignId, row.id);
    await logNetLine(
      deps,
      campaignId,
      user,
      tokenTableName(row.token, row.token.character?.name ?? row.token.name),
      'Odłączenie od Sieci',
      'bezpieczne — obrona Architektury wraca do stanu wyjściowego',
    );
    await emitRuns(deps, campaignId);
  },
});

// ─────────────────────────────── ruch po szybie ───────────────────────────────

export const netRunMoveEvent = defineEvent<NetRunMovePayload, NetRunPayload>({
  name: 'netrun:move',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const { row, architecture, state } = await requireRun(deps, campaignId, user, payload?.runId);
    const to = payload?.to as CpredNetPosition | undefined;
    if (!to || typeof to.branchId !== 'string' || !Number.isInteger(to.floor)) {
      throw new RealtimeError('BAD_REQUEST');
    }

    // Etap 70a: gracz jeździ tylko po śladzie i przez wyjścia piętra, na którym
    // stoi. Pytane **przed** `netCanMove` i z odmową piętra, którego nie ma —
    // inaczej hasło na trasie odróżniałoby „jest głębiej” od „nie ma” i szyb
    // dałoby się wymacać żądaniami. MG rusza netrunnerem bez tego ograniczenia.
    if (user.role !== ROLE_GM && !netMoveAllowedFor(architecture, state, to)) {
      throw new RealtimeError(NET_RUN_PROBLEM_MESSAGES.NET_NO_SUCH_FLOOR);
    }
    const verdict = netCanMove(architecture, state, to);
    if (!verdict.ok || !verdict.path) throw new RealtimeError(netMoveRefusal(verdict));

    // „Przez 1k6 Rund wrogi Netrunner nie może zejść na niższe poziomy
    // Architektury" (s. 204, stage 26c). Only downwards: the glue holds you in
    // place going deeper, it does not stop you climbing out.
    const { scene } = await requireCampaignToken(deps.ctx.prisma, campaignId, row.tokenId);
    // Starcie z wykrycia czeka na MG (14.11): drużyna stoi — w Sieci też.
    await refuseMoveBeforeSightedFight(deps, scene.id, user);
    const round = await roundOfScene(deps, scene.id);
    if (netGlueHolds(state, round) && netMoveGoesDeeper(architecture, state.position, to)) {
      throw new RealtimeError('NET_GLUED');
    }

    // „Poruszanie się w Architekturze Sieciowej" costs nothing (s. 198) — the
    // only thing it spends is the secrecy of the floors walked through.
    const floorIds = verdict.path
      .map((step) => netFloorAt(architecture, step)?.id)
      .filter((id): id is string => typeof id === 'string');
    let next: FullRunState = { ...state, ...netMove(state, verdict.path, floorIds) };
    // Opening a door is what puts a Black ICE in the shaft (stage 26c); since
    // stage 70e the defence answers it by itself, unless the GM holds the brake.
    next = await spawnIceOnFloors(deps, campaignId, architecture, next, floorIds);
    next = { ...next, ...rememberIce(next, architecture, floorIds) };
    await saveRunState(deps.ctx.prisma, row.id, next);
    await leaveCloaks(deps, campaignId, row, scene.id, floorIds.at(-1) ?? null, next.entered);
    await emitRuns(deps, campaignId);
    const moved = await requireMyRun(deps, campaignId, row.tokenId, user);
    const answered = await answerNetDefense(deps, {
      campaignId,
      user,
      runId: row.id,
      cue: { kind: 'entered', floorIds },
    });
    // A free hit may have thrown the netrunner out: the reply then stays the
    // one from before it, and the closed window follows from `netrun:sync`.
    return answered ? ((await myRun(deps, campaignId, row.tokenId, user)) ?? moved) : moved;
  },
});

/** „Zapisanie kopii Pliku na twoim cyberdeku nie zużywa Akcji Sieciowej." */
export const netRunCopyEvent = defineEvent<NetRunCopyPayload, NetRunPayload>({
  name: 'netrun:copy',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const { row, architecture, state } = await requireRun(deps, campaignId, user, payload?.runId);
    const floor = netFloorAt(architecture, state.position);
    if (!floor || floor.kind !== 'file' || floor.id !== payload?.floorId) {
      throw new RealtimeError('NET_WRONG_FLOOR');
    }
    if (!state.copied.includes(floor.id)) {
      await saveRunState(deps.ctx.prisma, row.id, {
        ...state,
        copied: [...state.copied, floor.id],
      });
      await rememberRun(deps.ctx.prisma, row.id);
    }
    // Etykieta Pliku to zawartość Architektury — widzą ją MG i netrunner (#37).
    await logNetLineWithSecret(deps, campaignId, user, {
      actorName: tokenTableName(row.token, row.token.character?.name ?? row.token.name),
      actionName: 'Kopia Pliku',
      publicNote: '',
      secretNote: floor.label,
      runnerOwnerId: runnerOwnerOf(row),
    });
    await emitRuns(deps, campaignId);
    return requireMyRun(deps, campaignId, row.tokenId, user);
  },
});

// ───────────────────────────── zdolności Interfejsu ─────────────────────────────

export const netRunAbilityEvent = defineEvent<NetRunAbilityPayload, NetRunAbilityResult>({
  name: 'netrun:ability',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const ability = netAbility(String(payload?.ability ?? ''));
    if (!ability) throw new RealtimeError('NET_ABILITY_UNKNOWN');
    if (ability.combat) throw new RealtimeError('NET_ABILITY_LATER');
    if (ability.id === 'scanner') throw new RealtimeError('BAD_REQUEST');

    const { row, architecture, state } = await requireRun(deps, campaignId, user, payload?.runId);
    const { scene, token } = await requireCampaignToken(deps.ctx.prisma, campaignId, row.tokenId);
    const character = await deps.ctx.prisma.character.findUnique({
      where: { id: row.characterId },
    });
    if (!character) throw new RealtimeError('CHARACTER_NOT_FOUND');

    // Still within reach of the socket? A netrunner who walked away is not
    // refused an ability — they are thrown out, which is the rule (s. 198).
    const point = await deps.ctx.prisma.netAccessPoint.findUnique({
      where: { id: row.accessPointId },
    });
    const reach = point
      ? await netAccessVerdict(deps.ctx.prisma, scene, token, point)
      : ({ ok: false, reason: 'range' } as const);
    if (!reach.ok) {
      // Stage 26c turned this into the beating the rules promise: the effects
      // of every Black ICE still running that this entry has met (s. 198).
      const bill = await emergencyJackOut(deps, {
        campaignId,
        user,
        runId: row.id,
        reason:
          reach.reason === 'wall'
            ? 'ściana odcięła połączenie z punktem dostępu'
            : `poza zasięgiem punktu dostępu (${NET_ACCESS_RANGE_M} m)`,
        round: await roundOfScene(deps, scene.id),
        rng: createMixedRng(),
      });
      if (bill.tokenIds.length > 0) await emitTokensById(deps, campaignId, bill.tokenIds);
      throw new RealtimeError(reach.reason === 'wall' ? 'NET_WALL_BLOCKS' : 'NET_OUT_OF_RANGE');
    }

    const floor = netFloorAt(architecture, state.position);
    if (ability.floorKind && floor?.kind !== ability.floorKind) {
      throw new RealtimeError('NET_WRONG_FLOOR');
    }
    if (ability.id === 'virus' && !netIsBottom(architecture, state.position)) {
      throw new RealtimeError('NET_NOT_BOTTOM');
    }
    // Zlecenia MG z 02.11: one try per character and scene, as `NET_TRY_LIMITS`
    // counts it. Checked before the Net Action is spent — and for the Virus
    // before the first step is written — so the refusal costs nothing.
    const hacker = { characterId: row.characterId, sceneId: scene.id };
    if (netTrySpent(readNetRuntime(row.architecture.runtime), hacker, ability.id, floor?.id)) {
      throw new RealtimeError(ability.floorKind ? 'NET_HACK_FAILED' : 'NET_TRY_SPENT');
    }

    const rank = readInterfaceRank(deps, character);
    const luck = netLuckOf(payload?.luckSpent);
    await requireNetLuck(deps, character.id, luck);
    const { actions } = await netActionsForRun(deps.ctx.prisma, deps.ctx.cpred, row.characterId);
    // Zasada domowa MG z 14.11: Maskowanie piętro po piętrze, próby w jednej
    // Turze. Odmowa przed Akcją Sieciową, jak przy zużytej próbie.
    const round = await roundOfScene(deps, scene.id);
    if (ability.id === 'cloak' && floor) {
      const status = netCloakState(
        readNetRuntime(row.architecture.runtime),
        hacker,
        floor.id,
        round,
        actions,
      );
      if (status === 'masked') throw new RealtimeError('NET_CLOAK_DONE');
      if (status === 'failed') throw new RealtimeError('NET_CLOAK_FAILED');
    }
    await requireTurnSpend(
      deps,
      campaignId,
      scene,
      token.id,
      { kind: 'net', label: ability.name, max: Math.max(1, actions) },
      user,
      CPRED_ACTION_NET,
      { silent: true },
    );

    // The Virus is written across several Turns: every Net Action but the last
    // buys a step, and only the final one is rolled (s. 200).
    if (ability.id === 'virus') {
      const pending = await advanceVirus(deps, row.id, state, payload?.virus);
      if (pending) {
        await emitRuns(deps, campaignId);
        const line = `Wirus — pisanie ${pending.actionsSpent}/${pending.actionsNeeded} Akcji Sieciowych`;
        const message = await logNetLine(
          deps,
          campaignId,
          user,
          tokenTableName(token, character.name),
          'Wirus',
          line,
        );
        return { messageId: message.id, total: 0, success: false, summary: line };
      }
    }

    // Szczęście przepada przy kościach, także nieudanych (s. 74) — więc dopiero
    // tu, gdy wiadomo, że ta Akcja naprawdę rzuca (nie krok pisania Wirusa).
    await spendCharacterLuck(deps, campaignId, character.id, luck);

    if (ability.id === 'cloak' && floor) {
      return cloakFloor(deps, {
        campaignId,
        user,
        row,
        state,
        floorId: floor.id,
        hacker,
        round,
        maxTries: actions,
        character,
        actorName: tokenTableName(token, character.name),
        rank,
        luck,
        ...(payload?.gesture ? { gesture: payload.gesture } : {}),
      });
    }

    // Stage 26d: a node somebody else already holds is taken off *them*, and
    // „PT odebrania … równe wartości Testu Kontroli, jaki wykonano" (s. 199)
    // means the rival's total, not the node's printed DV. Stage 26e adds the
    // third holder — the Architecture's own Demon, which starts out holding
    // every node there is.
    const rival =
      ability.id === 'control' && floor
        ? await rivalNodeHold(deps.ctx.prisma, row.architectureId, floor.id, row.id)
        : null;
    // The Virus is rolled against the DV the GM named when writing began
    // („PT określa MG", s. 200) — `advanceVirus` has just put it on `state`.
    // Before 02.11 it fell through to `abilityDv` as null and never failed.
    const dv =
      ability.id === 'control' && floor
        ? netrunnerControlDv(state, floor.id, floor.dv, rival?.dv)
        : ability.id === 'virus'
          ? (state.virus?.dv ?? null)
          : abilityDv(ability.id, floor?.dv);
    const roll = performInterfaceRoll(
      deps,
      character,
      tokenTableName(token, character.name),
      rank,
      ability.name,
      dv,
      payload?.gesture,
      [...netAbilityBonuses(state, ability.id), ...netLuckBonus(luck)],
    );
    const success = dv === null ? true : roll.total > dv;

    const outcome = await applyAbility(deps, {
      abilityId: ability.id,
      campaignId,
      run: row,
      architecture,
      state,
      total: roll.total,
      success,
      author: tokenTableName(token, character.name),
      dv,
      ...(rival ? { rival } : {}),
    });

    if (netTrySpentBy(ability.id, success)) {
      // Fresh row: `applyAbility` may have just written the runtime itself.
      await updateRuntime(deps.ctx.prisma, row.architectureId, (runtime) =>
        netRecordTry(runtime, hacker, ability.id, floor?.id),
      );
    }
    // …and a success is remembered, so a reconnection does not undo it.
    if (success) await rememberRun(deps.ctx.prisma, row.id);

    roll.outcome = {
      success,
      label: success ? `${ability.name} — udany` : `${ability.name} — nieudany`,
      detail: outcome.detail,
    };
    const stored = await deps.ctx.prisma.chatMessage.create({
      data: {
        campaignId,
        authorId: user.id,
        // GM-only card: it carries the DV, and a DV is the Architecture's own
        // secret. The table gets the public line below instead.
        kind: 'gmroll',
        text: roll.title ?? ability.name,
        payload: JSON.stringify(roll),
        sceneId: scene.id,
      },
      include: INCLUDE_CHAT_NAMES,
    });
    const view: ChatMessageView = toChatMessageView(stored);
    await deliverRollMessage(deps, campaignId, user.id, view);
    await logNetLine(
      deps,
      campaignId,
      user,
      tokenTableName(token, character.name),
      ability.name,
      success ? 'udane' : 'nieudane',
    );
    await emitRuns(deps, campaignId);
    // Etap 70e: Demon broni węzłów — przejęcie któregokolwiek go budzi.
    if (ability.id === 'control' && success && floor) {
      await answerNetDefense(deps, {
        campaignId,
        user,
        runId: row.id,
        cue: { kind: 'controlled', floorId: floor.id },
      });
    }
    return { messageId: view.id, total: roll.total, success, summary: outcome.summary };
  },
});

/**
 * The Scanner (s. 199) — the one ability with no run behind it, because its
 * whole job is finding something to run against.
 *
 * „MG określa dokładną liczbę znalezionych punktów dostępu" is the rulebook
 * leaving this to the table. The VTT needs a number, so it takes the Check's own
 * total as a radius in metres — high roll, wider sweep — and leaves the GM the
 * eye on every socket to reveal by hand. That reading is the VTT's, not RAW's.
 */
export const netScanEvent = defineEvent<NetScanPayload, NetRunAbilityResult>({
  name: 'netrun:scan',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const { token, scene } = await requireCampaignToken(
      deps.ctx.prisma,
      campaignId,
      payload?.tokenId,
    );
    if (user.role !== ROLE_GM && token.ownerId !== user.id) throw new RealtimeError('FORBIDDEN');
    const character = await requireNetrunner(deps, token);
    const rank = readInterfaceRank(deps, character);
    const luck = netLuckOf(payload?.luckSpent);
    await requireNetLuck(deps, character.id, luck);

    await requireTurnSpend(
      deps,
      campaignId,
      scene,
      token.id,
      { kind: 'action', actionId: CPRED_ACTION_SCANNER },
      user,
      CPRED_ACTION_SCANNER,
      { silent: true },
    );

    await spendCharacterLuck(deps, campaignId, character.id, luck);
    const roll = performInterfaceRoll(
      deps,
      character,
      tokenTableName(token, character.name),
      rank,
      'Skaner',
      null,
      payload?.gesture,
      netLuckBonus(luck),
    );
    const view = toSceneView(scene);
    const centre = tokenCentre({ x: token.x, y: token.y, size: token.size }, view);
    const hidden = await deps.ctx.prisma.netAccessPoint.findMany({
      where: { sceneId: scene.id, hidden: true },
    });
    const found = hidden.filter(
      (point) => metresBetween(centre, { x: point.x, y: point.y }, view) <= roll.total,
    );
    if (found.length > 0) {
      await deps.ctx.prisma.netAccessPoint.updateMany({
        where: { id: { in: found.map((point) => point.id) } },
        data: { hidden: false },
      });
      await emitAccessPoints(deps, campaignId, scene.id);
    }

    const summary =
      found.length === 0
        ? `Zasięg ${roll.total} m — nic w promieniu skanu.`
        : `Zasięg ${roll.total} m — znalezione: ${found.map((point) => point.name).join(', ')}.`;
    roll.outcome = { success: found.length > 0, label: 'Skaner', detail: summary };
    const stored = await deps.ctx.prisma.chatMessage.create({
      data: {
        campaignId,
        authorId: user.id,
        kind: 'gmroll',
        text: 'Skaner',
        payload: JSON.stringify(roll),
        sceneId: scene.id,
      },
      include: INCLUDE_CHAT_NAMES,
    });
    const message = toChatMessageView(stored);
    await deliverRollMessage(deps, campaignId, user.id, message);
    await logNetLine(
      deps,
      campaignId,
      user,
      tokenTableName(token, character.name),
      'Skaner',
      found.length === 0 ? 'nic nie znalazł' : `znalazł ${found.length}`,
    );
    return { messageId: message.id, total: roll.total, success: found.length > 0, summary };
  },
});

// ──────────────────────────────── mechanika ────────────────────────────────

/**
 * Which DV this ability is rolled against; null = the total *is* the answer.
 *
 * Kontrola is deliberately not here: since 26d its DV depends on who is holding
 * the node and since 26e on whether a Demon has rolled for it, so it is worked
 * out at the call site by `netrunnerControlDv`, which can see the run's state.
 */
function abilityDv(id: NetAbilityId, floorDv: number | undefined): number | null {
  if (id === 'backdoor' || id === 'eyed') return floorDv ?? null;
  return null;
}

interface AbilityContext {
  abilityId: NetAbilityId;
  campaignId: string;
  run: { id: string; architectureId: string; architecture: { runtime: string } };
  architecture: NonNullable<ReturnType<typeof architectureOf>>;
  state: FullRunState;
  total: number;
  success: boolean;
  author: string;
  /** The DV that was actually rolled against — computed once, at the call site. */
  dv: number | null;
  /** Stage 26d: the run this node is being taken off, when there is one. */
  rival?: { runId: string; dv: number };
}

/** What a success writes down — the only place the seven abilities differ. */
async function applyAbility(
  deps: RealtimeDeps,
  context: AbilityContext,
): Promise<{ summary: string; detail: string }> {
  const { abilityId, state, total, success } = context;
  const floor = netFloorAt(context.architecture, state.position);

  if (abilityId === 'scout') {
    const revealed = netScoutReveal(context.architecture, state, total);
    await saveRunState(deps.ctx.prisma, context.run.id, {
      ...state,
      scouted: [...new Set([...state.scouted, ...revealed])],
    });
    const summary =
      revealed.length === 0
        ? 'Nic nowego poniżej — albo już to znasz, albo hasło pod stopami zasłania widok.'
        : revealed.length === 1
          ? 'Odsłonięte piętro poniżej.'
          : `Odsłonięte piętra poniżej: ${revealed.length} (rozwidlenie).`;
    return { summary, detail: summary };
  }

  if (abilityId === 'backdoor') {
    if (!success || !floor) {
      return {
        summary: 'Hasło się broni.',
        detail: `PT ${floor?.dv ?? '?'} — hasło nie ustąpiło.`,
      };
    }
    await saveRunState(deps.ctx.prisma, context.run.id, {
      ...state,
      broken: [...new Set([...state.broken, floor.id])],
    });
    return { summary: 'Hasło złamane — droga w dół wolna.', detail: `PT ${floor.dv ?? '?'}` };
  }

  if (abilityId === 'eyed') {
    if (!success || !floor) {
      return { summary: 'Plik nic nie zdradził.', detail: `PT ${floor?.dv ?? '?'}` };
    }
    await saveRunState(deps.ctx.prisma, context.run.id, {
      ...state,
      identified: [...new Set([...state.identified, floor.id])],
    });
    return {
      summary: `Rozpoznany: ${floor.label || 'Plik'}.`,
      detail: floor.notes ? `PT ${floor.dv ?? '?'} · ${floor.notes}` : `PT ${floor.dv ?? '?'}`,
    };
  }

  if (abilityId === 'control') {
    const wanted = context.dv;
    if (!success || !floor) {
      return {
        summary: context.rival ? 'Węzeł został w cudzych rękach.' : 'Węzeł nie ustąpił.',
        detail: `PT ${wanted ?? '?'}`,
      };
    }
    // Stage 26e: the Architecture's own Demon holds every node until somebody
    // takes it, so a successful Kontrola takes it off the defence too — and if
    // the Demon had rolled for this one, its raised DV goes with it.
    const stripped = releaseDemonHold(state, floor.id);
    await saveRunState(deps.ctx.prisma, context.run.id, {
      ...stripped,
      controlled: [
        ...stripped.controlled.filter((hold) => hold.floorId !== floor.id),
        { floorId: floor.id, dv: total },
      ],
    });
    // „Odebranie kontroli" is exactly that: the previous holder stops holding
    // it. Their own run keeps running — only this one node changes hands.
    if (context.rival) {
      await releaseNodeHold(deps.ctx.prisma, context.rival.runId, floor.id);
      // The rival's character does not get the node back by reconnecting.
      const loser = await runOwnerOf(deps.ctx.prisma, context.rival.runId);
      if (loser) {
        await updateRuntime(deps.ctx.prisma, loser.architectureId, (runtime) =>
          netForgetHold(runtime, loser, floor.id),
        );
      }
    }
    return {
      summary: context.rival
        ? `Węzeł odebrany — PT odebrania go tobie: ${total}.`
        : `Węzeł przejęty — PT odebrania go tobie: ${total}.`,
      detail: `PT ${wanted ?? '?'} · kontrola trzyma się do odłączenia`,
    };
  }

  if (abilityId === 'virus') {
    const progress = state.virus;
    if (!progress) return { summary: 'Nie ma czego zostawić.', detail: '' };
    if (!success) {
      // „Kod po prostu nie działa" — the work is lost, not the netrunner.
      await saveRunState(deps.ctx.prisma, context.run.id, { ...state, virus: null });
      return {
        summary: 'Kod nie działa — Wirusa trzeba napisać od nowa.',
        detail: `PT ${progress.dv}`,
      };
    }
    const runtime = readNetRuntime(context.run.architecture.runtime);
    await saveRuntime(deps.ctx.prisma, context.run.architectureId, {
      ...runtime,
      viruses: [
        ...runtime.viruses,
        {
          id: `virus-${Date.now()}`,
          description: progress.description,
          // „PT zniszczenia tego Wirusa jest równe wynikowi rzutu" — the total,
          // not the DV it beat.
          dv: total,
          author: context.author,
          createdAt: new Date().toISOString(),
        },
      ],
    });
    await saveRunState(deps.ctx.prisma, context.run.id, { ...state, virus: null });
    return {
      summary: `Wirus zostawiony — PT jego zniszczenia: ${total}.`,
      detail: `PT ${progress.dv} · ${progress.description}`,
    };
  }

  return { summary: '', detail: '' };
}

/**
 * One step of writing a Virus. Returns the progress when there is still work to
 * do, and null on the Action that finishes it — that one gets rolled.
 */
async function advanceVirus(
  deps: RealtimeDeps,
  runId: string,
  state: CpredNetRunState,
  declared: NetRunAbilityPayload['virus'],
): Promise<CpredNetRunState['virus']> {
  let progress = state.virus;
  if (!progress) {
    const description = text(declared?.description, VIRUS_DESCRIPTION_MAX);
    const dv = declared?.dv;
    const needed = declared?.actions;
    if (!description || typeof dv !== 'number' || !Number.isInteger(dv) || dv < 1) {
      throw new RealtimeError('BAD_REQUEST');
    }
    progress = {
      description,
      dv,
      actionsNeeded:
        typeof needed === 'number' && Number.isInteger(needed)
          ? Math.max(1, Math.min(VIRUS_ACTIONS_MAX, needed))
          : 1,
      actionsSpent: 0,
    };
  }
  const advanced = { ...progress, actionsSpent: progress.actionsSpent + 1 };
  if (advanced.actionsSpent < advanced.actionsNeeded) {
    await saveRunState(deps.ctx.prisma, runId, { ...state, virus: advanced });
    return advanced;
  }
  // The last Action is the one that rolls; `applyAbility` reads this progress.
  await saveRunState(deps.ctx.prisma, runId, { ...state, virus: advanced });
  state.virus = advanced;
  return null;
}

// ───────────────────────────────── Maskowanie ─────────────────────────────────

/**
 * One try of Maskowanie on the floor stood on (zasada domowa MG z 14.11).
 *
 * Against the sharpest Program watching the floor it is a contest
 * (`netCloakWatcher`, `netCloakPlan`); on a floor nothing watches it is an easy
 * DV. The first success masks the floor; the try that spends the Turn's last
 * Net Action without one closes it as failed (`netRecordCloak`). What it
 * changes is a mark on the GM's plan — no defence reacts to it.
 */
async function cloakFloor(
  deps: RealtimeDeps,
  input: {
    campaignId: string;
    user: SessionUser;
    row: Awaited<ReturnType<typeof requireRun>>['row'];
    state: FullRunState;
    floorId: string;
    hacker: { characterId: string; sceneId: string };
    round: number | null;
    maxTries: number;
    character: Character;
    actorName: string;
    rank: number;
    /** Szczęście z kubka, już zdjęte z puli. */
    luck: number;
    gesture?: RollGesture;
  },
): Promise<NetRunAbilityResult> {
  const { campaignId, user, row, state, floorId } = input;
  const watcher = netCloakWatcher(floorId, state.ice, state.demons);
  const bonuses = netAbilityBonuses(state, 'cloak');

  let roll: RollResult;
  let success: boolean;
  let total: number;
  if (watcher) {
    const exchange = rollExchange(netCloakPlan({ interfaceRank: input.rank, bonuses, watcher }), {
      ...(input.gesture ? { gesture: input.gesture } : {}),
      attackerIsHuman: true,
      detail: `zacieranie śladów pod okiem: ${watcher.name}`,
      actor: input.actorName,
      luck: input.luck,
    });
    roll = exchange.roll;
    success = exchange.won;
    total = exchange.attackTotal;
  } else {
    const dv = netDifficultyDv('basic', netrunningDataOf(deps.ctx.cpred)) || NET_CLOAK_EASY_DV;
    roll = performInterfaceRoll(
      deps,
      input.character,
      input.actorName,
      input.rank,
      'Maskowanie',
      dv,
      input.gesture,
      [...bonuses, ...netLuckBonus(input.luck)],
    );
    success = roll.total > dv;
    total = roll.total;
  }

  let runtime: CpredNetRuntime | null = null;
  await updateRuntime(deps.ctx.prisma, row.architectureId, (current) => {
    runtime = netRecordCloak(current, input.hacker, {
      floorId,
      round: input.round,
      maxTries: input.maxTries,
      success,
      total,
    });
    return runtime;
  });
  const record = (runtime as CpredNetRuntime | null)?.cloaks?.find(
    (entry) =>
      entry.floorId === floorId &&
      entry.characterId === input.hacker.characterId &&
      entry.sceneId === input.hacker.sceneId,
  );
  const left = Math.max(1, input.maxTries) - (record?.attempts ?? 0);
  const summary = success
    ? 'Ślady na tym piętrze zatarte.'
    : record?.outcome === 'failed'
      ? 'Maskowanie się nie udało — na tym piętrze ślady zostają.'
      : `Maskowanie się nie udało — w tej Turze ${left === 1 ? 'została jeszcze 1 próba' : `zostały jeszcze próby: ${left}`}.`;

  if (!watcher) {
    roll.outcome = {
      success,
      label: success ? 'Maskowanie — udane' : 'Maskowanie — nieudane',
      detail: summary,
    };
  }
  const message = await postExchange(deps, {
    campaignId,
    user,
    sceneId: input.hacker.sceneId,
    roll,
    runnerOwnerId: runnerOwnerOf(row),
  });
  await logNetLine(
    deps,
    campaignId,
    user,
    input.actorName,
    'Maskowanie',
    success ? 'udane' : 'nieudane',
  );
  // Ostatnia próba bez sukcesu — Sieć wie o intruzie, zaczyna się walka (14.11).
  if (record?.outcome === 'failed') {
    await raiseTracesAlarm(deps, { campaignId, runId: row.id, floorIds: [floorId] });
  }
  await emitRuns(deps, campaignId);
  return { messageId: message.id, total, success, summary };
}

/**
 * A move off a floor ends that floor's Turn of Maskowanie, and the floors
 * stood on go to the memory, so the ones left without Maskowanie stay red
 * after a reconnection (`netLeaveFloors`, 14.11).
 */
async function leaveCloaks(
  deps: RealtimeDeps,
  campaignId: string,
  row: { id: string; characterId: string; architectureId: string },
  sceneId: string,
  stayingOn: string | null,
  entered: readonly string[],
): Promise<void> {
  const failed = await netLeaveFloors(deps, row, { sceneId, stayingOn, entered });
  // Piętro porzucone w połowie prób to porażka ostateczna — jak ostatnia próba.
  await raiseTracesAlarm(deps, { campaignId, runId: row.id, floorIds: failed });
}

/**
 * „Interfejs + 1k10" with the wounds of the body it is running from — and,
 * since stage 26c, with whatever Boosters are rezzed („+2 do Testów
 * Maskowania, dopóki ten Program jest zrezowany", s. 203).
 */
function performInterfaceRoll(
  deps: RealtimeDeps,
  character: Character,
  actorName: string,
  rank: number,
  title: string,
  dv: number | null,
  rawGesture: RollGesture | undefined,
  boosts: readonly { label: string; value: number; kind?: string }[] = [],
): RollResult {
  const data = parseCharacterData(character.data, deps.ctx.cpred);
  const situational = sheetSituationModifiers({
    grappled: false,
    injuries: data.criticalInjuries,
  });
  const breakdown: RollBreakdownEntry[] = [
    { label: `Interfejs ${rank}`, value: rank, kind: 'skill' },
    ...boosts.map((boost) => ({
      label: boost.label,
      value: boost.value,
      kind: boost.kind ?? 'skill',
    })),
    ...situational,
  ];
  const modifierTotal = breakdown.reduce((sum, entry) => sum + entry.value, 0);
  const formula: RollFormula = {
    terms: [
      { kind: 'dice', sign: 1, count: 1, sides: 10 },
      ...(modifierTotal !== 0
        ? [
            {
              kind: 'modifier' as const,
              sign: (modifierTotal < 0 ? -1 : 1) as 1 | -1,
              value: Math.abs(modifierTotal),
            },
          ]
        : []),
    ],
  };
  const gesture = sanitizeGesture(rawGesture);
  const result = rollFormula(formula, createMixedRng(gesture?.entropy), { checkRule: true });
  result.title = dv === null ? `${title} (Interfejs)` : `${title} (Interfejs) · PT ${dv}`;
  result.actor = actorName;
  result.breakdown = breakdown;
  if (gesture && gesture.strength > 0) result.tossStrength = gesture.strength;
  if (gesture?.toss) result.toss = gesture.toss;
  return result;
}

function readInterfaceRank(deps: RealtimeDeps, character: Character): number {
  const data = parseCharacterData(character.data, deps.ctx.cpred);
  const rank = cpredInterfaceRank(data, deps.ctx.cpred);
  if (rank === null) throw new RealtimeError('NET_NO_INTERFACE');
  return rank;
}

/** The sheet behind a figure, refusing the two ways a run cannot start. */
async function requireNetrunner(deps: RealtimeDeps, token: Token): Promise<Character> {
  if (!token.characterId) throw new RealtimeError('NET_NO_INTERFACE');
  const character = await deps.ctx.prisma.character.findUnique({
    where: { id: token.characterId },
  });
  if (!character) throw new RealtimeError('CHARACTER_NOT_FOUND');
  const data = parseCharacterData(character.data, deps.ctx.cpred);
  if (cpredInterfaceRank(data, deps.ctx.cpred) === null) {
    throw new RealtimeError('NET_NO_INTERFACE');
  }
  if (!data.cyberdeck) throw new RealtimeError('NET_NO_DECK');
  return character;
}

/** Black ICE floors met on the way — stage 26c's bill for an emergency exit. */
function rememberIce(
  state: CpredNetRunState,
  architecture: NonNullable<ReturnType<typeof architectureOf>>,
  floorIds: readonly string[],
): CpredNetRunState {
  const met = new Set(state.metIce);
  for (const branch of architecture.branches) {
    for (const floor of branch.floors) {
      if (floor.kind === 'ice' && floorIds.includes(floor.id)) met.add(floor.id);
    }
  }
  return met.size === state.metIce.length ? state : { ...state, metIce: [...met] };
}

async function requireRun(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  runId: unknown,
) {
  if (typeof runId !== 'string' || runId.length === 0) throw new RealtimeError('BAD_REQUEST');
  const row = await loadRunRow(deps.ctx.prisma, campaignId, runId);
  if (!row) throw new RealtimeError('NET_NOT_JACKED');
  if (!controlsRun(row, user)) throw new RealtimeError('FORBIDDEN');
  const architecture = architectureOf(row.architecture);
  // Both halves of the run at once (stage 26c): 26b's shaft and the fight in
  // it. A partial read here would be a partial write two lines later.
  const state = readFullRun(row.data);
  if (!architecture || !state) throw new RealtimeError('ARCHITECTURE_NOT_FOUND');
  return { row, architecture, state };
}

async function myRun(
  deps: RealtimeDeps,
  campaignId: string,
  tokenId: string,
  user: SessionUser,
): Promise<NetRunPayload | null> {
  const runs = await fetchRunsFor(deps, campaignId, user);
  return runs.find((run) => run.tokenId === tokenId) ?? null;
}

async function requireMyRun(
  deps: RealtimeDeps,
  campaignId: string,
  tokenId: string,
  user: SessionUser,
): Promise<NetRunPayload> {
  const run = await myRun(deps, campaignId, tokenId, user);
  if (!run) throw new RealtimeError('NET_NOT_JACKED');
  return run;
}

/**
 * The GM gives a netrunner their tries back (zlecenie MG z 02.11): every floor
 * this run's character failed on this scene may be hacked once more.
 */
export const netHackResetEvent = defineEvent<{ runId: string }, void>({
  name: 'netrun:hacks:reset',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const { row } = await requireRun(deps, campaignId, user, payload?.runId);
    await updateRuntime(deps.ctx.prisma, row.architectureId, (runtime) =>
      netClearTries(runtime, { characterId: row.characterId, sceneId: row.token.sceneId }),
    );
    await logNetLine(
      deps,
      campaignId,
      user,
      tokenTableName(row.token, row.token.character?.name ?? row.token.name),
      'Próby włamań',
      'oddane przez MG',
    );
    await emitRuns(deps, campaignId);
  },
});

/**
 * The Net half of the scene's „Zapomnij” (zlecenie MG z 14.11). The map half
 * is `explore:forget`, which is core VTT and may not know what a netrunner is,
 * so the client sends both.
 *
 * Every Architecture of the campaign, not only those wired here now: a socket
 * re-wired to another build must not leave the old build's memory behind.
 * A run still open on the scene is not rewound — its floors were uncovered in
 * this very connection — so the GM is told how many there are.
 */
export const netForgetSceneEvent = defineEvent<NetForgetScenePayload, NetForgetSceneResult>({
  name: 'net:forget-scene',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const scene = await requireCampaignScene(deps.ctx.prisma, campaignId, payload?.sceneId);
    const rows = await deps.ctx.prisma.netArchitecture.findMany({
      where: { campaignId },
      select: { id: true },
    });
    let forgotten = 0;
    for (const row of rows) {
      await updateRuntime(deps.ctx.prisma, row.id, (runtime) => {
        const result = netForgetScene(runtime, scene.id);
        forgotten += result.forgotten;
        return result.runtime;
      });
    }
    const liveRuns = await deps.ctx.prisma.netRun.count({
      where: { campaignId, token: { sceneId: scene.id } },
    });
    if (forgotten > 0 && liveRuns > 0) await emitRuns(deps, campaignId);
    return { forgotten, liveRuns };
  },
});
