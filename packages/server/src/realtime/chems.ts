/**
 * Chemia na karcie (etap 59b/59c) — narkotyki, alkohol, Zryw, limity
 * farmaceutyków, trucizna na ostrzu i ręka MG.
 *
 * Zażycie wchodzi przez `character:use-dose` (`recovery.ts`), bo przy stole
 * to ta sama czynność co zastrzyk Medyka: Akcja, strzykawka, sobie albo komuś
 * w zasięgu ramienia, siłą — Atak bronią białą. Różnica jest jedna: narkotyku
 * nie broni bramka Medyka („nie są to narkotyki uliczne”, s. 150), więc tu
 * mieszka tylko to, co dawka robi z kartą celu.
 *
 * Wszystko, co tu powstaje, jest prywatne (decyzja MG z 24.10.2026): karty
 * czatu idą rodzajem `gmrecovery` do podającego, właściciela celu i MG.
 */

import type { Character, Scene, Token } from '../generated/prisma/client.js';
import type {
  CharacterChemsPayload,
  CharacterCoatWeaponPayload,
  CpredActiveDose,
  CpredBladeCoating,
  CpredCharacterData,
  CpredDrug,
  CpredEffectClock,
  RecoveryLogEntry,
  SessionUser,
} from '@vtt/shared';
import {
  CPRED_ACTION_COAT_BLADE,
  ROLE_GM,
  cpredAddAddiction,
  cpredBladeToxinOfRow,
  cpredClearDoses,
  cpredCoatBlade,
  cpredCoatableWeapon,
  cpredDrug,
  cpredPharmaCooldown,
  cpredRemoveAddiction,
  cpredStatEffectDeadlines,
  cpredTakeDose,
  describeCpredMinutes,
  describeCpredStatEffectTimer,
  isCpredStreetDrugId,
  isWeaponEntry,
  mergeCharacterData,
  parseCharacterData,
  parseRollNotation,
  resolveWeapon,
  rollFormula,
} from '@vtt/shared';
import { emitCharacterUpsert, toCharacterView } from './character-io.js';
import { INCLUDE_CHAT_NAMES, deliverChatMessageTo, toChatMessageView } from './chat-io.js';
import { requireTurnSpend } from './combat-actions.js';
import { buildCompendiumSync } from './compendium.js';
import { createMixedRng } from './dice-rng.js';
import { requireOwnCharacter } from './inventory.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { effectClockForCharacter } from './stat-effects.js';
import { emitTokensOfCharacter } from './tokens.js';

/** Krótkie id wiersza — ta sama długość co `newRowId` u klienta. */
function newChemId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Zapis karty z rozesłaniem — każda zmiana chemii kończy się tym samym. */
async function saveSheet(
  deps: RealtimeDeps,
  campaignId: string,
  character: Character,
  data: CpredCharacterData,
): Promise<Character> {
  const saved = await deps.ctx.prisma.character.update({
    where: { id: character.id },
    data: { data: JSON.stringify(data) },
  });
  await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, deps.ctx.cpred));
  await emitTokensOfCharacter(deps, campaignId, saved);
  return saved;
}

/**
 * Prywatna karta „zastrzyku”: widzi ją autor, adresat (właściciel celu) i MG.
 * `recipientId` pomijany, gdy to ten sam człowiek — gracz kłujący siebie.
 */
export async function postPrivateRecoveryCard(
  deps: RealtimeDeps,
  campaignId: string,
  authorId: string,
  recipientId: string | null,
  entry: RecoveryLogEntry,
  sceneId: string | null | undefined,
): Promise<void> {
  const stored = await deps.ctx.prisma.chatMessage.create({
    data: {
      campaignId,
      authorId,
      ...(recipientId && recipientId !== authorId ? { recipientId } : {}),
      kind: 'gmrecovery',
      text: entry.title,
      payload: JSON.stringify(entry),
      ...(sceneId ? { sceneId } : {}),
    },
    include: INCLUDE_CHAT_NAMES,
  });
  await deliverChatMessageTo(
    deps,
    campaignId,
    toChatMessageView(stored),
    [authorId, recipientId],
    true,
  );
}

/** Co dawka zrobiła — przypis i zabarwienie karty czatu. */
export interface ChemOutcome {
  note?: string;
  tone?: 'success' | 'warn';
}

/**
 * Dawka narkotyku albo alkoholu na kartę celu (etap 59b).
 *
 * Czarna szpryca rzuca 2k6 Człowieczeństwa **przy każdej dawce** i zapisuje je
 * na dawce — wraca po udanym rzucie na uzależnienie (59c). Rzut przy zażyciu,
 * nie przy odczycie: liczba pada raz (umowa `czas`).
 */
export async function applyDrugDose(
  deps: RealtimeDeps,
  campaignId: string,
  drug: CpredDrug,
  target: { character: Character | null; scene: Scene | null },
): Promise<ChemOutcome> {
  if (!target.character) {
    return { note: 'Figura bez karty postaci nie ma gdzie zapisać tej dawki.', tone: 'warn' };
  }
  const clock = await effectClockForCharacter(
    deps,
    campaignId,
    target.character.id,
    target.scene?.id,
  );
  const data = parseCharacterData(target.character.data, deps.ctx.cpred);
  let lost = 0;
  if (drug.humanityLoss) {
    const parsed = parseRollNotation(drug.humanityLoss);
    if (parsed.ok) {
      lost = Math.min(data.humanityCurrent, rollFormula(parsed.formula, createMixedRng()).total);
    }
  }
  const taken = cpredTakeDose(
    data.chems,
    drug,
    cpredStatEffectDeadlines(clock, drug.durationS),
    newChemId,
    lost,
  );
  await saveSheet(
    deps,
    campaignId,
    target.character,
    mergeCharacterData(data, {
      chems: taken.chems,
      ...(lost > 0 ? { humanityCurrent: data.humanityCurrent - lost } : {}),
    }),
  );

  const timer = describeCpredStatEffectTimer(taken.dose, clock);
  const parts = [
    taken.how === 'extended' ? `Kolejna dawka wydłuża działanie — ${timer}.` : `Działa: ${timer}.`,
  ];
  if (taken.dropped) parts.push('Najstarsza dawka wypada — naraz działają najwyżej trzy.');
  if (lost > 0) {
    parts.push(`Człowieczeństwo −${lost} (wraca, jeśli rzut po końcu działania się uda).`);
  }
  if (
    isCpredStreetDrugId(drug.id) &&
    data.chems.addictions.includes(drug.id) &&
    drug.addiction?.whenSober
  ) {
    parts.push('Głód ustępuje na czas działania.');
  }
  return { note: parts.join(' ') };
}

/**
 * Dynadetoks: „organizm błyskawicznie oczyszcza się z narkotyków, trucizn
 * i alkoholu” — zdejmuje działające dawki **bez** rzutu na uzależnienie
 * (decyzja MG z 24.10.2026) i oddaje Człowieczeństwo Czarnej szprycy, bo efekt
 * dodatkowy nie zdążył zadziałać. Zrywu nie rusza — to farmaceutyk.
 */
export async function cleanseDrugs(
  deps: RealtimeDeps,
  campaignId: string,
  character: Character,
): Promise<CpredActiveDose[]> {
  const data = parseCharacterData(character.data, deps.ctx.cpred);
  const cleared = cpredClearDoses(data.chems, (dose) => cpredDrug(dose.substanceId) === null);
  if (cleared.removed.length === 0) return [];
  const back = cleared.removed.reduce((sum, dose) => sum + (dose.humanityLost ?? 0), 0);
  await saveSheet(
    deps,
    campaignId,
    character,
    mergeCharacterData(data, {
      chems: cleared.chems,
      ...(back > 0 ? { humanityCurrent: data.humanityCurrent + back } : {}),
    }),
  );
  return cleared.removed;
}

/* ------------------------------------------------------------------ *
 * Farmaceutyki z limitem
 * ------------------------------------------------------------------ */

/**
 * „Skuteczny tylko raz dziennie” — przypis odmowy albo `null`, gdy dawka
 * zadziała. Fiolka i tak jest pusta (to samo, co Turbo uzdrawiacz podany
 * Śmiertelnie Rannemu). Zwraca też zegar, żeby wołający zapisał chwilę.
 */
export async function pharmaLimitRefusal(
  deps: RealtimeDeps,
  campaignId: string,
  pharma: { id: string; name: string; limit?: string },
  target: { character: Character | null; scene: Scene | null },
): Promise<{ refusal: string | null; clock: CpredEffectClock | null }> {
  if (!target.character || !pharma.limit) return { refusal: null, clock: null };
  const clock = await effectClockForCharacter(
    deps,
    campaignId,
    target.character.id,
    target.scene?.id,
  );
  const data = parseCharacterData(target.character.data, deps.ctx.cpred);
  const wait = cpredPharmaCooldown(data.chems, pharma.id, clock.minutes);
  return {
    refusal:
      wait > 0
        ? `Bez skutku — ${pharma.limit.replace(/^Skuteczny/, 'skuteczny').replace(/\.$/, '')}. ` +
          `Następna skuteczna dawka za ${describeCpredMinutes(wait)}.`
        : null,
    clock,
  };
}

/**
 * Zapisuje chwilę skutecznej dawki farmaceutyku z limitem — i Zryw jako
 * działającą dawkę na dobę (chip z odliczaniem na karcie).
 */
export async function markPharmaTaken(
  deps: RealtimeDeps,
  campaignId: string,
  characterId: string,
  pharma: { id: string; name: string },
  clock: CpredEffectClock,
  zrywS?: number,
): Promise<void> {
  const character = await deps.ctx.prisma.character.findUnique({ where: { id: characterId } });
  if (!character) return;
  const data = parseCharacterData(character.data, deps.ctx.cpred);
  let chems = data.chems;
  if (clock.minutes !== null) {
    chems = { ...chems, lastTaken: { ...chems.lastTaken, [pharma.id]: clock.minutes } };
  }
  if (zrywS !== undefined) {
    chems = cpredTakeDose(
      chems,
      { id: pharma.id, name: pharma.name, durationS: zrywS },
      cpredStatEffectDeadlines(clock, zrywS),
      newChemId,
    ).chems;
  }
  if (chems === data.chems) return;
  await saveSheet(deps, campaignId, character, mergeCharacterData(data, { chems }));
}

/* ------------------------------------------------------------------ *
 * Trucizna na ostrzu
 * ------------------------------------------------------------------ */

/**
 * „Fiolka …, którą w ramach Akcji można rozsmarować po ostrzu lub głowicy
 * lekkiej broni białej” (s. 353). Akcja przed skutkiem, jak przy zastrzyku:
 * odmowa „nie masz już Akcji” nie ma prawa zjeść fiolki.
 */
export const characterCoatWeaponEvent = defineEvent<
  CharacterCoatWeaponPayload,
  { qtyLeft: number; coating: CpredBladeCoating }
>({
  name: 'character:coat-weapon',
  handler: async ({ deps, socket, user, payload }) => {
    const campaign = socket.data.campaign;
    if (!campaign) throw new RealtimeError('NO_CAMPAIGN');
    const character = await requireOwnCharacter(
      deps.ctx.prisma,
      campaign.id,
      user,
      payload?.characterId,
    );
    const data = parseCharacterData(character.data, deps.ctx.cpred);
    const vial = data.gear.find((row) => row.id === payload?.gearRowId);
    const toxin = vial ? cpredBladeToxinOfRow(vial) : null;
    if (!vial || !toxin) throw new RealtimeError('NOT_A_TOXIN');
    if (vial.qty < 1) throw new RealtimeError('NO_DOSES_LEFT');
    const weapon = data.weapons.find((row) => row.id === payload?.weaponRowId);
    if (!weapon) throw new RealtimeError('UNKNOWN_WEAPON');
    await requireLightBlade(deps, campaign.id, weapon.compendiumId);

    await spendCoatAction(deps, campaign.id, user, character, `${toxin.name} → ${weapon.name}`);

    const clock = await effectClockForCharacter(
      deps,
      campaign.id,
      character.id,
      socket.data.viewedSceneId,
    );
    const coated = cpredCoatBlade(
      data.chems,
      weapon.id,
      toxin,
      cpredStatEffectDeadlines(clock, toxin.durationS),
      newChemId,
    );
    const qtyLeft = vial.qty - 1;
    await saveSheet(
      deps,
      campaign.id,
      character,
      mergeCharacterData(data, {
        chems: coated.chems,
        gear: data.gear.map((row) => (row.id === vial.id ? { ...row, qty: qtyLeft } : { ...row })),
      }),
    );
    await postPrivateRecoveryCard(
      deps,
      campaign.id,
      user.id,
      character.ownerId,
      {
        actor: character.name,
        title: `${toxin.name} → ${weapon.name}`,
        hp: 0,
        lines: [
          `Trafienie tą bronią to Test Odporności na tortury/narkotyki PT ${toxin.check.dv} ` +
            `zamiast obrażeń; porażka — ${toxin.check.failure.damage} bezpośrednich.`,
        ],
        note: `Działa: ${describeCpredStatEffectTimer(coated.coating, clock)}.`,
        tone: 'success',
      },
      socket.data.viewedSceneId,
    );
    return { qtyLeft, coating: coated.coating };
  },
});

/** Odmowa, gdy broń nie jest lekką bronią białą z katalogu (`cpredCoatableWeapon`). */
async function requireLightBlade(
  deps: RealtimeDeps,
  campaignId: string,
  compendiumId: string | undefined,
): Promise<void> {
  if (!compendiumId) throw new RealtimeError('NOT_A_LIGHT_BLADE');
  const compendium = await buildCompendiumSync(deps, campaignId);
  const entry = compendium.entries.find((candidate) => candidate.id === compendiumId);
  if (!entry || !isWeaponEntry(entry)) throw new RealtimeError('NOT_A_LIGHT_BLADE');
  const weaponTypeById = new Map(compendium.weaponTypes.map((type) => [type.id, type]));
  if (!cpredCoatableWeapon(entry.weaponTypeId, resolveWeapon(entry, { weaponTypeById }))) {
    throw new RealtimeError('NOT_A_LIGHT_BLADE');
  }
}

/** Akcja za rozsmarowanie — tylko gdy figura postaci stoi na scenie z walką. */
async function spendCoatAction(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  character: Character,
  note: string,
): Promise<void> {
  const tokens: (Token & { scene: Scene })[] = await deps.ctx.prisma.token.findMany({
    where: { characterId: character.id, scene: { campaignId } },
    include: { scene: true },
  });
  for (const token of tokens) {
    const combat = await deps.ctx.prisma.combat.findUnique({ where: { sceneId: token.sceneId } });
    if (!combat) continue;
    await requireTurnSpend(
      deps,
      campaignId,
      token.scene,
      token.id,
      { kind: 'action', actionId: CPRED_ACTION_COAT_BLADE },
      user,
      CPRED_ACTION_COAT_BLADE,
      { silent: true, note },
    );
    return;
  }
}

/* ------------------------------------------------------------------ *
 * Ręka MG
 * ------------------------------------------------------------------ */

/**
 * MG zdejmuje dawkę albo truciznę, prowadzi terapię (s. 229 — koszt i Test
 * rozlicza stół) albo dopisuje uzależnienie z historii postaci. Zdjęcie dawki
 * ręką nie rzuca na uzależnienie i oddaje Człowieczeństwo Czarnej szprycy —
 * to poprawka MG, nie koniec działania.
 */
export const characterChemsEvent = defineEvent<CharacterChemsPayload, { ok: true }>({
  name: 'character:chems',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaign = socket.data.campaign;
    if (!campaign) throw new RealtimeError('NO_CAMPAIGN');
    if (typeof payload?.characterId !== 'string') throw new RealtimeError('BAD_REQUEST');
    const character = await deps.ctx.prisma.character.findUnique({
      where: { id: payload.characterId },
    });
    if (!character || character.campaignId !== campaign.id) {
      throw new RealtimeError('CHARACTER_NOT_FOUND');
    }
    const data = parseCharacterData(character.data, deps.ctx.cpred);
    let next: CpredCharacterData | null = null;

    if (typeof payload.removeDoseId === 'string') {
      const cleared = cpredClearDoses(data.chems, (dose) => dose.id !== payload.removeDoseId);
      const removed = cleared.removed[0];
      if (!removed) throw new RealtimeError('EFFECT_NOT_FOUND');
      next = mergeCharacterData(data, {
        chems: cleared.chems,
        ...(removed.humanityLost
          ? { humanityCurrent: data.humanityCurrent + removed.humanityLost }
          : {}),
      });
    } else if (typeof payload.removeCoatingId === 'string') {
      if (!data.chems.coatings.some((row) => row.id === payload.removeCoatingId)) {
        throw new RealtimeError('EFFECT_NOT_FOUND');
      }
      next = mergeCharacterData(data, {
        chems: {
          ...data.chems,
          coatings: data.chems.coatings.filter((row) => row.id !== payload.removeCoatingId),
        },
      });
    } else if (typeof payload.removeAddiction === 'string') {
      if (!data.chems.addictions.some((id) => id === payload.removeAddiction)) {
        throw new RealtimeError('EFFECT_NOT_FOUND');
      }
      next = mergeCharacterData(data, {
        chems: cpredRemoveAddiction(data.chems, payload.removeAddiction),
      });
    } else if (isCpredStreetDrugId(payload.addAddiction)) {
      next = mergeCharacterData(data, {
        chems: cpredAddAddiction(data.chems, payload.addAddiction),
      });
    } else {
      throw new RealtimeError('BAD_REQUEST');
    }
    await saveSheet(deps, campaign.id, character, next);
    return { ok: true };
  },
});
