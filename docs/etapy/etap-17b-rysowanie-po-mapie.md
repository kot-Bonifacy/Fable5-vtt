# Etap 17b — Rysowanie po mapie

**Faza:** E — Widoczność · **Wymaga etapów:** 17a

> Wydzielone z pierwotnego etapu 17 (decyzja z 28.07.2026). Etap 17a dostarczył mgłę wojny,
> warstwę MG i pasek narzędzi mapy — ten etap dokłada do nich warstwę rysunków.

## Cel sesji

Rysowanie po mapie jako narzędzie prowadzenia: szkic planu, zaznaczenie celu, podpis
pomieszczenia — synchronizowane na żywo, z osobną warstwą tylko dla MG.

## Zakres

- [ ] Narzędzia: ołówek (freehand), linia, prostokąt, elipsa, tekst
- [ ] Kolor i grubość linii; wybór zapamiętywany między sesjami (localStorage)
- [ ] Warstwa rysunków synchronizowana na żywo (jak tokeny: intencja → serwer → broadcast), trwała per scena
- [ ] Gumka: każdy usuwa własne rysunki, MG usuwa wszystkie; „wyczyść moje" i „wyczyść wszystko" (MG)
- [ ] MG może rysować na **warstwie MG** — takie rysunki nie trafiają do payloadu gracza (jak notatki z 17a)
- [ ] Rysowanie dostępne dla graczy (wspólna tablica), z limitem liczby kształtów na scenę
- [ ] Rozszerzenie paska narzędzi z 17a o narzędzia rysowania i ich ustawienia
- [ ] Test filtrowania: payload gracza nie zawiera rysunków z warstwy MG

## Poza zakresem

- Rysunki jako szablony obszarów/zaklęć (stożek, promień) — osobny pomysł w `POMYSLY.md`
- Wstawianie obrazków na mapę (handouty — etap 24)

## Kryteria ukończenia

- Rysunek pojawia się na żywo u wszystkich widzów sceny
- Rysunek MG na warstwie MG niewidoczny dla gracza (payload sprawdzony)
- Stan rysunków przeżywa restart serwera i reconnect
- Gracz nie może usunąć cudzego rysunku; MG może usunąć każdy

## Wskazówki techniczne

- Freehand upraszczaj (Douglas-Peucker / `simplify-js`) **przed wysyłką** — inaczej jedno
  pociągnięcie to setki punktów w bazie
- Model danych może iść śladem mgły z 17a: jeden wiersz na kształt, geometria w kolumnie JSON,
  autoincrement id jako kolejność rysowania
- Warstwa rysunków w Pixi wchodzi **pod tokeny** (patrz kolejność warstw w `MapRenderer`);
  warstwa MG — nad mgłą, obok pinezek notatek
- Pole tekstowe: skaluj etykiety odwrotnie do zoomu, tak jak linijkę i pinezki (patrz błąd
  znaleziony w etapach 16 i 17a — `refreshOverlays`)
