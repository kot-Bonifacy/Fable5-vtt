# Etap 16 — Zasięgi, DV z mapy, autofire 🏁 Pełna automatyka walki

**Faza:** D — Walka · **Wymaga etapów:** 15

## Cel sesji

Mapa zaczyna liczyć walkę dystansową: pomiar odległości, automatyczne DV wg broni i dystansu, autofire i suppressive fire.

## Zakres

- [x] Linijka: narzędzie pomiaru (klik-przeciągnij), dystans w metrach wg skali sceny (kratka = 2 m), widoczna dla mierzącego (+ opcjonalnie dla wszystkich), pomiar wielopunktowy (łamana)
- [x] Atak dystansowy z mapy: wybór atakującego tokenu + celu → serwer liczy dystans → DV z tabeli zasięgów broni (dane z etapu 13) → rzut ataku vs DV → trafienie/pudło na czacie z pełnym rozbiciem (dystans, przedział zasięgu, DV)
- [x] Spięcie z etapem 15: trafienie proponuje od razu rzut obrażeń i „zastosuj na celu" — pełny łańcuch atak→obrażenia w dwóch kliknięciach
- [x] Atak wręcz: dystans sąsiedztwa, DV wg zasad walki wręcz/bijatyki
- [x] Autofire: tryb na broniach, które go mają — osobna tabela DV, mnożnik obrażeń wg nadwyżki (limit broni), zużycie amunicji
- [x] Suppressive fire: oznaczenie obszaru/celów, wymuszony test WILL (Concentration) u celów, efekt (ruch do osłony) jako status/notatka na czacie
- [x] Amunicja: licznik w broni na karcie, zużycie przy strzale/serii, przeładowanie akcją (przycisk)
- [x] Overlay zasięgów (opcjonalny toggle): pierścienie przedziałów DV wokół wybranego tokenu z bronią

## Poza zakresem

- Osłony/przeszkody w linii strzału (wymaga ścian z etapu 18 — dopisz do POMYSLY.md jako integracja po etapie 18), granaty i wzorce obszarowe (POMYSLY.md), celowane lokacje poza głową

## Kryteria ukończenia

- Atak tym samym pistoletem z 5 m i z 45 m daje różne DV zgodne z tabelą; wynik pokazuje dystans i przedział
- Autofire nalicza mnożnik obrażeń ograniczony limitem broni i zdejmuje amunicję; pusty magazynek blokuje strzał do przeładowania
- Suppressive fire wymusza testy WILL u wszystkich celów i loguje wyniki
- Testy jednostkowe: dobór przedziału zasięgu (wartości graniczne!), matematyka autofire

## Wskazówki techniczne

- Dystans licz na serwerze z pozycji tokenów (środek—środek, metryka z zasad — sprawdź w podręczniku, jak CP RED liczy przekątne) — nie ufaj klientowi
- Tabele DV per typ broni już są w danych z etapu 13 — jeśli struktura nie pasuje, popraw ją tam, nie obudowuj kodem

## Jak to wyszło (2026-07-28)

**Decyzje z użytkownikiem:** atak startuje z karty postaci (przycisk przy broni) i kończy
się kliknięciem w token na mapie; obrona domyślnie idzie przeciw PT z tabeli, a przycisk
„Unik" na karcie czatu pozwala obrońcy zastąpić PT prawdziwym rzutem ZW+Unik; amunicja
to licznik `ammoCurrent`/`ammoMax` plus osobne pole na rodzaj naboju; linijkę widzą
wszyscy widzowie sceny, MG ma przełącznik pomiaru prywatnego.

**Odstępstwo od zasad, świadome:** RAW nie zna statycznego PT dla walki wręcz — to zawsze
test przeciwstawny. Czekanie na rzut obrońcy blokowałoby turę (i grę solo), więc wręcz
dostaje **PT zastępczy = ZW + Unik + 5** (połowa k10) z karty celu, a cel bez karty —
PT 13 („Codzienny" z drabinki trudności, s. 168). Przycisk „Unik" zamienia to na rzut RAW.
Ogień zaporowy rozstrzyga testy SW+Koncentracja celów **automatycznie na serwerze** —
kryterium etapu brzmi „wymusza testy i loguje wyniki", a wymuszony test z definicji nie
czeka na decyzję celu.

**Znalezione i naprawione błędy w danych:**

- `rangeDv` w publicznej próbce (`data/public/cpred/compendium/sample.json`) było dosłownym
  przepisaniem wierszy tabeli z podręcznika — podmienione na liczby wymyślone (repo jest
  publiczne);
- zestaw Easy Mode w `data/public/cpred/skills.json` nie miał umiejętności „Ogień ciągły",
  więc na świeżym klonie serii nie dało się w ogóle rzucić — dołożona z komentarzem.

**Znaleziony i naprawiony błąd w kodzie (dopiero w przeglądarce):** etykiety linijki i
pierścieni zasięgu były rysowane w skali świata, więc przy typowym zoomie mapy 4096 px
(~0,18×) miały 3 px wysokości. Teksty i grubości linii są teraz skalowane odwrotnie do
zoomu i przerysowywane na zdarzeniu `zoomed`.
