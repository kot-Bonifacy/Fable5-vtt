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
| ✅ ukończone | 01–11, 13–20b, 23a–27f, 27h–27l, 29a–30d, 31–35, 37–42c (ostatni zamknięty: 42c, 2026-09-13)   |
| ⛔ wycofane  | 12, 21, 22 (głos), 27g (wydajność), 36 (makra); 27, 29, 30, 38 rozdzielone na etapy literowane |

Pełna tabela z nazwami i datami: `archiwum/tabela-etapow.md`.

## Od czego zacząć

**Otwarty jest tylko etap 28 (wdrożenie na VPS).** Przed nim czeka **refaktoryzacja całości**,
odłożona 05.09 — od tamtej pory doszło sześć etapów i naprawa kreatora, więc to najtańszy moment.
Nie proponuj makr (36 wycofany) ani głosu (12, 21, 22). Największe pliki do pocięcia przy
refaktoryzacji: `MapRenderer.ts` (294 KB), `CharacterSheet.tsx` (172 KB), `socket.ts` (152 KB),
`roleability.ts` (121 KB), `CharacterCreator.tsx` (111 KB) — czytaj je fragmentami (`grep` + zakres).

**Stan UI (18.09):** cały chrom i karta postaci są „starą kartką” — `chrome.css`, `sheet.css`,
tokeny papieru w `theme.css`, kafle z `tools/art/chrome-paper.py` i `sheet-paper.py`; MG odrzuca
wszystko ciemniejsze od papieru („żadnego brudu”). Poza skórą: Sieć, pasek mapy, screamsheet,
logowanie. **Oględziny ręką MG i Safari/iPad czekają** (`zaleglosci.md`). **`styles.css` jest od
18.09 spisem `@import` 19 plików w `styles/`** — czytaj plik obszaru, nie całość (umowa w `ui`).

**Naprawa kreatora (`naprawa_karty_postaci.md`) zamknięta 18.09** (etapy 1, 2a–2c, 3a–3d, odbiór
obu metod). Dalsza praca przy kreatorze wychodzi z `POMYSLY.md` (rozbicie rzutów na pojedyncze
kości przez kubek — zlecenie MG z 17.09, opis na górze pliku) i z `zaleglosci.md`. Co obowiązuje
w kodzie — sekcja `postac` w umowach; kontekst — `archiwum/od-czego-zaczac.md`.

**Dług oględzin — 15 pozycji w `zaleglosci.md`.** Większość czeka na **żywy model** (19a–20b, 24c)
albo na rękę MG (pełny ekran, maszynopis, dymek pod celownikiem z 41, skórka na Safari/iPad).
Kampania-śmieć „Oględziny 12.09” ma członka `Tester`; **stałe zaproszenie `tester-dev` prowadzi
na Poligon**, do śmiecia wpuszcza nowe (do 20.09).

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
  przed szukaniem błędu. `shop-tiers.json` też jest poza gitem i jedzie na VPS z kompendium.
- Pozycje z `POMYSLY.md` sprawdź w kodzie, zanim je ruszysz (29.08 cztery były nieaktualne);
  triaż z 28.08 w `decyzje-i-uproszczenia.md` nie wraca jako nowe odkrycia.
- Karty czatu piszą alias figury (`Token.publicName`) wyłącznie przez `tokenTableName` (umowa
  w `czat`); odmowa broni spoza rąk idzie przez `cpredDrawFits` (umowa w `atak`).

**Git:** `main` na GitHubie zrównany z dyskiem 14.09. Push publikuje całą historię — przed każdym
`git log --name-only --format= origin/main..HEAD` nie może pokazać `data/private/`, `uploads/`,
`.env` ani baz.

**Testy na koniec ostatniej sesji:** **2164** w `shared`, **1193** na serwerze, **251** u klienta —
zielone (18.09; sumy w starszych notatkach są zaniżone, nie poprawiaj ich w dół). ESLint, Prettier
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
| `mapa`      | figury, zaznaczanie, narzędzia, obiekty sceny, ściany, efekty  | 46   | 20      |
| `czat`      | rodzaje wierszy, `visibleTo`, filtr, `seq`                     | 5    | 3       |
| `serwer`    | Prisma i migracje, zdarzenia gniazda, zapisy karty, uploady    | 9    | 16      |
| `ui`        | okna pływające, `z-index`, motyw, skróty, dostępność, wejście  | 13   | 12      |
| `kosci`     | kubek, `rollFormula`, wezwania i prośby o Test, tabele losowe  | 14   | 1       |
| `tura`      | budżet Akcji i metrów, kolejka, trasa, ruch przez ściany       | 8    | 5       |
| `atak`      | broń i dodatki, amunicja, obrażenia, pancerz, rany krytyczne   | 32   | 8       |
| `statysta`  | figura z kartą, `statBlock`, Wartość bojowa, `token:stat`      | 13   | 3       |
| `karta`     | strony i zakładki, panele, `sheet.css`, walidacja list         | 7    | 11      |
| `postac`    | kreator, PD i awanse, Role i Zdolności, cyborgizacje, ekonomia | 40   | 2       |
| `ekwipunek` | wiersze wyposażenia, przekazanie, łup, zasięg, oględziny       | 14   | 2       |
| `czas`      | zegar świata, kalendarz, `statEffects`, leczenie po dobie      | 16   | 2       |
| `siec`      | Programy, LOD, demony, piętra architektury                     | 1    | 3       |
| `boty`      | llama-server, RAG, reindeks, dziennik i baza wiedzy            | 1    | 3       |
| `dane`      | `parse-manual.py`, kompendium poza repo, tabele z podręcznika  | 2    | 9       |
| `kopie`     | `snapshot`, `archive`, rotacja, eksport i import               | 8    | 1       |
| `ogledziny` | automatyka CDP, zrzuty, dwie sesje naraz, `window.confirm`     | 0    | 85      |
| `testy`     | vitest, migotanie, `tsc --noEmit`, środowisko dev              | 0    | 22      |


## Notatki z dwóch ostatnich sesji

Starsze — w całości w `archiwum/dziennik-sesji.md`.


### Sesja 18.09 (czwarta) — siatka nie wystaje poza mapę u gracza

**Zlecenie MG:** siatka w widoku gracza nigdy nie może wystawać poza mapę ani być jakkolwiek widoczna; dopytywać. Na zrzucie MG: kratkowany margines stołu za krawędzią mapy i linie siatki na samym brzegu obrazu.

**Ustalone:** siatka Pixi rysuje się tylko po prostokącie sceny, a każda scena z tłem w bazie ma rozmiar równy obrazowi; kamera gracza jest domknięta (`coverZoom`), więc kratkowany margines to kratka CSS `.map-area` (u MG — robocza), a „wystająca” linia to kreska siatki na brzegu mapy (offset 0 albo równy podział).

**Wdrożone:** `gridLinePositions` w `map/grid-style.ts` (pomija linie na brzegu, tolerancja 1 px świata) — `drawGrid` z niej korzysta; `.map-area--plain` (dawne `--welcome`) gasi kratkę stołu u gracza na każdej scenie. Umowa w `mapa`. Cztery testy `gridLinePositions`.

**Weryfikacja:** vitest klienta **255**, `tsc`, ESLint i Prettier zmienionych plików czyste; u MG w Chrome linia na brzegu mapy zniknęła. **Widok gracza nieobejrzany** (brak linku zaproszenia) — do sprawdzenia przy następnej sesji z graczem.

### Sesja 18.09 (trzecia) — odchudzenie kontekstu sesji

**Zlecenie MG:** okno kontekstowe na starcie sesji jest o ~30 % za duże — ocenić, co nieistotne,
wykasować albo przenieść tak, żeby nie wczytywało się w całości (pomysł MG: `styles.css` za duży
jak na jeden plik); dopytywać i zgłaszać możliwe błędy.

**Pomiar:** na starcie z repo wchodzą `CLAUDE.md` (8,3 KB) i `POSTEP.md` (35 KB, z czego „Od czego
zacząć” 15 KB i tabela 90 etapów 7 KB); w trakcie pracy największy jednorazowy koszt to
`styles.css` (242 KB, 11 530 linii, ~60 k tokenów za jedno przeczytanie).

**Wdrożone:** (1) `styles.css` pocięty na **19 plików `styles/NN-obszar.css`** po granicach sekcji,
w kolejności kaskady; `styles.css` został spisem `@import`, Vite skleja je w jeden arkusz — **zbudowany
CSS jest bajt w bajt identyczny** (ten sam hash `index-MxIJcRsJ.css`). `theme.test.ts` bierze listę
plików ze spisu `@import` (wskazuje winny plik, nie „styles.css”), `portrait-crop.test.ts` czyta
`styles/16-creator.css`. Odwołania w `docs/assety-*.md`, pułapce `ui`, `naprawa_karty_postaci.md`
i komentarzach `HudIcon`/`MapTools` przepisane. Umowa w `ui`. (2) `POSTEP.md` z 35 KB do ~14 KB:
tabela etapów wyprowadzona do `archiwum/tabela-etapow.md` (tu zostały trzy wiersze stanu), stara
sekcja „Od czego zacząć” w całości do `archiwum/od-czego-zaczac.md`, nowa opisuje stan na dziś.
(3) `CLAUDE.md` — punkt 5 skrócony (spis plików „kiedy czytać” stoi już w `POSTEP.md`).

**Zgłoszone MG:** poza repo na start sesji wchodzą też opisy skilli synchronizowanych z claude.ai
(docs, docx, pdf, pptx, xlsx, morning, import-memory, skill-creator) i dwa serwery MCP (Chrome,
Claude Docs) — z poziomu repo nie da się ich wyłączyć; `.claude/settings.local.json` trzyma martwe
uprawnienia `mcp__chrome-devtools__*`. Wielkie pliki TS zostają do refaktoryzacji przed 28.

**Weryfikacja:** vitest klienta **251** (18 nowych: strażnik motywu per plik), build Vite identyczny,
Prettier i ESLint zmienionych plików czyste. Serwer i Vite nieuruchamiane.

