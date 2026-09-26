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
| T1   | Infrastruktura E2E, instancja testowa, linia bazowa       | ⬜     |            |
| T2   | Bezpieczeństwo i autoryzacja                              | ⬜     |            |
| T3   | Rozgrywka 1/4: kampania, gracze, kreator, sceny, figury   | ⬜     |            |
| T4   | Rozgrywka 2/4: walka pierwsza na scenie „Parking”         | ⬜     |            |
| T5   | Rozgrywka 3/4: Sieć i walka druga na scenie „Serwerownia” | ⬜     |            |
| T6   | Rozgrywka 4/4: po walkach, ekonomia, rozwój, czas, kopie  | ⬜     |            |
| T7   | Odporność: sieć, restart, wielu klientów, wydajność       | ⬜     |            |
| T8   | Przeglądarki, ekrany, pierwszy kontakt, pobieżna regresja | ⬜     |            |
| T9   | Werdykt lokalny (triaż, retest poprawek)                  | ⬜     |            |
| T10  | Smoke test na VPS (po etapie 28), werdykt końcowy         | ⬜     |            |

**Kolejność:** T1 przed wszystkim. T3 → T4 → T5 → T6 po kolei (każdy startuje z punktu
kontrolnego poprzedniego, sekcja 4.4). T2, T7 i T8 wymagają tylko T1 i T3, więc można je
przestawiać. T9 po wszystkich od T1 do T8. T10 po etapie 28.

## 2. Decyzje MG z 26.09.2026 (podstawa planu)

| sprawa                 | rozstrzygnięcie                                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| środowisko             | wszystkie testy lokalnie na **izolowanej instancji** (osobna baza i uploady, `dev.db` nietknięta); etap 28 jest **warunkiem bety**, a T10 powtarza skrót rozgrywki na VPS |
| automaty               | **stała suita w repo** (`packages/e2e`, Playwright Test, Firefox + Chromium); pełna rozgrywka zostaje testem regresji na refaktoryzację i dalsze etapy                    |
| błędy w trakcie testów | sesja testowa **tylko notuje** (kroki odtworzenia, waga, dowód); poprawki w osobnych sesjach, potem retest (🔁)                                                           |
| boty LLM               | **w pełni**: bot NPC rozmawia na czacie i gra swoją turę w walce pierwszej; w walce drugiej gateway **pada w trakcie** (test łagodnej degradacji)                         |
| zakres bety            | rdzeń **oraz wszystkie cztery obszary dodatkowe**: Sieć, ekonomia i przedmioty, rozwój postaci, narracja i czas — błędy w nich liczą się do bramki tak samo               |
| próg                   | **zero blokerów i zero krytycznych**; poważne tylko z obejściem przy stole, najwyżej pięć, każdy wpisany do „znanych problemów bety”                                      |
| przeglądarki graczy    | **Chrome i Firefox na PC/laptopie**. Edge, Android, Safari i iPad poza zakresem (Safari/iPad: decyzja z 25.09)                                                            |
| sesja próbna z ludźmi  | **nie** — pierwsza sesja bety sama jest playtestem; to, czego automat nie oceni, idzie do listy obserwacji (sekcja 8)                                                     |

## 3. Strategia: co testujemy głęboko, a co pobieżnie

Projekt ma już **2237 testów w `shared`, 1228 na serwerze, 286 u klienta i 59 w gatewayu**, a każdy
etap był oglądany w przeglądarce. Mechanika CP RED (rachunek PT, obrażenia, pancerz, rany, Sieć,
PD) jest więc sprawdzona **na poziomie funkcji**. Czego nikt dotąd nie sprawdził:

1. **Spięcia wszystkiego naraz** — jedna kampania od zera, dwóch nowych graczy, dwie sceny,
   dwie walki; stan jednej funkcji wchodzi do następnej (łup z walki pierwszej → handel → PD → awans
   → walka druga na zmienionej karcie).
2. **Czystej bazy.** Wszystkie oględziny szły na `dev.db`, gdzie od lipca narastały dane, poprawki
   ręczne i sceny poligonowe. Beta wystartuje z bazy, której nikt nie widział pustej od etapu 02.
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
| API HTTP i gniazdo bez UI | Playwright `request` + `socket.io-client`                       | `packages/e2e/specs/10-api`, `20-security` |
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
   w kodzie serwera → **wymaga zgody MG w T1** (pytanie otwarte 3). Bez zgody: gałęzie rzadkie
   wymusza MG narzędziami stołu (ręczna rana krytyczna, ustawienie PW), a test to odnotowuje.

### 4.3. Suita `packages/e2e`

```
packages/e2e/
  playwright.config.ts     workers: 1 (jedna instancja, stan wspólny), timeout pod LLM
  instance/                start i stop instancji (4.1), punkty kontrolne (4.4)
  fixtures/
    actors.ts              mg(), gracz('Marek', 'chromium'), gracz('Ola', 'firefox') — osobne konteksty i silniki
    sniffer.ts             zapis wszystkich ramek gniazda i odpowiedzi HTTP każdego gracza + asercja kanarków (4.5)
    canvas.ts              klik, prawy klik, przeciąganie i marsz po płótnie Pixi we współrzędnych sceny
    db.ts                  odczyt bazy tylko do asercji (zapis wyłącznie przez aplikację)
    llm.ts                 znacznik @llm, pomijanie przy martwym gatewayu, dłuższe czasy oczekiwania
  specs/
    00-baseline/           build, start, /health, liczba umiejętności 66
    10-api/                trasy HTTP
    20-security/           macierz uprawnień gniazda, kanarki, uploady, zaproszenia
    30-rozgrywka/          T3–T6, `test.describe.serial`, każdy plik startuje z punktu kontrolnego
    40-odpornosc/          T7
    50-przegladarki/       T8
```

Uruchamianie: `pnpm test:e2e` (całość), `pnpm test:e2e --grep @szybkie` (bez LLM i bez długich
przebiegów, cel: poniżej 10 minut). Zasady pisania wynikające z pułapek `ogledziny`:

- Każdy aktor ma **własne okno na wierzchu** (Playwright Test, nie karty w tle) — inaczej `rAF`
  i timery dławią się do 1 Hz, a karty rzutów spóźniają się o `MAX_ROLL_MS`.
- `window.confirm` przechwytuje fixture **przed** każdym niszczącym kliknięciem.
- Klik w płótno zawsze przez `fixtures/canvas.ts` (świat → ekran z kamery), nigdy z pikseli zrzutu;
  klik w puste pole przy zaznaczonej figurze to rozkaz marszu.
- Filtry czatu gracza włączone wszystkie na starcie (odmowy lądują w kategorii „Stół”).
- Pozycję figury po marszu sprawdza się w bazie, nie zrzutem.
- Do odczytu stanu klienta: mały hak `window.__vttE2E` (kamera, magazyny) **tylko w buildzie
  `--mode e2e`** — zmiana w kliencie, więc też pytanie otwarte 4. Bez zgody: odczyt przez osobne
  gniazdo `socket.io-client` z ciasteczkiem kontekstu (sprawdzone 25.09).

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

Kanarki w scenariuszu (lista startowa — T1 porówna ją z umowami `czat`, `statysta`, `siec`, `mapa`):
ukryta figura na warstwie MG i jej nazwa, notatki MG sceny i figury, niewidoczne ściany/obiekty poza
wzrokiem gracza (nieodsłonięta mgła), szept MG → Marek (nie może trafić do Oli) i szept Ola → MG
(nie może trafić do Marka), prompt i sekret bota NPC, dziennik decyzji bota, niewidoczne piętra i hasła
architektury Sieci, zawartość przeszukiwanego ekwipunku przed przeszukaniem, rzut ukryty MG, karta
postaci Marka w części, której Ola nie ma widzieć, handout nieudostępniony, wpis dziennika tylko dla MG,
nieprzyznane jeszcze PD, PW i statystyki statystów — **o ile** umowa `statysta` mówi, że gracz ich nie widzi.

## 5. Scenariusz pełnej rozgrywki „Nocna zmiana”

Obsada: **MG** w Chromium, **Marek** (gracz A) w Chromium, **Ola** (gracz B) w **Firefoksie** —
gracz w innym silniku niż MG, zgodnie z zasadą oględzin. Wszystko robi się **przez UI**, chyba że
wiersz mówi inaczej; stan sprawdza się w bazie i u wszystkich trzech aktorów.

### 5.1. T3 — Kampania, gracze, postacie, sceny, figury

| #    | krok                                                                                                                                                                                       | sprawdzamy                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| 3.1  | MG loguje się na pustej instancji; ekran powitalny przy braku kampanii                                                                                                                     | brak błędów w konsoli poza znanymi (401 przed zalogowaniem), sensowny stan pusty                      |
| 3.2  | MG zakłada kampanię „Nocna zmiana”, ustawia poziom dostępności sklepu, datę startową kalendarza                                                                                            | kampania aktywna, kalendarz na dacie startowej                                                        |
| 3.3  | MG wystawia dwa zaproszenia; Marek i Ola wchodzą z linków pod imionami „Marek” i „Ola”                                                                                                     | konta graczy, członkostwo, gracz widzi mapę powitalną albo pusty stół (brak sceny)                    |
| 3.4  | Marek prosi o zgodę na postać; MG zgadza się z warunkami: **Krawędziarz (Na skróty)**, Ranga standardowa                                                                                   | znacznik „Czeka na MG” (licznik w tytule), przejście z kafla do decyzji                               |
| 3.5  | Ola prosi; MG: **Kompletny Pakiet (Wyliczanie)**, z pulą umiejętności                                                                                                                      | warunki zgody docierają do kreatora Oli                                                               |
| 3.6  | Marek tworzy **Solo**: Cechy przez kubek, Ścieżka Życia, wyposażenie startowe, ksywa, portret (upload `solo-red.png`), kadr żetonu i banera                                                | karta czeka na zatwierdzenie; rzuty kreatora po jednej kości; przerzut tylko przez MG                 |
| 3.7  | Ola tworzy **Netrunnera** z cyberdekiem i Programami; w trakcie **F5 w połowie Ścieżki Życia**                                                                                             | szkic przeżywa F5 bez utraty wyborów                                                                  |
| 3.8  | MG przegląda obie karty i „Przyjmij do gry”                                                                                                                                                | karty odblokowane, 66 umiejętności (nie 42 z próbki), gracz nie edytuje pól zablokowanych             |
| 3.9  | MG zakłada scenę **„Parking pod Kablem”** z `data/public/maps/night-city-crossroads-2508.webp`, kratka, ściany, **drzwi** i **okno**, dwa światła, ciemność, mgła                          | scena w podglądzie niewidoczna dla graczy (kanarek w nazwie sceny do chwili aktywacji)                |
| 3.10 | MG zakłada scenę **„Serwerownia”** z `test-map-4096.png` (duża mapa), ściany, osłona, **bariera z bramą**, punkt dostępu                                                                   | druga scena istnieje, gracze jej nie widzą                                                            |
| 3.11 | Nowe figury: żetony z uploadu (`netrunner-cyan.png`, `fixer-gold.png`), dwóch statystów z `statBlock`, **ukryta figura** „Cień” na warstwie MG (kanarek), figury graczy związane z kartami | właściciele figur, klonowanie statysty, statysta jako karta                                           |
| 3.12 | MG tworzy **bota NPC „Rzeźnik”** (sekret w prompcie = kanarek), tryb autonomii w walce, i bota-handlarza „Paser”                                                                           | bot dostępny, sekret nie wychodzi do graczy                                                           |
| 3.13 | Aktywacja „Parkingu”; `playerMoveLocked` zdjęte; gracze chodzą klikiem po odsłoniętym, otwierają drzwi, patrzą przez okno                                                                  | mgła i widoczność u każdego osobno, ruch w mgłę odmówiony, pamięć terenu po F5                        |
| 3.14 | Marek rozmawia z Paserem na czacie; Ola szepcze do MG; MG szepcze do Marka; MG pokazuje handout tylko Oli                                                                                  | odpowiedź bota po polsku, szepty i handout widoczne wyłącznie adresatom (kanarki)                     |
| 3.15 | **Punkt kontrolny `po-T3`**                                                                                                                                                                | odtworzenie punktu na czystym katalogu daje ten sam stan (liczba wierszy kluczowych tabel, hash kart) |

### 5.2. T4 — Walka pierwsza („Parking pod Kablem”)

Strony: Marek i Ola kontra dwaj statyści i bot „Rzeźnik”; „Cień” ukryty do połowy walki.

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

### 5.3. T5 — Sieć i walka druga („Serwerownia”)

MG przełącza scenę. W Serwerowni: statysta-ochroniarz (bot `@llm`), wieżyczka związana z węzłem
kontrolnym, broniona strefa, architektura Sieci o trzech piętrach (hasło, plik, węzeł wieżyczki,
Demon) — nieodkryte piętra to kanarki.

| #    | krok                                                                                   | sprawdzamy                                                                                  |
| ---- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 5.1  | Aktywacja sceny                                                                        | obaj gracze przechodzą bez F5, stan „Parkingu” zachowany w bazie                            |
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

| #    | krok                                                                                             | sprawdzamy                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
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
- Migracja **kopii** `dev.db` (nie oryginału) do najnowszego schematu na świeżym katalogu — gdyby
  beta miała startować z danych MG (pytanie otwarte 1).
- Pierwszy test dymny suity: MG loguje się w Chromium, Ola wchodzi z zaproszenia w Firefoksie,
  wiadomość na czacie dochodzi w obie strony, rzut kubkiem ma ten sam wynik u obu.

### 6.2. T2 — Bezpieczeństwo i autoryzacja

VTT będzie wystawiony do internetu. Każdy punkt to test automatyczny w `20-security`:

1. **Macierz ról gniazda.** Test wylicza wszystkie zdarzenia z `role` MG z rejestru serwera
   (`realtime/registry.ts`) i wysyła każde z gniazda gracza → oczekiwane `FORBIDDEN`, zero zmian w bazie.
   Nowe zdarzenie MG dopisane w przyszłości wchodzi do testu samo.
2. **Własność.** Gracz rusza cudzą figurą, edytuje cudzą kartę, rzuca z cudzej karty, zmienia cudzy
   ekwipunek, akceptuje cudzą stronę handlu, odpowiada na cudze wezwanie do Testu → odmowa.
3. **Śmieciowe ładunki.** Dla każdego zdarzenia dostępnego graczowi: `null`, zły typ, liczby ujemne,
   `NaN`, ogromne napisy, obce pola → odmowa z kodem, **żadnego `INTERNAL`** w logu i żadnego padu.
   `requireCallableRequest` jako biała lista (pułapka z `POSTEP.md`) — pole spoza listy nie przechodzi.
4. **Tempo.** Gracz wysyła 500 `chat:message` i 2000 pośrednich `token:move` w kilka sekund → serwer
   żyje, inni gracze nie tracą płynności; zapis, czy jest jakikolwiek limit (brak = pytanie do MG, nie bloker).
5. **Uploady.** Plik nie-obraz z rozszerzeniem `.png`, SVG ze skryptem, ogromny plik, nazwa z `../`,
   upload bez zalogowania, upload mapy przez gracza → odmowa; `/uploads/` nie listuje katalogu.
6. **Import muzyki z adresu URL** (tylko MG?) — kto może wywołać, czy adres wewnętrzny
   (`127.0.0.1:8100`, adres tailnetu) jest odrzucany. Na VPS gateway będzie w tailnecie.
7. **Zaproszenia i tożsamość.** Dziś to samo imię = to samo konto, bez hasła (`routes/join.ts`).
   Test mierzy: czy zaproszenie jest wielokrotnego użytku, jak długo żyje, czy po unieważnieniu
   ciasteczko gracza nadal działa, czy ktoś z linkiem może wejść jako „Marek”. **Wynik to decyzja
   MG przed betą** (pytanie otwarte 5), nie automatycznie błąd.
8. **Ciasteczko i sesja.** `httpOnly`, `SameSite`, wygasanie po `SESSION_TTL_DAYS`, wylogowanie
   unieważnia sesję po stronie serwera; produkcja odmawia startu (albo krzyczy) z domyślnym
   `COOKIE_SECRET` — jeśli nie, zapis jako zadanie etapu 28.
9. **Kanarki na zimno.** Gracz tuż po zalogowaniu (pełny stan początkowy sceny i kampanii) nie
   dostaje żadnego kanarka — osobny test poza scenariuszem, bo stan początkowy idzie inną ścieżką niż pushe.
10. **Nagłówki HTTP** na buildzie produkcyjnym — co musi dołożyć Caddy w etapie 28 (lista do etapu 28).

### 6.3. T7 — Odporność

| test                          | jak                                                                                                                | oczekiwane                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| opóźnienie VPS                | 150 ms ± 50 ms na gnieździe (łata `WebSocket.prototype.send` albo CDP w Chromium), skrót walki pierwszej           | pola nie gubią wpisanych znaków, marsz nie skacze, brak podwójnych akcji z podwójnego kliku       |
| zerwanie połączenia           | gracz offline na 30 s w trakcie swojej tury i w trakcie handlu                                                     | czytelny stan „rozłączony”, po powrocie ten sam stan bez F5                                       |
| restart serwera               | zabicie procesu w trakcie walki i w trakcie kreatora, start ponowny                                                | nic zapisanego nie znika; klienci wracają sami albo po F5 bez logowania                           |
| dwie karty tego samego gracza | Marek w dwóch oknach                                                                                               | spójny stan, brak podwójnych rzutów                                                               |
| obciążenie stołu              | MG + 4 graczy + (opcjonalnie) 5. kontekst obserwatora, 10 minut ruchu i rzutów                                     | na koniec hash stanu sceny i kart identyczny u wszystkich i w bazie                               |
| wydajność mapy                | „Serwerownia” 4096 px, 40 figur, 200 odcinków ścian, 10 świateł, mgła — Firefox i Chromium                         | klatki w marszu i przy przesuwaniu kamery (p50, p95) zapisane; próg do ustalenia z liczb bazowych |
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
  tabele losowe, muzyka, ustawienia kości 3D, pomoc i skróty, pełny ekran w Firefoksie).
- Konsola bez nowych błędów w obu silnikach przez cały skrót (znane: dwa 401 przed zalogowaniem,
  404 `favicon.ico`).

### 6.5. T10 — VPS (po etapie 28)

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
2. **B2 ≤ 5**, każdy z opisanym obejściem w „Znanych problemach bety” (plik do utworzenia w T9,
   przeznaczony do pokazania graczom).
3. Pełny `pnpm test:e2e` zielony **dwa razy z rzędu** na świeżej instancji, w tym `@llm`.
4. Linia bazowa (sekcja 6.1) zielona, bez spadku liczby testów.
5. Podsłuch nie znalazł żadnego kanarka w całym przebiegu (T3–T6) ani na zimno (T2).
6. Kopia i odtworzenie na rozegranym stanie działają (6.8, 6.9).
7. Etap 28 ukończony według jego kryteriów i T10 zielony.

**Werdykt T9** brzmi „gotowe do bety po etapie 28” albo „niegotowe, powód: …” z listą B0/B1.
Werdykt końcowy wydaje T10.

## 8. Czego automat nie oceni — lista obserwacji na pierwsze sesje bety

Bez sesji próbnej z ludźmi (decyzja MG) te rzeczy ocenia pierwsza prawdziwa sesja. Lista startowa
(z `POMYSLY.md`, 25.09) — T9 dopisze do niej wszystko, co wyjdzie z „pierwszego kontaktu” (6.4):

- tempo sesji zero w kreatorze (~25 kart na czacie) i rzut prawdziwym gestem;
- polszczyzna Qwen3.8-27B Q3 w rozmowie i w screamsheetach;
- czytelność dla nowicjusza: co zrobić w swojej turze bez pomocy MG;
- siła kafla papieru i czytelność w nocy;
- pełny ekran i Esc (Keyboard Lock działa dopiero na HTTPS);
- taktyka bota w walce (strzela z miejsca, pasuje po Akcji — zapisane 24.09);
- dźwięki powiadomień (automat ich nie słucha).

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

## 11. Pytania otwarte (rozstrzygnąć najpóźniej na starcie T1)

1. **Baza bety:** start od pustej bazy (tylko konto MG, boty i architektury Sieci tworzone od nowa)
   czy przeniesienie `dev.db` bez kampanii testowych? Od tego zależy, czy testujemy migrację kopii
   `dev.db` i porządki (w `dev.db` są kampanie-śmieci, których serwer nie umie usunąć).
2. **Ilu graczy w becie?** Plan zakłada do czterech plus MG (test obciążenia z 6.3).
3. **Skrypt kości** `VTT_DICE_SCRIPT` w serwerze, nieczynny w produkcji (4.2) — zgoda?
4. **Hak `window.__vttE2E`** w kliencie, tylko w buildzie `--mode e2e` (4.3) — zgoda?
5. **Tożsamość gracza** = imię z zaproszenia, bez hasła. Przy stole w internecie każdy z linkiem
   może wejść jako inny gracz. T2 zmierzy skalę; czy przed betą wystarczy krótki czas życia
   zaproszeń i ich unieważnianie po wejściu, czy potrzebne jest hasło gracza?

## 12. Notatki z sesji testowych

_(pusto — pierwsza notatka po T1)_
