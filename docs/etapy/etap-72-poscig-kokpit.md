# Etap 72 — Przebudowa pościgu: prędkość, pasy ruchu i kokpit kierowcy

**Faza:** przed betą (zlecenie MG z 15.11 spoza planu) · **Wymaga etapów:** 65 (scena pościgu,
65a–65e), kreator pościgu z 03.11, 66c i 66d (wzorce pościgu), 69 (lewa belka bez ramek),
32 (wezwanie do Testu) · **Status:** 🟨 w toku — projekt 15.11, **72a ✅ 19.11**, **72b1 ✅ 19.11**,
**72b2 ✅ 20.11**, następny 72c

## Skąd ten etap

MG (15.11): „wykonaj projekt etapu 72, który ma przeprojektować tworzenie i odgrywanie scen
pościgu (obecnie są one nieintuicyjne zarówno dla MG, jak i dla graczy). Gracz niech otrzyma
w tych scenach UI, które będzie bardziej przypominało prowadzenie pojazdu, np. umożliwiało
skręcanie pojazdem w lewo, prawo, dodawanie gazu, hamowanie itp.”

Ten plik jest **projektem**, nie zapisem wykonania. Zmienia domową zasadę jazdy z etapu 65c
(decyzja MG nr 12 z 30.10: tempo + budżet `Ruch / 4` + dryf) — reszta walki pojazdów (ostrzał,
PUK, szyby, taranowanie, Pług, Manewry, kolczatka, broń pokładowa, fotele) zostaje.

## Co dziś nie gra (odpowiedzi MG z 15.11 i rozegrania 66c / 66d)

| nr  | problem                                                                                                                                                                                                                                                   | gdzie                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1   | **Jazda to przeciąganie auta myszą.** Kierowca ciągnie bryłę po mapie; nie czuć prowadzenia, nie widać, ile jeszcze przejedzie ani co się stanie po puszczeniu.                                                                                           | `MapArea.driverDragLimit`, `chase:move`                               |
| 2   | **Dryf zjada ruch.** Kierowca jedzie w swojej turze do przodu, a na początku rundy auto samo wraca w tył o `(tempo − Ruch) / 4`. W „Zastawie” oba kompakty co rundę „wracały na start”; gracz nie wie, czy goni, czy stoi.                                | `driftChaseRound`, `chase-budget.ts`                                  |
| 3   | **Akcje auta są ukryte.** Nitro, Manewry, kolczatka, silnik i taran siedzą w menu pod prawym klikiem albo wyskakują paskami („Zderzenie”, „Na drodze”, „MG wzywa do Manewru”). Gracz nie wie, co auto umie.                                               | `ChaseVehicleMenu.tsx`, `useObstacleNotice`                           |
| 4   | **Tempo, dryf i budżet są nieczytelne dla MG.** Trzy liczby (tempo sceny, Ruch auta, budżet tury) dają czwartą (dryf); nie widać z góry, które auto odpadnie i dlaczego. Dobór tempa do aut wymagał akapitu w każdym wzorcu („dlaczego tempo 40”).        | zakładka „Pościg”, `chaseDriftSquares`                                |
| 5   | **MG prowadzi każde auto NPC-a ręką.** Przeciąga je co turę, a po nieudanym Manewrze sam wpycha auto w przeszkodę.                                                                                                                                        | `chase:move` MG, `vehicle:control`                                    |
| 6   | **Reżyseria jest rozsiana.** Przeszkoda wychodzi tylko przy przedniej krawędzi i rusza rundę później (barykada z rundy 6 „nie zdąży”), posiłki to „Przywróć do pościgu” w menu auta, a plan rund żyje w notatkach wzorca. Nie ma jednego widoku sytuacji. | `ChaseObstacleTools.tsx`, `chase:restore`, notatki ⚠️ wzorców 66c/66d |

Poza zakresem bólu (MG nie zaznaczył): rozstawienie aut i rozsadzanie figur w fotelach oraz kadr
gracza — zostają, jak są.

## Decyzje MG z 15.11 (pytania na starcie i makieta)

1. **Model jazdy: prędkość i pasy.** Auto ma własną prędkość, która trwa między turami; gaz ją
   podnosi, hamulec zbija, a w poprzek jezdni auto zmienia pas ruchu. Dystans wynika z różnicy
   prędkości aut. Budżet `Ruch / 4` i osobny dryf znikają; wzorce 66c i 66d idą do rebalansu.
2. **Rytm: tury CP RED.** Kierowca prowadzi w swojej turze (jazda to Akcja Ruchu), serwer zostaje
   autorytatywny. Żadnej jazdy na żywo.
3. **Strzałki jak na ekranie.** Mapa zostaje pozioma (jazda w lewo). Krzyżak kokpitu jest
   ustawiony tak, jak widać auto: gaz wskazuje kierunek jazdy, hamulec przeciwny, pasy zmienia się
   strzałkami ▲ / ▼, a mapa podświetla pas, na który auto zjedzie.
4. **Bezwładność.** Gaz podnosi prędkość o jeden krok na turę, hamulec zbija o dwa. Manewr
   „Nagłe zatrzymanie” zatrzymuje od razu.
5. **Prędkość liczbą, w milach na godzinę** (w trakcie makiety: „zamiast biegów niech będzie
   podawana prędkość zmieniająca się o jakiś zakres”, „może być w milach”). Podręcznik podaje
   „Ruch 20 · 100 M/h”, więc 1 punkt Ruchu = 5 mil/h; krok gazu to +50 mil/h, hamulca −100 mil/h.
6. **Doganianie: Test przeciwstawny Prowadzenia co rundę** („Wyścig”) — różnica wyników daje
   kratki dystansu.
7. **Rzut Wyścigu kierowca-gracz wykonuje kubkiem** (ze Szczęściem z menu kubka); runda rusza,
   gdy wszyscy kierowcy-gracze rzucą.
8. **Bez klawiatury** — wyłącznie przyciski na ekranie (jak po usunięciu skrótów 1–9).
9. **Kokpit: wariant B z makiety — grupa „Pojazd” w lewej belce**, a stylistycznie ma
   przypominać belkę głównego UI: te same kafle, nagłówki, znaczki kosztu i dymki co w etapie 69,
   żadnego osobnego języka wizualnego.
10. **Auta NPC-ów: zamiar + autopilot, kokpit do ręki.** MG nadaje autu zamiar, serwer w turze
    kierowcy-NPC-a sam dobiera gaz, hamulec i pas; MG w każdej chwili prowadzi ręcznie tym samym
    kokpitem. Strzelanie NPC-ów zostaje u MG.
11. **Reżyseria: panel „Pościg” + plan rund.** Jedno okno MG ze stanem aut, przeszkodami na pas
    i odległość, posiłkami i planem rund („runda 3 — radiowóz”), o który serwer pyta na początku
    rundy.

## Projekt

### 1. Model: prędkość i pasy

**Prędkość.** `SceneVehicle.speed` w punktach Ruchu (wielokrotność 5), od 0 do Ruchu pojazdu.
Na ekranie zawsze **mil/h = Ruch × 5** (kompakt 100, sportowy 200, supersamochód 300). Zastępuje
kolumnę `momentum` z 05.11: z kierowcą prędkość trwa, bez kierowcy albo ze zgaszonym silnikiem
maleje o połowę co rundę (`cpredCoastSpeed`, bez zmian), wrak ma 0.

**Pedały (Akcja Ruchu kierowcy, raz na turę):**

| wybór   | skutek dla prędkości                             | uwagi                                              |
| ------- | ------------------------------------------------ | -------------------------------------------------- |
| Gaz     | +10 Ruchu (+50 mil/h), najwyżej do Ruchu pojazdu | wyszarzony przy maksimum                           |
| Hamulec | −20 Ruchu (−100 mil/h), najniżej do 0            |                                                    |
| —       | bez zmian                                        | jazda prosto z tą samą prędkością nic nie kosztuje |

**Pasy.** Jezdnia (`chaseRoad.from…to`) dzieli się na `Scene.chaseLanes` równych pasów; auto stoi
środkiem bryły na środku pasa. Wbudowana droga niesie liczbę pasów w `CHASE_ROADS` (od 19.11
jedyna to Neonowa ulica — 3 pasy po 4 m; cztery pozostałe MG usunął w 72a), własna
mapa MG dostaje `round(szerokość pasa jezdni / 4)` i pole „Liczba pasów”. Zmiana o jeden pas
wchodzi w tę samą Akcję Ruchu co pedał; o dwa naraz — Manewr „Gwałtowny skręt”.

**Ruch auta w turze kierowcy.** Auto przesuwa się **raz na turę, w turze swojego kierowcy**:

```
przesunięcie wzdłuż drogi [kratki] = (prędkość po pedale − prędkość pościgu) / 4 + zryw + Nitro
```

- **Prędkość pościgu** to prędkość auta kadru (punkt 2) z początku rundy, stała przez całą rundę.
  Auto równie szybkie stoi w kadrze, szybsze wysuwa się do przodu, wolniejsze zostaje.
- **Zryw** to wynik Wyścigu tej rundy (punkt 3).
- **Nitro** (Akcja, jak dziś) dokłada jednorazowo `Ruch / 4` kratek w tej turze i dalej daje
  +2k6 przy taranowaniu Pługiem; prędkości trwałej nie zmienia.
- Kierowca zatwierdza ruch przyciskiem **„Jedź”** — przed strzałem albo po nim. Jeśli skończy
  turę bez „Jedź”, serwer wykonuje ruch sam, bez pedału i bez zmiany pasa. Nic nie rusza auta
  poza turą jego kierowcy — **znika zjawisko „auto wraca samo”**.
- Poza walką kokpit jest nieczynny: szyk ustawia MG ręką (bez zmian), droga przewija się jak dziś.

**Przykład rundy** (prędkość pościgu 150 mil/h, czyli Ruch 30):

| auto                         | prędkość przed | wybór kierowcy       | prędkość po | zryw | ruch w turze       |
| ---------------------------- | -------------- | -------------------- | ----------- | ---- | ------------------ |
| Włóczęga (drużyna, maks 200) | 150            | Gaz, pas wyżej       | 200         | +2   | +4,5 kratki, pas 1 |
| Furgon (NPC, maks 150)       | 150            | — (zamiar „Uciekaj”) | 150         | 0    | 0                  |
| Radiowóz (NPC, maks 200)     | 200            | — („Goń Włóczęgę”)   | 200         | +1   | +3,5 kratki        |

W następnej rundzie prędkość pościgu to 200 mil/h (auto kadru przyspieszyło): Włóczęga przy
stałej prędkości stoi w kadrze, a furgon traci 2,5 kratki na turę.

### 2. Kadr zamiast tempa

- **Auto kadru** (`Scene.chaseAnchorId`): domyślnie pierwsze auto drużyny z kierowcą (reguła
  `party` z 05.11), MG może wskazać inne w panelu „Pościg”. Bez żadnego auta drużyny — najszybsze
  auto w kadrze.
- **Na początku każdej rundy** serwer: (a) ustala prędkość pościgu = prędkość auta kadru,
  (b) **przesuwa sztywno wszystko naraz** — auta, figury w fotelach, przeszkody — tak, żeby auto
  kadru wróciło na swoje miejsce w kadrze, (c) przesuwa przeszkody o drogę przejechaną w rundzie
  (`prędkość pościgu / 4`). Krok (b) to ruch kamery, nie aut: odległości między autami się nie
  zmieniają, a klient przewija o tyle samo teksturę drogi, więc wygląda to jak najazd kamery.
- **Miejsce auta kadru:** 30 % długości kadru od tylnej krawędzi, gdy drużyna goni (cel widać
  z przodu), 30 % od przedniej, gdy ucieka — przełącznik „Drużyna goni / ucieka” w ustawieniach
  pościgu (`Scene.chaseRole`, domyślnie „goni”).
- **Odpadanie z pościgu bez zmian:** bryła cała za tylną krawędzią → „zostaje w tyle”, za
  przednią → „ucieka”; załoga znika graczom i wychodzi z kolejki (reguła z 66c).
- **Stoi auto drużyny → stoi droga** (decyzja z 05.11) wynika z modelu samo: prędkość pościgu 0,
  jadące auta odjeżdżają o `prędkość / 4` na turę.
- **Pole „Tempo” znika z UI.** Kolumna `Scene.chaseTempo` zostaje jako **„Prędkość startowa”**
  (w mil/h): przy starcie walki każde auto z kierowcą i pracującym silnikiem dostaje
  `min(Ruch pojazdu, prędkość startowa)`. MG może poprawić prędkość każdego auta w panelu.

### 3. Wyścig — Test przeciwstawny co rundę

- **Kiedy:** na początku każdej rundy walki (także pierwszej), przed turą pierwszej figury.
- **Kto:** kierowca każdego auta w kadrze z kontrolą `driver`. Rzut: REF + Umiejętność
  prowadzenia właściwa dla pojazdu + 1k10, z karami jak każdy Test (rany, pancerz).
  **Nikt nie dostaje premii „na siłę” (decyzja MG 15.11):** do rzutu wchodzi wyłącznie
  Umiejętność prowadzenia nazwana wprost (i to, co planer dolicza do niej z karty, np. Moto).
  Kto jej nie ma — statysta, funkcjonariusz Wsparcia — rzuca **samą Cechę + 1k10**; ogólna
  wartość statysty ani Wartość bojowa Wsparcia do Wyścigu nie wchodzą. Funkcjonariusz nie ma
  REF w tabeli, więc rzuca **czyste 1k10** (jak w inicjatywie, decyzja z 30c).
- **Jak:** za NPC-ów rzuca serwer od razu. Kierowca-gracz dostaje **wezwanie na kubek**
  (`createCheckCall` wystawione przez serwer, adres skutku z białej listy — umowa `kosci` z 46b1)
  i może dorzucić Szczęście z menu kubka. **Runda czeka** z paskiem „Wyścig — czekam na: Rdza”;
  MG ma w panelu „Pościg” i na pasku „Rzuć za gracza” i „Pomiń Wyścig” (gracz odszedł od stołu).
- **Skutek — zryw:** `zryw = floor((wynik − najniższy wynik rundy) / 2)` kratek, najwyżej 5.
  Najsłabszy kierowca rundy ma 0. Zryw dolicza się do ruchu auta w turze jego kierowcy i gaśnie
  z końcem rundy. Jedno auto z kierowcą w kadrze — Wyścigu nie ma.
- **Słaby kierowca** (REF + Umiejętność ≤ 9, s. 192): rzut Wyścigu jest jego Testem zwykłej jazdy —
  wynik poniżej 10 to utrata kontroli na tę rundę. Osobny Test przy pierwszym ruchu w turze
  (65c, `drivingTested`) znika. Próg liczy Moto (NOM-03). **Reguła dotyczy tylko postaci
  z pełną kartą** (decyzja MG 15.11, jak dziś w `requireDrivingTest`): kierowca bez karty rzuca
  Wyścig na zryw, ale od samego rzutu kontroli nie traci — tylko po nieudanym Manewrze.
- **Czat:** jedna karta „Wyścig — runda N” (Test przeciwstawny Prowadzenia) z wynikami i zrywem
  każdego kierowcy; rzuty graczy dopisują się do niej, gdy padną.

Skala do oceny w 72g: kierowca lepszy o 4 punkty zyskuje średnio 2 kratki na rundę, czyli
niewiele mniej niż auto szybsze o jeden krok (2,5 kratki).

### 4. Zderzenia, przeszkody, utrata kontroli, Manewry

**Zderzenie na drodze ruchu** (geometria `chaseFirstContact` i `resolveRam` bez zmian):

- Podgląd ruchu wykrywa pierwszą przeszkodę na odcinku „stąd → tam” (auto, wrak, pieszy,
  przeszkoda MG). Belka pokazuje wtedy wybór zamiast samego „Jedź”:
  **„Taranuj”** (jeden taran na turę, jak od 06.11), **„Zwolnij za nim”** — auto staje przy
  zderzaku i przyjmuje prędkość blokującego — dostępne, gdy wystarcza zwykły hamulec (różnica
  prędkości najwyżej 100 mil/h); przy większej zostaje taran, zmiana pasa albo Manewr.
- Zmiana pasa na zajęty odcinek: **„Zepchnij”** (taran bokiem — bez Pługa, belka mówi to wprost)
  albo zostajesz na pasie.

**Przeszkody** stoją na drodze: co rundę zbliżają się do kadru o `prędkość pościgu / 4` kratek.

- Każda przeszkoda ma na mapie podpis **„16 m · za 2 tury”** liczony dla auta patrzącego gracza
  (u MG — dla auta kadru), więc kierowca ma czas zmienić pas zwykłą jazdą.
- MG wypuszcza przeszkodę z panelu „Pościg”: rodzaj, **pas** i **odległość przed wybranym autem**.
  Panel ostrzega, gdy odległość jest mniejsza niż jedna runda jazdy („kierowca nie zdąży
  zareagować”) — nie blokuje.
- Gdy przeszkoda dojedzie do zderzaka (hak początku rundy, `chaseObstacleSweep` bez zmian),
  kierowca dostaje wybór w grupie „Pojazd”: **Gwałtowny skręt (PT 13)**, **Nagłe zatrzymanie
  (PT 13)** albo **Taranuj**; pasek powiadomienia zostaje. Auto bez kontroli wjeżdża samo.

**Utrata kontroli — automat zamiast ręki MG:**

- prędkość spada od razu o 10 Ruchu (−50 mil/h);
- serwer rzuca 1k6: 1–2 auto zjeżdża o pas wyżej, 3–4 jedzie prosto, 5–6 o pas niżej (przy
  krawędzi jezdni zostaje na pasie);
- ruch tej rundy wykonuje serwer w turze kierowcy (albo od razu, gdy kontrolę stracono w jego
  turze); co stanie na drodze, rozstrzyga `resolveRam` jak dziś;
- kontrola wraca na początku następnej rundy; „Oddaj kontrolę” i darmowa ręka MG zostają.

**Manewry** (s. 192; koszt jak dziś — Akcja, na wezwanie MG bez kosztu):

| Manewr            | PT  | skutek w nowym modelu                                                         |
| ----------------- | --- | ----------------------------------------------------------------------------- |
| Gwałtowny skręt   | 13  | zmiana o dwa pasy naraz albo ominięcie przeszkody / auta tuż przed zderzakiem |
| Nagłe zatrzymanie | 13  | prędkość 0 od razu (także jako odpowiedź na przeszkodę)                       |
| Ostry zakręt      | 13  | na wezwanie MG (zakręt drogi) — także z planu rund, dla wszystkich kierowców  |
| Zawrót na ręcznym | 17  | bez zmian                                                                     |
| Skok              | 17  | bez zmian                                                                     |

Porażka każdego Manewru to utrata kontroli (automat wyżej).

### 5. Kokpit kierowcy — grupa „Pojazd” w lewej belce (wariant B)

Makieta: https://claude.ai/artifact/NxwwTTvFgC1peFnxcwTsAX (prywatne, konto MG) — artboard
**B**; A i C to odrzucone warianty.

**Zasada stylu (decyzja MG nr 9):** grupa składa się wyłącznie z części belki z etapu 69 —
`hud-group-title`, duży kafel `hud-slot--large`, średnie `hud-slot--medium`, ikony
`hud-slot--icon`, znaczki `hud-cost`, dymek `HudTip`, wybrany przycisk „zalany” jak wzięty Skok.
Żadnych nowych ramek, teł ani kolorów.

Grupa pojawia się, gdy zaznaczona figura siedzi w fotelu kierowcy uruchomionego auta na scenie
pościgu w walce; zajmuje miejsce Biegu, Skoku i Skradania (w fotelu i tak odmawiają). Od góry:

1. **Nagłówek „Pojazd”** z kreską pędzlem.
2. **Duży kafel auta** (budowa kafla broni): sylwetka auta z plamą, nazwa, wiersz
   „**150** → **200** mil/h · maks. 200”, pasek PUK pędzlem. Klik otwiera panel auta
   (`ChaseVehicleMenu` — fotele, szyby, ulepszenia).
3. **Wiersz „Po ruchu”** (odpowiednik „W ręku”): „+4,5 m · pas 1 · do furgonu 4,5 m” i zryw
   z Wyścigu. Cel dystansu to trwały cel figury (`T`), a bez niego najbliższe wrogie auto.
4. **Krzyżak ze średnich kafli**, ułożony jak na ekranie: gaz po stronie kierunku jazdy sceny
   (`chaseDirection` — przy jeździe w lewo po lewej), hamulec naprzeciw, „Pas wyżej” nad nimi,
   „Pas niżej” pod. Pod nazwą skutek: „+50 MIL/H”, „−100 MIL/H”, „ZMIANA PASA”. Niedostępny
   wybór jest wyszarzony z powodem w dymku (maksimum, krawędź jezdni).
5. **„Jedź”** — napis tuszem z czerwoną kreską (jak „Kończę turę”) i znaczek Akcji Ruchu, gdy
   wybrano pedał albo pas. Po ruchu krzyżak gaśnie do końca tury („Ruch wykonany”).
6. **Rzadkie akcje auta jako ikony** z kosztem w rogu i opisem w dymku: Nitro (liczba
   zbiorników), Manewr (szuflada z listą i PT, jak szuflada trybów ognia), Kolczatka, Silnik.
7. **Decyzje czekające na kierowcę** (przeszkoda przed zderzakiem, wezwanie MG do Manewru,
   zderzenie na drodze ruchu) stają w grupie jako wiersz z przyciskami.

Broń pokładowa zostaje dużym kaflem w grupie „Broń” (65d2). Portret na czas jazdy jest niższy
(kadr ok. 16:10), żeby grupa mieściła się bez przewijania przy 900 px wysokości — do oceny przy
oględzinach.

**Na mapie** (`ChaseLayer`): po wyborze pedału albo pasa stoi **duch auta** w miejscu po ruchu,
pas docelowy jest podświetlony, a od ducha do celu biegnie miarka z metrami; przy każdym aucie
stoi jego prędkość w mil/h (widzi ją cały stół), przy przeszkodzie „N m · za N tur”. Ruch po
„Jedź” jest animowany.

**Znika:** przeciąganie auta przez gracza w walce (`chase:move` gracza odmawia `USE_COCKPIT`),
licznik metrów kierowcy, pasek „Zderzenie” jako osobne pytanie. Menu auta pod prawym klikiem
zostaje dla MG i jako panel informacyjny.

### 6. Auta NPC-ów — zamiar i autopilot

- `SceneVehicle.intent` + cel: **Ręcznie** (domyślnie), **Uciekaj**, **Goń X**, **Trzymaj dystans
  do X**, **Taranuj X**, **Blokuj X** (zajedź drogę: ten sam pas, przed X). MG ustawia zamiar
  w panelu „Pościg” albo w menu auta; wzorzec sceny może go nieść.
- Na początku tury kierowcy-NPC-a serwer wybiera pedał i pas czystą funkcją
  (`cpredChaseAutopilot` w `shared`, testy) i wykonuje ruch; MG potem strzela i kończy turę.
  Autopilot **taranuje wyłącznie z zamiarem „Taranuj”**, w innych przypadkach zwalnia za
  przeszkodą; na przeszkodę przed zderzakiem **nie odpowiada** — to dalej wybór MG.
- **Kokpit do ręki:** przy zamiarze „Ręcznie” MG widzi w belce zaznaczonego kierowcy tę samą
  grupę „Pojazd” co gracz. Zmiana zamiaru działa od następnej tury auta; darmowa ręka MG
  (przeciągnięcie) zostaje do poprawek.
- **Hamulec:** przełącznik „Autopilot” w panelu „Pościg” (`Scene.chaseAutopilot`) wyłącza
  automat dla całej sceny — wszystkie auta jadą wtedy ręcznie.
- Bot-towarzysz dalej nie prowadzi (`BOT_CANNOT_DRIVE`).

### 7. Panel „Pościg” i plan rund (MG)

Okno pływające MG, otwierane z paska narzędzi sceny pościgu (zastępuje ikonę palety przeszkód;
paleta przenosi się do panelu):

- **Nagłówek:** runda, prędkość pościgu w mil/h, „Kadr trzyma się: [auto]”, „Drużyna goni /
  ucieka”, „Autopilot”.
- **Auta** (od czoła do ogona): nazwa, stan (w pościgu / rezerwa / wrak / uciekło), prędkość
  i maksimum, pas, **dystans do auta kadru** (+ przed, − za), kierowca i kontrola, PUK, zamiar;
  przyciski „Przywróć do pościgu” (z wyborem pasa i strony kadru), „Ucieka”, prędkość do
  poprawienia ręką.
- **Przeszkody:** rodzaj z palety, pas, odległość przed wybranym autem, podpowiedź „dojedzie za
  N tur”; lista przeszkód na drodze z „Zdejmij”.
- **Plan rund** (`Scene.chasePlan`): wiersze „runda N → zdarzenie”:
  posiłki (auto z rezerwy, pas, przód / tył kadru), przeszkoda (rodzaj, pas, odległość, przed
  kim), Manewr na wezwanie (jedno auto albo wszyscy), notatka dla MG (okrzyk, przypomnienie).
  Na początku rundy N zdarzenie trafia do **panelu decyzji MG** (umowa `ui`) jako
  „Plan rundy 3: Radiowóz NCPD dołącza — Wypuść / Pomiń / Odłóż o rundę”. Nic nie dzieje się
  bez zgody MG.
- **Kreator i zakładka „Pościg”:** krok „Droga” dostaje „Liczbę pasów” (linie pasów na mapie
  przy edycji), „Prędkość startową” w mil/h zamiast „Tempa” i „Drużyna goni / ucieka”; krok
  „Auta” — zamiar przy aucie NPC-a; nowy krok „Plan” (opcjonalny).
- **Wzorzec sceny** (`scene.json`): `chase.lanes`, `chase.role`, `chase.plan`,
  `vehicles[].intent`.

### 8. Co się zmienia w danych i protokole

| obszar    | zmiana                                                                                                                                                                                                                                             |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prisma    | `SceneVehicle`: `speed` (z `momentum`), `intent`, `intentTargetId`, `movedRound` (z `driftRound`), `raceBonus`; `Scene`: `chaseLanes`, `chaseAnchorId`, `chaseRole`, `chaseAutopilot`, `chasePlan` (JSON), `chaseRace` (JSON — stan Wyścigu rundy) |
| zdarzenia | nowe: `vehicle:drive` (pedał, pas, taran / zwolnij), `chase:intent`, `chase:set-speed`, `chase:plan`, `chase:plan-answer`, `chase:race-skip`; `chase:obstacle-spawn` dostaje pas i odległość; `chase:move` — tylko MG                              |
| widok     | `SceneVehicleView`: `speed` i `maxSpeed` (Ruch), `lane`, `raceBonus`, `moved`, `intent`; `ChaseSettings`: `lanes`, `role`, `anchorId`, `pursuitSpeed`, `race`; `moveSq` i `driftSq` znikają                                                        |
| `shared`  | rdzeń `chase-drive.ts` (pasy, krok ruchu, kadr, prognoza przeszkód — bez liczb CP RED); system `systems/cpred/chase-drive.ts` (kroki pedałów, mil/h, Wyścig i zryw, automat utraty kontroli, autopilot)                                            |
| usuwane   | `chase-budget.ts` (budżet metrów kierowcy), `driftChaseRound` (zastępuje go `startChaseRound`), `chaseDriftSquares`, `chaseMoveSquares`, Test zwykłej jazdy w `chase:move`, `MapArea.driverDragLimit`, pasek „Zderzenie”                           |

**Stare sceny pościgu** (także założone z wzorców przed etapem): przy starcie serwera auta
przyciągają się do najbliższego pasa (obok `reseatChasePassengers`), liczba pasów idzie z drogi
albo z szerokości jezdni, prędkości są zerowe do startu walki. Bez ręcznej migracji danych.

### 9. Styk z etapem 71 — Role (ustalenia z 15.11)

Etap 71 (weryfikacja Ról) od 15.11 **nie dotyka sceny pościgu**; to, co w nim dotyczyło jazdy,
przejmuje ten etap (`etap-71-weryfikacja-rol.md`, „Styk z etapem 72”):

- **Moto w rzutach jazdy (NOM-01, NOM-02).** Wyścig i Manewry rzuca się planerem z karty
  (`rollServerSkillTest`), więc Moto Nomady dolicza się samo — nowy rzut Wyścigu nie może liczyć
  sumy ręką. Test serwera w 72c i asercja E2E w `t72-*` z kierowcą-Nomadą.
- **Próg „słabego kierowcy” liczy Moto (NOM-03, decyzja MG 15.11):** REF + Umiejętność
  prowadzenia + Moto ≤ 9. Nowy model czyta próg już z Moto (72a), stara ścieżka `chase:move`
  zostaje bez zmian do usunięcia w 72c; test charakteryzujący `role-matrix.test.ts` „NOM-03”
  przepisać, wiersz macierzy na ✅, wpis w `decyzje-i-uproszczenia.md`.
- **Rozegranie 72g z Nomadą za kierownicą** zastępuje pościgową część scenki Nomady z etapu 71:
  ocena w tych samych trzech punktach (czy gracz znajdzie, czy rozumie kartę na czacie, ile
  kliknięć).
- **Wsparcie Stróża Prawa autem w pościgu (STR-12) — po tym etapie, osobna pozycja**, nie zakres
  72: grupa jako posiłki panelu „Pościg” z zamiarem „Goń”. Funkcjonariusz-kierowca
  rzuca Wyścig czystym 1k10 i nie podlega regule słabego kierowcy (punkt 3). Panel i posiłki z 72f mają tylko nie
  zakładać, że posiłki to wyłącznie auta z rezerwy sceny.

## Podział na podetapy

Każdy podetap to jedna sesja; po każdym aplikacja działa i testy przechodzą.

### 72a — rdzeń modelu w `shared` (✅ 19.11)

- [x] `shared/chase-drive.ts`: pasy (`chaseLaneCentre`, `chaseLaneOf`, `chaseLaneSpanPx`,
      `chaseLaneTarget`, `chaseSnapToLane`, liczba pasów z drogi — `chaseDefaultLanes`,
      `chaseLanesForWidth`), krok ruchu (`chaseDriveStep`: pas + przesunięcie wzdłuż → odcinek
      do `chaseFirstContact`), kadr (`chaseAnchorShift`, `CHASE_ANCHOR_FRACTION`, `ChaseRole`
      `pursue` / `flee`, wybór auta kadru `chaseAnchorVehicle`), prognoza przeszkody
      (`chaseObstacleEta` — odstęp, rundy, czy na pasie auta).
- [x] `systems/cpred/chase-drive.ts`: `cpredPedalSpeed` i `cpredPedalProblem` (gaz / hamulec /
      maksimum), `cpredSpeedMph` i `cpredMphToSpeed`, `cpredStartSpeed`, `cpredDriveAdvance`
      (różnica prędkości + zryw + Nitro), `cpredRoadSquaresPerRound`, `cpredRaceRollers`
      i `cpredRaceBonuses` (zryw z wyników, sufit 5, słaby kierowca), `cpredLostControlMove`
      (−10 Ruchu, 1k6 → pas), `cpredCanSlowBehind` i `cpredSlowBehindSpeed`.
- [x] Próg „słabego kierowcy” w nowym modelu liczy Moto (NOM-03, punkt 9): `cpredWeakDriver`
      i `cpredSheetWeakDriver` (te same liczby co planer rzutu — test spójności). Wiersz macierzy
      i `role-matrix.test.ts` „NOM-03” zostają do 72c, gdy próg zacznie działać na serwerze.
- [x] `CHASE_ROADS[].lanes` sprawdzone ze skryptami grafiki — **korekta planu (MG 19.11):**
      Autostrada i Badlands miały pasy namalowane węziej niż jezdnia (0,5–0,7 m rozjazdu), a MG
      uznał, że jedyną wartościową grafiką jest Neonowa ulica. Cztery drogi (Autostrada, Ulica
      2+2, Estakada, Badlands) usunięte z `CHASE_ROADS`, z `public/art/roads/` i razem ze
      skryptem `tools/art/chase-roads.py`; zostaje Neonowa ulica, 3 pasy po 4 m (jezdnia 6–18).
      Jedyna scena na usuniętej drodze w `dev.db` (stare „Ostatni zjazd” na Estakadzie w kampanii
      „Oględziny 12.09 — do usunięcia”) skasowana na słowo MG; na VPS nie sprawdzano.
- [x] mil/h = Ruch × 5 sprawdzone na katalogu z `data/private`: lądowe i latające ×5 co do mili
      (katalog niesie km/h: Ruch 20 = 161 km/h). **Polskie wydanie podaje km/h — MG 19.11
      zostaje przy milach** (decyzja 5). Łodzie się nie zgadzają (skuter i motorówka Ruch 20 =
      97 km/h, łódź kabinowa Ruch 10 = 24 km/h) — **MG 19.11: jedna skala ×5 dla wszystkiego**.
- [x] Testy `shared` do każdej funkcji (deterministyczny RNG). Zachowanie aplikacji bez zmian
      poza kreatorem (jedna wbudowana droga).

Rozstrzygnięcia z sesji 72a (do potwierdzenia przy rozegraniu 72g):

- **Słaby kierowca w Wyścigu zdaje, gdy wynik przewyższa PT 10** (`total > PT`, jak każdy Test
  w VTT i dzisiejszy Test zwykłej jazdy) — w punkcie 3 stało „poniżej 10”.
- **Słaby kierowca, który stracił kontrolę, nie dostaje zrywu**, ale jego wynik dalej jest
  „najniższym” dla reszty — przegrał wyścig.
- **Jedno auto z kierowcą w kadrze (MG 19.11):** Wyścigu nie ma, ale słaby kierowca z pełną kartą
  rzuca na początku rundy sam — ten sam rzut kubkiem, bez zrywu, jako Test zwykłej jazdy
  (`cpredRaceRollers`). Reguła s. 192 działa więc i w samotnym aucie.
- **„Zwolnij za nim” liczy różnicę od prędkości z początku tury** (sprzed pedału); auto przyjmuje
  prędkość blokującego, najwyżej swój Ruch.
- **Prognoza przeszkody** liczy rundy z prędkości auta po drodze (`prędkość / 4` na rundę —
  przeszkoda stoi na drodze, kadr jedzie z prędkością pościgu); auto stojące „nie dojedzie”.
- **Auto kadru bez kierowcy:** gdy auto drużyny nie ma kierowcy, kadr i tak trzyma się go (stoi
  auto drużyny — stoi droga); wrak obcego auta kadru nie trzyma.

### 72b — serwer nowej jazdy i surowy kokpit

**Podział (MG 19.11):** 72b okazał się za duży na jedną sesję — **72b1** serwer, **72b2** klient.

#### 72b1 — serwer nowej jazdy (✅ 19.11)

- [x] Migracja Prisma `20261119200000_chase_speed_lanes` (kolumny z punktu 8; `momentum` → `speed`,
      `driftRound` → `movedRound`, do tego `Scene.chasePursuitSpeed` — `null` poza walką —
      i `Scene.chaseShiftSq` dla bieżni), przyciągnięcie starych scen do pasów przy starcie
      (`snapChaseVehiclesToLanes`).
- [x] `vehicle:drive` (`realtime/chase-drive.ts`): pedał + pas + wybór przy zderzeniu, Akcja Ruchu
      tylko za pedał albo pas, zderzenie wraca pytaniem przed wydatkiem; MG prowadzi tak auto
      NPC-a w turze jego kierowcy (decyzja MG 19.11 — kokpit MG już teraz).
- [x] Ruch automatyczny na koniec tury kierowcy bez „Jedź” (`chaseTurnEnd`): zwolnij, a gdy hamulec
      nie wystarcza — taran (decyzja MG 19.11).
- [x] `startChaseRound` w `advanceTurn` (od rundy 1): prędkość pościgu, sztywne przesunięcie kadru,
      przeszkody, auta bez tury (od rundy 2), odpadanie; zryw na razie zerowy.
- [x] Automat utraty kontroli (Manewr, odpowiedź na przeszkodę, Test zwykłej jazdy); „Zwolnij za
      nim”; cofające się auto staje przed autem z tyłu, wybór ma tamten (decyzja MG 19.11);
      `chase:move` gracza w walce odmawia `USE_COCKPIT`; Nagłe zatrzymanie zbija prędkość do 0.
- [x] Widok `SceneVehicleView` / `ChaseSettings`, macierz `campaign-isolation.test.ts`.
- [x] Testy serwera: nowy `chase-drive.test.ts` (z `chase-driving.test.ts`), przepisane
      `chase-review`, `chase-obstacles`, `chase-ram`, dopisane w `chase.test.ts` i `chase-combat`.
- [x] `decyzje-i-uproszczenia.md` (nowa zasada jazdy, wpis 65c oznaczony), umowy `mapa` i `tura`,
      pułapki `mapa` i `tura`.
- [x] **Poza planem, żeby aplikacja działała między sesjami:** tymczasowy kokpit w menu auta
      (`VehicleDriveControls`: Gaz, Hamulec, Pas wyżej / niżej, „Jedź”, pytanie o zderzenie
      paskiem) i bieżnia w walce z prędkością pościgu.

Rozstrzygnięcia z sesji 72b1 (do potwierdzenia przy rozegraniu 72g):

- **Pierwsza runda** ustawia prędkości startowe i przesuwa kadr, ale auta bez tury jeszcze nie
  jadą (szyk ustawił MG, jak „od rundy 2” w 65c).
- **Auto, które wyjechało za krawędź w swojej turze, odpada dopiero na początku rundy**, po
  sztywnym przesunięciu — kamera jedzie za autem kadru, więc liczy się kadr z tej chwili.
- **Piesi na jezdni nie biorą udziału w sztywnym przesunięciu** (jak dotąd stoją w kadrze).
- **Nitro tylko przed „Jedź”** (`NITRO_AFTER_DRIVE`) — dokłada `Ruch / 4` do ruchu tej tury.
- **Słaby kierowca (do 72c) rzuca Test zwykłej jazdy przy każdym „Jedź”**, także jazdy prosto; kto
  nie wciśnie „Jedź”, nie rzuca — Wyścig to naprawi.
- **„Drużyna goni / ucieka” nie ma jeszcze przełącznika w UI** (72f); domyślne „goni” stawia auto
  drużyny na 30% od tyłu, więc scena z autem drużyny na czele potrzebuje `chaseRole: 'flee'`
  w bazie (testy tak robią).

#### 72b2 — surowa grupa „Pojazd” i bieżnia (✅ 20.11)

- [x] Klient: surowa grupa „Pojazd” w lewej belce (`HudVehicle.tsx`: kafel auta, wiersz „Po
      ruchu”, krzyżak, „Jedź”) z gotowych kafli belki — zastąpiła tymczasowe pozycje w menu auta;
      Nitro, Manewry i kolczatka jeszcze z menu (klik w kafel auta je otwiera).
- [x] Bieżnia dogania sztywne przesunięcie (`ChaseSettings.shiftSq`, `ChaseLayer.followFrameShift`),
      a nie tylko przewija się z prędkością pościgu.
- [x] E2E `48-poscig` dostosowane (`t65-przeszkody` — barykada dojeżdża rundę później, beton
      porównany z bieżącym miejscem auta; nowy `t72b-kokpit`), oględziny w Firefoksie.

Decyzje MG z 20.11 (pytania na starcie sesji):

- **Droga przeskakuje o przesunięcie kadru razem z autami** (cięcie kamery), a nie dojeżdża płynnie
  — auta też przeskakują; płynny najazd całej sceny razem z animacją ruchu w 72d.
- **Na kafelku auta stoi grafika modelu** (obrócona przodem w kierunku jazdy), nie sylwetka-ikona.

Rozstrzygnięcia bez pytań:

- **MG widzi grupę przy każdym zaznaczonym kierowcy** (serwer przyjmuje `vehicle:drive` od MG
  w turze każdego kierowcy, także gracza — darmowa ręka MG); przy NPC-u w jego turze to kokpit MG.
- **Odmowa nie wyłącza kafla** (jak broń i akcje belki): wyszarzony, powód w dymku i po kliknięciu
  w kanale komunikatów. Jeden powód dla całego krzyżaka — cudza tura, ruch wykonany, silnik,
  utrata kontroli; osobno maksimum gazu, postój przy hamulcu i krawędź jezdni.
- **Przy jeździe pionowej** gaz i hamulec stoją nad i pod, a pasy to „Pas w lewo / w prawo” (droga
  pionowa jest poza zakresem, ale krzyżak się nie rozsypuje).

### 72c — Wyścig

- [ ] Stan Wyścigu rundy, rzut serwera za NPC-ów, wezwanie na kubek kierowcy-gracza
      (ze Szczęściem), runda czeka; „Rzuć za gracza” i „Pomiń Wyścig” u MG.
- [ ] Zryw doliczany do ruchu; słaby kierowca traci kontrolę przy wyniku poniżej 10; stary Test
      zwykłej jazdy usunięty.
- [ ] Karta czatu „Wyścig — runda N” (grupa kart, umowa `czat`), pasek „czekam na…”.
- [ ] Kierowca bez karty: sama Cecha + 1k10 (funkcjonariusz Wsparcia — czyste 1k10), bez
      utraty kontroli z reguły słabego kierowcy; test serwera na statystę i profil Wsparcia.
- [ ] Testy serwera (`chase-race.test.ts`), E2E ze skryptem kości (`VTT_DICE_SCRIPT`).
- [ ] Moto Nomady w Wyścigu i w progu słabego kierowcy: test serwera, `role-matrix.test.ts`
      „NOM-03” przepisany, wiersze NOM-02 / NOM-03 w `role-macierz.md` (punkt 9).

### 72d — kokpit w pełnym kształcie (wariant B)

- [ ] Grupa „Pojazd” wg punktu 5: wiersz „Po ruchu”, ikony Nitro / Manewr (szuflada) /
      Kolczatka / Silnik, dymki `HudTip`, powody odmowy, decyzje kierowcy w belce.
- [ ] Mapa: duch auta, podświetlony pas, miarka do celu, prędkość przy autach, „N m · za N tur”
      przy przeszkodach, animacja ruchu.
- [ ] Usunięte: przeciąganie auta przez gracza, licznik metrów, pasek „Zderzenie”.
- [ ] Oględziny: Firefox i Chromium, dzień i noc, 900 px wysokości (czy grupa mieści się bez
      przewijania), porównanie z belką pieszej figury obok.

### 72e — auta NPC-ów

- [ ] `cpredChaseAutopilot` (`shared`, testy każdego zamiaru), `chase:intent`, ruch autopilota
      na początku tury NPC-a, hamulec sceny.
- [ ] Zamiar w menu auta MG; kokpit MG w belce zaznaczonego kierowcy-NPC-a.
- [ ] Testy serwera, E2E (auto z zamiarem „Goń” dogania, „Uciekaj” przyspiesza do maksimum).

### 72f — panel „Pościg”, plan rund, kreator

- [ ] Okno „Pościg” (auta, przeszkody na pas i odległość, posiłki, kadr, rola, autopilot).
- [ ] Plan rund: edycja, pytanie w panelu decyzji MG na początku rundy, wykonanie zdarzenia.
- [ ] Kreator i zakładka „Pościg”: liczba pasów z liniami na mapie, prędkość startowa w mil/h,
      goni / ucieka, zamiar przy aucie, krok „Plan”.
- [ ] Format wzorca (`chase.lanes`, `chase.role`, `chase.plan`, `vehicles[].intent`), paczki
      i kopie (`kopie`), testy `shared` i serwera, E2E `t65-kreator` dostosowany.

### 72g — wzorce, rozegranie, zamknięcie

> **MG 19.11:** dziś żadna scena pościgu nie jest dobrze zrobiona, a obie obecne („Ostatni zjazd”,
> „Zastaw”) wkrótce się zmienią — zostanie z nich tylko grafika drogi (Neonowa ulica). Zakres
> 72g ustalić z MG na starcie sesji, zanim przepisze się wzorce.

- [ ] „Ostatni zjazd” i „Zastaw” przepisane: pasy, prędkości startowe, zamiary, plan rund
      z notatek ⚠️ (kolczatka, posiłki, roboty drogowe, barykada), notatki MG pod nowe UI.
- [ ] Rozegranie obu wzorców w przeglądarce (MG + gracze w dwóch silnikach), wnioski z balansu
      do decyzji MG: skala zrywu, kroki gazu i hamulca, automat utraty kontroli.
- [ ] W jednym z rozegrań kierowcą drużyny jest **Nomada z Moto** (zastępuje pościgową część
      scenki Nomady z etapu 71, punkt 9).
- [ ] Stały E2E `48-poscig/t72-*` (jazda, Wyścig, przeszkoda z prognozą, autopilot, plan rund;
      kierowca-Nomada — Moto w Wyścigu i Manewrze, NOM-02).
- [ ] Sprzątanie starego kodu i wpisów (`umowy-kodu.md`, `pulapki-dev.md`, `zaleglosci.md`).

## Kryteria ukończenia

- [ ] Kierowca-gracz prowadzi wyłącznie z grupy „Pojazd” w lewej belce: gaz, hamulec, zmiana
      pasa i „Jedź”; prędkość widzi w mil/h; belka wygląda jak reszta HUD z etapu 69.
- [ ] Auto rusza się tylko w turze swojego kierowcy; prędkość trwa między turami; nic nie
      „wraca samo”.
- [ ] Na początku rundy kierowcy rzucają Wyścig (gracz kubkiem), a zryw zmienia dystans.
- [ ] Nitro, Manewry, kolczatka i silnik są w belce; zderzenie i przeszkoda pytają w belce.
- [ ] Auto NPC-a z zamiarem jedzie samo, a MG może przejąć je kokpitem i wyłączyć autopilota.
- [ ] MG prowadzi pościg z panelu „Pościg”: widzi prędkości, pasy i dystanse, wypuszcza
      przeszkodę na pas w odległości, a plan rund pyta go o zdarzenia.
- [ ] Kreator nie pyta o tempo; pyta o pasy, prędkość startową i rolę drużyny.
- [ ] „Ostatni zjazd” i „Zastaw” rozegrane w nowym modelu, balans zatwierdzony przez MG.
- [ ] Testy `shared`, serwera i klienta, E2E `48-poscig`, oględziny w Firefoksie i Chromium.
- [ ] Oględziny MG przy stole.

## Rozstrzygnięcia projektu bez pytań (do potwierdzenia w trakcie)

1. **Auto rusza się w turze kierowcy, nie wszystkie naraz na początku rundy** — inaczej wraca
   „auto przesuwa się samo”, które dziś myli graczy. Kolejność inicjatywy ma przez to znaczenie
   (kto jedzie później, widzi ruch poprzedników), jak w zwykłej walce.
2. **Prędkość pościgu jest stała w rundzie i bierze się z auta kadru** — dzięki temu gaz daje
   skutek na własnym aucie od razu, a nie dopiero w turach przeciwników.
3. **Sztywne przesunięcie kadru co rundę** zamiast nieskończonej drogi z prawdziwymi pozycjami:
   scena ma stały rozmiar, a rdzeń (granice sceny, figury z prawdziwymi `x`, `y`) zostaje
   nietknięty.
4. **Kroki +10 / −20 Ruchu dla każdego pojazdu** — bez osobnych przyspieszeń na model; motocykl
   i furgon różnią się maksimum.
5. **Zryw:** 1 kratka za każde 2 punkty przewagi nad najsłabszym wynikiem, sufit 5.
6. **Automat utraty kontroli (1k6 na pas, −50 mil/h)** jest nową zasadą domową w miejsce „MG
   wyznacza ruch”.
7. **„Zwolnij za nim” bez Testu**, gdy mieści się w zwykłym hamulcu.
8. **Poza walką kokpit nie działa** — szyk przed pościgiem ustawia MG.
9. **Pasażerowie nie dostają własnej grupy „Pojazd”**; prędkość aut widzą na mapie.
10. **Szczęście w Wyścigu** działa jak w każdym rzucie z kubka; NPC-e go nie mają.
11. **Niższy portret na czas jazdy** — alternatywą jest przewijana belka.

## Poza zakresem

- Rozstawienie aut i rozsadzanie figur w fotelach (MG nie wskazał jako bólu); sadzanie drużyny
  z kroku „Auta” zostaje w `POMYSLY.md`.
- Kadr gracza (decyzja MG z 06.11: bez zmian).
- Jazda na żywo, klawiatura, pionowe drogi, obracanie mapy pod kierowcę.
- Prowadzenie auta przez bota-towarzysza.
- Pościgi piesze, wodne i powietrzne jako osobne modele (łódź jedzie jak auto, lot — Manewrem).
