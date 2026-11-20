import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import {
  chaseIsHorizontal,
  chaseLaneTarget,
  cpredDriveAdvance,
  cpredPedalProblem,
  cpredPedalSpeed,
  cpredSpeedMph,
  formatMetres,
  ROLE_GM,
  tokenHpShareOf,
  type ChaseDirection,
  type SceneVehicleView,
  type TokenView,
  type VehicleDriveContact,
  type VehicleDriveContactInfo,
} from '@vtt/shared';
import { takeFigure } from '../hud.js';
import { hpRingTone } from '../map/token-ring.js';
import { clearNotices, notifyChoice, notifyRefusal } from '../notices.js';
import { driveVehicle } from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { useChaseStore } from '../stores/chaseStore.js';
import { useSceneStore } from '../stores/sceneStore.js';
import { chaseErrorText } from './ChaseVehicleMenu.js';
import { useHudTip } from './HudTip.js';

/**
 * Grupa „Pojazd” w lewej belce (etap 72b2, wariant B z makiety MG z 15.11).
 *
 * Kokpit kierowcy w walce na scenie pościgu: duży kafel auta (budowa kafla
 * broni), krzyżak ze średnich kafli ułożony tak, jak widać auto — gaz po
 * stronie kierunku jazdy, hamulec naprzeciw, pasy nad i pod nimi — i „Jedź”.
 * Żadnego własnego języka wizualnego (decyzja MG nr 9): te same klasy
 * `hud-slot`, znaczki kosztu i dymki co reszta belki z etapu 69.
 *
 * Wybór pedału i pasu to stan klienta aż do „Jedź”; serwer (`vehicle:drive`)
 * liczy ruch i pyta o zderzenie, zanim cokolwiek wyda. Nitro, Manewry,
 * kolczatka i silnik zostają do 72d w menu auta (klik w kafel).
 */

type Pedal = 'gas' | 'brake' | null;
type LaneDelta = -1 | 0 | 1;

/** Auto, które ta figura prowadzi w walce na scenie pościgu — albo nic. */
export function useCockpitVehicle(token: TokenView | null): SceneVehicleView | null {
  const vehicles = useChaseStore((s) => s.vehicles);
  const inCombat = useSceneStore(
    (s) => s.scene?.kind === 'chase' && s.scene.chase.pursuitSpeed !== null,
  );
  const seat = token?.vehicleSeat;
  if (!inCombat || !seat || seat.seat !== 0) return null;
  const vehicle = vehicles.find((entry) => entry.id === seat.sceneVehicleId);
  return vehicle && vehicle.status === 'racing' ? vehicle : null;
}

/** Zdanie pytania o zderzenie na drodze ruchu (etap 72). */
function contactQuestion(contact: VehicleDriveContactInfo): string {
  if (contact.side) return `Na sąsiednim pasie: ${contact.name}. Zepchnąć je bokiem (bez Pługa)?`;
  if (contact.canSlow) {
    return `Na drodze: ${contact.name} (${cpredSpeedMph(contact.speed)} mil/h). Taranować czy zwolnić za nim?`;
  }
  return `Na drodze: ${contact.name}. Hamulec nie wystarczy — taranować, czy zmienić plan (pas, Manewr)?`;
}

/** Wysyła ruch; zderzenie wraca pytaniem paskiem (do 72d — potem w belce). */
function sendDrive(
  vehicleId: string,
  pedal: Pedal,
  laneDelta: LaneDelta,
  onContact?: VehicleDriveContact,
): void {
  void driveVehicle({
    sceneVehicleId: vehicleId,
    pedal,
    laneDelta,
    ...(onContact ? { onContact } : {}),
  }).then((ack) => {
    if (!ack.ok) {
      notifyRefusal('chase', chaseErrorText(ack.error));
      return;
    }
    if (ack.data && !ack.data.moved) {
      const { contact } = ack.data;
      notifyChoice(
        'chase',
        contactQuestion(contact),
        [
          {
            label: contact.side ? 'Zepchnij' : 'Taranuj',
            run: () => sendDrive(vehicleId, pedal, laneDelta, 'ram'),
          },
          ...(contact.canSlow
            ? [
                {
                  label: 'Zwolnij za nim',
                  run: () => sendDrive(vehicleId, pedal, laneDelta, 'slow'),
                },
              ]
            : []),
          { label: 'Zmienię plan', run: () => undefined },
        ],
        { title: 'Zderzenie' },
      );
      return;
    }
    clearNotices('chase');
  });
}

/** Grafika modelu obrócona przodem w kierunku jazdy (pliki stoją przodem do góry). */
const ART_ROTATION: Record<ChaseDirection, number> = { up: 0, right: 90, down: 180, left: -90 };

/** Kierunek strzałki na ekranie. */
type Arrow = 'up' | 'down' | 'left' | 'right';

const OPPOSITE: Record<Arrow, Arrow> = { up: 'down', down: 'up', left: 'right', right: 'left' };

/**
 * Jeden kafel krzyżaka: średni kafel belki z trójkątem zamiast sylwetki
 * i skutkiem pod nazwą. Odmowa nie wyłącza przycisku (jak reszta belki) —
 * klik mówi powód w kanale, dymek mówi go od razu.
 */
function DriveTile({
  label,
  effect,
  arrow,
  pressed,
  refusal,
  tip,
  className,
  onToggle,
}: {
  label: string;
  effect: string;
  arrow: Arrow;
  pressed: boolean;
  refusal: string | null;
  tip: string;
  className?: string;
  onToggle: () => void;
}) {
  const hudTip = useHudTip({ title: label, cost: 'Akcja Ruchu', body: tip, refusal });
  const trailing = arrow === 'right';
  return (
    <button
      type="button"
      className={`hud-slot hud-slot--medium hud-drive-tile${pressed ? ' hud-slot--armed' : ''}${
        refusal ? ' hud-slot--refused' : ''
      }${trailing ? ' hud-drive-tile--trailing' : ''}${className ? ` ${className}` : ''}`}
      aria-pressed={pressed}
      data-drive={label}
      onClick={() => {
        if (refusal) notifyRefusal('chase', refusal);
        else onToggle();
      }}
      {...hudTip}
    >
      <span className={`hud-slot-icon hud-drive-arrow hud-drive-arrow--${arrow}`} aria-hidden />
      <span className="hud-slot-body">
        <span className="hud-slot-label">{label}</span>
        <span className="hud-slot-cost">
          <span>{effect}</span>
        </span>
      </span>
    </button>
  );
}

/** „Jedź” — napis tuszem z czerwoną kreską, jak „Kończę turę”. */
function DriveGo({
  costs,
  refusal,
  onGo,
}: {
  costs: boolean;
  refusal: string | null;
  onGo: () => void;
}) {
  const tip = useHudTip({
    title: 'Jedź',
    cost: costs ? 'Akcja Ruchu' : 'za darmo',
    body: costs
      ? 'Wykonuje ruch auta z wybranym pedałem i pasem.'
      : 'Jazda prosto z tą samą prędkością nic nie kosztuje. Bez „Jedź” auto pojedzie samo na koniec tury.',
    refusal,
  });
  return (
    <button
      type="button"
      className={`hud-drive-go${refusal ? ' hud-drive-go--refused' : ''}`}
      onClick={() => {
        if (refusal) notifyRefusal('chase', refusal);
        else onGo();
      }}
      {...tip}
    >
      <span className="hud-drive-go-label">Jedź</span>
      <span className="hud-slot-cost">
        {costs && <span className="hud-cost hud-cost--move" aria-hidden />}
        <span>{costs ? 'Akcja Ruchu' : 'za darmo'}</span>
      </span>
    </button>
  );
}

/** Kafel auta: grafika modelu, nazwa, prędkość przed i po pedale, PUK. */
function VehicleTile({
  vehicle,
  direction,
  after,
}: {
  vehicle: SceneVehicleView;
  direction: ChaseDirection;
  after: number;
}) {
  const openMenu = useChaseStore((s) => s.openMenu);
  const tip = useHudTip({
    title: vehicle.name,
    body: 'Fotele, szyby, Nitro, Manewry, kolczatka i silnik — w panelu auta.',
  });
  const tone = hpRingTone(tokenHpShareOf({ current: vehicle.hp, max: vehicle.hpMax }));
  const ratio = vehicle.hpMax > 0 ? Math.max(0, Math.min(1, vehicle.hp / vehicle.hpMax)) : 0;
  const artStyle = { '--hud-vehicle-turn': `${ART_ROTATION[direction]}deg` } as CSSProperties;
  return (
    <div className="hud-slot-row hud-slot--vehicle hud-slot--armed">
      <button
        type="button"
        className="hud-slot hud-slot--large"
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          openMenu(vehicle.id, box.right, box.top);
        }}
        {...tip}
      >
        <span className="hud-slot-art hud-vehicle-art" style={artStyle}>
          {vehicle.imageUrl ? (
            <img className="hud-vehicle-image" src={vehicle.imageUrl} alt="" />
          ) : (
            <span className="hud-vehicle-image hud-vehicle-image--blank" aria-hidden />
          )}
        </span>
        <span className="hud-slot-body">
          <span className="hud-slot-label">{vehicle.name}</span>
          <span className="hud-slot-line hud-slot-line--stats hud-vehicle-speed">
            <strong className="hud-slot-damage">{cpredSpeedMph(vehicle.speed)}</strong>
            {after !== vehicle.speed && (
              <>
                {' → '}
                <strong className="hud-vehicle-speed-next">{cpredSpeedMph(after)}</strong>
              </>
            )}
            {` mil/h · maks. ${cpredSpeedMph(vehicle.maxSpeed)}`}
          </span>
          <span
            className={`hud-hp hud-hp--${tone} hud-vehicle-hp`}
            title={`Punkty Uszkodzeń Konstrukcji: ${vehicle.hp}/${vehicle.hpMax}`}
          >
            <span className="hud-hp-label">PUK</span>
            <span className="hud-hp-track">
              <span className="hud-hp-fill" style={{ width: `${ratio * 100}%` }} />
            </span>
            <span className="hud-hp-value">
              {vehicle.hp}
              <span className="hud-hp-max">/{vehicle.hpMax}</span>
            </span>
          </span>
        </span>
      </button>
    </div>
  );
}

/**
 * Czemu kokpit nie przyjmie żadnego ruchu — jedno zdanie dla całego krzyżaka
 * (cudza tura, ruch wykonany, silnik, utrata kontroli); `null`, gdy można jechać.
 */
function cockpitRefusal(
  vehicle: SceneVehicleView,
  turnRefusal: string | null,
  mayDrive: boolean,
): string | null {
  if (!mayDrive) return 'Tym autem prowadzi kierowca, nie ty.';
  if (vehicle.moved) return 'Ruch auta w tej rundzie wykonany.';
  if (!vehicle.started) return chaseErrorText('VEHICLE_NOT_STARTED');
  if (vehicle.control === 'lost') return chaseErrorText('VEHICLE_OUT_OF_CONTROL');
  if (vehicle.control !== 'driver') return 'Kierowca nie panuje nad autem.';
  return turnRefusal;
}

export function HudVehicle({
  token,
  vehicle,
  turnRefusal,
}: {
  token: TokenView;
  vehicle: SceneVehicleView;
  /** Odmowa całej belki („nie twoja tura”) albo `null`. */
  turnRefusal: string | null;
}) {
  const chase = useSceneStore((s) => s.scene?.chase);
  const metresPerSquare = useSceneStore((s) => s.scene?.metersPerSquare ?? 1);
  const user = useAuthStore((s) => s.user);
  const isGm = user?.role === ROLE_GM;
  const [pedal, setPedal] = useState<Pedal>(null);
  const [laneDelta, setLaneDelta] = useState<LaneDelta>(0);
  // Wybór należy do jednego ruchu: zmiana auta, wykonany ruch albo nowa runda
  // (prędkość pościgu) go zdejmują.
  useEffect(() => {
    setPedal(null);
    setLaneDelta(0);
  }, [vehicle.id, vehicle.moved, chase?.pursuitSpeed]);
  if (!chase || chase.pursuitSpeed === null) return null;

  const mayDrive = isGm || (user !== null && token.ownerId === user.id);
  const refusal = cockpitRefusal(vehicle, turnRefusal, mayDrive);
  const after = cpredPedalSpeed(vehicle.speed, vehicle.maxSpeed, pedal);
  const advance = cpredDriveAdvance({
    speed: after,
    pursuitSpeed: chase.pursuitSpeed,
    raceBonus: vehicle.raceBonus,
  });
  const metres = advance * metresPerSquare;
  const lane = vehicle.lane + laneDelta;
  const horizontal = chaseIsHorizontal(chase.direction);
  const forward: Arrow = chase.direction;
  // Pas „wyżej” to krok w stronę `road.from`: przy jeździe poziomej w górę
  // ekranu, przy pionowej — w lewo.
  const towardFrom: Arrow = horizontal ? 'up' : 'left';

  const gasProblem = cpredPedalProblem(vehicle.speed, vehicle.maxSpeed, 'gas');
  const brakeProblem = cpredPedalProblem(vehicle.speed, vehicle.maxSpeed, 'brake');
  const laneRefusal = (delta: -1 | 1) =>
    chaseLaneTarget(vehicle.lane, delta, chase.lanes) === null ? chaseErrorText('LANE_EDGE') : null;
  const pick = () => takeFigure(token.id, false);

  const gas = (
    <DriveTile
      label="Gaz"
      effect="+50 mil/h"
      arrow={forward}
      pressed={pedal === 'gas'}
      refusal={refusal ?? (gasProblem ? chaseErrorText(gasProblem) : null)}
      tip="+50 mil/h, najwyżej do maksimum auta. Razem ze zmianą pasa to jedna Akcja Ruchu."
      onToggle={() => {
        pick();
        setPedal(pedal === 'gas' ? null : 'gas');
      }}
    />
  );
  const brake = (
    <DriveTile
      label="Hamulec"
      effect="−100 mil/h"
      arrow={OPPOSITE[forward]}
      pressed={pedal === 'brake'}
      refusal={refusal ?? (brakeProblem ? chaseErrorText(brakeProblem) : null)}
      tip="−100 mil/h, najniżej do zatrzymania. Razem ze zmianą pasa to jedna Akcja Ruchu."
      onToggle={() => {
        pick();
        setPedal(pedal === 'brake' ? null : 'brake');
      }}
    />
  );
  const laneTile = (delta: -1 | 1, className: string): ReactNode => (
    <DriveTile
      label={
        horizontal
          ? delta === -1
            ? 'Pas wyżej'
            : 'Pas niżej'
          : delta === -1
            ? 'Pas w lewo'
            : 'Pas w prawo'
      }
      effect="zmiana pasa"
      arrow={delta === -1 ? towardFrom : OPPOSITE[towardFrom]}
      pressed={laneDelta === delta}
      refusal={refusal ?? laneRefusal(delta)}
      tip="Zjazd o jeden pas — w tej samej Akcji Ruchu co pedał."
      className={className}
      onToggle={() => {
        pick();
        setLaneDelta(laneDelta === delta ? 0 : delta);
      }}
    />
  );
  // Krzyżak jak na ekranie: na osi jazdy gaz i hamulec, w poprzek pasy.
  // Kafel „w kierunku” stoi na swojej stronie siatki 3 × 3 (`--at-*`).
  const cells: { node: ReactNode; at: Arrow }[] = [
    { node: gas, at: forward },
    { node: brake, at: OPPOSITE[forward] },
    { node: laneTile(-1, ''), at: towardFrom },
    { node: laneTile(1, ''), at: OPPOSITE[towardFrom] },
  ];

  return (
    <section className="hud-group hud-vehicle" aria-label="Pojazd" data-testid="hud-vehicle">
      <h3 className="hud-group-title">Pojazd</h3>
      <VehicleTile vehicle={vehicle} direction={chase.direction} after={after} />
      {!vehicle.moved && (
        <p className="hud-armed hud-vehicle-after">
          <span className="hud-armed-tag">Po ruchu</span>
          <span className="hud-armed-aim">
            {`${metres >= 0 ? '+' : '−'}${formatMetres(Math.abs(metres))} · pas ${lane + 1} z ${chase.lanes}`}
            {vehicle.raceBonus > 0 &&
              ` · zryw +${formatMetres(vehicle.raceBonus * metresPerSquare)}`}
          </span>
        </p>
      )}
      <div
        className={`hud-drive-pad hud-drive-pad--${horizontal ? 'across' : 'along'}`}
        role="group"
        aria-label="Prowadzenie"
      >
        {cells.map(({ node, at }) => (
          <span key={at} className={`hud-drive-cell hud-drive-cell--${at}`}>
            {node}
          </span>
        ))}
      </div>
      <DriveGo
        costs={pedal !== null || laneDelta !== 0}
        refusal={refusal}
        onGo={() => {
          pick();
          sendDrive(vehicle.id, pedal, laneDelta);
        }}
      />
    </section>
  );
}
