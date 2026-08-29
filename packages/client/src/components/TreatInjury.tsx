import { useMemo, useState } from 'react';
import type { CpredCriticalInjuryRow } from '@vtt/shared';
import { ROLE_GM, cpredCareRefusal, cpredTreatmentOptions } from '@vtt/shared';
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
 */
export function TreatInjury({
  patientId,
  injury,
  onClose,
}: {
  patientId: string;
  injury: CpredCriticalInjuryRow;
  onClose: () => void;
}) {
  const user = useAuthStore((s) => s.user);
  const characters = useCharacterStore((s) => s.characters);
  const order = useCharacterStore((s) => s.order);
  const registry = useCharacterStore((s) => s.registry);
  const tokens = useTokenStore((s) => s.tokens);

  const options = useMemo(() => cpredTreatmentOptions(injury), [injury]);
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
            entry !== undefined && (user?.role === ROLE_GM || entry.ownerId === user?.id),
        ),
    [order, characters, user],
  );
  const [healerId, setHealerId] = useState(() => healers[0]?.id ?? '');
  const healer = healers.find((entry) => entry.id === healerId) ?? null;

  if (options.length === 0) return null;

  return (
    <div className="injury-treat">
      <label className="injury-treat-who">
        <span>Leczy</span>
        <select
          value={healerId}
          onChange={(event) => setHealerId(event.target.value)}
          aria-label="Kto leczy tę ranę"
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
          const refusal = healer ? cpredCareRefusal(option, healer.data, registry) : 'Nie ma kim.';
          const blocked = refusal ?? (patientToken ? null : 'Ta postać nie stoi na scenie.');
          return (
            <button
              key={option.skillId}
              type="button"
              className="cp-mini-button"
              disabled={blocked !== null}
              title={blocked ?? `Rzuć: ${option.name} przeciw PT ${option.dv}`}
              onClick={() => {
                if (!healer || !patientToken) return;
                loadTreatInjuryCup(
                  { characterId: healer.id, characterName: healer.name },
                  { tokenId: patientToken.id, name: patientToken.name },
                  { id: injury.id, name: injury.name },
                  option,
                  healer.data,
                  registry,
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
