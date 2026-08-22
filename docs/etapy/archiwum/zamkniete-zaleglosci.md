# Zamknięte zaległości — archiwum

Pozycje, które **przeszły** z sekcji „Otwarte zaległości" w `POSTEP.md`: naprawione błędy
i odklikane ścieżki, każda z diagnozą i opisem naprawy. Przeniesione tu 2026-08-22, żeby
`POSTEP.md` (czytany w całości na starcie każdej sesji) wrócił do rozmiaru, w którym da się
go czytać.

**Tego pliku nie czyta się rutynowo.** Sięgaj po niego, gdy szukasz, *jak* coś naprawiono,
albo gdy chcesz sprawdzić, czy pozycja, która wygląda na nową, nie jest wracającą starą.
Treść wpisów jest niezmieniona — łącznie z datami i odsyłaczami do notatek sesji.

## Przeniesione 2026-08-22 (sesja naprawcza, grupy z triażu 1–6)

- ~~**ZBIORCZA — dług oględzin „strona gracza": 15 etapów, jedna sesja z drugiego konta.**~~
  **Odklikane 22.08** (trzecia sesja tego dnia) — MG na `http://localhost:5173/`, gracz **avatar9**
  na `http://[::1]:5173/join/<token>`, obie sesje w jednym oknie Chrome. Z szesnastu pozycji
  **czternaście przeszło bez zastrzeżeń**, dwie zostały (niżej). Sesja wyprodukowała przy okazji
  **dwa naprawione błędy** (biały ekran przy wejściu do Panelu MG, dziura w numeracji drabinki
  `Esc` u gracza) i **cztery znaleziska** dopisane do `POMYSLY.md`.

  Odklikane: **27f** (okno `?` ma u gracza 3 narzędzia mapy zamiast 11; pusty stan handoutów
  „Mistrz Gry nie dał ci jeszcze żadnego materiału."), **27j** (wskaźniki kierunku rysują się
  także dla cudzych figur; `Nieprzytomny` = ciemna podstawka, `Martwy` = wielki ✕ — różnica
  czytelności potwierdzona na ekranie), **27i** (smuga pocisku i napis „PUDŁO" złapane
  spowolnionym `rAF` — patrz „Pułapki dev"), **27c** (obie strony karty; Reputacja u gracza jest
  **do odczytu**, bez „+ Wyczyn" — notatka mówiąca „pole tylko dla MG" była nieprecyzyjna),
  **26a** (rząd zakładek gracza ma 6 pozycji, bez „Sieć" i bez rzędu MG), **26b–26e** (run
  z konta gracza: trzon pokazuje odwiedzone piętro, resztę jako „? ?"; Czarny LOD ma u gracza
  **sam REZ 20/20**, bez ATK/OBR/PER/PRĘ), **26f** (strefa „Podłoga elektryczna" jest u MG,
  u gracza jej nie ma), **25c** („Kup" wyszarzony z powodem „Poziom 3 (Korporacyjne) — kampania
  ma odblokowany 2 (Zawodowe)."; cały krok wyposażenia w kreatorze wraz z chipem „×2"),
  **23b** (karta „Przelew" u odbiorcy, z oboma saldami), **23c** („Postaw się" / „Wycofaj się" /
  „Nie ustępuj (−2)" trafiły do **przegranego gracza**, a karta zaktualizowała się na
  „avatar9 nie ustąpił — −2 do Akcji przeciw Tony"), **18d/18e** (ikona 🪟, „Za daleko — podejdź
  do okna (na jedną kratkę).", otwarcie okna, „Okno zamknięte na skobel — nie ustąpi."),
  **16b** (klik w token ładuje kubek — **CDP to dowozi**, wbrew dopiskowi „wymaga myszy"; dymek
  celowania z chipem naboju „30 → 29"), **14e** (karta rany krytycznej dociera do gracza z pełnym
  opisem efektu).

  Domknięte przy okazji, spoza tej listy: **27e** (ekran `/join/<token>` i okno runa od środka),
  **23a** (chip cyberpsychozy „EMP 2 · Na granicy" na liście postaci gracza), **27b** (wiersz rany
  krytycznej z nazwą, efektem i koszem), **13** (karta przedmiotu z tabelą PT), **16e** (marsz po
  kliknięciu w podłoże — i to, że **marsz przestawia `facing`**), **27j** (zalew zasięgu ruchu
  **omija okno** — zacienienie za przeszkodą, którego na scenie `open` nie było jak zobaczyć),
  oraz potwierdzenie, że **przełącznik poziomu sklepu pokazuje 2 („Zawodowe"), a nie 1**.

  - [ ] **27f** — pusty stan **listy postaci** u gracza (`'Nie masz jeszcze żadnej postaci.'`).
        Sprawdzony w kodzie i mówi tym samym językiem co pustka handoutów, ale na ekranie go nie
        było: avatar9 ma dwie postacie, a Tony i Marcin też mają swoje. Do zobaczenia trzeba
        dołączyć do stołu **nowym imieniem**, czyli założyć konto-śmiecia.
  - [ ] **26e** — **atak na Demona** (`NET_DEMON_UNKNOWN`). Demon Poligonu siedzi na piętrze 4,
        a gracz nie widzi pięter, na których nie stanął — więc z UI nie ma jak go zaatakować.
        Pokryte testem serwera; do obejrzenia trzeba przejść run do końca.

  **Ustalenia, które unieważniają część starych dopisków.** (1) Notatka „netrunnerem Poligonu jest
  „Test 27x", która należy do MG" była **nieprawdziwa** — karta należy do avatar9; przepinania nie
  było trzeba. (2) Żeton **„Kolec" nie miał właściciela** (`ownerId = null`), więc gracz nie mógł
  nim ani skanować, ani się podłączyć mimo posiadania karty — **przepisany 22.08 na avatar9**.
  (3) Punkt dostępu miał w bazie `hidden = 1`, choć notatka mówiła „stoi odsłonięty" —
  **odsłonięty 22.08** przyciskiem „Odsłoń graczom" i taki zostaje. (4) „Potrzeba trzeciego hosta"
  przy 23b **nie była potrzebna**: przelew robi się z karty postaci, więc MG wysłał go z karty
  Tony'ego, a odbiorcą był zalogowany gracz.

- ~~**Etap 26f — pułapka z własną Turą nie wstawia się do Kolejki sama.**~~
  **Naprawione 22.08.** Wejście na obszar pułapki z wyzwalaczem `turn` (winda z gazem, s. 216)
  **zakłada jej wiersz w Kolejce Inicjatywy** — `pushZoneIntoQueue` w `zones.ts`, wzorowane na
  `pushNetFoeIntoQueue` z 26c: wiersz bez figury (`Combatant.zoneId`, nowa kolumna + migracja),
  inicjatywa o punkt wyżej od najwyższej, `order: -1`. **Odpalenie zostaje klikiem MG** — linia
  26c/26e („nic nie rusza się samo") się nie zmienia; zniknęła tylko papierkowa robota.
  Trzy przypadki milczenia, każdy świadomy: nie ma walki, pułapka już w kolejce stoi, albo
  **runda 0 („PRZED WALKĄ")** — tam inicjatywy są nierzucone, więc „o punkt wyżej" dałoby
  pułapce 1, czyli po rzutach miejsce **ostatnie**. Wiersz znika przy rozbrojeniu, rozstrzelaniu
  i usunięciu strefy. Test w `zones.test.ts`.

- ~~**Etap 26d — strzał z wieżyczki za osłoną nie ma czym odpowiedzieć.**~~ **Naprawione 21.08**
  (sesja naprawcza). `request.ignoreCover` jechało w payloadzie i **nikt go stamtąd nie ustawiał**
  — `NetRunWindow.tsx` w ogóle nie znało tego pola. Odmowa jest teraz **kodem**
  (`NET_SHOT_COVERED` / `NET_SHOT_BLOCKED` w `NET_DEVICE_MESSAGES`), a nie gotowym zdaniem, więc
  okno rozpoznaje ją i podstawia przycisk **„Strzelaj mimo osłony"**, powtarzający operację
  z `ignoreCover`. `fireDevice` zwraca `blocked` jako `{ code, text }`: kod dla okna, zdanie dla
  logu Demona (26e) i strefy (26f), które wstawiają je wprost na czat. **Druga Akcja Sieciowa
  nadal się należy** — jej zwrot to osobny, świadomy wpis w `POMYSLY.md` (15.08).

- ~~**Etap 26a — szybka sekwencja zmian na karcie gubi część edycji.**~~ **Naprawione 21.08**
  (sesja naprawcza). Przyczyna leżała o krok dalej, niż mówiła notatka: strażniki
  `pendingSaves > 0` **były** i w `endSave`, i w `applyUpsert`, ale liczyły wyłącznie zapisy
  **wysłane** — łatka czekająca w buforze debounce nie liczyła się wcale, więc ack poprzedniego
  zapisu adoptował widok serwera i kasował ją ze store'a. Następny klik budował listę z okrojonego
  stanu i wiersz przepadał bez śladu. Teraz `beginSave` idzie przy **kolejkowaniu**, nie przy
  flushu (jeden bufor = jeden zapis). Ta sama poprawka w ścieżce botów, która miała identyczny
  błąd. Pilnuje `packages/client/src/character-save.test.ts` — trzy testy na podstawionym
  gnieździe, sprawdzone celowym cofnięciem poprawki.

- ~~**Etap 27c — cztery gniazda kończyn dzielą jedną pulę.**~~ **Naprawione 22.08** — i taniej,
  niż mówiła notatka: model danych **był już gotowy**, bo `bodySlot` (27c) siedzi na wierszu od
  dawna i tylko arytmetyka go ignorowała. `cyberwareCapacity` liczy teraz **także per pudełko
  sylwetki**: „Cyberkończyny 2 / 8" dostaje pod spodem „Prawa cyberręka: 2 / 4 · Lewa: 0 / 4".
  Wiersz rodziny **zostaje nagłówkiem** i nie zmienia się ani o punkt — to jego liczbę czyta
  rachunek Człowieczeństwa. Rozbicie (`places`) dostają wyłącznie rodziny z **więcej niż jednym**
  pudełkiem (Cyberoptyka, Cyberkończyny); przy Cyberaudio powtarzałoby wiersz rodziny.
  Wszczepy, których nikt nie umieścił, liczą się raz w `unplaced`, żeby obie sumy się zgadzały —
  i **nie** wpadają do żadnej kończyny po cichu. Nowość, której licznik per rodzina nie umiał
  złapać: modyfikacja w ręce, której nie ma („nie ma w czym"), gdy druga ręka jest cybernetyczna.
  Cztery testy w `cyberware.test.ts`. **Nieodklikane w przeglądarce** — do obejrzenia na karcie
  z chromem w obu rękach.

- ~~**Etap 25a — nazwa umiejętności wielokrotnej nie ma gdzie zamieszkać.**~~
  **Naprawione 22.08.** Karta ma `skillSpecialties` (skillId → dziedzina), a czyta się je
  **wyłącznie** przez `cpredSkillSpecialty` / `cpredSkillLabel` w `shared` — bo Język odpowiada
  z `lifepath.language`, gdzie mieszka od 25b, a pozostałe z nowej mapy. Etykieta „Nauka (Fizyka)"
  idzie na kartę, w tytuł rzutu i w rozbicie na czacie. Kreator **pyta** i nie skończy postaci
  bez odpowiedzi.
  **Umiejętności są cztery, nie trzy** — do „Nauki", „Gry na instrumencie" i „Wiedzy lokalnej"
  doszły **„Sztuki walki"** („każdego stylu musisz się uczyć osobno", s. 81), które notatka
  pomijała.
  **Dwa świadome ograniczenia.** (1) **Jedna dziedzina na umiejętność, nie wiele** — postać
  znająca karate i judo ma tu jeden wiersz; RAW dałoby dwie osobne umiejętności, a to inny model
  danych (`skills` kluczowane czymś więcej niż id). (2) **Umiejętność podstawowa nie blokuje
  kreatora** — „Wiedza lokalna" jest na liście każdej Roli, więc twardy wymóg byłby podatkiem
  od **każdego** NPC-a, a etap 25a wprost chroni ścieżkę „pięciu NPC-ów w jeden wieczór". Pole
  i tak stoi w kreatorze i na karcie, tylko nie zatrzymuje. Jeśli przy stole wyjdzie, że ma
  zatrzymywać — to jeden `if` w `creationIssues`.

- ~~**Etap 27b — rana krytyczna w nowym panelu nieobejrzana.**~~ **Odklikane 22.08.** MG nadał
  avatar9 „Uraz kręgosłupa" listą + „Nadaj"; wiersz pokazał nazwę, „+1 do Testu Przeżywalności",
  pełny efekt („W swojej kolejnej Turze nie możesz wykonać Akcji…") i kosz, który ranę zdjął.
  Nieoglądane zostaje to samo **na wydruku** i w motywie dziennym.

- ~~**Etap 24a — grafika po usunięciu handoutu zostaje na dysku.**~~ **Naprawione 22.08**
  (sesja naprawcza) i szerzej: sprzątacza nie miał **żaden** z czterech katalogów. `uploads-gc.ts`
  chodzi w tle przy starcie serwera i kasuje plik **tylko** wtedy, gdy żadna kolumna go nie
  wymienia i jest starszy niż godzina (portret w kreatorze powstaje, zanim istnieje postać).
  Odnośniki zbierane są z kolumn z adresem **i** wyrażeniem regularnym z kolumn JSON (szkic
  kreatora, ładunek czatu, dane karty) — **nowa kolumna z adresem musi trafić na tę listę**,
  inaczej znaczy skasowany plik. Przebieg na sucho na żywych danych: 10 plików, 0 sierot.

- ~~**Etap 23c — „Cofnij" na karcie obrażeń nie przywraca strachu.**~~ **Naprawione 21.08**
  (sesja naprawcza). Wpis był w dodatku **mylący**: komentarz w `realtime/damage.ts` obiecywał,
  że powrotem jest ręczne zaznaczenie „Onieśmielonego" w menu tokenu — a to nie działa, bo
  `clearFacedownFear` kasuje **i naklejkę, i adres** w `statusData`, a `token:update` `statusData`
  nigdy nie pisze. Karta obrażeń zapisuje teraz listę uwolnionych (`fearCleared` w
  `DamageLogEntry`), a „Cofnij" woła `restoreFacedownFear`. Test w `facedown.test.ts` dowodzi
  powrotu **rzutem**, nie samą naklejką — bo naklejka to połowa kary.

- ~~**Etap 23c — status „Onieśmielony" zaznaczony ręcznie nic nie liczy.**~~
  **Naprawione 22.08.** Kara nadal wymaga **dwóch** rzeczy naraz (naklejki i adresu przeciwnika
  w `Token.statusData`) i tak ma zostać — dzięki temu zdjęcie naklejki jest pełnym „zdejmij karę".
  Zmieniło się to, że **drugą połowę da się wreszcie dopisać ręcznie**: pod statusami w menu
  żetonu stoi lista **„Boi się:"** z figurami sceny (`token:feared`, MG-only), a nagłówek mówi
  wprost „nikogo, więc −2 nie działa". `token:update` był złą drogą i nią nie jest — pisze
  kolumny, którymi figura **jest**, a nigdy `statusData`. Lista jedzie w prywatnej części
  `TokenView` (`feared`) — MG i właściciel, jak PW. Trzy testy w `facedown.test.ts`: kara
  schodzi z rzutu dopiero po wskazaniu kogo, zdjęcie naklejki ją wyłącza mimo zapisanego adresu,
  gracz nie dopisze nikomu niczego.

- ~~**Etap 20b — `NO_ROUTE` mówi „droga jest zablokowana", choć zwykle nie jest.**~~
  **Naprawione 22.08.** Rozdzielone na trzy kody, bo powody były trzy — i przy okazji wyszło,
  że stary komunikat kłamał **częściej**, niż mówiła notatka: `planWalk` **nigdy nie odmawia**
  celu nie do osiągnięcia (oddaje trasę do najbliższego pola z `truncated`), więc „droga jest
  zablokowana" nie było prawdą właściwie nigdy. Dziś: `NO_ROUTE` (figura naprawdę zamurowana —
  najlepszym polem jest to, na którym stoi, a cel jest gdzie indziej), `NO_ROUTE_BUDGET`
  („za mało metrów ruchu w tej turze") i `ALREADY_IN_PLACE` („już tam stoisz — podejście niczego
  nie zmieni"). Zdanie idzie do modelu jako powód do poprawki, więc każde podpowiada **inny**
  następny ruch. Rozróżnienie „już tam stoję" od „zamurowany" robi porównanie pola startowego
  z docelowym (`walkCellOf` w `bot-combat.ts`). Testy w `bot-combat.test.ts`.

- ~~**Osłona nie blokuje ruchu po stronie serwera**~~ — **naprawione 21.08** (sesja naprawcza), i szerzej, niż mówiła notatka: serwer nie sprawdzał **żadnej** geometrii ruchu, więc ściany też nie blokowały przeciągnięcia. `validateTokenMove` woła teraz `refuseWalkThroughSolid` (ściany + zamknięte okna + stojące osłony, `firstBlockedStep` w `shared/pathfinding.ts`), **także poza walką**; MG jest zwolniony, jak wszędzie w tym module. Odmowa nie nazywa przeszkody — gracz nie może mapować budynku, wchodząc w ściany. Testy: `covers.test.ts` (przez samochód, dookoła niego, MG bez blokady) i `walls.test.ts` (drzwi zamknięte vs otwarte). Stara treść wpisu; `validateTokenMove` dalej liczy sam dystans. Wraca razem z kolizjami ruchu (POMYSLY, 30.07).
- ~~**Etap 16b — statysta nie może aktywnie unikać**~~ — **naprawione 22.08** (sesja naprawcza).
  `attack:evade` czyta obrońcę z zapisanej karty ataku, a kartę postaci bierze **tylko wtedy, gdy
  cel ją ma**; figura z samym profilem bojowym rzuca tą samą syntezą (`sheetFromCombatProfile`),
  którą policzone było jej bierne PT — więc obie liczby nie mają jak się rozjechać. Przycisk
  dostaje MG albo właściciel żetonu, czyli ci, którym serwer i tak wysyła profil. Testy
  w `attacks.test.ts` (Unik statysty przepisuje kartę; gracz nie uniknie za cudzą figurę).
