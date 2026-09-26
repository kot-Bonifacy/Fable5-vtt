# Postęp prac

Aktualizowany na koniec każdej sesji. Statusy: ⬜ nierozpoczęty · 🟨 w toku · ✅ ukończony · ⛔ wycofany.

**Ten plik czytasz w całości na starcie każdej sesji, więc ma zostać krótki.** Szczegóły mieszkają
w plikach obok — czytaj je **na żądanie, nigdy rutynowo**:

| plik                               | co w nim                                                           | kiedy czytać                                           |
| ---------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------ |
| `umowy-kodu.md`                    | gdzie dopisuje się nową rzecz — sekcja na obszar, każda z indeksem | **zanim** dołożysz coś w danym obszarze                |
| `pulapki-dev.md`                   | pułapki, które kosztowały czas — sekcje o tych samych nazwach      | **zanim** zaczniesz szukać błędu w danym obszarze      |
| `zaleglosci.md`                    | otwarte zaległości (dług oględzin, drobne braki)                   | gdy odhaczasz zaległości albo ruszasz etap z tej listy |
| `poligon.md`                       | stan sceny testowej „Poligon bojowy" i procedura oględzin          | przed oględzinami w przeglądarce                       |
| `decyzje-i-uproszczenia.md`        | świadome odstępstwa od podręcznika — **to nie są zaległości**      | gdy coś wygląda na błąd w mechanice CP RED             |
| `POMYSLY.md`                       | pomysły spoza zakresu etapów                                       | gdy masz pomysł do zapisania albo szukasz drobiazgu    |
| `archiwum/tabela-etapow.md`        | pełna tabela etapów (numer, nazwa, status, data), wyprowadzona 18.09 | gdy chcesz wiedzieć, co kryje się pod numerem etapu    |
| `archiwum/od-czego-zaczac.md`      | pełne akapity o zamkniętych etapach, wyprowadzane stąd (10.09, 18.09) | gdy wracasz do świeżo zamkniętego etapu                |
| `archiwum/dziennik-sesji.md`       | pełne notatki starszych sesji                                      | gdy potrzebujesz szczegółu konkretnej sesji            |
| `archiwum/zamkniete-zaleglosci.md` | zamknięte zaległości z diagnozą i opisem naprawy                   | gdy wraca coś, co już raz naprawiono                   |
| `archiwum/uwagi-etapow.md`         | kolumna „Uwagi" z tabeli niżej (jedno zdanie na etap, do 28)       | gdy chcesz szybkie „co było w etapie N"                |

| stan         | etapy                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------- |
| ⬜ otwarty   | **28** Wdrożenie na VPS                                                                        |
| ✅ ukończone | 01–11, 13–20b, 23a–27f, 27h–27l, 29a–30d, 31–35, 37–42c (ostatni zamknięty: 38c, 2026-09-23)   |
| ⛔ wycofane  | 12, 21, 22 (głos), 27g (wydajność), 36 (makra); 27, 29, 30, 38 rozdzielone na etapy literowane |

Pełna tabela z nazwami i datami: `archiwum/tabela-etapow.md`.

## Od czego zacząć

**Otwarty jest tylko etap 28 (wdrożenie na VPS).** Przed nim idą **testy przed betą** (`testy.md`,
rejestr `testy-rejestr.md`): **T1, T3a i T3b zamknięte 26.09, a ich błędy #2–#9 naprawione i po
retescie tego samego dnia** — suita `packages/e2e` (`pnpm test:e2e`)
stawia izolowaną instancję z `dist/` na :3101/:4173 i nie dotyka `dev.db`; **następny T4** (walka
pierwsza) od punktu `po-T3`, a T2 może iść w dowolnej chwili — `po-T3` już jest (decyzja MG z 26.09). Kolejność (decyzja MG z 26.09):
**T3–T6 → refaktoryzacja całości pod osłoną suity → etap „Konta MG” → T9, T7, T8, T10 → 28 → T11**.
Refaktoryzację odłożono 05.09 — od tamtej pory doszło sześć etapów i naprawa kreatora.
Nie proponuj makr (36 wycofany) ani głosu (12, 21, 22). Największe pliki do pocięcia przy
refaktoryzacji: `MapRenderer.ts` (294 KB), `CharacterSheet.tsx` (172 KB), `socket.ts` (152 KB),
`roleability.ts` (121 KB), `CharacterCreator.tsx` (111 KB) — czytaj je fragmentami (`grep` + zakres).

**Stan UI (20.09):** cały chrom i karta postaci są „starą kartką” — `chrome.css`, `sheet.css`,
tokeny papieru w `theme.css`, kafle UI z maski karty (`tools/art/chrome-paper.py`), wspólna paleta `--cp-*`; MG odrzuca
wszystko ciemniejsze od papieru („żadnego brudu”). Dzień od 24.09 w tonie tapety logowania,
z własną maską (wyblaknięcia + pognieciona kartka) i przypalonym brzegiem (`assety-chrom.md`). Poza skórą: Sieć, pasek mapy, screamsheet,
logowanie. **Od 25.09 kolejka inicjatywy to czarny pas nad mapą, a „Kończę turę” gracza stoi na
górze lewego panelu** (umowa w `ui`). **Od 25.09 (piętnasta) MG ma w prawym górnym rogu mapy
znacznik „Czeka na MG”** z listą spraw, kaflem i licznikiem w tytule karty, a baner portretu
ma własny kadr albo bierze kadr żetonu (umowy w `ui`). **Safari i iPada nie testujemy ani nie dostosowujemy** (decyzja MG z 25.09). **`styles.css` jest od
18.09 spisem `@import` 19 plików w `styles/`** — czytaj plik obszaru, nie całość (umowa w `ui`).

**Naprawa kreatora (`naprawa_karty_postaci.md`) zamknięta 18.09** (etapy 1, 2a–2c, 3a–3d, odbiór
obu metod). **Od 24.09 rzuty kreatora idą po jednej kości przez kubek** (zlecenie MG z 17.09 —
gracz rzuca Cechę raz, przerzut daje MG), a **nowa postać gracza wymaga zgody MG, przeczytanych
zasad i zatwierdzenia** („Przyjmij do gry” od 24.09 blokuje kartę); **od 25.09 zgoda niesie
warunki** — metodę, Rangę Postaci i pulę umiejętności (zasada domowa, podręcznik: 86). Dalsza praca przy kreatorze wychodzi z `POMYSLY.md`
i `zaleglosci.md`. Co obowiązuje w kodzie — sekcja `postac` w umowach; kontekst —
`archiwum/od-czego-zaczac.md`.

**Model lokalny to od 24.09 Qwen3.8-27B UD-Q3_K_XL** (build 10735 w `C:/AI/llm/llama-prism/`,
~50 tok/s, VRAM 15,5 / 16,3 GB przy 32k — na GPU nic nie dokładamy). Qwythos-9B jest skasowany
z dysku; pomiary obu w `ai-gateway/README.md`. Zaległości „na żywy model” zamknięte 24.09.

**Zaległości: cztery od 26.09 — wiele grup i wielu MG** (osobne konta MG to warunek bety; od trzeciej tury 26.09 do etapu „Konta MG” wchodzą też **limit dwóch sesji naraz** i **prośba MG o dostęp do AI właściciela**; plan testów bety w `testy.md`, T9). Co ocenia się tylko przy stole (kafel papieru,
sesja zero w kreatorze, pełny ekran, polszczyzna Qwen, Wsparcie 10) — pierwszy wpis `POMYSLY.md`.
**Playwright MCP jest włączony** (MG w Chromium, gracz w Firefoksie, stan sceny z konsoli przez
`await import('/src/socket.ts')` — pułapki w `ogledziny`). Kampania-śmieć „Oględziny 12.09” ma członka `Tester`;
**zaproszenie `tester-dev` jest unieważnione od 17.09** — wchodzi się ważnym zaproszeniem
aktywnej kampanii (`poligon.md`).

**Sceny testowe — pięć.** Aktywna **„StrefaPrzemysłowa”** (kratka 36,2 px, 40 × 30) z **włączonym
trybem turowym** (RUNDA 1: Marcin, Tony — decyzja MG z 12.09, wyłącza tylko jego ręka; „✕” woła
gołego `window.confirm`, pułapka w `ogledziny`). „Korytarza 16e” **nie kasuj** — jedyna scena
z widocznością Dynamiczną. Konta, współrzędne, procedura oględzin: `poligon.md`.

**Pułapki, które wracają przy stole:**

- „Gracz nie może chodzić” — najpierw `Scene.playerMoveLocked` (nowa scena startuje zamknięta,
  MG nie dotyczy), potem ręczna mgła: od 14.09 gracz chodzi tylko po odsłoniętym
  (`refuseWalkIntoFog`, umowa w `mapa`).
- `>=` przy PT jest błędem, nie wariantem (decyzja z 28.08 cofnięta; wyjątek: Test Lojalności,
  s. 154) — przeczytaj `decyzje-i-uproszczenia.md`, **zanim** to ruszysz.
- Kara za rany ma jedno miejsce: `cpredWoundPenaltyRows(cpredSheetWoundCondition(sheet))`; nowe
  zawieszenie kary dopisuje się w `cpredWoundSuspensionSource` (umowa w `kosci`).
- `requireCallableRequest` (`realtime/checks.ts`) to **biała lista** — nowe pole `CpredRollRequest`
  trzeba do niej dopisać, inaczej ginie po cichu między prośbą gracza a rzutem.
- `data/private/cpred/compendium/` bywa starsze niż parser — `python tools/import/parse-manual.py`
  przed szukaniem błędu. `shop-tiers.json` i `weapon-icons.json` (24.09) też są poza gitem i jadą na VPS z kompendium.
- Pozycje z `POMYSLY.md` sprawdź w kodzie, zanim je ruszysz (29.08 cztery były nieaktualne);
  triaż z 28.08 w `decyzje-i-uproszczenia.md` nie wraca jako nowe odkrycia.
- Karty czatu piszą alias figury (`Token.publicName`) wyłącznie przez `tokenTableName` (umowa
  w `czat`); odmowa broni spoza rąk idzie przez `cpredDrawFits` (umowa w `atak`).

**Git:** `main` na GitHubie zrównany z dyskiem 14.09. Push publikuje całą historię — przed każdym
`git log --name-only --format= origin/main..HEAD` nie może pokazać `data/private/`, `uploads/`,
`.env` ani baz.

**Testy na koniec ostatniej sesji:** **2237** w `shared`, **1245** na serwerze, **289** u klienta,
**59** w gatewayu, **40** E2E — zielone (26.09, poprawki #2–#9, klient 26.09 druga; sumy w starszych notatkach są zaniżone, nie poprawiaj ich w dół). ESLint, Prettier
i `tsc --noEmit` czyste w trzech pakietach. **Nie puszczaj `pnpm format` na `POSTEP.md`,
`POMYSLY.md` ani `00-przeglad.md`** — Prettier przelałby kilkaset wierszy szumu do commita.

## Zanim dotkniesz obszaru — co przeczytać

Indeksy umów kodu i pułapek dev **wyprowadzone stąd 10.09.2026** (ważyły 62 KB ze 107 KB tego
pliku i rosły z każdym etapem). `umowy-kodu.md` i `pulapki-dev.md` są pocięte na **te same sekcje,
w tej samej kolejności**, a każda sekcja zaczyna się własnym indeksem — czytasz **jedną sekcję**,
nie cały plik:

```
grep -n '^## atak' docs/etapy/umowy-kodu.md docs/etapy/pulapki-dev.md
```

Umowa mówi, **gdzie dopisuje się nową rzecz** — czytaj przed dokładaniem czegokolwiek w obszarze.
Pułapka mówi, **gdzie już raz zniknął czas** — czytaj, zanim zaczniesz szukać błędu. Nową umowę
albo pułapkę dopisujesz do sekcji jej obszaru (wiersz na górę indeksu, pełny wpis pod spodem),
a nie do tego pliku.

| obszar      | co obejmuje                                                    | umów | pułapek |
| ----------- | -------------------------------------------------------------- | ---- | ------- |
| `mapa`      | figury, zaznaczanie, narzędzia, obiekty sceny, ściany, efekty  | 48   | 20      |
| `czat`      | rodzaje wierszy, `visibleTo`, filtr, `seq`                     | 5    | 3       |
| `serwer`    | Prisma i migracje, zdarzenia gniazda, zapisy karty, uploady    | 12   | 17      |
| `ui`        | okna pływające, `z-index`, motyw, skróty, dostępność, wejście  | 22   | 14      |
| `kosci`     | kubek, `rollFormula`, wezwania i prośby o Test, tabele losowe  | 16   | 1       |
| `tura`      | budżet Akcji i metrów, kolejka, trasa, ruch przez ściany       | 8    | 5       |
| `atak`      | broń i dodatki, amunicja, obrażenia, pancerz, rany krytyczne   | 35   | 8       |
| `statysta`  | figura z kartą, `statBlock`, Wartość bojowa, `token:stat`      | 13   | 3       |
| `karta`     | strony i zakładki, panele, `sheet.css`, walidacja list         | 8    | 11      |
| `postac`    | kreator, PD i awanse, Role i Zdolności, cyborgizacje, ekonomia | 45   | 3       |
| `ekwipunek` | wiersze wyposażenia, przekazanie, łup, handel, zasięg, oględziny | 16   | 2       |
| `czas`      | zegar świata, kalendarz, `statEffects`, leczenie po dobie      | 17   | 2       |
| `siec`      | Programy, LOD, demony, piętra architektury                     | 1    | 3       |
| `boty`      | llama-server, RAG, reindeks, dziennik i baza wiedzy            | 2    | 7       |
| `dane`      | `parse-manual.py`, kompendium poza repo, tabele z podręcznika  | 3    | 9       |
| `kopie`     | `snapshot`, `archive`, rotacja, eksport i import               | 8    | 2       |
| `ogledziny` | CDP i Playwright MCP, zrzuty, dwie sesje, `window.confirm`    | 0    | 104     |
| `testy`     | vitest, migotanie, `tsc --noEmit`, środowisko dev              | 0    | 27      |


## Notatki z dwóch ostatnich sesji

Starsze — w całości w `archiwum/dziennik-sesji.md`.

### Sesja 26.09 (druga) — grot kierunku jako uchwyt obrotu, żeton przeciągany z panelu na mapę

**Zlecenie MG (poza etapami):** MG ma przeciągać figury graczy i stawiać nowe przeciągnięciem;
cienka biała kreska od środka zaznaczonej figury do uchwytu obrotu — naprawić, najlepiej lepszą
wizualizacją z widocznym portretem. W trakcie MG: kropka na czubku grotu „niepotrzebna”, grot
„lepiej większy”.

**Zrobione:** przesuwanie figur graczy przez MG już działało (bez zmian). **Nowe:** przeciąganie
żetonu z panelu na mapę — kafel biblioteki, „Postaw pusty”, wiersz postaci i „⊕” (`map/token-drag.ts`,
żółty obrys pola lądowania, ten sam `token:create` co klik; błąd trafia na czat). **Grot:** z wcięciem,
większy (0,3 / 0,4 kratki), wspólny `nosePolygon`; **uchwytem obrotu jest sam grot** — bez patyka
i bez kropki; figura bez kierunku pokazuje po zaznaczeniu blady zarys grotu u góry. Umowa w `mapa`.

**Weryfikacja:** klient 289 (+3, `nosePolygon`), `tsc`, ESLint, Prettier czyste. Oglądane
w Chromium (MG, Playwright): grot przy zbliżeniu stołu i z bliska, zarys dla figury bez kierunku,
przeciągnięcie „Postaw pusty” i wiersza Franca (dubler z kartą i właścicielem, karta się nie
otworzyła). W Firefoksie (MG): przeciągnięcie „Postaw pusty” i obrót za grot (zapis 111°).
Kampania „Test2”: figury testowe „DnD test”, „DnD FF” i dubler Franca **usunięte**; kierunek
Franca i Portosa ustawiany tylko lokalnie w magazynie (F5 przywraca). `dev.db` poza tym nietknięta.

### Sesja 26.09 — poprawki #2–#9 z rejestru testów (po T3b)

**Zlecenie MG:** naprawić błędy z `testy-rejestr.md`, które mieszczą się w jednej sesji; wolno
uruchamiać wszystko. Rozstrzygnięcia MG: **#3** — pole „Data startu kampanii” w oknie zegara;
**#5** — `data/private` zastępuje próbkę w całości; **#9** — zaległy żeton staje przy najbliższej
aktywacji sceny.

**Zrobione (`5ee4a59`):** #2 `stats` wypada z `character:update` u gracza, na karcie `readOnly`;
#3 `time:set` z `start: true` (miesiąc startu rozliczony, karta „Początek kampanii”, `days: 0`);
#4 `total` rzutu jednej tabeli = kość; #5 `loadCompendium` czyta prywatny katalog albo próbkę;
#6 MG bez kampanii dostaje radę o „Panel MG”; #7 „Wybierz język ojczysty…”; #8 ekran końcowy
kreatora czyta `playReady` i figurę na żywo; #9 `placeOwedCreationTokens` w `scene:activate`,
ręczny `token:create` spłaca dług, a figura z kreatora staje przy `Scene.spawn` (dotąd na środku
mapy). Umowy: `postac` (2), `czas`, `dane`. Wszystkie osiem wierszy rejestru — „retest OK”.
Na dokładkę **Z1** (zadanie etapu 28): ostrzeżenie w logu przy starcie na próbce (`cpred.ts`,
`compendium.ts`), sprawdzone na `dist/` z pustym i pełnym `DATA_PRIVATE_DIR`; komunikat w panelu MG
zostaje etapowi 28.

**Weryfikacja:** `shared` 2237, serwer 1245 (+9), klient 286, E2E 40/40 (z `@llm`), potem T3a
16/16 z nowym krokiem #8; `tsc`, ESLint, Prettier czyste. Oglądane w Firefoksie (Playwright MCP)
na pustej instancji E2E: #6, okno zegara z nowym polem, #7; #8 i #9 sprawdza automat (Ola
w Firefoksie). Karta gracza z Cechami `readOnly` nieoglądana okiem — ten sam `NumberStepper`
co poziomy Umiejętności. `dev.db` nietknięta.
