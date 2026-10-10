/**
 * Cyberdek jako towar (etap 48b, decyzja MG z 10.10.2026).
 *
 * Do 48b pole `cyberdeck` karty wypełniała lista z całego kompendium, a Programy
 * wkładało się za darmo. Teraz dek i wszystko, co siedzi w jego gniazdach,
 * **przychodzi z Wyposażenia i do niego wraca** — kupione, z łupu, z wymiany,
 * od MG („Dodaj za darmo”), z pakietu Roli. Dzięki temu cała reszta VTT
 * (sklep, handel, łup, skrzynie, stos na mapie, limit 40 wierszy) działa na
 * Programach bez jednej nowej gałęzi: w plecaku Program jest zwykłym wierszem
 * wyposażenia z `compendiumId`.
 *
 * Reguły, które ten moduł trzyma:
 *
 *  - **dek podpina się z wiersza Wyposażenia** (wpis z `deckSlots`); podpięcie
 *    drugiego najpierw odpina pierwszy,
 *  - **odpięty dek wraca do Wyposażenia razem z zawartością** — każdy Program
 *    i każde Ulepszenie osobnym wierszem (decyzja MG z 10.10), sklejone
 *    z takimi samymi jak zwykłe wyposażenie,
 *  - **Program i Ulepszenie Sprzętowe wkłada się z Wyposażenia** po jednej
 *    sztuce; liczby Programu kopiują się z katalogu w chwili włożenia (26a),
 *  - **liczbę gniazd zmienia tylko MG** — pilnuje tego serwer, nie ten moduł.
 *
 * Czyste funkcje: nic nie zapisują i nie wiedzą, kto pyta.
 */

import {
  CYBERDECK_SLOTS_MAX,
  cyberdeckSlotsFree,
  cyberdeckSlotsUsed,
  type CpredCharacterData,
  type CpredCyberdeck,
  type CpredGearRow,
  type CpredNetInstallRow,
} from './character.js';
import { isGearEntry, isProgramEntry, type CompendiumEntry } from './compendium.js';
import { cpredLandInGear as landInGear, cpredTakeOneGear as takeOne } from './inventory.js';
import { netProgramProfileOf, netProgramSlots } from './netrunning.js';

export type CpredDeckLookup = (compendiumId: string) => CompendiumEntry | undefined;

export type CpredDeckError =
  | 'ITEM_NOT_FOUND'
  | 'NOT_A_DECK'
  | 'NOT_INSTALLABLE'
  | 'NO_DECK'
  | 'NO_FREE_SLOTS'
  | 'TOO_MANY_ROWS'
  | 'BAD_SLOTS';

export type CpredDeckResult =
  { ok: true; data: CpredCharacterData } | { ok: false; error: CpredDeckError };

/** Gniazda, które wpis **daje** — cyberdek i każdy dek wymyślony przez MG. */
export function cpredDeckSlotsOf(entry: CompendiumEntry | undefined): number | null {
  return entry && isGearEntry(entry) && entry.deckSlots ? entry.deckSlots : null;
}

/** Co wpis zajmie w deku: Program albo Ulepszenie Sprzętowe; null — nie wkłada się go. */
export function cpredDeckInstallOf(
  entry: CompendiumEntry | undefined,
): { kind: CpredNetInstallRow['kind']; slotCost: number } | null {
  if (!entry) return null;
  if (isProgramEntry(entry)) return { kind: 'program', slotCost: netProgramSlots(entry) };
  if (isGearEntry(entry) && entry.deckSlotCost) {
    return { kind: 'hardware', slotCost: entry.deckSlotCost };
  }
  return null;
}

function entryOfRow(row: CpredGearRow, lookup: CpredDeckLookup): CompendiumEntry | undefined {
  // Pudełko amunicji nosi `compendiumId` wpisu naboju — dekiem nie bywa nigdy.
  return row.compendiumId && !row.ammo ? lookup(row.compendiumId) : undefined;
}

/** Wiersze Wyposażenia, które da się podpiąć jako dek — lista w sekcji „Cyberdek”. */
export function cpredGearDeckRows(
  data: CpredCharacterData,
  lookup: CpredDeckLookup,
): CpredGearRow[] {
  return data.gear.filter((row) => cpredDeckSlotsOf(entryOfRow(row, lookup)) !== null);
}

/** Wiersze Wyposażenia, które da się włożyć do gniazda — Programy i Ulepszenia. */
export function cpredGearInstallRows(
  data: CpredCharacterData,
  lookup: CpredDeckLookup,
): { row: CpredGearRow; kind: CpredNetInstallRow['kind']; slotCost: number }[] {
  return data.gear.flatMap((row) => {
    const install = cpredDeckInstallOf(entryOfRow(row, lookup));
    return install ? [{ row, ...install }] : [];
  });
}

/** Wiersz Wyposażenia, którym rzecz z gniazda wraca do plecaka. */
function installedAsGear(row: CpredNetInstallRow): CpredGearRow {
  return {
    id: row.id,
    name: row.name,
    notes: row.notes,
    ...(row.compendiumId ? { compendiumId: row.compendiumId } : {}),
    qty: 1,
  };
}

/**
 * Odpina dek: on sam i cała zawartość gniazd lądują w Wyposażeniu. Dek bez
 * wpisu katalogu (stary, wpisany ręką przed 26a) wraca zwykłym wierszem —
 * podpiąć go z powrotem może już tylko MG łatą karty.
 */
export function cpredUnplugDeck(data: CpredCharacterData, makeId: () => string): CpredDeckResult {
  const deck = data.cyberdeck;
  if (!deck) return { ok: false, error: 'NO_DECK' };
  const deckRow: CpredGearRow = {
    id: makeId(),
    name: deck.name,
    notes: '',
    ...(deck.compendiumId ? { compendiumId: deck.compendiumId } : {}),
    qty: 1,
  };
  const landed = landInGear(
    { ...data, cyberdeck: null },
    [deckRow, ...deck.installed.map(installedAsGear)],
    makeId,
  );
  return landed ? { ok: true, data: landed } : { ok: false, error: 'TOO_MANY_ROWS' };
}

/**
 * Podpina dek z wiersza Wyposażenia. Podpięty wcześniej wraca najpierw do
 * plecaka z zawartością — „Netrunner może być podłączony tylko do jednego
 * cyberdeku naraz" (s. 196). Liczba gniazd przychodzi z katalogu.
 */
export function cpredPlugDeck(
  data: CpredCharacterData,
  rowId: string,
  lookup: CpredDeckLookup,
  makeId: () => string,
): CpredDeckResult {
  const row = data.gear.find((candidate) => candidate.id === rowId);
  if (!row) return { ok: false, error: 'ITEM_NOT_FOUND' };
  const slots = cpredDeckSlotsOf(entryOfRow(row, lookup));
  if (slots === null) return { ok: false, error: 'NOT_A_DECK' };
  const taken = takeOne(data, rowId);
  if (!taken) return { ok: false, error: 'ITEM_NOT_FOUND' };
  let next = taken.data;
  if (next.cyberdeck) {
    const unplugged = cpredUnplugDeck(next, makeId);
    if (!unplugged.ok) return unplugged;
    next = unplugged.data;
  }
  const deck: CpredCyberdeck = {
    ...(row.compendiumId ? { compendiumId: row.compendiumId } : {}),
    name: row.name,
    slots: Math.min(slots, CYBERDECK_SLOTS_MAX),
    installed: [],
  };
  return { ok: true, data: { ...next, cyberdeck: deck } };
}

/** Wkłada do gniazda jedną sztukę Programu albo Ulepszenia z Wyposażenia. */
export function cpredInstallFromGear(
  data: CpredCharacterData,
  rowId: string,
  lookup: CpredDeckLookup,
  makeId: () => string,
): CpredDeckResult {
  const deck = data.cyberdeck;
  if (!deck) return { ok: false, error: 'NO_DECK' };
  const row = data.gear.find((candidate) => candidate.id === rowId);
  if (!row) return { ok: false, error: 'ITEM_NOT_FOUND' };
  const entry = entryOfRow(row, lookup);
  const install = cpredDeckInstallOf(entry);
  if (!entry || !install) return { ok: false, error: 'NOT_INSTALLABLE' };
  if (install.slotCost > cyberdeckSlotsFree(deck)) return { ok: false, error: 'NO_FREE_SLOTS' };
  const taken = takeOne(data, rowId);
  if (!taken) return { ok: false, error: 'ITEM_NOT_FOUND' };
  const ids = new Set(deck.installed.map((slot) => slot.id));
  let id = makeId();
  while (ids.has(id)) id = makeId();
  const slot: CpredNetInstallRow = {
    id,
    compendiumId: entry.id,
    name: row.name,
    notes: row.notes,
    kind: install.kind,
    slotCost: install.slotCost,
    // Cała mechanika wpisu razem z „Efektem" (26c) — jedną funkcją z `netrunning`.
    ...(isProgramEntry(entry) ? { program: netProgramProfileOf(entry) } : {}),
  };
  return {
    ok: true,
    data: { ...taken.data, cyberdeck: { ...deck, installed: [...deck.installed, slot] } },
  };
}

/** Wyjmuje rzecz z gniazda z powrotem do Wyposażenia. */
export function cpredUninstallToGear(
  data: CpredCharacterData,
  installedId: string,
  makeId: () => string,
): CpredDeckResult {
  const deck = data.cyberdeck;
  if (!deck) return { ok: false, error: 'NO_DECK' };
  const slot = deck.installed.find((candidate) => candidate.id === installedId);
  if (!slot) return { ok: false, error: 'ITEM_NOT_FOUND' };
  const landed = landInGear(
    {
      ...data,
      cyberdeck: { ...deck, installed: deck.installed.filter((row) => row.id !== installedId) },
    },
    [installedAsGear(slot)],
    makeId,
  );
  return landed ? { ok: true, data: landed } : { ok: false, error: 'TOO_MANY_ROWS' };
}

/**
 * Liczba gniazd (MG): Kombinezon Bodyweight i cyberręka z dekiem dokładają
 * gniazdo (s. 208). Nie mniej niż zajęte — inaczej zawartość nie miałaby gdzie być.
 */
export function cpredSetDeckSlots(data: CpredCharacterData, slots: number): CpredDeckResult {
  const deck = data.cyberdeck;
  if (!deck) return { ok: false, error: 'NO_DECK' };
  if (
    !Number.isInteger(slots) ||
    slots < 1 ||
    slots > CYBERDECK_SLOTS_MAX ||
    slots < cyberdeckSlotsUsed(deck)
  ) {
    return { ok: false, error: 'BAD_SLOTS' };
  }
  return { ok: true, data: { ...data, cyberdeck: { ...deck, slots } } };
}

/**
 * Kreator przy „Utwórz postać” (decyzja MG z 10.10): karta bez deku podpina
 * największy dek z Wyposażenia (pakiet Roli albo koszyk), a potem wkłada
 * Programy i Ulepszenia w kolejności Wyposażenia, ile wejdzie. Nadmiar zostaje
 * w plecaku. Karta, która dek już ma albo nie ma żadnego, wraca bez zmian.
 */
export function cpredFitDeckFromGear(
  data: CpredCharacterData,
  lookup: CpredDeckLookup,
  makeId: () => string,
): CpredCharacterData {
  if (data.cyberdeck) return data;
  const decks = cpredGearDeckRows(data, lookup);
  if (decks.length === 0) return data;
  const best = decks.reduce((top, row) =>
    (cpredDeckSlotsOf(entryOfRow(row, lookup)) ?? 0) >
    (cpredDeckSlotsOf(entryOfRow(top, lookup)) ?? 0)
      ? row
      : top,
  );
  const plugged = cpredPlugDeck(data, best.id, lookup, makeId);
  if (!plugged.ok) return data;
  let next = plugged.data;
  for (const { row } of cpredGearInstallRows(next, lookup)) {
    for (let copy = 0; copy < row.qty; copy += 1) {
      const installed = cpredInstallFromGear(next, row.id, lookup, makeId);
      if (!installed.ok) break;
      next = installed.data;
    }
  }
  return next;
}
