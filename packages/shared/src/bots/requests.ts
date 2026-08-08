/**
 * „Czy ta wypowiedź prosi bota o mechanikę?" (etap 20a).
 *
 * Deterministyczna bramka **przed** przebiegiem decyzyjnym, nie zamiast niego.
 * Rozstrzyga wyłącznie, czy w ogóle warto zapytać model — samą decyzję („to
 * jednak zwykła rozmowa") podejmuje model, bo ma opcję `rozmowa` w enumie.
 *
 * Dlaczego nie pytać modelu zawsze: rozmowa z NPC-em to ścieżka z etapu 11,
 * której mediana wynosi 0,62 s. Dodatkowe wywołanie przy każdej linii podwoiłoby
 * ten czas dla funkcji, z której korzysta się raz na kilkanaście wypowiedzi.
 *
 * Dlaczego nie rozstrzygać tu wszystkiego: lista polskich zwrotów nigdy nie
 * będzie kompletna. Detektor jest więc **celowo szeroki** — fałszywy alarm
 * kosztuje jedno tanie wywołanie zakończone „rozmowa", a fałszywe przeoczenie
 * MG naprawia przyciskiem „Poproś o akcję", który detektora nie pyta.
 */

/** Znaki diakrytyczne lecą precz: przy stole pisze się i „rzuć", i „rzuc". */
export function foldPolish(text: string): string {
  return (
    text
      .toLocaleLowerCase('pl-PL')
      // Rozkład na literę + znak łączący, a potem precz ze znakami łączącymi.
      .normalize('NFD')
      .replace(/\p{Mn}/gu, '')
      // NFD nie rozkłada „ł" — jedyna polska litera, która wymaga osobnej linijki.
      .replace(/ł/g, 'l')
  );
}

/**
 * Zwroty, po których pytamy model o decyzję. Same rdzenie — polska odmiana
 * dokleja końcówki („rzuci", „rzucaj", „testu", „sprawdzeniu"), a granica słowa
 * z lewej strony chroni przed trafieniem w środek innego wyrazu.
 */
const REQUEST_PATTERNS: RegExp[] = [
  // rzuć, rzuc, rzuci, rzucaj, rzucisz, rzut, rzutu, rzuty
  /\brzu[ct]/,
  // test, testu, testem, testy, przetestuj, stestuj
  /\btest/,
  /\bprzetestuj/,
  // sprawdź / sprawdzenie / sprawdzian — najszerszy z zestawu, stąd wymóg
  // sąsiedztwa: „sprawdź na Percepcję", „sprawdź swoją…", „sprawdź, czy…"
  /\bsprawdz\w*[,:]?\s+(na|swoj|czy|to)\b/,
  // próba / spróbuj + „na"
  /\bprob\w*\s+na\b/,
  /\bsprobuj\b/,
  // notacja kości wpisana wprost
  /\b\d*[kd]10\b/,
];

/**
 * Czy ta linia wygląda na prośbę o test. Patrz uwaga o szerokości wyżej —
 * odpowiedź „tak" znaczy „zapytaj model", a nie „wykonaj rzut".
 */
export function looksLikeActionRequest(text: string): boolean {
  const folded = foldPolish(typeof text === 'string' ? text : '');
  if (folded.trim().length === 0) return false;
  return REQUEST_PATTERNS.some((pattern) => pattern.test(folded));
}

/**
 * Czy w tej wypowiedzi padła ta nazwa — mimo polskiej odmiany.
 *
 * „rzuć na Percepcję" musi trafić w umiejętność „Percepcja", a porównanie
 * dosłowne tego nie robi (zmierzone 08.08 na żywej kampanii: nazwana wprost
 * umiejętność nie wchodziła do menu i bot odpowiadał „nie mam jej na liście").
 * Odcinamy więc końcówkę fleksyjną: rdzeń bez ostatniej litery wystarcza dla
 * mianownika, biernika i miejscownika, a nie skleja ze sobą różnych nazw.
 *
 * Krótkie nazwy zostawiamy w spokoju — rdzeń trzyliterowy trafiałby wszędzie.
 */
export function mentionsName(text: string, name: string): boolean {
  const stem = foldPolish(name).trim().slice(0, -1);
  if (stem.length < 4) return false;
  return foldPolish(text).includes(stem);
}
