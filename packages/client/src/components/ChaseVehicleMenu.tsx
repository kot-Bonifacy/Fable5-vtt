import {
  CHASE_CONTROL_LABELS,
  VEHICLE_LAYOUTS,
  ROLE_GM,
  type SceneVehicleView,
  type TokenView,
} from '@vtt/shared';
import { useAuthStore } from '../stores/authStore.js';
import { useChaseStore } from '../stores/chaseStore.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { useSelectionStore } from '../stores/selectionStore.js';
import { useTokenStore } from '../stores/tokenStore.js';
import {
  allowVehicleDriver,
  fireVehicleNitro,
  removeChaseVehicle,
  restoreChaseVehicle,
  restoreVehicleControl,
  seatInVehicle,
  setVehicleEngine,
} from '../socket.js';
import { notifyRefusal } from '../notices.js';

/**
 * Menu auta na scenie pościgu (etap 65b) — klik w auto, a nie w wolny fotel.
 *
 * Fotele z tym, kto w nich siedzi, i „Usiądź” przy wolnych; właściciel auta
 * (i MG) daje tu pasażerom kierownicę, a MG zdejmuje auto z drogi. Kto siada:
 * prowadzona figura, a gdy jej nie ma — jedyna własna figura na scenie.
 */

const MENU_WIDTH = 260;

/** Zdania odmów `vehicle:seat` i reszty zdarzeń auta. */
export function chaseErrorText(code: string | undefined): string {
  switch (code) {
    case 'SEAT_TAKEN':
      return 'Ten fotel jest już zajęty.';
    case 'DRIVER_SEAT_FORBIDDEN':
      return 'Za kierownicą siada właściciel auta albo ten, komu na to pozwoli.';
    case 'VEHICLE_SWITCH_GM_ONLY':
      return 'Do innego auta przesadza tylko MG.';
    case 'IN_VEHICLE':
      return 'Postać siedzi w aucie i jedzie razem z nim — przesiąść się możesz przez menu auta.';
    case 'NOT_A_CHASE':
      return 'Auta stawia się tylko na scenie pościgu.';
    case 'FORBIDDEN':
      return 'Nie możesz tego zrobić z tym autem.';
    case 'NOT_DRIVER':
      return 'Auto prowadzi ten, kto siedzi za kierownicą.';
    case 'DRIVER_INCAPABLE':
      return 'Kierowca nie jest w stanie prowadzić — ktoś musi się przesiąść.';
    case 'VEHICLE_NOT_RACING':
      return 'To auto odpadło z pościgu — wróci, gdy MG je przywróci.';
    case 'VEHICLE_NOT_STARTED':
      return 'Silnik jest zgaszony — najpierw uruchom auto.';
    case 'VEHICLE_OUT_OF_CONTROL':
      return 'Kierowca stracił panowanie nad autem — do następnej rundy prowadzi je MG.';
    case 'DRIVING_TEST_NEEDS_ACTION':
      return 'Zwykła jazda wymaga Testu w ramach Akcji, a Akcja tej tury już poszła.';
    case 'NO_NITRO':
      return 'W tym aucie nie zostało Nitro.';
    case 'NITRO_COMBAT_ONLY':
      return 'Nitro odpala się w walce — poza nią auto jedzie bez budżetu.';
    case 'BOT_CANNOT_DRIVE':
      return 'Bot jedzie tylko jako pasażer — nie prowadzi.';
    case 'NO_MOVE_LEFT':
      return 'Auto przejechało już cały Ruch tej tury.';
    case 'NOT_YOUR_TURN':
      return 'To nie jest twoja tura.';
    case 'NO_ACTION_LEFT':
      return 'Nie masz już Akcji w tej turze.';
    default:
      return `Nie udało się: ${code ?? 'nieznany błąd'}.`;
  }
}

/** Figura, którą ten widz posadzi w fotelu — prowadzona albo jedyna własna. */
export function seatableFigure(
  tokens: Record<string, TokenView>,
  sceneId: string,
  steeredId: string | null,
  userId: string | null,
  isGm: boolean,
): TokenView | null {
  const steered = steeredId ? tokens[steeredId] : undefined;
  if (steered && steered.sceneId === sceneId && (isGm || steered.ownerId === userId)) {
    return steered;
  }
  if (isGm) return null;
  const own = Object.values(tokens).filter(
    (token) => token.sceneId === sceneId && token.ownerId === userId,
  );
  return own.length === 1 ? own[0]! : null;
}

export function ChaseVehicleMenu() {
  const menu = useChaseStore((s) => s.menu);
  const vehicles = useChaseStore((s) => s.vehicles);
  const close = useChaseStore((s) => s.closeMenu);
  const tokens = useTokenStore((s) => s.tokens);
  const characters = useCharacterStore((s) => s.characters);
  const steeredId = useSelectionStore((s) => s.tokenId);
  const user = useAuthStore((s) => s.user);
  const vehicle = menu ? vehicles.find((entry) => entry.id === menu.sceneVehicleId) : undefined;
  if (!menu || !vehicle || !user) return null;
  const isGm = user.role === ROLE_GM;
  const passengers = Object.values(tokens).filter(
    (token) => token.vehicleSeat?.sceneVehicleId === vehicle.id,
  );
  const bySeat = new Map(passengers.map((token) => [token.vehicleSeat!.seat, token]));
  const figure = seatableFigure(tokens, vehicle.sceneId, steeredId, user.id, isGm);
  const ownsVehicle =
    vehicle.ownerCharacterId !== null && characters[vehicle.ownerCharacterId] !== undefined;
  const mayGrantWheel = isGm || ownsVehicle;
  const driver = bySeat.get(0);
  const drives = isGm || (driver !== undefined && driver.ownerId === user.id);
  const act = (call: () => Promise<{ ok: boolean; error?: string }>) => {
    void call().then((ack) => {
      if (!ack.ok) notifyRefusal('chase', chaseErrorText(ack.error));
    });
    close();
  };

  const sit = (seat: number) => {
    if (!figure) return;
    void seatInVehicle({ tokenId: figure.id, sceneVehicleId: vehicle.id, seat }).then((ack) => {
      if (!ack.ok) notifyRefusal('chase', chaseErrorText(ack.error));
    });
    close();
  };

  const left = Math.max(8, Math.min(menu.clientX + 12, window.innerWidth - MENU_WIDTH - 8));
  const top = Math.max(8, Math.min(menu.clientY + 12, window.innerHeight - 320));

  return (
    <>
      <div
        className="context-menu-backdrop"
        onClick={close}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div
        className="context-menu chase-menu"
        style={{ left, top, width: MENU_WIDTH }}
        role="menu"
        aria-label={`Auto: ${vehicle.name}`}
      >
        <p className="context-menu-title">{vehicle.name}</p>
        <p className="chase-menu-state">{vehicleStateLine(vehicle)}</p>
        {drives && vehicle.status === 'racing' && (
          <button
            type="button"
            className="context-menu-item"
            title="Uruchomienie i zatrzymanie są Akcją. Uruchomienie przesuwa kierowcę na początek kolejki."
            onClick={() => act(() => setVehicleEngine(vehicle.id, !vehicle.started))}
          >
            {vehicle.started ? 'Zgaś silnik' : 'Uruchom silnik'}
          </button>
        )}
        {drives && vehicle.status === 'racing' && vehicle.nitroLeft > 0 && (
          <button
            type="button"
            className="context-menu-item"
            title="Za Akcję kierowca dostaje drugi Ruch pojazdu (w walce)."
            onClick={() => act(() => fireVehicleNitro(vehicle.id))}
          >
            {`Nitro (${vehicle.nitroLeft})`}
          </button>
        )}
        {isGm && (vehicle.status === 'behind' || vehicle.status === 'escaped') && (
          <button
            type="button"
            className="context-menu-item"
            onClick={() => act(() => restoreChaseVehicle(vehicle.id))}
          >
            Przywróć do pościgu
          </button>
        )}
        {isGm && vehicle.control === 'lost' && (
          <button
            type="button"
            className="context-menu-item"
            onClick={() => act(() => restoreVehicleControl(vehicle.id))}
          >
            Oddaj kierowcy kontrolę
          </button>
        )}
        <p className="context-menu-section">Fotele</p>
        {VEHICLE_LAYOUTS[vehicle.layout].map((_, seat) => {
          const occupant = bySeat.get(seat);
          const label = seat === 0 ? 'Kierowca' : `Fotel ${seat + 1}`;
          const here =
            figure !== null &&
            figure.vehicleSeat?.sceneVehicleId === vehicle.id &&
            figure.vehicleSeat.seat === seat;
          return (
            <div key={seat} className="chase-menu-seat">
              <span className="chase-menu-seat-label">{label}</span>
              {occupant ? (
                <span className="chase-menu-seat-who">{occupant.name}</span>
              ) : figure && !here ? (
                <button type="button" className="context-menu-item" onClick={() => sit(seat)}>
                  {isGm ? `Posadź: ${figure.name}` : 'Usiądź'}
                </button>
              ) : (
                <span className="chase-menu-seat-who chase-menu-seat-who--free">wolny</span>
              )}
            </div>
          );
        })}
        {mayGrantWheel && <DriverGrants vehicle={vehicle} passengers={passengers} />}
        {isGm && (
          <button
            type="button"
            className="context-menu-item context-menu-item--danger"
            onClick={() => {
              void removeChaseVehicle(vehicle.id).then((ack) => {
                if (!ack.ok) notifyRefusal('chase', chaseErrorText(ack.error));
              });
              close();
            }}
          >
            Zdejmij z drogi
          </button>
        )}
      </div>
    </>
  );
}

/** „Ruch 5 kratek/turę · dryf −5 · kierowca prowadzi” — stan auta jednym wierszem. */
function vehicleStateLine(vehicle: SceneVehicleView): string {
  if (vehicle.status === 'behind') return 'Zostało w tyle — poza pościgiem';
  if (vehicle.status === 'escaped') return 'Uciekło — poza pościgiem';
  const drift =
    vehicle.driftSq === 0
      ? 'bez dryfu'
      : `dryf ${vehicle.driftSq > 0 ? '+' : '−'}${formatSq(Math.abs(vehicle.driftSq))}/rundę`;
  const move = vehicle.started ? `${formatSq(vehicle.moveSq)} kratek/turę` : 'silnik zgaszony';
  return `${move} · ${drift} · ${CHASE_CONTROL_LABELS[vehicle.control]}`;
}

function formatSq(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ',');
}

/** Kierownica dla pasażerów z kartą — poza kartą właściciela, która ma ją zawsze. */
function DriverGrants({
  vehicle,
  passengers,
}: {
  vehicle: SceneVehicleView;
  passengers: TokenView[];
}) {
  // Właściciel ma kierownicę zawsze, więc nie ma czego mu dawać. Gracz nie zna
  // kart cudzych figur — rozpoznaje własne po `characterId`, resztę pokazuje.
  const candidates = passengers.filter(
    (token) => !token.characterId || token.characterId !== vehicle.ownerCharacterId,
  );
  if (candidates.length === 0) return null;
  return (
    <>
      <p className="context-menu-section">Może prowadzić</p>
      {candidates.map((token) => {
        const allowed = vehicle.driverTokenIds.includes(token.id);
        return (
          <label key={token.id} className="context-menu-status">
            <input
              type="checkbox"
              checked={allowed}
              onChange={() =>
                void allowVehicleDriver({
                  sceneVehicleId: vehicle.id,
                  tokenId: token.id,
                  allow: !allowed,
                }).then((ack) => {
                  if (!ack.ok) notifyRefusal('chase', chaseErrorText(ack.error));
                })
              }
            />
            {token.name}
          </label>
        );
      })}
    </>
  );
}
