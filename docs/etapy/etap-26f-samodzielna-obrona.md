# Etap 26f — Samodzielne systemy obronne i broniona strefa

**Faza:** H — Świat CP RED · **Wymaga etapów:** 26e, 16c (osłony jako obiekty sceny), 16d
(obszary), 16h (wymuszony test), 14e (efekty na koniec tury)

> Szósta z sześciu części podziału etapu 26 (patrz nagłówek `etap-26a-siec-dane-architektura.md`).
> Wydzielona z 26e 16.08 (decyzja MG): Demon jest walką w Sieci, a broniona strefa to obiekt
> sceny z własnym modelem efektu, narzędziem na mapie i hakiem w ruchu żetonu.

## Cel sesji

Systemy obronne przestają wymagać czyjejkolwiek ręki: broniony obszar leży na mapie, figura,
która na niego wejdzie, dostaje 6k6 albo Test Atletyki, a stanowisko obronne strzela własną
Wartością bojową, gdy nikt go nie kontroluje.

## Zakres

- [ ] **Efekt systemu obronnego jako dane** — dziś w kompendium jest wyłącznie proza („zadaje
      6k6 obrażeń ciału", „udany Test Atletyki o PT 15 lub Przewróci się", „RUCH −2k6"). Model
      wzorem `CpredNetProgramEffects` z 26c i efektów amunicji z 16g: kości obrażeń, wymuszony
      test z PT i skutkiem porażki, kara do RUCH-u, status, powtarzalność co Turę. Parser
      `parse-netrunning.py` wypełnia, co da się wyłuskać; resztę dopisuje MG formularzem
- [ ] **Broniona strefa jako obiekt sceny** — prostokąt wzorem osłon z 16c i dymu z 16h, wiązany
      z wpisem kompendium i (opcjonalnie) z węzłem kontrolnym Architektury. Ten sam typ systemu
      stoi w kilku miejscach budynku, więc strefa jest obiektem sceny, a nie polem wpisu
- [ ] **Standardowa aktywacja** — figura wchodzi na strefę i system odpala się sam, warunkiem
      z kolumny „Standardowa aktywacja"; efekt idzie ścieżką obszarową z 16d i wymuszonym testem
      z 16h, a karta obrażeń ma „Cofnij"
- [ ] **Podłoga elektryczna 6k6 co Turę** — powtórka na koniec kolejnej Tury, dopóki figura stoi
      na obszarze (automat z 14e)
- [ ] **Winda z gazem z własnym miejscem w Kolejce Inicjatywy** — wiersz trackera bez figury,
      możliwy od 26c
- [ ] **Samodzielne stanowiska obronne** — „w czasie samodzielnego działania określają skuteczność
      działań, wykonując Test Wartości bojowej + 1k10" i „nie mogą unikać ataków" (s. 214);
      `combatProfileWithCombatValue` z 26e wchodzi tu bez zmian
- [ ] **Percepcja PT 17, by zauważyć** — strefa systemu środowiskowego jest dla gracza niewidoczna,
      dopóki jej nie zauważy; widok filtrowany na serwerze, nie ukrywany w CSS

## Poza zakresem

- Kupno architektury i systemów obronnych za eurodolce (s. 217–218) — POMYSLY.md
- Pełna symulacja dronów jako pojazdów (RUCH, latanie nad ścianami)
- Stożek widzenia kamery liczony geometrią z 18a — wpis w POMYSLY.md od 26d

## Kryteria ukończenia

- [ ] Figura, która wchodzi na strefę bronioną przez podłogę elektryczną, dostaje 6k6 kartą
      obrażeń z „Cofnij", a na koniec swojej kolejnej Tury dostaje je jeszcze raz
- [ ] Ślizgawka wymusza Test Atletyki PT 15 i przewraca tego, kto go nie zda
- [ ] Stanowisko obronne bez niczyjej ręki strzela Testem Wartości bojowej + 1k10 i nie unika
      ataków wymierzonych w nie
- [ ] Gracz nie dostaje w payloadzie strefy, której jego figura nie zauważyła
- [ ] Testy: model efektu i wyzwalanie w `shared`; wejście na strefę i strzał stanowiska na
      żywych gniazdach serwera

## Wskazówki techniczne

- **Broniona strefa jest obiektem sceny wzorem osłon z 16c i dymu z 16h**, nie polem na wpisie
  kompendium: ten sam typ systemu (kamera, podłoga) stoi w kilku miejscach tego samego budynku.
- **Wyzwalanie wisi na tym samym haku co awaryjne odłączenie z 26c** — `tokens.ts` woła je po
  każdym upuszczeniu figury. Nie dokładaj drugiego miejsca, w którym „figura się przesunęła".
- **Nie pisz drugiej ścieżki obrażeń.** 6k6 w ciało to zwykła karta obrażeń z 15, wymuszony test
  to `applyForcedFailureToSheet` z 16h, a kara do RUCH-u to status z danymi z 14e.
