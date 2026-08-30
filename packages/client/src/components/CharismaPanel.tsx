import { useState } from 'react';
import {
  CPRED_CHARISMA_ABILITY,
  CPRED_CHARISMA_AUDIENCES,
  CPRED_CHARISMA_AUDIENCE_LABELS,
  CPRED_CHARISMA_DV,
  CPRED_CHARISMA_NO_CROWD,
  CPRED_CHARISMA_PURPOSES,
  CPRED_CHARISMA_PURPOSE_LABELS,
  CPRED_CHARISMA_REFUSAL_DAYS,
  CPRED_CHARISMA_TIERS,
  cpredAbilityTiersUpTo,
  cpredCharismaEffect,
  cpredCharismaTierAt,
  cpredRoleAbilityRank,
  type CpredCharismaPurpose,
} from '@vtt/shared';
import { loadCharismaCup } from '../stores/rollStore.js';
import { useCharacterStore } from '../stores/characterStore.js';

/**
 * Efekt Charyzmy (etap 30d, s. 144–145).
 *
 * Panel jest trzema wierszami, bo taka jest zasada: PT ustawia **liczebność
 * publiczności** (8 / 10 / 12), a nie ranga. Ranga rozstrzyga co innego — czy
 * o daną rzecz w ogóle wolno poprosić; wiersz, którego tabela nie niesie, jest
 * więc wyszarzony zdaniem z podręcznika („To żart, prawda?"), a nie po cichu
 * przeliczany na porażkę.
 *
 * Przełącznik u góry rozdziela dwa zastosowania jednej Zdolności. Robienie
 * nowych fanów tabeli nie pyta i działa na każdym poziomie; prośba pyta.
 */
export function CharismaPanel({ characterId }: { characterId: string }) {
  const character = useCharacterStore((s) => s.characters[characterId] ?? null);
  const registry = useCharacterStore((s) => s.registry);
  const [purpose, setPurpose] = useState<CpredCharismaPurpose>('favour');

  const rank = character
    ? cpredRoleAbilityRank(character.data, registry, CPRED_CHARISMA_ABILITY)
    : null;
  if (!character || rank === null) return null;
  const tier = cpredCharismaTierAt(rank);

  return (
    <div className="awareness">
      <header className="awareness-head">
        <h4>
          {CPRED_CHARISMA_ABILITY} {rank}
        </h4>
        <p className="awareness-left">{tier ? tier.venues : 'Jeszcze nikt cię nie zna'}</p>
      </header>
      <div className="awareness-buttons">
        {CPRED_CHARISMA_PURPOSES.map((option) => (
          <button
            key={option}
            type="button"
            className={`awareness-toggle${purpose === option ? ' is-on' : ''}`}
            aria-pressed={purpose === option}
            onClick={() => setPurpose(option)}
          >
            {CPRED_CHARISMA_PURPOSE_LABELS[option]}
          </button>
        ))}
      </div>
      <ul className="awareness-list">
        {CPRED_CHARISMA_AUDIENCES.map((audience) => {
          const effect = cpredCharismaEffect(rank, audience);
          // Tylko prośba pyta tabelę: nowych fanów robi się na każdym poziomie.
          const blocked = purpose === 'favour' && effect === null ? CPRED_CHARISMA_NO_CROWD : null;
          return (
            <li key={audience} className="awareness-row backup-row">
              <span
                className="awareness-name"
                title={blocked ?? effect ?? 'Test Efektu Charyzmy na nowych fanach.'}
              >
                {CPRED_CHARISMA_AUDIENCE_LABELS[audience]}
                <small className="backup-stats"> {blocked ?? effect ?? ''}</small>
              </span>
              <span className="awareness-cost">PT {CPRED_CHARISMA_DV[audience]}</span>
              <span className="awareness-steps">
                <button
                  type="button"
                  disabled={blocked !== null}
                  title={blocked ?? `Rzuć: ${CPRED_CHARISMA_AUDIENCE_LABELS[audience]}`}
                  aria-label={`Rzuć Efekt Charyzmy: ${CPRED_CHARISMA_AUDIENCE_LABELS[audience]}`}
                  onClick={() =>
                    loadCharismaCup(
                      { characterId, characterName: character.name },
                      audience,
                      purpose,
                      character.data,
                      registry,
                    )
                  }
                >
                  Rzuć
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      <div className="awareness-extras">
        <details>
          <summary>Poziomy Efektu Charyzmy (s. 144–145)</summary>
          <ul>
            {cpredAbilityTiersUpTo(CPRED_CHARISMA_TIERS, rank).map((entry) => (
              <li key={entry.id}>
                <b>
                  {entry.min === entry.max ? entry.min : `${entry.min}–${entry.max}`} ·{' '}
                  {entry.venues}
                </b>
                <br />
                {CPRED_CHARISMA_AUDIENCES.map((audience) => (
                  <span key={audience}>
                    {CPRED_CHARISMA_AUDIENCE_LABELS[audience]}:{' '}
                    {entry.effects[audience] ?? CPRED_CHARISMA_NO_CROWD}
                    <br />
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </details>
      </div>
      <p className="awareness-hint">
        Rzut to sama ranga + 1k10 — bez Cechy i bez Umiejętności. Nieudana prośba zamyka tych fanów
        na {CPRED_CHARISMA_REFUSAL_DAYS} dni; kto jest fanem, rozstrzyga MG.
      </p>
    </div>
  );
}
