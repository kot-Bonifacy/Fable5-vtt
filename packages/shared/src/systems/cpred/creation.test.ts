import { describe, expect, it } from 'vitest';
import {
  CPRED_TEMPLATE_ROLLS,
  CREATION_PURCHASE_QTY_MAX,
  DEFAULT_CREATION_BUDGETS,
  createDefaultCreationDraft,
  creationAvailableSkills,
  creationBudget,
  clearRolledStats,
  creationChangeEffect,
  creationNextStatToRoll,
  creationSkillPool,
  creationRolledStats,
  creationIssues,
  creationPreview,
  creationPurchases,
  creationRoleKit,
  creationRoleKitChoices,
  creationFreeLanguageCharge,
  creationIssueStep,
  creationLeftOutside,
  creationLifestyle,
  creationMissingSkillMinima,
  creationOutcome,
  creationSkillRow,
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
    skills: { athletics: 4, handgun: 4, autofire: 6 },
    lifepath: { ...createDefaultCreationDraft(data()).lifepath, language: 'Testowy' },
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
    expect(issues.filter((issue) => issue.field.startsWith('skillSpecialties'))).toEqual([]);
  });

  // Zapis działał, odczyt nie: `parseCreationDraft` przepisuje pola po nazwie,
  // a `skillSpecialties` na tej liście nie było. Skutkiem pole „w czym?" wracało
  // puste przy każdym odczycie i postaci z Nauką nie dawało się skończyć.
  it('reads a named field back out of a stored draft', () => {
    const reg = registry();
    const stored = {
      roleId: 'netrunner',
      step: 'skills',
      skills: { science: 4 },
      skillSpecialties: { science: 'Fizyka', language: 'Farsi', athletics: 'bieg' },
    };

    const parsed = parseCreationDraft(stored, data(reg), reg);

    expect(parsed.skillSpecialties).toEqual({ science: 'Fizyka' });
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
      // is still buyable (stage 23b); drobny sprzęt ogólny ×3 w cenniku domowym (47a).
      { entryId: 'gear.latarka', name: 'Latarka', qty: 3, price: 60, total: 180 },
    ]);
    expect(creationSpentEddies(lines)).toBe(230);
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

describe('naprawa 1 — wymagania metod i rozliczenie punktów', () => {
  it('rejects a chosen edgerunner skill at one but permits an optional complete skill at one', () => {
    const reg = registry();
    const skills = { athletics: 2, handgun: 1 };
    expect(
      creationIssues(finished({ skills }), data(reg), reg).some(
        (x) => x.field === 'skills.handgun',
      ),
    ).toBe(true);
    expect(
      creationIssues(finished({ method: 'complete', skills }), data(reg), reg).some(
        (x) => x.field === 'skills.handgun',
      ),
    ).toBe(false);
  });
  it('keeps unspent points in the draft and blocks both pools until fully allocated', () => {
    const reg = registry();
    const original = finished({ method: 'complete', skills: { athletics: 2 } });
    const restored = parseCreationDraft(original, data(reg), reg);
    expect(restored.skills).toEqual(original.skills);
    const issues = creationIssues(restored, data(reg), reg);
    expect(issues.some((x) => x.field === 'stats' && x.message.includes('Pozostało: 2'))).toBe(
      true,
    );
    expect(issues.some((x) => x.field === 'skills' && x.message.includes('Pozostało: 18'))).toBe(
      true,
    );
  });
  it('requires a name for the free language without demanding the rest of the biography', () => {
    const reg = registry();
    const ready = finished();
    expect(creationIssues(ready, data(reg), reg)).toEqual([]);
    ready.lifepath.language = '   ';
    expect(creationIssues(ready, data(reg), reg).map((x) => x.field)).toEqual([
      'lifepath.language',
    ]);
    expect(creationToCharacterData(ready, data(reg)).skills.language).toBe(4);
  });
  it('refuses a vanished basket item instead of silently finishing without it', () => {
    const reg = registry();
    expect(
      creationIssues(finished({ purchases: { missing: 1 } }), data(reg), reg, () => undefined).some(
        (x) => x.field === 'purchases',
      ),
    ).toBe(true);
  });
});

describe('naprawa 1 — slang uliczny we wspólnym wierszu języka', () => {
  // Przykład z s. 90: trzynaście podstawowych kosztuje 26 i zostawia 60 z 86,
  // choć język kultury pochodzenia dochodzi za darmo na poziomie 4.
  const withSlang = { ...RAW_CREATION, basicSkills: ['athletics', 'language'] };

  it('charges the basic slang minimum once, even though the shared row is free', () => {
    const reg = registry(withSlang);
    expect(creationFreeLanguageCharge(data(reg), reg)).toBe(2);
    expect(creationSkillCost('language', 4, data(reg), reg)).toBe(0);
    const spent = creationSkillPointsSpent(
      finished({ skills: { athletics: 2, handgun: 3 } }),
      data(reg),
      reg,
    );
    expect(spent).toBe(2 + 2 + 3);
    // A draft saved with the grant written into its skills pays no more.
    expect(
      creationSkillPointsSpent(
        finished({ skills: { athletics: 2, handgun: 3, language: 4 } }),
        data(reg),
        reg,
      ),
    ).toBe(spent);
  });

  it('leaves the pool two points smaller before the character can finish', () => {
    const reg = registry(withSlang);
    const full = finished({ skills: { athletics: 4, handgun: 4, autofire: 6 } });
    expect(creationIssues(full, data(reg), reg).map((x) => x.message)).toEqual([
      expect.stringContaining('Pozostało: -2'),
    ]);
    expect(
      creationIssues(
        finished({ skills: { athletics: 4, handgun: 2, autofire: 6 } }),
        data(reg),
        reg,
      ),
    ).toEqual([]);
  });

  it('charges nothing when the free language is not a basic skill', () => {
    const reg = registry();
    expect(creationFreeLanguageCharge(data(reg), reg)).toBe(0);
  });
});

describe('naprawa 2a — automatyczne minima podstawowych', () => {
  // Atletyka jest podstawowa w obu Rolach próbki; Język to darmowy wiersz.
  const withSlang = { ...RAW_CREATION, basicSkills: ['athletics', 'language'] };

  it('grants a new Kompletny Pakiet its basic minimums and bills them', () => {
    const reg = registry(withSlang);
    const next = mergeCreationDraft(draft(), { method: 'complete' }, data(reg), reg)!;
    expect(next.skills).toEqual({ athletics: 2 });
    // Język stays off the list: its slang minimum is already the shared row's charge.
    expect(creationSkillPointsSpent(next, data(reg), reg)).toBe(2 + 2);
  });

  it('grants a Krawędziarz nothing until a Role gives him a list, then the minimums', () => {
    const reg = registry();
    const noRole = mergeCreationDraft(draft(), { step: 'skills' }, data(reg), reg)!;
    expect(noRole.skills).toEqual({});
    const solo = mergeCreationDraft(noRole, { roleId: 'solo' }, data(reg), reg)!;
    expect(solo.skills).toEqual({ athletics: 2 });
  });

  it('does not bill the minimums a second time when the draft is read back', () => {
    const reg = registry();
    const next = mergeCreationDraft(draft(), { method: 'complete' }, data(reg), reg)!;
    const stored = JSON.parse(JSON.stringify(next)) as unknown;
    const reopened = parseCreationDraft(stored, data(reg), reg);
    expect(reopened.skillMinimaAuto).toBe(true);
    expect(reopened.skills).toEqual({ athletics: 2 });
    const again = mergeCreationDraft(reopened, { step: 'summary' }, data(reg), reg)!;
    expect(creationSkillPointsSpent(again, data(reg), reg)).toBe(
      creationSkillPointsSpent(next, data(reg), reg),
    );
  });

  it('keeps a basic skill at its floor against a patch that lowers it, and never lowers a choice', () => {
    const reg = registry();
    const base = mergeCreationDraft(draft({ method: 'complete' }), {}, data(reg), reg)!;
    const lowered = mergeCreationDraft(base, { skills: { handgun: 3 } }, data(reg), reg)!;
    expect(lowered.skills).toEqual({ handgun: 3, athletics: 2 });
    const raised = mergeCreationDraft(lowered, { skills: { athletics: 5 } }, data(reg), reg)!;
    expect(raised.skills.athletics).toBe(5);
  });

  it('leaves an older draft untouched and lists what the balance would cost', () => {
    const reg = registry();
    const stored = { ...draft({ method: 'complete', skills: { athletics: 1, handgun: 4 } }) };
    delete (stored as Partial<CpredCreationDraft>).skillMinimaAuto;
    const old = parseCreationDraft(stored, data(reg), reg);
    expect(old.skillMinimaAuto).toBe(false);
    const moved = mergeCreationDraft(old, { roleId: 'solo' }, data(reg), reg)!;
    expect(moved.skills).toEqual({ athletics: 1, handgun: 4 });
    expect(creationMissingSkillMinima(moved, data(reg), reg)).toEqual([
      { skillId: 'athletics', level: 1, min: 2, cost: 1 },
    ]);
    const accepted = mergeCreationDraft(moved, { skillMinimaAuto: true }, data(reg), reg)!;
    expect(accepted.skills).toEqual({ athletics: 2, handgun: 4 });
    expect(mergeCreationDraft(accepted, { skillMinimaAuto: false }, data(reg), reg)).toBeNull();
  });
});

describe('naprawa 2a — wiersz umiejętności', () => {
  it('steps a Krawędziarz over level one in both directions', () => {
    const reg = registry();
    const solo = finished({ skills: { athletics: 2, handgun: 2, autofire: 3 } });
    const handgun = creationSkillRow(
      finished({ skills: { athletics: 2 } }),
      data(reg),
      reg,
      'handgun',
    );
    expect([handgun.level, handgun.up, handgun.down]).toEqual([0, 2, null]);
    const taken = creationSkillRow(solo, data(reg), reg, 'handgun');
    expect([taken.up, taken.down]).toEqual([3, 0]);
    const above = creationSkillRow(solo, data(reg), reg, 'autofire');
    expect(above.down).toBe(2);
  });

  it('lets Kompletny Pakiet take an optional skill at one, and a basic one never below two', () => {
    const reg = registry();
    const complete = finished({ method: 'complete', skills: { athletics: 2, cryptography: 1 } });
    const crypto = creationSkillRow(complete, data(reg), reg, 'cryptography');
    expect([crypto.min, crypto.up, crypto.down, crypto.missingPoints]).toEqual([1, 2, 0, 0]);
    const athletics = creationSkillRow(complete, data(reg), reg, 'athletics');
    expect([athletics.basic, athletics.min, athletics.down, athletics.up]).toEqual([
      true,
      2,
      null,
      3,
    ]);
    const empty = creationSkillRow(
      finished({ method: 'complete', skills: {} }),
      data(reg),
      reg,
      'cryptography',
    );
    expect(empty.up).toBe(1);
  });

  it('owes points for a basic skill below its minimum and for a chosen skill at one', () => {
    const reg = registry();
    const legacy = finished({ skills: { athletics: 0, autofire: 1 } });
    expect(creationSkillRow(legacy, data(reg), reg, 'athletics').missingPoints).toBe(2);
    // ×2 skill: one level short is two points short.
    expect(creationSkillRow(legacy, data(reg), reg, 'autofire').missingPoints).toBe(2);
    expect(creationSkillRow(legacy, data(reg), reg, 'handgun').missingPoints).toBe(0);
  });

  it('adds the linked stat to the level, and says nothing before the stat exists', () => {
    const reg = registry();
    const row = creationSkillRow(finished(), data(reg), reg, 'handgun');
    expect([row.statValue, row.checkBase, row.cost]).toEqual([6, 10, 4]);
    const blank = creationSkillRow(finished({ stats: {} }), data(reg), reg, 'handgun');
    expect([blank.statValue, blank.checkBase]).toEqual([null, null]);
  });

  it('marks the Role list as a hint and gives the free language no buttons', () => {
    const reg = registry({ ...RAW_CREATION, basicSkills: ['athletics', 'language'] });
    const complete = finished({ method: 'complete', roleId: 'netrunner' });
    expect(creationSkillRow(complete, data(reg), reg, 'cryptography').roleListed).toBe(true);
    expect(creationSkillRow(complete, data(reg), reg, 'handgun').roleListed).toBe(false);
    const language = creationSkillRow(complete, data(reg), reg, 'language');
    expect([language.free, language.level, language.cost, language.up, language.down]).toEqual([
      true,
      4,
      2,
      null,
      null,
    ]);
  });
});

describe('naprawa 2a — gdzie naprawić brak', () => {
  it('sends every issue the validation can raise to the step that fixes it', () => {
    const reg = registry();
    const everything = creationIssues(
      draft({ method: 'complete', skills: { science: 2, handgun: 9 }, purchases: { gone: 1 } }),
      data(reg),
      reg,
      () => undefined,
    );
    const steps = new Set(everything.map((x) => creationIssueStep(x.field)));
    expect(steps).toEqual(new Set(['role', 'stats', 'skills', 'lifepath', 'gear', 'details']));
    expect(creationIssueStep('statRankId')).toBe('stats');
    expect(creationIssueStep('skillSpecialties.science')).toBe('skills');
  });
});

describe('naprawa 2b — co zabiera zmiana Roli albo metody', () => {
  const answer = { id: 'soloType', question: 'Jakim Solo jesteś?', answer: 'Ochroniarz' };

  it('keeps the dice, names the skills off the new list and the Role answers', () => {
    const reg = registry();
    const rolls = Object.fromEntries(CPRED_STAT_IDS.map((id) => [id, 6]));
    const solo = finished({
      statRolls: rolls,
      purchases: { 'weapon.pistolet': 1 },
      lifepath: { ...finished().lifepath, roleAnswers: [answer] },
    });
    const effect = creationChangeEffect(solo, { roleId: 'netrunner' }, data(reg), reg, lookup);
    // The dice outlive the Role (decyzja MG z 24.09) — nothing to lose there.
    expect(effect.lost).toEqual([
      'Umiejętności (2): Broń krótka 4 · Ogień ciągły 6.',
      'Odpowiedzi Ścieżki Życia Roli (1): Ochroniarz.',
    ]);
    // A Role change keeps the basket — only the method decides the money.
    expect(effect.notes).toEqual([
      'Rzuty zostają, a Cechy czyta szablon nowej Roli: REF 6 → 8.',
      'Punkty umiejętności: pozostało 0 → 16.',
    ]);
  });

  it('keeps the dice through a method change and back, and reads them again', () => {
    const reg = registry();
    const rolls = Object.fromEntries(CPRED_STAT_IDS.map((id) => [id, 6]));
    const rolled = {
      ...finished(),
      statRolls: rolls,
      stats: creationRolledStats({ ...finished(), statRolls: rolls }, data(reg)),
    };
    const toComplete = creationChangeEffect(rolled, { method: 'complete' }, data(reg), reg);
    expect(toComplete.lost.some((line) => line.includes('Cechy'))).toBe(false);
    expect(toComplete.notes).toContain(
      'Wylosowane Cechy znikną z widoku, ale rzuty zostają w szkicu — wrócą po powrocie do Krawędziarza.',
    );
    const complete = mergeCreationDraft(rolled, { method: 'complete' }, data(reg), reg)!;
    expect(complete.stats).toEqual({});
    expect(complete.statRolls).toEqual(rolls);
    const typed = mergeCreationDraft(
      complete,
      { stats: Object.fromEntries(CPRED_STAT_IDS.map((id) => [id, 5])) },
      data(reg),
      reg,
    )!;
    expect(typed.statRolls).toEqual(rolls);
    const back = creationChangeEffect(typed, { method: 'edgerunner' }, data(reg), reg);
    expect(back.lost[0]).toMatch(/^Rozdzielone Cechy \(10\): INT 5/);
    const edgerunner = mergeCreationDraft(typed, { method: 'edgerunner' }, data(reg), reg)!;
    expect(edgerunner.stats).toEqual(rolled.stats);
  });

  it('lets the GM take the dice off one stat or all of them', () => {
    const reg = registry();
    const rolls = Object.fromEntries(CPRED_STAT_IDS.map((id) => [id, 6]));
    const base = { ...finished(), statRolls: rolls };
    const rolled = { ...base, stats: creationRolledStats(base, data(reg)) };
    expect(creationNextStatToRoll(rolled)).toBeNull();
    const one = clearRolledStats(rolled, ['ref']);
    expect(one.statRolls.ref).toBeUndefined();
    expect(one.stats.ref).toBeUndefined();
    expect(one.stats.int).toBe(rolled.stats.int);
    expect(creationNextStatToRoll(one)).toBe('ref');
    const all = clearRolledStats(rolled);
    expect(all.statRolls).toEqual({});
    expect(all.stats).toEqual({});
    expect(creationNextStatToRoll(all)).toBe(CPRED_STAT_IDS[0]);
  });

  it('empties a Krawędziarz without a Role and prices the basket it drops', () => {
    const reg = registry();
    const complete = mergeCreationDraft(
      draft({ method: 'complete' }),
      { skills: { handgun: 3, cryptography: 1 } },
      data(reg),
      reg,
    )!;
    const withBasket = { ...complete, purchases: { 'weapon.pistolet': 1, 'gear.latarka': 2 } };
    const effect = creationChangeEffect(
      withBasket,
      { method: 'edgerunner' },
      data(reg),
      reg,
      lookup,
    );
    expect(effect.lost).toEqual([
      'Umiejętności (3): Broń krótka 3 · Kryptografia 1 · Atletyka 2.',
      'Koszyk (3 szt. za 170 ed): Pistolet · Latarka ×2.',
    ]);
    // `formatEddies` groups thousands with a narrow no-break space.
    expect(effect.notes.at(-1)).toMatch(/^Pieniądze startowe: 2\s550 → 500 ed\.$/u);
  });

  it('warns about level one under a method that does not allow it, without calling it a loss', () => {
    const reg = registry();
    const complete = mergeCreationDraft(
      draft({ method: 'complete', roleId: 'solo' }),
      { skills: { handgun: 1 } },
      data(reg),
      reg,
    )!;
    const effect = creationChangeEffect(complete, { method: 'edgerunner' }, data(reg), reg);
    expect(effect.lost).toEqual([]);
    expect(effect.notes[0]).toBe(
      'Ta metoda nie zna poziomu 1 — do podniesienia albo zdjęcia (1): Broń krótka 1.',
    );
  });

  it('has nothing to say about a first Role, and nothing about a refused change', () => {
    const reg = registry();
    const first = creationChangeEffect(draft(), { roleId: 'solo' }, data(reg), reg);
    expect(first.lost).toEqual([]);
    expect(first.notes).toEqual([
      'Kreator przydzieli minima podstawowych (1): Atletyka 2.',
      'Punkty umiejętności: pozostało 20 → 18.',
    ]);
    expect(creationChangeEffect(draft(), { roleId: 'nikt' }, data(reg), reg)).toEqual({
      lost: [],
      notes: [],
    });
  });
});

describe('naprawa 3a — karta, jaką zapisze „Utwórz postać”', () => {
  const corpo = buildCpredRegistry(
    { skills: SKILLS },
    { roles: [...ROLES, { id: 'exec', name: 'Korpo', ability: 'Praca Zespołowa' }] },
  );

  it('moves a played character into a container, a Korpo into the company conapt', () => {
    expect(creationLifestyle(registry(), 'solo', true)).toEqual({
      level: 'kibble',
      housing: 'container',
    });
    expect(creationLifestyle(corpo, 'exec', true)).toEqual({
      level: 'goodPrepack',
      housing: 'corpoConapt',
    });
    // The GM's NPC pays no rent — the monthly settlement skips it.
    expect(creationLifestyle(registry(), 'solo', false)).toBeNull();
  });

  it('carries the lifestyle onto the sheet only when asked to', () => {
    expect(creationToCharacterData(finished(), data()).lifestyle).toBeNull();
    expect(
      creationToCharacterData(finished(), data(), { level: 'kibble', housing: 'container' })
        .lifestyle,
    ).toEqual({ level: 'kibble', housing: 'container' });
  });

  it('puts every basket copy on its list and leaves the change in the wallet', () => {
    const outcome = creationOutcome(
      finished({ purchases: { 'weapon.pistolet': 2, 'armor.kurtka': 1, 'gear.latarka': 1 } }),
      data(),
      registry(),
      lookup,
      { weaponTypeById: new Map() },
      true,
    );
    expect(outcome.budget).toBe(500);
    expect(outcome.spent).toBe(2 * 50 + 100 + 60);
    expect(outcome.sheet.eddies).toBe(240);
    // Bijatyka z urzędu (47b) stoi na końcu każdej karty.
    expect(outcome.sheet.weapons.map((row) => row.name)).toEqual([
      'Pistolet',
      'Pistolet',
      'Bijatyka',
    ]);
    expect(outcome.sheet.armor).toMatchObject([{ name: 'Kurtka', sp: 7, location: 'body' }]);
    expect(outcome.sheet.gear).toMatchObject([{ name: 'Latarka', qty: 1 }]);
    expect(new Set(outcome.sheet.weapons.map((row) => row.id)).size).toBe(3);
    // The free language rides along exactly as the finished sheet gets it.
    expect(outcome.sheet.skills.language).toBe(4);
    expect(outcome.sheet.lifestyle).toEqual({ level: 'kibble', housing: 'container' });
  });

  it('etap 46c: amunicja w koszyku to pudełko z kalibrem, sklejone po rodzaju', () => {
    const ammo: CompendiumEntry[] = [
      ...CATALOGUE,
      {
        id: 'ammo.zwykla',
        category: 'ammo',
        name: 'Amunicja zwykła',
        cost: 10,
        patterns: ['bullet'],
      } as CompendiumEntry,
    ];
    const pistol = {
      id: 'weapon-type.pistolet',
      name: 'Pistolet',
      skillId: null,
      damage: '2k6',
      magazine: 12,
      rof: 2,
      hands: 1 as const,
      concealable: true,
      melee: false,
      ammunition: 'Ś. Pistolet',
      ammoPatterns: ['bullet' as const],
    };
    const smg = { ...pistol, id: 'weapon-type.pm', name: 'Pistolet maszynowy', magazine: 30 };
    const outcome = creationOutcome(
      finished({
        purchases: { 'ammo.zwykla@weapon-type.pistolet': 2, 'ammo.zwykla@weapon-type.pm': 1 },
      }),
      data(),
      registry(),
      (entryId) => ammo.find((entry) => entry.id === entryId),
      { weaponTypeById: new Map([pistol, smg].map((type) => [type.id, type])) },
      true,
    );
    // Jedna paczka = 10 naboi (s. 344); ten sam kaliber skleja się w jedno pudełko.
    expect(outcome.spent).toBe(30);
    expect(outcome.sheet.gear).toMatchObject([
      {
        name: 'Amunicja zwykła · Ś. Pistolet',
        qty: 30,
        ammo: { ammoId: null, calibre: 'Ś. Pistolet', pattern: 'bullet' },
      },
    ]);
    expect(outcome.purchases.map((line) => line.name)).toEqual([
      'Amunicja zwykła · Ś. Pistolet',
      'Amunicja zwykła · Ś. Pistolet',
    ]);
    // Amunicja bez kalibru nie jest towarem — koszyk jej nie liczy.
    const bare = creationOutcome(
      finished({ purchases: { 'ammo.zwykla': 1 } }),
      data(),
      registry(),
      (entryId) => ammo.find((entry) => entry.id === entryId),
      { weaponTypeById: new Map() },
      true,
    );
    expect(bare.spent).toBe(0);
  });

  it('names what the book gives and the wizard does not, per method', () => {
    const edgerunner = creationLeftOutside({ method: 'edgerunner' }, data());
    expect(edgerunner.map((line) => line.id)).toEqual(['package', 'cyberware']);
    const complete = creationLeftOutside({ method: 'complete' }, data());
    expect(complete.map((line) => line.id)).toEqual(['fashion', 'cyberware']);
    expect(complete[0]!.text).toContain('800 ed');
    // A table that zeroed the fashion money gets no line about it.
    const noFashion = creationLeftOutside(
      { method: 'complete' },
      { budgets: { edgerunner: 500, complete: 2550, fashion: 0 } },
    );
    expect(noFashion.map((line) => line.id)).toEqual(['cyberware']);
  });
});

describe('naprawa 3b — narzędzia Roli w koszyku', () => {
  const tools: CompendiumEntry[] = [
    ...CATALOGUE,
    { id: 'gear.deck', category: 'gear', name: 'Dek', cost: 100, tier: 2 } as CompendiumEntry,
    { id: 'gear.vial', category: 'gear', name: 'Fiolka', cost: 100, tier: 4 } as CompendiumEntry,
  ];
  const find = (entryId: string) => tools.find((entry) => entry.id === entryId);
  const rules = { roleTools: { netrunner: { weaponTypes: [], entries: ['gear.deck'] } } };

  it('takes the old Role’s tools off the basket and says so', () => {
    const reg = registry();
    const runner = finished({
      roleId: 'netrunner',
      skills: { athletics: 2 },
      purchases: { 'gear.deck': 1, 'gear.latarka': 2, 'gear.zniknal': 1 },
    });
    const next = mergeCreationDraft(runner, { roleId: 'solo' }, data(reg), reg, {
      lookup: find,
      rules,
    });
    // The street flashlight stays; a row the catalogue lost stays for the issue list.
    expect(next?.purchases).toEqual({ 'gear.latarka': 2, 'gear.zniknal': 1 });
    const effect = creationChangeEffect(runner, { roleId: 'solo' }, data(reg), reg, find, rules);
    expect(effect.lost).toContain('Koszyk (1 szt. za 100 ed): Dek.');
    // Without the rules nobody can tell a deck from a flashlight — nothing goes.
    expect(mergeCreationDraft(runner, { roleId: 'solo' }, data(reg), reg)?.purchases).toEqual(
      runner.purchases,
    );
  });

  it('flags a basket row the creator’s shelf no longer carries', () => {
    const reg = registry();
    const solo = finished({ purchases: { 'gear.deck': 1, 'gear.vial': 1 } });
    const messages = creationIssues(solo, data(reg), reg, find, rules)
      .filter((issue) => issue.field === 'purchases')
      .map((issue) => issue.message);
    expect(messages).toEqual([
      'Dek: Poziom 2 (Zawodowe) — w kreatorze tylko Uliczne i narzędzia własnej Roli. Usuń z koszyka.',
      'Fiolka: Poziom 4 (Czarny rynek) — w kreatorze tylko Uliczne i narzędzia własnej Roli. Usuń z koszyka.',
    ]);
    const runner = finished({ roleId: 'netrunner', purchases: { 'gear.deck': 1 } });
    expect(
      creationIssues(runner, data(reg), reg, find, rules).filter(
        (issue) => issue.field === 'purchases',
      ),
    ).toEqual([]);
  });
});

describe('warunki MG ze zgody (24.09)', () => {
  it('counts the skill budget from the GM number, or from the book', () => {
    const reg = registry();
    const rules = data(reg);
    expect(creationSkillPool(rules, draft())).toBe(rules.skillPoints);
    const richer = finished({ skillPool: rules.skillPoints + 10 });
    expect(creationSkillPool(rules, richer)).toBe(rules.skillPoints + 10);
    const line = creationIssues(richer, rules, reg).find((x) => x.field === 'skills');
    expect(line?.message).toContain(`z ${rules.skillPoints + 10}`);
  });

  it('keeps the method the GM chose and never takes the terms off a patch', () => {
    const reg = registry();
    const fixed = draft({ methodFixed: true, skillPool: 90 });
    expect(mergeCreationDraft(fixed, { method: 'complete' }, data(reg), reg)).toBeNull();
    expect(mergeCreationDraft(fixed, { method: 'edgerunner' }, data(reg), reg)?.method).toBe(
      'edgerunner',
    );
    expect(mergeCreationDraft(draft(), { skillPool: 200 }, data(reg), reg)).toBeNull();
    expect(mergeCreationDraft(draft(), { methodFixed: true }, data(reg), reg)).toBeNull();
    const reread = parseCreationDraft(JSON.parse(JSON.stringify(fixed)), data(reg), reg);
    expect(reread.skillPool).toBe(90);
    expect(reread.methodFixed).toBe(true);
    expect(parseCreationDraft({ skillPool: 9999 }, data(reg), reg).skillPool).toBeNull();
  });
});

describe('etap 47a — wyposażenie Roli gratis', () => {
  const KIT_CATALOGUE: CompendiumEntry[] = [
    ...CATALOGUE,
    {
      id: 'cyberware.sprzeg',
      category: 'cyberware',
      name: 'Sprzęg',
      cost: 5000,
      type: 'neuralware',
    } as CompendiumEntry,
  ];
  const kitLookup = (entryId: string) => KIT_CATALOGUE.find((row) => row.id === entryId);
  const kitRegistry = registry({
    ...RAW_CREATION,
    roleKits: {
      $comment: 'pomijane — to nie Rola',
      solo: { choose: ['weapon.pistolet', 'weapon.nie-ma'] },
      netrunner: { entries: ['armor.kurtka', 'cyberware.sprzeg', 'gear.nie-ma'] },
      wampir: { entries: ['armor.kurtka'] },
    },
  });
  const kitData = data(kitRegistry);

  it('czyta listy Ról, które zna, i pomija resztę', () => {
    expect(kitData.roleKits).toEqual({
      solo: { entries: [], choose: ['weapon.pistolet', 'weapon.nie-ma'] },
      netrunner: { entries: ['armor.kurtka', 'cyberware.sprzeg', 'gear.nie-ma'], choose: [] },
    });
    expect(data().roleKits).toEqual({});
  });

  it('daje wyposażenie tylko Kompletnemu Pakietowi; chromu nie kładzie na kartę', () => {
    const netrunner = { method: 'complete' as const, roleId: 'netrunner', kitChoice: null };
    expect(creationRoleKit(netrunner, kitData, kitLookup)).toEqual([
      { entryId: 'armor.kurtka', name: 'Kurtka', value: 100, onSheet: true },
      { entryId: 'cyberware.sprzeg', name: 'Sprzęg', value: 5000, onSheet: false },
    ]);
    expect(creationRoleKit({ ...netrunner, method: 'edgerunner' }, kitData, kitLookup)).toEqual([]);
    // Chrom z wyposażenia ląduje w „Czego kreator nie wydaje”.
    const outside = creationLeftOutside(
      { method: 'complete' },
      kitData,
      creationRoleKit(netrunner, kitData, kitLookup),
    );
    expect(outside.find((line) => line.id === 'kit')?.text).toMatch(
      /^Sprzęg — chrom należny za darmo/,
    );
  });

  it('Solo wybiera z listy; wybór spoza niej i u Krawędziarza odpada', () => {
    const solo = mergeCreationDraft(
      draft({ method: 'complete', roleId: 'solo' }),
      {},
      kitData,
      kitRegistry,
    )!;
    expect(creationRoleKitChoices(solo, kitData, kitLookup).map((line) => line.entryId)).toEqual([
      'weapon.pistolet',
    ]);
    expect(creationIssues(solo, kitData, kitRegistry).some((i) => i.field === 'kitChoice')).toBe(
      true,
    );
    expect(
      mergeCreationDraft(solo, { kitChoice: 'armor.kurtka' }, kitData, kitRegistry),
    ).toBeNull();
    const chosen = mergeCreationDraft(
      solo,
      { kitChoice: 'weapon.pistolet' },
      kitData,
      kitRegistry,
    )!;
    expect(chosen.kitChoice).toBe('weapon.pistolet');
    expect(creationIssues(chosen, kitData, kitRegistry).some((i) => i.field === 'kitChoice')).toBe(
      false,
    );
    expect(creationIssueStep('kitChoice')).toBe('gear');
    // Zmiana metody zdejmuje wybór i mówi o tym w oknie zmiany.
    expect(
      mergeCreationDraft(chosen, { method: 'edgerunner' }, kitData, kitRegistry)!.kitChoice,
    ).toBeNull();
    expect(
      creationChangeEffect(chosen, { method: 'edgerunner' }, kitData, kitRegistry, kitLookup).lost,
    ).toContain('Wybór z wyposażenia Roli: Pistolet.');
    // Zapisany szkic z wyborem spoza listy czyta się bez niego.
    expect(
      parseCreationDraft({ ...chosen, kitChoice: 'armor.kurtka' }, kitData, kitRegistry).kitChoice,
    ).toBeNull();
    expect(parseCreationDraft(chosen, kitData, kitRegistry).kitChoice).toBe('weapon.pistolet');
  });

  it('podsumowanie kładzie wyposażenie na kartę za darmo', () => {
    const outcome = creationOutcome(
      finished({ method: 'complete', roleId: 'solo', kitChoice: 'weapon.pistolet' }),
      kitData,
      kitRegistry,
      kitLookup,
      { weaponTypeById: new Map() },
      true,
    );
    expect(outcome.kit.map((line) => line.entryId)).toEqual(['weapon.pistolet']);
    expect(outcome.sheet.weapons.map((row) => row.compendiumId)).toEqual([
      'weapon.pistolet',
      'weapon.brawling',
    ]);
    expect(outcome.spent).toBe(0);
    expect(outcome.sheet.eddies).toBe(outcome.budget);
  });
});
