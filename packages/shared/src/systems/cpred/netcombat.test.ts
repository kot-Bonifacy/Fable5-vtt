import { describe, expect, it } from 'vitest';
import type { CpredNetArchitecture, CpredNetProgramProfile } from './netrunning.js';
import { netProgramDamageDice, netProgramHurts, readNetProgramEffects } from './netrunning.js';
import type { CpredNetIce, CpredNetRezzed } from './netcombat.js';
import {
  NET_ACTIONS_FLOOR,
  describeNetProgramEffects,
  freshNetCombat,
  netAbilityBonuses,
  netActionsAfterDebt,
  netApplyRez,
  netAttackWins,
  netBonusTotal,
  netBrainArmour,
  netCanRunProgram,
  netCanSlide,
  netCombatView,
  netDamageIce,
  netDamageRezzed,
  netDetectionPlan,
  netGlueHolds,
  netIceAttackPlan,
  netJackOutBill,
  netLiveIce,
  netMoveGoesDeeper,
  netProgramAttackPlan,
  netRandomDeckProgram,
  netRandomDefender,
  netRandomRezzed,
  netRunProgram,
  netShieldFor,
  netSlideDestinations,
  netSlidePlan,
  netSpeedBonuses,
  netStopProgram,
  netTargetAllowed,
  netZapPlan,
  readNetCombatState,
} from './netcombat.js';

/**
 * Walka w Sieci (etap 26c).
 *
 * Testy chodzą po tych samych czterech rzeczach, o których mówi podręcznik na
 * s. 201–205: co Program robi (dane, nie nazwa), kto komu może zaszkodzić,
 * ile zostaje z REZ i dokąd ucieka Ślizg.
 */

function profile(patch: Partial<CpredNetProgramProfile> = {}): CpredNetProgramProfile {
  return { programClass: 'attacker', atk: 0, def: 0, rez: 0, ...patch };
}

function rezzed(patch: Partial<CpredNetRezzed> = {}): CpredNetRezzed {
  return {
    id: patch.id ?? 'copy-1',
    rowId: patch.rowId ?? 'row-1',
    name: patch.name ?? 'Program',
    profile: patch.profile ?? profile({ programClass: 'booster', rez: 7 }),
    rezCurrent: patch.rezCurrent ?? 7,
    derezzed: patch.derezzed ?? false,
  };
}

function ice(patch: Partial<CpredNetIce> = {}): CpredNetIce {
  return {
    id: patch.id ?? 'ice-1',
    floorId: patch.floorId ?? 'f3',
    programId: patch.programId ?? 'program.kraken',
    name: patch.name ?? 'Kraken',
    profile:
      patch.profile ??
      profile({
        target: 'antiPersonnel',
        blackIce: true,
        atk: 8,
        def: 4,
        rez: 30,
        per: 6,
        speed: 2,
        effects: { vsBrain: 3 },
      }),
    rezCurrent: patch.rezCurrent ?? 30,
    mode: patch.mode ?? 'lurking',
    detected: patch.detected ?? false,
    ...(patch.combatantId !== undefined ? { combatantId: patch.combatantId } : {}),
    ...(patch.lastAttackRound !== undefined ? { lastAttackRound: patch.lastAttackRound } : {}),
  };
}

// ─────────────────────────── efekt jako dane ───────────────────────────

describe('efekt Programu jest danymi', () => {
  it('reads „3k6 Programom lub 2k6 Czarnym LOD-om" off the entry', () => {
    const hammer = profile({ effects: { vsProgram: 3, vsBlackIce: 2 } });
    expect(netProgramDamageDice(hammer, 'program')).toBe(3);
    expect(netProgramDamageDice(hammer, 'blackIce')).toBe(2);
    expect(netProgramDamageDice(hammer, 'brain')).toBe(0);
  });

  it('falls back to the Program figure when only one number is given', () => {
    const blade = profile({ effects: { vsProgram: 4 } });
    expect(netProgramDamageDice(blade, 'blackIce')).toBe(4);
  });

  it('refuses a mismatched target — the class is a rule, not a label', () => {
    const antiPersonnel = profile({ target: 'antiPersonnel' });
    const antiProgram = profile({ target: 'antiProgram' });
    expect(netTargetAllowed(antiPersonnel, 'brain')).toBe(true);
    expect(netTargetAllowed(antiPersonnel, 'blackIce')).toBe(false);
    expect(netTargetAllowed(antiProgram, 'blackIce')).toBe(true);
    expect(netTargetAllowed(antiProgram, 'brain')).toBe(false);
    // A Program with no target may be pointed anywhere.
    expect(netTargetAllowed(profile(), 'brain')).toBe(true);
  });

  it('knows a hook-only Program still has something to do to a netrunner', () => {
    const glue = profile({
      target: 'antiPersonnel',
      effects: { hooks: ['glue'], glue: 'd6rounds' },
    });
    expect(netProgramHurts(glue, 'brain')).toBe(true);
    expect(netProgramHurts(glue, 'blackIce')).toBe(false);
    expect(netProgramHurts(profile(), 'brain')).toBe(false);
  });

  it('reads what the GM typed and drops what it does not understand', () => {
    const effects = readNetProgramEffects({
      vsBrain: 2,
      vsProgram: 0,
      hooks: ['burn', 'nonsense'],
      glue: 'forever',
      boost: { value: 2, abilities: ['cloak'] },
      guard: { kind: 'armour', value: 4 },
      destroys: true,
      singleCopy: 'yes',
    });
    expect(effects?.vsBrain).toBe(2);
    expect(effects?.vsProgram).toBeUndefined();
    expect(effects?.hooks).toEqual(['burn']);
    expect(effects?.glue).toBeUndefined();
    expect(effects?.boost).toEqual({ value: 2, abilities: ['cloak'] });
    expect(effects?.guard).toEqual({ kind: 'armour', value: 4 });
    expect(effects?.destroys).toBe(true);
    expect(effects?.singleCopy).toBeUndefined();
  });

  it('says nothing about a Program that carries no mechanics', () => {
    expect(readNetProgramEffects({})).toBeUndefined();
    expect(describeNetProgramEffects(undefined)).toBe('');
    expect(describeNetProgramEffects({ vsBrain: 2, hooks: ['burn'] })).toBe(
      '2k6 w mózg · dek i ubranie płoną',
    );
  });
});

// ─────────────────────────── Programy na deku ───────────────────────────

describe('uruchamianie Programów', () => {
  it('refuses to keep an Aggressor running — it is fired, not held', () => {
    const verdict = netCanRunProgram(freshNetCombat(), {
      id: 'row-1',
      name: 'Miecz',
      profile: profile({ programClass: 'attacker' }),
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.problem).toBe('NET_PROGRAM_IS_ATTACKER');
  });

  it('refuses a second copy of a Defender that allows only one', () => {
    const armour = profile({ programClass: 'defender', rez: 7, effects: { singleCopy: true } });
    const state = netRunProgram(freshNetCombat(), rezzed({ name: 'Pancerz', profile: armour }));
    const verdict = netCanRunProgram(state, { id: 'row-2', name: 'Pancerz', profile: armour });
    expect(verdict.ok === false && verdict.problem).toBe('NET_PROGRAM_SINGLE_COPY');
  });

  it('books „raz na wejście" the moment the copy starts', () => {
    const shield = profile({ programClass: 'defender', rez: 7, effects: { oncePerEntry: true } });
    const state = netRunProgram(freshNetCombat(), rezzed({ name: 'Tarcza', profile: shield }));
    expect(state.spentRows).toEqual(['row-1']);
    const stopped = netStopProgram(state, 'copy-1');
    expect(stopped.rezzed).toHaveLength(0);
    // Stopping does not give the entry back: the row is spent for this run.
    const verdict = netCanRunProgram(stopped, { id: 'row-1', name: 'Tarcza', profile: shield });
    expect(verdict.ok === false && verdict.problem).toBe('NET_PROGRAM_SPENT');
  });

  it('stacks Booster copies rather than taking the best of them', () => {
    const boost = profile({
      programClass: 'booster',
      rez: 7,
      effects: { boost: { value: 2, abilities: ['cloak'] } },
    });
    let state = netRunProgram(freshNetCombat(), rezzed({ profile: boost }));
    state = netRunProgram(state, rezzed({ id: 'copy-2', rowId: 'row-2', profile: boost }));
    expect(netBonusTotal(netAbilityBonuses(state, 'cloak'))).toBe(4);
    expect(netAbilityBonuses(state, 'scout')).toHaveLength(0);
  });

  it('stops counting a Booster once it has been derezzed', () => {
    const boost = profile({
      programClass: 'booster',
      rez: 7,
      effects: { boost: { value: 2, speed: true } },
    });
    const state = netRunProgram(freshNetCombat(), rezzed({ profile: boost, derezzed: true }));
    expect(netSpeedBonuses(state)).toHaveLength(0);
  });

  it('adds up the Pancerz that stands between a Kraken and the brain', () => {
    const armour = profile({
      programClass: 'defender',
      rez: 7,
      effects: { guard: { kind: 'armour', value: 4 } },
    });
    const state = netRunProgram(freshNetCombat(), rezzed({ name: 'Pancerz', profile: armour }));
    expect(netBonusTotal(netBrainArmour(state))).toBe(4);
  });

  it('leaves a Tarcza useless against Black ICE, exactly as RAW does', () => {
    const shield = profile({
      programClass: 'defender',
      rez: 7,
      effects: { guard: { kind: 'shield' } },
    });
    const state = netRunProgram(freshNetCombat(), rezzed({ name: 'Tarcza', profile: shield }));
    expect(netShieldFor(state, { blackIce: true })).toBeNull();
    expect(netShieldFor(state, {})?.name).toBe('Tarcza');
  });
});

// ─────────────────────────── rzuty i obrażenia ───────────────────────────

describe('wymiana ciosów', () => {
  it('builds „Interfejs + ATK Programu przeciw OBR" and nothing else', () => {
    const plan = netProgramAttackPlan({
      interfaceRank: 7,
      program: { name: 'Miecz', profile: profile({ atk: 1, effects: { vsBlackIce: 3 } }) },
      target: { name: 'Kraken', profile: ice().profile, kind: 'blackIce' },
    });
    expect(plan.attack.map((entry) => entry.value)).toEqual([7, 1]);
    expect(plan.defence).toEqual([{ label: 'OBR Kraken', value: 4 }]);
    expect(plan.dice).toBe(3);
  });

  it('gives Paf one die and no Program bonus', () => {
    const plan = netZapPlan({
      interfaceRank: 7,
      target: { name: 'Kraken', profile: ice().profile },
    });
    expect(plan.attack).toEqual([{ label: 'Interfejs 7', value: 7 }]);
    expect(plan.dice).toBe(1);
  });

  it('gives the ICE no Interface of its own on its Turn', () => {
    const plan = netIceAttackPlan({
      ice: ice(),
      defender: { kind: 'brain', name: 'Kolec', interfaceRank: 7 },
    });
    expect(plan.attack).toEqual([{ label: 'ATK Kraken', value: 8 }]);
    expect(plan.defence).toEqual([{ label: 'Interfejs 7', value: 7 }]);
    expect(plan.dice).toBe(3);
  });

  it('rolls the detection contest from the netrunner side, boosts included', () => {
    const state = netRunProgram(
      freshNetCombat(),
      rezzed({
        name: 'Szybki Bil',
        profile: profile({
          programClass: 'booster',
          rez: 7,
          effects: { boost: { value: 2, speed: true } },
        }),
      }),
    );
    const plan = netDetectionPlan({
      interfaceRank: 7,
      speedBonuses: netSpeedBonuses(state),
      ice: ice(),
    });
    expect(netBonusTotal(plan.attack)).toBe(9);
    expect(plan.defence).toEqual([{ label: 'PRĘ Kraken', value: 2 }]);
  });

  it('charges the Ślizg two points for every Skunks that marked the runner', () => {
    const clean = netSlidePlan({ interfaceRank: 7, marks: 0, ice: ice() });
    expect(netBonusTotal(clean.attack)).toBe(7);
    expect(clean.defence).toEqual([{ label: 'PER Kraken', value: 6 }]);

    const marked = netSlidePlan({ interfaceRank: 7, marks: 2, ice: ice() });
    expect(netBonusTotal(marked.attack)).toBe(3);
    expect(marked.attack[1]).toEqual({ label: 'Skunks ×2', value: -4 });
  });

  it('gives the defender the tie — „większy od"', () => {
    expect(netAttackWins(14, 13)).toBe(true);
    expect(netAttackWins(13, 13)).toBe(false);
    expect(netAttackWins(12, 13)).toBe(false);
  });

  it('derezzes a Program at REZ 0 and destroys it only when told to', () => {
    expect(netApplyRez(4, 4, undefined)).toMatchObject({
      after: 0,
      derezzed: true,
      destroyed: false,
    });
    expect(netApplyRez(4, 9, true)).toMatchObject({ after: 0, derezzed: false, destroyed: true });
    expect(netApplyRez(9, 4, undefined)).toMatchObject({ after: 5, derezzed: false });
    // A Program already at 0 is not derezzed twice.
    expect(netApplyRez(0, 6, undefined)).toMatchObject({ after: 0, derezzed: false });
  });

  it('takes a Black ICE out of the fight when its REZ runs out', () => {
    const state = { ...freshNetCombat(), ice: [ice({ rezCurrent: 5 })] };
    const hit = netDamageIce(state, 'ice-1', 6);
    expect(hit.outcome?.derezzed).toBe(true);
    expect(hit.state.ice[0]!.mode).toBe('derezzed');
    expect(netLiveIce(hit.state)).toHaveLength(0);
  });

  it('erases a Program the Smok would only have derezzed', () => {
    const state = { ...freshNetCombat(), rezzed: [rezzed({ rezCurrent: 3 })] };
    const hit = netDamageRezzed(state, 'copy-1', 6, true);
    expect(hit.outcome?.destroyed).toBe(true);
    expect(hit.state.rezzed).toHaveLength(0);
  });
});

// ─────────────────────────── Ślizg i Superklej ───────────────────────────

const SHAFT: CpredNetArchitecture = {
  id: 'net.test',
  name: 'Test',
  difficulty: 'standard',
  branches: [
    {
      id: 'trunk',
      parentFloor: null,
      floors: [
        { id: 'f0', kind: 'empty', label: '' },
        { id: 'f1', kind: 'password', label: 'Hasło', dv: 12 },
        { id: 'f2', kind: 'ice', label: 'LOD', programIds: ['program.kraken'] },
        { id: 'f3', kind: 'file', label: 'Plik', dv: 10 },
      ],
    },
  ],
};

describe('Ślizg', () => {
  it('offers the floor above and the floor below', () => {
    const targets = netSlideDestinations(SHAFT, { branchId: 'trunk', floor: 2 }, ['f1']);
    expect(targets).toEqual([
      { branchId: 'trunk', floor: 1 },
      { branchId: 'trunk', floor: 3 },
    ]);
  });

  it('refuses to flee downwards past a password that still stands', () => {
    const targets = netSlideDestinations(SHAFT, { branchId: 'trunk', floor: 1 }, []);
    // Standing on the unbroken password itself: only up is open.
    expect(targets).toEqual([{ branchId: 'trunk', floor: 0 }]);
  });

  it('has nowhere to go from the top of a one-floor shaft', () => {
    const single: CpredNetArchitecture = {
      ...SHAFT,
      branches: [
        { id: 'trunk', parentFloor: null, floors: [{ id: 'f0', kind: 'empty', label: '' }] },
      ],
    };
    expect(netSlideDestinations(single, { branchId: 'trunk', floor: 0 }, [])).toEqual([]);
  });

  it('allows one attempt per Turn, and any number outside combat', () => {
    const used = { ...freshNetCombat(), slideRound: 3 };
    expect(netCanSlide(used, 3)).toBe(false);
    expect(netCanSlide(used, 4)).toBe(true);
    expect(netCanSlide(used, null)).toBe(true);
  });
});

describe('Superklej', () => {
  it('holds until its round and then lets go', () => {
    const glued = { ...freshNetCombat(), glue: { source: 'Superklej', untilRound: 5 } };
    expect(netGlueHolds(glued, 4)).toBe(true);
    expect(netGlueHolds(glued, 5)).toBe(true);
    expect(netGlueHolds(glued, 6)).toBe(false);
  });

  it('holds indefinitely when there are no rounds to count', () => {
    const glued = { ...freshNetCombat(), glue: { source: 'Kraken', untilRound: null } };
    expect(netGlueHolds(glued, null)).toBe(true);
    expect(netGlueHolds(freshNetCombat(), 3)).toBe(false);
  });

  it('only ever stops the way down', () => {
    const from = { branchId: 'trunk', floor: 2 };
    expect(netMoveGoesDeeper(SHAFT, from, { branchId: 'trunk', floor: 3 })).toBe(true);
    expect(netMoveGoesDeeper(SHAFT, from, { branchId: 'trunk', floor: 0 })).toBe(false);
  });
});

// ─────────────────────────── rachunek i losowanie ───────────────────────────

describe('rachunek za awaryjne odłączenie', () => {
  it('bills every ICE still running, and never the one that threw you out', () => {
    const state = {
      ...freshNetCombat(),
      ice: [
        ice({ id: 'ice-1', mode: 'hunting' }),
        ice({ id: 'ice-2', mode: 'derezzed' }),
        ice({ id: 'ice-3', mode: 'lurking' }),
      ],
    };
    expect(netJackOutBill(state).map((entry) => entry.id)).toEqual(['ice-1', 'ice-3']);
    expect(netJackOutBill(state, 'ice-1').map((entry) => entry.id)).toEqual(['ice-3']);
  });

  it('leaves a run with nothing running owing nothing', () => {
    expect(netJackOutBill(freshNetCombat())).toEqual([]);
  });
});

describe('losowanie celów', () => {
  const state = {
    ...freshNetCombat(),
    rezzed: [
      rezzed({ id: 'a', rowId: 'row-a', name: 'Gumka' }),
      rezzed({
        id: 'b',
        rowId: 'row-b',
        name: 'Pancerz',
        profile: profile({ programClass: 'defender', rez: 7 }),
      }),
      rezzed({ id: 'c', rowId: 'row-c', name: 'Zderezowany', derezzed: true }),
    ],
  };

  it('picks only from what is actually running', () => {
    expect(netRandomRezzed(state, () => 1)?.name).toBe('Gumka');
    expect(netRandomRezzed(state, () => 2)?.name).toBe('Pancerz');
    expect(netRandomRezzed(freshNetCombat(), () => 1)).toBeNull();
  });

  it('derezzes only Defenders when the Kruk lands', () => {
    expect(netRandomDefender(state, () => 1)?.name).toBe('Pancerz');
  });

  it('never erases a Black ICE off the deck — the rule names ordinary Programs', () => {
    const rows = [
      { id: 'row-a', profile: profile({ blackIce: true }) },
      { id: 'row-b', profile: profile() },
    ];
    expect(netRandomDeckProgram(rows, () => 1)?.id).toBe('row-b');
    expect(netRandomDeckProgram([rows[0]!], () => 1)).toBeNull();
  });
});

// ─────────────────────────── budżet i odczyt ───────────────────────────

describe('Akcje Sieciowe po Mózgoklepie', () => {
  it('takes one off but never goes below two', () => {
    expect(netActionsAfterDebt(4, 1)).toBe(3);
    expect(netActionsAfterDebt(3, 2)).toBe(NET_ACTIONS_FLOOR);
    expect(netActionsAfterDebt(2, 5)).toBe(2);
    expect(netActionsAfterDebt(4, 0)).toBe(4);
  });

  it('never lifts a bundle above what the Interface bought', () => {
    expect(netActionsAfterDebt(1, 3)).toBe(1);
  });
});

describe('odczyt stanu', () => {
  it('reads a fight back, and a broken column as a fresh one', () => {
    const stored = {
      rezzed: [rezzed(), { rowId: 'x' }],
      ice: [ice(), { id: 'broken' }],
      spentRows: ['row-1', 7],
      slideRound: 4,
      glue: { source: 'Superklej', untilRound: 6 },
      netActionDebt: 2,
      slideMarks: ['ice-9'],
    };
    const state = readNetCombatState(stored);
    expect(state.rezzed).toHaveLength(1);
    expect(state.ice).toHaveLength(1);
    expect(state.spentRows).toEqual(['row-1']);
    expect(state.slideRound).toBe(4);
    expect(state.glue).toEqual({ source: 'Superklej', untilRound: 6 });
    expect(state.netActionDebt).toBe(2);
    expect(state.slideMarks).toEqual(['ice-9']);
    expect(readNetCombatState('nonsense')).toEqual(freshNetCombat());
    expect(readNetCombatState(null)).toEqual(freshNetCombat());
  });
});

describe('widok dla klienta', () => {
  const state = {
    ...freshNetCombat(),
    ice: [ice({ mode: 'hunting', detected: true, rezCurrent: 12 })],
  };
  const deck = [
    { id: 'row-a', name: 'Miecz', profile: profile({ atk: 1, effects: { vsBlackIce: 3 } }) },
    {
      id: 'row-b',
      name: 'Superklej',
      profile: profile({ target: 'antiPersonnel', effects: { hooks: ['glue'] } }),
    },
  ];

  it('keeps the ICE numbers with the GM and gives the player the REZ bar', () => {
    const player = netCombatView(state, {
      deck,
      gm: false,
      currentFloorId: 'f3',
      describeEffect: (entry) => describeNetProgramEffects(entry.effects),
    });
    expect(player.ice[0]).toMatchObject({ name: 'Kraken', rezCurrent: 12, rezMax: 30, here: true });
    expect(player.ice[0]!.atk).toBeUndefined();
    expect(player.ice[0]!.per).toBeUndefined();
    // Met it already, so what it does is no longer a secret.
    expect(player.ice[0]!.effect).toBe('3k6 w mózg');

    const gm = netCombatView(state, {
      deck,
      gm: true,
      currentFloorId: 'f0',
      describeEffect: (entry) => describeNetProgramEffects(entry.effects),
    });
    expect(gm.ice[0]).toMatchObject({ atk: 8, def: 4, per: 6, speed: 2, here: false });
  });

  it('hides what an unmet Black ICE does', () => {
    const view = netCombatView(
      { ...freshNetCombat(), ice: [ice()] },
      { deck: [], gm: false, currentFloorId: null, describeEffect: () => '3k6 w mózg' },
    );
    expect(view.ice[0]!.effect).toBeUndefined();
  });

  it('says which deck rows have anything to say to a Black ICE', () => {
    const view = netCombatView(state, {
      deck,
      gm: false,
      currentFloorId: 'f3',
      describeEffect: () => '',
    });
    expect(view.deck.find((slot) => slot.name === 'Miecz')?.vsIce).toBe(3);
    expect(view.deck.find((slot) => slot.name === 'Superklej')?.vsIce).toBe(0);
  });
});
