# Etap 26c — Demony, węzły kontrolne i systemy obronne

**Faza:** H — Świat CP RED · **Wymaga etapów:** 26b, 05 (tokeny), 16 (ataki)

> Trzecia z trzech części podziału etapu 26 (patrz nagłówek `etap-26a-siec-dane-architektura.md`).

## Cel sesji

Sieć zaczyna sięgać do prawdziwego świata: przejęty węzeł kontrolny obraca kamerę, wyłącza
wieżyczkę albo otwiera drzwi na mapie, a Demon strzela do drużyny, podczas gdy netrunner
próbuje mu ten węzeł odebrać.

## Zakres

- [ ] **Demony** (Diablik, Ifryt, Balron) — REZ, Interfejs, Akcje Sieciowe, Wartość bojowa;
      bronią się Testem Interfejsu (nie mają OBR), nie mają PRĘ ani PER, więc nie dają
      darmowego ataku i nie da się od nich uciec Ślizgiem; hasła ich nie blokują; wchodzą
      na czoło Kolejki Inicjatywy przy wykryciu intruza
- [ ] **Węzeł kontrolny → rzecz na mapie** — przejęty węzeł (Kontrola z 26b) daje netrunnerowi
      listę podłączonych urządzeń, każde obsługiwane osobną Akcją Sieciową, raz na Turę;
      PT odebrania węzła równe wynikowi Testu, którym go przejęto
- [ ] **Trzy tabele systemów obronnych** (s. 212–216) jako dane: aktywne (drony), stanowiska
      (wieżyczka, automatyczna broń biała, krwawy rój), środowiskowe (kamera, podłoga
      elektryczna, siatka laserowa, panele ogłuszające, winda z gazem…) — z PT unieszkodliwienia
      Elektroniką i zabezpieczeniami, PW, warunkiem aktywacji
- [ ] **Systemy obronne w walce** — wieżyczka i dron jako figury na mapie strzelające przez
      silnik z etapu 16 (Wartość bojowa + 1k10), efekty środowiskowe przez ścieżkę obszarową
      z 16d; pod kontrolą netrunnera rzucają jego Umiejętnościami
- [ ] **Podgląd MG** — pełna architektura z pozycją netrunnera, ręczne sterowanie Czarnym
      LOD-em i Demonem (RAW: „LOD-y zawsze kontroluje MG")

## Poza zakresem

- Kupno architektury i systemów obronnych za eurodolce (s. 217–218) — POMYSLY.md
- Pełna symulacja dronów jako pojazdów (RUCH, latanie nad ścianami) — dron dostaje żeton
  i profil bojowy, nie własną fizykę

## Kryteria ukończenia

- [ ] Netrunner przejmuje węzeł kontrolny kamery i obraca ją tak, że drużyna przestaje być
      widziana; przejmuje wieżyczkę i strzela nią do wroga własną Umiejętnością
- [ ] Demon broniący architektury w swojej Turze obsługuje węzeł (wieżyczka strzela do
      drużyny na mapie), a resztą Akcji Sieciowych używa Pafa przeciw netrunnerowi
- [ ] Odebranie węzła Demonowi wymaga przebicia PT równego jego Testowi Kontroli
- [ ] Testy: Wartość bojowa, przejęcie i odbicie węzła w `shared`; pełna wymiana Demon ↔
      netrunner na żywych gniazdach serwera

## Wskazówki techniczne

- **Demon to nie Czarny LOD z inną tabelką** — ma inny zestaw pól (Wartość bojowa zamiast
  ATK/OBR, brak PRĘ i PER) i inny algorytm tury (najpierw węzły, Paf z resztek). Trzymaj je
  jako osobny typ, nawet jeśli oba są „Programami" w rozumieniu podręcznika.
- **Węzeł kontrolny jest mostem między dwoma stanami** — architekturą (26a) i sceną (etap 04).
  Podłączone urządzenie wskazuj identyfikatorem żetonu albo drzwi z 18d, nie kopią danych.
