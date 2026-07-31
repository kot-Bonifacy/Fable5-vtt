# Etap 16b — Linia strzału i atak z mapy

**Faza:** D — Walka · **Wymaga etapów:** 16, 18a, 18d/18e

## Cel sesji

Kula przestaje przechodzić przez mur, a atak przestaje być czynnością wyłącznie karty
postaci. Serwer sprawdza, co stoi między strzelcem a celem; atak da się zacząć z mapy,
także tokenem, który nie ma żadnej karty.

**Pochodzenie:** dopisany 2026-07-31, tego samego dnia podzielony na 16b i 16c (decyzja MG).
Etap 16 świadomie zostawił geometrię ostrzału poza zakresem („wymaga ścian z etapu 18" —
wpis w POMYSLY z 28.07), a ściany, otwory i widoczność są gotowe od 18a–18e. Bez tego etapu
bot z etapu 20 nauczy się strzelać w świecie, w którym mury nie istnieją.

## Zakres

- [x] **Linia strzału na serwerze**: odcinek środek—środek między tokenami sprawdzany przeciw
      blokadom pocisku (`isSegmentClear` z 18d). Odmowa wraca jako czytelna karta („Cel za
      murem — nie masz linii strzału"), bo **klient tego nie podpowie z wyprzedzeniem**:
      ściany nie opuszczają serwera (18a)
- [x] **Co zatrzymuje pocisk** — lista blokad to blokady wzroku **strzelca**, nie sceny:
  - ściana zatrzymuje zawsze, zamknięte drzwi zatrzymują, otwarte nie (18e)
  - **szyba nie jest osłoną** (RAW: tabela PW osłon, s. 180 — „Szyba samochodowa 0 PW (nie
    jest osłoną)"), więc zamknięte okno nie zatrzymuje kuli **z bliska** — ale z daleka zatrzymuje
    strzał, bo firanka z 18d nie pozwala zobaczyć celu. Jedna lista dla wzroku i dla pocisku
    załatwia oba przypadki bez drugiej reguły
- [x] **Ogień zaporowy liczony tą samą linią** — RAW s. 174 mówi „wszystkie … osoby w zasięgu
      25 m, **które widzisz**", a dziś zapora obejmuje każdego w promieniu niezależnie od
      murów. Przygwożdżony (14e) idzie za tym sam
- [x] **Wejście do ataku z mapy**: przycisk „Atak" w menu kontekstowym tokenu i w zakładce
      „Walka" z wyborem broni — dziś atak startuje **wyłącznie** z wiersza broni na karcie
      postaci, więc mechanika strzelania jest w UI praktycznie niewidoczna
- [x] **Profil bojowy statysty**: token bez karty postaci dostaje mały profil (cechy, poziom
      umiejętności, broń z kompendium, amunicja, SP pancerza) — dziś `roll:attack` wymaga
      `characterId`, więc MG nie ma jak strzelić NPC-em, dopóki nie założy mu pełnej karty
- [x] **Statysta broni się swoim** (decyzja MG z 31.07, rozszerzenie ponad pierwotny opis):
      PT zastępczy z profilu zamiast „PT codzienny 13", a SP z profilu schodzi automatycznie
      w ścieżce obrażeń z etapu 15 zamiast być wpisywane ręcznie przy każdym trafieniu
- [x] Testy: linia strzału przez ścianę / otwarte drzwi / zamknięte okno z bliska i z daleka,
      cel dokładnie przy krawędzi segmentu, zapora zatrzymana przez mur, atak statysty bez
      karty, obrona statysty z profilu

## Poza zakresem

- **Osłony jako obiekty sceny** (samochód, barykada, PW osłony, ostrzeliwanie ich) →
  **etap 16c**. Tam też trafia „Za osłoną" przy Ludzkiej tarczy z 14d
- **Częściowa osłona z karą do trafienia** — RAW jej nie zna wprost: „Jeśli wróg cię widzi,
  nie jesteś za osłoną. Nie ma czegoś takiego jak »częściowa« osłona" (s. 179)
- **Zniszczalne ściany budynków** — ściana jest absolutną blokadą; zniszczalne będą wyłącznie
  osłony z 16c. Uzbrojenie każdego segmentu ściany w PW wymagałoby migracji całej geometrii
  18a–18e i decyzji, co się dzieje z widocznością po zburzeniu
- **Pełny test „czy strzelec widzi cel"** (ciemność, mgła MG nad widocznością) — dziś atak
  gracza jest filtrowany przez ukrycie i mgłę z etapu 17, a linia strzału dokłada geometrię.
  Warunek „NPC nie strzela w ciemność, w której nic nie widzi" wymagałby pola widzenia
  liczonego per token, nie per gracz — wpis w POMYSLY
- **Kolizje ruchu** — token nadal przechodzi przez ścianę (osobny wpis w POMYSLY z 30.07;
  punkt zaczepienia czeka w `validateTokenMove`)
- Granaty, wzorce obszarowe, amunicja specjalna → **etap 16d**

## Odstępstwa i decyzje (2026-07-31, przed startem)

- **Etap 16b podzielony na 16b i 16c** (decyzja MG po mojej rekomendacji). Pierwotny zakres
  to osiem punktów, z czego trzy są dużymi blokami (nowy obiekt sceny z migracją, narzędziem
  MG i warstwą renderera; ostrzeliwanie osłony w ścieżce obrażeń; profil statysty). Szew jest
  naturalny: 16b to **geometria i wejście do ataku**, 16c to **nowy obiekt na mapie**.
  Kolejność wynika z zależności — statysta z 16b pozwala odklikać osłony NPC-em przeciw
  NPC-owi, a granaty (16d) zależą od osłon RAW-owo („eksplozja nie zadaje obrażeń celom
  ukrytym za osłoną", s. 175).
- **Rozstrzyga linia środek—środek** (decyzja MG). Promienie w obrys celu byłyby
  dokładniejsze, ale środek—środek to ta sama metryka, którą liczy dystans z etapu 16
  i zasięg ręki z 18d.
- **Linia strzału = blokady wzroku strzelca.** Nie druga, równoległa geometria: `sightSegmentsFor`
  z 18d już odpowiada „co zasłania temu obserwatorowi", a strzela się tam, gdzie się widzi.
  Dzięki temu reguła firanki działa na pocisk bez pisania jej drugi raz, a osłony z 16c
  dokładają do tej listy własne segmenty, których wzrok nie widzi.
- **Profil statysty pełniejszy, niż zakładał pierwotny opis** (decyzja MG): także obrona.
  Bez tego statysta zostawałby przy „PT codzienny 13" we wręcz i przy SP wpisywanym ręcznie
  w każdą kartę obrażeń, a to dwa miejsca, w których MG i tak musiałby pamiętać liczbę.

## Kryteria ukończenia

- Strzał do celu za murem odrzucony z czytelnym powodem; ten sam strzał po otwarciu drzwi
  przechodzi i normalnie liczy PT z dystansu
- Strzał przez zamknięte okno z odległości 1 m przechodzi, ten sam strzał z 10 m — nie
- MG strzela NPC-em bez karty postaci — karta ataku na czacie wygląda tak samo jak dla
  postaci gracza (dystans, przedział zasięgu, PT, rozbicie)
- Atak da się zacząć z menu kontekstowego tokenu, bez otwierania karty postaci
- Ogień zaporowy nie sięga celu stojącego za murem 10 m dalej
- Trafienie w statystę z SP w profilu odejmuje pancerz bez wpisywania go ręcznie i ściera
  go o 1
- Testy jednostkowe: geometria linii strzału (cel dokładnie przy krawędzi segmentu),
  synteza karty z profilu statysty

## Wskazówki techniczne

- Geometria jest gotowa — `isSegmentClear` i `sightSegmentsFor` z 18d rozstrzygają „czy
  odcinek przecina blokadę"; 16c dołoży do tej listy segmenty osłon
- Odmowa linii strzału to kolejny powód odmowy ataku obok tych z etapu 16 — dopisz ją do
  `CpredAttackProblem` w `shared/systems/cpred/attacks.ts`, nie obok
- Kolejność odmów przy ataku ma znaczenie tak samo jak przy `door:toggle` w 18d: najpierw
  „nie widzisz celu" (ukrycie i mgła, już jest), potem „nie masz linii strzału", dopiero
  potem zasięg i amunicja
- Profil bojowy statysty trzymaj na tokenie jako JSON (wzorzec `Combatant.turnState` z 14b) —
  rdzeń VTT nie może wiedzieć, co to broń. Syntezuj z niego `CpredCharacterData`, żeby
  `planCpredAttack` pozostał jedną ścieżką dla postaci i dla statysty
- Profil niesie PW i broń, więc jedzie do klienta tą samą redakcją co PW tokenu:
  właściciel i MG, nikt inny
