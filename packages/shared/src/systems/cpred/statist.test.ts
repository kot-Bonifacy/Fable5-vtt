import { describe, expect, it } from 'vitest';
import {
  STATIST_DEFAULT_STAT,
  STATIST_SKILL_LEVEL_MAX,
  STATIST_WEAPON_ROW_ID,
  combatProfileRollableSkills,
  combatProfileSheet,
  combatProfileSheetForSkill,
  combatProfileSkillLevel,
  combatProfileWithCombatValue,
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

describe('Wartość bojowa za spustem (etap 26e)', () => {
  const profile = {
    ...createDefaultCombatProfile(),
    ref: 7,
    dex: 6,
    skillLevel: 7,
    evasion: 4,
    armorSp: 11,
    weaponName: 'Karabin szturmowy',
    weaponDamage: '5k6',
    ammoCurrent: 24,
    ammoMax: 25,
  };

  it('wkłada całą Wartość bojową w Umiejętność i zeruje Cechy', () => {
    const machine = combatProfileWithCombatValue(profile, 14);
    // „Test Wartości bojowej + 1k10" (s. 214) — jedna liczba, nie dwie.
    expect(machine.skillLevel).toBe(14);
    expect(machine.ref).toBe(0);
    expect(machine.dex).toBe(0);
    // „Nie mogą unikać ataków" (s. 214).
    expect(machine.evasion).toBe(0);
  });

  it('nie rusza niczego, co należy do samej broni', () => {
    const machine = combatProfileWithCombatValue(profile, 14);
    expect(machine.weaponName).toBe('Karabin szturmowy');
    expect(machine.weaponDamage).toBe('5k6');
    expect(machine.ammoCurrent).toBe(24);
    expect(machine.armorSp).toBe(11);
  });
});

/**
 * 29.08: rany krytyczne wróciły do profilu statysty — nie dlatego, że MG ma je
 * wpisywać ręcznie (to nadal robota karty), ale dlatego, że **zasady** je
 * nadają: gaz łzawiący z 16h, broniona strefa z 26f, dwie szóstki na kościach
 * obrażeń. Do 29.08 kończyły się zdaniem na czacie i niczym więcej.
 */
describe('profil statysty — rany krytyczne', () => {
  const wound = {
    id: 'injury.body-odcieta-noga',
    name: 'Odcięta noga',
    effect: 'Nie możesz Unikać ataków.',
    noDodge: true as const,
    movePenalty: -6,
  };

  it('przechodzi przez sanityzację i wraca w całości', () => {
    const profile = sanitizeCombatProfile({
      ...createDefaultCombatProfile(),
      criticalInjuries: [wound],
    });
    expect(profile.criticalInjuries).toEqual([wound]);
  });

  it('nieruszony profil nie zyskuje pustego pola — JSON zostaje taki, jak był', () => {
    const profile = sanitizeCombatProfile(createDefaultCombatProfile());
    expect('criticalInjuries' in profile).toBe(false);
  });

  it('odrzuca wiersz bez nazwy zamiast zapisać ranę bez imienia', () => {
    const profile = sanitizeCombatProfile({
      ...createDefaultCombatProfile(),
      criticalInjuries: [{ id: 'injury.body-cos', effect: 'Boli.' }, wound],
    });
    expect(profile.criticalInjuries).toEqual([wound]);
  });

  it('podaje ranę syntetycznej karcie, więc reguły działają bez gałęzi', () => {
    const profile = { ...createDefaultCombatProfile(), criticalInjuries: [wound] };
    const data = combatProfileSheet(profile, { current: 20, max: 30 });
    expect(data.criticalInjuries).toEqual([wound]);
  });

  it('statysta bez ran ma pustą listę, nie undefined', () => {
    const data = combatProfileSheet(createDefaultCombatProfile(), { current: 20, max: 30 });
    expect(data.criticalInjuries).toEqual([]);
  });
});

/**
 * Umiejętności figury bez karty (31.08).
 *
 * Sedno jest w tym, czego tu **nie** ma: statysta nadal nie rzuca wszystkim,
 * co przyjdzie komuś do głowy. `skillLevel` zostaje liczbą broni, a lista jest
 * osobnym pytaniem — „czy w ogóle", nie „na ilu".
 */
describe('Umiejętności statysty', () => {
  it('nieruszony profil nie zyskuje pustej listy — JSON zostaje taki, jak był', () => {
    const profile = sanitizeCombatProfile(createDefaultCombatProfile());
    expect('skills' in profile).toBe(false);
    expect(combatProfileRollableSkills(profile)).toEqual([]);
  });

  it('wraca w całości i daje poziom wpisany, nie poziom broni', () => {
    const profile = sanitizeCombatProfile({
      ...createDefaultCombatProfile(),
      skillLevel: 4,
      skills: { perception: 14 },
    });
    expect(profile.skills).toEqual({ perception: 14 });
    expect(combatProfileSkillLevel(profile, 'perception')).toBe(14);
  });

  it('Umiejętność spoza listy dalej strzela poziomem broni', () => {
    const profile = sanitizeCombatProfile({
      ...createDefaultCombatProfile(),
      skillLevel: 4,
      skills: { perception: 14 },
    });
    expect(combatProfileSkillLevel(profile, 'handgun')).toBe(4);
    // …ale rzucić nią z paska nie wolno: to jest cała różnica między
    // „na ilu" a „czy w ogóle".
    expect(combatProfileRollableSkills(profile)).toEqual(['perception']);
  });

  it('Unik zostaje przy swoim polu, choćby ktoś wpisał go też na listę', () => {
    const profile = sanitizeCombatProfile({
      ...createDefaultCombatProfile(),
      evasion: 2,
      skills: { evasion: 14 },
    });
    expect(combatProfileSkillLevel(profile, 'evasion')).toBe(2);
    expect(combatProfileSheet(profile, { current: 10, max: 10 }).skills.evasion).toBe(2);
  });

  it('poziom 0 nie jest Umiejętnością, a śmieci wypadają po cichu', () => {
    const profile = sanitizeCombatProfile({
      ...createDefaultCombatProfile(),
      skills: { perception: 0, 'NIE id': 5, tracking: 'dużo', deduction: 7 },
    });
    expect(profile.skills).toEqual({ deduction: 7 });
  });

  it('karta syntetyzowana na rzut niesie wpisany poziom', () => {
    const profile = { ...createDefaultCombatProfile(), skillLevel: 4, skills: { deduction: 14 } };
    const data = combatProfileSheetForSkill(profile, { current: 30, max: 35 }, 'deduction');
    expect(data.skills.deduction).toBe(14);
  });
});

/**
 * Sufit poziomu w profilu (błąd znaleziony 31.08).
 *
 * Wsparcie i Demony trzymają w tym polu **Wartość bojową**, czyli sumę Cechy
 * i Umiejętności — a ta bywa wyższa niż dziesiątka, do której RAW ogranicza
 * Umiejętność postaci. Test pilnuje dokładnie tego rozróżnienia, bo przez cały
 * etap 30c C-SWAT z Wartością 15 wracał z bazy jako figura z Wartością 10.
 */
describe('sufit Wartości bojowej w profilu', () => {
  it('nie ścina piętnastki C-SWAT-u do dziesiątki', () => {
    const profile = sanitizeCombatProfile({
      ...createDefaultCombatProfile(),
      skillLevel: 15,
      evasion: 15,
    });
    expect(profile.skillLevel).toBe(15);
    // Wsparcie broni się tą samą liczbą, którą atakuje (s. 158).
    expect(profile.evasion).toBe(15);
  });

  it('ale sufit nadal istnieje — profil nie przyjmie liczby z sufitu', () => {
    const profile = sanitizeCombatProfile({
      ...createDefaultCombatProfile(),
      skillLevel: 999,
      skills: { deduction: 999 },
    });
    expect(profile.skillLevel).toBe(STATIST_SKILL_LEVEL_MAX);
    expect(profile.skills?.deduction).toBe(STATIST_SKILL_LEVEL_MAX);
  });
});

/**
 * Wartość bojowa liczy się raz (31.08).
 *
 * Umiejętność wpisana w profil **jest** sumą Cechy i Umiejętności, więc karta
 * syntetyzowana na taki rzut nie może dołożyć jeszcze Cechy — inaczej agent
 * federalny rzuca Dedukcją na 14 + INT 5 i wychodzi 19 z nikąd.
 */
describe('Cecha przy Umiejętności z listy', () => {
  it('idzie do zera, żeby nie policzyć się dwa razy', () => {
    const profile = { ...createDefaultCombatProfile(), skills: { deduction: 14 } };
    const data = combatProfileSheetForSkill(profile, { current: 35, max: 35 }, 'deduction');
    expect(data.stats.int).toBe(0);
    expect(data.skills.deduction).toBe(14);
  });

  it('a rzut bronią zostaje po staremu — REF plus poziom', () => {
    const profile = { ...createDefaultCombatProfile(), ref: 7, skillLevel: 4 };
    const data = combatProfileSheetForSkill(profile, { current: 20, max: 20 }, 'handgun');
    expect(data.stats.ref).toBe(7);
    expect(data.skills.handgun).toBe(4);
  });
});
