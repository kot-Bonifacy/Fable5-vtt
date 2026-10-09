# Od czego zacząć — akapity wyprowadzone z `POSTEP.md`

Wyprowadzone 10.09.2026, gdy `POSTEP.md` urósł do 107 KB. Były to pełne opisy etapów 33–40,
pisane w chwili ich zamknięcia — czytane rutynowo na starcie każdej sesji, choć potrzebne
wyłącznie wtedy, gdy ktoś wraca do świeżo zamkniętego etapu. **To, co z nich obowiązuje
w kodzie, mieszka w sekcjach obszarów `umowy-kodu.md` i `pulapki-dev.md`** — tu leży kontekst:
po co to powstało, co było przed, czego świadomie nie zrobiono.

Kolejność jest ta sama, w jakiej stały w `POSTEP.md` (najnowsze pierwsze). Treść bez zmian.

## Wyprowadzone 09.10.2026 — etap 46a (46a1 + 46a2)

**Etap 46a zamknięty 08.10 (46a1 + 46a2) — następna jest 46c (zapas amunicji), potem 46b
(pojemniki), wszystko przed refaktoryzacją.** Projekt całości w `etap-46-wymiana-sklepy.md`.
Jest **jedno okno „Wymiana”** (`components/exchange/`): wejście „🤝 Wymiana…” w menu figury
(gracz i MG), „Wymiana…” na zakładce Ekwipunek, dok w rogu mapy („Sklepy (N)” — sklepy zdalne),
przyciski sklepów na ekranie „Między sesjami” i podwójny klik gracza w handlarza albo ciało.
Tryb wynika z drugiej strony: kolega/NPC — handel 38c (wybór od razu zaprasza, „Wyślij bez
czekania” do drużyny), ciało — łup, handlarz — półka, koszyk, sprzedaż i jedno „Zapłać”, MG —
„Dokąd” na dowolną kartę. Stare okna (`InventoryWindow`, `TradeWindow`, `TradeDock`) i zdarzenia
`inventory:sources` / `trade:partners` są usunięte. Handlarza MG robi w karcie NPC-a (sekcja
„Sklep” w Ekwipunku), otwiera i zamyka z menu figury. Decyzje MG z 08.10 na końcu „Zakres 46a”
w pliku etapu; umowy w `ui` i `ekwipunek`, E2E `specs/46-wymiana/t46a-wymiana-sklepy` (17,
z `po-T6`). **Granat rzucany przeładowuje się bez końca (#82)** — naprawia 46c.

## Wyprowadzone 08.10.2026 — etap 46a1

**Następna jest 46a2 (okno „Wymiana”), potem 46c i 46b — przed refaktoryzacją.** Projekt całości
w `etap-46-wymiana-sklepy.md`; **46a podzielona 08.10 (decyzja MG) na 46a1 i 46a2**, zakres
każdej w sekcji „Zakres 46a”. **46a1 zamknięta 08.10:** handlarz to karta NPC-a z wierszem
`Merchant` (uchwyt `Merchant.id`, towar = ekwipunek karty, odkupiona rzecz od razu na półce),
zdarzenia `merchant:list/view/deal/config/row`, `exchange:counterparts` (jedna lista drugich stron
obok starych `inventory:sources` i `trade:partners`, które 46a2 usuwa razem ze starymi oknami),
`campaign:catalog-shopping` (dźwignia „Kup: wszędzie / u handlarzy” w Kompendium MG,
`CATALOG_CLOSED` w `economy:buy`), zapraszający kładzie rzeczy w pole handlu już w `invited`.
**Do sklepu nie ma jeszcze UI** — MG ustawia go dziś tylko z konsoli/testów; okno, dok, sekcja
„Sklep” w karcie NPC-a i E2E `t46a-` to 46a2. Umowy w `ekwipunek` i `serwer`. **Granat rzucany
przeładowuje się bez końca (#82)** — naprawia 46c.

## Wyprowadzone 04.10.2026 — etap 44c

**Etap 44c zamknięty 04.10 — następny jest 44d (AI właściciela), potem T9b.** Nie ma już jednej
aktywnej kampanii na serwer: MG ma kampanię **otwartą** (Panel MG „Otwórz”, przygotowanie bez
slotu), a gracze siedzą przy stole tylko w **trwającej sesji** — „Rozpocznij sesję” / „Zakończ
sesję” w górnym pasku MG, najwyżej **dwie sesje naraz** (`VTT_MAX_SESSIONS`), porzucona zwalnia
się sama po 15 min bez nikogo albo 3 h bez gry. Gracz bez sesji ma **widok „Między sesjami”**
(plakat logowania w miejscu mapy, karta, dziennik, handouty, czat do czytania, kreator, PD, sklep,
handel); resztę zdarzeń serwer odrzuca `SESSION_NOT_RUNNING` (biała lista `BETWEEN_SESSIONS_EVENTS`).
Czat napisany bez sesji widzi tylko MG. MG z trwającą sesją nie otworzy innej kampanii. Umowy:
`serwer` i `ui`; decyzje MG z 04.10 na końcu `etap-44c-sesje-sloty.md`. **W `dev.db` migracja
zamieniła „Test2” (dawniej aktywna) w trwającą sesję** — po 15 min bez gniazda zwolni się sama.
**Zostało sprzed 44d:** każdy MG ma dostęp do AI właściciela bez zgody. Punkt `po-T9a` (A w sesji,
B po sesji) to start T9b.

## Wyprowadzone 04.10.2026 — etapy 44a i 44b

**Etapy 44a i 44b zamknięte 04.10, T9a zamknięty 04.10 bez ani jednego błędu — następny jest 44c
(sesje i sloty).** Pełny domyślny przebieg z gatewayem: **299/299** (41,5 min). MG loguje się
**loginem** (`MG`) i hasłem, inni MG zakładają konta sami, właściciel ma „Konta MG”. Każdy MG widzi
i steruje tylko swoją kampanią (macierz serwera `campaign-isolation.test.ts` i macierz E2E
`t9a-izolacja` na rozegranym `po-T6`), pliki leżą w `uploads/campaigns/<id>/` i wydaje je tylko MG
i gracze tej kampanii, a **gracz wchodzi imiennym linkiem z Panelu MG** („Nowy gracz”, przy powrocie
z innego komputera — „Link odnowienia”; link działa raz, 7 dni). Aktywna kampania jest **dalej jedna
na serwer** — kampania MG-B zdejmuje stół grupie MG-A (44c), a MG-B ma dostęp do AI właściciela bez
zgody (44d). Rozpiska: `etap-44-konta-mg.md`, wynik T9a: `testy.md` 6.5; punkt `po-T9a` (A + B) to
start T9b.

## Wyprowadzone 18.09.2026 — cała sekcja sprzed skrócenia

Sekcja „Od czego zacząć" urosła do 15 KB i opisywała historię etapów 41–42c, sesji 12–14.09
i naprawy kreatora zamiast stanu na dziś. Poniżej jej pełna treść z 18.09 (przed skróceniem),
bez zmian. Co z niej obowiązuje w kodzie, stoi w sekcjach obszarów `umowy-kodu.md`
i `pulapki-dev.md`; nowa, krótka sekcja w `POSTEP.md` trzyma tylko to, co wraca przy stole.

**Od 18.09 cały chrom jest „starą kartką” — `chrome.css` + tokeny papieru w `theme.css`** (zlecenie
MG: „styl zbyt excelowy”). Dzień to pożółkły, wytarty papier (nie krem), noc — czarny karton karty
postaci; belki czarne z czerwoną kreską w obu motywach, okna ze ściętymi rogami, kroje Jost/Oswald.
Kafle z sieci (PD/CC0) buduje `tools/art/chrome-paper.py`; **„żadnego brudu”** — same wytarcia,
rysy, załamania. Poza skórą: karta i kreator, Sieć, pasek mapy, screamsheet, logowanie.
Obejrzane w Chrome przez automatykę (dzień/noc, ustawienia, Panel MG); **oględziny ręką MG
i Safari/iPad czekają** (`zaleglosci.md`). Umowa i źródła: `ui`, `docs/assety-chrom.md`.

**Naprawa kreatora postaci (`naprawa_karty_postaci.md`) ukończona 18.09 — etapy 1, 2a–2c, 3a–3d.**
Odbiór 3d przeszedł obie metody jako MG i gracz (Medyk, Korpo, Technik, Nomada; F5, zmiana
Roli/metody, brak aktywnej sceny, opóźnienie i zerwanie łącza przy „Utwórz postać”, portret, czytnik
ekranu) bez błędu zasad; trzy poprawki z odbioru: **`creation:peek`** daje zakładce „Postacie” etykietę
„Wznów szkic: Medyk „Igła” · Wyposażenie” (`creationResumeLabel`), kreator po „Przejdź”/„Pokaż kartę”
z ekranu końcowego **schodzi pod kartę** (`behind`, z-index 290) zamiast się zamykać, a `leftPhrase`
odmienia „Zostało 1 miejsce”. Dalsza praca przy kreatorze wychodzi już tylko z `POMYSLY.md` (kubek
na każdą pozycję) i `zaleglosci.md`; **powiększenie przeglądarki MG wykreślił z odbioru 18.09**.
**Od 3c kreator mówi, czego po
sobie nie kończy**: `cpredRoleChores` (`shared/…/readiness.ts`) liczy **z karty** siedem czynności
Ról (Zmysł Walki, Medycyna, Twórca, zespół, Tabor i Zakwaterowanie Nomady, cyberdek), a „Przejdź”
prowadzi do panelu przez `data-sheet-panel` + `characterStore.focusPanel`. Nowa decyzja Roli dokłada
gałąź tam, nie własną listę. **Gotowość do gry to kolumna `Character.playReady`** (migracja
`20260917210000`, zdarzenie `character:play-ready` tylko dla MG): czeka wyłącznie karta z kreatora
**mająca właściciela**, znacznik **niczego nie blokuje**, a znaczek na zakładce „Postacie” sumuje
szkice bez rangi i postaci czekające na przyjęcie. **MG zlecił 17.09 rozbicie rzutów kreatora na
pojedyncze kości przez kubek** (10 × 1k10 na Cechy, kubek na każdą tabelę Ścieżki Życia) — poza 3c,
opis i stan na dziś w `POMYSLY.md`, na górze pliku. **Od 3b poziom dostępności mówi, jak legalna jest rzecz, a nie ile kosztuje**
(`shopTierVerdict`: typ broni, OB, rodzina wszczepu, klasa Programu; cena tylko podnosi; nazwy
1 Uliczne / 2 Zawodowe / 3 **Wojskowe** / 4 Czarny rynek). Czego rodzaj nie rozstrzyga, stoi po id
w `data/private/cpred/shop-tiers.json` — **plik jest poza gitem, więc na VPS jedzie razem
z kompendium**. MG nadpisuje pojedynczy wpis w Kompendium (`Campaign.shopTierOverrides`), a sklep
kreatora to poziom 1 plus narzędzia własnej Roli do poziomu 2. **Od 3a** podsumowanie kreatora pokazuje kartę z `creationOutcome` — tę samą,
którą zapisze serwer (test to pilnuje), postać gracza dostaje Poziom życia z s. 105, a po „Utwórz
postać” okno zostaje na ekranie końcowym. **Nowy wszczep kosztuje od 17.09 samą cenę** — do tej pory
pełny montaż doliczał opłatę za montaż. **Od 2c karta postaci i kreator są „starą kartką”**
(`sheet-window--paper`): pożółkły papier w dzień, czarny karton w nocy, jasne wytarcia nad drukiem
i pęknięcia na czerwonych ramkach — tekstury z sieci (domena publiczna/CC0) budowane
`tools/art/sheet-paper.py`. **MG odrzucił wszystko, co ciemniejsze od papieru** (drobinki i plamy
„jak brud”) i przyjął, że wytarcia nad tekstem obniżają kontrast przygaszonych napisów w najbardziej
wytartych miejscach. Odbioru 4K/3440/2560 **nie ma** (decyzja MG z 16.09: skala odpowiada, gracze
zmieniają ją sami) — zostało tylko „powiększenie nie ucina nawigacji”. Umowa w `karta`, źródła
i kontrast w `docs/assety-karta-postaci.md`. **Od 2b** zmiana Roli albo metody, która coś zabiera,
pyta oknem kreatora z listą strat (`creationChangeEffect`), MG ustala rangi szkiców w zakładce
„Postacie”, a klawisze z przycisków kreatora i karty postaci nie sterują mapą (`data-owns-keys`).
**Od 2a** szkic trzyma minima podstawowych jako zwykłe poziomy (`skillMinimaAuto`), a gracz nie
wpisze Cech Kompletnego Pakietu przed rangą od MG. Szkice sprzed 2a (w `dev.db` m.in. Tony'ego)
dostają w kroku Umiejętności bilans i przycisk „Przydziel minima”. Minimum slangu ulicznego nadal
kosztuje 2 pkt we wspólnym wierszu „Język” (decyzja z 16.09).

**Etap 42 (bariery) ukończony: 42a ✅, 42b ✅, 42c ✅.**
Bariera to rodzaj ściany, przez który widać mapę, a nie da się przejść ani sięgnąć wręcz;
brama to jej otwór. **Od 42b bariera ma OB** — zasada domowa MG, nie błąd mechaniki
(`decyzje-i-uproszczenia.md`): strzał i wybuch tracą je przed pancerzem celu, a skąd bierze się
liczba na trafieniu, rozstrzyga jedna funkcja `barrierSpOfHit` (umowa w `atak`). **42c** (bariera
zasłaniająca figury, mgła za nią przy widocznej mapie, kara za niewidoczny cel) działa we wszystkich
trybach. Przyjęty wygląd: jak pamięć mapy; ręczne „Odsłoń” nie omija bariery (założenia opisane
w pliku etapu). Widok figur idzie przez `figurePolygons`, kara przez `cpredBarrierModifiers`. Nowa
rzecz, która zatrzymuje ciało, a nie wzrok, wchodzi przez `wallBlocksMovement` — umowa w `mapa`.

**13.09 (czwarta sesja): planer gracza zna ściany na każdej scenie**, nie tylko w Dynamicznej — poza
nią `blocker:sync` niesie wszystko, co zatrzymuje ciało, pod mgłą przycięte do odsłoniętej podłogi
(`revealedStretches`, decyzja MG; umowa w `mapa`). **Ta sama sesja naprawiła dwa regresy z 42c:**
gracz na mgle albo scenie otwartej tracił trasę kliknięciem po pierwszym `vision:sync` (usunięty
żeton, drzwi, lampa), a F5 obok bariery zasłaniającej gubił przeszkody planera. **Morał:** od 42c
`vision:sync` przychodzi w każdym trybie — o Dynamicznej rozstrzyga `scene.visibility`, nigdy samo
przyjście widoku (pułapka w `mapa`).

**13.09 (piąta sesja): oględziny 42c domknięte, a przerwany marsz nie cofa już figury za róg** —
przerwanie „ktoś w polu widzenia" ląduje na polu, w które figura wchodziła (`marchStopPoint`, umowa
w `mapa`). Jeśli marsz przy końcu bariery przerywa się dwa razy w tym samym miejscu, to ten objaw.

**Od 14.09 pod ręczną mgłą gracz chodzi tylko po odsłoniętym — planer i serwer** (decyzja MG).
Pola, na których figura stoi, są zwolnione, więc figura postawiona w czerni wychodzi na odsłonięte.
Serwer pyta o mgłę **przed** ścianami (`refuseWalkIntoFog`), żeby odmowa nie rysowała ściany schowanej
w czerni. **Skutek przy stole:** gracz nie wejdzie tam, czego MG nie odsłonił — klik w czerń nie daje
trasy nawet bez ściany. Jeśli „gracz nie może dojść", sprawdź mgłę zaraz po zamku sceny
(`playerMoveLocked`). Umowa w `mapa`; Dynamiczna bez zmian (wpis w `POMYSLY.md`).

**Etap 41 (oględziny wyposażenia) doszedł 10.09 ze zlecenia MG** — nie było go w planie 28
etapów. Zamknięty w jednej sesji; **cały jego UI czeka na oględziny ręką MG** (`zaleglosci.md`),
bo oba wejścia — menu figury i dymek pod celownikiem — są dla automatyki zamknięte.

**Pozostaje etap 28** (wdrożenie na VPS). Reszta jest
zamknięta albo wycofana — „37 przed 39" i „33 przed 28" spełnione.
**Refaktoryzacja całości przed etapem 28 czeka na osobną sesję**: MG odłożył ją 05.09, wybierając
etap z listy, i od tamtej pory doszło pięć etapów. To jest najtańszy moment, żeby ją zrobić — po
niej zostaje wyłącznie wdrożenie. **Etap 36 (makra i własny pasek) MG wycofał 05.09** — nie planuj
go i nie proponuj makr; pasek akcji z 16f zostaje generowany.

**Etap 41 ma odtąd działającą funkcję główną.** Do 12.09 „dokładne oględziny" **nie odsłaniały
niczego**: `requireCallableRequest` (`realtime/checks.ts`) wycinał `sightingTokenId` po drodze
prośba → zgoda → rzut. Naprawione i pokryte testami. **Morał szerszy niż ten jeden etap:** ta
funkcja jest **białą listą** — nowe pole w `CpredRollRequest` trzeba do niej dopisać, inaczej ginie
po cichu i funkcja „działa z wezwania, a z prośby gracza nie".

**Od 13.09 karty czatu piszą alias figury (`Token.publicName`) — u wszystkich, MG też** (decyzja
MG; pusty alias to „Nieznajomy", rzut z samej karty pisze nazwę karty). Nazwa figury wchodzi do
karty czatu **wyłącznie** przez `tokenTableName` — umowa w `czat`. Karty sprzed 13.09 zostają
z prawdziwą nazwą. **Cztery drobne usterki z oględzin 13.09 poprawiono tego samego dnia** (trzecia
sesja) — kodem i testami, **bez oględzin w przeglądarce** (pozycja w `zaleglosci.md`).

**Od 13.09 odmowa broni spoza rąk ma dwa zdania** — „dobądź ją (bez Akcji)" albo „schowaj tamto" —
i wybiera je `cpredDrawFits`, to samo porównanie, którym `weapon:draw` odmawia `HANDS_FULL`. Zajęte
ręce planer dostaje jako `handsHeld` od wołającego: nowe wejście do `planCpredAttack` bez tej liczby
powie graczowi z wolną ręką „schowaj tamto" (umowa w `atak`).

**Pięć ostatnich sesji zamknęło dziewięć etapów:** 40 (prośba gracza o Test), szlif karty postaci,
38b (przedmioty między kartami) i 34 (tabele losowe) — 06.09; 38a (statysta jako karta),
39 (efekty na Cechy), 37 (kalendarz), 35 (ping, ramka, kopie figur) i 33 (kopie zapasowe) — 05.09.
Co z nich obowiązuje w kodzie, stoi w sekcjach obszarów niżej; pełne akapity o każdym —
w `archiwum/od-czego-zaczac.md`.

**Od 12.09 (ósma sesja) jest pełny ekran z ustawień** (`fullscreen.ts`, ⚙ → Widok, wybór per
przeglądarka) — **nieobejrzany w widocznym oknie**, bo schowanej karcie automatyki Chrome odmawia.
Pierwsza rzecz przy stole: sześć kroków z `zaleglosci.md` ręką MG. Na `http://…:8088` Esc wychodzi
z pełnego ekranu od razu — to nie regres, Keyboard Lock wymaga HTTPS.

**Dług oględzin — 15 pozycji** (`zaleglosci.md`; pozycję 3c „Po kreatorze zostało” zamknął odbiór 3d 18.09 — czytnik ekranu i wiersz Korpo obejrzane, powiększenie przeglądarki MG wykreślił; piętnasta to skórka „stara kartka” z 2c — zostały Safari/iPad i przewijanie, portret obejrzany 18.09; dziesiąta to poprawki z trzeciej sesji 13.09, jedenasta — bariery 42a, dwunasta — OB bariery 42b, trzynasta — zbiorcze wgrywanie portretów z 14.09, czternasta — straże lądowania i pełny marsz pod mgłą z drugiej sesji 14.09; pozycję 42c zamknęła piąta sesja 13.09, a 42a i 42b zawęziła do resztek). Sesja 13.09 (druga) zamknęła „bez ran" u gracza
i zawęziła trzy inne do resztek: z 38a został **kosz grupowy**, z 41 — **dymek pod celownikiem**
(tylko ręka MG), z odmów montażu — `NO_SLOTS`/`POOL_FULL` i `SELF_INSTALL` (gracz potrzebuje
Medyka z Chirurgią). Większość reszty czeka na **żywy model** (19a–20b, 24c) albo na rękę MG
(pełny ekran, maszynopis). Kampania-śmieć „Oględziny 12.09" ma od 13.09 członka `Tester` —
**stałe zaproszenie `tester-dev` prowadzi na Poligon**, do śmiecia wpuszcza nowe (do 20.09).

**`main` na GitHubie zrównano z dyskiem ponownie 14.09 (druga sesja)** — wypchnięte piętnaście
commitów (galeria i biblioteka portretów, etapy 42a–42c, sesje 13.09 i 14.09). Do 12.09 `origin/main` stał na etapie 07
(18.07), a 206 commitów — cała praca od etapu 08 — istniało wyłącznie na tym dysku. Gałąź
`feat/vtt-campaign-calendar` (etapy 37–41 i poprawki) scalona do `main` i wypchnięta. **Push
publikuje całą historię, nie ostatni stan** — przed każdym przejrzyj niewypchnięte commity:
`git log --name-only --format= origin/main..HEAD` nie może pokazać `data/private/`, `uploads/`,
`.env` ani baz.

**Kara za rany ma od 12.09 JEDNO miejsce: `cpredWoundPenaltyRows(cpredSheetWoundCondition(sheet))`**
(umowa w `kosci`). Stan ran karty liczy się zawsze z jej maksimum PW (`cpredSheetWoundState`), nigdy
z BC i SW — do tej sesji Testy statysty z wydrukowanymi PW łamały to od 38a. Stym i Edytor bólu
zawieszają **karę**, nie stan: pole `woundSuspension` i wiersz „Stym +2" obok „Poważnie ranny −2".
Nowe źródło zawieszenia dopisuje się w `cpredWoundSuspensionSource`, nigdzie indziej.

**Ważne dla każdego, kto dotknie progu PT: `>=` przy PT jest błędem, nie wariantem.** Decyzja
z 28.08 („remis zdaje") została cofnięta — stała na cytacie, którego w polskim wydaniu nie ma.
Pełny zapis w `decyzje-i-uproszczenia.md`; przeczytaj go, **zanim** cokolwiek tu zmienisz, bo to
druga zmiana zdania w tej sprawie. **Wyjątek od 30c: Test Lojalności** zdaje się przy wyniku
_mniejszym_ od Lojalności (s. 154).

**Od 12.09 scena ma zamek na ruch graczy i NOWA SCENA WCHODZI ZAMKNIĘTA.**
`Scene.playerMoveLocked` — przełącznik „Ruch graczy po tej mapie" w edytorze sceny, działa od razu,
MG nie dotyczy nigdy. Sceny, które istniały przed tą zmianą, migracja **otworzyła**, ale każda nowa
(i każda wciągnięta z pliku) startuje zamknięta: gracz zobaczy mapę, a figurą nie ruszy, dopóki MG
nie odhaczy pola. Jeśli przy stole „gracz nie może chodzić", to jest pierwsze miejsce do sprawdzenia
— i pierwsza rzecz do zrobienia w każdym nowym teście serwera, który każe graczowi ruszyć figurą.

**Na „StrefiePrzemysłowej" został włączony tryb turowy (RUNDA 1: Marcin, Tony) — decyzją MG
z 12.09, do wyłączenia jego ręką.** Zostaw go, dopóki MG nie powie inaczej; „✕" przy kolejce woła
gołego `window.confirm`, więc z automatyki **nie da się go wyłączyć** bez wcześniejszego
przechwycenia (patrz `pulapki-dev.md`, sekcja `ogledziny`).

**Sceny testowe — pięć** (poprawione 12.09: ten akapit od 11.09 mówił o czterech i aktywnej
„Strzelnicy"). **Aktywna jest „StrefaPrzemysłowa"** — kratka 36,2 px (40 × 30) od 12.09;
„Strzelnica" to komplet pod Sieć; **„Korytarza 16e"
nie kasuj** — to jedyna stała scena z widocznością Dynamiczną. Konta, współrzędne, stan po sesji
i procedura oględzin Ról — `poligon.md`.

**Zanim ruszysz pozycję z `POMYSLY.md`, sprawdź ją w kodzie** — 29.08 cztery wpisy okazały się
nieaktualne; lista jest zapisem chwili, w której coś zauważono, a nie stanu repozytorium.
**Triaż z 28.08 zostaje w mocy**: siedem pozycji „nieosiągalnych z UI albo bez widocznej różnicy"
siedzi w `decyzje-i-uproszczenia.md` i **nie wciągaj ich z powrotem** jako nowych odkryć.

**`data/private/cpred/compendium/` bywa starsze niż parser** — pliki są poza repo, więc zmiana
`parse-manual.py` ich nie odświeża. Gdy kompendium zachowuje się dziwnie: najpierw
`python tools/import/parse-manual.py`, potem szukanie błędu.

**Sesja zerowa z drużyną** jest nadal najlepszym testem 25a+25b+25c i trzech stron karty naraz —
a od 30d pierwszym, przy którym każda Rola w drużynie gra inaczej niż reszta.

**Testy na koniec ostatniej sesji:** **2164** w `shared`, **1193** na serwerze, **232** u klienta —
zielone (liczby z 18.09; sumy w starszych notatkach są zaniżone, nie poprawiaj ich w dół).
ESLint i Prettier czyste na kodzie, `tsc --noEmit` czysty w trzech pakietach (od 05.09 obejmuje
też `packages/server/scripts/`). **Nie puszczaj `pnpm format` na `POSTEP.md`, `POMYSLY.md` ani
`00-przeglad.md`** — Prettier przeformatowałby je od dawna i przelał kilkaset wierszy szumu
do commita etapu.

## Wyprowadzone 10.09.2026 — etapy 33–40

**Gracz prosi od 06.09 o Test, a MG zgadza się jednym kliknięciem — do etapu 40 kierunek
gracz → MG nie istniał.** Etap **nie zbudował nowej mechaniki Testu**: zgoda woła
`createCheckCall`, tę samą funkcję, którą woła `check:call`, i powstaje z niej **zwykłe wezwanie
z 32** — z kartą, wołającym kubkiem, Szczęściem i werdyktem. Cała różnica siedzi w tym, czego
prośba **nie** niesie: **ani progu, ani widoczności**, bo jedno i drugie należy do MG, a przy
zgodzie Umiejętność bierze się z **zapisanej prośby**, nie z żądania MG (podmienia ją wyłącznie
„Ustaw…”, czyli `check:call` z `requestMessageId` — jedno żądanie zamyka prośbę i stawia
wezwanie). **Kubek nie zapala się na prośbę** i pilnuje tego strażnik źródłowy
`check-request-cup.test.ts`. Wejście z karty to **Alt+klik** w wiersz Cechy albo Umiejętności
(plus „Poproś MG” w oknie rzutu); swobodny rzut z 08 **działa jak przedtem**. Wiersz `request`
poszedł do `visibleTo` **tylko po stronie MG** — gracz widzi swoją przez `authorId`. Licznik
czekających próśb przy zakładce „Czat” nie jest ozdobą: prośba jest cicha i bez niego ginie
w feedzie. Sześć umów kodu i pięć pułapek w indeksach niżej. **Cały etap przeszedł oględziny
w dwóch sesjach naraz.**

**Karta postaci przeszła 06.09 szlif na wszystkich czterech zakładkach (zlecenie MG).**
Największa zmiana jest strukturalna: dziewięć paneli Ról z 30a–30d **wyszło z kolumny
tożsamości** (15 rem, nierozciągalna — umowa z 30a) do **pasa „Zdolność Specjalna”** pod trzema
kolumnami, tam gdzie leży „Broń i pancerz” z 27b. Bez tego kolumna była dwa razy wyższa od Cech
i Umiejętności, a pół strony pierwszej — pustym polem. Wyszły przy tym **cztery usterki układu**
(`.cp-slot` zdefiniowana dwa razy, `display: flex` na trzech `<td>`, typ naboju przelewający się
na kolumnę ŁA, pusta prawa kolumna „Ścieżki Życia”) i **jeden błąd mechaniczny**: kolumny CECHA
i BAZA liczyły się **bez efektów czasowych z 39**. Wszystko naprawione; szczegóły w pułapkach.

**Liczby na karcie zmienia się od 06.09 strzałkami, a nie wpisywaniem (zlecenie MG).**
`NumberStepper` zastąpił **14 pól**: Cechy, Szczęście bieżące, PW, poziom Umiejętności, rangi
Zdolności, magazynek, OB (bieżące i pełne), karę pancerza, gniazda dekera, poziom Reputacji oraz
dwa pola w panelach Ról. **Wpisywane zostają cztery**: Punkty Doświadczenia (do 99 999),
Człowieczeństwo (100), ILOŚĆ w wyposażeniu (999) i eurodolce — strzałki mają sens do dwóch cyfr.
Pole `readOnly` (poziom i ranga u gracza) pokazuje **samą liczbę bez strzałek**. Ta sama reguła
weszła do **okien gry**: okno rzutu (modyfikator, Szczęście), okno wezwania MG (PT, przeciwnik,
modyfikator), statysta z menu tokena (11 pól) i wirus w netrunie. Przełącznik bierze skórę
z kontekstu — pole z ramką w oknie, płaski napis na karcie. **Drugi wyjątek, obok liczb >99:
pola, w których puste znaczy coś innego niż zero** (OB celu „puste = z karty", inicjatywa,
generator sieci „puste = losuje serwer", sztuk w ekwipunku) — przełącznik zawsze ma liczbę,
więc odebrałby im ten stan.

Przy okazji naprawiona usterka z 40: przycisk „Poproś MG” w oknie rzutu **nie gasił tego okna**,
więc po wysłaniu prośby wracał pod nim guzik „Weź kubek” — gracz nie wiedział, czy zgodę dostał.
Prośba o Test i wezwanie mają **31 testów serwerowych** i sześć klienckich; szczegóły w notatce
sesji.

**MG może od 06.09 powiedzieć „losuj, co się dzieje" — do etapu 34 tabela losowa nie istniała
w żadnej postaci.** Tabela jest **rdzeniem VTT, nie mechaniką CP RED**: `shared/src/tables.ts`
nie importuje niczego z `systems/cpred`, a tabela z podręcznika jest zwykłymi **danymi**. Dwie
rzeczy niosą cały etap. Pierwsza: **losowanie z tabeli NIE dotyka kubka** — `rollStore` ma jeden
slot i każdy `load…Cup` rozsypuje przed sobą resztę, więc „Losuj" jest **rzutem serwera**
(`table:roll`), dokładnie jak `/r 1d10` wysłane Enterem; rzut wzięty do ręki u MG i wezwanie
czekające u gracza przeżywają dowolną liczbę losowań (pilnuje tego źródłowy strażnik
`tables-cup.test.ts`). Druga: **tabela nie jest Testem** — rzut idzie z `checkRule: false`
i `plain: true`, bo `1d10` jest formułą Testu od etapu 06 i bez tej flagi dziesiątka
eksplodowałaby dorzutem, a tabela dziesięciowierszowa dawałaby jedenastki. **Widoczność
rozstrzyga RODZAJ wiersza czatu, nie pole w payloadzie**: `rolltable` jest publiczny,
`gmrolltable` cichy, a „Pokaż stołowi" **dokłada** publiczny wiersz zamiast odsłaniać stary — bo
`visibleTo` jest białą listą rodzajów w zapytaniu do bazy. **Zakresy muszą pokryć całą formułę**
(ta sama funkcja w formularzu i przy zapisie), a **cykl i czwarty poziom podrzutu odmawia się przy
zapisie**, na grafie całej kampanii. Pipeline importu dowiózł **trzy podręcznikowe tabele Spotkań
Losowych** (s. 417–421, `1d100`) — plus jedną erratę polskiego wydania. Cztery umowy kodu i cztery
pułapki w indeksach niżej. Cały etap **przeszedł oględziny w dwóch sesjach naraz**.

**Przedmiot przechodzi od 06.09 z karty na kartę — do etapu 38b nie było na to żadnej drogi.**
Przenosi go **jedna czysta funkcja**, `cpredMoveItems(from, to, refs)`
(`shared/systems/cpred/inventory.ts`): bierze dwie karty i listę adresów wierszy, zwraca **obie**
— rozdzielenie jej na „zabierz" i „dołóż" pozwoliłoby zapisać połowę operacji. Wiersz jedzie
**w całości**, więc magazynek, `ammoId`, dodatki z 31 i zużyte OB z 15 przeżywają przeprowadzkę
bez ani jednej linijki o nich. **Pancerz przychodzi ZDJĘTY** — to jedyne pole, które funkcja
zmienia po drodze, i jest to reguła, nie szczegół. **Przekazanie na kartę z właścicielem jest
PROPOZYCJĄ** (wzorem wezwania z 32: nic się nie rusza do „Przyjmij", a wiersze czyta się
z zapisanej karty czatu, nie z żądania klienta); kartę **bez** właściciela nie ma kto potwierdzić,
więc tam idzie od ręki i ack mówi `pending: false`. **Łup nie czeka nigdy.** **Zasięg to długość
ramienia (`CPRED_MELEE_REACH_M`), mierzona wszystkim — MG włącznie**, wzorem Ustabilizowania
z 14e; przy `give` warunku nie ma, gdy karty nie stoją na wspólnej scenie, przy `take` tej furtki
nie ma. **Gracz przeszukuje wyłącznie kartę bez właściciela, leżącą albo martwą i w zasięgu.**
Klient **nie zna `characterId` cudzej figury** — łup adresuje się żetonem, a listę źródeł buduje
serwer. Osiem umów kodu i pięć pułapek w indeksach niżej. **Menu figury („🎒 Przeszukaj…") nie
było oglądane w przeglądarce** — pozycja w `zaleglosci.md`; reszta etapu przeszła oględziny.

**Figura ostatystykowana ma od 05.09 KARTĘ POSTACI — kolumna `Token.combatProfile` nie
istnieje.** Umowa etapu 16b („statysta nie jest osobą") została **cofnięta decyzją MG**: ganger,
funkcjonariusz Wsparcia, Demon i wieżyczka mają prawdziwy rekord `Character`, stoją w rosterze
obok Vex i mają zwykły ekwipunek — **i to jest jedyny powód**, dla którego etap 38b (przekazywanie
przedmiotów) da się w ogóle napisać. W silniku zasad **nie ma już gałęzi „to statysta"**. Trzy
liczby, których karta sama by nie utrzymała — **Wartość bojowa** (s. 158, sięga 16, a Umiejętność
karty ma sufit 10), **zakaz uniku przed pociskami** i **wydrukowane PW** — plus poziom broni
siedzą w `CpredCharacterData.statBlock`; wchodzą do liczb **wyłącznie** przez `sheetForRoll`.
**`hpMax(data.stats)` na pełnej karcie jest odtąd błędem** — jest `cpredSheetHpMax(data)`, ta sama
umowa co `cpredEffectiveStats` z 39, w drugim obszarze. Sześć pól menu figury pisze **`token:stat`**
(zakłada kartę i podpina ją jednym zdarzeniem), a **karta ginie z figurą tylko na pytanie** i tylko
gdy nie ma właściciela ani innej figury pod sobą. Migracja przepisała trzy figury poligonu w SQL-u
z zachowaniem PW, amunicji, ran i pancerza. Dziewięć umów kodu i cztery pułapki w indeksach niżej.
**Menu figury nie było oglądane w przeglądarce** — pozycja w `zaleglosci.md`.

**Cechy dają się od 05.09 obniżyć na godzinę — do etapu 39 nie było na to żadnej drogi.**
Efekt jest **wierszem karty** (`CpredCharacterData.statEffects`), nie gałęzią w kodzie: Cecha,
liczba **wylosowana raz i zapisana**, źródło, długość i **dwa terminy naraz** — runda walki (16h)
i minuta zegara świata (37). Wygasa **alternatywa**: schodzi ten, który dogonił pierwszy.
**Jedyna droga do liczby, na którą pada kość, to `cpredEffectiveStats(sheet)`** — od tej sesji
`data.stats[...]` znaczy „liczba wydrukowana na karcie". **Pule są wyjątkiem i liczą się z bazowej**
(maks. PW, pula SZ, sufit Człowieczeństwa) — inaczej godzina pod Nerwosolem zabrałaby punkty na
stałe przez `normalizeCharacterData`; to świadome odstępstwo od zdania „BC rusza PW" w opisie
etapu, zapisane w `decyzje-i-uproszczenia.md`. **Podłoga Cechy to 1, ale nigdy wyżej niż wartość
bazowa** — Empatia zerowa z cyberpsychozy ma zostać zerowa. **Czarny LOD nakłada Nerwosol, Lisz
i Skorpion sam** (`NET_PROGRAM_HOOKS_MANUAL` jest odtąd **pustą listą**), a `gametime.ts` dostał
**pierwszy i jedyny wyjątek** od „zegar podpowiada, nie rządzi": po skoku zdejmuje to, czego czas
minął. Osiem umów kodu i pięć pułapek w indeksach niżej. **UI etapu nie był oglądany
w przeglądarce** — pozycja w `zaleglosci.md`.

**Kampania ma od 05.09 własny zegar — do tej sesji czas istniał wyłącznie w rundach walki.**
`Campaign.gameTime` to **minuty od epoki, liczone w UTC** (nie `DateTime`: strefa maszyny nie ma
nic wspólnego z porą dnia w Night City), start to **1 stycznia 2045, 08:00**. Datę i godzinę
widzi cały stół w górnym pasku; MG klika chip i dostaje okno z czterema skokami
(**+10 min, +1 h, do rana, +1 dzień**) oraz **ustawieniem daty wprost** — jedyną drogą, którą da
się zegar cofnąć. Skok jedzie **identyfikatorem, nie liczbą minut**, i zostawia publiczną kartę
czatu (rodzaj `time`). **Zegar podpowiada, nie rządzi:** przekroczenie pierwszego dnia miesiąca
zapala kropkę przy zegarze i sekcję z gotowym „Rozlicz", skok o dobę podsuwa listę rannych
z guzikiem „Odpoczynek" — **żadne z tego nie dzieje się samo**. Wpis dziennika niesie odtąd datę
świata obok realnej (`JournalEntry.worldDate`, stemplowana przez serwer przy powstaniu wpisu).
**Gracz nie widzi tarczy zegara** — dostaje „15 marca 2045 · rano", bo godzina obiecywałaby
dokładność, której skok-na-kliknięcie nie dotrzyma; karta czatu traci minuty dla wszystkich.
Osiem umów kodu i osiem pułapek w indeksach niżej.

**Przy tym etapie wyszła klasa błędów, która przeżyła dwa etapy: `visibleTo` w `chat-io.ts` jest
BIAŁĄ LISTĄ rodzajów czatu.** Wiersza, którego na niej nie ma, historia nie zwraca — dociera
rozgłoszeniem na żywo i **znika przy pierwszym przeładowaniu**, a widzi go wyłącznie **autor**
(przez `{ authorId: user.id }`), więc z jednego konta wygląda na sprawny. Tak siedziały dwa
błędy naraz: `time` (37) i **`recovery` (30b)** — obie karty opisane w kodzie jako publiczne.
Naprawione, z dwoma testami patrzącymi **oczami gracza**. Przy okazji: **cztery rozgłoszenia
rysowały `seq`, a klient go nie konsumował** (`compendium:upsert`, `compendium:delete`,
`shop:tier`, `time:set`) — każde takie zdarzenie robiło lukę i zbędny `state:request` całemu
stołowi. Też naprawione. **Nowy rodzaj wiersza czatu ma odtąd PIĘĆ miejsc, nie cztery.**

**Mapa umie od 05.09 trzy rzeczy, których nie umiała przez trzydzieści cztery etapy:** wskazać
palcem (**`Alt`+klik = ping**, `Alt+Shift` u MG przyciąga wszystkim widok), wziąć **wiele figur
naraz** (**`Shift`+przeciągnięcie** = ramka, `Shift`+klik dokłada, **`Ctrl+A`** bierze wszystkie
sterowalne) i **skopiować figurę** (**`Alt`+przeciągnięcie**, „Ganger" → „Ganger 2"). Ramka
i `Ctrl+A` biorą **wyłącznie figury, którymi ten widz może sterować** — u gracza własne, u MG
wszystkie. Pasek operacji staje u dołu mapy **od dwóch figur**: ukryj/pokaż, naklejki, duplikuj,
do walki, kosz z pytaniem. **`Delete` figur nadal nie dotyka** i to zostaje. **Ruch grupowy
działa poza walką, w walce nie** (budżet metrów z 14c jest per figura). Atrapa `gm:ping`
z etapu 03 wreszcie zniknęła. Osiem umów kodu i cztery pułapki w indeksach niżej.

**Kopie zapasowe istnieją od 05.09 — do tej sesji cała kampania stała na jednym pliku
`packages/server/dev.db`.** Snapshot powstaje przy **starcie serwera i co godzinę** (`VACUUM INTO`,
bez zatrzymywania stołu), zostaje **24 ostatnich i 14 dób wstecz**, a `uploads/` idą do każdej
kopii **twardym dowiązaniem** — więc trzydzieści osiem samowystarczalnych kopii kosztuje 14 MB
grafik raz. Przywracanie **nie ma guzika i mieć nie będzie**: `pnpm --filter @vtt/server restore`
przy zatrzymanym serwerze, z kopią stanu sprzed przywrócenia. Doszła zakładka MG **„Kopie"**
(lista kopii, zrzut kampanii z przełącznikiem czatu, eksport i import karty oraz sceny).
**Uwaga na nazwę: „backup" w tym repo znaczy Zdolność Wsparcie z 30c** — kopie to `snapshot`
i `archive`. Wyszedł przy tym **jeden błąd**: polski znak w nazwie pliku wywracał pobieranie
błędem 500. Osiem umów kodu i cztery pułapki w indeksach niżej.

## Drobiazgi wyprowadzone razem z akapitami

**Import kompendium z 01.09.2026** dołożył plik `attachments.json` (osiem wpisów) i dwie kolumny
magazynków dziesięciu typom broni. Sama uwaga „`data/private/cpred/compendium/` bywa starsze niż
parser" została w `POSTEP.md`, bo obowiązuje nadal; ta liczba jest już tylko historią importu.
