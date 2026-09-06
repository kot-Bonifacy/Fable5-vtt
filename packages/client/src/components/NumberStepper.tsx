import { useCallback, useEffect, useRef, type KeyboardEvent } from 'react';

/**
 * Liczba ze strzałkami zamiast pola do wpisywania (decyzja MG z 06.09.2026).
 *
 * Karta postaci jest **grana**, a nie wypełniana: PW spadają o kilka, amunicja
 * o jeden, OB o jeden przy każdym przebiciu. Wpisywanie znaczyło
 * zaznacz–skasuj–wpisz przy każdej takiej zmianie, a przy okazji wpuszczało
 * wszystko, co da się wystukać — pole `type="number"` przyjmuje „7e3" i puste,
 * i trzeba było to sprzątać przy każdym `onChange` osobno. Tu wartość jest
 * napisem, a jedyną drogą do jej zmiany są dwie strzałki, więc nie ma stanu
 * pośredniego do sprzątania: zakres pilnuje sam przełącznik.
 *
 * Ten sam przełącznik stoi w **oknach gry** (rzut, wezwanie MG, statysta
 * z menu tokena, wirus w netrunie), bo to te same liczby: modyfikator,
 * Szczęście, PT, Cechy, OB. Skórę bierze z kontekstu — w oknie jest polem
 * z ramką, na karcie płaskim napisem (`styles.css` + `sheet.css`).
 *
 * **Czego nie zamienia:** liczb, które w tym systemie potrafią przekroczyć 99
 * (PD, ILOŚĆ w wyposażeniu, eurodolce, ceny i zasięgi w kompendium, PW tokenu)
 * oraz pól, w których **puste znaczy coś innego niż zero** — OB celu bez karty
 * („puste = z karty"), inicjatywa akcji przygotowanej, pięter i odgałęzień
 * sieci („puste = losuje serwer"), sztuk w ekwipunku („puste = wszystkie").
 * Przełącznik zawsze ma liczbę, więc odebrałby im ten stan.
 *
 * Strzałki stoją **w pionie, tuż na prawo od liczby**, i obie razem są wysokie
 * na jeden wiersz — wersja pozioma (`− 7 +`) rozpychała komórki tabel o dwa
 * guziki na każdą liczbę, a tabel na karcie jest pięć. **Przytrzymanie
 * powtarza**, bo bez wpisywania OB 18 to osiemnaście kliknięć.
 */

/**
 * Modyfikator czyta się ze znakiem, i to z **prawdziwym** minusem: „−2", a nie
 * „-2". Zero zostaje zerem — „+0" wygląda jak niedokończone.
 */
export function signed(value: number): string {
  if (value === 0) return '0';
  return value > 0 ? `+${value}` : `−${Math.abs(value)}`;
}

/** Ile czekać przed powtarzaniem i jak szybko potem powtarzać. */
const HOLD_DELAY_MS = 400;
const HOLD_INTERVAL_MS = 70;

export function NumberStepper({
  value,
  min,
  max,
  onChange,
  label,
  title,
  readOnly = false,
  className,
  format,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  /** Nazwa dla czytnika ekranu — „Punkty Wytrzymałości", „Stan magazynka: Ares". */
  label: string;
  title?: string;
  /** Bez strzałek: liczbę widać, ale zmienia ją co innego (PD, poziom za PD). */
  readOnly?: boolean;
  className?: string;
  /** Napis zamiast gołej liczby — np. kara pancerza z prawdziwym minusem. */
  format?: (value: number) => string;
}) {
  const holdRef = useRef<{
    delay?: ReturnType<typeof setTimeout>;
    tick?: ReturnType<typeof setInterval>;
  }>({});
  // Powtarzanie czyta wartość przez ref: interwał złapany na pierwszym renderze
  // inaczej dodawałby wciąż do tej samej liczby i stał w miejscu.
  const valueRef = useRef(value);
  valueRef.current = value;

  const stopHold = useCallback(() => {
    const hold = holdRef.current;
    if (hold.delay) clearTimeout(hold.delay);
    if (hold.tick) clearInterval(hold.tick);
    holdRef.current = {};
  }, []);

  // Kursor puszczony poza guzikiem albo okno zamknięte w trakcie trzymania nie
  // może zostawić interwału, który liczy dalej.
  useEffect(() => stopHold, [stopHold]);

  const step = useCallback(
    (by: number) => {
      const next = Math.min(max, Math.max(min, valueRef.current + by));
      if (next !== valueRef.current) onChange(next);
    },
    [max, min, onChange],
  );

  const startHold = useCallback(
    (by: number) => {
      stopHold();
      // Powtarzanie liczy od WŁASNEJ liczby, a nie od tej z propsów: karta jest
      // duża, jej render potrafi wyprzedzić tik, a wtedy dwa tiki z rzędu
      // policzyłyby tę samą wartość i przytrzymanie stanęłoby w miejscu.
      let base = valueRef.current;
      const advance = () => {
        const next = Math.min(max, Math.max(min, base + by));
        if (next === base) return;
        base = next;
        onChange(next);
      };
      advance();
      holdRef.current.delay = setTimeout(() => {
        holdRef.current.tick = setInterval(advance, HOLD_INTERVAL_MS);
      }, HOLD_DELAY_MS);
    },
    [max, min, onChange, stopHold],
  );

  function onKeyDown(event: KeyboardEvent<HTMLSpanElement>) {
    if (readOnly) return;
    if (event.key === 'ArrowUp') step(1);
    else if (event.key === 'ArrowDown') step(-1);
    else return;
    event.preventDefault();
  }

  const shown = format ? format(value) : String(value);
  return (
    <span
      className={`cp-step${readOnly ? ' cp-step--locked' : ''}${className ? ` ${className}` : ''}`}
      role="spinbutton"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-readonly={readOnly || undefined}
      tabIndex={readOnly ? -1 : 0}
      onKeyDown={onKeyDown}
      {...(title !== undefined ? { title } : {})}
    >
      <span className="cp-step-value">{shown}</span>
      {!readOnly && (
        <span className="cp-step-arrows">
          <button
            type="button"
            className="cp-step-arrow"
            tabIndex={-1}
            disabled={value >= max}
            title={`${label}: więcej`}
            aria-label={`${label}: więcej`}
            onPointerDown={() => startHold(1)}
            onPointerUp={stopHold}
            onPointerLeave={stopHold}
            onPointerCancel={stopHold}
          >
            ▲
          </button>
          <button
            type="button"
            className="cp-step-arrow"
            tabIndex={-1}
            disabled={value <= min}
            title={`${label}: mniej`}
            aria-label={`${label}: mniej`}
            onPointerDown={() => startHold(-1)}
            onPointerUp={stopHold}
            onPointerLeave={stopHold}
            onPointerCancel={stopHold}
          >
            ▼
          </button>
        </span>
      )}
    </span>
  );
}
