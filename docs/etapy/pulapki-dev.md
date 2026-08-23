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
