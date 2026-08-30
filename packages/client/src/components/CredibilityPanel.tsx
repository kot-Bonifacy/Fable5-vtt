import { useState } from 'react';
import {
  CPRED_CREDIBILITY_ABILITY,
  CPRED_CREDIBILITY_TIERS,
  CPRED_PROOF_LABELS,
  CPRED_PROOF_LEVELS,
  CPRED_RELIABILITY_DIE,
  CPRED_RUMOUR_ROLLS_PER_WEEK,
  CPRED_RUMOUR_TIERS,
  ROLE_GM,
  cpredAbilityTiersUpTo,
  cpredCredibilityTierAt,
  cpredReliabilityChance,
  cpredRoleAbilityRank,
  type CpredProofLevel,
} from '@vtt/shared';
import { loadReliabilityCup, loadRumourCup } from '../stores/rollStore.js';
import { useAuthStore } from '../stores/authStore.js';
import { useCharacterStore } from '../stores/characterStore.js';

/**
 * Wiarygodność Media (etap 30d, s. 151–153).
 *
 * Dwa rzuty i jedna drabina. **Test Rzetelności** nie jest Testem w rozumieniu
 * podręcznika: nie ma w nim Cechy, Umiejętności ani Szczęścia („W Testach
 * Rzetelności nie można wykorzystywać Szczęścia", s. 152) — ranga kupuje
 * *szansę*, a nie modyfikator, więc kość leci goła, a panel drukuje liczbę,
 * pod którą trzeba się zmieścić.
 *
 * **Pogłoski** to rzut MG i tylko MG: „przynajmniej dwa razy na tydzień MG
 * wykonuje potajemny Test twojej Wiarygodności". Guzik stoi więc pod strażą
 * roli, a karta idzie szeptem — gracz ma usłyszeć pogłoskę, a nie zobaczyć
 * kość, która jej nie przyniosła.
 */
export function CredibilityPanel({ characterId }: { characterId: string }) {
  const character = useCharacterStore((s) => s.characters[characterId] ?? null);
  const registry = useCharacterStore((s) => s.registry);
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const [proof, setProof] = useState<CpredProofLevel>('none');

  const rank = character
    ? cpredRoleAbilityRank(character.data, registry, CPRED_CREDIBILITY_ABILITY)
    : null;
  if (!character || rank === null) return null;

  const tier = cpredCredibilityTierAt(rank);
  const chance = cpredReliabilityChance(rank, proof);

  return (
    <div className="awareness">
      <header className="awareness-head">
        <h4>
          {CPRED_CREDIBILITY_ABILITY} {rank}
        </h4>
        <p className="awareness-left">
          Rzetelność: {chance} na {CPRED_RELIABILITY_DIE}
        </p>
      </header>

      <label className="haggle-opponent">
        <span>Dowody w materiale</span>
        <select
          value={proof}
          aria-label="Dowody w materiale"
          onChange={(event) => setProof(event.target.value as CpredProofLevel)}
        >
          {CPRED_PROOF_LEVELS.map((level) => (
            <option key={level} value={level}>
              {CPRED_PROOF_LABELS[level]}
            </option>
          ))}
        </select>
      </label>

      <div className="awareness-buttons">
        <button
          type="button"
          title={`Rzuć 1k10 — odbiorcy uwierzą przy wyniku ${chance} lub niższym`}
          onClick={() =>
            loadReliabilityCup(
              { characterId, characterName: character.name },
              proof,
              character.data,
              registry,
            )
          }
        >
          Publikuj
        </button>
        {isGm && (
          <button
            type="button"
            title="Potajemny Test Pogłosek — karta idzie szeptem do MG"
            onClick={() =>
              loadRumourCup(
                { characterId, characterName: character.name },
                character.data,
                registry,
              )
            }
          >
            Pogłoski
          </button>
        )}
      </div>

      <div className="awareness-extras">
        {tier && (
          <p className="awareness-derived">
            Dostęp: {tier.access}
            <br />
            Zasięgi: {tier.audience}
            <br />
            Efekt: {tier.effect}
          </p>
        )}
        <details>
          <summary>Poziomy Wiarygodności (s. 152–153)</summary>
          <ul>
            {cpredAbilityTiersUpTo(CPRED_CREDIBILITY_TIERS, rank).map((entry) => (
              <li key={entry.id}>
                <b>{entry.min === entry.max ? entry.min : `${entry.min}–${entry.max}`}</b> —
                Rzetelność {entry.reliability} na 10
                <br />
                {entry.audience}
                <br />
                {entry.effect}
              </li>
            ))}
          </ul>
        </details>
        <details>
          <summary>Pogłoski — progi rzutu i aktywnego szukania (s. 151)</summary>
          <ul>
            {CPRED_RUMOUR_TIERS.map((entry) => (
              <li key={entry.id}>
                <b>{entry.name}</b> — Zasłyszane PT {entry.passive} · Aktywne PT {entry.active}
                <br />
                {entry.description}
              </li>
            ))}
          </ul>
          <p>
            MG rzuca co najmniej {CPRED_RUMOUR_ROLLS_PER_WEEK} razy w tygodniu. Aktywne szukanie to
            zwykły Test Umiejętności (Przeszukiwanie baz danych, Konwersacja, Przesłuchiwanie) —
            ostateczne PT ustala MG.
          </p>
        </details>
      </div>
      <p className="awareness-hint">
        Rzetelność rośnie o 1 za rzetelny, zrozumiały dowód i o 2 za więcej niż cztery niepodważalne
        — premie kumulują się. Szczęścia użyć nie wolno.
      </p>
    </div>
  );
}
