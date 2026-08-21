# Atrybucja dźwięków walki (etap 27i)

Próbki odtwarzane przez `sfx.ts`, hostowane u siebie. Wszystkie pobrane z
[OpenGameArt.org](https://opengameart.org).

Pliki `.wav` zostały **przycięte do samego zdarzenia, zsumowane do mono, wyciszone na końcu
i znormalizowane** skryptem — oryginały mają od 7 do 15 sekund i po dwa kanały, co przy
strzale z pistoletu jest 3 MB ciszy wokół 40 ms huku. Pliki `.ogg` są kopiami bez zmian.

## Strzały

Cztery próbki z jednej sesji strzelnicy, więc broń brzmi jak jedna rodzina, a nie jak
zlepek z czterech mikrofonów.

| Plik               | Oryginał     | Broń           | Gdzie                                           |
| ------------------ | ------------ | -------------- | ----------------------------------------------- |
| `shot-pistol.wav`  | `cz.wav`     | pistolet CZ-52 | pistolety, rewolwery, pistolety maszynowe       |
| `shot-rifle.wav`   | `sks.wav`    | karabin SKS    | karabiny szturmowe, ciężkie pistolety maszynowe |
| `shot-sniper.wav`  | `mosin.wav`  | Mosin Nagant   | karabiny wyborowe, wyrzutnie                    |
| `shot-shotgun.wav` | `shotty.wav` | strzelba       | strzelby, miotacze ognia                        |

Źródło: [Gunshot Sounds](https://opengameart.org/content/gunshot-sounds) — strona OpenGameArt
podaje **CC0** i autora „Tabasco", a plik `creativecommons.txt` w archiwum podaje
**CC BY 3.0** i „Copyright (c) 2009 Vincent Sevedge". Sprzeczność rozstrzygnięta na korzyść
ostrzejszego warunku: traktujemy je jak **CC BY 3.0** i podajemy oba nazwiska.

## Reszta

| Plik            | Oryginał           | Paczka                                                                                   | Autor                      | Licencja |
| --------------- | ------------------ | ---------------------------------------------------------------------------------------- | -------------------------- | -------- |
| `explosion.ogg` | `explosion_01.ogg` | [50 CC0 Sci-Fi SFX](https://opengameart.org/content/50-cc0-sci-fi-sfx)                   | rubberduck                 | CC0      |
| `impact.ogg`    | `hit_02.ogg`       | [100 CC0 SFX](https://opengameart.org/content/100-cc0-sfx)                               | rubberduck                 | CC0      |
| `ricochet.ogg`  | `metal_02.ogg`     | [100 CC0 SFX](https://opengameart.org/content/100-cc0-sfx)                               | rubberduck                 | CC0      |
| `gas.ogg`       | `noise_01.ogg`     | [100 CC0 SFX](https://opengameart.org/content/100-cc0-sfx)                               | rubberduck                 | CC0      |
| `bowstring.ogg` | `spring_03.ogg`    | [100 CC0 SFX](https://opengameart.org/content/100-cc0-sfx)                               | rubberduck                 | CC0      |
| `reload.ogg`    | `lock_02.ogg`      | [80 CC0 RPG SFX](https://opengameart.org/content/80-cc0-rpg-sfx)                         | rubberduck                 | CC0      |
| `swing.wav`     | `battle/swing.wav` | [RPG Sound Pack](https://opengameart.org/content/rpg-sound-pack)                         | artisticdude               | CC0      |
| `zap.wav`       | `spark.wav`        | [Electricity Sound Effects](https://opengameart.org/content/electricity-sound-effects-0) | BMacZero (Brian MacIntosh) | CC0      |

## Krok (etap 27j)

| Plik       | Oryginał                   | Paczka                                                                                                           | Autor    | Licencja |
| ---------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------- | -------- |
| `step.ogg` | `ogg/Fantozzi-StoneL1.ogg` | [Fantozzi's Footsteps (Grass/Sand & Stone)](https://opengameart.org/content/fantozzis-footsteps-grasssand-stone) | Fantozzi | CC0      |

Wybrany wariant **Stone** — miasto i wnętrza, nie las. Lewa i prawa noga to **ta sama próbka
w dwóch wysokościach** (`playStepSound` w `sfx.ts`), a nie dwa pliki: paczka ma obie, ale drugi
wpis w `MAP_FX_SOUNDS` znaczyłby drugi przycisk „Krok" w ustawieniach dla różnicy, której nikt
nie nazwie. Krok ma własny przełącznik („Kroki figur"), bo to jedyna próbka odtwarzana za
każdym razem, gdy ktoś przejdzie przez pokój.

**Do przesłuchania przy stole:** `bowstring.ogg` jest najsłabszym dopasowaniem w tej tabeli —
sprężyna udająca cięciwę, wybrana bez odsłuchu. „⚙ Ustawienia" mają przy suwaku SFX przycisk
odsłuchu każdej próbki; jeśli któraś nie pasuje, wymiana to podmiana jednego pliku i jednego
wiersza w `SFX_FILES` (`packages/client/src/sfx.ts`).
