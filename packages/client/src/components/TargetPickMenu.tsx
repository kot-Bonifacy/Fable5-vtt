import { useEffect, useMemo, useRef } from 'react';
import { conditionRegistry, tokenCondition, type TokenCondition } from '@vtt/shared';
import { useTargetPickStore } from '../stores/targetPickStore.js';
import { useTokenStore } from '../stores/tokenStore.js';

/**
 * „W kogo strzelasz?” — wybór celu ze stosu figur (03.11.2026, zlecenie MG).
 *
 * Klik celownika w pole, na którym stoi kilku wrogów, nie strzela już w tego
 * z wierzchu: przy kursorze staje lista figur z tego pola, a wybór idzie dalej
 * dokładnie tą drogą, którą poszedłby klik w pojedynczą figurę (`onPick`), więc
 * kubek, okno Celowania i odmowy działają bez zmian. `Esc` albo klik obok —
 * nic nie zostało wybrane ani zapłacone.
 *
 * Figury na jednym polu mają te same narożniki celownika, więc podświetlenie
 * na mapie nic by nie mówiło — rozróżnia je nazwa (powtórzona dostaje numer,
 * bo alias „Ochroniarz” bywa wspólny) i stan ran, który i tak widać na mapie.
 */

const OFFSET = 14;
const ESTIMATED_WIDTH = 220;
const ROW_HEIGHT = 34;

const CONDITION_LABELS: Record<TokenCondition, string | null> = {
  ok: null,
  wounded: 'ranny',
  down: 'powalony',
  dead: 'martwy',
};

interface Props {
  /** Ta sama droga co klik w pojedynczą figurę — `clientX/Y` dla okna Celowania. */
  onPick: (tokenId: string, clientX: number, clientY: number) => void;
}

export function TargetPickMenu({ onPick }: Props) {
  const pick = useTargetPickStore((s) => s.pick);
  const close = useTargetPickStore((s) => s.close);
  const tokens = useTokenStore((s) => s.tokens);
  const statusRows = useTokenStore((s) => s.statuses);
  const conditions = useMemo(() => conditionRegistry(statusRows), [statusRows]);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!pick) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Szczebel przed drabinką `Esc` mapy: zdejmuje samo pytanie, broń zostaje.
      event.stopPropagation();
      close();
    };
    const onDown = (event: PointerEvent) => {
      if (ref.current?.contains(event.target as Node)) return;
      close();
    };
    window.addEventListener('keydown', onKey, true);
    // Jak w `AimMenu`: menu otwiera ten sam `pointerdown`, więc nasłuch dopiero
    // w następnej turze pętli, inaczej zamknąłby je w klatce otwarcia.
    const arm = window.setTimeout(() => window.addEventListener('pointerdown', onDown), 0);
    return () => {
      window.clearTimeout(arm);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [pick, close]);

  // Figura zniknęła ze sceny (zabita i usunięta, zmiana sceny) — wypada z listy;
  // gdy nie zostało z czego wybierać, pytanie schodzi samo.
  const present = pick ? pick.tokenIds.filter((id) => tokens[id] !== undefined) : [];
  useEffect(() => {
    if (pick && present.length === 0) close();
  }, [pick, present.length, close]);

  if (!pick || present.length === 0) return null;

  const names = present.map((id) => tokens[id]!.name.trim() || 'Figura bez nazwy');
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  const seen = new Map<string, number>();
  const labels = names.map((name) => {
    if ((counts.get(name) ?? 0) < 2) return name;
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    return `${name} (${n})`;
  });

  const height = 30 + present.length * ROW_HEIGHT;
  const left = Math.max(8, Math.min(pick.x + OFFSET, window.innerWidth - ESTIMATED_WIDTH));
  const top = Math.max(8, Math.min(pick.y + OFFSET, window.innerHeight - height - 8));

  function choose(tokenId: string) {
    if (!pick) return;
    close();
    onPick(tokenId, pick.x, pick.y);
  }

  return (
    <div
      ref={ref}
      className="target-pick"
      role="menu"
      aria-label="Wybierz cel"
      style={{ left, top }}
    >
      <div className="target-pick-title">Kilka celów na tym polu — w kogo?</div>
      {present.map((id, index) => {
        const token = tokens[id]!;
        const condition = CONDITION_LABELS[tokenCondition(token, conditions)];
        return (
          <button
            key={id}
            type="button"
            role="menuitem"
            className="target-pick-item"
            // Pierwszy na liście to figura z wierzchu — ta, w którą poszedłby
            // strzał bez pytania; `Enter` zaraz po kliknięciu ją wybiera.
            autoFocus={index === 0}
            onClick={() => choose(id)}
          >
            {token.imageUrl ? (
              <img className="target-pick-portrait" src={token.imageUrl} alt="" />
            ) : (
              <span className="target-pick-portrait target-pick-portrait--blank" aria-hidden>
                {labels[index]!.slice(0, 1)}
              </span>
            )}
            <span className="target-pick-name">{labels[index]}</span>
            {condition && <span className="target-pick-state">{condition}</span>}
          </button>
        );
      })}
    </div>
  );
}
