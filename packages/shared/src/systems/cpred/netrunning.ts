/**
 * Netrunning — the catalogue's shape and the Net Architecture model (stage 26a).
 *
 * Three separate things live here, and they are separate on purpose:
 *
 *  - **Program numbers** (`CpredNetProgramProfile`) ride on a compendium entry,
 *    the way ammunition effects do. Class and target are *data*: „przeciw-
 *    białkowy" and „przeciwprogramowy" decide what a Program may be pointed at,
 *    and stage 26b reads those fields rather than comparing names.
 *  - **The architecture** (`CpredNetArchitecture`) is a lift shaft: floors from
 *    the top down, optionally with side branches. It is campaign data, not
 *    scene data — the same „sieć klubu Afterlife" can hang off several places,
 *    and a run survives a scene change.
 *  - **The rolling tables** (`CpredNetrunningData`) come from a data file, like
 *    the creation and lifepath tables. The generator below is the rulebook's
 *    own step 1 and step 2 (s. 210) and nothing more.
 *
 * What deliberately is *not* here: the run itself. Where the netrunner stands,
 * what they have uncovered and which Programs are running is stage 26b's state,
 * and it points at an architecture rather than living inside one — otherwise
 * two runs against the same building would fight over one object.
 */

import type { DiceRng } from '../../dice.js';
// Type-only on purpose: `character.ts` imports this module for the registry
// field, so a value import back would close a cycle.
import type { CpredRegistry } from './character.js';
import { slugify } from './ids.js';

// ───────────────────────────────── Programy ─────────────────────────────────

/** The three non-ICE Program classes of the rulebook (s. 202). */
export const NET_PROGRAM_CLASSES = ['booster', 'defender', 'attacker'] as const;
export type NetProgramClass = (typeof NET_PROGRAM_CLASSES)[number];

export const NET_PROGRAM_CLASS_LABELS: Record<NetProgramClass, string> = {
  booster: 'Dopalacz',
  defender: 'Obrońca',
  attacker: 'Agresor',
};

/**
 * What a Program is allowed to hurt. „Program, którego Klasa wskazuje na rodzaj
 * celu […] zadaje obrażenia tylko celom odpowiedniego rodzaju" (s. 201) — so
 * this is a rule, not a label, and stage 26b refuses a mismatched target.
 */
export const NET_PROGRAM_TARGETS = ['antiPersonnel', 'antiProgram'] as const;
export type NetProgramTarget = (typeof NET_PROGRAM_TARGETS)[number];

export const NET_PROGRAM_TARGET_LABELS: Record<NetProgramTarget, string> = {
  antiPersonnel: 'przeciwbiałkowy',
  antiProgram: 'przeciwprogramowy',
};

/** Deck slots a Black ICE Program takes: „każdy zajmuje 2 gniazda deku" (s. 204). */
export const NET_BLACK_ICE_SLOTS = 2;
export const NET_PROGRAM_STAT_MAX = 30;

/** The numbers printed in the Program and Black ICE tables (s. 203–207). */
export interface CpredNetProgramProfile {
  programClass: NetProgramClass;
  /** Absent on Boosters and Defenders, which hurt nothing. */
  target?: NetProgramTarget;
  /** Black ICE hunts on its own, costs two slots and has PER/PRĘ. */
  blackIce?: boolean;
  /** „ATK" — added to the attack Check. */
  atk: number;
  /** „OBR" — added to the defence Check. */
  def: number;
  /** „REZ" — the Program's hit points; at 0 it is derezzed, not destroyed. */
  rez: number;
  /** „PER" — the DV of escaping this ICE with Ślizg. Black ICE only. */
  per?: number;
  /** „PRĘ" — contested when the ICE first spots an intruder. Black ICE only. */
  speed?: number;
  /** Deck slots; absent means one (two for Black ICE). */
  slots?: number;
  /** „Ikona" — how the Program looks in the Net. Flavour the run window prints. */
  icon?: string;
}

/** Slots a Program takes on a deck, with the Black ICE rule applied. */
export function netProgramSlots(
  profile: Pick<CpredNetProgramProfile, 'slots' | 'blackIce'>,
): number {
  if (typeof profile.slots === 'number' && profile.slots > 0) return profile.slots;
  return profile.blackIce ? NET_BLACK_ICE_SLOTS : 1;
}

// ────────────────────────────── Demony (26c) ──────────────────────────────

/**
 * Net defenders that are not Programs on a deck. Only Demons exist so far
 * (stage 26a imports them because the architecture editor places them on a
 * floor); the drones, emplacements and environmental traps of s. 212–216 come
 * with stage 26c, which is also when their fields get decided.
 */
export const NET_DEFENSE_KINDS = ['demon'] as const;
export type NetDefenseKind = (typeof NET_DEFENSE_KINDS)[number];

export const NET_DEFENSE_KIND_LABELS: Record<NetDefenseKind, string> = {
  demon: 'Demon',
};

/**
 * A Demon (s. 212). Not a Black ICE row with different labels: it has a Combat
 * Value instead of ATK/OBR, no PRĘ and no PER (passwords do not stop it, it
 * gets no free attack and Ślizg does not shake it off), and it defends with an
 * Interface Check like a netrunner. Keeping it a separate type is what stops
 * stage 26c from having to special-case a half-filled ICE.
 */
export interface CpredNetDefenseProfile {
  defenseKind: NetDefenseKind;
  rez: number;
  /** „Interfejs" — what it rolls to defend, and how deep it reaches. */
  interfaceRank: number;
  /** Net Actions per turn; a Demon spends them on control nodes first. */
  netActions: number;
  /** „Wartość bojowa" — Stat + Skill in one number, for the devices it runs. */
  combatValue: number;
  icon?: string;
}

// ──────────────────────────── Architektura Sieciowa ────────────────────────────

/** The four difficulty rungs of s. 210 („Poziom Trudności" of the whole build). */
export const NET_DIFFICULTIES = ['basic', 'standard', 'high', 'advanced'] as const;
export type NetDifficulty = (typeof NET_DIFFICULTIES)[number];

export const NET_DIFFICULTY_LABELS: Record<NetDifficulty, string> = {
  basic: 'Podstawowy',
  standard: 'Standardowy',
  high: 'Wysoki',
  advanced: 'Zaawansowany',
};

/** What waits behind the door of one floor (s. 209). */
export const NET_FLOOR_KINDS = [
  'empty',
  'password',
  'file',
  'controlNode',
  'ice',
  'demon',
] as const;
export type NetFloorKind = (typeof NET_FLOOR_KINDS)[number];

export const NET_FLOOR_KIND_LABELS: Record<NetFloorKind, string> = {
  empty: 'Puste',
  password: 'Hasło',
  file: 'Plik',
  controlNode: 'Węzeł kontrolny',
  ice: 'Czarny LOD',
  demon: 'Demon',
};

/** Floors whose challenge is a DV the netrunner rolls against. */
export const NET_FLOOR_KINDS_WITH_DV: readonly NetFloorKind[] = ['password', 'file', 'controlNode'];

/** Floors filled with Programs rather than a DV. */
export const NET_FLOOR_KINDS_WITH_PROGRAMS: readonly NetFloorKind[] = ['ice', 'demon'];

export const NET_FLOOR_DV_MIN = 1;
export const NET_FLOOR_DV_MAX = 30;
export const NET_FLOORS_MAX = 24;
export const NET_BRANCHES_MAX = 4;
export const NET_FLOOR_PROGRAMS_MAX = 4;
export const NET_ARCHITECTURE_NAME_MAX = 80;
export const NET_FLOOR_LABEL_MAX = 120;
export const NET_NOTES_MAX = 1000;

/**
 * RAW: „Architektura Sieciowa może odgałęziać się dopiero poniżej drugiego
 * piętra głównej gałęzi" (s. 210). Floors are 0-based here, so a branch may
 * hang off index 1 (the second floor) at the earliest.
 */
export const NET_BRANCH_PARENT_MIN = 1;

export interface CpredNetFloor {
  id: string;
  kind: NetFloorKind;
  /** What the players see once they open the door („Plik: listy przewozowe"). */
  label: string;
  /** DV to beat — passwords, Files and control nodes only. */
  dv?: number;
  /** Compendium ids of the Programs waiting here (Black ICE, or a Demon). */
  programIds?: string[];
  /** GM-only note; never leaves the server before the floor is uncovered. */
  notes?: string;
}

/**
 * One column of the shaft. `parentFloor` is null for the trunk; a branch hangs
 * off the trunk floor of that index and its own first floor sits one level
 * below it. RAW only ever branches off the main line, so a branch of a branch
 * is not representable — deliberately.
 */
export interface CpredNetBranch {
  id: string;
  /** Shown at the top of the column; the trunk's is optional. */
  name?: string;
  parentFloor: number | null;
  floors: CpredNetFloor[];
}

export interface CpredNetArchitecture {
  id: string;
  name: string;
  difficulty: NetDifficulty;
  /** The trunk first, then its branches. */
  branches: CpredNetBranch[];
  /** GM's own description of what this thing runs in the real world. */
  notes?: string;
}

export function netTrunk(architecture: CpredNetArchitecture): CpredNetBranch | undefined {
  return architecture.branches.find((branch) => branch.parentFloor === null);
}

/** How deep a branch reaches, counted from the top floor of the architecture. */
export function netBranchDepth(branch: CpredNetBranch): number {
  return (branch.parentFloor === null ? 0 : branch.parentFloor + 1) + branch.floors.length;
}

/** Total floors, whichever column they sit in. */
export function netFloorCount(architecture: CpredNetArchitecture): number {
  return architecture.branches.reduce((total, branch) => total + branch.floors.length, 0);
}

/**
 * The branch a Virus can be left in: „któraś gałąź zawsze musi być najdłuższa,
 * tym samym tworząc wyraźne dno tej Architektury" (s. 210). A tie means there
 * is no bottom, which is why this returns null rather than picking one.
 */
export function netDeepestBranch(architecture: CpredNetArchitecture): CpredNetBranch | null {
  let deepest: CpredNetBranch | null = null;
  let deepestDepth = 0;
  let tied = false;
  for (const branch of architecture.branches) {
    const depth = netBranchDepth(branch);
    if (depth > deepestDepth) {
      deepest = branch;
      deepestDepth = depth;
      tied = false;
    } else if (depth === deepestDepth) {
      tied = true;
    }
  }
  return tied ? null : deepest;
}

/**
 * Things the rulebook expects that a half-built architecture may not have yet.
 * Advice rather than refusal: the GM is mid-edit, and an editor that refuses to
 * save an architecture with two equally long branches is an editor that eats
 * work. Stage 26b may still refuse to *run* one.
 */
export function netArchitectureAdvice(architecture: CpredNetArchitecture): string[] {
  const advice: string[] = [];
  const trunk = netTrunk(architecture);
  if (!trunk || trunk.floors.length === 0) {
    advice.push('Architektura nie ma ani jednego piętra.');
    return advice;
  }
  if (netDeepestBranch(architecture) === null) {
    advice.push(
      'Dwie gałęzie sięgają równie głęboko — nie ma wyraźnego dna, w którym można zostawić Wirusa.',
    );
  }
  for (const branch of architecture.branches) {
    const column = branch.parentFloor === null ? 'Trzon' : (branch.name ?? 'Odgałęzienie');
    branch.floors.forEach((floor, index) => {
      if (NET_FLOOR_KINDS_WITH_DV.includes(floor.kind) && floor.dv === undefined) {
        advice.push(`${column}, piętro ${index + 1}: ${NET_FLOOR_KIND_LABELS[floor.kind]} bez PT.`);
      }
      if (NET_FLOOR_KINDS_WITH_PROGRAMS.includes(floor.kind) && !floor.programIds?.length) {
        advice.push(
          `${column}, piętro ${index + 1}: ${NET_FLOOR_KIND_LABELS[floor.kind]} bez wpisu.`,
        );
      }
    });
  }
  return advice;
}

export interface CpredNetIssue {
  field: string;
  message: string;
}

function isFloorKind(value: unknown): value is NetFloorKind {
  return typeof value === 'string' && (NET_FLOOR_KINDS as readonly string[]).includes(value);
}

export function isNetDifficulty(value: unknown): value is NetDifficulty {
  return typeof value === 'string' && (NET_DIFFICULTIES as readonly string[]).includes(value);
}

function text(raw: unknown, max: number): string {
  return typeof raw === 'string' ? raw.trim().slice(0, max) : '';
}

function floorId(index: number, branchIndex: number, raw: unknown): string {
  const given = typeof raw === 'string' ? raw.trim() : '';
  return given.length > 0 ? given.slice(0, 40) : `f${branchIndex}-${index}`;
}

function validateFloor(
  raw: unknown,
  index: number,
  branchIndex: number,
  issues: CpredNetIssue[],
): CpredNetFloor | undefined {
  if (typeof raw !== 'object' || raw === null) {
    issues.push({ field: `floor.${branchIndex}.${index}`, message: 'Nieprawidłowe piętro.' });
    return undefined;
  }
  const input = raw as Record<string, unknown>;
  const kind = isFloorKind(input.kind) ? input.kind : 'empty';

  let dv: number | undefined;
  if (NET_FLOOR_KINDS_WITH_DV.includes(kind) && input.dv !== undefined && input.dv !== null) {
    const value = input.dv;
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < NET_FLOOR_DV_MIN ||
      value > NET_FLOOR_DV_MAX
    ) {
      issues.push({
        field: `floor.${branchIndex}.${index}.dv`,
        message: `PT musi być liczbą całkowitą od ${NET_FLOOR_DV_MIN} do ${NET_FLOOR_DV_MAX}.`,
      });
    } else {
      dv = value;
    }
  }

  const programIds = NET_FLOOR_KINDS_WITH_PROGRAMS.includes(kind)
    ? (Array.isArray(input.programIds) ? input.programIds : [])
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .slice(0, NET_FLOOR_PROGRAMS_MAX)
    : [];

  const notes = text(input.notes, NET_NOTES_MAX);
  return {
    id: floorId(index, branchIndex, input.id),
    kind,
    label: text(input.label, NET_FLOOR_LABEL_MAX),
    ...(dv !== undefined ? { dv } : {}),
    ...(programIds.length > 0 ? { programIds } : {}),
    ...(notes ? { notes } : {}),
  };
}

/**
 * Validates an architecture coming from the GM editor. Hard shape only — the
 * soft rulebook expectations are `netArchitectureAdvice`.
 */
export function validateNetArchitecture(
  raw: unknown,
): { ok: true; architecture: CpredNetArchitecture } | { ok: false; issues: CpredNetIssue[] } {
  const issues: CpredNetIssue[] = [];
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, issues: [{ field: 'architecture', message: 'Nieprawidłowy format.' }] };
  }
  const input = raw as Record<string, unknown>;

  const name = text(input.name, NET_ARCHITECTURE_NAME_MAX);
  if (!name) issues.push({ field: 'name', message: 'Nazwa jest wymagana.' });

  const rawBranches = Array.isArray(input.branches) ? input.branches : [];
  const branches: CpredNetBranch[] = [];
  let floors = 0;
  let trunkFloors = 0;
  let trunkSeen = false;

  rawBranches.slice(0, NET_BRANCHES_MAX + 1).forEach((rawBranch, branchIndex) => {
    if (typeof rawBranch !== 'object' || rawBranch === null) return;
    const branch = rawBranch as Record<string, unknown>;
    const isTrunk = branch.parentFloor === null || branch.parentFloor === undefined;
    if (isTrunk && trunkSeen) {
      issues.push({ field: `branch.${branchIndex}`, message: 'Trzon może być tylko jeden.' });
      return;
    }
    const rawFloors = Array.isArray(branch.floors) ? branch.floors : [];
    const parsed = rawFloors
      .slice(0, NET_FLOORS_MAX)
      .map((floor, index) => validateFloor(floor, index, branchIndex, issues))
      .filter((floor): floor is CpredNetFloor => floor !== undefined);
    floors += parsed.length;

    if (isTrunk) {
      trunkSeen = true;
      trunkFloors = parsed.length;
      branches.unshift({
        id: floorId(branchIndex, 0, branch.id),
        ...(text(branch.name, NET_ARCHITECTURE_NAME_MAX)
          ? { name: text(branch.name, NET_ARCHITECTURE_NAME_MAX) }
          : {}),
        parentFloor: null,
        floors: parsed,
      });
      return;
    }

    const parent = branch.parentFloor;
    if (typeof parent !== 'number' || !Number.isInteger(parent) || parent < NET_BRANCH_PARENT_MIN) {
      issues.push({
        field: `branch.${branchIndex}.parentFloor`,
        message: 'Odgałęzienie może wyrastać najwcześniej z drugiego piętra trzonu.',
      });
      return;
    }
    branches.push({
      id: floorId(branchIndex, 0, branch.id),
      ...(text(branch.name, NET_ARCHITECTURE_NAME_MAX)
        ? { name: text(branch.name, NET_ARCHITECTURE_NAME_MAX) }
        : {}),
      parentFloor: parent,
      floors: parsed,
    });
  });

  if (!trunkSeen) issues.push({ field: 'branches', message: 'Architektura musi mieć trzon.' });
  if (floors > NET_FLOORS_MAX) {
    issues.push({
      field: 'branches',
      message: `Architektura mieści najwyżej ${NET_FLOORS_MAX} pięter.`,
    });
  }
  for (const branch of branches) {
    if (branch.parentFloor !== null && branch.parentFloor >= trunkFloors) {
      issues.push({
        field: 'branches',
        message: 'Odgałęzienie wyrasta z piętra, którego trzon nie ma.',
      });
    }
  }

  if (issues.length > 0) return { ok: false, issues };
  const notes = text(input.notes, NET_NOTES_MAX);
  return {
    ok: true,
    architecture: {
      id: typeof input.id === 'string' && input.id ? input.id : `net.${slugify(name)}`,
      name,
      difficulty: isNetDifficulty(input.difficulty) ? input.difficulty : 'standard',
      branches,
      ...(notes ? { notes } : {}),
    },
  };
}

// ──────────────────────────── dane z pliku (tabele) ────────────────────────────

/** One rung of the Interface -> Net Actions ladder (s. 198). */
export interface CpredNetActionBand {
  min: number;
  max: number;
  actions: number;
}

/** One rung of the architecture difficulty ladder (s. 210). */
export interface CpredNetDifficultyRung {
  id: NetDifficulty;
  dv: number;
  /** Interface rank the rulebook calls „dająca szansę na sukces". */
  suggestedInterface: number;
}

/** What a rolled floor turns out to be — the cells of both rolling tables. */
export interface CpredNetFloorRoll {
  kind: NetFloorKind;
  dv?: number;
  programIds?: string[];
}

export interface CpredNetLobbyRow extends CpredNetFloorRoll {
  /** 1d6. */
  roll: number;
}

export type CpredNetContentRow = { roll: number } & Record<NetDifficulty, CpredNetFloorRoll>;

export interface CpredNetrunningData {
  netActions: CpredNetActionBand[];
  difficulties: CpredNetDifficultyRung[];
  lobbyTable: CpredNetLobbyRow[];
  contentTable: CpredNetContentRow[];
}

export const EMPTY_CPRED_NETRUNNING_DATA: CpredNetrunningData = {
  netActions: [],
  difficulties: [],
  lobbyTable: [],
  contentTable: [],
};

function floorRoll(raw: unknown): CpredNetFloorRoll | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const input = raw as Record<string, unknown>;
  if (!isFloorKind(input.kind)) return null;
  const programIds = (Array.isArray(input.programIds) ? input.programIds : []).filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  return {
    kind: input.kind,
    ...(typeof input.dv === 'number' && Number.isInteger(input.dv) ? { dv: input.dv } : {}),
    ...(programIds.length > 0 ? { programIds } : {}),
  };
}

export function buildNetrunningData(raw: unknown): CpredNetrunningData | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const input = raw as Record<string, unknown>;

  const netActions = (Array.isArray(input.netActions) ? input.netActions : [])
    .map((band) => band as Record<string, unknown>)
    .filter(
      (band) =>
        typeof band?.min === 'number' &&
        typeof band?.max === 'number' &&
        typeof band?.actions === 'number',
    )
    .map((band) => ({
      min: band.min as number,
      max: band.max as number,
      actions: band.actions as number,
    }));

  const difficulties = (Array.isArray(input.difficulties) ? input.difficulties : [])
    .map((rung) => rung as Record<string, unknown>)
    .filter((rung) => isNetDifficulty(rung?.id) && typeof rung?.dv === 'number')
    .map((rung) => ({
      id: rung.id as NetDifficulty,
      dv: rung.dv as number,
      suggestedInterface:
        typeof rung.suggestedInterface === 'number' ? (rung.suggestedInterface as number) : 0,
    }));

  const lobbyTable = (Array.isArray(input.lobbyTable) ? input.lobbyTable : [])
    .map((row) => {
      const record = row as Record<string, unknown>;
      const content = floorRoll(row);
      return content && typeof record?.roll === 'number'
        ? { roll: record.roll as number, ...content }
        : null;
    })
    .filter((row): row is CpredNetLobbyRow => row !== null);

  const contentTable = (Array.isArray(input.contentTable) ? input.contentTable : [])
    .map((row) => {
      const record = row as Record<string, unknown>;
      if (typeof record?.roll !== 'number') return null;
      const cells = {} as Record<NetDifficulty, CpredNetFloorRoll>;
      for (const difficulty of NET_DIFFICULTIES) {
        const cell = floorRoll(record[difficulty]);
        if (!cell) return null;
        cells[difficulty] = cell;
      }
      return { roll: record.roll, ...cells } as CpredNetContentRow;
    })
    .filter((row): row is CpredNetContentRow => row !== null);

  if (netActions.length === 0 && lobbyTable.length === 0 && contentTable.length === 0) return null;
  return { netActions, difficulties, lobbyTable, contentTable };
}

export function withNetrunningData(registry: CpredRegistry, raw: unknown): CpredRegistry {
  return { ...registry, netrunning: buildNetrunningData(raw) };
}

/** The registry's netrunning tables, or the empty set that refuses politely. */
export function netrunningDataOf(registry: CpredRegistry): CpredNetrunningData {
  return registry.netrunning ?? EMPTY_CPRED_NETRUNNING_DATA;
}

/**
 * Net Actions this Interface rank buys (s. 198). Outside the ladder's rungs the
 * nearest one wins, so an Interface of 0 still gets the bottom rung's answer
 * rather than none — a netrunner with no rank cannot connect anyway.
 */
export function netActionsForInterface(rank: number, data: CpredNetrunningData): number {
  if (data.netActions.length === 0) return 0;
  const exact = data.netActions.find((band) => rank >= band.min && rank <= band.max);
  if (exact) return exact.actions;
  const sorted = [...data.netActions].sort((a, b) => a.min - b.min);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return 0;
  return rank < first.min ? first.actions : last.actions;
}

export function netDifficultyDv(difficulty: NetDifficulty, data: CpredNetrunningData): number {
  return data.difficulties.find((rung) => rung.id === difficulty)?.dv ?? 0;
}

// ───────────────────────────────── generator ─────────────────────────────────

export interface NetGeneratorOptions {
  name: string;
  difficulty: NetDifficulty;
  /** Skips step 1's shape roll and builds exactly this many floors. */
  floors?: number;
  /** Skips step 1's branch roll: this many branches, no dice. */
  branches?: number;
}

export interface NetGeneratedArchitecture {
  architecture: CpredNetArchitecture;
  /** What the dice said, for the chat line the GM gets. */
  trace: {
    floors: number;
    floorsRolled: boolean;
    branches: number;
    branchesRolled: boolean;
  };
}

const BRANCH_ROLL_MIN = 7;
const LOBBY_FLOORS = 2;
/** Give up rerolling a duplicate rather than loop: RAW has no tie-breaker. */
const REROLL_ATTEMPTS = 6;

function roll(rng: DiceRng, sides: number): number {
  return Math.max(1, Math.min(sides, Math.trunc(rng(sides))));
}

function roll3d6(rng: DiceRng): number {
  return roll(rng, 6) + roll(rng, 6) + roll(rng, 6);
}

/**
 * Steps 1 and 2 of „Tworzenie Architektury Sieciowej" (s. 210).
 *
 * Step 1: 3d6 floors, then 1d10 per branch — a 7 or higher adds one and earns
 * another roll. Step 2: the first two floors come from the Lobby table, the
 * rest from the difficulty's column of the content table.
 *
 * „Przerzucasz hasła i Programy, jeśli już zostały wylosowane" is read here as
 * *the same row* coming up twice, not *any* password coming up twice: the
 * rulebook's own sample architecture (s. 209) carries two passwords, and a
 * category-wide rule would make an eighteen-floor build impossible to fill.
 * Files and control nodes are never rerolled — the sentence does not name them.
 */
export function generateNetArchitecture(
  rng: DiceRng,
  data: CpredNetrunningData,
  options: NetGeneratorOptions,
): NetGeneratedArchitecture {
  const floorsRolled = options.floors === undefined;
  const total = Math.max(
    1,
    Math.min(NET_FLOORS_MAX, floorsRolled ? roll3d6(rng) : (options.floors ?? 0)),
  );

  const branchesRolled = options.branches === undefined;
  let branchCount = 0;
  if (branchesRolled) {
    while (branchCount < NET_BRANCHES_MAX && roll(rng, 10) >= BRANCH_ROLL_MIN) branchCount += 1;
  } else {
    branchCount = Math.max(0, Math.min(NET_BRANCHES_MAX, options.branches ?? 0));
  }
  // A branch needs a trunk floor to hang from and a floor of its own.
  branchCount = Math.min(branchCount, Math.max(0, Math.floor((total - LOBBY_FLOORS - 1) / 2)));

  const perBranch = branchCount > 0 ? Math.floor((total - LOBBY_FLOORS) / (branchCount + 2)) : 0;
  const wanted = Array.from({ length: branchCount }, () => Math.max(1, perBranch));

  /*
   * Placing the branches is where the rulebook's one hard shape rule bites:
   * „któraś gałąź zawsze musi być najdłuższa, tym samym tworząc wyraźne dno".
   * A branch hangs below trunk floor `parentFloor`, so it reaches
   * `parentFloor + 1 + size` — and that has to stay *above* the trunk's own
   * bottom. A branch that cannot fit gives its floors back to the trunk rather
   * than being squeezed in: an architecture with no bottom has nowhere to leave
   * a Virus, which is worse than one branch fewer.
   */
  const plan: { parentFloor: number; size: number }[] = [];
  let trunkFloors = total - wanted.reduce((sum, size) => sum + size, 0);
  wanted.forEach((size, index) => {
    const parentFloor = Math.min(
      NET_BRANCH_PARENT_MIN + index * 2,
      Math.max(NET_BRANCH_PARENT_MIN, trunkFloors - 2),
    );
    const fits = Math.min(size, trunkFloors - 2 - parentFloor);
    if (fits < 1) {
      trunkFloors += size;
      return;
    }
    trunkFloors += size - fits;
    plan.push({ parentFloor, size: fits });
  });

  const usedLobby = new Set<number>();
  const usedContent = new Set<number>();

  const drawLobby = (): CpredNetFloorRoll => {
    if (data.lobbyTable.length === 0) return { kind: 'empty' };
    for (let attempt = 0; attempt < REROLL_ATTEMPTS; attempt += 1) {
      const value = roll(rng, 6);
      const row = data.lobbyTable.find((entry) => entry.roll === value);
      if (!row) continue;
      if (!rerollable(row.kind) || !usedLobby.has(value)) {
        usedLobby.add(value);
        return {
          kind: row.kind,
          ...(row.dv !== undefined ? { dv: row.dv } : {}),
          ...(row.programIds ? { programIds: [...row.programIds] } : {}),
        };
      }
    }
    const fallback = data.lobbyTable[0];
    return fallback
      ? { kind: fallback.kind, ...(fallback.dv !== undefined ? { dv: fallback.dv } : {}) }
      : { kind: 'empty' };
  };

  const drawContent = (): CpredNetFloorRoll => {
    if (data.contentTable.length === 0) return { kind: 'empty' };
    for (let attempt = 0; attempt < REROLL_ATTEMPTS; attempt += 1) {
      const value = roll3d6(rng);
      const row = data.contentTable.find((entry) => entry.roll === value);
      if (!row) continue;
      const cell = row[options.difficulty];
      if (!rerollable(cell.kind) || !usedContent.has(value)) {
        usedContent.add(value);
        return { ...cell, ...(cell.programIds ? { programIds: [...cell.programIds] } : {}) };
      }
    }
    return { kind: 'empty' };
  };

  let index = 0;
  const nextFloor = (): CpredNetFloor => {
    const content = index < LOBBY_FLOORS ? drawLobby() : drawContent();
    index += 1;
    return {
      id: `f${index}`,
      kind: content.kind,
      label: '',
      ...(content.dv !== undefined ? { dv: content.dv } : {}),
      ...(content.programIds ? { programIds: content.programIds } : {}),
    };
  };

  const trunk: CpredNetBranch = {
    id: 'trunk',
    parentFloor: null,
    floors: Array.from({ length: Math.max(1, trunkFloors) }, nextFloor),
  };
  const branches: CpredNetBranch[] = plan.map((entry, branchIndex) => ({
    id: `branch-${branchIndex + 1}`,
    name: `Odgałęzienie ${branchIndex + 1}`,
    parentFloor: entry.parentFloor,
    floors: Array.from({ length: entry.size }, nextFloor),
  }));

  return {
    architecture: {
      id: `net.${slugify(options.name) || 'architektura'}`,
      name: options.name,
      difficulty: options.difficulty,
      branches: [trunk, ...branches],
    },
    trace: {
      floors: total,
      floorsRolled,
      branches: branches.length,
      branchesRolled,
    },
  };
}

function rerollable(kind: NetFloorKind): boolean {
  return kind === 'password' || kind === 'ice' || kind === 'demon';
}
