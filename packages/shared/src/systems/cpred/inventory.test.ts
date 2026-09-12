import { describe, expect, it } from 'vitest';
import {
  cpredAllItemRefs,
  cpredInventoryView,
  cpredItemLine,
  cpredMoveItems,
  type CpredItemRef,
} from './inventory.js';
import {
  ITEM_ROWS_MAX,
  createDefaultCharacterData,
  type CpredArmorRow,
  type CpredCharacterData,
  type CpredGearRow,
  type CpredWeaponRow,
} from './character.js';

/**
 * Etap 38b: przedmiot zmieniający kartę.
 *
 * Testy pilnują tego, co przy przenoszeniu najłatwiej zgubić: **stanu rzeczy**.
 * Magazynek 12/30, przykręcony celownik i zużyte OB to nie ozdoby wiersza, tylko
 * jedyny zapis tego, co się z tym przedmiotem działo — a odtworzenie go
 * z katalogu byłoby po cichu naprawianiem cudzej broni.
 */

const weapon: CpredWeaponRow = {
  id: 'w1',
  name: 'Zgrzyt 9',
  notes: '',
  compendiumId: 'weapon.zgrzyt-9',
  damage: '2k6',
  ammoCurrent: 12,
  ammoMax: 30,
  ammoType: 'Pistoletowa',
  ammoId: 'ammo.armour-piercing',
  rof: '2',
  attachmentIds: ['attachment.celownik'],
  attachmentAmmo: {},
};

const armor: CpredArmorRow = {
  id: 'a1',
  name: 'Kurtka Kevlarowa',
  notes: '',
  sp: 11,
  spCurrent: 7,
  location: 'body',
  equipped: true,
  penalty: 0,
};

const stimpak: CpredGearRow = {
  id: 'g1',
  name: 'Stimpak',
  notes: '',
  compendiumId: 'gear.stimpak',
  qty: 3,
  consumable: 'pharma.stimpak',
};

function sheet(patch: Partial<CpredCharacterData> = {}): CpredCharacterData {
  return { ...createDefaultCharacterData(), ...patch };
}

function move(from: CpredCharacterData, to: CpredCharacterData, refs: CpredItemRef[]) {
  const result = cpredMoveItems(from, to, refs, { makeId: () => 'fresh' });
  if (!result.ok) throw new Error(`nieoczekiwana odmowa: ${result.error}`);
  return result.result;
}

describe('cpredMoveItems', () => {
  it('przenosi broń razem z magazynkiem, rodzajem naboi i dodatkami', () => {
    const result = move(sheet({ weapons: [weapon] }), sheet(), [{ list: 'weapons', rowId: 'w1' }]);
    expect(result.from.weapons).toEqual([]);
    expect(result.to.weapons[0]).toMatchObject({
      name: 'Zgrzyt 9',
      ammoCurrent: 12,
      ammoMax: 30,
      ammoId: 'ammo.armour-piercing',
      attachmentIds: ['attachment.celownik'],
    });
  });

  it('przenosi pancerz ze zużytym OB, ale przychodzi on ZDJĘTY', () => {
    const result = move(sheet({ armor: [armor] }), sheet(), [{ list: 'armor', rowId: 'a1' }]);
    const landed = result.to.armor[0]!;
    expect(landed.spCurrent).toBe(7);
    expect(landed.sp).toBe(11);
    // Podniesiona kurtka nie może po cichu zmienić OB odbiorcy — o tym, co się
    // nosi, decyduje właściciel karty.
    expect(landed.equipped).toBe(false);
  });

  it('rozbija stos wyposażenia na wskazaną liczbę sztuk', () => {
    const result = move(sheet({ gear: [stimpak] }), sheet(), [
      { list: 'gear', rowId: 'g1', qty: 2 },
    ]);
    expect(result.from.gear[0]!.qty).toBe(1);
    expect(result.to.gear[0]!.qty).toBe(2);
    expect(result.moved[0]).toMatchObject({ name: 'Stimpak', qty: 2 });
  });

  it('dokłada do istniejącego stosu, gdy to ta sama pozycja katalogu', () => {
    const to = sheet({ gear: [{ ...stimpak, id: 'other', qty: 1 }] });
    const result = move(sheet({ gear: [stimpak] }), to, [{ list: 'gear', rowId: 'g1', qty: 2 }]);
    expect(result.to.gear).toHaveLength(1);
    expect(result.to.gear[0]!.qty).toBe(3);
  });

  it('nie skleja dwóch wierszy spoza katalogu, choćby nazywały się tak samo', () => {
    const hand: CpredGearRow = { id: 'h1', name: 'Notatnik', notes: '', qty: 1 };
    const to = sheet({ gear: [{ ...hand, id: 'h2' }] });
    const result = move(sheet({ gear: [hand] }), to, [{ list: 'gear', rowId: 'h1' }]);
    expect(result.to.gear).toHaveLength(2);
  });

  it('nadaje nowe id, gdy odbiorca ma już wiersz o tym samym identyfikatorze', () => {
    // Kopia figury dostaje od 38a kartę z przepisanym ekwipunkiem, więc dwie
    // karty naprawdę potrafią nieść ten sam identyfikator wiersza.
    const to = sheet({ weapons: [{ ...weapon, name: 'Inna sztuka' }] });
    const result = move(sheet({ weapons: [weapon] }), to, [{ list: 'weapons', rowId: 'w1' }]);
    expect(result.to.weapons).toHaveLength(2);
    expect(result.to.weapons[1]!.id).toBe('fresh');
    expect(result.to.weapons[0]!.name).toBe('Inna sztuka');
  });

  it('odmawia, gdy wiersza nie ma na karcie źródłowej', () => {
    const result = cpredMoveItems(sheet(), sheet(), [{ list: 'gear', rowId: 'nope' }]);
    expect(result).toEqual({ ok: false, error: 'ITEM_NOT_FOUND' });
  });

  it('odmawia przeniesienia większej liczby sztuk, niż jest', () => {
    const result = cpredMoveItems(sheet({ gear: [stimpak] }), sheet(), [
      { list: 'gear', rowId: 'g1', qty: 4 },
    ]);
    expect(result).toEqual({ ok: false, error: 'BAD_QTY' });
  });

  it('odmawia, gdy lista odbiorcy przekroczyłaby limit wierszy', () => {
    const full = sheet({
      gear: Array.from({ length: ITEM_ROWS_MAX }, (_, index) => ({
        id: `f${index}`,
        name: `Rzecz ${index}`,
        notes: '',
        qty: 1,
      })),
    });
    const result = cpredMoveItems(
      sheet({ gear: [{ id: 'x', name: 'X', notes: '', qty: 1 }] }),
      full,
      [{ list: 'gear', rowId: 'x' }],
    );
    expect(result).toEqual({ ok: false, error: 'TOO_MANY_ROWS' });
  });

  it('odmawia pustego żądania', () => {
    expect(cpredMoveItems(sheet(), sheet(), [])).toEqual({ ok: false, error: 'NO_ITEMS' });
  });

  it('przenosi cały ekwipunek jednym żądaniem („Zabierz wszystko")', () => {
    const from = sheet({ weapons: [weapon], armor: [armor], gear: [stimpak] });
    const result = move(from, sheet(), cpredAllItemRefs(from));
    expect(cpredInventoryView(result.from)).toEqual([]);
    expect(cpredInventoryView(result.to)).toHaveLength(3);
  });

  it('nie zmienia karty źródłowej w miejscu', () => {
    const from = sheet({ gear: [stimpak] });
    move(from, sheet(), [{ list: 'gear', rowId: 'g1' }]);
    expect(from.gear).toHaveLength(1);
    expect(from.gear[0]!.qty).toBe(3);
  });
});

describe('cpredItemLine', () => {
  it('nazywa broń razem ze stanem magazynka', () => {
    const [view] = cpredInventoryView(sheet({ weapons: [weapon] }));
    expect(cpredItemLine(view!)).toBe('Zgrzyt 9 (12/30 · Pistoletowa · 1 dodatek)');
  });

  it('nazywa pancerz razem ze zużytym OB', () => {
    const [view] = cpredInventoryView(sheet({ armor: [armor] }));
    expect(cpredItemLine(view!)).toBe('Kurtka Kevlarowa (OB 7/11)');
  });

  it('liczy sztuki wyposażenia', () => {
    const [view] = cpredInventoryView(sheet({ gear: [stimpak] }));
    expect(cpredItemLine(view!)).toBe('Stimpak × 3');
  });
});
