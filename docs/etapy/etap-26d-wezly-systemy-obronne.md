# Etap 26d — Węzły kontrolne i systemy obronne

**Faza:** H — Świat CP RED · **Wymaga etapów:** 26c, 16 (ataki), 16b (profil statysty), 18d (drzwi)

> Czwarta z pięciu części podziału etapu 26 (patrz nagłówek `etap-26a-siec-dane-architektura.md`).
> Przenumerowana z 26c na 26d 15.08, gdy etap 26b został podzielony na 26b i 26c.
> **Podzielona na 26d i 26e 15.08** (decyzja MG): pierwotny zakres niósł naraz nowy typ
> uczestnika (Demon z własną turą i obroną), most między Architekturą a sceną, trzy tabele
> danych z s. 212–216 i figury strzelające na mapie — czyli tyle, ile 26b i 26c razem.
> Demony i samodzielne wyzwalanie systemów wyprowadziły się do **26e**.

## Cel sesji

Sieć zaczyna sięgać do prawdziwego świata: przejęty węzeł kontrolny obraca kamerę tak,
że drużyna przestaje być widziana, otwiera drzwi na mapie albo strzela wieżyczką — a wieżyczka
rzuca Umiejętnościami netrunnera, który ją przejął, dokładnie tym samym silnikiem, co każdy inny
strzelec.

## Zakres

- [x] **Trzy tabele systemów obronnych** (s. 212–216) jako dane kompendium: aktywne (rój dronów,
      dron naziemny, drony latające, pajęczy), stanowiska (automatyczna wieżyczka, automatyczna
      broń biała, krwawy rój), środowiskowe (kamera obserwacyjna, podłoga elektryczna, podłoga
      obalająca, siatka laserowa, zapadnia, maź, ślizgawka, dziurkacze, panele ogłuszające, winda
      z gazem) — z PT unieszkodliwienia Elektroniką i zabezpieczeniami i czasem na nie, PW, RUCH-em,
      Wartością bojową, PT zauważenia i warunkiem aktywacji
- [x] **Węzeł kontrolny dostaje listę urządzeń** w edytorze Architektury MG: nazwa, rodzaj, wpis
      kompendium i wiązanie z **żetonem** sceny albo z **drzwiami z 18d** — identyfikatorem, nie
      kopią danych
- [x] **Obsługa urządzenia po przejęciu węzła** (Kontrola z 26b): każda rzecz osobną Akcją
      Sieciową, a sam węzeł można aktywować **raz na Turę**; przed przejęciem gracz nie dostaje
      w payloadzie nawet listy urządzeń
- [x] **Cztery rodzaje obsługi**: włącz/wyłącz, „obróć kamerę", otwórz/zamknij drzwi (18d)
      i **atak z wieżyczki albo drona** — przez silnik z etapu 16, Umiejętnościami netrunnera
      („rzucając na Umiejętności tego Netrunnera, tak jakby ten strzelał z trzymanych w rękach
      broni", s. 213)
- [x] **PT odebrania węzła** równe wynikowi Testu, którym go przejęto — także wtedy, gdy trzyma go
      drugi netrunner; udane odebranie zdejmuje węzeł poprzedniemu właścicielowi
- [x] **Stan urządzenia przeżywa odłączenie** (runtime Architektury, jak Wirus z 26b), a kontrola
      nad węzłem nie — „gdy odłączasz się od Architektury, tracisz kontrolę nad wszystkimi
      węzłami" (s. 199)

## Poza zakresem

- **Demony** — cały typ, jego tura i obrona Testem Interfejsu: etap **26e**
- **Samodzielne wyzwalanie systemów obronnych** („Standardowa aktywacja") i broniona strefa jako
  obiekt sceny, przez który przechodzi figura: etap **26e**. W 26d urządzenie środowiskowe ma
  przełącznik i kartę z opisem efektu; kogo ten efekt dosięgnie, rozstrzyga MG — tak samo jak dwa
  ręczne haki z 26c
- Kupno architektury i systemów obronnych za eurodolce (s. 217–218) — POMYSLY.md
- Pełna symulacja dronów jako pojazdów (RUCH, latanie nad ścianami) — dron dostaje żeton
  i profil bojowy z 16b, nie własną fizykę

## Kryteria ukończenia

- [x] Netrunner przejmuje węzeł kontrolny kamery i obraca ją; czat mówi, że kamera przestała
      patrzeć na broniony obszar, a stan przeżywa odłączenie
- [x] Netrunner przejmuje wieżyczkę i strzela nią do wroga **własną Umiejętnością** — pocisk leci
      silnikiem z 16 (zasięg, PT, osłona, linia strzału, amunicja, karta obrażeń z „Cofnij")
- [x] Drugi Test Kontroli tego samego węzła idzie przeciw PT równemu wynikowi pierwszego, a jego
      powodzenie zdejmuje węzeł poprzedniemu netrunnerowi
- [x] Węzeł aktywowany w tej Turze odmawia drugiej obsługi po polsku
- [x] Testy: rodzaje obsługi, „raz na Turę" i odczyt stanu urządzeń w `shared`; przejęcie, odbicie
      węzła i strzał z wieżyczki na żywych gniazdach serwera

## Wskazówki techniczne

- **Węzeł kontrolny jest mostem między dwoma stanami** — architekturą (26a) i sceną (etap 04).
  Podłączone urządzenie wskazuj identyfikatorem żetonu albo drzwi z 18d, nie kopią danych.
- **Wieżyczka to żeton z profilem statysty z 16b** (decyzja MG z 15.08), nie nowy byt sceny.
  Dzięki temu strzela dokładnie tym samym `performAttackRoll`, co każdy inny wróg, i działa przy
  niej osłona, linia strzału, amunicja i karta obrażeń. Umiejętności podmienia się **na wejściu**
  do budowy arkusza statysty, nie w planerze — silnik nie może mieć gałęzi „strzela wieżyczka".
- **Stan urządzenia idzie do `NetArchitecture.runtime`, nie do runu.** Kamera wyłączona przez
  netrunnera zostaje wyłączona po jego odłączeniu, bo to zmiana w prawdziwym świecie — ta sama
  półka, na której 26b trzyma Wirusa i PT Maskowania. Do runu trafia wyłącznie „który węzeł był
  aktywowany w której Rundzie".
- **„Raz na Turę" dotyczy węzła, nie urządzenia.** Podręcznik mówi obie rzeczy w dwóch zdaniach
  („osobna Akcja Sieciowa na każdą z tych rzeczy" i „dany węzeł kontrolny można aktywować tylko
  raz na Turę"), a licznik siedzi przy piętrze.
