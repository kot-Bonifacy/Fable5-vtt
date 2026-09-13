# Etap 42c — Bariera zasłaniająca figury i kara za niewidoczny cel

**Faza:** E — Widoczność · **Wymaga etapów:** 42a, 17a (mgła), 18a–18c (widoczność), 20b (tura
bota), 41 (oględziny)

> **Pochodzenie:** zlecenie MG z 13.09.2026 — „drugi poziom przezroczystości, który sprawi, że ta
> bariera będzie przesłaniała tokeny/NPC-ów; w przeciwieństwie do zwykłych ścian nie będzie
> przesłaniała widoku czystej mapy".

## Cel sesji

Żywopłot, przyciemniana szyba, siatka obwieszona plandeką: mapę za nimi widać, ludzi nie. Bariera
dostaje przełącznik **„zasłania figury"** i karę dla ataku na cel, którego atakujący przez nią nie
widzi.

## Decyzje MG (13.09.2026)

1. Zasłanianie działa we **wszystkich trybach widoczności** — Dynamiczna, ręczna mgła i scena
   otwarta. Poza Dynamiczną serwer liczy linię od figur gracza; gracz bez figury na scenie widzi
   wtedy wszystkich, bo nie ma skąd patrzeć.
2. Zasłania **zawsze**, także z odległości ramienia (bez „firanki" z 18d).
3. **Automatyczna kara** za atak na cel niewidoczny przez barierę, **wartość ustawiana na
   barierze** (domyślnie −4, tyle co dym). Nie jest rodzajem `obscurement`, więc dodatek broni
   ignorujący zasłonięcie jej nie zdejmuje.
4. Przyjęte bez osobnego pytania: gracz, który nie widzi celu **żadną** figurą, dostaje
   `TOKEN_NOT_FOUND` jak przy mgle; kara działa, gdy cel widzi inna jego figura albo gdy strzela
   NPC sterowany przez MG. Bot celu za zasłoną nie widzi i go nie wybiera.
5. **Za zasłaniającą barierą leży mgła wojny, ale mapa ma być widoczna** (dopisek MG z 13.09,
   w trakcie sesji 42a). Obszar, którego figury gracza nie widzą przez zasłaniającą barierę, jest
   przygaszony, mapa pod nim pozostaje czytelna, a figur w nim nie ma.

**Założenia wdrożenia (13.09, pytania zadane w sesji, bez osobnej odpowiedzi MG):**
przygaszenie jak „pamięć mapy” (`DIM_COVER_ALPHA`), we wszystkich trzech trybach. Ręczne
„Odsłoń” odsłania mapę, ale nie omija zasłony figur. Zwykła mgła i ciemność nadal obowiązują.
Kara to liczba całkowita od −99 do 0; 0 pozwala zasłaniać bez kary. Ustawienia nowych odcinków
zostają na pasku do przeładowania strony, jak OB z 42b.

## Jedno źródło prawdy dla mgły i ukrywania

Ukrywanie figur i przygaszenie mapy liczą się z **tego samego wielokąta**: widoku figur, w którym
zasłaniające bariery są przeszkodami (obok zwykłego widoku mapy, w którym nie są). Figura jest
schowana wtedy i tylko wtedy, gdy jej środek leży poza tym wielokątem — więc nie da się zobaczyć
figury w przygaszonym miejscu ani pustego, jasnego placu, na którym ktoś stoi.

## Zakres

- [x] Kolumny `Wall.hidesFigures` i `Wall.concealPenalty`, migracja, eksport/import
- [x] Wielokąt widoku figur (zasłaniające bariery jako przeszkody) liczony na serwerze w trzech
      trybach; `concealmentFor` / `concealedFrom` pytają o środek figury w tym wielokącie
- [x] Mgła za barierą: klient dostaje ten wielokąt (drugi zestaw w `vision:sync`, także poza
      trybem Dynamicznym) i przygasza mapę poza nim, nie zakrywając jej
- [x] `emitTokenUpsert`: na scenie z zasłaniającą barierą ruch figury idzie listą per gracz także
      w trybie mgły i otwartym
- [x] Efekty mapy: końce strzału, liczby obrażeń i iskry słuchają zasłony; wybuch, chmura
      i strefa — tylko mapy
- [x] Bot (`tokenSightFor`), oględziny (41), marsz MG (`tokensSeenFrom`) — ta sama zasłona
- [x] Atak gracza na cel, którego nie widzi: `TOKEN_NOT_FOUND` we **wszystkich** trybach —
      naprawa luki znalezionej 13.09: przy Dynamicznej serwer sprawdzał tylko `hidden` i mgłę,
      a odmowa „coś stoi na drodze" zdradzała ścianę
- [x] Kara: nazwany wiersz w rozbiciu, najgorsza z przeciętych barier (nie sumuje się)
- [x] Pasek i karta segmentu: „Zasłania figury" + kara
- [x] Testy serwera w trzech trybach, bot, efekty mapy, kara

## Kryteria ukończenia

1. NPC za zasłaniającą barierą nie dociera do gracza (payload, nie CSS) w każdym trybie
   widoczności, a mapa za barierą pozostaje widoczna.
2. Gracz, którego jedna figura widzi cel, a atakująca nie, dostaje karę z bariery w rozbiciu.
3. NPC sterowany przez MG strzela do gracza za barierą z karą; bot takiego celu nie wybiera.
4. Strzał zza bariery nie zdradza strzelca w efektach mapy.
5. Za zasłaniającą barierą gracz widzi przygaszoną mapę i żadnej figury; gdy jego figura przejdzie
   na drugą stronę (albo MG otworzy bramę), przygaszenie znika, a figury się pojawiają.

## Wynik sesji 13.09.2026

Zaimplementowane: migracja `20260913210000_stage42c_figure_barriers`, maska `figurePolygons`
w synchronizacji i podczas przeciągania, filtrowanie figur i efektów, kara w rozbiciu,
bot, oględziny, marsz MG oraz kontrolki paska i karty segmentu. Usunięcie ostatniego źródła
wzroku również odświeża zasłonę. Poza Dynamiczną nie wysyłamy wielokątów zwykłych ścian.

Weryfikacja: testy gniazd w trzech trybach (33), geometria i kara w shared, regresja dodatku
ignorującego dym, eksport/import; pełne testy i sprawdzenie typów. W Chrome obejrzano pasek
aplikacji (przełącznik i domyślne −4) oraz rzeczywisty renderer na izolowanej scenie: mapa za
zamkniętą bramą jest czytelna i przygaszona, otwarcie usuwa przygaszenie, także w Dynamicznej.
Nie wykonywano całej ścieżki edycji karty segmentu na żywej kampanii; testy danych korzystały
z osobnych baz. Poligon i jego walka pozostały nietknięte.

## Poprawki po oględzinach 13.09.2026 (czwarta sesja)

Oględziny w Chrome na dwóch oknach wykazały dwa regresy tego etapu, oba z jednego założenia:
przyjście `vision:sync` traktowano jak znak widoczności Dynamicznej, a od 42c widok przychodzi
w każdym trybie. (1) Klient przycinał planer gracza do pustych wielokątów, więc na mgle i scenie
otwartej gracz tracił trasę kliknięciem — teraz rozstrzyga `confinesWalkToSight`. (2) `sync.ts`
brał przeszkody planera z `vision`, więc F5 obok bariery zasłaniającej zostawiał pustą listę — teraz
decyduje tryb sceny. Do tego układ pola „Zasłania figury" na pasku. Opis
w `archiwum/zamkniete-zaleglosci.md`, pozostałe oględziny w `zaleglosci.md`.
