import { useMemo, useState } from 'react';
import type { CpredCareMode, CpredCriticalInjuryRow } from '@vtt/shared';
import { CPRED_CARE_MODE_LABELS, ROLE_GM, cpredCareOptions, cpredCareRefusal } from '@vtt/shared';
import { loadTreatInjuryCup } from '../stores/rollStore.js';
import { useAuthStore } from '../stores/authStore.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { useTokenStore } from '../stores/tokenStore.js';

/**
 * Leczenie Rany Krytycznej (etap 30b).
 *
 * Do 30b ranę dawało się z karty tylko **skasować** — jeden ✕ bez rzutu, bez PT
 * i bez pytania, kto to robi. Tabela z s. 187 drukuje przy każdej ranie zdanie
 * w rodzaju „Ratownictwo medyczne PT 15 lub Chirurgia PT 13" i to zdanie jest
 * tu jedynym źródłem: gałęzie czyta `cpredTreatmentOptions`, więc rana wpisana
 * ręką MG działa dokładnie tak, jak drukowana.
 *
 * Formularz stoi przy ranie **pacjenta**, a nie w pasku Medyka, bo leczenie to
 * zajęcie po walce: siada się nad kartą rannego, a nie nad mapą. Kto leczy,
 * wybiera się z listy postaci, którymi ten klient może rzucać — MG widzi
 * wszystkie, gracz swoje.
 *
 * Od etapu 15 (Łatanie) ten sam formularz obsługuje **oba** zdania z tabeli:
 * `mode` mówi, które jest czytane, a różnice między nimi rozstrzyga silnik
 * (`cpredCareOptions`, `cpredCarePermanent`) — tu zmienia się wyłącznie słowo
 * na guziku i to, kogo wolno wybrać jako leczącego: łatać można samego siebie,
 * leczyć nie (s. 223).
 */
export function TreatInjury({
  patientId,
  injury,
  mode,
  onClose,
}: {
  patientId: string;
  injury: CpredCriticalInjuryRow;
  mode: CpredCareMode;
  onClose: () => void;
}) {
  const user = useAuthStore((s) => s.user);
  const characters = useCharacterStore((s) => s.characters);
  const order = useCharacterStore((s) => s.order);
  const registry = useCharacterStore((s) => s.registry);
  const tokens = useTokenStore((s) => s.tokens);

  const options = useMemo(() => cpredCareOptions(injury, mode), [injury, mode]);
  /** Figura pacjenta na scenie — to jej adres niesie rzut. */
  const patientToken = useMemo(
    () => Object.values(tokens).find((token) => token.characterId === patientId) ?? null,
    [tokens, patientId],
  );
  const healers = useMemo(
    () =>
      order
        .map((id) => characters[id])
        .filter(
          (entry): entry is NonNullable<typeof entry> =>
            entry !== undefined &&
            (user?.role === ROLE_GM || entry.ownerId === user?.id) &&
            // „Nie można leczyć samego siebie" (s. 223) — a łatać można, więc
            // pacjent wypada z listy tylko w jednym z dwóch trybów. Serwer i tak
            // odmówi (`SELF_TREATMENT`); tu chodzi o to, żeby nie kusiło.
            (mode === 'quickFix' || entry.id !== patientId),
        ),
    [order, characters, user, mode, patientId],
  );
  const [healerId, setHealerId] = useState(() => healers[0]?.id ?? '');
  const healer = healers.find((entry) => entry.id === healerId) ?? null;

  if (options.length === 0) return null;

  return (
    <div className="injury-treat">
      <label className="injury-treat-who">
        <span>{mode === 'quickFix' ? 'Łata' : 'Leczy'}</span>
        <select
          value={healerId}
          onChange={(event) => setHealerId(event.target.value)}
          aria-label={`Kto ${mode === 'quickFix' ? 'łata' : 'leczy'} tę ranę`}
        >
          {healers.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>
      </label>
      <div className="injury-treat-options">
        {options.map((option) => {
          // Ta sama funkcja, którą serwer odrzuca rzut — guzik gaśnie dokładnie
          // tam, gdzie odmowa i tak by przyszła, a jej zdanie stoi w podpowiedzi.
          const refusal = healer
            ? cpredCareRefusal(option, healer.data, registry)
            : mode === 'quickFix'
              ? 'Nie ma kim.'
              : 'Nie ma kim — samego siebie leczyć nie można.';
          const blocked = refusal ?? (patientToken ? null : 'Ta postać nie stoi na scenie.');
          return (
            <button
              key={option.skillId}
              type="button"
              className="cp-mini-button"
              disabled={blocked !== null}
              title={
                blocked ?? `${CPRED_CARE_MODE_LABELS[mode]}: ${option.name} przeciw PT ${option.dv}`
              }
              onClick={() => {
                if (!healer || !patientToken) return;
                loadTreatInjuryCup(
                  { characterId: healer.id, characterName: healer.name },
                  { tokenId: patientToken.id, name: patientToken.name },
                  { id: injury.id, name: injury.name },
                  option,
                  healer.data,
                  registry,
                  mode,
                );
                onClose();
              }}
            >
              {option.name} PT {option.dv}
            </button>
          );
        })}
      </div>
      <button type="button" className="cp-mini-button" onClick={onClose}>
        Zamknij
      </button>
    </div>
  );
}
