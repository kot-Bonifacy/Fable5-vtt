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

| pytanie                         | decyzja                                                                                                                                              |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wynik etapu                     | **Audyt + pełne doróbki** — co audyt uzna za możliwe do odwzorowania, jest implementowane                                                            |
| Bramka                          | **Jedna bramka MG po audycie** — lista doróbek z wyceną, MG odpowiada tak / nie / inaczej; dopiero potem sesje doróbek                               |
| Forma testów w przeglądarce     | **Hybryda jak T8c** — stałe specyfikacje E2E + rozegranie scenki każdą Rolą przez Playwright MCP                                                     |
| Co znaczy „oddanie Roli”        | Cztery warstwy: **Zdolność Specjalna**, **kreator**, **rozwój i wieloklasowość**, **styk z mechanikami po etapie 30**                                |
| Stara „proza dla stołu”         | **Rewizja wszystkich wpisów, także decyzji MG** — każda dostaje pytanie „czy dalej tak?”; bez odpowiedzi MG decyzja zostaje w mocy                   |
| Kolejność doróbek               | **Według maszynerii** (jak etap 30), nie według Ról                                                                                                  |
| Mechaniki narracyjne            | **Liczby, liczniki i zasoby** stają się stanem gry (czas w kalendarzu, limity, wpisy na karcie); treść fabularną pisze MG; **bez treści od LLM**     |
| Boty i NPC-e                    | **Poza zakresem** — tylko postacie prowadzone przez ludzi                                                                                            |

## Cel

Po etapie dla każdej z dziewięciu Ról istnieje **udokumentowana odpowiedź** na pytanie „co
z podręcznika działa w VTT, co jest uproszczone i dlaczego”, wszystko, co dało się policzyć,
jest policzone przez serwer, a każda Rola ma stały test E2E i rozegraną scenkę w przeglądarce
innej niż Chrome MG.

## Metoda: macierz zgodności

Sercem etapu jest plik **`docs/etapy/role-macierz.md`** — jedna tabela na Rolę, jeden wiersz
na **regułę** podręcznika (nie na akapit: zdanie z dwiema liczbami to dwa wiersze).

| kolumna        | treść                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------- |
| nr             | `SOL-07`, `FIX-12` — stały identyfikator, którym posługują się testy, commity i lista bramki       |
| strona         | numer strony polskiego wydania                                                                     |
| reguła         | **parafraza własnymi słowami** (patrz „Licencja” niżej)                                            |
| warstwa        | Zdolność / kreator / rozwój / styk                                                                 |
| stan           | jeden z sześciu znaczników niżej                                                                   |
| dowód          | `plik:funkcja`, nazwa testu vitest albo id testu E2E; dla prozy — wpis w `decyzje-i-uproszczenia.md` |
| odwzorowalność | klasa A–D niżej                                                                                    |
| doróbka        | co zrobić + wycena **S / M / L** (do godziny / pół sesji / sesja lub więcej)                       |

**Stany:** ✅ działa zgodnie z podręcznikiem · 🟡 działa, świadomie uproszczone (jest wpis
decyzji) · 📜 proza dla stołu · ❌ brak · ⚠️ błąd (jest, ale liczy źle albo UI nie pozwala
użyć) · ❓ podręcznik niejednoznaczny, potrzebna decyzja MG.

**Klasy odwzorowalności** — to jest kryterium „możliwości odwzorowania w systemie
komputerowym”, stosowane jednakowo do każdego wiersza:

| klasa | co to za reguła                                                         | co robi VTT                                                              |
| ----- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **A** | liczba, rzut, próg, modyfikator                                         | liczy serwer, czysta funkcja w `shared`, test jednostkowy                |
| **B** | czas, limit, zasób („raz na tydzień”, „po jednym na poziom”, „10 min”)  | stan na karcie albo w kampanii, odliczany kalendarzem z etapu 37         |
| **C** | uznanie MG z policzalnym skutkiem („MG może ukarać”, „jeśli uzasadnione”) | narzędzie MG: przycisk, przypomnienie w kolejce decyzji, nigdy automat   |
| **D** | czysta fabuła (kto jest fanem, co mówi pogłoska, jak wygląda McPosiadłość) | proza na karcie; wpis w `decyzje-i-uproszczenia.md` z uzasadnieniem      |

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

| Rola        | co dziś stoi prozą albo uproszczeniem                                                                                           | maszyneria, która doszła po etapie 30                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Solo        | sześć zdolności Zmysłu Walki liczonych; nieznany styk z kubkiem, auto-unikiem (63b), pościgiem, skradaniem, bronią pokładową    | kubek, 61, 63b, 65                                       |
| Technik     | z dziesięciu skutków Ulepszania liczony jeden (+1 OB); Prowizorka bez zegara; Wytwarzanie i Wynajdywanie jako modyfikator       | 31 (gniazda dodatków), 37 (czas), 65/68 (pojazdy, PUK)   |
| Medyk       | Farmaceutyki jako zapas dawek i Łatanie — odłożone w etapie 30b; kriosystemy prozą                                              | 59 (farmaceutyki, narkotyki), 37, zawieszenie ran        |
| Nomada      | Tabor Rodziny (od 65a prawdziwe pojazdy); wpis decyzji „Tabor to lista” oznaczony jako nieaktualny, reszta nieprzejrzana        | 65, 67, 68                                               |
| Fixer       | Zasięg nie przebija poziomu sklepu (decyzja MG 30.08); z sześciu targów liczone dwa; Nocny Targ poza zakresem                   | 46, asortyment handlarza z 02.11, 47                     |
| Korpo       | przywileje (mieszkanie, Trauma Team) prozą; cyborgizacje zespołu prozą; Lojalność „między sesjami” ręcznie                      | 23b rozliczenie miesiąca, 37, 44c (sesje), 59a           |
| Stróż Prawa | pojazdy Wsparcia poziomu 10 prozą; nadużycie tylko jako przypomnienie; inicjatywa na samą kość; nieznany styk z pościgiem       | 65 (pojazdy i scena pościgu)                             |
| Rocker      | blokada prośby „na tydzień” bez odliczania; „ci fani” nie istnieją jako wpis                                                    | 37                                                       |
| Media       | limit Pogłosek na tydzień jako stała bez licznika (`CPRED_RUMOUR_ROLLS_PER_WEEK` czytają tylko panele); skutek publikacji prozą | 37, 24b (dziennik), 24c (screamsheets)                   |

Stałe `CPRED_CHARISMA_REFUSAL_DAYS`, `CPRED_RUMOUR_ROLLS_PER_WEEK`
i `CPRED_FIELD_REPAIR_MINUTES_PER_LEVEL` są dziś używane tylko jako tekst w panelach — to
pierwsi kandydaci klasy B.

## Podetapy

### 71a — Audyt na papierze i w kodzie (bez zmian mechaniki)

- [ ] Przeczytać w `data/private/rulebook/text/` rozdział Ról (Zdolności dziewięciu Ról), części
      kreatora zależne od Roli (pakiety Umiejętności, wyposażenie startowe, Ścieżka Życia Roli)
      i zasady rozwoju (koszt rangi Zdolności, zmiana Roli); zajrzeć do FAQ i DLC z tego
      samego katalogu pod kątem errat do Ról
- [ ] Założyć `role-macierz.md`: dziewięć tabel, każda reguła z identyfikatorem, stanem,
      dowodem i klasą odwzorowalności
- [ ] Dowód każdego ✅ i 🟡 to **wskazany kod albo test**, nie pamięć o etapie 30; gdzie testu
      jednostkowego brak, dopisać go w tej sesji (testy wolno dodawać, mechaniki nie zmieniać)
- [ ] Warstwa „kreator”: porównać `roleKits` i pakiety z `creation.json` (wersja z
      `data/private/cpred/`) z podręcznikiem dla każdej z dziewięciu Ról; rozjazdy danych to
      wiersze ⚠️
- [ ] Warstwa „rozwój”: koszt i sufit rangi, sakiewki Specjalizacji przy awansie (Twórca 2
      różne, Medycyna 1), próg wieloklasowości, zachowanie Zdolności dawnej Roli
- [ ] Rewizja **każdego** wpisu `decyzje-i-uproszczenia.md` dotyczącego etapów 30a–30d, 29b
      i kreatora Ról: wiersz macierzy + rubryka „powód nadal aktualny? tak / nie”
- [ ] Błędy znalezione przy czytaniu kodu → `testy-rejestr.md` i wiersz ⚠️; **naprawa po
      bramce**, chyba że błąd psuje dane (wtedy od razu i z notatką)

**Kryteria ukończenia 71a**

- [ ] Macierz ma komplet wierszy dla dziewięciu Ról i czterech warstw; żaden wiersz bez stanu
      i bez dowodu
- [ ] `pnpm test` zielone po dopisaniu testów charakteryzujących
- [ ] W repo nie ma ani jednego przepisanego akapitu podręcznika

### 71b — Stan dzisiejszy w przeglądarce, potem bramka MG

- [ ] Fikstura `packages/e2e/fixtures/role.ts`: dziewięć postaci, **każda z jedną Rolą**
      (nie wieloklasowy „Wielorak”), zakładanych gniazdem MG; ranga 4 (start z kreatora) oraz
      wariant wysokiej rangi tam, gdzie reguła ma próg powyżej 4
- [ ] Punkt kontrolny E2E `role-start` (kampania, scena z mapą, handlarz, pojazd, statysta-cel,
      kalendarz ustawiony) — wspólny start specyfikacji i rozegrań
- [ ] Specyfikacje `packages/e2e/specs/52-role/t71-<rola>.spec.ts` w wersji „stan dzisiejszy”:
      każdy wiersz macierzy w stanie ✅ / 🟡 klasy A–B, który ma UI, dostaje asercję w przeglądarce
      (kość ze `scriptDice`, wynik czytany z bazy, nie z ekranu)
- [ ] **Pierwsze rozegranie**: krótka scenka każdą Rolą (tabela „Scenki” niżej), gracz
      w Firefoksie (Playwright MCP), MG w czystym Chromium; ocena w trzech punktach: czy gracz
      **znajdzie** Zdolność bez instrukcji, czy rozumie wynik z karty na czacie, ile kliknięć
      kosztuje typowe użycie
- [ ] Znaleziska rozegrań dopisane do macierzy (⚠️ błąd UI także jest wierszem)
- [ ] **Lista bramki** na końcu `role-macierz.md`: każda proponowana doróbka z identyfikatorami
      wierszy, wyceną S/M/L, proponowanym podetapem i — gdzie trzeba — pytaniem do MG
      z wariantami. Decyzje MG z etapu 30 stoją na liście osobno jako „czy dalej tak?”

**Bramka MG.** MG przechodzi listę (`AskUserQuestion` paczkami po kilka pozycji albo edycja
pliku). Wynik zapisany w sekcji „Decyzje bramki” tego pliku; podetapy 71c–71g przepisane pod
zatwierdzony zakres (rule 7 z `CLAUDE.md`: korekta planu po akceptacji).

**Kryteria ukończenia 71b**

- [ ] Dziewięć specyfikacji przechodzi na obecnym kodzie (`pnpm test:e2e t71-`)
- [ ] Dziewięć scenek rozegranych, notatka mówi, w czym oglądano
- [ ] Lista bramki kompletna i **zatwierdzona przez MG**

### 71c–71g — Doróbki według maszynerii (zakres wstępny, do przepisania po bramce)

Każdy podetap: mechanika w `shared` z testami vitest → serwer (walidacja, odmowy po polsku) →
UI → **asercja w specyfikacji E2E Roli** → aktualizacja wierszy macierzy i wpisów
w `decyzje-i-uproszczenia.md` (wpis nieaktualny dostaje dopisek z datą, nie znika).

| podetap | maszyneria                    | Role                    | kandydaci (hipotezy z „Stanu wyjściowego”)                                                                                                                                    |
| ------- | ----------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **71c** | pojazdy i warsztat            | Nomada, Technik         | Tabor wobec `Vehicle` i ulepszeń z 68; Moto w Testach pościgu; Ulepszanie: pozostałe skutki wobec gniazd dodatków, jakości broni, PUK pojazdu; Naprawa przedmiotów i pojazdów |
| **71d** | walka, leczenie, czas zabiegu | Solo, Medyk, Technik    | Zmysł Walki na styku z kubkiem, auto-unikiem, pościgiem i skradaniem; Farmaceutyki jako dawki w ekwipunku; kriosystemy; Prowizorka i Wytwarzanie z zegarem kalendarza         |
| **71e** | handel i pieniądze            | Fixer, Korpo            | Zasięg wobec asortymentu handlarza; pozostałe targi; Nocny Targ; przywileje Korpo w rozliczeniu miesiąca; Lojalność po zamknięciu sesji                                       |
| **71f** | czas i zasoby narracyjne      | Rocker, Media, Stróż Prawa | grupy fanów jako wpisy z blokadą tygodniową; limit Pogłosek i rejestr publikacji; licznik nadużyć Wsparcia jako narzędzie MG; Wsparcie z pojazdem i w scenie pościgu        |
| **71g** | kreator, PD, wieloklasowość   | wszystkie               | poprawki danych pakietów i wyposażenia startowego, Specjalizacje przy awansie, UI zmiany Roli                                                                                 |

Jeśli po bramce któryś podetap przekracza jedną sesję, dzieli się go literą (71c1, 71c2) przed
pierwszą linijką kodu, tak jak etap 30.

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
- [ ] `decyzje-i-uproszczenia.md`: nowa sekcja „Role po weryfikacji (etap 71)” z tym, co
      świadomie zostało prozą, i odsyłaczem do macierzy
- [ ] `umowy-kodu.md` (`postac`), `POSTEP.md`, `archiwum/tabela-etapow.md` zaktualizowane

**Kryteria ukończenia etapu 71**

- [ ] Każda reguła klasy A i B dziewięciu Ról jest ✅ albo 🟡 z decyzją MG
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

| Rola        | scenka (5–10 minut gry)                                                                                                   | co ma wyjść na jaw                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Solo        | walka 1 na 2: przydział przed walką, zmiana w walce za Akcję, dwa trafienia w jednej Rundzie, przyjęcie dwóch ciosów      | „pierwsze w Rundzie”, widoczność premii na karcie rzutu    |
| Technik     | naprawa uszkodzonej broni, Prowizorka pancerza w walce, ulepszenie przedmiotu, naprawa auta po pościgu                    | czy Technik ma co robić poza panelem                       |
| Medyk       | stabilizacja, zdjęcie rany krytycznej Chirurgią, podanie farmaceutyku, pacjent w stanie Śmiertelnie ranny                 | spójność Medycyny z leczeniem z etapów 59 i 03.09          |
| Nomada      | wyprowadzenie auta z Taboru na scenę pościgu, Manewr z Moto, ulepszenie przy awansie, naprawa                             | Tabor jako prawdziwe pojazdy, Moto w rzutach               |
| Fixer       | zakup u handlarza z targiem, towar ponad poziom sklepu, sprzedaż                                                          | Zasięg i Targowanie wobec okna „Wymiana”                   |
| Korpo       | zatrudnienie, pracownik na mapie w walce, Test Lojalności, rozliczenie miesiąca                                           | zespół jako figury, przywileje w pieniądzach               |
| Stróż Prawa | wezwanie w walce, odliczanie Rund, przyjazd, próba Uniku funkcjonariusza, drugie wezwanie tego samego dnia                | kolejka „w drodze”, nadużycie                              |
| Rocker      | zrobienie fanów, prośba, nieudana prośba, przestawienie kalendarza o tydzień                                              | blokada czasowa, czytelność „czego wolno żądać”            |
| Media       | publikacja z dowodami i bez, Pogłoski u MG dwa i trzy razy w tygodniu                                                     | limit tygodniowy, co gracz widzi z potajemnego rzutu MG    |

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

_(wypełnia się po 71b)_
