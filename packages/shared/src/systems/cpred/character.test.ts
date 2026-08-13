import { describe, expect, it } from 'vitest';
import {
  CPRED_SCHEMA_VERSION,
  SHEET_LINE_MAX_LENGTH,
  buildCpredRegistry,
  createDefaultCharacterData,
  groupedSkills,
  mergeCharacterData,
  parseCharacterData,
  validateCharacterDataPatch,
  type CpredRegistry,
} from './character.js';
import {
  deathSaveTarget,
  hpMax,
  humanityMax,
  seriousWoundThreshold,
  skillBase,
} from './derived.js';
import { sanitizeCharacterName } from '../../characters.js';

const registry: CpredRegistry = buildCpredRegistry(
  {
    skills: [
      { id: 'handgun', name: 'Broń krótka', stat: 'ref' },
      { id: 'paramedic', name: 'Ratownictwo medyczne', stat: 'tech', multiplier: 2 },
    ],
  },
  {
    roles: [
      { id: 'solo', name: 'Solo', ability: 'Zmysł Walki' },
      { id: 'medtech', name: 'Medyk', ability: 'Medycyna' },
    ],
  },
);

describe('derived values', () => {
  it('computes hpMax = 10 + 5*ceil((body+will)/2)', () => {
    expect(hpMax({ body: 5, will: 5 })).toBe(35);
    expect(hpMax({ body: 3, will: 8 })).toBe(40); // Forty from Easy Mode
    expect(hpMax({ body: 7, will: 6 })).toBe(45); // Mover from Easy Mode
    expect(hpMax({ body: 2, will: 2 })).toBe(20);
    expect(hpMax({ body: 10, will: 10 })).toBe(60);
  });

  it('computes the seriously wounded threshold as half hpMax rounded up', () => {
    expect(seriousWoundThreshold({ body: 3, will: 8 })).toBe(20);
    expect(seriousWoundThreshold({ body: 6, will: 3 })).toBe(18); // 35 HP → 18
    expect(seriousWoundThreshold({ body: 7, will: 6 })).toBe(23); // Mover: 45 → 23
  });

  it('death save target equals BODY', () => {
    expect(deathSaveTarget({ body: 7 })).toBe(7);
  });

  it('humanity max is EMP × 10', () => {
    expect(humanityMax({ emp: 6 })).toBe(60);
  });

  it('skill base is stat + level', () => {
    expect(skillBase(7, 6)).toBe(13);
  });
});

describe('hp recomputation on stat changes (stage criterion)', () => {
  it('changing BODY/WILL changes hpMax and clamps hpCurrent', () => {
    const data = createDefaultCharacterData(); // stats all 5 → 35 HP
    expect(data.hpCurrent).toBe(35);
    const weakened = mergeCharacterData(data, { stats: { ...data.stats, body: 2, will: 2 } });
    expect(hpMax(weakened.stats)).toBe(20);
    expect(weakened.hpCurrent).toBe(20); // clamped down from 35
    const buffed = mergeCharacterData(weakened, { stats: { ...weakened.stats, body: 8 } });
    expect(hpMax(buffed.stats)).toBe(35);
    expect(buffed.hpCurrent).toBe(20); // raising max never heals
  });

  it('clamps luck and humanity to their stat-derived maxima', () => {
    const data = createDefaultCharacterData();
    const merged = mergeCharacterData(data, { stats: { ...data.stats, luck: 2, emp: 3 } });
    expect(merged.luckCurrent).toBe(2);
    expect(merged.humanityCurrent).toBe(30);
  });
});

describe('validateCharacterDataPatch', () => {
  it('accepts a valid patch', () => {
    const result = validateCharacterDataPatch(
      {
        stats: { ...createDefaultCharacterData().stats, ref: 8 },
        skills: { handgun: 6 },
        roleId: 'solo',
        roleAbilityRank: 4,
        eddies: 500,
        weapons: [
          { id: 'w1', name: 'Ciężki pistolet', damage: '3k6', ammo: '8', rof: '2', notes: '' },
        ],
      },
      registry,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch.skills).toEqual({ handgun: 6 });
      expect(result.patch.roleId).toBe('solo');
    }
  });

  // Karta zapisuje się po każdym znaku, więc przycinanie nazwy wiersza znaczyło
  // tyle, co „nie da się wpisać spacji": znikała, zanim wpadła następna litera.
  it('keeps a trailing space in a row name so multi-word names can be typed', () => {
    const result = validateCharacterDataPatch(
      { armor: [{ id: 'a1', name: 'Ciężki pancerz ', sp: 11, spCurrent: 11, location: 'body' }] },
      registry,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.patch.armor?.[0]?.name).toBe('Ciężki pancerz ');
  });

  it('rejects out-of-range stats with a Polish message', () => {
    const stats = { ...createDefaultCharacterData().stats, int: 11 };
    const result = validateCharacterDataPatch({ stats }, registry);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.field).toBe('stats.int');
      expect(result.issues[0]?.message).toContain('od 1 do 10');
      expect(result.issues[0]?.message).toContain('Inteligencja');
    }
  });

  it('rejects non-integer and negative stat values', () => {
    const base = createDefaultCharacterData().stats;
    expect(validateCharacterDataPatch({ stats: { ...base, dex: 5.5 } }, registry).ok).toBe(false);
    expect(validateCharacterDataPatch({ stats: { ...base, dex: 0 } }, registry).ok).toBe(false);
  });

  it('rejects unknown roles, accepts null', () => {
    expect(validateCharacterDataPatch({ roleId: 'jedi' }, registry).ok).toBe(false);
    expect(validateCharacterDataPatch({ roleId: null }, registry).ok).toBe(true);
  });

  it('drops unknown skill ids but rejects bad levels', () => {
    const dropped = validateCharacterDataPatch({ skills: { flying: 3, handgun: 2 } }, registry);
    expect(dropped.ok).toBe(true);
    if (dropped.ok) expect(dropped.patch.skills).toEqual({ handgun: 2 });
    expect(validateCharacterDataPatch({ skills: { handgun: 11 } }, registry).ok).toBe(false);
  });

  it('removes level-0 skills from the record', () => {
    const result = validateCharacterDataPatch({ skills: { handgun: 0, paramedic: 4 } }, registry);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.patch.skills).toEqual({ paramedic: 4 });
  });

  it('rejects oversized item lists and bad rows', () => {
    const rows = Array.from({ length: 41 }, (_, i) => ({
      id: `g${i}`,
      name: 'x',
      notes: '',
      qty: 1,
    }));
    expect(validateCharacterDataPatch({ gear: rows }, registry).ok).toBe(false);
    expect(
      validateCharacterDataPatch(
        { armor: [{ id: 'a1', name: 'Kurtka', notes: '', sp: 99 }] },
        registry,
      ).ok,
    ).toBe(false);
  });

  it('rejects negative eddies', () => {
    const result = validateCharacterDataPatch({ eddies: -5 }, registry);
    expect(result.ok).toBe(false);
  });

  // Stage 27b — the three prose lines of the printed sheet.
  it('accepts the sheet lines and refuses an oversized one', () => {
    const result = validateCharacterDataPatch(
      { addictions: 'Dorph, dwa razy dziennie', style: 'Skóra i chrom', ammoStock: '9 mm × 60' },
      registry,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch.addictions).toBe('Dorph, dwa razy dziennie');
      expect(result.patch.style).toBe('Skóra i chrom');
      expect(result.patch.ammoStock).toBe('9 mm × 60');
    }
    const tooLong = validateCharacterDataPatch(
      { addictions: 'x'.repeat(SHEET_LINE_MAX_LENGTH + 1) },
      registry,
    );
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) {
      expect(tooLong.issues[0]?.field).toBe('addictions');
      expect(tooLong.issues[0]?.message).toContain('Uzależnienia');
    }
  });
});

describe('parseCharacterData', () => {
  it('fills defaults for malformed JSON', () => {
    const data = parseCharacterData('not-json', registry);
    expect(data.schemaVersion).toBe(CPRED_SCHEMA_VERSION);
    expect(data.stats.int).toBe(5);
  });

  it('keeps valid fields and defaults invalid ones', () => {
    const data = parseCharacterData(
      JSON.stringify({ eddies: 1234, roleId: 'ghost', skills: { handgun: 3 } }),
      registry,
    );
    expect(data.eddies).toBe(1234);
    expect(data.roleId).toBeNull();
    expect(data.skills).toEqual({ handgun: 3 });
  });

  // Backwards compatibility for stage 27b: every sheet in the database was
  // written before the three prose lines existed.
  it('reads a sheet saved before the 27b lines as empty ones', () => {
    const data = parseCharacterData(JSON.stringify({ eddies: 10 }), registry);
    expect(data.addictions).toBe('');
    expect(data.style).toBe('');
    expect(data.ammoStock).toBe('');
  });
});

describe('groupedSkills', () => {
  const grouped = buildCpredRegistry(
    {
      skills: [
        { id: 'handgun', name: 'Broń krótka', stat: 'ref', group: 'ranged' },
        { id: 'athletics', name: 'Atletyka', stat: 'dex', group: 'body' },
        { id: 'archery', name: 'Łucznictwo', stat: 'ref', group: 'ranged' },
        { id: 'orphan', name: 'Bez kategorii', stat: 'int' },
      ],
    },
    { roles: [] },
  );

  it('keeps the printed order of categories and drops empty ones', () => {
    // The official sheet prints "Broń Dystansowa" before "Ciało" — Polish
    // alphabetical order, not the order of the ids in the data file.
    expect(groupedSkills(grouped).map((group) => group.id)).toEqual(['ranged', 'body', 'other']);
  });

  it('puts skills without a category in a trailing group', () => {
    const last = groupedSkills(grouped).at(-1);
    expect(last?.id).toBe('other');
    expect(last?.skills.map((skill) => skill.id)).toEqual(['orphan']);
  });

  it('lists every skill exactly once', () => {
    const ids = groupedSkills(grouped).flatMap((group) => group.skills.map((skill) => skill.id));
    expect(ids.sort()).toEqual(['archery', 'athletics', 'handgun', 'orphan']);
  });
});

describe('sanitizeCharacterName', () => {
  it('trims and bounds the name', () => {
    expect(sanitizeCharacterName('  Mover ')).toBe('Mover');
    expect(sanitizeCharacterName('')).toBeNull();
    expect(sanitizeCharacterName('x'.repeat(65))).toBeNull();
    expect(sanitizeCharacterName(42)).toBeNull();
  });
});

/**
 * A wound that heals by itself (stage 16h). The timer has to survive every
 * round trip through the sheet, or the first unrelated save would turn a minute
 * of blindness into a permanent one.
 */
describe('timed critical injuries', () => {
  const timed = { source: 'Amunicja hukbłyskowa', durationS: 60, expiresAtRound: 9 };

  it('keeps the timer through a validate/merge round trip', () => {
    const result = validateCharacterDataPatch(
      {
        criticalInjuries: [
          { id: 'injury.head-uraz-oka', name: 'Uraz oka', effect: '-2 do ataków', timed },
        ],
      },
      registry,
    );
    expect(result.ok).toBe(true);
    const row = result.ok ? result.patch.criticalInjuries?.[0] : undefined;
    expect(row?.timed).toEqual(timed);
  });

  it('takes a timer with no round — outside a fight nothing is counting', () => {
    const result = validateCharacterDataPatch(
      {
        criticalInjuries: [
          {
            id: 'injury.head-uraz-oka',
            name: 'Uraz oka',
            effect: '-2',
            timed: { source: 'Gaz', durationS: 60 },
          },
        ],
      },
      registry,
    );
    const row = result.ok ? result.patch.criticalInjuries?.[0] : undefined;
    expect(row?.timed?.expiresAtRound).toBeUndefined();
    expect(row?.timed?.source).toBe('Gaz');
  });

  it('drops a malformed timer instead of throwing the sheet away', () => {
    const result = validateCharacterDataPatch(
      {
        criticalInjuries: [
          {
            id: 'injury.head-uraz-oka',
            name: 'Uraz oka',
            effect: '-2',
            timed: { durationS: 'minuta' },
          },
        ],
      },
      registry,
    );
    expect(result.ok).toBe(true);
    const row = result.ok ? result.patch.criticalInjuries?.[0] : undefined;
    // The safe failure is a wound that stays until somebody takes it off.
    expect(row?.timed).toBeUndefined();
  });
});
