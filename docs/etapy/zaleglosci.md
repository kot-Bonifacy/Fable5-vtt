# Otwarte zaległości (dług oględzin i drobne braki)

Lista rzeczy **otwartych**, przenoszona między etapami; wyprowadzona z `POSTEP.md` 22.08.2026,
żeby nie obciążała pliku czytanego na starcie każdej sesji. Czytaj ją, gdy siadasz do
odhaczania zaległości albo dotykasz etapu, który tu występuje — nie rutynowo.

Zamknięte pozycje — z całą diagnozą i opisem naprawy — są w `archiwum/zamkniete-zaleglosci.md`.

## Pozycje

- **🐞 BŁĄD — figura 2×2 planuje trasę **przez** ściany (klient, 22.08).** Na scenie testowej
  ze ścianą pionową ta sama droga wygląda inaczej dla dwóch figur: żeton **1×1** obchodzi mur
  (38 m wzdłuż niego, potem 16,1 m do celu), a żeton **2×2** dostaje podgląd trasy **przecinający
  obie ściany na wylot** (30 m · 2,8 m · 15,6 m). Serwer trzyma się zasad — marsz 2×2 kończy się
  po ułamku metra zamiast przejść — więc **kłamie sam podgląd**, a figura zatrzymuje się bez
  wyjaśnienia. `planWalk` w `shared` przechodzi test na tę sytuację (sprawdzone osobnym testem
  z ścianą na krawędzi kratek, oba rozmiary zdały), więc szukać trzeba **po stronie klienta**:
  `planWalkRoute`/`updateReach` w `MapRenderer.ts` (kotwica footprintu, `radiusCells`, wygładzanie)
  albo w tym, co `MapArea` podaje jako `canStep`. Blokuje ostatni punkt 16e (2×2 w metrowych
  drzwiach).

- **Kosz „usuń wszystkie osłony" kasuje bez pytania i bez cofnięcia.** `MapTools.tsx` woła
  `clearCovers(sceneId)` prosto z `onClick`, a scena potrafi mieć kilkanaście osłon budowanych
  przez pół sesji. Wszystkie inne kosze w aplikacji (wpis dziennika, handout, scena) pytają
  dwustopniowo. Sprawdzone 22.08: jeden klik zdjął „Samochód 25/25" i licznik od razu pokazał
  „brak osłon".

- **„Usuń" przy własnym wpisie kompendium też nie pyta.** Ta sama uwaga co wyżej, ta sama
  waga: wpis MG ginie jednym kliknięciem (sprawdzone 22.08 na wpisie testowym).

- **Biblioteka grafik tokenów nie ma kosza.** Raz wgrana grafika zostaje w zakładce „Tokeny"
  na zawsze — nie da się jej usunąć z UI, a plik zostaje w `uploads/tokens`. Przy oględzinach
  22.08 trzeba było skasować wpis wprost w bazie (`tokenAsset`) i plik z dysku.

- **Etap 27f — pusty stan listy postaci u gracza nieodklikany.** `'Nie masz jeszcze żadnej
  postaci.'` jest sprawdzony w kodzie i mówi tym samym językiem co pustka handoutów, ale na
  ekranie go nie było: avatar9 ma dwie postacie, a Tony i Marcin też mają swoje. Do zobaczenia
  trzeba dołączyć do stołu **nowym imieniem**, czyli założyć konto-śmiecia.

- **Etap 27f — okno większe od przeglądarki nieodklikane; reszta sprawdzona 21.08 (patrz
  notatka sesji).** Sprowadzanie na ekran sprawdzone na oknie, które się mieści; dla okna
  **większego** niż okno przeglądarki zostaje próg „róg zawsze do złapania" i tej gałęzi nikt
  nie oglądał. (Strona gracza → odklikana 22.08, patrz `archiwum/zamkniete-zaleglosci.md`.)

- **Etap 27i — trzy ścieżki nieodklikane; reszta sprawdzona 20.08 (patrz notatka sesji w `archiwum/dziennik-sesji.md`).**
  (1) **Wybuch, chmura gazu i wyładowanie strefy** — kod i oba arkusze CC0 sprawdzone
  (krojenie klatek zweryfikowane w przeglądarce), ale animacji nikt nie widział: na Poligonie
  nie ma postaci z granatem, a wejście na „Podłogę elektryczną" kosztuje 6k6. (2) **Liczba
  obrażeń nad figurą** — ta sama ścieżka co widziane „PUDŁO", różni ją jedna linia w
  `damageMapFx`. (3) **Dźwięki** — odtwarzane, ale nikt ich nie słyszał, a próbki dobrano po
  nazwach plików w paczkach CC0; rządek przycisków odsłuchu jest w „⚙ Ustawienia" właśnie po to.
  (Strona gracza → odklikana 22.08, patrz `archiwum/zamkniete-zaleglosci.md`.)

- **Etap 27i — pomiar fps nie objął sceny ze światłami i mgłą.** „Strzelnica" ma widoczność
  `open`, więc 160,1 → 161,2 fps mierzy **samą warstwę efektów**, a nie najgorszy przypadek
  z kryterium etapu. Warstwa rysuje na klatkę kilka ścieżek `Graphics` i najwyżej jeden sprite,
  więc rezerwa jest duża — ale liczby dla sceny z dynamiczną widocznością nadal nie ma.

- **Etap 27e — jedna ścieżka nieodklikana; reszta sprawdzona 20.08 i 22.08.**
  ~~(1) Ekran dołączenia do stołu~~ i ~~(2) Okno runa w Sieci od środka~~ — **odklikane 22.08**
  przy oględzinach z konta gracza (świeży link zaproszenia z Panelu MG, run na żywej kampanii).
  Zostaje (3) **Screamsheet** — lista handoutów Poligonu jest pusta; różnica jest tu **żadna
  z definicji**, bo `--paper` nie ma wariantu dziennego.

- **Etap 27d — trzy ścieżki nieodklikane; reszta sprawdzona 19.08 (patrz notatka sesji w `archiwum/dziennik-sesji.md`).**
  (1) **Złoty dorzut krytyka** — na zrzucie ekranu złapany został fumble (dwie kości w dwóch
  kolorach na stole), krytyka nie: 20% na rzut, a okno, w którym kość leży, trwa ~3 s. Ścieżka
  jest **ta sama**, różni ją jeden zestaw kolorów. (2) **Wyłączenie animacji i głośność 0** —
  obie prowadzą do wcześniejszego wyjścia z `playRollAnimation` / `playRattle` i były czytane
  w kodzie, nie klikane. (3) **Rzut Cech w kreatorze bez zielonych dziesiątek** — flaga `plain`
  ma test w `shared` i przechodzi przez serwer, ale kreatora nikt nie otwierał.

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

- **Etap 25c — dwie ścieżki nieodklikane.** (1) **Wgranie portretu w kreatorze** — przycisk
  widziany i naprawiony, ale pliku nie wgrywano; trasa to ta sama `/api/uploads/portraits` co
  na karcie z etapu 07. (2) **Druga sztuka tego samego przedmiotu** w koszyku (chip „×2"
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

- **Etap 16g — odklikany 08.08 poza dwoma punktami.** Zostają: (6) linia „pancerz −2" na karcie obrażeń i (7) **Podpalony** po amunicji zapalającej wraz z „Cofnij" gaszącym status. Reszta sprawdzona; przy okazji wyszły błędy #2, #3, #4 i #5. ~~Do sprawdzenia: (1) **wybór naboju** na wierszu broni w karcie postaci (nowy `select` w kolumnie „Amunicja"; ma pokazywać tylko naboje pasujące do tej broni, a przy Miotaczu ognia być wyszarzony); (2) **koszt zmiany naboju w walce** — poza walką zmiana jest darmowa, w turze ma zejść Akcja i magazynek ma się napełnić; (3) **chip naboju na slocie paska akcji** (fioletowa ramka obok „seria"/„zapora"); (4) **pomarańczowy stożek 6 m** chodzący za kursorem, gdy w ręku jest broń ze śrutem — i to, że **klik dalej celuje w figurę**, a nie w pole (inaczej niż granat); (5) **karta ataku** z listą trafionych w stożku i wierszem „zasłonięty ścianą"; (6) **karta obrażeń** z linią „nabój: … · pancerz −2 (zamiast −1)"; (7) **Podpalony** na tokenie po trafieniu zapalającą i „Cofnij" gaszące go; (8) kategoria **„Amunicja"** w zakładce Kompendium (chip z licznikiem, karta wpisu z „Pasuje do", edytor MG z polami naboju).~~ Kampanii nie ruszałem — wpisy amunicji i miotacz ognia są w `data/private`, na żadnej karcie postaci nic nie zostało dopisane, więc do oględzin trzeba komuś dać strzelbę.

- **Etap 16h — odklikany 08.08 poza jednym punktem.** Zostaje wyłącznie chip „na minutę — do rundy N" **na karcie postaci** (na karcie obrażeń jest). Reszta poniżej — sprawdzona, opisy zostawione dla kontekstu. ~~Do sprawdzenia: (1) **karta ataku gazem** — brak przycisku „Obrażenia", linia „test Odporność na tortury/narkotyki PT 13" i wiersze „nie oparł się — 2k6 bezpośrednich"; (2) **karta obrażeń** z linią „nabój: …" i przyciskiem **„Minęła minuta"** u MG (i to, że po kliknięciu przycisk znika, a PW zostają); (3) **statusy na tokenie** po amunicji usypiającej (Powalony + Nieprzytomny) i **ikona EMP** po nabojach EMP; (4) **rana krytyczna „na minutę"** na karcie postaci — nowy chip „na minutę — do rundy N" obok nazwy rany; (5) **kwadrat dymu** na mapie (szary, pod tokenami, z napisem „Dym −4”), a w rzucie z jego wnętrza **nazwany wiersz „Dym −4"** w rozbiciu; (6) **gumka dymu** przy narzędziu osłon (licznik „dymu: N" i kosz); (7) przycisk **„Popraw strzał 1k10+10"** po pudle o ≤ 4 amunicją inteligentną, wraz z ostrzeżeniem o Celowniku optycznym; (8) **edytor MG** wpisu amunicji z nowymi polami (test, porażka, dym, poprawka).~~ Kampanii nie ruszałem — wpisy amunicji są w `data/private`, więc do oględzin trzeba komuś dać granat i wpisać nabój przez Przeładowanie.

- **Etap 16d — odklikany poza jednym punktem.** Zostaje „zasłonięty: Samochód" na liście
  trafionych obszarem — wymaga granatu i figury za osłoną. ~~„Rzuć" zwykłą bronią~~ —
  **odklikane 22.08**: w zakładce „Walka" wiersz broni ma obok „Celuj" przycisk **„Rzuć"**,
  a klik w cel załadował kubek „Ciężki pistolet testowy → avatar9 · 22 m · PT 15" (PT z wiersza
  Granatnika, zgodnie z 16d). Pudło z odchyleniem, `Esc`, „Odskocz", „Zastosuj wszystkim"
  i regresja 16e — sprawdzone 08.08.

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
  **Zostało:** (1) odsłanianie mgły w trakcie marszu; (3) klik za zasięgiem tury → ✖ na granicy
  budżetu i wygaszony ogon (u MG niesprawdzalne — `enforced: false`); (6) przerwanie marszu przez
  NPC wychodzącego zza rogu; (10) token 2×2 przy metrowych drzwiach — **zablokowane przez błąd
  trasy figur 2×2**, patrz pozycja niżej.

- **Kliknięcie w token było zepsute dla graczy od 18a — naprawione w 16e, ale zaległości oględzin z tego okresu warto powtórzyć.** Warstwy przykrywające przechwytywały hit-test (szczegóły w `pulapki-dev.md`), więc gracz na scenie z dynamiczną widocznością **nie mógł kliknąć ani przeciągnąć żadnego tokenu**. To prawdopodobnie realna przyczyna części pozycji zbiorczej „strona gracza" (zamknięta 22.08, `archiwum/zamkniete-zaleglosci.md`) — przy jej odhaczaniu sprawdź najpierw, czy rzecz w ogóle dawała się kliknąć.

- **70 broni markowych ma opisy po angielsku** (nie 35 — ta liczba brała się z komunikatu skryptu „35 już w pamięci podręcznej"). Angielskie opisy ma **wyłącznie** `weapons.json`; pozostałe 271 wpisów kompendium jest po polsku. **Skrypt był 21.08 pułapką i został naprawiony**: kwalifikował do tłumaczenia każdy wpis bez `descriptionOriginal`, czyli **341** — w tym 271 polskich, które model dostałby do „przetłumaczenia z angielskiego". Teraz `looks_english()` odsiewa je (`--check` mówi: 70 do zrobienia, 271 pominięto). Zostaje sam przebieg `tools/import/translate-descriptions.py` przy włączonym llama-serverze (`pwsh ai-gateway/scripts/start-gateway.ps1`, potem `uv run --with httpx python tools/import/translate-descriptions.py`). Bez GPU się nie da, więc czeka na sesję z gatewayem.
- **Etap 09 — zakładka „AI" u MG niezweryfikowana wizualnie** (sesja toczyła się na koncie gracza). Późniejsze etapy oglądały u MG inne zakładki, więc to prawdopodobnie martwa zaległość — sprawdź przy okazji.
- **Ślad ścieżki przy przeciąganiu nieobejrzany**: `left_click_drag` z CDP jest natychmiastowy, więc łamana z licznikiem metrów rysuje się i znika między klatkami. Do sprawdzenia ręcznie — myszą.
- **Etap 14d — została odmowa Uniku Ludzkiej tarczy**: karta testu spornego z „Broń się"
  u broniącego się gracza i odmowa ruchu Trzymanemu są **odklikane 10.08** (na czacie
  „Pochwycenie → Test P1 … Obrona Test P1: 5 → mimo wszystko udane" i „Odmowa: Pochwycony token
  nie może wykonać własnej Akcji Ruchu"). Zostaje `SHIELD_CANNOT_DODGE` („Ludzka tarcza nie może
  unikać ataków dystansowych") — wymaga **trzeciej figury na scenie**: ktoś musi strzelić do
  trzymającego, żeby tarcza w ogóle dostała przycisk „Unik". Na Strzelnicy są dwie figury.
- **`data/private/rulebook/manual/tabela-ran-krytycznych.md` jest poza repo** — na czystej maszynie trzeba go dostarczyć albo wpisać tabelę głowy w edytorze.

