# Etap 16h — Amunicja bez obrażeń: testy, gaz i dym

**Faza:** D — Walka · **Wymaga etapów:** 16g (amunicja jako dane, wybór naboju), 16d (obszar), 18c (widoczność), 14e (statusy i DoT)

## Cel sesji

Druga połowa tabeli amunicji: naboje, które **nie zadają obrażeń**. Zamiast rzutu na
obrażenia wymuszają test celu, a porażka daje obrażenia bezpośrednie, status albo ranę
krytyczną na minutę. Po tym etapie walka dystansowa CP RED jest kompletna.

**Pochodzenie:** wydzielony z etapu 16g 2026-08-07 (decyzja MG). 16g objął naboje, które
kończą się zwykłym rozliczeniem trafienia; tutaj zostały te, które potrzebują nowego
mechanizmu: **wymuszonego testu na karcie ataku** i **efektu na minutę**.

## Zakres

- [ ] **Wymuszony test celu jako mechanizm** — flaga `resistanceCheck` na wpisie amunicji
      (umiejętność, PT, skutek porażki), rozliczana jak testy ognia zaporowego z etapu 16
      (`RollForcedCheck`), ale z efektem: obrażenia bezpośrednie, status albo rana krytyczna.
      Jeden mechanizm, siedem wierszy danych — nie siedem gałęzi w kodzie
- [ ] **Efekt „na minutę”** — rana krytyczna albo status z czasem życia. Do dziś wszystko, co
      VTT nakłada, trwa do odwołania (`expiresAtTurnEnd` z 14e to jedyny wyjątek); tutaj
      potrzebny jest licznik rund albo znacznik „zdejmij po minucie” z monitem u MG
- [ ] **Typy z podręcznika (s. 345–347)**:
  - **biotoksyczna** — Odporność na tortury/narkotyki PT 15, porażka: 3k6 bezpośrednich
    (bez pancerza, pancerz się nie zużywa; tylko cele biologiczne)
  - **zatruta** — to samo, PT 13, 2k6 bezpośrednich
  - **usypiająca** — PT 13, porażka: Powalony + Nieprzytomny na minutę; cel budzi się od
    obrażeń albo od cudzej Akcji
  - **łzawiąca** — PT 13, porażka: rana krytyczna „Uraz oka” na minutę, bez obrażeń dodatkowych
  - **hukbłyskowa** — PT 15, porażka: „Uraz ucha” **i** „Uraz oka” na minutę, bez obrażeń
    dodatkowych
  - **EMP** — Test Cyberinżynierii PT 15, MG wybiera dwie cyborgizacje/urządzenia celu do
    wyłączenia na minutę (wyłączona cyberkończyna zachowuje się jak odcięta)
  - **inteligentna** — wymaga cyborgizacji Celownik optyczny; pudło o ≤ 4 daje drugi rzut
    1k10 + 10 (+ Szczęście) przeciw temu samemu PT; cel mogący Unikać dalej może Unikać
  - **dymna** — zasnuwa kwadrat 10 m × 10 m, −4 do działań w dymie
- [ ] **Dym jako obiekt sceny** — obszar, który widać na mapie i który dokłada −4 do testów
      w nim. Do rozstrzygnięcia w sesji: czy dym **blokuje wzrok** (RAW mówi tylko o karze
      −4, nie o widoczności), czy tylko modyfikuje testy
- [ ] Testy: wymuszony test i jego porażka, efekt na minutę zdejmowany po czasie, drugi rzut
      amunicji inteligentnej, przynależność do kwadratu dymu

## Poza zakresem

- **Cyborgizacja „Celownik optyczny”** wymagana przez amunicję inteligentną — etap 23;
  do tego czasu wymóg jest ostrzeżeniem na karcie, nie odmową (decyzja z 16d)
- **Pełna mechanika trucizn** ponad wiersz amunicji — własny wpis w POMYSLY
- Rakiety jako pozycja ekwipunku poza samym typem amunicji

## Kryteria ukończenia

- Trafienie amunicją zatrutą nie oferuje rzutu na obrażenia, tylko test celu na karcie —
  a porażka testu daje 2k6 bezpośrednich, których pancerz nie zatrzymuje
- Hukbłyskowa nakłada dwie rany krytyczne bez obrażeń dodatkowych i zdejmuje je po minucie
- EMP wypisuje na karcie, które cele oblały Test Cyberinżynierii, i zostawia MG wybór dwóch
  cyborgizacji
- Amunicja inteligentna po pudle o ≤ 4 sama proponuje drugi rzut 1k10 + 10
- Granat dymny stawia na mapie kwadrat 10 × 10 m, a testy w nim mają −4

## Wskazówki techniczne

- Wymuszony test to ta sama maszyneria co ogień zaporowy (`resolveSuppression` w
  `realtime/attacks.ts`) — z tą różnicą, że wynik czegoś **dotyczy**: obrażeń, statusu albo rany
- Uwaga na wyciek z 16d: karta wymieniająca cele z nazwiska idzie przez `redactChatMessage`,
  więc lista trafionych musi być filtrowana do figur widza. Ogień zaporowy ma ten sam błąd
  **niezałatany** (patrz „Otwarte zaległości” w POSTEP) — dobre miejsce, żeby domknąć oba
- Rany „na minutę” to 6 rund po 10 s; licznik rund jest w trackerze walki, ale poza walką
  minuta nie ma czym płynąć — rozstrzygnij to jawnie w sesji
- **Licencja:** nazwy, ceny i treść wierszy amunicji to podręcznik → `data/private/`
