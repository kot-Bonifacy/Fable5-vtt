# Etap 17b — Rysowanie po mapie

**Faza:** E — Widoczność · **Wymaga etapów:** 17a

> Wydzielone z pierwotnego etapu 17 (decyzja z 28.07.2026). Etap 17a dostarczył mgłę wojny,
> warstwę MG i pasek narzędzi mapy — ten etap dokłada do nich warstwę rysunków.

## Cel sesji

Rysowanie po mapie jako narzędzie prowadzenia: szkic planu, zaznaczenie celu, podpis
pomieszczenia — synchronizowane na żywo, z osobną warstwą tylko dla MG.

## Zakres

- [x] Narzędzia: ołówek (freehand), linia, prostokąt, elipsa, tekst
- [x] Kolor i grubość linii; wybór zapamiętywany między sesjami (localStorage)
- [x] Warstwa rysunków synchronizowana na żywo (jak tokeny: intencja → serwer → broadcast), trwała per scena
- [x] Gumka: każdy usuwa własne rysunki, MG usuwa wszystkie; „wyczyść moje" i „wyczyść wszystko" (MG)
- [x] MG może rysować na **warstwie MG** — takie rysunki nie trafiają do payloadu gracza (jak notatki z 17a)
- [x] Rysowanie dostępne dla graczy (wspólna tablica), z limitem liczby kształtów na scenę
- [x] Rozszerzenie paska narzędzi z 17a o narzędzia rysowania i ich ustawienia
- [x] Test filtrowania: payload gracza nie zawiera rysunków z warstwy MG

## Poza zakresem

- Rysunki jako szablony obszarów/zaklęć (stożek, promień) — osobny pomysł w `POMYSLY.md`
- Wstawianie obrazków na mapę (handouty — etap 24)

## Kryteria ukończenia

- [x] Rysunek pojawia się na żywo u wszystkich widzów sceny
- [x] Rysunek MG na warstwie MG niewidoczny dla gracza (payload sprawdzony)
- [x] Stan rysunków przeżywa restart serwera i reconnect
- [x] Gracz nie może usunąć cudzego rysunku; MG może usunąć każdy

## Decyzje podjęte w sesji (28.07.2026)

- **Tekst skaluje się razem z mapą** (rozmiar w pikselach sceny), a nie ze stałą
  wielkością ekranową, którą sugerowała wskazówka techniczna niżej. Podpis
  „Magazyn" należy do mapy jak nazwa pomieszczenia na rzucie — przy oddaleniu
  etykiety ekranowe tłoczyłyby się i przestały wskazywać konkretne miejsce.
  Pinezki notatek i linijka pozostają ekranowe, bo są UI, nie treścią mapy.
- **Prostokąt i elipsa mają przełącznik wypełnienia** (obrys + opcjonalne
  wypełnienie 25% alfa) — potrzebne do zaznaczania stref.
- **Bez przełącznika „gracze mogą rysować"** — wspólna tablica zawsze otwarta,
  a przed zaśmieceniem bazy chroni limit kształtów na scenę.
- **MG domyślnie rysuje na warstwie MG**, z przyciskiem „pokaż graczom".
  Szkicu, który miał zostać za zasłoną, nie da się cofnąć; udostępnienie to
  jedno kliknięcie.
- **Rysunki nie są filtrowane mgłą** (świadome odstępstwo): publiczny rysunek
  to wspólna adnotacja, mgła zakrywa go wizualnie (warstwa pod mgłą), a to, co
  ma pozostać tajne, należy do warstwy MG — i dlatego jest ona domyślna dla MG.

## Wskazówki techniczne

- Freehand upraszczaj (Douglas-Peucker / `simplify-js`) **przed wysyłką** — inaczej jedno
  pociągnięcie to setki punktów w bazie
- Model danych może iść śladem mgły z 17a: jeden wiersz na kształt, geometria w kolumnie JSON,
  autoincrement id jako kolejność rysowania
- Warstwa rysunków w Pixi wchodzi **pod tokeny** (patrz kolejność warstw w `MapRenderer`);
  warstwa MG — nad mgłą, obok pinezek notatek
- Pole tekstowe: skaluj etykiety odwrotnie do zoomu, tak jak linijkę i pinezki (patrz błąd
  znaleziony w etapach 16 i 17a — `refreshOverlays`)
