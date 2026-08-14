import { describe, expect, it } from 'vitest';
import {
  LIFEPATH_GROUP_MAX,
  applyLifepathEntry,
  buildLifepathData,
  clearRoleAnswers,
  createDefaultLifepath,
  isLifepathEmpty,
  isLifepathFieldTable,
  lifepathDataOf,
  lifepathEntryFor,
  lifepathGroupCount,
  lifepathMissing,
  lifepathRollLabel,
  lifepathTable,
  lifepathBotDraft,
  lifepathTables,
  pruneRoleAnswers,
  resizeLifepathGroup,
  validateLifepath,
  withLifepathData,
  type CpredLifepathData,
} from './lifepath.js';
import { buildCpredRegistry, parseCharacterData } from './character.js';

/**
 * A miniature Lifepath: three general tables (a Culture with languages, a
 * one-field table and a ranged one), one group table, and two Roles with one
 * question each. Small enough to check by eye, complete enough that every shape
 * the real file has appears once.
 */
const RAW = {
  groupRoll: { sides: 10, modifier: -7, min: 0 },
  general: [
    {
      id: 'culture',
      label: 'Kultura pochodzenia',
      sides: 10,
      entries: [
        { roll: 1, text: 'Wybrzeże', options: ['Polski', 'Angielski'] },
        { roll: 2, text: 'Stepy', options: ['Ukraiński'] },
        ...Array.from({ length: 8 }, (_, index) => ({
          roll: index + 3,
          text: `Region ${index + 3}`,
        })),
      ],
    },
    {
      id: 'lifeGoal',
      label: 'Cel życiowy',
      sides: 10,
      entries: Array.from({ length: 10 }, (_, index) => ({
        roll: index + 1,
        text: `Cel ${index + 1}`,
      })),
    },
    {
      id: 'revenge',
      label: 'Słodka zemsta',
      sides: 10,
      entries: [
        { roll: 1, rollMax: 5, text: 'Odpuszcza' },
        { roll: 6, rollMax: 10, text: 'Nie odpuszcza' },
      ],
    },
    {
      id: 'friend',
      label: 'Przyjaciel jest dla ciebie…',
      sides: 6,
      entries: Array.from({ length: 6 }, (_, index) => ({
        roll: index + 1,
        text: `Przyjaciel ${index + 1}`,
      })),
    },
  ],
  roles: [
    {
      roleId: 'solo',
      tables: [
        {
          id: 'solo.typ',
          label: 'Typ',
          question: 'Jakim rodzajem Solo jesteś?',
          sides: 6,
          entries: Array.from({ length: 6 }, (_, index) => ({
            roll: index + 1,
            text: `Solo ${index + 1}`,
          })),
        },
      ],
    },
    {
      roleId: 'netrunner',
      tables: [
        {
          id: 'netrunner.typ',
          label: 'Typ',
          question: 'Jakiego rodzaju Netrunnerem jesteś?',
          sides: 6,
          entries: Array.from({ length: 6 }, (_, index) => ({
            roll: index + 1,
            text: `Netrunner ${index + 1}`,
          })),
        },
      ],
    },
  ],
};

const data: CpredLifepathData = buildLifepathData(RAW);

function table(id: string) {
  const found = lifepathTable(data, 'solo', id);
  if (found === null) throw new Error(`brak tabeli ${id}`);
  return found;
}

describe('wczytywanie tabel', () => {
  it('reads the general tables, the Role paths and the group throw', () => {
    expect(data.general.map((t) => t.id)).toEqual(['culture', 'lifeGoal', 'revenge', 'friend']);
    expect(data.roles.map((r) => r.roleId)).toEqual(['solo', 'netrunner']);
    expect(data.groupRoll).toEqual({ sides: 10, modifier: -7, min: 0 });
  });

  it('drops a table nobody could roll on rather than showing a dead button', () => {
    const broken = buildLifepathData({
      general: [{ id: 'x', label: 'X', sides: 10, entries: [] }],
    });
    expect(broken.general).toEqual([]);
  });

  it('drops rows whose result falls outside the die', () => {
    const parsed = buildLifepathData({
      general: [
        {
          id: 'x',
          label: 'X',
          sides: 6,
          entries: [
            { roll: 1, text: 'ok' },
            { roll: 9, text: 'poza kością' },
          ],
        },
      ],
    });
    expect(parsed.general[0]?.entries.map((e) => e.text)).toEqual(['ok']);
  });

  it('falls back to the empty set when the registry has no Lifepath at all', () => {
    const registry = buildCpredRegistry({ skills: [] }, { roles: [] });
    expect(lifepathDataOf(registry).general).toEqual([]);
    expect(lifepathDataOf(withLifepathData(registry, RAW)).general).toHaveLength(4);
  });

  it('offers the general tables plus the chosen Role, and nobody else', () => {
    expect(lifepathTables(data, 'solo').map((t) => t.id)).toContain('solo.typ');
    expect(lifepathTables(data, 'solo').map((t) => t.id)).not.toContain('netrunner.typ');
    expect(lifepathTables(data, null).map((t) => t.id)).toEqual([
      'culture',
      'lifeGoal',
      'revenge',
      'friend',
    ]);
  });
});

describe('odczyt wyniku kości', () => {
  it('reads a plain row', () => {
    expect(lifepathEntryFor(table('lifeGoal'), 7)?.text).toBe('Cel 7');
  });

  it('reads a ranged row from either end', () => {
    expect(lifepathEntryFor(table('revenge'), 1)?.text).toBe('Odpuszcza');
    expect(lifepathEntryFor(table('revenge'), 5)?.text).toBe('Odpuszcza');
    expect(lifepathEntryFor(table('revenge'), 6)?.text).toBe('Nie odpuszcza');
  });

  it('returns nothing for a result the table does not cover', () => {
    expect(lifepathEntryFor(table('friend'), 9)).toBeNull();
  });

  it('labels a ranged row with an en dash', () => {
    expect(lifepathRollLabel({ roll: 1, rollMax: 5, text: '' })).toBe('1–5');
    expect(lifepathRollLabel({ roll: 4, text: '' })).toBe('4');
  });

  it('counts a group as 1k10 − 7, never below zero', () => {
    expect(lifepathGroupCount(10, data.groupRoll)).toBe(3);
    expect(lifepathGroupCount(8, data.groupRoll)).toBe(1);
    expect(lifepathGroupCount(7, data.groupRoll)).toBe(0);
    expect(lifepathGroupCount(1, data.groupRoll)).toBe(0);
  });
});

describe('zapis wyniku w Ścieżce', () => {
  it('writes a field table into its own field', () => {
    const entry = lifepathEntryFor(table('lifeGoal'), 3)!;
    const next = applyLifepathEntry(createDefaultLifepath(), table('lifeGoal'), entry);
    expect(next?.lifeGoal).toBe('Cel 3');
  });

  it('clears the language when the Culture of Origin is re-rolled', () => {
    const start = { ...createDefaultLifepath(), culture: 'Wybrzeże', language: 'Polski' };
    const entry = lifepathEntryFor(table('culture'), 2)!;
    const next = applyLifepathEntry(start, table('culture'), entry);
    expect(next?.culture).toBe('Stepy');
    expect(next?.language).toBe('');
  });

  it('writes a group table into the row it was rolled for', () => {
    const start = resizeLifepathGroup(createDefaultLifepath(), 'friends', 2);
    const entry = lifepathEntryFor(table('friend'), 4)!;
    const next = applyLifepathEntry(start, table('friend'), entry, 1);
    expect(next?.friends[0]?.note).toBe('');
    expect(next?.friends[1]?.note).toBe('Przyjaciel 4');
  });

  it('refuses a group roll aimed at a row that is not there', () => {
    const entry = lifepathEntryFor(table('friend'), 4)!;
    expect(applyLifepathEntry(createDefaultLifepath(), table('friend'), entry, 0)).toBeNull();
    const one = resizeLifepathGroup(createDefaultLifepath(), 'friends', 1);
    expect(applyLifepathEntry(one, table('friend'), entry)).toBeNull();
  });

  it('stores a Role question as an answer, and re-rolling replaces it', () => {
    const solo = table('solo.typ');
    const first = applyLifepathEntry(createDefaultLifepath(), solo, lifepathEntryFor(solo, 1)!)!;
    expect(first.roleAnswers).toEqual([
      { id: 'solo.typ', question: 'Jakim rodzajem Solo jesteś?', answer: 'Solo 1' },
    ]);
    const second = applyLifepathEntry(first, solo, lifepathEntryFor(solo, 5)!)!;
    expect(second.roleAnswers).toHaveLength(1);
    expect(second.roleAnswers[0]?.answer).toBe('Solo 5');
  });
});

describe('listy rzucane kością', () => {
  it('grows a list with blank rows and keeps what was written', () => {
    const two = resizeLifepathGroup(createDefaultLifepath(), 'enemies', 2);
    two.enemies[0]!.name = 'Vex';
    const three = resizeLifepathGroup(two, 'enemies', 3);
    expect(three.enemies).toHaveLength(3);
    expect(three.enemies[0]?.name).toBe('Vex');
  });

  it('shrinks from the end, so an agreed-upon enemy survives a smaller throw', () => {
    const three = resizeLifepathGroup(createDefaultLifepath(), 'enemies', 3);
    three.enemies[0]!.name = 'Vex';
    three.enemies[2]!.name = 'Kolec';
    const one = resizeLifepathGroup(three, 'enemies', 1);
    expect(one.enemies).toHaveLength(1);
    expect(one.enemies[0]?.name).toBe('Vex');
  });

  it('never grows past the limit the sheet holds', () => {
    const huge = resizeLifepathGroup(createDefaultLifepath(), 'friends', 99);
    expect(huge.friends).toHaveLength(LIFEPATH_GROUP_MAX);
  });
});

describe('zmiana Roli', () => {
  it('drops the Role answers and keeps the general half', () => {
    const solo = table('solo.typ');
    const filled = applyLifepathEntry(
      { ...createDefaultLifepath(), culture: 'Wybrzeże' },
      solo,
      lifepathEntryFor(solo, 2)!,
    )!;
    const cleared = clearRoleAnswers(filled);
    expect(cleared.roleAnswers).toEqual([]);
    expect(cleared.culture).toBe('Wybrzeże');
  });

  it('prunes answers a re-imported data file no longer knows', () => {
    const stray = {
      ...createDefaultLifepath(),
      roleAnswers: [
        { id: 'solo.typ', question: 'x', answer: 'y' },
        { id: 'solo.zniknela', question: 'x', answer: 'y' },
      ],
    };
    expect(pruneRoleAnswers(stray, data, 'solo').roleAnswers.map((a) => a.id)).toEqual([
      'solo.typ',
    ]);
  });
});

describe('licznik braków', () => {
  it('counts the unanswered general fields and Role questions', () => {
    // Two of the four general tables fill a field („revenge" and „friend" fill
    // rows of a list instead), plus one Role question.
    expect(lifepathMissing(createDefaultLifepath(), data, 'solo')).toBe(3);
    const filled = applyLifepathEntry(
      createDefaultLifepath(),
      table('lifeGoal'),
      lifepathEntryFor(table('lifeGoal'), 1)!,
    )!;
    expect(lifepathMissing(filled, data, 'solo')).toBe(2);
    expect(lifepathMissing(filled, data, null)).toBe(1);
  });

  it('knows which tables are sheet fields', () => {
    expect(isLifepathFieldTable('culture')).toBe(true);
    expect(isLifepathFieldTable('friend')).toBe(false);
    expect(isLifepathFieldTable('solo.typ')).toBe(false);
  });
});

describe('wróg → szkic bota', () => {
  it('carries the grudge into the profile the bot editor opens', () => {
    const draft = lifepathBotDraft(
      'enemy',
      {
        id: 'enemy1',
        name: 'Vex',
        who: 'Dawny przyjaciel',
        cause: 'Zdrada przy robocie',
        resources: 'Cały gang',
        revenge: 'Wbić nóż w plecy',
      },
      'Kaya',
    );
    expect(draft.name).toBe('Vex');
    expect(draft.data.persona?.personality).toContain('Dawny przyjaciel');
    expect(draft.data.persona?.motivations).toContain('Zdrada przy robocie');
    expect(draft.data.persona?.motivations).toContain('Wbić nóż w plecy');
    // What the enemy can bring to bear is the one thing the bot must not blurt
    // out, so it lands in `secrets` rather than in what it knows.
    expect(draft.data.persona?.secrets).toContain('Cały gang');
    expect(draft.data.knowledge?.people).toContain('Kaya');
    expect(draft.data.type).toBe('npc');
  });

  it('names an unnamed person after the relation, so the editor is never blank', () => {
    const draft = lifepathBotDraft('friend', { id: 'friend1', name: '', note: 'Jak rodzic' }, '');
    expect(draft.name).toBe('Przyjaciel — Postać gracza');
    expect(draft.data.persona?.personality).toContain('Jak rodzic');
    expect(draft.data.persona?.secrets).toBe('');
  });

  it('makes a tragic love its own kind of NPC', () => {
    const draft = lifepathBotDraft('love', { id: 'love1', name: 'Nina', note: 'Odeszła' }, 'Rico');
    expect(draft.name).toBe('Nina');
    expect(draft.data.persona?.personality).toContain('Rico');
    expect(draft.data.persona?.motivations).toContain('Rico');
  });
});

describe('walidacja zapisu', () => {
  it('keeps prose, clamps lengths and list sizes', () => {
    const parsed = validateLifepath(
      {
        culture: 'x'.repeat(1000),
        language: 'Polski',
        friends: Array.from({ length: 50 }, () => ({ name: 'a', note: 'b' })),
        roleAnswers: [{ id: 'solo.typ', question: 'q', answer: 'a' }, { question: 'bez id' }],
      },
      [],
    );
    expect(parsed.culture.length).toBe(300);
    expect(parsed.language).toBe('Polski');
    expect(parsed.friends).toHaveLength(LIFEPATH_GROUP_MAX);
    expect(parsed.friends[0]?.id).toBe('friend1');
    expect(parsed.roleAnswers).toHaveLength(1);
  });

  it('reads garbage as an empty Lifepath rather than throwing', () => {
    expect(isLifepathEmpty(validateLifepath(null, []))).toBe(true);
    expect(isLifepathEmpty(validateLifepath({ friends: 'nie lista' }, []))).toBe(true);
  });

  it('travels through the JSON column of a sheet intact', () => {
    const registry = withLifepathData(buildCpredRegistry({ skills: [] }, { roles: [] }), RAW);
    const stored = JSON.stringify({
      lifepath: { culture: 'Wybrzeże', language: 'Polski', enemies: [{ name: 'Vex', who: 'Eks' }] },
    });
    const sheet = parseCharacterData(stored, registry);
    expect(sheet.lifepath.culture).toBe('Wybrzeże');
    expect(sheet.lifepath.enemies[0]?.who).toBe('Eks');
    // Older rows simply have none of it.
    expect(parseCharacterData('{}', registry).lifepath.culture).toBe('');
  });
});
