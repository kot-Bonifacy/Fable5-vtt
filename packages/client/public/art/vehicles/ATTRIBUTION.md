# Atrybucja grafik pojazdów

## Modele aut (etap 67, od 06.11.2026) — grafiki MG

Grafiki własne MG projektu (źródła poza repo: `C:/AI/materialy/auta`), dostarczone 06.11.2026
(auta, potem furgony i motocykle)
do zakupu aut przez graczy. Przetwarza je `tools/art/vehicle-models.py`: wycina namalowaną
szachownicę przezroczystości, obraca przodem do góry, przycina i zapisuje jako WebP (dłuższy bok
384 px). Każda grafika to jeden model z `data/public/cpred/vehicle-models.json`.

| Plik                   | Źródło MG                  | Model                      |
| ---------------------- | -------------------------- | -------------------------- |
| `kagero.webp`          | `auto1.png`                | Arasaka „Kagerō”           |
| `widmo.webp`           | `auto11.png`               | „Widmo”                    |
| `rajdowka-77.webp`     | `auto2.png`                | „Rajdówka 77”              |
| `nocny-neon.webp`      | `auto4.png`                | „Nocny Neon”               |
| `bastion.webp`         | `auto12.png`               | „Bastion” (SUV pancerny)   |
| `ranczer.webp`         | `auto5_ładny_pinckup.png`  | „Ranczer” (pickup)         |
| `rdzawiec.webp`        | `auto9_stary_pickup.png`   | „Rdzawiec” (stary pickup)  |
| `wloczega.webp`        | `auto10_stare_kombi.png`   | „Włóczęga” (stare kombi)   |
| `taksowka.webp`        | `auto6_taxi.png`           | Taksówka (MG)              |
| `radiowoz.webp`        | `auto8_policja.png`        | Radiowóz (MG)              |
| `karetka.webp`         | `auto7_karetka.png`        | Karetka (MG)               |
| `militech-furgon.webp` | `auto3_militech.png`       | Militech — furgon (MG)     |
| `graty.webp`           | `furgon1.png`              | „Graty” (furgon)           |
| `nomada.webp`          | `furgon2.png`              | „Nomada” (kamper)          |
| `zadlo.webp`           | `motocykl1.png`            | „Żądło” (motocykl)         |
| `osa.webp`             | `motocykl2.png`            | „Osa” (motocykl)           |

## Paczka CC0 (etap 65b) — przeszkody pościgu i sceny sprzed etapu 67

Auta widziane z góry, przodem do góry — tak rysuje je scena pościgu (`ChaseLayer`), obracając
obrazek do kierunku jazdy. Wbudowane grafiki (`/art/vehicles/`) gracz może dać własnemu pojazdowi
bez MG (`isVehicleArtUrl`).

Źródło: [Free Top Down Car Sprites](https://opengameart.org/node/33247) — Unlucky Studio,
OpenGameArt.org, licencja [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) („free to
use in your personal and commercial projects. Credits are not necessary but very much
appreciated”). Z paczki `Topdown_vehicle_sprites_pack_Unluckystudio.zip` przycięte przezroczyste
marginesy i zapisane jako WebP; ciągnik siodłowy i klatki animacji pominięte.

| Plik                   | Plik w paczce     | Co to                 |
| ---------------------- | ----------------- | --------------------- |
| `car-red.webp`         | `Audi.png`        | czerwone auto sportowe |
| `car-black-viper.webp` | `Black_viper.png` | czarne, pomarańczowe pasy |
| `car-orange.webp`      | `Car.png`         | pomarańczowy muscle car |
| `car-taxi.webp`        | `taxi.png`        | taksówka              |
| `car-police.webp`      | `Police.png`      | radiowóz              |
| `pickup-blue.webp`     | `Mini_truck.png`  | niebieski pickup      |
| `van-ambulance.webp`   | `Ambulance.png`   | karetka               |
| `van-white.webp`       | `Mini_van.png`    | biały furgon          |

Motocykla z wolną licencją w tym stylu nie znaleziono (30.10.2026); od 06.11 motocykl bez własnej
grafiki dostaje „Żądło” MG.
