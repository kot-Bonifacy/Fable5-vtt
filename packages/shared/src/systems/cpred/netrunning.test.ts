import { describe, expect, it } from 'vitest';
import type { CpredNetArchitecture, CpredNetrunningData } from './netrunning.js';
import {
  NET_BLACK_ICE_SLOTS,
  buildNetrunningData,
  generateNetArchitecture,
  netActionsForInterface,
  netArchitectureAdvice,
  netBranchDepth,
  netDeepestBranch,
  netDifficultyDv,
  netFloorCount,
  netProgramSlots,
  validateNetArchitecture,
} from './netrunning.js';

/**
 * Stage 26a. The tables under test are invented — the same rule as every other
 * suite in this package: no rulebook rows in the repository.
 */
const DATA: CpredNetrunningData = {
  netActions: [
    { min: 1, max: 2, actions: 2 },
    { min: 3, max: 5, actions: 3 },
    { min: 6, max: 8, actions: 4 },
    { min: 9, max: 10, actions: 5 },
  ],
  difficulties: [
    { id: 'basic', dv: 5, suggestedInterface: 2 },
    { id: 'standard', dv: 7, suggestedInterface: 4 },
    { id: 'high', dv: 9, suggestedInterface: 6 },
    { id: 'advanced', dv: 11, suggestedInterface: 8 },
  ],
  lobbyTable: [
    { roll: 1, kind: 'file', dv: 5 },
    { roll: 2, kind: 'password', dv: 5 },
    { roll: 3, kind: 'password', dv: 7 },
    { roll: 4, kind: 'ice', programIds: ['program.osa'] },
    { roll: 5, kind: 'controlNode', dv: 5 },
    { roll: 6, kind: 'ice', programIds: ['program.tasak'] },
  ],
  contentTable: Array.from({ length: 16 }, (_, index) => {
    const roll = index + 3;
    const ice = { kind: 'ice' as const, programIds: ['program.osa'] };
    const cell =
      roll === 9 || roll === 12
        ? { kind: 'password' as const, dv: 7 }
        : roll === 10
          ? { kind: 'file' as const, dv: 7 }
          : roll === 11
            ? { kind: 'controlNode' as const, dv: 7 }
            : ice;
    return { roll, basic: cell, standard: cell, high: cell, advanced: cell };
  }),
};

/** Deterministic die: walks a fixed list, wrapping when it runs out. */
function scriptedRng(values: number[]): (sides: number) => number {
  let index = 0;
  return (sides) => {
    const value = values[index % values.length] ?? 1;
    index += 1;
    return Math.max(1, Math.min(sides, value));
  };
}

function architecture(overrides: Partial<CpredNetArchitecture> = {}): CpredNetArchitecture {
  return {
    id: 'net.test',
    name: 'Sieć testowa',
    difficulty: 'standard',
    branches: [
      {
        id: 'trunk',
        parentFloor: null,
        floors: [
          { id: 'f1', kind: 'file', label: 'Plik', dv: 7 },
          { id: 'f2', kind: 'password', label: 'Hasło', dv: 7 },
          { id: 'f3', kind: 'ice', label: 'LOD', programIds: ['program.osa'] },
        ],
      },
    ],
    ...overrides,
  };
}

describe('program profiles', () => {
  it('gives Black ICE two deck slots and everything else one', () => {
    expect(netProgramSlots({ blackIce: true })).toBe(NET_BLACK_ICE_SLOTS);
    expect(netProgramSlots({})).toBe(1);
  });

  it('lets an explicit slot count override the class default', () => {
    expect(netProgramSlots({ blackIce: true, slots: 3 })).toBe(3);
  });
});

describe('net action budget', () => {
  it('reads the Interface rank off the ladder', () => {
    expect(netActionsForInterface(1, DATA)).toBe(2);
    expect(netActionsForInterface(4, DATA)).toBe(3);
    expect(netActionsForInterface(10, DATA)).toBe(5);
  });

  it('clamps to the nearest rung outside the ladder rather than returning none', () => {
    expect(netActionsForInterface(0, DATA)).toBe(2);
    expect(netActionsForInterface(99, DATA)).toBe(5);
  });

  it('answers zero when no tables were loaded at all', () => {
    expect(
      netActionsForInterface(5, {
        netActions: [],
        difficulties: [],
        lobbyTable: [],
        contentTable: [],
      }),
    ).toBe(0);
  });

  it('reads the DV of a difficulty rung', () => {
    expect(netDifficultyDv('high', DATA)).toBe(9);
    expect(netDifficultyDv('basic', DATA)).toBe(5);
  });
});

describe('architecture shape', () => {
  it('counts floors across every branch', () => {
    const built = architecture({
      branches: [
        ...architecture().branches,
        { id: 'b1', parentFloor: 1, floors: [{ id: 'b1f1', kind: 'empty', label: '' }] },
      ],
    });
    expect(netFloorCount(built)).toBe(4);
  });

  it('measures a branch from the top of the architecture, not from its own first floor', () => {
    // Hanging below trunk floor 2 (index 1) with two floors reaches level four.
    expect(
      netBranchDepth({
        id: 'b',
        parentFloor: 1,
        floors: [
          { id: '1', kind: 'empty', label: '' },
          { id: '2', kind: 'empty', label: '' },
        ],
      }),
    ).toBe(4);
  });

  it('names the deepest branch as the bottom a Virus can be left in', () => {
    const built = architecture({
      branches: [
        {
          id: 'trunk',
          parentFloor: null,
          floors: Array.from({ length: 4 }, (_, index) => ({
            id: `f${index}`,
            kind: 'empty' as const,
            label: '',
          })),
        },
        { id: 'b1', parentFloor: 1, floors: [{ id: 'b1f1', kind: 'empty', label: '' }] },
      ],
    });
    expect(netDeepestBranch(built)?.id).toBe('trunk');
  });

  it('refuses to name a bottom when two branches reach equally deep', () => {
    // Trunk of three, branch hanging below floor two with one floor of its own:
    // both stop at level three, so there is no bottom to leave a Virus in.
    const built = architecture({
      branches: [
        ...architecture().branches,
        { id: 'b1', parentFloor: 1, floors: [{ id: 'b1f1', kind: 'empty', label: '' }] },
      ],
    });
    expect(netDeepestBranch(built)).toBeNull();
    expect(netArchitectureAdvice(built).join(' ')).toContain('dna');
  });

  it('points at floors the rulebook expects to carry a number or a Program', () => {
    const advice = netArchitectureAdvice(
      architecture({
        branches: [
          {
            id: 'trunk',
            parentFloor: null,
            floors: [
              { id: 'f1', kind: 'password', label: 'Wejście' },
              { id: 'f2', kind: 'ice', label: 'Zasadzka' },
            ],
          },
        ],
      }),
    );
    // The advice names the column and the floor, not the GM's own label — the
    // GM is looking at that label already.
    expect(advice).toContain('Trzon, piętro 1: Hasło bez PT.');
    expect(advice).toContain('Trzon, piętro 2: Czarny LOD bez wpisu.');
  });
});

describe('architecture validation', () => {
  it('accepts a plain trunk and mints an id from the name', () => {
    const result = validateNetArchitecture({
      name: 'Sieć klubu',
      difficulty: 'high',
      branches: [{ parentFloor: null, floors: [{ kind: 'password', label: 'Wejście', dv: 9 }] }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.architecture.id).toBe('net.siec-klubu');
    expect(result.architecture.difficulty).toBe('high');
    expect(result.architecture.branches[0]?.floors[0]?.dv).toBe(9);
  });

  it('refuses an architecture with no trunk', () => {
    const result = validateNetArchitecture({ name: 'Bez trzonu', branches: [] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.field)).toContain('branches');
  });

  it('refuses a branch that hangs above the second floor of the trunk', () => {
    const result = validateNetArchitecture({
      name: 'Za wysoko',
      branches: [
        {
          parentFloor: null,
          floors: [
            { kind: 'empty', label: '' },
            { kind: 'empty', label: '' },
          ],
        },
        { parentFloor: 0, floors: [{ kind: 'empty', label: '' }] },
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.message).toContain('drugiego piętra');
  });

  it('refuses a branch hanging off a trunk floor that does not exist', () => {
    const result = validateNetArchitecture({
      name: 'W powietrzu',
      branches: [
        {
          parentFloor: null,
          floors: [
            { kind: 'empty', label: '' },
            { kind: 'empty', label: '' },
          ],
        },
        { parentFloor: 5, floors: [{ kind: 'empty', label: '' }] },
      ],
    });
    expect(result.ok).toBe(false);
  });

  it('drops a DV from a floor whose kind has none, so the data cannot disagree with the sheet', () => {
    const result = validateNetArchitecture({
      name: 'Lód z PT',
      branches: [{ parentFloor: null, floors: [{ kind: 'ice', label: 'LOD', dv: 9 }] }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.architecture.branches[0]?.floors[0]?.dv).toBeUndefined();
  });

  it('refuses a DV outside the range a Check could ever beat', () => {
    const result = validateNetArchitecture({
      name: 'Absurd',
      branches: [{ parentFloor: null, floors: [{ kind: 'password', label: '', dv: 900 }] }],
    });
    expect(result.ok).toBe(false);
  });
});

describe('architecture generator', () => {
  it('rolls 3d6 floors and fills the first two from the Lobby table', () => {
    // Three sixes: eighteen floors; then 1d10 = 1 stops the branch rolls.
    const rolled = generateNetArchitecture(scriptedRng([6, 6, 6, 1, 1]), DATA, {
      name: 'Losowa',
      difficulty: 'standard',
    });
    expect(rolled.trace.floors).toBe(18);
    expect(rolled.trace.floorsRolled).toBe(true);
    expect(rolled.trace.branches).toBe(0);
    expect(netFloorCount(rolled.architecture)).toBe(18);
  });

  it('adds a branch on a 1d10 of 7 or more and stops on the first low roll', () => {
    const rolled = generateNetArchitecture(scriptedRng([4, 4, 4, 9, 2, 1]), DATA, {
      name: 'Z odnogą',
      difficulty: 'standard',
    });
    expect(rolled.trace.branches).toBe(1);
    const branch = rolled.architecture.branches.find((entry) => entry.parentFloor !== null);
    expect(branch).toBeDefined();
    expect(branch?.parentFloor).toBeGreaterThanOrEqual(1);
  });

  it('keeps the trunk the longest column so the architecture always has a bottom', () => {
    const rolled = generateNetArchitecture(scriptedRng([5, 5, 5, 9, 9, 9, 9, 1]), DATA, {
      name: 'Rozgałęziona',
      difficulty: 'standard',
    });
    expect(netDeepestBranch(rolled.architecture)?.parentFloor).toBeNull();
  });

  it('takes a fixed shape without rolling when the GM gives one', () => {
    const rolled = generateNetArchitecture(scriptedRng([1]), DATA, {
      name: 'Cztery piętra',
      difficulty: 'basic',
      floors: 4,
      branches: 0,
    });
    expect(rolled.trace.floorsRolled).toBe(false);
    expect(rolled.trace.branchesRolled).toBe(false);
    expect(netFloorCount(rolled.architecture)).toBe(4);
  });

  it('rerolls a repeated password rather than stacking two of them', () => {
    // 1d6 = 2 twice for the lobby: the second draw has to move on.
    const rolled = generateNetArchitecture(scriptedRng([1, 1, 1, 1, 2, 2, 4]), DATA, {
      name: 'Bez powtórek',
      difficulty: 'standard',
      floors: 2,
      branches: 0,
    });
    const kinds = rolled.architecture.branches[0]?.floors.map((floor) => floor.kind) ?? [];
    expect(kinds).toHaveLength(2);
    expect(kinds.filter((kind) => kind === 'password').length).toBeLessThanOrEqual(1);
  });

  it('produces an architecture the validator accepts', () => {
    const rolled = generateNetArchitecture(scriptedRng([4, 4, 4, 9, 1]), DATA, {
      name: 'Do zapisu',
      difficulty: 'advanced',
    });
    expect(validateNetArchitecture(rolled.architecture).ok).toBe(true);
  });

  it('builds an empty shaft rather than throwing when the tables are missing', () => {
    const rolled = generateNetArchitecture(
      scriptedRng([3, 3, 3, 1]),
      { netActions: [], difficulties: [], lobbyTable: [], contentTable: [] },
      { name: 'Bez danych', difficulty: 'standard' },
    );
    expect(rolled.architecture.branches[0]?.floors.every((floor) => floor.kind === 'empty')).toBe(
      true,
    );
  });
});

describe('netrunning data file', () => {
  it('reads a well-formed file', () => {
    const data = buildNetrunningData(DATA);
    expect(data?.contentTable).toHaveLength(16);
    expect(data?.lobbyTable).toHaveLength(6);
  });

  it('drops a content row that is missing a difficulty column', () => {
    const data = buildNetrunningData({
      ...DATA,
      contentTable: [{ roll: 3, basic: { kind: 'empty' }, standard: { kind: 'empty' } }],
    });
    expect(data?.contentTable).toHaveLength(0);
  });

  it('returns null for a file with nothing usable in it', () => {
    expect(buildNetrunningData({ netActions: [], lobbyTable: [], contentTable: [] })).toBeNull();
    expect(buildNetrunningData(null)).toBeNull();
  });
});
