import { describe, expect, it } from 'vitest';
import { CPRED_HEAD_DAMAGE_MULTIPLIER, CPRED_HEAD_DAMAGE_MULTIPLIER_MAX } from './locations.js';
import {
  CPRED_CRITICAL_INJURY_BONUS_DAMAGE,
  applyWoundStatuses,
  drawCriticalInjury,
  effectiveArmor,
  effectiveArmorSp,
  resolveCpredDamage,
  toCriticalInjuryRow,
  woundStatusIds,
  woundTransitionLabel,
} from './damage.js';
import type { CpredArmorRow, CpredCharacterData } from './character.js';
import {
  createDefaultCharacterData,
  injuryDeathSavePenalty,
  mergeCharacterData,
  normalizeCharacterData,
} from './character.js';
import type { CriticalInjuryEntry } from './compendium.js';
import type { DiceRng } from '../../dice.js';

function armorRow(overrides: Partial<CpredArmorRow> = {}): CpredArmorRow {
  return {
    id: 'a1',
    name: 'Kurtka kuloodporna',
    notes: '',
    sp: 11,
    spCurrent: 11,
    location: 'body',
    ...overrides,
  };
}

/** Feeds the given values to the engine, one per call. */
function scriptedRng(values: number[]): DiceRng {
  let index = 0;
  return () => values[index++] ?? 1;
}

function injury(overrides: Partial<CriticalInjuryEntry> = {}): CriticalInjuryEntry {
  return {
    id: 'injury.zlamane-zebra',
    name: 'Złamane żebra',
    category: 'criticalInjury',
    table: 'body',
    roll: 5,
    cost: null,
    description: 'Bolesne.',
    ...overrides,
  };
}

describe('resolveCpredDamage — połowa pancerza (s. 176, 178)', () => {
  const base = { hpCurrent: 30, hpMax: 40, location: 'body' as const };

  it('liczy przykład z podręcznika: OB 11 zatrzymuje 6, cel traci 1 PW', () => {
    // s. 176: „Lekką kurtkę kuloodporną Rockera, choć nominalnie ma OB 11,
    // teraz traktuje się, jakby miała OB 6" — 7 obrażeń, 1 punkt przechodzi.
    const outcome = resolveCpredDamage({ ...base, damage: 7, armorSp: 11, halvesArmor: true });
    expect(outcome.armorSp).toBe(6);
    expect(outcome.armorHalved).toBe(true);
    expect(outcome.damageThrough).toBe(1);
    expect(outcome.hpAfter).toBe(29);
  });

  it('ściera cały pancerz, nie połowę — OB 11 spada do 10 w tym samym przykładzie', () => {
    const outcome = resolveCpredDamage({ ...base, damage: 7, armorSp: 11, halvesArmor: true });
    expect(outcome.spBefore).toBe(11);
    expect(outcome.spAfter).toBe(10);
    expect(outcome.ablated).toBe(true);
  });

  it('zaokrągla w górę połowę, która zostaje: OB 7 zatrzymuje 4', () => {
    const outcome = resolveCpredDamage({ ...base, damage: 10, armorSp: 7, halvesArmor: true });
    expect(outcome.armorSp).toBe(4);
    expect(outcome.damageThrough).toBe(6);
  });

  it('nie dzieli niczego, gdy celu nic nie chroni', () => {
    const outcome = resolveCpredDamage({ ...base, damage: 8, armorSp: 0, halvesArmor: true });
    expect(outcome.armorHalved).toBe(false);
    expect(outcome.damageThrough).toBe(8);
  });

  it('ustępuje obrażeniom ignorującym pancerz — tam nie ma czego połowić', () => {
    const outcome = resolveCpredDamage({
      ...base,
      damage: 8,
      armorSp: 11,
      halvesArmor: true,
      ignoreArmor: true,
    });
    expect(outcome.armorHalved).toBe(false);
    expect(outcome.armorSp).toBe(0);
    expect(outcome.damageThrough).toBe(8);
  });
});

describe('resolveCpredDamage — mnożnik trafień w głowę (s. 188)', () => {
  const head = { hpCurrent: 30, hpMax: 40, location: 'head' as const };

  it('mnoży ×2 domyślnie', () => {
    const outcome = resolveCpredDamage({ ...head, damage: 10, armorSp: 4 });
    expect(outcome.headMultiplier).toBe(2);
    expect(outcome.damageThrough).toBe(12);
  });

  it('mnoży ×3 pękniętą czaszką', () => {
    const outcome = resolveCpredDamage({ ...head, damage: 10, armorSp: 4, headMultiplier: 3 });
    expect(outcome.headMultiplier).toBe(3);
    expect(outcome.damageThrough).toBe(18);
  });

  it('nie schodzi poniżej ×2 ani powyżej sufitu — wiersz rany pisze MG', () => {
    expect(
      resolveCpredDamage({ ...head, damage: 10, armorSp: 4, headMultiplier: 1 }).headMultiplier,
    ).toBe(CPRED_HEAD_DAMAGE_MULTIPLIER);
    expect(
      resolveCpredDamage({ ...head, damage: 10, armorSp: 4, headMultiplier: 99 }).headMultiplier,
    ).toBe(CPRED_HEAD_DAMAGE_MULTIPLIER_MAX);
  });

  it('nie mnoży niczego, gdy pancerz zatrzymał cios', () => {
    const outcome = resolveCpredDamage({ ...head, damage: 3, armorSp: 11, headMultiplier: 3 });
    expect(outcome.doubled).toBe(false);
    expect(outcome.headMultiplier).toBe(1);
    expect(outcome.damageThrough).toBe(0);
  });

  it('składa się z połową pancerza: maczeta w głowę pękniętej czaszki', () => {
    // OB 11 → 6, 14 − 6 = 8, ×3 = 24.
    const outcome = resolveCpredDamage({
      ...head,
      damage: 14,
      armorSp: 11,
      halvesArmor: true,
      headMultiplier: 3,
    });
    expect(outcome.damageThrough).toBe(24);
  });
});

describe('resolveCpredDamage', () => {
  const base = { hpCurrent: 30, hpMax: 40, location: 'body' as const };

  it('subtracts armor SP and ablates it when damage gets through', () => {
    const outcome = resolveCpredDamage({ ...base, damage: 15, armorSp: 11 });
    expect(outcome.damageThrough).toBe(4);
    expect(outcome.hpAfter).toBe(26);
    expect(outcome.spBefore).toBe(11);
    expect(outcome.spAfter).toBe(10);
    expect(outcome.ablated).toBe(true);
  });

  it('stops everything when SP exceeds the damage — and the armor survives', () => {
    const outcome = resolveCpredDamage({ ...base, damage: 7, armorSp: 11 });
    expect(outcome.damageThrough).toBe(0);
    expect(outcome.hpAfter).toBe(30);
    expect(outcome.spAfter).toBe(11);
    expect(outcome.ablated).toBe(false);
  });

  it('treats exact equality as fully stopped', () => {
    const outcome = resolveCpredDamage({ ...base, damage: 11, armorSp: 11 });
    expect(outcome.damageThrough).toBe(0);
    expect(outcome.ablated).toBe(false);
    expect(outcome.hpAfter).toBe(30);
  });

  it('applies the full roll when the target is unarmored', () => {
    const outcome = resolveCpredDamage({ ...base, damage: 13, armorSp: 0 });
    expect(outcome.damageThrough).toBe(13);
    expect(outcome.hpAfter).toBe(17);
    expect(outcome.ablated).toBe(false);
    expect(outcome.spAfter).toBe(0);
  });

  it('doubles what got through on a head hit (after armor, not before)', () => {
    const outcome = resolveCpredDamage({ ...base, location: 'head', damage: 15, armorSp: 11 });
    expect(outcome.damageThrough).toBe(8);
    expect(outcome.doubled).toBe(true);
    expect(outcome.hpAfter).toBe(22);
    expect(outcome.spAfter).toBe(10);
  });

  it('does not double anything when head armor stopped the shot', () => {
    const outcome = resolveCpredDamage({ ...base, location: 'head', damage: 6, armorSp: 7 });
    expect(outcome.damageThrough).toBe(0);
    expect(outcome.doubled).toBe(false);
    expect(outcome.hpAfter).toBe(30);
  });

  it('adds the critical injury bonus straight to HP, past the armor', () => {
    const outcome = resolveCpredDamage({
      ...base,
      damage: 7,
      armorSp: 11,
      criticalInjury: true,
    });
    expect(outcome.damageThrough).toBe(0);
    expect(outcome.bonusDamage).toBe(CPRED_CRITICAL_INJURY_BONUS_DAMAGE);
    expect(outcome.hpAfter).toBe(25);
    // Bonus damage ignores armor, so it does not damage it either.
    expect(outcome.ablated).toBe(false);
    expect(outcome.spAfter).toBe(11);
  });

  it('ignores armor entirely when told to', () => {
    const outcome = resolveCpredDamage({ ...base, damage: 9, armorSp: 11, ignoreArmor: true });
    expect(outcome.damageThrough).toBe(9);
    expect(outcome.armorSp).toBe(0);
    expect(outcome.spAfter).toBe(11);
    expect(outcome.ablated).toBe(false);
  });

  it('floors HP at zero and reports the wound transition', () => {
    const outcome = resolveCpredDamage({
      hpCurrent: 6,
      hpMax: 40,
      location: 'body',
      damage: 30,
      armorSp: 0,
    });
    expect(outcome.hpAfter).toBe(0);
    expect(outcome.hpLost).toBe(6);
    expect(outcome.woundBefore).toBe('serious');
    expect(outcome.woundAfter).toBe('mortal');
    expect(woundTransitionLabel(outcome)).toBe('Poważnie ranny → Śmiertelnie ranny');
  });

  it('crosses the serious threshold at exactly half of max HP', () => {
    const outcome = resolveCpredDamage({
      hpCurrent: 21,
      hpMax: 40,
      location: 'body',
      damage: 1,
      armorSp: 0,
    });
    expect(outcome.woundBefore).toBe('light');
    expect(outcome.woundAfter).toBe('serious');
  });

  it('never lets ablation push SP below zero', () => {
    const outcome = resolveCpredDamage({ ...base, damage: 5, armorSp: 0 });
    expect(outcome.spAfter).toBe(0);
  });
});

describe('wound statuses', () => {
  it('maps HP onto the status registry ids', () => {
    expect(woundStatusIds(40, 40)).toEqual([]);
    expect(woundStatusIds(30, 40)).toEqual([]);
    expect(woundStatusIds(20, 40)).toEqual(['seriously-wounded']);
    expect(woundStatusIds(0, 40)).toEqual(['mortally-wounded']);
  });

  it('replaces stale wound statuses but keeps the GM’s own', () => {
    const statuses = applyWoundStatuses(['on-fire', 'seriously-wounded'], 0, 40);
    expect(statuses).toEqual(['on-fire', 'mortally-wounded']);
  });

  it('clears wound statuses once the character is healed', () => {
    expect(applyWoundStatuses(['mortally-wounded', 'prone'], 40, 40)).toEqual(['prone']);
  });
});

describe('effectiveArmor', () => {
  const armor: CpredArmorRow[] = [
    armorRow({ id: 'a1', sp: 11, spCurrent: 7 }),
    armorRow({ id: 'a2', name: 'Kevlar', sp: 11, spCurrent: 11, equipped: false }),
    armorRow({ id: 'a3', name: 'Hełm', sp: 11, spCurrent: 9, location: 'head' }),
  ];

  it('picks the strongest worn piece of the hit location', () => {
    expect(effectiveArmor(armor, 'body')?.id).toBe('a1');
    expect(effectiveArmorSp(armor, 'body')).toBe(7);
    expect(effectiveArmorSp(armor, 'head')).toBe(9);
  });

  it('reports no armor when nothing covers the location', () => {
    expect(effectiveArmorSp([armorRow({ location: 'shield' })], 'body')).toBe(0);
    expect(effectiveArmor([], 'head')).toBeNull();
  });
});

describe('resolveCpredDamage with special ammunition (stage 16g)', () => {
  const base = { hpCurrent: 30, hpMax: 40, location: 'body' as const };

  it('an armour-piercing round takes two points of SP instead of one', () => {
    const outcome = resolveCpredDamage({ ...base, damage: 15, armorSp: 11, ablation: 2 });
    expect(outcome.spBefore).toBe(11);
    expect(outcome.spAfter).toBe(9);
    // Only the armour changes: the damage that got through is the same 4.
    expect(outcome.damageThrough).toBe(4);
  });

  it('leaves the armour alone when the round does not wear it (rubber)', () => {
    const outcome = resolveCpredDamage({ ...base, damage: 15, armorSp: 11, ablation: 0 });
    expect(outcome.ablated).toBe(false);
    expect(outcome.spAfter).toBe(11);
  });

  it('holds a target above zero when the round is non-lethal', () => {
    const outcome = resolveCpredDamage({
      ...base,
      hpCurrent: 5,
      damage: 20,
      armorSp: 0,
      nonLethal: true,
    });
    expect(outcome.hpAfter).toBe(1);
    expect(outcome.heldAtOne).toBe(true);
    expect(outcome.hpLost).toBe(4);
    // One point left is Seriously Wounded, not Mortally — which is the whole
    // point of a baton round: the target stays out of Death Saves.
    expect(outcome.woundAfter).toBe('serious');
  });

  it('does not lift a target that was already down to one point', () => {
    // „PW celu, który ma więcej niż 1 PW" — the floor cushions a fall, it does
    // not resurrect anybody who was already there.
    const outcome = resolveCpredDamage({
      ...base,
      hpCurrent: 1,
      damage: 20,
      armorSp: 0,
      nonLethal: true,
    });
    expect(outcome.hpAfter).toBe(0);
    expect(outcome.heldAtOne).toBe(false);
  });

  it('leaves an ordinary hit exactly as it was', () => {
    const plain = resolveCpredDamage({ ...base, damage: 15, armorSp: 11 });
    expect(plain.spAfter).toBe(10);
    expect(plain.heldAtOne).toBe(false);
  });
});

describe('drawCriticalInjury', () => {
  const table = [injury(), injury({ id: 'injury.zlamana-noga', name: 'Złamana noga', roll: 8 })];

  it('draws the injury matching the 2d6 total', () => {
    const draw = drawCriticalInjury(table, 'body', scriptedRng([3, 5]));
    expect(draw.entry?.id).toBe('injury.zlamana-noga');
    expect(draw.rolls).toEqual([{ total: 8, dice: [3, 5] }]);
  });

  it('re-rolls an injury the target already suffers', () => {
    const draw = drawCriticalInjury(table, 'body', scriptedRng([4, 4, 2, 3]), [
      'injury.zlamana-noga',
    ]);
    expect(draw.entry?.id).toBe('injury.zlamane-zebra');
    expect(draw.rolls).toHaveLength(2);
  });

  it('gives up when every injury of the table is already present', () => {
    const draw = drawCriticalInjury(table, 'body', scriptedRng([4, 4]), [
      'injury.zlamana-noga',
      'injury.zlamane-zebra',
    ]);
    expect(draw.entry).toBeNull();
    expect(draw.exhausted).toBe(true);
  });

  it('draws a second injury when a dumdum round finds a foreign body (s. 345)', () => {
    // First 2d6 = 5 („Ciało obce" in this table), the re-roll gives 8.
    const foreign = [injury({ id: 'injury.cialo-obce', name: 'Ciało obce', roll: 5 }), table[1]!];
    const draw = drawCriticalInjury(foreign, 'body', scriptedRng([2, 3, 4, 4]), [], {
      extraOnIds: ['injury.cialo-obce'],
    });
    // The wound that triggered it stays, and the second one joins it.
    expect(draw.entry?.id).toBe('injury.cialo-obce');
    expect(draw.extra?.entry.id).toBe('injury.zlamana-noga');
    expect(draw.extra?.rolled).toBe(8);
    expect(draw.rolls).toHaveLength(2);
  });

  it('keeps re-rolling until the second injury is a different one', () => {
    const foreign = [injury({ id: 'injury.cialo-obce', name: 'Ciało obce', roll: 5 }), table[1]!];
    // 5, 5 again, then 8: the round chews on until the table gives something else.
    const draw = drawCriticalInjury(foreign, 'body', scriptedRng([2, 3, 1, 4, 4, 4]), [], {
      extraOnIds: ['injury.cialo-obce'],
    });
    expect(draw.extra?.entry.id).toBe('injury.zlamana-noga');
  });

  it('draws no second injury for ordinary ammunition', () => {
    const foreign = [injury({ id: 'injury.cialo-obce', name: 'Ciało obce', roll: 5 }), table[1]!];
    const draw = drawCriticalInjury(foreign, 'body', scriptedRng([2, 3]));
    expect(draw.entry?.id).toBe('injury.cialo-obce');
    expect(draw.extra).toBeUndefined();
  });

  it('reports an empty table instead of inventing an injury', () => {
    const draw = drawCriticalInjury(table, 'head', scriptedRng([3, 3]));
    expect(draw.entry).toBeNull();
    expect(draw.exhausted).toBe(false);
  });

  it('copies name and effect onto the sheet row', () => {
    const row = toCriticalInjuryRow(injury({ deathSavePenalty: 1 }), 5);
    expect(row).toEqual({
      id: 'injury.zlamane-zebra',
      name: 'Złamane żebra',
      effect: 'Bolesne.',
      rolled: 5,
      deathSavePenalty: 1,
    });
    expect(injuryDeathSavePenalty([row, { ...row, id: 'injury.x', deathSavePenalty: 1 }])).toBe(2);
  });
});

describe('sheet normalization (stage 15 fields)', () => {
  function sheet(overrides: Partial<CpredCharacterData> = {}): CpredCharacterData {
    return { ...createDefaultCharacterData(), ...overrides };
  }

  it('clamps ablated SP to the undamaged value', () => {
    const data = normalizeCharacterData(sheet({ armor: [armorRow({ sp: 7, spCurrent: 11 })] }));
    expect(data.armor[0]?.spCurrent).toBe(7);
  });

  it('wipes the Death Save counter as soon as a hit point comes back', () => {
    const dying = mergeCharacterData(sheet(), { hpCurrent: 0, deathSaves: 3 });
    expect(dying.deathSaves).toBe(3);
    const stabilized = mergeCharacterData(dying, { hpCurrent: 1 });
    expect(stabilized.deathSaves).toBe(0);
  });
});
