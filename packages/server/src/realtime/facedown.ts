import type {
  ChatMessageView,
  CombatFacedownConcedePayload,
  CombatFacedownPayload,
  CombatFacedownResistPayload,
  ReputationRecognisePayload,
  RollGesture,
  RollOpposedMeta,
  RollResult,
  SessionUser,
} from '@vtt/shared';
import {
  CPRED_FACEDOWN_PENALTY,
  ROLE_GM,
  cpredRecognises,
  isTokenInFog,
  parseCharacterData,
  planCpredRoll,
  rollFormula,
} from '@vtt/shared';
import type { Character, Token } from '../generated/prisma/client.js';
import type { PrismaClient } from '../db.js';
import {
  SHEET_INTIMIDATED_STATUS_ID,
  SHEET_STATIST_FACEDOWN_TOTAL,
  readSheetFearedTokens,
  readSheetPassiveFacedown,
  readSheetReputation,
  sheetFacedownPenalty,
  sheetSituationModifiers,
  writeSheetFearedTokens,
} from '../sheets.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { loadCombat, readTokenStatuses, requireCampaignId } from './combat.js';
import { requireRollableCharacter } from './character-rolls.js';
import { emitTokensById, requireCampaignToken, toTokenView } from './tokens.js';
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
import { findGrapple } from './combat.js';

/**
 * Konfrontacja (stage 23c) — „pojedynek spojrzeń i siły woli" (s. 194).
 *
 * Built on the Pochwycenie machinery of 14d rather than beside it: the same
 * stand-in DV, the same „the other side may answer with real dice", the same
 * stored card rewritten in place. Three things make it its own file anyway,
 * and each of them is a rule:
 *
 *  - **It costs nothing and needs no fight.** RAW puts a Konfrontacja *before*
 *    the shooting starts, and the action catalogue of 14b does not list it. So
 *    no `requireTurnSpend`, no combat row, no reach — two people who can see
 *    each other can stare at each other.
 *  - **A draw is a result.** „W przypadku remisu obie strony nie są pewne
 *    wyniku i nic się nie dzieje" overrides the „remis = obrona wygrywa" rule
 *    every other opposed test in this project obeys, which is why the card
 *    carries a three-valued `outcome` beside the boolean `won`.
 *  - **The loser chooses their own punishment.** „Przegrany może: Wycofać się…
 *    albo Nie wycofywać się, ale otrzymać modyfikator −2" — so the roll settles
 *    *who* lost and nothing else. The −2 lands only when somebody presses the
 *    button, which is the difference between a VTT that enforces the rules and
 *    one that makes the ruling.
 *
 * The −2 itself is not applied here either. It rides on the loser's token as
 * the „Onieśmielony" sticker plus a list of whom they are afraid of, and is
 * spliced into rolls by the paths that know who is being aimed at (`attacks.ts`,
 * `grapple.ts`, and this file's own re-match).
 */

/** What travels on the card so a later click can re-judge the same contest. */
interface FacedownCardSystem extends Record<string, unknown> {
  challengerTokenId: string;
  challengerName: string;
  defenderTokenId: string;
  defenderName: string;
  /** The stand-in total the challenger rolled against. */
  defenderTotal: number;
  /** True once the defender replaced that stand-in with real dice. */
  defenderRolled: boolean;
}

/** Sheet of a token, when it has one. */
async function sheetOf(prisma: PrismaClient, token: Token): Promise<Character | null> {
  if (!token.characterId) return null;
  return prisma.character.findUnique({ where: { id: token.characterId } });
}

/**
 * The token this character is staring with: the one named, or their only one on
 * the scene. Mirrors `resolveGrapplerToken` in the Pochwycenie path.
 */
async function resolveChallengerToken(
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

/**
 * A player must not be able to confirm a hidden token by naming its id — the
 * same concealment gate an attack passes through (stage 16).
 */
async function requireVisibleTarget(
  deps: RealtimeDeps,
  user: SessionUser,
  target: Token,
  scene: Parameters<typeof toSceneView>[0],
  ownCharacterId: string,
): Promise<void> {
  if (user.role === ROLE_GM) return;
  if (target.hidden) throw new RealtimeError('TOKEN_NOT_FOUND');
  const fog = await fetchFogState(deps.ctx.prisma, scene);
  const controlled =
    target.ownerId === user.id ||
    (target.characterId !== null && target.characterId === ownCharacterId);
  if (
    fog.enabled &&
    !controlled &&
    isTokenInFog(toTokenView(target, false), toSceneView(scene), fog)
  ) {
    throw new RealtimeError('TOKEN_NOT_FOUND');
  }
}

/** Is this token in a Hold right now? Decides the −2 the Hold puts on it. */
async function isTokenGrappled(
  deps: RealtimeDeps,
  sceneId: string,
  tokenId: string,
): Promise<boolean> {
  const combat = await loadCombat(deps.ctx.prisma, sceneId);
  if (!combat) return false;
  const row = combat.combatants.find((entry) => entry.tokenId === tokenId);
  return row ? findGrapple(combat, row) !== null : false;
}

/**
 * Everything the world adds to one side's Konfrontacja roll: the Hold, the
 * wounds, and — the point of this stage — the last Konfrontacja they lost to
 * *this* opponent. A re-match is an Action aimed at them like any other.
 */
function facedownModifiers(
  token: Token,
  data: ReturnType<typeof parseCharacterData>,
  grappled: boolean,
  opponentTokenId: string,
) {
  const penalty = sheetFacedownPenalty(
    { statuses: readTokenStatuses(token.statuses), statusData: token.statusData },
    opponentTokenId,
  );
  return [
    ...sheetSituationModifiers({ grappled, injuries: data.criticalInjuries }),
    ...(penalty ? [penalty] : []),
  ];
}

/** The total of a side that is not rolling: their sheet's, or a statist's 5+5. */
async function standInTotal(
  deps: RealtimeDeps,
  token: Token,
): Promise<{ total: number; hasSheet: boolean }> {
  const sheet = await sheetOf(deps.ctx.prisma, token);
  if (!sheet) return { total: SHEET_STATIST_FACEDOWN_TOTAL, hasSheet: false };
  return { total: readSheetPassiveFacedown(sheet, deps.ctx.cpred), hasSheet: true };
}

/**
 * „CHA + Reputacja* + 1k10" — one Konfrontacja, from the challenger's side.
 *
 * Reputation enters as a named breakdown row rather than as part of the stat,
 * so the card can say where the number came from: „Reputacja 4 (Koncert w
 * Afterlife)" reads as an explanation, and „CHA 11" reads as a bug report.
 */
export const facedownAttemptEvent = defineEvent<
  CombatFacedownPayload<RollGesture>,
  { messageId: number }
>({
  name: 'facedown:attempt',
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
    await requireVisibleTarget(deps, user, target, scene, character.id);

    const challenger = await resolveChallengerToken(
      deps,
      campaignId,
      character,
      target.sceneId,
      payload?.challengerTokenId,
    );
    if (challenger.id === target.id) throw new RealtimeError('FACEDOWN_SELF');

    const reputation = readSheetReputation(character, registry);
    const grappled = await isTokenGrappled(deps, scene.id, challenger.id);
    const planned = planCpredRoll(
      data,
      registry,
      {
        kind: 'stat',
        statId: 'cool',
        ...(payload?.modifier !== undefined ? { modifier: payload.modifier } : {}),
        ...(payload?.luckSpent !== undefined ? { luckSpent: payload.luckSpent } : {}),
      },
      {
        modifiers: [
          ...(reputation.level > 0 ? [reputationEntry(reputation)] : []),
          ...facedownModifiers(challenger, data, grappled, target.id),
        ],
      },
    );
    if (!planned.ok) throw new RealtimeError(planned.error);

    const stand = await standInTotal(deps, target);
    const gesture: RollGesture | undefined = sanitizeGesture(payload?.gesture);
    const result: RollResult = rollFormula(planned.plan.formula, createMixedRng(gesture?.entropy), {
      checkRule: true,
    });
    result.title = `Konfrontacja → ${target.name}`;
    result.actor = character.name;
    result.breakdown = planned.plan.breakdown;
    if (gesture && gesture.strength > 0) result.tossStrength = gesture.strength;
    if (gesture?.toss) result.toss = gesture.toss;

    const system: FacedownCardSystem = {
      challengerTokenId: challenger.id,
      challengerName: character.name,
      defenderTokenId: target.id,
      defenderName: target.name,
      defenderTotal: stand.total,
      defenderRolled: false,
    };
    result.opposed = buildFacedownMeta(system, result.total, stand.hasSheet);

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
    return { messageId: view.id };
  },
});

/** „Reputacja 4 (Koncert w Afterlife)" — the asterisked half of the roll. */
function reputationEntry(reputation: ReturnType<typeof readSheetReputation>) {
  const note = reputation.source?.note.trim();
  const kind = reputation.notorious ? 'zła sława' : 'Reputacja';
  return {
    label: note ? `${kind} ${reputation.level} (${note})` : `${kind} ${reputation.level}`,
    value: reputation.notorious ? -reputation.level : reputation.level,
    kind: 'situational' as const,
  };
}

/**
 * The card's verdict block. Three states, and the loser's prompt hangs off the
 * third — a draw asks nobody for anything.
 */
function buildFacedownMeta(
  system: FacedownCardSystem,
  challengerTotal: number,
  defenderHasSheet: boolean,
): RollOpposedMeta {
  const margin = challengerTotal - system.defenderTotal;
  const outcome: 'win' | 'tie' | 'loss' = margin > 0 ? 'win' : margin < 0 ? 'loss' : 'tie';
  const source = system.defenderRolled
    ? `${system.defenderName}: ${system.defenderTotal}`
    : `${system.defenderName}: ${system.defenderTotal} (CHA + Reputacja + pół kości)`;
  const detail = [
    'pojedynek spojrzeń',
    source,
    ...(defenderHasSheet || system.defenderRolled ? [] : ['cel bez karty postaci']),
  ].join(' · ');

  const loser =
    outcome === 'win'
      ? {
          loserTokenId: system.defenderTokenId,
          winner: system.challengerTokenId,
          winnerName: system.challengerName,
        }
      : outcome === 'loss'
        ? {
            loserTokenId: system.challengerTokenId,
            winner: system.defenderTokenId,
            winnerName: system.defenderName,
          }
        : null;

  return {
    system: { ...system },
    label: `Konfrontacja: ${system.challengerName} ↔ ${system.defenderName}`,
    detail,
    // Kept for the core card renderer, which knows only „udane / nieudane".
    won: outcome === 'win',
    outcome,
    // Only a defender with a sheet, who has not already used it, may answer.
    ...(defenderHasSheet && !system.defenderRolled
      ? { defenderTokenId: system.defenderTokenId, answerLabel: 'Postaw się' }
      : {}),
    ...(loser
      ? {
          concede: {
            loserTokenId: loser.loserTokenId,
            winnerTokenId: loser.winner,
            winnerName: loser.winnerName,
          },
        }
      : {}),
  };
}

/** Loads a stored Konfrontacja card, or refuses with the reason. */
async function loadFacedownCard(
  deps: RealtimeDeps,
  campaignId: string,
  messageId: unknown,
): Promise<{ id: number; roll: RollResult; opposed: RollOpposedMeta; system: FacedownCardSystem }> {
  if (typeof messageId !== 'number' || !Number.isInteger(messageId)) {
    throw new RealtimeError('BAD_REQUEST');
  }
  const message = await deps.ctx.prisma.chatMessage.findUnique({ where: { id: messageId } });
  if (!message || message.campaignId !== campaignId || !message.payload) {
    throw new RealtimeError('MESSAGE_NOT_FOUND');
  }
  const roll = JSON.parse(message.payload) as RollResult;
  const system = roll.opposed?.system as FacedownCardSystem | undefined;
  if (!roll.opposed || !system || typeof system.challengerTokenId !== 'string') {
    throw new RealtimeError('NOT_AN_OPPOSED_TEST');
  }
  return { id: message.id, roll, opposed: roll.opposed, system };
}

/** Writes the rewritten card back and pushes it to everyone who may read it. */
async function saveFacedownCard(
  deps: RealtimeDeps,
  campaignId: string,
  messageId: number,
  roll: RollResult,
): Promise<void> {
  const saved = await deps.ctx.prisma.chatMessage.update({
    where: { id: messageId },
    data: { payload: JSON.stringify(roll) },
    include: INCLUDE_CHAT_NAMES,
  });
  await broadcastRedactedChatMessage(deps, campaignId, toChatMessageView(saved), 'chat:update');
}

/**
 * „Postaw się": the other side replaces the stand-in with real dice.
 *
 * Refused once somebody has accepted the consequence — the dice may keep
 * falling right up until the moment the contest has a settled meaning, and not
 * one click after.
 */
export const facedownResistEvent = defineEvent<
  CombatFacedownResistPayload<RollGesture>,
  { total: number; outcome: 'win' | 'tie' | 'loss' }
>({
  name: 'facedown:resist',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const card = await loadFacedownCard(deps, campaignId, payload?.messageId);
    if (card.opposed.answered) throw new RealtimeError('ALREADY_ANSWERED');
    if (card.opposed.concede?.chosen) throw new RealtimeError('FACEDOWN_ALREADY_SETTLED');

    const character = await requireRollableCharacter(deps, campaignId, user, payload?.characterId);
    const defenderToken = await deps.ctx.prisma.token.findUnique({
      where: { id: card.system.defenderTokenId },
    });
    if (!defenderToken || defenderToken.characterId !== character.id) {
      throw new RealtimeError('NOT_THE_DEFENDER');
    }

    const registry = deps.ctx.cpred;
    const data = parseCharacterData(character.data, registry);
    const reputation = readSheetReputation(character, registry);
    const grappled = await isTokenGrappled(deps, defenderToken.sceneId, defenderToken.id);
    const planned = planCpredRoll(
      data,
      registry,
      { kind: 'stat', statId: 'cool' },
      {
        modifiers: [
          ...(reputation.level > 0 ? [reputationEntry(reputation)] : []),
          ...facedownModifiers(defenderToken, data, grappled, card.system.challengerTokenId),
        ],
      },
    );
    if (!planned.ok) throw new RealtimeError(planned.error);

    const gesture: RollGesture | undefined = sanitizeGesture(payload?.gesture);
    const answer = rollFormula(planned.plan.formula, createMixedRng(gesture?.entropy), {
      checkRule: true,
    });

    const system: FacedownCardSystem = {
      ...card.system,
      defenderTotal: answer.total,
      defenderRolled: true,
    };
    const opposed = buildFacedownMeta(system, card.roll.total, true);
    const updated: RollResult = {
      ...card.roll,
      opposed: {
        ...opposed,
        answered: true,
        detail: `${opposed.detail} · odpowiedź: ${describeBreakdown(planned.plan.breakdown)}`,
      },
    };
    await saveFacedownCard(deps, campaignId, card.id, updated);
    return { total: answer.total, outcome: opposed.outcome ?? 'tie' };
  },
});

/** „CHA 7 + Reputacja 4" — the answering roll's arithmetic, in one line. */
function describeBreakdown(breakdown: readonly { label: string; value: number }[]): string {
  const named = breakdown.filter((entry) => entry.value !== 0);
  return named.length === 0
    ? '1k10'
    : named
        .map((entry) => `${entry.label} ${entry.value > 0 ? '+' : '−'}${Math.abs(entry.value)}`)
        .join(', ');
}

/**
 * The loser's decision (s. 194). Withdrawing costs nothing but the ground they
 * were standing on; standing costs −2 against that one opponent until they beat
 * them, which is what the sticker on the token means.
 */
export const facedownConcedeEvent = defineEvent<
  CombatFacedownConcedePayload,
  { choice: 'withdraw' | 'stand' }
>({
  name: 'facedown:concede',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const choice = payload?.choice;
    if (choice !== 'withdraw' && choice !== 'stand') throw new RealtimeError('BAD_REQUEST');

    const card = await loadFacedownCard(deps, campaignId, payload?.messageId);
    const concede = card.opposed.concede;
    if (!concede) throw new RealtimeError('FACEDOWN_NO_LOSER');
    if (concede.chosen) throw new RealtimeError('FACEDOWN_ALREADY_SETTLED');

    const { token: loser } = await requireCampaignToken(
      deps.ctx.prisma,
      campaignId,
      concede.loserTokenId,
    );
    if (!(await controlsToken(deps, user, loser)))
      throw new RealtimeError('FACEDOWN_NOT_THE_LOSER');

    if (choice === 'stand') {
      await fearToken(deps, campaignId, loser, concede.winnerTokenId);
    }

    const updated: RollResult = {
      ...card.roll,
      opposed: {
        ...card.opposed,
        concede: { ...concede, chosen: choice },
        detail:
          choice === 'stand'
            ? `${card.opposed.detail} · ${loser.name} nie ustąpił — −${Math.abs(
                CPRED_FACEDOWN_PENALTY,
              )} do Akcji przeciw ${concede.winnerName}`
            : `${card.opposed.detail} · ${loser.name} wycofał się`,
      },
    };
    await saveFacedownCard(deps, campaignId, card.id, updated);
    return { choice };
  },
});

/** May this user speak for that token? Its owner, its sheet's owner, or the GM. */
async function controlsToken(
  deps: RealtimeDeps,
  user: SessionUser,
  token: Token,
): Promise<boolean> {
  if (user.role === ROLE_GM) return true;
  if (token.ownerId === user.id) return true;
  if (!token.characterId) return false;
  const character = await deps.ctx.prisma.character.findUnique({
    where: { id: token.characterId },
    select: { ownerId: true },
  });
  return character?.ownerId === user.id;
}

/** Puts (or refreshes) the „Onieśmielony" sticker and the address behind it. */
async function fearToken(
  deps: RealtimeDeps,
  campaignId: string,
  loser: Token,
  winnerTokenId: string,
): Promise<void> {
  const statuses = readTokenStatuses(loser.statuses);
  const next = statuses.includes(SHEET_INTIMIDATED_STATUS_ID)
    ? statuses
    : [...statuses, SHEET_INTIMIDATED_STATUS_ID];
  const feared = [...readSheetFearedTokens(loser.statusData), winnerTokenId];
  await deps.ctx.prisma.token.update({
    where: { id: loser.id },
    data: {
      statuses: JSON.stringify(next),
      statusData: writeSheetFearedTokens(loser.statusData, feared),
    },
  });
  await emitTokensById(deps, campaignId, [loser.id]);
}

/**
 * „Znika, gdy tylko uda ci się pokonać wroga" (s. 194).
 *
 * Called from the damage path when somebody goes down, for every token on the
 * scene that was afraid of them. Read-time checking would have been cheaper and
 * would have left the sticker sitting on the map after the reason for it had
 * bled out — and a badge nobody can explain is worse than a missing rule.
 */
export async function clearFacedownFear(
  deps: RealtimeDeps,
  campaignId: string,
  sceneId: string,
  beatenTokenId: string,
): Promise<void> {
  const tokens = await deps.ctx.prisma.token.findMany({
    where: { sceneId, statuses: { contains: SHEET_INTIMIDATED_STATUS_ID } },
  });
  const touched: string[] = [];
  for (const token of tokens) {
    const feared = readSheetFearedTokens(token.statusData);
    if (!feared.includes(beatenTokenId)) continue;
    const left = feared.filter((id) => id !== beatenTokenId);
    const statuses = readTokenStatuses(token.statuses);
    await deps.ctx.prisma.token.update({
      where: { id: token.id },
      data: {
        // Afraid of somebody else too? Then the sticker stays and only the
        // address of the one who just fell comes off the list.
        statuses: JSON.stringify(
          left.length > 0 ? statuses : statuses.filter((id) => id !== SHEET_INTIMIDATED_STATUS_ID),
        ),
        statusData: writeSheetFearedTokens(token.statusData, left),
      },
    });
    touched.push(token.id);
  }
  if (touched.length > 0) await emitTokensById(deps, campaignId, touched);
}

/**
 * „Czy go znam?" (s. 193) — 1k10 against the other person's Reputation.
 *
 * Not a Check: no stat, no skill, no wound penalty, no Luck. It answers a
 * question about the world, and the answer is delivered like a whisper —
 * knowing who somebody is on the Street is not table-wide knowledge, and a
 * public card would tell everyone that the stranger has a Reputation at all.
 */
export const reputationRecogniseEvent = defineEvent<
  ReputationRecognisePayload,
  { messageId: number; roll: number; known: boolean }
>({
  name: 'reputation:recognise',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const character = await requireRollableCharacter(deps, campaignId, user, payload?.characterId);
    const { token: target, scene } = await requireCampaignToken(
      deps.ctx.prisma,
      campaignId,
      payload?.targetTokenId,
    );
    await requireVisibleTarget(deps, user, target, scene, character.id);

    const sheet = await sheetOf(deps.ctx.prisma, target);
    const reputation = sheet
      ? readSheetReputation(sheet, deps.ctx.cpred)
      : { level: 0, notorious: false, source: null };

    // `checkRule: false` on purpose. „Przy pierwszym spotkaniu Postacie rzucają
    // 1k10" — a flat die, not a Check: a natural 10 must not explode into 17
    // and recognise everybody in Night City, and a natural 1 must not fumble
    // into a negative number that recognises nobody twice over.
    const result: RollResult = rollFormula(
      { terms: [{ kind: 'dice', count: 1, sides: 10, sign: 1 }] },
      createMixedRng(),
      { checkRule: false },
    );
    const known = cpredRecognises(result.total, reputation.level);
    result.title = `Czy znam: ${target.name}?`;
    result.actor = character.name;
    result.outcome = {
      success: known,
      // Naming the level on a miss would leak exactly what the roll failed to
      // learn, so the number only appears once it has been earned.
      label: known
        ? `Znasz tę osobę — Reputacja ${reputation.level}${
            reputation.source?.note ? ` (${reputation.source.note})` : ''
          }`
        : 'Nic ci to imię nie mówi',
      detail: known
        ? `1k10 = ${result.total} < Reputacja ${reputation.level}`
        : `1k10 = ${result.total}`,
    };

    const stored = await deps.ctx.prisma.chatMessage.create({
      data: {
        campaignId,
        authorId: user.id,
        kind: 'roll',
        text: result.title,
        payload: JSON.stringify(result),
        sceneId: scene.id,
        // A whisper to oneself: the GM sees every roll anyway (stage 06), and
        // nobody else at the table gets to overhear who recognises whom.
        recipientId: user.id,
      },
      include: INCLUDE_CHAT_NAMES,
    });
    const view = toChatMessageView(stored);
    await deliverRollMessage(deps, campaignId, user.id, view);
    return { messageId: view.id, roll: result.total, known };
  },
});
