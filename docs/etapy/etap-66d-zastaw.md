# Etap 66d — Scena przykładowa „Zastaw” (pościg na 2 graczy)

**Faza:** przed betą (zlecenie MG z 06.11 spoza planu) · **Wymaga etapów:** 66 (wzorce scen),
65 (pościg), 66c (auto w rezerwie, stany figur we wzorcu, tło z wbudowanej drogi), 67 (modele aut
z grafikami MG) · **Stan:** 🟨 projekt i wzorzec `data/public/scenes/zastaw/` zrobione 06.11;
czeka na rozegranie w przeglądarce, oceny MG przy stole i wdrożenie

## Skąd ten etap

MG (06.11): „zaprojektuj nową przykładową scenę pościgu. Dwóch graczy w swoim kompaktowym aucie ma
w tej scenie ścigać furgon Militechu, w którym oprócz kierowcy ma w pierwszym rzędzie zasiadać
jakiś ochroniarz z Militechu, a przewozić mają młodego chłopaka (syna właściciela dziupli
samochodowej). Ma dojść do zatrzymania (w jakiś sposób) tego furgona i odbicia chłopaka”.

**Odpowiedzi MG (06.11, dwie rundy pytań):**

| pytanie         | decyzja MG                                                                                   |
| --------------- | -------------------------------------------------------------------------------------------- |
| zakres sesji    | projekt + wzorzec + test + oględziny; rozegranie w osobnej sesji                             |
| auto drużyny    | wzorzec stawia kompakt; drużyna z własnym autem — MG podmienia przez „Na drogę”              |
| przeciwnicy     | furgon + zwrot w połowie                                                                     |
| zwrot           | radiowóz NCPD od tyłu (auto w rezerwie jak Rydwan w 66c)                                     |
| zatrzymanie     | otwarte drogi jak w 66c (szyba i kierowca, taran, przeszkoda), bez osobnego mechanizmu       |
| chłopak         | przytomny, skrępowany; raz może pomóc (ręka MG), po zatrzymaniu bywa tarczą                  |
| droga           | Neonowa ulica (ta sama co 66c)                                                               |
| warunek porażki | **bez zegara** — tylko wrak kombi albo drużyna zostaje w tyle (furgon za przednią krawędzią) |

**Rozstrzygnięte bez pytań (do zmiany jednym słowem MG):** nazwa „Zastaw”, imiona (Szczęka,
Śrubka, Brzoza, Hak, Wronka, Lis), powód porwania (moduł z kodami konwojów z rozebranego furgonu),
model auta drużyny „Włóczęga” (stare kombi), Pług i Nitro od Szczęki, nagroda (stawka + darmowe
ulepszenie i naprawa w dziupli — spina się z etapem 68).

## Pomysł w jednym akapicie

Dziupla **Szczęki** rozebrała na części pancerny furgon, który gang ukradł z parkingu Militechu.
W desce siedział moduł z kodami konwojów i poszedł do pasera, zanim Szczęka zorientował się, co to
jest. Militech nie dzwoni na policję: zabrał z warsztatu jego piętnastoletniego syna **Śrubkę**
jako zastaw i wiezie go do placówki. Drużyna (dwie postacie) rusza za furgonem własnym kombi, do
którego ludzie Szczęki w pięć minut przyspawali pług i wstawili butlę nitro. W kabinie furgonu
siedzą kierowca **Brzoza** i ochroniarz **Hak**, z tyłu skrępowany Śrubka. W rundzie 3 od tyłu
wjeżdża **radiowóz NCPD**, któremu Militech zapłacił za „eskortę”.

**Czym różni się od „Ostatniego zjazdu”:** kompakt na kompakt (nikt nie jest szybszy), bez
zegara, dwóch graczy zamiast trzech, wróg „neutralny na papierze” (policja), z którą da się
dogadać, i zakładnik, który sam może raz pomóc.

## Skala i trudność

- **Na 2 postacie graczy** na poziomie startowym (wariant domyślny). Skalowanie na 3 i na 2 + bot
  — tabela niżej.
- Czas przy stole: **4–7 rund pościgu + 1–2 rundy zatrzymania** (ok. 45–75 min). Bez zegara
  scena kończy się, gdy furgon stanie, kombi zostanie wrakiem albo furgon ucieknie.
- Śmiertelność: średnia. Hak strzela z karabinu szturmowego (5k6) — dla kierowcy drużyny to
  realne zagrożenie. Notatki mówią MG, kiedy zwolnić.

## Mapa i ustawienia sceny

**Tło: wbudowana „Neonowa ulica”** (decyzja MG) — jak 66c: 35 × 24 kratki, jezdnia 6–18,
środki pasów y = 8, 12, 16, pod sceną przewija się pętla ok. 238 kratek.

| pole                        | wartość               | dlaczego                                           |
| --------------------------- | --------------------- | -------------------------------------------------- |
| `chase.direction`           | `left`                | domyślne (MG, 04.11)                               |
| `chase.tempo`               | **40**                | patrz „Kompakt na kompakt” niżej                   |
| `chase.road`                | `{ from: 6, to: 18 }` | pas Neonowej ulicy                                 |
| `chase.running`             | `true`                |                                                    |
| `visibility` / `playerMove` | `open` / `stop`       | jak każdy pościg                                   |
| `ambience`                  | `car`                 |                                                    |
| `spawn`                     | `{ x: 26, y: 16 }`    | dolny pas tuż za kombi — gracze klikają fotel obok |

### Kompakt na kompakt — dlaczego tempo 40

Kombi („Włóczęga”, klasa kompaktowa) i furgon Militechu (klasa kompaktowa) mają **Ruch 20**:
budżet kierowcy 5 kratek na turę. Tempo decyduje, co się dzieje, gdy oba jadą pełnym ruchem:

| tempo | dryf kompaktu | oba jadą pełnym ruchem                                                                                              |
| ----- | ------------- | ------------------------------------------------------------------------------------------------------------------- |
| 20    | 0             | oba przesuwają się o 5 kratek na rundę ku przedniej krawędzi — furgon wyjeżdża za kadr w 2–3 rundy, scena się sypie |
| 40    | −5            | oba stoją w kadrze — odległość zmieniają tylko Nitro, przeszkody, błędy kierowcy i taran                            |

Tempo 40 to „obaj gaz do dechy” — geometria stoi i **sama nie rozstrzyga pościgu**. Radiowóz
(Ruch 40) ma przy tym tempie dryf 0 i budżet 10, więc dojeżdża do kombi w rundę.

**Porażka „zostali w tyle”** (decyzja MG: bez zegara) to w VTT wyjazd furgonu przednią krawędzią
(`escaped`): przód furgonu stoi 6,5 kratki od krawędzi, więc furgon ucieka, gdy kierowca drużyny
nie pojedzie przez rundę (ranny, przesiadka, utrata kontroli) i Brzoza dołoży Nitro. Kadr jedzie
z kombi — gdy kombi stanie (pusty fotel kierowcy), stoi droga, a furgon odjeżdża o 5 kratek na
rundę.

### Ustawienie startowe (środki brył w kratkach)

```
 x:  0    5    10   15   20   25   30   35
 y 6 ┌ krawężnik ──────────────────────────────
 y 8 │                                  [RADIOWÓZ]*  ← rezerwa (duch MG)
 y10 ├ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
 y12 │      [ FURGON ]    [KOMBI]                ← drużyna za furgonem
 y14 ├ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
 y16 │                          ⚑ start drużyny
 y18 └ krawężnik ──────────────────────────────
 y20   📌    ❓    ⚠️    💬           💰   (notatki MG na chodniku)
        ← kierunek jazdy (przód kadru)              tył kadru →
```

| auto             | środek (x, y) | bryła wzdłuż drogi | rola                                                |
| ---------------- | ------------- | ------------------ | --------------------------------------------------- |
| Furgon Militechu | 10, 12        | x 6,5–13,5 (3 × 7) | cel pościgu                                         |
| Kombi drużyny    | 20, 12        | x 17,5–22,5        | auto drużyny, 4 kratki za tylnym zderzakiem furgonu |
| Radiowóz NCPD    | 32,5, 8       | x 30–35            | `status: behind` — wjeżdża w rundzie 3              |

Odstęp kombi — furgon: 4 kratki zderzak do zderzaka, ok. 11 m od pasażera kombi do Haka
(zasięg 7–12 m: pistolet PT 15, karabin szturmowy PT 16). Taran Pługiem jest możliwy już
w rundzie 1 (budżet 5) — droga szybka, ale z kosztem (Śrubka dostaje Ranę krytyczną).

## Pojazdy

| klucz      | nazwa            | `catalogIds`                                                                       | ulepszenia                                 | wynik (katalog z podręcznika)                                                      |
| ---------- | ---------------- | ---------------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------- |
| `kombi`    | Kombi drużyny    | `vehicle.wloczega`, `vehicle.samochod-kompaktowy`, `vehicle.sample-kompakt`        | `ram`, `nitro`                             | PUK 50, Ruch 20, 4 fotele, Pług z przodu, 1 zbiornik Nitro                         |
| `furgon`   | Furgon Militechu | `vehicle.militech-furgon`, `vehicle.samochod-kompaktowy`, `vehicle.sample-kompakt` | `armoredHull`, `bulletproofGlass`, `nitro` | PUK 50, OB 13, Ruch 20, 6 foteli (`van-6`), szyby 15 PW na burtę, 1 zbiornik Nitro |
| `radiowoz` | Radiowóz NCPD    | `vehicle.radiowoz`, `vehicle.samochod-sportowy`, `vehicle.sample-kompakt`          | —                                          | PUK 50, Ruch 40, zwykłe szyby                                                      |

**Dlaczego tak:**

- **Furgon bez Wzmocnionej konstrukcji** (66c miał 70 PUK). Na dwóch graczy 50 PUK przy OB 13
  wystarcza: kadłub z pistoletu dalej nic nie bierze, a taran Pługiem z Nitro (8k6 − 13, średnio 15) robi wrak w 3–4 uderzeniach — każde kosztuje Śrubkę Ranę krytyczną. Przy 3 graczach MG
  dokłada konstrukcję (tabela skalowania).
- **Kombi z Pługiem i Nitro** — prezent od Szczęki (dziupla, spawanie w pięć minut), bez tego
  taran to 6k6 w obie strony i jedyna droga to strzał przez szybę. Nitro to jedyny sposób, żeby
  przy równych prędkościach odrobić 5 kratek po Nitro Brzozy.
- **Radiowóz bez szyb kuloodpornych** — przy dwóch graczach policja musi dać się postrzelić, żeby
  morale (PUK ≤ 20 albo Poważnie ranny) dało się osiągnąć w 1–2 rundy.

## Postacie niezależne

Statystyki wymyślone (nie z podręcznika). W kolumnie sprzętu pierwsza alternatywa jest
z kompendium z `data/private`, druga z próbki.

**Brzoza — kierowca Militechu** (furgon, fotel 0, `hostile`). REF + Prowadzenie = 10 jak Wolt
w 66c: nie rzuca Testu zwykłej jazdy, Gwałtowny skręt (PT 13) oblewa w ok. 20%, Skok (PT 17)
w ok. 60%. Jedzie co turę pełnym budżetem; strzela jedną ręką, gdy kombi jest obok.

| INT | REF | ZW  | TECH | CHŁ | WOLA | SZCZ | RUCH | BC  | EMP |
| --- | --- | --- | ---- | --- | ---- | ---- | ---- | --- | --- |
| 5   | 6   | 6   | 5    | 6   | 5    | 3    | 5    | 6   | 3   |

Umiejętności: `driving` 4, `handgun` 6, `evasion` 4, `perception` 4, `athletics` 4. Sprzęt:
ciężki pistolet, Lekka kurtka kuloodporna (korpus).

**Hak — ochroniarz Militechu** (furgon, fotel 1 — pierwszy rząd obok kierowcy, `hostile`).
Główne zagrożenie. Strzela przez tylną szybę furgonu (strzelec we własnym aucie szyby nie ma).
**Bez Ognia ciągłego** — jedna seria w kadłub kombi (OB 0) to wrak (lekcja z 66c, karabin
Rydwanu). Gdy Brzoza padnie, przesiada się za kierownicę.

| INT | REF | ZW  | TECH | CHŁ | WOLA | SZCZ | RUCH | BC  | EMP |
| --- | --- | --- | ---- | --- | ---- | ---- | ---- | --- | --- |
| 5   | 8   | 7   | 4    | 7   | 6    | 3    | 6    | 8   | 3   |

Umiejętności: `shoulder-arms` 6, `handgun` 6, `brawling` 6, `evasion` 6, `perception` 6,
`athletics` 5, `tactics` 4, `interrogation` 3. Sprzęt: karabin szturmowy, ciężki pistolet; Lekka
kurtka kuloodporna na korpusie i głowie (bez kary REF średniego pancerza — w 66c Szron i Kłoda
w średnim pancerzu prawie nie trafiali).

**Śrubka (Kuba) — syn Szczęki** (furgon, fotel 5 — tylny rząd po prawej, `neutral`, stan
**Unieruchomiony**: skrępowany, bez Akcji Ruchu, ale z Akcją). Nie wchodzi do kolejki; jego jedną
akcję rozgrywa MG (runda 4 albo przy zatrzymaniu). 35 PW — wybuch albo dwa tarany naprawdę mogą go
zabić.

| INT | REF | ZW  | TECH | CHŁ | WOLA | SZCZ | RUCH | BC  | EMP |
| --- | --- | --- | ---- | --- | ---- | ---- | ---- | --- | --- |
| 6   | 6   | 7   | 7    | 4   | 5    | 6    | 7    | 4   | 6   |

Umiejętności: `basic-tech` 5, `land-vehicle-tech` 5, `driving` 3, `athletics` 4, `evasion` 4,
`brawling` 3, `stealth` 3, `perception` 4, `streetwise` 3. Bez sprzętu.

**Sierżant Wronka — NCPD** (radiowóz, fotel 0, `hostile`). Dobry kierowca (REF + Prowadzenie
13). Bierze kopertę od Militechu, ale też co miesiąc od Szczęki — to klucz do rozmowy przy
zatrzymaniu.

| INT | REF | ZW  | TECH | CHŁ | WOLA | SZCZ | RUCH | BC  | EMP |
| --- | --- | --- | ---- | --- | ---- | ---- | ---- | --- | --- |
| 5   | 7   | 6   | 4    | 6   | 5    | 3    | 6    | 6   | 4   |

Umiejętności: `driving` 6, `handgun` 5, `evasion` 4, `perception` 5, `persuasion` 4,
`interrogation` 4, `human-perception` 3. Sprzęt: ciężki pistolet, Lekka kurtka kuloodporna.

**Posterunkowy Lis — NCPD** (radiowóz, fotel 1, `hostile`).

| INT | REF | ZW  | TECH | CHŁ | WOLA | SZCZ | RUCH | BC  | EMP |
| --- | --- | --- | ---- | --- | ---- | ---- | ---- | --- | --- |
| 4   | 6   | 6   | 3    | 5   | 5    | 2    | 6    | 7   | 4   |

Umiejętności: `shoulder-arms` 6, `handgun` 5, `brawling` 4, `evasion` 4, `perception` 4,
`athletics` 4. Sprzęt: strzelba, Lekka kurtka kuloodporna.

## Skalowanie

| stół                    | radiowóz                         | furgon                             | uwagi                                                            |
| ----------------------- | -------------------------------- | ---------------------------------- | ---------------------------------------------------------------- |
| **2 postacie**          | runda 3                          | bez zmian                          | wariant domyślny wzorca                                          |
| **3 postacie**          | runda 2                          | + Wzmocniona konstrukcja (+20 PUK) | Brzoza strzela jedną ręką co turę                                |
| **2 postacie + bot**    | runda 2                          | bez zmian                          | bot w tylnym fotelu kombi (`BOT_CANNOT_DRIVE`)                   |
| **za łatwo w trakcie**  | wraca po „Ucieka”                | Brzoza odpala Nitro wcześniej      | albo Lis dostaje karabin                                         |
| **za trudno w trakcie** | odpuszcza po pierwszym trafieniu | —                                  | Lis strzela z pistoletu albo Hak co drugą rundę pilnuje chłopaka |

## Przebieg (dla MG)

**Bez zegara** (decyzja MG). Rundy 1–5 mają stały scenariusz, od rundy 6 MG co rundę wypuszcza
jedną przeszkodę, na zmianę na pasie furgonu i kombi, aż coś się rozstrzygnie.

- **Przed rundą 1** — drużyna z „Postaci” na miejsce startu, fotele kombi, „Może prowadzić”,
  „Dołącz do walki” dla Brzozy i Haka. Wszystkie silniki chodzą, pierwsza runda nie dryfuje.
- **R1 „Ogon”** — Hak strzela przez tylną szybę furgonu w kierowcę kombi. Brzoza jedzie.
  MG pokazuje, że kadłub furgonu nie bierze obrażeń.
- **R2 „Ruch uliczny”** — auto cywilne na pasie furgonu: Gwałtowny skręt Brzozy albo taran;
  po porażce MG wpycha furgon w auto. Kombi na zderzaku → Brzoza odpala Nitro (+5 kratek).
- **R3 „Syreny”** — „Przywróć do pościgu” radiowozu, Wronka i Lis dołączają sami. Wronka
  zajeżdża kombi drogę, Lis strzela w ludzi.
- **R4 „Śrubka”** — chłopak zarzuca związane ręce na szyję Brzozy (najwcześniej, gdy padnie
  tylna szyba albo drużyna do niego krzyknie; najpóźniej teraz): Gwałtowny skręt Brzozy PT 13,
  porażka — utrata kontroli do następnej rundy (furgon dryfuje −5, drużyna odrabia dystans).
  Hak w swojej turze bije chłopaka zamiast strzelać. Roboty drogowe na pasie kombi.
- **R5 „Skrzyżowanie”** — barykada na pasie furgonu (dojedzie w R6 — lekcja z 66c: przeszkoda
  rusza dryfem rundę później). Lis celuje w słaby punkt kombi.
- **R6+** — przeszkoda co rundę, na zmianę.

**Morale:** Brzoza pada → furgon zwalnia (pęd), Hak przesiada się w swojej turze, drużyna ma
jedną turę. Wronka albo Lis Poważnie ranny, albo radiowóz PUK ≤ 20 → NCPD odpuszcza („Ucieka”).

## Jak zatrzymać furgon — drogi do celu

| droga                     | mechanika VTT                                                                   | koszt / ryzyko                                                     |
| ------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Zdjąć Brzozę**          | rozbić szybę (15 PW, „Ostrzelaj szybę”), potem strzał w kierowcę                | Hak strzela pierwszy; Brzoza 40 PW w lekkiej kurtce                |
| **Taran Pługiem przodem** | jazda w furgon → „Taranuj”, z Nitro +2k6; Brzoza robi potem Manewr (decyzja MG) | każdy w furgonie, **także Śrubka**, dostaje Ranę krytyczną         |
| **Wepchnąć w przeszkodę** | furgon po nieudanym Manewrze albo bez kontroli wjeżdża w przeszkodę (65e)       | przeszkody w R2, R5–R6 i co rundę od R6; zderzenie też rani Śrubkę |
| **Śrubka**                | ręka MG w R4: Gwałtowny skręt Brzozy, porażka = utrata kontroli                 | Hak bije chłopaka; raz na scenę                                    |
| **Słaby punkt**           | Celowanie −8, obrażenia po OB ×2                                                | przy OB 13 opłaca się tylko z karabinu                             |
| **Granat**                | wybuch bije figury w obszarze, kadłub zostaje                                   | **trafia Śrubkę** — MG ostrzega raz                                |

## Zatrzymanie i zakończenia

Opis w notatce 💰 wzorca: „Droga jedzie” wyłączona, Hak ze Śrubką jako tarczą (chybienie o 1–2
trafia chłopaka, Perswazja / Zastraszanie PT 15, ugryzienie Śrubki, jeśli nie zużył akcji),
radiowóz staje za kombi — Wronka bierze kopertę od Szczęki (Perswazja PT 13 albo łapówka wg
cennika). Zakończenia: pełny sukces (stawka + darmowe ulepszenie z pasma 3000 ed i naprawa
w dziupli), sukces z kosztem (Rana Śrubki albo NCPD spisało numery kombi), porażka (48 godzin na
moduł, haki: paser albo odbicie z placówki Militechu). Łup: karabin i pancerze, tablet z listą
„zastawów” Militechu.

## Notatki MG we wzorcu (`notes`, wiersz y = 20)

Pięć notatek na chodniku pod dolną barierą (x = 3, 9, 15, 21, 32), każda < 2000 znaków:
📌 „Zastaw — o co chodzi”, ❓ „Zanim ruszycie”, ⚠️ „Przebieg rund — bez zegara”, 💬 „Wstęp
i okrzyki”, 💰 „Zatrzymanie i zakończenia”. Treść żyje w `scene.json` — tu jej nie powtarzamy.

## Oględziny (06.11)

Firefox z Playwright MCP zawisł na `browser_navigate` (pułapka z 03.10), a w dev działał tylko
Vite — oglądane **tymczasowym specem E2E** (skasowany) na `po-T6`: MG w Chromium, Ola w
**Firefoksie**.

- MG: „Sceny” → „Przykładowe” — „Zastaw” z plakietką „pościg” obok „Fabryki dronów” i „Ostatniego
  zjazdu”; „Dodaj do kampanii” bez komunikatu o brakach. Scena na Neonowej ulicy: furgon Militechu
  z Brzozą i Hakiem w pierwszym rzędzie (za kabiną) i Śrubką w tylnym, puste kombi, radiowóz jako
  półprzezroczysty duch w prawym górnym rogu, flaga startu na dolnym pasie, pięć notatek na
  chodniku.
- Ola po aktywacji widzi „Kombi drużyny” i „Furgon Militechu”; radiowóz i jego załoga dochodzą
  dopiero po „Przywróć do pościgu”.
- **Kadr gracza:** bez figury na scenie kamera Oli celuje w miejsce startu (ok. 17 kratek
  szerokości przy 1600 × 1000), z Iskrą w fotelu kombi — w jej figurę (ok. 12 kratek). W obu
  przypadkach furgon 10 kratek przed kombi jest poza kadrem, dopóki gracz nie oddali widoku.
  To ta sama otwarta zaległość co w 66c („Kamera gracza”, `zaleglosci.md`) — pomiar dopisany tam.

## Do zrobienia

- [x] Pytania do MG (dwie rundy, 06.11) — tabela wyżej.
- [x] `data/public/scenes/zastaw/scene.json`: 3 auta, 5 figur (Brzoza, Hak, Śrubka, Wronka,
      Lis), 5 notatek, opis ≤ 600 znaków. Bez zmian w kodzie — format z 66c wystarcza.
- [x] Test serwera (`scene-templates.test.ts` › „etap 66d”): wzorzec staje bez `missing` na
      próbce, furgon `van-6` z trzema ulepszeniami, kombi z modelu „Włóczęga” z Pługiem i Nitro,
      radiowóz `behind`, Śrubka w fotelu 5 Unieruchomiony.
- [x] Oględziny w Firefoksie: lista „Przykładowe”, scena z wzorca na Neonowej ulicy.
- [ ] Rozegranie w przeglądarce (MG + 2 graczy) — osobna sesja, ocena balansu „kompakt na
      kompakt” bez zegara.
- [ ] Oceny MG przy stole i wdrożenie (bez migracji).

## Kryteria ukończenia

- [x] MG w dowolnej kampanii dodaje „Zastaw” z sekcji „Przykładowe” i dostaje scenę z trzema
      autami, kartami pięciu NPC-ów i pięcioma notatkami, bez listy braków.
- [x] Radiowóz i jego załoga są niewidoczni dla graczy do „Przywróć do pościgu” (reguła ogólna
      z 66c, ten sam kod).
- [ ] Scena kończy się rozstrzygnięciem w 4–7 rundach przy stole (bez zegara) — potwierdza
      rozegranie.
- [x] Testy serwera przechodzą, oględziny w Firefoksie opisane w notatce sesji.
