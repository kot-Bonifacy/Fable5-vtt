# Etap 67 — Zakup pojazdu przez gracza

**Faza:** przed betą (zlecenie MG z 06.11 spoza planu) · **Wymaga etapów:** 65a (pojazd jako
własność postaci), 46a i 02.11 (handlarz, asortyment z kompendium), 47a (cennik domowy)

## Skąd ten etap

MG (06.11): „dodaj (jeśli jeszcze nie ma) możliwość kupna auta przez gracza. tu
C:\AI\materialy\auta masz gotowe grafiki aut i jeżeli masz dodaj mi 2 propozycje innych aut do
których mogę dostarczyć ci grafiki”.

Stan przed etapem: kupna nie było. Od 65a pojazd na kartę dawał wyłącznie MG (katalog
z podręcznika, s. 190–191: trzy klasy aut, motocykle, łodzie, aerodyny), a zakup odłożono do
`POMYSLY.md` (30.10). Wbudowane grafiki to 8 aut z paczki CC0 w innym, prostszym stylu.

Grafiki MG: 12 aut z góry, przodem w lewo, ~700 × 330 px; w siedmiu szachownica
przezroczystości namalowana w pikselach.

## Decyzje MG z 06.11 (pytania na starcie)

1. **Gdzie:** jak resztę rzeczy — Kompendium → „Pojazdy” → „Kup” (z przełącznikiem „Zakupy
   z katalogu: tylko u handlarzy” i poziomami sklepu) oraz u handlarza z kategorią „Pojazdy”.
2. **Co:** konkretne modele — każda grafika to model ze stałą klasą, nazwą i ceną; wygląd jest
   modelem, gracz zmienia tylko nazwę.
3. **Logotypy** (Arasaka, Militech, „Night City”): do repo jak są.
4. **Stare auta CC0:** nowe zastępują je w galerii i jako domyślne; stare pliki zostają dla
   przeszkód pościgu i zapisanych scen.
5. **Tabela modeli** zatwierdzona (niżej).
6. **Sprzedaż auta:** nie w tym etapie (→ `POMYSLY.md`).

| Grafika | Model                     | Klasa         | Fotele | Cena      | Gracz |
| ------- | ------------------------- | ------------- | ------ | --------- | ----- |
| 1       | Arasaka „Kagerō”          | Supersamochód | 2      | 30 000 ed | tak   |
| 11      | „Widmo”                   | Supersamochód | 2      | 30 000 ed | tak   |
| 2       | „Rajdówka 77”             | Sportowy      | 4      | 15 000 ed | tak   |
| 4       | „Nocny Neon”              | Sportowy      | 4      | 15 000 ed | tak   |
| 12      | „Bastion” (SUV pancerny)  | Kompaktowy    | 6      | 13 500 ed | tak   |
| 5       | „Ranczer” (pickup)        | Kompaktowy    | 4      | 10 000 ed | tak   |
| 9       | „Rdzawiec” (stary pickup) | Kompaktowy    | 4      | 6 300 ed  | tak   |
| 10      | „Włóczęga” (stare kombi)  | Kompaktowy    | 4      | 6 300 ed  | tak   |
| 6       | Taksówka                  | Kompaktowy    | 4      | —         | MG    |
| 8       | Radiowóz                  | Sportowy      | 4      | —         | MG    |
| 7       | Karetka                   | Kompaktowy    | 6¹     | —         | MG    |
| 3       | Militech — furgon         | Kompaktowy    | 6¹     | —         | MG    |

## Zakres ✅

- [x] `tools/art/vehicle-models.py` → `public/art/vehicles/<model>.webp` (12 plików, ~26 KB):
      szachownica zalewana od krawędzi do czarnego konturu (białe auta zachowują dach), obrót
      przodem do góry, przycięcie, dłuższy bok 384 px. `ATTRIBUTION.md` z tabelą źródeł.
- [x] `data/public/cpred/vehicle-models.json` + `systems/cpred/vehicle-models.ts`: model to wpis
      kompendium `VehicleEntry` z `art`, `classId`, `forSale`; liczby (rodzaj, PUK, Ruch,
      km/h, Tabor) z klasy, fotele, cena i poziom z modelu. Ładuje `loadCompendium` po cenniku
      domowym (public, potem private wygrywa po id).
- [x] `vehicle:buy` (`realtime/vehicle-shop.ts`): z Kompendium albo u lady handlarza; gotówka,
      targ Fixera, kasa handlarza i nowy `Vehicle` (nazwa i wygląd modelu, właściciel — karta)
      w jednej transakcji; karta czatu ekonomii. Działa też między sesjami (biała lista).
- [x] Asortyment: kategoria „Pojazdy” (`vehicle`) — **bez osobnego poziomu handlarz jej nie
      prowadzi** (`CPRED_ASSORTMENT_OPT_IN`). `MerchantView.vehicles` — salon pod półką.
- [x] `vehicle:rename`: gracz nie zmienia wyglądu auta z modelu (`VEHICLE_LOOK_LOCKED`); MG tak.
- [x] Klient: oferta auta `VehicleOffer` (miniatura bokiem, „Kup — N ed”, drugie kliknięcie
      „Na pewno?”) w karcie wpisu Kompendium i w salonie okna „Wymiana”; galeria grafik bez służb
      u gracza; MG w sekcji „Sklep” ustawia „Pojazdy” (domyślnie „nie prowadzi”).
- [x] `VEHICLE_ART` = grafiki MG (`gmOnly` dla służb), `VEHICLE_ART_LEGACY` = paczka CC0,
      `defaultVehicleArt` → „Włóczęga” (auto), stary biały furgon (`van-8`).
- [x] Modele w Taborze Rodziny: model na sprzedaż ma próg Moto swojej klasy, a pojazd z Taboru
      dostaje jego wygląd (`prepareFleet`). Służby do Taboru nie wchodzą.
- [x] Testy: `shared` (`vehicle-models.test.ts`), serwer (`vehicles.test.ts` › „etap 67”,
      izolacja kampanii, strażnik licencji pliku modeli).

## Rozstrzygnięcia bez pytań (06.11)

1. **Plik modeli nie nazywa wpisów katalogu.** Model podaje klasę słowem (`compact` / `sport`
   / `super`), id klas stoją w kodzie (`CPRED_VEHICLE_CLASS_IDS`, jak `CPRED_FLEET_COMPACT_ID`)
   z wymyśloną klasą próbki na drugim miejscu — świeży klon też ma salon. Pilnuje tego
   `licensing.test.ts`.
2. **Poziomy dostępności modeli:** kompakty, pickupy i kombi 1 (Uliczne), sportowe i Bastion 2,
   supersamochody 4 (luksus). Bez tego cena podręcznika (> 1000 ed) wrzucała każde auto na
   „Czarny rynek”. MG zmienia poziom wpisu w Kompendium.
3. **Kupuje się tylko model na sprzedaż z wyglądem** (`cpredVehicleForSale`). Klasa z podręcznika
   i własny wpis MG bez `art` zostają do dania przez MG.
4. **Cena u lady** to cena katalogu × mnożnik handlarza (jak wiersz półki), **targ Fixera** schodzi
   z zakupu auta jak z każdego innego, a **zapłata ląduje w kasie handlarza**, chyba że „bez dna”.
5. **Auto nie idzie przez koszyk** — pojazd to `Vehicle`, nie wiersz karty, więc salon ma własne
   „Kup” pod kolumnami okna. Jedno zdarzenie `vehicle:buy` dla obu dróg.
6. **Potwierdzenie drugim kliknięciem** (gaśnie po 5 s) — auto to kilka miesięcy czynszu.
7. **Domyślna grafika auta bez własnej** to „Włóczęga” (furgon i motocykl — druga dostawa niżej).

## Druga dostawa MG (06.11): furgony i motocykle

Propozycje z pierwszej rozmowy (motocykl, cywilny furgon) MG dostarczył tego samego dnia:
`furgon1.png`, `furgon2.png`, `motocykl1.png`, `motocykl2.png` (prawdziwa przezroczystość).
**Decyzja MG:** oba motocykle zwykłe (klasa Motocykl), nie Supermotocykl.

| Grafika   | Model              | Klasa      | Fotele | Cena      | Poziom |
| --------- | ------------------ | ---------- | ------ | --------- | ------ |
| furgon1   | „Graty” (furgon)   | Kompaktowy | 6¹     | 9 000 ed  | 1      |
| furgon2   | „Nomada” (kamper)  | Kompaktowy | 6¹     | 12 000 ed | 1      |
| motocykl1 | „Żądło” (motocykl) | Motocykl   | 2      | 6 000 ed  | 1      |
| motocykl2 | „Osa” (motocykl)   | Motocykl   | 2      | 6 000 ed  | 1      |

Klasa modelu `bike` (`CPRED_VEHICLE_CLASS_IDS`: Motocykl, w próbce skuter). Domyślne grafiki:
motocykl bez własnej — „Żądło” (koniec bryły zastępczej na pościgu), furgon `van-8` — „Graty”
(zamiast białego furgonu CC0). Oglądane w Firefoksie na scenie pościgu (Autostrada).

¹ Do 06.11 (trzecia sesja) 8 foteli. MG: furgony mają 6 miejsc w trzech rzędach za kabiną —
model z `"van": true` ma bryłę furgonu (`van-6`) także przy sześciu fotelach (umowa na górze
`mapa`).

## Kryteria ukończenia

- [x] Gracz kupuje auto z Kompendium (z bramkami poziomu i „tylko u handlarzy”) — test serwera.
- [x] Gracz kupuje auto u handlarza z kategorią „Pojazdy” po cenie z mnożnikiem — test serwera.
- [x] Kupione auto ma wygląd i nazwę modelu, liczby klasy i stoi w „Pojazdach” karty.
- [x] Oględziny w przeglądarce (Firefox i Chromium, 06.11): Kompendium → „Kup”, salon u handlarza, karta pojazdu
      — notatka sesji w `POSTEP.md`. Przy stole czeka na MG.
