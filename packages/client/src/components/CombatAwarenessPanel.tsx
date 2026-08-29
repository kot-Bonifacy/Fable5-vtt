import { useEffect, useMemo, useState } from 'react';
import type { CpredCombatAwareness, CpredCombatAwarenessId } from '@vtt/shared';
import {
  CPRED_COMBAT_AWARENESS,
  CPRED_COMBAT_AWARENESS_ABILITY,
  cpredCombatAwarenessProblem,
  cpredCombatAwarenessSpent,
  cpredCombatAwarenessValue,
  cpredRoleAbilityRank,
  readCpredCombatAwareness,
} from '@vtt/shared';
import { combatAwarenessErrorText, saveCombatAwareness } from '../socket.js';
import { useCharacterStore } from '../stores/characterStore.js';

/**
 * Rozdzielanie punktów Zmysłu Walki (etap 30a, s. 146).
 *
 * Jeden komponent, dwa domy — karta postaci i pasek akcji nad mapą — bo to ta
 * sama decyzja podejmowana w dwóch momentach gry. Kopia znaczyłaby dwie
 * odpowiedzi na pytanie „ile kosztuje Precyzyjny atak 2", a rotowałaby ta,
 * na którą nikt nie patrzy.
 *
 * Panel niczego nie rozstrzyga sam: progi kosztów i walidację bierze z
 * `shared`, dokładnie te same, którymi serwer odrzuca zapis. Guzik „+" jest
 * wyszarzony wtedy i tylko wtedy, gdy `cpredCombatAwarenessProblem` odmówiłby
 * tego przydziału.
 */
export function CombatAwarenessPanel({
  characterId,
  tokenId,
  onDone,
}: {
  characterId: string;
  /**
   * Figura, która płaci Akcję, gdy trwa walka. Pominięta na karcie postaci
   * otwartej poza stołem — wtedy nie ma czym płacić i nie ma za co.
   */
  tokenId?: string;
  onDone?: () => void;
}) {
  const character = useCharacterStore((s) => s.characters[characterId] ?? null);
  const registry = useCharacterStore((s) => s.registry);
  const stored = useMemo(
    () => readCpredCombatAwareness(character?.data.combatAwareness ?? {}),
    [character?.data.combatAwareness],
  );
  const rank = character
    ? cpredRoleAbilityRank(character.data, registry, CPRED_COMBAT_AWARENESS_ABILITY)
    : null;

  const [draft, setDraft] = useState<CpredCombatAwareness>(stored);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Zapis cudzą ręką (MG poprawia kartę, gracz odkłada punkty w innym oknie)
  // ma wygrać z nietkniętym szkicem — ale nie z szkicem, przy którym ktoś stoi.
  useEffect(() => {
    setDraft(stored);
  }, [stored]);

  if (!character || rank === null) return null;

  const spent = cpredCombatAwarenessSpent(draft);
  const left = rank - spent;
  const dirty = JSON.stringify(draft) !== JSON.stringify(stored);

  /** Kolejny legalny próg tej zdolności w górę albo w dół; null = nie ma. */
  function step(id: CpredCombatAwarenessId, direction: 1 | -1): number | null {
    const costs = CPRED_COMBAT_AWARENESS.find((entry) => entry.id === id)!.costs;
    const current = draft[id] ?? 0;
    if (direction === -1) {
      const lower = costs.filter((cost) => cost < current);
      return lower.length > 0 ? lower[lower.length - 1]! : current > 0 ? 0 : null;
    }
    return costs.find((cost) => cost > current) ?? null;
  }

  function withPoints(id: CpredCombatAwarenessId, points: number): CpredCombatAwareness {
    const next = { ...draft };
    if (points > 0) next[id] = points;
    else delete next[id];
    return next;
  }

  /** Czemu ten krok jest niemożliwy, albo null. */
  function refusal(id: CpredCombatAwarenessId, direction: 1 | -1): string | null {
    const points = step(id, direction);
    if (points === null) return direction === 1 ? 'Ta zdolność jest już na maksimum.' : null;
    const problem = cpredCombatAwarenessProblem(withPoints(id, points), rank);
    if (problem === 'NOT_ENOUGH_POINTS') {
      return `Brakuje punktów — ten próg kosztuje ${points}, a masz wolne ${left}.`;
    }
    return problem === null ? null : 'Ten próg jest poza zasięgiem.';
  }

  function bump(id: CpredCombatAwarenessId, direction: 1 | -1): void {
    const points = step(id, direction);
    if (points === null) return;
    const next = withPoints(id, points);
    if (cpredCombatAwarenessProblem(next, rank) !== null) return;
    setError(null);
    setDraft(next);
  }

  async function save(): Promise<void> {
    setSaving(true);
    setError(null);
    const ack = await saveCombatAwareness(characterId, draft as Record<string, number>, tokenId);
    setSaving(false);
    if (!ack.ok) {
      setError(combatAwarenessErrorText(ack.error));
      return;
    }
    onDone?.();
  }

  return (
    <div className="awareness">
      <header className="awareness-head">
        <h4>Zmysł Walki {rank}</h4>
        <p className={left === 0 ? 'awareness-left awareness-left--empty' : 'awareness-left'}>
          {left === 0 ? 'Wszystkie punkty rozdzielone' : `Wolne punkty: ${left} z ${rank}`}
        </p>
      </header>
      <ul className="awareness-list">
        {CPRED_COMBAT_AWARENESS.map((entry) => {
          const points = draft[entry.id] ?? 0;
          const value = cpredCombatAwarenessValue(entry.id, points);
          const up = refusal(entry.id, 1);
          const down = step(entry.id, -1) === null;
          return (
            <li key={entry.id} className="awareness-row">
              <span className="awareness-name" title={`${entry.description} (s. ${entry.page})`}>
                {entry.name}
              </span>
              <span className="awareness-value">
                {points === 0
                  ? '—'
                  : entry.shape === 'flat'
                    ? 'włączone'
                    : entry.shape === 'perPoint'
                      ? `+${value}`
                      : `${value}. próg`}
              </span>
              <span className="awareness-cost">{points > 0 ? `${points} pkt` : ''}</span>
              <span className="awareness-steps">
                <button
                  type="button"
                  onClick={() => bump(entry.id, -1)}
                  disabled={down}
                  title={down ? 'Nie ma czego zdejmować.' : `Zdejmij punkty: ${entry.name}`}
                  aria-label={`Zdejmij punkty: ${entry.name}`}
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() => bump(entry.id, 1)}
                  disabled={up !== null}
                  title={up ?? `Dołóż punkty: ${entry.name}`}
                  aria-label={`Dołóż punkty: ${entry.name}`}
                >
                  +
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      {error && <p className="awareness-error">{error}</p>}
      <p className="awareness-hint">
        Poza walką przydział zmienia się za darmo. W trakcie walki zapis kosztuje Akcję (s. 146).
      </p>
      <div className="awareness-buttons">
        <button type="button" onClick={() => void save()} disabled={!dirty || saving}>
          {saving ? 'Zapisuję…' : 'Zapisz przydział'}
        </button>
        <button type="button" onClick={() => (dirty ? setDraft(stored) : onDone?.())}>
          {dirty ? 'Cofnij zmiany' : 'Zamknij'}
        </button>
      </div>
    </div>
  );
}
