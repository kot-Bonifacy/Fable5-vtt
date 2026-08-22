# Postęp prac

Aktualizowany na koniec każdej sesji. Statusy: ⬜ nierozpoczęty · 🟨 w toku · ✅ ukończony · ⛔ wycofany.
Pełne notatki z zamkniętych etapów: `archiwum/dziennik-sesji.md` (nie czytaj rutynowo — tylko gdy potrzebujesz szczegółu konkretnego etapu).
Świadome decyzje i uproszczenia (gdzie VTT czyta podręcznik po swojemu): `decyzje-i-uproszczenia.md` — **to nie są zaległości**, nie planuj ich do zrobienia. Też do czytania na żądanie.

| #   | Etap                                          | Status | Data ukończenia   | Uwagi                                                                                            |
| --- | --------------------------------------------- | ------ | ----------------- | ------------------------------------------------------------------------------------------------ |
| 01  | Szkielet projektu i środowisko                | ✅     | 2026-07-16        | repo: Fable5-vtt; shared konsumowany jako źródła TS (decyzja w README)                           |
| 02  | Baza danych, użytkownicy, role                | ✅     | 2026-07-16        | Prisma 7 (adapter better-sqlite3); dodatkowy model `CampaignMember`                              |
| 03  | Rdzeń realtime i czat                         | ✅     | 2026-07-17        | moduł `realtime` (rejestr zdarzeń z rolą); szepty bez seq; fix `pnpm dev` (`--raw`)              |
| 04  | Mapa i sceny                                  | ✅     | 2026-07-17        | pixi-viewport 6 OK z Pixi v8; MG ma niezależny podgląd scen (pokoje per-scena)                   |
| 05  | Tokeny                                        | ✅     | 2026-07-17        | HP widoczne tylko dla właściciela+MG; ikony statusów z game-icons (CC BY)                        |
| 06  | Silnik kości CP RED                           | ✅     | 2026-07-18        | krytyk/fumble auto dla pojedynczej d10; /gr = autor+MG (styl Foundry)                            |
| 07  | Karta postaci — model i edytor                | ✅     | 2026-07-18        | umiejętności Easy Mode (41) w data/public; gracz też tworzy postaci; okna pływające              |
| 08  | Karta interaktywna i integracja               | ✅     | 2026-07-24        | rzuty z karty zawsze przez kubek; karta = źródło prawdy dla PW tokenu                            |
| 09  | AI Gateway — fundament botów                  | ✅     | 2026-07-24        | ~80 tok/s, kontekst 32k; think sterowany per żądanie; model zmyśla zasady (RAG: 19)              |
| 10  | Edytor botów                                  | ✅     | 2026-07-25        | + guardraile roli, auto-powtórka i nauka z korekt MG (rozszerzenie)                              |
| 11  | Boty NPC na czacie                            | ✅     | 2026-07-25        | pamięć per scenka; wypowiedź bota nie do odróżnienia od `/jako` MG                               |
| 12  | ~~TTS — głos botów~~                          | ⛔     | wycofany 09.08    | był gotowy 26.07 (Piper); kod usunięty, został sam maszynopis tekstu u klienta                   |
| 13  | Dane z podręcznika i kompendium               | ✅     | 2026-07-27        | domknięty 26.07 na darmowych materiałach; 27.07 uzupełniony z podręcznika głównego               |
| 14  | Inicjatywa i tury                             | ✅     | 2026-07-26        | tracker = pasek nad mapą + zakładka „Walka”; remisy: REF, przerzut RAW i drag                    |
| 14b | Ekonomia akcji: budżet tury i katalog         | ✅     | 2026-07-30        | + Ustabilizowanie od zera (etap 15 go nie miał, wbrew opisowi); „przepuść" jako karta MG         |
| 14c | Ruch w turze: budżet metrów na mapie          | ✅     | 2026-07-31        | metry po surowej ścieżce kursora (decyzja MG); kara pancerza i ran krytycznych jako dane         |
| 14d | Zwarcie: Pochwycenie, Duszenie, Rzut          | ✅     | 2026-07-31        | etap 14d podzielony na 14d/14e; migotliwy test death save miał inną przyczynę niż notatka        |
| 14e | Automaty tury: rany krytyczne, DoT, monity    | ✅     | 2026-07-31        | strażnik hooków w osobnej kolumnie (budżet tury jest odtwarzany); + kary płaskie z ran           |
| 15  | Obrażenia, pancerz, krytyki, Death Save       | ✅     | 2026-07-27        | obie tabele ran z podręcznika głównego (nieoficjalna tabela głowy zastąpiona 27.07)              |
| 16  | Zasięgi, DV z mapy, autofire                  | ✅     | 2026-07-28        | wręcz: PT zastępczy z karty celu + przycisk „Unik” (RAW nie zna statycznego PT)                  |
| 16b | Linia strzału i atak z mapy                   | ✅     | 2026-07-31        | etap 16b podzielony na 16b/16c; linia strzału = blokady wzroku strzelca, nie druga geometria     |
| 16c | Osłony jako obiekty sceny                     | ✅     | 2026-08-01        | osłona jedzie do klienta (ściana nie); blokada miękka z kartą wyboru zamiast twardej             |
| 16d | Granaty, obszary i rzut przedmiotem           | ✅     | 2026-08-01        | zwężony (amunicja → 16g); odchylenie pudła to zasada domowa — podręcznik jej nie ma              |
| 16e | Ruch klikiem: zaznaczenie, automat chodzenia  | ✅     | 2026-07-31        | trasa gracza tylko po tym, co widzi teraz — maska eksploracji nie pamięta ścian                  |
| 16f | Celowanie kursorem i HUD walki                | ✅     | 2026-08-01        | model klasycznego CRPG (klik we wroga celuje, MG przez Alt); HUD w nowym lewym pasku             |
| 16g | Amunicja specjalna: kule zmieniające rachunek | ✅     | 2026-08-07        | podzielony na 16g/16h 07.08; nabój = wpis kompendium, śrut jedzie tą samą drogą co wybuch        |
| 16h | Amunicja bez obrażeń: testy, gaz i dym        | ✅     | 2026-08-07        | dym tylko utrudnia (−4), nie zasłania; minuta = 6 rund, poza walką zdejmuje MG przyciskiem       |
| 17a | Fog of war i warstwa MG                       | ✅     | 2026-07-28        | etap 17 podzielony na 17a/17b; nowa scena startuje zakryta, mgła przełączalna                    |
| 17b | Rysowanie po mapie                            | ✅     | 2026-07-28        | tekst skaluje się z mapą (odstępstwo od wskazówki); MG domyślnie rysuje u siebie                 |
| 18a | Ściany i widoczność tokenów                   | ✅     | 2026-07-29        | etap 18 podzielony na 18a/18b; ściany nie opuszczają serwera                                     |
| 18b | Ciemność i źródła światła                     | ✅     | 2026-07-30        | zwężony 30.07 (eksploracja → 18c, drzwi/okna → 18d); 160 fps przy 10 światłach                   |
| 18c | Eksploracja i mgła MG nad widocznością        | ✅     | 2026-07-30        | + „zapal pomieszczenie", tłumienie światła przez okno i wygładzenie gradientu                    |
| 18d | Interakcje z drzwiami i oknami                | ✅     | 2026-07-30        | zasięg ręki 2 m, zamek MG; okno = firanka, a od dopisku 18e też otwierany otwór                  |
| 19a | Fundament RAG i asystent zasad MG             | ✅     | 2026-08-08        | etap 19 podzielony na 19a/19b/19c 08.08; embeddingi na CPU (0 GB VRAM), hybryda z FTS5           |
| 19b | Baza wiedzy kampanii i kontekst botów         | ✅     | 2026-08-08        | tag = jedyny język uprawnień; filtr w SQL przed mnożeniem wektorów; podręcznika bot nie czyta    |
| 19c | Streszczenia sesji, dziennik, relacje NPC     | ✅     | 2026-08-08        | dziennik = trzecia kolekcja RAG; wpis rodzi się „tylko MG"; relacja do karty postaci (−3…+3)     |
| 20a | Akcje botów: structured output i rzuty        | ✅     | 2026-08-08        | etap 20 podzielony na 20a/20b 08.08; gramatyka GBNF tylko w decyzji, wypowiedź zostaje prozą     |
| 20b | Tura bota w walce                             | ✅     | 2026-08-08        | „Graj turę” zawsze na klik (decyzja MG); ruch = podejdź/odsuń się, trasę liczy serwer            |
| 21  | ~~STT — polecenia głosowe~~                   | ⛔     | wycofany 09.08    | nierozpoczęty; głos wypadł z projektu w całości                                                  |
| 22  | ~~WebRTC — czat głosowy graczy~~              | ⛔     | wycofany 09.08    | nierozpoczęty; głos graczy załatwia zewnętrzny komunikator                                       |
| 23a | Cyborgizacje i człowieczeństwo                | ✅     | 2026-08-09        | etap 23 podzielony na 23a/23b/23c 09.08; EMP bieżące liczone z Człowieczeństwa wchodzi w rzuty   |
| 23b | Ekonomia: eurodolce, zakupy, lifestyle        | ✅     | 2026-08-09        | saldo pisze wyłącznie serwer (audyt `LedgerEntry`); pasmo ceny = cena; Poziom życia opcjonalny   |
| 23c | Reputacja i Facedown                          | ✅     | 2026-08-09        | PL nazwa to „Konfrontacja"; Reputacja wyliczana z listy wyczynów, −2 wybiera przegrany           |
| 24a | Handouty                                      | ✅     | 2026-08-09        | etap 24 podzielony na 24a/24b/24c 09.08; markdown własnym parserem w `shared`                    |
| 24b | Dziennik kampanii dla stołu                   | ✅     | 2026-08-09        | uprawnienie gracza to osobna kolumna, nie trzeci szczebel `visibility`; szukanie u klienta       |
| 24c | Screamsheets                                  | ✅     | 2026-08-13        | `kind` na handoucie z 24a; kroje gazetowe (OFL) hostowane u siebie; nagłówek = tytuł handoutu    |
| 25a | Kreator postaci: rola, cechy, umiejętności    | ✅     | 2026-08-14        | etap 25 podzielony na 25a/25b 14.08; dwie metody (Krawędziarz, Kompletny Pakiet), bez Szablonów  |
| 25b | Kreator: Ścieżka Życia                        | ✅     | 2026-08-14        | etap 25b podzielony na 25b/25c 14.08; 71 tabel, 522 wiersze; wróg → szkic bota jednym klikiem    |
| 25c | Kreator: wyposażenie startowe i poziomy       | ✅     | 2026-08-14        | 4 poziomy z ceny; +53 wpisy sprzętu z podręcznika (kompendium miało 5); pakiet Roli → POMYSŁY    |
| 26a | Sieć: dane, architektura i cyberdek           | ✅     | 2026-08-14        | etap 26 podzielony na 26a/26b/26c 14.08; ekran Sieci = pływające okno (decyzja MG)               |
| 26b | Run: punkty dostępu, winda i Akcje Sieciowe   | ✅     | 2026-08-15        | etap 26b podzielony na 26b/26c 15.08; punkt dostępu = obiekt sceny, ukryty do Skanera            |
| 26c | Walka w Sieci: Programy, Paf, Ślizg, LOD      | ✅     | 2026-08-15        | efekt Programu = dane wpisu; `Combatant.tokenId` nullowalny — LOD stoi w kolejce bez figury      |
| 26d | Węzły kontrolne i systemy obronne             | ✅     | 2026-08-15        | etap 26d podzielony na 26d/26e 15.08; wieżyczka = żeton z profilem statysty z 16b                |
| 26e | Demony                                        | ✅     | 2026-08-16        | etap 26e podzielony na 26e/26f 16.08; Demon trzyma węzły od startu, tura jednym klikiem MG       |
| 26f | Samodzielne systemy obronne i broniona strefa | ✅     | 2026-08-16        | strefa = trzeci prostokąt mapy (→ `rects.ts`); parser wyłuskał efekt z 13 z 18 wierszy           |
| 27a | Karta jak oficjalna: strona pierwsza          | ✅     | 2026-08-13        | wydzielony z 27 dnia 13.08 (27a/27b/27c); motyw dzień/noc na razie tylko dla karty               |
| 27b | Karta: broń, pancerz, ekwipunek               | ✅     | 2026-08-13        | zakładka „Walka" zniknęła; pancerz = 3 wiersze wydruku + reszta; trzy nowe pola prozy            |
| 27c | Karta: Ścieżka Życia i cyborgizacje           | ✅     | 2026-08-14        | sylwetka = gotowy SVG z domeny publicznej; gniazdo na ciele to nowe pole wiersza wszczepu        |
| 27  | ~~Kości 3D i szlif UI~~                       | ⛔     | rozdzielony 19.08 | rozbity do końca na 27d–27g; plik etapu został jako rozdroże ze wskazaniami                      |
| 27d | Kości 3D: skórki, dorzut, ustawienia          | ✅     | 2026-08-19        | pięć skórek, skórka jedzie z rzutem (jak w Foundry), dorzut drugą falą, okno ⚙ Ustawienia        |
| 27e | Motyw dzień/noc dla całej aplikacji           | ✅     | 2026-08-20        | mapa i okno Sieci zostają nocne (decyzja MG); `theme.css` = jedyny plik z kolorem, pilnuje testu |
| 27f | Szlif UX: pomoc, tooltipy, stany, okna        | ✅     | 2026-08-21        | + odwrócona umowa o przyciskach (decyzja MG); skróty mapy: jedna tabela dla kodu i dla pomocy    |
| 27g | Wydajność                                     | ⬜     |                   | re-rendery przy ruchu tokenów, bundle, lazy-loading, fps mapy                                    |
| 27h | Panel postaci: HUD, który wygląda jak gra     | ✅     | 2026-08-20        | dopisany 20.08 na wniosek MG; ikona slotu i waga statusu liczone w `shared`, nie w CSS           |
| 27i | Mapa: efekty walki                            | ✅     | 2026-08-20        | zwężony 20.08 (żetony → 27j); efekt przycinany per widz, bang czeka na kości                     |
| 27j | Żetony i czytelny ruch                        | ✅     | 2026-08-21        | kierunek patrzenia: automat z ruchu i strzału **plus** ręczna gałka (decyzja MG)                 |
| 28  | Wdrożenie na VPS                              | ⬜     |                   |                                                                                                  |

## Od czego zacząć

Ostatnia sesja była **naprawcza, poza etapami** (22.08, druga tego dnia): triaż zaległości plus
**pięć pozycji z niego**. Zamknięte: kłamiące `NO_ROUTE` bota, **pułapka z własną Turą** wchodząca
do Kolejki Inicjatywy sama, **specjalizacje umiejętności** („Nauka (Fizyka)") od kreatora po kartę
i czat, **ręczny „Onieśmielony"**, który wreszcie nakłada −2, i **gniazda per kończyna**. Przy
okazji przemeblowana dokumentacja: świadome decyzje wyszły do `decyzje-i-uproszczenia.md`, a dług
oględzin „strona gracza" scalił się w jedną pozycję zbiorczą na górze sekcji zaległości. Szczegóły
w notatce sesji niżej.

Sesja przed nią (22.08, pierwsza) zamknęła **grupy A i B** z triażu: przeciekający klik narzędzi
mapy (błąd #8, szerszy niż opis — dotyczył też stref i gniazd), brak drogi **przełączenia
kampanii** (#1), surowe id rany na czacie i w kompendium (#6), dymek celowania ślepy na nabój
w komorze (#4), chip naboju i etykieta odchylenia granatu (#5, #7), **przycisk MG „nadaj ranę
krytyczną"**, **Unik dla figury bez karty** i **zbieracz osieroconych plików z `uploads/`**.
Dzień wcześniej (21.08) trzecia sesja naprawcza zamknęła pięć innych błędów, a przed nią
**27f** i **27j**.

**Ruch gracza jest od 21.08 sprawdzany geometrią na serwerze.** `refuseWalkThroughSolid`
w `realtime/movement.ts` odrzuca trasę przez ścianę, zamknięte okno i stojącą osłonę — **także
poza walką**, i **odmowa nie nazywa przeszkody** (gracz nie może mapować budynku, wchodząc w nią).
MG jest zwolniony. Nowe narzędzie, które stawia coś nieprzenikalnego, dokłada segmenty
w `movementSegments`/`coverMovementSegments`, nie w nowej gałęzi walidacji.

**Etap 27 został rozdzielony do końca**: 27d, 27e, 27f, 27h, 27i i 27j zrobione, zostaje
**27g** (wydajność). Plik `etap-27-…` jest rozdrożem ze wskazaniami, sam nie jest do realizacji.

**Nowe narzędzie mapy dopisuje się do dwóch getterów, nie do czterech list.** `MapRenderer`
pyta o narzędzia w ręku wyłącznie przez `toolSpentThisClick` (gest rozliczony na `pointerdown`
— ściany, lampy, gniazda, osłony, strefy) i `mapToolArmed` (wszystkie, pędzle włącznie).
Pominięcie ich znaczy klik płacony dwa razy: narzędziu i grze pod spodem (błąd #8 z 08.08).
Pilnuje tego `map-click.test.ts`, który czyta `MapRenderer.ts` jako tekst.

**Aktywną kampanię przełącza `campaign:activate`, nie zapis w bazie.** Zdarzenie przenosi
**wszystkie** podpięte gniazda (pokoje, scena, `state:sync`) i odsyła `campaign:switch`; trasa
REST tworząca kampanię woła je zaraz po utworzeniu, żeby „utwórz" i „aktywuj" szły jedną drogą.
Przycisk „Aktywuj" jest w Panelu MG przy każdej nieaktywnej kampanii.

**Zdanie o tym, co się komuś stało, nie nosi id z pliku danych.** `describeAmmoFailure` wymaga
teraz etykiet (parametr obowiązkowy), a nazwy ran daje `criticalInjuryNames` w `shared`. Nowy
wołający, który zapomni podać nazw, zobaczy brak członu — nigdy `injury.head-uraz-oka`.

**Skróty klawiszowe mają jedno źródło i tak ma zostać.** `MAP_TOOL_KEYS` w
`packages/client/src/shortcuts.ts` czyta obsługa klawiatury w `MapArea` **i** okno pomocy —
nowe narzędzie mapy dopisuje się **tam**, nie w drabince `if`-ów. Pilnuje tego
`shortcuts.test.ts`, który czyta `MapArea.tsx` jako tekst i przewraca się na literale
`toggleTool('...')` w obsłudze klawiszy.

**Pływające okno bierze się z `useWindowPlacement`, nie z własnego `dragRef`.** Nowe okno
dostaje hook (`window-placement.ts`) plus `<WindowResizeGrip />` w rogu — i tyle. Uchwyt siedzi
**13 px od krawędzi**, bo róg okna jest wycięty (`clip-path` karty z 27a, zaokrąglenie
pozostałych okien) i uchwyt dosunięty do rogu przepuszcza kliknięcie na mapę pod spodem.

**Ikonowy przycisk potrzebuje `title` i `aria-label`, ale tylko wtedy, gdy jego treścią jest
znak.** Ikony SVG (`MapIcons`, `UiIcons`) są `aria-hidden`, więc tam `title` wystarcza za nazwę
dostępną. Pilnuje tego `a11y.test.ts`.

**Kierunek patrzenia jest stanem serwera i publiczną częścią żetonu.** `Token.facing` (stopnie,
0 = góra, zgodnie ze wskazówkami) pisze drop ruchu, strzał i gałka na pierścieniu zaznaczenia
(`token:facing` — drugie po `token:light` zdarzenie tokenu, które wykonuje **gracz**). Ręczny kąt
trzyma się do następnego **ruchu**, który go nadpisuje. Żadna reguła CP RED tego nie czyta —
to czytelność, nie mechanika.

**Efekt mapy jest przycinany na serwerze, nie w rendererze.** `fx:play` jedzie **per gniazdo**:
kto nie widzi lufy, nie dostaje ani jej, ani dźwięku; kto nie widzi żadnego końca strzału, nie
dostaje niczego. Reguła jest czystą funkcją (`trimMapFxForViewer` w `shared/src/fx.ts`) i ma
własne testy — nowy rodzaj efektu dopisuje się tam, nie w `MapFxLayer`.

**Kolor dokłada się tylko w `theme.css` — i pilnuje tego test.** `packages/client/src/theme.test.ts`
(pierwszy test w tym pakiecie) przewraca się, gdy w `styles.css` albo `sheet.css` pojawi się
literał koloru, gdy ktoś sięgnie po token, którego nie ma, gdy token zostanie bez odbiorcy albo
gdy tokenowi chromu zabraknie pary dziennej. Wszystkie cztery ścieżki sprawdzone celowym
psuciem plików, nie samym „przechodzi".

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

**„Poligon bojowy" stoi na poziomie sklepu 2 (Zawodowe)** — przestawione 22.08 decyzją MG wprost
w bazie (`Campaign.shopTier`), bo migracja dawała każdej kampanii `shopTier = 1` i gracz nie kupił
by niczego droższego niż 50 ed. Przełącznik 1–4 jest w zakładce **„Kompendium"** pod chipami
kategorii; MG kupuje przez wszystkie poziomy niezależnie od niego. **Do sprawdzenia przy pierwszym
uruchomieniu:** czy przełącznik pokazuje 2, a nie 1 — wartość szła do bazy z pominięciem UI.

**Następne etapy do wyboru: 27g** (wydajność) i **28** (VPS). Drobiazg „kostki kreatora świecą jak krytyki" z 25a/25b **jest zrobiony**
(flaga `plain`), jednobarwne 📰 z 24c i 🔌 z 26b też — obie stały się sylwetkami z game-icons

**Jedna rzecz czeka na włączony llama-server:** przebieg
`uv run --with httpx python tools/import/translate-descriptions.py` przetłumaczy **70** opisów
broni markowych (`--check` potwierdza: 70 do zrobienia, 271 pominiętych jako już polskie).
Sam przebieg, bez zmian w kodzie — skrypt naprawiono 21.08.
w 27e. **Sesja zerowa z drużyną** jest nadal najlepszym testem 25a+25b+25c i trzech stron karty
naraz — a od 27i także pierwszym, przy którym ktoś **usłyszy** dźwięki walki (dobrane bez
odsłuchu, przyciski próbek są w „⚙ Ustawienia"; od 27j jest wśród nich „Krok", który słychać
przy **każdym** przejściu przez pokój i który ma własny wyłącznik).

**09.08 głos wypadł z projektu** (sesja bez etapu, decyzja MG): etapy **12, 21 i 22** wycofane, kod TTS usunięty z repo. Szczegóły w `archiwum/dziennik-sesji.md` i w `archiwum/wycofane/README.md`.

### Otwarte zaległości (przechodzą między etapami)

- **ZBIORCZA — dług oględzin „strona gracza": 15 etapów, jedna sesja z drugiego konta.**
  Scalone 22.08 z kilkunastu osobnych wpisów, bo to **nie jest kilkanaście zadań, tylko jedna
  sesja** na koncie gracza. Wspólny mianownik wszystkich pozycji: wszystko oglądane było z konta
  MG, różnica **jest w payloadzie** (serwer filtruje przed emisją, nie CSS ukrywa) i wszędzie ma
  pokrycie testami na żywych gniazdach — nieobejrzany jest sam ekran. Zanim odhaczysz cokolwiek:
  (a) **odmowy statusowe są u MG niesprawdzalne** — `realtime/movement.ts:216` zwalnia MG
  z blokad; (b) przeczytaj wpis „Kliknięcie w token było zepsute dla graczy od 18a" niżej, bo
  część tych pozycji mogła być nieodklikana **dlatego**, a nie z braku czasu; (c) ustawienie
  stołu jest w „Pułapki dev" — MG na `http://localhost:5173/`, gracz na `http://[::1]:5173/`
  (to dwa różne hosty dla ciasteczka sesji, więc wystarczy jedna przeglądarka).

  - [ ] **27f** — okno `?` u gracza ma **mniej wierszy** niż u MG (ściany, mgła, osłony i światła
        są `gmOnly`); pokrywa test `shortcutGroupsFor(false)`.
  - [ ] **27f** — stany puste, które widzi **wyłącznie** gracz: handouty bez udostępnień, postacie
        przed pierwszą kartą. Zdania **są** tam z wcześniejszych etapów, ale nie były oglądane
        razem z resztą i mogą mówić innym językiem niż pustki dopisane w 27f.
  - [ ] **27j** — kierunek patrzenia i upadek figury. Różnica jest tu **mniejsza niż zwykle i to
        jest zamierzone**: `facing` jedzie w publicznej części `TokenView`, a stan figury liczy
        się z naklejek, które gracz i tak dostaje — widzi kierunek i upadek wroga, nie widząc
        jego PW. Testy: `token:facing` u właściciela, odmowa dla cudzej i ukrytej figury.
  - [ ] **27i** — efekty walki. `fx:play` jest przycinany **per gniazdo** (`trimMapFxForViewer`):
        kto nie widzi lufy, nie dostaje ani jej, ani dźwięku. Trzy testy na żywych gniazdach.
  - [ ] **27c** — obie nowe strony karty (Ścieżka Życia, sylwetka cyborgizacji). Różnicy w kodzie
        nie ma — jedyne pole tylko dla MG to Reputacja, i było takie już w 23c. Zapis gracza
        pokrywa test „the player writes their own page two and places their own chrome".
  - [ ] **26f** — czy ukryta strefa znika z ekranu gracza, czy odsłonięta się rysuje i czy po
        zdanej Percepcji dostaje ją **tylko jego** konto (`fetchZonesFor`); trzy testy.
  - [ ] **26e** — okno Demonów. **Wymaga przepięcia karty**: netrunnerem Poligonu jest „Test 27x",
        która należy do MG, a nie do Tony'ego ani avatar9. Demon „czuwający" w ogóle nie wchodzi
        do payloadu gracza, a atak na niego wraca `NET_DEMON_UNKNOWN`; dwa testy.
  - [ ] **26d** — okno urządzeń: gracz nie dostaje ich listy, dopóki nie przejmie węzła (test
        „nie przysyła graczowi listy urządzeń").
  - [ ] **26c** — okno walki w Sieci: gracz nie dostaje ATK/OBR/PER/PRĘ Czarnego LOD-a ani jego
        efektu, dopóki ten go nie dopadnie (`netcombat.test.ts`).
  - [ ] **26a** — zakładka „Sieć" nie istnieje dla gracza: `net:*` ma rolę `ROLE_GM` i emituje
        wyłącznie do `gmRoom` (test „never lets a player near the library" — lista, odczyt i zapis
        odmawiają). U MG sprawdzone było tylko to, że zakładka stoi w rzędzie MG.
  - [ ] **25c** — odmowa poziomu sklepu („Kup" wyszarzone, serwer wraca „Poza zasięgiem sklepu.
        Poziom 2 (Zawodowe) — kampania ma odblokowany N") **oraz** cały krok wyposażenia
        w kreatorze. U MG niesprawdzalne: jest z blokady zwolniony.
  - [ ] **23c** — „Wycofaj się" / „Nie ustępuj (−2)" na karcie czatu, gdy przegraną Konfrontacji
        jest **figura gracza** (test `o wycofaniu decyduje przegrany, nie zwycięzca`). Konfrontacje
        z 10.08 szły z konta MG, więc przyciski oglądał MG.
  - [ ] **23b** — karta przelewu na **ekranie odbiorcy**. Wiersz czatu ma `recipientId`, więc
        dociera do obu stron i MG; nikt nie był zalogowany jako Tony, żeby to zobaczyć.
        **Potrzeba trzeciego hosta** — patrz „Pułapki dev".
  - [ ] **18d/18e** — ikona 🪟 u gracza oraz odmowy „Za daleko — podejdź do okna", „Okno zamknięte
        na skobel", „Zamknięte na klucz". Testy dymne na payloadzie.
  - [ ] **16b** — klik w token ładujący kubek ataku, „🎯 Atak…" w menu kontekstowym tokenu
        i edytor profilu bojowego w „Edytuj…". **Wymaga myszy**, nie automatu: CDP nie dowozi
        trafienia wskaźnikiem w warstwę Pixi (patrz „Pułapki dev"). 13 testów w `attacks.test.ts`.
  - [ ] **14e** — samo **zdanie rany** w treści karty odmowy (Uraz kręgosłupa, monit przy Urazie
        ucha). Od 22.08 osiągalne w jednym kliknięciu: MG nadaje ranę z karty postaci. Mechanizm
        karty odmowy u gracza jest już potwierdzony trzy razy (budżet 14b, dystans 14c, Powalony).

- **Etap 27f — okno większe od przeglądarki nieodklikane; reszta sprawdzona 21.08 (patrz
  notatka sesji).** Sprowadzanie na ekran sprawdzone na oknie, które się mieści; dla okna
  **większego** niż okno przeglądarki zostaje próg „róg zawsze do złapania" i tej gałęzi nikt
  nie oglądał. (Strona gracza → pozycja zbiorcza na górze sekcji.)

- **Etap 27j — dwie ścieżki nieodklikane; reszta sprawdzona 21.08 (patrz notatka sesji).**
  (Strona gracza → pozycja zbiorcza na górze sekcji.)
  (1) **Zacienienie zasięgu wokół ściany** — na „Strzelnicy" widoczność jest `open`, więc zalew nie miał czego omijać; że omija,
  wiadomo z testu w `shared` („nie zacienia drugiej strony ściany"), nie z ekranu. (2) **Figura
  2×2 lub większa** — suma kwadratów i test footprintu mają pokrycie w `shared`, ale na Poligonie
  nie ma żetonu większego niż 1×1.

- **Etap 27j — `down` czyta się słabiej niż `dead` i to jest świadomy kompromis.** Martwy dostaje
  wielki czerwony ✕ przez portret, nieprzytomny tylko ciemnoczerwoną podstawkę i przyciemniony
  portret (`tint` mnoży, więc nie odbarwia — Pixi nie da odsycenia bez filtra na figurę). Przy
  zoomie stołowym oba są rozpoznawalne, ale ✕ widać z drugiego końca stołu, a podstawkę trzeba
  chwilę poszukać. Gdyby przy stole wyszło, że to za mało, najtańszym krokiem jest **przechylenie
  figury** dla `down` — z tym, że obrót kontenera obróciłby też imię i naklejki, więc trzeba by
  przechylać sam portret.

- **Etap 27j — figura na zerze PW zacienia jedno pole i wygląda to jak podświetlenie.** Przy
  `metresLeft = 0` zalew zwraca samą kratkę startową, więc pod figurą pojawia się blady kwadrat
  znaczący „nie masz jak stąd wyjść". To prawda, ale czyta się jak zaznaczenie. Do rozważenia
  **27f jej nie ruszył** — stany puste tego etapu dotyczyły list w panelach, nie mapy. Wraca
  przy pierwszej sesji, na której ktoś stanie na zerze budżetu.

- **Etap 27i — trzy ścieżki nieodklikane; reszta sprawdzona 20.08 (patrz notatka sesji).**
  (1) **Wybuch, chmura gazu i wyładowanie strefy** — kod i oba arkusze CC0 sprawdzone
  (krojenie klatek zweryfikowane w przeglądarce), ale animacji nikt nie widział: na Poligonie
  nie ma postaci z granatem, a wejście na „Podłogę elektryczną" kosztuje 6k6. (2) **Liczba
  obrażeń nad figurą** — ta sama ścieżka co widziane „PUDŁO", różni ją jedna linia w
  `damageMapFx`. (3) **Dźwięki** — odtwarzane, ale nikt ich nie słyszał, a próbki dobrano po
  nazwach plików w paczkach CC0; rządek przycisków odsłuchu jest w „⚙ Ustawienia" właśnie po to.
  (Strona gracza → pozycja zbiorcza na górze sekcji.)

- **Etap 27i — pomiar fps nie objął sceny ze światłami i mgłą.** „Strzelnica" ma widoczność
  `open`, więc 160,1 → 161,2 fps mierzy **samą warstwę efektów**, a nie najgorszy przypadek
  z kryterium etapu. Warstwa rysuje na klatkę kilka ścieżek `Graphics` i najwyżej jeden sprite,
  więc rezerwa jest duża — ale liczby dla sceny z dynamiczną widocznością nadal nie ma.

- **Etap 27e — trzy ścieżki nieodklikane; reszta sprawdzona 20.08 (patrz notatka sesji).**
  (1) **Ekran dołączenia do stołu** (`/join/<token>`) — potrzebny świeży link zaproszenia, a ten
  z Poligonu wygasł; ekran używa tych samych klas `.auth-*` co logowanie, które w obu trybach
  jest sprawdzone. (2) **Okno runa w Sieci od środka** — wymaga rozpoczęcia runa na żywej
  kampanii. (3) **Screamsheet** — lista handoutów Poligonu jest pusta. Przy (2) i (3) różnica
  jest **żadna z definicji**: `--net-*` i `--paper` nie mają wariantu dziennego.

- **Etap 27e — pułapka, która wróci: gołe `button` maluje się jak przycisk główny.** W `styles.css`
  selektor `button` ustawia `background: var(--accent)` i biały napis, więc każdy nowy przycisk,
  który podmieni tło i **zapomni o `color`**, dostanie biały tekst. W ciemnym motywie to niewidoczne;
  w dziennym to białe na kremowym. Tak powstały dwa z czterech błędów tego etapu.
  **Zamknięte w 27f**: umowa jest odwrócona (`button` neutralny, `.primary-button` czerwony),
  a test motywu pilnuje, żeby przycisk z mocnym tłem nie zapominał o kolorze napisu.

- **Etap 27d — trzy ścieżki nieodklikane; reszta sprawdzona 19.08 (patrz notatka sesji).**
  (1) **Złoty dorzut krytyka** — na zrzucie ekranu złapany został fumble (dwie kości w dwóch
  kolorach na stole), krytyka nie: 20% na rzut, a okno, w którym kość leży, trwa ~3 s. Ścieżka
  jest **ta sama**, różni ją jeden zestaw kolorów. (2) **Wyłączenie animacji i głośność 0** —
  obie prowadzą do wcześniejszego wyjścia z `playRollAnimation` / `playRattle` i były czytane
  w kodzie, nie klikane. (3) **Rzut Cech w kreatorze bez zielonych dziesiątek** — flaga `plain`
  ma test w `shared` i przechodzi przez serwer, ale kreatora nikt nie otwierał.

- **Etap 26f — cztery ścieżki nieodklikane; reszta sprawdzona 16.08 (patrz notatka sesji).**
  (Strona gracza → pozycja zbiorcza na górze sekcji.)
  (1) **Ślizgawka i wymuszony Test** — w przeglądarce klikana była wyłącznie podłoga elektryczna; Test Atletyki
  z wyzwalaczem „każdy ruch na obszarze" ma test serwera. (2) **Kara do RUCH-u (Maź)** — naklejka
  **„Spowolniony"** (nowy status, ikona `slowed.svg` z game-icons) i jej liczba w budżecie ruchu
  („Pancerz −2 · Spowolniony −7") widziane tylko w testach; **ikona nie była oglądana na żetonie**.
  (3) **Strzał stanowiska** — ścieżka `fires` przeszła testem wyłącznie w wariancie „nie ma żetonu
  na scenie"; prawdziwy strzał wieżyczki związanej ze strefą wymaga żetonu z bronią i celu w polu
  ostrzału. (4) **Winda z gazem w Kolejce Inicjatywy** — od 22.08 wiersz wstawia się sam przy wejściu na
  obszar (patrz akapit niżej), ale nikt tego nie widział na ekranie: pokryte testem serwera.

- ~~**Etap 26f — pułapka z własną Turą nie wstawia się do Kolejki sama.**~~
  **Naprawione 22.08.** Wejście na obszar pułapki z wyzwalaczem `turn` (winda z gazem, s. 216)
  **zakłada jej wiersz w Kolejce Inicjatywy** — `pushZoneIntoQueue` w `zones.ts`, wzorowane na
  `pushNetFoeIntoQueue` z 26c: wiersz bez figury (`Combatant.zoneId`, nowa kolumna + migracja),
  inicjatywa o punkt wyżej od najwyższej, `order: -1`. **Odpalenie zostaje klikiem MG** — linia
  26c/26e („nic nie rusza się samo") się nie zmienia; zniknęła tylko papierkowa robota.
  Trzy przypadki milczenia, każdy świadomy: nie ma walki, pułapka już w kolejce stoi, albo
  **runda 0 („PRZED WALKĄ")** — tam inicjatywy są nierzucone, więc „o punkt wyżej" dałoby
  pułapce 1, czyli po rzutach miejsce **ostatnie**. Wiersz znika przy rozbrojeniu, rozstrzelaniu
  i usunięciu strefy. Test w `zones.test.ts`.

- **Etap 26e — trzy ścieżki nieodklikane; reszta sprawdzona 16.08 (patrz notatka sesji).**
  (Strona gracza → pozycja zbiorcza na górze sekcji.)
  (1) **„Ten Demon miał już swoją Turę w tej Rundzie"** — na Poligonie tryb turowy jest wyłączony,
  więc rund nie ma i odmowa nie ma jak paść; pokryta testem serwera. (2) **Wstawka Demona do
  Kolejki Inicjatywy** — z tego samego powodu: bez rozpoczętej walki nie ma do czego wstawiać
  (test serwera sprawdza inicjatywę „o jeden punkt wyżej" i wiersz bez figury). (3) **Uwaga
  „jeden Demon na sześć pięter"** — Architektura Poligonu ma cztery piętra i jednego Demona, czyli
  mieści się w budżecie; żeby zobaczyć zdanie, trzeba dołożyć drugiego (pokryte testem w `shared`).

- **Etap 26d — trzy ścieżki nieodklikane; reszta sprawdzona 15.08 (patrz notatka sesji).**
  (1) **„Raz na Turę"** — `NET_NODE_USED` ma polskie zdanie i test na żywych gniazdach, ale
  w przeglądarce do niego nie doszło: rundy istnieją dopiero po **rozpoczęciu** walki (sam
  „Włącz tryb turowy" zostawia stan „PRZED WALKĄ" i rundę 0), a rozkręcanie walki w żywej
  kampanii zmieniłoby stan Poligonu bardziej niż warto. (2) **Drzwi z 18d** — na „Strzelnicy"
  nie ma ani jednych; ścieżka jest kopią `opening:toggle` i ma test serwera, w oknie Sieci
  klikane były kamera i wieżyczka. (3) **Odmowa `NET_DEVICE_OFF`** — z tego okna **nie da się**
  do niej dojść i to jest zamierzone: wyłączone urządzenie pokazuje wyłącznie „Włącz". Zdanie
  istnieje dla klienta, który by o tym nie wiedział, i ma test.
  (Strona gracza → pozycja zbiorcza na górze sekcji.)

- ~~**Etap 26d — strzał z wieżyczki za osłoną nie ma czym odpowiedzieć.**~~ **Naprawione 21.08**
  (sesja naprawcza). `request.ignoreCover` jechało w payloadzie i **nikt go stamtąd nie ustawiał**
  — `NetRunWindow.tsx` w ogóle nie znało tego pola. Odmowa jest teraz **kodem**
  (`NET_SHOT_COVERED` / `NET_SHOT_BLOCKED` w `NET_DEVICE_MESSAGES`), a nie gotowym zdaniem, więc
  okno rozpoznaje ją i podstawia przycisk **„Strzelaj mimo osłony"**, powtarzający operację
  z `ignoreCover`. `fireDevice` zwraca `blocked` jako `{ code, text }`: kod dla okna, zdanie dla
  logu Demona (26e) i strefy (26f), które wstawiają je wprost na czat. **Druga Akcja Sieciowa
  nadal się należy** — jej zwrot to osobny, świadomy wpis w `POMYSLY.md` (15.08).

- **Etap 26c — cztery ścieżki nieodklikane; reszta sprawdzona 15.08 (patrz notatka sesji).**
  (Strona gracza → pozycja zbiorcza na górze sekcji.)
  (1) **Superklej i „Zdejmij" u MG** — hak `glue` ma test w `shared`, a w przeglądarce do niego
  nie doszło: trzeba wrogiego LOD-a z tym efektem (Kraken) albo Superkleju w cudzym
  deku. (2) **Paf** — sprawdzony testem serwera, w oknie klikany był tylko Miecz. (3) **LOD
  przeciwprogramowy** (bije w losowy zrezowany Program zamiast w mózg) — cały przypadek pokryty
  testami, nieoglądany. (4) **Zderezowanie LOD-a przez gracza** i wypadnięcie go z kolejki —
  w oględzinach LOD schodził do REZ 10, nie do zera.

- **Etap 26c — „raz na rundę w Somie" świadomie pominięte.** „Załadowany na cyberdek Program
  można aktywować tylko raz na rundę w Somie" (s. 201) nie jest egzekwowane: rundy istnieją
  wyłącznie w trybie turowym, a zakres etapu wymienia inne ograniczenia Programów („jedna kopia
  naraz", „raz na wejście", derez i dwie Akcje na przywrócenie), które są. Wpis w `POMYSLY.md`.

- **Etap 26b — dwie ścieżki nieodklikane; „Sieć 1/4" domknięte 15.08 przy 26c.** (1) **Ściana
  między netrunnerem a gniazdem** (`NET_WALL_BLOCKS`) — Poligon nie ma ścian na scenie
  „Strzelnica"; geometria to `hasLineOfFire` z 16b, ta sama, którą 16b odklikało. (2) **Odmowy
  `NET_NO_INTERFACE` i `NET_NO_DECK` w przeglądarce** — pokryte testami serwera, u MG nieoglądane
  (przycisk „Podłącz się" po prostu wraca z odmową). ~~(3) Budżet Akcji Sieciowych w trackerze~~
  — **odklikane 15.08**: w RUNDZIE 1 wiersz Kolca pokazał „Akcja 1/1 · Sieć 1/4" po pierwszej
  Akcji Sieciowej.

- **Etap 26a — trzy ścieżki nieodklikane, wszystkie po stronie MG albo skrajnego przypadku.**
  (1) **Formularz „Obrona Sieci"** w edytorze MG kompendium (REZ, Interfejs, Akcje Sieciowe,
  Wartość bojowa, ikona) — kategoria była przełączana, ale pola nie były wypełniane ani
  zapisywane; pokryte testem w `compendium.test.ts`. (2) **Ręczne budowanie architektury
  od zera** przyciskiem „+ Nowa" — oglądana była wyłącznie wylosowana; różnicy w kodzie nie ma
  (obie drogi kończą się na tym samym `net:save`), ale pusty trzon z „+ Piętro" nie był klikany.
  (3) **Pasek „Uwagi" pod szybem** (`netArchitectureAdvice`) — hasło bez PT i piętro LOD-u bez
  wpisu; generator zawsze wypełnia oba, więc do tego stanu trzeba dojść ręczną edycją.
  Sam tekst jest pokryty testem w `netrunning.test.ts`.

- ~~**Etap 26a — szybka sekwencja zmian na karcie gubi część edycji.**~~ **Naprawione 21.08**
  (sesja naprawcza). Przyczyna leżała o krok dalej, niż mówiła notatka: strażniki
  `pendingSaves > 0` **były** i w `endSave`, i w `applyUpsert`, ale liczyły wyłącznie zapisy
  **wysłane** — łatka czekająca w buforze debounce nie liczyła się wcale, więc ack poprzedniego
  zapisu adoptował widok serwera i kasował ją ze store'a. Następny klik budował listę z okrojonego
  stanu i wiersz przepadał bez śladu. Teraz `beginSave` idzie przy **kolejkowaniu**, nie przy
  flushu (jeden bufor = jeden zapis). Ta sama poprawka w ścieżce botów, która miała identyczny
  błąd. Pilnuje `packages/client/src/character-save.test.ts` — trzy testy na podstawionym
  gnieździe, sprawdzone celowym cofnięciem poprawki.

- **Etap 27c — dwie ścieżki nieodklikane, obie skrajne.**
  (Strona gracza → pozycja zbiorcza na górze sekcji.)
  (1) **Postać wychodząca prosto z kreatora** — sprawdzona była karta, w którą Ścieżkę wpisano
  ręcznie; przepływ „kreator wypełnia 17 pytań → strona druga je pokazuje" idzie tym samym
  polem `data.lifepath`, więc rozjazd jest nieprawdopodobny, ale nie był oglądany.
  (2) **Wąskie okno** — `@container (max-width: 560px)` zwęża rubryki do jednej kolumny
  i zmniejsza pudełka gniazd; okno karty ma `min(1180px, 100vw − 32px)`, więc do tego progu
  trzeba ekranu poniżej ~600 px, a `resize_window` na zmaksymalizowanym oknie nic nie daje.

- ~~**Etap 27c — cztery gniazda kończyn dzielą jedną pulę.**~~ **Naprawione 22.08** — i taniej,
  niż mówiła notatka: model danych **był już gotowy**, bo `bodySlot` (27c) siedzi na wierszu od
  dawna i tylko arytmetyka go ignorowała. `cyberwareCapacity` liczy teraz **także per pudełko
  sylwetki**: „Cyberkończyny 2 / 8" dostaje pod spodem „Prawa cyberręka: 2 / 4 · Lewa: 0 / 4".
  Wiersz rodziny **zostaje nagłówkiem** i nie zmienia się ani o punkt — to jego liczbę czyta
  rachunek Człowieczeństwa. Rozbicie (`places`) dostają wyłącznie rodziny z **więcej niż jednym**
  pudełkiem (Cyberoptyka, Cyberkończyny); przy Cyberaudio powtarzałoby wiersz rodziny.
  Wszczepy, których nikt nie umieścił, liczą się raz w `unplaced`, żeby obie sumy się zgadzały —
  i **nie** wpadają do żadnej kończyny po cichu. Nowość, której licznik per rodzina nie umiał
  złapać: modyfikacja w ręce, której nie ma („nie ma w czym"), gdy druga ręka jest cybernetyczna.
  Cztery testy w `cyberware.test.ts`. **Nieodklikane w przeglądarce** — do obejrzenia na karcie
  z chromem w obu rękach.

- **Etap 25c — dwie ścieżki nieodklikane.** (1) **Wgranie portretu w kreatorze** — przycisk
  widziany i naprawiony, ale pliku nie wgrywano; trasa to ta sama `/api/uploads/portraits` co
  na karcie z etapu 07. (2) **Druga sztuka tego samego przedmiotu** w koszyku (chip „×2"
  i wiersz „nazwa ×2" w audycie) — klikane było „+" po jednej sztuce; pokryte testem.
  (Odmowa poziomu i krok wyposażenia u gracza → pozycja zbiorcza na górze sekcji.)

- **Etap 25c — Krawędziarz nie dostaje odgórnego pakietu Roli.** RAW (s. 98 i 103) daje mu
  broń, pancerz, ekwipunek i modę z tabeli swojej Roli **plus** 500 ed; VTT daje na razie samą
  gotówkę, a pakiet dokłada MG przyciskiem „Dodaj za darmo". Świadome (decyzja MG z 14.08):
  te trzy tabele w zrzucie PDF-a to jeden sklejony ciąg dla pięciu Ról naraz. Wpis w `POMYSLY.md`.

- **Etap 25c — 800 ed Kompletnego Pakietu „tylko na Modę" jest napisem, nie pieniędzmi.**
  VTT nie ma katalogu ubrań (tabela Mody z s. 356 nie jest zaimportowana), więc krok
  wyposażenia mówi o tych pieniądzach i ich nie wydaje. Dodanie ich do portfela byłoby
  prezentem — za 800 ed można kupić karabin. Wpis w `POMYSLY.md`.

- **Etap 25a — cztery ścieżki nieodklikane.** (1) **Odmowa serwera przy przepełnionej puli** —
  „Utwórz postać" jest wyszarzone, więc do `CREATION_INCOMPLETE` w przeglądarce się nie dojdzie;
  pokryte testem serwera. (2) **Degradacja bez `creation.json`** — kreator ma wtedy powiedzieć
  „Brak danych tworzenia postaci…" zamiast pustego okna (`CREATION_DATA_MISSING`); w repo jest
  próbka publiczna, więc ten stan wymagałby skasowania obu plików. ~~(3) **Wybór właściciela przez MG**~~ —
  **odklikane 14.08 przy 25b**: MG utworzył postać z listy „NPC (MG) / Tony / avatar9 / Marcin"
  i w bazie stanęła z właścicielem **Marcin**. (4) **Rangi Postaci inne niż „początkująca"** — selektor
  pokazuje pięć pozycji (50–80 pkt), klikana była tylko domyślna 62.

- ~~**Etap 25a — nazwa umiejętności wielokrotnej nie ma gdzie zamieszkać.**~~
  **Naprawione 22.08.** Karta ma `skillSpecialties` (skillId → dziedzina), a czyta się je
  **wyłącznie** przez `cpredSkillSpecialty` / `cpredSkillLabel` w `shared` — bo Język odpowiada
  z `lifepath.language`, gdzie mieszka od 25b, a pozostałe z nowej mapy. Etykieta „Nauka (Fizyka)"
  idzie na kartę, w tytuł rzutu i w rozbicie na czacie. Kreator **pyta** i nie skończy postaci
  bez odpowiedzi.
  **Umiejętności są cztery, nie trzy** — do „Nauki", „Gry na instrumencie" i „Wiedzy lokalnej"
  doszły **„Sztuki walki"** („każdego stylu musisz się uczyć osobno", s. 81), które notatka
  pomijała.
  **Dwa świadome ograniczenia.** (1) **Jedna dziedzina na umiejętność, nie wiele** — postać
  znająca karate i judo ma tu jeden wiersz; RAW dałoby dwie osobne umiejętności, a to inny model
  danych (`skills` kluczowane czymś więcej niż id). (2) **Umiejętność podstawowa nie blokuje
  kreatora** — „Wiedza lokalna" jest na liście każdej Roli, więc twardy wymóg byłby podatkiem
  od **każdego** NPC-a, a etap 25a wprost chroni ścieżkę „pięciu NPC-ów w jeden wieczór". Pole
  i tak stoi w kreatorze i na karcie, tylko nie zatrzymuje. Jeśli przy stole wyjdzie, że ma
  zatrzymywać — to jeden `if` w `creationIssues`.

- **Etap 27b — rana krytyczna w nowym panelu nieobejrzana, ale od 22.08 **osiągalna w jednym
  kliknięciu**.** „Krytyczne Urazy" w kolumnie tożsamości widziane było wyłącznie w stanie pustym,
  bo MG nie miał czym nadać rany. Ma: lista wyboru + „Nadaj" pod listą ran (`character:injury`).
  Zostaje samo **obejrzenie** wiersza z raną — nazwa, `2k6 = N`, chip „na minutę", „+N do Testu
  Przeżywalności", efekt, kosz — w obu motywach i na wydruku.

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

- ~~**Etap 24a — grafika po usunięciu handoutu zostaje na dysku.**~~ **Naprawione 22.08**
  (sesja naprawcza) i szerzej: sprzątacza nie miał **żaden** z czterech katalogów. `uploads-gc.ts`
  chodzi w tle przy starcie serwera i kasuje plik **tylko** wtedy, gdy żadna kolumna go nie
  wymienia i jest starszy niż godzina (portret w kreatorze powstaje, zanim istnieje postać).
  Odnośniki zbierane są z kolumn z adresem **i** wyrażeniem regularnym z kolumn JSON (szkic
  kreatora, ładunek czatu, dane karty) — **nowa kolumna z adresem musi trafić na tę listę**,
  inaczej znaczy skasowany plik. Przebieg na sucho na żywych danych: 10 plików, 0 sierot.

- **Etap 24a — odmowy uploadu nieodklikane.** Plik > 12 MB, obraz > 4096 px na bok i format
  spoza PNG/JPG/WebP mają wrócić po polsku z `uploadErrorText`; sprawdzony był wyłącznie
  poprawny PNG. Ścieżka jest kopią routingu portretów z etapu 07.

- ~~**Etap 23c — „Cofnij" na karcie obrażeń nie przywraca strachu.**~~ **Naprawione 21.08**
  (sesja naprawcza). Wpis był w dodatku **mylący**: komentarz w `realtime/damage.ts` obiecywał,
  że powrotem jest ręczne zaznaczenie „Onieśmielonego" w menu tokenu — a to nie działa, bo
  `clearFacedownFear` kasuje **i naklejkę, i adres** w `statusData`, a `token:update` `statusData`
  nigdy nie pisze. Karta obrażeń zapisuje teraz listę uwolnionych (`fearCleared` w
  `DamageLogEntry`), a „Cofnij" woła `restoreFacedownFear`. Test w `facedown.test.ts` dowodzi
  powrotu **rzutem**, nie samą naklejką — bo naklejka to połowa kary.

- ~~**Etap 23c — status „Onieśmielony" zaznaczony ręcznie nic nie liczy.**~~
  **Naprawione 22.08.** Kara nadal wymaga **dwóch** rzeczy naraz (naklejki i adresu przeciwnika
  w `Token.statusData`) i tak ma zostać — dzięki temu zdjęcie naklejki jest pełnym „zdejmij karę".
  Zmieniło się to, że **drugą połowę da się wreszcie dopisać ręcznie**: pod statusami w menu
  żetonu stoi lista **„Boi się:"** z figurami sceny (`token:feared`, MG-only), a nagłówek mówi
  wprost „nikogo, więc −2 nie działa". `token:update` był złą drogą i nią nie jest — pisze
  kolumny, którymi figura **jest**, a nigdy `statusData`. Lista jedzie w prywatnej części
  `TokenView` (`feared`) — MG i właściciel, jak PW. Trzy testy w `facedown.test.ts`: kara
  schodzi z rzutu dopiero po wskazaniu kogo, zdjęcie naklejki ją wyłącza mimo zapisanego adresu,
  gracz nie dopisze nikomu niczego.

- **Etap 23b — trzy ścieżki nieodklikane.**
  (Karta przelewu u odbiorcy → pozycja zbiorcza na górze sekcji.)
  (1) **Zakup pancerza i sprzętu** — sprawdzona tylko broń; wiersze pancerza
  (`spCurrent`, lokacja, kara) i sprzętu idą tą samą funkcją `purchasedSheetRow` i mają test
  w `shared`, ale w przeglądarce nie były klikane. (2) **Wpis bez ceny liczbowej** — „Kup" ma być
  wtedy wyszarzony, a cena ma się liczyć z pasma; w kompendium kampanii wszystkie oglądane wpisy
  miały cenę. (3) **„Znaleziony — montaż N ed"** przy cyborgizacji (s. 375) — przycisk istnieje
  i jest pokryty testem, klikany był tylko wariant pełnopłatny.

- **Etap 23a — dwie ścieżki nieodklikane.** (1) **Chip cyberpsychozy
  na liście postaci** (`character-psychosis` w `CharacterPanel.tsx`) — dopisany **po** oględzinach,
  więc widziany tylko w kodzie; pokazuje się dopiero przy EMP ≤ 2, czyli po utracie ~40 punktów
  Człowieczeństwa. (2) **Edytor MG wpisu cyborgizacji** z nowymi polami (rodzina, montaż, UC stałe
  i kostkowe, „Połowa, w górę", gniazda, „Wymaga") — formularz nie był otwierany.

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

- ~~**Etap 20b — `NO_ROUTE` mówi „droga jest zablokowana", choć zwykle nie jest.**~~
  **Naprawione 22.08.** Rozdzielone na trzy kody, bo powody były trzy — i przy okazji wyszło,
  że stary komunikat kłamał **częściej**, niż mówiła notatka: `planWalk` **nigdy nie odmawia**
  celu nie do osiągnięcia (oddaje trasę do najbliższego pola z `truncated`), więc „droga jest
  zablokowana" nie było prawdą właściwie nigdy. Dziś: `NO_ROUTE` (figura naprawdę zamurowana —
  najlepszym polem jest to, na którym stoi, a cel jest gdzie indziej), `NO_ROUTE_BUDGET`
  („za mało metrów ruchu w tej turze") i `ALREADY_IN_PLACE` („już tam stoisz — podejście niczego
  nie zmieni"). Zdanie idzie do modelu jako powód do poprawki, więc każde podpowiada **inny**
  następny ruch. Rozróżnienie „już tam stoję" od „zamurowany" robi porównanie pola startowego
  z docelowym (`walkCellOf` w `bot-combat.ts`). Testy w `bot-combat.test.ts`.

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

- **Z ośmiu błędów sesji testów 08.08 nie został żaden nienaprawiony.** #2 i #3 padły tego samego
  dnia, #4, #5, #6, #7 i #8 — 22.08 (sesja naprawcza), #1 razem z brakującym przełącznikiem
  kampanii. Plik `docs/testy/sesja-testow-walki-2026-08-08.md` dalej jest wart czytania przed
  odhaczaniem czegokolwiek, ale wyłącznie dla **poligonu i listy sprawdzonych ścieżek** — jego
  rozdział „Znalezione błędy" jest już historią.

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

- **Górny pasek tury (01.08, poza etapami) — strona MG odklikana 08.08 poza jednym punktem.** Przy resecie walki po wpadce z 19a sprawdziły się trzy z czterech: **„Włącz tryb turowy"** w pustej belce zakłada kolejkę z figur sceny jednym klikiem (wyszła piątka: Rico, Kaya, Manekin, Brutus, Zbir, stan „PRZED WALKĄ", inicjatywa nierzucona); **✕** rzeczywiście pyta „Wyłączyć tryb turowy?" i kasuje kolejkę; **żeton ukryty** (Zbir) jest przygaszony i widoczny tylko u MG. **Zostaje:** strzałki **◀ ▶** przesuwające turę **bez zaznaczonego tokenu** — to była główna przyczyna, dla której zostały na górze. Potwierdzone przy okazji: `window.confirm` da się przechwycić (`window.confirm = () => true`) i nie zawiesza sterowania przez CDP; przycisku wyszarzonego na scenie bez tokenów nie sprawdzano.

- **Lewy pasek (01.08, poza etapami) — dwie ścieżki nieodklikane.** (1) **Przejęcie sterowania klikiem w slot**: sprawdzone na Vexie, ale wszystkie jego sloty były odmówione („Akcja w tej turze już wykorzystana"), a odmówiony slot celowo sterowania **nie** przejmuje — do powtórzenia na figurze z wolną Akcją (po naciśnięciu slotu ma zniknąć linia „Podgląd", a na tokenie ma pojawić się przerywany pierścień). (2) **Zmiana sceny**: pasek ma wtedy wczytać figurę zapamiętaną na nowej scenie, a nie zostać przy starej — ścieżka `SelectionChange = 'scene'`. Strona MG jest z założenia nietknięta (sama pamięć, bez domyślnej figury), więc u MG wystarczy sprawdzić, że pasek nadal zachowuje się jak przed zmianą.

- **Etap 16d — odklikany 08.08 poza dwoma punktami.** Zostają: „zasłonięty: Samochód" na liście trafionych obszarem oraz **„Rzuć"** zwykłą bronią. Pudło z odchyleniem, `Esc`, „Odskocz", „Zastosuj wszystkim" i regresja 16e — sprawdzone. ~~**Dlaczego oględziny się nie odbyły:** w kampanii nie ma jeszcze **przedmiotu** „granat" — dopisałem sam _typ_ broni (`weapon-type.grenade` w `data/private`), ale kupowalnego wpisu w kompendium nie ma, a jego utworzenie plus dopisanie wiersza na karcie Vexa to zmiana danych żywej kampanii w środku trwającej RUNDY 1; na to nie pytałem. Do sprawdzenia po założeniu granatu: (1) pomarańczowy kwadrat 5×5 pól chodzący za kursorem, z krzyżykiem na polu środkowym; (2) klik w podłoże ładujący kubek „Granat → wybrane pole"; (3) karta z listą trafionych i wierszami „zasłonięty ścianą" / „zasłonięty: Samochód"; (4) „Zastosuj wszystkim (N)" na karcie obrażeń i „Cofnij" działające na pojedynczy wiersz; (5) pudło — linia „odchylenie — kierunek 1k10 = … · odległość 1k10 = … − ZW …" i krater przesunięty o pole albo dwa; (6) przycisk „Odskocz" u figury z REF 8+; (7) „Rzuć" w `AttackLauncher` na zwykłej broni; (8) `Esc` chowający szablon; (9) **regresja 16e**: z granatem w ręku podgląd trasy ma zniknąć, a po schowaniu wrócić.~~

- **Etap 16c — strona MG odklikana 08.08.** Postawienie osłony przeciągnięciem, presety, gumka, dwustopniowy `Esc`, karta wyboru „Ostrzelaj osłonę / Strzelaj mimo osłony", obrażenia osłony z „Cofnij", wrak i to, że wrak **przestaje zasłaniać** — wszystko działa (szczegóły w pliku testów). **Zostało:** kosz **„usuń wszystkie osłony"**. Z gumki wyszedł **błąd #8**.

- **Etap 16f — formularze paska nieodklikane**: Ustabilizowanie, Pochwycenie i Wstrzymanie Akcji otwierają w pasku **te same** komponenty co zakładka „Walka" (`CombatForms.tsx`), ale przez pasek nie były klikane — sprawdzone tylko to, że sloty się pojawiają i mają skróty.

- **Etap 16e — odklikane częściowo (na koncie gracza), reszta czeka na mysz.** **Sprawdzone 31.07 na koncie Johnny:** klik w token → zaznaczenie (biały przerywany pierścień), podgląd trasy pod kursorem z licznikiem „15,2 m" i znacznikiem ✖, oraz odmowa poza turą (trasa przestaje się rysować). **Zostało do sprawdzenia:** (1) sam marsz po kliknięciu w podłoże i odsłanianie mgły w jego trakcie; (2) obejście rogu korytarza przez trasę; (3) klik za zasięgiem tury → ✖ na granicy budżetu i wygaszony ogon; (4) kursor „idź w tę stronę" nad czernią; (5) Esc / klik w trakcie marszu; (6) przerwanie marszu przez NPC wychodzącego zza rogu; (7) Shift+klik → żółty punkt załamania; (8) PPM w puste → odznaczenie; (9) **przeciąganie tokenu działa jak przed etapem** (najważniejszy test regresji — patrz `DRAG_CLICK_GRACE_MS`); (10) token 2×2 przy metrowych drzwiach. Punkty 1–8 wymagają tury dla postaci, którą się steruje — na scenie kampanii turę ma ukryty NPC, więc oględziny zrób na osobnej scenie albo po przekazaniu tury.

- **Kliknięcie w token było zepsute dla graczy od 18a — naprawione w 16e, ale zaległości oględzin z tego okresu warto powtórzyć.** Warstwy przykrywające przechwytywały hit-test (szczegóły w „Pułapki dev"), więc gracz na scenie z dynamiczną widocznością **nie mógł kliknąć ani przeciągnąć żadnego tokenu**. To prawdopodobnie realna przyczyna części pozycji zbiorczej „strona gracza" na górze sekcji — przy jej odhaczaniu sprawdź najpierw, czy rzecz w ogóle dawała się kliknąć.

- **70 broni markowych ma opisy po angielsku** (nie 35 — ta liczba brała się z komunikatu skryptu „35 już w pamięci podręcznej"). Angielskie opisy ma **wyłącznie** `weapons.json`; pozostałe 271 wpisów kompendium jest po polsku. **Skrypt był 21.08 pułapką i został naprawiony**: kwalifikował do tłumaczenia każdy wpis bez `descriptionOriginal`, czyli **341** — w tym 271 polskich, które model dostałby do „przetłumaczenia z angielskiego". Teraz `looks_english()` odsiewa je (`--check` mówi: 70 do zrobienia, 271 pominięto). Zostaje sam przebieg `tools/import/translate-descriptions.py` przy włączonym llama-serverze (`pwsh ai-gateway/scripts/start-gateway.ps1`, potem `uv run --with httpx python tools/import/translate-descriptions.py`). Bez GPU się nie da, więc czeka na sesję z gatewayem.
- **Etap 13 — UI kompendium odklikane tylko powierzchownie**: 30.07 (przy oględzinach 14b) potwierdzona sama zakładka „Kompendium" — chipy kategorii z licznikami (Broń 103, Pancerz 11, Sprzęt 5, Cyborgizacje 3, Rany krytyczne 22) i lista wpisów z obrażeniami i ceną. **Nadal nieodklikane:** karta przedmiotu z tabelą PT, edytor MG, dodanie przedmiotu na kartę postaci. Ścieżki serwerowe pokryte testami.
- **Etap 09 — zakładka „AI" u MG niezweryfikowana wizualnie** (sesja toczyła się na koncie gracza). Późniejsze etapy oglądały u MG inne zakładki, więc to prawdopodobnie martwa zaległość — sprawdź przy okazji.
- **Ślad ścieżki przy przeciąganiu nieobejrzany**: `left_click_drag` z CDP jest natychmiastowy, więc łamana z licznikiem metrów rysuje się i znika między klatkami. Do sprawdzenia ręcznie — myszą.
- **Etap 14d — została odmowa Uniku Ludzkiej tarczy**: karta testu spornego z „Broń się"
  u broniącego się gracza i odmowa ruchu Trzymanemu są **odklikane 10.08** (na czacie
  „Pochwycenie → Test P1 … Obrona Test P1: 5 → mimo wszystko udane" i „Odmowa: Pochwycony token
  nie może wykonać własnej Akcji Ruchu"). Zostaje `SHIELD_CANNOT_DODGE` („Ludzka tarcza nie może
  unikać ataków dystansowych") — wymaga **trzeciej figury na scenie**: ktoś musi strzelić do
  trzymającego, żeby tarcza w ogóle dostała przycisk „Unik". Na Strzelnicy są dwie figury.
- ~~**Osłona nie blokuje ruchu po stronie serwera**~~ — **naprawione 21.08** (sesja naprawcza), i szerzej, niż mówiła notatka: serwer nie sprawdzał **żadnej** geometrii ruchu, więc ściany też nie blokowały przeciągnięcia. `validateTokenMove` woła teraz `refuseWalkThroughSolid` (ściany + zamknięte okna + stojące osłony, `firstBlockedStep` w `shared/pathfinding.ts`), **także poza walką**; MG jest zwolniony, jak wszędzie w tym module. Odmowa nie nazywa przeszkody — gracz nie może mapować budynku, wchodząc w ściany. Testy: `covers.test.ts` (przez samochód, dookoła niego, MG bez blokady) i `walls.test.ts` (drzwi zamknięte vs otwarte). Stara treść wpisu; `validateTokenMove` dalej liczy sam dystans. Wraca razem z kolizjami ruchu (POMYSLY, 30.07).
- ~~**Etap 16b — statysta nie może aktywnie unikać**~~ — **naprawione 22.08** (sesja naprawcza).
  `attack:evade` czyta obrońcę z zapisanej karty ataku, a kartę postaci bierze **tylko wtedy, gdy
  cel ją ma**; figura z samym profilem bojowym rzuca tą samą syntezą (`sheetFromCombatProfile`),
  którą policzone było jej bierne PT — więc obie liczby nie mają jak się rozjechać. Przycisk
  dostaje MG albo właściciel żetonu, czyli ci, którym serwer i tak wysyła profil. Testy
  w `attacks.test.ts` (Unik statysty przepisuje kartę; gracz nie uniknie za cudzą figurę).
- **Rany warunkowe zostają prozą**: „Strzaskane palce −4 do Akcji **tą ręką**" i „Złamana szczęka −4 do Akcji **związanych z mówieniem**" nie mają flagi maszynowej, bo VTT nie wie, co jest w której dłoni ani która czynność jest mówieniem. MG stosuje je ręcznie — wróci to razem ze śledzeniem broni w dłoniach (POMYSLY, 30.07).
- **`data/private/rulebook/manual/tabela-ran-krytycznych.md` jest poza repo** — na czystej maszynie trzeba go dostarczyć albo wpisać tabelę głowy w edytorze.

### Pułapki dev (kosztowały czas więcej niż raz)

- **Efektu mapy NIE DA SIĘ złapać zrzutem ekranu, a spowolnienie `performance.now` nic nie
  daje** (ustalone 20.08 przy 27i, kosztowało pół godziny). Efekt trwa 300–800 ms, a runda
  narzędzia zrzutu to około półtorej sekundy — więc widać zawsze pustą mapę i pierwsza myśl
  („nie działa") jest fałszywa. `performance.now` nie spowalnia Pixi: `Ticker` v8 bierze czas
  ze **znacznika `requestAnimationFrame`**, nie z zegara. **Obejście:** opakuj `rAF` tak, żeby
  przeliczał znacznik (`cb(virt)` zamiast `cb(t)`), i ustaw współczynnik dopiero po pojawieniu
  się karty na czacie — wcześniej spowolniłbyś też animację kości. **Rozpoznanie, zanim
  zaczniesz szukać błędu w rysowaniu:** `graphics.getBounds()` w tym samym miejscu, w którym
  rysujesz — niepuste bounds w sensownych współrzędnych ekranu znaczą, że Pixi ma geometrię
  i problem jest wyłącznie w tym, kiedy patrzysz.

- **Klik w puste pole mapy przy zaznaczonej figurze to rozkaz marszu** — i tak właśnie 20.08
  Tony przeszedł pół Strzelnicy, bo zrzut ekranu miał inną skalę niż okno i kliknięcie „w żeton"
  minęło go o kilkadziesiąt pikseli. Przy automatyzacji celuj **zdarzeniami wskaźnika
  z policzonymi współrzędnymi CSS** (`canvas.dispatchEvent(new PointerEvent(...))`), nie
  współrzędnymi ze zrzutu — patrz wpis o wycinku okna niżej.

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

### Sesja 22.08 (druga tego dnia) — triaż zaległości i pięć pozycji z niego, poza etapami

MG kazał wypisać ~10 otwartych zaległości do uporządkowania (bez rzeczy czekających na lokalny
LLM, bez nieukończonych etapów), a potem wykonać **pozycje 1–5**.

**Porządki w dokumentacji** (odpowiedzi MG na trzy pytania z triażu):

- **Poziom sklepu Poligonu → 2 (Zawodowe).** Przestawione wprost w bazie (`Campaign.shopTier`),
  bo aplikacja nie działała — **do sprawdzenia przy pierwszym uruchomieniu**, czy przełącznik
  w „Kompendium" pokazuje 2. Kopia zapasowa bazy była robiona przed zapisem.
- **13 wpisów przeniesionych** z „Otwartych zaległości" do nowego
  `docs/etapy/decyzje-i-uproszczenia.md` — świadome czytania RAW i uproszczenia (promień 4 m,
  Skaner, zwiad wszerz, Demon bez kamer i drzwi, kamera bez stożka, Powłoka i Tarcza, parser
  tabel obronnych, dwie tabele Ścieżek, binarne decyzje Ról, lista odbiorców przelewu, kontrast
  marki). **To nie są zadania** i plik ma to w nagłówku; czytać na żądanie.
- **16 pozycji „strona gracza" scalonych w jedną** — checklista po etapach na górze sekcji
  zaległości. To była jedna sesja oględzin z drugiego konta, nie kilkanaście zadań.
- **Cztery wpisy skasowane jako nieaktualne** (sprawdzone w kodzie, nie na słowo): kostki
  kreatora z 25a i 25b (`plain: true` w `creation.ts`), jednobarwne 📰 z 24c (`newspaper.svg`)
  i „motyw dzienny kończy się na oknie karty" z 27a (27e dał globalne `[data-theme='day']`).
- Sekcja zaległości zeszła z 558 do ~455 wierszy.

**Pięć naprawionych pozycji** — szczegóły przy odpowiednich wpisach wyżej (wszystkie przekreślone):

1. **`NO_ROUTE` bota rozdzielone na trzy kody.** Przy okazji wyszło, że stary komunikat kłamał
   **częściej**, niż mówiła notatka: `planWalk` nigdy nie odmawia celu nie do osiągnięcia, więc
   „droga jest zablokowana" nie było prawdą praktycznie nigdy.
2. **Pułapka z wyzwalaczem `turn` wchodzi do Kolejki Inicjatywy sama.** Nowa kolumna
   `Combatant.zoneId` + migracja `20260822130000_stage26f_zone_in_queue`. Odpalenie zostaje
   klikiem MG — zmieniła się papierkowa robota, nie linia „nic nie rusza się samo".
3. **Specjalizacje umiejętności.** `skillSpecialties` na karcie i w drafcie kreatora; czyta się
   je **wyłącznie** przez `cpredSkillSpecialty` / `cpredSkillLabel`, bo Język odpowiada ze
   Ścieżki Życia. Umiejętności okazały się **cztery**, nie trzy — doszły Sztuki walki.
4. **Ręczny „Onieśmielony" wreszcie nakłada −2.** Nowe `token:feared` (MG-only) i lista
   „Boi się:" pod statusami w menu żetonu; `feared` w prywatnej części `TokenView`.
5. **Gniazda liczone per kończyna.** Model danych był gotowy od 27c (`bodySlot`) — ignorowała go
   sama arytmetyka. Wiersz rodziny został nagłówkiem, rozbicie jedzie pod spodem.

**Testy:** 1334 w `shared`, 759 na serwerze, 28 u klienta — wszystkie przechodzą. ESLint czysty,
Prettier na dotkniętych plikach przepuszczony. Serwer wstaje (`Server listening`, kompendium 391
wpisów, `/api/campaigns` bez sesji → 401).

**Czego ta sesja NIE ruszyła:** pozycji 6–9 z triażu (wyposażenie Krawędziarza i Moda, odmiana
w wyszukiwarce bazy wiedzy, czytelność figury na 0 PW i `down`, „raz na rundę w Somie") — MG
wskazał 1–5. Żadna z pięciu poprawek **nie była oglądana w przeglądarce**; wszystkie mają testy.

### Sesja 22.08 — sesja naprawcza (grupy A i B z przeglądu zaległości), poza etapami

**Zlecenie MG: wypisać ~10 otwartych zaległości do triażu, a potem wykonać grupy A i B** —
osiem pozycji: pięć potwierdzonych błędów w kodzie i trzy braki funkcjonalne. Z listy wypadło
wszystko wokół lokalnego LLM (MG wymienia model) i same niedokończone etapy (27g, 28).

**A1. Klik narzędziem mapy przeciekał do warstwy gry — i był szerszy, niż mówił błąd #8.**
`viewport.on('clicked')` w `MapRenderer.ts` wykluczał tylko ściany i lampy, a gest kończący
się `return`-em na `pointerdown` mają **także** osłony (16c), strefy (26f) i gniazda sieciowe
(26b). Przy okazji wyszło, że **cztery** miejsca pytają „czy narzędzie jest w ręku" czterema
listami pisanymi z ręki i **trzy z nich się rozjechały**: celownik (`aimTargetFor`), podgląd
trasy (`trackWalkHover`) i kursor mapy nie znały części narzędzi, więc z gumką osłon w ręku
mapa dalej rysowała trasę pod kursorem. Teraz są dwa gettery — `toolSpentThisClick` (narzędzia
rozliczone na `pointerdown`) i `mapToolArmed` (wszystkie, pędzle włącznie) — a `map-click.test.ts`
przewraca się, gdy nowe narzędzie nie trafi do żadnego strażnika.

**A2. Zmiana aktywnej kampanii nie ruszała podpiętych ekranów — bo nie było czym jej zmienić.**
Błąd #1 mówił „zmienia się tylko nazwa w nagłówku"; w kodzie nie istniał **żaden** przycisk
ani trasa aktywacji — kampanię dało się przełączyć wyłącznie tworząc nową (dokument testów
z 08.08 opisuje „Panel MG → Aktywuj", którego nie było). Doszło zdarzenie `campaign:activate`
(MG), które przenosi **każde** podpięte gniazdo: wyjście ze starych pokoi, wejście do nowych,
scena aktywna nowej kampanii i pełny `state:sync` — czyli te same trzy kroki, które wykonuje
świeże gniazdo. Klient dostaje `campaign:switch` i odświeża nazwę w pasku oraz wskaźniki
(zaznaczenie, broń w ręku). Gracz spoza nowej kampanii dostaje `null`, nie cudzy stół.

**A3. Statysta dostawał na czacie surowe id rany — a to samo robiła karta wpisu w kompendium.**
`describeAmmoFailure` miało fallback na `failure.injuries`/`failure.statuses`, czyli na id
z pliku danych, i odzywał się wszędzie, gdzie wołający zapomniał podać nazw: przy figurze bez
karty (rana nie jest nigdzie zapisywana, więc nazwy nie było skąd wziąć) **i** w karcie wpisu
amunicji w kompendium, która nazw nie podawała nigdy. Fallback zniknął, `labels` jest teraz
parametrem **wymaganym** (TypeScript pilnuje wołających), a nazwy ran wyciąga wspólny
`criticalInjuryNames` w `shared`. Test w `shared` pilnuje, że w zdaniu nie ma jak paść id.

**A4. Dymek celowania nie wiedział, co jest w komorze.** `planCpredAttack` przyjmuje profil
naboju od 16g i serwer mu go podaje — klient nie. Skutek: ze śrutem dymek wyceniał strzał
z **tabeli kul** („Przedział 7–12 m · PT 15"), klik ładował kubek, a odmowa „poza zasięgiem"
przychodziła dopiero po rzucie. Teraz podgląd czyta nabój tą samą drogą co serwer, więc za
stożkiem odmawia od razu, a w stożku pokazuje stałe PT. `aim-preview.test.ts` chodzi po
prawdziwym `planAttackPreview` z podstawionymi sklepami.

**A5. Dwa drobiazgi.** (1) Chip naboju nie odświeżał się przy broni bez magazynka, bo
`hudSignature` — to, po czym pasek akcji poznaje, że jest co przerysować — nie widziała
`ammoLabel` ani `coneRangeM`; strzelba maskowała błąd, bo przy przeładowaniu zmieniał się
licznik magazynka. (2) Etykieta odchylenia granatu pisała „5 − ZW 7 = 2 m"; `CpredScatter`
niesie teraz `clamped`, a `describeScatter` mówi „→ najmniej 2 m (ładunek zawsze schodzi
o pole)" i **sam** dokleja wynik, więc limit nie ma jak zniknąć u wołającego.

**B6. MG może nadać ranę krytyczną.** Do tej pory rana wchodziła wyłącznie z rzutu z dwiema
szóstkami (1/36) albo z nietrafionego testu amunicji z 16h, a karta postaci potrafiła je tylko
usuwać — „spadasz z drabiny i łamiesz rękę" nie miało jak się wydarzyć, choć RAW na to pozwala.
Nowe `character:injury` (MG) zapisuje ranę **tą samą** funkcją co rzut
(`applyForcedFailureToSheet`), więc niesie karę do RUCH-u, dopłatę do Testu Przeżywalności
i flagi tur z 14e; karta na czacie jest zwykłą kartą obrażeń, więc „Cofnij" działa bez jednej
nowej linii. W karcie postaci, pod listą ran, MG ma listę wyboru + „Nadaj". **To odblokowuje
trzy stare zaległości oględzin** (odmowa Akcji przy Urazie kręgosłupa z 14e, wiersz rany
w panelu 27b, karta odmowy u gracza).

**B7. Statysta może aktywnie unikać.** `attack:evade` wymagało karty postaci, więc figura
z samym profilem bojowym (Zbir z Poligonu) nigdy nie dostawała przycisku „Unik", choć jej PT
obrony liczy się z tego profilu od 16b. Rzut idzie teraz tą samą syntezą
(`sheetFromCombatProfile`), którą policzone było bierne PT, więc obie liczby nie mają jak się
rozjechać; prawo do kliknięcia ma MG albo właściciel żetonu — dokładnie ci, którym serwer
i tak wysyła profil (`seesPrivate`).

**B8. Nikt nie sprzątał `uploads/`.** Nowy `uploads-gc.ts` zbiera sieroty z czterech katalogów
naraz i chodzi w tle przy starcie serwera. Zasada jest ostrożna: plik ginie **tylko** wtedy, gdy
żadna kolumna go nie wymienia i jest starszy niż **godzina** — bo portret w kreatorze powstaje
zanim istnieje postać. Odnośniki zbierane są dwiema drogami (kolumny z adresem + wyrażenie
regularne po kolumnach JSON: szkic kreatora, ładunek czatu, dane karty), i **ta lista jest
w jednym miejscu** — nowa kolumna z adresem, która na nią nie trafi, znaczy skasowany plik.
Przebieg na sucho na żywych danych: 10 plików, 0 sierot.

**Testy: 2099 przechodzi** (shared 1318, serwer 753, klient 28). Nowe: `map-click.test.ts`,
`aim-preview.test.ts`, `hud-signature.test.ts` (klient), `campaign-switch.test.ts`,
`uploads-gc.test.ts` + wpisy w `damage.test.ts`, `attacks.test.ts`, `ammo-effects.test.ts`
(serwer), `ammo.test.ts`, `areas.test.ts` (shared). Cztery poprawki sprawdzone **celowym
cofnięciem** (A1, A3, A4, plus zbieracz na sucho). ESLint i Prettier czyste, serwer wstaje,
`vite build` przechodzi.

**Czego ta sesja NIE ruszyła:** grupy C z przeglądu — dług oględzin („strona gracza"
w kilkunastu etapach), czytelność `down` na mapie, odmiana w wyszukiwarce dziennika i kontrast
marki. To są pozycje 9–12 listy, MG zostawił je świadomie.

### Sesja 21.08 (trzecia tego dnia) — sesja naprawcza, poza etapami

Pięć błędów, z których cztery leżały o krok dalej, niż mówiły notatki: serwer nie sprawdzał
**żadnej** geometrii ruchu (nie tylko osłon), bufor debounce karty gubił edycje mimo strażników
`pendingSaves`, `ignoreCover` jechało w payloadzie i nikt go nie ustawiał, a „Cofnij" nie
przywracało strachu, bo `token:update` nigdy nie pisze `statusData`. Piąty to naprawiony skrypt
tłumaczenia opisów broni. Pełna notatka: `archiwum/dziennik-sesji.md`.

### Sesja 21.08 (druga tego dnia) — etap 27f (szlif UX: pomoc, tooltipy, stany, okna)

Okno `?` czyta jedną tabelę skrótów (`MAP_TOOL_KEYS`), a pływające okna — jeden hook
(`window-placement.ts`, pamięć w `localStorage` per okno i per postać). Umowa o przyciskach
została odwrócona (`button` neutralny, `.primary-button` czerwony), co zamknęło pułapkę
„białe na kremowym"; doszły `theme.test.ts` i `a11y.test.ts`, oba sprawdzone celowym psuciem.
Pełna notatka: `archiwum/dziennik-sesji.md`.

### Sesja 21.08 — etap 27j (żetony i czytelny ruch)

Kierunek patrzenia stał się stanem serwera (`Token.facing`, publiczny w `TokenView`): ustawia go
automat z ruchu i strzału **plus** ręczna gałka na pierścieniu zaznaczenia, a ręczny kąt trzyma
się do następnego ruchu. Stan figury (`down`, `dead`) liczy się z naklejek w `shared`, nie w CSS.
Pełna notatka: `archiwum/dziennik-sesji.md`.

### Sesja 20.08 (trzecia tego dnia) — etap 27i (mapa: efekty walki)

Efekt walki dostał **własny kanał** (`fx:play` poza `state:sync`, więc nie odtwarza się po
resyncu) i jest **przycinany na serwerze per gniazdo**: kto nie widzi lufy, nie dostaje ani
jej, ani dźwięku. Etap zwężony na starcie — Token 2.0 pojechał do 27j. Pełna notatka:
`archiwum/dziennik-sesji.md`.

### Sesja 20.08 (druga tego dnia) — etap 27h (panel postaci: HUD, który wygląda jak gra)

Lewy panel przestał być arkuszem kalkulacyjnym: portret, kafle akcji z sylwetkami i jedna broń
= jeden kafel z szufladą trybów ognia. Obrazek kafla i waga naklejki liczą się w `shared`
(`cpredWeaponIcon`, `cpredStatusSeverity`), nie w CSS — podmiana sylwetki nigdy nie jest zmianą
w regułach. Ta sesja odkryła też dziurę, z której wyrósł 27i: walka nie miała na mapie **żadnego**
efektu. Pełna notatka: `archiwum/dziennik-sesji.md`.

### Sesja 20.08 — etap 27e (motyw dzień/noc dla całej aplikacji)

Przełącznik ☀/☾ przestał ubierać samą kartę i ubiera **całe VTT**: kolor mieszka wyłącznie
w `packages/client/src/theme.css`, a pilnuje tego pierwszy test klienta (`theme.test.ts`),
który przewraca się na literale koloru w `styles.css`, na tokenie bez odbiorcy i na tokenie
chromu bez pary dziennej. **Mapa, okno Sieci i papier gazety zostają przy swoim świetle**
(decyzja MG) — są malowane na płótnie i w dzień przestałyby być czytelne. Pełna notatka:
`archiwum/dziennik-sesji.md`.

### Sesja 19.08 — etap 27d (kości 3D: skórki, dorzut, ustawienia)

Pięć skórek kości, z których **skórka jedzie z rzutem** (`User.diceSkin`, stemplowana na wyjściu
w `toChatMessageView`), dorzut krytyka jako druga fala po 550 ms i nowe pływające okno
„⚙ Ustawienia", do którego wyprowadziły się ☀/☾ i ⌨. Przy okazji etap 27 został rozdzielony do
końca na 27d–27g. Pełna notatka: `archiwum/dziennik-sesji.md`.

### Sesja 16.08 (druga tego dnia) — etap 26f (samodzielne systemy obronne i broniona strefa)

Rozdział 11 podręcznika domknięty: strefa broniona to **trzeci prostokąt mapy** (stąd wspólny
`shared/src/rects.ts`), który sam odpala się na wejście i sam rzuca Percepcję — raz na postać,
z 4 m. Efekt osiemnastu systemów przestał być prozą (`CpredNetDefenseEffects`, parser wyłuskał
13 z 18), a kara do RUCH-u wymusiła nowy status **„Spowolniony"**. Pełna notatka:
`archiwum/dziennik-sesji.md`.

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
