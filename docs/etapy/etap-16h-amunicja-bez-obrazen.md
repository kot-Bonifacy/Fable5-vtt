# Etap 16h — Amunicja bez obrażeń: testy, gaz i dym

**Faza:** D — Walka · **Wymaga etapów:** 16g (amunicja jako dane, wybór naboju), 16d (obszar), 18c (widoczność), 14e (statusy i DoT)

**Status:** ✅ ukończony 2026-08-07

## Cel sesji

Druga połowa tabeli amunicji: naboje, które **nie zadają obrażeń**. Zamiast rzutu na
obrażenia wymuszają test celu, a porażka daje obrażenia bezpośrednie, status albo ranę
krytyczną na minutę. Po tym etapie walka dystansowa CP RED jest kompletna.

**Pochodzenie:** wydzielony z etapu 16g 2026-08-07 (decyzja MG). 16g objął naboje, które
kończą się zwykłym rozliczeniem trafienia; tutaj zostały te, które potrzebują nowego
mechanizmu: **wymuszonego testu na karcie ataku** i **efektu na minutę**.

## Rozstrzygnięcia sesji (przed kodem)

Cztery pytania, na które opis etapu nie dawał odpowiedzi — decyzje MG z 07.08:

1. **Dym tylko utrudnia, nie zasłania.** RAW mówi wyłącznie o −4 do działań (s. 347) i
   milczy o widoczności, więc chmura zostaje modyfikatorem, a nie ruchomą ścianą. Wzrok,
   linia strzału i światło są nietknięte — czyli etapy 18a–18c też.
2. **Minuta płynie rundami w walce, a poza walką nie płynie.** Sześć rund po 10 s i efekt
   schodzi sam; poza starciem nie ma czego liczyć, więc efekt zostaje, a MG dostaje na
   karcie przycisk **„Minęła minuta"**. Zegar ścienny odrzucony: przy stole runda trwa
   kilka minut, więc 60 realnych sekund zdjęłoby efekt przed następną turą celu.
3. **Test wymuszony rzuca serwer**, dokładnie jak przy ogniu zaporowym z etapu 16. Granat
   trafiający pięć figur rozlicza się od razu, tak samo dla NPC, botów i gry solo.
4. **EMP kończy się na statusie.** Karta wypisuje, kto oblał Test Cyberinżynierii, na
   tokenie ląduje „EMP" na minutę, a które dwie cyborgizacje padły — mówi MG. Model
   cyborgizacji to etap 23 i nie wchodzimy w niego wcześniej.

## Zakres

- [x] **Wymuszony test celu jako mechanizm** — flaga `check` na wpisie amunicji
      (umiejętność, cecha zapasowa, PT, skutek porażki), rozliczana tą samą maszynerią co
      testy ognia zaporowego (`RollForcedCheck`), ale z efektem: obrażenia bezpośrednie,
      status albo rana krytyczna. Jeden mechanizm, sześć wierszy danych — nie sześć gałęzi
      w kodzie
- [x] **Efekt „na minutę”** — status albo rana krytyczna z licznikiem rund
      (`CpredTimedEffect` / `CpredCriticalInjuryRow.timed`). Zamiatane na granicy tury po
      **całej scenie**, nie po kolejce inicjatywy: przechodnia oślepionego gazem nikt nie
      wpisał do trackera
- [x] **Typy z podręcznika (s. 345–347)**:
  - [x] **biotoksyczna** — Odporność na tortury/narkotyki PT 15, porażka: 3k6 bezpośrednich
        (bez pancerza, pancerz się nie zużywa; „tylko cele biologiczne" jako zastrzeżenie
        na karcie — VTT nie wie, kto jest z mięsa)
  - [x] **zatruta** — to samo, PT 13, 2k6 bezpośrednich
  - [x] **usypiająca** — PT 13, porażka: Powalony + Nieprzytomny na minutę
  - [x] **łzawiąca** — PT 13, porażka: rana krytyczna „Uraz oka” na minutę, bez obrażeń
  - [x] **hukbłyskowa** — PT 15, porażka: „Uraz ucha” **i** „Uraz oka” na minutę
  - [x] **EMP** — Test Cyberinżynierii PT 15, status „EMP" na minutę (wybór cyborgizacji
        u MG — patrz rozstrzygnięcie 4)
  - [x] **inteligentna** — pudło o ≤ 4 daje drugi rzut 1k10 + 10 przeciw temu samemu PT;
        cel mogący Unikać dalej może Unikać (`attack:smart` nie zużywa Uniku). Wymóg
        Celownika optycznego to ostrzeżenie na karcie, nie odmowa
  - [x] **dymna** — zasnuwa kwadrat 10 m × 10 m, −4 do działań w dymie
- [x] **Dym jako obiekt sceny** — model `Smoke`, jedzie do **każdego** widza jak osłona,
      rysowany pod tokenami, a jego kara wchodzi do rozbicia rzutu jako nazwany wiersz
      („Dym −4"). Nie blokuje wzroku (rozstrzygnięcie 1). Czasu życia nie ma, bo RAW go nie
      podaje — rozwiewa go MG gumką przy narzędziu osłon
- [x] Testy: wymuszony test i jego porażka, efekt na minutę zdejmowany po sześciu rundach
      i ręcznie przez MG, drugi rzut amunicji inteligentnej, przynależność do kwadratu dymu

### Domknięte przy okazji (poza pierwotnym zakresem)

- [x] **Wyciek ognia zaporowego z etapu 16** — `RollForcedCheck` dostał `ownerId`, a
      `redactChatMessage` przycina listę do figur widza; z linii detalu zniknął licznik
      „w zasięgu 25 m: 4", który obchodził filtr bokiem. Pusta lista jest **usuwana**, a nie
      wysyłana jako `[]`, bo z `[]` karta czyta „nikt nie stał w zasięgu"

## Poza zakresem

- **Cyborgizacja „Celownik optyczny”** wymagana przez amunicję inteligentną — etap 23;
  do tego czasu wymóg jest ostrzeżeniem na karcie, nie odmową (decyzja z 16d)
- **Pełna mechanika trucizn** ponad wiersz amunicji — własny wpis w POMYSLY
- Rakiety jako pozycja ekwipunku poza samym typem amunicji
- Szczęście przy poprawce naboju inteligentnego (protokół gotowy, UI nie pyta) — POMYSLY

## Kryteria ukończenia

- [x] Trafienie amunicją zatrutą nie oferuje rzutu na obrażenia, tylko test celu na karcie —
      a porażka testu daje 2k6 bezpośrednich, których pancerz nie zatrzymuje
- [x] Hukbłyskowa nakłada dwie rany krytyczne bez obrażeń dodatkowych i zdejmuje je po minucie
- [x] EMP wypisuje na karcie, które cele oblały Test Cyberinżynierii, i zostawia MG wybór dwóch
      cyborgizacji
- [x] Amunicja inteligentna po pudle o ≤ 4 sama proponuje drugi rzut 1k10 + 10
- [x] Granat dymny stawia na mapie kwadrat 10 × 10 m, a testy w nim mają −4

## Wskazówki techniczne

- Wymuszony test to ta sama maszyneria co ogień zaporowy (`resolveSuppression` w
  `realtime/attacks.ts`) — z tą różnicą, że wynik czegoś **dotyczy**: obrażeń, statusu albo rany
- Uwaga na wyciek z 16d: karta wymieniająca cele z nazwiska idzie przez `redactChatMessage`,
  więc lista trafionych musi być filtrowana do figur widza. Ogień zaporowy ma ten sam błąd
  **niezałatany** (patrz „Otwarte zaległości” w POSTEP) — dobre miejsce, żeby domknąć oba
- Rany „na minutę” to 6 rund po 10 s; licznik rund jest w trackerze walki, ale poza walką
  minuta nie ma czym płynąć — rozstrzygnij to jawnie w sesji
- **Licencja:** nazwy, ceny i treść wierszy amunicji to podręcznik → `data/private/`

## Co powstało

| Warstwa      | Plik                                              | Rola                                                              |
| ------------ | ------------------------------------------------- | ----------------------------------------------------------------- |
| shared       | `systems/cpred/timed.ts`                          | minuta = 6 rund; runda wygaśnięcia albo `null` poza walką          |
| shared       | `systems/cpred/environment.ts`                    | co daje stanie w chmurze — nazwane wiersze rozbicia, kumulują się  |
| shared       | `smoke.ts` (rdzeń)                                | geometria kwadratu i „kto w nim stoi"; bez importu z `cpred`       |
| shared       | `systems/cpred/ammo.ts`                           | `check`, `smoke`, `smart`, `noDamage` + osądzenie testu            |
| serwer       | `realtime/ammo-effects.ts`                        | rzut testu, skutki porażki, karta obrażeń do cofnięcia             |
| serwer       | `realtime/timed-effects.ts`                       | zamiatanie po rundach + `effect:expire` (przycisk MG)              |
| serwer       | `realtime/smoke.ts`, `realtime/smoke-io.ts`       | stawianie chmury, `smoke:clear`, modyfikator dla rzutu             |
| klient       | `stores/smokeStore.ts`, warstwa dymu w rendererze | rysowanie kwadratu pod tokenami                                    |
| dane (prywatne) | `compendium/ammo.json`                         | 8 wierszy dostało mechanikę; zniknęły dopiski „NIE ZAUTOMATYZOWANY" |
| dane (publiczne) | `compendium/sample.json`, `statuses.json`     | 4 próbki o tym samym kształcie, status i ikona „EMP"               |
