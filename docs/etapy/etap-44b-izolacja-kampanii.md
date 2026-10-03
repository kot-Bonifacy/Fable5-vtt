# Etap 44b — Izolacja kampanii i imienne linki graczy

**Faza:** przed betą · **Wymaga etapów:** 44a · Decyzje i kontekst: `etap-44-konta-mg.md`

## Decyzje MG (03.10, siódma sesja)

1. **Uploady — wariant A:** katalog kampanii `uploads/campaigns/<campaignId>/<rodzaj>/`, dostęp
   po samej ścieżce (MG kampanii albo jej członek). Migracja przenosi pliki i poprawia adresy.
   Import karty lub sceny do innej kampanii kopiuje pliki, które importujący może czytać.
2. **Migracja:** dotychczasowe anonimowe linki unieważnione, gracze, którzy już weszli, zostają
   przy swoich kontach (także `Tester` w pięciu kampaniach). Zasada „konto gracza = jedna
   kampania” dotyczy nowych linków.
3. **Link odnowienia nie wylogowuje** innych urządzeń gracza.
4. **Nieużyty imienny link (nowy gracz i odnowienie) jest ważny 7 dni.**

## Do decyzji MG na starcie sesji (rozstrzygnięte wyżej)

- **Uploady per kampania.** Propozycja: nowe pliki lądują w `uploads/campaigns/<campaignId>/<rodzaj>/`,
  a `/uploads/*` sprawdza członkostwo po samej ścieżce, bez szukania po bazie. Migracja przenosi
  istniejące pliki i poprawia adresy w bazie. `uploads/art/` (mapa powitalna) zostaje wspólne dla
  zalogowanych. Wariant B: płaskie katalogi i wyszukanie kampanii po adresie w bazie.
- **Stare linki kampanii** (bez imienia) migracja unieważnia. Gracze, którzy już weszli, zostają.

## Zakres

- [x] **Strażnik własności w jednym miejscu.** Gniazdo MG trafia tylko do kampanii, której jest
      `gmId`. Każde zdarzenie `role: ROLE_GM` działa wyłącznie w kampanii gniazda, a każdy
      identyfikator z ładunku (scena, figura, karta, bot, architektura Sieci, handout, wpis
      dziennika, bazy wiedzy, kompendium MG, tabela losowa, walka…) jest sprawdzany jako należący
      do tej kampanii. Obcy obiekt daje `NOT_FOUND`, nie `FORBIDDEN`, żeby odmowa nie zdradzała, że
      obiekt istnieje. Pomocnik w `realtime/`, a przegląd 144 zdarzeń z listą w notatce sesji.
- [x] **Trasy REST z `requireGm`/`gmOnly`** (`campaigns`, `archive`, `music`, `music-import`,
      `uploads`): kampania z żądania musi należeć do MG. `getActiveCampaign` w trasach zastąpione
      kampanią zalogowanego MG.
- [x] **Rozgłoszenia tylko do swoich:** pętle po `io.sockets.sockets` (`activateCampaign`,
      `broadcastAiStatus`) i każde `emit` poza pokojem kampanii. Przegląd `grep`.
- [x] **Uploady per kampania** (wariant z decyzji): zapis, odczyt `/uploads/*` tylko dla MG
      i członków kampanii, czyszczenie (`uploads-gc.ts`), biblioteki portretów, żetonów i muzyki.
      Niezalogowany i obcy dostają odmowę także po dokładnym adresie.
- [x] **Imienne linki graczy:** `Invitation` dostaje imię gracza, a po użyciu `usedAt` i `userId`.
      `POST /api/join/:token` bierze imię z linku, nie z formularza, a użyty link odmawia.
      **Link odnowienia** przy istniejącym graczu prowadzi do tego samego konta. Imię jest
      unikalne w kampanii, a konto gracza należy do jednej kampanii.
- [x] **UI MG:** „Nowy gracz” (imię → link do skopiowania), lista linków z imionami i stanem
      (czeka, użyty, wygasły, unieważniony), „Link odnowienia” przy graczu. Ekran wejścia gracza
      pokazuje imię z linku zamiast pola.
- [x] **Kompendium:** podręcznik z `data/private/` wspólny dla wszystkich, a wpisy MG
      (`CompendiumEntry`) tylko w ich kampanii. Sprawdzić i dopisać test.
- [x] **Testy serwera:** macierz „gniazdo MG-B × identyfikatory MG-A” dla **każdego** zdarzenia
      MG, generowana z rejestru zdarzeń (`registry.ts`), żeby nowe zdarzenie bez strażnika
      wywracało test. Do tego trasy REST, uploady, linki (użyty, wygasły, unieważniony, z innej
      kampanii).
- [x] **Suita E2E:** T3a dołącza graczy imiennymi linkami, a T2 (linki, uploady) dostaje poprawione
      oczekiwania.

## Poza zakresem

Aktywna kampania per MG i równoległa gra (44c), AI (44d).

## Kryteria ukończenia

- Macierz serwera: zero zdarzeń MG i tras, które przepuszczają obcy identyfikator.
- Plik z kampanii MG-A nie otwiera się MG-B, graczowi MG-B ani niezalogowanemu.
- Link gracza działa raz. Link odnowienia wpuszcza do tego samego konta. Cudze imię nie wpuści
  nikogo.
- Testy, lint, `tsc` czyste. Pełny `pnpm test:e2e` zielony.
- Oględziny w Firefoksie: wejście gracza z imiennego linku, link odnowienia, lista linków MG.

## Jak wyszło (04.10, siódma sesja z 03.10)

- **Strażnik własności — bez nowego pomocnika.** Przegląd 238 zdarzeń (137 MG, 101 dla każdego
  zalogowanego, bo MG woła też te) pokazał, że po 44a każdy handler szuka obiektu w kampanii
  gniazda (`requireCampaignScene`, `requireCampaignToken`, `loadRunRow` z `campaignId`…), a gniazdo
  MG dostaje tylko własną kampanię. Gwarancją jest więc **macierz**, nie nowa warstwa:
  `campaign-isolation.test.ts` ma wpis dla każdego zdarzenia z `EVENTS` (`foreign` z oczekiwanym
  `*NOT_FOUND` albo `own` z powodem — ta tabela **jest** listą przeglądu), puszcza je z gniazda
  MG-B i gracza B z obiektami kampanii A i pilnuje trzech wyroczni: wiersze A nietknięte (migawka
  całej bazy), gniazda A nic nie słyszą, ack i emisje do B nie niosą id ani kanarka A. Do tego 27
  przypadków „własny obiekt + obcy odnośnik” (figura B z kartą A, handout B dla gracza A…). Próba
  mutacyjna (wyłączony strażnik sceny) wywraca macierz w kilkunastu zdarzeniach.
- **Znalezione i naprawione:** import karty przyjmował `ownerId` dowolnego konta, import sceny —
  właściciela figury spoza kampanii; zrzut kampanii (`exportCampaign`) niósł **wszystkie** relacje
  botów serwera; `getRoster` (adresaci `/w`) brał każdego MG na serwerze, a każde konto z rejestracji
  nazywa się „MG”; eksport karty i sceny (`/api/archive/*/:id`) i trasy muzyki nie sprawdzały
  właściciela kampanii.
- **Kody „nie ma”:** obcy obiekt daje kod obiektu (`TOKEN_NOT_FOUND`, `SCENE_NOT_FOUND`…) — te
  same, co nieistniejący, więc bez zmiany klienta. Wyjątki z własnym kodem stoją w macierzy:
  `NET_NOT_JACKED` (Sieć), `music:control` (`NO_CAMPAIGN`), `cyberware:request` (MG nie prosi).
- **Rozgłoszenia:** `activateCampaign` dalej przechodzi po wszystkich gniazdach (aktywna kampania
  jest globalna do 44c), ale gniazdo bez kampanii przed i po nie dostaje pustego `state:sync`.
  `broadcastAiStatus` zostaje globalny — status gatewaya to nie dane kampanii (przydział AI: 44d).
- **Uploady:** `uploads/campaigns/<id>/<katalog>/`, strażnik po ścieżce w `app.ts` (obcy plik — 404),
  grafika handoutu dla gracza tylko udostępniona (domyka Z7 z T2). Migracja płaskich katalogów
  idzie **przy starcie serwera** (`migrateFlatUploads`, idempotentna), bo pliki trzeba przenieść,
  a SQL tego nie zrobi. Zdarzenia zapisujące obrazek odmawiają adresu innej kampanii
  (`UPLOAD_NOT_FOUND`).
- **Linki:** `POST /api/campaigns/:id/invitations` z imieniem, `…/players/:userId/renewal`,
  410 dla użytego i wygasłego, nowy link odnowienia unieważnia poprzedni czekający.
- **Testy dymne serwera** (63 pliki) wchodzą graczem przez `test-join.ts` (`joinUrl`), suita E2E —
  przez `fixtures/links.ts` (`playerLink`: nowe imię — link nowego gracza, gracz z punktu
  kontrolnego — link odnowienia).
