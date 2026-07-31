# Etap 16b — Osłony, linia strzału i atak z mapy

**Faza:** D — Walka · **Wymaga etapów:** 16, 18a, 18d/18e

## Cel sesji

Kula przestaje przechodzić przez mur. Serwer sprawdza, co stoi między strzelcem a celem,
osłona staje się obiektem, który można ostrzelać i zniszczyć, a atak da się zacząć z mapy —
także tokenem, który nie ma karty postaci.

**Pochodzenie:** dopisany 2026-07-31. Etap 16 świadomie zostawił osłony poza zakresem
(„wymaga ścian z etapu 18" — wpis w POMYSLY z 28.07), a ściany, otwory i geometria
widoczności są gotowe od 18a–18e. Bez tego etapu bot z etapu 20 nauczy się strzelać
w świecie, w którym mury nie istnieją.

## Zakres

- [ ] **Linia strzału na serwerze**: odcinek środek—środek między tokenami sprawdzany przeciw
      segmentom blokującym (`isSegmentClear` z 18d). Zamknięte drzwi i okno blokują strzał,
      otwarte nie (18e) — ten sam stan otworu, który już rozstrzyga widoczność. Odmowa wraca
      jako czytelna karta („Cel za murem — nie masz linii strzału"), bo **klient tego nie
      podpowie z wyprzedzeniem**: ściany nie opuszczają serwera (18a)
- [ ] **Nowy obiekt sceny „osłona"** (samochód, barykada, skrzynia, betonowy słupek):
  - stawiana przez MG narzędziem jak ściany z 18a, ale to obiekt **widoczny** — w
    przeciwieństwie do ścian jedzie do klienta i rysuje się na mapie
  - ma SP i PW; katalog typów osłon jako dane (`data/public`), nie łańcuch ifów
  - **blokuje strzał, nie blokuje wzroku** — to jest jej definicja; osłona zasłaniająca
    wzrok byłaby po prostu ścianą
- [ ] **Ostrzeliwanie osłony**: atak można skierować w osłonę zamiast w token; obrażenia
      redukuje jej SP ścieżką z etapu 15, PW schodzą, zniszczona osłona znika z mapy i
      przestaje blokować linię strzału
- [ ] **Karta odmowy proponuje osłonę jako cel** — „cel za osłoną: ostrzelaj samochód"
      jednym kliknięciem (wzorzec karty odmowy z 14b)
- [ ] **Ogień zaporowy i Przygwożdżony** (14e) liczone tą samą linią strzału — dziś zapora
      obejmuje wszystkich w 25 m niezależnie od murów
- [ ] **Wejście do ataku z mapy**: przycisk „Atak" w menu kontekstowym tokenu i w zakładce
      „Walka" z wyborem broni — dziś atak startuje **wyłącznie** z wiersza broni na karcie
      postaci, więc mechanika strzelania jest w UI praktycznie niewidoczna
- [ ] **Strzelanie tokenem bez karty postaci**: minimalny profil bojowy statysty (broń
      z kompendium, umiejętność, amunicja) — dziś `roll:attack` wymaga `characterId`, więc
      MG nie ma jak strzelić NPC-em, dopóki nie założy mu pełnej karty
- [ ] **„Za osłoną" przy Ludzkiej tarczy** (14d) przestaje być adnotacją na karcie i zaczyna
      działać — domyka wpis POMYSLY z 31.07
- [ ] Testy: linia strzału przez ścianę / otwarte drzwi / zamknięte okno, cel za rogiem
      (wartości graniczne środka), zniszczenie osłony odsłaniające cel, atak statysty bez
      karty, zapora zatrzymana przez mur

## Poza zakresem

- **Częściowa osłona z karą do trafienia** — decyzja MG: rozstrzyga linia środek—środek,
  bo RAW nie zna modyfikatora PT za częściowe zasłonięcie (patrz „Odstępstwa i decyzje")
- **Zniszczalne ściany budynków** — ściana jest absolutną blokadą; zniszczalne są wyłącznie
  osłony. Uzbrojenie każdego segmentu ściany w SP i PW wymagałoby migracji całej geometrii
  18a–18e i decyzji, co się dzieje z widocznością po zburzeniu
- **Kolizje ruchu** — token nadal przechodzi przez ścianę i przez osłonę (osobny wpis
  w POMYSLY z 30.07; punkt zaczepienia czeka w `validateTokenMove`)
- Granaty, wzorce obszarowe, amunicja specjalna → **etap 16c**

## Odstępstwa i decyzje (2026-07-31, przed startem)

- **Osłona to osobny obiekt, nie uzbrojona ściana** (decyzja MG). Mur budynku po prostu
  odmawia strzału — nikt przy stole nie strzela przez ścianę i nie czeka, aż ta się rozsypie.
  Zniszczalny jest tylko ten drobiazg, za którym faktycznie się kucają.
- **Rozstrzyga linia środek—środek** (decyzja MG). Promienie w obrys celu byłyby
  dokładniejsze, ale kara za częściową osłonę to nasze odstępstwo od RAW, a nie zasada —
  środek—środek to ta sama metryka, którą liczy dystans z etapu 16 i zasięg ręki z 18d.
- **Osłona jedzie do klienta, ściana nie.** To nie jest niekonsekwencja: ściana bywa
  informacją MG (tajne przejście), a samochód na ulicy widzą wszyscy. Zasada „dane
  niewidoczne dla gracza nie opuszczają serwera" dotyczy tego, co niewidoczne.

## Kryteria ukończenia

- Strzał do celu za murem odrzucony z czytelnym powodem; ten sam strzał po otwarciu drzwi
  przechodzi i normalnie liczy PT z dystansu
- Samochód postawiony w linii strzału blokuje trafienie; ostrzelanie samochodu zdejmuje mu
  PW z uwzględnieniem jego SP, a po zniszczeniu strzał do celu przechodzi bez zmiany pozycji
  któregokolwiek tokenu
- MG strzela NPC-em bez karty postaci — karta ataku na czacie wygląda tak samo jak dla
  postaci gracza (dystans, przedział zasięgu, PT, rozbicie)
- Atak da się zacząć z menu kontekstowego tokenu, bez otwierania karty postaci
- Ogień zaporowy nie sięga celu stojącego za murem 10 m dalej
- Testy jednostkowe: geometria linii strzału (cel dokładnie przy krawędzi segmentu),
  redukcja PW osłony przez jej SP

## Wskazówki techniczne

- Geometria jest gotowa — `isSegmentClear` i `SightSource.segments` z 18d rozstrzygają
  „czy odcinek przecina blokadę"; osłony dokładają własną listę segmentów, którą widoczność
  **ignoruje**, a linia strzału konsumuje
- Odmowa linii strzału to kolejny powód odmowy ataku obok tych z etapu 16 — dopisz ją do
  `CpredAttackProblem` w `shared/systems/cpred/attacks.ts`, nie obok
- Kolejność odmów przy ataku ma znaczenie tak samo jak przy `door:toggle` w 18d: najpierw
  „nie widzisz celu", potem „nie masz linii strzału", dopiero potem zasięg i amunicja
- Profil bojowy statysty trzymaj na tokenie jako JSON (wzorzec `Combatant.turnState` z 14b) —
  rdzeń VTT nie może wiedzieć, co to broń
- Osłona ostrzeliwana idzie ścieżką obrażeń z etapu 15, ale **nie ma ran krytycznych ani
  Testu Przeżywalności** — to przedmiot; uważaj na wspólne gałęzie w `damage.ts`
