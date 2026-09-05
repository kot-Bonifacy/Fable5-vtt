# Etap 32 — Wezwanie MG do Testu

**Faza:** H — Świat CP RED · **Wymaga etapów:** 06 (silnik kości), 08 (rzuty z karty),
27d (kubek i kości 3D)

> **Pochodzenie:** zlecenie MG z 02.09.2026 — „mechanika testów za nietypowe wydarzenia podczas
> rozgrywki, które MG mógłby chcieć, żeby gracz zdał; nowy tryb rzutu poza publicznym
> i prywatnym".

## Cel sesji

Do 31 etapu **każdy rzut w tym VTT zaczynał gracz**: klikał Umiejętność na karcie, strzelał
z paska, bronił się przyciskiem na cudzej karcie. MG nie miał jak powiedzieć kośćmi „sprawdź,
czy zauważasz drut nad progiem" — mógł tylko napisać to na czacie i czekać, aż gracz sam znajdzie
właściwy wiersz karty, sam dobierze modyfikator i sam uzna, czy 14 wystarczyło.

Etap dokłada **wezwanie do Testu**: MG wskazuje postać, wybiera Umiejętność albo Cechę, ustawia
Poziom Trudności (albo drugą stronę rzutu przeciwstawnego), dopisuje zdanie o wydarzeniu i wysyła.
Gracz dostaje kartę na czacie **i wołający kubek**, rzuca swoim gestem, a karta odpowiada
werdyktem: **Zdane** albo **Niezdane**.

## Cztery decyzje MG przed kodem (02.09.2026)

1. **Skutki rozlicza MG ręką.** Karta ma dowieźć **wyraźny wynik** i nic więcej — żadnych
   przycisków „zabierz PW", „daj przedmiot", „nadaj ranę". Wszystkie te narzędzia MG już ma
   (`character:injury`, „Zastosuj na celu", edycja karty, saldo), a wezwanie nie ma się stać
   drugą, gorszą drogą do nich.
2. **Zakres: każda Umiejętność i każda Cecha**, plus drabinka PT z podręcznika (s. 130) i rzut
   przeciwstawny streszczony jedną liczbą drugiej strony.
3. **Rzuca gracz, kubkiem** — bo to bardziej immersyjny sposób rzucania. MG ma „Rzuć za nią"
   wyłącznie na wypadek nieobecnego gracza i NPC-a.
4. **Trybu ślepego nie ma** (decyzja cofnięta w trakcie ustaleń): gracz **zawsze widzi wynik
   swoich kości**. Zostają dwie widoczności — jawna dla stołu i „MG + wezwany".

## Zakres

- [x] `check:call` — MG wystawia wezwanie (GM only), `check:cancel` — odwołuje nierzucone
- [x] Karta czatu rodzaju `check`: kto, co rzuca, przeciw czemu, zdanie MG, przyciski
- [x] Odpowiedź przez `character:roll` z `callMessageId` — żądanie w całości z zapisanej karty
- [x] Werdykt: PT (`>`, remis nie zdaje) albo rzut przeciwstawny (remis wygrywa druga strona)
- [x] Drabinka Poziomów Trudności z s. 130 — siedem szczebli, 9/13/15/17/21/24/29
- [x] Kubek woła sam: wezwanie widać na kubku gracza, zanim otworzy czat
- [x] Okno rzutu w wariancie „wezwanie": podgląd rozbicia, Szczęście, PT — bez modyfikatora
      i widoczności, bo te należą do MG
- [x] Testy: 11 dymnych na serwerze (widoczność, podrobione żądanie, zamknięcie wezwania),
      12 w rdzeniu (stan wezwania, feed czatu), 8 w CP RED (drabinka, werdykt)

## Poza zakresem

- **Skutki na karcie wyniku** — decyzja MG nr 1 wyżej
- **Test grupowy** (jedno wezwanie do całej drużyny) — MG wystawia je pojedynczo
- **Wezwanie figury bez karty** (statysty) — jej Umiejętności są w profilu bojowym i rzuca się
  nimi z panelu figury; wezwanie mówi „postać", nie „żeton"
- **Tryb ślepy** („gracz rzuca, wyniku nie widzi") — świadomie odrzucony 02.09
- **Wezwanie z menu kontekstowego żetonu** — MG wybrał jedno wejście: wiersz w panelu „Postacie"

## Kryteria ukończenia

- [x] MG wystawia wezwanie z panelu postaci; wezwany dostaje kartę i wołający kubek
- [x] Gracz rzuca kubkiem, a karta rzutu niesie werdykt „Zdane"/„Niezdane" z arytmetyką obok
- [x] Podrobione żądanie (inna karta, inna Umiejętność, własny modyfikator, własna widoczność)
      nie zmienia niczego — wszystko idzie z zapisanego wezwania
- [x] Wezwanie „MG + wezwany" nie dociera do postronnego gracza ani w kanale, ani w historii
- [x] Wezwanie zamyka się dokładnie raz: drugi rzut i rzut po odwołaniu wracają odmową

## Wskazówki techniczne

- **Rdzeń nie uczy się CP RED-u.** `CheckCallEntry` (`shared/src/checks.ts`) niesie etykiety
  i stan, a czym się rzuca — `system: Record<string, unknown>`, tak jak `RollOpposedMeta.system`
  wozi kontekst rzutu przeciwstawnego od 14d.
- **Werdykt liczy CP RED** (`cpredCheckOutcome`), bo o remisie przy PT decyduje podręcznik.
  `>=` w tym miejscu **jest błędem** — patrz `decyzje-i-uproszczenia.md`.
- **Kubek czyta feed czatu** (`openCheckCallFor`), a nie drugi magazyn stanu: dwa źródła prawdy
  o tym, czy MG jeszcze czeka, rozjechałyby się przy pierwszym „Odwołaj".

## Jak to wyszło (02.09.2026)

Najwięcej wartości dała decyzja, żeby **rzut na wezwanie jechał istniejącym `character:roll`**,
a nie własnym zdarzeniem. Wezwanie podmienia payload w jednym miejscu na początku
`performCharacterRoll` (`payloadFromCall`) i od tej linii w dół działa wszystko, co ta funkcja
umie od etapu 08: rany, Zwarcie, Szczęście, gest kubka, skórka kości, karta czatu, wstrzymanie
karty do końca animacji 3D. Osobne zdarzenie musiałoby to wszystko powtórzyć — i rozjechałoby
się z oryginałem w pierwszym etapie, który dołoży rzutom cokolwiek nowego.

Druga rzecz, której plan nie przewidział: **„wezwanie widoczne na kubku" zmieniło kubek
w drugie wejście do okna rzutu**. Chwyt kubka z czekającym wezwaniem nie potrząsa, tylko otwiera
okno — inaczej gracz rzuciłby, zanim zdążyłby zadeklarować Szczęście. To ta sama droga „dwa
kliknięcia", którą rzut z karty ma od 08, tylko zaczęta z drugiej strony.

## Oględziny w przeglądarce (02.09.2026)

Dwie sesje naraz w jednym Chrome (MG na `localhost:5173`, gracz `Tester` na `[::1]:5173`),
scena „Strzelnica", nośnikiem **Frank** — na czas oględzin przepisany na `Tester`, po wszystkim
zwrócony do `NPC (MG)`.

Odklikane:

- **Wezwanie z panelu „Postacie"** (⚄ przy wierszu) — okno z drabinką, „Trudny 15" zaznacza się
  i wpisuje 15 w pole PT, Umiejętność „Percepcja (INT)", zdanie o wydarzeniu.
- **U gracza pojawiły się oba miejsca naraz:** karta na czacie („Frank — Percepcja (INT) ·
  PT 15 (Trudny)" ze zdaniem MG i przyciskiem „Rzuć") **i bursztynowy kubek** z etykietą
  „Wezwanie: Percepcja (INT) · PT 15 (Trudny)".
- **Chwyt kubka otworzył okno rzutu**, a nie potrząsanie: rozbicie (INT +5, Percepcja
  nietrenowana +0), pole Szczęścia z pulą 5, zdanie „Widoczność wyniku wybrał MG: jawna dla
  stołu" — bez pola modyfikatora i bez przełącznika widoczności.
- **Rzut kubkiem gracza:** naturalna 10 z dorzutem +9 → **24**, karta rzutu „Wezwanie: Percepcja
  (INT)" z plakietką **„Zdane · 24 > PT 15 (Trudny)"**, a karta wezwania zamknęła się chipem
  „Zdane · wynik 24 · rzucał: Tester". To samo widzi MG.
- **„Odwołaj" u MG** — karta u obu stron przeszła w „Odwołane — MG", przyciski zniknęły,
  a **kubek gracza zgasł w tej samej chwili**.

Konsola czysta po obu stronach. W logu czatu poligonu zostały trzy wiersze z oględzin
(rozliczone wezwanie, jego karta rzutu i jedno odwołane) — historii czatu i tak się nie sprząta.
