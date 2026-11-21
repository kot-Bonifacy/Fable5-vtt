# Atrybucja grafik pojazdów

## Modele aut (etap 67, od 06.11.2026) — grafiki MG

Grafiki własne MG projektu (źródła poza repo: `C:/AI/materialy/auta`), dostarczone 06.11.2026
(auta, potem furgony i motocykle), a 10.11 supermotocykl, skuter wodny, motorówka i łódź kabinowa
do zakupu aut przez graczy. 21.11 MG podmienił wygląd `auto1`, `auto4` i `auto6` i dodał nowe `auto2`
(„Furia”); źródło „Rajdówki 77” przepadło, więc jej plik zostaje bez skryptu. Tego dnia z katalogu
zniknęła paczka CC0 z etapu 65b — grafiki aut są wyłącznie MG. Przetwarza je `tools/art/vehicle-models.py`: wycina namalowaną
szachownicę przezroczystości, obraca przodem do góry, przycina i zapisuje jako WebP (dłuższy bok
384 px). Każda grafika to jeden model z `data/public/cpred/vehicle-models.json`.

| Plik                   | Źródło MG                 | Model                        |
| ---------------------- | ------------------------- | ---------------------------- |
| `kagero.webp`          | `auto1.png`               | „Ametyst” (dawniej Kagerō)   |
| `widmo.webp`           | `auto11.png`              | „Widmo”                      |
| `rajdowka-77.webp`     | stare `auto2.png` (brak)  | „Rajdówka 77”                |
| `furia.webp`           | `auto2.png` (21.11)       | „Furia”                      |
| `nocny-neon.webp`      | `auto4.png`               | „Lazur” (dawniej Nocny Neon) |
| `bastion.webp`         | `auto12.png`              | „Bastion” (SUV pancerny)     |
| `ranczer.webp`         | `auto5_ładny_pinckup.png` | „Ranczer” (pickup)           |
| `rdzawiec.webp`        | `auto9_stary_pickup.png`  | „Rdzawiec” (stary pickup)    |
| `wloczega.webp`        | `auto10_stare_kombi.png`  | „Włóczęga” (stare kombi)     |
| `taksowka.webp`        | `auto6_taxi.png`          | Taksówka (MG)                |
| `radiowoz.webp`        | `auto8_policja.png`       | Radiowóz (MG)                |
| `karetka.webp`         | `auto7_karetka.png`       | Karetka (MG)                 |
| `militech-furgon.webp` | `auto3_militech.png`      | Militech — furgon (MG)       |
| `graty.webp`           | `furgon1.png`             | „Graty” (furgon)             |
| `nomada.webp`          | `furgon2.png`             | „Nomada” (kamper)            |
| `zadlo.webp`           | `motocykl1.png`           | „Żądło” (motocykl)           |
| `osa.webp`             | `motocykl2.png`           | „Osa” (motocykl)             |
| `szkarlat.webp`        | `supermotocykl.png`       | „Szkarłat” (supermotocykl)   |
| `fala.webp`            | `skuter-wodny.png`        | „Fala” (skuter wodny)        |
| `barakuda.webp`        | `motorowka.png`           | „Barakuda” (motorówka)       |
| `perla.webp`           | `lodz-kabinowa.png`       | „Perła” (łódź kabinowa)      |

Grafiki są wbudowane (`/art/vehicles/`), więc gracz może dać je własnemu pojazdowi bez MG
(`isVehicleArtUrl`). Przeszkody pościgu „Auto cywilne” i „Wrak” też biorą te auta.
