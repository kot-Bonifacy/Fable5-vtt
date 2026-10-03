# Etap 44b — Izolacja kampanii i imienne linki graczy

**Faza:** przed betą · **Wymaga etapów:** 44a · Decyzje i kontekst: `etap-44-konta-mg.md`

## Do decyzji MG na starcie sesji

- **Uploady per kampania.** Propozycja: nowe pliki lądują w `uploads/campaigns/<campaignId>/<rodzaj>/`,
  a `/uploads/*` sprawdza członkostwo po samej ścieżce, bez szukania po bazie. Migracja przenosi
  istniejące pliki i poprawia adresy w bazie. `uploads/art/` (mapa powitalna) zostaje wspólne dla
  zalogowanych. Wariant B: płaskie katalogi i wyszukanie kampanii po adresie w bazie.
- **Stare linki kampanii** (bez imienia) migracja unieważnia. Gracze, którzy już weszli, zostają.

## Zakres

- [ ] **Strażnik własności w jednym miejscu.** Gniazdo MG trafia tylko do kampanii, której jest
      `gmId`. Każde zdarzenie `role: ROLE_GM` działa wyłącznie w kampanii gniazda, a każdy
      identyfikator z ładunku (scena, figura, karta, bot, architektura Sieci, handout, wpis
      dziennika, bazy wiedzy, kompendium MG, tabela losowa, walka…) jest sprawdzany jako należący
      do tej kampanii. Obcy obiekt daje `NOT_FOUND`, nie `FORBIDDEN`, żeby odmowa nie zdradzała, że
      obiekt istnieje. Pomocnik w `realtime/`, a przegląd 144 zdarzeń z listą w notatce sesji.
- [ ] **Trasy REST z `requireGm`/`gmOnly`** (`campaigns`, `archive`, `music`, `music-import`,
      `uploads`): kampania z żądania musi należeć do MG. `getActiveCampaign` w trasach zastąpione
      kampanią zalogowanego MG.
- [ ] **Rozgłoszenia tylko do swoich:** pętle po `io.sockets.sockets` (`activateCampaign`,
      `broadcastAiStatus`) i każde `emit` poza pokojem kampanii. Przegląd `grep`.
- [ ] **Uploady per kampania** (wariant z decyzji): zapis, odczyt `/uploads/*` tylko dla MG
      i członków kampanii, czyszczenie (`uploads-gc.ts`), biblioteki portretów, żetonów i muzyki.
      Niezalogowany i obcy dostają odmowę także po dokładnym adresie.
- [ ] **Imienne linki graczy:** `Invitation` dostaje imię gracza, a po użyciu `usedAt` i `userId`.
      `POST /api/join/:token` bierze imię z linku, nie z formularza, a użyty link odmawia.
      **Link odnowienia** przy istniejącym graczu prowadzi do tego samego konta. Imię jest
      unikalne w kampanii, a konto gracza należy do jednej kampanii.
- [ ] **UI MG:** „Nowy gracz” (imię → link do skopiowania), lista linków z imionami i stanem
      (czeka, użyty, wygasły, unieważniony), „Link odnowienia” przy graczu. Ekran wejścia gracza
      pokazuje imię z linku zamiast pola.
- [ ] **Kompendium:** podręcznik z `data/private/` wspólny dla wszystkich, a wpisy MG
      (`CompendiumEntry`) tylko w ich kampanii. Sprawdzić i dopisać test.
- [ ] **Testy serwera:** macierz „gniazdo MG-B × identyfikatory MG-A” dla **każdego** zdarzenia
      MG, generowana z rejestru zdarzeń (`registry.ts`), żeby nowe zdarzenie bez strażnika
      wywracało test. Do tego trasy REST, uploady, linki (użyty, wygasły, unieważniony, z innej
      kampanii).
- [ ] **Suita E2E:** T3a dołącza graczy imiennymi linkami, a T2 (linki, uploady) dostaje poprawione
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
