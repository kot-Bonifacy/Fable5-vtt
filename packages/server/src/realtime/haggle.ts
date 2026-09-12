import type {
  CharacterHagglePayload,
  CharacterView,
  RollOpposedMeta,
  RollResult,
} from '@vtt/shared';
import {
  cpredEffectiveStats,
  CPRED_HAGGLE_SKILL_ID,
  CPRED_OPERATOR_ABILITY,
  ROLE_GM,
  cpredHaggleDeal,
  cpredHaggleProblem,
  cpredRoleAbilityRank,
  mergeCharacterData,
  parseCharacterData,
  rollFormula,
  woundCheckPenalty,
  woundState,
} from '@vtt/shared';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { emitCharacterUpsert, toCharacterView } from './character-io.js';
import { INCLUDE_CHAT_NAMES, deliverRollMessage, toChatMessageView } from './chat-io.js';
import { sanitizeGesture } from './chat.js';
import { createMixedRng } from './dice-rng.js';

/**
 * Targowanie się — the Fixer's Znajomości in the one place they touch money
 * (stage 30d, s. 159).
 *
 * „Gdy z kimś się targujesz, rzucasz CHA + Handel + Poziom Zdolności Specjalnej
 * Znajomości + 1k10 przeciw rzutowi przeciwnika: CHA + Handel + jego Znajomości
 * (jeśli jest Fixerem) + 1k10."
 *
 * Three things follow from that sentence and shape this whole file:
 *
 *  - **Both sides roll here.** The other side of a haggle is a shopkeeper, a
 *    Fixer across town, a corpo buyer — fiction, not a sheet on this table. So
 *    the GM names one number (their CHA + Handel + Znajomości) and the d10 falls
 *    on the server, next to the Fixer's own. Asking for the three parts
 *    separately would be asking three times for one answer.
 *  - **A win is stored, not announced.** „Jeśli rzut ci się udał, możesz dobić
 *    jednego targu o poziomie Znajomości lub niższym" — the bargain outlives
 *    the roll, so it goes onto the sheet and the next purchase spends it. That
 *    is why this is an event and not a `character:roll` kind.
 *  - **One at a time.** „W czasie jednej transakcji można dobić tylko jednego
 *    targu", so the sheet holds one struck bargain; a second win overwrites it,
 *    which is what a Fixer who haggled again would expect.
 *
 * Ties go to the other side, like every other opposed test in this project.
 */

/** What the card keeps so the panel can explain a chip nobody remembers. */
interface HaggleCardSystem extends Record<string, unknown> {
  dealId: string;
  dealName: string;
  fixerTotal: number;
  opponentTotal: number;
}

export const characterHaggleEvent = defineEvent<
  CharacterHagglePayload,
  { won: boolean; dealId: string | null; character: CharacterView }
>({
  name: 'character:haggle',
  handler: async ({ deps, socket, user, payload }) => {
    const campaign = socket.data.campaign;
    if (!campaign) throw new RealtimeError('NO_CAMPAIGN');
    const character = await deps.ctx.prisma.character.findUnique({
      where: { id: typeof payload?.characterId === 'string' ? payload.characterId : '' },
    });
    if (!character || character.campaignId !== campaign.id) {
      throw new RealtimeError('CHARACTER_NOT_FOUND');
    }
    const isGm = user.role === ROLE_GM;
    if (!isGm && character.ownerId !== user.id) throw new RealtimeError('CHARACTER_NOT_FOUND');

    const data = parseCharacterData(character.data, deps.ctx.cpred);
    const rank = cpredRoleAbilityRank(data, deps.ctx.cpred, CPRED_OPERATOR_ABILITY);

    // Dropping the bargain is free and rolls nothing: a Fixer who used the deal
    // at the table rather than in the shop has to be able to say so.
    if (payload?.clear === true) {
      const cleared = await saveHaggle(deps, campaign.id, character.id, data, null);
      return { won: false, dealId: null, character: cleared };
    }

    const opponentBonus =
      typeof payload?.opponentBonus === 'number' ? Math.round(payload.opponentBonus) : 0;
    const problem = cpredHaggleProblem(rank, payload?.dealId, opponentBonus);
    if (problem !== null) throw new RealtimeError(problem);
    const deal = cpredHaggleDeal(payload!.dealId!)!;

    // CHA is the effective one (stage 23a) — a Fixer who sold Empathy to a
    // ripperdoc haggles with what is left, the same as on every other Check.
    const cool = cpredEffectiveStats(data).cool;
    const trading = data.skills[CPRED_HAGGLE_SKILL_ID] ?? 0;
    const wound = woundCheckPenalty(woundState(data.hpCurrent, data.stats));
    const bonus = cool + trading + rank! + wound;

    const gesture = sanitizeGesture(payload?.gesture);
    const rng = createMixedRng(gesture?.entropy);
    // A Check on both sides: „rzucasz […] + 1k10 przeciw rzutowi przeciwnika"
    // is two Checks, and Checks explode on a ten.
    const mine: RollResult = rollFormula(
      {
        terms: [
          { kind: 'dice', sign: 1, count: 1, sides: 10 },
          ...(bonus !== 0
            ? [
                {
                  kind: 'modifier' as const,
                  sign: (bonus < 0 ? -1 : 1) as 1 | -1,
                  value: Math.abs(bonus),
                },
              ]
            : []),
        ],
      },
      rng,
      { checkRule: true },
    );
    const theirs = rollFormula(
      {
        terms: [
          { kind: 'dice', sign: 1, count: 1, sides: 10 },
          ...(opponentBonus !== 0
            ? [{ kind: 'modifier' as const, sign: 1 as const, value: opponentBonus }]
            : []),
        ],
      },
      rng,
      { checkRule: true },
    );

    const won = mine.total > theirs.total;
    mine.title = `Targowanie się: ${deal.name}`;
    mine.actor = character.name;
    mine.breakdown = [
      { label: 'CHA', value: cool, kind: 'stat' },
      { label: trading > 0 ? 'Handel' : 'Handel (nietrenowany)', value: trading, kind: 'skill' },
      { label: `${CPRED_OPERATOR_ABILITY} ${rank}`, value: rank!, kind: 'skill' },
      ...(wound !== 0 ? [{ label: 'Rany', value: wound, kind: 'wound' as const }] : []),
    ];
    const system: HaggleCardSystem = {
      dealId: deal.id,
      dealName: deal.name,
      fixerTotal: mine.total,
      opponentTotal: theirs.total,
    };
    const opposed: RollOpposedMeta = {
      system,
      label: `Targowanie się: ${deal.name}`,
      detail: `${mine.total} vs ${theirs.total} (druga strona: ${opponentBonus} + 1k10)`,
      won,
    };
    mine.opposed = opposed;
    mine.outcome = {
      success: won,
      label: won ? 'Targ dobity' : 'Nie tym razem',
      detail: won
        ? deal.text
        : `${mine.total} vs ${theirs.total} — remis też przegrywa, targuje się druga strona`,
    };
    if (gesture && gesture.strength > 0) mine.tossStrength = gesture.strength;
    if (gesture?.toss) mine.toss = gesture.toss;

    const stored = await deps.ctx.prisma.chatMessage.create({
      data: {
        campaignId: campaign.id,
        authorId: user.id,
        kind: 'roll',
        text: `Targowanie się: ${deal.name}`,
        payload: JSON.stringify(mine),
      },
      include: INCLUDE_CHAT_NAMES,
    });
    await deliverRollMessage(deps, campaign.id, user.id, toChatMessageView(stored));

    const view = await saveHaggle(
      deps,
      campaign.id,
      character.id,
      data,
      won
        ? {
            dealId: deal.id,
            discount: deal.discount ?? 0,
            note: `${mine.total} vs ${theirs.total}`,
          }
        : null,
    );
    return { won, dealId: won ? deal.id : null, character: view };
  },
});

/** Writes the struck bargain (or clears it) and pushes the sheet out. */
async function saveHaggle(
  deps: RealtimeDeps,
  campaignId: string,
  characterId: string,
  data: Parameters<typeof mergeCharacterData>[0],
  haggle: { dealId: string; discount: number; note: string } | null,
): Promise<CharacterView> {
  const merged = mergeCharacterData(data, { haggle });
  const saved = await deps.ctx.prisma.character.update({
    where: { id: characterId },
    data: { data: JSON.stringify(merged) },
  });
  const view = toCharacterView(saved, deps.ctx.cpred);
  await emitCharacterUpsert(deps, campaignId, view);
  return view;
}
