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
