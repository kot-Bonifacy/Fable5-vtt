# Etap 17a — Fog of war i warstwa MG

**Faza:** E — Widoczność · **Wymaga etapów:** 05

> **Podział (uzgodniony 28.07.2026):** pierwotny etap 17 obejmował mgłę, rysowanie po
> mapie i warstwę MG naraz. Rysowanie wydzielono do [etapu 17b](etap-17b-rysowanie-po-mapie.md),
> bo trzy niezależne funkcje z filtrowaniem serwerowym nie mieszczą się w jednej sesji.

## Cel sesji

Kontrola informacji na mapie: ręczna mgła wojny (z filtrowaniem tokenów po stronie
serwera) oraz warstwa MG z ukrytymi notatkami.

## Zakres

- [x] Fog of war (ręczny): scena startuje zakryta, MG odsłania/zakrywa pędzlem i prostokątem; stan mgły trwały per scena; gracze widzą wspólną odsłonę
- [x] Renderowanie mgły w Pixi: warstwa nad tokenami, u MG półprzezroczysta, u graczy kryjąca; tokeny w zakrytym obszarze niewidoczne dla graczy również w danych (serwer filtruje po pozycji vs mgła)
- [x] Warstwa MG: ukryte pinezki-notatki na mapie (ikona + tekst po kliknięciu), ukryte tokeny (z etapu 05) renderowane u MG
- [x] Pasek narzędzi mapy: wybór narzędzia (wskaźnik/linijka/mgła/notatka), skróty klawiszowe (M, F, N, Esc)
- [x] Test filtrowania: payloady gracza nie zawierają notatek MG ani tokenów w zakrytych obszarach

## Poza zakresem

- Rysowanie po mapie (etap 17b)
- Automatyczne odsłanianie z vision/światła (etap 18 — ta mgła ręczna zostanie z nim zintegrowana)

## Kryteria ukończenia

- [x] MG odsłania pomieszczenie pędzlem — gracze widzą tylko odsłonięty fragment mapy i tokeny w nim; reszta czarna
- [x] Notatka na warstwie MG niewidoczna dla gracza (payload sprawdzony)
- [x] Stan mgły przeżywa restart serwera i reconnect

## Wskazówki techniczne

- Mgłę trzymaj jako zbiór kształtów (pociągnięcia pędzla / prostokąty) renderowanych do maski, nie jako bitmapę — mniejsze dane, łatwiejszy sync i undo
- Filtrowanie tokenów po mgle wymaga testu punkt-w-kształcie na serwerze — funkcja przyda się też w etapie 18, umieść ją w `shared`
- Freehand upraszczaj przed wysyłką (rzadsze próbkowanie wystarcza, bo pędzel ma promień)

## Jak to wyszło (28.07.2026)

- **Model danych:** mgła to **uporządkowana lista kształtów**, nie bitmapa. Baza startuje
  „zakryta", a o losie punktu decyduje **ostatni** kształt, który go obejmuje — dzięki temu
  zakrywanie z powrotem i cofanie są darmowe. Dwa kształty wystarczają: `stroke`
  (łamana + promień, jedno pociągnięcie = jeden wiersz) i `rect`.
- **Geometria w `shared/fog.ts`** (rdzeń VTT, nie CP RED): `isPointRevealed`, `isTokenInFog`
  (mierzone od **środka tokenu**, jak linijka i pierścienie zasięgu), `sanitizeFogShape`.
- **„Zakryj wszystko" nie zapisuje kształtu** — czyści listę, bo stan bazowy to „zakryte".
  „Odsłoń wszystko" czyści listę i zapisuje jeden prostokąt sceny, co przy okazji kompaktuje
  sesję malowania do jednego wiersza.
- **Renderowanie:** maska Pixi nie wystarcza (lista przeplata odsłonięcia i zakrycia w
  kolejności), więc mgła składa się do `RenderTexture`: czarna płachta + po jednym `Graphics`
  na serię kształtów tego samego trybu, odsłonięcia rysowane trybem `erase`. Tekstura jest
  celowo zgrubna (max 2048 px), co daje miękką krawędź i oszczędza VRAM.
- **Przełącznik mgły ma własne zdarzenie** `fog:toggle`, a nie pole w `scene:update` —
  włączenie mgły musi w tym samym ruchu zabrać graczom tokeny.
