# Etap 71 — Weryfikacja Ról: zgodność z podręcznikiem, doróbki, testy w przeglądarce

**Faza:** H — Świat CP RED · **Wymaga etapów:** 25a–25c (kreator), 29a–29b (PD,
wieloklasowość), 30a–30d (Zdolności Ról), 31 (dodatki do broni), 37 (kalendarz), 46–47
(handlarze, cennik), 59 (chrom, farmaceutyki, narkotyki), 65 i 67–68 (pojazdy, warsztat)

> **Projekt z 14.11.2026 (zlecenie MG).** Etap wielosesyjny: podetapy 71a–71h, jeden na sesję.
> **Netrunner jest poza zakresem** — Interfejs przeszedł własną przebudowę w etapie 70.
> Zakres podetapów 71c–71g jest **wstępny**: ostateczną listę doróbek ustala bramka MG po 71b.

## Skąd ten etap

Zdolności dziewięciu Ról powstały 29–30.08 (etap 30a–30d). Od tamtej pory doszły pojazdy
i pościg (65), zakup auta i warsztat (67–68), handlarze z asortymentem (46, 02.11), dodatki do
broni (31), kalendarz kampanii (37), farmaceutyki i narkotyki (59), kubek kości, lewa belka (69)
i skradanie (61). Wiele zdań podręcznika zostało w etapie 30 „zapisem dla stołu” z jednym
uzasadnieniem: **nie ma maszynerii**. Ta maszyneria dziś w dużej części istnieje, a nikt nie
sprawdził Ról po kolei wobec podręcznika i wobec tego, co VTT umie teraz.

Jedyny test przeglądarkowy Zdolności spoza scenariusza (`t8c-zdolnosci.spec.ts`) stoi na
**jednej karcie wieloklasowej** („Wielorak”, siedem Ról naraz) i sprawdza po jednej
szczęśliwej ścieżce i jednej odmowie. Nie mówi, czy Rolą da się **grać**.

## Decyzje MG z 14.11 (pytania na starcie projektu)

| pytanie                     | decyzja                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Wynik etapu                 | **Audyt + pełne doróbki** — co audyt uzna za możliwe do odwzorowania, jest implementowane                                                        |
| Bramka                      | **Jedna bramka MG po audycie** — lista doróbek z wyceną, MG odpowiada tak / nie / inaczej; dopiero potem sesje doróbek                           |
| Forma testów w przeglądarce | **Hybryda jak T8c** — stałe specyfikacje E2E + rozegranie scenki każdą Rolą przez Playwright MCP                                                 |
| Co znaczy „oddanie Roli”    | Cztery warstwy: **Zdolność Specjalna**, **kreator**, **rozwój i wieloklasowość**, **styk z mechanikami po etapie 30**                            |
| Stara „proza dla stołu”     | **Rewizja wszystkich wpisów, także decyzji MG** — każda dostaje pytanie „czy dalej tak?”; bez odpowiedzi MG decyzja zostaje w mocy               |
| Kolejność doróbek           | **Według maszynerii** (jak etap 30), nie według Ról                                                                                              |
| Mechaniki narracyjne        | **Liczby, liczniki i zasoby** stają się stanem gry (czas w kalendarzu, limity, wpisy na karcie); treść fabularną pisze MG; **bez treści od LLM** |
| Boty i NPC-e                | **Poza zakresem** — tylko postacie prowadzone przez ludzi                                                                                        |

## Styk z etapem 72 — przebudowa pościgu (weryfikacja z 15.11, decyzje MG)

Etap 72 (`etap-72-poscig-kokpit.md`) wyrzuca dzisiejszą jazdę: przeciąganie auta, budżet
`Ruch / 4`, Test zwykłej jazdy w `chase:move` (`drivingTested`) i akcje auta w menu pod prawym
klikiem. **Etap 71 nie dotyka więc sceny pościgu** — nic w nim nie jest sprawdzane, rozgrywane
ani dorabiane na modelu, który znika.

| co było w planie 71                                                 | co się z tym dzieje                                                                                                                                                         |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| asercja E2E „Moto w Manewrze na scenie pościgu” (NOM-02, 71b)       | **do etapu 72**: Wyścig i Manewr kierowcy-Nomady w `t72-*` (72c / 72g). W 71 dowodem zostaje test serwera `roles30d.test.ts`                                                |
| scenka Nomady: „wyprowadzenie auta na scenę pościgu, Manewr z Moto” | **część pościgowa do 72g** (kierowcą w rozegraniu wzorca jest Nomada z Moto, ocena w tych samych trzech punktach). W 71 scenka kończy się na Taborze, ulepszeniu i naprawie |
| NOM-03 — czy Moto liczy się do progu „słabego kierowcy”             | **decyzja MG 15.11: tak**. Zmiana wchodzi z nowym modelem (72a / 72c — próg decyduje o utracie kontroli w Wyścigu), nie w 71c                                               |
| „Moto w Testach pościgu” w 71c                                      | wypada z 71c (NOM-02 jest ✅, reszta to etap 72)                                                                                                                            |
| STR-12 — Wsparcie wjeżdża autem w scenie pościgu (71f)              | **po etapie 72, osobna pozycja** (posiłki panelu „Pościg”, zamiar „Goń”); etap 71 zamyka się bez niej                                                                       |
| scenka Technika: „naprawa auta po pościgu”                          | zostaje, ale **bez rozgrywania pościgu** — auto uszkadza MG (PUK na karcie pojazdu)                                                                                         |
| punkt kontrolny `role-start` z „pojazdem”                           | pojazd na karcie postaci, **bez sceny pościgu** (migracja 72b nie rusza punktu kontrolnego)                                                                                 |

**Co etap 72 zostawia i co w 71 jest bezpieczne:** `Vehicle` na karcie, Tabor, PUK, ulepszenia
i warsztat (NOM-04…NOM-14, TEC-18, TEC-19, FIX-S1), broń pokładowa przez planer ataku (SOL-16),
inicjatywa (SOL-08, STR-16). Doróbki 71c pracują na karcie i w Kompendium, nie w `chase-*`.
Jedyny wspólny plik to kreator pościgu (krok „Auta”, 72f) — znacznik „pojazd Taboru w użyciu”
(NOM-08) ma go nie przebudowywać.

## Cel

Po etapie dla każdej z dziewięciu Ról istnieje **udokumentowana odpowiedź** na pytanie „co
z podręcznika działa w VTT, co jest uproszczone i dlaczego”, wszystko, co dało się policzyć,
jest policzone przez serwer, a każda Rola ma stały test E2E i rozegraną scenkę w przeglądarce
innej niż Chrome MG.

## Metoda: macierz zgodności

Sercem etapu jest plik **`docs/etapy/role-macierz.md`** — jedna tabela na Rolę, jeden wiersz
na **regułę** podręcznika (nie na akapit: zdanie z dwiema liczbami to dwa wiersze).

| kolumna        | treść                                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| nr             | `SOL-07`, `FIX-12` — stały identyfikator, którym posługują się testy, commity i lista bramki         |
| strona         | numer strony polskiego wydania                                                                       |
| reguła         | **parafraza własnymi słowami** (patrz „Licencja” niżej)                                              |
| warstwa        | Zdolność / kreator / rozwój / styk                                                                   |
| stan           | jeden z sześciu znaczników niżej                                                                     |
| dowód          | `plik:funkcja`, nazwa testu vitest albo id testu E2E; dla prozy — wpis w `decyzje-i-uproszczenia.md` |
| odwzorowalność | klasa A–D niżej                                                                                      |
| doróbka        | co zrobić + wycena **S / M / L** (do godziny / pół sesji / sesja lub więcej)                         |

**Stany:** ✅ działa zgodnie z podręcznikiem · 🟡 działa, świadomie uproszczone (jest wpis
decyzji) · 📜 proza dla stołu · ❌ brak · ⚠️ błąd (jest, ale liczy źle albo UI nie pozwala
użyć) · ❓ podręcznik niejednoznaczny, potrzebna decyzja MG.

**Klasy odwzorowalności** — to jest kryterium „możliwości odwzorowania w systemie
komputerowym”, stosowane jednakowo do każdego wiersza:

| klasa | co to za reguła                                                            | co robi VTT                                                            |
| ----- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **A** | liczba, rzut, próg, modyfikator                                            | liczy serwer, czysta funkcja w `shared`, test jednostkowy              |
| **B** | czas, limit, zasób („raz na tydzień”, „po jednym na poziom”, „10 min”)     | stan na karcie albo w kampanii, odliczany kalendarzem z etapu 37       |
| **C** | uznanie MG z policzalnym skutkiem („MG może ukarać”, „jeśli uzasadnione”)  | narzędzie MG: przycisk, przypomnienie w kolejce decyzji, nigdy automat |
| **D** | czysta fabuła (kto jest fanem, co mówi pogłoska, jak wygląda McPosiadłość) | proza na karcie; wpis w `decyzje-i-uproszczenia.md` z uzasadnieniem    |

Reguła klasy A lub B w stanie 📜 albo ❌ to **kandydat na doróbkę**. Reguła klasy D w stanie
📜 jest w porządku i dostaje tylko potwierdzenie wpisu decyzji.

### Licencja (KRYTYCZNE — repo jest publiczne)

Macierz w repo zawiera **numery stron i parafrazy**, nigdy przepisane ramki, tabele ani
akapity. Jeśli do pracy potrzebny jest dosłowny tekst obok wiersza, powstaje
`data/private/cpred/role-macierz-cytaty.md` (gitignore), łączony z macierzą identyfikatorem
wiersza. Źródło do czytania: `data/private/rulebook/text/`. Przed każdym commitem:
`git status` bez plików z `data/private/`.

## Stan wyjściowy (z dokumentów etapu 30 i kodu — do potwierdzenia w 71a)

Sprawdzone przy projektowaniu: cała mechanika Zdolności mieszka w
`packages/shared/src/systems/cpred/roleability.ts` (3194 linie), panele w `CharismaPanel`,
`CredibilityPanel`, `MotoPanel`, `OperatorPanel`, `CombatAwarenessPanel` i pasie
`.cp-role-strip` karty, rzuty w `server/src/realtime/character-rolls.ts`.

Punkty, od których audyt zaczyna (hipotezy, nie ustalenia):

| Rola        | co dziś stoi prozą albo uproszczeniem                                                                                           | maszyneria, która doszła po etapie 30                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Solo        | sześć zdolności Zmysłu Walki liczonych; nieznany styk z kubkiem, auto-unikiem (63b), pościgiem, skradaniem, bronią pokładową    | kubek, 61, 63b, 65                                     |
| Technik     | z dziesięciu skutków Ulepszania liczony jeden (+1 OB); Prowizorka bez zegara; Wytwarzanie i Wynajdywanie jako modyfikator       | 31 (gniazda dodatków), 37 (czas), 65/68 (pojazdy, PUK) |
| Medyk       | Farmaceutyki jako zapas dawek i Łatanie — odłożone w etapie 30b; kriosystemy prozą                                              | 59 (farmaceutyki, narkotyki), 37, zawieszenie ran      |
| Nomada      | Tabor Rodziny (od 65a prawdziwe pojazdy); wpis decyzji „Tabor to lista” oznaczony jako nieaktualny, reszta nieprzejrzana        | 65, 67, 68                                             |
| Fixer       | Zasięg nie przebija poziomu sklepu (decyzja MG 30.08); z sześciu targów liczone dwa; Nocny Targ poza zakresem                   | 46, asortyment handlarza z 02.11, 47                   |
| Korpo       | przywileje (mieszkanie, Trauma Team) prozą; cyborgizacje zespołu prozą; Lojalność „między sesjami” ręcznie                      | 23b rozliczenie miesiąca, 37, 44c (sesje), 59a         |
| Stróż Prawa | pojazdy Wsparcia poziomu 10 prozą; nadużycie tylko jako przypomnienie; inicjatywa na samą kość; nieznany styk z pościgiem       | 65 (pojazdy i scena pościgu)                           |
| Rocker      | blokada prośby „na tydzień” bez odliczania; „ci fani” nie istnieją jako wpis                                                    | 37                                                     |
| Media       | limit Pogłosek na tydzień jako stała bez licznika (`CPRED_RUMOUR_ROLLS_PER_WEEK` czytają tylko panele); skutek publikacji prozą | 37, 24b (dziennik), 24c (screamsheets)                 |

Stałe `CPRED_CHARISMA_REFUSAL_DAYS`, `CPRED_RUMOUR_ROLLS_PER_WEEK`
i `CPRED_FIELD_REPAIR_MINUTES_PER_LEVEL` są dziś używane tylko jako tekst w panelach — to
pierwsi kandydaci klasy B.

## Podetapy

### 71a — Audyt na papierze i w kodzie (bez zmian mechaniki)

- [x] Przeczytać w `data/private/rulebook/text/` rozdział Ról (Zdolności dziewięciu Ról), części
      kreatora zależne od Roli (pakiety Umiejętności, wyposażenie startowe, Ścieżka Życia Roli)
      i zasady rozwoju (koszt rangi Zdolności, zmiana Roli); zajrzeć do FAQ i DLC z tego
      samego katalogu pod kątem errat do Ról
- [x] Założyć `role-macierz.md`: dziewięć tabel, każda reguła z identyfikatorem, stanem,
      dowodem i klasą odwzorowalności
- [x] Dowód każdego ✅ i 🟡 to **wskazany kod albo test**, nie pamięć o etapie 30; gdzie testu
      jednostkowego brak, dopisać go w tej sesji (testy wolno dodawać, mechaniki nie zmieniać)
- [x] Warstwa „kreator”: porównać `roleKits` i pakiety z `creation.json` (wersja z
      `data/private/cpred/`) z podręcznikiem dla każdej z dziewięciu Ról; rozjazdy danych to
      wiersze ⚠️
- [x] Warstwa „rozwój”: koszt i sufit rangi, sakiewki Specjalizacji przy awansie (Twórca 2
      różne, Medycyna 1), próg wieloklasowości, zachowanie Zdolności dawnej Roli
- [x] Rewizja **każdego** wpisu `decyzje-i-uproszczenia.md` dotyczącego etapów 30a–30d, 29b
      i kreatora Ról: wiersz macierzy + rubryka „powód nadal aktualny? tak / nie”
- [x] Błędy znalezione przy czytaniu kodu → `testy-rejestr.md` i wiersz ⚠️; **naprawa po
      bramce**, chyba że błąd psuje dane (wtedy od razu i z notatką)

**Kryteria ukończenia 71a**

- [x] Macierz ma komplet wierszy dla dziewięciu Ról i czterech warstw; żaden wiersz bez stanu
      i bez dowodu
- [x] `pnpm test` zielone po dopisaniu testów charakteryzujących
- [x] W repo nie ma ani jednego przepisanego akapitu podręcznika — macierz niesie same
      parafrazy; zastane zdania podręcznika w `roleability.ts` (etap 30) to wiersz WSP-19,
      decyzją MG z 14.11 na liście bramki

**Wynik 71a (14.11.2026).** `role-macierz.md`: 194 wiersze (101 ✅, 28 🟡, 31 📜, 21 ❌, 5 ⚠️,
8 ❓) w dziesięciu tabelach — dziewięć Ról i „wspólne” (kreator, rozwój, wieloklasowość).
Testy charakteryzujące: `role-matrix.test.ts` (8, w tym jeden `it.fails` na błąd #83). Trzy
błędy w `testy-rejestr.md` (#83–#85), naprawa po bramce (decyzja MG). Dziewięć wpisów decyzji
z etapu 30 ma nieaktualny powód („nie ma maszynerii”) — tabela „Rewizja wpisów decyzji”
w macierzy; same wpisy dostaną dopiski w 71h. Decyzje MG z pytań na koniec sesji stoją
w macierzy („Decyzje MG z 14.11”): listy Umiejętności Rockera i Medyka wg oryginału, teksty
podręcznika w kodzie na listę bramki.

**Uwagi dla 71b:** (1) Krawędziarz nie dostaje pakietu Roli (WSP-08) — fikstura `role.ts` zakłada
postacie gniazdem MG, więc to jej nie blokuje; (2) specyfikacje oznaczają #83–#85 przez
`test.fail`; (3) do sprawdzenia asercją: Zmysł Walki w rundzie 0 (SOL-02), Wyczucie zagrożenia
w Percepcji rzucanej przez serwer (SOL-15). ~~Moto w Manewrze na scenie pościgu (NOM-02)~~ —
od 15.11 w etapie 72 („Styk z etapem 72”).

### 71b — Stan dzisiejszy w przeglądarce, potem bramka MG

- [x] Fikstura `packages/e2e/fixtures/role.ts`: dziewięć postaci, **każda z jedną Rolą**
      (nie wieloklasowy „Wielorak”), zakładanych gniazdem MG; ranga 4 (start z kreatora) oraz
      wariant wysokiej rangi tam, gdzie reguła ma próg powyżej 4
- [x] Punkt kontrolny E2E `role-start` (kampania, scena z mapą, handlarz, pojazd **na karcie —
      bez sceny pościgu**, statysta-cel, kalendarz ustawiony) — wspólny start specyfikacji
      i rozegrań
- [x] Specyfikacje i scenki **nie wchodzą na scenę pościgu** („Styk z etapem 72”)
- [x] Specyfikacje `packages/e2e/specs/52-role/t71-<rola>.spec.ts` w wersji „stan dzisiejszy”:
      każdy wiersz macierzy w stanie ✅ / 🟡 klasy A–B, który ma UI, dostaje asercję w przeglądarce
      (kość ze `scriptDice`, wynik czytany z bazy, nie z ekranu)
- [x] **Pierwsze rozegranie**: krótka scenka każdą Rolą (tabela „Scenki” niżej), gracz
      w Firefoksie (Playwright MCP), MG w czystym Chromium; ocena w trzech punktach: czy gracz
      **znajdzie** Zdolność bez instrukcji, czy rozumie wynik z karty na czacie, ile kliknięć
      kosztuje typowe użycie
- [x] Znaleziska rozegrań dopisane do macierzy (⚠️ błąd UI także jest wierszem)
- [x] **Lista bramki** na końcu `role-macierz.md`: każda proponowana doróbka z identyfikatorami
      wierszy, wyceną S/M/L, proponowanym podetapem i — gdzie trzeba — pytaniem do MG
      z wariantami. Decyzje MG z etapu 30 stoją na liście osobno jako „czy dalej tak?”

**Bramka MG.** MG przechodzi listę (`AskUserQuestion` paczkami po kilka pozycji albo edycja
pliku). Wynik zapisany w sekcji „Decyzje bramki” tego pliku; podetapy 71c–71g przepisane pod
zatwierdzony zakres (rule 7 z `CLAUDE.md`: korekta planu po akceptacji).

**Kryteria ukończenia 71b**

- [x] Dziewięć specyfikacji przechodzi na obecnym kodzie (`pnpm test:e2e t71-`)
- [x] Dziewięć scenek rozegranych, notatka mówi, w czym oglądano
- [x] Lista bramki kompletna i **zatwierdzona przez MG**

**Wynik 71b (15.11.2026).** Fikstura `packages/e2e/fixtures/role.ts`, punkt `role-start` budowany
przez `52-role/t71-00-start.spec.ts` z `po-T6` (dziewięciu graczy, scena „Poligon Ról”, Manekin,
handlarz „Lada 71”, auto Technika na karcie). Dziewięć specyfikacji `52-role/t71-<rola>.spec.ts`
(40 testów, 7 `test.fail` na #84–#87) — `pnpm test:e2e t71-` zielone. Nowe błędy w
`testy-rejestr.md`: #86 (druga Prowizorka przed pełną naprawą), #87 (belka w rundzie 0), #84
rozszerzony o Wsparcie. #83 (SOL-10) zostaje w `role-matrix.test.ts` (`it.fails`) — Ogień ciągły
w E2E wymagałby osobnego przygotowania. Dziewięć scenek rozegranych w Firefoksie (gracz) i Chromium
(MG) — tabela „Rozegrania 71b” w `role-macierz.md`. SOL-15 rozstrzygnięte kodem (✅). Lista
bramki w macierzy, **zatwierdzona przez MG 15.11** — niżej „Decyzje bramki”.

### 71c–71g — Doróbki według maszynerii (przepisane po bramce 15.11)

Każdy podetap: mechanika w `shared` z testami vitest → serwer (walidacja, odmowy po polsku) →
UI → **asercja w specyfikacji E2E Roli** → aktualizacja wierszy macierzy i wpisów
w `decyzje-i-uproszczenia.md` (wpis nieaktualny dostaje dopisek z datą, nie znika). Numery G/D/P
to pozycje „Listy bramki” w `role-macierz.md`.

| podetap  | maszyneria                  | pozycje                                                                                                                                             |
| -------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **71c0** | błędy z audytu i rozegrań   | G1 (#84), G2 (#83), G3 (#85 Prowizorka jako Test), G4 (#86), G5 (#87) — `test.fail` w `t71-*` przechodzą na `test`                                  |
| **71c1** | pojazdy Taboru              | G6 auto „w użyciu”, G7 naprawa u Rodziny, G8 ranga 10, G9 broń od Rodziny, G38 Tabor tylko z tabeli s. 162                                          |
| **71c2** | naprawa i montaż Technikiem | G11 zwykła naprawa pancerza / broni / auta z Testem i czasem (warsztat zostaje obok), G10 montaż ulepszenia, P5 OB gracza tylko w dół               |
| **71d1** | walka i leczenie            | G12 Prowizorka puszcza sama, G14 gniazda, G15 jakość Doskonała, G16 UC wszczepu, G17 limity dzienne, G18 czas zabiegu (propozycja dla MG), G40, G41 |
| **71d2** | Praca Twórcy i kriosystemy  | G13 Ulepszanie / Wytwarzanie z PT, czasem (propozycja dla MG) i surowcami w ed, G19 kriopompa                                                       |
| **71e**  | handel i pieniądze          | G20 targ sporny (karta handlarza, inaczej MG), G21, G22, G23, G25, G26, P6 pracownik obok Korpo                                                     |
| **71f**  | czas i zasoby narracyjne    | G27 fani i blokada 7 dni, P2 fani tylko poza walką, G28, G29, G30, G31, G32, G39                                                                    |
| **71g1** | kreator, PD, wieloklasowość | G33 pakiet Krawędziarza, G34 listy Rockera i Medyka, G35 + D3 zamiana Roli za PD jak nowa Rola, G36, D2 wybór środka, P4 dane Ulicznika Fixera      |
| **71g2** | licencja                    | G37 parafraza zdań podręcznika w `roleability.ts` (L)                                                                                               |

**Wynik 71c0 (15.11.2026) ✅.** G1 (#84): `characterFigure` (`combat-actions.ts`) — Zmysł Walki,
Wsparcie i Prowizorka płacą Akcję figurą karty w walce także bez `tokenId` (panel Wsparcia na
karcie przestał być darmowy). G2 (#83): Wykrycie słabości jako `afterMultiplier` — dochodzi po
mnożniku Ognia ciągłego. G3 (#85): Prowizorka to rzut `fieldRepair` przez kubek — TECH +
Podstawowe naprawy (FAQ) + Naprawa przeciw PT naprawy z pasma ceny wpisu (s. 140, nowy moduł
`repair.ts`), Akcja przed kośćmi. G4 (#86): „Koniec prowizorki” zostawia `fieldRepairSpent`,
zdejmowany przy pełnym OB. G5 (#87): kafel Zmysłu Walki czynny w rundzie 0. Rozstrzygnięcia bez
pytań — `decyzje-i-uproszczenia.md` („Błędy Ról z audytu”); umowy na górze `postac`.

**Wynik 71c1 (15.11.2026) ✅.** Tabor Rodziny jako stan na pojeździe (nowe moduły
`systems/cpred/fleet.ts`, `realtime/fleet.ts`, `FleetVehicleControls`). G6 (NOM-08): „Biorę to
auto” na karcie auta — pierwsze w użyciu od razu, wymiana przyjeżdża o najbliższej 6:00 zegara
świata (`vehicle:fleet-use`). G7 (NOM-09): „Oddaj Rodzinie do naprawy” tylko przy wraku — 500 ed,
auto „U Rodziny” 7 dni kalendarza (`vehicle:family-repair`). G8 (NOM-11): Moto 10 — cały Tabor
w użyciu, „Do Taboru Rodziny” (`fleetJoined`), „Rodzina montuje” za 10 000 ed; auto Taboru
(także dołożone) nie idzie do warsztatu 68. G9 (NOM-14): prezent jednej z trzech broni przy
pierwszym Stanowisku (`character:fleet-gift`, `fleetGift` na karcie). G38 (NOM-06): wiersz
„Pojazd” tylko z wpisów z progiem Moto, odmowa `NOT_FLEET_VEHICLE`. Bez migracji (pola w JSON-ie
`Vehicle.system` i karty). Rozstrzygnięcia — `decyzje-i-uproszczenia.md` („Tabor Rodziny jako
stan gry”), umowa na górze `postac`, E2E `t71-nomada` (9 testów).

**Wynik 71c2 (15.11.2026) ✅.** Zwykła naprawa i montaż Technikiem jako Testy przez kubek
(rodzaje rzutu `repair` i `vehicleUpgrade`, moduły `repair.ts` + `vehiclework.ts`,
`realtime/repair-work.ts`, `RepairWork.tsx`). G11 (TEC-19, TEC-15, TEC-S1, NOM-10): „Napraw”
przy pancerzu (Podstawowe naprawy, PT i czas z pasma ceny wpisu, „Szybsza naprawa” połowi czas)
i „Napraw (Test)” przy aucie (Naprawa pojazdów wg rodzaju, PT i czas ze stopnia uszkodzeń) dla
każdej postaci — Naprawa Technika i Moto dochodzą same; Technik naprawia rzeczy drużyny
z panelu Twórcy („Naprawa i montaż — rzeczy drużyny”, `repair:targets`); warsztat 68 obok;
poza walką. Czas pracy to **propozycja zegara dla MG** — przycisk na karcie rzutu (`roll:clock`,
raz), porażka — pół czasu. G10 (TEC-18): „Zamontuj” ulepszenie z progu Moto 1 — PT 24, dwa
tygodnie, surowce = cena wpisu (płatne przy sukcesie), raz na auto (`techUpgrade`). P5:
bieżące OB gracz tylko obniża — egzekwowane od 48c, dopisany test. Broń nie ma stanu
uszkodzenia — naprawy broni nie ma (`POMYSLY.md`). Bez migracji. Rozstrzygnięcia —
`decyzje-i-uproszczenia.md` („Naprawa i montaż Technikiem”), umowy na górze `postac` i `czas`,
E2E `t71-technik` (+3), `t71-nomada` (+1).

**Wynik 71d1 (15.11.2026) ✅.** G12 (TEC-05): łata Prowizorki niesie terminy rundy i zegara
świata, puszcza w przemiataniach efektów („Prowizorka puściła: …”), koniec łaty to OB sprzed
niej albo niższe (`cpredFieldRepairEnded`). G14–G16 (TEC-12, TEC-13, TEC-14, TEC-16, TEC-17):
nowy moduł `itemupgrade.ts` — czwarte gniazdo broni, gniazdo deku i opcji wszczepu bazowego,
gniazdo w broni egzotycznej, jakość Doskonała (+1 w ataku), broń do ukrycia, UC znalezionego
wszczepu niższa o 1k6 przy montażu; stempel wpisuje MG menu „Ulepszenie…” przy przedmiocie
(`ItemUpgrade.tsx`), Test Technika stempluje tą samą funkcją w 71d2. G17 (MED-12, MED-13):
limit „raz dziennie” był egzekwowany od 59b — dopisany test Turbo uzdrawiacza. G18 (MED-16):
Łatanie (1 min), Leczenie (4 h) i partia farmaceutyków (1 h) proponują MG zegar na karcie
rzutu. G40 (MED-09): „Wytwórz” czeka na zapis punktów (`characterSaved`), „2 dawki”. G41
(SOL-05, SOL-11): „−1 obrażeń” przy Redukcji, kubek „… +2 Wykrycie słabości”. Bez migracji.
Rozstrzygnięcia — `decyzje-i-uproszczenia.md` („Walka i leczenie po weryfikacji Ról”), umowy na
górze `postac`, `czas`, `karta`; E2E `t71-technik` (+2), `t71-medyk` (+1), `t71-solo` (G41).

**Wynik 71d2 (16.11.2026) ✅.** G13 (TEC-03, TEC-07, TEC-08, TEC-09, TEC-11, TEC-15): Praca
Twórcy jako rodzaje rzutu `itemUpgrade` i `fabricate` na rurze naprawy z 71c2 (nowy moduł
`systems/cpred/fabrication.ts`). **Ulepszanie** rzeczy kart drużyny w robotach drużyny panelu
Twórcy (lista z `repair:targets`, pole `items`): sposób z s. 148 (bez wynalazku i ulepszenia
auta), Test TECH + Umiejętność rzeczy + Ulepszanie przeciw PT z pasma, surowce = cena pasma
w cenniku domowym, płatne przy sukcesie, stempel tą samą `cpredApplyItemUpgrade` co menu MG.
**Wytwarzanie** z Kompendium (wyszukiwarka): broń, dodatki, pancerz, sprzęt, wszczepy — surowce
o pasmo niżej, rzecz na kartę Technika, poziom sklepu jak przy zakupie. Czas — propozycja
zegara dla MG. G19 (MED-17): kriopompa jako wiersz Wyposażenia z ładunkami (1 / 2 / 3), odbiór
z pierwszego punktu Obsługi kriosystemów, „Zamroź” (Akcja, zasięg ramienia) — stan `cryo` na
karcie pacjenta z tygodniem zegara, „Nieprzytomny”, bez rzutów przeciw śmierci; „Rozmroź”,
płyn 150 ed za ładunek (moduły `cryo.ts`, `realtime/cryo.ts`, `CryoPump.tsx`). Kriozbiorniki
prozą. Bez migracji. Rozstrzygnięcia — `decyzje-i-uproszczenia.md` („Praca Twórcy
i kriopompa”), umowy na górze `postac` i `czas`; E2E `t71-technik` (+2), `t71-medyk` (+1).

**Wynik 71e (16.11.2026) ✅.** Handel i pieniądze (nowe moduły `systems/cpred/haggling.ts`,
`teamloyalty.ts`, `realtime/debts.ts`, `exchange/CounterHaggle.tsx`). G20 (FIX-01, FIX-14):
druga strona targu przy ladzie to karta handlarza (CHA + Handel + Znajomości, liczy serwer),
poza sklepem sumę podaje MG („Daj graczowi”, jeden rzut ją zużywa); jeden rzut na ladę do
transakcji; handlarz-Fixer urywa przy skupie 10% / 20%, dopóki sprzedający nie wygra z nim rzutu
(„Targuj się o cenę skupu”); targ dobity przy ladzie działa tylko u niej. G21 (FIX-04): procent
na cięższą stronę koszyka (zakup albo sprzedaż). G22 (FIX-05): szósta sztuka gratis. G23
(FIX-06): „pół teraz, pół za miesiąc” — rata na karcie z terminem miesiąca kalendarza, „Spłać”
/ „Umorz” (MG), po terminie targ zamknięty na zawsze i wiersz dla MG. G25 (KOR-12…14):
zamknięcie sesji ścina Lojalność do 10, proponuje MG −1 pracownikom bez wzrostu („−1” /
„Pomiń”) i przypomina o odejściu. G26 (KOR-15): „Następca (200 ed)” pobiera opłatę z karty.
P6 (KOR-S1): pracownik staje obok figury Korpo na aktywnej scenie. Bez migracji.
Rozstrzygnięcia — `decyzje-i-uproszczenia.md` („Handel i pieniądze po weryfikacji Ról”), umowy
na górze `postac` i `ekwipunek`; testy `haggling.test.ts`, `teamloyalty.test.ts`,
`trade71e.test.ts`; E2E `t71-fixer` (+2), `t71-korpo` (+2).

**Wynik 71f (16.11.2026) ✅.** Czas i zasoby narracyjne (nowe moduły
`systems/cpred/rolefans.ts`, `rolerumours.ts`, `backuplog.ts`, `realtime/role-records.ts`;
`gameWeekIndex` w `gametime.ts`). G27 (ROC-08, ROC-09): grupy fanów na karcie — udany Test „nowi
fani” dopisuje grupę, prośba pada do grupy z karty (`NO_FAN_GROUP`), odmowa zamyka grupę na 7 dób
zegara świata (`FANS_REFUSED`), MG wpisuje fanów bez rzutu, usuwa ich i zdejmuje blokadę
(`character:fans`). P2 (ROC-04): nowych fanów nie robi się w walce (`FANS_IN_COMBAT`). G28
(MDA-04): licznik Pogłosek w tygodniu kalendarza na guziku MG i przypomnienie w przemiataniu
zegara. G29 (MDA-05): „Szukaj pogłosek” — wezwanie MG z PT z tabeli albo prośba gracza o Test.
G30 (MDA-10): rejestr publikacji — temat obowiązkowy, powtórka tylko z nowymi informacjami, wpis
usuwa MG (`character:publication`). G31 (STR-13): druga broń kategorii jako drugi wiersz karty
funkcjonariusza. G32 (STR-14): licznik wezwań z odzewem (dziś / tydzień) u MG. G39: karta
Pogłosek pisze „>”. Bez migracji (cztery pola w JSON-ie karty). Rozstrzygnięcia —
`decyzje-i-uproszczenia.md` („Czas i zasoby narracyjne po weryfikacji Ról”), umowy na górze
`postac` i `czas`; testy `rolenarrative.test.ts`, `roles71f.test.ts`; E2E `t71-rocker` (6,
przepisany), `t71-media` (+3), `t71-stroz` (+1). G31 bez asercji E2E — Stróż z punktu
`role-start` ma rangę 4, a druga broń zaczyna się od kategorii 5–7 (dowodem test serwera).

**Wynik 71g1 (17.11.2026) ✅.** G33 (WSP-08): pakiet Roli Krawędziarza kładzie kreator — dane
`edgerunnerKits` w `creation.json` (s. 98, 103, 117, przepisane ręką ze sklejonych tabel),
wybory „lub” to pola w kroku „Wyposażenie” (`kitPicks`, brak w `creationIssues`), te same
funkcje co wyposażenie Kompletnego Pakietu (`creationRoleKit`, `creationKitSheetRows`);
amunicja do broni palnej bez dna, strój prozą w notatkach, chrom wszczepia MG. G34 (ROC-K1,
MED-K1): listy Rockera i Medyka wg oryginału (`ORIGINAL_EDITION_SWAPS` w parserze, pakiety
Ulicznika też). D3 + G35 (WSP-18): powrót do Roli z karty za 60 PD z zachowaną rangą, „Zrób
główną” przy Roli poprzedniej w Awansie — u MG zamiana bez bramki i PD (`gmSwap`). D2 (MED-08):
Medyk wybiera środek przy punkcie Farmaceutyków (`pharmaPicks`, `character:pharma-pick`; stara
karta z kolejności tabeli). G36 (FIX-12): awans Znajomości na 3 / 5 / 7 pisze wiersz `gmaction`
o nowym języku. P4 (WSP-23): Ulicznik Fixera — pistolet i lekka broń biała. Bez migracji.
Rozstrzygnięcia — `decyzje-i-uproszczenia.md` („Kreator, PD i wieloklasowość…”, cztery wątpliwe
komórki zrzutu ❓ do sprawdzenia w druku), umowy na górze `postac`; testy `creation.test.ts`,
`role-matrix.test.ts`, `advancement.test.ts`, `srv: creation`, `advancement`, `recovery`; E2E
`t3a` (Kowal z pakietem, potem MG przebiera go do scenariusza), `t71-medyk`, `t71-rocker`,
`t71-fixer`, `t71-solo`.

**Wynik 71g2 (18.11.2026) ✅.** G37 (WSP-19): wszystkie zdania o regułach w `roleability.ts`
przepisane własnymi słowami — opisy Zmysłu Walki, Specjalizacji Twórcy i Medycyny, dziesięć
skutków Ulepszania, grupy Wsparcia, przywileje i tabela Lojalności Korpo, zadania pracowników,
drabiny Rockera, Fixera i Media, targi, odmowa „dużej grupy” i cytaty w komentarzach (te po
angielsku), każde z numerem strony. Nazwy, listy nazw i liczby zostają. Miara: wspólny ciąg
≥ 6 słów z prywatnym podręcznikiem — przed: ~1500 słów w 142 ciągach, po: tylko listy nazw.
Strażnik: `server/src/licensing.test.ts` („no rulebook sentences in committed code”, lista
`guarded`, pomija się bez `data/private`). Reguły bez zmian — testy Ról zielone (jedna asercja
fragmentu zdania w `rolerolls.test.ts` przepięta), E2E `52-role` zielone. Reszta kodu (~535
ciągów poza `roleability.ts`) — `zaleglosci.md` (18.11); tabele liczb do `data/private` —
`POMYSLY.md`. Rozstrzygnięcia — `decyzje-i-uproszczenia.md` („Parafraza zdań podręcznika…”).

Poza etapem 71: **G24 Nocny Targ — osobny etap** (`POMYSLY.md`), NOM-02 / NOM-03 — etap 72,
STR-12 — po etapie 72, KOR-04 — tylko z abonamentem Trauma Team.

**Kryteria ukończenia każdego z 71c–71g**

- [ ] Każda zatwierdzona doróbka podetapu ma test jednostkowy w `shared` i asercję E2E
- [ ] Odmowy serwera mają zdanie po polsku i test podrobionego zdarzenia z gniazda gracza
- [ ] Migracja bazy (jeśli jest) w repo; stare karty czytają się bez błędu (`readCpred…`)
- [ ] Wiersze macierzy przestawione na ✅ albo 🟡 z dowodem
- [ ] Zmiana UI obejrzana w Firefoksie

### 71h — Zamknięcie: pełna suita i rozegranie końcowe

- [ ] Specyfikacje `t71-*` uzupełnione o wszystkie doróbki, oznaczone `@szybkie` tam, gdzie nie
      potrzebują LLM; wpis w `testy.md`
- [ ] `t8c-zdolnosci.spec.ts` zostaje jako test **wieloklasowości** (wszystkie panele na jednej
      karcie); asercje pojedynczych Zdolności, które zdublowały się z `t71-*`, wypadają
- [ ] **Drugie rozegranie** tych samych dziewięciu scenek w Firefoksie; porównanie z pierwszym
      (te same trzy punkty oceny)
- [ ] Macierz bez wierszy ❌ i ⚠️ poza odrzuconymi przez MG na bramce (te mają wpis decyzji)
      i przekazanymi etapowi 72 (NOM-03, STR-12 — wiersz wskazuje, gdzie czeka)
- [ ] `decyzje-i-uproszczenia.md`: nowa sekcja „Role po weryfikacji (etap 71)” z tym, co
      świadomie zostało prozą, i odsyłaczem do macierzy
- [ ] `umowy-kodu.md` (`postac`), `POSTEP.md`, `archiwum/tabela-etapow.md` zaktualizowane

**Kryteria ukończenia etapu 71**

- [ ] Każda reguła klasy A i B dziewięciu Ról jest ✅ albo 🟡 z decyzją MG (poza NOM-03
      i STR-12, które czekają na etap 72)
- [ ] Każda Rola ma zieloną specyfikację E2E i dwie rozegrane scenki
- [ ] Postać świeżo z kreatora w każdej z dziewięciu Ról zgadza się z podręcznikiem (pakiety,
      wyposażenie, ranga startowa)
- [ ] `pnpm test`, `pnpm test:e2e --grep @szybkie` i lint zielone

## Testy w przeglądarce — szczegóły

### Specyfikacje stałe (`52-role/`)

- Jeden plik na Rolę, `test.describe.serial`, start z punktu kontrolnego `role-start`,
  gateway martwy (`DEAD_GATEWAY`) — Role nie potrzebują LLM
- Nazwa testu zaczyna się identyfikatorami wierszy macierzy: `SOL-03 SOL-04 Redukcja obrażeń
tylko od pierwszych obrażeń w Rundzie`
- Każda mechanika: **szczęśliwa ścieżka kliknięta w UI** + **skutek w liczbach** (baza, księga,
  karta czatu) + **odmowa** (zdarzenie z gniazda gracza ponad uprawnienie albo ponad rangę)
- Kości wyłącznie ze `scriptDice`; rzuty idą przez kubek (`shakeCup`), bo tak gra gracz
- Progi rang sprawdza vitest w `shared`; E2E bierze jeden próg poniżej i jeden powyżej, nie
  całą tabelę
- Silnik: gracz w Firefoksie (`PLAYER_ENGINE`), MG w Chromium — jak reszta suity

### Scenki rozegrań (Playwright MCP, instancja E2E, nie `dev.db`)

| Rola        | scenka (5–10 minut gry)                                                                                                | co ma wyjść na jaw                                      |
| ----------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Solo        | walka 1 na 2: przydział przed walką, zmiana w walce za Akcję, dwa trafienia w jednej Rundzie, przyjęcie dwóch ciosów   | „pierwsze w Rundzie”, widoczność premii na karcie rzutu |
| Technik     | naprawa uszkodzonej broni, Prowizorka pancerza w walce, ulepszenie przedmiotu, naprawa uszkodzonego auta (bez pościgu) | czy Technik ma co robić poza panelem                    |
| Medyk       | stabilizacja, zdjęcie rany krytycznej Chirurgią, podanie farmaceutyku, pacjent w stanie Śmiertelnie ranny              | spójność Medycyny z leczeniem z etapów 59 i 03.09       |
| Nomada      | wybór Taboru, auto z Taboru na karcie i w Kompendium, ulepszenie przy awansie, naprawa; **jazda z Moto — w 72g**       | Tabor jako prawdziwe pojazdy                            |
| Fixer       | zakup u handlarza z targiem, towar ponad poziom sklepu, sprzedaż                                                       | Zasięg i Targowanie wobec okna „Wymiana”                |
| Korpo       | zatrudnienie, pracownik na mapie w walce, Test Lojalności, rozliczenie miesiąca                                        | zespół jako figury, przywileje w pieniądzach            |
| Stróż Prawa | wezwanie w walce, odliczanie Rund, przyjazd, próba Uniku funkcjonariusza, drugie wezwanie tego samego dnia             | kolejka „w drodze”, nadużycie                           |
| Rocker      | zrobienie fanów, prośba, nieudana prośba, przestawienie kalendarza o tydzień                                           | blokada czasowa, czytelność „czego wolno żądać”         |
| Media       | publikacja z dowodami i bez, Pogłoski u MG dwa i trzy razy w tygodniu                                                  | limit tygodniowy, co gracz widzi z potajemnego rzutu MG |

Każda scenka: zrzut ekranu kluczowego momentu do scratchpada, znaleziska do macierzy; błędy
do `testy-rejestr.md`. Jeśli MG klika w oknie Playwrighta w trakcie — pytać, zanim coś zostanie
nazwane błędem. Firefox MCP zajęty przez prywatnego Firefoksa MG → poprosić o zamknięcie.

## Poza zakresem

- **Netrunner i Interfejs** (etap 70)
- **Boty-towarzysze i NPC-e MG używający Zdolności** (decyzja MG 14.11) — pomysły do
  `POMYSLY.md`
- **Treść fabularna od LLM** (szkice pogłosek, reakcje fanów) — decyzja MG 14.11
- Techniki Sztuk walki (`POMYSLY.md`, 03.09), głos, nowe sceny przykładowe „pod Rolę”
- Zmiana układu karty postaci i lewej belki ponad to, czego wymaga konkretna doróbka

## Wskazówki techniczne

- Przed dotknięciem kodu: sekcje `postac`, `karta`, `ekwipunek`, `czas` w `umowy-kodu.md`
  i `pulapki-dev.md` (jedna sekcja naraz, przez `grep -n '^## <obszar>'`)
- `roleability.ts` ma 3194 linie — doróbki klasy B (czas, zasoby) idą do **osobnych modułów**
  obok (`rolefans.ts`, `rolerumours.ts`…), a nie do tego pliku; rdzeń VTT dalej nie importuje
  niczego z `systems/cpred`
- Liczniki czasu opierać na kalendarzu z etapu 37 (sekcja `czas`), nie na `Date.now()`
- Nowe pola karty zawsze z czytnikiem `readCpred…`, który przyjmuje starą kartę bez pola;
  kopie zapasowe i import (sekcja `kopie`) muszą je przenosić
- Wygenerowane kompendium w `data/private/` bywa starsze niż parser (pułapka z 29.08) —
  rozjazd danych kreatora najpierw sprawdzić w parserze, potem w danych
- Reguła, którą doróbka zmienia względem decyzji MG z etapu 30, wchodzi **dopiero po „tak” na
  bramce**; do tego czasu test charakteryzujący broni starego zachowania

## Ryzyka

- **Rozrost.** „Pełne doróbki” bez sufitu: bramka wycenia każdą pozycję, a pozycje L MG może
  przenieść do osobnego etapu zamiast do 71
- **Rola przepisana po cichu.** Automat, który liczy więcej niż podręcznik (np. kara za
  nadużycie Wsparcia), to zasada domowa — klasa C zostaje narzędziem MG
- **Podręcznik niejednoznaczny.** Wiersze ❓ nie są rozstrzygane w kodzie bez MG; FAQ
  z `data/private/rulebook/text/` czytać przed pytaniem

## Decyzje bramki

Bramka 15.11.2026 (MG odpowiadał paczkami w sesji 71b; pełna lista z wycenami — „Lista bramki”
w `role-macierz.md`).

| pozycja                 | decyzja MG                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| G1–G5 (błędy)           | wszystkie, jako pierwszy podetap **71c0**                                                              |
| 71c (G6–G11, G38)       | wszystko; naprawa auta Technikiem **obok** warsztatu z etapu 68                                        |
| P5                      | gracz zmienia bieżące OB własnego pancerza **tylko w dół** (ablacja); w górę — MG, Prowizorka, naprawa |
| 71d (G12–G19, G40, G41) | wszystko; czas pracy i zabiegu to **propozycja przesunięcia zegara dla MG**, nie automat               |
| P1 (SOL-16)             | Precyzyjny atak **jak dziś** — każdy Atak bronią (także pokładową), bez Pochwycenia i Duszenia         |
| D2 (MED-08)             | **wybór środka** przy każdym punkcie Farmaceutyków (zmiana decyzji z 03.09)                            |
| 71e (G20–G23, G25, G26) | wszystko; sumę drugiej strony targu daje **karta handlarza, a bez niej MG**                            |
| G24                     | Nocny Targ — **osobny etap**                                                                           |
| D1 (FIX-08)             | **dalej tak** — żadna postać nie sięga ponad poziom sklepu kampanii                                    |
| 71f (G27–G32, G39)      | wszystko                                                                                               |
| P2 (ROC-04)             | nowych fanów nie robi się w walce — **odmowa serwera**                                                 |
| 71g (G33–G36)           | wszystko                                                                                               |
| G37 (WSP-19)            | **parafraza w kodzie** (osobny podetap 71g2, L)                                                        |
| D3 (WSP-18)             | powrót do Roli, którą karta niesie, **kosztuje jak nowa Rola** (zmiana decyzji z 30.08)                |
| D4 (WSP-20)             | „nieco czasu między awansami” **dalej przy stole**                                                     |
| D5, D6                  | **dalej tak** (inicjatywa funkcjonariusza na samą kość, chrom pracownika prozą)                        |
| P3 (WSP-22)             | Ulicznik Korpo — **6, jak oryginał** (druk polski to literówka)                                        |
| P4 (WSP-23)             | Ulicznik Fixera — **pistolet i lekka broń biała** (druk); poprawka danych w 71g1                       |
| P6 (KOR-S1)             | zatrudniony pracownik **staje na mapie obok Korpo** (71e)                                              |
