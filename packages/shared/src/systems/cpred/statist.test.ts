import { describe, expect, it } from 'vitest';
import {
  STATIST_DEFAULT_STAT,
  STATIST_WEAPON_ROW_ID,
  combatProfileSheet,
  combatProfileSheetForSkill,
  combatProfileSkillLevel,
  createDefaultCombatProfile,
  parseCombatProfile,
  sanitizeCombatProfile,
} from './statist.js';
import { buildCpredRegistry, type CpredRegistry } from './character.js';
import { evasionBase, passiveEvasionDv, planCpredAttack } from './attacks.js';
import type { ResolvedWeapon } from './compendium.js';

/**
 * Stage 16b: a token with no character sheet still has to be able to shoot, and
 * to be shot at, without the rules growing a second code path. The tests below
 * are mostly about that identity — a statist wearing a synthesised sheet has to
 * be indistinguishable to `planCpredAttack` from a real one.
 */

const registry: CpredRegistry = buildCpredRegistry(
  {
    skills: [
      { id: 'handgun', name: 'Broń krótka', stat: 'ref' },
      { id: 'evasion', name: 'Unik', stat: 'dex' },
      { id: 'autofire', name: 'Ogień ciągły', stat: 'ref' },
    ],
  },
  { roles: [] },
);

const pistol: ResolvedWeapon = {
  damage: '3k6',
  magazine: 8,
  rof: 2,
  hands: 1,
  concealable: true,
  attachmentSlots: 3,
  skillId: 'handgun',
  rangeDv: [13, 15, 20, 25, 30, 30, null, null],
  melee: false,
};

const HP = { current: 25, max: 40 };

describe('sanitizeCombatProfile — repairs rather than rejects', () => {
  it('fills a completely absent profile with the ordinary human', () => {
    const profile = sanitizeCombatProfile(undefined);
    expect(profile.ref).toBe(STATIST_DEFAULT_STAT);
    expect(profile.weaponId).toBeNull();
    expect(profile.ammoMax).toBe(0);
  });

  it('clamps stats into the rulebook range instead of throwing', () => {
    const profile = sanitizeCombatProfile({ ref: 99, dex: -4, body: 7.6, will: 'osiem' });
    expect(profile.ref).toBe(10);
    expect(profile.dex).toBe(1);
    expect(profile.body).toBe(8);
    expect(profile.will).toBe(STATIST_DEFAULT_STAT);
  });

  it('never leaves more rounds in the magazine than it holds', () => {
    expect(sanitizeCombatProfile({ ammoMax: 12, ammoCurrent: 30 }).ammoCurrent).toBe(12);
    expect(sanitizeCombatProfile({ ammoMax: 12, ammoCurrent: 3 }).ammoCurrent).toBe(3);
  });

  it('drops a weapon id that is not a compendium id', () => {
    expect(sanitizeCombatProfile({ weaponId: 'DROP TABLE' }).weaponId).toBeNull();
    expect(sanitizeCombatProfile({ weaponId: 'weapon.zgrzyt-9' }).weaponId).toBe('weapon.zgrzyt-9');
  });

  it('falls back to a readable weapon name for an empty one', () => {
    expect(sanitizeCombatProfile({ weaponName: '   ' }).weaponName).toBe('Pięści');
  });
});

describe('parseCombatProfile — the token’s JSON column', () => {
  it('returns null for a token that has no profile', () => {
    expect(parseCombatProfile(null)).toBeNull();
    expect(parseCombatProfile('')).toBeNull();
  });

  it('returns null for a column somebody broke by hand', () => {
    expect(parseCombatProfile('{not json')).toBeNull();
    expect(parseCombatProfile('42')).toBeNull();
  });

  it('round-trips a stored profile', () => {
    const profile = { ...createDefaultCombatProfile(), ref: 7, armorSp: 11 };
    expect(parseCombatProfile(JSON.stringify(profile))).toEqual(profile);
  });
});

describe('combatProfileSheet — the profile seen as a sheet', () => {
  const profile = { ...createDefaultCombatProfile(), ref: 7, body: 8, evasion: 4, dex: 6 };

  it('takes HP from the token, not from BODY and WILL', () => {
    // A real sheet computes hpMax from the stats; a statist's bar is whatever
    // the GM typed on the token, and two sources for one number would drift.
    const sheet = combatProfileSheet(profile, HP);
    expect(sheet.hpCurrent).toBe(25);
  });

  it('clamps HP the token reports out of range', () => {
    expect(combatProfileSheet(profile, { current: 99, max: 40 }).hpCurrent).toBe(40);
    expect(combatProfileSheet(profile, { current: -5, max: 40 }).hpCurrent).toBe(0);
  });

  it('gives the statist no Luck to spend', () => {
    const sheet = combatProfileSheet(profile, HP);
    expect(sheet.stats.luck).toBe(0);
    expect(sheet.luckCurrent).toBe(0);
  });

  it('carries exactly one weapon row, under a stable id', () => {
    const sheet = combatProfileSheet(
      {
        ...profile,
        weaponId: 'weapon.zgrzyt-9',
        weaponName: 'Zgrzyt-9',
        ammoMax: 8,
        ammoCurrent: 8,
      },
      HP,
    );
    expect(sheet.weapons).toHaveLength(1);
    expect(sheet.weapons[0]!.id).toBe(STATIST_WEAPON_ROW_ID);
    expect(sheet.weapons[0]!.compendiumId).toBe('weapon.zgrzyt-9');
  });

  it('defends with its own Evasion instead of the everyday DV', () => {
    const sheet = combatProfileSheet(profile, HP);
    expect(evasionBase(sheet, registry)).toBe(10); // ZW 6 + Unik 4
    expect(passiveEvasionDv(sheet, registry)).toBe(15);
  });
});

describe('combatProfileSkillLevel — one number, one exception', () => {
  const profile = { ...createDefaultCombatProfile(), skillLevel: 6, evasion: 2 };

  it('fires everything at the profile’s combat level', () => {
    expect(combatProfileSkillLevel(profile, 'handgun')).toBe(6);
    expect(combatProfileSkillLevel(profile, 'autofire')).toBe(6);
  });

  it('dodges at its own — a statist that dodges as well as it shoots never falls', () => {
    expect(combatProfileSkillLevel(profile, 'evasion')).toBe(2);
  });
});

describe('planCpredAttack accepts a synthesised statist sheet', () => {
  const profile = {
    ...createDefaultCombatProfile(),
    ref: 7,
    skillLevel: 4,
    weaponId: 'weapon.zgrzyt-9',
    weaponName: 'Zgrzyt-9',
    weaponDamage: '3k6',
    ammoMax: 8,
    ammoCurrent: 8,
  };

  it('plans the shot with REF and the profile’s skill level in the breakdown', () => {
    const sheet = combatProfileSheetForSkill(profile, HP, 'handgun');
    const result = planCpredAttack(
      sheet,
      registry,
      { weaponRowId: STATIST_WEAPON_ROW_ID, mode: 'single' },
      { row: sheet.weapons[0]!, resolved: pistol },
      { name: 'Kurier', tokenId: 'token-2', metres: 14 },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.breakdown.map((entry) => entry.value)).toEqual([7, 4]);
    expect(result.plan.attack.dv).toBe(20);
    expect(result.plan.attack.ammoAfter).toBe(7);
  });

  it('spends ten rounds on a burst just like a sheet does', () => {
    const sheet = combatProfileSheetForSkill(
      { ...profile, ammoMax: 25, ammoCurrent: 25 },
      HP,
      'autofire',
    );
    const result = planCpredAttack(
      sheet,
      registry,
      { weaponRowId: STATIST_WEAPON_ROW_ID, mode: 'autofire' },
      {
        row: sheet.weapons[0]!,
        resolved: {
          ...pistol,
          autofire: { max: 4, rangeDv: [22, 20, 17, 20, null, null, null, null] },
        },
      },
      { name: 'Kurier', tokenId: 'token-2', metres: 14 },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.attack.ammoAfter).toBe(15);
  });

  it('refuses to spend Luck it does not have', () => {
    const sheet = combatProfileSheetForSkill(profile, HP, 'handgun');
    const result = planCpredAttack(
      sheet,
      registry,
      { weaponRowId: STATIST_WEAPON_ROW_ID, mode: 'single', luckSpent: 1 },
      { row: sheet.weapons[0]!, resolved: pistol },
      { name: 'Kurier', tokenId: 'token-2', metres: 14 },
    );
    expect(result).toEqual({ ok: false, error: 'NOT_ENOUGH_LUCK' });
  });
});
