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

import { cpredSameAmmo } from './ammostock.js';
import {
  ITEM_QTY_MAX,
  ITEM_ROWS_MAX,
  type CpredArmorRow,
  type CpredCharacterData,
  type CpredGearAmmo,
  type CpredGearRow,
  type CpredItemRow,
  type CpredWeaponRow,
} from './character.js';
import type { ArmorLocation } from './locations.js';
import { STATIST_WEAPON_ROW_ID } from './statist.js';

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
  /**
   * Wpis kompendium, z którego wiersz pochodzi (24.09.2026) — po nim okno
   * wymiany i łupu rysuje miniaturę rodzaju. Katalog jest wspólny dla stołu,
   * więc id nie mówi graczowi nic, czego nie widzi w zakładce „Kompendium”.
   */
  compendiumId?: string;
  /** Gdzie siedzi pancerz — tarcza ma inną miniaturę niż kurtka. */
  armorLocation?: ArmorLocation;
  /** Etap 46c: kształt naboju w pudełku — miniatura pudełka bez wpisu. */
  ammo?: Pick<CpredGearAmmo, 'pattern'>;
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
  const source = row.compendiumId ? { compendiumId: row.compendiumId } : {};
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
        ...source,
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
        ...source,
        armorLocation: armor.location,
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
        ...source,
        ...(gear.ammo ? { ammo: { pattern: gear.ammo.pattern } } : {}),
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
  // Etap 46c: pudełko amunicji skleja się po rodzaju i kalibrze — naboje
  // wyjęte z magazynka i kupione u handlarza to ta sama amunicja, choć jedno
  // pudełko powstało z wpisu, a drugie z magazynka.
  if (a.ammo || b.ammo) return !!a.ammo && !!b.ammo && cpredSameAmmo(a.ammo, b.ammo);
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
 *
 * Id zastrzeżone — broń statysty (`STATIST_WEAPON_ROW_ID`) — nie jedzie z łupem
 * nigdy (#27, 27.09): po nim karta ataku szukała strzelca, a gracz z pistoletem
 * zdobytym na Zbirze stawał się strzelcem ataków wszystkich statystów.
 */
export function cpredLandedRow<T extends CpredItemRow>(
  row: T,
  taken: ReadonlySet<string>,
  makeId: () => string,
): T {
  if (!taken.has(row.id) && row.id !== STATIST_WEAPON_ROW_ID) return row;
  let id = makeId();
  while (taken.has(id)) id = makeId();
  return { ...row, id };
}

export interface CpredMoveOptions {
  /** Świeże id wiersza na wypadek kolizji; domyślnie losowe, jak w edytorze karty. */
  makeId?: () => string;
}

export function cpredRowId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export type CpredItemLists = Record<CpredItemList, CpredItemRow[]>;

export function cpredItemLists(data: CpredCharacterData): CpredItemLists {
  return { weapons: [...data.weapons], armor: [...data.armor], gear: [...data.gear] };
}

export function cpredWithItemLists(
  data: CpredCharacterData,
  lists: CpredItemLists,
): CpredCharacterData {
  return {
    ...data,
    weapons: lists.weapons as CpredWeaponRow[],
    armor: lists.armor as CpredArmorRow[],
    gear: lists.gear as CpredGearRow[],
  };
}

/** Wiersz zdjęty z karty źródłowej — w drodze, jeszcze nigdzie nie wylądował. */
export interface CpredTakenRow {
  list: CpredItemList;
  row: CpredItemRow;
  view: CpredItemView;
}

/**
 * Zdejmuje wskazane wiersze z list (mutuje je — to kopie z `cpredItemLists`).
 *
 * Wiersz wyposażenia rozbija się przy `qty` mniejszym niż stos; reszta zostaje
 * na miejscu z tym samym id.
 */
export function cpredTakeRows(
  source: CpredItemLists,
  refs: readonly CpredItemRef[],
): { ok: true; taken: CpredTakenRow[] } | { ok: false; error: CpredItemMoveError } {
  const taken: CpredTakenRow[] = [];
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
      const going: CpredGearRow = { ...gear, qty: want };
      if (want === gear.qty) rows.splice(index, 1);
      else rows[index] = left;
      taken.push({
        list: 'gear',
        row: going,
        view: { ...cpredItemView('gear', gear), qty: want },
      });
      continue;
    }

    rows.splice(index, 1);
    taken.push({ list: ref.list, row, view: cpredItemView(ref.list, row) });
  }
  return { ok: true, taken };
}

/** Kładzie zdjęte wiersze na liście odbiorcy: sklejanie, zdjęty pancerz, świeże id. */
export function cpredLandRows(
  target: CpredItemLists,
  taken: readonly CpredTakenRow[],
  makeId: () => string,
): void {
  for (const { list, row } of taken) {
    if (list === 'gear') {
      const gear = row as CpredGearRow;
      const gearTarget = target.gear as CpredGearRow[];
      // Stos ponad `ITEM_QTY_MAX` nie przeszedłby walidacji karty — wtedy
      // nowy wiersz (40 naboi do pudełka z 980 to dwa pudełka, nie zguba).
      const stack = gearTarget.findIndex(
        (candidate) => stacksWith(gear, candidate) && candidate.qty + gear.qty <= ITEM_QTY_MAX,
      );
      if (stack === -1) {
        const ids = new Set(gearTarget.map((candidate) => candidate.id));
        gearTarget.push(cpredLandedRow(gear, ids, makeId));
      } else {
        const existing = gearTarget[stack]!;
        gearTarget[stack] = { ...existing, qty: existing.qty + gear.qty };
      }
      continue;
    }
    const ids = new Set(target[list].map((candidate) => candidate.id));
    // Zdjęty pancerz: patrz nagłówek pliku. Broń nie ma odpowiednika tej
    // decyzji, bo samo trzymanie broni nie zmienia na karcie żadnej liczby.
    const landing = list === 'armor' ? { ...(row as CpredArmorRow), equipped: false } : row;
    target[list].push(cpredLandedRow(landing, ids, makeId));
  }
}

export function cpredItemListsOverflow(lists: CpredItemLists): boolean {
  return CPRED_ITEM_LISTS.some((list) => lists[list].length > ITEM_ROWS_MAX);
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
  const makeId = options.makeId ?? cpredRowId;

  const source = cpredItemLists(from);
  const target = cpredItemLists(to);
  const took = cpredTakeRows(source, refs);
  if (!took.ok) return took;
  cpredLandRows(target, took.taken, makeId);
  if (cpredItemListsOverflow(target)) return { ok: false, error: 'TOO_MANY_ROWS' };

  return {
    ok: true,
    result: {
      from: cpredWithItemLists(from, source),
      to: cpredWithItemLists(to, target),
      moved: took.taken.map((entry) => entry.view),
    },
  };
}

export interface CpredItemSwapResult {
  a: CpredCharacterData;
  b: CpredCharacterData;
  /** Co pojechało od A do B. */
  fromA: CpredItemView[];
  /** Co pojechało od B do A. */
  fromB: CpredItemView[];
}

/**
 * Wymiana w obie strony naraz — handel (etap 38c).
 *
 * **Nie jest** dwoma wywołaniami `cpredMoveItems` po kolei, i to z dwóch
 * powodów. Po pierwsze stos: gdyby A → B poszło pierwsze, trzy stimpaki A
 * skleiłyby się ze stimpakami B, a „oddaję wszystkie" po stronie B zabrałoby
 * i te, które właśnie dostał. Po drugie limit wierszy: B z pełną listą broni,
 * który wymienia pistolet na pistolet, w połowie drogi miałby o jeden wiersz
 * za dużo. Dlatego obie strony najpierw **zdejmują**, a dopiero potem obie
 * **kładą** — a limit liczy się na stanie końcowym.
 *
 * Puste listy są dozwolone po obu stronach: handel bywa „pistolet za 500 ed",
 * a o tym, czy w ogóle jest co wymieniać, rozstrzyga wołający.
 */
export function cpredSwapItems(
  a: CpredCharacterData,
  b: CpredCharacterData,
  aRefs: readonly CpredItemRef[],
  bRefs: readonly CpredItemRef[],
  options: CpredMoveOptions = {},
): { ok: true; result: CpredItemSwapResult } | { ok: false; error: CpredItemMoveError } {
  const makeId = options.makeId ?? cpredRowId;
  const aLists = cpredItemLists(a);
  const bLists = cpredItemLists(b);
  const fromA = cpredTakeRows(aLists, aRefs);
  if (!fromA.ok) return fromA;
  const fromB = cpredTakeRows(bLists, bRefs);
  if (!fromB.ok) return fromB;
  cpredLandRows(bLists, fromA.taken, makeId);
  cpredLandRows(aLists, fromB.taken, makeId);
  if (cpredItemListsOverflow(aLists) || cpredItemListsOverflow(bLists))
    return { ok: false, error: 'TOO_MANY_ROWS' };
  return {
    ok: true,
    result: {
      a: cpredWithItemLists(a, aLists),
      b: cpredWithItemLists(b, bLists),
      fromA: fromA.taken.map((entry) => entry.view),
      fromB: fromB.taken.map((entry) => entry.view),
    },
  };
}

/**
 * Oferta w polu wymiany, sprawdzona z kartą: co dokładnie by pojechało.
 *
 * Zwraca widoki z **jawną** ilością i adresy z jawną ilością — oferta nie może
 * znaczyć „cały stos", bo stos zmienia się pod nią (dokupiony stimpak nie ma
 * po cichu dołączyć do ceny). Ten sam wiersz dwa razy to błąd żądania.
 */
export function cpredOfferViews(
  data: CpredCharacterData,
  refs: readonly CpredItemRef[],
):
  | { ok: true; refs: CpredItemRef[]; views: CpredItemView[] }
  | { ok: false; error: CpredItemMoveError } {
  const seen = new Set<string>();
  for (const ref of refs) {
    const key = `${ref.list}:${ref.rowId}`;
    if (seen.has(key)) return { ok: false, error: 'BAD_QTY' };
    seen.add(key);
  }
  const took = cpredTakeRows(cpredItemLists(data), refs);
  if (!took.ok) return took;
  return {
    ok: true,
    refs: took.taken.map(({ list, row }) =>
      list === 'gear'
        ? { list, rowId: row.id, qty: (row as CpredGearRow).qty }
        : { list, rowId: row.id },
    ),
    views: took.taken.map((entry) => entry.view),
  };
}

/** Adresy wszystkich wierszy karty — „Zabierz wszystko" z okna wymiany. */
export function cpredAllItemRefs(data: CpredCharacterData): CpredItemRef[] {
  return cpredInventoryView(data).map((view) => ({ list: view.list, rowId: view.rowId }));
}
