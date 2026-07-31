# Etap 16e — Ruch klikiem: zaznaczenie, automat chodzenia, marsz

**Faza:** D — Walka · **Wymaga etapów:** 14c (budżet metrów), 18a (pole widzenia), 18c (pamięć
eksploracji), 18d/18e (otwory)

## Cel sesji

Token przestaje być obrazkiem, który się przeciąga, a staje się postacią, którą się prowadzi —
jak w klasycznych komputerowych RPG z rzutem od góry. Zaznaczasz go klikiem, wskazujesz, dokąd
ma iść, a **trasę wyznacza automat**: sam obchodzi róg korytarza, sam zatrzymuje się na granicy
budżetu tury i sam przerywa marsz, gdy w polu widzenia pojawi się ktoś nowy.

**Pochodzenie:** dopisany 2026-07-31 na zgłoszenie MG („obecny sposób używania myszki do
sterowania tokenami jest niewygodny”), tego samego dnia rozszerzony o automat chodzenia —
razem z pomysłem MG, który rozwiązał problem architektoniczny: **nie można pójść dalej, niż
się widzi**. Celowanie kursorem i pasek akcji są w 16f.

## Rzecz, na której stoi etap: granica widoczności **jest** obrazem ścian

Klient gracza nie dostaje ani jednej ściany (18a) i nie dostanie jej w tym etapie — a mimo to
policzy trasę, która ściany omija. Bo gracz dostaje coś, co w zupełności wystarcza:
**wielokąt pola widzenia** (`vision:sync` → `wallStore.polygons`) i **maskę eksploracji**
(18c → `explorationStore.mask`). Pole widzenia kończy się dokładnie tam, gdzie stoi ściana,
więc A* ograniczony do wnętrza tego obszaru omija mury, **nie wiedząc, że istnieją**.

To ta sama tożsamość, na której stoi 16b („linia strzału = blokady wzroku strzelca”) —
i tak samo jak tam, oba trudne przypadki wychodzą za darmo:

| Kto idzie | Skąd bierze przechodniość | Co z tego wynika |
| --------- | ------------------------- | ---------------- |
| MG        | pełne ściany (`blockingSegments`, `isSegmentClear`) | trasa po prawdziwej geometrii, także przez nieodkryte pokoje |
| Gracz     | `isPointInPolygon` (widzę teraz) ∪ `isPointExplored` (pamiętam) | trasa po znanym terenie, bez wycieku planu budynku |

Jedyne miejsce, w którym granica **nie** jest ścianą, to horyzont: koniec zasięgu widzenia,
krawędź sceny, brzeg pamięci. Stąd „idź w tę stronę” (decyzja MG) — klik w czerń nie jest
odmową, tylko marszem do granicy wiedzy.

## Zakres

- [ ] **Zaznaczenie tokenu** — nowy `selectionStore` (rdzeń VTT, bez wiedzy o CP RED): LPM
      zaznacza token, którym wolno sterować (MG — każdy, gracz — swój), Esc / PPM / klik
      w puste odznacza. `TokenNode` rysuje **trzeci** pierścień: obok obwódki właściciela
      (czyj to jest) i halo aktywnego w turze (czyja tura) — żaden z nich nie może stracić znaczenia
- [ ] **`planWalk` w `shared/pathfinding.ts`** — czysta funkcja z **wstrzykiwanym predykatem
      przechodniości** (wzorzec `DiceRng` z etapu 06): A* po kratkach sceny, 8 kierunków,
      przekątna √2, wygładzenie trasy (usuwanie punktów pośrednich, gdy odcinek prosty jest
      przechodni). Rdzeń VTT — o metrach, budżecie i CP RED nie wie nic
- [ ] **Rozmiar tokenu w trasie** — kratka jest przechodnia dla tokenu `size × size` tylko
      wtedy, gdy przechodnie są **wszystkie** kratki, które zajmie. Bez tego token 2×2
      przeciska się przez metrowe drzwi
- [ ] **„Idź w tę stronę”** (decyzja MG) — cel poza znanym terenem nie jest odmową: A* kończy
      na kratce najbliższej celowi spośród osiągalnych, a trasa jest rysowana do niej
- [ ] **Podgląd trasy pod kursorem**: zielona do granicy budżetu tury, znacznik ✖ w miejscu,
      gdzie postać stanie, i wygaszona reszta dalej; licznik `„12 / 12 m”`. Ruch utrudniony
      (×2 z 14c) liczy się w koszcie, nie w metrach ziemi
- [ ] **Przycięcie do budżetu — „idź, ile starczy”** (decyzja MG): klik w punkt poza zasięgiem
      tury przenosi na granicę budżetu, zamiast odmawiać całego ruchu. Serwer dalej rozstrzyga;
      to przycięcie po stronie UI, nie nowa reguła
- [ ] **Marsz zamiast teleportu** (decyzja MG): token przechodzi trasę na oczach całego stołu
      — tym samym strumieniem `token:move` z `final: false`, którym idzie dziś przeciąganie
      (20 Hz). Ostatnia ramka `final: true` niesie **przebytą** łamaną
- [ ] **Cztery powody przerwania marszu** (decyzja MG — pierwsze trzy automatyczne):
  - **ktoś nowy w polu widzenia** („enemy sighted” z BG/Fallouta): u gracza — token, który
    pojawił się w jego `tokenStore`; u MG — token, który wszedł w pole widzenia maszerującego
  - **koniec budżetu tury** — postać staje na granicy i mówi o tym na czacie
  - **zdarzenie w grze** — karta odmowy, obrażenia okresowe (14e), zmiana tury
  - **Esc albo klik** — zatrzymanie w miejscu, w którym token właśnie jest
- [ ] **Kursor mówi, co się stanie**: strzałka marszu nad terenem osiągalnym, kursor „idź
      w tę stronę” nad czernią, kursor odmowy, gdy zaznaczonym tokenem nie wolno ruszyć
      (nie twoja tura, Powalony, Pochwycony — stany, które 14c/14d już znają)
- [ ] **Przeciąganie zostaje** (decyzja MG) i nie może kolidować z zaznaczeniem: pointerdown
      na tokenie zaznacza dopiero, gdy nie przekroczono `DRAG_THRESHOLD_PX`, który renderer
      już ma. Ręczny punkt załamania (Shift+klik) zostaje jako obejście, gdy automat wybierze
      inną trasę niż gracz
- [ ] **Kolejność pierwszeństwa kliknięcia** — jedno ustalenie zamiast rozsypanych warunków
      (jak kolejność odmów przy `door:toggle` w 18d): stawianie tokenu → narzędzie mapy
      (linijka, mgła, rysowanie, ściany, światła) → celownik uzbrojony z karty/menu (16b) →
      zaznaczony token (marsz) → puste kliknięcie
- [ ] Testy w `shared`: obejście rogu w kształcie L, pokój bez wyjścia (trasa do najbliższego
      osiągalnego punktu), przycięcie do limitu metrów, token 2×2 przy metrowych drzwiach,
      cel poza obszarem, determinizm trasy (ta sama para punktów = ta sama łamana), sufit
      przeszukiwania

## Poza zakresem

- **Celowanie kursorem i atak klikiem** (obrys wroga, dymek z dystansem i PT, klik = kubek,
  wybór aktywnej broni) → **etap 16f**
- **Panel aktywnej postaci, pasek akcji, skróty klawiszowe** → **etap 16f**
- **Serwerowa walidacja trasy (kolizje ruchu)** — automat chodzenia jest **uprzejmością
  klienta, nie regułą**: serwer dalej liczy tylko długość zgłoszonej łamanej i nie sprawdza,
  czy da się nią przejść. Kto chce, dalej przeciągnie token przez ścianę — i MG to zobaczy.
  Osobny wpis w POMYSLY z 30.07, punkt zaczepienia czeka w `validateTokenMove`
- **Tokeny jako przeszkody** — postacie mijają się swobodnie; CP RED nie zna stref kontroli,
  a blokowanie kratek przez sojuszników przy czterech osobach w korytarzu jest utrapieniem,
  nie realizmem
- **Zaznaczanie wielu tokenów ramką i marsz grupą** → wpis w POMYSLY
- **Pamiętanie zamkniętych drzwi** — trasa po zapamiętanym terenie może przechodzić przez
  drzwi, które ktoś w międzyczasie zamknął. Skoro serwer nie sprawdza kolizji, postać po
  prostu przez nie przejdzie; to świadome ograniczenie, znikające razem z kolizjami ruchu

## Odstępstwa i decyzje (2026-07-31, przed startem)

- **Automat chodzenia zamiast prostej z ręcznymi punktami** (rozszerzenie zamówione przez MG
  po przeczytaniu pierwszej wersji planu). Pierwsza wersja mówiła „klient nie zna ścian, więc
  róg obchodzi się Shift+klikiem”; pomysł MG — **nie dalej, niż widzisz** — usunął tę
  przeszkodę, bo klient ma wielokąt widoczności i maskę eksploracji, czyli obraz ścian bez ścian.
- **Baza trasy: widoczne + zapamiętane** (decyzja MG). Znany budynek przechodzi się jednym
  kliknięciem, także po ciemku — pamięć mapy z 18c jest wspólna dla drużyny i dokładnie o to
  chodzi: postać wie, gdzie są drzwi, przez które przed chwilą weszła.
- **Klik w czerń = idź w tę stronę** (decyzja MG), a nie odmowa. Odmowa uczyłaby gracza, że
  część mapy jest „zepsuta”; marsz do granicy wiedzy jest tym, co robią te gry.
- **Marsz widoczny dla wszystkich** (decyzja MG). Kanał już istnieje i jest przetestowany:
  pośrednie ramki przeciągania. MG widzi, którędy poszła postać — co bywa treścią sceny.
- **„Idź, ile starczy” zamiast odmowy** (decyzja MG). Dzisiejsze zachowanie z 14c (odmowa
  całego ruchu) zostaje dla przeciągania; klik dostaje wariant z XCOM/Divinity.
- **Marsz przerywają trzy rzeczy** (decyzja MG): nowy token w polu widzenia, koniec budżetu,
  zdarzenie w grze. Czwartą jest ręka gracza.
- **Etap podzielony na 16e i 16f** (rekomendacja przy planowaniu, poprawiona po dołożeniu
  automatu): granica biegnie między **ruchem** a **atakiem**, nie między Pixi a Reactem, jak
  w pierwszej wersji. Automat chodzenia to duży blok algorytmiczny z własnym zestawem testów;
  celowanie i HUD dzielą za to jedno pytanie — „czym i w co uderzam”.

## Kryteria ukończenia

- Klik w swój token zaznacza go; klik w podłoże wyznacza trasę, którą widać przed kliknięciem
  razem z kosztem w metrach
- **Postać obchodzi róg korytarza sama** — trasa wygina się wokół ściany, a licznik liczy
  łamaną, nie prostą
- Gracz nie ma na kliencie ani jednej ściany (sprawdzone w payloadzie), a mimo to jego trasa
  ściany omija
- Klik za zasięgiem tury przenosi postać na granicę budżetu (znacznik ✖ stoi tam, gdzie
  postać stanie), a nie odmawia ruchu
- Klik w nieodkrytą część mapy prowadzi postać do granicy znanego terenu
- Marsz widać u MG i u drugiego gracza; po drodze odsłania się mgła
- Marsz przerywa się sam, gdy zza rogu wyjdzie NPC, i mówi o tym na czacie — a przerwany
  ruch kosztuje metry **przebyte**, nie planowane
- Token 2×2 nie przeciska się przez metrowe drzwi
- Przeciąganie tokenu działa jak przed etapem
- Testy jednostkowe `planWalk` (lista wyżej) — zielone

## Wskazówki techniczne

- **Odkrywanie mgły w trakcie marszu jest za darmo** — `emitDynamicMove` woła dziś
  `emitDragVision` przy **nieostatecznych** ramkach ruchu, więc pole widzenia idącego tokenu
  odświeża się samo. Nie pisz drugiego kanału: marsz to przeciąganie bez ręki
- **Przerwany marsz musi wysłać `final: true` z przebytą łamaną.** Serwer liczy metry
  z tego, co dostał (`movementPath` + `movementMetres`), więc wysłanie planowanej trasy
  po zatrzymaniu w połowie obciążyłoby gracza za drogę, której nie przeszedł
- **Predykat przechodniości wstrzykuj, nie zaszywaj.** `planWalk` ma nie wiedzieć, czy patrzy
  na ściany MG, czy na wielokąt gracza — inaczej powstaną dwa algorytmy, które rozjadą się
  przy pierwszej poprawce (dokładnie ten sam powód, dla którego 16b syntezuje statystę
  w kartę postaci zamiast dokładać gałąź w planerze)
- **Gotowe cegły w `shared`:** `isPointInPolygon` i `isSegmentClear` (`vision.ts`),
  `isPointExplored` i `fromExplorationMask` (`exploration.ts`), `blockingSegments` (`walls.ts`),
  `polylineMetres` i `metresPerPixel` (`measure.ts`)
- **Sufit przeszukiwania trzymaj przy budżecie**, nie przy mapie: przy scenie 4096 px
  i kratce 100 px cała plansza to 40 × 40 kratek, ale scena z drobną siatką potrafi mieć ich
  kilkaset tysięcy. Promień = tyle kratek, ile mieści budżet ruchu (poza walką: stały limit),
  plus twardy limit odwiedzonych węzłów
- **Trasa liczy się przy każdym ruchu kursora** — buforuj ostatni wynik po kratce docelowej,
  inaczej przeliczysz A* kilkadziesiąt razy na sekundę bez potrzeby
- **Marsz interpoluj w tickerze Pixi**, nie w `setInterval`: renderer ma już własny ticker
  (`tickFlicker`), a ruch tokenu musi być zsynchronizowany z klatką
- **Pułapka oględzin (kosztowała czas w 16b):** przez CDP do warstwy Pixi nie dociera żadne
  zdarzenie wskaźnika na tokenie — ani klik, ani drag, ani ręcznie wysłany `PointerEvent`.
  Ten etap jest z definicji nieodklikiwalny automatem: zaplanuj oględziny **myszą**
  (użytkownik przy komputerze) i pokryj `planWalk` testami czystych funkcji
