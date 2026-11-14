import type { CpredNetPosition, NetTrailStep } from '@vtt/shared';
import { NET_FLOOR_KIND_LABELS } from '@vtt/shared';
import { FLOOR_GLYPHS, TRACES_LABELS, floorName } from './net-glyphs.js';

/** Co o piętrze śladu mówi dymek: nazwa, głębokość i to, co już tam zrobiono. */
function stepTitle(step: NetTrailStep): string {
  const marks = [
    step.broken ? 'złamane' : null,
    step.identified ? 'rozpoznany' : null,
    step.copied ? 'kopia na deku' : null,
    step.controlledDv !== undefined ? 'przejęty' : null,
    step.hackFailed ? 'próba zużyta' : null,
    step.traces ? TRACES_LABELS[step.traces] : null,
  ].filter((mark): mark is string => mark !== null);
  const name =
    step.label && step.label !== NET_FLOOR_KIND_LABELS[step.kind]
      ? `${step.label} (${NET_FLOOR_KIND_LABELS[step.kind]})`
      : floorName(step);
  const where = step.here ? 'tu jesteś' : 'kliknij, żeby wrócić — ruch nic nie kosztuje';
  return [`${name} · głębokość ${step.depth + 1}`, ...marks, where].join(' · ');
}

function Step({
  step,
  busy,
  onMove,
}: {
  step: NetTrailStep;
  busy: boolean;
  onMove: (to: CpredNetPosition) => void;
}) {
  const held = step.controlledDv !== undefined;
  return (
    <button
      type="button"
      className={`net-trail-step${step.here ? ' net-trail-step--here' : ''}${held ? ' net-trail-step--held' : ''}${step.traces ? ' net-trail-step--traces' : ''}`}
      disabled={busy || step.here}
      title={stepTitle(step)}
      aria-label={stepTitle(step)}
      aria-current={step.here ? 'step' : undefined}
      onClick={() => onMove(step.position)}
    >
      {FLOOR_GLYPHS[step.kind]}
    </button>
  );
}

/**
 * Ślad (etap 70a) — piętra, na których postać już stała.
 *
 * Najpierw droga od wejścia do piętra pod stopami, w kolejności zejścia; za nią
 * piętra odwiedzone poza tą drogą (odnoga, z której netrunner wrócił, albo
 * piętro głębiej, z którego się wycofał). Nic więcej: ślad nie mówi, ile pięter
 * ma szyb, bo serwer przysyła tylko te odwiedzone.
 */
export function NetTrail({
  trail,
  busy,
  onMove,
}: {
  trail: NetTrailStep[];
  busy: boolean;
  onMove: (to: CpredNetPosition) => void;
}) {
  const route = trail.filter((step) => step.onPath);
  const aside = trail.filter((step) => !step.onPath);
  if (trail.length < 2) return null;
  return (
    <nav className="net-trail" aria-label="Ślad — odwiedzone piętra">
      <span className="net-trail-route">
        {route.map((step, index) => (
          <span key={step.id} className="net-trail-link">
            {index > 0 && (
              <span className="net-trail-sep" aria-hidden>
                ›
              </span>
            )}
            <Step step={step} busy={busy} onMove={onMove} />
          </span>
        ))}
      </span>
      {aside.length > 0 && (
        <span
          className="net-trail-aside"
          title="Odwiedzone piętra poza drogą, którą tu przyszła postać"
        >
          <span className="net-trail-sep" aria-hidden>
            ⋯
          </span>
          {aside.map((step) => (
            <Step key={step.id} step={step} busy={busy} onMove={onMove} />
          ))}
        </span>
      )}
    </nav>
  );
}
