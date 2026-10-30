# Atrybucja grafik pojazdów (etap 65b)

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

Motocykla z wolną licencją w tym stylu nie znaleziono (30.10.2026) — motocykl rysuje się bryłą
zastępczą z `ChaseLayer`, a MG może wgrać własną grafikę.
