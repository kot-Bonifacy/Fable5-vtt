import { useState } from 'react';
import {
  CPRED_FLEET_STATE_LABELS,
  CPRED_MOTO_ABILITY,
  CPRED_MOTO_ELDER_LEVEL,
  CPRED_MOTO_REPAIR_FEE,
  CPRED_MOTO_UPGRADE_FEE,
  CPRED_VEHICLE_UPGRADE_PROBLEMS,
  cpredFamilyRepairProblem,
  cpredFleetVehicleState,
  cpredIsFleetVehicle,
  cpredRoleAbilityRank,
  cpredVehicleUpgradeProblem,
  cpredVehicleUpgradesFor,
  formatEddies,
  formatGameDayTime,
  type CpredVehicleStats,
  type SocketAck,
  type VehicleView,
} from '@vtt/shared';
import { noteAck } from '../notices.js';
import {
  chooseFleetVehicle,
  familyRepairVehicle,
  familyUpgradeVehicle,
  fleetErrorText,
  joinFleetVehicle,
} from '../socket.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { COMBAT_LOCKED_HINT, useCombatLocked } from '../stores/combatStore.js';
import { useGameTimeStore } from '../stores/gameTimeStore.js';

/**
 * Tabor Rodziny na karcie auta (etap 71c1, s. 162–164). Widać go tylko przy
 * aucie Nomady: gdzie auto jest (w użyciu, jedzie, u Rodziny), wymiana,
 * naprawa wraku u Rodziny, a od Moto 10 — dokładanie aut i ulepszenia od
 * Rodziny. Reguły i zdania odmów z `systems/cpred/fleet.ts`; serwer liczy to samo.
 */
export function FleetVehicleControls({
  vehicle,
  stats,
}: {
  vehicle: VehicleView;
  stats: CpredVehicleStats;
}) {
  const owner = useCharacterStore((s) =>
    vehicle.ownerCharacterId ? (s.characters[vehicle.ownerCharacterId] ?? null) : null,
  );
  const registry = useCharacterStore((s) => s.registry);
  const now = useGameTimeStore((s) => s.minutes);
  const locked = useCombatLocked();
  const [upgradeId, setUpgradeId] = useState('');
  const [busy, setBusy] = useState(false);
  const rank = owner ? cpredRoleAbilityRank(owner.data, registry, CPRED_MOTO_ABILITY) : null;
  if (rank === null) return null;
  const fleet = cpredIsFleetVehicle(stats);
  const elder = rank >= CPRED_MOTO_ELDER_LEVEL;
  if (!fleet && !elder) return null;

  async function run(action: () => Promise<SocketAck<unknown>>) {
    setBusy(true);
    try {
      noteAck('character', await action(), fleetErrorText);
    } finally {
      setBusy(false);
    }
  }

  const state = cpredFleetVehicleState(stats, now);
  const repairProblem = cpredFamilyRepairProblem(stats, now);
  const upgrades = cpredVehicleUpgradesFor(stats.kind).map((entry) => ({
    entry,
    problem: cpredVehicleUpgradeProblem(stats.kind, stats.upgrades, entry.id),
  }));
  const picked = upgrades.find((choice) => choice.entry.id === upgradeId && !choice.problem);

  return (
    <div className="fleet-controls">
      {fleet ? (
        <span className="vehicle-card-tag" data-fleet-state={state}>
          {state === 'family' && stats.familyRepairUntil !== undefined
            ? `U Rodziny do ${formatGameDayTime(stats.familyRepairUntil)}`
            : state === 'arriving' && stats.inUseFrom !== undefined
              ? `Przyjedzie ${formatGameDayTime(stats.inUseFrom)}`
              : elder && state === 'idle'
                ? 'W Taborze'
                : CPRED_FLEET_STATE_LABELS[state]}
        </span>
      ) : null}
      {fleet && !elder && state === 'idle' ? (
        <button
          type="button"
          className="cp-mini-button"
          disabled={busy}
          title="Nomada używa jednego auta Taboru naraz. Pierwsze jest od razu, wymiana przyjeżdża następnego ranka (s. 162)."
          onClick={() => void run(() => chooseFleetVehicle(vehicle.id))}
        >
          Biorę to auto
        </button>
      ) : null}
      {fleet && !elder && state === 'inUse' && stats.inUseUntil !== undefined ? (
        <button
          type="button"
          className="cp-mini-button"
          disabled={busy}
          title="Wymiana jeszcze nie przyjechała — zostajesz przy tym aucie."
          onClick={() => void run(() => chooseFleetVehicle(vehicle.id))}
        >
          Zostaję przy nim
        </button>
      ) : null}
      {fleet && repairProblem === null ? (
        <button
          type="button"
          className="cp-mini-button"
          disabled={busy || locked}
          title={
            locked
              ? COMBAT_LOCKED_HINT
              : `Rodzina naprawia wrak tydzień; wypada zapłacić ${CPRED_MOTO_REPAIR_FEE} ed (s. 162).`
          }
          onClick={() => void run(() => familyRepairVehicle(vehicle.id))}
        >
          Oddaj Rodzinie do naprawy ({formatEddies(CPRED_MOTO_REPAIR_FEE)} ed)
        </button>
      ) : null}
      {elder && !fleet ? (
        <button
          type="button"
          className="cp-mini-button"
          disabled={busy}
          title="Głowa Rodziny dokupuje auta do Taboru po cenie rynkowej (s. 162) — to auto dołącza do Taboru."
          onClick={() => void run(() => joinFleetVehicle(vehicle.id))}
        >
          Do Taboru Rodziny
        </button>
      ) : null}
      {elder && fleet ? (
        <span className="fleet-upgrade">
          <select
            value={upgradeId}
            aria-label={`Ulepszenie od Rodziny: ${vehicle.name}`}
            disabled={busy || locked}
            onChange={(event) => setUpgradeId(event.target.value)}
          >
            <option value="">— ulepszenie od Rodziny —</option>
            {upgrades.map(({ entry, problem }) => (
              <option
                key={entry.id}
                value={entry.id}
                disabled={problem !== null}
                title={problem ? CPRED_VEHICLE_UPGRADE_PROBLEMS[problem] : entry.text}
              >
                {entry.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="cp-mini-button"
            disabled={busy || locked || !picked}
            title={
              locked
                ? COMBAT_LOCKED_HINT
                : `Głowa Rodziny ulepsza auta Taboru po ${formatEddies(CPRED_MOTO_UPGRADE_FEE)} ed (s. 162).`
            }
            onClick={() => {
              if (!picked) return;
              void run(() => familyUpgradeVehicle(vehicle.id, picked.entry.id)).then(() =>
                setUpgradeId(''),
              );
            }}
          >
            Rodzina montuje ({formatEddies(CPRED_MOTO_UPGRADE_FEE)} ed)
          </button>
        </span>
      ) : null}
    </div>
  );
}
