# Etap 16g — Amunicja specjalna

**Faza:** D — Walka · **Wymaga etapów:** 16d (geometria obszaru i stożka), 15 (matematyka obrażeń), 14e (DoT)

## Cel sesji

Rodzaj naboju wreszcie coś znaczy. Po tym etapie walka dystansowa CP RED jest kompletna.

**Pochodzenie:** wydzielony z etapu 16d 2026-08-01 (decyzja MG). 16d był realnie na dwie
sesje: 13 typów amunicji z podręcznika dotyka podsystemów spoza walki dystansowej (dymna
wpina się w widoczność z 18a–18c, EMP w cyborgizacje, hukbłyskowa i łzawiąca w rany
krytyczne, usypiająca w statusy), a sam 16d ma geometrię, nowy tryb celowania i rozliczenie
N celów. Wpis pochodzi z POMYSLY z 27.07.

## Zakres

- [ ] **Typ amunicji jako dane kompendium** — nowa kategoria wpisu albo tabela obok typów
      broni, z flagami maszynowymi (`ablationBonus`, `appliesStatus`, `nonLethal`,
      `noCriticalInjury`, `resistanceCheck`, `pattern`), nie łańcuch ifów
- [ ] **Wybór naboju na wierszu broni** — pole `ammoType` istnieje od etapu 16 jako tekst
      („Karabinowa"); rozszerz je o odniesienie do wpisu zamiast dokładać drugie pole
- [ ] **Typy z podręcznika (s. 345–347)**, każdy z zapisaną listą broni, do których pasuje:
  - **przeciwpancerna** — uszkadza pancerz o **2 punkty zamiast 1** (patrz „Uwaga o RAW")
  - **zapalająca** — po przebiciu pancerza nakłada Podpalonego: **2 obrażenia** bezpośrednie
    na koniec każdej tury celu, gaszone Akcją; efekty z kilku źródeł się nie kumulują
  - **gumowa** — brak ran krytycznych, pancerz się nie zużywa, a cel mający >1 PW nie spada
    poniżej 1 PW
  - **dumdum** — rana krytyczna „Ciało obce" przerzucana aż do innej rany, bez dodatkowych
    obrażeń
  - **biotoksyczna, zatruta, usypiająca, łzawiąca, hukbłyskowa** — nie zadają obrażeń,
    wymuszają test Odporności na tortury/narkotyki o PT z wiersza; porażka to obrażenia
    bezpośrednie albo status/rana na minutę
  - **EMP** — test Cyberinżynierii PT 15, MG wybiera dwie cyborgizacje do wyłączenia
  - **inteligentna** — wymaga Celownika optycznego; pudło o ≤ 4 daje drugi rzut 1k10 + 10
  - **dymna** — zasnuwa kwadrat 10×10 m, −4 do działań w dymie (wpina się w widoczność)
  - **śrut** — sztywne PT 13, sztywne 3k6, wszyscy w stożku 6 m przed strzelcem i w polu
    widzenia; **nie można Celować**; cele z REF 8+ mogą Unikać (s. 174)
- [ ] **Miotacz ognia** jako strzelba strzelająca wyłącznie zapalającymi — z podpaleniem na
      **4** obrażenia zamiast 2 (s. 348)
- [ ] Testy: przeciwpancerna vs pancerz, zapalająca nakładająca Podpalonego, gumowa
      niezabijająca, przynależność do stożka, tabela dopasowania naboju do broni

## Poza zakresem

- **Trucizny z pełnym testem Odporności** ponad to, co daje wiersz amunicji — pełna
  mechanika trucizn ma własny wpis w POMYSLY
- **Cyborgizacja „Celownik optyczny"** wymagana przez amunicję inteligentną — etap 23;
  do tego czasu wymóg jest ostrzeżeniem na karcie, nie odmową
- Rakiety jako pozycja ekwipunku poza samym typem amunicji

## Kryteria ukończenia

- Amunicja przeciwpancerna zdejmuje 2 punkty OB zamiast 1, a karta obrażeń pokazuje to jako
  nazwany wpis rozbicia (wzorzec „Trzymanie −2" z 14d), nie jako cichą korektę
- Zapalająca nakłada Podpalonego, który pali na końcu tury ścieżką z 14e
- Gumowa nie zbija celu poniżej 1 PW i nie zużywa pancerza
- Strzał śrutem rysuje stożek 6 m i rozlicza wszystkich w nim przeciw PT 13
- Testy jednostkowe: matematyka amunicji, dopasowanie naboju do broni

## Uwaga o RAW (znalezione 2026-08-01)

Pierwotny opis etapu 16d obiecywał, że amunicja przeciwpancerna **dzieli SP celu na pół**,
a kryterium ukończenia mówiło „OB 11 liczy się jak 5". **Podręcznik mówi co innego** —
s. 345: „Gdy taka amunicja trafia przeciwnika w pancerzu, uszkadza pancerz o 2 punkty,
a nie 1 (jeśli atak uszkadza pancerz)". Dzielenie pancerza na pół w CP RED istnieje, ale
dotyczy **broni białej** (s. 175) i zaokrągla **w górę** (11 → 6, nie 5), więc pierwotne
kryterium było błędne podwójnie. Etap idzie za podręcznikiem.

## Wskazówki techniczne

- Typ amunicji to **dane w kompendium**, nie gałąź w kodzie — ten sam wzorzec, co flagi ran
  krytycznych z 14e, kary pancerza z 14c i flagi typu broni z 16d
- Stożek 6 m ma geometrię z etapu 16d (`systems/cpred/areas.ts`) — nie buduj drugiej
- Podpalony (`on-fire`) istnieje od 14e z domyślnymi **4** obrażeniami (wartość miotacza
  ognia). Amunicja zapalająca pali za **2**, więc DoT musi umieć przyjąć wartość z naboju
  zamiast domyślnej ze statusu
- **Licencja:** nazwy, ceny i treść wierszy amunicji to podręcznik → `data/private/`;
  w repo zostaje kształt z wymyślonymi wartościami
