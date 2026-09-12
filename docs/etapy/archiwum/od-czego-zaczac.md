# Od czego zacząć — akapity wyprowadzone z `POSTEP.md`

Wyprowadzone 10.09.2026, gdy `POSTEP.md` urósł do 107 KB. Były to pełne opisy etapów 33–40,
pisane w chwili ich zamknięcia — czytane rutynowo na starcie każdej sesji, choć potrzebne
wyłącznie wtedy, gdy ktoś wraca do świeżo zamkniętego etapu. **To, co z nich obowiązuje
w kodzie, mieszka w sekcjach obszarów `umowy-kodu.md` i `pulapki-dev.md`** — tu leży kontekst:
po co to powstało, co było przed, czego świadomie nie zrobiono.

Kolejność jest ta sama, w jakiej stały w `POSTEP.md` (najnowsze pierwsze). Treść bez zmian.

**Gracz prosi od 06.09 o Test, a MG zgadza się jednym kliknięciem — do etapu 40 kierunek
gracz → MG nie istniał.** Etap **nie zbudował nowej mechaniki Testu**: zgoda woła
`createCheckCall`, tę samą funkcję, którą woła `check:call`, i powstaje z niej **zwykłe wezwanie
z 32** — z kartą, wołającym kubkiem, Szczęściem i werdyktem. Cała różnica siedzi w tym, czego
prośba **nie** niesie: **ani progu, ani widoczności**, bo jedno i drugie należy do MG, a przy
zgodzie Umiejętność bierze się z **zapisanej prośby**, nie z żądania MG (podmienia ją wyłącznie
„Ustaw…”, czyli `check:call` z `requestMessageId` — jedno żądanie zamyka prośbę i stawia
wezwanie). **Kubek nie zapala się na prośbę** i pilnuje tego strażnik źródłowy
`check-request-cup.test.ts`. Wejście z karty to **Alt+klik** w wiersz Cechy albo Umiejętności
(plus „Poproś MG” w oknie rzutu); swobodny rzut z 08 **działa jak przedtem**. Wiersz `request`
poszedł do `visibleTo` **tylko po stronie MG** — gracz widzi swoją przez `authorId`. Licznik
czekających próśb przy zakładce „Czat” nie jest ozdobą: prośba jest cicha i bez niego ginie
w feedzie. Sześć umów kodu i pięć pułapek w indeksach niżej. **Cały etap przeszedł oględziny
w dwóch sesjach naraz.**

**Karta postaci przeszła 06.09 szlif na wszystkich czterech zakładkach (zlecenie MG).**
Największa zmiana jest strukturalna: dziewięć paneli Ról z 30a–30d **wyszło z kolumny
tożsamości** (15 rem, nierozciągalna — umowa z 30a) do **pasa „Zdolność Specjalna”** pod trzema
kolumnami, tam gdzie leży „Broń i pancerz” z 27b. Bez tego kolumna była dwa razy wyższa od Cech
i Umiejętności, a pół strony pierwszej — pustym polem. Wyszły przy tym **cztery usterki układu**
(`.cp-slot` zdefiniowana dwa razy, `display: flex` na trzech `<td>`, typ naboju przelewający się
na kolumnę ŁA, pusta prawa kolumna „Ścieżki Życia”) i **jeden błąd mechaniczny**: kolumny CECHA
i BAZA liczyły się **bez efektów czasowych z 39**. Wszystko naprawione; szczegóły w pułapkach.

**Liczby na karcie zmienia się od 06.09 strzałkami, a nie wpisywaniem (zlecenie MG).**
`NumberStepper` zastąpił **14 pól**: Cechy, Szczęście bieżące, PW, poziom Umiejętności, rangi
Zdolności, magazynek, OB (bieżące i pełne), karę pancerza, gniazda dekera, poziom Reputacji oraz
dwa pola w panelach Ról. **Wpisywane zostają cztery**: Punkty Doświadczenia (do 99 999),
Człowieczeństwo (100), ILOŚĆ w wyposażeniu (999) i eurodolce — strzałki mają sens do dwóch cyfr.
Pole `readOnly` (poziom i ranga u gracza) pokazuje **samą liczbę bez strzałek**. Ta sama reguła
weszła do **okien gry**: okno rzutu (modyfikator, Szczęście), okno wezwania MG (PT, przeciwnik,
modyfikator), statysta z menu tokena (11 pól) i wirus w netrunie. Przełącznik bierze skórę
z kontekstu — pole z ramką w oknie, płaski napis na karcie. **Drugi wyjątek, obok liczb >99:
pola, w których puste znaczy coś innego niż zero** (OB celu „puste = z karty", inicjatywa,
generator sieci „puste = losuje serwer", sztuk w ekwipunku) — przełącznik zawsze ma liczbę,
więc odebrałby im ten stan.

Przy okazji naprawiona usterka z 40: przycisk „Poproś MG” w oknie rzutu **nie gasił tego okna**,
więc po wysłaniu prośby wracał pod nim guzik „Weź kubek” — gracz nie wiedział, czy zgodę dostał.
Prośba o Test i wezwanie mają **31 testów serwerowych** i sześć klienckich; szczegóły w notatce
sesji.

**MG może od 06.09 powiedzieć „losuj, co się dzieje" — do etapu 34 tabela losowa nie istniała
w żadnej postaci.** Tabela jest **rdzeniem VTT, nie mechaniką CP RED**: `shared/src/tables.ts`
nie importuje niczego z `systems/cpred`, a tabela z podręcznika jest zwykłymi **danymi**. Dwie
rzeczy niosą cały etap. Pierwsza: **losowanie z tabeli NIE dotyka kubka** — `rollStore` ma jeden
slot i każdy `load…Cup` rozsypuje przed sobą resztę, więc „Losuj" jest **rzutem serwera**
(`table:roll`), dokładnie jak `/r 1d10` wysłane Enterem; rzut wzięty do ręki u MG i wezwanie
czekające u gracza przeżywają dowolną liczbę losowań (pilnuje tego źródłowy strażnik
`tables-cup.test.ts`). Druga: **tabela nie jest Testem** — rzut idzie z `checkRule: false`
i `plain: true`, bo `1d10` jest formułą Testu od etapu 06 i bez tej flagi dziesiątka
eksplodowałaby dorzutem, a tabela dziesięciowierszowa dawałaby jedenastki. **Widoczność
rozstrzyga RODZAJ wiersza czatu, nie pole w payloadzie**: `rolltable` jest publiczny,
`gmrolltable` cichy, a „Pokaż stołowi" **dokłada** publiczny wiersz zamiast odsłaniać stary — bo
`visibleTo` jest białą listą rodzajów w zapytaniu do bazy. **Zakresy muszą pokryć całą formułę**
(ta sama funkcja w formularzu i przy zapisie), a **cykl i czwarty poziom podrzutu odmawia się przy
zapisie**, na grafie całej kampanii. Pipeline importu dowiózł **trzy podręcznikowe tabele Spotkań
Losowych** (s. 417–421, `1d100`) — plus jedną erratę polskiego wydania. Cztery umowy kodu i cztery
pułapki w indeksach niżej. Cały etap **przeszedł oględziny w dwóch sesjach naraz**.

**Przedmiot przechodzi od 06.09 z karty na kartę — do etapu 38b nie było na to żadnej drogi.**
Przenosi go **jedna czysta funkcja**, `cpredMoveItems(from, to, refs)`
(`shared/systems/cpred/inventory.ts`): bierze dwie karty i listę adresów wierszy, zwraca **obie**
— rozdzielenie jej na „zabierz" i „dołóż" pozwoliłoby zapisać połowę operacji. Wiersz jedzie
**w całości**, więc magazynek, `ammoId`, dodatki z 31 i zużyte OB z 15 przeżywają przeprowadzkę
bez ani jednej linijki o nich. **Pancerz przychodzi ZDJĘTY** — to jedyne pole, które funkcja
zmienia po drodze, i jest to reguła, nie szczegół. **Przekazanie na kartę z właścicielem jest
PROPOZYCJĄ** (wzorem wezwania z 32: nic się nie rusza do „Przyjmij", a wiersze czyta się
z zapisanej karty czatu, nie z żądania klienta); kartę **bez** właściciela nie ma kto potwierdzić,
więc tam idzie od ręki i ack mówi `pending: false`. **Łup nie czeka nigdy.** **Zasięg to długość
ramienia (`CPRED_MELEE_REACH_M`), mierzona wszystkim — MG włącznie**, wzorem Ustabilizowania
z 14e; przy `give` warunku nie ma, gdy karty nie stoją na wspólnej scenie, przy `take` tej furtki
nie ma. **Gracz przeszukuje wyłącznie kartę bez właściciela, leżącą albo martwą i w zasięgu.**
Klient **nie zna `characterId` cudzej figury** — łup adresuje się żetonem, a listę źródeł buduje
serwer. Osiem umów kodu i pięć pułapek w indeksach niżej. **Menu figury („🎒 Przeszukaj…") nie
było oglądane w przeglądarce** — pozycja w `zaleglosci.md`; reszta etapu przeszła oględziny.

**Figura ostatystykowana ma od 05.09 KARTĘ POSTACI — kolumna `Token.combatProfile` nie
istnieje.** Umowa etapu 16b („statysta nie jest osobą") została **cofnięta decyzją MG**: ganger,
funkcjonariusz Wsparcia, Demon i wieżyczka mają prawdziwy rekord `Character`, stoją w rosterze
obok Vex i mają zwykły ekwipunek — **i to jest jedyny powód**, dla którego etap 38b (przekazywanie
przedmiotów) da się w ogóle napisać. W silniku zasad **nie ma już gałęzi „to statysta"**. Trzy
liczby, których karta sama by nie utrzymała — **Wartość bojowa** (s. 158, sięga 16, a Umiejętność
karty ma sufit 10), **zakaz uniku przed pociskami** i **wydrukowane PW** — plus poziom broni
siedzą w `CpredCharacterData.statBlock`; wchodzą do liczb **wyłącznie** przez `sheetForRoll`.
**`hpMax(data.stats)` na pełnej karcie jest odtąd błędem** — jest `cpredSheetHpMax(data)`, ta sama
umowa co `cpredEffectiveStats` z 39, w drugim obszarze. Sześć pól menu figury pisze **`token:stat`**
(zakłada kartę i podpina ją jednym zdarzeniem), a **karta ginie z figurą tylko na pytanie** i tylko
gdy nie ma właściciela ani innej figury pod sobą. Migracja przepisała trzy figury poligonu w SQL-u
z zachowaniem PW, amunicji, ran i pancerza. Dziewięć umów kodu i cztery pułapki w indeksach niżej.
**Menu figury nie było oglądane w przeglądarce** — pozycja w `zaleglosci.md`.

**Cechy dają się od 05.09 obniżyć na godzinę — do etapu 39 nie było na to żadnej drogi.**
Efekt jest **wierszem karty** (`CpredCharacterData.statEffects`), nie gałęzią w kodzie: Cecha,
liczba **wylosowana raz i zapisana**, źródło, długość i **dwa terminy naraz** — runda walki (16h)
i minuta zegara świata (37). Wygasa **alternatywa**: schodzi ten, który dogonił pierwszy.
**Jedyna droga do liczby, na którą pada kość, to `cpredEffectiveStats(sheet)`** — od tej sesji
`data.stats[...]` znaczy „liczba wydrukowana na karcie". **Pule są wyjątkiem i liczą się z bazowej**
(maks. PW, pula SZ, sufit Człowieczeństwa) — inaczej godzina pod Nerwosolem zabrałaby punkty na
stałe przez `normalizeCharacterData`; to świadome odstępstwo od zdania „BC rusza PW" w opisie
etapu, zapisane w `decyzje-i-uproszczenia.md`. **Podłoga Cechy to 1, ale nigdy wyżej niż wartość
bazowa** — Empatia zerowa z cyberpsychozy ma zostać zerowa. **Czarny LOD nakłada Nerwosol, Lisz
i Skorpion sam** (`NET_PROGRAM_HOOKS_MANUAL` jest odtąd **pustą listą**), a `gametime.ts` dostał
**pierwszy i jedyny wyjątek** od „zegar podpowiada, nie rządzi": po skoku zdejmuje to, czego czas
minął. Osiem umów kodu i pięć pułapek w indeksach niżej. **UI etapu nie był oglądany
w przeglądarce** — pozycja w `zaleglosci.md`.

**Kampania ma od 05.09 własny zegar — do tej sesji czas istniał wyłącznie w rundach walki.**
`Campaign.gameTime` to **minuty od epoki, liczone w UTC** (nie `DateTime`: strefa maszyny nie ma
nic wspólnego z porą dnia w Night City), start to **1 stycznia 2045, 08:00**. Datę i godzinę
widzi cały stół w górnym pasku; MG klika chip i dostaje okno z czterema skokami
(**+10 min, +1 h, do rana, +1 dzień**) oraz **ustawieniem daty wprost** — jedyną drogą, którą da
się zegar cofnąć. Skok jedzie **identyfikatorem, nie liczbą minut**, i zostawia publiczną kartę
czatu (rodzaj `time`). **Zegar podpowiada, nie rządzi:** przekroczenie pierwszego dnia miesiąca
zapala kropkę przy zegarze i sekcję z gotowym „Rozlicz", skok o dobę podsuwa listę rannych
z guzikiem „Odpoczynek" — **żadne z tego nie dzieje się samo**. Wpis dziennika niesie odtąd datę
świata obok realnej (`JournalEntry.worldDate`, stemplowana przez serwer przy powstaniu wpisu).
**Gracz nie widzi tarczy zegara** — dostaje „15 marca 2045 · rano", bo godzina obiecywałaby
dokładność, której skok-na-kliknięcie nie dotrzyma; karta czatu traci minuty dla wszystkich.
Osiem umów kodu i osiem pułapek w indeksach niżej.

**Przy tym etapie wyszła klasa błędów, która przeżyła dwa etapy: `visibleTo` w `chat-io.ts` jest
BIAŁĄ LISTĄ rodzajów czatu.** Wiersza, którego na niej nie ma, historia nie zwraca — dociera
rozgłoszeniem na żywo i **znika przy pierwszym przeładowaniu**, a widzi go wyłącznie **autor**
(przez `{ authorId: user.id }`), więc z jednego konta wygląda na sprawny. Tak siedziały dwa
błędy naraz: `time` (37) i **`recovery` (30b)** — obie karty opisane w kodzie jako publiczne.
Naprawione, z dwoma testami patrzącymi **oczami gracza**. Przy okazji: **cztery rozgłoszenia
rysowały `seq`, a klient go nie konsumował** (`compendium:upsert`, `compendium:delete`,
`shop:tier`, `time:set`) — każde takie zdarzenie robiło lukę i zbędny `state:request` całemu
stołowi. Też naprawione. **Nowy rodzaj wiersza czatu ma odtąd PIĘĆ miejsc, nie cztery.**

**Mapa umie od 05.09 trzy rzeczy, których nie umiała przez trzydzieści cztery etapy:** wskazać
palcem (**`Alt`+klik = ping**, `Alt+Shift` u MG przyciąga wszystkim widok), wziąć **wiele figur
naraz** (**`Shift`+przeciągnięcie** = ramka, `Shift`+klik dokłada, **`Ctrl+A`** bierze wszystkie
sterowalne) i **skopiować figurę** (**`Alt`+przeciągnięcie**, „Ganger" → „Ganger 2"). Ramka
i `Ctrl+A` biorą **wyłącznie figury, którymi ten widz może sterować** — u gracza własne, u MG
wszystkie. Pasek operacji staje u dołu mapy **od dwóch figur**: ukryj/pokaż, naklejki, duplikuj,
do walki, kosz z pytaniem. **`Delete` figur nadal nie dotyka** i to zostaje. **Ruch grupowy
działa poza walką, w walce nie** (budżet metrów z 14c jest per figura). Atrapa `gm:ping`
z etapu 03 wreszcie zniknęła. Osiem umów kodu i cztery pułapki w indeksach niżej.

**Kopie zapasowe istnieją od 05.09 — do tej sesji cała kampania stała na jednym pliku
`packages/server/dev.db`.** Snapshot powstaje przy **starcie serwera i co godzinę** (`VACUUM INTO`,
bez zatrzymywania stołu), zostaje **24 ostatnich i 14 dób wstecz**, a `uploads/` idą do każdej
kopii **twardym dowiązaniem** — więc trzydzieści osiem samowystarczalnych kopii kosztuje 14 MB
grafik raz. Przywracanie **nie ma guzika i mieć nie będzie**: `pnpm --filter @vtt/server restore`
przy zatrzymanym serwerze, z kopią stanu sprzed przywrócenia. Doszła zakładka MG **„Kopie"**
(lista kopii, zrzut kampanii z przełącznikiem czatu, eksport i import karty oraz sceny).
**Uwaga na nazwę: „backup" w tym repo znaczy Zdolność Wsparcie z 30c** — kopie to `snapshot`
i `archive`. Wyszedł przy tym **jeden błąd**: polski znak w nazwie pliku wywracał pobieranie
błędem 500. Osiem umów kodu i cztery pułapki w indeksach niżej.

## Drobiazgi wyprowadzone razem z akapitami

**Import kompendium z 01.09.2026** dołożył plik `attachments.json` (osiem wpisów) i dwie kolumny
magazynków dziesięciu typom broni. Sama uwaga „`data/private/cpred/compendium/` bywa starsze niż
parser" została w `POSTEP.md`, bo obowiązuje nadal; ta liczba jest już tylko historią importu.
