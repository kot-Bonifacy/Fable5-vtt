# Etap 40 — Prośba gracza o Test

**Faza:** H — Świat CP RED · **Wymaga etapów:** 32 (wezwanie MG do Testu), 08 (rzuty z karty),
27d (kubek i kości 3D)

> **Pochodzenie:** zlecenie MG z 06.09.2026 — „MG prowadzi narrację, mówi, że spotkana osoba robi
> dziwną minę; gracz deklaruje, że chce rzucić na Odczytywanie emocji, żeby zrozumieć, co ta mina
> znaczy. Ma być droga: deklaracja gracza → zgoda MG → rzut".

## Cel sesji

Etap 32 dał kierunek **MG → gracz**: MG wskazuje postać, ustawia Poziom Trudności i wysyła
wezwanie, na które czeka kubek. Kierunku odwrotnego nie ma i **nigdy nie było**.

Dziś deklaracja gracza kończy się na jednej z dwóch dróg, i obie są gorsze od tego, co VTT już
umie:

- **Gracz pisze zwykłe zdanie na czacie** („chcę rzucić na odczytywanie emocji"), MG czyta,
  otwiera panel „Postacie", klika ⚄ i **przepisuje ręką to, o co gracz właśnie poprosił**. Prośba
  i wezwanie nie są powiązane niczym poza pamięcią MG; przeoczona linijka na czacie to gracz
  czekający w ciszy.
- **Albo gracz po prostu rzuca sam** — może, bo `character:roll` przepuszcza właściciela karty od
  etapu 08 — i stawia MG przed faktem. Na czacie ląduje wtedy **naga liczba bez pytania, na które
  odpowiada**: „Odczytywanie emocji: 17". Werdyktu nie ma, bo `cpredCheckOutcome` liczy się
  **wyłącznie** dla wezwania.

Etap dokłada **prośbę o Test**: gracz wskazuje z karty Umiejętność albo Cechę, dopisuje zdanie
„po co", i wysyła. MG dostaje kartę czatu z siedmioma szczeblami drabinki na jeden klik — a po
kliknięciu powstaje **zwykłe wezwanie z etapu 32**, ze wszystkim, co ono niesie: kartą, wołającym
kubkiem, Szczęściem i werdyktem „Zdane"/„Niezdane".

Innymi słowy: etap nie buduje nowej mechaniki Testu. Buduje **brakującą połowę pętli** i wpina ją
w tę, która już stoi.

## Pięć decyzji MG przed kodem (06.09.2026)

1. **Swobodny rzut z karty zostaje bez zmian.** Prośba jest **drugą drogą, nie bramką**. Rzuty
   oczywiste (Percepcja przy przeszukaniu, Unik) idą jak dziś, a gra solo z botami nie zderza się
   z pętlą zgody, w której MG byłby sam sobie petentem. Przełącznik kampanii „wszystkie rzuty za
   zgodą MG" został rozważony i **odrzucony**.
2. **Zgoda MG to jeden klik w szczebel drabinki** (9/13/15/17/21/24/29 z s. 130) prosto na karcie
   prośby, plus „Ustaw…" otwierające pełne okno wezwania z 32 — tam MG podmienia Umiejętność,
   dopisuje modyfikator sytuacyjny, wybiera widoczność albo robi z tego rzut przeciwstawny.
   Szybka droga na to, co pada co kilka minut; pełne okno na resztę.
3. **Prośba jedzie wzorem szeptu — MG i proszący.** Wzorem wezwania z 32 i propozycji bota z 20a:
   prośba jest rozmową dwóch osób. Stół widzi dopiero **wynik**, a o jego widoczności decyduje MG
   przy zgodzie — tak samo jak dziś przy wezwaniu.
4. **Wejście z wiersza karty** — Alt+klik w Umiejętność albo Cechę, plus przycisk „Poproś MG"
   w oknie rzutu, które ten sam wiersz otwiera zwykłym kliknięciem (uzasadnienie niżej,
   w „Wskazówkach technicznych"). Komenda czatu `/test` została rozważona i **odrzucona**:
   wymagałaby rozstrzygania nazwy Umiejętności z tekstu, a wiersz karty daje ją bez zgadywania.
5. **Skutki rozlicza MG ręką** — decyzja odziedziczona z etapu 32 i tu obowiązuje tak samo. Karta
   prośby dowozi zgodę albo odmowę, karta wezwania dowozi werdykt, i na tym VTT kończy. Żadnych
   przycisków „zabierz PW", „daj informację", „ujawnij sekret".

## Zakres

- [x] `check:request` — gracz wystawia prośbę o Test na **swojej** karcie; `check:request-cancel`
      — wycofuje własną, na którą MG jeszcze nie odpowiedział
- [x] `check:request-resolve` (GM only) — zgoda z PT albo odmowa ze zdaniem
- [x] Karta czatu rodzaju `request`: kto prosi, o co, zdanie „po co", stan po odpowiedzi
- [x] Drabinka Poziomów Trudności **na karcie**: siedem szczebli po jednym kliknięciu
- [x] „Ustaw…" — otwiera okno wezwania z 32 z wypełnioną postacią i Umiejętnością; wysłanie
      stamtąd zamyka prośbę tak samo, jak klik w szczebel
- [x] Zgoda tworzy **zwykłe wezwanie z 32** (`kind: 'check'`) i zostawia na karcie prośby chip
      „Zgoda — PT 15 (Trudny)" z numerem wezwania
- [x] Odmowa zostawia chip „Odmowa" i **opcjonalne zdanie MG** („nie ma na to rzutu — po prostu
      widzisz, że jest zdenerwowany")
- [x] Wejście z karty postaci: Alt+klik w wiersz Umiejętności/Cechy oraz przycisk „Poproś MG"
      w oknie rzutu; oba prowadzą do tego samego okienka z polem „po co"
- [x] Wskaźnik u MG: liczba czekających próśb przy zakładce czatu (prośba jest cicha, więc bez
      licznika ginie w feedzie)
- [x] Limity: najwyżej **3** otwarte prośby na gracza, zdanie „po co" do 300 znaków
      (`CHECK_CALL_PROMPT_MAX`)
- [x] Wpis w oknie skrótów (27f): Alt+klik na karcie = prośba o Test
- [x] Testy: dymne na serwerze (widoczność, cudza karta, podwójna zgoda, zgoda po wycofaniu,
      limit próśb, zgoda po skasowaniu karty), rdzeń (stan prośby, feed czatu, kubek **nie** woła
      na prośbę), CP RED — **żadnych nowych**, bo drabinka i werdykt są z 32

## Poza zakresem

- **Skutki na karcie wyniku** — decyzja MG nr 5 wyżej, odziedziczona z 32
- **Prośba o atak, obrażenia albo Unik** — każde z nich ma własne zdarzenie (`attack:roll`,
  `attack:evade`); prośba obejmuje **Umiejętność i Cechę**, dokładnie tyle, ile wezwanie z 32
- **Prośba statysty** (figury bez karty postaci) — jej Umiejętności siedzą w profilu bojowym
  i rzuca się nimi z panelu figury; prośba mówi „postać", nie „żeton"
- **Tryb „wszystkie rzuty za zgodą MG"** — decyzja MG nr 1, świadomie odrzucony 06.09
- **Prośba grupowa** („cała drużyna chce rzucić Percepcję") — każdy prosi za siebie, jak przy
  wezwaniu
- **Bot proszący o Test** — bot ma własną kartę propozycji od etapu 20a i to ona jest jego drogą
- **Komenda `/test` na czacie** — decyzja MG nr 4, świadomie odrzucona 06.09
- **Negocjacja PT** (gracz odpowiada „a może 13?") — MG ustawia próg i to koniec rozmowy
- **Prośba o rzut cudzą kartą** — także dla MG; MG nie potrzebuje prosić samego siebie, ma
  wezwanie z 32

## Kryteria ukończenia

- [x] Gracz wysyła prośbę z wiersza karty; MG widzi kartę na czacie **i licznik czekających**
- [x] Klik w szczebel drabinki na karcie prośby tworzy wezwanie z 32 — gracz dostaje kartę
      wezwania **i wołający kubek**, rzuca i dostaje werdykt, dokładnie jak przy wezwaniu MG
- [x] „Ustaw…" otwiera okno wezwania z wypełnioną postacią i Umiejętnością; MG może tam podmienić
      Umiejętność, a prośba zamyka się chipem odsyłającym do powstałego wezwania
- [x] Odmowa zamyka prośbę i niesie zdanie MG; **kubek gracza nie zapala się ani razu** na całej
      tej ścieżce
- [x] Prośba nie dociera do postronnego gracza — ani w kanale, ani w historii czatu po
      przeładowaniu strony
- [x] Prośba rozstrzyga się **dokładnie raz**: druga zgoda, zgoda po odmowie i zgoda po wycofaniu
      przez gracza wracają odmową
- [x] Podrobiona prośba (cudza karta, cudzy `askedById`) nie zmienia niczego — właściciel czytany
      z bazy, nie z payloadu
- [x] **Swobodny rzut z karty działa jak przed etapem** — klik otwiera okno rzutu, Shift+klik
      ładuje kubek; prośba niczego z tego nie przechwytuje
- [x] Testy przechodzą, lint czysty, aplikacja się uruchamia

## Wskazówki techniczne

**Zgoda nie pisze wezwania drugi raz.** To jest najważniejsza linijka tego etapu. Dziś całe
wystawianie wezwania siedzi w ciele handlera `check:call` (`server/src/realtime/checks.ts`):
walidacja postaci, `planCpredRoll`, złożenie `rollLabel`, `cpredDifficultyRungAt`, wstawienie
wiadomości i dostarczenie jej wzorem szeptu. Przed dołożeniem czegokolwiek **wydziel z tego
handlera funkcję** `createCheckCall(deps, { campaignId, user, characterId, request, dv, … })`
i zostaw handlerowi wyłącznie odczyt payloadu. Zgoda na prośbę woła tę samą funkcję z tymi samymi
argumentami. Druga kopia tej logiki rozjechałaby się z oryginałem w pierwszym etapie, który
dołoży wezwaniu cokolwiek nowego — dokładnie tak, jak rzut na wezwanie z 32 świadomie jedzie
istniejącym `character:roll`, zamiast mieć własne zdarzenie.

**Rdzeń nie uczy się CP RED-u.** `CheckRequestEntry` mieszka w `shared/src/checks.ts` obok
`CheckCallEntry` i niesie to samo, co tamten: etykiety, stan i **nieprzezroczyste**
`system: Record<string, unknown>` z żądaniem dla systemu. Czym się rzuca, wie CP RED; karta czatu
zna wyłącznie napis „Odczytywanie emocji (EMP)", złożony przy wystawianiu prośby.

**Klient nie podaje ani progu, ani widoczności** — ta sama umowa, co w 32, tylko z drugiej strony:
w prośbie **gracz** nie nazywa PT (ustalałby trudność wymyślonego przez MG wydarzenia), a przy
zgodzie serwer bierze Umiejętność **z zapisanej prośby**, nie z żądania klienta. Payload zgody
niesie wyłącznie to, co należy do MG: szczebel/PT, ewentualny modyfikator i widoczność.

**Stan siedzi w payloadzie wiadomości, nie w pamięci serwera** — wzorem `proposal` z 20a
i `check` z 32. Restart w środku sesji ma zostawić kartę z sensownym wyglądem, a nie z martwymi
przyciskami. Zmiana karty idzie przez **`chat:update`**, nigdy przez drugą wiadomość.

**Kubek nie może zapalić się na prośbę.** `openCheckCallFor` (`rollStore`) przegląda feed czatu
w poszukiwaniu otwartych wezwań i musi **jawnie pomijać rodzaj `request`** — inaczej gracz rzuci,
zanim MG zdąży ustawić próg. Warto to przybić testem źródłowym w rdzeniu, wzorem
`tables-cup.test.ts` z etapu 34.

**Widoczność rozstrzyga rodzaj wiersza plus autor.** W `visibleTo` (`realtime/chat-io.ts`) dopisz
`'request'` do listy rodzajów **po stronie MG** — z tego samego powodu, dla którego jest tam
`proposal` i `check`: prośba jest sprawą MG, także złożona wtedy, gdy przy stole siedzi drugie
konto MG. Gracz widzi swoją przez klauzulę `authorId` i **nie potrzebuje żadnego wiersza więcej**;
dopisanie `request` do listy gracza pokazałoby mu cudze prośby. `chatCategoryOf('request')` → `dice`,
razem z `check`: zgaszona grupa „Rzuty" ma gasić całą zapowiedź rzutu, nie jej połowę.

**Wejście z karty jest Alt+klikiem, a nie nowym przyciskiem w siatce** — i to jest odstępstwo
od pierwotnego pomysłu „⚄ przy każdym wierszu", podjęte po zajrzeniu w kod. Strona pierwsza karty
jest wierną repliką drukowanego arkusza (27a): wiersz Umiejętności to cztery komórki siatki
(nazwa ze specjalizacją · Poz. · Cecha · Baza), w których **nie ma wolnego miejsca** na piąty
element, a ⚄ pojawiające się na hover w komórce nazwy zderza się z polem specjalizacji. Karta ma
za to gotową gramatykę modyfikatorów: klik = okno rzutu, Shift+klik = kubek od razu (`startRoll`).
**Alt+klik = prośba** dopisuje się do niej jedną linijką i niczego nie przesuwa; Alt jest na karcie
wolny (na mapie trzyma ping i przełamanie celowania, ale to inny komponent). Odkrywalną drogą do
tego samego jest **przycisk „Poproś MG" w oknie rzutu** — gracz, który już otworzył okno
konkretnej Umiejętności, jest o jedno kliknięcie od prośby, a okno ma gdzie postawić pole „po co".

**Prawo do działania czytaj TERAZ, nie z karty prośby.** Między prośbą a kliknięciem MG mogła
minąć scena: karta mogła zmienić właściciela albo zniknąć. Kopiuj wzorzec z `bot:proposal` —
`characterId` z karty służy do **znalezienia**, a nie do **uwierzytelnienia**; jeśli postaci już
nie ma, zgoda ma wrócić odmową i zostawić na karcie ślad, a nie cicho nie zrobić nic.

**Nazewnictwo zdarzeń** trzyma się `domena:czynnosc` i domeny `check`, bo to jest ta sama sprawa
widziana z drugiej strony: `check:request`, `check:request-cancel`, `check:request-resolve`.
