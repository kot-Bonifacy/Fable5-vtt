import { describe, expect, it } from 'vitest';
import { cpredReturnAttachmentToGear, cpredTakeAttachmentFromGear } from './attachments.js';
import {
  ITEM_ROWS_MAX,
  createDefaultCharacterData,
  type CpredArmorRow,
  type CpredCharacterData,
  type CpredCyberwareRow,
  type CpredGearRow,
  type CpredWeaponRow,
} from './character.js';
import type { CompendiumEntry } from './compendium.js';
import { cpredPlayerItemPatchProblem } from './itemlocks.js';
import { purchasedSheetRow } from './shopping.js';

/**
 * Etap 48c (decyzje MG z 10.10): rzeczy z mechaniką nie przybywają graczowi
 * łatą karty — ani nowy wiersz, ani sztuka, ani punkt OB, ani liczba broni.
 * Uwagi, wyrzucenie, zużycie i zakładanie pancerza zostają jego.
 */

const gun: CpredWeaponRow = {
  id: 'w1',
  name: 'Pistolet',
  notes: '',
  compendiumId: 'weapon.pistolet',
  damage: '2k6',
  ammoCurrent: 8,
  ammoMax: 12,
  ammoType: 'C. Pistolet',
  rof: '2',
};
const vest: CpredArmorRow = {
  id: 'a1',
  name: 'Kurtka',
  notes: '',
  compendiumId: 'armor.kurtka',
  sp: 11,
  spCurrent: 9,
  location: 'body',
};
const doses: CpredGearRow = {
  id: 'g1',
  name: 'Antybiotyk',
  notes: '',
  compendiumId: 'gear.antybiotyk',
  qty: 3,
  consumable: 'pharma.antybiotyk',
};
const eye: CpredCyberwareRow = { id: 'c1', name: 'Cyberoko', notes: '', type: 'cyberoptics' };

function sheet(): CpredCharacterData {
  return {
    ...createDefaultCharacterData(),
    weapons: [gun],
    armor: [vest],
    gear: [doses],
    cyberware: [eye],
  };
}

describe('cpredPlayerItemPatchProblem — gracz niczego nie dokłada', () => {
  it('przepuszcza uwagi, wyrzucenie, zużycie i zakładanie pancerza', () => {
    const current = sheet();
    expect(cpredPlayerItemPatchProblem(current, { weapons: [{ ...gun, notes: 'Bulwa' }] })).toBe(
      null,
    );
    expect(cpredPlayerItemPatchProblem(current, { weapons: [] })).toBe(null);
    expect(cpredPlayerItemPatchProblem(current, { gear: [{ ...doses, qty: 2 }] })).toBe(null);
    expect(cpredPlayerItemPatchProblem(current, { gear: [] })).toBe(null);
    expect(
      cpredPlayerItemPatchProblem(current, {
        armor: [{ ...vest, equipped: false, location: 'head', spCurrent: 8, notes: 'dziura' }],
      }),
    ).toBe(null);
    expect(
      cpredPlayerItemPatchProblem(current, {
        cyberware: [{ ...eye, bodySlot: 'eyeLeft', notes: 'lewe' }],
      }),
    ).toBe(null);
  });

  it('magazynek zostaje przy umowie z 46c (AMMO_LOCKED), nie tutaj', () => {
    expect(cpredPlayerItemPatchProblem(sheet(), { weapons: [{ ...gun, ammoCurrent: 12 }] })).toBe(
      null,
    );
  });

  it('odmawia nowego wiersza na każdej liście', () => {
    const current = sheet();
    expect(cpredPlayerItemPatchProblem(current, { weapons: [gun, { ...gun, id: 'w2' }] })).toBe(
      'ITEM_LOCKED',
    );
    expect(cpredPlayerItemPatchProblem(current, { armor: [vest, { ...vest, id: 'a2' }] })).toBe(
      'ITEM_LOCKED',
    );
    expect(
      cpredPlayerItemPatchProblem(current, {
        gear: [doses, { id: 'g2', name: 'Notatnik', notes: '', qty: 1 }],
      }),
    ).toBe('ITEM_LOCKED');
    expect(cpredPlayerItemPatchProblem(current, { cyberware: [eye, { ...eye, id: 'c2' }] })).toBe(
      'ITEM_LOCKED',
    );
  });

  it('odmawia zmiany nazwy i liczb broni', () => {
    const current = sheet();
    for (const change of [
      { name: 'Ares' },
      { damage: '9k6' },
      { rof: '5' },
      { ammoMax: 50 },
      { compendiumId: 'weapon.karabin' },
      { attachmentIds: ['attachment.bayonet'] },
    ] satisfies Partial<CpredWeaponRow>[]) {
      expect(cpredPlayerItemPatchProblem(current, { weapons: [{ ...gun, ...change }] })).toBe(
        'ITEM_LOCKED',
      );
    }
  });

  it('pancerz: OB, kara, naprawa i Ulepszanie — tylko MG', () => {
    const current = sheet();
    for (const change of [
      { sp: 12 },
      { penalty: -1 },
      { spCurrent: 11 },
      { name: 'Kevlar' },
      { upgrade: 'armorSp' },
    ] satisfies Partial<CpredArmorRow>[]) {
      expect(cpredPlayerItemPatchProblem(current, { armor: [{ ...vest, ...change }] })).toBe(
        'ITEM_LOCKED',
      );
    }
  });

  it('wyposażenie: ilość tylko maleje, nazwa i środek bez zmian', () => {
    const current = sheet();
    for (const change of [
      { qty: 4 },
      { name: 'Speedheal' },
      { consumable: 'pharma.speedheal' },
      { key: 'k-123456' },
    ] satisfies Partial<CpredGearRow>[]) {
      expect(cpredPlayerItemPatchProblem(current, { gear: [{ ...doses, ...change }] })).toBe(
        'ITEM_LOCKED',
      );
    }
  });

  it('cyborgizacji gracz łatą ani nie dokłada, ani nie wyjmuje', () => {
    const current = sheet();
    expect(cpredPlayerItemPatchProblem(current, { cyberware: [] })).toBe('ITEM_LOCKED');
    expect(cpredPlayerItemPatchProblem(current, { cyberware: [{ ...eye, humanityLoss: 0 }] })).toBe(
      'ITEM_LOCKED',
    );
  });

  it('łata bez list przedmiotów nikogo nie obchodzi', () => {
    expect(cpredPlayerItemPatchProblem(sheet(), {})).toBe(null);
  });
});

describe('dodatek do broni jako towar (etap 48c)', () => {
  const bayonet: CompendiumEntry = {
    id: 'attachment.bayonet',
    name: 'Bagnet',
    category: 'attachment',
    cost: 100,
    fit: { skillIds: ['shoulder-arms'] },
  };

  it('kupiony dodatek ląduje w Wyposażeniu', () => {
    expect(purchasedSheetRow(bayonet, null, 'r1')).toEqual({
      list: 'gear',
      row: { id: 'r1', name: 'Bagnet', compendiumId: 'attachment.bayonet', notes: '', qty: 1 },
    });
  });

  it('montaż zdejmuje jedną sztukę z Wyposażenia, bez niej — null', () => {
    const data: CpredCharacterData = {
      ...createDefaultCharacterData(),
      gear: [{ id: 'g1', name: 'Bagnet', notes: '', compendiumId: 'attachment.bayonet', qty: 2 }],
    };
    const once = cpredTakeAttachmentFromGear(data, 'attachment.bayonet');
    expect(once?.gear).toEqual([{ ...data.gear[0], qty: 1 }]);
    const twice = cpredTakeAttachmentFromGear(once!, 'attachment.bayonet');
    expect(twice?.gear).toEqual([]);
    expect(cpredTakeAttachmentFromGear(twice!, 'attachment.bayonet')).toBe(null);
  });

  it('pudełko amunicji nie jest dodatkiem, choć nosi id wpisu', () => {
    const data: CpredCharacterData = {
      ...createDefaultCharacterData(),
      gear: [
        {
          id: 'g1',
          name: 'Dziwne',
          notes: '',
          compendiumId: 'attachment.bayonet',
          qty: 1,
          ammo: { ammoId: null, calibre: 'C. Pistolet', pattern: 'bullet' },
        },
      ],
    };
    expect(cpredTakeAttachmentFromGear(data, 'attachment.bayonet')).toBe(null);
  });

  it('zdjęty dodatek wraca do Wyposażenia i skleja się z takim samym', () => {
    const data: CpredCharacterData = {
      ...createDefaultCharacterData(),
      gear: [{ id: 'g1', name: 'Bagnet', notes: '', compendiumId: 'attachment.bayonet', qty: 1 }],
    };
    const back = cpredReturnAttachmentToGear(
      data,
      { id: 'attachment.bayonet', name: 'Bagnet' },
      () => 'nowy',
    );
    expect(back?.gear).toEqual([{ ...data.gear[0], qty: 2 }]);
  });

  it('pełne Wyposażenie — dodatek nie ma gdzie wrócić', () => {
    const data: CpredCharacterData = {
      ...createDefaultCharacterData(),
      gear: Array.from({ length: ITEM_ROWS_MAX }, (_, index) => ({
        id: `g${index}`,
        name: `Rzecz ${index}`,
        notes: '',
        qty: 1,
      })),
    };
    expect(
      cpredReturnAttachmentToGear(data, { id: 'attachment.bayonet', name: 'Bagnet' }, () => 'x'),
    ).toBe(null);
  });
});
