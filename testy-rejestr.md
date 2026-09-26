# Rejestr błędów testów przed betą

Założony w T1 (26.09.2026). Plan, wagi i bramka bety są w `testy.md` (sekcje 7 i 9). Jeden wiersz
na błąd; test, który go znalazł, zostaje w suicie z `test.fail()` i identyfikatorem stąd, dopóki
poprawka nie przejdzie retestu.

Wagi: **B0** bloker · **B1** krytyczny · **B2** poważny · **B3** drobny. Statusy: nowy · potwierdzony ·
naprawiony · retest OK · odrzucony (z powodem).

## Błędy

| id  | etap | waga | obszar | tytuł                                                   | kroki odtworzenia                                                                | dowód (test, zrzut, log)                                                                                                   | status    | poprawka (commit) |
| --- | ---- | ---- | ------ | ------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------- | ----------------- |
| 1   | T1   | B0   | serwer | Build produkcyjny serwera (`dist/main.js`) nie startuje | `pnpm --filter @vtt/server build`, potem `node dist/main.js` w `packages/server` | `ERR_MODULE_NOT_FOUND: Cannot find package 'sqlite'`; tsup zdejmował `node:` z `node:sqlite` (`snapshots.ts`, od etapu 33) | retest OK | `ed681a8`         |
| 2   | T3a  | B1   | postac | Gracz zmienia własne Cechy po „Przyjmij do gry”         | po przyjęciu karty ▲ przy Cesze na karcie (albo `character:update` z `data.stats`) — CHA 7 → 8 zapisane, choć w kreatorze Cechę rzuca się raz, a przerzut daje tylko MG | test `3.8 gracz nie podnosi sobie Cechy po przyjęciu (#2)` (`test.fail`); umowa „pola z ceną” (`postac`) nie wymienia Cech — **triaż MG 26.09 (sesja T3b): B1** — Cechy po przyjęciu zmienia wyłącznie MG, jak pola z ceną | retest OK | `5ee4a59` |
| 3   | T3a  | B3   | czas   | Data startowa świeżej kampanii zgłasza zaległe rozliczenie | nowa kampania (zegar 1.01.2045) → „Ustaw” 14.03.2045 → „Minął pierwszy dzień miesiąca — i jeszcze 1. Ostatnio rozliczono 2045-01” i „Odpoczynek — minęły 72 doby”; bez postaci „Rozlicz” czyści za darmo, ale data ustawiona po dołączeniu postaci pobrałaby czynsz za miesiące sprzed kampanii | zrzut `.playwright-mcp/t3-06-zegar.png` (lokalnie); krok 3.2 obchodzi „Rozlicz” | retest OK | `5ee4a59` |
| 4   | T3a  | B3   | czat   | Karta rzutu Ścieżki Życia pokazuje wynik „1”             | dowolna tabela Ścieżki kubkiem → karta czatu: kość 5, duża liczba 1; `total` = liczba odpowiedzi (`creation.ts`, 25b), a od 24.09 rzuca się po jednej tabeli | test `#4 karta rzutu Ścieżki Życia…` (`test.fail`)                                                                     | retest OK | `5ee4a59` |
| 5   | T3a  | B3   | dane   | Wymyślona próbka z repo stoi w kompendium obok podręcznika | instancja z `data/private` → sklep kreatora: „Zgrzyt 9”, „Zardzewiak”, „Kurtka warsztatowa”; deki: „Dek przykładowy”; Programy „Iskra”, „Parasol”, „Osa”, „Tasak”, „Dziurkacz”; amunicja `sample-*` — `loadCompendium` łączy `data/public` i `data/private` celowo (prywatne wygrywa po id) | test `#5 kompendium z podręcznika…` (`test.fail`) — 50 wpisów `sample.json`                                          | retest OK | `5ee4a59` |
| 6   | T3a  | B3   | ui     | MG bez kampanii dostaje radę o zakładce „Sceny”          | pusta instancja → MG loguje się → mapa: „Brak sceny — utwórz i aktywuj ją w zakładce „Sceny””, a pierwszym krokiem jest kampania w „Panel MG” | zrzut `.playwright-mcp/t3-01-mg-pusto.png` (lokalnie)                                                                  | retest OK | `5ee4a59` |
| 7   | T3a  | B3   | postac | Brak „Wpisz nazwę darmowego języka” przy polu-liście     | kreator, Ścieżka Życia bez języka → „N braków — pokaż” → „Wpisz nazwę darmowego języka kultury pochodzenia.”, a pole „Język ojczysty” jest listą wyboru | zrzut `.playwright-mcp/t3-20.png` (lokalnie)                                                                           | retest OK | `5ee4a59` |
| 8   | T3a  | B3   | postac | Ekran końcowy kreatora nie wie o przyjęciu do gry        | gracz tworzy postać i zostawia kreator otwarty → MG „Przyjmij do gry” → kreator dalej: „Teraz czeka na zatwierdzenie MG: do tego czasu karta jest tylko do podglądu” i „Żeton stanie… gdy MG przyjmie” | zrzut `.playwright-mcp/t3-35-marek-po.png` (lokalnie)                                                                  | retest OK | `5ee4a59` |
| 9   | T3b  | B3   | postac | Żeton z kreatora przepada, gdy MG przyjmuje postać bez aktywnej sceny | T3a: „Przyjmij do gry” przy braku aktywnej sceny → T3b: aktywacja „Knajpy” — Kowal i Iskra bez figur; kreator obiecywał „Żeton stanie… gdy MG przyjmie” (#8), a ani gracz, ani MG (znacznik „Czeka na MG”, panel postaci) nie dostają żadnej wzmianki — MG musi sam znaleźć „Postaw na scenie” przy postaci | `placeApprovedCreationToken` wraca bez sceny (komentarz w kodzie: „MG stawia ręką”); test 3.11 stawia obie figury ręką | retest OK | `5ee4a59` |
| 10  | T2   | B3   | serwer | Gracz spoza kampanii dostaje pulę portretów aktywnej kampanii | MG zakłada drugą kampanię, daje do niej zaproszenie i wraca do „Nocnej zmiany” → gracz „Obcy” wchodzi tym zaproszeniem → `GET /api/portrait-assets` zwraca 3 portrety graczy „Nocnej zmiany” (NPC „tylko MG” odfiltrowane); `/api/auth/me` podaje też nazwę aktywnej kampanii. Trasa sprawdza tylko zalogowanie (`requireAuth`), nie członkostwo | test `6.2.7 gracz spoza kampanii nie dostaje jej puli portretów (#10)` (`test.fail`); przy etapie „Konta MG” to przeciek między MG — tam do naprawy razem z uploadami za logowaniem (Z7) | nowy | |
| 11  | T2   | B2   | serwer | Otwarte gniazdo działa po wylogowaniu i po wygaśnięciu sesji | gracz loguje się, gniazdo otwarte → `POST /api/auth/logout` (wiersz `Session` znika, HTTP 401, nowe gniazdo `UNAUTHORIZED`) → stare gniazdo dalej wysyła `chat:send` z sukcesem; to samo po `SESSION_TTL_DAYS`. Sesję sprawdza tylko `io.use` przy nawiązaniu | testy `6.2.8 otwarte gniazdo po wylogowaniu…` i `…wygasłej sesji traci prawa (#11)` (`test.fail`); **waga: decyzja MG z 26.09 (sesja T2) — B2 + zadanie Z** (Z8) | nowy | |
| 12  | T2   | B2   | serwer | Logowanie MG bez limitu prób                             | 30 złych haseł pod rząd z jednego adresu → 30 × 401 w 0,3 s, bez 429 i bez opóźnienia; prawdziwe hasło dalej działa | testy `6.2.11 …30 złych prób…` (pomiar) i `…trafia na limit (#12)` (`test.fail`); plan 6.2.11: brak limitu = B2 i zadanie (Z6) | nowy | |
| 13  | T2   | B1   | serwer | Zalew jednego gracza dławi innych ponad 5 s              | Marek wysyła naraz 500 `chat:send` i 2000 pośrednich `token:move` → czat Oli do MG dochodzi po 5,8–6,3 s, ruch MG u Oli po 5,8–6,3 s, czat MG na ekranie Oli (Firefox) po 6,8–7,7 s; zapisane 500/500, zero odmów. Diagnoza: same 2000 ruchów = 2,5 s (~1,2 ms/ruch), samo 500 wiadomości = 1,6 s (~3 ms/zapis); zwykły klient nie wysyła takiego tempa | test `6.2.4 zalew nie dławi innych graczy ponad 5 s (#13)` (`test.fail`), pomiar w adnotacji `6.2.4 zalew…`; **próg 5 s i waga B1: decyzja MG z 26.09 (sesja T2)**; lekarstwo = limit tempa (Z5) | nowy | |
| 14  | T2   | B1   | postac | Gracz trwale usuwa własną postać przyjętą do gry         | `character:delete` z gniazda gracza z id własnej, przyjętej karty (Kowal) → `{ ok: true }`, karta z historią znika, figury tracą kartę. W UI ✕ „Usuń postać” ma wyłącznie MG; serwer sprawdza tylko właściciela (`characters.ts`) | test `6.2.2 gracz nie usuwa własnej postaci przyjętej do gry (#14)` (`test.fail`); znalezione śmieciami gracza (`id + null`). **triaż MG 26.09 (sesja T2): B1**, jak #2 — gracz wykonuje akcję MG, bezpowrotnie | nowy | |
| 15  | T2   | B3   | serwer | Śmieciowe id kończą się `INTERNAL` zamiast odmowy (zbiorczo) | liczba spoza zakresu Int (`1e308`) albo zły typ trafia wprost do zapytania Prismy: gracz — `chat:history` (`beforeId`), `grapple:resist`, `facedown:resist`, `creation:finish` (`creationDraftId` nie-napis), `character:roll`, `check:request-cancel`, `inventory:respond`, `attack:evade`, `attack:smart`, `opening:toggle`, `drawing:update`, `drawing:delete`, `bot:proposal`; MG dodatkowo — `table:show`, `check:cancel`, `check:request-resolve`, `damage:apply`, `damage:undo`, `wall:update`/`delete`, `cover:update`/`delete`, `zone:update`/`fire`/`delete`, `light:update`/`delete`, `smoke:clear`, `netpoint:update`/`remove`, a `ai:ask` i `rules:ask` padają na `.trim is not a function`. Bez zapisu w bazie, serwer i klienci żyją | testy `6.2.3 śmieci gracza/MG: żadnego INTERNAL (#15)` (`test.fail`), lista w adnotacjach `fuzz-INTERNAL` i `fuzz-log`; **waga: decyzja MG z 26.09 (sesja T3a) — jeden zbiorczy B3** | nowy | |

Poprawkę #1 zrobiono w sesji T1 **za zgodą MG** (wyjątek od zasady „sesja testowa tylko notuje”:
błąd blokował samą infrastrukturę, bo instancja E2E startuje z `dist/`). Retest: `00-baseline`
i cała suita zielone cztery razy z rzędu; pułapka w `pulapki-dev.md`, sekcja `serwer`.

Poprawki #2–#9 zrobiono w sesji 26.09 (po T3b) **na zlecenie MG**, w jednym commicie `5ee4a59`.
Rozstrzygnięcia MG: #3 — pole „Data startu kampanii” w oknie zegara (stempluje miesiąc startu,
bez propozycji odpoczynku); #5 — `data/private` zastępuje próbkę w całości; #9 — dług żetonu
spłaca najbliższa aktywacja sceny (figura przy miejscu startu graczy). Retest: #2, #4, #5 — testy
bez `test.fail()`; #3 — krok 3.2 T3a przez nowe pole; #8 — krok 3.8 T3a (ekran końcowy Oli
w Firefoksie); #9 — krok 3.13 T3b (Kowal i Iskra wchodzą sami); cała suita 40/40 i T3a 16/16.
#6 i #7 obejrzane w Firefoksie (Playwright MCP) na pustej instancji E2E — zrzuty
`.playwright-mcp/fix-06-mg-bez-kampanii.png`, `fix-07-jezyk.png` (lokalnie).

## Zadania dla innych etapów (nie błędy)

Rzeczy, które test wykazał, ale plan każe je zapisać jako zadanie, a nie błąd.

| id  | etap | dla etapu | tytuł                                                   | co wykazał test                                                                                                                                                                                                     |
| --- | ---- | --------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Z1  | T1   | 28        | Brak ostrzeżenia o próbce kompendium bez `data/private` | Serwer z `dist/` i `DATA_PRIVATE_DIR` wskazującym pusty katalog loguje tylko `compendium loaded` (50 pozycji próbki) i wstaje bez słowa ostrzeżenia. Kryterium etapu 28: ostrzeżenie w logu przy starcie na próbce. **Zrobione 26.09 (`7746954`)**: `loadCpredRegistry` i `loadCompendium` ostrzegają raz przy starcie z listą plików z próbki; sprawdzone na `dist/` z pustym i pełnym `DATA_PRIVATE_DIR`. Dla etapu 28 zostaje komunikat w panelu MG. |
| Z2  | T2   | 28        | Ciasteczko sesji bez flagi `Secure`                      | `vtt_sid` ma `HttpOnly`, `SameSite=Lax`, podpis i ważność 30 dób, ale nie `Secure`. Za Caddy (HTTPS) ustawić `Secure` (np. z env), inaczej ciasteczko jedzie też po HTTP. |
| Z3  | T2   | 28        | Produkcja wstaje z domyślnym `COOKIE_SECRET`              | `NODE_ENV=production` bez `COOKIE_SECRET` → serwer wstaje z `dev-secret-change-me` bez słowa w logu. Odmowa startu albo głośne ostrzeżenie. (Sam podpis nie daje cudzej sesji bez jej id — test podpisu domyślnym sekretem odbija się na instancji z innym.) |
| Z4  | T2   | 28        | Nagłówki bezpieczeństwa w Caddy                          | Serwer nie wysyła żadnego z: `Strict-Transport-Security`, `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options` (lub `frame-ancestors`), `Referrer-Policy`, `Permissions-Policy` — ani na `/api`, ani na `/uploads`. Brak `X-Powered-By` (dobrze). Dołożyć w Caddy. |
| Z5  | T2   | „Konta MG”, 28 | Limit tempa na gnieździe (z #13)                      | 500 wiadomości i 2000 ruchów jednego gracza przechodzą w całości i dławią innych na 6 s (#13). Decyzja MG z 26.09: limit per sesja w etapie „Konta MG”, limit połączeń w Caddy (28). |
| Z6  | T2   | „Konta MG”, 28 | Limit prób logowania (z #12)                          | Logowanie MG bez limitu i bez opóźnienia (#12); przy otwartej rejestracji MG to samo dla każdego konta (T9). |
| Z7  | T2   | „Konta MG” | Pliki `/uploads/` bez logowania (z #10)                  | Każdy, kto zna adres (16 losowych znaków), pobiera mapę, portret, handout bez logowania — także handout nieudostępniony. Rozstrzygnięte w `testy.md` 11.3: uploady kampanii za logowaniem, tylko dla jej członków. |
| Z8  | T2   | „Konta MG” | Gniazdo po wylogowaniu i wygaśnięciu sesji (z #11)       | Wylogowanie i usunięcie sesji rozłącza jej gniazda (lista gniazd per sesja albo sprawdzenie sesji przy zdarzeniu). Decyzja MG z 26.09: B2 + zadanie. |
| Z9  | T2   | 28        | Gniazdo nie sprawdza nagłówka `Origin`                    | Handshake WebSocket z `Origin: http://zly.example` i ważnym ciasteczkiem przechodzi (CORS dotyczy tylko long-pollingu). Dziś chroni tylko `SameSite=Lax`; `allowRequest` w Socket.IO z listą pochodzeń. |

## Starsze notatki sesji testowych

_Notatki wyparte z sekcji 12 `testy.md` — w całości, najnowsze na górze._

### Sesja 26.09 — T3a: kampania, gracze, zgody i oba kreatory (plan T2 → T3)

**Rozstrzygnięcia MG na starcie:** T2 **czeka na T3** (stan z `po-T3`, nie własny zasiew); waga
`INTERNAL` ze śmieciowych ładunków — zbiorczy B3; brak limitów tempa — zadanie Z dla „Kont MG” i 28
(sekcja 2). T3 **podzielony na T3a i T3b** (sekcja 5.1). Gateway z modelem uruchomiony na sesję.

**Zrobione:** najpierw kroki 3.1–3.8 ręką w Playwright MCP (MG i Marek w Chromium, Ola w Firefoksie),
potem `30-rozgrywka/t3a-kampania-postacie.spec.ts` (15 testów, ~6,6 min): kampania od pustej bazy,
sklep 2, zegar 14.03.2045 22:00, zaproszenia z UI, zgody z warunkami przez znacznik „Czeka na MG”,
pula portretów MG, Kowal (Solo, Krawędziarz, 10 Cech i 17 tabel Ścieżki kubkiem), Iskra (Netrunner,
Kompletny Pakiet 62/80, **F5 w połowie Ścieżki bez strat**), przyjęcie do gry, 66 umiejętności,
odmowy `CHARACTER_AWAITING_GM` i `FORBIDDEN` dla pól z ceną, dek z sześcioma Programami, kanarki
(portret NPC, notatka Kowala), punkt `po-T3a` (kopia → odtworzenie → ten sam odcisk). Nowe fixtures:
`creator.ts`, `materials.ts`, `socket.ts`; `prepareFresh` kopiuje `uploads/art` (mapa powitalna jak na VPS).

**Znalezione:** #2 **B2 do triażu** — gracz zmienia własne Cechy po przyjęciu (`character:update`
z `stats`); #3–#8 B3 (zaległe rozliczenie po ustawieniu daty startowej, karta Ścieżki z wynikiem
„1”, wymyślona próbka w kompendium obok podręcznika, rada o „Scenach” dla MG bez kampanii, „Wpisz”
przy liście języków, nieaktualny ekran końcowy kreatora). Obserwacje dla T8: Firefox loguje „WebGL
context was lost” przy wejściu z zaproszenia; okno kreatora i karta zasłaniają zakładki panelu przy
szerokości 1500–1600 px; okno zegara zasłania znacznik „Czeka na MG”. Tempo: ~6,5 s na rzut kubkiem,
Krawędziarz = 27 rzutów ≈ 3 min (lista obserwacji, sekcja 8).

**Suita:** 27 testów (`00-baseline` 5, `01-dym` 7, T3a 15, w tym 3 `test.fail`), pełne `pnpm test:e2e`
~7,2 min, **zielone dwa razy z rzędu**; wcześniej jeden przebieg padł na jednorazowym
`ERR_CONNECTION_TIMED_OUT` w konsoli MG — od tej sesji błąd konsoli aktora niesie adres zasobu. Oglądane: MCP — MG i Marek w Chromium, Ola w Firefoksie; automat — to samo,
headless.

**Następny krok:** T3b (kroki 3.9–3.15) od `E2E_FROM=po-T3a`: sceny „Knajpa” i „Brama” z mapami,
ściany, drzwi, okno, światła, figury (żetony kreatora stają dopiero na aktywnej scenie —
`creationTokenDone = 0`), boty „Rzeźnik” i „Paser” (`@llm`, gateway), aktywacja, czat, punkt `po-T3`.
Solo ma jeszcze 4 pkt Zmysłu Walki do rozdzielenia — przed walką w T4.

### Sesja 26.09 — T1: infrastruktura E2E, instancja testowa, linia bazowa

**Rozstrzygnięcia MG na starcie:** T1 teraz; kolejność T1–T6 → refaktoryzacja → „Konta MG”; T1 bez
modelu (testy `@llm` pomijane). W trakcie: bloker #1 **naprawić od razu** (wyjątek od „tylko notuje”).

**Zrobione:** `packages/e2e` (Playwright Test 1.64-alfa, ta sama co MCP): instancja na :3101/:4173
z `e2e.db` i `.e2e/`, serwer z `dist/`, klient `--mode e2e` przez `vite preview`; procesy bez powłoki,
PID-y w `.e2e/instance.json`. Punkty kontrolne przez prawdziwe `snapshot`/`restore` serwera. Fixtures:
aktorzy w osobnych przeglądarkach, podsłuch z kanarkami, płótno przez kamerę, `node:sqlite` do asercji,
znacznik `@llm`. W aplikacji: `VTT_DICE_SCRIPT` (umowa `kosci`), hak `window.__vttE2E` (umowa `ui`),
cel proxy Vite z `VTT_API_TARGET`. Rejestr `testy-rejestr.md` założony.

**Linia bazowa (26.09, przed zmianami):** `shared` 2237, serwer 1228, klient 286, gateway 59 — zielone;
`tsc --noEmit` i ESLint czyste; `ruff` czysty. **Prettier:** kod czysty, niesformatowanych 13 plików
`.md` (m.in. `POSTEP.md`, `umowy-kodu.md`, `pulapki-dev.md` — celowo, patrz `POSTEP.md`) i
`.claude/settings.local.json` — stan znany, nie błąd. **Po T1:** serwer 1236 (+8 skryptu kości).

**Znalezione:** #1 **B0** — `dist/main.js` nie startował od etapu 33 (tsup zdejmował `node:` z
`node:sqlite`), naprawione (`ed681a8`), retest OK. **Z1** dla etapu 28 — brak ostrzeżenia o próbce
kompendium bez `data/private`. Produkcja z `VTT_DICE_SCRIPT` loguje „ignored in production”.

**Suita:** 12 testów (`00-baseline` 5, `01-dym` 7), ~38 s z buildem, zielona cztery razy z rzędu
(w tym raz `pnpm test:e2e --grep @szybkie` z korzenia). Oglądane automatem: MG w Chromium, Ola
w Firefoksie, headless. Porty po przebiegu wolne.

**Następny krok:** T3 (rozgrywka 1/4) — pierwsza sesja z modelem (bot „Paser” i „Rzeźnik”, 3.12,
3.14): przed nią `pwsh ai-gateway/scripts/start-gateway.ps1`. T2 może iść wcześniej albo później.

