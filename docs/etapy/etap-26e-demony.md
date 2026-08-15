# Etap 26e — Demony i samodzielne systemy obronne

**Faza:** H — Świat CP RED · **Wymaga etapów:** 26d, 14 (inicjatywa), 16d (obszary)

> Piąta z pięciu części podziału etapu 26 (patrz nagłówek `etap-26a-siec-dane-architektura.md`).
> Wydzielona z 26d 15.08 (decyzja MG) — patrz nagłówek `etap-26d-wezly-systemy-obronne.md`.

## Cel sesji

Architektura zaczyna się bronić sama: Demon siedzi w niej, wie o wszystkim, obsługuje węzły
kontrolne przeciw drużynie i broni się przed netrunnerem Testem Interfejsu — a stanowiska obronne
strzelają Wartością bojową nawet wtedy, gdy nikt ich nie kontroluje.

## Zakres

- [ ] **Demony** (Diablik, Ifryt, Balron) — REZ, Interfejs, Akcje Sieciowe, Wartość bojowa;
      bronią się Testem Interfejsu (nie mają OBR), nie mają PRĘ ani PER, więc nie dają darmowego
      ataku i nie da się od nich uciec Ślizgiem; hasła ich nie blokują; wchodzą na czoło Kolejki
      Inicjatywy przy wykryciu intruza
- [ ] **Tura Demona** — najpierw Akcje Sieciowe na obsługę węzłów kontrolnych (wieżyczka strzeli
      do drużyny na mapie Wartością bojową Demona), Paf dopiero z resztek (s. 212)
- [ ] **Odebranie węzła Demonowi** — PT równe wynikowi jego Testu Kontroli, w obie strony
- [ ] **Samodzielne stanowiska obronne** — „w czasie samodzielnego działania określają skuteczność
      działań, wykonując Test Wartości bojowej + 1k10" i „nie mogą unikać ataków" (s. 214)
- [ ] **Standardowa aktywacja i broniona strefa** — obszar na scenie, po wejściu na który system
      środowiskowy odpala się sam; efekty przez ścieżkę obszarową z 16d i wymuszony test z 16h
      (podłoga elektryczna 6k6 co Turę, panele ogłuszające, winda z gazem usypiającym z własnym
      miejscem w Kolejce Inicjatywy)
- [ ] **Podgląd MG** — ręczne sterowanie Demonem obok przycisków Czarnego LOD-a z 26c
- [ ] **Jeden Demon na sześć pięter** (s. 218) jako uwaga edytora, nie odmowa zapisu

## Poza zakresem

- Kupno architektury i systemów obronnych za eurodolce (s. 217–218) — POMYSLY.md
- Pełna symulacja dronów jako pojazdów (RUCH, latanie nad ścianami)

## Kryteria ukończenia

- [ ] Demon broniący architektury w swojej Turze obsługuje węzeł (wieżyczka strzela do drużyny
      na mapie), a resztą Akcji Sieciowych używa Pafa przeciw netrunnerowi
- [ ] Netrunner atakujący Demona trafia na obronę **Testem Interfejsu**, a nie na OBR; Ślizg
      przed Demonem odmawia po polsku
- [ ] Odebranie węzła Demonowi wymaga przebicia PT równego jego Testowi Kontroli
- [ ] Figura, która wchodzi na strefę bronioną przez podłogę elektryczną, dostaje 6k6 kartą
      obrażeń z „Cofnij"
- [ ] Testy: Wartość bojowa, tura Demona i przejęcie/odbicie węzła w `shared`; pełna wymiana
      Demon ↔ netrunner na żywych gniazdach serwera

## Wskazówki techniczne

- **Demon to nie Czarny LOD z inną tabelką** — ma inny zestaw pól (Wartość bojowa zamiast
  ATK/OBR, brak PRĘ i PER) i inny algorytm tury (najpierw węzły, Paf z resztek). Trzymaj je jako
  osobny typ, nawet jeśli oba są „Programami" w rozumieniu podręcznika.
- **Demon obsługuje dokładnie te same urządzenia co netrunner z 26d.** Jedyna różnica jest
  w tym, czyimi liczbami rzuca: netrunner swoimi Umiejętnościami, Demon Wartością bojową. To jeden
  parametr wejścia, nie druga ścieżka.
- **Broniona strefa jest obiektem sceny wzorem osłon z 16c i dymu z 16h**, nie polem na wpisie
  kompendium: ten sam typ systemu (kamera, podłoga) stoi w kilku miejscach tego samego budynku.
