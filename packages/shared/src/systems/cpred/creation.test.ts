import { describe, expect, it } from 'vitest';
import {
  CPRED_TEMPLATE_ROLLS,
  createDefaultCreationDraft,
  creationAvailableSkills,
  creationIssues,
  creationPreview,
  creationSkillCost,
  creationSkillPointsSpent,
  creationStatPointsSpent,
  creationStatPool,
  creationTemplateStat,
  creationToCharacterData,
  withCreationData,
  type CpredCreationDraft,
} from './creation.js';
import { buildCpredRegistry, type CpredRegistry } from './character.js';
import { CPRED_STAT_IDS, type CpredStatId } from './stats.js';

/**
 * A miniature system: four skills (one of them ×2 and one basic-only), two
 * Roles and a stat template that is trivial to read by eye — row N gives every
 * stat the value N, except REF, which gets 8 everywhere.
 */
const SKILLS = [
  { id: 'athletics', name: 'Atletyka', stat: 'dex' as const },
  { id: 'handgun', name: 'Broń krótka', stat: 'ref' as const },
  { id: 'autofire', name: 'Ogień ciągły', stat: 'ref' as const, multiplier: 2 },
  { id: 'language', name: 'Język', stat: 'int' as const },
  { id: 'cryptography', name: 'Kryptografia', stat: 'int' as const },
];

const ROLES = [
  { id: 'solo', name: 'Solo', ability: 'Zmysł Walki' },
  { id: 'netrunner', name: 'Netrunner', ability: 'Interfejs' },
];

function templates(): number[][] {
  return Array.from({ length: CPRED_TEMPLATE_ROLLS }, (_, index) =>
    CPRED_STAT_IDS.map((id) => (id === 'ref' ? 8 : index + 1)),
  );
}

const RAW_CREATION = {
  statOrder: [...CPRED_STAT_IDS],
  limits: { statMin: 2, statMax: 8, skillMin: 2, skillMax: 6 },
  skillPoints: 20,
  statRanks: [
    { id: 'starting', name: 'Postać początkująca', points: 62 },
    { id: 'minor-hero', name: 'Podrzędny bohater', points: 75 },
  ],
  defaultStatRankId: 'starting',
  roleAbilityStart: 4,
  basicSkills: ['athletics'],
  freeLanguage: { skillId: 'language', level: 4 },
  roles: [
    { id: 'solo', statTemplates: templates(), skills: ['athletics', 'handgun', 'autofire'] },
    { id: 'netrunner', statTemplates: templates(), skills: ['athletics', 'cryptography'] },
  ],
};

function registry(raw: unknown = RAW_CREATION): CpredRegistry {
  return withCreationData(buildCpredRegistry({ skills: SKILLS }, { roles: ROLES }), raw);
}

function data(reg: CpredRegistry = registry()) {
  return reg.creation!;
}

function draft(over: Partial<CpredCreationDraft> = {}): CpredCreationDraft {
  return { ...createDefaultCreationDraft(data()), ...over };
}

/** A draft that has nothing left to complain about. */
function finished(over: Partial<CpredCreationDraft> = {}): CpredCreationDraft {
  const stats = Object.fromEntries(CPRED_STAT_IDS.map((id) => [id, 6])) as Record<
    CpredStatId,
    number
  >;
  return draft({
    step: 'summary',
    method: 'edgerunner',
    roleId: 'solo',
    stats,
    skills: { athletics: 3, handgun: 4 },
    name: 'Zgrzyt',
    ...over,
  });
}

describe('buildCreationData', () => {
  it('reads the file the parser writes', () => {
    const parsed = data();
    expect(parsed.roles).toHaveLength(2);
    expect(parsed.skillPoints).toBe(20);
    expect(parsed.basicSkills).toEqual(['athletics']);
    expect(parsed.freeLanguage).toEqual({ skillId: 'language', level: 4 });
  });

  it('drops Role skills the registry has never heard of', () => {
    const parsed = data(
      registry({
        ...RAW_CREATION,
        roles: [{ id: 'solo', statTemplates: templates(), skills: ['handgun', 'wymyslona'] }],
      }),
    );
    expect(parsed.roles[0]?.skills).toEqual(['handgun']);
  });

  it('drops a Role the roles registry does not know', () => {
    const parsed = data(
      registry({
        ...RAW_CREATION,
        roles: [...RAW_CREATION.roles, { id: 'wampir', statTemplates: templates(), skills: [] }],
      }),
    );
    expect(parsed.roles.map((role) => role.id)).toEqual(['solo', 'netrunner']);
  });

  it('takes a stat template only whole — half a table would refuse rolls at random', () => {
    const short = templates().slice(0, 4);
    const parsed = data(
      registry({ ...RAW_CREATION, roles: [{ id: 'solo', statTemplates: short, skills: [] }] }),
    );
    expect(parsed.roles[0]?.statTemplates).toEqual([]);
  });

  it('falls back to the canonical stat order when the file lists too few', () => {
    const parsed = data(registry({ ...RAW_CREATION, statOrder: ['int', 'ref'] }));
    expect(parsed.statOrder).toEqual([...CPRED_STAT_IDS]);
  });

  it('ignores a free language the skill list does not have', () => {
    const parsed = data(
      registry({ ...RAW_CREATION, freeLanguage: { skillId: 'klingonski', level: 4 } }),
    );
    expect(parsed.freeLanguage).toBeNull();
  });
});

describe('creationTemplateStat', () => {
  it('reads the Role column the 1d10 points at', () => {
    const parsed = data();
    const solo = parsed.roles[0]!;
    expect(creationTemplateStat(solo, parsed, 'body', 7)).toBe(7);
    expect(creationTemplateStat(solo, parsed, 'ref', 7)).toBe(8);
  });

  it('has nothing to say about a roll outside the table', () => {
    const parsed = data();
    expect(creationTemplateStat(parsed.roles[0]!, parsed, 'body', 11)).toBeNull();
    expect(creationTemplateStat(parsed.roles[0]!, parsed, 'body', 0)).toBeNull();
  });
});

describe('koszt punktów', () => {
  it('charges one point per level, two for a (×2) skill', () => {
    const reg = registry();
    expect(creationSkillCost('handgun', 4, data(reg), reg)).toBe(4);
    expect(creationSkillCost('autofire', 4, data(reg), reg)).toBe(8);
  });

  it('never charges for the Culture of Origin language', () => {
    const reg = registry();
    expect(creationSkillCost('language', 4, data(reg), reg)).toBe(0);
  });

  it('sums the whole sheet', () => {
    const reg = registry();
    const spent = creationSkillPointsSpent(
      finished({ skills: { athletics: 2, handgun: 3, autofire: 2 } }),
      data(reg),
      reg,
    );
    expect(spent).toBe(2 + 3 + 4);
  });

  it('buying a stat costs its value', () => {
    expect(creationStatPointsSpent(finished())).toBe(60);
    expect(creationStatPool(data(), finished())).toBe(62);
  });
});

describe('creationAvailableSkills', () => {
  it('holds Krawędziarz to the list his Role prints', () => {
    const reg = registry();
    expect(creationAvailableSkills(finished(), data(reg), reg)).toEqual([
      'athletics',
      'handgun',
      'autofire',
    ]);
  });

  it('lets Kompletny Pakiet buy anything the registry knows', () => {
    const reg = registry();
    const skills = creationAvailableSkills(finished({ method: 'complete' }), data(reg), reg);
    expect(skills).toEqual(SKILLS.map((skill) => skill.id));
  });
});

describe('creationIssues', () => {
  it('says nothing about a finished draft', () => {
    const reg = registry();
    expect(creationIssues(finished(), data(reg), reg)).toEqual([]);
  });

  it('asks for a Role, for stats and for a name on a fresh draft', () => {
    const reg = registry();
    const fields = creationIssues(draft(), data(reg), reg).map((entry) => entry.field);
    expect(fields).toContain('roleId');
    expect(fields).toContain('stats.int');
    expect(fields).toContain('name');
  });

  it('refuses a stat above the ceiling and below the floor', () => {
    const reg = registry();
    const high = creationIssues(
      finished({ stats: { ...finished().stats, body: 9 } }),
      data(reg),
      reg,
    );
    expect(high.some((entry) => entry.field === 'stats.body')).toBe(true);
    const low = creationIssues(
      finished({ stats: { ...finished().stats, body: 1 } }),
      data(reg),
      reg,
    );
    expect(low.some((entry) => entry.field === 'stats.body')).toBe(true);
  });

  it('refuses a skill above the ceiling', () => {
    const reg = registry();
    const issues = creationIssues(
      finished({ skills: { athletics: 2, handgun: 7 } }),
      data(reg),
      reg,
    );
    expect(issues.some((entry) => entry.field === 'skills.handgun')).toBe(true);
  });

  it('refuses a basic skill left below the floor', () => {
    const reg = registry();
    const issues = creationIssues(finished({ skills: { handgun: 4 } }), data(reg), reg);
    expect(issues.some((entry) => entry.message.includes('Atletyka'))).toBe(true);
  });

  it('refuses a skill outside the Role list, but not for Kompletny Pakiet', () => {
    const reg = registry();
    const held = finished({ skills: { athletics: 2, cryptography: 3 } });
    expect(
      creationIssues(held, data(reg), reg).some((e) => e.field === 'skills.cryptography'),
    ).toBe(true);
    const free = { ...held, method: 'complete' as const };
    expect(
      creationIssues(free, data(reg), reg).some((e) => e.field === 'skills.cryptography'),
    ).toBe(false);
  });

  it('refuses an overspent skill pool', () => {
    const reg = registry();
    const issues = creationIssues(
      finished({ skills: { athletics: 6, handgun: 6, autofire: 6 } }),
      data(reg),
      reg,
    );
    expect(issues.some((entry) => entry.field === 'skills')).toBe(true);
    expect(issues.find((entry) => entry.field === 'skills')?.message).toContain('24 z 20');
  });

  it('refuses an overspent stat pool, but only for Kompletny Pakiet', () => {
    const reg = registry();
    const stats = Object.fromEntries(CPRED_STAT_IDS.map((id) => [id, 8])) as Record<
      CpredStatId,
      number
    >;
    const rich = finished({ method: 'complete', stats, skills: { athletics: 2 } });
    expect(creationIssues(rich, data(reg), reg).some((entry) => entry.field === 'stats')).toBe(
      true,
    );
    // The same eighty points are legal for a Krawędziarz — his came off a 1d10.
    const rolled = { ...rich, method: 'edgerunner' as const };
    expect(creationIssues(rolled, data(reg), reg).some((entry) => entry.field === 'stats')).toBe(
      false,
    );
  });
});

describe('creationToCharacterData', () => {
  it('produces a sheet with the derived values already right', () => {
    const sheet = creationToCharacterData(finished(), data());
    expect(sheet.roleId).toBe('solo');
    expect(sheet.roleAbilityRank).toBe(4);
    // BC 6 i SW 6 -> 10 + 5 × 6 = 40 PW.
    expect(sheet.hpCurrent).toBe(40);
    expect(sheet.luckCurrent).toBe(6);
    expect(sheet.humanityCurrent).toBe(60);
    expect(sheet.skills.handgun).toBe(4);
  });

  it('grants the free language nobody paid for', () => {
    const sheet = creationToCharacterData(finished(), data());
    expect(sheet.skills.language).toBe(4);
  });

  it('drops a skill left at zero rather than writing a zero row', () => {
    const sheet = creationToCharacterData(
      finished({ skills: { athletics: 2, handgun: 0 } }),
      data(),
    );
    expect(sheet.skills.handgun).toBeUndefined();
  });

  it('agrees with the preview the wizard showed', () => {
    const sheet = creationToCharacterData(finished(), data());
    const preview = creationPreview(sheet.stats);
    expect(preview.hpMax).toBe(sheet.hpCurrent);
    expect(preview.seriousWound).toBe(20);
    expect(preview.deathSave).toBe(6);
    expect(preview.humanity).toBe(60);
  });
});
