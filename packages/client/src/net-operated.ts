import type {
  CombatView,
  CpredCharacterData,
  NetDeviceMoveSlot,
  NetDeviceOperation,
  NetDeviceVerbSlot,
  NetOperatedFigure,
  NetRunPayload,
  ScenePoint,
} from '@vtt/shared';
import {
  NET_DEVICE_MESSAGES,
  ROLE_GM,
  netDeviceFigureProfile,
  netDeviceMoveSlot,
  netDeviceVerbSlots,
  netOperatedMoveLeft,
  netOperatedRefusal,
} from '@vtt/shared';
import { create } from 'zustand';
import { useAuthStore } from './stores/authStore.js';
import { useNetRunStore } from './stores/netRunStore.js';
import { useSelectionStore } from './stores/selectionStore.js';
import { useTokenStore } from './stores/tokenStore.js';
import { operateNetDevice } from './socket.js';
import { netErrorText } from './netErrors.js';
import { clearNotices, notifyInfo, notifyRefusal } from './notices.js';

/**
 * Figury urządzeń przejęte w Sieci, po stronie klienta (etap 70b).
 *
 * Jeden stan dla wszystkich miejsc, które o nie pytają — mapa (kogo wolno
 * zaznaczyć), lewa belka (co figura umie), podgląd strzału (czym rzuca)
 * i zakładka „Postacie” (sekcja „Przejęte”): `NetRunPayload.operated`
 * z ładunku runu. Serwer przysyła ją tylko netrunnerowi i MG, a prawo do
 * figury i tak sprawdza sam (`operatorOf`) — tu jest wygoda, nie uprawnienie.
 */
export type OperatedFigure = NetOperatedFigure<CpredCharacterData>;

export interface OperatedEntry {
  figure: OperatedFigure;
  run: NetRunPayload;
}

function isGm(): boolean {
  return useAuthStore.getState().user?.role === ROLE_GM;
}

/** Wszystkie przejęte figury z runów, które ten widz dostał. */
export function operatedEntries(runs: readonly NetRunPayload[]): OperatedEntry[] {
  return runs.flatMap((run) => (run.operated ?? []).map((figure) => ({ figure, run })));
}

/**
 * Przejęta figura, którą **ten gracz prowadzi** — albo null. MG nie jest
 * operatorem: prowadzi każdą figurę zwykłą drogą, a wpisy w jego ładunku
 * służą tylko podpisowi „przejęta: <postać>”.
 */
export function operatedFigureOf(tokenId: string | null | undefined): OperatedEntry | null {
  if (!tokenId || isGm()) return null;
  return (
    operatedEntries(useNetRunStore.getState().runs).find(
      (entry) => entry.figure.tokenId === tokenId,
    ) ?? null
  );
}

/** Figury, które ten gracz może zaznaczyć jako przejęte (puste u MG). */
export function myOperatedTokenIds(runs: readonly NetRunPayload[]): ReadonlySet<string> {
  if (isGm()) return new Set();
  return new Set(operatedEntries(runs).map((entry) => entry.figure.tokenId));
}

/** Kto trzyma figurę — podpis MG przy naklejce „Przejęty w Sieci”. */
export function seizedByName(tokenId: string, runs: readonly NetRunPayload[]): string | null {
  return (
    operatedEntries(runs).find((entry) => entry.figure.tokenId === tokenId)?.run.characterName ??
    null
  );
}

/**
 * Dlaczego przejęta figura nie może teraz działać — zdaniem. Jej czynności
 * płaci netrunner swoją Akcją Sieciową, więc liczy się **jego** tura, nie tura
 * urządzenia w kolejce (ta jest pomijana).
 */
export function operatedTurnRefusal(
  entry: OperatedEntry,
  combat: CombatView | null,
): string | null {
  if (combat) {
    const runner = combat.combatants.find((row) => row.tokenId === entry.run.tokenId);
    if (runner) {
      if (combat.round === 0) {
        return 'Walka jeszcze się nie zaczęła — poczekaj, aż MG rozpocznie pierwszą rundę.';
      }
      if (combat.activeCombatantId !== runner.id) {
        return 'Urządzeniem działasz w turze swojego netrunnera — poczekaj na nią.';
      }
    }
  }
  return netOperatedRefusal(entry.figure.state);
}

/**
 * Dlaczego przejęta figura nie pojedzie teraz klikiem w podłoże — albo null
 * (70c). Wieżyczka i kamera stoją; dron jedzie w turze netrunnera, z metrów
 * aktywacji, także po strzale, i nie wtedy, gdy węzeł zużyło inne urządzenie.
 */
export function operatedWalkRefusal(
  entry: OperatedEntry,
  combat: CombatView | null,
): string | null {
  const { figure } = entry;
  if (!netDeviceFigureProfile(figure.deviceKind).moves) {
    return NET_DEVICE_MESSAGES.NET_DEVICE_STATIONARY;
  }
  if ((figure.moveM ?? 0) <= 0) return NET_DEVICE_MESSAGES.NET_DEVICE_NO_MOVE;
  const turn = operatedTurnRefusal(entry, combat);
  // „Czynność wykonana” zamyka strzał, nie jazdę — metry mogą jeszcze zostać.
  if (turn && turn !== NET_DEVICE_MESSAGES.NET_DEVICE_SPENT) return turn;
  return netOperatedMoveLeft(figure) === 0 ? NET_DEVICE_MESSAGES.NET_DEVICE_NO_MOVE_LEFT : null;
}

/**
 * Ile metrów przejęty dron przejedzie jednym marszem (70c) — kółko zasięgu
 * i przycięcie trasy w planerze. Null, gdy nikt metrów nie liczy (poza walką).
 */
export function operatedMoveMetresLeft(entry: OperatedEntry): number | null {
  return netOperatedMoveLeft(entry.figure);
}

/** Kafel „Ruch” drona na belce, z odmową tury netrunnera (70c). */
export function operatedMoveSlot(
  entry: OperatedEntry,
  combat: CombatView | null,
): NetDeviceMoveSlot | null {
  const slot = netDeviceMoveSlot(entry.figure);
  if (!slot) return null;
  const refusal = operatedWalkRefusal(entry, combat);
  return refusal ? { ...slot, disabled: refusal } : slot;
}

/** Przyciski czynności przejętej figury poza strzałem („Obróć”, „Wyłącz”). */
export function operatedVerbSlots(
  entry: OperatedEntry,
  combat: CombatView | null,
): NetDeviceVerbSlot[] {
  const refusal = operatedTurnRefusal(entry, combat);
  return netDeviceVerbSlots(entry.figure).map((slot) =>
    refusal ? { ...slot, disabled: refusal } : slot,
  );
}

/**
 * „Obróć” kamery czeka na klik w mapę (wzorem Skoku z 19.10): przycisk belki
 * uzbraja, następny klik w podłoże mówi, dokąd kamera ma patrzeć.
 */
interface DeviceAimState {
  /** Figura kamery, która czeka na punkt — albo null. */
  turning: string | null;
  arm: (tokenId: string | null) => void;
}

export const useDeviceAimStore = create<DeviceAimState>((set) => ({
  turning: null,
  arm: (turning) => set({ turning }),
}));

/** Jedna czynność przejętej figury wysłana serwerowi, z wynikiem nad mapą. */
async function runVerb(
  entry: OperatedEntry,
  operation: NetDeviceOperation,
  lookAt?: ScenePoint,
): Promise<void> {
  const ack = await operateNetDevice({
    runId: entry.run.runId,
    floorId: entry.figure.floorId,
    deviceId: entry.figure.deviceId,
    operation,
    ...(lookAt ? { lookAt } : {}),
  });
  if (!ack.ok) {
    notifyRefusal('net', netErrorText(ack.error));
    return;
  }
  if (ack.data?.summary) notifyInfo(ack.data.summary, { title: 'Sieć', topic: 'net' });
  else clearNotices('net');
}

/** Klik w przycisk czynności na belce przejętej figury. */
export function activateDeviceVerb(tokenId: string, slot: NetDeviceVerbSlot): void {
  if (slot.disabled) {
    notifyRefusal('action', slot.disabled);
    return;
  }
  const entry = operatedFigureOf(tokenId);
  if (!entry) return;
  const aim = useDeviceAimStore.getState();
  if (slot.verb === 'turn') {
    // Drugi klik w ten sam przycisk odkłada obrót, jak przy broni i Skoku.
    aim.arm(aim.turning === tokenId ? null : tokenId);
    return;
  }
  aim.arm(null);
  void runVerb(entry, slot.verb);
}

/**
 * Klik w mapę przy uzbrojonym „Obróć”: kamera patrzy na ten punkt. Zwraca
 * false, gdy nic nie czeka — klik idzie wtedy dalej.
 */
export function turnDeviceAt(worldX: number, worldY: number): boolean {
  const aim = useDeviceAimStore.getState();
  const tokenId = aim.turning;
  if (!tokenId) return false;
  aim.arm(null);
  const entry = operatedFigureOf(tokenId);
  if (!entry || useSelectionStore.getState().tokenId !== tokenId) return false;
  void runVerb(entry, 'turn', { x: worldX, y: worldY });
  return true;
}

/**
 * Pilnuje zaznaczenia po utracie kontroli (odłączenie, Demon, „Wyłącz”):
 * figura, której gracz już nie prowadzi, wypada spod ręki, a belka wraca do
 * netrunnera. Woła `MapArea` przy każdej zmianie runów.
 */
export function dropLostOperated(
  previous: ReadonlySet<string>,
  current: ReadonlySet<string>,
  runnerTokenIdOf: (tokenId: string) => string | null,
  steer: (tokenId: string | null) => void,
): void {
  const selection = useSelectionStore.getState();
  const selected = selection.tokenId ?? selection.focusTokenId;
  if (!selected || !previous.has(selected) || current.has(selected)) return;
  useDeviceAimStore.getState().arm(null);
  const runner = runnerTokenIdOf(selected);
  const tokens = useTokenStore.getState().tokens;
  steer(runner && tokens[runner] ? runner : null);
}
