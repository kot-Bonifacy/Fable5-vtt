import type {
  ChatMessageView,
  CpredNetPosition,
  CpredNetRunState,
  NetAbilityId,
  NetAccessPointIdPayload,
  NetAccessPointPlacePayload,
  NetAccessPointUpdatePayload,
  NetAccessPointView,
  NetRunAbilityPayload,
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
  ROLE_GM,
  cpredInterfaceRank,
  freshNetCombat,
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
  netMoveGoesDeeper,
  netControlDv,
  netMoveRefusal,
  netScoutReveal,
  parseCharacterData,
  readNetRuntime,
  rollFormula,
  tokenCentre,
} from '@vtt/shared';
import type { Character, Token } from '../generated/prisma/client.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { emitTokensById, requireCampaignToken } from './tokens.js';
import { requireCampaignScene, toSceneView } from './scenes.js';
import { requireTurnSpend } from './combat-actions.js';
import { sheetSituationModifiers } from '../sheets.js';
import { createMixedRng } from './dice-rng.js';
import { sanitizeGesture } from './chat.js';
import { INCLUDE_CHAT_NAMES, deliverRollMessage, toChatMessageView } from './chat-io.js';
import {
  architectureOf,
  controlsRun,
  emitAccessPoints,
  emitRuns,
  fetchRunsFor,
  loadRunForToken,
  logNetLine,
  loadRunRow,
  netAccessVerdict,
  netActionsForRun,
  readFullRun,
  releaseNodeHold,
  rivalNodeHold,
  saveRunState,
  saveRuntime,
  toAccessPointView,
} from './netrun-io.js';
import { dropRunFromQueue, emergencyJackOut, type FullRunState } from './netice.js';
import { roundOfScene, spawnIceOnFloors } from './netcombat.js';

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
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const row = await requireAccessPoint(deps, campaignId, payload?.id);
    // Runs hanging off this socket end with it — the cable was pulled.
    const orphaned = await deps.ctx.prisma.netRun.findMany({ where: { accessPointId: row.id } });
    for (const run of orphaned) await dropRunFromQueue(deps, campaignId, run.id);
    await deps.ctx.prisma.netRun.deleteMany({ where: { accessPointId: row.id } });
    await deps.ctx.prisma.netAccessPoint.delete({ where: { id: row.id } });
    await emitAccessPoints(deps, campaignId, row.sceneId);
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
    if (!point.architectureId) throw new RealtimeError('NET_NO_ACCESS_POINT');

    const existing = await loadRunForToken(deps.ctx.prisma, token.id);
    if (existing) throw new RealtimeError('NET_ALREADY_JACKED');

    const verdict = await netAccessVerdict(deps.ctx.prisma, scene, token, point);
    if (!verdict.ok) {
      throw new RealtimeError(verdict.reason === 'wall' ? 'NET_WALL_BLOCKS' : 'NET_OUT_OF_RANGE');
    }

    const architectureRow = await deps.ctx.prisma.netArchitecture.findUnique({
      where: { id: point.architectureId },
    });
    const architecture = architectureRow ? architectureOf(architectureRow) : null;
    if (!architecture) throw new RealtimeError('ARCHITECTURE_NOT_FOUND');
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
    // Both halves from the start (stage 26c): a run with no `rezzed` list is a
    // run whose first Program would have nowhere to go.
    let state: FullRunState = {
      ...freshNetRun(entry, entryFloor?.id ?? ''),
      ...freshNetCombat(),
    };
    if (entryFloor?.id) {
      state = await spawnIceOnFloors(deps, campaignId, architecture, state, [entryFloor.id]);
    }
    await deps.ctx.prisma.netRun.create({
      data: {
        campaignId,
        architectureId: architecture.id,
        accessPointId: point.id,
        tokenId: token.id,
        characterId: character.id,
        data: JSON.stringify(state),
      },
    });

    await logNetLine(deps, campaignId, user, character.name, 'Podłączenie do Sieci', point.name);
    await emitRuns(deps, campaignId);
    const mine = await myRun(deps, campaignId, token.id, user);
    if (!mine) throw new RealtimeError('NET_NOT_JACKED');
    return mine;
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
      row.token.character?.name ?? row.token.name,
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

    const verdict = netCanMove(architecture, state, to);
    if (!verdict.ok || !verdict.path) throw new RealtimeError(netMoveRefusal(verdict));

    // „Przez 1k6 Rund wrogi Netrunner nie może zejść na niższe poziomy
    // Architektury" (s. 204, stage 26c). Only downwards: the glue holds you in
    // place going deeper, it does not stop you climbing out.
    const { scene } = await requireCampaignToken(deps.ctx.prisma, campaignId, row.tokenId);
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
    // Opening a door is what puts a Black ICE in the shaft (stage 26c); what it
    // does about the intruder waits for the GM's own click.
    next = await spawnIceOnFloors(deps, campaignId, architecture, next, floorIds);
    next = { ...next, ...rememberIce(next, architecture, floorIds) };
    await saveRunState(deps.ctx.prisma, row.id, next);
    await emitRuns(deps, campaignId);
    return requireMyRun(deps, campaignId, row.tokenId, user);
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
    }
    await logNetLine(
      deps,
      campaignId,
      user,
      row.token.character?.name ?? row.token.name,
      'Kopia Pliku',
      floor.label || undefined,
    );
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

    const rank = readInterfaceRank(deps, character);
    const { actions } = await netActionsForRun(deps.ctx.prisma, deps.ctx.cpred, row.characterId);
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
        const message = await logNetLine(deps, campaignId, user, character.name, 'Wirus', line);
        return { messageId: message.id, total: 0, success: false, summary: line };
      }
    }

    // Stage 26d: a node somebody else already holds is taken off *them*, and
    // „PT odebrania … równe wartości Testu Kontroli, jaki wykonano" (s. 199)
    // means the rival's total, not the node's printed DV.
    const rival =
      ability.id === 'control' && floor
        ? await rivalNodeHold(deps.ctx.prisma, row.architectureId, floor.id, row.id)
        : null;
    const dv = abilityDv(ability.id, floor?.dv, rival?.dv);
    const roll = performInterfaceRoll(
      deps,
      character,
      rank,
      ability.name,
      dv,
      payload?.gesture,
      netAbilityBonuses(state, ability.id),
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
      author: character.name,
      ...(rival ? { rival } : {}),
    });

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
      character.name,
      ability.name,
      success ? 'udane' : 'nieudane',
    );
    await emitRuns(deps, campaignId);
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
export const netScanEvent = defineEvent<
  { tokenId: string; gesture?: RollGesture },
  NetRunAbilityResult
>({
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

    const roll = performInterfaceRoll(deps, character, rank, 'Skaner', null, payload?.gesture);
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
      character.name,
      'Skaner',
      found.length === 0 ? 'nic nie znalazł' : `znalazł ${found.length}`,
    );
    return { messageId: message.id, total: roll.total, success: found.length > 0, summary };
  },
});

// ──────────────────────────────── mechanika ────────────────────────────────

/** Which DV this ability is rolled against; null = the total *is* the answer. */
function abilityDv(
  id: NetAbilityId,
  floorDv: number | undefined,
  heldDv: number | undefined,
): number | null {
  if (id === 'control') return netControlDv(floorDv, heldDv);
  if (id === 'backdoor' || id === 'eyed') return floorDv ?? null;
  return null;
}

interface AbilityContext {
  abilityId: NetAbilityId;
  campaignId: string;
  run: { id: string; architectureId: string; architecture: { runtime: string } };
  architecture: NonNullable<ReturnType<typeof architectureOf>>;
  state: CpredNetRunState;
  total: number;
  success: boolean;
  author: string;
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
        ? 'Nic nowego — widok kończy się tam, gdzie się kończył.'
        : `Odsłonięte piętra: ${revealed.length}.`;
    return { summary, detail: `Zasięg widzenia ${total} pięter · ${summary}` };
  }

  if (abilityId === 'cloak') {
    const runtime = readNetRuntime(context.run.architecture.runtime);
    await saveRuntime(deps.ctx.prisma, context.run.architectureId, {
      ...runtime,
      maskDv: total,
      maskedBy: context.author,
    });
    const summary = `Ślady zatarte — cudzy Zwiad musi przebić ${total}.`;
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
    const wanted = netControlDv(floor?.dv, context.rival?.dv);
    if (!success || !floor) {
      return {
        summary: context.rival ? 'Węzeł został w cudzych rękach.' : 'Węzeł nie ustąpił.',
        detail: `PT ${wanted ?? '?'}`,
      };
    }
    await saveRunState(deps.ctx.prisma, context.run.id, {
      ...state,
      controlled: [
        ...state.controlled.filter((hold) => hold.floorId !== floor.id),
        { floorId: floor.id, dv: total },
      ],
    });
    // „Odebranie kontroli" is exactly that: the previous holder stops holding
    // it. Their own run keeps running — only this one node changes hands.
    if (context.rival) await releaseNodeHold(deps.ctx.prisma, context.rival.runId, floor.id);
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

/**
 * „Interfejs + 1k10" with the wounds of the body it is running from — and,
 * since stage 26c, with whatever Boosters are rezzed („+2 do Testów
 * Maskowania, dopóki ten Program jest zrezowany", s. 203).
 */
function performInterfaceRoll(
  deps: RealtimeDeps,
  character: Character,
  rank: number,
  title: string,
  dv: number | null,
  rawGesture: RollGesture | undefined,
  boosts: readonly { label: string; value: number }[] = [],
): RollResult {
  const data = parseCharacterData(character.data, deps.ctx.cpred);
  const situational = sheetSituationModifiers({
    grappled: false,
    injuries: data.criticalInjuries,
  });
  const breakdown: RollBreakdownEntry[] = [
    { label: `Interfejs ${rank}`, value: rank, kind: 'skill' },
    ...boosts.map((boost) => ({ label: boost.label, value: boost.value, kind: 'skill' as const })),
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
  result.actor = character.name;
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
