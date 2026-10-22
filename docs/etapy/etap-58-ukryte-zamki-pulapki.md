# Etap 58 — Ukryte rzeczy, zamki i rozbrajanie pułapek

**Faza:** przed betą (zlecenie MG z 22.10 spoza planu) · **Wymaga etapów:** 26f i 51 (strefy
bronione), 46b (pojemnik z zamkiem), 18d (drzwi i zamek MG), 32 (wezwanie do Testu),
55 (komunikaty), 56 (zatrzymanie marszu na polu zauważenia)

**Podział na cztery sesje (propozycja 22.10, czeka na akceptację MG):** 58a → 58b, 58c, 58d.
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
5. **Rzut ukryty:** pełny wynik automatycznej Percepcji widzi tylko MG. Gracz dostaje
   wiadomość wyłącznie o sukcesie, tylko dla siebie. Porażki gracz nie zobaczy.
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

- [ ] Percepcja przeciw ukrytej strefie pada na **klatce marszu**, która pierwszy raz wchodzi
      w promień 4 m. Figura staje na tym polu (`token:halt`), dalsza trasa przepada
- [ ] Ten sam rzut przy upuszczeniu bez trasy (MG przeciąga, skok) — z punktu końcowego, jak dziś
- [ ] Wiersz rzutu w czacie tylko dla MG; gracz dostaje neutralny pasek przy zatrzymaniu
      i drugi pasek przy sukcesie (kanał komunikatów z 55)
- [ ] Ogólny haczyk „ukryta rzecz w zasięgu” z rejestrem dostawców (strefa teraz,
      figura w 58d), żeby 58d nie pisało drugiej pętli po klatkach

### Kryteria ukończenia

- [ ] Marsz jednym klikiem **przez** ukrytą pułapkę staje 4 m przed nią i rzuca Percepcję
      (test serwera)
- [ ] Gracz, który oblał, ani żaden inny gracz nie dostaje wiersza z nazwą strefy ani wyniku
      (test serwera na payloadzie czatu)
- [ ] MG widzi pełny wiersz rzutu
- [ ] Postać, która już rzucała, nie staje drugi raz przy tej samej strefie
- [ ] Oględziny: gracz w Firefoksie widzi zatrzymanie i pasek, MG w Chromium widzi wiersz

## 58b — Rozbrajanie pułapki przez gracza

### Zakres

- [ ] „Rozbrój” w menu figury albo w dymku zauważonej strefy — tylko gdy strefa jest w payloadzie
      gracza (zauważona albo odsłonięta) i figura stoi w zasięgu ręki od jej krawędzi
- [ ] Test Elektroniki i zabezpieczeń z PT `disableDv` wpisu (MG może nadpisać na strefie).
      Kubek z wezwania (32), jak przy zamku pojemnika
- [ ] Sukces: `armed = false`. Porażka < 5: postać na liście prób strefy. Porażka ≥ 5: system
      odpala się na rozbrajającego (`fireZone` z przyczyną „nieudane rozbrajanie”)
- [ ] Poza walką zegar świata przesuwa się o `disableMinutes`. W walce odmowa z komunikatem
- [ ] Karta strefy u MG: lista prób i „Pozwól spróbować znowu”
- [ ] Gracz dalej nie dostaje `armed` ani PW strefy (etap 51) — po rozbrojeniu wie tylko to,
      co powiedział mu wynik Testu

### Kryteria ukończenia

- [ ] Udany Test rozbraja, a wejście potem nie rani (test serwera)
- [ ] Porażka o 5+ odpala system na rozbrajającego, porażka o mniej — nie (test `shared` na
      regule i test serwera)
- [ ] Druga próba tej samej postaci — odmowa; po „Pozwól spróbować znowu” — kubek
- [ ] W trakcie walki — odmowa z komunikatem; poza walką zegar przesunięty o minuty wpisu
- [ ] Strefa niezauważona — gracz nie ma czego rozbroić (odmowa jak dla nieistniejącej)

## 58c — Zamek drzwi, okna i bramy

### Zakres

- [ ] Pola zamka na otworze: PT, Umiejętności (Otwieranie zamków / Elektronika
      i zabezpieczenia), `keyId`, lista prób — reguła z `container.ts` przeniesiona do wspólnej,
      żeby pojemnik i drzwi miały jedną (`cpredContainerOpening` → zamek ogólny)
- [ ] Klik gracza w zamknięte na klucz drzwi w zasięgu ręki: zamiast samej odmowy — „Otwórz
      zamek” z kubkiem Testu. Klucz otwiera bez Testu
- [ ] Karta drzwi u MG: PT, Umiejętności, „Wydaj klucz”, „Pozwól spróbować znowu”
- [ ] Udany Test zdejmuje `locked` i otwiera drzwi

### Kryteria ukończenia

- [ ] Kolejność odmów z `opening:toggle` zostaje (niewidoczne → `WALL_NOT_FOUND`, za daleko →
      `OPENING_OUT_OF_REACH`, dopiero potem zamek) — test serwera
- [ ] Porażka, druga próba, „Pozwól spróbować znowu”, sukces, klucz — test serwera
- [ ] Testy `container` dalej zielone po przeniesieniu reguły
- [ ] Oględziny: gracz w Firefoksie otwiera drzwi wytrychem

## 58d — Ukryta figura przeciw Skradaniu

### Zakres

- [ ] Dostawca „ukrytej rzeczy” z 58a dla figury `hidden`: rzut przeciwstawny Percepcja gracza
      vs ZW + Skradanie z karty NPC-a albo PT z pola na figurze (nowe, opcjonalne)
- [ ] Sukces odsłania figurę **temu kontu** (lista `sightings` na figurze, filtr widoczności
      na serwerze). Lista prób na figurze, zerowana ruchem figury przez MG
- [ ] Okno edycji figury u MG: „PT Percepcji” dla figury bez karty
- [ ] Zauważona Wroga figura wchodzi w walkę z zauważenia (56) jak każda widoczna

### Kryteria ukończenia

- [ ] Ukryty NPC ze Skradaniem 6 i ZW 6 nie trafia do payloadu gracza, dopóki ten nie wygra
      rzutu przeciwstawnego; potem trafia tylko do jego payloadu (test serwera)
- [ ] Ruch figury przez MG daje graczowi nowy rzut
- [ ] Figura bez karty i bez PT — żadnego rzutu, żadnego zatrzymania
- [ ] Oględziny: gracz w Firefoksie, zatrzymanie i odsłonięcie czającego się NPC-a

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
