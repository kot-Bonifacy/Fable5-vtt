import { describe, expect, it } from 'vitest';
import {
  CPRED_TEMPLATE_ROLLS,
  CREATION_PURCHASE_QTY_MAX,
  DEFAULT_CREATION_BUDGETS,
  createDefaultCreationDraft,
  creationAvailableSkills,
  creationBudget,
  creationIssues,
  creationPreview,
  creationPurchases,
  creationSkillCost,
  creationSkillPointsSpent,
  creationSpentEddies,
  creationStatPointsSpent,
  creationStatPool,
  creationTemplateStat,
  creationToCharacterData,
  mergeCreationDraft,
  parseCreationDraft,
  withCreationData,
  type CpredCreationDraft,
} from './creation.js';
import { buildCpredRegistry, type CpredRegistry } from './character.js';
import type { CompendiumEntry } from './compendium.js';
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
  // Umiejętność, którą podręcznik każe nazwać („Nauka", s. 81).
  { id: 'science', name: 'Nauka', stat: 'int' as const },
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
    {
      id: 'netrunner',
      statTemplates: templates(),
      skills: ['athletics', 'cryptography', 'science'],
    },
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

describe('specjalizacje umiejętności', () => {
  // „Zawsze, gdy podnosisz tę Umiejętność, musisz wybrać, którą specjalizację
  // rozwijasz" (s. 81). Do 22.08 kreator zapisywał „Nauka 4" i nie pytał w czym.
  it('refuses to finish a character who has Nauka 4 in nothing', () => {
    const reg = registry();
    const issues = creationIssues(
      finished({ roleId: 'netrunner', skills: { athletics: 3, science: 4 } }),
      data(reg),
      reg,
    );
    expect(issues.map((entry) => entry.field)).toContain('skillSpecialties.science');
  });

  it('is satisfied the moment the field is named', () => {
    const reg = registry();
    const issues = creationIssues(
      finished({
        roleId: 'netrunner',
        skills: { athletics: 3, science: 4 },
        skillSpecialties: { science: 'Fizyka' },
      }),
      data(reg),
      reg,
    );
    expect(issues).toEqual([]);
  });

  // Wiedza lokalna jest na liście podstawowej każdej Roli, więc twardy wymóg
  // byłby podatkiem od każdego NPC-a — pole jest, ale nie zatrzymuje kreatora.
  it('does not hold up a character over a basic skill', () => {
    const reg = registry({
      ...RAW_CREATION,
      basicSkills: ['athletics', 'science'],
      roles: [
        { id: 'solo', statTemplates: templates(), skills: ['athletics', 'handgun', 'autofire'] },
        {
          id: 'netrunner',
          statTemplates: templates(),
          skills: ['athletics', 'cryptography', 'science'],
        },
      ],
    });
    const issues = creationIssues(
      finished({ roleId: 'netrunner', skills: { athletics: 3, science: 4 } }),
      data(reg),
      reg,
    );
    expect(issues.some((entry) => entry.field.startsWith('skillSpecialties'))).toBe(false);
  });

  it('asks nothing of a skill nobody bought a level in', () => {
    const reg = registry();
    const issues = creationIssues(
      finished({ roleId: 'netrunner', skills: { athletics: 3 } }),
      data(reg),
      reg,
    );
    expect(issues.some((entry) => entry.field.startsWith('skillSpecialties'))).toBe(false);
  });

  it('carries the field onto the finished sheet', () => {
    const reg = registry();
    const sheet = creationToCharacterData(
      finished({
        roleId: 'netrunner',
        skills: { athletics: 3, science: 4 },
        skillSpecialties: { science: 'Fizyka' },
      }),
      data(reg),
    );
    expect(sheet.skillSpecialties.science).toBe('Fizyka');
  });

  it('drops a specialisation written onto a skill that needs none', () => {
    const reg = registry();
    const merged = mergeCreationDraft(
      draft(),
      { skillSpecialties: { athletics: 'bieganie', science: 'Chemia' } },
      data(reg),
      reg,
    );
    expect(merged?.skillSpecialties).toEqual({ science: 'Chemia' });
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

/* ─────────────────────────── wyposażenie startowe ─────────────────────────── */

const CATALOGUE: CompendiumEntry[] = [
  { id: 'weapon.pistolet', category: 'weapon', name: 'Pistolet', cost: 50 } as CompendiumEntry,
  {
    id: 'armor.kurtka',
    category: 'armor',
    name: 'Kurtka',
    cost: 100,
    sp: 7,
    locations: ['body'],
  } as CompendiumEntry,
  { id: 'gear.latarka', category: 'gear', name: 'Latarka', cost: null, costCategory: 'everyday' },
  { id: 'gear.bez-ceny', category: 'gear', name: 'Bez ceny', cost: null },
];

const lookup = (entryId: string) => CATALOGUE.find((entry) => entry.id === entryId);

describe('creationBudget', () => {
  it('gives each method the money the rulebook gives it', () => {
    expect(creationBudget(data(), draft({ method: 'edgerunner' }))).toBe(500);
    expect(creationBudget(data(), draft({ method: 'complete' }))).toBe(2550);
  });

  it('falls back to the printed numbers when the data file says nothing', () => {
    const parsed = data(registry({ ...RAW_CREATION, budgets: undefined }));
    expect(parsed.budgets).toEqual(DEFAULT_CREATION_BUDGETS);
  });

  it('reads the budgets the parser wrote', () => {
    const parsed = data(
      registry({ ...RAW_CREATION, budgets: { edgerunner: 400, complete: 3000, fashion: 0 } }),
    );
    expect(parsed.budgets).toEqual({ edgerunner: 400, complete: 3000, fashion: 0 });
  });
});

describe('creationPurchases', () => {
  it('prices the basket off the catalogue, band included', () => {
    const lines = creationPurchases(
      draft({ purchases: { 'weapon.pistolet': 1, 'gear.latarka': 3 } }),
      lookup,
    );
    expect(lines).toEqual([
      { entryId: 'weapon.pistolet', name: 'Pistolet', qty: 1, price: 50, total: 50 },
      // „Codzienne" is 20 ed on the ladder — an entry priced only by its band
      // is still buyable (stage 23b).
      { entryId: 'gear.latarka', name: 'Latarka', qty: 3, price: 20, total: 60 },
    ]);
    expect(creationSpentEddies(lines)).toBe(110);
  });

  it('drops a line the catalogue no longer sells rather than billing for it', () => {
    const lines = creationPurchases(
      draft({ purchases: { 'weapon.zniknal': 2, 'gear.bez-ceny': 1, 'gear.latarka': 1 } }),
      lookup,
    );
    expect(lines.map((line) => line.entryId)).toEqual(['gear.latarka']);
  });
});

describe('the basket and the wizard', () => {
  it('refuses a draft that spent more than its budget', () => {
    // Twenty pistols is 1000 ed; a Krawędziarz has 500.
    const issues = creationIssues(
      finished({ purchases: { 'weapon.pistolet': 20 } }),
      data(),
      registry(),
      lookup,
    );
    expect(issues.map((issue) => issue.field)).toContain('purchases');
    // `formatEddies` groups thousands with a narrow no-break space, so the
    // number cannot wrap in the middle of itself.
    expect(issues.find((issue) => issue.field === 'purchases')?.message).toContain(
      '1 000 z 500 ed',
    );
  });

  it('says nothing about shopping to a caller without a catalogue', () => {
    expect(
      creationIssues(finished({ purchases: { 'weapon.pistolet': 20 } }), data(), registry()),
    ).toEqual([]);
  });

  it('lets the same basket through on the Complete Package', () => {
    const issues = creationIssues(
      finished({ method: 'complete', purchases: { 'weapon.pistolet': 20 } }),
      data(),
      registry(),
      lookup,
    );
    expect(issues.filter((issue) => issue.field === 'purchases')).toEqual([]);
  });
});

describe('mergeCreationDraft and the basket', () => {
  it('refuses a patch that tries to write the basket itself', () => {
    // The prices, the budget and the shop's tier are the server's to read.
    expect(
      mergeCreationDraft(draft(), { purchases: { 'weapon.pistolet': 99 } }, data(), registry()),
    ).toBeNull();
  });

  it('empties the basket when the method changes, because the money changes', () => {
    const current = draft({ method: 'complete', purchases: { 'weapon.pistolet': 4 } });
    const next = mergeCreationDraft(current, { method: 'edgerunner' }, data(), registry());
    expect(next?.purchases).toEqual({});
  });

  it('keeps the basket when only the step moves', () => {
    const current = draft({ purchases: { 'weapon.pistolet': 1 } });
    const next = mergeCreationDraft(current, { step: 'summary' }, data(), registry());
    expect(next?.purchases).toEqual({ 'weapon.pistolet': 1 });
  });

  it('takes a portrait as a local upload path and nothing else', () => {
    const ok = mergeCreationDraft(
      draft(),
      { portraitUrl: '/uploads/portraits/abc.png' },
      data(),
      registry(),
    );
    expect(ok?.portraitUrl).toBe('/uploads/portraits/abc.png');
    expect(
      mergeCreationDraft(draft(), { portraitUrl: 'https://zle.example/x.png' }, data(), registry()),
    ).toBeNull();
    expect(
      mergeCreationDraft(draft(), { portraitUrl: null }, data(), registry())?.portraitUrl,
    ).toBeNull();
  });

  it('takes the token switch as a boolean', () => {
    expect(mergeCreationDraft(draft(), { placeToken: false }, data(), registry())?.placeToken).toBe(
      false,
    );
    expect(mergeCreationDraft(draft(), { placeToken: 'tak' }, data(), registry())).toBeNull();
  });
});

describe('parseCreationDraft and the basket', () => {
  it('reads a stored basket back and floors the nonsense', () => {
    const parsed = parseCreationDraft(
      {
        ...draft(),
        purchases: { 'weapon.pistolet': 2, 'gear.latarka': 0, 'gear.zly': -3, 'gear.duzo': 999 },
      },
      data(),
      registry(),
    );
    expect(parsed.purchases).toEqual({
      'weapon.pistolet': 2,
      'gear.duzo': CREATION_PURCHASE_QTY_MAX,
    });
  });

  it('defaults the token switch to on — session zero ends with a figure on the map', () => {
    expect(parseCreationDraft({}, data(), registry()).placeToken).toBe(true);
    expect(parseCreationDraft({ placeToken: false }, data(), registry()).placeToken).toBe(false);
  });
});
