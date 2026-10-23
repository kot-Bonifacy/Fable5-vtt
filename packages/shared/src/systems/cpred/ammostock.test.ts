import { describe, expect, it } from 'vitest';
import { cpredAmmoPatternCounted, cpredWeaponAmmoCounted, type CpredAmmoProfile } from './ammo.js';
import {
  CPRED_AMMO_PACK_SIZE,
  cpredAmmoHasEffects,
  cpredAmmoPatchRaises,
  cpredAmmoPiecePrice,
  cpredAmmoStockByKind,
  cpredAmmoStockCount,
  cpredCalibreKey,
  cpredCalibreOptions,
  cpredOrdinaryAmmoEntryId,
  cpredPurchasedAmmoRow,
  cpredPutAmmo,
  cpredReloadFromStock,
  cpredStockAmmoId,
  cpredTakeAmmo,
  cpredThrowsFromStock,
  cpredWeaponsWithoutStock,
} from './ammostock.js';
import {
  ITEM_QTY_MAX,
  buildCpredRegistry,
  createDefaultCharacterData,
  parseCharacterData,
  validateCharacterDataPatch,
  type CpredCharacterData,
  type CpredGearRow,
  type CpredWeaponRow,
} from './character.js';
import type { ResolvedWeapon, WeaponTypeDefinition } from './compendium.js';
import { cpredMoveItems } from './inventory.js';
import { cpredRowCatalogPrice } from './merchant.js';

/**
 * Etap 46c: zapas amunicji. Testy pilnują tego, co przy stole kosztuje
 * najwięcej nerwów — że naboje nie biorą się znikąd i nie znikają po cichu:
 * przeładowanie bierze tyle, ile jest, zmiana rodzaju oddaje magazynek do
 * zapasu, a pudełko skleja się po rodzaju i kalibrze, nie po nazwie.
 */

const ORDINARY: CpredAmmoProfile = {
  id: 'ammo.zwykla',
  name: 'Amunicja zwykła',
  patterns: ['bullet', 'shell', 'arrow'],
};
const PIERCING: CpredAmmoProfile = {
  id: 'ammo.przeciwpancerna',
  name: 'Amunicja przeciwpancerna',
  patterns: ['bullet', 'arrow', 'grenade', 'rocket'],
  ablationBonus: 1,
};
const EXPLOSIVE: CpredAmmoProfile = {
  id: 'ammo.zwykla-wybuchowa',
  name: 'Amunicja zwykła (granaty, rakiety)',
  patterns: ['grenade', 'rocket'],
};

function type(patch: Partial<WeaponTypeDefinition> & { id: string }): WeaponTypeDefinition {
  return {
    name: patch.id,
    skillId: null,
    damage: '2k6',
    magazine: 8,
    rof: 2,
    hands: 1,
    concealable: true,
    melee: false,
    ammoPatterns: ['bullet'],
    ...patch,
  };
}

const HEAVY_PISTOL = type({
  id: 'weapon-type.ciezki-pistolet',
  name: 'Ciężki pistolet',
  ammunition: 'C. Pistolet',
});
const HEAVY_SMG = type({
  id: 'weapon-type.ciezki-pm',
  name: 'Ciężki pistolet maszynowy',
  magazine: 40,
  ammunition: 'C. Pistolet',
});
const GRENADE = type({
  id: 'weapon-type.granat',
  name: 'Granat',
  magazine: null,
  thrown: true,
  explosive: true,
  ammunition: 'Granaty',
  ammoPatterns: ['grenade'],
});
const LAUNCHER = type({
  id: 'weapon-type.granatnik',
  name: 'Granatnik',
  magazine: 2,
  ammunition: 'Granaty',
  ammoPatterns: ['grenade'],
});
const KNIFE = type({ id: 'weapon-type.noz', name: 'Nóż', melee: true, ammoPatterns: [] });

function box(qty: number, ammoId: string | null, calibre = 'C. Pistolet', id = 'b1'): CpredGearRow {
  return {
    id,
    name: `${ammoId ?? 'zwykła'} · ${calibre}`,
    notes: '',
    qty,
    ammo: { ammoId, calibre, pattern: calibre === 'Granaty' ? 'grenade' : 'bullet' },
  };
}

let seq = 0;
const makeId = () => `n${(seq += 1)}`;

function reload(
  gear: CpredGearRow[],
  loaded: { count: number; ammoId: string | null },
  nextAmmoId: string | null,
  capacity = 8,
) {
  return cpredReloadFromStock({
    gear,
    calibre: 'C. Pistolet',
    capacity,
    loaded,
    nextAmmoId,
    returned: {
      name: `${loaded.ammoId ?? 'zwykła'} · C. Pistolet`,
      pattern: 'bullet',
    },
    makeId,
  });
}

describe('co się kończy (zasada domowa MG z 23.10)', () => {
  it('granaty i rakiety tak, kule, śrut i strzały nie', () => {
    expect(cpredAmmoPatternCounted('grenade')).toBe(true);
    expect(cpredAmmoPatternCounted('rocket')).toBe(true);
    expect(cpredAmmoPatternCounted('bullet')).toBe(false);
    expect(cpredAmmoPatternCounted('shell')).toBe(false);
    expect(cpredAmmoPatternCounted('arrow')).toBe(false);
  });

  it('broń liczy po swoich kształtach; biała i wpisana ręką nie liczy', () => {
    expect(cpredWeaponAmmoCounted({ ammoPatterns: ['grenade'] })).toBe(true);
    expect(cpredWeaponAmmoCounted({ ammoPatterns: ['bullet', 'shell'] })).toBe(false);
    expect(cpredWeaponAmmoCounted({})).toBe(false);
    expect(cpredWeaponAmmoCounted(null)).toBe(false);
  });
});

describe('kaliber i rodzaj', () => {
  it('kaliber porównuje się bez wielkości liter i nadmiarowych spacji', () => {
    expect(cpredCalibreKey('  C.  Pistolet ')).toBe(cpredCalibreKey('c. pistolet'));
    expect(cpredCalibreKey(undefined)).toBe('');
  });

  it('nabój bez efektów to zwykła amunicja — pudełko zapisuje null', () => {
    expect(cpredAmmoHasEffects(ORDINARY)).toBe(false);
    expect(cpredAmmoHasEffects(PIERCING)).toBe(true);
    expect(cpredStockAmmoId(ORDINARY)).toBeNull();
    expect(cpredStockAmmoId(PIERCING)).toBe('ammo.przeciwpancerna');
    expect(cpredStockAmmoId(null)).toBeNull();
  });

  it('kalibry do zakupu: jeden wiersz na rodzinę, granat pasuje do ręki i granatnika', () => {
    const types = [HEAVY_PISTOL, HEAVY_SMG, GRENADE, LAUNCHER, KNIFE];
    expect(cpredCalibreOptions(EXPLOSIVE, types)).toEqual([
      {
        calibre: 'Granaty',
        typeNames: ['Granat', 'Granatnik'],
        weaponTypeId: GRENADE.id,
        pattern: 'grenade',
      },
    ]);
  });

  it('kalibry do zakupu: kul, śrutu i strzał się nie kupuje (23.10)', () => {
    const types = [HEAVY_PISTOL, HEAVY_SMG, GRENADE, LAUNCHER, KNIFE];
    expect(cpredCalibreOptions(ORDINARY, types)).toEqual([]);
    expect(cpredCalibreOptions(PIERCING, types).map((option) => option.calibre)).toEqual([
      'Granaty',
    ]);
  });

  it('zwykły wpis wybiera się po kształcie naboju', () => {
    const catalogue = [PIERCING, ORDINARY, EXPLOSIVE];
    expect(cpredOrdinaryAmmoEntryId(catalogue, 'bullet')).toBe('ammo.zwykla');
    expect(cpredOrdinaryAmmoEntryId(catalogue, 'grenade')).toBe('ammo.zwykla-wybuchowa');
    expect(cpredOrdinaryAmmoEntryId([PIERCING], 'bullet')).toBeNull();
  });
});

describe('zakup i cena (s. 344)', () => {
  it('kule po 10 w paczce, granaty na sztuki', () => {
    expect(CPRED_AMMO_PACK_SIZE.bullet).toBe(10);
    expect(CPRED_AMMO_PACK_SIZE.grenade).toBe(1);
    const piercing = cpredPurchasedAmmoRow(PIERCING, LAUNCHER, 3, 'r1');
    expect(piercing).toEqual({
      id: 'r1',
      name: 'Amunicja przeciwpancerna · Granaty',
      notes: '',
      compendiumId: 'ammo.przeciwpancerna',
      qty: 3,
      ammo: { ammoId: 'ammo.przeciwpancerna', calibre: 'Granaty', pattern: 'grenade' },
    });
    const grenades = cpredPurchasedAmmoRow(EXPLOSIVE, GRENADE, 2, 'r2');
    expect(grenades).toMatchObject({
      name: 'Amunicja zwykła · Granaty',
      qty: 2,
      ammo: { ammoId: null, calibre: 'Granaty', pattern: 'grenade' },
    });
  });

  it('nabój, który do broni nie pasuje, nie jest towarem', () => {
    expect(cpredPurchasedAmmoRow(ORDINARY, GRENADE, 1, 'r')).toBeNull();
    expect(cpredPurchasedAmmoRow(ORDINARY, KNIFE, 1, 'r')).toBeNull();
  });

  it('kule, śrut i strzały nie są towarem — się nie kończą (23.10)', () => {
    expect(cpredPurchasedAmmoRow(ORDINARY, HEAVY_PISTOL, 1, 'r')).toBeNull();
    expect(cpredPurchasedAmmoRow(PIERCING, HEAVY_SMG, 3, 'r')).toBeNull();
  });

  it('cena sztuki to cena paczki przez jej wielkość — półka i odkup liczą naboje', () => {
    expect(cpredAmmoPiecePrice(100, 'bullet')).toBe(10);
    expect(cpredAmmoPiecePrice(100, 'grenade')).toBe(100);
    const row = { ...box(40, 'ammo.przeciwpancerna'), compendiumId: 'ammo.przeciwpancerna' };
    expect(cpredRowCatalogPrice('gear', row, { priceOf: () => 100 })).toBe(10);
  });
});

describe('zdejmowanie i dokładanie', () => {
  it('zdejmuje z pudełek po kolei, puste znika, za mało = nic', () => {
    const gear = [box(5, null, 'C. Pistolet', 'a'), box(10, null, 'C. Pistolet', 'b')];
    const taken = cpredTakeAmmo(gear, { calibre: 'c. pistolet', ammoId: null }, 7);
    expect(taken).toEqual([{ ...gear[1], qty: 8 }]);
    expect(cpredTakeAmmo(gear, { calibre: 'C. Pistolet', ammoId: null }, 16)).toBeNull();
  });

  it('dokłada do pudełka tego rodzaju, inny rodzaj to nowy wiersz, sufit ilości dzieli', () => {
    const gear = [box(5, null)];
    const put = cpredPutAmmo(
      gear,
      { name: 'x', ammo: { ammoId: null, calibre: 'C. Pistolet', pattern: 'bullet' } },
      3,
      makeId,
    );
    expect(put).toMatchObject([{ id: 'b1', qty: 8 }]);
    const other = cpredPutAmmo(
      gear,
      { name: 'AP', ammo: { ammoId: 'ammo.ap', calibre: 'C. Pistolet', pattern: 'bullet' } },
      3,
      makeId,
    );
    expect(other).toHaveLength(2);
    const full = cpredPutAmmo(
      [box(ITEM_QTY_MAX - 1, null)],
      { name: 'x', ammo: { ammoId: null, calibre: 'C. Pistolet', pattern: 'bullet' } },
      5,
      makeId,
    );
    expect(full.map((row) => row.qty)).toEqual([ITEM_QTY_MAX, 4]);
  });

  it('zapas według rodzaju — liczby przy wyborze naboju', () => {
    const gear = [box(5, null, 'C. Pistolet', 'a'), box(16, 'ammo.ap', 'C. Pistolet', 'b')];
    gear.push(box(3, null, 'Granaty', 'c'));
    const counts = cpredAmmoStockByKind(gear, 'C. Pistolet');
    expect([...counts]).toEqual([
      [null, 5],
      ['ammo.ap', 16],
    ]);
    expect(cpredAmmoStockCount(gear, { calibre: 'Granaty', ammoId: null })).toBe(3);
  });
});

describe('cpredReloadFromStock — przeładowanie z zapasu', () => {
  it('pełne: magazynek do pełna, zapas mniejszy dokładnie o tyle, ile weszło', () => {
    const result = reload([box(20, null)], { count: 2, ammoId: null }, null);
    expect(result).toMatchObject({ ok: true, count: 8, taken: 6, returned: 0 });
    if (result.ok) expect(result.gear).toMatchObject([{ qty: 14 }]);
  });

  it('częściowe: przy małym zapasie wchodzi reszta, a puste pudełko znika', () => {
    const result = reload([box(3, null)], { count: 0, ammoId: null }, null);
    expect(result).toMatchObject({ ok: true, count: 3, taken: 3 });
    if (result.ok) expect(result.gear).toEqual([]);
  });

  it('zerowe: NO_AMMO i nic się nie zmienia', () => {
    expect(reload([], { count: 0, ammoId: null }, null)).toEqual({ ok: false, error: 'NO_AMMO' });
    // Inny kaliber i inny rodzaj nie pasują.
    expect(reload([box(30, null, 'Karabinowa')], { count: 0, ammoId: null }, null)).toEqual({
      ok: false,
      error: 'NO_AMMO',
    });
    expect(reload([box(30, 'ammo.ap')], { count: 0, ammoId: null }, null)).toEqual({
      ok: false,
      error: 'NO_AMMO',
    });
  });

  it('pełny magazynek bez zmiany rodzaju nie jest przeładowaniem', () => {
    expect(reload([box(30, null)], { count: 8, ammoId: null }, null)).toEqual({
      ok: false,
      error: 'MAGAZINE_FULL',
    });
  });

  it('zmiana rodzaju oddaje naboje z magazynka do zapasu i skleja je', () => {
    const gear = [box(10, null, 'C. Pistolet', 'zw'), box(16, 'ammo.ap', 'C. Pistolet', 'ap')];
    const result = reload(gear, { count: 5, ammoId: null }, 'ammo.ap');
    expect(result).toMatchObject({ ok: true, count: 8, taken: 8, returned: 5 });
    if (result.ok) {
      expect(result.gear).toMatchObject([
        { id: 'zw', qty: 15 },
        { id: 'ap', qty: 8 },
      ]);
    }
  });

  it('zmiana rodzaju bez zapasu nowego nie wyjmuje magazynka', () => {
    expect(reload([box(10, null)], { count: 5, ammoId: null }, 'ammo.ap')).toEqual({
      ok: false,
      error: 'NO_AMMO',
    });
  });

  it('naboje wracające bez pudełka swojego rodzaju tworzą nowy wiersz', () => {
    const result = reload([box(10, null)], { count: 4, ammoId: 'ammo.ap' }, null);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.gear).toMatchObject([
        { qty: 2, ammo: { ammoId: null } },
        { qty: 4, ammo: { ammoId: 'ammo.ap', calibre: 'C. Pistolet', pattern: 'bullet' } },
      ]);
    }
  });

  it('granatnik bierze granaty z zapasu granatów — także tych od ręki', () => {
    const result = cpredReloadFromStock({
      gear: [box(1, null, 'Granaty')],
      calibre: 'Granaty',
      capacity: 2,
      loaded: { count: 0, ammoId: null },
      nextAmmoId: null,
      returned: { name: 'x', pattern: 'grenade' },
      makeId,
    });
    expect(result).toMatchObject({ ok: true, count: 1, taken: 1 });
  });
});

describe('granat rzucany i broń bez zapasu', () => {
  const resolved = (weaponType: WeaponTypeDefinition): ResolvedWeapon => ({
    damage: weaponType.damage,
    magazine: weaponType.magazine,
    rof: weaponType.rof,
    hands: weaponType.hands,
    concealable: weaponType.concealable,
    attachmentSlots: 0,
    skillId: null,
    melee: weaponType.melee,
    ...(weaponType.thrown ? { thrown: true } : {}),
    ...(weaponType.ammunition ? { ammoType: weaponType.ammunition } : {}),
    ...(weaponType.ammoPatterns ? { ammoPatterns: weaponType.ammoPatterns } : {}),
  });

  it('granat bez magazynka bierze z zapasu, z magazynkiem się przeładowuje', () => {
    expect(cpredThrowsFromStock({ ammoMax: 0 }, resolved(GRENADE))).toBe(true);
    expect(cpredThrowsFromStock({ ammoMax: 2 }, resolved(GRENADE))).toBe(false);
    expect(cpredThrowsFromStock({ ammoMax: 0 }, resolved(KNIFE))).toBe(false);
    expect(cpredThrowsFromStock({ ammoMax: 0 }, null)).toBe(false);
  });

  it('podsumowanie kreatora wymienia broń bez naboju jej kalibru', () => {
    const weapon = (id: string, name: string, ammoMax: number): CpredWeaponRow => ({
      id,
      name,
      notes: '',
      compendiumId: id,
      damage: '',
      ammoCurrent: ammoMax,
      ammoMax,
      ammoType: '',
      rof: '1',
    });
    const types: Record<string, WeaponTypeDefinition> = {
      pistol: HEAVY_PISTOL,
      smg: HEAVY_SMG,
      grenade: GRENADE,
      knife: KNIFE,
    };
    const sheet: Pick<CpredCharacterData, 'weapons' | 'gear'> = {
      weapons: [
        weapon('pistol', 'Pistolet', 8),
        weapon('smg', 'PM', 40),
        weapon('grenade', 'Granat', 0),
        weapon('knife', 'Nóż', 0),
      ],
      gear: [],
    };
    const resolve = (id: string | undefined) => (id && types[id] ? resolved(types[id]) : null);
    // Pistolet i PM strzelają „bez dna” (23.10) — ostrzeżenie dotyczy granatu.
    expect(cpredWeaponsWithoutStock(sheet, resolve)).toEqual(['Granat']);
    expect(
      cpredWeaponsWithoutStock({ ...sheet, gear: [box(2, null, 'Granaty')] }, resolve),
    ).toEqual([]);
  });
});

describe('pudełka na karcie i między kartami', () => {
  const registry = buildCpredRegistry({ skills: [] }, { roles: [] });

  it('walidacja: pudełko z opisem przechodzi, zepsuty opis zostawia zwykły wiersz', () => {
    const good = validateCharacterDataPatch({ gear: [box(10, 'ammo.ap')] }, registry);
    expect(good.ok && good.patch.gear?.[0]?.ammo).toEqual({
      ammoId: 'ammo.ap',
      calibre: 'C. Pistolet',
      pattern: 'bullet',
    });
    const bad = validateCharacterDataPatch(
      { gear: [{ ...box(10, null), ammo: { ammoId: null, calibre: '', pattern: 'laser' } }] },
      registry,
    );
    expect(bad.ok && bad.patch.gear?.[0]).not.toHaveProperty('ammo');
  });

  it('pudełka kul, śrutu i strzał znikają przy odczycie karty, granaty zostają (23.10)', () => {
    const read = parseCharacterData(
      JSON.stringify({
        ...createDefaultCharacterData(),
        gear: [
          box(30, null, 'C. Pistolet', 'kule'),
          box(2, 'ammo.ap', 'Granaty', 'granaty'),
          { id: 'lina', name: 'Lina', notes: '', qty: 1 },
        ],
      }),
      registry,
    );
    expect(read.gear.map((row) => row.id)).toEqual(['granaty', 'lina']);
  });

  it('„Licz amunicję” zniknęło (23.10): stare pole z bazy nie wraca w odczycie', () => {
    const patch = validateCharacterDataPatch({ ammoTracked: true }, registry);
    expect(patch.ok && 'ammoTracked' in patch.patch).toBe(false);
    const read = parseCharacterData(
      JSON.stringify({ ...createDefaultCharacterData(), ammoTracked: false }),
      registry,
    );
    expect(read).not.toHaveProperty('ammoTracked');
  });

  it('przekazane pudełko skleja się po rodzaju i kalibrze, nie po nazwie ani wpisie', () => {
    const from: CpredCharacterData = {
      ...createDefaultCharacterData(),
      gear: [{ ...box(10, null, 'C. Pistolet', 'x'), name: 'Naboje', compendiumId: 'ammo.a' }],
    };
    const to: CpredCharacterData = {
      ...createDefaultCharacterData(),
      gear: [
        { ...box(6, null, 'c. pistolet', 'y'), compendiumId: 'ammo.b' },
        { ...box(6, 'ammo.ap', 'C. Pistolet', 'z') },
      ],
    };
    const moved = cpredMoveItems(from, to, [{ list: 'gear', rowId: 'x' }], { makeId });
    expect(moved.ok).toBe(true);
    if (moved.ok) {
      expect(moved.result.to.gear.map((row) => [row.id, row.qty])).toEqual([
        ['y', 16],
        ['z', 6],
      ]);
    }
  });
});

describe('cpredAmmoPatchRaises — gracz tylko zmniejsza (decyzja MG 6)', () => {
  const gun: CpredWeaponRow = {
    id: 'g',
    name: 'Pistolet',
    notes: '',
    damage: '',
    ammoCurrent: 3,
    ammoMax: 8,
    ammoType: 'C. Pistolet',
    rof: '2',
    attachmentAmmo: { podw: 1 },
  };
  const current = { weapons: [gun], gear: [box(10, null)] };

  it('mniej naboi i inne pola przechodzą', () => {
    expect(cpredAmmoPatchRaises(current, { weapons: [{ ...gun, ammoCurrent: 2 }] })).toBe(false);
    expect(cpredAmmoPatchRaises(current, { weapons: [{ ...gun, name: 'Bulwa' }] })).toBe(false);
    expect(cpredAmmoPatchRaises(current, { gear: [box(4, null)] })).toBe(false);
    expect(cpredAmmoPatchRaises(current, { gear: [] })).toBe(false);
  });

  it('więcej w magazynku, w podwieszanej, w pudełku albo inny rodzaj — odmowa', () => {
    expect(cpredAmmoPatchRaises(current, { weapons: [{ ...gun, ammoCurrent: 8 }] })).toBe(true);
    expect(
      cpredAmmoPatchRaises(current, { weapons: [{ ...gun, attachmentAmmo: { podw: 2 } }] }),
    ).toBe(true);
    expect(cpredAmmoPatchRaises(current, { weapons: [{ ...gun, attachmentAmmo: {} }] })).toBe(true);
    expect(cpredAmmoPatchRaises(current, { weapons: [{ ...gun, ammoId: 'ammo.ap' }] })).toBe(true);
    expect(cpredAmmoPatchRaises(current, { gear: [box(11, null)] })).toBe(true);
    expect(cpredAmmoPatchRaises(current, { gear: [box(10, null), box(1, 'ammo.ap')] })).toBe(true);
  });
});
