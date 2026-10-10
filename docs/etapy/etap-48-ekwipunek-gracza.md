# Etap 48 — Ekwipunek gracza: skąd przybywają rzeczy

**Faza:** przed betą (zlecenie MG z 10.10 spoza planu, przed refaktoryzacją) · **Wymaga etapów:**
23b (eurodolce, Poziom życia), 25c (kreator: zakupy), 26a (cyberdek), 30c (Praca Zespołowa),
43a (pas inicjatywy), 47 (cennik domowy)

## Skąd ten etap

MG (10.10), cztery uwagi naraz:

1. Kreator ma przypominać o zakupach „podobnym komunikatem jak inne elementy tworzenia postaci”,
   żeby gracz nie stworzył postaci i nie zapomniał jej wyposażyć.
2. Cyberdeki może mieć każdy za darmo — wprowadzić ograniczenia.
3. Zweryfikować zakładkę „Ekwipunek” (np. lepsze opcje zakwaterowania za darmo).
4. Portrety w pasku inicjatywy są źle skadrowane — mają być jak baner w lewej belce gracza,
   tylko z większą częścią dolną portretu.

**Przegląd zakładki „Ekwipunek” (10.10)** — co gracz dziś robi za darmo, bo serwer mu nie
zabrania (`character:update` przepuszcza łatę):

| luka                                                                                  | gdzie                                    | sesja  |
| ------------------------------------------------------------------------------------- | ---------------------------------------- | ------ |
| Zakwaterowanie korporacyjne (konap, dom, McPosiadłość — czynsz 0 ed) wybiera każdy    | `LifestyleFields`, `HOUSING_DEFINITIONS` | 48a    |
| „— nie rozliczam —” w Poziomie życia — gracz wypisuje się z rachunku miesięcznego     | `LifestyleFields`                        | 48a    |
| Cyberdek z całego kompendium za darmo; Programy (z cenami od 47a) wkładane za darmo   | `CyberdeckSection`                       | 48b    |
| Liczba gniazd deku ustawiana przez gracza                                             | `CyberdeckSection`                       | 48b    |
| Ilość każdego wiersza poza amunicją podnoszona ręką (np. dawki Farmaceutyków)         | `GearTab` → `RowTable`                   | 48c    |
| Poza zakładką: „+ Broń z katalogu”, „+ Pancerz” z dowolnym PT, „+ Dodatek” — za darmo | strona pierwsza karty                    | 48c    |
| Cena zakupu mieszkania (`purchase`) nie jest nigdzie używana                          | `HOUSING_DEFINITIONS`                    | pomysł |

## Decyzje MG z 10.10

1. **Trzy sesje:** 48a → 48b → 48c.
2. **Przypomnienie o zakupach to brak w podsumowaniu** — wpis na liście braków z plakietką na
   kroku „Wyposażenie” i „Przejdź”. Blokuje „Utwórz postać”, dopóki gracz czegoś nie kupi albo
   nie zaznaczy „Ruszam bez zakupów”.
3. **Zakwaterowanie korporacyjne wg rangi Pracy Zespołowej** (s. 153): konap od rangi 2, dom
   w Bobrowisku od 7, McPosiadłość albo apartament na szczycie wieżowca bez czynszu od 10.
   Pozostałym graczom tych opcji nie ma; MG ustawia wszystko. Serwer pilnuje tego samego.
4. **Cyberdek i Programy jako towar** — dek podpina się tylko z wiersza Wyposażenia (kupiony,
   z łupu, od MG, z pakietu Roli — kreator podpina go sam). Programy kupuje się jak sprzęt
   i wkłada z Wyposażenia; wyjęte wracają do Wyposażenia. Liczbę gniazd zmienia tylko MG.
   Istniejące deki zostają.

## Zakres

### 48a — przypomnienie o zakupach, kadr portretów, Zakwaterowanie (✅ 10.10)

- [x] Kreator: brak „nic nie kupiono” (koszyk pusty, brak zaznaczenia „Ruszam bez zakupów”);
      pole szkicu, walidacja w `creationIssues` (serwer odmawia tym samym), zaznaczenie w kroku
      „Wyposażenie”; NPC MG bez tego braku
- [x] Pas inicjatywy: portret z kadrem banera (`usePortraitFrameStyle`, ramka kwadratowa)
- [x] Zakwaterowanie: `cpredHousingAllowed` w `shared` (ranga Pracy Zespołowej), lista na karcie
      tylko z dozwolonych (plus bieżąca), odmowa serwera dla gracza; apartament bez czynszu dla
      Korpo od rangi 10
- [x] „— nie rozliczam —” tylko u MG (lista gracza bez tej opcji, odmowa serwera)
- [x] Testy `shared` i serwera; oględziny w Firefoksie

### 48b — cyberdek i Programy jako towar (✅ 10.10)

- [x] Program kupowany jak sprzęt (`purchasedSheetRow` zna Programy → wiersz Wyposażenia)
- [x] Podpięcie deku z wiersza Wyposażenia i odpięcie z powrotem; Program i Ulepszenie
      Sprzętowe wkładane z Wyposażenia i wyjmowane do niego — osobne zdarzenie serwera,
      `cyberdeck` wypada z `character:update` u gracza
- [x] Liczba gniazd tylko u MG
- [x] Kreator podpina dek z pakietu Roli albo z koszyka przy „Utwórz postać”
- [x] Wyjaśnienie w `decyzje-i-uproszczenia.md` (wpis z 17.09 o darmowych Programach nieaktualny),
      pomysł z `POMYSLY.md` (17.09) odhaczony
- [x] Testy, E2E Netrunnera (T3a Iskra, T5a/T5b), oględziny

### 48c — skąd przybywają rzeczy na karcie gracza

Decyzja do podjęcia na starcie sesji (rekomendacja): rzeczy z mechaniką przybywają graczowi
**tylko** z zakupu, wymiany, łupu, kreatora i od MG; gracz zmienia nazwę i uwagi, wyrzuca,
zużywa. Wolne wiersze tekstowe w Wyposażeniu (bez wpisu z katalogu) zostają.

- [ ] Ilość wiersza z wpisem z katalogu tylko maleje u gracza (uogólnienie `AMMO_LOCKED`)
- [ ] „+ Broń z katalogu” i wiązanie wiersza z katalogiem, „+ Pancerz”, „+ Dodatek” — u gracza
      wg decyzji; serwer pilnuje tego samego
- [ ] Testy, łańcuch E2E tam, gdzie gracz dziś dopisuje rzeczy ręką, oględziny

## Kryteria ukończenia

- Kreator nie pozwala utworzyć postaci gracza bez zakupów ani świadomej rezygnacji z nich.
- Portrety w pasku inicjatywy mają kadr banera.
- Zakwaterowanie korporacyjne i wypisanie z rozliczenia nie są dostępne graczowi poza zasadami.
- Cyberdek i Programy nie biorą się znikąd; liczba gniazd u MG.
- Rzeczy z mechaniką nie przybywają graczowi poza zakupem, wymianą, łupem, kreatorem i MG.
- Testy jednostkowe, serwera, lint, `tsc` czyste; E2E zielone; oględziny w Firefoksie.

## Wykonanie 48a (10.10.2026)

Kryteria 48a spełnione. Ustalenia w trakcie:

- **Przypomnienie dotyczy tylko szkicu gracza** (`requirePurchases`) — MG robiący NPC-a nie
  odhacza „Ruszam bez zakupów”. Brak siedzi w grupie „Wyposażenie”, plakietka na kroku i „Przejdź”
  jak przy innych brakach; zaznaczenie pole pokazuje tylko przy pustym koszyku.
- **Apartament od Korporacji to osobna opcja** (`corpoPenthouse`, czynsz 0, ranga 10) — zwykły
  „Luksusowy apartament” kosztuje 15 000 ed czynszu, a Praca Zespołowa 10 daje go zamiast
  McPosiadłości.
- **Zakwaterowanie, które karta już ma, zostaje** — serwer odmawia tylko przeprowadzki poza rangę,
  więc Korpo po zmianie Roli nie traci konapu sam; to decyzja MG przy stole.
- **Pas inicjatywy:** kadr z `usePortraitFrameStyle(url, 1)` — ten sam co baner lewej belki, ale
  w kwadracie, więc widać więcej dołu portretu. Portret wysoki (443 × 887) pokazuje twarz zamiast
  piersi.
- Nowy pomysł: kupno mieszkania (`purchase` w `HOUSING_DEFINITIONS` nieużywane) — `POMYSLY.md`.

## Decyzje MG z 10.10 (start 48b)

1. **Programy startowe Netrunnera — stały zestaw gratis** w pakiecie Roli Kompletnego Pakietu:
   Pancerz, Miecz, Mam cię!, Mózgoklep, Robak (pakiet Krawędziarza, s. 103 — z każdego „lub”
   opcja inna niż Miecz). Kreator wkłada je do deku (5/7 gniazd).
2. **Odpięty dek wraca do Wyposażenia razem z zawartością** — każdy Program i Ulepszenie osobnym
   wierszem; dek w plecaku nie pamięta, co w nim siedziało.
3. **MG też przez Wyposażenie** — na karcie nie ma już list deków i Programów z kompendium; MG
   daje je „Dodaj za darmo” i podpina jak gracz.
4. **Kreator wkłada Programy, ile wejdzie** — z pakietu i z koszyka; nadmiar zostaje w Wyposażeniu.

## Wykonanie 48b (10.10.2026)

Kryteria 48b spełnione. Ustalenia w trakcie:

- **Logika w `shared/systems/cpred/cyberdeck.ts`**, serwer w `realtime/deck.ts`
  (`character:deck`: `plug`, `unplug`, `install`, `remove`, `slots`). Łata `cyberdeck` gracza →
  `FORBIDDEN`; MG zostaje furtka sędziego (testy serwera zakładają deki łatą MG), choć jego UI też
  idzie przez Wyposażenie. Przepięcie deku w trakcie runu → `NET_RUN_ACTIVE`; Programy w runie
  wkłada się i wyjmuje jak dotąd.
- **Narzędzia Roli Netrunnera w kreatorze** (`shop-tiers.json`, poza repo) dostały boostery
  i defensory (poziom 2: Gumka, Mam cię!, Szybki bil, Robak, Pancerz, Powłoka, Tarcza) — inaczej
  nowa półka „Programy” byłaby u niego pusta. Agresory (poziom 3) i Czarny LOD (4) zostają poza
  kreatorem. Próbka w `data/public` dostała to samo na wymyślonych wpisach.
- **Sekcja „Cyberdek”** pokazuje się, gdy dek jest podpięty, leży w Wyposażeniu albo postać ma
  Interfejs — reszta stołu nie ma już pustej listy na każdej karcie.
- **E2E:** T3a — kreator podpina Iskrze dek z pięcioma Programami, MG daje Tarczę z Kompendium,
  Iskra wkłada ją z Wyposażenia (6/7, jak dotąd), łata deku → `FORBIDDEN`. Iskra ma od teraz
  Mózgoklep zamiast Piekielnego Pocisku; T5a/T5b grają Mieczem, więc bez zmian.
- Pomysł z oględzin: podpięty dek w łupie i w handlu (`POMYSLY.md`).

