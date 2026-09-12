# Assety — plakat ekranu wejścia

Plik: `packages/client/public/art/login-poster.webp` (1672 × 941, 1,77 MB).
Tło ekranu logowania MG, ekranu dołączania gracza i ekranu startowego.
Style: `.auth-screen` w `packages/client/src/styles.css`, kolory `--login-*` w `theme.css`.

## Pochodzenie i granica prawna

- **Praca własna właściciela projektu** — obraz wygenerowany AI z własnego promptu, tak samo jak
  mapa `night-city-crossroads-2508.webp` (patrz `docs/assety-mapy.md`). Z żadnego oficjalnego
  materiału nie pochodzi tu ani jeden bajt: nie jest to skan, kadr ani przeróbka podręcznika,
  plakatu ani grafiki wydawcy.
- **Znaki towarowe widoczne na obrazie należą do kogoś innego.** Napis „Cyberpunk RED", „Arasaka",
  „Militech" i „Night City" to własność R. Talsorian Games (wydanie polskie: Black Monk). Obraz
  wisi w publicznym repozytorium jako fan-art do prywatnego stołu, nie jako materiał wydawcy,
  i nie wolno go sprzedawać ani podawać za oficjalny.
- To **inna sytuacja niż w `docs/assety-karta-postaci.md`**: tam granicą było „stylu wolno,
  bajtów nie", bo wzorem był plik wydawcy. Tu wzoru nie było — obraz powstał od zera.
- Gdyby to kiedyś miało być problemem, wystarczy przenieść plik do `uploads/` (gitignore)
  i serwować go stamtąd: `.auth-screen` ma pod spodem `var(--login-paper)`, więc **ekran bez
  tapety nadal się czyta** — kremowy papier zamiast plakatu, napisy bez zmian.

## Format: WebP bezstratny, nie stratny

Źródło: `tapeta_logowania.png`, 2745 kB. W repo leży **WebP bezstratny**, 1811 kB — o 34% mniej
od PNG i **identyczny co do bitu** (największa różnica kanału: 0).

Wariantów stratnych nie ma tu sensu używać, bo plakat jest cały z ziarna filmowego i rys, a to
pierwsza rzecz, którą kodek stratny wyrzuca. Pomiary względem oryginału:

| wariant           |   rozmiar | największa różnica kanału |    PSNR |
| ----------------- | --------: | ------------------------: | ------: |
| **WebP bezstratny** | **1811 kB** |                     **0** | **∞** |
| WebP q100         |    680 kB |                        79 | 38,0 dB |
| WebP q95          |    481 kB |                        78 | 37,6 dB |
| WebP q90          |    306 kB |                        87 | 36,5 dB |

Odchyłka 78–87/255 nawet przy q100 to nie jest „prawie to samo" — to ziarno przerobione na plamy.
Gdyby kiedyś rozmiar zaczął uwierać (ekran wejścia ciągnie te 1,8 MB przy pierwszym wejściu
z VPS-a, potem leci z pamięci podręcznej), świadomym kompromisem jest q95; **q90 i niżej już widać.**

Konwersja, gdyby trzeba ją było powtórzyć:

```
uv run --with pillow python -c "from PIL import Image; Image.open('tapeta.png').convert('RGB').save('login-poster.webp','WEBP',lossless=True,quality=100,method=6)"
```

Uwaga: Pillow **po cichu ignoruje** `near_lossless` — poproszony o nie, zapisuje zwykły plik
bezstratny. Sprawdzone; nie ma po co próbować drugi raz.

## Geometria, na której stoi układ ekranu

Plakat ma pośrodku narysowaną czerwoną ramkę celownika i to **ona jest ramką formularza** —
dlatego jej współrzędne są wiążące dla CSS-u. Wykryte w pliku (długie ciągi czerwonych pikseli,
nie na oko):

| krawędź    | piksel | ułamek pliku |
| ---------- | -----: | -----------: |
| lewa       |    528 |       31,58% |
| prawa      |   1138 |       68,06% |
| górna      |    137 |       14,56% |
| dolna      |    594 |       63,12% |
| **środek** |      — | **49,8% × 38,8%** |

Poziomo to praktycznie środek obrazu, pionowo **11,16% wyżej** — stąd `translate` w `.auth-screen`.
Wnętrze ramki (36,5% × 48,6% obrazu) to równy kremowy papier, i tylko dlatego formularz może nie
mieć własnego tła. **Zmiana pliku na inny wymaga przemierzenia tych liczb od nowa.**

## Barwy spróbkowane z pliku

| co                     |    wartość | gdzie w motywie      |
| ---------------------- | ---------: | -------------------- |
| papier (średnia wnętrza ramki) | `#dec4a1` | `--login-paper`      |
| czerwień dolnej linii ramki    | `#c11715` | `--login-red`        |
| czerwień logo                  | `#d7271c` | (odniesienie)        |

Kontrasty na papierze, liczone wg WCAG: sadza `--login-ink` 10,7:1, przygasła sadza
`--login-ink-dim` 4,6:1, `--login-red-deep` (komunikat błędu) 5,6:1, `--login-on-red` na czerwonym
przycisku 5,2:1 — wszystkie ponad progiem AA. **`--login-red` ma na papierze tylko 3,7:1**, więc
wolno nim rysować kreski i tła, ale nie pisać nim drobnego tekstu.
