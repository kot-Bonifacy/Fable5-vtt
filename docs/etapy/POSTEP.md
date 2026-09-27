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
| ⬜ otwarty   | **28** Wdrożenie na VPS; **43b** animacja trafienia, **43c** plamy krwi (UI walki)             |
| ✅ ukończone | 01–11, 13–20b, 23a–27f, 27h–27l, 29a–30d, 31–35, 37–42c, 43a (ostatni zamknięty: 43a, 2026-09-26) |
| ⛔ wycofane  | 12, 21, 22 (głos), 27g (wydajność), 36 (makra); 27, 29, 30, 38 rozdzielone na etapy literowane |

Pełna tabela z nazwami i datami: `archiwum/tabela-etapow.md`.

## Od czego zacząć

**Etap 43a zamknięty 26.09 (zlecenie MG spoza planu):** zakładka „Walka” to portrety z ranami od
dołu, ikonami efektów i akcjami grającego pod jego kartą; inicjatywa (rzut, remis, wpis, kubek
gracza, kolejność) żyje tylko na czarnym pasie; **odsetek PW widzi cały stół** (`hpShare`, decyzja
MG — obrączka na cudzych żetonach), „Postacie” w dwa wiersze. **43b** (animacja trafienia, iskry,
cięcie wręcz) i **43c** (plamy krwi na serwerze) rozpisane — MG wybrał „43a teraz, potem T4b”, więc
kolejność 43b/43c względem testów ustala MG. Umowy w `ui` i `mapa`.

**Otwarty jest tylko etap 28 (wdrożenie na VPS).** Przed nim idą **testy przed betą** (`testy.md`,
rejestr `testy-rejestr.md`): **T1, T2, T3a, T3b, T4a, T4b i T5a zamknięte** — T5a 27.09 (przygotowanie „Bramy”, Skaner, run do Pliku; sześć nowych błędów #28–#33 czeka na triaż MG), T4b 27.09 (granat, rana
krytyczna, Test Przeżywalności, Pochwycenie, wezwanie, łup i przekazanie; T4a przekalibrowany pod
obecne `po-T3`, retest #16, #19, #20 OK). **27.09 naprawione i retestowane:** #15, #17, #18, #23–#27
(`574cf4d`). **Otwarte: #10–#13** (na etap „Konta MG”, zadania Z5–Z8) **i #28–#33 z T5a**
(wagi do triażu MG: #31 hasło w Sieci i #32 wyciek nazwy architektury proponowane jako B1); zadania
Z2–Z9 dla etapów 28 i „Konta MG”. Suita `packages/e2e` (`pnpm test:e2e`)
stawia izolowaną instancję z `dist/` na :3101/:4173 i nie dotyka `dev.db`; **następny T5b** (walka
druga na „Bramie”, potrzebny gateway z modelem) od punktu `po-T5a` — albo najpierw poprawki #28–#33.
Kolejność (decyzja MG z 26.09):
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

**Testy na koniec ostatniej sesji:** **2243** w `shared`, **1253** na serwerze, **300** u klienta,
**59** w gatewayu (27.09, poprawki po T4b), **139** E2E (11 `test.fail` — #10–#13 i #28–#33, 27.09 — T4b + T5a od `po-T4a` zielone; pełnego przebiegu od zera po T5a nie było) — sumy w starszych notatkach są zaniżone, nie poprawiaj ich w dół. ESLint, Prettier
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
| `mapa`      | figury, zaznaczanie, narzędzia, obiekty sceny, ściany, efekty  | 50   | 20      |
| `czat`      | rodzaje wierszy, `visibleTo`, filtr, `seq`                     | 5    | 3       |
| `serwer`    | Prisma i migracje, zdarzenia gniazda, zapisy karty, uploady    | 13   | 17      |
| `ui`        | okna pływające, `z-index`, motyw, skróty, dostępność, wejście  | 24   | 14      |
| `kosci`     | kubek, `rollFormula`, wezwania i prośby o Test, tabele losowe  | 16   | 1       |
| `tura`      | budżet Akcji i metrów, kolejka, trasa, ruch przez ściany       | 9    | 5       |
| `atak`      | broń i dodatki, amunicja, obrażenia, pancerz, rany krytyczne   | 39   | 8       |
| `statysta`  | figura z kartą, `statBlock`, Wartość bojowa, `token:stat`      | 13   | 3       |
| `karta`     | strony i zakładki, panele, `sheet.css`, walidacja list         | 8    | 11      |
| `postac`    | kreator, PD i awanse, Role i Zdolności, cyborgizacje, ekonomia | 45   | 3       |
| `ekwipunek` | wiersze wyposażenia, przekazanie, łup, handel, zasięg, oględziny | 17   | 2       |
| `czas`      | zegar świata, kalendarz, `statEffects`, leczenie po dobie      | 17   | 2       |
| `siec`      | Programy, LOD, demony, piętra architektury                     | 1    | 3       |
| `boty`      | llama-server, RAG, reindeks, dziennik i baza wiedzy            | 4    | 7       |
| `dane`      | `parse-manual.py`, kompendium poza repo, tabele z podręcznika  | 4    | 9       |
| `kopie`     | `snapshot`, `archive`, rotacja, eksport i import               | 8    | 2       |
| `ogledziny` | CDP i Playwright MCP, zrzuty, dwie sesje, `window.confirm`    | 0    | 104     |
| `testy`     | vitest, migotanie, `tsc --noEmit`, środowisko dev              | 0    | 50      |


## Notatki z dwóch ostatnich sesji

Starsze — w całości w `archiwum/dziennik-sesji.md`.

### Sesja 27.09 — T5a: „Brama” — przygotowanie MG, wejście, run Oli (sześć nowych błędów)

**Zlecenie MG:** etap testowy T5 (`testy.md` 5.3), z prawem podziału. Dwie tury pytań — decyzje
w `testy.md`, sekcja 2: **T5a przed walką / T5b walka**, architektura Hasło → Plik → Czarny LOD →
Węzeł wieżyczki z Demonem na dnie, pad gatewaya przez pośrednika TCP w suicie, Kowal wchodzi
ranny, nowy „Strażnik” z botem, Ola strzela wieżyczką i ją wyłącza, amunicja przeciwpancerna od MG.

**Zrobione:** `30-rozgrywka/t5a-brama-siec.spec.ts` (24 testy) i `fixtures/brama.ts`; `walka.ts`
czyta aktywną scenę; hak `__vttE2E` dostał magazyny `netRun`, `zone`, `wall`, `fog` (tylko build
`--mode e2e`). W aplikacji bez zmian. Przebieg i punkt `po-T5a` — `testy.md` 5.3 i notatka sesji.

**Znalezione (do triażu MG, wszystkie `test.fail` z obejściem):** #28 marsz pod skraj ręcznej mgły
wraca na start (`Math.floor(543 / 36.2)` = 14, kratka niecałkowita); #29 odmowa ruchu poza walką
odsyła do nieistniejącej karty; #30 na ręcznej mgle gracz nie ma klamek drzwi i bram; #31 hasło na
piętrze wejścia nie blokuje zjazdu (`netCanMove`); #32 nazwa architektury w ładunku runu gracza;
#33 brak UI wiązania strefy z węzłem. Proponowane wagi w rejestrze: dwa B1 (#31, #32), trzy B2, B3.

**Weryfikacja:** T5a od `po-T4` zielony (24, w tym 6 `test.fail`), T4b + T5a od `po-T4a` 43/43;
`tsc`, ESLint, Prettier czyste w `packages/e2e` i kliencie. Oglądane automatem: MG i Marek
w Chromium, Ola w Firefoksie, headless. `dev.db` nietknięta; gateway martwy (T5a go nie woła).

### Sesja 27.09 — poprawki po T4b: #15, #17, #18, #23–#27 (retest E2E OK)

**Zlecenie MG:** naprawić błędy z `testy-rejestr.md`, ile zmieści się w sesji. #10–#13 zostały
na etap „Konta MG” (decyzje MG z 26.09, Z5–Z8); wzięte B1 walki, dane, grot i zbiorczy #15.

**Zrobione (`574cf4d`):** strzelca karty ataku wskazuje `attackerTokenId` — klient (`AttackRow`)
i serwer (`requireAttackShooter`, `NOT_THE_SHOOTER`), a łup nie niesie id `statist-weapon`
(#23, #27); `damage:apply` stosuje kartę do celu raz, do „Cofnij” (`DAMAGE_ALREADY_APPLIED`, #26);
zasięg ręki po polach ze skosami (`reachMetresBetweenTokens`, `CpredAttackTarget.reachMetres`) —
atak wręcz, Pochwycenie, Ustabilizowanie, zastrzyk, przekazanie, handel (#24); grot kierunku
z `eventMode = 'none'` (#25); `PrismaClientValidationError` → `BAD_REQUEST` w rejestrze zdarzeń,
`ai:ask`/`rules:ask` sprawdzają typ napisu (#15); `parse-manual.py` daje wpisy „Bijatyka”,
„Sztuki walki” (0 ed) i „Granat” (10 ed na sztukę, cena w prywatnym `manual-overrides.json`),
`data/private` przegenerowane (#17, #18). Umowy w `atak`, `ekwipunek`, `serwer`, `mapa`, `dane`;
pięść bez wiersza na karcie → `POMYSLY.md` (decyzja MG). **Cena granatu to mój odczyt s. 344–345**
— do potwierdzenia przez MG. Działający serwer dev trzeba zrestartować, żeby wczytał nowe kompendium.

**Weryfikacja:** shared 2243 (+3), serwer 1253 (+5, w tym `junk-payloads.test.ts`; test 42b
cofa pierwsze trafienie przed drugim „Zastosuj”), klient 300; ESLint, Prettier, `tsc` czyste
w czterech pakietach. Testy #26 i #27 padają po cofnięciu poprawek. E2E: `E2E_FROM=po-T3` —
107 zaliczonych (T3a–T4b i T2, bez `test.fail()` dla naprawionych), `@szybkie` od zera 12/12.
Oglądane automatem: MG i Marek w Chromium, Ola w Firefoksie, headless; #25 retestowany kliknięciem
w środek żetonu przykrytego grotem (T4b, Chromium). `dev.db` nietknięta.
