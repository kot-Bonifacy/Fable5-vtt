/**
 * Koniec działania narkotyku i rzut na uzależnienie (etap 59c).
 *
 * „Po upływie działania Efektu głównego wykonujesz rzut SW + Odporność na
 * tortury/narkotyki + 1k10 przeciw PT Efektu dodatkowego” (s. 227). Rzuca
 * **serwer**, w chwili, w której dawkę zdjęło jedno z dwóch przemiatań
 * (`stat-effects.ts`): gracz nie ma tu niczego do wyboru, a rzut odłożony do
 * kliknięcia nie odbyłby się nigdy, gdy dawka zejdzie nocą w skoku zegara.
 *
 * Karty widzą wyłącznie właściciel postaci i MG (decyzja MG z 24.10.2026):
 * rzut to `gmroll` z adresatem, podsumowanie — prywatna karta `gmrecovery`.
 *
 * Osobny plik, bo woła go `stat-effects.ts`, a `chems.ts` (zażycie, guziki MG)
 * importuje `stat-effects.ts` po zegar — jeden plik zamknąłby cykl importów
 * (pułapka `czas`).
 */

import type { Character } from '../generated/prisma/client.js';
import type {
  CpredActiveDose,
  CpredBladeCoating,
  CpredCharacterData,
  DiceRng,
  RecoveryLogEntry,
  RollResult,
} from '@vtt/shared';
import {
  cpredAddAddiction,
  cpredAddictionRollDue,
  cpredBladeToxin,
  cpredDrug,
  isCpredStreetDrugId,
  mergeCharacterData,
  parseCharacterData,
  planCpredRoll,
  rollFormula,
} from '@vtt/shared';
import { sheetForRoll } from '../sheets.js';
import { campaignGmUser } from './campaign-gm.js';
import { emitCharacterUpsert, toCharacterView } from './character-io.js';
import { INCLUDE_CHAT_NAMES, deliverChatMessageTo, toChatMessageView } from './chat-io.js';
import { createMixedRng } from './dice-rng.js';
import type { RealtimeDeps } from './registry.js';
import { emitTokensOfCharacter } from './tokens.js';

/** „Odporność na tortury/narkotyki” — id z rejestru Umiejętności. */
export const RESIST_DRUGS_SKILL_ID = 'resist-torture-drugs';

/** Wynik jednego rzutu na uzależnienie — liczby, bez kart. */
export interface AddictionRoll {
  dose: CpredActiveDose;
  roll: RollResult;
  resisted: boolean;
}

/**
 * Rzuca na uzależnienie za każdą dawkę, przy której jest o co rzucać, i zwraca
 * kartę po rozstrzygnięciu. Czysta wobec bazy — zapis i karty robi wołający.
 *
 * Porażka dopisuje uzależnienie (drugi raz nic nie robi), sukces oddaje
 * Człowieczeństwo zabrane przez Czarną szprycę — do sufitu, który przytnie
 * `normalizeCharacterData`. Porażka niczego nie oddaje: „traci 2k6, które
 * odzyskuje, jeśli nie wpłynie na niego efekt dodatkowy”.
 */
export function rollAddictions(
  data: CpredCharacterData,
  doses: readonly CpredActiveDose[],
  registry: RealtimeDeps['ctx']['cpred'],
  rng: DiceRng = createMixedRng(),
): { data: CpredCharacterData; rolls: AddictionRoll[] } {
  let next = data;
  const rolls: AddictionRoll[] = [];
  for (const dose of doses) {
    const drug = cpredDrug(dose.substanceId);
    if (!drug?.addiction || !isCpredStreetDrugId(drug.id)) continue;
    if (!cpredAddictionRollDue(next.chems, dose)) continue;
    const planned = planCpredRoll(sheetForRoll(next, RESIST_DRUGS_SKILL_ID), registry, {
      kind: 'skill',
      skillId: RESIST_DRUGS_SKILL_ID,
    });
    if (!planned.ok) continue;
    const roll = rollFormula(planned.plan.formula, rng, { checkRule: true });
    const resisted = roll.total > drug.addiction.dv;
    roll.title = `Uzależnienie: ${drug.name}`;
    roll.breakdown = planned.plan.breakdown;
    roll.outcome = {
      success: resisted,
      label: resisted ? 'Bez uzależnienia' : `Uzależnienie od: ${drug.name}`,
      detail: `${roll.total} vs PT ${drug.addiction.dv}`,
    };
    rolls.push({ dose, roll, resisted });
    if (resisted) {
      if ((dose.humanityLost ?? 0) > 0) {
        next = mergeCharacterData(next, {
          humanityCurrent: next.humanityCurrent + (dose.humanityLost ?? 0),
        });
      }
    } else {
      next = mergeCharacterData(next, { chems: cpredAddAddiction(next.chems, drug.id) });
    }
  }
  return { data: next, rolls };
}

/**
 * Po przemiataniu: rzuty, zapis i prywatne karty. Wołane z `expireOne`
 * w `stat-effects.ts` z kartą **już zapisaną** bez zdjętych dawek.
 */
export async function settleExpiredChems(
  deps: RealtimeDeps,
  campaignId: string,
  character: Character,
  doses: readonly CpredActiveDose[],
  coatings: readonly CpredBladeCoating[],
): Promise<Character> {
  if (doses.length === 0 && coatings.length === 0) return character;
  const registry = deps.ctx.cpred;
  const data = parseCharacterData(character.data, registry);
  const settled = rollAddictions(data, doses, registry);
  let saved = character;
  if (settled.rolls.length > 0) {
    saved = await deps.ctx.prisma.character.update({
      where: { id: character.id },
      data: { data: JSON.stringify(settled.data) },
    });
    await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, registry));
    await emitTokensOfCharacter(deps, campaignId, saved);
  }

  const gm = await campaignGmUser(deps.ctx.prisma, campaignId);
  if (!gm) return saved;
  const lines = [
    ...doses.map((dose) => `${dose.source} przestaje działać.`),
    ...coatings.map(
      (row) => `${cpredBladeToxin(row.toxinId)?.name ?? 'Trucizna'} schodzi z ostrza.`,
    ),
  ];
  const results = settled.rolls.map(({ dose, resisted }) => {
    const back = dose.humanityLost ?? 0;
    if (resisted) {
      return back > 0
        ? `${dose.source}: bez uzależnienia, wraca ${back} Człowieczeństwa.`
        : `${dose.source}: bez uzależnienia.`;
    }
    return `${dose.source}: uzależnienie.`;
  });
  const entry: RecoveryLogEntry = {
    actor: character.name,
    title: 'Koniec działania',
    hp: 0,
    lines,
    ...(results.length > 0 ? { note: results.join(' ') } : {}),
    tone: settled.rolls.some((row) => !row.resisted) ? 'warn' : 'success',
  };
  await deliverPrivate(
    deps,
    campaignId,
    gm.id,
    character.ownerId,
    'gmrecovery',
    entry.title,
    entry,
  );
  for (const { roll } of settled.rolls) {
    roll.actor = character.name;
    await deliverPrivate(deps, campaignId, gm.id, character.ownerId, 'gmroll', roll.title!, roll);
  }
  return saved;
}

/** Wiersz ręką MG z adresatem — widzi go właściciel postaci i każdy MG. */
async function deliverPrivate(
  deps: RealtimeDeps,
  campaignId: string,
  authorId: string,
  ownerId: string | null,
  kind: 'gmroll' | 'gmrecovery',
  text: string,
  payload: unknown,
): Promise<void> {
  const stored = await deps.ctx.prisma.chatMessage.create({
    data: {
      campaignId,
      authorId,
      ...(ownerId && ownerId !== authorId ? { recipientId: ownerId } : {}),
      kind,
      text,
      payload: JSON.stringify(payload),
    },
    include: INCLUDE_CHAT_NAMES,
  });
  await deliverChatMessageTo(
    deps,
    campaignId,
    toChatMessageView(stored),
    [authorId, ownerId],
    true,
  );
}
