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

**Testy na koniec ostatniej sesji:** **2202** w `shared`, **1220** na serwerze, **279** u klienta —
zielone (23.09; sumy w starszych notatkach są zaniżone, nie poprawiaj ich w dół). ESLint, Prettier
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
| `serwer`    | Prisma i migracje, zdarzenia gniazda, zapisy karty, uploady    | 10   | 16      |
| `ui`        | okna pływające, `z-index`, motyw, skróty, dostępność, wejście  | 13   | 13      |
| `kosci`     | kubek, `rollFormula`, wezwania i prośby o Test, tabele losowe  | 15   | 1       |
| `tura`      | budżet Akcji i metrów, kolejka, trasa, ruch przez ściany       | 8    | 5       |
| `atak`      | broń i dodatki, amunicja, obrażenia, pancerz, rany krytyczne   | 32   | 8       |
| `statysta`  | figura z kartą, `statBlock`, Wartość bojowa, `token:stat`      | 13   | 3       |
| `karta`     | strony i zakładki, panele, `sheet.css`, walidacja list         | 7    | 11      |
| `postac`    | kreator, PD i awanse, Role i Zdolności, cyborgizacje, ekonomia | 40   | 2       |
| `ekwipunek` | wiersze wyposażenia, przekazanie, łup, handel, zasięg, oględziny | 15   | 2       |
| `czas`      | zegar świata, kalendarz, `statEffects`, leczenie po dobie      | 16   | 2       |
| `siec`      | Programy, LOD, demony, piętra architektury                     | 1    | 3       |
| `boty`      | llama-server, RAG, reindeks, dziennik i baza wiedzy            | 1    | 3       |
| `dane`      | `parse-manual.py`, kompendium poza repo, tabele z podręcznika  | 2    | 9       |
| `kopie`     | `snapshot`, `archive`, rotacja, eksport i import               | 8    | 2       |
| `ogledziny` | automatyka CDP, zrzuty, dwie sesje naraz, `window.confirm`     | 0    | 85      |
| `testy`     | vitest, migotanie, `tsc --noEmit`, środowisko dev              | 0    | 22      |


## Notatki z dwóch ostatnich sesji

Starsze — w całości w `archiwum/dziennik-sesji.md`.

### Sesja 23.09 (druga) — dwie zaległości: kopia startowa i Prettier

**Zlecenie MG:** kilka zaległości na jedną sesję; MG wybrał dwie drobne (bez nowych funkcji
i bez oględzin automatem).

**Wdrożone:** `linkTree` (`snapshots.ts`) pomija plik skasowany przez sprzątanie sierot między
listą a dowiązaniem — dotąd ENOENT w zapasowym `copyFile` przerywał **całą** kopię startową.
Test z atrapą `link` odtwarza wyścig (bez poprawki pada tym samym błędem co dziennik).
`aim-preview.test.ts` był w repo sformatowany — CRLF tylko na dysku; razem 15 takich plików
wypakowanych od nowa z LF (bez zmiany treści). Pułapki w `kopie` i `testy`, zamknięcie
w archiwum zaległości.

**Weryfikacja:** 1220 testów serwera (+1), tsc serwera, ESLint, Prettier trzech pakietów czysty.
`shared` i klient nieruszone. Serwer dev przeładował się sam; kopia startowa 22:41 powstała
(83 pliki, dowiązania), `/health` odpowiada.

### Sesja 23.09 — handel między figurami (etap 38c)

**Zlecenie MG poza etapem 28:** handel przez przeciąganie rzeczy i gotówki do pól wymiany
widocznych dla stron, wykonany po zgodzie obu. Rozstrzygnięcia MG przed kodem: gracz ↔ gracz
i gracz ↔ NPC (NPC-a prowadzi MG), zasięg ramienia, zaproszenie ze zgodą, zmiana pola kasuje obie
zgody, MG podgląda i przerywa, **bez czatu w oknie** (MG zrezygnował). Opis i wynik:
`etap-38c-handel.md`; umowa w `ekwipunek`, pułapka przeciągania w `ui`.

**Wdrożone:** `cpredSwapItems`/`cpredOfferViews` (shared), stan handlu w `shared/src/trade.ts`,
siedem zdarzeń `trade:*` z wykonaniem w jednej transakcji (`realtime/trade.ts`, negocjacje
w pamięci serwera), okno z przeciąganiem na zdarzeniach wskaźnika, dok w rogu mapy, wejścia
z menu figury i z karty, karta czatu „Handel”. **Po drodze:** naprawiony błąd 38b — „Gotówka →”
w oknie „Wymiana” nie przenosiła samej gotówki (`NO_ITEMS`); ESLint z korzenia ignoruje
`**/.venv/**` (vendorowany JS yt-dlp z 21.09 dawał 378 błędów).

**Weryfikacja:** 2202 / 1219 / 279 testów; tsc trzech pakietów, ESLint, build Vite. Prettier
czysty poza zastanym `aim-preview.test.ts` (zaległość). Chrome na kampanii „Oględziny 12.09”
(`Tester` ↔ nowy NPC „Paser Oględzin”), potem aktywna wróciła na **„Test2”**: pełen handel myszą,
zdjęcie zgody zmianą pola, F5 w trakcie, odrzucenie zaproszenia; konsola czysta. Nieobejrzane:
dotyk (iPad) i dwóch graczy w przeglądarce. Serwer i Vite działają. Wyścig snapshotu ze
sprzątaniem przy starcie potwierdzony i zdiagnozowany (`zaleglosci.md`, nie naprawiany).
