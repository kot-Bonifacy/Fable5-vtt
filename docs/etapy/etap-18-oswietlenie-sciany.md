# Etap 18a — Ściany i widoczność tokenów

**Faza:** E — Widoczność · **Wymaga etapów:** 17a

> **Podział (uzgodniony 29.07.2026):** pierwotny etap 18 obejmował ściany, pole widzenia,
> źródła światła i integrację z mgłą naraz — sam plik etapu ostrzegał, że to najtrudniejszy
> technicznie etap projektu i przewidywał podział. Źródła światła, latarki i pamięć
> eksploracji wydzielono do [etapu 18b](etap-18b-swiatla-eksploracja.md).

## Cel sesji

Ściany blokujące widok: gracz widzi tylko to, co z pozycji swoich tokenów da się
zobaczyć — reszta mapy jest czarna, a tokeny za ścianą nie trafiają do jego payloadu.

## Zakres

- [x] Edytor ścian (tylko MG): rysowanie łańcuchów segmentów, typy: ściana pełna, drzwi
      (otwarte/zamknięte), okno (nie blokuje widoku); snap do siatki i do końców istniejących
      ścian; gumka na segment; „usuń wszystkie"; zapis per scena
- [x] Obliczanie pola widzenia: visibility polygon z pozycji tokenu (raycast do wierzchołków
      ścian, sortowanie kątowe) — własna implementacja w `shared/vision.ts` z testami
- [x] Vision tokenów: opcjonalny zasięg widzenia na tokenie (m; brak = ograniczony tylko
      ścianami); widok gracza = suma pól widzenia jego tokenów
- [x] Tryb widoczności sceny: **pełna / ręczna mgła (17a) / dynamiczna** — jeden wybór,
      bo dwa źródła czerni naraz są nie do zdiagnozowania
- [x] Renderowanie w Pixi: maska widoczności u gracza (ta sama technika co mgła 17a),
      warstwa ścian u MG (kolory wg typu, klikalne drzwi)
- [x] Filtrowanie serwerowe: token poza polem widzenia gracza nie jest mu wysyłany —
      ani w `state:sync`, ani w `token:upsert`, ani w klatkach ruchu
- [x] Drzwi z flagą „gracz może otwierać": takie drzwi gracz widzi i przełącza, gdy są
      w jego polu widzenia

## Poza zakresem

- Źródła światła, latarki, scena „ciemna" (etap 18b)
- Pamięć eksploracji „raz zobaczone zostaje odsłonięte" (etap 18b)
- Blokowanie **ruchu** ścianami — VTT w ogóle nie zna kolizji tokenów; okno jest na razie
  oznaczeniem dla MG (POMYSLY.md)
- Osłony w walce liczone ze ścian, pola widzenia stożkowe, elewacja/piętra

## Kryteria ukończenia

- [x] Scenariusz: pokój z zamkniętymi drzwiami, NPC w środku — gracz stojący na korytarzu
      nie widzi NPC **ani w payloadzie**; otwarcie drzwi odsłania pokój i NPC
- [x] Gracz bez tokenu na aktywnej scenie widzi czarną mapę z czytelnym komunikatem
- [x] Ściany nie występują w żadnym payloadzie gracza (sprawdzone testem)
- [x] Stan ścian i drzwi przeżywa restart serwera i reconnect

## Decyzje podjęte przed sesją (29.07.2026)

- **Geometria ścian nie opuszcza serwera.** Serwer liczy wielokąt widoczności i wysyła
  graczowi wyłącznie jego (`vision:sync`). Układ ścian zdradza plan budynku, którego
  postać nie zwiedziła — Foundry wysyła ściany klientowi, my nie, bo zasada „dane
  niewidoczne dla gracza nie opuszczają serwera" jest w tym projekcie nadrzędna.
  Konsekwencja: podczas przeciągania własnego tokenu pole widzenia odświeża się
  z throttlingiem, a nie co klatkę.
- **Tryb widoczności jest jeden na scenę** (pełna / mgła / dynamiczna), a nie dwa
  niezależne przełączniki. Nakładanie ręcznej mgły na dynamiczną widoczność wraca
  w 18b razem z pamięcią eksploracji.
- **Gracz bez tokenu na scenie widzi czerń** — widoczność bierze się wyłącznie z tokenów.
  Komunikat na mapie tłumaczy, dlaczego, żeby nie wyglądało to na awarię.
- **Drzwi z flagą „gracz może otwierać" są wyjątkiem od pierwszej zasady**: gracz
  dostaje takie drzwi (i tylko takie, i tylko gdy leżą w jego polu widzenia), bo inaczej
  nie miałby czego kliknąć. Drzwi, które MG chce ukryć, tej flagi po prostu nie mają.

## Wskazówki techniczne

- Visibility polygon: klasyczny algorytm (raycast do wierzchołków ±ε, sortowanie kątowe) —
  najpierw poprawność, optymalizacja tylko jeśli pomiar tego wymaga; licz przy zmianie
  (ruch, drzwi, edycja ściany), nie co klatkę
- Serwer musi liczyć widoczność niezależnie od klienta (do filtrowania danych) — ta sama
  funkcja z `shared`; wystarczy test „środek tokenu w wielokącie", bez pikselowej precyzji
- Maska widoczności renderuje się tak samo jak mgła z 17a: czarna płachta w `RenderTexture`,
  wielokąty wycinane trybem `erase` (miękka krawędź z przeskalowania tekstury gratis)
- Snap do końców istniejących ścian jest ważniejszy niż snap do siatki — szczelina jednego
  piksela między segmentami przepuszcza światło przez całą mapę

## Jak to wyszło (29.07.2026)

- **Wielokąt widoczności w `shared/vision.ts`** (rdzeń VTT, nie CP RED): klasyczny obrót
  kątowy — promień do każdego wierzchołka ±ε, najbliższe trafienie wygrywa, posortowane
  po kącie trafienia _są_ wielokątem. Prostokąt sceny zawsze należy do zbioru segmentów,
  bo inaczej promień przez otwarte drzwi biegnie w nieskończoność.
- **Zasięg widzenia** dokłada 64 promienie na okręgu — bez nich promienie leciałyby tylko
  w narożniki i „okrąg" wyszedłby taki, jaki akurat opisują pobliskie ściany.
- **Trafienie bliższe niż 0,01 px jest ignorowane** — token stojący dokładnie na ścianie
  inaczej oślepiłby sam siebie (każdy promień kończyłby się w zerze).
- **Drzwi testuje się linią wzroku (`isSegmentClear`), nie testem punktu w wielokącie**:
  zamknięte drzwi _są_ krawędzią wielokąta, więc pytanie „czy ich środek jest w środku?"
  rozstrzyga arytmetyka zmiennoprzecinkowa.
- **`Concealment` na serwerze** to jeden typ z trzema wariantami (`none`/`fog`/`vision`) —
  odpowiednik trójstanowego trybu sceny. Nie ma przypadku, w którym mgła i ściany
  wypowiadają się jednocześnie.
- **W trybie dynamicznym `token:upsert` nie może iść do pokoju kampanii**: dwóch graczy po
  dwóch stronach drzwi ma różne odpowiedzi na „czy ten token istnieje". Token leci do MG,
  a reszta dostaje własną przefiltrowaną listę (`token:sync`).
