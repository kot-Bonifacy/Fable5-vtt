# Etap 27h — Panel postaci: HUD, który wygląda jak gra

**Faza:** I — Wykończenie · **Wymaga etapów:** 16f (lewy pasek), 27e (motyw)

> **Dopisany 2026-08-20** na wniosek MG: „lewy panel wygląda bardzo generycznie, jak arkusz
> kalkulacyjny". Razem z `etap-27i-mapa-walka-efekty.md` zastępuje wpis „przeprojektowanie
> układu paneli" z sekcji „Poza zakresem" etapu 27f.

## Cel sesji

Lewy pasek przestaje być listą jednakowych prostokątów. Po tej sesji gracz widzi **kogo gra**
(portret, PW, pancerz, RUCH, statusy z nazwami), **czym gra** (broń jako kafel z ikoną, trybem
ognia i widocznym magazynkiem) i **co się właśnie stało** (ubytek PW z animacją, baner tury).

## Decyzja MG (2026-08-20)

Kierunek wizualny: **struktura jak Argon Combat HUD z Foundry** (portret z paskiem PW, sekcje
akcji, kafle z ikonami) **plus cienka warstwa cyberpunku** — ścięty róg, wąski neonowy akcent
na uzbrojonym slocie, monospace wyłącznie na liczbach. Odrzucone: pełny diegetyczny „ekran
wszczepu" (nie do utrzymania w motywie dziennym) i czysty Foundry bez klimatu.

## Zakres

- [x] **Karta tożsamości** — portret ~4 rem w ramce, obok nazwa i rola z rejestru (Solo,
      Netrunner…). Pod spodem trzy liczby, których dziś w panelu nie ma: **SP** pancerza
      (`effectiveArmorSp`, ciało i głowa), **RUCH** po karach ran (`effectiveMove`) i **EMP**
      bieżące (`empFromHumanity`). Statysta bez karty bierze je z `combatProfile` (`armorSp`),
      token bez jednego i drugiego pokazuje samo PW
- [x] **Pasek PW z odczytem stanu ran** — zostaje kolor stanu z etapu 15, dochodzi próg
      poważnej rany zaznaczony na torze i animacja zmiany (ubytek podświetla pasek i wypuszcza
      liczbę „−12”)
- [x] **Statusy jako kapsułki z nazwą** — dziś to ikony 0,95 rem bez podpisu; nazwa jest
      wyłącznie w `title`. Nazwa ma być widoczna, a waga statusu (rana, blokada akcji) czytelna
      kolorem
- [x] **Sekcje „BROŃ” i „AKCJE”** — dziś dziewięć identycznych wierszy; broń, przeładowanie
      i akcja katalogowa mają być trzema różnymi rzeczami na pierwszy rzut oka
- [x] **Jedna broń = jeden kafel** (dopisane 20.08 po uwadze MG) — tryby ognia schodzą do
      rozwijanej szuflady pod kaflem, wzorem Argona; przeładowanie przenosi się do „AKCJI”,
      bo jest Akcją, a nie bronią. Klawisze 1–9 numerują odtąd **bronie**, `Shift`+cyfra
      przewija tryb
- [x] **Ikony slotów** — typ broni (pistolet, rewolwer, SMG, karabin, strzelba, snajperka, łuk,
      broń biała, pięści, granat, ciężka) i akcje (apteczka, chwyt, klepsydra, wstanie, bieg)
      jako SVG z game-icons (CC BY 3.0) w `public/icons/hud/`, z atrybucją w `ATTRIBUTION.md`.
      Typ broni wybierany z danych kompendium, nie z nazwy
- [x] **Magazynek jako wskaźnik, nie tekst** — „30/30” zostaje liczbą, ale obok pojawia się
      rządek naboi (do progu, powyżej pasek), żeby „zaraz się skończy” dało się zobaczyć bez
      czytania
- [x] **Budżet tury na wierzchu** — Akcja i Ruch jako wyraźne wskaźniki, metry z podziałką,
      a nie rząd kropek wielkości kropki. Gdy to tura tej figury — baner „TWOJA TURA”
- [x] **Stan pusty i podgląd** — zdania z 16f zostają, ale dostają formę (ikona + tekst),
      a nie akapit `0,68 rem`
- [x] **Zwinięty pasek** — dziś 1,6 rem strzałki; ma zostawać czytelnym paskiem z portretem
      i PW, żeby zwinięcie nie znaczyło „nie wiem nic o swojej postaci”

## Poza zakresem

- Cokolwiek na mapie — tokeny, efekty walki i ruch to etap 27i
- Nowe reguły i nowe akcje; sloty dalej pochodzą z `hotbarSlotsFor` w `shared`
- Przeprojektowanie prawego panelu (czat, zakładki) i górnego paska

## Jak wyszło (2026-08-20)

- **Jedna broń = jeden kafel** (decyzja MG z 20.08, po pierwszej wersji panelu). Pistolet
  maszynowy dawał trzy wiersze i zjadał trzy z dziewięciu klawiszy; teraz tryby są w szufladzie
  pod kaflem, a wybrany tryb pamięta się per broń do końca sesji (`hudStore.fireModes`, nigdy
  `localStorage`). Płaska lista `hotbarSlotsFor` **została nietknięta**, bo czyta ją też tura
  bota (`bot-combat.ts`), gdzie „broń · tryb" jako jeden wybór jest zaletą; panel dostał
  `cpredHotbarGroups` — czystą funkcję w `shared`, z testami.
- Ikona slotu jest decyzją **reguł, nie komponentu**: `cpredWeaponIcon` w `shared` czyta typ
  broni z kompendium (`ResolvedWeapon.typeId`, dołożony w tym etapie), potem umiejętność, a na
  końcu to, co broń *robi*. Panel dostaje nazwę rzeczy (`CpredSlotIcon`) i rysuje plik.
- Waga statusu też jest w `shared` (`cpredStatusSeverity`) i wywodzi się z tabeli efektów.
  **Wyjątkiem są stany ran** — nie mają wiersza w tabeli, bo ich kary liczy się z PW, więc
  „Śmiertelnie ranny" wychodził szary jak „Onieśmielony". Nazwane wprost, z testem.
- Zwinięty pasek urósł z 1,6 rem do 2,6 rem i niesie portret z pionowym paskiem PW.
- 30 nowych ikon w `packages/client/public/icons/hud/` (game-icons, CC BY 3.0), rysowanych
  **maską CSS** — jeden plik barwi się kolorem tekstu kafla zamiast czterech kopii.

## Kryteria ukończenia

- Panel odpowiada bez klikania na trzy pytania: kim jestem, czym strzelam, ile mi zostało
- Broń, przeładowanie i akcja różnią się wyglądem, a nie tylko treścią napisu
- Ubytek PW jest widoczny w panelu w chwili, w której się dzieje
- `pnpm --filter @vtt/client test` przechodzi, w tym `theme.test.ts` (żadnego literału koloru
  poza `theme.css`)
- Oba motywy sprawdzone na żywej scenie: gracz i MG, figura z kartą i statysta

Wszystkie spełnione 2026-08-20 — poza stroną gracza, sprawdzoną z konta MG (patrz notatka
sesji w `POSTEP.md`).
