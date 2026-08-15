import type {
  ChatMessageView,
  CpredNetArchitecture,
  CpredNetIce,
  CpredNetPosition,
  NetBonus,
  NetAttackPlan,
  NetIceActPayload,
  NetRunAbilityResult,
  NetRunAttackPayload,
  NetRunGluePayload,
  NetRunProgramPayload,
  NetRunSlidePayload,
  RollBreakdownEntry,
  RollFormula,
  RollGesture,
  RollResult,
  SessionUser,
} from '@vtt/shared';
import {
  CPRED_ACTION_NET,
  NET_COMBAT_MESSAGES,
  ROLE_GM,
  isProgramEntry,
  netAttackWins,
  netCanRunProgram,
  netCanSlide,
  netDamageIce,
  netDetectionPlan,
  netIceAttackPlan,
  netProgramAttackPlan,
  netProgramDamageDice,
  netProgramHurts,
  netProgramProfileOf,
  netRandomRezzed,
  netRunProgram,
  netSlideDestinations,
  netSlidePlan,
  netSpeedBonuses,
  netStopProgram,
  netTargetAllowed,
  netZapPlan,
  readCpredTurn,
  rollFormula,
  netSamePosition,
  netFloorAt,
} from '@vtt/shared';
import type { Scene, Token } from '../generated/prisma/client.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { requireCampaignToken } from './tokens.js';
import { emitTokensById } from './tokens.js';
import { requireTurnSpend } from './combat-actions.js';
import { emitCombatOfScene, loadCombat } from './combat.js';
import { createMixedRng } from './dice-rng.js';
import { sanitizeGesture } from './chat.js';
import { INCLUDE_CHAT_NAMES, deliverChatMessageTo, toChatMessageView } from './chat-io.js';
import { campaignEntry } from './compendium.js';
import {
  architectureOf,
  controlsRun,
  deckRowsOf,
  emitRuns,
  loadRunRow,
  logNetLine,
  netActionsForRun,
  readFullRun,
  saveRunState,
} from './netrun-io.js';
import { applyIceEffect, emergencyJackOut, type FullRunState } from './netice.js';

/**
 * Walka w Sieci (stage 26c) — the events behind Programs, Paf, Ślizg and the
 * Black ICE.
 *
 * Four decisions run through the whole file:
 *
 *  1. **Both totals are rolled here, at once.** Unlike the Hold of 14d, the
 *     other side of a Net fight is a Program: there is nobody to hand a „Broń
 *     się" button to. The card therefore shows the exchange finished, and
 *     `opposed.won` is its verdict. „Większy od" (s. 201): a tie is a miss.
 *  2. **The Black ICE moves only when the GM says so** (decision of 15.08).
 *     RAW fires its free attack the moment you walk in; the VTT marks it as
 *     waiting and gives the GM two buttons — „LOD wykrywa intruza" and „Tura
 *     LOD-a". „LOD-y zawsze kontroluje MG" (s. 205) either way.
 *  3. **A fight in the Net needs no fight on the map.** The tracker is where a
 *     Black ICE goes when there *is* one, but a run happens as often without;
 *     everything here works either way, and the round-based rules (once per
 *     Turn, the glue's clock) simply do not bite when there are no rounds.
 *  4. **Nothing is rolled that the shared engine could roll.** Plans, damage
 *     dice, target legality and the state transitions come from
 *     `systems/cpred/netcombat.ts`; this file spends Net Actions, throws dice
 *     and writes chat cards.
 */

// ─────────────────────────────── wspólne narzędzia ───────────────────────────────

function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

interface LoadedRun {
  row: NonNullable<Awaited<ReturnType<typeof loadRunRow>>>;
  architecture: CpredNetArchitecture;
  state: FullRunState;
  scene: Scene;
  token: Token;
}

async function requireRun(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  runId: unknown,
): Promise<LoadedRun> {
  if (typeof runId !== 'string' || runId.length === 0) throw new RealtimeError('BAD_REQUEST');
  const row = await loadRunRow(deps.ctx.prisma, campaignId, runId);
  if (!row) throw new RealtimeError('NET_NOT_JACKED');
  if (!controlsRun(row, user)) throw new RealtimeError('FORBIDDEN');
  const architecture = architectureOf(row.architecture);
  const state = readFullRun(row.data);
  if (!architecture || !state) throw new RealtimeError('ARCHITECTURE_NOT_FOUND');
  const { scene, token } = await requireCampaignToken(deps.ctx.prisma, campaignId, row.tokenId);
  return { row, architecture, state, scene, token };
}

/** The round a fight is in, or null when nobody started one. */
export async function roundOfScene(deps: RealtimeDeps, sceneId: string): Promise<number | null> {
  const combat = await deps.ctx.prisma.combat.findUnique({
    where: { sceneId },
    select: { round: true },
  });
  return combat && combat.round > 0 ? combat.round : null;
}

/**
 * Books one Net Action and clears the Mózgoklep debt when this is the Action
 * that opens the bundle.
 *
 * „Zmniejsza … liczbę Akcji Sieciowych, które cel może wykonać w swojej
 * kolejnej Turze" (s. 204). A bundle is per Action per turn, so the *next*
 * bundle to open is exactly the one the sentence means — which is why this
 * needs no round arithmetic at all.
 */
export async function spendNetAction(
  deps: RealtimeDeps,
  input: {
    campaignId: string;
    scene: Scene;
    tokenId: string;
    user: SessionUser;
    label: string;
    characterId: string;
    state: FullRunState;
  },
): Promise<FullRunState> {
  const { actions } = await netActionsForRun(
    deps.ctx.prisma,
    deps.ctx.cpred,
    input.characterId,
    input.state.netActionDebt,
  );
  const opening = !(await bundleIsOpen(deps, input.scene.id, input.tokenId));
  await requireTurnSpend(
    deps,
    input.campaignId,
    input.scene,
    input.tokenId,
    { kind: 'net', label: input.label, max: Math.max(1, actions) },
    input.user,
    CPRED_ACTION_NET,
    { silent: true },
  );
  if (opening && input.state.netActionDebt > 0) return { ...input.state, netActionDebt: 0 };
  return input.state;
}

/** Is a Net Action bundle already open in this figure's current turn? */
async function bundleIsOpen(
  deps: RealtimeDeps,
  sceneId: string,
  tokenId: string,
): Promise<boolean> {
  const combat = await loadCombat(deps.ctx.prisma, sceneId);
  const row = combat?.combatants.find((entry) => entry.tokenId === tokenId);
  if (!row?.turnState) return false;
  return readCpredTurn(row.turnState).action?.net !== undefined;
}

/**
 * Spawns the Black ICE waiting on the floors just walked onto.
 *
 * Called from the run's own movement (stage 26b) so that opening a door is what
 * puts the thing in the shaft — but only once per floor: `metIce` is what stops
 * a corridor walked twice from holding two Krakens.
 */
export async function spawnIceOnFloors(
  deps: RealtimeDeps,
  campaignId: string,
  architecture: CpredNetArchitecture,
  state: FullRunState,
  floorIds: readonly string[],
): Promise<FullRunState> {
  const known = new Set(state.metIce);
  const fresh = floorIds.filter((id) => !known.has(id));
  if (fresh.length === 0) return state;

  const spawned: CpredNetIce[] = [];
  const met = new Set(state.metIce);
  for (const branch of architecture.branches) {
    for (const floor of branch.floors) {
      if (floor.kind !== 'ice' || !fresh.includes(floor.id)) continue;
      met.add(floor.id);
      for (const [index, programId] of (floor.programIds ?? []).entries()) {
        const entry = await campaignEntry(deps, campaignId, programId);
        if (!entry || !isProgramEntry(entry)) continue;
        const profile = netProgramProfileOf(entry);
        spawned.push({
          id: `ice-${floor.id}-${index}`,
          floorId: floor.id,
          programId,
          name: entry.name,
          profile,
          rezCurrent: profile.rez,
          // „Zwykle gdzieś w Architekturze czyha na ciebie Czarny LOD" — it is
          // waiting, not yet hunting. The GM's button turns that around.
          mode: 'lurking',
          detected: false,
        });
      }
    }
  }
  if (spawned.length === 0 && met.size === state.metIce.length) return state;
  const existing = new Set(state.ice.map((entry) => entry.id));
  return {
    ...state,
    metIce: [...met],
    ice: [...state.ice, ...spawned.filter((entry) => !existing.has(entry.id))],
  };
}

// ──────────────────────────────── rzuty sporne ────────────────────────────────

/** One side of an exchange: `1k10 + …`, with the modifiers named. */
function rollSide(
  bonuses: readonly NetBonus[],
  entropy: string | undefined,
  checkRule: boolean,
): { result: RollResult; breakdown: RollBreakdownEntry[] } {
  const breakdown: RollBreakdownEntry[] = bonuses.map((bonus) => ({
    label: bonus.label,
    value: bonus.value,
    kind: 'skill',
  }));
  const total = bonuses.reduce((sum, bonus) => sum + bonus.value, 0);
  const formula: RollFormula = {
    terms: [
      { kind: 'dice', sign: 1, count: 1, sides: 10 },
      ...(total !== 0
        ? [
            {
              kind: 'modifier' as const,
              sign: (total < 0 ? -1 : 1) as 1 | -1,
              value: Math.abs(total),
            },
          ]
        : []),
    ],
  };
  return { result: rollFormula(formula, createMixedRng(entropy), { checkRule }), breakdown };
}

/**
 * Rolls a whole exchange and builds the card.
 *
 * The netrunner's side explodes on a natural 10 and fumbles on a 1: it is an
 * Interface Check like every other in this chapter. A Program's side does not —
 * a Program has no Skill, and the rulebook ties the check rule to Skill Checks.
 */
function rollExchange(
  plan: NetAttackPlan,
  input: { gesture?: RollGesture; attackerIsHuman: boolean; detail: string; actor: string },
): { roll: RollResult; attackTotal: number; defenceTotal: number; won: boolean } {
  const gesture = sanitizeGesture(input.gesture);
  const attack = rollSide(plan.attack, gesture?.entropy, input.attackerIsHuman);
  const defence = rollSide(plan.defence, undefined, false);
  const won = netAttackWins(attack.result.total, defence.result.total);

  const roll = attack.result;
  roll.title = plan.label;
  roll.actor = input.actor;
  if (attack.breakdown.length > 0) roll.breakdown = attack.breakdown;
  roll.opposed = {
    system: { stage: '26c' },
    label: plan.label,
    detail: `${input.detail} · obrona ${defence.result.notation} = ${defence.result.total}`,
    won,
  };
  if (gesture && gesture.strength > 0) roll.tossStrength = gesture.strength;
  if (gesture?.toss) roll.toss = gesture.toss;
  return { roll, attackTotal: attack.result.total, defenceTotal: defence.result.total, won };
}

/**
 * Posts the card to the two people entitled to it.
 *
 * The netrunner and the GM, and nobody else — the card carries an ICE's OBR and
 * the state of a fight the rest of the table cannot see. What the room gets is
 * the one-line summary, exactly as in 26b.
 */
async function postExchange(
  deps: RealtimeDeps,
  input: {
    campaignId: string;
    user: SessionUser;
    sceneId: string;
    roll: RollResult;
    runnerOwnerId: string | null;
  },
): Promise<ChatMessageView> {
  const stored = await deps.ctx.prisma.chatMessage.create({
    data: {
      campaignId: input.campaignId,
      authorId: input.user.id,
      kind: 'gmroll',
      text: input.roll.title ?? 'Walka w Sieci',
      payload: JSON.stringify(input.roll),
      sceneId: input.sceneId,
    },
    include: INCLUDE_CHAT_NAMES,
  });
  const view = toChatMessageView(stored);
  await deliverChatMessageTo(
    deps,
    input.campaignId,
    view,
    [input.user.id, input.runnerOwnerId],
    true,
  );
  return view;
}

function requireIce(state: FullRunState, iceId: unknown): CpredNetIce {
  if (typeof iceId !== 'string') throw new RealtimeError('BAD_REQUEST');
  const ice = state.ice.find((entry) => entry.id === iceId);
  if (!ice) throw new RealtimeError('NET_ICE_UNKNOWN');
  return ice;
}

/** Refusals of 26c travel with their Polish text, like every other net error. */
function refuse(problem: keyof typeof NET_COMBAT_MESSAGES): never {
  throw new RealtimeError(problem);
}

/**
 * May the netrunner reach this ICE? One that is hunting them is by definition
 * wherever they are („ściga swój cel po całej Architekturze", s. 205); one that
 * is still lurking has to be shared a floor with.
 */
function iceIsInReach(
  ice: CpredNetIce,
  architecture: CpredNetArchitecture,
  position: CpredNetPosition,
): boolean {
  if (ice.mode === 'hunting') return true;
  return netFloorAt(architecture, position)?.id === ice.floorId;
}

function requireLiveIce(
  state: FullRunState,
  architecture: CpredNetArchitecture,
  iceId: unknown,
): CpredNetIce {
  const ice = requireIce(state, iceId);
  if (ice.mode === 'derezzed' || ice.mode === 'destroyed') refuse('NET_ICE_DOWN');
  if (!iceIsInReach(ice, architecture, state.position)) refuse('NET_ICE_ELSEWHERE');
  return ice;
}

/** Takes a beaten ICE out of the initiative queue, if it ever got into one. */
async function dropIceFromQueue(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  ice: CpredNetIce,
): Promise<void> {
  if (!ice.combatantId) return;
  await deps.ctx.prisma.combatant.deleteMany({ where: { id: ice.combatantId } });
  await emitCombatOfScene(deps, campaignId, scene);
}

// ──────────────────────────── uruchamianie Programów ────────────────────────────

export const netProgramEvent = defineEvent<NetRunProgramPayload, NetRunAbilityResult>({
  name: 'netrun:program',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const { row, state, scene, token } = await requireRun(deps, campaignId, user, payload?.runId);
    const rowId = typeof payload?.rowId === 'string' ? payload.rowId : '';
    const deck = await deckRowsOf(deps.ctx.prisma, deps.ctx.cpred, row.characterId);
    const slot = deck.find((entry) => entry.id === rowId);
    if (!slot) refuse('NET_PROGRAM_NOT_LOADED');

    const stopping = payload?.action === 'stop';
    if (!stopping) {
      const verdict = netCanRunProgram(state, slot);
      if (!verdict.ok) refuse(verdict.problem);
    }
    const copy = state.rezzed.find((entry) => entry.rowId === rowId);
    if (stopping && !copy) refuse('NET_PROGRAM_NOT_RUNNING');

    const name = slot.name;
    let next = await spendNetAction(deps, {
      campaignId,
      scene,
      tokenId: token.id,
      user,
      label: stopping ? `Zatrzymanie: ${name}` : `Uruchomienie: ${name}`,
      characterId: row.characterId,
      state,
    });

    if (stopping && copy) {
      next = { ...next, ...netStopProgram(next, copy.id) };
    } else if (slot.profile) {
      next = {
        ...next,
        ...netRunProgram(next, {
          id: `rez-${rowId}-${Date.now().toString(36)}`,
          rowId,
          name,
          profile: slot.profile,
          rezCurrent: slot.profile.rez,
          derezzed: false,
        }),
      };
    }

    await saveRunState(deps.ctx.prisma, row.id, next);
    const summary = stopping ? `${name} zatrzymany.` : `${name} uruchomiony — zrezowany.`;
    const message = await logNetLine(
      deps,
      campaignId,
      user,
      row.token.character?.name ?? row.token.name,
      stopping ? 'Zatrzymanie Programu' : 'Uruchomienie Programu',
      name,
    );
    await emitRuns(deps, campaignId);
    return { messageId: message.id, total: 0, success: true, summary };
  },
});

// ──────────────────────────────── atak i Paf ────────────────────────────────

export const netAttackEvent = defineEvent<NetRunAttackPayload, NetRunAbilityResult>({
  name: 'netrun:attack',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const { row, architecture, state, scene, token } = await requireRun(
      deps,
      campaignId,
      user,
      payload?.runId,
    );
    const ice = requireLiveIce(state, architecture, payload?.iceId);
    const { rank } = await netActionsForRun(deps.ctx.prisma, deps.ctx.cpred, row.characterId);

    const rowId = typeof payload?.rowId === 'string' ? payload.rowId : null;
    let plan;
    let label: string;
    let spentRow: string | null = null;
    // „Jeśli w wyniku tego ataku Program byłby zderezowany, zamiast tego
    // zostaje zniszczony" (s. 205) — a flag of the Program doing the hitting.
    let destroys: boolean | undefined;
    if (rowId) {
      const deck = await deckRowsOf(deps.ctx.prisma, deps.ctx.cpred, row.characterId);
      const slot = deck.find((entry) => entry.id === rowId);
      if (!slot?.profile) refuse('NET_PROGRAM_NOT_LOADED');
      if (state.spentRows.includes(rowId)) refuse('NET_PROGRAM_SPENT');
      if (!netTargetAllowed(slot.profile, 'blackIce')) refuse('NET_PROGRAM_WRONG_TARGET');
      if (!netProgramHurts(slot.profile, 'blackIce')) refuse('NET_PROGRAM_NO_EFFECT');
      plan = netProgramAttackPlan({
        interfaceRank: rank,
        program: { name: slot.name, profile: slot.profile },
        target: { name: ice.name, profile: ice.profile, kind: 'blackIce' },
      });
      label = slot.name;
      destroys = slot.profile.effects?.destroys;
      if (slot.profile.effects?.oncePerEntry) spentRow = rowId;
    } else {
      plan = netZapPlan({ interfaceRank: rank, target: { name: ice.name, profile: ice.profile } });
      label = 'Paf';
    }

    let next = await spendNetAction(deps, {
      campaignId,
      scene,
      tokenId: token.id,
      user,
      label,
      characterId: row.characterId,
      state,
    });

    const actorName = row.token.character?.name ?? row.token.name;
    const exchange = rollExchange(plan, {
      ...(payload?.gesture ? { gesture: payload.gesture } : {}),
      attackerIsHuman: true,
      detail: `${plan.dice}k6 obrażeń, jeśli trafi`,
      actor: actorName,
    });

    let summary: string;
    if (exchange.won) {
      const rng = createMixedRng();
      const damage = rollFormula(
        { terms: [{ kind: 'dice', sign: 1, count: plan.dice, sides: 6 }] },
        rng,
      ).total;
      const hit = netDamageIce(next, ice.id, damage, destroys);
      next = { ...next, ...hit.state };
      const verdict = hit.outcome?.destroyed
        ? 'zniszczony'
        : hit.outcome?.derezzed
          ? 'zderezowany'
          : `REZ ${hit.outcome?.after ?? ice.rezCurrent}`;
      summary = `${label} trafia: ${plan.dice}k6 = ${damage} — ${ice.name} ${verdict}.`;
      exchange.roll.opposed = {
        ...exchange.roll.opposed!,
        detail: `${exchange.roll.opposed!.detail} · ${plan.dice}k6 = ${damage} · ${ice.name}: ${verdict}`,
      };
      if (hit.outcome?.derezzed || hit.outcome?.destroyed) {
        await dropIceFromQueue(deps, campaignId, scene, ice);
      }
    } else {
      summary = `${label} nie przebija obrony ${ice.name}.`;
    }
    if (spentRow) next = { ...next, spentRows: [...new Set([...next.spentRows, spentRow])] };

    await saveRunState(deps.ctx.prisma, row.id, next);
    const message = await postExchange(deps, {
      campaignId,
      user,
      sceneId: scene.id,
      roll: exchange.roll,
      runnerOwnerId: row.token.character?.ownerId ?? row.token.ownerId,
    });
    await logNetLine(
      deps,
      campaignId,
      user,
      actorName,
      label,
      exchange.won ? 'trafienie w Sieci' : 'pudło w Sieci',
    );
    await emitRuns(deps, campaignId);
    return { messageId: message.id, total: exchange.attackTotal, success: exchange.won, summary };
  },
});

// ──────────────────────────────────── Ślizg ────────────────────────────────────

export const netSlideEvent = defineEvent<NetRunSlidePayload, NetRunAbilityResult>({
  name: 'netrun:slide',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const { row, architecture, state, scene, token } = await requireRun(
      deps,
      campaignId,
      user,
      payload?.runId,
    );
    const ice = requireLiveIce(state, architecture, payload?.iceId);
    const round = await roundOfScene(deps, scene.id);
    if (!netCanSlide(state, round)) refuse('NET_SLIDE_USED');

    const destinations = netSlideDestinations(architecture, state.position, state.broken);
    if (destinations.length === 0) refuse('NET_SLIDE_NO_ROOM');
    const wanted = payload?.to;
    const target =
      wanted && destinations.some((step) => netSamePosition(step, wanted))
        ? wanted
        : destinations[0]!;

    const { rank } = await netActionsForRun(deps.ctx.prisma, deps.ctx.cpred, row.characterId);
    let next = await spendNetAction(deps, {
      campaignId,
      scene,
      tokenId: token.id,
      user,
      label: 'Ślizg',
      characterId: row.characterId,
      state,
    });

    const actorName = row.token.character?.name ?? row.token.name;
    const plan = netSlidePlan({ interfaceRank: rank, marks: next.slideMarks.length, ice });
    const exchange = rollExchange(plan, {
      ...(payload?.gesture ? { gesture: payload.gesture } : {}),
      attackerIsHuman: true,
      detail: 'ucieczka na sąsiednie piętro',
      actor: actorName,
    });

    // The Ślizg is spent whether or not it worked: „próbę Ślizgu można podjąć
    // tylko raz na Turę" is about the attempt, not about the success.
    next = { ...next, slideRound: round };

    let summary: string;
    if (exchange.won) {
      const floorId = netFloorAt(architecture, target)?.id;
      const fledFrom = netFloorAt(architecture, state.position)?.id ?? ice.floorId;
      next = {
        ...next,
        position: target,
        ...(floorId ? { entered: [...new Set([...next.entered, floorId])] } : {}),
        // „Zostaje tam, gdzie zakończył się pościg" — the floor it was shaken
        // off on, which is the one being left, not the one being fled to. It
        // also stops having found anybody: a netrunner who comes back walks
        // into it again, and that is a fresh „gdy się na niego natkniesz".
        ice: next.ice.map((entry) =>
          entry.id === ice.id
            ? { ...entry, mode: 'lurking', floorId: fledFrom, detected: false }
            : entry,
        ),
      };
      next = await spawnIceOnFloors(deps, campaignId, architecture, next, floorId ? [floorId] : []);
      await dropIceFromQueue(deps, campaignId, scene, ice);
      summary = `Ślizg udany — ucieczka o piętro. ${ice.name} zostaje czyhającym.`;
    } else {
      summary = `Ślizg nieudany — ${ice.name} nie daje się zgubić.`;
    }

    await saveRunState(deps.ctx.prisma, row.id, next);
    const message = await postExchange(deps, {
      campaignId,
      user,
      sceneId: scene.id,
      roll: exchange.roll,
      runnerOwnerId: row.token.character?.ownerId ?? row.token.ownerId,
    });
    await logNetLine(
      deps,
      campaignId,
      user,
      actorName,
      'Ślizg',
      exchange.won ? 'udany' : 'nieudany',
    );
    await emitRuns(deps, campaignId);
    return { messageId: message.id, total: exchange.attackTotal, success: exchange.won, summary };
  },
});

// ──────────────────────────── Czarny LOD (przyciski MG) ────────────────────────────

/**
 * „Gdy się na niego natkniesz, rzucasz na Interfejs + suma aktywnych premii do
 * PRĘDKOŚCI + 1k10 przeciw PRĘDKOŚCI + 1k10 tego Czarnego LOD-u" (s. 205).
 *
 * On the GM's click rather than on the netrunner's step (decision of 15.08),
 * and it does three things at once: the contest, the free hit if it is lost,
 * and the jump to the head of the initiative queue.
 */
export const netIceDetectEvent = defineEvent<NetIceActPayload, NetRunAbilityResult>({
  name: 'netrun:ice:detect',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const { row, state, scene } = await requireRun(deps, campaignId, user, payload?.runId);
    const ice = requireIce(state, payload?.iceId);
    if (ice.mode === 'derezzed' || ice.mode === 'destroyed') refuse('NET_ICE_DOWN');
    if (ice.detected) refuse('NET_ICE_ALREADY_DETECTED');

    const { rank } = await netActionsForRun(deps.ctx.prisma, deps.ctx.cpred, row.characterId);
    const actorName = row.token.character?.name ?? row.token.name;
    const plan = netDetectionPlan({
      interfaceRank: rank,
      speedBonuses: netSpeedBonuses(state),
      ice,
    });
    const exchange = rollExchange(plan, {
      ...(payload?.gesture ? { gesture: payload.gesture } : {}),
      attackerIsHuman: true,
      detail: 'wykrycie — przegrana to darmowy atak LOD-u',
      actor: actorName,
    });

    let next: FullRunState = {
      ...state,
      ice: state.ice.map((entry) =>
        entry.id === ice.id ? { ...entry, detected: true, mode: 'hunting' } : entry,
      ),
    };
    const tokenIds: string[] = [];
    let summary = `${ice.name} wykrywa intruza — nie zdążył uderzyć.`;
    let ended = false;

    if (!exchange.won) {
      const effect = await applyIceEffect(deps, {
        campaignId,
        user,
        ice,
        state: next,
        runId: row.id,
        characterId: row.characterId,
        token: row.token,
        round: await roundOfScene(deps, scene.id),
        rng: createMixedRng(),
      });
      next = effect.state;
      tokenIds.push(...effect.tokenIds);
      summary = `${ice.name} wyprowadza darmowy atak: ${effect.lines.join(' ')}`;
      exchange.roll.opposed = {
        ...exchange.roll.opposed!,
        detail: `${exchange.roll.opposed!.detail} · ${effect.lines.join(' · ')}`,
      };
      ended = effect.endsRun;
    }

    if (!ended) {
      const combatantId = await pushIceIntoQueue(deps, campaignId, scene, {
        runId: row.id,
        ice,
      });
      if (combatantId) {
        next = {
          ...next,
          ice: next.ice.map((entry) => (entry.id === ice.id ? { ...entry, combatantId } : entry)),
        };
      }
      await saveRunState(deps.ctx.prisma, row.id, next);
    }

    const message = await postExchange(deps, {
      campaignId,
      user,
      sceneId: scene.id,
      roll: exchange.roll,
      runnerOwnerId: row.token.character?.ownerId ?? row.token.ownerId,
    });
    await logNetLine(deps, campaignId, user, actorName, 'Czarny LOD', `${ice.name} — wykrycie`);
    if (ended) {
      await emergencyJackOut(deps, {
        campaignId,
        user,
        runId: row.id,
        reason: `${ice.name} wyrzucił netrunnera z Architektury`,
        round: await roundOfScene(deps, scene.id),
        except: ice.id,
        rng: createMixedRng(),
      });
    }
    if (tokenIds.length > 0) await emitTokensById(deps, campaignId, tokenIds);
    await emitRuns(deps, campaignId);
    return { messageId: message.id, total: exchange.attackTotal, success: exchange.won, summary };
  },
});

/**
 * One Turn of a Black ICE: „w każdej swojej Turze LOD wykonuje jeden atak
 * wymierzony w Netrunnera (lub … jeden losowo określony, uruchomiony Program)"
 * (s. 205).
 */
export const netIceTurnEvent = defineEvent<NetIceActPayload, NetRunAbilityResult>({
  name: 'netrun:ice:turn',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const { row, state, scene } = await requireRun(deps, campaignId, user, payload?.runId);
    const ice = requireIce(state, payload?.iceId);
    if (ice.mode === 'derezzed' || ice.mode === 'destroyed') refuse('NET_ICE_DOWN');
    // A lurking ICE waits — it is only after it has caught somebody that it
    // gets Turns („ściga swój cel po całej Architekturze", s. 205). One shaken
    // off with a Ślizg goes back to waiting, which is what makes the ability
    // worth an Akcja Sieciowa.
    if (!ice.detected || ice.mode !== 'hunting') refuse('NET_ICE_NOT_DETECTED');
    const round = await roundOfScene(deps, scene.id);
    if (round !== null && ice.lastAttackRound === round) refuse('NET_ICE_ALREADY_ACTED');

    const { rank } = await netActionsForRun(deps.ctx.prisma, deps.ctx.cpred, row.characterId);
    const actorName = row.token.character?.name ?? row.token.name;
    const victim =
      ice.profile.target === 'antiProgram' ? netRandomRezzed(state, createMixedRng()) : null;
    const plan = netIceAttackPlan({
      ice,
      defender: victim
        ? { kind: 'program', name: victim.name, profile: victim.profile }
        : { kind: 'brain', name: actorName, interfaceRank: rank },
    });
    const exchange = rollExchange(plan, {
      attackerIsHuman: false,
      detail: victim
        ? `cel: ${victim.name} (LOD przeciwprogramowy)`
        : `cel: ${actorName} — ${netProgramDamageDice(ice.profile, 'brain')}k6 w mózg`,
      actor: ice.name,
    });

    let next: FullRunState = {
      ...state,
      ice: state.ice.map((entry) =>
        entry.id === ice.id ? { ...entry, lastAttackRound: round ?? entry.lastAttackRound } : entry,
      ),
    };
    const tokenIds: string[] = [];
    let summary = `${ice.name} chybia.`;
    let ended = false;

    if (exchange.won) {
      const effect = await applyIceEffect(deps, {
        campaignId,
        user,
        ice,
        state: next,
        runId: row.id,
        characterId: row.characterId,
        token: row.token,
        round,
        rng: createMixedRng(),
      });
      next = effect.state;
      tokenIds.push(...effect.tokenIds);
      summary = `${ice.name} trafia: ${effect.lines.join(' ')}`;
      exchange.roll.opposed = {
        ...exchange.roll.opposed!,
        detail: `${exchange.roll.opposed!.detail} · ${effect.lines.join(' · ')}`,
      };
      ended = effect.endsRun;
    }

    if (!ended) await saveRunState(deps.ctx.prisma, row.id, next);
    const message = await postExchange(deps, {
      campaignId,
      user,
      sceneId: scene.id,
      roll: exchange.roll,
      runnerOwnerId: row.token.character?.ownerId ?? row.token.ownerId,
    });
    await logNetLine(
      deps,
      campaignId,
      user,
      ice.name,
      'Tura Czarnego LOD-u',
      exchange.won ? 'trafienie' : 'pudło',
    );
    if (ended) {
      await emergencyJackOut(deps, {
        campaignId,
        user,
        runId: row.id,
        reason: `${ice.name} wyrzucił netrunnera z Architektury`,
        round,
        except: ice.id,
        rng: createMixedRng(),
      });
    }
    if (tokenIds.length > 0) await emitTokensById(deps, campaignId, tokenIds);
    await emitRuns(deps, campaignId);
    return { messageId: message.id, total: exchange.attackTotal, success: exchange.won, summary };
  },
});

/**
 * „Następnie LOD zajmuje pierwsze miejsce w Kolejce Inicjatywy, o jeden punkt
 * wyżej niż Netrunner lub Program, który do tej pory zajmował to miejsce"
 * (s. 205).
 *
 * Not a reroll — an insertion, which is why the tracker had to learn to carry a
 * participant with no figure at all (stage 26c's one schema change). Without a
 * running fight there is nothing to insert into, and the GM's „Tura LOD-a"
 * button drives it instead.
 */
async function pushIceIntoQueue(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  input: { runId: string; ice: CpredNetIce },
): Promise<string | null> {
  const combat = await loadCombat(deps.ctx.prisma, scene.id);
  if (!combat) return null;
  const existing = combat.combatants.find((entry) => entry.netIceId === input.ice.id);
  if (existing) return existing.id;
  const top = combat.combatants.reduce((best, entry) => Math.max(best, entry.initiative ?? 0), 0);
  const created = await deps.ctx.prisma.combatant.create({
    data: {
      combatId: combat.id,
      label: input.ice.name,
      netRunId: input.runId,
      netIceId: input.ice.id,
      initiative: top + 1,
      order: -1,
    },
  });
  await emitCombatOfScene(deps, campaignId, scene);
  return created.id;
}

// ──────────────────────────────── Superklej ────────────────────────────────

/**
 * „Zdejmij Superklej" — the GM's eraser for a run that is happening outside
 * combat, where no round ever comes to end it on its own.
 */
export const netGlueClearEvent = defineEvent<NetRunGluePayload, void>({
  name: 'netrun:glue',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const { row, state } = await requireRun(deps, campaignId, user, payload?.runId);
    if (!state.glue) return;
    await saveRunState(deps.ctx.prisma, row.id, { ...state, glue: null });
    await logNetLine(
      deps,
      campaignId,
      user,
      row.token.character?.name ?? row.token.name,
      'Superklej',
      'zdjęty przez MG',
    );
    await emitRuns(deps, campaignId);
  },
});
