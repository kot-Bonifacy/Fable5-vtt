import { describe, expect, it } from 'vitest';
import { buildCompendium, validateCompendiumEntry } from './compendium.js';
import type { CompendiumEntry } from './compendium.js';
import {
  cpredAmmoIcon,
  cpredArmorIcon,
  cpredAttachmentIcon,
  cpredEntryIcon,
  cpredItemRowIcon,
  cpredSortWeapons,
  parseWeaponIcons,
  withWeaponIcons,
} from './itemicons.js';
import type { CpredWeaponRow } from './character.js';
import { cpredItemView } from './inventory.js';

/**
 * Miniatury na listach (24.09.2026): rodzaj przedmiotu czyta się z pól, które
 * maszyna rozumie — typu broni, kształtu naboju, efektu dodatku, miejsca
 * pancerza — nigdy z nazwy.
 */

const registry = buildCompendium([
  {
    weaponTypes: [
      {
        id: 'weapon-type.heavy-pistol',
        name: 'Ciężki pistolet',
        skillId: 'handgun',
        damage: '3k6',
        magazine: 8,
        rof: 2,
        hands: 1,
        concealable: true,
        melee: false,
      },
      {
        id: 'weapon-type.light-melee',
        name: 'Lekka broń biała',
        skillId: 'melee-weapon',
        damage: '1k6',
        magazine: null,
        rof: 2,
        hands: 1,
        concealable: true,
        melee: true,
      },
    ],
    entries: [
      {
        id: 'weapon.bebenek',
        category: 'weapon',
        name: 'Bębenek',
        cost: 100,
        weaponTypeId: 'weapon-type.heavy-pistol',
      },
      {
        id: 'weapon.kanciak',
        category: 'weapon',
        name: 'Kanciak',
        cost: 100,
        weaponTypeId: 'weapon-type.heavy-pistol',
      },
      {
        id: 'weapon.majcher',
        category: 'weapon',
        name: 'Majcher',
        cost: 50,
        weaponTypeId: 'weapon-type.light-melee',
      },
      { id: 'gear.lina', category: 'gear', name: 'Lina', cost: 20 },
    ],
  },
]);

function entry(id: string): CompendiumEntry {
  return registry.entryById.get(id)!;
}

describe('cpredEntryIcon', () => {
  it('broń rysuje sylwetkę swojego typu', () => {
    expect(cpredEntryIcon(entry('weapon.kanciak'), registry)).toBe('pistol-heavy');
    expect(cpredEntryIcon(entry('weapon.majcher'), registry)).toBe('knife');
  });

  it('zwykły sprzęt nie ma miniatury', () => {
    expect(cpredEntryIcon(entry('gear.lina'), registry)).toBeNull();
  });
});

describe('weapon-icons.json', () => {
  it('rewolwer przychodzi z pliku i wygrywa z typem', () => {
    const withIcons = withWeaponIcons(registry, { 'weapon.bebenek': 'revolver' });
    expect(cpredEntryIcon(withIcons.entryById.get('weapon.bebenek')!, withIcons)).toBe('revolver');
    expect(cpredEntryIcon(withIcons.entryById.get('weapon.kanciak')!, withIcons)).toBe(
      'pistol-heavy',
    );
  });

  it('nie dokleja miniatury broni do wpisu, który bronią nie jest', () => {
    const withIcons = withWeaponIcons(registry, { 'gear.lina': 'revolver' });
    expect(withIcons.entryById.get('gear.lina')).not.toHaveProperty('icon');
  });

  it('odrzuca nieznaną miniaturę i mówi o tym', () => {
    const parsed = parseWeaponIcons({ icons: { 'weapon.a': 'revolver', 'weapon.b': 'armata' } });
    expect(parsed.icons).toEqual({ 'weapon.a': 'revolver' });
    expect(parsed.issues).toHaveLength(1);
  });

  it('wpis MG niesie własną miniaturę przez walidację', () => {
    const ok = validateCompendiumEntry({
      id: 'weapon.custom-rewolwer',
      category: 'weapon',
      name: 'Stary rewolwer',
      cost: 50,
      weaponTypeId: 'weapon-type.heavy-pistol',
      icon: 'revolver',
    });
    expect(ok.ok && ok.entry.category === 'weapon' && ok.entry.icon).toBe('revolver');
    const bad = validateCompendiumEntry({
      id: 'weapon.custom-x',
      category: 'weapon',
      name: 'X',
      cost: 50,
      weaponTypeId: 'weapon-type.heavy-pistol',
      icon: 'first-aid',
    });
    expect(bad.ok).toBe(false);
  });
});

describe('cpredAmmoIcon', () => {
  it('jeden kształt — jego sylwetka', () => {
    expect(cpredAmmoIcon(['shell'])).toBe('shells');
    expect(cpredAmmoIcon(['grenade'])).toBe('grenade');
  });

  it('kilka kształtów — skrzynka, a nie pierwszy z brzegu', () => {
    expect(cpredAmmoIcon(['bullet', 'arrow', 'grenade', 'rocket'])).toBe('ammo-box');
  });
});

describe('cpredAttachmentIcon', () => {
  it('doczepiona broń rysuje się swoją sylwetką, ostrze — bagnetem', () => {
    expect(cpredAttachmentIcon({ secondary: { weaponTypeId: 'weapon-type.shotgun' } })).toBe(
      'shotgun',
    );
    expect(
      cpredAttachmentIcon({ secondary: { weaponTypeId: 'weapon-type.grenade-launcher' } }),
    ).toBe('launcher');
    expect(cpredAttachmentIcon({ secondary: { weaponTypeId: 'weapon-type.light-melee' } })).toBe(
      'bayonet',
    );
  });

  it('reszta po tym, co robi', () => {
    expect(cpredAttachmentIcon({ magazine: 'drum' })).toBe('ammo');
    expect(cpredAttachmentIcon({ ignoresObscurement: true })).toBe('night-vision');
    expect(cpredAttachmentIcon({ attackBonus: 1, requiresCyberware: ['Złącza'] })).toBe(
      'smartlink',
    );
    expect(
      cpredAttachmentIcon({ rangedBonus: { bonus: 1, minMetres: 51, singleOnly: true } }),
    ).toBe('scope');
    expect(cpredAttachmentIcon({})).toBe('attachment');
  });
});

describe('cpredArmorIcon', () => {
  it('tarcza ma swoją sylwetkę, reszta — kamizelkę', () => {
    expect(cpredArmorIcon(['shield'])).toBe('shield');
    expect(cpredArmorIcon(['head', 'body'])).toBe('armor');
    expect(cpredArmorIcon('shield')).toBe('shield');
    expect(cpredArmorIcon(undefined)).toBe('armor');
  });
});

describe('cpredItemRowIcon', () => {
  const lookup = (id: string) => registry.entryById.get(id);

  it('wiersz z wpisem idzie za wpisem — także w widoku wymiany', () => {
    const row: CpredWeaponRow = {
      id: 'w1',
      name: 'Mój gnat',
      notes: '',
      compendiumId: 'weapon.kanciak',
      damage: '3k6',
      ammoCurrent: 8,
      ammoMax: 8,
      ammoType: '',
      rof: '2',
    };
    const view = cpredItemView('weapons', row);
    expect(cpredItemRowIcon('weapons', view, lookup, registry)).toBe('pistol-heavy');
  });

  it('broń bez wpisu — jak na pasku broni; pancerz — z miejsca; sprzęt — nic', () => {
    expect(cpredItemRowIcon('weapons', {}, lookup, registry)).toBe('pistol');
    expect(cpredItemRowIcon('armor', { armorLocation: 'shield' }, lookup, registry)).toBe('shield');
    expect(cpredItemRowIcon('gear', { compendiumId: 'gear.lina' }, lookup, registry)).toBeNull();
  });
});

describe('cpredSortWeapons', () => {
  it('pistolety przed bronią białą, w typie po nazwie', () => {
    const sorted = cpredSortWeapons([
      { name: 'Majcher', weaponTypeId: 'weapon-type.light-melee' },
      { name: 'Zardzewiak', weaponTypeId: 'weapon-type.medium-pistol' },
      { name: 'Bez typu', weaponTypeId: null },
      { name: 'Kanciak', weaponTypeId: 'weapon-type.heavy-pistol' },
      { name: 'Autko', weaponTypeId: 'weapon-type.medium-pistol' },
      { name: 'Próbka', weaponTypeId: 'weapon-type.sample-pistol' },
    ]);
    expect(sorted.map((weapon) => weapon.name)).toEqual([
      'Autko',
      'Zardzewiak',
      'Kanciak',
      'Majcher',
      'Próbka',
      'Bez typu',
    ]);
  });
});
