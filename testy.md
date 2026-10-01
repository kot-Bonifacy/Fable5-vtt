# Testy przed betą: czy VTT może wyjść z alfy do graczy?

Plan przygotowany 26.09.2026. Ten plik jest dla testów tym, czym `POSTEP.md` jest dla etapów:
czytasz go na starcie każdej sesji testowej, a na końcu aktualizujesz tabelę stanu (sekcja 1)
i notatkę sesji (sekcja 12). Znalezione błędy trafiają do rejestru `testy-rejestr.md`, który
zakłada etap T1 (sekcja 9).

**Na jakie pytanie odpowiadamy:** czy stół da się oddać grupie graczy tak, żeby rozegrali pełną
sesję (od linku zaproszenia do końca drugiej walki) bez utraty danych, bez wycieku tego, czego
gracz nie powinien widzieć, i bez sytuacji, w której MG musi przerwać grę i zajrzeć w kod.

## 1. Stan etapów testowych

Statusy: ⬜ nierozpoczęty · 🟨 w toku · ✅ ukończony · 🔁 do powtórki po poprawkach.

| etap | nazwa                                                     | status | data       |
| ---- | --------------------------------------------------------- | ------ | ---------- |
| T0   | Projekt testów (ten plik)                                 | ✅     | 26.09.2026 |
| T1   | Infrastruktura E2E, instancja testowa, linia bazowa       | ✅     | 26.09.2026 |
| T2   | Bezpieczeństwo i autoryzacja                              | ✅     | 26.09.2026 |
| T3a  | Rozgrywka 1a/4: kampania, gracze, zgody, oba kreatory     | ✅     | 26.09.2026 |
| T3b  | Rozgrywka 1b/4: sceny, figury, boty, aktywacja, czat      | ✅     | 26.09.2026 |
| T4a  | Rozgrywka 2a/4: walka pierwsza — inicjatywa, tury 1. rundy | ✅     | 26.09.2026 |
| T4b  | Rozgrywka 2b/4: walka pierwsza — granat, rany, łup        | ✅     | 27.09.2026 |
| T5a  | Rozgrywka 3a/4: „Brama” — przygotowanie, wejście, run Oli | ✅     | 27.09.2026 |
| T5b  | Rozgrywka 3b/4: walka druga — Sieć, wieżyczka, pad AI     | ✅     | 27.09.2026 |
| T6a  | Rozgrywka 4a/4: handel, sklep, Paser, PD, Medyk, chrom    | ✅     | 29.09.2026 |
| T6b  | Rozgrywka 4b/4: czas, screamsheet, dziennik, eksport, kopie | ✅     | 30.09.2026 |
| T6c  | Rozgrywka 4c/4: dwa pełne przebiegi od zera, migotanie    | ✅     | 01.10.2026 |
| T7a  | Odporność 1/3: sieć, restart, dwie karty, degradacja AI   | ✅     | 01.10.2026 |
| T7b  | Odporność 2/3: obciążenie stołu, długi czat, rozmiar bazy | ⬜     |            |
| T7c  | Odporność 3/3: wydajność mapy, wyciek pamięci             | ⬜     |            |
| T8   | Przeglądarki, ekrany, pierwszy kontakt, pobieżna regresja | ⬜     |            |
| T9   | Konta MG: rejestracja i izolacja (po etapie „Konta MG”)   | ⬜     |            |
| T10  | Werdykt lokalny (triaż, retest poprawek)                  | ⬜     |            |
| T11  | Smoke test na VPS (po etapie 28), werdykt końcowy         | ⬜     |            |

**Kolejność:** T1 przed wszystkim. T3 → T4 → T5 → T6 po kolei (każdy startuje z punktu
kontrolnego poprzedniego, sekcja 4.4). T2, T7 i T8 wymagają tylko T1 i T3, więc można je
przestawiać. T9 dopiero po nowym etapie „Konta MG” (sekcja 6.5) — do tego czasu scenariusz gra
jednym kontem MG, jak dziś. T10 po wszystkich od T1 do T9. T11 po etapie 28.

**Kolejność prac wokół testów (decyzja MG z 26.09, sesja T1):** T1 → T3–T6 (T2 dowolnie po T3)
→ **refaktoryzacja całości** pod osłoną suity → **etap „Konta MG”** (przepisuje krok 3.1 i część
T2, suitę poprawia się raz) → T9 → T7, T8 → T10 → etap 28 → T11. **Korekta 01.10 (MG):** T7
idzie teraz, przed refaktoryzacją, w trzech częściach a/b/c — pomiary T7b/T7c staną się linią
bazową refaktoryzacji, a T10 powtarza restart i sesje po „Kontach MG”.

## 2. Decyzje MG z 26.09.2026 (podstawa planu)

| sprawa                 | rozstrzygnięcie                                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| środowisko             | wszystkie testy lokalnie na **izolowanej instancji** (osobna baza i uploady, `dev.db` nietknięta); etap 28 jest **warunkiem bety**, a T11 powtarza skrót rozgrywki na VPS |
| automaty               | **stała suita w repo** (`packages/e2e`, Playwright Test, Firefox + Chromium); pełna rozgrywka zostaje testem regresji na refaktoryzację i dalsze etapy                    |
| błędy w trakcie testów | sesja testowa **tylko notuje** (kroki odtworzenia, waga, dowód); poprawki w osobnych sesjach, potem retest (🔁)                                                           |
| boty LLM               | **w pełni**: bot NPC rozmawia na czacie i gra swoją turę w walce pierwszej; w walce drugiej gateway **pada w trakcie** (test łagodnej degradacji)                         |
| zakres bety            | rdzeń **oraz wszystkie cztery obszary dodatkowe**: Sieć, ekonomia i przedmioty, rozwój postaci, narracja i czas — błędy w nich liczą się do bramki tak samo               |
| próg                   | **zero blokerów i zero krytycznych**; poważne tylko z obejściem przy stole, najwyżej pięć, każdy wpisany do „znanych problemów bety”                                      |
| przeglądarki graczy    | **Chrome i Firefox na PC/laptopie**. Edge, Android, Safari i iPad poza zakresem (Safari/iPad: decyzja z 25.09)                                                            |
| sesja próbna z ludźmi  | **nie** — pierwsza sesja bety sama jest playtestem; to, czego automat nie oceni, idzie do listy obserwacji (sekcja 8)                                                     |
| baza bety              | **pusta** — wszystkie dotychczasowe kampanie, sceny, rozmowy, boty i architektury z `dev.db` zostają za burtą; migracji `dev.db` nie testujemy                            |
| liczba graczy          | **do czterech** na grupę plus MG — test obciążenia w 6.3                                                                                                                  |
| materiały              | mapy z `C:\AI\materialy\mapy`, portrety z `C:\AI\materialy\avatary` — wgrywane przez UI do instancji testowej, **nigdy do repo** (sekcja 4.6)                             |
| kości i hak klienta    | zgoda na `VTT_DICE_SCRIPT` w serwerze (4.2) i `window.__vttE2E` w buildzie testowym klienta (4.3)                                                                         |
| konta MG               | **osobne konta MG z otwartą rejestracją — warunek bety** (nowy etap przed 28, testy w T9); każdy MG widzi i steruje tylko swoim; **najwyżej dwie sesje naraz** i **prośba MG o dostęp do AI właściciela** (26.09, trzecia tura) |
| kolejność prac         | T1–T6 → refaktoryzacja → „Konta MG” → T9 → reszta (sesja T1, akapit „Kolejność” w sekcji 1); T1 bez modelu — testy `@llm` pomijane                                        |
| poprawki w T1          | wyjątek od „tylko notuje”: bloker #1 (build `dist/` nie startował) naprawiony w T1, bo blokował samą infrastrukturę — w rejestrze jako „retest OK”                        |
| T2 po T3               | **T2 czeka na T3** (decyzja MG z 26.09, sesja T2): stan do macierzy, własności i kanarków na zimno bierze się z punktu `po-T3`, nie z własnego zasiewu |
| waga `INTERNAL`        | śmieciowy ładunek kończący się `INTERNAL` bez zmian w bazie i u innych graczy = **jeden zbiorczy wiersz B3** z listą zdarzeń; zapis częściowy lub zepsuty stan = B2; pad procesu = B0 |
| brak limitów tempa     | stół przeżył zalew bez limitu = **zadanie Z** dla etapu „Konta MG” (limit na gnieździe per sesja) i dla 28 (Caddy); zdławieni inni gracze = B1, pad = B0 |
| widoczność scen        | **„Knajpa” Dynamiczna + ciemność + pamięć terenu, „Brama” na ręcznej mgle** (decyzja MG z 26.09, sesja T3b) — w Dynamicznej serwer nie sprawdza pola widzenia, więc odmowę ruchu w mgłę (`MOVE_INTO_FOG`) sprawdza T5 na „Bramie” |
| plan ścian             | **realistyczny**, odczytany z obrazów map (`fixtures/maps.ts`); Rzeźnik i Paser to **statyści z kartą**, do których przypięto boty (decyzje MG z 26.09, sesja T3b) |
| triaż #2               | gracz zmieniający własne Cechy po przyjęciu = **B1** (decyzja MG z 26.09, sesja T3b) |
| podział T4             | **T4a** = kroki 4.1–4.5 i punkt `po-T4a` w środku pierwszej rundy, **T4b** = 4.6–4.10 i `po-T4` (decyzja MG z 26.09, sesja T4a) |
| broń w T4              | granat Kowala i pięści Iskry z **własnych wpisów Kompendium MG** — katalog z podręcznika ich nie ma (#17, #18); Zmysł Walki Kowala: Błyskawiczna reakcja 1 + Precyzyjny atak 3; „Cień” w kolejce **od startu, ukryty** (decyzje MG z 26.09, sesja T4a) |
| tura bota              | serwer przepuszcza nielegalną akcję bota = **B1**; tura wisi albo MG nie zamknie jej bez F5 = **B2**; głupia, ale legalna taktyka = obserwacja w sekcji 8 (decyzja MG z 26.09, sesja T4a) |
| triaż #17              | postać bez broni nie uderzy pięścią (brak wpisu Bijatyki) = **B1**, granat bez wpisu (#18) = B2 (decyzja MG z 26.09, sesja T4a) |
| T4a przed T4b          | `po-T4a` powstał ze starego `po-T3` — **najpierw przekalibrowanie T4a** pod obecne `po-T3` (liczby z karty, nie na sztywno), retest #16/#19/#20, świeży `po-T4a`, potem T4b (decyzja MG z 27.09, sesja T4b) |
| przebieg T4b           | rana krytyczna Kowala **z ataku w walce** (Cień, strzał w głowę); **Ochroniarz chwyta Iskrę**, ona broni się ze swojej karty; **Zbir ginie** (granat, nieudany Test Przeżywalności), Ochroniarz zostaje pod progiem ran, **Rzeźnik i Cień uciekają** (ukryci), walkę kończy MG; tura Rzeźnika **ręką MG**; Kowal daje Iskrze **pistolet Zbira** (decyzje MG z 27.09, sesja T4b) |
| triaż #23–#27          | #23 = **B2** (z ukrytą figurą jako pierwszą kartą byłby B1), #24 = **B1** (sąsiad po skosie jest w zasięgu ręki), #25 = **B3**, #26 = **B1** jak #20, #27 = **B1** (gracz wykonuje cudzą akcję) — decyzje MG z 27.09, sesja T4b |
| podział T5             | **T5a** = przygotowanie „Bramy” przez MG (architektura, wieżyczka, strefy, Strażnik z botem, amunicja Kowala), 5.1–5.3 poza walką i `po-T5a` tuż przed inicjatywą; **T5b** = walka 5.4–5.9, 5.10 i `po-T5` (decyzja MG z 27.09, sesja T5a) |
| T5: architektura       | piętra **Hasło → Plik → Czarny LOD (Kruk) → Węzeł kontrolny wieżyczki**, na dnie piętro **Demona** (Diablik), który trzyma węzeł; w walce Olę atakują oba (decyzja MG z 27.09, sesja T5a) |
| T5: pad gatewaya       | **pośrednik TCP w suicie** między instancją a gatewayem — test zrywa i odmawia połączeń w trakcie tury bota, w 5.10 przywraca; prawdziwy gateway i llama-server nietknięte (decyzja MG z 27.09, sesja T5a) |
| T5: Kowal i amunicja   | Kowal wchodzi **ranny, jak skończył T4b** — 6k6 strefy dobiera skrypt kości, żeby przeżył; MG daje mu z katalogu **amunicję przeciwpancerną** do B.C. pistoletu (przeładowanie w 5.9); Iskra strzela zdobycznym pistoletem (decyzja MG z 27.09, sesja T5a) |
| T5: Strażnik i wieżyczka | **nowy statysta „Strażnik” z nowym botem** (Propozycja); wieżyczka strzela sama na wejście w strefę, a po przejęciu węzła Ola **strzela nią w Strażnika, potem ją wyłącza** (decyzja MG z 27.09, sesja T5a) |
| przebieg T5b           | Ola **derezuje Kruka Mieczem** (Kruk atakuje ją raz — darmowym atakiem przy wykryciu); walka kończy się, gdy **Strażnik pada od strzału przeciwpancernego Kowala** — Test Przeżywalności na pasie MG, potem ✕ (decyzje MG z 27.09, sesja T5b) |
| triaż #14              | gracz usuwający własną postać przyjętą do gry = **B1** (decyzja MG z 26.09, sesja T2) |
| gniazdo po wylogowaniu | otwarte gniazdo żyje po wylogowaniu i wygaśnięciu sesji = **B2 + zadanie Z** dla „Kont MG” (decyzja MG z 26.09, sesja T2) |
| unieważnienie zaproszenia | zamyka **tylko nowe wejścia** — nie wyrzuca graczy, którzy już weszli; odcięcie gracza to osobna funkcja (decyzja MG z 26.09, sesja T2) |
| śmieci od MG           | śmieciowe ładunki idą **także w zdarzenia MG** z gniazda MG (pad serwera od MG to też B0), na kopii `po-T3` (decyzja MG z 26.09, sesja T2) |
| próg zalewu            | wiadomość innego gracza albo ruch MG dochodzi w trakcie zalewu po ponad **5 s** = B1 (decyzja MG z 26.09, sesja T2) |
| podział T6             | **T6a** = 6.1–6.5 i `po-T6a`, **T6b** = 6.6–6.9 i `po-T6`, **T6c** = 6.10 (dwa pełne przebiegi od zera i łatanie migotania suity) — decyzja MG z 29.09, sesja T6a |
| T6: eksport i import   | aplikacja nie ma importu całej kampanii (etap 33 świadomie) — T6b testuje to, co jest: eksport kampanii z czatem i bez, import kart i sceny do nowej kampanii na świeżej instancji; brak importu kampanii = **zadanie Z10**, nie błąd (decyzja MG z 29.09, sesja T6a) |
| T6: rozwój i chrom     | Ola bierze **Rolę Medyka** (wieloklasowość), punkt Medycyny w Chirurgię i **operuje Marka** — montaż Cyberoka jej Chirurgią (6.3–6.5 w łańcuchu, 6.4 przed 6.3) (decyzja MG z 29.09, sesja T6a) |
| T6: Paser              | Marek **rozmawia z botem** (`@llm`) i kupuje **oknem handlu**, stronę Pasera prowadzi MG; obok zakup i odmowa w sklepie kampanii (decyzja MG z 29.09, sesja T6a) |
| T6b: leczenie i efekt   | **Iskra stabilizuje Kowala**, potem „+1 dzień” i odpoczynek z okna zegara; efekt na Cesze z **formularza MG** (REF −2 na godzinę, wygaśnięcie co do minuty skokami „+10 min”) — decyzje MG z 30.09, sesja T6b |
| T6b: kronika           | wpis ręczny „tylko MG” z kanarkiem; **streszczenie i screamsheet jawne dla stołu**, jedna relacja NPC przyjęta z propozycji (bez propozycji — MG ustawia ręcznie, obserwacja) — decyzja MG z 30.09, sesja T6b |
| T6b: import           | **obie drogi**: import na pustej instancji bez plików (notujemy, co pęka), potem z plikami z `manifest.files`; odpięte figury i karty jako NPC to zachowanie etapu 33 — dopisek do Z10, nie błąd (decyzja MG z 30.09, sesja T6b) |
| triaż #45              | **cofnięta umowa `boty` z 24.09**: bot i kronikarz mają zwracać się do **postaci** („Kowal”), nie do konta gracza („Marek”) — do poprawki (decyzja MG z 30.09, sesja T6b) |
| triaż #42              | Ustabilizowanie poza walką bez drogi w UI = **B1**; obejście przy stole krótką walką; poprawka ma dać Ustabilizowanie **także poza walką** (decyzja MG z 30.09, sesja T6b) |
| T7: kolejność i podział | **T7 przed refaktoryzacją**, trzy części: **T7a** = opóźnienie, zerwanie, restart, dwie karty, degradacja AI; **T7b** = obciążenie, długi czat, rozmiar bazy; **T7c** = wydajność mapy, wyciek pamięci (decyzja MG z 01.10, sesja T7a) |
| T7: miejsce w suicie    | testy w `specs/40-odpornosc` z tagiem `@odpornosc`, **poza domyślnym `pnpm test:e2e`** (`pnpm test:e2e 40-odpornosc`); pomiary T7b/T7c — skrypty z zapisem liczb (decyzja MG z 01.10) |
| T7: sprzęt graczy       | **głównie PC z kartą graficzną** — pomiar mapy na GPU, SwiftShader tylko jako obserwacja (decyzja MG z 01.10) |
| T7: degradacja AI       | **atrapa gatewaya w suicie** (`fixtures/fake-gateway.ts`) — prawdziwy gateway i llama-server nietknięte, w T7 gateway może być wyłączony (decyzja MG z 01.10) |
| T7: wagi                | utrata zapisanego stanu albo pad = B0; rozjazd klientów, którego nie naprawia F5, albo podwójny rzut/akcja = B1; powrót tylko po F5 albo brak czytelnego „rozłączony” = B2; liczby wydajności poniżej progu = obserwacja (sekcja 8), B2 dopiero przy wyraźnym zacinaniu (propozycja z 01.10 bez sprzeciwu MG) |
| poza betą              | równoległa gra kilku grup naraz i paczka instalacyjna AI dla innych MG (RAG z własnego PDF-a MG) — zaległości w `docs/etapy/zaleglosci.md`, poza tymi testami             |

## 3. Strategia: co testujemy głęboko, a co pobieżnie

Projekt ma już **2237 testów w `shared`, 1228 na serwerze, 286 u klienta i 59 w gatewayu**, a każdy
etap był oglądany w przeglądarce. Mechanika CP RED (rachunek PT, obrażenia, pancerz, rany, Sieć,
PD) jest więc sprawdzona **na poziomie funkcji**. Czego nikt dotąd nie sprawdził:

1. **Spięcia wszystkiego naraz** — jedna kampania od zera, dwóch nowych graczy, dwie sceny,
   dwie walki; stan jednej funkcji wchodzi do następnej (łup z walki pierwszej → handel → PD → awans
   → walka druga na zmienionej karcie).
2. **Czystej bazy.** Wszystkie oględziny szły na `dev.db`, gdzie od lipca narastały dane, poprawki
   ręczne i sceny poligonowe. Beta wystartuje z **pustej** bazy (decyzja MG), której nikt nie widział
   od etapu 02 — pierwsze boty, architektury Sieci i sceny powstaną w niej od zera.
3. **Wycieku danych przez cały przebieg**, a nie per funkcja — każdy zapis MG w trakcie rozgrywki
   jest potencjalnym źródłem przecieku do gracza.
4. **Wielu graczy naraz, w dwóch silnikach, z opóźnieniem sieci i restartem serwera.**
5. **Kopii zapasowej na prawdziwym, rozegranym stanie** (odtworzenie i porównanie z oryginałem).

**Zasada pobieżności:** obszar z testami jednostkowymi i zamkniętymi oględzinami dostaje w E2E
**jedną szczęśliwą ścieżkę i jedną odmowę**, bez przeglądania wariantów reguł. Głęboko testujemy
punkty styku (gniazdo ↔ magazyn klienta ↔ baza), uprawnienia, trwałość i widoczność. Rozbieżność
z podręcznikiem sprawdzamy w `docs/etapy/decyzje-i-uproszczenia.md`, **zanim** zapiszemy ją jako błąd.

**Piramida:**

| warstwa                   | narzędzie                                                       | gdzie                                      |
| ------------------------- | --------------------------------------------------------------- | ------------------------------------------ |
| linia bazowa (istniejące) | `pnpm test`, `tsc --noEmit`, ESLint, Prettier, `pytest`, `ruff` | T1, T9 — bez zmian w testach               |
| API HTTP i gniazdo bez UI | Playwright `request` + `socket.io-client`                       | `packages/e2e/specs/35-bezpieczenstwo`     |
| E2E w przeglądarce        | Playwright Test, wiele kontekstów i silników                    | `packages/e2e/specs/30-rozgrywka` i dalej  |
| oględziny eksploracyjne   | Playwright MCP (Firefox, Chromium), claude-in-chrome            | T8 i każde „coś wygląda dziwnie”           |
| pomiary                   | skrypt `node` z biblioteką `playwright`                         | T7                                         |

## 4. Środowisko testowe

### 4.1. Instancja izolowana

Nie wolno dotykać `dev.db` ani `uploads/` MG. Instancja E2E ma własne wszystko:

| parametr           | wartość w E2E                                                                       | uwaga                                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`     | `file:./e2e.db` (w `packages/server`, łapie się na `*.db` w `.gitignore`)           | przed startem `prisma migrate deploy` na pustym pliku                                                           |
| `UPLOADS_DIR`      | `../../.e2e/uploads`                                                                | nowy katalog w `.gitignore`                                                                                     |
| `BACKUP_DIR`       | `../../.e2e/backups`                                                                |                                                                                                                 |
| `BOT_DECISION_LOG` | `../../.e2e/bot-decisions.jsonl`                                                    |                                                                                                                 |
| `DATA_PRIVATE_DIR` | **prawdziwe** `../../data/private`                                                  | tylko do odczytu — beta gra na kompendium, nie na próbce                                                        |
| `PORT`             | `3101`                                                                              | `3001` i `5173` zostają dla `pnpm dev` MG (pułapka `EADDRINUSE` w `ogledziny`)                                  |
| `GM_PASSWORD`      | losowe przy każdym starcie, tylko w pamięci procesu testów                          | **nigdy** z tym env na `dev.db` (pułapka w `ogledziny`)                                                         |
| `COOKIE_SECRET`    | losowe                                                                              | domyślne `dev-secret-change-me` sprawdza T2 pod kątem produkcji                                                 |
| `AI_GATEWAY_URL`   | `http://127.0.0.1:8100` (prawdziwy gateway)                                         | testy oznaczone `@llm` pomija się, gdy gateway nie odpowiada na `/health`                                       |
| klient             | **build produkcyjny** (`vite build`) + `vite preview` na `:4173` z proxy na `:3101` | bliżej VPS niż serwer deweloperski; wymaga, by cel proxy w `vite.config.ts` brał się z env (drobna zmiana w T1) |

Serwer E2E startuje z **`dist/`** (`pnpm --filter @vtt/server build`, potem `node dist/main.js`),
a nie z `tsx watch` — zmiana w `shared` w trakcie testów nie restartuje go (pułapka HMR w `ogledziny`),
a przy okazji sprawdzamy, że build produkcyjny w ogóle działa. To pierwszy test etapu 28.

### 4.2. Kości w testach

Rzuty są kryptograficzne (`realtime/dice-rng.ts`), a scenariusz potrzebuje zdarzeń, które
wypadają rzadko (rana krytyczna, trafienie granatem, nieudany Death Save). Dwie warstwy:

1. **Asercje niezmiennicze** — domyślnie. Test nie sprawdza „trafił”, tylko „karta rzutu u MG, Marka
   i Oli ma ten sam wynik co `ChatMessage` w bazie; PW celu spadły dokładnie o obrażenia minus SP;
   ablacja pancerza o 1”. Działa z dowolnym wynikiem.
2. **Skrypt kości** — tylko tam, gdzie scenariusz musi przejść przez konkretną gałąź. Zmienna
   `VTT_DICE_SCRIPT` (plik z kolejką wymuszonych wartości) czytana przez serwer **wyłącznie**, gdy
   `NODE_ENV !== 'production'`, z testem jednostkowym, że w produkcji jest ignorowana. To zmiana
   w kodzie serwera — **MG zgodził się 26.09**. Robi się ją w T1, z testem jednostkowym i wpisem
   w umowach `kosci`.

### 4.3. Suita `packages/e2e`

```
packages/e2e/
  playwright.config.ts     workers: 1 (jedna instancja, stan wspólny), timeout pod LLM
  instance/                start i stop instancji (4.1), punkty kontrolne (4.4), cli.ts do ręcznego sterowania,
                           hold.ts — instancja trzymana procesem do oględzin MCP (pułapka w `testy`),
                           gateway-proxy.ts — pośrednik TCP do AI Gatewaya: zerwanie w trakcie `POST /chat` (T5b)
  fixtures/
    actors.ts              cast.mg(), cast.gracz('Ola', 'firefox', token) — osobne przeglądarki, konteksty, gniazdo
    network.ts             T7: pośrednik gniazda karty (`routeWebSocket`) — opóźnienie w kolejce i zerwanie sieci
    fake-gateway.ts        T7: atrapa AI Gatewaya — llama-server martwy (503) albo `/chat` milczący 3 min
    sniffer.ts             zapis wszystkich ramek gniazda i odpowiedzi HTTP każdego gracza + kanarki (4.5)
    canvas.ts              klik, prawy klik, przeciąganie i marsz po płótnie Pixi we współrzędnych sceny
    db.ts                  odczyt bazy tylko do asercji (node:sqlite), odcisk stanu do punktów kontrolnych
    llm.ts                 znacznik @llm, pomijanie przy martwym gatewayu, dłuższe czasy oczekiwania
    creator.ts             kreator gracza przez UI: kubek po jednej kości, umiejętności, sklep, portret z kadrami
    scene.ts               kamera nad sceną, łańcuchy ścian, światła, pinezki, osłony, figury, stepper karty
    maps.ts                plany ścian map „Knajpa” i „Brama” (same liczby, obrazy zostają poza repo)
    materials.ts           mapy i portrety z `VTT_E2E_MATERIALS`, kopie-kanarki w `.e2e/tmp`
    socket.ts              `emitAck` — surowa intencja z gniazda aktora i odpowiedź serwera
    security.ts            T2: rejestr zdarzeń serwera (`EVENTS`), śmieciowe ładunki, log serwera, surowe gniazdo, PNG
    nocna-zmiana.ts        start z `po-T3` (martwy gateway), id po nazwach, logowanie MG i gracza przez API
    table.ts               czat, rzut kubkiem, kampania i zaproszenie przez API
    walka.ts               T4: stan walki z bazy, rzut i czekanie na wiersz, tury, celowanie, karty czatu
                           z rozróżnieniem liter (`chatCards`, `freshCard`), kamera bliżej (`zoomAt`)
    brama.ts               T5: lista scen MG, statysta z kartą, bot, mgła prostokątem, strefy bronione,
                           architektura i run z bazy (`architecture`, `runOf`)
    vtt-e2e.d.ts           kształt haka window.__vttE2E (kopia z klienta)
  specs/
    00-baseline/           build, start, /health, pusta baza, 66 umiejętności, hak poza buildem produkcyjnym
    01-dym/                test dymny T1: MG Chromium + Ola Firefox, czat, kubek, WebGL, punkt kontrolny
    30-rozgrywka/          T3–T6, `test.describe.serial`, każdy plik startuje z punktu kontrolnego
    35-bezpieczenstwo/     T2: trasy HTTP, gniazdo (role, własność, śmieci, zalew), kanarki na zimno —
                           każdy plik odtwarza `po-T3` sam, więc w pełnym przebiegu idzie po T3–T6
    40-odpornosc/          T7, poza domyślnym przebiegiem: `pnpm test:e2e 40-odpornosc` (albo `--grep @odpornosc`)
    50-przegladarki/       T8
```

Uruchamianie: `pnpm test:e2e` (całość), `pnpm test:e2e --grep @szybkie` (bez LLM i bez długich
przebiegów, cel: poniżej 10 minut). Zmienne: `E2E_FROM=po-T3` (start z punktu kontrolnego),
`E2E_SKIP_BUILD=1` (bez buildu), `E2E_HEADED=1` (okna przeglądarek na ekranie; domyślnie headless —
T1 sprawdził, że WebGL 2 i `requestAnimationFrame` działają tak w obu silnikach; od T3b Chromium
startuje z `channel: 'chromium'`, bo domyślny headless renderuje programowo — pułapka w `testy`). Po przerwanym
przebiegu: `pnpm --filter @vtt/e2e instance stop`. Klient E2E buduje się do `.e2e/client-dist`,
więc zwykłego `packages/client/dist` nie nadpisuje. Zasady pisania wynikające z pułapek `ogledziny`:

- Każdy aktor ma **własne okno na wierzchu** (Playwright Test, nie karty w tle) — inaczej `rAF`
  i timery dławią się do 1 Hz, a karty rzutów spóźniają się o `MAX_ROLL_MS`.
- `window.confirm` przechwytuje fixture **przed** każdym niszczącym kliknięciem.
- Klik w płótno zawsze przez `fixtures/canvas.ts` (świat → ekran z kamery), nigdy z pikseli zrzutu;
  klik w puste pole przy zaznaczonej figurze to rozkaz marszu.
- Filtry czatu gracza włączone wszystkie na starcie (odmowy lądują w kategorii „Stół”).
- Pozycję figury po marszu sprawdza się w bazie, nie zrzutem.
- Do odczytu stanu klienta: mały hak `window.__vttE2E` (kamera, magazyny) **tylko w buildzie
  `--mode e2e`** (zgoda MG z 26.09). Wpis w umowach `ui`, żeby nikt nie wciągnął go do zwykłego
  buildu. Stan serwera czyta się dodatkowo osobnym gniazdem `socket.io-client` z ciasteczkiem
  kontekstu (sprawdzone 25.09).

### 4.4. Punkty kontrolne

Rozgrywka jest za długa na jedno okno kontekstu, więc każdy etap T3–T6 kończy się **punktem
kontrolnym**: `snapshot` bazy E2E i kopia `.e2e/uploads` do `.e2e/checkpoints/po-T<n>/`. Następny
etap zaczyna od odtworzenia punktu (skrypt `restore`) — nie trzeba powtarzać kreatora, żeby
przetestować walkę. Przy okazji **każde przejście etapu testuje kopię i odtworzenie na świeżym
stanie**. Pełny przebieg `pnpm test:e2e` idzie od zera, bez punktów.

### 4.5. Kanarki i podsłuch (wyciek danych)

Każde pole, które widzi wyłącznie MG, scenariusz wypełnia napisem-kanarkiem z unikalnym kodem, np.
`KANAREK-MG-notatka-sceny-7F3A`. Podsłuch zapisuje **każdą ramkę gniazda i każdą odpowiedź HTTP**
u Marka i Oli przez cały przebieg; po każdym kroku asercja: żaden kanarek z listy „tajne w tej chwili”
nie pojawił się u gracza. Kanarek, który zostaje ujawniony zgodnie z zasadami (odsłonięta figura,
handout pokazany graczowi, pokazana karta), przechodzi z listy „tajne” na „jawne” w tym samym kroku.

Kanarki w scenariuszu (lista startowa, porównana w T1 z umowami `czat`, `statysta`, `siec`, `mapa` —
wynik pod listą):
ukryta figura na warstwie MG i jej nazwa, notatki MG sceny i figury, niewidoczne ściany/obiekty poza
wzrokiem gracza (nieodsłonięta mgła), szept MG → Marek (nie może trafić do Oli) i szept Ola → MG
(nie może trafić do Marka), prompt i sekret bota NPC, dziennik decyzji bota, niewidoczne piętra i hasła
architektury Sieci, zawartość przeszukiwanego ekwipunku przed przeszukaniem, rzut ukryty MG, karta
postaci Marka w części, której Ola nie ma widzieć, handout nieudostępniony, wpis dziennika tylko dla MG,
nieprzyznane jeszcze PD, PW i statystyki statystów — **o ile** umowa `statysta` mówi, że gracz ich nie widzi.

**Wynik porównania z umowami (T1, 26.09):**

- `statysta`: **cudze PW nie opuszczają serwera** (`observedWoundState`) — PW i profil statysty są
  kanarkiem. **Rany** statysty jadą publicznie (`TokenView.injuries`) — to **nie** kanarek. Karta
  statysty jedzie też do **właściciela figury** — gracz prowadzący gangera może ją widzieć.
- `mapa`: **prawdziwa nazwa figury z aliasem** (`Token.publicName`) — kanarek dopisany; gracz widzi
  alias także w kartach czatu (`tokenTableName`). Miejsce startu (`Scene.spawn`) czyta kamera gracza
  — nie kanarek, choć chorągiewkę rysuje tylko MG.
- `czat`: rzut z tabeli **cichy** (`gmrolltable`) obok `gmroll` — kanarek dopisany. Dopiero „Pokaż
  stołowi” dokłada wiersz publiczny (kanarek przechodzi na jawne).
- `siec`: umowa ma jeden wpis (hak Programu) — lista z planu (piętra, hasła) zostaje bez zmian.

### 4.6. Materiały: mapy i portrety

Źródło: `C:\AI\materialy\mapy` (13 plików, 28 MB) i `C:\AI\materialy\avatary` (41 portretów, 36 MB),
wskazywane zmienną `VTT_E2E_MATERIALS` (domyślnie `C:/AI/materialy`). Suita **wgrywa je przez UI**
(upload mapy, żetonu, portretu) do `.e2e/uploads` i nigdy nie kopiuje do repo — repozytorium jest
publiczne. Brak katalogu = testy zależne od materiałów pomijają się z czytelnym powodem, a nie
padają. Przydział w scenariuszu:

| do czego                            | plik                                              | uwaga                                                     |
| ----------------------------------- | ------------------------------------------------- | --------------------------------------------------------- |
| scena 1 „Knajpa”                    | `mapy/SmallRestaurant-33x24.png` (1470 × 1070)    | kratka 33 × 24 z nazwy pliku; drzwi, okna, ciasne wnętrze |
| scena 2 „Brama”                     | `mapy/IndustrialAreaGate-40x30.png` (1448 × 1086) | kratka 40 × 30; brama pod barierę, otwarta przestrzeń     |
| lombard Pasera (pobieżnie, T8)      | `mapy/Pawn_Shop-24x18.png`                        | trzecia scena tylko do testu przełączania i uploadu       |
| portret Marka / Oli                 | dwa różne `avatary/avatar*.png`                   | kadr żetonu i osobny kadr banera                          |
| portrety statystów, botów, „Cienia” | kolejne `avatary/avatar*.png`                     | biblioteka portretów MG, ponowne użycie tego samego pliku |
| wydajność (T7)                      | `data/public/maps/test-map-4096.png`              | jedyna mapa 4096 px                                       |

## 5. Scenariusz pełnej rozgrywki „Nocna zmiana”

Obsada: **MG** w Chromium, **Marek** (gracz A) w Chromium, **Ola** (gracz B) w **Firefoksie** —
gracz w innym silniku niż MG, zgodnie z zasadą oględzin. Wszystko robi się **przez UI**, chyba że
wiersz mówi inaczej; stan sprawdza się w bazie i u wszystkich trzech aktorów.

Dopóki nie ma etapu „Konta MG”, scenariusz gra jedynym kontem MG (`GM_PASSWORD` instancji). Po tym
etapie krok 3.1 zmienia się w **rejestrację nowego MG** przez formularz, a T9 dokłada drugiego MG.

### 5.1. T3 — Kampania, gracze, postacie, sceny, figury

**Podział (decyzja MG z 26.09, sesja T2→T3):** T3a to kroki 3.1–3.8 i punkt kontrolny `po-T3a`
(plik `30-rozgrywka/t3a-*.spec.ts`), T3b — kroki 3.9–3.15 i punkt `po-T3` (plik `t3b-*.spec.ts`,
startuje z `po-T3a`). T2 czeka na `po-T3`.

| #    | krok                                                                                                                                                            | sprawdzamy                                                                                            |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 3.1  | MG loguje się na pustej instancji; ekran powitalny przy braku kampanii                                                                                          | brak błędów w konsoli poza znanymi (401 przed zalogowaniem), sensowny stan pusty                      |
| 3.2  | MG zakłada kampanię „Nocna zmiana”, ustawia poziom dostępności sklepu, datę startową kalendarza                                                                 | kampania aktywna, kalendarz na dacie startowej                                                        |
| 3.3  | MG wystawia dwa zaproszenia; Marek i Ola wchodzą z linków pod imionami „Marek” i „Ola”                                                                          | konta graczy, członkostwo, gracz widzi mapę powitalną albo pusty stół (brak sceny)                    |
| 3.4  | Marek prosi o zgodę na postać; MG zgadza się z warunkami: **Krawędziarz (Na skróty)**, Ranga standardowa                                                        | znacznik „Czeka na MG” (licznik w tytule), przejście z kafla do decyzji                               |
| 3.5  | Ola prosi; MG: **Kompletny Pakiet (Wyliczanie)**, z pulą umiejętności                                                                                           | warunki zgody docierają do kreatora Oli                                                               |
| 3.6  | Marek tworzy **Solo**: Cechy przez kubek, Ścieżka Życia, wyposażenie startowe, ksywa, portret z `avatary/` (4.6), kadr żetonu i banera                          | karta czeka na zatwierdzenie; rzuty kreatora po jednej kości; przerzut tylko przez MG                 |
| 3.7  | Ola tworzy **Netrunnera** z cyberdekiem i Programami; w trakcie **F5 w połowie Ścieżki Życia**                                                                  | szkic przeżywa F5 bez utraty wyborów                                                                  |
| 3.8  | MG przegląda obie karty i „Przyjmij do gry”                                                                                                                     | karty odblokowane, 66 umiejętności (nie 42 z próbki), gracz nie edytuje pól zablokowanych             |
| 3.9  | MG zakłada scenę **„Knajpa”** z `SmallRestaurant-33x24.png`, kratka 33 × 24, ściany, **drzwi** i **okno**, dwa światła, ciemność, mgła                          | scena w podglądzie niewidoczna dla graczy (kanarek w nazwie sceny do chwili aktywacji)                |
| 3.10 | MG zakłada scenę **„Brama”** z `IndustrialAreaGate-40x30.png`, kratka 40 × 30, ściany, osłona, **bariera z bramą**, punkt dostępu                               | druga scena istnieje, gracze jej nie widzą                                                            |
| 3.11 | Nowe figury: żetony i portrety z `avatary/`, dwóch statystów z `statBlock`, **ukryta figura** „Cień” na warstwie MG (kanarek), figury graczy związane z kartami | właściciele figur, klonowanie statysty, statysta jako karta                                           |
| 3.12 | MG tworzy **bota NPC „Rzeźnik”** (sekret w prompcie = kanarek), tryb autonomii w walce, i bota-handlarza „Paser”                                                | bot dostępny, sekret nie wychodzi do graczy                                                           |
| 3.13 | Aktywacja „Knajpy”; `playerMoveLocked` zdjęte; gracze chodzą klikiem po odsłoniętym, otwierają drzwi, patrzą przez okno                                         | mgła i widoczność u każdego osobno, ruch w mgłę odmówiony, pamięć terenu po F5                        |
| 3.14 | Marek rozmawia z Paserem na czacie; Ola szepcze do MG; MG szepcze do Marka; MG pokazuje handout tylko Oli                                                       | odpowiedź bota po polsku, szepty i handout widoczne wyłącznie adresatom (kanarki)                     |
| 3.15 | **Punkt kontrolny `po-T3`**                                                                                                                                     | odtworzenie punktu na czystym katalogu daje ten sam stan (liczba wierszy kluczowych tabel, hash kart) |

### 5.2. T4 — Walka pierwsza („Knajpa”)

Strony: Marek i Ola kontra dwaj statyści i bot „Rzeźnik”; „Cień” ukryty do połowy walki.

**Podział (decyzja MG z 26.09, sesja T4a):** T4a to kroki 4.1–4.5 i punkt `po-T4a` w turze Cienia
(plik `30-rozgrywka/t4a-*.spec.ts`), T4b — kroki 4.6–4.10 i `po-T4` (plik `t4b-*.spec.ts`, startuje
z `po-T4a`). Przesunięcia z T4a do T4b: **strzał przez ścianę** (w 4.2 zamiast niego ukryty cel —
`TOKEN_NOT_FOUND`; ściana dopiero na odsłoniętym Cieniu w kuchni, za zamkniętymi drzwiami) i **cios
pięścią, który trafia** (w 4.3 tylko odmowa „za daleko” — Iskra stoi na tarasie).

**Przebieg T4b (sesja 27.09):** koniec 1. rundy (Cień otwiera drzwi wahadłowe kuchni, strzela
Kowalowi w głowę i je zatrzaskuje), runda 2 (strzał przez ścianę — gracz `TOKEN_NOT_FOUND`, bo
Cienia w ciemnej kuchni nie widzi, MG `NO_LINE_OF_FIRE`; granat w Zbira i Ochroniarza; Iskra trafia
pięścią Rzeźnika; Rzeźnik ręką MG; Test Przeżywalności Zbira; bieg Ochroniarza), runda 3
(Pochwycenie, wezwanie MG do Testu), koniec walki, łup i przekazanie. Rzeźnika, którego miejsce po
turze bota wybiera żywy model, MG na starcie T4b stawia w drzwiach tarasu.

| #    | krok                                                                                                  | sprawdzamy                                                                                 |
| ---- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 4.1  | MG włącza tryb turowy, inicjatywa                                                                     | czarny pas kolejki u wszystkich w tej samej kolejności, wynik z bazy                       |
| 4.2  | Tura Marka: ruch klikiem w budżecie metrów, strzał przez ścianę (odmowa), strzał z osłony do statysty | linia strzału, PT z dystansu, SP i ablacja, PW statysty, karta rzutu identyczna u trojga   |
| 4.3  | Tura Oli: **prośba o Test** do MG (przycisk **i** Alt+klik — dwie ścieżki), potem atak wręcz          | kafel u MG, wynik w czacie, odmowa „za daleko” widoczna w kategorii „Stół”                 |
| 4.4  | Tura bota „Rzeźnik” (`@llm`): „Graj turę”, propozycja, akceptacja MG                                  | ruch w budżecie, atak zgodny z zasadami, bez przekroczenia Akcji; czas odpowiedzi zapisany |
| 4.5  | MG odsłania „Cienia” w trakcie rundy                                                                  | kanarek „Cienia” przechodzi na jawne dopiero teraz; figura pojawia się u graczy bez F5     |
| 4.6  | Granat lub ogień ciągły Marka w grupę statystów (Zmysł Walki Solo, jeśli dotyczy)                     | obszar, amunicja, obrażenia wielu celów naraz                                              |
| 4.7  | Rana ciężka i **rana krytyczna** na Marku (skrypt kości albo narzędzie MG), Death Save statysty       | kara za rany w jednym miejscu, statusy na figurze, monity na początku tury                 |
| 4.8  | **Wezwanie MG do Testu** dla Oli; Pochwycenie w zwarciu                                               | wezwanie dochodzi tylko do Oli, zwarcie widoczne na figurach                               |
| 4.9  | Koniec walki; przeszukanie ciała statysty i łup; przekazanie przedmiotu Marek → Ola                   | ekwipunek po obu stronach, zawartość przed przeszukaniem tajna (kanarek)                   |
| 4.10 | **Punkt kontrolny `po-T4`**                                                                           | jak 3.15                                                                                   |

### 5.3. T5 — Sieć i walka druga („Brama”)

MG przełącza scenę. Przy Bramie: statysta-ochroniarz (bot `@llm`), wieżyczka związana z węzłem
kontrolnym, broniona strefa, architektura Sieci o trzech piętrach (hasło, plik, węzeł wieżyczki,
Demon) — nieodkryte piętra to kanarki.

**Podział (decyzja MG z 27.09, sesja T5a):** T5a to przygotowanie „Bramy” przez MG i kroki
5.1–5.3 poza walką, punkt `po-T5a` tuż przed inicjatywą (plik `30-rozgrywka/t5a-*.spec.ts`);
T5b — walka 5.4–5.9, 5.10 i `po-T5` (plik `t5b-*.spec.ts`, startuje z `po-T5a`). Strzał przez
barierę z 5.2 przechodzi do T5b (to już walka).

**Przebieg T5a (sesja 27.09):** MG ogląda „Bramę” i stawia „Wieżyczkę” (statysta, B.C. pistolet,
bez Uniku) pod narożnikiem magazynu oraz „Strażnika” (30 PW, C. pistolet) przy budce szlabanu;
buduje w edytorze architekturę „Ochrona bramy” (Hasło PT 8 → Plik PT 6 → Czarny LOD „Kruk” →
Węzeł kontrolny PT 10 z urządzeniem „Wieżyczka nad placem” → Demon „Diablik”), wiąże z nią ukryte
gniazdo, rysuje dwie ukryte strefy (ostrzał wieżyczki ze stanowiskiem i podłogę elektryczną
między bramą a budką), zakłada bota „Strażnik” (Propozycja, w scenie „Brama”) i dopisuje
Kowalowi amunicję przeciwpancerną. Po aktywacji **MG stawia figury graczy ręką** (⊕ „Postaw na
scenie” — Kowal i Iskra mają figury w „Knajpie”, więc #9 ich nie przenosi), odsłania drogę z linią
bramy i pas placu; **Marek otwiera bramę swoją klamką** (od poprawki #30; wcześniej robił to MG)
i wchodzi na plac, Ola Skanerem znajduje gniazdo, podłącza się, łamie hasło i rozpoznaje Plik.
MG wiąże strefę wieżyczki z węzłem **polem „Węzeł kontrolny” na karcie strefy** (od poprawki
#33), żeby T5b sprawdził most serwera. Odmowa skoku w mgłę ma dla klienta kod `MOVE_INTO_FOG`
także poza walką (od #29), a karta odmowy ze zdaniem powstaje tylko w walce.

**Przebieg T5b (sesja 27.09):** serwer instancji woła gateway przez pośrednika TCP
(`instance/gateway-proxy.ts`). MG odsłania plac; Kowal wchodzi w strefę wieżyczki — **wieżyczka
strzela sama** (Wartość bojowa 14, obrażenia rzuca MG, 4k6 = 4 na kurtkę OB 12). Tryb turowy:
Kowal, Iskra, Strażnik, a „Demon wykrywa intruza” stawia Diablika na czele kolejki. **Runda 1:**
Demon strzela wieżyczką w ciało Oli **przez barierę** (−4 „Cel zasłonięty barierą”, karta obrażeń
z OB bariery 20 — krok 5.2) i trafia ją Pafem; Kowal Biegiem wchodzi na **podłogę elektryczną**
(6k6 przy wejściu i na końcu tury, pancerz trzyma; „Ciało obce” −5 po marszu 16 m — 5.7); Ola
zjeżdża do Kruka (MG: „LOD wykrywa intruza”, darmowy atak 1k6 w mózg), derezuje go Mieczem, zjeżdża
na węzeł i **przejmuje go Kontrolą** (węzeł „użyty w tej Turze” przez Demona blokuje obsługę
urządzeń, nie przejęcie); tura bota Strażnika — **pośrednik tnie zaraz po `POST /chat`**, bot
„offline”, MG gra ręką (5.6). **Runda 2:** Demon nie odbiera węzła; Kowal schodzi z podłogi
i ładuje **amunicję przeciwpancerną** (Akcja); **F5 u Oli** w jej turze (5.8); Ola strzela wieżyczką
w Strażnika (30 → 14, rana krytyczna). **Runda 3:** strzał przeciwpancerny Kowala (pancerz −2)
kładzie Strażnika, Ola **wyłącza wieżyczkę**, Test Przeżywalności na pasie MG, ✕. Po walce Kowal
wchodzi w strefę wyłączonej wieżyczki — nic nie strzela (most #33); pośrednik wraca, Strażnik
odpowiada po polsku bez restartu serwera (5.10). Okna runu MG i Oli scenariusz odsuwa (#34).

| #    | krok                                                                                   | sprawdzamy                                                                                  |
| ---- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 5.1  | Aktywacja sceny                                                                        | obaj gracze przechodzą bez F5, stan „Knajpy” zachowany w bazie; ruch w mgłę odmówiony (`MOVE_INTO_FOG`, przeniesione z 3.13) |
| 5.2  | Marek przez **bramę w barierze**; strzał przez barierę z SP; figura zasłonięta barierą | ruch, SP bariery dla strzału, kara za cel                                                   |
| 5.3  | Ola podłącza się do punktu dostępu, run: winda, Akcje Sieciowe, hasło, plik            | piętra odsłaniane po kolei (kanarki), budżet Akcji Sieciowych                               |
| 5.4  | Walka druga: tryb turowy, Ola w Sieci i Marek na mapie w tej samej kolejce             | kolejka obejmuje obu, Czarny LOD lub Demon atakuje Olę, obrażenia w Sieci i w ciele         |
| 5.5  | Ola przejmuje węzeł i wyłącza wieżyczkę                                                | wieżyczka na mapie zmienia zachowanie                                                       |
| 5.6  | Tura bota-ochroniarza (`@llm`); **w trakcie generowania MG zabija gateway**            | bot oznaczony jako niedostępny u MG, walka toczy się dalej ręką MG, żadnego wiszącego stanu |
| 5.7  | Marek wchodzi na bronioną strefę                                                       | obrażenia strefy przy wejściu i na końcu tury                                               |
| 5.8  | **F5 u Oli w trakcie walki** (w Sieci)                                                 | powrót do tego samego stanu runu i kolejki                                                  |
| 5.9  | Amunicja specjalna i przeładowanie, koniec walki                                       | stan broni, magazynki                                                                       |
| 5.10 | Gateway wraca                                                                          | boty dostępne bez restartu serwera VTT                                                      |
| 5.11 | **Punkt kontrolny `po-T5`**                                                            | jak 3.15                                                                                    |

### 5.4. T6 — Po walkach, ekonomia, rozwój, czas, kopie

**Podział (decyzja MG z 29.09, sesja T6a):** T6a to kroki 6.1–6.5 i punkt `po-T6a` (plik
`30-rozgrywka/t6a-*.spec.ts`, startuje z `po-T5`), T6b — 6.6–6.9 i `po-T6` (plik `t6b-*.spec.ts`,
startuje z `po-T6a`), T6c — 6.10. Import całej kampanii nie istnieje (etap 33): 6.8 sprawdza eksport
kampanii i import kart oraz sceny, brak importu kampanii to zadanie Z10.

**Przebieg T6a (sesja 29.09):** Ola „Odłącz się” kończy run na „Bramie”, MG aktywuje „Knajpę” i sam
przechodzi do niej „Pokaż” (MG zostaje przy podglądzie, gracze idą za aktywną). Kowal (8, 8) i Iskra
(8, 9) stoją obok siebie od końca T4b. **6.1:** Marek „Handel…” z karty Kowala, Ola przyjmuje z doku;
Marek kładzie „Chip z kodem do chłodni” (łup Zbira — od tej chwili jawny dla Oli), surowa oferta Oli
ponad portfel → `NOT_ENOUGH_EDDIES`, Ola 300 ed, Marek się zgadza, Ola podbija na 350 — zgoda Marka
spada sama, dwie zgody → wymiana (suma eurodolców i liczba przedmiotów stała, dwa wiersze `transfer`).
**6.2:** Marek kupuje w Kompendium „Zestaw wytrychów” (20 ed, poziom 2); „Militech Ronin” (poziom 3)
ma wyszarzone „Kup”, surowe `economy:buy` → `SHOP_TIER_LOCKED:3:2`. Kowal podchodzi do baru (12, 13),
MG „Dodaj za darmo” daje Ronina karcie Pasera, Marek pyta Pasera na czacie (`@llm`), potem „🤝 Handluj…”
z menu figury Pasera, MG przyjmuje za NPC-a i kładzie Ronina, Marek płaci 400 ed. **6.4:** MG „✦ Przyznaj
wszystkim” 500 PD; Marek: Zmysł Walki 4 → 5 (300 PD) i Broń krótka o jeden (poziom × 20); „Podnieś:
Zmysł Walki na poziom 6” wyszarzone, surowe `LEVEL_SKIP`, `NO_POINTS`, łata PD karty → `FORBIDDEN`.
Ola: „Nowa Rola” → „Medyk — 60 PD” (Netrunner 4 zostaje w `formerRoles`), punkt Medycyny w Chirurgię
(Chirurgia 2). **6.3/6.5 (od 30.09, poprawka #41):** montaż wprost z Medykiem innego gracza dalej
`CHARACTER_NOT_FOUND`; Marek w Kompendium: Cyberoko, cel Kowal, chirurg „Iskra — Chirurgia 2 ·
poproś”, „Zainstaluj — 100 ed” → karta prośby na czacie; Ola (Firefox) widzi cenę domyślną 100 ed
w polu, wycenia na 150 ed, Marek „Zgadzam się na 150 ed” — Test montażu za Iskrę (skrypt 9 + TECH
+ Chirurgia vs PT 15), Utrata Człowieczeństwa 2k6 = 7 (40 → 33), 150 ed z konta pacjenta na kartę
Iskry (`cyberware` −150, `transfer` +150); obie karty rzutów u Marka i Oli z wynikiem z bazy.
**#40:** lista odbiorców przelewu Marka ma Iskrę, a nie Pasera; id karty Pasera nie dociera do Marka.

**Przebieg T6b (sesja 30.09, `t6b-czas-kopie.spec.ts`, 18 testów, ~3 min od `po-T6a`):** **6.6** MG na karcie Kowala „Efekty czasowe”: REF −2 „Kac po Knajpie” na godzinę; Marek rzuca Broń krótką — w rozbiciu wiersz „Kac po Knajpie −2” obok „Poważnie ranny −2” i pancerza; pięć skoków „+10 min” — efekt trwa, szósty (60 min) go zdejmuje, wiersz „Efekty wygasły” u trojga. Ola klika „Ustabilizowanie” na pasku Iskry poza walką — nic (**#42**, `test.fail`); „Dzień odpoczynku” Kowala wyszarzony, surowe `character:rest` → `refusal: notStabilized`. Obejście: MG „Walka” → „Tylko postacie graczy” → inicjatywa (Iskra 16, Kowal 7), Iskra stabilizuje Kowala (skrypt 9 + TECH 7 + Pierwsza pomoc 2 = 18 vs PT 13), MG ✕. „+1 dzień” → „Odpoczynek — minęła doba”: Kowal +8 PW (= BODY), Iskra bez Ustabilizowania bez zmian. **6.7** wpis ręczny „tylko MG” z kanarkiem; Marek dziękuje Paserowi w roli (`@llm`); licznik „Zakończ sesję i streść” u MG stoi (**#43**, `test.fail`) — obejście: zakładka od nowa; streszczenie 6 wypowiedzi w 12–21 s, jawne dla stołu; propozycji relacji brak w dwóch próbach → MG ustawia Paser → Kowal +1 z gniazda (`relation:set`), `relation:upsert` nie dociera do graczy. Screamsheet „strzelanina pod bramą strefy przemysłowej” w ~10 s, zapis, dopiero „Wszystkim” pokazuje go obojgu. **6.8a** „Kopie”: zrzut z czatem 253 KB, bez czatu 99 KB (manifest mówi, czego nie ma), karty Kowala i Iskry, scena „Brama”; gracz dostaje 403. **6.9** restart z `BACKUP_INTERVAL_MINUTES=1` — kopia `start` i po minucie `timer` (12 plików), panel „kopia co 1 min”; odtworzenie kopii `timer` na czystym katalogu (bez bazy i uploadów) — baza równa stanowi przy kopii, wiersz czatu sprzed kopii jest, po kopii nie ma; MG, Marek i Ola wracają **tymi samymi ciasteczkami**, link zaproszenia prowadzi do tego samego konta, mapa 200; punkt `po-T6`. **6.8b** pusta instancja, kampania „Nocna zmiana — import”: karty Kowala i Iskry wchodzą jako NPC z tymi samymi Cechami, umiejętnościami, ekwipunkiem i ranami; scena „Brama” — ściany i 4 figury są, powiązań 0 z 4, obrazy 404; po skopiowaniu 5 plików z `manifest.files` — 200 (Z10). Komunikat „4 figur straciło” (**#44**, `test.fail`). Paser i streszczenie mówią do Kowala „Marek” — **#45** (`test.fail`, decyzja MG po sesji: bot mówi do postaci).

| #    | krok                                                                                             | sprawdzamy                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
**Przebieg T6c (sesja 01.10):** pięć pełnych przebiegów `pnpm test:e2e` od pustej bazy, gateway
z modelem. Przebieg 1 padł na 4.2 (kreator dał Kowalowi REF 4 — kość 9 nie dawała 21) z kaskadą
startów T4b–T6b; od tej chwili 3.6 skryptuje kości Cech (Kowal z `po-T3a` z 26.09). Przebieg 2
przerwał brak RAM-u (gateway padł, potem `0xC0000142` w nowych procesach) — do miejsca padu 106
zielonych. Przebieg 3 — **196/196, 31,7 min**. Bufor promptów llama-server urósł wtedy do 21 GB
pamięci procesu i przerwałem przebieg 4 przy 1 GB wolnego RAM-u; gateway dostał `--cache-ram 2048`.
Po tej poprawce **przebieg 4 — 196/196 w 31,5 min, przebieg 5 — 196/196 w 31,6 min** (najmniej
wolnego RAM-u 4,4 GB). Najwolniejsze pliki: `t2b-gniazdo` ~9,5 min, `t3a` ~5,7 min. Podejrzenie
z 27.09 i 01.10 (odmowa gniazda / `ETIMEDOUT` proxy `vite preview`) nie wystąpiło w żadnym z pięciu.

| 6.1  | **Handel** Marek ↔ Ola (pola wymiany, dwie zgody, wycofanie zgody po zmianie oferty)             | przedmioty i eurodolce atomowo po obu stronach, nic nie ginie ani się nie dubluje                   |
| 6.2  | Zakup w sklepie (poziom kampanii) i u Pasera                                                     | cena, eurodolce, przedmiot na karcie                                                                |
| 6.3  | Cyborgizacja dla Marka z Utratą Człowieczeństwa                                                  | EMP/Człowieczeństwo, karta rzutu u właściwych osób                                                  |
| 6.4  | MG przyznaje PD; Marek podnosi umiejętność i Rangę Roli; wieloklasowość u Oli (jedna ścieżka)    | koszt PD, blokady, zapis na karcie                                                                  |
| 6.5  | Zdolność Roli poza walką (np. Medycyna, jeśli któraś postać ją ma; inaczej Interfejs poza runem) | jedna szczęśliwa ścieżka                                                                            |
| 6.6  | Upływ czasu o dobę: leczenie ran, wygasanie efektu czasowego na Cechach                          | PW, statusy, efekt znika o właściwej godzinie                                                       |
| 6.7  | Screamsheet (`@llm`), wpis w dzienniku kampanii, streszczenie sesji i relacja NPC przez bota     | polszczyzna czytelna, wpis „tylko MG” niewidoczny dla graczy (kanarek)                              |
| 6.8  | Eksport kampanii i import do świeżej instancji                                                   | kampania po imporcie ma karty, sceny, figury, uploady; porównanie z oryginałem                      |
| 6.9  | Kopia z harmonogramu (`BACKUP_INTERVAL_MINUTES` skrócone), odtworzenie na czystym katalogu       | aplikacja wstaje, gracze logują się tymi samymi linkami/ciasteczkami albo wiadomo, co trzeba zrobić |
| 6.10 | **Pełny przebieg `pnpm test:e2e` od zera** (bez punktów kontrolnych)                             | czas całości zapisany; zielono dwa razy z rzędu (wykrywa migotanie)                                 |

## 6. Testy poza scenariuszem

### 6.1. T1 — Linia bazowa i infrastruktura

- `pnpm test`, `tsc --noEmit` w trzech pakietach, ESLint, Prettier, `uv run pytest`, `uv run ruff check .`
  — liczby zapisane jako linia bazowa (oczekiwane co najmniej 2237 / 1228 / 286 / 59).
- `pnpm -r build` przechodzi; serwer z `dist/` wstaje na pustej bazie po `prisma migrate deploy`.
- `/health` odpowiada; serwer bez `data/private` loguje ostrzeżenie o próbce (kryterium etapu 28 —
  sprawdzamy, czy już jest; jeśli nie, zapis w rejestrze jako zadanie etapu 28, nie błąd).
- Pusta baza po `prisma migrate deploy` ma wszystko, czego stół potrzebuje bez ręcznych kroków
  (konto MG z env, brak kampanii, sensowne stany puste w każdym panelu MG) — tak wystartuje produkcja.
- `VTT_DICE_SCRIPT` i `window.__vttE2E` (4.2, 4.3) z testami, że nie działają w produkcji.
- Pierwszy test dymny suity: MG loguje się w Chromium, Ola wchodzi z zaproszenia w Firefoksie,
  wiadomość na czacie dochodzi w obie strony, rzut kubkiem ma ten sam wynik u obu.

### 6.2. T2 — Bezpieczeństwo i autoryzacja

VTT będzie wystawiony do internetu. Każdy punkt to test automatyczny w `35-bezpieczenstwo`
(`t2a-http` — punkty 5–8, 10, 11; `t2b-gniazdo` — 1–4; `t2c-kanarki` — 9). Numery testów
w suicie idą za punktami (`6.2.5 …`):

1. **Macierz ról gniazda.** Test wylicza wszystkie zdarzenia z `role` MG z rejestru serwera
   (`realtime/registry.ts`) i wysyła każde z gniazda gracza → oczekiwane `FORBIDDEN`, zero zmian w bazie.
   Nowe zdarzenie MG dopisane w przyszłości wchodzi do testu samo.
2. **Własność.** Gracz rusza cudzą figurą, edytuje cudzą kartę, rzuca z cudzej karty, zmienia cudzy
   ekwipunek, akceptuje cudzą stronę handlu, odpowiada na cudze wezwanie do Testu → odmowa.
3. **Śmieciowe ładunki.** Dla każdego zdarzenia dostępnego graczowi: `null`, zły typ, liczby ujemne,
   `NaN`, ogromne napisy, obce pola → odmowa z kodem, **żadnego `INTERNAL`** w logu i żadnego padu.
   Waga znalezisk — sekcja 2 („waga `INTERNAL`”).
   `requireCallableRequest` jako biała lista (pułapka z `POSTEP.md`) — pole spoza listy nie przechodzi.
4. **Tempo.** Gracz wysyła 500 `chat:message` i 2000 pośrednich `token:move` w kilka sekund → serwer
   żyje, inni gracze nie tracą płynności; zapis, czy jest jakikolwiek limit (brak = zadanie Z dla
   „Kont MG” i 28, decyzja MG z 26.09 w sekcji 2).
5. **Uploady.** Plik nie-obraz z rozszerzeniem `.png`, SVG ze skryptem, ogromny plik, nazwa z `../`,
   upload bez zalogowania, upload mapy przez gracza → odmowa; `/uploads/` nie listuje katalogu.
6. **Import muzyki z adresu URL** (tylko MG?) — kto może wywołać, czy adres wewnętrzny
   (`127.0.0.1:8100`, adres tailnetu) jest odrzucany. Na VPS gateway będzie w tailnecie.
7. **Zaproszenia i tożsamość gracza.** To samo imię = to samo konto, bez hasła (`routes/join.ts`).
   MG 26.09: **podrabianie linków graczy nie jest zmartwieniem**, więc wejście „jako Marek” z ważnym
   linkiem nie jest błędem. Test sprawdza tylko, że **wygasłe i unieważnione** zaproszenie nie
   wpuszcza, a zaproszenie jednej kampanii nie daje wstępu do innej.
8. **Ciasteczko i sesja.** `httpOnly`, `SameSite`, wygasanie po `SESSION_TTL_DAYS`, wylogowanie
   unieważnia sesję po stronie serwera; produkcja odmawia startu (albo krzyczy) z domyślnym
   `COOKIE_SECRET` — jeśli nie, zapis jako zadanie etapu 28.
9. **Kanarki na zimno.** Gracz tuż po zalogowaniu (pełny stan początkowy sceny i kampanii) nie
   dostaje żadnego kanarka — osobny test poza scenariuszem, bo stan początkowy idzie inną ścieżką niż pushe.
10. **Nagłówki HTTP** na buildzie produkcyjnym — co musi dołożyć Caddy w etapie 28 (lista do etapu 28).
11. **Hasło MG z internetu.** Seria nieudanych logowań MG — czy jest limit prób albo opóźnienie. Przy
    otwartej rejestracji MG (T9) to samo dla każdego konta MG. Brak limitu = B2 i zadanie dla etapu
    „Konta MG” albo 28.

### 6.3. T7 — Odporność

Podział (decyzja MG z 01.10): **T7a** — wiersze od „opóźnienie VPS” do „dwie karty” i „degradacja AI”
(`specs/40-odpornosc/t7a-walka-siec`, `t7a-handel-kreator`, `t7a-ai`, ✅ 01.10); **T7b** —
„obciążenie stołu”, „długi czat”, „rozmiar bazy”; **T7c** — „wydajność mapy” i „wyciek pamięci”.
Zerwanie i opóźnienie gra `fixtures/network.ts` (pośrednik gniazda w obu silnikach), degradację AI —
atrapa gatewaya.

| test                          | jak                                                                                                                | oczekiwane                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| opóźnienie VPS                | 150 ms ± 50 ms na gnieździe (łata `WebSocket.prototype.send` albo CDP w Chromium), skrót walki pierwszej           | pola nie gubią wpisanych znaków, marsz nie skacze, brak podwójnych akcji z podwójnego kliku       |
| zerwanie połączenia           | gracz offline na 30 s w trakcie swojej tury i w trakcie handlu                                                     | czytelny stan „rozłączony”, po powrocie ten sam stan bez F5                                       |
| restart serwera               | zabicie procesu w trakcie walki i w trakcie kreatora, start ponowny                                                | nic zapisanego nie znika; klienci wracają sami albo po F5 bez logowania                           |
| dwie karty tego samego gracza | Marek w dwóch oknach                                                                                               | spójny stan, brak podwójnych rzutów                                                               |
| obciążenie stołu              | MG + 4 graczy (decyzja MG) + 5. kontekst obserwatora, 10 minut ruchu i rzutów                                      | na koniec hash stanu sceny i kart identyczny u wszystkich i w bazie                               |
| wydajność mapy                | `test-map-4096.png`, 40 figur, 200 odcinków ścian, 10 świateł, mgła — Firefox i Chromium                           | klatki w marszu i przy przesuwaniu kamery (p50, p95) zapisane; próg do ustalenia z liczb bazowych |
| wyciek pamięci                | 30 przełączeń scen i 300 rzutów w jednej karcie                                                                    | sterta JS i liczba obiektów Pixi nie rosną liniowo                                                |
| długi czat                    | 3000 wierszy w kampanii, wejście nowego gracza                                                                     | czas do gotowego stołu, przewijanie bez długich klatek                                            |
| rozmiar bazy                  | po pełnym scenariuszu                                                                                              | zapisany — wejście do budżetu kopii w etapie 28                                                   |
| degradacja AI — warianty      | gateway martwy od startu; llama-server martwy przy żywym gatewayu; odpowiedź 3 min (limit `AI_REQUEST_TIMEOUT_MS`) | boty „niedostępne”, reszta stołu bez zmian, żadna akcja MG nie wisi                               |

### 6.4. T8 — Przeglądarki, ekrany, pierwszy kontakt, regresja

- **Macierz:** skrót scenariusza (`@szybkie`) w dwóch układach — MG Chromium / gracz Firefox
  i MG Firefox / gracz Chromium.
- **Ekrany:** 1366 × 768 (laptop), 1920 × 1080, 2560 × 1440; powiększenie 125 % i 150 % udawane
  rozmiarem okna (pułapka o `zoom` w `ogledziny`). Czy lewy panel, kolejka, pasek akcji, karta
  postaci i kreator mieszczą się i dają się przewinąć.
- **Motyw dzień/noc** na karcie i kreatorze (`data-theme='day'`, nie `'light'`).
- **Pierwszy kontakt gracza** — zastępuje sesję próbną z ludźmi, której nie będzie. Claude
  przechodzi jako nowy gracz, **bez dokumentacji**, od linku zaproszenia do pierwszego rzutu
  i pierwszego ruchu w walce, w Firefoksie, i notuje każde miejsce, w którym nie wiadomo, co kliknąć,
  każdy komunikat po angielsku, bez polskich znaków albo z kodem błędu zamiast zdania.
- **Pobieżna regresja** — lista kontrolna obszarów z tabeli „Zanim dotkniesz obszaru” (`POSTEP.md`),
  po jednym sprawdzeniu na obszar, którego scenariusz nie dotknął (np. rysowanie po mapie, ping,
  tabele losowe, muzyka, ustawienia kości 3D, pomoc i skróty, pełny ekran w Firefoksie, trzecia
  scena „Lombard” z `Pawn_Shop-24x18.png` do przełączania scen).
- Konsola bez nowych błędów w obu silnikach przez cały skrót (znane: dwa 401 przed zalogowaniem,
  404 `favicon.ico`).

### 6.5. T9 — Konta MG: rejestracja i izolacja

Warunek bety z decyzji MG z 26.09. Wymaga **nowego etapu „Konta MG”** (do zaprojektowania, pozycja 1
w `docs/etapy/zaleglosci.md`); T9 jest jego odbiorem z perspektywy bety. Aktorzy: **MG-A** (grupa
z Markiem i Olą, stan z punktu `po-T6`) i **MG-B** z własnym graczem **Kuba**, oba konta założone
przez otwartą rejestrację; do punktu 10 — **MG-C**. Właściciel instancji (z AI na swoim PC) gra jako
gracz u MG-A.

1. **Rejestracja:** formularz, walidacja hasła, zajęta nazwa, logowanie, wylogowanie, zmiana hasła
   (jeśli etap ją przewiduje); limit prób logowania i rejestracji z jednego adresu.
2. **Izolacja odczytu:** MG-B nie widzi kampanii, scen, kart, botów, architektur Sieci, handoutów,
   uploadów ani czatu MG-A — kanarki MG-A w podsłuchu **MG-B i Kuby** przez cały test.
3. **Izolacja zapisu:** macierz ról z T2 (punkt 1) powtórzona z gniazda MG-B na identyfikatorach
   obiektów MG-A → odmowa, zero zmian w bazie.
4. **Aktywacja:** MG-B aktywuje swoją kampanię, gdy grupa MG-A gra → **Marek i Ola zostają na swojej
   scenie** (dziś `campaign:activate` przeniósłby wszystkich — to byłby B1). Aktywna kampania per MG
   wchodzi do etapu „Konta MG” (decyzja MG z 26.09). Obie grupy grają naraz (limit dwóch sesji,
   decyzja MG z 26.09, trzecia tura) — ruch, rzuty i czat jednej nie docierają do drugiej.
5. **Uploady i biblioteki:** pliki wgrane w kampanii (mapy, portrety, handouty) są za logowaniem —
   widzi je tylko MG-właściciel i gracze tej kampanii. Kuba i MG-B dostają odmowę także po dokładnym
   adresie `/uploads/…` skopiowanym od Marka; niezalogowany — tak samo. Portret z biblioteki MG-A
   nie istnieje w UI MG-B.
6. **Indywidualne linki graczy:** każde zaproszenie jest imienne, dla jednego gracza; link Marka
   po użyciu nie wpuszcza nikogo innego jako nowego gracza, a link z kampanii MG-B nie daje wstępu do
   kampanii MG-A. Wygasły i unieważniony link nie wpuszcza (jak T2, punkt 7).
7. **Kopie:** eksport kampanii MG-B nie zawiera niczego od MG-A; odtworzenie kopii całości zachowuje
   właścicieli.
8. **Boty:** bez zatwierdzonej prośby u MG-B boty są **niedostępne**, a stół MG-B działa w pełni bez
   AI, jak przy martwym gatewayu. Żadne żądanie AI z kampanii MG-B nie trafia do gatewaya właściciela
   (sprawdzić w logu gatewaya). MG-B widzi, skąd wziąć paczkę instalacyjną AI, jeśli etap „Konta MG”
   dołoży do niej odnośnik (zaległości, pozycja 3).
   **Prośba o AI (zaległości, pozycja 4 — decyzja MG z 26.09, trzecia tura):** MG-B wysyła prośbę,
   gdy właściciel jest wylogowany; właściciel loguje się **jako gracz** w kampanii MG-A i widzi
   prośbę, zatwierdza → boty MG-B odpowiadają. Gdy AI zajmuje sesja MG-A, boty MG-B są niedostępne
   z komunikatem „AI zajęte przez inną sesję”, a stół MG-B gra dalej. Cofnięcie dostępu → boty MG-B
   niedostępne bez restartu serwera. Odrzucona albo cofnięta prośba nie przepuszcza żadnego żądania.
   Prośby nie widzi nikt poza właścicielem (kanarek w podsłuchu MG-A, Marka i Oli).
9. **Kompendium:** MG-B i Kuba widzą to samo kompendium co grupa MG-A (66 umiejętności, katalog) —
   kompendium jest wspólne dla wszystkich na VPS (decyzja MG z 26.09), to nie jest wyciek.
10. **Limit sesji:** trzeci MG (**MG-C**, konto z rejestracji) loguje się i przygotowuje kampanię,
    gdy grają MG-A i MG-B; przy „Aktywuj kampanię” dostaje komunikat, że wszystkie miejsca są zajęte
    i serwer nie obsłuży więcej sesji naraz — stoły MG-A i MG-B bez zmian. MG-A kończy sesję → MG-C
    aktywuje. Porzucona sesja zwalnia slot po progu bezczynności z etapu (decyzja MG z 26.09,
    trzecia tura).

### 6.6. T11 — VPS (po etapie 28)

Produkcja startuje z **pustej bazy** (decyzja MG z 26.09) — `dev.db` nie jedzie na VPS.
Skrót scenariusza `@szybkie` przeciw `https://vtt.tatanga.eu` (albo adresowi przejściowemu), gracz
z innej sieci niż MG (np. telefon jako hotspot dla laptopa), bot przez Tailscale, wyłączenie PC MG
→ boty niedostępne, stół gra dalej. Kanarki i macierz ról puszczone jeszcze raz przeciw produkcji
na osobnej kampanii piaskownicy (`sandbox`). Test odtworzenia kopii zrobiony w etapie 28 — tu tylko
potwierdzenie, że jest.

## 7. Bramka bety

### 7.1. Wagi błędów

| waga | nazwa     | definicja                                                                                                                                                                                                                                            |
| ---- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B0   | bloker    | rozgrywki nie da się kontynuować bez zaglądania w kod lub bazę; pad serwera; utrata zapisanych danych                                                                                                                                                |
| B1   | krytyczny | wyciek danych ukrytych do gracza; gracz wykonuje akcję MG albo cudzą; rozjazd stanu między klientami, którego nie naprawia F5; kopia się nie odtwarza; wynik mechaniki rdzenia sprzeczny z podręcznikiem i niezapisany w `decyzje-i-uproszczenia.md` |
| B2   | poważny   | funkcja nie działa, ale MG ma obejście przy stole; błąd tylko w jednym z dwóch silników z obejściem; mylący komunikat prowadzący do złej decyzji w grze                                                                                              |
| B3   | drobny    | wygląd, tekst, odmiana, niewygoda                                                                                                                                                                                                                    |

Obszary dodatkowe (Sieć, ekonomia, rozwój, narracja i czas) ważą tak samo jak rdzeń — decyzja MG z 26.09.

### 7.2. Kryteria przejścia na betę

Wszystkie naraz:

1. **B0 = 0 i B1 = 0** w rejestrze (po retestach 🔁).
2. **B2 ≤ 5**, każdy z opisanym obejściem w „Znanych problemach bety” (plik do utworzenia w T10,
   przeznaczony do pokazania graczom).
3. Pełny `pnpm test:e2e` zielony **dwa razy z rzędu** na świeżej instancji, w tym `@llm`.
4. Linia bazowa (sekcja 6.1) zielona, bez spadku liczby testów.
5. Podsłuch nie znalazł żadnego kanarka w całym przebiegu (T3–T6) ani na zimno (T2).
6. Kopia i odtworzenie na rozegranym stanie działają (6.8, 6.9).
7. Etap „Konta MG” ukończony i T9 zielony (izolacja dwóch MG, w tym aktywacji).
8. Etap 28 ukończony według jego kryteriów i T11 zielony.

**Werdykt T10** brzmi „gotowe do bety po etapie 28” albo „niegotowe, powód: …” z listą B0/B1.
Werdykt końcowy wydaje T11.

## 8. Czego automat nie oceni — lista obserwacji na pierwsze sesje bety

Bez sesji próbnej z ludźmi (decyzja MG) te rzeczy ocenia pierwsza prawdziwa sesja. Lista startowa
(z `POMYSLY.md`, 25.09) — T10 dopisze do niej wszystko, co wyjdzie z „pierwszego kontaktu” (6.4):

- tempo sesji zero w kreatorze (~25 kart na czacie) i rzut prawdziwym gestem;
- polszczyzna Qwen3.8-27B Q3 w rozmowie i w screamsheetach;
- czytelność dla nowicjusza: co zrobić w swojej turze bez pomocy MG;
- siła kafla papieru i czytelność w nocy;
- pełny ekran i Esc (Keyboard Lock działa dopiero na HTTPS);
- taktyka bota w walce (strzela z miejsca, pasuje po Akcji — zapisane 24.09);
- dźwięki powiadomień (automat ich nie słucha);
- bot-handlarz nie zna ekwipunku swojej karty — Paser obiecał „sztucery z tłumikami”, których nie
  ma, i mieszał idiomy („trzaska jak kaczka na deszczu”) — T3b, 26.09;
- płynność u gracza bez akceleracji GPU (SwiftShader: 2–8 kl./s na ciemnej scenie z oświetleniem,
  marsz zwalnia proporcjonalnie) — do pomiaru w T7;
- MG widzi rzuty graczy z opóźnieniem animacji kości (klient wstrzymuje skutek do jej końca) —
  przy inicjatywie trzech rzutów pas MG dochodzi po ~15 s, a karta propozycji bota zmienia się na
  „Zatwierdzone” po kilkunastu sekundach, co kusi do drugiego kliknięcia (#20) — T4a, 26.09;
- w turze ukrytej figury gracze widzą, że nikt nie ma tury (brak podświetlenia na pasie) — to
  zdradza, że ktoś ukryty działa; do oceny przy stole — T4a, 26.09;
- odmiana w ustach bota: „Otwieram ogień do Iskrzy” (Rzeźnik, tura w walce) — T4a, 26.09;
- na początku tury Kowala z raną krytyczną („Ciało obce”) i stanem „Poważnie ranny” pas MG nie ma
  żadnego monitu, a gracz — tylko naklejkę „Poważnie ranny” na panelu; kara działa (−2 w rozbiciu
  rzutu), ale o dodatkowych obrażeniach „Ciała obcego” po biegu nikt nie przypomina — T4b, 27.09;
- karta Pochwycenia: „Udane · PT 13 (ZW + Bijatyka celu) · Obrona Iskra: 10 → mimo wszystko
  udane” przy wyniku 12 — czy gracz zrozumie, dlaczego chwyt poniżej PT się udał — T4b, 27.09.
- po aktywacji nowej sceny figury graczy, którzy mają figurę na innej scenie, nie przechodzą same —
  MG stawia każdą ⊕ „Postaw na scenie” z listy postaci; czy MG o tym pamięta przy stole — T5a, 27.09;
- na ręcznej mgle MG musi odsłonić **linię** drzwi i bramy, nie tylko podłogę przed nimi, bo
  inaczej gracz ich nie dostaje (a z #30 i tak nie ma klamki) — T5a, 27.09;
- na otwartym placu marsz co chwilę staje („Ktoś pojawił się w polu widzenia — marsz przerwany”:
  cztery razy w jednej turze Kowala) — czy gracze nie uznają tego za zacięcie — T5b, 27.09;
- netrunner celuje wieżyczką tylko w figury, które widzi **jego ciało** (lista celów z widoku
  klienta), więc Strażnik za barierą był dla wieżyczki nietykalny, choć ona go widziała; Demon
  strzela z tej samej wieżyczki w każdego — do oceny przy stole — T5b, 27.09;
- Demon używa węzła na początku rundy, więc netrunner, który go przejmie, obsłuży urządzenie
  dopiero w następnej rundzie („raz na Turę” liczone na rundę, `decyzje-i-uproszczenia.md`) — T5b, 27.09;
- po zaznaczeniu figury broń nie zawsze sama trafia do ręki („W ręku: …” — Strażnik po marszu MG,
  Kowal po zmianie naboju na karcie); klik w slot na pasku pomaga — T5b, 27.09.
- po aktywacji innej sceny MG zostaje przy starej jako „podgląd” (gracze już są na nowej) — MG musi
  sam kliknąć „Pokaż”; czy przy stole nie zacznie przygotowywać sceny, której nikt nie widzi — T6a, 29.09;
- bot-handlarz dalej nie zna ekwipunku swojej karty: z Roninem na karcie Paser za każdym razem odmawia
  albo zbywa („wojsko to już inna liga”), raz zaproponował pistolet maszynowy, którego nie ma; polszczyzna
  z potknięciami („włosy z głowy wydworował”, „pokazać te „gotówkę””, „dyskrekcji”) — odpowiedź w 2–8 s;
  raz na dziewięć wywołań nie odpowiedział w 3 minuty (przyczyna nieuchwycona, test zbiera teraz log
  serwera) — T6a, 29.09;
- zgoda w handlu spada sama po zmianie oferty drugiej strony — czy gracz zauważy, że musi kliknąć
  „Zgadzam się” jeszcze raz — T6a, 29.09.
- Paser dalej nie zna swojej karty ani historii handlu: „Ronin? Nie znam go”, choć sprzedał go Kowalowi w T6a; potknięcia („świeży espresso”, streszczenie: „Marek podziękował Roninowi”) — T6b, 30.09;
- streszczenie sesji nie zaproponowało ani jednej zmiany relacji w czterech próbach (log to 6 wypowiedzi — reszta „Nocnej zmiany” to rzuty i akcje, których kronikarz nie czyta); czy MG będzie ustawiał nastawienie ręcznie — T6b, 30.09;
- okno handlu gracza, któremu padła sieć, wygląda jak zwykle (przyciski działają lokalnie), a o przerwie mówi tylko „Rozłączono” w nagłówku — czy gracz to zauważy — T7a, 01.10;
- screamsheet zmyśla fakty wokół tematu (cztery ciała, kurierzy, SecuTech) — model zna tylko hasło, nie przebieg walki; polszczyzna dobra z potknięciami („chodźcy cybernetyczni”, „ślady po kule”) — T6b, 30.09.

## 9. Rejestr błędów i raportowanie

T1 zakłada `testy-rejestr.md` obok tego pliku. Jeden wiersz na błąd:

| id  | etap | waga | obszar | tytuł | kroki odtworzenia | dowód (test, zrzut, log) | status | poprawka (commit) |
| --- | ---- | ---- | ------ | ----- | ----------------- | ------------------------ | ------ | ----------------- |

Statusy: nowy · potwierdzony · naprawiony · retest OK · odrzucony (z powodem, np. „zgodne
z `decyzje-i-uproszczenia.md`”). Test, który znalazł błąd, zostaje w suicie oznaczony `test.fail()`
z identyfikatorem z rejestru — po poprawce zdejmuje się znacznik i test pilnuje regresji.

Sesja testowa **nie naprawia** (decyzja MG). Wyjątek: błąd w samej suicie albo w infrastrukturze
testów — to nie jest błąd aplikacji.

## 10. Zasady sesji testowej

1. Na starcie: ten plik (sekcje 1, 2 i notatki w 12), rejestr, `POSTEP.md` jak zwykle.
2. Jedna sesja = jeden etap T. Nie kończy się etapu, dopóki jego kroki nie są wykonane albo
   świadomie oznaczone „zablokowane przez #id”.
3. Pułapki: sekcje `ogledziny` i `testy` w `docs/etapy/pulapki-dev.md` — przeczytać przed T1, T7 i T8.
   Nowe pułapki automatu dopisywać tam, nie tutaj.
4. Oględziny zmian UI zawsze także w Firefoksie; w notatce sesji — w czym oglądano.
5. Na koniec sesji: tabela stanu, notatka sesji (najwyżej dwie ostatnie w sekcji 12, starsze do
   `testy-rejestr.md` na dół), commit suity i dokumentów. Punkty kontrolne i `.e2e/` nie idą do gita.
6. Zanim cokolwiek z danych trafi do commita: `git status` bez `data/private/`, `uploads/`, `.e2e/`, `*.db`.

## 11. Pytania otwarte

Brak. Rozstrzygnięte 26.09 — pierwsza tura (baza, liczba graczy, kości, hak klienta, tożsamość
gracza) w sekcji 2; druga tura, pod etap „Konta MG”:

1. **Aktywna kampania per MG** — **wchodzi** do etapu „Konta MG” (T9, punkt 4).
2. **Boty innych MG** — w becie **niedostępne**; inni MG dostaną paczkę instalacyjną AI na własny PC
   (zaległości, pozycja 3) — T9, punkt 8.
3. **Dostęp** — każdy MG ma własne hasło, gracze wchodzą **indywidualnymi linkami**; uploady kampanii
   za logowaniem, tylko dla jej członków — T9, punkty 5 i 6.
4. **Kompendium na VPS** — **wspólne dla wszystkich** MG i graczy — T9, punkt 9.

## 12. Notatki z sesji testowych

### Sesja 01.10 — T7a: sieć, restart, dwie karty, degradacja AI

**Rozstrzygnięcia MG na starcie:** T7 teraz (przed refaktoryzacją), podział a/b/c, ta sesja T7a;
testy w `40-odpornosc` poza domyślnym przebiegiem; gracze głównie na PC z GPU; degradacja AI na
atrapie gatewaya. Wagi T7 w sekcji 2.

**Zrobione:** `fixtures/network.ts` (pośrednik gniazda `routeWebSocket` — opóźnienie w kolejce,
zerwanie z `setOffline`), `fixtures/fake-gateway.ts`, hak `prepare` w `cast.mg`/`cast.gracz`,
przełącznik `odpornosc` w `playwright.config.ts`. Trzy pliki, 16 testów, ~6 min:
`t7a-walka-siec` (`po-T4a`): notatki Kowala i Iskry pisane kawałkami pod 150 ± 50 ms bez straty
znaku, marsz bez skoku, podwójny klik „Kończę turę” = jedna tura, Ola 30 s offline w swojej turze
(„Rozłączono”, powrót bez F5 z czatem, ruchem i zmianą karty z przerwy, potem krok Iskry), Marek
w dwóch kartach (wezwanie w obu, rzut z obu naraz → jeden rzut), zabicie serwera 250 ms po rozkazie
marszu (baza bez zmian po starcie, trzy karty wracają same w ~5 s, każda figura u klienta = baza);
`t7a-handel-kreator` (`po-T6a`): Ola 30 s offline w środku handlu (wytrychy i zgoda Marka czekają,
wymiana po powrocie bez F5), Kuba w kreatorze — zabicie serwera po trzech Cechach (szkic co do bajtu,
kubek dalej załadowany, czwarta Cecha raz); `t7a-ai` (`po-T4a`): „Graj turę” Rzeźnika przy martwym
gatewayu i martwym llama-serverze — notka „model jest niedostępny…” w kilka sekund, przy odpowiedzi
po 3 min — przycisk wraca po 120 s; w każdym wariancie czat Oli → MG ~70 ms, ruch MG ~50 ms, rzut
Marka dochodzi do Oli.

**Błędy:** #46 (B3 wg „waga `INTERNAL`”, do triażu) — limit 120 s w turze bota kończy się
`INTERNAL` i notką „coś poszło nie tak po stronie serwera”; #47 (niepotwierdzony) — raz na ~12
marszów pod opóźnieniem figura u MG cofnęła się o 1,2 pola. Obserwacja do sekcji 8: okno handlu
gracza offline nie mówi, że jest offline (tylko „Rozłączono” w nagłówku).

**Wynik:** `pnpm test:e2e 40-odpornosc` 16/16 (6,1 min), plik walki 3 × 7/7 w powtórkach; domyślny
`pnpm test:e2e --list` dalej 196 testów. Oglądane automatem: MG i Marek w Chromium, Ola i Kuba
w Firefoksie, headless. Punkty kontrolne nietknięte (T7a ich nie nagrywa), `dev.db` nietknięta.

**Następny krok:** T7b — obciążenie stołu (MG + 4 graczy + obserwator, 10 min), długi czat,
rozmiar bazy.

### Sesja 01.10 — T6c: dwa pełne przebiegi od zera

**Rozstrzygnięcia MG na starcie:** przebiegi z modelem; „dwa z rzędu” = dwa kolejne zielone po
ostatniej poprawce (suity albo aplikacji); migotanie w aplikacji — drobne od razu, większe do
rejestru; najwyżej pięć przebiegów. W trakcie: gateway w terminalu MG (nie w tle agenta),
przerwać przebieg 4 i ograniczyć bufor promptów llama-server.

**Zrobione:** `t3a` 3.6 skryptuje dziesięć kości Cech Kowala i sprawdza Cechy na karcie
(`KOWAL_STAT_FACES`/`KOWAL_STATS`) — pełny przebieg od zera ma tego samego Kowala co punkty
kontrolne. Gateway: `GATEWAY_LLAMA_CACHE_RAM_MB` → `--cache-ram` (domyślnie 2048; build 10735
miał 8192), test `test_supervisor.py`, pomiar w `ai-gateway/README.md`. Przebiegi w 5.4 wyżej.
Nowe pułapki w `testy` (konsola przebiegu, nadpisane punkty kontrolne) i `boty` (`--cache-ram`);
zaległość: llama-server trzyma ~15,5 GB RAM-u przy modelu w całości na GPU.

**Wynik:** przebiegi 4 i 5 — 196/196 (~31,5 min każdy), bez migotania; nowych błędów aplikacji brak.
Punkty kontrolne nagrane na nowo przez przebieg 5 (Kowal jak dotąd); kopia sprzed sesji
w `.e2e/checkpoints-bak-01.10/`. Oglądane automatem: MG i Marek w Chromium, Ola w Firefoksie, headless.

**Następny krok:** wg kolejności z 26.09 — refaktoryzacja całości pod osłoną suity, potem etap
„Konta MG”.
