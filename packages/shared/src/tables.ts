/**
 * Tabele losowe (etap 34).
 *
 * Rdzeń VTT, nie system RPG: „nazwa, formuła i wiersze z zakresami" nie wie nic
 * o Cyberpunku RED i nic z `systems/cpred` tu nie wchodzi. Tabela z podręcznika
 * jest wtedy zwykłymi **danymi** — dokładnie tak, jak dodatek do broni okazał
 * się wierszem kompendium w etapie 31.
 *
 * Trzy rzeczy niesie ten plik i każda jest decyzją, nie szczegółem.
 *
 * 1. **Tabela nie jest Testem.** Losowanie idzie przez `rollFormula`
 *    z `checkRule: false` i `plain: true`: `1d10` jest formułą Testu w rozumieniu
 *    etapu 06, więc bez tego dziesiątka rozsadzałaby rzut o dorzut i tabela
 *    dziesięciowierszowa wypluwałaby jedenastki. `plain` jest drugą połową tej
 *    samej prawdy — na karcie czatu dziesiątka ma zostać nieomalowana, bo to
 *    „wiersz dziesiąty", a nie krytyk (ta sama umowa, co rzuty kreatora z 27d).
 * 2. **Zakresy muszą pokryć całą formułę i nie zachodzić na siebie.** Dziura to
 *    losowanie, które nic nie mówi, a zachodzenie — wiersz nie do wylosowania.
 *    Rozstrzyga to jedna funkcja, wołana i w formularzu, i na serwerze.
 * 3. **Podrzut jest grafem, więc pilnuje się go przy zapisie, nie przy rzucie.**
 *    Cykl („łup" → „broń" → „łup") zawiesiłby losowanie w miejscu, w którym MG
 *    nie ma już czego kliknąć; głębokość ponad trzy poziomy zamienia jedno
 *    kliknięcie w lawinę kart. Oba odmawia `randomTableNestingIssue`.
 */

import {
  formatRollNotation,
  parseRollNotation,
  rollFormula,
  type DiceRng,
  type RollFormula,
  type RollResult,
} from './dice.js';

export const RANDOM_TABLE_NAME_MAX_LENGTH = 80;
export const RANDOM_TABLE_DESCRIPTION_MAX_LENGTH = 500;
/**
 * Wiersz bywa akapitem, nie hasłem: podręcznikowe „Spotkania nocne" mają wiersze
 * po 1 400 znaków (statystyki przeciwników i dwa podrzuty w środku opisu).
 * Limit stoi nad najdłuższym z nich, żeby import nie ucinał zdania w połowie.
 */
export const RANDOM_TABLE_ROW_TEXT_MAX_LENGTH = 2000;
export const RANDOM_TABLE_ROWS_MAX = 200;

/**
 * Ile poziomów wolno zejść podrzutem. Trzy: tabela → podtabela → podpodtabela.
 * Czwarty poziom znaczy, że jedno kliknięcie „Losuj" wysypuje na czat cztery
 * karty naraz — a wtedy nikt już nie czyta pierwszej.
 */
export const RANDOM_TABLE_NESTING_MAX = 3;

/** `gm` = karta widoczna tylko dla MG; `public` = od razu dla całego stołu. */
export const RANDOM_TABLE_VISIBILITIES = ['gm', 'public'] as const;
export type RandomTableVisibility = (typeof RANDOM_TABLE_VISIBILITIES)[number];

export const RANDOM_TABLE_VISIBILITY_LABELS: Record<RandomTableVisibility, string> = {
  gm: 'Tylko MG',
  public: 'Cały stół',
};

export interface RandomTableRowView {
  id: string;
  min: number;
  max: number;
  text: string;
  /** Podrzut: inna tabela tej samej kampanii; `null` = zwykły wiersz. */
  subTableId: string | null;
  /** Nazwa podrzucanej tabeli — żeby narysować wiersz bez drugiego zapytania. */
  subTableName?: string;
}

export interface RandomTableView {
  id: string;
  name: string;
  /** Notacja rzutu, np. `1d10`, `1d100` — ten sam parser, którego używa `/r`. */
  formula: string;
  description: string;
  visibility: RandomTableVisibility;
  rows: RandomTableRowView[];
  updatedAt: string;
}

/** Jeden rzut w łańcuchu: własny dla tabeli, kolejne dla podrzutów. */
export interface RandomTableRollStep {
  tableId: string;
  tableName: string;
  /** Wynik kości — kształt taki sam, jak każdego innego rzutu w tym VTT. */
  roll: RollResult;
  /** Wyrzucona liczba (kopia `roll.total`, żeby karta nie liczyła jej sama). */
  value: number;
  /** Tekst trafionego wiersza; pusty, gdy wiersz był samym odesłaniem. */
  text: string;
  /**
   * Formuła wypadła poza wszystkie zakresy. Nie powinno się zdarzyć — zapis
   * pilnuje pokrycia — ale tabela zaimportowana przed tą regułą może mieć
   * dziurę, a karta „nic nie wylosowano" jest uczciwsza od pustego wiersza.
   */
  missing?: boolean;
}

/**
 * Wynik losowania, jak zapisuje go czat (rodzaje `rolltable` i `gmrolltable`).
 *
 * Karta MG nosi `shown`, kiedy ten sam wynik został już pokazany stołowi —
 * „Pokaż stołowi" **dokłada** publiczny wiersz zamiast odsłaniać istniejący,
 * bo wiersz raz wysłany do jednego pokoju nie ma jak trafić do drugiego
 * (`visibleTo` jest białą listą rodzajów, nie flagą na wierszu).
 */
export interface RandomTableRollEntry {
  /** Pierwszy krok to sama tabela; dalsze — podrzuty, po kolei. */
  steps: RandomTableRollStep[];
  /** Id tabeli, z której losowano — „Losuj ponownie" potrzebuje adresu. */
  tableId: string;
  tableName: string;
  /** Ustawione, gdy MG pokazał ten wynik stołowi (znika przycisk). */
  shown?: boolean;
}

export interface RandomTableUpsertPayload {
  /** Pusty przy tworzeniu nowej tabeli. */
  id?: string;
  name: string;
  formula: string;
  description: string;
  visibility: RandomTableVisibility;
  rows: {
    min: number;
    max: number;
    text: string;
    subTableId?: string | null;
  }[];
}

export interface RandomTableIdPayload {
  id: string;
}

export interface RandomTableRollPayload {
  /** Adres tabeli; `/tab <nazwa>` przekłada nazwę na id po stronie serwera. */
  id: string;
  /** Jednorazowe nadpisanie widoczności zapisanej na tabeli. */
  visibility?: RandomTableVisibility;
}

/** „Pokaż stołowi": adresem jest karta czatu, nie tabela. */
export interface RandomTableShowPayload {
  messageId: number;
}

export interface RandomTableListPayload {
  tables: RandomTableView[];
}

export interface RandomTableUpsertBroadcast {
  table: RandomTableView;
}

export interface RandomTableDeleteBroadcast {
  id: string;
}

export interface RandomTableIssue {
  field: string;
  message: string;
}

/**
 * Przedział liczb, jakie formuła może dać. Kość `nDk` daje od `n` do `n·k`,
 * modyfikator przesuwa oba końce, a znak minus zamienia je miejscami.
 *
 * Rozkład nas nie obchodzi — `2d6` jest krzywe i to sprawa MG. Obchodzi nas
 * wyłącznie **zasięg**, bo to on musi zgadzać się z zakresami wierszy.
 */
export function randomTableSpan(formula: RollFormula): { min: number; max: number } {
  let min = 0;
  let max = 0;
  for (const term of formula.terms) {
    if (term.kind === 'modifier') {
      min += term.sign * term.value;
      max += term.sign * term.value;
      continue;
    }
    const low = term.count;
    const high = term.count * term.sides;
    if (term.sign === 1) {
      min += low;
      max += high;
    } else {
      min -= high;
      max -= low;
    }
  }
  return { min, max };
}

/** „1–5" albo „7" — etykieta zakresu, jednakowa w edytorze i na karcie czatu. */
export function randomTableRangeLabel(row: { min: number; max: number }): string {
  return row.min === row.max ? `${row.min}` : `${row.min}–${row.max}`;
}

/**
 * Co jest nie tak z pokryciem zakresów. Pusta lista = tabela da się wylosować
 * i każdy wiersz ma szansę wypaść.
 *
 * Ta sama funkcja chodzi w formularzu (podpowiedź na żywo) i na serwerze
 * (odmowa zapisu), więc oba mówią to samo tym samym zdaniem.
 */
export function randomTableCoverageIssues(
  formula: RollFormula,
  rows: { min: number; max: number }[],
): RandomTableIssue[] {
  const issues: RandomTableIssue[] = [];
  if (rows.length === 0) {
    return [{ field: 'rows', message: 'Tabela musi mieć przynajmniej jeden wiersz.' }];
  }

  const span = randomTableSpan(formula);
  for (const row of rows) {
    if (!Number.isInteger(row.min) || !Number.isInteger(row.max)) {
      issues.push({ field: 'rows', message: 'Zakresy wierszy muszą być liczbami całkowitymi.' });
      return issues;
    }
    if (row.min > row.max) {
      issues.push({
        field: 'rows',
        message: `Zakres ${row.min}–${row.max} jest odwrócony — początek musi być mniejszy od końca.`,
      });
    }
    if (row.min < span.min || row.max > span.max) {
      issues.push({
        field: 'rows',
        message: `Zakres ${randomTableRangeLabel(row)} wypada poza formułę (${formatRollNotation(formula)} daje ${span.min}–${span.max}).`,
      });
    }
  }
  if (issues.length > 0) return issues;

  const sorted = [...rows].sort((a, b) => a.min - b.min || a.max - b.max);
  let cursor = span.min;
  for (const row of sorted) {
    if (row.min > cursor) {
      const gapEnd = row.min - 1;
      issues.push({
        field: 'rows',
        message: `Dziura w zakresach: nic nie odpowiada za ${randomTableRangeLabel({ min: cursor, max: gapEnd })}.`,
      });
    } else if (row.min < cursor) {
      issues.push({
        field: 'rows',
        message: `Zakresy zachodzą na siebie przy ${randomTableRangeLabel({ min: row.min, max: Math.min(cursor - 1, row.max) })}.`,
      });
    }
    cursor = Math.max(cursor, row.max + 1);
  }
  if (cursor <= span.max) {
    issues.push({
      field: 'rows',
      message: `Dziura w zakresach: nic nie odpowiada za ${randomTableRangeLabel({ min: cursor, max: span.max })}.`,
    });
  }
  return issues;
}

/** Wiersz, na który pada wyrzucona liczba; `null`, gdy trafiła w dziurę. */
export function resolveRandomTableRow<T extends { min: number; max: number }>(
  rows: T[],
  value: number,
): T | null {
  return rows.find((row) => value >= row.min && value <= row.max) ?? null;
}

/** Jeden węzeł grafu podrzutów: tabela i tabele, na które wskazują jej wiersze. */
export interface RandomTableLink {
  id: string;
  name: string;
  subIds: string[];
}

/**
 * Co jest nie tak z podrzutami po tej zmianie — cykl albo za głęboko.
 *
 * Sprawdzane na **całym** grafie kampanii, nie na jednej tabeli: dopisanie
 * podrzutu w „broni" może przekroczyć limit tabeli „łup", która o niczym nie
 * wie, a odmowa musi paść w tym miejscu, w którym ktoś naprawdę klika zapis.
 */
export function randomTableNestingIssue(links: RandomTableLink[]): string | null {
  const byId = new Map(links.map((link) => [link.id, link]));
  const nameOf = (id: string) => byId.get(id)?.name ?? id;

  // Cykl najpierw: bez tego liczenie głębokości nigdy by się nie skończyło.
  const state = new Map<string, 'open' | 'done'>();
  const stack: string[] = [];
  let cycle: string[] | null = null;
  const walk = (id: string): void => {
    if (cycle) return;
    const seen = state.get(id);
    if (seen === 'done') return;
    if (seen === 'open') {
      cycle = [...stack.slice(stack.indexOf(id)), id];
      return;
    }
    state.set(id, 'open');
    stack.push(id);
    for (const next of byId.get(id)?.subIds ?? []) {
      if (byId.has(next)) walk(next);
    }
    stack.pop();
    state.set(id, 'done');
  };
  for (const link of links) walk(link.id);
  if (cycle) {
    return `Podrzuty zapętlają się: ${(cycle as string[]).map(nameOf).join(' → ')}.`;
  }

  const depths = new Map<string, number>();
  const depthOf = (id: string): number => {
    const known = depths.get(id);
    if (known !== undefined) return known;
    let deepest = 1;
    for (const next of byId.get(id)?.subIds ?? []) {
      if (byId.has(next)) deepest = Math.max(deepest, 1 + depthOf(next));
    }
    depths.set(id, deepest);
    return deepest;
  };
  for (const link of links) {
    if (depthOf(link.id) > RANDOM_TABLE_NESTING_MAX) {
      return `Za głęboki podrzut: „${link.name}" schodzi o ${depthOf(link.id)} poziomy, a wolno najwyżej ${RANDOM_TABLE_NESTING_MAX}.`;
    }
  }
  return null;
}

export type RandomTableValidation =
  | { ok: true; table: Required<Omit<RandomTableUpsertPayload, 'id'>> }
  | { ok: false; issues: RandomTableIssue[] };

/**
 * Waliduje tabelę bez patrzenia na resztę kampanii (nazwa, formuła, zakresy).
 * Unikalność nazwy i graf podrzutów rozstrzyga serwer — do tego trzeba znać
 * pozostałe tabele.
 */
export function validateRandomTable(raw: unknown): RandomTableValidation {
  const issues: RandomTableIssue[] = [];
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, issues: [{ field: 'table', message: 'Nieprawidłowe dane tabeli.' }] };
  }
  const input = raw as Record<string, unknown>;

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (name.length === 0) issues.push({ field: 'name', message: 'Tabela musi mieć nazwę.' });
  if (name.length > RANDOM_TABLE_NAME_MAX_LENGTH) {
    issues.push({
      field: 'name',
      message: `Nazwa jest za długa (limit ${RANDOM_TABLE_NAME_MAX_LENGTH} znaków).`,
    });
  }

  const description = typeof input.description === 'string' ? input.description.trim() : '';
  if (description.length > RANDOM_TABLE_DESCRIPTION_MAX_LENGTH) {
    issues.push({
      field: 'description',
      message: `Opis jest za długi (limit ${RANDOM_TABLE_DESCRIPTION_MAX_LENGTH} znaków).`,
    });
  }

  const parsedFormula = parseRollNotation(typeof input.formula === 'string' ? input.formula : '');
  if (!parsedFormula.ok) {
    issues.push({
      field: 'formula',
      message: 'Nie rozumiem formuły — spróbuj „1d10" albo „1d100".',
    });
  }

  const visibility = (RANDOM_TABLE_VISIBILITIES as readonly string[]).includes(
    input.visibility as string,
  )
    ? (input.visibility as RandomTableVisibility)
    : 'gm';

  const rawRows = Array.isArray(input.rows) ? input.rows : [];
  if (rawRows.length > RANDOM_TABLE_ROWS_MAX) {
    issues.push({
      field: 'rows',
      message: `Za dużo wierszy (limit ${RANDOM_TABLE_ROWS_MAX}).`,
    });
  }
  const rows: Required<RandomTableUpsertPayload>['rows'] = [];
  for (const item of rawRows.slice(0, RANDOM_TABLE_ROWS_MAX)) {
    if (typeof item !== 'object' || item === null) continue;
    const row = item as Record<string, unknown>;
    const min = Number(row.min);
    const max = Number(row.max);
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      issues.push({ field: 'rows', message: 'Każdy wiersz potrzebuje zakresu „od–do".' });
      continue;
    }
    const text = typeof row.text === 'string' ? row.text.trim() : '';
    if (text.length > RANDOM_TABLE_ROW_TEXT_MAX_LENGTH) {
      issues.push({
        field: 'rows',
        message: `Treść wiersza ${randomTableRangeLabel({ min, max })} jest za długa (limit ${RANDOM_TABLE_ROW_TEXT_MAX_LENGTH} znaków).`,
      });
    }
    const subTableId =
      typeof row.subTableId === 'string' && row.subTableId.length > 0 ? row.subTableId : null;
    if (text.length === 0 && subTableId === null) {
      issues.push({
        field: 'rows',
        message: `Wiersz ${randomTableRangeLabel({ min, max })} jest pusty — wpisz treść albo wskaż tabelę.`,
      });
    }
    rows.push({ min: Math.round(min), max: Math.round(max), text, subTableId });
  }

  if (parsedFormula.ok) {
    issues.push(...randomTableCoverageIssues(parsedFormula.formula, rows));
  }
  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    table: {
      name,
      formula: formatRollNotation((parsedFormula as { ok: true; formula: RollFormula }).formula),
      description,
      visibility,
      rows,
    },
  };
}

/** Tabela w postaci, jakiej potrzebuje losowanie — bez zależności od bazy. */
export interface RandomTableSource {
  id: string;
  name: string;
  formula: string;
  rows: { min: number; max: number; text: string; subTableId: string | null }[];
}

/**
 * Losuje z tabeli, schodząc podrzutami do `RANDOM_TABLE_NESTING_MAX` poziomów.
 *
 * Czysta funkcja: RNG wstrzykuje wołający (serwer — kryptograficzny, testy —
 * skryptowany). Rzut idzie z `checkRule: false` i `plain: true` — patrz nagłówek
 * pliku; to jedyne miejsce, w którym te dwie flagi mają wpaść, i pomyłka tutaj
 * jest jedenastką w tabeli dziesięciowierszowej.
 */
export function rollRandomTable(
  tables: Map<string, RandomTableSource>,
  tableId: string,
  rng: DiceRng,
): RandomTableRollStep[] {
  const steps: RandomTableRollStep[] = [];
  let currentId: string | null = tableId;
  const visited = new Set<string>();

  while (currentId && steps.length < RANDOM_TABLE_NESTING_MAX) {
    const table: RandomTableSource | undefined = tables.get(currentId);
    if (!table || visited.has(currentId)) break;
    visited.add(currentId);

    const parsed = parseRollNotation(table.formula);
    // Tabela bez czytelnej formuły nie ma prawa istnieć (zapis jej nie
    // przepuści), ale zaimportowana wprost do bazy — może. Wtedy „1d10".
    const formula: RollFormula = parsed.ok ? parsed.formula : { terms: [] };
    const roll: RollResult = rollFormula(formula, rng, { checkRule: false, plain: true });
    const row = resolveRandomTableRow(table.rows, roll.total);
    const step: RandomTableRollStep = {
      tableId: table.id,
      tableName: table.name,
      roll,
      value: roll.total,
      text: row?.text ?? '',
    };
    if (!row) step.missing = true;
    steps.push(step);
    currentId = row?.subTableId ?? null;
  }

  return steps;
}
