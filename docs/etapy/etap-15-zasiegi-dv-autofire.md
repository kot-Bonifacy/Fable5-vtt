# Etap 15 — Zasięgi, DV z mapy, autofire 🏁 Pełna automatyka walki

**Faza:** D — Walka · **Wymaga etapów:** 14

## Cel sesji

Mapa zaczyna liczyć walkę dystansową: pomiar odległości, automatyczne DV wg broni i dystansu, autofire i suppressive fire.

## Zakres

- [ ] Linijka: narzędzie pomiaru (klik-przeciągnij), dystans w metrach wg skali sceny (kratka = 2 m), widoczna dla mierzącego (+ opcjonalnie dla wszystkich), pomiar wielopunktowy (łamana)
- [ ] Atak dystansowy z mapy: wybór atakującego tokenu + celu → serwer liczy dystans → DV z tabeli zasięgów broni (dane z etapu 12) → rzut ataku vs DV → trafienie/pudło na czacie z pełnym rozbiciem (dystans, przedział zasięgu, DV)
- [ ] Spięcie z etapem 14: trafienie proponuje od razu rzut obrażeń i „zastosuj na celu" — pełny łańcuch atak→obrażenia w dwóch kliknięciach
- [ ] Atak wręcz: dystans sąsiedztwa, DV wg zasad walki wręcz/bijatyki
- [ ] Autofire: tryb na broniach, które go mają — osobna tabela DV, mnożnik obrażeń wg nadwyżki (limit broni), zużycie amunicji
- [ ] Suppressive fire: oznaczenie obszaru/celów, wymuszony test WILL (Concentration) u celów, efekt (ruch do osłony) jako status/notatka na czacie
- [ ] Amunicja: licznik w broni na karcie, zużycie przy strzale/serii, przeładowanie akcją (przycisk)
- [ ] Overlay zasięgów (opcjonalny toggle): pierścienie przedziałów DV wokół wybranego tokenu z bronią

## Poza zakresem

- Osłony/przeszkody w linii strzału (wymaga ścian z etapu 17 — dopisz do POMYSLY.md jako integracja po etapie 17), granaty i wzorce obszarowe (POMYSLY.md), celowane lokacje poza głową

## Kryteria ukończenia

- Atak tym samym pistoletem z 5 m i z 45 m daje różne DV zgodne z tabelą; wynik pokazuje dystans i przedział
- Autofire nalicza mnożnik obrażeń ograniczony limitem broni i zdejmuje amunicję; pusty magazynek blokuje strzał do przeładowania
- Suppressive fire wymusza testy WILL u wszystkich celów i loguje wyniki
- Testy jednostkowe: dobór przedziału zasięgu (wartości graniczne!), matematyka autofire

## Wskazówki techniczne

- Dystans licz na serwerze z pozycji tokenów (środek—środek, metryka z zasad — sprawdź w podręczniku, jak CP RED liczy przekątne) — nie ufaj klientowi
- Tabele DV per typ broni już są w danych z etapu 12 — jeśli struktura nie pasuje, popraw ją tam, nie obudowuj kodem
