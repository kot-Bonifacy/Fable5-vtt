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
| papier (pola)   | `#F6EDDB` | `#171514` |
| tusz            | `#100E0D` | `#F1ECE4` |
| belka kategorii | `#000000` | `#050505` |

Nocna czerwień jest rozjaśniona świadomie: `#CC2316` na czerni gaśnie i belki przestają być
czytelne. Reszta to ten sam arkusz w negatywie.

**Od naprawy 2c (16.09.2026) dzienny papier nie jest biały, tylko pożółkły** — w kremie głównego
interfejsu (decyzja MG: „pożółkły, jak główny UI”, potem „jaśniej”). Wydruk z PDF-u ma biel;
to świadome odejście od wzorca na rzecz starej kartki opisanej niżej.

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

## Stara kartka: wytarcia i pęknięcia (naprawa 2c)

Od 16.09.2026 karta postaci i kreator (klasa `sheet-window--paper`) wyglądają jak wydruk na starej,
zużytej kartce. Kierunek wybrał MG: „papier i druk”, subtelnie, para dzień/noc jak dotąd,
papier jak na tapecie logowania, ale jaśniejszy. **Bez niczego ciemniejszego od papieru.**
Drobinki, potem kilkumilimetrowe kropki, a na końcu miękkie plamy MG odrzucił jako „zabrudzenia”.
Zostały wytarcia (wyblakłe miejsca i jasne rysy) oraz pęknięcia na czerwonych ramkach, dopisane
na propozycję MG.

### Pliki i źródła

| Plik (`packages/client/public/art/sheet/`) | Rozmiar | Źródło | Licencja |
| --- | ---: | --- | --- |
| `paper-wear.jpg` — maska luminancji wytarć | 165 kB* | [„Old paper6.jpg”](https://commons.wikimedia.org/wiki/File:Old_paper6.jpg), Wikimedia Commons, The Digital Yard Sale | **domena publiczna** (PD-author) |
| `ink-cracks-day.webp`, `ink-cracks-night.webp` — przezroczyste rysy w kolorze papieru | ~200 kB każdy | [ambientCG „Asphalt 011”](https://ambientcg.com/view?id=Asphalt011), mapa wysokości 2K | **CC0 1.0** |

\* rozmiar zależy od siły wytarć (`BLEACH_GAIN`, `SCRATCH_GAIN`); przy obecnych ustawieniach
ok. 0,1–0,3 MB.

Wszystkie trzy pliki buduje `tools/art/sheet-paper.py`. Przy pierwszym uruchomieniu pobiera
źródła do `tools/art/.cache/` (katalog w `.gitignore`). Odtworzenie:

```
uv run --with pillow --with numpy python tools/art/sheet-paper.py
```

### Obróbka

- **Wytarcia.** Ze skanu brany jest środek arkusza (1760 × 1760 px), bo przy brzegach są winieta
  i poszarpana krawędź, które w kaflu dałyby pionowy pas. Dalej: logarytm luminancji, zdjęcie
  spadku światła skanera (σ = 400 px) i **składowa okresowa Moisana**. Ta ostatnia robi kafel
  bez szwu, bo odejmuje tylko gładkie pole dopasowujące brzegi. Ciemne punkty są podnoszone do
  jasności otoczenia, zanim cokolwiek się policzy. Zostają szerokie wyblakłe miejsca (σ = 32 px)
  i jasne rysy dłuższe niż kropka. Maska niesie **wyłącznie rozjaśnienie**.
- **Pęknięcia.** Doliny mapy wysokości asfaltu, głębsze od progu, przerzedzone miękkim polem
  szumu. Rysy wychodzą płatami, a nie równą siatką. Plik niesie **kolor papieru**
  (`PAPER_DAY`/`PAPER_NIGHT` w skrypcie), bo rysa w tuszu odsłania kartkę, a CSS nie przemaluje
  obrazu tła. Zgodność z `--cp-paper` pilnuje `theme.test.ts`.
- Próbowane i odrzucone: ambientCG `Paper001/002/006` (makulatura z drobinkami), zestaw
  OpenGameArt „Paper-Textures (seamless)” (za gładki), „Old paper7” (zagięcie na środku).

### Jak to leży w CSS (`sheet.css`, tokeny w `theme.css`)

- **Wytarcia leżą NAD treścią**: `::after` strony w `.sheet-body` (i przyklejonego licznika,
  stopki, okna potwierdzenia kreatora). To pełny kolor `--cp-wear` z maską luminancji, bez
  `mix-blend-mode`, bo dla szarej maski wynik jest ten sam co „ekran”. Nad treścią, bo czerwone
  panele i czarne belki zasłaniają tło w całości.
- **Pęknięcia są obrazem tła** czerwieni (`--cp-cracks`), czyli leżą pod napisami. Wersja nad
  treścią wymazywała litery w polach. Nie ma ich na czarnych belkach, zakładkach ani czerwonych
  komunikatach, bo jasna rysa pod drobnym białym napisem zjadała kontrast.
- **Świadomy koszt, przyjęty przez MG 16.09:** wytarcia nad tekstem rozjaśniają też napisy.
  W dzień przygaszony tekst na papierze (`--cp-ink-dim`) ma 6,0:1, ale w 5% najbardziej wytartej
  powierzchni ~3,8:1, a w najsilniejszych punktach ~3,0:1. Zaproponowany wariant „wytarcia pod
  tekstem” (jako tło belek) MG odrzucił. W nocy kontrast nie schodzi poniżej 4,1:1.

