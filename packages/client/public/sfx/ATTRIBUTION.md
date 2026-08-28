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

| Plik            | Oryginał           | Paczka                                                                 | Autor        | Licencja |
| --------------- | ------------------ | ---------------------------------------------------------------------- | ------------ | -------- |
| `explosion.ogg` | `explosion_01.ogg` | [50 CC0 Sci-Fi SFX](https://opengameart.org/content/50-cc0-sci-fi-sfx) | rubberduck   | CC0      |
| `swing.wav`     | `battle/swing.wav` | [RPG Sound Pack](https://opengameart.org/content/rpg-sound-pack)       | artisticdude | CC0      |

Pozostałe cztery pozycje tej paczki — `impact`, `ricochet`, `gas` i `reload` — **zostały
wymienione po odsłuchu 28.08**; patrz sekcja „Odsłuch przy stole" na dole pliku. `zap.wav`
został w tej samej paczce, ale na innym pliku.

## Pięść, ogień i wyrzutnie (audyt 28.08)

Przegląd tabeli `ICON_FX` (`packages/shared/src/systems/cpred/fx.ts`) wyłapał cztery rodzaje
broni grające cudzą próbką: **Bijatyka i Sztuki walki** świszczały ostrzem, **Miotacz ognia**
huczał strzelbą, **Granatnik i Wyrzutnia rakiet** strzelały Mosinem, a **Kusza i Łuk** miały
sprężynę.

| Plik            | Oryginał                          | Paczka                                                                       | Autor                              | Licencja            |
| --------------- | --------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------- | ------------------- |
| `punch.ogg`     | `qubodupPunch01.ogg`              | [Punch](https://opengameart.org/content/punch)                               | qubodup (Iwan Gabovitch)           | CC0                 |
| `flame.ogg`     | `flame.ogg`                       | [Catching fire](https://opengameart.org/content/catching-fire)               | themightyglider (na bazie qubodup) | CC0                 |
| `launch.wav`    | `launch.wav`, wycinek 1,35–2,75 s | [Rocket launch](https://opengameart.org/content/rocket-launch)               | qubodup (Iwan Gabovitch)           | CC0                 |
| `bowstring.wav` | `Bow.wav`                         | [Battle Sound Effects](https://opengameart.org/content/battle-sound-effects) | artisticdude (zgłosił Ogrebane)    | CC0 (wielolicencja) |

Uwagi do tej czwórki:

- **`launch.wav` jest jedyną próbką wyciętą ze środka nagrania**, a nie od pierwszego dźwięku:
  pierwsze 1,3 s oryginału to zapłon i syk, a ryk silnika narasta dopiero potem. Wycinek ma 1,4 s
  i 0,18 s wygaszenia, żeby nie urwał się w pół ryku.
- **`bowstring.wav` zastąpił `bowstring.ogg`** — sprężynę `spring_03`, opisaną wyżej jako
  najsłabsze dopasowanie w całej paczce. Nowa próbka pochodzi od tego samego autora co
  `swing.wav`, więc biała broń i cięciwa brzmią jak jedna rodzina.
- **`punch.ogg` obsługuje też Pochwycenie** (`grab`) — zwarcie z 14d brzmiało dotąd ostrzem.
- **Granat rzucony ręką dalej gra `swing.wav`** i to jest wybór, nie przeoczenie: to świst
  zamachu, a nie odpalenie, więc wyrzutnia i granat celowo brzmią inaczej.

## Krok (etap 27j)

| Plik       | Oryginał                   | Paczka                                                                                                           | Autor    | Licencja |
| ---------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------- | -------- |
| `step.ogg` | `ogg/Fantozzi-StoneL1.ogg` | [Fantozzi's Footsteps (Grass/Sand & Stone)](https://opengameart.org/content/fantozzis-footsteps-grasssand-stone) | Fantozzi | CC0      |

Wybrany wariant **Stone** — miasto i wnętrza, nie las. Lewa i prawa noga to **ta sama próbka
w dwóch wysokościach** (`playStepSound` w `sfx.ts`), a nie dwa pliki: paczka ma obie, ale drugi
wpis w `MAP_FX_SOUNDS` znaczyłby drugi przycisk „Krok" w ustawieniach dla różnicy, której nikt
nie nazwie. Krok ma własny przełącznik („Kroki figur"), bo to jedyna próbka odtwarzana za
każdym razem, gdy ktoś przejdzie przez pokój.

**Do przesłuchania przy stole: cała tabela.** Żadnej z tych próbek nikt jeszcze nie słyszał —
dobrano je po nazwach plików i opisach w paczkach. „⚙ Ustawienia" mają przy suwaku SFX przycisk
odsłuchu **każdej** próbki; jeśli któraś nie pasuje, wymiana to podmiana jednego pliku i jednego
wiersza w `SFX_FILES` (`packages/client/src/sfx.ts`). Kompletu pilnuje `sfx.test.ts` u klienta:
dźwięk bez pliku, plik bez dźwięku i dźwięk bez przycisku odsłuchu wywalają test.

## Odsłuch przy stole (28.08, wieczór)

Pierwszy raz ktoś **usłyszał** te próbki zamiast czytać nazwy plików w archiwach — i sześć
z szesnastu poszło do wymiany. To jest ta sesja, o którą prosiła zaległość etapu 27i.

### Karabin strzelał dwa razy

`shot-rifle.wav` **nie został podmieniony, tylko przycięty**: w oryginale (`sks.wav`, ta sama
sesja strzelnicy co pozostałe trzy huki) padają **dwa strzały**, drugi startuje w 0,315 s. Przy
strzale pojedynczym słychać było dublet, przy serii — dublety na dublecie. Plik ma teraz 0,305 s
i kończy się 90 ms wygaszenia, a wielokrotność bierze się wyłącznie z liczby pocisków
(`addShot` gra do `MAX_SOUNDS_PER_SHOT` próbek co 55 ms). Reszta rodziny została nietknięta —
`shot-pistol`, `shot-sniper` i `shot-shotgun` mają po jednym huku, sprawdzone obwiednią.

### Nowe źródła

| Plik                | Oryginał                       | Paczka                                                                                   | Autor                         | Licencja     |
| ------------------- | ------------------------------ | ---------------------------------------------------------------------------------------- | ----------------------------- | ------------ |
| `impact.wav`        | `bodyimpact_jack_01.wav`       | [FPS Placeholder Sounds](https://opengameart.org/content/fps-placeholder-sounds)         | Jack Menhorn                  | CC BY 3.0    |
| `ricochet.ogg`      | `sounds/weapons/ricochet.ogg`  | [Red Eclipse sounds](https://opengameart.org/content/red-eclipse-sounds)                 | Red Eclipse (zgłosił Calinou) | CC BY-SA 3.0 |
| `gas.wav`           | `steam hisses - Marker #3.wav` | [Steam release sounds](https://opengameart.org/content/steam-release-sounds)             | bart                          | CC0          |
| `zap.wav`           | `continuousspark.wav`          | [Electricity Sound Effects](https://opengameart.org/content/electricity-sound-effects-0) | BMacZero (Brian MacIntosh)    | CC0          |
| `reload-pistol.wav` | `gunreload1.wav`               | [Gun reload sounds](https://opengameart.org/content/gun-reload-sounds)                   | SpringySpringo                | CC0          |
| `reload-rifle.wav`  | `assaultriflereload1.wav`      | [Gun reload sounds](https://opengameart.org/content/gun-reload-sounds)                   | SpringySpringo                | CC0          |

**`ricochet.ogg` jest jedynym plikiem w katalogu na licencji CC BY-SA** i jedynym, którego
**nie tknięto** — leży dokładnie tak, jak wyszedł z paczki. To nie przypadek: SA obowiązuje
utwory zależne, a kopia bez zmian żadnym nie jest, więc reszta repozytorium nie łapie
warunku „na tych samych zasadach". Gdyby ta próbka miała kiedyś zostać przycięta albo
zmiksowana, **wynik trzeba oznaczyć jako CC BY-SA 3.0** — albo poszukać zamiennika. Sam
rykoszet w paczkach CC0 na OpenGameArt praktycznie nie występuje; szukane były `ricochet`,
`zing`, `ping`, `deflect`, `whiz` i `bounce`.

### Co zrobiono z próbkami

Wszystkie nowe pliki są **mono, znormalizowane do −0,7 dBFS** i wygaszone na końcu, tym samym
skryptem-jednorazówką co w etapie 27i (pure Python, moduł `wave` — na tej maszynie nie ma
ffmpeg). Poza tym:

- **`impact.wav`** — sam obcięty i podbity; oryginał leżał 11 dB za cicho. Głuche uderzenie
  w ciało zamiast wcześniejszego interfejsowego stuknięcia, bo tę próbkę gra **każde zadane
  obrażenie**, nie tylko postrzał — nóż i pięść też.
- **`gas.wav`** — 0,85 s syku pary z 1,85 s oryginału (reszta to cisza), z 250 ms wygaszenia
  pod chmurą, która żyje 1,6 s. Poprzedni `noise_01.ogg` był szumem, a nie ulatnianiem się.
- **`zap.wav`** — ta sama paczka, ale plik `continuousspark` zamiast `spark`, zapętlony
  **trzykrotnie** z 3 ms przenikaniem na szwach: ~0,65 s trzasków pod 620 ms animacji
  (`ZAP_MS`) zamiast jednej iskry na 0,22 s.
- **oba przeładowania** — ciszy dłuższej niż 0,30 s skrócono do 0,18 s, **zachowując szmer
  tła zamiast wstawiać cyfrowe zero**, więc sklejki wypadają tam, gdzie nic się nie dzieje.
  Pistolet: magazynek → manipulacja → zamek, 1,33 s. Karabin: zwolnienie → magazynek → zamek,
  1,07 s. Obie próbki pochodzą z jednej paczki, więc długa i krótka broń brzmią jak jedna
  rodzina — ten sam argument, co przy czterech hukach na górze pliku.

### Rykoszet wreszcie coś znaczy

Do 28.08 `ricochet` **nie odzywał się nigdy**: był w `MAP_FX_SOUNDS`, miał plik, wzmocnienie
i przycisk odsłuchu, ale żadne miejsce na serwerze go nie emitowało. Komentarz przy polu
`sound` w `packages/shared/src/fx.ts` opisywał zachowanie, którego nie było — „co robi
pocisk na drugim końcu […] wybiera klient z `hit`". Teraz wybiera: chybiony **pocisk**
(nie strzała, nie ostrze) gra odbicie w chwili, gdy smuga dolatuje, najwyżej dwa razy na
serię (`MAX_RICOCHETS_PER_SHOT`) i tylko wtedy, gdy daleki koniec przetrwał przycięcie dla
widza — czyli tak, jak od początku obiecywał tamten komentarz.
