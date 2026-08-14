/**
 * Polska liczba mnoga: 1 sesja, 2–4 sesje, 5+ sesji.
 *
 * Mieszkała w `JournalPanel.tsx` od etapu 19c; etap 26a był drugim miejscem,
 * które jej potrzebowało („1 odgałęzienie" kontra „5 odgałęzień"), więc funkcja
 * wyprowadziła się do własnego modułu zamiast zostać skopiowana. Wyjątek na
 * nastolatki (12–14) jest tu nie bez powodu: bez niego wychodzi „13 sesje".
 */
export function plural(count: number, one: string, few: string, many: string): string {
  const last = count % 10;
  const teens = count % 100;
  if (count === 1) return `${count} ${one}`;
  if (last >= 2 && last <= 4 && (teens < 12 || teens > 14)) return `${count} ${few}`;
  return `${count} ${many}`;
}
