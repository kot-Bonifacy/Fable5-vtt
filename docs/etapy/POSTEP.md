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
wszystko ciemniejsze od papieru („żadnego brudu”). Poza skórą: Sieć, pasek mapy, screamsheet,
logowanie. **Oględziny ręką MG i Safari/iPad czekają** (`zaleglosci.md`). **`styles.css` jest od
18.09 spisem `@import` 19 plików w `styles/`** — czytaj plik obszaru, nie całość (umowa w `ui`).

**Naprawa kreatora (`naprawa_karty_postaci.md`) zamknięta 18.09** (etapy 1, 2a–2c, 3a–3d, odbiór
obu metod). Dalsza praca przy kreatorze wychodzi z `POMYSLY.md` (rozbicie rzutów na pojedyncze
kości przez kubek — zlecenie MG z 17.09, opis na górze pliku) i z `zaleglosci.md`. Co obowiązuje
w kodzie — sekcja `postac` w umowach; kontekst — `archiwum/od-czego-zaczac.md`.

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

**Testy na koniec ostatniej sesji:** **2220** w `shared`, **1224** na serwerze, **282** u klienta,
**59** w gatewayu — zielone (24.09; sumy w starszych notatkach są zaniżone, nie poprawiaj ich w dół). ESLint, Prettier
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
| `ui`        | okna pływające, `z-index`, motyw, skróty, dostępność, wejście  | 13   | 13      |
| `kosci`     | kubek, `rollFormula`, wezwania i prośby o Test, tabele losowe  | 15   | 1       |
| `tura`      | budżet Akcji i metrów, kolejka, trasa, ruch przez ściany       | 8    | 5       |
| `atak`      | broń i dodatki, amunicja, obrażenia, pancerz, rany krytyczne   | 32   | 8       |
| `statysta`  | figura z kartą, `statBlock`, Wartość bojowa, `token:stat`      | 13   | 3       |
| `karta`     | strony i zakładki, panele, `sheet.css`, walidacja list         | 7    | 11      |
| `postac`    | kreator, PD i awanse, Role i Zdolności, cyborgizacje, ekonomia | 40   | 2       |
| `ekwipunek` | wiersze wyposażenia, przekazanie, łup, handel, zasięg, oględziny | 16   | 2       |
| `czas`      | zegar świata, kalendarz, `statEffects`, leczenie po dobie      | 16   | 2       |
| `siec`      | Programy, LOD, demony, piętra architektury                     | 1    | 3       |
| `boty`      | llama-server, RAG, reindeks, dziennik i baza wiedzy            | 2    | 6       |
| `dane`      | `parse-manual.py`, kompendium poza repo, tabele z podręcznika  | 2    | 9       |
| `kopie`     | `snapshot`, `archive`, rotacja, eksport i import               | 8    | 2       |
| `ogledziny` | automatyka CDP, zrzuty, dwie sesje naraz, `window.confirm`     | 0    | 86      |
| `testy`     | vitest, migotanie, `tsc --noEmit`, środowisko dev              | 0    | 22      |


## Notatki z dwóch ostatnich sesji

Starsze — w całości w `archiwum/dziennik-sesji.md`.

### Sesja 24.09 (trzecia) — porządki w ustawieniach dźwięku

**Zlecenie MG:** ograniczyć ustawienia i opisy efektów dźwiękowych, usunąć rządek próbek,
uporządkować. Rozstrzygnięcia MG: **jedna sekcja „Dźwięk”** w ⚙ Ustawieniach (muzyka i otoczenie
zostają w oknie muzyki), **wszystkie przyciski odsłuchu precz**, opisy tylko w dymku (`title`),
**kości + kubek jednym suwakiem**, **efekty mapy odłączone od „Animacji 3D”**, **bez przełącznika
kroków**.

**Wdrożone:** `SettingsWindow` — sekcja „Dźwięk” (Efekty mapy, Kości, Powiadomienia + zdarzenia
w dwóch kolumnach, `VolumeRow`), „Kości” łączy animację 3D ze skórkami. Usunięte: `SFX_SAMPLES`,
`auditionFxSound`, `auditionCupNotification`, `auditionNotification`, `cupVolume`, `stepSounds`
(klucze `vtt.cup.volume` i `vtt.sfx.steps` w localStorage po prostu przestają być czytane);
grzechot kubka bierze `diceVolume`; `sfxEnabled` patrzy tylko na suwak. `sfx.test.ts` bez
testu przycisków odsłuchu; umowa „Nowa próbka dźwiękowa mapy” w `mapa` — cztery miejsca.

**Weryfikacja:** 281 testów klienta, tsc, ESLint, Prettier; okno obejrzane w Chrome jako MG.

### Sesja 24.09 (druga) — zaległości lokalnego LLM na nowym modelu

**Zlecenie MG:** zaległości dotyczące lokalnego LLM, z pytaniami przy wątpliwościach. Na starcie
wyszło, że `.env` gatewaya wskazuje na skasowany Qwythos-9B, a na dysku leży Qwen3.8-27B
UD-Q3_K_XL z nowym buildem llama-server. Rozstrzygnięcia MG: **przejście na Qwen3.8-27B**,
wszystkie cztery grupy (20a/20b, 19a–19c, 24c, polszczyzna + maszynopis), oględziny na
kampanii-śmieciu, map-reduce na sztucznym logu; po oględzinach: nagłówek screamsheetu zwykłą
pisownią, zakaz powtarzania zdań w kotwicy, pytanie do myślącego bota **zostaje** bez zmian,
taktyka bota do `POMYSLY.md`.

**Wdrożone:** gateway wysyła `thinking_budget_tokens` obok `reasoning_budget` (bez tego pytanie
o zasady wracało po 30 s puste); `walkTowards` bota nie dokłada drugiego pół kratki do `canStep`
(**bot przechodził przez ściany na liniach kratki**, test regresji); kotwica relacji gramatyczna
przy ±3 i z kierunkiem tonu; `relationForSpeaker`/`relationPromptLines` łączą podpis konta
z postacią; ogólny zakaz powtarzania zdań w `buildRoleAnchor`; nagłówek screamsheetu zwykłą
pisownią; podwojone zdanie odmowy w śladzie MG; typ testu w `itemicons.test.ts` (czerwony `tsc`
z poprzedniego commita). Dokumenty: CLAUDE.md (stos, VRAM), README gatewaya (model, pomiary,
budżet myślenia), `.env.example`, „Ryzyka” w przeglądzie. Umowa i trzy pułapki w `boty`.

**Oględziny (skrypty na gniazdach + Chrome u MG):** 19a, 19b, 19c, 20a, cały 20b, 24c, maszynopis
bez tempa — wyniki i czasy w `archiwum/zamkniete-zaleglosci.md`. Kampania-śmieć wróciła do stanu
sprzed sesji (figury, broń Pasera, bez walki i bez bariery 75); zostały w niej boty testowe
(nieaktywne), wpis wiedzy „Bar «Pod Zardzewiałym Kablem»” i ~2500 linii sztucznego czatu.
Aktywna kampania wróciła na **„Test2”**. Gateway i serwery dev działają.

**Weryfikacja:** 2220 / 1224 / 282 testów, gateway 59; tsc, ESLint, Prettier trzech pakietów
czyste, `ruff check` czysty (`ruff format` — stary dryf 4 plików, zaległość).

