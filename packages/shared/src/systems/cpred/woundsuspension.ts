/**
 * Zawieszenie kar Poważnie Rannego (12.09.2026) — Stym i Edytor bólu.
 *
 * Kara za Poważnie Rannego to jedyna kara w projekcie, którą liczy każdy Test
 * naraz: rzut z karty, atak, Zwarcie, Konfrontacja, Sieć i targowanie. Dwie
 * rzeczy z podręcznika ją zawieszają i obie mówią to tym samym zdaniem: Stym —
 * „przez godzinę cel ignoruje kary wynikające z bycia Poważnie Rannym" (s. 150)
 * — i Edytor bólu, który „pozwala ignorować efekt rany Poważnie ranny".
 *
 * Trzy rozstrzygnięcia niosą ten moduł.
 *
 * 1. **Zawieszona jest kara, nie stan.** Poważnie Ranny pod Stymem nadal jest
 *    Poważnie Ranny: PT Ustabilizowania, naklejka i próg na pasku zostają, bo
 *    podręcznik mówi o karach, a nie o ranie. Śmiertelnie Ranny traci −4 jak
 *    zawsze — ale Stym podany godzinę wcześniej zadziała, gdy Medyk wyciągnie
 *    go z powrotem do Poważnie Rannego.
 *
 * 2. **Stym jest polem karty z dwoma terminami**, tymi samymi co efekty na
 *    Cechach z etapu 39, i schodzi tymi samymi dwoma przemiataniami. Osobne
 *    pole, a nie wiersz `statEffects`, bo nie ma Cechy, którą by przesuwał —
 *    wspólny typ znaczyłby pole `stat` puste przy każdym zastrzyku. Druga dawka
 *    **nadpisuje** pierwszą: zawieszenie się nie kumuluje, a termin liczy się od
 *    nowego zastrzyku.
 *
 * 3. **Edytor bólu działa, dopóki siedzi w ciele** — rozpoznawany po nazwie
 *    wiersza, tak jak Ulepszone przeciwciała w `recovery.ts`. Karta nie wie,
 *    co wyłączył impuls EMP (nazwy stoją tylko na karcie czatu), więc chip
 *    wyłączony na minutę zostaje przy MG.
 *
 * Moduł nie importuje ani karty, ani planera rzutu: `character.ts` czyta stąd
 * typ i czytnik, a `rolls.ts` — źródło zawieszenia. Import w drugą stronę
 * zamknąłby cykl, ten sam, przed którym broni się `stateffects.ts`.
 */

import { CPRED_STAT_EFFECT_DURATION_MAX_S } from './stateffects.js';

/**
 * Chip, który wyłącza receptory bólu. Po nazwie, nie po id wpisu — kompendium
 * w `data/private/` bywa starsze niż parser, a nazwa jest tym, co MG widzi
 * i wpisuje (ta sama umowa co `CPRED_ANTIBODIES_CYBERWARE`).
 */
export const CPRED_PAIN_EDITOR_CYBERWARE = 'Edytor bólu';

/** Zawieszenie z zastrzyku — jedno na kartę, z terminami jak efekt na Cesze. */
export interface CpredWoundSuspension {
  /** Własne id — „zdejmij" u MG wskazuje je tym samym zdarzeniem co efekt. */
  id: string;
  /** „Stym" — to, co pisze wiersz rozbicia rzutu i karta. */
  source: string;
  /** Długość w sekundach fikcji, dla etykiety. */
  durationS: number;
  /** Runda trwającej walki, w której zawieszenie schodzi. */
  expiresAtRound?: number;
  /** Minuta zegara świata, w której zawieszenie schodzi (etap 37). */
  expiresAtMinute?: number;
}

/** Karta oczami tego modułu — dwa pola, nie cały arkusz. */
export interface CpredWoundSuspensionSheet {
  cyberware: readonly { name: string }[];
  woundSuspension: CpredWoundSuspension | null;
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Co zawiesza teraz kary Poważnie Rannego tej karty — nazwa źródła albo `null`.
 *
 * Edytor bólu wygrywa ze Stymem, bo jest trwały: wiersz rozbicia ma wskazać
 * to, co zostanie, kiedy zastrzyk zejdzie.
 */
export function cpredWoundSuspensionSource(sheet: CpredWoundSuspensionSheet): string | null {
  if (sheet.cyberware.some((row) => sameName(row.name, CPRED_PAIN_EDITOR_CYBERWARE))) {
    return CPRED_PAIN_EDITOR_CYBERWARE;
  }
  return sheet.woundSuspension?.source ?? null;
}

/** „Stym (bez kar Poważnie Rannego)" — jedno zdanie na kartę czatu i listę. */
export function describeCpredWoundSuspension(
  suspension: Pick<CpredWoundSuspension, 'source'>,
): string {
  return `${suspension.source} (bez kar Poważnie Rannego)`;
}

/**
 * Zapis z JSON-a albo `null`.
 *
 * Zły zapis odpada po cichu, a nie wywraca karty — pisze go wyłącznie silnik,
 * więc zepsute pole jest starą daną, a nie literówką (umowa `readCpredStatEffect`).
 */
export function readCpredWoundSuspension(raw: unknown): CpredWoundSuspension | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== 'string' || row.id.length === 0 || row.id.length > 32) return null;
  if (typeof row.source !== 'string' || row.source.trim().length === 0) return null;
  const durationS = row.durationS;
  if (
    typeof durationS !== 'number' ||
    !Number.isInteger(durationS) ||
    durationS <= 0 ||
    durationS > CPRED_STAT_EFFECT_DURATION_MAX_S
  ) {
    return null;
  }
  const round = row.expiresAtRound;
  const minute = row.expiresAtMinute;
  return {
    id: row.id,
    source: row.source.slice(0, 64),
    durationS,
    ...(typeof round === 'number' && Number.isInteger(round) && round > 0
      ? { expiresAtRound: round }
      : {}),
    ...(typeof minute === 'number' && Number.isInteger(minute) && minute > 0
      ? { expiresAtMinute: minute }
      : {}),
  };
}
