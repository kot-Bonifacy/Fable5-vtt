# Etap 27a — Karta postaci w stylu oficjalnej karty: strona pierwsza

**Faza:** I — Wykończenie · **Wymaga etapów:** 07, 08 (karta), 23a (Człowieczeństwo)

> **Podział z 2026-08-13.** Etap 27 („Kości 3D i szlif UI") niósł jednym punktem listy cały
> przegląd interfejsu. Życzenie MG — „karta postaci ma wyglądać jak oficjalna" — jest na tyle
> dużym kawałkiem, że został wydzielony na trzy sesje: **27a** (rama, motyw, strona 1),
> **27b** (broń, pancerz, ekwipunek), **27c** (ścieżka życia i cyborgizacje). W etapie 27
> zostaje to, co było: skórki kości, ustawienia animacji, audyt pozostałych widoków,
> wydajność.

## Materiał źródłowy

`C:\AI\materialy\CPR_Karta-Postaci-Edytowalna.pdf` — oficjalna, edytowalna karta postaci
(wydanie polskie, Black Monk). Trzy strony A4 poziomo, 480 pól formularza:

| Strona | Zawartość                                                                                                                                                                                                               |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1      | portret, Ksywa, Rola, Zdolność Specjalna, Notatki · pionowa kolumna 10 cech · trzy kolumny umiejętności · Człowieczeństwo, Punkty Wytrz., Poważnie Ranny, Przeżywalność, Krytyczne Urazy, Uzależnienia · BROŃ I PANCERZ |
| 2      | Pseudonimy, Punkty Doświadczenia, Reputacja · ŚCIEŻKA ŻYCIA (16 pól + przyjaciele, wrogowie, romanse) · Wyposażenie, Amunicja, Gotówka, Styl, Zakwaterowanie, Poziom życia                                              |
| 3      | CYBORGIZACJE — sylwetka z gniazdami (cyberoko, cyberaudio, cyberręka, cybernoga, sprzęg neuralny) i cztery listy boczne                                                                                                 |

## ⚠️ Granica prawna (repo jest publiczne)

**Z PDF-a nie kopiujemy niczego.** Ani grafik ramki, ani logo „Cyberpunk RED", ani renderu
szkieletu ze strony 3. Odtwarzamy wyłącznie **styl**: proporcje, siatkę, kolory i typografię,
własnym CSS-em i własnym SVG. To ta sama zasada, co w `CLAUDE.md` („w repo schematy i parsery,
nigdy treść").

Wartości próbkowane z PDF-a (to fakty o kolorze, nie treść): czerwień `#CC2316`, czerń
`#000000`, biel `#FFFFFF`.

Kroje z PDF-a to **Futura PT** (Book / Bold / Bold Small Caps / Condensed) i **Tw Cen MT
Condensed Extra Bold** — oba komercyjne. Zastępujemy je:

| Krój z karty              | Zamiennik             | Licencja | Skąd                                                          |
| ------------------------- | --------------------- | -------- | ------------------------------------------------------------- |
| Futura PT (Book / Bold)   | **Jost**              | OFL 1.1  | rewitalizacja Futury, zmienna (100–900), 43 kB                |
| Futura PT Condensed Book  | **Oswald** (waga 300) | OFL 1.1  | nazwy umiejętności — bez zwężenia nie mieszczą się w szpalcie |
| Tw Cen MT Cond Extra Bold | **Oswald** (500/700)  | OFL 1.1  | już w repo od etapu 24c                                       |

Kapitaliki („Punkty Wytrz.", „Krytyczne Urazy") — `font-variant-caps: all-small-caps`;
Jost nie ma prawdziwych kapitalików, przeglądarka je syntetyzuje.

## Cel sesji

Strona pierwsza karty przestaje być „formularzem w ciemnym oknie", a zaczyna być **tą kartą**:
jedno szerokie okno, portret i tożsamość po lewej, pionowa kolumna cech, trzy kolumny
umiejętności. Przy okazji powstaje fundament trybu **dzień/noc**, którego etap 27 użyje dla
całego VTT.

## Zakres

- [x] **Kroje**: Jost (zmienny, `latin` + `latin-ext`) w `packages/client/public/fonts/`
      razem z `LICENSE-jost.txt`; deklaracje `@font-face` przy pozostałych
- [x] **Motyw dzień/noc jako fundament**: `packages/client/src/sheet.css` z tokenami obu
      skórek, `data-theme` na `<html>`, store + przełącznik ☀/☾ w górnym pasku
      (ustawienie prywatne, `localStorage`, przeżywa przeładowanie). Domyślnie **noc**
  - **dzień** = wydrukowany arkusz: biały papier, czarne belki kategorii, czerwone panele
  - **noc** = ten sam arkusz w negatywie: czarny papier, te same belki, czerwień rozjaśniona
    do `#E0301F`, żeby świeciła na czerni
  - w tym etapie motyw ubiera **wyłącznie kartę postaci**; reszta UI dołącza w etapie 27
- [x] **Okno karty**: szerokie (`min(1180px, 100vw − 32px)`), przeciągalne jak dotąd,
      czerwona belka tytułowa z ksywą i rolą, zakładki w stylu karty
- [x] **Rama i pola**: czerwone panele z 3-pikselowymi rowkami zamiast obramowań pól,
      ścięty lewy górny narożnik pól (`clip-path`) — dokładnie jak na wydruku
- [x] **Kolumna tożsamości**: portret (z wgrywaniem — przenosi się z zakładki „Biografia"),
      Ksywa, Rola, Zdolność Specjalna z rangą, Notatki, Człowieczeństwo, Punkty Wytrz.,
      Poważnie Ranny, Przeżywalność
- [x] **Kolumna cech**: dziesięć pól w kolejności z karty (INT REF ZW TECH CHA SW SZ RUCH BC
      EMP), etykieta w prawym górnym rogu, klik = rzut; małe pole „z" przy SZ (bieżące
      Szczęście + przycisk odnowienia) i przy EMP (EMP w grze, wyliczane z Człowieczeństwa)
- [x] **Trzy kolumny umiejętności**: belki kategorii (czarne, białe kapitaliki) z kolumnami
      POZ. / CECHA / BAZA, kategorie w kolejności alfabetycznej polskich nazw (tak drukuje
      karta), rozdzielone na trzy kolumny z wyrównaniem wysokości
- [x] Zwężanie okna: trzy kolumny → dwie → jedna (`@container`), bez poziomego paska
- [x] `docs/assety-karta-postaci.md` — pochodzenie krojów i lista tego, czego nie kopiujemy

## Poza zakresem (idzie do 27b / 27c)

- BROŃ I PANCERZ, Wyposażenie, Amunicja, Gotówka, Styl, Poziom życia → **27b**
- Krytyczne Urazy i Uzależnienia w kolumnie tożsamości → **27b** (`CriticalInjuries` mieszka
  dziś w zakładce „Walka", a `Uzależnienia` to nowe pole w modelu — wymaga zmiany w `shared`
  i walidacji na serwerze)
- ŚCIEŻKA ŻYCIA, Pseudonimy, Punkty Doświadczenia, sylwetka z cyborgizacjami → **27c**
- Motyw dzień/noc dla reszty aplikacji (mapa, panele, czat) → **27**
- Wydruk karty do PDF-a, skalowanie okna myszą, zapamiętywanie pozycji okna

## Kryteria ukończenia

- Karta otwarta obok mapy jest **rozpoznawalna jako oficjalna karta CP RED**: jedno spojrzenie
  na portret, kolumnę cech i trzy kolumny umiejętności wystarcza, żeby to zobaczyć
- Wszystko, co działało wcześniej, działa dalej: rzut z cechy, rzut z umiejętności (klik
  i Shift+klik), edycja poziomu, edycja cech, PW, Szczęście, Człowieczeństwo, Test
  Przeżywalności, ostrzeżenie o cyberpsychozie, zapis buforowany i komunikaty walidacji
- Przełącznik ☀/☾ zmienia skórkę karty bez przeładowania i przeżywa przeładowanie strony
- Polskie znaki diakrytyczne poprawne w obu krojach (Jost i Oswald), także w kapitalikach
- Zwężone okno nie robi poziomego paska przewijania
- `pnpm test`, `pnpm lint` i `tsc` czyste

## Wskazówki techniczne

- Kolejność kategorii umiejętności w `CPRED_SKILL_GROUPS` była alfabetyczna **po angielskich
  identyfikatorach**, choć komentarz twierdził, że to kolejność z podręcznika. Karta drukuje je
  alfabetycznie po polsku (Broń Dystansowa, Ciało, Edukacja, Kontrola, Spostrzegawczość,
  Technika, Umiejętności Społeczne, Walka Wręcz, Występy) — poprawiamy stałą i test.
- Podział na trzy kolumny licz w JS, nie `column-count` — policzony podział jest przewidywalny
  i nie gubi ogniska w polach formularza. **Kategoria musi móc przejść przez granicę szpalty**
  (następna zaczyna się od powtórzonej belki z tą samą nazwą) — dokładnie tak robi wydruk,
  na którym „Edukacja" stoi dwa razy. Bez rozcinania pierwsza szpalta wychodzi o połowę
  dłuższa od pozostałych, bo sama „Edukacja" to prawie jedna trzecia listy — sprawdzone
  i optymalnym podziałem bez cięcia (22/14/15 wierszy), i wyjściem docelowym (17/17/18).
- Ścięty narożnik: `clip-path` na polu, które leży na czerwonym panelu — cięcie odsłania
  czerwień panelu, nie dziurę, więc drugi element jest niepotrzebny. Ważne jest tylko to,
  żeby pole **nie miało `border`**: `clip-path` obciąłby obramowanie i zostawił narożnik
  bez kreski.
- Karta nie ma testów jednostkowych (UI, zgodnie z `CLAUDE.md`) — sprawdzamy ją w przeglądarce,
  po obu stronach stołu.
