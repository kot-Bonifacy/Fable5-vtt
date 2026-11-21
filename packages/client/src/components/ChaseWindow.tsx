import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import {
  CHASE_CONTROL_LABELS,
  CHASE_OBSTACLE_HP_MAX,
  CHASE_OBSTACLE_KINDS,
  CHASE_OBSTACLE_NAME_MAX,
  CHASE_OBSTACLE_PRESETS,
  ROLE_GM,
  chaseAlongFromRear,
  chaseAnchorVehicle,
  chaseObstacleEta,
  chaseObstacleMaxGapSq,
  chaseObstacleUnbreakable,
  cpredMphToSpeed,
  cpredRoadSquaresPerRound,
  cpredSpeedMph,
  formatMetres,
  type ChaseEntrySide,
  type ChaseObstacleKind,
  type ChaseObstacleView,
  type ChaseRole,
  type SceneVehicleView,
  type SceneView,
  type TokenAssetView,
  type TokenView,
} from '@vtt/shared';
import { apiGet } from '../api.js';
import { notifyRefusal } from '../notices.js';
import {
  escapeChaseVehicle,
  removeChaseObstacle,
  restoreChaseVehicle,
  setChaseAnchor,
  setChaseAutopilot,
  setChaseSpeed,
  spawnChaseObstacle,
  updateScene,
} from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { useChaseStore } from '../stores/chaseStore.js';
import { useCombatStore } from '../stores/combatStore.js';
import { useSceneStore } from '../stores/sceneStore.js';
import { useTokenStore } from '../stores/tokenStore.js';
import { useWindowPlacement } from '../window-placement.js';
import { chaseRoundsText } from '../chase-map-notes.js';
import { VehicleIntent, chaseErrorText } from './ChaseVehicleMenu.js';
import { IconChase } from './MapIcons.js';
import { Segmented } from './Segmented.js';
import { WindowResizeGrip } from './WindowResizeGrip.js';

/**
 * Okno „Pościg” MG (etap 72f2, decyzja MG 11 z 15.11): jeden widok sytuacji
 * zamiast menu aut, palety przeszkód i przełącznika na pasku. Nagłówek —
 * runda, prędkość pościgu, auto kadru, goni / ucieka, autopilot; auta od
 * czoła do ogona z prędkością do poprawienia, pasem, dystansem do auta kadru,
 * kierowcą, PUK i zamiarem; posiłki (każde auto poza kadrem — rezerwa wzorca
 * i to, co odpadło) z pasem, stroną kadru i prędkością; przeszkody na pas
 * i odległość przed wybranym autem (tylko w kadrze, decyzja MG 21.11)
 * z prognozą i listą do zdjęcia.
 */

const ROLE_OPTIONS: { id: ChaseRole; label: string; hint: string }[] = [
  {
    id: 'pursue',
    label: 'goni',
    hint: 'Auto kadru stoi w 30% kadru od tyłu — cel widać z przodu. Działa od następnej rundy.',
  },
  {
    id: 'flee',
    label: 'ucieka',
    hint: 'Auto kadru stoi w 30% kadru od przodu — pogoń widać z tyłu. Działa od następnej rundy.',
  },
];

type Act = (call: () => Promise<{ ok: boolean; error?: string }>) => void;

const act: Act = (call) => {
  void call().then((ack) => {
    if (!ack.ok) notifyRefusal('chase', chaseErrorText(ack.error));
  });
};

/** Ikona okna na pasku narzędzi MG — tylko na scenie pościgu. */
export function ChaseWindowButton() {
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const chase = useSceneStore((s) => s.effectiveScene?.kind === 'chase');
  const open = useChaseStore((s) => s.windowOpen);
  const setOpen = useChaseStore((s) => s.setWindowOpen);
  if (!isGm || !chase) return null;
  return (
    <button
      type="button"
      className={`map-tool${open ? ' map-tool--active' : ''}`}
      title="Pościg — auta, prędkości, kadr, posiłki i przeszkody w jednym oknie"
      aria-label="Pościg"
      aria-pressed={open}
      onClick={() => setOpen(!open)}
    >
      <IconChase />
    </button>
  );
}

export function ChaseWindow() {
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const scene = useSceneStore((s) => s.scene);
  const open = useChaseStore((s) => s.windowOpen);
  if (!isGm || !open || !scene || scene.kind !== 'chase') return null;
  return <ChaseWindowBody scene={scene} />;
}

/** Położenie środka auta wzdłuż drogi w kratkach od tylnej krawędzi kadru. */
function alongSq(point: { x: number; y: number }, scene: SceneView): number {
  return chaseAlongFromRear(point, scene.chase.direction, scene) / scene.grid.sizePx;
}

function ChaseWindowBody({ scene }: { scene: SceneView }) {
  const setOpen = useChaseStore((s) => s.setWindowOpen);
  const vehicles = useChaseStore((s) => s.vehicles);
  const obstacles = useChaseStore((s) => s.obstacles);
  const tokens = useTokenStore((s) => s.tokens);
  const round = useCombatStore((s) =>
    s.combat && s.combat.sceneId === scene.id ? s.combat.round : null,
  );
  const placement = useWindowPlacement('chase', () => ({
    x: Math.max(16, window.innerWidth - 560),
    y: 120,
  }));
  const inCombat = scene.chase.pursuitSpeed !== null;
  const anchorId = chaseAnchorVehicle(vehicles, scene.chase.anchorId);
  const anchor = vehicles.find((vehicle) => vehicle.id === anchorId) ?? null;

  const drivers = useMemo(() => {
    const map = new Map<string, TokenView>();
    for (const token of Object.values(tokens)) {
      if (token.vehicleSeat?.seat === 0) map.set(token.vehicleSeat.sceneVehicleId, token);
    }
    return map;
  }, [tokens]);

  // Od czoła do ogona; poza pościgiem (rezerwa, w tyle, uciekło) — na końcu.
  const ordered = useMemo(() => {
    const inFrame = vehicles.filter((v) => v.status === 'racing' || v.status === 'wrecked');
    const offstage = vehicles.filter((v) => v.status === 'behind' || v.status === 'escaped');
    inFrame.sort((a, b) => alongSq(b, scene) - alongSq(a, scene));
    return { inFrame, offstage };
  }, [vehicles, scene]);

  return (
    <section
      ref={placement.ref}
      className="inventory-window chase-window"
      style={placement.style}
      aria-label="Pościg"
    >
      <div className="inventory-window-header" {...placement.dragProps}>
        <span className="inventory-window-title">Pościg</span>
        <button
          type="button"
          className="sheet-close"
          onClick={() => setOpen(false)}
          title="Zamknij okno „Pościg”"
          aria-label="Zamknij okno „Pościg”"
        >
          ✕
        </button>
      </div>
      <div className="inventory-window-body chase-window-body">
        <ChaseWindowHead
          scene={scene}
          round={round}
          vehicles={vehicles}
          anchor={anchor}
          inCombat={inCombat}
        />

        <p className="chase-window-section">Auta</p>
        {ordered.inFrame.length === 0 && ordered.offstage.length === 0 && (
          <p className="inventory-empty">Na drodze nie ma aut — postaw je w zakładce „Pościg”.</p>
        )}
        <ul className="chase-window-cars">
          {ordered.inFrame.map((vehicle) => (
            <CarRow
              key={vehicle.id}
              scene={scene}
              vehicle={vehicle}
              vehicles={vehicles}
              anchor={anchor}
              driver={drivers.get(vehicle.id) ?? null}
              inCombat={inCombat}
            />
          ))}
        </ul>

        {ordered.offstage.length > 0 && (
          <>
            <p
              className="chase-window-section"
              title="Auta poza kadrem: rezerwa wzorca i to, co zostało w tyle albo uciekło. Gracze ich nie widzą, a ich załoga nie wchodzi do walki, póki auto nie wróci."
            >
              Posiłki i auta poza pościgiem
            </p>
            <ul className="chase-window-cars">
              {ordered.offstage.map((vehicle) => (
                <ReserveRow
                  key={vehicle.id}
                  scene={scene}
                  vehicle={vehicle}
                  driver={drivers.get(vehicle.id) ?? null}
                  inCombat={inCombat}
                />
              ))}
            </ul>
          </>
        )}

        <p className="chase-window-section">Przeszkody</p>
        {inCombat ? (
          <>
            <ObstacleForm scene={scene} vehicles={ordered.inFrame} anchor={anchor} />
            <ObstacleList scene={scene} obstacles={obstacles} anchor={anchor} />
          </>
        ) : (
          <p className="chase-window-hint">
            Przeszkody wypuszcza się w walce — poza nią nie ma rund, więc droga ich nie przesuwa.
          </p>
        )}
      </div>
      <WindowResizeGrip resizeProps={placement.resizeProps} />
    </section>
  );
}

function ChaseWindowHead({
  scene,
  round,
  vehicles,
  anchor,
  inCombat,
}: {
  scene: SceneView;
  round: number | null;
  vehicles: readonly SceneVehicleView[];
  anchor: SceneVehicleView | null;
  inCombat: boolean;
}) {
  const candidates = vehicles.filter((v) => v.status === 'racing' || v.status === 'wrecked');
  const chosen = scene.chase.anchorId;
  const ruleName = chaseAnchorVehicle(vehicles, null);
  const ruleCar = vehicles.find((v) => v.id === ruleName);
  return (
    <div className="chase-window-head">
      <p className="chase-window-status">
        {inCombat && round !== null && round > 0
          ? `Runda ${round} · pościg ${cpredSpeedMph(scene.chase.pursuitSpeed ?? 0)} mil/h`
          : `Przed walką · prędkość startowa ${cpredSpeedMph(scene.chase.tempo)} mil/h`}
      </p>
      <label
        className="chase-window-field"
        title="Kadr co rundę przesuwa się tak, żeby to auto wróciło na swoje miejsce; jego prędkość to prędkość pościgu. Zmiana działa od następnej rundy."
      >
        <span>Kadr trzyma się</span>
        <select
          value={chosen ?? ''}
          onChange={(event) =>
            act(() =>
              setChaseAnchor(scene.id, event.target.value === '' ? null : event.target.value),
            )
          }
        >
          <option value="">{`samo${ruleCar ? ` (${ruleCar.name})` : ''}`}</option>
          {candidates.map((vehicle) => (
            <option key={vehicle.id} value={vehicle.id}>
              {vehicle.name}
            </option>
          ))}
          {chosen && !candidates.some((v) => v.id === chosen) && (
            <option value={chosen}>(poza pościgiem)</option>
          )}
        </select>
      </label>
      {chosen && anchor && anchor.id !== chosen && (
        <p className="chase-window-hint">Wybrane auto jest poza kadrem — kadr trzyma się reguły.</p>
      )}
      <div className="chase-window-row">
        <span className="chase-window-label">Drużyna</span>
        <Segmented
          label="Drużyna goni albo ucieka"
          options={ROLE_OPTIONS}
          value={scene.chase.role}
          onChange={(role) => act(() => updateScene(scene.id, { chase: { role } }))}
        />
        <label
          className="chase-window-switch"
          title={
            scene.chase.autopilot
              ? 'Autopilot włączony — auta NPC-ów z zamiarem jadą same w turze kierowcy. Odznacz, żeby wszystkie jechały ręcznie.'
              : 'Autopilot wyłączony — auta NPC-ów jadą ręcznie. Zaznacz, żeby auta z zamiarem znowu jechały same.'
          }
        >
          <input
            type="checkbox"
            checked={scene.chase.autopilot}
            onChange={(event) => act(() => setChaseAutopilot(scene.id, event.target.checked))}
          />
          Autopilot
        </label>
      </div>
    </div>
  );
}

/**
 * Pole prędkości w mil/h, wysyłane dopiero po Enterze albo wyjściu z pola —
 * inaczej „150” poleciałoby jako 1, 15 i 150. W walce to prędkość trwała,
 * przed walką — własna prędkość startowa auta (puste — ze sceny).
 */
function SpeedField({
  vehicle,
  inCombat,
  sceneStartMph,
}: {
  vehicle: SceneVehicleView;
  inCombat: boolean;
  sceneStartMph: number;
}) {
  const current = inCombat
    ? String(cpredSpeedMph(vehicle.speed))
    : vehicle.startSpeed === null
      ? ''
      : String(cpredSpeedMph(vehicle.startSpeed));
  const [draft, setDraft] = useState(current);
  useEffect(() => setDraft(current), [current]);
  const commit = () => {
    if (draft === current) return;
    const trimmed = draft.trim();
    if (trimmed === '') {
      if (inCombat) {
        setDraft(current);
        return;
      }
      act(() => setChaseSpeed(vehicle.id, null));
      return;
    }
    const mph = Number(trimmed);
    if (!Number.isFinite(mph) || mph < 0) {
      setDraft(current);
      return;
    }
    act(() => setChaseSpeed(vehicle.id, cpredMphToSpeed(mph)));
  };
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') commit();
    if (event.key === 'Escape') setDraft(current);
  };
  return (
    <label
      className="chase-window-speed"
      title={
        inCombat
          ? 'Prędkość auta teraz — bez kosztu, najwyżej do maksimum. Ruch tej rundy liczy się już od niej; prędkość pościgu zmienia się dopiero na początku następnej.'
          : 'Własna prędkość startowa auta — z nią ruszy na starcie walki (najwyżej do maksimum). Puste — prędkość startowa sceny.'
      }
    >
      <input
        type="number"
        min={0}
        max={cpredSpeedMph(vehicle.maxSpeed)}
        step={50}
        value={draft}
        placeholder={
          inCombat ? undefined : String(Math.min(sceneStartMph, cpredSpeedMph(vehicle.maxSpeed)))
        }
        disabled={vehicle.status === 'wrecked'}
        aria-label={`Prędkość: ${vehicle.name}`}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={onKey}
      />
      <span className="chase-window-unit">{`/ ${cpredSpeedMph(vehicle.maxSpeed)} mil/h`}</span>
    </label>
  );
}

/** „+12 m”, „−8 m”, „kadr” — środek auta względem środka auta kadru wzdłuż drogi. */
function gapText(vehicle: SceneVehicleView, anchor: SceneVehicleView | null, scene: SceneView) {
  if (!anchor) return '';
  if (vehicle.id === anchor.id) return 'kadr';
  const metres = (alongSq(vehicle, scene) - alongSq(anchor, scene)) * scene.metersPerSquare;
  if (Math.abs(metres) < 0.05) return '±0 m';
  return `${metres > 0 ? '+' : '−'}${formatMetres(Math.abs(metres))}`;
}

function driverText(vehicle: SceneVehicleView, driver: TokenView | null): string {
  if (!driver) return vehicle.started ? 'bez kierowcy' : 'bez kierowcy, silnik zgaszony';
  const control = vehicle.started ? CHASE_CONTROL_LABELS[vehicle.control] : 'silnik zgaszony';
  return `${driver.name} · ${control}`;
}

function CarRow({
  scene,
  vehicle,
  vehicles,
  anchor,
  driver,
  inCombat,
}: {
  scene: SceneView;
  vehicle: SceneVehicleView;
  vehicles: readonly SceneVehicleView[];
  anchor: SceneVehicleView | null;
  driver: TokenView | null;
  inCombat: boolean;
}) {
  const wreck = vehicle.status === 'wrecked';
  return (
    <li className={`chase-window-car${vehicle.id === anchor?.id ? ' is-anchor' : ''}`}>
      <div className="chase-window-car-line">
        <span className="chase-window-car-name">{vehicle.name}</span>
        <span
          className="chase-window-gap"
          title="Odstęp środka auta od środka auta kadru wzdłuż drogi: plus — przed nim, minus — za nim."
        >
          {gapText(vehicle, anchor, scene)}
        </span>
        <span className="chase-window-tag">{`pas ${vehicle.lane + 1} z ${scene.chase.lanes}`}</span>
        <span className="chase-window-tag" title="Punkty kadłuba">
          {wreck ? 'wrak' : `PUK ${vehicle.hp}/${vehicle.hpMax}`}
        </span>
      </div>
      <div className="chase-window-car-line">
        <SpeedField
          vehicle={vehicle}
          inCombat={inCombat}
          sceneStartMph={cpredSpeedMph(scene.chase.tempo)}
        />
        <span className="chase-window-driver">{driverText(vehicle, driver)}</span>
      </div>
      {!wreck && (
        <div className="chase-window-car-line">
          {!driver?.ownerId && (
            <VehicleIntent
              vehicle={vehicle}
              vehicles={vehicles}
              className="chase-window-intent"
              labelClassName="chase-window-label"
            />
          )}
          <button
            type="button"
            className="chase-window-btn"
            title="Auto odjeżdża z pościgu z całą załogą: znika graczom, a jego figury wychodzą z kolejki. Wraca z listy posiłków niżej."
            onClick={() => act(() => escapeChaseVehicle(vehicle.id))}
          >
            Ucieka
          </button>
        </div>
      )}
    </li>
  );
}

/**
 * Auto poza kadrem (STR-12: posiłki to dowolne auto sceny poza pościgiem,
 * nie tylko rezerwa wzorca) — wraca na wybranym pasie przy wybranej krawędzi;
 * w walce z prędkością z pola, a pusta — z prędkością pościgu.
 */
function ReserveRow({
  scene,
  vehicle,
  driver,
  inCombat,
}: {
  scene: SceneView;
  vehicle: SceneVehicleView;
  driver: TokenView | null;
  inCombat: boolean;
}) {
  const [lane, setLane] = useState(Math.min(vehicle.lane, scene.chase.lanes - 1));
  const [side, setSide] = useState<ChaseEntrySide>(vehicle.status === 'escaped' ? 'front' : 'rear');
  const [mph, setMph] = useState('');
  const pursuitMph = cpredSpeedMph(
    Math.min(vehicle.maxSpeed, scene.chase.pursuitSpeed ?? scene.chase.tempo),
  );
  const restore = () => {
    const typed = mph.trim() === '' ? null : Number(mph);
    act(() =>
      restoreChaseVehicle(vehicle.id, {
        lane,
        side,
        ...(inCombat && typed !== null && Number.isFinite(typed) && typed >= 0
          ? { speed: cpredMphToSpeed(typed) }
          : {}),
      }),
    );
  };
  return (
    <li className="chase-window-car chase-window-car--off">
      <div className="chase-window-car-line">
        <span className="chase-window-car-name">{vehicle.name}</span>
        <span className="chase-window-tag">
          {vehicle.status === 'escaped' ? 'uciekło' : 'w tyle / rezerwa'}
        </span>
        <span className="chase-window-driver">{driverText(vehicle, driver)}</span>
      </div>
      <div className="chase-window-car-line">
        <select
          value={lane}
          aria-label={`Pas wjazdu: ${vehicle.name}`}
          onChange={(event) => setLane(Number(event.target.value))}
        >
          {Array.from({ length: scene.chase.lanes }, (_, index) => (
            <option key={index} value={index}>{`pas ${index + 1}`}</option>
          ))}
        </select>
        <select
          value={side}
          aria-label={`Strona kadru: ${vehicle.name}`}
          title="Przy której krawędzi kadru auto wjeżdża — najbliższe wolne miejsce w głąb"
          onChange={(event) => setSide(event.target.value as ChaseEntrySide)}
        >
          <option value="rear">od tyłu</option>
          <option value="front">od przodu</option>
        </select>
        {inCombat && (
          <label
            className="chase-window-speed"
            title="Prędkość, z którą auto wjeżdża (najwyżej jego maksimum). Puste — prędkość pościgu: auto trzyma się kadru. Więcej od tyłu — dogania."
          >
            <input
              type="number"
              min={0}
              max={cpredSpeedMph(vehicle.maxSpeed)}
              step={50}
              value={mph}
              placeholder={String(pursuitMph)}
              aria-label={`Prędkość wjazdu: ${vehicle.name}`}
              onChange={(event) => setMph(event.target.value)}
            />
            <span className="chase-window-unit">mil/h</span>
          </label>
        )}
        <button type="button" className="chase-window-btn" onClick={restore}>
          Przywróć do pościgu
        </button>
      </div>
    </li>
  );
}

/** Rodzaj przeszkody w liście — podpowiedź jak w dawnej palecie (65e). */
function obstacleHint(kind: ChaseObstacleKind): string {
  const preset = CHASE_OBSTACLE_PRESETS[kind];
  if (kind === 'spikes') {
    return 'Kolczatka — pierwsze auto, które po niej przejedzie, rzuca Prowadzenie PT 17 albo bierze 4k6 w słaby punkt; potem znika.';
  }
  if (chaseObstacleUnbreakable(kind)) {
    return `${preset.label} — beton, nie do rozbicia: auto, które w nią wjedzie, jest wrakiem. Zostaje na drodze.`;
  }
  return `${preset.label} — ${preset.hp} PW. Kierowca, przed którym stanie, wybiera Gwałtowny skręt, Nagłe zatrzymanie albo taranowanie.`;
}

function ObstacleForm({
  scene,
  vehicles,
  anchor,
}: {
  scene: SceneView;
  vehicles: readonly SceneVehicleView[];
  anchor: SceneVehicleView | null;
}) {
  const racing = vehicles.filter((v) => v.status === 'racing');
  const [kind, setKind] = useState<ChaseObstacleKind>('barricade');
  const [beforeId, setBeforeId] = useState<string | null>(anchor?.id ?? null);
  const [lane, setLane] = useState<number>(anchor?.lane ?? 0);
  const [gapM, setGapM] = useState('');
  const [name, setName] = useState('');
  const [hp, setHp] = useState<number>(CHASE_OBSTACLE_PRESETS.custom.hp);
  const [imageUrl, setImageUrl] = useState('');
  const [assets, setAssets] = useState<TokenAssetView[] | null>(null);
  const custom = kind === 'custom';
  // Grafika własnej przeszkody z biblioteki „Grafik” — pobierana dopiero wtedy.
  useEffect(() => {
    if (!custom || assets) return;
    let live = true;
    apiGet<TokenAssetView[]>('/api/token-assets')
      .then((rows) => live && setAssets(rows))
      .catch(() => live && setAssets([]));
    return () => {
      live = false;
    };
  }, [custom, assets]);

  const before = racing.find((v) => v.id === beforeId) ?? null;
  const lanes = scene.chase.lanes;
  const mps = scene.metersPerSquare;
  const preset = CHASE_OBSTACLE_PRESETS[kind];
  const body = { widthSq: preset.widthSq, lengthSq: preset.lengthSq };
  const frame = { width: scene.width, height: scene.height, gridSizePx: scene.grid.sizePx };
  const maxGapSq = before
    ? chaseObstacleMaxGapSq({ centre: before, body: before }, body, scene.chase.direction, frame)
    : null;
  const noRoom = maxGapSq !== null && maxGapSq < 0;
  const maxM = maxGapSq !== null ? Math.max(0, Math.floor(maxGapSq * mps)) : 0;
  const typed = gapM.trim() === '' ? null : Number(gapM);
  // Puste pole — przy przedniej krawędzi (najdalej, jak się da).
  const gapSq =
    maxGapSq === null
      ? null
      : Math.min(
          Math.max(0, maxGapSq),
          typed !== null && Number.isFinite(typed) ? Math.max(0, typed) / mps : maxGapSq,
        );
  const step = before ? cpredRoadSquaresPerRound(before.speed) : 0;
  const rounds =
    gapSq === null ? null : gapSq === 0 ? 0 : step > 0 ? Math.ceil(gapSq / step) : null;
  // Dojedzie najpóźniej na początku następnej rundy — kierowca nie ma tury,
  // żeby zmienić pas zwykłą jazdą, zostaje mu Manewr albo taran.
  const tooClose = before !== null && gapSq !== null && step > 0 && gapSq <= step;

  const release = () => {
    const label = name.trim();
    act(() =>
      spawnChaseObstacle({
        sceneId: scene.id,
        kind,
        lane: Math.min(lane, lanes - 1),
        ...(before && gapSq !== null ? { beforeId: before.id, gapSq } : {}),
        ...(custom
          ? { hp, ...(label ? { name: label } : {}), ...(imageUrl ? { imageUrl } : {}) }
          : {}),
      }),
    );
  };

  return (
    <div className="chase-window-obstacle">
      <div className="chase-window-car-line">
        <select
          value={kind}
          aria-label="Rodzaj przeszkody"
          title={obstacleHint(kind)}
          onChange={(event) => setKind(event.target.value as ChaseObstacleKind)}
        >
          {CHASE_OBSTACLE_KINDS.map((entry) => (
            <option key={entry} value={entry}>
              {CHASE_OBSTACLE_PRESETS[entry].label}
            </option>
          ))}
        </select>
        <select
          value={Math.min(lane, lanes - 1)}
          aria-label="Pas przeszkody"
          onChange={(event) => setLane(Number(event.target.value))}
        >
          {Array.from({ length: lanes }, (_, index) => (
            <option key={index} value={index}>{`pas ${index + 1}`}</option>
          ))}
        </select>
      </div>
      {custom && (
        <div className="chase-window-car-line">
          <input
            type="text"
            className="chase-window-text"
            maxLength={CHASE_OBSTACLE_NAME_MAX}
            placeholder="nazwa"
            value={name}
            aria-label="Nazwa własnej przeszkody"
            onChange={(event) => setName(event.target.value)}
          />
          <label
            className="chase-window-speed"
            title="PW przeszkody — tyle przyjmie przy taranowaniu, zanim się rozbije"
          >
            <input
              type="number"
              min={0}
              max={CHASE_OBSTACLE_HP_MAX}
              step={1}
              value={hp}
              aria-label="PW własnej przeszkody"
              onChange={(event) =>
                setHp(
                  Number.isFinite(event.target.valueAsNumber)
                    ? Math.max(
                        0,
                        Math.min(CHASE_OBSTACLE_HP_MAX, Math.round(event.target.valueAsNumber)),
                      )
                    : 0,
                )
              }
            />
            <span className="chase-window-unit">PW</span>
          </label>
          <select
            value={imageUrl}
            aria-label="Grafika własnej przeszkody"
            title="Grafika z zakładki „Grafiki” — bez niej przeszkoda to bryła w pasy"
            onChange={(event) => setImageUrl(event.target.value)}
          >
            <option value="">bez grafiki</option>
            {(assets ?? []).map((asset) => (
              <option key={asset.id} value={asset.url}>
                {asset.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="chase-window-car-line">
        <label
          className="chase-window-speed"
          title={`Odstęp od przedniego zderzaka auta. Puste — przy przedniej krawędzi kadru${before ? ` (${maxM} m)` : ''}; przeszkoda zawsze stoi w kadrze.`}
        >
          <input
            type="number"
            min={0}
            max={maxM}
            step={Math.max(1, mps)}
            value={gapM}
            placeholder={before ? String(maxM) : '—'}
            disabled={!before}
            aria-label="Odległość przeszkody"
            onChange={(event) => setGapM(event.target.value)}
          />
          <span className="chase-window-unit">m przed</span>
        </label>
        <select
          value={before?.id ?? ''}
          aria-label="Przed którym autem"
          onChange={(event) => setBeforeId(event.target.value === '' ? null : event.target.value)}
        >
          <option value="">przednią krawędzią</option>
          {racing.map((vehicle) => (
            <option key={vehicle.id} value={vehicle.id}>
              {vehicle.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="chase-window-btn chase-window-btn--main"
          disabled={noRoom}
          onClick={release}
        >
          Wypuść
        </button>
      </div>
      {before && (
        <p className={`chase-window-hint${tooClose || noRoom ? ' chase-window-hint--warn' : ''}`}>
          {noRoom
            ? 'Przed tym autem nie ma już kadru.'
            : rounds === null
              ? `${before.name} stoi — nie dojedzie do przeszkody.`
              : tooClose
                ? `${before.name} dojedzie ${chaseRoundsText(rounds)} — kierowca nie zdąży zareagować zmianą pasa.`
                : `${before.name} dojedzie ${chaseRoundsText(rounds)}.`}
        </p>
      )}
    </div>
  );
}

function ObstacleList({
  scene,
  obstacles,
  anchor,
}: {
  scene: SceneView;
  obstacles: readonly ChaseObstacleView[];
  anchor: SceneVehicleView | null;
}) {
  if (obstacles.length === 0) {
    return <p className="chase-window-hint">Na drodze nie ma przeszkód.</p>;
  }
  const frame = { width: scene.width, height: scene.height, gridSizePx: scene.grid.sizePx };
  const ordered = [...obstacles].sort((a, b) => alongSq(b, scene) - alongSq(a, scene));
  return (
    <ul className="chase-window-obstacles">
      {ordered.map((obstacle) => {
        const eta =
          anchor && anchor.status === 'racing'
            ? chaseObstacleEta(
                { centre: anchor, body: anchor },
                { centre: obstacle, widthSq: obstacle.widthSq, lengthSq: obstacle.lengthSq },
                scene.chase.direction,
                frame,
                cpredRoadSquaresPerRound(anchor.speed),
              )
            : null;
        const where = !anchor
          ? ''
          : !eta
            ? 'za autem kadru'
            : `${formatMetres(eta.gapSq * scene.metersPerSquare)} przed autem kadru${
                eta.sameLane
                  ? eta.rounds === null
                    ? ''
                    : ` · ${chaseRoundsText(eta.rounds)}`
                  : ' · inny pas'
              }`;
        return (
          <li key={obstacle.id} className="chase-window-obstacle-row">
            <span className="chase-window-car-name">{obstacle.name}</span>
            <span className="chase-window-driver">{where}</span>
            <button
              type="button"
              className="chase-window-btn"
              onClick={() => act(() => removeChaseObstacle(obstacle.id))}
            >
              Zdejmij
            </button>
          </li>
        );
      })}
    </ul>
  );
}
