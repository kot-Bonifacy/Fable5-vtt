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
import type { CpredNetDeviceState, CpredNetNodeUse, NetDeviceView } from './netdevices.js';
import { readNetDeviceStates, readNetNodeUses } from './netdevices.js';

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
    hint: 'Odsłaniasz tyle pięter, ile wyniósł Test — do pierwszego hasła o wyższym PT.',
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
  return {
    viruses,
    ...(Number.isInteger(input.maskDv) ? { maskDv: input.maskDv as number } : {}),
    ...(typeof input.maskedBy === 'string' ? { maskedBy: input.maskedBy } : {}),
    ...(devices.length > 0 ? { devices } : {}),
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
 * Backdoor it. What it stops is everything below.
 */
export function netCanMove(
  architecture: CpredNetArchitecture,
  state: CpredNetRunState,
  to: CpredNetPosition,
): NetMoveVerdict {
  const path = netRunPath(architecture, state.position, to);
  if (!path) return { ok: false, problem: 'NET_NO_SUCH_FLOOR' };
  const broken = new Set(state.broken);
  for (const step of path.slice(0, -1)) {
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
 * „Widzisz tyle pięter Architektury, ile wyniosła wartość Testu, ale pierwsza
 * przeszkoda z PT wyższym niż rzut na Zwiad blokuje pole widzenia" (s. 200).
 *
 * Counted downwards from where the netrunner stands, breadth first, so a
 * branching point shows both ways down — the ability is a map, and a map that
 * only ever looked one way would hide the very branch the rulebook says a Virus
 * has to be carried to. Floors already known count towards the total: the Check
 * says how far you see, not how much of it is news.
 */
export function netScoutReveal(
  architecture: CpredNetArchitecture,
  state: CpredNetRunState,
  total: number,
): string[] {
  const budget = Math.max(0, total);
  if (budget === 0) return [];
  const broken = new Set(state.broken);
  const known = new Set([...state.entered, ...state.scouted]);
  const revealed: string[] = [];
  let seen = 0;

  let frontier = netChildren(architecture, state.position);
  while (frontier.length > 0 && seen < budget) {
    const next: CpredNetPosition[] = [];
    for (const step of frontier) {
      if (seen >= budget) break;
      const floor = netFloorAt(architecture, step);
      if (!floor) continue;
      seen += 1;
      if (!known.has(floor.id)) {
        known.add(floor.id);
        revealed.push(floor.id);
      }
      // A password nobody has broken hides everything past it — unless the
      // Check already reached its DV, in which case it is no obstacle to see.
      const blocks =
        floor.kind === 'password' &&
        !broken.has(floor.id) &&
        floor.dv !== undefined &&
        floor.dv > budget;
      if (!blocks) next.push(...netChildren(architecture, step));
    }
    frontier = next;
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
  /** Null while the floor is still a `?`. */
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
  here?: boolean;
}

export interface NetShaftBranchView {
  id: string;
  name?: string;
  trunk: boolean;
  /** Trunk floor this hangs off; null on the trunk itself. */
  parentFloor: number | null;
  floors: NetFloorView[];
}

export interface NetRunView {
  architectureId: string;
  architectureName: string;
  branches: NetShaftBranchView[];
  position: CpredNetPosition;
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
}

/**
 * The shaft as one pair of eyes may see it.
 *
 * The whole point of the stage's „gracze nie widzą nieodkrytych pięter"
 * criterion lives in this function: it runs on the server, before the payload is
 * built, so a floor the netrunner has not reached carries no name, no DV and no
 * Program id — there is nothing in the message for a curious client to read.
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
  },
): NetRunView {
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

  const branches: NetShaftBranchView[] = architecture.branches.map((branch) => {
    const top = branchTop(branch);
    return {
      id: branch.id,
      ...(branch.name ? { name: branch.name } : {}),
      trunk: branch.parentFloor === null,
      parentFloor: branch.parentFloor,
      floors: branch.floors.map((floor, index) => {
        const knowledge: NetFloorKnowledge = options.gm
          ? 'entered'
          : entered.has(floor.id)
            ? 'entered'
            : scouted.has(floor.id)
              ? 'scouted'
              : 'hidden';
        const here =
          state.position.branchId === branch.id && state.position.floor === index
            ? { here: true }
            : {};
        if (knowledge === 'hidden') {
          return {
            id: floor.id,
            branchId: branch.id,
            index,
            depth: top + index,
            knowledge,
            kind: null,
            ...here,
          };
        }
        const full = knowledge === 'entered';
        // Ajdi is what a File pays out: „pozwala określić, czym jest znaleziony
        // fragment danych […] i poznać jego wartość" — so the GM's note on that
        // one floor stops being GM-only the moment the Check succeeds.
        const showNotes = options.gm || (floor.kind === 'file' && identified.has(floor.id));
        // Stage 26d: the devices of a node are its payout, so they travel once
        // the Check has been passed — and always to the GM, who authored them.
        const devices =
          floor.kind === 'controlNode' && (options.gm || holds.has(floor.id))
            ? (options.devicesOf?.(floor) ?? [])
            : [];
        return {
          id: floor.id,
          branchId: branch.id,
          index,
          depth: top + index,
          knowledge,
          kind: floor.kind,
          ...(floor.label ? { label: floor.label } : {}),
          ...(full && floor.dv !== undefined ? { dv: floor.dv } : {}),
          ...(floor.programIds?.length ? { programIds: floor.programIds } : {}),
          ...(showNotes && floor.notes ? { notes: floor.notes } : {}),
          ...(broken.has(floor.id) ? { broken: true } : {}),
          ...(identified.has(floor.id) ? { identified: true } : {}),
          ...(copied.has(floor.id) ? { copied: true } : {}),
          ...(holds.has(floor.id) ? { controlledDv: holds.get(floor.id)! } : {}),
          ...(devices.length > 0 ? { devices } : {}),
          ...(usedNodes.has(floor.id) ? { nodeUsed: true } : {}),
          ...here,
        };
      }),
    };
  });

  return {
    architectureId: architecture.id,
    architectureName: architecture.name,
    branches,
    position: state.position,
    netActionsMax: options.netActionsMax,
    virus: state.virus,
    viruses: options.runtime?.viruses ?? [],
    combat: options.combat,
    demons: options.demons ?? [],
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
  | 'NET_NOT_BOTTOM'
  | 'NET_NO_ACTIONS'
  | 'NET_ABILITY_UNKNOWN'
  | 'NET_ABILITY_LATER'
  | 'NET_ARCHITECTURE_EMPTY'
  | 'NET_NO_ACCESS_POINT';

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
  NET_NOT_BOTTOM: 'Wirusa zostawia się wyłącznie na dnie Architektury.',
  NET_NO_ACTIONS: 'Nie masz już Akcji Sieciowych w tej turze.',
  NET_ABILITY_UNKNOWN: 'Nie znam takiej zdolności Interfejsu.',
  NET_ABILITY_LATER: 'Ślizg i Paf to testy sporne — najpierw wskaż Czarnego LOD-a.',
  NET_ARCHITECTURE_EMPTY: 'Ta Architektura nie ma ani jednego piętra.',
  NET_NO_ACCESS_POINT: 'Nie ma tu punktu dostępu do Sieci.',
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
