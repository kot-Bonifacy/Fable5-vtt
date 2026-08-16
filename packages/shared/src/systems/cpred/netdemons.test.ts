import { describe, expect, it } from 'vitest';
import type {
  CpredNetArchitecture,
  CpredNetDefenseProfile,
  CpredNetDemonState,
  CpredNetProgramProfile,
  NetDemonNodeView,
} from './index.js';
import { netDemonBudgetAdvice, netDemonFloors } from './netrunning.js';
import {
  netDamageDemon,
  netDemonAttackPlan,
  netDemonHoldDv,
  netDemonInstance,
  netDemonLosesNode,
  netDemonPafPlan,
  netDemonTakesNode,
  netDemonViews,
  netDemonZapPlan,
  netLiveDemons,
  nextDemonStep,
  readNetDemonState,
  freshNetDemonState,
} from './netdemons.js';

/**
 * Demony (etap 26e) — same zasady, bez bazy i bez gniazd.
 *
 * Trzy rzeczy są tu warte sprawdzenia i wszystkie trzy są tym, czym Demon różni
 * się od Czarnego LOD-a z 26c: broni się Testem Interfejsu zamiast OBR-em, czyta
 * zwykłą kolumnę obrażeń zamiast kolumny Czarnego LOD-a, a jego Tura ma stałą
 * kolejność („najpierw węzły, Paf z resztek", s. 212).
 */

const DIABLIK: CpredNetDefenseProfile = {
  defenseKind: 'demon',
  rez: 15,
  interfaceRank: 3,
  netActions: 2,
  combatValue: 14,
};

function demonState(profile: CpredNetDefenseProfile = DIABLIK): CpredNetDemonState {
  return {
    demons: [
      netDemonInstance({
        floorId: 'f2',
        index: 0,
        entryId: 'demon.diablik',
        name: 'Diablik',
        profile,
      }),
    ],
    demonHolds: [],
  };
}

/** Miecz ze s. 203: „3k6 Programom … lub 2k6 Programom typu Czarny LOD". */
const SWORD: CpredNetProgramProfile = {
  programClass: 'attacker',
  target: 'antiProgram',
  atk: 2,
  def: 0,
  rez: 0,
  effects: { vsProgram: 3, vsBlackIce: 2 },
};

describe('Demon jako uczestnik runu', () => {
  it('rodzi się z pełnym REZ i czeka, aż MG powie, że wykrył intruza', () => {
    const state = demonState();
    const demon = state.demons[0]!;
    expect(demon.rezCurrent).toBe(15);
    expect(demon.mode).toBe('lurking');
    expect(netLiveDemons(state)).toHaveLength(1);
  });

  it('broni się Testem Interfejsu, a nie OBR-em', () => {
    const demon = demonState().demons[0]!;
    const plan = netDemonAttackPlan({
      interfaceRank: 7,
      program: { name: 'Miecz', profile: SWORD },
      demon,
    });
    expect(plan.attack).toEqual([
      { label: 'Interfejs 7', value: 7 },
      { label: 'ATK Miecz', value: 2 },
    ]);
    expect(plan.defence).toEqual([{ label: 'Interfejs Diablik', value: 3 }]);
  });

  it('czyta zwykłą kolumnę obrażeń — nie jest Czarnym LOD-em', () => {
    const demon = demonState().demons[0]!;
    expect(
      netDemonAttackPlan({ interfaceRank: 7, program: { name: 'Miecz', profile: SWORD }, demon })
        .dice,
    ).toBe(3);
    expect(netDemonZapPlan({ interfaceRank: 7, demon }).dice).toBe(1);
  });

  it('Paf Demona idzie jego Interfejsem przeciw Interfejsowi netrunnera', () => {
    const demon = demonState().demons[0]!;
    const plan = netDemonPafPlan({ demon, netrunner: { name: 'Kolec', interfaceRank: 7 } });
    expect(plan.attack).toEqual([{ label: 'Interfejs Diablik', value: 3 }]);
    expect(plan.defence).toEqual([{ label: 'Interfejs Kolec', value: 7 }]);
    expect(plan.dice).toBe(1);
  });

  it('zderezowany schodzi z listy żywych', () => {
    const state = demonState();
    const hit = netDamageDemon(state, state.demons[0]!.id, 15);
    expect(hit.outcome?.derezzed).toBe(true);
    expect(hit.state.demons[0]!.mode).toBe('derezzed');
    expect(netLiveDemons(hit.state)).toHaveLength(0);
  });
});

describe('węzły w rękach obrony', () => {
  it('podnosi PT dopiero po własnym Teście Kontroli', () => {
    let state = demonState();
    expect(netDemonHoldDv(state, 'f0')).toBeUndefined();
    state = { ...state, ...netDemonTakesNode(state, 'f0', 17) };
    expect(netDemonHoldDv(state, 'f0')).toBe(17);
  });

  it('zapomina o swoich węzłach, gdy nie zostaje ani jeden żywy Demon', () => {
    let state = demonState();
    state = { ...state, ...netDemonTakesNode(state, 'f0', 17) };
    const beaten = netDamageDemon(state, state.demons[0]!.id, 99).state;
    // Pokonanie Demona otwiera jego węzły z powrotem na PT wydrukowane na piętrze.
    expect(netDemonHoldDv(beaten, 'f0')).toBeUndefined();
  });

  it('oddaje węzeł, gdy netrunner go przejmie', () => {
    let state = demonState();
    state = { ...state, ...netDemonTakesNode(state, 'f0', 17) };
    state = { ...state, ...netDemonLosesNode(state, 'f0') };
    expect(netDemonHoldDv(state, 'f0')).toBeUndefined();
  });
});

describe('kolejność Tury Demona', () => {
  const gun = {
    id: 'dev-turret',
    name: 'Grzechot',
    deviceKind: 'turret' as const,
    on: true,
    hasToken: true,
  };

  function node(overrides: Partial<NetDemonNodeView> = {}): NetDemonNodeView {
    return { floorId: 'f0', heldByRunner: false, used: false, devices: [gun], ...overrides };
  }

  it('najpierw odbiera węzeł, który trzyma netrunner', () => {
    expect(
      nextDemonStep({ nodes: [node({ heldByRunner: true })], actionsLeft: 2, canPaf: true }),
    ).toEqual({ kind: 'reclaim', floorId: 'f0' });
  });

  it('potem strzela z wieżyczki własnego węzła', () => {
    expect(nextDemonStep({ nodes: [node()], actionsLeft: 2, canPaf: true })).toEqual({
      kind: 'fire',
      floorId: 'f0',
      deviceId: 'dev-turret',
    });
  });

  it('a z resztek Pafa', () => {
    expect(nextDemonStep({ nodes: [node({ used: true })], actionsLeft: 1, canPaf: true })).toEqual({
      kind: 'paf',
    });
    expect(nextDemonStep({ nodes: [], actionsLeft: 1, canPaf: true })).toEqual({ kind: 'paf' });
  });

  it('nie strzela wyłączonym urządzeniem ani takim bez figury na mapie', () => {
    expect(
      nextDemonStep({
        nodes: [node({ devices: [{ ...gun, on: false }] })],
        actionsLeft: 1,
        canPaf: true,
      }),
    ).toEqual({ kind: 'paf' });
    expect(
      nextDemonStep({
        nodes: [node({ devices: [{ ...gun, hasToken: false }] })],
        actionsLeft: 1,
        canPaf: true,
      }),
    ).toEqual({ kind: 'paf' });
  });

  it('kamera nie jest bronią — sam przełącznik nie zajmuje Akcji Demona', () => {
    expect(
      nextDemonStep({
        nodes: [
          node({
            devices: [
              { id: 'dev-cam', name: 'Kamera', deviceKind: 'camera', on: true, hasToken: false },
            ],
          }),
        ],
        actionsLeft: 1,
        canPaf: true,
      }),
    ).toEqual({ kind: 'paf' });
  });

  it('milknie, gdy nie ma Akcji Sieciowych ani kogo Pafnąć', () => {
    expect(nextDemonStep({ nodes: [node()], actionsLeft: 0, canPaf: true })).toBeNull();
    expect(
      nextDemonStep({ nodes: [node({ used: true })], actionsLeft: 3, canPaf: false }),
    ).toBeNull();
  });
});

describe('widok Demona', () => {
  it('nie pokazuje graczowi Demona, który jeszcze nie zaczął ścigać', () => {
    const state = demonState();
    expect(netDemonViews(state, { gm: false })).toHaveLength(0);
    expect(netDemonViews(state, { gm: true })).toHaveLength(1);
  });

  it('graczowi ścigającemu daje pasek REZ, ale nie liczby MG', () => {
    const state = demonState();
    const hunting: CpredNetDemonState = {
      ...state,
      demons: state.demons.map((demon) => ({ ...demon, mode: 'hunting' as const })),
    };
    const [seen] = netDemonViews(hunting, { gm: false });
    expect(seen?.rezCurrent).toBe(15);
    expect(seen?.rezMax).toBe(15);
    expect(seen?.interfaceRank).toBeUndefined();
    expect(seen?.combatValue).toBeUndefined();
    const [gmSeen] = netDemonViews(hunting, { gm: true });
    expect(gmSeen?.interfaceRank).toBe(3);
    expect(gmSeen?.netActions).toBe(2);
    expect(gmSeen?.combatValue).toBe(14);
  });
});

describe('odczyt stanu', () => {
  it('wraca po zapisie i nie przewraca się na śmieciach', () => {
    let state = demonState();
    state = { ...state, ...netDemonTakesNode(state, 'f0', 12) };
    const back = readNetDemonState(JSON.parse(JSON.stringify(state)));
    expect(back.demons).toHaveLength(1);
    expect(back.demons[0]!.name).toBe('Diablik');
    expect(back.demonHolds).toEqual([{ floorId: 'f0', dv: 12 }]);

    expect(readNetDemonState(null)).toEqual(freshNetDemonState());
    expect(readNetDemonState({ demons: [{ id: 'x' }], demonHolds: 'nie lista' })).toEqual(
      freshNetDemonState(),
    );
  });
});

describe('budżet Demonów w edytorze', () => {
  function architecture(floors: number, demons: number): CpredNetArchitecture {
    return {
      id: 'net.test',
      name: 'Test',
      difficulty: 'standard',
      branches: [
        {
          id: 'trunk',
          parentFloor: null,
          floors: Array.from({ length: floors }, (_, index) => ({
            id: `f${index}`,
            kind: index < demons ? ('demon' as const) : ('empty' as const),
            label: '',
            ...(index < demons ? { programIds: ['demon.diablik'] } : {}),
          })),
        },
      ],
    };
  }

  it('milczy, dopóki Architektura mieści się w „jeden na sześć pięter"', () => {
    expect(netDemonBudgetAdvice(architecture(6, 1))).toBeNull();
    expect(netDemonBudgetAdvice(architecture(12, 2))).toBeNull();
    expect(netDemonBudgetAdvice(architecture(3, 0))).toBeNull();
  });

  it('mówi, gdy Demonów jest za dużo — ale to uwaga, nie odmowa', () => {
    const advice = netDemonBudgetAdvice(architecture(6, 2));
    expect(advice).toContain('Demonów jest 2');
    expect(advice).toContain('6 pięter');
  });

  it('wskazuje piętra, na których naprawdę siedzą Demony', () => {
    expect(netDemonFloors(architecture(4, 2)).map((floor) => floor.id)).toEqual(['f0', 'f1']);
  });
});
