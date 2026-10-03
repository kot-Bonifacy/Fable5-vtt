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
| 10  | T2   | B3   | serwer | Gracz spoza kampanii dostaje pulę portretów aktywnej kampanii | MG zakłada drugą kampanię, daje do niej zaproszenie i wraca do „Nocnej zmiany” → gracz „Obcy” wchodzi tym zaproszeniem → `GET /api/portrait-assets` zwraca 3 portrety graczy „Nocnej zmiany” (NPC „tylko MG” odfiltrowane); `/api/auth/me` podaje też nazwę aktywnej kampanii. Trasa sprawdza tylko zalogowanie (`requireAuth`), nie członkostwo | test `6.2.7 gracz spoza kampanii nie dostaje jej puli portretów (#10)` (`test.fail`); przy etapie „Konta MG” to przeciek między MG — tam do naprawy razem z uploadami za logowaniem (Z7) **Poprawka 01.10 (decyzja MG: razem z uploadami za logowaniem):** `/api/auth/me` i `/api/portrait-assets` biorą kampanię z `getUserActiveCampaign` (gracz spoza aktywnej kampanii: `null` i `[]`), `/uploads/` tylko dla zalogowanych (401); członkostwo per plik zostaje w Z7. | retest OK | a551f3a |
| 11  | T2   | B2   | serwer | Otwarte gniazdo działa po wylogowaniu i po wygaśnięciu sesji | gracz loguje się, gniazdo otwarte → `POST /api/auth/logout` (wiersz `Session` znika, HTTP 401, nowe gniazdo `UNAUTHORIZED`) → stare gniazdo dalej wysyła `chat:send` z sukcesem; to samo po `SESSION_TTL_DAYS`. Sesję sprawdza tylko `io.use` przy nawiązaniu | testy `6.2.8 otwarte gniazdo po wylogowaniu…` i `…wygasłej sesji traci prawa (#11)` (`test.fail`); **waga: decyzja MG z 26.09 (sesja T2) — B2 + zadanie Z** (Z8) **Poprawka 01.10:** gniazdo zna swoją sesję (pokój `session:<id>`); wylogowanie rozłącza wszystkie gniazda sesji, wygaśnięcie — zegar na `expiresAt` i odmowa `SESSION_ENDED`; klient dostaje `auth:ended` i wraca na ekran logowania z notką. **Sesja i link zaproszenia ważne rok** (decyzja MG z 01.10). | retest OK | a551f3a |
| 12  | T2   | B2   | serwer | Logowanie MG bez limitu prób                             | 30 złych haseł pod rząd z jednego adresu → 30 × 401 w 0,3 s, bez 429 i bez opóźnienia; prawdziwe hasło dalej działa | testy `6.2.11 …30 złych prób…` (pomiar) i `…trafia na limit (#12)` (`test.fail`); plan 6.2.11: brak limitu = B2 i zadanie (Z6) **Poprawka 01.10 (decyzja MG):** 10 złych haseł albo zaproszeń z adresu IP w 15 min → 429 z `Retry-After`, także na dobre hasło; inne adresy i otwarte sesje działają. Za Caddy `TRUST_PROXY=1` (Z11). Test 6.2.11 zgaduje z adresu w `X-Forwarded-For` (instancja E2E ma `TRUST_PROXY=1`). | retest OK | a551f3a |
| 13  | T2   | B1   | serwer | Zalew jednego gracza dławi innych ponad 5 s              | Marek wysyła naraz 500 `chat:send` i 2000 pośrednich `token:move` → czat Oli do MG dochodzi po 5,8–6,3 s, ruch MG u Oli po 5,8–6,3 s, czat MG na ekranie Oli (Firefox) po 6,8–7,7 s; zapisane 500/500, zero odmów. Diagnoza: same 2000 ruchów = 2,5 s (~1,2 ms/ruch), samo 500 wiadomości = 1,6 s (~3 ms/zapis); zwykły klient nie wysyła takiego tempa | test `6.2.4 zalew nie dławi innych graczy ponad 5 s (#13)` (`test.fail`), pomiar w adnotacji `6.2.4 zalew…`; **próg 5 s i waga B1: decyzja MG z 26.09 (sesja T2)**; lekarstwo = limit tempa (Z5) **Poprawka 01.10 (progi MG):** limit per konto w `registerEvents` — z ackiem 20/s z zapasem 60 (`RATE_LIMITED`), bez acku 40/s po cichu; MG też. E2E `emitAck`/`probe` ponawiają `RATE_LIMITED`. | retest OK | a551f3a |
| 14  | T2   | B1   | postac | Gracz trwale usuwa własną postać przyjętą do gry         | `character:delete` z gniazda gracza z id własnej, przyjętej karty (Kowal) → `{ ok: true }`, karta z historią znika, figury tracą kartę. W UI ✕ „Usuń postać” ma wyłącznie MG; serwer sprawdza tylko właściciela (`characters.ts`) | test `6.2.2 gracz nie usuwa własnej postaci przyjętej do gry (#14)` (`test.fail`); znalezione śmieciami gracza (`id + null`). **triaż MG 26.09 (sesja T2): B1**, jak #2 — gracz wykonuje akcję MG, bezpowrotnie | retest OK | `0b30a71` |
| 15  | T2   | B3   | serwer | Śmieciowe id kończą się `INTERNAL` zamiast odmowy (zbiorczo) | liczba spoza zakresu Int (`1e308`) albo zły typ trafia wprost do zapytania Prismy: gracz — `chat:history` (`beforeId`), `grapple:resist`, `facedown:resist`, `creation:finish` (`creationDraftId` nie-napis), `character:roll`, `check:request-cancel`, `inventory:respond`, `attack:evade`, `attack:smart`, `opening:toggle`, `drawing:update`, `drawing:delete`, `bot:proposal`; MG dodatkowo — `table:show`, `check:cancel`, `check:request-resolve`, `damage:apply`, `damage:undo`, `wall:update`/`delete`, `cover:update`/`delete`, `zone:update`/`fire`/`delete`, `light:update`/`delete`, `smoke:clear`, `netpoint:update`/`remove`, a `ai:ask` i `rules:ask` padają na `.trim is not a function`. Bez zapisu w bazie, serwer i klienci żyją | testy `6.2.3 śmieci gracza/MG: żadnego INTERNAL (#15)` (`test.fail`), lista w adnotacjach `fuzz-INTERNAL` i `fuzz-log`; **waga: decyzja MG z 26.09 (sesja T3a) — jeden zbiorczy B3** | retest OK | `574cf4d` |
| 16  | T4a  | B1   | statysta | Statysta z karty strzela bez poziomu broni (`statBlock.weaponSkill`) | statysta z „Statystyk bojowych” (Zbir: Broń krótka 6) → MG zaznacza go i celuje z Alt w Kowala albo bot „Rzeźnik” gra turę → karta ataku: „Broń krótka (nietrenowana) +0” zamiast +6; to samo w turze bota. `attack:roll` z `characterId` bierze kartę wprost (`parseCharacterData`), bez `sheetForRoll` — ścieżka figury bez `characterId` dolicza poziom broni, ale klient i bot wysyłają `characterId`, bo od 38a statysta ma kartę | test `#16 statysta z karty strzela z poziomem broni` (`test.fail`), adnotacja „strzał Rzeźnika” w 4.4 (`Broń krótka (nietrenowana) 0`); `realtime/attacks.ts` ok. 940 (`character ? { data: parseCharacterData(…) }`) | retest OK | `0b30a71` |
| 17  | T4a  | B1   | dane   | Postać bez broni nie uderzy pięścią — brak wpisu Bijatyki i Sztuk walki | kompendium z `data/private`: typy „Bijatyka” i „Sztuki walki” istnieją (`weapon-types.json`), ale żaden wpis broni ich nie ma → filtr typów w Kompendium MG ich nie pokazuje, „+ Broń z katalogu” nic nie znajduje, pasek Iskry (bez broni) nie ma slotu ataku; atak wręcz bez broni wymaga wiersza typu Bijatyka (`UNARMED_TYPE_IDS`). Obejście MG: „+ Własny wpis” (Broń, typ Bijatyka) i „+ Broń z katalogu” na każdej karcie. **Triaż MG 26.09 (sesja T4a): B1** — pięść to akcja z podręcznika dostępna każdemu | test `#17 kompendium z podręcznika ma broń typu Bijatyka` (`test.fail`); scenariusz gra obejściem („Pięści” z własnego wpisu) | retest OK | `574cf4d` |
| 18  | T4a  | B2   | dane   | Granatu ręcznego nie da się kupić ani dopisać z katalogu | typ „Granat” (6k6, rzucany, obszar 10×10 m, sklep: poziom 3) nie ma żadnego wpisu broni w kompendium z podręcznika; jedyny granat ręczny („Puszka hukowa”) był w wymyślonej próbce, którą #5 zdjął z kompendium. Obejście MG: „+ Własny wpis” (Broń, typ Granat, magazynek = liczba sztuk). **Triaż MG 26.09 (sesja T4a): B2** | test `#18 kompendium z podręcznika ma granat ręczny` (`test.fail`); scenariusz: „Granat odłamkowy” z własnego wpisu, 2/2 na karcie Kowala | retest OK | `574cf4d` |
| 19  | T4a  | B1   | serwer | „Kończę turę” oddaje graczowi pełny widok walki MG | walka z ukrytą figurą (Cień) i klonem z aliasem → gracz w swojej turze klika „Kończę turę” → odpowiedź (ack) `combat:next` niesie `emitReloaded(…)`, czyli widok MG: ukryty uczestnik z `"hidden":true`, id jego figury i prawdziwe imię klona (`Szrama KANAREK-prawdziwe-imie`). Pushe `combat:update` do gracza są filtrowane, ack — nie. Ten sam `return emitReloaded(…)` kończy inne zdarzenia walki dostępne graczowi w `combat-actions.ts` (Akcja, Wstrzymanie, teren…) — do sprawdzenia przy poprawce. T2 tego nie złapał: podsłuch surowych gniazd nie sprawdzał kanarków w ackach | test `4.3 „Kończę turę” nie oddaje graczowi widoku walki MG (#19)` (`test.fail`), adnotacje „wyciek u Marek/Ola” z wycinkiem ramki `43…[{"ok":true,"data":{…}}]`; Marek (Chromium) i Ola (Firefox) | retest OK | `0b30a71` |
| 20  | T4a  | B1   | boty   | Propozycja bota zatwierdzona dwa razy wykonuje się dwa razy | tura bota (Propozycja) → MG klika „Zatwierdź” ponownie, zanim karta zmieni się na „Zatwierdzone” (klient MG wstrzymuje zmiany do końca animacji kości, więc to trwa kilkanaście sekund) → oba zatwierdzenia przechodzą; w jednym przebiegu Rzeźnik oddał 7 strzałów w jednej turze (`attack.count: 7`, `overspent: 5`), a kolejka gatewaya urosła do 6. `bot:proposal` sprawdza `resolution` przed `resolveBotCombatProposal` (akcja + następny krok bota), a zapisuje je po nim; bot działa ręką MG, więc budżet tury tylko liczy przekroczenie. Dwie ODMOWY naraz serwer rozstrzyga dobrze | test `#20 propozycję bota zatwierdza się raz` (`test.fail`) — dwa `bot:proposal` z `approve: true` naraz → oba `ok`; `realtime/bot-actions.ts` ok. 455–495 | retest OK | `0b30a71` |
| 21  | T4a  | B3   | boty   | „Brak połączenia z AI Gateway” przy zajętym modelu | gateway odpowiada 503 (pełna kolejka po #20 albo model chwilowo niegotowy) → karta tury bota i ślad u MG: „Brak połączenia z AI Gateway”, choć gateway żyje (`/health` = ok); dziennik decyzji ma `failure: "AI_UNAVAILABLE"`. `bot-combat.ts` podmienia każdy `run.failure` na to jedno zdanie — MG szuka awarii sieci zamiast poczekać | `.e2e/bot-decisions.jsonl` (lokalnie) z 26.09 17:48 i 17:53 — `tookMs` 13 i 6; `realtime/bot-combat.ts` ok. 833–841; **retest 30.09:** atrapa gatewaya (`/health` = ok, `/chat` → 503 „kolejka pełna (4/4)”), instancja E2E z `po-T4a`, `bot:play-turn` Rzeźnika → ack i `bot:action-trace`: „Model jest zajęty albo jeszcze niegotowy (kolejka pełna (4/4)) — AI Gateway działa, spróbuj za chwilę.” | retest OK | `0b30a71` |
| 22  | poprawki 26.09 | B1 (do triażu MG) | atak | Strzał statysty utrwala na karcie podstawiony poziom broni | statysta z „Statystyk bojowych” (Broń krótka 4) strzela z żetonu → wydany nabój zapisuje na kartę **arkusz do rzutu** (`source.data`) zamiast karty z bazy → w `skills` zostaje `handgun: 4`, a podniesienie poziomu w edytorze przestaje działać (karta wygrywa z `statBlock.weaponSkill`); figura z Wartością bojową dostałaby tak wyzerowane Cechy. Znalezione przy poprawce #16, która bez tego rozszerzyłaby błąd na strzał po `characterId` | test serwera `fires by its card with the weapon level of its stat block (#16)` (karta po strzale ma tylko `evasion`, poziom 6 z edytora działa); `spendAttackCosts`, `jamPoorWeapon` w `realtime/attacks.ts`; **retest 30.09 (decyzja MG):** pokrywa go retest #16 z 27.09 (T4a od `po-T3`, strzał statysty po karcie) | retest OK | `0b30a71` |
| 23  | T4b  | B2   | atak   | Karta obrażeń strzału statysty podpisana pierwszą kartą statysty | Cień (statysta z kartą) strzela w Kowala → MG klika „Obrażenia” na jego karcie ataku → karta obrażeń na czacie (publiczna): aktor **„Zbir”**, tytuł „**Ciężki** pistolet — obrażenia (Głowa)”, choć strzelał Cień z bardzo ciężkiego pistoletu. `AttackControls.tsx` ok. 39 szuka strzelca wśród kart po **id wiersza broni**, a każdy statysta ma ten sam `STATIST_WEAPON_ROW_ID = 'statist-weapon'` — wygrywa pierwsza karta w magazynie. Liczby obrażeń idą z zapisanej karty ataku (poprawne). Gdyby pierwszą kartą statysty była figura ukryta, jej imię trafiłoby do graczy (wtedy B1) | test `#23 karta obrażeń ze strzału statysty podpisana strzelcem (Cień)…` (`test.fail`), adnotacja „karta obrażeń Cienia: Zbir · Ciężki pistolet — obrażenia (Głowa)”; **triaż MG 27.09 (sesja T4b): B2** | retest OK | `574cf4d` |
| 24  | T4b  | B1   | atak   | Cios wręcz w figurę po skosie tuż obok: „za daleko” | Iskra na (6, 19), Rzeźnik na (5, 18) — sąsiednie pola po skosie → klik w Rzeźnika z pięściami w ręku → notka „Do ataku wręcz cel musi być nie dalej niż 2 m.”, brak rzutu. Odległość liczy się po prostej między środkami (2,83 m → 3 m, `metresForRules`), a zasięg ręki to 2 m (`CPRED_MELEE_REACH_M`); to samo dotyczy Pochwycenia i przenoszenia przedmiotów. Na siatce 2 m pole po skosie to „obok”. Obejście: stanąć bokiem | test `#24 cios wręcz w figurę stojącą po skosie tuż obok…` (`test.fail`), adnotacja „pięść po skosie: odmowa „za daleko””; **triaż MG 27.09 (sesja T4b): B1** — sąsiad po skosie jest w zasięgu | retest OK | `574cf4d` |
| 25  | T4b  | B3   | mapa   | Grot kierunku figury przykrywa środek sąsiedniej i łapie klik | Iskra (5, 19) zwrócona na północ pod Rzeźnikiem (5, 18) → MG klika środek Rzeźnika → zaznacza się **Iskra** (klik w pasie 700–720 px na zrzucie; wyżej i niżej — Rzeźnik). Od 26.09 grot jest uchwytem obrotu (`f26ed9c`, `nosePolygon`) i wystaje poza oprawę na pole sąsiada. W tłoku MG zaznacza nie tę figurę; gracz klikający cel leżący na własnym grocie zaznaczy siebie. Obejście: klik poza grotem | oględziny MCP (Chromium, MG) na stanie z przebiegu T4b; suita klika poza grotem (`upperOf`, `walk(…, 'lower')`); **triaż MG 27.09 (sesja T4b): B3** | retest OK | `574cf4d` |
| 26  | T4b  | B1   | atak   | Tę samą kartę obrażeń „Zastosuj” wykonuje wiele razy na tym samym celu | karta obrażeń pięści Iskry zastosowana do Rzeźnika → drugie `damage:apply` z tym samym `messageId` i `tokenId` → `ok`, Rzeźnik traci PW drugi raz, a rana krytyczna losuje się od nowa (przypadkiem: „Złamana ręka” wytrąciła mu pistolet). Przy stole jak #20: klient MG pokazuje nową kartę dopiero po animacji kości, więc „ostatnia” widoczna karta jest stara — w tej sesji automat dwa razy przypadkiem zastosował starą kartę (drugą pięść w Rzeźnika i strzał z T4a w martwego Zbira, który stracił punkt pancerza). `damage:apply` (`realtime/damage.ts` ok. 168) nie pamięta, co już zastosowano; „Cofnij” istnieje | test `#26 tej samej karty obrażeń nie stosuje się drugi raz…` (`test.fail`, sam cofa drugie zastosowanie), adnotacja `{"ok":true,"data":{"messageId":…}}`; **triaż MG 27.09 (sesja T4b): B1, jak #20** | retest OK | `574cf4d` |
| 27  | T4b  | B1   | ekwipunek | Zdobyczna broń statysty robi z gracza strzelca ataków wszystkich statystów | Kowal przeszukuje martwego Zbira, bierze jego pistolet i daje Iskrze → wiersz na karcie Iskry ma id **`statist-weapon`** (id wiersza jedzie z łupem; `landedRow` zmienia je tylko przy kolizji na karcie odbiorcy) → (1) Ola widzi „Obrażenia” na karcie ataku Cienia na Kowala (przyczyna jak #23); (2) `character:roll` Oli z `characterId` Iskry, `kind: 'damage'` i `attackMessageId` strzału Cienia → `ok`, rzut obrażeń za cudzy atak na czacie. Serwer bierze `weaponRowId` z zapisanej karty ataku i sprawdza tylko, czy taki wiersz jest na karcie rzucającego | test `#27 zdobyczny pistolet statysty nie robi z Iskry strzelca cudzych ataków` (`test.fail`), adnotacje „„Obrażenia” u Oli na strzale Cienia: 1”, „rzut obrażeń Cienia z karty Iskry: {"ok":true,…}”, „id wiersza pistoletu u Iskry: statist-weapon”; **triaż MG 27.09 (sesja T4b): B1** — gracz wykonuje cudzą akcję | retest OK | `574cf4d` |
| 28  | T5a  | B2 (do triażu MG) | mapa | Marsz pod skraj ręcznej mgły wraca na start, choć planer go narysował | „Brama” (kratka 36,2 px), mgła odsłonięta od x = 560 → Marek zaznacza Kowala na (19, 27) i klika parking pod mgłą → planer prowadzi figurę do skraju drogi (pole 15, x = 543), figura przechodzi całą trasę, a serwer na końcu odmawia (`MOVE_REFUSED`) i odsyła ją na start. `firstClosedFloorStep` → `everyRunCell` liczy kolumnę z `Math.floor(543 / 36.2)` = **14** (14,999…), a kolumna 14 jest pod mgłą; planer klienta uznał pole 15 za odsłonięte. Dotyczy każdej sceny z niecałkowitą kratką (1448 / 40, 1470 / 33) i ręczną mgłą. Obejście: klikać cel z dala od skraju mgły albo poprosić MG o szersze odsłonięcie | test `#28 marsz klikiem w mgłę staje na skraju odsłoniętego…` (`test.fail`), adnotacja „marsz pod skraj mgły”; ramka `token:move` z `"final":true,"path":[{"x":579.2,…},{"x":543,…}]` → `{"ok":false,"error":"MOVE_REFUSED"}`; `node -e "Math.floor(543/36.2)"` = 14. Poprawka: `everyRunCell` z pikselem luzu na obu brzegach (test w `fog-floor.test.ts`); retest: test `#28` zielony — Kowal staje pod skrajem drogi | retest OK | `77e0f6f` |
| 29  | T5a  | B3 (do triażu MG) | ui | Odmowa ruchu poza walką odsyła gracza do karty odmowy, której nie ma | gracz poza walką przeciąga własną figurę w mgłę (albo trafia na #28) → notatka „Ruch odrzucony — sprawdź kartę odmowy na czacie.”, a karty nie ma: `refuseWalkIntoFog` i `refuseWalkThroughSolid` piszą kartę (`logMovementRefusal`) tylko uczestnikowi walki. Zdanie `MOVE_INTO_FOG_MESSAGE` („Tam jeszcze nic nie widać…”) poza walką nie dociera do nikogo | test `#29 odmowa ruchu poza walką mówi graczowi dlaczego…` (`test.fail`), adnotacja „notatka Marka”: `["Ruch odrzucony — sprawdź kartę odmowy na czacie."]`, zero nowych wierszy czatu. Poprawka: `refuseWalkIntoFog`/`refuseWalkThroughSolid` rzucają `MOVE_INTO_FOG`/`MOVE_BLOCKED_BY_TERRAIN`, notka klienta mówi powód; retest: test `#29` zielony, 5.1 dostaje `MOVE_INTO_FOG` | retest OK | `77e0f6f` |
| 30  | T5a  | B2 (do triażu MG) | mapa | Na scenie z ręczną mgłą gracz nie ma klamki drzwi i bram, które wolno mu otwierać | „Brama” (ręczna mgła), brama `playerToggle`, linia bramy odsłonięta, Kowal tuż obok → magazyn ścian Marka ma `openings: []`, klamki 🚪 nie ma, klik w bramę jest rozkazem marszu. `computeViewerVision` (`realtime/vision.ts`) wysyła `openings` tylko na scenie Dynamicznej (`dynamic ? visibleOpeningsFor(…) : []`), a `opening:toggle` z gniazda Marka przechodzi (`{"ok":true}` — serwer pozwala). Obejście: otwiera MG | test `#30 na ręcznej mgle gracz dostaje klamkę bramy…` (`test.fail`); scenariusz otwiera bramę ręką MG. Poprawka: `standingOpeningsFor` (klamki na scenie bez Dynamicznej, na mgle tylko odsłonięte; test w `fog-walk.test.ts`); retest: test `#30` zielony, w 5.2 bramę otwiera Marek swoją klamką | retest OK | `77e0f6f` |
| 31  | T5a  | B1 (do triażu MG) | siec | Niezłamane hasło na piętrze wejścia nie blokuje zjazdu niżej | architektura z hasłem na piętrze 1 → Ola podłącza się (stoi na haśle) i klika piętro 2 → zjeżdża na Plik bez Backdoora, bez komunikatu. `netCanMove` sprawdza hasła na `path.slice(0, -1)`, a `netRunPath` zwraca drogę **bez** piętra startowego — hasło, na którym netrunner stoi, nigdy nie trafia do pętli. Podręcznik: „Nie możesz jednak ominąć przeszkody sieciowej… takiej jak hasło” (s. 198); hasło na pierwszym piętrze (typowe) nie chroni niczego | test `#31 niezłamane hasło na piętrze wejścia blokuje zjazd niżej` (`test.fail`), adnotacja „zjazd przez niezłamane hasło”: piętro 2, brak komunikatu; `shared/src/systems/cpred/netrun.ts` (`netCanMove`, `netRunPath`). Poprawka: `netCanMove` sprawdza też piętro startowe przy zjeździe niżej (test w `netrun.test.ts`); retest: test `#31` zielony — „Hasło: szlaban (PT 8) blokuje drogę” | retest OK | `77e0f6f` |
| 32  | T5a  | B1 (do triażu MG) | siec | Nazwa architektury Sieci dociera do netrunnera-gracza | Ola podłącza się do gniazda „Bramy” → ack `netrun:start` i `netrun:sync` niosą `run.architectureName` = „Ochrona bramy KANAREK-nazwa-architektury…”, a klient ma ją w `aria-label` okna („Sieć: …”). Nagłówek pokazuje graczowi „SIEĆ”, a widok gniazda celowo wycina nazwę (`toAccessPointView`: „What the architecture is called never travels to a player”); `netRunView` (`shared`) wkłada ją każdemu | test `#32 nazwa architektury nie dociera do netrunnerki` (`test.fail`), adnotacja „wyciek u Ola” z wycinkiem ramki; Marek (bez runu) nie dostaje. Poprawka: `netRunView` daje `architectureName` tylko MG (test w `netrun.test.ts` serwera); retest: test `#32` zielony, nazwa jest kanarkiem dla obojga graczy do końca T5a | retest OK | `77e0f6f` |
| 33  | T5a  | B2 (do triażu MG) | siec | Strefy bronionej nie da się w UI związać z węzłem kontrolnym | MG stawia strefę „Automatyczna wieżyczka” i węzeł z urządzeniem „Wieżyczka” w architekturze → karta strefy ma stanowisko, przepustki i notatkę, ale ani ona, ani pasek narzędzia nie wskazują węzła; serwer umie (`zone:update` z `architectureId/floorId/deviceId`, `zoneDisarmedByNetrunner`), więc wyłączenie wieżyczki przez netrunnera **nie** rozbraja strefy. Obejście: MG klika „Rozbrój” na karcie strefy | test `#33 karta strefy wiąże ją z węzłem kontrolnym…` (`test.fail`); scenariusz wiąże strefę zdarzeniem z gniazda MG, żeby T5b sprawdził most serwera. Poprawka: pole „Węzeł kontrolny” na karcie strefy (`SceneCardZone.tsx`); retest: test `#33` wiąże strefę z karty, krok obejścia zdjęty | retest OK | `77e0f6f` |
| 34  | T5b  | B3 | ui | Okno runu stoi na czarnym pasie kolejki netrunnera i na pasku narzędzi oraz czacie MG | walka z netrunnerem w Sieci → okno runu Oli otwiera się w (200, 80) i przykrywa pas kolejki (y 56–112): kość „Rzuć inicjatywę” jest pod belką okna, klik trafia w okno; u MG to samo okno przykrywa pasek narzędzi mapy (mgła) i czat z kartami „Obrażenia”. Klamra okien trzyma okno całe na ekranie, więc nie da się go wypchnąć — trzeba je zwęzić uchwytem i przestawić. Obejście: przeciągnąć okno za belkę (położenie zapamiętuje się, przeżywa F5) | test `#34 okno runu netrunnerki nie zasłania czarnego pasa kolejki` (`test.fail`), adnotacja „okno i pas”: okno `{x:200,y:80,w:560,h:780}`, pas `{x:272,y:56,w:1008,h:56}`; scenariusz odsuwa oba okna (`tuckRunWindow`); **triaż MG 29.09: B3**. Poprawka: `netRunFallback` — okno otwiera się przy prawej krawędzi mapy pod pasem kolejki i znacznikiem „Czeka na MG” (miejsce na pas rezerwowane także przed walką), wysokość przycięta do ekranu; retest: test `#34` zielony dla Oli i MG (pas, narzędzia mapy, panel z czatem) | retest OK | `8277386` |
| 35  | T5b  | B3 | boty | Pad gatewaya w turze bota: MG dostaje kod błędu zamiast zdania | „Graj turę” Strażnika → pośrednik zrywa połączenie w trakcie `POST /chat` → notka MG „🤖 Strażnik: tura się nie odbyła (INTERNAL).”, w logu serwera `realtime handler failed bot:play-turn TypeError: terminated` (zerwany strumień SSE w `ai/gateway.ts`: pętla `parseSse` bez `try`, więc błąd nie staje się `AI_UNREACHABLE`); drugie „Graj turę” przy martwym gatewayu → „(AI_UNAVAILABLE).” — `BotTurnButton` wkleja kod. Stan nie wisi: przycisk wraca, boty „offline”, żadnej propozycji, MG gra ręką. Ta sama pętla SSE obsługuje asystenta zasad i inne strumienie — do sprawdzenia przy poprawce | test `#35 pad gatewaya w turze bota: MG dostaje zdanie, a nie kod błędu` (`test.fail`); `.e2e/logs/server.log` (lokalnie, poziom 50); **triaż MG 29.09: B3**. Poprawka: `streamChat` łapie zerwany strumień jako `AI_UNREACHABLE` (przerwanie sygnałem dalej wyjątkiem), „Graj turę” pisze zdanie z `botTurnErrorText`; test `ai/gateway.test.ts`; retest: test `#35` zielony — „Brak połączenia z AI Gateway.” i „model jest niedostępny… zagraj tę turę ręką.” | retest OK | `8277386` |
| 36  | T5b  | B3 | mapa | Klik w środek pola tuż przed zaznaczoną figurą nie rusza jej (łapie uchwyt obrotu) | Kowal zaznaczony, patrzy na wschód (90°) → klik w środek pola na wschód obok → nic: marsz nie rusza, figura się nie obraca, żadnej notki; klik w dolną część tego samego pola rusza. `facingKnob` (27j, od 26.09 grot jest uchwytem): przy oddalonej kamerze punkt chwytu leży w odległości `outer + NOSE_GAP + tip/2` od środka, a `reach` ≥ 10 px ekranu — sięga środka sąsiedniego pola. W walce wygląda jak „figura nie chce iść o jedno pole” (w T5b trzy próby pod rząd) | test `#36 klik w środek pola przed figurą rusza ją…` (`test.fail`), adnotacja „patrzy 90°, przed [25,11], po [25,11]”; oględziny MCP (Chromium, Marek na `[::1]`): klik w (822, 506) — nic, w (822, 522) — marsz; **triaż MG 29.09: B3**. Poprawka: obrót grotem zaczyna się dopiero za progiem kliknięcia (`rotating.moved`), puszczenie w miejscu to zwykły klik; **druga przyczyna znaleziona przy reteście**: aureola tury (`turnRing`) w turze figury łapała klik w środek sąsiedniego pola (5.9 — Kowal patrzył w drugą stronę) — `eventMode = 'none'`; retest: test `#36` zielony, pomocnik `walk` klika znowu w środek pola | retest OK | `8277386` |
| 37  | T5b  | B1 | siec | Opis piętra węzła kontrolnego dociera do gracza spoza runu | Ola przejmuje węzeł („Węzeł: wieżyczka …” — etykieta piętra z edytora Architektury) → „Tura Demona” (nieudany Test Kontroli) i strzał Oli z wieżyczki piszą wiersz dziennika `action` do całego stołu z etykietą piętra: „Węzeł: wieżyczka KANAREK-pietro-wezla — Test Kontroli nieudany (PT 13). · Paf chybia.” i „Węzeł: wieżyczka KANAREK-… · Wieżyczka nad placem — strzał…”. Marek (nie jest w Sieci) dostaje etykietę piętra, którą widzi tylko netrunnerka, która na nie weszła (26b: „reszta stołu widzi skrót, nie zawartość Architektury”). `nodeName` w `realtime/netdemons.ts` (Tura Demona) i `realtime/netdevices.ts` (`${nodeName} · ${summary}`) | test `#37 opis piętra węzła nie dociera do gracza spoza runu` (`test.fail`), adnotacja „wyciek u Marek” z ramką `chat:message` (`kind: action`, `note`); **triaż MG 29.09: B1**. Poprawka (decyzja MG 29.09: skrót dla stołu + pełny wiersz dla MG i netrunnera): `logNetLineWithSecret` — publicznie „węzeł kontrolny” i urządzenie pod nazwą z mapy, pełny wiersz `gmaction` z adresatem (znaczek „poufne”); to samo dla „Kopii Pliku”; test w `netdevices.test.ts`; retest: test `#37` zielony, kanarek piętra zostaje pod kontrolą do końca T5b | retest OK | `8277386` |
| 38  | T5b  | B3 | siec | Netrunnerka nie rzuca obrażeń za strzał wieżyczki, którą prowadzi | Ola przejmuje węzeł i strzela wieżyczką w Strażnika (jej REF i Broń krótka, trafienie) → „Obrażenia 4k6” na karcie ma tylko MG (MG: 1, Ola: 0, Marek: 0). Od #23/#27 strzelca karty wskazuje `attackerTokenId` = żeton wieżyczki bez właściciela. Obejście: rzuca MG. Może być zamierzone — do decyzji MG | test `#38 netrunnerka rzuca obrażenia za strzał wieżyczki…` (`test.fail`), adnotacja „przycisk „Obrażenia” za wieżyczkę”; **triaż MG 29.09: B3**. Poprawka (decyzja MG 29.09: rzuca netrunnerka): karta strzału niesie `operatorUserId`, serwer wpuszcza to konto do rzutu obrażeń za tę kartę, klient bierze adres z karty (Ola nie widzi figury wieżyczki); test w `netdevices.test.ts`; retest: test `#38` zielony, obrażenia 5.5 rzuca Ola | retest OK | `8277386` |
| 39  | T5b  | B3 | siec | Strzał wieżyczki ze strefy idzie na konto gracza, który w nią wszedł | Kowal (Marek) wchodzi w strefę „Automatyczna wieżyczka” → karta strzału na czacie: „Wieżyczka (Marek)”, autor wiadomości = konto Marka (kości, animacja i historia rzutów Marka), a karta obrażeń tej samej wieżyczki — „Wieżyczka (MG)”. `runZonesAfterMove` → `fireZone` → `fireDevice` z użytkownikiem, który ruszył figurą | test `#39 strzał wieżyczki ze strefy nie idzie na konto gracza…` (`test.fail`), adnotacja „autor karty”: `{"name":"Marek","role":"PLAYER"}`; **triaż MG 29.09: B3**. Poprawka: `systemHand` — strefa odpala się kontem MG (strzał, karta obrażeń, wiersz strefy), Percepcja zostaje rzutem gracza; test w `zones.test.ts`; retest: test `#39` zielony | retest OK | `8277386` |
| 40  | T6a  | B3 | ekwipunek | Karta czatu handlu z NPC-em niesie graczowi id karty NPC-a | Marek (Kowal) proponuje handel Paserowi z menu figury, MG prowadzi stronę NPC-a, wymiana Ronin ↔ 400 ed → karta czatu `kind: inventory` („Kowal ⇄ Paser”) jedzie do Marka z `inventory.toCharacterId` = id karty Pasera. Umowa handlu (`trade:partners`, `trade:invite`): „Id karty NPC-a gracz poznawać nie ma” — NPC-a gracz wskazuje figurą. Treści karty id nie odsłania (serwer pilnuje własności przy każdym zdarzeniu), ale to ten sam wpis `InventoryMoveEntry` co przy łupie z 38b (`fromCharacterId` ciała statysty) — do sprawdzenia przy poprawce | test `#40 id karty NPC-a nie dociera do gracza w karcie czatu handlu` (`test.fail`), adnotacja „wyciek u Marek” z ramką `chat:message` (`"toCharacterId":"…","toName":"Paser","toOwnerId":null`); `postInventoryCard` w `realtime/trade.ts`; **triaż MG 30.09: B3**, zakres: karta czatu **i** obie listy — odbiorcy przelewu (`economy:history`) i cele przekazania (`inventory:sources`) niosły graczowi id i prawdziwe nazwy wszystkich kart kampanii; od poprawki gracz widzi drużynę (karty graczy i towarzyszy-botów), NPC-owi płaci i daje przez figurę; retest: T6a od `po-T5` bez `test.fail` (także lista odbiorców Marka bez Pasera), 4 przebiegi | retest OK | `21cbedd` |
| 41  | T6a  | B3 | postac | Medyk-gracz nie zoperuje drugiego gracza — montaż z chirurgiem-postacią uruchamia tylko MG | Ola bierze Rolę Medyka i punkt w Chirurgię (Chirurgia 2) → Marek w Kompendium, wpis „Cyberoko”, cel Kowal: lista chirurgów ma tylko „Bez Testu montażu” (Iskry nie ma); Ola: lista pacjentów ma tylko „Iskra”. Surowe `character:cyberware` z `surgeon: { kind: 'character' }` → `CHARACTER_NOT_FOUND` z obu stron: `resolveSurgeon` woła `requireRollableCharacter` dla chirurga **i** pacjenta na koncie klikającego. Gracz może sam wszczepić bez Testu montażu (płaci, rzuca Człowieczeństwo). Obejście: montaż klika MG (wybiera Kowala i „Iskra — Chirurgia 2”, Test rzuca się za Iskrę). Poprawka wymagałaby zgody drugiej strony (jak propozycja przy `inventory:give`) | test `6.3 gracze sami nie spinają operacji…` (dokumentuje stan, nie `test.fail` — oczekiwane zachowanie do decyzji MG), adnotacje „chirurdzy w Kompendium Marka”, „pacjenci w Kompendium Oli”, oba acki `CHARACTER_NOT_FOUND`; scenariusz montuje ręką MG (6.3/6.5); **triaż MG 30.09: B3, do zrobienia** — pacjent prosi, Medyk przyjmuje i ustala cenę (domyślna widoczna, zero dozwolone, wyższa wraca do pacjenta), cała kwota na kartę Medyka, bez warunku zasięgu; retest: T6a 6.3/6.5 — Marek prosi w Kompendium, Ola (Firefox) wycenia na 150 ed, Marek zatwierdza, Test za Iskrę, 150 ed na jej kartę | retest OK | `21cbedd` |
| 42  | T6b  | B1 | tura | Ustabilizowanie poza walką nie ma drogi w UI — naturalne leczenie po walce nie rusza | Po walce (T5b) Kowal 12/50 PW, `recovery.stabilized = false` → Ola zaznacza Iskrę (Medyk, Pierwsza pomoc 2) obok Kowala, pasek akcji pokazuje slot „Ustabilizowanie”, klik → nic (formularz `stabilize` rysuje się w `CombatHud.tsx` tylko przy `combat && context.combatant`; karta Kowala mówi „Ktoś musi wykonać Akcję »Ustabilizowanie«”, „Dzień odpoczynku” wyszarzony, `character:rest` → `refusal: notStabilized`). Serwer przyjmuje rzut `stabilize` także poza walką (`spendStabilizeAction` bez walki nic nie pobiera) — brakuje tylko wejścia w UI. **Obejście przy stole:** MG zaczyna walkę („Tylko postacie graczy”), Medyk stabilizuje w swojej turze, MG ją kończy. **Sugestia poprawki (MG, 30.09):** Ustabilizowanie dostępne także poza walką — z paska akcji Medyka (podręcznik: każdy z Pierwszą pomocą albo Paramedykiem), bez kosztu Akcji. | `t6b-czas-kopie.spec.ts` › „6.6b #42 …” (`test.fail`), zrzut paska Iskry w adnotacji; obejście — „6.6d” **Poprawka 01.10 (decyzja MG):** poza walką slot otwiera `StabilizeNearbyPicker` — medyk i widoczne figury w zasięgu ramienia, bez kosztu Akcji. | retest OK | a551f3a |
| 43  | T6b  | B3 | boty | Licznik „Zakończ sesję i streść (N)” u MG nie rośnie z nowymi wypowiedziami | MG ma otwartą zakładkę „Dziennik” (licznik 4) → Marek mówi do Pasera, bot odpowiada (w bazie 6 wypowiedzi po ostatnim streszczeniu) → guzik dalej „(4)”; streszczenie obejmuje 6 i zapisuje `lineCount: 6`. `pendingLines` przychodzi wyłącznie z `journal:list` (wejście w zakładkę), żadne zdarzenie czatu go nie podbija — przy „(0)” guzik jest wyszarzony, choć jest co streszczać. Obejście: przełączyć zakładkę i wrócić. | `t6b-czas-kopie.spec.ts` › „6.7c #43 …” (`test.fail`), adnotacja `{ przedRozmowa: 4, wBazie: 6 }` **Poprawka 01.10:** `journal:pending` do pokoju MG po każdej wypowiedzi `say` i po zmianie granicy streszczenia (liczba z bazy). Waga B3 (MG, 01.10). | retest OK | a551f3a |
| 44  | T6b  | B3 | kopie | „4 figur straciło powiązanie” — zdanie po imporcie sceny zna dwie formy liczby mnogiej zamiast trzech | Import sceny „Brama” (4 figury powiązane z kartami) do nowej kampanii na pustej instancji → komunikat „Scena weszła w podglądzie. 4 figur straciło powiązanie z kartą lub właścicielem…”. `realtime/archive.ts:126`: `=== 1 ? 'figura straciła' : 'figur straciło'` — brakuje formy 2–4 („figury straciły”, poza 12–14); rdzeń ma do tego wzorzec (`gameDaysLabel`, umowa `czas`). | `t6b-czas-kopie.spec.ts` › „#44 …” (`test.fail`), notatka importu w adnotacji 6.8b **Poprawka 01.10:** `polishPlural` w rdzeniu (`shared/src/plural.ts`), też w `gameDaysLabel`. Waga B3 (MG, 01.10). | retest OK | a551f3a |
| 45  | T6b  | B2 | boty | Bot i kronikarz zwracają się do gracza nazwą konta („Marek”), nie postaci („Kowal”) | Marek (właściciel karty Kowala) pisze na czacie do Pasera → wiersz `say` ma `speakerName = null`, więc historia czatu w prompcie bota i transkrypt streszczenia (`speakerName ?? author.name`, `bot-turns.ts`, `journal.ts` › `readTranscript`) podpisują go „Marek”. Paser: „niech ci będzie, Marek”, „Dobrze, Marek, odpoczywaj”; streszczenie: „Marek zapytał Strażnika…”. **Decyzja MG z 30.09 (sesja T6b) cofa umowę `boty` z 24.09** („relacja mówi, pod jakim podpisem pisze postać” — łatała tylko relację dopiskiem „na czacie podpisuje się…”): bot ma mówić do **postaci**. Kierunek poprawki: podpis wypowiedzi gracza z postaci, którą mówi (`speakingCharacter` w `relations.ts` już ją wybiera — postać na scenie, inaczej jedyna/pierwsza), w historii bota i w transkrypcie kronikarza; dopisek z `relationPromptLines` do zdjęcia. | `t6b-czas-kopie.spec.ts` › „#45 …” (`test.fail`, podpisy wypowiedzi Marka z bazy), odpowiedzi Pasera w adnotacjach 6.7b, `.e2e/tmp/t6b/streszczenie-*.txt` **Poprawka 01.10 (decyzja MG: „Kowal” wszędzie, także na czacie):** `say` i szept do bota gracza zapisują `speakerName` = postać (`speakingCharacter`), konto w podpowiedzi autora (`accountName`); lista „przy stole” w prompcie bez kont z postacią, szept bota do postaci, dopisek relacji zdjęty (`BOT_PROMPT_VERSION` 5). Waga B2 (MG, 01.10). | retest OK | a551f3a |
| 46  | T7a  | B3 | boty | Tura bota po limicie `AI_REQUEST_TIMEOUT_MS` kończy się `INTERNAL` i notką „coś poszło nie tak po stronie serwera” | Gateway zdrowy (`llama: ready`), `POST /chat` oddaje kolejkę i milczy 3 min (atrapa `fixtures/fake-gateway.ts`) → MG „🤖 Graj turę” Rzeźnika → po 120 s przycisk wraca, notka: „🤖 Rzeźnik: tura się nie odbyła — coś poszło nie tak po stronie serwera; zagraj ją ręką.”, log serwera: `realtime handler failed` · `bot:play-turn` · `TimeoutError: The operation was aborted due to timeout`. `streamChat` przepuszcza wyjątek przerwania dalej (`if (effective.aborted) throw error`), a tura bota go nie łapie. Stół w tym czasie gra normalnie (czat ~70 ms, ruch MG ~50 ms), tura zamyka się zwykłym „Następna tura”. Komunikat nie prowadzi do złej decyzji (każe zagrać ręką), ale mówi o awarii serwera zamiast „model nie odpowiedział w 2 min”. | `t7a-ai.spec.ts` › „#46 limit 120 s…” (`test.fail`), adnotacje wariantu 3; **triaż MG 01.10: B3**; poprawka — własny limit `streamChat` to zdarzenie `AI_TIMEOUT`, notka „Model nie odpowiedział w 120 s — zagraj tę turę ręką albo kliknij „Graj turę” jeszcze raz.”; test bez `test.fail` | retest OK | `1e6f5dd` |
| 47  | T7a  | B2 | mapa | Zapis karty w trakcie marszu cofa figurę na pole startowe (pod opóźnieniem 150 ± 50 ms u MG raz o 1,2 pola) | „Knajpa”, `po-T4a`, runda 2: Marek (Chromium) prowadzi Kowala dwa pola na zachód, opóźnienie z `fixtures/network.ts` u MG, Marka i Oli → ślad pozycji z magazynu `token` u MG co klatkę: postęp spadł o 54 px. Raz w pierwszym przebiegu T7a (marsz zaraz po teście notatek pod opóźnieniem); w 11 kolejnych przebiegach marsz czysty, ślady MG i Marka identyczne (drganie interpolacji do 0,08 pola). Pozycja końcowa w tym przebiegu niesprawdzona (test stanął na asercji). Podejrzenie: spóźnione pośrednie `token:move` rozgłoszone po końcowym. | `t7a-walka-siec.spec.ts` › „7.1 opóźnienie: marsz Kowala nie skacze…” — przy powtórce komunikat niesie cały ślad; **potwierdzony 01.10 i triaż MG: B2.** Przyczyna: każdy zapis karty (autozapis notatek tuż przed marszem) rozsyła figurę z pozycją z bazy — MG `token:upsert`, graczom na scenie Dynamicznej całą listę `token:sync` — a baza ma pole startowe do upuszczenia. Odtworzone deterministycznie testem `#47 zapis karty Kowala w trakcie marszu…` (dwa `character:update` w połowie marszu): bez poprawki Marek, MG i Ola wracają na 10,00. Poprawka: upsert znanej figury nie rusza pozycji bez `moved` (ciągnięty Pochwycony), lista nie rusza figury w marszu (`noteMoveFrame`). Zostaje teoretyczny wyścig listy po upuszczeniu — `zaleglosci.md` | retest OK | `1e6f5dd` |
| 48  | T7b  | B2 | kosci | Stół „żyje w przeszłości”, gdy kilka osób rzuca często — cały ruch gniazda czeka za animacjami rzutów, po jednej | `po-T6`, MG + 4 graczy + spóźniony, „Brama” odsłonięta: 5 min tempa stołu (czynność co 3–8 s, ~30% to rzuty kubkiem) + 2 min szczytu (co 0,5–1 s) → klient odtwarza rzuty po jednym (`dice3d.ts` › `pump`, do `MAX_ROLL_MS` 10 s) i po każdym czeka `CARD_REVEAL_DELAY_MS` 2,5 s, a `RollPresentation.hold` zatrzymuje za nim **wszystko** z `onPresented` — czat, figury, karty, walkę. Karty rzutów odsłaniają się co ~6,1 s (p50, wszyscy aktorzy); 217 rzutów w 7 min = ~22 min prezentacji. Serwer odpowiada w 1–2 ms (p95 ≤ 17 ms), klatki 60/s. Stan **się zbiega** (świeży `state:sync` = klient = baza), ale po 850–1027 s od końca obciążenia; mowa innego gracza dochodzi z medianą ~6 min (p95 ~16 min). Spóźniony gracz (F5/nowe wejście) nie ma zaległości — `state:sync` nie odtwarza starych rzutów. Obejście przy stole: wyłączenie animacji kości w ustawieniach (`animate` — bez animacji nic nie jest wstrzymywane) | test `t7b-obciazenie` › „Brama” (adnotacje „zgodność po końcu obciążenia”, „różnice tuż po końcu”), pomiary `.e2e/pomiary/t7b-obciazenie.json` › `brama` (`opoznienieCzatuMs`, `zgodnosc`); próby w skali 0,1: zbieżność po 57–118 s po 42 s obciążenia **Poprawka 02.10 (decyzja MG: „dogonienie”, reszta ruchu dalej czeka za kośćmi):** rzut obsługiwany po > 3 s od przyjścia wychodzi kartą bez animacji (`CATCH_UP_LAG_MS`, `rollPresentation.lagMs()`), pauza 2,5 s urywa się, gdy czeka następny rzut. Retest w pełnej skali: zgodność „Brama” 6–16 s (było 850–1130 s), mowa innego gracza p50 ~4 s, p95 ≤ 10 s (było ~6 min); „Knajpa” — 15 tur w 3 min (były 3), czekanie na turę p50 1,9 s; asercja zgodności < 60 s w `tableAgrees` | retest OK | `715df2b` |
| 49  | T7b  | B0 | karta | Spóźnione echo zapisu karty cofa kartę gracza, a następny zapis kasuje to, co było pomiędzy (utrata notatek) | Marek ma otwartą kartę Kowala; MG rzuca `/r 2d6` (R1) → Marek dopisuje „·A” (autozapis, ack) → MG rzuca znowu (R2) → Marek dopisuje „·B” (ack, w bazie „…·A ·B”) → po animacji R1 klient stosuje zatrzymane echo `character:upsert` zapisu A (`onPresented` w kolejce za rzutami, ack idzie od razu, a `applyUpsert` nadpisuje kartę, gdy nie ma zapisu w locie) — pole „Notatki” pokazuje „…·A” → Marek dopisuje „·C” → w bazie „…·A ·C”, **„·B” przepadło**. Pod obciążeniem T7b zgubione dopiski u trzech z czterech graczy (Kowal ·M5–·M7, Iskra ·O3–·O4, Lis ·K2–·K7). Dotyczy każdego pola karty, nie tylko notatek. Bez rzutów okno jest krótkie (kolejność ramek), z rzutami — kilka sekund do minut (#48) | test `#49 notatka zapisana między dwoma rzutami MG…` (`t7b-zapis-karty`, `test.fail`, deterministyczny: adnotacje „karta Marka cofnięta do zapisu A” = true, „notatki w bazie” = „…·A ·C”); adnotacje „#49 (znany)” w `t7b-obciazenie` **Poprawka 02.10 (decyzja MG: licznik wersji):** `Character.revision` podbijany przy każdym zapisie wiersza (rozszerzenie klienta Prismy w `db.ts`), `CharacterView.revision`; `characterStore` odrzuca starszy widok w echu, acku i ponownej synchronizacji (pierwszy `state:sync` po połączeniu bierze bazę w całości). Retest: `t7b-zapis-karty` bez `test.fail` (karta nie cofnięta, w bazie „…·A ·B ·C”), `t7b-obciazenie` w pełnej skali — zero zgubionych dopisków (asercja zamiast adnotacji) | retest OK | `715df2b` |
| 50  | T7c  | B3 | mapa | Każde przełączenie sceny zostawia u MG ~3 MB osieroconych buforów geometrii Pixi — pamięć karty rośnie liniowo i nie wraca | `po-T6` + scena „Wydajność 4096” (`fixtures/wydajnosc.ts`: 40 figur, 200 ścian, 10 świateł), MG (Chromium) i Ola (Firefox) przy stole, 1920 × 1080 → MG przełącza „Knajpa” → „Brama” → „Wydajność 4096” przez UI (Aktywuj + Pokaż) 30 razy → po wymuszonym GC sterta JS MG 25 → 61 MB (+1,34 MB na przełączenie), pamięć `ArrayBuffer` poza stertą 16 → 62 MB (+1,72 MB na przełączenie). Zrzuty sterty (12 przełączeń po rozgrzewce): **+520 `JSArrayBufferData` (21,7 MB), +520 `WebGLBuffer`, +260 `WebGLVertexArrayObject`** — zostają po 150 s spokoju (GC zasobów Pixi włączony, 60 s) i po zamknięciu panelu „Sceny”. Liczniki haka E2E stoją w miejscu: węzły drzewa Pixi (657), tekstury (90 / 110 MB), `Assets` (18) — więc to geometrie (`Graphics`/meshe) odpięte od drzewa bez `destroy()`, a nie figury ani obrazy map. U gracza (Marek, Chromium) to samo w mniejszej skali: +142 bufory (2,2 MB) na 12 przełączeń. Bufory WebGL to też pamięć karty graficznej. Przy stole: 10–15 przełączeń na sesję = ~30–45 MB u MG — waga B3 według skali MG z 02.10 (< ~200 MB, klatki bez zmian) | `t7c-pamiec.spec.ts` › „30 przełączeń scen…” (`.e2e/pomiary/t7c-pamiec.json` › `przelaczenia.trendy`: `mgStertaMb`, `mgBuforyMb`); `t7c-diag-sterta.spec.ts` (zrzuty sterty przed, po, po spoczynku i po zamknięciu panelu — różnica na konstruktor w `.e2e/pomiary/t7c-diag-sterta.json`). Uwaga do pomiaru: `JSHeapUsedSize` (CDP `Performance`) nie liczy `ArrayBuffer` — stąd w pierwszym przebiegu „spadek” sterty po przejściu na czat; trwały wzrost widać w `buffersMb` (`Runtime.getHeapUsage` › `backingStorageSize`) | retest OK | `17f42a4` |
| 51  | T7c  | B3 | kosci | Kości 3D nie zwalniają geometrii po rzucie — liczba geometrii three.js rośnie o ~1,4 na rzut u każdego, kto ogląda | `po-T6`, scena „Wydajność 4096”, Ola (Firefox) rzuca kubkiem 300 razy (`/r 1d10`, `2d6`, `1d10+3`, `3d6`, `1d6` na zmianę), każdy rzut z animacją u Oli i u MG (Chromium) → `renderer.info.memory.geometries` biblioteki `@3d-dice/dice-box-threejs`: MG 44 → 428, Ola 47 → 442 (+1,43 / +1,48 na rzut, liniowo, bez spadku po 5 min spoczynku); tekstury 56 → 77 i stoją, siatek na stole 0, ciał fizyki 5–7 (sprzątanie stołu działa). Sterta JS MG rośnie przy tym o 0,015 MB na rzut (28,6 → 32,7 MB po 300 rzutach) — geometrie są małe, ale to też bufory karty graficznej. Przy stole: kilkaset rzutów na sesję = kilka MB; waga B3 według skali MG z 02.10. Prawdopodobnie biblioteka (`clearDice` usuwa siatki ze sceny bez `geometry.dispose()`), więc poprawka po stronie `dice3d.ts` | `t7c-pamiec.spec.ts` › „300 rzutów kubkiem Oli…” (`.e2e/pomiary/t7c-pamiec.json` › `rzuty.trendy`: `mgKosciGeometrie`, `olaKosciGeometrie`; licznik `diceE2ECounts()` w haku E2E) | retest OK | `17f42a4` |
| 52  | T7c  | B3 | mapa | Klik w środek pola tuż pod cudzą figurą nie rusza marszu — łapie go podpis tamtej figury | `po-T6`, „Knajpa” aktywna, Ola (Firefox) → Kowal stoi na (9, 8), Iskra na (8, 9) → Ola klika Iskrę, potem środek pola (9, 9) → nic: figura stoi, serwer nie dostał ruchu, żadnej notki. Z Kowalem z boku (12, 8) ten sam klik rusza Iskrę. Podpis figury (`TokenNode.nameText`, od 12.09 pod obrączką PW) wisi pod żetonem, w górnej połowie pola niżej, i — inaczej niż grot (#25) i aureola tury (#36) — dalej przyjmuje zdarzenia wskaźnika, więc klik w środek tego pola jest klikiem w figurę nad nim. W walce T7b: „marsz Sowy nie doszedł do pola” z 02.10 to ten błąd — w czterech przebiegach walki „Knajpa” cztery nieudane marsze (Sowa ×2, Iskra ×2), każdy z figurą tuż nad polem docelowym (`moveUsed 0`, `metresWalked 0` w `turnState`); przebieg bez takiego układu — zero. Przy stole: drużyna stoi ciasno, gracz klika „obok kolegi” i nic się nie dzieje — klik niżej w polu działa | `t7c-marsz-pod-figura.spec.ts` › „#52 Kowal tuż nad celem…” (`test.fail`, deterministyczny 3/3, kontrola zielona); ślady nieudanych marszów w `.e2e/pomiary/t7b-obciazenie.json` › `knajpa-proba-1-brama-0.05-*` › `nieudane[].diag` (nowy ślad marszu w `t7b-obciazenie`, `E2E_T7B_BRAMA_SKALA=0.05`) | retest OK | `17f42a4` |
| 53  | T8a  | B3 | mapa | Gracz bez figury widzi przez czarną zasłonę „Knajpy” ukośną nitkę mapy (opis z T8a: „czarna szczelina w pamięci terenu” — diagnoza 03.10 niżej) | `po-T4a` („Knajpa”: Dynamiczna, ciemność, pamięć terenu), nowy gracz Kuba bez postaci i bez figury wchodzi z zaproszenia, okno 1920 × 1080, kamera domyślna → na przyciemnionej pamięci terenu (kuchnia, prawa część sceny) leży czarna, cienka, ukośna kreska od punktu świata ok. (812, 593) do (992, 718), czyli 18–22 × 13–16 pola. Wszystkie ściany „Knajpy” są poziome albo pionowe, więc to nie ściana, tylko szczelina nieodkrytego między dwoma wielokątami pamięci, wzdłuż promienia cienia. Ta sama w Chromium i Firefoksie, na każdym zrzucie Kuby przy 1920 × 1080. Przy 2560 × 1440 kamera kadruje inaczej i kreski nie widać. Niczego nie zdradza (w szczelinie jest ciemność), więc to wygląd | `t8a-ekrany.spec.ts` › „kreator Kuby…”: zrzuty `.e2e/pomiary/t8a/1920x1080-*-Kuba-*-kreator-*.png`; jednorazowy spec diagnostyczny z 03.10 (współrzędne z `worldToClient`, lista ścian z bazy); retest: `t8a-szew-zaslony.spec.ts` (pada bez poprawki: 99 jasnych pikseli na przekątnej w obu silnikach) | retest OK | `c28429d` |
| 54  | T8a  | B3 | czat | Napis filtra „Rozmowy” jest ucięty do „ROZMO…” na obu wspieranych ekranach | `po-T4a`, dowolny gracz albo MG, 1920 × 1080 i 2560 × 1440, oba silniki → zakładka „Czat”, pasek filtrów: „Rozmo…”, „Rzuty”, „Walka”, „Stół”. Panel boczny ma stałą szerokość w pikselach, więc przy 2560 jest tak samo. Napis ma `text-overflow: ellipsis` z założenia, a pełna nazwa jest w `aria-label` i podpowiedzi, ale przy żadnym ekranie z bety nie mieści się w całości | `t8a-ekrany.spec.ts` (adnotacja `truncated` w każdym przeglądzie panelu „Czat”), zrzuty `*-panel-Czat.png` | odrzucony — decyzja MG 03.10: prawą belkę gracze i MG zwykle rozszerzają, przy wąskiej ucięty napis niczego nie psuje (pełna nazwa w podpowiedzi) | |
| 55  | T8a  | B3 | karta | Długie nazwy umiejętności na stronie „Karta” są ucięte wielokropkiem, także na 2560 × 1440 | `po-T4a`, karta Kowala u Marka albo Zbira u MG, strona „Karta”, oba ekrany i oba silniki → 11–12 nazw z wielokropkiem: „Odporność na tortury/nark…”, „Naprawa pojazdów lądowych (…”, „Ukrycie/Znalezienie przedmio…”, „Ratownictwo medyczne (×2) (…”, „Wiedza loka…” (z dziedziną), „Sztuki walki …”, „Gra na instru…”. Okno karty ma tę samą szerokość na obu ekranach. Pełna nazwa jest tylko w podpowiedzi przycisku („Rzut: …”) | `t8a-ekrany.spec.ts` › „karta Kowala…” (adnotacja `truncated`), zrzuty `*-karta-Kowal-Karta-*.png`, `*-karta-Zbir-Karta-*.png` | odrzucony — decyzja MG 03.10: zostaje jak jest (wielokropek, pełna nazwa w podpowiedzi przycisku) | |
| 56  | T8b  | B2 | atak | Za jedno trafienie można rzucić obrażenia dowolnie wiele razy, także po końcu tury strzelca | `po-T3`, Kuba (Kruk) trafia Zbira i rzuca „Obrażenia 3k6” (13) → MG kończy turę Kruka, trwa tura Zbira → druga sesja Kuby klika ten sam przycisk „Obrażenia 3k6” na starej karcie trafienia i rzuca kubkiem → serwer zapisuje trzecią kartę obrażeń (4) za pierwsze trafienie. Przyciski na starych kartach nie gasną (gracz: „bałem się, że kliknę drugi raz i podwoję obrażenia”). `damage:apply` pilnuje jednego rozliczenia **karty obrażeń** (#26), ale nic nie pilnuje jednego **rzutu** na trafienie — gracz może łowić lepszy wynik, a MG widzi kilka kart do „Zastosuj” | baza `e2e.db`: `ChatMessage` 08:46:38 (13), 08:47:45 (9), 08:50:55 (4, za trafienie 19 z 08:46:08); zrzut `.e2e/pomiary/t8b/k-drugi-rzut-obrazen.png` | retest OK 03.10 (T5b 27/27, T6a + T6b 31/31 z gatewayem) — serwer odmawia `DAMAGE_ALREADY_ROLLED` (także dwóm rzutom naraz), przycisk gaśnie u wszystkich, przerzut dopiero po „Cofnij” wszystkich rozliczeń; retest serwera i E2E T4a–T5a, T8a, T2 zielony, T5b–T6b też zielone | `029cd36` |
| 57  | T8b  | B3 | postac | Zgoda MG na postać i „Przyjmij do gry” przychodzą do gracza bez żadnego sygnału | `po-T3`, nowy gracz prosi o postać → MG „Zgoda” → u gracza w zakładce „Postacie” po cichu pojawia się „Kreator postaci…” (bez wpisu na czacie, tostu, dźwięku, licznika na zakładce); to samo po „Przyjmij do gry” — zmianę widać tylko po żetonie na mapie. Gracz: „Gdybym patrzył na czat, nie zauważyłbym zgody”. MG ma znacznik „Czeka na MG”, gracz nie ma odpowiednika | notatki subagenta T8b (5, 17), zrzuty `t8b-04`, `t8b-05`, `t8b-18` w `.e2e/pomiary/t8b` | naprawiony 03.10 (triaż MG: B3) — notka na czacie i dźwięk przy zgodzie MG i przy „Przyjmij do gry” | `120646b` |
| 58  | T8b  | B3 | postac | Lista „Postacie” gracza nie mówi, że postać czeka na MG, a pod gotową postacią dalej stoi „Poproś MG o stworzenie postaci” | po „Utwórz postać” → zakładka „Postacie”: „Kruk / Solo” z pustym kwadratem zamiast portretu, bez etykiety „czeka na zatwierdzenie”, pod spodem „Poproś MG o stworzenie postaci” — gracz nie był pewien, czy w ogóle oddał postać; po przyjęciu bez zmian. Nowy gracz na pierwszym ekranie też nie dostaje wskazówki „postać zrobisz w »Postaciach«” (lewy panel radzi „Kliknij token…”, baner mówi „nic nie zobaczysz”, a pamięć terenu widać — obserwacja z T8a) | zrzuty `t8b-02`, `t8b-17` | naprawiony 03.10 (triaż MG: B3) — „czeka na przyjęcie przez MG” na liście, „Poproś MG o kolejną postać”, rada w pustym lewym panelu | `120646b` |
| 59  | T8b  | B3 | postac | Kreator odsyła do rozdzielenia Zmysłu Walki na karcie zablokowanej do przyjęcia | po „Utwórz postać” → „Co zostało do zrobienia: Zmysł Walki” → „Przejdź” → karta nad kreatorem, „+” przy Zdolnościach wyłączone, ale wyglądają jak aktywne, bez zdania „rozdzielisz po przyjęciu przez MG”; gracz kliknął cztery razy. W rogu dwa krzyżyki obok siebie (karta i kreator) | zrzut `t8b-16` | naprawiony 03.10 (triaż MG: B3) — ekran końcowy bez „Przejdź” przed przyjęciem, z wyjaśnieniem; panel Zmysłu Walki zablokowany ze zdaniem, wyłączone ± wyszarzone (dwa krzyżyki zostają — `POMYSLY.md`) | `120646b` |
| 60  | T8b  | B3 | ui | Rozdzielanie Zmysłu Walki w lewym panelu: przyciski ucięte u dołu, kubek nachodzi na „Zapisz”, brak potwierdzenia zapisu | Firefox, 1920 × 1080, lewy panel → „Zmysł Walki” → lista sześciu Zdolności rozwija się pod akcjami → „Zapisz przydział” / „Cofnij” ucięte dolną krawędzią okna, okrągły przycisk kubka w lewym dolnym rogu zasłania część „Zapisz” i notkę „Poza walką przydział…”; po zapisie panel się zwija bez słowa. T8a nie otwierał tego panelu | zrzut `t8b-19` | naprawiony 03.10 (triaż MG: B3) — otwarty formularz wjeżdża w widok nad kubkiem (`scroll-margin-bottom`), zapis daje notkę na czacie | `120646b` |
| 61  | T8b  | B3 | kosci | Kubek inicjatywy pokazuje „Inicjatywa +0”, a rzut liczy +8 | Kruk (REF 7, Błyskawiczna reakcja 1) → kostka przy swoim nazwisku na pasie „Przed walką” → kubek: „Inicjatywa +0”; karta czatu po rzucie: „1d10+8 = 16” (Refleks + Błyskawiczna reakcja). Gracz: „przez chwilę myślałem, że bonus z REF się nie liczy” | zrzuty `t8b-22`, `t8b-23` | naprawiony 03.10 (triaż MG: B3) — kubek liczy modyfikator z karty (`cpredSheetInitiative`, wspólny z serwerem) | `120646b` |
| 62  | T8b  | B2 | tura | Przy szybkostrzelności 2 broń szarzeje po pierwszym strzale, choć drugi atak jest wolny | Kruk, ciężki pistolet (SS 2), tura → pierwszy strzał w Zbira → kropki „ATAKI ●○”, a slot broni w lewym panelu wyszarzony; gracz nie wiedział, czy może strzelić, spróbował kliknąć Zbira jeszcze raz i strzał przeszedł. Waga z definicji B2 („mylący komunikat prowadzący do złej decyzji w grze”): gracz, który uwierzy szarości, kończy turę z niewykorzystanym atakiem | notatka 30, zrzut `t8b-28` | naprawiony 03.10 (triaż MG: B2) — broń o SS ≥ 2 zostaje żywa przy otwartej Akcji Ataku (`attackOpen`) | `120646b` |
| 63  | T8b  | B3 | tura | Przed startem rundy panel gracza mówi „To nie jest tura tej postaci”, a pod spodem „W ręku: … kliknij cel na mapie” | MG „Rozpocznij walkę” → pas „Przed walką” → lewy panel Kruka: „To nie jest tura tej postaci — poczekaj na swoją kolej” (walka jeszcze nie ruszyła) i niżej zachęta do celowania przy wyszarzonej broni | zrzut `t8b-22` | naprawiony 03.10 (triaż MG: B3) — „Walka jeszcze się nie zaczęła…” przed rundą 1; „W ręku” bez „kliknij cel” przy odmowie tury | `120646b` |
| 64  | T8b  | B3 | atak | Dymek celownika nie mówi, że „Ciężki pistolet”, „W rękach” i „Ochrona głowy” dotyczą celu; dymek wisi po końcu tury | Kruk celuje w Zbira → dymek: pod imieniem „Ciężki pistolet”, „Głowa: Ochrona głowy”, „W rękach: Ciężki pistolet” — gracz nie wiedział, czy to jego broń, czy Zbira; po „Kończę turę” dymek zostaje na mapie | zrzuty `t8b-26`, `t8b-28`, `t8b-29` | naprawiony 03.10 (triaż MG: B3) — „Cel: …”, „Twoja broń: …”, „Głowa celu”, „Cel trzyma”; zmiana tury zdejmuje celownik | `120646b` |
| 65  | T8b  | B3 | czat | Notacja kości raz „1d10+8” / „3d6”, raz „1k10” / „3k6”; karta Cechy „SW · rzut 8 +6” wygląda jak modyfikator | karty czatu ataku i inicjatywy: „1d10+14”, „3d6”; karty kreatora i przyciski: „1k10”, „Obrażenia 3k6”; karta rzutu Cechy: „SW · rzut 8 +6”, wynik 6 (6 to wartość z tabeli Roli, nie premia) | zrzuty `t8b-11`, `t8b-23`, `t8b-28` | naprawiony 03.10 (triaż MG: B3) — „k” wszędzie na ekranie (`displayDiceNotation`), Cecha z tabeli jako „rzut 8 → 6” | `120646b` |
| 66  | T8b  | B3 | dane | Ścieżka Życia: do dwóch odpowiedzi wkleił się nagłówek następnej tabeli | kreator, Ścieżka Życia → „Najważniejsza osoba” 10: „Nikt Motywacja i relacje z innymi”, „Kryzys rodzinny” 10: „…najważniejszym celem twojego życia Środowisko” — `data/private/cpred/lifepath.json`, czyli `parse-manual.py`. Nie błąd: „Stosunek do ludzi” 1 i 2 to ten sam tekst w podręczniku. Do sprawdzenia z PDF-em: „mobliność” (Ubiór i styl 2), „za czarny character” (Kto? 4) | `lifepath.json` (poza repo), notatka 11 | potwierdzony (triaż MG 03.10: B3, poza sesją poprawek) | |
| 67  | T8b  | B3 | postac | Kreator, krok Cechy: wartości pochodne (PW, Poważnie ranny, Przeżywalność, Człowieczeństwo) przed rzutami i w połowie rzutów | Krawędziarz, przed pierwszym rzutem: „PW 20 / Poważnie ranny 10 / Przeżywalność 2 / Człowieczeństwo 20”, po części rzutów PW 30 przy brakującej BC; podsumowanie w tym samym stanie pokazuje kreski. Końcowe 45 / 23 / 8 / 50 poprawne. Kość 3D w kreatorze toczy się pod oknem i ledwie ją widać; „rzut 10” przy TECH i RUCH łamie się na dwie linie | zrzuty `t8b-09`, `t8b-10`, `t8b-11` | naprawiony 03.10 (triaż MG: B3) — kreski do ostatniego rzutu (Kompletny Pakiet liczy od razu), „rzut 10” bez łamania, kość nad oknem kreatora | `120646b` |
| 68  | T8b  | B3 | postac | Wybór portretu przy wyczerpanej puli: same zajęte portrety z nazwami plików, bez podpowiedzi | pula MG z `po-T3` ma dwa portrety (Kowal, Iskra) → nowy gracz „Wybierz portret”: ogromne okno z „avatar13 — Zajęty”, „avatar11 — Zajęty”, nic do wybrania, ani zdania „poproś MG o portret”; gracz został bez portretu (lista „Postacie” i żeton „K”) | zrzut `t8b-13` | potwierdzony (triaż MG 03.10: B3, poza sesją poprawek) | |
| 69  | T8b  | B3 | mapa | Podgląd trasy pod kursorem nowy gracz wziął za ruch cudzej, ukrytej figury | Kruk zaznaczony klikiem w panelu (bez wiedzy gracza) → kursor nad drugim końcem knajpy → niebieskie odciski od kursora do żetonu, bez podpisu i legendy; gracz zapytał MG, „czyj to ruch”, i zanotował „wygląda na błąd albo wyciek ruchu ukrytej figury”. **Sprawdzone: to nie wyciek** — ślad marszu rysuje tylko klient, który maszeruje (`drawTrail`), a przeciąg Zbira przez MG nie zostawił u gracza ani odcisku (80 klatek drugiej sesji Kuby, `.e2e/pomiary/t8b/obserwator`) | notatka 21 | naprawiony 03.10 (triaż MG: B3) — linijka-legenda nad mapą do pierwszego marszu (trasa bez podpisu — MG, 23.08) | `120646b` |
| 70  | T8b  | B3 | mapa | Kamera gracza stawia jego żeton przy dolnej krawędzi, a pas inicjatywy spycha go za nią | po przyjęciu postaci żeton Kruka stoi u dołu widoku, podpis prawie poza mapą; po „Rozpocznij walkę” pojawia się czarny pas i mapa zjeżdża w dół — żeton z podpisem wypada za krawędź. Dwa żetony obok siebie zlewają podpisy w „Zbir Ochroniarz” | zrzuty `t8b-18`, `t8b-21` | naprawiony 03.10 (triaż MG: B3) — obraz trzyma się strony przy zmianie krawędzi mapy, kadr na pierwszą własną figurę | `120646b` |
| 71  | T8b  | B3 | ui | Drobiazgi kreatora i wejścia (zbiorczo) | wejście: pole „Twoje imię” to samo podkreślenie bez ramki, na tapecie „ALWAYS A ANOTHER STORY”; Rola: wybrana karta tylko cienką ramką, „Zmysł Walki 4” zawija „4” do nowej linii (Solo, Fixer), wyłączone radio „Kompletny Pakiet” wygląda na aktywne, licznik braków skacze 17 → 4 po wyborze Roli; Ścieżka Życia: „17 bez odpowiedzi”, choć wymagany jest tylko język; Wyposażenie: filtry kategorii broni to ikony bez podpisów; Opis: placeholder „Zgrzyt” w polu ksywy wygląda jak wpisana wartość; wróg i sojusznik mają tę samą zieloną obrączkę PW, wrogość mówi tylko mały grot | zrzuty `t8b-01`, `t8b-07`, `t8b-08`, `t8b-21` | potwierdzony (triaż MG 03.10: B3, poza sesją poprawek) | |

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

Poprawki #14, #16, #19, #20 i #21 (oraz znaleziony przy nich #22) zrobiono w sesji 26.09 (po T4a)
**na zlecenie MG**, w jednym commicie `0b30a71`. Każda ma test serwera, który pada bez niej (sprawdzone
cofnięciem poprawki): #19 — ack `combat:terrain` i `combat:next` gracza bez ukrytego uczestnika;
#20 — dwa `bot:proposal` naraz → jedno `ok`, drugie `PROPOSAL_ALREADY_RESOLVED`, jeden rzut;
#16/#22 — strzał statysty po karcie i po żetonie z poziomem 4, karta po strzale bez `handgun`;
#14 — właściciel dostaje `FORBIDDEN` dla przyjętej karty, a kartę czekającą na MG może porzucić;
#21 — gateway z 503 („kolejka pełna…”) daje w turze bota „Model jest zajęty albo jeszcze niegotowy
(…) — AI Gateway działa, spróbuj za chwilę.”, ta sama różnica w nocie czatu bota u klienta.
Serwer 1248/1248, klient 300/300. **Retest E2E:** #14 — T2b od `po-T3` 17/17 bez `test.fail()`
(retest OK). #16, #19, #20 — **retest OK 27.09 (sesja T4b)** po przekalibrowaniu T4a pod
`po-T3` z Kowalem z kreatora po poprawkach #2–#9 (budżet ruchu i strzał 4.2 liczone z karty, nie
wpisane na sztywno; #16 odpowiada na pytanie „Strzelaj mimo osłony”, którego przy `test.fail`
nikt nie zauważył): T4a 15/15 od `po-T3` trzy razy (dwa razy w łańcuchu z T4b) i w pełnym
przebiegu od zera.

Poprawki #15, #17, #18 i #23–#27 zrobiono w sesji 27.09 (po T4b) **na zlecenie MG**, w jednym
commicie `574cf4d`. #10–#13 zostają na etap „Konta MG” (decyzje MG z 26.09, zadania Z5–Z8).
Rozstrzygnięcia w tej sesji: #17 — kompendium dostaje wpisy „Bijatyka” i „Sztuki walki” za 0 ed
(gracz bierze je sam ze sklepu), a pięść bez wiersza na karcie czeka w `POMYSLY.md` na decyzję MG;
#18 — wpis „Granat” za 10 ed (Tania) na sztukę, z magazynkiem 1 — cena to odczyt s. 344–345
(„granaty kupuje się na sztuki”, zwykła amunicja 10 ed), do zmiany w prywatnym
`manual-overrides.json`; #24 — zasięg ręki liczony po polach ze skosami, także dla Pochwycenia,
Ustabilizowania, zastrzyku, przekazania i handlu; #26 — „Cofnij” zdejmuje blokadę ponownego
„Zastosuj”. Testy serwera padają bez poprawek (sprawdzone cofnięciem #26 i #27): #23/#27 — rzut
obrażeń za strzał statysty z karty gracza z wierszem `statist-weapon` i z karty innego statysty →
`NOT_THE_SHOOTER`, strzelec po karcie → `ok`; #26 — dwa `damage:apply` naraz → jedno `ok`, trzecie
`DAMAGE_ALREADY_APPLIED`, po „Cofnij” znowu `ok`; #24 — cios po skosie; #15 — nowy
`junk-payloads.test.ts` (każde zdarzenie z `EVENTS`, gracz i MG, bez `INTERNAL`). Serwer 1253/1253,
`shared` 2243, klient 300. **Retest E2E 27.09:** `E2E_FROM=po-T3` — T3a, T3b, T4a, T4b i T2 zielone
(107 zaliczonych; #15, #17, #18, #23, #24, #26, #27 bez `test.fail()`, #25 — T4b klika znowu w środek
żetonu przykrytego grotem sąsiada: strzał Rzeźnika i marsz Iskry), `00-baseline` i `01-dym` od zera
12/12 (`--grep @szybkie`; przy `E2E_FROM` te dwa pliki z założenia nie mają pustej bazy).

Poprawki #34–#39 zrobiono w sesji 29.09 (po T5b) **na zlecenie MG**, w jednym commicie `8277386`.
Rozstrzygnięcia MG na starcie sesji: wagi z propozycji rejestru (#37 **B1**, reszta **B3**); #37 —
stół dostaje skrót, MG i netrunner dodatkowo pełny wiersz (dwa wiersze u nich); #38 — obrażenia za
wieżyczkę rzuca netrunnerka; #34 — okno runu przy prawej krawędzi mapy pod pasem. #10–#13 zostają
na etap „Konta MG”. Testy serwera padają bez poprawek dla #37, #38, #39 i #35 (`netdevices.test.ts`,
`zones.test.ts`, nowy `ai/gateway.test.ts`); serwer 1258/1258, `shared` 2245, klient 300. **Przy
reteście #36 wyszła druga przyczyna** tego samego objawu: aureola tury łapała klik w sąsiednie pole
(krok 5.9 — Kowal patrzył w drugą stronę), a pomocnik `walk` od T5b obchodził ją klikiem w dolną część
pola — poprawione w tym samym commicie, obejście zdjęte. Przy okazji utwardzony wyścig w teście
T5b (karta „Wykrycie — Kruk” zapisuje się po obrażeniach). **Retest E2E 29.09:** T5b od `po-T5a` 27/27
bez `test.fail()`, łańcuch T4a → T4b → T5a → T5b od `po-T3` 84/84 (10,5 min); gateway z modelem, MG
i Marek w Chromium, Ola w Firefoksie, headless. Gateway nie wstawał, bo port 8080 trzymał obcy
`python -m http.server` — zamknięty za zgodą MG (pułapka w `testy`).

Poprawki #40 i #41 zrobiono w sesji 30.09 (po T6a) **na zlecenie MG**, w jednym commicie `21cbedd`;
#21 i #22 zamknięte retestem tej samej sesji. Rozstrzygnięcia MG na starcie: wagi B3 dla obu; #40 —
poprawka obejmuje obie listy (zmienia decyzję z 12.09 „lista odbiorców nie kurczy się o nikogo”),
towarzysze-boty (profil `companion`) zostają na listach gracza, NPC z głosem bota (Paser) — nie; #41 —
pacjent prosi, Medyk przyjmuje, Medyk podaje cenę startującą od domyślnej, wyższą zatwierdza pacjent,
cała kwota na kartę Medyka, bez warunku zasięgu; #10–#13 zostają na etap „Konta MG”. Testy serwera:
nowy `surgery.test.ts` (11), `inventory.test.ts`, `economy.test.ts`, `trade.test.ts` — asercje o id
i listach padają bez poprawki; serwer 1272/1272, `shared` 2245, klient 301. **Retest E2E 30.09:** T6a
od `po-T5` 13/13 cztery razy (bez `test.fail` #40, krok 6.3/6.5 przez prośbę o operację, Ola
w Firefoksie), T2 od `po-T3` 41/41; gateway z modelem. #21 — skryptem z atrapą gatewaya 503
(opis w wierszu).

Poprawki #10–#13 i #42–#45 zrobiono w sesji 01.10 **na zlecenie MG** („napraw błędy z rejestru”),
w jednym commicie `a551f3a`. Rozstrzygnięcia MG na starcie: #10–#13 **teraz**, nie na „Konta MG”
(zmienia decyzje z 26.09); wagi #43 B3, #44 B3, #45 B2 bez znaku zapytania; #45 — „Kowal”
**wszędzie, także na czacie** (konto w podpowiedzi); #42 — pacjenci poza walką to widoczne figury
w zasięgu ramienia; #12 — per IP, 10 błędów / 15 min, 429 także na dobre hasło (test 6.2.11 przerobiony:
zgaduje spod `X-Forwarded-For`, MG z innego adresu wchodzi); #13 — progi 20/s z zapasem 60, bez acku
40/s, MG też pod limitem; #10 razem z uploadami za logowaniem (Z7 częściowo); #11 — ekran logowania
z notką, a **sesja i link zaproszenia ważne rok**. Testy serwera: nowy `security.test.ts` (9),
`journal.test.ts` i `scenes.test.ts` przestawione; serwer 1281/1281, `shared` 2247, klient 301.
**Retest E2E 01.10:** T2 od `po-T3` 41/41 (drugi przebieg; w pierwszym padł 6.2.8 — gniazdo wygasłej
sesji jest już rozłączone, test poprawiony — oraz jednorazowo F5 MG po fuzzie: proxy `vite preview`
`connect ETIMEDOUT 127.0.0.1:3101`, żądanie nie doszło do serwera, w drugim przebiegu zielono);
T6b od `po-T6a` 18/18 z modelem (6.6b — Iskra stabilizuje Kowala poza walką, Ola w Firefoksie;
6.6c przed 6.6b; 6.6d — Ustabilizowanie w walce zostaje jako druga ścieżka; Paser: „Oho, Kowal…”).
Pierwsze podejście do T6b system zatrzymał z braku pamięci (gateway z modelem + suita), drugie za
zgodą MG przeszło. Oględziny skryptem w Firefoksie: autor „Kowal” z podpowiedzią „Gracz: Marek”,
notka „Wylogowano w innej karcie…” na ekranie logowania.

Poprawki #46 i #47 zrobiono w sesji 01/02.10 **na zlecenie MG** („napraw błędy z rejestru”),
w jednym commicie `1e6f5dd`. Rozstrzygnięcia MG na starcie: #46 **B3**, notka „Model nie odpowiedział
w 120 s — zagraj tę turę ręką albo kliknij „Graj turę” jeszcze raz.”; #47 **B2**, poprawka „upsert
nie przesuwa figury” (pozycja należy do `token:move`). **#47 potwierdzony przed poprawką:** nowy test
`#47 zapis karty Kowala w trakcie marszu…` (dwa `character:update` Kowala w połowie marszu pod
150 ± 50 ms) bez poprawki — figura u Marka, MG i Oli wraca na 10,00. Pierwsza wersja poprawki
(sam upsert) naprawiła MG, a gracze dalej skakali: „Knajpa” ma widzenie Dynamiczne, więc dostają
całą listę `token:sync` z bazy — podsłuch ramek Oli (`Network.capture`) pokazał `sync 10.00`
w środku marszu. Druga część: lista nie rusza figury w marszu (`noteMoveFrame`). „Ola widzi Kowala
na starcie” z tego samego testu to **nie** błąd — pole docelowe jest poza jej widzeniem, lista
końcowa go nie ma (pułapka w `testy`). Testy: `gateway.test.ts` (+2), `bot-combat.test.ts` (+1,
5 s ciszy atrapy), `grapple.test.ts` (upsert ciągniętego ma `moved`), nowy `token-store.test.ts`
(6); nowe testy serwera padają bez poprawki (sprawdzone `git stash`). Serwer 1284/1284, klient
307/307, `shared` 2247. **Retest E2E:** `pnpm test:e2e 40-odpornosc` 17/17 dwa razy z rzędu (6,2
i 6,4 min; #46 bez `test.fail`, notka sprawdzana); w przebiegu wcześniej padł 7.2 (handel offline)
na wyścigu samego testu — migawka `isVisible()` okna handlu, poprawiona w tym commicie; T4b od
`po-T4a` 19/19, T4a → T4b od `po-T3` 34/34 z modelem. MG i Marek w Chromium, Ola i Kuba
w Firefoksie, headless. Punkty kontrolne przywrócone z kopii, `dev.db` nietknięta.

Poprawki #48 i #49 zrobiono w sesji 02.10 (po T7b) **na zlecenie MG** („napraw błędy z rejestru”),
w jednym commicie `715df2b`. Rozstrzygnięcia MG na starcie: #48 — **dogonienie** (nie rzuty naraz
ani przyspieszanie): rzut, który czekał ponad ~3 s, wychodzi kartą bez animacji, pauza przed kartą
urywa się, gdy czeka następny rzut; ruch niezwiązany z rzutem **dalej czeka** za kośćmi (umowa
z 22.09 bez zmian); #49 — **licznik wersji** (migracja `Character.revision`), nie `updatedAt`;
retest — pełny T7b + T7a. Nowe testy padają bez poprawki (sprawdzone `git stash`): klient
`character-revision.test.ts` (5), `socket-roll-presentation.test.ts` › „#48” (2); serwer
`characters.test.ts` › „#49” (ack i echo niosą ten sam numer, zapis z pominięciem handlera też
podbija). Serwer 1285, klient 314, `shared` 2247. **Retest E2E:** próba `t7b-zapis-karty`
+ `t7b-obciazenie` w skali 0,1 4/4 (zbieżność ~10,5 s, przed poprawką 57–118 s), potem
`pnpm test:e2e 40-odpornosc` w pełnej skali **26/26 (24,1 min; przed poprawką 34,4 min samego
T7b)**. „Brama”: 767 czynności (przed poprawką 811 — losowe tempo), 0 nieudanych, zbieżność 5,9–16,3 s; „Knajpa”: 15 tur
w 3 min, zbieżność ≤ 5,2 s, jedna nieudana czynność — marsz Sowy (Ewa) nie doszedł do pola w 15 s
w jednej z dwóch jej tur; przed poprawką walka miała 3 tury i Sowa w ogóle nie chodziła, a bazę
nadpisał następny test, więc przyczyny (zajęte pole, budżet ruchu, klik) nie ustalono —
obserwacja do T7c, nie wpis. `dev.db` zmigrowana (`prisma migrate deploy`, kolumna z zerem;
kopia sprzed migracji w scratchpadzie sesji). Oglądane automatem: MG, Marek, Ewa w Chromium, Ola,
Kuba, Zosia w Firefoksie, headless.

Poprawki #50–#52 zrobiono w sesji 02/03.10 (po T7c) **na zlecenie MG** („napraw błędy z rejestru”),
w jednym commicie `17f42a4`. Rozstrzygnięcia MG na starcie: wagi **B3** dla wszystkich trzech;
#52 — **figura łapie klik wyłącznie na swoich polach** (`TokenNode.hitArea`, kwadrat `size × kratka`),
a nie samo wyłączenie podpisu — podpis, cień, podstawka i obrączka PW wystają poza kratkę; testy
wycieku mają **pilnować progów**, nie tylko mierzyć; retest — T7c celowo. Przyczyny: #50 — Pixi 8.19
`destroy({ children: true })` nie niszczy `GraphicsContext` grafik-dzieci (dopiero `context: true`),
a po tej poprawce bufory rosły dalej o 0,9 MB na przełączenie, bo dane renderowania dużych grafik
wracają do `BigPool` z buforem, który tylko się podwaja — przy zmianie sceny `releasePooledGraphicsData()`
niszczy wolne; #51 — `swapDiceFace` biblioteki klonuje geometrię dla wymuszonej ścianki, `clearDice`
jej nie zwalnia (`installGeometryRelease` w `dice3d.ts`). Nowy test klienta `dice3d.test.ts` › „#51”
pada bez poprawki; klient 315/315. **Retest E2E 02/03.10:** `pnpm test:e2e t7c-` **16/16 (53,7 min)** —
`t7c-pamiec` z progami (`SWITCH_LEAK_MB` 0,2, `ROLL_LEAK_GEOMETRIES` 0,1): przełączenia — sterta MG
+0,099 MB (było 1,34), bufory +0,007 MB (było 1,72) na przełączenie; 300 rzutów — geometrie kości MG
4 → 5, Ola 3 → 3 (było 44 → 428 i 47 → 442); `t7c-diag-sterta` — +0,15 MB `JSArrayBufferData` na
12 przełączeń, zero nowych `WebGLBuffer` (było +21,7 MB i +520); `t7c-marsz-pod-figura` 2/2 bez
`test.fail`; `t7c-mapa` 9/9 (klatki bez zmian); `00-baseline` 5/5. Pierwszy przebieg (bez opróżniania
puli) padł na progu buforów MG — stąd druga część poprawki #50. Oglądane automatem: MG w Chromium
i Firefoksie, Marek w Chromium, Ola w Firefoksie (headless, 1920 × 1080). Rejestr bez otwartych błędów.

Triaż i poprawka #53–#55 w sesji 03.10 (po T8a) **na zlecenie MG** („napraw błędy z rejestru”), poprawka w `c28429d`.
Rozstrzygnięcia MG: wagi **B3** dla trzech; #54 i #55 **odrzucone** (powody w wierszach). **#53 —
diagnoza:** to nie szczelina w pamięci terenu, tylko jasna nitka mapy przez czarną zasłonę, dokładnie
na przekątnej sceny (0, 0) → (1470, 1070). Spec diagnostyczny na `po-T4a` wykluczył po kolei: dane
(gracz bez figury ma pusty zestaw wielokątów, maski światła nie ma), składniki zasłony (pamięć, warstwa
nieoświetlona, wycięcia — każdy wyłączony z osobna, nitka zostaje) i samą teksturę (`extract.pixels`
— alfa 255 na całej przekątnej). Nitka przesuwa się razem ze sprite'em zasłony; każdy sprite włożony
do `visionLayer` ma ją także z białą teksturą, `Graphics` i sprite wprost w `viewport` — nie. Poprawka:
`visionLayer.isRenderGroup = true` (przekształcenie kamery liczy GPU, nie batcher) i to samo na `fogLayer`
(ta sama budowa; na „Bramie” szwu nie złapano, pomiar mgły bez zmian). Najpierw sprawdzono zasłonę
czyszczoną kolorem zamiast prostokąta — bez skutku, cofnięte. Jasność pamięci terenu, sali i ciemnych
pól identyczna przed i po poprawce (średnie RGB z surowych pikseli). **Retest:** nowy
`t8a-szew-zaslony.spec.ts` (`@szybkie`, oba silniki, z kontrolą jasnej sali) — bez poprawki 99 jasnych
pikseli w Firefoksie i w Chromium, z poprawką 0; pełne `pnpm test:e2e t8a-` **44/44 (5,6 min)**.
Klient 315/315, ESLint, Prettier i `tsc` czyste.

Poprawkę #56 zrobiono 03.10 w sesji T8b **na zlecenie MG**, razem z dwiema zmianami zasad stołu
z tej samej rozmowy: obrażenia rzucone za kartę ataku **rozliczają się same** (bez „Zastosuj”;
MG: „obrażenia, które pojawiają się po długiej przerwie od strzału, wyglądają dziwnie”), a **Unik
idzie przed obrażeniami** — karta czeka na każdego, kto może się uchylić (REF 8+ przy strzale, każda
figura z kartą przy walce wręcz, odskok z obszaru), aż rzuci Unik albo kliknie „Bez uniku” (cel albo
MG). Do tego grot strzelca idzie za celownikiem u celującego. Retest: serwer 1291/1291 (nowe testy
w `attacks.test.ts` i `areas.test.ts`), E2E od `po-T3` T4a → T5a 55/55 (+2 `@llm` pominięte,
gateway martwy), `t8a-` 44/44, `35-bezpieczenstwo` 41/41; T5b pada na starcie bez gatewaya, więc
łańcuch T5b → T6 czeka na przebieg z gatewayem MG. Oglądane: Marek w Firefoksie (Playwright MCP),
MG w Chromium — zrzuty `.playwright-mcp/output/t8b-fix-*.png`.

## Zadania dla innych etapów (nie błędy)

Rzeczy, które test wykazał, ale plan każe je zapisać jako zadanie, a nie błąd.

| id  | etap | dla etapu | tytuł                                                   | co wykazał test                                                                                                                                                                                                     |
| --- | ---- | --------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Z1  | T1   | 28        | Brak ostrzeżenia o próbce kompendium bez `data/private` | Serwer z `dist/` i `DATA_PRIVATE_DIR` wskazującym pusty katalog loguje tylko `compendium loaded` (50 pozycji próbki) i wstaje bez słowa ostrzeżenia. Kryterium etapu 28: ostrzeżenie w logu przy starcie na próbce. **Zrobione 26.09 (`7746954`)**: `loadCpredRegistry` i `loadCompendium` ostrzegają raz przy starcie z listą plików z próbki; sprawdzone na `dist/` z pustym i pełnym `DATA_PRIVATE_DIR`. Dla etapu 28 zostaje komunikat w panelu MG. |
| Z2  | T2   | 28        | Ciasteczko sesji bez flagi `Secure`                      | `vtt_sid` ma `HttpOnly`, `SameSite=Lax`, podpis i ważność 30 dób, ale nie `Secure`. Za Caddy (HTTPS) ustawić `Secure` (np. z env), inaczej ciasteczko jedzie też po HTTP. |
| Z3  | T2   | 28        | Produkcja wstaje z domyślnym `COOKIE_SECRET`              | `NODE_ENV=production` bez `COOKIE_SECRET` → serwer wstaje z `dev-secret-change-me` bez słowa w logu. Odmowa startu albo głośne ostrzeżenie. (Sam podpis nie daje cudzej sesji bez jej id — test podpisu domyślnym sekretem odbija się na instancji z innym.) |
| Z4  | T2   | 28        | Nagłówki bezpieczeństwa w Caddy                          | Serwer nie wysyła żadnego z: `Strict-Transport-Security`, `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options` (lub `frame-ancestors`), `Referrer-Policy`, `Permissions-Policy` — ani na `/api`, ani na `/uploads`. Brak `X-Powered-By` (dobrze). Dołożyć w Caddy. |
| Z5  | T2   | „Konta MG”, 28 | Limit tempa na gnieździe (z #13)                      | 500 wiadomości i 2000 ruchów jednego gracza przechodzą w całości i dławią innych na 6 s (#13). Decyzja MG z 26.09: limit per sesja w etapie „Konta MG”, limit połączeń w Caddy (28). **Zrobione 01.10 (`a551f3a`, z #13):** limit per konto w `registerEvents` (20/s z zapasem 60, bez acku 40/s). Dla etapu 28 zostaje limit połączeń w Caddy. |
| Z6  | T2   | „Konta MG”, 28 | Limit prób logowania (z #12)                          | Logowanie MG bez limitu i bez opóźnienia (#12); przy otwartej rejestracji MG to samo dla każdego konta (T9). **Zrobione 01.10 (`a551f3a`, z #12):** 10 złych haseł lub zaproszeń per IP w 15 min → 429. Przy otwartej rejestracji MG (T9) ten sam `LoginAttemptLimiter`. |
| Z7  | T2   | „Konta MG” | Pliki `/uploads/` bez logowania (z #10)                  | Każdy, kto zna adres (16 losowych znaków), pobiera mapę, portret, handout bez logowania — także handout nieudostępniony. Rozstrzygnięte w `testy.md` 11.3: uploady kampanii za logowaniem, tylko dla jej członków. **Częściowo 01.10 (`a551f3a`, z #10, decyzja MG):** `/uploads/` tylko dla zalogowanych. Zostaje na „Konta MG”: plik tylko dla członków jego kampanii i handout tylko dla tych, którym go udostępniono. |
| Z8  | T2   | „Konta MG” | Gniazdo po wylogowaniu i wygaśnięciu sesji (z #11)       | Wylogowanie i usunięcie sesji rozłącza jej gniazda (lista gniazd per sesja albo sprawdzenie sesji przy zdarzeniu). Decyzja MG z 26.09: B2 + zadanie. **Zrobione 01.10 (`a551f3a`, z #11):** wylogowanie rozłącza gniazda sesji, wygaśnięcie — zegar i odmowa `SESSION_ENDED`. |
| Z9  | T2   | 28        | Gniazdo nie sprawdza nagłówka `Origin`                    | Handshake WebSocket z `Origin: http://zly.example` i ważnym ciasteczkiem przechodzi (CORS dotyczy tylko long-pollingu). Dziś chroni tylko `SameSite=Lax`; `allowRequest` w Socket.IO z listą pochodzeń. |
| Z10 | T6a  | 28        | Brak importu całej kampanii                               | Krok 6.8 planu („eksport kampanii i import do świeżej instancji”) zakładał import zrzutu kampanii, a etap 33 dał świadomie tylko eksport kampanii (`GET /api/archive/campaign`) oraz import pojedynczej karty i sceny (`archive:character`, `archive:scene`); całość odtwarza się snapshotem i skryptem `restore`. **Decyzja MG z 29.09 (sesja T6a):** T6b testuje to, co jest (eksport z czatem i bez, import kart Kowala i Iskry oraz sceny „Brama” z uploadami do nowej kampanii na świeżej instancji), a brak importu kampanii to zadanie, nie błąd. Przy etapie 28 rozstrzygnąć, czy przenosiny kampanii między instancjami (np. `dev.db` → VPS) idą snapshotem, czy trzeba importu. **T6b (30.09) — co pęka przy przenosinach plikami wymiany:** karty wchodzą jako NPC (właściciela nadaje się ręką), figury sceny tracą powiązanie z kartami i graczami (nowe id kart — 4 z 4 figur „Bramy”, zgodnie z etapem 33), a obrazy z `manifest.files` (mapa, żetony, portrety) dają 404, dopóki ktoś nie przeniesie ich do `uploads/` ręką — po skopiowaniu 5 plików wszystko 200. UI nie mówi, skąd wziąć pliki. |
| Z11 | poprawki 01.10 | 28        | `TRUST_PROXY=1` za Caddy                                  | Limit złych haseł i zaproszeń (#12) liczy się per `request.ip`. Za Caddy bez `TRUST_PROXY=1` każdy klient ma adres Caddy'ego — dziesięć cudzych pomyłek zablokuje logowanie wszystkim. Z `TRUST_PROXY=1` bez pośrednika adres podaje klient (`X-Forwarded-For`) i limit da się obejść — więc tylko za Caddy, a port serwera nie może być wystawiony obok niego. |

## Starsze notatki sesji testowych

### Sesja 02.10 — T7c: wydajność mapy, wyciek pamięci

**Rozstrzygnięcia MG na starcie:** scena 4096 w dwóch trybach (Dynamiczna + ciemność + pamięć terenu
oraz ręczna mgła), MG i gracz w obu silnikach, headless Full HD; hak E2E rozszerzony o liczniki;
300 rzutów z animacją (Ola rzuca, MG patrzy); sterta serwera przez `--inspect`; marsz Sowy — próba
odtworzenia; wagi wycieku: liniowy wzrost = błąd, B2 > ~200 MB albo spadek klatek, inaczej B3.
Wiersze w sekcji 2.

**Zrobione:** hak `counts()` w kliencie (`MapRenderer.e2eCounts`, `diceE2ECounts`, DOM — tylko build
`e2e`, `00-baseline` zielony; umowa w `ui`), `startInstance(…, { inspect: true })`, w `pomiary.ts`
`serverHeap`, `clientMemory` (sterta i bufory po GC), `mainThreadLoad`, `slope`; `Cast.viewport`;
`fixtures/wydajnosc.ts`. Cztery pliki w `40-odpornosc` (16 testów): `t7c-mapa` (9, ~6 min),
`t7c-pamiec` (4, ~44 min; `E2E_T7C_RZUTY`, `E2E_T7C_SPOCZYNEK_MS` do prób), `t7c-diag-sterta`
(1, zrzuty sterty do #50), `t7c-marsz-pod-figura` (2, `test.fail` #52). W `t7b-obciazenie` ślad
nieudanego marszu (`diag`) i `E2E_T7B_BRAMA_SKALA`. Liczby w 6.3, dziewięć pułapek w `testy`.

**Błędy:** **#50** (B3 do triażu) — każde przełączenie sceny zostawia u MG ~3 MB osieroconych
buforów geometrii Pixi (520 `WebGLBuffer` na 12 przełączeń), drzewo i tekstury bez zmian.
**#51** (B3 do triażu) — kości 3D nie zwalniają geometrii three.js (+1,4 na rzut u każdego widza).
**#52** (B3 do triażu) — klik w środek pola tuż pod cudzą figurą łapie jej podpis, marsz nie rusza;
to jest „marsz Sowy” z T7b (4/4 nieudane marsze z figurą nad celem). Serwer: sterta po GC płaska
(42 MB). Klatki mapy: 60/s wszędzie poza Firefoksem gracza w marszu na Dynamicznej (52/s).

**Wynik:** `t7c-mapa` 9/9 (trzy pełne przebiegi), `t7c-pamiec` 4/4 (43,7 min) + przełączenia
powtórzone z miernikiem buforów, `t7c-diag-sterta` 1/1 (trzy przebiegi), `t7c-marsz-pod-figura` 2/2
trzy razy (kontrola zielona, #52 pada zgodnie z `test.fail`), `t7b-obciazenie` przy krótkiej
„Bramie” 4 × 3/3; `00-baseline` 5/5; `40-odpornosc --list` 42 testy, domyślny przebieg dalej 196.
Klient 314/314. Oglądane automatem: MG w Chromium i Firefoksie, Marek w Chromium, Ola w Firefoksie
(headless, 1920 × 1080). `dev.db` i punkty kontrolne nietknięte.

**Następny krok:** triaż MG #50–#52, potem refaktoryzacja całości pod osłoną suity (T7 zamknięty).

### Sesja 02.10 — T7b: obciążenie stołu, długi czat, rozmiar bazy

**Rozstrzygnięcia MG na starcie:** obciążenie w obu trybach po kolei („Brama” swobodnie z odsłoniętą
mgłą, potem walka w „Knajpie”), tempo mieszane (8 min stołu + 2 min szczytu), Kuba i Ewa z pustymi
kartami od MG, obserwator = spóźniona Zosia, silniki pół na pół; 3000 wierszy przez gniazdo; liczby
bez progów; rozmiar bazy pełnym obrazem. Wiersze w sekcji 2.

**Zrobione:** `fixtures/pomiary.ts`, `serverPid()` w `instance.ts`, trzy pliki w `40-odpornosc`
(9 testów): `t7b-obciazenie` (MG + 4 graczy + Zosia, UI: marsz, kubek, czat, szepty, notatki;
porównanie magazynów klienta ze świeżym `state:sync` tego konta i z bazą, czekanie na zbieżność do
20 min, każdy znacznik czatu w bazie raz, rzuty ≤ gesty; `E2E_T7B_SKALA=0.1` do prób),
`t7b-czat-baza` (rozmiar `po-T6`, wejście dwóch nowych graczy, 3000 wierszy, rozmiar po, wejście
i przewijanie całej historii w obu silnikach), `t7b-zapis-karty` (#49, `test.fail`). Liczby
w 6.3. Pułapki w `testy` (cztery nowe).

**Błędy:** **#48** (B2, triaż MG 02.10) — klient odtwarza rzuty po jednym (~6 s) i trzyma za nimi cały
ruch gniazda; przy pięciu osobach rzucających stół jest kilka do kilkunastu minut za serwerem, w walce
przekazanie tury dochodzi po ~1,5 min. Stan się zbiega; obejście — wyłączenie animacji kości.
**#49** (B0, triaż MG 02.10) — spóźnione echo zapisu karty cofa kartę gracza, a następny zapis kasuje
to, co było pomiędzy (zgubione notatki w obu pełnych przebiegach, odtworzenie deterministyczne).
Obserwacje w sekcji 8 (czat bez wirtualizacji, spóźniony gracz widzi więcej niż reszta).

**Wynik:** `t7b-obciazenie` pełny 3/3 (34,4 min; pierwszy pełny przebieg czerwony na notatkach — #49,
potem kontrola zamieniona na adnotację „znany #49”), trzy próby w skali 0,1; `t7b-czat-baza` 5/5
(5,5 min); `t7b-zapis-karty` 1/1 (`test.fail` — „·B” ginie). `40-odpornosc --list` 26 testów,
domyślny przebieg dalej 196. Kod aplikacji bez zmian. Oglądane automatem: MG, Marek, Ewa, Adam,
Celina w Chromium; Ola, Kuba, Zosia, Basia, Darek w Firefoksie, headless. `dev.db` i punkty
kontrolne nietknięte (T7b ich nie nagrywa).

**Następny krok:** MG przyjął wagi (#48 B2, #49 B0 — blokuje betę); poprawki, potem T7c — wydajność mapy
i wyciek pamięci (sprawdzić też wzrost pamięci serwera 149 → 430 MB pod obciążeniem).

**02.10 (sesja poprawek):** #48 i #49 naprawione i retestowane (`715df2b`, opis w rejestrze);
w T7c obejrzeć też jeden nieudany marsz Sowy w walce w „Knajpie” (pierwszy raz, gdy Sowa w ogóle
chodzi w walce — przed poprawką walka miała 3 tury).

_Notatki wyparte z sekcji 12 `testy.md` — w całości, najnowsze na górze._

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

### Sesja 01.10 — poprawki #10–#13 i #42–#45, retest T2 i T6b

Poprawki w `a551f3a`, rozstrzygnięcia MG i szczegóły w rejestrze. **Rejestr nie ma już otwartych
błędów** (#1–#45: retest OK); zadania Z5, Z6, Z8 zrobione, Z7 częściowo (uploady za logowaniem),
nowe Z11 (`TRUST_PROXY=1` za Caddy). Suita: **0 `test.fail`**. T2 od `po-T3` 41/41, T6b od `po-T6a`
18/18 z modelem — T6b nagrał na nowo punkt `po-T6` (Kowal ustabilizowany poza walką, potem drugi raz
w krótkiej walce). Instancja E2E ma od teraz `TRUST_PROXY=1`, a `emitAck`/`probe` ponawiają
`RATE_LIMITED`. Sesja i link zaproszenia ważne rok (6.2.8 sprawdza 364–365 dób).

**Następny krok:** T6c — dwa pełne przebiegi `pnpm test:e2e` od zera i łatanie migotania (nowe
podejrzenie: jednorazowe `connect ETIMEDOUT` proxy `vite preview` przy F5 po fuzzie MG).

### Sesja 30.09 — T6b: czas, kronika, eksport, kopia z harmonogramu, import

**Rozstrzygnięcia MG na starcie:** Iskra stabilizuje Kowala; efekt z formularza MG; streszczenie
i screamsheet jawne dla stołu; import „obie drogi” (bez plików i z plikami z manifestu), odpięte
figury — dopisek do Z10. W trakcie: #42 **B1**, obejście krótką walką, poprawka ma dać
Ustabilizowanie poza walką (sekcja 2).

**Zrobione:** `30-rozgrywka/t6b-czas-kopie.spec.ts` (18 testów, ~3 min od `po-T6a`) i
`restoreBackup()` w `instance/instance.ts` — odtworzenie kopii z harmonogramu (`.e2e/backups`)
na czystym katalogu tym samym skryptem `restore`. W aplikacji bez zmian. Przebieg w 5.4 wyżej.
Kanarki: nowy `dziennik-MG` (wpis „tylko MG”) — tajny dla obojga, jest w zrzucie kampanii MG;
relacje nie opuszczają pokoju MG. Konsola czysta u trojga poza zerwaniem gniazda przy restarcie
w 6.9. Punkt `po-T6`: „Knajpa” aktywna, 15 marca 2045 23:00, Kowal 20/50 PW (ustabilizowany),
dwa wpisy dziennika (MG i jawne streszczenie), screamsheet u obojga, relacja Paser → Kowal +1.
Instancja kończy przebieg **pusta** (6.8b idzie po `po-T6`).

**Znalezione (do triażu MG):** #42 **B1** — Ustabilizowanie poza walką bez drogi w UI (slot
jest, formularz tylko w walce); #43 **B3?** — licznik „Zakończ sesję i streść (N)” u MG stoi,
dopóki zakładka się nie przeładuje; #44 **B3?** — „4 figur straciło powiązanie” (dwie formy
liczby mnogiej); #45 **B2?** — bot i kronikarz mówią do konta gracza („Marek”), nie do postaci
(MG cofnął umowę `boty` z 24.09 po sesji). Wszystkie jako `test.fail`. Dopisek do Z10 (co pęka
przy przenosinach plikami wymiany), trzy obserwacje do sekcji 8.

**Suita:** 196 testów (T6b 18, w tym 4 `test.fail`; razem 9 `test.fail` — #10–#13, #42–#45).
T6b od `po-T6a` zielony trzy razy (raz padł 6.9c: Firefox logował font `PT Serif` z odmową połączenia w oknie restartu instancji — filtr konsoli 6.9c poszerzony, potem zielono), łańcuch T6a → T6b od `po-T5` 30/30 (3,9 min). Oglądane
automatem: MG i Marek w Chromium, Ola w Firefoksie, headless; gateway z modelem (w trakcie sesji
system zabił go z braku pamięci — MG kazał podnieść ponownie). `dev.db` nietknięta.

**Następny krok:** T6c — dwa pełne przebiegi `pnpm test:e2e` od zera i łatanie migotania; albo
najpierw poprawki #42–#45.

### Sesja 30.09 — poprawki #40 i #41, retest T6a

Poprawki w `21cbedd`, szczegóły w rejestrze (`testy-rejestr.md`). T6a ma teraz **13 testów** (dwa
kroki 6.3 zlane w jeden: prośba o operację zamiast montażu ręką MG), bez `test.fail`; suita 178
testów, 5 `test.fail` (#10–#13). **Punkt `po-T6a` nagrany na nowo:** Kowal zapłacił Iskrze 150 ed
zamiast 100 ed do sklepu — Kowal **30 ed**, Iskra **1650 ed**; reszta jak niżej. T6a od `po-T5`
zielony cztery razy, T2 od `po-T3` 41/41; gateway z modelem, Ola w Firefoksie.

### Sesja 29.09 — T6a: handel, sklep, Paser, PD, Medyk, cyborgizacja

**Rozstrzygnięcia MG na starcie:** T6 w trzech częściach (T6a = 6.1–6.5, T6b = 6.6–6.9, T6c = 6.10);
brak importu całej kampanii → testujemy eksport i import kart oraz sceny, brak = zadanie Z10; Ola
zostaje Medykiem i operuje Marka; u Pasera rozmowa z botem i wymiana oknem handlu (sekcja 2).

**Zrobione:** `30-rozgrywka/t6a-handel-rozwoj.spec.ts` (14 testów, ~1,1 min od `po-T5`); hak
`__vttE2E` dostał magazyn `trade` (tylko build `--mode e2e`). W aplikacji bez zmian. Przebieg w 5.4
wyżej. Kanarki: łup Zbira jawny dla Oli od położenia chipa w polu wymiany; reszta jak na końcu T5b.
Konsola czysta u trojga. Punkt `po-T6a`: „Knajpa” aktywna, Kowal przy barze (12, 13) z Roninem,
wytrychami i Cyberokiem (Człowieczeństwo 33, 80 ed, 60 PD, Zmysł Walki 5), Iskra Medyk 1 / Netrunner
4 (Chirurgia 2, 1500 ed, 440 PD) z chipem, Paser 400 ed; walki i runu nie ma.

**Znalezione (do triażu MG):** #40 **B3?** — karta czatu handlu z NPC-em niesie graczowi id karty
NPC-a (`toCharacterId`), choć umowa handlu mówi, że gracz go nie poznaje (`test.fail`); #41 **B3?
albo zgodne z projektem** — Medyk-gracz nie zoperuje drugiego gracza: montaż z chirurgiem-postacią
uruchamia tylko MG (`resolveSurgeon` wymaga prawa rzutu za obie karty). Zadanie Z10 (import
kampanii). Trzy obserwacje do sekcji 8 (MG na podglądzie po aktywacji, Paser nie zna swojej karty,
zgoda w handlu spada po zmianie oferty).

**Suita:** 179 testów (T6a 14, w tym 1 `test.fail`; razem 6 `test.fail` — #10–#13 i #40). T6a od
`po-T5` zielony cztery razy z rzędu (wcześniej raz Paser nie odpowiedział w 3 min — test zbiera
teraz log serwera); łańcuch T5b → T6a od `po-T5a` 41/41 (5,8 min). Oglądane automatem: MG i Marek w Chromium, Ola w Firefoksie, headless; gateway
z modelem. `dev.db` nietknięta.

**Następny krok:** T6b od `E2E_FROM=po-T6a` — czas (doba, leczenie, wygasanie efektu), screamsheet
i dziennik (`@llm`), eksport kampanii i import kart/sceny (Z10), kopia z harmonogramu i odtworzenie.
Albo najpierw triaż #40 i #41.

### Sesja 27.09 — T5b: „Brama” — walka druga, Sieć, wieżyczka, pad gatewaya

**Rozstrzygnięcia MG na starcie:** poprawki #28–#33 z poprzedniej sesji domknąć osobnym commitem
(`77e0f6f`, `dc98deb`); gateway z modelem uruchamia Claude; Ola derezuje Kruka Mieczem; walka
kończy się, gdy Strażnik pada od strzału przeciwpancernego Kowala (sekcja 2).

**Zrobione:** `30-rozgrywka/t5b-brama-walka.spec.ts` (27 testów, ~3,5 min od `po-T5a`)
i `instance/gateway-proxy.ts`; `walka.ts`: `nextTurn` i `clientsSeeTurn` czekają na klienta do
30 s (Tura Demona rzuca kilka razy); hak `__vttE2E` dostał magazyn `ai` (tylko build `--mode e2e`).
W aplikacji bez zmian. Przebieg w 5.3 wyżej. Kanarki: etykiety pięter LOD-a i węzła jawne dla
Oli od wejścia na nie, tajne przed Markiem; Strażnik i Wieżyczka jawne od odsłonięcia placu. Konsola
czysta u trojga. Punkt `po-T5`: walka zakończona, Strażnik Śmiertelnie ranny (Test Przeżywalności
zdany), Kowal 7/45 na placu w strefie wyłączonej wieżyczki, Iskra 28/40 podłączona na węźle
(przejęty), Kowal z amunicją przeciwpancerną 7/8, gateway wrócił.

**Znalezione (do triażu MG):** #34 **B3?** — okno runu na pasie kolejki netrunnera i na pasku
narzędzi/czacie MG, klamra nie pozwala go wypchnąć; #35 **B3?** — pad gatewaya w turze bota daje
MG kod „(INTERNAL)” (zerwany SSE bez `try` w `ai/gateway.ts`) i „(AI_UNAVAILABLE)”, stan nie
wisi; #36 **B3?** — klik w środek pola przed zaznaczoną figurą łapie uchwyt obrotu, marsz nie
rusza; #37 **B1?** — etykieta piętra węzła w publicznym wierszu dziennika („Tura Demona”, strzał
z węzła) dociera do Marka; #38 **B3?** — netrunnerka nie rzuca obrażeń za swoją wieżyczkę (tylko
MG); #39 **B3?** — strzał wieżyczki ze strefy na koncie gracza, który w nią wszedł. Wszystkie jako
`test.fail`; pięć obserwacji do sekcji 8.

**Suita:** 165 testów (T5b 27, w tym 6 `test.fail`; razem 11 `test.fail`). T5b od `po-T5a` zielony
trzy razy, T5a + T5b od `po-T4` 50/50 (5,2 min). Pełny przebieg od zera przerwany na starcie (system zabił procesy w tle z braku pamięci) — do powtórzenia.
Oglądane automatem: MG i Marek w Chromium, Ola w Firefoksie, headless; rozpoznanie #36 i celowania
MG w Playwright MCP (Chromium: MG, Marek na `[::1]`) na instancji E2E. `dev.db` nietknięta.

**Następny krok:** T6 (po walkach, ekonomia, rozwój, czas, kopie) od `E2E_FROM=po-T5` — albo
najpierw poprawki #34–#39 (w tym B1 #37). Stan `po-T5` wyżej; Paser i handel czekają w T6.

### Sesja 27.09 — T5a: „Brama” — przygotowanie MG, wejście przez bramę, run Oli

**Rozstrzygnięcia MG na starcie (dwie tury pytań):** T5 dzielimy na T5a (przed walką) i T5b
(walka); architektura Hasło → Plik → Czarny LOD → Węzeł wieżyczki, na dnie Demon; pad gatewaya
przez pośrednika TCP w suicie; Kowal wchodzi ranny (6k6 strefy ze skryptu kości); nowy
„Strażnik” z botem; Ola strzela wieżyczką w Strażnika, potem ją wyłącza; MG daje Kowalowi
amunicję przeciwpancerną (sekcja 2).

**Zrobione:** `30-rozgrywka/t5a-brama-siec.spec.ts` (24 testy, ~1,6 min od `po-T4`) i
`fixtures/brama.ts` (statysta z kartą, bot, mgła prostokątem, strefy, stan Sieci z bazy);
`walka.ts` czyta aktywną scenę zamiast „Knajpy”; hak `__vttE2E` dostał magazyny `netRun`, `zone`,
`wall`, `fog` (tylko build `--mode e2e`). Przebieg w 5.3 wyżej. Kanarki: nazwa architektury,
etykiety pięter 3–5, notatki MG pięter, gniazda i strefy, sekret Strażnika, id Wieżyczki
i Strażnika; notatka Pliku po Ajdi jawna dla Oli, tajna przed Markiem (`ONLY_FROM`). Konsola
czysta u trojga. Punkt `po-T5a`: Kowal na placu za otwartą bramą (21, 11), Iskra przy skrzynce
(24, 15) podłączona, na Pliku (piętro 2) po Backdoorze i Ajdi; walka nie trwa; bot „Strażnik”
w sesji; gateway martwy przez całą sesję (T5a go nie woła).

**Znalezione (do triażu MG):** #28 **B2?** — marsz pod skraj ręcznej mgły wraca na start
(`Math.floor(543 / 36.2)` = 14 w `everyRunCell`, kratka niecałkowita); #29 **B3?** — odmowa ruchu
poza walką odsyła do karty, której nie ma; #30 **B2?** — na ręcznej mgle gracz nie dostaje klamek
(`openings` tylko na Dynamicznej), a serwer by przepuścił; #31 **B1?** — hasło na piętrze wejścia
nie blokuje zjazdu (`netCanMove` pomija piętro startowe); #32 **B1?** — nazwa architektury
w ładunku runu gracza; #33 **B2?** — brak UI wiązania strefy z węzłem. Wszystkie jako `test.fail`
z obejściem w scenariuszu. Dwie obserwacje do sekcji 8.

**Suita:** 139 testów (T5a 24, w tym 6 `test.fail`; razem 11 `test.fail`). T5a od `po-T4`
zielony, T4b + T5a od `po-T4a` 43/43 (4,2 min). Pełnego przebiegu od zera w tej sesji nie było.
Oglądane automatem: MG i Marek w Chromium, Ola w Firefoksie, headless; `dev.db` nietknięta.

**Następny krok:** T5b od `E2E_FROM=po-T5a` — **gateway z modelem potrzebny** (tura Strażnika,
5.6), pośrednik TCP do napisania w `instance/` (instancja z `E2E_AI_GATEWAY_URL` na pośrednika).
Strefa wieżyczki jest już związana z węzłem (obejście #33); Demon czuwa (MG: „Demon wykrywa
intruza”); zjazd na piętro 3 spawnuje Kruka. Znany wyciek #32 trzeba w T5b obsłużyć jak w T5a
(kanarek `nazwa-architektury` tajny tylko przed Markiem). Albo najpierw poprawki #28–#33.

**Aktualizacja 27.09 (poprawki #28–#33, retest OK):** T5a ma 23 testy bez `test.fail` (#33
wchłonął krok obejścia), `po-T5a` nagrany na nowo: brama otwarta ręką Marka, strefa związana
z karty, nazwa architektury jest kanarkiem dla obojga graczy — **w T5b wyciek #32 nie wymaga już
obsługi**.

### Sesja 27.09 — T4b: walka pierwsza do końca — rany, granat, zwarcie, łup

**Rozstrzygnięcia MG na starcie:** stary `po-T4a` (ze starego `po-T3`) → najpierw przekalibrować
T4a; rana krytyczna Kowala z ataku w walce; Ochroniarz chwyta Iskrę; Zbir ginie, Ochroniarz
zostaje pod progiem ran, Rzeźnik i Cień uciekają; tura Rzeźnika ręką MG; pistolet Zbira dla Iskry
(sekcja 2). Gateway z modelem na sesję (T4a 4.4 i #20).

**T4a przekalibrowany:** budżet ruchu i strzał Kowala liczone z karty (Cechy losuje kreator T3a,
więc każdy przebieg od zera ma innego Kowala — pełne przebiegi pokazały REF 6–8 i ZW 6–7; kość
strzału i rzutu granatem dobiera się do modyfikatora z kubka, PW Kowala czyta się z karty), #16 odpowiada na „Strzelaj mimo osłony” (jako
`test.fail` padał na tym pytaniu, nie na błędzie). Pomocniki walki wyjęte do `fixtures/walka.ts`.
**Retest #16, #19, #20 OK** — T4a 15/15 od `po-T3`.

**Zrobione:** rozpoznanie w Playwright MCP (Chromium: MG, Marek na `[::1]`), potem
`30-rozgrywka/t4b-walka-knajpa-lup.spec.ts` (19 testów, ~2,5 min od `po-T4a`): Cień otwiera drzwi
wahadłowe (marsz staje, gdy Kowal wchodzi w pole widzenia), strzał w głowę 16 > PT 15, dwie
szóstki → „Ciało obce”, Kowal 40 → 7 (14 × 2 + 5), „Poważnie ranny” na panelu Marka, PW Kowala
u Oli bez liczb; strzał przez ścianę — gracz `TOKEN_NOT_FOUND` (nie widzi Cienia), MG
`NO_LINE_OF_FIRE`, Akcja zostaje; granat z podłogi 16 > PT 15 z „Poważnie ranny −2”, obszar 10 ×
10 m na Zbira i „Ochroniarza” (alias), 28 obrażeń, Zbir → Śmiertelnie ranny, Ochroniarz 3 PW,
ablacja o 1, granat 2 → 1; pięść Iskry (Bijatyka, pełne OB — s. 177) z raną; strzał Rzeźnika z
przyłożenia; Test Przeżywalności Zbira na pasie MG (naturalna 10 → Śmierć, `dead` u graczy);
„Bieg” po Akcji Ruchu; Pochwycenie z obroną Oli („Broń się”), `grappled`, „Wyrwij się” na panelu,
karta chwytu podpisana aliasem; wezwanie MG (Atletyka PT 13, „Trzymanie −2” w rozbiciu) tylko do
Oli; „Uwolnij”, ukrycie Rzeźnika i Cienia, ✕ kończy walkę; Kowal przeszukuje martwego Zbira
(„Zabierz wszystko”), Iskra przyjmuje pistolet (propozycja + „Przyjmij”); kanarki czyste (łup
tajny do przeszukania, potem tylko przed Olą), konsola bez błędów; punkt `po-T4`. Skrypt kości
wszędzie, gdzie wynik wybiera drogę (także 2k6 tabeli ran), niezmienniki z karty.

**Znalezione (triaż MG 27.09):** #23 **B2** — karta obrażeń strzału statysty podpisana pierwszą
kartą statysty („Zbir · Ciężki pistolet” zamiast Cienia); #24 **B1** — cios wręcz w sąsiada po
skosie „za daleko” (2,83 m po prostej); #25 **B3** — grot kierunku przykrywa środek sąsiedniej
figury i łapie klik; #26 **B1** — „Zastosuj” tej samej karty obrażeń działa wielokrotnie (automat
dwa razy przypadkiem: druga pięść w Rzeźnika, strzał z T4a w martwego Zbira); #27 **B1** —
pistolet z łupu ma na karcie Iskry id `statist-weapon`, więc Ola widzi „Obrażenia” na atakach
statystów i serwer przyjmuje jej rzut. Obserwacje do sekcji 8: brak monitu na początku tury z raną,
czytelność karty chwytu. Siedem pułapek automatu w `testy` (losowy Kowal z kreatora, stara karta
czatu, grot sąsiada, zmiana tury w trakcie marszu, kości tabeli ran, pozycja po turze bota, „Bieg”
przed ruchem).

**Suita:** 115 testów (`00-baseline` 5, `01-dym` 7, T3a 15, T3b 13, T4a 15, T4b 19, T2 41;
13 `test.fail`), pełne `pnpm test:e2e` ~14 min z botem na żywym modelu. Pięć pełnych przebiegów od
zera: 1 i 3 padły na losowym Kowalu (ZW 6, REF 6 — poprawione, kość z kubka), **2 i 4 na gnieździe
przez proxy `vite preview`** (`ERR_CONNECTION_REFUSED`/`TIMED_OUT` na `ws://localhost:4173` w konsoli
MG albo Oli, raz w T3b, raz w T4b i T2c — pułapka w `testy`, do zbadania), **5 zielony 115/115**;
„dwa razy z rzędu” jeszcze nie spełnione. T4a + T4b od `po-T3` zielone trzy razy. Oglądane: MCP —
MG w Chromium, Marek w Chromium na `[::1]`; automat — MG i Marek w Chromium, Ola w Firefoksie,
headless.

**Następny krok:** T5 (Sieć i walka druga na „Bramie”) od `E2E_FROM=po-T4` — albo najpierw
poprawki B1 (#13, #17, #24, #26, #27), jak po T4a. Stan `po-T4`: Kowal 7/40 z „Ciałem obcym”,
granat 1/2, chip z łupem na karcie Kowala, pistolet Zbira u Iskry (id `statist-weapon` — #27; T5
sprawdzi, czy Iskra z niego strzela); Iskra 35/40; Ochroniarz 3/25; Zbir martwy; Rzeźnik i Cień
ukryci; walka zakończona, scena „Knajpa” aktywna.

### Sesja 26.09 — T4a: inicjatywa i pierwsze tury walki w „Knajpie”

_Notatka odtworzona 27.09 z commita `2e8b090`, rejestru i specu — w tamtym commicie nie trafiła
do pliku._

**Rozstrzygnięcia MG:** podział T4 na T4a (4.1–4.5, punkt `po-T4a` w turze Cienia) i T4b; granat
Kowala i pięści Iskry z własnych wpisów Kompendium MG; Zmysł Walki Kowala: Błyskawiczna reakcja 1
+ Precyzyjny atak 3; Cień w kolejce od startu, ukryty; tura bota — nielegalna akcja = B1, wisząca
tura = B2, głupia taktyka = obserwacja; triaż #17 = B1, #18 = B2 (sekcja 2).

**Zrobione:** `30-rozgrywka/t4a-walka-knajpa.spec.ts` (15 testów): Zmysł Walki z banera karty,
własne wpisy „Pięści” i „Granat odłamkowy”, przewrócony stół (osłona), łup-kanarek w kieszeni
Zbira; inicjatywa kubkiem na czarnym pasie (skrypt kości), ta sama kolejność u trojga, Cień tylko
u MG, klon pod aliasem; tura Marka (ukryty cel `TOKEN_NOT_FOUND`, ruch w budżecie, strzał zza
osłony, karta rzutu u trojga, PW statysty tylko jako strata); tura Oli (prośba o Test przyciskiem
i Alt+klikiem, odmowa z powodem, wezwanie, pięść „za daleko” notką bez rzutu); tura Rzeźnika na
żywym modelu (propozycje, akceptacja, budżet tury); odsłonięcie Cienia bez F5; kanarki (także
w ackach — `Sniffer.mark`); punkt `po-T4a`.

**Znalezione:** #16 B1 (statysta strzela bez poziomu broni), #17 B1 (brak broni typu Bijatyka),
#18 B2 (brak granatu ręcznego), #19 B1 („Kończę turę” oddaje graczowi widok walki MG w acku), #20
B1 (propozycja bota zatwierdzona dwa razy), #21 B3 („Brak połączenia z AI Gateway” przy zajętym
modelu). #16, #19, #20, #21 (i #22 znaleziony przy nich) naprawione tego samego dnia (`0b30a71`);
retest E2E #16, #19, #20 — 27.09, sesja T4b.

### Sesja 26.09 — T2: bezpieczeństwo i autoryzacja

**Rozstrzygnięcia MG na starcie:** gniazdo żyjące po wylogowaniu = B2 + zadanie; unieważnienie
zaproszenia zamyka tylko nowe wejścia; śmieciowe ładunki także w zdarzenia MG; próg zalewu 5 s
(sekcja 2). Gateway w T2 celowo martwy (`DEAD_GATEWAY`) — śmieci w zdarzeniach botów mają paść szybko.

**Zrobione:** `specs/35-bezpieczenstwo` (41 testów, ~1,5 min z trzema odtworzeniami `po-T3`):
`t2a-http` — uploady (401/403, nie-obraz, SVG ze skryptem, 413, bomba wymiarów, `../` w nazwie,
lista katalogu i wyjście poza `/uploads/` i `/public/`), import muzyki (tylko MG, adresy
wewnętrzne), zaproszenia (unieważnione, wygasłe, cudza kampania, imię „MG”), ciasteczko
(flagi, podpis, podróbki, domyślny sekret), wylogowanie i wygaśnięcie sesji (restart z TTL 2,6 s),
produkcja z domyślnym `COOKIE_SECRET`, nagłówki i `Origin`, 30 złych haseł MG; `t2b-gniazdo` —
macierz ról z **rejestru serwera** (136 zdarzeń MG × 2 ładunki z gniazda Marka, baza bez zmian),
przegląd „cudzego” (95 otwartych zdarzeń Oli z id Kowala), własność wg planu (ruch, karta, rzut,
ekwipunek, eurodolce, handel Kowal ↔ Paser, wezwanie do Testu), XSS na czacie, zalew z pomiarem,
ładunek 1,1 MB, śmieci gracza (3102 próby) i MG (7623 próby) z F5 u wszystkich po każdej serii;
`t2c-kanarki` — 10 kanarków z T3 czytanych **z bazy** + 14 nowych od MG (rzut ukryty, tabela MG
i jej rzut, dziennik MG, handout nieudostępniony, wiedza i relacja bota, architektura Sieci, notatka
karty statysty, pinezka), gracze na zimno: F5, `state:sync`, 11 list na żądanie, trasy HTTP —
**żaden kanarek nie wyciekł**, kontrola podsłuchu przechodzi. W aplikacji jedna zmiana: `export`
listy `EVENTS` (umowa w `serwer`). Nowe fixtures: `security.ts`, `nocna-zmiana.ts`.

**Znalezione:** #13 **B1** — zalew jednego gracza (500 wiadomości + 2000 ruchów) opóźnia czat
i ruchy innych o 5,8–6,3 s, ekran Oli o 6,8–7,7 s (same ruchy 2,5 s, sam czat 1,6 s); #14 **B1**
(triaż MG 26.09) — gracz trwale usuwa własną przyjętą postać (`character:delete`, UI daje ✕ tylko MG);
#11 B2 — gniazdo po wylogowaniu/wygaśnięciu sesji; #12 B2 — logowanie MG bez limitu (30 prób
w 0,3 s); #10 B3 — gracz spoza kampanii dostaje jej pulę portretów; #15 B3 zbiorczo — śmieciowe id
kończy się `INTERNAL` (Prisma) w 32 zdarzeniach, bez szkody w stanie. Zadania Z2–Z9 (etap 28 i „Konta
MG”): `Secure`, domyślny sekret, nagłówki w Caddy, limit tempa, limit logowań, `/uploads/` za
logowaniem, gniazda sesji, `Origin`. Obserwacje: imię „mg” zakłada osobne konto gracza;
`/api/auth/me` gracza spoza kampanii podaje nazwę aktywnej. Bez zastrzeżeń: uploady, import
muzyki, zaproszenia, podpis ciasteczka, macierz ról, własność, XSS, pad serwera — żadnego.

**Suita:** 81 testów (`00-baseline` 5, `01-dym` 7, T3a 16, T3b 12, T2 41; 8 `test.fail` — wszystkie
T2), pełne `pnpm test:e2e` ~9 min, **zielone dwa razy z rzędu** (z T3 i botem na żywym modelu).
Serwer 1245/1245 po eksporcie `EVENTS`. Oglądane: automat — MG i Marek w Chromium, Ola w Firefoksie,
headless (XSS, zalew na ekranie Oli, F5 po śmieciach); reszta T2 bez UI (HTTP, surowe gniazda).

**Następny krok:** T4 (walka pierwsza) od `E2E_FROM=po-T3`
— jak w notatce T3b niżej. Poprawki #10–#15 w osobnej sesji; Z2–Z9 czekają na swoje etapy.

### Sesja 26.09 — T3b: sceny, figury, boty, aktywacja i czat

**Rozstrzygnięcia MG na starcie:** „Knajpa” Dynamiczna z ciemnością i pamięcią terenu, „Brama” na
ręcznej mgle (odmowę ruchu w mgłę sprawdza T5); realistyczny plan ścian; Rzeźnik i Paser jako
statyści z kartą i przypiętym botem; triaż #2 → **B1** (sekcja 2). Gateway z modelem na sesję.

**Zrobione:** rozpoznanie UI w Playwright MCP (Chromium), potem `30-rozgrywka/t3b-sceny-boty-czat.spec.ts`
(13 testów, ~1,5 min od `po-T3a`): „Knajpa” 33 × 24 z 60 odcinkami (44 ściany, 13 drzwi dla graczy,
3 okna), rygiel na tylnych drzwiach z karty segmentu, dwa światła, notatka-kanarek, start na tarasie,
widzenie po ciemku 4 m; „Brama” 40 × 30 z murem (OB 20, zasłania figury), bramą (OB 10), płotem,
ścianami budynków, osłoną i ukrytym gniazdem Sieci. Statyści „Zbir”, klon „Zbir 2” przemianowany na
imię-kanarek z aliasem „Ochroniarz”, Rzeźnik (45 PW), Paser, ukryty „Cień” — każdy z własną kartą NPC.
Boty z szablonów („Solo — ochroniarz”, „Fikserka”), persony po polsku, sekrety-kanarki, karty
statystów, Propozycja, Paser przypięty do „Knajpy”. Aktywacja bez F5, `MOVE_LOCKED` do zdjęcia
blokady, Marek otwiera drzwi na taras i idzie do baru, Ola widzi salę przez okno (na ciemnej scenie
okno nie zasłania), Paser w ciemności widoczny tylko z bliska, pamięć terenu po F5, marsz do kuchni
staje przed zamkniętymi drzwiami. Paser odpowiada po polsku w 6–15 s; szepty w obie strony, handout
tylko dla Oli; kanarki czyste (z kontrolą podsłuchu); punkt `po-T3`. Nowe fixtures: `scene.ts`,
`maps.ts`; podsłuch zapisuje ramki w obie strony i przy porażce zostawia `<aktor>-ramki.txt`; hak E2E
czyta też magazyny `bot`, `exploration`, `handout`.

**Znalezione:** #9 B3 — żeton z kreatora przepada, gdy MG przyjmie postać bez aktywnej sceny (notatka
T3a mówiła, że żetony „stają dopiero na aktywnej scenie” — nie stają; MG stawia je ręką „Postaw na
scenie”, krok 3.11). Infrastruktura: headless Chromium Playwrighta renderował WebGL programowo (7,7
kl./s, SwiftShader) — marsz szedł 5× wolniej i test padał na limicie; aktorzy Chromium mają od teraz
`channel: 'chromium'` (GPU), całość z tym przyspieszyła (T3a+T3b z ~15 do 8 min). Cztery pułapki
w `testy`. Obserwacje do sekcji 8: Paser nie zna swojego towaru i miesza idiomy; płynność bez GPU → T7.

**Suita:** 40 testów (`00-baseline` 5, `01-dym` 7, T3a 15, T3b 13; 3 `test.fail`), pełne `pnpm test:e2e`
~8 min, **zielone dwa razy z rzędu**. Oglądane: MCP — MG i Marek w Chromium, stan `po-T3` u Oli
w Firefoksie (sala przez okno, alias, szept, handout); automat — MG i Marek w Chromium, Ola
w Firefoksie, headless.

**Następny krok:** T4 (walka pierwsza) od `E2E_FROM=po-T3`: Solo ma 4 pkt Zmysłu Walki do rozdzielenia;
Rzeźnik gra turę botem (karta statysty, Propozycja); „Cień” ukryty w kuchni (kolumna 20, wiersz 15);
Kowal stoi przy barze obok Pasera, Iskra na tarasie. Potem T2 (czeka na `po-T3` — już jest).

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

