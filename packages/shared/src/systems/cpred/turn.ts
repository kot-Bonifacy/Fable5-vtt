/**
 * CP RED action economy (stage 14b) — pure logic, no IO.
 *
 * „Twoja Tura = 1 Akcja Ruchu + 1 inna Akcja" (s. 168). Everything in this file
 * follows from that one sentence plus the rules that qualify it:
 *
 *  - an Attack Action may hold **two** attacks, but only with weapons marked
 *    LA 2 („Liczba Ataków"); the two may even come from two different LA 2
 *    weapons, which is how a pistol in one hand and a machete in the other get
 *    used in the same turn (s. 169);
 *  - an LA 1 weapon „zabiera całą Akcję Ataku", so it is never the second half
 *    of one — and two LA 1 weapons can never attack in the same Action;
 *  - „Bez względu na liczbę trzymanych broni, w ramach Akcji można wykonać
 *    tylko dwa ataki" — the hard cap, whatever the weapons say;
 *  - Aiming (s. 170) is „pojedynczy atak", and „Atak zabiera całą Akcję";
 *  - Bieg gives a second Move Action, „ale tylko wtedy, jeśli w tej Turze już
 *    wykonałeś Akcję Ruchu".
 *
 * The Liczba Ataków of a weapon is *data*, not code: „Bardzo duża broń biała"
 * carries `rof: 1` in the catalogue, so „nie można nią atakować dwa razy"
 * needs no branch here.
 *
 * The state produced here is what the tracker stores per participant. It is
 * opaque to the VTT core: the core only ever asks for a fresh one at the start
 * of a turn, hands spends back for judging, and paints the projection.
 */

import type { TurnBudgetView } from '../../combat.js';

/** What a catalogue entry costs out of the turn's budget. */
export type CpredActionCost = 'action' | 'move' | 'free';

/** One entry of the CP RED action catalogue (s. 168–169). */
export interface CpredActionDefinition {
  id: string;
  /** Polish name, exactly as the rulebook's „Skrót akcji" prints it. */
  name: string;
  cost: CpredActionCost;
  /** One-line reminder of what the action does, shown next to the button. */
  hint: string;
  /** RAW: Bieg only works once the Move Action of this turn is already spent. */
  requiresSpentMove?: boolean;
  /** Extra Move Actions this action grants (Bieg: one). */
  grantsMove?: number;
  /**
   * The action is resolved by a path of its own (attacks, reloading,
   * stabilizing) — the generic button must not book it a second time.
   */
  handledElsewhere?: boolean;
  /** Reserves the Action instead of spending it (Wstrzymanie Akcji). */
  reserves?: boolean;
}

/** Catalogue ids the rest of the code names directly. */
export const CPRED_ACTION_MOVE = 'move';
export const CPRED_ACTION_ATTACK = 'attack';
export const CPRED_ACTION_RELOAD = 'reload';
export const CPRED_ACTION_RUN = 'run';
export const CPRED_ACTION_STAND_UP = 'stand-up';
export const CPRED_ACTION_HOLD = 'hold';
export const CPRED_ACTION_STABILIZE = 'stabilize';

/**
 * The catalogue itself (s. 168–169). Mechanics, not rulebook prose: the costs
 * and conditions are the game's arithmetic, which the engine needs to run at
 * all — the flavour text stays in the private data, like every other stage.
 *
 * Vehicle actions and Net actions are listed as plain Action-costing entries.
 * Their automation belongs to a vehicle-combat stage that does not exist yet
 * and to stage 26; until then the tracker can at least book their cost.
 */
export const CPRED_ACTIONS: readonly CpredActionDefinition[] = [
  {
    id: CPRED_ACTION_MOVE,
    name: 'Akcja Ruchu',
    cost: 'move',
    hint: 'Przemieszczasz się o RUCH × 2 metrów. Ruch można rozdzielić wokół Akcji.',
  },
  {
    id: CPRED_ACTION_ATTACK,
    name: 'Atak',
    cost: 'action',
    hint: 'Atak dystansowy lub wręcz. Bronią LA 2 zmieścisz dwa ataki w jednej Akcji.',
    handledElsewhere: true,
  },
  {
    id: CPRED_ACTION_RELOAD,
    name: 'Przeładowanie',
    cost: 'action',
    hint: 'Ładujesz magazynek do pełna i wymieniasz go w broni.',
    handledElsewhere: true,
  },
  {
    id: CPRED_ACTION_RUN,
    name: 'Bieg',
    cost: 'action',
    hint: 'Druga Akcja Ruchu — tylko jeśli w tej Turze wykonałeś już Akcję Ruchu.',
    requiresSpentMove: true,
    grantsMove: 1,
  },
  {
    id: CPRED_ACTION_STAND_UP,
    name: 'Wstanie',
    cost: 'action',
    hint: 'Wstajesz po Przewróceniu. Przewrócony nie może wykonywać Akcji Ruchu.',
  },
  {
    id: CPRED_ACTION_HOLD,
    name: 'Wstrzymanie Akcji',
    cost: 'action',
    hint: 'Czekasz, by wykonać Akcję później w tej Rundzie. Akcja zostaje zarezerwowana.',
    reserves: true,
    handledElsewhere: true,
  },
  {
    id: CPRED_ACTION_STABILIZE,
    name: 'Ustabilizowanie',
    cost: 'action',
    hint: 'TECH + Pierwsza pomoc/Ratownictwo medyczne. Znosi Stan Śmiertelnie Ranny.',
    handledElsewhere: true,
  },
  {
    id: 'grapple',
    name: 'Pochwycenie',
    cost: 'action',
    hint: 'Łapiesz i trzymasz przeciwnika lub chwytasz trzymany przez niego przedmiot.',
  },
  {
    id: 'choke',
    name: 'Duszenie',
    cost: 'action',
    hint: 'Dusisz przeciwnika, którego Pochwyciłeś.',
  },
  {
    id: 'throw',
    name: 'Rzut',
    cost: 'action',
    hint: 'Rzucasz Pochwyconego przeciwnika na ziemię lub ciskasz przedmiotem.',
  },
  {
    id: 'human-shield',
    name: 'Ludzka tarcza',
    cost: 'action',
    hint: 'Zasłaniasz się Pochwyconym przeciwnikiem.',
  },
  {
    id: 'skill',
    name: 'Użycie Umiejętności',
    cost: 'action',
    hint: 'Szybka czynność oparta na Umiejętności. Dłuższe zadanie to seria Akcji.',
  },
  {
    id: 'item',
    name: 'Użycie przedmiotu',
    cost: 'action',
    hint: 'Użycie przedmiotu niewymagające rzutu na Umiejętność.',
  },
  {
    id: 'holster',
    name: 'Schowanie broni',
    cost: 'action',
    hint: 'Schowanie trzymanej broni do kabury lub kieszeni zabiera Akcję.',
  },
  {
    id: 'shield',
    name: 'Przygotuj/upuść tarczę',
    cost: 'action',
    hint: 'Przygotowanie lub odrzucenie tarczy zabiera Akcję.',
  },
  {
    id: 'vehicle-enter',
    name: 'Wejście do pojazdu',
    cost: 'action',
    hint: 'Wsiadasz do pojazdu. Opuszczenie pojazdu jest częścią Akcji Ruchu.',
  },
  {
    id: 'vehicle-start',
    name: 'Uruchomienie pojazdu',
    cost: 'action',
    hint: 'Zyskujesz Ruch pojazdu i przesuwasz się na początek Kolejki Inicjatywy.',
  },
  {
    id: 'vehicle-maneuver',
    name: 'Manewr pojazdem',
    cost: 'action',
    hint: 'Niebezpieczny manewr pochłaniający całą uwagę kierowcy.',
  },
  {
    id: 'net',
    name: 'Akcje Sieciowe',
    cost: 'action',
    hint: 'Kilka Akcji wewnątrz Sieci (automatyka przyjdzie z netrunningiem).',
  },
  {
    id: 'draw-weapon',
    name: 'Dobycie broni',
    cost: 'free',
    hint: 'Sięgnięcie wolną ręką po łatwo dostępną broń nie wymaga Akcji.',
  },
  {
    id: 'drop-weapon',
    name: 'Upuszczenie broni',
    cost: 'free',
    hint: 'Upuszczenie trzymanej broni (ale nie tarczy) nie wymaga Akcji.',
  },
  {
    id: 'release-grapple',
    name: 'Uwolnienie Trzymanego',
    cost: 'free',
    hint: 'Puszczasz Pochwyconego przeciwnika.',
  },
];

const ACTION_BY_ID = new Map(CPRED_ACTIONS.map((action) => [action.id, action]));

export function cpredAction(id: string): CpredActionDefinition | undefined {
  return ACTION_BY_ID.get(id);
}

/** Move Actions a turn starts with (RAW: exactly one). */
export const CPRED_MOVE_ACTIONS_PER_TURN = 1;

/** „W ramach Akcji można wykonać tylko dwa ataki" — the hard cap (s. 169). */
export const CPRED_ATTACKS_PER_ACTION = 2;

/** The Attack Action in progress: how many attacks it holds and from what. */
export interface CpredAttackAction {
  /** Attacks already made inside this Action. */
  count: number;
  /** Weapon rows they came from, in order — LA 2 may split between two. */
  weaponRowIds: string[];
  /** Names of those weapons, so the tracker can explain itself. */
  weaponNames: string[];
  /** Nothing more fits: an LA 1 weapon, an aimed shot, or the cap was reached. */
  closed: boolean;
}

/** The Action of the turn, once something claimed it. */
export interface CpredSpentAction {
  id: string;
  label: string;
  /** Present only when the Action is an Attack Action. */
  attack?: CpredAttackAction;
}

/**
 * One participant's turn, as the tracker stores it. Deliberately serializable:
 * it survives a reconnect as a JSON column, which is what makes „zużyte akcje
 * się nie odświeżają" true rather than hopeful.
 */
export interface CpredTurnState {
  /** Move Actions granted this turn — one, plus whatever Bieg added. */
  moveMax: number;
  moveUsed: number;
  /** null = the Action is still free. */
  action: CpredSpentAction | null;
  /** How many times the GM went past the budget with this participant. */
  overspent: number;
}

export function freshCpredTurn(): CpredTurnState {
  return { moveMax: CPRED_MOVE_ACTIONS_PER_TURN, moveUsed: 0, action: null, overspent: 0 };
}

/** What the caller is trying to spend. */
export type CpredTurnSpend =
  | { kind: 'move' }
  | { kind: 'action'; actionId: string }
  | {
      kind: 'attack';
      weaponRowId: string;
      weaponName: string;
      /** Liczba Ataków of the weapon (catalogue `rof`). */
      rof: number;
      /** An aimed shot: one attack, and it takes the whole Action. */
      aimed?: boolean;
    };

export type CpredTurnProblem =
  | 'NO_ACTION_LEFT'
  | 'NO_MOVE_LEFT'
  | 'ROF_EXCEEDED'
  | 'AIM_NEEDS_FULL_ACTION'
  | 'RUN_NEEDS_MOVE'
  | 'UNKNOWN_ACTION';

export type CpredTurnResult =
  { ok: true; state: CpredTurnState } | { ok: false; error: CpredTurnProblem };

function isReadable(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Reads a stored turn state back, repairing anything a hand-edited or
 * older-schema row might hold. Never throws: a participant with an unreadable
 * budget gets a fresh turn rather than a broken fight.
 */
export function readCpredTurn(raw: unknown): CpredTurnState {
  if (typeof raw === 'string') {
    try {
      return readCpredTurn(JSON.parse(raw));
    } catch {
      return freshCpredTurn();
    }
  }
  if (!isReadable(raw)) return freshCpredTurn();

  const moveMax = Number.isInteger(raw.moveMax)
    ? Math.max(0, raw.moveMax as number)
    : CPRED_MOVE_ACTIONS_PER_TURN;
  const moveUsed = Number.isInteger(raw.moveUsed) ? Math.max(0, raw.moveUsed as number) : 0;
  const overspent = Number.isInteger(raw.overspent) ? Math.max(0, raw.overspent as number) : 0;

  let action: CpredSpentAction | null = null;
  if (isReadable(raw.action) && typeof raw.action.id === 'string') {
    const stored = raw.action;
    action = {
      id: stored.id as string,
      label: typeof stored.label === 'string' ? stored.label : (stored.id as string),
    };
    if (isReadable(stored.attack)) {
      const attack = stored.attack;
      const ids = Array.isArray(attack.weaponRowIds)
        ? attack.weaponRowIds.filter((id): id is string => typeof id === 'string')
        : [];
      const names = Array.isArray(attack.weaponNames)
        ? attack.weaponNames.filter((name): name is string => typeof name === 'string')
        : [];
      action.attack = {
        count: Number.isInteger(attack.count) ? Math.max(0, attack.count as number) : ids.length,
        weaponRowIds: ids,
        weaponNames: names,
        closed: attack.closed === true,
      };
    }
  }
  return { moveMax, moveUsed, action, overspent };
}

/**
 * Judges one spend against the budget and returns the state it would leave.
 * Never mutates its argument — the caller decides whether to keep the result
 * (a player) or to keep it *and* count the overspend (the GM, who is never
 * blocked).
 */
export function spendCpredTurn(state: CpredTurnState, spend: CpredTurnSpend): CpredTurnResult {
  if (spend.kind === 'move') return spendMove(state);
  if (spend.kind === 'attack') return spendAttack(state, spend);

  const definition = cpredAction(spend.actionId);
  if (!definition) return { ok: false, error: 'UNKNOWN_ACTION' };
  // Free actions are catalogued so the UI can name them, but they cost nothing
  // and are never refused — RAW does not track which hand is holding what.
  if (definition.cost === 'free') return { ok: true, state };
  if (definition.cost === 'move') return spendMove(state);

  if (state.action !== null) return { ok: false, error: 'NO_ACTION_LEFT' };
  if (definition.requiresSpentMove && state.moveUsed === 0) {
    return { ok: false, error: 'RUN_NEEDS_MOVE' };
  }
  return {
    ok: true,
    state: {
      ...state,
      moveMax: state.moveMax + (definition.grantsMove ?? 0),
      action: { id: definition.id, label: definition.name },
    },
  };
}

function spendMove(state: CpredTurnState): CpredTurnResult {
  if (state.moveUsed >= state.moveMax) return { ok: false, error: 'NO_MOVE_LEFT' };
  return { ok: true, state: { ...state, moveUsed: state.moveUsed + 1 } };
}

/**
 * The Attack Action. The first attack opens it; a second one fits only when
 * both the Action and the weapon allow it — which is where every LA rule of
 * s. 169 lives.
 */
function spendAttack(
  state: CpredTurnState,
  spend: Extract<CpredTurnSpend, { kind: 'attack' }>,
): CpredTurnResult {
  const aimed = spend.aimed === true;
  const rof = Number.isFinite(spend.rof) ? Math.max(1, Math.round(spend.rof)) : 1;

  if (state.action === null) {
    // An aimed shot is a single attack that eats the Action, and so is any
    // attack from an LA 1 weapon.
    const closed = aimed || rof < 2;
    return {
      ok: true,
      state: {
        ...state,
        action: {
          id: CPRED_ACTION_ATTACK,
          label: aimed ? 'Celowany atak' : 'Atak',
          attack: {
            count: 1,
            weaponRowIds: [spend.weaponRowId],
            weaponNames: [spend.weaponName],
            closed,
          },
        },
      },
    };
  }

  const open = state.action.attack;
  // The Action went to something else entirely (a reload, a run, standing up).
  if (!open) return { ok: false, error: 'NO_ACTION_LEFT' };
  if (open.closed || open.count >= CPRED_ATTACKS_PER_ACTION) {
    return { ok: false, error: 'ROF_EXCEEDED' };
  }
  // Celowanie „zabiera całą Akcję", so it can never be the second half of one.
  if (aimed) return { ok: false, error: 'AIM_NEEDS_FULL_ACTION' };
  // An LA 1 weapon takes the whole Attack Action — it does not fit in a half.
  if (rof < 2) return { ok: false, error: 'ROF_EXCEEDED' };

  const count = open.count + 1;
  return {
    ok: true,
    state: {
      ...state,
      action: {
        ...state.action,
        attack: {
          count,
          weaponRowIds: [...open.weaponRowIds, spend.weaponRowId],
          weaponNames: [...open.weaponNames, spend.weaponName],
          closed: count >= CPRED_ATTACKS_PER_ACTION,
        },
      },
    },
  };
}

/**
 * The same spend, forced through. Used for the GM's own NPCs, who are never
 * blocked — but the overspend is counted, so the tracker can say out loud that
 * this fight is being run past the rules.
 */
export function forceCpredTurn(state: CpredTurnState, spend: CpredTurnSpend): CpredTurnState {
  const attempt = spendCpredTurn(state, spend);
  if (attempt.ok) return attempt.state;
  // Past the budget: book what was spent anyway so the counters keep counting.
  const overspent = { ...state, overspent: state.overspent + 1 };
  if (spend.kind === 'move') return { ...overspent, moveUsed: overspent.moveUsed + 1 };
  if (spend.kind === 'attack') {
    const open = overspent.action?.attack;
    if (open) {
      return {
        ...overspent,
        action: {
          ...overspent.action!,
          attack: {
            count: open.count + 1,
            weaponRowIds: [...open.weaponRowIds, spend.weaponRowId],
            weaponNames: [...open.weaponNames, spend.weaponName],
            closed: open.closed,
          },
        },
      };
    }
    return {
      ...overspent,
      action: {
        id: CPRED_ACTION_ATTACK,
        label: 'Atak',
        attack: {
          count: 1,
          weaponRowIds: [spend.weaponRowId],
          weaponNames: [spend.weaponName],
          closed: true,
        },
      },
    };
  }
  const definition = cpredAction(spend.actionId);
  if (!definition || definition.cost === 'free') return state;
  if (definition.cost === 'move') return { ...overspent, moveUsed: overspent.moveUsed + 1 };
  return {
    ...overspent,
    moveMax: overspent.moveMax + (definition.grantsMove ?? 0),
    action: { id: definition.id, label: definition.name },
  };
}

/**
 * The projection the tracker paints. Core-shaped on purpose: the client renders
 * „Ruch 0/1 · Akcja 0/1 · Ataki 1/2" without knowing a single CP RED rule, so a
 * future system only has to fill the same three fields differently.
 */
export function cpredTurnBudget(state: CpredTurnState): TurnBudgetView {
  const attack = state.action?.attack;
  const notes: string[] = [];
  if (state.action) {
    notes.push(
      attack && attack.weaponNames.length > 0
        ? `${state.action.label}: ${attack.weaponNames.join(' + ')}`
        : state.action.label,
    );
  }
  return {
    resources: [
      { id: 'move', label: 'Ruch', used: state.moveUsed, max: state.moveMax },
      { id: 'action', label: 'Akcja', used: state.action ? 1 : 0, max: 1 },
      {
        id: 'attacks',
        label: 'Ataki',
        used: attack?.count ?? 0,
        // A closed Attack Action shows its real ceiling: an LA 1 shot reads
        // „1/1", not „1/2", so nobody waits for a second swing that RAW says
        // is not coming.
        max: attack?.closed ? attack.count : CPRED_ATTACKS_PER_ACTION,
      },
    ],
    ...(notes.length > 0 ? { note: notes.join(' · ') } : {}),
    ...(state.overspent > 0 ? { overspent: state.overspent } : {}),
  };
}

/** Polish refusals, shown to the player who ran out and to the GM who judges. */
export const CPRED_TURN_PROBLEM_MESSAGES: Record<CpredTurnProblem, string> = {
  NO_ACTION_LEFT: 'Nie masz już Akcji w tej turze.',
  NO_MOVE_LEFT: 'Nie masz już Akcji Ruchu w tej turze.',
  ROF_EXCEEDED: 'Ta broń nie zmieści się w rozpoczętej Akcji Ataku (LA).',
  AIM_NEEDS_FULL_ACTION: 'Celowanie zabiera całą Akcję — nie po rozpoczętym ataku.',
  RUN_NEEDS_MOVE: 'Bieg wymaga wcześniejszego wykonania Akcji Ruchu w tej turze.',
  UNKNOWN_ACTION: 'Nie znam takiej akcji.',
};
