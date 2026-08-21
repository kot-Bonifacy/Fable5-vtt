/**
 * Stan pusty listy (etap 27f).
 *
 * Do 27e pustka wyglądała w każdym panelu inaczej: raz „Brak wpisów w tej
 * kategorii.", raz nic, raz zdanie z przyciskiem doklejonym gdzie indziej.
 * Kryterium etapu mówi: każda lista, która bywa pusta, ma tłumaczyć, *dlaczego*
 * jest pusta, i — gdy to sensowne — podawać pierwszy krok.
 *
 * Rozróżnienie jest jedno i warto je trzymać: „nic tu jeszcze nie ma"
 * (odpowiedź: załóż pierwszy wpis) to zupełnie inna sytuacja niż „nic nie
 * pasuje do filtra" (odpowiedź: zdejmij filtr). Panel, który mówi „brak
 * wpisów" na oba przypadki, wysyła szukającego do zakładania czegoś, co już
 * ma.
 */
export function EmptyState({
  text,
  action,
}: {
  text: string;
  /** Pierwszy krok. Pomijany, gdy uczciwej odpowiedzi nie ma. */
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="empty-state">
      <p className="placeholder-text">{text}</p>
      {action && (
        <button type="button" className="small-button" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
