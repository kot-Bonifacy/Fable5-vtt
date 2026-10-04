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
| ⬜ otwarty   | **28** Wdrożenie na VPS; **43b**, **43c** (UI walki); następny: test **T9b** (odbiór etapu 44)  |
| ✅ ukończone | 01–11, 13–20b, 23a–27f, 27h–27l, 29a–30d, 31–35, 37–42c, 43a, 44a–44d (ostatni zamknięty: 44d, 2026-10-04) |
| ⛔ wycofane  | 12, 21, 22 (głos), 27g (wydajność), 36 (makra); 27, 29, 30, 38 rozdzielone na etapy literowane |

Pełna tabela z nazwami i datami: `archiwum/tabela-etapow.md`.

## Od czego zacząć

**Etap 44d zamknięty 04.10 — cały etap 44 „Konta MG” zrobiony, następny jest T9b** (odbiór 44c
i 44d: dwie grupy naraz, AI właściciela, limit sesji — start z `po-T9a`). Kampanie i sesje jak w 44c
(kampania **otwarta** u MG, sesja zajmuje jeden z dwóch slotów, gracz bez sesji ma „Między
sesjami”). **AI właściciela:** zwykły MG prosi w Panelu MG, właściciel decyduje z **każdego**
swojego konta — znaczek „AI” w górnym pasku z licznikiem próśb (konto gracza dostaje flagę
w „Ustawienia → Konto” hasłem właściciela). AI dostaje kampania właściciela zawsze, a kampania MG
ze zgodą — gdy właściciel jest obecny i ma włączone „Udostępniam AI” (gaśnie samo 2 min po jego
ostatniej karcie i po restarcie). **AI trzyma jedna trwająca sesja** (pierwsza uprawniona; koniec
przekazuje dalej; „Przejmij AI” tylko dla własnej sesji właściciela), przygotowanie dostaje AI, gdy
nikt go nie trzyma. Każde żądanie AI idzie przez bramę kampanii (`campaignAi`, umowa w `boty`),
odmowa to `AI_UNAVAILABLE` z powodem. Decyzje MG z 04.10 na końcu `etap-44d-ai-wlasciciela.md`.
**W `dev.db` zostało konto MG `ogledziny-b` (hasło `ogledziny-b-haslo`) z kampanią „Oględziny 44d
(MG-B)”, zgodą na AI i graczem „Właściciel”** — śmieci z oględzin, wolno skasować.

**Kolejność (MG 03.10): 44a → 44b → T9a → 44c → 44d → T9b → refaktoryzacja → T10 → 28 → T11.**

**Etap 43a zamknięty 26.09 (zlecenie MG spoza planu):** zakładka „Walka” to portrety z ranami od
dołu, ikonami efektów i akcjami grającego pod jego kartą; inicjatywa (rzut, remis, wpis, kubek
gracza, kolejność) żyje tylko na czarnym pasie; **odsetek PW widzi cały stół** (`hpShare`, decyzja
MG — obrączka na cudzych żetonach), „Postacie” w dwa wiersze. **43b** (animacja trafienia, iskry,
cięcie wręcz) i **43c** (plamy krwi na serwerze) rozpisane — MG wybrał „43a teraz, potem T4b”, więc
kolejność 43b/43c względem testów ustala MG. Umowy w `ui` i `mapa`.

**Otwarty jest tylko etap 28 (wdrożenie na VPS).** Przed nim idą **testy przed betą** (`testy.md`,
rejestr `testy-rejestr.md`): **T1, T2, T3a–T6c zamknięte** — **T6c 01.10: pełny przebieg od zera 196/196 dwa razy z rzędu (~31,5 min)** po dwóch poprawkach: kreator T3a skryptuje kości Cech Kowala, gateway ogranicza bufor promptów llama-server (`--cache-ram 2048`, wcześniej 8 GB w RAM-ie dusiło PC); T6b 30.09 (efekt na Cesze co do minuty, Ustabilizowanie obejściem krótką walką — **#42 B1: poza walką nie ma go w UI**, doba i odpoczynek, dziennik z kanarkiem, streszczenie i screamsheet botem, eksport, kopia z harmonogramu odtworzona na czystym katalogu, import na pustej instancji; nowe #42–#45, dopisek do Z10), T6a 29.09 (handel, sklep, Paser, PD,
Ola Medykiem operuje Kowala; zadanie Z10 — brak importu kampanii), T5b 27.09 (walka druga na „Bramie”: wieżyczka ze strefy, Demon, Kruk, przejęcie węzła, pad gatewaya w turze bota przez pośrednika TCP, F5 w Sieci, amunicja przeciwpancerna; sześć nowych błędów #34–#39), T5a 27.09 (przygotowanie „Bramy”, Skaner, run do Pliku; jego błędy #28–#33 naprawione i retestowane tego samego dnia), T4b 27.09 (granat, rana
krytyczna, Test Przeżywalności, Pochwycenie, wezwanie, łup i przekazanie; T4a przekalibrowany pod
obecne `po-T3`, retest #16, #19, #20 OK). **27.09 naprawione i retestowane:** #15, #17, #18, #23–#27
(`574cf4d`) oraz #28–#33 z T5a (`77e0f6f`; wagi w rejestrze dalej „do triażu MG”). **29.09 naprawione i retestowane #34–#39** (`8277386`), **30.09 — #40 i #41** (`21cbedd`:
gracz wskazuje po id tylko drużynę; operacja u Medyka innego gracza to prośba z ceną Medyka) oraz
retest #21 i #22. **01.10 naprawione i retestowane #10–#13 oraz #42–#45** (`a551f3a`) — #1–#45 zamknięte; **01/02.10 naprawione i retestowane #46 i #47** (`1e6f5dd`: limit odpowiedzi modelu w turze bota to `AI_TIMEOUT`, zapis karty nie cofa figury w marszu — umowy w `boty` i `mapa`) — **02.10 naprawione i retestowane #48 i #49** (`715df2b`: rzuty doganiają stół, karta niesie `revision` — umowy w `kosci` i `karta`), **02/03.10 naprawione i retestowane #50–#52** (`17f42a4`: figura łapie klik tylko na swoich polach, zmiana sceny zwalnia grafiki Pixi i pulę, kości zwalniają klony geometrii — umowy w `mapa` i `kosci`) — **rejestr bez otwartych błędów**; limity tempa, sesja gniazda i uploady za logowaniem (umowa w `serwer`), sesja i link zaproszenia ważne rok; zadania Z2–Z4, Z7 (reszta), Z9–Z11 dla etapów 28 i „Konta MG”. Suita `packages/e2e` (`pnpm test:e2e`)
stawia izolowaną instancję z `dist/` na :3101/:4173 i nie dotyka `dev.db`; **T6 podzielony na T6a/T6b/T6c** (decyzja MG z 29.09); **T7a zamknięty 01.10** (sieć, restart, dwie karty, degradacja AI — `pnpm test:e2e 40-odpornosc`,
poza domyślnym przebiegiem, od 02.10 z T7b i T7c 42 testy); **T7b zamknięty 02.10** (obciążenie stołu,
długi czat, rozmiar bazy — liczby w `testy.md` 6.3; **#48** stół minuty za serwerem przy częstych
rzutach, **#49** spóźnione echo zapisu karty gubi dopiski — triaż MG 02.10: B2 i B0, naprawione tego samego dnia); **T7c zamknięty 02.10**
(wydajność mapy na scenie 4096 i wyciek pamięci — `t7c-mapa`, `t7c-pamiec`, liczby w `testy.md` 6.3:
mapa 60 kl./s wszędzie poza Firefoksem gracza w marszu na Dynamicznej, serwer bez wycieku;
**#50** bufory Pixi po przełączeniu sceny, **#51** geometrie kości 3D, **#52** klik pod cudzą figurą
łapie jej podpis — to był „marsz Sowy”); **T8a zamknięty 03.10** (decyzja MG: T8 przed refaktoryzacją, podział T8a/T8b/T8c — `specs/50-przegladarki`,
macierz silników, ekrany 1920 × 1080 i 2560 × 1440, motyw, konsola; nowe #53–#55 — **03.10 triaż MG: #53 naprawiony** (szew sprite'a zasłony, `isRenderGroup`, umowa w `mapa`), **#54 i #55 odrzucone** — rejestr znów bez otwartych błędów);
**T8b zamknięty 03.10** (pierwszy kontakt: nowy gracz od linku do strzału w ~20 min bez pytań o UI; #56–#71 w rejestrze) i **tego samego dnia nowa zasada stołu (decyzja MG): obrażenia za kartę ataku rozliczają się same, Unik przed obrażeniami, jeden rzut na trafienie, grot za celownikiem** (`029cd36`, umowy w `atak` i `mapa`) — **03.10 (druga sesja): retest T5b → T6b z gatewayem zielony, triaż #57–#71 zrobiony (12 naprawionych w `120646b`, #66/#68/#71 B3 czekają), grot celowania widzi cały stół (`token:aim`, umowa w `mapa`), pełny przebieg 240/240**; **T8c zamknięty 03.10 (trzecia sesja)** — pobieżna regresja obszarów spoza scenariusza: `pnpm test:e2e t8c-` 31 testów z `po-T6` (mapa i „Lombard”, UI i ustawienia, tabele, asystent zasad, baza wiedzy, siedem Zdolności Ról, Reputacja, styl życia; lista w `testy.md` 6.4), nowe #72–#78; **03.10 (czwarta sesja) triaż MG i poprawki #66, #68, #71–#78** (`b9873e8`, retest `00-baseline` + `t8c-` 36/36) — **rejestr znów bez otwartych błędów**; **refaktoryzacja pod osłoną suity przesunięta za etap 44 (decyzja MG 03.10)** (pomiary T7b/T7c i T8a to jej linia bazowa). **Pełny przebieg puszczaj we własnym oknie konsoli, a gateway — w terminalu MG** (pułapka w `testy`).
Kolejność (decyzja MG z 26.09, korekta 01.10):
**T3–T6 → T7a–T7c → T8a–T8c (korekta 03.10) → 44a → 44b → T9a → 44c → 44d → T9b (korekta 03.10, piąta sesja) → refaktoryzacja całości pod osłoną suity → T10 (z powtórką automatu T8a) → 28 → T11**.
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

**Zaległości: cztery od 26.09 — wiele grup i wielu MG** (osobne konta MG to warunek bety; od trzeciej tury 26.09 do etapu „Konta MG” wchodzą też **limit dwóch sesji naraz** i **prośba MG o dostęp do AI właściciela**; plan testów bety w `testy.md`, T9) (RAM llama-server i wyścig `token:sync` zamknięte 03.10 — archiwum). Co ocenia się tylko przy stole (kafel papieru,
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

**Testy na koniec ostatniej sesji:** 04.10 (dziesiąta — 44d): **2267** `shared`, **1358** serwer, **321** klient; **pełny domyślny przebieg E2E 307/307** z gatewayem (42,5 min, nowy `01-dym/t44d-ai-wlasciciela` 4). Wcześniej 04.10 (dziewiąta — 44c): **2267** `shared`, **1347** serwer, **321** klient; pełny przebieg E2E **303 testy** (300 zielonych + migotanie T8c #72, powtórka zielona). Wcześniej 04.10 (ósma sesja — T9a): **pełny domyślny przebieg E2E 299/299** z gatewayem w 41,5 min (nowe `t9a-konta` 7 i `t9a-izolacja` 14), kodu aplikacji nie ruszano. Wcześniej **2264** w `shared`, **1337** na serwerze, **319** u klienta (04.10, siódma sesja — 44b; E2E `00-baseline` + `01-dym` + `35-bezpieczenstwo` 59/59, `t3a-` 15/15; wcześniej 03.10, szósta sesja — 44a; E2E: `00-baseline` + `01-dym` + `35-bezpieczenstwo` z nowym `t2d-konta-mg`, domyślny przebieg ma teraz **278** testów); **63** w gatewayu (03.10, czwarta sesja: `00-baseline` + `t8c-` 36/36 z gatewayem po poprawkach #66–#78; domyślny przebieg ma teraz **272** testy — pełnego od zera z T8c jeszcze nie puszczano; trzecia — T8c — `t8c-` 31/31; E2E drugiej sesji: **pełny domyślny przebieg 240/240 w 36,4 min** z gatewayem, wcześniej T5b 27/27 i T6a + T6b 31/31; dalej stan starszy:)
**61** w gatewayu (01.10, `--cache-ram`), **240** E2E w domyślnym przebiegu (196 + 44 T8a z 03.10: `t8a-` 44/44 po poprawce #53; wcześniej 42/42 dwa razy, `@szybkie` 30/30) + **42** odporności T7a–T7c poza nim (02/03.10 po poprawkach #50–#52: `t7c-` 16/16 w 53,7 min z progami wycieku, `00-baseline` 5/5; 02.10 T7c: `t7c-mapa` 9/9, `t7c-pamiec` 4/4 w 43,7 min, `t7c-marsz-pod-figura` 2/2 z jednym `test.fail` #52, `00-baseline` 5/5; wcześniej 26 bez `test.fail`; po poprawkach #48/#49 `40-odpornosc` 26/26 w pełnej skali, 24,1 min) (02.10 T7b — `t7b-obciazenie` 3/3 w pełnej skali, `t7b-czat-baza` 5/5; 02.10 — `40-odpornosc` 17/17 dwa razy, T4a → T4b od `po-T3` 34/34; 01.10 T6c — pełny przebieg od zera 196/196 dwa razy z rzędu, 31,5 i 31,6 min; 01.10 — T2 od `po-T3` 41/41, T6b od `po-T6a` 18/18; 30.09 — T6b od `po-T6a` trzy razy, T6a → T6b od `po-T5` 30/30, T6a od `po-T5` 13/13 cztery razy, T2 od `po-T3` 41/41; 29.09 — T4a → T5b od `po-T3` 84/84; 27.09 system zabił procesy w tle z braku pamięci — przyczyną był bufor promptów llama-server) — sumy w starszych notatkach są zaniżone, nie poprawiaj ich w dół. ESLint, Prettier
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
| `mapa`      | figury, zaznaczanie, narzędzia, obiekty sceny, ściany, efekty  | 61   | 26      |
| `czat`      | rodzaje wierszy, `visibleTo`, filtr, `seq`                     | 7    | 3       |
| `serwer`    | Prisma i migracje, zdarzenia gniazda, zapisy karty, uploady    | 22   | 21      |
| `ui`        | okna pływające, `z-index`, motyw, skróty, dostępność, wejście  | 28   | 14      |
| `kosci`     | kubek, `rollFormula`, wezwania i prośby o Test, tabele losowe  | 20   | 2       |
| `tura`      | budżet Akcji i metrów, kolejka, trasa, ruch przez ściany       | 12   | 5       |
| `atak`      | broń i dodatki, amunicja, obrażenia, pancerz, rany krytyczne   | 40   | 8       |
| `statysta`  | figura z kartą, `statBlock`, Wartość bojowa, `token:stat`      | 13   | 3       |
| `karta`     | strony i zakładki, panele, `sheet.css`, walidacja list         | 9    | 11      |
| `postac`    | kreator, PD i awanse, Role i Zdolności, cyborgizacje, ekonomia | 48   | 3       |
| `ekwipunek` | wiersze wyposażenia, przekazanie, łup, handel, zasięg, oględziny | 18   | 2       |
| `czas`      | zegar świata, kalendarz, `statEffects`, leczenie po dobie      | 17   | 2       |
| `siec`      | Programy, LOD, demony, piętra architektury                     | 7    | 3       |
| `boty`      | llama-server, RAG, reindeks, dziennik i baza wiedzy, brama AI  | 7    | 8       |
| `dane`      | `parse-manual.py`, kompendium poza repo, tabele z podręcznika  | 5    | 11      |
| `kopie`     | `snapshot`, `archive`, rotacja, eksport i import               | 8    | 2       |
| `ogledziny` | CDP i Playwright MCP, zrzuty, dwie sesje, `window.confirm`    | 0    | 111     |
| `testy`     | vitest, migotanie, `tsc --noEmit`, środowisko dev              | 0    | 124     |


## Notatki z dwóch ostatnich sesji

Starsze — w całości w `archiwum/dziennik-sesji.md`.

### Sesja 04.10 (dziesiąta) — etap 44d „AI właściciela”

**Zlecenie MG:** „kontynuuj projekt (etap 44d)”, pytać o niejasności. **Decyzje MG:** konto gracza
dostaje flagę właściciela hasłem właściciela („Ustawienia → Konto”); AI w przygotowaniu tylko
wtedy, gdy żadna sesja go nie trzyma (także dla kampanii właściciela); „Przejmij AI” tylko przy
własnej sesji właściciela; panel z konta gracza — znaczek „AI” w górnym pasku z licznikiem
i notatka na czacie (szczegóły na końcu `etap-44d-ai-wlasciciela.md`).

**Zrobione:** migracja `ai_access` (`User.aiAccess`, `aiRequestedAt`, `aiDecidedAt`). `ai/access.ts`:
`AiAccess` (kampanie w pamięci, `refresh()`, prawo `aiEntitlement`, dzierżawa `pickLeaseHolder`,
obecność właściciela z karencją `VTT_AI_OWNER_GRACE_SECONDS` = 120, `takeOver`) i `CampaignAi` —
jedyna droga do gatewaya (strumień, RAG tylko z kolekcji kampanii, liczenie tokenów, podręcznik);
`ctx.ai` to od teraz brama, ~40 miejsc wołania przepiętych na `campaignAi`/`socketAi`. `ai:status`
per gniazdo z `reason`, tylko gdy się zmienił. Trasy `routes/ai-access.ts` (prośba, panel
właściciela z każdego konta z flagą, `owner-link`), push `ai-access:owner`/`ai-access:mine`.
`rules:index` tylko dla właściciela. Klient: `OwnerAiButton`/`OwnerAiWindow`/`OwnerAiPanel`,
`AiAccessRequest` w Panelu MG, `OwnerLink` w ustawieniach gracza, powody w panelach botów i AI
(`ai-status.ts`). Testy: `ai-access.test.ts` (11: wszystkie kombinacje prawa, dzierżawa, „Przejmij”,
karencja z F5, cofnięcie w trakcie strumienia, kanarek prośby, licznik żądań na atrapie = 0,
kolekcje RAG, strażnik „jedna brama”), E2E `01-dym/t44d-ai-wlasciciela` (`@szybkie`). Poprawka
wyścigu w `sessions.test.ts` (pułapka w `testy`).

**Weryfikacja:** `shared` 2267, serwer 1358, klient 321; ESLint, Prettier, `tsc` czyste. **Pełny
domyślny przebieg E2E z gatewayem: 307/307 (42,5 min).** Oglądane: MG-B w **Firefoksie** (Panel
MG z prośbą, zakładki „Boty” i „AI” z „AI zajęte przez inną sesję”), właściciel w Chromium
(znaczek „AI 1”, notatka, okno, zgoda, przełącznik), konto gracza w Chromium (`[::1]`) — połączenie
z właścicielem i znaczek. Przy pełnym przebiegu system zabił z braku RAM-u czujniki w tle (sam
przebieg we własnym oknie przeżył; wolne ~1 GB przy llama-server + E2E + przeglądarkach MCP).

**Następny krok:** T9b (odbiór 44c i 44d, `testy.md` sekcja 6.5 punkty 4, 8, 10) z `po-T9a`.

### Sesja 04.10 (dziewiąta) — etap 44c „Sesje i sloty”

**Zlecenie MG:** „kontynuuj projekt (etap 44c)”, pytać o niejasności. **Decyzje MG:** MG z trwającą
sesją nie przechodzi do innej kampanii; czat przygotowania tylko dla MG, na zawsze; gracz między
sesjami może też wydawać PD, kupować i przelewać, tworzyć postać kreatorem, przekazywać i handlować;
widok między sesjami to ekran stołu bez mapy na plakacie logowania — **gracz nigdy nie dostaje
pustego ekranu** (szczegóły na końcu `etap-44c-sesje-sloty.md`).

**Zrobione:** migracja `session_slots` (`Campaign.active` → `sessionStartedAt`, `lastSessionEndedAt`,
`User.openCampaignId`, `ChatMessage.prep`; dawna aktywna kampania dostaje trwającą sesję, MG — otwartą
kampanię). `realtime/sessions.ts`: `campaign:open` (tylko gniazda tego MG), `session:start` (slot
jednym warunkowym `UPDATE`), `session:end`, `seatSocket` (stół albo `lobbyRoom`), zegar
`SessionClock` + `sweepSessions` co minutę, sesje zastane po restarcie. Bramka `SESSION_NOT_RUNNING`
w `registerEvents` z białą listą `BETWEEN_SESSIONS_EVENTS`; dostarczenia do jednego gracza przez
`campaignMemberSockets`; `prep` ustawia rozszerzenie Prismy. Klient: `SessionControl` w pasku MG,
`BetweenSessions`, „Otwórz” w Panelu MG, obecność z `atTable`. `CLAUDE.md` „Skala”, `.env.example`.
Testy: `sessions.test.ts` (13: limit, wyścig trzech startów, dwie karty MG, bezczynność oba progi na
sztucznym zegarze, restart, biała lista na wszystkich zdarzeniach gracza, przeniesienie tylko
własnych gniazd, czat przygotowania), `campaign-switch.test.ts` usunięty (zastąpiony), E2E
`01-dym/sesje.spec.ts` (`@szybkie`), T3a klika „Rozpocznij sesję”, T9a przerobiony (dwie sesje
naraz, koniec B nie rusza A), progi bezczynności w instancji E2E — 600 min.

**Weryfikacja:** `shared` 2267, serwer 1347, klient 321; ESLint, Prettier, `tsc` czyste w czterech
pakietach. **Pełny domyślny przebieg E2E z gatewayem: 300 zielonych, 1 migotanie (T8c #72 — powtórka
pliku 6/6, zaległość do triażu), 2 niepuszczone za nim — w powtórce zielone** (41,6 min). Wcześniej `35-bezpieczenstwo`
68/68, `01-dym` 11/11. Oglądane: automat MG w Chromium + gracz w **Firefoksie** (start, koniec, widok
między sesjami, F5) oraz tymczasowy skrypt Playwright z zrzutami — plakat 1920×1080, 1280×720,
900×700, 1500×460 (przy 1500×460 ostatni wiersz wchodzi na budynek — jak logowanie), pasek MG
w trzech stanach, Panel MG, **kreator gracza z rzutem Cechy kubkiem poza stołem**. Po oględzinach
krótszy placeholder czatu i zdanie w pustym czacie między sesjami. `dev.db` zmigrowana (kopia
sprzed sesji w scratchpadzie).

**Następny krok:** etap 44d (AI właściciela) — `etap-44d-ai-wlasciciela.md`; potem T9b z `po-T9a`.

