# Etap 16d — Granaty, obszary i rzut przedmiotem 🏁 Pełny ostrzał

**Faza:** D — Walka · **Wymaga etapów:** 16b, 16c

## Cel sesji

Ostrzał przestaje być „jedna kula, jeden cel": granat raża obszar, a nie osobę.
Po tym etapie da się rzucić granatem w grupę, spudłować, i rozliczyć wszystkich,
których wybuch dosięgnął — z murem i osłoną decydującymi, kogo nie dosięgnął.

**Pochodzenie:** dopisany 2026-07-31 razem z 16b (wtedy jako 16c; przenumerowany, gdy 16b
podzielił się na 16b i 16c). Zbiera dwa wpisy z POMYSLY, które etap 16 świadomie zostawił
(„granaty i wzorce obszarowe" z 28.07, „rzut przedmiotem" z 31.07).

**Zwężony 2026-08-01 (decyzja MG):** trzeci wpis — **amunicja specjalna** — wyszedł do
osobnego etapu **16g**. Powód: 13 typów amunicji z podręcznika dotyka podsystemów spoza
walki dystansowej (dymna zasnuwa kwadrat 10×10 m i wpina się w widoczność z 18a–18c, EMP
wymaga testu Cyberinżynierii, hukbłyskowa nakłada dwie rany krytyczne na minutę,
usypiająca wprowadza Nieprzytomnego), a sam ten etap ma już geometrię, nowy tryb celowania
i rozliczenie N celów.

## Zakres

- [x] **Szablony obszaru na mapie**: kwadrat 10×10 m eksplozji (s. 174) i stożek 6 m przed
      strzelającym (przygotowany tu, używany przez śrut w 16g). Podgląd przed rzutem, ten
      sam obraz u MG i u gracza. **Odstępstwo od pierwotnego opisu:** szablon jest
      przejściową nakładką renderera (jak podgląd trasy z 16e), a nie kształtem na warstwie
      rysowania z 17b — rysunki z 17b są zapisywane w bazie i synchronizowane zdarzeniami,
      a podgląd chodzi za kursorem co klatkę
- [x] **Granat jako wiersz broni** (decyzja MG): nowy typ kompendium „Granat" — rzucany,
      eksplodujący, 6k6, umiejętność Atletyka, tabela PT z wiersza Granatnika, zasięg
      maks. 25 m (s. 177). Liczba sztuk siedzi w polu magazynka, więc pasek akcji z 16f,
      planer ataku i koszt amunicji działają bez nowej gałęzi
- [x] **Celowanie w punkt mapy**: cel ataku to **token, osłona albo pole 2×2 m** — wybuch
      jest wyśrodkowany na polu, nie na osobie („twój cel (pole 2x2 metry, nie osoba) jest
      środkiem tego obszaru", s. 174)
- [x] **Pudło odchyla obszar** — podręcznik zostawia miejsce upadku MG („MG decyduje, gdzie
      ląduje ładunek wybuchowy", s. 174), więc powstaje **zasada domowa** związana z rzutem
      i cechą (decyzja MG); patrz „Wskazówki techniczne"
- [x] **Rozliczenie obszarowe**: każdy token w obszarze dostaje osobną, cofalną kartę
      obrażeń (ścieżka z etapu 15); wszyscy dostają **te same** obrażenia z jednego rzutu
      („Każdy cel otrzymuje tyle samo obrażeń", s. 174)
- [x] **Mur i osłona wyjmują cel z wybuchu**: linia z 16b liczona od **środka wybuchu**, nie
      od rzucającego. RAW mówi o osłonie („Eksplozja nie zadaje obrażeń celom ukrytym za
      osłoną, jeśli tej osłony nie zniszczy", s. 174); ściana dostaje tę samą odpowiedź
- [x] **Odskoczenie poza obszar** (s. 174, pominięte w pierwotnym opisie etapu): cel z
      REF 8+ może odskoczyć, rzucając więcej niż rzut atakującego — ścieżką `attack:evade`
      z 16b, ale per cel, bo obszarowy atak ma ich wiele
- [x] **Rzut przedmiotem** (POMYSLY 31.07) — ta sama ścieżka co granat, bez obszaru:
      14d zrobił Rzut osobą, rzucanie rzeczami zostało. „Rzucone bronie białe zadają te same
      obrażenia, co zwykle, ale przy takim ataku rozpatruje się pełną OB pancerza, a nie
      połowę" (s. 177)
- [x] Testy: przynależność punktu do kwadratu i do stożka (wartości graniczne), odchylenie
      przy pudle, token za murem pominięty przez wybuch, zasięg 25 m

## Poza zakresem

- **Amunicja specjalna** — cały wpis przeniesiony do etapu **16g** (2026-08-01)
- **Dodatki do broni** (6 pozycji z „Nowej ekonomii ulicznej") i ekwipunek ogólny —
  zostają przy etapie 23, jak ustalono 27.07
- Niszczenie osłon obszarem ponad to, co daje 16c (wybuch obejmuje osłonę tak samo jak token)
- **Wyrzutnia rakiet** dostaje tę samą flagę eksplozji co granatnik, ale rakiety jako
  osobna pozycja ekwipunku czekają na 16g razem z amunicją

## Kryteria ukończenia

- Granat rzucony w grupę trzech tokenów tworzy trzy karty obrażeń; czwarty token, stojący
  za murem w tym samym obszarze, nie dostaje nic
- Pudło granatem odchyla obszar zgodnie z zasadą domową (rzut widoczny na karcie) i rozlicza
  go w nowym miejscu
- Cel z REF 8+ może odskoczyć i wypada z rozliczenia, gdy przebije rzut atakującego
- Rzut przedmiotem trafia jeden cel, licząc PT z wiersza Granatnika i zasięg 25 m
- Testy jednostkowe: przynależność punktu do obszaru i do stożka, odchylenie, zasięg

## Wskazówki techniczne

- **Zasada domowa „Odchylenie ładunku"** (podręcznik jej nie ma — s. 174 oddaje decyzję MG;
  automat jest potrzebny, bo od etapu 20 granatami rzucają też boty, a właściciel gra solo):
  - **kierunek**: 1k10 jako tarcza zegara — kąt = (wynik − 1) × 36°
  - **odległość**: 1k10 − cecha, którą wykonano rzut (ZW przy rzucie ręką, REF przy
    granatniku), przycięte do przedziału 2–4 m
  - punkt jest przyciągany do środka pola 2×2 m, a 4 m to najdalszy środek pola w pudełku
    10×10 m z podręcznika — odchylenie **nigdy z niego nie wychodzi**, więc granica jest
    podręcznikowa, a nie wymyślona
  - rzut idzie na serwerze tym samym RNG co kości i **ląduje na karcie**, żeby stół widział,
    skąd wzięło się miejsce wybuchu
- Osłona **nie blokuje rzutu granatem** (granat leci nad maską samochodu), ale **blokuje
  rażenie** tego, kto za nią stoi. To jest cała taktyczna rola granatu i jest zgodne z RAW:
  zasada mówi o obrażeniach eksplozji, nie o torze lotu
- Obszar liczy **serwer** z tych samych współrzędnych, które dostaje klient do podglądu;
  klient rysuje kształt, ale nie decyduje, kto w nim stoi
- Karta obszarowa to N kart obrażeń, nie jedna zbiorcza — inaczej „Cofnij" z etapu 15
  przestanie działać na pojedynczy cel. Wychodzi za darmo: `damage:apply` można wołać wiele
  razy na tym samym rzucie i każde wywołanie jest osobnym, cofalnym wierszem
- Typ „Granat" to **dane w kompendium**, nie gałąź w kodzie: flagi `thrown`, `explosive`,
  `maxRangeM` na wierszu typu broni — ten sam wzorzec, co flagi ran krytycznych z 14e
- **Licencja:** prawdziwe liczby (6k6, wiersz PT Granatnika, 25 m) to treść podręcznika, więc
  idą do `data/private/`; w repo stoi wymyślony `weapon-type.sample-grenade`
