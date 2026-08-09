# Postęp prac

Aktualizowany na koniec każdej sesji. Statusy: ⬜ nierozpoczęty · 🟨 w toku · ✅ ukończony · ⛔ wycofany.
Pełne notatki z zamkniętych etapów: `archiwum/dziennik-sesji.md` (nie czytaj rutynowo — tylko gdy potrzebujesz szczegółu konkretnego etapu).

| #   | Etap                                          | Status | Data ukończenia | Uwagi                                                                                          |
| --- | --------------------------------------------- | ------ | --------------- | ---------------------------------------------------------------------------------------------- |
| 01  | Szkielet projektu i środowisko                | ✅     | 2026-07-16      | repo: Fable5-vtt; shared konsumowany jako źródła TS (decyzja w README)                         |
| 02  | Baza danych, użytkownicy, role                | ✅     | 2026-07-16      | Prisma 7 (adapter better-sqlite3); dodatkowy model `CampaignMember`                            |
| 03  | Rdzeń realtime i czat                         | ✅     | 2026-07-17      | moduł `realtime` (rejestr zdarzeń z rolą); szepty bez seq; fix `pnpm dev` (`--raw`)            |
| 04  | Mapa i sceny                                  | ✅     | 2026-07-17      | pixi-viewport 6 OK z Pixi v8; MG ma niezależny podgląd scen (pokoje per-scena)                 |
| 05  | Tokeny                                        | ✅     | 2026-07-17      | HP widoczne tylko dla właściciela+MG; ikony statusów z game-icons (CC BY)                      |
| 06  | Silnik kości CP RED                           | ✅     | 2026-07-18      | krytyk/fumble auto dla pojedynczej d10; /gr = autor+MG (styl Foundry)                          |
| 07  | Karta postaci — model i edytor                | ✅     | 2026-07-18      | umiejętności Easy Mode (41) w data/public; gracz też tworzy postaci; okna pływające            |
| 08  | Karta interaktywna i integracja               | ✅     | 2026-07-24      | rzuty z karty zawsze przez kubek; karta = źródło prawdy dla PW tokenu                          |
| 09  | AI Gateway — fundament botów                  | ✅     | 2026-07-24      | ~80 tok/s, kontekst 32k; think sterowany per żądanie; model zmyśla zasady (RAG: 19)            |
| 10  | Edytor botów                                  | ✅     | 2026-07-25      | + guardraile roli, auto-powtórka i nauka z korekt MG (rozszerzenie)                            |
| 11  | Boty NPC na czacie                            | ✅     | 2026-07-25      | pamięć per scenka; wypowiedź bota nie do odróżnienia od `/jako` MG                             |
| 12  | ~~TTS — głos botów~~                          | ⛔     | wycofany 09.08  | był gotowy 26.07 (Piper); kod usunięty, został sam maszynopis tekstu u klienta                 |
| 13  | Dane z podręcznika i kompendium               | ✅     | 2026-07-27      | domknięty 26.07 na darmowych materiałach; 27.07 uzupełniony z podręcznika głównego             |
| 14  | Inicjatywa i tury                             | ✅     | 2026-07-26      | tracker = pasek nad mapą + zakładka „Walka”; remisy: REF, przerzut RAW i drag                  |
| 14b | Ekonomia akcji: budżet tury i katalog         | ✅     | 2026-07-30      | + Ustabilizowanie od zera (etap 15 go nie miał, wbrew opisowi); „przepuść" jako karta MG       |
| 14c | Ruch w turze: budżet metrów na mapie          | ✅     | 2026-07-31      | metry po surowej ścieżce kursora (decyzja MG); kara pancerza i ran krytycznych jako dane       |
| 14d | Zwarcie: Pochwycenie, Duszenie, Rzut          | ✅     | 2026-07-31      | etap 14d podzielony na 14d/14e; migotliwy test death save miał inną przyczynę niż notatka      |
| 14e | Automaty tury: rany krytyczne, DoT, monity    | ✅     | 2026-07-31      | strażnik hooków w osobnej kolumnie (budżet tury jest odtwarzany); + kary płaskie z ran         |
| 15  | Obrażenia, pancerz, krytyki, Death Save       | ✅     | 2026-07-27      | obie tabele ran z podręcznika głównego (nieoficjalna tabela głowy zastąpiona 27.07)            |
| 16  | Zasięgi, DV z mapy, autofire                  | ✅     | 2026-07-28      | wręcz: PT zastępczy z karty celu + przycisk „Unik” (RAW nie zna statycznego PT)                |
| 16b | Linia strzału i atak z mapy                   | ✅     | 2026-07-31      | etap 16b podzielony na 16b/16c; linia strzału = blokady wzroku strzelca, nie druga geometria   |
| 16c | Osłony jako obiekty sceny                     | ✅     | 2026-08-01      | osłona jedzie do klienta (ściana nie); blokada miękka z kartą wyboru zamiast twardej           |
| 16d | Granaty, obszary i rzut przedmiotem           | ✅     | 2026-08-01      | zwężony (amunicja → 16g); odchylenie pudła to zasada domowa — podręcznik jej nie ma            |
| 16e | Ruch klikiem: zaznaczenie, automat chodzenia  | ✅     | 2026-07-31      | trasa gracza tylko po tym, co widzi teraz — maska eksploracji nie pamięta ścian                |
| 16f | Celowanie kursorem i HUD walki                | ✅     | 2026-08-01      | model klasycznego CRPG (klik we wroga celuje, MG przez Alt); HUD w nowym lewym pasku           |
| 16g | Amunicja specjalna: kule zmieniające rachunek | ✅     | 2026-08-07      | podzielony na 16g/16h 07.08; nabój = wpis kompendium, śrut jedzie tą samą drogą co wybuch      |
| 16h | Amunicja bez obrażeń: testy, gaz i dym        | ✅     | 2026-08-07      | dym tylko utrudnia (−4), nie zasłania; minuta = 6 rund, poza walką zdejmuje MG przyciskiem     |
| 17a | Fog of war i warstwa MG                       | ✅     | 2026-07-28      | etap 17 podzielony na 17a/17b; nowa scena startuje zakryta, mgła przełączalna                  |
| 17b | Rysowanie po mapie                            | ✅     | 2026-07-28      | tekst skaluje się z mapą (odstępstwo od wskazówki); MG domyślnie rysuje u siebie               |
| 18a | Ściany i widoczność tokenów                   | ✅     | 2026-07-29      | etap 18 podzielony na 18a/18b; ściany nie opuszczają serwera                                   |
| 18b | Ciemność i źródła światła                     | ✅     | 2026-07-30      | zwężony 30.07 (eksploracja → 18c, drzwi/okna → 18d); 160 fps przy 10 światłach                 |
| 18c | Eksploracja i mgła MG nad widocznością        | ✅     | 2026-07-30      | + „zapal pomieszczenie", tłumienie światła przez okno i wygładzenie gradientu                  |
| 18d | Interakcje z drzwiami i oknami                | ✅     | 2026-07-30      | zasięg ręki 2 m, zamek MG; okno = firanka, a od dopisku 18e też otwierany otwór                |
| 19a | Fundament RAG i asystent zasad MG             | ✅     | 2026-08-08      | etap 19 podzielony na 19a/19b/19c 08.08; embeddingi na CPU (0 GB VRAM), hybryda z FTS5         |
| 19b | Baza wiedzy kampanii i kontekst botów         | ✅     | 2026-08-08      | tag = jedyny język uprawnień; filtr w SQL przed mnożeniem wektorów; podręcznika bot nie czyta  |
| 19c | Streszczenia sesji, dziennik, relacje NPC     | ✅     | 2026-08-08      | dziennik = trzecia kolekcja RAG; wpis rodzi się „tylko MG"; relacja do karty postaci (−3…+3)   |
| 20a | Akcje botów: structured output i rzuty        | ✅     | 2026-08-08      | etap 20 podzielony na 20a/20b 08.08; gramatyka GBNF tylko w decyzji, wypowiedź zostaje prozą   |
| 20b | Tura bota w walce                             | ✅     | 2026-08-08      | „Graj turę” zawsze na klik (decyzja MG); ruch = podejdź/odsuń się, trasę liczy serwer          |
| 21  | ~~STT — polecenia głosowe~~                   | ⛔     | wycofany 09.08  | nierozpoczęty; głos wypadł z projektu w całości                                                |
| 22  | ~~WebRTC — czat głosowy graczy~~              | ⛔     | wycofany 09.08  | nierozpoczęty; głos graczy załatwia zewnętrzny komunikator                                     |
| 23a | Cyborgizacje i człowieczeństwo                | ✅     | 2026-08-09      | etap 23 podzielony na 23a/23b/23c 09.08; EMP bieżące liczone z Człowieczeństwa wchodzi w rzuty |
| 23b | Ekonomia: eurodolce, zakupy, lifestyle        | ✅     | 2026-08-09      | saldo pisze wyłącznie serwer (audyt `LedgerEntry`); pasmo ceny = cena; Poziom życia opcjonalny |
| 23c | Reputacja i Facedown                          | ✅     | 2026-08-09      | PL nazwa to „Konfrontacja"; Reputacja wyliczana z listy wyczynów, −2 wybiera przegrany         |
| 24  | Handouty, dziennik kampanii, screamsheets     | ⬜     |                 |                                                                                                |
| 25  | Generator postaci (lifepath)                  | ⬜     |                 |                                                                                                |
| 26  | Netrunning                                    | ⬜     |                 | możliwy podział na 2 sesje                                                                     |
| 27  | Kości 3D i szlif UI                           | ⬜     |                 |                                                                                                |
| 28  | Wdrożenie na VPS                              | ⬜     |                 |                                                                                                |

## Od czego zacząć

Ostatnio zamknięte: **23c** (Reputacja jako lista wyczynów, Konfrontacja rzutem przeciwstawnym na czacie, status „Onieśmielony" z karą −2 wymierzoną w jednego przeciwnika, rzut na rozpoznanie). **Cała trójka 23a/23b/23c domknięta.**

**09.08 głos wypadł z projektu** (sesja bez etapu, decyzja MG): etapy **12, 21 i 22** wycofane, kod TTS usunięty z repo. Szczegóły w `archiwum/dziennik-sesji.md` i w `archiwum/wycofane/README.md`.
Następny etap: dowolny z **24–27** — kolejność w fazie H jest dowolna. Naturalny kolejny krok to **24 (handouty, dziennik kampanii, screamsheets)**, bo dziennik kampanii z 19c już istnieje i 24 go rozszerza.

**⚠️ Etap 23c obejrzany tylko z konta gracza (avatar9), i to skryptem.** Potwierdzone: strona wstaje bez błędów w konsoli, `reputationSources` domyślnie pusta na **istniejącej** karcie (zgodność wstecz), sekcja „Reputacja" **ukryta u gracza bez wyczynów**, zakładka „Biografia" renderuje się normalnie, a odmowa `ATTACKER_NOT_ON_SCENE` dociera do gracza po polsku („Ta postać nie ma tokenu na tej scenie"). **Całe UI MG nieodklikane** — okno MG stało w trybie incognito, którego rozszerzenie nie widzi (`list_connected_browsers` zwraca jedną instancję). Żeby dokończyć, MG musi być zalogowany w **zwykłym** oknie Chrome. Lista niżej.

**Znalezione przy oględzinach 23c: menu kontekstowe tokenu jest w całości dla MG** (`MapArea.tsx:455` — `onTokenMenu` odpala się tylko przy `ROLE_GM`), więc „😠 Konfrontacja…" jest wejściem wyłącznie MG. Zostawione tak świadomie — podręcznik mówi „W takiej chwili **MG może przeprowadzić Konfrontację**" (s. 194), a gracz bierze udział z karty na czacie („Postaw się" i dwa przyciski przegranego). Przy okazji usunięty martwy filtr własności w `FacedownLauncher`, który sugerował wejście gracza; wpis o osobnych drzwiach dla gracza jest w `POMYSLY.md`.

**⚠️ Etapu 20b nie oglądano w przeglądarce ani na żywym modelu** — cała sesja poszła na atrapie gatewaya i na testach. Zanim odhaczysz cokolwiek z 20b, odpal `pwsh ai-gateway/scripts/start-gateway.ps1`: bez gatewaya „Graj turę" wraca z `AI_UNAVAILABLE`. Lista nieodklikanego niżej.

**Dane dopisane do kampanii „Poligon bojowy" przy oględzinach 23b (do skasowania, gdy przestaną być potrzebne):** na czacie przybyło **pięć kart ekonomii** (zakup, przelew, podgląd miesiąca, rozliczenie miesiąca) i **jeden rzut** na Utratę Człowieczeństwa, wystawione przez **dwie postacie testowe „Test 23b" i „Test 23b-B"** — obie **usunięte** po oględzinach (razem z nimi kaskadowo zniknęły ich wiersze audytu), lista wróciła do pięciu (Rico, Kaya, Manekin, Brutus, Tony). **Żadnej istniejącej postaci nie ruszałem** — w szczególności nikomu nie ustawiłem Poziomu życia, więc „Rozlicz miesiąc" na tej kampanii dziś nikogo nie obciąży. Scena, tokeny i stan walki **nietknięte**.

**Dane dopisane do kampanii „Poligon bojowy" przy oględzinach 23a (do skasowania, gdy przestaną być potrzebne):** na czacie przybyły **cztery karty** wystawione przez postać **„Test 23a"** (instalacja Kerenzikova −11, terapia +4, rzut Empatia 7, usunięcie wszczepu). Sama postać **została usunięta** — lista wróciła do pięciu (Rico, Kaya, Manekin, Brutus, Tony), a żadnej istniejącej karty nie ruszałem. **Wpadka do odnotowania:** przy pisaniu w wyszukiwarkę kompendium ognisko nie było w polu, więc „Kerenzikov" poszło w globalne skróty mapy i **tryb turowy przeskoczył z „PRZED WALKĄ" na RUNDĘ 1** (tura Tony'ego; ◀ nie cofa poza rundę 1). Uzbrojone narzędzie osłon rozbroiłem `Esc`, nic na mapie nie zostało postawione. To dokładnie pułapka opisana niżej — od tej pory ognisko ustawiam skryptem (`el.focus()`) i sprawdzam `document.activeElement` **przed** pisaniem.

**Dane dopisane do kampanii „Poligon bojowy" przy oględzinach 20a (do skasowania, gdy przestaną być potrzebne):** na czacie przybyły **cztery linie MG i trzy karty** — jedna karta propozycji bota (Percepcja, oznaczona „ZATWIERDZONE — MG"), dwie karty rzutu wykonane **kartą Kai** (Percepcja 5 z fumble, Atletyka 16) i jedna wypowiedź Barmana. Bot **Barman** miał na czas oględzin podpiętą kartę postaci **Kaya** i tryb **Automat** — **jedno i drugie cofnięte** (karta: „— brak —", tryb: „Propozycja"), więc profil bota jest taki jak przed sesją. Scena, tokeny, stan walki i relacje **nietknięte**. Doszedł plik `data/private/bot-decisions.jsonl` (gitignore) z dziennikiem decyzji.

**Dane dopisane do kampanii „Poligon bojowy" przy oględzinach 19c (do skasowania, gdy przestaną być potrzebne):** jeden wpis dziennika „Wycieczka do Afterlife" (widoczny dla botów, tag `#sesje`, objął 4 wypowiedzi — od niego liczy się następne streszczenie), bot **Barman** ma teraz zaznaczone drugie źródło „Dziennik kampanii" i **relację do Kai −2 (wrogi)** z notatką o utargu, a na czacie przybyły trzy linie (pytanie MG, odpowiedź bota i opis akcji Kai). Drugi szkic streszczenia został **odrzucony**, więc w dzienniku jest jeden wpis. Scena, tokeny i stan walki **nietknięte**.

**Dane dopisane do kampanii „Poligon bojowy" przy oględzinach 19b (do skasowania, gdy przestaną być potrzebne):** dwa wpisy w zakładce „Wiedza" — „Klub Afterlife" (widoczny dla botów, tagi `#miejsca #watson`; treść po edycji mówi, że klub spłonął) i „Kto sypie ekipę" (🔒 tylko MG, tagi `#miejsca #intrygi`) — oraz bot **Barman** (NPC, aktywny w sesji, czyta bazę wiedzy bez filtra tagów, top-3). Na czacie przybyły cztery linie: dwa pytania MG i dwie odpowiedzi bota. Scena, tokeny i stan walki **nietknięte**.

**Stan sceny „Strzelnica":** przy wejściu do przeglądarki tryb turowy stał na **RUNDZIE 3** (tura Brutusa), czyli inaczej niż zapisano 08.08 po resecie — walka toczyła się między sesjami. Nic w niej nie ruszałem.

**Stan oględzin 19a:** **odklikane u MG** — panel „Zasady", stan indeksu, indeksowanie z postępem, pięć pytań o zasady, rozwijanie cytatu. Cztery odpowiedzi poprawne od pierwszego razu, piąta wyszła pusta i wskazała błąd (patrz notatka sesji). Nieodklikane: powtórka bez rozumowania **po poprawce** i degradacja z martwym gatewayem — jedno i drugie pokryte testami dymnymi.

### Otwarte zaległości (przechodzą między etapami)

- **Etap 23c — UI MG nieodklikane** (strona gracza sprawdzona częściowo, patrz „Od czego
  zacząć"). **Wymaga MG w zwykłym oknie Chrome, nie w incognito.** Do
  sprawdzenia, po kolei: (1) **sekcja „Reputacja" w zakładce „Biografia"** karty
  postaci — liczba, zdanie z tabeli zasięgu („Cała okolica o tym mówi"), przycisk „+ Wyczyn",
  edycja poziomu/opisu/daty, checkbox „zła", kosz; wiersz, z którego liczy się bieżąca
  Reputacja, ma mieć pasek w kolorze akcentu. (2) **„😠 Konfrontacja…" w menu kontekstowym
  tokenu** — rozwija listę figur, którymi można się zmierzyć, z chipem „Rep. N"; „Zmierz się"
  ładuje kubek. (3) **Karta Konfrontacji na czacie** — plakietka Wygrana / Remis / Przegrana
  (remis jest szary i **nie** stawia nikomu pytania), linia „pojedynek spojrzeń · Kolec: 25",
  wiersz „Reputacja 10 (Koncert w Afterlife)" w rozbiciu rzutu. (4) **Dwa przyciski
  przegranego** („Wycofaj się" / „Nie ustępuj (−2)") — widzi je sterujący przegranym albo MG,
  nie zwycięzca. (5) **Status „Onieśmielony"** na tokenie po „Nie ustępuj" i wiersz
  „Przegrana Konfrontacja −2" w rozbiciu ataku wymierzonego w tego jednego przeciwnika.
  (6) **„Czy go znam?"** — karta rzutu 1k10 idąca **tylko** do rzucającego i MG.
  (7) **„Postaw się"** na karcie u drugiej strony (tylko gdy ma kartę postaci).

- **Etap 23c — „Cofnij" na karcie obrażeń nie przywraca strachu.** Świadome i opisane
  w `realtime/damage.ts`: gdy przeciwnik spada do 0 PW, status „Onieśmielony" schodzi ze
  wszystkich, którzy się go bali (RAW: „znika, gdy tylko uda ci się pokonać wroga"), ale karta
  obrażeń nie zapisuje, komu go zdjęła, więc cofnięcie obrażeń go nie wraca. Powrót: MG
  zaznacza status ręcznie w menu tokenu.

- **Etap 23c — status „Onieśmielony" zaznaczony ręcznie nic nie robi.** Kara wymaga
  **dwóch** rzeczy naraz: naklejki na tokenie i adresu przeciwnika w `Token.statusData`
  (`sheetFacedownPenalty`). To celowe — dzięki temu odznaczenie statusu w menu tokenu jest
  pełnym „zdejmij karę" — ale znaczy też, że sama naklejka jest wtedy dekoracją.

- **Etap 23b — cztery ścieżki nieodklikane.** (1) **Strona gracza**: czy gracz widzi saldo jako
  liczbę bez pola edycji, czy „Kup" schodzi z jego konta i czy karta przelewu dociera do drugiego
  gracza — pokryte 17 testami serwera, ale wymaga drugiego profilu przeglądarki (ten sam powód co
  przy 14b/14c). (2) **Zakup pancerza i sprzętu** — sprawdzona tylko broń; wiersze pancerza
  (`spCurrent`, lokacja, kara) i sprzętu idą tą samą funkcją `purchasedSheetRow` i mają test
  w `shared`, ale w przeglądarce nie były klikane. (3) **Wpis bez ceny liczbowej** — „Kup" ma być
  wtedy wyszarzony, a cena ma się liczyć z pasma; w kompendium kampanii wszystkie oglądane wpisy
  miały cenę. (4) **„Znaleziony — montaż N ed"** przy cyborgizacji (s. 375) — przycisk istnieje
  i jest pokryty testem, klikany był tylko wariant pełnopłatny.

- **Etap 23b — lista odbiorców przelewu odświeża się przy otwarciu „Kasy".** Postać utworzona,
  gdy panel jest już rozwinięty, pojawi się na liście dopiero po zwinięciu i ponownym rozwinięciu.
  Świadome: listę przynosi `economy:history` razem z audytem (klient gracza nie zna cudzych kart),
  a odświeżanie jej na każdą zmianę czegokolwiek w kampanii byłoby zapytaniem na każdy zapis karty.

- **Etap 23a — trzy ścieżki nieodklikane.** (1) **Strona gracza**: czy gracz widzi kartę rzutu UC,
  linię „EMP w grze" i sekcję cyborgizacji na własnej karcie — pokryte 13 testami serwera, ale
  wymaga drugiego profilu przeglądarki (ten sam powód co przy 14b/14c). (2) **Chip cyberpsychozy
  na liście postaci** (`character-psychosis` w `CharacterPanel.tsx`) — dopisany **po** oględzinach,
  więc widziany tylko w kodzie; pokazuje się dopiero przy EMP ≤ 2, czyli po utracie ~40 punktów
  Człowieczeństwa. (3) **Edytor MG wpisu cyborgizacji** z nowymi polami (rodzina, montaż, UC stałe
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
  która je ma. (7) **Strona gracza** — sterujący gracz widzi kartę propozycji bojowej i może ją
  zatwierdzić (pokryte testem, w przeglądarce nie — ten sam powód co przy 14b/14c: drugi profil
  przeglądarki).

- **Etap 20a — trzy ścieżki nieodklikane.** (1) **Tryb „kontrolowany"** — bot ma tylko mówić i nie
  dotykać mechaniki; pokryte testem (przebieg decyzyjny w ogóle nie dociera do modelu), w przeglądarce
  nieoglądane. (2) **Sterowanie propozycją przez gracza** — pole „Propozycje zatwierdza też" istnieje
  i jest pokryte testem na żywych gniazdach (kto widzi kartę, kto może kliknąć), ale wymaga drugiego
  profilu przeglądarki — ten sam powód co przy 14b/14c. (3) **„Odrzuć"** — kliknięte tylko w teście;
  w przeglądarce sprawdzone samo „Zatwierdź".

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

- **Etap 16f — strona gracza odklikana w połowie (01.08, przy 16c).** **Potwierdzone na koncie Vex:** panel aktywnej postaci z portretem i paskiem PW, pasek akcji z bronią i chipami „seria"/„zapora" plus „Przeładuj", **celownik i dymek nad wrogiem bez żadnego modyfikatora** (czerwone narożniki, `Alt` niepotrzebny), **klik we wroga ładujący kubek**. **Zostało:** (1) pasek **wyszarzony z powodem** „To nie jest tura tej postaci" poza turą; (2) `Tab` pokazujący wyłącznie własne tokeny; (3) brak PW w panelu dla cudzego tokenu. Odmowy pokrywają testy `hotbar.test.ts`.

- **Etap 16f — formularze paska nieodklikane**: Ustabilizowanie, Pochwycenie i Wstrzymanie Akcji otwierają w pasku **te same** komponenty co zakładka „Walka" (`CombatForms.tsx`), ale przez pasek nie były klikane — sprawdzone tylko to, że sloty się pojawiają i mają skróty.

- **Etap 16e — odklikane częściowo (na koncie gracza), reszta czeka na mysz.** **Sprawdzone 31.07 na koncie Johnny:** klik w token → zaznaczenie (biały przerywany pierścień), podgląd trasy pod kursorem z licznikiem „15,2 m" i znacznikiem ✖, oraz odmowa poza turą (trasa przestaje się rysować). **Zostało do sprawdzenia:** (1) sam marsz po kliknięciu w podłoże i odsłanianie mgły w jego trakcie; (2) obejście rogu korytarza przez trasę; (3) klik za zasięgiem tury → ✖ na granicy budżetu i wygaszony ogon; (4) kursor „idź w tę stronę" nad czernią; (5) Esc / klik w trakcie marszu; (6) przerwanie marszu przez NPC wychodzącego zza rogu; (7) Shift+klik → żółty punkt załamania; (8) PPM w puste → odznaczenie; (9) **przeciąganie tokenu działa jak przed etapem** (najważniejszy test regresji — patrz `DRAG_CLICK_GRACE_MS`); (10) token 2×2 przy metrowych drzwiach. Punkty 1–8 wymagają tury dla postaci, którą się steruje — na scenie kampanii turę ma ukryty NPC, więc oględziny zrób na osobnej scenie albo po przekazaniu tury.

- **Kliknięcie w token było zepsute dla graczy od 18a — naprawione w 16e, ale zaległości oględzin z tego okresu warto powtórzyć.** Warstwy przykrywające przechwytywały hit-test (szczegóły w „Pułapki dev"), więc gracz na scenie z dynamiczną widocznością **nie mógł kliknąć ani przeciągnąć żadnego tokenu**. To prawdopodobnie realna przyczyna części wpisów „strona gracza nieodklikana" niżej — przy ich odhaczaniu sprawdź najpierw, czy rzecz w ogóle dawała się kliknąć.

- **35 broni markowych ma opisy po angielsku** — wymaga przebiegu `tools/import/translate-descriptions.py` przy włączonym llama-serverze (`pwsh ai-gateway/scripts/start-gateway.ps1`, potem `uv run --with httpx python tools/import/translate-descriptions.py`). Bez GPU się nie da, więc czeka na sesję z gatewayem.
- **Etap 13 — UI kompendium odklikane tylko powierzchownie**: 30.07 (przy oględzinach 14b) potwierdzona sama zakładka „Kompendium" — chipy kategorii z licznikami (Broń 103, Pancerz 11, Sprzęt 5, Cyborgizacje 3, Rany krytyczne 22) i lista wpisów z obrażeniami i ceną. **Nadal nieodklikane:** karta przedmiotu z tabelą PT, edytor MG, dodanie przedmiotu na kartę postaci. Ścieżki serwerowe pokryte testami.
- **Etap 09 — zakładka „AI" u MG niezweryfikowana wizualnie** (sesja toczyła się na koncie gracza). Późniejsze etapy oglądały u MG inne zakładki, więc to prawdopodobnie martwa zaległość — sprawdź przy okazji.
- **Etapy 18d/18e — strona gracza nieodklikana**: ikona 🪟 u gracza, „Za daleko — podejdź do okna", „Okno zamknięte na skobel", „Zamknięte na klucz". Pokryte testami dymnymi na payloadzie.
- **Etap 14e — strona gracza nieodklikana**: odmowa Akcji przy Urazie kręgosłupa i odmowa ruchu przy Urazie ucha widziane u MG jako wiersz „🩼" i jako blokada budżetu, ale karta odmowy u gracza (z jego zdaniem rany i przyciskiem „Przepuść" u MG) — nie. Pokryte 13 testami dymnymi w `turn-effects.test.ts`; ten sam powód co niżej.
- **Etapy 14b/14c — strona gracza nieodklikana**: karta odmowy z przyciskiem „Przepuść" u MG i powtórzenie akcji przez gracza (14b), snap-back odrzuconego przeciągnięcia i komunikat „Za daleko o X m" (14c). Pokryte testami dymnymi na żywych gniazdach (`combat-actions.test.ts`, `movement.test.ts`), ale nie obejrzane w przeglądarce — **sesja gracza w tej samej przeglądarce wylogowuje MG** (wspólne ciasteczko `localhost:5173`), a hasła nie wpisuję. Potrzebny drugi profil Chrome albo okno incognito.
- **Etap 14c — blokady ze statusów nieodklikane**: Powalony/Pochwycony odmawiający ruchu i „Wstanie" zdejmujące status. Pokryte testami dymnymi; w przeglądarce nie do sprawdzenia, bo **statusy ustawia się z menu kontekstowego tokenu (prawy przycisk), którego CDP nie dowozi do warstwy Pixi** (pułapka niżej).
- **Ślad ścieżki przy przeciąganiu nieobejrzany**: `left_click_drag` z CDP jest natychmiastowy, więc łamana z licznikiem metrów rysuje się i znika między klatkami. Do sprawdzenia ręcznie — myszą.
- **Etap 14d — strona gracza i „Broń się" nieodklikane**: karta testu spornego z przyciskiem „Broń się" u broniącego się gracza, odmowa Uniku Ludzkiej tarczy i odmowa ruchu Trzymanemu. Pokryte 19 testami dymnymi na żywych gniazdach (`grapple.test.ts`), ale nie obejrzane w przeglądarce — ten sam powód co w 14b/14c (sesja gracza wylogowuje MG).
- **Etap 16b — strona gracza i klik w cel nieodklikane**: klik w token ładujący kubek ataku, „🎯 Atak…" w menu kontekstowym tokenu i edytor profilu bojowego w „Edytuj…" — wszystkie trzy wymagają trafienia wskaźnikiem w warstwę Pixi, czego CDP nie dowozi (pułapka niżej). Pokryte 13 testami dymnymi w `attacks.test.ts`.
- **Osłona nie blokuje ruchu po stronie serwera** — jak ściany. Trasa A* u klienta omija samochód i przeciągnięcie przez niego nie zostanie odrzucone; `validateTokenMove` dalej liczy sam dystans. Wraca razem z kolizjami ruchu (POMYSLY, 30.07).
- **Etap 16b — statysta nie może aktywnie unikać**: PT obrony statysty liczy się z jego profilu (Unik), ale przycisk „Unik" na karcie ataku pojawia się wyłącznie dla celu z kartą postaci, bo `attack:evade` wymaga `characterId`. Do domknięcia razem z 16c albo osobnym wpisem w POMYSLY.
- **Rany warunkowe zostają prozą**: „Strzaskane palce −4 do Akcji **tą ręką**" i „Złamana szczęka −4 do Akcji **związanych z mówieniem**" nie mają flagi maszynowej, bo VTT nie wie, co jest w której dłoni ani która czynność jest mówieniem. MG stosuje je ręcznie — wróci to razem ze śledzeniem broni w dłoniach (POMYSLY, 30.07).
- **`data/private/rulebook/manual/tabela-ran-krytycznych.md` jest poza repo** — na czystej maszynie trzeba go dostarczyć albo wpisać tabelę głowy w edytorze.

### Pułapki dev (kosztowały czas więcej niż raz)

- **HMR przy działającym Pixi wywala stronę** wyjątkiem `Ticker.remove` — po edycji plików klienta przeładuj kartę.
- **`window.confirm` w panelach zawiesza sterowanie przeglądarką przez CDP** — omijaj przyciski „usuń" przy automatyzacji albo poproś użytkownika o kliknięcie.
- ~~**Do warstwy Pixi nie dociera przez CDP ŻADNE zdarzenie wskaźnika na tokenie**~~ — **to była błędna diagnoza, obalona 31.07 w 16e.** Kliknięcia docierały zawsze; nie działał **hit-test**, i to dla wszystkich, także dla prawdziwej myszy. Pełnoekranowe warstwy przykrywające (płachta widoczności z 18a u gracza, mgła z 17a u każdego, kto ją ma włączoną) leżą **nad** warstwą tokenów i domyślnie biorą udział w trafianiu, więc Pixi zwracał jako cel `Viewport` zamiast `TokenNode`. Naprawa: `eventMode = 'none'` na warstwach czysto malarskich (`init` w `MapRenderer`). **Skutek dla planowania sesji:** oględziny rzeczy wymagających kliknięcia w token są znowu wykonalne automatem — sprawdzone w 16e (zaznaczenie, podgląd trasy, odmowa). Zanim zapiszesz „CDP tego nie dowozi", wypisz w logu `event.event.target` z `viewport.on('clicked')`: jeśli to `Viewport`, a nie `TokenNode`, problem jest w hit-teście, nie w automatyzacji.
- **Zdarzenie wysłane bez potwierdzenia (`socket.emit('x', payload)`) docierało na serwer z pustym payloadem** — `registerEvents` uznawał jedyny argument za brakujący callback. Naprawione 31.07; objaw był zupełnie inny niż przyczyna (token skacze u obserwatorów, patrz notatka sesji). Nowe zdarzenie bez acku sprawdź testem serwera, bo klient nie dowie się o odmowie — nie ma czym.
- **Dane CP RED (`skills.json`, `roles.json`) wczytywały się dopiero po otwarciu „Postaci" albo karty postaci** — `ensureCpredDataLoaded` wołały tylko te dwa komponenty. Dopóki każdy atak zaczynał się od karty, nikt tego nie zauważył; HUD z 16f zaczyna go z mapy, więc **każdy strzał wracał z „Nie wiem, jaką umiejętnością strzelać z tej broni"** (`UNKNOWN_SKILL` — pusty rejestr umiejętności, nie brak danych w kompendium). Naprawione 01.08: `MapArea` woła je razem z `ensureStatusesLoaded`. **Wniosek na przyszłość:** nowe wejście do mechaniki sprawdź na **świeżo przeładowanej karcie, bez otwierania żadnej zakładki** — to jedyny stan, w którym takie leniwe ładowanie widać.
- **Po `prisma migrate dev` upewnij się, że klient się przegenerował** (`prisma generate`) — stary klient w `src/generated/` daje `Unknown argument`.
- **Haseł w formularze nie wpisuję** — sesję MG zakłada użytkownik, sesję gracza zakłada się kluczem z panelu MG (bez hasła).
- **Edycja kodu w trakcie oględzin przeładowuje kartę, a wtedy pisanie staje się skrótami klawiszowymi.** Kosztowało to 08.08 przypadkowe przeskoczenie tury w żywej kampanii: po edycie `realtime/rules.ts` `tsx watch` zrestartował serwer, Vite przeładował stronę, ognisko wyszło z pola tekstowego — i wpisywane zdanie poleciało do globalnych skrótów mapy (**każde „e" to „koniec tury"**, litery uzbrajają narzędzia). **Zasada:** albo kończysz edycje przed wejściem do przeglądarki, albo przed każdym pisaniem robisz zrzut i sprawdzasz, że kursor stoi w polu. Po wpadce `Esc` rozbraja uzbrojone narzędzie.
- **`reasoning_budget` w llama-server nie działa dla wartości dodatnich** — przyjmuje 640 bez błędu, ale egzekwuje wyłącznie 0 i −1. Każda ścieżka z `reasoning: true` musi umieć obsłużyć **pustą odpowiedź** po zużyciu całego `max_tokens` na blok think. Szczegóły w `ai-gateway/README.md`.
- **Testy dymne serwera potrafią raz na kilka przebiegów pęknąć na limicie czasu** — każdy plik podnosi własny Fastify z Socket.IO, więc przy pełnym `pnpm --filter @vtt/server test` bywa ciasno. Zaobserwowane 08.08: dwa różne przypadki (`ammo.test.ts`, `ammo-effects.test.ts`) pękły po jednym razie na trzy przebiegi i **oba przeszły uruchomione osobno**. Zanim zaczniesz szukać regresji, powtórz sam plik.

## Notatki z dwóch ostatnich sesji

- **2026-08-09 (etap 23c — reputacja i Konfrontacja):** Sława na Ulicy dostała liczbę i skutek. **Polska nazwa Facedownu to „Konfrontacja"** (s. 193–194) i tak nazywa się w całym UI. **Sprostowanie do opisu etapu:** punkt „Reputacja w rzutach społecznych" nie ma pokrycia w RAW — Reputacja **nie jest** ogólnym modyfikatorem do Perswazji ani Wygadania; podręcznik używa jej w dokładnie dwóch miejscach i oba są zrobione (Konfrontacja i rzut na rozpoznanie). **Cztery rozstrzygnięcia MG przed kodem.** (1) **VTT egzekwuje −2** zamiast zostawiać je pamięci MG. (2) **Reputacja jest wyliczana z listy wyczynów**, nie wpisywana liczbą. (3) **Rzut na rozpoznanie wchodzi w zakres.** (4) **Konfrontacja nie kosztuje Akcji** — podręcznik stawia ją *przed* walką i nie ma jej w katalogu akcji z 14b. **Odstępstwo od decyzji 1, zgodne z RAW:** −2 nie nakłada się samo. „Przegrany może: Wycofać się… albo Nie wycofywać się, ale otrzymać modyfikator −2" — to wybór przegranego, więc rzut ustala **wyłącznie kto przegrał**, a karta stawia mu dwa przyciski; „VTT egzekwuje" znaczy tu „VTT pyta i pilnuje", nie „VTT rozstrzyga za stołem". **Architektura — pięć rzeczy niesie etap.** Pierwsza: **lista wyczynów JEST wartością**. RAW zastępuje Reputację tylko wyższą (s. 193), więc `cpredReputation` bierze wpis o najwyższym poziomie (przy remisie — późniejszy), a osobne pole liczbowe obok byłoby drugim, kłócącym się źródłem prawdy dla jednego faktu; zła sława to ten sam wiersz ze znacznikiem, który w Konfrontacji odwraca znak. Druga: **kara jest jedynym modyfikatorem w projekcie zależnym od tego, KOGO się atakuje** — dlatego nie weszła do `sheetSituationModifiers` (bezcelowego), tylko dokleja się w miejscach, które znają cel: `attacks.ts`, `grapple.ts` i rewanżowa Konfrontacja. Trzecia: **naklejka i adres muszą zgadzać się oboje** — status „Onieśmielony" na tokenie plus lista bojących-się w `Token.statusData` (wzorzec z 14e/16h, **bez migracji**); dzięki temu odznaczenie statusu w menu tokenu jest pełnym „zdejmij karę", bez uczenia MG drugiego mechanizmu. Czwarta: **remis jest wynikiem**, jedyny raz w tym projekcie — „obie strony nie są pewne wyniku i nic się nie dzieje" bije regułę „remis wygrywa obrona" z s. 169, stąd trójwartościowe `outcome` obok booleana `won` na karcie. Piąta: **`reputation.ts` nie mogło być liściem**, więc typ wiersza i limity siedzą w `character.ts` (jak `CpredCriticalInjuryRow`) — inaczej `character.ts → reputation.ts → attacks.ts → rolls.ts → character.ts` domknęłoby cykl importów, którego cała gałąź `character.ts` dotąd nie ma. **Dwie rzeczy złapane testami, obie o kościach.** (1) Konfrontacja jest **Testem**, więc dziesiątka wybucha, a jedynka fumbluje: kość jest warta −9…+20, nie 1…10 — pierwsze granice w testach były policzone jak dla płaskiej k10 i pękały losowo. (2) Rzut na rozpoznanie **musi mieć `checkRule: false`** („Postacie rzucają 1k10", bez dorzutu), inaczej naturalna dziesiątka daje 18 i rozpoznaje każdego. Przy okazji wyszło, że RAW czytane dosłownie („niższy od") **nigdy nie rozpoznaje Reputacji 1** i przepuszcza Reputację 10 na naturalnej dziesiątce — szansa to (poziom − 1)/10; zapisane w komentarzu i w teście, żeby nie wróciło jako zgłoszenie błędu. **Migracji nie ma** — lista wyczynów siedzi w JSON-ie karty, strach w `statusData`. Nowy status `intimidated` z własną ikoną. **Zweryfikowane:** 893 testy w `shared` (20 nowych w `reputation.test.ts`), 553 na serwerze (16 nowych w `facedown.test.ts` na żywych gniazdach), typy, lint, Prettier i `pnpm build` czyste. **Nieodklikane: całe UI etapu** — sesja skończyła się na ekranie logowania MG (haseł nie wpisuję), lista w zaległościach wyżej.

- **2026-08-09 (etap 23b — ekonomia: eurodolce, zakupy, lifestyle):** Pieniądze przestały być liczbą, którą gracz sobie poprawia. **Cztery rozstrzygnięcia MG przed kodem.** (1) **Gracz kupuje sam** — klika „Kup", serwer sprawdza saldo; MG zachowuje osobne, darmowe „Dodaj za darmo" (łup, ekwipunek startowy, nagroda). (2) **Pole „Eurodolce" zostaje MG**, ale każda jego zmiana schodzi z drogi zapisu karty i ląduje jako **korekta w audycie** — audyt z niezalogowaną furtką obok jest dekoracją. (3) **Rozliczenie miesiąca pobiera tyle, ile jest na koncie**, a resztę zgłasza jako niedopłatę; tydzień zwłoki i rzuty obronne przeciw śmierci (s. 376) zostają prozą MG, bo długi są jawnie poza zakresem. (4) **Historia operacji siedzi na karcie**, w zakładce „Sprzęt" — tam pada pytanie „ile mam?", i tam ma stać odpowiedź „na co poszło". **Architektura — pięć rzeczy niesie etap.** Pierwsza: **saldo pisze serwer albo nikt**. Wszystkie ścieżki przechodzą przez jedno `applyBalance` w `realtime/economy.ts`, które zapisuje kartę i wiersz audytu w tej kolejności i nigdy jednego bez drugiego; `character:update` **wyjmuje `eddies` z łatki** (`FORBIDDEN` u gracza) i przepuszcza je tą samą drogą co resztę. Druga: **pasmo ceny jest ceną** — „550 ed (Drogie)" to jedna liczba i jeden szczebel drabiny, a mnóstwo wierszy podręcznika niesie sam szczebel; `entryPrice` rozwija go po tabeli s. 342, więc sklep nie gubi połowy asortymentu. Trzecia: **towar i pieniądze jadą jednym zapisem** — wiersz karty buduje `purchasedSheetRow` **wydzielone z klienta do `shared`** (nowe `shopping.ts`), więc kupiony karabin i znaleziony to ten sam wiersz, a odmowa zapisu nie zostawia opłaconej broni w powietrzu. Czwarta: **`Poziom życia` jest opcjonalny (`lifestyle: null`)** — brak oznacza „ta postać nie prowadzi rachunków", bo domyślne „Na karmie" wystawiałoby czynsz każdemu manekinowi na scenie testowej; „Rozlicz miesiąc" raportuje pominiętych. Piąta: **karta ekonomii na czacie nigdy nie jest publiczna** — nowy rodzaj `economy` idzie wzorcem szeptu do MG, płatnika i odbiorcy, a podsumowanie miesiąca (z saldami całej drużyny) **wyłącznie do MG**; gracz swoją linię widzi w audycie na własnej karcie. **Domknięte 23a:** instalacja pobiera cenę wszczepu **plus montaż wg tabeli** (Galeria 100 / Klinika 500 / Szpital 1000, s. 375), terapia pobiera 500 / 1000 ed, a „Znaleziony — montaż" płaci tylko za robotę ripperdoca; **pieniądze sprawdzane są przed kośćmi**, żeby stół nie oglądał utraty Człowieczeństwa za operację, która się nie odbyła. **Migracja `20260809085503_stage23b_ledger`** dokłada jedną tabelę `LedgerEntry` (kwota ze znakiem **i** saldo po operacji — audyt ma zostać czytelny, gdy korekta MG ruszy portfel za jego plecami); kasowanie postaci kaskadowo zabiera jej audyt. Korekty tego samego MG w oknie minuty **nadpisują swój wiersz** zamiast dokładać nowy, bo pole liczbowe zapisuje się po każdej cyfrze. **Zweryfikowane:** 873 testy w `shared` (18 nowych w `economy.test.ts`), 537 na serwerze (17 nowych w `economy.test.ts` na żywych gniazdach + 2 w `cyberware.test.ts`), typy, lint, Prettier i `pnpm build` czyste. **Odklikane u MG w przeglądarce (na postaciach „Test 23b" i „Test 23b-B", potem usuniętych):** korekta 0 → 3 000 ed z wpisem w audycie, zakup broni (−50 ed, wiersz na karcie, karta na czacie), przelew 450 ed z notatką i trzema liniami na karcie czatu, Poziom życia + Zakwaterowanie z linią „Pierwszego dnia miesiąca: 1 300 ed", **„Podgląd miesiąca"** (nie rusza kont), **„Rozlicz miesiąc"** (dwie postacie, jedna z NIEDOPŁATĄ 2 550 ed, pominięte pięć bez Poziomu życia), instalacja Cyberoka za **600 ed** i odmowa Cyberwęża za 2 000 ed przy 600 ed na koncie. **Trzy błędy znalezione i naprawione przy oględzinach:** historia nie odświeżała się po operacji (optymistyczny `localPatch` wyprzedzał zapis — efekt chodzi teraz po `character.updatedAt`), wiersz „Dodaj postaci" w kompendium zapadał się do jednopikselowego paska przy trzech przyciskach (brak `flex-wrap`), a odmowa instalacji z braku środków wracała ogólnikiem („Nie udało się wykonać operacji na cyborgizacji") zamiast „Za mało eurodolców na wszczep i montaż".

## Skróty wcześniejszych sesji

Uzupełniają kolumnę „Uwagi" w tabeli, nie powtarzają jej. Uzasadnienia decyzji, listy niezweryfikowanego i szczegóły migracji — `archiwum/dziennik-sesji.md`.

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
