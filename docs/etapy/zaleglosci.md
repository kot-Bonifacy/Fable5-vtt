# Otwarte zaległości (dług oględzin i drobne braki)

Lista rzeczy **otwartych**, przenoszona między etapami; wyprowadzona z `POSTEP.md` 22.08.2026,
żeby nie obciążała pliku czytanego na starcie każdej sesji. Czytaj ją, gdy siadasz do
odhaczania zaległości albo dotykasz etapu, który tu występuje — nie rutynowo.

Zamknięte pozycje — z całą diagnozą i opisem naprawy — są w `archiwum/zamkniete-zaleglosci.md`.

## Pozycje

- **Statysta nie ma skąd być załatany ani wyleczony (30.08).** Serwer to umie — `treatableInjuries`
  czyta `combatProfile`, `applyTreatment` zapisuje z powrotem do żetonu — ale formularz stoi
  wyłącznie przy wierszu rany **na karcie postaci**, a figura bez karty żadnej listy ran nie
  pokazuje. Wieżyczka z „Odciętą dłonią" (30.08) nosi ranę, której nikt nie zdejmie inaczej niż
  ręką w bazie. Do zrobienia razem z pierwszym etapem, który tknie pasek figury bez karty.

- **Przeładowanie statysty w trwającej walce (30.08).** Pudełko „Przeładuj" stoi na pasku figury
  bez karty i gaśnie przy pełnym magazynku — ale że **kosztuje Akcję**, sprawdzone jest tylko
  testem serwera. Do odklikania przy pierwszej walce turowej na poligonie, razem z Celowaniem
  w statystę (trzy strzały 30.08 były pudłem, więc „zdanie zamiast rany" nadal nieoglądane).

- **Etap 29a — obejrzana połowa.** 30.08 (trzecia sesja) przy okazji 29b sprawdzone i zamknięte:
  **panel „Awans"** (nagłówek „N PD w zapasie", wiersz Zdolności nad listą Umiejętności,
  przewijana lista z nagłówkami kategorii), **cena ×2** („Broń ciężka ×2 · 40 PD"), **rejestr
  awansów** (data, etykieta, kwota ze znakiem, stan po operacji) i **wyszarzony wybór Roli
  u gracza**. Zostaje do sprawdzenia: (1) **guzik „Podnieś"** — poziom rośnie na stronie
  pierwszej, licznik PD spada, a wiersz w rejestrze pojawia się bez przeładowania; (2) **filtr
  „tylko na które mnie stać"**; (3) **brak PD** — guzik wyszarzony z podpowiedzią „Brakuje
  N PD"; (4) **pozostałe pola tylko do odczytu u gracza** — poziom Umiejętności, ranga
  Zdolności i licznik PD nie przyjmują znaków, a **u MG te same pola dalej działają**;
  (5) **„✦ Przyznaj wszystkim"** w zakładce „Postacie" (tylko MG) — pole liczby, pole powodu,
  komunikat „Przyznano N PD — M postaci", a licznik rośnie każdej karcie gracza i **żadnemu
  BN-owi**.

- **Etap 29b — obejrzany od strony gracza, nie od strony MG.** 30.08 sprawdzone na karcie
  „Test 27x": sekcja „Rola" w panelu Awansu, zakup drugiej Roli za 60 PD, dwa wiersze Zdolności
  („Zdolności Specjalne" w liczbie mnogiej), oba panele Zdolności obok siebie na stronie
  pierwszej, chromowa plakietka rangi poprzedniej Roli, tytuł karty i wiersz w zakładce
  „Postacie" z **nową** Rolą, wiersz rejestru „Nomada — nowa Rola (Moto 1) · −60 PD" i bramka
  zamykająca się po zmianie (Moto 1 < 4). Zostaje: (1) **darmowy powrót do Roli już posiadanej**
  — wymaga doprowadzenia bieżącej Zdolności do 4, więc kosztuje 540 PD samego przygotowania;
  (2) **rzut korzystający ze Zdolności poprzedniej Roli** — np. „Moto N" w rozbiciu karty rzutu
  Prowadzeniem u postaci, która Nomadą **już nie jest**; (3) **ręka MG** — pole rangi przy
  poprzedniej Roli (u gracza tylko do odczytu) i odmowy `ROLE_TWICE` / `UNKNOWN_ROLE` przy
  ręcznym wpisie.

- **Etap 30d nie był oglądany w przeglądarce.** Mechanika jedzie w testach (38 nowych
  w `shared`, 13 na serwerze), ale żadnego z tych czterech paneli nikt nie kliknął. Do
  sprawdzenia — potrzebne postaci z Rolą **Rocker**, **Fixer**, **Nomada** i **Media** (na
  scenach testowych nie ma żadnej): (1) **panel Efektu Charyzmy** — przełącznik „Zrób z nich
  fanów / Poproś fanów o przysługę", trzy wiersze z PT 8/10/12, wiersz „Duża grupa" wyszarzony
  przy randze ≤2 zdaniem „To żart, prawda?"; (2) **karta rzutu Rockera** — „Fani to zrobią /
  Odmowa" z PT i zdaniem z tabeli, a przy porażce z informacją o tygodniu; (3) **panel
  Znajomości** — chip dobitego targu z ✕, pole „Druga strona", sześć wierszy targów rosnących
  z rangą; (4) **zakup z targiem** — cena o 10% niższa, wiersz „Targ: … −10% · cena z katalogu"
  na karcie ekonomii i chip znikający po zakupie; (5) **panel Moto** — wiersz „+N do Testów:
  Prowadzenie…", lista Taboru z guzikiem „Dołóż wpis" gasnącym po wyczerpaniu awansów;
  (6) **rzut Prowadzeniem** — „Moto N" w rozbiciu karty rzutu; (7) **panel Wiarygodności** —
  wybór dowodów zmieniający szansę w nagłówku, guzik „Publikuj" i guzik „Pogłoski" **widoczny
  tylko dla MG**; (8) **karta Pogłosek** — szeptem, z nazwą pobitego progu.

- **Etap 30c nie był oglądany w przeglądarce.** Mechanika jedzie w testach (38 nowych
  w `shared`, 19 na serwerze), ale żadnego z tych ekranów nikt nie kliknął. Do sprawdzenia —
  potrzebne postaci z Rolą **Stróż Prawa** i **Korpo** (na scenach testowych nie ma żadnej):
  (1) **panel Wsparcia** pod wierszem Zdolności i pudełko „Wezwanie Wsparcia" w pasku akcji —
  lista kategorii rośnie z rangą, guzik „Wezwij" przy każdej, zdanie po nieudanym rzucie;
  (2) **karta rzutu na czacie** — „Ktoś odpowiada / Cisza w eterze" z arytmetyką i informacją,
  za ile Rund; (3) **wiersz „w drodze" pod Kolejką Inicjatywy** — chip „za N Rund", guziki MG
  „Postaw" i „Odwołaj", a przy randze 10 i szóstce lista wyboru drugiej grupy; (4) **przybycie**
  — figury stają przy wzywającym z paskiem PW i wchodzą do kolejki z rzuconą inicjatywą;
  (5) **odmowa uniku** — strzał w funkcjonariusza i guzik „Unik" na karcie ataku, który ma
  powiedzieć „Funkcjonariusze Wsparcia nie mogą Unikać pocisków"; (6) **panel zespołu Korpo** —
  „Wolne etaty", wybór zawodu, imię, „Zatrudnij", wiersz z Lojalnością, guzik „Test", rozwijana
  tabela zysków i strat, „Koniec sesji" i „Zwolnij"; (7) **karta pracownika** — Cechy z tabeli,
  pakiet Umiejętności, Lekka kurtka OB 11, B.C. pistolet, cyborgizacje w notatkach; u Netrunnera
  Rola „Netrunner" z rangą 2.

- **Wsparcie poziomu 10 nie pamięta „tej samej sprawy".** RAW: „po tym pierwszym wezwaniu na
  kolejne przybywają **ci sami** dwaj funkcjonariusze, dopóki wezwanie dotyczy tej samej
  »sprawy«, aż do jej zamknięcia lub śmierci tych funkcjonariuszy" (s. 159). VTT stawia za
  każdym razem nowe figury z pełnymi PW. Wymaga pojęcia „sprawy", którego projekt nie ma —
  najbliżej jest wątek dziennika kampanii z 24b. Zapisane, bo to jedyna kategoria, w której
  ciągłość jest zasadą, a nie kolorytem.

- **Wsparcie poziomu 10 nie rzuca Wartością bojową w piętnastu Umiejętnościach.** „Mogą oni
  wykorzystać swoją Wartość bojową w Testach poniższych Umiejętności: Aktorstwo, Atrakcyjność,
  Dedukcja…" (s. 159). Lista siedzi w `CpredBackupTier.skills` i jest wypisana w panelu, ale
  statysta nie ma skąd rzucić Umiejętnością spoza broni i Uniku (`combatProfileSkillLevel` zna
  dwa poziomy). Do zrobienia razem z pierwszym etapem, który da statyście rzut dowolną
  Umiejętnością.

- **Etap 30b nie był oglądany w przeglądarce.** Mechanika jedzie w testach (30 nowych
  w `shared`, 7 na serwerze), ale żadnego z tych ekranów nikt nie kliknął. Do sprawdzenia —
  potrzebne postaci z Rolą **Medyk** i **Technik** (na scenach testowych nie ma żadnej):
  (1) **panel Medycyny** pod wierszem Zdolności — trzy Specjalizacje, „Do rozdzielenia: N z N",
  guzik „+" wyszarzony przy szóstym punkcie Chirurgii; (2) **wiersz Umiejętności z Medycyny**
  („Chirurgia 6 · Technologia Medyczna 3") i dwa rozwijane bloki: farmaceutyki i drabina
  kriosystemów; (3) **panel Twórcy** — cztery Specjalizacje, sakiewka podwójna, oraz dwa bloki:
  dziesięć skutków Ulepszania i tabela PT/czasu; ~~(4) guzik „Lecz" przy ranie krytycznej~~ —
  **odklikany 30.08 (czwarta sesja)**: wybór, kto leczy (pacjent wypada z listy, bo samego siebie
  leczyć nie można), gałąź „Chirurgia PT 15" wyszarzona u nie-Medyka ze zdaniem „Chirurgia jest
  dostępna tylko Medykom w ramach Zdolności Specjalnej Medycyna"; (5) **⚒ Prowizorka** przy startym pancerzu (tylko
  Technikowi z Naprawą ≥ 1) i **⌫** kończące ją; (6) **⊕ +1 OB** — raz na sztukę.

- **Farmaceutyki nie mają zapasu dawek.** Panel drukuje pięć środków słowami podręcznika i mówi,
  ilu Medyk ma dostęp, ale który wybrał, wytworzenie dawki (Test PT 13, surowce za 200 ed)
  i podanie jej (Akcja, ewentualnie strzykawką bezigłową jako atak) prowadzi MG. Brakuje modelu
  przedmiotu zużywalnego — wiersz ekwipunku to wolny tekst bez licznika. Sensowne razem
  z etapem, który tknie ekwipunek.

- **Etap 30a nie był oglądany w przeglądarce.** Mechanika jedzie w testach (44 nowe w `shared`,
  10 na serwerze), ale żadnego z tych ekranów nikt nie kliknął. Do sprawdzenia — potrzebna
  postać z Rolą **Solo** (na „Strzelnicy" nie ma takiej, trzeba przestawić Rolę na karcie):
  (1) **panel na karcie** pod wierszem Zdolności Specjalnej — sześć wierszy, „Wolne punkty: N z 6",
  guzik „+" wyszarzony dokładnie tam, gdzie progu nie da się kupić; (2) **pudełko „Zmysł Walki"
  w pasku akcji** nad mapą — ma się pojawiać tylko Solo i **nie gasnąć** po zużytej Akcji;
  (3) **koszt Akcji**: zmiana przydziału w trakcie własnej tury zjada Akcję i pisze w logu, co
  na co poszło; zapis tej samej wartości nie kosztuje nic; (4) **karta obrażeń** po pierwszym
  ciosie Rundy ma mówić „− 2 (Redukcja obrażeń)", po drugim już nie; (5) **kafel „Fumble
  zignorowany (Wyjście z opresji)"** — trzeba wyrzucić jedynkę w Teście ataku, więc to kwestia
  kilku strzałów; (6) rozbicie rzutu z wierszami „Precyzyjny atak N" i „Wyczucie zagrożenia N".

- **Etap 27i — pomiar fps nie objął sceny ze światłami i mgłą.** „Strzelnica" ma widoczność
  `open`, więc 160,1 → 161,2 fps mierzy **samą warstwę efektów**, a nie najgorszy przypadek
  z kryterium etapu. Warstwa rysuje na klatkę kilka ścieżek `Graphics` i najwyżej jeden sprite,
  więc rezerwa jest duża — ale liczby dla sceny z dynamiczną widocznością nadal nie ma.
  **Decyzja MG z 28.08: pomiar idzie do etapu 27g**, a nie do najbliższej sesji zaległości —
  scena, na której się go robi, już stoi („Korytarz 16e", widoczność Dynamiczna).

- **Etap 24c — zostały dwie ścieżki, obie wymagają modelu.** ~~(1) Zdjęcie prasowe~~
  i ~~(3) edycja zapisanego screamsheetu przez ✎~~ — **odklikane 28.08**, patrz
  `archiwum/zamkniete-zaleglosci.md`. Zostają: (2) **„Przerwij" w trakcie generacji** — przycisk
  pojawia się na czas pisania (`screamsheet:cancel`, pokryty ścieżką serwera), model odpowiadał
  jednak w 7 s i nie było czego przerywać. (4) **Drugi generator pod rząd** — czy szkic nadpisuje
  pola, w których MG już coś poprawił (nadpisuje: takie jest zachowanie `takeDraft`).

- **Etap 24c — polszczyzna 9B, nie kod.** W artykule z oględzin padło „tłumek zmyślonych
  bogaczy" i „krzyki prosić o pomoc" — model gubi odmianę w dłuższych zdaniach. Przy
  temperaturze 0,9 (świadomie wysokiej: brukowiec ma zmyślać) będzie się to zdarzać częściej
  niż u kronikarza z 19c. Jeśli przeszkadza, pierwszą rzeczą do ruszenia jest
  `SCREAMSHEET_TEMPERATURE` w `packages/shared/src/screamsheets.ts`.

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
