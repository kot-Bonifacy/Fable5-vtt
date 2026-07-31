# Etap 16f — Celowanie kursorem i HUD walki

**Faza:** D — Walka · **Wymaga etapów:** 14b (budżet tury i katalog akcji), 14e (automaty
tury), 16b (atak z mapy, profil statysty), **16e** (zaznaczenie tokenu)

## Cel sesji

Turę da się rozegrać, patrząc wyłącznie na mapę. Wróg pod kursorem jest **widocznym celem**
— kursor zmienia się w celownik, cel dostaje obrys, a dymek mówi dystans i PT; klik ładuje
kubek. Zaznaczony token ma pod ręką wszystko inne: kim jest i ile mu zostało (panel aktywnej
postaci) oraz czym i jak może uderzyć (pasek akcji ze skrótami klawiszowymi).

**Pochodzenie:** dopisany 2026-07-31 razem z 16e (jedno zgłoszenie MG, podzielone na dwie
sesje wzdłuż granicy ruch / atak). 16e daje pojęcie „zaznaczony token”, bez którego nie ma
o kim mówić ani czym celować.

## Zakres

- [ ] **Celownik nad wrogiem** — kursor nad tokenem, który zaznaczony token może zaatakować,
      zmienia się w celownik; cel dostaje obrys odróżnialny od trzech pierścieni z 16e
      (właściciel, aktywny w turze, zaznaczony)
- [ ] **Dymek celu**: dystans, przedział zasięgu, PT z tabeli, tryb ognia, stan magazynka.
      Liczony tym samym planerem co podgląd kubka (`planCpredAttack`), więc **jest podglądem,
      nie prawdą** — dymek nigdy nie twierdzi, że strzał przejdzie, bo klient nie wie o murze
      w linii ognia (16b); odmowę linii strzału zgłasza serwer
- [ ] **Klik w cel ładuje kubek** (decyzja MG) — rzut zostaje osobnym gestem, a modyfikator
      sytuacyjny dokłada się przed rzutem. Ścieżka jest ta sama, co przy „🎯 Atak…” z 16b
      (`loadAttackAtToken`); nowe jest tylko to, że nie trzeba po nią wchodzić do menu
- [ ] **Aktywna broń** — wybór w pasku decyduje, czym token strzela po kliknięciu w cel;
      domyślnie pierwsza broń karty albo jedyna broń profilu bojowego statysty (16b)
- [ ] **Panel aktywnej postaci** (róg obszaru mapy): portret/awatar zaznaczonego tokenu,
      nazwa, pasek PW z redakcją, którą serwer już stosuje (właściciel i MG, nikt inny),
      ikony statusów, a w trwającej walce — budżet tury (pipsy Akcji i metry z 14c)
      i przycisk „Koniec tury” / „Zwróć turę” zależnie od roli
- [ ] **Pasek akcji (hotbar)**: broń z trybami ognia (pojedynczy, seria, zapora — dokładnie
      te, które daje `AttackLauncher`), Przeładowanie, oraz akcje z katalogu 14b mające dziś
      przyciski w zakładce „Walka”: Ustabilizowanie, Pochwycenie, Wstrzymanie Akcji, Wstanie, Bieg
- [ ] **Ten sam kod zasad, co zakładka „Walka”** — HUD woła `spendCombatAction`,
      `holdCombatAction`, `loadStabilizeCup` i `loadGrappleCup`; formularze za duże na pasek
      (Wstrzymanie z wyzwalaczem, Pochwycenie z wyborem celu) otwierają **ten sam** komponent,
      a nie jego kopię
- [ ] **Stany paska są treścią etapu, nie ozdobą**: nie twoja tura → pasek wyszarzony
      z powodem; poza walką → broń działa, budżetu nie ma; token bez karty i bez profilu →
      pasek mówi, czego brakuje (tym samym zdaniem, co dziś `AttackLauncher`)
- [ ] **Skróty klawiszowe** — mapa klawiszy nie może kolidować z narzędziami mapy
      (zajęte: `M` linijka, `R` rysowanie, `G` gumka, `F` mgła, `N` notatka, `W` ściany,
      `L` światła, `Enter` koniec łańcucha ścian, `Spacja` waypoint linijki, `Esc`):
  - `1`–`9` — sloty paska akcji
  - `Tab` — następny token, którym mogę sterować (gracz: swoje; MG: uczestnicy walki)
  - `E` — koniec tury
  - `Esc` — kolejno: przerwij marsz (16e) → anuluj celowanie → odznacz token
  - każdy przycisk niesie swój skrót w `title`, żeby dało się ich nauczyć bez instrukcji
- [ ] **Klawisze nie działają w polach tekstowych** — strażnik `typing` z `MapArea` już
      istnieje (czat, edytor podpisu, notatka MG); nowe skróty muszą przez niego przechodzić,
      inaczej „1” w wiadomości na czacie wystrzeli z pistoletu
- [ ] Testy: czysta funkcja składająca sloty (`hotbarSlotsFor`: karta postaci albo profil
      statysty, tryby ognia z typu broni, akcje odmówione przez statusy) — reszta to UI,
      bez wymogu testów zgodnie z konwencją projektu

## Poza zakresem

- **Przebudowa zakładki „Walka”** — zostaje pełnym widokiem MG (kolejka inicjatywy, posiłki,
  efekty okresowe, obrażenia). HUD jest skrótem, nie następcą
- **Sloty przypisywane przez użytkownika** (przeciąganie makr na pasek, jak w Foundry) —
  pasek jest generowany z tego, co token potrafi. Wpis w POMYSLY
- **Karta postaci w miniaturze** — panel pokazuje PW, statusy i turę; do cech, umiejętności
  i ekwipunku dalej otwiera się karta (podwójny klik w token, bez zmian)
- **Motyw i szlif wizualny** — kolory, spójność i okno pomocy `?` z listą skrótów należą
  do etapu 27; tutaj obowiązuje istniejący styl paneli
- **Reakcje w cudzej turze** (Unik na karcie ataku u broniącego się, 16/14d) — zostają tam,
  gdzie są: to odpowiedź na zdarzenie, a nie akcja z paska
- **Szansa trafienia w procentach** — dymek pokazuje PT i modyfikator, tak jak reszta UI;
  przeliczanie tego na procent to inna gra niż CP RED

## Kryteria ukończenia

- Gracz rozgrywa całą turę bez otwierania karty postaci i zakładki „Walka”: zaznacza token,
  klika ruch, wybiera broń klawiszem, klika cel, rzuca, kończy turę klawiszem
- Kursor nad wrogiem to celownik, a nad terenem strzałka marszu — bez wchodzenia w tryb
- Dymek nad celem pokazuje dystans, PT i przedział zasięgu; po odejściu kursora znika
- Klik we wroga ładuje kubek z aktywną bronią — bez karty postaci i bez menu kontekstowego
- MG strzela NPC-em bez karty postaci tak samo jak gracz swoją postacią (profil z 16b)
- Panel pokazuje PW i statusy zaznaczonego tokenu, a w walce budżet tury, który maleje
  po ruchu i po akcji
- Pasek wyszarza się poza turą właściciela i mówi dlaczego; MG dalej może wszystko
- Akcja z paska ląduje na czacie identycznie jak ta sama akcja z zakładki „Walka”
  (jedno zdarzenie, jeden wpis — nie dwa)
- Skróty nie działają, gdy kursor stoi w polu czatu; `Esc` schodzi po kolejnych stopniach
- Gracz widzi wyłącznie swoje tokeny w cyklu `Tab`; cudze PW nie pojawiają się w panelu

## Wskazówki techniczne

- **Atak nie dostaje nowej ścieżki:** klik w cel ma uzbroić `attackStore` (jak dziś robi to
  `AttackLauncher`) i wywołać `loadAttackAtToken` z `attack-targeting.ts`. Synteza karty
  statysty, PT, odmowy — zostają tam, gdzie są
- **Nie duplikuj katalogu akcji.** `CPRED_ACTIONS` i filtr `BUTTONS` z `CombatActions.tsx`
  są jedynym źródłem „co można zrobić w turze”; pasek wybiera z nich podzbiór wart klawisza,
  a formularze wyciągnij do wspólnych komponentów zamiast pisać ich drugą wersję
- **Broń bierz z `useWeaponOptions`** (`AttackLauncher.tsx`) — obsługuje już oba przypadki:
  wiersze karty postaci i pojedynczą broń profilu statysty z 16b
- **Panel czyta te same selektory co `CombatBar`** — `activeCombatantOf`, `myActiveCombatant`,
  `TurnBudgetView`. Budżet przychodzi z serwera gotowy, więc HUD nie liczy ani jednej reguły;
  `CombatBar` rozwiązuje ten sam problem „pasek nad mapą, który nie może przeszkadzać”
- **Uwaga na re-rendery:** panel siedzi nad canvasem i odświeży się przy każdym ruchu tokenu
  — a od 16e tokeny chodzą płynnie, więc subskrybuj wąsko (jak `MapArea` z `pushTokens`),
  inaczej marsz zacznie kosztować klatki
- **Skróty rejestruj w istniejącym `keydown`** w `MapArea` (ma już strażnik `typing`
  i wielostopniowy Esc); drugi nasłuch na `window` rozjedzie się z pierwszym
- **Pułapka oględzin:** klik w token przez CDP nie działa (patrz 16e), więc „zaznacz → pasek
  się wypełnił” wymaga myszy użytkownika. Same przyciski paska i panelu są zwykłym DOM-em
  i **da się** je kliknąć automatem, jeśli zaznaczenie ustawi się programowo
