import { useMemo, useState } from 'react';
import type { CpredCareMode, CpredCriticalInjuryRow, CriticalInjuryEntry } from '@vtt/shared';
import {
  CRITICAL_INJURY_TABLE_LABELS,
  ROLE_GM,
  cpredCareOptions,
  cpredTreatmentOptions,
  describeCareOptions,
  isCriticalInjuryEntry,
} from '@vtt/shared';
import { assignCriticalInjury, updateCharacter } from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { useCompendiumStore } from '../stores/compendiumStore.js';
import { useTokenStore } from '../stores/tokenStore.js';
import { TreatInjury } from './TreatInjury.js';

/**
 * Rany figury bez karty postaci — sekcja paska bocznego (31.08).
 *
 * Statysta nosi Rany Krytyczne od 29.08 i wszystkie reguły, które je zadają —
 * gaz łzawiący, granat hukowy, broniona strefa, Celowanie w nogę — zapisują mu
 * je do profilu. Nie było natomiast **nic**, co by je pokazało: wieżyczka
 * z „Odciętą dłonią" nosiła ranę, której nikt nie umiał zdjąć inaczej niż ręką
 * w bazie, choć serwer potrafił ją leczyć od pierwszego dnia (`treatableInjuries`
 * czyta profil, `applyTreatment` pisze do niego z powrotem).
 *
 * Panel stoi w pasku figury, a nie w menu żetonu, bo to jest miejsce, w którym
 * przy stole patrzy się na ranną figurę: nad jej PW, obok jej Akcji. Formularz
 * leczenia to **ten sam** komponent, którego używa karta postaci — różnica
 * między postacią a statystą kończy się na tym, skąd wzięto listę ran.
 *
 * Ręka MG jest tu szersza niż na karcie o jedną rzecz i węższa o żadną: „nadaj
 * ranę" idzie zdarzeniem `character:injury` z adresem żetonu, więc rana wchodzi
 * z karami, dopłatą do Testu Przeżywalności i zabraną Akcją z 14e — a karta na
 * czacie daje się cofnąć jak każda inna karta obrażeń.
 */
export function FigureInjuries({
  tokenId,
  injuries,
}: {
  tokenId: string;
  injuries: readonly CpredCriticalInjuryRow[];
}) {
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const token = useTokenStore((s) => s.tokens[tokenId]);
  const character = useCharacterStore((s) =>
    token?.characterId ? (s.characters[token.characterId] ?? null) : null,
  );
  const entriesById = useCompendiumStore((s) => s.entries);
  const order = useCompendiumStore((s) => s.order);
  /** Rana i tryb, w którym otwarto przy niej formularz — jak na karcie. */
  const [treating, setTreating] = useState<{ id: string; mode: CpredCareMode } | null>(null);
  const [picked, setPicked] = useState('');

  /** Rany do nadania: obie tabele 2k6 bez tych, które figura już nosi. */
  const choices = useMemo(() => {
    const taken = new Set(injuries.map((injury) => injury.id));
    return order
      .map((id) => entriesById[id])
      .filter(
        (entry): entry is CriticalInjuryEntry =>
          entry !== undefined && isCriticalInjuryEntry(entry) && !taken.has(entry.id),
      )
      .sort((a, b) => (a.table === b.table ? a.roll - b.roll : a.table.localeCompare(b.table)));
  }, [entriesById, order, injuries]);

  /**
   * Zapis ręką MG idzie na kartę figury (etap 38a; do 38a szedł całym profilem
   * bojowym w `token:update`). Możliwy wyłącznie u MG i u właściciela figury —
   * tylko oni dostają kartę; gracz z listą ran (jadącą publicznie) leczy, ale
   * nie kasuje, i to jest dokładnie ta różnica, którą widać na guzikach niżej.
   */
  function writeInjuries(next: CpredCriticalInjuryRow[]): void {
    if (!character) return;
    void updateCharacter(character.id, { data: { criticalInjuries: next } });
  }

  const mayEdit = isGm && !!character;

  if (injuries.length === 0 && !mayEdit) return null;

  return (
    /*
      Klasa `cp-injuries` jest tu celowo: cały wygląd wiersza rany — chip
      „załatana", przekreślone kary, formularz leczenia, wiersz „nadaj ranę" —
      jest już opisany dla karty postaci i ma wyglądać tak samo w pasku. Jedna
      rana w dwóch miejscach różniąca się wyglądem to dwa razy ta sama praca
      i dwa miejsca do rozjechania się.
    */
    <section className="hud-group hud-injuries cp-injuries">
      <h3 className="hud-group-title">Rany</h3>
      {injuries.length === 0 ? (
        <p className="cp-field cp-injuries-empty">bez ran krytycznych</p>
      ) : (
        <ul className="injury-list">
          {injuries.map((injury) => (
            <li
              key={injury.id}
              className={`cp-field injury-row${injury.patched ? ' injury-row--patched' : ''}`}
            >
              <div className="injury-head">
                <span className="injury-name">{injury.name}</span>
                {injury.patched ? (
                  <span
                    className="injury-patched"
                    title={`Załatane: ${injury.patched.skill} — ${injury.patched.by}. Efekt rany milczy do końca dnia.`}
                  >
                    załatana
                    {mayEdit && (
                      <button
                        type="button"
                        className="cp-mini-button"
                        title="Minął dzień — łata puszcza, efekt rany wraca"
                        aria-label={`Zdejmij łatę z rany: ${injury.name}`}
                        onClick={() =>
                          writeInjuries(
                            injuries.map((row) => {
                              if (row.id !== injury.id) return row;
                              const { patched: _patched, ...rest } = row;
                              return rest;
                            }),
                          )
                        }
                      >
                        ⌫
                      </button>
                    )}
                  </span>
                ) : null}
                {injury.rolled ? (
                  <span className="injury-roll" title="Wynik 2k6 z tabeli ran krytycznych">
                    2k6 = {injury.rolled}
                  </span>
                ) : injury.assigned ? (
                  <span
                    className="injury-roll"
                    title="Ranę nazwał efekt albo MG — nikt nie rzucał na tabelę"
                  >
                    nadana
                  </span>
                ) : null}
                {cpredCareOptions(injury, 'quickFix').length > 0 && (
                  <button
                    type="button"
                    className="cp-mini-button"
                    disabled={injury.patched !== undefined}
                    title={
                      injury.patched
                        ? 'Ta rana jest już załatana — jej efekt milczy do końca dnia.'
                        : `Łatanie: ${describeCareOptions(cpredCareOptions(injury, 'quickFix'))}`
                    }
                    aria-label={`Załataj ranę: ${injury.name}`}
                    onClick={() =>
                      setTreating(
                        treating?.id === injury.id && treating.mode === 'quickFix'
                          ? null
                          : { id: injury.id, mode: 'quickFix' },
                      )
                    }
                  >
                    Załataj
                  </button>
                )}
                {cpredTreatmentOptions(injury).length > 0 && (
                  <button
                    type="button"
                    className="cp-mini-button"
                    title={`Leczenie: ${describeCareOptions(cpredTreatmentOptions(injury))}`}
                    aria-label={`Lecz ranę: ${injury.name}`}
                    onClick={() =>
                      setTreating(
                        treating?.id === injury.id && treating.mode === 'treatment'
                          ? null
                          : { id: injury.id, mode: 'treatment' },
                      )
                    }
                  >
                    Lecz
                  </button>
                )}
                {mayEdit && (
                  <button
                    type="button"
                    className="cp-mini-button cp-mini-button--danger"
                    title="Usuń ranę (wyleczona albo załatana)"
                    aria-label={`Usuń ranę: ${injury.name}`}
                    onClick={() => writeInjuries(injuries.filter((row) => row.id !== injury.id))}
                  >
                    ✕
                  </button>
                )}
              </div>
              <p className="injury-effect">{injury.effect}</p>
              {treating?.id === injury.id && token && (
                <TreatInjury
                  patient={{ tokenId, name: token.name }}
                  injury={injury}
                  mode={treating.mode}
                  onClose={() => setTreating(null)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {mayEdit && choices.length > 0 && (
        <div className="cp-field injury-assign">
          <select
            value={picked}
            onChange={(e) => setPicked(e.target.value)}
            aria-label="Rana krytyczna do nadania"
            title="Rana wchodzi z pełnymi karami, tak jak wylosowana. Kartę na czacie można cofnąć."
          >
            <option value="">— nadaj ranę —</option>
            {choices.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {CRITICAL_INJURY_TABLE_LABELS[entry.table]} {entry.roll}: {entry.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="cp-mini-button"
            disabled={picked === ''}
            title="Nadaje ranę bez rzutu — na czat idzie karta, którą da się cofnąć."
            onClick={() => {
              if (picked === '') return;
              assignCriticalInjury({ tokenId, injuryId: picked });
              setPicked('');
            }}
          >
            Nadaj
          </button>
        </div>
      )}
    </section>
  );
}
