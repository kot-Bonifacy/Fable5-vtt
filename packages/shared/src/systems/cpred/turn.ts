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
import { cpredTerrainFactor } from './movement.js';

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
  /**
   * The action only exists inside a Hold, and only for one side of it
   * (stage 14d): only the Attacker chokes, throws or lets go, and only the
   * Held one — or a third party — wrestles free.
   */
  requiresGrapple?: 'attacker' | 'defender';
}

/** Catalogue ids the rest of the code names directly. */
export const CPRED_ACTION_MOVE = 'move';
export const CPRED_ACTION_ATTACK = 'attack';
export const CPRED_ACTION_RELOAD = 'reload';
export const CPRED_ACTION_RUN = 'run';
export const CPRED_ACTION_STAND_UP = 'stand-up';
export const CPRED_ACTION_HOLD = 'hold';
export const CPRED_ACTION_STABILIZE = 'stabilize';
/** Putting yourself out (stage 14e) — the answer to „Podpalony". */
export const CPRED_ACTION_EXTINGUISH = 'extinguish';
/** Grappling (stage 14d) — each of these is resolved by `grapple:*`. */
export const CPRED_ACTION_GRAPPLE = 'grapple';
export const CPRED_ACTION_CHOKE = 'choke';
export const CPRED_ACTION_THROW = 'throw';
export const CPRED_ACTION_HUMAN_SHIELD = 'human-shield';
export const CPRED_ACTION_ESCAPE_GRAPPLE = 'escape-grapple';
export const CPRED_ACTION_RELEASE_GRAPPLE = 'release-grapple';
/**
 * The Net Actions of a Turn (stage 26b). One Action of the turn, holding several
 * uses — exactly the shape the Attack Action has, and for the same reason:
 * „W swojej Turze Netrunner może wykonać albo Akcję w Somie, albo tyle Akcji
 * sieciowych, na ile pozwala Interfejs" (s. 198) is arithmetic, not a branch.
 */
export const CPRED_ACTION_NET = 'net';
/**
 * The Scanner (stage 26b) — the one Interface ability that is *not* a Net
 * Action: „W ramach Akcji w Somie znajdujesz położenie punktów dostępu"
 * (s. 199). It takes the whole Action, like any other thing done with hands.
 */
export const CPRED_ACTION_SCANNER = 'net-scanner';
/**
 * Rearranging Zmysł Walki mid-fight (stage 30a) — „Poza walką, gdy rozpoczyna
 * się walka albo w trakcie walki (w ramach Akcji) Solo może rozdzielić punkty"
 * (s. 146).
 *
 * Only the third case costs anything, which is why this is a catalogue entry
 * rather than a rule inside the panel: the first two are free, and the
 * difference between them is „is a fight running", which is precisely what the
 * turn budget already knows.
 */
export const CPRED_ACTION_COMBAT_AWARENESS = 'combat-awareness';

/**
 * „Prowizorka" (stage 30b) — „zamiast podejmować próbę długiej naprawy, możesz
 * w ramach Akcji tymczasowo doprowadzić jakiś przedmiot do idealnego stanu"
 * (s. 147). The Action is the whole point of the rule: a Technik who could do
 * it for free would simply keep everyone's armour at full SP.
 */
export const CPRED_ACTION_FIELD_REPAIR = 'field-repair';

/**
 * „Wezwanie Wsparcia" (stage 30c) — „Aby wezwać Wsparcie, w ramach Akcji musisz
 * wyrzucić na 1k10 tyle, ile wynosi twój poziom Zdolności Specjalnej Wsparcie,
 * lub mniej" (s. 158).
 *
 * The Action is paid whether or not anybody answers, which is the sentence that
 * makes the rule a gamble rather than a button: „Jeśli nikt nie odpowie na
 * twoje wezwanie, w kolejnej Turze możesz znów spróbować".
 */
export const CPRED_ACTION_BACKUP = 'backup-call';

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
    hint: 'Ciągnij token po mapie — metry liczy serwer. Przycisk zużywa całą Akcję Ruchu (ruch poza mapą).',
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
    id: CPRED_ACTION_EXTINGUISH,
    name: 'Ugaszenie',
    cost: 'action',
    hint: 'Zbijasz z siebie płomienie. Zdejmuje Stan Podpalony, więc na koniec tury nic już nie płonie.',
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
    id: CPRED_ACTION_GRAPPLE,
    name: 'Pochwycenie',
    cost: 'action',
    hint: 'Test sporny ZW + Bijatyka. Wygrana = Trzymanie albo przedmiot z ręki celu.',
    handledElsewhere: true,
  },
  {
    id: CPRED_ACTION_ESCAPE_GRAPPLE,
    name: 'Wyrwanie się z Trzymania',
    cost: 'action',
    hint: 'Test sporny przeciw Trzymającemu. Sukces kończy Trzymanie dla wszystkich.',
    handledElsewhere: true,
  },
  {
    id: CPRED_ACTION_CHOKE,
    name: 'Duszenie',
    cost: 'action',
    hint: 'Obrażenia równe twojej BC, bez redukcji pancerzem. Trzy Rundy pod rząd = Nieprzytomny.',
    requiresGrapple: 'attacker',
    handledElsewhere: true,
  },
  {
    id: CPRED_ACTION_THROW,
    name: 'Rzut',
    cost: 'action',
    hint: 'Obrażenia równe twojej BC bez pancerza; kończy Trzymanie, a cel jest Powalony.',
    requiresGrapple: 'attacker',
    handledElsewhere: true,
  },
  {
    id: CPRED_ACTION_HUMAN_SHIELD,
    name: 'Ludzka tarcza',
    cost: 'action',
    hint: 'Zasłaniasz się Trzymanym. Chroni przed ostrzałem, nie przed bronią białą ani strzałem w głowę.',
    requiresGrapple: 'attacker',
    handledElsewhere: true,
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
    id: CPRED_ACTION_NET,
    name: 'Akcje Sieciowe',
    cost: 'action',
    hint: 'Zamiast Akcji w Somie: 2–5 Akcji wewnątrz Sieci, wedle poziomu Interfejsu.',
    handledElsewhere: true,
  },
  {
    id: CPRED_ACTION_SCANNER,
    name: 'Skaner',
    cost: 'action',
    hint: 'Akcja w Somie: szukasz w okolicy punktów dostępu do Architektur Sieciowych.',
    handledElsewhere: true,
  },
  {
    id: CPRED_ACTION_COMBAT_AWARENESS,
    name: 'Zmysł Walki',
    cost: 'action',
    hint: 'Rozdzielasz punkty Zmysłu Walki na nowo. Poza walką za darmo; w trakcie walki kosztuje Akcję.',
    handledElsewhere: true,
  },
  {
    id: CPRED_ACTION_FIELD_REPAIR,
    name: 'Prowizorka',
    cost: 'action',
    hint: 'Technik doprowadza przedmiot do pełnego OB na 10 minut na poziom Specjalizacji Naprawa.',
    handledElsewhere: true,
  },
  {
    id: CPRED_ACTION_BACKUP,
    name: 'Wezwanie Wsparcia',
    cost: 'action',
    hint: 'Stróż Prawa wzywa funkcjonariuszy: 1k10 ≤ poziom Wsparcia, potem 1k6 Rund oczekiwania.',
    handledElsewhere: true,
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
    id: CPRED_ACTION_RELEASE_GRAPPLE,
    name: 'Uwolnienie Trzymanego',
    cost: 'free',
    hint: 'Puszczasz Trzymanego — „w dowolnym momencie, nie zużywając Akcji".',
    requiresGrapple: 'attacker',
    handledElsewhere: true,
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

/**
 * The Net Actions spent inside this turn's Action (stage 26b). Interface buys
 * 2–5 of them (s. 198) and they all come out of the one Action — which is why
 * this hangs off `CpredSpentAction` rather than sitting beside it.
 */
export interface CpredNetActionUse {
  count: number;
  /** What the Interface rank allowed when the bundle was opened. */
  max: number;
  /** What they went to („Zwiad", „Backdoor"), for the tracker's tooltip. */
  labels: string[];
}

/** The Action of the turn, once something claimed it. */
export interface CpredSpentAction {
  id: string;
  label: string;
  /** Present only when the Action is an Attack Action. */
  attack?: CpredAttackAction;
  /** Present only when the Action went to Net Actions (stage 26b). */
  net?: CpredNetActionUse;
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
  /**
   * Metres of path already walked this turn (stage 14c). Hard going is already
   * counted double here — this is budget spent, not ground covered.
   */
  metresUsed: number;
  /**
   * Ground actually covered, in metres, with no multiplier on it (stage 14e).
   * The rules that ask „czy przemieściłeś się ponad 4 m na piechotę" mean this
   * number, not the budget: rubble makes a walk expensive, not longer.
   */
  metresWalked: number;
  /**
   * Metres one Move Action buys: effective RUCH × 2. Null when the participant
   * has no sheet to read it from, in which case metres are not enforced at all
   * and the turn falls back to counting whole Move Actions (stage 14b).
   */
  metresPerMove: number | null;
  /** Why the allowance is what it is („Pancerz −2"); null when nothing shrank it. */
  moveNote: string | null;
  /** The mover declared hard going („2 m budżetu za 1 m ścieżki"). */
  hardTerrain: boolean;
  /** null = the Action is still free. */
  action: CpredSpentAction | null;
  /** How many times the GM went past the budget with this participant. */
  overspent: number;
  /**
   * Ready refusal baked in when the turn began (stage 14e): a spine injury owes
   * the *next* turn its Action, so the debt has to be paid by a turn that did
   * not exist when the wound landed. Null = nothing is owed.
   */
  blockedAction: string | null;
  /** The same for the Move Action — the ear injuries after a long walk. */
  blockedMove: string | null;
}

/**
 * Which of this participant's turn hooks have already fired, and in what round
 * (stage 14e).
 *
 * Deliberately *not* part of the budget. A budget is handed out fresh whenever
 * a turn begins — and „begins" includes the GM stepping back and forward
 * through the queue, or pressing „Zwróć turę". A ledger living inside it would
 * be wiped by exactly the actions it exists to survive, and the second pass
 * would set the same NPC on fire again.
 */
export interface CpredTurnLedger {
  /** Round whose start-of-turn effects already ran (drowning, the reminders). */
  startedRound?: number;
  /** Round whose end-of-turn effects already ran (fire, poison, the ribs). */
  endedRound?: number;
  /**
   * Rounds in which a „first in the Round" Combat Awareness ability has already
   * fired (stage 30a) — Redukcja obrażeń on damage taken, Wykrycie słabości on
   * damage dealt.
   *
   * Here rather than in `turnState` for exactly the reason the two stamps above
   * are: a budget is handed out fresh whenever a turn begins, and „begins"
   * includes the GM stepping back through the queue. A Solo whose reduction was
   * refunded by the GM correcting the pointer would soak two hits in one Round.
   *
   * Keyed by round number rather than a boolean, so a stale stamp from an
   * earlier Round is simply not this Round — nothing has to be cleared.
   */
  once?: Partial<Record<CpredRoundOnceId, number>>;
}

/** Abilities that happen at most once per Round, whoever's turn it is. */
export const CPRED_ROUND_ONCE_IDS = ['damageReduction', 'weakSpot'] as const;
export type CpredRoundOnceId = (typeof CPRED_ROUND_ONCE_IDS)[number];

/** Reads a stored ledger; anything unreadable means „nothing has fired yet". */
export function readCpredTurnLedger(raw: unknown): CpredTurnLedger {
  if (typeof raw === 'string') {
    try {
      return readCpredTurnLedger(JSON.parse(raw));
    } catch {
      return {};
    }
  }
  if (!isReadable(raw)) return {};
  const value = raw as { startedRound?: unknown; endedRound?: unknown; once?: unknown };
  const once: Partial<Record<CpredRoundOnceId, number>> = {};
  if (typeof value.once === 'object' && value.once !== null) {
    const stored = value.once as Record<string, unknown>;
    for (const id of CPRED_ROUND_ONCE_IDS) {
      if (Number.isInteger(stored[id])) once[id] = stored[id] as number;
    }
  }
  return {
    ...(Number.isInteger(value.startedRound) ? { startedRound: value.startedRound as number } : {}),
    ...(Number.isInteger(value.endedRound) ? { endedRound: value.endedRound as number } : {}),
    ...(Object.keys(once).length > 0 ? { once } : {}),
  };
}

/** True when this once-a-Round ability has already fired in this Round. */
export function cpredRoundOnceUsed(
  ledger: CpredTurnLedger,
  id: CpredRoundOnceId,
  round: number,
): boolean {
  return ledger.once?.[id] === round;
}

/** Takes the stamp back off, for a hit the table took back. */
export function clearCpredRoundOnce(
  ledger: CpredTurnLedger,
  id: CpredRoundOnceId,
): CpredTurnLedger {
  if (ledger.once?.[id] === undefined) return ledger;
  const { [id]: _dropped, ...rest } = ledger.once;
  return Object.keys(rest).length > 0
    ? { ...ledger, once: rest }
    : { startedRound: ledger.startedRound, endedRound: ledger.endedRound };
}

/** Records that it has now fired, for the ledger column to keep. */
export function markCpredRoundOnce(
  ledger: CpredTurnLedger,
  id: CpredRoundOnceId,
  round: number,
): CpredTurnLedger {
  return { ...ledger, once: { ...ledger.once, [id]: round } };
}

/** True when this phase already ran for this participant in this round. */
export function cpredTurnPhaseRan(
  ledger: CpredTurnLedger,
  phase: 'turn-start' | 'turn-end',
  round: number,
): boolean {
  const stamp = phase === 'turn-start' ? ledger.startedRound : ledger.endedRound;
  return stamp !== undefined && stamp === round;
}

/** Records that this phase has now run. */
export function markCpredTurnPhase(
  ledger: CpredTurnLedger,
  phase: 'turn-start' | 'turn-end',
  round: number,
): CpredTurnLedger {
  return phase === 'turn-start'
    ? { ...ledger, startedRound: round }
    : { ...ledger, endedRound: round };
}

/** How far a participant may go, as the sheet reports it at that moment. */
export interface CpredMoveAllowance {
  /** Metres one Move Action buys; null when there is no sheet to ask. */
  metresPerMove: number | null;
  /** What shrank it, for the tracker to show („Złamana noga −4"). */
  note?: string | null;
}

/**
 * Debts one turn hands to the next (stage 14e). Produced by the end-of-turn
 * hook — or by a wound landing mid-round — and spent exactly once, by the turn
 * that starts after it.
 */
export interface CpredTurnCarryInput {
  /** Ready sentence refusing the Action for one turn. */
  noAction?: string | null;
  /** Ready sentence refusing the Move Action for one turn. */
  noMove?: string | null;
}

export function freshCpredTurn(
  allowance?: CpredMoveAllowance | null,
  carry?: CpredTurnCarryInput | null,
): CpredTurnState {
  return {
    moveMax: CPRED_MOVE_ACTIONS_PER_TURN,
    moveUsed: 0,
    metresUsed: 0,
    metresWalked: 0,
    metresPerMove: normalizeMetresPerMove(allowance?.metresPerMove),
    moveNote: allowance?.note ?? null,
    hardTerrain: false,
    action: null,
    overspent: 0,
    blockedAction: carry?.noAction ?? null,
    blockedMove: carry?.noMove ?? null,
  };
}

/**
 * Re-reads the allowance onto a turn already in progress. Called before every
 * move is judged, so armor taken off — or a leg broken on somebody else's turn
 * — changes what is left of *this* turn rather than only the next one.
 */
export function withCpredMoveAllowance(
  state: CpredTurnState,
  allowance: CpredMoveAllowance | null,
): CpredTurnState {
  const metresPerMove = normalizeMetresPerMove(allowance?.metresPerMove);
  const moveNote = allowance?.note ?? null;
  if (metresPerMove === state.metresPerMove && moveNote === state.moveNote) return state;
  return { ...state, metresPerMove, moveNote };
}

/** Rounding slack, in metres: float noise must not refuse a legal last step. */
const METRE_EPSILON = 0.05;

function roundMetres(value: number): number {
  return Math.round(value * 10) / 10;
}

function normalizeMetresPerMove(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return roundMetres(value);
}

/** What the caller is trying to spend. */
export type CpredTurnSpend =
  | {
      kind: 'move';
      /**
       * Length of the path walked, in metres. Absent = „a whole Move Action",
       * which is how movement narrated off the map is booked (the „Akcja Ruchu"
       * button) and what every pre-14c caller means.
       */
      metres?: number;
      /** Override of the stored hard-going declaration for this step. */
      hard?: boolean;
    }
  | { kind: 'action'; actionId: string }
  | {
      kind: 'attack';
      weaponRowId: string;
      weaponName: string;
      /** Liczba Ataków of the weapon (catalogue `rof`). */
      rof: number;
      /** An aimed shot: one attack, and it takes the whole Action. */
      aimed?: boolean;
    }
  | {
      kind: 'net';
      /** The ability this Net Action goes to („Zwiad"). */
      label: string;
      /** Net Actions the Interface rank buys — 2 to 5 (stage 26b). */
      max: number;
    };

export type CpredTurnProblem =
  | 'NO_ACTION_LEFT'
  | 'NO_MOVE_LEFT'
  | 'ROF_EXCEEDED'
  | 'AIM_NEEDS_FULL_ACTION'
  | 'RUN_NEEDS_MOVE'
  | 'UNKNOWN_ACTION'
  /** A Critical Injury took this turn's Action away before it began (14e). */
  | 'ACTION_BLOCKED'
  /** The same for the Move Action. */
  | 'MOVE_BLOCKED'
  /** The Interface rank's Net Actions are all spent (stage 26b). */
  | 'NO_NET_ACTIONS_LEFT';

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
  // Rows written before stage 14c carry no metres at all: they read back as a
  // turn that has not walked anywhere, with the distance simply unenforced.
  const metresUsed =
    typeof raw.metresUsed === 'number' && Number.isFinite(raw.metresUsed)
      ? Math.max(0, roundMetres(raw.metresUsed))
      : 0;
  // Rows written before stage 14e carry no raw distance. Falling back to the
  // budget is the honest reading: without a hard-going declaration the two are
  // the same number, and with one it errs towards enforcing the injury.
  const metresWalked =
    typeof raw.metresWalked === 'number' && Number.isFinite(raw.metresWalked)
      ? Math.max(0, roundMetres(raw.metresWalked))
      : metresUsed;
  const metresPerMove = normalizeMetresPerMove(raw.metresPerMove as number | null | undefined);
  const moveNote = typeof raw.moveNote === 'string' ? raw.moveNote : null;
  const hardTerrain = raw.hardTerrain === true;
  const blockedAction = typeof raw.blockedAction === 'string' ? raw.blockedAction : null;
  const blockedMove = typeof raw.blockedMove === 'string' ? raw.blockedMove : null;

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
    if (isReadable(stored.net)) {
      const net = stored.net;
      const labels = Array.isArray(net.labels)
        ? net.labels.filter((label): label is string => typeof label === 'string')
        : [];
      action.net = {
        count: Number.isInteger(net.count) ? Math.max(0, net.count as number) : labels.length,
        max: Number.isInteger(net.max)
          ? Math.max(1, net.max as number)
          : Math.max(1, labels.length),
        labels,
      };
    }
  }
  return {
    moveMax,
    moveUsed,
    metresUsed,
    metresWalked,
    metresPerMove,
    moveNote,
    hardTerrain,
    action,
    overspent,
    blockedAction,
    blockedMove,
  };
}

/**
 * The mover declares hard going, or takes the declaration back. It is a
 * property of the turn, not of the map: RAW makes the *player* say „płynę",
 * and the GM sees it in the tracker (stage decision, 14c).
 */
export function setCpredHardTerrain(state: CpredTurnState, hard: boolean): CpredTurnState {
  return { ...state, hardTerrain: hard };
}

/** Metres this turn's Move Actions add up to; null when RUCH is unknown. */
export function cpredMetresMax(state: CpredTurnState): number | null {
  if (state.metresPerMove === null) return null;
  return roundMetres(state.moveMax * state.metresPerMove);
}

/** Metres still walkable; null when the participant has no RUCH to limit. */
export function cpredMetresLeft(state: CpredTurnState): number | null {
  const max = cpredMetresMax(state);
  if (max === null) return null;
  return Math.max(0, roundMetres(max - state.metresUsed));
}

/**
 * Judges one spend against the budget and returns the state it would leave.
 * Never mutates its argument — the caller decides whether to keep the result
 * (a player) or to keep it *and* count the overspend (the GM, who is never
 * blocked).
 */
export function spendCpredTurn(state: CpredTurnState, spend: CpredTurnSpend): CpredTurnResult {
  if (spend.kind === 'move') return spendMove(state, spend);
  if (spend.kind === 'attack') return spendAttack(state, spend);
  if (spend.kind === 'net') return spendNet(state, spend);

  const definition = cpredAction(spend.actionId);
  if (!definition) return { ok: false, error: 'UNKNOWN_ACTION' };
  // Free actions are catalogued so the UI can name them, but they cost nothing
  // and are never refused — RAW does not track which hand is holding what.
  if (definition.cost === 'free') return { ok: true, state };
  if (definition.cost === 'move') return spendMove(state, { kind: 'move' });

  // A wound that took the turn's Action away is not an arithmetic problem, so
  // it is answered before the budget is even consulted (stage 14e).
  if (state.blockedAction !== null) return { ok: false, error: 'ACTION_BLOCKED' };
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

/**
 * Movement (stage 14c). „Możesz przemieścić się o RUCH × 2 metry" is a *budget*,
 * not a permission slip: the turn's metres accumulate across as many drags as
 * the player likes and can be split around the Action („ruch → atak → ruch"),
 * which is why nothing here counts drags.
 *
 * Two shapes of spend meet in this function:
 *  - a **path**, in metres, from a token that was dragged across the map;
 *  - a **whole Move Action**, which is what the „Akcja Ruchu" button books for
 *    movement that happened off the map („biegnę za róg, poza kadrem") and what
 *    every caller written before this stage means.
 *
 * A participant whose RUCH is unknown (a statist with no sheet) is not policed
 * in metres at all — inventing a number for them would be worse than the GM's
 * judgement, and the GM is never blocked anyway.
 */
function spendMove(
  state: CpredTurnState,
  spend: Extract<CpredTurnSpend, { kind: 'move' }>,
): CpredTurnResult {
  const perMove = state.metresPerMove;
  const rebased = state;

  // An ear that costs this turn's Move Action refuses before any measuring —
  // telling the player they ran out of metres would send them looking for a
  // shorter route that does not exist (stage 14e).
  if (rebased.blockedMove !== null) return { ok: false, error: 'MOVE_BLOCKED' };

  if (spend.metres === undefined) {
    // A whole Move Action, unmeasured. It still eats its share of the metres,
    // so „narrated" movement cannot be followed by a full-length drag.
    if (rebased.moveUsed >= rebased.moveMax) return { ok: false, error: 'NO_MOVE_LEFT' };
    return {
      ok: true,
      state: {
        ...rebased,
        moveUsed: rebased.moveUsed + 1,
        metresUsed:
          perMove === null ? rebased.metresUsed : roundMetres(rebased.metresUsed + perMove),
        // Narrated movement covers ground too — a whole Move Action off the map
        // is exactly „RUCH × 2 metry" of walking, and the injuries count it.
        metresWalked:
          perMove === null ? rebased.metresWalked : roundMetres(rebased.metresWalked + perMove),
      },
    };
  }

  const walked = Number.isFinite(spend.metres) ? Math.max(0, spend.metres) : 0;
  const hard = spend.hard ?? rebased.hardTerrain;
  const cost = roundMetres(walked * cpredTerrainFactor(hard));
  const metresUsed = roundMetres(rebased.metresUsed + cost);
  const metresWalked = roundMetres(rebased.metresWalked + walked);

  if (perMove === null) {
    // No RUCH to measure against: book the distance, claim the Move Action,
    // refuse nothing.
    return {
      ok: true,
      state: {
        ...rebased,
        metresUsed,
        metresWalked,
        moveUsed: cost > 0 ? Math.max(rebased.moveUsed, 1) : rebased.moveUsed,
      },
    };
  }

  const max = roundMetres(rebased.moveMax * perMove);
  if (metresUsed > max + METRE_EPSILON) return { ok: false, error: 'NO_MOVE_LEFT' };
  const moveUsed = moveActionsFor(metresUsed, perMove, rebased);
  return { ok: true, state: { ...rebased, metresUsed, metresWalked, moveUsed } };
}

/**
 * How many Move Actions a distance has consumed. Derived rather than counted,
 * because a turn's metres are one pool: 13 m out of a 12 m Move Action is the
 * second Action being started, whether it took one drag or five.
 */
function moveActionsFor(metresUsed: number, perMove: number, state: CpredTurnState): number {
  if (metresUsed <= 0) return state.moveUsed;
  const spent = Math.ceil(metresUsed / perMove - METRE_EPSILON);
  return Math.min(state.moveMax, Math.max(state.moveUsed, spent));
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

  // An attack is an Action, so a wound that took the Action away takes this too.
  if (state.blockedAction !== null) return { ok: false, error: 'ACTION_BLOCKED' };

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
 * A Net Action (stage 26b). The first one claims the turn's Action; the rest sit
 * inside it until the Interface rank runs out.
 *
 * Note what falls out of this for free: a netrunner who has already shot
 * somebody this turn cannot netrun, and one who has started netrunning cannot
 * shoot. That is „albo Akcję w Somie, albo Akcje Sieciowe" (s. 198), written
 * once, in the same place every other Action of the turn is judged.
 */
function spendNet(
  state: CpredTurnState,
  spend: Extract<CpredTurnSpend, { kind: 'net' }>,
): CpredTurnResult {
  if (state.blockedAction !== null) return { ok: false, error: 'ACTION_BLOCKED' };
  const max = Number.isFinite(spend.max) ? Math.max(1, Math.round(spend.max)) : 1;

  if (state.action === null) {
    return {
      ok: true,
      state: {
        ...state,
        action: {
          id: CPRED_ACTION_NET,
          label: 'Akcje Sieciowe',
          net: { count: 1, max, labels: [spend.label] },
        },
      },
    };
  }
  const open = state.action.net;
  if (!open) return { ok: false, error: 'NO_ACTION_LEFT' };
  if (open.count >= open.max) return { ok: false, error: 'NO_NET_ACTIONS_LEFT' };
  return {
    ok: true,
    state: {
      ...state,
      action: {
        ...state.action,
        net: { ...open, count: open.count + 1, labels: [...open.labels, spend.label] },
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
  if (spend.kind === 'move') {
    if (spend.metres === undefined) return { ...overspent, moveUsed: overspent.moveUsed + 1 };
    const walked = Number.isFinite(spend.metres) ? Math.max(0, spend.metres) : 0;
    const cost = roundMetres(walked * cpredTerrainFactor(spend.hard ?? overspent.hardTerrain));
    return {
      ...overspent,
      metresUsed: roundMetres(overspent.metresUsed + cost),
      metresWalked: roundMetres(overspent.metresWalked + walked),
      moveUsed: Math.max(overspent.moveUsed, 1),
    };
  }
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
  if (spend.kind === 'net') {
    const open = overspent.action?.net;
    const max = Number.isFinite(spend.max) ? Math.max(1, Math.round(spend.max)) : 1;
    return {
      ...overspent,
      action: {
        id: CPRED_ACTION_NET,
        label: 'Akcje Sieciowe',
        net: open
          ? { ...open, count: open.count + 1, labels: [...open.labels, spend.label] }
          : { count: 1, max, labels: [spend.label] },
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
export function cpredTurnBudget(
  state: CpredTurnState,
  /** Why the metres are what they are („Pancerz −2"); shown next to them. */
  moveNote?: string,
): TurnBudgetView {
  const attack = state.action?.attack;
  const net = state.action?.net;
  const notes: string[] = [];
  if (state.action) {
    notes.push(
      attack && attack.weaponNames.length > 0
        ? `${state.action.label}: ${attack.weaponNames.join(' + ')}`
        : net && net.labels.length > 0
          ? `${state.action.label}: ${net.labels.join(' + ')}`
          : state.action.label,
    );
  }
  // A blocked resource is painted as spent: the pips are what the GM glances at,
  // and „Akcja 0/1" next to a button that always refuses would be a lie.
  if (state.blockedAction) notes.push(state.blockedAction);
  if (state.blockedMove) notes.push(state.blockedMove);
  return {
    resources: [
      {
        id: 'move',
        label: 'Ruch',
        used: state.blockedMove ? state.moveMax : state.moveUsed,
        max: state.moveMax,
        // The sentence travels with the pip, not only in the notes above it:
        // the action bar greys a button out and has to say why, and „Akcja w
        // tej turze już wykorzystana" is the wrong answer when the turn never
        // had one to spend (stage 14e; found in the player-side pass of 22.08).
        ...(state.blockedMove ? { blocked: state.blockedMove } : {}),
      },
      {
        id: 'action',
        label: 'Akcja',
        used: state.action || state.blockedAction ? 1 : 0,
        max: 1,
        ...(state.blockedAction ? { blocked: state.blockedAction } : {}),
      },
      {
        id: 'attacks',
        label: 'Ataki',
        used: attack?.count ?? 0,
        // A closed Attack Action shows its real ceiling: an LA 1 shot reads
        // „1/1", not „1/2", so nobody waits for a second swing that RAW says
        // is not coming.
        max: attack?.closed ? attack.count : CPRED_ATTACKS_PER_ACTION,
      },
      // Net Actions only exist for a netrunner mid-run, so the row appears with
      // the first one rather than sitting at „0/0" on every fighter's tracker.
      ...(net ? [{ id: 'net', label: 'Sieć', used: net.count, max: net.max }] : []),
    ],
    // Metres are continuous, so they cannot be pips — the core paints them as
    // „7,5 / 12 m" without knowing that a metre is RUCH × 2 (stage 14c).
    ...(state.metresPerMove !== null
      ? {
          distance: {
            label: 'Dystans',
            used: state.metresUsed,
            max: cpredMetresMax(state) ?? 0,
            unit: 'm',
            ...(state.hardTerrain ? { hard: true } : {}),
            ...((moveNote ?? state.moveNote) ? { note: moveNote ?? state.moveNote! } : {}),
            ...(cpredRunMetres(state) > 0
              ? {
                  extra: {
                    label: cpredAction(CPRED_ACTION_RUN)?.name ?? 'Bieg',
                    max: cpredRunMetres(state),
                  },
                }
              : {}),
          },
        }
      : {}),
    ...(notes.length > 0 ? { note: notes.join(' · ') } : {}),
    ...(state.overspent > 0 ? { overspent: state.overspent } : {}),
  };
}

/**
 * Metres a Bieg would still add to this turn — 0 when that trade is gone.
 *
 * „Bieg" is the Action spent on a second Move Action (s. 168), so the answer is
 * one Move Action's worth of metres for as long as the Action is unspent and
 * unblocked. RAW also wants a Move Action *already spent* before the Bieg is
 * declared, and that is not checked here on purpose: this number answers „how
 * far can this turn reach at most", and reaching past the first Move Action
 * spends it on the way. Nothing is charged from here — the map draws a second
 * reach band with it, and the Action is still spent by `spendCpredTurn`.
 *
 * A blocked Move Action (14e) takes the whole trade away: a Bieg would grant a
 * Move Action the wound refuses anyway.
 */
export function cpredRunMetres(state: CpredTurnState): number {
  if (state.metresPerMove === null) return 0;
  if (state.action !== null || state.blockedAction !== null || state.blockedMove !== null) return 0;
  const definition = cpredAction(CPRED_ACTION_RUN);
  return roundMetres(state.metresPerMove * (definition?.grantsMove ?? 1));
}

/** Budget a path of this length would cost, hard going included (stage 14c). */
export function cpredMoveCost(state: CpredTurnState, metres: number, hard?: boolean): number {
  const walked = Number.isFinite(metres) ? Math.max(0, metres) : 0;
  return roundMetres(walked * cpredTerrainFactor(hard ?? state.hardTerrain));
}

function formatMetreValue(metres: number): string {
  const rounded = roundMetres(metres);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',');
}

/**
 * Why a drag was refused, in metres rather than in rule-speak. „Nie masz już
 * Akcji Ruchu" is true but useless when the player can see empty floor ahead of
 * them; „zabrakło 3,2 m" tells them whether to run or to stop.
 */
export function cpredMoveRefusal(state: CpredTurnState, metres: number, hard?: boolean): string {
  const left = cpredMetresLeft(state);
  if (left === null) return CPRED_TURN_PROBLEM_MESSAGES.NO_MOVE_LEFT;
  const cost = cpredMoveCost(state, metres, hard);
  const missing = formatMetreValue(Math.max(0, cost - left));
  const hardGoing = (hard ?? state.hardTerrain) ? ' (ruch utrudniony — podwójny koszt)' : '';
  return `Za daleko o ${missing} m — zostało ci ${formatMetreValue(left)} m ruchu${hardGoing}.`;
}

/** Polish refusals, shown to the player who ran out and to the GM who judges. */
export const CPRED_TURN_PROBLEM_MESSAGES: Record<CpredTurnProblem, string> = {
  NO_ACTION_LEFT: 'Nie masz już Akcji w tej turze.',
  NO_MOVE_LEFT: 'Nie masz już Akcji Ruchu w tej turze.',
  ROF_EXCEEDED: 'Ta broń nie zmieści się w rozpoczętej Akcji Ataku (LA).',
  AIM_NEEDS_FULL_ACTION: 'Celowanie zabiera całą Akcję — nie po rozpoczętym ataku.',
  RUN_NEEDS_MOVE: 'Bieg wymaga wcześniejszego wykonania Akcji Ruchu w tej turze.',
  UNKNOWN_ACTION: 'Nie znam takiej akcji.',
  // Both of these normally travel with a sentence naming the wound; these are
  // the fallbacks for a state that lost it.
  ACTION_BLOCKED: 'Rana krytyczna zabiera ci Akcję w tej turze.',
  MOVE_BLOCKED: 'Rana krytyczna zabiera ci Akcję Ruchu w tej turze.',
  NO_NET_ACTIONS_LEFT: 'Nie masz już Akcji Sieciowych w tej turze.',
};

/** The sentence behind a blocked spend, when the state carries one. */
export function cpredTurnBlockReason(
  state: CpredTurnState,
  problem: CpredTurnProblem,
): string | null {
  if (problem === 'ACTION_BLOCKED') return state.blockedAction;
  if (problem === 'MOVE_BLOCKED') return state.blockedMove;
  return null;
}
