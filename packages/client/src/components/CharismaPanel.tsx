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
  CPRED_FANS_PROBLEMS,
  CPRED_FAN_NAME_MAX,
  CPRED_FAN_NOTE_MAX,
  ROLE_GM,
  cpredAbilityTiersUpTo,
  cpredCharismaEffect,
  cpredCharismaTierAt,
  cpredFanGroupBlocked,
  cpredRoleAbilityRank,
  formatGameDate,
  type CpredCharismaAudience,
  type CpredCharismaPurpose,
} from '@vtt/shared';
import { manageFans } from '../socket.js';
import { loadCharismaCup } from '../stores/rollStore.js';
import { useAuthStore } from '../stores/authStore.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { useCombatLocked } from '../stores/combatStore.js';
import { useGameTimeStore } from '../stores/gameTimeStore.js';

/**
 * Efekt Charyzmy (etap 30d, s. 144–145; fani jako stan gry od 71f).
 *
 * PT ustawia **liczebność publiczności** (8 / 10 / 12), a nie ranga. Ranga
 * rozstrzyga co innego — czy o daną rzecz w ogóle wolno poprosić.
 *
 * Przełącznik u góry rozdziela dwa zastosowania jednej Zdolności:
 *
 *  - **nowi fani** — trzy wiersze wielkości publiczności; udany Test dopisuje
 *    grupę na kartę (nazwę można wpisać przed rzutem). Nie w walce (P2);
 *  - **prośba** — lista grup fanów z karty. Prosi się konkretną grupę; po
 *    odmowie wiersz pokazuje termin, do którego ci fani nie pomogą, a blokadę
 *    przed czasem zdejmuje MG. Kto jest fanem bez rzutu, wpisuje MG.
 */
export function CharismaPanel({ characterId }: { characterId: string }) {
  const character = useCharacterStore((s) => s.characters[characterId] ?? null);
  const registry = useCharacterStore((s) => s.registry);
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const now = useGameTimeStore((s) => s.minutes);
  const inCombat = useCombatLocked();
  const [purpose, setPurpose] = useState<CpredCharismaPurpose>('favour');
  const [note, setNote] = useState('');
  const [newName, setNewName] = useState('');
  const [newAudience, setNewAudience] = useState<CpredCharismaAudience>('single');

  const rank = character
    ? cpredRoleAbilityRank(character.data, registry, CPRED_CHARISMA_ABILITY)
    : null;
  if (!character || rank === null) return null;
  const tier = cpredCharismaTierAt(rank);
  const fans = character.data.fans ?? [];
  const who = { characterId, characterName: character.name };

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
            onClick={() => {
              setPurpose(option);
              setNote('');
            }}
          >
            {CPRED_CHARISMA_PURPOSE_LABELS[option]}
          </button>
        ))}
      </div>

      <label className="haggle-opponent role-note">
        <span>{purpose === 'fans' ? 'Kogo zdobywasz' : 'O co prosisz'}</span>
        <input
          type="text"
          className="haggle-opponent-label"
          value={note}
          maxLength={purpose === 'fans' ? CPRED_FAN_NAME_MAX : CPRED_FAN_NOTE_MAX}
          placeholder={purpose === 'fans' ? 'nazwa grupy (opcjonalnie)' : 'opcjonalnie'}
          aria-label={purpose === 'fans' ? 'Nazwa nowej grupy fanów' : 'O co prosisz fanów'}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>

      {purpose === 'fans' ? (
        <ul className="awareness-list">
          {CPRED_CHARISMA_AUDIENCES.map((audience) => (
            <li key={audience} className="awareness-row backup-row">
              <span className="awareness-name" title="Test Efektu Charyzmy na nowych fanach.">
                {CPRED_CHARISMA_AUDIENCE_LABELS[audience]}
              </span>
              <span className="awareness-cost">PT {CPRED_CHARISMA_DV[audience]}</span>
              <span className="awareness-steps">
                <button
                  type="button"
                  disabled={inCombat}
                  title={
                    inCombat
                      ? CPRED_FANS_PROBLEMS.FANS_IN_COMBAT
                      : `Rzuć: ${CPRED_CHARISMA_AUDIENCE_LABELS[audience]} — udany Test dopisze grupę na kartę`
                  }
                  aria-label={`Rzuć Efekt Charyzmy: ${CPRED_CHARISMA_AUDIENCE_LABELS[audience]}`}
                  onClick={() =>
                    loadCharismaCup(who, audience, 'fans', character.data, registry, { note })
                  }
                >
                  Rzuć
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : fans.length === 0 ? (
        <p className="awareness-hint" data-testid="fans-empty">
          Nie masz jeszcze fanów na karcie — zdobądź ich („{CPRED_CHARISMA_PURPOSE_LABELS.fans}”)
          albo poproś MG o wpis.
        </p>
      ) : (
        <ul className="awareness-list" data-testid="fans-list">
          {fans.map((group) => {
            const effect = cpredCharismaEffect(rank, group.audience);
            const blocked = cpredFanGroupBlocked(group, now);
            const refusal = blocked
              ? `Odmówili — do ${formatGameDate(group.blockedUntilMinute!)}` +
                (group.blockedWhat ? `: ${group.blockedWhat}` : '')
              : null;
            const problem = effect === null ? CPRED_CHARISMA_NO_CROWD : refusal;
            return (
              <li key={group.id} className="awareness-row backup-row">
                <span className="awareness-name" title={problem ?? effect ?? ''}>
                  {group.name}
                  <small className="backup-stats">
                    {' '}
                    {CPRED_CHARISMA_AUDIENCE_LABELS[group.audience]} · {problem ?? effect}
                  </small>
                </span>
                <span className="awareness-cost">PT {CPRED_CHARISMA_DV[group.audience]}</span>
                <span className="awareness-steps">
                  <button
                    type="button"
                    disabled={problem !== null}
                    title={problem ?? `Poproś: ${group.name}`}
                    aria-label={`Rzuć Efekt Charyzmy: ${group.name}`}
                    onClick={() =>
                      loadCharismaCup(who, group.audience, 'favour', character.data, registry, {
                        fanGroupId: group.id,
                        note,
                      })
                    }
                  >
                    Rzuć
                  </button>
                  {isGm && blocked && (
                    <button
                      type="button"
                      title="Zdejmij blokadę — następna prośba to inna sprawa"
                      aria-label={`Zdejmij blokadę: ${group.name}`}
                      onClick={() =>
                        void manageFans(characterId, { action: 'unblock', groupId: group.id })
                      }
                    >
                      Odblokuj
                    </button>
                  )}
                  {isGm && (
                    <button
                      type="button"
                      className="cp-mini-button"
                      title={`Usuń grupę fanów: ${group.name}`}
                      aria-label={`Usuń grupę fanów: ${group.name}`}
                      onClick={() =>
                        void manageFans(characterId, { action: 'remove', groupId: group.id })
                      }
                    >
                      ✕
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {isGm && (
        <div className="haggle-opponent role-note">
          <input
            type="text"
            className="haggle-opponent-label"
            value={newName}
            maxLength={CPRED_FAN_NAME_MAX}
            placeholder="kto już jest fanem"
            aria-label="Nazwa grupy fanów od MG"
            onChange={(event) => setNewName(event.target.value)}
          />
          <select
            value={newAudience}
            aria-label="Wielkość grupy fanów"
            onChange={(event) => setNewAudience(event.target.value as CpredCharismaAudience)}
          >
            {CPRED_CHARISMA_AUDIENCES.map((audience) => (
              <option key={audience} value={audience}>
                {CPRED_CHARISMA_AUDIENCE_LABELS[audience]}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={newName.trim().length === 0}
            title="Wpisz grupę fanów na kartę bez rzutu (s. 144: rozstrzyga MG)"
            onClick={() =>
              void manageFans(characterId, {
                action: 'add',
                name: newName,
                audience: newAudience,
              }).then((ok) => {
                if (ok) setNewName('');
              })
            }
          >
            Dodaj fanów
          </button>
        </div>
      )}

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
