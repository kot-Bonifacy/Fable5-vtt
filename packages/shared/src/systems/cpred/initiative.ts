import {
  CPRED_ARMOR_PENALTY_LABEL,
  cpredArmorStatPenalty,
  type CpredCharacterData,
  type CpredRegistry,
} from './character.js';
import { cpredSheetCombatAwareness } from './roleability.js';
import { cpredEffectiveStats } from './stateffects.js';
import { cpredChromeInitiative } from './chromestats.js';
import { CPRED_STAT_LABELS } from './stats.js';

/** Inicjatywa jednej karty — to, co dodaje się do 1k10, i czym rozstrzyga się remis. */
export interface CpredInitiative {
  modifier: number;
  /** Remis rozstrzyga REF (s. 168) — sam REF, bez Błyskawicznej reakcji. */
  tieBreak: number;
  /** „Refleks (REF) + Błyskawiczna reakcja 1” — karta czatu tłumaczy rzut sama. */
  label: string;
}

/**
 * Modyfikator inicjatywy z karty — `1k10 + REF` (s. 168) z poprawkami.
 *
 * Wydzielony z serwera 03.10 (#61, T8b): kubek gracza pokazywał „Inicjatywa
 * +0”, bo klient nie miał skąd wziąć liczby, którą serwer doda do rzutu. Jedno
 * źródło dla kubka i dla `combat:roll`.
 */
export function cpredSheetInitiative(
  data: CpredCharacterData,
  registry: CpredRegistry,
): CpredInitiative {
  // Etap 39: REF **jak teraz**. Inicjatywa jest wprost REF-em, więc Lisz musi
  // przestawić figurę w kolejce — i przestawia też remis, bo remis **jest**
  // REF-em i drugiego REF-u nie ma.
  const stats = cpredEffectiveStats(data);
  // „Modyfikator pancerza: −2 REF, ZW i RUCH" (s. 185). Initiative is REF, so
  // heavy armour slows the queue too — and it moves the tie-break with it,
  // because the tie-break *is* REF and there is only one REF to be had.
  const armor = cpredArmorStatPenalty(data.armor, 'ref', stats.ref);
  const ref = stats.ref + armor;
  // „Każdy przydzielony punkt to +1 do rzutów na Inicjatywę" (Błyskawiczna
  // reakcja, s. 146). It moves the total, never the tie-break: RAW breaks ties
  // by REF, and a Solo's training is not reflexes.
  const fastReflexes = cpredSheetCombatAwareness(data, registry).initiative;
  // Etap 59a: „Użytkownik dodaje +2 do Inicjatywy” (Kerenzikov). Jak
  // Błyskawiczna reakcja — rusza sumę, nie remis, bo remis to sam REF.
  const chrome = cpredChromeInitiative(data);
  const refLabel = `${CPRED_STAT_LABELS.ref.name} (${CPRED_STAT_LABELS.ref.abbr})`;
  const armorLabel = armor === 0 ? '' : ` ${CPRED_ARMOR_PENALTY_LABEL} ${armor}`;
  const fastLabel = fastReflexes > 0 ? ` + Błyskawiczna reakcja ${fastReflexes}` : '';
  const chromeLabel = chrome ? ` + ${chrome.label} ${chrome.value}` : '';
  return {
    modifier: ref + fastReflexes + (chrome?.value ?? 0),
    tieBreak: ref,
    label: `${refLabel}${armorLabel}${fastLabel}${chromeLabel}`,
  };
}
