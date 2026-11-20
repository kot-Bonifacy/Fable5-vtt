import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import {
  chaseDriveStep,
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
  type ChaseLaneDelta,
  type ScenePoint,
  type SceneVehicleView,
  type TokenView,
  type VehicleDriveContact,
  type VehicleDriveContactInfo,
} from '@vtt/shared';
import { takeFigure } from '../hud.js';
import { hpRingTone } from '../map/token-ring.js';
import { clearNotices, notifyRefusal } from '../notices.js';
import {
  driveVehicle,
  dropVehicleSpikes,
  fireVehicleNitro,
  performVehicleManeuver,
  setVehicleEngine,
} from '../socket.js';
import { chaseRamText } from '../chase-ram.js';
import { useAuthStore } from '../stores/authStore.js';
import { useChaseStore, type ChaseGhost } from '../stores/chaseStore.js';
import { useSceneStore } from '../stores/sceneStore.js';
import { useTargetStore } from '../stores/targetStore.js';
import { useTokenStore } from '../stores/tokenStore.js';
import {
  BLOCKER_CHOICES,
  answerBlocker,
  blockerChoiceText,
  blockerFor,
  blockerLabel,
} from './ChaseObstacleMenu.js';
import { chaseErrorText } from './ChaseVehicleMenu.js';
import { ghostRuler, type TargetGap } from '../chase-map-notes.js';
import { HudIcon } from './HudIcon.js';
import { useHudTip } from './HudTip.js';

/**
 * Grupa „Pojazd” w lewej belce (etap 72b2, pełny kształt w 72d1 — wariant B
 * z makiety MG z 15.11).
 *
 * Kokpit kierowcy w walce na scenie pościgu, od góry: duży kafel auta (budowa
 * kafla broni), decyzje czekające na kierowcę (to, co stoi przed zderzakiem,
 * wezwanie MG do Manewru, zderzenie na drodze ruchu), „Po ruchu”, krzyżak
 * ułożony tak, jak widać auto, „Jedź” i rządek ikon rzadkich akcji auta —
 * Nitro, Manewr (z szufladą), kolczatka, silnik. Żadnego własnego języka
 * wizualnego (decyzja MG nr 9): te same klasy `hud-slot`, znaczki kosztu,
 * szuflada trybów ognia i dymki co reszta belki z etapu 69.
 *
 * Wybór pedału i pasu to stan klienta aż do „Jedź”; serwer (`vehicle:drive`)
 * liczy ruch i pyta o zderzenie, zanim cokolwiek wyda — pytanie wraca
 * wierszem w tej grupie (od 72d już nie paskiem).
 */

type Pedal = 'gas' | 'brake' | null;

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
  if (contact.side) return `Na sąsiednim pasie: ${contact.name}. Zepchnąć bokiem (bez Pługa)?`;
  if (contact.canSlow) {
    return `Na drodze: ${contact.name} (${cpredSpeedMph(contact.speed)} mil/h). Taranować czy zwolnić za nim?`;
  }
  return `Na drodze: ${contact.name}. Hamulec nie wystarczy — taranować, czy zmienić plan (pas, Manewr)?`;
}

/** Odpowiedź serwera na czynność auta: odmowa idzie do kanału `chase`. */
function noteChase(ack: { ok: boolean; error?: string }): void {
  if (!ack.ok) notifyRefusal('chase', chaseErrorText(ack.error));
  else clearNotices('chase');
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
    body: 'Fotele, kadłub, szyby i ulepszenia — w panelu auta.',
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

/** Jedna odpowiedź w wierszu decyzji — przycisk szuflady z ceną po prawej. */
interface DecisionChoice {
  label: string;
  cost: string | null;
  tip: string;
  run: () => void;
}

function DecisionButton({ choice }: { choice: DecisionChoice }) {
  const tip = useHudTip({ title: choice.label, cost: choice.cost, body: choice.tip });
  return (
    <button type="button" className="hud-mode" onClick={choice.run} {...tip}>
      <span className="hud-mode-name">{choice.label}</span>
      {choice.cost && <span className="hud-mode-cost">{choice.cost}</span>}
    </button>
  );
}

/**
 * Decyzja czekająca na kierowcę (punkt 5.7 projektu): czerwony dopisek jak
 * „W ręku”, zdanie i odpowiedzi w szufladzie pod nim — te same części, co
 * tryby ognia broni, więc wiersz nie wnosi do belki nowego wyglądu.
 */
function DecisionRow({
  tag,
  text,
  choices,
  kind,
}: {
  tag: string;
  text: string;
  choices: readonly DecisionChoice[];
  kind: string;
}) {
  return (
    <div className="hud-vehicle-decision" role="group" aria-label={tag} data-decision={kind}>
      <p className="hud-armed hud-vehicle-decision-text">
        <span className="hud-armed-tag">{tag}</span>
        <span className="hud-armed-aim">{text}</span>
      </p>
      <ul className="hud-modes hud-vehicle-decision-choices">
        {choices.map((choice) => (
          <li key={choice.label}>
            <DecisionButton choice={choice} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Rzadka akcja auta jako sama ikona (jak rządek akcji pod średnimi kaflami):
 * nazwa, koszt i opis mówi dymek, liczba zbiorników albo kolczatek stoi
 * w rogu. Odmowa nie wyłącza przycisku — klik mówi powód w kanale.
 */
function ToolSlot({
  icon,
  label,
  cost,
  body,
  refusal,
  count,
  pressed,
  expanded,
  onActivate,
}: {
  icon: string;
  label: string;
  cost: 'action' | 'free';
  body: string;
  refusal: string | null;
  count?: number;
  pressed?: boolean;
  expanded?: boolean;
  onActivate: () => void;
}) {
  const costText = cost === 'action' ? 'Akcja' : 'za darmo';
  const tip = useHudTip({ title: label, cost: costText, body, refusal });
  return (
    <button
      type="button"
      className={`hud-slot hud-slot--icon hud-slot--action${pressed ? ' hud-slot--armed' : ''}${
        refusal ? ' hud-slot--refused' : ''
      }`}
      data-vehicle-tool={icon}
      aria-pressed={pressed}
      aria-expanded={expanded}
      onClick={() => {
        if (refusal) notifyRefusal('chase', refusal);
        else onActivate();
      }}
      {...tip}
    >
      <HudIcon name={icon} className="hud-slot-icon" />
      <span className="visually-hidden">
        <span className="hud-slot-label">{label}</span> — {costText}
      </span>
      {count !== undefined && (
        <span className="hud-slot-count" aria-hidden>
          {count}
        </span>
      )}
      {cost === 'action' && <span className="hud-cost hud-cost--action" aria-hidden />}
    </button>
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

/** Położenie wzdłuż kierunku jazdy w pikselach — większe to dalej z przodu. */
function alongPx(point: { x: number; y: number }, direction: ChaseDirection): number {
  switch (direction) {
    case 'right':
      return point.x;
    case 'left':
      return -point.x;
    case 'down':
      return point.y;
    case 'up':
      return -point.y;
  }
}

/**
 * Cel dystansu w „Po ruchu” (punkt 5.3 projektu): trwały cel figury (`T`) —
 * auto, w którym siedzi, albo sama figura — a bez niego najbliższe auto drugiej
 * strony w pościgu. Zwraca odstęp zderzaków po ruchu w kratkach (ujemny — cel
 * z tyłu) albo `null`, gdy nie ma do czego mierzyć.
 */
function useTargetGap(
  token: TokenView,
  vehicle: SceneVehicleView,
  advanceSq: number,
  direction: ChaseDirection,
  gridPx: number,
): TargetGap | null {
  const vehicles = useChaseStore((s) => s.vehicles);
  const targetId = useTargetStore((s) => s.targets[token.id] ?? null);
  const target = useTokenStore((s) => (targetId ? s.tokens[targetId] : undefined));
  const mine = alongPx(vehicle, direction) + advanceSq * gridPx;
  const measure = (name: string, at: ScenePoint, halfLengthPx: number): TargetGap => {
    const centre = (alongPx(at, direction) - mine) / gridPx;
    const reach = vehicle.lengthSq / 2 + halfLengthPx / gridPx;
    const gap = Math.max(0, Math.abs(centre) - reach);
    return { name, gapSq: centre >= 0 ? gap : -gap, at, halfLengthPx };
  };
  if (target && target.sceneId === vehicle.sceneId) {
    const carried = target.vehicleSeat
      ? vehicles.find((entry) => entry.id === target.vehicleSeat!.sceneVehicleId)
      : undefined;
    if (carried && carried.id === vehicle.id) return null;
    if (carried) return measure(carried.name, carried, (carried.lengthSq * gridPx) / 2);
    // Pieszy: dotąd dystans liczył się od lewego górnego rogu żetonu.
    const half = (target.size * gridPx) / 2;
    return measure(target.name, { x: target.x + half, y: target.y + half }, 0);
  }
  let nearest: SceneVehicleView | null = null;
  for (const other of vehicles) {
    if (other.id === vehicle.id || other.status !== 'racing' || other.party === vehicle.party) {
      continue;
    }
    if (
      !nearest ||
      Math.abs(alongPx(other, direction) - mine) < Math.abs(alongPx(nearest, direction) - mine)
    ) {
      nearest = other;
    }
  }
  return nearest ? measure(nearest.name, nearest, (nearest.lengthSq * gridPx) / 2) : null;
}

/** Zmiana pasa po kliknięciu kafla: o jeden, a po Gwałtownym skręcie drugi klik — o dwa. */
function nextLaneDelta(
  current: ChaseLaneDelta,
  step: -1 | 1,
  swerveReady: boolean,
  lane: number,
  lanes: number,
): ChaseLaneDelta {
  if (current === step && swerveReady && chaseLaneTarget(lane, step * 2, lanes) !== null) {
    return (step * 2) as ChaseLaneDelta;
  }
  if (current === step || current === step * 2) return 0;
  return step;
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
  const scene = useSceneStore((s) => s.scene);
  const chase = scene?.chase;
  const gridPx = scene?.grid.sizePx ?? 1;
  const metresPerSquare = useSceneStore((s) => s.scene?.metersPerSquare ?? 1);
  const obstacles = useChaseStore((s) => s.obstacles);
  const vehicles = useChaseStore((s) => s.vehicles);
  const user = useAuthStore((s) => s.user);
  const isGm = user?.role === ROLE_GM;
  const [pedal, setPedal] = useState<Pedal>(null);
  const [laneDelta, setLaneDelta] = useState<ChaseLaneDelta>(0);
  const [contact, setContact] = useState<VehicleDriveContactInfo | null>(null);
  const [maneuversOpen, setManeuversOpen] = useState(false);
  // Wybór należy do jednego ruchu: zmiana auta, wykonany ruch albo nowa runda
  // (prędkość pościgu) go zdejmują — razem z pytaniem o zderzenie.
  useEffect(() => {
    setPedal(null);
    setLaneDelta(0);
    setContact(null);
    setManeuversOpen(false);
  }, [vehicle.id, vehicle.moved, chase?.pursuitSpeed]);
  // Pytanie o zderzenie dotyczy wybranego ruchu — inny wybór je zdejmuje.
  useEffect(() => setContact(null), [pedal, laneDelta]);

  const after = cpredPedalSpeed(vehicle.speed, vehicle.maxSpeed, pedal);
  const advance = cpredDriveAdvance({
    speed: after,
    pursuitSpeed: chase?.pursuitSpeed ?? after,
    raceBonus: vehicle.raceBonus,
    nitroMove: vehicle.nitroArmed ? vehicle.maxSpeed : 0,
  });
  const direction = chase?.direction ?? 'right';
  const gap = useTargetGap(token, vehicle, vehicle.moved ? 0 : advance, direction, gridPx);

  const mayDrive = isGm || (user !== null && token.ownerId === user.id);
  // To, co stoi przed zderzakiem, czeka na odpowiedź — do niej jazda odmawia.
  const blocker = mayDrive ? blockerFor(vehicle.id, obstacles, vehicles) : null;
  const refusal =
    cockpitRefusal(vehicle, turnRefusal, mayDrive) ??
    (blocker ? chaseErrorText('OBSTACLE_PENDING') : null);
  const lane = vehicle.lane + laneDelta;

  // Duch auta (72d2, decyzja MG 20.11): u tego, kto trzyma kokpit, zawsze,
  // gdy „Jedź” ruszyłoby auto — także bez pedału, bo różnica prędkości i zryw
  // i tak je przesuwają. Te same liczby co „Po ruchu”.
  let ghost: ChaseGhost | null = null;
  if (scene && chase && chase.pursuitSpeed !== null && refusal === null) {
    const step = chaseDriveStep({
      centre: vehicle,
      lane,
      advanceSq: advance,
      lanes: chase.lanes,
      settings: chase,
      scene: {
        width: scene.width,
        height: scene.height,
        gridSizePx: gridPx,
        gridOffsetX: scene.grid.offsetX,
        gridOffsetY: scene.grid.offsetY,
      },
    });
    if (Math.hypot(step.to.x - vehicle.x, step.to.y - vehicle.y) > 0.5) {
      ghost = {
        sceneVehicleId: vehicle.id,
        centre: step.to,
        lane,
        ruler: gap
          ? ghostRuler(
              step.to,
              (vehicle.lengthSq * gridPx) / 2,
              gap,
              direction,
              formatMetres(Math.abs(gap.gapSq) * metresPerSquare),
            )
          : null,
      };
    }
  }
  // Klucz niesie całą treść ducha: nowy obiekt z tymi samymi liczbami nic nie zmienia.
  const ghostKey = ghost ? JSON.stringify(ghost) : '';
  useEffect(() => {
    useChaseStore.getState().setGhost(ghost);
  }, [ghostKey]);
  useEffect(() => () => useChaseStore.getState().setGhost(null), []);

  if (!chase || chase.pursuitSpeed === null) return null;
  const metres = advance * metresPerSquare;
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

  const drive = (onContact?: VehicleDriveContact) => {
    pick();
    void driveVehicle({
      sceneVehicleId: vehicle.id,
      pedal,
      laneDelta,
      ...(onContact ? { onContact } : {}),
    }).then((ack) => {
      if (!ack.ok) {
        notifyRefusal('chase', chaseErrorText(ack.error));
        return;
      }
      clearNotices('chase');
      setContact(ack.data && !ack.data.moved ? ack.data.contact : null);
    });
  };
  const act = (call: () => Promise<{ ok: boolean; error?: string }>) => {
    pick();
    void call().then(noteChase);
  };

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
  const laneTile = (step: -1 | 1): ReactNode => {
    const chosen = laneDelta === step || laneDelta === step * 2;
    const two = laneDelta === step * 2;
    return (
      <DriveTile
        label={
          horizontal
            ? step === -1
              ? 'Pas wyżej'
              : 'Pas niżej'
            : step === -1
              ? 'Pas w lewo'
              : 'Pas w prawo'
        }
        effect={two ? 'o dwa pasy' : 'zmiana pasa'}
        arrow={step === -1 ? towardFrom : OPPOSITE[towardFrom]}
        pressed={chosen}
        refusal={refusal ?? laneRefusal(step)}
        tip={
          vehicle.swerveReady
            ? 'Po udanym Gwałtownym skręcie: drugi klik — o dwa pasy naraz. W tej samej Akcji Ruchu co pedał.'
            : 'Zjazd o jeden pas — w tej samej Akcji Ruchu co pedał. O dwa pasy naraz po udanym Gwałtownym skręcie.'
        }
        onToggle={() => {
          pick();
          setLaneDelta(
            nextLaneDelta(laneDelta, step, vehicle.swerveReady, vehicle.lane, chase.lanes),
          );
        }}
      />
    );
  };
  // Krzyżak jak na ekranie: na osi jazdy gaz i hamulec, w poprzek pasy.
  // Kafel „w kierunku” stoi na swojej stronie siatki 3 × 3 (`--at-*`).
  const cells: { node: ReactNode; at: Arrow }[] = [
    { node: gas, at: forward },
    { node: brake, at: OPPOSITE[forward] },
    { node: laneTile(-1), at: towardFrom },
    { node: laneTile(1), at: OPPOSITE[towardFrom] },
  ];

  // Decyzje czekające na kierowcę — u tego, kto może prowadzić.
  const call = mayDrive && !isGm ? vehicle.maneuverCall : null;
  const decisions: ReactNode[] = [];
  if (blocker) {
    decisions.push(
      <DecisionRow
        key="blocker"
        kind="blocker"
        tag="Na drodze"
        text={`${blockerLabel(blocker)} — przed zderzakiem.`}
        choices={BLOCKER_CHOICES.map(({ choice, label, cost }) => ({
          label,
          cost,
          tip: blockerChoiceText(blocker, vehicle, choice),
          run: () => {
            pick();
            answerBlocker(blocker, choice);
          },
        }))}
      />,
    );
  }
  if (call) {
    decisions.push(
      <DecisionRow
        key="call"
        kind="maneuver-call"
        tag="MG wzywa"
        text={`${call.label} — na wezwanie bez Akcji. Porażka to utrata kontroli.`}
        choices={[
          {
            label: 'Wykonaj Manewr',
            cost: null,
            tip: 'Test REF + Umiejętność prowadzenia przeciw PT Manewru, rzucany przez serwer.',
            run: () => act(() => performVehicleManeuver(vehicle.id, call.id)),
          },
        ]}
      />,
    );
  }
  if (contact) {
    const ram: DecisionChoice = {
      label: contact.side ? 'Zepchnij' : 'Taranuj',
      cost: 'raz na turę',
      tip: contact.side
        ? 'Uderzenie bokiem — Pług bojowy nie działa. Po 6k6 dla obu aut i Rana Krytyczna dla jadących.'
        : chaseRamText(
            contact.kind === 'token' ? 'pedestrian' : contact.kind,
            vehicle.ramPlow,
            true,
          ),
      run: () => drive('ram'),
    };
    decisions.push(
      <DecisionRow
        key="contact"
        kind="contact"
        tag="Zderzenie"
        text={contactQuestion(contact)}
        choices={[
          ram,
          ...(contact.canSlow
            ? [
                {
                  label: 'Zwolnij za nim',
                  cost: null,
                  tip: 'Auto staje przy zderzaku i przyjmuje prędkość tego, co jedzie przed nim — bez Testu.',
                  run: () => drive('slow'),
                },
              ]
            : []),
          {
            label: 'Zmienię plan',
            cost: null,
            tip: 'Nic się nie dzieje — wybierz inny pedał, pas albo Manewr.',
            run: () => setContact(null),
          },
        ]}
      />,
    );
  }

  // Rzadkie akcje auta (punkt 5.6): wspólna odmowa i powody każdej z osobna.
  const toolRefusal = !mayDrive ? 'Tym autem prowadzi kierowca, nie ty.' : turnRefusal;
  const drivenRefusal =
    toolRefusal ??
    (!vehicle.started
      ? chaseErrorText('VEHICLE_NOT_STARTED')
      : vehicle.control === 'lost'
        ? chaseErrorText('VEHICLE_OUT_OF_CONTROL')
        : null);
  const nitroRefusal =
    drivenRefusal ??
    (vehicle.moved
      ? chaseErrorText('NITRO_AFTER_DRIVE')
      : vehicle.nitroArmed
        ? 'Nitro już odpalone w tej turze — dolicza się do „Jedź”.'
        : null);

  return (
    <section className="hud-group hud-vehicle" aria-label="Pojazd" data-testid="hud-vehicle">
      <h3 className="hud-group-title">Pojazd</h3>
      <VehicleTile vehicle={vehicle} direction={chase.direction} after={after} />
      {decisions}
      {!vehicle.moved && (
        <p className="hud-armed hud-vehicle-after">
          <span className="hud-armed-tag">Po ruchu</span>
          <span className="hud-armed-aim">
            {`${metres >= 0 ? '+' : '−'}${formatMetres(Math.abs(metres))} · pas ${lane + 1} z ${chase.lanes}`}
            {vehicle.raceBonus > 0 &&
              ` · zryw +${formatMetres(vehicle.raceBonus * metresPerSquare)}`}
            {vehicle.nitroArmed && ' · z Nitro'}
          </span>
          {gap && (
            <span className="hud-armed-hint hud-vehicle-gap">
              {`${gap.name}: ${formatMetres(Math.abs(gap.gapSq) * metresPerSquare)} ${
                gap.gapSq >= 0 ? 'przed tobą' : 'za tobą'
              }`}
            </span>
          )}
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
      <DriveGo costs={pedal !== null || laneDelta !== 0} refusal={refusal} onGo={() => drive()} />
      <div className="hud-slots hud-slots--small hud-vehicle-tools" role="group" aria-label="Auto">
        {(vehicle.nitroLeft > 0 || vehicle.nitroArmed) && (
          <ToolSlot
            icon="nitro"
            label="Nitro"
            cost="action"
            count={vehicle.nitroLeft}
            pressed={vehicle.nitroArmed}
            body="Przed „Jedź”: auto przejedzie w tej turze dodatkowo Ruch / 4 kratek. Pod taranem Pługiem +2k6."
            refusal={nitroRefusal}
            onActivate={() => act(() => fireVehicleNitro(vehicle.id))}
          />
        )}
        {vehicle.maneuvers.length > 0 && (
          <ToolSlot
            icon="steering-wheel"
            label="Manewr"
            cost="action"
            expanded={maneuversOpen}
            pressed={maneuversOpen}
            body="Test REF + Umiejętność prowadzenia przeciw PT Manewru. Porażka to utrata kontroli: auto jedzie samo do końca rundy."
            refusal={drivenRefusal}
            onActivate={() => {
              pick();
              setManeuversOpen(!maneuversOpen);
            }}
          />
        )}
        {vehicle.spikesLeft > 0 && (
          <ToolSlot
            icon="spikes"
            label="Zrzuć kolczatkę"
            cost="action"
            count={vehicle.spikesLeft}
            body="Kolczatka ląduje za autem: kto po niej przejedzie, rzuca Prowadzenie PT 17 albo bierze 4k6 w słaby punkt."
            refusal={toolRefusal}
            onActivate={() => act(() => dropVehicleSpikes(vehicle.id))}
          />
        )}
        <ToolSlot
          icon="engine"
          label={vehicle.started ? 'Zgaś silnik' : 'Uruchom silnik'}
          cost="action"
          body={
            vehicle.started
              ? 'Auto bez silnika zwalnia o połowę co rundę, a droga zabiera je w tył.'
              : 'Uruchomienie przesuwa kierowcę na początek kolejki.'
          }
          refusal={toolRefusal}
          onActivate={() => act(() => setVehicleEngine(vehicle.id, !vehicle.started))}
        />
      </div>
      {maneuversOpen && (
        <ul className="hud-modes hud-vehicle-maneuvers" aria-label="Manewry">
          {vehicle.maneuvers.map((maneuver) => (
            <li key={maneuver.id}>
              <DecisionButton
                choice={{
                  label: maneuver.label,
                  cost: 'Akcja',
                  tip:
                    maneuver.id === 'swerve'
                      ? 'Udany: auto omija przeszkodę tuż przed zderzakiem, a „Jedź” w tej rundzie może zmienić pas o dwa naraz.'
                      : maneuver.id === 'sudden-stop'
                        ? 'Udany: prędkość spada do zera od razu.'
                        : 'Rzut serwera przeciw PT Manewru; porażka to utrata kontroli.',
                  run: () => {
                    setManeuversOpen(false);
                    act(() => performVehicleManeuver(vehicle.id, maneuver.id));
                  },
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
