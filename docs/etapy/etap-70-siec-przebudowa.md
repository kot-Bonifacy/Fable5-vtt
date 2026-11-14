# Etap 70 — Przebudowa netrunningu: okno jednego piętra i przejęte urządzenia na mapie

**Faza:** przed betą (zlecenie MG z 11.11 spoza planu) · **Wymaga etapów:** 26a–26f (Sieć),
51 i 58 (strefy), 62 (Sieć ze sceny), 69 (lewa belka) · **Status:** 🟨 realizacja w sześciu
sesjach (70a–70f); 70a ✅ 12.11, 70b ✅ 13.11, 70c ✅ 13.11, 70d ✅ 13.11, 70e ✅ 13.11,
70f ✅ 14.11 — całość czeka na wdrożenie i stół MG

## Skąd ten etap

MG (11.11): „Trzeba przebudować obecne UI hakowania (okno »SIEĆ«), aby było bardziej przejrzyste,
pokazywało tylko aktualne piętro, nie zdradzało informacji, ile tych pięter jest, mechaniki były
bardziej przemyślane; dodać możliwość realnego kontrolowania elementów mapy dodawanych do niej
w edycji mapy, takich jak strefy bronione (w tym kontrola nad dronami, podgląd przez kamery
odległych miejsc mapy); zaprojektować do tego testy, w tym E2E w przeglądarce. Obecne rozwiązania
są mało funkcjonalne i mało grywalne.” Luźny pomysł MG: zastąpić część stref tokenami, którymi
steruje gracz i które mają okrojone mechaniki w porównaniu z figurami graczy.

Ten plik jest **projektem**, nie zapisem wykonania. Zamyka też zaległość z 07.11 „projekt do
decyzji MG: przejęte urządzenie jako figura netrunnera” oraz daje projekt okienka do zaległości
🔴 „klik gracza w zauważoną strefę to marsz na nią bez pytania” (66e, pkt 3).

## Co dziś nie gra (z kodu i z rozegrań 66b / 66e)

| nr  | problem                                                                                                                                                                                                                                                                          | gdzie                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1   | **Rozmiar Sieci wycieka.** `netRunView` wysyła graczowi wszystkie odnogi i wszystkie piętra — nieodkryte jako `kind: null`, ale z `id`, `depth` i miejscem w odnodze. Okno rysuje cały szyb z „?”. To łamie zasadę „dane niewidoczne dla gracza nie opuszczają serwera”.         | `shared/systems/cpred/netrun.ts`, `NetRunWindow.tsx`            |
| 2   | **Ruch jest wyrocznią.** `netrun:move` na dowolną pozycję odpowiada inaczej dla piętra, które istnieje, i dla nieistniejącego — da się wymacać głębokość.                                                                                                                        | `netCanMove`, `realtime/netrun.ts`                              |
| 3   | **Lista wszystkich urządzeń od podłączenia** (etap 62) zdradza skalę obrony — w „Fabryce dronów” 19 nazw naraz.                                                                                                                                                                  | `sightedDevicesOf` w `netrun-io.ts`                             |
| 4   | **Okno jest ścianą sekcji.** 560 px szerokości, szyb w kolumnach, lista urządzeń, LOD-y, Demony, dek, sześć przycisków zdolności (zwykle wyszarzonych), formularz Wirusa. Zasłania kubek i lewą belkę (66e, pkt 18), szyb potrafił zgnieść się do zera (pułapka `siec` z 02.11). | `NetRunWindow.tsx` (1325 wierszy), `17-net.css`                 |
| 5   | **Sterowanie urządzeniem z listy.** Cel strzału z rozwijanej listy (bez mapy, linii strzału, zasięgu i podglądu osłony), bez trybu ognia (seria tylko ręką MG), osłona jako płatne pytanie po fakcie, kierunek kamery z listy ośmiu stron świata.                                | `NodeDevices` w `NetRunWindow.tsx`, `realtime/netdevices.ts`    |
| 6   | **Przejęta wieżyczka dalej jest wrogiem na stole:** zostaje w kolejce inicjatywy, po odłączeniu wraca do obrony bez znaku na mapie, wyłączony dron wygląda jak włączony.                                                                                                         | 66e „Balans i przejęcie wieżyczki”, `POMYSLY.md` (31.10)        |
| 7   | **Dwa modele tego samego.** Dron i wieżyczka to raz figura z ikoną urządzenia (62), raz prostokątna strefa „aktywny system / stanowisko” z opcjonalnie przypiętą figurą (26f, 51). Strefę z węzłem wiąże się ręcznie polem na karcie strefy (#33).                               | `MapTools.tsx`, `SceneCardZone.tsx`, `zones.ts`                 |
| 8   | **Dron nie jeździ i nie patrzy.** Urządzenie ma tylko `on / off / turn / open / close / fire`; wzrok pożycza wyłącznie kamera.                                                                                                                                                   | `shared/systems/cpred/netdevices.ts`, `realtime/net-cameras.ts` |
| 9   | **Obrona Sieci stoi, dopóki MG nie kliknie.** LOD i Demon nie wykrywają i nie grają tury bez przycisku MG (decyzja z 15.08) — łatwo o tym zapomnieć w środku walki fizycznej.                                                                                                    | `realtime/netcombat.ts`, `realtime/netdemons.ts`                |
| 10  | **Sieć ze sceny to jeden węzeł na wszystko**, a węzeł działa raz na Turę — cała scena daje jedną czynność na rundę.                                                                                                                                                              | `shared/systems/cpred/netscene.ts`                              |
| 11  | Drobiazgi z 66e: podwójne wiersze czatu u netrunnera (pkt 23), jasnoniebieskie podpisy na beżu (pkt 24).                                                                                                                                                                         | `logNetLineWithSecret`, `17-net.css`                            |

## Decyzje MG z 11.11 (pytania na starcie)

1. **Ekonomia przejętego urządzenia:** węzeł dalej działa **raz na Turę** (s. 199), ale jedna Akcja
   Sieciowa daje wybranemu urządzeniu **pełną turę** — ruch i jedną czynność (np. strzał
   z wybranym trybem ognia). Siłę netrunnera MG ustawia liczbą węzłów.
2. **Lista urządzeń dopiero na piętrze węzła** (nazwa i rodzaj), władzę daje Kontrola. Od
   podłączenia okno nie mówi nic o urządzeniach. Cofa decyzję nr 4 z 28.10 (etap 62).
3. **Strefy środowiskowe: tylko „Wyłącz / Włącz”** — bez ręcznego odpalania i bez przepustek;
   zmienia się wyłącznie wygoda obsługi (klik w strefę na mapie).
4. **Czarny LOD i Demon: automat z hamulcem MG.** Wykrycie i tura dzieją się same; MG ma
   przełącznik „wstrzymaj obronę Sieci”, ręczne przyciski zostają. Cofa decyzję z 15.08.
5. **Sieć ze sceny składa węzły wg rodzaju:** „Monitoring”, „Obrona”, „Instalacje”. Zmienia
   decyzję nr 2 z 28.10 (jeden węzeł ze wszystkim).
6. **Podgląd: mapa + pasek „oczu”.** Stożek dalej odsłania mapę; w oknie SIEĆ dochodzi pasek
   miniatur przejętych urządzeń z kadrem tam i z powrotem. Obraz w obrazie — nie.
7. **Przejęte urządzenie strzela własną Wartością bojową**, nie Umiejętnością netrunnera.
   Odstępstwo od s. 213.
8. **Edycja mapy: figura z obszarem straży.** Kamera, wieżyczka i dron to zawsze figura
   urządzenia, której MG może dorysować prostokąt straży; narzędzie „Strefa” zostaje dla systemów
   środowiskowych. Istniejące strefy działają dalej, bez migracji danych.

## Projekt

### A. Okno SIEĆ — jedno piętro

**Zasada:** gracz dostaje z serwera tylko to, na czym stoi, drogę, którą przyszedł, i wyjścia
z bieżącego piętra. Reszta szybu nie istnieje w jego ładunku. MG dalej widzi cały szyb.

**Makieta okna gracza** (ok. 360 px zamiast 560; kolejność sekcji stała, puste sekcje nie
istnieją):

```
┌ SIEĆ · Iskra ─────────────────────── [Odłącz się] ┐
│ Akcje Sieciowe ●●○          Interfejs 6           │  belka stanu: ile zostało w tej Turze
│ ▸ ◇ › 🔒 › 🗎 › ⚙                                 │  ślad: odwiedzone piętra, klik = powrót
│ ┌───────────────────────────────────────────────┐ │
│ │ ⚙  WĘZEŁ KONTROLNY · głębokość 4      PT 8    │ │  karta bieżącego piętra
│ │ Kontrola daje władzę nad urządzeniami.        │ │  jedno zdanie „co dalej”
│ │ Kamera nad barem · Kamera zaplecza · Sensor   │ │  urządzenia węzła: nazwa i rodzaj
│ │ [ Kontrola ]   [ Zwiad ]   [ Maskowanie ]     │ │  tylko zdolności, które tu mają sens
│ └───────────────────────────────────────────────┘ │
│ [ ▲ Wyżej ]   [ ▼ Niżej: ? ]   [ ▼ Odnoga: ☠ ]    │  wyjścia z tego piętra
│ ─ Zagrożenia ───────────────────────────────────  │  LOD / Demon, tylko gdy są
│ ☠ Kruk  REZ ▮▮▮▮▯ 12/15   [Miecz ▾] [Atakuj] [Ślizg]│
│ ─ Oczy i urządzenia ────────────────────────────  │  pasek przejętych (sekcja C)
│ ◂ [◉ Kam. bar] [◉ Kam. zapl.] [▣ Wieżyczka] ▸  ⌂ │
│ ─ Cyberdek ▸ (zwinięty) ────────────────────────  │
└───────────────────────────────────────────────────┘
```

**Co okno pokazuje, a czego nie:**

- **Karta piętra** — rodzaj, etykieta, PT (jak dziś: po wejściu), stany (złamane, rozpoznany,
  kopia na deku, przejęty, próba zużyta) i jedno zdanie „co dalej” (dzisiejszy `floorHint`).
- **Zdolności w karcie piętra** — przyciski tylko tych, które mają tu zastosowanie: Backdoor na
  haśle, Ajdi i „Skopiuj Plik” na Pliku, Kontrola na węźle, Wirus na dnie; Zwiad i Maskowanie
  zawsze. Zużyta próba = przycisk wyszarzony z powodem (jak dziś). Koniec rzędu sześciu
  wyszarzonych przycisków i akapitu o Ślizgu i Pafie — te dwa stoją przy LOD-zie.
- **Wyjścia** — „Wyżej” (jeśli jest), a w dół jedno wyjście na każde piętro bezpośrednio pod
  spodem: nieznane „?”, po Zwiadzie z ikoną rodzaju. Rozwidlenie widać dopiero z piętra, z którego
  odchodzi. Hasło pod stopami blokuje wyjścia w dół (przycisk wyszarzony z powodem).
- **Ślad** — piętra, na których postać stała (ikona rodzaju i stan), w kolejności zejścia.
  Klik = powrót tam jednym ruchem (ruch jest darmowy, jak dziś). Odwiedzone odnogi rozwijają
  ślad w drzewko tylko z odwiedzonych pięter.
- **Głębokość** bieżącego piętra — tak; **liczba pięter, odnóg i „z ilu”** — nigdy.
- **Dno:** karta piętra bez wyjść w dół pisze „Dalej nie ma zejścia”. Przycisk Wirusa włącza
  flaga `virusAllowed` z serwera (dziś klient liczy dno z całego szybu).
- **Belka stanu** — kropki Akcji Sieciowych pozostałych w tej Turze (z budżetu tury, etap 69:
  kropka = Akcja), dług i Klej jak dziś. Punkt dostępu i „Piętro N” z dzisiejszej belki znikają
  (są w karcie piętra).

**Widok MG:** to samo okno plus zwijana kolumna „Plan Architektury” z całym szybem (dzisiejszy
`Branch` / `FloorRow` w trybie tylko do podglądu i skoku), nazwą Architektury, licznikiem prób
i „Oddaj próby”. MG nie traci nic z tego, co ma dziś.

**Ładunek gracza (`NetRunView` po zmianie):**

| pole                                          | treść                                                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `here: NetFloorView`                          | pełny widok bieżącego piętra (jak dzisiejszy `entered`), z `virusAllowed` i `depth`                          |
| `exits: { up: boolean; down: NetExitView[] }` | `NetExitView = { to, knowledge: 'unknown' \| 'scouted' \| 'entered', kind?, label?, branchName?, blocked? }` |
| `trail: NetTrailStep[]`                       | wyłącznie piętra z `entered`: pozycja, rodzaj, etykieta, flagi stanu                                         |
| `nodeDevices?: NetSightedDevice[]`            | urządzenia **bieżącego** węzła przed Kontrolą (nazwa stołu i rodzaj); po Kontroli pełne `devices`            |
| reszta                                        | `combat`, `demons`, `virus`, `viruses`, `spentAbilities`, `netActionsMax` — bez zmian                        |
| `shaft?: NetShaftBranchView[]`                | **tylko MG** — dzisiejsze `branches`                                                                         |

Pól `branches` i `sightedDevices` gracz nie dostaje wcale. Piętra ze Zwiadu to z definicji
dzieci piętra, z którego rzucano (decyzja z 10.11), więc mieszczą się w `exits`.

**Serwer — zamknięcie wyroczni:** `netrun:move` gracza przyjmuje tylko pozycję ze śladu albo
bezpośrednie wyjście z bieżącego piętra; każda inna dostaje `NET_NO_SUCH_FLOOR`, tę samą odmowę
co piętro nieistniejące (sprawdzane **przed** `netCanMove`, żeby hasło na trasie nie rozróżniało
przypadków). MG rusza netrunnerem bez tego ograniczenia. Tak samo `netrun:copy` i `netrun:device`
z `floorId` spoza `entered` — jedna odmowa, bez rozróżniania „nie ma” / „nie znasz”.

### B. Przejęte urządzenie jako figura na mapie

**Zasada:** Kontrola węzła nie otwiera listy przycisków, tylko **pożycza netrunnerowi figury**
urządzeń tego węzła. Gracz zaznacza je na mapie jak własną postać i używa lewej belki, celownika
i kubka — tych samych, co przy swojej figurze, ale z okrojonym zestawem czynności.

**Pożyczona kontrola (`BorrowedControl`)** — wzorem pożyczonego wzroku kamer (`BorrowedSight`):

- Nowy dostawca `realtime/net-control.ts` (`loadNetDeviceGrants`): dla każdego runu piętra
  z `controlled`, urządzenia z `tokenId`, włączone i nierozbrojone → `tokenId → { runId, floorId,
deviceId, kind, operatorIds }`. Uogólnia `loadNetCameraGrants` (kamera staje się jednym
  z rodzajów). Odcisk zmian i odświeżanie jak `refreshNetCameraSight` (`emitRuns`).
- **Uprawnienie to dalej węzeł, nie własność żetonu** (umowa 26d): `Token.ownerId` się nie
  zmienia. Ścieżki ruchu i ataku pytają jedną funkcję `operatorOf(token, user)`; odmowa dla
  każdego innego konta to zwykłe `FORBIDDEN`.
- **Widok figury operatora:** przejęta figura jedzie do netrunnera także wtedy, gdy jest ukryta
  (dziś dostaje jej `at`, więc miejsce i tak zna), z polem `operated: { runId, deviceId, kind,
verbs, used, moveLeftM }`. Pozostali gracze, którzy figurę widzą, dostają tylko znacznik
  „przejęta” (obwódka w kolorze netrunnera); MG — „przejęta: <postać>”.

**Czynności wg rodzaju** (czysta tabela w `shared/systems/cpred/netdevices.ts`, obok
`NET_DEVICE_OPERATIONS_BY_KIND`):

| rodzaj                           | ruch        | czynność (jedna na aktywację)                      | patrzy                |
| -------------------------------- | ----------- | -------------------------------------------------- | --------------------- |
| kamera                           | —           | Obróć (kierunek wskazany na mapie), Wyłącz / Włącz | stożek 90° (jak dziś) |
| wieżyczka                        | —           | Strzał (tryb ognia broni), Wyłącz / Włącz          | koło, zasięg figury   |
| dron, robot                      | RUCH figury | Strzał, Wyłącz / Włącz                             | koło, zasięg figury   |
| drzwi, terminal, czujnik, strefa | —           | Otwórz / Zamknij albo Wyłącz / Włącz               | —                     |

Czego przejęta figura **nie ma** (to są „okrojone mechaniki” z pomysłu MG): ekwipunku, wymiany
i łupu, Szczęścia, Skradania, Biegu, Uniku z wyboru, chwytów, przeładowania z plecaka (strzela
tym, co ma w magazynku), otwierania drzwi i pojemników, karty postaci w oknie. Nie odpala stref
(reguła z 07.11: strefę odpala tylko marsz figury gracza — kontroler żetonu się nie zmienia) i nie
zakłada walki z zauważenia.

**Aktywacja (decyzja 1):**

- Pierwsza czynność albo ruch urządzenia w Turze **aktywuje** je: 1 Akcja Sieciowa
  (`spendNetAction`) i znacznik użycia węzła w tej rundzie (`netMarkNodeUse`) — jak dziś.
- Aktywowane urządzenie dostaje budżet: metry RUCH-u (jeśli jeździ) i jedną czynność. Stan
  w runie: `deviceTurn: { floorId, deviceId, round, moveLeftM, actionLeft }`. Ruch i czynność
  w dowolnej kolejności; budżet gaśnie z końcem Tury netrunnera albo zmianą rundy.
- Inne urządzenie tego samego węzła w tej samej rundzie → `NET_NODE_USED` (bez zmian). Urządzenie
  innego trzymanego węzła — osobna aktywacja za kolejną Akcję Sieciową.
- Poza walką nie ma rund: aktywacja nic nie kosztuje i nie ma limitu, jak dziś (`round === null`).
- Patrzenie przez przejęte oczy jest darmowe (jak dziś). Zaznaczenie figury też.

**Lewa belka przejętej figury** (sloty z `shared`, etap 69): duży kafel broni z obrażeniami, SS
i szufladą trybów ognia (wieżyczka, dron); średni „Ruch” z metrami (dron); ikony „Obróć” (kamera)
i „Wyłącz / Włącz”. Znak kosztu na przyciskach: nowy rodzaj kosztu „Akcja Sieciowa” do czasu
aktywacji, potem kropka czynności i kreska metrów jak u postaci. Portret = ikona urządzenia,
zamiast PW postaci — PW urządzenia; pod spodem „przez: <węzeł>”. Bez stopki końca tury (turę
kończy netrunner swoją figurą).

**Strzał:** zwykła ścieżka ataku z mapy — klik w cel, okno Celowania z zasięgiem, PT i **pytaniem
o osłonę przed zapłatą**, kubek, karta ataku. Znika lista „Cel strzału”, `NET_SHOT_COVERED` jako
płatne pytanie i przycisk „Strzelaj mimo osłony”; zwrot Akcji Sieciowej przy odmowie przed rzutem
zostaje (decyzja z 07.11). **Rzut na trafienie Wartością bojową urządzenia** (decyzja 7),
w kolejności źródeł: wpis systemu obronnego obszaru straży / strefy (`entry.combatValue`) →
Wartość bojowa statysty figury → figura z pełną kartą NPC-a strzela własną Umiejętnością broni
z karty → brak którejkolwiek: odmowa `NET_DEVICE_NO_COMBAT_VALUE` z podpowiedzią dla MG.
`fireDevice` ma już `hands.combatValue` (strzał Demona). Obrażenia rzuca operator (umowa #38).

**Ruch drona:** `token:walk` z planerem, budżet z `deviceTurn`. Planer i drzwi liczą się z oczu
**tej figury** (jej wzrok jest dla jej marszu „własny”), nie z oczu netrunnera.

**Kamera:** „Obróć” = klik w punkt mapy, na który ma patrzeć (dowolny kąt, serwer zapisuje
`Token.facing`); lista ośmiu kierunków znika. Kamera bez figury zostaje przełącznikiem `turned`
obsługiwanym z paska urządzeń.

**Pożyczony wzrok:** oprócz kamery patrzą wieżyczka i dron — koło na `visionRange` figury.
Reguły pożyczonych oczu bez zmian: tylko pokazują, widzą w ciemności na swój zasięg (decyzja
z 07.11), nie otwierają drzwi netrunnerowi, nie zasilają pamięci mapy, nie zakładają walki.
Nowi dostawcy stają obok `loadNetCameraSights`, nie w `viewerSightFor` (umowa z 20.10).

**Kolejka inicjatywy:** figura przejęta zostaje w kolejce, ale jej własna tura jest pomijana
(chip z plakietką „przejęta”), a jej obszar straży nie strzela sam. Po utracie kontroli wraca na
swoje miejsce w kolejności.

**Koniec kontroli:** odłączenie (każde), odebranie węzła przez Demona albo rywala, zniszczenie
figury, „Wyłącz”. Serwer zdejmuje `operated`, klient gubi zaznaczenie i wraca belką do postaci,
czat dostaje wiersz „<urządzenie> wraca do obrony”. Pamięć sukcesów z 02.11 działa dalej: po
ponownym podłączeniu trzymane węzły wracają, a z nimi figury.

**Urządzenie wyłączone** dostaje na mapie naklejkę „Wyłączony” (szary krążek; bez tury, bez
strzału z obszaru straży, bez Percepcji w drodze), zdejmowaną przy „Włącz” — pomysł z 31.10
(`POMYSLY.md`). Wie o niej każdy, kto figurę widzi.

### C. Pasek „Oczy i urządzenia”

Sekcja okna SIEĆ, która zastępuje dzisiejszą listę `NodeDevices` w wierszu piętra:

- Jedna miniatura na przejęte urządzenie **wszystkich** trzymanych węzłów (ikona rodzaju, nazwa,
  kropka stanu: aktywne w tej Turze / węzeł zużyty / wyłączone), pogrupowane węzłami.
- Klik = zaznacz figurę i przenieś kadr (`showNetDevice`); „⌂” wraca kadrem i zaznaczeniem do
  netrunnera; „◂ ▸” przechodzą po kolejnych oczach. Drzwi, terminal i strefa (bez figury albo bez
  belki) mają na miniaturze swój jeden przełącznik.
- Te same figury stoją u gracza w zakładce „Postacie” w sekcji „Przejęte” (pomysł MG z 07.11) —
  oba miejsca czytają jeden stan (`operated` na figurach), nie dwie listy.

### D. Edycja mapy i strefy

- **Urządzenie to figura.** Sekcja „Urządzenia” (figury z ikoną) jest jedynym miejscem stawiania
  kamery, wieżyczki i drona. Wybór wpisu kompendium („aktywny system obronny”, „stanowisko
  obronne”) wypełnia figurze liczby wpisu: PW, RUCH, Wartość bojową, broń.
- **Obszar straży.** Karta figury urządzenia dostaje sekcję „Obszar straży”: „Narysuj” (prostokąt
  na mapie), „Usuń”, PT zauważenia. Pod spodem to dzisiejszy wiersz `DefenseZone` z `tokenId`
  (przypięcie z etapu 51) — model danych i samodzielna obrona z 26f bez zmian, odwraca się tylko
  kierunek w UI: od figury do obszaru, nie od strefy do figury.
- **Narzędzie „Strefa”** proponuje już tylko systemy środowiskowe. Stara strefa drona albo
  stanowiska bez figury działa dalej; jej karta dostaje przycisk „Postaw figurę urządzenia”
  (zakłada figurę z wpisu i przypina ją).
- **Strefa i drzwi w Sieci bez ręcznego wiązania.** Strefa środowiskowa sceny jest urządzeniem
  Sieci tak jak figura z ikoną (62): trafia do węzła „Instalacje” przy podłączeniu. Pole „Węzeł
  kontrolny” na karcie strefy (#33) zostaje dla Architektur budowanych ręcznie. Drzwi i okna
  dostają na karcie otworu przełącznik „Sterowane z Sieci” (domyślnie wyłączony).
- **Okienko strefy u gracza** (zaległość 🔴 66e pkt 3): klik w zauważoną strefę nie zaczyna marszu,
  tylko otwiera przy kursorze małe okienko — nazwa, „Wejdź mimo to”, „Rozbrój” (gdy w zasięgu
  ręki; istniejące `zone:disarm`), a u netrunnera trzymającego jej węzeł „Wyłącz” / „Włącz”
  (aktywacja węzła, decyzja 3). Marsz klikiem **przez** zauważoną strefę do punktu za nią pyta
  tym samym okienkiem.

### E. Sieć ze sceny — węzły wg rodzaju

`netSceneArchitecture` składa: wejście → **„Monitoring”** (kamery, czujniki) → **„Obrona”**
(wieżyczki, drony, roboty) → **„Instalacje”** (terminale, strefy środowiskowe, drzwi „Sterowane
z Sieci”). Węzeł powstaje tylko wtedy, gdy ma choć jedno urządzenie; nadmiar ponad 6
(`NET_DEVICES_PER_NODE_MAX`) idzie do „Monitoring 2” itd. PT jak dziś (`standard` albo 8), bez
haseł i LOD-ów. `netAdoptSceneDevices` (dopinanie do Architektury MG) wybiera najpierw węzeł,
który już trzyma urządzenia tej samej grupy, potem pierwszy z miejscem. Grupę liczy jedna czysta
funkcja z rodzaju urządzenia i ikony (`netSceneGroupOf`).

Zapisane już Architektury „Sieć: <scena>” nie są przebudowywane — MG kasuje taką w bibliotece,
a następne podłączenie składa nową.

### F. Automat Czarnego LOD-u i Demona

- **Wykrycie LOD-u** rzuca serwer sam, gdy netrunner stanie na piętrze LOD-u (po `netrun:move`,
  Ślizgu i przy podłączeniu na takie piętro) — ten sam test sporny i ten sam skutek, co dziś pod
  przyciskiem MG (`netrun:ice:detect`): przegrana to darmowy atak i wejście LOD-u do kolejki.
- **Demon** zaczyna ścigać sam, gdy netrunner wejdzie na jego piętro **albo** przejmie węzeł
  kontrolny w jego Architekturze (Demon broni węzłów).
- **Tura** LOD-u i Demona w kolejce inicjatywy rozgrywa się sama (dzisiejsze `iceTakesTurn` /
  `demonTakesTurn`) po krótkiej pauzie na kości, potem wskaźnik tury idzie dalej.
- **Hamulec MG:** przełącznik „Obrona Sieci: działa sama / wstrzymana” w oknie runu MG
  (`CpredNetRuntime.defensePaused`, na Architekturę). Wstrzymana = zachowanie sprzed etapu;
  ręczne przyciski „wykrywa intruza” i „Tura LOD-a / Demona” zostają w obu trybach.
- Automat działa ręką systemu (`systemHand`, pierwsze konto MG — umowa #39 ze stref), nie konta
  gracza.

### G. Porządki przy okazji (bez wpływu na mechanikę)

- Netrunner dostaje jeden wiersz czatu na akcję Sieci (pełny, „poufne”), nie dwa (66e pkt 23).
- Kolory okna wyłącznie ze zmiennych motywu, kontrast podpisów sprawdzony w obu motywach (pkt 24);
  testy-strażnicy kolorów obejmują nowe klasy.
- Pierwsze położenie okna liczy się dla szerokości 360 px i omija kubek (pkt 18 przestaje boleć,
  choć nie był zaległością).
- Strzał serią z przejętej wieżyczki (zaległość 66e nr 3) wynika z szuflady trybów ognia.

## Podział na sesje

Każdy podetap to jedna sesja, kończy się zielonymi testami i oględzinami w Firefoksie.

| etap    | nazwa                                | wymaga | migracja bazy                     |
| ------- | ------------------------------------ | ------ | --------------------------------- |
| **70a** | Okno SIEĆ: jedno piętro              | —      | nie                               |
| **70b** | Przejęta wieżyczka i kamera na mapie | 70a    | nie (`deviceTurn` w JSON runu)    |
| **70c** | Dron w ruchu, oczy urządzeń, pasek   | 70b    | nie                               |
| **70d** | Edycja mapy, strefy, Sieć ze sceny   | 70b    | tak: `Wall.netControlled`         |
| **70e** | Automat LOD-u i Demona               | 70a    | nie (`defensePaused` w `runtime`) |
| **70f** | Wzorce 66b / 66e i rozegranie        | 70a–e  | nie                               |

### 70a — Okno SIEĆ: jedno piętro

- [x] `shared`: `netRunView` w dwóch krojach (gracz: `here` / `exits` / `trail` / `nodeDevices`;
      MG: dodatkowo `shaft`), `virusAllowed`, `netMoveAllowedFor` (ślad albo wyjście)
- [x] Serwer: odmowa ruchu, kopii i obsługi poza znanymi piętrami jednym kodem; `sightedDevicesOf`
      tylko dla bieżącego węzła; jeden wiersz czatu dla netrunnera
- [x] Klient: `NetRunWindow.tsx` pocięty na `NetFloorCard`, `NetExits`, `NetTrail`, `NetThreats`,
      `NetDeckSection`, `NetGmShaft`; `17-net.css` na zmiennych motywu; pierwsze położenie
- [x] Testy: `netrun.test.ts` (shared), `netrun.test.ts` (serwer), E2E `t70a-okno-pietro`;
      poprawione T5a (5.3), T5b, `t62-siec-sceny` (`t8c-zdolnosci` nie dotyka okna Sieci — bez zmian)

**Kryteria ukończenia:** ładunek gracza po podłączeniu do Architektury 8 pięter z odnogą nie
zawiera `id`, etykiety ani liczby żadnego piętra poza bieżącym i jego wyjściami (test serwera
i podsłuch E2E); okno gracza mieści się w 360 px i nie zasłania kubka przy 1920 × 1080; każda
zdolność z 26b–26e da się wykonać z nowego okna; MG widzi cały szyb.

**Zrobione 11–12.11.2026. Odstępstwa od projektu:**

- **`exits.up` to pozycja rodzica, nie `boolean`** — przycisk „Wyżej” musi wiedzieć, dokąd jedzie,
  a klient nie ma szybu, żeby to policzyć (z pierwszego piętra odnogi „wyżej” to piętro trzonu).
- **Ślad niesie `devices` przejętych węzłów** i okno ma sekcję „Przejęte węzły” (obsługa bez
  wracania na piętro). To pomost do 70c — zniknie razem z listą, gdy urządzenia przejdą na mapę
  i pasek „oczu”. Strzał z listy z pytaniem o osłonę po odmowie zostaje do 70b.
- **Test wycieku w `shared` chodzi po własnych losowych szybach z ziarnem**, nie po
  `generateNetArchitecture` — generator bierze Programy z kompendium, którego test nie ma.
- **E2E `t70a`: odnoga jest bez LOD-u** (Architektura 8 pięter: 6 trzonu + odnoga z dwóch).
  Programy wymagają prywatnego kompendium, a automat LOD-u ma własny spec w 70e. Odnoga musi być
  płytsza albo głębsza od trzonu — przy remisie głębokości Architektura nie ma dna (pułapka
  w `siec`). Test serwera sprawdza wyciek na szybie 4 pięter bez odnogi; odnogi pokrywa test
  `shared` (200 losowych szybów) i podsłuch E2E.
- **Hasło pod stopami:** wyjście w dół jest wyszarzone z powodem w dymku; komunikatu po kliku już
  nie ma, bo nie ma kliku (T5a #31 sprawdza przycisk i odmowę surowego gniazda).
- **Belka stanu** pokazuje kropki Akcji Sieciowych także poza walką (wszystkie pełne, dymek mówi,
  że nikt ich wtedy nie liczy).

### 70b — Przejęta wieżyczka i kamera na mapie

- [x] `shared`: tabela czynności wg rodzaju, `netDeviceTurn` (aktywacja, budżet, wygaśnięcie),
      sloty belki dla urządzenia, koszt „Akcja Sieciowa”
- [x] Serwer: `net-control.ts` (`loadNetDeviceGrants`, `operatorOf`), `operated` w widoku figury,
      atak przejętą figurą przez zwykłe `attack:*` z Wartością bojową, pomijanie tury i obszaru
      straży, koniec kontroli, obrót kamery na punkt
- [x] Klient: zaznaczanie przejętej figury, belka urządzenia, znacznik „przejęta”, sekcja
      „Przejęte” w „Postaciach”; usunięcie `NodeDevices` z listą celów
- [x] Wpisy w `decyzje-i-uproszczenia.md`: aktywacja = pełna tura (s. 199), Wartość bojowa (s. 213)
- [x] Testy: `netdevices.test.ts` (shared), `net-control.test.ts` (serwer), E2E
      `t70b-przejeta-wiezyczka`; poprawione T5b

**Kryteria ukończenia:** netrunner po Kontroli zaznacza wieżyczkę na mapie, wybiera serię, celuje
z podglądem osłony i strzela za jedną Akcję Sieciową; drugi strzał z tego węzła w tej rundzie
odmawia; inny gracz nie ruszy tej figury; po odłączeniu wieżyczka wraca do obrony i do kolejki.

**Zrobione 12–13.11.2026. Odstępstwa od projektu:**

- **Księga aktywacji to `deviceTurns` (lista) w stanie runu**, nie pojedyncze `deviceTurn` —
  netrunner trzymający dwa węzły aktywuje w rundzie po jednym urządzeniu z każdego.
- **Widok przejętej figury jedzie w `NetRunPayload.operated`**, nie w polu figury — belka,
  „Postacie” i mapa czytają jedno źródło (`client/src/net-operated.ts`), a ładunek figur zostaje
  bez wiedzy o Sieci.
- **Znacznik „przejęta” to naklejka stanu `net-seized` („Przejęty w Sieci”)**, nie obwódka
  w kolorze netrunnera — widzi ją każdy, kto widzi figurę, i MG ma ją na liście stanów.
- **„Wyłącz” oddaje figurę** (wpis w `decyzje-i-uproszczenia.md`); naklejka „Wyłączony” zostaje
  do 70c, jak w podziale.
- **Testy serwera stoją w `netdevices.test.ts` i `net-cameras.test.ts`**, nie w osobnym
  `net-control.test.ts` (ta sama fikstura sceny); testy `shared` w `netdevices-turn.test.ts`.
- **Wiersz rzutu mówi „Refleks +0 · <Umiejętność> +N”** jak u każdego statysty z Wartością
  bojową — wspólna ścieżka `cpredSheetWithCombatValue`, nie osobna etykieta dla urządzeń.
- **T5b poprawione, ale nie puszczone** — od kroku 5.10 wymaga gatewaya (zaległość z 70a).

### 70c — Dron w ruchu, oczy urządzeń, pasek

- [x] Serwer: marsz przejętego drona z budżetu `deviceTurn` i jego oczu, pożyczony wzrok
      wieżyczki i drona (dostawcy obok kamer), naklejka „Wyłączony”
- [x] Klient: pasek „Oczy i urządzenia” z kadrem tam i z powrotem, kafel „Ruch” drona
- [x] Testy: `vision` / `net-control` (serwer), E2E `t70c-dron-oczy`

**Kryteria ukończenia:** dron w jednej aktywacji podjeżdża i strzela; netrunner widzi to, co
widzi dron, także w ciemności, a jego własna pamięć mapy się nie powiększa; pasek przełącza kadr
między trzema oczami i wraca na postać.

**Zrobione 13.11.2026. Odstępstwa od projektu:**

- **Pasek czyta urządzenia z karty piętra i śladu** (`here.devices`, `trail[].devices` — pomost
  z 70a), nie z nowego pola ładunku: ślad niesie dokładnie urządzenia trzymanych węzłów, także
  te bez figury i wyłączone, których nie ma w `operated`. Sekcja „Przejęte węzły” i lista
  `NetNodeDevices` zniknęły; przed Kontrolą karta piętra dalej pokazuje nazwy i rodzaje.
- **Urządzenie z figurą nie ma w pasku przełączników** (nawet „Wyłącz”) — to wszystko stoi na
  belce figury; w pasku zostaje „Włącz” wyłączonego i przełączniki drzwi, instalacji i kamery
  bez figury. Wyłączony dron nie znika z paska, tylko **przestaje być okiem**: szara kropka,
  „Włącz”, „◂ ▸” go pomijają.
- **Kafel „Ruch” niczego nie uzbraja** — bierze drona w rękę i mówi zdaniem, że jeździ się klikiem
  w podłoże (jak postać); metry z aktywacji pokazuje kafel i zasięg planera (`moveAllowanceOf`
  z zaznaczonej figury).
- **„Szary krążek” to pole rejestru stanów `dims`** (`statuses.json`), nie rysunek na sztywno —
  rdzeń mapy nie wie, co znaczy „Wyłączony”.
- **Dron nie odpala stref i nie rzuca Percepcji w drodze**, a wyłączone urządzenie (tura, straż,
  oczy na skradających się, walka z zauważenia) milczy jak przejęte — jedno pytanie
  `netSilencedTokenIds`. Wpis w `decyzje-i-uproszczenia.md`.
- **Przy okazji naprawiony błąd z 70b:** księga „węzeł raz na Turę” przeżywała koniec walki
  i odmawiała w rundzie 1 następnej (pułapka na górze `siec`).
- **Testy serwera w nowym `net-drone.test.ts`** (własna fikstura ciemnej hali), nie
  w `vision` / `net-control`.

### 70d — Edycja mapy, strefy, Sieć ze sceny

- [x] Karta figury urządzenia: „Obszar straży”; narzędzie „Strefa” tylko środowiskowe; „Postaw
      figurę urządzenia” na starej strefie; „Sterowane z Sieci” na karcie otworu (migracja)
- [x] `netscene.ts`: grupy węzłów, strefy i drzwi jako urządzenia sceny, `netAdoptSceneDevices`
      wg grupy; `adoptSceneDeviceLive` dla nowej strefy i przełączonych drzwi
- [x] Okienko strefy u gracza z „Wyłącz / Włącz” netrunnera
- [x] Wpisy w `decyzje-i-uproszczenia.md`: lista urządzeń dopiero na węźle, węzły wg rodzaju
- [x] Testy: `netscene.test.ts` (shared), `net-scene.test.ts`, `zones.test.ts` (serwer), E2E
      `t70d-edycja-straz-strefy`; wzorce scen w kopii kampanii (`archive`)

**Kryteria ukończenia:** MG stawia wieżyczkę z obszarem straży i podłogę elektryczną bez
otwierania edytora Architektury; netrunner z gniazda bez Architektury przechodzi trzy węzły,
wyłącza podłogę klikiem w strefę i otwiera drzwi; stara scena „Brama” z T5 działa bez zmian.

**Zrobione 13.11.2026 (migracja `20261113180000_net_scene_installations`). Odstępstwa od
projektu:**

- **Strefy i drzwi dochodzą same tylko do Sieci złożonej ze sceny** (`netIsSceneArchitecture`),
  nie do Architektury z edytora — tam wiąże je karta strefy (#33) i urządzenie „Drzwi lub
  winda”. Projekt nie rozróżniał; bez tego „Brama” z T5 dostałaby przy następnym podłączeniu
  podłogę do węzła wieżyczki i przestałaby „działać bez zmian”. Figury z ikoną dochodzą do
  Architektury MG jak w 62, ale do węzła swojej grupy (pierwszy z miejscem bez cudzej grupy).
- **„Karta figury urządzenia” to menu figury MG** („🛡 Obszar straży…” przy ikonie wieżyczki,
  drona, drona naziemnego i robota), nie okno „Edycja tokenu” — prostokąt rysuje się na mapie,
  a okno edycji jest modalne. **Wpis nie daje figurze broni** — w danych kompendium broń jest
  zdaniem opisu (pomysł w `POMYSLY.md`); PW wpisu dostaje figura bez paska PW, RUCH i Wartość
  bojową czyta się z wpisu obszaru jak od 70b/70c.
- **Scena bez urządzeń to samo wejście** — projekt mówi „węzeł tylko z urządzeniem”; wcześniej
  pusty węzeł kontrolny. Urządzenie dołożone w trakcie runu dostaje nowy węzeł swojej grupy na
  dole trzonu.
- **„Poza Siecią” to kolumna `DefenseZone.netExcluded`** w tej samej migracji co
  `Wall.netControlled` (rozstrzygnięcie nr 7 jej potrzebowało, projekt wymieniał jedną kolumnę).
- **Odhaczenie drzwi, „Poza Siecią”, skasowanie strefy albo ściany zdejmuje urządzenie z węzła**
  (`releaseSceneDevice`), węzeł zostaje — pozycje pięter trwających runów liczą się od jego miejsca.
- **Okienko strefy pyta też przed odmową marszu** (cudza tura, podłączony netrunner) — „Rozbrój”
  i „Wyłącz” tury nie potrzebują; „Wejdź mimo to” kończy się wtedy zwykłą odmową.
- **E2E `t70d`**: gniazdo, drzwi i kamerę stawia surowe gniazdo MG (ich UI sprawdzają T5a i T3);
  dochodzi kamera, żeby Sieć miała trzy węzły z kryterium. Krok 5 („stara strefa z »Bramy«”) to
  stara strefa drona naziemnego bez figury na tej samej scenie — spec startuje z `po-T6`, nie
  z `po-T5a`. Strzał starej wieżyczki „Bramy” pilnuje T5b (gateway) i `zones.test.ts`.
- **T5a**: wieżyczka „Bramy” dostaje ikonę („🖼 Zmień grafikę…” → „Wieżyczka”) i obszar straży
  z menu figury zamiast strefy z narzędzia i pola „Stanowisko”. Szablony scen (`scene.json`) nie
  znają jeszcze `netControlled` / „Poza Siecią” — dojdzie z wzorcami w 70f.

### 70e — Automat LOD-u i Demona

- [x] `shared`: `netDefenseAutoStep` (czy i co obrona robi po zdarzeniu) — czysta, z testami
- [x] Serwer: wykrycie po ruchu, tura w kolejce, `defensePaused`, `netrun:defense:pause`
- [x] Klient MG: przełącznik hamulca w oknie runu
- [x] Wpis w `decyzje-i-uproszczenia.md` (cofnięcie decyzji z 15.08)
- [x] Testy: `netcombat.test.ts`, `netdemons.test.ts` (shared i serwer), E2E `t70e-automat-lod`

**Kryteria ukończenia:** wejście na piętro Kruka bez udziału MG daje test wykrycia i (po
przegranej) darmowy atak; w następnej rundzie Kruk atakuje sam; z włączonym hamulcem nie dzieje
się nic, dopóki MG nie kliknie.

**Zrobione 13.11.2026 (bez migracji). Odstępstwa od projektu:**

- **„Krótka pauza na kości” to kolejka prezentacji klienta, nie zegar serwera.** Tura LOD-u gra
  się w obsłudze „Następna tura” od razu; przed nią serwer wysyła odłożone widoki i kolejkę ze
  wskaźnikiem na LOD-zie (`flushPresentation`), a klient trzyma następny stan za kośćmi. Bez
  zegara nie ma też wyścigu z „Następna tura” MG — wskaźnik nigdy nie stoi na grającym LOD-zie.
- **Poza walką automat tylko wykrywa i budzi** — Tura bez rund nie istnieje, ścigający LOD poza
  walką dalej rusza się na „Tura LOD-a”. LOD wykryty przed starciem nie wchodzi sam do kolejki
  (pomysł w `POMYSLY.md`).
- **Zdjęcie hamulca niczego nie nadrabia** (wskaźnik na LOD-zie czeka na „Następna tura” MG,
  LOD pod stopami — na następne wejście). Hamulec stoi w belce stanu okna MG jako checkbox
  „Wstrzymaj obronę”, nie w „Planie Architektury” (zwijanym), a zdarzenie bierze `runId` —
  przełącznik trzyma Architektura runu.
- **Wyścig z „Następna tura” MG przeniósł się do klienta** — serwer nie stoi na grającym LOD-zie,
  ale kolejka MG pokazuje jego Turę jeszcze przez kości, a klik w nią przeskoczyłby następnego.
  Dlatego `combat:next` MG niesie widzianą turę i dostaje `TURN_MOVED_ON`, gdy kolejka poszła
  dalej (wypatrzone w oględzinach; dotyczy każdego kroku MG). Pomocnik E2E `nextTurn(mg)` czeka
  przed klikiem, aż kolejka MG dogoni bazę.
- **Wiersz, który nie ma czego zagrać, oddaje Turę bez słowa** (LOD zderezowany albo po Turze
  w tej Rundzie, Demon bez Akcji, wiersz po zniknięciu runu) — projekt mówił tylko o grających.
  Gdy własna Tura LOD-u zakończy run (awaryjne odłączenie zdejmuje jego wiersze), kolejka idzie
  do następnego istniejącego miejsca w starej kolejności (`pointerPastGone`), nie od góry rundy.
- **Testy:** automat i strażnik „Następna tura” na serwerze w nowym `net-defense.test.ts` (9);
  `netcombat.test.ts` i `netdemons.test.ts` sprawdzają przyciski MG z hamulcem zaciągniętym po
  `netrun:start`. Testy `shared` w `netdemons.test.ts` (10) i `netrun.test.ts` (odczyt
  `defensePaused`, krój MG).
- **E2E `t70e`:** obrona to wpisy MG z surowego gniazda (bez prywatnego kompendium), oba LOD-y
  tylko kradną Akcję Sieciową, Demon ma jedną Akcję. Krok 4 sprawdza też, że zdjęty hamulec nie
  rusza kolejki. **T5b:** MG w 5.4 zaznacza „Wstrzymaj obronę” — spec gra obroną ręką MG;
  niepuszczony (gateway, zaległość z 12.11).

### 70f — Wzorce i rozegranie

- [x] „Fabryka dronów” (66b) i „Po zamknięciu” (66e): węzły wg nowych reguł, obszary straży na
      figurach, notatki MG przepisane pod sterowanie z mapy, balans wieżyczki z Kucharzem
      (Wartość bojowa i seria zamiast 2k6 pojedynczo)
- [x] Rozegranie obu wzorców netrunnerem w przeglądarce (MG Chromium, gracz Firefox), znaleziska
      do `zaleglosci.md`
- [x] Umowy w sekcji `siec` (`umowy-kodu.md`), pułapki, `testy.md` (wiersz T70), zamknięcie
      zaległości z 07.11 (przejęte urządzenie jako figura; 66e pkt 3, 23, 24; 66e nr 3 — seria)

**Zrobione 14.11.2026 (bez migracji). Odstępstwa i rozstrzygnięcia:**

- **Format wzorca dostał trzy pola** (umowa na górze `mapa`): `zones[].figure` — obszar straży
  figury (`DefenseZone.tokenId`, PW na figurze), `zones[].netExcluded` („Poza Siecią”)
  i `walls[].netControlled` („Sterowane z Sieci”). Zapowiedziane w 70d; bez nich wzorzec nie
  postawiłby obszaru straży.
- **Wzorce zostają przy własnych Architekturach** (hasła, LOD, plik — Sieć ze sceny tego nie ma),
  a „węzły wg nowych reguł” to nazwy i podział jak w Sieci ze sceny. „Po zamknięciu”: hasło →
  Monitoring (5 kamer) → **Obrona** (wieżyczka) → **Instalacje** (podłoga, zamek gabinetu) →
  plik — dawny „Węzeł zabezpieczeń” rozpadł się na dwa, bo węzeł działa raz na Turę, a w finale
  strzał wieżyczki i zamek gabinetu mają się zmieścić w jednej Turze. „Fabryka dronów”: ten sam
  układ pięter, etykiety „Monitoring”, „Obrona: patrol”, „Obrona: lądowiska północ / boczne”.
- **Obszary straży:** wieżyczka „Po zamknięciu” — cały gabinet, ukryty (zleceniodawca mówi tylko
  „coś, co strzela samo”); Sowa — jej lądowisko, jawne (drużyna wie, gdzie czuwa prototyp).
  Wpis obu to „Automatyczna wieżyczka” (w próbce „Grzechot”): wpisy dronów nie strzelają same,
  a Sowa ma strzelać do każdego na lądowisku. Próbka dostała `effects.fires` przy „Grzechocie”.
- **Balans wieżyczki z Kucharzem nie wyszedł z samej serii.** Seria to zawsze 2k6 × mnożnik
  (najwyżej 3 dla PM), a przeciw OB 11 symulacja (20 000 przebiegów, ablacja, krytyki, 3 serie
  z magazynka) dawała 8% szans na Kucharza w 6 rundach. Wieżyczka dostała karabin szturmowy (5k6
  — pierwsza broń z wpisu „Automatyczna wieżyczka”) i Wartość bojową 14, a Kucharz Kevlar (OB 7)
  zamiast lekkiej kurtki: pojedynczy strzał kładzie go w 4. rundzie w połowie przebiegów, w 6.
  w 9 na 10, a Kucharz zestrzeliwuje wieżyczkę strzelbą w 4–5 rundach — wyścig, w którym pomaga
  własna broń netrunnera. Notatka „Skalowanie” mówi, jak to przestawić przy stole.
- **Poza zakresem, ale potrzebne wzorcom — trzy poprawki kodu:**
  „⏻ Włącz / Wyłącz w Sieci” w menu MG figury (`net:device:switch`) — od 70c uśpiony dron milczy,
  a stan urządzenia zmieniał tylko węzeł netrunnera, więc alarm „Fabryki” („co rundę budzi się
  Szerszeń”) nie miał czym ruszyć; naklejka „Wyłączony” od założenia sceny ze wzorca
  (`refreshNetCameraSight` w `scene:from-template`, wcześniej dopiero po pierwszym podłączeniu);
  **wyłączone urządzenie da się przeszukać** (`searchable` stanu `net-off`) — drzazga Sowy bez
  ręcznego „Unieruchomiony” (pomysł z 31.10). Decyzje w `decyzje-i-uproszczenia.md`.
- **Z rozegrania poprawione od razu:** pasek „Oczy i urządzenia” miał trzy kolumny i nazwy w jednym
  wierszu — pięć kamer „Po zamknięciu” czytało się „Kamera…”; teraz dwie kolumny i nazwa
  w dwóch wierszach. Odłączenie z pięcioma kamerami i wieżyczką dawało sześć wierszy czatu
  „wraca do obrony” (pięć „Urządzenie”) — teraz jeden: „wracają do obrony: Automatyczna
  wieżyczka i 5 ukrytych urządzeń”.
- **Rozegranie to tymczasowe specy oględzin** (`specs/99-ogledziny/t99-70f-*`, nie w repo, jak
  w 66b): walki z ochroną i marsz przez ciemną halę były rozegrane 04–07.11 i etap 70 ich nie
  dotyka, więc MG stawia figury przy konsolach i lądowisku; gra zaczyna się od Sieci.

## Testy

### Jednostkowe — `packages/shared` (vitest, obowiązkowe)

| plik                                     | co sprawdza                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `netrun.test.ts`                         | krój gracza: brak `branches`; `JSON.stringify(view)` nie zawiera `id` ani etykiety żadnego piętra spoza śladu i wyjść — w pętli po 200 Architekturach z `generateNetArchitecture` (RNG z ziarnem) i losowych przebiegach ruchów; wyjścia na rozwidleniu; hasło blokuje `exits.down`; `virusAllowed` tylko na dnie; krój MG niesie cały `shaft`; `netMoveAllowedFor` |
| `netdevices.test.ts`                     | tabela czynności wg rodzaju; `netDeviceTurn`: aktywacja, ruch + czynność w obu kolejnościach, druga czynność odmawia, wygaśnięcie przy zmianie rundy, poza walką bez limitu; węzeł raz na rundę przy dwóch urządzeniach                                                                                                                                             |
| `netscene.test.ts`                       | grupy „Monitoring / Obrona / Instalacje”; węzeł tylko z urządzeniami; nadmiar ponad 6; strefa i drzwi jako urządzenia; dopinanie do Architektury MG wg grupy; figura podpięta gdzie indziej pominięta (jak dziś)                                                                                                                                                    |
| `netcombat.test.ts`, `netdemons.test.ts` | `netDefenseAutoStep`: wykrycie po wejściu, Demon po Kontroli, nic przy `defensePaused`, nic przy LOD-zie zderezowanym                                                                                                                                                                                                                                               |
| `hud` (sloty)                            | belka wieżyczki, drona i kamery; koszt „Akcja Sieciowa” przed aktywacją, kropka i metry po niej                                                                                                                                                                                                                                                                     |

### Serwer — testy dymne (vitest)

- **Wyciek:** `netrun:sync` gracza w Architekturze z kanarkami w etykietach głębszych pięter —
  żaden kanarek ani `id` w ładunku; po zjeździe o piętro pojawia się dokładnie jedno nowe.
- **Wyrocznia ruchu:** `netrun:move` na piętro istniejące-nieznane i na nieistniejące daje ten sam
  kod; MG rusza bez ograniczeń.
- **Lista urządzeń:** brak przed piętrem węzła, nazwy i rodzaje na piętrze, pełne po Kontroli;
  nazwa ukrytej figury nie wycieka (jak w 62).
- **Pożyczona kontrola:** operator rusza i strzela przejętą figurą; inny gracz → `FORBIDDEN`;
  po odłączeniu, po odebraniu węzła przez Demona i po „Wyłącz” → `FORBIDDEN`; ukryta figura
  urządzenia jedzie tylko do operatora i MG.
- **Aktywacja:** pierwsza czynność bierze 1 Akcję Sieciową i znaczy węzeł; ruch + strzał w jednej
  aktywacji; drugi strzał i drugie urządzenie węzła odmawiają; nowa runda zeruje; odmowa ataku
  przed rzutem zwraca Akcję Sieciową.
- **Wartość bojowa:** rzut z wpisu / statysty / karty NPC-a wg kolejności; Umiejętność netrunnera
  nie wchodzi do rzutu; brak wartości → odmowa bez kosztu.
- **Kolejka i straż:** tura przejętej figury pominięta, obszar straży milczy; po utracie kontroli
  oba wracają.
- **Oczy:** dron i wieżyczka dokładają wielokąt widzenia operatorowi, nie zasilają pamięci mapy,
  nie zakładają walki z zauważenia; restart serwera przelicza widok (pułapka z 07.11).
- **Strefa i drzwi:** strefa sceny w węźle „Instalacje”; „Wyłącz” z okienka strefy rozbraja ją
  (`zoneDisarmedByNetrunner`); drzwi bez „Sterowane z Sieci” poza Siecią; kopia kampanii niesie
  nowe pola.
- **Automat:** ruch na piętro LOD-u daje wykrycie bez zdarzenia MG; tura LOD-u w kolejce sama;
  `defensePaused` wstrzymuje oba; ręczne zdarzenia MG działają w obu trybach.

### E2E — `packages/e2e/specs/47-siec/` (Playwright)

Wspólne: start z punktu `po-T6` (`startFromPoT6(DEAD_GATEWAY)`), **MG w Chromium, Ola (Iskra)
w Firefoksie**, kości ze skryptu (`scriptDice`), tag `@szybkie` (bez LLM), podsłuch `Sniffer`
z kanarkami na karcie gracza przez cały spec. Nowa fikstura `fixtures/siec.ts`: `buildNetScene`
(scena, ściany, gniazdo, figury urządzeń, strefy, Architektura przez surowe gniazdo MG), `jackIn`,
`floorCard`, `takeExit`, `operatedTokens`, `selectOperated`, `eyesStrip`. Czekanie na skutek
zdolności po animacji kości (pułapka `siec` z 20.10: `.net-node-device` → teraz miniatura na
pasku, 15 s).

**`t70a-okno-pietro.spec.ts`** — Architektura: wejście → hasło → Plik → rozwidlenie (odnoga
z LOD-em) → węzeł → dno; etykiety głębszych pięter to kanarki.

1. Podłączenie: okno ma jedną kartę piętra, wyjście „Niżej: ?”, zero elementów z numerem „z N”;
   szerokość ≤ 360 px, nie nachodzi na kubek.
2. Podsłuch: żadna ramka gracza nie zawiera kanarka ani `id` piętra spoza śladu i wyjść.
3. Hasło: „Niżej” wyszarzone z powodem; Backdoor (kość ze skryptu) → wyjście aktywne.
4. Zwiad: wyjście dostaje ikonę rodzaju, bez PT; na rozwidleniu dwa wyjścia.
5. Ślad: klik w pierwsze piętro wraca; klik w ostatnie odwiedzone schodzi z powrotem.
6. Surowe gniazdo gracza: `netrun:move` na nieodwiedzone głębokie piętro i na pozycję zmyśloną —
   ta sama odmowa.
7. Dno: „Dalej nie ma zejścia”, Wirus dostępny; piętro wyżej — nie.
8. MG: „Plan Architektury” pokazuje cały szyb z pozycją Iskry.
9. Konsola przeglądarki czysta; drugi przebieg kroku 1 w Chromium jako gracz (okno i szerokość).

**`t70b-przejeta-wiezyczka.spec.ts`** — scena z wieżyczką (statysta, pistolet maszynowy, obszar
straży), kamerą i NPC-em za osłoną; walka założona.

1. Na piętrze węzła przed Kontrolą: nazwy i rodzaje, żadnej miniatury na pasku.
2. Kontrola: miniatury na pasku, wieżyczka ma obwódkę „przejęta”, kadr rzuca na nią okiem.
3. Zaznaczenie wieżyczki klikiem na mapie (`browser_mouse_*_xy` / `clickOnMap`): belka
   urządzenia, kafel broni, szuflada trybów; koszt „Akcja Sieciowa”.
4. Seria w NPC-a: okno Celowania pyta o osłonę **przed** zapłatą; strzał; karta ataku
   z Wartością bojową; kropki Akcji Sieciowych −1.
5. Drugi strzał w tej rundzie: odmowa „węzeł był już aktywowany”; kafel wygaszony.
6. Kolejka: tura wieżyczki pominięta, chip „przejęta”; Marek (drugi gracz) wchodzi w obszar
   straży — wieżyczka nie strzela; Marek nie może jej zaznaczyć ani ruszyć surowym gniazdem.
7. Kamera: „Obróć” klikiem w punkt mapy, stożek odsłania NPC-a w drugim pokoju (`wall` store:
   liczba wielokątów rośnie), `facing` u MG zmienione.
8. Odłączenie: zaznaczenie wraca na Iskrę, obwódka znika, wiersz „wraca do obrony”, wieżyczka
   znów w kolejce; ponowne podłączenie oddaje ją bez Testu (pamięć z 02.11).

**`t70c-dron-oczy.spec.ts`** — ciemna hala, dron za ścianą, cel poza wzrokiem Iskry.

1. Kontrola węzła „Obrona”: dron odsłania koło wokół siebie w ciemności; pamięć mapy Iskry bez
   zmian po zdjęciu kontroli.
2. Aktywacja: marsz drona klikiem (budżet = jego RUCH, kreska metrów maleje), potem strzał;
   trzecia czynność odmawia.
3. Pasek: „▸” przenosi kadr na kamerę, „⌂” wraca na Iskrę; „Wyłącz” na dronie → naklejka
   „Wyłączony” u MG i u Marka, dron znika z paska oczu.
4. F5 gracza w trakcie kontroli: belka, pasek i oczy wracają bez błędu.

**`t70d-edycja-straz-strefy.spec.ts`** — pusta scena, MG klika wszystko w UI (bez surowego gniazda).

1. MG stawia wieżyczkę z „Urządzeń”, rysuje „Obszar straży”, stawia podłogę elektryczną
   narzędziem „Strefa” (lista ma tylko systemy środowiskowe), zaznacza drzwi „Sterowane z Sieci”,
   stawia gniazdo bez Architektury.
2. Iskra podłącza się: Sieć ze sceny ma wejście, „Obrona”, „Instalacje” (bez „Monitoringu”, bo
   nie ma kamer) — sprawdzone u MG w „Planie Architektury”.
3. Iskra klika zauważoną podłogę: okienko strefy zamiast marszu; po Kontroli „Instalacji” —
   „Wyłącz”; Marek przechodzi przez strefę bez obrażeń; „Włącz” w następnej rundzie.
4. Drzwi z paska urządzeń: „Otwórz” — ściana otwarta u obu graczy.
5. Stara strefa stanowiska z „Bramy” (punkt `po-T5a`): strzela jak przed etapem; „Postaw figurę
   urządzenia” zakłada figurę i przenosi PW.

**`t70e-automat-lod.spec.ts`** — Architektura z Krukiem i Demonem, walka założona.

1. Iskra zjeżdża na piętro Kruka: bez kliknięcia MG idzie test wykrycia (kości u gracza),
   przegrana ze skryptu → darmowy atak, Kruk w kolejce.
2. Następna runda: tura Kruka rozgrywa się sama, wskaźnik idzie dalej.
3. MG włącza hamulec: Iskra wchodzi na drugie piętro z LOD-em — nic; MG klika „wykrywa intruza”.
4. Kontrola węzła budzi Demona (hamulec zdjęty); tura Demona sama odbiera węzeł — przejęta
   wieżyczka z paska znika.

**Regresja istniejących speców:** T5a 5.3 („dalsze piętra jako »?«” → jedna karta i wyjście),
T5b (strzał wieżyczki z okna → z mapy), `t62-siec-sceny` (lista od podłączenia → na węźle; węzły
wg rodzaju), `t8c-zdolnosci` (Sieć w macierzy silników), `t2c-kanarki` (nowe pola ładunku).
Punkty kontrolne zostają ważne: kształt zapisanego runu się nie zmienia, dochodzi tylko
opcjonalne `deviceTurn`.

### Oględziny (po każdym podetapie)

Firefox z Playwright MCP jako gracz, Chromium jako MG, dzień i noc; w notatce sesji — w czym
oglądano. Po 70f pełne rozegranie „Fabryki dronów” i „Po zamknięciu” netrunnerem.

## Rozstrzygnięcia bez pytań (do słowa MG)

Mniejsze wybory przyjęte w projekcie — każdy da się odwrócić przed realizacją swojego podetapu:

1. **Wyjścia bieżącego piętra są widoczne od razu** (że jest zejście i czy się rozwidla). Bez tego
   gracz klikałby „Niżej” na ślepo; kosztem jest jeden bit wiedzy o piętrze poniżej.
2. **`virusAllowed` zdradza na ślepej odnodze, że gdzieś jest głębiej** — tak samo jak dzisiejsza
   odmowa „tylko na dnie Architektury”.
3. **Wieżyczka i dron pożyczają wzrok** (koło na zasięg figury), nie tylko kamera — inaczej
   operator nie ma w co celować bez kamery obok.
4. **Przejęta figura jest widoczna dla operatora, nawet gdy MG ją ukrył**; pozostali gracze widzą
   tylko figury jawne.
5. **Przejęta figura nie odpala stref i nie zakłada walki z zauważenia**; wrogowie nie reagują na
   nią sami — o tym, czy ją ostrzelają, decyduje MG.
6. **Rzut Wartością bojową jest bez Szczęścia netrunnera** (to nie jest Test postaci).
7. **Strefy środowiskowe sceny wchodzą do Sieci same** (jak figury z ikoną w 62); drzwi tylko
   z przełącznikiem. Strefa, której MG nie chce w Sieci, dostaje na karcie „Poza Siecią”.
8. **Demon budzi się także po udanej Kontroli**, nie tylko po wejściu na jego piętro.
9. **Sekcja „Przejęte” w „Postaciach” i pasek w oknie SIEĆ istnieją obie** — pasek do
   przełączania oczu w trakcie runu, „Postacie” jako znane graczom miejsce figur.
10. **Etykieta węzła ze Sieci ze sceny** („Monitoring”, „Obrona”, „Instalacje”) jest jawna dla
    gracza po wejściu na piętro, jak każda etykieta piętra.

## Poza zakresem (do `POMYSLY.md` przy realizacji)

- Obraz w obrazie — osobny „monitor” z drugą kamerą mapy (decyzja 6: nie teraz).
- Ręczne odpalanie strefy na wrogach, przepustki drużyny, strefa bijąca NPC-ów (decyzja 3).
- Alarm z kamery („X wszedł w obszar kamery” jako pasek MG; `POMYSLY.md` z 15.10, 66e pkt 11).
- Wrogi netrunner i czyhający LOD z deku gracza (`POMYSLY.md` z 15.08).
- Automatyczne włączanie trybu turowego po strzale z urządzenia poza walką (66e pkt 19 —
  decyzja MG z 07.11: nie zaległość).
- Ikona urządzenia w chipie kolejki i panelu walki (`POMYSLY.md` z 28.10) — warto przy 70b, ale
  nie jest warunkiem.

## Ryzyka

- **Rozmiar 70b.** Pożyczona kontrola dotyka ruchu, ataku, widoku figur, belki i kolejki. Jeśli
  w sesji okaże się za duża: 70b1 (serwer + strzał wieżyczki), 70b2 (kamera, kolejka, „Postacie”).
- **Dwie drogi do jednej figury.** `operatorOf` musi być jedynym miejscem, które pyta o prawo do
  przejętej figury — osobne warunki w `token:walk` i w ataku rozjadą się przy pierwszej poprawce.
- **Automat w kolejce inicjatywy.** Tura rozgrywana przez serwer musi czekać na animację kości
  i nie może ścigać się z „Następna tura” MG; hamulec jest zaworem bezpieczeństwa przy stole.
- **Stare sceny.** Sceny założone z wzorców przed 70f zostają przy starych węzłach i strefach —
  mają działać, ale nie dostaną nowych ułatwień bez ręki MG.
