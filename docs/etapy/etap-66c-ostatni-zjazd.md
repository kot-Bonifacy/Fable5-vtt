# Etap 66c — Scena przykładowa „Ostatni zjazd” (pościg na 2–3 graczy)

**Faza:** przed betą (zlecenie MG z 04.11 spoza planu) · **Wymaga etapów:** 66 (wzorce scen),
65 (scena pościgu, w tym kreator z wbudowanymi drogami z 03.11) · **Stan:** ⬜ projekt gotowy,
decyzje MG z 04.11 wpisane, czeka na wdrożenie we wzorzec

## Skąd ten etap

MG (04.11): „przygotuj w jakimś pliku .md projekt przykładowej sceny (która będzie później
dostępna dla wszystkich MG jako przykładowa) pościgu na 2–3 graczy”. Dalej: „poprzednia
przykładowa scena była niedokończonym projektem” i „skasuj starą scenę pościgu
z przykładowych”.

**Zrobione od razu (04.11):** wzorzec `poscig-wiadukt` zniknął z `data/public/scenes/` (razem
z mapą wiaduktu). Testy serwera wzorców nie stoją już na scenach z repo: `ServerConfig` ma
opcjonalne `sceneTemplatesDir` (domyślnie `<dataPublicDir>/scenes`), a test bierze kopię scen
z repo i fiksturę `packages/server/src/fixtures/scene-templates/test-poscig/` (dawny wiadukt bez
tła). Test izolacji kampanii woła `fabryka-dronow`.

### Czego brakowało „Pościgowi na wiadukcie” — i co ten projekt ma domknąć

| brak starej sceny | jak to rozwiązuje „Ostatni zjazd” |
| --- | --- |
| Jedno auto wrogów, ten sam obraz przez całe starcie | trzy auta wroga z różnymi rolami (cel, blokujący, posiłki), wejście posiłków w rundzie 3 |
| Zwroty akcji jako „propozycje” bez kolejności | rozpisany przebieg rund 1–6 z zegarem i warunkiem porażki „ostatni zjazd” |
| Wygrana = „zgub ich” (uciekający nie podejmuje decyzji) | drużyna goni i musi **zatrzymać** furgon, nie rozwalając ładunku — kilka dróg do celu |
| Skrojone na 1–2 postacie, skalowanie jednym zdaniem | skalowanie 2 / 3 / 3 + bot w tabeli, z tym, co dokładnie zdjąć lub dołożyć |
| Brak tekstu dla graczy | wstęp do przeczytania, okrzyki NPC-ów, zakończenia |
| Tylko pościg, bez „co potem” | zakończenia, łup, nagroda, haki fabularne |
| Mapa MG w repo (jedyna kopia tła) | wbudowana droga „Estakada” (CC0, już w repo) — nic nowego do grafiki |

## Pomysł w jednym akapicie

Fixerka **Matylda** (wymyślona) dostała cynk: zespół odzysku firmy **Halcyon Bioformy**
(wymyślona korporacja medyczna) wiezie estakadą nad miastem porwaną netrunnerkę **Iskrę**, która
wykradła im coś ważnego (dopasuj do kampanii). Za sześć rund furgon zjedzie ostatnim
zjazdem do strzeżonej enklawy Halcyonu i Iskry nikt już nie zobaczy. Drużyna dostaje od
Matyldy szybki wóz z Pługiem bojowym i Nitro i siada furgonowi na ogon. Przed nimi jest
czarne auto eskorty, które zrzuca kolczatki i strzela, a w rundzie 3 od tyłu dojeżdżają
posiłki z karabinem w zderzaku. **Haczyk:** w furgonie siedzi Iskra, więc rakieta albo
granat w furgon trafi też ją. Furgon ma opancerzony kadłub i kuloodporne szyby. Najprościej
jest więc zdjąć kierowcę przez rozbitą szybę, wjechać w furgon Pługiem albo zepchnąć go
w przeszkodę.

**Rola drużyny: ścigający** (stara scena: uciekający), więc w pościgu działa inna część
mechaniki: kolczatka wroga, słaby punkt, taranowanie z Pługiem, szyby i posiłki od tyłu.

## Skala i trudność

- **Na 2–3 postacie graczy** na poziomie startowym, opcjonalnie z jednym botem-towarzyszem
  (bot tylko jako pasażer — `BOT_CANNOT_DRIVE`). Auto drużyny ma 4 fotele.
- Czas przy stole: **6 rund pościgu + 1–3 rundy zatrzymania** (ok. 60–90 min).
- Śmiertelność: średnia. Wrogowie to zwykli najemnicy, ale strzelają serią i kolczatka
  w słaby punkt (4k6) potrafi rozbić auto drużyny. Notatki mówią MG, kiedy zwolnić.

## Mapa i ustawienia sceny

**Tło: wbudowana droga „Estakada”** (`/art/roads/viaduct.webp`, 35 × 18 kratek po 100 px,
1 m na kratkę, okres 32 kratek, szew bieżni niewidoczny; decyzja MG z 04.11). Trzy pasy
w jedną stronę: **górny wiersze 3–7, środkowy 7–11, dolny 11–15**, neonowe bariery 2,5–3
(cyjan) i 15–15,5 (magenta), poza nimi przepaść z nocnym miastem w dole. Pobocza nie ma: auto
jedzie od bariery do bariery. Środki pasów: y = 5, 9, 13.

| pole | wartość | dlaczego |
| --- | --- | --- |
| `kind` | `chase` | |
| `chase.direction` | `left` | domyślne od 04.11 (MG); przód kadru to lewa krawędź, tył — prawa |
| `chase.tempo` | 40 | prędkość eskorty i auta drużyny — oba bez dryfu, furgon (Ruch 20) cofa się o 5 kratek na rundę |
| `chase.road` | `{ from: 3, to: 15 }` | pas wbudowanej estakady (`CHASE_ROADS`), od bariery do bariery |
| `chase.running` | `true` | droga jedzie od aktywacji |
| `visibility` / `playerMove` | `open` / `stop` | jak każdy pościg |
| `ambience` | `car` | |
| `spawn` | `{ x: 33, y: 13 }` | dolny pas za autem drużyny — pod barierami jest przepaść, więc start na jezdni; poza walką nikt się z nikim nie zderza, a gracze klikają fotel tuż obok |

### Ustawienie startowe (środki brył w kratkach)

```
 x:  0    5    10   15   20   25   30   35
 y 0   ░░░░░░░░ przepaść, miasto w dole ░░░░░░
 y 3 ┌ bariera cyjan ═ pas górny ────────────
 y 5 │                                  [Rydwan]*  ← poza kadrem (posiłki)
 y 7 ├ pas środkowy ─────────────────────────
 y 9 │    [ FURGON ]            [MATYLDA]       ← drużyna
 y11 ├ pas dolny ────────────────────────────
 y13 │           [ESKORTA]               ⚑ start drużyny
 y15 └ bariera magenta ═══════════════════════
 y17   📌   ❓   ⚠️   💬   💰   (notatki MG nad przepaścią)
        ← kierunek jazdy (przód kadru)              tył kadru →
```

| auto | środek (x, y) | bryła wzdłuż drogi | rola |
| --- | --- | --- | --- |
| Furgon Halcyonu | 9, 9 | x 5,5–12,5 (3 × 7) | cel pościgu, z przodu kadru |
| Eskorta | 17,5, 13 | x 15–20 | blokuje i strzela, zrzuca kolczatki za siebie |
| Wóz od Matyldy | 28, 9 | x 25,5–30,5 | auto drużyny, z tyłu kadru |
| Rydwan | 32,5, 5 | — | posiłki, startują **za kadrem** (`status: behind`) |

Odstępy: auto drużyny — eskorta ok. 5,5 kratki (zasięg strzału ~10 m), auto drużyny —
furgon 13 kratek. Kierowca drużyny ma budżet 10 kratek na turę, więc furgon da się dogonić
w 2 tury, jeśli nikt nie zablokuje drogi. Eskorta jest po to, żeby blokowała.

## Pojazdy

Liczby z katalogu kampanii (`data/private`, s. 190–191) — we wzorcu stoją tylko id
z alternatywą z próbki (`vehicle.sample-kompakt`), jak w każdym wzorcu. **Bilans tempa jest
liczony dla katalogu z podręcznika.** Na samej próbce wszystkie auta to kompakty z Ruchem 20,
co wystarcza do testów, ale nie do gry. Opis „Wymaga…” w notatce mówi o tym MG.

| klucz | nazwa | `catalogIds` | ulepszenia | grafika | wynik (katalog z podręcznika) |
| --- | --- | --- | --- | --- | --- |
| `matylda` | Wóz od Matyldy | `vehicle.samochod-sportowy`, `vehicle.sample-kompakt` | `ram`, `nitro` | `car-orange.webp` | PUK 50, Ruch 40, 4 fotele, Pług z przodu, 1 zbiornik Nitro |
| `furgon` | Furgon Halcyonu | `vehicle.samochod-kompaktowy`, `vehicle.sample-kompakt` | `reinforced`, `armoredHull`, `bulletproofGlass`, `extraSeats`, `extraSeats`, `nitro` | `van-white.webp` | PUK 70, OB 13, Ruch 20, 8 foteli (`van-8`, bryła 3 × 7), cienkie szyby 15 PW na burtę, 1 zbiornik Nitro |
| `eskorta` | Eskorta | `vehicle.samochod-sportowy`, `vehicle.sample-kompakt` | `bulletproofGlass`, `spikes`, `spikes` | `car-black-viper.webp` | PUK 50, Ruch 40, szyby 15 PW, **2 kolczatki** |
| `rydwan` | Rydwan | `vehicle.samochod-sportowy`, `vehicle.sample-kompakt` | `machineGun` | `car-red.webp` | PUK 50, Ruch 40, karabin pokładowy (30 naboi, tylko Ogień ciągły, w przód) |

**Dlaczego tak:**

- **Furgon to twarda skorupa z miękkim środkiem.** OB 13 i 70 PUK sprawiają, że ostrzał
  kadłuba z pistoletów nic nie daje (3k6 − 13). Za to Kłoda strzela na zewnątrz bez przeszkód
  (`windowBlockFor` liczy tylko szyby auta, w którym siedzi **cel**), a ścigający muszą
  najpierw rozbić tylną albo boczną szybę (15 PW), żeby dosięgnąć kierowcy. To samo dotyczy
  eskorty: Szron strzela swobodnie, a strzał w niego zatrzymuje szyba. To zagadka, którą widać od pierwszej rundy.
- **Furgon jest wolniejszy od tempa** (Ruch 20 przy tempie 40). Wolt musi co turę jechać
  całym budżetem 5 kratek, żeby nie cofać się na drużynę, więc nie strzela. Gdy kierowca padnie,
  furgon sam dryfuje drużynie pod Pług.
- **Pług bojowy drużyny** pozwala taranować furgon bez obrażeń i bez Rany Krytycznej dla
  taranującego, a z Nitro uderzony dostaje +2k6. To trzecia droga do celu obok strzału
  w kierowcę i wepchnięcia furgonu w przeszkodę.
- **Rydwan ma karabin w przodzie** i nadjeżdża od tyłu, więc ma auto drużyny w przedniej
  ćwiartce (`MOUNT_FRONT_ONLY` spełnione). Przez dwie rundy drużyna jest w kleszczach.
- **Drużyna, która ma własny wóz** (Nomada z Moto, auto z karty): MG zdejmuje „Wóz od
  Matyldy” z drogi i stawia swój przez „Na drogę”. Bez Pługa jedna z dróg do celu kosztuje
  obrażenia — notatka o tym przypomina.

## Postacie niezależne

Statystyki wymyślone (nie z podręcznika), ułożone pod NPC-a z poziomu „najemnik”. W kolumnie
„sprzęt” pierwsza alternatywa jest z kompendium z `data/private`, druga z próbki.

### Furgon Halcyonu

**Wolt — kierowca furgonu** (fotel 0, `hostile`). Słabszy kierowca, celowo: REF + Prowadzenie
= 10, więc Gwałtowny skręt (PT 13) nie wychodzi mu w ok. 20% rzutów, a Skok (PT 17) w ok. 60%.

| INT | REF | ZW | TECH | CHŁ | WOLA | SZCZ | RUCH | BC | EMP |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 5 | 6 | 5 | 5 | 5 | 4 | 2 | 5 | 5 | 3 |

Umiejętności: `driving` 4, `handgun` 4, `evasion` 3, `perception` 4, `athletics` 3.
Sprzęt: `weapon.heavy-pistol` / `weapon.zgrzyt-9`; `armor.light-armorjack` /
`armor.kurtka-warsztatowa`.

**Kłoda — strażnik ładunku** (fotel 6, tył po lewej, `hostile`). Strzela przez tylną szybę we
wszystko, co się zbliży. Gdy furgon stanie, łapie Iskrę jako tarczę (patrz „Zatrzymanie”).

| INT | REF | ZW | TECH | CHŁ | WOLA | SZCZ | RUCH | BC | EMP |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4 | 6 | 6 | 3 | 6 | 6 | 2 | 5 | 8 | 2 |

Umiejętności: `shoulder-arms` 6, `brawling` 6, `melee-weapon` 5, `evasion` 4, `perception` 5,
`athletics` 5, `interrogation` 3. Sprzęt: `weapon.shotgun` / `weapon.huk-12`,
`weapon.heavy-melee` / `weapon.szpon`; tułów `armor.medium-armorjack` /
`armor.kurtka-warsztatowa`, głowa `armor.light-armorjack` / `armor.helm-kurierski`.

**Iskra — porwana netrunnerka** (fotel 7, tył po prawej, `neutral`). Uśpiona środkami: nie
bierze udziału w walce, MG nie dokłada jej do kolejki. Budzi się po zatrzymaniu (patrz
„Zakończenia”). Bez broni i pancerza.

| INT | REF | ZW | TECH | CHŁ | WOLA | SZCZ | RUCH | BC | EMP |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | 6 | 5 | 6 | 4 | 5 | 5 | 6 | 3 | 6 |

`roleId` `netrunner`, `roleRank` 3. Umiejętności: `electronics-security` 5, `cryptography` 4,
`education` 5, `perception` 4, `conversation` 3, `evasion` 3. **Mała BC = mało PZ — wybuch przy
furgonie naprawdę może ją zabić.** To świadomy hak sceny.

### Eskorta

**Mewa — kierowczyni eskorty** (fotel 0, `hostile`). Dobra kierowczyni (REF + Prowadzenie 15).
Jej Akcja to kolczatka albo strzał, a Akcja Ruchu to zajeżdżanie drogi.

| INT | REF | ZW | TECH | CHŁ | WOLA | SZCZ | RUCH | BC | EMP |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 5 | 8 | 6 | 4 | 6 | 5 | 3 | 6 | 5 | 3 |

Umiejętności: `driving` 7, `handgun` 5, `evasion` 5, `perception` 5, `athletics` 4.
Sprzęt: `weapon.heavy-pistol` / `weapon.zgrzyt-9`; `armor.light-armorjack` /
`armor.kurtka-warsztatowa`.

**Szron — dowódca zespołu odzysku** (fotel 1, obok kierowcy, `hostile`). Najgroźniejszy
strzelec. Gdy padnie, reszta zespołu traci zapał (patrz „Morale”).

| INT | REF | ZW | TECH | CHŁ | WOLA | SZCZ | RUCH | BC | EMP |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 6 | 7 | 6 | 4 | 7 | 6 | 3 | 6 | 7 | 2 |

Umiejętności: `shoulder-arms` 6, `autofire` 5, `handgun` 5, `evasion` 5, `perception` 5,
`tactics` 5, `brawling` 4. Sprzęt: `weapon.assault-rifle` / `weapon.grzechotnik`,
`weapon.heavy-pistol` / `weapon.zgrzyt-9`; tułów `armor.medium-armorjack` /
`armor.kurtka-warsztatowa`, głowa `armor.light-armorjack` / `armor.helm-kurierski`.

**Lutka — strzelczyni** (fotel 3, tył po prawej, `hostile`). **Tylko przy 3 graczach** —
przy 2 MG zdejmuje jej figurę przed aktywacją.

| INT | REF | ZW | TECH | CHŁ | WOLA | SZCZ | RUCH | BC | EMP |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4 | 7 | 7 | 3 | 5 | 4 | 2 | 6 | 5 | 3 |

Umiejętności: `autofire` 5, `handgun` 5, `evasion` 6, `perception` 4, `athletics` 4.
Sprzęt: `weapon.submachine-gun` / `weapon.zardzewiak`; `armor.light-armorjack` /
`armor.kurtka-warsztatowa`.

### Rydwan (posiłki, runda 3)

**Grot — kierowca Rydwanu** (fotel 0, `hostile`). Strzela z karabinu pokładowego (Ogień
ciągły) i to jego cała robota.

| INT | REF | ZW | TECH | CHŁ | WOLA | SZCZ | RUCH | BC | EMP |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4 | 7 | 5 | 4 | 5 | 4 | 2 | 5 | 6 | 2 |

Umiejętności: `driving` 6, `autofire` 5, `handgun` 4, `evasion` 4, `perception` 4.
Sprzęt: `weapon.heavy-pistol` / `weapon.zgrzyt-9`; `armor.light-armorjack` /
`armor.kurtka-warsztatowa`.

**Kabel — strzelec Rydwanu** (fotel 1, `hostile`).

| INT | REF | ZW | TECH | CHŁ | WOLA | SZCZ | RUCH | BC | EMP |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3 | 6 | 6 | 3 | 5 | 5 | 2 | 6 | 7 | 2 |

Umiejętności: `shoulder-arms` 5, `brawling` 5, `evasion` 4, `perception` 4, `athletics` 4.
Sprzęt: `weapon.shotgun` / `weapon.huk-12`; `armor.light-armorjack` /
`armor.kurtka-warsztatowa`.

## Skalowanie

| stół | Lutka | Rydwan | uwagi |
| --- | --- | --- | --- |
| **2 postacie** | zdjąć | nie przywracać | 4 wrogów walczących (Wolt jedzie, Kłoda, Mewa, Szron). Zegar 7 rund zamiast 6 |
| **3 postacie** | jest | runda 3 | wariant domyślny wzorca |
| **3 postacie + bot** | jest | runda 2 | bot siedzi z tyłu i strzela do figur. Szron celuje najpierw w kierowcę drużyny |
| **za łatwo w trakcie** | — | drugi raz w rundzie 5 („Przywróć do pościgu” po wypadnięciu) | albo Mewa zrzuca drugą kolczatkę wcześniej |
| **za trudno w trakcie** | ucieka z Rydwanem | zostaje w tyle (MG gasi silnik) | furgon łapie gumę: MG ręcznie −10 PUK i Wolt rzuca Manewr |

## Przebieg (dla MG)

**Zegar:** furgon zjeżdża do enklawy **na koniec rundy 6** (przy 2 graczach — 7). Gracze
o tym wiedzą: Matylda mówi to we wstępie, a w rundzie 4 i 6 MG przypomina okrzykiem
(„Zjazd na Halcyon za dwa kilometry!”).

### Przed rundą 1 — rozsadzenie

Drużyna stoi na dolnym pasie przy miejscu startu i klika fotele w Wozie od Matyldy. Kierownicę
daje MG: menu auta → „Może prowadzić” przy figurze kierowcy. Wszystkie auta mają już
uruchomione silniki. MG włącza tryb turowy. Pierwsza runda nie dryfuje (szyk ustawia MG).

### Runda 1 — „Masz ich na oku”

- Szron strzela w auto drużyny albo w kierowcę (przez przednią szybę Wozu, która nie jest
  kuloodporna).
- Kłoda wychyla się przez tylną szybę furgonu i strzela, jeśli coś jest w zasięgu.
- Mewa zjeżdża na pas auta drużyny, między nie a furgon.
- **Cel rundy dla MG:** pokazać, że eskorta zamyka drogę, a kadłub furgonu nie bierze
  obrażeń. Jeśli ktoś strzeli w kadłub, MG mówi: „Kule odbijają się od blach — to pancerz”.

### Runda 2 — kolczatka

- Furgon zaczyna dryfować (−5). Wolt jedzie całym budżetem i nadal trzyma odstęp.
- **Mewa zrzuca pierwszą kolczatkę** (menu auta „Zrzuć kolczatkę”, za jej Akcję). Kolczatka
  ląduje za eskortą. Kto w nią wjedzie, rzuca Prowadzenie PT 17, a porażka to 4k6 w słaby punkt.
  Kierowca drużyny może ją ominąć, jeśli zmieni pas.
- Przy stole z botem w tej rundzie wjeżdża Rydwan (patrz runda 3).

### Runda 3 — posiłki

- **Rydwan wraca do pościgu** (menu auta → „Przywróć do pościgu”, staje przy tylnej krawędzi),
  a MG dokłada Grota i Kabla „Dołącz do walki”. Okrzyk: „Mamy ich z tyłu, zamykamy!”
- MG wypuszcza **auto cywilne** z palety „Przeszkody” na pasie przed furgonem. Wolt musi zrobić
  Gwałtowny skręt (PT 13) albo taranować. Porażka to utrata kontroli i zderzenie, a to szansa
  drużyny.

### Runda 4 — „Za dwa kilometry zjazd”

- MG przypomina o zegarze.
- **Roboty drogowe** na pasie, którym jedzie auto drużyny (rozstrzygnięcie 65e: kierowca
  wybiera Manewr albo taranowanie). Z Pługiem taranowanie jest tanie, ale kosztuje turę.
- Jeśli Szron jeszcze żyje, celuje w słaby punkt Wozu (Celowanie −8, obrażenia po OB ×2).
  MG ostrzega okrzykiem z eskorty: „Celuj w koła!”

### Runda 5 — druga kolczatka albo taran

- Mewa zrzuca drugą kolczatkę, jeśli auto drużyny jest za eskortą. Jeśli drużyna już ją minęła,
  Mewa próbuje taranować auto drużyny z boku (eskorta nie ma Pługa, więc oba auta biorą 6k6).
- Rydwan strzela serią w tył auta drużyny.

### Runda 6 — ostatni zjazd

- **Barykada** na pasie furgonu tuż przed zjazdem. Wolt musi zrobić Skok (PT 17) albo
  Gwałtowny skręt — to ostatnia, najlepsza szansa drużyny.
- Jeśli na koniec rundy furgon nadal jedzie i ma kierowcę, skręca w zjazd: **porażka**.
  MG ogłasza to narracyjnie i odsuwa furgon za przednią krawędź (albo ustawia „Ucieka”).

### Bariery estakady

Mechanika nie zrzuca aut z estakady — auto nie wyjedzie poza pas jezdni. Bariery grają
narracyjnie: auto po utracie kontroli na skrajnym pasie „szoruje po barierze w snopie iskier”,
a wrak, który staje przy barierze, MG może opisać jako zawieszony nad przepaścią (dobry moment
na Kłodę z Iskrą, jeśli to furgon). Zepchnięcie auta w przepaść to decyzja MG poza mechaniką,
**nie dla furgonu** — Iskra by zginęła, a scena nie daje na to ostrzeżenia.

### Morale

- **Szron pada** → Mewa gasi silnik i eskorta zostaje w tyle (dryfuje z pełnym tempem jak
  zgaszone auto). Lutka, jeśli żyje, krzyczy „Odwrót!”.
- **Rydwan ma PUK ≤ 15** → Grot ucieka: MG gasi silnik.
- **Wolt pada** → furgon jest bez kontroli i dryfuje na drużynę. Kłoda przesiada się
  na fotel kierowcy w swojej turze (MG przeciąga figurę bez kosztu, więc sam odlicza Kłodzie
  Akcję Ruchu, jak graczowi przy przesiadce). Drużyna ma jedną turę, żeby temu zapobiec.

## Jak zatrzymać furgon — drogi do celu

| droga | mechanika VTT | koszt / ryzyko |
| --- | --- | --- |
| **Zdjąć Wolta** | rozbić szybę furgonu (15 PW, karta „Ostrzelaj szybę”), potem strzał w kierowcę | trzeba podjechać na zasięg; Kłoda strzela pierwszy |
| **Taran Pługiem** | jazda kierowcy w furgon → „Taranuj” (`resolveRam`), Pług zdejmuje obrażenia z taranującego, z Nitro +2k6 | furgon ma 70 PUK i OB 13 — sam taran go nie zatrzyma, ale Wolt musi potem zdać Manewr (decyzja MG) |
| **Wepchnąć w przeszkodę** | furgon bez kontroli albo po nieudanym Manewrze wjeżdża w przeszkodę od razu (65e, rozstrzygnięcie 5) | wymaga przeszkody przed furgonem — MG wypuszcza je w rundach 3 i 6 |
| **Słaby punkt** | Celowanie −8, obrażenia po OB ×2 | przy OB 13 opłaca się dopiero z karabinu |
| **Rakieta, granat** | wybuch bije figury w obszarze, kadłub zostaje (65d1, rozstrzygnięcie 10) | **trafia Iskrę** — to celowa pułapka; MG ostrzega raz („Tam jest Iskra!”) |
| **Netrunning** | poza mechaniką pościgu (scena nie ma Sieci) | MG może pozwolić na hak narracyjny: auto Halcyonu ma Centrum komunikacji w kampanii — nie we wzorcu |

## Zatrzymanie (po pościgu)

Gdy furgon stoi (kierowca padł i Kłoda się nie przesiadł, wrak albo zderzenie): MG wyłącza
„Droga jedzie”. Auta stoją, przeszkody nie dryfują, a walka toczy się dalej na stojącej
estakadzie. MG wysadza figury z aut przeciągnięciem (wyskok na jezdnię robi tylko MG).

- **Kłoda z Iskrą jako tarczą.** Kłoda wysiada i trzyma Iskrę przed sobą (narracyjnie: kto
  strzela w Kłodę i chybi o 1–2 oczka, trafia Iskrę — decyzja MG, VTT tego nie liczy).
  Rozmowa (Perswazja albo Zastraszanie PT 15) kończy sprawę bez strzału.
- **Eskorta i Rydwan**, jeśli jeszcze jadą, odjeżdżają, gdy furgon stanie. Wyjątek: Szron żyje
  i drużyna jest ranna — wtedy jedna runda ostrzału z przejeżdżającego auta i odjazd.

## Zakończenia

- **Pełny sukces** — Iskra żywa, furgon zatrzymany przed zjazdem. Iskra budzi się po kilku
  minutach i jest drużynie winna przysługę (netrunnerka z kontaktem w Halcyonie).
- **Sukces z kosztem** — Iskra żywa, ale ranna (wybuch, strzał przez Kłodę). Trzeba ją
  zawieźć do ripperdoka, a Halcyon wie, kto ją odbił.
- **Porażka** — furgon zjeżdża do enklawy. Matylda nie płaci. Haki: odbicie Iskry z enklawy
  (scena skradania się), albo Iskra, przesłuchana, sprzedaje Halcyonowi drużynę.
- **Łup:** broń zespołu odzysku, pancerze, w furgonie skrzynia z lekami Halcyonu (wartość wg
  kampanii) i chip z tym, co Iskra wykradła. **Nagroda Matyldy:** wg cennika kampanii
  (propozycja: stawka za robotę bojową na osobę + premia, jeśli Iskra wyjdzie bez szwanku).

## Teksty do przeczytania graczom

**Wstęp (MG czyta przed rundą 1):**

> Estakada wisi nad miastem jak neonowa nitka: magentowa bariera po lewej, cyjanowa po
> prawej, a za nimi tylko pustka i światła dzielnic sto metrów niżej. Matylda rzuca wam
> kluczyki i nie tłumaczy, skąd ma ten pomarańczowy wóz z pługiem przyspawanym do zderzaka.
> „Biały furgon Halcyonu, kilometr przed wami. W środku dziewczyna, która nazywa się Iskra
> i która zrobiła mi kiedyś przysługę. Za dziesięć minut furgon zjedzie z estakady do ich
> enklawy i będzie po niej. I jeszcze jedno: nie rozwalcie mi tego furgonu. Ona siedzi
> z tyłu.” Silnik ryczy. Przed wami, w smugach neonu, majaczy czarne auto, które jedzie
> stanowczo zbyt blisko białej furgonetki.

**Okrzyki NPC-ów (do czatu albo na głos):**

- Szron, runda 1: „Ogon na szóstej! Mewa, zamknij ich!”
- Mewa, kolczatka: „Częstujcie się!”
- Grot, wjazd Rydwanu: „Mamy ich z tyłu, zamykamy!”
- Szron, celując w koła: „Celuj w koła!”
- Wolt, przed barykadą: „Trzymajcie się, skaczę!”
- Kłoda, gdy furgon stanie: „Jeszcze krok i dziewczyna dostaje w głowę!”

## Notatki MG we wzorcu (`notes`, wiersz y = 17)

Pięć notatek nad przepaścią pod dolną barierą (x = 3, 9, 15, 21, 32) — warstwa MG, gracz ich nie widzi. Teksty niżej są gotowe do
wklejenia do `scene.json` i każda mieści się w `NOTE_TEXT_MAX_LENGTH` = 2000 znaków. Długie
tabele (statystyki, drogi do celu) zostają w tym pliku i na kartach NPC-ów. Notatka ich nie
powtarza.

1. **📌 (x 3) „OSTATNI ZJAZD — o co chodzi”** — pomysł w jednym akapicie, warunek wygranej
   (furgon stoi przed końcem rundy 6, Iskra żywa), warunek porażki (zjazd, wrak Wozu albo Wóz
   za tylną krawędzią), obsada aut w trzech wierszach, uwaga o próbce kompendium („na próbce
   wszystkie auta są kompaktami — bilans tempa tylko z katalogiem z podręcznika”).
2. **❓ (x 9) „ZANIM RUSZYCIE”** — rozsadzenie i „Może prowadzić”, skalowanie (tabela
   „Skalowanie” w trzech wierszach: 2 graczy — zdejmij Lutkę i nie przywracaj Rydwanu, zegar 7;
   3 — bez zmian; z botem — Rydwan w rundzie 2), Iskra poza kolejką, własny wóz drużyny,
   kierunek i tempo w Edycji sceny → Pościg, portrety NPC-ów (wzorzec ich nie ma — MG wybiera sam).
3. **⚠️ (x 15) „PRZEBIEG RUND”** — runda po rundzie w jednym zdaniu każda (kolczatka 2,
   Rydwan + auto cywilne 3, roboty drogowe 4, druga kolczatka 5, barykada i zjazd 6), plus
   akapit „Morale”.
4. **💬 (x 21) „WSTĘP I OKRZYKI”** — tekst wstępu i sześć okrzyków.
5. **💰 (x 32) „ZATRZYMANIE I ZAKOŃCZENIA”** — „Droga stoi”, Kłoda z tarczą, trzy
   zakończenia, łup.

## Czego brakuje w kodzie (zakres wdrożenia)

Projekt da się postawić prawie w całości na dzisiejszym formacie wzorca. Dwie rzeczy trzeba
dołożyć, jedna jest opcjonalna.

1. **Tło wzorca z wbudowanej drogi.** `readScene` w `shared/scene-templates.ts` dziś przyjmuje
   tylko `/public/scenes/…`. Dołożyć: adres z `chaseRoadByUrl` (wbudowana droga) jest
   dozwolony, a `backgroundWidth/Height` brane z listy `CHASE_ROADS`, kiedy pliku nie ma
   obok. `scene:update` już przepuszcza tę listę (kreator z 03.11), a `isOwnUploadUrl` /
   archiwum trzeba sprawdzić tak, jak dla `/public/scenes/`. Test `shared` „tło leży obok”
   sprawdza dla `/art/roads/` plik w `packages/client/public/`. **Alternatywa bez kodu:**
   skopiować `viaduct.webp` do `data/public/scenes/ostatni-zjazd/map.webp` (CC0, wolno). Ma
   to jednak wadę: dwie kopie tła, a poprawka skryptu dróg nie dotrze do wzorca. Rekomendacja:
   dołożyć regułę w czytniku.
2. **Auto w rezerwie: `vehicles[].status: "behind"`** (opcjonalne pole, domyślnie
   `racing`). `instantiateSceneTemplate` zapisuje `SceneVehicle.status`, a figury w fotelach
   takiego auta nie wchodzą do kolejki. Gracz go nie widzi (`behind` jest tylko dla MG),
   a MG ma już „Przywróć do pościgu” i „Dołącz do walki”. Bez tego Rydwan musiałby stać
   w kadrze od początku albo MG dokładałby go ręcznie z zakładki „Pojazdy”.
3. *(opcjonalnie)* **Stan figury we wzorcu** (`figures[].system.statuses`, np. Nieprzytomna
   dla Iskry). Bez tego MG po prostu nie dokłada Iskry do kolejki — notatka 2 o tym mówi.
   Jeśli to dojdzie, to raczej przy okazji, bo to nie blokuje sceny.

### Do zrobienia

- [ ] Czytnik wzorca: tło z `CHASE_ROADS` (pkt 1) + testy `shared` (przyjęcie drogi, odmowa
      obcego `/art/…`, rozmiar z listy).
- [ ] `vehicles[].status` (pkt 2) w `readSceneTemplate` i `instantiateSceneTemplate`, test
      serwera na fiksturze `test-poscig` (auto `behind` niewidoczne dla gracza, figury poza
      kolejką po starcie walki).
- [ ] `data/public/scenes/ostatni-zjazd/scene.json` wg tego pliku: 4 auta, 8 figur
      (Wolt, Kłoda, Iskra, Mewa, Szron, Lutka, Grot, Kabel; drużyna siada sama), 5 notatek, opis
      ≤ 600 znaków.
- [ ] Test serwera: wzorzec `ostatni-zjazd` staje bez `missing` na próbce, furgon ma `van-8`
      i 8 foteli, Rydwan `behind`, drużyna bez figur.
- [ ] Oględziny w **Firefoksie** (Playwright, instancja E2E z `data/private`): lista
      „Przykładowe”, dodanie, bieżnia na estakadzie, fotele i podpisy (osiem podpisów
      pod czterema autami nie może na siebie nachodzić), przywrócenie Rydwanu, kolczatka
      eskorty, taran Pługiem w furgon.
- [ ] Przebieg na sucho dwóch rund przez MG z dwoma kontami graczy (balans 3 graczy).

## Kryteria ukończenia

- [ ] MG w dowolnej kampanii dodaje „Ostatni zjazd” z sekcji „Przykładowe” i dostaje scenę
      z czterema autami, kartami ośmiu NPC-ów i pięcioma notatkami, bez listy braków przy
      katalogu z `data/private`.
- [ ] Rydwan jest niewidoczny dla graczy do „Przywróć do pościgu”.
- [ ] Wszystkie drogi do celu z tabeli działają przy stole (strzał przez szybę, taran Pługiem,
      przeszkoda przed furgonem bez kontroli).
- [ ] Testy `shared` i serwera przechodzą, oględziny w Firefoksie opisane w notatce sesji.

## Decyzje MG z 04.11

1. **Nazwy wymyślone** (Halcyon Bioformy, Matylda, Iskra i reszta) — zostają.
2. **Tło: wbudowana „Estakada”** (nie Autostrada) — pas 3–15, start drużyny na dolnym pasie,
   wstęp i bariery opisane pod estakadę.
3. **Kłoda z Iskrą jako tarczą** (chybienie o 1–2 trafia Iskrę, ręcznie) — zostaje w notatce.
4. **Portrety NPC-ów wybiera MG** — wzorzec ich nie niesie (figury z inicjałem), MG daje
   portret na karcie po dodaniu sceny do kampanii. Notatka „Zanim ruszycie” o tym przypomina.
