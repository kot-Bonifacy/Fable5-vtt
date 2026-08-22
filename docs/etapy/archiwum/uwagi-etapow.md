# Uwagi do etapów (kolumna „Uwagi" z tabeli postępu)

Wyprowadzone z `POSTEP.md` 22.08.2026: tabela w pliku postępu zachowała numer, nazwę, status
i datę, a jednozdaniowe „co z tego etapu warto pamiętać" wylądowało tutaj. Czytaj na żądanie —
pełne notatki sesji są w `dziennik-sesji.md`.

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
