# Poligon bojowy — stan sceny testowej

Wyprowadzone z `POSTEP.md` 22.08.2026. Czytaj, gdy siadasz do oględzin w przeglądarce.
Stan opisany na 22.08.2026 — po każdej sesji oględzin sprawdź, czy nadal się zgadza
(trzy rozjazdy z opisem wyszły przy oględzinach 22.08).

Opis niżej uwzględnia trzy poprawki z oględzin 22.08: karta **„Test 27x" należy do avatar9**
(nigdy do MG), żeton **„Kolec" ma właściciela** (bez tego gracz nie mógł się podłączyć do Sieci
mimo posiadania karty), a **punkt dostępu jest odsłonięty** (w bazie miał `hidden = 1`).

**🎯 Poligon jest przygotowany pod stół — nic nie trzeba budować od nowa.** Na scenie
„Strzelnica" stoi odsłonięty **„Punkt dostępu"** i obok niego żeton **„Kolec"** związany z kartą
**„Test 27x"** — Netrunner z Interfejsem 7 i cyberdekiem doskonałej jakości (Gumka, Pancerz,
Miecz, Młot na wroga, Superklej, Szabloząb). Architektura **„siec klub"** ma teraz **cztery
piętra**: 1 „Poczekalnia", 2 „Strażnik piętra" z Piekielnym ogarem, 3 **„Węzeł ochrony" (PT 8)**
z dwoma urządzeniami — **„Kamera nad bramą"** (wpis „Kamera obserwacyjna") i **„Grzechot"** (wpis
„Automatyczna wieżyczka", związany z żetonem **„Automatyczna wieżyczka"** stojącym na mapie:
REF 7, Umiejętność 7, karabin szturmowy 25/25, PW 25/25) — oraz 4 **„Serce sieci"** z **Diablikiem**
(REZ 15, Interfejs 3, 2 Akcje Sieciowe, Wartość bojowa 14). Tryb turowy jest **wyłączony**;
kolejka „PRZED WALKĄ" z Tonym i avatar9 wraca jednym kliknięciem „Włącz tryb turowy".
**Na „Strzelnicy" nie ma żadnej strefy — poprawione 27.08 (trzecia sesja).** Ten akapit
obiecywał tu ⚠ „Podłogę elektryczną" od 26f; sprawdzenie w bazie mówi, że w całym projekcie jest
**jedna** `DefenseZone` i stoi na **„Kartach 24x"** (id 3, 20 PW, uzbrojona i ukryta). Ta ze
Strzelnicy została skasowana przy którymś porządkowaniu sceny i nikt tego nie odnotował. Strefa
z „Kart 24x": kto na nią wejdzie, dostaje 6k6 przez pancerz i jeszcze raz na koniec każdej swojej
Tury; gracz jej nie zobaczy, dopóki nie zda Percepcji PT 17 z 4 m. Karta strefy otwiera się
narzędziem ⚠ w trybie 📌; „Rozbrój" ją usypia, kosz usuwa.

**Stan po sesji 30.08 (czwarta) — rany krytyczne.** Poligon został przygotowany pod oględziny
łatania i zostaje w tym stanie:

- **Karta „avatar9"** ma dopisane **Ratownictwo medyczne 6** i **Broń krótką 10** (żeby mogła
  sama się łatać i trafiać z Celowaniem), a na niej **trzy rany**: „Złamana noga", „Strzaskane
  palce" i **„Test łaty 15"** — rana **wpisana ręką MG w kompendium** (−3 do RUCH-u, −1 do
  rzutów, brak Uniku, DoT po biegu), zostawiona jako gotowy materiał do sprawdzania flag 14e.
  Łaty zdjęte, PW i pancerz przywrócone.
- **Karta „Rudy Kwiatkowski"** ma **Broń białą 10** i **„Bardzo dużą broń białą" (4k6)** z katalogu
  oraz ranę **„Złamana noga"** z Celowania — para gotowa do sprawdzania połowy pancerza. Żeton
  wrócił na (2000, 1500).
- **Żeton „Automatyczna wieżyczka"** ma w profilu bojowym ranę **„Odcięta dłoń"** (2k6 = 3),
  zostawioną świadomie: to jedyna figura z raną **bez karty postaci**, a takiej rany nie da się
  dziś zdjąć z UI (pozycja w `zaleglosci.md`). PW przywrócone do 25/25.
- **Kompendium ma o jeden wpis własny więcej** — „Test łaty 15" w Ranach krytycznych (23 zamiast
  22). Kasować nie trzeba: to jedyny wpis, na którym widać komplet pól rany z edytora.

**Od 27.08 w kampanii stoi „Rudy Kwiatkowski" — jedyna postać zrobiona kreatorem od zera.**
Fixer (Znajomości 4, PW 40, Człowieczeństwo 60), bez portretu i bez żetonu, właściciel „NPC (MG)".
Powstał przy odklikiwaniu 27c i **zostaje decyzją MG (27.08)**: to jedyny w bazie dowód, że pełny przebieg
kreatora dowozi komplet — 17 odpowiedzi Ścieżki Życia na stronie drugiej, „Wiedza lokalna:
Pacifica" i „Język: Angielski" na stronie pierwszej. Ta ostatnia rzecz jest dowodem na naprawę
z 27.08 (kreator gubił specjalizacje) — kasując go, tracisz jedyny egzemplarz do porównania.

**„Poligon bojowy" stoi na poziomie sklepu 2 (Zawodowe)** — przestawione 22.08 decyzją MG wprost
w bazie (`Campaign.shopTier`), bo migracja dawała każdej kampanii `shopTier = 1` i gracz nie kupił
by niczego droższego niż 50 ed. Przełącznik 1–4 jest w zakładce **„Kompendium"** pod chipami
kategorii; MG kupuje przez wszystkie poziomy niezależnie od niego. **Sprawdzone 22.08:** Kompendium pokazuje „Sklep: **Zawodowe** · Do 500 ed", a wpisy wyższych
poziomów są wyszarzone z powodem — wartość z bazy dociera do UI poprawnie.

## Stan kart po oględzinach 29b (30.08, trzecia sesja)

**Karta „Test 27x" była w trakcie oględzin przestawiona na Solo 4 z 400 PD, a potem na Nomadę
z Solo jako poprzednią Rolą — i została przywrócona.** Po sesji stoi z powrotem jako
**Netrunner, Interfejs 7, 0 PD, `formerRoles: []`**, z cyberdekiem na miejscu; wiersz rejestru
awansów, który powstał przy zakupie Roli, został skasowany. Poligon Sieci (żeton „Kolec"
podpięty do tej karty) jest nienaruszony. **Do następnych oględzin wieloklasowości trzeba tę
sytuację odtworzyć od nowa** albo zrobić kartę osobną — „Test 27x" jest nośna dla etapów 26x.

**Zastane, nie z tej sesji: karta `avatar9` ma Rolę `solo` z rangą 1**, choć `POSTEP.md` opisuje
avatar9 jako netrunnera. Netrunnerem jest **„Test 27x"** (to ona ma cyberdek) — obie należą do
konta `avatar9` i stąd pomyłka w notatce.

## Stan kart po sesji 28.08 (pakiet A+B — ekonomia i chrom)

**avatar9 jest od 28.08 jedyną postacią w bazie z chromem** i zostaje taki celowo: to jedyny
egzemplarz, na którym widać rozbicie gniazd z 27c i księgę Człowieczeństwa z 23a. Ma
**dwie Cyberręce** (prawa: „Pazury" + „Chwytna Dłoń", lewa pusta), **„Ciężką kurtkę kuloodporną"**
(OB 13, kara −2) w pancerzu, **Człowieczeństwo 28/44**, **EMP w grze 2** (chip „EMP 2 · Na
granicy" na liście postaci) i **200 ed**. Saldo po drodze podbiła korekta MG do 3000 ed, żeby
starczyło na cztery montaże — bez niej nie było czego klikać.

**Tony wrócił do stanu sprzed sesji** (50 ed, jeden pusty wiersz sprzętu). Kupiona mu
„Apteczka polowa" została skasowana omyłkowym kliknięciem kosza — opis w `pulapki-dev.md`;
zakup zdążył zostać potwierdzony w bazie, na karcie i kartą na czacie.

**Kopia wszystkich dziewięciu kart sprzed sesji:**
`data/private/backups/characters-2026-08-28.json` (gitignore). Jeśli chrom avatar9 zacznie
przeszkadzać w innych oględzinach, stan wraca stamtąd jednym `UPDATE Character SET data = …`.

## Stan po ostatnich oględzinach (22.08, trzecia sesja tego dnia)

Przywrócone: tryb turowy wyłączony, rana zdjęta, wszystkie ściany i okna skasowane, widoczność
z powrotem „Pełna". Zostawione świadomie: punkt dostępu odsłonięty, „Kolec" u avatar9, avatar9
dwie kratki niżej z naklejką „Onieśmielony" i +50 ed z testowego przelewu.

## Stan po oględzinach 22.08 (piąta sesja tego dnia)

Bez zmian względem opisu wyżej. W trakcie sesji Poligon był używany do odklikania zaległości
i **przywrócony**: tryb turowy wyłączony (kolejka skasowana), „Kolec" wrócił pod punkt dostępu,
osłona **„Samochód 25/25"** odtworzona presetem w tym samym miejscu po sprawdzeniu kosza „usuń
wszystkie osłony", tymczasowa ściana przy Tonym skasowana, wpis testowy w kompendium i dodany
wiersz broni Tony'ego usunięte. Scena testowa **„Korytarz 16e"** (ściany, trzy żetony, w tym
figura 2×2) powstała na czas oględzin i została skasowana razem z zawartością — jeśli będzie
znów potrzebna, zbuduj ją od nowa: scena z widocznością „Dynamiczna", ściana w kształcie L,
żeton 1×1 z profilem bojowym i paskiem HP oraz żeton 2×2.

## Scena „Efekty 23x" (23.08, sesja triażu zaległości)

Osobna scena w tej samej kampanii, zbudowana **zamiast ruszania Strzelnicy** (decyzja MG).
Widoczność `open`, pusta siatka 100 px, dwie figury 1×1:

- **Strzelec 23x** — statysta (profil bojowy): Umiejętność 10, Unik 2, pancerz OB 0,
  broń **Granatnik**, magazynek wystrzelany do 0/2 (przeładowanie kosztuje Akcję).
- **Cel 23x** — statysta: pancerz **OB 6** (zaczynał od 7, ablacja zdjęła jeden), PW 33/35.

Do czego służy: efekty walki z 27i (wybuch odklikany, **zostają gaz i wyładowanie strefy**)
i wszystko, co wymaga trybu turowego bez dotykania Strzelnicy. Walka jest zakończona, scena
stoi w podglądzie — aktywna jest z powrotem „Strzelnica". Do gazu trzeba wpisu amunicji
gazowej w magazynku, do wyładowania — strefy „Podłoga elektryczna" narzędziem stref.

**Naprawione 26.08:** karta ataku statysty **ma już przycisk „Obrażenia"** — rzut obrażeń
obszarowych nie wymaga figury z kartą postaci. Na tej scenie to sprawdzano (pakiet P1);
po oględzinach magazynek Granatnika wrócił do **0/2**, a „Cel 23x" do **PW 33/35, OB 6**.

## Stan po oględzinach 23.08 (etap 27k — edycja sceny)

**Rozjazd z opisem wyżej, zastany na starcie sesji (nie spowodowany przez 27k):**

- **⚠ „Podłogi elektrycznej" nie ma na Strzelnicy.** Licznik stref w pasku pokazywał „brak stref"
  jeszcze zanim cokolwiek w tej sesji ruszono. Opis z 26f jest w tym punkcie nieaktualny.
- **Osłony „Samochód 25/25" też nie ma.** Licznik osłon startował od zera. Poprzedni wpis
  (22.08, piąta sesja) mówi, że została odtworzona presetem — od tego czasu zniknęła.
- **Punktów dostępu jest sześć, nie jeden.** Opis z 22.08 wymienia jeden odsłonięty „Punkt
  dostępu"; pięć kolejnych doszło później.
- **Na Strzelnicy leży ściana w kształcie L** (3 segmenty). Opis z 22.08 mówi „wszystkie ściany
  skasowane" — ta jest zostawiona po testach figury 2×2 z 23.08.

**Przywrócone po oględzinach 27k:** wszystko, czego dotknęła ta sesja. Kasowanie i `Ctrl+Z`
sprawdzono na siedmiu rodzajach obiektów; każdy albo wrócił cofnięciem, albo był stworzony na
potrzeby testu i został skasowany. Stan końcowy Strzelnicy: **6 gniazd, 3 segmenty ściany,
0 świateł, 0 osłon, 0 stref, 0 notatek, 0 rysunków.** Zaznaczenie żetonu jest lokalne i nic nie
zapisuje. Scena **„Efekty 23x" nietknięta**.

## Scena „Karty 24x" (24.08, etap 27l — karty obiektów sceny)

Trzecia scena testowa w tej samej kampanii, znów zbudowana **zamiast ruszania Strzelnicy**.
Widoczność „Ręczna mgła", siatka 100 px, mapa pusta — na scenie stoi **po jednym obiekcie
każdego z siedmiu rodzajów**, dokładnie po to, żeby dwuklik w każdy z nich otwierał kartę:

| rodzaj  | co konkretnie                                                                       |
| ------- | ----------------------------------------------------------------------------------- |
| ściana  | pionowy odcinek (zwykła ściana)                                                     |
| drzwi   | ukośny odcinek, **otwarte, gracze mogą otwierać, bez rygla** — przestawione z karty |
| osłona  | „Samochód 25/25", przesunięta i przeskalowana uchwytami                             |
| strefa  | ⚠ „Podłoga elektryczna" 20 PW, uzbrojona                                            |
| światło | lampa różowa, **zgaszona** (przestrojona z karty)                                   |
| notatka | pinezka 📌 „Za drzwiami czeka zasadzka"                                             |
| rysunek | etykieta „Magazyn B" — literówka poprawiona z karty, warstwa **wspólna**            |

Do czego służy: wszystko, co robi karta obiektu — zmiana rodzaju przegrody, rygiel,
„gracze mogą otwierać", naprawa osłony, przestrojenie lampy, treść etykiety, przeniesienie
rysunku między warstwami — plus **uchwyty**: przeciągnięcie obrysu przesuwa, róg prostokąta
i koniec ściany skalują, `Ctrl` wyłącza przyciąganie do kratki.

Aktywna jest z powrotem **„Strzelnica"**; ta scena stoi w podglądzie. Strzelnica po tej sesji:
**6 gniazd, 3 segmenty ściany, 0 świateł, 0 osłon, 0 stref, 0 notatek, 0 rysunków** — czyli
dokładnie tak, jak ją zostawiło 27k. Scena **„Efekty 23x" nietknięta**.

## Konto testowe gracza `Tester` (27.08) — zamiast konta-śmiecia

Cztery zaległości typu „strona gracza nieodklikana" miały jedną przyczynę: dołączenie do stołu
**nowym imieniem** zakładało w kampanii kolejne konto-śmiecia, więc nikt tego nie robił. Od 27.08
w bazie dev siedzi na stałe gracz **`Tester`** — członek **wszystkich** kampanii, **bez żadnej
postaci** (to jego zadanie: pokazuje pusty stan listy postaci z 27f).

- **Wejście na konto:** `http://localhost:5173/join/tester-dev` → na ekranie dołączenia kliknij
  **„Tester"** (zaproszenie o stałym adresie, ważne do sierpnia 2027, wskazuje aktywną kampanię).
  Gracze **nie mają haseł** — `routes/auth.ts` loguje wyłącznie MG — więc link zaproszenia jest
  całą procedurą i dlatego może stać jawnie w repo: prowadzi do lokalnej bazy dev, a `dev.db`
  jest w `.gitignore`.
- **Tym samym ekranem wraca się na dowolne inne konto** (Tony / avatar9 / Marcin) — imię, które
  już jest w kampanii, to ten sam użytkownik, nie nowy.
- **Dwie sesje naraz w jednym Chrome** działają jak dotąd: `localhost:5173` i `[::1]:5173`
  (`127.0.0.1` **nie działa** — Vite tam nie słucha; sprawdzone 27.08). Który host trzyma MG,
  a który gracza, zależy od ciasteczek — sprawdź nagłówek okna, nie zakładaj.
- **Seed był jednorazowy, skryptu nie ma w repo** (decyzja MG): konto i zaproszenie żyją w bazie.
  Gdyby `dev.db` kiedyś zniknęło, wystarczy dołączyć do stołu imieniem `Tester` i nie dawać mu
  żadnej postaci.

## Stan po oględzinach 27.08 (pakiet A+B+X1)

Sesja pracowała na **„Strzelnicy"** i **wszystko po sobie posprzątała** — scena wróciła do stanu
z 27l: **4 żetony** (Tony, avatar9, Automatyczna wieżyczka, testowy 2x2), **0 rysunków**,
biblioteka grafik żetonów znów ma **4 pozycje** (avatar22, avatar14, avatar11, avatar9).
Po drodze były i zniknęły: żeton „Tester 27x" (właściciel `Tester`, status Nieprzytomny),
dwie grafiki testowe w bibliotece i trzy rysunki (jeden gracza, dwa MG — w tym jeden na warstwie MG).
Status **„Onieśmielony" na żetonie avatar9 jest zastany**, nie z tej sesji.

## Stan po oględzinach 27.08 (pakiet Sieci A+B) — Strzelnica ma teraz komplet pod Sieć

**Rozjazd zastany na starcie: żetonu „Kolec" nie było w bazie w ogóle** (opis na górze tego
pliku obiecywał go od 22.08; zniknął gdzieś między 23.08 a 27.08). **Odtworzony** — i przy okazji
wyszło, że **z UI nie da się dorobić żetonu skasowanej postaci**: `token:create` przyjmuje
`characterId`, ale jedynym miejscem, które go wypełnia, jest kreator postaci (`creation.ts`),
a panel „Tokeny" stawia wyłącznie puste żetony. Żeton odtworzono zdarzeniem `token:create`
z konsoli; pomysł na przycisk „Postaw na scenie" przy wierszu postaci → `POMYSLY.md`.

Scena **„Strzelnica"** po tej sesji — **wszystko, co doszło, zostawiono świadomie**, bo dopiero
z tym kompletem Sieć da się przeklikać bez budowania czegokolwiek od nowa:

| co                              | gdzie / stan                                                                                                                                                                                 |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| żeton **„Kolec"**               | world 1500 × 700, właściciel `avatar9`, karta **„Test 27x"** (Netrunner, Interfejs 7), PW 35/35 — tuż przy odsłoniętym „Punkcie dostępu" (1537 × 761)                                        |
| gniazdo **„Gniazdo za ścianą"** | id 10, world 1600 × 2400, **odsłonięte**, podpięte do „siec klub" — leży po **drugiej stronie** pionowego segmentu ściany L (x = 1700), więc `NET_WALL_BLOCKS` jest odklikywalne w dwa ruchy |
| **drzwi #59**                   | world 2400 × 1900–2200, zamknięte, bez rygla — podpięte do „Węzła ochrony" jako urządzenie **„Brama serwerowni"** (rodzaj „Drzwi lub winda")                                                 |

Reszta bez zmian: **5 żetonów** (Tony, avatar9, Automatyczna wieżyczka, testowy 2x2, Kolec),
3 segmenty ściany, 0 świateł, 0 osłon, 0 stref, 0 notatek, 0 rysunków, **7 punktów dostępu**.
Tryb turowy **wyłączony** (kolejka skasowana), żadnego runu w bazie.

**Architektura „siec klub" przywrócona do czterech pięter** — w trakcie sesji dokładano do niej
Zabójcę (piętro 2), Krakena (piętro 1), drugiego Demona i dwa piętra-atrapy pod pasek „Uwagi";
wszystko zdjęte. Została **tylko** trzecia pozycja urządzeń na „Węźle ochrony" (drzwi).

**Karta „Test 27x" sprawdzona bajt po bajcie ze zrzutem sprzed sesji** — jedyna różnica to
`skillSpecialties: {}` zamiast braku klucza (normalizacja, którą robi każdy zapis karty).
Cyberdek wrócił w komplecie: Gumka, Pancerz, Miecz, Młot na wroga, Superklej, Szabloząb;
PW 35/35, bez ran krytycznych.

**Uwaga na przyszłość:** biblioteka grafik żetonów ma dziś **5 pozycji** (doszedł `avatar25`),
a nie 4, jak mówi notatka z 27.08 w `POSTEP.md` — nie ruszała tego ta sesja.

## Stan po oględzinach 28.08 (pakiet A) — Strzelnica ma teraz komplet stref

**Pięć stref bronionych zostaje na scenie świadomie**, tą samą decyzją, którą 27.08 zostawiło
komplet pod Sieć: dopiero z nimi 26f i efekty z 27i da się przeklikać bez budowania czegokolwiek
od nowa. **Wszystkie są uzbrojone i ukryte** (`hidden = 1`, więc gracz ich nie widzi, dopóki nie
zda Percepcji PT 17 z 4 m) — **żeton, który na nie wejdzie, naprawdę oberwie**.

| id  | strefa                      | world (x, y, szer., wys.) | co robi                                                                        |
| --- | --------------------------- | ------------------------- | ------------------------------------------------------------------------------ |
| 7   | ⚠ Automatyczna wieżyczka    | 1549, 1251, 296 × 300     | strzela żetonem **„Automatyczna wieżyczka"** (pole „Stanowisko"), WB 14        |
| 4   | ⚠ Podłoga elektryczna       | 2346, 1652, 296 × 299     | 6k6 przez pancerz przy wejściu i na koniec każdej Tury na obszarze             |
| 8   | ⚠ Ślizgawka                 | 1949, 2359, 296 × 295     | każdy **ruch** na obszarze wymusza Atletykę PT 15, porażka = Powalony          |
| 5   | ⚠ Maź                       | 2346, 2452, 296 × 296     | RUCH −2k6 i naklejka „Spowolniony", dopóki figura nie zejdzie z obszaru        |
| 6   | ⚠ Winda z gazem usypiającym | 2346, 2849, 296 × 296     | wchodzi **pierwszym miejscem do Kolejki Inicjatywy**; odpala ją MG w jej Turze |

Wieżyczka jest tu **dwa razy** i to jest zaleta, nie pomyłka: ten sam żeton jest urządzeniem
„Grzechot" na „Węźle ochrony" w architekturze „siec klub", więc netrunner może go wyłączyć
z Sieci, a strefa przestaje strzelać (`zoneDisarmedByNetrunner`). To jedyne miejsce na Poligonie,
gdzie Sieć i mapa spotykają się w jednym obiekcie.

**Przywrócone po sesji:** Tony (900 × 1500, bez statusów, PW 35/35, dwie bronie — Granatnik
z gazem był dodany na czas oględzin i został skasowany), Rudy Kwiatkowski (2000 × 1500),
magazynek wieżyczki 25/25, tryb turowy **wyłączony** (kolejka razem z wierszem pułapki skasowana).
Reszta bez zmian: 6 żetonów, 3 segmenty ściany, 7 punktów dostępu, 0 świateł, 0 osłon,
0 notatek, 0 rysunków.

**Rozjazdy z opisem wyżej, zastane na starcie sesji:** (1) **„Rudy Kwiatkowski" ma żeton**
(2000 × 1500) — akapit z 27.08 mówi „bez żetonu"; postawił go kreator, bo `creation.ts` jako jedyny
wypełnia `characterId` przy `token:create`. (2) Żetonów jest **sześć**, nie pięć.

## Scena „Korytarz 16e" (28.08, sesja pakietu A+B+D+E) — **czwarta scena stała**

Zbudowana od nowa i **zostawiona na stałe** decyzją MG z 28.08. Do tej pory powstawała i ginęła
przy każdej sesji, która potrzebowała dynamicznej widoczności (ostatnio 22.08), i za każdym
razem płaciliśmy za nią drugi raz. Poligon nie miał ani jednej stałej sceny z widocznością
`dynamic` — a to jest jedyny tryb, w którym da się oglądać cień ścian, przerwania marszu
i (w etapie 27g) najgorszy przypadek wydajności.

**Ustawienia:** widoczność **Dynamiczna**, pamięć eksploracji **włączona**, ciemna scena
wyłączona, siatka 100 px, mapa pusta.

**Geometria:** jeden łańcuch ścian w kształcie **litery L** — odcinek poziomy przez środek
sceny i krótszy pionowy w górę z jego prawego końca. Wystarczy do trzech rzeczy naraz:
cień z jednej strony, obejście rogu i „ktoś wychodzi zza rogu".

**Figury:** `avatar9` (postać gracza, po lewej pod murem) i **„Rudy Kwiatkowski"** (NPC,
początkowo za murem — niewidoczny dla gracza; w trakcie oględzin przeciągnięty na stronę
gracza i tam został). Obie postawione **nowym przyciskiem ⊕ „Postaw na scenie"**, nie kreatorem.

**Aktywna z powrotem jest „Strzelnica"** — ta scena stoi w podglądzie, jak „Efekty 23x"
i „Karty 24x". Strzelnica po tej sesji ma **drugą figurę Rudego** (postawioną przy sprawdzaniu
przycisku ⊕, właściciel przestawiony na **avatar9** przy sprawdzaniu pustego paska gracza) —
zostawiona świadomie: to jedyna figura w bazie, na której widać zdanie „Ta figura ma kartę
postaci, ale nie jest przypisana do ciebie".

**Kampania „Poligon bojowy" jest od 28.08 oznaczona jako poligon** (`sandbox = true`) — chip
„POLIGON" w górnym pasku i krótkie pytanie przy kasowaniu. Nie zdejmuj tej flagi bez powodu:
to jedyna kampania, na której wolno wszystko zepsuć.

**Handout „Kto zostawił krążek na Poligonie?"** (screamsheet z wgraną grafiką) został jako
dowód odbitki gazetowej z 24c — jedyny screamsheet w kampanii ze zdjęciem.
