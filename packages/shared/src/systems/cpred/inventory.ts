/**
 * Przedmiot zmieniający kartę (etap 38b).
 *
 * Cały ten plik istnieje dzięki etapowi 38a: odkąd figura ostatystykowana ma
 * prawdziwą kartę postaci, ekwipunek gangera jest **tym samym** ekwipunkiem, co
 * ekwipunek Vex — więc „zabranie pistoletu z ciała" i „oddaję ci stimpak" to
 * jedna operacja na dwóch `CpredCharacterData`, a nie dwie gałęzie w kodzie.
 *
 * Trzy rzeczy, które ten moduł trzyma i które są tu **regułą, nie szczegółem
 * implementacji**:
 *
 *  - **wiersz przenosi się w całości** — magazynek, dodatki, zużyte OB
 *    i „prowizorka" siedzą na wierszu od etapów 16/31/30b, więc przeniesienie
 *    jest przeniesieniem obiektu, a nie odtwarzaniem go z katalogu. Kto
 *    kiedykolwiek doda broni nowe pole, dostanie je tutaj za darmo,
 *  - **pancerz przychodzi zdjęty** (`equipped: false`) — inaczej łup po cichu
 *    zmieniałby OB odbiorcy w chwili podniesienia, a o tym, co się nosi,
 *    decyduje właściciel karty,
 *  - **cyborgizacje nie jadą nigdzie** — wszczep jest w ciele, a nie w plecaku;
 *    zdejmuje go `character:cyberware` z etapu 23a, z Testem i ceną.
 */

import {
  ITEM_ROWS_MAX,
  type CpredArmorRow,
  type CpredCharacterData,
  type CpredGearRow,
  type CpredItemRow,
  type CpredWeaponRow,
} from './character.js';

/** Trzy listy ekwipunku, które da się przenieść między kartami. */
export type CpredItemList = 'weapons' | 'armor' | 'gear';

export const CPRED_ITEM_LISTS: readonly CpredItemList[] = ['weapons', 'armor', 'gear'];

export const CPRED_ITEM_LIST_LABELS: Record<CpredItemList, string> = {
  weapons: 'Broń',
  armor: 'Pancerz',
  gear: 'Wyposażenie',
};

export function isCpredItemList(value: unknown): value is CpredItemList {
  return typeof value === 'string' && CPRED_ITEM_LISTS.includes(value as CpredItemList);
}

/**
 * Adres jednego przenoszonego wiersza.
 *
 * `qty` ma sens **wyłącznie** na liście `gear`: broń i pancerz są pojedynczymi
 * przedmiotami z własnym stanem (ten magazynek, to zużycie), więc „przenieś dwa
 * z trzech" nie jest dla nich pytaniem, na które istnieje odpowiedź.
 */
export interface CpredItemRef {
  list: CpredItemList;
  rowId: string;
  /** Ile sztuk; brak znaczy „wszystkie". Ignorowane poza `gear`. */
  qty?: number;
}

/** Wiersz ekwipunku tak, jak pokazuje go okno wymiany i karta czatu. */
export interface CpredItemView {
  list: CpredItemList;
  rowId: string;
  name: string;
  /** „12/30 · celownik", „OB 7/11" — stan, który jedzie razem z rzeczą. */
  detail: string;
  /** Ile sztuk niesie wiersz; 1 dla broni i pancerza. */
  qty: number;
  /** Wiersz, którego ilość da się rozbić przy przenoszeniu. */
  stackable: boolean;
}

export type CpredItemMoveError = 'ITEM_NOT_FOUND' | 'BAD_QTY' | 'TOO_MANY_ROWS' | 'NO_ITEMS';

export interface CpredItemMoveResult {
  from: CpredCharacterData;
  to: CpredCharacterData;
  /** Co naprawdę pojechało — źródło zdania na czacie. */
  moved: CpredItemView[];
}

/** Stan broni jednym zwrotem: magazynek, kaliber, liczba dodatków. */
function weaponDetail(row: CpredWeaponRow): string {
  const parts: string[] = [];
  if (row.ammoMax > 0) parts.push(`${row.ammoCurrent}/${row.ammoMax}`);
  if (row.ammoType) parts.push(row.ammoType);
  const attachments = row.attachmentIds?.length ?? 0;
  if (attachments === 1) parts.push('1 dodatek');
  else if (attachments > 1) parts.push(`${attachments} dodatków`);
  return parts.join(' · ');
}

function armorDetail(row: CpredArmorRow): string {
  const parts = [`OB ${row.spCurrent}/${row.sp}`];
  if (row.fieldRepair) parts.push('prowizorka');
  return parts.join(' · ');
}

/** Jak wiersz opisuje się sam — w oknie wymiany i na karcie czatu. */
export function cpredItemView(list: CpredItemList, row: CpredItemRow): CpredItemView {
  switch (list) {
    case 'weapons': {
      const weapon = row as CpredWeaponRow;
      return {
        list,
        rowId: row.id,
        name: row.name,
        detail: weaponDetail(weapon),
        qty: 1,
        stackable: false,
      };
    }
    case 'armor': {
      const armor = row as CpredArmorRow;
      return {
        list,
        rowId: row.id,
        name: row.name,
        detail: armorDetail(armor),
        qty: 1,
        stackable: false,
      };
    }
    case 'gear': {
      const gear = row as CpredGearRow;
      return {
        list,
        rowId: row.id,
        name: row.name,
        detail: gear.notes.slice(0, 60),
        qty: gear.qty,
        stackable: true,
      };
    }
  }
}

/** Cały ekwipunek karty jednym ciągiem — lewa kolumna okna wymiany. */
export function cpredInventoryView(data: CpredCharacterData): CpredItemView[] {
  return [
    ...data.weapons.map((row) => cpredItemView('weapons', row)),
    ...data.armor.map((row) => cpredItemView('armor', row)),
    ...data.gear.map((row) => cpredItemView('gear', row)),
  ];
}

/** „Zgrzyt 9 (12/30)", „Stimpak × 2" — jedna linijka karty czatu. */
export function cpredItemLine(view: CpredItemView): string {
  if (view.stackable) return view.qty > 1 ? `${view.name} × ${view.qty}` : view.name;
  return view.detail ? `${view.name} (${view.detail})` : view.name;
}

/**
 * Czy dwa wiersze wyposażenia to ta sama rzecz, którą wolno zsumować.
 *
 * Warunkiem jest **wpis katalogu**, nie sama nazwa: dwie fiolki z tej samej
 * pozycji kompendium są nierozróżnialne, a dwa ręcznie wpisane „Notatnik" mogą
 * być czymkolwiek. Uwagi muszą się zgadzać, bo w nich MG zapisuje to, co ten
 * konkretny egzemplarz ma szczególnego.
 */
function stacksWith(a: CpredGearRow, b: CpredGearRow): boolean {
  if (!a.compendiumId || a.compendiumId !== b.compendiumId) return false;
  return (
    a.name === b.name &&
    a.notes === b.notes &&
    a.consumable === b.consumable &&
    a.upgrade === b.upgrade
  );
}

/**
 * Wiersz, który ląduje na karcie odbiorcy.
 *
 * Id wiersza jest unikalne **w obrębie karty**, a nie kampanii — a od 38a kopia
 * figury dostaje kartę z przepisanym ekwipunkiem, więc dwie karty naprawdę
 * potrafią nieść ten sam identyfikator. Kolizję rozstrzyga się nowym id, nie
 * nadpisaniem cudzego wiersza.
 */
function landedRow<T extends CpredItemRow>(
  row: T,
  taken: ReadonlySet<string>,
  makeId: () => string,
): T {
  if (!taken.has(row.id)) return row;
  let id = makeId();
  while (taken.has(id)) id = makeId();
  return { ...row, id };
}

export interface CpredMoveOptions {
  /** Świeże id wiersza na wypadek kolizji; domyślnie losowe, jak w edytorze karty. */
  makeId?: () => string;
}

function defaultMakeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Przenosi wskazane wiersze z jednej karty na drugą.
 *
 * Czysta funkcja: nic nie zapisuje i nie wie, kto ma prawo to zrobić — to
 * pytanie serwera. Zwraca **obie** karty, bo przeniesienie jest jedną operacją
 * na dwóch stanach naraz i rozdzielenie jej na „zabierz" i „dołóż" pozwoliłoby
 * wywołującemu zapisać połowę.
 */
export function cpredMoveItems(
  from: CpredCharacterData,
  to: CpredCharacterData,
  refs: readonly CpredItemRef[],
  options: CpredMoveOptions = {},
): { ok: true; result: CpredItemMoveResult } | { ok: false; error: CpredItemMoveError } {
  if (refs.length === 0) return { ok: false, error: 'NO_ITEMS' };
  const makeId = options.makeId ?? defaultMakeId;

  const source: Record<CpredItemList, CpredItemRow[]> = {
    weapons: [...from.weapons],
    armor: [...from.armor],
    gear: [...from.gear],
  };
  const target: Record<CpredItemList, CpredItemRow[]> = {
    weapons: [...to.weapons],
    armor: [...to.armor],
    gear: [...to.gear],
  };
  const moved: CpredItemView[] = [];

  for (const ref of refs) {
    const rows = source[ref.list];
    const index = rows.findIndex((row) => row.id === ref.rowId);
    if (index === -1) return { ok: false, error: 'ITEM_NOT_FOUND' };
    const row = rows[index]!;

    if (ref.list === 'gear') {
      const gear = row as CpredGearRow;
      const want = ref.qty === undefined ? gear.qty : ref.qty;
      if (!Number.isInteger(want) || want < 1 || want > gear.qty) {
        return { ok: false, error: 'BAD_QTY' };
      }
      const left: CpredGearRow = { ...gear, qty: gear.qty - want };
      if (want === gear.qty) rows.splice(index, 1);
      else rows[index] = left;

      const gearTarget = target.gear as CpredGearRow[];
      const stack = gearTarget.findIndex((candidate) => stacksWith(gear, candidate));
      if (stack === -1) {
        const taken = new Set(gearTarget.map((candidate) => candidate.id));
        const fresh: CpredGearRow = { ...gear, qty: want };
        gearTarget.push(landedRow(fresh, taken, makeId));
      } else {
        const existing = gearTarget[stack]!;
        gearTarget[stack] = { ...existing, qty: existing.qty + want };
      }
      moved.push({ ...cpredItemView('gear', gear), qty: want });
      continue;
    }

    rows.splice(index, 1);
    const taken = new Set(target[ref.list].map((candidate) => candidate.id));
    // Zdjęty pancerz: patrz nagłówek pliku. Broń nie ma odpowiednika tej
    // decyzji, bo samo trzymanie broni nie zmienia na karcie żadnej liczby.
    const landing = ref.list === 'armor' ? { ...(row as CpredArmorRow), equipped: false } : row;
    target[ref.list].push(landedRow(landing, taken, makeId));
    moved.push(cpredItemView(ref.list, row));
  }

  for (const list of CPRED_ITEM_LISTS) {
    if (target[list].length > ITEM_ROWS_MAX) return { ok: false, error: 'TOO_MANY_ROWS' };
  }

  return {
    ok: true,
    result: {
      from: {
        ...from,
        weapons: source.weapons as CpredWeaponRow[],
        armor: source.armor as CpredArmorRow[],
        gear: source.gear as CpredGearRow[],
      },
      to: {
        ...to,
        weapons: target.weapons as CpredWeaponRow[],
        armor: target.armor as CpredArmorRow[],
        gear: target.gear as CpredGearRow[],
      },
      moved,
    },
  };
}

/** Adresy wszystkich wierszy karty — „Zabierz wszystko" z okna wymiany. */
export function cpredAllItemRefs(data: CpredCharacterData): CpredItemRef[] {
  return cpredInventoryView(data).map((view) => ({ list: view.list, rowId: view.rowId }));
}
