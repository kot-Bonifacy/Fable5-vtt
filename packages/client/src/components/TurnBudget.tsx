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
 */
export function TurnBudget({ budget }: { budget: TurnBudgetView }) {
  return (
    <div
      className="combat-budget"
      title={
        budget.note
          ? `${budget.note}${budget.overspent ? ` · przekroczenie ×${budget.overspent}` : ''}`
          : 'Budżet tury'
      }
    >
      {budget.resources.map((resource) => (
        <span key={resource.id} className="combat-budget-item">
          <span className="combat-budget-label">{resource.label}</span>
          <span className="combat-budget-pips" aria-label={`${resource.used} z ${resource.max}`}>
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
      {budget.distance && (
        <span
          className={`combat-budget-distance${
            budget.distance.used > budget.distance.max ? ' combat-budget-distance--over' : ''
          }`}
          title={
            budget.distance.note
              ? `${budget.distance.label}: ${budget.distance.note}`
              : budget.distance.label
          }
        >
          {formatMetres(budget.distance.used)} / {formatMetres(budget.distance.max)}
          {budget.distance.hard && (
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
