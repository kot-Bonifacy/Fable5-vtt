import type {
  ChatMessageView,
  CombatGrappleActionPayload,
  CombatGrapplePayload,
  CombatGrappleResistPayload,
  CombatView,
  DamageLogEntry,
  RollBreakdownEntry,
  RollGesture,
  RollOpposedMeta,
  RollResult,
  SessionUser,
  TokenHp,
} from '@vtt/shared';
import {
  CPRED_ACTION_CHOKE,
  CPRED_ACTION_ESCAPE_GRAPPLE,
  CPRED_ACTION_GRAPPLE,
  CPRED_ACTION_HUMAN_SHIELD,
  CPRED_ACTION_RELEASE_GRAPPLE,
  CPRED_ACTION_THROW,
  CPRED_BRAWLING_SKILL_ID,
  CPRED_MELEE_REACH_M,
  ROLE_GM,
  formatMetres,
  isTokenInFog,
  metresBetweenTokens,
  metresForRules,
  parseCharacterData,
  planCpredRoll,
  rollFormula,
} from '@vtt/shared';
import type { Character, Token } from '../generated/prisma/client.js';
import type { PrismaClient } from '../db.js';
import {
  SHEET_GRAPPLE_PENALTY,
  SHEET_PRONE_STATUS_ID,
  SHEET_STATIST_GRAPPLE_DV,
  SHEET_UNCONSCIOUS_STATUS_ID,
  applyGrappleDamageToSheet,
  applyGrappleDamageToTokenHp,
  judgeSheetGrapple,
  nextSheetChokeStreak,
  readSheetBody,
  readSheetGrappleDv,
  sheetActionName,
  sheetFacedownPenalty,
  sheetSituationModifiers,
  sheetWoundStatuses,
  type SheetGrappleDamage,
} from '../sheets.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import {
  emitReloaded,
  findGrapple,
  loadCombat,
  readTokenStatuses,
  requireCampaignId,
  type CombatRow,
  type CombatantRow,
  type FiguredCombatantRow,
} from './combat.js';
import { myCombatant, requireFigure, requireTurnSpend } from './combat-actions.js';
import { addTokenStatus, beginGrapple, endGrapple } from './grapple-state.js';
import { requireRollableCharacter } from './character-rolls.js';
import { emitCharacterUpsert, toCharacterView } from './character-io.js';
import {
  emitTokensById,
  emitTokensOfCharacter,
  requireCampaignToken,
  toTokenView,
} from './tokens.js';
import { fetchFogState } from './fog-io.js';
import { toSceneView } from './scenes.js';
import {
  INCLUDE_CHAT_NAMES,
  broadcastRedactedChatMessage,
  deliverRollMessage,
  toChatMessageView,
} from './chat-io.js';
import { createMixedRng } from './dice-rng.js';
import { sanitizeGesture } from './chat.js';
import { logSpentAction, actionEntry } from './combat-log.js';

/**
 * Grappling (stage 14d) — „Pochwycenie", and everything a Hold makes possible.
 *
 * The shape of the stage, in three rules:
 *
 *  - **The Hold is a relation, not a sticker.** It lives on the tracker rows
 *    (`grappledById` on the Held one), so „kto kogo" has exactly one home, dies
 *    with the fight, and cannot be forged by editing a token. The `grappled`
 *    status on the token is a *picture* of it, kept in sync from here.
 *  - **The opposed test resolves immediately, and the defender may answer.**
 *    The attacker rolls against a stand-in DV built from the defender's sheet
 *    (ZW + Bijatyka + half a die, the shape stage 16 uses for melee); the
 *    defender's card carries „Broń się", which replaces the stand-in with a real
 *    roll and rewrites the verdict. Nobody waits for an absent player, and
 *    nobody is denied their own dice.
 *  - **Duszenie, Rzut and Ludzka tarcza cost an Action and roll nothing.** RAW
 *    gives them flat effects once the Hold exists — the roll already happened.
 *
 * The −2 both sides carry is not applied here: it is spliced into every roll
 * those two make, by the paths that make them (`attacks.ts`,
 * `character-rolls.ts`), so it shows up in the breakdown where a player can see
 * where it came from.
 */

/**
 * The −2 a lost Konfrontacja puts on an Action aimed at that same opponent
 * (stage 23c), as zero or one breakdown row.
 */
function facedownRows(actor: Token, opponentTokenId: string): RollBreakdownEntry[] {
  const row = sheetFacedownPenalty(
    { statuses: readTokenStatuses(actor.statuses), statusData: actor.statusData },
    opponentTokenId,
  );
  return row ? [row] : [];
}

/**
 * The Hold this participant is the Attacker of, or a refusal. The Defender is
 * always a figure: „Pochwycenie" is two bodies, and the only participant
 * without one is a Black ICE in the Net (stage 26c), which nobody wrestles.
 */
function requireHoldAsAttacker(combat: CombatRow, combatant: CombatantRow): FiguredCombatantRow {
  const pair = findGrapple(combat, combatant);
  if (!pair || pair.attacker.id !== combatant.id) throw new RealtimeError('NOT_GRAPPLING');
  return requireFigure(pair.defender);
}

/* ------------------------------------------------------------------ *
 * The opposed test
 * ------------------------------------------------------------------ */

/** Sheet of a token, when it has one. */
async function sheetOf(prisma: PrismaClient, token: Token): Promise<Character | null> {
  if (!token.characterId) return null;
  return prisma.character.findUnique({ where: { id: token.characterId } });
}

/** Is this participant in a Hold right now? Decides the −2 on their roll. */
function isGrappled(combat: CombatRow | null, tokenId: string): boolean {
  if (!combat) return false;
  const combatant = combat.combatants.find((row) => row.tokenId === tokenId);
  return combatant ? findGrapple(combat, combatant) !== null : false;
}

/**
 * The token this character is grabbing with: the one named, or their only one
 * on the scene. Mirrors `resolveAttackerToken` in the attack path.
 */
async function resolveGrapplerToken(
  deps: RealtimeDeps,
  campaignId: string,
  character: Character,
  sceneId: string,
  tokenId: unknown,
): Promise<Token> {
  if (typeof tokenId === 'string' && tokenId.length > 0) {
    const { token } = await requireCampaignToken(deps.ctx.prisma, campaignId, tokenId);
    if (token.characterId !== character.id) throw new RealtimeError('ATTACKER_NOT_LINKED');
    if (token.sceneId !== sceneId) throw new RealtimeError('ATTACKER_ON_OTHER_SCENE');
    return token;
  }
  const token = await deps.ctx.prisma.token.findFirst({
    where: { characterId: character.id, sceneId },
  });
  if (!token) throw new RealtimeError('ATTACKER_NOT_ON_SCENE');
  return token;
}

/** What travels on the card so „Broń się" can re-judge the same contest. */
interface GrappleCardSystem extends Record<string, unknown> {
  intent: 'hold' | 'item' | 'escape';
  attackerTokenId: string;
  attackerCombatantId: string;
  defenderTokenId: string;
  defenderCombatantId: string;
  /** The stand-in DV the attacker rolled against. */
  dv: number;
  /** −2 the defender carries, so their own roll gets it too. */
  defenderModifier: number;
  metres: number;
}

/**
 * Pochwycenie, and wrestling free of one. The same contest, judged the same
 * way — only the consequence of a win differs, which is why one event serves
 * both (RAW even calls the escape „Test Pochwycenia Atakującego").
 */
export const grappleAttemptEvent = defineEvent<
  CombatGrapplePayload<RollGesture>,
  { messageId: number }
>({
  name: 'grapple:attempt',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const character = await requireRollableCharacter(deps, campaignId, user, payload?.characterId);
    const registry = deps.ctx.cpred;
    const data = parseCharacterData(character.data, registry);

    const { token: target, scene } = await requireCampaignToken(
      deps.ctx.prisma,
      campaignId,
      payload?.targetTokenId,
    );
    // Same concealment rules as an attack (stage 16): a hidden or fogged token
    // must not even be confirmable by a player poking at its id.
    if (user.role !== ROLE_GM) {
      if (target.hidden) throw new RealtimeError('TOKEN_NOT_FOUND');
      const fog = await fetchFogState(deps.ctx.prisma, scene);
      const controlled =
        target.ownerId === user.id ||
        (target.characterId !== null && target.characterId === character.id);
      if (
        fog.enabled &&
        !controlled &&
        isTokenInFog(toTokenView(target, false), toSceneView(scene), fog)
      ) {
        throw new RealtimeError('TOKEN_NOT_FOUND');
      }
    }

    const attacker = await resolveGrapplerToken(
      deps,
      campaignId,
      character,
      target.sceneId,
      payload?.attackerTokenId,
    );
    if (attacker.id === target.id) throw new RealtimeError('BAD_REQUEST');

    const metres = metresForRules(
      metresBetweenTokens(
        toTokenView(attacker, true),
        toTokenView(target, true),
        toSceneView(scene),
      ),
    );
    // „Do wykonania manewru Pochwycenia potrzebna jest jedna wolna ręka" — and
    // an arm's length. The reach is the melee one, measured by the server.
    if (metres > CPRED_MELEE_REACH_M) throw new RealtimeError('GRAPPLE_OUT_OF_REACH');

    const intent: GrappleCardSystem['intent'] =
      payload?.intent === 'item' ? 'item' : payload?.intent === 'escape' ? 'escape' : 'hold';

    const combat = await loadCombat(deps.ctx.prisma, scene.id);
    const attackerRow = combat?.combatants.find((row) => row.tokenId === attacker.id) ?? null;
    const targetRow = combat?.combatants.find((row) => row.tokenId === target.id) ?? null;

    if (intent === 'escape') {
      // Wrestling free is a test *against the Attacker of an existing Hold*, so
      // there has to be one — RAW lets a third party try, hence no check that
      // the roller is the one being held.
      if (!combat || !targetRow || !findGrapple(combat, targetRow)) {
        throw new RealtimeError('NOT_GRAPPLED');
      }
    } else if (combat && targetRow && findGrapple(combat, targetRow)) {
      throw new RealtimeError('ALREADY_GRAPPLED');
    }

    const actionId = intent === 'escape' ? CPRED_ACTION_ESCAPE_GRAPPLE : CPRED_ACTION_GRAPPLE;
    // Charged before the dice, like every attack: a grab with no Action left
    // must not spend Luck on its way to the refusal (stage 14b).
    await requireTurnSpend(
      deps,
      campaignId,
      scene,
      attacker.id,
      { kind: 'action', actionId },
      user,
      actionId,
      { silent: true },
    );

    const attackerGrappled = isGrappled(combat, attacker.id);
    const defenderGrappled = isGrappled(combat, target.id);
    const defenderModifier = defenderGrappled ? SHEET_GRAPPLE_PENALTY : 0;

    const planned = planCpredRoll(
      data,
      registry,
      {
        kind: 'skill',
        skillId: CPRED_BRAWLING_SKILL_ID,
        ...(payload?.modifier !== undefined ? { modifier: payload.modifier } : {}),
        ...(payload?.luckSpent !== undefined ? { luckSpent: payload.luckSpent } : {}),
      },
      {
        modifiers: [
          ...sheetSituationModifiers({
            grappled: attackerGrappled,
            injuries: data.criticalInjuries,
          }),
          // A grab is an Action aimed at somebody, so a lost Konfrontacja costs
          // the grabber −2 here too (s. 194, stage 23c).
          ...facedownRows(attacker, target.id),
        ],
      },
    );
    if (!planned.ok) throw new RealtimeError(planned.error);

    const targetSheet = await sheetOf(deps.ctx.prisma, target);
    const dv = targetSheet
      ? readSheetGrappleDv(targetSheet, registry, defenderModifier)
      : SHEET_STATIST_GRAPPLE_DV + defenderModifier;

    const gesture: RollGesture | undefined = sanitizeGesture(payload?.gesture);
    const result: RollResult = rollFormula(planned.plan.formula, createMixedRng(gesture?.entropy), {
      checkRule: true,
    });
    result.title = `${GRAPPLE_TITLES[intent]} → ${target.name}`;
    result.actor = character.name;
    result.breakdown = planned.plan.breakdown;
    if (gesture && gesture.strength > 0) result.tossStrength = gesture.strength;
    if (gesture?.toss) result.toss = gesture.toss;

    const verdict = judgeSheetGrapple(result.total, dv);
    const system: GrappleCardSystem = {
      intent,
      attackerTokenId: attacker.id,
      attackerCombatantId: attackerRow?.id ?? '',
      defenderTokenId: target.id,
      defenderCombatantId: targetRow?.id ?? '',
      dv,
      defenderModifier,
      metres,
    };

    if (verdict.won) {
      await applyGrappleVerdict(deps, campaignId, combat, system, intent, attackerRow, targetRow);
    }

    result.opposed = buildOpposedMeta(system, verdict.won, target.name, targetSheet !== null);
    const stored = await deps.ctx.prisma.chatMessage.create({
      data: {
        campaignId,
        authorId: user.id,
        kind: 'roll',
        text: result.title,
        payload: JSON.stringify(result),
        sceneId: scene.id,
      },
      include: INCLUDE_CHAT_NAMES,
    });
    const view: ChatMessageView = toChatMessageView(stored);
    await deliverRollMessage(deps, campaignId, user.id, view);
    if (attackerRow) await emitReloaded(deps, campaignId, scene, attackerRow.combatId);
    return { messageId: view.id };
  },
});

const GRAPPLE_TITLES: Record<GrappleCardSystem['intent'], string> = {
  hold: 'Pochwycenie',
  item: 'Pochwycenie przedmiotu',
  escape: 'Wyrwanie się z Trzymania',
};

/** The card's verdict block, including the „Broń się" invitation. */
function buildOpposedMeta(
  system: GrappleCardSystem,
  won: boolean,
  defenderName: string,
  defenderHasSheet: boolean,
): RollOpposedMeta {
  const detail = [
    `zwarcie · ${formatMetres(system.metres)}`,
    `PT ${system.dv} (ZW + Bijatyka ${defenderHasSheet ? 'celu' : '— cel bez karty'})`,
    ...(system.defenderModifier !== 0 ? [`cel w Trzymaniu ${system.defenderModifier}`] : []),
  ].join(' · ');
  return {
    system: { ...system },
    label: `${GRAPPLE_TITLES[system.intent]} → ${defenderName}`,
    detail,
    won,
    // Only a defender with a sheet can answer with a roll of their own.
    ...(defenderHasSheet ? { defenderTokenId: system.defenderTokenId } : {}),
    ...(defenderHasSheet ? { answerLabel: 'Broń się' } : {}),
  };
}

/** What a won test does to the tracker. */
async function applyGrappleVerdict(
  deps: RealtimeDeps,
  campaignId: string,
  combat: CombatRow | null,
  system: GrappleCardSystem,
  intent: GrappleCardSystem['intent'],
  attackerRow: CombatantRow | null,
  targetRow: CombatantRow | null,
): Promise<void> {
  if (!combat || !targetRow) return;
  if (intent === 'escape') {
    // „Jeśli taki Test się uda, Trzymanie kończy się dla wszystkich uczestników."
    const pair = findGrapple(combat, targetRow);
    if (pair) await endGrapple(deps, campaignId, pair.defender);
    return;
  }
  // Taking an item out of somebody's hands leaves no relation behind — the
  // effect is on the card, and the inventory is a stage of its own.
  if (intent === 'item' || !attackerRow) return;
  await beginGrapple(deps, campaignId, attackerRow, targetRow);
}

/**
 * „Broń się": the defender replaces the stand-in DV with a roll of their own.
 * The same shape as the dodge in stage 16 — the stored card is re-judged and
 * rewritten, and it may only be answered once.
 */
export const grappleResistEvent = defineEvent<
  CombatGrappleResistPayload<RollGesture>,
  { total: number; won: boolean }
>({
  name: 'grapple:resist',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    if (typeof payload?.messageId !== 'number' || !Number.isInteger(payload.messageId)) {
      throw new RealtimeError('BAD_REQUEST');
    }
    const message = await deps.ctx.prisma.chatMessage.findUnique({
      where: { id: payload.messageId },
      include: INCLUDE_CHAT_NAMES,
    });
    if (!message || message.campaignId !== campaignId || !message.payload) {
      throw new RealtimeError('MESSAGE_NOT_FOUND');
    }
    const roll = JSON.parse(message.payload) as RollResult;
    const system = roll.opposed?.system as GrappleCardSystem | undefined;
    if (!roll.opposed || !system) throw new RealtimeError('NOT_AN_OPPOSED_TEST');
    if (roll.opposed.answered) throw new RealtimeError('ALREADY_ANSWERED');

    const character = await requireRollableCharacter(deps, campaignId, user, payload.characterId);
    const defenderToken = await deps.ctx.prisma.token.findUnique({
      where: { id: system.defenderTokenId },
    });
    if (!defenderToken || defenderToken.characterId !== character.id) {
      throw new RealtimeError('NOT_THE_DEFENDER');
    }

    const registry = deps.ctx.cpred;
    const data = parseCharacterData(character.data, registry);
    const planned = planCpredRoll(
      data,
      registry,
      { kind: 'skill', skillId: CPRED_BRAWLING_SKILL_ID },
      // Whatever the stand-in charged them, the real roll is charged too.
      {
        modifiers: [
          ...sheetSituationModifiers({
            grappled: system.defenderModifier !== 0,
            injuries: data.criticalInjuries,
          }),
          ...facedownRows(defenderToken, system.attackerTokenId),
        ],
      },
    );
    if (!planned.ok) throw new RealtimeError(planned.error);

    const gesture: RollGesture | undefined = sanitizeGesture(payload.gesture);
    const defence = rollFormula(planned.plan.formula, createMixedRng(gesture?.entropy), {
      checkRule: true,
    });
    const verdict = judgeSheetGrapple(roll.total, defence.total);

    // The contest is re-decided from scratch: whatever the stand-in produced is
    // undone, and the real roll's answer put in its place.
    const scene = await deps.ctx.prisma.scene.findUnique({ where: { id: defenderToken.sceneId } });
    if (scene) {
      const combat = await loadCombat(deps.ctx.prisma, scene.id);
      const attackerRow =
        combat?.combatants.find((row) => row.id === system.attackerCombatantId) ?? null;
      const targetRow =
        combat?.combatants.find((row) => row.id === system.defenderCombatantId) ?? null;
      if (verdict.won) {
        await applyGrappleVerdict(
          deps,
          campaignId,
          combat,
          system,
          system.intent,
          attackerRow,
          targetRow,
        );
      } else if (system.intent === 'hold' && combat && targetRow) {
        // The stand-in said „held" and the real roll says otherwise: let go.
        const pair = findGrapple(combat, targetRow);
        if (pair && pair.attacker.id === system.attackerCombatantId) {
          await endGrapple(deps, campaignId, pair.defender);
        }
      }
      if (combat) await emitReloaded(deps, campaignId, scene, combat.id);
    }

    const updated: RollResult = {
      ...roll,
      opposed: {
        ...roll.opposed,
        won: verdict.won,
        answered: true,
        detail: `${roll.opposed.detail} · Obrona ${character.name}: ${defence.total} → ${
          verdict.won ? 'mimo wszystko udane' : 'wywinął się'
        }`,
      },
    };
    const saved = await deps.ctx.prisma.chatMessage.update({
      where: { id: message.id },
      data: { payload: JSON.stringify(updated) },
      include: INCLUDE_CHAT_NAMES,
    });
    await broadcastRedactedChatMessage(deps, campaignId, toChatMessageView(saved), 'chat:update');
    return { total: defence.total, won: verdict.won };
  },
});

/* ------------------------------------------------------------------ *
 * What a Hold makes possible
 * ------------------------------------------------------------------ */

const GRAPPLE_ACTION_IDS: Record<CombatGrappleActionPayload['kind'], string> = {
  choke: CPRED_ACTION_CHOKE,
  throw: CPRED_ACTION_THROW,
  'human-shield': CPRED_ACTION_HUMAN_SHIELD,
  release: CPRED_ACTION_RELEASE_GRAPPLE,
};

/**
 * Duszenie, Rzut, Ludzka tarcza and letting go. All four need an existing Hold
 * and all four belong to the Attacker; only the first three cost an Action —
 * releasing is free „w dowolnym momencie".
 */
export const grappleActionEvent = defineEvent<CombatGrappleActionPayload, CombatView>({
  name: 'grapple:action',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const kind = payload?.kind;
    if (kind !== 'choke' && kind !== 'throw' && kind !== 'human-shield' && kind !== 'release') {
      throw new RealtimeError('BAD_REQUEST');
    }
    const { combat, combatant, scene } = await myCombatant(
      deps,
      campaignId,
      user,
      socket.data.viewedSceneId,
      payload?.combatantId,
    );
    const defender = requireHoldAsAttacker(combat, combatant);
    const actionId = GRAPPLE_ACTION_IDS[kind];

    if (kind === 'release') {
      await endGrapple(deps, campaignId, defender);
      await logSpentAction(deps, campaignId, user, {
        ...actionEntry(combatant, actionId, sheetActionName(actionId), defender.token.name),
      });
      return emitReloaded(deps, campaignId, scene, combat.id);
    }

    // Everything else is an Action, booked before it happens (stage 14b).
    await requireTurnSpend(
      deps,
      campaignId,
      scene,
      combatant.tokenId,
      { kind: 'action', actionId },
      user,
      actionId,
      // Choking and throwing post a damage card of their own; the shield does
      // not, so its line is the only trace the table gets.
      { silent: kind !== 'human-shield' },
    );

    if (kind === 'human-shield') {
      await deps.ctx.prisma.combatant.update({
        where: { id: defender.id },
        data: { humanShield: true },
      });
      return emitReloaded(deps, campaignId, scene, combat.id);
    }

    const body = await attackerBody(deps, combatant);
    const rounds =
      kind === 'choke'
        ? nextSheetChokeStreak(defender.chokeRound, combat.round, defender.chokeStreak)
        : 0;

    const applied = await applyGrappleDamage(deps, campaignId, defender, {
      body,
      kind,
      roundsInARow: rounds,
    });

    if (kind === 'choke') {
      await deps.ctx.prisma.combatant.update({
        where: { id: defender.id },
        data: { chokeStreak: rounds, chokeRound: combat.round },
      });
      if (applied.unconscious) {
        await addTokenStatus(deps, campaignId, defender.tokenId, SHEET_UNCONSCIOUS_STATUS_ID);
      }
    } else {
      // „Rzucając cel, automatycznie kończysz go Trzymać ... a rzucony jest
      // Przewrócony" — both halves, in that order.
      await endGrapple(deps, campaignId, defender);
      await addTokenStatus(deps, campaignId, defender.tokenId, SHEET_PRONE_STATUS_ID);
    }

    await logGrappleDamage(deps, campaignId, user, defender, applied, kind, rounds);
    return emitReloaded(deps, campaignId, scene, combat.id);
  },
});

/** The Attacker's BODY — the damage. A statist without a sheet punches at 5. */
async function attackerBody(deps: RealtimeDeps, combatant: FiguredCombatantRow): Promise<number> {
  const characterId = combatant.token.character?.id;
  if (!characterId) return 5;
  const character = await deps.ctx.prisma.character.findUnique({
    where: { id: characterId },
    select: { data: true },
  });
  return character ? readSheetBody(character, deps.ctx.cpred) : 5;
}

/** Writes the damage to whichever of the two places holds the target's HP. */
async function applyGrappleDamage(
  deps: RealtimeDeps,
  campaignId: string,
  defender: FiguredCombatantRow,
  request: { body: number; kind: 'choke' | 'throw'; roundsInARow: number },
): Promise<SheetGrappleDamage & { characterId: string | null }> {
  const characterId = defender.token.character?.id ?? null;
  if (characterId) {
    const character = await deps.ctx.prisma.character.findUnique({ where: { id: characterId } });
    if (character) {
      const applied = applyGrappleDamageToSheet(character, deps.ctx.cpred, request);
      const saved = await deps.ctx.prisma.character.update({
        where: { id: character.id },
        data: { data: applied.data! },
      });
      await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, deps.ctx.cpred));
      await emitTokensOfCharacter(deps, campaignId, saved);
      return { ...applied, characterId };
    }
  }
  const hp: TokenHp | null =
    defender.token.hpMax === null
      ? null
      : { current: defender.token.hpCurrent ?? 0, max: defender.token.hpMax };
  if (!hp) throw new RealtimeError('TOKEN_HAS_NO_HP');
  const applied = applyGrappleDamageToTokenHp(hp, request);
  await deps.ctx.prisma.token.update({
    where: { id: defender.tokenId },
    data: {
      hpCurrent: applied.hp.current,
      statuses: JSON.stringify(
        sheetWoundStatuses(readTokenStatuses(defender.token.statuses), applied.hp),
      ),
    },
  });
  await emitTokensById(deps, campaignId, [defender.tokenId]);
  return { ...applied, characterId: null };
}

/**
 * The damage card. Deliberately the stage 15 shape, so „Cofnij" works on a
 * choke exactly as it works on a bullet — and so the HP stay redacted to the
 * GM and the target's owner.
 */
async function logGrappleDamage(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  defender: FiguredCombatantRow,
  applied: SheetGrappleDamage & { characterId: string | null },
  kind: 'choke' | 'throw',
  rounds: number,
): Promise<void> {
  const note =
    kind === 'choke'
      ? `Duszenie${rounds > 1 ? ` (runda ${rounds} z rzędu)` : ''}${
          applied.unconscious ? ' — Nieprzytomny' : ''
        }`
      : 'Rzut — cel Powalony';
  const entry: DamageLogEntry = {
    ...applied.log,
    targetTokenId: defender.tokenId,
    targetName: defender.token.name,
    characterId: applied.characterId,
    targetOwnerId: defender.token.character?.ownerId ?? defender.token.ownerId,
    injuryNote: note,
    // „Cofnij" has to take the sticker off too, or a restored character stays
    // unconscious for reasons nobody can see.
    ...(kind === 'choke' && applied.unconscious
      ? { statusesAdded: [SHEET_UNCONSCIOUS_STATUS_ID] }
      : {}),
    ...(kind === 'throw' ? { statusesAdded: [SHEET_PRONE_STATUS_ID] } : {}),
  };
  const stored = await deps.ctx.prisma.chatMessage.create({
    data: {
      campaignId,
      authorId: user.id,
      kind: 'damage',
      text: `${defender.token.name} — ${note}`,
      payload: JSON.stringify(entry),
    },
    include: INCLUDE_CHAT_NAMES,
  });
  await broadcastRedactedChatMessage(deps, campaignId, toChatMessageView(stored));
}
