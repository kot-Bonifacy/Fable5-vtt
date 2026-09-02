# Etap 37 — Kalendarz kampanii i upływ czasu

**Faza:** H — Świat CP RED · **Wymaga etapów:** 23b (ekonomia i lifestyle), 24b (dziennik)
· **Przed:** 39 (efekty czasowe na Cechy)

> **Pochodzenie:** przegląd z 02.09.2026. Simple Calendar jest jednym z najczęściej instalowanych
> modułów Foundry, a tutaj w bazie nie ma **żadnego** pojęcia daty ani doby: `Campaign` zna
> `createdAt` i nic poza tym.

## Cel sesji

Czas w tej kampanii istnieje wyłącznie w rundach walki. `CpredTimedEffect`
(`shared/src/systems/cpred/timed.ts`) liczy sekundy przez rundy i wygasa przez `currentRound` —
poza starciem nie ma zegara, więc:

- **rozliczenie miesiąca** (`economy:settle`) odpala MG wtedy, kiedy sobie przypomni, bo nic nie
  wie, że minął miesiąc;
- **odzyskiwanie PW przez odpoczynek nie istnieje w kodzie** — sprawdzone: `treatment.ts` zna
  wyłącznie opcje leczenia ran krytycznych, dziennej regeneracji nie ma nigdzie;
- **efekt „na godzinę"** (Nerwosol, Lisz — wpis w `POMYSLY.md` z 15.08) nie ma na czym wisieć;
- **dziennik kampanii** datuje wpisy datą realną, nie datą w Night City.

Etap dokłada **zegar świata** jako pole kampanii i narzędzia MG do przesuwania go.

## Rozstrzygnięcie do potwierdzenia z MG

**Zegar podpowiada, nie rządzi.** Przesunięcie czasu nie zabiera nikomu pieniędzy samo z siebie
— pokazuje MG, że minął miesiąc, i podsuwa gotowy przycisk „Rozlicz". To ta sama zasada, na
której stoi cały rozdział 11 („nic nie rusza się samo") i którą etap 32 zastosował do skutków
Testu. Jeśli MG chce inaczej — decyzja przed kodem, bo przenika cały etap.

## Zakres

- [ ] `Campaign.gameTime` (data i godzina świata; domyślnie 2045 wg podręcznika) i `timeZone`
      opisowy — bez stref, kalendarz jest gregoriański
- [ ] Zegar w `TopBar`: data i pora dnia dla wszystkich, u MG przyciski „+10 min", „+1 h",
      „do rana", „+1 dzień" oraz ustawienie daty wprost
- [ ] Wiersz czatu przy skoku czasu („Minęła noc — 15 marca 2045, rano"), rodzaj `time`
      dopisany w dwóch czystych funkcjach w `shared/src/chat.ts`
- [ ] Monit rozliczenia miesiąca: po przekroczeniu pierwszego dnia miesiąca MG dostaje kartę
      z listą postaci i przyciskiem „Rozlicz" wołającym istniejące `economy:settle`
- [ ] Dzienna regeneracja PW wg podręcznika, jako **propozycja** przy skoku o dobę (MG zatwierdza)
- [ ] Wpis dziennika (24b) dostaje datę świata obok daty realnej
- [ ] Testy: przesunięcia czasu (granice doby, miesiąca, roku), monit pojawia się dokładnie raz
      na miesiąc, regeneracja liczy się wg RAW i nie przekracza PW maksymalnych

## Poza zakresem

- **Automatyczne pobieranie opłat** — patrz rozstrzygnięcie wyżej
- **Cykl dnia i nocy na scenie** (oświetlenie zmieniające się z godziną) — kusi, bo światło jest
  od 18b, ale to osobna sesja i osobna decyzja
- **Kalendarz świata Cyberpunka ze świętami i wydarzeniami** — dane, nie mechanika; do
  `KnowledgeEntry`
- **Terminy i przypomnienia** („zlecenie wygasa za trzy dni") — dobry kandydat na później

## Kryteria ukończenia

- [ ] MG przesuwa czas o dobę, a stół widzi nową datę w pasku i wiersz na czacie
- [ ] Przekroczenie pierwszego dnia miesiąca daje MG monit z gotowym rozliczeniem, ale nic nie
      pobiera bez kliknięcia
- [ ] Postać z PW poniżej maksimum dostaje przy skoku o dobę propozycję regeneracji zgodną
      z podręcznikiem
- [ ] Wpis dziennika zapisany po skoku czasu niesie datę świata
- [ ] Cofnięcie zegara nie odwraca niczego, co już zostało rozliczone (i mówi to wprost)

## Wskazówki techniczne

- **Zegar świata to rdzeń VTT, regeneracja PW to CP RED.** Pole na `Campaign` i przesuwanie
  czasu nie mają prawa wiedzieć, czym jest PW; funkcja licząca odpoczynek siedzi
  w `systems/cpred` i dostaje liczbę godzin.
- **`CpredTimedEffect` zostaje przy rundach**, a etap 39 dołoży mu drugą podstawę (czas świata).
  Tutaj wystarczy, żeby zegar istniał i żeby dało się go czytać z serwera.
- **Skok czasu jest zdarzeniem MG** (`time:set`), nie tykaniem w tle. Serwer, który sam sobie
  przesuwa zegar, obudziłby się po nocy z rozliczonym miesiącem, którego nikt nie rozegrał.
