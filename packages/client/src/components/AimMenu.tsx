import { useEffect, useRef } from 'react';
import {
  CPRED_AIMED_SHOT_PENALTY,
  CPRED_AIM_BODY_ICON,
  CPRED_AIM_POINTS,
  CPRED_AIM_POINT_ICONS,
  CPRED_AIM_POINT_LABELS,
  type CpredAimPoint,
} from '@vtt/shared';
import { loadAttackFor } from '../attack-targeting.js';
import { useAimMenuStore } from '../stores/aimMenuStore.js';
import { useRollStore } from '../stores/rollStore.js';
import { HudIcon } from './HudIcon.js';

/**
 * Cztery sylwetki przy kursorze: gdzie ma pójść ten strzał (s. 170).
 *
 * Wyskakuje samo, gdy kubek dostanie pojedynczy strzał w figurę — czyli
 * dokładnie wtedy, gdy Celowanie jest w ogóle dozwolone. Nic nie trzeba
 * wybierać: okno jest skrótem, a nie krokiem. Kliknięcie w kubek rzuca zwykły
 * strzał i okno znika razem z ładunkiem kubka.
 *
 * Same ikony, bez podpisów: to jest pasek przy kursorze w trakcie walki, a nie
 * miejsce na wykład o regule. Nazwa i skutek każdej lokacji siedzą w `title`
 * i w nazwie dostępnej, więc czytnik ekranu i kursor mają pełne zdanie, a oko
 * ma cztery sylwetki.
 */

/** Co daje każdy punkt Celowania, słowami podręcznika. */
const AIM_POINT_HINTS: Record<CpredAimPoint, string> = {
  head: 'Obrażenia, które przejdą przez pancerz głowy, liczą się podwójnie',
  heldItem: 'Jeśli choć 1 punkt przejdzie przez pancerz ciała, cel upuszcza trzymany przedmiot',
  leg: 'Jeśli choć 1 punkt przejdzie przez pancerz ciała, cel dostaje ranę „Złamana noga”',
};

/** Ile pikseli od kursora; tyle, żeby okno nie siadło pod grotem. */
const OFFSET = 14;
const ESTIMATED_WIDTH = 168;
const ESTIMATED_HEIGHT = 44;

export function AimMenu() {
  const offer = useAimMenuStore((s) => s.offer);
  const close = useAimMenuStore((s) => s.close);
  // Kubek opróżniony (rzut poszedł, ktoś go zdjął) znaczy, że nie ma już czego
  // celować — okno schodzi razem z ładunkiem, bez własnego sprzątania.
  const loaded = useRollStore((s) => s.attack);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!offer) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Szczebel przed drabinką `Esc` mapy: „nie celuję" ma zdjąć samo okno,
      // a nie od razu rozbroić broń.
      event.stopPropagation();
      close();
    };
    const onDown = (event: PointerEvent) => {
      if (ref.current?.contains(event.target as Node)) return;
      close();
    };
    window.addEventListener('keydown', onKey, true);
    /*
     * Nasłuch dopiero w następnej turze pętli zdarzeń — okno otwiera **ten**
     * `pointerdown`, który właśnie wskazał cel, a listener dopięty do `window`
     * w trakcie jego wędrówki w górę drzewa zdąży go jeszcze złapać i zamknąć
     * okno w tej samej klatce, w której je otworzono.
     */
    const arm = window.setTimeout(() => window.addEventListener('pointerdown', onDown), 0);
    return () => {
      window.clearTimeout(arm);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [offer, close]);

  useEffect(() => {
    if (!loaded) close();
  }, [loaded, close]);

  if (!offer || !loaded) return null;

  // Zatrzaśnięta kopia: `aim` jest deklaracją funkcji, więc TypeScript nie
  // przenosi do niej zawężenia z warunku wyżej.
  const shot = offer;
  const chosen = shot.aimedAt ?? null;

  /**
   * Przeładowuje kubek tym samym strzałem, tyle że wymierzonym.
   *
   * Kliknięcie w już wybrane (albo w „bez celowania", gdy i tak się nie celuje)
   * jest potwierdzeniem, nie zmianą — okno schodzi i nic się nie przelicza.
   */
  function aim(point: CpredAimPoint | null) {
    if (point === chosen) {
      close();
      return;
    }
    const { aimedAt: _previous, ...bare } = shot.intent;
    loadAttackFor(point ? { ...bare, aimedAt: point } : bare, {
      kind: 'token',
      tokenId: shot.targetTokenId,
    });
    // Zdjęcie Celowania kończy sprawę; wybór lokacji zostawia okno otwarte,
    // żeby „jednak w nogę" nie kosztowało ponownego wskazywania celu.
    if (!point) close();
  }

  const left = Math.max(8, Math.min(offer.x + OFFSET, window.innerWidth - ESTIMATED_WIDTH));
  const top = Math.max(8, Math.min(offer.y + OFFSET, window.innerHeight - ESTIMATED_HEIGHT));

  return (
    <div ref={ref} className="aim-menu" style={{ left, top }}>
      <button
        type="button"
        className={`aim-menu-point${offer.aimedAt === undefined ? ' is-on' : ''}`}
        aria-pressed={offer.aimedAt === undefined}
        title={`Bez celowania — strzał w korpus, bez kary ${CPRED_AIMED_SHOT_PENALTY} i bez zabierania całej Akcji`}
        aria-label="Bez celowania"
        onClick={() => aim(null)}
      >
        <HudIcon name={CPRED_AIM_BODY_ICON} className="aim-menu-icon" />
      </button>
      {CPRED_AIM_POINTS.map((id) => (
        <button
          key={id}
          type="button"
          className={`aim-menu-point${offer.aimedAt === id ? ' is-on' : ''}`}
          aria-pressed={offer.aimedAt === id}
          title={`${CPRED_AIM_POINT_LABELS[id]} (${CPRED_AIMED_SHOT_PENALTY}, cała Akcja) — ${AIM_POINT_HINTS[id]}`}
          aria-label={CPRED_AIM_POINT_LABELS[id]}
          onClick={() => aim(id)}
        >
          <HudIcon name={CPRED_AIM_POINT_ICONS[id]} className="aim-menu-icon" />
        </button>
      ))}
    </div>
  );
}
