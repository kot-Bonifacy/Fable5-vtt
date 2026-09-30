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
| Z10 | T6a  | 28        | Brak importu całej kampanii                               | Krok 6.8 planu („eksport kampanii i import do świeżej instancji”) zakładał import zrzutu kampanii, a etap 33 dał świadomie tylko eksport kampanii (`GET /api/archive/campaign`) oraz import pojedynczej karty i sceny (`archive:character`, `archive:scene`); całość odtwarza się snapshotem i skryptem `restore`. **Decyzja MG z 29.09 (sesja T6a):** T6b testuje to, co jest (eksport z czatem i bez, import kart Kowala i Iskry oraz sceny „Brama” z uploadami do nowej kampanii na świeżej instancji), a brak importu kampanii to zadanie, nie błąd. Przy etapie 28 rozstrzygnąć, czy przenosiny kampanii między instancjami (np. `dev.db` → VPS) idą snapshotem, czy trzeba importu. |

## Starsze notatki sesji testowych

_Notatki wyparte z sekcji 12 `testy.md` — w całości, najnowsze na górze._

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

