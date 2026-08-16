# Etap 26e — Demony

**Faza:** H — Świat CP RED · **Wymaga etapów:** 26d, 14 (inicjatywa), 16b (profil statysty)

> Piąta z sześciu części podziału etapu 26 (patrz nagłówek `etap-26a-siec-dane-architektura.md`).
> Wydzielona z 26d 15.08 (decyzja MG). **Zwężona 16.08** (decyzja MG): samodzielne systemy
> obronne i broniona strefa jako obiekt sceny wyprowadziły się do nowego **26f**, bo to inna
> warstwa (mapa, nie Sieć) i osobny model danych — efekty systemów środowiskowych są dziś
> w kompendium wyłącznie prozą.

## Cel sesji

Architektura zaczyna się bronić sama: Demon w niej siedzi, wie o wszystkim, trzyma wszystkie
węzły kontrolne swojej Architektury, obraca je przeciw drużynie na mapie i broni się przed
netrunnerem Testem Interfejsu, a nie OBR-em.

## Zakres

- [x] **Demony** (Diablik, Ifryt, Balron — już w kompendium od 26a) jako uczestnik runu: REZ,
      Interfejs, Akcje Sieciowe, Wartość bojowa; bronią się **Testem Interfejsu** (nie mają OBR),
      nie mają PRĘ ani PER, więc nie dają darmowego ataku i nie da się od nich uciec Ślizgiem;
      hasła ich nie blokują; wchodzą na czoło Kolejki Inicjatywy przy wykryciu intruza
- [x] **Demon trzyma wszystkie węzły swojej Architektury od startu** (decyzja MG z 16.08) —
      netrunner musi mu każdy odebrać Kontrolą; PT odebrania to PT pięter, dopóki Demon sam nie
      rzuci Testu Kontroli, a potem wynik tego Testu
- [x] **Tura Demona jednym klikiem MG** (decyzja MG z 16.08) — silnik sam wybiera cele: najpierw
      odbiera węzły, które trzyma netrunner, potem strzela z wieżyczek trzymanych węzłów, a
      resztą Akcji Sieciowych Pafa netrunnera (s. 212). Karta obrażeń ma „Cofnij", więc pomyłka
      jest odwracalna
- [x] **Wieżyczka Demona strzela jego Wartością bojową** — ta sama ścieżka `performAttackRoll`
      co w 26d, tylko podstawiony inny arkusz („Test Wartości bojowej + 1k10", s. 214)
- [x] **Przyciski MG przy Demonie** obok tych od Czarnego LOD-a z 26c: „Demon wykrywa intruza"
      (bez testu spornego — Demon nie ma PRĘ) i „Tura Demona"
- [x] **Jeden Demon na sześć pięter** (s. 218) jako uwaga edytora, nie odmowa zapisu

## Poza zakresem

- **Samodzielne stanowiska obronne** („Test Wartości bojowej + 1k10" bez niczyjej ręki, „nie mogą
  unikać ataków") i **standardowa aktywacja** — etap **26f**
- **Broniona strefa jako obiekt sceny** i efekty systemów środowiskowych (podłoga elektryczna,
  panele ogłuszające, winda z gazem) — etap **26f**
- Kupno architektury i systemów obronnych za eurodolce (s. 217–218) — POMYSLY.md
- Wrogi netrunner jako przeciwnik w Sieci — nie ma go w planie żadnego etapu

## Kryteria ukończenia

- [x] Demon broniący architektury w swojej Turze obsługuje węzeł (wieżyczka strzela do drużyny
      na mapie), a resztą Akcji Sieciowych używa Pafa przeciw netrunnerowi
- [x] Netrunner atakujący Demona trafia na obronę **Testem Interfejsu**, a nie na OBR; Ślizg
      przed Demonem odmawia po polsku
- [x] Odebranie węzła Demonowi wymaga przebicia PT równego wynikowi jego Testu Kontroli, a Demon
      w swojej Turze odbiera węzeł netrunnerowi tym samym rachunkiem
- [x] Demon wchodzi do Kolejki Inicjatywy na czoło i wychodzi z niej razem z runem
- [x] Testy: Wartość bojowa, plan tury Demona i przejęcie/odbicie węzła w `shared`; pełna wymiana
      Demon ↔ netrunner na żywych gniazdach serwera

## Wskazówki techniczne

- **Demon to nie Czarny LOD z inną tabelką** — ma inny zestaw pól (Wartość bojowa zamiast
  ATK/OBR, brak PRĘ i PER) i inny algorytm tury (najpierw węzły, Paf z resztek). Trzymaj go jako
  osobny typ, nawet jeśli oba są „Programami" w rozumieniu podręcznika.
- **Demon żyje w stanie runu, tak jak Czarny LOD z 26c.** „Odłączenie resetuje obronę danej
  Architektury Sieciowej" (s. 198) dotyczy go tak samo, a dwa runy przeciw temu samemu budynkowi
  nie mogą bić się o jeden obiekt. Widoczny dla netrunnera dopiero wtedy, gdy zacznie go ścigać —
  wcześniej jest w payloadzie wyłącznie u MG.
- **Demon obsługuje dokładnie te same urządzenia co netrunner z 26d.** Jedyna różnica jest
  w tym, czyimi liczbami rzuca: netrunner swoimi Umiejętnościami, Demon Wartością bojową. To jeden
  parametr wejścia, nie druga ścieżka — `combatProfileOperatedBy` dostaje brata
  `combatProfileWithCombatValue`, którego 26f użyje dla stanowisk obronnych.
- **Plan tury jest czystą funkcją.** Serwer tylko wykonuje listę kroków, którą policzył `shared`
  — inaczej „najpierw węzły, Paf z resztek" nie da się przetestować bez bazy.
- **Migracji nie ma.** Demon mieści się w kolumnie JSON runu, a wiersz trackera bez figury
  istnieje od 26c; `Combatant.netIceId` niesie od tego etapu id **uczestnika Sieci** — Czarnego
  LOD-a albo Demona.
