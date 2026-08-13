# Assety — screamsheety (etap 24c)

## Kroje pisma

Szablon gazetowy używa trzech krojów, wszystkich na licencji **SIL Open Font License 1.1**
(wolno używać, osadzać i redystrybuować, także w publicznym repo — wymagane jest dołączenie
tekstu licencji, co robimy):

| Krój         | Rola w szablonie                     | Autorzy / źródło                             |
| ------------ | ------------------------------------ | -------------------------------------------- |
| **Anton**    | wielki nagłówek                      | The Anton Project Authors (Google Fonts)     |
| **Oswald**   | winieta brukowca, stopka, śródtytuły | The Oswald Project Authors (Google Fonts)    |
| **PT Serif** | lead i treść artykułu w szpaltach    | ParaType Ltd. (nazwa zastrzeżona w licencji) |

## Gdzie leżą

`packages/client/public/fonts/` — pliki `.woff2` plus `LICENSE-anton.txt`,
`LICENSE-oswald.txt` i `LICENSE-ptserif.txt`. Vite serwuje je pod `/fonts/`, a deklaracje
`@font-face` stoją na początku `packages/client/src/styles.css`.

Dwie decyzje warte zapamiętania:

- **Hostujemy je u siebie, nie z CDN-u Google.** VTT ma działać przy stole bez internetu
  (i bez wysyłania adresów IP graczy do Google), a wdrożenie na VPS z etapu 28 nie zakłada
  żadnego zewnętrznego hosta.
- **Każdy krój jest w dwóch podzestawach: `latin` i `latin-ext`.** Bez tego drugiego
  przeglądarka podmieniłaby krój na zastępczy przy pierwszym „ą" albo „ł" — a screamsheet
  jest po polsku. Zakresy `unicode-range` w CSS są dokładnie te, których używa Google Fonts.

Razem ~316 kB, ładowane z `font-display: swap`, więc gazeta pokazuje się od razu, a kroje
podmieniają się po wczytaniu.

## Jak odświeżyć albo zmienić krój

Pliki pobrał skrypt jednorazowy (nie ma go w repo — to trzy linie): wystarczy pobrać
z `https://fonts.googleapis.com/css2?family=…` arkusz z nagłówkiem `User-Agent` nowoczesnej
przeglądarki, wyjąć z niego adresy `.woff2` dla bloków `/* latin */` i `/* latin-ext */`,
zapisać pliki do `public/fonts/` i przepisać `@font-face` na ścieżki `/fonts/…`. Licencję
kroju bierze się z `https://raw.githubusercontent.com/google/fonts/main/ofl/<krój>/OFL.txt`.

## Papier i „szpalty"

Bez assetów: tło gazety to gradient CSS (`.screamsheet` w `styles.css`), a podział na szpalty
robi `column-width: 15rem`, więc w wąskim oknie handoutu tekst sam schodzi do jednej kolumny.
Wgrana grafika handoutu staje się zdjęciem prasowym — `filter: grayscale(.75) contrast(1.15)`
robi z niej odbitkę gazetową, bez ruszania oryginalnego pliku.
