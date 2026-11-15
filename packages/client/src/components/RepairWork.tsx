import { useState } from 'react';
import {
  CPRED_ARMOR_REPAIR_SKILL_ID,
  CPRED_TECH_UPGRADE_PROBLEMS,
  CPRED_TECH_VEHICLE_UPGRADE_TASK,
  cpredArmorNeedsRepair,
  cpredArmorRepairTask,
  cpredSheetFabrication,
  cpredVehicleRepairTask,
  cpredVehicleTechSkillId,
  formatEddies,
  formatWorkDuration,
  type CpredArmorRow,
  type CpredCharacterData,
  type CpredRepairTargetView,
  type CpredVehicleStats,
  type VehicleView,
} from '@vtt/shared';
import { notifyRefusal } from '../notices.js';
import { fetchRepairTargets, repairWorkErrorText } from '../socket.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { COMBAT_LOCKED_HINT, useCombatLocked } from '../stores/combatStore.js';
import { useCompendiumStore } from '../stores/compendiumStore.js';
import { loadWorkCup } from '../stores/rollStore.js';

/**
 * Zwykła naprawa i montaż ulepszenia auta Technikiem (etap 71c2, s. 140,
 * s. 147–148). Każdy z tych przycisków ładuje Test do kubka — PT, czas
 * i cenę surowców dopisuje serwer, a MG dostaje na karcie rzutu przycisk
 * zegara. Poza walką: w walce zostaje Prowizorka.
 */

const NO_PLAN = 'Tą postacią nie da się tego rzucić — odśwież kartę.';

function workHint(dv: number, minutes: number): string {
  return `PT ${dv} · ${formatWorkDuration(minutes)} pracy (porażka: połowa czasu i od nowa)`;
}

/** „Napraw” przy własnym pancerzu: Test Podstawowych napraw tej karty. */
export function ArmorRepairButton({
  character,
  data,
  row,
}: {
  character: { id: string; name: string };
  data: CpredCharacterData;
  row: CpredArmorRow;
}) {
  const registry = useCharacterStore((s) => s.registry);
  const entry = useCompendiumStore((s) =>
    row.compendiumId ? (s.entries[row.compendiumId] ?? null) : null,
  );
  const locked = useCombatLocked();
  if (!cpredArmorNeedsRepair(row)) return null;
  const task = cpredArmorRepairTask(entry?.costCategory ?? null, row.upgrade);
  const repair = cpredSheetFabrication(data, registry).repair;
  return (
    <button
      type="button"
      className="small-button"
      disabled={locked}
      title={
        locked
          ? `${COMBAT_LOCKED_HINT} W walce zostaje Prowizorka.`
          : `Zwykła naprawa: Test TECH + Podstawowe naprawy${repair > 0 ? ` + Naprawa ${repair}` : ''} — ${workHint(task.dv, task.minutes)}. Udana oddaje pełne OB.`
      }
      onClick={() => {
        const loaded = loadWorkCup(
          { characterId: character.id, characterName: character.name },
          {
            kind: 'repair',
            target: { kind: 'armor', characterId: character.id, armorRowId: row.id },
            skillId: CPRED_ARMOR_REPAIR_SKILL_ID,
            targetName: row.name,
          },
          data,
          registry,
        );
        if (!loaded) notifyRefusal('character', NO_PLAN);
      }}
    >
      Napraw
    </button>
  );
}

/** „Napraw (Test)” na karcie auta: rzuca właściciel auta (NOM-10, TEC-S1). */
export function VehicleRepairButton({
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
  const locked = useCombatLocked();
  const task = cpredVehicleRepairTask(stats);
  if (!owner || !task) return null;
  // W rzędzie jak przyciski Taboru — sam przycisk w karcie auta stał wyśrodkowany.
  return (
    <div className="fleet-controls">
      <button
        type="button"
        className="cp-mini-button"
        disabled={locked}
        title={
          locked
            ? COMBAT_LOCKED_HINT
            : `Naprawa Testem (s. 147): TECH + Naprawa pojazdów (+ Naprawa Technika, + Moto) — ${workHint(task.dv, task.minutes)}. Udana oddaje pełne PUK i szyby. Warsztat za ed stoi obok.`
        }
        onClick={() => {
          const loaded = loadWorkCup(
            { characterId: owner.id, characterName: owner.name },
            {
              kind: 'repair',
              target: { kind: 'vehicle', vehicleId: vehicle.id },
              skillId: cpredVehicleTechSkillId(stats.kind),
              targetName: vehicle.name,
            },
            owner.data,
            registry,
          );
          if (!loaded) notifyRefusal('character', NO_PLAN);
        }}
      >
        Napraw (Test)
      </button>
    </div>
  );
}

/**
 * Roboty drużyny w panelu Twórcy: starte pancerze i uszkodzone auta kart
 * drużyny (`repair:targets`), a przy Ulepszaniu — ulepszenia progu Moto 1 do
 * każdego auta. Lista przychodzi z serwera na żądanie, bo cudzych kart klient
 * gracza nie zna.
 */
export function TeamWorkshop({ characterId }: { characterId: string }) {
  const character = useCharacterStore((s) => s.characters[characterId] ?? null);
  const registry = useCharacterStore((s) => s.registry);
  const locked = useCombatLocked();
  const [targets, setTargets] = useState<CpredRepairTargetView[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<Record<string, string>>({});
  if (!character) return null;
  const sheet = character;

  async function load() {
    setBusy(true);
    try {
      const ack = await fetchRepairTargets(characterId);
      if (ack.ok && ack.data) setTargets(ack.data.targets);
      else if (!ack.ok) notifyRefusal('character', repairWorkErrorText(ack.error));
    } finally {
      setBusy(false);
    }
  }

  function loadCupFor(row: CpredRepairTargetView, upgradeId?: string) {
    const upgrade = upgradeId ? row.upgrades?.find((entry) => entry.upgradeId === upgradeId) : null;
    const loaded = loadWorkCup(
      { characterId: sheet.id, characterName: sheet.name },
      {
        kind: upgrade ? 'vehicleUpgrade' : 'repair',
        target: row.target,
        skillId: row.skillId,
        targetName: upgrade ? `${row.name} — ${upgrade.name}` : `${row.name} (${row.ownerName})`,
        ...(upgrade ? { vehicleUpgradeId: upgrade.upgradeId } : {}),
      },
      sheet.data,
      registry,
    );
    if (!loaded) notifyRefusal('character', NO_PLAN);
  }

  const key = (row: CpredRepairTargetView) =>
    row.target.kind === 'armor'
      ? `${row.target.characterId}:${row.target.armorRowId}`
      : row.target.vehicleId;

  return (
    <details
      className="team-workshop"
      onToggle={(event) => {
        if ((event.currentTarget as HTMLDetailsElement).open && targets === null) void load();
      }}
    >
      <summary>Naprawa i montaż — rzeczy drużyny</summary>
      {targets === null ? (
        <p>{busy ? 'Sprawdzam…' : ''}</p>
      ) : targets.length === 0 ? (
        <p>Drużyna nie ma nic do naprawy ani aut do ulepszenia.</p>
      ) : (
        <ul className="team-workshop-list">
          {targets.map((row) => {
            const choice = picked[key(row)] ?? '';
            const option = row.upgrades?.find((entry) => entry.upgradeId === choice);
            return (
              <li key={key(row)} data-repair-target={key(row)}>
                <span className="team-workshop-name">
                  <b>{row.name}</b> · {row.ownerName} · {row.state}
                </span>
                {row.repair ? (
                  <button
                    type="button"
                    disabled={locked}
                    title={
                      locked
                        ? `${COMBAT_LOCKED_HINT} W walce zostaje Prowizorka.`
                        : workHint(row.repair.dv, row.repair.minutes)
                    }
                    aria-label={`Napraw: ${row.name} (${row.ownerName})`}
                    onClick={() => loadCupFor(row)}
                  >
                    Napraw
                  </button>
                ) : null}
                {row.upgrades ? (
                  <span className="fleet-upgrade">
                    <select
                      value={choice}
                      aria-label={`Ulepszenie Technika: ${row.name}`}
                      onChange={(event) =>
                        setPicked((prev) => ({ ...prev, [key(row)]: event.target.value }))
                      }
                    >
                      <option value="">— ulepszenie (Moto 1) —</option>
                      {row.upgrades.map((entry) => (
                        <option
                          key={entry.upgradeId}
                          value={entry.upgradeId}
                          disabled={entry.problem !== null}
                          title={
                            entry.problem ? CPRED_TECH_UPGRADE_PROBLEMS[entry.problem] : undefined
                          }
                        >
                          {entry.name} — surowce {formatEddies(entry.cost)} ed
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={locked || !option || option.problem !== null}
                      title={
                        locked
                          ? COMBAT_LOCKED_HINT
                          : `Ulepszanie (s. 148): TECH + Naprawa pojazdów + Ulepszanie — ${workHint(CPRED_TECH_VEHICLE_UPGRADE_TASK.dv, CPRED_TECH_VEHICLE_UPGRADE_TASK.minutes)}. Surowce schodzą z portfela przy sukcesie, a jedno auto Technik ulepsza tylko raz.`
                      }
                      onClick={() => option && loadCupFor(row, option.upgradeId)}
                    >
                      Zamontuj
                    </button>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" disabled={busy} onClick={() => void load()}>
        Odśwież listę
      </button>
    </details>
  );
}
