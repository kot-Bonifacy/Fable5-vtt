import type {
  ChatMessageView,
  CombatAddPayload,
  CombatInitiativePayload,
  CombatOrderPayload,
  CombatRerollTiePayload,
  CombatRollAllPayload,
  CombatRollPayload,
  CombatStartPayload,
  CombatUpdateBroadcast,
  CombatView,
  CombatantIdPayload,
  CombatantView,
  RollBreakdownEntry,
  RollFormula,
  RollResult,
  SessionUser,
} from '@vtt/shared';
import {
  COMBAT_INITIATIVE_MAX,
  COMBAT_INITIATIVE_MIN,
  MAX_COMBATANTS,
  ROLE_GM,
  filterCombatForPlayer,
  nextTurn,
  previousTurn,
  resolveInitiativeOrder,
  rollFormula,
  sortCombatants,
} from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { Combat, Combatant, Scene, Token } from '../generated/prisma/client.js';
import { readSheetInitiative, type SheetRegistry } from '../sheets.js';
import { createMixedRng } from './dice-rng.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { campaignRoom, gmRoom, sceneRoom } from './state.js';
import { requireCampaignScene } from './scenes.js';
import { INCLUDE_CHAT_NAMES, deliverRollMessage, toChatMessageView } from './chat-io.js';
import { sanitizeGesture } from './chat.js';

/**
 * The initiative tracker (stage 14).
 *
 * The tracker is core VTT state: participants, their initiative values and
 * whose turn it is. Everything system-specific — that CP RED rolls
 * `1d10 + REF` — is read through the sheet adapter (`sheets.ts`), the same
 * seam the token layer uses for HP.
 *
 * Visibility follows stage 05: a participant whose token is hidden never
 * appears in a player's payload, so the tracker cannot betray an ambush.
 */

/** A combatant row together with everything needed to render and roll it. */
type CombatantRow = Combatant & {
  token: Token & { character: { id: string; ownerId: string | null } | null };
};

type CombatRow = Combat & { combatants: CombatantRow[] };

const COMBAT_INCLUDE = {
  combatants: {
    include: {
      token: { include: { character: { select: { id: true, ownerId: true } } } },
    },
  },
} as const;

/** Who controls a participant: the token's owner, or the linked sheet's. */
function combatantOwnerId(row: CombatantRow): string | null {
  return row.token.ownerId ?? row.token.character?.ownerId ?? null;
}

function toCombatantView(row: CombatantRow): CombatantView {
  const view: CombatantView = {
    id: row.id,
    tokenId: row.tokenId,
    name: row.token.name,
    imageUrl: row.token.imageUrl,
    initiative: row.initiative,
    tieBreak: row.tieBreak,
    order: row.order,
    ownerId: combatantOwnerId(row),
  };
  if (row.token.hidden) view.hidden = true;
  return view;
}

/** The GM's full view — sorted, with hidden participants included. */
function toCombatView(row: CombatRow): CombatView {
  return {
    id: row.id,
    sceneId: row.sceneId,
    round: row.round,
    activeCombatantId: row.activeCombatantId,
    combatants: sortCombatants(row.combatants.map(toCombatantView)),
  };
}

async function loadCombat(prisma: PrismaClient, sceneId: string): Promise<CombatRow | null> {
  return prisma.combat.findUnique({ where: { sceneId }, include: COMBAT_INCLUDE });
}

async function loadCombatById(prisma: PrismaClient, combatId: string): Promise<CombatRow> {
  const combat = await prisma.combat.findUnique({
    where: { id: combatId },
    include: COMBAT_INCLUDE,
  });
  if (!combat) throw new RealtimeError('COMBAT_NOT_FOUND');
  return combat;
}

/** Combat of a scene as one viewer sees it — used by `state:sync`. */
export async function fetchCombatFor(
  prisma: PrismaClient,
  sceneId: string,
  user: SessionUser,
): Promise<CombatView | null> {
  const row = await loadCombat(prisma, sceneId);
  if (!row) return null;
  const view = toCombatView(row);
  return user.role === ROLE_GM ? view : filterCombatForPlayer(view);
}

/**
 * Emits the current combat of a scene.
 *
 * Same shape as token emissions (stage 05): the active scene gets a sequenced
 * campaign-wide broadcast carrying the player-safe view, followed by the full
 * view targeted at the GM room (no seq — targeted emissions must not create
 * gaps). A non-active scene only reaches its viewers, i.e. a GM previewing it.
 */
function emitCombat(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  combat: CombatView | null,
): void {
  const full: CombatUpdateBroadcast = { sceneId: scene.id, combat };
  if (!scene.active) {
    deps.io.to(sceneRoom(scene.id)).emit('combat:update', full);
    return;
  }
  const room = campaignRoom(campaignId);
  const publicPayload: CombatUpdateBroadcast = {
    seq: deps.seqs.next(room),
    sceneId: scene.id,
    combat: combat ? filterCombatForPlayer(combat) : null,
  };
  deps.io.to(room).emit('combat:update', publicPayload);
  deps.io.to(gmRoom(campaignId)).emit('combat:update', full);
}

/**
 * Reloads and re-emits the combat of a scene. Called by the token layer after
 * a change that alters the tracker: a hidden token has to vanish from the
 * players' tracker as well as from their map, a renamed one has to update its
 * row, and a deleted one is cascaded out of the fight by the database.
 */
export async function emitCombatOfScene(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
): Promise<void> {
  const row = await loadCombat(deps.ctx.prisma, scene.id);
  emitCombat(deps, campaignId, scene, row ? toCombatView(row) : null);
}

function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

function requireIdList(value: unknown): string[] {
  if (!Array.isArray(value)) throw new RealtimeError('BAD_REQUEST');
  const ids = value.filter((id): id is string => typeof id === 'string' && id.length > 0);
  if (ids.length === 0 || ids.length !== value.length) throw new RealtimeError('BAD_REQUEST');
  return [...new Set(ids)];
}

/** Loads a combat plus its scene, rejecting anything outside the campaign. */
async function requireCombatant(
  prisma: PrismaClient,
  campaignId: string,
  combatantId: unknown,
): Promise<{ combat: CombatRow; combatant: CombatantRow; scene: Scene }> {
  if (typeof combatantId !== 'string' || combatantId.length === 0) {
    throw new RealtimeError('BAD_REQUEST');
  }
  const combatant = await prisma.combatant.findUnique({
    where: { id: combatantId },
    include: { combat: { include: { scene: true } } },
  });
  if (!combatant) throw new RealtimeError('COMBATANT_NOT_FOUND');
  const scene = combatant.combat.scene;
  if (scene.campaignId !== campaignId) throw new RealtimeError('COMBATANT_NOT_FOUND');
  const combat = await loadCombatById(prisma, combatant.combatId);
  const row = combat.combatants.find((c) => c.id === combatant.id);
  if (!row) throw new RealtimeError('COMBATANT_NOT_FOUND');
  return { combat, combatant: row, scene };
}

/** The running combat of the scene these tokens sit on (all must share it). */
async function requireCombatOfTokens(
  prisma: PrismaClient,
  campaignId: string,
  tokenIds: string[],
): Promise<{ combat: CombatRow; scene: Scene; tokens: Token[] }> {
  const tokens = await prisma.token.findMany({
    where: { id: { in: tokenIds } },
    include: { scene: true },
  });
  if (tokens.length !== tokenIds.length) throw new RealtimeError('TOKEN_NOT_FOUND');
  const scene = tokens[0]?.scene;
  if (!scene || scene.campaignId !== campaignId) throw new RealtimeError('TOKEN_NOT_FOUND');
  if (tokens.some((token) => token.sceneId !== scene.id)) throw new RealtimeError('BAD_REQUEST');
  const combat = await loadCombat(prisma, scene.id);
  if (!combat) throw new RealtimeError('COMBAT_NOT_FOUND');
  return {
    combat,
    scene,
    tokens: tokens.map(({ scene: _scene, ...token }) => token as Token),
  };
}

/** Rolls `1d10 + modifier` without the check rule — initiative never crits. */
function rollInitiative(
  modifier: number,
  entropy: string | undefined,
): { result: RollResult; formula: RollFormula } {
  const terms: RollFormula['terms'] = [{ kind: 'dice', sign: 1, count: 1, sides: 10 }];
  if (modifier !== 0) {
    terms.push({ kind: 'modifier', sign: modifier < 0 ? -1 : 1, value: Math.abs(modifier) });
  }
  const formula: RollFormula = { terms };
  return { result: rollFormula(formula, createMixedRng(entropy), { checkRule: false }), formula };
}

/**
 * Initiative inputs of one participant. A statist without a sheet rolls a bare
 * 1d10 — the GM can always type a value in by hand afterwards.
 */
function initiativeInputsOf(
  row: CombatantRow,
  registry: SheetRegistry,
  sheets: Map<string, string>,
): { modifier: number; tieBreak: number | null; label: string | null } {
  const characterId = row.token.character?.id;
  const data = characterId ? sheets.get(characterId) : undefined;
  if (data === undefined) return { modifier: 0, tieBreak: null, label: null };
  const initiative = readSheetInitiative({ data }, registry);
  return { modifier: initiative.modifier, tieBreak: initiative.tieBreak, label: initiative.label };
}

/** Sheet payloads of the given participants (character id → data JSON). */
async function loadCombatSheets(
  prisma: PrismaClient,
  rows: CombatantRow[],
): Promise<Map<string, string>> {
  const ids = rows
    .map((row) => row.token.character?.id)
    .filter((id): id is string => typeof id === 'string');
  if (ids.length === 0) return new Map();
  const characters = await prisma.character.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, data: true },
  });
  return new Map(characters.map((c) => [c.id, c.data]));
}

/**
 * Rolls initiative for the given participants and persists the results — the
 * GM's „rzuć wszystkim", which stays off chat on purpose: five cards for five
 * NPCs would bury the conversation.
 */
async function rollFor(deps: RealtimeDeps, targets: CombatantRow[]): Promise<void> {
  const sheets = await loadCombatSheets(deps.ctx.prisma, targets);
  for (const row of targets) {
    const inputs = initiativeInputsOf(row, deps.ctx.cpred, sheets);
    const { result } = rollInitiative(inputs.modifier, undefined);
    await deps.ctx.prisma.combatant.update({
      where: { id: row.id },
      data: { initiative: result.total, tieBreak: inputs.tieBreak },
    });
  }
}

/**
 * Re-assigns manual positions after initiative changed: the system's
 * tie-breaker (CP RED: REF) resolves equal totals automatically, and a drag
 * between genuinely tied participants survives, because the previous position
 * is the last criterion.
 */
async function renumberOrder(prisma: PrismaClient, combat: CombatRow): Promise<void> {
  const ordered = resolveInitiativeOrder(combat.combatants.map(toCombatantView));
  await Promise.all(
    ordered.map((combatant, index) =>
      prisma.combatant.update({ where: { id: combatant.id }, data: { order: index } }),
    ),
  );
}

async function emitReloaded(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  combatId: string,
): Promise<CombatView> {
  const row = await loadCombatById(deps.ctx.prisma, combatId);
  const view = toCombatView(row);
  emitCombat(deps, campaignId, scene, view);
  return view;
}

export const combatStartEvent = defineEvent<CombatStartPayload, CombatView>({
  name: 'combat:start',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const sceneId = payload?.sceneId ?? socket.data.viewedSceneId;
    const scene = await requireCampaignScene(deps.ctx.prisma, campaignId, sceneId);
    const tokenIds = requireIdList(payload?.tokenIds);
    if (tokenIds.length > MAX_COMBATANTS) throw new RealtimeError('TOO_MANY_COMBATANTS');

    const tokens = await deps.ctx.prisma.token.findMany({
      where: { id: { in: tokenIds }, sceneId: scene.id },
    });
    if (tokens.length !== tokenIds.length) throw new RealtimeError('TOKEN_NOT_FOUND');

    // Starting a fight replaces whatever was running on that scene.
    await deps.ctx.prisma.combat.deleteMany({ where: { sceneId: scene.id } });
    const combat = await deps.ctx.prisma.combat.create({
      data: {
        sceneId: scene.id,
        combatants: {
          create: tokenIds.map((tokenId, index) => ({ tokenId, order: index })),
        },
      },
    });
    return emitReloaded(deps, campaignId, scene, combat.id);
  },
});

export const combatAddEvent = defineEvent<CombatAddPayload, CombatView>({
  name: 'combat:add',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const tokenIds = requireIdList(payload?.tokenIds);
    const { combat, scene } = await requireCombatOfTokens(deps.ctx.prisma, campaignId, tokenIds);

    const known = new Set(combat.combatants.map((c) => c.tokenId));
    const fresh = tokenIds.filter((id) => !known.has(id));
    if (combat.combatants.length + fresh.length > MAX_COMBATANTS) {
      throw new RealtimeError('TOO_MANY_COMBATANTS');
    }
    // Reinforcements start at the bottom until they roll — their initiative
    // then slots them into the running order (RAW: they act on their own roll).
    let order = combat.combatants.length;
    for (const tokenId of fresh) {
      await deps.ctx.prisma.combatant.create({
        data: { combatId: combat.id, tokenId, order: order++ },
      });
    }
    return emitReloaded(deps, campaignId, scene, combat.id);
  },
});

export const combatRemoveEvent = defineEvent<CombatantIdPayload, CombatView>({
  name: 'combat:remove',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const { combat, combatant, scene } = await requireCombatant(
      deps.ctx.prisma,
      campaignId,
      payload?.combatantId,
    );

    // Removing whoever is acting (death, flight) hands the turn on rather than
    // stalling the tracker with a pointer to nobody.
    if (combat.activeCombatantId === combatant.id) {
      const pointer = nextTurn(toCombatView(combat));
      const activeCombatantId =
        pointer.activeCombatantId === combatant.id ? null : pointer.activeCombatantId;
      await deps.ctx.prisma.combat.update({
        where: { id: combat.id },
        data: { round: pointer.round, activeCombatantId },
      });
    }
    await deps.ctx.prisma.combatant.delete({ where: { id: combatant.id } });
    return emitReloaded(deps, campaignId, scene, combat.id);
  },
});

export const combatRollAllEvent = defineEvent<CombatRollAllPayload, CombatView>({
  name: 'combat:roll-all',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const sceneId = socket.data.viewedSceneId;
    const scene = await requireCampaignScene(deps.ctx.prisma, campaignId, sceneId);
    const combat = await loadCombat(deps.ctx.prisma, scene.id);
    if (!combat) throw new RealtimeError('COMBAT_NOT_FOUND');

    const rerollAll = payload?.rerollAll === true;
    const targets = rerollAll
      ? combat.combatants
      : combat.combatants.filter((row) => row.initiative === null);
    await rollFor(deps, targets);
    const reloaded = await loadCombatById(deps.ctx.prisma, combat.id);
    await renumberOrder(deps.ctx.prisma, reloaded);
    return emitReloaded(deps, campaignId, scene, combat.id);
  },
});

export const combatRerollTieEvent = defineEvent<CombatRerollTiePayload, CombatView>({
  name: 'combat:reroll-tie',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const ids = requireIdList(payload?.combatantIds);
    const { combat, scene } = await requireCombatant(deps.ctx.prisma, campaignId, ids[0]);
    const targets = combat.combatants.filter((row) => ids.includes(row.id));
    if (targets.length !== ids.length) throw new RealtimeError('COMBATANT_NOT_FOUND');

    await rollFor(deps, targets);
    const reloaded = await loadCombatById(deps.ctx.prisma, combat.id);
    await renumberOrder(deps.ctx.prisma, reloaded);
    return emitReloaded(deps, campaignId, scene, combat.id);
  },
});

/**
 * One participant rolls their own initiative — the path behind the dice cup,
 * so a player's initiative keeps the physical gesture and lands on chat like
 * any other roll (stage 08: rolls that matter always go through the cup).
 */
export const combatRollEvent = defineEvent<CombatRollPayload, { initiative: number }>({
  name: 'combat:roll',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const { combat, combatant, scene } = await requireCombatant(
      deps.ctx.prisma,
      campaignId,
      payload?.combatantId,
    );
    if (user.role !== ROLE_GM) {
      // A hidden participant must not even be confirmable by a player.
      if (combatant.token.hidden) throw new RealtimeError('COMBATANT_NOT_FOUND');
      if (combatantOwnerId(combatant) !== user.id) throw new RealtimeError('FORBIDDEN');
    }

    const sheets = await loadCombatSheets(deps.ctx.prisma, [combatant]);
    const inputs = initiativeInputsOf(combatant, deps.ctx.cpred, sheets);
    const gesture = sanitizeGesture(payload?.gesture);
    const { result } = rollInitiative(inputs.modifier, gesture?.entropy);

    const breakdown: RollBreakdownEntry[] = [];
    if (inputs.label !== null) {
      breakdown.push({ label: inputs.label, value: inputs.modifier, kind: 'stat' });
    }
    result.title = 'Inicjatywa';
    result.actor = combatant.token.name;
    if (breakdown.length > 0) result.breakdown = breakdown;
    if (gesture && gesture.strength > 0) result.tossStrength = gesture.strength;
    if (gesture?.toss) result.toss = gesture.toss;

    await deps.ctx.prisma.combatant.update({
      where: { id: combatant.id },
      data: { initiative: result.total, tieBreak: inputs.tieBreak },
    });

    const stored = await deps.ctx.prisma.chatMessage.create({
      data: {
        campaignId,
        authorId: user.id,
        kind: 'roll',
        text: 'Inicjatywa',
        payload: JSON.stringify(result),
        sceneId: scene.id,
      },
      include: INCLUDE_CHAT_NAMES,
    });
    const view: ChatMessageView = toChatMessageView(stored);
    await deliverRollMessage(deps, campaignId, user.id, view);

    const reloaded = await loadCombatById(deps.ctx.prisma, combat.id);
    await renumberOrder(deps.ctx.prisma, reloaded);
    await emitReloaded(deps, campaignId, scene, combat.id);
    return { initiative: result.total };
  },
});

export const combatSetInitiativeEvent = defineEvent<CombatInitiativePayload, CombatView>({
  name: 'combat:set-initiative',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const { combat, combatant, scene } = await requireCombatant(
      deps.ctx.prisma,
      campaignId,
      payload?.combatantId,
    );
    const value = payload?.initiative;
    if (value !== null) {
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw new RealtimeError('BAD_REQUEST');
      }
      if (value < COMBAT_INITIATIVE_MIN || value > COMBAT_INITIATIVE_MAX) {
        throw new RealtimeError('BAD_REQUEST');
      }
    }
    await deps.ctx.prisma.combatant.update({
      where: { id: combatant.id },
      data: { initiative: value },
    });
    // A typed-in value slots the participant into the order the same way a
    // rolled one does (REF resolving equal totals).
    await renumberOrder(deps.ctx.prisma, await loadCombatById(deps.ctx.prisma, combat.id));
    return emitReloaded(deps, campaignId, scene, combat.id);
  },
});

export const combatOrderEvent = defineEvent<CombatOrderPayload, CombatView>({
  name: 'combat:order',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const ids = requireIdList(payload?.combatantIds);
    const { combat, scene } = await requireCombatant(deps.ctx.prisma, campaignId, ids[0]);
    // The drag must arrive as a permutation of exactly this fight's roster.
    const known = new Set(combat.combatants.map((c) => c.id));
    if (ids.length !== known.size || ids.some((id) => !known.has(id))) {
      throw new RealtimeError('BAD_REQUEST');
    }
    await Promise.all(
      ids.map((id, index) =>
        deps.ctx.prisma.combatant.update({ where: { id }, data: { order: index } }),
      ),
    );
    return emitReloaded(deps, campaignId, scene, combat.id);
  },
});

/**
 * Advances the turn. The GM always may; the acting participant's own player
 * may end their turn („Kończę turę") — the server re-checks who that is, so a
 * player can never skip somebody else's turn.
 */
export const combatNextEvent = defineEvent<undefined, CombatView>({
  name: 'combat:next',
  handler: async ({ deps, socket, user }) => {
    const campaignId = requireCampaignId(socket.data);
    const sceneId = socket.data.viewedSceneId;
    const scene = await requireCampaignScene(deps.ctx.prisma, campaignId, sceneId);
    const combat = await loadCombat(deps.ctx.prisma, scene.id);
    if (!combat) throw new RealtimeError('COMBAT_NOT_FOUND');

    if (user.role !== ROLE_GM) {
      const active = combat.combatants.find((row) => row.id === combat.activeCombatantId);
      if (!active || active.token.hidden) throw new RealtimeError('FORBIDDEN');
      if (combatantOwnerId(active) !== user.id) throw new RealtimeError('FORBIDDEN');
    }

    const pointer = nextTurn(toCombatView(combat));
    await deps.ctx.prisma.combat.update({
      where: { id: combat.id },
      data: { round: pointer.round, activeCombatantId: pointer.activeCombatantId },
    });
    return emitReloaded(deps, campaignId, scene, combat.id);
  },
});

export const combatPreviousEvent = defineEvent<undefined, CombatView>({
  name: 'combat:previous',
  role: ROLE_GM,
  handler: async ({ deps, socket }) => {
    const campaignId = requireCampaignId(socket.data);
    const sceneId = socket.data.viewedSceneId;
    const scene = await requireCampaignScene(deps.ctx.prisma, campaignId, sceneId);
    const combat = await loadCombat(deps.ctx.prisma, scene.id);
    if (!combat) throw new RealtimeError('COMBAT_NOT_FOUND');

    const pointer = previousTurn(toCombatView(combat));
    await deps.ctx.prisma.combat.update({
      where: { id: combat.id },
      data: { round: pointer.round, activeCombatantId: pointer.activeCombatantId },
    });
    return emitReloaded(deps, campaignId, scene, combat.id);
  },
});

export const combatEndEvent = defineEvent({
  name: 'combat:end',
  role: ROLE_GM,
  handler: async ({ deps, socket }) => {
    const campaignId = requireCampaignId(socket.data);
    const sceneId = socket.data.viewedSceneId;
    const scene = await requireCampaignScene(deps.ctx.prisma, campaignId, sceneId);
    // Ending clears the state completely — round history is not persisted.
    await deps.ctx.prisma.combat.deleteMany({ where: { sceneId: scene.id } });
    emitCombat(deps, campaignId, scene, null);
  },
});
