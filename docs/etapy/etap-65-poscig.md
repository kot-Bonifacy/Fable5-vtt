# Etap 65 — Scena pościgu i walka pojazdów

**Faza:** przed betą (zlecenie MG z 30.10 spoza planu) · **Wymaga etapów:** 30d (Moto Nomady),
42b (osłony i PW strzałów), 50 (walka wzorem Foundry), 55 (komunikaty), 63 (płynna walka,
„jedna broń w rękach” z 29.10)

## Skąd ten etap

MG (30.10): „zaprojektuj nowy etap, w którym dojdzie nowy rodzaj sceny »Scena pościgu«. Gracze
będą siedzieli w samochodzie/samochodach, a samochód będzie poruszał się po drodze. Tokeny będą
znajdowały się sztywno w samochodzie. Samochód będzie poruszał się automatycznie po trasie na
jakimś tam obszarze, ale zawsze w jednym kierunku. Wzoruj się na rozwiązaniach z innych systemów
VTT.” Przykłady od MG: mapa „Neonowy wiadukt nad cyberpunkowym miastem” (24×18, droga poziomo,
`C:\AI\materialy\mapy\`) i dwa auta widziane z góry (`auto_max.jpg`, `auto_max2.jpg` — podglądy ze
sklepu Roll20 ze znakiem wodnym, **nie trafiają do projektu**).

**To odwraca decyzję z 03.09** („pojazdy i walka pojazdów zostają narracji”, `POMYSLY.md`): MG
wybrał pełną walkę pojazdów z podręcznika (s. 189–192) i ulepszenia Moto (s. 161–165).

### Jak to robią inne VTT

- **Foundry — „bieżnia”:** droga to zapętlona tekstura przewijana w miejscu (moduły Tile Scroll,
  wcześniej Parallaxia; gotowa mapa MAD Cartographer „On the Road” w wersjach Slow i Fast), auta
  stoją w kadrze. Tło musi być bezszwowe, inaczej szew przejeżdża przez ekran.
- **Foundry — pasażerowie:** Token Attacher przypina figury do figury pojazdu (ruszasz autem,
  jadą pasażerowie); w systemie dnd5e pojazd to osobny aktor z załogą i pasażerami.
- **Zasady:** R. Talsorian ma darmowy dodatek *Hot Pursuit* (05.2024) z Rundami pościgu, ale
  sam wydawca pisze, że pościg da się poprowadzić zasadami walki pojazdów z podręcznika. Dodatku
  nie ma w `data/private`, więc etap stoi wyłącznie na podręczniku plus jednej domowej zasadzie
  tempa (65c), opisanej w `decyzje-i-uproszczenia.md`.

## Decyzje MG z 30.10 (pytania na starcie)

1. **Model ruchu: bieżnia.** Droga przewija się w kółko pod autami, auta zostają w kadrze
   i przesuwają się tylko względem siebie. Odległości między autami to prawdziwe odległości
   na mapie, więc zasięgi, linia strzału i walka działają jak dziś.
2. **Mechanika: pełna walka pojazdów** z podręcznika — PUK, ostrzał pojazdu, słabe punkty,
   Manewry, utrata kontroli, taranowanie, Ruch pojazdu w turze.
3. **Sterowanie:** gracz na fotelu kierowcy przesuwa swoje auto w swojej turze, MG steruje autami
   wrogów i może przesunąć każde.
4. **Wysiadanie:** gracz może przesiąść się na wolny fotel w tym samym aucie (pasażer przejmuje
   kierownicę). Przeskok do innego auta i wyskok na jezdnię — tylko MG.
5. **Skala: auto powiększone** — rysowane „pod stołem” (kompakt 3×5 kratek), figury normalnej
   wielkości na fotelach; scena pościgu ma własne metry na kratkę.
6. **Grafiki:** darmowe z sieci (wolna licencja, widok z góry, w repo jak inne zasoby), a szew
   mapy chowa kod — każdą mapę drogi da się zapętlić.
7. **Przeszkody i ruch uliczny: tak**, MG je wypuszcza na wybrany pas.
8. **Pojazd to własność postaci** — leży na karcie (z katalogu z podręcznika), ma swoje PUK
   i ulepszenia; wrogowie mają auta jak NPC-e.
9. **Bot-towarzysz tylko jako pasażer** — strzela i unika jak w zwykłej walce, nie prowadzi.
10. **Moto: wiersze „Pojazd” Taboru Rodziny stają się prawdziwymi pojazdami**, a ulepszenia
    z Moto działają w walce pojazdów.
11. **Rozsadzanie: gracze sami wybierają fotel** (kierownica — właściciel auta albo za jego
    zgodą), MG może przesadzić każdego.
12. **Ruch auta: tempo + budżet.** MG ustawia tempo pościgu (Ruch, np. 40). Auto wolniejsze od
    tempa co rundę samo traci dystans o `(tempo − Ruch) / 4` kratek, a kierowca w turze przesuwa
    auto najwyżej o `Ruch / 4` kratek. Za tylną krawędzią kadru auto odpada z pościgu (MG może
    je przywrócić).

| auto (tempo 40) | Ruch | budżet / turę | dryf / rundę |
| --------------- | ---- | ------------- | ------------ |
| kompakt         | 20   | 5 kratek      | −5 (w tył)   |
| sportowy        | 40   | 10 kratek     | 0            |
| supersamochód   | 60   | 15 kratek     | +5 (w przód) |

## Podział na podetapy

Każdy podetap to jedna sesja. Kolejność jest zależnością: 65b potrzebuje pojazdu z 65a, 65c
ruchu z 65b, 65d tury z 65c, 65e taranowania i Manewru z 65d.

**Korekta MG 31.10:** 65d nie mieścił się w jednej sesji (auto jako nowy cel przechodzi przez
cały planer ataku i rozliczanie obrażeń), więc dzieli się na **65d1 — ostrzał** (cel auto albo
pasażer, szyby, OB i PUK, wrak, słaby punkt, Ulepszone zespolenie, bot-pasażer, panel auta)
i **65d2 — manewry** (Manewr, utrata kontroli z ruchem od MG, taranowanie, bronie pokładowe).

## 65a — pojazd jako własność postaci ✅ (30.10)

**Rdzeń/system:** rdzeń zna wyłącznie „bryłę” pojazdu (nazwa, grafika, rozmiar w kratkach,
układ foteli). Liczby CP RED (PUK, Ruch, OB, ulepszenia) mieszkają w JSON-ie systemu,
tak jak `Character.sheet`.

- [x] Prisma `Vehicle` (migracja): `campaignId`, `ownerCharacterId?` (null = pojazd MG/NPC-a),
      `name`, `imageUrl?`, `widthSq`, `lengthSq`, `layout` (układ foteli), `system` (JSON CP RED).
      Pojazd jest osobnym wierszem, a nie polem karty, bo dzielą go pasażerowie, niszczy go scena
      i może należeć do NPC-a.
- [x] `shared/src/vehicles.ts` (rdzeń): układy foteli — `bike-2` (tandem), `car-2`, `car-4`
      (2+2), `car-6`, `van-8` — jako punkty w ułamkach bryły (0…1), fotel kierowcy oznaczony;
      domyślne rozmiary brył (motocykl 2×3, kompakt i sportowy 3×5, supersamochód 3×5, van 3×7).
- [x] `shared/src/systems/cpred/vehicles.ts`: `CpredVehicleStats` (PUK max/bieżące, Ruch
      bitewny, OB kadłuba, fotele, rodzaj: motocykl / samochód / wodny / powietrzny), lista
      ulepszeń z s. 163–165 z flagą „działa w walce” (niżej), `readCpredVehicle`, walidacja,
      testy.
- [x] Katalog pojazdów z podręcznika (s. 190–191) **w kompendium w `data/private`**, wg umowy
      `dane` — w repo tylko schemat, parser i wymyślone pojazdy testowe w `data/public`.
- [x] Ulepszenia działające mechanicznie w 65c–65e: Opancerzenie kadłuba (OB 13, bez szyb),
      Szyby kuloodporne (cienkie 15 PW / grube 30 PW, każde okno osobno), Wzmocniona konstrukcja
      (+20 PUK), Ulepszenie foteli (+2 fotele, nie w motocyklu), Nitro (dodatkowy Ruch za Akcję,
      raz dziennie na zbiornik), Pług bojowy, Wyrzutnia kolczatki, Ulepszone zespolenie
      (motocykl), pokładowe bronie (karabin maszynowy, miotacz ognia, wyrzutnia rakiet, broń
      biała, stanowisko bardzo ciężkiej broni). Reszta (Centrum komunikacji, Systemy
      bezpieczeństwa, Skrytki, Poduszkowiec, Silniki AV-4) to wiersz z opisem bez automatyki.
- [x] Moto: wiersz `kind: 'vehicle'` w `fleet` wskazuje `vehicleId` (migracja danych tworzy
      `Vehicle` z nazwy i kategorii wiersza, rodzaj zgadnięty z tabeli kategorii s. 162, a gdy się
      nie da — kompakt z notką), wiersz `upgrade` wskazuje pojazd i ulepszenie z listy.
      `MotoPanel` pokazuje pojazd zamiast gołej nazwy.
- [x] Karta: panel „Pojazdy” — lista pojazdów postaci (grafika, PUK, Ruch, fotele, ulepszenia),
      MG dodaje z katalogu i edytuje wszystko, gracz zmienia nazwę i grafikę. Zdarzenia
      `vehicle:create|update|delete` (tylko MG; gracz `vehicle:rename`).
- [x] Pojazdy MG/NPC-ów: okno „Pojazdy” w narzędziach MG (lista pojazdów kampanii bez
      właściciela, dodawanie z katalogu).
- [x] Kopie: `Vehicle` w `snapshot`, `archive`, paczce ZIP kampanii (grafika pojazdu jedzie
      z paczką) i w kopii postaci gracza (57c) — umowa `kopie`.
- [x] Testy: `shared` (odczyt, walidacja, ulepszenia zmieniające PUK/fotele), serwer (MG tworzy,
      gracz nie tworzy, migracja Moto).

### Rozstrzygnięcia 65a bez pytań (30.10)

1. **Katalog to kategoria kompendium „Pojazdy”** (`VehicleEntry`): 14 wpisów z s. 190–191 pisze
   `tools/import/parse-vehicles.py` do `data/private`, próbka w `data/public` ma trzy wymyślone.
   Półkę widzi cały stół (jak każdą), ale pojazdu nie kupuje się ani nie dodaje „na kartę” —
   cena idzie cennikiem domowym ×10 (sprzęt trwały) — od 31.10 ×0,3 (decyzje MG: kompakt 9000 ed).
2. **Pojazdy MG/NPC-ów to zakładka MG „Pojazdy”**, nie osobne okno — tak stoją inne narzędzia MG
   (Losowe, Sieć, Kopie). W niej też pojazdy postaci, każdy z „Edytuj…”.
3. **Panel „Pojazdy” na karcie siedzi w zakładce Ekwipunek**; gracz bez pojazdu go nie widzi.
4. **Gracz zmienia nazwę zawsze, a grafikę tylko na wbudowaną** (`/art/vehicles/`, dojdzie
   w 65b): wgrywa wyłącznie MG, a biblioteki „Grafik” gracz nie dostaje. Dziś grafikę daje MG
   z biblioteki w oknie edycji.
5. **Widoczność jak kart:** MG widzi wszystkie pojazdy, gracz — pojazdy swoich kart; auto NPC-a
   zobaczy na scenie pościgu (65b).
6. **Skasowana karta zostawia pojazd MG** (`SetNull`) — auto istnieje w świecie bez kierowcy.
7. **Pojazd Taboru zmienia karta Nomady:** okno MG zostawia jego ulepszenia z Taboru, nie oddaje go
   innej karcie i nie kasuje (`VEHICLE_IN_FLEET`); zdjęcie wiersza zabiera pojazd.
8. **Wiersz Taboru ma stały rodzaj** — „Dołóż pojazd” i „Dołóż ulepszenie” zamiast przełącznika;
   kategorię liczy wybór (`cpredFleetRowLevel`), stary wiersz z nazwą pokazuje „(stary wpis)”.
   Inny pojazd w tym samym wierszu przebudowuje liczby (PUK pełne, ulepszenia zostają) i nazwę,
   jeśli gracz jej nie zmieniał.
9. **Ulepszenie foteli raz w małych pojazdach** (nie „nigdy w motocyklu”) — s. 163 wymienia kosz
   motocyklowy; wpis w `decyzje-i-uproszczenia.md`.
10. **Rozmiar i układ foteli idą za fotelami po ulepszeniach** (`cpredVehicleLayout`), chyba że MG
    ustawi je ręcznie w tej samej zmianie.

## 65b — scena pościgu: bieżnia, auta, fotele ✅ (30.10)

- [x] `Scene.kind` = `"map" | "chase"` (migracja, stare sceny `"map"`), do tego `chaseDirection`
      (`right | left | up | down` — kierunek jazdy, domyślnie z proporcji tła: szersze → `right`),
      `chaseTempo` (Ruch, domyślnie 40), `chaseRunning` (droga jedzie / stoi), `chaseRoadFrom`,
      `chaseRoadTo` (pas jezdni w poprzek kierunku, w kratkach; auto nie wyjedzie poza niego).
      Nowa scena pościgu startuje z `visibility = "open"`, bez mgły i ciemności,
      `metersPerSquare = 1`, `playerMove = "stop"`.
- [x] „Nowa scena” pyta o rodzaj: „Mapa” / „Pościg”. Edycja sceny → sekcja „Pościg” (kierunek,
      tempo, pas jezdni, „Droga jedzie”). Rodzaj zmienia tylko MG; przejście `chase → map`
      wysadza wszystkich z aut na miejscu.
- [x] Prisma `SceneVehicle`: `sceneId`, `vehicleId`, `x`, `y` (środek bryły w pikselach sceny),
      `status` (`racing | behind | escaped | wrecked`). Jedno auto stoi na jednej scenie naraz.
- [x] `Token.vehicleSeat` (`sceneVehicleId` + numer fotela). **Serwer przelicza `x`, `y`
      figur w fotelach przy każdym ruchu auta i zapisuje je jak zwykły ruch** — zasięgi, linia
      strzału, PT i cała reszta liczą z figur bez wiedzy o pojazdach (rdzeń bez zmian).
      Figura w fotelu nie chodzi: `token:move` odmawia (`IN_VEHICLE`), poza MG.
- [x] Bieżnia w Pixi: tło jako `TilingSprite` przewijane wzdłuż `chaseDirection` z prędkością
      z `chaseTempo`, **wyłącznie po stronie klienta** (serwer niesie tylko tempo i `chaseRunning`;
      faza przewijania nie jest synchronizowana — to dekoracja). Szew: przy wczytaniu tła na
      płótnie powstaje tekstura, w której ostatnie ~3 kratki przenikają się z pierwszymi, więc
      zapętla się każda mapa drogi. `prefers-reduced-motion` → droga jedzie wolno.
- [x] Auto na mapie: sprite obrócony do kierunku jazdy (grafiki rysowane przodem do góry),
      podpis z nazwą, pasek PUK (65d), znaczniki wolnych foteli. Figury na fotelach w normalnym
      rozmiarze, nad autem.
- [x] Rozsadzanie: gracz klika wolny fotel w aucie (`vehicle:seat`); fotel kierowcy tylko
      właściciel auta albo gracz, któremu właściciel dał zgodę (`vehicle:allow-driver`), MG
      zawsze. Gracz przesiada się na wolny fotel tego samego auta. MG przeciąga figurę na
      dowolny fotel dowolnego auta i z auta na jezdnię.
- [x] MG stawia auto na drodze z karty postaci albo z okna „Pojazdy” (przeciągnięcie na mapę).
- [x] Grafiki startowe: auta i motocykl z wolną licencją (widok z góry, styl możliwie zbliżony
      do przykładów MG), w `packages/client/public/art/vehicles/` z plikiem licencji;
      przy grafice dowolnej MG wgrywa własną (uploads).
- [x] Testy: `shared` (pozycja fotela po obrocie, pas jezdni), serwer (fotel kierowcy bez zgody
      odmówiony, ruch auta przenosi figury, `token:move` w fotelu odmówiony).

### Rozstrzygnięcia 65b bez pytań (30.10)

1. **Zgoda na kierownicę trzyma się karty** (`SceneVehicle.drivers` — id kart), ale
   `vehicle:allow-driver` bierze **figurę**: gracz nie zna kart cudzych figur (`characterId` jedzie
   tylko w widoku prywatnym), a widok auta niesie `driverTokenIds`. Figura bez karty kierownicę
   dostaje od MG ręką. Daje ją właściciel auta albo MG w menu auta („Może prowadzić”).
2. **Gracz wsiada z jezdni do dowolnego auta** (pierwsze rozsadzenie) i przesiada się w obrębie
   swojego; do innego auta przesadza tylko MG (`VEHICLE_SWITCH_GM_ONLY`). Odległość od auta nie
   gra roli — rozsadzanie dzieje się przed pościgiem.
3. **MG przesadza upuszczeniem figury** (`token:move` z ręki, `final`): na wolny fotel — siada
   (także w innym aucie), na auto bez wolnego fotela pod kursorem — wraca na swój, na jezdnię —
   wysiada. Bot pożycza konto MG, ale nie ma `hand`, więc z fotela nie wychodzi (`IN_VEHICLE`).
4. **W 65b auto przesuwa tylko MG** przeciągnięciem (`chase:move`, bez budżetu, przycięte do pasa
   jezdni) — jazdę kierowcy i jego budżet daje 65c.
5. **Ustawienia pościgu to zakładka „Pościg” w Edycji sceny** (rodzaj, kierunek, tempo, „Droga
   jedzie”, pas jezdni) — szkic z „Zapisz”, jak Mapa i Siatka, bo niczego graczom nie zabiera.
   Pas widać u MG jako dwie przerywane bursztynowe linie.
6. **Kierunek jazdy zgaduje każde nowe tło sceny pościgu** (szersze → w prawo, wyższe → w górę),
   chyba że łata podaje kierunek — MG poprawia go potem w zakładce.
7. **„Na drogę”** na karcie pojazdu (u MG, gdy ogląda scenę pościgu) stawia auto na środku sceny
   przyciętym do pasa; przeciągnięcie karty na mapę — tam, gdzie upuszczono.
8. **Grafiki: 8 aut z paczki Unlucky Studio (CC0)**, `public/art/vehicles/ATTRIBUTION.md`.
   Motocykla w wolnej licencji i tym stylu nie znaleziono — rysuje się bryłą zastępczą
   (zaległość). Auto bez grafiki dostaje domyślną wg układu (`defaultVehicleArt`); właściciel
   wybiera wbudowaną na karcie pojazdu („Grafika”). Obrazek jest wpisany w bryłę z zachowaniem
   proporcji (auta z paczki są smuklejsze od 3×5).
9. **Gracz widzi auta `racing` i `wrecked`**, `behind`/`escaped` — tylko MG (pod 65c);
   `chase:sync` jest celowany per widz, bez seq.
10. **Auta na scenie jadą w paczce tylko z kampanią** (`SceneArchive.sceneVehicles`, fotele figur
    przez mapę id); pojedyncza scena w innej kampanii wjeżdża bez aut, a figury bez foteli.
11. **Bieżnia rusza, gdy zapętlona tekstura jest gotowa**; do tego czasu stoi zwykłe tło. Szew
    przenika `CHASE_SEAM_SQUARES` = 3 kratki na płótnie (`buildSeamlessTexture`).

## 65c — jazda, tempo i odpadanie ✅ (31.10)

- [x] Poza walką: kierowca przeciąga auto w pasie jezdni bez budżetu (MG ustawia szyk), dryf
      nie działa. Dziś (65b) przeciąga tylko MG: `chase:move` + `ChaseLayer.beginDrag`.
- [x] Kamera gracza jedzie za autem, w którym siedzi jego figura (oględziny 65b: po ruchu auta
      figura wyjeżdża graczowi z kadru).
- [x] Uruchomienie pojazdu (`vehicle-start` z `turn.ts`) za Akcję: kierowca przeskakuje na
      początek kolejki inicjatywy, Ruch pojazdu zastępuje Ruch kierowcy, kierowca traci Bieg.
      Auto wstawione do pościgu przez MG jest już uruchomione.
- [x] W walce: Akcja Ruchu kierowcy przesuwa auto najwyżej o `Ruch / 4` kratek (podgląd trasy
      i budżet jak przy ruchu figury, bez ścian), Nitro dokłada drugi taki ruch za Akcję.
- [x] Na początku każdej rundy serwer przesuwa każde auto o `(tempo − Ruch) / 4` kratek wzdłuż
      kierunku (czyste `chaseDrift` w `shared`, testy). Auto, którego bryła cała wyjedzie za
      tylną krawędź, dostaje `behind`, za przednią — `escaped`: znika z kadru graczy, jego
      figury wychodzą z kolejki, na czacie notka „X zostaje w tyle” / „X ucieka”. MG ma
      „Przywróć” w menu auta.
- [x] Zwykła jazda (s. 192): kierowca z REF + Prowadzenie ≤ 9 w każdej turze rzuca Test PT 10
      w ramach Akcji, porażka = utrata kontroli (65d). Rzut serwera kubkiem gracza.
- [x] Ręka na kierownicy: kierowca bez złącz interfejsu ma jedną rękę zajętą — broń dwuręczna
      niedostępna (zasada „jedna broń w rękach”, umowa `atak`). Zabranie ręki = utrata kontroli
      na początku następnej tury.
- [x] Kierowca pada (Śmiertelnie Ranny, nieprzytomny) albo fotel pusty → auto bez kontroli,
      dopóki ktoś się nie przesiądzie (przesiadka za Akcję Ruchu).
- [x] Bot-towarzysz na fotelu kierowcy niedozwolony (`BOT_CANNOT_DRIVE`).
- [x] `decyzje-i-uproszczenia.md`: wpis o tempie, dryfie i budżecie `Ruch / 4` (domowa zasada).
- [x] Testy: `shared` (dryf, budżet, odpadanie, zwykła jazda), serwer (runda przesuwa auta
      i figury, `behind` wyrzuca z kolejki).

### Rozstrzygnięcia 65c bez pytań (31.10)

1. **Budżet auta to budżet tury kierowcy** (`chase-budget.ts`): za kierownicą uruchomionego auta
   `moveBudgetForCombatant` daje `Ruch / 4` kratek × m/kratkę zamiast Ruchu z karty i znak
   `noRun` (Bieg odmawia `RUN_BLOCKED`, drugi pas zasięgu znika). Ruch auta to `{ kind: 'move',
   metres }` w linii prostej, jak marsz — rejestr, odmowy i pytanie MG o przekroczenie działają
   bez zmian, a kilka przeciągnięć dzieli jedną pulę. Nitro (`vehicle:nitro`) to Akcja z
   `grantsMove: 1` — drugi taki budżet.
2. **Dryf od rundy 2** — pierwszą rundę ustawia MG (szyk z przeciągania). Raz na rundę
   (`SceneVehicle.driftRound`), więc cofnięcie i ponowienie tury nie przesuwa aut drugi raz;
   droga, która stoi, nie dryfuje. Na początku rundy gaśnie też utrata kontroli.
3. **Auto za krawędzią** (cała bryła): `behind` / `escaped`, figury z foteli wychodzą z kolejki,
   na czacie wiersz akcji „Zostaje w tyle” / „Ucieka” z nazwą auta. „Przywróć do pościgu” (MG)
   stawia auto przy krawędzi, za którą wypadło, **bez** powrotu figur do kolejki — MG dokłada je
   „Dołącz do walki”.
4. **Silnik w menu auta** („Uruchom silnik” / „Zgaś silnik”, `vehicle:engine`): kierowca w walce
   płaci Akcją, a uruchomienie przesuwa go na początek kolejki (inicjatywa najwyższa + 1, powrót
   przez `resumeCombatantId`); MG przełącza bez kosztu i bez zmiany kolejki. Zgaszone auto nie
   jedzie (`VEHICLE_NOT_STARTED`) i dryfuje w tył z pełnym tempem.
5. **Test zwykłej jazdy** rzuca serwer przy pierwszym ruchu auta w turze (Akcja `vehicle-drive`,
   karta rzutu jawna, kości 3D lecą); Akcja już wydana → `DRIVING_TEST_NEEDS_ACTION`. Porażka →
   `lostControl` (auto „utrata kontroli”) do następnej rundy; MG może oddać kontrolę wcześniej.
6. **Kontrola auta w widoku** (`SceneVehicleView.control`): `driver`, `none` (pusty fotel albo
   kierowca Nieprzytomny, Martwy, Śmiertelnie Ranny — `cpredDriverIncapable`) i `lost`. Bez
   kierowcy nikt poza MG auta nie przesuwa, a dryf działa dalej.
7. **Przesiadka w walce kosztuje gracza**: w obrębie auta Akcja Ruchu, wsiadanie z jezdni Akcja
   („Wejście do pojazdu”, s. 191). MG przesadza bez kosztu.
8. **Bot nie siada za kierownicą** ani z menu (`BOT_CANNOT_DRIVE`), ani upuszczeniem przez MG
   (fotel kierowcy go nie przyjmuje).
9. **Kamera gracza** przesuwa się o tyle, o ile przesunęło się auto z jego figurą (bez animacji),
   więc auto stoi w tym samym miejscu ekranu; MG — bez zmian.
10. **Przeciąganie przez kierowcę** (`MapArea.driverDragLimit` → `vehicleDragRule` renderera):
    poza walką bez limitu, w walce tylko we własnej turze, przycięte do reszty budżetu w linii
    prostej (`chaseLimitMove`) po przycięciu do pasa.

## 65d1 — ostrzał pojazdów ✅ (31.10)

- [x] Cel ataku: figura w aucie **albo** auto (wybór w menu celu, jak przy osłonie). Pasażer jest
      celem przez szyby bez osłony, chyba że auto ma Szyby kuloodporne — wtedy szyba po stronie
      strzelca jest osłoną 15/30 PW (każde okno osobno, licznik okien w `system`).
- [x] Auto nie robi uniku; figura w aucie unika jak pieszo (auto-unik z 63b działa).
      Ulepszone zespolenie: kierowca motocykla ze złączem i REF ≥ 8 unika też za motocykl
      i pasażera.
- [x] Trafienie auta: obrażenia − OB kadłuba → PUK. PUK 0 = `wrecked`: auto staje, wypada
      z bieżni (dryf z pełnym tempem), figury zostają w środku.
- [x] Słaby punkt (s. 191): Akcja Celowanie na auto, −8, obrażenia po OB ×2; bronią białą
      w ruchome auto PT 13 i −8.
- [x] Panel auta (klik w auto): PUK, OB, fotele z portretami, ulepszenia, Nitro (zbiorniki na
      dziś), stan (`racing` …). MG zmienia PUK ręcznie (naprawa poza zakresem — `POMYSLY.md`).
- [x] Bot-pasażer: strzela wyłącznie do figur, nie do aut.
- [x] Testy: `shared` (obrażenia auta, słaby punkt), serwer (atak w auto, szyba kuloodporna,
      `wrecked`).

### Rozstrzygnięcia 65d1 bez pytań (31.10)

1. **Auto to czwarty cel ataku** obok figury, osłony i pola: `targetVehicleId` (+ `targetWindow`)
   w `attack:roll`, `CpredAttackTarget.vehicle` w planerze, `targetVehicleId` na karcie ataku,
   rzucie obrażeń i wpisie obrażeń. Logika celu mieszka w `realtime/vehicle-targets.ts`,
   obrażenia w `applyDamageToVehicleRow` (`damage.ts`) — droga jak osłony, z OB kadłuba.
2. **Klik w kadłub z bronią w ręku to strzał w auto** (`shootVehicleAt`, przed fotelem i menu);
   bez broni klik sadza albo otwiera panel, jak w 65b. Klik w figurę w fotelu celuje w figurę.
   Własnego auta nie ostrzeliwujesz (`OWN_VEHICLE`).
3. **Słaby punkt w oknie Celowania przy kursorze** — dla auta dwie sylwetki: „Bez celowania”
   i „Słaby punkt pojazdu” (ikona koła, game-icons.net CC BY 3.0). Planer daje −8 i znacznik
   `vehicleWeakSpot`, a ×2 liczy rozliczenie z zapisanej karty ataku, nie z drutu.
4. **Szyby to cztery burty** (przód, tył, lewa, prawa — `Vehicle.system.windows`, brak = pełne
   PW). Strzał w pasażera przez kuloodporną szybę z PW wraca kartą „Ostrzelaj szybę / Strzelaj
   mimo szyby” (`AttackBlocked.kind = 'window'`); strzelec w tym samym aucie szyby nie ma.
   Szczegóły w `decyzje-i-uproszczenia.md`.
5. **Cios bronią białą w jadące auto ma PT 13 także bez Celowania, w stojące — PT 0** (trafia
   zawsze). „Jedzie” = droga jedzie, silnik pracuje, auto nie jest wrakiem.
6. **Wrak liczy się z PUK**, kolumna `status` dalej mówi tylko „w kadrze / za krawędzią”.
   Widok pokazuje `wrecked`, wrak dryfuje w tył z pełnym tempem, `chase:move`, Nitro i silnik
   odmawiają `VEHICLE_WRECKED`. „Cofnij” trafienia przywraca PUK albo szybę.
7. **Ulepszone zespolenie: kierowca unika zamiast pasażera** (`RollAttackMeta.evasionBy`) —
   także w wezwaniu do Uniku u klienta i w „Bez uniku” MG.
8. **Panel auta to rozbudowane menu z 65b** (`ChaseVehicleMenu`): PUK z paskiem (MG wpisuje
   liczbę), OB, szyby na burtach, ulepszenia z Nitro, portrety w fotelach. PUK, OB i szyby są
   jawne dla stołu (`SceneVehicleView.hp/hpMax/armorSp/windows/upgrades`), jak PW osłony.
9. **Bot strzela tylko w figury z założenia** — `bot-combat` zawsze podaje `targetTokenId`;
   szyba kuloodporna jest dla niego osłoną (`TARGET_BEHIND_COVER`).
10. **Wybuch nie rusza auta** — granat w auto bije figury w obszarze jak dziś, a kadłub zostaje
    (`POMYSLY.md`). Ognia zaporowego na auto nie ma (`COVER_NOT_SUPPRESSIBLE`).

## 65d2 — manewry, taranowanie i bronie pokładowe ✅ (31.10)

- [x] Manewr (s. 192) za Akcję i Akcję Ruchu kierowcy: Gwałtowny skręt 13, Ostry zakręt 13,
      Nagłe zatrzymanie 13, Zawrót na ręcznym 17, Skok 17. MG wzywa do Manewru ~~przez panel
      decyzji (umowa `ui`)~~ z menu auta (decyzja MG z 31.10) albo kierowca deklaruje go sam.
      Porażka = utrata kontroli.
- [x] Utrata kontroli: auto oznaczone, MG wyznacza mu ruch ~~do końca tury~~ do następnej rundy
      (przeciągnięcie bez budżetu); zderzenie rozstrzyga się jak taranowanie.
- [x] Taranowanie: oba pojazdy ~~(albo pojazd i osłona/pieszy)~~ albo pojazd i pieszy po 6k6,
      każdy uczestnik Rana Krytyczna „Odgięciowy uraz kręgosłupa szyjnego” (wpis kompendium ran
      szukany po nazwie). Pług bojowy z przodu zdejmuje z taranującego obrażenia i ranę, z Nitro
      +2k6 dla uderzonego. Pieszy unika Testem ZW + Unik PT 13. Osłony — w 65e jako przeszkody.
- [x] Pokładowe bronie: ~~wiersz broni na pojeździe~~ wiersz broni składany z ulepszenia,
      strzela kierowca za Akcję (stanowisko bardzo ciężkiej broni — pasażer na swoim fotelu).
      Bez przeładowania w ruchu, poza stanowiskiem.
- [x] Testy: `shared` (Manewr, taranowanie z Pługiem i Nitro, zderzenie brył, wiersze broni
      pokładowej), serwer (Manewr gracza i na wezwanie MG, taranowanie dwóch aut, pieszy, broń
      pokładowa — `chase-ram.test.ts`).

### Rozstrzygnięcia 65d2 (31.10)

Dwie decyzje MG na starcie sesji: **całość w jednym podetapie** (bez dzielenia na 65d3) i **wezwanie
do Manewru z menu auta** zamiast panelu decyzji po każdym ruchu. Reszta bez pytań:

1. **Manewr to `vehicle:maneuver`** (`chase-driving.ts`): serwer rzuca Test REF + Umiejętność
   prowadzenia + 1k10 jawnie, z kośćmi 3D (`rollServerSkillTest`, karta „Manewr: …”). Porażka →
   `lostControl` i wiersz „Utrata kontroli” na czacie. Akcja `vehicle-maneuver` zastępuje Test
   zwykłej jazdy w tej turze. Akcją Ruchu jest sama jazda (`decyzje-i-uproszczenia.md`).
2. **Wezwanie MG to `SceneVehicle.maneuverCall`** (`vehicle:maneuver-call`, migracja
   `20261031180000_chase_maneuver`): czeka na aucie, widok niesie `maneuverCall`, a kierowca-gracz
   dostaje bursztynowy pasek „MG wzywa do Manewru: …” z „Wykonaj Manewr” (temat `maneuver`).
   Na wezwanie Manewr nic nie kosztuje. MG w menu auta gracza ma „Wezwij do Manewru” i
   „Odwołaj: …”, przy aucie NPC-a — same Manewry, które rzuca od razu.
3. **Manewry pasują do rodzaju pojazdu** (`cpredManeuversFor`): jezdnia i woda — pięć z tabeli,
   latające — Lądowanie i Manewr w powietrzu. Lista jedzie w widoku (`maneuvers` z podpisem PT).
4. **Zderzenie to geometria rdzenia** (`chaseFirstContact`, `chaseHitsWithFront` w
   `shared/chase.ts`): bryły w osiach sceny, metoda płyt, auto stojące przy przeszkodzie wjeżdża
   w nią od razu. Przeszkody to inne auta w kadrze (także wraki) i jawne figury spoza foteli
   z kartą albo PW.
5. **W walce `chase:move` bez `ram` staje przed przeszkodą**, z `ram` taranuje
   (`resolveRam` w `chase-ram.ts`), a jeśli przeszkoda ustąpiła, jedzie do celu albo następnej
   przeszkody (tej już nie taranuje). Klient pyta przed wysłaniem tą samą geometrią
   (`chaseObstacleAhead`): pasek „Zderzenie” z „Taranuj / Zatrzymaj się przed”. Poza walką
   kolizji nie ma.
6. **Kości taranowania to karty obrażeń wymierzone w auto albo pieszego** („Taranowanie: A → B”),
   rozliczane od razu przez `applyDamageRollTo` — z OB kadłuba, pancerzem pieszego i „Cofnij”.
   Nitro „w tej turze” czyta Akcję kierowcy (`vehicle-nitro`).
7. **Rana z taranowania** idzie przez nowe `giveCriticalInjury` (`damage.ts`, wyjęte z
   `character:injury`): figury z kartą w obu autach i pieszy po trafieniu. Brak wpisu w
   kompendium = brak rany, bez odmowy.
8. **Broń pokładowa to wiersz broni składany z ulepszenia** (`cpredMountWeaponRows`, id
   `mount:<pojazd>:<wiersz ulepszenia>` z `mountrows.ts`) i dokładany do listy kierowcy na czas
   strzału — na serwerze (`mountedShotFor` w `vehicle-mounts.ts`, rzut obrażeń
   `mountRowForDamage`) i na pasku klienta (`withTokenMounts`). Magazynek mieszka w aucie
   (`Vehicle.system.mountAmmo`), karta kierowcy zostaje nietknięta. Wiersz jest poza limitem rąk,
   a ręka na kierownicy go nie blokuje. Broń bierze wpis katalogu: Karabin szturmowy (30 naboi
   z opisu ulepszenia), Miotacz ognia, Wyrzutnia rakiet (3), Bardzo duża broń biała.
9. **Karabin pokładowy strzela tylko Ogniem ciągłym** (`MOUNT_AUTOFIRE_ONLY`), karabin i rakiety —
   w przednią ćwiartkę bryły (`MOUNT_FRONT_ONLY`). Strzela tylko kierowca (`MOUNT_DRIVER_ONLY`).
10. **Przeładowanie broni pokładowej to `vehicle:mount-reload`**: z paska (slot przeładowania)
    albo z menu auta „Przeładuj: …”. Na postoju za Akcję, w ruchu `MOUNT_RELOAD_MOVING`; widok
    niesie `moving` i `mounts`. Pasek nie pokazuje karabinowi pokładowemu trybu pojedynczego.
11. **Dryf staje przy zderzaku** (oględziny: wolniejszy wóz wjeżdżał w auto Oli i stały w jednym
    miejscu): `driftChaseRound` sprawdza drogę dryfu tą samą `chaseFirstContact`, bez obrażeń.
12. **Menu auta mierzy swoją wysokość** (`useMenuTop` z menu figury, oględziny: z Manewrami
    wyjeżdżało za okno) — nie mieści się pod kursorem, staje nad nim.

## 65e — przeszkody i ruch uliczny ✅ (31.10)

- [x] Prisma `ChaseObstacle`: `sceneId`, rodzaj (`civilian-car`, `barricade`, `roadwork`,
      `wreck`, `spikes`, własny z grafiką), pozycja, rozmiar, PW (jako osłona do taranowania).
- [x] MG wypuszcza przeszkodę na wybrany pas przy przedniej krawędzi (pasek narzędzi sceny
      pościgu). Tylko w walce — poza nią przycisk wyszarzony z podpowiedzią.
- [x] Na początku rundy przeszkoda jedzie w tył o `tempo / 4` kratek (w kadrze stoi względem
      drogi). Gdy jej droga przetnie bryłę auta, kierowca dostaje wybór: Manewr (Gwałtowny skręt,
      PT 13 — porażka = utrata kontroli i zderzenie) albo taranowanie. Przeszkoda za tylną
      krawędzią znika.
- [x] Wyrzutnia kolczatki: kierowca za Akcję zostawia `spikes` za autem; każde auto, które
      w nią wjedzie, rzuca Prowadzenie PT 17, porażka = 4k6 w słaby punkt.
- [x] Grafiki przeszkód ~~z tego samego źródła co auta (65b)~~ — auta cywilne i wraki z paczki
      aut z 65b, barierki, pachołki i beczki z Kenney Racing Pack (CC0), kolczatka z ikony
      „Caltrops” (game-icons.net, CC BY 3.0): paczka z 65b ma tylko auta.
- [x] Testy: `shared` (przecięcie toru z bryłą, kolczatka), serwer (wypuszczenie poza walką
      odmówione, zderzenie wzywa kierowcę — `chase-obstacles.test.ts`), E2E `@szybkie`
      (`48-poscig/t65-przeszkody`).

### Rozstrzygnięcia 65e bez pytań (31.10)

1. **Zderzenie liczy ruch względny** (`chaseObstacleSweep`): w układzie auta przeszkoda jedzie
   z `from − auto.from` do `to − auto.to`. Auto z Ruchem = tempo spotyka ją po `Ruch / 4`
   kratek, a auto stojące na drodze (zgaszone, wrak) jedzie z nią i nigdy nie wjeżdża.
   Przeszkody dryfują po autach w tym samym haku (`driftObstaclesRound` z `driftChaseRound`),
   także gdy na scenie nie ma żadnego auta.
2. **„Wybrany pas” to punkt kliknięcia**: MG bierze rodzaj z palety „Przeszkody” (ikona
   barierki na pasku narzędzi, tylko na scenie pościgu) i klika drogę — przeszkoda staje przy
   przedniej krawędzi, w poprzek tam, gdzie kliknął, przycięta do pasa jezdni. Esc odkłada.
   Własna przeszkoda: nazwa, PW i grafika z „Grafik” w tym samym rzędzie.
3. **Rozmiary i PW domyślne**: auto cywilne 3×5 i 25 PW (grafika losowana z czterech aut
   z 65b), barykada 3×1 i 30 PW, roboty drogowe 3×2 i 15 PW, wrak 3×5 i 40 PW (szare auto),
   kolczatka 3×1, własna 3×2 i 20 PW. Barykada i roboty mają szerokość auta — oględziny: 4
   kratki na jezdni wiaduktu zajmowały dwa pasy naraz.
4. **Czekająca przeszkoda** (`ChaseObstacle.blockingId`) stoi przy zderzaku i jedzie z autem,
   dopóki ktoś nie odpowie (`chase:obstacle-answer`) — bez limitu i bez kosztu, jak wezwanie do
   Manewru. Kierowca-gracz dostaje bursztynowy pasek „Na drodze: …” (temat `obstacle`), MG —
   pasek przy aucie NPC-a i dwie pozycje w menu przeszkody („Za kierowcę: …”). Do odpowiedzi
   gracz auta nie przesunie (`OBSTACLE_PENDING`).
5. **Auto bez kontroli** (pusty fotel, kierowca leży, utrata kontroli) wjeżdża w przeszkodę od
   razu, bez pytania.
6. **Skręt nieudany = utrata kontroli i zderzenie** przez `resolveRam` (przeszkoda trafia
   w przód, więc Pług działa). Po skręcie i po zderzeniu, którego przeszkoda nie przetrwała
   w całości, przeszkoda staje za tylnym zderzakiem i to auto jej drugi raz nie spotka
   (`passed`) — zasada domowa w `decyzje-i-uproszczenia.md`.
7. **Taranowanie przeszkody: 6k6 w PW jawnie na czacie, bez OB i bez „Cofnij”** (`ramObstacle`),
   PW 0 — „Przeszkoda rozbita” i znika. Auto bierze swoje 6k6 kartą obrażeń z „Cofnij”.
   Kierowca może też wjechać w przeszkodę sam w swojej turze — pasek „Zderzenie” z 65d2 zna
   przeszkody MG (bez kolczatki).
8. **Kolczatka**: `vehicle:spikes` za Akcję kierowcy (MG za NPC-a z jego budżetu), tylko
   w walce, jedna na każde wykupienie wyrzutni na pościg (`spikesUsed`, „Zrzuć kolczatkę (n)”
   w menu auta). Ląduje za tylnym zderzakiem; auto, które ją zrzuciło, jej nie przejeżdża.
   Przejazd to tor przeszkody przez bryłę (dryf) albo jazda kierowcy po niej
   (`chaseSpikesCrossed` w `driveWithContacts`). Test Prowadzenia PT 17 rzuca serwer, porażka
   albo brak zdolnego kierowcy — 4k6 w słaby punkt (`damage.system.vehicleWeakSpot`, stawia
   tylko serwer). Bez opon (łódź, poduszkowiec, latające) — nic.
9. **Przeszkody nie jadą w paczkach ani kopiach** (chwilowy stan walki), `chase → map` je
   kasuje, a koniec walki zostawia — MG zdejmuje je z menu przeszkody.
10. **Menu auta i przeszkody stoją nad kolumną komunikatów** (`z-index` 460 > 450) —
    oględziny: pasek przeszkody u MG zasłaniał „Zrzuć kolczatkę” w menu auta tuż pod nim.

## Przegląd mechanik 03.11 (zlecenie MG, bez ulepszeń pojazdów)

MG: „przeprowadź sprawdzanie mechanik sceny pościgu (za wyjątkiem ulepszeń pojazdów), czy mają
one sens i czy działają”. Testy `shared` i serwera pościgu przechodziły; sondy na żywym serwerze
potwierdziły pięć problemów, których testy nie łapały:

1. **Nitro martwe dla słabego kierowcy** — Test zwykłej jazdy zabierał Akcję, Nitro też jest
   Akcją, więc po Nitro jazda odmawiała `DRIVING_TEST_NEEDS_ACTION`. **MG: Test w ramach Akcji
   Ruchu.** Zrobione: `CpredTurnState.drivingTested`, `cpredMarkDrivingTested`, Test tylko gdy
   ruch mieści się w budżecie (wydatek na sucho), odmowa `DRIVING_TEST_NEEDS_ACTION` zniknęła.
2. **Wrak przyklejony do zderzaka** — stojące auto dryfowało w tył, stawało przy aucie za sobą
   i jechało z nim rundę po rundzie bez obrażeń. **MG: jak przeszkoda.** Zrobione:
   `SceneVehicle.blockingId` (migracja `20261103210000_chase_vehicle_blocking`), widok
   `blockingVehicleId`, `chase:vehicle-answer` (skręt / taranowanie), auto bez kontroli wjeżdża
   od razu; pasek kierowcy w `useObstacleNotice`, MG odpowiada z menu stojącego auta.
3. **Taranowanie wraku przejeżdżało przez niego** (bryły nachodziły na 450 z 500 px). **MG:
   wrak odepchnięty za auto.** Zrobione: `pushVehicleBehind` w `chase-ram.ts`.
4. **Utrata kontroli nie wjeżdżała w przeszkodę** — dryf zerował `lostControl`, zanim przeszkody
   pytały o kontrolę, więc reguła z 65e (rozstrzygnięcie 5) nigdy nie działała. Błąd kodu:
   `driftObstaclesRound` dostaje `lostBefore`.
5. **Przeszkoda zawieszona po ruchu MG** — MG odsunął auto NPC-a, a przeszkoda zostawała w kadrze
   z wezwaniem do kierowcy, którego przed nią nie było. Błąd kodu: `moveSceneVehicle` woła
   `releaseBlocking`.

Do tego decyzja MG bez błędu w kodzie: **taranowanie pieszego bije tylko pieszego**
(`CpredRamInput.pedestrian`). **Tempo + dryf + budżet zostają** (kierowca jadący pełnym Ruchem
równoważy dryf — MG potwierdził decyzję 12). Wpisy w `decyzje-i-uproszczenia.md`, test serwera
`chase-review.test.ts`.

## Kreator pościgu 03.11 (zlecenie MG, poza podetapami)

MG: „popraw interfejs tworzenia scen pościgowych”. Pytania na starcie i odpowiedzi MG: uwiera
**pas jezdni wpisywany liczbami**; forma — **kreator krok po kroku i rozbudowana zakładka
„Pościg”**; pas — **uchwyty na mapie** (liczby zostają), widoczne tylko przy otwartym „Pościgu”
i zapisywane jak reszta szkicu; **wbudowane tła drogi** z asfaltu CC0 dorysowanego skryptem —
autostrada, ulica 2+2, estakada i Badlands; kreator **z krokiem „Auta”**; w trakcie: **MG wgrywa
też własną grafikę**.

- [x] `tools/art/chase-roads.py` → `public/art/roads/{highway,street,viaduct,badlands}.webp`
      (+ miniatury, `ATTRIBUTION.md`): 35 × 18 kratek, 1 m na kratkę, okres 32 kratek — szew
      bieżni przenika identyczne pasy. Asfalt: ambientCG Asphalt031 i Asphalt033 (CC0).
- [x] `shared/chase-roads.ts`: `CHASE_ROADS`, `chaseRoadByUrl`, `chaseRoadPatch` (tło, rozmiar,
      siatka, skala, kierunek, pas jedną łatą), `chaseRoadWithEdge`, `chaseRoadCells`,
      `chaseFreeSpot`; testy `chase-roads.test.ts`.
- [x] Serwer: `scene:update` przyjmuje tło spoza uploadów tylko z listy dróg (rozmiar z listy);
      test w `chase.test.ts` (także adres spoza listy i paczka kampanii).
- [x] Uchwyty pasa na mapie (`ChaseLayer.setBandEdit`, `MapRenderer.setChaseBandEdit`):
      przyciemnienie poza jezdnią, ciągłe krawędzie z uchwytami, kursor `row-resize`, przyciąganie
      do linii siatki.
- [x] `ChaseWizard` (Tło → Droga → Auta → Gotowe) po „Utwórz → Pościg”; `ChaseSetup.tsx` —
      sekcje wspólne z zakładką „Pościg”, na której Edycja sceny pościgu się otwiera.
- [x] „Na drogę” stawia auto na wolnym miejscu jezdni (`chaseFreeSpot`) — w kreatorze, na
      zakładce i na karcie pojazdu; kamera kadruje scenę obok okna (`frameScene`).

### Rozstrzygnięcia kreatora bez pytań (03.11)

1. **„✕” kreatora zapisuje** to, co wybrano (MG przerywa w połowie i nie traci drogi); „✕”
   Edycji sceny dalej porzuca szkic, jak przy każdej scenie.
2. **Szkic idzie na serwer przy wejściu w „Auta”**, bo auta stawia serwer w zapisanym pasie;
   na zakładce „Pościg” „Na drogę” czeka na „Zapisz”, gdy droga ma niezapisane zmiany.
3. **Aktywacji kreator nie robi** — „Gotowe” odsyła do przycisku na liście scen (tam jest
   pytanie o scenę bez miejsca startu w trwającej sesji).
4. **Wbudowane drogi są poziome** (jazda w prawo); kierunek w pionie na takiej drodze daje
   ostrzeżenie, nie blokadę. Własna mapa dostaje kierunek z proporcji i pas na całą szerokość,
   a krok „Droga” pokazuje przy niej pole kratki.
5. **Wolne miejsce:** najpierw sąsiedni pas obok stojących aut, potem wzdłuż jezdni od środka;
   liczy tylko auta w kadrze (`racing`), z kratką odstępu.

## Kryteria ukończenia

Stan 31.10 (po 65e): wszystko zrobione i oglądane na instancji E2E (spece oględzin 65b–65e,
MG w Chromium, gracz w Firefoksie); **etap czeka na oględziny MG przy stole** — pierwsze
kryterium (szew bieżni na żywo, prawdziwy pas mapy wiaduktu) zostaje MG.

- [ ] MG zakłada scenę „Pościg” z mapą wiaduktu, droga jedzie bez widocznego szwu, a dwa auta
      drużyny i auto wroga stoją na jezdni. _(65b: oglądane na zrzutach, nie na żywo — MG)_
- [x] Gracze sami siadają w fotelach, figury jadą z autem; pasażer przejmuje kierownicę po
      kierowcy. _(65b, 65c)_
- [x] W walce kierowca przesuwa auto w budżecie, wolniejsze auto traci dystans co rundę, a auto
      za tylną krawędzią odpada z pościgu. _(65c)_
- [x] Ostrzał auta i pasażera, słaby punkt, Manewr, utrata kontroli i taranowanie działają wg
      s. 189–192, a ulepszenia Moto zmieniają wynik. _(65d1, 65d2)_
- [x] MG wypuszcza przeszkodę, kierowca wybiera Manewr albo taranowanie. _(65e)_
- [x] Pojazd Nomady z Moto i pojazd z karty wjeżdżają do pościgu i wracają z niego z PUK.
      _(65a — PUK mieszka na `Vehicle`, 65d1 — obrażenia kadłuba)_
- [x] Testy `shared` i serwera przechodzą, E2E pościgu (`@szybkie`, `48-poscig/t65-przeszkody`),
      oględziny w Firefoksie i Chromium.

## Rozstrzygnięcia bez pytań

- **Przewijanie drogi to dekoracja klienta.** Serwer nie wie, „gdzie” jest droga — niesie tempo
  i przełącznik. Dwóch graczy może widzieć przerywaną linię w innym miejscu i nic na tym nie
  zależy, bo żadna reguła nie czyta fazy tła.
- **Figury w fotelach mają prawdziwe `x`, `y`.** Alternatywa (pozycja liczona z auta przy każdym
  odczycie) zmusiłaby zasięg, linię strzału, PT, auto-unik i boty do wiedzy o pojazdach —
  łamie rdzeń/system i dotyka kilkunastu miejsc. Koszt: ruch auta to zapis kilku figur naraz.
- **Scena pościgu jest otwarta (`visibility = "open"`).** Na autostradzie nie ma ścian ani mgły,
  a dynamiczne widzenie z auta tylko by migało. MG może to zmienić jak na każdej scenie.
- **1 m na kratkę na scenie pościgu.** Przy kompakcie 3×5 kratek bryła ma ~3×5 m (prawdziwe auto
  ~2×4,5 m), pas ruchu na mapie wiaduktu ~3–4 kratki, a strzał przez całą jezdnię to ~20 m —
  sensowne PT zasięgu. Dryf i budżet z decyzji 12 są w kratkach, więc nie zależą od tej skali.
- **Dryf i przeszkody poruszają się skokiem raz na rundę**, nie płynnie. Między rundami przeszkoda
  stoi względem aut — w kadrze wygląda to tak, jakby jechała z prędkością pościgu, a na początku
  rundy przesuwa się animacją.
- **Pojazd nie jest osłoną dla figur spoza niego.** Na bieżni nikt nie stoi przy aucie, a ruchoma
  osłona to nowa geometria w 42b. → `POMYSLY.md`.
- **Naprawa pojazdu i zakup pojazdu w sklepie** poza etapem — MG zmienia PUK i daje pojazd
  z katalogu ręcznie. → `POMYSLY.md`.
- **Pojazdy na zwykłych mapach** (auto zaparkowane przed klubem, wsiadanie w scenie mapy) — poza
  etapem; pojazd istnieje na karcie i w scenie pościgu. → `POMYSLY.md`.
- **Pojazdy wodne i powietrzne** są w katalogu i na karcie, ale bieżnia jest dla dróg; łódź
  w pościgu na wodzie działa tak samo (inne tło), lot (Pilotaż, Manewr w powietrzu 17) — tylko
  jako Manewr z PT, bez wysokości.
- **Grafik ze znakiem wodnym Roll20 nie używamy** — to podglądy płatnego zestawu.
