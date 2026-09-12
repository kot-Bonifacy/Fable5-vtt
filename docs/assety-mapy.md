# Mapy do VTT — źródła i prompty AI

Notatki z etapu 04. Gdzie brać grafiki map, czego pilnować licencyjnie i jak generować własne mapy przez AI.

## Zasady

- **Do repo (`data/public/`) trafiają wyłącznie grafiki własnego autorstwa** (np. generowane skryptem albo przez AI z licencją pozwalającą na redystrybucję). Mapy pobrane z sieci trzymaj w `uploads/` (gitignore) — użytek prywatny przy stole to co innego niż publikacja w publicznym repo.
- Mapy wgrywamy **bez wrysowanej siatki** — siatkę rysuje VTT (konfigurowalna w edytorze sceny). Jeśli mapa ma już siatkę, dopasuj `rozmiar kratki` i `offset` do niej suwakami.
- Skala CP RED: **1 kratka = 2 m**. Przy 100 px/kratkę mapa 4096×4096 ≈ 82×82 m (spory kwartał ulic).

## Mapy w repo

### `night-city-crossroads-2508.webp` — mapa do gry

- **Autorstwo MG**: wygenerowana AI z promptu nr 1 z tego pliku („Skrzyżowanie w Night City"), potem upscale do 2508×2508 px. Własna praca właściciela projektu, więc może być w publicznym repo — inaczej niż mapy z sieci, które zostają w `uploads/`.
- **Format WebP, jakość 90** (1,4 MB zamiast 10,7 MB w PNG — 7,6×). Różnica wobec PNG jest niewidoczna przy oglądaniu 1:1 (średnia różnica kanału 1,8/255, najgorszy piksel 23/255), a przy grze przez internet po etapie 28 to jedyny rozsądny format dla dużych map. Endpoint `POST /api/uploads/maps` przyjmuje WebP od etapu 04 (`packages/server/src/routes/uploads.ts`). Konwersja, gdyby trzeba było powtórzyć ją dla kolejnej mapy:

  ```
  uv run --with pillow python -c "from PIL import Image; Image.open('mapa.png').convert('RGB').save('mapa.webp','WEBP',quality=90,method=6)"
  ```

- Zawartość: skrzyżowanie z przejściami dla pieszych, auta w ruchu i przy krawężniku, cztery narożniki zabudowy z wnętrzami (bar, sklepy, parking, lądowisko na dachu), neony i mokry asfalt. **Bez wrysowanej siatki i bez tekstu** — siatkę rysuje VTT.
- **Skala jest wiążąca dla wrażenia z mapy** (1 kratka = 2 m): przy 100 px/kratkę te 2508 px to ~50 × 50 m, przy 60 px/kratkę ~84 × 84 m. Kalibrację robi się suwakami w edytorze sceny — dopasuj kratkę do szerokości jezdni, a nie do okrągłej liczby.
- Wnętrza budynków są widoczne, więc mapa dobrze współgra ze ścianami i mgłą MG z etapów 17a–18e.

### `test-map-4096.png` — mapa testowa

- `data/public/maps/test-map-4096.png` — generowany programowo przez `scripts/generate-test-map.mjs` (czysty Node, bez zależności; PNG kodowany ręcznie). 4096×4096 px, ~4,3 MB. Wolny od praw osób trzecich, bez wrysowanej siatki i bez tekstu. Regeneracja: `node scripts/generate-test-map.mjs [plik]`.
- **Skala jest wiążąca dla wyglądu mapy.** Przy 1 kratce = 2 m i 100 px/kratkę mapa 4096 px to ~82 × 82 m — czyli **jedno skrzyżowanie**, nie dzielnica. Poprzednia wersja rysowała 5×5 „kwartałów”, z których każdy miał w praktyce 6,6 m szerokości; dlatego wyglądała jak schemat, a nie miasto. Jeśli będziesz robić kolejne mapy proceduralnie — najpierw policz metry.
- Zawartość: aleja N–S (20 m) × przecznica E–W (12 m), zaokrąglone krawężniki, przejścia dla pieszych, sygnalizacja, wysepka rozdzielająca, cztery narożniki zabudowy (dach z lądowiskiem, kamienice z zaułkami 2 m, parking, plac budowy, stragany), auta przy krawężniku i w ruchu, neony z poświatą, kałuże. Wszystkie krawędzie ulic i budynków leżą na wielokrotnościach 100 px, więc siatka pasuje przy offsecie 0.
- W rogach są cztery małe kropki kalibracyjne (cyan / limonka / bursztyn / magenta) — pozwalają na pierwszy rzut oka potwierdzić, że wczytało się pełne 4096 px.

## Mapa powitalna gracza — `uploads/art/welcome-map.webp` (poza repo)

Tło, które widzi gracz, gdy kampania **nie ma aktywnej sceny** (zlecenie MG, 11.09.2026). Do tej
pory ten stan wyglądał jak czarne pole ze zdaniem „Brak aktywnej sceny — MG musi ją aktywować";
od 11.09 stoi tam zwykła mapa — brama strefy przemysłowej, 40 × 30 kratek. MG tego tła **nie
dostaje**: jego „Brak sceny — utwórz i aktywuj ją" to komunikat roboczy, a nie wyrwa w immersji.

- **Plik leży poza repozytorium i tak ma zostać.** Źródło: darmowa mapa do użytku prywatnego
  (nie jest to praca własna MG, inaczej niż `night-city-crossroads-2508.webp` i plakat
  logowania), więc obowiązuje zasada z góry tego pliku: użytek przy stole to co innego niż
  publikacja w publicznym repo. Katalog `uploads/` jest w `.gitignore`.
- **Ścieżka jest umową**: `uploads/art/welcome-map.webp`, adres `/uploads/art/welcome-map.webp`.
  Stała siedzi w `packages/client/src/map/welcome-map.ts`.
- **Dlaczego `art/`, a nie `maps/`.** Zbieracz sierot (`uploads-gc.ts`) sprząta **cztery**
  katalogi — `maps`, `portraits`, `tokens`, `handouts` — i kasuje z nich każdy plik, którego nie
  wymienia żaden wiersz bazy, godzinę po wgraniu. Mapy powitalnej nie wymienia nic (to nie jest
  scena), więc w `uploads/maps/` **zniknęłaby po godzinie** przy pierwszym starcie serwera.
  Katalog `art/` nie jest zamiatany.
- **Brak pliku nie jest awarią.** Klient sonduje obraz przed pokazaniem (`loadWelcomeScene`);
  gdy pliku nie ma — a nie ma go na świeżym klonie repozytorium — wraca dawne zdanie o braku
  sceny. **Przy wdrożeniu na VPS (etap 28) plik trzeba skopiować ręcznie**, razem z resztą
  `uploads/`; bez tego kroku funkcja po prostu nie istnieje i nikt tego nie zauważy.
- **Siatka liczy się z pliku, nie z kodu**: `szerokość / 40` i `wysokość / 30`. Podmiana mapy na
  inną **40 × 30** nie wymaga więc ani jednej linii kodu; przy innej skali trzeba poprawić
  `WELCOME_MAP_COLUMNS` / `WELCOME_MAP_ROWS`.
- **Gracz startuje pośrodku dolnej krawędzi, przybliżony na osiem kratek wokół siebie**, i nie
  wyjedzie kamerą poza obraz (`map/camera.ts`). Na tle powitalnym punktu startu nie da się
  przestawić — nie ma wiersza w bazie, w którym MG mógłby go zapisać; na zwykłych scenach służy
  do tego narzędzie „Miejsce startu graczy" (klawisz `G`).

### Plik: `StrefaPrzemyslowa-40x30.png` → WebP q90

Wersja z 11.09.2026 (druga tego dnia): **2896 × 2176 px**, kratka **72,4 px**. Poprzedni plik
(`IndustrialAreaGate-40x30.png`, 1448 × 1086) był tą samą mapą w połowie rozdzielczości —
za mało, odkąd gracz startuje przybliżony: przy ośmiu kratkach wokół siebie oglądałby go
w powiększeniu 2×.

**Uwaga o wysokości:** 2176 nie dzieli się równo przez 30 (72,53 zamiast 72,4), więc ostatni rząd
kratek jest o **4 px** wyższy od pozostałych. Na oko niewidoczne; ale to znaczy, że plik nie jest
dokładnym dwukrotnym powiększeniem poprzedniego i że siatkę liczy się z **szerokości**.

Konwersja z PNG 7911 kB do **WebP q90, 581 kB** (13,6×). Pomiary względem oryginału
(19 mln kanałów):

| wariant      |    rozmiar |    max |  średnia | kanałów > 10 |        PSNR |
| ------------ | ---------: | -----: | -------: | -----------: | ----------: |
| WebP q95     |    1077 kB |     85 |     1,32 |       0,74 % |     40,9 dB |
| **WebP q90** | **581 kB** | **93** | **1,63** |   **0,88 %** | **39,7 dB** |
| WebP q85     |     397 kB |     83 |     1,87 |       1,14 % |     38,7 dB |

Między q95 a q90 różnica siedzi w szumie (0,74 % vs 0,88 % kanałów odchylonych o więcej niż 10),
a 496 kB przy każdym wejściu gracza to realna cena; gdyby mapa miała kiedyś służyć do gry,
a nie do patrzenia, wróć do q95. Konwersja:

```
uv run --with pillow python -c "from PIL import Image; Image.open('mapa.png').convert('RGB').save('welcome-map.webp','WEBP',quality=90,method=6)"
```

## Darmowe mapy z sieci (sprawdzone źródła)

| Źródło                                                                                                          | Co jest                                                         | Licencja / uwagi                                           |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------- |
| [2-Minute Tabletop — Cyberpunk Street Assets](https://2minutetabletop.com/product/cyberpunk-street-assets/)     | darmowe assety ulic + demo mapa „Industrial Sector” (dzień/noc) | CC BY-NC 4.0 — OK do gry, **nie** do repo                  |
| [2-Minute Tabletop — przegląd map cyberpunk](https://2minutetabletop.com/cyberpunk-city-map-assets/)            | 200+ assetów, część darmowa                                     | jw.                                                        |
| [Fragmaps Cyberpunk Battlemaps (moduł Foundry)](https://foundryvtt.com/packages/fragmaps-free)                  | ulice, serwerownia, przedmieścia                                | darmowy moduł; PNG można wyjąć z paczki do użytku własnego |
| [SolutionMaps — Free Cyberpunk & Sci-Fi (moduł Foundry)](https://foundryvtt.com/packages/solutionmaps-freebies) | paczka darmowych map sci-fi/cyberpunk                           | jw.                                                        |
| [itch.io — tag battlemap + cyberpunk](https://itch.io/game-assets/tag-battlemap/tag-cyberpunk)                  | dużo pojedynczych map „name your own price”                     | licencja per pozycja — czytaj opis                         |
| [Kolekcja „Cyberpunk Battlemaps” na itch.io](https://itch.io/c/3314356/cyberpunk-battlemaps)                    | wyselekcjonowana kolekcja                                       | jw.                                                        |

## Prompty do generatorów grafik (Midjourney / DALL-E / SD / Flux)

Wspólne zasady: generuj **top-down (widok z góry, 90°)**, **bez siatki**, **bez napisów**, proporcje 1:1 lub 4:3, potem upscale do ~4096 px. Doklejka stylu do każdego promptu:

> _top-down battle map for a tabletop RPG, strict overhead view, cyberpunk night city, neon lighting, wet asphalt reflections, gritty dystopian atmosphere, high detail, no grid, no text, no labels, no characters_

Gotowe prompty (dopisz doklejkę stylu):

1. **Skrzyżowanie w Night City**
   > _a four-way city street intersection with crosswalks, parked futuristic cars, food stalls with neon signs, trash-filled alleys between concrete buildings, holographic advertisements glowing on the pavement_
2. **Klub nocny (wnętrze)**
   > _interior floor plan of a two-level nightclub, dance floor with glowing tiles, bar counter, VIP booths, DJ stage, back office and storage room, restrooms, neon purple and cyan lighting_
3. **Mieszkanie / kryjówka netrunnera**
   > _interior floor plan of a cramped megabuilding apartment, mattress on the floor, wall of computer monitors and server racks, tangled cables, kitchenette, narrow balcony, single entrance corridor_
4. **Dach wieżowca**
   > _rooftop of a corporate skyscraper at night, helipad with landing lights, air-conditioning units, satellite dishes, maintenance catwalks, glass skylight, distant city lights far below_
5. **Magazyn w strefie przemysłowej**
   > _industrial warehouse interior with shipping containers, forklift, metal catwalks along the walls, loading dock with two truck bays, small glass-walled office, oil stains on concrete floor_
6. **Zaułek za barem**
   > _narrow back alley between two buildings, dumpsters, fire escape ladders, steam rising from vents, graffiti walls, a single flickering neon sign, puddles reflecting pink and blue light_

Po wygenerowaniu: sprawdź, czy AI nie wrysowało siatki/tekstu; w razie potrzeby dotnij tak, by krawędzie budynków leżały na wielokrotności kratki — kalibrację i tak zrobisz suwakami w edytorze sceny.
