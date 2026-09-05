/**
 * Efekty czasowe modyfikujące Cechy (etap 39) — nakładanie, zdejmowanie,
 * wygasanie.
 *
 * Dwa wejścia i trzy wyjścia. Wejścia: ręka MG (`character:stat-effect`)
 * i Czarny LOD, który trafił netrunnera (`netice.ts`). Wyjścia: guzik
 * „zdejmij" u MG, przemiatanie rund na granicy tury (`timed-effects.ts`)
 * i przemiatanie zegara świata po skoku MG (`gametime.ts`).
 *
 * Wszystkie pięć dróg schodzi się w `applyStatEffect` i `sweepStatEffects`,
 * i to jest cała reguła architektoniczna tego pliku: efekt, którego termin
 * policzyłaby druga funkcja, byłby efektem, który przy jednym z dwóch zegarów
 * nie schodzi nigdy.
 *
 * **Liczba pada raz.** „1k6" z opisu Nerwosolu jest instrukcją dla chwili
 * nałożenia — serwer rzuca, zapisuje wynik na wierszu i od tej chwili efekt
 * jest liczbą, nie formułą. Efekt trzymający formułę przeliczałby się przy
 * każdym odczycie karty i zmieniałby ją sam, ilekroć ktoś na nią spojrzy.
 */

import type { Character } from '../generated/prisma/client.js';
import type {
  CharacterStatEffectPayload,
  CombatActionLogEntry,
  CpredEffectClock,
  CpredStatEffect,
} from '@vtt/shared';
import {
  CPRED_HOUR_S,
  CPRED_STAT_EFFECTS_MAX,
  CPRED_STAT_EFFECT_DURATION_MAX_S,
  CPRED_STAT_EFFECT_VALUE_MAX,
  ROLE_GM,
  cpredStatEffectDeadlines,
  describeCpredStatEffect,
  isCpredStatId,
  parseRollNotation,
  rollFormula,
} from '@vtt/shared';
import {
  applyStatEffectToSheet,
  expireSheetStatEffects,
  removeStatEffectFromSheet,
} from '../sheets.js';
import { emitCharacterUpsert, toCharacterView } from './character-io.js';
import { INCLUDE_CHAT_NAMES, broadcastChatMessage, toChatMessageView } from './chat-io.js';
import { createMixedRng } from './dice-rng.js';
import { campaignGameTime } from './gametime.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { emitTokensOfCharacter } from './tokens.js';

/** Krótkie id wiersza — ta sama długość co `newRowId` u klienta. */
function newEffectId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Obie wskazówki zegara naraz, dla tej kampanii i tej sceny.
 *
 * Runda bywa `null` (poza starciem), minuta świata nie bywa nigdy — od etapu 37
 * każda kampania ma zegar. Dlatego efekt nałożony poza walką i tak dostaje
 * termin: bez niego wisiałby, dopóki MG go nie zdejmie ręcznie.
 */
export async function effectClock(
  deps: RealtimeDeps,
  campaignId: string,
  sceneId: string | null | undefined,
): Promise<CpredEffectClock> {
  const time = await campaignGameTime(deps.ctx.prisma, campaignId);
  // Rundę czytamy tutaj, a nie przez `activeRoundOfScene` z `timed-effects.ts`:
  // tamten moduł woła **ten**, a dwa importy w obie strony to cykl, który przy
  // pierwszym przestawieniu kolejności wywali się pustym obiektem w środku
  // ładowania. Zapytanie jest jednowierszowe i nie warte tego ryzyka.
  const combat = sceneId ? await deps.ctx.prisma.combat.findUnique({ where: { sceneId } }) : null;
  // Runda 0 znaczy „zebrani, nikt jeszcze nie działał" — nic nie liczy.
  return { round: combat && combat.round >= 1 ? combat.round : null, minutes: time.minutes };
}

/**
 * To samo dla **postaci**, a nie dla sceny, którą akurat ogląda pytający.
 *
 * Różnica jest ostra i wyszła przy pierwszym teście: MG nakłada efekt z okna
 * karty, a okno karty nie zmienia oglądanej sceny — więc `viewedSceneId` bywa
 * pusty albo wskazuje zupełnie inną scenę niż ta, na której figura właśnie się
 * bije. Pytanie „czy coś liczy rundy" dotyczy **celu**, nie widza, więc runda
 * czyta się ze sceny, na której cel stoi. Gdy figur jest kilka, wygrywa ta
 * stojąca w trwającej walce: efekt nałożony w starciu ma zejść na granicy tury.
 */
export async function effectClockForCharacter(
  deps: RealtimeDeps,
  campaignId: string,
  characterId: string,
  fallbackSceneId: string | null | undefined,
): Promise<CpredEffectClock> {
  const tokens = await deps.ctx.prisma.token.findMany({
    where: { characterId, scene: { campaignId } },
    select: { sceneId: true },
  });
  for (const token of tokens) {
    const clock = await effectClock(deps, campaignId, token.sceneId);
    if (clock.round !== null) return clock;
  }
  return effectClock(deps, campaignId, tokens[0]?.sceneId ?? fallbackSceneId);
}

/** Co wołający chce nałożyć — liczba jest już wylosowana. */
export interface StatEffectInput {
  stat: CpredStatEffect['stat'];
  value: number;
  source: string;
  durationS: number;
  compendiumId?: string;
  /** „1k6" — notacja, z której padła liczba; sam napis, do podpowiedzi. */
  rolled?: string;
}

/**
 * Nakłada jeden efekt na kartę i rozsyła zmianę.
 *
 * Zwraca zapisany wiersz albo `null`, gdy lista karty jest pełna. Nie odkłada
 * karty na czacie — o tym rozstrzyga wołający: Czarny LOD dopisuje zdanie do
 * **swojej** karty ataku (jedna karta na jedno trafienie), a MG dostaje własną.
 */
export async function applyStatEffect(
  deps: RealtimeDeps,
  campaignId: string,
  character: Character,
  input: StatEffectInput,
  clock: CpredEffectClock,
): Promise<CpredStatEffect | null> {
  const effect: CpredStatEffect = {
    id: newEffectId(),
    stat: input.stat,
    value: input.value,
    source: input.source,
    durationS: input.durationS,
    ...(input.compendiumId ? { compendiumId: input.compendiumId } : {}),
    ...(input.rolled ? { rolled: input.rolled } : {}),
    ...cpredStatEffectDeadlines(clock, input.durationS),
  };
  const applied = applyStatEffectToSheet(character, deps.ctx.cpred, effect);
  if (!applied) return null;
  const saved = await deps.ctx.prisma.character.update({
    where: { id: character.id },
    data: { data: applied.data },
  });
  await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, deps.ctx.cpred));
  await emitTokensOfCharacter(deps, campaignId, saved);
  return effect;
}

/**
 * Zdejmuje z **każdej** karty kampanii to, czego czas minął.
 *
 * Po kampanii, nie po scenie: efekt „na godzinę" siedzi na karcie, a karta nie
 * musi mieć w tej chwili figury na aktywnej scenie — postać, która przespała
 * noc w innym miejscu, ma prawo obudzić się bez Nerwosolu. Przemiatanie rundowe
 * z 16h chodzi po żetonach sceny, bo tamto dotyczy naklejek; to chodzi po
 * kartach, bo efekt jest wierszem karty.
 */
export async function sweepStatEffects(
  deps: RealtimeDeps,
  campaignId: string,
  clock: CpredEffectClock,
): Promise<{ character: Character; expired: CpredStatEffect[] }[]> {
  const characters = await deps.ctx.prisma.character.findMany({ where: { campaignId } });
  const swept: { character: Character; expired: CpredStatEffect[] }[] = [];
  for (const character of characters) {
    const result = await expireOne(deps, campaignId, character, clock);
    if (result) swept.push(result);
  }
  if (swept.length > 0) await logStatEffects(deps, campaignId, 'Efekty wygasły', swept);
  return swept;
}

/**
 * To samo dla jednej karty — wejście przemiatania rundowego z 16h.
 *
 * Osobne, bo tamto chodzi po **żetonach sceny** (naklejka jest własnością
 * żetonu), a to po **kartach** (efekt jest wierszem karty). Karta czatu jest
 * i tutaj, bo dla stołu „minęła runda i zeszło ci osłabienie" jest tym samym
 * zdarzeniem, niezależnie od tego, który zegar je zamknął.
 */
export async function expireStatEffectsOfCharacter(
  deps: RealtimeDeps,
  campaignId: string,
  characterId: string,
  clock: CpredEffectClock,
): Promise<CpredStatEffect[]> {
  const character = await deps.ctx.prisma.character.findUnique({ where: { id: characterId } });
  if (!character || character.campaignId !== campaignId) return [];
  const result = await expireOne(deps, campaignId, character, clock);
  if (!result) return [];
  await logStatEffects(deps, campaignId, 'Efekty wygasły', [result]);
  return result.expired;
}

/** Zdejmuje z jednej karty to, czego czas minął; `null`, gdy nie było czego. */
async function expireOne(
  deps: RealtimeDeps,
  campaignId: string,
  character: Character,
  clock: CpredEffectClock,
): Promise<{ character: Character; expired: CpredStatEffect[] } | null> {
  const result = expireSheetStatEffects(character, deps.ctx.cpred, clock);
  if (!result) return null;
  const saved = await deps.ctx.prisma.character.update({
    where: { id: character.id },
    data: { data: result.data },
  });
  await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, deps.ctx.cpred));
  await emitTokensOfCharacter(deps, campaignId, saved);
  return { character: saved, expired: result.expired };
}

/**
 * „Efekty wygasły: Frank — REF −3 (Lisz), INT −3 (Lisz)".
 *
 * Jeden wiersz na całe przemiatanie, nie karta na postać — po skoku o dobę
 * schodzi wszystko naraz, a sześć kart pogrzebałoby to, co przy stole naprawdę
 * się wtedy działo. Rodzaj `action`, jak „Minęła minuta" z 16h: nowy rodzaj
 * wiersza czatu kosztuje pięć miejsc, a ten mówi dokładnie to samo, co tamten.
 */
async function logStatEffects(
  deps: RealtimeDeps,
  campaignId: string,
  title: string,
  rows: readonly { character: Pick<Character, 'name'>; expired: readonly CpredStatEffect[] }[],
): Promise<void> {
  const gm = await deps.ctx.prisma.user.findFirst({ where: { role: ROLE_GM } });
  if (!gm) return;
  const entry: CombatActionLogEntry = {
    combatantId: '',
    actorName: 'Czas',
    actionId: 'stat-effect-expired',
    actionName: title,
    note: rows
      .map(
        (row) => `${row.character.name} — ${row.expired.map(describeCpredStatEffect).join(', ')}`,
      )
      .join(' · '),
  };
  const stored = await deps.ctx.prisma.chatMessage.create({
    data: {
      campaignId,
      authorId: gm.id,
      kind: 'action',
      text: entry.actionName,
      payload: JSON.stringify(entry),
    },
    include: INCLUDE_CHAT_NAMES,
  });
  broadcastChatMessage(deps, campaignId, toChatMessageView(stored));
}

/**
 * MG nakłada albo zdejmuje efekt.
 *
 * Jedno zdarzenie na obie czynności, bo przy stole to jedno zdanie („już ci
 * przeszło") i bo obie kończą się tym samym zapisem karty — ta sama umowa,
 * którą `effect:expire` z 16h ma wobec naklejek i ran.
 *
 * Liczba przychodzi albo wprost (`value` — MG wie, ile), albo notacją
 * (`formula` — serwer rzuca). Nigdy oba naraz: dwa wejścia znaczyłyby, że jedno
 * jest po cichu ignorowane, a MG nie ma jak zauważyć które.
 */
export const characterStatEffectEvent = defineEvent<
  CharacterStatEffectPayload,
  { effect?: CpredStatEffect; removed?: CpredStatEffect }
>({
  name: 'character:stat-effect',
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

    if (typeof payload.effectId === 'string') {
      const removed = removeStatEffectFromSheet(character, deps.ctx.cpred, payload.effectId);
      if (!removed) throw new RealtimeError('EFFECT_NOT_FOUND');
      const saved = await deps.ctx.prisma.character.update({
        where: { id: character.id },
        data: { data: removed.data },
      });
      await emitCharacterUpsert(deps, campaign.id, toCharacterView(saved, deps.ctx.cpred));
      await emitTokensOfCharacter(deps, campaign.id, saved);
      return { removed: removed.removed };
    }

    if (!isCpredStatId(payload.stat)) throw new RealtimeError('UNKNOWN_STAT');
    const source = typeof payload.source === 'string' ? payload.source.trim() : '';
    if (source.length === 0) throw new RealtimeError('BAD_REQUEST');
    const durationS =
      payload.durationS === undefined ? CPRED_HOUR_S : Math.round(payload.durationS);
    if (!Number.isFinite(durationS) || durationS <= 0) throw new RealtimeError('BAD_DURATION');
    if (durationS > CPRED_STAT_EFFECT_DURATION_MAX_S) throw new RealtimeError('BAD_DURATION');

    const rolled = rollStatEffectValue(payload);
    if (rolled === null) throw new RealtimeError('BAD_VALUE');

    const clock = await effectClockForCharacter(
      deps,
      campaign.id,
      character.id,
      socket.data.viewedSceneId,
    );
    const effect = await applyStatEffect(
      deps,
      campaign.id,
      character,
      {
        stat: payload.stat,
        value: rolled.value,
        source: source.slice(0, 64),
        durationS,
        ...(typeof payload.compendiumId === 'string' && payload.compendiumId.length > 0
          ? { compendiumId: payload.compendiumId }
          : {}),
        ...(rolled.notation ? { rolled: rolled.notation } : {}),
      },
      clock,
    );
    if (!effect) throw new RealtimeError('TOO_MANY_EFFECTS');
    return { effect };
  },
});

/**
 * Liczba, o którą Cecha się przesunie — wpisana albo wylosowana.
 *
 * `null` znaczy „to nie jest zmiana Cechy": zero, wartość spoza zakresu albo
 * notacja, której nie da się przeczytać. Zero jest odmową świadomie — efekt
 * zmieniający Cechę o nic byłby chipem, który nic nie robi, i jedyne, co by
 * dawał, to fałszywe wrażenie, że coś działa.
 */
function rollStatEffectValue(
  payload: CharacterStatEffectPayload,
): { value: number; notation?: string } | null {
  if (typeof payload.formula === 'string' && payload.formula.trim().length > 0) {
    if (payload.value !== undefined) return null;
    const parsed = parseRollNotation(payload.formula);
    if (!parsed.ok) return null;
    const total = rollFormula(parsed.formula, createMixedRng()).total;
    const value = payload.negative === true ? -Math.abs(total) : Math.abs(total);
    if (value === 0 || Math.abs(value) > CPRED_STAT_EFFECT_VALUE_MAX) return null;
    return { value, notation: payload.formula.trim().slice(0, 16) };
  }
  const value = payload.value;
  if (typeof value !== 'number' || !Number.isInteger(value) || value === 0) return null;
  if (Math.abs(value) > CPRED_STAT_EFFECT_VALUE_MAX) return null;
  return { value };
}

/** Ile efektów jeszcze zmieści się na karcie — dla okna MG. */
export const STAT_EFFECTS_MAX = CPRED_STAT_EFFECTS_MAX;
