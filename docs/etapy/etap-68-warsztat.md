# Etap 68 — Warsztat: ulepszenia kupionego auta i naprawa za eurodolary

**Faza:** przed betą (zlecenie MG z 06.11 spoza planu) · **Wymaga etapów:** 67 (zakup auta),
65a i 65d (ulepszenia pojazdu, broń pokładowa), 46a i 02.11 (handlarz, asortyment z kompendium)

## Skąd ten etap

MG (06.11): „sprawdzić możliwość montażu karabinu pokładowego i innych akcesoriów do auta
i wcześniej kupno jakiegoś auta”.

Stan przed etapem: kupno auta działało (etap 67), ale ulepszenia (19 pozycji z s. 163–165,
w tym Pokładowy karabin maszynowy) zakładał tylko MG w oknie pojazdu („Zamontuj”, za darmo)
albo Nomada w Taborze za poziom Moto. Ulepszenia nie miały ceny, nie było ich w żadnym
sklepie, a naprawy auta za ed nie było wcale (MG zmieniał PUK ręcznie).

Podręcznik, s. 163: „Poniższe ulepszenia bardzo rzadko pojawiają się w sprzedaży; te opisane
przy Poziomie Moto 1 są Bardzo kosztowne, a pozostałe są Luksusowe”. Naprawa pojazdów (s. 147)
podaje tylko PT i czas: lekkie uszkodzenia PT 9, 3 godziny; poważne PT 13, 1 dzień; zniszczony
PT 17, 1 tydzień. Ceny naprawy podręcznik nie daje.

## Decyzje MG z 06.11 (pytania na starcie)

1. **Zakres:** dorobić zakup ulepszeń przez gracza (nie tylko sprawdzić).
2. **Gdzie:** jak auta — Kompendium (poziomy sklepu, „Zakupy z katalogu: tylko u handlarzy”)
   oraz handlarz.
3. **Cena:** z podręcznika × 3 — Moto 1: 1000 × 3 = **3000 ed**, reszta: 5000 × 3 = **15 000 ed**.
4. **Montaż:** od razu po zakupie, z regułami montażu podręcznika.
5. **Poziom sklepu:** Moto 1 → 3 (Wojskowe), reszta → 4 (Czarny rynek).
6. **Handlarz:** osobna kategoria asortymentu „Ulepszenia pojazdów” (domyślnie „nie prowadzi”).
7. **Tabor:** ulepszenia kupuje się tylko do własnych aut spoza Taboru Rodziny.
8. **Inne akcesoria:** tylko ulepszenia z podręcznika, a do tego **naprawa auta za ed**.
9. **Naprawa:** 50 ed za brakujący PUK kadłuba, szyby w cenie; od razu (czas tylko w opisie);
   wyłącznie u handlarza-warsztatu; wrak też.

## Zakres ✅

- [x] `shared`: kategoria Kompendium `vehicleUpgrade` („Ulepszenia pojazdów”,
      `VehicleUpgradeEntry` z `upgradeId`, walidacja, poza `COMPENDIUM_ITEM_CATEGORIES`).
- [x] `systems/cpred/vehicle-upgrade-shop.ts`: wpisy z `CPRED_VEHICLE_UPGRADES`
      (`vehicle-upgrade.<id>`, cena pasma × 3, poziom 3/4), `withVehicleUpgradeEntries`
      (w `loadCompendium` po cenniku domowym), `cpredVehicleUpgradeBuyProblem`
      (Tabor + reguły montażu), naprawa `cpredVehicleRepairQuote` / `cpredVehicleRepaired`,
      stopień uszkodzeń `cpredVehicleDamage`.
- [x] Asortyment: kategoria `vehicleUpgrade` w `CPRED_ASSORTMENT_OPT_IN`,
      `cpredAssortmentVehicleUpgrades`, `cpredMerchantRepairsVehicles`;
      `MerchantView.vehicleUpgrades` i `repairsVehicles`.
- [x] Serwer: `vehicle:upgrade-buy` (Kompendium albo lada) i `vehicle:repair` (tylko lada)
      w `realtime/vehicle-shop.ts`, wspólna zapłata `payAtCounter` z `vehicle:buy`; lada
      `requireVehicleCounter` zna ulepszenia i `'repair'`; biała lista między sesjami.
      Układ i bryła po Ulepszeniu foteli — wspólne `vehicleSeatColumns` z oknem MG.
- [x] Klient: `VehicleWorkshop.tsx` — „Kup i zamontuj — N ed” z „Na pewno?” na karcie wpisu
      Kompendium (postać + auto), warsztat w oknie „Wymiana” pod salonem (wybór auta,
      naprawa, ulepszenia), pole „Ulepszenie” w Edytorze Kompendium, podpowiedź w sekcji
      „Sklep” MG.
- [x] Testy: `shared` (`vehicle-upgrade-shop.test.ts`), serwer (`vehicles.test.ts` › „etap 68”).

## Rozstrzygnięcia bez pytań (06.11)

1. **Ulepszenie to wpis kompendium, nie lista w kodzie** — dzięki temu działają poziomy
   sklepu, nadpisanie poziomu przez MG, asortyment handlarza i własny wpis MG o tym samym id
   (inna cena, „używany karabin”). Mechanikę daje zawsze `upgradeId`.
2. **Same szyby kosztują jak jeden PUK (50 ed)** — inaczej naprawa całego kadłuba z rozbitą
   szybą byłaby darmowa.
3. **Stopień uszkodzeń** (do opisu na czacie): PUK 0 — zniszczony, połowa PUK albo mniej —
   poważne, reszta — lekkie.
4. **Naprawa auta z Taboru jest dozwolona** — „zwykłe naprawy należą do obowiązków Nomady”
   (s. 162); zakaz Taboru dotyczy tylko ulepszeń.
5. **Targ Fixera i mnożnik ceny handlarza** działają na ulepszenia i naprawę jak na auto;
   zapłata trafia do kasy handlarza.
6. **Demontażu przez gracza nie ma** — zdejmuje MG w oknie pojazdu, bez zwrotu.
7. **Magazynek nowej broni pokładowej jest pełny** (brak wpisu w `mountAmmo`), naboje dalej
   bez dna.

## Kryteria ukończenia

- [x] Gracz kupuje Pokładowy karabin maszynowy do swojego auta z Kompendium (poziom 3) i strzela
      z niego kierowca (broń pokładowa z 65d2 — bez zmian) — test serwera.
- [x] Reguły montażu jak w oknie MG (Wzmocniona konstrukcja, „tylko raz”, fotele), odmowa
      dla auta z Taboru i cudzego auta — test serwera.
- [x] Warsztat handlarza: osobna kategoria, cena z mnożnikiem, naprawa 50 ed/PUK, wrak — test serwera.
- [x] Oględziny w przeglądarce (Firefox gracza, Chromium MG, 06.11): Kompendium → „Kup
      i zamontuj”, warsztat u handlarza, naprawa — notatka sesji w `POSTEP.md`. Przy stole czeka
      na MG.
