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
  netMoveAllowedFor,
  netMoveRefusal,
  netParent,
  netRunPath,
  netRunView,
  netScoutReveal,
  netShaftRungs,
  readNetRunState,
  readNetRuntime,
  netClearTries,
  netForgetScene,
  netCloakState,
  netCloaksOf,
  netLeaveCloaks,
  netRecordCloak,
  netForgetHold,
  netRememberRun,
  netRememberVisited,
  netVisitedOf,
  netRestoreRun,
  netTriesOf,
  netTrySpent,
  netTrySpentBy,
  netRecordTry,
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

  it('holds a netrunner standing on the unbroken password — down, not up (#31)', () => {
    const onPassword = runAt({ branchId: 'trunk', floor: 1 });
    const down = netCanMove(ARCHITECTURE, onPassword, { branchId: 'trunk', floor: 2 });
    expect(down.ok).toBe(false);
    expect(down.problem).toBe('NET_PASSWORD_BLOCKS');
    expect(down.blockedBy?.id).toBe('f1');
    // The branch hangs off the password floor, so it is below it too.
    expect(netCanMove(ARCHITECTURE, onPassword, { branchId: 'b1', floor: 0 }).ok).toBe(false);
    expect(netCanMove(ARCHITECTURE, onPassword, TOP).ok).toBe(true);
    const broken = runAt({ branchId: 'trunk', floor: 1 }, { broken: ['f1'] });
    expect(netCanMove(ARCHITECTURE, broken, { branchId: 'trunk', floor: 2 }).ok).toBe(true);
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
  it('shows only the next floor, however high the Check', () => {
    expect(netScoutReveal(ARCHITECTURE, runAt(TOP), 24)).toEqual(['f1']);
  });

  it('shows every way down at a junction — the next trunk floor and the branch', () => {
    const state = runAt({ branchId: 'trunk', floor: 1 }, { broken: ['f1'] });
    expect(netScoutReveal(ARCHITECTURE, state, 3)).toEqual(['f2', 'g0']);
  });

  it('needs the DV of an unbroken password underfoot to see through it', () => {
    const onPassword = runAt({ branchId: 'trunk', floor: 1 });
    expect(netScoutReveal(ARCHITECTURE, onPassword, 7)).toEqual([]);
    expect(netScoutReveal(ARCHITECTURE, onPassword, 8)).toEqual(['f2', 'g0']);
  });

  it('reports only what is news', () => {
    const state = runAt({ branchId: 'trunk', floor: 1 }, { broken: ['f1'], scouted: ['f2'] });
    expect(netScoutReveal(ARCHITECTURE, state, 10)).toEqual(['g0']);
  });

  it('has nothing to show from the bottom of a shaft', () => {
    expect(netScoutReveal(ARCHITECTURE, runAt({ branchId: 'b1', floor: 1 }), 20)).toEqual([]);
  });
});

/** Stage 26c rides on the same payload; these cases are about 26b's half. */
const NO_FIGHT: NetCombatView = netCombatView(freshNetCombat(), {
  deck: [],
  gm: false,
  currentFloorId: null,
  describeEffect: () => '',
});

describe('widok filtrowany — jedno piętro (etap 70a)', () => {
  const state = runAt(TOP, {
    entered: ['f0', 'f1'],
    scouted: ['f2'],
    broken: ['f1'],
    identified: [],
  });
  const player = { gm: false, netActionsMax: 3, combat: NO_FIGHT };
  const gm = { gm: true, netActionsMax: 3, combat: NO_FIGHT };

  it('gives a player the floor underfoot and no shaft at all', () => {
    const view = netRunView(ARCHITECTURE, state, player);
    expect(view.here?.id).toBe('f0');
    expect(view.here?.here).toBe(true);
    expect(view.shaft).toBeUndefined();
    expect('branches' in view).toBe(false);
    expect('sightedDevices' in view).toBe(false);
    const wire = JSON.stringify(view);
    // Nothing of the floors below the next door: no id, no label, no branch.
    for (const secret of ['f3', 'f4', 'g0', 'g1', 'Kamery', 'Strażnik', 'Faktury', 'Księgowość']) {
      expect(wire).not.toContain(secret);
    }
  });

  it('shows one exit per floor directly below, the unknown one bare', () => {
    const top = netRunView(ARCHITECTURE, runAt(TOP), player);
    expect(top.exits.up).toBeNull();
    expect(top.exits.down).toEqual([{ to: { branchId: 'trunk', floor: 1 }, knowledge: 'unknown' }]);

    const junction = netRunView(
      ARCHITECTURE,
      runAt({ branchId: 'trunk', floor: 1 }, { entered: ['f0', 'f1'], broken: ['f1'] }),
      player,
    );
    expect(junction.exits.up).toEqual(TOP);
    expect(junction.exits.down).toEqual([
      { to: { branchId: 'trunk', floor: 2 }, knowledge: 'unknown' },
      { to: { branchId: 'b1', floor: 0 }, knowledge: 'unknown', branch: true },
    ]);
  });

  it('gives a scouted exit its kind and label but never its DV', () => {
    const view = netRunView(
      ARCHITECTURE,
      runAt(
        { branchId: 'trunk', floor: 1 },
        { entered: ['f0', 'f1'], broken: ['f1'], scouted: ['f2', 'g0'] },
      ),
      player,
    );
    expect(view.exits.down).toEqual([
      {
        to: { branchId: 'trunk', floor: 2 },
        knowledge: 'scouted',
        kind: 'file',
        label: 'Listy przewozowe',
      },
      {
        to: { branchId: 'b1', floor: 0 },
        knowledge: 'scouted',
        branch: true,
        kind: 'empty',
        label: 'Poczekalnia',
        branchName: 'Księgowość',
      },
    ]);
    expect(JSON.stringify(view.exits)).not.toContain('"dv"');
  });

  it('names the Programs behind a scouted exit, never behind an unknown one', () => {
    // RAW s. 200, the Ślizg example: „czeka tam na niego kolejny Piekielny Ogar.
    // Trzeba było wykonać Zwiad!” — Zwiad says *which* Black ICE waits below.
    const names = { programNameOf: (id: string) => (id === 'program.osa' ? 'Osa' : undefined) };
    const at = { branchId: 'trunk', floor: 3 };
    const unknown = netRunView(ARCHITECTURE, runAt(at, { entered: ['f0', 'f1', 'f2', 'f3'] }), {
      ...player,
      ...names,
    });
    expect(unknown.exits.down).toEqual([
      { to: { branchId: 'trunk', floor: 4 }, knowledge: 'unknown' },
    ]);
    const scouted = netRunView(
      ARCHITECTURE,
      runAt(at, { entered: ['f0', 'f1', 'f2', 'f3'], scouted: ['f4'] }),
      { ...player, ...names },
    );
    expect(scouted.exits.down).toEqual([
      {
        to: { branchId: 'trunk', floor: 4 },
        knowledge: 'scouted',
        kind: 'ice',
        label: 'Strażnik',
        programs: ['Osa'],
      },
    ]);
    // Stats and catalogue ids stay on the server.
    expect(JSON.stringify(scouted.exits)).not.toContain('program.osa');
  });

  it('marks every way down blocked while the password underfoot holds', () => {
    const held = netRunView(
      ARCHITECTURE,
      runAt({ branchId: 'trunk', floor: 1 }, { entered: ['f0', 'f1'] }),
      player,
    );
    expect(held.exits.down.map((exit) => exit.blocked)).toEqual([true, true]);
    const open = netRunView(
      ARCHITECTURE,
      runAt({ branchId: 'trunk', floor: 1 }, { entered: ['f0', 'f1'], broken: ['f1'] }),
      player,
    );
    expect(open.exits.down.some((exit) => exit.blocked)).toBe(false);
  });

  it('has no way down at the end of a column', () => {
    const view = netRunView(
      ARCHITECTURE,
      runAt({ branchId: 'b1', floor: 1 }, { entered: ['f0', 'f1', 'g0', 'g1'], broken: ['f1'] }),
      player,
    );
    expect(view.exits.down).toEqual([]);
    expect(view.exits.up).toEqual({ branchId: 'b1', floor: 0 });
  });

  it('allows a Virus on the bottom only', () => {
    const bottom = netRunView(
      ARCHITECTURE,
      runAt({ branchId: 'trunk', floor: 4 }, { broken: ['f1'] }),
      player,
    );
    expect(bottom.here?.virusAllowed).toBe(true);
    const blindBranch = netRunView(
      ARCHITECTURE,
      runAt({ branchId: 'b1', floor: 1 }, { broken: ['f1'] }),
      player,
    );
    expect(blindBranch.here?.virusAllowed).toBeUndefined();
    expect(netRunView(ARCHITECTURE, state, player).here?.virusAllowed).toBeUndefined();
  });

  it('lays the trail from the top to the floor underfoot, side trips after it', () => {
    const view = netRunView(
      ARCHITECTURE,
      runAt(
        { branchId: 'trunk', floor: 2 },
        { entered: ['f0', 'f1', 'g0', 'f2'], broken: ['f1'], copied: ['f2'] },
      ),
      player,
    );
    expect(view.trail.map((step) => step.id)).toEqual(['f0', 'f1', 'f2', 'g0']);
    expect(view.trail.map((step) => step.onPath)).toEqual([true, true, true, false]);
    expect(view.trail[1]).toMatchObject({ kind: 'password', broken: true, depth: 1 });
    expect(view.trail[2]).toMatchObject({ here: true, copied: true });
    // The trail is a way back, not a dossier: no DV travels with it.
    expect(JSON.stringify(view.trail)).not.toContain('"dv"');
  });

  it('keeps the GM note off a File until Ajdi succeeds', () => {
    const onFile = { branchId: 'trunk', floor: 2 };
    const before = netRunView(
      ARCHITECTURE,
      runAt(onFile, { entered: ['f0', 'f1', 'f2'], broken: ['f1'] }),
      player,
    );
    expect(before.here?.notes).toBeUndefined();
    expect(before.here?.dv).toBe(6);
    const after = netRunView(
      ARCHITECTURE,
      runAt(onFile, { entered: ['f0', 'f1', 'f2'], broken: ['f1'], identified: ['f2'] }),
      player,
    );
    expect(after.here?.notes).toBe('Manifest przemytu');
  });

  it('names the devices of the node underfoot before Kontrola, hands them over after', () => {
    const onNode = { branchId: 'trunk', floor: 3 };
    const sighted = [{ name: 'Kamera nad bramą', deviceKind: 'camera' as const }];
    const devicesOf = () => [
      { id: 'cam', name: 'Kamera 1', deviceKind: 'camera' as const, on: true, operations: [] },
    ];
    const before = netRunView(ARCHITECTURE, runAt(onNode, { broken: ['f1'] }), {
      ...player,
      nodeDevices: sighted,
      devicesOf,
    });
    expect(before.nodeDevices).toEqual(sighted);
    expect(before.here?.devices).toBeUndefined();

    const held = runAt(onNode, { broken: ['f1'], controlled: [{ floorId: 'f3', dv: 14 }] });
    const after = netRunView(ARCHITECTURE, held, { ...player, nodeDevices: sighted, devicesOf });
    expect(after.nodeDevices).toBeUndefined();
    expect(after.here?.devices).toHaveLength(1);

    // …and off the node the list is gone, while the held node keeps its devices
    // on the trail — the netrunner works them from wherever they stand.
    const away = netRunView(
      ARCHITECTURE,
      { ...held, position: TOP, entered: ['f0', 'f1', 'f2', 'f3'] },
      { ...player, nodeDevices: sighted, devicesOf },
    );
    expect(away.nodeDevices).toBeUndefined();
    expect(away.trail.find((step) => step.id === 'f3')?.devices).toHaveLength(1);
  });

  it('shows the GM the whole shaft, whatever the netrunner has found', () => {
    const view = netRunView(ARCHITECTURE, state, gm);
    const floor = view.shaft![0]!.floors.find((entry) => entry.id === 'f3')!;
    expect(floor.knowledge).toBe('entered');
    expect(floor.dv).toBe(10);
    expect(view.shaft![1]!.floors[1]!.label).toBe('Faktury');
    expect(view.shaft![0]!.floors.filter((entry) => entry.here)).toHaveLength(1);
    // The GM's exits say what is behind the door, the netrunner's knowledge honestly.
    expect(view.exits.down[0]).toMatchObject({ knowledge: 'entered', kind: 'password' });
  });

  it('lets a player move along the trail and through the doors underfoot, nowhere else', () => {
    const onPassword = runAt({ branchId: 'trunk', floor: 1 }, { entered: ['f0', 'f1'] });
    expect(netMoveAllowedFor(ARCHITECTURE, onPassword, TOP)).toBe(true);
    expect(netMoveAllowedFor(ARCHITECTURE, onPassword, { branchId: 'trunk', floor: 2 })).toBe(true);
    expect(netMoveAllowedFor(ARCHITECTURE, onPassword, { branchId: 'b1', floor: 0 })).toBe(true);
    // A real floor nobody has reached and a made-up one answer alike.
    expect(netMoveAllowedFor(ARCHITECTURE, onPassword, { branchId: 'trunk', floor: 4 })).toBe(
      false,
    );
    expect(netMoveAllowedFor(ARCHITECTURE, onPassword, { branchId: 'trunk', floor: 40 })).toBe(
      false,
    );
    expect(netMoveAllowedFor(ARCHITECTURE, onPassword, { branchId: 'b9', floor: 0 })).toBe(false);
    expect(netMoveAllowedFor(ARCHITECTURE, runAt(TOP), { branchId: 'b1', floor: 0 })).toBe(false);
  });
});

/**
 * The leak test of stage 70a: random shafts, random walks, and after every step
 * the player's payload is searched for the id, label and branch of every floor
 * it has no business knowing. Tokens are fenced with `#` so `id#1#` is not found
 * inside `id#12#`.
 */
describe('ładunek gracza nie zdradza szybu (etap 70a)', () => {
  function mulberry(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const KINDS = ['empty', 'password', 'file', 'controlNode', 'ice'] as const;

  function randomShaft(random: () => number): CpredNetArchitecture {
    const pick = (n: number) => Math.floor(random() * n);
    let serial = 0;
    const floors = (count: number) =>
      Array.from({ length: count }, () => {
        serial += 1;
        const kind = KINDS[pick(KINDS.length)]!;
        return {
          id: `id#${serial}#`,
          kind,
          label: `canary#${serial}#`,
          ...(kind === 'password' || kind === 'file' || kind === 'controlNode' ? { dv: 8 } : {}),
          ...(kind === 'file' ? { notes: `note#${serial}#` } : {}),
        };
      });
    const trunkLength = 3 + pick(8);
    const branches: CpredNetArchitecture['branches'] = [
      { id: 'br#0#', parentFloor: null, floors: floors(trunkLength) },
    ];
    const sideCount = pick(4);
    for (let index = 1; index <= sideCount; index += 1) {
      const parentFloor = pick(trunkLength - 1);
      branches.push({
        id: `br#${index}#`,
        name: `bname#${index}#`,
        parentFloor,
        floors: floors(1 + pick(3)),
      });
    }
    return { id: 'net.random', name: 'aname#0#', difficulty: 'standard', branches };
  }

  it('holds over 200 random shafts and random walks', () => {
    const random = mulberry(70);
    for (let round = 0; round < 200; round += 1) {
      const shaft = randomShaft(random);
      const rungs = netShaftRungs(shaft);
      const entry = netEntryPosition(shaft)!;
      let state = freshNetRun(entry, netFloorAt(shaft, entry)!.id);

      for (let step = 0; step < 14; step += 1) {
        const view = netRunView(shaft, state, { gm: false, netActionsMax: 3, combat: NO_FIGHT });
        const wire = JSON.stringify(view);
        const entered = new Set(state.entered);
        const scouted = new Set(state.scouted);
        const doors = netChildren(shaft, state.position);
        const isDoor = (rung: (typeof rungs)[number]) =>
          doors.some((door) => door.branchId === rung.branchId && door.floor === rung.index);

        expect(view.shaft).toBeUndefined();
        expect(wire).not.toContain('aname#');
        for (const rung of rungs) {
          const stood = entered.has(rung.floor.id);
          const seenDoor = isDoor(rung) && scouted.has(rung.floor.id);
          if (!stood) expect(wire, `id of ${rung.floor.id}`).not.toContain(rung.floor.id);
          if (!stood && !seenDoor) {
            expect(wire, `label of ${rung.floor.id}`).not.toContain(rung.floor.label);
          }
          if (!(stood && identifiedOf(state).has(rung.floor.id)) && rung.floor.notes) {
            expect(wire).not.toContain(rung.floor.notes);
          }
        }
        for (const branch of shaft.branches) {
          const touched =
            branch.floors.some((floor) => entered.has(floor.id)) ||
            doors.some((door) => door.branchId === branch.id);
          if (!touched) expect(wire, `branch ${branch.id}`).not.toContain(branch.id);
          const firstId = branch.floors[0]!.id;
          const named =
            doors.some((door) => door.branchId === branch.id && door.floor === 0) &&
            (entered.has(firstId) || scouted.has(firstId));
          if (branch.name && !named) expect(wire).not.toContain(branch.name);
        }
        // The count of exits is the count of floors directly below — no more.
        expect(view.exits.down).toHaveLength(doors.length);

        // One random thing a netrunner may do next.
        const here = netFloorAt(shaft, state.position)!;
        const dice = random();
        if (here.kind === 'password' && !state.broken.includes(here.id) && dice < 0.6) {
          state = { ...state, broken: [...state.broken, here.id] };
          continue;
        }
        if (dice < 0.25) {
          const revealed = netScoutReveal(shaft, state, 20);
          state = { ...state, scouted: [...state.scouted, ...revealed] };
          continue;
        }
        const options = [
          ...view.exits.down.map((exit) => exit.to),
          ...view.trail.filter((entry) => !entry.here).map((entry) => entry.position),
        ].filter((to) => netMoveAllowedFor(shaft, state, to) && netCanMove(shaft, state, to).ok);
        const to = options[Math.floor(random() * options.length)];
        if (!to) continue;
        const path = netCanMove(shaft, state, to).path!;
        const ids = path.map((position) => netFloorAt(shaft, position)!.id);
        state = netMove(state, path, ids);
      }
    }
  });

  function identifiedOf(state: { identified: string[] }): Set<string> {
    return new Set(state.identified);
  }
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
    expect(
      cpredInterfaceRank({ roleId: 'netrunner', roleAbilityRank: 6, formerRoles: [] }, registry),
    ).toBe(6);
  });

  it('answers null for a role whose ability is something else', () => {
    expect(
      cpredInterfaceRank({ roleId: 'solo', roleAbilityRank: 8, formerRoles: [] }, registry),
    ).toBeNull();
    expect(
      cpredInterfaceRank({ roleId: null, roleAbilityRank: 8, formerRoles: [] }, registry),
    ).toBeNull();
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

  it('keeps the GM’s brake on the defence, and only a real true counts (stage 70e)', () => {
    expect(readNetRuntime(JSON.stringify({ defensePaused: true })).defensePaused).toBe(true);
    expect('defensePaused' in readNetRuntime(JSON.stringify({ defensePaused: 'tak' }))).toBe(false);
    expect('defensePaused' in readNetRuntime('{}')).toBe(false);
  });

  it('tells the GM whether the defence is on the brake, and the player nothing', () => {
    const state = runAt(TOP);
    const runtime = { viruses: [], defensePaused: true };
    const options = { netActionsMax: 3, combat: NO_FIGHT, runtime };
    expect(netRunView(ARCHITECTURE, state, { ...options, gm: true }).defensePaused).toBe(true);
    expect(
      netRunView(ARCHITECTURE, state, { ...options, gm: true, runtime: { viruses: [] } })
        .defensePaused,
    ).toBe(false);
    expect('defensePaused' in netRunView(ARCHITECTURE, state, { ...options, gm: false })).toBe(
      false,
    );
  });
});

describe('Maskowanie piętro po piętrze, próby w jednej Turze (zasada domowa MG z 14.11)', () => {
  const kolec = { characterId: 'c-kolec', sceneId: 's-magazyn' };
  const empty = () => readNetRuntime('{}');
  const tryOnce = (
    runtime: ReturnType<typeof empty>,
    floorId: string,
    round: number | null,
    success: boolean,
    total = 12,
  ) => netRecordCloak(runtime, kolec, { floorId, round, maxTries: 3, success, total });

  it('masks a floor on the first success and keeps the total', () => {
    let runtime = tryOnce(empty(), 'f1', 4, false);
    expect(netCloakState(runtime, kolec, 'f1', 4, 3)).toBe('trying');
    runtime = tryOnce(runtime, 'f1', 4, true, 15);
    expect(netCloakState(runtime, kolec, 'f1', 4, 3)).toBe('masked');
    expect(netCloaksOf(runtime, kolec)).toEqual([
      { ...kolec, floorId: 'f1', attempts: 2, round: 4, outcome: 'masked', total: 15 },
    ]);
    // Every floor on its own: the next one is untouched.
    expect(netCloakState(runtime, kolec, 'f2', 4, 3)).toBe('open');
  });

  it('fails a floor once the Turn’s Net Actions are gone', () => {
    let runtime = tryOnce(empty(), 'f1', 2, false);
    runtime = tryOnce(runtime, 'f1', 2, false);
    expect(netCloakState(runtime, kolec, 'f1', 2, 3)).toBe('trying');
    runtime = tryOnce(runtime, 'f1', 2, false);
    expect(netCloakState(runtime, kolec, 'f1', 2, 3)).toBe('failed');
    expect(netCloaksOf(runtime, kolec)[0]?.outcome).toBe('failed');
  });

  it('fails a half-tried floor when the Round moves on — no later Turn reopens it', () => {
    const runtime = tryOnce(empty(), 'f1', 2, false);
    expect(netCloakState(runtime, kolec, 'f1', 3, 3)).toBe('failed');
    // Outside a fight (no round) the try belongs to the stay, not to a Round.
    const calm = tryOnce(empty(), 'f1', null, false);
    expect(netCloakState(calm, kolec, 'f1', null, 3)).toBe('trying');
  });

  it('fails a half-tried floor the netrunner walks off', () => {
    let runtime = tryOnce(empty(), 'f1', null, false);
    runtime = tryOnce(runtime, 'f2', null, true);
    const left = netLeaveCloaks(runtime, kolec, 'f3');
    expect(netCloakState(left, kolec, 'f1', null, 3)).toBe('failed');
    expect(netCloakState(left, kolec, 'f2', null, 3)).toBe('masked');
    // Staying put changes nothing — the same object comes back.
    const stay = tryOnce(empty(), 'f1', null, false);
    expect(netLeaveCloaks(stay, kolec, 'f1')).toBe(stay);
    // Somebody else's tries are theirs.
    const other = netLeaveCloaks(runtime, { ...kolec, characterId: 'c-inny' }, 'f3');
    expect(netCloakState(other, kolec, 'f1', null, 3)).toBe('trying');
  });

  it('gives a failed floor back on „Oddaj próby” and keeps a masked one', () => {
    let runtime = tryOnce(empty(), 'f1', null, true);
    runtime = netLeaveCloaks(tryOnce(runtime, 'f2', null, false), kolec, 'f3');
    const cleared = netClearTries(runtime, kolec);
    expect(netCloakState(cleared, kolec, 'f1', null, 3)).toBe('masked');
    expect(netCloakState(cleared, kolec, 'f2', null, 3)).toBe('open');
  });

  it('reads the records back and drops a broken one', () => {
    const runtime = tryOnce(empty(), 'f1', 5, true, 14);
    const read = readNetRuntime(
      JSON.stringify({ ...runtime, cloaks: [...runtime.cloaks!, { floorId: 'f9' }] }),
    );
    expect(read.cloaks).toEqual(runtime.cloaks);
  });

  it('shows the mark on the floor and greys the button once the floor is closed', () => {
    const player = { gm: false, netActionsMax: 3, combat: NO_FIGHT };
    const at = runAt({ branchId: 'trunk', floor: 1 }, { entered: ['f0', 'f1'] });
    const trying = netCloaksOf(tryOnce(empty(), 'f1', null, false), kolec);
    const open = netRunView(ARCHITECTURE, at, { ...player, cloaks: trying });
    expect(open.here?.cloak).toBe('trying');
    expect(open.here?.cloakTriesLeft).toBe(2);
    expect(open.spentAbilities).not.toContain('cloak');

    const masked = netCloaksOf(tryOnce(empty(), 'f1', null, true, 17), kolec);
    const done = netRunView(ARCHITECTURE, at, { ...player, cloaks: masked });
    expect(done.here?.cloak).toBe('masked');
    expect(done.here?.cloakTotal).toBe(17);
    expect(done.spentAbilities).toContain('cloak');
    // The GM's plan carries the same mark on that floor.
    const plan = netRunView(ARCHITECTURE, at, { ...player, gm: true, cloaks: masked });
    const floor = plan.shaft?.flatMap((branch) => branch.floors).find((f) => f.id === 'f1');
    expect(floor?.cloak).toBe('masked');
  });
});

describe('czerwone ślady na piętrach bez Maskowania (zlecenie MG z 14.11)', () => {
  const kolec = { characterId: 'c-kolec', sceneId: 's-magazyn' };
  const empty = () => readNetRuntime('{}');
  const viewer = { gm: false, netActionsMax: 3, combat: NO_FIGHT };
  const gmViewer = { ...viewer, gm: true };
  const cloak = (
    runtime: ReturnType<typeof empty>,
    floorId: string,
    round: number | null,
    success: boolean,
  ) => netRecordCloak(runtime, kolec, { floorId, round, maxTries: 3, success, total: 12 });
  const planFloor = (view: ReturnType<typeof netRunView>, id: string) =>
    view.shaft?.flatMap((branch) => branch.floors).find((floor) => floor.id === id);

  it('marks the floors walked off: unmasked, failed, and nothing on a masked one', () => {
    // Stoi na f3; f0 opuszczone bez próby, f1 nieudane, f2 zamaskowane.
    let runtime = cloak(empty(), 'f1', null, false);
    runtime = netLeaveCloaks(runtime, kolec, 'f2');
    runtime = cloak(runtime, 'f2', null, true);
    const at = runAt({ branchId: 'trunk', floor: 3 }, { entered: ['f0', 'f1', 'f2', 'f3'] });
    const plan = netRunView(ARCHITECTURE, at, {
      ...viewer,
      gm: true,
      cloaks: netCloaksOf(runtime, kolec),
    });
    expect(planFloor(plan, 'f0')?.traces).toBe('unmasked');
    expect(planFloor(plan, 'f1')?.traces).toBe('failed');
    expect(planFloor(plan, 'f2')?.traces).toBeUndefined();
    // Piętro pod stopami bez próby jeszcze ma szansę; nieodwiedzone — nic.
    expect(planFloor(plan, 'f3')?.traces).toBeUndefined();
    expect(planFloor(plan, 'f4')?.traces).toBeUndefined();
  });

  it('marks the floor stood on only once its chance is gone', () => {
    const at = runAt({ branchId: 'trunk', floor: 1 }, { entered: ['f0', 'f1'] });
    const trying = netCloaksOf(cloak(empty(), 'f1', 2, false), kolec);
    expect(
      netRunView(ARCHITECTURE, at, { ...gmViewer, round: 2, cloaks: trying }).here?.traces,
    ).toBeUndefined();
    // Runda poszła dalej: ta Tura przepadła.
    expect(
      netRunView(ARCHITECTURE, at, { ...gmViewer, round: 3, cloaks: trying }).here?.traces,
    ).toBe('failed');
  });

  it('keeps the mark out of the player’s payload — the GM’s trail has it', () => {
    const at = runAt({ branchId: 'trunk', floor: 1 }, { entered: ['f0', 'f1'] });
    const failed = netCloaksOf(cloak(empty(), 'f1', 2, false), kolec);
    const player = netRunView(ARCHITECTURE, at, { ...viewer, round: 3, cloaks: failed });
    expect(JSON.stringify(player)).not.toContain('traces');
    // The player keeps the plain „maskowanie nieudane” of their own roll.
    expect(player.here?.cloak).toBe('failed');
    const gm = netRunView(ARCHITECTURE, at, { ...gmViewer, round: 3, cloaks: failed });
    expect(gm.trail.find((step) => step.id === 'f0')?.traces).toBe('unmasked');
    expect(gm.here?.traces).toBe('failed');
  });

  it('remembers the floors stood on across a reconnection, without widening the trail', () => {
    let runtime = netRememberVisited(empty(), kolec, ['f0', 'f1']);
    runtime = netRememberVisited(runtime, kolec, ['f1', 'f2']);
    expect(netVisitedOf(runtime, kolec)).toEqual(['f0', 'f1', 'f2']);
    // Nothing new: the same object comes back.
    expect(netRememberVisited(runtime, kolec, ['f0'])).toBe(runtime);
    // A later success keeps the visited floors.
    runtime = netRememberRun(runtime, kolec, { ...runAt(TOP), broken: ['f1'] });
    expect(netVisitedOf(readNetRuntime(JSON.stringify(runtime)), kolec)).toEqual([
      'f0',
      'f1',
      'f2',
    ]);

    // The player's trail does not grow: f2 was only stood on, not won.
    const restored = netRestoreRun(runAt(TOP), runtime, kolec).state;
    expect(restored.entered).not.toContain('f2');
    const plan = netRunView(ARCHITECTURE, restored, {
      ...viewer,
      gm: true,
      visited: netVisitedOf(runtime, kolec),
    });
    expect(planFloor(plan, 'f1')?.traces).toBe('unmasked');
    expect(planFloor(plan, 'f2')?.traces).toBe('unmasked');
    // f0 is where the fresh run stands — its chance is new.
    expect(planFloor(plan, 'f0')?.traces).toBeUndefined();
  });
});

describe('jedna próba na zdolność i pamięć sukcesów (zlecenia MG z 02.11)', () => {
  const kolec = { characterId: 'c-kolec', sceneId: 's-magazyn' };
  const empty = () => readNetRuntime('{}');

  it('spends a DV Check on a failure only, an open roll on every roll', () => {
    expect(netTrySpentBy('backdoor', false)).toBe(true);
    expect(netTrySpentBy('backdoor', true)).toBe(false);
    expect(netTrySpentBy('virus', false)).toBe(true);
    expect(netTrySpentBy('virus', true)).toBe(false);
    expect(netTrySpentBy('scout', true)).toBe(true);
    // Maskowanie left the table on 14.11 — its rhythm is `netCloakState`.
    expect(netTrySpentBy('cloak', true)).toBe(false);
    // No limit: the Scanner works in meatspace, Ślizg and Paf are a fight.
    expect(netTrySpentBy('scanner', false)).toBe(false);
    expect(netTrySpentBy('slide', false)).toBe(false);
  });

  it('keys a try by character, scene, ability and floor', () => {
    const runtime = netRecordTry(empty(), kolec, 'backdoor', 'f1');
    expect(netTrySpent(runtime, kolec, 'backdoor', 'f1')).toBe(true);
    expect(netTrySpent(runtime, kolec, 'backdoor', 'f2')).toBe(false);
    expect(netTrySpent(runtime, kolec, 'scout', 'f1')).toBe(false);
    expect(netTrySpent(runtime, { ...kolec, characterId: 'c-inny' }, 'backdoor', 'f1')).toBe(false);
    expect(netTrySpent(runtime, { ...kolec, sceneId: 's-inna' }, 'backdoor', 'f1')).toBe(false);
  });

  it('counts Zwiad once per floor', () => {
    const runtime = netRecordTry(empty(), kolec, 'scout', 'f0');
    expect(netTrySpent(runtime, kolec, 'scout', 'f0')).toBe(true);
    expect(netTrySpent(runtime, kolec, 'scout', 'f3')).toBe(false);
  });

  it('writes a try once, reads it back and gives back only this character', () => {
    let runtime = netRecordTry(netRecordTry(empty(), kolec, 'eyed', 'f2'), kolec, 'eyed', 'f2');
    expect(runtime.spentTries).toHaveLength(1);
    runtime = netRecordTry(runtime, { ...kolec, characterId: 'c-inny' }, 'eyed', 'f2');
    const read = readNetRuntime(
      JSON.stringify({ ...runtime, spentTries: [...runtime.spentTries!, { floorId: 7 }] }),
    );
    expect(read.spentTries).toHaveLength(2);
    const cleared = netClearTries(read, kolec);
    expect(netTriesOf(cleared, kolec)).toEqual([]);
    expect(netTrySpent(cleared, { ...kolec, characterId: 'c-inny' }, 'eyed', 'f2')).toBe(true);
  });

  it('remembers what a run achieved and folds it into the next one', () => {
    const run = {
      ...freshNetRun({ branchId: 'trunk', floor: 3 }, 'f0'),
      broken: ['f1'],
      identified: ['f2'],
      scouted: ['f4'],
      controlled: [{ floorId: 'f3', dv: 17 }],
    };
    const runtime = readNetRuntime(JSON.stringify(netRememberRun(empty(), kolec, run)));
    const next = netRestoreRun(freshNetRun({ branchId: 'trunk', floor: 0 }, 'f0'), runtime, kolec);
    expect(next.state.broken).toEqual(['f1']);
    expect(next.state.identified).toEqual(['f2']);
    expect(next.state.scouted).toEqual(['f4']);
    expect(next.state.controlled).toEqual([{ floorId: 'f3', dv: 17 }]);
    expect(next.state.entered).toEqual(expect.arrayContaining(['f0', 'f1', 'f2', 'f3']));
    expect(next.restoredHolds).toEqual(['f3']);
    // Another character, another scene: nothing comes back.
    const stranger = netRestoreRun(freshNetRun({ branchId: 'trunk', floor: 0 }, 'f0'), runtime, {
      ...kolec,
      sceneId: 's-inna',
    });
    expect(stranger.state.broken).toEqual([]);
  });

  it('does not hand back a node somebody else holds or took away', () => {
    const run = {
      ...freshNetRun({ branchId: 'trunk', floor: 3 }, 'f0'),
      controlled: [{ floorId: 'f3', dv: 17 }],
    };
    const runtime = netRememberRun(empty(), kolec, run);
    const fresh = freshNetRun({ branchId: 'trunk', floor: 0 }, 'f0');
    expect(netRestoreRun(fresh, runtime, kolec, (id) => id === 'f3').state.controlled).toEqual([]);
    const forgotten = netForgetHold(runtime, kolec, 'f3');
    expect(netRestoreRun(fresh, forgotten, kolec).state.controlled).toEqual([]);
  });
});

describe('„Zapomnij” sceny czyści też Sieć (zlecenie MG z 14.11)', () => {
  const kolec = { characterId: 'c-kolec', sceneId: 's-magazyn' };
  const there = { ...kolec, sceneId: 's-inna' };
  const empty = () => readNetRuntime('{}');
  const run = {
    ...freshNetRun({ branchId: 'trunk', floor: 1 }, 'f0'),
    broken: ['f1'],
  };

  it('drops memory, tries and Maskowanie of this scene only', () => {
    let runtime = netRememberRun(empty(), kolec, run);
    runtime = netRememberRun(runtime, there, run);
    runtime = netRecordTry(runtime, kolec, 'backdoor', 'f1');
    runtime = netRecordTry(runtime, there, 'backdoor', 'f1');
    runtime = netRecordCloak(runtime, kolec, {
      floorId: 'f1',
      round: null,
      maxTries: 3,
      success: true,
      total: 14,
    });
    runtime = {
      ...runtime,
      viruses: [{ id: 'v1', description: 'x', dv: 10, author: 'K', createdAt: '' }],
    };

    const { runtime: next, forgotten } = netForgetScene(runtime, 's-magazyn');
    expect(forgotten).toBe(3);
    const fresh = freshNetRun({ branchId: 'trunk', floor: 0 }, 'f0');
    expect(netRestoreRun(fresh, next, kolec).state.broken).toEqual([]);
    expect(netTrySpent(next, kolec, 'backdoor', 'f1')).toBe(false);
    expect(netCloakState(next, kolec, 'f1', null, 3)).toBe('open');
    // The other scene keeps its own, and the Architecture keeps its Viruses.
    expect(netRestoreRun(fresh, next, there).state.broken).toEqual(['f1']);
    expect(netTrySpent(next, there, 'backdoor', 'f1')).toBe(true);
    expect(next.viruses).toHaveLength(1);
  });

  it('hands the same runtime back when there is nothing to forget', () => {
    const runtime = netRememberRun(empty(), there, run);
    const result = netForgetScene(runtime, 's-magazyn');
    expect(result.forgotten).toBe(0);
    expect(result.runtime).toBe(runtime);
  });
});
