import type {
  CharacterHagglePayload,
  CharacterView,
  CpredCharacterData,
  RollOpposedMeta,
  RollResult,
} from '@vtt/shared';
import {
  cpredEffectiveStats,
  cpredSkillLevel,
  CPRED_HAGGLE_SKILL_ID,
  CPRED_OPERATOR_ABILITY,
  ROLE_GM,
  cpredHaggleDeal,
  cpredHaggleProblem,
  cpredRoleAbilityRank,
  mergeCharacterData,
  parseCharacterData,
  readCpredHaggleOpponent,
  rollFormula,
  cpredSheetWoundCondition,
  cpredWoundPenaltyRows,
} from '@vtt/shared';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { refuseInCombat } from './combat-lock.js';
import { emitCharacterUpsert, toCharacterView, refuseAwaitingGm } from './character-io.js';
import { INCLUDE_CHAT_NAMES, deliverRollMessage, toChatMessageView } from './chat-io.js';
import { sanitizeGesture } from './chat.js';
import { createMixedRng } from './dice-rng.js';
import { merchantCounterBonus, requireHaggleCounter } from './merchant.js';

/**
 * Targowanie się — the Fixer's Znajomości in the one place they touch money
 * (stage 30d, s. 159; stage 71e, G20).
 *
 * „Gdy z kimś się targujesz, rzucasz CHA + Handel + Poziom Zdolności Specjalnej
 * Znajomości + 1k10 przeciw rzutowi przeciwnika: CHA + Handel + jego Znajomości
 * (jeśli jest Fixerem) + 1k10."
 *
 * What follows from that sentence and shapes this whole file:
 *
 *  - **Both sides roll here.** Od 71e druga strona ma liczbę z prawdziwego
 *    źródła: przy ladzie handlarza to jego karta (CHA + Handel + Znajomości,
 *    `merchantCounterBonus`), poza sklepem — suma, którą MG wpisał na kartę
 *    Fixera (`haggleOpponent`, zużywa ją jeden rzut). Gracz sam jej nie wpisuje
 *    — w 71b targ wygrywał się z drugą stroną „0”.
 *  - **A win is stored, not announced.** „Jeśli rzut ci się udał, możesz dobić
 *    jednego targu o poziomie Znajomości lub niższym" — the bargain outlives
 *    the roll, so it goes onto the sheet and the next transaction spends it.
 *    Targ dobity przy ladzie działa tylko u tego handlarza.
 *  - **One at a time.** „W czasie jednej transakcji można dobić tylko jednego
 *    targu", so the sheet holds one struck bargain, and one roll per counter
 *    until a transaction there (`counterHaggle`) — inaczej rzucałoby się do
 *    skutku.
 *  - **Nie-Fixer też rzuca przy ladzie handlarza-Fixera** (FAQ, FIX-14): bez
 *    targu, „poziom Znajomości (jeśli masz)” to 0, a wygrana zdejmuje cięcie
 *    skupu.
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
    refuseAwaitingGm(character, user);

    const data = parseCharacterData(character.data, deps.ctx.cpred);
    const rank = cpredRoleAbilityRank(data, deps.ctx.cpred, CPRED_OPERATOR_ABILITY);

    // Etap 71e (G20): MG podaje sumę drugiej strony do targu poza sklepem.
    // Nic nie rzuca — rzuca potem Fixer, a rzut ją zużywa.
    if (payload?.opponent !== undefined) {
      if (!isGm) throw new RealtimeError('FORBIDDEN');
      if (rank === null) throw new RealtimeError('NO_ABILITY');
      const opponent = payload.opponent === null ? null : readCpredHaggleOpponent(payload.opponent);
      if (payload.opponent !== null && opponent === null) throw new RealtimeError('BAD_VALUE');
      const view = await saveSheet(deps, campaign.id, character.id, data, {
        haggleOpponent: opponent,
      });
      return { won: false, dealId: null, character: view };
    }

    // 21.10.2026: targ to zakupy, a w walce się nie kupuje (zrzucenie niżej
    // przechodzi zawsze).
    if (payload?.clear !== true) await refuseInCombat(deps.ctx.prisma, campaign.id, user);

    // Dropping the bargain is free and rolls nothing: a Fixer who used the deal
    // at the table rather than in the shop has to be able to say so. Rzut przy
    // ladzie zostaje (blokuje drugi u tego handlarza) — zdejmuje go transakcja
    // albo MG.
    if (payload?.clear === true) {
      const view = await saveSheet(deps, campaign.id, character.id, data, {
        haggle: null,
        ...(isGm ? { counterHaggle: null } : {}),
      });
      return { won: false, dealId: null, character: view };
    }

    // Lada handlarza (G20, FIX-01, FIX-14): druga strona to jego karta.
    const atCounter = typeof payload?.merchantId === 'string' && payload.merchantId.length > 0;
    const merchant = atCounter
      ? await requireHaggleCounter(deps, socket, campaign.id, payload!.merchantId, character.id)
      : null;
    if (merchant && data.counterHaggle?.merchantId === merchant.row.id) {
      throw new RealtimeError('ALREADY_HAGGLED');
    }

    const wantsDeal = typeof payload?.dealId === 'string';
    let opponentBonus: number;
    let opponentName = '';
    let spendsOpponent = false;
    if (merchant) {
      opponentBonus = merchantCounterBonus(deps, merchant.data);
      opponentName = merchant.name;
      // Bez targu rzut przy ladzie ma sens tylko u handlarza-Fixera (FAQ).
      if (!wantsDeal && merchant.saleCut === 0) throw new RealtimeError('NOTHING_TO_HAGGLE');
    } else if (rank === null) {
      // Poza ladą targuje się tylko Fixer — bez Zdolności nie ma o co pytać MG.
      throw new RealtimeError('NO_ABILITY');
    } else if (isGm && typeof payload?.opponentBonus === 'number') {
      // MG rzuca za Fixera z karty i podaje liczbę od ręki.
      opponentBonus = Math.round(payload.opponentBonus);
    } else if (data.haggleOpponent) {
      opponentBonus = data.haggleOpponent.bonus;
      opponentName = data.haggleOpponent.label;
      spendsOpponent = true;
    } else {
      throw new RealtimeError('NO_OPPONENT');
    }

    const deal = wantsDeal || !merchant ? cpredHaggleDeal(String(payload?.dealId ?? '')) : null;
    if (wantsDeal || !merchant) {
      const problem = cpredHaggleProblem(rank, payload?.dealId, opponentBonus);
      if (problem !== null) throw new RealtimeError(problem);
    }
    if (deal?.id === 'halfLater' && data.halfLaterClosed) throw new RealtimeError('DEAL_CLOSED');

    // CHA is the effective one (stage 23a) — a Fixer who sold Empathy to a
    // ripperdoc haggles with what is left, the same as on every other Check.
    const cool = cpredEffectiveStats(data).cool;
    const trading = cpredSkillLevel(data, CPRED_HAGGLE_SKILL_ID);
    // „poziom Znajomości (jeśli masz)” — nie-Fixer rzuca bez niego (FAQ).
    const operator = rank ?? 0;
    // Kara za rany razem ze Stymem i Edytorem bólu — te same wiersze co w Teście.
    const woundRows = cpredWoundPenaltyRows(cpredSheetWoundCondition(data));
    const wound = woundRows.reduce((sum, row) => sum + row.value, 0);
    const bonus = cool + trading + operator + wound;

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
    const title = deal ? `Targowanie się: ${deal.name}` : 'Targowanie się przy ladzie';
    const versus = `${mine.total} vs ${theirs.total}`;
    mine.title = title;
    mine.actor = character.name;
    mine.breakdown = [
      { label: 'CHA', value: cool, kind: 'stat' },
      { label: trading > 0 ? 'Handel' : 'Handel (nietrenowany)', value: trading, kind: 'skill' },
      ...(rank !== null
        ? [{ label: `${CPRED_OPERATOR_ABILITY} ${rank}`, value: rank, kind: 'skill' as const }]
        : []),
      ...woundRows,
    ];
    const system: HaggleCardSystem = {
      dealId: deal?.id ?? '',
      dealName: deal?.name ?? '',
      fixerTotal: mine.total,
      opponentTotal: theirs.total,
    };
    const side = opponentName ? `${opponentName}: ` : 'druga strona: ';
    const opposed: RollOpposedMeta = {
      system,
      label: title,
      detail: `${versus} (${side}${opponentBonus} + 1k10)`,
      won,
    };
    mine.opposed = opposed;
    const cutText = merchant && merchant.saleCut > 0 ? ` — skup u niego −${merchant.saleCut}%` : '';
    mine.outcome = {
      success: won,
      label: won ? (deal ? 'Targ dobity' : 'Cena bazowa') : 'Nie tym razem',
      detail: won
        ? deal
          ? deal.text
          : `${merchant!.name} skupi od ciebie bez urywania.`
        : `${versus} — remis też przegrywa, targuje się druga strona${cutText}`,
    };
    if (gesture && gesture.strength > 0) mine.tossStrength = gesture.strength;
    if (gesture?.toss) mine.toss = gesture.toss;

    const stored = await deps.ctx.prisma.chatMessage.create({
      data: {
        campaignId: campaign.id,
        authorId: user.id,
        kind: 'roll',
        text: title,
        payload: JSON.stringify(mine),
      },
      include: INCLUDE_CHAT_NAMES,
    });
    await deliverRollMessage(deps, campaign.id, user.id, toChatMessageView(stored));

    const struck =
      won && deal
        ? {
            dealId: deal.id,
            discount: deal.discount ?? 0,
            note: versus,
            ...(merchant ? { merchantId: merchant.row.id } : {}),
          }
        : null;
    const patch: Partial<CpredCharacterData> = {
      // Nowy targ nadpisuje stary — jeden na kartę. Przegrana go nie zdejmuje:
      // nie umówiłeś się na nic nowego, stary dalej czeka.
      ...(struck ? { haggle: struck } : {}),
      ...(merchant ? { counterHaggle: { merchantId: merchant.row.id, won, note: versus } } : {}),
      ...(spendsOpponent ? { haggleOpponent: null } : {}),
    };
    const view = await saveSheet(deps, campaign.id, character.id, data, patch);
    return { won, dealId: struck ? deal!.id : null, character: view };
  },
});

/** Zapisuje pola targu na karcie i rozsyła ją. */
async function saveSheet(
  deps: RealtimeDeps,
  campaignId: string,
  characterId: string,
  data: CpredCharacterData,
  patch: Partial<CpredCharacterData>,
): Promise<CharacterView> {
  const merged = mergeCharacterData(data, patch);
  const saved = await deps.ctx.prisma.character.update({
    where: { id: characterId },
    data: { data: JSON.stringify(merged) },
  });
  const view = toCharacterView(saved, deps.ctx.cpred);
  await emitCharacterUpsert(deps, campaignId, view);
  return view;
}
