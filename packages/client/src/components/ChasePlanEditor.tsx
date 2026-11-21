import { useMemo, useState } from 'react';
import {
  CHASE_OBSTACLE_KINDS,
  CHASE_OBSTACLE_PRESETS,
  CHASE_PLAN_KINDS,
  CHASE_PLAN_KIND_LABELS,
  CHASE_PLAN_MAX,
  CHASE_PLAN_ROUND_MAX,
  CHASE_PLAN_TEXT_MAX,
  CPRED_VEHICLE_MANEUVERS,
  chasePlanEventOf,
  chasePlanTitle,
  cpredMphToSpeed,
  cpredSpeedMph,
  cpredVehicleManeuver,
  type ChaseEntrySide,
  type ChasePlanEntry,
  type ChasePlanEvent,
  type ChasePlanKind,
  type ChasePlanObstacleKind,
  type SceneVehicleView,
  type SceneView,
} from '@vtt/shared';
import { notifyRefusal } from '../notices.js';
import { setChasePlan } from '../socket.js';
import { useChaseStore } from '../stores/chaseStore.js';
import { ChasePlanDecision } from './ChasePlanCard.js';
import { chaseErrorText } from './ChaseVehicleMenu.js';

/**
 * Plan rund pościgu (etap 72f3) — lista „runda N → zdarzenie” i formularz
 * nowego wiersza. Ten sam w oknie „Pościg” i w kroku „Plan” kreatora. Wiersza
 * się nie edytuje w miejscu: MG zdejmuje go i dopisuje nowy (prościej niż
 * drugi formularz); wiersz, o który karta właśnie pyta, ma tu te same
 * przyciski co karta czatu.
 */

const OBSTACLE_KINDS = CHASE_OBSTACLE_KINDS.filter(
  (kind): kind is ChasePlanObstacleKind => kind !== 'custom',
);
// Manewry jezdni — na drodze pościgu nie ma latających (lądowanie, manewr w powietrzu).
const GROUND_MANEUVERS = CPRED_VEHICLE_MANEUVERS.filter((maneuver) => !maneuver.air);

function newId(): string {
  return `p${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

function maneuverLabel(id: string): string | null {
  const maneuver = cpredVehicleManeuver(id);
  return maneuver ? `${maneuver.name} (PT ${maneuver.dv})` : null;
}

export function chasePlanEntryTitle(
  event: ChasePlanEvent,
  vehicles: readonly SceneVehicleView[],
  scene: SceneView,
): string {
  return chasePlanTitle(
    event,
    {
      vehicle: (id) => vehicles.find((vehicle) => vehicle.id === id)?.name ?? null,
      maneuver: maneuverLabel,
      metersPerSquare: scene.metersPerSquare,
    },
    cpredSpeedMph,
  );
}

function statusText(entry: ChasePlanEntry): string {
  switch (entry.status) {
    case 'planned':
      return entry.dueRound !== entry.round ? `odłożone na rundę ${entry.dueRound}` : 'czeka';
    case 'asked':
      return 'pyta teraz';
    case 'done':
      return entry.kind === 'note' ? 'zrobione' : 'wypuszczone';
    case 'skipped':
      return 'pominięte';
  }
}

async function save(sceneId: string, plan: ChasePlanEvent[]): Promise<boolean> {
  const ack = await setChasePlan(sceneId, plan);
  if (!ack.ok) {
    notifyRefusal('chase', chaseErrorText(ack.error));
    return false;
  }
  if (ack.data) useChaseStore.getState().setPlan(ack.data.plan);
  return true;
}

export function ChasePlanEditor({
  scene,
  round,
}: {
  scene: SceneView;
  /** Bieżąca runda walki (`null` — przed walką): domyślna runda nowego wiersza to następna. */
  round: number | null;
}) {
  const plan = useChaseStore((s) => s.plan);
  const vehicles = useChaseStore((s) => s.vehicles);
  const remove = (id: string) =>
    void save(scene.id, plan.filter((entry) => entry.id !== id).map(chasePlanEventOf));
  return (
    <div className="chase-plan" data-testid="chase-plan-editor">
      {plan.length === 0 ? (
        <p className="chase-window-hint">
          Planu nie ma. Wpisz, co ma się stać w której rundzie — serwer zapyta o to na jej początku.
        </p>
      ) : (
        <ul className="chase-window-obstacles chase-plan-list">
          {plan.map((entry) => (
            <li
              key={entry.id}
              className={`chase-plan-row chase-plan-row--${entry.status}`}
              data-plan-id={entry.id}
              data-status={entry.status}
            >
              <div className="chase-window-car-line">
                <span className="chase-plan-round">{`R${entry.round}`}</span>
                <span className="chase-plan-what">
                  {chasePlanEntryTitle(entry, vehicles, scene)}
                </span>
              </div>
              {entry.kind !== 'note' && entry.text && (
                <p className="chase-window-hint chase-plan-text">{entry.text}</p>
              )}
              <div className="chase-window-car-line">
                <span className="chase-window-tag">{statusText(entry)}</span>
                {entry.status === 'asked' && entry.messageId !== null ? (
                  <ChasePlanDecision
                    messageId={entry.messageId}
                    entry={{
                      sceneId: scene.id,
                      round: entry.dueRound,
                      entryId: entry.id,
                      kind: entry.kind,
                      title: '',
                      text: entry.text,
                      status: 'waiting',
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="chase-window-btn"
                    onClick={() => remove(entry.id)}
                  >
                    Usuń
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {plan.length < CHASE_PLAN_MAX && (
        <ChasePlanForm scene={scene} round={round} plan={plan} vehicles={vehicles} />
      )}
    </div>
  );
}

function ChasePlanForm({
  scene,
  round,
  plan,
  vehicles,
}: {
  scene: SceneView;
  round: number | null;
  plan: readonly ChasePlanEntry[];
  vehicles: readonly SceneVehicleView[];
}) {
  const lanes = scene.chase.lanes;
  const mps = scene.metersPerSquare;
  // Posiłki to zwykle auto poza kadrem (rezerwa wzorca) — te idą na początek listy.
  const reserveFirst = useMemo(
    () =>
      [...vehicles].sort(
        (a, b) =>
          Number(b.status === 'behind' || b.status === 'escaped') -
          Number(a.status === 'behind' || a.status === 'escaped'),
      ),
    [vehicles],
  );
  const [atRound, setAtRound] = useState(String(Math.min(CHASE_PLAN_ROUND_MAX, (round ?? 0) + 1)));
  const [kind, setKind] = useState<ChasePlanKind>('reinforce');
  const [text, setText] = useState('');
  const [vehicleId, setVehicleId] = useState<string>('');
  const [lane, setLane] = useState(0);
  const [side, setSide] = useState<ChaseEntrySide>('rear');
  const [mph, setMph] = useState('');
  const [obstacle, setObstacle] = useState<ChasePlanObstacleKind>('barricade');
  const [beforeId, setBeforeId] = useState<string>('');
  const [gapM, setGapM] = useState('');
  const [maneuver, setManeuver] = useState<string>(GROUND_MANEUVERS[0]?.id ?? 'swerve');

  const roundValue = Number(atRound);
  const roundOk =
    Number.isInteger(roundValue) && roundValue >= 1 && roundValue <= CHASE_PLAN_ROUND_MAX;
  const carId = vehicleId || reserveFirst[0]?.id || '';
  const label = text.trim();

  const build = (): ChasePlanEvent | null => {
    if (!roundOk) return null;
    const base = { id: newId(), round: roundValue, text: label === '' ? null : label };
    const laneOf = Math.min(lane, lanes - 1);
    switch (kind) {
      case 'reinforce': {
        if (!carId) return null;
        const typed = mph.trim() === '' ? null : Number(mph);
        return {
          ...base,
          kind,
          vehicleId: carId,
          lane: laneOf,
          side,
          speed:
            typed !== null && Number.isFinite(typed) && typed >= 0 ? cpredMphToSpeed(typed) : null,
        };
      }
      case 'obstacle': {
        const typed = gapM.trim() === '' ? null : Number(gapM);
        return {
          ...base,
          kind,
          obstacle,
          lane: laneOf,
          beforeId: beforeId === '' ? null : beforeId,
          gapSq: typed !== null && Number.isFinite(typed) && typed >= 0 ? typed / mps : null,
        };
      }
      case 'maneuver':
        return { ...base, kind, vehicleId: vehicleId === '' ? null : vehicleId, maneuver };
      case 'note':
        return label === '' ? null : { ...base, kind, text: label };
    }
  };
  const draft = build();

  const add = async () => {
    if (!draft) return;
    if (await save(scene.id, [...plan.map(chasePlanEventOf), draft])) setText('');
  };

  const laneSelect = (
    <select
      value={Math.min(lane, lanes - 1)}
      aria-label="Pas"
      onChange={(event) => setLane(Number(event.target.value))}
    >
      {Array.from({ length: lanes }, (_, index) => (
        <option key={index} value={index}>{`pas ${index + 1}`}</option>
      ))}
    </select>
  );

  return (
    <div className="chase-window-obstacle chase-plan-form" data-testid="chase-plan-form">
      <div className="chase-window-car-line">
        <label className="chase-window-speed" title="Na początku tej rundy serwer zapyta MG">
          <span className="chase-window-unit">runda</span>
          <input
            type="number"
            min={1}
            max={CHASE_PLAN_ROUND_MAX}
            step={1}
            value={atRound}
            aria-label="Runda zdarzenia"
            onChange={(event) => setAtRound(event.target.value)}
          />
        </label>
        <select
          value={kind}
          aria-label="Rodzaj zdarzenia"
          onChange={(event) => {
            setKind(event.target.value as ChasePlanKind);
            setVehicleId('');
          }}
        >
          {CHASE_PLAN_KINDS.map((entry) => (
            <option key={entry} value={entry}>
              {CHASE_PLAN_KIND_LABELS[entry]}
            </option>
          ))}
        </select>
      </div>

      {kind === 'reinforce' && (
        <div className="chase-window-car-line">
          <select
            value={carId}
            aria-label="Auto posiłków"
            onChange={(event) => setVehicleId(event.target.value)}
          >
            {reserveFirst.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.status === 'racing' || vehicle.status === 'wrecked'
                  ? `${vehicle.name} (w kadrze)`
                  : vehicle.name}
              </option>
            ))}
          </select>
          {laneSelect}
          <select
            value={side}
            aria-label="Strona kadru"
            title="Przy której krawędzi kadru auto wjeżdża"
            onChange={(event) => setSide(event.target.value as ChaseEntrySide)}
          >
            <option value="rear">od tyłu</option>
            <option value="front">od przodu</option>
          </select>
          <label
            className="chase-window-speed"
            title="Prędkość wjazdu. Puste — prędkość pościgu z chwili wypuszczenia: auto trzyma się kadru."
          >
            <input
              type="number"
              min={0}
              step={50}
              value={mph}
              placeholder="pościg"
              aria-label="Prędkość wjazdu"
              onChange={(event) => setMph(event.target.value)}
            />
            <span className="chase-window-unit">mil/h</span>
          </label>
        </div>
      )}

      {kind === 'obstacle' && (
        <div className="chase-window-car-line">
          <select
            value={obstacle}
            aria-label="Rodzaj przeszkody"
            onChange={(event) => setObstacle(event.target.value as ChasePlanObstacleKind)}
          >
            {OBSTACLE_KINDS.map((entry) => (
              <option key={entry} value={entry}>
                {CHASE_OBSTACLE_PRESETS[entry].label}
              </option>
            ))}
          </select>
          {laneSelect}
          <label
            className="chase-window-speed"
            title="Odstęp od przedniego zderzaka auta. Puste — przy przedniej krawędzi kadru; przeszkoda zawsze stoi w kadrze."
          >
            <input
              type="number"
              min={0}
              step={Math.max(1, mps)}
              value={gapM}
              placeholder="krawędź"
              aria-label="Odległość przeszkody"
              onChange={(event) => setGapM(event.target.value)}
            />
            <span className="chase-window-unit">m przed</span>
          </label>
          <select
            value={beforeId}
            aria-label="Przed którym autem"
            title="Auto z chwili wypuszczenia; gdy wypadnie z kadru — auto kadru"
            onChange={(event) => setBeforeId(event.target.value)}
          >
            <option value="">autem kadru</option>
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {kind === 'maneuver' && (
        <div className="chase-window-car-line">
          <select
            value={maneuver}
            aria-label="Manewr"
            onChange={(event) => setManeuver(event.target.value)}
          >
            {GROUND_MANEUVERS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {`${entry.name} (PT ${entry.dv})`}
              </option>
            ))}
          </select>
          <select
            value={vehicleId}
            aria-label="Które auto"
            onChange={(event) => setVehicleId(event.target.value)}
          >
            <option value="">wszystkie auta z kierowcą</option>
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="chase-window-car-line">
        <input
          type="text"
          className="chase-window-text chase-plan-note"
          maxLength={CHASE_PLAN_TEXT_MAX}
          placeholder={kind === 'note' ? 'co MG ma zrobić' : 'dopisek dla MG (opcjonalnie)'}
          value={text}
          aria-label={kind === 'note' ? 'Treść notatki' : 'Dopisek dla MG'}
          onChange={(event) => setText(event.target.value)}
        />
        <button
          type="button"
          className="chase-window-btn chase-window-btn--main"
          disabled={!draft}
          onClick={() => void add()}
        >
          Dodaj do planu
        </button>
      </div>
      {kind === 'reinforce' && vehicles.length === 0 && (
        <p className="chase-window-hint">Na scenie nie ma aut — posiłki to auto spoza kadru.</p>
      )}
    </div>
  );
}
