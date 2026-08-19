# Postęp prac

Aktualizowany na koniec każdej sesji. Statusy: ⬜ nierozpoczęty · 🟨 w toku · ✅ ukończony · ⛔ wycofany.
Pełne notatki z zamkniętych etapów: `archiwum/dziennik-sesji.md` (nie czytaj rutynowo — tylko gdy potrzebujesz szczegółu konkretnego etapu).

| #   | Etap                                          | Status | Data ukończenia   | Uwagi                                                                                           |
| --- | --------------------------------------------- | ------ | ----------------- | ----------------------------------------------------------------------------------------------- |
| 01  | Szkielet projektu i środowisko                | ✅     | 2026-07-16        | repo: Fable5-vtt; shared konsumowany jako źródła TS (decyzja w README)                          |
| 02  | Baza danych, użytkownicy, role                | ✅     | 2026-07-16        | Prisma 7 (adapter better-sqlite3); dodatkowy model `CampaignMember`                             |
| 03  | Rdzeń realtime i czat                         | ✅     | 2026-07-17        | moduł `realtime` (rejestr zdarzeń z rolą); szepty bez seq; fix `pnpm dev` (`--raw`)             |
| 04  | Mapa i sceny                                  | ✅     | 2026-07-17        | pixi-viewport 6 OK z Pixi v8; MG ma niezależny podgląd scen (pokoje per-scena)                  |
| 05  | Tokeny                                        | ✅     | 2026-07-17        | HP widoczne tylko dla właściciela+MG; ikony statusów z game-icons (CC BY)                       |
| 06  | Silnik kości CP RED                           | ✅     | 2026-07-18        | krytyk/fumble auto dla pojedynczej d10; /gr = autor+MG (styl Foundry)                           |
| 07  | Karta postaci — model i edytor                | ✅     | 2026-07-18        | umiejętności Easy Mode (41) w data/public; gracz też tworzy postaci; okna pływające             |
| 08  | Karta interaktywna i integracja               | ✅     | 2026-07-24        | rzuty z karty zawsze przez kubek; karta = źródło prawdy dla PW tokenu                           |
| 09  | AI Gateway — fundament botów                  | ✅     | 2026-07-24        | ~80 tok/s, kontekst 32k; think sterowany per żądanie; model zmyśla zasady (RAG: 19)             |
| 10  | Edytor botów                                  | ✅     | 2026-07-25        | + guardraile roli, auto-powtórka i nauka z korekt MG (rozszerzenie)                             |
| 11  | Boty NPC na czacie                            | ✅     | 2026-07-25        | pamięć per scenka; wypowiedź bota nie do odróżnienia od `/jako` MG                              |
| 12  | ~~TTS — głos botów~~                          | ⛔     | wycofany 09.08    | był gotowy 26.07 (Piper); kod usunięty, został sam maszynopis tekstu u klienta                  |
| 13  | Dane z podręcznika i kompendium               | ✅     | 2026-07-27        | domknięty 26.07 na darmowych materiałach; 27.07 uzupełniony z podręcznika głównego              |
| 14  | Inicjatywa i tury                             | ✅     | 2026-07-26        | tracker = pasek nad mapą + zakładka „Walka”; remisy: REF, przerzut RAW i drag                   |
| 14b | Ekonomia akcji: budżet tury i katalog         | ✅     | 2026-07-30        | + Ustabilizowanie od zera (etap 15 go nie miał, wbrew opisowi); „przepuść" jako karta MG        |
| 14c | Ruch w turze: budżet metrów na mapie          | ✅     | 2026-07-31        | metry po surowej ścieżce kursora (decyzja MG); kara pancerza i ran krytycznych jako dane        |
| 14d | Zwarcie: Pochwycenie, Duszenie, Rzut          | ✅     | 2026-07-31        | etap 14d podzielony na 14d/14e; migotliwy test death save miał inną przyczynę niż notatka       |
| 14e | Automaty tury: rany krytyczne, DoT, monity    | ✅     | 2026-07-31        | strażnik hooków w osobnej kolumnie (budżet tury jest odtwarzany); + kary płaskie z ran          |
| 15  | Obrażenia, pancerz, krytyki, Death Save       | ✅     | 2026-07-27        | obie tabele ran z podręcznika głównego (nieoficjalna tabela głowy zastąpiona 27.07)             |
| 16  | Zasięgi, DV z mapy, autofire                  | ✅     | 2026-07-28        | wręcz: PT zastępczy z karty celu + przycisk „Unik” (RAW nie zna statycznego PT)                 |
| 16b | Linia strzału i atak z mapy                   | ✅     | 2026-07-31        | etap 16b podzielony na 16b/16c; linia strzału = blokady wzroku strzelca, nie druga geometria    |
| 16c | Osłony jako obiekty sceny                     | ✅     | 2026-08-01        | osłona jedzie do klienta (ściana nie); blokada miękka z kartą wyboru zamiast twardej            |
| 16d | Granaty, obszary i rzut przedmiotem           | ✅     | 2026-08-01        | zwężony (amunicja → 16g); odchylenie pudła to zasada domowa — podręcznik jej nie ma             |
| 16e | Ruch klikiem: zaznaczenie, automat chodzenia  | ✅     | 2026-07-31        | trasa gracza tylko po tym, co widzi teraz — maska eksploracji nie pamięta ścian                 |
| 16f | Celowanie kursorem i HUD walki                | ✅     | 2026-08-01        | model klasycznego CRPG (klik we wroga celuje, MG przez Alt); HUD w nowym lewym pasku            |
| 16g | Amunicja specjalna: kule zmieniające rachunek | ✅     | 2026-08-07        | podzielony na 16g/16h 07.08; nabój = wpis kompendium, śrut jedzie tą samą drogą co wybuch       |
| 16h | Amunicja bez obrażeń: testy, gaz i dym        | ✅     | 2026-08-07        | dym tylko utrudnia (−4), nie zasłania; minuta = 6 rund, poza walką zdejmuje MG przyciskiem      |
| 17a | Fog of war i warstwa MG                       | ✅     | 2026-07-28        | etap 17 podzielony na 17a/17b; nowa scena startuje zakryta, mgła przełączalna                   |
| 17b | Rysowanie po mapie                            | ✅     | 2026-07-28        | tekst skaluje się z mapą (odstępstwo od wskazówki); MG domyślnie rysuje u siebie                |
| 18a | Ściany i widoczność tokenów                   | ✅     | 2026-07-29        | etap 18 podzielony na 18a/18b; ściany nie opuszczają serwera                                    |
| 18b | Ciemność i źródła światła                     | ✅     | 2026-07-30        | zwężony 30.07 (eksploracja → 18c, drzwi/okna → 18d); 160 fps przy 10 światłach                  |
| 18c | Eksploracja i mgła MG nad widocznością        | ✅     | 2026-07-30        | + „zapal pomieszczenie", tłumienie światła przez okno i wygładzenie gradientu                   |
| 18d | Interakcje z drzwiami i oknami                | ✅     | 2026-07-30        | zasięg ręki 2 m, zamek MG; okno = firanka, a od dopisku 18e też otwierany otwór                 |
| 19a | Fundament RAG i asystent zasad MG             | ✅     | 2026-08-08        | etap 19 podzielony na 19a/19b/19c 08.08; embeddingi na CPU (0 GB VRAM), hybryda z FTS5          |
| 19b | Baza wiedzy kampanii i kontekst botów         | ✅     | 2026-08-08        | tag = jedyny język uprawnień; filtr w SQL przed mnożeniem wektorów; podręcznika bot nie czyta   |
| 19c | Streszczenia sesji, dziennik, relacje NPC     | ✅     | 2026-08-08        | dziennik = trzecia kolekcja RAG; wpis rodzi się „tylko MG"; relacja do karty postaci (−3…+3)    |
| 20a | Akcje botów: structured output i rzuty        | ✅     | 2026-08-08        | etap 20 podzielony na 20a/20b 08.08; gramatyka GBNF tylko w decyzji, wypowiedź zostaje prozą    |
| 20b | Tura bota w walce                             | ✅     | 2026-08-08        | „Graj turę” zawsze na klik (decyzja MG); ruch = podejdź/odsuń się, trasę liczy serwer           |
| 21  | ~~STT — polecenia głosowe~~                   | ⛔     | wycofany 09.08    | nierozpoczęty; głos wypadł z projektu w całości                                                 |
| 22  | ~~WebRTC — czat głosowy graczy~~              | ⛔     | wycofany 09.08    | nierozpoczęty; głos graczy załatwia zewnętrzny komunikator                                      |
| 23a | Cyborgizacje i człowieczeństwo                | ✅     | 2026-08-09        | etap 23 podzielony na 23a/23b/23c 09.08; EMP bieżące liczone z Człowieczeństwa wchodzi w rzuty  |
| 23b | Ekonomia: eurodolce, zakupy, lifestyle        | ✅     | 2026-08-09        | saldo pisze wyłącznie serwer (audyt `LedgerEntry`); pasmo ceny = cena; Poziom życia opcjonalny  |
| 23c | Reputacja i Facedown                          | ✅     | 2026-08-09        | PL nazwa to „Konfrontacja"; Reputacja wyliczana z listy wyczynów, −2 wybiera przegrany          |
| 24a | Handouty                                      | ✅     | 2026-08-09        | etap 24 podzielony na 24a/24b/24c 09.08; markdown własnym parserem w `shared`                   |
| 24b | Dziennik kampanii dla stołu                   | ✅     | 2026-08-09        | uprawnienie gracza to osobna kolumna, nie trzeci szczebel `visibility`; szukanie u klienta      |
| 24c | Screamsheets                                  | ✅     | 2026-08-13        | `kind` na handoucie z 24a; kroje gazetowe (OFL) hostowane u siebie; nagłówek = tytuł handoutu   |
| 25a | Kreator postaci: rola, cechy, umiejętności    | ✅     | 2026-08-14        | etap 25 podzielony na 25a/25b 14.08; dwie metody (Krawędziarz, Kompletny Pakiet), bez Szablonów |
| 25b | Kreator: Ścieżka Życia                        | ✅     | 2026-08-14        | etap 25b podzielony na 25b/25c 14.08; 71 tabel, 522 wiersze; wróg → szkic bota jednym klikiem   |
| 25c | Kreator: wyposażenie startowe i poziomy       | ✅     | 2026-08-14        | 4 poziomy z ceny; +53 wpisy sprzętu z podręcznika (kompendium miało 5); pakiet Roli → POMYSŁY   |
| 26a | Sieć: dane, architektura i cyberdek           | ✅     | 2026-08-14        | etap 26 podzielony na 26a/26b/26c 14.08; ekran Sieci = pływające okno (decyzja MG)              |
| 26b | Run: punkty dostępu, winda i Akcje Sieciowe   | ✅     | 2026-08-15        | etap 26b podzielony na 26b/26c 15.08; punkt dostępu = obiekt sceny, ukryty do Skanera           |
| 26c | Walka w Sieci: Programy, Paf, Ślizg, LOD      | ✅     | 2026-08-15        | efekt Programu = dane wpisu; `Combatant.tokenId` nullowalny — LOD stoi w kolejce bez figury     |
| 26d | Węzły kontrolne i systemy obronne             | ✅     | 2026-08-15        | etap 26d podzielony na 26d/26e 15.08; wieżyczka = żeton z profilem statysty z 16b               |
| 26e | Demony                                        | ✅     | 2026-08-16        | etap 26e podzielony na 26e/26f 16.08; Demon trzyma węzły od startu, tura jednym klikiem MG      |
| 26f | Samodzielne systemy obronne i broniona strefa | ✅     | 2026-08-16        | strefa = trzeci prostokąt mapy (→ `rects.ts`); parser wyłuskał efekt z 13 z 18 wierszy          |
| 27a | Karta jak oficjalna: strona pierwsza          | ✅     | 2026-08-13        | wydzielony z 27 dnia 13.08 (27a/27b/27c); motyw dzień/noc na razie tylko dla karty              |
| 27b | Karta: broń, pancerz, ekwipunek               | ✅     | 2026-08-13        | zakładka „Walka" zniknęła; pancerz = 3 wiersze wydruku + reszta; trzy nowe pola prozy           |
| 27c | Karta: Ścieżka Życia i cyborgizacje           | ✅     | 2026-08-14        | sylwetka = gotowy SVG z domeny publicznej; gniazdo na ciele to nowe pole wiersza wszczepu       |
| 27  | ~~Kości 3D i szlif UI~~                       | ⛔     | rozdzielony 19.08 | rozbity do końca na 27d–27g; plik etapu został jako rozdroże ze wskazaniami                     |
| 27d | Kości 3D: skórki, dorzut, ustawienia          | 🟨     |                   | pięć skórek, skórka jedzie z rzutem (jak w Foundry), dorzut drugą falą, okno ⚙ Ustawienia       |
| 27e | Motyw dzień/noc dla całej aplikacji           | ⬜     |                   | decyzja MG 19.08: dzień obejmuje CAŁE VTT, nie samą kartę (znosi „ciemny wystarczy” z 27)       |
| 27f | Szlif UX: pomoc, tooltipy, stany, okna        | ⬜     |                   | okno skrótów `?`, stany puste, okna pamiętające pozycję i rozmiar                               |
| 27g | Wydajność                                     | ⬜     |                   | re-rendery przy ruchu tokenów, bundle, lazy-loading, fps mapy                                   |
| 28  | Wdrożenie na VPS                              | ⬜     |                   |                                                                                                 |

## Od czego zacząć

Ostatnio zamknięte: **27d** (pięć skórek kości, **skórka rzucającego widziana przez cały stół**,
dorzut krytyka jako osobna druga fala i pierwsze **okno „⚙ Ustawienia"**, do którego przeniosły
się ☀/☾ i ⌨ z górnego paska). Wcześniej **26f** domknęło rozdział 11 podręcznika — netrunning
ma komplet 26a–26f.

**Etap 27 jest rozdzielony do końca** na 27d (zrobione), **27e** (motyw dzień/noc dla całego
VTT — decyzja MG z 19.08), **27f** (okno skrótów, stany puste, pozycje okien) i **27g**
(wydajność). Plik `etap-27-…` został jako rozdroże ze wskazaniami, sam nie jest do realizacji.

**🎯 Poligon jest przygotowany pod stół — nic nie trzeba budować od nowa.** Na scenie
„Strzelnica" stoi odsłonięty **„Punkt dostępu"** i obok niego żeton **„Kolec"** związany z kartą
**„Test 27x"** — Netrunner z Interfejsem 7 i cyberdekiem doskonałej jakości (Gumka, Pancerz,
Miecz, Młot na wroga, Superklej, Szabloząb). Architektura **„siec klub"** ma teraz **cztery
piętra**: 1 „Poczekalnia", 2 „Strażnik piętra" z Piekielnym ogarem, 3 **„Węzeł ochrony" (PT 8)**
z dwoma urządzeniami — **„Kamera nad bramą"** (wpis „Kamera obserwacyjna") i **„Grzechot"** (wpis
„Automatyczna wieżyczka", związany z żetonem **„Automatyczna wieżyczka"** stojącym na mapie:
REF 7, Umiejętność 7, karabin szturmowy 25/25, PW 25/25) — oraz 4 **„Serce sieci"** z **Diablikiem**
(REZ 15, Interfejs 3, 2 Akcje Sieciowe, Wartość bojowa 14). Tryb turowy jest **wyłączony**;
kolejka „PRZED WALKĄ" z Tonym i avatar9 wraca jednym kliknięciem „Włącz tryb turowy".
**Od 26f na „Strzelnicy" leży też ⚠ „Podłoga elektryczna"** — prostokąt ~20 × 13 m nad żetonami,
**uzbrojona i ukryta** (gracz jej nie dostanie, dopóki nie zda Percepcji PT 17 z 4 m). Kto na nią
wejdzie, dostaje 6k6 przez pancerz i jeszcze raz na koniec każdej swojej Tury. Karta strefy
otwiera się narzędziem ⚠ w trybie 📌; „Rozbrój" ją usypia, kosz usuwa.

**⚠️ Jedna rzecz do zrobienia ręcznie: „Poligon bojowy" stoi teraz na poziomie sklepu 1
(Uliczne).** Migracja daje każdej kampanii `shopTier = 1`, więc do czasu przesunięcia
przełącznika gracz nie kupi niczego droższego niż 50 ed. Przełącznik 1–4 jest w zakładce
**„Kompendium"** pod chipami kategorii; MG kupuje przez wszystkie poziomy niezależnie od niego.

**Następne etapy do wyboru: 27e** (motyw — największy z czwórki, bo `styles.css` ma 7000+ linii
z zaszytymi kolorami), **27f**, **27g** i **28** (VPS). Drobiazg „kostki kreatora świecą jak
krytyki" z 25a/25b **jest już zrobiony** (flaga `plain`); jednobarwne 📰 z 24c i 🔌 z 26b
zostają do 27e razem z przeglądem emoji w UI. **Sesja zerowa z drużyną** jest nadal
najlepszym testem 25a+25b+25c i trzech stron karty naraz.

**09.08 głos wypadł z projektu** (sesja bez etapu, decyzja MG): etapy **12, 21 i 22** wycofane, kod TTS usunięty z repo. Szczegóły w `archiwum/dziennik-sesji.md` i w `archiwum/wycofane/README.md`.

### Otwarte zaległości (przechodzą między etapami)

- **Etap 27d — trzy ścieżki nieodklikane; reszta sprawdzona 19.08 (patrz notatka sesji).**
  (1) **Złoty dorzut krytyka** — na zrzucie ekranu złapany został fumble (dwie kości w dwóch
  kolorach na stole), krytyka nie: 20% na rzut, a okno, w którym kość leży, trwa ~3 s. Ścieżka
  jest **ta sama**, różni ją jeden zestaw kolorów. (2) **Wyłączenie animacji i głośność 0** —
  obie prowadzą do wcześniejszego wyjścia z `playRollAnimation` / `playRattle` i były czytane
  w kodzie, nie klikane. (3) **Rzut Cech w kreatorze bez zielonych dziesiątek** — flaga `plain`
  ma test w `shared` i przechodzi przez serwer, ale kreatora nikt nie otwierał.

- **Etap 26f — pięć ścieżek nieodklikanych; reszta sprawdzona 16.08 (patrz notatka sesji).**
  (1) **Strona gracza** — cała: czy ukryta strefa naprawdę znika z jego ekranu, czy odsłonięta się
  rysuje i czy po zdanej Percepcji dostaje ją tylko jego konto. Różnica **jest w payloadzie**
  (`fetchZonesFor` filtruje przed emisją) i pokryta trzema testami na żywych gniazdach, ale nikt
  nie patrzył na to oczami gracza — ta sama zaległość, co przy 26a–26e. (2) **Ślizgawka
  i wymuszony Test** — w przeglądarce klikana była wyłącznie podłoga elektryczna; Test Atletyki
  z wyzwalaczem „każdy ruch na obszarze" ma test serwera. (3) **Kara do RUCH-u (Maź)** — naklejka
  **„Spowolniony"** (nowy status, ikona `slowed.svg` z game-icons) i jej liczba w budżecie ruchu
  („Pancerz −2 · Spowolniony −7") widziane tylko w testach; **ikona nie była oglądana na żetonie**.
  (4) **Strzał stanowiska** — ścieżka `fires` przeszła testem wyłącznie w wariancie „nie ma żetonu
  na scenie"; prawdziwy strzał wieżyczki związanej ze strefą wymaga żetonu z bronią i celu w polu
  ostrzału. (5) **Winda z gazem w Kolejce Inicjatywy** — wyzwalacz `turn` odpala **wyłącznie**
  przyciskiem „Odpal system" (patrz akapit niżej), więc wiersz w trackerze zakłada MG ręcznie.

- **Etap 26f — pułapka z własną Turą nie wstawia się do Kolejki sama.** Wyzwalacz `turn` (winda
  z gazem, s. 216) jest w danych i jest **pomijany** przez hak ruchu; odpala go „Odpal system" na
  karcie strefy. To świadome i zgodne z linią 26c/26e („nic nie rusza się samo, MG klika"), ale
  znaczy, że zdanie „Pułapka zajmuje pierwsze miejsce w Kolejce Inicjatywy" MG realizuje sam —
  dodając wiersz trackera i klikając przycisk w jego Turze. Automatyczna wstawka wzorem
  `pushNetFoeIntoQueue` z 26c to wpis w `POMYSLY.md`.

- **Etap 26f — promień zauważenia strefy (4 m) to czytanie VTT, nie RAW.** Podręcznik daje samo
  „Percepcja PT 17, by zauważyć" i żadnej odległości — dokładnie jak przy promieniu Skanera z 26b.
  4 m to dwa pola: dość blisko, żeby „widziałem druty w dywanie" dało się powiedzieć przy stole,
  i dość daleko, żeby rzut padł **przed** pierwszym krokiem na pułapkę. Stała
  `ZONE_SPOT_RANGE_M` w `packages/shared/src/zones.ts`.

- **Etap 26f — rzut na Percepcję jest jeden na postać i nie da się go powtórzyć.** Bez tego
  gracz cofałby się o metr i wracał, aż wyjdzie. Drugiej szansy nie ma nawet po zmianie sceny;
  drogą obok nieudanego rzutu jest wyłącznie przycisk MG „Odsłoń graczom". Lista prób siedzi
  w kolumnie `sightings` strefy i ginie razem z nią.

- **Etap 26f — figura, która już stoi na strefie, nie wchodzi na nią drugi raz.** „Cel **wchodzi**
  na broniony obszar" czytane dosłownie: ruch wewnątrz obszaru wyzwalacza `enter` nie odpala
  (odpala `move`, czyli Ślizgawkę i Siatkę laserową). Podłoga elektryczna bije wtedy dopiero na
  koniec Tury — i to jest ta sama liczba, którą podręcznik obiecuje.

- **Etap 26e — cztery ścieżki nieodklikane; reszta sprawdzona 16.08 (patrz notatka sesji).**
  (1) **Strona gracza** — całe okno Demonów oglądane było z konta MG, i inaczej się nie da:
  netrunnerem Poligonu jest karta „Test 27x", która należy do MG, a nie do Tony'ego ani avatar9.
  Różnica w kodzie **jest i jest zamierzona** (Demon „czuwający" w ogóle nie wchodzi do payloadu
  gracza, a atak na niego wraca `NET_DEMON_UNKNOWN`) i pokryta dwoma testami na żywych gniazdach.
  (2) **„Ten Demon miał już swoją Turę w tej Rundzie"** — na Poligonie tryb turowy jest wyłączony,
  więc rund nie ma i odmowa nie ma jak paść; pokryta testem serwera. (3) **Wstawka Demona do
  Kolejki Inicjatywy** — z tego samego powodu: bez rozpoczętej walki nie ma do czego wstawiać
  (test serwera sprawdza inicjatywę „o jeden punkt wyżej" i wiersz bez figury). (4) **Uwaga
  „jeden Demon na sześć pięter"** — Architektura Poligonu ma cztery piętra i jednego Demona, czyli
  mieści się w budżecie; żeby zobaczyć zdanie, trzeba dołożyć drugiego (pokryte testem w `shared`).

- **Etap 26e — Demon nie strzela sam z siebie do figur, których nie widzi netrunner.** Cel
  wieżyczki wybiera silnik: **figura netrunnera**, gdy jest do niej linia strzału, a w przeciwnym
  razie najbliższa figura, która nie jest urządzeniem tej Architektury. To **czytanie VTT, nie
  RAW** — podręcznik zostawia wybór ofiary stołowi, a decyzja MG z 16.08 („jeden klik") kazała
  komuś wybrać. Jeśli przy stole wyjdzie, że Demon strzela nie w tego, w kogo trzeba, pierwszym
  miejscem do obejrzenia jest `pickTurretTarget` w `realtime/netdemons.ts`.

- **Etap 26e — Demon nie obsługuje kamer ani drzwi, tylko strzela i Pafa.** `nextDemonStep` zna
  trzy kroki (odbierz węzeł, strzel, Pafnij), bo tylko strzał ma w silniku konsekwencję, którą da
  się rozliczyć. Obrócenie kamery czy zamknięcie bramy przez Demona zostaje **ręcznym hakiem MG** —
  ta sama umowa, którą 26c zawarło z dwoma efektami „na godzinę", a 26d z widzeniem kamery.

- **Etap 26d — cztery ścieżki nieodklikane; reszta sprawdzona 15.08 (patrz notatka sesji).**
  (1) **„Raz na Turę"** — `NET_NODE_USED` ma polskie zdanie i test na żywych gniazdach, ale
  w przeglądarce do niego nie doszło: rundy istnieją dopiero po **rozpoczęciu** walki (sam
  „Włącz tryb turowy" zostawia stan „PRZED WALKĄ" i rundę 0), a rozkręcanie walki w żywej
  kampanii zmieniłoby stan Poligonu bardziej niż warto. (2) **Drzwi z 18d** — na „Strzelnicy"
  nie ma ani jednych; ścieżka jest kopią `opening:toggle` i ma test serwera, w oknie Sieci
  klikane były kamera i wieżyczka. (3) **Odmowa `NET_DEVICE_OFF`** — z tego okna **nie da się**
  do niej dojść i to jest zamierzone: wyłączone urządzenie pokazuje wyłącznie „Włącz". Zdanie
  istnieje dla klienta, który by o tym nie wiedział, i ma test. (4) **Strona gracza** — całe okno
  urządzeń oglądane było z konta MG. Różnica w kodzie **jest i jest zamierzona** (gracz nie
  dostaje listy urządzeń, dopóki nie przejmie węzła — pokryte testem na payloadzie „nie przysyła
  graczowi listy urządzeń"), ale nikt nie patrzył na to oczami gracza.

- **Etap 26d — strzał z wieżyczki za osłoną kosztuje Akcję Sieciową i nie ma czym odpowiedzieć.**
  „Ostrzelaj osłonę czy strzelaj mimo niej" (16c) wraca ze ścieżki ataku jako **pytanie**, a nie
  karta — a Akcja Sieciowa jest zaksięgowana wcześniej, bo sprawdzenie osłony przed rachunkiem
  znaczyłoby policzenie geometrii drugi raz. Odmowa mówi o tym wprost („Akcja Sieciowa poszła —
  strzel jeszcze raz mimo osłony"), ale **okno Sieci nie ma przycisku „mimo osłony"**: pole
  `request.ignoreCover` jedzie w payloadzie i nikt go stamtąd nie ustawia. Do dołożenia razem
  z kartą wyboru dla urządzeń.

- **Etap 26d — kamera „obrócona" jest faktem na czacie, nie stożkiem na mapie** (decyzja MG
  z 15.08). VTT nie ma modelu widzenia kamery, więc obsługa zmienia stan urządzenia i pisze
  zdanie („nie patrzy już na broniony obszar"), a resztę rozstrzyga MG — dokładnie tak jak dwa
  ręczne haki Programów z 26c. Prawdziwy stożek liczony geometrią z 18a jest wpisem w `POMYSLY.md`.

- **Etap 26d — parser tabel obronnych stoi na dwóch heurystykach i to on pierwszy pęknie przy
  nowym zrzucie PDF-a.** Wiersze tnie zdanie „PT N Elektronika i zabezpieczenia, N minut…", a
  nazwę wyłuskuje się zza powtarzalnej komórki „Granica bronionej strefy"; tam, gdzie tej komórki
  nie ma (Kamera obserwacyjna), wchodzi reguła „ostatni ciąg Wielka + małe przed końcem pierwszego
  zdania". Wyszło 18 z 18 nazw, ale gdyby zrzut się zmienił, `parse_defenses` jest miejscem do
  obejrzenia w pierwszej kolejności.

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
  **Korekta z 16.08:** bliźniacze migotanie `ammo-effects.test.ts` („1k10 + 10 nie wyjdzie
  poniżej 11") było łatane 15.08 **warunkiem, który nigdy nie był prawdziwy**: `roll.critical`
  to **obiekt** `{ type: 'fumble' | 'crit', extraRoll }`, a test porównywał go z napisem
  `'failure'`. Poprawka nie zmieniła więc nic, a test pękał na każdej naturalnej jedynce, czyli
  **raz na dziesięć przebiegów**. Naprawione (`critical?.type === 'fumble'`, dolna granica 1).
  **Wniosek ogólny:** porównanie z literałem w teście sprawdź na prawdziwym kształcie danych —
  TypeScript nie pomoże, jeśli lokalny typ wypisany w teście też zmyśla.

## Notatki z dwóch ostatnich sesji

### Sesja 19.08 — etap 27d (kości 3D: skórki, dorzut, ustawienia)

**Etap 27 został rozdzielony do końca.** Po wydzieleniu 27a–27c (karta postaci) niósł nadal
cztery osobne kawałki roboty; rozbite na **27d** (ta sesja), **27e** (motyw całej aplikacji),
**27f** (szlif UX), **27g** (wydajność). Plik `etap-27-…` został jako rozdroże ze wskazaniami.
Przy okazji rozstrzygnięta **sprzeczność w jego treści**: „Zakres" chciał dnia dla całego VTT,
„Poza zakresem" pisało „ciemny wystarczy". **Decyzja MG: tryb dzienny obejmuje całą aplikację**
(27e).

**Cztery decyzje MG z 19.08 niosą etap.** (1) Skórka jest **rzucającego** — jedzie z rzutem, tak
jak siła potrząśnięcia kubkiem, więc przy stole widać cudze kości. (2) Dorzut krytyka to **druga
fala**: pierwsza osiada, 550 ms pauzy, potem osobna k10 w złocie albo w czerni. (3) Ustawienia
dostały **własne pływające okno „⚙"** — ☀/☾ i ⌨ wyprowadziły się z górnego paska (`ThemeToggle`
i `TypewriterToggle` usunięte). (4) **Pięć skórek**, domyślnie Neon.

**Skórka musiała trafić do bazy, i to jest jedyne takie ustawienie.** Reszta preferencji wyglądu
zostaje w `localStorage`, bo dotyczy tylko właściciela przeglądarki; skórka ma dojechać do
**cudzych** ekranów, więc siedzi w `User.diceSkin` (migracja
`20260819194211_stage27d_dice_skin`), wchodzi do `SessionUser` przez jedyny konstruktor
(`toSessionUser`) i jest **stemplowana na wyjściu** w `toChatMessageView` — nie zapisywana
z rzutem. Skutek zamierzony: kto zmieni kości dzisiaj, ten zobaczy w nich także wczorajszą
historię, a payload zostaje zapisem tego, co padło, a nie czyjegoś gustu.

**Biblioteka trzyma skórkę globalnie — stąd dwie fale.** `parseNotation` nie zna koloru
pojedynczej kości, więc jedynym sposobem na wyróżnienie dorzutu jest przełączenie motywu między
rzutami: `updateConfig` + `add()` (`add` dokłada kości do stołu, `roll` go najpierw zamiata).
**Trzy pułapki biblioteki**, wszystkie opisane w `docs/assety-kosci.md` i w komentarzach:
(1) nazwy tekstur pochodzą z jej listy, nie z katalogu plików — `noise` leży w `public/`, ale
lista go nie zna i kość wychodzi gładka bez ostrzeżenia; (2) `material` zapisuje się na
**współdzielonym** deskryptorze tekstury, więc dwie skórki o tej samej teksturze muszą mieć ten
sam materiał; (3) **`loadSounds()` po każdej zmianie motywu** — pudełko wczytuje jeden zestaw
próbek uderzeń i indeksuje go bez sprawdzania, więc metal na pudełku, które wystartowało na
plastiku, wywalał `Cannot read properties of undefined (reading 'length')` przy każdym stuknięciu
kości. Ten błąd **złapały dopiero oględziny** — testy go nie widzą, bo fizyki nie ma w Node.

**Trzy błędy znalezione i naprawione po drodze.** (1) Suwaki głośności startowały na zerze:
`Number(localStorage.getItem(k))` daje 0 dla `null`, więc wartość domyślna nigdy nie wchodziła —
każda świeża przeglądarka byłaby wyciszona. (2) Kolor dorzutu fumble'a (`#5c0c0c`) na stole nie
dawał się odróżnić od skórki „Krew"; kontrast robi teraz jasność, nie odcień (`#150404`
z cyframi `#ff3b30`). (3) **`zones.test.ts` z 26f nie kompilował się** — używał `CombatView` bez
importu; `vitest` tego nie widzi (typy są zdejmowane), `tsc --noEmit` owszem.

**Migotanie `cyberware.test.ts` miało prawdziwą przyczynę, nie „ciasny limit czasu".** Test
„połowi utratę w górę" porównywał samą **różnicę** Człowieczeństwa z wynikiem rzutu, a pulę
ciągnie w dół także **sufit** (−2 za każdy wszczep kosztujący Człowieczeństwo). Przy 2k6 = 2 na
poprzednim wszczepie pula stała równo na suficie i przy `ceil(1k6/2) = 1` spadała o 2 — raz na
~sto przebiegów. Asercja mówi teraz o suficie wprost. To ta sama rodzina co dwie korekty z 14.08
i 16.08 w „Pułapkach dev".

**Zweryfikowane:** 1248 testów w `shared` (3 nowe: katalog skórek i flaga `plain`), 723 na
serwerze (3 nowe w `realtime.test.ts` na żywych gniazdach — stempel skórki u **obu** stron,
odmowa `UNKNOWN_DICE_SKIN`, historia w bieżącej skórce), `tsc --noEmit` czysty w trzech
pakietach, ESLint, Prettier i `pnpm build` bez uwag.

**Odklikane w przeglądarce** (kampania „Poligon bojowy", MG na `localhost`, gracz avatar9 na
`[::1]`): okno ⚙ z trzema sekcjami, przeciąganie za nagłówek, suwaki na 50, przełączanie przez
wszystkie pięć skórek w obie strony po materiałach (plastik → metal → szkło → papier) **bez
wyjątku w konsoli**, próbny rzut w wybranej skórce (czarna kość z cyjanowymi oczkami, czerwony
metalik), rzut `/gr 1d10` w skórce MG, **druga fala fumble'a** (dwie kości na stole w dwóch
różnych kolorach) i — najważniejsze — **rzut gracza w skórce gracza na ekranie MG**: avatar9
z ustawionym „Kwasem" rzucił `/r 1d6`, a u MG (skórka „Krew") potoczyła się kość **zielona**.

**Nieodklikane:** (1) **złoty dorzut krytyka na zrzucie ekranu** — fumble złapany, krytyka nie
(20% na rzut, a okno, w którym kość leży na stole, trwa ~3 s); ścieżka jest ta sama co fumble'a,
różni ją jeden zestaw kolorów. (2) **Wyłączenie animacji i głośność 0** — sprawdzone tylko
w kodzie, nie w przeglądarce. (3) **Rzut Cech w kreatorze bez zielonych dziesiątek** — flaga
`plain` ma test w `shared`, ale kreatora nie otwierałem.

**Uwaga porządkowa:** w logu czatu MG została **~25 testowych linii `/gr 1d10`** z tej sesji.
Są to rzuty do MG, więc gracze ich nie widzą, ale w historii zostają — nie ma ścieżki
kasowania wiadomości.

### Sesja 16.08 (druga tego dnia) — etap 26f (samodzielne systemy obronne i broniona strefa)

**Rozdział 11 podręcznika jest domknięty.** Netrunning ma komplet: 26a katalog i architektura,
26b run, 26c walka w Sieci, 26d węzły kontrolne, 26e Demony, 26f podłoga, która gryzie sama.

**Trzy decyzje MG z 16.08 niosą cały etap.** (1) **Percepcja rzuca się sama** — serwer robi rzut,
gdy figura kończy ruch w promieniu 4 m od strefy, **raz na postać**, a MG ma obok przycisk
„Odsłoń graczom". Jeden rzut, nie „aż wyjdzie": bez tego gracz cofałby się o metr i wracał.
(2) **Strefa odpala się na każdego**, ale ma **imienną listę przepustek** — „Cel bez odpowiedniej
przepustki lub identyfikatora" (s. 213) jest zdaniem o ochronie budynku, a nie o mechanice, więc
kto ma identyfikator, mówi MG odhaczając figury. (3) **Stanowisko strzela na wejście w strefę**
i dodatkowo na przycisk MG — to jedyne miejsce, w którym 26f odchodzi od linii „nic nie rusza się
samo" z 26c i 26e, i odchodzi świadomie: kolumna „Standardowa aktywacja" mówi wprost, kiedy
wieżyczka strzela.

**Efekt systemu obronnego przestał być prozą.** Osiemnaście wierszy z s. 213–216 nosiło mechanikę
wyłącznie w opisie („zadaje 6k6 obrażeń ciału", „udany Test Atletyki o PT 15 lub Przewróci się",
„redukując RUCH o 2k6 punktów") — to wystarcza MG czytającemu kartę i jest bezużyteczne dla
pułapki, która ma odpalić się sama. `CpredNetDefenseEffects` stanął obok `CpredNetProgramEffects`
z 26c, a jego pole `check` jest **dosłownie** kształtem wymuszonego testu z 16h
(`Omit<CpredAmmoCheck, 'failure'>`), więc `cpredCheckBase` rzuca pułapką dokładnie tak, jak rzuca
gazem — statystom też. **Parser wyciągnął 13 z 18 wierszy**; pięć bez efektu to pięć dronów
i kamera, czyli dokładnie te, które efektu nie mają.

**Strefa jest trzecim prostokątem na mapie** (osłona 16c, kwadrat dymu 16h, strefa 26f), więc
„czy ten punkt jest w środku" i „czy ta trasa go przecięła" wyprowadziły się do wspólnego
`shared/src/rects.ts`, a `covers.ts` zostało cienką delegacją — API i testy 16c bez zmian.
Wyzwalanie wisi na **tym samym haku**, na którym 26b powiesiło awaryjne odłączenie
(`performTokenMove`, po zatwierdzeniu upuszczenia), i czyta **całą łamaną z 16e**, nie sam odcinek
początek–koniec: kto przebiegł przez zelektryfikowaną podłogę, ten po niej przebiegł.

**Obrażenia idą tam, gdzie idą obrażenia.** Z `damage:apply` wyszła `applyDamageToFigure` —
cała ścieżka etapu 15, tylko bez karty — i strefa woła ją tak samo jak MG klikający „Zastosuj":
pancerz bierze swoje, tabela ran krytycznych się rzuca, a „Cofnij" zabiera wszystko naraz.
Obrażenia „bezpośrednio w PW" (krwawy rój) idą drugą, też cudzą drogą — `applyForcedFailureToSheet`
z 16h. Jedyny nowy kawałek to `noAblation`, a i ten jest flagą, którą guma nosi od 16g.

**Dwie rzeczy poza planem, obie wymuszone przez dane.** (1) Kara do RUCH-u ze strefy nie mogła
jechać na „Unieruchomionym", bo ten **blokuje ruch całkiem** — doszedł status **„Spowolniony"**
(ikona „Sticky boot" Delapouite z game-icons, CC BY) z liczbą w `statusData` i modyfikatorem
wchodzącym do budżetu ruchu pod własną nazwą („Pancerz −2 · Spowolniony −7"). Naklejka schodzi
**sama**, gdy figura zejdzie z obszaru — „dopóki cel … nie opuści bronionego obszaru" (s. 216).
(2) Wpis „Obrona Sieci" wpisany ręcznie dostawał od 26d prefiks `demon.` **także wtedy, gdy był
wieżyczką**; od 26f rozstrzyga `defenseKind`, więc katalog importowany i ręczny mówią jednym
językiem — a to zaczęło mieć znaczenie, bo strefa wskazuje wpis po identyfikatorze.

**Zweryfikowane:** 1245 testów w `shared` (12 w `zones.test.ts` + 19 w `netdefense.test.ts`

- 2 w `compendium.test.ts`), 720 na serwerze (19 nowych w `zones.test.ts` na żywych gniazdach,
  4 przebiegi bez migotania), `tsc --noEmit` czysty w trzech pakietach, ESLint, Prettier i
  `pnpm build` bez uwag. **Migracja `20260816093838_stage26f_defense_zones`** — nowa tabela
  `DefenseZone` (prostokąt, wpis, uzbrojenie, ukrycie, PW, przepustki, `sightings`, żeton
  stanowiska i opcjonalne wiązanie z węzłem kontrolnym).

**Odklikane u MG** w kampanii „Poligon bojowy": narzędzie **⚠** w pasku mapy z trzema trybami
(prostokąt / karta / gumka), selektorem 21 systemów i przełącznikiem ukrycia; **przeciągnięcie
strefy** („Podłoga elektryczna · 20/20 PW · uzbrojona", bursztynowy prostokąt ze szrafirunkiem);
**karta strefy** z opisem złożonym z danych („20 PW · PT 13 Elektronika i zabezpieczenia · 1 min ·
Percepcja PT 17, by zauważyć · 6k6 w ciało · powtórnie na koniec każdej Tury"), wyzwalaczem,
suwakiem PW, wyborem stanowiska, listą przepustek i czwórką przycisków; **wejście w strefę**
(karta obrażeń „Przebicie: 18 obr. · rzut 18 · bez pancerza · PW 25 → 7 · **system: Podłoga
elektryczna · wejście na obszar** · Bez ran → Poważnie ranny" plus linia „Wejście na broniony
obszar — Automatyczna wieżyczka: 6k6 = 18"); **„Cofnij"** przywracające 25/25; wiersz **EFEKT**
na karcie wpisu w kompendium i **pełny formularz efektu** w edytorze MG. Konsola czysta.

**Poligon zostaje przygotowany pod stół** — patrz „Od czego zacząć": na „Strzelnicy" leży teraz
uzbrojona i ukryta „Podłoga elektryczna". Żeton wieżyczki wrócił na swoje miejsce z pełnymi PW.

### Sesja 16.08 — etap 26e (Demony)

Demon prowadzi swoją Turę **jednym kliknięciem MG** (odbierz węzeł → strzel z wieżyczki → Pafnij
netrunnera), a węzły trzyma od startu runa, więc netrunner odbija je zamiast zajmować puste.
Wyłącza się go **wyłącznie** przez REZ ≤ 0, a „czuwający" nie wchodzi nawet do payloadu gracza.
Migracja `20260816…` doszła razem z 26f; pełna notatka: `archiwum/dziennik-sesji.md`.

### Sesja 15.08 (trzecia tego dnia) — etap 26d (węzły kontrolne i systemy obronne)

Przejęty węzeł kontrolny obsługuje urządzenia, a wieżyczka okazała się **żetonem z profilem
statysty z 16b** — strzela tym samym `performAttackRoll`, tylko z Cechami netrunnera podstawionymi
na wejściu. Stan urządzenia mieszka w `NetArchitecture.runtime` (kamera wyłączona zostaje
wyłączona po odłączeniu), a kontrola nad węzłem w runie. Doszło 18 systemów obronnych z trzech
tabel s. 213–216. Pełna notatka: `archiwum/dziennik-sesji.md`.

### Sesja 15.08 (druga tego dnia) — etap 26c (walka w Sieci: Programy, Paf, Ślizg, Czarny LOD)

Efekt Programu stał się **danymi wpisu** (`CpredNetProgramEffects`: kości wobec trzech rodzajów
celu, dziewięć nazwanych haków, trzy flagi), a Agresora nie trzyma się uruchomionego — odpala się
go atakiem. Tracker nauczył się nieść uczestnika bez ciała (`Combatant.tokenId` nullowalny), więc
Czarny LOD stoi w kolejce inicjatywy bez figury na mapie. Migracja
`20260815133929_stage26c_net_combat`; pełna notatka: `archiwum/dziennik-sesji.md`.

### Sesja 15.08 — etap 26b (run: punkty dostępu, winda i Akcje Sieciowe)

Netrunner ma od tej sesji gniazdo na mapie, windę po piętrach i siedem niebojowych zdolności
Interfejsu, a Akcje Sieciowe siedzą **w** Akcji tury zamiast obok niej. Etap 26b został przy tej
okazji podzielony na 26b i 26c, bo pierwotny zakres niósł run i całą walkę w Sieci naraz.
Pełna notatka: `archiwum/dziennik-sesji.md`.

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
