# Pułapki dev (kosztowały czas więcej niż raz)

Wyprowadzone z `POSTEP.md` 22.08.2026. Indeks jednolinijkowy jest w `POSTEP.md`; tu leżą pełne
opisy z rozpoznaniem i obejściem. Czytaj wpis, zanim zaczniesz szukać błędu w obszarze, którego
dotyczy.

- **Nowa kolumna z adresem pliku musi trafić na listę w `uploads-gc.ts`** — sprzątacz kasuje
  plik, którego nie wymienia **żadna** kolumna (i który jest starszy niż godzina), więc kolumna
  pominięta na tej liście znaczy skasowany plik. Odnośniki zbierane są z kolumn z adresem
  **i** wyrażeniem regularnym z kolumn JSON. Opis naprawy: `archiwum/zamkniete-zaleglosci.md`.

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
- **Zdarzenie wysłane bez potwierdzenia (`socket.emit('x', payload)`) docierało na serwer z pustym payloadem** — `registerEvents` uznawał jedyny argument za brakujący callback. Naprawione 31.07; objaw był zupełnie inny niż przyczyna (token skacze u obserwatorów, patrz notatka sesji). Nowe zdarzenie bez acku sprawdź testem serwera, bo klient nie dowie się o odmowie — nie ma czym.
- **Dane CP RED (`skills.json`, `roles.json`) wczytywały się dopiero po otwarciu „Postaci" albo karty postaci** — `ensureCpredDataLoaded` wołały tylko te dwa komponenty. Dopóki każdy atak zaczynał się od karty, nikt tego nie zauważył; HUD z 16f zaczyna go z mapy, więc **każdy strzał wracał z „Nie wiem, jaką umiejętnością strzelać z tej broni"** (`UNKNOWN_SKILL` — pusty rejestr umiejętności, nie brak danych w kompendium). Naprawione 01.08: `MapArea` woła je razem z `ensureStatusesLoaded`. **Wniosek na przyszłość:** nowe wejście do mechaniki sprawdź na **świeżo przeładowanej karcie, bez otwierania żadnej zakładki** — to jedyny stan, w którym takie leniwe ładowanie widać.
- **Po `prisma migrate dev` upewnij się, że klient się przegenerował** (`prisma generate`) — stary klient w `src/generated/` daje `Unknown argument`.
- **Haseł w formularze nie wpisuję** — sesję MG zakłada użytkownik, sesję gracza zakłada się kluczem z panelu MG (bez hasła).
- **Edycja kodu w trakcie oględzin przeładowuje kartę, a wtedy pisanie staje się skrótami klawiszowymi.** Kosztowało to 08.08 przypadkowe przeskoczenie tury w żywej kampanii: po edycie `realtime/rules.ts` `tsx watch` zrestartował serwer, Vite przeładował stronę, ognisko wyszło z pola tekstowego — i wpisywane zdanie poleciało do globalnych skrótów mapy (**każde „e" to „koniec tury"**, litery uzbrajają narzędzia). **Zasada:** albo kończysz edycje przed wejściem do przeglądarki, albo przed każdym pisaniem robisz zrzut i sprawdzasz, że kursor stoi w polu. Po wpadce `Esc` rozbraja uzbrojone narzędzie.
- **`reasoning_budget` w llama-server nie działa dla wartości dodatnich** — przyjmuje 640 bez błędu, ale egzekwuje wyłącznie 0 i −1. Każda ścieżka z `reasoning: true` musi umieć obsłużyć **pustą odpowiedź** po zużyciu całego `max_tokens` na blok think. Szczegóły w `ai-gateway/README.md`.
- **Testy dymne serwera potrafią raz na kilka przebiegów pęknąć na limicie czasu** — każdy plik podnosi własny Fastify z Socket.IO, więc przy pełnym `pnpm --filter @vtt/server test` bywa ciasno. Zaobserwowane 08.08: dwa różne przypadki (`ammo.test.ts`, `ammo-effects.test.ts`) pękły po jednym razie na trzy przebiegi i **oba przeszły uruchomione osobno**. Zanim zaczniesz szukać regresji, powtórz sam plik.
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

- **Dane kampanii mogą nie mieć pola, które kod obsługuje — a testy tego nie złapią.**
  23.08 wyszło, że granatnik w kampanii nie robił obszaru wybuchu, choć etap 16d był
  „ukończony i odklikany". Przyczyna nie leżała w kodzie: `explosive` wypadało z
  `weapon-types.json` przez białą listę w importerze (opis w `umowy-kodu.md`), a testy
  przechodziły, bo publiczna próbka danych **ma** typ z `explosive`. Objaw był mylący —
  atak trafiał, tylko nie miał obszaru, listy trafionych ani rzutu obrażeń. Zanim uznasz
  „mechanika nie działa" za błąd kodu, sprawdź, czy pole w ogóle jest w danych:
  `python -c "import json;d=json.load(open('data/private/cpred/compendium/weapon-types.json',encoding='utf8'));print([t['id'] for t in d['weaponTypes'] if t.get('explosive')])"`.

- **Rzut z karty postaci idzie dwoma kliknięciami: `Shift`+klik ładuje kubek, klik w kubek
  rzuca.** Zrzut zaraz po pierwszym kliknięciu pokazuje pusty stół i wygląda jak awaria.
  Kości leżą 3,2 s po ustaniu (`FADE_OUT_DELAY_MS`), a **złota kość dorzutu krytyka spada
  dopiero 550 ms po pierwszej fali** (`EXTRA_DIE_DELAY_MS`) — zrzut po 2 s łapie moment przed
  nią, dopiero ~3 s pokazuje obie. Stół kości to pełnoekranowa nakładka **pod** oknem karty
  postaci: przy otwartej karcie kości są niewidoczne, więc do łapania rzutów kartę trzeba
  zamknąć (kubek zostaje naładowany).

- **Podpowiedź wyśrodkowana nad mapą kładzie się na pasku narzędzi** (23.08, etap 27k). Pasek
  `.map-tools` stoi w lewym górnym rogu mapy, ale ma `max-width: 38rem` i się zawija, więc
  na szerokiej mapie sięga daleko poza środek — a `.map-placement-hint` jest `left: 50%`.
  Efekt: zdanie leży wprost na ikonach i wygląda, jakby ich nie było. **Obejście:** podpowiedź
  należąca do paska renderuje się **w nim**, jako wiersz z `flex-basis: 100%` (`.map-tool-tip`);
  pływające pudełko zostaw na rzeczy, które paska nie dotyczą (stawianie żetonu, celowanie).

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

- **Otwarte pływające okno łatwo zabiera klawisze narzędzi mapy** (24.08, etap 27l). Strażnik
  „czy ktoś pisze" w `MapArea` obejmował przez chwilę **każdą** kartę obiektu, więc po otwarciu
  karty ściany `O` przestawało przełączać na osłony i dorysowywało kolejny segment. Do pola
  tekstowego należy wyłącznie karta, która **sama ustawia kursor w treści** (notatka);
  reszta ma tylko przyciski i suwaki, a te i tak wyłapuje pierwszy warunek (`closest('input, …')`).

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

- **Pole tekstowe, które „nie przyjmuje znaków", bywa zgubionym odczytem, nie zepsutym polem**
  (27.08). Specjalizacja umiejętności w kreatorze wyglądała na martwy input: klik ustawiał
  ognisko, znak leciał, wartość zostawała pusta. Sprawdzenie po kolei: pole nie jest `readOnly`
  ani `disabled`, pisanie w **innym** polu na tej samej stronie działa, a wartość **jest**
  w bazie (`CharacterDraft`) — więc winny był odczyt (`parseCreationDraft`), nie klawiatura.
  Kolejność, która to rozstrzyga najszybciej: (1) `document.activeElement` — czy to na pewno to
  pole, (2) atrybuty pola, (3) inne pole obok, (4) **zajrzyj do bazy**. Dopiero potem podejrzewaj
  automat.

- **Chip „⟳ nieaktualny" na wpisie, którego nikt nie ruszał, to zwykle stary odcisk, nie regres**
  (27.08). `stale` liczy się jako `indexedDigest !== knowledgeDigest(...)`, więc wystarczy, że
  odcisk zapisano inną wersją funkcji. Zanim zaczniesz szukać błędu w indeksowaniu, policz
  odcisk **kodem aplikacji** (nie przepisanym do Pythona — łatwo o różnicę) i porównaj z bazą;
  „Zaindeksuj wszystko" i tak to naprawia.

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

- **`data/private/rulebook/manual/tabela-ran-krytycznych.md` jest poza repo i od 27.08 nie jest
  nikomu potrzebny.** Kompendium ma dziś **obie** tabele 2k6 (11 ran korpusu + 11 głowy, s. 187–188)
  prosto z podręcznika przez `parse-manual.py`; ręczna tabela obsługuje wyłącznie wariant „mam sam
  Easy Mode". Zostawione jako ostrzeżenie, nie zadanie: bezpiecznik przed nadpisaniem i wzór
  formatu są w `data/public/cpred/tabela-ran-krytycznych.wzor.md` (opis w
  `archiwum/zamkniete-zaleglosci.md`).

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

- **Powrót gatewaya da się odkliknąć bez modelu**: atrapa `/health` na `127.0.0.1:8100`
  (kilkanaście linijek `node:http`, zwraca `{"status":"ok","llama":"external",…}`). Serwer VTT
  odpytuje ją co 10 s (`AI_HEALTH_INTERVAL_MS`), `ctx.ai.onStatusChange` rozsyła `ai:status`
  i wszystkie ścieżki „gateway wrócił" można obejrzeć bez `llama-server`. Wzór leżał w
  scratchpadzie sesji 28.08 — pisze się szybciej, niż się szuka.

**Łańcuch ściany kończy `Enter`, nie `Esc` — `Esc` go porzuca.** Podpowiedź paska mówi to wprost
(„Klikaj narożniki — Enter kończy ścianę"), ale odruch z każdego innego narzędzia to `Esc`,
i wtedy mur po prostu znika razem z podglądem: wygląda jak „automat nie umie rysować ścian",
a jest zwykłym anulowaniem. Kosztowało jeden przebieg budowy „Korytarza 16e" 28.08.

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

**Flaga kampanii nie rozchodzi się sama po podpiętych ekranach.** `Campaign.sandbox` jedzie
w `CampaignSummary`, czyli w stanie logowania — trasa REST ją zapisuje, ale **nie** broadcastuje,
więc chip „poligon" u innego klienta pojawi się dopiero po przeładowaniu albo po
`campaign:activate`. Dla dialu MG to akceptowalne; gdyby kiedyś zaczęło przeszkadzać, drogą jest
`campaign:switch` (to on przenosi wszystkie ekrany), a nie drugie źródło prawdy u klienta.

**Próbka dźwiękowa z paczki bywa dwoma zdarzeniami, a nie jednym.** `shot-rifle.wav` grał
**dwa strzały** od etapu 27i do 28.08 — oryginał `sks.wav` z paczki „Gunshot Sounds" ma drugą
detonację w 0,315 s. Nazwa pliku tego nie mówi, a przy strzale pojedynczym słychać dublet
dopiero na głośnikach. **Nową próbkę obejrzyj obwiednią, zanim ją wepniesz** — na tej maszynie
nie ma ffmpeg, ale wystarczy moduł `wave` z biblioteki standardowej Pythona: co 5–10 ms
maksimum wartości bezwzględnej, wypisane jako jedna linijka cyfr 0–9. Drugi szczyt po zaniku
pierwszego widać w tym gołym okiem, tak samo jak sekundę ciszy doklejoną na końcu.

**Mechanika bywa gotowa i nieosiągalna — sprawdź, kto ustawia flagę.** Celowanie (s. 170) miało
od etapu 16 komplet: `−8` w rozbiciu rzutu, `location: 'head'` w obrażeniach, ×2 po pancerzu,
`AIM_NEEDS_FULL_ACTION` w budżecie tury i wyjątek dla Ludzkiej tarczy. Mimo to **nie dało się go
odpalić**: obie drogi uzbrojenia celownika (`AttackLauncher` i wiersz broni na karcie) wpisywały
`aimed: false` na sztywno, a nic w UI tego nie zmieniało. Testy przechodziły, bo wołały planer
wprost. Zanim uznasz regułę za zrobioną, prześledź ją **od kontrolki**, nie od silnika — grep po
nazwie pola, na którym stoi (`grep -rn "aimed: true"` pokazał wtedy same przepisania, ani jednego
źródła).

**Podpowiedź nad mapą ma `pointer-events: none`** (`.map-placement-hint`), więc guzik dołożony do
banera jest niewidoczny dla myszy, dopóki sam nie włączy sobie `pointer-events: auto`. Włączaj je
na wąskim elemencie, nie na całym banerze — reszta paska ma dalej przepuszczać kliknięcia w mapę
pod spodem, inaczej pasek nad środkiem sceny zjada rozkazy marszu.

**`data/private/cpred/compendium/` bywa starsze niż `parse-manual.py`.** Wygenerowane pliki są
poza repozytorium (gitignore), więc nic ich nie odświeża przy zmianie parsera — a `git status`
tego nie pokaże. 29.08 regeneracja dołożyła Miotaczowi ognia `ammoPatterns: ['shell']`, którego
plik na dysku nie miał **od nieznanej liczby sesji**; bez tego pola `ammoFitsWeapon` odrzuca każdy
nabój specjalny (broń bez `ammoPatterns` i bez `ammoIds` nie przyjmuje niczego), więc miotacza
nie dało się załadować amunicją zapalającą mimo gotowej mechaniki z 16g. Objaw jest zawsze ten
sam: **kod robi coś, czego dane nie znają**. Zanim zaczniesz szukać błędu w kompendium, puść
`python tools/import/parse-manual.py` i porównaj wynik — import wypisuje ostrzeżenia i liczby,
a diff dwóch wersji pliku mówi więcej niż godzina czytania parsera.

**Nowe pole `CpredCharacterData` wywraca też statystę i mapę ikon.** Dopisanie
`combatAwareness` w 30a wysypało `tsc` w dwóch miejscach, których nikt by nie szukał:
`combatProfileSheet` (`statist.ts`) buduje **pełną** kartę syntetyczną, więc brak pola to błąd
typu, a `ICON_FX` w `fx.ts` to `Record<CpredSlotIcon, …>` — nowa ikona akcji wymaga wiersza także
tam, choć akcja niczym nie strzela. Nie szukaj tego w komentarzach: obie listy pilnuje kompilator,
więc wystarczy puścić `pnpm -r exec tsc --noEmit` **przed** pisaniem UI.

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

**Publiczna próbka `skills.json` ma 42 z 66 Umiejętności** — a `validateSkills` wycina id spoza
rejestru **po cichu**, przy każdym odczycie karty. Pakiet Umiejętności wpisany kodem (zespół
Korpo z 30c) traci więc na próbce część poziomów: `cybertech`, `basic-tech`, `weaponstech`,
`land-vehicle-tech`, `pilot-air-vehicle`, `language`, `endurance`, `trading` i kilkanaście
innych po prostu znika. To **nie jest** błąd pakietu ani regres — to brak danych; w grze jedzie
prywatny `skills.json` z kompletem. Test, który sprawdza taki pakiet, musi asertować na
Umiejętnościach obecnych w próbce publicznej.

**`damageReduced` to `min(redukcja, obrażenia)`, więc testy Redukcji obrażeń migoczą na małej
kości.** `combat-awareness.test.ts` bił pałką za `1k6` i sprawdzał „zredukowano o 2" — jedynka na
kości dawała 1 i test padał raz na sześć przebiegów przez cały etap 30a. Broń w takim teście musi
mieć **minimum obrażeń większe od redukcji** (`1k6+3`), nie większą średnią.

**Nowa Cecha karty nie może wynosić 0** — `CPRED_STAT_MIN` to 1, a `validateStats` odrzuca
**cały** blok Cech, gdy choć jedna wypada poza zakres. Objaw jest mylący: karta wraca z samymi
piątkami, jakby tabela w ogóle się nie wczytała. Tabele zawodów zespołu (30c) nie drukują
Szczęścia — pracownik dostaje więc `luck: 1` i **pustą sakiewkę** (`luckCurrent: 0`), co przy
stole znaczy to samo, a przez walidację przechodzi.

**`combat:next` przy jednym uczestniku w kolejce to cała runda** — a odliczanie w rundach
(przybycie Wsparcia, efekty 16h) rusza dokładnie wtedy. Test, który po wezwaniu robi krok tury,
żeby przeczytać kolejkę, potrafi w ten sposób sam sprowadzić posiłki. Stan kolejki czyta się
`state:request`, nie `combat:next`.

**Bronią bez `compendiumId` nie da się strzelić** — planer odmawia `UNKNOWN_WEAPON` („Ta broń nie
ma tabeli zasięgów"), mimo że wiersz siedzi na karcie. Ta sama odmowa co przy nieistniejącym
wierszu, więc szukanie zaczyna się od złej strony; wpis z katalogu jest wymagany, bo zasięgi
mieszkają na typie broni.

**Łata karty z częściowym blokiem Cech jest odrzucana w całości** (30.08). `validateStats`
przechodzi po wszystkich dziesięciu Cechach i przy pierwszej brakującej zwraca `undefined`, więc
`patch: { data: { stats: { cool: 8 } } }` kończy się `INVALID_DATA` — a wygląda dokładnie jak
„serwer nie przyjmuje mojej zmiany Roli", bo `roleId` z tej samej łaty też nie dochodzi. Kosztowało
trzynaście czerwonych testów naraz w `roles30d.test.ts`. Cechy podaje się kompletem albo wcale.

**Test, który stawia postać łatą gracza, od 29a dostaje `FORBIDDEN`** (30.08). Poziomy
Umiejętności, ranga Zdolności, `roleId` i licznik PD wypadły z `character:update` u gracza, więc
każdy stary test przygotowujący kartę przez gniazdo gracza (`emitAck(player, 'character:update',
{ data: { skills: … } })`) pada — i pada **w miejscu asercji o czymś zupełnie innym**, bo
przygotowanie stołu wygląda w teście jak tło. Padły tak trzy testy w `characters.test.ts`
i `roles30d.test.ts`. Kartę stawia się gniazdem MG; gracz kupuje poziom przez
`character:advance`.

**`.advance-buy` przegrywał kaskadę z `.awareness-steps button`.** Panel awansu z 29a dzieli
szkielet wiersza z panelem Zmysłu Walki (30a), a tamten ma guziki ±1 przycięte do 1,6 rem
selektorem `.awareness-steps button` (0,1,1). Guzik „Podnieś" z klasą `.advance-buy` (0,1,0)
dziedziczył tę szerokość i wychodził poza wiersz: w przewijanej liście Umiejętności widać było
„Podn", a `.advance-scroll` dostawał poziomy pasek przewijania. Objaw wygląda jak zbyt wąska
kolumna, jest zbyt słabym selektorem — `width: auto` trzeba dopisać jako `.awareness-steps
.advance-buy`. Sprawdza się to jedną linijką w konsoli: `getComputedStyle(btn).width`, nie okiem.
(Znalezione przy oględzinach 29b; błąd jest z 29a.)

**Kartę do oględzin da się przygotować w bazie, bez logowania na MG.** `node --input-type=module`
z `node:sqlite` (`DatabaseSync('packages/server/dev.db')`) czyta i zapisuje kolumnę `Character.data`
jako JSON; działający `pnpm dev` nie przeszkadza, wystarczy przeładować kartę przeglądarki, żeby
`state:sync` przyniósł nowy stan. `better-sqlite3` **nie jest** w `node_modules` na poziomie
repozytorium — jedzie jako zależność adaptera Prismy i `require` go nie znajdzie.

**Migotanie pełnego `vitest run` na serwerze nie ogranicza się do `walls`/`realtime`.** 30.08
padły w jednym przebiegu `roles30d.test.ts` („Pogłoski […] szeptem": `roll` zamiast `gmroll`)
i dwa testy z `specialties.test.ts`, a w trzech innych przebiegach tego samego kodu — nic.
Oba pliki przechodzą w izolacji. Zanim uznasz taki wynik za regres: **powtórz przebieg
i puść same te pliki**. Jeden czerwony przebieg z 54 plików nie jest dowodem.

**Kubkiem kości nie potrząśniesz z JavaScriptu.** `cup.click()` nic nie robi, a ręcznie złożona
seria `pointerdown` → `pointermove` → `pointerup` na `.dice-cup` też nie — kubek zostaje na
ekranie, rzut nie leci. Klikać trzeba narzędziem `computer`, **we współrzędnych zrzutu**: przy
oknie 1766 px CSS i zrzucie 1373 px skala to ≈0,777, więc `getBoundingClientRect()` trzeba przez
nią przemnożyć (`x * 1373 / window.innerWidth`). Guziki na kartach czatu i w formularzach reagują
na `click()` normalnie — to sam kubek jest wyjątkiem.

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

- **Nasłuch „kliknięcie poza oknem" dopięty w efekcie łapie ten sam klik, który okno otworzył**
  (31.08, kosztowało jeden nieudany przebieg oględzin). Okno Celowania otwiera się w obsłudze
  `pointerdown` na żetonie; React zdąża je wyrenderować **w trakcie** tego samego zdarzenia (klik
  jest zdarzeniem dyskretnym, więc aktualizacja idzie synchronicznie), a listener dopięty wtedy do
  `window` jest jeszcze przed nim w drodze w górę drzewa — więc dostaje ten klik i zamyka okno
  w tej samej klatce, w której powstało. Objaw jest mylący: **żadnego błędu, żadnego okna**, jakby
  warunek otwarcia był fałszywy. Obejście to jedna linia — `setTimeout(() => addEventListener(…), 0)`
  i `clearTimeout` w sprzątaniu. `stopPropagation` w Pixi nie pomaga: to inny system zdarzeń niż DOM.

**Sufit `SKILL_LEVEL_MAX` w profilu statysty ścinał Wartość bojową (31.08).** Objaw byłby taki:
C-SWAT z Wartością 15 bije i broni się jak krawężnik, a nikt nie widzi dlaczego — zapis do bazy
szedł poprawny, ścinał **odczyt** (`sanitizeCombatProfile`). Dotyczyło czterech z sześciu
kategorii Wsparcia (14, 16, 15, 14) i wszystkich pięciu Demonów (14). Nie wyszło przez dwa etapy,
bo testy sprawdzały `cpredBackupProfile` — czystą funkcję **przed** sanityzacją. Morał szerszy niż
ta jedna stała: funkcję, której wynik idzie do kolumny JSON, testuj po przejściu tam i z powrotem,
a nie w miejscu, w którym powstaje.

**Nazwa z tabeli w kodzie a nazwa w pliku danych różnią się wielkością litery (31.08).**
`roleability.ts` pisał „Ukrycie/znalezienie przedmiotu", `skills.json` ma „Ukrycie/Znalezienie
przedmiotu" — i jedna z piętnastu Umiejętności agenta federalnego znikała bez śladu, bo
dopasowanie po nazwie jest w tym projekcie regułą (broń Wsparcia, `criticalInjuryAt`). Każde
takie dopasowanie porównuj po `trim().toLowerCase()`.

**`specialties.test.ts` migotał na fumble'u, nie na czasie (31.08).** Naturalna 1 odejmuje 1k10,
więc rzut leczenia z modyfikatorem 18 schodzi do 9–18 i przegrywa z PT 17 mniej więcej raz na
dziesięć przebiegów — zabierając ze sobą dwa następne testy, bo rana zostawała na karcie. Objaw
mylił: asercja mówiła o liście ran, a przyczyna siedziała w kości. Rzut, który w teście **ma się
udać**, powtarzaj w pętli do skutku zamiast szukać modyfikatora nie do pobicia (sufity Cechy
i Umiejętności to 10 i 10, fumble przebija każdy).

**Gracz nie mógł kliknąć figury, której nie prowadzi (do 31.08).** `MapRenderer` wychodził po
cichu na `movableTokens.get(id) === false`, więc pasek nigdy nie pokazywał cudzej figury — i każda
funkcja dołożona do paska „dla gracza przy cudzej figurze" była z góry nieosiągalna, choć dane
jechały poprawnie. Zanim dołożysz coś do paska z myślą o graczu, sprawdź, czy ten gracz ma jak
postawić tam tę figurę.

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
