import { describe, expect, it } from 'vitest';
import { cpredWeaponFx } from './fx.js';
import type { ResolvedWeapon } from './compendium.js';

function weapon(patch: Partial<ResolvedWeapon>): ResolvedWeapon {
  return {
    damage: '2k6',
    magazine: 8,
    rof: 2,
    hands: 1,
    concealable: true,
    attachmentSlots: 0,
    skillId: 'handgun',
    melee: false,
    ...patch,
  };
}

describe('cpredWeaponFx', () => {
  it('gives a pistol a light bang and a bullet', () => {
    expect(cpredWeaponFx(weapon({ typeId: 'weapon-type.heavy-pistol' }))).toEqual({
      style: 'bullet',
      sound: 'shot-pistol',
    });
  });

  it('tells a sniper rifle apart from an assault rifle', () => {
    expect(cpredWeaponFx(weapon({ typeId: 'weapon-type.sniper-rifle' })).sound).toBe('shot-sniper');
    expect(cpredWeaponFx(weapon({ typeId: 'weapon-type.assault-rifle' })).sound).toBe('shot-rifle');
  });

  it('draws a blade as a swing, not as a line to the target', () => {
    expect(
      cpredWeaponFx(weapon({ typeId: 'weapon-type.medium-melee', melee: true, skillId: null })),
    ).toEqual({ style: 'melee', sound: 'swing' });
  });

  it('sends a thrown knife flying instead of slashing', () => {
    // The icon table would say „sword" — a slash drawn at the thrower's end of
    // the line, which is the wrong end for something that leaves the hand.
    const knife = weapon({ typeId: 'weapon-type.light-melee', melee: true, thrown: true });
    expect(cpredWeaponFx(knife)).toEqual({ style: 'arrow', sound: 'swing' });
  });

  it('does not turn a fired weapon into a thrown one', () => {
    const grenade = weapon({ typeId: 'weapon-type.grenade', thrown: true, explosive: true });
    expect(cpredWeaponFx(grenade).style).toBe('rocket');
  });

  it('falls back through the skill for a type nobody mapped', () => {
    const homebrew = weapon({ typeId: 'weapon-type.sample-rifle', skillId: 'shoulder-arms' });
    expect(cpredWeaponFx(homebrew).sound).toBe('shot-rifle');
  });

  it('answers for a weapon with no numbers at all', () => {
    expect(cpredWeaponFx(null)).toEqual({ style: 'bullet', sound: 'shot-pistol' });
  });
});
