import type {
  ChatMessageView,
  CharacterRollPayload,
  CpredRollRequest,
  RollGesture,
  RollResult,
  SessionUser,
} from '@vtt/shared';
import {
  ROLE_GM,
  mergeCharacterData,
  parseCharacterData,
  planCpredCheck,
  rollFormula,
} from '@vtt/shared';
import type { Character } from '../generated/prisma/client.js';
import { createMixedRng } from './dice-rng.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { emitCharacterUpsert, toCharacterView } from './character-io.js';
import { emitTokensOfCharacter } from './tokens.js';
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
async function requireRollableCharacter(
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
    const planned = planCpredCheck(data, registry, payload?.request ?? ({} as CpredRollRequest));
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

    const result: RollResult = rollFormula(plan.formula, createMixedRng(gesture?.entropy));
    result.title = plan.title;
    result.actor = character.name;
    result.breakdown = plan.breakdown;
    if (gesture && gesture.strength > 0) result.tossStrength = gesture.strength;
    if (gesture?.toss) result.toss = gesture.toss;

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
