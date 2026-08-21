/**
 * Polska liczba mnoga: 1 sesja, 2–4 sesje, 5+ sesji.
 *
 * Mieszkała w `JournalPanel.tsx` od etapu 19c; etap 26a był drugim miejscem,
 * które jej potrzebowało („1 odgałęzienie" kontra „5 odgałęzień"), więc funkcja
 * wyprowadziła się do własnego modułu zamiast zostać skopiowana. Wyjątek na
 * nastolatki (12–14) jest tu nie bez powodu: bez niego wychodzi „13 sesje".
 */

/**
 * Sam rzeczownik, bez liczby przed nim (etap 27f). Dla miejsc, które formatują
 * liczbę po swojemu: asystent zasad pisze „1 234 fragmentów", więc nie może
 * dostać liczby sklejonej ze słowem — `toLocaleString` musi zdążyć wcześniej.
 */
export function pluralWord(count: number, one: string, few: string, many: string): string {
  const last = count % 10;
  const teens = count % 100;
  if (count === 1) return one;
  if (last >= 2 && last <= 4 && (teens < 12 || teens > 14)) return few;
  return many;
}

/** Liczba i rzeczownik: `plural(5, 'wpis', 'wpisy', 'wpisów')` → „5 wpisów". */
export function plural(count: number, one: string, few: string, many: string): string {
  return `${count} ${pluralWord(count, one, few, many)}`;
}
