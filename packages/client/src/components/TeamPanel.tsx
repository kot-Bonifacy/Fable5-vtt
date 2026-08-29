import { useState } from 'react';
import {
  CPRED_LOYALTY_CHANGES,
  CPRED_TEAM_PROFESSIONS,
  CPRED_TEAMWORK_ABILITY,
  cpredLoyaltyTreacherous,
  cpredRoleAbilityRank,
  cpredTeamProfession,
  cpredTeamSlots,
  cpredTeamworkPerks,
} from '@vtt/shared';
import { changeTeamLoyalty, hireTeamMember } from '../socket.js';
import { useCharacterStore } from '../stores/characterStore.js';

/**
 * Zespół Korpo (etap 30c, s. 153–157).
 *
 * Panel jest listą etatów, nie listą Specjalizacji: „Poczynając od 3. poziomu
 * Pracy Zespołowej, Korpo otrzymuje do pomocy członka zespołu. Na poziomach 5.
 * i 9. […] po dodatkowym pracowniku." Wolne etaty pokazują pięć zawodów, zajęte
 * pokazują człowieka i jego Lojalność.
 *
 * Lojalność siedzi tutaj, a nie na karcie pracownika, bo to cecha **układu**,
 * nie osoby: ten sam ochroniarz u innego Korpo zaczyna od nowa na 1k6+1.
 * Wszystko, co ją zmienia, jedzie osobnym zdarzeniem — Test rzuca kością, a
 * tabela zysków i strat ma podręcznikowe wartości, więc żadna z tych rzeczy nie
 * jest polem, które da się wpisać ręką.
 */
export function TeamPanel({ characterId }: { characterId: string }) {
  const character = useCharacterStore((s) => s.characters[characterId] ?? null);
  const characters = useCharacterStore((s) => s.characters);
  const registry = useCharacterStore((s) => s.registry);
  const [hiring, setHiring] = useState<{ professionId: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [openMember, setOpenMember] = useState<string | null>(null);

  const rank = character
    ? cpredRoleAbilityRank(character.data, registry, CPRED_TEAMWORK_ABILITY)
    : null;
  if (!character || rank === null) return null;

  const team = character.data.team;
  const slots = cpredTeamSlots(rank);
  const perks = cpredTeamworkPerks(rank);
  const free = Math.max(0, slots - team.length);

  async function hire(): Promise<void> {
    if (!hiring || hiring.name.trim().length === 0) return;
    setBusy(true);
    const ok = await hireTeamMember(characterId, hiring.professionId, hiring.name.trim());
    setBusy(false);
    if (ok) setHiring(null);
  }

  return (
    <div className="awareness">
      <header className="awareness-head">
        <h4>Praca Zespołowa {rank}</h4>
        <p className={free === 0 ? 'awareness-left awareness-left--empty' : 'awareness-left'}>
          {slots === 0
            ? 'Pierwszy pracownik dochodzi na 3. poziomie'
            : free === 0
              ? `Zespół w komplecie: ${team.length} z ${slots}`
              : `Wolne etaty: ${free} z ${slots}`}
        </p>
      </header>

      <ul className="awareness-list">
        {team.map((member) => {
          const profession = cpredTeamProfession(member.professionId);
          const sheet = characters[member.characterId] ?? null;
          const open = openMember === member.characterId;
          return (
            <li key={member.characterId} className="awareness-row team-row">
              <span className="awareness-name" title={profession?.duty ?? ''}>
                {sheet?.name ?? 'Pracownik'}
                <small className="backup-stats"> {profession?.name ?? member.professionId}</small>
              </span>
              <span
                className="awareness-value"
                title={
                  cpredLoyaltyTreacherous(member.loyalty)
                    ? 'Lojalność 0 lub mniej — będzie czynnie starał się zdradzić.'
                    : `Test Lojalności udaje się na 1k6 mniejsze niż ${member.loyalty}.`
                }
              >
                Lojalność {member.loyalty}
              </span>
              <span className="awareness-steps">
                <button
                  type="button"
                  onClick={() =>
                    void changeTeamLoyalty(characterId, member.characterId, { test: true })
                  }
                  title="Test Lojalności: MG rzuca 1k6 przeciw Lojalności"
                  aria-label={`Test Lojalności: ${sheet?.name ?? 'pracownik'}`}
                >
                  Test
                </button>
                <button
                  type="button"
                  onClick={() => setOpenMember(open ? null : member.characterId)}
                  title="Zmień Lojalność wedle tabeli z s. 154"
                  aria-label={`Zmień Lojalność: ${sheet?.name ?? 'pracownik'}`}
                >
                  {open ? '−' : '+'}
                </button>
              </span>
              {open && (
                <ul className="team-loyalty">
                  {CPRED_LOYALTY_CHANGES.map((change) => (
                    <li key={change.id}>
                      <button
                        type="button"
                        onClick={() =>
                          void changeTeamLoyalty(characterId, member.characterId, {
                            changeId: change.id,
                          })
                        }
                        title={change.text}
                      >
                        <span className={change.value > 0 ? 'team-gain' : 'team-loss'}>
                          {change.value > 0 ? `+${change.value}` : change.value}
                        </span>{' '}
                        {change.text}
                      </button>
                    </li>
                  ))}
                  <li className="team-loyalty-tail">
                    <button
                      type="button"
                      onClick={() =>
                        void changeTeamLoyalty(characterId, member.characterId, {
                          endSession: true,
                        })
                      }
                      title="Koniec sesji: Lojalność powyżej 10 spada do 10"
                    >
                      Koniec sesji
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void changeTeamLoyalty(characterId, member.characterId, { dismiss: true })
                      }
                      title="Zdejmij z zespołu — karta pracownika zostaje"
                    >
                      Zwolnij
                    </button>
                  </li>
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {free > 0 &&
        (hiring ? (
          <div className="team-hire">
            <select
              value={hiring.professionId}
              onChange={(e) => setHiring({ ...hiring, professionId: e.target.value })}
              aria-label="Zawód pracownika"
            >
              {CPRED_TEAM_PROFESSIONS.map((profession) => (
                <option key={profession.id} value={profession.id}>
                  {profession.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              maxLength={64}
              value={hiring.name}
              placeholder="Imię i nazwisko"
              onChange={(e) => setHiring({ ...hiring, name: e.target.value })}
              aria-label="Imię pracownika"
            />
            <button
              type="button"
              onClick={() => void hire()}
              disabled={busy || hiring.name.trim().length === 0}
            >
              {busy ? 'HR szuka…' : 'Zatrudnij'}
            </button>
            <button type="button" onClick={() => setHiring(null)}>
              Anuluj
            </button>
          </div>
        ) : (
          <div className="awareness-buttons">
            <button
              type="button"
              onClick={() => setHiring({ professionId: CPRED_TEAM_PROFESSIONS[0]!.id, name: '' })}
            >
              Poproś HR o pracownika
            </button>
          </div>
        ))}

      <ul className="team-perks">
        {perks.map((perk) => (
          <li key={perk.level} title={perk.text}>
            <b>{perk.level}.</b> {perk.name}
          </li>
        ))}
      </ul>
      <p className="awareness-hint">
        Cechy pracownika losuje HR (1k6 w tabeli zawodu), a Lojalność startuje na 1k6+1. Test
        Lojalności udaje się, gdy 1k6 wypadnie <b>mniej</b> niż Lojalność, więc przy 1 nie udaje się
        nigdy. Cyborgizacje pakietu są już wliczone w Cechy — Empatii nie obniżamy (s. 154).
      </p>
    </div>
  );
}
