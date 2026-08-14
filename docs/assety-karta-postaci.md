# Assety — karta postaci w stylu oficjalnej (etap 27a)

## Czego w repo NIE MA i nie będzie

Wzorem jest `CPR_Karta-Postaci-Edytowalna.pdf` — oficjalna karta postaci Cyberpunk RED
(wydanie polskie, Black Monk). **Z tego pliku nie pochodzi ani jeden bajt w repo.** Repozytorium
jest publiczne, a arkusz jest objęty prawem autorskim R. Talsorian Games / Black Monk, więc nie
kopiujemy:

- grafiki ramki (czerwone narożniki, przerywana linia, pasek „kodu kreskowego" na dole strony),
- logo „Cyberpunk RED",
- renderu szkieletu ze strony trzeciej — w 27c zastąpiony konturem z domeny publicznej
  (patrz „Sylwetka" niżej),
- treści podręcznikowych: opisów umiejętności, tabel, przykładów.

Odtwarzamy wyłącznie **styl**: siatkę, proporcje, kolory i typografię — własnym CSS-em
(`packages/client/src/sheet.css`). To ta sama granica, co w `CLAUDE.md`: „w repo schematy
i parsery, nigdy treść".

## Kolory

Spróbkowane z wydruku (`PIL`, najczęstsze barwy strony pierwszej):

| Rola            | Dzień     | Noc       |
| --------------- | --------- | --------- |
| czerwień paneli | `#CC2316` | `#E0301F` |
| papier (pola)   | `#FFFFFF` | `#171514` |
| tusz            | `#100E0D` | `#F1ECE4` |
| belka kategorii | `#000000` | `#050505` |

Nocna czerwień jest rozjaśniona świadomie: `#CC2316` na czerni gaśnie i belki przestają być
czytelne. Reszta to ten sam arkusz w negatywie.

## Kroje pisma

Karta jest złożona **Futurą PT** (Book / Bold / Bold Small Caps / Condensed Book) i **Tw Cen MT
Condensed Extra Bold** — oba kroje komercyjne. Zamienniki, oba na **SIL Open Font License 1.1**:

| Krój z karty              | Zamiennik             | Rola w naszej karcie                             |
| ------------------------- | --------------------- | ------------------------------------------------ |
| Futura PT (Book / Bold)   | **Jost**              | wszystko poza belkami: etykiety, pola, wartości  |
| Futura PT Condensed Book  | **Oswald** (waga 300) | nazwy umiejętności w szpaltach                   |
| Tw Cen MT Cond Extra Bold | **Oswald** (500/700)  | belki kategorii, nagłówki kolumn, belka tytułowa |

**Jost** to rewitalizacja Futury (indestructible type) — najbliższe darmowe podobieństwo, jakie
udało się znaleźć. Kapitaliki („Punkty Wytrz.", „Krytyczne Urazy") robi `font-variant-caps:
all-small-caps`; Jost nie ma prawdziwych kapitalików, więc syntetyzuje je przeglądarka.

### Gdzie leżą

`packages/client/public/fonts/` — `jost-var-latin.woff2`, `jost-var-latin-ext.woff2`
i `LICENSE-jost.txt`. Deklaracje `@font-face` stoją na początku `packages/client/src/styles.css`,
razem z krojami gazetowymi z etapu 24c.

Dwie rzeczy warte zapamiętania:

- **Oba kroje są zmienne** (oś wagi: Jost 100–900, Oswald 200–700), więc jeden plik na podzestaw
  obsługuje wszystkie wagi. Przy okazji etapu 27a Oswald przestał być deklarowany czterema
  blokami wskazującymi na dwa identyczne pliki — teraz są dwa bloki z zakresem wag, a pliki
  nazywają się `oswald-var-*`. Screamsheet z 24c rysuje się dokładnie tak samo.
- **Podzestawy `latin` + `latin-ext`.** Bez tego drugiego przeglądarka podmieniłaby krój przy
  pierwszym „ą" albo „ł" — a karta jest po polsku, łącznie z „Zdolność Specjalna"
  i „Przeżywalność".

Jost to 43 kB na dwa pliki. Hostujemy u siebie, nie z CDN-u Google — z tego samego powodu, co
kroje gazetowe: VTT ma działać przy stole bez internetu.

## Jak odświeżyć krój

Tak samo jak w `docs/assety-screamsheet.md`: pobrać `https://fonts.googleapis.com/css2?family=…`
z nagłówkiem `User-Agent` nowoczesnej przeglądarki, wyjąć adresy `.woff2` z bloków
`/* latin */` i `/* latin-ext */`, zapisać do `public/fonts/`, przepisać `@font-face`. Licencja:
`https://raw.githubusercontent.com/google/fonts/main/ofl/<krój>/OFL.txt`.

## Rysunek bez grafik

Cała karta stoi na dwóch prymitywach CSS (`sheet.css`):

- `.cp-panel` — czerwony prostokąt z 3-pikselowym rowkiem (`gap`) między dziećmi,
- `.cp-field` — pole „papieru" leżące na tym prostokącie.

Wydruk nie ma obramowań pól: ma czerwone tło, które prześwituje między nimi. Dlatego w arkuszu
nie ma ani jednego `border` — rowek robi `gap`, a charakterystyczny ścięty lewy górny narożnik
`clip-path` (pole otoczone czerwienią panelu, więc cięcie odsłania czerwień, a nie dziurę).
Ścięte narożniki całego okna to ten sam `clip-path` na `.sheet-window`.

## Sylwetka ze strony trzeciej (etap 27c)

Strona trzecia arkusza ma render ludzkiego ciała z gniazdami cyborgizacji. Ten render jest
objęty tym samym prawem autorskim co reszta karty, więc go **nie kopiujemy**. W jego miejsce
stoi gotowy kontur z zasobów publicznych — zgodnie z zasadą projektu „darmowy asset z sieci,
hostowany u siebie, zamiast rysunku robionego na kolanie":

| Pole       | Wartość                                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| Plik       | `Human body silhouette.svg`                                                                                |
| Źródło     | https://commons.wikimedia.org/wiki/File:Human_body_silhouette.svg                                          |
| Licencja   | **domena publiczna** („I grant anyone the right to use this work for any purpose, without any conditions") |
| Autorzy    | Mikael Häggström (zdjęcie źródłowe), RexxS i -Strogoff- (obróbka do sylwetki)                              |
| Gdzie leży | `packages/client/src/components/body-silhouette.ts`                                                        |

To **jedna ścieżka SVG** — kontur stojącej postaci od przodu, ręce wzdłuż ciała, układ
współrzędnych 970 × 2206 (głowa u góry). Zmienione wobec oryginału:

- wtopiony `transform="translate(…)"` warstwy Inkscape'a (kontur zaczyna się w zerze),
- precyzja współrzędnych obcięta do jednego miejsca po przecinku — **24 kB → 13 kB**,
- kolor zdjęty z pliku: nadaje go CSS (`.cp-body-shape`), żeby sylwetka szła za motywem
  dzień/noc razem z resztą karty.

Nie jest to plik w `public/`, tylko stała w module TS — dzięki temu gniazda, odnośniki
i kontur siedzą w jednym układzie współrzędnych, a `<img>` nie dałby się przemalować motywem.

### Gniazda na sylwetce

Osiem punktów (`SLOT_ANCHORS` w `CyberwareBody.tsx`) spróbkowanych z konturu: oczy, ucho,
kark, ramiona i uda. **Strony są postaci, nie widza** — widok jest od przodu, więc prawe oko
postaci leży po lewej stronie rysunku, i po lewej stronie stoją wszystkie „prawe" pudełka.
Pudełka są zwykłym HTML-em pozycjonowanym w procentach **tego samego `viewBox`**, co SVG,
więc odnośniki trafiają dokładnie w ich krawędź bez mierzenia czegokolwiek w JS.
