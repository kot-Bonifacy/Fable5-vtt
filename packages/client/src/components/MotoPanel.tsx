import {
  CPRED_FLEET_KINDS,
  CPRED_FLEET_KIND_LABELS,
  CPRED_FLEET_NAME_MAX,
  CPRED_MOTO_ABILITY,
  CPRED_MOTO_ELDER_LEVEL,
  CPRED_MOTO_FLEET,
  CPRED_MOTO_REPAIR_FEE,
  CPRED_MOTO_SKILL_IDS,
  CPRED_MOTO_UPGRADE_FEE,
  cpredFleetProblem,
  cpredFleetTierAt,
  cpredRoleAbilityRank,
  readCpredFleet,
  type CpredFleetKind,
  type CpredFleetRow,
} from '@vtt/shared';
import { queueCharacterSave } from '../socket.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { NumberStepper } from './NumberStepper.js';

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
 * Czym pojazd **jest**, VTT nie wie i wiedzieć nie musi: projekt nie ma
 * pojazdów, więc wiersz to nazwa, kategoria i linijka notatek. Serwer sprawdza
 * dokładnie te dwie liczby, które sprawdza panel.
 */
export function MotoPanel({ characterId }: { characterId: string }) {
  const character = useCharacterStore((s) => s.characters[characterId] ?? null);
  const registry = useCharacterStore((s) => s.registry);

  const rank = character
    ? cpredRoleAbilityRank(character.data, registry, CPRED_MOTO_ABILITY)
    : null;
  if (!character || rank === null) return null;

  const fleet = readCpredFleet(character.data.fleet);
  const left = Math.max(0, rank - fleet.length);
  const skills = CPRED_MOTO_SKILL_IDS.map(
    (id) => registry.skills.find((skill) => skill.id === id)?.name,
  ).filter((name): name is string => name !== undefined);

  function save(rows: CpredFleetRow[]): void {
    // Ta sama funkcja, którą serwer odrzuca łatę — guzik gaśnie tam, gdzie
    // odmowa i tak by przyszła.
    if (cpredFleetProblem(rows, rank) !== null) return;
    queueCharacterSave(characterId, { data: { fleet: rows } });
  }

  function patchRow(id: string, patch: Partial<CpredFleetRow>): void {
    save(fleet.map((row) => (row.id === id ? { ...row, ...patch } : row)));
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
        {fleet.map((row) => (
          <li key={row.id} className="awareness-row fleet-row">
            <select
              value={row.kind}
              aria-label={`Rodzaj wpisu: ${row.name}`}
              onChange={(event) => patchRow(row.id, { kind: event.target.value as CpredFleetKind })}
            >
              {CPRED_FLEET_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {CPRED_FLEET_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
            <input
              type="text"
              maxLength={CPRED_FLEET_NAME_MAX}
              value={row.name}
              placeholder="Supermotocykl"
              aria-label="Nazwa wpisu Taboru"
              onChange={(event) => patchRow(row.id, { name: event.target.value })}
            />
            <NumberStepper
              min={1}
              max={rank}
              value={Math.min(row.level, rank)}
              title="Kategoria wpisu — nie wyżej niż poziom Moto"
              label={`Kategoria: ${row.name}`}
              onChange={(value) => patchRow(row.id, { level: value })}
            />
            <button
              type="button"
              className="cp-mini-button"
              title={`Usuń z Taboru: ${row.name}`}
              aria-label={`Usuń z Taboru: ${row.name}`}
              onClick={() => save(fleet.filter((entry) => entry.id !== row.id))}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <div className="awareness-buttons">
        <button
          type="button"
          disabled={left === 0}
          title={
            left === 0
              ? 'Każdy poziom Moto to jeden wpis — na kolejny trzeba awansu.'
              : 'Dołóż pojazd albo ulepszenie z awansu'
          }
          onClick={() =>
            save([
              ...fleet,
              {
                id: Math.random().toString(36).slice(2, 10),
                kind: 'vehicle',
                name: 'Nowy wpis',
                level: rank,
                notes: '',
              },
            ])
          }
        >
          Dołóż wpis
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
