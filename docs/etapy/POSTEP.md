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
| 25b | Kreator: Ścieżka Życia i wyposażenie startowe | ⬜     |                 | tabele lifepath, zakupy startowe, portret, wróg → szkic bota                                    |
| 26  | Netrunning                                    | ⬜     |                 | możliwy podział na 2 sesje                                                                      |
| 27a | Karta jak oficjalna: strona pierwsza          | ✅     | 2026-08-13      | wydzielony z 27 dnia 13.08 (27a/27b/27c); motyw dzień/noc na razie tylko dla karty              |
| 27b | Karta: broń, pancerz, ekwipunek               | ✅     | 2026-08-13      | zakładka „Walka" zniknęła; pancerz = 3 wiersze wydruku + reszta; trzy nowe pola prozy           |
| 27c | Karta: Ścieżka Życia i cyborgizacje           | ⬜     |                 | sensownie po etapie 25 — kreator lifepath wypełnia dokładnie te pola                            |
| 27  | Kości 3D i szlif UI                           | ⬜     |                 | po wydzieleniu 27a–c zostaje: skórki kości, ustawienia, motyw dla reszty UI, wydajność          |
| 28  | Wdrożenie na VPS                              | ⬜     |                 |                                                                                                 |

## Od czego zacząć

Ostatnio zamknięte: **25a** (kreator postaci — Rola, Cechy, Umiejętności; szkic w bazie,
losowania na serwerze). Przy okazji naprawiony błąd, przez który karta w przeglądarce znała
tylko 42 z 66 umiejętności — patrz notatka sesji niżej.

**Następne etapy do wyboru:** **25b** (Ścieżka Życia, wyposażenie startowe, portret, wróg →
szkic bota — domyka kreator i wypełnia pola, które rysuje 27c), **27c** (Ścieżka Życia
i sylwetka cyborgizacji na karcie), **26** (netrunning, możliwy podział na dwie sesje).
Potem zostają **27** (kości 3D, motyw dla reszty UI, wydajność) i **28** (VPS).

**09.08 głos wypadł z projektu** (sesja bez etapu, decyzja MG): etapy **12, 21 i 22** wycofane, kod TTS usunięty z repo. Szczegóły w `archiwum/dziennik-sesji.md` i w `archiwum/wycofane/README.md`.

### Otwarte zaległości (przechodzą między etapami)

- **Etap 25a — cztery ścieżki nieodklikane.** (1) **Odmowa serwera przy przepełnionej puli** —
  „Utwórz postać" jest wyszarzone, więc do `CREATION_INCOMPLETE` w przeglądarce się nie dojdzie;
  pokryte testem serwera. (2) **Degradacja bez `creation.json`** — kreator ma wtedy powiedzieć
  „Brak danych tworzenia postaci…" zamiast pustego okna (`CREATION_DATA_MISSING`); w repo jest
  próbka publiczna, więc ten stan wymagałby skasowania obu plików. (3) **Wybór właściciela przez
  MG** — pole „Właściciel" jest w podsumowaniu, ale przy oględzinach zostało na „NPC (MG)";
  ścieżka z `ownerId` pokryta testem. (4) **Rangi Postaci inne niż „początkująca"** — selektor
  pokazuje pięć pozycji (50–80 pkt), klikana była tylko domyślna 62.

- **Etap 25a — kostki na karcie rozkładu świecą jak krytyki.** Rzut `10k10` rysuje dziesiątki
  na zielono, a jedynki na czerwono, bo tak czat maluje **każdą** kostkę k10. Tu 10 i 1 to
  numery wierszy szablonu, nie krytyk ani fumble (`roll.critical` jest puste i żadna plakietka
  się nie pojawia). Kosmetyka; do rozważenia razem ze szlifem kubka w etapie 27.

- **Etap 25a — nazwa umiejętności wielokrotnej nie ma gdzie zamieszkać.** „Nauka (wybierz 1)",
  „Gra na instrumencie (wybierz 1)", „Język" i „Wiedza lokalna" to w podręczniku umiejętności ze
  specjalizacją, a `CpredCharacterData.skills` trzyma samo `skillId → poziom`. Kreator zapisuje
  więc „Nauka 4" bez dziedziny. Naturalne miejsce na poprawkę to **25b**, gdzie Ścieżka Życia
  i tak nazywa język kultury pochodzenia; wpis w `POMYSLY.md`.

- **Etap 27b — rana krytyczna w nowym panelu nieobejrzana.** „Krytyczne Urazy" w kolumnie
  tożsamości widziane wyłącznie w stanie pustym („bez ran krytycznych"), bo — jak przy 14e —
  **MG nie ma czym nadać rany ręcznie**; wchodzi tylko z rzutu obrażeń z dwiema szóstkami (1/36)
  albo z nietrafionego testu amunicji z 16h. Sam JSX wiersza (nazwa, `2k6 = N`, chip „na minutę",
  „+N do Testu Przeżywalności", efekt, kosz) jest przeniesiony bez zmian logiki — zmieniły się
  klasy. Wpis o przycisku MG „nadaj ranę krytyczną" jest w `POMYSLY.md` od 14e.

- **Etap 27a — motyw dzienny kończy się na oknie karty.** To świadome i zapisane w zakresie:
  `data-theme='day'` przemalowuje `.sheet-window` (od 27b także pas broni i pancerza oraz stronę
  drugą; sekcja Cyborgizacji dalej jedzie na przesłoniętych `--bg`, `--text`, `--border`
  **wewnątrz** okna i dostanie własną skórę w 27c), ale mapa, panele boczne, czat i **okno kubka
  z rzutem** zostają ciemne. Reszta UI dochodzi w etapie 27.

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

### Sesja 14.08 — etap 25a (kreator postaci: rola, cechy, umiejętności)

**Postać da się zrobić od zera w oknie kreatora, a nie tylko wpisać ręcznie w pustą kartę.**
Cztery kroki z dowolnym cofaniem — Rola → Cechy → Umiejętności → Podsumowanie — kończą się
kartą z etapu 07, która otwiera się sama po utworzeniu.

**Trzy rozstrzygnięcia MG przed kodem.** (1) **Podział etapu 25 na 25a/25b** — jeden worek
niósł pipeline danych, sześciokrokowy kreator, szkic w bazie, zakupy startowe i wroga
z lifepath przerabianego na bota; to zakres dwóch sesji, tak jak przy 14→14e i 16→16h.
(2) **Dwie metody, nie trzy**: Krawędziarz (1k10 na Cechę z szablonu Roli) i Kompletny Pakiet
(pula 62 punktów). **Ulicznik odpada** — to dziesięć gotowych postaci, a nie procedura.
(3) **Kreator w pływającym oknie** (`sheet-window`), nie w panelu bocznym ani na pełnym ekranie.

**Znaleziony i naprawiony błąd, którego nie widziała żadna wcześniejsza sesja: karta postaci
w przeglądarce znała tylko 42 z 66 umiejętności.** Klient pobierał `/public/cpred/skills.json`
ze statycznej trasy — czyli **próbkę Easy Mode z repo** — podczas gdy serwer ładuje pełną listę
z `data/private/cpred/skills.json` (plik prywatny zastępuje publiczny). Skutek: 24 umiejętności
istniały wyłącznie po stronie serwera i **nie dało się ich ustawić na żadnej karcie** —
Cyberinżynieria, Podstawowe naprawy, Nauka, Język, Atrakcyjność, Handel, Naprawa broni, Sztuki
walki, Broń ciężka, Łucznictwo, Materiały wybuchowe, Sztuka przetrwania i jeszcze dwanaście.
Blokowało to 25a wprost (listy umiejętności Ról odwołują się do ośmiu z tych 24), więc doszła
trasa **`GET /api/cpred/data`** za `requireAuth`, oddająca **efektywny** rejestr — ten sam,
którym serwer waliduje karty. Wzorem była trasa `/api/cpred/covers` z 16c, założona dokładnie
z tego powodu. Po poprawce karta pokazuje pełne 66 pozycji (sprawdzone w przeglądarce).

**Architektura — cztery rzeczy niesie etap.** Pierwsza: **Cechy Krawędziarza pisze wyłącznie
serwer.** `creation:roll` rzuca dziesięć 1k10 tym samym silnikiem co każdy inny rzut, odczytuje
wartości z kolumny szablonu Roli i zapisuje je w szkicu; `creation:patch` niosący `stats` przy
tej metodzie jest **odrzucany** (`INVALID_DATA`). Kompletny Pakiet kupuje Cechy, więc tam łatka
jest jedyną drogą, a pula sprawdza się na końcu. Druga: **szkic to własna tabela**
(`CharacterDraft`, jeden wiersz na użytkownika i kampanię), a nie `Character` z flagą —
niedokończona postać nie może pojawić się na liście, w inicjatywie ani na tokenie. Stan siedzi
w jednej kolumnie JSON jak przy `BotProfile`, bo kreator dostanie w 25b krok Ścieżki Życia.
Trzecia: **zmiana Roli albo metody kasuje to, co unieważnia** — rozkład wylosowany z szablonu
Solo nic nie znaczy na szablonie Netrunnera, a umiejętność kupiona z listy jednej Roli nie
figuruje na liście drugiej. Czwarta: **jedna karta rzutu zamiast dziesięciu.** Rozbicie nazywa
każdą Cechę („INT · rzut 9 +7"), a **suma na karcie to wartość rozkładu** (61 przy oględzinach)
— jedyna liczba, którą stół realnie porównuje, bo Kompletny Pakiet ma do wydania 62.

**Dane: `tools/import/parse-creation.py` → `data/private/cpred/creation.json`.** Dziesięć
szablonów Cech (10 rzutów × 10 Cech), listy 20 umiejętności Ról, 13 umiejętności podstawowych,
pule (62 / 86) i limity — wszystko z rozdziałów „Dusza i nowa maszyna" i „Wyposażony na
Przyszłość". Próbka **własnego autorstwa** w `data/public/cpred/creation.json`, żeby świeży klon
miał działający kreator. Dwie tabele wymagały czegoś więcej niż regexa: **szablony Cech** czyta
się ze strumienia cyfr (zrzut skleja numery rzutów z wartościami), a **listy umiejętności Ról**
to jeden ciąg nazw bez separatorów. Te drugie odtwarzają się z dwóch niezmienników, których
pilnuje książka — **kolumna jest posortowana alfabetycznie** i **każda Rola ma dokładnie 20
pozycji** — a jedyną komórkę, którą zrzut zgubił (Solo, drugi wiersz), podaje przykład drukowany
na tej samej stronie; **pierwszy wiersz tabeli Ulicznika** (ta sama zawartość, s. 86) rozstrzyga,
które z dwóch pasujących ułożeń jest prawdziwe. Skrypt mówi o tym wprost w ostrzeżeniu — jeśli
przestanie, znaczy, że zrzut się zmienił.

**Naprawione migotanie `ammo.test.ts` — i notatka z 08.08 wskazywała złą przyczynę.** To nie
był limit czasu, tylko dwa źródła losowości w teście „an armour-piercing round takes two points
of SP": (1) ochroniarz stoi w stożku śrutu przez cały plik, więc docierał do tego testu
z pancerzem zdartym przez wcześniejsze przypadki — przy OB 1 nabój zbiera to, co zostało (nie
dwa), a przy 0 nie ablatuje nic i karta nie ma linii pancerza (to jest owo „expected undefined
to be defined"); (2) pancerz zużywa się tylko wtedy, gdy obrażenia przez niego **przejdą**,
a 2k6 przeciw OB 4 nie przechodzi raz na dwanaście rzutów. Test przywraca teraz OB przed
pomiarem i dodaje modyfikator obrażeń, którego pistolet nie zejdzie poniżej. **12 przebiegów
pod rząd bez porażki** (wcześniej 3 na 20).

**Drugi błąd, znaleziony przy oględzinach: „Utwórz postać" wymagało dwóch kliknięć.** Imię
zapisywało się dopiero na `blur`, a przycisk jest wyszarzony, dopóki imię nie dotrze do serwera
— więc kliknięcie, które zdejmowało ognisko z pola, trafiało w przycisk jeszcze nieaktywny.
Imię idzie teraz do serwera z każdym znakiem, tak jak zapisuje się karta; surowa wartość
(spacja w dwuwyrazowej ksywie musi przeżyć — patrz błąd z 13.08), a przycięcie robi serwer.

**Zweryfikowane:** 1010 testów w `shared` (26 nowych w `creation.test.ts`), 603 na serwerze
(14 nowych w `creation.test.ts` na żywych gniazdach), `tsc --noEmit` czysty w trzech pakietach,
lint, Prettier i `pnpm build` bez uwag. Migracja: `20260814054327_stage25a_character_draft`
(jedna tabela, zero zmian w istniejących).

**Odklikane po OBU stronach stołu** (MG na `localhost:5173`, gracz avatar9 na `[::1]:5173`),
na postaciach testowych **„Test 25a Ostrze" (Solo, NPC)** i **„Test 25a Gracz" (Fixer, avatar9)**
— **obu usuniętych po oględzinach**, lista wróciła do siedmiu. Potwierdzone **u MG**: przycisk
„🧬 Kreator postaci…" nad formularzem jednolinijkowym, okno w skórze karty, dziesięć Ról
z nazwą Zdolności Specjalnej i liczbą umiejętności, **rzut Cech** (INT 7 z rzutu 9, REF 7 z rzutu
1, … — wszystkie dziesięć zgodne z szablonem Solo z podręcznika), pochodne liczone na żywo
(PW 45, Poważnie ranny 23, Przeżywalność 7, Człowieczeństwo 60), **karta na czacie** „Rozkład
Cech — Solo · Krawędziarz (Na skróty) · 10k10" z sumą **61** i rozbiciem na dziesięć wierszy,
krok umiejętności z chipem **×2** przy Ogniu ciągłym (poziom 1 = 2 pkt) i **Językiem za 0 pkt**,
licznik „80 z 86", podsumowanie z listą braków i **wyszarzonym „Utwórz postać"** do czasu
wpisania imienia, a po utworzeniu **karta otwiera się sama** — w nowym układzie z 27a/27b,
ze Zdolnością Specjalną „Zmysł Walki 4" i **pełną listą 66 umiejętności**. Potwierdzone **przy
Kompletnym Pakiecie**: wybór Rangi Postaci (5 pozycji, 50–80 pkt), pola liczbowe zamiast rzutu,
licznik **czerwienieje przy 70 z 62**, a „🎲 Rzuć Cechy" w ogóle się nie pokazuje. **Szkic
przeżył pełne przeładowanie strony** (metoda, krok i rozkład 60 z 62 wróciły z bazy).
Potwierdzone **u gracza**: własny, niezależny szkic (krok 1, bez pola „Właściciel"), rzut Cech
działa tak samo, a utworzona postać ma **właściciela avatar9** i pojawia się **na żywo na liście
MG**. Konsola czysta po obu stronach. Scena, walka („PRZED WALKĄ"), tokeny i pozostałe postacie
**nietknięte**; na czacie zostały **dwie karty rozkładu Cech**.

### Sesja 13.08 — porządki: pięć zaległości zdjętych z listy (bez etapu)

**Cel: nie nowa funkcja, tylko skrócenie listy „Otwarte zaległości".** Zdjęte pięć pozycji:
**27a strona gracza**, **27b strona gracza**, **27b trzy ścieżki**, **27a cztery drobiazgi**
i **`tsc` na `screamsheets.test.ts`**.

**Znaleziony i naprawiony błąd, którego nie widziała żadna wcześniejsza sesja: w żaden wiersz
karty nie dało się wpisać wielowyrazowej nazwy.** Objaw wyglądał na usterkę automatyzacji —
„Tarcza balistyczna" lądowało w polu jako „Tarczabalistyczna". Przyczyna była w kodzie:
`validateRow` w `shared/systems/cpred/character.ts` robiło `name.trim()`, a karta zapisuje się
**po każdym znaku**, więc spacja na końcu znikała, zanim zdążyła wejść następna litera. Spacja
w środku wyrazu przeżywała — i to właśnie ona rozstrzygnęła diagnozę (`AB|CD` + spacja = `AB CD`,
`ABCD` + spacja = `ABCD`). Dotyczyło **wszystkich** wierszy karty (broń, pancerz, wyposażenie),
bo wszystkie idą przez `CpredItemRow`; nie było widać wcześniej, bo nazwy z kompendium wpisuje
kod, nie palce. `trim()` zdjęty — `name` zachowuje się teraz tak jak `notes` i cała reszta prozy,
która idzie przez `validateText` bez przycinania. Test regresyjny w `character.test.ts`. Zmiana
jest bezpieczna, bo wiersze dopasowuje się po `id` i `compendiumId`, nigdy po nazwie.

**`screamsheets.test.ts` przechodzi `tsc --noEmit`.** Dziewięć `ack.data` bez zawężenia po
`ack.ok` zastąpił helper `data<T>(ack, what)` — ten sam, którego używa kilkanaście innych plików
testowych serwera. 12 testów pliku bez zmian.

**Odklikane po obu stronach stołu** (MG na `localhost:5173`, gracz avatar9 na `[::1]:5173`,
obie sesje naraz w jednym oknie Chrome) na postaci testowej **„Test 27x"** — **zostawionej
w kampanii jako atrapa**, bo ma już zbudowane dokładnie te układy, których te ścieżki wymagają.

- **27b, trzy ścieżki.** (1) **Dwie noszone sztuki w jednej lokacji**: „Kevlar ciężki" OB 11
  został w wierszu KORPUS, a słabsza „Kamizelka lekka" OB 7 zeszła do „Reszty pancerza (1)"
  z napisem **„słabsza"** zamiast przycisku „Załóż". (2) **Wiersz „Tarcza"** wypełniony po raz
  pierwszy („Tarcza balistyczna", `11 z 11`) — wcześniej widziany wyłącznie pusty. (3)
  **Ekwipunek z wierszami**: „+ Wyposażenie" ×2, edycja ilości (1 → 4) i kosz kasujący wiersz.
- **27a, cztery drobiazgi.** (1) **Wgrywanie portretu** — plik wszedł, ramka go pokazuje,
  miniatura doklejała się też do belki okna. (2) **Pole „z" przy EMP** — po zbiciu
  Człowieczeństwa 50 → 25 kostka EMP pokazała `5 z 2`, a bazy umiejętności EMP-owych
  (Konwersacja, Odczytywanie emocji) zjechały 5 → 2 razem z nim. (3) **Czerwone paski
  `.cp-alert`** w komplecie: „Poważnie ranny · −2" (przygaszony) przy PW 10, „Śmiertelnie
  ranny · −4" z przyciskiem **„Test Przeżywalności"** przy PW 0 i „Na granicy" (cyberpsychoza)
  przy EMP 2. Przy okazji, bez szukania, potwierdził się **chip cyberpsychozy na liście
  postaci** z zaległości 23a — „EMP 2 · Na granicy" świeci u gracza przy nazwisku.
- **27a i 27b, strona gracza.** Karta własnej postaci otwiera się u gracza w nowym układzie
  (sprawdzone na „Test 27x" **i** na żywej „avatar9"), pas „Broń i pancerz" rysuje się
  w całości, **„+ Broń" i „+ Pancerz" działają**, a dopisany wiersz pojawił się **na żywo
  w otwartej karcie MG** — i tak samo zniknął po skasowaniu koszem z konta gracza. **„Atak"**
  z wiersza broni uzbraja mapę u gracza tak samo jak u MG (pasek „avatar9 celuje: »Arasaka
  Minami 10« — kliknij cel na mapie", `Esc` rozbraja). **Plakietka „Gotówka" u gracza to sam
  napis** `0 ed` z przyciskiem „Kasa…" — pola **„korekta" nie ma**, w odróżnieniu od MG.
  Przełącznik **☀ dzień / ☾ noc** działa też na drugim hoście. Konsola czysta po obu stronach.

**Czego NIE sprawdzono, choć leżało blisko:** że serwer **odmawia** łatki na pola zastrzeżone
dla MG — sprawdzone jest tylko to, że gracz **nie dostaje tych pól w UI** (korekta salda).
Odmowa na poziomie gniazda zostaje pokryta testami z 23b.

**Zweryfikowane:** 958 testów w `shared` (1 nowy), 589 na serwerze, `tsc --noEmit` czysty
w `shared`, `client` i `server`. Pierwszy przebieg serwera pękł na `ammo.test.ts` — plik
przeszedł osobno (19/19) i w powtórzonym pełnym przebiegu (589/589); to znane migotanie
opisane w „Pułapkach dev", nie regresja.

## Skróty wcześniejszych sesji

Uzupełniają kolumnę „Uwagi" w tabeli, nie powtarzają jej. Uzasadnienia decyzji, listy niezweryfikowanego i szczegóły migracji — `archiwum/dziennik-sesji.md`.

- **27b (13.08)** — strona pierwsza karty ma komplet z wydruku, a zakładka „Walka" **zniknęła**:
  broń, pancerz i rany krytyczne wróciły tam, gdzie drukuje je arkusz. Trzy wiersze pancerza
  pokazują tę sztukę, którą wybiera `effectiveArmor` — ta sama funkcja, którą czyta silnik
  obrażeń — więc karta i karta obrażeń nie mogą powiedzieć dwóch różnych rzeczy. Przy okazji
  naprawione zapytanie kontenerowe z 27a, które nigdy nie składało strony w jedną kolumnę.
  Pełna notatka w archiwum.

- **27a (13.08)** — karta odtwarza styl oficjalnego arkusza **własnym CSS-em, bez jednego bajtu
  z PDF-a**; portret i „Notatki" wróciły z „Biografii" na stronę pierwszą, bo tam drukuje je
  wydruk. Przy okazji wyszło, że `CPRED_SKILL_GROUPS` sortowało kategorie po **angielskich**
  identyfikatorach, choć komentarz obiecywał kolejność z podręcznika — karta chce alfabetu
  **polskiego**. Pełna notatka w archiwum.

- **24c (13.08)** — screamsheet to **`kind` na handoucie z 24a, nie drugi byt**: udostępnianie,
  kosz, okno i wiersz na czacie nie mają dla niego ani jednej gałęzi, a migracja dokłada cztery
  kolumny i zero tabel. Generator **niczego nie zapisuje** — artykuł ląduje w formularzu MG
  i czeka na „Zapisz", a temperatura 0,9 jest jedynym miejscem w projekcie, gdzie zmyślanie
  modelu jest produktem. Pełna notatka w archiwum.

- **10–11.08 (sesja bez etapu)** — dwa konta naraz w jednym oknie Chrome zamknęły stronę gracza
  dla **14b, 14c, 16f, 20a, 20b, 23a, 23b, 23c i 24a**. Trzy rzeczy zostały i żadna z powodu
  automatyzacji: rana krytyczna (nie ma jej jak nadać), Ludzka tarcza (trzecia figura), karta
  przelewu u odbiorcy (trzeci host). Pełna notatka w archiwum.

- **24b (09.08)** — uprawnienie gracza do wpisu kroniki **nie jest trzecim szczeblem
  `visibility`**: „bot to pamięta" i „drużyna może o tym wiedzieć" to dwa pytania, więc
  `sharedWithPlayers` jest osobną kolumną, a odcisk indeksu jej nie obejmuje — odsłonięcie
  wpisu nie może oznaczać go jako „⟳ nieaktualny". Kanał gracza to **osobny kształt**
  (`JournalPlayerEntry`), którego pól MG nie da się zapomnieć wyciąć, a wyszukiwarka liczy się
  u klienta, żeby martwy gateway nie zabierał kroniki. Pełna notatka w archiwum.

- **24a (09.08)** — markdown handoutu zwraca **drzewo bloków, nie HTML**, więc na drodze „treść MG
  → ekran gracza" nie stoi ani `dangerouslySetInnerHTML`, ani sanitizer do pilnowania; w 24c, gdzie
  treść pisze model, będzie to jedyna bariera przed wstrzykniętym znacznikiem. Udostępnienie jest
  **zdarzeniem, nie stanem**: `handout:share` dostaje pełną listę i sam liczy różnicę, żeby dopisanie
  trzeciego gracza nie wyskoczyło oknem dwóm pierwszym. Pełna notatka w archiwum.

- **23c (09.08)** — lista wyczynów **jest** wartością Reputacji: RAW zastępuje ją tylko wyższą,
  więc osobne pole liczbowe obok byłoby drugim, kłócącym się źródłem prawdy. Kara −2 za przegraną
  Konfrontację to jedyny modyfikator w projekcie zależny od tego, **kogo** się atakuje, i dlatego
  dokleja się w miejscach, które znają cel, zamiast wejść do `sheetSituationModifiers`. Remis jest
  tu wynikiem — jedyny raz w projekcie. Pełna notatka w archiwum.

- **23b (09.08)** — saldo pisze serwer albo nikt: wszystkie ścieżki idą przez jedno
  `applyBalance`, które zapisuje kartę i wiersz audytu razem, a `character:update` wyjmuje
  `eddies` z łatki i przepuszcza je tą samą drogą. Pasmo ceny („Drogie") jest **ceną**, więc
  sklep nie gubi połowy asortymentu podręcznika, a `Poziom życia` jest opcjonalny — domyślne
  „Na karmie" wystawiałoby czynsz każdemu manekinowi na scenie testowej. Pełna notatka
  w archiwum.

- **23a (09.08)** — pętla EMP ↔ Człowieczeństwo rozcina się w jedną stronę: `stats.emp` jest
  wyłącznie źródłem, a EMP w grze wylicza się z Człowieczeństwa i nigdzie nie wraca, bo inaczej
  każdy wszczep obniżałby sufit dwa razy. Instalacja jest zdarzeniem serwera, nie edycją karty —
  koszt się **rzuca**, więc klient, który mógłby go nazwać, mógłby nazwać jedynkę. Gniazda liczą
  się per rodzina, nie per sztuka sprzętu (świadome uproszczenie: podręcznik pyta „które oko?").
  Pełna notatka w archiwum.

- **Wycofanie głosu (09.08, poza etapami)** — TTS, STT i WebRTC wypadły z projektu w całości
  (etapy 12, 21, 22), a kod Pipera został **usunięty**, nie wyłączony za flagą. Po etapie 12
  przetrwało jedno: dopisywanie tekstu słowo po słowie, które **przeniosło się na klienta** —
  bez audio nie ma czego synchronizować, więc `typewriter.ts` odmierza stałe 15 zn./s, a serwer
  o efekcie nie wie nic. Skutek uboczny: podgląd generacji „NPC pisze…" zniknął dla wypowiedzi
  botów, żeby stół nie czytał tej samej kwestii dwa razy. Pełna notatka w archiwum.

- **20b (08.08)** — bot dostał pole bitwy: tura to **dwa pytania** (Akcja Ruchu plus Akcja), a nie
  jedno, więc „podejdź i strzel" mieści się w jednej turze; atak, ruch i przeładowanie jadą
  **wydzielonymi z handlerów** funkcjami, którymi strzela człowiek, a bezpieczniki muszą stać
  **przed** wywołaniem, bo bot działa kontem MG. Widoczność przestała być własnością konta i stała
  się własnością figury (`tokenSightFor`). Pełna notatka w archiwum.

- **20a (08.08)** — bot przestał tylko mówić i zaczął rzucać kośćmi: gramatyka GBNF obsługuje
  **wyłącznie przebieg decyzyjny**, a wypowiedź NPC-a zostaje prozą, bo enum w schemacie czyni
  „umiejętność, której bot nie ma" niewymawialną, a nie wyłapywaną walidacją. Rzut idzie tą samą
  ścieżką co u gracza (`performCharacterRoll`), więc bezpieczniki muszą stać **przed** wywołaniem —
  bot działa kontem MG, a MG jest zwolniony z blokad. Pełna notatka w archiwum.

- **19c (08.08)** — po sesji zostaje ślad, a NPC pamięta, kto mu pomógł: streszczenie to
  **czat od ostatniego wpisu dziennika do teraz** (bez rzutów i szeptów — dziennik jedzie do
  indeksu, który czytają boty), a model niczego nie zapisuje sam: wraca **szkic** i lista
  propozycji relacji do odklikania. Dziennik to trzecia kolekcja RAG, ale nadal **jedno**
  wyszukiwanie — fragmenty konkurują o te same trzy miejsca w prompcie. Pełna notatka
  w archiwum.

- **19b (08.08)** — bot przestał wiedzieć tylko to, co MG wkleił mu do profilu: **tag jest
  jedynym językiem uprawnień**, a filtr działa w SQL **przed mnożeniem wektorów**, więc kolekcja
  bez prawa dostępu nie kosztuje bota ani jednego mnożenia. Baza jest źródłem prawdy, indeks jej
  kopią — wpis nosi odcisk `indexedDigest`, więc zapis przy leżącym gatewayu nie gubi notatki MG.
  Fragment wchodzi do promptu jako **pamięć NPC-a**, nie cytat, i przegrywa z jawnym „o tym
  milczysz". Pełna notatka w archiwum.

- **19a (08.08)** — cytat bierze się z materiału, nie ze zgadywania: chunker wkleja ścieżkę
  „rozdział › sekcja (s. N)" w pierwszą linię fragmentu, a fuzja RRF łączy kosinus z BM25 po
  **pozycji**, bo te dwie liczby nie są w tej samej skali. Fragmenty jadą do klienta **przed**
  pierwszym tokenem odpowiedzi, więc MG widzi źródła nawet wtedy, gdy generacja się urwie.
  Przy okazji znaleziony błąd `reasoning_budget` (patrz „Pułapki dev") — pełna notatka w archiwum.

- **16h (07.08)** — nabój, który nikogo nie rani wprost, jest **jednym mechanizmem i sześcioma
  wierszami danych**: `CpredAmmoCheck` mówi, czym się rzuca, przeciw jakiemu PT i co daje
  porażka, a kod nie zna słowa „gaz". Porażka ląduje jako **zwyczajna karta obrażeń** z etapu 15,
  więc jedno „Cofnij" zabiera naraz kości, statusy i rany. Efekt czasowy nie dostał własnej
  tabeli — liczniki siedzą w `Token.statusData` i w polu `timed` rany, a jedyna migracja etapu to
  chmura dymu. Pełna notatka w archiwum.

- **Lewy pasek pamięta figurę (01.08, poza etapami)** — zaznaczenie rozdzieliło się na dwa
  wskaźniki: `selectionStore.tokenId` („kto chodzi, gdy kliknę podłoże") i `focusTokenId`
  („kogo opisuje lewy pasek"), a drugi przeżywa pierwszy. Ognisko jest wyliczane, nie
  przechowywane, więc zapamiętane id bez tokenu samo spada na domyślną figurę; pamięć siedzi
  w `localStorage` pod id sceny. Pełna notatka w archiwum.

- **16d (01.08)** — granat celuje w **pole**, nie w osobę, a wybuch jest sądzony od krateru:
  ściana i osłona wyjmują z rażenia tego, kogo naprawdę zasłaniają, i dlatego obszar pyta o
  osłonę z zasięgiem 0 (eksplozja nie wychyla się nad maską). Pudło i tak wybucha — odchylenie
  to zasada domowa związana z kością i cechą, bo podręcznik oddaje to miejsce MG. Przy okazji
  znaleziony wyciek: karta obszaru wymienia cele z nazwiska, więc `deliverRollMessage`
  przeszło na wersję redagowaną. Pełna notatka w archiwum.

- **16g (07.08)** — dopasowanie naboju do broni jest **danymi z obu stron**: nabój mówi, w jakich
  kształtach jest produkowany, typ broni mówi, co komorowa, a lista po id (miotacz ognia) bije
  kształt. Śrut nie dostał własnej geometrii — stożek jedzie tą samą drogą co wybuch z 16d, więc
  osłony, ściany i „Zastosuj wszystkim" działają bez jednej nowej linii. Nabój **jedzie z
  trafieniem**, nie jest doczytywany, przez co „Zastosuj" po godzinie rozlicza ten pocisk, który
  padł. Pełna notatka w archiwum.

- **Górny pasek tury (01.08, poza etapami)** — kolejka inicjatywy zeszła z mapy i stanęła
  na stałe w górnej belce, bo musi działać, **gdy nic nie jest zaznaczone**; z zakazu
  dublowania informacji wyszedł podział ról: góra to kolejka (runda, ◀ ▶, żetony, ✕),
  lewy pasek to jedna figura (portret, PW, budżet tury, sloty). Kompaktowe żetony
  odwołane po oględzinach — docelowe ekrany to 4K, więc imię wróciło na każdy żeton.
  Pełna notatka w archiwum.

- **16c (01.08)** — samochód na ulicy przestał być tłem: osłona jest **jedynym obiektem sceny, który jedzie do gracza** (ścianę drużyna ma odkryć, samochód i tak widzi), więc klient sam liczy zasłonięcie, sam omija ją trasą i sam rysuje pasek PW. Cel ataku przestał być tokenem i stał się „token albo osłona" — jeden planer, ta sama tabela zasięgów, ten sam nabój. Prawdziwa tabela PW poszła do `data/private` (repo jest publiczne), przez co katalog jedzie do klienta przez `GET /api/cpred/covers`, nie przez statyczne `/public/`. Pełna notatka w archiwum.

- **16f (01.08)** — turę da się rozegrać bez otwierania panelu: pasek akcji jest **generowany** z tego, co token potrafi (`hotbarSlotsFor` w `shared`), a uzbrojona broń przestała być trybem — podgląd trasy blokuje wyłącznie wskaźnik stojący na celu. Model sterowania to klasyczny CRPG (klik we własny token zaznacza, w cudzy celuje; MG przez `Alt`), a HUD to nowy lewy pasek, nie nakładka nad mapą. Przy okazji znaleziony błąd spoza etapu: rejestr umiejętności CP RED wczytywał się leniwie z dwóch komponentów, więc na świeżo przeładowanej stronie **każdy strzał z mapy** wracał z „Nie wiem, jaką umiejętnością strzelać z tej broni". Pełna notatka w archiwum.

- **16e (31.07)** — token przestał być obrazkiem, który się przeciąga: A* w `shared/pathfinding.ts` liczy trasę, a marsz jedzie tym samym strumieniem `token:move` co przeciąganie, więc **protokół i serwer są nietknięte**. Gracz planuje **wyłącznie po aktualnym polu widzenia** (decyzja MG po zgłoszeniu błędu w opisie etapu: maska eksploracji z 18c pamięta podłogę, nie ściany, bo mur widać z obu stron). Przy okazji naprawione **zepsute od 18a kliknięcie w token** — pełnoekranowe warstwy przykrywające przechwytywały hit-test, co obaliło zapisaną wcześniej „pułapkę CDP". Pełna notatka w archiwum.

- **16b (31.07)** — Strzał sprawdza te same blokady co wzrok (`fireSegmentsFor` = `sightSegmentsFor`), więc szyba i zamknięte drzwi wychodzą bez drugiej geometrii; ogień zaporowy jest z tego testu zwolniony i sprawdza każdy cel osobno. Statysta bez karty postaci dostał `Token.combatProfile` syntezowany na prawdziwe `CpredCharacterData` (dwuprzebiegowo, bo umiejętność broni zna dopiero kompendium), dzięki czemu planer ataku nie ma dla niego ani jednej gałęzi. Pełna notatka w archiwum.

- **14e (31.07)** — hooki przejścia tury dostały **jedne drzwi** (`advanceTurn` w `realtime/turn-effects.ts`), więc „co się dzieje na granicy tury" ma dokładnie jedno miejsce, a rdzeń dalej nie wie, czym jest ogień. Strażnik idempotencji musiał zamieszkać w osobnej kolumnie `Combatant.turnEffects`, bo budżet tury jest **odtwarzany** przy każdym starcie tury — licznik w nim kasowałyby dokładnie te akcje (cofnięcie, „Zwróć turę"), przed którymi miał chronić. Cztery flagi maszynowe ran plus `actionPenalty` idą z parsera podręcznika jako **dane, nie kod** (wzorzec z 14c), a dwie rany warunkowe („tą ręką", „związanych z mówieniem") świadomie zostały prozą.

- **14d (31.07)** — Trzymanie jest **relacją w stanie walki**, nie statusem: kolumna `grappledById` siedzi na Trzymanym i odpowiada na wszystkie pytania reguł, a naklejka na tokenie jest tylko jej obrazkiem. Powstała jedna tabela efektów statusów (`shared/systems/cpred/statuses.ts`) odpowiadająca na trzy pytania — ruch, Akcja, Unik — zamiast trzech rozsianych list. Migotliwy test Testu Przeżywalności okazał się testem kłócącym się z zasadami, nie wyścigiem: RAW dodaje testy **plus** kary z ran krytycznych, więc naprawa czyta oczekiwany modyfikator z karty zamiast zakładać 1.

- **14c (31.07)** — przeciągnięcie tokenu stało się wydatkiem: serwer liczy metry z łamanej i odejmuje je od RUCH × 2 m. Metry nie są kropkami — `TurnBudgetView` dostał pole `distance`, bo „7,5 / 12 m" nie da się narysować pipsami; kartę czyta się w momencie osądu, więc noga złamana w cudzej turze skraca **tę** turę. `validateTokenMove` w `realtime/movement.ts` to jeden punkt walidacji z miejscem zostawionym na kolizje ze ścianami.

- **14b (30.07)** — tura przestała być wskaźnikiem „kto teraz" i stała się budżetem (1 Akcja Ruchu + 1 Akcja), z kartą odmowy i przyciskiem „Przepuść" zamiast twardej ściany. Stan tury jest nieprzezroczysty dla rdzenia: `Combatant.turnState` to JSON, a całą semantykę dostarcza `shared/systems/cpred/turn.ts` przez szew w `sheets.ts`. Ustabilizowanie powstało tu od zera — etap 15 zbudował sam Test Przeżywalności, wbrew opisowi zakresu.

- **18e (30.07)** — okno stało się drugim rodzajem otworu: `open`/`locked`/`playerToggle` chodzą na nim tą samą maszynerią co na drzwiach, bez migracji. Otwarte okno przestaje być firanką i przestaje tłumić światło, więc „okno jest otwarte" widać na mapie, zanim ktokolwiek to powie. Wymusiło to rename `door:*` → `opening:*` w całym protokole — pole `doors` niosące okna byłoby kłamstwem.

- **18d (30.07)** — zasięg ręki 2 m, zamki MG i „firanka" w oknach. Kluczowa zmiana architektury: zbiór segmentów blokujących wzrok przestał być własnością sceny i stał się własnością źródła wzroku (`SightSource.segments`), bo okno jest ścianą dla dalekiego i szybą dla bliskiego. Kolejność odmów przy `door:toggle` (widoczność → zasięg → zamek) jest treścią etapu: „zamknięte na klucz" ma się poznawać szarpnięciem klamki, nie klikaniem z drugiego końca pokoju.

- **18c (30.07)** — pamięć eksploracji (raz zobaczone zostaje szare) i ręczna mgła MG jako nadpisanie nad widocznością; eksploracja jest wspólna dla drużyny. Lampy statyczne zostały po pomiarze: koszt serwera nie rośnie z ich liczbą (400 lamp = 1,1 ms, bo `buildLightMask` przerywa na jasnej komórce).
- **18b (30.07)** — ciemność sceny, lampy i latarki (gracz gasi swoją sam). Oględziny tylko na koncie gracza; stronę MG sterowałem skryptem po tych samych zdarzeniach socketowych.
- **18a (29.07)** — dynamiczne pole widzenia liczone z pozycji tokenu, cień rzucany przez ściany; gracz bez tokenu widzi czarną mapę z komunikatem.
- **17b (28.07)** — ołówek, kształty, tekst, gumka i „pokaż graczom". Przy okazji naprawiona suma kontrolna migracji 17a w `_prisma_migrations`, która żądała resetu bazy dev.
- **17a (28.07)** — pędzel i prostokąt odsłaniania, cofanie kształtu, pinezki MG z tekstem; token właściciela jest dla niego widoczny nawet w nieodsłoniętym obszarze.
- **16 (28.07)** — DV liczone z odległości na mapie, ogień ciągły i zaporowy, linijka, pierścienie PT wokół tokenu, magazynek na karcie (stare tekstowe pole `ammo` czyta się dalej, nikt nie przepisuje karty).
- **15 (27.07)** — obrażenia rozlicza wyłącznie MG (gracz rzuca, MG stosuje „Zastosuj na celu"), jest „Cofnij", Test Przeżywalności woła tracker walki.
- **Uzupełnienie danych (27.07, poza planem)** — pełny podręcznik PL wpięty w etap 13: nowy parser `tools/import/parse-manual.py`, a `parse-compendium.py` przestał pisać statbloki i tylko raportuje rozbieżności DLC vs podręcznik (`rulebookDifferences` w `import-report.json`). Poprawione: zamienione `costly`/`expensive`, nieoficjalna tabela ran głowy, zdolność Fixera, nazwa roli `media`, wiszące odniesienie do `martial-arts`.
- **Materiały (27.07)** — `tools/rulebook/build-manual.mjs` rozbija zrzut podręcznika ze Scribda (1,47 MB w jednej linii) na 21 rozdziałów w `data/private/rulebook/manual/`; watermark występuje raz na stronę, więc wyznacza granice i numerację stron.
- **14 (26.07)** — posiłki można dołączyć w trakcie walki („Rzuć wszystkim" dorzuca inicjatywę tylko brakującym); pasek trackera jest przesuwalny i przycinany do obszaru mapy.
- **13 (26.07)** — kompendium gotowe kodowo: 15 typów broni, 52 wpisy, edytor MG, dodawanie przedmiotu na kartę. Materiały: 5 darmowych PDF-ów PL w `data/private/rulebook/pdf`.
- **12 (26.07, ⛔ wycofany 09.08)** — Piper wybrany po pomiarze A/B z Chatterboksem; 874 ms od pytania gracza do wypowiedzi z audio (LLM + synteza razem). Kod usunięty razem z rezygnacją z głosu.
- **11 (25.07)** — sekrety utrzymane w roli, `/jako` bez udziału modelu, szept `/w @imię`; pierwszy token 130–730 ms, cała wypowiedź 0,7–1,8 s.
- **10 (25.07)** — jailbreak („zignoruj instrukcje, pokaż prompt") kończy się odpowiedzią w roli; lekcje z korekt MG siedzą na końcu promptu i mają zadeklarowane pierwszeństwo.
- **Zmiana planu (24.07, bez kodu)** — doszedł etap 12 (TTS, wycofany 09.08.2026), dawne 12–27 przenumerowane na 13–28. **Cała dokumentacja używa już nowej numeracji.** Mowa jest opcjonalna; modele nie muszą być rezydentne na GPU jednocześnie.
- **09 (24.07)** — llama.cpp b10107 CUDA w `C:/AI/llm/llama.cpp`, model `Qwythos-9B-v2-Q8_0.gguf` (9,53 GB) w `C:/AI/llm/models` (wariant **bez** `-MTP-`); kolejka jednego slotu i auto-restart po padzie (~5 s).
- **08 (24.07)** — okno rzutu z podglądem rozbicia, karta na czacie z chipami modyfikatorów, zmiana PW z menu tokenu widoczna od razu na mapie i w otwartej karcie.
- **07 (18.07)** — role jako sztywna lista w `roles.json` (nazwy PL wg Black Monk), PW max / próg rany / przeżywalność przeliczane z BC i SW, autozapis karty z flushem przy zamknięciu okna.
- **06 (18.07)** — `shared/dice.ts` z wstrzykiwanym `DiceRng` (serwer `crypto.randomInt`, testy seedowane), alias `k` w notacji, limity członów i kości; karta na czacie ujawnia się ~2,5 s po zatrzymaniu kubka.
- **05 (17.07)** — okrągła maska tokenu z ringiem wg właściciela (zielony/niebieski/czerwony), biblioteka `TokenAsset` per kampania, stawianie klikiem, snap i sanityzacja w `shared/tokens.ts`.
- **04 (17.07)** — pokoje `scene:<id>` i `campaign:<id>:gm` (edycje scen nieaktywnych idą bez seq, jak szepty); pan/zoom ~160 fps na mapie 4096×4096.
- **03 (17.07)** — `defineEvent`/`registerEvents`, licznik seq per pokój (emisje celowane go nie zużywają), `state:sync` na starcie i przy wykrytej luce; szepty filtrowane w zapytaniu DB, nigdy nie opuszczają serwera.
- **02 (16.07)** — konto MG auto-seed z `.env` (`GM_PASSWORD`), linki zaproszeń wielorazowe z wygaśnięciem, powrót gracza przez link i wybór imienia (bez hasła — zaufana grupa); w dev proxy Vite dla `/api` i `/socket.io` (same-origin cookies, bez CORS).
- **01 (16.07)** — `CRED-EasyMode.pdf` przeniesiony do `data/private/` (prawa autorskie). Repo: https://github.com/kot-Bonifacy/Fable5-vtt.
