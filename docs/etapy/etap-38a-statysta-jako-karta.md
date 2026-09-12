# Etap 38a — Statysta jako karta postaci

**Faza:** H — Świat CP RED · **Wymaga etapów:** 16b (profil bojowy), 30c (Wsparcie), 26e (Demony)

> **Pochodzenie:** decyzja MG z 05.09.2026 przy rozstrzyganiu etapu 38. Na pytanie „gdzie mieszka
> łup statysty" MG odpowiedział: **statysta dostaje pełną kartę postaci** — czyli odwrotnie, niż
> proponował opis etapu 38 i niż rozstrzygnął etap 16b. Rozdzielenie etapu 38 na 38a i 38b jest
> tego następstwem: przekazywanie przedmiotów wymaga jednego modelu ekwipunku, a ten może
> powstać dopiero po tym refaktorze.

## Cel sesji

Dziś figura bez karty trzyma swoje liczby w `Token.combatProfile` — nieprzezroczystym JSON-ie,
który `combatProfileSheet()` przebiera za `CpredCharacterData` w chwili rzutu. Umowa z 16b brzmi:
„statysta nie jest osobą, nie ma właściciela, portretu, okna karty, i ginie razem z żetonem".

Etap ją **cofa**: każda figura, którą ktoś ostatystykował, ma prawdziwy rekord `Character`.
Znika kolumna `Token.combatProfile`, znika gałąź `kind: 'statist'` w ścieżce ataku, a ekwipunek
gangera jest tym samym ekwipunkiem, co ekwipunek Vex — co jest **jedynym powodem**, dla którego
etap 38b da się w ogóle napisać.

## Czego karta postaci nie umiała, a profil umiał

Rozpoznanie z 05.09 przed pierwszą linijką kodu. Profil bojowy **nie jest** chudszą kartą — niesie
trzy rzeczy, których `CpredCharacterData` nie potrafi wyrazić:

1. **Wartość bojowa** (`skillLevel`, `evasion`) — „Umiejętność bazowa używana do ataku i obrony.
   Reprezentuje sumę Cechy i Umiejętności funkcjonariusza" (s. 158). Jedna liczba, w której Cecha
   już siedzi, i sięgająca 16 (C-SWAT). Umiejętność na karcie ma sufit 10, a Cecha dokłada się na
   wierzchu — zapis wprost dałby Cechę policzoną dwa razy albo ścięcie do 10 (błąd z 31.08).
2. **`noBulletDodge`** — „Funkcjonariusze Wsparcia nie mogą Unikać pocisków" (s. 158). Zero
   w Uniku tego nie załatwia, bo `attack:evade` kupuje 1k10 także za zero.
3. **Wydrukowane PW** — C-SWAT ma PW 35 przy BC 4, a `hpMax(stats)` policzyłoby 20.
   `normalizeCharacterData` ścięłoby funkcjonariuszowi piętnaście punktów przy pierwszym zapisie.

Dlatego karta dostaje **jedno** nowe pole: `CpredCharacterData.statBlock`, czyli „wydrukowany blok
statystyk" — `{ combatValue, noBulletDodge, hpMax }`, `null` na karcie postaci. To nie jest
kategoria w rosterze (MG odrzucił znacznik `Character.statist`) tylko trzy liczby z podręcznika:
nazwanemu NPC-owi też wolno mieć Wartość bojową.

## Rozstrzygnięcia MG (05.09)

- **Bez znacznika w bazie.** Ganger stoi na liście postaci obok Vex. Żadnej kolumny
  `Character.statist`, żadnej osobnej sekcji w panelu.
- **Karta ginie razem z figurą.** Bez znacznika nie ma po czym poznać, którą — więc jest to
  **pytanie, nie automat**: skasowanie figury podpiętej pod kartę **bez właściciela**, która nie
  stoi na żadnej innej scenie, pyta „usunąć też kartę «Ganger»?" (domyślnie tak). Karta gracza
  nigdy nie dostaje tego pytania.
- **Szybki edytor zostaje.** Sześć pól w menu figury (REF/ZW/BC/SW, poziom broni, Unik, OB, broń,
  magazynek) pisze odtąd do karty, a przy pierwszym zapisie **tworzy ją i podpina**. Szybkość była
  całym powodem etapu 16b i nie wolno jej stracić.

## Zakres

- [x] `CpredCharacterData.statBlock` (`{ combatValue, noBulletDodge, hpMax }` | `null`) —
      walidacja w `collectCharacterDataPatch`, wartość w `createDefaultCharacterData`
- [x] `cpredSheetHpMax(data)` — maksimum PW karty; czyta `statBlock.hpMax`, inaczej `hpMax(stats)`.
      **Od tego etapu `hpMax(data.stats)` na pełnej karcie jest błędem**, tak jak `data.stats[...]`
      od etapu 39
- [x] `cpredSheetRollSheet(data, skillId)` — karta z Wartością bojową podstawioną pod rzut
      (Cechy do zera, Umiejętność = `combatValue`); zastępuje `combatProfileSheetForSkill`
- [x] `createStatistSheet(spec)` w `statist.ts` — karta figury z sześciu liczb szybkiego edytora
- [x] `statistQuickStats(data)` / `applyStatistQuickStats(data, patch)` — rzut karty na sześć pól
      edytora i z powrotem; poziom broni ląduje pod Umiejętnością, którą ta broń strzela
- [x] Migracja Prismy: dla każdego `Token.combatProfile != null` powstaje `Character`
      (kampania sceny, `ownerId` null, PW z żetonu), `token.characterId` wskazuje na nią,
      kolumna znika
- [x] `createStatistToken` (Wsparcie z 30c) tworzy kartę zamiast profilu
- [x] Ścieżka ataku traci gałąź `kind: 'statist'` — `buildAttackSource` ma jedno ramię
- [x] `token:delete` przyjmuje `deleteCharacter?: boolean`; klient pyta wg reguły wyżej
- [x] Klient: `hud.ts`, `attack-targeting.ts`, `FigureInjuries`, `AttackControls`,
      `AttackLauncher`, `rollStore` czytają kartę zamiast profilu
- [x] Eksport/import i kopie zapasowe (33) bez kolumny profilu
- [x] Testy: Wartość bojowa nie ścina się do 10, wydrukowane PW przeżywa zapis karty,
      Wsparcie nie unika pocisków, migracja zachowuje amunicję i rany, kasowanie figury
      nie rusza karty gracza

## Poza zakresem

- **Przekazywanie przedmiotów i łup** — to jest etap 38b, cały sens tego refaktoru
- **Osobna sekcja „Statyści" w liście postaci** — MG odrzucił 05.09
- **Kreator statysty z kompendium** („postaw dziesięciu gangerów Arasaki") — do `POMYSLY.md`

## Kryteria ukończenia

- [x] Figura ostatystykowana w menu żetonu ma kartę w panelu postaci i otwiera się jak każda inna
- [x] Wsparcie wezwane Zdolnością Stróża Prawa przychodzi z Wartością bojową 14, PW 35 i nie
      unika pocisków — tak samo jak przed refaktorem
- [x] Demon i wieżyczka strzelają Wartością bojową, a rozbicie rzutu nadal czyta się uczciwie
      („Broń długa 14", bez Cechy)
- [x] Istniejąca scena „Strzelnica" po migracji strzela tak samo: ta sama amunicja, te same rany
- [x] Skasowanie gangera pyta o kartę; skasowanie figury gracza nie pyta o nic
- [x] `Token.combatProfile` nie istnieje w schemacie ani w kodzie

## Jak wyszło (05.09.2026)

Zrobione w całości; testy 1906 / 1024 / 97 zielone. Cztery rzeczy poza planem:

- **`statBlock` niesie czwartą liczbę — `weaponSkill`.** Plan zakładał, że poziom broni wejdzie
  pod prawdziwe id Umiejętności. Nie wszedł: id trzeba by rozwiązywać przez kompendium przy
  każdym zapisie **i w migracji SQL**, a kompendium mieszka w plikach `data/private/`, nie
  w bazie. Podręcznik zresztą drukuje NPC-a dokładnie tak: „Broń: karabin szturmowy, umiejętność 13".
- **`CPRED_SHEET_STAT_MIN = 0`.** Figura z Wartością bojową ma wyzerowane Cechy, a walidator
  karty odrzucał wtedy całą ich mapę. `CPRED_STAT_MIN` zostaje jedynką i pilnuje jej kreator.
- **Kopia figury MG dostaje własną kartę**, a karta jedzie też do właściciela **figury** —
  bez tych dwóch refaktor po cichu zabrałby zachowanie, które działało od 16b i 35.
- **Wartość bojowa jest teraz polem edytora.** Do 38a nie dało się jej wpisać ręką: Umiejętność 14
  dawała REF **plus** czternaście, czyli Cechę policzoną dwa razy.

Menu figury **nie było oglądane w przeglądarce** (pozycja w `zaleglosci.md`) — trzy ścieżki
stoją na testach dymnych na żywych gniazdach.
