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
 * The camera's sentence is the one that carries weight: the VTT has no cone of
 * vision, so „obrócona" is a fact the table reads and the GM rules on — exactly
 * like the two „na godzinę" hooks of 26c. Saying it plainly is the whole
 * mechanism, and pretending otherwise would be worse than admitting it.
 */
export function netDeviceLine(
  device: Pick<CpredNetDevice, 'name' | 'deviceKind'>,
  operation: NetDeviceOperation,
  state: CpredNetDeviceState,
): string {
  const what = device.name || NET_DEVICE_KIND_LABELS[device.deviceKind];
  switch (operation) {
    case 'on':
      return `${what} — włączona.`;
    case 'off':
      return `${what} — wyłączona.`;
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
  | 'NET_DEVICE_NO_TOKEN'
  | 'NET_DEVICE_NO_WALL'
  | 'NET_DEVICE_OFF'
  | 'NET_DEVICE_WRONG_OPERATION';

export const NET_DEVICE_MESSAGES: Record<NetDeviceProblem, string> = {
  NET_NODE_NOT_HELD: 'Nie kontrolujesz tego węzła — najpierw przejmij go Kontrolą.',
  NET_NODE_USED: 'Ten węzeł był już aktywowany w tej Turze.',
  NET_DEVICE_UNKNOWN: 'Do tego węzła nie jest podłączone takie urządzenie.',
  NET_DEVICE_NO_TOKEN: 'To urządzenie nie ma figury na mapie — nie ma czym strzelić.',
  NET_DEVICE_NO_WALL: 'To urządzenie nie wskazuje żadnych drzwi ani okna.',
  NET_DEVICE_OFF: 'Urządzenie jest wyłączone — najpierw je włącz.',
  NET_DEVICE_WRONG_OPERATION: 'Tego urządzenia nie da się tak obsłużyć.',
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
  /** Set when the device has a figure on the map to shoot from. */
  tokenId?: string;
  /** Set when the device opens a door or window of stage 18d. */
  wallId?: number;
  /** Effect line off the catalogue entry, when the GM picked one. */
  detail?: string;
  notes?: string;
}

export function netDeviceView(
  device: CpredNetDevice,
  state: CpredNetDeviceState,
  options: { detail?: string; gm: boolean },
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
