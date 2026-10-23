# Etap 58 — Ukryte rzeczy, zamki i rozbrajanie pułapek

**Faza:** przed betą (zlecenie MG z 22.10 spoza planu) · **Wymaga etapów:** 26f i 51 (strefy
bronione), 46b (pojemnik z zamkiem), 18d (drzwi i zamek MG), 32 (wezwanie do Testu),
55 (komunikaty), 56 (zatrzymanie marszu na polu zauważenia)

**Podział na cztery sesje (propozycja 22.10, przyjęty — MG zlecił 58a tego samego dnia):** 58a → 58b, 58c, 58d. Zrobione: 58a (22.10), 58b, 58c i 58d (23.10) — **etap zamknięty**.
58a jest fundamentem: daje „rzut w drodze z zatrzymaniem”, którego używa 58d. 58b i 58c nie
zależą od siebie.

## Skąd ten etap

MG (22.10): „sprawdzić, czy działają mechaniki takie jak wykrywanie niewidocznych rzeczy,
otwieranie zamkniętego zamka, rozbrajanie pułapek”.

### Co sprawdzono 22.10 (stan przed etapem)

- **Testy:** serwer `zones` / `containers` / `walls` 77/77, `shared` `zones` / `container`
  31/31. E2E `t46b-pojemniki` 9/9 i tymczasowy spec oględzin pułapki (skasowany) 5/5. MG i
  Marek w Chromium, Ola w **Firefoksie**, zero błędów konsoli.
- **Działa:** ukryta strefa z PT Percepcji nie trafia do payloadu gracza. Figura gracza w
  promieniu 4 m rzuca sama, raz na postać, a sukces odsłania strefę tylko temu kontu. Porażka
  nie daje drugiej próby. „Rozbrój” na karcie strefy wyłącza system (wejście bez obrażeń),
  „Uzbrój” go przywraca. Pułapka, która kogoś złapie, odsłania mu się. Zamek pojemnika działa
  w pełni (Test, porażka, „Pozwól spróbować znowu”, klucz, ukryty pojemnik).
- **Przeciek (do naprawy w 58a):** wiersz automatycznej Percepcji idzie na czat **do
  wszystkich**. Gracz, który oblał, czyta „Percepcja — coś jest nie tak z tym miejscem … nic nie
  zauważa”, więc wie o pułapce. Pozostali czytają „zauważa: Podłoga elektryczna”, choć strefy
  w payloadzie nie mają. To łamie zasadę „dane niewidoczne dla gracza nie opuszczają serwera”.
- **Luka (do naprawy w 58a):** Percepcję liczy się tylko z **punktu końcowego** marszu
  (`runZonesAfterMove`, `now`), a pułapka odpala się na **całej trasie**. Gracz, który jednym
  klikiem przejdzie przez pułapkę i stanie dalej niż 4 m za nią, nie dostaje rzutu wcale
  (wniosek z kodu, `zones.ts`, blok „Perception, once per character per zone”).
- **Brak:** gracz nie rozbroi pułapki (robi to tylko MG przełącznikiem albo netrunner węzłem),
  nie otworzy zamkniętych na klucz drzwi, okna ani bramy (`OPENING_LOCKED`, wpis z 30.07
  w `POMYSLY.md`), a ukrytej figury nie wykryje Percepcją (odsłania ją tylko MG).
- **Gotowe dane:** wpis systemu obronnego niesie już z podręcznika PT i minuty
  rozbrojenia (`CpredNetDefenseProfile.disableDv` / `disableMinutes`, karta strefy u MG:
  „PT 13 Elektronika i zabezpieczenia · 1 min”).

## Decyzje MG z 22.10

1. **Rozbrajanie pułapki:** Test Elektroniki i zabezpieczeń jak przy zamku, jedna próba
   na postać. MG może pozwolić spróbować znowu.
2. **Porażka o 5 i więcej odpala system na rozbrajającego** (zasada domowa, podręcznik tego
   nie mówi). Mniejsza porażka zapisuje postać na liście prób, a pułapka zostaje uzbrojona.
3. **Czas rozbrajania** idzie na zegar świata: poza walką Test (udany i nieudany) przesuwa
   czas o `disableMinutes`. W trakcie walki rozbrajanie jest zablokowane z komunikatem.
4. **Zamknięte na klucz drzwi, okna i bramy działają jak pojemnik:** Test Otwierania zamków
   albo Elektroniki i zabezpieczeń z PT od MG, klucz, jedna próba na postać.
5. ~~**Rzut ukryty:** pełny wynik automatycznej Percepcji widzi tylko MG.~~ **Zmienione przez MG
   22.10 po 58a:** gracz rzuca Percepcję **z kubka na wezwanie**. Do rzutu figura stoi, wynik
   widzą MG i rzucający, a PT jest na karcie wezwania jak w każdym wezwaniu. Nazwę rzeczy MG
   dostaje osobnym wierszem, gracz — tylko po sukcesie.
6. **Rzut w drodze z zatrzymaniem:** Percepcja pada, gdy postać **znajdzie się blisko**
   ukrytej rzeczy (także w połowie marszu), a figura **staje** na czas rzutu. Gracz wie, że coś
   się stało, ale nie wie co.
7. **Ukryte figury:** Percepcja gracza przeciw Skradaniu NPC-a (rzut przeciwstawny z karty),
   sama przy zbliżeniu na 4 m, raz na postać, dopóki figura stoi w miejscu. Figura bez karty:
   PT od MG.

## Rozstrzygnięcia przyjęte bez pytań — czekają na słowo MG

- **Zatrzymanie działa też w walce.** Figura w swojej turze staje, a niewydane metry zostają
  do wydania. Bez tego marsz w walce omijałby rzut, który poza walką by padł.
- **Zatrzymanie nie zatrzymuje kolegów.** Inaczej niż przy zauważeniu wroga (56): staje tylko
  figura, która rzuca.
- **Pasek przy zatrzymaniu jest neutralny i taki sam dla sukcesu i porażki:** „Iskra przystaje —
  coś przykuło jej uwagę.” Po sukcesie dochodzi drugi pasek: „Iskra zauważa: Podłoga
  elektryczna”. MG dostaje w czacie wiersz tylko dla siebie, z pełnym rzutem.
- **Rzucają tylko figury graczy** — jak dziś. Strażnik MG zna swój budynek.
- **Odsłonięcie jest na konto, nie na stół** — jak dziś przy strefie. Gracz mówi reszcie sam.
- **Drzwi w walce nie kosztują Akcji** — tak jak dziś zamek pojemnika. Ekonomia akcji dla
  wszystkich zamków naraz to osobny wpis w `POMYSLY.md`.
- **Klucz do drzwi to ten sam mechanizm co do pojemnika** (`keyId`, „Wydaj klucz”). Jeden
  klucz może pasować do drzwi i do skrzyni, jeśli MG tak go wyda.
- **Skradanie NPC-a:** ZW + Skradanie z karty. Figura bez karty i bez PT od MG **nie rzuca
  się wcale** — MG odsłania ją ręcznie, jak dziś.
- **Ruch ukrytej figury przez MG zeruje listę prób** — nowa kryjówka to nowy rzut.

## 58a — Rzut w drodze, zatrzymanie i rzut ukryty

### Zakres

- [x] Percepcja przeciw ukrytej strefie pada na **klatce marszu**, która pierwszy raz wchodzi
      w promień 4 m. Figura staje na tym polu (`token:halt`), dalsza trasa przepada
- [x] Ten sam rzut przy upuszczeniu bez trasy (MG przeciąga, skok) — od 58a z **całej drogi**,
      nie tylko z punktu końcowego
- [x] Wiersz rzutu w czacie tylko dla MG; gracz dostaje neutralny pasek przy zatrzymaniu
      i drugi pasek przy sukcesie (kanał komunikatów z 55)
- [x] Ogólny haczyk „ukryta rzecz w zasięgu” (`hiddenNoticeDue` w `realtime/hidden-notice.ts`:
      strefa teraz, figura w 58d), żeby 58d nie pisało drugiej pętli po klatkach

### Kryteria ukończenia

- [x] Marsz jednym klikiem **przez** ukrytą pułapkę staje 4 m przed nią i rzuca Percepcję
      (test serwera)
- [x] Gracz, który oblał, ani żaden inny gracz nie dostaje wiersza z nazwą strefy ani wyniku
      (test serwera na payloadzie czatu i historii)
- [x] MG widzi pełny wiersz rzutu
- [x] Postać, która już rzucała, nie staje drugi raz przy tej samej strefie
- [x] Oględziny: gracz w Firefoksie widzi zatrzymanie i pasek, MG w Chromium widzi wiersz

### Jak wyszło (22.10)

Zatrzymanie **nie** jest zapisem pola z boku, jak `haltParty` w 56: klatka marszu, której
przyciągnięte pole wchodzi w zasięg, zamienia się w zwykłe lądowanie w `performTokenMove`.
Dzięki temu w walce Tura płaci tylko przebyty kawałek, a niewydane metry zostają (test: 4 m
z 10). Poza walką płaci pula. Rzut pada w `runZonesAfterMove`, jak dotąd. Wpięcie, kolejność
i warunki opisuje umowa na górze `tura`.

**Poza planem doszły cztery rzeczy:**

1. `runZonesAfterMove` liczy zasięg Percepcji z **całej drogi** (`zoneWithinReachOfPath`,
   `segmentDistanceToRect` w `shared/rects.ts`). Bez tego MG przeciągający figurę gracza
   obok pułapki dalej omijałby rzut.
2. `MOVE_HALTED`: lądowanie bez trasy przez 3 s po zatrzymaniu odpada. Klient, który dobiegł
   do celu przed `token:halt`, poniósłby figurę dalej, na pułapkę.
3. Oględziny złapały błąd klienta: po zatrzymaniu obwódka zaznaczenia zostawała obok figury.
   `haltWalk` stawia teraz węzeł na polu z serwera (pułapka na górze `tura`). Poprawka działa
   też przy zatrzymaniu z 56.
4. Plakietka „poufne” przy `gmaction` miała podpowiedź „widzą tylko MG i netrunner”. Teraz
   mówi „Reszta stołu tego wiersza nie widzi”.

**Zmiana MG z 22.10 (ta sama sesja, drugi commit): rzut z kubka zamiast ukrytego.** Strefa
wystawia wezwanie (`createCheckCall`, `visibility: 'gm'`) z adresem strefy, którego gracz nie
dostaje. Rozliczenie siedzi w haku rzutu na wezwanie, obok zamka pojemnika. Odwołane wezwanie
zużywa szansę postaci — to rozstrzygnięcie MG wyrażone odwołaniem. Figura bez karty dalej
dostaje rzut serwera w ukryciu, bo nie ma czym rzucić.

**T5b (E2E)** prowadził Kowala w turze z (20, 11) na podłogę przez jej zasięg. Krok
przepisany: marsz staje na (19, 11), Marek rzuca z karty wezwania (PT 17, „Niezdane”), wiersz
MG to `gmaction`, dopiero drugi marsz wchodzi na podłogę.

**Uwaga MG z 23.10: wezwanie nie może zdradzać, że obok coś jest.** Karta wezwania miała prompt
„X przystaje — coś przykuło uwagę.” i „wzywa: Otoczenie”, a pasek mówił to samo. Teraz karta
wygląda jak każde wezwanie MG: bez promptu, wzywa MG, Percepcja i PT. Pasek przy zatrzymaniu
mówi „X: Test Percepcji — rzuć kubkiem.”, a odmowa ruchu „Najpierw rzuć na Percepcję —
wezwanie czeka w kubku.”. PT zostaje na karcie, jak w każdym wezwaniu (decyzja 5).

## 58b — Rozbrajanie pułapki przez gracza

### Zakres

- [x] „Rozbrój” w menu figury albo w dymku zauważonej strefy — tylko gdy strefa jest w payloadzie
      gracza (zauważona albo odsłonięta) i figura stoi w zasięgu ręki od jej krawędzi
- [x] Test Elektroniki i zabezpieczeń z PT `disableDv` wpisu (MG może nadpisać na strefie).
      Kubek z wezwania (32), jak przy zamku pojemnika
- [x] Sukces: `armed = false`. Porażka < 5: postać na liście prób strefy. Porażka ≥ 5: system
      odpala się na rozbrajającego (`fireZone` z przyczyną „nieudane rozbrajanie”)
- [x] Poza walką zegar świata przesuwa się o `disableMinutes`. W walce odmowa z komunikatem
- [x] Karta strefy u MG: lista prób i „Pozwól spróbować znowu”
- [x] Gracz dalej nie dostaje `armed` ani PW strefy (etap 51) — po rozbrojeniu wie tylko to,
      co powiedział mu wynik Testu

### Kryteria ukończenia

- [x] Udany Test rozbraja, a wejście potem nie rani (test serwera)
- [x] Porażka o 5+ odpala system na rozbrajającego, porażka o mniej — nie (test `shared` na
      regule i test serwera)
- [x] Druga próba tej samej postaci — odmowa; po „Pozwól spróbować znowu” — kubek
- [x] W trakcie walki — odmowa z komunikatem; poza walką zegar przesunięty o minuty wpisu
- [x] Strefa niezauważona — gracz nie ma czego rozbroić (odmowa jak dla nieistniejącej)

### Jak wyszło (23.10)

Wzór to zamek pojemnika. Gracz klika prawym przyciskiem własną figurę i dostaje
„🛠 Rozbrój: <nazwa>” dla każdej strefy ze swojego payloadu, której krawędź leży w zasięgu
ręki. Klient liczy to tą samą miarą co serwer: środek figury najwyżej 2 m od prostokąta.
Dymka strefy nie ma, bo gracz nie klika w strefy. Serwer (`zone:disarm`) odmawia w kolejności:
strefa, której gracz nie widzi (`ZONE_NOT_FOUND`, jak dla nieistniejącej), figura poza sceną,
zasięg, brak PT, walka, druga próba. Potem wystawia wezwanie `gm` (wynik widzą MG i
rozbrajający) z adresem strefy i figury dopisanym po białej liście. Kubek otwiera się od razu.
Rozlicza `settleDisarmTest` w haku rzutu na wezwanie. Reguła siedzi w `shared/systems/cpred/trapdisarm.ts`.
Nowe kolumny strefy: `disarmDv` (nadpisanie MG) i `disarmTried`, obie w kopii kampanii.

**Rozstrzygnięcia przyjęte bez pytań — czekają na słowo MG:**

- **„W walce” znaczy: w kampanii stoi tracker walki**, także w rundzie 0. To ta sama miara
  co blokada rozwoju (`campaignInCombat`). Odmowa: „Rozbrajanie trwa minuty — w trakcie walki
  nie ma na nie czasu.”.
- **Zegar przesuwa się bez karty „Minęło…” na czacie.** Karta mówiłaby całemu stołowi, że ktoś
  przy czymś grzebał. Minuty zapisuje wiersz MG („· 2 min”).
- **Po udanym rozbrojeniu gracz może kliknąć jeszcze raz i dostaje nowy Test.** Nie zna `armed`
  (etap 51), więc odmowa „już rozbrojona” zdradzałaby stan. Test na rozbrojonej strefie
  niczego nie zmienia, a porażka o 5+ niczego nie odpala, bo system jest wyłączony.
- **Wezwanie „wzywa” nazwą strefy** (jak zamek nazwą pojemnika), a prompt brzmi
  „Rozbrajanie: <nazwa>”. Rozbrajający strefę zna, a wezwanie trafia tylko do niego i MG.
- **Porażka o 5+ odpala system tylko wtedy, gdy ten dalej działa.** Musi być uzbrojony, mieć
  PW, mieć opisany efekt i nie być wyłączony węzłem. Wieżyczka z rozbitą figurą nie strzela.

**Oględziny:** tymczasowy spec (skasowany), Ola w **Firefoksie**: menu, okno wezwania,
porażka 12 ≤ 13 („Fumble”), odmowa drugiej próby, sukces 18 > PT 5 po nadpisaniu przez MG.
Gracz dalej ma strefę jako uzbrojoną. MG w Chromium: karta strefy z „PT rozbrojenia”
(podpowiedź „z wpisu: 13”), „Nie udało się rozbroić: Iskra” i „Pozwól spróbować znowu”,
po sukcesie „Uzbrój” i podpis „rozbrojona”, wiersz „poufne” z wynikiem i minutami.

## 58c — Zamek drzwi, okna i bramy

### Zakres

- [x] Pola zamka na otworze: PT, Umiejętności (Otwieranie zamków / Elektronika
      i zabezpieczenia), `keyId`, lista prób — reguła z `container.ts` przeniesiona do wspólnej,
      żeby pojemnik i drzwi miały jedną (`cpredContainerOpening` → zamek ogólny)
- [x] Klik gracza w zamknięte na klucz drzwi w zasięgu ręki: zamiast samej odmowy — „Otwórz
      zamek” z kubkiem Testu. Klucz otwiera bez Testu
- [x] Karta drzwi u MG: PT, Umiejętności, „Wydaj klucz”, „Pozwól spróbować znowu”
- [x] Udany Test zdejmuje `locked` i otwiera drzwi

### Kryteria ukończenia

- [x] Kolejność odmów z `opening:toggle` zostaje (niewidoczne → `WALL_NOT_FOUND`, za daleko →
      `OPENING_OUT_OF_REACH`, dopiero potem zamek) — test serwera
- [x] Porażka, druga próba, „Pozwól spróbować znowu”, sukces, klucz — test serwera
- [x] Testy `container` dalej zielone po przeniesieniu reguły
- [x] Oględziny: gracz w Firefoksie otwiera drzwi wytrychem

### Jak wyszło (23.10)

Reguła zamka mieszka teraz w `shared/systems/cpred/lock.ts`: `cpredLockOpening(stan, zamek,
otwierający)`, `cpredLockTried`, `readCpredLock`. `container.ts` tylko ją opakowuje, a jego testy
przeszły bez zmian (poza ścieżką importu stałej). Rdzeń zna dalej wyłącznie rygiel
(`Wall.locked`). Obok niego trzyma nieprzezroczysty zapis systemu `Wall.lockRule` (JSON: PT,
Umiejętności, uchwyt klucza, lista prób). Gracz nie dostaje go nigdy (`playerOpeningView`).
Regułę woła serwer w `realtime/opening-locks.ts`.

Przebieg u gracza: klik w klamkę zaryglowanych drzwi daje w kolumnie komunikatów pytanie
„Zamknięte na klucz — same drzwi nie ustąpią. Spróbujesz otworzyć zamek?” z dwoma przyciskami
„Otwórz zamek: <Umiejętność>”. Przycisk wysyła `opening:pick`. Zdarzenie przechodzi przez tego
samego strażnika co klamka (`requirePlayerOpening`) i wystawia wezwanie do Testu z kubkiem.
Rozlicza je `settleOpeningLockTest` w haku rzutu: sukces zdejmuje rygiel i otwiera drzwi,
porażka zapisuje postać na liście prób. MG ma na karcie zaryglowanego otworu sekcję „Zamek”
(`OpeningLockFields.tsx`).

**Rozstrzygnięcia przyjęte bez pytań — czekają na słowo MG:**

- **Klucz działa już przy klamce.** Gdy któraś z postaci gracza stoi przy drzwiach z kluczem,
  klik otwiera je bez pytania i zdejmuje rygiel. Gracz nie słyszy „zamknięte na klucz”: postać
  przekręciła klucz, a nie odbiła się od drzwi.
- **Udany Test i klucz zdejmują rygiel na stałe.** Drzwi zamknięte potem są zwykłymi drzwiami.
  Zaryglować je znowu może tylko MG.
- **Gracz wybiera Umiejętność sam, bo nie wie, czym zamek ustępuje.** Dostaje oba przyciski.
  Umiejętność, której zamek nie przyjmuje, daje odmowę `LOCK_SKILL` („spróbuj drugiej”)
  i nie zużywa próby. Zdradza tylko, jaki to zamek, a to postać widzi przy klamce.
- **Działa postać przy klamce.** Otwiera pierwsza karta gracza, której figura stoi na
  wyciągnięcie ręki od drzwi. Oczy drużyny (etap 45) pokazują drzwi, ale wytrychu nie trzymają.
- **Wezwanie jest jawne, jak przy pojemniku.** Prompt „Zamek: Drzwi” (albo Okno, Brama),
  wzywa „Drzwi”. Wynik widzi cały stół.
- **Drzwi zaryglowane przed 58c mają zamek domyślny:** PT 13 („Codzienny”) i Otwieranie zamków.
- **Sekcja „Zamek” na karcie MG jest widoczna tylko przy zaryglowanym otworze.** Zapis zostaje
  po zdjęciu rygla, więc lista prób i klucz wracają z nim.
- **MG wysyłający `opening:pick` po prostu otwiera** (zdejmuje rygiel), bez Testu.

**Poza planem:** `opening:toggle` wycina graczowi zamek z odpowiedzi tą samą funkcją co listy
otworów (`playerOpeningView`). Wcześniej robił to osobnym zapisem.

**Oględziny:** tymczasowy spec (skasowany). Ola w **Firefoksie**: pytanie przy klamce, kubek
z karty wezwania, porażka 9 ≤ PT 17, odmowa drugiej próby, po „Pozwól spróbować znowu” sukces
16 > PT 8 i drzwi otwarte. MG w Chromium: karta drzwi z sekcją „Zamek” („Nie udało się: Iskra”,
„Pozwól spróbować znowu”), a po rzucie „Drzwi — otwarte”, „Bez rygla”. Widok MG zmienia się
dopiero po wylądowaniu kości (rzuty doganiają stół, #48).

## 58d — Ukryta figura przeciw Skradaniu

### Zakres

- [x] Dostawca „ukrytej rzeczy” z 58a dla figury `hidden`: rzut przeciwstawny Percepcja gracza
      vs ZW + Skradanie z karty NPC-a albo PT z pola na figurze (nowe, opcjonalne)
- [x] Sukces odsłania figurę **temu kontu** (lista `sightings` na figurze, filtr widoczności
      na serwerze). Lista prób na figurze, zerowana ruchem figury przez MG
- [x] Okno edycji figury u MG: „PT Percepcji” dla figury bez karty
- [x] Zauważona Wroga figura wchodzi w walkę z zauważenia (56) jak każda widoczna

### Kryteria ukończenia

- [x] Ukryty NPC ze Skradaniem 6 i ZW 6 nie trafia do payloadu gracza, dopóki ten nie wygra
      rzutu przeciwstawnego; potem trafia tylko do jego payloadu (test serwera)
- [x] Ruch figury przez MG daje graczowi nowy rzut
- [x] Figura bez karty i bez PT — żadnego rzutu, żadnego zatrzymania
- [x] Oględziny: gracz w Firefoksie, zatrzymanie i odsłonięcie czającego się NPC-a

### Jak wyszło (23.10)

Figura ma dwie nowe kolumny: `sightings` (JSON `{ users, tried }`, ten sam kształt co lista
zauważeń strefy) i `spotDv` (PT od MG dla figury bez karty). Pytanie „czy ta ukryta figura
istnieje dla tego konta” zadaje jedna funkcja `tokenHiddenFrom` w `shared/tokens.ts`. Woła ją
filtr list figur (`fetchSceneTokensFor`) i każda odmowa „takiej figury nie ma”: cel ataku,
chwyt, cel figury, grot, Konfrontacja, oględziny, Ustabilizowanie i leczenie. Zauważona figura
jedzie do gracza jako zwykła (`hidden: false`). Dalej podlega mgle, ścianom i ciemności.

Rzut wpina się w haczyk z 58a. `hiddenNoticeDue` pyta strefy, potem `hiddenFiguresNoticeDue`
(`realtime/hidden-figures.ts`). Lądowanie woła `runHiddenFiguresAfterMove` obok
`runZonesAfterMove`, z całej drogi. **Rzut przeciwstawny jest wezwaniem z PT:** Skradanie
figury (ZW + Skradanie + 1k10, `cpredHidingDv` w `systems/cpred/hiding.ts`) rzuca serwer
w chwili wezwania, a wynik staje się PT. Werdykt jest ten sam co w rzucie przeciwstawnym
(remis wygrywa ukryty), a karta wygląda jak każde wezwanie MG. Rozlicza `settleSpotFigureTest`
z haka rzutu (`hiddenTokenId` w zapisanym wezwaniu). Sukces dopisuje konto i rozsyła graczom
listy figur, a `checkSighting` na ich końcu zakłada walkę z 56, gdy to wróg. Ruch ukrytej
figury (każdy, nie tylko MG) i zmiana `hidden` ręką MG zerują listę.

**Rozstrzygnięcia przyjęte bez pytań — czekają na słowo MG:**

- **Rzut przeciwstawny jako PT, nie „druga strona: 12 + 1k10”.** Karta przeciwstawna mówiłaby
  graczowi wprost, że ktoś się czai, zanim zda Test (uwaga MG z 23.10 do 58a).
- **Karta wygrywa z PT od MG.** Figura z kartą rzuca Skradanie. Pole „PT Percepcji, gdy
  ukryta” jest w oknie edycji tylko przy figurze bez karty.
- **MG dostaje dwa wiersze „poufne”:** przy wezwaniu („Czajka kryje się: Skradanie się 12 + 3 =
  15”) i przy wyniku („wynik 24 vs PT 15 — zauważa: Czajka”).
- **Zbliżenie liczy się tylko z ruchu postaci gracza.** NPC, którego MG przesuwa obok stojącej
  postaci, rzutu nie wywołuje. To nowa kryjówka, a zauważenie wymaga podejścia gracza.
- **Pojemnik i figury graczy się nie liczą.** Ukryty pojemnik się nie skrada, a figury drużyny
  nie chowają się przed sobą Testem.
- **Pas inicjatywy zostaje wspólny.** Ukryta figura w walce jest graczom niewidoczna na pasie,
  także temu, kto ją zauważył: pas jedzie jednym rozgłoszeniem do całego stołu. Na mapie
  zauważający ją ma, może w nią celować i strzelać. MG odsłania ją ręką, gdy wychodzi z ukrycia.
- **Światło niesione przez ukrytą figurę dalej świeci tylko jej właścicielom.**
- **Menu figury MG pokazuje „(zauważona: N)”** przy „👁 Pokaż graczom”. Kto dokładnie, MG czyta
  w wierszach „poufne”.
- **Kopia sceny i kampanii niesie `spotDv` i `sightings`** (przez `remap`, jak strefa).

## Poza zakresem (do `POMYSLY.md`)

- Ukryte drzwi (sekretne przejście) jako nowa flaga na otworze — MG wybrał 22.10 tylko figury
- Wyważanie drzwi siłą (Atletyka / SIŁ) i ślad wyłamania
- Koszt Akcji w walce za Test zamka (pojemnik i drzwi naraz)
- Aktywne „Szukam” gracza (Percepcja na żądanie w promieniu) — dziś wezwanie MG (32)

## Wskazówki techniczne

- **Zatrzymanie to mechanizm z 56, nie nowy.** `checkSighting` w `performTokenMove`
  (`tokens.ts`) dostaje klatki marszu z pozycją na żywo i zatrzymuje figury przez `endWalk`
  + `token:halt` (`foe-sighting.ts`, `haltParty`). Rzut w drodze wisi obok, na tym samym
  wywołaniu. Pole zatrzymania liczy się tak samo (`pointAlongRoute` + `snapPoint`).
- **Rzut ma paść, zanim pułapka odpali** — kolejność z `runZonesAfterMove` („Before the
  trigger”). Zatrzymanie w promieniu 4 m załatwia to samo: figura staje przed krawędzią.
- **Wiersz tylko dla MG** — sekcja `czat` w `umowy-kodu.md` (rodzaje wierszy i widoczność),
  zanim dopiszesz nowy rodzaj. Pasek gracza to `notifyInfo` z 55 wysłany do jednego konta.
- **Jedna reguła zamka.** `cpredContainerOpening` / `cpredLockTestSettled` już są czyste
  i przetestowane. Przenieś je do neutralnego modułu zamka w `systems/cpred`, a nie kopiuj
  do drzwi. Rdzeń (`walls.ts`) nie importuje `cpred` — pola zamka drzwi to dane, a regułę
  woła serwer.
- **Rozbrajanie strefy używa `fireZone`** z `zone-effects.ts` — nie pisz drugiej ścieżki
  obrażeń (wskazówka z 26f).
