import type { TurnBudgetView } from '@vtt/shared';
import { formatMetres } from '@vtt/shared';

/**
 * What is left of the acting participant's turn (stage 14b): one pip per unit,
 * filled once it is spent. The labels come from the game system, so this stays
 * a row of dots whatever „Ruch" and „Akcja" turn out to mean in a future RPG.
 *
 * Its own file since stage 16f: the initiative bar over the map and the HUD's
 * character panel both draw the budget, and two renderings of one number is how
 * a table ends up arguing about which of them is right.
 *
 * Two shapes since 27h, one meaning. In the top bar it is a strip beside the
 * queue and stays as narrow as it always was; in the left rail it is the thing
 * a player looks at before every move, so the pips grow, the labels get a line
 * of their own and the metres become a bar — a fraction in 0,72 rem is not what
 * „how far can I still go" should cost to answer.
 *
 * Since 17.10 (MG) a pip that is lit is one you still have, BG3-style: the eye
 * looks for what is left to spend, so the spent ones go dark rather than the
 * other way round. The rail's metres follow suit — the bar is what is left.
 */
export function TurnBudget({
  budget,
  variant = 'bar',
}: {
  budget: TurnBudgetView;
  variant?: 'bar' | 'rail';
}) {
  const distance = budget.distance;
  const over = distance ? distance.used > distance.max : false;
  const left = distance ? Math.max(0, distance.max - distance.used) : 0;
  const leftRatio = distance && distance.max > 0 ? left / distance.max : 0;
  return (
    <div
      className={variant === 'rail' ? 'combat-budget combat-budget--rail' : 'combat-budget'}
      title={
        budget.note
          ? `${budget.note}${budget.overspent ? ` · przekroczenie ×${budget.overspent}` : ''}`
          : 'Budżet tury'
      }
    >
      {budget.resources.map((resource) => (
        <span
          key={resource.id}
          className={`combat-budget-item${resource.blocked ? ' combat-budget-item--blocked' : ''}`}
          data-resource={resource.id}
          {...(resource.blocked ? { title: resource.blocked } : {})}
        >
          <span className="combat-budget-label">{resource.label}</span>
          <span
            className="combat-budget-pips"
            aria-label={`zostało ${Math.max(0, resource.max - resource.used)} z ${resource.max}`}
          >
            {Array.from({ length: Math.max(resource.max, resource.used) }, (_, index) => (
              <span
                key={index}
                className={`combat-budget-pip${
                  index < resource.used ? ' combat-budget-pip--spent' : ''
                }${index >= resource.max ? ' combat-budget-pip--over' : ''}`}
              />
            ))}
          </span>
        </span>
      ))}
      {/* Metres cannot be pips (stage 14c) — a continuous budget reads as a
          fraction, and the unit is whatever the system called it. */}
      {distance && (
        <span
          className={`combat-budget-distance${over ? ' combat-budget-distance--over' : ''}`}
          title={`${distance.label}: zostało ${formatMetres(left)} z ${formatMetres(distance.max)} (przebyte ${formatMetres(distance.used)})${
            distance.note ? ` · ${distance.note}` : ''
          }`}
        >
          {variant === 'rail' && <span className="combat-budget-label">{distance.label}</span>}
          {/* The bar is the rail's only addition: what is left fills it and
              drains with every step, so „can I still reach that corner" is a
              shape rather than two numbers to subtract. Past the budget (the
              GM's own NPCs only) it turns red and full, and the number says by
              how much. */}
          {variant === 'rail' && (
            <span className="combat-budget-track" aria-hidden>
              <span
                className="combat-budget-track-fill"
                style={{ width: `${(over ? 1 : leftRatio) * 100}%` }}
              />
            </span>
          )}
          <span className="combat-budget-metres">
            {variant === 'rail' && !over ? (
              <>
                <strong>{formatMetres(left)}</strong> / {formatMetres(distance.max)}
              </>
            ) : (
              <>
                {formatMetres(distance.used)} / {formatMetres(distance.max)}
              </>
            )}
          </span>
          {distance.hard && (
            <span className="combat-budget-flag" title="Ruch utrudniony — podwójny koszt">
              ×2
            </span>
          )}
        </span>
      )}
      {budget.bypass && (
        <span className="combat-budget-flag" title="MG przepuścił jedną akcję">
          przepustka
        </span>
      )}
      {budget.overspent ? (
        <span className="combat-budget-flag combat-budget-flag--over" title="Poza budżetem tury">
          +{budget.overspent}
        </span>
      ) : null}
    </div>
  );
}
