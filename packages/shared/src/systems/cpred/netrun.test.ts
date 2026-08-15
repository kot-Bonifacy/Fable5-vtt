import { describe, expect, it } from 'vitest';
import type { CpredNetArchitecture } from './netrunning.js';
import {
  NET_ABILITIES,
  NET_ABILITIES_AVAILABLE,
  cpredInterfaceRank,
  freshNetRun,
  netAbility,
  netCanMove,
  netChildren,
  netEntryPosition,
  netFloorAt,
  netIsBottom,
  netMove,
  netMoveRefusal,
  netParent,
  netRunPath,
  netRunView,
  netScoutReveal,
  netShaftRungs,
  readNetRunState,
  readNetRuntime,
} from './netrun.js';
import { freshNetCombat, netCombatView, type NetCombatView } from './netcombat.js';
import { buildCpredRegistry } from './character.js';
import {
  CPRED_ACTION_NET,
  cpredTurnBudget,
  forceCpredTurn,
  freshCpredTurn,
  readCpredTurn,
  spendCpredTurn,
} from './turn.js';

/**
 * Stage 26b. The architecture below is invented, like every other fixture in
 * this package — no rulebook rows in the repository.
 *
 * Its shape matters, though, and is worth reading once: a five-floor trunk with
 * a password on floor 1, and a two-floor branch hanging off that same floor 1.
 * That is the smallest build in which „nie możesz ominąć przeszkody" has teeth —
 * the branch sits *below* the password, so nothing in it is reachable until the
 * password falls.
 */
const ARCHITECTURE: CpredNetArchitecture = {
  id: 'net.magazyn',
  name: 'Sieć magazynu',
  difficulty: 'standard',
  branches: [
    {
      id: 'trunk',
      parentFloor: null,
      floors: [
        { id: 'f0', kind: 'empty', label: 'Lobby' },
        { id: 'f1', kind: 'password', label: 'Hasło serwisowe', dv: 8 },
        { id: 'f2', kind: 'file', label: 'Listy przewozowe', dv: 6, notes: 'Manifest przemytu' },
        { id: 'f3', kind: 'controlNode', label: 'Kamery', dv: 10 },
        { id: 'f4', kind: 'ice', label: 'Strażnik', programIds: ['program.osa'] },
      ],
    },
    {
      id: 'b1',
      name: 'Księgowość',
      parentFloor: 1,
      floors: [
        { id: 'g0', kind: 'empty', label: 'Poczekalnia' },
        { id: 'g1', kind: 'file', label: 'Faktury', dv: 7 },
      ],
    },
  ],
};

const TOP = { branchId: 'trunk', floor: 0 };

function runAt(
  position: { branchId: string; floor: number },
  extra: Partial<ReturnType<typeof freshNetRun>> = {},
) {
  const floor = netFloorAt(ARCHITECTURE, position);
  return { ...freshNetRun(position, floor?.id ?? ''), ...extra };
}

describe('kształt szybu', () => {
  it('places every floor at its depth, branches included', () => {
    const rungs = netShaftRungs(ARCHITECTURE);
    expect(rungs).toHaveLength(7);
    expect(rungs.find((rung) => rung.floor.id === 'f3')?.depth).toBe(3);
    // „Odgałęzienie wyrasta poniżej piętra rodzica" — g0 hangs under trunk f1.
    expect(rungs.find((rung) => rung.floor.id === 'g0')?.depth).toBe(2);
    expect(rungs.find((rung) => rung.floor.id === 'g1')?.branchName).toBe('Księgowość');
  });

  it('starts a run at the top of the trunk', () => {
    expect(netEntryPosition(ARCHITECTURE)).toEqual(TOP);
    expect(netEntryPosition({ ...ARCHITECTURE, branches: [] })).toBeNull();
  });

  it('treats the shaft as a tree: one parent, two ways down at a junction', () => {
    expect(netParent(ARCHITECTURE, TOP)).toBeNull();
    expect(netParent(ARCHITECTURE, { branchId: 'b1', floor: 0 })).toEqual({
      branchId: 'trunk',
      floor: 1,
    });
    expect(netChildren(ARCHITECTURE, { branchId: 'trunk', floor: 1 })).toEqual([
      { branchId: 'trunk', floor: 2 },
      { branchId: 'b1', floor: 0 },
    ]);
  });

  it('routes between two floors up to the junction and back down', () => {
    const path = netRunPath(
      ARCHITECTURE,
      { branchId: 'trunk', floor: 3 },
      {
        branchId: 'b1',
        floor: 1,
      },
    );
    expect(path).toEqual([
      { branchId: 'trunk', floor: 2 },
      { branchId: 'trunk', floor: 1 },
      { branchId: 'b1', floor: 0 },
      { branchId: 'b1', floor: 1 },
    ]);
  });

  it('has exactly one bottom, and it is the deepest trunk floor', () => {
    expect(netIsBottom(ARCHITECTURE, { branchId: 'trunk', floor: 4 })).toBe(true);
    expect(netIsBottom(ARCHITECTURE, { branchId: 'b1', floor: 1 })).toBe(false);
  });

  it('has no bottom when two branches tie for the deepest floor', () => {
    const tied: CpredNetArchitecture = {
      ...ARCHITECTURE,
      branches: [
        ARCHITECTURE.branches[0]!,
        {
          ...ARCHITECTURE.branches[1]!,
          floors: [
            ...ARCHITECTURE.branches[1]!.floors,
            { id: 'g2', kind: 'empty', label: '' },
            { id: 'g3', kind: 'empty', label: '' },
          ],
        },
      ],
    };
    expect(netIsBottom(tied, { branchId: 'trunk', floor: 4 })).toBe(false);
  });
});

describe('ruch po piętrach', () => {
  it('refuses to walk past a password nobody has broken', () => {
    const verdict = netCanMove(ARCHITECTURE, runAt(TOP), { branchId: 'trunk', floor: 3 });
    expect(verdict.ok).toBe(false);
    expect(verdict.problem).toBe('NET_PASSWORD_BLOCKS');
    expect(netMoveRefusal(verdict)).toContain('Hasło serwisowe (PT 8)');
  });

  it('lets the lift stop *on* the password — otherwise nobody could ever break it', () => {
    const verdict = netCanMove(ARCHITECTURE, runAt(TOP), { branchId: 'trunk', floor: 1 });
    expect(verdict.ok).toBe(true);
    expect(verdict.path).toEqual([{ branchId: 'trunk', floor: 1 }]);
  });

  it('opens the whole shaft once the password is broken', () => {
    const state = runAt(TOP, { broken: ['f1'] });
    const verdict = netCanMove(ARCHITECTURE, state, { branchId: 'b1', floor: 1 });
    expect(verdict.ok).toBe(true);
    const moved = netMove(state, verdict.path!, ['f1', 'g0', 'g1']);
    expect(moved.position).toEqual({ branchId: 'b1', floor: 1 });
    // Every floor walked through is entered, not only the destination.
    expect(moved.entered).toEqual(expect.arrayContaining(['f0', 'f1', 'g0', 'g1']));
  });

  it('refuses a floor that is not in this architecture', () => {
    const verdict = netCanMove(ARCHITECTURE, runAt(TOP), { branchId: 'b9', floor: 0 });
    expect(verdict.ok).toBe(false);
    expect(verdict.problem).toBe('NET_NO_SUCH_FLOOR');
  });
});

describe('Zwiad', () => {
  it('shows as many floors as the Check, both ways down at a junction', () => {
    // A total of 9 beats the DV 8 password, so nothing blocks the view.
    const revealed = netScoutReveal(ARCHITECTURE, runAt(TOP), 9);
    expect(revealed).toEqual(['f1', 'f2', 'g0', 'f3', 'g1', 'f4']);
  });

  it('stops at the first password whose DV the Check did not reach', () => {
    const revealed = netScoutReveal(ARCHITECTURE, runAt(TOP), 5);
    // The password itself is seen — it is what the netrunner is looking at.
    expect(revealed).toEqual(['f1']);
  });

  it('sees past a password that has already been broken', () => {
    const revealed = netScoutReveal(ARCHITECTURE, runAt(TOP, { broken: ['f1'] }), 3);
    expect(revealed).toEqual(['f1', 'f2', 'g0']);
  });

  it('counts floors it already knew towards the total', () => {
    const state = runAt(TOP, { broken: ['f1'], scouted: ['f1', 'f2'] });
    // Budget 3: f1 and f2 are already known but still count, so only g0 is news.
    expect(netScoutReveal(ARCHITECTURE, state, 3)).toEqual(['g0']);
  });

  it('reveals nothing on a failed Check of zero', () => {
    expect(netScoutReveal(ARCHITECTURE, runAt(TOP), 0)).toEqual([]);
  });
});

/** Stage 26c rides on the same payload; these cases are about 26b's half. */
const NO_FIGHT: NetCombatView = netCombatView(freshNetCombat(), {
  deck: [],
  gm: false,
  currentFloorId: null,
  describeEffect: () => '',
});

describe('widok filtrowany', () => {
  const state = runAt(TOP, {
    entered: ['f0', 'f1'],
    scouted: ['f2'],
    broken: ['f1'],
    identified: [],
  });

  it('never puts an unopened floor in a player payload', () => {
    const view = netRunView(ARCHITECTURE, state, { gm: false, netActionsMax: 3, combat: NO_FIGHT });
    const hidden = view.branches[0]!.floors.find((floor) => floor.id === 'f3')!;
    expect(hidden.knowledge).toBe('hidden');
    expect(hidden.kind).toBeNull();
    expect(JSON.stringify(hidden)).not.toContain('Kamery');
  });

  it('gives a scouted floor its kind but not its DV', () => {
    const view = netRunView(ARCHITECTURE, state, { gm: false, netActionsMax: 3, combat: NO_FIGHT });
    const scouted = view.branches[0]!.floors.find((floor) => floor.id === 'f2')!;
    expect(scouted.knowledge).toBe('scouted');
    expect(scouted.kind).toBe('file');
    expect(scouted.label).toBe('Listy przewozowe');
    expect(scouted.dv).toBeUndefined();
  });

  it('keeps the GM note off a File until Ajdi succeeds', () => {
    const before = netRunView(
      ARCHITECTURE,
      { ...state, entered: ['f0', 'f1', 'f2'] },
      { gm: false, netActionsMax: 3, combat: NO_FIGHT },
    );
    expect(before.branches[0]!.floors.find((floor) => floor.id === 'f2')?.notes).toBeUndefined();

    const after = netRunView(
      ARCHITECTURE,
      { ...state, entered: ['f0', 'f1', 'f2'], identified: ['f2'] },
      { gm: false, netActionsMax: 3, combat: NO_FIGHT },
    );
    expect(after.branches[0]!.floors.find((floor) => floor.id === 'f2')?.notes).toBe(
      'Manifest przemytu',
    );
  });

  it('shows the GM everything, whatever the netrunner has found', () => {
    const view = netRunView(ARCHITECTURE, state, { gm: true, netActionsMax: 3, combat: NO_FIGHT });
    const floor = view.branches[0]!.floors.find((entry) => entry.id === 'f3')!;
    expect(floor.knowledge).toBe('entered');
    expect(floor.dv).toBe(10);
    expect(view.branches[1]!.floors[1]!.label).toBe('Faktury');
  });

  it('marks where the netrunner is standing', () => {
    const view = netRunView(ARCHITECTURE, state, { gm: false, netActionsMax: 3, combat: NO_FIGHT });
    expect(view.branches[0]!.floors.filter((floor) => floor.here)).toHaveLength(1);
    expect(view.branches[0]!.floors[0]!.here).toBe(true);
  });
});

describe('Interfejs jako warunek wejścia', () => {
  const registry = buildCpredRegistry(
    { skills: [] },
    {
      roles: [
        { id: 'netrunner', name: 'Netrunner', ability: 'Interfejs' },
        { id: 'solo', name: 'Solo', ability: 'Zmysł Walki' },
      ],
    },
  );

  it('reads the rank off a Netrunner sheet', () => {
    expect(cpredInterfaceRank({ roleId: 'netrunner', roleAbilityRank: 6 }, registry)).toBe(6);
  });

  it('answers null for a role whose ability is something else', () => {
    expect(cpredInterfaceRank({ roleId: 'solo', roleAbilityRank: 8 }, registry)).toBeNull();
    expect(cpredInterfaceRank({ roleId: null, roleAbilityRank: 8 }, registry)).toBeNull();
  });
});

describe('katalog zdolności', () => {
  it('holds all nine, and hands stage 26b the seven it can resolve', () => {
    expect(NET_ABILITIES).toHaveLength(9);
    expect(NET_ABILITIES_AVAILABLE.map((entry) => entry.id)).toEqual([
      'scanner',
      'backdoor',
      'scout',
      'eyed',
      'control',
      'cloak',
      'virus',
    ]);
  });

  it('marks the Scanner as the one ability that is not a Net Action', () => {
    expect(netAbility('scanner')?.cost).toBe('soma');
    expect(netAbility('backdoor')?.cost).toBe('net');
    expect(netAbility('nope')).toBeUndefined();
  });
});

describe('budżet Akcji Sieciowych', () => {
  it('spends the turn Action on the first one and counts the rest inside it', () => {
    let turn = freshCpredTurn();
    const first = spendCpredTurn(turn, { kind: 'net', label: 'Zwiad', max: 3 });
    expect(first.ok).toBe(true);
    turn = (first as { state: typeof turn }).state;
    expect(turn.action?.id).toBe(CPRED_ACTION_NET);
    expect(turn.action?.net).toEqual({ count: 1, max: 3, labels: ['Zwiad'] });

    const second = spendCpredTurn(turn, { kind: 'net', label: 'Backdoor', max: 3 });
    turn = (second as { state: typeof turn }).state;
    const third = spendCpredTurn(turn, { kind: 'net', label: 'Ajdi', max: 3 });
    turn = (third as { state: typeof turn }).state;
    expect(turn.action?.net?.count).toBe(3);

    const fourth = spendCpredTurn(turn, { kind: 'net', label: 'Kontrola', max: 3 });
    expect(fourth).toEqual({ ok: false, error: 'NO_NET_ACTIONS_LEFT' });
  });

  it('refuses a Net Action once the turn Action went to something else', () => {
    const turn = spendCpredTurn(freshCpredTurn(), { kind: 'action', actionId: 'reload' });
    const attempt = spendCpredTurn((turn as { state: ReturnType<typeof freshCpredTurn> }).state, {
      kind: 'net',
      label: 'Zwiad',
      max: 3,
    });
    expect(attempt).toEqual({ ok: false, error: 'NO_ACTION_LEFT' });
  });

  it('refuses an attack once the turn went netrunning — „albo Soma, albo Sieć"', () => {
    const turn = spendCpredTurn(freshCpredTurn(), { kind: 'net', label: 'Zwiad', max: 3 });
    const attempt = spendCpredTurn((turn as { state: ReturnType<typeof freshCpredTurn> }).state, {
      kind: 'attack',
      weaponRowId: 'w1',
      weaponName: 'Zgrzyt 9',
      rof: 2,
    });
    expect(attempt).toEqual({ ok: false, error: 'NO_ACTION_LEFT' });
  });

  it('leaves the Move Action alone — „zawsze można wykonać Akcję Ruchu"', () => {
    const turn = spendCpredTurn(freshCpredTurn({ metresPerMove: 12 }), {
      kind: 'net',
      label: 'Zwiad',
      max: 2,
    });
    const moved = spendCpredTurn((turn as { state: ReturnType<typeof freshCpredTurn> }).state, {
      kind: 'move',
      metres: 5,
    });
    expect(moved.ok).toBe(true);
  });

  it('shows „Sieć 1/3" in the tracker only once a Net Action was spent', () => {
    expect(cpredTurnBudget(freshCpredTurn()).resources.map((r) => r.id)).not.toContain('net');
    const turn = spendCpredTurn(freshCpredTurn(), { kind: 'net', label: 'Zwiad', max: 3 });
    const budget = cpredTurnBudget((turn as { state: ReturnType<typeof freshCpredTurn> }).state);
    expect(budget.resources.find((resource) => resource.id === 'net')).toEqual({
      id: 'net',
      label: 'Sieć',
      used: 1,
      max: 3,
    });
    expect(budget.note).toContain('Akcje Sieciowe: Zwiad');
  });

  it('lets the GM force one past the ceiling and counts the overspend', () => {
    let turn = freshCpredTurn();
    turn = forceCpredTurn(turn, { kind: 'net', label: 'Zwiad', max: 1 });
    turn = forceCpredTurn(turn, { kind: 'net', label: 'Backdoor', max: 1 });
    expect(turn.action?.net?.count).toBe(2);
    expect(turn.overspent).toBe(1);
  });

  it('survives a round trip through the database column', () => {
    const turn = spendCpredTurn(freshCpredTurn(), { kind: 'net', label: 'Zwiad', max: 4 });
    const stored = JSON.stringify((turn as { state: ReturnType<typeof freshCpredTurn> }).state);
    expect(readCpredTurn(stored).action?.net).toEqual({ count: 1, max: 4, labels: ['Zwiad'] });
  });
});

describe('odczyt stanu z bazy', () => {
  it('reads a stored run back whole', () => {
    const state = runAt({ branchId: 'b1', floor: 1 }, { broken: ['f1'], copied: ['g1'] });
    expect(readNetRunState(JSON.stringify(state))).toEqual(state);
  });

  it('answers null rather than throwing on a row it cannot read', () => {
    expect(readNetRunState('{{')).toBeNull();
    expect(readNetRunState({ position: { branchId: 'trunk' } })).toBeNull();
  });

  it('reads the traces a run leaves behind the architecture', () => {
    const runtime = readNetRuntime(
      JSON.stringify({
        maskDv: 16,
        maskedBy: 'Kolec',
        viruses: [
          {
            id: 'v1',
            description: 'Zmienia hasła co 5 minut',
            dv: 15,
            author: 'Kolec',
            createdAt: '2026-08-15',
          },
          { id: 'broken', dv: 'nie liczba' },
        ],
      }),
    );
    expect(runtime.maskDv).toBe(16);
    expect(runtime.viruses).toHaveLength(1);
    expect(runtime.viruses[0]?.dv).toBe(15);
  });
});
