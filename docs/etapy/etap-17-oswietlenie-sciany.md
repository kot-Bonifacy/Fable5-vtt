# Etap 17 — Dynamiczne oświetlenie i ściany

**Faza:** E — Widoczność · **Wymaga etapów:** 16

⚠️ Najtrudniejszy technicznie etap projektu — jeśli po połowie sesji widać, że się nie zmieści, podziel: **17a** ściany + widoczność tokenów, **17b** źródła światła + integracja z mgłą. Zaktualizuj wtedy POSTEP.md i pliki etapów.

## Cel sesji

Ściany blokujące widok i dynamiczne oświetlenie: gracz widzi tylko to, co widzą jego tokeny.

## Zakres

- [ ] Edytor ścian (tylko MG): rysowanie segmentów (łańcuchy punktów), typy: ściana pełna, drzwi (otwarte/zamknięte przełączane kliknięciem), okno/teren (blokuje ruch, nie widok — opcjonalnie); snap do siatki; zapis per scena
- [ ] Obliczanie pola widzenia: visibility polygon z pozycji tokenu względem segmentów ścian (raycasting do wierzchołków) — implementacja w `shared` z testami na prostych układach lub sprawdzona biblioteka; decyzję zapisz
- [ ] Vision tokenów: zasięg widzenia na tokenie (m); widok gracza = suma pól widzenia jego tokenów przycięta zasięgiem
- [ ] Źródła światła: obiekt światła na mapie (zasięg jasny/przyćmiony, kolor, opcjonalnie migotanie) + światło przypinane do tokenu (latarka); w scenie „ciemnej" widać tylko obszary oświetlone i w zasięgu vision
- [ ] Renderowanie w Pixi: maski/tekstury widoczności, tryb `multiply`/mesh — cel: 60 fps przy ~50 segmentach ścian i ~10 światłach
- [ ] Integracja z mgłą z etapu 16: tryb „eksploracja" — obszary raz zobaczone zostają odsłonięte (bez tokenów), aktualna widoczność pokazuje „na żywo"; mgła ręczna nadal działa jako nadpisanie MG
- [ ] Filtrowanie serwerowe: pozycje tokenów niewidocznych dla gracza (za ścianą/w ciemności) nie są mu wysyłane; aktualizacja przy każdym ruchu

## Poza zakresem

- Osłony w walce liczone ze ścian (POMYSLY.md), pola widzenia stożkowe, elevacja/piętra

## Kryteria ukończenia

- Scenariusz: ciemny korytarz, zamknięte drzwi, NPC w pokoju za nimi — gracz nie widzi NPC (również w payloadach); otwarcie drzwi + latarka tokenu odsłania pokój i NPC
- Obszar odwiedzony pozostaje odsłonięty (mapa), ale NPC znika z niego, gdy token gracza wyjdzie
- 60 fps przy ruchu tokenu ze światłem na mapie testowej; brak zauważalnego laga syncu

## Wskazówki techniczne

- Visibility polygon: klasyczny algorytm (sortowanie kątowe wierzchołków + raycast) — zacznij od wersji poprawnej, optymalizuj tylko jeśli pomiar tego wymaga; licz przy zmianie (ruch/drzwi), nie co klatkę
- Serwer musi liczyć widoczność niezależnie (do filtrowania danych) — użyj tej samej funkcji z `shared`; wystarczy test „środek tokenu w wielokącie widoczności", bez pikselowej precyzji
- Drzwi to najczęstsza interakcja — klikalne także dla graczy, jeśli MG zezwoli (flaga na drzwiach)
