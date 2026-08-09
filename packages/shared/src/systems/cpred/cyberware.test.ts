import { describe, expect, it } from 'vitest';
import {
  CYBERWARE_POOL_LIMIT,
  HUMANITY_MIN,
  cyberpsychosisFor,
  cyberwareCapacity,
  cyberwareHumanityMaxPenalty,
  cyberwareInstallationFrom,
  effectiveCpredStats,
  empFromHumanity,
  humanityMaxWith,
  resolveHumanityLoss,
  type CyberwareInstallation,
} from './cyberware.js';
import {
  buildCpredRegistry,
  createDefaultCharacterData,
  mergeCharacterData,
  parseCharacterData,
  validateCharacterDataPatch,
  type CpredCyberwareRow,
  type CpredRegistry,
} from './character.js';
import { planCpredRoll } from './rolls.js';

const registry: CpredRegistry = buildCpredRegistry(
  {
    skills: [
      { id: 'perswazja', name: 'Perswazja', stat: 'emp' },
      { id: 'bron-krotka', name: 'Broń krótka', stat: 'ref' },
    ],
  },
  { roles: [{ id: 'solo', name: 'Solo', ability: 'Zmysł Walki' }] },
);

/** A sheet row, with only the fields the rules read. */
function row(fields: Partial<CpredCyberwareRow> = {}): CpredCyberwareRow {
  return { id: 'r1', name: 'Chrom', notes: '', ...fields };
}

describe('EMP wynikające z Człowieczeństwa (s. 229)', () => {
  it('dzieli Człowieczeństwo przez 10 w dół', () => {
    expect(empFromHumanity(60)).toBe(6);
    // Przykład wprost z podręcznika: spadek z 50 na 46 zdejmuje punkt EMP.
    expect(empFromHumanity(50)).toBe(5);
    expect(empFromHumanity(46)).toBe(4);
    expect(empFromHumanity(41)).toBe(4);
    expect(empFromHumanity(40)).toBe(4);
  });

  it('nie schodzi poniżej zera nawet przy ujemnym Człowieczeństwie', () => {
    expect(empFromHumanity(0)).toBe(0);
    expect(empFromHumanity(-1)).toBe(0);
    expect(empFromHumanity(-30)).toBe(0);
  });

  it('podmienia wyłącznie EMP i oddaje ten sam obiekt, gdy nic się nie zmienia', () => {
    const stats = createDefaultCharacterData().stats;
    expect(effectiveCpredStats(stats, 50)).toBe(stats);
    const lowered = effectiveCpredStats(stats, 34);
    expect(lowered.emp).toBe(3);
    expect(lowered.ref).toBe(stats.ref);
  });
});

describe('maksymalne Człowieczeństwo (s. 230)', () => {
  it('bez cyborgizacji to EMP × 10', () => {
    expect(humanityMaxWith({ emp: 6 }, [])).toBe(60);
  });

  it('odejmuje 2 za cyborgizację i 4 za borgizację', () => {
    const rows: CyberwareInstallation[] = [
      { humanityMaxPenalty: 2 },
      { humanityMaxPenalty: 2 },
      { humanityMaxPenalty: 4 },
    ];
    expect(humanityMaxWith({ emp: 6 }, rows)).toBe(52);
  });

  it('nie schodzi poniżej zera przy ciele pełnym chromu', () => {
    const rows = Array.from({ length: 20 }, () => ({ humanityMaxPenalty: 4 }));
    expect(humanityMaxWith({ emp: 3 }, rows)).toBe(0);
  });

  it('liczy karę z wpisu: sprzęt bez UC nie obniża sufitu', () => {
    expect(cyberwareHumanityMaxPenalty({ humanityLoss: '2k6', type: 'cyberoptics' })).toBe(2);
    expect(cyberwareHumanityMaxPenalty({ humanityLoss: '4k6', type: 'borgware' })).toBe(4);
    expect(cyberwareHumanityMaxPenalty({ humanityLossFixed: 7, type: 'internal' })).toBe(2);
    // „Cyborgizacje powodujące zerową utratę Człowieczeństwa … nie obniżają
    // maksymalnego Człowieczeństwa" — henna EMP, pokrycie plastikowe.
    expect(cyberwareHumanityMaxPenalty({ type: 'fashionware' })).toBe(0);
    expect(cyberwareHumanityMaxPenalty({ humanityLossFixed: 0, type: 'fashionware' })).toBe(0);
  });

  it('przepisuje z wpisu na wiersz tylko to, co niesie zasady', () => {
    expect(
      cyberwareInstallationFrom({
        type: 'cyberoptics',
        humanityLoss: '2k6',
        foundation: true,
        slots: 3,
      }),
    ).toEqual({ type: 'cyberoptics', humanityMaxPenalty: 2, foundation: true, slots: 3 });
    // Opcja nie niesie gniazd, które daje — tylko te, które zajmuje.
    expect(
      cyberwareInstallationFrom({ type: 'cyberoptics', humanityLoss: '1k6', slotCost: 2 }),
    ).toEqual({ type: 'cyberoptics', humanityMaxPenalty: 2, slotCost: 2 });
  });
});

describe('utrata Człowieczeństwa przy montażu', () => {
  it('połowi wynik w górę, gdy wpis tak każe („1k6/2, zaokrąglij w górę")', () => {
    expect(resolveHumanityLoss(1, true)).toBe(1);
    expect(resolveHumanityLoss(3, true)).toBe(2);
    expect(resolveHumanityLoss(6, true)).toBe(3);
    expect(resolveHumanityLoss(7, false)).toBe(7);
  });
});

describe('progi cyberpsychozy (s. 232)', () => {
  it('rozpoznaje cztery szczeble po EMP bieżącym', () => {
    expect(cyberpsychosisFor(60).level).toBe('none');
    expect(cyberpsychosisFor(30).level).toBe('none');
    expect(cyberpsychosisFor(29).level).toBe('edge');
    expect(cyberpsychosisFor(20).level).toBe('edge');
    expect(cyberpsychosisFor(19).level).toBe('dissociative');
    expect(cyberpsychosisFor(10).level).toBe('dissociative');
    expect(cyberpsychosisFor(9).level).toBe('cyberpsychosis');
    expect(cyberpsychosisFor(0).level).toBe('cyberpsychosis');
  });

  it('poniżej zera oddaje ostrą cyberpsychozę, czyli postać w rękach MG', () => {
    const state = cyberpsychosisFor(-1);
    expect(state.level).toBe('severe');
    expect(state.emp).toBe(0);
    expect(state.note).toContain('MG przejmuje kontrolę');
  });
});

describe('gniazda modyfikacji', () => {
  it('rodziny bez podstawy liczy się na sztuki, nie na gniazda', () => {
    const rows = Array.from({ length: 3 }, () => ({ type: 'fashionware' as const }));
    const [fashion] = cyberwareCapacity(rows);
    expect(fashion).toMatchObject({
      type: 'fashionware',
      pool: true,
      capacity: CYBERWARE_POOL_LIMIT,
      used: 3,
    });
  });

  it('sumuje gniazda wszystkich podstaw rodziny i koszt opcji', () => {
    const rows: CyberwareInstallation[] = [
      { type: 'cyberoptics', foundation: true, slots: 3 },
      { type: 'cyberoptics', foundation: true, slots: 3 },
      { type: 'cyberoptics', slotCost: 2 },
      // Brak slotCost znaczy „jedno gniazdo" — tak mówi tabela (s. 111).
      { type: 'cyberoptics' },
    ];
    const [optics] = cyberwareCapacity(rows);
    expect(optics).toMatchObject({ capacity: 6, used: 3, pool: false, missingFoundation: false });
  });

  it('wykrywa opcję bez cyborgizacji podstawowej', () => {
    const [audio] = cyberwareCapacity([{ type: 'cyberaudio', slotCost: 1 }]);
    expect(audio?.missingFoundation).toBe(true);
  });

  it('pomija rodziny, których na karcie nie ma', () => {
    expect(cyberwareCapacity([{ type: 'internal' }])).toHaveLength(1);
  });
});

describe('karta postaci z chromem', () => {
  it('obniża sufit Człowieczeństwa po instalacji i podnosi po usunięciu', () => {
    const base = createDefaultCharacterData();
    const installed = mergeCharacterData(base, {
      cyberware: [row({ id: 'a', humanityMaxPenalty: 2 }), row({ id: 'b', humanityMaxPenalty: 4 })],
      humanityCurrent: 50,
    });
    expect(installed.humanityCurrent).toBe(44); // EMP 5 × 10 − 6

    const removed = mergeCharacterData(installed, { cyberware: [] });
    // Usunięcie oddaje sufit, ale nie oddaje utraconych punktów — te wraca
    // dopiero terapia (s. 230).
    expect(removed.humanityCurrent).toBe(44);
  });

  it('przyjmuje ujemne Człowieczeństwo — ostra cyberpsychoza jest stanem zasad', () => {
    const result = validateCharacterDataPatch({ humanityCurrent: -12 }, registry);
    expect(result.ok).toBe(true);
    const merged = mergeCharacterData(createDefaultCharacterData(), { humanityCurrent: -12 });
    expect(merged.humanityCurrent).toBe(-12);
  });

  it('odrzuca Człowieczeństwo poniżej twardego progu', () => {
    const result = validateCharacterDataPatch({ humanityCurrent: HUMANITY_MIN - 1 }, registry);
    expect(result.ok).toBe(false);
  });

  it('wczytuje wiersz cyborgizacji sprzed etapu 23a bez pól zasad', () => {
    const parsed = parseCharacterData(
      JSON.stringify({
        ...createDefaultCharacterData(),
        cyberware: [{ id: 'x', name: 'Kerenzikov', notes: 'Człowieczeństwo −2k6' }],
      }),
      registry,
    );
    expect(parsed.cyberware).toEqual([
      { id: 'x', name: 'Kerenzikov', notes: 'Człowieczeństwo −2k6' },
    ]);
    // Stary wiersz nie niesie kary, więc sufit zostaje nietknięty.
    expect(parsed.humanityCurrent).toBe(50);
  });

  it('przenosi pola zasad przez zapis i odczyt', () => {
    const parsed = parseCharacterData(
      JSON.stringify({
        ...createDefaultCharacterData(),
        cyberware: [
          {
            id: 'x',
            name: 'Cyberoko',
            notes: '',
            type: 'cyberoptics',
            install: 'clinic',
            foundation: true,
            slots: 3,
            humanityMaxPenalty: 2,
            humanityLoss: 7,
          },
        ],
      }),
      registry,
    );
    expect(parsed.cyberware[0]).toMatchObject({
      type: 'cyberoptics',
      install: 'clinic',
      foundation: true,
      slots: 3,
      humanityMaxPenalty: 2,
      humanityLoss: 7,
    });
  });
});

describe('rzuty na obniżonym EMP', () => {
  it('używa EMP bieżącego i nazywa to w rozbiciu', () => {
    const data = mergeCharacterData(createDefaultCharacterData(), {
      stats: { ...createDefaultCharacterData().stats, emp: 6 },
      skills: { perswazja: 4 },
      humanityCurrent: 46,
    });
    const planned = planCpredRoll(data, registry, { kind: 'skill', skillId: 'perswazja' });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    const stat = planned.plan.breakdown.find((entry) => entry.kind === 'stat');
    expect(stat?.value).toBe(4);
    expect(stat?.label).toContain('obniżona Człowieczeństwem');
    expect(stat?.label).toContain('baza 6');
  });

  it('nie tyka rzutów, które nie idą z EMP', () => {
    const data = mergeCharacterData(createDefaultCharacterData(), {
      skills: { 'bron-krotka': 3 },
      humanityCurrent: 4,
    });
    const planned = planCpredRoll(data, registry, { kind: 'skill', skillId: 'bron-krotka' });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    const stat = planned.plan.breakdown.find((entry) => entry.kind === 'stat');
    expect(stat?.value).toBe(5);
    expect(stat?.label).not.toContain('obniżona');
  });

  it('rzut na samą cechę EMP też schodzi wraz z Człowieczeństwem', () => {
    const data = mergeCharacterData(createDefaultCharacterData(), { humanityCurrent: 12 });
    const planned = planCpredRoll(data, registry, { kind: 'stat', statId: 'emp' });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.plan.breakdown[0]?.value).toBe(1);
  });
});
