# Etap 44a — Konta MG: rejestracja, logowanie, właściciel

**Faza:** przed betą · **Wymaga etapów:** — · Decyzje i kontekst: `etap-44-konta-mg.md`

## Decyzje MG na starcie sesji (03.10, szósta)

- **Blokada konta MG: „Zablokuj” i „Odblokuj”** w panelu właściciela. Blokada wylogowuje
  wszystkie sesje konta i odmawia logowania (`ACCOUNT_BLOCKED` dopiero po dobrym haśle); kampanie
  zostają w bazie. Konta właściciela nie da się zablokować ani zresetować.
- **Wyłącznik rejestracji `VTT_REGISTRATION=open|closed`, domyślnie `open`.** `closed` chowa
  „Załóż konto MG” (`GET /api/auth/config`) i serwer odmawia `REGISTRATION_CLOSED`.
- **Imię przy stole każdego konta MG z rejestracji to „MG”.** Login służy tylko do wejścia, gracze
  go nie widzą. Bez nowego pola w formularzu.
- **Nowe konto MG zaczyna od pustego stołu z „Nowa kampania”** (nakładka na mapie, ten sam
  formularz co w Panelu MG — `CreateCampaignForm`), nie od kampanii zakładanej automatycznie.

## Zakres

- [x] **Schemat i migracja:** `User.login` (unikalny bez rozróżniania wielkości liter, tylko konta
      MG), `User.owner` (flaga właściciela), `User.name` przestaje być unikalne globalnie
      (unikalność imienia w kampanii pilnuje 44b), `Campaign.gmId` (MG kampanii). Migracja
      `dev.db`: obecne konto MG dostaje `login = GM_NAME`, flagę właściciela i wszystkie istniejące
      kampanie.
- [x] **`ensureGmUser` to konto właściciela z `.env`:** szuka po `GM_NAME`, a nie „pierwszego MG”,
      synchronizuje hasło z `GM_PASSWORD` i ustawia flagę właściciela.
- [x] **Rejestracja `POST /api/auth/register`:** login (3–32 znaki: litery, cyfry, `-_.`), hasło
      (co najmniej 10 znaków, inne niż login), powtórzenie hasła. Zajęty login daje `LOGIN_TAKEN`.
      Osobny limit tempa rejestracji z jednego adresu, np. 5 kont na godzinę. Rejestracja zakłada
      konto MG i od razu loguje.
- [x] **Logowanie `POST /api/auth/login` loginem i hasłem.** Zły login i złe hasło dają ten sam
      komunikat; limit prób bez zmian (#12).
- [x] **Ekran logowania:** pole loginu, odnośnik „Załóż konto MG”, formularz rejestracji z polskimi
      komunikatami walidacji. Wejście gracza z linku w 44a się nie zmienia.
- [x] **Zmiana hasła MG** w ustawieniach (stare hasło + nowe dwa razy). Po zmianie inne sesje
      tego konta są wylogowane (`endSessionSockets`).
- [x] **Panel właściciela** (okno tylko dla kont z flagą): lista kont MG (login, data założenia,
      liczba kampanii, ostatnie wejście) i „Zresetuj hasło”. Reset daje jednorazowy link
      `/reset/:token` ważny 24 h, a pod nim ekran ustawienia nowego hasła. `SessionUser` niesie
      `owner`.
- [x] **Własność kampanii:** `POST /api/campaigns` ustawia `gmId`, a `GET /api/campaigns`
      i przełącznik kampanii pokazują tylko kampanie zalogowanego MG. Aktywacja cudzej kampanii to
      odmowa. Aktywna kampania per MG to dopiero 44c.
- [x] **Kopie całej bazy tylko dla właściciela:** `archive:list`, `archive:snapshot` i ich UI.
      Eksport własnej kampanii (`/api/archive/campaign`, karta, scena) zostaje dla każdego MG.
- [x] **Suita E2E na nowe logowanie:** `fixtures/actors.ts`, `fixtures/nocna-zmiana.ts`,
      `instance/*`, `00-baseline`, `t2a-http` (logowanie i limit); nowe testy dymne rejestracji.
      Playwright MCP: login MG wpisywany dosłownie, hasło dalej jako `VTT_GM_PASSWORD`; poprawić
      akapit w `CLAUDE.md` i `pulapki-dev.md` (`ogledziny`).
- [x] **Testy serwera:** rejestracja (walidacja, zajęty login, limit), logowanie, zmiana i reset
      hasła (jednorazowość, wygaśnięcie), kopie tylko dla właściciela, migracja.

## Ustalenia z realizacji (03.10)

- **`User.login` trzyma małe litery** — jedna kolumna z unikalnym indeksem zamiast loginu „jak
  wpisany” i osobnego klucza. Panel właściciela pokazuje więc `bartek`, a nie `Bartek`. Konto
  właściciela ma login `mg` (z `GM_NAME=MG`); reguła 3–32 znaków go nie dotyczy, bo bierze się
  z `.env`.
- **`Campaign.gmId` jest opcjonalne w schemacie** — trasa zawsze je ustawia, a migracja dała
  wszystkie istniejące kampanie dotychczasowemu MG. Kampania bez `gmId` (testy zakładające ją
  z pominięciem trasy) należy do każdego MG, jak przed 44a (`campaignRunBy`).
- **Własność kampanii sprawdzają już w 44a** trasy kampanii (`sandbox`, zaproszenia, unieważnienie)
  i `campaign:activate` — cudza kampania jest 404 / `NOT_FOUND`. Reszta 144 zdarzeń i tras REST
  to dalej 44b.
- **Aktywna kampania dalej jest jedna na serwer** (aktywna per MG to 44c), ale MG dostaje ją
  tylko, gdy jest jego (`getUserActiveCampaign`; globalne `getActiveCampaign` usunięte, uploady
  i eksport kampanii biorą kampanię konta). MG, którego kampania nie jest tą jedną, siedzi przy
  pustym stole; aktywacja kampanii przez MG-B zdejmuje stół właścicielowi. **Tylko dev.**
- **Konto systemu to MG kampanii** — linie i mechanika botów, wpisy „Czas” i strefy odpalane
  ruchem gracza szły „pierwszym kontem MG w bazie”; teraz `campaignGmUser(prisma, campaignId)`.
- **Hasło właściciela nie zmienia się w UI** (`PASSWORD_FROM_ENV`) — sekcja „Konto” w ustawieniach
  jest tylko dla zwykłego MG. Zmiana i reset hasła kończą inne sesje konta z powodem `password`,
  blokada — `blocked` (notka na ekranie logowania).
- **Token resetu leży w bazie jako SHA-256**; nowy link unieważnia poprzedni niewykorzystany.

## Poza zakresem

Izolacja zdarzeń i tras (44b), imienne linki graczy (44b), sesje i sloty (44c), AI (44d), e-mail,
OAuth, 2FA.

## Kryteria ukończenia

- Właściciel z `.env` i dwa konta z rejestracji logują się każde swoim loginem. Lista kampanii
  pokazuje każdemu tylko jego kampanie.
- Zwykły MG nie zrobi kopii całości: serwer odmawia, a UI jej nie pokazuje.
- Link resetu działa raz i wygasa po 24 h.
- Po migracji `dev.db` dotychczasowy MG loguje się `GM_NAME` i swoim hasłem i ma wszystkie
  kampanie.
- `pnpm test`, ESLint, Prettier i `tsc --noEmit` czyste. Pełny `pnpm test:e2e` zielony.
- Oględziny w Firefoksie (Playwright MCP): logowanie, rejestracja, zmiana hasła, panel
  właściciela.
