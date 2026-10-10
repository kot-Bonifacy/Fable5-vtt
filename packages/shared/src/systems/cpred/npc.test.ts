import { describe, expect, it } from 'vitest';
import {
  CPRED_NPC_WEAPONS_MAX,
  cpredNpcSheet,
  createDefaultNpcInput,
  sanitizeNpcInput,
} from './npc.js';
import { CPRED_STATBLOCK_HP_MAX, cpredSheetHpMax } from './statblock.js';
import type { CompendiumEntry, WeaponTypeDefinition } from './compendium.js';

const pistolType = {
  id: 'weapon-type.pistolet',
  name: 'Średni pistolet',
  skillId: 'handgun',
  damage: '2k6',
  magazine: 12,
  rof: 2,
  hands: 1 as const,
  concealable: true,
  melee: false,
  ammunition: 'Ś. Pistolet',
  ammoPatterns: ['bullet' as const],
} as unknown as WeaponTypeDefinition;

const entries = [
  {
    id: 'weapon.pistolet',
    name: 'Pistolet',
    category: 'weapon',
    cost: 50,
    weaponTypeId: pistolType.id,
    quality: 'standard',
  },
  { id: 'armor.kevlar', name: 'Kevlar', category: 'armor', cost: 50, sp: 7, locations: ['body'] },
  { id: 'armor.kask', name: 'Kask', category: 'armor', cost: 50, sp: 11, locations: ['body'] },
  {
    id: 'armor.tarcza',
    name: 'Tarcza',
    category: 'armor',
    cost: 100,
    sp: 10,
    locations: ['shield'],
  },
  { id: 'gear.agent', name: 'Agent', category: 'gear', cost: 100 },
] as unknown as CompendiumEntry[];

const compendium = {
  entryById: new Map(entries.map((entry) => [entry.id, entry])),
  weaponTypeById: new Map([[pistolType.id, pistolType]]),
};

function rowIds(): () => string {
  let next = 0;
  return () => `row-${++next}`;
}

describe('sanitizeNpcInput', () => {
  it('fixes whatever came in and never refuses', () => {
    const input = sanitizeNpcInput({
      roleId: 'solo',
      stats: { ref: 99, dex: -3, body: 'x' },
      hpMax: 9999,
      skills: { handgun: 6, evasion: 0, 'not a skill!': 4, brawling: 15 },
      weaponIds: ['weapon.a', 'weapon.b', 'weapon.c', 'weapon.d', 'weapon.e', 7],
      armorHeadId: 12,
    });
    expect(input.stats.ref).toBe(10);
    expect(input.stats.dex).toBe(1);
    expect(input.stats.body).toBe(5);
    expect(input.hpMax).toBe(CPRED_STATBLOCK_HP_MAX);
    // Poziom 0 wypada — statblok wymienia to, co figura umie.
    expect(input.skills).toEqual({ handgun: 6, brawling: 10 });
    expect(input.weaponIds).toHaveLength(CPRED_NPC_WEAPONS_MAX);
    expect(input.armorHeadId).toBeNull();
    expect(input.roleId).toBe('solo');
  });

  it('drops a skill or a Role the registry does not know', () => {
    const input = sanitizeNpcInput(
      { roleId: 'pirate', skills: { handgun: 4, juggling: 3 } },
      { skillIds: new Set(['handgun']), roleIds: new Set(['solo']) },
    );
    expect(input.roleId).toBeNull();
    expect(input.skills).toEqual({ handgun: 4 });
  });

  it('gives an ordinary human for garbage', () => {
    expect(sanitizeNpcInput('nope')).toEqual(createDefaultNpcInput());
  });
});

describe('cpredNpcSheet', () => {
  it('builds a plain sheet: stats, skills, compendium weapon and armor where the GM put it', () => {
    const input = {
      ...createDefaultNpcInput(),
      roleId: 'solo',
      stats: { ...createDefaultNpcInput().stats, body: 7, will: 4, luck: 3 },
      skills: { handgun: 6, evasion: 4 },
      weaponIds: ['weapon.pistolet', 'gear.agent', 'weapon.missing'],
      armorHeadId: 'armor.kask',
      armorBodyId: 'armor.kevlar',
    };
    const sheet = cpredNpcSheet(input, compendium, rowIds());

    expect(sheet.roleId).toBe('solo');
    expect(sheet.stats.body).toBe(7);
    expect(sheet.skills).toEqual({ handgun: 6, evasion: 4 });
    // Broń jak z zakupu: liczby z typu, magazynek pełny, wpis podpięty.
    expect(sheet.weapons).toEqual([
      expect.objectContaining({
        name: 'Pistolet',
        compendiumId: 'weapon.pistolet',
        damage: '2k6',
        ammoCurrent: 12,
        ammoMax: 12,
      }),
    ]);
    // Kask leży na głowie, choć wpis mówi „tułów” — miejsce wskazał MG.
    expect(sheet.armor.map((row) => [row.name, row.location, row.sp])).toEqual([
      ['Kask', 'head', 11],
      ['Kevlar', 'body', 7],
    ]);
    expect(sheet.statBlock).toBeNull();
    expect(sheet.hpCurrent).toBe(10 + 5 * Math.ceil((7 + 4) / 2));
    expect(sheet.luckCurrent).toBe(3);
  });

  it('keeps printed HP in the stat block and starts at full', () => {
    const sheet = cpredNpcSheet({ ...createDefaultNpcInput(), hpMax: 35 }, compendium, rowIds());
    expect(sheet.statBlock?.hpMax).toBe(35);
    expect(cpredSheetHpMax(sheet)).toBe(35);
    expect(sheet.hpCurrent).toBe(35);
  });
});

describe('etap 49b — tarcza i Ranga Roli', () => {
  it('sanitizes the shield and the rank', () => {
    const input = sanitizeNpcInput({ armorShieldId: 'armor.tarcza', roleRank: 42 });
    expect(input.armorShieldId).toBe('armor.tarcza');
    expect(input.roleRank).toBe(10);
    expect(sanitizeNpcInput({ roleRank: 'x' }).roleRank).toBeNull();
  });

  it('puts a shield in the hand and only a shield; the rank needs a Role', () => {
    const sheet = cpredNpcSheet(
      { ...createDefaultNpcInput(), roleId: 'solo', roleRank: 4, armorShieldId: 'armor.tarcza' },
      compendium,
      rowIds(),
    );
    expect(sheet.armor.map((row) => [row.name, row.location, row.sp])).toEqual([
      ['Tarcza', 'shield', 10],
    ]);
    expect(sheet.roleAbilityRank).toBe(4);

    const wrong = cpredNpcSheet(
      { ...createDefaultNpcInput(), roleRank: 4, armorShieldId: 'armor.kevlar' },
      compendium,
      rowIds(),
    );
    expect(wrong.armor).toEqual([]);
    expect(wrong.roleAbilityRank).toBe(createDefaultNpcInput().roleRank ?? 1);
  });
});
