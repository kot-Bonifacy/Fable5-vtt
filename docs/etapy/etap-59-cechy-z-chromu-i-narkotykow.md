# Etap 59 — Cechy z chromu i narkotyków ulicznych

**Faza:** przed betą (zlecenie MG z 24.10 spoza planu) · **Wymaga etapów:** 23a (cyborgizacje
i Człowieczeństwo), 37 (zegar świata), 39 (efekty czasowe na Cechach), 30c/31 (farmaceutyki
i `character:use-dose`), 38a (blok statystyk, `cpredSheetHpMax`)

**Status: 59a ✅ (24.10, rozszerzone o resztę chromu i sprzętu z premią — sekcja „59a — jak
zrobiono”); 59b i 59c — PROJEKT, czekają na akceptację MG (pytania 1–3, 5, 6).**

## Skąd ten etap

MG (24.10): „jak gracz może zwiększyć cechę powyżej 8? czy jest już do tego mechanika zrobiona?”
→ „dodaj to zarówno z narkotyków jak i wszczepów”.

Stan przed etapem:

- Kreator trzyma Cechy w 2–8 (s. 78, zgodnie z podręcznikiem), PD kupują tylko Umiejętności
  i Zdolności (s. 411) — to zostaje.
- Efekt czasowy na Cesze (etap 39, `statEffects`) MG nakłada ręką; sufit `CPRED_STAT_MAX = 10`.
- **Narkotyków ulicznych nie ma nigdzie** — ani w kompendium, ani w sklepach, ani w kodzie.
- **Wszczepy nie zmieniają Cech** — Przeszczep splotu mięśniowo-kostnego i ramownice linearne
  są w kompendium (`cyberware.json`), ale montaż odejmuje tylko Człowieczeństwo.

## Co mówi podręcznik

### Wszczepy (s. 362 i 366; rozdział 7 „Borgizacje”)

| Wszczep                                   | Skutek                                              | Wymaga (opis)                         |
| ----------------------------------------- | --------------------------------------------------- | ------------------------------------- |
| Przeszczep splotu mięśniowo-kostnego      | BC +2; „Można nabyć kilkukrotnie”; „nie można zwiększyć BC powyżej 10” | —                    |
| Implantowana ramownica linearna ∑ (Sigma) | BC **wzrasta do** 12                                 | BC 6 i przeszczep splotu              |
| Implantowana ramownica linearna ß (Beta)  | BC **wzrasta do** 14                                 | BC 8 i dwa przeszczepy splotu         |

Wszystkie trzy: „Ta zmiana zwiększa liczbę PW użytkownika, Próg Ran oraz wartość
Przeżywalności”. (Zewnętrzne ramownice z rozdziału „Wyposażenie” — BC 12/14 „po podłączeniu”,
**bez** wzrostu PW — to sprzęt, nie wszczep; poza etapem, patrz „Poza zakresem”.)

### Narkotyki uliczne (s. 227 i 357–358)

- Zażycie: **Akcja**, strzykawka bezigłowa, sobie albo komuś, kto się nie broni; broniącemu się —
  Atak bronią białą (ta sama ścieżka, co `hostile` przy farmaceutykach).
- Efekt główny działa od razu; **kolejna dawka wydłuża go o pełny czas działania**.
- Po końcu efektu głównego: **SW + Odporność na tortury/narkotyki + 1k10 przeciw PT efektu
  dodatkowego**. Porażka = uzależnienie (trwałe, do terapii s. 229).

| Narkotyk       | Czas | PT | Efekt główny                                                | Uzależnienie                                    |
| -------------- | ---- | -- | ----------------------------------------------------------- | ----------------------------------------------- |
| Czarna szpryca | 24 h | 17 | −2k6 Człowieczeństwa (wraca, gdy rzut się uda); ignoruje Poważnie rannego | utrata Człowieczeństwa zostaje; REF −2, gdy **nie** jest pod działaniem |
| Błękitne szkło | 4 h  | 15 | „fleszowanie” — MG odbiera Akcje (narracja)                  | fleszuje bez narkotyku; pod narkotykiem odporny  |
| Dopalacz       | 24 h | 17 | **INT +2, może przekroczyć 8**                              | INT −2 (zawsze)                                 |
| Grzmot         | 4 h  | 15 | +2 do Tańca, Człowieka gumy, Konwersacji, Odczytywania emocji, Perswazji, Aktorstwa | −2 do tych samych Umiejętności |
| Syntkoka       | 4 h  | 15 | **REF +1, może przekroczyć 8**; paranoja (narracja)         | REF −2, gdy **nie** jest pod działaniem         |

## Projekt

### 59a — Wszczepy podnoszące BC

1. **Dane, nie gałąź w kodzie:** stała `CPRED_CHROME_STAT_MODS` w nowym
   `shared/systems/cpred/chromestats.ts` — wiersz na wszczep: rozpoznanie **po nazwie**
   (znormalizowanej, jak `cpredHasAirhypo`; wiersz wpisany ręką i z kompendium mają wspólną
   tylko nazwę) **albo** `compendiumId`, plus skutek `{ stat: 'body', add: 2, cap: 10 }` albo
   `{ stat: 'body', setTo: 12 | 14 }`.
2. **Jedna funkcja:** `cpredChromeStats(stats, cyberware)` → Cechy „z chromem”. Kolejność:
   przeszczepy (+2 każdy, sufit `max(10, bazowa)`), potem ramownica (`max(obecna, 12|14)`).
   Wymagań z opisu (BC 6/8, przeszczep) **nie egzekwujemy** — montaż i tak przechodzi przez MG
   albo Medyka (`cyberwareInstallRefusal` zostaje bez zmian); karta pokazuje tylko notkę.
3. **Chrom jest częścią bazy, nie efektem czasowym** — w przeciwieństwie do narkotyków **rusza
   pule** (podręcznik: „zwiększa liczbę PW, Próg Ran oraz wartość Przeżywalności”):
   - `cpredSheetHpMax` / `cpredSheetSeriousWoundThreshold` liczą z `cpredChromeStats`
     (`CpredStatBlockCarrier` dostaje opcjonalne `cyberware`; wydrukowane PW bloku dalej wygrywają),
   - przycinanie `hpCurrent` w `mergeCharacterData` (`character.ts:2564`) idzie przez tę samą
     funkcję zamiast `statBlockHpMax(data.stats, …)`,
   - `cpredEffectiveStats` zaczyna od Cech z chromem (przed Człowieczeństwem i efektami), więc
     Rzut na Śmierć, rzuty BC i rozbicie widzą 12/14 bez zmian u wołających.
   - Sufit `clampStat` już dziś jest `max(CPRED_STAT_MAX, bazowa)` — BC 14 z ramownicy przechodzi.
4. **Karta:** pole BC pokazuje dalej liczbę wydrukowaną, a obok małe „z 12” (to samo miejsce, co
   „z” Empatii i efektów z etapu 39), dymek: „Przeszczep splotu mięśniowo-kostnego +2”.
   Rozbicie rzutu: osobny wiersz „Chrom +2”, jak wiersz efektu.
5. **Wyjęcie wszczepu** oddaje BC samo (liczone, nie zapisane); `hpCurrent` przytnie się do
   nowego maksimum przy najbliższym zapisie — to samo zachowanie, co przy zmianie BC ręką MG.

### 59a — jak zrobiono (24.10)

Zlecenie MG: „wykonaj etap 59a; jeżeli znajdziesz więcej przypadków, gdzie można użyć tej
mechaniki, to tam też ją zastosuj”. Odpowiedzi MG z tej sesji: wszystkie cztery rozszerzenia
(stałe +2 do Umiejętności, Kerenzikov, Celownik optyczny i Teleskop, Czip Umiejętności),
premie zależne od zmysłu „obraz zawsze, reszta MG”, wymagania ramownic „tylko notka”,
zewnętrzne ramownice **w tym etapie**.

- **Tabela** `CPRED_CHROME_MODS` w `shared/systems/cpred/chromestats.ts` — wiersz na rzecz,
  rozpoznanie po wpisie kompendium albo po nazwie (`normalizeChromeName`: same litery i cyfry, więc
  „mięśniowokostnego” z kompendium = „mięśniowo-kostnego” z podręcznika), lista nośników
  (`cyberware` / `gear`). Skutki: `stat` (`add`+`cap` albo `setTo`), `skills`, `initiative`,
  `attack`, `skillChip`, `minCount`, `together`, `needsConnected`, `requires` (notka),
  `tableNote` (to, co dolicza MG).
- **Kolejność Cech:** wszczepy (`cpredChromeStats`) → Człowieczeństwo → efekty czasowe →
  podłączony egzoszkielet (`cpredGearStatSteps`). PW, Próg Ran i Przeżywalność liczą się z Cech po
  wszczepach (`cpredSheetHpMax`, `cpredSheetDeathSaveTarget`), egzoszkielet ich nie rusza.
  Rozbicie rzutu dostaje wiersze z `cpredStatModifierRows` (Test i atak).
- **Umiejętności:** `cpredSkillLevel` (wyuczony albo czip, większy) zastąpił `data.skills[id]`
  w regułach (Test, atak, Unik, Koncentracja, Zwarcie, Sztuki walki, statysta-operator, targowanie,
  boty, kubek); `cpredChromeSkillBonus` daje **największą** premię na Umiejętność (wiersz rozbicia
  i kolumna „Baza” na karcie, zielona z dymkiem). Detoksykator działa też w rzucie przeciw
  biotoksynie i strefom (`cpredCheckBase`).
- **Objęte:** przeszczep splotu, ramownice wszczepiane ∑/ß, ramownice zewnętrzne ∑/ß (sprzęt,
  „Podłącz”), Kerenzikov (+2 Inicjatywy, bez remisu), Celownik optyczny (+1 przy Celowaniu),
  Teleskop (+1 przy pojedynczym ≥ 51 m albo Celowaniu, wyłączany `conflictsWith` lunety),
  Czip Umiejętności (poziom 3, Umiejętność wybierana raz), Detoksykator, Analizator stresu,
  AudioVox (Aktorstwo), Poprawa obrazu (zawsze), Skaner medyczny i Techskaner (wszczep **i**
  sprzęt w plecaku), Superchrom, 3× Tatuaż świetlny, Chemskóra + Techfryz.
- **Notki zamiast liczb:** Ulepszony słuch i śpiew AudioVoksa (dolicza MG), wymagania ramownic,
  dwa złącza interfejsu egzoszkieletu, Poprawa obrazu w obu oczach.
- **Karta:** BC „6 z 12” z dymkiem źródeł, linijka skutku i notka pod nazwą wszczepu, wybór
  Umiejętności czipu, sekcja „Sprzęt z premią” w „Ekwipunku” z „Podłącz” / „Odłącz”, pięść 4k6.
- **Serwer:** gracz łatą podłącza egzoszkielet i raz nazywa czip (`cpredPlayerItemPatchProblem`),
  oddany egzoszkielet jedzie odłączony i nie skleja się z podłączonym.

### 59b — Narkotyki: katalog, zakup, „Zażyj”

1. **Katalog mechaniki w kodzie** — `shared/systems/cpred/drugs.ts`, `CPRED_STREET_DRUGS`
   wzorem `CPRED_PHARMACEUTICALS`: id (`drug.dopalacz` …), nazwa, czas (`durationS`), PT,
   skutek główny (`statMods`, `skillMods`, `ignoreSeriousWound`, `humanityLoss: '2k6'`),
   skutek uzależnienia (`statMods`, `skillMods`, `whenSober: true` dla Szprycy i Syntkoki),
   krótki opis własnymi słowami. Same liczby i parafrazy — bez przepisywania podręcznika
   (repo jest publiczne).
2. **Przedmiot:** wiersz ekwipunku z `consumable: 'drug.…'` (pole już istnieje dla farmaceutyków).
   Wpisy narkotyków dochodzą do `data/private/cpred/compendium/gear.json` (cena dawki z tabeli
   s. 357 × cennik domowy `CPRED_PRICE_SCALE_CONSUMABLE`), więc trafiają do sklepów, łupu
   i handlu bez nowej ścieżki. Do `data/public` — wymyślony narkotyk testowy.
3. **Zdarzenie:** `character:use-dose` rozpoznaje `drug.*` obok `pharma.*` — **bez bramki
   Medyka** (podręcznik: farmaceutyki wymagają wyszkolenia, „nie są to narkotyki uliczne”).
   Akcja (`CPRED_ACTION_DOSE`), cel z żetonu albo „sobie”, `hostile` przez strzykawkę — wszystko
   istnieje. Na karcie: przy wierszu narkotyku guzik „Zażyj” (i „Podaj…” przy wybranym celu),
   tam, gdzie dziś „Podaj” farmaceutyków (`CharacterSheet.tsx:3868`).
4. **Stan na karcie:** nowe pole `drugs: CpredDrugDose[]` — `{ id, drugId, durationS,
   expiresAtRound?, expiresAtMinute?, humanityLost? }`, terminy z `cpredStatEffectDeadlines`
   (te same dwa zegary). Druga dawka tego samego narkotyku **wydłuża** termin o pełny czas
   (nie dokłada drugiego wiersza i nie podwaja premii). Pole pisze wyłącznie silnik —
   wypada z `character:update` u wszystkich (umowa `statEffects` z etapu 39).
5. **Skutki główne:**
   - Cechy: premia z aktywnej dawki wchodzi do `cpredEffectiveStats` jako modyfikator obok
     `statEffects` (wspólna lista modyfikatorów → ta sama podłoga/sufit i te same wiersze
     rozbicia: „INT +2 (Dopalacz)”). **Nie rusza pul** — umowa z etapu 39 zostaje.
   - Czarna szpryca: −2k6 Człowieczeństwa rzucone raz przy zażyciu (zapisane w `humanityLost`)
     i ignorowanie Poważnie rannego — przez istniejące `woundSuspension` (to samo pole, co Stym,
     z terminem 24 h).
   - Grzmot: ±2 do sześciu Umiejętności — modyfikator w planerze rzutu (wiersz rozbicia
     „Grzmot +2”).
   - Błękitne szkło, paranoja Syntkoki, „głód”: tylko tekst na karcie czatu i chip na karcie.
6. **Chip na karcie i HUD-zie:** „Dopalacz — zostaje 23 h”, zdejmowalny przez MG (jak efekt).

### 59c — Koniec działania i uzależnienie

1. **Wygasanie:** oba istniejące przemiatania (rundowe `timed-effects.ts`, światowe z
   `gametime.ts` → `stat-effects.ts`) dostają `drugs` obok `statEffects`.
2. **Rzut na uzależnienie robi serwer** przy wygaśnięciu: SW (efektywna) + Odporność na
   tortury/narkotyki + 1k10 przeciw PT — karta czatu z rzutem (właściciel i MG). Już uzależniony
   od tego narkotyku nie rzuca.
3. **Uzależnienie:** pole `addictions: CpredDrugId[]` (pisze silnik i MG). Kary wchodzą do
   `cpredEffectiveStats` / planera: Dopalacz INT −2 zawsze; Szpryca i Syntkoka REF −2, gdy brak
   aktywnej dawki; Grzmot −2 do Umiejętności. Karta: sekcja „Uzależnienia” z dymkiem skutku.
4. **Czarna szpryca:** udany rzut oddaje `humanityLost` (do sufitu Człowieczeństwa), porażka nie.
5. **Terapia (s. 229):** MG zdejmuje uzależnienie guzikiem na karcie (bez kosztów i Testu
   Technologii Medycznej — to robi stół; rozliczenie w eurodolcach zostaje ręczne).
6. **Dynadetoks** (farmaceutyk „oczyszcza z narkotyków”) kończy aktywne dawki celu — patrz pytanie 3.

### Poprawka przy okazji

`cpredStatEffectDeadlines` liczy rundy jako `durationS / 10`, a runda od 17.10 trwa 3 s
(`CPRED_ROUND_SECONDS`) — godzina wychodzi 360 rund zamiast 1200. W praktyce kończy ją zegar
świata, ale umowa `czas` mówi, że termin rundowy liczy się ze stałej. Poprawić razem z 59b.

## Pytania do MG przed startem

1. **Sufit Cechy z narkotyku:** podręcznik mówi „może wynosić ponad 8”, nie podaje górnej
   granicy. Proponuję zostawić sufit 10 (`CPRED_STAT_MAX`) — Dopalacz na INT 9 daje 10, nie 11.
2. **Kara uzależnienia od Dopalacza** — „INT spada o 2” bez „gdy nie jest pod działaniem”.
   Proponuję dosłownie: zawsze (pod Dopalaczem uzależniony ma więc INT bez zmian).
3. **Dynadetoks na narkotyk:** kończy efekt główny — **z** rzutem na uzależnienie (podręcznik:
   rzut „po upływie działania”) czy **bez** (oczyszczenie)? Proponuję: bez rzutu.
4. ~~**Wymagania ramownic**~~ — **rozstrzygnięte 24.10: tylko notka** (BC i tak rośnie).
5. **Gdzie kupić:** wszędzie, gdzie gear z kompendium, czy tylko u handlarzy oznaczonych przez MG?
   Proponuję zwykłą półkę (poziom sklepu wg ceny), MG decyduje doborem handlarza.
6. **Boty:** czy boty mają same zażywać narkotyki? Proponuję **nie** w tym etapie — ich karty
   po prostu liczą skutki, jeśli MG im poda.

## Poza zakresem (do `POMYSLY.md` po akceptacji)

- Koszt i Test terapii uzależnienia (s. 229) jako mechanika zamiast guzika MG.
- Losowe „fleszowanie” i „głód” podpowiadane MG przez zegar.

## Kryteria ukończenia

- [x] Karta z przeszczepem splotu ma BC +2 (do 10), z ramownicą 12/14; PW, próg Poważnej Rany
      i Rzut na Śmierć liczą się z nowej BC; wyjęcie wszczepu oddaje stan. (59a, 24.10)
- [ ] Gracz kupuje i zażywa narkotyk z karty (Akcja w walce), sobie albo komuś; skutek główny
      widać na karcie, w rozbiciu rzutu i na czacie; druga dawka wydłuża czas.
- [ ] Dopalacz podnosi INT 8 → 10, Syntkoka REF 8 → 9 na czas działania; pule bez zmian.
- [ ] Po wygaśnięciu (zegar świata albo rundy) serwer rzuca na uzależnienie; porażka zapisuje
      uzależnienie z karami wg tabeli, MG je zdejmuje.
- [ ] Testy vitest w `shared` (chrom, modyfikatory, wydłużanie, kary uzależnienia) i testy dymne
      serwera (`use-dose` z narkotykiem, przemiatanie z rzutem). — część 59a zrobiona
      (`chromestats.test.ts`, 39 testów; `cyberware.test.ts` +4).
- [ ] Oględziny karty w Firefoksie (Playwright); umowy w sekcjach `postac`, `czas`, `ekwipunek`;
      wpisy w `decyzje-i-uproszczenia.md` dla rozstrzygnięć z pytań 1–4.
