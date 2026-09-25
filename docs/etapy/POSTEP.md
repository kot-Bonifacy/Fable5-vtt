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

**Otwarty jest tylko etap 28 (wdrożenie na VPS).** Przed nim czeka **refaktoryzacja całości**,
odłożona 05.09 — od tamtej pory doszło sześć etapów i naprawa kreatora, więc to najtańszy moment.
Nie proponuj makr (36 wycofany) ani głosu (12, 21, 22). Największe pliki do pocięcia przy
refaktoryzacji: `MapRenderer.ts` (294 KB), `CharacterSheet.tsx` (172 KB), `socket.ts` (152 KB),
`roleability.ts` (121 KB), `CharacterCreator.tsx` (111 KB) — czytaj je fragmentami (`grep` + zakres).

**Stan UI (20.09):** cały chrom i karta postaci są „starą kartką” — `chrome.css`, `sheet.css`,
tokeny papieru w `theme.css`, kafle UI z maski karty (`tools/art/chrome-paper.py`), wspólna paleta `--cp-*`; MG odrzuca
wszystko ciemniejsze od papieru („żadnego brudu”). Dzień od 24.09 w tonie tapety logowania,
z własną maską (wyblaknięcia + pognieciona kartka) i przypalonym brzegiem (`assety-chrom.md`). Poza skórą: Sieć, pasek mapy, screamsheet,
logowanie. **Od 25.09 kolejka inicjatywy to czarny pas nad mapą, a „Kończę turę” gracza stoi na
górze lewego panelu** (umowa w `ui`). **Oględziny ręką MG i Safari/iPad czekają** (`zaleglosci.md`). **`styles.css` jest od
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

**Dług oględzin — 14 pozycji w `zaleglosci.md`.** Żywy model nie blokuje już żadnej; czekają na
rękę MG (pełny ekran, tempo maszynopisu, dymek pod celownikiem z 41, skórka na Safari/iPad).
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
  przed szukaniem błędu. `shop-tiers.json` i `weapon-icons.json` (24.09) też są poza gitem i jadą na VPS z kompendium.
- Pozycje z `POMYSLY.md` sprawdź w kodzie, zanim je ruszysz (29.08 cztery były nieaktualne);
  triaż z 28.08 w `decyzje-i-uproszczenia.md` nie wraca jako nowe odkrycia.
- Karty czatu piszą alias figury (`Token.publicName`) wyłącznie przez `tokenTableName` (umowa
  w `czat`); odmowa broni spoza rąk idzie przez `cpredDrawFits` (umowa w `atak`).

**Git:** `main` na GitHubie zrównany z dyskiem 14.09. Push publikuje całą historię — przed każdym
`git log --name-only --format= origin/main..HEAD` nie może pokazać `data/private/`, `uploads/`,
`.env` ani baz.

**Testy na koniec ostatniej sesji:** **2226** w `shared`, **1228** na serwerze, **281** u klienta,
**59** w gatewayu — zielone (25.09; sumy w starszych notatkach są zaniżone, nie poprawiaj ich w dół). ESLint, Prettier
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
| `serwer`    | Prisma i migracje, zdarzenia gniazda, zapisy karty, uploady    | 12   | 16      |
| `ui`        | okna pływające, `z-index`, motyw, skróty, dostępność, wejście  | 16   | 13      |
| `kosci`     | kubek, `rollFormula`, wezwania i prośby o Test, tabele losowe  | 15   | 1       |
| `tura`      | budżet Akcji i metrów, kolejka, trasa, ruch przez ściany       | 8    | 5       |
| `atak`      | broń i dodatki, amunicja, obrażenia, pancerz, rany krytyczne   | 33   | 8       |
| `statysta`  | figura z kartą, `statBlock`, Wartość bojowa, `token:stat`      | 13   | 3       |
| `karta`     | strony i zakładki, panele, `sheet.css`, walidacja list         | 8    | 11      |
| `postac`    | kreator, PD i awanse, Role i Zdolności, cyborgizacje, ekonomia | 44   | 3       |
| `ekwipunek` | wiersze wyposażenia, przekazanie, łup, handel, zasięg, oględziny | 16   | 2       |
| `czas`      | zegar świata, kalendarz, `statEffects`, leczenie po dobie      | 16   | 2       |
| `siec`      | Programy, LOD, demony, piętra architektury                     | 1    | 3       |
| `boty`      | llama-server, RAG, reindeks, dziennik i baza wiedzy            | 2    | 6       |
| `dane`      | `parse-manual.py`, kompendium poza repo, tabele z podręcznika  | 2    | 9       |
| `kopie`     | `snapshot`, `archive`, rotacja, eksport i import               | 8    | 2       |
| `ogledziny` | CDP i Playwright MCP, zrzuty, dwie sesje, `window.confirm`    | 0    | 90      |
| `testy`     | vitest, migotanie, `tsc --noEmit`, środowisko dev              | 0    | 22      |


## Notatki z dwóch ostatnich sesji

Starsze — w całości w `archiwum/dziennik-sesji.md`.

### Sesja 25.09 (dziesiąta) — narzędzia: Playwright obok claude-in-chrome

**Zlecenie MG:** zainstalować Playwrighta i zapisać w `CLAUDE.md`, żeby oględziny szły dwiema
drogami, a nie tylko przez claude-in-chrome. Rozstrzygnięcia MG: **serwer MCP + biblioteka**;
przeglądarki **Firefox i Chromium** (bez WebKita); okno **widoczne**; hasło MG w **pliku secrets**.

**Wdrożone:** `.mcp.json` z serwerami `playwright-firefox` i `playwright-chromium`
(`node node_modules/@playwright/mcp/cli.js`, `--caps vision`, profile i zrzuty w gitignorowanym
`.playwright-mcp/`, `--secrets .playwright-mcp/secrets.env` z pustym `VTT_GM_PASSWORD=` do
wypełnienia przez MG); `@playwright/mcp@0.0.82` i `playwright` **przypięty do jego alfy**
(`1.64.0-alpha-1789764292000`) — stabilne 1.63.0 ściągałoby drugi komplet przeglądarek;
przeglądarki (~1,1 GB) w `%LOCALAPPDATA%\ms-playwright`. `.playwright-mcp/**` w ignorach ESLinta
(profil Firefoksa ma `prefs.js`). Sekcja „Oględziny w przeglądarce” w `CLAUDE.md`, krok w README,
cztery pułapki w `ogledziny`. **Błąd spoza zakresu:** brak favicony (404 w konsoli) → `zaleglosci.md`.

**Weryfikacja:** biblioteka w obu przeglądarkach na żywym `localhost:5173` (sprzętowy WebGL,
`visible`, zero `pageerror`); oba serwery MCP przez stdio (31 narzędzi, `browser_navigate`, zrzut).
Narzędzia `mcp__playwright-*` będą widoczne dopiero od następnej sesji Claude Code. ESLint czysty.

### Sesja 25.09 (dziewiąta) — zaległości: strzykawka bezigłowa, karta czekająca na MG, dialogi

**Zlecenie MG:** zrobić zaległości mieszczące się w jednej sesji, bez VPS. Rozstrzygnięcia MG:
**drobiazgi kodu + oględziny automatem**; kartę czekającą na MG **wyszarzyć**; Wsparcie 10
(„ta sama sprawa”) **zostaje na liście**; strzykawka **z karty, jednym rzutem**, a **pudło
zostawia dawkę**.

**Wdrożone:** guzik „Siłą” w sekcji Farmaceutyków (`character:use-dose` z `hostile`,
`rollHostileDose` rzuca ZW + Broń biała przeciw prawdziwemu ZW + Unik celu, `cpredHasAirhypo`);
`<fieldset className="sheet-lock">` wyłącza treść karty u właściciela przy `!playReady`;
`ruff format` w gatewayu. **Błąd spoza listy:** `.dialog` nie miał limitu wysokości — edycja żetonu
ze „Statystykami bojowymi” (1105 px) chowała „Zapisz” pod ekranem; od dziś każdy dialog przewija
się w środku. Umowy w `ui`, `karta`, `atak`; decyzja w `decyzje-i-uproszczenia.md`.

**Weryfikacja:** 2226 testów w `shared`, 1228 na serwerze, 281 u klienta, 59 w gatewayu; tsc,
ESLint, Prettier, ruff. W Chrome (kampania-śmieć, aktywna wróciła na „Test2”): atak strzykawką
Styma na Pasera (pudło, dawka została), blokada karty atrapą w DOM u Mary, trzy z czterech
poprawek z 13.09. Trafienie strzykawką i żywa karta czekająca na MG — tylko testem i atrapą.
