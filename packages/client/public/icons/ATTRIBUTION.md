# Atrybucja ikon interfejsu

Ikony w tym katalogu pochodzą z [game-icons.net](https://game-icons.net) i są udostępnione
na licencji [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Z oryginalnych plików
usunięto czarny prostokąt tła (game-icons rysuje ikony jako białą sylwetkę na czarnym
kwadracie) — została sama sylwetka w bieli, którą klient barwi `tint`-em albo
`currentColor`-em.

| Plik             | Oryginalna ikona | Autor      | Gdzie używana                                  |
| ---------------- | ---------------- | ---------- | ---------------------------------------------- |
| `newspaper.svg`  | Newspaper        | Delapouite | screamsheet: lista handoutów, czat (24c)       |
| `jack-plug.svg`  | Jack plug        | Delapouite | punkt dostępu do Sieci na mapie (26b)          |
| `boot-print.svg` | Boot prints      | Lorc       | ślady butów na trasie ruchu (27j; lewy z pary) |

Źródło: <https://github.com/game-icons/icons> (gałąź `master`).

## Ikony panelu postaci (`hud/`, etap 27h)

Broń, akcje i statystyki na kaflach lewego panelu. Rysowane **maską CSS**
(`HudIcon`), więc kolor bierze się z motywu, a nie z pliku — dlatego z tych
plików również usunięto czarne tło. Nazwę ikony wybiera `shared`
(`cpredWeaponIcon`, `CpredSlotIcon`), a nie komponent.

| Plik                       | Oryginalna ikona     | Autor        | Gdzie używana                            |
| -------------------------- | -------------------- | ------------ | ---------------------------------------- |
| `hud/aim-body.svg`         | Human target         | Delapouite   | Celowanie: strzał bez celowania (korpus) |
| `hud/aim-hand.svg`         | Hand                 | Lorc         | Celowanie: trzymany przedmiot            |
| `hud/aim-head.svg`         | Headshot             | Skoll        | Celowanie: głowa                         |
| `hud/aim-leg.svg`          | Leg                  | Delapouite   | Celowanie: noga                          |
| `hud/ammo.svg`             | Machine gun magazine | Delapouite   | zapas amunicji (rezerwa etapu 27i)       |
| `hud/armor.svg`            | Kevlar vest          | Skoll        | chip SP w panelu postaci                 |
| `hud/bow.svg`              | Bow arrow            | Delapouite   | slot broni: łuk                          |
| `hud/backup.svg`           | Police officer head  | Delapouite   | akcja „Wezwanie Wsparcia” (30c)          |
| `hud/broadsword.svg`       | Broadsword           | Lorc         | slot broni: duża broń biała              |
| `hud/crossbow.svg`         | Crossbow             | Carl Olsen   | slot broni: kusza                        |
| `hud/combat-awareness.svg` | Awareness            | Lorc         | akcja „Zmysł Walki” (30a)                |
| `hud/emp.svg`              | Brain                | Lorc         | chip EMP w panelu postaci                |
| `hud/first-aid.svg`        | First aid kit        | Delapouite   | akcja „Ustabilizowanie”                  |
| `hud/fist.svg`             | Fist                 | Skoll        | slot broni: bijatyka                     |
| `hud/flamethrower.svg`     | Flamethrower         | Delapouite   | slot broni: miotacz ognia                |
| `hud/grab.svg`             | Grab                 | Lorc         | akcja „Zwarcie” / „Pochwycenie”          |
| `hud/grenade.svg`          | Grenade              | Lorc         | slot broni: granat                       |
| `hud/hourglass.svg`        | Hourglass            | Lorc         | akcja „Wstrzymanie Akcji”                |
| `hud/hp.svg`               | Heart beats          | Delapouite   | rezerwa: znacznik PW                     |
| `hud/knife.svg`            | Bowie knife          | Lorc         | slot broni: lekka broń biała             |
| `hud/launcher.svg`         | Missile launcher     | Delapouite   | slot broni: granatnik, broń ciężka       |
| `hud/martial-arts.svg`     | High kick            | Delapouite   | slot broni: sztuki walki                 |
| `hud/move.svg`             | Running shoe         | Delapouite   | chip RUCH w panelu postaci               |
| `hud/pistol.svg`           | Pistol gun           | John Colburn | slot broni: pistolet                     |
| `hud/reload.svg`           | Reload gun barrel    | Delapouite   | slot „Przeładuj”                         |
| `hud/revolver.svg`         | Revolver             | Delapouite   | slot broni: bardzo ciężki pistolet       |
| `hud/rifle.svg`            | Autogun              | Lorc         | slot broni: karabin szturmowy            |
| `hud/rocket.svg`           | Rocket               | Lorc         | slot broni: wyrzutnia rakiet             |
| `hud/scanner.svg`          | Radar sweep          | Lorc         | akcja „Skaner” (26b) w panelu postaci    |
| `hud/run.svg`              | Run                  | Lorc         | akcja „Bieg”                             |
| `hud/shotgun.svg`          | Sawed off shotgun    | Delapouite   | slot broni: strzelba                     |
| `hud/smg.svg`              | Uzi                  | Delapouite   | slot broni: pistolet maszynowy           |
| `hud/smg-heavy.svg`        | Machine gun          | Skoll        | slot broni: ciężki pistolet maszynowy    |
| `hud/sniper.svg`           | Winchester rifle     | Skoll        | slot broni: karabin snajperski           |
| `hud/stand-up.svg`         | Person               | Delapouite   | akcja „Wstanie”; stan pusty panelu       |
| `hud/sword.svg`            | Katana               | Delapouite   | slot broni: średnia broń biała           |
| `hud/two-handed-sword.svg` | Two handed sword     | Delapouite   | slot broni: bardzo duża broń biała       |
