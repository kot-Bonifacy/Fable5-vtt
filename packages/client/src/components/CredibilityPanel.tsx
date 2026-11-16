import { useState } from 'react';
import {
  CPRED_CREDIBILITY_ABILITY,
  CPRED_CREDIBILITY_TIERS,
  CPRED_PROOF_LABELS,
  CPRED_PROOF_LEVELS,
  CPRED_PUBLICATION_PROBLEMS,
  CPRED_PUBLICATION_TOPIC_MAX,
  CPRED_RELIABILITY_DIE,
  CPRED_RUMOUR_ROLLS_PER_WEEK,
  CPRED_RUMOUR_TIERS,
  ROLE_GM,
  cpredAbilityTiersUpTo,
  cpredCredibilityTierAt,
  cpredReliabilityChance,
  cpredRoleAbilityRank,
  cpredRumourRollsThisWeek,
  cpredRumourSearchSkills,
  cpredTopicPublished,
  formatGameDate,
  type CpredProofLevel,
} from '@vtt/shared';
import { callCheck, removePublication, requestCheck } from '../socket.js';
import { notifyInfo } from '../notices.js';
import { useGameTimeStore } from '../stores/gameTimeStore.js';
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
 *
 * Od 71f: publikacja ma **temat** i zostaje w rejestrze na karcie (temat raz
 * puszczony wraca tylko „z nowymi informacjami”), MG widzi **licznik Pogłosek
 * w tygodniu** kalendarza, a „Szukaj pogłosek” wystawia Test z PT z tabeli
 * aktywnego szukania — MG wezwaniem, gracz prośbą o Test.
 */
export function CredibilityPanel({ characterId }: { characterId: string }) {
  const character = useCharacterStore((s) => s.characters[characterId] ?? null);
  const registry = useCharacterStore((s) => s.registry);
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const now = useGameTimeStore((s) => s.minutes);
  const [proof, setProof] = useState<CpredProofLevel>('none');
  const [topic, setTopic] = useState('');
  const [newInfo, setNewInfo] = useState(false);
  const [searchSkill, setSearchSkill] = useState('');
  const [searchTier, setSearchTier] = useState(CPRED_RUMOUR_TIERS[0]!.id);

  const rank = character
    ? cpredRoleAbilityRank(character.data, registry, CPRED_CREDIBILITY_ABILITY)
    : null;
  if (!character || rank === null) return null;

  const tier = cpredCredibilityTierAt(rank);
  const chance = cpredReliabilityChance(rank, proof);
  const publications = character.data.publications ?? [];
  const repeated = cpredTopicPublished(publications, topic);
  const publishProblem =
    topic.trim().length === 0
      ? CPRED_PUBLICATION_PROBLEMS.NO_TOPIC
      : repeated && !newInfo
        ? CPRED_PUBLICATION_PROBLEMS.ALREADY_PUBLISHED
        : null;
  const rumourRolls = cpredRumourRollsThisWeek(character.data.rumourWeek ?? null, now);
  const searchSkills = cpredRumourSearchSkills(registry.skills);
  const skillId = searchSkills.some((skill) => skill.id === searchSkill)
    ? searchSkill
    : (searchSkills[0]?.id ?? '');
  const rumour =
    CPRED_RUMOUR_TIERS.find((entry) => entry.id === searchTier) ?? CPRED_RUMOUR_TIERS[0]!;

  async function searchRumours(): Promise<void> {
    if (!skillId) return;
    const request = { kind: 'skill' as const, skillId, modifier: 0, luckSpent: 0 };
    const what = `Szukanie pogłosek: ${rumour.name.toLowerCase()} (PT ${rumour.active} z tabeli, s. 151)`;
    const ack = isGm
      ? await callCheck({
          characterId,
          request,
          dv: rumour.active,
          prompt: what,
          visibility: 'public',
        })
      : await requestCheck({ characterId, request, reason: what });
    if (ack.ok) {
      notifyInfo(isGm ? 'Wezwanie do Testu stoi na czacie.' : 'Prośba o Test poszła do MG.', {
        title: 'Szukaj pogłosek',
        topic: 'check',
      });
    }
  }

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

      <label className="haggle-opponent role-note">
        <span>Temat materiału</span>
        <input
          type="text"
          className="haggle-opponent-label"
          value={topic}
          maxLength={CPRED_PUBLICATION_TOPIC_MAX}
          placeholder="o czym publikujesz"
          aria-label="Temat materiału"
          onChange={(event) => setTopic(event.target.value)}
        />
      </label>
      {repeated && (
        <label className="haggle-opponent role-note" data-testid="publication-again">
          <span>Ten temat już poszedł — mam nowe informacje</span>
          <input
            type="checkbox"
            checked={newInfo}
            aria-label="Mam nowe informacje"
            onChange={(event) => setNewInfo(event.target.checked)}
          />
        </label>
      )}

      <div className="awareness-buttons">
        <button
          type="button"
          disabled={publishProblem !== null}
          title={publishProblem ?? `Rzuć 1k10 — odbiorcy uwierzą przy wyniku ${chance} lub niższym`}
          onClick={() => {
            loadReliabilityCup(
              { characterId, characterName: character.name },
              proof,
              character.data,
              registry,
              topic,
              repeated && newInfo,
            );
            setNewInfo(false);
          }}
        >
          Publikuj
        </button>
        {isGm && (
          <button
            type="button"
            data-testid="rumour-roll"
            title={`Potajemny Test Pogłosek — karta idzie szeptem do MG. W tym tygodniu: ${rumourRolls} z ${CPRED_RUMOUR_ROLLS_PER_WEEK}`}
            onClick={() =>
              loadRumourCup(
                { characterId, characterName: character.name },
                character.data,
                registry,
              )
            }
          >
            Pogłoski {rumourRolls}/{CPRED_RUMOUR_ROLLS_PER_WEEK}
          </button>
        )}
      </div>

      {searchSkills.length > 0 && (
        <div className="haggle-opponent role-note" data-testid="rumour-search">
          <select
            value={skillId}
            aria-label="Umiejętność szukania pogłosek"
            onChange={(event) => setSearchSkill(event.target.value)}
          >
            {searchSkills.map((skill) => (
              <option key={skill.id} value={skill.id}>
                {skill.name}
              </option>
            ))}
          </select>
          <select
            value={rumour.id}
            aria-label="Jakiej pogłoski szukasz"
            onChange={(event) => setSearchTier(event.target.value)}
          >
            {CPRED_RUMOUR_TIERS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name} · PT {entry.active}
              </option>
            ))}
          </select>
          <button
            type="button"
            title={
              isGm
                ? `Wezwij do Testu z PT ${rumour.active} (tabela aktywnego szukania, s. 151)`
                : 'Poproś MG o Test — PT z tabeli aktywnego szukania, ostateczne ustala MG'
            }
            onClick={() => void searchRumours()}
          >
            Szukaj pogłosek
          </button>
        </div>
      )}

      {publications.length > 0 && (
        <details className="role-register" data-testid="publications">
          <summary>Publikacje ({publications.length})</summary>
          <ul className="awareness-list">
            {[...publications].reverse().map((entry) => (
              <li key={entry.id} className="awareness-row backup-row">
                <span className="awareness-name" title={CPRED_PROOF_LABELS[entry.proof]}>
                  {entry.topic}
                  <small className="backup-stats">
                    {' '}
                    {formatGameDate(entry.atMinute)} · {entry.believed ? 'uwierzyli' : 'nie kupili'}
                    {entry.again ? ' · nowe informacje' : ''}
                  </small>
                </span>
                {isGm && (
                  <span className="awareness-steps">
                    <button
                      type="button"
                      className="cp-mini-button"
                      title={`Usuń z rejestru: ${entry.topic}`}
                      aria-label={`Usuń publikację: ${entry.topic}`}
                      onClick={() => void removePublication(characterId, entry.id)}
                    >
                      ✕
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

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
