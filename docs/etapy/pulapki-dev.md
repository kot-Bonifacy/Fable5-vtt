# Pułapki dev (kosztowały czas więcej niż raz)

Wyprowadzone z `POSTEP.md` 22.08.2026, pocięte na obszary 10.09.2026. Czytaj sekcję swojego
obszaru, **zanim** zaczniesz szukać błędu — tu leżą pełne opisy z rozpoznaniem i obejściem.

Sekcje w tym pliku i w `umowy-kodu.md` **nazywają się tak samo** i są w tej samej kolejności,
więc `grep -n '^## <obszar>' docs/etapy/umowy-kodu.md docs/etapy/pulapki-dev.md` pokazuje obie
naraz. Wskaźnik „który obszar do czego" stoi w `POSTEP.md`.

Każda sekcja zaczyna się **indeksem** (jeden wiersz = jedna pułapka), pod nim leżą pełne opisy.
Nową pułapkę dopisz do sekcji jej obszaru: wiersz na górę indeksu i pełny opis pod spodem.

## mapa — Figury, narzędzia i obiekty sceny

- **`TokenPatch` nie ma `x`/`y` — figurą rusza `token:move`, nie `token:update`**; sanityzacja milczy o nieznanych polach, więc żądanie z pozycją dostaje `{ ok: true }`, a figura stoi.
- **Żetonu nie skasujesz `Delete` ani koszem** — przeciągnięcie na kosz go **przesuwa**; przy sprzątaniu po oględzinach najszybciej zatrzymać `pnpm dev` i usunąć wiersze SQL-em (razem z `LedgerEntry` kasowanej karty).
- **Hit-test tokenu psują pełnoekranowe warstwy** — warstwy czysto malarskie muszą mieć `eventMode = 'none'`; objaw to `Viewport` zamiast `TokenNode` jako cel.
- **Próbka z paczki bywa dwoma zdarzeniami** — `shot-rifle` grał dwa strzały przez pół roku; nową próbkę obejrzyj obwiednią, zanim ją wepniesz.
- **Podpowiedź wyśrodkowana nad mapą kładzie się na pasku narzędzi** — pasek ma 38 rem i sięga poza środek; podpowiedź należąca do paska renderuj **w nim** (`.map-tool-tip`).
- **Obiekt sceny mógł się dotąd tylko pojawić i zniknąć, nigdy zmienić** — stąd pięć błędów 27l naraz (obrys w starym miejscu, stara treść etykiety, rysunek niezmieniający warstwy). Setter listy musi wołać `refreshSceneSelectOutline`, a węzły rysunków nieść odcisk.
- **Chwyt uchwytu zjada drugie kliknięcie dwukliku** — gest bez ruchu musi wrócić jako zwykłe kliknięcie, inaczej karta nie otworzy się na obiekcie już zaznaczonym.
- **Łańcuch ściany kończy `Enter`, nie `Esc`** — `Esc` go porzuca i mur znika razem z podglądem; wygląda jak „automat nie umie rysować ścian".
- **Baner nad mapą ma `pointer-events: none`** — guzik dołożony do niego musi sam włączyć `pointer-events: auto`, i tylko na sobie.
- **Gracz nie mógł kliknąć cudzej figury** (do 31.08) — nowa funkcja paska „dla gracza przy cudzej figurze" bywa nieosiągalna, choć dane jadą.

---

- **`TokenPatch` nie ma `x`/`y` — figurą rusza `token:move`, nie `token:update`.** Test etapu 38b
  „odejście od ciała odcina łup" wysyłał `token:update` z `patch: { x, y }`; sanityzacja **milczy**
  o nieznanych polach, więc ack był `{ ok: true }`, figura stała w miejscu, a łup przechodził.
  Objaw jest zdradliwy, bo pierwszy nieudany asercją test **przenosił przedmioty**, a dwa kolejne
  padały na stanie kart — czyli trzy błędy w miejscach, w których był jeden. Pozycja jedzie
  `token:move` z `final: true`.

- **Żetonu nie skasujesz ani `Delete`, ani przeciągnięciem na kosz.** Oba wyglądają, jakby miały
  działać (kosz stoi w lewym dolnym rogu mapy), a nie robią nic albo — jak przeciąganie —
  **przesuwają żeton** na drugi koniec sceny. Skasowanie idzie menu kontekstowym, którego
  `right_click` z CDP nie dowozi (patrz wpis o menu), więc przy sprzątaniu po oględzinach
  najszybsza droga jest przez bazę: zatrzymaj `pnpm dev` i usuń wiersze SQL-em, pamiętając
  o `LedgerEntry` postaci, którą kasujesz.

- **Podpowiedź wyśrodkowana nad mapą kładzie się na pasku narzędzi** (23.08, etap 27k). Pasek
  `.map-tools` stoi w lewym górnym rogu mapy, ale ma `max-width: 38rem` i się zawija, więc
  na szerokiej mapie sięga daleko poza środek — a `.map-placement-hint` jest `left: 50%`.
  Efekt: zdanie leży wprost na ikonach i wygląda, jakby ich nie było. **Obejście:** podpowiedź
  należąca do paska renderuje się **w nim**, jako wiersz z `flex-basis: 100%` (`.map-tool-tip`);
  pływające pudełko zostaw na rzeczy, które paska nie dotyczą (stawianie żetonu, celowanie).

- **Obiekt sceny mógł się dotąd tylko pojawić i zniknąć, nigdy zmienić** (24.08, etap 27l). To
  jedno zdanie stoi za **pięcioma** błędami tej sesji, a każdy wyglądał na inny: obrys zaznaczenia
  zostawał tam, gdzie obiekt stał przed przesunięciem (`drawSceneSelectOutline` wołane tylko przy
  zmianie zaznaczenia); poprawiona literówka w etykiecie nie docierała na mapę, bo `setDrawings`
  miało w komentarzu „a drawing is immutable once stored" i pomijało istniejące id; przeniesienie
  rysunku między warstwą MG a wspólną nie zmieniało rodzica węzła z tego samego powodu.
  **Obejście:** każdy setter listy obiektów woła `refreshSceneSelectOutline(kind)`, a węzły
  rysunków niosą odcisk (`drawingSignature`) i przy zmianie powstają od nowa. Dokładając rodzaj
  obiektu, który da się **edytować**, sprawdź oba miejsca.

- **Chwyt uchwytu zjada drugie kliknięcie dwukliku** (24.08, etap 27l). Uchwyt „przesuń" pokrywa
  cały zaznaczony obiekt, więc po pierwszym kliknięciu (które zaznacza) drugie ląduje na uchwycie,
  a nie na warstwie — i karta nie otwiera się **nigdy na obiekcie, który jest już zaznaczony**.
  **Obejście:** gest bez ruchu wraca jako zwykłe kliknięcie (`releaseSceneHandle` woła wtedy
  `takeScenePick`), dokładnie tak jak `tapPick` robi to dla prostokątów.

**Łańcuch ściany kończy `Enter`, nie `Esc` — `Esc` go porzuca.** Podpowiedź paska mówi to wprost
(„Klikaj narożniki — Enter kończy ścianę"), ale odruch z każdego innego narzędzia to `Esc`,
i wtedy mur po prostu znika razem z podglądem: wygląda jak „automat nie umie rysować ścian",
a jest zwykłym anulowaniem. Kosztowało jeden przebieg budowy „Korytarza 16e" 28.08.

**Próbka dźwiękowa z paczki bywa dwoma zdarzeniami, a nie jednym.** `shot-rifle.wav` grał
**dwa strzały** od etapu 27i do 28.08 — oryginał `sks.wav` z paczki „Gunshot Sounds" ma drugą
detonację w 0,315 s. Nazwa pliku tego nie mówi, a przy strzale pojedynczym słychać dublet
dopiero na głośnikach. **Nową próbkę obejrzyj obwiednią, zanim ją wepniesz** — na tej maszynie
nie ma ffmpeg, ale wystarczy moduł `wave` z biblioteki standardowej Pythona: co 5–10 ms
maksimum wartości bezwzględnej, wypisane jako jedna linijka cyfr 0–9. Drugi szczyt po zaniku
pierwszego widać w tym gołym okiem, tak samo jak sekundę ciszy doklejoną na końcu.

**Podpowiedź nad mapą ma `pointer-events: none`** (`.map-placement-hint`), więc guzik dołożony do
banera jest niewidoczny dla myszy, dopóki sam nie włączy sobie `pointer-events: auto`. Włączaj je
na wąskim elemencie, nie na całym banerze — reszta paska ma dalej przepuszczać kliknięcia w mapę
pod spodem, inaczej pasek nad środkiem sceny zjada rozkazy marszu.

**Gracz nie mógł kliknąć figury, której nie prowadzi (do 31.08).** `MapRenderer` wychodził po
cichu na `movableTokens.get(id) === false`, więc pasek nigdy nie pokazywał cudzej figury — i każda
funkcja dołożona do paska „dla gracza przy cudzej figurze" była z góry nieosiągalna, choć dane
jechały poprawnie. Zanim dołożysz coś do paska z myślą o graczu, sprawdź, czy ten gracz ma jak
postawić tam tę figurę.


## czat — Rodzaje wierszy, widoczność, filtr

- **Nowy rodzaj wiersza czatu ma SZEŚĆ miejsc, nie pięć** — szóstym jest `isPending` w `ChatPanel`, gdy wiersz czeka na czyjąś decyzję; bez tego chowa go filtr z 01.09 i propozycja zawisa.
- **Wiersz czatu „publiczny" sprawdzaj z DRUGIEGO konta** — autor widzi swoje zawsze (`authorId`), więc brak rodzaju w `visibleTo` wygląda z konta wystawiającego na w pełni sprawny. Objaw u drugiej osoby: karta jest, po przeładowaniu znika.
- **Karta, która „nie doszła", potrafi mieć dwie przyczyny naraz** (brak w `visibleTo` **i** nieskonsumowany `seq` obok) — naprawa jednej nie daje widocznego efektu i wygląda na nietrafioną.

---

- **Nowy rodzaj wiersza czatu ma SZEŚĆ miejsc, nie pięć — szóstym jest `isPending`.** Do pięciu
  z 05.09 (`ChatKind`, `chatCategoryOf`, `toChatMessageView`, `visibleTo`, `FullMessageRow`)
  dochodzi `isPending` w `ChatPanel`, gdy wiersz **czeka na czyjąś decyzję**: bez tego propozycja
  przekazania chowa się pod separatorem filtra „Stół" i zawisa na dobre, dokładnie jak zawisłaby
  propozycja bota albo wezwanie do Testu. Siódmym, jeśli wiersz niesie własny kształt, jest pole
  w `ChatMessageView`.

**Wiersz czatu opisany w kodzie jako „publiczny" sprawdź z DRUGIEGO konta, nie z konta autora.**
`visibleTo` jest białą listą rodzajów, a każde konto widzi **swoje** wiadomości przez
`{ authorId: user.id }` — więc karta, której na liście brakuje, wygląda z konta wystawiającego
na całkowicie sprawną. Tak przetrwały dwa etapy: `recovery` (30b) i `time` (37). Objaw u drugiej
osoby: karta **jest** zaraz po zdarzeniu i **znika po przeładowaniu strony**. Najtaniej sprawdzić
testem dymnym, który podnosi świeże gniazdo gracza i czyta `state:sync`.

**Karta, która „nie doszła do gracza", potrafi mieć dwie niezależne przyczyny naraz** — tak było
05.09. Pierwsza: brak rodzaju w `visibleTo` (historia jej nie zwraca). Druga: nieskonsumowany
`seq` w sąsiednim rozgłoszeniu (`time:set`), przez który wiadomość na żywo trafiła w wykrytą lukę
i została odrzucona. Naprawa jednej z nich nie daje widocznego efektu, więc łatwo uznać ją za
nietrafioną — sprawdzaj obie.


## serwer — Baza, protokół gniazda, pliki

- **`socket.data.viewedSceneId` to scena WIDZA, nie celu** — okno karty jej nie zmienia, więc runda dla efektu czyta się ze sceny **żetonu celu** (`effectClockForCharacter`). Inaczej efekt nałożony w walce nie ma terminu rundowego.
- **Trzy zapisy karty z jednego odczytanego wiersza zostawiają tylko ostatni** — każdy scala z tym, co przeczytał. Nerwosol (3 Cechy) musi czytać kartę **przed każdym** zapisem.
- **`file:./dev.db` liczy się od katalogu roboczego** — w repo są DWA `dev.db`: żywy w `packages/server/` i pusty artefakt migracji w `packages/server/prisma/`. Skrypt sięgający po drugi zrobi kopię pustej bazy i nikt tego nie zauważy.
- **Dwa zapisy tej samej karty w jednym handlerze: drugi cofa pierwszy** — wiersz `Character` z początku obsługi to migawka. Jeden zapis z obiema łatkami albo świeży wiersz pod drugi krok (`effectTarget` w `realtime/recovery.ts`).
- **Nowa kolumna z adresem pliku** musi trafić na listę w `uploads-gc.ts` — inaczej sprzątacz kasuje żywy plik.
- **Zdarzenie bez potwierdzenia** (`socket.emit('x', payload)`) dochodziło z pustym payloadem — nowe zdarzenie bez acku sprawdź testem serwera.
- **Po `prisma migrate dev` zrób `prisma generate`** — stary klient daje `Unknown argument`.
- **Mechanika bez danych wygląda jak zepsuty kod** — zanim uznasz „nie działa", sprawdź, czy pole (np. `explosive`) jest w `data/private/.../weapon-types.json`; testy jadą na publicznej próbce, która je ma.
- **`Campaign.sandbox` nie rozchodzi się sama** — jedzie w stanie logowania, więc chip „poligon" u innego klienta czeka na przeładowanie albo `campaign:activate`.
- **Prisma 7 nie zna `migrate dev --skip-generate`** — wypisuje pomoc polecenia zamiast błędu, co wygląda na złą nazwę migracji.
- **Migracji danych nie dopisuje się do zastosowanej migracji** (suma kontrolna) — backfill idzie osobnym katalogiem z samym `UPDATE`.
- **Zmiana `schema.prisma` bez `prisma generate` wywraca CAŁY zestaw testów serwera** — 57 plików na timeoutach `state:sync`, jakby zerwał się protokół. Generuj klienta, zanim zaczniesz szukać błędu gdzie indziej.
- **Skasowanie kolumny to cztery miejsca, nie jedno** — kod czytający, eksport/import (`archive.ts` wypisuje kolumny z nazwy), kopie zapasowe i migracja SQL. Kompendium mieszka w plikach, nie w bazie, więc SQL nie rozwiąże „broń → Umiejętność".

---

- **`socket.data.viewedSceneId` to scena WIDZA, nie scena celu — i przy MG prawie zawsze kłamie
  o rundzie.** Nakładając efekt czasowy z okna karty (etap 39), pierwsza wersja czytała rundę
  z oglądanej sceny. Okno karty **nie zmienia** oglądanej sceny, więc pole bywa puste albo wskazuje
  zupełnie inną scenę niż ta, na której figura się bije — efekt „na minutę" nałożony w trakcie
  walki nie dostawał terminu rundowego i nie schodził na granicy tury. Objaw w teście:
  `expiresAtRound` równe `undefined` przy trwającej walce. Pytanie „czy coś liczy rundy" dotyczy
  **celu**, więc runda czyta się ze sceny, na której stoi jego żeton
  (`effectClockForCharacter` w `realtime/stat-effects.ts`). Każde nowe zdarzenie, które pyta
  o rundę „dla kogoś", ma ten sam problem.

- **Trzy zapisy karty pod rząd z tego samego obiektu `Character` zostawiają tylko ostatni.**
  Nerwosol nakłada trzy efekty (INT, REF, ZW) jednym trafieniem. Napisane jako trzy wywołania
  `applyStatEffect(deps, …, character, …)` na **tym samym** wierszu odczytanym raz, zostawiały
  jeden efekt: każde z nich scala z tym, co **przeczytało**, a przeczytały wszystkie to samo.
  Wiersz trzeba odczytać z bazy **przed każdym** zapisem (`drainStats` w `netice.ts` robi
  `findUnique` w pętli). Ta sama pułapka czeka wszędzie, gdzie jedno zdarzenie dopisuje kilka
  wierszy do jednej kolumny JSON.

- **`file:./dev.db` rozwiązuje się względem katalogu roboczego, nie katalogu schematu.**
  W repo leżą **dwa** pliki `dev.db`: żywy w `packages/server/` (1,1 MB) i pusty artefakt
  migracji w `packages/server/prisma/` (0 B). Sterownik better-sqlite3 pod Prismą liczy ścieżkę
  od `process.cwd()`, a dev serwer chodzi z `cwd = packages/server` — stąd ten pierwszy.
  Skrypt, który sięgnie po drugi, zrobi kopię pustej bazy i nikt tego nie zauważy.
  Jedno miejsce, które to liczy: `databaseFileFromUrl` w `snapshots.ts`.

- **Dwa zapisy tej samej karty w jednym handlerze: drugi cofa pierwszy.** Wiersz `Character`
  pobrany na początku obsługi zdarzenia jest **migawką**; `mergeCharacterData(stary, łatka)`
  zapisuje całą kartę, więc scalenie na starej migawce wymazuje wszystko, co zapisano w
  międzyczasie. 03.09 kosztowało to błędu „dawka podana sobie nie schodzi z ekwipunku":
  `character:use-dose` najpierw zdejmował sztukę, a potem `applyDose` nakładał skutek środka na
  wiersz sprzed zdjęcia. **Rozpoznanie:** pierwsza zmiana widoczna w odpowiedzi zdarzenia, a
  w bazie jej nie ma. **Obejście:** albo jeden zapis z obiema łatkami, albo podstawienie
  świeżego wiersza pod drugi krok — jak `effectTarget` w `realtime/recovery.ts`. Dotyczy każdego
  handlera, w którym „kto robi" i „na kim" może być **tą samą kartą**.

- **Nowa kolumna z adresem pliku musi trafić na listę w `uploads-gc.ts`** — sprzątacz kasuje
  plik, którego nie wymienia **żadna** kolumna (i który jest starszy niż godzina), więc kolumna
  pominięta na tej liście znaczy skasowany plik. Odnośniki zbierane są z kolumn z adresem
  **i** wyrażeniem regularnym z kolumn JSON. Opis naprawy: `archiwum/zamkniete-zaleglosci.md`.

- **Zdarzenie wysłane bez potwierdzenia (`socket.emit('x', payload)`) docierało na serwer z pustym payloadem** — `registerEvents` uznawał jedyny argument za brakujący callback. Naprawione 31.07; objaw był zupełnie inny niż przyczyna (token skacze u obserwatorów, patrz notatka sesji). Nowe zdarzenie bez acku sprawdź testem serwera, bo klient nie dowie się o odmowie — nie ma czym.

- **Po `prisma migrate dev` upewnij się, że klient się przegenerował** (`prisma generate`) — stary klient w `src/generated/` daje `Unknown argument`.

- **Dane kampanii mogą nie mieć pola, które kod obsługuje — a testy tego nie złapią.**
  23.08 wyszło, że granatnik w kampanii nie robił obszaru wybuchu, choć etap 16d był
  „ukończony i odklikany". Przyczyna nie leżała w kodzie: `explosive` wypadało z
  `weapon-types.json` przez białą listę w importerze (opis w `umowy-kodu.md`), a testy
  przechodziły, bo publiczna próbka danych **ma** typ z `explosive`. Objaw był mylący —
  atak trafiał, tylko nie miał obszaru, listy trafionych ani rzutu obrażeń. Zanim uznasz
  „mechanika nie działa" za błąd kodu, sprawdź, czy pole w ogóle jest w danych:
  `python -c "import json;d=json.load(open('data/private/cpred/compendium/weapon-types.json',encoding='utf8'));print([t['id'] for t in d['weaponTypes'] if t.get('explosive')])"`.

**Flaga kampanii nie rozchodzi się sama po podpiętych ekranach.** `Campaign.sandbox` jedzie
w `CampaignSummary`, czyli w stanie logowania — trasa REST ją zapisuje, ale **nie** broadcastuje,
więc chip „poligon" u innego klienta pojawi się dopiero po przeładowaniu albo po
`campaign:activate`. Dla dialu MG to akceptowalne; gdyby kiedyś zaczęło przeszkadzać, drogą jest
`campaign:switch` (to on przenosi wszystkie ekrany), a nie drugie źródło prawdy u klienta.

**Prisma 7 nie zna `migrate dev --skip-generate`** — wypisuje wtedy całą pomoc polecenia zamiast
błędu, co wygląda jak zła nazwa migracji. Uruchom `migrate dev` bez flagi, a `prisma generate`
osobno (i pamiętaj o nim — stary klient daje `Unknown argument`).

**Migracji danych nie dopisuje się do już zastosowanej migracji** — Prisma trzyma sumę
kontrolną pliku i przy następnym `migrate dev` zgłosi, że plik zmieniono. Backfill („uzupełnij
nową kolumnę na istniejących wierszach") idzie **osobnym katalogiem migracji** z samym
`UPDATE`; tak powstał `stage37_settled_month_backfill`.

**Zmiana `schema.prisma` bez `prisma generate` wywraca CAŁY zestaw testów serwera, nie jeden**
(05.09, etap 38a). Objaw jest mylący: 57 z 61 plików pada na timeoutach `state:sync`, jakby
zerwał się protokół. Przyczyną jest wygenerowany klient, który wciąż zna skasowaną kolumnę —
każde zapytanie o żeton wywraca się w środku, a to widać dopiero jako brak odpowiedzi po drugiej
stronie gniazda. `npx prisma generate` w `packages/server` po **każdej** zmianie schematu, zanim
zaczniesz szukać błędu gdzie indziej.

**Skasowanie kolumny, w której coś mieszkało, to trzy miejsca, nie jedno** (05.09, etap 38a).
Poza kodem czytającym są jeszcze: **eksport i import** (`archive.ts` wypisuje kolumny z nazwy,
więc martwa nazwa wywraca zrzut kampanii) i **kopie zapasowe**. Migracja SQL jest czwartym:
`json_group_object` z `json_each` daje się użyć do przepisania mapy z JSON-a, ale kompendium
mieszka w plikach `data/private/`, **nie w bazie** — więc SQL nie ma jak rozwiązać „broń →
Umiejętność" i model musi być tak dobrany, żeby nie musiał (stąd `statBlock.weaponSkill`).


## ui — Okna, motyw, style, dostępność

- **Przezroczyste pole hasła Chrome i tak zamaluje własnym niebieskim** — to styl UA na `:-webkit-autofill`, `background` go nie zdejmuje; zdejmuje `transition: background-color 100000s`.
- **`place-items: center` na ekranie wyższym niż okno chowa górę treści bezpowrotnie** — pasek przewijania nie pomaga, bo przepełnienie jest po obu stronach. Ratuje `justify-content: safe center` w kolumnie flex.
- **Okno otwierane znad karty postaci znika pod nią, choć powstało** — scrim jest, `Escape` działa, w DOM-ie okno ma rozmiary, a widać zero. Rozpoznanie: `document.elementFromPoint` na jego środku zwraca arkusz.
- **Okno, które otwiera drugie okno, musi zgasić SIEBIE** — objaw brzmi „okno prośby nie zamyka się po zgodzie MG”, a to okno rzutu zostało pod spodem. Rozpoznanie: sprawdź, ile okien trzyma **stan**, nie które widać.
- **Prosty cudzysłów w atrybucie JSX zamyka atrybut** — `title="… („−1k6") …"` to błąd składni; zamykający pisze się `”` (U+201D).
- **Otwarte okno łatwo zabiera klawisze narzędzi mapy** — strażnik „czy ktoś pisze" ma obejmować wyłącznie kartę, która sama ustawia kursor w treści (notatka).
- **Nasłuch „klik poza oknem" dopięty w efekcie łapie ten sam klik, który okno otworzył** — okno znika bez śladu i bez błędu; uzbrajaj listener przez `setTimeout(…, 0)`.

---

- **Pole z hasłem podstawionym przez Chrome zamalowuje się na niebiesko, choć ma `background: none`
  (11.09).** Na ekranie logowania stojącym na plakacie wygląda to jak wbita w grafikę systemowa
  plamka. To nie kaskada, tylko styl UA na pseudoklasie `:-webkit-autofill` — zwykłe `background`
  i `background-color` przegrywają. Zdejmuje to dopiero absurdalnie długie przejście
  (`transition: background-color 100000s`): barwa rusza w stronę niebieskiego i nigdy nie dojeżdża.
  Drugie znane obejście, `box-shadow: inset 0 0 0 100px <kolor>`, **tu odpada** — zalepiłoby pole
  płaską plamą, a pod spodem ma być ziarno plakatu. Litery ustawia się przez
  `-webkit-text-fill-color`, nie `color`.

- **`place-items: center` chowa górę treści, gdy treść jest wyższa od okna (11.09).** Przy oknie
  1500 × 460 formularz logowania wystawał poza ekran **z obu stron naraz**, więc dołożenie
  `overflow-y: auto` samo z siebie nic nie dało: pasek przewijania był, ale góra i tak zostawała
  poza zasięgiem. Działa dopiero kolumna flex z `justify-content: safe center` — `safe` przy
  przepełnieniu przestaje centrować i dosuwa treść do początku osi.

- **Okno otwierane znad karty postaci znika pod nią, choć powstało (06.09, etap 40).** `.sheet-window`
  ma `z-index: 300`, a `.dialog-backdrop` — 50. Objaw jest mylący, bo **coś się dzieje**: ekran
  przygasa scrimem, `Escape` działa, a w DOM-ie okno stoi z prawidłowymi rozmiarami — tylko widać
  je zero. Pierwsza reakcja („kliknięcie nie doszło") prowadzi w kompletnie inne miejsce.
  **Rozpoznanie:** `document.elementFromPoint(x, y)` na środku okna zwraca element karty postaci.
  **Naprawa:** dopisz klasę okna do listy `.dialog-backdrop:has(…)` w `styles.css` — jest tam od
  27a, dla `.roll-dialog`, i z tego samego powodu.

- **Prosty cudzysłów w atrybucie JSX zamyka atrybut.** `title="notacja („−1k6") jest…"` to dwa
  błędy składni TS w miejscu, które wygląda na poprawny polski. W atrybutach JSX zamykający
  cudzysłów pisze się jako `”` (U+201D) — reszta repozytorium tak właśnie robi.

- **Otwarte pływające okno łatwo zabiera klawisze narzędzi mapy** (24.08, etap 27l). Strażnik
  „czy ktoś pisze" w `MapArea` obejmował przez chwilę **każdą** kartę obiektu, więc po otwarciu
  karty ściany `O` przestawało przełączać na osłony i dorysowywało kolejny segment. Do pola
  tekstowego należy wyłącznie karta, która **sama ustawia kursor w treści** (notatka);
  reszta ma tylko przyciski i suwaki, a te i tak wyłapuje pierwszy warunek (`closest('input, …')`).

- **Nasłuch „kliknięcie poza oknem" dopięty w efekcie łapie ten sam klik, który okno otworzył**
  (31.08, kosztowało jeden nieudany przebieg oględzin). Okno Celowania otwiera się w obsłudze
  `pointerdown` na żetonie; React zdąża je wyrenderować **w trakcie** tego samego zdarzenia (klik
  jest zdarzeniem dyskretnym, więc aktualizacja idzie synchronicznie), a listener dopięty wtedy do
  `window` jest jeszcze przed nim w drodze w górę drzewa — więc dostaje ten klik i zamyka okno
  w tej samej klatce, w której powstało. Objaw jest mylący: **żadnego błędu, żadnego okna**, jakby
  warunek otwarcia był fałszywy. Obejście to jedna linia — `setTimeout(() => addEventListener(…), 0)`
  i `clearTimeout` w sprzątaniu. `stopPropagation` w Pixi nie pomaga: to inny system zdarzeń niż DOM.

- **Okno, które otwiera drugie okno, musi zgasić SIEBIE (06.09, poprawka do etapu 40).**
  „Poproś MG" w oknie rzutu otwierało okno prośby i zostawiało własne pod spodem. Objaw jest
  mylący, bo **wszystko działa**: prośba idzie, jej okno znika — tylko że pod nim wraca guzik
  „Weź kubek", stojący tam przez cały czas oczekiwania i po zgodzie MG także. Zgłoszenie brzmi
  wtedy „okno prośby nie zamyka się po zgodzie", a okno prośby jest akurat jedynym, które
  zamknęło się prawidłowo. **Rozpoznanie:** sprawdź, ile okien trzyma stan naraz
  (`useRollStore.getState().target` obok `useCheckStore.getState().requestDraft`) — nie to,
  które widać. **Naprawa:** gaszenie w funkcji przejścia, nie w komponencie, bo wejść jest
  więcej niż jedno.


## kosci — Kości, Testy i wezwania

- **`rollFormula` sam wnioskuje regułę Testu z formuły — i to jest pułapka wszędzie, gdzie kość NIE jest Testem.** Tabela `1d10` bez `checkRule: false` wyrzuca jedenastkę, a objaw („nic nie odpowiada za tę liczbę”) wskazuje na zakresy, nie na rzut. To samo dotyczy każdego przyszłego losowania fabularnego.

---

- **`rollFormula` sam wnioskuje regułę Testu z formuły — pułapka wszędzie, gdzie kość NIE jest
  Testem.** Przy etapie 34 tabela `1d10` bez `checkRule: false` dawałaby wynik 11+ na dziesiątce,
  a objaw kłamie: karta mówi „nic nie odpowiada za tę liczbę", więc pierwsze podejrzenie pada na
  zakresy wierszy, nie na rzut. Poprzednikiem jest inicjatywa z 14 („1d10 + REF nie jest Testem")
  i rzuty kreatora z 25a. Każde nowe losowanie, które nie jest Testem CP RED, ma to ustawić jawnie
  — a test, który to łapie, musi sprawdzać `roll.critical === undefined`, nie samą sumę.


## tura — Tura, akcje, ruch w walce

- **`refuseWalkThroughSolid` zwalnia MG** (`realtime/movement.ts:254`) — żeton MG przechodzi przez ścianę i to nie jest regres; kolizje ruchu ogląda się z konta gracza, jak odmowy statusowe.
- **Zacienienie zasięgu ma cache bez ścian** — zmiana zasad chodzenia musi wyzerować `this.reach` (naprawione 22.08).
- **`clipWalkToBudget` tnie na punkcie zwrotnym, nie na metrze** — na wygładzonej prostej zostawia sam start; u klienta tnie `clipToBudget` w `MapRenderer` (metr → przyciągnięcie → ponowne sprawdzenie).
- **`combat:next` przy jednym uczestniku to cała runda** — test czytający kolejkę krokiem tury potrafi sam sprowadzić posiłki. Stan czyta się `state:request`.

---

- **Zacienienie zasięgu ruchu ma własny cache, który nie wie o ścianach.** Klucz w `updateReach`
  to figura, jej pozycja, budżet i rozmiar — postawienie albo skasowanie ściany w trakcie tury
  zostawiało na mapie **stary kształt** zalewu. Naprawione 22.08 (`setWalkPassable` czyści
  `this.reach`), ale gdyby zacienienie kiedyś znów „nie zauważyło" zmiany w scenie, szukaj
  najpierw tego klucza.

- **`clipWalkToBudget` w `shared` tnie trasę na **punkcie zwrotnym**, nie na metrze.** Dla bota
  jest to poprawne — jego trasy planuje się bez wygładzania właśnie po to, żeby każda kratka
  była punktem, na którym cięcie może wylądować (20b, komentarz w `bot-combat.ts`) — ale trasa
  gracza jest wygładzana, więc prosta przez otwarty teren ma **dwa** punkty: start i cel.
  Cięcie do mniejszego budżetu zostawiało wtedy sam start, czyli „nie ruszysz się" na każdy klik
  poza budżetem. Przez cały etap 16e ukrywał to promień szukania równy budżetowi (dalej trasa
  po prostu nie powstawała); rozszerzenie promienia o pas Biegu (23.08) błąd odsłoniło. U klienta
  tnie teraz własne `clipToBudget` w `MapRenderer`: **na metrze**, potem `snapTokenPosition`,
  potem ponowne sprawdzenie budżetu i przejścia — bo serwer dokleja do trasy własne przyciągnięte
  lądowanie (`movementPath`) i policzyłby różnicę jako przekroczenie. Gdy przyciągnięta kratka
  już się nie mieści, cofa się o kratkę (do sześciu prób), a na końcu wraca do ostatniego punktu
  zwrotnego.

**`combat:next` przy jednym uczestniku w kolejce to cała runda** — a odliczanie w rundach
(przybycie Wsparcia, efekty 16h) rusza dokładnie wtedy. Test, który po wezwaniu robi krok tury,
żeby przeczytać kolejkę, potrafi w ten sposób sam sprowadzić posiłki. Stan kolejki czyta się
`state:request`, nie `combat:next`.

**`refuseWalkThroughSolid` zwalnia MG — żeton MG przechodzi przez ścianę (04.09).**
`realtime/movement.ts:254` zaczyna się od `if (user.role === ROLE_GM) return;`, więc kolizje
ruchu (ściany **i** osłony, po lanie na komórkę dla figur 2×2) obowiązują wyłącznie graczy. To
ta sama zasada, co przy odmowach statusowych z 08.08, tylko o geometrii, i nigdzie nie była
zapisana: przy oględzinach z konta MG wygląda jak brak kolizji, którego nie ma. Sprawdzaj
z konta gracza (`Tester`, `/join/tester-dev`). Przy okazji: wpis `POMYSLY.md` o kolizjach ruchu
jest **nieaktualny** — kolizje są od 27j.


## atak — Broń, atak, obrażenia, rany

- **To samo zdanie odmowy bywa w dwóch tabelach** — `attack:evade` idzie przez `attackAckErrorText`, nie przez ogólne `ackErrorText`; kod bez wpisu w tej właściwej wraca do czatu jako `Błąd ataku: KOD`.
- **Mechanika bywa gotowa i nieosiągalna z UI** — Celowanie miało cały silnik i żadnej kontrolki, która by je włączyła; prześledź regułę od kontrolki, nie od silnika.
- **Broń bez `compendiumId` nie strzela** — planer odmawia `UNKNOWN_WEAPON` („brak tabeli zasięgów"), tym samym kodem co przy nieistniejącym wierszu.
- **Dwie drogi uzbrojenia broni, jedna zna Celowanie** — slot paska to `hudStore.activeWeapon`, baner z guzikami to `attackStore.targeting` („Atak" z karty albo menu żetonu).
- **Broń dopisana do karty samą nazwą nie strzela** — bez `compendiumId` planer odmawia; bierz ją z katalogu („Dodaj za darmo"). Id typu (`weapon-type.*`) ≠ id wpisu (`weapon.*`).
- **Broń biała odmawia powyżej 2 m**, a pole „Strzelnicy" to 2 m — przy ustawianiu żetonów w bazie licz w metrach.
- **Nabój inteligentny od 01.09 odmawia strzału bez Celownika optycznego** — test strzelający nim musi wszczepić chrom, inaczej pada w asercji o czymś innym.
- **Gniazd na dodatki nie widać przy broni wpisanej ręką** ani przy egzotyku i broni białej — `attachmentSlots` to wtedy zero, a pasek gniazd świadomie znika.

---

**Mechanika bywa gotowa i nieosiągalna — sprawdź, kto ustawia flagę.** Celowanie (s. 170) miało
od etapu 16 komplet: `−8` w rozbiciu rzutu, `location: 'head'` w obrażeniach, ×2 po pancerzu,
`AIM_NEEDS_FULL_ACTION` w budżecie tury i wyjątek dla Ludzkiej tarczy. Mimo to **nie dało się go
odpalić**: obie drogi uzbrojenia celownika (`AttackLauncher` i wiersz broni na karcie) wpisywały
`aimed: false` na sztywno, a nic w UI tego nie zmieniało. Testy przechodziły, bo wołały planer
wprost. Zanim uznasz regułę za zrobioną, prześledź ją **od kontrolki**, nie od silnika — grep po
nazwie pola, na którym stoi (`grep -rn "aimed: true"` pokazał wtedy same przepisania, ani jednego
źródła).

**Bronią bez `compendiumId` nie da się strzelić** — planer odmawia `UNKNOWN_WEAPON` („Ta broń nie
ma tabeli zasięgów"), mimo że wiersz siedzi na karcie. Ta sama odmowa co przy nieistniejącym
wierszu, więc szukanie zaczyna się od złej strony; wpis z katalogu jest wymagany, bo zasięgi
mieszkają na typie broni.

**Dwie drogi uzbrojenia broni, jedna zna Celowanie.** Slot broni w pasku postaci ustawia
`hudStore.activeWeapon` („W ręku: …"), a baner nad mapą z guzikami Celowania wisi na
`attackStore.targeting`, który stawia **tylko** „Atak" z karty postaci i menu żetonu. Szukając
kontrolki, która czegoś nie pokazuje, sprawdź najpierw, **którym** stanem została uzbrojona broń.

**Broń dodana do karty przez wpisanie nazwy nie strzela.** Pole nazwy w wierszu broni to wolny
tekst — nie dostaje `compendiumId`, więc planer odmawia („Ta broń nie ma tabeli zasięgów").
Do oględzin bierz broń z katalogu: kompendium → wpis → wybór postaci → „Dodaj za darmo". Id typu
(`weapon-type.heavy-melee`) **nie jest** id wpisu broni (`weapon.heavy-melee`) — wpisanie tego
pierwszego do bazy daje dokładnie tę samą odmowę.

**Broń biała odmawia z odległości większej niż 2 m** („Do ataku wręcz cel musi być nie dalej niż
2 m") — a pole na „Strzelnicy" to 100 px i **2 m**, więc figury muszą stać w sąsiednich polach.
Przy ustawianiu żetonów w bazie licz w metrach, nie w pikselach.

**Nabój inteligentny od 01.09 odmawia strzału i wywraca stary test (01.09).** „Z powodów
bezpieczeństwa amunicja inteligentna nie wystrzeli po pociągnięciu za spust" (s. 347) było prozą
do etapu 31, bo w 16h karta nie miała chromu, o który dałoby się zapytać. Teraz `planCpredAttack`
zwraca `AMMO_NEEDS_CYBERWARE`, więc **każdy test strzelający tą amunicją musi wszczepić strzelcowi
wymaganą cyborgizację** — inaczej pada w asercji o czymś zupełnie innym (drugi rzut po bliskim
pudle), bo pierwszy strzał w ogóle nie dochodzi do skutku.

**Gniazd na dodatki nie zobaczysz przy broni wpisanej ręką** (01.09) — `WeaponAttachments` wraca
`null`, gdy `resolved` jest pusty albo `attachmentSlots` to zero (broń biała, egzotyk, wiersz bez
wpisu z katalogu). Pusty pasek byłby jeszcze jedną rzeczą do wytłumaczenia, ale objaw „nie widzę
gniazd" ma zwykle tę przyczynę, a nie zepsuty komponent.

**To samo zdanie odmowy bywa w dwóch tabelach, a ścieżka wybiera jedną (04.09).**
Klient ma dwa mappery kodów na zdania: ogólny `ackErrorText` i `attackAckErrorText` dla
wszystkiego, co idzie przez atak — w tym `attack:evade`. `BACKUP_CANNOT_DODGE` miało swoje
zdanie **w tym pierwszym**, a Unik szedł przez drugi, więc na czacie lądowało
„Błąd ataku: BACKUP_CANNOT_DODGE". Objaw jest mylący, bo `grep` po kodzie znajduje polskie
zdanie i wygląda na podpięte. Dokładając kod odmowy do ścieżki ataku, sprawdź **którą** tabelę
czyta jej `ack` — trzy kody `attack:evade` (`BACKUP_CANNOT_DODGE`, `SHIELD_CANNOT_DODGE`,
`DODGE_BLOCKED`) siedziały poza nią wszystkie trzy.


## statysta — Figura ostatystykowana i jej karta

- **Nowe pole `CpredCharacterData` wywraca statystę i mapę ikon** — `combatProfileSheet` buduje pełną kartę, a `ICON_FX` to `Record<CpredSlotIcon, …>`; obie listy pilnuje kompilator, więc puść `tsc --noEmit` przed pisaniem UI.
- **Sufit `SKILL_LEVEL_MAX` ścinał Wartość bojową w profilu statysty** — zapis szedł dobry, ścinał odczyt; funkcję piszącą do kolumny JSON testuj po podróży tam i z powrotem.
- **Karta zapisana ≠ karta rzucana** — figura z Wartością bojową ma na karcie dziesiątkę, a rzuca czternastką. Test czytający liczbę z kolumny sprawdza złe miejsce; sprawdzaj sumę rozbicia rzutu.

---

**Nowe pole `CpredCharacterData` wywraca też statystę i mapę ikon.** Dopisanie
`combatAwareness` w 30a wysypało `tsc` w dwóch miejscach, których nikt by nie szukał:
`combatProfileSheet` (`statist.ts`) buduje **pełną** kartę syntetyczną, więc brak pola to błąd
typu, a `ICON_FX` w `fx.ts` to `Record<CpredSlotIcon, …>` — nowa ikona akcji wymaga wiersza także
tam, choć akcja niczym nie strzela. Nie szukaj tego w komentarzach: obie listy pilnuje kompilator,
więc wystarczy puścić `pnpm -r exec tsc --noEmit` **przed** pisaniem UI.

**Sufit `SKILL_LEVEL_MAX` w profilu statysty ścinał Wartość bojową (31.08).** Objaw byłby taki:
C-SWAT z Wartością 15 bije i broni się jak krawężnik, a nikt nie widzi dlaczego — zapis do bazy
szedł poprawny, ścinał **odczyt** (`sanitizeCombatProfile`). Dotyczyło czterech z sześciu
kategorii Wsparcia (14, 16, 15, 14) i wszystkich pięciu Demonów (14). Nie wyszło przez dwa etapy,
bo testy sprawdzały `cpredBackupProfile` — czystą funkcję **przed** sanityzacją. Morał szerszy niż
ta jedna stała: funkcję, której wynik idzie do kolumny JSON, testuj po przejściu tam i z powrotem,
a nie w miejscu, w którym powstaje.

**Karta zapisana ≠ karta rzucana** (05.09, etap 38a). Figura z Wartością bojową ma na karcie
Umiejętności przy suficie dziesięć, a rzuca czternastką — bo podstawia ją `sheetForRoll` w chwili
rzutu. Test, który czyta wartość **z karty** i oczekuje czternastki, jest testem złego miejsca:
sprawdzaj sumę rozbicia rzutu, nie liczbę w kolumnie.


## karta — Karta postaci: układ, panele, pola

- **Ujemne `hpCurrent` wpisane wprost do bazy znika przy pierwszym odczycie karty** — `collectCharacterDataPatch` odrzuca `hpCurrent < 0`, a `parseCharacterData` podstawia wtedy PW **domyślnej** karty (35), nie maksimum tej postaci ani zera. Konający NPC przygotowany na −5 wraca jako 35/40 i pierwszy Test idzie na PT z innego progu ran. Obrażenia i tak mają podłogę na zerze (`damage.ts`, „HP floor at 0”), więc **poligon przygotowuje się przez 0**.
- **„Panel sam się zresetował po zmianie z zewnątrz" to zwykle przełączona zakładka karty, nie rozgłoszenie** — filtr i otwarty rejestr w „Awansie" giną przy KARTA ↔ ŚCIEŻKA ŻYCIA, bo to stan lokalny, a `setTab` odmontowuje stronę. Rozpoznanie: zapamiętaj węzeł (`window.__probe = el`) i sprawdź `isConnected` po zdarzeniu — węzeł nadal podłączony znaczy, że winowajcą jest co innego.
- **Ta sama nazwa klasy CSS dwa razy w `sheet.css` — wygrywa późniejsza.** `.cp-slot` była etykietą lokacji pancerza **i** pudełkiem gniazda cyborgizacji, więc „Głowa/Korpus/Tarcza” znikały z tabeli. Przed dopisaniem klasy: `grep -n '^\.nazwa {' sheet.css`.
- **`display: flex` (i `grid`) na `<td>` wyjmuje komórkę z układu tabeli** — przestaje sięgać wysokości wiersza, a czerwone tło `.cp-table` wychodzi spod treści jak błąd renderowania. Flex idzie na wrapper **wewnątrz** komórki.
- **Panel wstawiony w `.cp-field` nie rozciąga się sam** (brak `flex: 1`), a selektor `.cp-span2` w kontenerze siatki trafia w więcej dzieci, niż się wydaje — stąd pusta prawa kolumna „Ścieżki Życia”.
- **Jeden zły wiersz listy kasuje CAŁĄ listę przy odczycie** — `validateRows` zwraca `undefined`, a `parseCharacterData` podstawia `[]`; id wiersza dłuższe niż **32 znaki** wystarczy. Generuj je jak klient (`newRowId`), nie z id kompendium.
- **Cecha karty nie może wynosić 0** (`CPRED_STAT_MIN` = 1): `validateStats` odrzuca wtedy **cały** blok i karta wraca z samymi piątkami.
- **Łata karty z częściowym blokiem Cech jest odrzucana w całości** — `validateStats` chce wszystkich dziesięciu; `stats: { cool: 8 }` daje `INVALID_DATA` i zabiera ze sobą resztę łaty.
- **`.advance-buy` przegrywa kaskadę z `.awareness-steps button`** (0,1,0 vs 0,1,1) — guzik „Podnieś" zostaje przy 1,6 rem i wychodzi poza wiersz. Szerokość czyta się `getComputedStyle`, nie okiem.
- **`validateSkills` i `validateStats` odrzucają CAŁĄ mapę przez jeden wiersz spoza zakresu** — nie ścinają go i nie wyrzucają. Objaw jest cichy: figura jest po prostu słabsza, niż ją wpisano.

---

- **„Panel sam się zresetował po zmianie z zewnątrz" — zanim oskarżysz rozgłoszenie, sprawdź, czy nie przełączyłeś zakładki karty (09.09, oględziny 29a).**
  Objaw z oględzin: gracz zaznacza w „Awansie" filtr „tylko na które mnie stać" i rozwija rejestr,
  MG przyznaje pulę po sesji — a po chwili filtr jest odznaczony, rejestr zwinięty i pusty.
  Wygląda to jak przerysowanie panelu po `character:upsert` i taka była pierwsza diagnoza: **błędna**.

  Filtr i rejestr są stanem lokalnym `AdvancementPanel`, a panel stoi na **stronie drugiej karty**
  (zakładka „ŚCIEŻKA ŻYCIA"). Każde przejście KARTA ↔ ŚCIEŻKA ŻYCIA to `setTab`, czyli odmontowanie
  całej strony razem z jej `useState` — i to ono czyściło stan, tyle że kilka kliknięć wcześniej.
  Rozgłoszenie nie ruszało niczego: `applyUpsert` w `characterStore` nigdy nie usuwa karty ze
  składu, a `CharacterSheetWindow` ma stały `key`.

  **Rozpoznanie, które rozstrzyga w jednym kroku:** zapamiętaj węzeł panelu przed zdarzeniem
  (`window.__probe = document.querySelector('.advance')`), wywołaj zdarzenie i sprawdź
  `window.__probe.isConnected`. Węzeł **nadal podłączony** znaczy, że komponentu nikt nie
  odmontował, więc winowajcą jest co innego niż rozgłoszenie — a odłączony wskazuje prawdziwy
  unmount i dopiero wtedy warto szukać w `key`, w `if (!character) return null` albo w kluczu okna.

  Przy okazji: prawdziwy błąd, który ten fałszywy trop przykrywał, był po drugiej stronie —
  rejestr **nie odświeżał się wcale**, nawet przy nietkniętym panelu (patrz umowa o stemplu karty
  w `umowy-kodu.md`). Objaw „stan znika" i objaw „stan zostaje stary" wyglądają przy jednym
  kliknięciu podobnie i łatwo pomylić je ze sobą.

- **Ta sama nazwa klasy CSS w dwóch miejscach `sheet.css` — wygrywa późniejsza (06.09).**
  `.cp-slot` była etykietą lokacji w tabeli pancerza (27b) **i** pudełkiem gniazda na sylwetce
  cyborgizacji (27c, `position: absolute`, czerwone tło). Efekt: „Głowa", „Korpus" i „Tarcza"
  **znikały** z tabeli pancerza — nie były przezroczyste, tylko wyjęte z układu wiersza
  i pomalowane na kolor tła tabeli. Objaw czyta się jako „brak w JSX", a JSX jest w porządku.
  **Rozpoznanie:** `getComputedStyle(el).backgroundColor` na elemencie, którego nie widać —
  wartość, której nie ma w jego własnej regule, znaczy drugą definicję. **Naprawa:** nazwa
  z przedrostkiem obszaru (`cp-armor-slot`); przed dopisaniem klasy do `sheet.css` sprawdź
  `grep -n '^\.nazwa {' sheet.css`.

- **`display: flex` na `<td>` wyjmuje komórkę z układu tabeli (06.09).** Komórka przestaje
  rozciągać się na wysokość wiersza, a że tło `.cp-table` jest czerwone, pod treścią zostaje pas
  czerwieni wyglądający jak błąd renderowania. Dotknęło to `.weapon-actions`, `.armor-slot-cell`
  i `.armor-actions`. **Naprawa:** albo flex na **wrapperze wewnątrz** komórki
  (`.weapon-actions-row`), albo zwykły układ inline z `white-space: nowrap`. To samo dotyczy
  `display: grid`.

- **Panel wstawiony w `.cp-field` nie rozciąga się sam (06.09).** `.cp-field` jest wierszem flex,
  więc dziecko bez `flex: 1` dostaje szerokość swojej treści — rejestr awansów siedział przez to
  w lewej połowie pola, a druga połowa zostawała biała. To samo w drugą stronę: reguła
  `.cp-lifepath-head .cp-span2 { grid-column: auto }` (żeby „Pseudonimy" stanęły obok licznika PD)
  zdejmowała rozciągnięcie **także** panelowi awansu, i prawa kolumna zakładki „Ścieżka Życia"
  była pustym czerwonym prostokątem wysokim na pół ekranu. Selektor `.cp-span2` w kontenerze
  siatki trafia w więcej dzieci, niż się wydaje.

- **Jeden zły wiersz listy na karcie kasuje CAŁĄ listę przy odczycie — po cichu.** `validateRows`
  (`shared/systems/cpred/character.ts`) zwraca `undefined`, gdy **którykolwiek** wiersz nie
  przeszedł, a `parseCharacterData` podstawia wtedy domyślne `[]`. Karta zapisuje się bez błędu,
  a przy następnym odczycie ekwipunek jest pusty. 03.09 wywróciło się na tym generowanie id:
  `gear-pharma.turbo-uzdrawiacz-<czas>` ma 37 znaków, a `validateRowBase` tnie id **na 32** —
  „Antybiotyk" (31 znaków) przechodził, „Turbo uzdrawiacz" nie, i razem z nim znikał antybiotyk.
  **Rozpoznanie:** zdarzenie zwraca sukces, w bazie jest komplet, a `state:sync` przynosi pustą
  listę. **Obejście:** id wierszy generuj tak jak klient — `Math.random().toString(36).slice(2, 10)`
  (`newRowId` w `CharacterSheet.tsx`), nigdy z doklejonym id kompendium ani znacznikiem czasu.

**Nowa Cecha karty nie może wynosić 0** — `CPRED_STAT_MIN` to 1, a `validateStats` odrzuca
**cały** blok Cech, gdy choć jedna wypada poza zakres. Objaw jest mylący: karta wraca z samymi
piątkami, jakby tabela w ogóle się nie wczytała. Tabele zawodów zespołu (30c) nie drukują
Szczęścia — pracownik dostaje więc `luck: 1` i **pustą sakiewkę** (`luckCurrent: 0`), co przy
stole znaczy to samo, a przez walidację przechodzi.

**Łata karty z częściowym blokiem Cech jest odrzucana w całości** (30.08). `validateStats`
przechodzi po wszystkich dziesięciu Cechach i przy pierwszej brakującej zwraca `undefined`, więc
`patch: { data: { stats: { cool: 8 } } }` kończy się `INVALID_DATA` — a wygląda dokładnie jak
„serwer nie przyjmuje mojej zmiany Roli", bo `roleId` z tej samej łaty też nie dochodzi. Kosztowało
trzynaście czerwonych testów naraz w `roles30d.test.ts`. Cechy podaje się kompletem albo wcale.

**`.advance-buy` przegrywał kaskadę z `.awareness-steps button`.** Panel awansu z 29a dzieli
szkielet wiersza z panelem Zmysłu Walki (30a), a tamten ma guziki ±1 przycięte do 1,6 rem
selektorem `.awareness-steps button` (0,1,1). Guzik „Podnieś" z klasą `.advance-buy` (0,1,0)
dziedziczył tę szerokość i wychodził poza wiersz: w przewijanej liście Umiejętności widać było
„Podn", a `.advance-scroll` dostawał poziomy pasek przewijania. Objaw wygląda jak zbyt wąska
kolumna, jest zbyt słabym selektorem — `width: auto` trzeba dopisać jako `.awareness-steps
.advance-buy`. Sprawdza się to jedną linijką w konsoli: `getComputedStyle(btn).width`, nie okiem.
(Znalezione przy oględzinach 29b; błąd jest z 29a.)

**`validateSkills` odrzuca CAŁĄ mapę Umiejętności przez jeden wiersz spoza zakresu** (05.09).
Nie „ścina ten jeden do dziesiątki" i nie „wyrzuca ten jeden wiersz" — `patch.skills` w ogóle nie
powstaje, a `parseCharacterData` bierze wtedy domyślne (puste). Tak samo działa `validateStats`:
jedna Cecha poza zakresem i karta wraca jako przeciętny człowiek po pięć. Objaw jest cichy —
figura po prostu jest słabsza, niż ją wpisano. Wszystko, co zapisuje liczby na kartę **z innego
modelu** (etap 38a: sześć pól menu żetonu, Wartość bojowa Wsparcia), musi ścinać je do sufitu
karty **przed** zapisem.


## postac — Kreator, PD, Role, cyborgizacje

- **Pole tekstowe, które „nie przyjmuje znaków", bywa zgubionym odczytem** — sprawdź po kolei `activeElement`, atrybuty pola, inne pole obok, a potem **bazę**; automat podejrzewaj ostatni.
- **Test stawiający postać łatą gracza od 29a dostaje `FORBIDDEN`** — i pada w asercji o czymś zupełnie innym, bo przygotowanie stołu wygląda w teście jak tło. Kartę stawia gniazdo MG.

---

- **Pole tekstowe, które „nie przyjmuje znaków", bywa zgubionym odczytem, nie zepsutym polem**
  (27.08). Specjalizacja umiejętności w kreatorze wyglądała na martwy input: klik ustawiał
  ognisko, znak leciał, wartość zostawała pusta. Sprawdzenie po kolei: pole nie jest `readOnly`
  ani `disabled`, pisanie w **innym** polu na tej samej stronie działa, a wartość **jest**
  w bazie (`CharacterDraft`) — więc winny był odczyt (`parseCreationDraft`), nie klawiatura.
  Kolejność, która to rozstrzyga najszybciej: (1) `document.activeElement` — czy to na pewno to
  pole, (2) atrybuty pola, (3) inne pole obok, (4) **zajrzyj do bazy**. Dopiero potem podejrzewaj
  automat.

**Test, który stawia postać łatą gracza, od 29a dostaje `FORBIDDEN`** (30.08). Poziomy
Umiejętności, ranga Zdolności, `roleId` i licznik PD wypadły z `character:update` u gracza, więc
każdy stary test przygotowujący kartę przez gniazdo gracza (`emitAck(player, 'character:update',
{ data: { skills: … } })`) pada — i pada **w miejscu asercji o czymś zupełnie innym**, bo
przygotowanie stołu wygląda w teście jak tło. Padły tak trzy testy w `characters.test.ts`
i `roles30d.test.ts`. Kartę stawia się gniazdem MG; gracz kupuje poziom przez
`character:advance`.


## ekwipunek — Ekwipunek i przedmioty między kartami

- **Odległość „ode mnie" to NAJBLIŻSZA własna figura, nie pierwsza z listy** — karta potrafi stać dwiema figurami (kopia z 35), a serwer egzekwuje zasięg po najbliższej parze.
- **Komunikat „czeka na X" wolno napisać dopiero wtedy, gdy serwer powie, że coś czeka** (`InventoryGiveResult.pending`); zdanie warunkowe w komunikacie o skutku to znak brakującego pola w ack.

---

- **Odległość „ode mnie" liczy się od NAJBLIŻSZEJ własnej figury, nie od pierwszej z listy.**
  Karta potrafi stać dwiema figurami naraz (kopia z etapu 35, drugi żeton tej samej postaci na tej
  samej scenie), a `tokens.findMany` zwraca je w kolejności bazy. Pierwsza wersja
  `inventory:sources` brała `find(...)`, a serwer egzekwował zasięg po **najbliższej** parze —
  rozwijana lista mówiła więc co innego, niż stosowała odmowa. Wyszło przy oględzinach: „avatar9 —
  64 m" liczone od drugiej figury Rudego, stojącej na innej scenie.

- **Komunikat „czeka na X" wolno napisać dopiero wtedy, gdy serwer powie, że coś czeka.** Okno
  wymiany pisało „Wysłane do: … Czeka na przyjęcie, jeśli kartę prowadzi gracz" po **każdym**
  przekazaniu — także po tym na kartę NPC-a, które wykonało się od ręki. Klient nie ma jak tego
  rozstrzygnąć (gracz nie widzi, kto jest właścicielem cudzej karty), więc rozstrzyga to ack:
  `InventoryGiveResult.pending`. Zdanie warunkowe („jeśli…") w komunikacie o skutku jest zwykle
  znakiem, że brakuje pola w odpowiedzi.


## czas — Czas świata, kalendarz, efekty czasowe

- **`timed-effects.ts` ↔ `stat-effects.ts` to cykl importów** — pierwszy woła drugi, więc drugi pyta o `Combat` sam, zamiast importować `activeRoundOfScene`.
- **„Naturalne leczenie jeszcze się nie zaczęło" to nie usterka zegara** — `cpredRestDay` chce udanego Ustabilizowania (s. 222), a karta z ręcznie obniżonym PW w bazie go nie ma.

---

- **`timed-effects.ts` i `stat-effects.ts` prawie zamknęły cykl importów.** Pierwszy woła drugi
  (przemiatanie rundowe zdejmuje też efekty Cech), więc drugi **nie może** importować
  `activeRoundOfScene` z pierwszego — w ESM cykl daje pusty obiekt w środku ładowania i wywala
  się dopiero przy pierwszym wywołaniu, w losowym miejscu. Zapytanie o `Combat` jest
  jednowierszowe i siedzi teraz w obu plikach osobno; to jest tańsze niż cykl.

**Karta odpoczynku, która mówi „naturalne leczenie jeszcze się nie zaczęło", to nie usterka
zegara** — `cpredRestDay` wymaga udanego Ustabilizowania (s. 222), a postać z ręcznie obniżonym
PW w bazie go nie ma (`recovery` jest wtedy `undefined`). Żeby zobaczyć realne leczenie przy
oględzinach, trzeba najpierw ustawić `recovery.stabilized`.


## siec — Sieć (netrunning)

- **Ślizg i Paf są w wierszu Czarnego LOD-a**, nie w rządku zdolności — pojawiają się dopiero, gdy jakiś LOD stanie w szybie.
- **Czarny LOD nie spawnuje się drugi raz na tym samym piętrze** (`metIce`); dołóż go na piętro jeszcze nieodwiedzone albo przerób `empty` → `ice`.
- **„Zderezowany" ≠ „zniszczony"** — Program z `destroys` (Szabloząb, Zabójca, Smok) niszczy zamiast derezować; różnicę widać w chipie, nie w REZ.

---

- **Ślizg i Paf pojawiają się dopiero, gdy Czarny LOD stanie w szybie** (27.08). Okno runa
  pisze wtedy wprost: „Ślizg i Paf czekają na Czarnego LOD-a — oba są testami spornymi
  i pojawiają się przy nim". Szukanie ich w rządku zdolności obok Backdoora to strata czasu —
  są **w wierszu LOD-a**, razem z „Atakuj" i selektorem Programu.

- **Czarny LOD nie spawnuje się drugi raz na tym samym piętrze** (27.08). `spawnIceOnFloors`
  pomija piętra z `state.metIce`, więc dołożenie Programu do piętra, na którym netrunner **już
  stał**, nie da nic — trzeba dołożyć go na piętro jeszcze nieodwiedzone (albo przerobić na LOD
  piętro, przez które biegła dotąd sama droga: `metIce` zbiera **wyłącznie** piętra rodzaju
  `ice`, więc `empty` → `ice` spawnuje normalnie).

- **„Zderezowany" i „zniszczony" to dwa różne końce Czarnego LOD-a** (27.08). Program z flagą
  `destroys` (Szabloząb, Zabójca, Smok) **niszczy zamiast derezować** — chip na wierszu mówi
  „zniszczony", nie „zderezowany". Jeśli test albo oględziny mają dowieść derezowania, bij
  Mieczem albo Młotem; różnicy nie widać w REZ (obie drogi kończą się 0), tylko w chipie.


## boty — Boty, AI Gateway, RAG

- **`reasoning_budget` w llama-server egzekwuje tylko 0 i −1** — każda ścieżka z `reasoning: true` musi znieść pustą odpowiedź.
- **Chip „⟳ nieaktualny" na nietkniętym wpisie to zwykle stary odcisk**, nie regres indeksowania — policz digest kodem aplikacji i porównaj z bazą.
- **Powrót gatewaya odklikasz atrapą `/health` na :8100** — kilkanaście linijek `node:http`, bez modelu; serwer odpytuje ją co 10 s.

---

- **`reasoning_budget` w llama-server nie działa dla wartości dodatnich** — przyjmuje 640 bez błędu, ale egzekwuje wyłącznie 0 i −1. Każda ścieżka z `reasoning: true` musi umieć obsłużyć **pustą odpowiedź** po zużyciu całego `max_tokens` na blok think. Szczegóły w `ai-gateway/README.md`.
- ~~**Testy dymne serwera potrafią raz na kilka przebiegów pęknąć na limicie czasu**~~ —
  **przyczyna znaleziona 03.09: `beforeAll` bez `}, 60_000);`** (wpis na górze pliku). Oryginalny
  opis, zostawiony dla objawów: **Testy dymne serwera potrafią raz na kilka przebiegów pęknąć
  na limicie czasu** — każdy plik podnosi własny Fastify z Socket.IO, więc przy pełnym `pnpm --filter @vtt/server test` bywa ciasno. Zaobserwowane 08.08: dwa różne przypadki (`ammo.test.ts`, `ammo-effects.test.ts`) pękły po jednym razie na trzy przebiegi i **oba przeszły uruchomione osobno**. Zanim zaczniesz szukać regresji, powtórz sam plik.
  **Korekta z 14.08:** w przypadku `ammo.test.ts` limit czasu **nie był przyczyną** — test „an
  armour-piercing round takes two points of SP" pękał **także uruchomiony sam**, raz na kilka
  przebiegów, i to z powodu dwóch źródeł losowości w samym teście (zdarty pancerz celu + rzut
  2k6, który nie przechodzi przez pancerz). Naprawiony; 12 przebiegów bez porażki. **Wniosek
  ogólny:** zanim uznasz migotanie za „ciasny limit czasu", sprawdź, czy komunikat mówi
  o **czasie**, czy o **asercji** — ten mówił o asercji przez pół roku.
  **Korekta z 16.08:** bliźniacze migotanie `ammo-effects.test.ts` („1k10 + 10 nie wyjdzie
  poniżej 11") było łatane 15.08 **warunkiem, który nigdy nie był prawdziwy**: `roll.critical`
  to **obiekt** `{ type: 'fumble' | 'crit', extraRoll }`, a test porównywał go z napisem
  `'failure'`. Poprawka nie zmieniła więc nic, a test pękał na każdej naturalnej jedynce, czyli
  **raz na dziesięć przebiegów**. Naprawione (`critical?.type === 'fumble'`, dolna granica 1).
  **Wniosek ogólny:** porównanie z literałem w teście sprawdź na prawdziwym kształcie danych —
  TypeScript nie pomoże, jeśli lokalny typ wypisany w teście też zmyśla.

- **Chip „⟳ nieaktualny" na wpisie, którego nikt nie ruszał, to zwykle stary odcisk, nie regres**
  (27.08). `stale` liczy się jako `indexedDigest !== knowledgeDigest(...)`, więc wystarczy, że
  odcisk zapisano inną wersją funkcji. Zanim zaczniesz szukać błędu w indeksowaniu, policz
  odcisk **kodem aplikacji** (nie przepisanym do Pythona — łatwo o różnicę) i porównaj z bazą;
  „Zaindeksuj wszystko" i tak to naprawia.

- **Powrót gatewaya da się odkliknąć bez modelu**: atrapa `/health` na `127.0.0.1:8100`
  (kilkanaście linijek `node:http`, zwraca `{"status":"ok","llama":"external",…}`). Serwer VTT
  odpytuje ją co 10 s (`AI_HEALTH_INTERVAL_MS`), `ctx.ai.onStatusChange` rozsyła `ai:status`
  i wszystkie ścieżki „gateway wrócił" można obejrzeć bez `llama-server`. Wzór leżał w
  scratchpadzie sesji 28.08 — pisze się szybciej, niż się szuka.


## dane — Kompendium, parsery, dane podręcznika

- **Regex na zrzucie podręcznika łapie każdą liczbę, także numer strony.** Pierwsza wersja `parse-encounters.py` zrobiła z „STR. 417” wiersz tabeli („dziura 101–417”). Zakres wiersza musi być zakotwiczony (nawias albo początek linii) **i** mieć po sobie krótką nazwę z dwukropkiem.
- **Podręcznik bywa źródłem błędu, nie tylko parser.** Tabela wieczorna ma w druku wiersze „(70–72)” i „(72–77)” — 72 w obu. Errata siedzi w `KNOWN_FIXES` **w skrypcie**, bo JSON jest wynikiem i kolejny przebieg parsera skasowałby ręczną poprawkę bez śladu.
- **Karta wpisu kompendium gubi wybór przy zmianie zakładki** — postać, chirurg i poziom ripperdoca wracają do wartości domyślnych; sprawdzaj je tuż przed kliknięciem guzika.
- **Ręczna `tabela-ran-krytycznych.md` jest poza repo i od 27.08 zbędna** — kompendium ma obie tabele 2k6 z podręcznika; plik obsługuje wyłącznie wariant „mam sam Easy Mode".
- **Wygenerowane kompendium bywa starsze niż parser** — pliki w `data/private/cpred/compendium/` są poza repo, więc zmiana `parse-manual.py` ich nie odświeża; przy dziwnym zachowaniu danych najpierw puść import.
- **Publiczna próbka `skills.json` ma 42 z 66 Umiejętności**, a `validateSkills` wycina resztę po cichu — pakiet wpisany kodem traci na niej poziomy. To brak danych, nie regres.
- **Nazwa w kodzie ≠ nazwa w pliku danych** (wielkość liter) — dopasowania po nazwie rób na `trim().toLowerCase()`.
- **Nazwa z tabeli zbiorczej wygląda jak nagłówek opisu, a nim nie jest** — w sekcji dodatków każda pada trzy razy; opis otwiera wyłącznie wersja WERSALIKAMI.
- **Trzy liczby tabeli magazynków są zlepione**, ale pierwsza jest znana (magazynek z tabeli broni) — reszta ma jeden podział zgodny z porządkiem kolumn; nagłówek klei się z pierwszym wierszem.

---

- **Regex na zrzucie podręcznika łapie każdą liczbę, także numer strony.** Pierwsza wersja
  `parse-encounters.py` uznała „(patrz Korpogliniarze, STR. 417)" za wiersz tabeli i raport
  pokazał „dziura 101–417" — objaw wskazujący na dziury, nie na wiersz widmo. Zakres wiersza musi
  być **zakotwiczony** (nawias albo początek linii) **i** mieć po sobie krótką nazwę zakończoną
  dwukropkiem. Podrzuty w opisie („Rzuć 1k10. 1–2: wnoszą skrzynię") odpadają same, bo po ich
  liczbie stoi dwukropek zamiast spacji.

- **Podręcznik bywa źródłem błędu, nie tylko parser.** Tabela „Spotkania wieczorne" ma **w druku**
  wiersze „(70–72) Drużyna Solo" i „(72–77) Cybergang" — liczba 72 w obu. Sąsiedztwo (64–69, potem
  72–77) nie zostawia wątpliwości, więc pierwszy kończy się na 71. Poprawka siedzi w `KNOWN_FIXES`
  **w skrypcie**, nie w wygenerowanym JSON-ie: JSON jest wynikiem i kolejny przebieg parsera
  skasowałby ręczną poprawkę bez śladu. Zanim uznasz raport pokrycia za błąd parsera, sprawdź
  liczby w źródle.

- **Karta wpisu kompendium gubi wybór przy zmianie zakładki.** Postać docelowa, chirurg
  i poziom ripperdoca żyją w stanie komponentu, więc każde wyjście na „Czat" i powrót ustawia
  je z powrotem na wartości domyślne (pierwsza postać z listy, „Bez Testu montażu", 12). Przy
  oględzinach 04.09 zabrało to jeden rzut, który miał być porażką i wyszedł sukcesem, bo
  poziom chirurga wrócił do dwunastu. Sprawdzaj wybór **tuż przed** kliknięciem guzika.

- **Dane CP RED (`skills.json`, `roles.json`) wczytywały się dopiero po otwarciu „Postaci" albo karty postaci** — `ensureCpredDataLoaded` wołały tylko te dwa komponenty. Dopóki każdy atak zaczynał się od karty, nikt tego nie zauważył; HUD z 16f zaczyna go z mapy, więc **każdy strzał wracał z „Nie wiem, jaką umiejętnością strzelać z tej broni"** (`UNKNOWN_SKILL` — pusty rejestr umiejętności, nie brak danych w kompendium). Naprawione 01.08: `MapArea` woła je razem z `ensureStatusesLoaded`. **Wniosek na przyszłość:** nowe wejście do mechaniki sprawdź na **świeżo przeładowanej karcie, bez otwierania żadnej zakładki** — to jedyny stan, w którym takie leniwe ładowanie widać.

- **`data/private/rulebook/manual/tabela-ran-krytycznych.md` jest poza repo i od 27.08 nie jest
  nikomu potrzebny.** Kompendium ma dziś **obie** tabele 2k6 (11 ran korpusu + 11 głowy, s. 187–188)
  prosto z podręcznika przez `parse-manual.py`; ręczna tabela obsługuje wyłącznie wariant „mam sam
  Easy Mode". Zostawione jako ostrzeżenie, nie zadanie: bezpiecznik przed nadpisaniem i wzór
  formatu są w `data/public/cpred/tabela-ran-krytycznych.wzor.md` (opis w
  `archiwum/zamkniete-zaleglosci.md`).

**`data/private/cpred/compendium/` bywa starsze niż `parse-manual.py`.** Wygenerowane pliki są
poza repozytorium (gitignore), więc nic ich nie odświeża przy zmianie parsera — a `git status`
tego nie pokaże. 29.08 regeneracja dołożyła Miotaczowi ognia `ammoPatterns: ['shell']`, którego
plik na dysku nie miał **od nieznanej liczby sesji**; bez tego pola `ammoFitsWeapon` odrzuca każdy
nabój specjalny (broń bez `ammoPatterns` i bez `ammoIds` nie przyjmuje niczego), więc miotacza
nie dało się załadować amunicją zapalającą mimo gotowej mechaniki z 16g. Objaw jest zawsze ten
sam: **kod robi coś, czego dane nie znają**. Zanim zaczniesz szukać błędu w kompendium, puść
`python tools/import/parse-manual.py` i porównaj wynik — import wypisuje ostrzeżenia i liczby,
a diff dwóch wersji pliku mówi więcej niż godzina czytania parsera.

**Publiczna próbka `skills.json` ma 42 z 66 Umiejętności** — a `validateSkills` wycina id spoza
rejestru **po cichu**, przy każdym odczycie karty. Pakiet Umiejętności wpisany kodem (zespół
Korpo z 30c) traci więc na próbce część poziomów: `cybertech`, `basic-tech`, `weaponstech`,
`land-vehicle-tech`, `pilot-air-vehicle`, `language`, `endurance`, `trading` i kilkanaście
innych po prostu znika. To **nie jest** błąd pakietu ani regres — to brak danych; w grze jedzie
prywatny `skills.json` z kompletem. Test, który sprawdza taki pakiet, musi asertować na
Umiejętnościach obecnych w próbce publicznej.

**Nazwa z tabeli w kodzie a nazwa w pliku danych różnią się wielkością litery (31.08).**
`roleability.ts` pisał „Ukrycie/znalezienie przedmiotu", `skills.json` ma „Ukrycie/Znalezienie
przedmiotu" — i jedna z piętnastu Umiejętności agenta federalnego znikała bez śladu, bo
dopasowanie po nazwie jest w tym projekcie regułą (broń Wsparcia, `criticalInjuryAt`). Każde
takie dopasowanie porównuj po `trim().toLowerCase()`.

**Nazwa z tabeli zbiorczej wygląda jak nagłówek opisu — i nim nie jest (01.09).** Sekcja „DODATKI
DO BRONI" wymienia każdą nazwę **trzy razy**: w tabelce cen na początku („Bagnet 100 ed
(Premium)"), jako nagłówek własnego akapitu WERSALIKAMI („BAGNET Cena: …") i w środku prozy
sąsiada („Aby złącze smartguna działało…"). Pierwsza próba brała wystąpienie pierwsze i dostawała
akapity bez zdania „Pasuje do:"; druga brała ostatnie i **gubiła cenę złącza smartguna**, bo
ostatnie wystąpienie tej nazwy siedzi w prozie. Wersaliki są jedyną formą, która znaczy „tu
zaczyna się opis" — `attachment_chunks` dopasowuje `label.upper()` i bierze pierwsze trafienie.
Polskie `.upper()` radzi sobie z diakrytykami („ł" → „Ł"), więc tabela reguł zostaje w normalnej
pisowni.

**Trzy liczby tabeli magazynków są zlepione w jedną, ale wiersz jest zakotwiczony (01.09).**
Zrzut daje „Ciężki pistolet 81428" — 8, 14, 28. Rozdzielić da się to tylko dlatego, że **pierwsza
liczba jest znana**: to magazynek z tabeli broni, wczytany stronę wcześniej. Reszta ma dokładnie
jeden podział zgodny z porządkiem tabeli (zwykły ≤ wydłużony ≤ bębnowy); wiersz z dwoma albo
zerem takich podziałów idzie do ostrzeżeń, bo po cichu wybrany bęben kłamałby do końca kampanii.
Do tego **nagłówek tabeli klei się z pierwszym wierszem** („TypZwykłyPrzedłużonyBębnowyŚredni
pistolet 121836"), więc ogólne wyrażenie na etykietę zjada nagłówek i gubi Średni pistolet —
rozcina to `split_on_anchors` po nazwach typów broni, bo nagłówek nazwą nie jest.


## kopie — Kopie zapasowe, eksport i import

- **Polski znak w nagłówku HTTP to 500, nie brzydka nazwa pliku** — objawem jest „eksport nie działa dla niektórych postaci"; nagłówek jest latin-1.

---

- **Polski znak w nagłówku HTTP to 500, nie brzydka nazwa pliku.** Karta „Bezpański" wysyłana
  z `Content-Disposition: attachment; filename="character-bezpanski-…"` wywracała całą trasę
  (`TypeError: Invalid character in header content`) — a objawem było „eksport nie działa dla
  niektórych postaci". Nagłówek jest latin-1; nazwy z ogonkami idą przez `filename*=UTF-8''…`.


## ogledziny — Oględziny w przeglądarce

- **`hover` + `left_click` z `computer` nie jest rozkazem marszu** — trasa liczy się na `pointermove`, więc figura stoi, a w rendererze zostaje **rozpoczęty marsz**, który gasi podgląd trasy: kolejne najechania nic już nie rysują i wygląda to jak zepsuty ruch. Rozpoznanie: następny klik odkłada w czacie „Marsz przerwany.”. Działa dopiero pełna seria z konsoli (`pointermove` → pauza ~400 ms → `pointermove` o 2 px → `pointerdown`/`pointerup`) we współrzędnych CSS.
- **Odmowy Akcji lądują w kategorii czatu „Stół”, a filtr bywa wyłączony** — zamiast „Zbyt daleko — Pochwycenie wymaga zwarcia (2 m).” widać „⋯ 1 ukryty wiersz ⋯” i klik wygląda na przycisk, który nic nie robi. Filtry są prywatne i lokalne (`localStorage`), więc trzymają się karty, nie konta: **włącz wszystkie cztery przed oględzinami**.
- **Lista statusów w menu kontekstowym żetonu wychodzi poza dolną krawędź okna** — „Powalony” wypada ok. 150 px pod widokiem, `scrollIntoView` nie pomaga (menu się nie przewija), a `computer` nie kliknie poza zrzutem. Tu akurat `input.click()` na checkboksie **działa** (React łapie zdarzenie) — inaczej niż przy `form_input` z pułapki niżej.
- **Kursor najechany automatem nie budzi `onAimHover` w Pixi** — celownik się uzbraja i linia strzału się rysuje, ale dymek pod kursorem nie wychodzi. Bliźniak pułapki o prawym kliku w kanwę: obie drogi kliknięte ręką MG działają, obie z automatyki milczą.
- **Ścieżka z przycisku i ścieżka ze skrótu to dwie ścieżki** — Alt+klik przeszedł oględziny etapu 40, przycisk „Poproś MG” nie; usterka siedziała w tej drugiej. Przy dwóch wejściach sprawdzaj oba.
- **Karta w tle dławi `setInterval` i `requestAnimationFrame` do ~1 Hz** — pomiar przytrzymania guzika w automatyce przeglądarki jest nieważny; rAF nie zwraca ani jednej klatki.
- **Automatyka przeglądarki gubi modyfikator `alt` przy kliknięciu** — Alt+klik nie dochodzi do strony i wygląda jak niedziałająca funkcja. Obejście: `dispatchEvent(new MouseEvent('click', { bubbles: true, altKey: true }))`.
- **Automatyka przeglądarki potrafi zgubić drugą sesję** — zanim uznasz to za błąd serwera, sprawdź `fetch('/api/auth/me')` w obu kartach; cookie jest `httpOnly`, więc widać wyłącznie nagłówek strony.
- **`<input type="file">` DA SIĘ obsłużyć automatem** (`DataTransfer` → `input.files` → `change`) — inaczej niż checkbox Reacta z pułapki niżej.
- **Rozszerzenie przeglądarki zaciemnia część wyników `javascript_tool`** (`[BLOCKED: Sensitive key]`, `[BLOCKED: Base64 encoded data]`) — to nie jest błąd aplikacji; sprawdzaj takie rzeczy testem serwera.
- **Bronią obszarową celuj w puste pole** — klik w żeton tylko go zaznacza (u MG każdego), broń schodzi z ręki, a następny klik w mapę jest **rozkazem marszu**; strzał puszcza „Potrząśnij i strzel", nie drugi klik.
- **Efektu mapy nie złapiesz zrzutem** (1,1–1,6 s) — wywołaj go wprost przez `fx.play([...])` i **zamroź** klatkę (`life = 400000`, `age = life * klatka / liczbaKlatek`); pierwsze 20 z 64 klatek wybuchu to białe iskry, nie usterka.
- **Slot paska akcji klikaj po współrzędnych z DOM-u** — chip stanu figury przesuwa listę o cały wiersz i klik trafia w sąsiednią broń; po kliku sprawdzaj zdanie „W ręku: …".
- **`.click()` na slocie paska nie uzbraja celownika** — klik w mapę staje się wtedy rozkazem marszu i wysyła figurę przez pół sceny.
- **Brak pytania przy koszu hurtowym to nie usterka** — `confirmDestructive` pyta tylko poza poligonem, a każde `*:clear` odkłada wpis w buforze `Ctrl+Z`.
- **`window.confirm` zawiesza kartę pod CDP na amen** — przechwyć go (`window.confirm = () => true`) **przed** kliknięciem czegokolwiek niszczącego; po przeładowaniu strony łatę zakłada się od nowa.
- **Zrzut ekranu ma inną skalę niż `clientX`** — mnóż przez `innerWidth / szerokość zrzutu`, zanim wsadzisz współrzędne w syntetyczne zdarzenie wskaźnika.
- **`form_input` na checkboksie Reacta nie zmienia stanu komponentu** — pole zaznacza się wizualnie, warunkowa część formularza się nie pojawia, a następny klik odznacza. Używaj `left_click`.
- **Efektu mapy nie złapiesz zrzutem ekranu** (trwa 300–800 ms) i `performance.now` nie spowalnia Pixi — trzeba wirtualnego znacznika `rAF`.
- **Klik w puste pole przy zaznaczonej figurze to rozkaz marszu** — automatyzuj zdarzeniami wskaźnika z policzonymi współrzędnymi CSS, nie pikselami ze zrzutu.
- **Sesję MG i gracza da się mieć naraz w jednym Chrome**: MG na `localhost:5173`, gracz na `[::1]:5173` (ciasteczko jest kluczowane hostem; `127.0.0.1` nie zadziała).
- **Klik w żeton, którym MG steruje (czyli w każdy), tylko go zaznacza** — celuje dopiero **Alt+klik**, a `modifiers` w `computer` bywa niedostarczane; pewna droga to guzik „ATAK" z karty postaci (`targeting` omija warunek Alt).
- **Dymu nie da się postawić narzędziem** — stawia go wyłącznie wystrzelony nabój („Amunicja dymna" w broni ze wzorcem `grenade`); broń podwieszana nie ma listy naboju.
- **Zrzut ekranu bywa wycinkiem okna** — wtedy klikanie po współrzędnych ze zrzutu chybia; klikaj referencjami z `find`/`read_page`.
- **Przeciągnięcie tokenu da się wysłać automatem** — `pointerdown` na `canvas`, seria `pointermove` z przerwami ~70 ms, `pointerup`.
- **Menu kontekstowe tokenu też** — `PointerEvent` z `button: 2` (Pixi słucha wskaźnika, nie myszy); wystawiane **tylko MG**.
- **Vite potrafi zapamiętać PUSTY moduł**, jeśli plik był przepisywany w trakcie — przeładowanie nie pomaga, trzeba przepisać plik jeszcze raz.
- **HMR przy działającym Pixi wywala stronę** (`Ticker.remove`) — po edycji klienta przeładuj kartę.
- **`window.confirm` zawiesza sterowanie przeglądarką przez CDP** — omijaj przyciski „usuń" albo poproś użytkownika o klik.
- **Edycja kodu w trakcie oględzin przeładowuje kartę** — ognisko wychodzi z pola tekstowego i pisanie leci w globalne skróty mapy (każde „e" to koniec tury).
- **Nowe wejście do mechaniki sprawdź na świeżo przeładowanej karcie**, bez otwierania zakładek — tylko wtedy widać leniwe ładowanie danych CP RED.
- **Rozkaz marszu automatem wymaga ustalonego hovera** — trasa liczy się na `pointermove`; klik w tej samej porcji zdarzeń nic nie robi.
- **Skrótu klawiszowego nie odpalisz syntetycznym `KeyboardEvent`** — Esc musi przyjść z CDP, inaczej marsz się nie przerwie.
- **Rzut z karty to dwa kliknięcia** (Shift+klik ładuje kubek, klik w kubek rzuca), złota kość dorzutu spada 550 ms po pierwszej fali, a stół kości chowa się **pod** oknem karty postaci.
- **Narzędzia mapy nie odpalisz syntetycznym zdarzeniem wskaźnika** — ściana rysuje się w podglądzie i znika; menu kontekstowe żetonu owszem, ale **we współrzędnych CSS**, nie tych ze zrzutu (skala ≈0,8).
- **Automat CDP jednak buduje scenę** (ściany, lampy, osłony, strefy, pinezki) — koryguje „nie da się" z 23.08; kursor płótna mówi, czy pod wskaźnikiem jest chwytalny obiekt.
- **Zrzut ekranu bywa ciemniejszy, niż mówi DOM** — Chrome przyciemnia obraz; motyw czytaj z `dataset.theme` i `getComputedStyle`, nie ze zrzutu.
- **Sprawdź, czy strona naprawdę się przeładowała**, zanim uznasz poprawkę za nieskuteczną — HMR podmienia moduł, ale globalny `keydown` zostaje po starym efekcie.
- **Odmowa serwera, która „nie chce paść"** — najpierw przeczytaj `disabled` przycisku, który miałby ją wywołać: `NET_NODE_USED` blokuje sam klient (chip „węzeł użyty w tej Turze").
- **Spowolnione `rAF` rozdmuchuje chmurę gazu na cały ekran** — sprite rośnie na klatkę, nie na milisekundę; przy 0,03 urośnie 120×. Rozmiar oceniaj przy 0,3, nie niżej.
- **Atak obszarowy z mapy to trzy kliknięcia** — uzbrój slot, kliknij pole (to **ładuje kubek**), kliknij kubek. Pominięcie któregoś = zwykły rozkaz marszu; slot rozbraja się po zmianie tury.
- **Kliknięcia `computer` idą we współrzędnych zrzutu**, nie CSS (skala ≈ 0,8 przy DPR 1,5) — syntetyczne zdarzenia wskaźnika biorą CSS; klik poza zrzutem nie robi nic i nie zgłasza błędu.
- **Nie klikaj „✕" hurtem w oknie karty** — ten sam znak nosi kosz przy wierszu, kasuje bez potwierdzenia; okno zamyka ✕ z nagłówka.
- **Wąskie okno symuluje `documentElement.style.width`**, gdy `resize_window` nic nie robi — ale `@media` czyta viewport, a Pixi potrafi zamulić kartę (zrzut nadal działa).
- **Uzbrojona broń zjada rozkaz marszu** — klik w podłoże jest wtedy strzałem; objaw to „Marsz przerwany." i stojąca figura. Rozbrój slot i powtórz.
- **Marsz automatem wymaga serii `pointermove`**, nie jednego — po linii, którą figura ma iść, z przerwami ~180 ms.
- **`window.confirm` da się podmienić i przeczytać treść pytania** bez klikania i bez ryzyka; podmiana ginie przy przeładowaniu karty.
- **Kubkiem kości nie potrząśniesz z JavaScriptu** — ani `click()`, ani ręczna seria zdarzeń wskaźnika; klikaj `computer` we współrzędnych zrzutu (skala = 1373 / `window.innerWidth`).
- **Ramka, ping i kopia działają z syntetycznych zdarzeń wskaźnika, `Ctrl+A` nie** — skrót klawiszowy trzeba wysłać przez CDP (`computer`, `key: "ctrl+a"`), po kliknięciu w mapę.
- **Ping gaśnie po 2,2 s, czyli szybciej, niż wraca zrzut ekranu** — oglądaj go `setInterval`-em pingującym co 500 ms, nie pojedynczym gestem.
- **Po przeładowaniu karty mapa wraca do `fitScene`** — współrzędne z poprzedniego zrzutu kłamią, a ramka po nich łapie zero figur i wygląda jak zepsuty gest.
- **Nazwy kopii nie odczytasz z etykiety pod żetonem** (przy zoomie stołu nieczytelna) — otwórz menu kontekstowe (`button: 2`) i przeczytaj `.context-menu-title`.
- **Kartę do oględzin da się przygotować w bazie bez logowania na MG** — `node --input-type=module` + `node:sqlite` na `packages/server/dev.db`; `better-sqlite3` nie jest w `node_modules` repozytorium.
- **`pnpm dev` z `&` w tle naprawdę startuje serwery**, choć zadanie kończy się od razu; następne uruchomienie pada na `EADDRINUSE`. Najpierw `curl` na :5173, potem szukanie trupa.
- **Tekst z liczbą sprawdzaj na liczbie większej niż jeden** — cały etap 37 przeszedł oględziny z „jedną dobą", a błąd („minęły 30 doby") pokazały dopiero trzy skoki pod rząd.
- **Feed czatu czytaj z DOM-u, nie ze zrzutu** — `[...document.querySelectorAll('.chat-time')].map(n => n.innerText)`; panel bywa przewinięty i „nie ma karty" znaczy zwykle „nie doskrolowano".

---

- **Automatyka przeglądarki gubi modyfikator `alt` przy kliknięciu (06.09).** `computer` z
  `modifiers: "alt"` klika, ale strona dostaje zwykły klik — Alt+klik na wierszu karty nie
  otwierał okna prośby, choć kod działa. Objaw jest nie do odróżnienia od „funkcja nie zadziałała".
  **Obejście:** `element.dispatchEvent(new MouseEvent('click', { bubbles: true, altKey: true }))`
  przez `javascript_tool` — React łapie to normalnie. `shiftKey` przechodzi tą samą drogą.

- **Automatyka przeglądarki potrafi zgubić drugą sesję.** Przy oględzinach 38b karta `[::1]:5173`
  raz wróciła jako **MG**, choć logowała się jako `Tester`; ponowne wejście na `/join/tester-dev`
  naprawiło to i po `location.reload()` sesja już się trzymała. Zanim uznasz to za błąd
  w serwerze, sprawdź `fetch('/api/auth/me')` **w obu kartach** — cookie jest `httpOnly`, więc
  z `document.cookie` niczego nie widać, a nagłówek strony jest jedynym widocznym objawem.

- **`<input type="file">` DA SIĘ obsłużyć automatem** — inaczej niż checkbox Reacta z pułapki
  niżej. `new DataTransfer()`, `dt.items.add(new File([tekst], 'plik.json'))`, `input.files =
dt.files`, `input.dispatchEvent(new Event('change', { bubbles: true }))` — React czyta
  `event.target.files` i widzi prawdziwy plik. Tak poszły oględziny importu 05.09.

- **Rozszerzenie przeglądarki zaciemnia niektóre wyniki `javascript_tool`** — pola o nazwach
  wyglądających na wrażliwe wracają jako `[BLOCKED: Sensitive key]`, a długie ciągi base64 jako
  `[BLOCKED: Base64 encoded data]`. To nie jest błąd aplikacji: `tokens` w liczniku manifestu
  i `content-disposition` wracały tak przy poprawnej odpowiedzi. Sprawdzaj takie rzeczy testem
  po stronie serwera, nie przez konsolę karty.

- **Bronią obszarową celuje się w PUSTE pole, a klik w żeton tylko go zaznacza.** 04.09 poszły
  cztery próby strzału z granatnika, zanim coś poleciało: klik w figurę przestawiał zaznaczenie
  na **nią** (u MG wolno zaznaczyć każdego), przez co uzbrojona broń schodziła z ręki, a kolejny
  klik w mapę stawał się **rozkazem marszu tej figury** — tak przy okazji przespacerował się
  żeton testowy. Kolejność, która działa: zaznacz **swoją** figurę → uzbrój broń ze slotu
  (zdanie „W ręku …" w panelu) → kliknij **pole** obok celu (pojawia się kwadrat obszaru
  i pasek „→ wybrane pole · N m · PT X") → dopiero wtedy **„Potrząśnij i strzel"**, bo strzał
  puszcza kubek, a nie drugi klik w mapę. Granat i tak odchyla się o co najmniej 2 m, więc
  aby złapać kogoś testem, celuj w pole **pod nim**, nie o dwa dalej.

- **Efektu mapy nie zobaczysz zrzutem ekranu — ale da się go zatrzymać.** Wybuch trwa 1,1 s,
  chmura 1,6 s, a runda `screenshot` przez CDP bywa dłuższa: 04.09 poszły trzy granaty i za
  każdym razem zrzut łapał albo puste pole, albo pojedynczą jasną plamkę, z której nic nie
  wynikało. **Rozpoznanie:** efekt jest w `MapFxLayer.items`, a na obrazku go nie ma.
  **Obejście, które zadziałało:** na czas oględzin podnieś `EXPLOSION_MS`/`CLOUD_MS` do kilku
  sekund, wystaw warstwę na `window` (`__fx = this` w `play`), a potem wywołaj efekt **wprost** —
  `fx.play([{ kind: 'blast', at: { x, y }, sideM: 10 }])` — i **zamroź** go, podstawiając
  wybranej pozycji `life = 400000` i `age = life * klatka / liczbaKlatek`. Wtedy zrzut łapie
  dowolną klatkę, także tę z ognistą kulą (u wybuchu dopiero ~40 z 64; pierwsze dwadzieścia to
  białe iskry, po których łatwo uznać arkusz za zepsuty). `fx.play` niczego nie wysyła na
  serwer, więc stan stołu zostaje nietknięty. **Sam ślad klatek** (`sprite.texture.frame`)
  wystarcza za dowód, że arkusz jest pocięty dobrze — prostokąty idą wiersz po wierszu i nigdy
  nie wychodzą poza arkusz.

- **`window.confirm` nie zawsze jest tam, gdzie go szukasz.** 04.09 kosz „usuń wszystkie osłony"
  nie zapytał o nic — i to **nie jest** błąd: `confirmDestructive` pyta tylko poza poligonem,
  a hurtowe kasowanie warstwy wraca `Ctrl+Z` (wszystkie sześć zdarzeń `*:clear` woła
  `rememberDeletion`). Zanim uznasz brak pytania za usterkę, sprawdź **obie** rzeczy: flagę
  `Campaign.sandbox` i to, czy zdarzenie odkłada wpis w buforze cofania.

- **Slot paska akcji trzeba klikać po współrzędnych z DOM-u, nie z pamięci.** Lista przesuwa się
  o cały wiersz, gdy figura zyska albo straci chip stanu (04.09: dołożenie statusu
  „Nieprzytomny" zsunęło broń o ~30 px i klik „Granatnik podwieszany" trafił w
  „Bagnet", a po przeładowaniu magazynka — w „Arasaka Minami 10"). Objaw jest cichy:
  uzbraja się **inna** broń i dopiero karta na czacie mówi, czym się strzelało. Przed klikiem
  czytaj `document.querySelectorAll('button.hud-slot')` i przeliczaj `getBoundingClientRect`
  na skalę zrzutu; po kliku sprawdzaj zdanie „W ręku: …" pod paskiem.

- **`.click()` na slocie paska nie uzbraja celownika, a klik w mapę staje się wtedy rozkazem
  marszu.** 04.09 wysłało to avatar9 przez pół sceny zamiast wystrzelić granat. Uzbrajaj slot
  prawdziwym kliknięciem (CDP), a **przed** kliknięciem w mapę potwierdź zdanie „W ręku: …" —
  bez uzbrojenia klik w puste pole zawsze znaczy „idź tam".

- **`window.confirm` zawiesza kartę pod CDP, jeśli nie przechwycisz go PRZED kliknięciem.**
  `confirmDestructive` (`client/src/confirm.ts`) to natywny `window.confirm`, a natywny modal
  blokuje `Input.dispatchMouseEvent`, `Input.dispatchKeyEvent` **i** wstrzykiwanie skryptów —
  czyli wszystkie drogi, którymi dałoby się go zamknąć. Karta zostaje martwa; jedynym wyjściem
  jest ją **zamknąć i otworzyć na nowo**. **Obejście, zawsze przed klikaniem czegokolwiek
  niszczącego:** `javascript_tool` z `window.confirm = () => true`. Uwaga: przeładowanie strony
  zdejmuje tę łatę, więc po każdym reloadzie trzeba ją założyć od nowa. Sprostowanie do
  wcześniejszego wpisu, który mówił, że confirm „nie zawiesza sterowania" — nie zawiesza tylko
  wtedy, gdy jest przechwycony.

- **Zrzut ekranu ma inną skalę niż `clientX`/`clientY`.** Współrzędne z narzędzia zrzutu trzeba
  przemnożyć przez `window.innerWidth / szerokość zrzutu` (03.09: 1964/1394 ≈ 1,41), zanim
  wsadzi się je w syntetyczne zdarzenie wskaźnika. Bez tego klik ląduje w zupełnie innym
  miejscu mapy i wygląda jak „Pixi nie odbiera zdarzeń".

- **Menu kontekstowe tokenu otwiera `pointerdown` z `button === 2`**, a `right_click` z CDP go
  nie dowozi (`wireInteraction` w `MapRenderer.ts`). Obejście, sprawdzone 03.09: dispatch
  `new PointerEvent('pointerdown', {button: 2, buttons: 2, …})` na `<canvas>` po przeliczeniu
  współrzędnych (wpis wyżej). Potem `find` znajduje pozycje menu normalnie.

- **`form_input` na checkboksie Reacta zmienia DOM, ale nie stan komponentu.** Pole zaznacza
  się wizualnie, a warunkowa część formularza się nie pojawia — i kolejny prawdziwy klik
  **odznacza** je z powrotem, bo React nadal uważa, że jest wyłączone. Do kontrolowanych pól
  React używaj `left_click`, nie `form_input`.

- **Efektu mapy NIE DA SIĘ złapać zrzutem ekranu, a spowolnienie `performance.now` nic nie
  daje** (ustalone 20.08 przy 27i, kosztowało pół godziny). Efekt trwa 300–800 ms, a runda
  narzędzia zrzutu to około półtorej sekundy — więc widać zawsze pustą mapę i pierwsza myśl
  („nie działa") jest fałszywa. `performance.now` nie spowalnia Pixi: `Ticker` v8 bierze czas
  ze **znacznika `requestAnimationFrame`**, nie z zegara. **Obejście:** opakuj `rAF` tak, żeby
  przeliczał znacznik (`cb(virt)` zamiast `cb(t)`), i ustaw współczynnik dopiero po pojawieniu
  się karty na czacie — wcześniej spowolniłbyś też animację kości. **Rozpoznanie, zanim
  zaczniesz szukać błędu w rysowaniu:** `graphics.getBounds()` w tym samym miejscu, w którym
  rysujesz — niepuste bounds w sensownych współrzędnych ekranu znaczą, że Pixi ma geometrię
  i problem jest wyłącznie w tym, kiedy patrzysz.

- **Klik w puste pole mapy przy zaznaczonej figurze to rozkaz marszu** — i tak właśnie 20.08
  Tony przeszedł pół Strzelnicy, bo zrzut ekranu miał inną skalę niż okno i kliknięcie „w żeton"
  minęło go o kilkadziesiąt pikseli. Przy automatyzacji celuj **zdarzeniami wskaźnika
  z policzonymi współrzędnymi CSS** (`canvas.dispatchEvent(new PointerEvent(...))`), nie
  współrzędnymi ze zrzutu — patrz wpis o wycinku okna niżej.

- **Sesję gracza i sesję MG DA się mieć naraz w jednym oknie Chrome** (ustalone 09.08 przy 24b,
  obala wpis „sesja gracza w tej samej przeglądarce wylogowuje MG"): ciasteczko jest kluczowane
  **hostem**, a `localhost` i `[::1]` to dwa różne hosty, mimo że Vite słucha na obu. MG zostaje na
  `http://localhost:5173/`, gracz wchodzi na **`http://[::1]:5173/join/<token>`** i wybiera swoje
  imię (bez hasła). Obie sesje widzą się nawzajem na liście obecności i dostają rozgłoszenia na
  żywo. **`127.0.0.1` nie zadziała** — dev-serwer Vite nasłuchuje pod `localhost`, czyli na
  pętli IPv6. Link zaproszenia bierze się z „Panel MG"; token jest wielorazowy, więc powrót tego
  samego gracza nie tworzy nowego konta. To znosi powód, dla którego kilkanaście pozycji w `zaleglosci.md`
  ma dopisek „wymaga drugiego profilu Chrome". **Trzeci gracz naraz wymagałby trzeciego hosta**
  (dwa konta graczy w kampanii to Tony i avatar9) — do sprawdzenia, czy Vite wpuści np.
  `localhost.` z kropką na końcu albo `[0:0:0:0:0:0:0:1]`; alternatywnie przelogowanie się
  w karcie `[::1]` na drugie imię.

- **Zrzut ekranu bywa WYCINKIEM okna, a nie całym oknem — i wtedy klikanie po współrzędnych
  ze zrzutu chybia** (ustalone 11.08, kosztowało pół godziny). Narzędzie przelicza podane
  współrzędne przez `innerWidth / szerokość_zrzutu`, ale gdy okno jest szersze niż ekran, zrzut
  pokazuje tylko lewy-górny kawałek strony — obie skale się rozjeżdżają i klik ląduje kilkadziesiąt
  pikseli obok. Objaw jest mylący: element **widać** na zrzucie, a klik w niego nic nie robi.
  **Rozpoznanie:** weź dowolny przycisk, porównaj `getBoundingClientRect()` z jego pozycją na
  zrzucie; jeśli iloraz nie równa się `innerWidth / szerokość_zrzutu`, zrzut jest przycięty.
  **Obejście:** klikaj **referencjami** z `find` / `read_page` (nie współrzędnymi), a dla warstwy
  Pixi licz `arg = CSS / (innerWidth / szerokość_zrzutu)`. `resize_window` na zmaksymalizowanym
  oknie nic nie daje.

- **Wielokrokowe przeciągnięcie tokenu DA się wysłać automatem** (11.08): `pointerdown` na
  `canvas`, seria `pointermove` na `window` **i** `canvas` z przerwami ~70 ms, na końcu
  `pointerup` — tak jak przy kubku w 23c. `left_click_drag` z CDP też dochodzi i też kończy się
  odmową serwera, więc obie drogi nadają się do testów budżetu ruchu.

- **Vite potrafi zapamiętać PUSTY moduł, jeśli plik był przepisywany w trakcie** (14.08).
  Skrypt, który czyta plik, przetwarza i zapisuje z powrotem, ma między tymi krokami moment,
  w którym plik na dysku jest pusty — a jeśli Vite akurat wtedy go przeczyta, zapamięta pustkę
  **razem ze stemplem `?t=`** i będzie ją serwować także po przeładowaniu strony. Objaw jest
  mylący: `tsc --noEmit` przechodzi, a przeglądarka mówi
  „does not provide an export named 'X'". **Rozpoznanie:** `curl http://localhost:5173/<ścieżka>`
  — pusty moduł ma w mapie źródeł `sourcesContent: [""]`. **Obejście:** przepisz plik jeszcze
  raz (samo dotknięcie mtime wystarczy); przeładowanie strony **nie** pomaga.

- **HMR przy działającym Pixi wywala stronę** wyjątkiem `Ticker.remove` — po edycji plików klienta przeładuj kartę.

- **`window.confirm` w panelach zawiesza sterowanie przeglądarką przez CDP** — omijaj przyciski „usuń" przy automatyzacji albo poproś użytkownika o kliknięcie.

- **Menu kontekstowe tokenu DA się otworzyć automatem** (ustalone 09.08 przy 23c, koryguje
  wpis niżej): `right_click` z CDP go nie dowozi, ale ręcznie wysłany
  `canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 2, clientX, clientY }))`
  owszem — Pixi v8 słucha zdarzeń **wskaźnika**, nie mysich. Współrzędne trzeba przeliczyć ze
  zrzutu na CSS-owe (`window.innerWidth / szerokość_zrzutu`). Tą drogą przeszły w 23c: menu,
  launcher Konfrontacji i potrząśnięcie kubkiem (`pointerdown` na `.dice-cup`, seria
  `pointermove` na `window`, `pointerup`). **Uwaga:** menu jest wystawiane **tylko MG**
  (`MapArea.tsx:455`), więc u gracza nie otworzy się niezależnie od sposobu klikania.

- ~~**Do warstwy Pixi nie dociera przez CDP ŻADNE zdarzenie wskaźnika na tokenie**~~ — **to była błędna diagnoza, obalona 31.07 w 16e.** Kliknięcia docierały zawsze; nie działał **hit-test**, i to dla wszystkich, także dla prawdziwej myszy. Pełnoekranowe warstwy przykrywające (płachta widoczności z 18a u gracza, mgła z 17a u każdego, kto ją ma włączoną) leżą **nad** warstwą tokenów i domyślnie biorą udział w trafianiu, więc Pixi zwracał jako cel `Viewport` zamiast `TokenNode`. Naprawa: `eventMode = 'none'` na warstwach czysto malarskich (`init` w `MapRenderer`). **Skutek dla planowania sesji:** oględziny rzeczy wymagających kliknięcia w token są znowu wykonalne automatem — sprawdzone w 16e (zaznaczenie, podgląd trasy, odmowa). Zanim zapiszesz „CDP tego nie dowozi", wypisz w logu `event.event.target` z `viewport.on('clicked')`: jeśli to `Viewport`, a nie `TokenNode`, problem jest w hit-teście, nie w automatyzacji.

- **Haseł w formularze nie wpisuję** — sesję MG zakłada użytkownik, sesję gracza zakłada się kluczem z panelu MG (bez hasła).

- **Edycja kodu w trakcie oględzin przeładowuje kartę, a wtedy pisanie staje się skrótami klawiszowymi.** Kosztowało to 08.08 przypadkowe przeskoczenie tury w żywej kampanii: po edycie `realtime/rules.ts` `tsx watch` zrestartował serwer, Vite przeładował stronę, ognisko wyszło z pola tekstowego — i wpisywane zdanie poleciało do globalnych skrótów mapy (**każde „e" to „koniec tury"**, litery uzbrajają narzędzia). **Zasada:** albo kończysz edycje przed wejściem do przeglądarki, albo przed każdym pisaniem robisz zrzut i sprawdzasz, że kursor stoi w polu. Po wpadce `Esc` rozbraja uzbrojone narzędzie.

- **Rozkaz marszu wysyłany automatem wymaga ustalonego hovera.** Trasa liczy się na
  `pointermove`, a nie w chwili kliknięcia: `pointerdown` wysłany w tej samej porcji zdarzeń co
  `pointermove` trafia w pustkę i figura przesuwa się o ułamek metra albo wcale. Wygląda to
  łudząco jak zepsuty ruch — 22.08 kosztowało pół godziny szukania błędu, którego nie było.
  **Obejście:** `pointermove` → pauza ~300 ms → drugi `pointermove` o parę pikseli → dopiero
  `pointerdown`/`pointerup`. Ta sama pauza jest potrzebna przed czytaniem podglądu trasy ze zrzutu.

- **Skrótów klawiszowych mapy nie uruchomisz syntetycznym `KeyboardEvent`.** `new KeyboardEvent
('keydown', { key: 'Escape' })` wysłany na `document` albo `window` **nie** przerwał marszu,
  choć listener wisi na `window` i czyta `event.key`. Prawdziwe naciśnięcie klawisza przez CDP
  (`computer` → `key: Escape`) zadziałało od razu — i dopiero ono pokazało, że przerwany marsz
  księguje przebyty odcinek, a nie całą trasę. **Wniosek:** klawisze automatyzuj przez CDP,
  zdarzenia wskaźnika możesz nadal wysyłać z konsoli.

- **Narzędzi mapy nie da się obsłużyć syntetycznym zdarzeniem wskaźnika, a menu kontekstowego —
  współrzędnymi ze zrzutu.** Dwie osobne pułapki, które razem zjadły pół sesji 23.08.
  **Ściana:** `left_click_drag` przez CDP i własna seria `pointerdown`/`pointermove`/`pointerup`
  **rysują podgląd**, ale ściana nigdy nie trafia na serwer — znika, gdy narzędzie się wyłącza.
  Sprawdzenie jest proste: włącz narzędzie ścian jeszcze raz i zobacz, czy warstwa coś pokazuje;
  pewniejsze — policz `wall` w bazie. Ściany i żetony do oględzin szybciej wstawić wprost przez
  Prismę (`packages/server`, `createPrisma(process.env.DATABASE_URL)`) i tak samo skasować.
  **Menu kontekstowe:** działa, ale `clientX/clientY` muszą być w **pikselach CSS**, a zrzut ekranu
  bywa przeskalowany (23.08: ≈0,8). Przelicznik bierze się z `canvas.getBoundingClientRect().width`
  podzielonej przez szerokość płótna na zrzucie. Bez tego zdarzenie ląduje obok żetonu i nic się
  nie dzieje — bez błędu w konsoli.
  **Ostrzeżenie na przyszłość:** z płótna Pixi **nie odczytasz pikseli** (`drawImage` z canvasu
  WebGL daje przezroczysty obraz), więc powiększenia fragmentu mapy nie da się zrobić z poziomu
  strony — zostaje `zoom` narzędzia albo przybliżenie samej mapy kółkiem.

- **Rzut z karty postaci idzie dwoma kliknięciami: `Shift`+klik ładuje kubek, klik w kubek
  rzuca.** Zrzut zaraz po pierwszym kliknięciu pokazuje pusty stół i wygląda jak awaria.
  Kości leżą 3,2 s po ustaniu (`FADE_OUT_DELAY_MS`), a **złota kość dorzutu krytyka spada
  dopiero 550 ms po pierwszej fali** (`EXTRA_DIE_DELAY_MS`) — zrzut po 2 s łapie moment przed
  nią, dopiero ~3 s pokazuje obie. Stół kości to pełnoekranowa nakładka **pod** oknem karty
  postaci: przy otwartej karcie kości są niewidoczne, więc do łapania rzutów kartę trzeba
  zamknąć (kubek zostaje naładowany).

- **Zrzut ekranu z przeglądarki bywa renderowany ciemniej, niż mówi DOM** (23.08). Przy oględzinach
  27k `getComputedStyle(document.body).backgroundColor` dawało jasny motyw dzienny, a zrzut
  pokazywał ciemny interfejs — to Chrome nakłada własne przyciemnienie na obraz, nie strona.
  **Nie zgaduj motywu ze zrzutu:** czytaj `document.documentElement.dataset.theme` i tokeny
  z `getComputedStyle`, inaczej szukasz błędu kontrastu w złym motywie.

- **Automat CDP _jednak_ buduje scenę: ściany, lampy, osłony, strefy i pinezki** (23.08,
  koryguje notatkę z sesji o pasy zasięgu, która mówiła „nie da się"). Narzędzie `computer`
  wysyła zdarzenia przez CDP, a nie syntetyczne `PointerEvent`, i Pixi je przyjmuje: w tej sesji
  automatem postawiono lampę, przeciągnięto osłonę i strefę, wbito pinezkę, rozpoczęto i
  porzucono łańcuch ścian oraz zaznaczono i skasowano po kolei siedem rodzajów obiektów.
  Nietrafiona pozostaje tylko wcześniejsza obserwacja o `dispatchEvent` z ręki. Praktycznie:
  klikaj współrzędnymi ekranu z pełnego zrzutu, sprawdzaj skutek `zoom`-em na wycinku, a stan
  narzędzia czytaj z DOM — `document.querySelector('.map-canvas-host canvas').style.cursor`
  mówi, czy kursor stoi nad obiektem, który da się złapać.

- **Sprawdź, czy strona naprawdę się przeładowała, zanim uznasz poprawkę za nieskuteczną**
  (24.08). Przy oględzinach 27l ta sama poprawka wyglądała raz na działającą, raz nie — HMR
  podmienił moduł, ale globalny `keydown` został zarejestrowany przez stary efekt. Kosztowało to
  kilka minut szukania błędu, którego już nie było. Zgodne z wpisem o HMR przy Pixi wyżej:
  **po edycji klienta przeładuj kartę i dopiero wtedy powtarzaj test.**

- **Zanim zaczniesz szukać, dlaczego odmowa z serwera „nie chce paść" — sprawdź, czy klient
  w ogóle da ci ją wywołać** (27.08, pakiet Sieci). `NET_NODE_USED` figurowało w zaległościach
  jako „nie da się, bo na Poligonie nie ma rund". Rundy zrobiono, walkę rozkręcono — i przycisk
  i tak nie chciał zadziałać, bo `NetRunWindow` **sam wyszarza wszystkie przyciski urządzeń**
  (`spent = floor.nodeUsed`) i zamiast odmowy pisze chip „węzeł użyty w tej Turze". Ta sama
  rodzina co `NET_DEVICE_OFF` i `FORBIDDEN` przy cudzym rysunku: **odmowa istnieje dla klienta,
  który by o tym nie wiedział, a UI nie pozwala do niej dojść.** Zanim zbudujesz pod taką
  odmowę scenę, przeczytaj warunek `disabled` przycisku, który miałby ją wywołać.

- **Spowolnione `rAF` rozdmuchuje chmurę gazu na cały ekran — to artefakt oględzin, nie błąd**
  (28.08, przy odklikiwaniu 27i). Sprite chmury rośnie **na klatkę**, nie na milisekundę
  (`sprite.scale.set(scale * 1.0015, …)` w `drawSprite`), więc przy normalnym tempie urośnie o 15%
  w ciągu życia efektu, a przy współczynniku 0,03 — **sto dwadzieścia razy** i zieleń zalewa całe
  płótno. Przy takim widoku nie zgłaszaj błędu w rozmiarze obszaru: sprawdź to samo przy 0,3
  (chmura ma wtedy jakieś 10×10 m, tyle co pole wybuchu z karty). Uczciwe zastrzeżenie: rosnięcie
  na klatkę **jest** zależnością od odświeżania ekranu — na 144 Hz chmura urośnie o 41% zamiast
  o 15% — ale przy stole nikt tego nie nazwie.

- **Atak obszarowy z mapy to trzy kliknięcia, nie jedno** (28.08). Kolejność, bez której klik
  w podłogę jest **rozkazem marszu**: (1) uzbrój slot broni w panelu postaci (`W ręku: …` musi
  wymieniać tę broń — po zmianie tury slot się rozbraja i wraca slot 1), (2) klik w pole mapy —
  to **ładuje kubek**, nie strzela (`throwAtPoint` wymaga `weapon.tokenId === selectedTokenId`),
  (3) klik w **kubek** w lewym dolnym rogu — dopiero on rzuca. Objaw pomylenia kroków: figura
  spokojnie przechodzi pół sceny, a magazynek stoi.

- **Kliknięcia narzędzia `computer` idą we współrzędnych ZRZUTU, nie CSS** (28.08, kosztowało
  dwa kliknięcia w próżnię). Wpis obok mówi o **syntetycznych zdarzeniach wskaźnika** — te biorą
  CSS. Narzędzie `computer` (CDP) bierze piksele zrzutu, a zrzut bywa przeskalowany: przy oknie
  1697 px CSS i `devicePixelRatio` 1,5 zrzut ma 1350 px, czyli skala **0,795**. Przelicz
  `getBoundingClientRect()` przez `szerokość_zrzutu / window.innerWidth` albo klikaj `ref`-em
  z `find`. Klik poza zakresem zrzutu po prostu nic nie robi — bez błędu.

- **Nie klikaj „✕" hurtem w oknie karty postaci** (28.08, skasowany świeżo kupiony wiersz
  sprzętu). Skrypt zamykający okno szukał `button` o treści „✕" wewnątrz `[class*=sheet]` — a taki
  sam znak noszą **kosze przy wierszach** broni, pancerza, sprzętu i cyborgizacji, więc
  `querySelectorAll(...).forEach(click)` skasował wiersz zamiast zamknąć okno. Okno zamyka
  przycisk w **nagłówku** (`.sheet-window header ✕`); wiersze mają swój ✕ w ostatniej kolumnie.
  Kasowanie wiersza karty **nie pyta o potwierdzenie**.

- **Wąskie okno symuluje się `document.documentElement.style.width = '900px'`**, gdy
  `resize_window` nic nie robi (okno zmaksymalizowane — `outerWidth` wraca wtedy jako bzdura).
  Układ przelicza się naprawdę i widać nachodzenie elementów. Dwa zastrzeżenia: **`@media` czyta
  viewport**, nie tę szerokość (reguł progowych tym nie sprawdzisz), a Pixi dostaje kaskadę
  `resize` i potrafi zamulić kartę tak, że `Runtime.evaluate` wraca timeoutem — **zrzut ekranu
  nadal działa**, a przywrócenie (`style.cssText = ''`) przechodzi normalnie. Do samego układu
  paska wystarczy klon węzła w kontenerze o stałej szerokości — bez ruszania płótna.

**Uzbrojona broń zjada rozkaz marszu.** Klik w podłoże przy broni „w ręku" jest strzałem
w wybrane pole, nie marszem — pasek mówi to małą linijką „W ręku: … — kliknij cel na mapie",
której łatwo nie zauważyć. Objaw: figura stoi, a na czacie ląduje „Marsz przerwany.". Zanim
uznasz, że rozkaz nie dochodzi, rozbrój broń (drugi klik w slot) i powtórz.

**Marsz automatem wymaga serii ruchów, nie jednego.** Jeden `pointermove` przed klikiem bywa za
mało — trasa liczy się przyrostowo, więc ustal hover **kilkoma** ruchami z przerwami ~180 ms po
linii, którą figura ma iść, i dopiero wtedy klikaj. Rozszerza wcześniejszą pułapkę o „ustalonym
hoverze": chodzi o serię, a nie o pojedyncze zdarzenie.

**`window.confirm` da się podmienić i wtedy nic nie wisi** — `window.confirm = m => { zapisz(m);
return false; }` pozwala **przeczytać treść pytania** bez klikania w natywne okno i bez ryzyka,
że coś naprawdę zniknie. Tak sprawdzono obie gałęzie `confirmDestructive` 28.08. Podmiana ginie
przy przeładowaniu karty — po każdym `location.reload()` trzeba ją założyć od nowa.

**Kartę do oględzin da się przygotować w bazie, bez logowania na MG.** `node --input-type=module`
z `node:sqlite` (`DatabaseSync('packages/server/dev.db')`) czyta i zapisuje kolumnę `Character.data`
jako JSON; działający `pnpm dev` nie przeszkadza, wystarczy przeładować kartę przeglądarki, żeby
`state:sync` przyniósł nowy stan. `better-sqlite3` **nie jest** w `node_modules` na poziomie
repozytorium — jedzie jako zależność adaptera Prismy i `require` go nie znajdzie.

**Kubkiem kości nie potrząśniesz z JavaScriptu.** `cup.click()` nic nie robi, a ręcznie złożona
seria `pointerdown` → `pointermove` → `pointerup` na `.dice-cup` też nie — kubek zostaje na
ekranie, rzut nie leci. Klikać trzeba narzędziem `computer`, **we współrzędnych zrzutu**: przy
oknie 1766 px CSS i zrzucie 1373 px skala to ≈0,777, więc `getBoundingClientRect()` trzeba przez
nią przemnożyć (`x * 1373 / window.innerWidth`). Guziki na kartach czatu i w formularzach reagują
na `click()` normalnie — to sam kubek jest wyjątkiem.

- **Klik w żeton, którym MG może sterować, ZAZNACZA go zamiast celować — celuje dopiero
  Alt+klik** (01.09, kosztowało kilka „ataków", które okazały się zmianą zaznaczenia).
  `aimTargetFor` w `MapRenderer` zwraca `null`, gdy cel jest sterowalny (`movableTokens`)
  i nie trzymasz Alt — a **MG steruje wszystkim**, więc przy koncie MG dotyczy to każdego żetonu
  na scenie. Podpowiedź pod paskiem mówi to wprost („Alt+klik celuje we własny token"), tylko
  łatwo ją przeoczyć. **Rozpoznanie:** po kliknięciu lewy pasek pokazuje **cel**, a nie
  strzelca, i nie ma banera „Potrząśnij i strzel".
  **Drugie dno:** `modifiers: "alt"` w narzędziu `computer` **bywa niedostarczane** — kilka
  ataków z rzędu przeszło, a potem te same kroki zaczęły tylko zaznaczać cel.
  **Obejście, które działa zawsze:** uzbrój atak **z karty postaci** (guzik „ATAK" w wierszu
  broni). Wtedy `this.targeting` jest prawdą, a `aimTargetFor` zwraca cel **przed** sprawdzeniem
  Alt — zwykły klik wystarczy. Kartę można po uzbrojeniu zamknąć, celowanie to przeżywa.

- **Dymu nie da się postawić narzędziem — stawia go wyłącznie wystrzelony nabój** (01.09).
  W panelu osłon jest tylko „Rozwiej cały dym"; komentarz w `MapTools.tsx` mówi to wprost
  („nobody _places_ a cloud — a round does"). Żeby mieć chmurę do oględzin, trzeba broni
  strzelającej wzorcem `grenade` (Granatnik, Granat) i wpisu **„Amunicja dymna"** wybranego
  listą naboju przy wierszu broni. **Broń podwieszana tej listy nie ma** (patrz `zaleglosci.md`),
  więc granatnik pod karabinem do dymu nie posłuży — dopisz osobny wiersz „Granatnik"
  z katalogu.

**Kafla „Fumble zignorowany" nie doczekasz się rzutami — wymuś kostkę (04.09).**
Naturalna 1 na 1k10 to średnio dziesięć strzałów, a każdy z nich to uzbrojenie slotu, Alt+klik
w cel i potrząśnięcie kubkiem. Taniej: dopisz na minutę `if (sides === 10) return 1;` na
początku zwracanej funkcji w `realtime/dice-rng.ts` (obrażenia lecą k6, więc zostają losowe),
obejrzyj kafel i **przywróć plik z kopii**, sprawdzając `git diff`. Ta sama sztuczka pokaże
Krytyka, Fumble i każdy próg, którego nie da się doczekać.

**Ramka i ping działają z syntetycznych zdarzeń wskaźnika, `Ctrl+A` nie (05.09).**
`Shift`+przeciągnięcie (ramka), Alt+klik (ping) i Alt+przeciągnięcie (kopia) odpalają się
z serii `PointerEvent` wysłanej na `canvas` we **współrzędnych CSS** — tak samo jak zwykłe
przeciągnięcie żetonu. Skróty klawiszowe **nie**: `window.dispatchEvent(new KeyboardEvent(…))`
z `ctrlKey` przechodzi bez echa (potwierdzenie pułapki z `Esc`), a `Ctrl+A` trzeba wysłać przez
CDP — `computer` z `key: "ctrl+a"`, **po** kliknięciu w mapę, żeby ognisko było w oknie.

**Ping gaśnie po 2,2 s, czyli szybciej, niż wraca zrzut ekranu (05.09).**
Pojedynczy ping wysłany w jednym wywołaniu i oglądany w następnym zawsze będzie już wygasły —
wygląda to jak „ping nie działa". Najtaniej: `setInterval` pingujący co 500 ms przez kilkanaście
sekund, z `clearInterval` w osobnym wywołaniu. Ta sama sztuczka nadaje się do każdego efektu
krótszego niż jedna wymiana z przeglądarką.

**Po przeładowaniu karty mapa wraca do `fitScene`, więc współrzędne z poprzedniego zrzutu
kłamią (05.09).** Ramka rozciągnięta po starych liczbach łapie zero figur i wygląda jak zepsuty
gest — a złapała puste pole. Po każdym `location.reload()` (i po każdej panoramie) rób nowy
zrzut, zanim policzysz współrzędne; skalę czytaj `window.innerWidth / szerokość zrzutu`.

**Kopia figury po Alt+przeciągnięciu nie ma jak pokazać swojej nazwy na mapie** — etykieta pod
żetonem jest przy zoomie stołu nieczytelna. Nazwę sprawdza się **menu kontekstowym**:
`PointerEvent` z `button: 2` we współrzędnych CSS, a potem `.context-menu-title`.

**`pnpm dev` z `&` w tle faktycznie startuje serwery, choć zadanie kończy się od razu**
— następne uruchomienie pada wtedy na `EADDRINUSE 3001` i „Port 5173 is already in use", co
wygląda jak zawieszony poprzedni proces. Zanim zaczniesz zabijać porty, sprawdź, czy aplikacja
po prostu nie działa: `curl -o /dev/null -w "%{http_code}" http://localhost:5173`.

**Tekst z liczbą sprawdzaj na liczbie większej niż jeden** — cały etap 37 przeszedł oględziny
z „jedną dobą" i dopiero trzy skoki pod rząd pokazały „minęły 30 doby". Każda etykieta zależna
od liczby ma trzy przypadki po polsku (1, 2–4, 5+ i osobno 12–14), a zrzut z jedynką nie mówi
o nich nic.

**Dwie sesje obok siebie to jedyny sposób na tę klasę błędów** — MG na `localhost:5173`, gracz
na `[::1]:5173`. Zrzut ekranu wystarczy do paska, ale feed czatu czytaj z DOM-u
(`[...document.querySelectorAll('.chat-time')].map(n => n.innerText)`): panel bywa przewinięty
w górę i „nie ma karty" na zrzucie znaczy najczęściej „nie doskrolowano".

- **Ścieżka z przycisku i ścieżka ze skrótu to DWIE ścieżki (06.09).** Prośbę o Test otwiera
  Alt+klik w wiersz karty **i** przycisk w oknie rzutu; oględziny etapu 40 przeszły pierwszą
  i minęły drugą, w której siedziała usterka. Automatyka przeglądarki gubi modyfikator `alt`
  (pułapka wyżej), więc naturalne jest sprawdzenie tej ścieżki, którą da się kliknąć — i to
  właśnie ta druga zostaje niesprawdzona. Przy funkcji z dwoma wejściami sprawdź **oba**.

- **Karta w tle dławi `setInterval` i `requestAnimationFrame` do ~1 Hz (06.09).** Pomiar
  przytrzymania guzika przez automatykę przeglądarki dał jeden krok zamiast siedmiu i wyglądał
  na błąd w kodzie powtarzania. **Rozpoznanie:** pętla `requestAnimationFrame` przez sekundę
  nie zwraca **ani jednej** klatki, a `setInterval(…, 100)` odpala dwa razy na sekundę.
  **Obejście:** nie mierz w tle nic, co zależy od zegara — sprawdź samą logikę testem
  jednostkowym albo powtórz kliknięcie ręcznie (`pointerdown`/`pointerup` w pętli z `await`),
  co przechodzi normalnie.


## testy — Testy i środowisko dev

- **Pomocnik testowy, który przy odczycie odpina słuchacza, daje test przechodzący LOSOWO** — `collectMessages` gaszony w pętli „losuj do skutku”; objaw wygląda na wyścig w serwerze, a siedzi w harnessie. Odczyt = żywa tablica, odpięcie = osobny krok.
- **`vitest` nie sprawdza typów** — `rof: 2` (a to napis) przeszedł 38 testów i padł dopiero na `tsc --noEmit`. Ten krok jest osobny, nie formalnością po testach.
- **`socket.once('chat:message')` łapie kartę POPRZEDNIEGO testu**, gdy tamten jej nie odebrał — tak migotał `gametime.test.ts` („Minęło dziesięć minut" zamiast „Minęła doba"). Test odkładający kartę ma ją odebrać, choćby jej nie sprawdzał.
- **Testy nie widzą ściętego napisu** — trzy z sześciu błędów 30a–30d to szerokość elementu i treść etykiety; przy panelu w wąskiej kolumnie mierz `getBoundingClientRect().width` przeciw `scrollWidth`, zanim uznasz układ za dobry.
- **Nowy plik testów dymnych musi dostać `}, 60_000);` przy `beforeAll`** — hak robi `prisma migrate deploy` i podnosi Fastify, a pod pełną równoległością nie mieści się w domyślnych 10 s; objaw to `FAIL` całego **pliku**, nie testu.
- **`waitFor(socket, 'chat:message')` bierze pierwszą wiadomość, jaka przyjdzie** — publiczny rzut dociera też do MG, więc następny test łapie kartę poprzedniego. Czekaj po treści (`waitForRoll`), nie „na pierwszą".
- **Test mierzący spadek PW musi sam ustawić PW na starcie** — przy zerze serwer odmawia graczowi ruchu, więc spadek wychodzi 0 → 0 i pada asercja, nie stan (`healUp()` w `zones.test.ts`).
- **Czerwony pojedynczy plik w pełnym przebiegu serwera to najpierw podejrzenie wyścigu.** Zestaw pada mniej więcej co drugi raz i za każdym razem gdzie indziej — także na czystym HEAD; powtórz plik osobno (`npx vitest run src/<plik>`), zanim zaczniesz szukać błędu w swojej zmianie.
- **Migotanie testu: sprawdź, czy komunikat mówi o czasie, czy o asercji** — dwa razy „ciasny limit czasu" okazał się losowością w samym teście.
- **`tsc --noEmit` łapie błędy w testach, których vitest nie widzi** — `damage.test.ts` używał `DamageLogEntry` bez importu przez nieznaną liczbę sesji.
- **`walls.test.ts` i `realtime.test.ts` też migoczą przy pełnym `vitest run`** (dołączają do `netdevices` i `zones`) — powtórz przebieg, zanim uznasz to za regres. Od 30.08 dołączyły `roles30d.test.ts` i `specialties.test.ts`; w izolacji przechodzą. Jeden czerwony przebieg z 54 plików nie jest dowodem.
- **W trwającej walce jeden strzał wysyła dwie wiadomości czatu** — najpierw wpis dziennika Akcji, potem kartę rzutu; `once('chat:message')` łapie tę pierwszą. Test czekający na kafel ataku musi filtrować po `message.roll?.attack`.
- **`weapon:reload` w walce kosztuje Akcję i potrafi odmówić** — pętla testowa dostrzeliwująca magazynek zostaje z pustą bronią; uzupełniaj łatą karty (`ammoCurrent: ammoMax`).
- **Ten sam rzut obrażeń potrafi wylosować ranę z tabeli** (dwie szóstki na 5k6 to ~20% strzałów), więc Celowanie w nogę bywa Celowaniem w nogę **już złamaną** — wygląda jak regres reguły, jest pechem kości.
- **`damageReduced` to `min(redukcja, obrażenia)`** — test Redukcji obrażeń na broni `1k6` migocze raz na sześć przebiegów. Broni testowej podnosi się **minimum**, nie średnią.
- **Test rzutu, który „ma się udać", migocze na fumble'u** — naturalna 1 odejmuje 1k10 i przebija każdy modyfikator; powtarzaj rzut w pętli.

---

- **Pomocnik testowy, który przy odczycie odpina słuchacza, daje test przechodzący LOSOWO.**
  `collectMessages` w `tables.test.ts` zwracał listę **ze** `stop()`, a pętla „losuj, aż wypadnie
  podrzut” wołała go w każdym obrocie — po pierwszym przebiegu nasłuch był zgaszony i test
  przechodził tylko wtedy, gdy trafił za pierwszym razem. Objaw jest mylący: pada raz na kilka
  uruchomień i wygląda na wyścig w serwerze. Odczyt ma być **żywą tablicą**, a odpięcie osobnym
  krokiem na koniec.

- **`vitest` nie sprawdza typów — zielony test nie znaczy zielony `tsc`.** Fixture wiersza broni
  z `rof: 2` (a `CpredWeaponRow.rof` jest **napisem**) przeszedł 38 testów i wywrócił się dopiero
  na `tsc --noEmit`. Zestaw testów jest transpilowany bez sprawdzania typów, więc `tsc --noEmit`
  na wszystkich trzech pakietach jest osobnym krokiem przed commitem, a nie formalnością po nim.

- **`socket.once('chat:message')` łapie kartę POPRZEDNIEGO testu, jeśli tamten jej nie odebrał.**
  W `gametime.test.ts` test „+10 min" czekał tylko na rozgłoszenie `time:set`, a karta czatu
  zostawała w locie i trafiała w `once` następnego testu — który dostawał „Minęło dziesięć minut"
  zamiast „Minęła doba". Wychodziło raz na kilkanaście przebiegów i wyglądało jak błąd zegara.
  **Test, który wywołuje zdarzenie odkładające kartę na czacie, ma tę kartę odebrać**, choćby jej
  nie sprawdzał. Naprawione 05.09.

- **Nowy plik testów dymnych musi dostać `}, 60_000);` przy `beforeAll` — inaczej pęka pod
  równoległością, i to całym plikiem.** Hak startowy uruchamia `npx prisma migrate deploy`
  (osobny proces CLI Prismy) i podnosi Fastify z Socket.IO; pod pełnym `vitest run` (55 plików,
  każdy z własnym serwerem) nie mieści się w **domyślnych 10 s** vitesta. **Rozpoznanie:** objaw
  jest inny niż przy zwykłym migotaniu — w raporcie stoi `FAIL src/plik.test.ts
[ src/plik.test.ts ]`, bez nazwy testu i bez asercji, bo pada **hak**, nie test. 03.09 miało
  to pięć plików (`compendium`, `netcombat`, `netrun`, `netrunning`, `screamsheets`); reszta
  limit miała od początku. To jest przyczyna, którą wcześniejszy wpis o „pękaniu na limicie
  czasu" opisywał po objawach.

- **`waitFor(socket, 'chat:message')` bierze PIERWSZĄ wiadomość, jaka przyjdzie — i to jest
  wyścig, nie ostrożność.** Publiczny rzut dociera także do gniazda MG, a jego kopia potrafi
  wylądować już **po** tym, jak test, który go wywołał, wrócił na kopii gracza. Wtedy oczekiwanie
  **następnego** testu rozwiązuje się na karcie **poprzedniego**, a asercja pada w miejscu, które
  z przyczyną nie ma nic wspólnego (03.09 kosztowało to diagnozy w trzech plikach naraz).
  **Rozpoznanie:** pada raz na kilka przebiegów, za każdym razem gdzie indziej, a sam plik
  uruchomiony osobno przechodzi. **Obejście:** dopasowanie po treści, nie „pierwsza, jaka
  przyjdzie" — wzorzec `waitForMatch` / `waitForRoll(socket, tytuł)` jest w `roles30d.test.ts`,
  `netdemons.test.ts` i `character-rolls.test.ts`. Nowy test czekający na kartę na czacie
  **od razu** pisze, na którą.

- **Test, który mierzy „PW spadły", musi sam ustawić PW na starcie.** Przy zerze serwer
  **odmawia graczowi ruchu w ogóle** (`realtime/movement.ts`), więc walk się nie odbywa, spadek
  wychodzi 0 → 0, a test pada na `expected 0 to be less than 0` — obwiniając asercję zamiast
  stanu, który go zepsuł. Kilka trafień po 6k6 wystarczy, żeby figura z 50 PW dojechała do zera
  w połowie pliku. **Obejście:** pomocnik w rodzaju `healUp()` z `zones.test.ts`, który stawia
  kartę na pełni **i zwraca tę liczbę** — a asercja porównuje się z nią, nie ze stałą wpisaną
  z palca.

**`tsc --noEmit` łapie błędy w testach, których `vitest` nie widzi.** 29.08 (trzecia sesja)
`damage.test.ts` używał `DamageLogEntry` bez importu i przechodził od nieznanej liczby sesji —
vitest transpiluje bez sprawdzania typów, a `pnpm -r build` pomija pliki testowe. Jeśli dotykasz
typu, którego używają testy, sprawdź go osobnym `tsc`, nie samym `pnpm -r test`.

**`walls.test.ts` i `realtime.test.ts` też migoczą przy pełnym `vitest run`** (dołączają do
`netdevices` i `zones` z 29.08): raz „no such table: main.SceneExploration" po teardownie bazy,
raz timing obecności w `presence:update`. Uruchomione osobno przechodzą; drugi pełny przebieg
zwykle też. Zanim uznasz to za regres, powtórz przebieg.

- **W trwającej walce jeden strzał wysyła DWIE wiadomości czatu** (29.08, czwarta, kosztowało pół
  sesji polowania na migotanie): najpierw wpis dziennika Akcji z trackera, dopiero potem kartę
  rzutu. `once('chat:message')` łapał tę pierwszą, `roll.attack` było `undefined`, a pętla
  wystrzeliwała cały licznik prób i meldowała „30 strzałów i ani jednego trafienia" — mimo że
  trafień było w bród. Test, który czeka na kafel ataku, musi **filtrować** (`socket.on` +
  warunek `message.roll?.attack`), jak `waitForDamage` filtruje kartę obrażeń.

- **`weapon:reload` w trwającej walce kosztuje Akcję i potrafi odmówić** — pętla testowa, która
  dostrzeliwuje magazynek przeładowaniem, potrafi zostać z pustą bronią do końca licznika.
  Magazynek w teście uzupełnia się łatą karty (`character:update` z `ammoCurrent: ammoMax`),
  która nic nie kosztuje.

- **Ten sam rzut obrażeń potrafi wylosować ranę z tabeli** (dwie szóstki na 5k6 to około jedna
  piąta strzałów) — a atrapa danych ma w tabeli korpusu jeden wpis, więc raz na kilkadziesiąt
  przebiegów Celowanie w nogę trafiało w nogę **już złamaną** i słusznie nie dokładało nic.
  Wygląda jak regres reguły, jest pechem kości: test, który chce zdrowej nogi, musi umieć
  ją oddać i strzelić jeszcze raz.

**`damageReduced` to `min(redukcja, obrażenia)`, więc testy Redukcji obrażeń migoczą na małej
kości.** `combat-awareness.test.ts` bił pałką za `1k6` i sprawdzał „zredukowano o 2" — jedynka na
kości dawała 1 i test padał raz na sześć przebiegów przez cały etap 30a. Broń w takim teście musi
mieć **minimum obrażeń większe od redukcji** (`1k6+3`), nie większą średnią.

**Migotanie pełnego `vitest run` na serwerze nie ogranicza się do `walls`/`realtime`.** 30.08
padły w jednym przebiegu `roles30d.test.ts` („Pogłoski […] szeptem": `roll` zamiast `gmroll`)
i dwa testy z `specialties.test.ts`, a w trzech innych przebiegach tego samego kodu — nic.
Oba pliki przechodzą w izolacji. Zanim uznasz taki wynik za regres: **powtórz przebieg
i puść same te pliki**. Jeden czerwony przebieg z 54 plików nie jest dowodem.

**`specialties.test.ts` migotał na fumble'u, nie na czasie (31.08).** Naturalna 1 odejmuje 1k10,
więc rzut leczenia z modyfikatorem 18 schodzi do 9–18 i przegrywa z PT 17 mniej więcej raz na
dziesięć przebiegów — zabierając ze sobą dwa następne testy, bo rana zostawała na karcie. Objaw
mylił: asercja mówiła o liście ran, a przyczyna siedziała w kości. Rzut, który w teście **ma się
udać**, powtarzaj w pętli do skutku zamiast szukać modyfikatora nie do pobicia (sufity Cechy
i Umiejętności to 10 i 10, fumble przebija każdy).

**Czerwony pojedynczy plik w pełnym przebiegu serwera to najpierw podejrzenie wyścigu, nie
regresji (03.09).** `pnpm --filter @vtt/server test` pada mniej więcej co drugi przebieg, za
każdym razem w innym pliku — złapane `roles30d.test.ts`, `zones.test.ts` i `netdemons.test.ts`.
Ten sam plik uruchomiony osobno (`npx vitest run src/<plik>`) przechodzi 6/6. Sprawdzone
`git stash`-em: **na czystym HEAD pada tak samo**, więc nie jest to regresja sesji, która akurat
to zobaczyła. Objawy są dwojakie i oba wskazują na współdzielony czas, nie na logikę:
`waitFor(gm, 'chat:message')` bierze **pierwszą** wiadomość, jaka przyjdzie (czyli czasem
broadcast poprzedniego testu), a testy sprawdzające spadek PW zaczynają czasem od zera, bo
poprzedni krok zdążył dobić figurę. Obejście na czas sesji: powtórz plik osobno i idź dalej.
Naprawa docelowa — w `zaleglosci.md`.

**Testy nie widzą ściętego napisu — a trzy z sześciu błędów 30a–30d były właśnie tym (04.09).**
Mechanika dziewięciu Ról jedzie w 150 testach i wszystkie były zielone, kiedy sześć zdolności
Zmysłu Walki czytało się na karcie jako „R..", „W.", „B..", „P..", „W.", „W." — dwie pary nie do
rozróżnienia. Żaden test nie mierzy szerokości elementu ani nie czyta etykiety guzika, a panel
stał w kolumnie o **sztywnych 15 rem**, więc nie pomagało nawet rozciągnięcie okna. Diagnoza,
która to rozstrzyga w jednym kroku: porównaj `getBoundingClientRect().width` z `scrollWidth`
tego samego elementu (15 px przy potrzebnych 119 to nie jest „ciasno", to jest zerwany układ)
i przeczytaj `getComputedStyle` rodzica, żeby zobaczyć, która kolumna zjada resztę. Ten sam
odruch łapie drugi wariant: guzik z napisem, który dziedziczy sztywną szerokość po sąsiadach ±
(„Wezwij" jako „Wezw"). **To już drugie spotkanie z tym samym błędem** — 29b naprawiło go wąsko
dla `.advance-buy` („Podn" zamiast „Podnieś"), nie ruszając reguły, która go powodowała.
