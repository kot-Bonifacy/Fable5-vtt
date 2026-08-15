# Postęp prac

Aktualizowany na koniec każdej sesji. Statusy: ⬜ nierozpoczęty · 🟨 w toku · ✅ ukończony · ⛔ wycofany.
Pełne notatki z zamkniętych etapów: `archiwum/dziennik-sesji.md` (nie czytaj rutynowo — tylko gdy potrzebujesz szczegółu konkretnego etapu).

| #   | Etap                                          | Status | Data ukończenia | Uwagi                                                                                           |
| --- | --------------------------------------------- | ------ | --------------- | ----------------------------------------------------------------------------------------------- |
| 01  | Szkielet projektu i środowisko                | ✅     | 2026-07-16      | repo: Fable5-vtt; shared konsumowany jako źródła TS (decyzja w README)                          |
| 02  | Baza danych, użytkownicy, role                | ✅     | 2026-07-16      | Prisma 7 (adapter better-sqlite3); dodatkowy model `CampaignMember`                             |
| 03  | Rdzeń realtime i czat                         | ✅     | 2026-07-17      | moduł `realtime` (rejestr zdarzeń z rolą); szepty bez seq; fix `pnpm dev` (`--raw`)             |
| 04  | Mapa i sceny                                  | ✅     | 2026-07-17      | pixi-viewport 6 OK z Pixi v8; MG ma niezależny podgląd scen (pokoje per-scena)                  |
| 05  | Tokeny                                        | ✅     | 2026-07-17      | HP widoczne tylko dla właściciela+MG; ikony statusów z game-icons (CC BY)                       |
| 06  | Silnik kości CP RED                           | ✅     | 2026-07-18      | krytyk/fumble auto dla pojedynczej d10; /gr = autor+MG (styl Foundry)                           |
| 07  | Karta postaci — model i edytor                | ✅     | 2026-07-18      | umiejętności Easy Mode (41) w data/public; gracz też tworzy postaci; okna pływające             |
| 08  | Karta interaktywna i integracja               | ✅     | 2026-07-24      | rzuty z karty zawsze przez kubek; karta = źródło prawdy dla PW tokenu                           |
| 09  | AI Gateway — fundament botów                  | ✅     | 2026-07-24      | ~80 tok/s, kontekst 32k; think sterowany per żądanie; model zmyśla zasady (RAG: 19)             |
| 10  | Edytor botów                                  | ✅     | 2026-07-25      | + guardraile roli, auto-powtórka i nauka z korekt MG (rozszerzenie)                             |
| 11  | Boty NPC na czacie                            | ✅     | 2026-07-25      | pamięć per scenka; wypowiedź bota nie do odróżnienia od `/jako` MG                              |
| 12  | ~~TTS — głos botów~~                          | ⛔     | wycofany 09.08  | był gotowy 26.07 (Piper); kod usunięty, został sam maszynopis tekstu u klienta                  |
| 13  | Dane z podręcznika i kompendium               | ✅     | 2026-07-27      | domknięty 26.07 na darmowych materiałach; 27.07 uzupełniony z podręcznika głównego              |
| 14  | Inicjatywa i tury                             | ✅     | 2026-07-26      | tracker = pasek nad mapą + zakładka „Walka”; remisy: REF, przerzut RAW i drag                   |
| 14b | Ekonomia akcji: budżet tury i katalog         | ✅     | 2026-07-30      | + Ustabilizowanie od zera (etap 15 go nie miał, wbrew opisowi); „przepuść" jako karta MG        |
| 14c | Ruch w turze: budżet metrów na mapie          | ✅     | 2026-07-31      | metry po surowej ścieżce kursora (decyzja MG); kara pancerza i ran krytycznych jako dane        |
| 14d | Zwarcie: Pochwycenie, Duszenie, Rzut          | ✅     | 2026-07-31      | etap 14d podzielony na 14d/14e; migotliwy test death save miał inną przyczynę niż notatka       |
| 14e | Automaty tury: rany krytyczne, DoT, monity    | ✅     | 2026-07-31      | strażnik hooków w osobnej kolumnie (budżet tury jest odtwarzany); + kary płaskie z ran          |
| 15  | Obrażenia, pancerz, krytyki, Death Save       | ✅     | 2026-07-27      | obie tabele ran z podręcznika głównego (nieoficjalna tabela głowy zastąpiona 27.07)             |
| 16  | Zasięgi, DV z mapy, autofire                  | ✅     | 2026-07-28      | wręcz: PT zastępczy z karty celu + przycisk „Unik” (RAW nie zna statycznego PT)                 |
| 16b | Linia strzału i atak z mapy                   | ✅     | 2026-07-31      | etap 16b podzielony na 16b/16c; linia strzału = blokady wzroku strzelca, nie druga geometria    |
| 16c | Osłony jako obiekty sceny                     | ✅     | 2026-08-01      | osłona jedzie do klienta (ściana nie); blokada miękka z kartą wyboru zamiast twardej            |
| 16d | Granaty, obszary i rzut przedmiotem           | ✅     | 2026-08-01      | zwężony (amunicja → 16g); odchylenie pudła to zasada domowa — podręcznik jej nie ma             |
| 16e | Ruch klikiem: zaznaczenie, automat chodzenia  | ✅     | 2026-07-31      | trasa gracza tylko po tym, co widzi teraz — maska eksploracji nie pamięta ścian                 |
| 16f | Celowanie kursorem i HUD walki                | ✅     | 2026-08-01      | model klasycznego CRPG (klik we wroga celuje, MG przez Alt); HUD w nowym lewym pasku            |
| 16g | Amunicja specjalna: kule zmieniające rachunek | ✅     | 2026-08-07      | podzielony na 16g/16h 07.08; nabój = wpis kompendium, śrut jedzie tą samą drogą co wybuch       |
| 16h | Amunicja bez obrażeń: testy, gaz i dym        | ✅     | 2026-08-07      | dym tylko utrudnia (−4), nie zasłania; minuta = 6 rund, poza walką zdejmuje MG przyciskiem      |
| 17a | Fog of war i warstwa MG                       | ✅     | 2026-07-28      | etap 17 podzielony na 17a/17b; nowa scena startuje zakryta, mgła przełączalna                   |
| 17b | Rysowanie po mapie                            | ✅     | 2026-07-28      | tekst skaluje się z mapą (odstępstwo od wskazówki); MG domyślnie rysuje u siebie                |
| 18a | Ściany i widoczność tokenów                   | ✅     | 2026-07-29      | etap 18 podzielony na 18a/18b; ściany nie opuszczają serwera                                    |
| 18b | Ciemność i źródła światła                     | ✅     | 2026-07-30      | zwężony 30.07 (eksploracja → 18c, drzwi/okna → 18d); 160 fps przy 10 światłach                  |
| 18c | Eksploracja i mgła MG nad widocznością        | ✅     | 2026-07-30      | + „zapal pomieszczenie", tłumienie światła przez okno i wygładzenie gradientu                   |
| 18d | Interakcje z drzwiami i oknami                | ✅     | 2026-07-30      | zasięg ręki 2 m, zamek MG; okno = firanka, a od dopisku 18e też otwierany otwór                 |
| 19a | Fundament RAG i asystent zasad MG             | ✅     | 2026-08-08      | etap 19 podzielony na 19a/19b/19c 08.08; embeddingi na CPU (0 GB VRAM), hybryda z FTS5          |
| 19b | Baza wiedzy kampanii i kontekst botów         | ✅     | 2026-08-08      | tag = jedyny język uprawnień; filtr w SQL przed mnożeniem wektorów; podręcznika bot nie czyta   |
| 19c | Streszczenia sesji, dziennik, relacje NPC     | ✅     | 2026-08-08      | dziennik = trzecia kolekcja RAG; wpis rodzi się „tylko MG"; relacja do karty postaci (−3…+3)    |
| 20a | Akcje botów: structured output i rzuty        | ✅     | 2026-08-08      | etap 20 podzielony na 20a/20b 08.08; gramatyka GBNF tylko w decyzji, wypowiedź zostaje prozą    |
| 20b | Tura bota w walce                             | ✅     | 2026-08-08      | „Graj turę” zawsze na klik (decyzja MG); ruch = podejdź/odsuń się, trasę liczy serwer           |
| 21  | ~~STT — polecenia głosowe~~                   | ⛔     | wycofany 09.08  | nierozpoczęty; głos wypadł z projektu w całości                                                 |
| 22  | ~~WebRTC — czat głosowy graczy~~              | ⛔     | wycofany 09.08  | nierozpoczęty; głos graczy załatwia zewnętrzny komunikator                                      |
| 23a | Cyborgizacje i człowieczeństwo                | ✅     | 2026-08-09      | etap 23 podzielony na 23a/23b/23c 09.08; EMP bieżące liczone z Człowieczeństwa wchodzi w rzuty  |
| 23b | Ekonomia: eurodolce, zakupy, lifestyle        | ✅     | 2026-08-09      | saldo pisze wyłącznie serwer (audyt `LedgerEntry`); pasmo ceny = cena; Poziom życia opcjonalny  |
| 23c | Reputacja i Facedown                          | ✅     | 2026-08-09      | PL nazwa to „Konfrontacja"; Reputacja wyliczana z listy wyczynów, −2 wybiera przegrany          |
| 24a | Handouty                                      | ✅     | 2026-08-09      | etap 24 podzielony na 24a/24b/24c 09.08; markdown własnym parserem w `shared`                   |
| 24b | Dziennik kampanii dla stołu                   | ✅     | 2026-08-09      | uprawnienie gracza to osobna kolumna, nie trzeci szczebel `visibility`; szukanie u klienta      |
| 24c | Screamsheets                                  | ✅     | 2026-08-13      | `kind` na handoucie z 24a; kroje gazetowe (OFL) hostowane u siebie; nagłówek = tytuł handoutu   |
| 25a | Kreator postaci: rola, cechy, umiejętności    | ✅     | 2026-08-14      | etap 25 podzielony na 25a/25b 14.08; dwie metody (Krawędziarz, Kompletny Pakiet), bez Szablonów |
| 25b | Kreator: Ścieżka Życia                        | ✅     | 2026-08-14      | etap 25b podzielony na 25b/25c 14.08; 71 tabel, 522 wiersze; wróg → szkic bota jednym klikiem   |
| 25c | Kreator: wyposażenie startowe i poziomy       | ✅     | 2026-08-14      | 4 poziomy z ceny; +53 wpisy sprzętu z podręcznika (kompendium miało 5); pakiet Roli → POMYSŁY   |
| 26a | Sieć: dane, architektura i cyberdek           | ✅     | 2026-08-14      | etap 26 podzielony na 26a/26b/26c 14.08; ekran Sieci = pływające okno (decyzja MG)              |
| 26b | Run: punkty dostępu, winda i Akcje Sieciowe   | ✅     | 2026-08-15      | etap 26b podzielony na 26b/26c 15.08; punkt dostępu = obiekt sceny, ukryty do Skanera           |
| 26c | Walka w Sieci: Programy, Paf, Ślizg, LOD      | ✅     | 2026-08-15      | efekt Programu = dane wpisu; `Combatant.tokenId` nullowalny — LOD stoi w kolejce bez figury      |
| 26d | Demony, węzły kontrolne i systemy obronne     | ⬜     |                 |                                                                                                 |
| 27a | Karta jak oficjalna: strona pierwsza          | ✅     | 2026-08-13      | wydzielony z 27 dnia 13.08 (27a/27b/27c); motyw dzień/noc na razie tylko dla karty              |
| 27b | Karta: broń, pancerz, ekwipunek               | ✅     | 2026-08-13      | zakładka „Walka" zniknęła; pancerz = 3 wiersze wydruku + reszta; trzy nowe pola prozy           |
| 27c | Karta: Ścieżka Życia i cyborgizacje           | ✅     | 2026-08-14      | sylwetka = gotowy SVG z domeny publicznej; gniazdo na ciele to nowe pole wiersza wszczepu       |
| 27  | Kości 3D i szlif UI                           | ⬜     |                 | po wydzieleniu 27a–c zostaje: skórki kości, ustawienia, motyw dla reszty UI, wydajność          |
| 28  | Wdrożenie na VPS                              | ⬜     |                 |                                                                                                 |

## Od czego zacząć

Ostatnio zamknięte: **26c** (Programy z deku, Paf, Ślizg, Czarny LOD z darmowym atakiem
i wstawką do kolejki inicjatywy, obrażenia w mózg z Pancerzem, rachunek za awaryjne odłączenie).
Netrunning ma od teraz **komplet walki** — brakuje już tylko Demonów i systemów obronnych (26d).

**🎯 Poligon jest przygotowany pod stół — nic nie trzeba budować od nowa.** Na scenie
„Strzelnica" stoi odsłonięty **„Punkt dostępu"** (Architektura „siec klub": piętro 1
„Poczekalnia", piętro 2 „Strażnik piętra" z Piekielnym ogarem) i obok niego żeton **„Kolec"**
związany z kartą **„Test 27x"** — Netrunner z Interfejsem 7 i cyberdekiem doskonałej jakości
(Gumka, Pancerz, Miecz, Młot na wroga, Superklej, Szabloząb). Tryb turowy jest **wyłączony**;
kolejka „PRZED WALKĄ" z Tonym i avatar9 wraca jednym kliknięciem „Włącz tryb turowy".

**⚠️ Jedna rzecz do zrobienia ręcznie: „Poligon bojowy" stoi teraz na poziomie sklepu 1
(Uliczne).** Migracja daje każdej kampanii `shopTier = 1`, więc do czasu przesunięcia
przełącznika gracz nie kupi niczego droższego niż 50 ed. Przełącznik 1–4 jest w zakładce
**„Kompendium"** pod chipami kategorii; MG kupuje przez wszystkie poziomy niezależnie od niego.

**Następne etapy do wyboru:** **26d** (Demony broniące się Testem Interfejsu, węzły kontrolne
sięgające do Somy, trzy tabele systemów obronnych — domyka rozdział 11), **27** (kości 3D,
motyw dzień/noc dla reszty UI, wydajność) i **28** (VPS). **Sesja zerowa z drużyną** jest nadal
najlepszym testem 25a+25b+25c i trzech stron karty naraz.

**09.08 głos wypadł z projektu** (sesja bez etapu, decyzja MG): etapy **12, 21 i 22** wycofane, kod TTS usunięty z repo. Szczegóły w `archiwum/dziennik-sesji.md` i w `archiwum/wycofane/README.md`.

### Otwarte zaległości (przechodzą między etapami)

- **Etap 26c — pięć ścieżek nieodklikanych; reszta sprawdzona 15.08 (patrz notatka sesji).**
  (1) **Strona gracza** — całe okno walki oglądane było z konta MG; różnica w kodzie **jest**
  i jest zamierzona (gracz nie dostaje ATK/OBR/PER/PRĘ LOD-a ani jego efektu, dopóki ten go nie
  dopadnie), pokryta testem `netcombat.test.ts` na payloadzie, ale nikt na to nie patrzył oczami
  gracza. (2) **Superklej i „Zdejmij" u MG** — hak `glue` ma test w `shared`, a w przeglądarce
  do niego nie doszło: trzeba wrogiego LOD-a z tym efektem (Kraken) albo Superkleju w cudzym
  deku. (3) **Paf** — sprawdzony testem serwera, w oknie klikany był tylko Miecz. (4) **LOD
  przeciwprogramowy** (bije w losowy zrezowany Program zamiast w mózg) — cały przypadek pokryty
  testami, nieoglądany. (5) **Zderezowanie LOD-a przez gracza** i wypadnięcie go z kolejki —
  w oględzinach LOD schodził do REZ 10, nie do zera.

- **Etap 26c — „raz na rundę w Somie" świadomie pominięte.** „Załadowany na cyberdek Program
  można aktywować tylko raz na rundę w Somie" (s. 201) nie jest egzekwowane: rundy istnieją
  wyłącznie w trybie turowym, a zakres etapu wymienia inne ograniczenia Programów („jedna kopia
  naraz", „raz na wejście", derez i dwie Akcje na przywrócenie), które są. Wpis w `POMYSLY.md`.

- **Etap 26c — Powłoka i Tarcza są na razie martwe z samego RAW.** „Redukuje do 0 ATK
  atakujących cię Programów typu Agresor, **niebędących Czarnym LOD-em**" i „pierwszy udany atak
  Programu **niebędącego Czarnym LOD-em**" — a jedynym, co atakuje w Sieci przed 26d i przed
  wrogim netrunnerem, są Czarne LOD-y. Kod obu obrońców jest napisany i pokryty testami
  (`netShellActive`, `netShieldFor`); czeka na przeciwnika, którego zdanie nie wyklucza.

- **Etap 26b — dwie ścieżki nieodklikane; „Sieć 1/4" domknięte 15.08 przy 26c.** (1) **Ściana
  między netrunnerem a gniazdem** (`NET_WALL_BLOCKS`) — Poligon nie ma ścian na scenie
  „Strzelnica"; geometria to `hasLineOfFire` z 16b, ta sama, którą 16b odklikało. (2) **Odmowy
  `NET_NO_INTERFACE` i `NET_NO_DECK` w przeglądarce** — pokryte testami serwera, u MG nieoglądane
  (przycisk „Podłącz się" po prostu wraca z odmową). ~~(3) Budżet Akcji Sieciowych w trackerze~~
  — **odklikane 15.08**: w RUNDZIE 1 wiersz Kolca pokazał „Akcja 1/1 · Sieć 1/4" po pierwszej
  Akcji Sieciowej.

- **Etap 26b — trzy rzeczy świadomie uproszczone, do rozważenia przy stole.** (1) **Promień
  Skanera to wynik Testu w metrach** — podręcznik mówi „MG określa dokładną liczbę znalezionych
  punktów dostępu" i nie daje żadnej liczby, więc to czytanie VTT, nie RAW; MG ma obok przycisk
  „Odsłoń graczom" na karcie gniazda. (2) **Zwiad liczy piętra wszerz** (obie drogi w dół
  z rozgałęzienia naraz), bo mapa, która patrzy tylko w trzon, ukrywałaby odgałęzienie, do
  którego RAW każe zanieść Wirusa. ~~(3) Piętro z Czarnym LOD-em odkrywa się, ale nic się na nim
  nie dzieje~~ — **domknięte w 26c 15.08**: wejście na takie piętro stawia LOD-a w szybie,
  a `metIce` służy dziś do tego, do czego było pisane — do rachunku za awaryjne odłączenie.

- **Etap 26a — trzy ścieżki nieodklikane, wszystkie po stronie MG albo skrajnego przypadku.**
  (1) **Formularz „Obrona Sieci"** w edytorze MG kompendium (REZ, Interfejs, Akcje Sieciowe,
  Wartość bojowa, ikona) — kategoria była przełączana, ale pola nie były wypełniane ani
  zapisywane; pokryte testem w `compendium.test.ts`. (2) **Ręczne budowanie architektury
  od zera** przyciskiem „+ Nowa" — oglądana była wyłącznie wylosowana; różnicy w kodzie nie ma
  (obie drogi kończą się na tym samym `net:save`), ale pusty trzon z „+ Piętro" nie był klikany.
  (3) **Pasek „Uwagi" pod szybem** (`netArchitectureAdvice`) — hasło bez PT i piętro LOD-u bez
  wpisu; generator zawsze wypełnia oba, więc do tego stanu trzeba dojść ręczną edycją.
  Sam tekst jest pokryty testem w `netrunning.test.ts`.

- **Etap 26a — biblioteka Architektur jest niewidoczna dla gracza z założenia, ale nikt nie
  patrzył na to okiem gracza.** `net:*` ma rolę `ROLE_GM` i emituje wyłącznie do `gmRoom`,
  co pokrywa test „never lets a player near the library" (lista, odczyt i zapis odmawiają).
  W przeglądarce sprawdzone było tylko to, że u MG zakładka „Sieć" stoi w rzędzie MG.

- **Etap 26a — szybka sekwencja zmian na karcie gubi część edycji (błąd spoza etapu).**
  Cztery Programy wkładane do deku co 600 ms zostawiły dwa: `queueCharacterSave` łata store
  optymistycznie, ale echo serwera (`endSave`) podmienia **całą** postać, więc łatka wysłana
  w trakcie lotu poprzedniej przepada. Przy 1,6 s odstępu wszystko wchodzi. **To nie jest
  regresja 26a** — dotyczy każdej listy na karcie (broń, sprzęt, pancerz) od etapu 07; deku
  tylko łatwiej to wywołać, bo każda instalacja podmienia całą listę gniazd. Wpis w `POMYSLY.md`.

- **Etap 27c — trzy ścieżki nieodklikane, wszystkie po stronie gracza albo skrajnego przypadku.**
  (1) **Strona gracza** — obie nowe strony oglądane były wyłącznie na koncie MG; różnicy w kodzie
  nie ma (jedyne pole tylko dla MG na stronie drugiej to Reputacja, i było takie już w 23c),
  ale gracz ich nie klikał. Zapis gracza jest za to pokryty testem na żywych gniazdach
  (`characters.test.ts` — „the player writes their own page two and places their own chrome").
  (2) **Postać wychodząca prosto z kreatora** — sprawdzona była karta, w którą Ścieżkę wpisano
  ręcznie; przepływ „kreator wypełnia 17 pytań → strona druga je pokazuje" idzie tym samym
  polem `data.lifepath`, więc rozjazd jest nieprawdopodobny, ale nie był oglądany.
  (3) **Wąskie okno** — `@container (max-width: 560px)` zwęża rubryki do jednej kolumny
  i zmniejsza pudełka gniazd; okno karty ma `min(1180px, 100vw − 32px)`, więc do tego progu
  trzeba ekranu poniżej ~600 px, a `resize_window` na zmaksymalizowanym oknie nic nie daje.

- **Etap 27c — cztery gniazda kończyn dzielą jedną pulę.** Rysunek pyta „która ręka?", ale
  arytmetyka gniazd modyfikacji z 23a dalej liczy **per rodzina** (`cyberwareCapacity`), więc
  „Cyberkończyny 2 / 8" nie mówi, czy obie modyfikacje siedzą w tej samej ręce. To świadome
  uproszczenie z 23a i `bodySlot` go nie znosi — zniósłby je dopiero licznik gniazd per sztuka
  sprzętu, czyli inny model danych. Wpis do rozważenia w `POMYSLY.md`.

- **Etap 25c — cztery ścieżki nieodklikane, wszystkie po stronie gracza albo uploadu.**
  (1) **Wgranie portretu w kreatorze** — przycisk widziany i naprawiony, ale pliku nie
  wgrywano; trasa to ta sama `/api/uploads/portraits` co na karcie z etapu 07. (2) **Odmowa
  poziomu u gracza** — „Kup" ma być wyszarzone, a serwer ma wrócić „Poza zasięgiem sklepu.
  Poziom 2 (Zawodowe) — kampania ma odblokowany 1 (Uliczne)"; pokryte testem na żywych
  gniazdach, w przeglądarce oglądane z konta MG (który jest z blokady zwolniony).
  (3) **Druga sztuka tego samego przedmiotu** w koszyku (chip „×2" i wiersz „nazwa ×2"
  w audycie) — klikane było „+" po jednej sztuce; pokryte testem. (4) **Kreator u gracza** —
  cały krok wyposażenia oglądany był u MG; różnicy w kodzie nie ma (poziom 1 obowiązuje
  obie strony), ale na koncie gracza nie był klikany.

- **Etap 25c — Krawędziarz nie dostaje odgórnego pakietu Roli.** RAW (s. 98 i 103) daje mu
  broń, pancerz, ekwipunek i modę z tabeli swojej Roli **plus** 500 ed; VTT daje na razie samą
  gotówkę, a pakiet dokłada MG przyciskiem „Dodaj za darmo". Świadome (decyzja MG z 14.08):
  te trzy tabele w zrzucie PDF-a to jeden sklejony ciąg dla pięciu Ról naraz. Wpis w `POMYSLY.md`.

- **Etap 25c — 800 ed Kompletnego Pakietu „tylko na Modę" jest napisem, nie pieniędzmi.**
  VTT nie ma katalogu ubrań (tabela Mody z s. 356 nie jest zaimportowana), więc krok
  wyposażenia mówi o tych pieniądzach i ich nie wydaje. Dodanie ich do portfela byłoby
  prezentem — za 800 ed można kupić karabin. Wpis w `POMYSLY.md`.

- **Etap 25b — dwie tabele Ścieżek Ról są nagłówkami, nie pytaniami.** `exec.relacje` („Obecne
  stosunki z szefostwem") i `nomad.filozofia` („Ogólna filozofia watahy") wchodzą do danych
  z pytaniem zastąpionym własnym nagłówkiem kolumny („Relacje", „Filozofia"), bo podręcznik
  wprowadza je tytułem, a zrzut PDF-a skleja ten tytuł z ostatnim wierszem tabeli **wyżej**.
  Czytelne przy stole, ale nie jest to zdanie z książki.

- **Etap 25b — dwie binarne decyzje Ról zostały poza danymi.** „Masz partnera czy pracujesz
  sam?" (Netrunner, Technik, Medyk, Fixer) i „Działasz w zespole czy solo?" (Rocker) to
  w podręczniku wybór bez kości, więc parser ich nie czyta — bierze wyłącznie tabele kostkowe.
  Skutek: kreator pokazuje pytanie o partnera bezwarunkowo, tak jak robi to książka („Jeśli
  masz partnera, kim jest?"). Wpis w `POMYSLY.md`.

- **Etap 25b — kostki na karcie Ścieżki świecą jak krytyki.** Ten sam drobiazg co przy rozkładzie
  Cech z 25a: rzut `13k10 + 4k6` maluje dziesiątki na zielono, a jedynki na czerwono, choć to
  numery wierszy tabel. Do rozważenia razem ze szlifem kubka w etapie 27.

- **Etap 25a — cztery ścieżki nieodklikane.** (1) **Odmowa serwera przy przepełnionej puli** —
  „Utwórz postać" jest wyszarzone, więc do `CREATION_INCOMPLETE` w przeglądarce się nie dojdzie;
  pokryte testem serwera. (2) **Degradacja bez `creation.json`** — kreator ma wtedy powiedzieć
  „Brak danych tworzenia postaci…" zamiast pustego okna (`CREATION_DATA_MISSING`); w repo jest
  próbka publiczna, więc ten stan wymagałby skasowania obu plików. ~~(3) **Wybór właściciela przez MG**~~ —
  **odklikane 14.08 przy 25b**: MG utworzył postać z listy „NPC (MG) / Tony / avatar9 / Marcin"
  i w bazie stanęła z właścicielem **Marcin**. (4) **Rangi Postaci inne niż „początkująca"** — selektor
  pokazuje pięć pozycji (50–80 pkt), klikana była tylko domyślna 62.

- **Etap 25a — kostki na karcie rozkładu świecą jak krytyki.** Rzut `10k10` rysuje dziesiątki
  na zielono, a jedynki na czerwono, bo tak czat maluje **każdą** kostkę k10. Tu 10 i 1 to
  numery wierszy szablonu, nie krytyk ani fumble (`roll.critical` jest puste i żadna plakietka
  się nie pojawia). Kosmetyka; do rozważenia razem ze szlifem kubka w etapie 27.

- **Etap 25a — nazwa umiejętności wielokrotnej nie ma gdzie zamieszkać (zostały trzy z czterech).**
  „Nauka (wybierz 1)", „Gra na instrumencie (wybierz 1)" i „Wiedza lokalna" to w podręczniku
  umiejętności ze specjalizacją, a `CpredCharacterData.skills` trzyma samo `skillId → poziom`,
  więc kreator zapisuje „Nauka 4" bez dziedziny. **„Język" wypadł z tej listy w 25b** — nazwę
  trzyma `lifepath.language`, wybierana z listy sąsiadującej z wylosowaną kulturą pochodzenia,
  a podsumowanie kreatora mówi wprost „na poziomie 4 — Farsi". Wpis w `POMYSLY.md`.

- **Etap 27b — rana krytyczna w nowym panelu nieobejrzana.** „Krytyczne Urazy" w kolumnie
  tożsamości widziane wyłącznie w stanie pustym („bez ran krytycznych"), bo — jak przy 14e —
  **MG nie ma czym nadać rany ręcznie**; wchodzi tylko z rzutu obrażeń z dwiema szóstkami (1/36)
  albo z nietrafionego testu amunicji z 16h. Sam JSX wiersza (nazwa, `2k6 = N`, chip „na minutę",
  „+N do Testu Przeżywalności", efekt, kosz) jest przeniesiony bez zmian logiki — zmieniły się
  klasy. Wpis o przycisku MG „nadaj ranę krytyczną" jest w `POMYSLY.md` od 14e.

- **Etap 27a — motyw dzienny kończy się na oknie karty.** To świadome i zapisane w zakresie:
  `data-theme='day'` przemalowuje `.sheet-window` (od 27b także pas broni i pancerza, a od 27c
  **wszystkie trzy strony wydruku razem z sylwetką** — sprawdzone 14.08 w obu motywach), ale
  mapa, panele boczne, czat i **okno kubka z rzutem** zostają ciemne. Reszta UI dochodzi
  w etapie 27.

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

- **Etap 24c — 📰 rysuje się jednobarwnie.** Na Windowsie emoji gazety wypada z Segoe UI Emoji
  do symbolicznego zamiennika, więc obok kolorowych 📄 i 🖼 wygląda jak ikona konturowa.
  Kosmetyka; do zmiany razem ze szlifem UI w etapie 27.

- **Etap 24b — wyszukiwarka nie zna polskiej odmiany.** Szukanie jest dopasowaniem podciągu
  po tekście bez znaków diakrytycznych, więc `barman` znajduje „barmana" i „barmanem", ale
  `barmanem` **nie znajdzie** „barmana". Przy stole to zwykle wystarcza (wpisuje się temat, nie
  zdanie), a lematyzacja polszczyzny to osobny kawałek roboty — wpis w `POMYSLY.md`.

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

- **Etap 24a — grafika po usunięciu handoutu zostaje na dysku.** `uploads/handouts/` nie ma
  sprzątacza: usunięcie handoutu (albo podmiana grafiki na inną) kasuje wiersz w bazie, ale
  plik zostaje. Świadome — dokładnie tak samo zachowują się mapy z etapu 04, portrety z 07
  i tokeny z 05, a osobny mechanizm zbierania sierot dotyczyłby wszystkich czterech naraz.
  Wpis w `POMYSLY.md`.

- **Etap 24a — odmowy uploadu nieodklikane.** Plik > 12 MB, obraz > 4096 px na bok i format
  spoza PNG/JPG/WebP mają wrócić po polsku z `uploadErrorText`; sprawdzony był wyłącznie
  poprawny PNG. Ścieżka jest kopią routingu portretów z etapu 07.

- **Etap 23c — zostały dwa przyciski przegranego u gracza.** Sekcja Reputacji u gracza, który
  **ma** wyczyny, jest odklikana (11.08, niżej). **Nieobejrzane:** „Wycofaj się" / „Nie ustępuj
  (−2)" na karcie czatu, gdy przegraną jest **figura gracza** (pokryte testem `o wycofaniu
decyduje przegrany, nie zwycięzca`) — Konfrontacje z 10.08 szły z konta MG, więc przyciski
  oglądał MG, nie gracz.

- **Etap 23c — „Cofnij" na karcie obrażeń nie przywraca strachu.** Świadome i opisane
  w `realtime/damage.ts`: gdy przeciwnik spada do 0 PW, status „Onieśmielony" schodzi ze
  wszystkich, którzy się go bali (RAW: „znika, gdy tylko uda ci się pokonać wroga"), ale karta
  obrażeń nie zapisuje, komu go zdjęła, więc cofnięcie obrażeń go nie wraca. Powrót: MG
  zaznacza status ręcznie w menu tokenu.

- **Etap 23c — status „Onieśmielony" zaznaczony ręcznie nic nie robi.** Kara wymaga
  **dwóch** rzeczy naraz: naklejki na tokenie i adresu przeciwnika w `Token.statusData`
  (`sheetFacedownPenalty`). To celowe — dzięki temu odznaczenie statusu w menu tokenu jest
  pełnym „zdejmij karę" — ale znaczy też, że sama naklejka jest wtedy dekoracją.

- **Etap 23b — trzy ścieżki nieodklikane.** (1) **Karta przelewu na ekranie odbiorcy** — przelew
  wychodzi z konta gracza poprawnie (11.08, niżej), a wiersz czatu ma `recipientId`, więc dociera
  do obu stron i MG; nikt nie był jednak zalogowany jako **Tony**, żeby to zobaczyć. Potrzeba
  trzeciego hosta — patrz „Pułapki dev". (2) **Zakup pancerza i sprzętu** — sprawdzona tylko broń; wiersze pancerza
  (`spCurrent`, lokacja, kara) i sprzętu idą tą samą funkcją `purchasedSheetRow` i mają test
  w `shared`, ale w przeglądarce nie były klikane. (3) **Wpis bez ceny liczbowej** — „Kup" ma być
  wtedy wyszarzony, a cena ma się liczyć z pasma; w kompendium kampanii wszystkie oglądane wpisy
  miały cenę. (4) **„Znaleziony — montaż N ed"** przy cyborgizacji (s. 375) — przycisk istnieje
  i jest pokryty testem, klikany był tylko wariant pełnopłatny.

- **Etap 23b — lista odbiorców przelewu odświeża się przy otwarciu „Kasy".** Postać utworzona,
  gdy panel jest już rozwinięty, pojawi się na liście dopiero po zwinięciu i ponownym rozwinięciu.
  Świadome: listę przynosi `economy:history` razem z audytem (klient gracza nie zna cudzych kart),
  a odświeżanie jej na każdą zmianę czegokolwiek w kampanii byłoby zapytaniem na każdy zapis karty.

- **Etap 23a — dwie ścieżki nieodklikane.** (1) **Chip cyberpsychozy
  na liście postaci** (`character-psychosis` w `CharacterPanel.tsx`) — dopisany **po** oględzinach,
  więc widziany tylko w kodzie; pokazuje się dopiero przy EMP ≤ 2, czyli po utracie ~40 punktów
  Człowieczeństwa. (2) **Edytor MG wpisu cyborgizacji** z nowymi polami (rodzina, montaż, UC stałe
  i kostkowe, „Połowa, w górę", gniazda, „Wymaga") — formularz nie był otwierany.

- **Po wycofaniu głosu (09.08) zostały dwa katalogi na dysku — do skasowania ręcznie.**
  Nie usuwa ich żaden skrypt i nic ich już nie czyta:
  `Remove-Item -Recurse -Force C:\AI\tts` (350 MB modeli głosu Pipera) oraz
  `Remove-Item -Recurse -Force C:\AI\web\VTT\uploads\tts-cache` (772 KB zsyntezowanych
  wypowiedzi). Katalog `uploads/voices/` nie powstał — próbek do klonowania nigdy nie wgrano.
  Zmienne `GATEWAY_TTS_*` warto też skasować z lokalnego `ai-gateway/.env` (w `.env.example`
  już ich nie ma; gateway ignoruje nieznane klucze, więc nic się przez nie nie psuje).

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

- **Etap 20b — `NO_ROUTE` mówi „droga jest zablokowana", choć zwykle nie jest.** Ta sama odmowa
  leci w **trzech** różnych sytuacjach (`bot-combat.ts:487` i pętla w okolicy 657): A\* nie znalazł
  trasy, przycięcie do budżetu zostawiło mniej niż dwa punkty, albo przycięta trasa kończy się
  **tam, gdzie się zaczęła** (bot już stoi przy celu). Ostatnia z nich jest najczęstsza i wtedy
  zdanie kłamie — MG idzie szukać ściany, której nie ma. Widać to na czacie z 10.08 („Podejście
  do: Tony … NIE DA SIĘ TAM DOJŚĆ — DROGA JEST ZABLOKOWANA"), gdzie figura bota stała już obok
  celu. Rozdzielić na trzy zdania albo dopisać powód do karty.

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
  (klik narzędziem osłon przecieka do warstwy gry — `MapRenderer.ts:1044`).
  Ustalenie ważne dla reszty list: **odmowy statusowe są u MG niesprawdzalne** —
  `realtime/movement.ts:216` zwalnia MG z blokad, więc wszystko, co „ma odmówić ruchu",
  trzeba oglądać na koncie gracza.

- **Etap 16g — odklikany 08.08 poza dwoma punktami.** Zostają: (6) linia „pancerz −2" na karcie obrażeń i (7) **Podpalony** po amunicji zapalającej wraz z „Cofnij" gaszącym status. Reszta sprawdzona; przy okazji wyszły błędy #2, #3, #4 i #5. ~~Do sprawdzenia: (1) **wybór naboju** na wierszu broni w karcie postaci (nowy `select` w kolumnie „Amunicja"; ma pokazywać tylko naboje pasujące do tej broni, a przy Miotaczu ognia być wyszarzony); (2) **koszt zmiany naboju w walce** — poza walką zmiana jest darmowa, w turze ma zejść Akcja i magazynek ma się napełnić; (3) **chip naboju na slocie paska akcji** (fioletowa ramka obok „seria"/„zapora"); (4) **pomarańczowy stożek 6 m** chodzący za kursorem, gdy w ręku jest broń ze śrutem — i to, że **klik dalej celuje w figurę**, a nie w pole (inaczej niż granat); (5) **karta ataku** z listą trafionych w stożku i wierszem „zasłonięty ścianą"; (6) **karta obrażeń** z linią „nabój: … · pancerz −2 (zamiast −1)"; (7) **Podpalony** na tokenie po trafieniu zapalającą i „Cofnij" gaszące go; (8) kategoria **„Amunicja"** w zakładce Kompendium (chip z licznikiem, karta wpisu z „Pasuje do", edytor MG z polami naboju).~~ Kampanii nie ruszałem — wpisy amunicji i miotacz ognia są w `data/private`, na żadnej karcie postaci nic nie zostało dopisane, więc do oględzin trzeba komuś dać strzelbę.

- **Etap 16h — odklikany 08.08 poza jednym punktem.** Zostaje wyłącznie chip „na minutę — do rundy N" **na karcie postaci** (na karcie obrażeń jest). Reszta poniżej — sprawdzona, opisy zostawione dla kontekstu. ~~Do sprawdzenia: (1) **karta ataku gazem** — brak przycisku „Obrażenia", linia „test Odporność na tortury/narkotyki PT 13" i wiersze „nie oparł się — 2k6 bezpośrednich"; (2) **karta obrażeń** z linią „nabój: …" i przyciskiem **„Minęła minuta"** u MG (i to, że po kliknięciu przycisk znika, a PW zostają); (3) **statusy na tokenie** po amunicji usypiającej (Powalony + Nieprzytomny) i **ikona EMP** po nabojach EMP; (4) **rana krytyczna „na minutę"** na karcie postaci — nowy chip „na minutę — do rundy N" obok nazwy rany; (5) **kwadrat dymu** na mapie (szary, pod tokenami, z napisem „Dym −4”), a w rzucie z jego wnętrza **nazwany wiersz „Dym −4"** w rozbiciu; (6) **gumka dymu** przy narzędziu osłon (licznik „dymu: N" i kosz); (7) przycisk **„Popraw strzał 1k10+10"** po pudle o ≤ 4 amunicją inteligentną, wraz z ostrzeżeniem o Celowniku optycznym; (8) **edytor MG** wpisu amunicji z nowymi polami (test, porażka, dym, poprawka).~~ Kampanii nie ruszałem — wpisy amunicji są w `data/private`, więc do oględzin trzeba komuś dać granat i wpisać nabój przez Przeładowanie.

- **Górny pasek tury (01.08, poza etapami) — strona MG odklikana 08.08 poza jednym punktem.** Przy resecie walki po wpadce z 19a sprawdziły się trzy z czterech: **„Włącz tryb turowy"** w pustej belce zakłada kolejkę z figur sceny jednym klikiem (wyszła piątka: Rico, Kaya, Manekin, Brutus, Zbir, stan „PRZED WALKĄ", inicjatywa nierzucona); **✕** rzeczywiście pyta „Wyłączyć tryb turowy?" i kasuje kolejkę; **żeton ukryty** (Zbir) jest przygaszony i widoczny tylko u MG. **Zostaje:** strzałki **◀ ▶** przesuwające turę **bez zaznaczonego tokenu** — to była główna przyczyna, dla której zostały na górze. Potwierdzone przy okazji: `window.confirm` da się przechwycić (`window.confirm = () => true`) i nie zawiesza sterowania przez CDP; przycisku wyszarzonego na scenie bez tokenów nie sprawdzano.

- **Lewy pasek (01.08, poza etapami) — dwie ścieżki nieodklikane.** (1) **Przejęcie sterowania klikiem w slot**: sprawdzone na Vexie, ale wszystkie jego sloty były odmówione („Akcja w tej turze już wykorzystana"), a odmówiony slot celowo sterowania **nie** przejmuje — do powtórzenia na figurze z wolną Akcją (po naciśnięciu slotu ma zniknąć linia „Podgląd", a na tokenie ma pojawić się przerywany pierścień). (2) **Zmiana sceny**: pasek ma wtedy wczytać figurę zapamiętaną na nowej scenie, a nie zostać przy starej — ścieżka `SelectionChange = 'scene'`. Strona MG jest z założenia nietknięta (sama pamięć, bez domyślnej figury), więc u MG wystarczy sprawdzić, że pasek nadal zachowuje się jak przed zmianą.

- **Etap 16d — odklikany 08.08 poza dwoma punktami.** Zostają: „zasłonięty: Samochód" na liście trafionych obszarem oraz **„Rzuć"** zwykłą bronią. Pudło z odchyleniem, `Esc`, „Odskocz", „Zastosuj wszystkim" i regresja 16e — sprawdzone. ~~**Dlaczego oględziny się nie odbyły:** w kampanii nie ma jeszcze **przedmiotu** „granat" — dopisałem sam _typ_ broni (`weapon-type.grenade` w `data/private`), ale kupowalnego wpisu w kompendium nie ma, a jego utworzenie plus dopisanie wiersza na karcie Vexa to zmiana danych żywej kampanii w środku trwającej RUNDY 1; na to nie pytałem. Do sprawdzenia po założeniu granatu: (1) pomarańczowy kwadrat 5×5 pól chodzący za kursorem, z krzyżykiem na polu środkowym; (2) klik w podłoże ładujący kubek „Granat → wybrane pole"; (3) karta z listą trafionych i wierszami „zasłonięty ścianą" / „zasłonięty: Samochód"; (4) „Zastosuj wszystkim (N)" na karcie obrażeń i „Cofnij" działające na pojedynczy wiersz; (5) pudło — linia „odchylenie — kierunek 1k10 = … · odległość 1k10 = … − ZW …" i krater przesunięty o pole albo dwa; (6) przycisk „Odskocz" u figury z REF 8+; (7) „Rzuć" w `AttackLauncher` na zwykłej broni; (8) `Esc` chowający szablon; (9) **regresja 16e**: z granatem w ręku podgląd trasy ma zniknąć, a po schowaniu wrócić.~~

- **Etap 16c — strona MG odklikana 08.08.** Postawienie osłony przeciągnięciem, presety, gumka, dwustopniowy `Esc`, karta wyboru „Ostrzelaj osłonę / Strzelaj mimo osłony", obrażenia osłony z „Cofnij", wrak i to, że wrak **przestaje zasłaniać** — wszystko działa (szczegóły w pliku testów). **Zostało:** kosz **„usuń wszystkie osłony"**. Z gumki wyszedł **błąd #8**.

- **Etap 16f — formularze paska nieodklikane**: Ustabilizowanie, Pochwycenie i Wstrzymanie Akcji otwierają w pasku **te same** komponenty co zakładka „Walka" (`CombatForms.tsx`), ale przez pasek nie były klikane — sprawdzone tylko to, że sloty się pojawiają i mają skróty.

- **Etap 16e — odklikane częściowo (na koncie gracza), reszta czeka na mysz.** **Sprawdzone 31.07 na koncie Johnny:** klik w token → zaznaczenie (biały przerywany pierścień), podgląd trasy pod kursorem z licznikiem „15,2 m" i znacznikiem ✖, oraz odmowa poza turą (trasa przestaje się rysować). **Zostało do sprawdzenia:** (1) sam marsz po kliknięciu w podłoże i odsłanianie mgły w jego trakcie; (2) obejście rogu korytarza przez trasę; (3) klik za zasięgiem tury → ✖ na granicy budżetu i wygaszony ogon; (4) kursor „idź w tę stronę" nad czernią; (5) Esc / klik w trakcie marszu; (6) przerwanie marszu przez NPC wychodzącego zza rogu; (7) Shift+klik → żółty punkt załamania; (8) PPM w puste → odznaczenie; (9) **przeciąganie tokenu działa jak przed etapem** (najważniejszy test regresji — patrz `DRAG_CLICK_GRACE_MS`); (10) token 2×2 przy metrowych drzwiach. Punkty 1–8 wymagają tury dla postaci, którą się steruje — na scenie kampanii turę ma ukryty NPC, więc oględziny zrób na osobnej scenie albo po przekazaniu tury.

- **Kliknięcie w token było zepsute dla graczy od 18a — naprawione w 16e, ale zaległości oględzin z tego okresu warto powtórzyć.** Warstwy przykrywające przechwytywały hit-test (szczegóły w „Pułapki dev"), więc gracz na scenie z dynamiczną widocznością **nie mógł kliknąć ani przeciągnąć żadnego tokenu**. To prawdopodobnie realna przyczyna części wpisów „strona gracza nieodklikana" niżej — przy ich odhaczaniu sprawdź najpierw, czy rzecz w ogóle dawała się kliknąć.

- **35 broni markowych ma opisy po angielsku** — wymaga przebiegu `tools/import/translate-descriptions.py` przy włączonym llama-serverze (`pwsh ai-gateway/scripts/start-gateway.ps1`, potem `uv run --with httpx python tools/import/translate-descriptions.py`). Bez GPU się nie da, więc czeka na sesję z gatewayem.
- **Etap 13 — UI kompendium odklikane tylko powierzchownie**: 30.07 (przy oględzinach 14b) potwierdzona sama zakładka „Kompendium" — chipy kategorii z licznikami (Broń 103, Pancerz 11, Sprzęt 5, Cyborgizacje 3, Rany krytyczne 22) i lista wpisów z obrażeniami i ceną. **Nadal nieodklikane:** karta przedmiotu z tabelą PT, edytor MG, dodanie przedmiotu na kartę postaci. Ścieżki serwerowe pokryte testami.
- **Etap 09 — zakładka „AI" u MG niezweryfikowana wizualnie** (sesja toczyła się na koncie gracza). Późniejsze etapy oglądały u MG inne zakładki, więc to prawdopodobnie martwa zaległość — sprawdź przy okazji.
- **Etapy 18d/18e — strona gracza nieodklikana**: ikona 🪟 u gracza, „Za daleko — podejdź do okna", „Okno zamknięte na skobel", „Zamknięte na klucz". Pokryte testami dymnymi na payloadzie.
- **Etap 14e — rany krytyczne są nieosiągalne ręcznie, więc karta odmowy u gracza zostaje nieobejrzana.**
  Odmowa Akcji przy Urazie kręgosłupa i monit przy Urazie ucha widziane u MG, ale **nie** na
  ekranie gracza. Próba z 11.08 utknęła nie na automatyzacji, tylko na tym, że **MG nie ma czym
  nadać rany krytycznej**: na karcie postaci sekcja „Rany krytyczne" wyłącznie **usuwa** wiersze
  (`CriticalInjuries` w `CharacterSheet.tsx`), karta wpisu w kompendium nie ma „Dodaj postaci",
  a w menu tokenu są tylko statusy. Rana wchodzi **jedynie** z rzutu obrażeń z flagą
  `criticalDamage` (dwie szóstki na 2k6 — 1/36) albo z nietrafionego testu amunicji z 16h
  (`check.failure.injuries`). Do „Urazu kręgosłupa" trzeba jeszcze trafić 2k6 = 10 w tabeli
  Korpusu (3/36), więc w oględzinach jest to nieosiągalne. **Sam mechanizm karty odmowy u gracza
  jest już potwierdzony trzy razy** (budżet 14b, dystans 14c, status Powalony) — nieobejrzane
  zostaje wyłącznie zdanie rany w treści karty. Wpis do `POMYSLY.md`: przycisk MG „nadaj ranę
  krytyczną" (RAW i tak pozwala MG przypisać ranę narracyjnie).
- **Ślad ścieżki przy przeciąganiu nieobejrzany**: `left_click_drag` z CDP jest natychmiastowy, więc łamana z licznikiem metrów rysuje się i znika między klatkami. Do sprawdzenia ręcznie — myszą.
- **Etap 14d — została odmowa Uniku Ludzkiej tarczy**: karta testu spornego z „Broń się"
  u broniącego się gracza i odmowa ruchu Trzymanemu są **odklikane 10.08** (na czacie
  „Pochwycenie → Test P1 … Obrona Test P1: 5 → mimo wszystko udane" i „Odmowa: Pochwycony token
  nie może wykonać własnej Akcji Ruchu"). Zostaje `SHIELD_CANNOT_DODGE` („Ludzka tarcza nie może
  unikać ataków dystansowych") — wymaga **trzeciej figury na scenie**: ktoś musi strzelić do
  trzymającego, żeby tarcza w ogóle dostała przycisk „Unik". Na Strzelnicy są dwie figury.
- **Etap 16b — strona gracza i klik w cel nieodklikane**: klik w token ładujący kubek ataku, „🎯 Atak…" w menu kontekstowym tokenu i edytor profilu bojowego w „Edytuj…" — wszystkie trzy wymagają trafienia wskaźnikiem w warstwę Pixi, czego CDP nie dowozi (pułapka niżej). Pokryte 13 testami dymnymi w `attacks.test.ts`.
- **Osłona nie blokuje ruchu po stronie serwera** — jak ściany. Trasa A* u klienta omija samochód i przeciągnięcie przez niego nie zostanie odrzucone; `validateTokenMove` dalej liczy sam dystans. Wraca razem z kolizjami ruchu (POMYSLY, 30.07).
- **Etap 16b — statysta nie może aktywnie unikać**: PT obrony statysty liczy się z jego profilu (Unik), ale przycisk „Unik" na karcie ataku pojawia się wyłącznie dla celu z kartą postaci, bo `attack:evade` wymaga `characterId`. Do domknięcia razem z 16c albo osobnym wpisem w POMYSLY.
- **Rany warunkowe zostają prozą**: „Strzaskane palce −4 do Akcji **tą ręką**" i „Złamana szczęka −4 do Akcji **związanych z mówieniem**" nie mają flagi maszynowej, bo VTT nie wie, co jest w której dłoni ani która czynność jest mówieniem. MG stosuje je ręcznie — wróci to razem ze śledzeniem broni w dłoniach (POMYSLY, 30.07).
- **`data/private/rulebook/manual/tabela-ran-krytycznych.md` jest poza repo** — na czystej maszynie trzeba go dostarczyć albo wpisać tabelę głowy w edytorze.

### Pułapki dev (kosztowały czas więcej niż raz)

- **Sesję gracza i sesję MG DA się mieć naraz w jednym oknie Chrome** (ustalone 09.08 przy 24b,
  obala wpis „sesja gracza w tej samej przeglądarce wylogowuje MG"): ciasteczko jest kluczowane
  **hostem**, a `localhost` i `[::1]` to dwa różne hosty, mimo że Vite słucha na obu. MG zostaje na
  `http://localhost:5173/`, gracz wchodzi na **`http://[::1]:5173/join/<token>`** i wybiera swoje
  imię (bez hasła). Obie sesje widzą się nawzajem na liście obecności i dostają rozgłoszenia na
  żywo. **`127.0.0.1` nie zadziała** — dev-serwer Vite nasłuchuje pod `localhost`, czyli na
  pętli IPv6. Link zaproszenia bierze się z „Panel MG"; token jest wielorazowy, więc powrót tego
  samego gracza nie tworzy nowego konta. To znosi powód, dla którego kilkanaście pozycji niżej
  ma dopisek „wymaga drugiego profilu Chrome". **Trzeci gracz naraz wymagałby trzeciego hosta**
  (dwa konta graczy w kampanii to Tony i avatar9) — do sprawdzenia, czy Vite wpuści np.
  `localhost.` z kropką na końcu albo `[0:0:0:0:0:0:0:1]`; alternatywnie przelogowanie się
  w karcie `[::1]` na drugie imię.

- **Zrzut ekranu bywa WYCINKIEM okna, a nie całym oknem — i wtedy klikanie po współrzędnych
  ze zrzutu chybia** (ustalone 11.08, kosztowało pół godziny). Narzędzie przelicza podane
  współrzędne przez `innerWidth / szerokość_zrzutu`, ale gdy okno jest szersze niż ekran, zrzut
  pokazuje tylko lewy-górny kawałek strony — obie skale się rozjeżdżają i klik ląduje kilkadziesiąt
  pikseli obok. Objaw jest mylący: element **widać** na zrzucie, a klik w niego nic nie robi.
  **Rozpoznanie:** weź dowolny przycisk, porównaj `getBoundingClientRect()` z jego pozycją na
  zrzucie; jeśli iloraz nie równa się `innerWidth / szerokość_zrzutu`, zrzut jest przycięty.
  **Obejście:** klikaj **referencjami** z `find` / `read_page` (nie współrzędnymi), a dla warstwy
  Pixi licz `arg = CSS / (innerWidth / szerokość_zrzutu)`. `resize_window` na zmaksymalizowanym
  oknie nic nie daje.
- **Wielokrokowe przeciągnięcie tokenu DA się wysłać automatem** (11.08): `pointerdown` na
  `canvas`, seria `pointermove` na `window` **i** `canvas` z przerwami ~70 ms, na końcu
  `pointerup` — tak jak przy kubku w 23c. `left_click_drag` z CDP też dochodzi i też kończy się
  odmową serwera, więc obie drogi nadają się do testów budżetu ruchu.
- **Vite potrafi zapamiętać PUSTY moduł, jeśli plik był przepisywany w trakcie** (14.08).
  Skrypt, który czyta plik, przetwarza i zapisuje z powrotem, ma między tymi krokami moment,
  w którym plik na dysku jest pusty — a jeśli Vite akurat wtedy go przeczyta, zapamięta pustkę
  **razem ze stemplem `?t=`** i będzie ją serwować także po przeładowaniu strony. Objaw jest
  mylący: `tsc --noEmit` przechodzi, a przeglądarka mówi
  „does not provide an export named 'X'". **Rozpoznanie:** `curl http://localhost:5173/<ścieżka>`
  — pusty moduł ma w mapie źródeł `sourcesContent: [""]`. **Obejście:** przepisz plik jeszcze
  raz (samo dotknięcie mtime wystarczy); przeładowanie strony **nie** pomaga.

- **HMR przy działającym Pixi wywala stronę** wyjątkiem `Ticker.remove` — po edycji plików klienta przeładuj kartę.
- **`window.confirm` w panelach zawiesza sterowanie przeglądarką przez CDP** — omijaj przyciski „usuń" przy automatyzacji albo poproś użytkownika o kliknięcie.
- **Menu kontekstowe tokenu DA się otworzyć automatem** (ustalone 09.08 przy 23c, koryguje
  wpis niżej): `right_click` z CDP go nie dowozi, ale ręcznie wysłany
  `canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 2, clientX, clientY }))`
  owszem — Pixi v8 słucha zdarzeń **wskaźnika**, nie mysich. Współrzędne trzeba przeliczyć ze
  zrzutu na CSS-owe (`window.innerWidth / szerokość_zrzutu`). Tą drogą przeszły w 23c: menu,
  launcher Konfrontacji i potrząśnięcie kubkiem (`pointerdown` na `.dice-cup`, seria
  `pointermove` na `window`, `pointerup`). **Uwaga:** menu jest wystawiane **tylko MG**
  (`MapArea.tsx:455`), więc u gracza nie otworzy się niezależnie od sposobu klikania.

- ~~**Do warstwy Pixi nie dociera przez CDP ŻADNE zdarzenie wskaźnika na tokenie**~~ — **to była błędna diagnoza, obalona 31.07 w 16e.** Kliknięcia docierały zawsze; nie działał **hit-test**, i to dla wszystkich, także dla prawdziwej myszy. Pełnoekranowe warstwy przykrywające (płachta widoczności z 18a u gracza, mgła z 17a u każdego, kto ją ma włączoną) leżą **nad** warstwą tokenów i domyślnie biorą udział w trafianiu, więc Pixi zwracał jako cel `Viewport` zamiast `TokenNode`. Naprawa: `eventMode = 'none'` na warstwach czysto malarskich (`init` w `MapRenderer`). **Skutek dla planowania sesji:** oględziny rzeczy wymagających kliknięcia w token są znowu wykonalne automatem — sprawdzone w 16e (zaznaczenie, podgląd trasy, odmowa). Zanim zapiszesz „CDP tego nie dowozi", wypisz w logu `event.event.target` z `viewport.on('clicked')`: jeśli to `Viewport`, a nie `TokenNode`, problem jest w hit-teście, nie w automatyzacji.
- **Zdarzenie wysłane bez potwierdzenia (`socket.emit('x', payload)`) docierało na serwer z pustym payloadem** — `registerEvents` uznawał jedyny argument za brakujący callback. Naprawione 31.07; objaw był zupełnie inny niż przyczyna (token skacze u obserwatorów, patrz notatka sesji). Nowe zdarzenie bez acku sprawdź testem serwera, bo klient nie dowie się o odmowie — nie ma czym.
- **Dane CP RED (`skills.json`, `roles.json`) wczytywały się dopiero po otwarciu „Postaci" albo karty postaci** — `ensureCpredDataLoaded` wołały tylko te dwa komponenty. Dopóki każdy atak zaczynał się od karty, nikt tego nie zauważył; HUD z 16f zaczyna go z mapy, więc **każdy strzał wracał z „Nie wiem, jaką umiejętnością strzelać z tej broni"** (`UNKNOWN_SKILL` — pusty rejestr umiejętności, nie brak danych w kompendium). Naprawione 01.08: `MapArea` woła je razem z `ensureStatusesLoaded`. **Wniosek na przyszłość:** nowe wejście do mechaniki sprawdź na **świeżo przeładowanej karcie, bez otwierania żadnej zakładki** — to jedyny stan, w którym takie leniwe ładowanie widać.
- **Po `prisma migrate dev` upewnij się, że klient się przegenerował** (`prisma generate`) — stary klient w `src/generated/` daje `Unknown argument`.
- **Haseł w formularze nie wpisuję** — sesję MG zakłada użytkownik, sesję gracza zakłada się kluczem z panelu MG (bez hasła).
- **Edycja kodu w trakcie oględzin przeładowuje kartę, a wtedy pisanie staje się skrótami klawiszowymi.** Kosztowało to 08.08 przypadkowe przeskoczenie tury w żywej kampanii: po edycie `realtime/rules.ts` `tsx watch` zrestartował serwer, Vite przeładował stronę, ognisko wyszło z pola tekstowego — i wpisywane zdanie poleciało do globalnych skrótów mapy (**każde „e" to „koniec tury"**, litery uzbrajają narzędzia). **Zasada:** albo kończysz edycje przed wejściem do przeglądarki, albo przed każdym pisaniem robisz zrzut i sprawdzasz, że kursor stoi w polu. Po wpadce `Esc` rozbraja uzbrojone narzędzie.
- **`reasoning_budget` w llama-server nie działa dla wartości dodatnich** — przyjmuje 640 bez błędu, ale egzekwuje wyłącznie 0 i −1. Każda ścieżka z `reasoning: true` musi umieć obsłużyć **pustą odpowiedź** po zużyciu całego `max_tokens` na blok think. Szczegóły w `ai-gateway/README.md`.
- **Testy dymne serwera potrafią raz na kilka przebiegów pęknąć na limicie czasu** — każdy plik podnosi własny Fastify z Socket.IO, więc przy pełnym `pnpm --filter @vtt/server test` bywa ciasno. Zaobserwowane 08.08: dwa różne przypadki (`ammo.test.ts`, `ammo-effects.test.ts`) pękły po jednym razie na trzy przebiegi i **oba przeszły uruchomione osobno**. Zanim zaczniesz szukać regresji, powtórz sam plik.
  **Korekta z 14.08:** w przypadku `ammo.test.ts` limit czasu **nie był przyczyną** — test „an
  armour-piercing round takes two points of SP" pękał **także uruchomiony sam**, raz na kilka
  przebiegów, i to z powodu dwóch źródeł losowości w samym teście (zdarty pancerz celu + rzut
  2k6, który nie przechodzi przez pancerz). Naprawiony; 12 przebiegów bez porażki. **Wniosek
  ogólny:** zanim uznasz migotanie za „ciasny limit czasu", sprawdź, czy komunikat mówi
  o **czasie**, czy o **asercji** — ten mówił o asercji przez pół roku.

## Notatki z dwóch ostatnich sesji

### Sesja 15.08 (druga tego dnia) — etap 26c (walka w Sieci: Programy, Paf, Ślizg, Czarny LOD)

**Efekt Programu jest danymi, nie kodem — i to jest cały etap w jednym zdaniu.** Podręcznik
drukuje przy każdym Programie jedno zdanie („Zadaje 3k6 obrażeń Programom niebędącym Czarnym
LOD-em lub 2k6 Programom typu Czarny LOD"), a 26c musi na nim działać. Czytanie tego zdania
w kodzie znaczyłoby `switch` po polskich nazwach — i MG, który wymyśli własny Program,
dostałby coś, co silnik grzecznie ignoruje. Więc zdanie zostaje opisem wpisu, a obok niego
siedzi `CpredNetProgramEffects`: kości obrażeń wobec trzech rodzajów celu, premia Dopalacza,
rodzaj Obrońcy, dziewięć nazwanych haków i trzy flagi („niszczy zamiast derezować", „tylko
jedna kopia", „raz na wejście"). Wszystkie 27 Programów z podręcznika ma to wypełnione przez
`parse-netrunning.py`, a MG dopisuje własne **formularzem** w edytorze kompendium.

**Agresora się nie trzyma uruchomionego — odpala się go atakiem.** „Są uruchomione przy Ataku,
a kiedy zostaną użyte, wyłączają się automatycznie" (s. 201), więc jedna Akcja Sieciowa kupuje
cały atak, a w `rezzed` siedzą wyłącznie Dopalacze i Obrońcy. To także jedyne czytanie, przy
którym wychodzi przykład Pafa ze s. 201: netrunner z czterema Akcjami Sieciowymi naprawdę
zdąży odpalić trzy Programy ofensywne i jeszcze Pafnąć.

**Obie strony wymiany rzuca się naraz.** Inaczej niż przy Pochwyceniu z 14d, drugą stroną jest
Program — nie ma komu podać przycisku „Broń się". Karta pokazuje więc wymianę zamkniętą, a
`opposed.won` jest jej wyrokiem; remis przegrywa, bo podręcznik mówi „większy od". **Rzut
netrunnera eksploduje i fumbluje** (to Test), rzut Programu nie — Program nie ma Umiejętności,
a zasada krytyka wisi w podręczniku przy Testach Umiejętności. Ta asymetria kosztowała trzy
migotliwe testy serwera, zanim została nazwana.

**Decyzja MG z 15.08: Czarny LOD rusza się wyłącznie na klik MG.** RAW odpala darmowy atak
w chwili, gdy netrunner wejdzie na piętro; VTT stawia tam LOD-a jako **czyhającego** i daje MG
dwa przyciski — „LOD wykrywa intruza" (test PRĘ, darmowy efekt przy przegranej, wskoczenie na
czoło kolejki) oraz „Tura LOD-a". Druga decyzja MG: **bez trackera walka w Sieci też działa** —
zasady liczone w rundach (raz na Turę, zegar Superkleju) po prostu wtedy nie gryzą.

**Tracker nauczył się nieść uczestnika bez ciała.** „LOD zajmuje pierwsze miejsce w Kolejce
Inicjatywy, o jeden punkt wyżej" (s. 205) — to wstawka, nie przerzut. `Combatant.tokenId` jest
od tego etapu **nullowalny**, a wiersz niesie `label`, `netRunId` i `netIceId`. Zmiana przeszła
przez 25 miejsc w serwerze i 16 u klienta i wszystkie znalazł kompilator: nowy typ
`FiguredCombatantRow` zawęża wiersz tam, gdzie zasada mówi o ciele (Pochwycenie, ogień, statusy,
rzut inicjatywy), a `combatantName` maluje resztę. Wiersz LOD-a w trackerze ma chip „W SIECI",
nie ma kostki i znika razem z runem.

**Obrażenia w mózg idą ścieżką `directDamage` z 16h.** Karta jest zwykłą kartą obrażeń
z „Cofnij", pancerz ich nie zatrzymuje, a jedyne, co je obniża, to zrezowany **Pancerz
(Program)** — bo to Program, nie zbroja. Podpalenie („cyberdek i ubranie zaczynają się palić")
to ten sam status Podpalony i ten sam automat 2 obrażeń na koniec Tury, co w 16h.

**Rachunek za awaryjne odłączenie wreszcie jest wystawiany.** 26b zapisywało listę napotkanych
LOD-ów „na poczet 26c"; teraz wyjście poza 6 m bez odłączenia zbiera efekty **wszystkich, które
jeszcze działają** (s. 198), a Olbrzym, który sam wyrzucił netrunnera, jest z rachunku wyłączony
(„z wyjątkiem efektu tego Olbrzyma"). Kod dzieli się na trzy pliki, żeby to było w ogóle
możliwe: `netice.ts` (efekty + awaryjne odłączenie) nie importuje `tokens.ts` i zwraca listę
figur do odświeżenia, bo to `tokens.ts` woła go po każdym ruchu.

**Ślizg zdejmuje LOD-a z ogona, a nie z Architektury.** Udany test odsyła netrunnera na
sąsiednie piętro (hasła nie da się minąć), a LOD zostaje **czyhający na piętrze, z którego
uciekł** — i przestaje być „wykryty", więc powrót to nowe „gdy się na niego natkniesz". Bez
tego zresetowania czyhający LOD byłby po Ślizgu martwym meblem do końca runa.

**Dwa haki zostają dla MG** (decyzja MG z 15.08): „na godzinę obniża 1k6 INT, REF i ZW" oraz
„RUCH −1k6 na godzinę". Oba to zegar spoza walki na Cechach, których karta nie umie obniżyć
na godzinę i przywrócić; karta czatu nazywa efekt po polsku, MG go zapisuje.

**Zweryfikowane:** 1165 testów w `shared` (40 nowych w `netcombat.test.ts`), 676 na serwerze
(18 nowych w `netcombat.test.ts` na żywych gniazdach — wymuszonych **danymi wpisów**, nie atrapą
losowości: „Zawsze trafia" ma ATK 30, „Nigdy nie trafia" OBR 30), `tsc --noEmit` czysty
w trzech pakietach, ESLint, Prettier i `pnpm build` bez uwag. Migracja:
`20260815133929_stage26c_net_combat` (nullowalny `tokenId` + trzy kolumny, dane przeniesione 1:1).

**Trzy błędy spoza etapu, znalezione po drodze.** (1) **Gniazdo deku gubiło mechanikę Programu** —
`validateInstalledProgram` (26a) i `install()` u klienta kopiowały wybrane pola i nie znały
`effects`; obie drogi chodzą teraz przez jedną funkcję `netProgramProfileOf`, która kopiuje wpis
w całości. (2) **`ammo-effects.test.ts` pękał raz na kilkanaście przebiegów** na asercji „1k10 + 10
nie wyjdzie poniżej 11" — wyjdzie, jeśli padnie naturalna jedynka; ta sama rodzina błędu, którą
`POSTEP` opisuje przy `ammo.test.ts`. (3) **Zmiana karty w trakcie runa nie docierała do okna
Sieci** — `character:update` emituje teraz `netrun:sync`, gdy postać ma otwarty run.

**Odklikane u MG** w kampanii „Poligon bojowy". Potwierdzone: **sekcja CYBERDEK** w oknie Sieci
z sześcioma Programami, klasą, mechaniką w jednej linii („2k6 Programom · 3k6 Czarnym LOD-om")
i uczciwym „przeciwbiałkowy — Czarnemu LOD-owi nic nie zrobi" przy Superkleju; **Uruchom
Pancerz** → „zrezowany · REZ 7/7", „zużyty na to wejście", nagłówek „CYBERDEK · PANCERZ ZDEJMUJE
4 Z OBRAŻEŃ W MÓZG"; **wejście na piętro z LOD-em** stawiające „Piekielnego ogara" (czyha,
REZ 20/20, u MG ATK 6 / OBR 2 / PER 6 / PRĘ 6); **atak Mieczem** („1d10+8 = 14 · obrona 1d10+2 = 12
· 3k6 = 10 · REZ 10") z linią publiczną „Miecz — trafienie w Sieci"; **„LOD wykrywa intruza"**
(wygrany test → bez darmowego ataku, LOD przechodzi w „ściga"); **„Tura LOD-a"** trafiająca
w mózg („2k6 = 5, Pancerz zdjął 4 — 1 w mózg") z kartą obrażeń „PW 35 → 34" i „Cofnij";
**Ślizg** („ucieczka o piętro, Piekielny ogar zostaje czyhającym") wraz z wyszarzeniem „Atakuj"
i podpowiedzią „Ten Czarny LOD jest na innym piętrze"; **awaryjne odłączenie** przy wyjściu poza
6 m z rachunkiem („rachunek za 1: Piekielny ogar: 2k6 = 7, Pancerz zdjął 4 — 3 w mózg");
**wstawka do kolejki inicjatywy** — LOD na pozycji 1 z inicjatywą **21** nad Tonym (20), chipem
„W SIECI" i bez kostki, przy Kolcu „Akcja 1/1 · Sieć 1/4"; **wyjście LOD-a z kolejki** razem
z odłączeniem; **karta wpisu w kompendium** z wierszem „MECHANIKA"; **formularz MG** z sekcją
„Efekt (mechanika)". Konsola czysta.

**Poligon zostaje przygotowany pod stół** (inaczej niż po 26a i 26b, gdzie stan przywracano):
architektura „siec klub" ma teraz piętro 1 „Poczekalnia" i piętro 2 „Strażnik piętra"
z Piekielnym ogarem, na Strzelnicy stoi odsłonięty **„Punkt dostępu"**, obok niego żeton
**„Kolec"** związany z kartą **„Test 27x"** (Netrunner, Interfejs 7, cyberdek doskonałej jakości
z Gumką, Pancerzem, Mieczem, Młotem na wroga, Superklejem i Szablozębem). PW przywrócone do
35/35, Podpalony zdjęty, tryb turowy **wyłączony** — kolejka „PRZED WALKĄ" z Tonym i avatar9,
która stała tam wcześniej, wraca jednym kliknięciem „Włącz tryb turowy".

### Sesja 15.08 — etap 26b (run: punkty dostępu, winda i Akcje Sieciowe)

**Etap 26b został przed rozpoczęciem podzielony na dwa** (decyzja MG). Pierwotny zakres niósł
run **i** całą walkę w Sieci naraz: Programy z trzema klasami efektów, Pafa, Ślizg, Czarnego
LOD-a z darmowym atakiem, pościgiem i wstawką do kolejki inicjatywy oraz obrażenia w mózg —
to samo w sobie jest etapem wielkości 16b+16c. Walka wyprowadziła się do nowego **26c**,
a dawne 26c (Demony i Soma) zostało przenumerowane na **26d**.

**Punkt dostępu musiał powstać od zera i to on jest bramą do całego etapu.** Opis etapu wymieniał
„6 m od punktu dostępu", ale takiego bytu w projekcie nie było. Powstał jako obiekt sceny
(`NetAccessPoint`, wzorem osłon z 16c), stawiany narzędziem mapy 🔌 i wiązany z Architekturą
z biblioteki 26a. **Domyślnie ukryty** (decyzja MG): gracz nie dostaje go w payloadzie, dopóki
nie znajdzie go Skanerem albo dopóki MG go nie odsłoni — dzięki temu Skaner ma co robić.

**Zasięg i ściana to ten sam rachunek co linia strzału z 16b.** `metresBetween` + `hasLineOfFire`,
zero nowej geometrii — gdyby powstała druga, prędzej czy później drzwi przepuszczałyby kulę
i nie przepuszczały kabla.

**Akcje Sieciowe siedzą _w_ Akcji tury, nie obok niej.** Model jest kopią Akcji Ataku z 14b:
jedna Akcja, w środku licznik użyć (`CpredNetActionUse` obok `CpredAttackAction`). Dzięki temu
„albo Akcja w Somie, albo Akcje Sieciowe" (s. 198) wychodzi z arytmetyki, a nie z osobnego
warunku — netrunner, który już strzelał, nie wejdzie do Sieci, i odwrotnie. Tracker pokazuje
„Sieć 1/4" dopiero po pierwszej Akcji Sieciowej, więc reszcie stołu nic nie przybyło.

**Szyb jest drzewem — i to jest cała odpowiedź na „nie możesz ominąć przeszkody".** Rodzicem
piętra trzonu jest piętro nad nim, a pierwszego piętra odgałęzienia — piętro trzonu, z którego
wyrasta. Trasa między dwoma piętrami jest więc jedna i nie ma czego omijać: wystarczy sprawdzić,
czy po drodze nie stoi niezłamane hasło. Na samo hasło **wejść wolno** — inaczej nikt nigdy
nie mógłby go złamać Backdoorem.

**Wiedza o piętrze jest trójwartościowa i tnie ją serwer.** Nieodkryte piętro nie ma w payloadzie
ani rodzaju, ani nazwy, ani PT; piętro ze Zwiadu ma rodzaj i nazwę, ale **nie PT** („Zwiad nie
podaje Poziomów Trudności", s. 200); dopiero wejście odsłania wszystko. Notatka MG na Pliku jest
wyjątkiem, który zarabia Ajdi: to jedyna zdolność, która ma co wypłacić.

**Ślady przeżywają odłączenie, odkrycia nie.** „Odłączenie resetuje obronę Architektury"
(s. 198), więc wiersz runa **kasuje się**, a Wirus i PT Maskowania idą do osobnej kolumny
`NetArchitecture.runtime` — nie do `data`, którą edytor MG z 26a przepisuje w całości przy
każdym zapisie. Wirus zamieciony poprawką literówki w nazwie piętra byłby całym runem gracza
wyrzuconym do kosza.

**Czat mówi dwie różne rzeczy dwóm widowniom.** Karta rzutu z PT idzie jako `gmroll`
(netrunner + MG), bo PT jest sekretem Architektury; stół dostaje jedną linię „Kolec — Backdoor ·
udane". Kryterium „reszta stołu widzi skrót, nie zawartość Architektury" to zasada o payloadach,
nie o stylach.

**Zweryfikowane:** 1125 testów w `shared` (34 nowe w `netrun.test.ts`), 658 na serwerze
(17 nowych w `netrun.test.ts` na żywych gniazdach — w tym filtr pięter na payloadzie, odmowa
spoza 6 m, awaryjne odłączenie po odejściu figury i to, że gracz nie widzi cudzego runa),
`tsc --noEmit` czysty w trzech pakietach, ESLint bez uwag, `pnpm build` bez uwag. Migracja:
`20260815083924_stage26b_net_run` (dwie nowe tabele + kolumna `runtime`, zero zmian w danych).
Przy okazji naprawiony **błąd typów z 26a**: `emitAck` w `netrunning.test.ts` deklarował
`SocketAck<T>`, a testy czytały `ack.data?` bez zawężania — `tsc` sypał 31 błędami w tym pliku
od 14.08.

**Odklikane u MG i u gracza** w kampanii „Poligon bojowy" (**stan przywrócony po oględzinach** —
architektura, gniazdo i żeton skasowane, „Test 27x" z powrotem bez Roli i bez deku). Potwierdzone:
**narzędzie 🔌** w pasku mapy z selektorem Architektury, przełącznikiem „ukryte" i gumką;
**pierścień 6 m** wokół gniazda i przygaszona ikona, dopóki jest ukryte; **gracz nie dostaje
ukrytego gniazda** (pusta lista w `state:sync`); **karta gniazda** z listą kandydatów i dystansem
(„Kolec — 5,7 m"), a spoza zasięgu z napisem „Za daleko — trzeba stanąć w promieniu 6 m"
i **wyszarzonym** „Podłącz się"; **okno „Sieć"** z trzonem, odgałęzieniem („z piętra 2") i cyjanową
ramką na piętrze netrunnera; **Zwiad** („Odsłonięte piętra: 5"); **Backdoor** z chipem „złamane"
i odmową ruchu przed nim; **Ajdi** odsłaniające notatkę MG na Pliku; **„Skopiuj Plik"** za darmo
(chip „kopia na deku"); **Kontrola** („Węzeł przejęty — PT odebrania go tobie: 9");
**Wirus przez dwie Akcje Sieciowe** („Wirus w budowie: 1 / 2" → „Wirus zostawiony — PT jego
zniszczenia: 13"); **Maskowanie**; **Skaner** odsłaniający ukryte gniazdo graczowi;
**awaryjne odłączenie** po odejściu figury poza 6 m (okno zamyka się u obu stron, na czacie
„poza zasięgiem punktu dostępu (6 m)"). **Strona gracza** (avatar9, właściciel „Test 27x"):
okno ma tytuł **„SIEĆ"** bez nazwy Architektury, piętro ze Zwiadu ma rodzaj i nazwę, ale
**nie ma PT**, a czat niesie same skróty („Backdoor — udane"), bez kart rzutów. **Ponowne
podłączenie** po odłączeniu: **Wirus PT 13 został**, a „złamane", „rozpoznany" i „przejęty"
zniknęły — obrona Architektury wróciła do stanu wyjściowego. Konsola czysta.

**Sześć poprawek po oględzinach — pięć z nich to błędy, które wyszły dopiero na mapie.**
(1) **Gniazdo kradło kliknięcia figurze, która na nim stała** — warstwa markerów leżała nad
tokenami, więc figura pod 🔌 nie dawała się kliknąć, przeciągnąć ani otworzyć PPM-em. Gniazdo
zjechało **pod** warstwę tokenów: to scenery, a normalną rzeczą z terminalem jest podejść do niego.
(2) **Marker nie skalował się przy zoomie** — `setAccessPoints` nie było wołane z przebiegu, który
przerysowuje uchwyty ekranowe (lampy, pinezki, etykiety osłon). (3) **Okno „Sieć" miało 1180 px**
— `sheet.css` wczytuje się **po** `styles.css` i ustawia `.sheet-window`, więc reguła szerokości
musiała podnieść specyficzność do `.sheet-window.net-run-window`. (4) **Pasek statusu sklejał się
w jeden ciąg i pisał Wielkimi Literami** („Punkt Dostępu") — dokładnie ta sama pułapka `.cp-bar`
co przy belce deku w 26a; pasek dostał własne style. (5) **Nazwa piętra ucinała się do „L…"**,
gdy przybywało chipów — wiersz zwija się teraz do drugiej linii zamiast zjadać nazwę.
(6) **Selektor Architektury w karcie gniazda był pusty**, dopóki MG nie otworzył zakładki „Sieć"
— biblioteka jedzie na żądanie (26a), więc karta dociąga ją sama.

### Sesja 14.08 (piąta tego dnia) — etap 26a (Sieć: dane, architektura, cyberdek)

Netrunning dostał katalog (32 Programy, 4 Obrony Sieci, 6 Ulepszeń Sprzętowych), model
Architektury jako szybu windy z trzonem i odgałęzieniami oraz cyberdek w „Ekwipunku" karty.
Etap 26 został przy okazji podzielony na cztery, a ekran Sieci ustalono jako pływające okno.
Pełna notatka: `archiwum/dziennik-sesji.md`.

### Sesja 14.08 (czwarta tego dnia) — etap 27c (karta: Ścieżka Życia i sylwetka cyborgizacji)

Karta ma komplet trzech stron wydruku: doszły „Ścieżka Życia" i „Cyborgizacje" z sylwetką
z domeny publicznej, a życiorys, który kreator zapisywał od 25b, wreszcie ma gdzie się wyświetlić.
Nowe pole `bodySlot` na wierszu wszczepu odpowiada na pytanie „które oko?", którego arytmetyka
gniazd z 23a nie zadaje. Pełna notatka: `archiwum/dziennik-sesji.md`.

### Sesja 14.08 (trzecia tego dnia) — etap 25c (wyposażenie startowe i poziomy sklepu)

Kreator dostał dwa ostatnie kroki — Wyposażenie i Opis — i od tej pory stawia żeton na scenie.
Przy okazji doszły **poziomy dostępności sklepu** (życzenie MG spoza planu, `Campaign.shopTier`,
przełącznik w zakładce „Kompendium") oraz 53 brakujące wpisy „Sprzęt" z podręcznika.
Pełna notatka: `archiwum/dziennik-sesji.md`.
