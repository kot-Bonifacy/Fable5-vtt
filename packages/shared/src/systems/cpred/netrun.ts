/**
 * The run itself (stage 26b) — where a netrunner stands in an Architecture,
 * what they have uncovered and what one Interface ability does about it.
 *
 * Deliberately separate from `netrunning.ts`, which holds the *build*: the
 * architecture is a thing the GM authors once and several runs may visit, while
 * everything here is the state of one intrusion. Mixing them would mean two runs
 * against the same building fighting over one object.
 *
 * Three ideas carry the whole file:
 *
 *  - **The shaft is a tree.** A trunk floor's parent is the floor above it; a
 *    branch's first floor hangs off the trunk floor it was declared on. That
 *    makes the route between any two floors unique, which is exactly what
 *    „nie możesz ominąć przeszkody" needs — there is nothing to route around.
 *  - **Knowledge is three-valued.** A floor is unknown, *scouted* („czym ona
 *    jest, ale nie podaje Poziomów Trudności", s. 200) or entered. The player's
 *    view is built from that, on the server, before anything is emitted — the
 *    client is never sent a DV it has not earned.
 *  - **Nine abilities are one roll.** `Interfejs + 1k10 przeciw PT` (s. 199).
 *    What differs is where the DV comes from and what success writes down, so
 *    the differences live in a table rather than in nine functions.
 *
 * The two contested abilities (Ślizg, Paf) belong to stage 26c and live in
 * `netcombat.ts`: both roll against a Black ICE rather than against a DV, so
 * they need a target and cannot share `runAbility`. They stay in the catalogue
 * below marked `combat: true`, which is how the run window knows to ask for
 * that target instead of firing straight away.
 */

import type { CpredRegistry } from './character.js';
import { cpredRoleAbilityRank, type CpredRoleSheet } from './roleability.js';
import type {
  CpredNetArchitecture,
  CpredNetBranch,
  CpredNetFloor,
  NetFloorKind,
} from './netrunning.js';
import { NET_FLOOR_KIND_LABELS, netTrunk } from './netrunning.js';
// Type-only: `netcombat.ts` walks this file's shaft, so a value import back
// would close a cycle. The fight it describes rides on the run's own view.
import type { NetCombatView } from './netcombat.js';
// Same bargain for stage 26e's Demons: the view is built there, the run merely
// carries it. Type-only, so the two modules never import each other's values.
import type { NetDemonView } from './netdemons.js';
import type {
  CpredNetDeviceState,
  CpredNetDeviceTurn,
  CpredNetNodeUse,
  NetDeviceView,
} from './netdevices.js';
import { readNetDeviceStates, readNetDeviceTurns, readNetNodeUses } from './netdevices.js';
import type { NetSightedDevice } from './netscene.js';

// ─────────────────────────── Interfejs jako zdolność ───────────────────────────

/**
 * The Role ability that makes netrunning possible at all: „Zdolnością Specjalną
 * Netrunnera jest Interfejs. Bez niej nie da się sieciować" (s. 198). Matched
 * against the *ability name* rather than the role id, because the role ids come
 * from a data file the group may rename.
 */
export const NET_INTERFACE_ABILITY = 'Interfejs';

/**
 * The character's Interface rank, or null when this sheet has no Interface at
 * all. Null is the answer that refuses a run — not zero, which would look like
 * a netrunner who is merely bad at it.
 */
export function cpredInterfaceRank(data: CpredRoleSheet, registry: CpredRegistry): number | null {
  // Stage 29b: through `cpredRoleAbilityRank`, so a Netrunner who took up
  // another Role keeps the deck they paid for — „cały czas możesz […]
  // korzystać z oferowanych przez nią korzyści" (s. 143).
  return cpredRoleAbilityRank(data, registry, NET_INTERFACE_ABILITY);
}

// ──────────────────────────── Zdolności Interfejsu ────────────────────────────

export const NET_ABILITY_IDS = [
  'scanner',
  'backdoor',
  'cloak',
  'control',
  'eyed',
  'scout',
  'slide',
  'virus',
  'zap',
] as const;
export type NetAbilityId = (typeof NET_ABILITY_IDS)[number];

/** Where the DV of an ability's Check comes from. */
export type NetAbilityDvSource =
  /** The floor being stood on carries it (password, File, control node). */
  | 'floor'
  /** No DV — the total *is* the answer (Zwiad, Maskowanie, Skaner). */
  | 'open'
  /** The GM names it at the table (Wirus, s. 200). */
  | 'gm'
  /** Rolled against the other side (Ślizg — stage 26c). */
  | 'contested';

export interface CpredNetAbility {
  id: NetAbilityId;
  name: string;
  /** „Akcja w Somie" (Skaner) or one Net Action (everything else). */
  cost: 'soma' | 'net';
  dv: NetAbilityDvSource;
  /** The floor kind it needs under its feet, when it needs one. */
  floorKind?: NetFloorKind;
  hint: string;
  /**
   * Contested against a Black ICE rather than rolled against a DV (stage 26c).
   * Such an ability needs a target picked first, so it is resolved by its own
   * event and not by the shared Check path.
   */
  combat?: boolean;
}

/**
 * The nine abilities of s. 199–201. Mechanics only: the cost, where the DV comes
 * from and what floor it needs. The rulebook's examples and prose stay in the
 * private data like every other stage's flavour.
 */
export const NET_ABILITIES: readonly CpredNetAbility[] = [
  {
    id: 'scanner',
    name: 'Skaner',
    cost: 'soma',
    dv: 'open',
    hint: 'Akcja w Somie: szukasz w okolicy punktów dostępu. Im lepszy Test, tym dalej sięgasz.',
  },
  {
    id: 'backdoor',
    name: 'Backdoor',
    cost: 'net',
    dv: 'floor',
    floorKind: 'password',
    hint: 'Przebijasz się przez hasło blokujące zejście niżej.',
  },
  {
    id: 'scout',
    name: 'Zwiad',
    cost: 'net',
    dv: 'open',
    hint: 'Odsłaniasz piętra tuż pod tobą (także odnogi). Stojąc na haśle, musisz dorównać jego PT.',
  },
  {
    id: 'eyed',
    name: 'Ajdi',
    cost: 'net',
    dv: 'floor',
    floorKind: 'file',
    hint: 'Rozpoznajesz, czym jest znaleziony Plik i ile jest wart.',
  },
  {
    id: 'control',
    name: 'Kontrola',
    cost: 'net',
    dv: 'floor',
    floorKind: 'controlNode',
    hint: 'Przejmujesz węzeł kontrolny. PT odebrania go tobie równa się twojemu wynikowi.',
  },
  {
    id: 'cloak',
    name: 'Maskowanie',
    cost: 'net',
    dv: 'open',
    hint: 'Zacierasz ślady. Cudzy Zwiad musi przebić twój wynik, żeby cokolwiek odkryć.',
  },
  {
    id: 'virus',
    name: 'Wirus',
    cost: 'net',
    dv: 'gm',
    hint: 'Tylko na dnie Architektury: trwała zmiana, której nie zniesie odłączenie.',
  },
  {
    id: 'slide',
    name: 'Ślizg',
    cost: 'net',
    dv: 'contested',
    hint: 'Ucieczka przed Czarnym LOD-em na sąsiednie piętro. Raz na Turę.',
    combat: true,
  },
  {
    id: 'zap',
    name: 'Paf',
    cost: 'net',
    dv: 'contested',
    hint: 'Atak bez Programu: 1k6 obrażeń Programowi albo mózgowi netrunnera.',
    combat: true,
  },
];

export function netAbility(id: string): CpredNetAbility | undefined {
  return NET_ABILITIES.find((entry) => entry.id === id);
}

/** The abilities the shared Check path resolves — the run window's button row. */
export const NET_ABILITIES_AVAILABLE: readonly CpredNetAbility[] = NET_ABILITIES.filter(
  (entry) => !entry.combat,
);

/** Ślizg and Paf — the two that need a Black ICE picked before they can fire. */
export const NET_ABILITIES_CONTESTED: readonly CpredNetAbility[] = NET_ABILITIES.filter(
  (entry) => entry.combat === true,
);

// ──────────────────────────────── pozycja i szyb ────────────────────────────────

/** Where somebody stands in the shaft. */
export interface CpredNetPosition {
  branchId: string;
  /** Index inside that branch, 0 = its top floor. */
  floor: number;
}

/** One floor of the shaft, with everything the lift view needs to place it. */
export interface CpredNetRung {
  branchId: string;
  branchName?: string;
  trunk: boolean;
  index: number;
  /** Distance from the top of the whole architecture; the trunk's own scale. */
  depth: number;
  floor: CpredNetFloor;
}

function branchOf(
  architecture: CpredNetArchitecture,
  branchId: string,
): CpredNetBranch | undefined {
  return architecture.branches.find((branch) => branch.id === branchId);
}

/** Depth of a branch's first floor: trunk floors sit at their own index. */
function branchTop(branch: CpredNetBranch): number {
  return branch.parentFloor === null ? 0 : branch.parentFloor + 1;
}

/** Every floor of the architecture, branch by branch, with its depth. */
export function netShaftRungs(architecture: CpredNetArchitecture): CpredNetRung[] {
  const rungs: CpredNetRung[] = [];
  for (const branch of architecture.branches) {
    const top = branchTop(branch);
    branch.floors.forEach((floor, index) => {
      rungs.push({
        branchId: branch.id,
        ...(branch.name ? { branchName: branch.name } : {}),
        trunk: branch.parentFloor === null,
        index,
        depth: top + index,
        floor,
      });
    });
  }
  return rungs;
}

export function netFloorAt(
  architecture: CpredNetArchitecture,
  position: CpredNetPosition,
): CpredNetFloor | undefined {
  return branchOf(architecture, position.branchId)?.floors[position.floor];
}

/** The floor the lift arrives at when somebody jacks in — the trunk's top. */
export function netEntryPosition(architecture: CpredNetArchitecture): CpredNetPosition | null {
  const trunk = netTrunk(architecture);
  if (!trunk || trunk.floors.length === 0) return null;
  return { branchId: trunk.id, floor: 0 };
}

/**
 * The floor directly above this one, or null at the very top.
 *
 * This is what makes the shaft a tree: a branch's first floor hangs off the
 * *trunk* floor it was declared on, so climbing out of a branch and climbing the
 * trunk are the same move.
 */
export function netParent(
  architecture: CpredNetArchitecture,
  position: CpredNetPosition,
): CpredNetPosition | null {
  const branch = branchOf(architecture, position.branchId);
  if (!branch) return null;
  if (position.floor > 0) return { branchId: branch.id, floor: position.floor - 1 };
  if (branch.parentFloor === null) return null;
  const trunk = netTrunk(architecture);
  if (!trunk || branch.parentFloor >= trunk.floors.length) return null;
  return { branchId: trunk.id, floor: branch.parentFloor };
}

/** The floors directly below this one — two of them at a branching point. */
export function netChildren(
  architecture: CpredNetArchitecture,
  position: CpredNetPosition,
): CpredNetPosition[] {
  const children: CpredNetPosition[] = [];
  const branch = branchOf(architecture, position.branchId);
  if (!branch) return children;
  if (position.floor + 1 < branch.floors.length) {
    children.push({ branchId: branch.id, floor: position.floor + 1 });
  }
  if (branch.parentFloor === null) {
    for (const other of architecture.branches) {
      if (other.parentFloor === position.floor && other.floors.length > 0) {
        children.push({ branchId: other.id, floor: 0 });
      }
    }
  }
  return children;
}

export function netSamePosition(a: CpredNetPosition, b: CpredNetPosition): boolean {
  return a.branchId === b.branchId && a.floor === b.floor;
}

function ancestry(
  architecture: CpredNetArchitecture,
  position: CpredNetPosition,
): CpredNetPosition[] {
  const chain: CpredNetPosition[] = [position];
  let cursor = netParent(architecture, position);
  let guard = 0;
  while (cursor && guard < 64) {
    chain.push(cursor);
    cursor = netParent(architecture, cursor);
    guard += 1;
  }
  return chain;
}

/**
 * The route from one floor to another, the destination included and the start
 * left out. Null when either end is not a floor of this architecture.
 *
 * There is only ever one route — see the file header — so this walks up to the
 * common ancestor and back down, and nobody has to choose.
 */
export function netRunPath(
  architecture: CpredNetArchitecture,
  from: CpredNetPosition,
  to: CpredNetPosition,
): CpredNetPosition[] | null {
  if (!netFloorAt(architecture, from) || !netFloorAt(architecture, to)) return null;
  if (netSamePosition(from, to)) return [];
  const up = ancestry(architecture, from);
  const down = ancestry(architecture, to);
  const meetIndex = up.findIndex((step) => down.some((other) => netSamePosition(step, other)));
  if (meetIndex < 0) return null;
  const meet = up[meetIndex]!;
  const climb = up.slice(1, meetIndex + 1);
  const descend = down.slice(
    0,
    down.findIndex((step) => netSamePosition(step, meet)),
  );
  return [...climb, ...descend.reverse()];
}

// ─────────────────────────────── stan jednego runa ───────────────────────────────

/** „PT ustala MG" — a Virus being written across several Turns (s. 200). */
export interface CpredNetVirusProgress {
  description: string;
  /** The DV the GM named for this Virus. */
  dv: number;
  /** Net Actions the GM said it would take. */
  actionsNeeded: number;
  actionsSpent: number;
}

/** A control node held right now: „PT odebrania… równe wartości Testu Kontroli". */
export interface CpredNetHold {
  floorId: string;
  dv: number;
}

/**
 * One intrusion, as the server stores it. Everything here dies with the
 * disconnection — „Odłączenie resetuje obronę danej Architektury Sieciowej,
 * czyli musisz zaczynać swój atak od początku" (s. 198). What outlives it is
 * `CpredNetRuntime` below.
 */
export interface CpredNetRunState {
  position: CpredNetPosition;
  /** Floors stood on: everything about them is known. */
  entered: string[];
  /** Floors Zwiad showed: the kind, not the DV. */
  scouted: string[];
  /** Passwords already broken — the only thing that unblocks a route. */
  broken: string[];
  /** Files run through Ajdi. */
  identified: string[];
  /** Files copied onto the deck („nie zużywa Akcji Sieciowej"). */
  copied: string[];
  controlled: CpredNetHold[];
  /**
   * Which control node was activated in which round (stage 26d). „Dany węzeł
   * kontrolny można aktywować tylko raz na Turę" (s. 199) counts *nodes*, so
   * this is keyed by floor and not by device — a netrunner holding two nodes
   * really can work two turrets in one Turn, if they have the Net Actions.
   */
  nodeUse: CpredNetNodeUse[];
  /**
   * Urządzenia aktywowane w bieżącej rundzie i reszta ich budżetu (etap 70b):
   * jedna Akcja Sieciowa daje urządzeniu ruch i jedną czynność. Brak pola —
   * run sprzed 70b albo nic jeszcze nie aktywowano.
   */
  deviceTurns?: CpredNetDeviceTurn[];
  /**
   * Black ICE **floors** met during this entry. Stage 26c spawns an instance
   * per Program on such a floor (`CpredNetCombatState.ice`) and bills the
   * emergency jack-out from those, but the floor list is what tells it which
   * doors have already been opened — a floor walked past twice must not put a
   * second Kraken in the shaft.
   */
  metIce: string[];
  virus: CpredNetVirusProgress | null;
}

export function freshNetRun(position: CpredNetPosition, floorId: string): CpredNetRunState {
  return {
    position,
    entered: [floorId],
    scouted: [],
    broken: [],
    identified: [],
    copied: [],
    controlled: [],
    nodeUse: [],
    metIce: [],
    virus: null,
  };
}

function stringList(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((value): value is string => typeof value === 'string')
    : [];
}

/** Reads a stored run back. Never throws: a broken row is a run at the top. */
export function readNetRunState(raw: unknown): CpredNetRunState | null {
  if (typeof raw === 'string') {
    try {
      return readNetRunState(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const input = raw as Record<string, unknown>;
  const stored = input.position as Record<string, unknown> | undefined;
  if (!stored || typeof stored.branchId !== 'string' || !Number.isInteger(stored.floor))
    return null;

  const controlled = (Array.isArray(input.controlled) ? input.controlled : [])
    .map((entry) => entry as Record<string, unknown>)
    .filter((entry) => typeof entry?.floorId === 'string' && Number.isInteger(entry?.dv))
    .map((entry) => ({ floorId: entry.floorId as string, dv: entry.dv as number }));

  const rawVirus = input.virus as Record<string, unknown> | null | undefined;
  const virus: CpredNetVirusProgress | null =
    rawVirus && typeof rawVirus.description === 'string' && Number.isInteger(rawVirus.dv)
      ? {
          description: rawVirus.description,
          dv: rawVirus.dv as number,
          actionsNeeded: Number.isInteger(rawVirus.actionsNeeded)
            ? Math.max(1, rawVirus.actionsNeeded as number)
            : 1,
          actionsSpent: Number.isInteger(rawVirus.actionsSpent)
            ? Math.max(0, rawVirus.actionsSpent as number)
            : 0,
        }
      : null;

  return {
    position: { branchId: stored.branchId, floor: Math.max(0, stored.floor as number) },
    entered: stringList(input.entered),
    scouted: stringList(input.scouted),
    broken: stringList(input.broken),
    identified: stringList(input.identified),
    copied: stringList(input.copied),
    controlled,
    nodeUse: readNetNodeUses(input.nodeUse),
    ...(Array.isArray(input.deviceTurns)
      ? { deviceTurns: readNetDeviceTurns(input.deviceTurns) }
      : {}),
    metIce: stringList(input.metIce),
    virus,
  };
}

// ──────────────────────── ślady, które przeżywają odłączenie ────────────────────────

/**
 * A Virus left in an Architecture. „PT zniszczenia tego Wirusa jest równe
 * wynikowi rzutu na tworzenie Wirusa" (s. 200) — which is why the roll's total
 * is stored rather than the DV that was beaten.
 */
export interface CpredNetVirus {
  id: string;
  description: string;
  dv: number;
  /** Who left it — the GM's list has to name somebody. */
  author: string;
  createdAt: string;
}

/**
 * What runs leave behind in an Architecture. Deliberately **not** part of
 * `CpredNetArchitecture`: that object is the GM's build, saved from an editor
 * that rewrites it wholesale, and a Virus swept away by „Zapisz" would be a
 * player's whole run undone by a typo fix.
 */
export interface CpredNetRuntime {
  viruses: CpredNetVirus[];
  /** „PT dla tego Zwiadu będzie równe wartości uzyskanej w Teście Maskowania". */
  maskDv?: number;
  /** Who masked the traces, for the GM's own reading of the same number. */
  maskedBy?: string;
  /**
   * What the control nodes' devices are doing (stage 26d).
   *
   * Here rather than in the run because it is a change in the *real* world: the
   * hold on a node dies with the disconnection („tracisz kontrolę nad
   * wszystkimi węzłami", s. 199), but a camera the netrunner switched off stays
   * switched off. The same reasoning that put the Virus on this shelf.
   */
  devices?: CpredNetDeviceState[];
  /**
   * Spent tries of the abilities a netrunner could otherwise reroll until they
   * land — zlecenia MG z 02.11: „netrunner na danej scenie powinien móc tylko raz
   * hackować dany element”, then „zwiad, maskowanie, wirus też”. Kept here and
   * not in the run because a jack-out and a fresh jack-in must not buy a second
   * try. Keyed by character, scene, ability and floor (`NET_TRY_LIMITS`): the
   * same Architecture wired on another scene is another place.
   */
  spentTries?: CpredNetTry[];
  /**
   * What a netrunner already achieved here, so a reconnection does not make
   * them do it again (zlecenie MG z 02.11: udane próby „powinny być
   * zapamiętywane, aby przy ponownym połączeniu nie trzeba było ich na danej
   * scenie powtarzać dla danej postaci”). One entry per character and scene;
   * `netrun:start` folds it into the fresh run (`netRestoreRun`). This bends
   * „Odłączenie resetuje obronę” (s. 198) on purpose — a house rule.
   */
  memories?: CpredNetMemory[];
  /**
   * The GM's brake on the defence (stage 70e, decyzja MG nr 4 z 11.11). Absent
   * = the Black ICE detects and the Demons wake and play their Turns by
   * themselves (`netDefenseAutoStep`); true = nothing moves until the GM clicks,
   * the way it was before the stage. Per Architecture and here rather than in
   * the run, so a reconnection does not let go of it.
   */
  defensePaused?: boolean;
}

/** One character's achievements in one Architecture on one scene. */
export interface CpredNetMemory {
  characterId: string;
  sceneId: string;
  broken: string[];
  identified: string[];
  copied: string[];
  scouted: string[];
  /** Nodes held, with the DV of taking them back — the Check's own total. */
  controlled: CpredNetHold[];
}

function memoryOf(runtime: CpredNetRuntime, who: NetTryWho): CpredNetMemory | undefined {
  return (runtime.memories ?? []).find(
    (entry) => entry.characterId === who.characterId && entry.sceneId === who.sceneId,
  );
}

const union = (a: string[], b: string[]) => [...new Set([...a, ...b])];

/**
 * Folds what a run has achieved into the character's memory. Only ever adds:
 * a node held is written with the run's latest DV, a node the run no longer
 * holds stays remembered until a rival takes it (`netForgetHold`).
 */
export function netRememberRun(
  runtime: CpredNetRuntime,
  who: NetTryWho,
  state: Pick<CpredNetRunState, 'broken' | 'identified' | 'copied' | 'scouted' | 'controlled'>,
): CpredNetRuntime {
  const before = memoryOf(runtime, who);
  const holds = new Map((before?.controlled ?? []).map((hold) => [hold.floorId, hold.dv]));
  for (const hold of state.controlled) holds.set(hold.floorId, hold.dv);
  const next: CpredNetMemory = {
    characterId: who.characterId,
    sceneId: who.sceneId,
    broken: union(before?.broken ?? [], state.broken),
    identified: union(before?.identified ?? [], state.identified),
    copied: union(before?.copied ?? [], state.copied),
    scouted: union(before?.scouted ?? [], state.scouted),
    controlled: [...holds].map(([floorId, dv]) => ({ floorId, dv })),
  };
  const others = (runtime.memories ?? []).filter((entry) => entry !== before);
  return { ...runtime, memories: [...others, next] };
}

/** A rival took this node: the character no longer gets it back on reconnecting. */
export function netForgetHold(
  runtime: CpredNetRuntime,
  who: NetTryWho,
  floorId: string,
): CpredNetRuntime {
  const before = memoryOf(runtime, who);
  if (!before) return runtime;
  const next = {
    ...before,
    controlled: before.controlled.filter((hold) => hold.floorId !== floorId),
  };
  return {
    ...runtime,
    memories: (runtime.memories ?? []).map((entry) => (entry === before ? next : entry)),
  };
}

/**
 * A fresh run with the character's memory folded in. Every remembered floor
 * was stood on, so it comes back entered. A node somebody else holds right now
 * (`heldElsewhere`) is not handed back — it was taken off them fair and square.
 */
export function netRestoreRun<T extends CpredNetRunState>(
  state: T,
  runtime: CpredNetRuntime,
  who: NetTryWho,
  heldElsewhere: (floorId: string) => boolean = () => false,
): { state: T; restoredHolds: string[] } {
  const memory = memoryOf(runtime, who);
  if (!memory) return { state, restoredHolds: [] };
  const holds = memory.controlled.filter(
    (hold) =>
      !heldElsewhere(hold.floorId) && !state.controlled.some((h) => h.floorId === hold.floorId),
  );
  const standing = [
    ...memory.broken,
    ...memory.identified,
    ...memory.copied,
    ...memory.controlled.map((hold) => hold.floorId),
  ];
  return {
    state: {
      ...state,
      entered: union(state.entered, standing),
      scouted: union(state.scouted, memory.scouted),
      broken: union(state.broken, memory.broken),
      identified: union(state.identified, memory.identified),
      copied: union(state.copied, memory.copied),
      controlled: [...state.controlled, ...holds],
    },
    restoredHolds: holds.map((hold) => hold.floorId),
  };
}

function readMemories(raw: unknown): CpredNetMemory[] {
  return (Array.isArray(raw) ? raw : [])
    .map((entry) => entry as Record<string, unknown>)
    .filter((entry) => typeof entry?.characterId === 'string' && typeof entry?.sceneId === 'string')
    .map((entry) => ({
      characterId: entry.characterId as string,
      sceneId: entry.sceneId as string,
      broken: stringList(entry.broken),
      identified: stringList(entry.identified),
      copied: stringList(entry.copied),
      scouted: stringList(entry.scouted),
      controlled: (Array.isArray(entry.controlled) ? entry.controlled : [])
        .map((hold) => hold as Record<string, unknown>)
        .filter((hold) => typeof hold?.floorId === 'string' && Number.isInteger(hold?.dv))
        .map((hold) => ({ floorId: hold.floorId as string, dv: hold.dv as number })),
    }));
}

/** One spent try — see `CpredNetRuntime.spentTries`. */
export interface CpredNetTry {
  characterId: string;
  sceneId: string;
  ability: NetAbilityId;
  /** The floor it was used on; '' for an ability limited per Architecture. */
  floorId: string;
}

export interface CpredNetTryLimit {
  /** What one try covers: the floor stood on, or the whole Architecture. */
  per: 'floor' | 'architecture';
  /**
   * When the try is spent. A Check against a DV is spent by a failure only — a
   * success is the run's to remember (a node lost to a rival can be taken
   * back, a second Virus is a second change). An open roll (Zwiad, Maskowanie)
   * has no failure: every roll is the answer, so every roll spends the try.
   */
  spentOn: 'failure' | 'always';
}

/**
 * The one table of who may try what how often (zasada domowa MG z 02.11). An
 * ability missing here has no limit: Skaner works in meatspace, Ślizg and Paf
 * are contested in a fight that has its own rhythm.
 */
export const NET_TRY_LIMITS: Partial<Record<NetAbilityId, CpredNetTryLimit>> = {
  backdoor: { per: 'floor', spentOn: 'failure' },
  eyed: { per: 'floor', spentOn: 'failure' },
  control: { per: 'floor', spentOn: 'failure' },
  scout: { per: 'floor', spentOn: 'always' },
  cloak: { per: 'architecture', spentOn: 'always' },
  virus: { per: 'floor', spentOn: 'failure' },
};

type NetTryWho = { characterId: string; sceneId: string };

function tryFloorOf(ability: NetAbilityId, floorId: string | null | undefined): string | null {
  const limit = NET_TRY_LIMITS[ability];
  if (!limit) return null;
  if (limit.per === 'architecture') return '';
  return floorId ?? null;
}

/** Has this character already spent the try of this ability here, on this scene? */
export function netTrySpent(
  runtime: CpredNetRuntime,
  who: NetTryWho,
  ability: NetAbilityId,
  floorId: string | null | undefined,
): boolean {
  const key = tryFloorOf(ability, floorId);
  if (key === null) return false;
  return (runtime.spentTries ?? []).some(
    (entry) =>
      entry.characterId === who.characterId &&
      entry.sceneId === who.sceneId &&
      entry.ability === ability &&
      entry.floorId === key,
  );
}

/** Does this outcome spend the try? False for an ability with no limit. */
export function netTrySpentBy(ability: NetAbilityId, success: boolean): boolean {
  const limit = NET_TRY_LIMITS[ability];
  if (!limit) return false;
  return limit.spentOn === 'always' || !success;
}

/** Writes a spent try down (once — a second entry would change nothing). */
export function netRecordTry(
  runtime: CpredNetRuntime,
  who: NetTryWho,
  ability: NetAbilityId,
  floorId: string | null | undefined,
): CpredNetRuntime {
  const key = tryFloorOf(ability, floorId);
  if (key === null || netTrySpent(runtime, who, ability, floorId)) return runtime;
  const entry: CpredNetTry = {
    characterId: who.characterId,
    sceneId: who.sceneId,
    ability,
    floorId: key,
  };
  return { ...runtime, spentTries: [...(runtime.spentTries ?? []), entry] };
}

/** Every try this character spent on this scene — for the run's view. */
export function netTriesOf(runtime: CpredNetRuntime, who: NetTryWho): CpredNetTry[] {
  return (runtime.spentTries ?? []).filter(
    (entry) => entry.characterId === who.characterId && entry.sceneId === who.sceneId,
  );
}

/** The GM's „Oddaj próby": this character on this scene gets every try back. */
export function netClearTries(runtime: CpredNetRuntime, who: NetTryWho): CpredNetRuntime {
  const rest = (runtime.spentTries ?? []).filter(
    (entry) => !(entry.characterId === who.characterId && entry.sceneId === who.sceneId),
  );
  const { spentTries: _dropped, ...without } = runtime;
  return rest.length > 0 ? { ...without, spentTries: rest } : without;
}

function readSpentTries(raw: unknown): CpredNetTry[] {
  return (Array.isArray(raw) ? raw : [])
    .map((entry) => entry as Record<string, unknown>)
    .filter(
      (entry) =>
        typeof entry?.characterId === 'string' &&
        typeof entry?.sceneId === 'string' &&
        typeof entry?.floorId === 'string' &&
        typeof entry?.ability === 'string' &&
        NET_TRY_LIMITS[entry.ability as NetAbilityId] !== undefined,
    )
    .map((entry) => ({
      characterId: entry.characterId as string,
      sceneId: entry.sceneId as string,
      ability: entry.ability as NetAbilityId,
      floorId: entry.floorId as string,
    }));
}

export const EMPTY_NET_RUNTIME: CpredNetRuntime = { viruses: [] };

export function readNetRuntime(raw: unknown): CpredNetRuntime {
  if (typeof raw === 'string') {
    try {
      return readNetRuntime(JSON.parse(raw));
    } catch {
      return { viruses: [] };
    }
  }
  if (typeof raw !== 'object' || raw === null) return { viruses: [] };
  const input = raw as Record<string, unknown>;
  const viruses = (Array.isArray(input.viruses) ? input.viruses : [])
    .map((entry) => entry as Record<string, unknown>)
    .filter(
      (entry) =>
        typeof entry?.id === 'string' &&
        typeof entry?.description === 'string' &&
        Number.isInteger(entry?.dv),
    )
    .map((entry) => ({
      id: entry.id as string,
      description: entry.description as string,
      dv: entry.dv as number,
      author: typeof entry.author === 'string' ? entry.author : '',
      createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : '',
    }));
  const devices = readNetDeviceStates(input.devices);
  const spentTries = readSpentTries(input.spentTries);
  const memories = readMemories(input.memories);
  return {
    viruses,
    ...(Number.isInteger(input.maskDv) ? { maskDv: input.maskDv as number } : {}),
    ...(typeof input.maskedBy === 'string' ? { maskedBy: input.maskedBy } : {}),
    ...(devices.length > 0 ? { devices } : {}),
    ...(spentTries.length > 0 ? { spentTries } : {}),
    ...(memories.length > 0 ? { memories } : {}),
    ...(input.defensePaused === true ? { defensePaused: true } : {}),
  };
}

// ──────────────────────────────── ruch po szybie ────────────────────────────────

export type NetMoveProblem = 'NET_NO_SUCH_FLOOR' | 'NET_PASSWORD_BLOCKS';

export interface NetMoveVerdict {
  ok: boolean;
  problem?: NetMoveProblem;
  /** The password that stopped the lift, so the refusal can name it. */
  blockedBy?: CpredNetFloor;
  path?: CpredNetPosition[];
}

/**
 * May the lift go there? „W swojej Turze możesz dowolnie przemieścić się
 * wewnątrz Architektury Sieciowej. Nie możesz jednak ominąć przeszkody
 * sieciowej, która blokuje ci drogę, takiej jak hasło" (s. 198).
 *
 * The password floor itself is reachable — it has to be, or nobody could ever
 * Backdoor it. What it stops is everything below — including when the
 * netrunner is standing on it: `netRunPath` leaves the start out, so until
 * 27.09.2026 a password on the entry floor (the usual build) guarded nothing
 * (#31). The start counts only on the way *down*; climbing back up off an
 * unbroken password goes nowhere it protects.
 */
export function netCanMove(
  architecture: CpredNetArchitecture,
  state: CpredNetRunState,
  to: CpredNetPosition,
): NetMoveVerdict {
  const path = netRunPath(architecture, state.position, to);
  if (!path) return { ok: false, problem: 'NET_NO_SUCH_FLOOR' };
  const broken = new Set(state.broken);
  const descending =
    path.length > 0 &&
    ancestry(architecture, to).some((step) => netSamePosition(step, state.position));
  const passed = descending ? [state.position, ...path.slice(0, -1)] : path.slice(0, -1);
  for (const step of passed) {
    const floor = netFloorAt(architecture, step);
    if (floor && floor.kind === 'password' && !broken.has(floor.id)) {
      return { ok: false, problem: 'NET_PASSWORD_BLOCKS', blockedBy: floor };
    }
  }
  return { ok: true, path };
}

/** The run after walking there, with every floor on the way marked entered. */
export function netMove(
  state: CpredNetRunState,
  path: readonly CpredNetPosition[],
  floorIds: readonly string[],
): CpredNetRunState {
  const last = path[path.length - 1];
  if (!last) return state;
  const entered = new Set(state.entered);
  for (const id of floorIds) entered.add(id);
  return { ...state, position: last, entered: [...entered] };
}

// ───────────────────────────────────── Zwiad ─────────────────────────────────────

/**
 * House rule (10.11.2026), replacing RAW „widzisz tyle pięter Architektury, ile
 * wyniosła wartość Testu" (s. 200): a Check of 12+ used to light up the whole
 * shaft, and the GM wants Zwiad to answer one question — what waits one floor
 * down, and is it worth going there.
 *
 * So it shows only the floors directly below the netrunner: the next trunk floor
 * and the top of every branch hanging off this one — a junction shows all its
 * doors. The kind and label travel, the DV does not (`netRunView`). What is left
 * of RAW's „pierwsza przeszkoda z PT wyższym niż rzut na Zwiad blokuje pole
 * widzenia" is the floor underfoot: standing on a password nobody has broken,
 * the Check has to reach its DV to see through it.
 */
export function netScoutReveal(
  architecture: CpredNetArchitecture,
  state: CpredNetRunState,
  total: number,
): string[] {
  const here = netFloorAt(architecture, state.position);
  if (
    here?.kind === 'password' &&
    !state.broken.includes(here.id) &&
    here.dv !== undefined &&
    here.dv > total
  ) {
    return [];
  }
  const known = new Set([...state.entered, ...state.scouted]);
  const revealed: string[] = [];
  for (const step of netChildren(architecture, state.position)) {
    const floor = netFloorAt(architecture, step);
    if (!floor || known.has(floor.id)) continue;
    known.add(floor.id);
    revealed.push(floor.id);
  }
  return revealed;
}

// ───────────────────────────── widok filtrowany ─────────────────────────────

/** How much of a floor the viewer has earned. */
export type NetFloorKnowledge = 'hidden' | 'scouted' | 'entered';

/** One floor as it leaves the server for a given pair of eyes. */
export interface NetFloorView {
  id: string;
  branchId: string;
  index: number;
  depth: number;
  knowledge: NetFloorKnowledge;
  /** Null while the floor is still a question mark — the GM's plan never has one. */
  kind: NetFloorKind | null;
  label?: string;
  /** Only once the floor has been stood on — Zwiad „nie podaje PT". */
  dv?: number;
  programIds?: string[];
  /** GM's own note; also what Ajdi tells the netrunner about a File. */
  notes?: string;
  broken?: boolean;
  identified?: boolean;
  copied?: boolean;
  controlledDv?: number;
  /**
   * What this control node is wired to (stage 26d) — present only once the node
   * has been taken, or for the GM. „Po przejęciu kontroli nad węzłem" is when
   * the netrunner learns what hangs off it, so before that there is nothing in
   * the payload to read.
   */
  devices?: NetDeviceView[];
  /** Set when this node was already activated in the current round. */
  nodeUsed?: boolean;
  /** This netrunner already failed this floor's hack on this scene — no second try. */
  hackFailed?: boolean;
  here?: boolean;
  /**
   * Stage 70a, on the floor stood on only: a Virus may be left here. The server
   * says so, because the client no longer has a shaft to find the bottom in.
   */
  virusAllowed?: boolean;
}

export interface NetShaftBranchView {
  id: string;
  name?: string;
  trunk: boolean;
  /** Trunk floor this hangs off; null on the trunk itself. */
  parentFloor: number | null;
  floors: NetFloorView[];
}

/** What the netrunner knows about a floor directly below (stage 70a). */
export type NetExitKnowledge = 'unknown' | 'scouted' | 'entered';

/**
 * One way down from the floor stood on (stage 70a).
 *
 * An unknown exit carries where it leads and nothing else: no floor id, no
 * kind, no label. `to` is the address `netrun:move` takes, not a description.
 */
export interface NetExitView {
  to: CpredNetPosition;
  knowledge: NetExitKnowledge;
  /** The door of a side branch rather than the next floor of this column. */
  branch?: boolean;
  /** From Zwiad or from having stood there — never for an unknown exit. */
  kind?: NetFloorKind;
  label?: string;
  branchName?: string;
  /** An unbroken password underfoot holds every way down. */
  blocked?: boolean;
}

/**
 * One floor the netrunner has stood on (stage 70a) — the trail back.
 *
 * Carries the floor id, because everything about an entered floor is known and
 * a held node's devices are operated by it.
 */
export interface NetTrailStep {
  id: string;
  position: CpredNetPosition;
  depth: number;
  kind: NetFloorKind;
  label?: string;
  /** On the route from the top of the shaft to where the netrunner stands. */
  onPath: boolean;
  here?: boolean;
  broken?: boolean;
  identified?: boolean;
  copied?: boolean;
  controlledDv?: number;
  hackFailed?: boolean;
  nodeUsed?: boolean;
  /** A held node's devices — its payout, wherever the netrunner stands now. */
  devices?: NetDeviceView[];
}

export interface NetRunView {
  architectureId: string;
  /**
   * The GM's copy only (#32, 27.09.2026). A player's window says „SIEĆ": the
   * name is the GM's label for a building, and the access point's view drops it
   * for the same reason (`toAccessPointView`).
   */
  architectureName?: string;
  position: CpredNetPosition;
  /** The floor stood on, whole. Null only when the build lost it mid-run. */
  here: NetFloorView | null;
  /** The ways off this floor: up when there is one, down one per floor below. */
  exits: { up: CpredNetPosition | null; down: NetExitView[] };
  /** Floors stood on, the route from the top first and in order of descent. */
  trail: NetTrailStep[];
  /**
   * The devices of the node stood on **before** it is taken (decyzja MG nr 2
   * z 11.11): the table's name and the kind, nothing else. After Kontrola the
   * floor carries the full `devices` instead.
   */
  nodeDevices?: NetSightedDevice[];
  /**
   * The whole shaft — **the GM's copy only** (stage 70a). A player's payload has
   * no such field: floors they have not reached do not exist in it.
   */
  shaft?: NetShaftBranchView[];
  netActionsMax: number;
  virus: CpredNetVirusProgress | null;
  /** Viruses this viewer knows about: the GM's whole list, the runner's own. */
  viruses: CpredNetVirus[];
  /** Programs, Black ICE and what is stuck to the netrunner (stage 26c). */
  combat: NetCombatView;
  /**
   * Demons defending this Architecture (stage 26e). Already cut for the viewer:
   * one that has not started hunting is absent from a player's copy entirely.
   */
  demons: NetDemonView[];
  /**
   * Abilities whose one try this netrunner already spent where they stand, on
   * this scene (`NET_TRY_LIMITS`) — the window greys them out.
   */
  spentAbilities: NetAbilityId[];
  /** How many tries this netrunner spent on this scene, for the GM's „Oddaj próby". */
  spentTries: number;
  /**
   * The GM's copy only (stage 70e): is the defence of this Architecture on the
   * brake? A player is not told whether the building answers by itself.
   */
  defensePaused?: boolean;
}

/**
 * May a **player** send the lift there (stage 70a)? Only to a floor already
 * stood on, or through one of the doors of the floor underfoot.
 *
 * Asked before `netCanMove`, and answered with the refusal a floor that does not
 * exist gets: otherwise `netrun:move` to a guessed position tells „there is
 * such a floor, a password is in the way" from „there is none", and the depth of
 * the shaft can be felt out one request at a time. The GM is not asked.
 */
export function netMoveAllowedFor(
  architecture: CpredNetArchitecture,
  state: CpredNetRunState,
  to: CpredNetPosition,
): boolean {
  const floor = netFloorAt(architecture, to);
  if (!floor) return false;
  if (state.entered.includes(floor.id)) return true;
  return netChildren(architecture, state.position).some((step) => netSamePosition(step, to));
}

/**
 * The run as one pair of eyes may see it.
 *
 * The whole point of „gracze nie widzą nieodkrytych pięter" lives in this
 * function: it runs on the server, before the payload is built. Since stage 70a
 * a player gets the floor underfoot, the doors out of it and the floors already
 * stood on — and **nothing** of the rest: no placeholder, no id, no count. How
 * deep the shaft goes is not in the message for a curious client to read.
 */
export function netRunView(
  architecture: CpredNetArchitecture,
  state: CpredNetRunState,
  options: {
    gm: boolean;
    netActionsMax: number;
    runtime?: CpredNetRuntime;
    combat: NetCombatView;
    /** Stage 26e, already filtered for this pair of eyes. */
    demons?: NetDemonView[];
    /**
     * Stage 26d: the device list of a control node, already cut for this pair of
     * eyes. Passed in rather than built here because a device names a catalogue
     * entry, and looking one up is the server's business.
     */
    devicesOf?: (floor: CpredNetFloor) => NetDeviceView[];
    /** Round the fight is in, for the „raz na Turę" flag on a node. */
    round?: number | null;
    /** Stage 70a: the devices of the node stood on, as the table names them. */
    nodeDevices?: NetSightedDevice[];
    /** Tries this run's character spent on this scene (`netTriesOf`). */
    tries?: CpredNetTry[];
  },
): NetRunView {
  const tries = options.tries ?? [];
  // A floor hack (Backdoor, Ajdi, Kontrola) lost on a floor marks the floor itself.
  const failed = new Set(
    tries
      .filter((entry) => NET_ABILITIES.some((a) => a.id === entry.ability && a.floorKind))
      .map((entry) => entry.floorId),
  );
  const hereFloor = netFloorAt(architecture, state.position) ?? null;
  // `tries` is already this character's on this scene, so only the key is left.
  const spentAbilities = NET_ABILITIES.filter((entry) => {
    const key = tryFloorOf(entry.id, hereFloor?.id ?? null);
    return (
      key !== null && tries.some((spent) => spent.ability === entry.id && spent.floorId === key)
    );
  }).map((entry) => entry.id);
  const entered = new Set(state.entered);
  const scouted = new Set(state.scouted);
  const broken = new Set(state.broken);
  const identified = new Set(state.identified);
  const copied = new Set(state.copied);
  const holds = new Map(state.controlled.map((hold) => [hold.floorId, hold.dv]));
  const round = options.round ?? null;
  const usedNodes = new Set(
    round === null ? [] : state.nodeUse.filter((use) => use.round === round).map((u) => u.floorId),
  );
  const isHere = (branchId: string, index: number) =>
    state.position.branchId === branchId && state.position.floor === index;

  /** The marks a floor carries once it is known — shared by card, trail and plan. */
  const marksOf = (floor: CpredNetFloor) => ({
    ...(broken.has(floor.id) ? { broken: true } : {}),
    ...(identified.has(floor.id) ? { identified: true } : {}),
    ...(copied.has(floor.id) ? { copied: true } : {}),
    ...(holds.has(floor.id) ? { controlledDv: holds.get(floor.id)! } : {}),
    ...(usedNodes.has(floor.id) ? { nodeUsed: true } : {}),
    ...(failed.has(floor.id) ? { hackFailed: true } : {}),
  });
  // Stage 26d: the devices of a node are its payout, so they travel once the
  // Check has been passed — and always to the GM, who authored them.
  const devicesOf = (floor: CpredNetFloor): NetDeviceView[] =>
    floor.kind === 'controlNode' && (options.gm || holds.has(floor.id))
      ? (options.devicesOf?.(floor) ?? [])
      : [];

  /** A floor the viewer is entitled to in full: stood on, or the GM's plan. */
  const fullFloor = (branch: CpredNetBranch, floor: CpredNetFloor, index: number): NetFloorView => {
    // Ajdi is what a File pays out: „pozwala określić, czym jest znaleziony
    // fragment danych […] i poznać jego wartość" — so the GM's note on that
    // one floor stops being GM-only the moment the Check succeeds.
    const showNotes = options.gm || (floor.kind === 'file' && identified.has(floor.id));
    const devices = devicesOf(floor);
    return {
      id: floor.id,
      branchId: branch.id,
      index,
      depth: branchTop(branch) + index,
      knowledge: 'entered',
      kind: floor.kind,
      ...(floor.label ? { label: floor.label } : {}),
      ...(floor.dv !== undefined ? { dv: floor.dv } : {}),
      ...(floor.programIds?.length ? { programIds: floor.programIds } : {}),
      ...(showNotes && floor.notes ? { notes: floor.notes } : {}),
      ...marksOf(floor),
      ...(devices.length > 0 ? { devices } : {}),
      ...(isHere(branch.id, index) ? { here: true } : {}),
    };
  };

  const hereBranch = branchOf(architecture, state.position.branchId);
  const here: NetFloorView | null =
    hereBranch && hereFloor
      ? {
          ...fullFloor(hereBranch, hereFloor, state.position.floor),
          ...(netIsBottom(architecture, state.position) ? { virusAllowed: true } : {}),
        }
      : null;

  const blocked = hereFloor?.kind === 'password' && !broken.has(hereFloor.id);
  const down: NetExitView[] = netChildren(architecture, state.position).flatMap((to) => {
    const branch = branchOf(architecture, to.branchId);
    const floor = netFloorAt(architecture, to);
    if (!branch || !floor) return [];
    const knowledge: NetExitKnowledge = entered.has(floor.id)
      ? 'entered'
      : scouted.has(floor.id)
        ? 'scouted'
        : 'unknown';
    const known = options.gm || knowledge !== 'unknown';
    const sideDoor = to.branchId !== state.position.branchId;
    return [
      {
        to,
        knowledge,
        ...(sideDoor ? { branch: true } : {}),
        ...(known ? { kind: floor.kind } : {}),
        ...(known && floor.label ? { label: floor.label } : {}),
        ...(known && sideDoor && branch.name ? { branchName: branch.name } : {}),
        ...(blocked ? { blocked: true } : {}),
      },
    ];
  });

  const route = ancestry(architecture, state.position);
  const onRoute = (position: CpredNetPosition) =>
    route.some((step) => netSamePosition(step, position));
  const stepOf = (rung: CpredNetRung): NetTrailStep => {
    const position = { branchId: rung.branchId, floor: rung.index };
    const devices = holds.has(rung.floor.id) ? devicesOf(rung.floor) : [];
    return {
      id: rung.floor.id,
      position,
      depth: rung.depth,
      kind: rung.floor.kind,
      ...(rung.floor.label ? { label: rung.floor.label } : {}),
      onPath: onRoute(position),
      ...(isHere(rung.branchId, rung.index) ? { here: true } : {}),
      ...marksOf(rung.floor),
      ...(devices.length > 0 ? { devices } : {}),
    };
  };
  const stood = netShaftRungs(architecture)
    .filter((rung) => entered.has(rung.floor.id))
    .map(stepOf);
  const trail = [
    ...stood.filter((step) => step.onPath).sort((a, b) => a.depth - b.depth),
    ...stood.filter((step) => !step.onPath),
  ];

  const nodeDevices =
    hereFloor?.kind === 'controlNode' && !holds.has(hereFloor.id) && !options.gm
      ? (options.nodeDevices ?? [])
      : [];

  const shaft: NetShaftBranchView[] | undefined = options.gm
    ? architecture.branches.map((branch) => ({
        id: branch.id,
        ...(branch.name ? { name: branch.name } : {}),
        trunk: branch.parentFloor === null,
        parentFloor: branch.parentFloor,
        floors: branch.floors.map((floor, index) => fullFloor(branch, floor, index)),
      }))
    : undefined;

  return {
    architectureId: architecture.id,
    ...(options.gm ? { architectureName: architecture.name } : {}),
    position: state.position,
    here,
    exits: { up: netParent(architecture, state.position), down },
    trail,
    ...(nodeDevices.length > 0 ? { nodeDevices } : {}),
    ...(shaft ? { shaft } : {}),
    netActionsMax: options.netActionsMax,
    virus: state.virus,
    viruses: options.runtime?.viruses ?? [],
    combat: options.combat,
    demons: options.demons ?? [],
    spentAbilities,
    spentTries: tries.length,
    ...(options.gm ? { defensePaused: options.runtime?.defensePaused === true } : {}),
  };
}

// ────────────────────────────── dno Architektury ──────────────────────────────

/**
 * Is this the floor a Virus may be left on? „Gdy dotrzesz do najniższego poziomu
 * Architektury Sieci, możesz zostawić tam Wirusa" (s. 200).
 *
 * The bottom is the deepest floor of the architecture, and a tie means there is
 * no bottom at all — the same reading `netDeepestBranch` takes in 26a, and the
 * reason the GM's editor warns about two equally long branches.
 */
export function netIsBottom(
  architecture: CpredNetArchitecture,
  position: CpredNetPosition,
): boolean {
  const rungs = netShaftRungs(architecture);
  if (rungs.length === 0) return false;
  let deepest = -1;
  let deepestCount = 0;
  for (const rung of rungs) {
    if (rung.depth > deepest) {
      deepest = rung.depth;
      deepestCount = 1;
    } else if (rung.depth === deepest) {
      deepestCount += 1;
    }
  }
  if (deepestCount !== 1) return false;
  const here = rungs.find(
    (rung) => rung.branchId === position.branchId && rung.index === position.floor,
  );
  return here !== undefined && here.depth === deepest;
}

// ──────────────────────────────── odmowy po polsku ────────────────────────────────

export type NetRunProblem =
  | 'NET_NO_INTERFACE'
  | 'NET_NO_DECK'
  | 'NET_OUT_OF_RANGE'
  | 'NET_WALL_BLOCKS'
  | 'NET_ALREADY_JACKED'
  | 'NET_NOT_JACKED'
  | 'NET_NO_SUCH_FLOOR'
  | 'NET_PASSWORD_BLOCKS'
  | 'NET_WRONG_FLOOR'
  | 'NET_HACK_FAILED'
  | 'NET_TRY_SPENT'
  | 'NET_NOT_BOTTOM'
  | 'NET_NO_ACTIONS'
  | 'NET_ABILITY_UNKNOWN'
  | 'NET_ABILITY_LATER'
  | 'NET_ARCHITECTURE_EMPTY'
  | 'NET_NO_ACCESS_POINT'
  | 'NET_JACKED_IN_MOVE';

export const NET_RUN_PROBLEM_MESSAGES: Record<NetRunProblem, string> = {
  NET_NO_INTERFACE: 'Ta postać nie ma zdolności Interfejs — bez niej nie da się sieciować.',
  NET_NO_DECK: 'Ta postać nie ma cyberdeku. Bez deku nie ma czym się podłączyć.',
  NET_OUT_OF_RANGE: 'Za daleko od punktu dostępu — trzeba być w promieniu 6 metrów.',
  NET_WALL_BLOCKS: 'Między tobą a punktem dostępu stoi ściana.',
  NET_ALREADY_JACKED: 'Ta postać jest już podłączona do Architektury Sieciowej.',
  NET_NOT_JACKED: 'Ta postać nie jest podłączona do żadnej Architektury.',
  NET_NO_SUCH_FLOOR: 'Nie ma takiego piętra w tej Architekturze.',
  NET_PASSWORD_BLOCKS: 'Hasło blokuje drogę — nie da się go ominąć.',
  NET_WRONG_FLOOR: 'Na tym piętrze nie ma czego użyć tą zdolnością.',
  NET_HACK_FAILED:
    'Ta postać już raz poległa na tym piętrze na tej scenie — drugiej próby nie ma (MG może ją oddać).',
  NET_TRY_SPENT:
    'Ta postać już raz użyła tu tej zdolności na tej scenie — drugiej próby nie ma (MG może ją oddać).',
  NET_NOT_BOTTOM: 'Wirusa zostawia się wyłącznie na dnie Architektury.',
  NET_NO_ACTIONS: 'Nie masz już Akcji Sieciowych w tej turze.',
  NET_ABILITY_UNKNOWN: 'Nie znam takiej zdolności Interfejsu.',
  NET_ABILITY_LATER: 'Ślizg i Paf to testy sporne — najpierw wskaż Czarnego LOD-a.',
  NET_ARCHITECTURE_EMPTY: 'Ta Architektura nie ma ani jednego piętra.',
  NET_NO_ACCESS_POINT: 'Nie ma tu punktu dostępu do Sieci.',
  NET_JACKED_IN_MOVE:
    'Postać jest podłączona do Sieci — żeby się ruszyć, najpierw odłącz się w oknie Sieci.',
};

/** „Hasło (PT 12) blokuje drogę" — the refusal with the floor named. */
export function netMoveRefusal(verdict: NetMoveVerdict): string {
  if (verdict.problem === 'NET_PASSWORD_BLOCKS' && verdict.blockedBy) {
    const floor = verdict.blockedBy;
    const name = floor.label || NET_FLOOR_KIND_LABELS[floor.kind];
    const dv = floor.dv !== undefined ? ` (PT ${floor.dv})` : '';
    return `${name}${dv} blokuje drogę — najpierw je złam Backdoorem.`;
  }
  return NET_RUN_PROBLEM_MESSAGES[verdict.problem ?? 'NET_NO_SUCH_FLOOR'];
}

// ─────────────────────────── zasięg punktu dostępu ───────────────────────────

/** „Musisz być w promieniu 6 metrów od punktu dostępu" (s. 198). */
export const NET_ACCESS_RANGE_M = 6;
