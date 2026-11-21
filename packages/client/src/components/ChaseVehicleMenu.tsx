import { useEffect, useState } from 'react';
import {
  CHASE_CONTROL_LABELS,
  CHASE_INTENT_LABELS,
  chaseIntentLabel,
  chaseIntentNeedsTarget,
  cpredSpeedMph,
  cpredMountDefinition,
  cpredVehicleUpgrade,
  VEHICLE_LAYOUTS,
  VEHICLE_WINDOW_SIDES,
  ROLE_GM,
  type ChaseIntent,
  type CpredVehicleUpgradeId,
  type SceneVehicleView,
  type TokenView,
  type VehicleWindowSide,
} from '@vtt/shared';
import { useAuthStore } from '../stores/authStore.js';
import { useChaseStore } from '../stores/chaseStore.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { useSceneStore } from '../stores/sceneStore.js';
import { useSelectionStore } from '../stores/selectionStore.js';
import { useTokenStore } from '../stores/tokenStore.js';
import {
  allowVehicleDriver,
  callVehicleManeuver,
  dropVehicleSpikes,
  fireVehicleNitro,
  performVehicleManeuver,
  refillVehicle,
  reloadVehicleMount,
  removeChaseVehicle,
  escapeChaseVehicle,
  restoreChaseVehicle,
  restoreVehicleControl,
  seatInVehicle,
  setChaseIntent,
  setVehicleEngine,
  updateVehicle,
  answerChaseVehicle,
} from '../socket.js';
import { clearNotices, notifyChoice, notifyRefusal } from '../notices.js';
import { useMenuEscape, useMenuTop } from './TokenContextMenu.js';
import { missingMountWeaponsText } from '../chase-mounts.js';
import { chaseRamText } from '../chase-ram.js';

/**
 * Menu auta na scenie pościgu (etap 65b) — klik w auto, a nie w wolny fotel.
 *
 * Fotele z tym, kto w nich siedzi, i „Usiądź” przy wolnych; właściciel auta
 * (i MG) daje tu pasażerom kierownicę, a MG zdejmuje auto z drogi. Kto siada:
 * prowadzona figura, a gdy jej nie ma — jedyna własna figura na scenie.
 */

const MENU_WIDTH = 280;

/** Krótkie nazwy burt do wiersza szyb w panelu. */
const WINDOW_SHORT: Record<VehicleWindowSide, string> = {
  front: 'przód',
  rear: 'tył',
  left: 'lewe',
  right: 'prawe',
};

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
      return 'Kierowca stracił panowanie nad autem — do końca rundy jedzie samo.';
    // Etap 72: jazda w turze kierowcy.
    case 'USE_COCKPIT':
      return 'W walce auto prowadzi się z grupy „Pojazd” w lewej belce: gaz, hamulec, pas i „Jedź”.';
    case 'DRIVE_COMBAT_ONLY':
      return 'Gaz, hamulec i pasy działają w walce — poza nią szyk ustawia MG.';
    case 'DRIVER_NOT_IN_COMBAT':
      return 'Kierowcy nie ma w kolejce — auto jedzie samo na początku rundy.';
    case 'ALREADY_DROVE':
      return 'Auto przejechało już w tej rundzie.';
    case 'AT_MAX_SPEED':
      return 'Auto jedzie już najszybciej, jak umie.';
    case 'STANDING':
      return 'Auto stoi — nie ma czego hamować.';
    case 'LANE_EDGE':
      return 'Tam kończy się jezdnia.';
    case 'CANT_SLOW_BEHIND':
      return 'Zwykły hamulec nie wystarczy — zostaje taran, zmiana pasa albo Manewr.';
    case 'NITRO_AFTER_DRIVE':
      return 'Nitro odpala się przed „Jedź” — auto przejechało już w tej rundzie.';
    case 'NO_MOVE_LEFT':
      return 'Kierowca wydał już Akcję Ruchu w tej turze — zostaje jazda prosto.';
    case 'RAM_USED':
      return 'Kierowca taranował już w tej turze — jeden taran na turę.';
    case 'NO_NITRO':
      return 'W tym aucie nie zostało Nitro.';
    case 'NITRO_COMBAT_ONLY':
      return 'Nitro odpala się w walce — poza nią auto jedzie bez budżetu.';
    case 'BOT_CANNOT_DRIVE':
      return 'Bot jedzie tylko jako pasażer — nie prowadzi.';
    case 'NOT_YOUR_TURN':
      return 'To nie jest twoja tura.';
    // Etap 72c: Wyścig na początku rundy.
    case 'RACE_NOT_WAITING':
    case 'RACE_NOT_FOUND':
      return 'Ten Wyścig jest już rozstrzygnięty.';
    // Etap 72f3: plan rund.
    case 'PLAN_NOT_WAITING':
    case 'PLAN_NOT_FOUND':
      return 'To zdarzenie planu jest już rozstrzygnięte.';
    case 'PLAN_ALREADY_IN_CHASE':
      return 'To auto jest już w pościgu — pomiń zdarzenie albo odłóż je o rundę.';
    case 'PLAN_NO_DRIVERS':
      return 'W kadrze nie ma auta z kierowcą, które zna ten Manewr.';
    case 'NO_ACTION_LEFT':
      return 'Nie masz już Akcji w tej turze.';
    // Etap 65d1: PUK 0.
    case 'VEHICLE_WRECKED':
      return 'Auto jest wrakiem — nie pojedzie, dopóki ktoś go nie naprawi.';
    // Etap 65d2: Manewr, taranowanie i bronie pokładowe.
    case 'UNKNOWN_MANEUVER':
      return 'Ten Manewr nie pasuje do tego pojazdu.';
    case 'MOUNT_DRIVER_ONLY':
      return 'Z broni pokładowej strzela kierowca tego auta.';
    case 'MOUNT_AUTOFIRE_ONLY':
      return 'Pokładowy karabin maszynowy strzela tylko Ogniem ciągłym.';
    case 'MOUNT_FRONT_ONLY':
      return 'Ta broń pokładowa razi tylko cele przed pojazdem.';
    case 'MOUNT_RELOAD_MOVING':
      return 'Broni pokładowej nie da się przeładować w czasie jazdy — zgaś silnik albo zatrzymaj drogę.';
    // Etap 65e: przeszkody i kolczatka.
    case 'OBSTACLE_COMBAT_ONLY':
      return 'Przeszkody wypuszcza się w walce — poza nią nie ma rund, więc droga ich nie przesuwa.';
    case 'OBSTACLE_PENDING':
      return 'Przed autem stoi przeszkoda — najpierw Gwałtowny skręt, Nagłe zatrzymanie albo taranowanie.';
    case 'OBSTACLE_NOT_BLOCKING':
      return 'Ta przeszkoda już na nikogo nie czeka.';
    case 'OBSTACLE_NOT_FOUND':
      return 'Tej przeszkody już nie ma na drodze.';
    case 'OBSTACLE_NO_ROOM':
      return 'Przed tym autem nie ma już kadru — przeszkoda stanęłaby za przednią krawędzią.';
    case 'NO_SPIKES':
      return 'W wyrzutni nie zostało kolczatek na ten pościg.';
    case 'SPIKES_COMBAT_ONLY':
      return 'Kolczatkę zrzuca się w walce, z tury kierowcy.';
    // Etap 72e: zamiar i autopilot.
    case 'PLAYER_DRIVES':
      return 'Za kierownicą siedzi postać gracza — to auto prowadzi gracz, nie autopilot.';
    case 'INTENT_TARGET_NEEDED':
      return 'Ten zamiar potrzebuje innego auta w pościgu jako celu.';
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
  const scene = useSceneStore((s) => s.scene);
  useManeuverCallNotice(vehicles, tokens, user?.id ?? null);
  // Z Manewrami i bronią pokładową (65d2) menu bywa wyższe od okna — wysokość
  // mierzy się po renderze, jak w menu figury.
  const placement = useMenuTop((menu?.clientY ?? 0) + 12);
  const vehicle = menu ? vehicles.find((entry) => entry.id === menu.sceneVehicleId) : undefined;
  useMenuEscape(menu !== null && vehicle !== undefined && user !== null, close);
  if (!menu || !vehicle || !user) return null;
  const isGm = user.role === ROLE_GM;
  const lanes = scene?.chase.lanes ?? 1;
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
  // Etap 72d (MG 20.11): w walce kierowca-gracz ma akcje auta wyłącznie
  // w grupie „Pojazd” lewej belki — menu zostaje informacją, fotelami
  // i kierownicą. MG ma tu wszystko jak dotąd.
  const inCombat = scene?.kind === 'chase' && scene.chase.pursuitSpeed !== null;
  const acts = drives && (isGm || !inCombat);
  // Stojące auto przed czyimś zderzakiem (przegląd 03.11) — MG odpowiada za kierowcę.
  const blockedVehicle = vehicle.blockingVehicleId
    ? vehicles.find((entry) => entry.id === vehicle.blockingVehicleId)
    : undefined;
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

  return (
    <>
      <div
        className="context-menu-backdrop"
        onClick={close}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div
        ref={placement.ref}
        className="context-menu chase-menu"
        style={{ left, top: placement.top, width: MENU_WIDTH }}
        role="menu"
        aria-label={`Auto: ${vehicle.name}`}
      >
        <p className="context-menu-title">{vehicle.name}</p>
        <p className="chase-menu-state">{vehicleStateLine(vehicle, lanes)}</p>
        <VehicleHull vehicle={vehicle} isGm={isGm} />
        {drives && !acts && vehicle.status === 'racing' && (
          <p className="chase-menu-state">
            Nitro, Manewry, kolczatka i silnik — w grupie „Pojazd” w lewej belce.
          </p>
        )}
        {acts && vehicle.status === 'racing' && (
          <button
            type="button"
            className="context-menu-item"
            title="Uruchomienie i zatrzymanie są Akcją. Uruchomienie przesuwa kierowcę na początek kolejki."
            onClick={() => act(() => setVehicleEngine(vehicle.id, !vehicle.started))}
          >
            {vehicle.started ? 'Zgaś silnik' : 'Uruchom silnik'}
          </button>
        )}
        {acts && vehicle.status === 'racing' && vehicle.nitroLeft > 0 && (
          <button
            type="button"
            className="context-menu-item"
            title="Za Akcję, przed „Jedź”: auto przejedzie w tej turze dodatkowo Ruch / 4 kratek (w walce)."
            onClick={() => act(() => fireVehicleNitro(vehicle.id))}
          >
            {`Nitro (${vehicle.nitroLeft})`}
          </button>
        )}
        {acts && vehicle.status === 'racing' && vehicle.spikesLeft > 0 && (
          <button
            type="button"
            className="context-menu-item"
            title="Za Akcję kierowca zrzuca kolczatkę za auto: kto po niej przejedzie, rzuca Prowadzenie PT 17 albo bierze 4k6 w słaby punkt (w walce)."
            onClick={() => act(() => dropVehicleSpikes(vehicle.id))}
          >
            {`Zrzuć kolczatkę (${vehicle.spikesLeft})`}
          </button>
        )}
        {vehicle.status === 'racing' && (
          <VehicleManeuvers vehicle={vehicle} driver={driver} isGm={isGm} drives={acts} act={act} />
        )}
        {drives && vehicle.mounts.length > 0 && <VehicleMounts vehicle={vehicle} act={act} />}
        {isGm && vehicle.status === 'racing' && !driver?.ownerId && (
          <VehicleIntent vehicle={vehicle} vehicles={vehicles} />
        )}
        {isGm && vehicle.status === 'racing' && (
          <button
            type="button"
            className="context-menu-item"
            title="Auto odjeżdża z pościgu z całą załogą: znika graczom, a jego figury wychodzą z kolejki. „Przywróć do pościgu” je cofa."
            onClick={() => act(() => escapeChaseVehicle(vehicle.id))}
          >
            Ucieka
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
        {isGm && vehicle.refillable && (
          <button
            type="button"
            className="context-menu-item"
            title="Pełne zbiorniki Nitro i pełna wyrzutnia kolczatki — „raz dziennie” rozstrzyga MG."
            onClick={() => act(() => refillVehicle(vehicle.id))}
          >
            Uzupełnij Nitro i kolczatki
          </button>
        )}
        {isGm && blockedVehicle && (
          <>
            <p className="context-menu-section">{`Za kierowcę: ${blockedVehicle.name}`}</p>
            <button
              type="button"
              className="context-menu-item"
              title="Test REF + Prowadzenie przeciw PT 13. Porażka — utrata kontroli i zderzenie."
              onClick={() => act(() => answerChaseVehicle(vehicle.id, 'swerve'))}
            >
              Gwałtowny skręt (PT 13)
            </button>
            <button
              type="button"
              className="context-menu-item"
              title="Test REF + Prowadzenie przeciw PT 13: auto staje przed stojącym autem. Porażka — utrata kontroli i zderzenie."
              onClick={() => act(() => answerChaseVehicle(vehicle.id, 'stop'))}
            >
              Nagłe zatrzymanie (PT 13)
            </button>
            <button
              type="button"
              className="context-menu-item"
              title={chaseRamText('vehicle', blockedVehicle.ramPlow, true)}
              onClick={() => act(() => answerChaseVehicle(vehicle.id, 'ram'))}
            >
              Taranuj
            </button>
          </>
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
                <span className="chase-menu-seat-who">
                  {occupant.imageUrl ? (
                    <img className="chase-menu-portrait" src={occupant.imageUrl} alt="" />
                  ) : null}
                  {occupant.name}
                </span>
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

/** Wartość listy „Zamiar”: zamiar i cel w jednym polu („pursue|id”). */
function intentValue(intent: ChaseIntent, targetId: string | null): string {
  return chaseIntentNeedsTarget(intent) && targetId ? `${intent}|${targetId}` : intent;
}

/**
 * Zamiar auta NPC-a dla autopilota (etap 72e) — jedna lista z zamiarem i celem
 * razem („Goń: Włóczęga”), żeby MG miał jedną kontrolkę. Zmiana działa od razu:
 * w turze kierowcy kokpit i duch pokazują nowy plan. Hamulec całej sceny stoi
 * na pasku narzędzi.
 */
export function VehicleIntent({
  vehicle,
  vehicles,
  className = 'chase-menu-intent',
  labelClassName = 'context-menu-section',
}: {
  vehicle: SceneVehicleView;
  vehicles: readonly SceneVehicleView[];
  /** Klasa etykiety — menu auta albo wiersz auta w kreatorze (72f1). */
  className?: string;
  /** Podpis „Zamiar”: nagłówek sekcji menu albo zwykły podpis wiersza. */
  labelClassName?: string;
}) {
  const autopilot = useSceneStore((s) => s.scene?.chase.autopilot ?? true);
  const current = vehicle.intent ?? { intent: 'manual' as const, targetId: null };
  const targets = vehicles.filter((entry) => entry.id !== vehicle.id && entry.status === 'racing');
  const value = intentValue(current.intent, current.targetId);
  return (
    <label
      className={className}
      title={
        autopilot
          ? 'Autopilot dobiera gaz, hamulec i pas w turze kierowcy. Kokpit pokazuje plan — bez „Jedź” auto pojedzie nim na koniec tury.'
          : 'Autopilot sceny jest wyłączony (pasek narzędzi) — auta jadą ręcznie.'
      }
    >
      <span className={labelClassName}>Zamiar</span>
      <select
        value={value}
        onChange={(event) => {
          const [intent, targetId] = event.target.value.split('|') as [ChaseIntent, string?];
          void setChaseIntent(vehicle.id, intent, targetId ?? null).then((ack) => {
            if (!ack.ok) notifyRefusal('chase', chaseErrorText(ack.error));
          });
        }}
      >
        <option value="manual">{CHASE_INTENT_LABELS.manual}</option>
        <option value="flee">{CHASE_INTENT_LABELS.flee}</option>
        {targets.flatMap((target) =>
          (['pursue', 'keep', 'ram', 'block'] as const).map((intent) => (
            <option key={`${intent}|${target.id}`} value={intentValue(intent, target.id)}>
              {chaseIntentLabel(intent, target.name)}
            </option>
          )),
        )}
        {/* Cel, który wypadł z kadru, zostaje widoczny, póki MG nie zmieni zamiaru. */}
        {chaseIntentNeedsTarget(current.intent) &&
          !targets.some((target) => target.id === current.targetId) && (
            <option
              value={value}
            >{`${CHASE_INTENT_LABELS[current.intent]}: (poza pościgiem)`}</option>
          )}
      </select>
    </label>
  );
}

/**
 * Kadłub auta (etap 65d1): PUK z paskiem, OB, szyby kuloodporne, Nitro
 * i ulepszenia — jawne dla stołu jak PW osłony. MG ustawia PUK ręcznie
 * (naprawa jest poza etapem — `POMYSLY.md`).
 */
function VehicleHull({ vehicle, isGm }: { vehicle: SceneVehicleView; isGm: boolean }) {
  const [draft, setDraft] = useState<string>(String(vehicle.hp));
  const share = vehicle.hpMax > 0 ? Math.max(0, Math.min(1, vehicle.hp / vehicle.hpMax)) : 0;
  const missingMounts = isGm
    ? missingMountWeaponsText(
        vehicle.mounts.map((mount) => ({ upgradeId: mount.upgradeId as CpredVehicleUpgradeId })),
      )
    : null;
  const save = () => {
    const hp = Number.parseInt(draft, 10);
    if (!Number.isInteger(hp) || hp === vehicle.hp) return;
    void updateVehicle(vehicle.vehicleId, { system: { hp } }).then((ack) => {
      if (!ack.ok) notifyRefusal('chase', chaseErrorText(ack.error));
    });
  };
  return (
    <div className="chase-menu-hull">
      <div className="chase-menu-hull-row">
        <span>{vehicle.hp > 0 ? 'PUK' : 'Wrak · PUK'}</span>
        {isGm ? (
          <span className="chase-menu-hull-edit">
            <input
              type="number"
              min={0}
              max={vehicle.hpMax}
              value={draft}
              aria-label="PUK auta"
              onChange={(event) => setDraft(event.target.value)}
              onBlur={save}
              onKeyDown={(event) => {
                if (event.key === 'Enter') save();
              }}
            />
            /{vehicle.hpMax}
          </span>
        ) : (
          <strong>
            {vehicle.hp}/{vehicle.hpMax}
          </strong>
        )}
        <span title="OB kadłuba — schodzi z każdego trafienia w auto">OB {vehicle.armorSp}</span>
      </div>
      <div
        className={`chase-menu-hull-bar${vehicle.hp > 0 ? '' : ' is-wrecked'}`}
        role="meter"
        aria-label="PUK"
        aria-valuemin={0}
        aria-valuemax={vehicle.hpMax}
        aria-valuenow={vehicle.hp}
      >
        <span style={{ width: `${Math.round(share * 100)}%` }} />
      </div>
      {vehicle.windows && (
        <p
          className="chase-menu-state"
          title="Szyby kuloodporne: osłona pasażera na burcie zwróconej do strzelca, dopóki mają PW"
        >
          Szyby:{' '}
          {VEHICLE_WINDOW_SIDES.map(
            (side) =>
              `${WINDOW_SHORT[side]} ${vehicle.windows![side].hp}/${vehicle.windows![side].max}`,
          ).join(' · ')}
        </p>
      )}
      {vehicle.upgrades.length > 0 && (
        <p className="chase-menu-state">
          {vehicle.upgrades.join(', ')}
          {vehicle.nitroLeft > 0 ? ` · Nitro: ${vehicle.nitroLeft}` : ''}
        </p>
      )}
      {isGm && missingMounts && (
        <p className="chase-menu-state chase-menu-warning">{missingMounts}</p>
      )}
    </div>
  );
}

/** „100 mil/h (maks. 200) · pas 2 z 3 · kierowca prowadzi” — stan auta jednym wierszem. */
function vehicleStateLine(vehicle: SceneVehicleView, lanes: number): string {
  if (vehicle.status === 'behind') return 'Zostało w tyle — poza pościgiem';
  if (vehicle.status === 'escaped') return 'Uciekło — poza pościgiem';
  const speed = `${cpredSpeedMph(vehicle.speed)} mil/h (maks. ${cpredSpeedMph(vehicle.maxSpeed)})`;
  const lane = `pas ${vehicle.lane + 1} z ${lanes}`;
  if (vehicle.status === 'wrecked') return `Wrak — stoi, droga zabiera go w tył · ${lane}`;
  const engine = vehicle.started ? speed : 'silnik zgaszony';
  // Bez kierowcy auto toczy się i zwalnia, a potem stoi (05.11.2026).
  const control =
    vehicle.control === 'none' && vehicle.started
      ? vehicle.speed > 0
        ? 'bez kierowcy — toczy się i zwalnia'
        : 'bez kierowcy — stoi'
      : CHASE_CONTROL_LABELS[vehicle.control];
  return `${engine} · ${lane} · ${control}`;
}

type MenuAct = (call: () => Promise<{ ok: boolean; error?: string }>) => void;

/**
 * Manewr (etap 65d2, s. 192): kierowca deklaruje go sam (w walce za Akcję),
 * a MG wzywa do niego kierowcę-gracza albo rzuca za kierowcę-NPC-a od razu.
 */
function VehicleManeuvers({
  vehicle,
  driver,
  isGm,
  drives,
  act,
}: {
  vehicle: SceneVehicleView;
  driver: TokenView | undefined;
  isGm: boolean;
  drives: boolean;
  act: MenuAct;
}) {
  if (!driver || vehicle.maneuvers.length === 0) return null;
  // Figura gracza za kierownicą: MG ją wzywa, a rzuca gracz. NPC — rzuca MG.
  const calls = isGm && typeof driver.ownerId === 'string' && driver.ownerId.length > 0;
  if (!drives && !calls) return null;
  return (
    <>
      <p className="context-menu-section">
        {calls ? 'Wezwij do Manewru' : 'Manewr — Akcja, porażka to utrata kontroli'}
      </p>
      {calls && vehicle.maneuverCall && (
        <button
          type="button"
          className="context-menu-item"
          onClick={() => act(() => callVehicleManeuver(vehicle.id, null))}
        >
          {`Odwołaj: ${vehicle.maneuverCall.label}`}
        </button>
      )}
      {vehicle.maneuvers.map((maneuver) => (
        <button
          key={maneuver.id}
          type="button"
          className="context-menu-item"
          title={
            calls
              ? 'Kierowca dostaje pasek z „Wykonaj Manewr” — na wezwanie Manewr nie kosztuje Akcji.'
              : 'Test REF + Prowadzenie + 1k10 przeciw PT. Porażka — MG prowadzi auto do końca rundy.'
          }
          onClick={() =>
            act(() =>
              calls
                ? callVehicleManeuver(vehicle.id, maneuver.id)
                : performVehicleManeuver(vehicle.id, maneuver.id),
            )
          }
        >
          {maneuver.label}
        </button>
      ))}
    </>
  );
}

/** Bronie pokładowe auta (65d2): przeładowanie na postoju; strzela się z paska kierowcy. */
function VehicleMounts({ vehicle, act }: { vehicle: SceneVehicleView; act: MenuAct }) {
  const loadable = vehicle.mounts.filter(
    (mount) => cpredMountDefinition(mount.upgradeId)?.magazine !== 0,
  );
  if (loadable.length === 0) return null;
  return (
    <>
      <p className="context-menu-section">Broń pokładowa</p>
      {loadable.map((mount) => (
        <button
          key={mount.id}
          type="button"
          className="context-menu-item"
          disabled={vehicle.moving}
          title={
            vehicle.moving
              ? 'Nie da się przeładować w czasie jazdy — zgaś silnik albo zatrzymaj drogę.'
              : 'Pełny magazynek, w walce za Akcję.'
          }
          onClick={() => act(() => reloadVehicleMount(vehicle.id, mount.id))}
        >
          {`Przeładuj: ${cpredVehicleUpgrade(mount.upgradeId)?.name ?? mount.upgradeId}`}
        </button>
      ))}
    </>
  );
}

/**
 * Pasek wezwania do Manewru u kierowcy-gracza (65d2): stoi, dopóki MG nie
 * odwoła albo kierowca nie wykona Manewru.
 */
function useManeuverCallNotice(
  vehicles: readonly SceneVehicleView[],
  tokens: Record<string, TokenView>,
  userId: string | null,
): void {
  let call: { vehicle: SceneVehicleView; id: string; label: string } | null = null;
  for (const vehicle of vehicles) {
    if (!vehicle.maneuverCall || !userId) continue;
    const driver = Object.values(tokens).find(
      (token) => token.vehicleSeat?.sceneVehicleId === vehicle.id && token.vehicleSeat.seat === 0,
    );
    if (driver?.ownerId === userId) {
      call = { vehicle, ...vehicle.maneuverCall };
      break;
    }
  }
  const key = call ? `${call.vehicle.id}:${call.id}` : null;
  useEffect(() => {
    if (!call) {
      clearNotices('maneuver');
      return;
    }
    const { vehicle, id, label } = call;
    notifyChoice(
      'maneuver',
      `MG wzywa do Manewru: ${label}. Porażka to utrata kontroli nad autem.`,
      [
        {
          label: 'Wykonaj Manewr',
          run: () =>
            void performVehicleManeuver(vehicle.id, id).then((ack) => {
              if (!ack.ok) notifyRefusal('chase', chaseErrorText(ack.error));
            }),
        },
      ],
      { title: vehicle.name },
    );
    // Klucz mówi wszystko, co pasek pokazuje — nowe wezwanie to nowy pasek.
  }, [key]);
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
