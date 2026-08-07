# Etap 16g — Amunicja specjalna: kule, które zmieniają rachunek

**Faza:** D — Walka · **Wymaga etapów:** 16d (geometria obszaru i stożka), 15 (matematyka obrażeń), 14e (DoT)

## Cel sesji

Rodzaj naboju wreszcie coś znaczy. Po tym etapie amunicja, która **zmienia rozliczenie
trafienia** — pancerz, ranę krytyczną, śmiertelność, obszar rażenia — jest w mechanice.

**Pochodzenie:** wydzielony z etapu 16d 2026-08-01 (decyzja MG), a 2026-08-07 **podzielony
na 16g i 16h** (decyzja MG przed startem sesji). Powód podziału jest ten sam, dla którego
16d było na dwie sesje: 13 typów amunicji z podręcznika rozpada się na dwie rodziny, które
nie mają ze sobą prawie nic wspólnego kodowo.

- **16g (ten etap): naboje, które trafiają.** Zmieniają matematykę obrażeń (przeciwpancerna,
  gumowa, dumdum), nakładają status ścieżką z 14e (zapalająca) albo zmieniają geometrię
  ataku (śrut). Wszystkie kończą się rzutem na obrażenia i kartą z 15.
- **16h: naboje, które nie zadają obrażeń.** Biotoksyczna, zatruta, usypiająca, łzawiąca,
  hukbłyskowa, EMP, inteligentna i dymna zamiast obrażeń wymuszają **test celu**, nakładają
  **czasowe rany krytyczne**, dotykają **cyborgizacji** (etap 23) albo **widoczności**
  (18a–18c). To osobny mechanizm — wymuszony test na karcie i efekt na minutę — więc idzie
  osobną sesją.

## Zakres

- [x] **Typ amunicji jako dane kompendium** — nowa kategoria wpisu („Amunicja”) obok broni
      i pancerza, z flagami maszynowymi (`ablationBonus`, `noAblation`, `noCriticalInjury`,
      `nonLethal`, `ignites`, `extraInjuryOn`, `spread`, `patterns`), nie łańcuch ifów.
      Decyzja MG (07.08): kategoria wpisu, nie tabela obok typów broni — amunicja **jest**
      kupowana, więc ma dostać cenę, opis, edytor MG i wyszukiwarkę za darmo.
- [x] **Wybór naboju na wierszu broni** — wiersz dostaje odniesienie do wpisu amunicji;
      dotychczasowe tekstowe `ammoType` („Karabinowa”) zostaje jako **kaliber** wypisany na
      karcie, bo to inna rzecz niż rodzaj naboju („Amunicja zapalająca do karabinu”).
- [x] **Zmiana naboju kosztuje Przeładowanie w walce** (decyzja MG 07.08): poza walką jest
      darmowa (to edycja karty), w turze idzie ścieżką `weapon:reload` — Akcja i magazynek
      do pełna, bo żeby zmienić nabój, trzeba przeładować.
- [x] **Dopasowanie naboju do broni** — każdy nabój ma listę wzorców (kule, naboje śrutowe,
      strzały, granaty, rakiety), a każdy typ broni mówi, co komorowa. Nabój nie pasujący do
      broni jest odmawiany po nazwie, nie po cichu.
- [x] **Typy z podręcznika (s. 345–347)** należące do tej rodziny:
  - **przeciwpancerna** — uszkadza pancerz o **2 punkty zamiast 1** (patrz „Uwaga o RAW”)
  - **zapalająca** — po przebiciu pancerza nakłada Podpalonego: **2 obrażenia** bezpośrednie
    na koniec każdej tury celu, gaszone Akcją; efekty z kilku źródeł się nie kumulują
  - **gumowa** — brak ran krytycznych, pancerz się nie zużywa, a cel mający >1 PW nie spada
    poniżej 1 PW
  - **dumdum** — rana krytyczna „Ciało obce” przerzucana aż do innej rany; cel dostaje **obie**
    (patrz „Uwaga o RAW” — opis 16d mówił „zamiast”), bez dodatkowych obrażeń z drugiej
  - **śrut** — sztywne PT 13, sztywne 3k6, wszyscy w stożku 6 m przed strzelcem i w polu
    widzenia; **nie można Celować**; cele z REF 8+ mogą Unikać (s. 174)
- [x] **Miotacz ognia** jako strzelba strzelająca wyłącznie zapalającymi nabojami śrutowymi —
      z podpaleniem na **4** obrażenia zamiast 2, bez ran krytycznych i bez Celowania (s. 348)
- [x] Testy: przeciwpancerna vs pancerz, zapalająca nakładająca Podpalonego, gumowa
      niezabijająca, przynależność do stożka, tabela dopasowania naboju do broni

## Poza zakresem

- **Cała rodzina naboi bez obrażeń** — etap 16h (biotoksyczna, zatruta, usypiająca, łzawiąca,
  hukbłyskowa, EMP, inteligentna, dymna)
- **Trucizny z pełnym testem Odporności** ponad to, co daje wiersz amunicji — pełna
  mechanika trucizn ma własny wpis w POMYSLY
- **Zapas amunicji w ekwipunku** (ile sztuk którego rodzaju postać ma w plecaku) — magazynek
  liczy naboje w broni, reszta to ekonomia z etapu 23
- Rakiety jako pozycja ekwipunku poza samym typem amunicji

## Kryteria ukończenia

- Amunicja przeciwpancerna zdejmuje 2 punkty OB zamiast 1, a karta obrażeń pokazuje to jako
  nazwany wpis rozbicia (wzorzec „Trzymanie −2” z 14d), nie jako cichą korektę
- Zapalająca nakłada Podpalonego, który pali na końcu tury ścieżką z 14e
- Gumowa nie zbija celu poniżej 1 PW i nie zużywa pancerza
- Strzał śrutem rysuje stożek 6 m i rozlicza wszystkich w nim przeciw PT 13
- Nabój nie pasujący do broni jest odmawiany z nazwą naboju i broni
- Testy jednostkowe: matematyka amunicji, dopasowanie naboju do broni

## Uwaga o RAW (znalezione 2026-08-01, uzupełnione 2026-08-07)

Pierwotny opis etapu 16d obiecywał, że amunicja przeciwpancerna **dzieli SP celu na pół**,
a kryterium ukończenia mówiło „OB 11 liczy się jak 5”. **Podręcznik mówi co innego** —
s. 345: „Gdy taka amunicja trafia przeciwnika w pancerzu, uszkadza pancerz o 2 punkty,
a nie 1 (jeśli atak uszkadza pancerz)”. Dzielenie pancerza na pół w CP RED istnieje, ale
dotyczy **broni białej** (s. 175) i zaokrągla **w górę** (11 → 6, nie 5), więc pierwotne
kryterium było błędne podwójnie. Etap idzie za podręcznikiem.

Drugie sprostowanie (07.08, przy czytaniu s. 345): **dumdum nie zamienia rany, tylko dokłada
drugą**. „Cel rzuca ponownie …, dopóki nie wylosuje rany innej niż Ciało obce. Następnie cel
otrzymuje **także** tę wylosowaną Ranę Krytyczną. Nie zadaje ona kolejnych obrażeń
dodatkowych.” Czyli: Ciało obce **zostaje**, dochodzi druga rana, a 5 obrażeń dodatkowych
liczy się raz.

Trzecie (07.08): gumowa w polskim wydaniu mówi „spadną **poniżej 0**”, co literalnie
zostawiałoby cel na dokładnie 0 PW (czyli Śmiertelnie rannego, z Testami Przeżywalności) —
sprzecznie z sensem amunicji obezwładniającej i z kryterium tego etapu. Implementacja idzie
za kryterium: **cel, który miał więcej niż 1 PW, zatrzymuje się na 1 PW**.

## Wskazówki techniczne

- Typ amunicji to **dane w kompendium**, nie gałąź w kodzie — ten sam wzorzec, co flagi ran
  krytycznych z 14e, kary pancerza z 14c i flagi typu broni z 16d
- Stożek 6 m ma geometrię z etapu 16d (`systems/cpred/areas.ts`) — nie buduj drugiej.
  Rozliczenie celów w stożku idzie tą samą drogą co wybuch (`RollAreaMeta`), bo pytania są
  te same: kto jest w środku, kogo zasłania ściana albo osłona, kto może odskoczyć
- Podpalony (`on-fire`) istnieje od 14e z domyślnymi **4** obrażeniami (wartość miotacza
  ognia). Amunicja zapalająca pali za **2**, więc DoT musi umieć przyjąć wartość z naboju
  zamiast domyślnej ze statusu — mechanizm `Token.statusData` z 14e już to potrafi
- **Licencja:** nazwy, ceny i treść wierszy amunicji to podręcznik → `data/private/`;
  w repo zostaje kształt z wymyślonymi wartościami
