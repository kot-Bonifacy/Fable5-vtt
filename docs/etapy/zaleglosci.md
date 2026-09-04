# Otwarte zaległości (dług oględzin i drobne braki)

Lista rzeczy **otwartych**, przenoszona między etapami; wyprowadzona z `POSTEP.md` 22.08.2026,
żeby nie obciążała pliku czytanego na starcie każdej sesji. Czytaj ją, gdy siadasz do
odhaczania zaległości albo dotykasz etapu, który tu występuje — nie rutynowo.

Zamknięte pozycje — z całą diagnozą i opisem naprawy — są w `archiwum/zamkniete-zaleglosci.md`.

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

- **Odmowy montażu nieoglądane na koncie gracza; monit „Minęła minuta" z nazwami — też.**
  Trzy odmowy z s. 111 (`MISSING_FOUNDATION`, `NO_SLOTS`, `POOL_FULL`) i dwie z s. 226
  (`SELF_INSTALL`, `NO_SURGERY_SKILL`) mają testy dymne na żywych gniazdach, ale **MG jest z nich
  zwolniony** — a ripperdoc, którym MG operuje, jest jedyną drogą przez UI, więc przy oględzinach
  04.09 nie było jak zobaczyć czerwonego zdania w czacie. To ta sama sytuacja co przy odmowach
  ruchu: trzeba konta gracza. Druga rzecz w tej samej kategorii: **„Minęła minuta … wraca:
  Kerenzikov, Cyberoko"** — zdanie dopisuje `sweepTimedEffects`, czyli zamiatanie, które chodzi
  wyłącznie w trybie turowym; żeby je zobaczyć, trzeba przepuścić sześć rund walki. Sama
  zawartość zapisu jest pokryta testem (`sheets.test.ts`), niepokryte jest **zdanie**.

- **„Dodaj za darmo" omija cały montaż.** Guzik MG przy wpisie kompendium woła
  `addCompendiumItemToCharacter`, czyli zwykłą łatę karty — nie `character:cyberware`. Wszczep
  wchodzi więc **bez rzutu na Utratę Człowieczeństwa, bez Testu montażu i bez odmów z s. 111**.
  Zachowanie jest sprzed 04.09 i po części celowe (to furtka MG na łup i nagrodę za zlecenie), ale
  od tej sesji różnica między dwiema drogami jest większa niż „płacisz albo nie": jedna liczy
  zasady, druga nie. Do rozstrzygnięcia przy stole — albo guzik dostaje ścieżkę przez zdarzenie
  z `payment: 'none'` (i wtedy znika „darmowy" wyjątek od Człowieczeństwa), albo zostaje jak jest
  i mówi to wprost w tooltipie.

- **Korporacyjny netrunner nie ma cyberdeku na karcie, tylko w prozie.** Pracownik zespołu
  Korpo (30c) dostaje pełną kartę postaci **właśnie dlatego**, że statysta nie mógłby zrobić
  jedynej rzeczy, do której netrunner istnieje — komentarz przy jego pakiecie w `roleability.ts`
  mówi to wprost („the reason a team member had to be a real sheet: a cyberdeck needs one").
  Karta wychodzi z HR z Rolą **Netrunner rangi 2** (`ability: { name: 'Interfejs', rank: 2 }`),
  ale `cyberdeck` zostaje `null`, a deck jest zdaniem w `gear`: „Cyberdek (7 gniazd: Miecz,
  Zabójca, Robak, Pancerz)". Netrunner z zespołu nie podłączy się więc do Sieci, dopóki MG nie
  złoży mu decku ręką na karcie. Przepis: `hireTeamMember` (`realtime/team.ts`) ma registry,
  więc może zbudować `CpredCyberdeck` z `slots: 7` i czterema `CpredNetInstallRow` z profilami
  Programów skopiowanymi z kompendium — tak samo, jak `purchasedSheetRow` kopiuje liczby broni.
  Otwarte świadomie 04.09: to dołożenie brakującego zakresu, nie naprawa usterki, i dotyka
  modelu z 26a.

- **Nazwa figury nadal jedzie do graczy w kartach czatu.** Alias `Token.publicName` (03.09)
  zasłania prawdziwą nazwę **na mapie i w Kolejce Inicjatywy** — obie ścieżki filtruje serwer
  (`toTokenView`, `filterCombatForPlayer`), obie obejrzane w przeglądarce. **Czat zostaje
  nieszczelny:** ponad trzydzieści miejsc w `realtime/` wpisuje `token.name` w **treść**
  wiadomości („Snajper Arasaki → Rudy Kwiatkowski"), a wiadomość jest zapisana w bazie
  i rozsyłana wszystkim tak samo — filtr per-odbiorca wymagałby albo przebudowy kart na dane
  plus szablon, albo drugiej kopii wiadomości. Praktycznie boli mniej, niż wygląda: kartę
  pisze figura, która **właśnie coś zrobiła**, więc stół i tak już wie, kto to. Okno edycji
  tokenu mówi to graczowi wprost („Karty na czacie nadal piszą prawdziwą nazwę"). Do zrobienia
  razem z **etapem 35**, do którego alias pierwotnie należał.

- **Wsparcie poziomu 10 nie pamięta „tej samej sprawy".** RAW: „po tym pierwszym wezwaniu na
  kolejne przybywają **ci sami** dwaj funkcjonariusze, dopóki wezwanie dotyczy tej samej
  »sprawy«, aż do jej zamknięcia lub śmierci tych funkcjonariuszy" (s. 159). VTT stawia za
  każdym razem nowe figury z pełnymi PW. Wymaga pojęcia „sprawy", którego projekt nie ma —
  najbliżej jest wątek dziennika kampanii z 24b. Zapisane, bo to jedyna kategoria, w której
  ciągłość jest zasadą, a nie kolorytem.

- **Stym nie zawiesza kar Poważnie Rannego — robi to MG.** Cztery z pięciu farmaceutyków (03.09)
  rozlicza silnik: Antybiotyk dopisuje tydzień do naturalnego leczenia, Turbo uzdrawiacz leczy
  BC + SW od ręki, Dynadetoks zdejmuje „Zatruty", Zryw jest zdaniem na karcie. Piąty nie:
  „przez godzinę cel ignoruje kary wynikające z bycia Poważnie Rannym" (s. 150) znaczy zawieszenie
  −2 **w każdym Teście**, a tę karę liczy `planCpredRoll` z `woundState`, czyli siedem ścieżek
  naraz (rzut, atak, Zwarcie, Konfrontacja, Sieć, ruch, obrona). Karta czatu mówi to wprost
  („kary zawiesza MG na godzinę"), a przepis na naprawę jest jeden i **ten sam, którego potrzebuje
  etap 39**: `sheetSituationModifiers` (`server/src/sheets.ts`) dostaje listę statusów figury
  i sam wystawia nazwany wiersz „Stym +2" obok „Poważnie ranny −2" — siedmiu wywołań tej funkcji
  nie trzeba wtedy uczyć niczego nowego, tylko podać im żeton. Świadomie odłożone do 39, żeby nie
  budować tej maszynerii dwa razy.

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
