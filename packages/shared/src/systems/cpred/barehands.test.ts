import { describe, expect, it } from 'vitest';
import {
  CPRED_BARE_HANDS_ROW_IDS,
  cpredBareHandsRows,
  cpredIsBareHandsEntry,
  cpredIsBareHandsRow,
  cpredWithBareHands,
  unarmedDamage,
} from './barehands.js';
import {
  buildCpredRegistry,
  cpredDrawnWeapons,
  createDefaultCharacterData,
  mergeCharacterData,
  parseCharacterData,
  validateCharacterDataPatch,
  type CpredCharacterData,
  type CpredWeaponRow,
} from './character.js';
import { cpredInventoryView, cpredMoveItems } from './inventory.js';
import { createContainerSheet } from './containercard.js';
import { statistQuick } from './statist.js';

/**
 * Etap 47b (decyzja MG z 10.10.2026): Bijatyka z urzędu na każdej karcie poza
 * pojemnikiem, Sztuki walki przy Umiejętności ≥ 1. Wiersze są stałe — nie jadą
 * łatą, nie wędrują między kartami i zawsze stoją na końcu listy broni.
 */

const pistol: CpredWeaponRow = {
  id: 'w1',
  name: 'Zgrzyt 9',
  notes: '',
  compendiumId: 'weapon.zgrzyt-9',
  damage: '2k6',
  ammoCurrent: 12,
  ammoMax: 12,
  ammoType: 'Pistoletowa',
  rof: '2',
};

const registry = buildCpredRegistry(
  {
    skills: [
      { id: 'martial-arts', name: 'Sztuki walki', stat: 'dex', multiplier: 2 },
      { id: 'brawling', name: 'Bijatyka', stat: 'dex' },
    ],
  },
  { roles: [] },
);

function sheet(patch: Partial<CpredCharacterData> = {}): CpredCharacterData {
  return mergeCharacterData(createDefaultCharacterData(), patch);
}

describe('unarmedDamage — the BODY ladder', () => {
  it('reads the rung off BODY, a cyberarm lifts the weakest one', () => {
    expect(unarmedDamage(4)).toBe('1k6');
    expect(unarmedDamage(6)).toBe('2k6');
    expect(unarmedDamage(10)).toBe('3k6');
    expect(unarmedDamage(11)).toBe('4k6');
    expect(unarmedDamage(3, true)).toBe('2k6');
  });
});

describe('gołe ręce z urzędu', () => {
  it('każda karta ma Bijatykę na końcu listy broni, z obrażeniami z BC', () => {
    const data = sheet({
      weapons: [pistol],
      stats: { ...createDefaultCharacterData().stats, body: 8 },
    });
    expect(data.weapons.map((row) => row.id)).toEqual(['w1', CPRED_BARE_HANDS_ROW_IDS.brawling]);
    expect(data.weapons[1]).toMatchObject({
      name: 'Bijatyka',
      compendiumId: 'weapon.brawling',
      damage: '3k6',
      ammoMax: 0,
    });
  });

  it('Sztuki walki dopiero przy Umiejętności ≥ 1 — i znikają razem z nią', () => {
    expect(sheet().weapons.map((row) => row.name)).toEqual(['Bijatyka']);
    const trained = sheet({ skills: { 'martial-arts': 2 } });
    expect(trained.weapons.map((row) => row.name)).toEqual(['Bijatyka', 'Sztuki walki']);
    const forgot = mergeCharacterData(trained, { skills: {} });
    expect(forgot.weapons.map((row) => row.name)).toEqual(['Bijatyka']);
  });

  it('pojemnik nie ma rąk', () => {
    expect(cpredBareHandsRows(createContainerSheet())).toEqual([]);
    expect(mergeCharacterData(createContainerSheet(), {}).weapons).toEqual([]);
  });

  it('łata karty ich nie niesie: przemianowana albo skasowana pięść wraca taka sama', () => {
    const data = sheet({ weapons: [pistol] });
    const renamed = data.weapons.map((row) =>
      cpredIsBareHandsRow(row) ? { ...row, name: 'Młot', damage: '9k6' } : row,
    );
    const checked = validateCharacterDataPatch({ weapons: renamed }, registry);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.patch.weapons?.map((row) => row.id)).toEqual(['w1']);
    expect(mergeCharacterData(data, checked.patch).weapons[1]).toMatchObject({
      name: 'Bijatyka',
      damage: '2k6',
    });
    expect(mergeCharacterData(data, { weapons: [] }).weapons.map((row) => row.name)).toEqual([
      'Bijatyka',
    ]);
  });

  it('odczyt z bazy dokłada je też starym kartom', () => {
    const stored = JSON.stringify({ ...createDefaultCharacterData(), weapons: [pistol] });
    expect(parseCharacterData(stored, registry).weapons.map((row) => row.id)).toEqual([
      'w1',
      CPRED_BARE_HANDS_ROW_IDS.brawling,
    ]);
  });

  it('kupiona przed 47b „Bijatyka” ustępuje stałej, a ręce trzymają stałą', () => {
    const bought: CpredWeaponRow = {
      ...pistol,
      id: 'old-fist',
      name: 'Bijatyka',
      compendiumId: 'weapon.brawling',
      ammoCurrent: 0,
      ammoMax: 0,
    };
    const result = cpredWithBareHands({
      ...createDefaultCharacterData(),
      weapons: [pistol, bought],
      drawnWeaponRowIds: ['old-fist'],
    });
    expect(result.weapons.map((row) => row.id)).toEqual(['w1', CPRED_BARE_HANDS_ROW_IDS.brawling]);
    expect(result.drawnWeaponRowIds).toEqual([CPRED_BARE_HANDS_ROW_IDS.brawling]);
  });

  it('karta, której nikt nie pytał o ręce, nie „trzyma” Bijatyki', () => {
    expect(cpredDrawnWeapons(sheet())).toEqual([]);
    expect(cpredDrawnWeapons(sheet({ weapons: [pistol] })).map((row) => row.id)).toEqual(['w1']);
  });

  it('nie są przedmiotem: ani w oknie wymiany, ani w przenoszeniu', () => {
    const data = sheet({ weapons: [pistol] });
    expect(cpredInventoryView(data).map((view) => view.rowId)).toEqual(['w1']);
    expect(
      cpredMoveItems(data, sheet(), [
        { list: 'weapons', rowId: CPRED_BARE_HANDS_ROW_IDS.brawling },
      ]),
    ).toEqual({ ok: false, error: 'ITEM_NOT_FOUND' });
  });

  it('statysta bez broni nie bierze Bijatyki za swoją broń', () => {
    expect(statistQuick(sheet()).weaponName).toBe('Pięści');
  });

  it('wpisów katalogu gołych rąk się nie kupuje', () => {
    expect(cpredIsBareHandsEntry('weapon.brawling')).toBe(true);
    expect(cpredIsBareHandsEntry('weapon.martial-arts')).toBe(true);
    expect(cpredIsBareHandsEntry('weapon.zgrzyt-9')).toBe(false);
  });
});
