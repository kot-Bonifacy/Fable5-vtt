# Etap 34 — Tabele losowe

**Faza:** I — Wykończenie · **Wymaga etapów:** 03 (czat), 06 (silnik kości), 13 (kompendium)

> **Pochodzenie:** przegląd z 02.09.2026 „czego brakuje względem innych VTT". Rollable Tables
> w Foundry i Rollable Tables w Roll20 to jedna z najstarszych funkcji obu programów; tutaj
> nie ma jej w żadnej postaci, choć silnik kości i katalog przedmiotów stoją od etapów 06 i 13.

## Cel sesji

MG ma dziś kości (`/r`, kubek, rzuty z karty) i ma katalog rzeczy (kompendium), ale nie ma jak
powiedzieć „losuj, co się dzieje". Każde losowe spotkanie na ulicy, każdy łup z kieszeni,
każda plotka w barze i każda ksywa przypadkowego NPC-a rozgrywa się dziś w głowie MG albo na
kartce obok komputera.

Etap dokłada **tabelę losową jako obiekt kampanii**: nazwa, formuła, wiersze z zakresami,
losowanie jednym kliknięciem i wynik jako karta na czacie — domyślnie widoczna tylko dla MG,
z przyciskiem „Pokaż stołowi".

## Rozstrzygnięcie, od którego zależy cały etap: tabela **nie dotyka kubka**

Zastrzeżenie MG z 02.09: losowanie z tabeli nie może pobić się z rzutem kości w oknie postaci.
Sprawdzone w kodzie i zastrzeżenie jest trafne — **kubek ma jeden slot naraz**:
`rollStore.ts` trzyma siedem pól (`pending`, `initiative`, `attack`, `evasion`, `grapple`,
`facedown`, `creation`), a każdy `load…Cup` rozsypuje przed sobą `EMPTY_CUP`, czyli **czyści
wszystkie pozostałe**. Gdyby losowanie z tabeli ładowało kubek, to:

- MG, który wziął do ręki rzut Percepcji NPC-a z okna jego karty, straciłby go w chwili
  kliknięcia „Losuj";
- czekające wezwanie do Testu z etapu 32 zostałoby zdmuchnięte graczowi sprzed nosa.

**Dlatego losowanie z tabeli jest rzutem serwera, nie rzutem gestem.** Precedens jest w kodzie
od etapu 03: `/r 1d10` wysłane Enterem leci przez `chat:send` z `gesture: undefined`
(`sanitizeGesture` przyjmuje brak gestu, `rollFormula` bierze wtedy zwykły RNG serwera) i **nie
zajmuje żadnego slotu kubka**. Formuła w polu czatu jest w `DiceCup` tylko _trybem_ (`CupMode`
`'roll'`) na samym dole drabinki priorytetów — przegrywa z każdym załadowanym rzutem i z
wezwaniem. Tabela wchodzi dokładnie w to miejsce:

- **przycisk „Losuj" w panelu tabel omija kubek całkowicie** — wynik pojawia się na czacie;
- **opcjonalnie `/tab <nazwa>` w polu czatu** działa jak `/r`: kto chce potrząsnąć kubkiem dla
  przyjemności, może, ale tylko kiedy kubek jest wolny — drabinka `CupMode` zostaje bez zmian
  i nic nie traci pierwszeństwa.

## Zakres

- [ ] Model `RandomTable` + `RandomTableRow` w Prismie (kampania, nazwa, formuła, opis, wiersze
      z `min`/`max` i tekstem) — **rdzeń VTT, bez importu z `systems/cpred`**
- [ ] `shared/src/tables.ts` — czyste funkcje: walidacja pokrycia zakresów, rozstrzygnięcie
      wyrzuconej liczby na wiersz, zagnieżdżenie z limitem głębokości
- [ ] `table:upsert`, `table:delete`, `table:list` (GM only) i panel „Tabele" z edytorem wierszy
- [ ] `table:roll` — losowanie po stronie serwera, **bez dotykania `rollStore`**;
      widoczność `gm` (domyślnie) albo `public`
- [ ] Karta czatu rodzaju `table`: nazwa tabeli, wyrzucona liczba, tekst wiersza, a u MG
      przyciski „Losuj ponownie" i „Pokaż stołowi"
- [ ] Wiersz może wskazywać **inną tabelę** (podrzut: „łup" → „broń przy ciele") — najwyżej trzy
      poziomy, cykl odmawiany przy zapisie
- [ ] `/tab <nazwa>` w czacie jako druga droga, przechodząca przez ten sam `parseChatInput`
- [ ] Import tabel z pliku JSON (`tools/import/`) — treści z podręcznika **wyłącznie**
      z `data/private/`, przykładowe wymyślone w `data/public/`
- [ ] Nowy rodzaj wiersza czatu dopisany w **dwóch czystych funkcjach** w `shared/src/chat.ts`
      (`chatCategoryOf` → grupa „Stół", `chatCompactLine`) — inaczej filtry i tryb zwarty z 01.09
      go nie zobaczą
- [ ] Testy: rozstrzyganie zakresów i dziur, odmowa cyklu, zagnieżdżenie, widoczność `gm`
      niedochodząca do gracza, losowanie **nie czyści** załadowanego kubka

## Poza zakresem

- **Bot losujący z tabeli** — `bot:act` z etapu 20a mógłby wołać tabelę jako narzędzie, ale to
  osobna gramatyka i osobna sesja; zapisać w `POMYSLY.md`
- **Wynik jako gotowy obiekt** („wylosuj przedmiot i dopisz go do karty") — tabela dowozi tekst,
  a przedmiot dodaje MG z kompendium, tak jak etap 32 zostawia skutki Testu w rękach MG
- **Tabele ważone bez zakresów** (waga zamiast `min`/`max`) — podręcznikowe tabele są zakresowe
- **Tabele graczy** — tabela jest narzędziem MG

## Kryteria ukończenia

- [ ] MG tworzy tabelę z formułą `1d10` i dziesięcioma wierszami, a próba zapisania jej z dziurą
      w zakresach kończy się czytelną odmową
- [ ] „Losuj" daje kartę na czacie widoczną **tylko dla MG**, a „Pokaż stołowi" dokłada wiersz
      dla wszystkich
- [ ] Losowanie z tabeli **nie rusza kubka**: rzut wzięty do ręki w oknie postaci u MG i wezwanie
      czekające u gracza przeżywają dziesięć losowań pod rząd
- [ ] Wiersz wskazujący inną tabelę losuje ją w tym samym kliknięciu i pokazuje oba wyniki
- [ ] `/tab spotkania` w polu czatu daje ten sam wynik, co przycisk

## Wskazówki techniczne

- **Separacja rdzeń/system obowiązuje** (`CLAUDE.md`): tabela losowa to mechanika VTT, nie
  mechanika CP RED. Nic w `shared/src/tables.ts` nie ma prawa zaimportować `systems/cpred` —
  a tabela z podręcznika jest wtedy zwykłymi **danymi**, nie gałęzią w kodzie. Dokładnie tak,
  jak dodatek do broni okazał się wierszem kompendium w etapie 31.
- **RNG bierze się z serwera** (`dice-rng.ts`), jak każdy rzut — zasada „rzuty wykonują się
  wyłącznie na serwerze" nie ma wyjątku dla losowania fabularnego.
- **Formuła przechodzi przez `parseRollNotation`**, ten sam, którego używa `/r`; tabela nie
  dostaje własnego parsera notacji.
