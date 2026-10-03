# Etap 44a — Konta MG: rejestracja, logowanie, właściciel

**Faza:** przed betą · **Wymaga etapów:** — · Decyzje i kontekst: `etap-44-konta-mg.md`

## Do decyzji MG na starcie sesji

- **Blokada konta MG przez właściciela** przy otwartej rejestracji na publicznym VPS. Propozycja:
  „Zablokuj” w panelu właściciela, które wylogowuje konto i odmawia logowania. Kampanie zostają
  w bazie.
- **Wyłącznik rejestracji w env** (`VTT_REGISTRATION=open|closed`, domyślnie `open`) na wypadek
  zalewu kont.

## Zakres

- [ ] **Schemat i migracja:** `User.login` (unikalny bez rozróżniania wielkości liter, tylko konta
      MG), `User.owner` (flaga właściciela), `User.name` przestaje być unikalne globalnie
      (unikalność imienia w kampanii pilnuje 44b), `Campaign.gmId` (MG kampanii). Migracja
      `dev.db`: obecne konto MG dostaje `login = GM_NAME`, flagę właściciela i wszystkie istniejące
      kampanie.
- [ ] **`ensureGmUser` to konto właściciela z `.env`:** szuka po `GM_NAME`, a nie „pierwszego MG”,
      synchronizuje hasło z `GM_PASSWORD` i ustawia flagę właściciela.
- [ ] **Rejestracja `POST /api/auth/register`:** login (3–32 znaki: litery, cyfry, `-_.`), hasło
      (co najmniej 10 znaków, inne niż login), powtórzenie hasła. Zajęty login daje `LOGIN_TAKEN`.
      Osobny limit tempa rejestracji z jednego adresu, np. 5 kont na godzinę. Rejestracja zakłada
      konto MG i od razu loguje.
- [ ] **Logowanie `POST /api/auth/login` loginem i hasłem.** Zły login i złe hasło dają ten sam
      komunikat; limit prób bez zmian (#12).
- [ ] **Ekran logowania:** pole loginu, odnośnik „Załóż konto MG”, formularz rejestracji z polskimi
      komunikatami walidacji. Wejście gracza z linku w 44a się nie zmienia.
- [ ] **Zmiana hasła MG** w ustawieniach (stare hasło + nowe dwa razy). Po zmianie inne sesje
      tego konta są wylogowane (`endSessionSockets`).
- [ ] **Panel właściciela** (okno tylko dla kont z flagą): lista kont MG (login, data założenia,
      liczba kampanii, ostatnie wejście) i „Zresetuj hasło”. Reset daje jednorazowy link
      `/reset/:token` ważny 24 h, a pod nim ekran ustawienia nowego hasła. `SessionUser` niesie
      `owner`.
- [ ] **Własność kampanii:** `POST /api/campaigns` ustawia `gmId`, a `GET /api/campaigns`
      i przełącznik kampanii pokazują tylko kampanie zalogowanego MG. Aktywacja cudzej kampanii to
      odmowa. Aktywna kampania per MG to dopiero 44c.
- [ ] **Kopie całej bazy tylko dla właściciela:** `archive:list`, `archive:snapshot` i ich UI.
      Eksport własnej kampanii (`/api/archive/campaign`, karta, scena) zostaje dla każdego MG.
- [ ] **Suita E2E na nowe logowanie:** `fixtures/actors.ts`, `fixtures/nocna-zmiana.ts`,
      `instance/*`, `00-baseline`, `t2a-http` (logowanie i limit); nowe testy dymne rejestracji.
      Playwright MCP: login MG wpisywany dosłownie, hasło dalej jako `VTT_GM_PASSWORD`; poprawić
      akapit w `CLAUDE.md` i `pulapki-dev.md` (`ogledziny`).
- [ ] **Testy serwera:** rejestracja (walidacja, zajęty login, limit), logowanie, zmiana i reset
      hasła (jednorazowość, wygaśnięcie), kopie tylko dla właściciela, migracja.

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
