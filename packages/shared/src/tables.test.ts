import { describe, expect, it } from 'vitest';
import type { DiceRng } from './dice.js';
import { parseRollNotation } from './dice.js';
import {
  RANDOM_TABLE_NESTING_MAX,
  randomTableCoverageIssues,
  randomTableNestingIssue,
  randomTableSpan,
  resolveRandomTableRow,
  rollRandomTable,
  validateRandomTable,
  type RandomTableSource,
} from './tables.js';

/**
 * Tabele losowe (etap 34).
 *
 * Testy pilnują czterech rzeczy, z których **pierwsza jest najważniejsza i nie
 * widać jej w UI**: tabela nie jest Testem, więc `1d10` nie ma prawa
 * eksplodować. Bez tej flagi tabela dziesięciowierszowa wypluwałaby jedenastki,
 * a wygląda to jak dziura w zakresach, nie jak błąd w rzucie.
 */

function scriptedRng(values: number[]): DiceRng {
  let index = 0;
  return () => {
    const value = values[index] ?? values[values.length - 1] ?? 1;
    index += 1;
    return value;
  };
}

function formula(notation: string) {
  const parsed = parseRollNotation(notation);
  if (!parsed.ok) throw new Error(`bad notation: ${notation}`);
  return parsed.formula;
}

describe('zasięg formuły', () => {
  it('liczy oba końce, także dla odejmowania', () => {
    expect(randomTableSpan(formula('1d10'))).toEqual({ min: 1, max: 10 });
    expect(randomTableSpan(formula('1d100'))).toEqual({ min: 1, max: 100 });
    expect(randomTableSpan(formula('2d6+3'))).toEqual({ min: 5, max: 15 });
    expect(randomTableSpan(formula('1d10-1d6'))).toEqual({ min: -5, max: 9 });
  });
});

describe('pokrycie zakresów', () => {
  it('pełne pokrycie nie ma zastrzeżeń', () => {
    const rows = [
      { min: 1, max: 5 },
      { min: 6, max: 9 },
      { min: 10, max: 10 },
    ];
    expect(randomTableCoverageIssues(formula('1d10'), rows)).toEqual([]);
  });

  it('dziura w środku jest nazwana po liczbach', () => {
    const issues = randomTableCoverageIssues(formula('1d10'), [
      { min: 1, max: 3 },
      { min: 7, max: 10 },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain('4–6');
  });

  it('brakujący ogon też jest dziurą', () => {
    const issues = randomTableCoverageIssues(formula('1d10'), [{ min: 1, max: 7 }]);
    expect(issues[0]!.message).toContain('8–10');
  });

  it('zachodzące zakresy są odmawiane', () => {
    const issues = randomTableCoverageIssues(formula('1d10'), [
      { min: 1, max: 6 },
      { min: 5, max: 10 },
    ]);
    expect(issues.some((issue) => issue.message.includes('zachodzą'))).toBe(true);
  });

  it('zakres poza formułą jest odmawiany', () => {
    const issues = randomTableCoverageIssues(formula('1d10'), [{ min: 1, max: 100 }]);
    expect(issues[0]!.message).toContain('poza formułę');
  });
});

describe('walidacja tabeli', () => {
  const good = {
    name: 'Spotkania',
    formula: '1d10',
    description: '',
    visibility: 'gm',
    rows: [
      { min: 1, max: 5, text: 'Patrol' },
      { min: 6, max: 10, text: 'Ganger' },
    ],
  };

  it('przepuszcza poprawną tabelę i normalizuje formułę', () => {
    const result = validateRandomTable({ ...good, formula: '1k10' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.table.formula).toBe('1d10');
  });

  it('odmawia tabeli z dziurą', () => {
    const result = validateRandomTable({
      ...good,
      rows: [{ min: 1, max: 5, text: 'Patrol' }],
    });
    expect(result.ok).toBe(false);
  });

  it('odmawia pustego wiersza bez treści i bez podrzutu', () => {
    const result = validateRandomTable({
      ...good,
      rows: [
        { min: 1, max: 5, text: '' },
        { min: 6, max: 10, text: 'Ganger' },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]!.message).toContain('pusty');
  });

  it('wiersz z samym podrzutem jest w porządku', () => {
    const result = validateRandomTable({
      ...good,
      rows: [
        { min: 1, max: 5, text: '', subTableId: 'inna' },
        { min: 6, max: 10, text: 'Ganger' },
      ],
    });
    expect(result.ok).toBe(true);
  });
});

describe('graf podrzutów', () => {
  it('cykl jest odmawiany i nazwany po tabelach', () => {
    const issue = randomTableNestingIssue([
      { id: 'a', name: 'Łup', subIds: ['b'] },
      { id: 'b', name: 'Broń', subIds: ['a'] },
    ]);
    expect(issue).not.toBeNull();
    expect(issue).toContain('Łup');
    expect(issue).toContain('Broń');
  });

  it('odesłanie do samej siebie też jest cyklem', () => {
    expect(randomTableNestingIssue([{ id: 'a', name: 'Łup', subIds: ['a'] }])).not.toBeNull();
  });

  it('trzy poziomy przechodzą, cztery nie', () => {
    const three = [
      { id: 'a', name: 'A', subIds: ['b'] },
      { id: 'b', name: 'B', subIds: ['c'] },
      { id: 'c', name: 'C', subIds: [] },
    ];
    expect(randomTableNestingIssue(three)).toBeNull();
    const four = [
      ...three.slice(0, 2),
      { id: 'c', name: 'C', subIds: ['d'] },
      { id: 'd', name: 'D', subIds: [] },
    ];
    expect(randomTableNestingIssue(four)).not.toBeNull();
  });

  it('limit łapie tabelę, której nikt w tej chwili nie edytuje', () => {
    // „D" dopisane pod „C" przekracza limit **„A"**, choć zmiana dotyczyła C.
    const issue = randomTableNestingIssue([
      { id: 'a', name: 'Łup', subIds: ['b'] },
      { id: 'b', name: 'Broń', subIds: ['c'] },
      { id: 'c', name: 'Amunicja', subIds: ['d'] },
      { id: 'd', name: 'Stan', subIds: [] },
    ]);
    expect(issue).toContain('Łup');
  });
});

describe('losowanie', () => {
  const tables = new Map<string, RandomTableSource>([
    [
      'loot',
      {
        id: 'loot',
        name: 'Łup z kieszeni',
        formula: '1d10',
        rows: [
          { min: 1, max: 5, text: 'Zmięte eddiesy', subTableId: null },
          { min: 6, max: 10, text: 'Broń przy ciele', subTableId: 'guns' },
        ],
      },
    ],
    [
      'guns',
      {
        id: 'guns',
        name: 'Broń przy ciele',
        formula: '1d10',
        rows: [
          { min: 1, max: 9, text: 'Średni pistolet', subTableId: null },
          { min: 10, max: 10, text: 'Karabin szturmowy', subTableId: null },
        ],
      },
    ],
  ]);

  it('dziesiątka NIE eksploduje — to numer wiersza, nie krytyk', () => {
    // Gdyby `checkRule` został włączony, `rollFormula` dorzuciłoby drugą kość
    // i suma wyszłaby poza tabelę. Ten test jest jedynym miejscem, w którym
    // widać różnicę między tabelą a Testem.
    const steps = rollRandomTable(
      new Map([
        [
          't',
          {
            id: 't',
            name: 'T',
            formula: '1d10',
            rows: [{ min: 1, max: 10, text: 'jest', subTableId: null }],
          },
        ],
      ]),
      't',
      scriptedRng([10, 7]),
    );
    expect(steps).toHaveLength(1);
    expect(steps[0]!.value).toBe(10);
    expect(steps[0]!.roll.critical).toBeUndefined();
    // `plain` mówi karcie czatu, żeby nie malowała dziesiątki na zielono.
    expect(steps[0]!.roll.plain).toBe(true);
  });

  it('jedynka też nie dorzuca', () => {
    const steps = rollRandomTable(tables, 'loot', scriptedRng([1]));
    expect(steps[0]!.value).toBe(1);
    expect(steps[0]!.text).toBe('Zmięte eddiesy');
  });

  it('wiersz z podrzutem losuje obie tabele w jednym przebiegu', () => {
    const steps = rollRandomTable(tables, 'loot', scriptedRng([7, 10]));
    expect(steps).toHaveLength(2);
    expect(steps[0]!.text).toBe('Broń przy ciele');
    expect(steps[1]!.tableName).toBe('Broń przy ciele');
    expect(steps[1]!.text).toBe('Karabin szturmowy');
  });

  it('łańcuch urywa się na limicie zagnieżdżenia', () => {
    const deep = new Map<string, RandomTableSource>();
    for (const [id, next] of [
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'd'],
      ['d', null],
    ] as const) {
      deep.set(id, {
        id,
        name: id.toUpperCase(),
        formula: '1d10',
        rows: [{ min: 1, max: 10, text: id, subTableId: next }],
      });
    }
    const steps = rollRandomTable(deep, 'a', scriptedRng([5]));
    expect(steps).toHaveLength(RANDOM_TABLE_NESTING_MAX);
  });

  it('liczba spoza zakresów daje wiersz oznaczony jako dziura', () => {
    const holed = new Map<string, RandomTableSource>([
      [
        't',
        {
          id: 't',
          name: 'T',
          formula: '1d10',
          rows: [{ min: 1, max: 5, text: 'jest', subTableId: null }],
        },
      ],
    ]);
    const steps = rollRandomTable(holed, 't', scriptedRng([9]));
    expect(steps[0]!.missing).toBe(true);
    expect(steps[0]!.text).toBe('');
  });
});

describe('rozstrzyganie wiersza', () => {
  it('bierze wiersz, w którego zakres wpada liczba', () => {
    const rows = [
      { min: 1, max: 5 },
      { min: 6, max: 10 },
    ];
    expect(resolveRandomTableRow(rows, 6)).toEqual({ min: 6, max: 10 });
    expect(resolveRandomTableRow(rows, 11)).toBeNull();
  });
});
