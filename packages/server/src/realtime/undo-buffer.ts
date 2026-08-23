import type { SceneObjectKind } from '@vtt/shared';

/**
 * Bufor cofania usunięć ze sceny (etap 27k).
 *
 * Świadomie **w pamięci procesu**, nie w bazie: to jest „ojej, nie to" z
 * ostatniej minuty pracy MG, a nie historia kampanii. Restart serwera kasuje
 * bufor i tak ma być — inaczej `Ctrl+Z` po tygodniu przywracałby ścianę, o
 * której nikt już nie pamięta.
 *
 * Osobny plik, a nie funkcja w `scene-undo.ts`, i to jest jedyny powód jego
 * istnienia: **ten moduł niczego nie importuje z modułów obsługi zdarzeń**.
 * Zapisują tu ściany, osłony, strefy, światła, gniazda, notatki i rysunki —
 * gdyby bufor sam znał ich emitery, powstałby cykl importów z każdym z siedmiu
 * plików naraz. Odtwarzanie mieszka piętro wyżej, w `scene-undo.ts`, który
 * importuje i bufor, i emitery.
 *
 * Wiersze trzymamy **w całości, tak jak przyszły z Prismy**, razem z `id`.
 * Odtworzenie z tym samym id jest połową sensu tej funkcji: inicjatywa, runy
 * Sieci i kolejka zdarzeń noszą te id, a `create` + `patch` u klienta dałby
 * nowe (i przy okazji nie umiałby oddać ani `locked` ściany, ani bieżących PW
 * osłony — patrz „Rozstrzygnięcie techniczne" w opisie etapu).
 */

/** Ile ostatnich usunięć pamiętamy na kampanię. */
export const UNDO_DEPTH = 20;

/**
 * Ile wierszy wolno odłożyć w jednej pozycji. Kosz „usuń wszystkie rysunki" na
 * zaśmieconej scenie potrafi zdjąć setki kresek; limity per scena i tak są
 * niższe, więc ten próg jest bezpiecznikiem pamięci, nie regułą produktu.
 */
export const UNDO_ROWS_PER_ENTRY_MAX = 512;

export interface UndoEntry {
  /** Rosnąco, globalnie — służy tylko do porządku w stosie. */
  seq: number;
  campaignId: string;
  /** Kto usunął. Tylko ta osoba może to cofnąć. */
  userId: string;
  /** Scena, na której to stało — `Ctrl+Z` cofa wyłącznie na oglądanej scenie. */
  sceneId: string;
  kind: SceneObjectKind;
  /** Wiersze Prismy w postaci, w jakiej wyszły z bazy tuż przed usunięciem. */
  rows: Record<string, unknown>[];
}

let nextSeq = 1;

/** Stosy per kampania; najświeższe usunięcie jest na końcu tablicy. */
const stacks = new Map<string, UndoEntry[]>();

/**
 * Odkłada usunięcie do cofnięcia. Pusta lista wierszy nic nie odkłada — kosz
 * na pustej scenie nie ma czego przywracać i nie może zjeść cudzej pozycji ze
 * stosu.
 */
export function rememberDeletion(entry: Omit<UndoEntry, 'seq'>): void {
  if (entry.rows.length === 0) return;
  if (entry.rows.length > UNDO_ROWS_PER_ENTRY_MAX) return;
  const stack = stacks.get(entry.campaignId) ?? [];
  stack.push({ ...entry, seq: nextSeq++ });
  // Najstarsze wypadają z początku — 20 na kampanię, nie na osobę: przy stole
  // siedzi jeden MG i kilku graczy, a i tak każdy cofa wyłącznie swoje.
  while (stack.length > UNDO_DEPTH) stack.shift();
  stacks.set(entry.campaignId, stack);
}

/**
 * Zdejmuje ostatnie **własne** usunięcie tej osoby na tej scenie.
 *
 * Filtr po scenie jest decyzją, nie ograniczeniem techniki: `Ctrl+Z` wciśnięty
 * przy mapie magazynu nie ma przywracać lampy, którą MG skasował pół godziny
 * temu na innej scenie, bo nikt by tego nie zobaczył ani nie zrozumiał.
 */
export function takeLastDeletion(
  campaignId: string,
  userId: string,
  sceneId: string,
): UndoEntry | null {
  const stack = stacks.get(campaignId);
  if (!stack) return null;
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const entry = stack[index]!;
    if (entry.userId !== userId || entry.sceneId !== sceneId) continue;
    stack.splice(index, 1);
    return entry;
  }
  return null;
}

/**
 * Zapomina wszystko, co dotyczy tej sceny.
 *
 * Wołane po usunięciu sceny: jej wiersze i tak zniknęły kaskadą, a wpis w
 * buforze próbowałby je odtworzyć pod nieistniejącym `sceneId` — czyli wysadzić
 * `Ctrl+Z` błędem klucza obcego.
 */
export function forgetScene(campaignId: string, sceneId: string): void {
  const stack = stacks.get(campaignId);
  if (!stack) return;
  const kept = stack.filter((entry) => entry.sceneId !== sceneId);
  if (kept.length === 0) stacks.delete(campaignId);
  else stacks.set(campaignId, kept);
}

/** Testy: czysty stan między przypadkami. */
export function resetUndoBuffer(): void {
  stacks.clear();
  nextSeq = 1;
}

/** Testy i diagnostyka: ile pozycji czeka w kampanii. */
export function undoDepthOf(campaignId: string): number {
  return stacks.get(campaignId)?.length ?? 0;
}

/**
 * Wiersz Prismy sprowadzony do samych kolumn.
 *
 * `include: { scene: true }` w handlerach usuwania jest tam po to, żeby
 * sprawdzić kampanię — ale dołączony obiekt relacji nie jest kolumną i
 * `create({ data })` wywróciłby się na nim. Zostawiamy skalary (łącznie z `id`
 * i `createdAt`, bo obydwa mają wrócić takie, jakie były), wycinamy resztę.
 */
export function scalarRow(row: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === null) {
      out[key] = null;
      continue;
    }
    const type = typeof value;
    if (type === 'string' || type === 'number' || type === 'boolean' || type === 'bigint') {
      out[key] = value;
      continue;
    }
    if (value instanceof Date) out[key] = value;
  }
  return out;
}
