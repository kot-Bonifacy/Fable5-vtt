# Otwarte zaległości (dług oględzin i drobne braki)

Lista rzeczy **otwartych**, przenoszona między etapami; wyprowadzona z `POSTEP.md` 22.08.2026,
żeby nie obciążała pliku czytanego na starcie każdej sesji. Czytaj ją, gdy siadasz do
odhaczania zaległości albo dotykasz etapu, który tu występuje — nie rutynowo.

Zamknięte pozycje — z całą diagnozą i opisem naprawy — są w `archiwum/zamkniete-zaleglosci.md`.

## Pozycje

- **Etap 27i — zostały same dźwięki.** ~~Wybuch~~, ~~liczba obrażeń nad figurą~~ (23.08),
  ~~chmura gazu~~ i ~~wyładowanie strefy~~ (28.08) — **odklikane**, patrz
  `archiwum/zamkniete-zaleglosci.md`. Zostają **dźwięki**: odtwarzane, ale nikt ich nie
  **usłyszał**, a próbki dobrano po nazwach plików i opisach w paczkach CC0. Rządek przycisków
  odsłuchu jest w „⚙ Ustawienia" właśnie po to i tej pozycji nie odhaczy nikt poza człowiekiem
  przy głośnikach. **Od 28.08 do przesłuchania jest 16 próbek, nie 13** — audyt tabeli `ICON_FX`
  wyłapał cztery rodzaje broni grające cudzym dźwiękiem i doszły **Cios pięścią**, **Miotacz
  ognia**, **Wyrzutnia** oraz nowa **Cięciwa** (szczegóły i licencje w
  `packages/client/public/sfx/ATTRIBUTION.md`). Wymiana próbki, która nie pasuje, to jeden plik
  w `public/sfx/` i jeden wiersz w `SFX_FILES`; kompletu pilnuje `sfx.test.ts`.

- **Etap 27i — pomiar fps nie objął sceny ze światłami i mgłą.** „Strzelnica" ma widoczność
  `open`, więc 160,1 → 161,2 fps mierzy **samą warstwę efektów**, a nie najgorszy przypadek
  z kryterium etapu. Warstwa rysuje na klatkę kilka ścieżek `Graphics` i najwyżej jeden sprite,
  więc rezerwa jest duża — ale liczby dla sceny z dynamiczną widocznością nadal nie ma.

- **Etap 27c — rozbicie gniazd per pudełko sylwetki nieodklikane.** Poprawka z 22.08 (rodzina
  z więcej niż jednym pudełkiem dostaje pod wierszem „Prawa cyberręka: 2 / 4 · Lewa: 0 / 4”)
  ma cztery testy w `cyberware.test.ts` i nikt jej nie widział — do obejrzenia na karcie
  z chromem w obu rękach.

- **Etap 25a — jedna ścieżka nieodklikana.** **Rangi Postaci inne niż „początkująca"** — selektor
  pokazuje pięć pozycji (50–80 pkt), klikana była tylko domyślna 62. (Wybór właściciela przez MG
  odklikany 14.08; dwie odmowy nieosiągalne z UI przeniesione 28.08 do
  `decyzje-i-uproszczenia.md`.)

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

- **Etap 23b — trzy ścieżki nieodklikane.**
  (Karta przelewu u odbiorcy → odklikana 22.08, patrz archiwum.)
  (1) **Zakup pancerza i sprzętu** — sprawdzona tylko broń; wiersze pancerza
  (`spCurrent`, lokacja, kara) i sprzętu idą tą samą funkcją `purchasedSheetRow` i mają test
  w `shared`, ale w przeglądarce nie były klikane. (2) **Wpis bez ceny liczbowej** — „Kup" ma być
  wtedy wyszarzony, a cena ma się liczyć z pasma; w kompendium kampanii wszystkie oglądane wpisy
  miały cenę. (3) **„Znaleziony — montaż N ed"** przy cyborgizacji (s. 375) — przycisk istnieje
  i jest pokryty testem, klikany był tylko wariant pełnopłatny.

- **Trzy drobiazgi UI z sesji 27.08 (pakiet D+A) — kosmetyka, nie błędy mechaniki.**
  (1) **Czerwony komunikat o braku gatewaya nie znika, gdy gateway wróci** — po kliknięciu
  „Zakończ sesję i streść" przy leżącym gatewayu zdanie „Brak połączenia z AI Gateway —
  streszczanie wymaga modelu." wisi w panelu dziennika także wtedy, gdy gateway już stoi;
  zdejmuje je dopiero kolejna akcja. (2) **Wiersz stanu indeksu łamie się w wąską kolumnę** —
  „3 wpisy czekają na indeks" renderuje się jako pięć linijek jedna pod drugą, bo w `.ai-status-main`
  nie mieszczą się trzy elementy plus przycisk. (3) **Górny pasek zachodzi sam na siebie przy
  wąskim oknie** — przy szerokości ~900 px „VTT — Cyberpunk RED", „Włącz tryb turowy" i nazwa
  kampanii nachodzą na siebie.

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

- **Etap 19c — dwie ścieżki nieodklikane; obie wymagają żywego modelu.** ~~Kosz przy wpisie
  i „+ Wpis ręcznie"~~ oraz ~~degradacja „Zakończ sesję"~~ — **odklikane 27.08**, patrz archiwum.
  (1) **Mapowanie-redukcja na żywym modelu**: w przeglądarce log miał 4 wypowiedzi, czyli jedną porcję; podział na porcje jest pokryty testem serwera z ciasnym kontekstem (`journal.test.ts`, atrapa raportuje 2048 tokenów) i testem czystej funkcji w `shared`, ale na 32k modelu wymagałoby kilku tysięcy linii czatu. (2) **Relacja u gracza**: sprawdzona na żywym modelu skryptem A/B na tym samym prompcie (wrogi / przyjazny / bez relacji — odpowiedzi różnią się tonem nie do pomylenia) i testem serwera, ale **nie z konta gracza w przeglądarce** — wszystkie postacie w kampanii to „NPC (MG)", a relacja wiąże się z postać gracza.

- **Etap 19b — jedna ścieżka nieodklikana.** ~~Degradacja z martwym gatewayem~~ i ~~kosz przy
  wpisie~~ — **odklikane 27.08**, przy okazji naprawiony błąd (reindeks nie zdejmował chipów
  z wierszy); patrz archiwum. Zostaje: **Filtr tagów u bota**: sprawdzone, że bot **bez** dostępu nic nie dostaje i że bot **z** dostępem dostaje wpis; nieoglądany przypadek pośredni — bot z tagiem, który nie pasuje do żadnego wpisu (test to pokrywa).

- **Jakość polszczyzny modelu, nie kodu:** przy sprawdzaniu odpowiedzi bez wiedzy model powiedział „w moim pamięci nic mi o tym nie mówi" i „w moim wymiarze pojęcia…". To 9B, nie błąd promptu — ale jeśli takie potknięcia będą się powtarzać przy stole, warto rozważyć wniosek MG („Mów poprawną polszczyzną") jako lekcję albo wzmocnić zasadę 3.

- **Etap 19a — dwie ścieżki nieodklikane po poprawce.** ~~Degradacja panelu~~ — **odklikana
  27.08** (chip „brak indeksu", czerwone „brak połączenia z AI Gateway (fetch failed)",
  podpowiedź „Model offline — uruchom AI Gateway"), patrz archiwum.
  (1) **Powtórka bez rozumowania**: pytanie, przy którym model przemyśli całą pulę tokenów, ma teraz wrócić z odpowiedzią i przypisem „rozumowanie zajęło cały limit… pytanie poszło jeszcze raz bez rozumowania" — poprawka weszła po tym, jak błąd się pokazał, i nie została obejrzana na żywym modelu (pokryta testem `rules.test.ts`). Pytanie, które to wywołało: „Jak działa korzystanie z osłony w walce i co daje osłona?". (2) Kosmetyka: pytanie o **PT strzału z odległości** to jedyne z zestawu pomiarowego, które nie trafia w tabelę PT — tabela jest w indeksie, ale wygrywają z nią sąsiednie akapity.

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

- **Etap 16e — zostały dwie ścieżki z dziesięciu.** **Odklikane 22.08** (piąta sesja, scena
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

- **Kliknięcie w token było zepsute dla graczy od 18a — naprawione w 16e, ale zaległości oględzin z tego okresu warto powtórzyć.** Warstwy przykrywające przechwytywały hit-test (szczegóły w `pulapki-dev.md`), więc gracz na scenie z dynamiczną widocznością **nie mógł kliknąć ani przeciągnąć żadnego tokenu**. To prawdopodobnie realna przyczyna części pozycji zbiorczej „strona gracza" (zamknięta 22.08, `archiwum/zamkniete-zaleglosci.md`) — przy jej odhaczaniu sprawdź najpierw, czy rzecz w ogóle dawała się kliknąć.

- **Etap 09 — zakładka „AI" u MG niezweryfikowana wizualnie** (sesja toczyła się na koncie gracza). Późniejsze etapy oglądały u MG inne zakładki, więc to prawdopodobnie martwa zaległość — sprawdź przy okazji.
- **Ślad ścieżki przy przeciąganiu nieobejrzany**: `left_click_drag` z CDP jest natychmiastowy, więc łamana z licznikiem metrów rysuje się i znika między klatkami. Do sprawdzenia ręcznie — myszą.
- **`ai-gateway/src/vtt_gateway/tts/` został po wycofanym etapie 12 — pytanie otwarte (MG, 27.08).**
  W repozytorium katalog jest **pusty** (`git ls-files` nic nie zwraca), na dysku leżą w nim same
  `__pycache__` z 08.08, czyli sprzed usunięcia kodu TTS. Nic tego nie importuje i nic się przez to
  nie psuje — koszt sprzątnięcia to jedno `rm -rf`, ale MG postanowił zostawić decyzję otwartą.
  **Nie kasuj bez pytania** i nie zgłaszaj tego jako nowego znaleziska.

