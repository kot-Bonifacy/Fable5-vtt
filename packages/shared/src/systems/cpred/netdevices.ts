/**
 * Węzły kontrolne i rzeczy, do których sięgają (stage 26d).
 *
 * „Kontrola pozwala Netrunnerowi kontrolować za pomocą węzła kontrolnego rzeczy
 * podłączone do danej Architektury Sieciowej, na przykład kamery, drony,
 * wieżyczki, siatki laserowe, windy, spryskiwacze" (s. 199). Four sentences do
 * all the work in this file, and each of them decided a shape:
 *
 *  - **„obsługa każdej rzeczy podłączonej do danego węzła wymaga użycia osobnej
 *    Akcji Sieciowej na każdą z tych rzeczy"** — so an operation is billed like
 *    any other Net Action, through the same `requireTurnSpend` as Backdoor.
 *  - **„dany węzeł kontrolny można aktywować tylko raz na Turę"** — the limit
 *    counts *nodes*, not devices, which is why the ledger below is keyed by
 *    floor and lives in the run.
 *  - **„PT odebrania kontroli nad węzłem innemu Netrunnerowi lub Demonowi jest
 *    równe wartości Testu Kontroli, jaki wykonano"** — so a hold stores the
 *    total that took it, and the next Check is rolled against that instead of
 *    the floor's printed DV. `CpredNetHold` (stage 26b) already stored it.
 *  - **„gdy odłączasz się od Architektury, tracisz kontrolę nad wszystkimi
 *    węzłami"** — the hold dies with the run, but what the device *did* does
 *    not: a camera switched off stays off, because that happened in the real
 *    world. Device state therefore lives in `CpredNetRuntime`, next to the
 *    Virus, and not in the run.
 *
 * Everything here is a pure function over that state; opening the door, firing
 * the turret and writing the chat card are the server's business.
 */

import { normalizeFacing } from '../../figures.js';
import type { CpredNetDevice, NetDeviceKind } from './netrunning.js';
import { NET_DEVICE_KIND_LABELS } from './netrunning.js';

// ───────────────────────────── co da się zrobić ─────────────────────────────

/**
 * The operations a control node can perform. Deliberately a short, closed list:
 * the rulebook never gives a device a verb of its own, it says „obsługa" and
 * leaves the table to narrate. What the engine needs to know is only which of
 * these five things actually happens.
 */
export const NET_DEVICE_OPERATIONS = ['on', 'off', 'turn', 'open', 'close', 'fire'] as const;
export type NetDeviceOperation = (typeof NET_DEVICE_OPERATIONS)[number];

export const NET_DEVICE_OPERATION_LABELS: Record<NetDeviceOperation, string> = {
  on: 'Włącz',
  off: 'Wyłącz',
  turn: 'Obróć',
  open: 'Otwórz',
  close: 'Zamknij',
  fire: 'Strzelaj',
};

/**
 * What each kind of device may be told to do.
 *
 * A camera gains „Obróć" on top of the switch because that is the rulebook's own
 * example of using one („zmienia kąt widzenia kamer tak, by w ich zasięgu nie
 * znalazła się reszta ekipy", s. 199) and it is a different thing from turning
 * the camera off — a dark camera is noticed, a turned one is not.
 */
export const NET_DEVICE_OPERATIONS_BY_KIND: Record<NetDeviceKind, readonly NetDeviceOperation[]> = {
  camera: ['turn', 'off', 'on'],
  turret: ['fire', 'off', 'on'],
  drone: ['fire', 'off', 'on'],
  door: ['open', 'close'],
  environment: ['on', 'off'],
};

export function netDeviceOperations(kind: NetDeviceKind): readonly NetDeviceOperation[] {
  return NET_DEVICE_OPERATIONS_BY_KIND[kind] ?? ['on', 'off'];
}

export function isNetDeviceOperation(value: unknown): value is NetDeviceOperation {
  return typeof value === 'string' && (NET_DEVICE_OPERATIONS as readonly string[]).includes(value);
}

/** Operations that need a figure on the map to happen at all. */
export function netDeviceNeedsToken(operation: NetDeviceOperation): boolean {
  return operation === 'fire';
}

/** Operations that need a door or window of stage 18d behind them. */
export function netDeviceNeedsWall(operation: NetDeviceOperation): boolean {
  return operation === 'open' || operation === 'close';
}

// ───────────────────────────── stan urządzenia ─────────────────────────────

/**
 * What a device is doing right now.
 *
 * Two booleans rather than a state machine, because they are independent: a
 * camera can be turned away *and* switched off, and switching it back on must
 * not silently point it back at the corridor. `on` defaults to true — a device
 * the GM placed is running until somebody says otherwise.
 */
export interface CpredNetDeviceState {
  deviceId: string;
  on: boolean;
  /** Camera pointed away from the defended area („obraca kamerę", s. 199). */
  turned?: boolean;
}

export function netDeviceStateOf(
  states: readonly CpredNetDeviceState[] | undefined,
  deviceId: string,
): CpredNetDeviceState {
  return states?.find((state) => state.deviceId === deviceId) ?? { deviceId, on: true };
}

/** The device list after one operation landed, with the state merged in place. */
export function netApplyDeviceState(
  states: readonly CpredNetDeviceState[] | undefined,
  next: CpredNetDeviceState,
): CpredNetDeviceState[] {
  const rest = (states ?? []).filter((state) => state.deviceId !== next.deviceId);
  return [...rest, next];
}

/**
 * The state this operation leaves behind, or null when the operation changes
 * nothing about the device itself (firing a turret, opening a door — the first
 * spends ammunition on the token, the second writes to the wall).
 */
export function netDeviceStateAfter(
  current: CpredNetDeviceState,
  operation: NetDeviceOperation,
): CpredNetDeviceState | null {
  if (operation === 'on') return { ...current, on: true };
  if (operation === 'off') return { ...current, on: false };
  // „Obróć" is a toggle: the same Net Action points the camera back.
  if (operation === 'turn') return { ...current, turned: !current.turned };
  return null;
}

// ──────────────────────────── kamera na mapie ────────────────────────────

/**
 * How wide a camera looks, in degrees (zlecenie MG z 20.10). The rulebook gives
 * a camera no numbers at all; ninety is a wall-mounted lens covering a corridor
 * or a corner of a room, and it is what makes „Obróć" a real decision.
 */
export const NET_CAMERA_CONE_DEG = 90;

/**
 * Where „Obróć" can point a camera — the eight directions of the map, in its
 * facing (degrees clockwise from up, stage 27j). Eight rather than a free angle
 * because the netrunner picks from a list, not with a knob on a map they may
 * not even see.
 */
export const NET_CAMERA_DIRECTIONS: readonly { facing: number; label: string }[] = [
  { facing: 0, label: 'północ' },
  { facing: 45, label: 'północny wschód' },
  { facing: 90, label: 'wschód' },
  { facing: 135, label: 'południowy wschód' },
  { facing: 180, label: 'południe' },
  { facing: 225, label: 'południowy zachód' },
  { facing: 270, label: 'zachód' },
  { facing: 315, label: 'północny zachód' },
];

/** The nearest of the eight directions, for the chat line and the list. */
export function netCameraDirectionLabel(facing: number): string {
  const normalized = normalizeFacing(facing);
  const index = Math.round(normalized / 45) % NET_CAMERA_DIRECTIONS.length;
  return NET_CAMERA_DIRECTIONS[index]!.label;
}

/**
 * Where „Obróć" leaves a camera that stands on the map: the direction asked
 * for, or a quarter turn clockwise when nobody named one (a Demon, an old
 * client). A camera nobody ever turned counts as looking north.
 */
export function netCameraFacingAfterTurn(current: number | null, asked: unknown): number {
  if (typeof asked === 'number' && Number.isFinite(asked)) return normalizeFacing(asked);
  return normalizeFacing((current ?? 0) + 90);
}

/**
 * Does this camera lend its eyes to whoever holds its node? Switched on is the
 * whole condition — a camera turned away still sees, just something else.
 */
export function netCameraSees(state: Pick<CpredNetDeviceState, 'on'>): boolean {
  return state.on;
}

export function readNetDeviceStates(raw: unknown): CpredNetDeviceState[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => entry as Record<string, unknown>)
    .filter((entry) => typeof entry?.deviceId === 'string')
    .map((entry) => ({
      deviceId: entry.deviceId as string,
      on: entry.on !== false,
      ...(entry.turned === true ? { turned: true } : {}),
    }));
}

// ─────────────────────────── raz na Turę, per węzeł ───────────────────────────

/** „Dany węzeł kontrolny można aktywować tylko raz na Turę" (s. 199). */
export interface CpredNetNodeUse {
  floorId: string;
  round: number;
}

export function readNetNodeUses(raw: unknown): CpredNetNodeUse[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => entry as Record<string, unknown>)
    .filter((entry) => typeof entry?.floorId === 'string' && Number.isInteger(entry?.round))
    .map((entry) => ({ floorId: entry.floorId as string, round: entry.round as number }));
}

/**
 * May this node still be used this round? Outside combat there are no rounds,
 * so there is nothing to spend — the same reading stage 26c gave the Ślizg's
 * „raz na Turę" and the glue's clock.
 */
export function netNodeIsFree(
  uses: readonly CpredNetNodeUse[],
  floorId: string,
  round: number | null,
): boolean {
  if (round === null) return true;
  return !uses.some((use) => use.floorId === floorId && use.round === round);
}

/** The ledger after this node was used, with stale rounds swept out. */
export function netMarkNodeUse(
  uses: readonly CpredNetNodeUse[],
  floorId: string,
  round: number | null,
): CpredNetNodeUse[] {
  if (round === null) return [...uses];
  const kept = uses.filter((use) => use.round >= round && use.floorId !== floorId);
  return [...kept, { floorId, round }];
}

// ─────────────────── przejęta figura: czynności wg rodzaju ───────────────────

/**
 * Co przejęte urządzenie umie jako **figura na mapie** (etap 70b, decyzja MG
 * nr 1 z 11.11): jedna Akcja Sieciowa aktywuje je na Turę i daje mu ruch
 * (jeśli jeździ) oraz jedną czynność z tej listy. To są „okrojone mechaniki”
 * z pomysłu MG — nic spoza tabeli przejęta figura nie robi.
 */
export interface NetDeviceFigureProfile {
  /** Jeździ z własnego RUCH-u (marsz od 70c). */
  moves: boolean;
  /** Czynności figury, w kolejności belki. */
  verbs: readonly NetDeviceOperation[];
  /**
   * Jak figura pożycza netrunnerowi oczy, dopóki trzyma jej węzeł (70c):
   * stożek kamery wzdłuż kierunku figury albo koło (`coneDeg: null`) na zasięg
   * wzroku figury. `null` — nie patrzy wcale.
   */
  sight: { coneDeg: number | null } | null;
}

export const NET_DEVICE_FIGURE_PROFILES: Record<NetDeviceKind, NetDeviceFigureProfile> = {
  camera: { moves: false, verbs: ['turn', 'off'], sight: { coneDeg: NET_CAMERA_CONE_DEG } },
  turret: { moves: false, verbs: ['fire', 'off'], sight: { coneDeg: null } },
  drone: { moves: true, verbs: ['fire', 'off'], sight: { coneDeg: null } },
  door: { moves: false, verbs: [], sight: null },
  environment: { moves: false, verbs: [], sight: null },
};

export function netDeviceFigureProfile(kind: NetDeviceKind): NetDeviceFigureProfile {
  return NET_DEVICE_FIGURE_PROFILES[kind] ?? { moves: false, verbs: [], sight: null };
}

// ─────────────────── aktywacja: Akcja Sieciowa = pełna tura ───────────────────

/**
 * Budżet urządzenia aktywowanego w tej rundzie (etap 70b).
 *
 * „Dany węzeł kontrolny można aktywować tylko raz na Turę” (s. 199) liczy
 * węzły w `nodeUse`, a ten zapis mówi tylko, **które** urządzenie węzła
 * dostało aktywację i co mu z niej zostało. Netrunner trzymający dwa węzły ma
 * dwa wpisy — stąd lista w stanie runu.
 */
export interface CpredNetDeviceTurn {
  floorId: string;
  deviceId: string;
  round: number;
  /** Metry ruchu do wydania (dron); 0 u urządzeń, które stoją. */
  moveLeftM: number;
  /** Jedna czynność na aktywację — strzał, obrót, przełącznik. */
  actionLeft: boolean;
}

export function readNetDeviceTurns(raw: unknown): CpredNetDeviceTurn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => entry as Record<string, unknown>)
    .filter(
      (entry) =>
        typeof entry?.floorId === 'string' &&
        typeof entry?.deviceId === 'string' &&
        Number.isInteger(entry?.round),
    )
    .map((entry) => ({
      floorId: entry.floorId as string,
      deviceId: entry.deviceId as string,
      round: entry.round as number,
      moveLeftM:
        typeof entry.moveLeftM === 'number' && Number.isFinite(entry.moveLeftM)
          ? Math.max(0, entry.moveLeftM)
          : 0,
      actionLeft: entry.actionLeft !== false,
    }));
}

/** Aktywacja tego urządzenia w tej rundzie, jeśli już padła. */
export function netDeviceTurnOf(
  turns: readonly CpredNetDeviceTurn[] | undefined,
  floorId: string,
  deviceId: string,
  round: number | null,
): CpredNetDeviceTurn | null {
  if (round === null) return null;
  return (
    turns?.find(
      (turn) => turn.floorId === floorId && turn.deviceId === deviceId && turn.round === round,
    ) ?? null
  );
}

/** Księga aktywacji w stanie runu — to, co czytają i piszą funkcje niżej. */
export interface NetDeviceLedger {
  nodeUse: readonly CpredNetNodeUse[];
  deviceTurns?: readonly CpredNetDeviceTurn[] | undefined;
}

export type NetDeviceUseResult =
  | {
      ok: true;
      /** Ta czynność aktywuje urządzenie — kosztuje jedną Akcję Sieciową. */
      charge: boolean;
      nodeUse: CpredNetNodeUse[];
      deviceTurns: CpredNetDeviceTurn[];
    }
  | {
      ok: false;
      error:
        'NET_NODE_USED' | 'NET_DEVICE_SPENT' | 'NET_DEVICE_STATIONARY' | 'NET_DEVICE_NO_MOVE_LEFT';
    };

/**
 * Luz rachunku metrów (70c): trasa liczona u klienta i na serwerze rozjeżdża
 * się o setne części metra na zaokrągleniach pikseli — przy takim ułamku
 * odmowa „za daleko” byłaby kłamstwem.
 */
const NET_DEVICE_MOVE_SLACK_M = 0.05;

/**
 * Jedna czynność albo ruch przejętego urządzenia — czy wolno, ile kosztuje
 * i co zostaje w księdze.
 *
 * Pierwsze użycie w rundzie aktywuje urządzenie (`charge`) i znaczy węzeł;
 * kolejne idą już z budżetu aktywacji: ruch i czynność w dowolnej kolejności,
 * druga czynność odmawia. Inne urządzenie tego samego węzła w tej samej
 * rundzie dostaje `NET_NODE_USED` — węzeł, nie urządzenie, jest „raz na Turę”.
 * Poza walką (`round === null`) nie ma rund, więc nie ma czego liczyć.
 *
 * Ruch (70c): aktywacja daje `moveM` metrów; urządzenie, które ich nie dostało,
 * stoi (`NET_DEVICE_STATIONARY`), a ruch ponad resztę budżetu odmawia
 * `NET_DEVICE_NO_MOVE_LEFT`.
 */
export function netDeviceUse(
  ledger: NetDeviceLedger,
  input: {
    floorId: string;
    deviceId: string;
    round: number | null;
    use: 'action' | 'move';
    /** Metry, które daje aktywacja (RUCH figury); 0 u stojących. */
    moveM?: number;
    /** Metry tego ruchu, gdy `use === 'move'`. */
    spendM?: number;
  },
): NetDeviceUseResult {
  const turns = ledger.deviceTurns ?? [];
  if (input.round === null) {
    return { ok: true, charge: false, nodeUse: [...ledger.nodeUse], deviceTurns: [...turns] };
  }
  const round = input.round;
  const live = turns.filter((turn) => turn.round >= round);
  const current = netDeviceTurnOf(live, input.floorId, input.deviceId, round);
  if (!current && !netNodeIsFree(ledger.nodeUse, input.floorId, round)) {
    return { ok: false, error: 'NET_NODE_USED' };
  }
  const before: CpredNetDeviceTurn = current ?? {
    floorId: input.floorId,
    deviceId: input.deviceId,
    round,
    moveLeftM: Math.max(0, input.moveM ?? 0),
    actionLeft: true,
  };
  let after: CpredNetDeviceTurn;
  if (input.use === 'action') {
    if (!before.actionLeft) return { ok: false, error: 'NET_DEVICE_SPENT' };
    after = { ...before, actionLeft: false };
  } else {
    const spend = Math.max(0, input.spendM ?? 0);
    if (!current && before.moveLeftM <= 0) return { ok: false, error: 'NET_DEVICE_STATIONARY' };
    if (spend > before.moveLeftM + NET_DEVICE_MOVE_SLACK_M) {
      return { ok: false, error: 'NET_DEVICE_NO_MOVE_LEFT' };
    }
    after = { ...before, moveLeftM: Math.max(0, roundCentimetres(before.moveLeftM - spend)) };
  }
  return {
    ok: true,
    charge: current === null,
    nodeUse: netMarkNodeUse(ledger.nodeUse, input.floorId, round),
    deviceTurns: [...live.filter((turn) => turn !== current), after],
  };
}

function roundCentimetres(metres: number): number {
  return Math.round(metres * 100) / 100;
}

/**
 * Ile metrów przejęta figura może jeszcze przejechać w tej Turze (70c) — to
 * samo, co powie księga przy następnym ruchu. `null`: poza walką nikt metrów
 * nie liczy; 0: figura stoi albo węzeł jest w tej Turze zużyty.
 */
export function netOperatedMoveLeft(
  figure: Pick<NetOperatedFigure, 'state' | 'moveM' | 'moveLeftM'>,
): number | null {
  if ((figure.moveM ?? 0) <= 0) return 0;
  switch (figure.state) {
    case 'free':
      return null;
    case 'ready':
      return figure.moveM ?? 0;
    case 'active':
    case 'spent':
      return figure.moveLeftM ?? 0;
    case 'node-used':
      return 0;
  }
}

// ─────────────────────── przejęta figura w ładunku runu ───────────────────────

/**
 * Stan aktywacji przejętej figury, jak widzi go belka (etap 70b).
 *
 *  - `ready` — pierwsza czynność kosztuje Akcję Sieciową;
 *  - `active` — aktywowana w tej Turze, czynność jeszcze przed nią;
 *  - `spent` — czynność wykonana;
 *  - `node-used` — węzeł aktywowało w tej Turze inne jego urządzenie;
 *  - `free` — poza walką nikt niczego nie liczy.
 */
export type NetOperatedState = 'ready' | 'active' | 'spent' | 'node-used' | 'free';

export function netOperatedState(
  ledger: NetDeviceLedger,
  floorId: string,
  deviceId: string,
  round: number | null,
): NetOperatedState {
  if (round === null) return 'free';
  const turn = netDeviceTurnOf(ledger.deviceTurns, floorId, deviceId, round);
  if (turn) return turn.actionLeft ? 'active' : 'spent';
  return netNodeIsFree(ledger.nodeUse, floorId, round) ? 'ready' : 'node-used';
}

/**
 * Figura urządzenia pożyczona netrunnerowi przez węzeł (etap 70b) — jedzie
 * w ładunku runu, więc dostaje ją tylko netrunner i MG. Uprawnienie to dalej
 * węzeł: `Token.ownerId` się nie zmienia, a ten wpis znika razem z kontrolą.
 */
export interface NetOperatedFigure<Sheet = unknown> {
  tokenId: string;
  sceneId: string;
  floorId: string;
  deviceId: string;
  deviceKind: NetDeviceKind;
  /** Nazwa urządzenia z Architektury — po Kontroli netrunner ją zna. */
  name: string;
  /** Etykieta węzła („przez: Obrona”). */
  nodeLabel: string;
  verbs: NetDeviceOperation[];
  state: NetOperatedState;
  /** PW urządzenia — operator je zna, reszta stołu widzi ułamek. */
  hp?: { current: number; max: number };
  /**
   * Karta do podglądu strzału: broń w lufie i liczby, którymi serwer rzuci
   * (Wartość bojowa w `statBlock`). Tylko u gracza-operatora — MG ma karty.
   */
  sheet?: Sheet;
  /** Wiersz broni, z której urządzenie strzela. */
  weaponRowId?: string;
  /** Urządzenie strzelające bez Wartości bojowej — odmowa z podpowiedzią dla MG. */
  noCombatValue?: true;
  /**
   * Metry, które daje aktywacja (70c): RUCH × 2 figury, która jeździ. Brak
   * u urządzeń, które stoją; 0 u drona bez RUCH-u (podpowiedź dla MG).
   */
  moveM?: number;
  /** Metry zostałe z aktywacji w tej Turze — tylko po aktywacji. */
  moveLeftM?: number;
}

/** Kafel „Ruch” przejętej figury, która jeździ (70c). */
export interface NetDeviceMoveSlot {
  id: string;
  label: string;
  hint: string;
  /** Ile metrów zostało; null — poza walką nikt ich nie liczy. */
  metres: number | null;
  cost: NetOperatedCost;
  disabled: string | null;
}

/**
 * Kafel „Ruch” drona na belce (70c): ile metrów zostało i czym się płaci.
 * Jeździ się klikiem w podłoże, jak figurą postaci — kafel mówi tylko, ile
 * i za co. Null u figury, która nie jeździ.
 */
export function netDeviceMoveSlot(
  figure: Pick<NetOperatedFigure, 'tokenId' | 'deviceKind' | 'state' | 'moveM' | 'moveLeftM'>,
): NetDeviceMoveSlot | null {
  if (!netDeviceFigureProfile(figure.deviceKind).moves) return null;
  const metres = netOperatedMoveLeft(figure);
  const disabled =
    (figure.moveM ?? 0) <= 0
      ? NET_DEVICE_MESSAGES.NET_DEVICE_NO_MOVE
      : figure.state === 'node-used'
        ? NET_DEVICE_MESSAGES.NET_NODE_USED
        : metres === 0
          ? NET_DEVICE_MESSAGES.NET_DEVICE_NO_MOVE_LEFT
          : null;
  return {
    id: `device:${figure.tokenId}:move`,
    label: 'Ruch',
    hint: 'Kliknij podłoże, dokąd urządzenie ma pojechać — w tej samej aktywacji może też strzelić.',
    metres,
    cost: netOperatedCost(figure.state),
    disabled,
  };
}

/** Jedna czynność przejętej figury jako przycisk belki. */
export interface NetDeviceVerbSlot {
  id: string;
  verb: NetDeviceOperation;
  label: string;
  hint: string;
  /** `net` — ta czynność aktywuje urządzenie; `action` — idzie z aktywacji. */
  cost: NetOperatedCost;
  disabled: string | null;
}

/** Czym płaci się za czynność przejętej figury. */
export type NetOperatedCost = 'net' | 'action' | 'free';

const NET_DEVICE_VERB_HINTS: Partial<Record<NetDeviceOperation, string>> = {
  turn: 'Kliknij punkt mapy, na który kamera ma patrzeć.',
  off: 'Wyłączone urządzenie nie patrzy, nie strzela i wypada spod twojej ręki — włączysz je z okna SIEĆ.',
  fire: 'Kliknij cel na mapie.',
};

/** Czym płaci się za czynność w tym stanie aktywacji. */
export function netOperatedCost(state: NetOperatedState): NetOperatedCost {
  if (state === 'free') return 'free';
  return state === 'ready' ? 'net' : 'action';
}

/** Dlaczego przejęta figura nic już w tej Turze nie zrobi — albo null. */
export function netOperatedRefusal(state: NetOperatedState): string | null {
  if (state === 'spent') return NET_DEVICE_MESSAGES.NET_DEVICE_SPENT;
  if (state === 'node-used') return NET_DEVICE_MESSAGES.NET_NODE_USED;
  return null;
}

/**
 * Przyciski czynności przejętej figury poza strzałem (ten jest kaflem broni):
 * „Obróć” kamery i „Wyłącz”.
 */
export function netDeviceVerbSlots(
  figure: Pick<NetOperatedFigure, 'tokenId' | 'verbs' | 'state'>,
): NetDeviceVerbSlot[] {
  const refusal = netOperatedRefusal(figure.state);
  const cost = netOperatedCost(figure.state);
  return figure.verbs
    .filter((verb) => verb !== 'fire')
    .map((verb) => ({
      id: `device:${figure.tokenId}:${verb}`,
      verb,
      label: NET_DEVICE_OPERATION_LABELS[verb],
      hint: NET_DEVICE_VERB_HINTS[verb] ?? '',
      cost,
      disabled: refusal,
    }));
}

// ─────────────────────────── odbieranie węzła ───────────────────────────

/**
 * The DV a Kontrola Check is rolled against.
 *
 * „PT odebrania kontroli nad węzłem innemu Netrunnerowi lub Demonowi jest równe
 * wartości Testu Kontroli, jaki wykonano, by przejąć kontrolę nad tym węzłem"
 * (s. 199). The higher of the two wins, and that ordering matters: a node whose
 * printed DV is 15 and whose current holder scraped it with a 12 is still a
 * DV 15 node for the next person through the door — the lock did not get easier
 * because somebody else picked it badly.
 */
export function netControlDv(
  floorDv: number | undefined,
  heldDv: number | undefined,
): number | null {
  if (floorDv === undefined && heldDv === undefined) return null;
  return Math.max(floorDv ?? 0, heldDv ?? 0);
}

// ──────────────────────────── zdanie na czacie ────────────────────────────

/**
 * One Polish line saying what happened, for the log and for the run window.
 *
 * A camera with no figure on the map still has only this sentence: „obrócona"
 * is a fact the table reads and the GM rules on, like the two „na godzinę" hooks
 * of 26c. A camera that stands on the map (20.10) looks in a cone the netrunner
 * sees through, and its sentence names the direction instead.
 */
export function netDeviceLine(
  device: Pick<CpredNetDevice, 'name' | 'deviceKind'>,
  operation: NetDeviceOperation,
  state: CpredNetDeviceState,
  /** Where a camera on the map now looks; the toggle sentence without it. */
  facing?: number,
): string {
  const what = device.name || NET_DEVICE_KIND_LABELS[device.deviceKind];
  if (operation === 'turn' && facing !== undefined) {
    return `${what} — obrócona na ${netCameraDirectionLabel(facing)}.`;
  }
  // Rodzaj zdania idzie za rodzajem urządzenia (70c): „Dron — wyłączony”,
  // „Kamera — wyłączona”; nazwa z edytora bywa dowolna, rodzaj zostaje.
  const masculine = device.deviceKind === 'drone' || device.deviceKind === 'environment';
  switch (operation) {
    case 'on':
      return `${what} — ${masculine ? 'włączony' : 'włączona'}.`;
    case 'off':
      return `${what} — ${masculine ? 'wyłączony' : 'wyłączona'}.`;
    case 'turn':
      return state.turned
        ? `${what} — obrócona: nie patrzy już na broniony obszar.`
        : `${what} — obrócona z powrotem na broniony obszar.`;
    case 'open':
      return `${what} — otwarte.`;
    case 'close':
      return `${what} — zamknięte.`;
    case 'fire':
      return `${what} — strzał.`;
  }
}

// ──────────────────────────── odmowy po polsku ────────────────────────────

export type NetDeviceProblem =
  | 'NET_NODE_NOT_HELD'
  | 'NET_NODE_USED'
  | 'NET_DEVICE_UNKNOWN'
  | 'NET_DEVICE_NOT_WIRED'
  | 'NET_DEVICE_NO_TOKEN'
  | 'NET_DEVICE_NO_WALL'
  | 'NET_DEVICE_OFF'
  | 'NET_DEVICE_WRONG_OPERATION'
  | 'NET_SHOT_COVERED'
  | 'NET_SHOT_BLOCKED'
  | 'NET_DEVICE_SPENT'
  | 'NET_DEVICE_FIRES_FROM_MAP'
  | 'NET_DEVICE_NO_COMBAT_VALUE'
  | 'NET_DEVICE_STATIONARY'
  | 'NET_DEVICE_NO_MOVE'
  | 'NET_DEVICE_NO_MOVE_LEFT';

export const NET_DEVICE_MESSAGES: Record<NetDeviceProblem, string> = {
  NET_NODE_NOT_HELD: 'Nie kontrolujesz tego węzła — najpierw przejmij go Kontrolą.',
  NET_NODE_USED: 'Ten węzeł był już aktywowany w tej Turze.',
  NET_DEVICE_UNKNOWN: 'Do tego węzła nie jest podłączone takie urządzenie.',
  NET_DEVICE_NOT_WIRED:
    'Ta figura nie jest urządzeniem żadnej Sieci — podepnij ją w Architekturze albo podłącz netrunnera do gniazda sceny.',
  NET_DEVICE_NO_TOKEN: 'To urządzenie nie ma figury na mapie — nie ma czym strzelić.',
  NET_DEVICE_NO_WALL: 'To urządzenie nie wskazuje żadnych drzwi ani okna.',
  NET_DEVICE_OFF: 'Urządzenie jest wyłączone — najpierw je włącz.',
  NET_DEVICE_WRONG_OPERATION: 'Tego urządzenia nie da się tak obsłużyć.',
  /**
   * Osłona na linii strzału (16c) wraca z tej ścieżki jako **pytanie**, nie
   * karta: strzelec przy mapie dostaje je w podglądzie, zanim zapłaci, ale
   * urządzenie strzela od razu, więc Akcja Sieciowa jest już zaksięgowana.
   * Odmowa mówi to wprost i zostawia netrunnerowi drugie podejście — przycisk
   * „Strzelaj mimo osłony" powtarza operację z `ignoreCover`.
   */
  NET_SHOT_COVERED:
    'Na linii strzału stoi osłona — Akcja Sieciowa poszła. Strzel jeszcze raz mimo niej albo ostrzelaj osłonę z mapy.',
  NET_SHOT_BLOCKED: 'Na linii strzału stoi figura — z tego miejsca nie ma czystego strzału.',
  NET_DEVICE_SPENT: 'To urządzenie wykonało już czynność w tej Turze — węzeł był już aktywowany.',
  NET_DEVICE_FIRES_FROM_MAP: 'Strzela się z mapy: zaznacz przejęte urządzenie i kliknij cel.',
  NET_DEVICE_NO_COMBAT_VALUE:
    'To urządzenie nie ma Wartości bojowej — MG wpisuje ją w „Edytuj…” figury albo wybiera wpis systemu obronnego.',
  NET_DEVICE_STATIONARY: 'To urządzenie stoi w miejscu — nie da się nim ruszyć.',
  NET_DEVICE_NO_MOVE:
    'To urządzenie nie ma RUCH-u — MG wpisuje go na karcie figury albo wybiera wpis systemu obronnego.',
  NET_DEVICE_NO_MOVE_LEFT: 'Urządzeniu nie zostało tyle ruchu w tej Turze.',
};

// ──────────────────────────── widok dla klienta ────────────────────────────

/**
 * One device as the run window paints it.
 *
 * Sent **only** once the node has been taken — before that the floor is a
 * control node with a DV and nothing else, because „po przejęciu kontroli nad
 * węzłem" is when the netrunner learns what hangs off it. The GM's copy always
 * carries the list, like every other GM cut in this chapter.
 */
export interface NetDeviceView {
  id: string;
  name: string;
  deviceKind: NetDeviceKind;
  operations: NetDeviceOperation[];
  on: boolean;
  turned?: boolean;
  /**
   * Strefa obronna za tym urządzeniem jest rozbrojona na mapie (66e, pkt 27):
   * `on` jest wtedy fałszem, a lista obsługi pusta.
   */
  disarmed?: true;
  /** Set when the device has a figure on the map to shoot from. */
  tokenId?: string;
  /**
   * Where that figure stands — its centre in scene pixels and the scene it is
   * on (zlecenie MG z 20.10). The netrunner's window frames the map on it, and
   * a camera's figure is often one the player cannot see on the map at all.
   * Sent with the device list, so only once the node has been taken.
   */
  at?: { sceneId: string; x: number; y: number };
  /** Where the figure looks (stage 27j facing) — a camera's „Obróć" starts here. */
  facing?: number;
  /** Set when the device opens a door or window of stage 18d. */
  wallId?: number;
  /**
   * The defended zone on the map this device switches (stage 70d) — the zone's
   * popup offers „Wyłącz / Włącz" to the netrunner holding the node. Sent with
   * the device list, so only once the node has been taken.
   */
  zoneId?: number;
  /** Effect line off the catalogue entry, when the GM picked one. */
  detail?: string;
  notes?: string;
}

export function netDeviceView(
  device: CpredNetDevice,
  state: CpredNetDeviceState,
  options: {
    detail?: string;
    gm: boolean;
    at?: { sceneId: string; x: number; y: number };
    facing?: number | null;
  },
): NetDeviceView {
  return {
    id: device.id,
    name: device.name,
    deviceKind: device.deviceKind,
    operations: [...netDeviceOperations(device.deviceKind)],
    on: state.on,
    ...(state.turned ? { turned: true } : {}),
    ...(device.tokenId ? { tokenId: device.tokenId } : {}),
    ...(device.wallId !== undefined ? { wallId: device.wallId } : {}),
    ...(device.tokenId && options.at ? { at: options.at } : {}),
    ...(device.tokenId && typeof options.facing === 'number' ? { facing: options.facing } : {}),
    ...(options.detail ? { detail: options.detail } : {}),
    // The GM's own note on a device is the GM's, exactly like the note on a
    // floor: it says what the turret is *for*, which is a plan, not a fact.
    ...(options.gm && device.notes ? { notes: device.notes } : {}),
  };
}

/** „PT 17 Elektronika i zabezpieczenia · 25 PW · Wartość bojowa 14" — one line. */
export function describeNetDefense(profile: {
  disableDv?: number;
  disableMinutes?: number;
  hp?: number;
  move?: number;
  combatValue?: number;
  spotDv?: number;
}): string {
  const parts: string[] = [];
  if (profile.combatValue !== undefined) parts.push(`Wartość bojowa ${profile.combatValue}`);
  if (profile.hp !== undefined) parts.push(`${profile.hp} PW`);
  if (profile.move !== undefined) parts.push(`RUCH ${profile.move}`);
  if (profile.disableDv !== undefined) {
    parts.push(
      profile.disableMinutes !== undefined
        ? `PT ${profile.disableDv} Elektronika i zabezpieczenia · ${profile.disableMinutes} min`
        : `PT ${profile.disableDv} Elektronika i zabezpieczenia`,
    );
  }
  if (profile.spotDv !== undefined) parts.push(`Percepcja PT ${profile.spotDv}, by zauważyć`);
  return parts.join(' · ');
}
