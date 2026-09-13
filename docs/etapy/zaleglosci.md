# Otwarte zaległości (dług oględzin i drobne braki)

Lista rzeczy **otwartych**, przenoszona między etapami; wyprowadzona z `POSTEP.md` 22.08.2026,
żeby nie obciążała pliku czytanego na starcie każdej sesji. Czytaj ją, gdy siadasz do
odhaczania zaległości albo dotykasz etapu, który tu występuje — nie rutynowo.

Zamknięte pozycje — z całą diagnozą i opisem naprawy — są w `archiwum/zamkniete-zaleglosci.md`.

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

**12.09 (pełny ekran, zlecenie MG poza etapami): NIEOBEJRZANY w widocznym oknie.** Przełącznik
„Pełny ekran" (⚙ Ustawienia → Widok, `fullscreen.ts`) jest zrobiony i pokryty testami. W przeglądarce
odklikane: pole, podpowiedź w wariancie „przytrzymaj Esc", zapis w `localStorage`, guzik „⛶ Wróć do
pełnego ekranu" oraz wywołania `requestFullscreen` z automatu (klik i klawisz) przy aktywnym geście.
**Samego pełnego ekranu automatyka nie zobaczy** — Chrome odmawia schowanej karcie (pułapka
w `ogledziny`). Do sprawdzenia ręką, najlepiej na koncie gracza w Chrome:
(1) zaznaczenie pola wchodzi od razu, odznaczenie wychodzi;
(2) krótkie Esc zamyka rzeczy w VTT (np. zdejmuje zaznaczenie figury), a przytrzymane wychodzi
z pełnego ekranu **bez** schodzenia po całej drabinie;
(3) F5 → pierwszy klik wraca do pełnego ekranu, ale po wyjściu przytrzymanym Esc kolejne kliknięcia
**nie** wciągają z powrotem;
(4) wylogowanie wychodzi, zalogowanie i dołączenie wchodzą;
(5) okno `window.confirm` i wybór pliku portretu — czy zdejmują pełny ekran (niesprawdzone, może
zależeć od przeglądarki);
(6) Firefox: Esc wychodzi od razu, a podpowiedź pola mówi to wprost.
Na `http://217.154.210.181:8088` Keyboard Lock nie działa (brak HTTPS) i Esc wychodzi od razu —
to nie regres; zadziała na `vtt.tatanga.eu` po etapie 28.

**12.09 (etap 41): została JEDNA ścieżka — dymek pod celownikiem.** Etap przeszedł oględziny 12.09
(okno oględzin u MG i u gracza, dokładne oględziny z prośby, „Pokaż wszystko", „Dobądź / Schowaj
(Akcja) / Upuść"; po drodze naprawiony błąd, przez który dokładne oględziny nie działały — patrz
archiwum). **13.09 obejrzany wyszarzony slot paska** na kampanii-śmieciu, z konta `Tester`: po
„Schowaj (Akcja)" oba wiersze broni („Pistolet oględzinowy" i jego „Przeładuj") dostają
`hud-slot--refused` (przezroczystość 0,4), a karta zamienia plakietkę „✊ W rękach" na „Dobądź".
Przy okazji wyszła usterka tekstu odmowy — osobna pozycja niżej. **Zostaje:** dwie linijki w dymku
pod celownikiem — `onAimHover` nie budzi się od syntetycznego ruchu kursora (pułapka z 10.09), więc
to jedyna droga przez rękę MG.

**05.09 (etap 38a — statysta jako karta postaci): został JEDEN kosz — grupowy.** Zmigrowane figury
poligonu przeszły przez przeglądarkę 05.09. **13.09 obejrzany szybki edytor** na kampanii-śmieciu
(„Figura testowa" bez karty): przełącznik „Statystyki bojowe (figura dostaje własną kartę)", pola
profilu, „Wartość bojowa zamiast Cech" z podpowiedzią i „Nie unika pocisków (s. 158)" — wszystko
mieści się w oknie, a zapis **założył kartę** (`statBlock`: Wartość bojowa 4, `noBulletDodge`,
`hpMax` 10). **Kosz pojedynczy** pyta dwa razy: „Usunąć token „Figura testowa"?" i „Usunąć też
kartę „Figura testowa"? Zostanie w kampanii, jeśli odmówisz." — obie odpowiedzi „tak" usunęły żeton
i kartę. Dwie drobne uwagi do słów edytora — osobna pozycja niżej. **Zostaje:** pytanie o kartę
przy **koszu grupowym** z 35 — na scenie nie zostały dwie figury z kartami.

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

- **Odmowy montażu u gracza — obejrzana jedna z pięciu.** (Druga połowa tej pozycji — zdanie
  „Minęła minuta … wraca" — zamknięta 13.09 testem, patrz archiwum.)
  Trzy odmowy z s. 111 (`MISSING_FOUNDATION`, `NO_SLOTS`, `POOL_FULL`) i dwie z s. 226
  (`SELF_INSTALL`, `NO_SURGERY_SKILL`) mają testy dymne na żywych gniazdach, ale **MG jest z nich
  zwolniony** — a ripperdoc, którym MG operuje, jest jedyną drogą przez UI, więc przy oględzinach
  04.09 nie było jak zobaczyć czerwonego zdania w czacie. To ta sama sytuacja co przy odmowach
  ruchu: trzeba konta gracza. **13.09 obejrzana `MISSING_FOUNDATION` z konta `Tester`:** Kompendium
  → „Celownik optyczny" → „Zainstaluj — 1000 ed" na karcie bez cyberoka daje w czacie notatkę „Nie
  ma w co tego wszczepić…" (szarą i lokalną, nie czerwony wiersz), a karta zostaje z 5000 ed i bez
  wszczepu. **Zostają:** `NO_SLOTS` i `POOL_FULL` (zdania z tej samej tablicy, co obejrzane) oraz
  `SELF_INSTALL`, do którego gracz potrzebuje Medyka z Chirurgią. `NO_SURGERY_SKILL` jest z UI
  nieosiągalne z założenia: lista chirurgów w Kompendium pokazuje wyłącznie karty z Chirurgią.

- **13.09 (etap 24c): drugi szkic screamsheetu kasuje lead poprawiony przez MG.** Znalezione przy
  przeglądzie kodu, nie przy stole. `takeDraft` (`HandoutPanel.tsx`) wpisuje tytuł i treść szkicu
  tylko wtedy, gdy nie są puste, a **lead nadpisuje zawsze** — więc szkic bez leadu wymaże to, co MG
  już poprawił. Poprawka to jeden warunek (`draft.lead.length > 0`), ale zachowanie „drugi generator
  nadpisuje pola" jest osobnym otwartym pytaniem z wpisu o 24c niżej — MG nie wybrał jej 13.09.

- **13.09 (etap 41): odmowa „nie w rękach" przy pustych rękach mówi o „tamtym".**
  `CPRED_NOT_DRAWN_REFUSAL` (`shared/systems/cpred/attacks.ts`) ma jedno zdanie: „Masz w rękach co
  innego — schowaj tamto (Akcja) albo upuść, a potem dobądź tę broń." Postać, która schowała
  **jedyną** broń, ma puste ręce, a podpowiedź slotu i odmowa planera każą jej wydać Akcję na
  chowanie czegoś, czego nie trzyma. Obejrzane 13.09 na koncie `Tester`. Naprawa: dwa zdania
  zależnie od `cpredDrawnWeapons` — przy pustych rękach coś w rodzaju „Broń jest w kaburze — dobądź
  ją (bez Akcji)". MG nie wybrał poprawki w tej sesji.

- **13.09 (etap 23a/23b): notka „Instaluję …" na karcie wpisu zostaje po odmowie.** `install()`
  w `CompendiumPanel.tsx` wstawia „Instaluję „Celownik optyczny" — 1000 ed. Rzut na Utratę
  Człowieczeństwa idzie na czat." **przed** odpowiedzią serwera, więc po odmowie
  `MISSING_FOUNDATION` karta mówi co innego niż czat. Naprawa: notka dopiero po `ack.ok`
  (`sendCyberwareAction` musiałby zwracać wynik) albo gaszona przy odmowie.

- **13.09 (etap 38a): dwie uwagi do słów szybkiego edytora.** (1) Podpowiedź „PW bierze się
  z paska powyżej" stoi także wtedy, gdy „Pasek HP" jest odznaczony — nie sprawdzone, jakie
  maksimum dostaje wtedy zakładana karta. (2) Pole „Umiejętność" zostaje obok zaznaczonej „Wartości
  bojowej zamiast Cech", choć od tej chwili atak i obrona liczą się z Wartości. Kosmetyka słów.

- **Wsparcie poziomu 10 nie pamięta „tej samej sprawy".** RAW: „po tym pierwszym wezwaniu na
  kolejne przybywają **ci sami** dwaj funkcjonariusze, dopóki wezwanie dotyczy tej samej
  »sprawy«, aż do jej zamknięcia lub śmierci tych funkcjonariuszy" (s. 159). VTT stawia za
  każdym razem nowe figury z pełnymi PW. Wymaga pojęcia „sprawy", którego projekt nie ma —
  najbliżej jest wątek dziennika kampanii z 24b. Zapisane, bo to jedyna kategoria, w której
  ciągłość jest zasadą, a nie kolorytem.

- **Strzykawka bezigłowa jako atak nie istnieje.** „Jeśli cel sprzeciwia się zabiegowi, Medyk może
  w ramach Akcji wykonać pojedynczy Atak Bronią Białą (strzykawką bezigłową). W przypadku
  trafienia, Atak zamiast obrażeń wstrzykuje celowi dawkę farmaceutyku" (s. 150). `character:use-dose`
  podaje dawkę **bez rzutu**, bo przy stole niemal zawsze podaje się ją komuś przytomnemu
  i chętnemu. Wrogi cel wymagałby broni „strzykawka" w kompendium i gałęzi w `planCpredAttack`,
  która zamiast obrażeń woła podanie dawki — czyli tej samej roboty co amunicja bez obrażeń
  z 16h, tylko od drugiej strony.

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
  się dopisze. (4) **Historia i resync** — linie wczytane z historii nigdy się nie animują.

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
