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

## Rozstrzygnięcia MG (05.09.2026) — padły przed kodem

1. **Zegar podpowiada, nie rządzi.** Potwierdzone. Przesunięcie czasu nie zabiera nikomu
   pieniędzy i nikogo nie leczy — pokazuje MG, że minął miesiąc, i podsuwa gotowy przycisk
   „Rozlicz". To ta sama zasada, na której stoi cały rozdział 11 („nic nie rusza się samo")
   i którą etap 32 zastosował do skutków Testu.
2. **Kampania startuje 1 stycznia 2045, 08:00** — rok kanoniczny „Czasu Czerwieni". Bez pytania
   w kreatorze kampanii; datę i tak da się ustawić wprost.
3. **Cztery skoki i pole daty.** MG wybrał tylko `+10 min`, `+1 h`, `do rana`, `+1 dzień`
   (bez „+1 tydzień / +1 miesiąc" i bez pola „przesuń o N"). Pole **ustawienia daty wprost**
   doszło po dopytaniu: bez niego nie da się ani cofnąć zegara, ani ustawić początku kampanii
   innego niż 2045-01-01, a kryterium ukończenia #5 mówi wprost o cofnięciu.
4. **Data świata w dzienniku to nowa kolumna obok daty realnej** (`JournalEntry.worldDate`),
   nie podmiana znaczenia `sessionDate`: jedna mówi, kiedy drużyna grała, druga — kiedy to się
   działo w Night City.
5. **Gracz nie widzi tarczy zegara** — dostaje „15 marca 2045 · rano", MG godzinę co do minuty
   (rozstrzygnięcie po pierwszych oględzinach). Powód nie jest tajemnicą, tylko szczerością
   etykiety: zegar rusza się wyłącznie na kliknięcie MG, a rundy walki nie dotykają go wcale —
   czterdzieści rund to dwie minuty świata, których nikt nigdy nie wklepie. Godzina pokazana
   graczowi obiecuje więc dokładność, której nie da się dotrzymać, i po trzech godzinach przy
   stole „08:37" czyta się jak zepsuty zegar. Pora dnia zostaje, bo nie jest ozdobą (noc ≠ dzień,
   a ciemność jest mechaniką od 18b). **Karta czatu traci minuty dla wszystkich**, także dla MG:
   jest cezurą, a nie stemplem czasu, i zostaje w dzienniku sesji na zawsze. Odrzucone
   rozwiązanie tego samego problemu: przesuwanie zegara rundami walki — „realistyczniejsze",
   łamie „nic nie rusza się samo" i zyskuje dwie minuty na strzelaninę, czyli nic.

## Odstępstwa od opisu etapu

- **`timeZone` opisowy nie powstał.** Kalendarz jest gregoriański i bez stref, a pole „Night
  City" nie miałoby ani jednego odbiorcy w kodzie. Czas jedzie jako jedna liczba (minuty od
  epoki, liczone w UTC), więc pora dnia jest ta sama na dev-ie i na VPS-ie.
- **Dzienna regeneracja PW już istniała** — opis etapu twierdził, że „nie istnieje w kodzie",
  ale `cpredRestDay` (`systems/cpred/recovery.ts`) i zdarzenie `character:rest` doszły w 30b.
  Etap podpiął ją pod skok o dobę zamiast pisać drugi raz: doby liczy zegar, listę rannych
  składa okno zegara, a leczenie liczy ten sam kod, co dotąd.
- **Propozycja odpoczynku jest ulotna.** Doby żyją w przeglądarce MG (`pendingRestDays`),
  a nie w bazie: propozycja sprzed dwóch godzin nie jest już propozycją, tylko przypomnieniem
  o czymś, co MG albo zrobił, albo świadomie pominął.
- **Rannych składa klient, nie serwer.** Serwerowy moduł zegara jest rdzeniem VTT i nie ma
  prawa wiedzieć, czym jest PW (wskazówka techniczna etapu) — więc listę „komu doba coś da"
  buduje okno zegara z kart, które klient MG i tak ma, a samo leczenie idzie przez
  `character:rest`.

## Zakres

- [x] `Campaign.gameTime` (minuty od epoki, UTC; domyślnie 1 stycznia 2045, 08:00)
      i `Campaign.settledMonth`; `timeZone` **nie powstał** — patrz odstępstwa
- [x] Zegar w `TopBar`: data i godzina dla wszystkich, u MG przycisk otwierający okno
      z „+10 min", „+1 h", „do rana", „+1 dzień" oraz ustawieniem daty wprost
- [x] Wiersz czatu przy skoku czasu („Minęła noc — 3 stycznia 2045, 06:00 · rano"), rodzaj
      `time` dopisany w `chatCategoryOf` i `chatCompactLine`
- [x] Monit rozliczenia miesiąca: kropka przy zegarze w pasku i sekcja w oknie z „Podgląd"
      i „Rozlicz" wołającym istniejące `economy:settle`; `settledMonth` gasi go dokładnie raz
- [x] Dzienna regeneracja PW jako **propozycja** przy skoku o dobę (lista rannych + guzik
      „Odpoczynek" per postać, wołający `character:rest` tyle razy, ile dób minęło)
- [x] Wpis dziennika (24b) dostaje datę świata obok daty realnej (`JournalEntry.worldDate`)
- [x] Testy: 32 w `shared` (granice doby, miesiąca, roku, rok przestępny, polska odmiana dób),
      12 dymnych na serwerze (bramka roli, monit dokładnie raz, cofnięcie), 5 u klienta

## Poza zakresem

- **Automatyczne pobieranie opłat** — patrz rozstrzygnięcie wyżej
- **Cykl dnia i nocy na scenie** (oświetlenie zmieniające się z godziną) — kusi, bo światło jest
  od 18b, ale to osobna sesja i osobna decyzja
- **Kalendarz świata Cyberpunka ze świętami i wydarzeniami** — dane, nie mechanika; do
  `KnowledgeEntry`
- **Terminy i przypomnienia** („zlecenie wygasa za trzy dni") — dobry kandydat na później

## Kryteria ukończenia

- [x] MG przesuwa czas o dobę, a stół widzi nową datę w pasku i wiersz na czacie
      (rozgłoszenie `time:set`, nie resynchronizacja)
- [x] Przekroczenie pierwszego dnia miesiąca daje MG monit z gotowym rozliczeniem, ale nic nie
      pobiera bez kliknięcia — sprawdzone testem dymnym (saldo i księga nietknięte) i przy
      oględzinach („Podgląd": 0 ed od 0 postaci, monit nadal zapalony)
- [x] Postać z PW poniżej maksimum dostaje przy skoku o dobę propozycję regeneracji
      (Tony 20/35 na liście; kliknięcie wywołało `character:rest`, który odmówił zgodnie
      z podręcznikiem — „najpierw ktoś musi wykonać Ustabilizowanie", s. 222)
- [x] Wpis dziennika zapisany po skoku czasu niesie datę świata („2026-09-05 · 4 lutego 2045")
- [x] Cofnięcie zegara nie odwraca niczego, co już zostało rozliczone — `settledMonth` zostaje,
      karta czatu nosi tytuł „Zegar cofnięty" i zdanie „Cofnięcie zegara niczego nie odwraca"

## Błędy znalezione przy oględzinach

**1. „minęły 30 doby" zamiast „minęło 30 dób".** Polska liczba mnoga ma trzy formy, a kod miał
dwie (`days === 1 ? 'jedna doba' : `${days} doby``). Widać to było natychmiast w nagłówku sekcji
odpoczynku i na karcie czatu. Naprawione dwiema czystymi funkcjami w rdzeniu
(`gameDaysLabel`, `gameDaysPassed`) z testem na pułapkę 12–14 („13 dób", nie „13 doby").

**2. Karta zegara nie docierała do gracza — i nie tylko ona.** Wyszło dopiero przy oględzinach
z **dwóch sesji naraz** (MG na `localhost`, gracz na `[::1]`). Dwie niezależne przyczyny:

- **`visibleTo` w `chat-io.ts` jest białą listą rodzajów, a `time` na niej nie było.** Karta
  docierała rozgłoszeniem na żywo i znikała przy przeładowaniu, bo zapytanie o historię jej nie
  zwracało. MG jej nie tracił wyłącznie dlatego, że jest jej autorem (`{ authorId: user.id }`) —
  i to maskowało błąd przez pierwsze oględziny, robione z jednego konta.
- **`time:set` rysował `seq`, a klient go nie konsumował**, więc następna wiadomość czatu
  wpadała w wykrytą lukę i była odrzucana. Ten sam błąd miały **`compendium:upsert`,
  `compendium:delete` (etap 13) i `shop:tier` (25c)** — wzorzec, który etap 37 po prostu
  odziedziczył po sąsiadach. Naprawione we wszystkich czterech.

**3. Ten sam błąd `visibleTo` miał rodzaj `recovery` z etapu 30b** — mimo że dokumentacja
`RecoveryLogEntry` mówi wprost „karta jest **publiczna**… dzieje się przy całym stole".
Dzień odpoczynku rozliczony przez gracza był niewidoczny dla MG po przeładowaniu i odwrotnie.
Naprawione przy okazji; `recovery.test.ts` dostał konto gracza i test, który bez poprawki pada.

## Wskazówki techniczne

- **Zegar świata to rdzeń VTT, regeneracja PW to CP RED.** Pole na `Campaign` i przesuwanie
  czasu nie mają prawa wiedzieć, czym jest PW; funkcja licząca odpoczynek siedzi
  w `systems/cpred` i dostaje liczbę godzin.
- **`CpredTimedEffect` zostaje przy rundach**, a etap 39 dołoży mu drugą podstawę (czas świata).
  Tutaj wystarczy, żeby zegar istniał i żeby dało się go czytać z serwera.
- **Skok czasu jest zdarzeniem MG** (`time:set`), nie tykaniem w tle. Serwer, który sam sobie
  przesuwa zegar, obudziłby się po nocy z rozliczonym miesiącem, którego nikt nie rozegrał.
