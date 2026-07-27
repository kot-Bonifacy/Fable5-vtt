# tools/rulebook

Przebudowa tekstowego zrzutu podręcznika Cyberpunk RED na czytelny markdown.

```
node tools/rulebook/build-manual.mjs <zrodlo.md> <katalog-wyjsciowy> [structure.json]
```

Przykład (tak powstała bieżąca wersja):

```
node tools/rulebook/build-manual.mjs C:/AI/materialy/podrecznik.md data/private/rulebook/manual
```

## Licencja

W repozytorium jest **wyłącznie parser**. Zarówno tekst źródłowy, jak i wynik oraz
`structure.json` (tytuły rozdziałów) leżą w `data/private/`, poza gitem — patrz
`packages/server/src/licensing.test.ts`.

## Co robi skrypt

Wejściem jest surowy zrzut tekstu z PDF-a: **całość w jednej linii**, bez akapitów,
ze śladami Scribda. Kolejne etapy:

| Etap                | Działanie                                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Podział na strony   | Znacznik `adDownload to read ad-free` występuje dokładnie raz na stronę (453 × dla stron 4–456), więc wyznacza granice i numerację |
| Normalizacja znaków | Ligatury `ﬁ ﬂ ﬀ ﬃ ﬄ`, spacje nierozdzielające, zero-width, miękkie łączniki                                                        |
| Napisy rozstrzelone | Dekoracyjne `n i g h t c i t y` to powtórzenie tytułu ze składu — usuwane                                                          |
| Duplikaty           | PDF renderuje napisy ozdobne w dwóch warstwach (`GOWNIE GOWNIE`); zwijane są powtórzone ciągi 1–14 wyrazów                         |
| Kapitaliki          | `S TRÓŻ P RAWA` → `STRÓŻ PRAWA`, `T worzenie` → `Tworzenie`                                                                        |
| Dzielenie wyrazów   | `inte- rakcję` → `interakcję`, `pojaz-dów` → `pojazdów`                                                                            |
| Elementy stałe      | Numer strony, żywa pagina (układ verso/recto), kredyty ilustratorskie                                                              |
| Struktura           | Rozdziały i podrozdziały ze spisu treści; nagłówki śródtekstowe z wersalikowych ciągów                                             |
| Układ               | Akapity ~420 znaków, jedno zdanie na wiersz, kotwice `<!-- s. 128 -->`                                                             |

## Jak rozstrzygane są przypadki wątpliwe

Podręcznik nie ma słownika, więc skrypt buduje **słownik z samego korpusu** (31 tys. form)
i używa go jako sędziego:

- **Kapitaliki.** `O NI` → `ONI`, bo korpus zna „oni". Ale `W MIEŚCIE` zostaje rozdzielone,
  bo „wmieście" nie istnieje. Przy polskich przyimkach jednoliterowych (`a i o u w z`)
  rozdzielenie wygrywa, gdy drugi człon sam jest wyrazem — dlatego `w stanie` nie zlepi się
  w `wstanie`.
- **Dzielenie wyrazów.** Odstęp po łączniku (`spala- nie`) to praktycznie zawsze przeniesienie
  wiersza. Bez odstępu decyduje słownik, a gdy sklejonej formy w nim nie ma — test rdzenia:
  jeśli `implantowaniu` dzieli rdzeń z jakimś znanym wyrazem, to odmiana, nie złożenie.
  Prawdziwe złożenia chronią: przedrostki (`cyber-`, `anty-`, `post-`), człon przysłówkowy na
  `-o` z istniejącym przymiotnikiem (`mięśniowo-` ← `mięśniowy`), elipsa (`jedno- lub`)
  i para samodzielnych wyrazów (`miasta-państwa`).

## Znane ograniczenia

- **Tabele nie są odtworzone.** W zrzucie kolumny są posklejane bez separatorów
  (`300 ed500 ed800 ed`, `Sposób podróży pieszejMPHKM/h`). Odbudowa wymaga ręcznej pracy
  na rozdziałach mechanicznych — to osobne zadanie.
- **Podział na akapity jest przybliżony.** PDF nie zachował informacji o akapitach; skrypt łamie
  tekst co ~420 znaków na granicy zdania.
- Ok. 77 wyrazów wciąż z łącznikiem i ~35 błędnie rozdzielonych kapitalików — wszystkie
  w tekście ozdobnym, nie w mechanice.
- Utrata ~4,4% słów względem źródła to celowo usunięte duplikaty warstw, napisy rozstrzelone
  i elementy stałe stron.

## Kontrola jakości

Skrypt wypisuje statystyki każdego etapu oraz listę zachowanych łączników — służy do
sprawdzenia, czy heurystyki nie zaczęły psuć tekstu po zmianie źródła.
