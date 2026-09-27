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
| T5   | Rozgrywka 3/4: Sieć i walka druga na scenie „Brama”       | ⬜     |            |
| T6   | Rozgrywka 4/4: po walkach, ekonomia, rozwój, czas, kopie  | ⬜     |            |
| T7   | Odporność: sieć, restart, wielu klientów, wydajność       | ⬜     |            |
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
T2, suitę poprawia się raz) → T9 → T7, T8 → T10 → etap 28 → T11.

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
| triaż #14              | gracz usuwający własną postać przyjętą do gry = **B1** (decyzja MG z 26.09, sesja T2) |
| gniazdo po wylogowaniu | otwarte gniazdo żyje po wylogowaniu i wygaśnięciu sesji = **B2 + zadanie Z** dla „Kont MG” (decyzja MG z 26.09, sesja T2) |
| unieważnienie zaproszenia | zamyka **tylko nowe wejścia** — nie wyrzuca graczy, którzy już weszli; odcięcie gracza to osobna funkcja (decyzja MG z 26.09, sesja T2) |
| śmieci od MG           | śmieciowe ładunki idą **także w zdarzenia MG** z gniazda MG (pad serwera od MG to też B0), na kopii `po-T3` (decyzja MG z 26.09, sesja T2) |
| próg zalewu            | wiadomość innego gracza albo ruch MG dochodzi w trakcie zalewu po ponad **5 s** = B1 (decyzja MG z 26.09, sesja T2) |
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
                           hold.ts — instancja trzymana procesem do oględzin MCP (pułapka w `testy`)
  fixtures/
    actors.ts              cast.mg(), cast.gracz('Ola', 'firefox', token) — osobne przeglądarki, konteksty, gniazdo
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
    vtt-e2e.d.ts           kształt haka window.__vttE2E (kopia z klienta)
  specs/
    00-baseline/           build, start, /health, pusta baza, 66 umiejętności, hak poza buildem produkcyjnym
    01-dym/                test dymny T1: MG Chromium + Ola Firefox, czat, kubek, WebGL, punkt kontrolny
    30-rozgrywka/          T3–T6, `test.describe.serial`, każdy plik startuje z punktu kontrolnego
    35-bezpieczenstwo/     T2: trasy HTTP, gniazdo (role, własność, śmieci, zalew), kanarki na zimno —
                           każdy plik odtwarza `po-T3` sam, więc w pełnym przebiegu idzie po T3–T6
    40-odpornosc/          T7
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
