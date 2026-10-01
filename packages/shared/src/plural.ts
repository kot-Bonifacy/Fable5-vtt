/**
 * Polska liczba mnoga ma trzy formy, nie dwie: 1 → „figura”, końcówka 2–4
 * (poza 12–14) → „figury”, reszta → „figur”. Zdanie składane z liczby, które
 * zna tylko „1 albo reszta”, pisze „4 figur straciło” (#44, 30.09) — widać to
 * przy stole natychmiast.
 *
 * Zwraca formę, a nie gotowe zdanie: czasownik idzie za liczbą tak samo
 * („figura straciła”, „figury straciły”, „figur straciło”), więc wołający
 * podaje całe frazy.
 */
export function polishPlural<T>(count: number, one: T, few: T, many: T): T {
  const abs = Math.abs(Math.trunc(count));
  if (abs === 1) return one;
  const last = abs % 10;
  const lastTwo = abs % 100;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? few : many;
}
