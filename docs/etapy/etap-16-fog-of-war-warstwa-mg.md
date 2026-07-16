# Etap 16 — Fog of war, rysowanie, warstwa MG

**Faza:** E — Widoczność · **Wymaga etapów:** 05

## Cel sesji

Narzędzia kontroli informacji: ręczna mgła wojny, rysowanie po mapie, warstwa MG z ukrytymi notatkami.

## Zakres

- [ ] Fog of war (ręczny): scena startuje zakryta (opcja), MG odsłania/zakrywa pędzlem i prostokątem/wielokątem; stan mgły trwały per scena; gracze widzą wspólną odsłonę
- [ ] Renderowanie mgły w Pixi: warstwa nad tokenami, u MG półprzezroczysta, u graczy kryjąca; tokeny w zakrytym obszarze niewidoczne dla graczy również w danych (serwer filtruje po pozycji vs mgła)
- [ ] Rysowanie po mapie: ołówek (freehand), linia, prostokąt, elipsa, tekst; kolor i grubość; warstwa rysunków sync na żywo; gumka/usuwanie własnych (MG — wszystkich); MG może rysować na warstwie MG (niewidoczne dla graczy)
- [ ] Warstwa MG: ukryte pinezki-notatki na mapie (ikona + tekst po najechaniu), ukryte tokeny (z etapu 05) renderowane na tej warstwie u MG
- [ ] Pasek narzędzi mapy: wybór narzędzia (wskaźnik/pomiar/rysowanie/mgła), skróty klawiszowe
- [ ] Test filtrowania: payloady gracza nie zawierają kształtów mgły „do odsłonięcia", notatek MG ani tokenów w zakrytych obszarach

## Poza zakresem

- Automatyczne odsłanianie z vision/światła (etap 17 — ta mgła ręczna zostanie z nim zintegrowana), rysowanie jako szablony zaklęć/obszarów

## Kryteria ukończenia

- MG odsłania pomieszczenie pędzlem — gracze widzą tylko odsłonięty fragment mapy i tokeny w nim; reszta czarna
- Rysunki pojawiają się na żywo u wszystkich; notatka na warstwie MG niewidoczna dla gracza (payload sprawdzony)
- Stan mgły i rysunków przeżywa restart serwera i reconnect

## Wskazówki techniczne

- Mgłę trzymaj jako zbiór kształtów (wielokąty/okręgi pędzla) renderowanych do maski, nie jako bitmapę — mniejsze dane, łatwiejszy sync i undo
- Filtrowanie tokenów po mgle wymaga testu punkt-w-wielokącie na serwerze — funkcja przyda się też w etapie 17, umieść ją w `shared`
- Freehand upraszczaj (algorytm Douglas-Peucker / `simplify-js`) przed wysyłką
