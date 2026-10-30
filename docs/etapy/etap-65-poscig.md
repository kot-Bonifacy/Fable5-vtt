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
   cena idzie cennikiem domowym ×10 (sprzęt trwały).
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

## 65c — jazda, tempo i odpadanie ⬜

- [ ] Poza walką: kierowca przeciąga auto w pasie jezdni bez budżetu (MG ustawia szyk), dryf
      nie działa. Dziś (65b) przeciąga tylko MG: `chase:move` + `ChaseLayer.beginDrag`.
- [ ] Kamera gracza jedzie za autem, w którym siedzi jego figura (oględziny 65b: po ruchu auta
      figura wyjeżdża graczowi z kadru).
- [ ] Uruchomienie pojazdu (`vehicle-start` z `turn.ts`) za Akcję: kierowca przeskakuje na
      początek kolejki inicjatywy, Ruch pojazdu zastępuje Ruch kierowcy, kierowca traci Bieg.
      Auto wstawione do pościgu przez MG jest już uruchomione.
- [ ] W walce: Akcja Ruchu kierowcy przesuwa auto najwyżej o `Ruch / 4` kratek (podgląd trasy
      i budżet jak przy ruchu figury, bez ścian), Nitro dokłada drugi taki ruch za Akcję.
- [ ] Na początku każdej rundy serwer przesuwa każde auto o `(tempo − Ruch) / 4` kratek wzdłuż
      kierunku (czyste `chaseDrift` w `shared`, testy). Auto, którego bryła cała wyjedzie za
      tylną krawędź, dostaje `behind`, za przednią — `escaped`: znika z kadru graczy, jego
      figury wychodzą z kolejki, na czacie notka „X zostaje w tyle” / „X ucieka”. MG ma
      „Przywróć” w menu auta.
- [ ] Zwykła jazda (s. 192): kierowca z REF + Prowadzenie ≤ 9 w każdej turze rzuca Test PT 10
      w ramach Akcji, porażka = utrata kontroli (65d). Rzut serwera kubkiem gracza.
- [ ] Ręka na kierownicy: kierowca bez złącz interfejsu ma jedną rękę zajętą — broń dwuręczna
      niedostępna (zasada „jedna broń w rękach”, umowa `atak`). Zabranie ręki = utrata kontroli
      na początku następnej tury.
- [ ] Kierowca pada (Śmiertelnie Ranny, nieprzytomny) albo fotel pusty → auto bez kontroli,
      dopóki ktoś się nie przesiądzie (przesiadka za Akcję Ruchu).
- [ ] Bot-towarzysz na fotelu kierowcy niedozwolony (`BOT_CANNOT_DRIVE`).
- [ ] `decyzje-i-uproszczenia.md`: wpis o tempie, dryfie i budżecie `Ruch / 4` (domowa zasada).
- [ ] Testy: `shared` (dryf, budżet, odpadanie, zwykła jazda), serwer (runda przesuwa auta
      i figury, `behind` wyrzuca z kolejki).

## 65d — walka pojazdów ⬜

- [ ] Cel ataku: figura w aucie **albo** auto (wybór w menu celu, jak przy osłonie). Pasażer jest
      celem przez szyby bez osłony, chyba że auto ma Szyby kuloodporne — wtedy szyba po stronie
      strzelca jest osłoną 15/30 PW (każde okno osobno, licznik okien w `system`).
- [ ] Auto nie robi uniku; figura w aucie unika jak pieszo (auto-unik z 63b działa).
      Ulepszone zespolenie: kierowca motocykla ze złączem i REF ≥ 8 unika też za motocykl
      i pasażera.
- [ ] Trafienie auta: obrażenia − OB kadłuba → PUK. PUK 0 = `wrecked`: auto staje, wypada
      z bieżni (dryf z pełnym tempem), figury zostają w środku.
- [ ] Słaby punkt (s. 191): Akcja Celowanie na auto, −8, obrażenia po OB ×2; bronią białą
      w ruchome auto PT 13 i −8.
- [ ] Manewr (s. 192) za Akcję i Akcję Ruchu kierowcy: Gwałtowny skręt 13, Ostry zakręt 13,
      Nagłe zatrzymanie 13, Zawrót na ręcznym 17, Skok 17. MG wzywa do Manewru przez panel decyzji
      (umowa `ui`) albo kierowca deklaruje go sam. Porażka = utrata kontroli.
- [ ] Utrata kontroli: auto oznaczone, MG wyznacza mu ruch do końca tury (przeciągnięcie bez
      budżetu); zderzenie rozstrzyga się jak taranowanie.
- [ ] Taranowanie: oba pojazdy (albo pojazd i osłona/pieszy) po 6k6, każdy uczestnik Rana
      Krytyczna „Odgięciowy uraz kręgosłupa szyjnego” (sprawdź wpis w kompendium ran). Pług bojowy
      z przodu zdejmuje z taranującego obrażenia i ranę, z Nitro +2k6 dla uderzonego. Pieszy unika
      Testem ZW + Unik PT 13.
- [ ] Pokładowe bronie: wiersz broni na pojeździe, strzela kierowca za Akcję (stanowisko bardzo
      ciężkiej broni — pasażer na swoim fotelu). Bez przeładowania w ruchu, poza stanowiskiem.
- [ ] Panel auta (klik w auto): PUK, OB, fotele z portretami, ulepszenia, Nitro (zbiorniki na
      dziś), stan (`racing` …). MG zmienia PUK ręcznie (naprawa poza zakresem — `POMYSLY.md`).
- [ ] Bot-pasażer: strzela wyłącznie do figur, nie do aut.
- [ ] Testy: `shared` (obrażenia auta, słaby punkt, Manewr, taranowanie z Pługiem i Nitro),
      serwer (atak w auto, szyba kuloodporna, `wrecked`).

## 65e — przeszkody i ruch uliczny ⬜

- [ ] Prisma `ChaseObstacle`: `sceneId`, rodzaj (`civilian-car`, `barricade`, `roadwork`,
      `wreck`, `spikes`, własny z grafiką), pozycja, rozmiar, PW (jako osłona do taranowania).
- [ ] MG wypuszcza przeszkodę na wybrany pas przy przedniej krawędzi (pasek narzędzi sceny
      pościgu). Tylko w walce — poza nią przycisk wyszarzony z podpowiedzią.
- [ ] Na początku rundy przeszkoda jedzie w tył o `tempo / 4` kratek (w kadrze stoi względem
      drogi). Gdy jej droga przetnie bryłę auta, kierowca dostaje wybór: Manewr (Gwałtowny skręt,
      PT 13 — porażka = utrata kontroli i zderzenie) albo taranowanie. Przeszkoda za tylną
      krawędzią znika.
- [ ] Wyrzutnia kolczatki: kierowca za Akcję zostawia `spikes` za autem; każde auto, które
      w nią wjedzie, rzuca Prowadzenie PT 17, porażka = 4k6 w słaby punkt.
- [ ] Grafiki przeszkód z tego samego źródła co auta (65b).
- [ ] Testy: `shared` (przecięcie toru z bryłą, kolczatka), serwer (wypuszczenie poza walką
      odmówione, zderzenie wzywa kierowcę).

## Kryteria ukończenia

- [ ] MG zakłada scenę „Pościg” z mapą wiaduktu, droga jedzie bez widocznego szwu, a dwa auta
      drużyny i auto wroga stoją na jezdni.
- [ ] Gracze sami siadają w fotelach, figury jadą z autem; pasażer przejmuje kierownicę po
      kierowcy.
- [ ] W walce kierowca przesuwa auto w budżecie, wolniejsze auto traci dystans co rundę, a auto
      za tylną krawędzią odpada z pościgu.
- [ ] Ostrzał auta i pasażera, słaby punkt, Manewr, utrata kontroli i taranowanie działają wg
      s. 189–192, a ulepszenia Moto zmieniają wynik.
- [ ] MG wypuszcza przeszkodę, kierowca wybiera Manewr albo taranowanie.
- [ ] Pojazd Nomady z Moto i pojazd z karty wjeżdżają do pościgu i wracają z niego z PUK.
- [ ] Testy `shared` i serwera przechodzą, E2E pościgu (`@szybkie`), oględziny w Firefoksie
      i Chromium.

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
