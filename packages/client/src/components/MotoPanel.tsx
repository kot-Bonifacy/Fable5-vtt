import { useMemo } from 'react';
import {
  CPRED_FLEET_KIND_LABELS,
  CPRED_MOTO_ABILITY,
  CPRED_MOTO_ELDER_LEVEL,
  CPRED_MOTO_FLEET,
  CPRED_MOTO_REPAIR_FEE,
  CPRED_MOTO_SKILL_IDS,
  CPRED_MOTO_UPGRADE_FEE,
  CPRED_VEHICLE_UPGRADE_PROBLEMS,
  cpredFleetProblem,
  cpredFleetRowLevel,
  cpredFleetTierAt,
  cpredRoleAbilityRank,
  cpredVehicleDerived,
  cpredVehicleUpgrade,
  cpredVehicleUpgradeProblem,
  cpredVehicleUpgradesFor,
  isVehicleEntry,
  readCpredFleet,
  readCpredVehicle,
  type CpredFleetRow,
  type VehicleEntry,
  type VehicleView,
} from '@vtt/shared';
import { queueCharacterSave } from '../socket.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { COMBAT_LOCKED_HINT, useCombatLocked } from '../stores/combatStore.js';
import { useCompendiumStore } from '../stores/compendiumStore.js';
import { useVehicleStore } from '../stores/vehicleStore.js';

/**
 * Moto Nomady (etap 30d, s. 161–163).
 *
 * Dwie połowy o zupełnie różnej wadze. **Poziom dokłada się sam** do sześciu
 * Testów — liczy to planer rzutu, więc panel tylko mówi, do których; nie ma tu
 * żadnego guzika, bo nie ma czego klikać. **Tabor Rodziny** jest listą, a nie
 * prozą, bo podręcznik go liczy: „Zawsze, gdy Nomada podnosi poziom […] może
 * zrobić jedną z dwóch rzeczy", czyli wpisów jest tyle, ile awansów, i żaden
 * nie może być z kategorii wyższej niż poziom.
 *
 * Od etapu 65a wiersz „Pojazd” wybiera pojazd z katalogu, a serwer zakłada mu
 * prawdziwy pojazd (sekcja „Pojazdy” w Ekwipunku); wiersz „Ulepszenie”
 * wskazuje pojazd Taboru i ulepszenie z s. 163–165. Kategoria wiersza wynika
 * z wyboru — próg pojazdu albo „Wymagany Poziom Moto” ulepszenia — i liczy ją
 * ta sama funkcja, co serwer (`cpredFleetRowLevel`).
 */
export function MotoPanel({ characterId }: { characterId: string }) {
  const character = useCharacterStore((s) => s.characters[characterId] ?? null);
  const registry = useCharacterStore((s) => s.registry);
  const entries = useCompendiumStore((s) => s.entries);
  const order = useCompendiumStore((s) => s.order);
  const vehicles = useVehicleStore((s) => s.vehicles);
  const locked = useCombatLocked();

  const catalog = useMemo(
    () =>
      order
        .map((id) => entries[id])
        .filter((entry): entry is VehicleEntry => entry !== undefined && isVehicleEntry(entry)),
    [entries, order],
  );

  const rank = character
    ? cpredRoleAbilityRank(character.data, registry, CPRED_MOTO_ABILITY)
    : null;
  if (!character || rank === null) return null;

  const lookup = (id: string) => catalog.find((entry) => entry.id === id) ?? null;
  // Pojazdy Taboru tej karty — w nie wstawia się ulepszenia z awansu.
  const fleetVehicles = Object.values(vehicles).filter(
    (vehicle) =>
      vehicle.ownerCharacterId === characterId && readCpredVehicle(vehicle.system).fleetRowId,
  );
  // Z Taboru tylko to, co stoi w zasięgu poziomu (s. 162).
  const reachable = catalog.filter((entry) => (entry.motoLevel ?? 1) <= rank);
  const fleet = readCpredFleet(character.data.fleet).map((row) => ({
    ...row,
    level: cpredFleetRowLevel(row, lookup),
  }));
  const left = Math.max(0, rank - fleet.length);
  const skills = CPRED_MOTO_SKILL_IDS.map(
    (id) => registry.skills.find((skill) => skill.id === id)?.name,
  ).filter((name): name is string => name !== undefined);

  function save(rows: CpredFleetRow[]): void {
    // Ta sama funkcja, którą serwer odrzuca łatę — guzik gaśnie tam, gdzie
    // odmowa i tak by przyszła.
    const levelled = rows.map((row) => ({ ...row, level: cpredFleetRowLevel(row, lookup) }));
    if (locked || cpredFleetProblem(levelled, rank) !== null) return;
    queueCharacterSave(characterId, { data: { fleet: levelled } });
  }

  function patchRow(id: string, patch: Partial<CpredFleetRow>): void {
    save(fleet.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function removeRow(id: string): void {
    save(fleet.filter((row) => row.id !== id));
  }

  /** Ulepszenia z awansu, które ten pojazd przyjmie — bez wiersza `rowId` (jego własny wybór). */
  function upgradesFor(vehicle: VehicleView | undefined, rowId: string) {
    if (!vehicle || rank === null) return [];
    const stats = readCpredVehicle(vehicle.system);
    const others = stats.upgrades.filter((entry) => entry.fleetRowId !== rowId);
    return cpredVehicleUpgradesFor(stats.kind)
      .filter((entry) => entry.motoLevel <= rank)
      .map((entry) => ({
        entry,
        problem: cpredVehicleUpgradeProblem(stats.kind, others, entry.id),
      }));
  }

  const firstVehicle = reachable[0];
  const upgradeTarget = fleetVehicles.find((vehicle) =>
    upgradesFor(vehicle, '').some((choice) => choice.problem === null),
  );
  const newId = () => Math.random().toString(36).slice(2, 10);
  const fullHint = 'Każdy poziom Moto to jeden wpis — na kolejny trzeba awansu.';

  function addVehicle(): void {
    if (!firstVehicle) return;
    save([
      ...fleet,
      {
        id: newId(),
        kind: 'vehicle',
        name: firstVehicle.name,
        level: firstVehicle.motoLevel ?? 1,
        notes: '',
        compendiumId: firstVehicle.id,
      },
    ]);
  }

  function addUpgrade(): void {
    if (!upgradeTarget) return;
    const pick = upgradesFor(upgradeTarget, '').find((choice) => choice.problem === null);
    if (!pick) return;
    save([
      ...fleet,
      {
        id: newId(),
        kind: 'upgrade',
        name: pick.entry.name,
        level: pick.entry.motoLevel,
        notes: '',
        vehicleId: upgradeTarget.id,
        upgradeId: pick.entry.id,
      },
    ]);
  }

  return (
    <div className="awareness">
      <header className="awareness-head">
        <h4>
          {CPRED_MOTO_ABILITY} {rank}
        </h4>
        <p className={left === 0 ? 'awareness-left awareness-left--empty' : 'awareness-left'}>
          {left === 0 ? 'Tabor skompletowany' : `Do wzięcia: ${left} z ${rank}`}
        </p>
      </header>

      {skills.length > 0 && (
        <p className="awareness-derived">
          +{rank} do Testów: {skills.join(', ')}
        </p>
      )}

      <ul className="awareness-list">
        {fleet.map((row) => {
          const vehicle = row.vehicleId ? vehicles[row.vehicleId] : undefined;
          if (row.kind === 'vehicle') {
            const stats = vehicle ? readCpredVehicle(vehicle.system) : null;
            const derived = stats ? cpredVehicleDerived(stats) : null;
            return (
              <li key={row.id} className="awareness-row fleet-row">
                <span className="fleet-kind">{CPRED_FLEET_KIND_LABELS.vehicle}</span>
                <select
                  value={row.compendiumId ?? ''}
                  disabled={locked}
                  aria-label={`Pojazd Taboru: ${row.name}`}
                  onChange={(event) => {
                    const entry = lookup(event.target.value);
                    if (entry) patchRow(row.id, { compendiumId: entry.id, name: entry.name });
                  }}
                >
                  {row.compendiumId ? null : <option value="">{row.name} (stary wpis)</option>}
                  {(reachable.length > 0 ? reachable : catalog).map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                      {entry.motoLevel ? ` (od Moto ${entry.motoLevel})` : ''}
                    </option>
                  ))}
                </select>
                <span className="fleet-level" title="Kategoria wpisu — próg pojazdu w Taborze">
                  kat. {row.level}
                </span>
                <RemoveButton locked={locked} name={row.name} onClick={() => removeRow(row.id)} />
                <span className="fleet-detail">
                  {vehicle && stats && derived
                    ? `${vehicle.name}: PUK ${stats.hp}/${derived.hpMax}, Ruch ${stats.move}, fotele ${derived.seats}`
                    : 'Pojazd powstaje po zapisie…'}
                </span>
              </li>
            );
          }
          const choices = upgradesFor(vehicle, row.id);
          const chosen = row.upgradeId ? cpredVehicleUpgrade(row.upgradeId) : null;
          return (
            <li key={row.id} className="awareness-row fleet-row">
              <span className="fleet-kind">{CPRED_FLEET_KIND_LABELS.upgrade}</span>
              <select
                value={row.vehicleId ?? ''}
                disabled={locked}
                aria-label={`Pojazd dla ulepszenia: ${row.name}`}
                onChange={(event) =>
                  patchRow(row.id, { vehicleId: event.target.value || undefined })
                }
              >
                {row.vehicleId ? null : <option value="">{row.name} — wybierz pojazd</option>}
                {fleetVehicles.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.name}
                  </option>
                ))}
              </select>
              <span className="fleet-level" title="Kategoria wpisu — Wymagany Poziom Moto">
                kat. {row.level}
              </span>
              <RemoveButton locked={locked} name={row.name} onClick={() => removeRow(row.id)} />
              <select
                className="fleet-detail"
                value={row.upgradeId ?? ''}
                disabled={locked || !vehicle}
                aria-label={`Ulepszenie: ${row.name}`}
                title={chosen ? `${chosen.text} (s. ${chosen.page})` : undefined}
                onChange={(event) => {
                  const upgrade = cpredVehicleUpgrade(event.target.value);
                  if (upgrade) patchRow(row.id, { upgradeId: upgrade.id, name: upgrade.name });
                }}
              >
                {row.upgradeId ? null : <option value="">— wybierz ulepszenie —</option>}
                {choices.map(({ entry, problem }) => (
                  <option
                    key={entry.id}
                    value={entry.id}
                    disabled={problem !== null && entry.id !== row.upgradeId}
                    title={problem ? CPRED_VEHICLE_UPGRADE_PROBLEMS[problem] : entry.text}
                  >
                    {entry.name} (Moto {entry.motoLevel})
                  </option>
                ))}
              </select>
            </li>
          );
        })}
      </ul>

      <div className="awareness-buttons">
        <button
          type="button"
          disabled={left === 0 || locked || !firstVehicle}
          title={
            locked
              ? COMBAT_LOCKED_HINT
              : left === 0
                ? fullHint
                : !firstVehicle
                  ? 'W katalogu nie ma pojazdu z twojego progu Taboru.'
                  : 'Pojazd Taboru Rodziny w zasięgu twojego poziomu (s. 162)'
          }
          onClick={addVehicle}
        >
          Dołóż pojazd
        </button>
        <button
          type="button"
          disabled={left === 0 || locked || !upgradeTarget}
          title={
            locked
              ? COMBAT_LOCKED_HINT
              : left === 0
                ? fullHint
                : !upgradeTarget
                  ? 'Najpierw pojazd w Taborze — ulepszenie montuje się w nim.'
                  : 'Ulepszenie w pojeździe Taboru (s. 163–165)'
          }
          onClick={addUpgrade}
        >
          Dołóż ulepszenie
        </button>
      </div>

      <div className="awareness-extras">
        <details>
          <summary>Tabor Rodziny — co stoi w zasięgu poziomu (s. 162)</summary>
          <ul>
            {CPRED_MOTO_FLEET.map((entry) => (
              <li key={entry.id}>
                <b>
                  {entry.min}–{entry.max}
                </b>{' '}
                {entry.vehicles}
                {cpredFleetTierAt(rank)?.id === entry.id ? ' ← twój poziom' : ''}
              </li>
            ))}
          </ul>
          <p>
            Nomada używa jednego pojazdu naraz; wymiana przyjeżdża następnego ranka. Naprawa
            zniszczonego trwa tydzień i wypada zapłacić {CPRED_MOTO_REPAIR_FEE} ed. Od poziomu{' '}
            {CPRED_MOTO_ELDER_LEVEL} Nomada wchodzi do władz Rodziny: używa całego Taboru, dokupuje
            pojazdy po cenie rynkowej i ulepsza je po {CPRED_MOTO_UPGRADE_FEE} ed.
          </p>
        </details>
      </div>
    </div>
  );
}

function RemoveButton({
  locked,
  name,
  onClick,
}: {
  locked: boolean;
  name: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="cp-mini-button"
      disabled={locked}
      title={locked ? COMBAT_LOCKED_HINT : `Usuń z Taboru: ${name}`}
      aria-label={`Usuń z Taboru: ${name}`}
      onClick={onClick}
    >
      ✕
    </button>
  );
}
