# Otwarte zaległości (dług oględzin i drobne braki)

Lista rzeczy **otwartych**, przenoszona między etapami; wyprowadzona z `POSTEP.md` 22.08.2026,
żeby nie obciążała pliku czytanego na starcie każdej sesji. Czytaj ją, gdy siadasz do
odhaczania zaległości albo dotykasz etapu, który tu występuje — nie rutynowo.

Zamknięte pozycje — z całą diagnozą i opisem naprawy — są w `archiwum/zamkniete-zaleglosci.md`.

## Pozycje

- **Etap 27l — skalowanie rysunku poza zakresem.** Rysunek dostaje **sam ruch**, bez rogów:
  ścieżka wpisana w prostokąt to nie to samo, co prostokąt, a rozciąganie kresek jest osobną
  operacją (przeliczenie każdego punktu, minimalna grubość, tekst, który nie skaluje się jak
  kształt). Zapisane jako świadome ograniczenie, nie brak — pomysł jest w `POMYSLY.md`.

- **Etap 27f — okno większe od przeglądarki nieodklikane; reszta sprawdzona 21.08 (patrz
  notatka sesji).** Sprowadzanie na ekran sprawdzone na oknie, które się mieści; dla okna
  **większego** niż okno przeglądarki zostaje próg „róg zawsze do złapania" i tej gałęzi nikt
  nie oglądał. (Strona gracza → odklikana 22.08, patrz `archiwum/zamkniete-zaleglosci.md`.)

- **Etap 27i — zostały dwie ścieżki i dźwięki.** ~~Wybuch~~ i ~~liczba obrażeń nad figurą~~ —
  **odklikane 23.08** na scenie „Efekty 23x" (patrz `archiwum/zamkniete-zaleglosci.md`; wybuch
  wymagał wcześniej naprawy danych broni). Zostają: (1) **chmura gazu** i **wyładowanie strefy** —
  gaz potrzebuje wpisu amunicji gazowej w magazynku, wyładowanie strefy „Podłogi elektrycznej"
  na scenie; (2) **dźwięki** — odtwarzane, ale nikt ich nie **słyszał**, a próbki dobrano po
  nazwach plików w paczkach CC0; rządek przycisków odsłuchu jest w „⚙ Ustawienia" właśnie po to
  i tej pozycji nie odhaczy nikt poza człowiekiem przy głośnikach.

- **Etap 27i — pomiar fps nie objął sceny ze światłami i mgłą.** „Strzelnica" ma widoczność
  `open`, więc 160,1 → 161,2 fps mierzy **samą warstwę efektów**, a nie najgorszy przypadek
  z kryterium etapu. Warstwa rysuje na klatkę kilka ścieżek `Graphics` i najwyżej jeden sprite,
  więc rezerwa jest duża — ale liczby dla sceny z dynamiczną widocznością nadal nie ma.

- **Etap 27e — jedna ścieżka nieodklikana; reszta sprawdzona 20.08 i 22.08.**
  ~~(1) Ekran dołączenia do stołu~~ i ~~(2) Okno runa w Sieci od środka~~ — **odklikane 22.08**
  przy oględzinach z konta gracza (świeży link zaproszenia z Panelu MG, run na żywej kampanii).
  Zostaje (3) **Screamsheet** — lista handoutów Poligonu jest pusta; różnica jest tu **żadna
  z definicji**, bo `--paper` nie ma wariantu dziennego.

- **Etap 26f — cztery ścieżki nieodklikane; reszta sprawdzona 16.08 (patrz notatka sesji w `archiwum/dziennik-sesji.md`).**
  (Strona gracza → odklikana 22.08, patrz `archiwum/zamkniete-zaleglosci.md`.)
  (1) **Ślizgawka i wymuszony Test** — w przeglądarce klikana była wyłącznie podłoga elektryczna; Test Atletyki
  z wyzwalaczem „każdy ruch na obszarze" ma test serwera. (2) **Kara do RUCH-u (Maź)** — naklejka
  **„Spowolniony"** (nowy status, ikona `slowed.svg` z game-icons) i jej liczba w budżecie ruchu
  („Pancerz −2 · Spowolniony −7") widziane tylko w testach; **ikona nie była oglądana na żetonie**.
  (3) **Strzał stanowiska** — ścieżka `fires` przeszła testem wyłącznie w wariancie „nie ma żetonu
  na scenie"; prawdziwy strzał wieżyczki związanej ze strefą wymaga żetonu z bronią i celu w polu
  ostrzału. (4) **Winda z gazem w Kolejce Inicjatywy** — od 22.08 wiersz wstawia się sam przy wejściu na
  obszar (patrz akapit niżej), ale nikt tego nie widział na ekranie: pokryte testem serwera.

- **Etap 26e — trzy ścieżki nieodklikane; reszta sprawdzona 16.08 (patrz notatka sesji w `archiwum/dziennik-sesji.md`).**
  (Strona gracza → odklikana 22.08, patrz `archiwum/zamkniete-zaleglosci.md`.)
  (1) **„Ten Demon miał już swoją Turę w tej Rundzie"** — na Poligonie tryb turowy jest wyłączony,
  więc rund nie ma i odmowa nie ma jak paść; pokryta testem serwera. (2) **Wstawka Demona do
  Kolejki Inicjatywy** — z tego samego powodu: bez rozpoczętej walki nie ma do czego wstawiać
  (test serwera sprawdza inicjatywę „o jeden punkt wyżej" i wiersz bez figury). (3) **Uwaga
  „jeden Demon na sześć pięter"** — Architektura Poligonu ma cztery piętra i jednego Demona, czyli
  mieści się w budżecie; żeby zobaczyć zdanie, trzeba dołożyć drugiego (pokryte testem w `shared`).

- **Etap 26d — trzy ścieżki nieodklikane; reszta sprawdzona 15.08 (patrz notatka sesji w `archiwum/dziennik-sesji.md`).**
  (1) **„Raz na Turę"** — `NET_NODE_USED` ma polskie zdanie i test na żywych gniazdach, ale
  w przeglądarce do niego nie doszło: rundy istnieją dopiero po **rozpoczęciu** walki (sam
  „Włącz tryb turowy" zostawia stan „PRZED WALKĄ" i rundę 0), a rozkręcanie walki w żywej
  kampanii zmieniłoby stan Poligonu bardziej niż warto. (2) **Drzwi z 18d** — na „Strzelnicy"
  nie ma ani jednych; ścieżka jest kopią `opening:toggle` i ma test serwera, w oknie Sieci
  klikane były kamera i wieżyczka. (3) **Odmowa `NET_DEVICE_OFF`** — z tego okna **nie da się**
  do niej dojść i to jest zamierzone: wyłączone urządzenie pokazuje wyłącznie „Włącz". Zdanie
  istnieje dla klienta, który by o tym nie wiedział, i ma test.
  (Strona gracza → odklikana 22.08, patrz `archiwum/zamkniete-zaleglosci.md`.)

- **Etap 26c — cztery ścieżki nieodklikane; reszta sprawdzona 15.08 (patrz notatka sesji w `archiwum/dziennik-sesji.md`).**
  (Strona gracza → odklikana 22.08, patrz `archiwum/zamkniete-zaleglosci.md`.)
  (1) **Superklej i „Zdejmij" u MG** — hak `glue` ma test w `shared`, a w przeglądarce do niego
  nie doszło: trzeba wrogiego LOD-a z tym efektem (Kraken) albo Superkleju w cudzym
  deku. (2) **Paf** — sprawdzony testem serwera, w oknie klikany był tylko Miecz. (3) **LOD
  przeciwprogramowy** (bije w losowy zrezowany Program zamiast w mózg) — cały przypadek pokryty
  testami, nieoglądany. (4) **Zderezowanie LOD-a przez gracza** i wypadnięcie go z kolejki —
  w oględzinach LOD schodził do REZ 10, nie do zera.

- **Etap 26b — dwie ścieżki nieodklikane; „Sieć 1/4" domknięte 15.08 przy 26c.** (1) **Ściana
  między netrunnerem a gniazdem** (`NET_WALL_BLOCKS`) — Poligon nie ma ścian na scenie
  „Strzelnica"; geometria to `hasLineOfFire` z 16b, ta sama, którą 16b odklikało. (2) **Odmowy
  `NET_NO_INTERFACE` i `NET_NO_DECK` w przeglądarce** — pokryte testami serwera, u MG nieoglądane
  (przycisk „Podłącz się" po prostu wraca z odmową). ~~(3) Budżet Akcji Sieciowych w trackerze~~
  — **odklikane 15.08**: w RUNDZIE 1 wiersz Kolca pokazał „Akcja 1/1 · Sieć 1/4" po pierwszej
  Akcji Sieciowej.

- **Etap 26a — jedna ścieżka nieodklikana.** ~~(1) Formularz „Obrona Sieci"~~ i ~~(2) ręczne
  budowanie architektury od zera~~ — **odklikane 22.08** (piąta sesja): wpis „Odźwierny testowy 27x"
  z REZ 12, Interfejsem 4, 2 Akcjami Sieciowymi i Wartością bojową 10 zapisał się, wrócił na karcie
  wpisu w komplecie (licznik kategorii 25 → 26) i został skasowany; „+ Nowa" otwiera pusty trzon
  („0 pięter · bez wyraźnego dna"), a „+ Piętro" dokłada piętra z wyborem zawartości. Zostaje
  (3) **pasek „Uwagi" pod szybem** (`netArchitectureAdvice`) — hasło bez PT i piętro LOD-u bez
  wpisu; generator zawsze wypełnia oba, więc do tego stanu trzeba dojść ręczną edycją.
  Sam tekst jest pokryty testem w `netrunning.test.ts`.

- **Etap 27c — dwie ścieżki nieodklikane, obie skrajne.**
  (Strona gracza → odklikana 22.08, patrz `archiwum/zamkniete-zaleglosci.md`.)
  (1) **Postać wychodząca prosto z kreatora** — sprawdzona była karta, w którą Ścieżkę wpisano
  ręcznie; przepływ „kreator wypełnia 17 pytań → strona druga je pokazuje" idzie tym samym
  polem `data.lifepath`, więc rozjazd jest nieprawdopodobny, ale nie był oglądany.
  (2) **Wąskie okno** — `@container (max-width: 560px)` zwęża rubryki do jednej kolumny
  i zmniejsza pudełka gniazd; okno karty ma `min(1180px, 100vw − 32px)`, więc do tego progu
  trzeba ekranu poniżej ~600 px, a `resize_window` na zmaksymalizowanym oknie nic nie daje.

- **Etap 27c — rozbicie gniazd per pudełko sylwetki nieodklikane.** Poprawka z 22.08 (rodzina
  z więcej niż jednym pudełkiem dostaje pod wierszem „Prawa cyberręka: 2 / 4 · Lewa: 0 / 4”)
  ma cztery testy w `cyberware.test.ts` i nikt jej nie widział — do obejrzenia na karcie
  z chromem w obu rękach.

- **Etap 25c — jedna ścieżka nieodklikana.** ~~(1) Wgranie portretu w kreatorze~~ —
  **zamknięte 23.08 inaczej, niż zakładała pozycja**: portrety wgrywa dziś wyłącznie MG do puli
  kampanii, a kreator wybiera z niej (`PortraitPicker`). Patrz `archiwum/zamkniete-zaleglosci.md`. (2) **Druga sztuka tego samego przedmiotu** w koszyku (chip „×2"
  i wiersz „nazwa ×2" w audycie) — **odklikane 22.08** z konta gracza: dwa kliknięcia w „Średni
  pistolet" dały chip „×2", wiersz „Średni pistolet ×2 — 100 ed" i budżet 500 → 400 ed.
  (Odmowa poziomu i krok wyposażenia u gracza — **odklikane 22.08**, patrz pozycja zbiorcza.)

- **Etap 25a — cztery ścieżki nieodklikane.** (1) **Odmowa serwera przy przepełnionej puli** —
  „Utwórz postać" jest wyszarzone, więc do `CREATION_INCOMPLETE` w przeglądarce się nie dojdzie;
  pokryte testem serwera. (2) **Degradacja bez `creation.json`** — kreator ma wtedy powiedzieć
  „Brak danych tworzenia postaci…" zamiast pustego okna (`CREATION_DATA_MISSING`); w repo jest
  próbka publiczna, więc ten stan wymagałby skasowania obu plików. ~~(3) **Wybór właściciela przez MG**~~ —
  **odklikane 14.08 przy 25b**: MG utworzył postać z listy „NPC (MG) / Tony / avatar9 / Marcin"
  i w bazie stanęła z właścicielem **Marcin**. (4) **Rangi Postaci inne niż „początkująca"** — selektor
  pokazuje pięć pozycji (50–80 pkt), klikana była tylko domyślna 62.

- **Etap 27b — wiersz rany krytycznej nieoglądany na wydruku i w motywie dziennym.** Sam panel
  odklikany 22.08: nazwa, „+1 do Testu Przeżywalności”, pełny efekt i kosz, który ranę zdjął.

- **Etap 24c — cztery ścieżki nieodklikane.** (1) **Zdjęcie prasowe** — screamsheet przyjmuje
  grafikę handoutu i rysuje ją jako odbitkę gazetową (`grayscale`), ale przy oględzinach nic
  nie wgrywano. (2) **„Przerwij" w trakcie generacji** — przycisk pojawia się na czas pisania
  (`screamsheet:cancel`, pokryty ścieżką serwera), model odpowiadał jednak w 7 s i nie było
  czego przerywać. (3) **Edycja zapisanego screamsheetu** przez ✎ — formularz ma wtedy wziąć
  rodzaj z handoutu, a nie z przycisku (`handout?.kind ?? …`); klikane było tworzenie.
  (4) **Drugi generator pod rząd** — czy szkic nadpisuje pola, w których MG już coś poprawił
  (nadpisuje: takie jest zachowanie `takeDraft`).

- **Etap 24c — polszczyzna 9B, nie kod.** W artykule z oględzin padło „tłumek zmyślonych
  bogaczy" i „krzyki prosić o pomoc" — model gubi odmianę w dłuższych zdaniach. Przy
  temperaturze 0,9 (świadomie wysokiej: brukowiec ma zmyślać) będzie się to zdarzać częściej
  niż u kronikarza z 19c. Jeśli przeszkadza, pierwszą rzeczą do ruszenia jest
  `SCREAMSHEET_TEMPERATURE` w `packages/shared/src/screamsheets.ts`.

- **Etap 24b — trzy ścieżki nieodklikane.** (1) **Oś czasu przez granicę miesiąca i roku** —
  w kampanii są dwa wpisy, oba z sierpnia 2026, więc widziany był jeden nagłówek grupy; podział
  pokrywa test w `shared`. (2) **Powtórne odsłonięcie wpisu** zostawia **drugą** linię na czacie
  (świadome: „udostępnienie jest zdarzeniem" — ta sama zasada co przy handoucie z 24a), sprawdzone
  testem, w przeglądarce nie. (3) **Limit 12 przypiętych materiałów** (`JOURNAL_HANDOUTS_MAX`) —
  w kampanii był jeden handout, więc chip ponad limit nie był klikany.

- **Etap 24b domknął przy okazji dwie zaległości 19c.** Widziane na żywo z **zatrzymanym**
  gatewayem: zapis wpisu zostawia chip „⟳ nieaktualny" i licznik „1 czeka na indeks" obok
  „Zaindeksuj wszystko", a panel pokazuje „brak połączenia z AI Gateway (fetch failed)" zamiast
  pustej karty. Nieodklikane zostaje samo **„Zakończ sesję"** przy leżącym gatewayu (ma wrócić
  `AI_UNAVAILABLE` po polsku) i **kosz przy wpisie** — ten drugi kliknięty w 24b i działa
  dwustopniowo („Usunąć?" → „Tak, usuń").

- **Etap 23b — trzy ścieżki nieodklikane.**
  (Karta przelewu u odbiorcy → odklikana 22.08, patrz archiwum.)
  (1) **Zakup pancerza i sprzętu** — sprawdzona tylko broń; wiersze pancerza
  (`spCurrent`, lokacja, kara) i sprzętu idą tą samą funkcją `purchasedSheetRow` i mają test
  w `shared`, ale w przeglądarce nie były klikane. (2) **Wpis bez ceny liczbowej** — „Kup" ma być
  wtedy wyszarzony, a cena ma się liczyć z pasma; w kompendium kampanii wszystkie oglądane wpisy
  miały cenę. (3) **„Znaleziony — montaż N ed"** przy cyborgizacji (s. 375) — przycisk istnieje
  i jest pokryty testem, klikany był tylko wariant pełnopłatny.

- **Maszynopis wypowiedzi NPC-a (09.08) nieodklikany w przeglądarce.** Efekt jest czysto
  wizualny, więc żaden test go nie pokrywa. Do sprawdzenia przy stole: (1) **tempo** — 15 zn/s,
  czyli typowa wypowiedź 1–4 zdań pisze się 10–20 s; jeśli to za wolno albo za szybko, zmienia
  się jedną stałą `CHARS_PER_SECOND` w `packages/client/src/typewriter.ts` (obok
  `MAX_DURATION_MS` = 12 s, twardy limit na linię). (2) **Granica słowa** — tekst ma przyrastać
  całymi wyrazami, nie literami. (3) **Dwa boty pod rząd** — druga wypowiedź czeka, aż pierwsza
  się dopisze. (4) **Przełącznik „⌨" w górnym pasku** — wyłączony pokazuje wypowiedzi od razu,
  także tę, która właśnie się pisze; ustawienie przeżywa przeładowanie strony. (5) **Historia
  i resync** — linie wczytane z historii nigdy się nie animują.

- **Etap 20b — CAŁY etap nieodklikany w przeglądarce i niezmierzony na żywym modelu.** Kod jest
  pokryty 20 testami serwera na żywych gniazdach i 29 w `shared`, ale atrapa gatewaya odpowiada
  natychmiast i zawsze poprawnym JSON-em, więc **nie wie się nic o jakości decyzji 9B**. Do
  sprawdzenia przy stole, po kolei: (1) **„🤖 Graj turę"** — przycisk pojawia się sam obok ▶
  w górnym pasku i w wierszu zakładki „Walka", ale **tylko przy figurze, której karta postaci
  jest przypisana do bota**; na Poligonie trzeba więc najpierw komuś (np. Kai) podpiąć bota.
  (2) **Czy bot wybiera sensownie** — czy podchodzi, zanim strzeli, i czy nie strzela do
  sojusznika; strona bota to `data/private/bot-decisions.jsonl` z polami `figures` i `weapons`,
  czyli dokładnie tym, co model dostał w menu. (3) **Dwa kroki tury** — pierwszy ruch, drugi
  atak; w śladzie MG widać „krok 1 z 2" i „krok 2 z 2". (4) **Tryb propozycja** — karta na
  czacie z podsumowaniem („Atak: Rico — Zgrzyt 9"), a po „Zatwierdź" **druga karta na krok 2**.
  (5) **Czas całej tury** — jedyne kryterium etapu, którego nie da się odhaczyć bez GPU;
  szacunek to ~2 s (dwa przebiegi po 0,50–1,10 s z 20a), limit z etapu 11 to 20 s.
  (6) **Ruch po ścianach** — trasa liczy się A-gwiazdką na serwerze z `movementSegments`, więc
  bot nie powinien przejść przez mur; na Strzelnicy nie ma ścian, trzeba oglądać na scenie,
  która je ma. ~~(7) Strona gracza~~ — **odklikane 10.08**: gracz zatwierdził propozycję bojową
  bota ze swojego ekranu (linia „ZATWIERDZONE — AVATAR9" na czacie).

- **Etap 20a — jedna ścieżka nieodklikana.** **Tryb „kontrolowany"** — bot ma tylko mówić i nie
  dotykać mechaniki; pokryte testem (przebieg decyzyjny w ogóle nie dociera do modelu), w przeglądarce
  nieoglądane. ~~Sterowanie propozycją przez gracza i „Odrzuć"~~ — **odklikane 10.08**: gracz
  zatwierdził propozycję rzutu na Percepcję i **odrzucił** propozycję rzutu na Atletykę ze swojego
  ekranu (linie „ZATWIERDZONE — AVATAR9" i „ODRZUCONE — AVATAR9" na czacie).

- **Etap 20a — gdy bot „nie chce rzucić", zajrzyj do dziennika decyzji.** Przy oględzinach „Kolec, rzuć
  na Wygadanie" wróciło jako „rozmowa" — i słusznie: **„Wygadanie" nie jest umiejętnością CP RED**, a Kaya
  nie ma żadnej umiejętności perswazji. `data/private/bot-decisions.jsonl` (gitignore, jedna linia JSON
  na decyzję) ma pole `options` z pełnym menu, które bot dostał — to zwykle wystarcza za diagnozę.

- **Etap 19c — cztery ścieżki nieodklikane.** (1) **Mapowanie-redukcja na żywym modelu**: w przeglądarce log miał 4 wypowiedzi, czyli jedną porcję; podział na porcje jest pokryty testem serwera z ciasnym kontekstem (`journal.test.ts`, atrapa raportuje 2048 tokenów) i testem czystej funkcji w `shared`, ale na 32k modelu wymagałoby kilku tysięcy linii czatu. (2) **Relacja u gracza**: sprawdzona na żywym modelu skryptem A/B na tym samym prompcie (wrogi / przyjazny / bez relacji — odpowiedzi różnią się tonem nie do pomylenia) i testem serwera, ale **nie z konta gracza w przeglądarce** — wszystkie postacie w kampanii to „NPC (MG)", a relacja wiąże się z postać gracza. (3) **Kosz przy wpisie dziennika** (dwustopniowy, jak w 19b) i **„+ Wpis ręcznie"** — formularz nie był otwierany. (4) **Degradacja z martwym gatewayem**: „Zakończ sesję" ma wrócić z `AI_UNAVAILABLE` i po polsku — pokryte testem dymnym, w przeglądarce nieoglądane.

- **Etap 19b — trzy ścieżki nieodklikane.** (1) **Degradacja z martwym gatewayem**: zapis wpisu ma zostawić chip „⟳ nieaktualny" i licznik „N czeka na indeks", a „Zaindeksuj wszystko" po powrocie gatewaya ma go zdjąć — pokryte testami dymnymi (`knowledge.test.ts`), w przeglądarce nieoglądane. (2) **Filtr tagów u bota**: sprawdzone, że bot **bez** dostępu nic nie dostaje i że bot **z** dostępem dostaje wpis; nieoglądany przypadek pośredni — bot z tagiem, który nie pasuje do żadnego wpisu (test to pokrywa). (3) **Kosz przy wpisie** pyta dwustopniowo („Usunąć?" → „Tak, usuń") i nie był klikany — usunięcie wpisu ma też zabrać go z indeksu.

- **Jakość polszczyzny modelu, nie kodu:** przy sprawdzaniu odpowiedzi bez wiedzy model powiedział „w moim pamięci nic mi o tym nie mówi" i „w moim wymiarze pojęcia…". To 9B, nie błąd promptu — ale jeśli takie potknięcia będą się powtarzać przy stole, warto rozważyć wniosek MG („Mów poprawną polszczyzną") jako lekcję albo wzmocnić zasadę 3.

- **Etap 19a — dwie ścieżki nieodklikane po poprawce.** (1) **Powtórka bez rozumowania**: pytanie, przy którym model przemyśli całą pulę tokenów, ma teraz wrócić z odpowiedzią i przypisem „rozumowanie zajęło cały limit… pytanie poszło jeszcze raz bez rozumowania" — poprawka weszła po tym, jak błąd się pokazał, i nie została obejrzana na żywym modelu (pokryta testem `rules.test.ts`). Pytanie, które to wywołało: „Jak działa korzystanie z osłony w walce i co daje osłona?". (2) **Degradacja**: panel z zatrzymanym gatewayem ma pokazać „brak połączenia z AI Gateway", a nie pustą kartę. (3) Kosmetyka: pytanie o **PT strzału z odległości** to jedyne z zestawu pomiarowego, które nie trafia w tabelę PT — tabela jest w indeksie, ale wygrywają z nią sąsiednie akapity.

- **⚠️ ZANIM ODHACZYSZ COKOLWIEK NIŻEJ: przeczytaj `docs/testy/sesja-testow-walki-2026-08-08.md`.**
  Sesja 08.08 zbudowała **gotowy poligon testowy** (kampania „Poligon bojowy", scena
  „Strzelnica", pięć uzbrojonych figur — nie buduj go od nowa) i **odklikała dużą część list
  poniżej**: całe 16d (poza rzutem obrażeń obszaru), punkty 1–6 z 16g, tryb turowy u MG, ruch
  i budżet, atak z mapy, PT z odległości, obrażenia, ablację pancerza, „Cofnij", ogień ciągły
  i zaporowy oraz menu kontekstowe tokenu. Plik zawiera też **plan dokończenia** (16h, osłony,
  zwarcie, Test Przeżywalności, strona gracza), trzy znalezione błędy i — ważne — **korektę
  dwóch „pułapek dev"**: menu kontekstowe _działa_ (nie dowozi go tylko `right_click` z CDP),
  a `window.confirm` da się przechwycić i nie zawiesza sterowania.
  **Druga sesja tego samego dnia** domknęła: resztę 16h (usypiająca, EMP, dym, „Minęła
  minuta", poprawka naboju inteligentnego, formularz amunicji w kompendium), **całe osłony
  16c u MG** (poza „usuń wszystkie"), **etap 15 — śmiertelne rany, Test Przeżywalności,
  śmierć i Ustabilizowanie od zera**, **Pochwycenie z „Broń się"** z 14d, monity początku
  tury z 14e i zakładkę „AI". Doszły błędy **#7** (etykieta odchylenia granatu) i **#8**
  (klik narzędziem osłon przecieka do warstwy gry) — **oba naprawione 22.08**.
  Ustalenie ważne dla reszty list: **odmowy statusowe są u MG niesprawdzalne** —
  `realtime/movement.ts:216` zwalnia MG z blokad, więc wszystko, co „ma odmówić ruchu",
  trzeba oglądać na koncie gracza.
  **Odklikane 27.08 na koncie `Tester`:** żeton gracza ze statusem **Nieprzytomny** nie ruszył
  się z miejsca, na czacie stanęło „Nieprzytomny token nie może się poruszać.", a wszystkie
  Akcje w panelu postaci były wyszarzone.

- **Etap 16e — zostały cztery ścieżki z dziesięciu.** **Odklikane 22.08** (piąta sesja, scena
  testowa „Korytarz 16e" ze ścianą w kształcie L, skasowana po oględzinach): (2) **obejście rogu**
  — trasa poszła 30,6 m wzdłuż ściany, opłynęła jej koniec i wróciła 18,4 m do celu, zamiast
  przeciąć mur; (4) **kursor nad czernią** — u gracza trasa przestaje być liczona i zostaje
  niebieska prosta z ✖ i licznikiem („22,8 m"); (5) **Esc w trakcie marszu** — na czacie stanęło
  „Marsz przerwany." i **„Akcja Ruchu — 12,8 m ścieżki"**, czyli zapłacone za przebyty odcinek,
  nie za porzucony plan; (7) **Shift+klik** — żółty punkt załamania i dwa podpisane odcinki
  („10 m", „14,1 m") z sumą przy ✖; (8) **PPM w puste** — zaznaczenie znika, pasek wraca do
  „Kliknij token, którym chcesz sterować."; (9) **przeciąganie tokenu** (regresja) — figura
  przejechała przez pół sceny i ruch został zaksięgowany.
  **Odklikane 23.08** (sesja pasów zasięgu, gracz avatar9 na „Poligonie"): (3) **klik za zasięgiem
  tury** — trasa jest cięta na granicy budżetu, klik daleko poza nią przeszedł **10 m / 10 m**
  z komunikatem „Koniec ruchu w tej turze", a ogon poza budżetem jest wygaszony kolorem
  (bursztyn = zasięg Biegu, szary = poza turą). ✖ na granicy **nie ma** — MG kazał go zdjąć,
  bo granicę widać kolorem.
  **Odklikane 23.08 przez MG:** (10) **token 2×2 obok ścian** — po naprawie planera (opis
  w `archiwum/zamkniete-zaleglosci.md`) figura obchodzi mur zamiast przez niego przechodzić.
  Werdykt MG: „w miarę ok, tylko odrobinę za blisko przechodzi ściany" — **zaakceptowane**,
  patrz pozycja o marginesie niżej.
  **Zostało:** (1) odsłanianie mgły w trakcie marszu; (6) przerwanie marszu przez NPC
  wychodzącego zza rogu.

- **🟡 ZAAKCEPTOWANE (MG, 23.08) — figura przechodzi odrobinę za blisko ścian.** Po naprawie
  trasy 2×2 mur jest omijany poprawnie, ale margines bywa ciasny: żeton potrafi otrzeć się
  o ścianę. **Powód jest w projekcie, nie w błędzie:** planer pyta o **środki kratek** — zarówno
  `isNodeOpen` (środek każdego pola footprintu), jak i `laneClear` (linia przez środek pola) —
  a nie o **obrys** figury, który sięga jeszcze pół kratki dalej. Trasa może więc legalnie musnąć
  ścianę na do pół kratki (1 m). Tak jest **celowo**: dokładnie te same punkty sprawdza serwer
  (`firstBlockedStep`/`footprintLanes`), więc podgląd i werdykt nie mają jak się rozjechać.
  **Zwężenie marginesu wymaga zmiany po obu stronach naraz** — planera w `shared` i walidacji
  ruchu na serwerze — i albo testu obrysu zamiast środków, albo wciągnięcia footprintu o kilka
  procent. MG uznał obecne zachowanie za akceptowalne; ruszać tylko, gdy zacznie przeszkadzać
  przy stole.

- **Kliknięcie w token było zepsute dla graczy od 18a — naprawione w 16e, ale zaległości oględzin z tego okresu warto powtórzyć.** Warstwy przykrywające przechwytywały hit-test (szczegóły w `pulapki-dev.md`), więc gracz na scenie z dynamiczną widocznością **nie mógł kliknąć ani przeciągnąć żadnego tokenu**. To prawdopodobnie realna przyczyna części pozycji zbiorczej „strona gracza" (zamknięta 22.08, `archiwum/zamkniete-zaleglosci.md`) — przy jej odhaczaniu sprawdź najpierw, czy rzecz w ogóle dawała się kliknąć.

- **70 broni markowych ma opisy po angielsku** (nie 35 — ta liczba brała się z komunikatu skryptu „35 już w pamięci podręcznej"). Angielskie opisy ma **wyłącznie** `weapons.json`; pozostałe 271 wpisów kompendium jest po polsku. **Skrypt był 21.08 pułapką i został naprawiony**: kwalifikował do tłumaczenia każdy wpis bez `descriptionOriginal`, czyli **341** — w tym 271 polskich, które model dostałby do „przetłumaczenia z angielskiego". Teraz `looks_english()` odsiewa je (`--check` mówi: 70 do zrobienia, 271 pominięto). Zostaje sam przebieg `tools/import/translate-descriptions.py` przy włączonym llama-serverze (`pwsh ai-gateway/scripts/start-gateway.ps1`, potem `uv run --with httpx python tools/import/translate-descriptions.py`). Bez GPU się nie da, więc czeka na sesję z gatewayem.
- **Etap 09 — zakładka „AI" u MG niezweryfikowana wizualnie** (sesja toczyła się na koncie gracza). Późniejsze etapy oglądały u MG inne zakładki, więc to prawdopodobnie martwa zaległość — sprawdź przy okazji.
- **Ślad ścieżki przy przeciąganiu nieobejrzany**: `left_click_drag` z CDP jest natychmiastowy, więc łamana z licznikiem metrów rysuje się i znika między klatkami. Do sprawdzenia ręcznie — myszą.
- **`data/private/rulebook/manual/tabela-ran-krytycznych.md` jest poza repo — ale od 27.08 nie
  jest już nikomu potrzebny.** Kompendium ma dziś **obie** tabele 2k6 (11 ran korpusu + 11 głowy,
  s. 187–188) prosto z podręcznika przez `parse-manual.py`; ręczna tabela obsługuje wyłącznie
  wariant „mam sam Easy Mode". Zostawione jako **ostrzeżenie**, nie zadanie: patrz
  `archiwum/zamkniete-zaleglosci.md` (bezpiecznik przed nadpisaniem i wzór formatu w
  `data/public/cpred/tabela-ran-krytycznych.wzor.md`).
