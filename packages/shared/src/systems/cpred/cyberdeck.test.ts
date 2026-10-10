import { describe, expect, it } from 'vitest';
import {
  ITEM_ROWS_MAX,
  createDefaultCharacterData,
  type CpredCharacterData,
  type CpredGearRow,
} from './character.js';
import type { CompendiumEntry } from './compendium.js';
import {
  cpredFitDeckFromGear,
  cpredGearDeckRows,
  cpredGearInstallRows,
  cpredInstallFromGear,
  cpredPlugDeck,
  cpredSetDeckSlots,
  cpredUninstallToGear,
  cpredUnplugDeck,
} from './cyberdeck.js';
import { purchasedSheetRow } from './shopping.js';

/**
 * Etap 48b: cyberdek i Programy jako towar. Testy pilnują, że nic nie bierze
 * się znikąd i nic nie znika — każda sztuka, która wchodzi do deku, wychodzi
 * z Wyposażenia, a każda, która z niego wychodzi, do Wyposażenia wraca.
 */

const entries: CompendiumEntry[] = [
  { id: 'gear.dek-7', name: 'Dek zwykły', category: 'gear', cost: 500, deckSlots: 7 },
  { id: 'gear.dek-5', name: 'Dek tani', category: 'gear', cost: 100, deckSlots: 5 },
  { id: 'gear.bariera', name: 'Bariera', category: 'gear', cost: 500, deckSlotCost: 2 },
  { id: 'gear.latarka', name: 'Latarka', category: 'gear', cost: 20 },
  {
    id: 'program.miecz',
    name: 'Miecz',
    category: 'program',
    cost: 50,
    programClass: 'attacker',
    target: 'antiProgram',
    atk: 1,
    def: 0,
    rez: 0,
    effects: { vsProgram: 3 },
  },
  {
    id: 'program.kruk',
    name: 'Kruk',
    category: 'program',
    cost: 50,
    programClass: 'attacker',
    blackIce: true,
    atk: 6,
    def: 2,
    rez: 15,
    per: 6,
    speed: 4,
  },
];
const lookup = (id: string) => entries.find((entry) => entry.id === id);

let counter = 0;
const makeId = () => `id${(counter += 1)}`;

function gearRow(id: string, compendiumId: string, qty = 1): CpredGearRow {
  const entry = lookup(compendiumId)!;
  return { id, name: entry.name, notes: '', compendiumId, qty };
}

function sheet(gear: CpredGearRow[]): CpredCharacterData {
  return { ...createDefaultCharacterData(), gear };
}

function ok<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  expect(result.ok).toBe(true);
  return result as Extract<T, { ok: true }>;
}

describe('purchasedSheetRow — Program jako towar', () => {
  it('kładzie Program w Wyposażeniu jak sprzęt', () => {
    expect(purchasedSheetRow(lookup('program.miecz')!, null, 'r1')).toEqual({
      list: 'gear',
      row: { id: 'r1', name: 'Miecz', compendiumId: 'program.miecz', notes: '', qty: 1 },
    });
  });
});

describe('cpredPlugDeck', () => {
  it('bierze dek z Wyposażenia, liczba gniazd z katalogu', () => {
    const data = ok(cpredPlugDeck(sheet([gearRow('d', 'gear.dek-7')]), 'd', lookup, makeId)).data;
    expect(data.gear).toEqual([]);
    expect(data.cyberdeck).toEqual({
      compendiumId: 'gear.dek-7',
      name: 'Dek zwykły',
      slots: 7,
      installed: [],
    });
  });

  it('ze stosu dwóch deków bierze jeden', () => {
    const data = ok(
      cpredPlugDeck(sheet([gearRow('d', 'gear.dek-5', 2)]), 'd', lookup, makeId),
    ).data;
    expect(data.gear).toEqual([gearRow('d', 'gear.dek-5', 1)]);
  });

  it('odmawia wiersza, który nie jest dekiem, i nieistniejącego', () => {
    const data = sheet([gearRow('l', 'gear.latarka'), gearRow('m', 'program.miecz')]);
    expect(cpredPlugDeck(data, 'l', lookup, makeId)).toEqual({ ok: false, error: 'NOT_A_DECK' });
    expect(cpredPlugDeck(data, 'm', lookup, makeId)).toEqual({ ok: false, error: 'NOT_A_DECK' });
    expect(cpredPlugDeck(data, 'x', lookup, makeId)).toEqual({
      ok: false,
      error: 'ITEM_NOT_FOUND',
    });
  });

  it('drugi dek odpina pierwszy razem z zawartością', () => {
    let data = sheet([
      gearRow('d7', 'gear.dek-7'),
      gearRow('d5', 'gear.dek-5'),
      gearRow('m', 'program.miecz'),
    ]);
    data = ok(cpredPlugDeck(data, 'd7', lookup, makeId)).data;
    data = ok(cpredInstallFromGear(data, 'm', lookup, makeId)).data;
    data = ok(cpredPlugDeck(data, 'd5', lookup, makeId)).data;
    expect(data.cyberdeck?.compendiumId).toBe('gear.dek-5');
    expect(data.cyberdeck?.installed).toEqual([]);
    expect(data.gear.map((row) => [row.compendiumId, row.qty])).toEqual([
      ['gear.dek-7', 1],
      ['program.miecz', 1],
    ]);
  });
});

describe('cpredInstallFromGear / cpredUninstallToGear', () => {
  const plugged = () =>
    ok(
      cpredPlugDeck(
        sheet([
          gearRow('d', 'gear.dek-7'),
          gearRow('m', 'program.miecz', 2),
          gearRow('k', 'program.kruk'),
          gearRow('b', 'gear.bariera'),
          gearRow('l', 'gear.latarka'),
        ]),
        'd',
        lookup,
        makeId,
      ),
    ).data;

  it('wkłada jedną sztukę Programu z liczbami z katalogu', () => {
    const data = ok(cpredInstallFromGear(plugged(), 'm', lookup, makeId)).data;
    expect(data.gear.find((row) => row.id === 'm')?.qty).toBe(1);
    expect(data.cyberdeck?.installed).toHaveLength(1);
    expect(data.cyberdeck?.installed[0]).toMatchObject({
      compendiumId: 'program.miecz',
      name: 'Miecz',
      kind: 'program',
      slotCost: 1,
      program: { programClass: 'attacker', atk: 1, effects: { vsProgram: 3 } },
    });
  });

  it('Czarny LOD zajmuje dwa gniazda, Ulepszenie tyle, ile mówi katalog', () => {
    let data = ok(cpredInstallFromGear(plugged(), 'k', lookup, makeId)).data;
    data = ok(cpredInstallFromGear(data, 'b', lookup, makeId)).data;
    expect(data.cyberdeck?.installed.map((row) => [row.kind, row.slotCost])).toEqual([
      ['program', 2],
      ['hardware', 2],
    ]);
    expect(data.gear.map((row) => row.id)).toEqual(['m', 'l']);
  });

  it('odmawia rzeczy, która nie wchodzi do deku, braku deku i braku miejsca', () => {
    expect(cpredInstallFromGear(plugged(), 'l', lookup, makeId)).toEqual({
      ok: false,
      error: 'NOT_INSTALLABLE',
    });
    expect(
      cpredInstallFromGear(sheet([gearRow('m', 'program.miecz')]), 'm', lookup, makeId),
    ).toEqual({ ok: false, error: 'NO_DECK' });
    const full = ok(cpredSetDeckSlots(plugged(), 1)).data;
    const one = ok(cpredInstallFromGear(full, 'm', lookup, makeId)).data;
    expect(cpredInstallFromGear(one, 'm', lookup, makeId)).toEqual({
      ok: false,
      error: 'NO_FREE_SLOTS',
    });
  });

  it('wyjęty Program wraca do Wyposażenia i skleja się ze stosem', () => {
    const installed = ok(cpredInstallFromGear(plugged(), 'm', lookup, makeId)).data;
    const slotId = installed.cyberdeck!.installed[0]!.id;
    const data = ok(cpredUninstallToGear(installed, slotId, makeId)).data;
    expect(data.cyberdeck?.installed).toEqual([]);
    expect(data.gear.find((row) => row.id === 'm')?.qty).toBe(2);
  });
});

describe('cpredUnplugDeck', () => {
  it('dek i zawartość gniazd lądują w Wyposażeniu osobnymi wierszami', () => {
    let data = sheet([
      gearRow('d', 'gear.dek-7'),
      gearRow('m', 'program.miecz'),
      gearRow('b', 'gear.bariera'),
    ]);
    data = ok(cpredPlugDeck(data, 'd', lookup, makeId)).data;
    data = ok(cpredInstallFromGear(data, 'm', lookup, makeId)).data;
    data = ok(cpredInstallFromGear(data, 'b', lookup, makeId)).data;
    data = ok(cpredUnplugDeck(data, makeId)).data;
    expect(data.cyberdeck).toBeNull();
    expect(data.gear.map((row) => [row.compendiumId, row.name, row.qty])).toEqual([
      ['gear.dek-7', 'Dek zwykły', 1],
      ['program.miecz', 'Miecz', 1],
      ['gear.bariera', 'Bariera', 1],
    ]);
  });

  it('odmawia, gdy Wyposażenie nie pomieści zawartości', () => {
    const filler = Array.from({ length: ITEM_ROWS_MAX - 1 }, (_, i) => ({
      id: `f${i}`,
      name: `Rzecz ${i}`,
      notes: '',
      qty: 1,
    }));
    let data = sheet([gearRow('d', 'gear.dek-7'), gearRow('m', 'program.miecz'), ...filler]);
    data = ok(cpredPlugDeck(data, 'd', lookup, makeId)).data;
    data = ok(cpredInstallFromGear(data, 'm', lookup, makeId)).data;
    expect(data.gear).toHaveLength(ITEM_ROWS_MAX - 1);
    expect(cpredUnplugDeck(data, makeId)).toEqual({ ok: false, error: 'TOO_MANY_ROWS' });
  });

  it('bez deku nie ma czego odpinać', () => {
    expect(cpredUnplugDeck(sheet([]), makeId)).toEqual({ ok: false, error: 'NO_DECK' });
  });
});

describe('cpredSetDeckSlots', () => {
  it('nie schodzi poniżej zajętych ani poza zakres', () => {
    let data = sheet([gearRow('d', 'gear.dek-7'), gearRow('k', 'program.kruk')]);
    data = ok(cpredPlugDeck(data, 'd', lookup, makeId)).data;
    data = ok(cpredInstallFromGear(data, 'k', lookup, makeId)).data;
    expect(cpredSetDeckSlots(data, 1)).toEqual({ ok: false, error: 'BAD_SLOTS' });
    expect(cpredSetDeckSlots(data, 99)).toEqual({ ok: false, error: 'BAD_SLOTS' });
    expect(ok(cpredSetDeckSlots(data, 8)).data.cyberdeck?.slots).toBe(8);
  });
});

describe('cpredFitDeckFromGear — kreator', () => {
  it('podpina największy dek i wkłada, ile wejdzie; nadmiar zostaje', () => {
    const data = cpredFitDeckFromGear(
      sheet([
        gearRow('d5', 'gear.dek-5'),
        gearRow('d7', 'gear.dek-7'),
        gearRow('k', 'program.kruk', 3),
        gearRow('m', 'program.miecz'),
        gearRow('l', 'gear.latarka'),
      ]),
      lookup,
      makeId,
    );
    expect(data.cyberdeck?.compendiumId).toBe('gear.dek-7');
    // 3 × Kruk = 6 gniazd, Miecz siódmym.
    expect(data.cyberdeck?.installed.map((row) => row.name)).toEqual([
      'Kruk',
      'Kruk',
      'Kruk',
      'Miecz',
    ]);
    expect(data.gear.map((row) => row.id)).toEqual(['d5', 'l']);
  });

  it('karta z dekiem albo bez deku w plecaku zostaje bez zmian', () => {
    const none = sheet([gearRow('m', 'program.miecz')]);
    expect(cpredFitDeckFromGear(none, lookup, makeId)).toBe(none);
    const plugged = ok(
      cpredPlugDeck(
        sheet([gearRow('d', 'gear.dek-7'), gearRow('m', 'program.miecz')]),
        'd',
        lookup,
        makeId,
      ),
    ).data;
    expect(cpredFitDeckFromGear(plugged, lookup, makeId)).toBe(plugged);
  });

  it('listy dla karty: deki i rzeczy do gniazd', () => {
    const data = sheet([
      gearRow('d', 'gear.dek-7'),
      gearRow('m', 'program.miecz'),
      gearRow('b', 'gear.bariera'),
      gearRow('l', 'gear.latarka'),
    ]);
    expect(cpredGearDeckRows(data, lookup).map((row) => row.id)).toEqual(['d']);
    expect(cpredGearInstallRows(data, lookup).map(({ row, kind }) => [row.id, kind])).toEqual([
      ['m', 'program'],
      ['b', 'hardware'],
    ]);
  });
});
