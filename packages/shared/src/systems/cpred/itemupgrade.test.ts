import { describe, expect, it } from 'vitest';
import {
  attachmentMountProblem,
  attachmentSlotsFree,
  type CpredAttachmentProfile,
} from './attachments.js';
import {
  buildCpredRegistry,
  createDefaultCharacterData,
  parseCharacterData,
  type CpredArmorRow,
  type CpredCyberwareRow,
  type CpredGearRow,
  type CpredWeaponRow,
} from './character.js';
import type { CompendiumEntry, CyberwareEntry, ResolvedWeapon } from './compendium.js';
import { cpredPlugDeck, cpredUnplugDeck } from './cyberdeck.js';
import {
  cpredApplyItemUpgrade,
  cpredHumanityUpgradeFits,
  cpredItemUpgradeProblem,
  cpredUpgradedHumanityLoss,
  cpredUpgradedWeapon,
  cpredUpgradesForTarget,
  cpredWeaponIsExotic,
} from './itemupgrade.js';
import { cpredFieldRepairEnded, cpredFieldRepairExpired } from './repair.js';

const registry = buildCpredRegistry({ skills: [] }, { roles: [] });

/**
 * Etap 71d1 — skutki Ulepszania Technika na wierszach karty (G14 gniazda,
 * G15 jakość Doskonała, G16 UC wszczepu; TEC-12, TEC-13, TEC-14, TEC-16,
 * TEC-17) i Prowizorka, która puszcza sama (G12, TEC-05).
 */

const pistol: ResolvedWeapon = {
  damage: '2k6',
  magazine: 12,
  rof: 2,
  hands: 1,
  concealable: true,
  attachmentSlots: 3,
  skillId: 'handgun',
  melee: false,
};

const rifle: ResolvedWeapon = { ...pistol, hands: 2, concealable: false, damage: '5k6' };
const flamethrower: ResolvedWeapon = { ...rifle, attachmentSlots: 0 };
const knife: ResolvedWeapon = { ...pistol, melee: true, attachmentSlots: 0, concealable: false };
const grenade: ResolvedWeapon = { ...pistol, thrown: true, attachmentSlots: 0 };

const weaponRow = (extra: Partial<CpredWeaponRow> = {}): CpredWeaponRow => ({
  id: 'w1',
  name: 'Ronin',
  notes: '',
  damage: '5k6',
  rof: '1',
  ammoCurrent: 25,
  ammoMax: 25,
  ammoType: '',
  ...extra,
});

const deckEntry = {
  id: 'gear.deck',
  name: 'Cyberdek',
  category: 'gear',
  cost: 500,
  deckSlots: 7,
} as unknown as CompendiumEntry;

const chromeEntry = (extra: Partial<CyberwareEntry> = {}): CyberwareEntry =>
  ({
    id: 'cyberware.arm',
    name: 'Cyberręka',
    category: 'cyberware',
    cost: 500,
    type: 'cyberlimb',
    humanityLoss: '2k6',
    ...extra,
  }) as CyberwareEntry;

describe('co czym wolno ulepszyć', () => {
  it('gniazdo — broń dystansowa z gniazdami, dek, wszczep bazowy', () => {
    expect(
      cpredItemUpgradeProblem('slot', { kind: 'weapon', row: weaponRow(), resolved: rifle }),
    ).toBeNull();
    expect(
      cpredItemUpgradeProblem('slot', { kind: 'weapon', row: weaponRow(), resolved: knife }),
    ).toBe('UPGRADE_NOT_FOR_ITEM');
    const deck: CpredGearRow = {
      id: 'g1',
      name: 'Dek',
      notes: '',
      qty: 1,
      compendiumId: 'gear.deck',
    };
    expect(
      cpredItemUpgradeProblem('slot', { kind: 'gear', row: deck, entry: deckEntry }),
    ).toBeNull();
    const arm = {
      id: 'c1',
      name: 'Cyberręka',
      notes: '',
      foundation: true,
      slots: 4,
    } as CpredCyberwareRow;
    expect(cpredItemUpgradeProblem('slot', { kind: 'cyberware', row: arm })).toBeNull();
    expect(
      cpredItemUpgradeProblem('slot', {
        kind: 'cyberware',
        row: { ...arm, foundation: undefined },
      }),
    ).toBe('UPGRADE_NOT_FOR_ITEM');
  });

  it('jakość Doskonała tylko ze Zwykłej — niska nie przeskakuje dwóch szczebli', () => {
    expect(
      cpredItemUpgradeProblem('excellent', { kind: 'weapon', row: weaponRow(), resolved: rifle }),
    ).toBeNull();
    expect(
      cpredItemUpgradeProblem('excellent', {
        kind: 'weapon',
        row: weaponRow(),
        resolved: { ...rifle, quality: 'poor' },
      }),
    ).toBe('UPGRADE_NOT_FOR_ITEM');
    expect(
      cpredItemUpgradeProblem('excellent', {
        kind: 'weapon',
        row: weaponRow(),
        resolved: { ...rifle, quality: 'excellent' },
      }),
    ).toBe('UPGRADE_NOT_FOR_ITEM');
  });

  it('broń egzotyczna to dystansowa bez gniazd, nie granat ani nóż', () => {
    expect(cpredWeaponIsExotic(flamethrower)).toBe(true);
    expect(cpredWeaponIsExotic(rifle)).toBe(false);
    expect(cpredWeaponIsExotic(grenade)).toBe(false);
    expect(cpredWeaponIsExotic(knife)).toBe(false);
    expect(
      cpredUpgradesForTarget({ kind: 'weapon', row: weaponRow(), resolved: flamethrower }),
    ).toContain('exoticSlot');
    expect(
      cpredUpgradesForTarget({ kind: 'weapon', row: weaponRow(), resolved: rifle }),
    ).not.toContain('exoticSlot');
  });

  it('przedmiot ulepsza się tylko raz (s. 148)', () => {
    expect(
      cpredItemUpgradeProblem('excellent', {
        kind: 'weapon',
        row: weaponRow({ upgrade: 'slot' }),
        resolved: rifle,
      }),
    ).toBe('ALREADY_UPGRADED');
    expect(
      cpredUpgradesForTarget({
        kind: 'weapon',
        row: weaponRow({ upgrade: 'slot' }),
        resolved: rifle,
      }),
    ).toEqual([]);
    expect(
      cpredItemUpgradeProblem('bogus', { kind: 'weapon', row: weaponRow(), resolved: rifle }),
    ).toBe('UNKNOWN_UPGRADE');
  });

  it('pojazdu nie ulepsza się wierszem karty — to montaż w aucie (71c2)', () => {
    expect(
      cpredUpgradesForTarget({ kind: 'weapon', row: weaponRow(), resolved: rifle }),
    ).not.toContain('vehicleMod');
  });
});

describe('broń po Ulepszaniu', () => {
  it('czwarte gniazdo — i czwarty dodatek wchodzi', () => {
    const upgraded = cpredUpgradedWeapon(rifle, 'slot');
    expect(upgraded.attachmentSlots).toBe(4);
    const one = (id: string): CpredAttachmentProfile => ({ id, name: id, fit: {} });
    const fitted = [one('a'), one('b'), one('c')];
    expect(attachmentSlotsFree(rifle, fitted)).toBe(0);
    expect(attachmentSlotsFree(upgraded, fitted)).toBe(1);
    expect(attachmentMountProblem(one('d'), rifle, fitted)).toBe('ATTACHMENT_NO_SLOTS');
    expect(attachmentMountProblem(one('d'), upgraded, fitted)).toBeNull();
  });

  it('broń egzotyczna dostaje jedno gniazdo, zwykła — nic z tego stempla', () => {
    expect(cpredUpgradedWeapon(flamethrower, 'exoticSlot').attachmentSlots).toBe(1);
    expect(cpredUpgradedWeapon(rifle, 'exoticSlot')).toBe(rifle);
  });

  it('jakość Doskonała — tę samą, z której planer daje +1 (attacks.test.ts)', () => {
    expect(cpredUpgradedWeapon(rifle, 'excellent').quality).toBe('excellent');
    expect(cpredUpgradedWeapon({ ...rifle, quality: 'poor' }, 'excellent').quality).toBe('poor');
  });

  it('broń do ukrycia — tylko jednoręczna', () => {
    expect(cpredUpgradedWeapon({ ...pistol, concealable: false }, 'concealable').concealable).toBe(
      true,
    );
    expect(cpredUpgradedWeapon(rifle, 'concealable').concealable).toBe(false);
  });
});

describe('dek i wszczep po Ulepszaniu', () => {
  it('dek z gniazdem z Ulepszania podpina się z jednym więcej i odpina ze stemplem', () => {
    const deck: CpredGearRow = {
      id: 'g1',
      name: 'Dek',
      notes: '',
      qty: 1,
      compendiumId: 'gear.deck',
      upgrade: 'slot',
    };
    const data = { ...createDefaultCharacterData(), gear: [deck] };
    const lookup = (id: string) => (id === 'gear.deck' ? deckEntry : undefined);
    let n = 0;
    const plugged = cpredPlugDeck(data, 'g1', lookup, () => `id${(n += 1)}`);
    expect(plugged.ok).toBe(true);
    if (!plugged.ok) return;
    expect(plugged.data.cyberdeck?.slots).toBe(8);
    // Stempel przeżywa zapis karty i odpięcie — drugi raz nie ulepszysz.
    const reread = parseCharacterData(JSON.stringify(plugged.data), registry);
    expect(reread.cyberdeck?.upgrade).toBe('slot');
    const unplugged = cpredUnplugDeck(reread, () => `id${(n += 1)}`);
    expect(unplugged.ok && unplugged.data.gear.find((row) => row.name === 'Dek')?.upgrade).toBe(
      'slot',
    );
  });

  it('wszczep bazowy dostaje gniazdo opcji raz, przy stemplu', () => {
    const arm = {
      id: 'c1',
      name: 'Cyberręka',
      notes: '',
      foundation: true,
      slots: 4,
    } as CpredCyberwareRow;
    expect(cpredApplyItemUpgrade(arm, 'slot')).toMatchObject({ slots: 5, upgrade: 'slot' });
  });

  it('+1 OB zostaje tym, czym był od 48c', () => {
    const vest = {
      id: 'a',
      name: 'Kurtka',
      notes: '',
      sp: 11,
      spCurrent: 9,
      location: 'body',
    } as CpredArmorRow;
    expect(cpredApplyItemUpgrade(vest, 'armorSp')).toMatchObject({ sp: 12, spCurrent: 10 });
  });

  it('UC niższa o 1k6 tylko od 2k6 i nie przy borgizacji', () => {
    expect(cpredHumanityUpgradeFits(chromeEntry())).toBe(true);
    expect(cpredHumanityUpgradeFits(chromeEntry({ humanityLoss: '1k6' }))).toBe(false);
    expect(cpredHumanityUpgradeFits(chromeEntry({ type: 'borgware', humanityLoss: '4k6' }))).toBe(
      false,
    );
    expect(cpredUpgradedHumanityLoss(chromeEntry({ humanityLoss: '4k6' }), 'humanity')).toEqual({
      notation: '3k6',
      reduced: true,
    });
    expect(cpredUpgradedHumanityLoss(chromeEntry(), undefined)).toEqual({
      notation: '2k6',
      reduced: false,
    });
  });

  it('„Łagodniejsza cyborgizacja” idzie na wszczep w plecaku, nie w ciele', () => {
    const found: CpredGearRow = {
      id: 'g',
      name: 'Cyberręka',
      notes: '',
      qty: 1,
      compendiumId: 'cyberware.arm',
    };
    expect(
      cpredItemUpgradeProblem('humanity', { kind: 'gear', row: found, entry: chromeEntry() }),
    ).toBeNull();
    const installed = { id: 'c', name: 'Cyberręka', notes: '' } as CpredCyberwareRow;
    expect(cpredItemUpgradeProblem('humanity', { kind: 'cyberware', row: installed })).toBe(
      'UPGRADE_NOT_FOR_ITEM',
    );
  });
});

describe('Prowizorka puszcza sama (G12)', () => {
  const patched = (
    extra: Partial<NonNullable<CpredArmorRow['fieldRepair']>> = {},
  ): CpredArmorRow => ({
    id: 'a',
    name: 'Kurtka',
    notes: '',
    sp: 11,
    spCurrent: 11,
    location: 'body',
    fieldRepair: { restoredFrom: 5, minutes: 20, expiresAtMinute: 1000, ...extra },
  });

  it('wygasa alternatywą: minutą świata albo rundą walki', () => {
    expect(cpredFieldRepairExpired(patched(), { round: null, minutes: 999 })).toBe(false);
    expect(cpredFieldRepairExpired(patched(), { round: null, minutes: 1000 })).toBe(true);
    expect(
      cpredFieldRepairExpired(patched({ expiresAtRound: 400 }), { round: 400, minutes: 10 }),
    ).toBe(true);
  });

  it('łata sprzed 71d1 (bez terminów) czeka na guzik', () => {
    const old = patched({ expiresAtMinute: undefined });
    expect(cpredFieldRepairExpired(old, { round: 9999, minutes: 99999 })).toBe(false);
  });

  it('koniec łaty: OB sprzed niej, a gdy pod łatą oberwała niżej — niższe; ślad zostaje', () => {
    expect(cpredFieldRepairEnded(patched())).toMatchObject({
      spCurrent: 5,
      fieldRepairSpent: true,
    });
    expect(cpredFieldRepairEnded({ ...patched(), spCurrent: 3 })).toMatchObject({ spCurrent: 3 });
    expect(cpredFieldRepairEnded(patched()).fieldRepair).toBeUndefined();
  });

  it('terminy łaty przeżywają zapis karty', () => {
    const data = { ...createDefaultCharacterData(), armor: [patched({ expiresAtRound: 12 })] };
    expect(parseCharacterData(JSON.stringify(data), registry).armor[0]?.fieldRepair).toEqual({
      restoredFrom: 5,
      minutes: 20,
      expiresAtMinute: 1000,
      expiresAtRound: 12,
    });
  });
});
