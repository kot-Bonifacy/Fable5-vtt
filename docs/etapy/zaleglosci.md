# Otwarte zaległości (dług oględzin i drobne braki)

**Zamknięte 25.09 (trzynasta sesja): karta czekająca na MG, okno z bliska (42a), kadr portretu,
reszta skóry chromu z automatu i trzy drobiazgi z `POMYSLY.md`.** Kreator przeszedł do końca
(`Tester`, Firefox) — pas „Czeka na MG”, 197 wyłączonych kontrolek i „Przyjmij do gry” odblokowujące
kartę na żywo z żetonem na scenie. Planer gracza obchodzi zamknięte okno z bliska w Dynamicznej.
Po drodze **błąd spoza listy: menu figury gasło w chwili otwarcia** (Chromium i Firefox, obie role)
— naprawione. Diagnozy w `archiwum/zamkniete-zaleglosci.md`.

**Zamknięte 25.09 (dwunasta sesja): kolejka, handel, drobne odmowy, sklep 3b — i Safari/iPad poza zakresem.**
**Decyzja MG z 25.09: Safari i iPada nie testujemy ani nie dostosowujemy** — wszystkie pozycje
„Safari/iPad” zdjęte z tej listy, nie wracaj do nich. Playwright MCP (MG w Chromium, `Tester`
i „Handlarz” w dwóch przeglądarkach) domknął: podwójny klik „Kończę turę” przy dwóch figurach gracza
pod rząd i pas 13 uczestników, **handel dwóch graczy** (przeciągnięcie myszą w Firefoksie ląduje za
pierwszym razem), `SELF_INSTALL`, „Zainstaluj” gracza bez podstawy, pistolet przy karabinie
w rękach (slot i dymek pod celownikiem), **kosz grupowy** z kartami, całe 3b (motyw dzienny karty
wpisu, wąskie okno, zakup przy wyjątku MG) i baner bez portretu. Po drodze **trzy błędy spoza
listy**: pas kolejki ucinał aktywnego na pierwszym miejscu, kursor paska trzymał schowaną broń,
a kosz grupowy pisał „2 kart”. Diagnozy w `archiwum/zamkniete-zaleglosci.md`.

**Zamknięte 25.09 (jedenasta sesja): favicona i oględziny, których automat z Chrome nie umiał.**
Playwright (biblioteka, prawdziwy kursor, okno na wierzchu) budzi `onAimHover` i nie dławi marszu,
więc domknął **dymek pod celownikiem z 41**, **całe 42b** (karta „Bariera zatrzymała cios” i napis
„BARIERA”), **całe 14.09** (przycięcie budżetem pod mgłą, przerwanie „ktoś w polu widzenia”, marsz
do końca) i odmowę wręcz przez siatkę z 42a. Z pełnego ekranu i zgody MG odhaczona większość.
Po drodze **błąd spoza listy**: okienko wyboru miejsca trafienia siadało na dymku celownika i zasłaniało
„Głowa bez ochrony” — od dziś stoi nad kursorem. Stos figur na jednej kratce to **decyzja MG, nie
błąd** (`decyzje-i-uproszczenia.md`). Diagnozy w `archiwum/zamkniete-zaleglosci.md`.

Lista rzeczy **otwartych**, przenoszona między etapami; wyprowadzona z `POSTEP.md` 22.08.2026,
żeby nie obciążała pliku czytanego na starcie każdej sesji. Czytaj ją, gdy siadasz do
odhaczania zaległości albo dotykasz etapu, który tu występuje — nie rutynowo.

Zamknięte pozycje — z całą diagnozą i opisem naprawy — są w `archiwum/zamkniete-zaleglosci.md`.

**Zamknięte 25.09 (dziewiąta sesja): strzykawka bezigłowa, `ruff format`, wyszarzona karta
czekająca na MG.** Zastrzyk siłą (s. 150) działa z karty guzikiem „Siłą” — obejrzany na
kampanii-śmieciu (pudło, dawka została). Po drodze wyszedł **błąd spoza listy**: okno edycji
żetonu z rozwiniętymi „Statystykami bojowymi” miało ~1100 px i chowało „Zapisz” pod krawędzią
ekranu — naprawione dla wszystkich dialogów (`.dialog` z limitem wysokości i przewijaniem).
Wsparcie 10 zostaje decyzją MG. Diagnozy w `archiwum/zamkniete-zaleglosci.md`.

**Zamknięte 24.09 (druga sesja): zaległości lokalnego LLM — na nowym modelu Qwen3.8-27B.**
MG przełączył model z Qwythos-9B Q8_0 na **Qwen3.8-27B UD-Q3_K_XL** (build 10735); wszystkie
oględziny poszły na nim. Odhaczone na żywym modelu: 19a (obie), 19b, 19c (obie — map-reduce na
sztucznym logu 2432 linii), 20a (tryb kontrolowany), **cały 20b** i 24c (obie ścieżki).
Znalezione i naprawione **trzy błędy**: gateway nie egzekwował budżetu myślenia na nowym buildzie
(pytanie o zasady — 30 s i pusta odpowiedź), **bot w walce przechodził przez ściany i siatki
stojące na liniach kratki** (podwójne pół kratki w `canStep` od 23.08) oraz niegramatyczna kotwica
relacji przy ±3. Do tego dwie poprawki promptów z A/B na żywo (relacja + podpis konta gracza,
zakaz powtarzania zdań) i nagłówek screamsheetu zwykłą pisownią (decyzja MG). Maszynopis zawężony
do tempa. Diagnozy w `archiwum/zamkniete-zaleglosci.md`.

**Zamknięte 13.09 (piąta sesja): zasłona figur 42c w komplecie i przerwany marsz cofający figurę
za róg.** Oględziny 42c domknięte na „Test Brak sceny": obejście końca bariery pod mgłą
i w Dynamicznej, odznaczenie „Zasłania figury" z karty. Po drodze wyszedł błąd spoza listy —
przerwanie „ktoś w polu widzenia" zaokrąglało figurę wstecz za róg, więc gracz utykał na końcu
bariery; naprawione (lądowanie na polu, w które figura wchodziła) i obejrzane. Z 42a i 42b
odhaczone: klamka bramy u gracza (z daleka, na kłódkę, otwarcie i zamknięcie), trasa
w Dynamicznej, zmiana rodzaju z karty segmentu i wygląd otwartej bramy na warstwie MG, brak pola OB
na karcie ściany, drzwi i okna. Decyzja MG do `POMYSLY.md`: planer gracza pod mgłą ma chodzić tylko
po odsłoniętym (kod na inną sesję). Diagnozy w `archiwum/zamkniete-zaleglosci.md`.

**Zamknięte 13.09 (czwarta sesja): planer gracza bez zwykłych ścian poza Dynamiczną.** Ściany jadą do
planera, pod mgłą przycięte do odsłoniętej podłogi (decyzja MG). Oględziny 42a–42c w tej samej sesji
wykazały **dwa regresy z 42c** — gracz na mgle albo scenie otwartej tracił trasę kliknięciem, a F5
obok bariery zasłaniającej gubił przeszkody planera — i usterkę układu pola „Zasłania figury";
wszystko naprawione i obejrzane. Trzy pozycje barier zawężone niżej (pozycja 42c przeniesiona z tego
nagłówka do „Pozycji"). Diagnozy w `archiwum/zamkniete-zaleglosci.md`.

**11.09 — decyzje MG do rzeczy zgłoszonych po sesji kamery (żeby nie wracały jako pytania):**

- **„Ani piksela czerni" zostaje.** Gracz przy maksymalnym oddaleniu nie obejmie całej mapy
  40 × 30 na szerokim oknie i **tak ma być** — „może sobie poprzesuwać albo odpowiednio rozciągnąć
  okno". Nie proponuj powrotu do wariantu „cała mapa z czarnymi pasami".
- **Mapa powitalna zostaje bez wyznaczanego punktu startu** — zawsze środek dolnej krawędzi.
  Tło nie ma wiersza w bazie, w którym MG mógłby punkt zapisać, i nikomu to nie przeszkadza.
- **Czarne pole gracza pod nieodsłoniętą mgłą jest zachowaniem, nie usterką** — ale czyta się jak
  awaria: MG sam „miał obawy, że jest zepsuta", patrząc na własną scenę z widocznością `fog`.
  Nic z tym nie robimy; warto o tym pamiętać przy oględzinach i przy pierwszej sesji z drużyną.
- **Usterka „MG widzi «Brak sceny» po własnej aktywacji" zostaje na tej liście** (wpis niżej) —
  MG ją przyjął; **naprawiona i obejrzana 12.09** — zamknięta, opis w archiwum.
- **Pełny plik „StrefyPrzemysłowej" (2896 × 2176) — nie teraz (decyzja MG z 12.09).** Siatka jest
  poprawiona wpisem „40 kolumn" (36,2 px) na obecnym pliku 1448 × 1086. Wgranie większego pliku
  **przesunie całą scenę**: wgranie ustawia rozmiar sceny na wymiary pliku, a figury, ściany, mgła,
  rysunki i światła leżą w pikselach świata — bez przeskalowania ×2 wszystko zjedzie do lewej
  górnej ćwiartki. Do tego ten plik nie dzieli się równo (72,4 px w poziomie, 72,53 w pionie).

**Zamknięte 13.09 (trzecia sesja): cztery drobne usterki z oględzin 13.09 i jeden błąd spoza listy.**
Odmowa strzału bronią spoza rąk ma dwa zdania — „Broń jest w kaburze — dobądź ją (bez Akcji)", gdy
broń mieści się w wolnych rękach (także obok jednoręcznej broni w drugiej ręce), i dotychczasowe, gdy
trzeba coś odłożyć (decyzja MG). Notka „Instaluję…" w kompendium czeka na odpowiedź serwera, a przy
odmowie mówi to samo co czat — dotyczy też „Dodaj za darmo". Drugi szkic screamsheetu nadpisuje pola,
ale pustym leadem niczego nie kasuje (decyzja MG). Szybki edytor 38a mówi prawdę o PW bez „Paska HP"
i przy Wartości bojowej blokuje Umiejętność, Unik i poziomy Testów — **Cechy zostają**, bo REF liczy
Inicjatywę. Spoza listy: okno edycji żetonu zawieszało „Zapisywanie…" po odmowie zasięgu widzenia.
**Nic z tego nie było oglądane w przeglądarce** — nowa pozycja niżej. Diagnozy w
`archiwum/zamkniete-zaleglosci.md`.

**Zamknięte 13.09 (druga sesja): nazwa figury w kartach czatu, zdanie „Minęła minuta" i „bez ran"
u gracza.** Karty czatu piszą alias figury u wszystkich, MG też (decyzja MG), a przy pustym aliasie
„Nieznajomy"; przy okazji okno przeszukania przestało pisać graczowi prawdziwą nazwę, a Czarny LOD
gubił alias przez zawężony typ żetonu. Zdanie „Minęła minuta … wraca: …" ma test na żywych gniazdach.
„Bez ran" obejrzane z konta Tony'ego w jego turze na „StrefiePrzemysłowej" — kolejka nieruszona.
Tej samej sesji na kampanii-śmieciu obejrzane: alias na czacie oczami gracza, szybki edytor 38a
z koszem pojedynczym, wyszarzony slot z 41 i odmowa `MISSING_FOUNDATION` u gracza — pozycje 38a,
41 i odmów montażu zostają otwarte z zawężonym zakresem. Cztery nowe drobne usterki w „Pozycjach".
Diagnozy w `archiwum/zamkniete-zaleglosci.md`.

**Zamknięte 13.09: cyberdek netrunnera Korpo i „Dodaj za darmo".** Pracownik z HR-u dostaje
prawdziwy deck z Programami z kompendium, a Programy bez wpisu lądują w notatkach karty. „Dodaj za
darmo" przy cyborgizacji zostaje, jak jest (decyzja MG), a tooltip mówi, że wszczep wchodzi bez Testu
montażu, ale z rzutem na Utratę Człowieczeństwa. Diagnozy w `archiwum/zamkniete-zaleglosci.md`.

**Zamknięte 12.09 (siódma sesja): Stym** — razem z Edytorem bólu (decyzja MG) i z błędem spoza
listy: stan ran statysty liczony z BC i SW zamiast z wydrukowanych PW. Oba obejrzane w przeglądarce
na kampanii-śmieciu; diagnozy w `archiwum/zamkniete-zaleglosci.md`. **Żadna nowa pozycja nie została
otwarta.** Dwie istniejące dostały dopisek z weryfikacji: „Dodaj za darmo" (w dużej części
nieaktualne) i cyberdek netrunnera Korpo (w bazie nie ma zespołów).

**12.09 (pełny ekran, zlecenie MG poza etapami): zostały (2) i (5) — ręką MG.** 25.09 (jedenasta) Playwright w widocznym oknie odhaczył (1), (3) i (4) w Chromium oraz (6) w Firefoksie — szczegóły w archiwum. Syntetyczne Esc z automatu nie dochodzi do obsługi przytrzymania w samej przeglądarce, a `window.confirm` automat zamyka sam, więc (2) i (5) zostają dla MG. Przełącznik
„Pełny ekran" (⚙ Ustawienia → Widok, `fullscreen.ts`) jest zrobiony i pokryty testami. W przeglądarce
odklikane: pole, podpowiedź w wariancie „przytrzymaj Esc", zapis w `localStorage`, guzik „⛶ Wróć do
pełnego ekranu" oraz wywołania `requestFullscreen` z automatu (klik i klawisz) przy aktywnym geście.
**Samego pełnego ekranu claude-in-chrome nie zobaczy** — Chrome odmawia schowanej karcie (pułapka
w `ogledziny`); Playwright (okno na wierzchu) widzi go normalnie. Lista kontrolna:
(1) zaznaczenie pola wchodzi od razu, odznaczenie wychodzi;
(2) krótkie Esc zamyka rzeczy w VTT (np. zdejmuje zaznaczenie figury), a przytrzymane wychodzi
z pełnego ekranu **bez** schodzenia po całej drabinie — **krótkie Esc sprawdzone 25.09** (przerwało
marsz w pełnym ekranie Chromium); **przytrzymane zostaje dla MG**;
(3) F5 → pierwszy klik wraca do pełnego ekranu, ale po wyjściu przytrzymanym Esc kolejne kliknięcia
**nie** wciągają z powrotem;
(4) wylogowanie wychodzi, zalogowanie i dołączenie wchodzą;
(5) okno `window.confirm` i wybór pliku portretu — czy zdejmują pełny ekran (niesprawdzone, może
zależeć od przeglądarki) — **zostaje dla MG**;
(6) Firefox: Esc wychodzi od razu, a podpowiedź pola mówi to wprost.
Na `http://217.154.210.181:8088` Keyboard Lock nie działa (brak HTTPS) i Esc wychodzi od razu —
to nie regres; zadziała na `vtt.tatanga.eu` po etapie 28.

**05.09 (etap 39 — efekty czasowe na Cechach):** etap **zamknięty w komplecie z oględzinami**
w tej samej sesji — pozycja „nie był oglądany" żyła kilkanaście minut. Przez przeglądarkę przeszły
wszystkie trzy kawałki UI (panel na karcie, małe pole „z" pod Cechą, chipy w pasku figury), obie
role (MG i `Tester` przez `[::1]:5173`), obie drogi liczby (wpisana i notacja `−1k6`), podłoga
Cechy, zdejmowanie ⌫, wygasanie skokiem zegara i **przeliczanie odliczania przy ruchu zegara**.
Znaleziona i naprawiona **jedna usterka układu**: pole „ile" miało 4,5 rem, przez co podpowiedź
„−2 albo −1k6" ucinała się na „−1k" — czyli gubiła dokładnie tę połowę, która mówi, że wolno
wpisać notację. **Żadna nowa pozycja nie została otwarta.** Ścieżka Czarnego LOD-u (Nerwosol
nakładający się sam) **nie była klikana w przeglądarce** — stoi na teście na żywych gniazdach
w `netcombat.test.ts`, a obejrzenie jej wymagałoby zbudowania na poligonie Sieci architektury
z Programem `statDrain`; uznane za nieopłacalne wobec pokrycia testem.

**05.09 (etap 33 — kopie zapasowe):** **żadna nowa pozycja nie została otwarta**, a etap
zamknięto w komplecie z oględzinami. Naprawiony po drodze **jeden błąd** (polski znak w nazwie
pobieranego pliku wywracał trasę eksportu błędem 500) i **jedna usterka układu** (polecenie
`restore` w podpowiedzi łamało się w środku słowa). Do sprzątnięcia ręką MG: dwa katalogi
`przed-przywroceniem-*` w `data/private/backups/`, zostawione po teście przywracania — kosz na
nie został w trakcie sesji odrzucony.

**04.09 (trzecia sesja):** zamknięte **trzy pozycje z `POMYSLY.md`** o cyborgizacjach — PT
montażu z Testem Chirurgii, odmowy „nie ma w co tego wszczepić" i EMP nazywający dwie wyłączone
cyborgizacje. Otwarte **dwie** pozycje, obie niżej: odmowy nieoglądane na koncie gracza oraz
„Dodaj za darmo", które omija cały montaż. Naprawione przy okazji **dwa błędy**: Borgizacje
liczone jak rodzina wymagająca podstawy (karta pisała nad Ramownicą „brak cyborgizacji
podstawowej") i **„Cofnij" zostawiające zegar statusu w `statusData`** po zdjętej naklejce.

**Zamknięte 04.09 (druga sesja):** paczka **„oczy i uszy"** — **wybuch i chmura gazu na mapie**,
**rzut obrażeń obszaru z 16d**, **„usuń wszystkie osłony" z 16c** i **przechylenie figury dla
stanu „nieprzytomny"**. Piąta pozycja — **dźwięki walki** — jest zmierzona, ale czeka na ucho MG
i została w `POMYSLY.md`. Przy okazji naprawiono **dwa błędy** (guzik „Obrażenia" przy amunicji
bez obrażeń; importer wycinający `thrown`, `maxRangeM` i `ammoIds`) oraz **jedno losowe
migotanie testu** (`bot-actions.test.ts` porównywał cuid z „bot"). Diagnozy i opisy napraw —
w `archiwum/zamkniete-zaleglosci.md`; **żadna nowa pozycja nie została otwarta**.

**Zamknięte 04.09:** **wszystkie cztery pozycje „etap 30x nie był oglądany w przeglądarce"**
— 30a, 30b, 30c i 30d przeszły przez przeglądarkę w komplecie, jedną kartą („Frank")
przestawianą kolejno na dziewięć Ról. Sześć znalezionych błędów naprawiono w tej samej sesji;
diagnozy i opisy napraw w `archiwum/zamkniete-zaleglosci.md`. Jedna pozycja została otwarta —
**cyberdek pracownika Korpo**, niżej.

**Zamknięte 03.09 (trzecia sesja tego dnia):** **farmaceutyki bez zapasu dawek**
i **Ustabilizowanie bez zasięgu**. Przy okazji doszło naturalne leczenie PW, którego projekt nie
miał wcale (wpis z `POMYSLY.md`). Diagnozy i opisy napraw w `archiwum/zamkniete-zaleglosci.md`;
jedna pozycja została otwarta — **Stym**, niżej.

**Zamknięte 03.09 (druga sesja tego dnia):** oba długi higieny — **czerwony `tsc --noEmit`**
na serwerze i **losowo padający zestaw testów**. Migotanie miało **cztery** przyczyny, nie jedną;
diagnozy i opisy napraw w `archiwum/zamkniete-zaleglosci.md`.

**Zamknięte 02.09 (druga sesja tego dnia):** trzy błędy z oględzin etapów 31 i 32 — wybór
amunicji dla broni podwieszanej, nazwa dodatku w chmurce nad celem i odmowa `character:update`
zostawiająca na karcie wartość, której nie ma w bazie. Wszystkie naprawione **i obejrzane
w przeglądarce**; diagnozy i opisy napraw w `archiwum/zamkniete-zaleglosci.md`.

## Pozycje

- **24.09: rzuty kreatora przez kubek — do oceny MG przy stole.** Obejrzane automatem (łańcuch
  Cech i Ścieżki, przerzut MG, skrót MG). **Zostają ręką MG:** (1) **dźwięk „kubek gotowy” po
  każdym rzucie łańcucha** — gra przy każdym ponownym załadowaniu, czyli ~10 razy przy Cechach;
  jeśli męczy, wyciszyć go dla `chain` w `DiceCup.tsx` (`notificationKey`); (2) tempo sesji zero
  z ~25 osobnymi kartami na czacie (10 Cech + ~15 tabel Ścieżki); (3) prawdziwy gest ręką —
  automat rzucał jednym przeciągnięciem.

- **18.09: skóra chromu „stara kartka” — obejrzana tylko automatyką.** W Chrome (MG, Poligon,
  1568×781): dzień i noc, okno ustawień, Panel MG, górny pasek z kolejką inicjatywy. 25.09
  (dwunasta) w Firefoksie: okno handlu, Kompendium w obu motywach, pasek gracza, dialogi `confirm`.
  25.09 (trzynasta) w obu motywach: handout i okno oględzin (Firefox, gracz), menu figury (gracz
  w Firefoksie, MG w Chromium), karta obiektu sceny (Chromium — belka czerwona z pęknięciami także
  w dzień, pola liczbowe od tej sesji na papierze). **Zostało ręką MG:** siła kafla
  (`DAY`/`NIGHT` w `tools/art/chrome-paper.py`).

- **16.09: skórka „stara kartka” karty i kreatora (naprawa 2c) — została płynność.**
  Obejrzane w Chrome: karta (4 zakładki), kreator (7 kroków, okno strat), oba motywy, okna 1708×882
  i 1102×576; **18.09 (odbiór 3d):** portret na papierze w obu motywach — wytarcia go omijają.
  Zostało: **płynność przewijania** długiej karty i kroku Umiejętności na słabszym laptopie gracza
  (warstwa z maską nad całą stroną). Prawdziwe powiększenie przeglądarki 125/150% ręką MG —
  **zdjęte 18.09 decyzją MG** („ze zmian w tym elemencie rezygnuję”).

- **Wsparcie poziomu 10 nie pamięta „tej samej sprawy". 25.09: MG — zostaje na liście, nie ruszamy.** RAW: „po tym pierwszym wezwaniu na
  kolejne przybywają **ci sami** dwaj funkcjonariusze, dopóki wezwanie dotyczy tej samej
  »sprawy«, aż do jej zamknięcia lub śmierci tych funkcjonariuszy" (s. 159). VTT stawia za
  każdym razem nowe figury z pełnymi PW. Wymaga pojęcia „sprawy", którego projekt nie ma —
  najbliżej jest wątek dziennika kampanii z 24b. Zapisane, bo to jedyna kategoria, w której
  ciągłość jest zasadą, a nie kolorytem.

- **Maszynopis wypowiedzi NPC-a (09.08) — zostało tylko tempo, do oceny MG.** Obejrzane 24.09
  automatem w widocznej karcie MG (kampania-śmieć, Qwen3.8-27B): tekst przyrasta porcjami po
  kilka–kilkanaście znaków, czyli całymi wyrazami (2); przy dwóch botach wezwanych jednym zdaniem
  druga wypowiedź stoi pusta, dopóki pierwsza się nie dopisze (3); po F5 linie z historii mają
  pełną długość od pierwszej klatki (4). **Zostaje (1) tempo** — 15 zn/s z limitem
  `MAX_DURATION_MS` = 12 s na linię; wypowiedź 27B (300–450 znaków) pisała się 8–9 s. Jeśli przy
  stole za wolno albo za szybko, zmienia się `CHARS_PER_SECOND` w `packages/client/src/typewriter.ts`.

- **24.09: polszczyzna Qwen3.8-27B UD-Q3_K_XL — do obserwacji przy stole, nie kodu.** Wyraźnie
  lepsza niż w 9B (streszczenie 2432 linii bez jednego błędu), ale Q3 zostawia potknięcia odmiany
  i słowa-widma: „z mojej baru”, „ten piwo”, „serce Babcie Ruth”, „to cywil, a nie targe”,
  „ty szkodzie”; w screamsheecie (T 0,9) „zdołały odparta atak”, „kulebionych pocisków”,
  „zwykła napad”. Obniżka temperatury screamsheetu do 0,7 pomagała niewiele (A/B po 3 próbki),
  więc została 0,9; nagłówek pisze się od 24.09 zwykłą pisownią (decyzja MG). Dźwignie, gdyby
  przeszkadzało: lekcja bota („Mów poprawną polszczyzną”), mocniejszy kwant, gdy zwolni się VRAM.
  Notatkę relacji pisz **do bota w drugiej osobie** („Stym uratował ci bar”) — model przepisuje
  notatkę w trzeciej osobie i potrafi mówić o rozmówcy jak o kimś obok.

- **Etap 20a — gdy bot „nie chce rzucić", zajrzyj do dziennika decyzji.** Przy oględzinach „Kolec, rzuć
  na Wygadanie" wróciło jako „rozmowa" — i słusznie: **„Wygadanie" nie jest umiejętnością CP RED**, a Kaya
  nie ma żadnej umiejętności perswazji. `data/private/bot-decisions.jsonl` (gitignore, jedna linia JSON
  na decyzję) ma pole `options` z pełnym menu, które bot dostał — to zwykle wystarcza za diagnozę.

- **⚠️ ZANIM ODHACZYSZ COKOLWIEK NIŻEJ: przeczytaj `docs/testy/sesja-testow-walki-2026-08-08.md`.**
  Sesja 08.08 zbudowała **gotowy poligon testowy** (kampania „Poligon bojowy", scena
  „Strzelnica", pięć uzbrojonych figur — nie buduj go od nowa) i **odklikała dużą część list
  poniżej**: całe 16d (**wraz z rzutem obrażeń obszaru — odklikanym 04.09**), punkty 1–6 z 16g, tryb turowy u MG, ruch
  i budżet, atak z mapy, PT z odległości, obrażenia, ablację pancerza, „Cofnij", ogień ciągły
  i zaporowy oraz menu kontekstowe tokenu. Plik zawiera też **plan dokończenia** (16h, osłony,
  zwarcie, Test Przeżywalności, strona gracza), trzy znalezione błędy i — ważne — **korektę
  dwóch „pułapek dev"**: menu kontekstowe _działa_ (nie dowozi go tylko `right_click` z CDP),
  a `window.confirm` da się przechwycić i nie zawiesza sterowania.
  **Druga sesja tego samego dnia** domknęła: resztę 16h (usypiająca, EMP, dym, „Minęła
  minuta", poprawka naboju inteligentnego, formularz amunicji w kompendium), **całe osłony
  16c u MG** (**wraz z „usuń wszystkie" — odklikanym 04.09, z Ctrl+Z**), **etap 15 — śmiertelne rany, Test Przeżywalności,
  śmierć i Ustabilizowanie od zera**, **Pochwycenie z „Broń się"** z 14d, monity początku
  tury z 14e i zakładkę „AI". Doszły błędy **#7** (etykieta odchylenia granatu) i **#8**
  (klik narzędziem osłon przecieka do warstwy gry) — **oba naprawione 22.08**.
  Ustalenie ważne dla reszty list: **odmowy statusowe są u MG niesprawdzalne** —
  `realtime/movement.ts:216` zwalnia MG z blokad, więc wszystko, co „ma odmówić ruchu",
  trzeba oglądać na koncie gracza.
  **Odklikane 27.08 na koncie `Tester`:** żeton gracza ze statusem **Nieprzytomny** nie ruszył
  się z miejsca, na czacie stanęło „Nieprzytomny token nie może się poruszać.", a wszystkie
  Akcje w panelu postaci były wyszarzone.
