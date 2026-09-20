# Assety — UI w stylu karty postaci (20.09.2026)

Zlecenie MG: zastąpić oba style starego papieru stylem karty postaci w całości,
wraz z teksturami. UI używa wspólnej palety `--cp-*`: jasnego papieru i ciemnego
kartonu, czerwonych nagłówków z pęknięciami tuszu, czarnych belek sekcji, krojów
Jost/Oswald i ściętych rogów. Mapa, Sieć, screamsheet i ekran wejścia mają nadal
własne materiały (nie były częścią zastępowanej pary papierowych skórek).

## Tekstury

`packages/client/public/art/chrome/paper-day.webp` i `paper-night.webp` są teraz
przezroczystymi, bezstratnymi kaflami 1760 × 1760. Powstają bez pobierania nowych
źródeł z **tej samej maski** `art/sheet/paper-wear.jpg`, którą wykorzystuje karta.
Generator czyta kolor `--cp-wear` i krycie `--cp-wear-alpha` bezpośrednio z
`theme.css`; skala `--paper-size` odwołuje się do `--cp-wear-size` (1100 px).

```powershell
uv run --with pillow python tools/art/chrome-paper.py
```

Przebuduj kafle po zmianie maski lub tokenów przetarć karty. Stary generator
osobnego ziarna i załamań został zastąpiony; nowe kafle nie zawierają dodatkowych
włókien ani tekstur Paper004/Paper005. Źródło maski i licencja: Wikimedia Commons,
„Old paper6.jpg”, domena publiczna; szczegóły w `assety-karta-postaci.md`.

Pęknięcia nagłówków, przycisków i banera tury korzystają wprost z istniejących
`art/sheet/ink-cracks-day.webp` i `ink-cracks-night.webp` (`--cp-cracks`).

## CSS

`chrome.css` ładuje się po `styles.css`, przed `sheet.css`. Papier jest warstwą
**tła** z normalnym składaniem alfy, bez `soft-light`. Odtwarza kolor i siłę
przetarć karty na powierzchniach UI, zachowując czytelność napisów i zdjęć;
nie potrzebuje warstwy nad przewijaną treścią ani nowego kontekstu `z-index`.

Duże powierzchnie dopisuj do list w `chrome.css`. Nagłówki okien muszą być także
na liście „Belka” w `theme.css`: jasne napisy i ciemne kontrolki działają tam
w obu motywach. Tytuł aplikacji ma jawny biały kolor — dawna czerwień znikała
na czerwonym nagłówku. Czarne belki sekcji i zakładki mają biały tekst.

Tokeny `--bg-*`, `--border*`, `--text*` są aliasami odpowiednich `--cp-*`;
kolory znaczące nadal mają własne warianty dzień/noc. Kolory samej karty i jej
tekstury źródłowe pozostają źródłem wzorca. `theme.test.ts` pilnuje zasad motywu.

## Widoczność przetarć w wąskich panelach

Duże powierzchnie mają podkład strony karty `--cp-back`; na jaśniejszym
`--cp-paper` białe rysy były zbyt słabo widoczne (korekta po screenie MG, 20.09).
`--paper-position` przesuwa kafel do fragmentu z rysami: domyślnie −340/−420 px,
HUD −80/−620 px, dialogi i parzyste karty panelu −560/−720 px. Skala 1100 px
oraz krycie pozostają wspólne z kartą. W oknach ze ściętymi rogami przesunięcie
dotyczy wyłącznie trzeciej warstwy tła, czyli papieru, nie gradientów narożników.
