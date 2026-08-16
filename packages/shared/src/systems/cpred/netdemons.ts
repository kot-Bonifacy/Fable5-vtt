/**
 * Demony (stage 26e) — obrońca, który sam siedzi w Architekturze.
 *
 * Stage 26c put a Black ICE in the shaft and stage 26d gave the netrunner a
 * turret to point at the street. A Demon is what happens when the building
 * points that turret back. Four sentences from s. 212 shape everything here,
 * and each of them is the reason this is a separate type rather than a Black
 * ICE with different labels:
 *
 *  - **„Demony bronią się, wykonując Test Interfejsu".** No OBR column at all,
 *    so an attack against one is rolled against a Check, not against a printed
 *    number. That single difference is why `netcombat.ts`'s plans could not be
 *    reused as they stand.
 *  - **Brak PRĘ i PER.** Nothing to contest when it notices an intruder (so no
 *    free hit, unlike the encounter of s. 205) and nothing to slip away from
 *    (so Ślizg has no target number and is refused in Polish).
 *  - **„Wartość bojowa" zamiast ATK.** One number that stands for Stat + Skill,
 *    and the only thing the Demon rolls when it works a control node. It walks
 *    into the very same `performAttackRoll` the netrunner's turret uses in 26d
 *    — see `combatProfileWithCombatValue` in `statist.ts`.
 *  - **„Najpierw węzły, Paf z resztek".** The Demon's Turn has a fixed pecking
 *    order, so it is a pure function (`nextDemonStep`) the server merely walks.
 *
 * Two decisions of the GM (16.08) are baked in below:
 *
 *  - **A Demon holds every control node of its Architecture from the start.**
 *    It is the house AI; the netrunner has to take each node off it. Only a
 *    node the Demon has *rolled* for carries a raised DV (`demonHolds`) — until
 *    then the printed DV of the floor is what a Kontrola beats.
 *  - **Its Turn is one click.** The engine picks the targets; the damage card
 *    has „Cofnij", so a choice the GM dislikes costs one click to undo.
 *
 * Everything here is a pure function over the run's state; the dice, the sheets
 * and the chat cards are the server's business.
 */

import type { CpredNetDefenseProfile, NetDeviceKind } from './netrunning.js';
// Type-only on purpose: `netrun.ts` describes the run this state rides on and
// imports the view built here, so a value import back would close a cycle.
import type { CpredNetHold } from './netrun.js';
import type { NetAttackPlan, NetBonus, NetIceMode, NetRezOutcome } from './netcombat.js';
import { NET_ICE_MODES, NET_ZAP_DAMAGE_DICE, netApplyRez } from './netcombat.js';
import { netProgramDamageDice } from './netrunning.js';
import type { CpredNetProgramProfile } from './netrunning.js';

// ──────────────────────────── Demon w Architekturze ────────────────────────────

/**
 * How a Demon behaves right now. The same four states a Black ICE has (they are
 * the same four states anything in the Net can be in), with their own words: a
 * Demon does not lurk in a corner, it watches the whole building.
 */
export const NET_DEMON_MODE_LABELS: Record<NetIceMode, string> = {
  lurking: 'czuwa',
  hunting: 'ściga',
  derezzed: 'zderezowany',
  destroyed: 'zniszczony',
};

/**
 * One Demon met during this entry.
 *
 * Lives in the run rather than in the Architecture for the reason 26c's Black
 * ICE does: „Odłączenie resetuje obronę danej Architektury Sieciowej" (s. 198).
 * A Balron beaten down to 6 REZ is beaten down for *this* intrusion.
 */
export interface CpredNetDemon {
  id: string;
  /** Floor the GM put it on. It reaches everywhere — this is where it lives. */
  floorId: string;
  /** Catalogue row („Obrona Sieci", `defenseKind: 'demon'`). */
  entryId: string;
  name: string;
  profile: CpredNetDefenseProfile;
  rezCurrent: number;
  mode: NetIceMode;
  /** Tracker row carrying its Turn, while a fight is running. */
  combatantId?: string;
  /** Round of its last Turn — one Turn per Round, like everybody else. */
  lastTurnRound?: number;
}

/**
 * The Demon half of a run's state.
 *
 * A third slice next to 26b's shaft and 26c's fight, merged in the server's
 * `readFullRun`. Separate so that `netcombat.ts` — which this module reads —
 * never has to read this one back.
 */
export interface CpredNetDemonState {
  demons: CpredNetDemon[];
  /**
   * Control nodes the defence has rolled for. Absent from this list does **not**
   * mean „free": a node nobody holds belongs to the Demon at the floor's printed
   * DV (GM decision of 16.08). What a row here adds is a DV the Demon *earned*
   * with its own Test Kontroli, which is higher than the printed one.
   */
  demonHolds: CpredNetHold[];
}

export function freshNetDemonState(): CpredNetDemonState {
  return { demons: [], demonHolds: [] };
}

/** REZ of a Demon straight off its catalogue row; 0 when the row is silent. */
export function netDemonRez(profile: CpredNetDefenseProfile): number {
  return Math.max(0, profile.rez ?? 0);
}

/** Interface rank it defends and Pafs with. */
export function netDemonInterface(profile: CpredNetDefenseProfile): number {
  return Math.max(0, profile.interfaceRank ?? 0);
}

/** Net Actions it spends in its Turn. */
export function netDemonActions(profile: CpredNetDefenseProfile): number {
  return Math.max(0, profile.netActions ?? 0);
}

/** „Wartość bojowa" — what its hand on a turret's trigger is worth. */
export function netDemonCombatValue(profile: CpredNetDefenseProfile): number {
  return Math.max(0, profile.combatValue ?? 0);
}

/** One Demon, freshly instantiated from the row the GM put on a floor. */
export function netDemonInstance(input: {
  floorId: string;
  index: number;
  entryId: string;
  name: string;
  profile: CpredNetDefenseProfile;
}): CpredNetDemon {
  return {
    id: `demon-${input.floorId}-${input.index}`,
    floorId: input.floorId,
    entryId: input.entryId,
    name: input.name,
    profile: input.profile,
    rezCurrent: netDemonRez(input.profile),
    // It is awake from the moment somebody jacks in — „Demon wie o wszystkim,
    // co dzieje się w jego Architekturze" — but it does nothing until the GM
    // says it has noticed, exactly like the Black ICE of 26c.
    mode: 'lurking',
  };
}

/** Demons still able to act: neither derezzed nor erased. */
export function netLiveDemons(state: CpredNetDemonState): CpredNetDemon[] {
  return state.demons.filter((entry) => entry.mode === 'lurking' || entry.mode === 'hunting');
}

export function netDemonById(state: CpredNetDemonState, id: string): CpredNetDemon | undefined {
  return state.demons.find((entry) => entry.id === id);
}

/** The Demon list after a hit — derez and destruction are both terminal. */
export function netDamageDemon(
  state: CpredNetDemonState,
  demonId: string,
  damage: number,
  destroys?: boolean,
): { state: CpredNetDemonState; outcome: NetRezOutcome | null } {
  const target = netDemonById(state, demonId);
  if (!target) return { state, outcome: null };
  const outcome = netApplyRez(target.rezCurrent, damage, destroys);
  const mode: NetIceMode = outcome.destroyed
    ? 'destroyed'
    : outcome.derezzed
      ? 'derezzed'
      : target.mode;
  return {
    state: {
      ...state,
      demons: state.demons.map((entry) =>
        entry.id === demonId ? { ...entry, rezCurrent: outcome.after, mode } : entry,
      ),
    },
    outcome,
  };
}

// ──────────────────────────── węzły w rękach Demona ────────────────────────────

/**
 * The DV a Kontrola has to beat because the *defence* is holding this node.
 *
 * Undefined when there is nothing to add: either the Demon has never rolled for
 * this node (the floor's printed DV stands on its own) or there is no Demon
 * left to hold anything. That second half matters — beating the Demon down to
 * REZ 0 opens every node it had earned back to its printed difficulty, which is
 * the reward for winning the fight in the Net.
 */
export function netDemonHoldDv(state: CpredNetDemonState, floorId: string): number | undefined {
  if (netLiveDemons(state).length === 0) return undefined;
  return state.demonHolds.find((hold) => hold.floorId === floorId)?.dv;
}

/** After the netrunner takes a node: the defence stops holding it. */
export function netDemonLosesNode(state: CpredNetDemonState, floorId: string): CpredNetDemonState {
  if (!state.demonHolds.some((hold) => hold.floorId === floorId)) return state;
  return { ...state, demonHolds: state.demonHolds.filter((hold) => hold.floorId !== floorId) };
}

/** After the Demon's own Test Kontroli: its total becomes the new DV. */
export function netDemonTakesNode(
  state: CpredNetDemonState,
  floorId: string,
  dv: number,
): CpredNetDemonState {
  return {
    ...state,
    demonHolds: [...state.demonHolds.filter((hold) => hold.floorId !== floorId), { floorId, dv }],
  };
}

// ──────────────────────────── rzuty: Demon i przeciw Demonowi ────────────────────────────

/** „Demony bronią się, wykonując Test Interfejsu" (s. 212) — the defence side. */
export function netDemonDefence(demon: Pick<CpredNetDemon, 'name' | 'profile'>): NetBonus[] {
  const rank = netDemonInterface(demon.profile);
  return rank !== 0 ? [{ label: `Interfejs ${demon.name}`, value: rank }] : [];
}

/**
 * The netrunner firing an Aggressor at a Demon.
 *
 * The attack side is 26c's („Twój Interfejs + ATK Programu + 1k10"); only the
 * defence changes. A Demon is a Program but not a Black ICE, so the damage
 * column read is the ordinary one — a Miecz does its 3k6, not its 2k6.
 */
export function netDemonAttackPlan(input: {
  interfaceRank: number;
  program: { name: string; profile: CpredNetProgramProfile };
  demon: Pick<CpredNetDemon, 'name' | 'profile'>;
}): NetAttackPlan {
  const { interfaceRank, program, demon } = input;
  return {
    attack: [
      { label: `Interfejs ${interfaceRank}`, value: interfaceRank },
      ...(program.profile.atk !== 0
        ? [{ label: `ATK ${program.name}`, value: program.profile.atk }]
        : []),
    ],
    defence: netDemonDefence(demon),
    dice: netProgramDamageDice(program.profile, 'program'),
    label: `${program.name} → ${demon.name}`,
  };
}

/** Paf pointed at a Demon: 1k6 against its Interface Check. */
export function netDemonZapPlan(input: {
  interfaceRank: number;
  demon: Pick<CpredNetDemon, 'name' | 'profile'>;
}): NetAttackPlan {
  return {
    attack: [{ label: `Interfejs ${input.interfaceRank}`, value: input.interfaceRank }],
    defence: netDemonDefence(input.demon),
    dice: NET_ZAP_DAMAGE_DICE,
    label: `Paf → ${input.demon.name}`,
  };
}

/**
 * The Demon's own Paf, „z resztek" of its Net Actions (s. 212).
 *
 * Its Interface against the netrunner's — the same exchange as a netrunner
 * Pafing a rival, read from the other end of the cable.
 */
export function netDemonPafPlan(input: {
  demon: Pick<CpredNetDemon, 'name' | 'profile'>;
  netrunner: { name: string; interfaceRank: number };
}): NetAttackPlan {
  const rank = netDemonInterface(input.demon.profile);
  return {
    attack: rank !== 0 ? [{ label: `Interfejs ${input.demon.name}`, value: rank }] : [],
    defence: [{ label: `Interfejs ${input.netrunner.name}`, value: input.netrunner.interfaceRank }],
    dice: NET_ZAP_DAMAGE_DICE,
    label: `${input.demon.name} → ${input.netrunner.name}`,
  };
}

/** The Demon's Test Kontroli: „Interfejs + 1k10 przeciw PT" like anybody else's. */
export function netDemonControlBonuses(demon: Pick<CpredNetDemon, 'profile'>): NetBonus[] {
  const rank = netDemonInterface(demon.profile);
  return rank !== 0 ? [{ label: `Interfejs ${rank}`, value: rank }] : [];
}

// ──────────────────────────── Tura Demona ────────────────────────────

/** Kinds of device a Demon can point at the Soma. Everything else is narration. */
const NET_DEMON_FIRING_KINDS: readonly NetDeviceKind[] = ['turret', 'drone'];

/** One control node, in the little the Demon's Turn needs of it. */
export interface NetDemonNodeView {
  floorId: string;
  /** DV printed on the floor. */
  dv?: number;
  /** True while the run's netrunner is holding it. */
  heldByRunner: boolean;
  /** Already activated in this Round — „raz na Turę" counts the node (s. 199). */
  used: boolean;
  devices: {
    id: string;
    name: string;
    deviceKind: NetDeviceKind;
    on: boolean;
    /** A turret with no figure on the map has nothing to shoot from. */
    hasToken: boolean;
  }[];
}

export const NET_DEMON_STEP_KINDS = ['reclaim', 'fire', 'paf'] as const;
export type NetDemonStepKind = (typeof NET_DEMON_STEP_KINDS)[number];

export interface NetDemonStep {
  kind: NetDemonStepKind;
  /** `reclaim` and `fire`: which control node. */
  floorId?: string;
  /** `fire`: which thing hanging off it. */
  deviceId?: string;
}

/**
 * What the Demon does with its next Net Action — or null when it is out of
 * Actions, or has nothing left worth doing.
 *
 * One step at a time rather than a whole plan, on purpose: a Test Kontroli can
 * fail, and a node reclaimed successfully is a node the Demon may fire in the
 * *same* Turn. Precomputing the list would mean either forbidding that chain or
 * executing steps whose precondition has since gone.
 *
 * The pecking order is the rulebook's own („najpierw Akcje Sieciowe na obsługę
 * węzłów kontrolnych… Paf dopiero z resztek", s. 212), with one reading on top:
 * taking a node back off the netrunner comes before working the nodes it
 * already has, because a turret in the intruder's hands is the bigger problem.
 */
export function nextDemonStep(input: {
  nodes: readonly NetDemonNodeView[];
  actionsLeft: number;
  /** False when no turret has anything to shoot at (no target on the map). */
  canFire?: boolean;
  /** False when there is nobody to Paf — the netrunner has already left. */
  canPaf: boolean;
}): NetDemonStep | null {
  if (input.actionsLeft <= 0) return null;

  const stolen = input.nodes.find((node) => node.heldByRunner);
  if (stolen) return { kind: 'reclaim', floorId: stolen.floorId };

  if (input.canFire !== false) {
    for (const node of input.nodes) {
      if (node.heldByRunner || node.used) continue;
      const gun = node.devices.find(
        (device) =>
          NET_DEMON_FIRING_KINDS.includes(device.deviceKind) && device.on && device.hasToken,
      );
      if (gun) return { kind: 'fire', floorId: node.floorId, deviceId: gun.id };
    }
  }

  return input.canPaf ? { kind: 'paf' } : null;
}

// ──────────────────────────── widok dla klienta ────────────────────────────

/**
 * One Demon as one pair of eyes may see it.
 *
 * A Demon that has not started hunting is **absent** from a player's payload
 * altogether — not greyed out, not flagged. Knowing that the building has a
 * Balron in it before it moves is exactly the information a Zwiad is for.
 * Once it is hunting, the netrunner gets the name and the REZ bar (the fight is
 * about that bar); the Interface, the Combat Value and the Net Actions stay
 * with the GM, like a Black ICE's ATK and OBR in 26c.
 */
export interface NetDemonView {
  id: string;
  name: string;
  floorId: string;
  icon?: string;
  rezCurrent: number;
  rezMax: number;
  mode: NetIceMode;
  /** GM only. */
  interfaceRank?: number;
  netActions?: number;
  combatValue?: number;
  /** Control nodes it has rolled a Test Kontroli for. GM only. */
  holds?: number;
}

export function netDemonViews(state: CpredNetDemonState, options: { gm: boolean }): NetDemonView[] {
  return state.demons
    .filter((demon) => options.gm || demon.mode !== 'lurking')
    .map((demon) => ({
      id: demon.id,
      name: demon.name,
      floorId: demon.floorId,
      ...(demon.profile.icon ? { icon: demon.profile.icon } : {}),
      rezCurrent: demon.rezCurrent,
      rezMax: netDemonRez(demon.profile),
      mode: demon.mode,
      ...(options.gm
        ? {
            interfaceRank: netDemonInterface(demon.profile),
            netActions: netDemonActions(demon.profile),
            combatValue: netDemonCombatValue(demon.profile),
            holds: state.demonHolds.length,
          }
        : {}),
    }));
}

// ──────────────────────────── odczyt stanu ────────────────────────────

function readDefenseProfile(raw: unknown): CpredNetDefenseProfile | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const input = raw as Record<string, unknown>;
  if (input.defenseKind !== 'demon') return null;
  return input as unknown as CpredNetDefenseProfile;
}

/** Reads 26e's slice of a stored run. Never throws: a broken row is no Demon. */
export function readNetDemonState(raw: unknown): CpredNetDemonState {
  if (typeof raw !== 'object' || raw === null) return freshNetDemonState();
  const input = raw as Record<string, unknown>;
  const demons = (Array.isArray(input.demons) ? input.demons : [])
    .map((entry) => entry as Record<string, unknown>)
    .map((entry) => {
      const profile = readDefenseProfile(entry?.profile);
      if (!profile || typeof entry.id !== 'string' || typeof entry.floorId !== 'string') {
        return null;
      }
      const mode = (NET_ICE_MODES as readonly unknown[]).includes(entry.mode)
        ? (entry.mode as NetIceMode)
        : 'lurking';
      return {
        id: entry.id,
        floorId: entry.floorId,
        entryId: typeof entry.entryId === 'string' ? entry.entryId : '',
        name: typeof entry.name === 'string' ? entry.name : 'Demon',
        profile,
        rezCurrent: Number.isInteger(entry.rezCurrent) ? (entry.rezCurrent as number) : 0,
        mode,
        ...(typeof entry.combatantId === 'string' ? { combatantId: entry.combatantId } : {}),
        ...(Number.isInteger(entry.lastTurnRound)
          ? { lastTurnRound: entry.lastTurnRound as number }
          : {}),
      } satisfies CpredNetDemon;
    })
    .filter((entry): entry is CpredNetDemon => entry !== null);

  const demonHolds = (Array.isArray(input.demonHolds) ? input.demonHolds : [])
    .map((entry) => entry as Record<string, unknown>)
    .filter((entry) => typeof entry?.floorId === 'string' && Number.isInteger(entry?.dv))
    .map((entry) => ({ floorId: entry.floorId as string, dv: entry.dv as number }));

  return { demons, demonHolds };
}

// ──────────────────────────── odmowy po polsku ────────────────────────────

export type NetDemonProblem =
  | 'NET_DEMON_UNKNOWN'
  | 'NET_DEMON_DOWN'
  | 'NET_DEMON_ALREADY_DETECTED'
  | 'NET_DEMON_NOT_DETECTED'
  | 'NET_DEMON_ALREADY_ACTED'
  | 'NET_DEMON_NO_ACTIONS'
  | 'NET_SLIDE_VS_DEMON';

export const NET_DEMON_MESSAGES: Record<NetDemonProblem, string> = {
  NET_DEMON_UNKNOWN: 'W tej Architekturze nie ma takiego Demona.',
  NET_DEMON_DOWN: 'Ten Demon jest już zderezowany.',
  NET_DEMON_ALREADY_DETECTED: 'Ten Demon już wie o intruzie.',
  NET_DEMON_NOT_DETECTED: 'Ten Demon jeszcze nie wie o intruzie — najpierw musi go wykryć.',
  NET_DEMON_ALREADY_ACTED: 'Ten Demon miał już swoją Turę w tej Rundzie.',
  NET_DEMON_NO_ACTIONS: 'Ten Demon nie ma ani jednej Akcji Sieciowej — nie ma czym zagrać Tury.',
  NET_SLIDE_VS_DEMON:
    'Przed Demonem nie da się uciec Ślizgiem — nie ma Percepcji, przed którą można się schować.',
};
