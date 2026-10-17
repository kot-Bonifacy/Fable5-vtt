/**
 * Co znaczy klik w podłoże przy zaznaczonej figurze (etap 54, decyzje MG
 * z 17.10, wzór BG3).
 *
 * Poza walką i w cudzej turze podglądu nie ma, więc klik rusza od razu. W turze
 * tej figury podgląd maluje pasy, a pas pola docelowego mówi, czy klik rusza
 * (zielony), czy tylko wskazuje cel, który drugi klik potwierdza: bursztyn
 * wydaje handel systemu (CP RED — Bieg), szary i trasa urwana mgłą idą do
 * granicy tego, co da się przejść.
 */
export type WalkClickBand = 'move' | 'extra' | 'beyond' | 'unknown';

/** Budżet tury w metrach — ten sam, z którego podgląd maluje pasy. */
export interface WalkClickBudget {
  metresLeft: number;
  costFactor: number;
  extraMetres: number;
}

/** Ten sam luz co na granicy pasów w podglądzie (zaokrąglenie do 0,1 m). */
const BAND_SLACK_M = 0.05;

/**
 * Pas, w którym leży cel trasy. `metres` to metry **gruntu** całej trasy do
 * celu (nie przyciętej budżetem); `truncated` — trasa urwała się na mgle albo
 * na skraju szukania, więc celu nie widać.
 */
export function walkClickBand(
  route: { metres: number; truncated: boolean },
  budget: WalkClickBudget | null,
): WalkClickBand {
  if (route.truncated) return 'unknown';
  if (!budget) return 'move';
  const factor = budget.costFactor > 0 ? budget.costFactor : 1;
  if (route.metres <= Math.max(0, budget.metresLeft) / factor + BAND_SLACK_M) return 'move';
  const extra = budget.extraMetres > 0 ? budget.extraMetres : 0;
  if (
    extra > 0 &&
    route.metres <= (Math.max(0, budget.metresLeft) + extra) / factor + BAND_SLACK_M
  ) {
    return 'extra';
  }
  return 'beyond';
}

/**
 * Czy ten klik ma czekać na drugi w to samo pole. Tylko w turze figury
 * (`inTurn`): poza walką i w cudzej turze klik rusza od razu — także po
 * punktach trasy z `Shift` + klik, bo pas puli Eksploracji niczego nie kosztuje.
 */
export function walkClickNeedsConfirm(band: WalkClickBand, inTurn: boolean): boolean {
  return inTurn && band !== 'move';
}

/** Pierwszy klik w szary pas (etap 52; od 54 tylko tam i w mgłę). */
export const WALK_CONFIRM_NOTE =
  'Za daleko na tę turę — kliknij cel jeszcze raz, a postać dojdzie, dokąd zdoła. Esc — odwołaj.';

/** Pierwszy klik w cel, do którego trasy nie widać (mgła, skraj szukania). */
export const WALK_FOG_CONFIRM_NOTE =
  'Drogi do celu nie widać — kliknij jeszcze raz, a postać pójdzie w tę stronę, dokąd zdoła. Esc — odwołaj.';

/**
 * Pierwszy klik w bursztyn: zdanie o koszcie. `hint` przychodzi z systemu
 * (CP RED: „Bieg zużyje Akcję"), bo mapa nie zna nazwy tego handlu.
 */
export function walkExtraConfirmNote(hint: string | null): string {
  return `${hint ?? 'Ten ruch ma swój koszt'} — kliknij cel jeszcze raz, żeby ruszyć. Esc — odwołaj.`;
}
