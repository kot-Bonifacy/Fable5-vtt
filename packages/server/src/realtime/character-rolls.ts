import type {
  ChatMessageView,
  CharacterRollPayload,
  CpredCharacterData,
  CpredRollRequest,
  RollGesture,
  RollResult,
  SessionUser,
} from '@vtt/shared';
import {
  DEATH_SAVES_MAX,
  ROLE_GM,
  hitLocationLabel,
  mergeCharacterData,
  parseCharacterData,
  planCpredRoll,
  resolveCpredDeathSave,
  rollFormula,
} from '@vtt/shared';
import type { Character } from '../generated/prisma/client.js';
import { createMixedRng } from './dice-rng.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { emitCharacterUpsert, toCharacterView } from './character-io.js';
import { emitTokensById, emitTokensOfCharacter } from './tokens.js';
import { INCLUDE_CHAT_NAMES, deliverRollMessage, toChatMessageView } from './chat-io.js';
import { sanitizeGesture } from './chat.js';

/**
 * Sheet-driven checks (stage 08). The client only sends an intention — which
 * skill/stat, the situational modifier, how much Luck to spend and whether
 * the result is public. The server re-derives every modifier from the stored
 * sheet (including the automatic wound penalty), spends the Luck, rolls with
 * its own RNG and delivers the result like any other roll:
 * public → campaign broadcast with a seq, GM → targeted to the author and GMs.
 */

/** Rolling a character requires owning it (the GM may roll anything). */
export async function requireRollableCharacter(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  characterId: unknown,
): Promise<Character> {
  if (typeof characterId !== 'string' || characterId.length === 0) {
    throw new RealtimeError('BAD_REQUEST');
  }
  const character = await deps.ctx.prisma.character.findUnique({ where: { id: characterId } });
  // Unknown and foreign characters are indistinguishable to a player — the
  // existence of someone else's sheet must not leak.
  if (!character || character.campaignId !== campaignId) {
    throw new RealtimeError('CHARACTER_NOT_FOUND');
  }
  if (user.role !== ROLE_GM && character.ownerId !== user.id) {
    throw new RealtimeError('CHARACTER_NOT_FOUND');
  }
  return character;
}

/** The natural die of a roll — the first die of the first dice term. */
function firstDieRoll(result: RollResult): number {
  for (const term of result.terms) {
    if (term.kind === 'dice' && term.rolls.length > 0) return term.rolls[0]!;
  }
  return 0;
}

/**
 * Books a Death Save on the sheet: the counter makes every later save harder
 * (RAW +1 each), and a failed one marks the character dead — a status the GM
 * can lift, because at the table „umierasz" is still a scene, not a checkbox.
 */
async function recordDeathSave(
  deps: RealtimeDeps,
  campaignId: string,
  character: Character,
  data: CpredCharacterData,
  survived: boolean,
): Promise<void> {
  const updated = mergeCharacterData(data, {
    deathSaves: Math.min(data.deathSaves + 1, DEATH_SAVES_MAX),
  });
  const saved = await deps.ctx.prisma.character.update({
    where: { id: character.id },
    data: { data: JSON.stringify(updated) },
  });
  await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, deps.ctx.cpred));
  await emitTokensOfCharacter(deps, campaignId, saved);
  if (!survived) await markTokensDead(deps, campaignId, saved.id);
}

/** Puts the „Martwy" badge on every token bound to the character. */
async function markTokensDead(
  deps: RealtimeDeps,
  campaignId: string,
  characterId: string,
): Promise<void> {
  const tokens = await deps.ctx.prisma.token.findMany({
    where: { characterId },
    include: { scene: true },
  });
  const changed: string[] = [];
  for (const row of tokens) {
    if (row.scene.campaignId !== campaignId) continue;
    let statuses: string[];
    try {
      const parsed: unknown = JSON.parse(row.statuses);
      statuses = Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      statuses = [];
    }
    if (statuses.includes(DEAD_STATUS_ID)) continue;
    await deps.ctx.prisma.token.update({
      where: { id: row.id },
      data: { statuses: JSON.stringify([...statuses, DEAD_STATUS_ID]) },
    });
    changed.push(row.id);
  }
  if (changed.length > 0) await emitTokensById(deps, campaignId, changed);
}

/** Status id from `data/public/cpred/statuses.json`. */
const DEAD_STATUS_ID = 'dead';

/**
 * Fills in the parts of a damage request that follow from an attack (stage 16).
 *
 * The client sends `attackMessageId` and nothing else about the damage; the
 * notation, the autofire multiplier, the hit location and the target all come
 * off the stored attack, so nobody can roll a ×4 burst that never happened.
 */
async function resolveRollRequest(
  deps: RealtimeDeps,
  campaignId: string,
  raw: CpredRollRequest | undefined,
): Promise<CpredRollRequest> {
  const request: CpredRollRequest = { ...(raw ?? ({} as CpredRollRequest)) };
  // Never trust these off the wire — they are server-filled by design.
  delete request.damageNotation;
  delete request.damageMultiplier;
  delete request.targetTokenId;
  if (request.kind !== 'damage' || request.attackMessageId === undefined) return request;

  if (!Number.isInteger(request.attackMessageId)) throw new RealtimeError('BAD_REQUEST');
  const message = await deps.ctx.prisma.chatMessage.findUnique({
    where: { id: request.attackMessageId },
  });
  if (!message || message.campaignId !== campaignId || !message.payload) {
    throw new RealtimeError('MESSAGE_NOT_FOUND');
  }
  const roll = JSON.parse(message.payload) as RollResult;
  const attack = roll.attack;
  if (!attack || attack.hit !== true) throw new RealtimeError('NOT_A_HIT');

  const system = attack.system as { location?: unknown; weaponRowId?: unknown };
  return {
    ...request,
    ...(typeof system.weaponRowId === 'string' ? { weaponRowId: system.weaponRowId } : {}),
    ...(system.location === 'head' ? { location: 'head' as const } : { location: 'body' as const }),
    ...(attack.damageNotation ? { damageNotation: attack.damageNotation } : {}),
    ...(attack.damageMultiplier ? { damageMultiplier: attack.damageMultiplier } : {}),
    ...(attack.targetTokenId ? { targetTokenId: attack.targetTokenId } : {}),
  };
}

export const characterRollEvent = defineEvent<
  CharacterRollPayload<CpredRollRequest>,
  { messageId: number }
>({
  name: 'character:roll',
  handler: async ({ deps, socket, user, payload }) => {
    const campaign = socket.data.campaign;
    if (!campaign) throw new RealtimeError('NO_CAMPAIGN');
    const character = await requireRollableCharacter(deps, campaign.id, user, payload?.characterId);

    const registry = deps.ctx.cpred;
    const data = parseCharacterData(character.data, registry);
    const request = await resolveRollRequest(deps, campaign.id, payload?.request);
    const planned = planCpredRoll(data, registry, request);
    if (!planned.ok) throw new RealtimeError(planned.error);
    const { plan } = planned;

    const visibility: 'public' | 'gm' = payload?.visibility === 'gm' ? 'gm' : 'public';
    const gesture: RollGesture | undefined = sanitizeGesture(payload?.gesture);

    // Luck is spent whether the roll succeeds or not (RAW: declared upfront).
    if (plan.luckSpent > 0) {
      const spent = mergeCharacterData(data, { luckCurrent: data.luckCurrent - plan.luckSpent });
      const saved = await deps.ctx.prisma.character.update({
        where: { id: character.id },
        data: { data: JSON.stringify(spent) },
      });
      await emitCharacterUpsert(deps, campaign.id, toCharacterView(saved, registry));
      await emitTokensOfCharacter(deps, campaign.id, saved);
    }

    const result: RollResult = rollFormula(plan.formula, createMixedRng(gesture?.entropy), {
      checkRule: plan.checkRule,
    });
    result.title = plan.title;
    result.actor = character.name;
    result.breakdown = plan.breakdown;
    if (gesture && gesture.strength > 0) result.tossStrength = gesture.strength;
    if (gesture?.toss) result.toss = gesture.toss;

    // Damage rolls carry what „Zastosuj na celu" needs; the total itself is
    // read back from this stored message when the GM applies it.
    if (plan.damage) {
      result.damage = {
        location: plan.damage.location,
        locationLabel: hitLocationLabel(plan.damage.location),
        weaponName: plan.damage.weaponName,
        ...(plan.damage.ignoreArmor ? { ignoreArmor: true } : {}),
        ...(plan.damage.multiplier ? { multiplier: plan.damage.multiplier } : {}),
        ...(plan.damage.targetTokenId ? { targetTokenId: plan.damage.targetTokenId } : {}),
      };
    }

    // A Death Save is judged by the rules, not by the reader: the card shows
    // the verdict, and the sheet's counter makes the next save harder.
    if (plan.deathSave) {
      const natural = firstDieRoll(result);
      const outcome = resolveCpredDeathSave(natural, plan.deathSave);
      result.outcome = {
        success: outcome.survived,
        label: outcome.survived ? 'Przeżywa' : 'Śmierć',
        detail: outcome.automaticFailure
          ? 'Naturalna 10 — automatyczna porażka'
          : outcome.modifier > 0
            ? `${outcome.natural} + ${outcome.modifier} = ${outcome.total} · próg BC ${outcome.target}`
            : `${outcome.natural} · próg BC ${outcome.target}`,
      };
      await recordDeathSave(deps, campaign.id, character, data, outcome.survived);
    }

    const kind = visibility === 'gm' ? 'gmroll' : 'roll';
    const stored = await deps.ctx.prisma.chatMessage.create({
      data: {
        campaignId: campaign.id,
        authorId: user.id,
        kind,
        text: plan.title,
        payload: JSON.stringify(result),
      },
      include: INCLUDE_CHAT_NAMES,
    });
    const view: ChatMessageView = toChatMessageView(stored);
    await deliverRollMessage(deps, campaign.id, user.id, view);
    return { messageId: view.id };
  },
});
