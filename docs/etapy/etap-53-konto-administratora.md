# Etap 53 — Konto administratora

**Faza:** przed betą (zlecenie MG z 17.10 spoza planu, przed refaktoryzacją) · **Wymaga etapów:**
44a–44d (konta MG, izolacja, sesje i sloty, AI właściciela)

## Skąd ten etap

MG (17.10): „utwórz oddzielne główne konto administratora o nazwie pantosz, z którego można
zarządzać sesjami, ich historią, nadawać uprawnienia do AI, zmieniać hasła różnym MG itp. Niech ma
hasło tymczasowe, ale żeby mógł je zmienić”.

**Stan wyjściowy (z kodu):** zarządzanie siedziało na koncie MG właściciela z `.env` (flaga
`owner`): panel „Konta MG” (lista, link resetu, blokada) i „AI właściciela” w Panelu MG, znaczek
„AI” w górnym pasku, kopie całej bazy w zakładce „Kopie”. Hasło tego konta bierze się z `.env`
i w UI się nie zmienia. **Historii sesji nie było wcale** — kampania pamiętała tylko
`sessionStartedAt` i `lastSessionEndedAt`.

## Decyzje MG z 17.10 (pytania zadane MG)

1. **Czyste konto administratora** — nowa rola `ADMIN`: nie prowadzi kampanii, nie siada przy
   stole, po zalogowaniu widzi tylko panel administratora.
2. **Zarządza tylko administrator.** Panel kont, kopie całej bazy i decyzje o AI przechodzą na
   `pantosz`. Konto MG z `.env` zostaje kontem do gry: jego kampanie dalej mają AI zawsze i bez
   prośby, hasło dalej z `.env`.
3. **Hasła MG: hasło tymczasowe.** Administrator wpisuje hasło, MG musi je zmienić przy
   pierwszym wejściu, wszystkie sesje MG są wylogowane. Link resetu (44a) zostaje jako druga droga.
4. **Historia = dziennik sesji:** kampania, MG, start, koniec, czas, powód końca, gracze, którzy
   byli przy stole. Zapis od wdrożenia (starszych sesji nie ma skąd odtworzyć).
5. **Hasło tymczasowe administratora — wymuszona zmiana** przy pierwszym wejściu.
6. **Dodatki z „itp.”:** „Zakończ sesję” na siłę, usuwanie kont MG, przełącznik rejestracji
   w panelu. (Zakładanie kont MG przez administratora — **nie**.)
7. **Hasło startowe w `.env`, tylko na start:** `VTT_ADMIN_LOGIN` + `VTT_ADMIN_PASSWORD`; serwer
   zakłada konto, gdy go nie ma, i nigdy więcej nie nadpisuje hasła. Repo jest publiczne — hasło
   nie trafia do kodu ani do commita.

## Zakres

- [x] **Rola `ADMIN`** (`shared/auth.ts`), `SessionUser.mustChangePassword`; konto z flagą
      `owner` (obecność właściciela dla „Udostępniam AI”).
- [x] **Schemat i migracja** `20261017120000_admin_account`: `User.mustChangePassword`,
      `GameSession` + `GameSessionPlayer` (dziennik, nazwy kopiowane — wpis przeżywa usunięcie
      kampanii i konta), `ServerSetting` (przełączniki panelu).
- [x] **`ensureAdminUser`** (`auth/seed.ts`): zakłada konto z hasłem tymczasowym; login zajęty
      przez MG albo gracza zostaje nietknięty; awaryjne `VTT_ADMIN_RESET_PASSWORD=1`.
- [x] **Hasło tymczasowe:** zaczep `onRequest` w `app.ts` odpowiada `PASSWORD_CHANGE_REQUIRED`
      na wszystko poza `TEMPORARY_PASSWORD_ROUTES`, gniazdo odbija się w `io.use`; zmiana hasła
      zdejmuje flagę (`PASSWORD_UNCHANGED`, gdy nowe = stare). Klient: `SetPasswordPage`.
- [x] **Trasy `/api/admin/…`** (`routes/admin.ts`, zastąpiły `routes/owner.ts`): konta (lista,
      link resetu, hasło tymczasowe, blokada, usunięcie z potwierdzeniem loginem), sesje (trwające
      z graczami przy stole, „Zakończ” z powodem `admin`, dziennik), ustawienia (rejestracja),
      kopie całej bazy (lista, „Zrób kopię teraz” — zdarzenia `archive:list`/`archive:snapshot`
      usunięte). AI: `/api/admin/ai…` (`routes/ai-access.ts`), zgoda także bez prośby (`none`).
- [x] **Gniazdo administratora** nie siada przy stole: pokój `admin`, sygnał `admin:changed`,
      `ai-access:owner` tylko do administratora, `ai:status` z diagnostyką gatewaya.
- [x] **Dziennik sesji** (`session-log.ts`): start w `startSession`, koniec w `endSession`
      (z wpisem dla sesji bez otwarcia), gracze przy posadzeniu w `seatSocket`.
- [x] **Klient:** `AdminPage` (Sesje, Konta MG, AI właściciela, Serwer, Kopie, Twoje konto),
      routing w `App.tsx`; z Panelu MG, górnego paska i zakładki „Kopie” zniknęły panel kont,
      znaczek „AI” i kopie całej bazy.
- [x] **Testy:** serwer `admin.test.ts` (10) i przepięte `gm-accounts`, `ai-access`, `archive`,
      `campaign-isolation`; klient `admin-format.test.ts`; E2E — nowy `01-dym/t53-admin`,
      fikstury `cast.admin()` i `adminApi()`, przepięte `t2d`, `t9a-konta`, `t9a-izolacja`,
      `t9b`, `t44d`, `t6b` 6.9a, `t7b`.

## Ustalenia z realizacji (17.10)

- **Konto `pantosz` w `dev.db`** powstało przy pierwszym starcie z `.env` z hasłem tymczasowym
  — oględzin nim nie robiono, żeby nie zużyć hasła tymczasowego MG. Oględziny panelu na
  instancji E2E kontem `admin-e2e` (pułapka w `ogledziny`).
- **Konto gracza połączone z właścicielem** („To konto właściciela”, 44d) zostało — daje już
  tylko obecność właściciela, panelu AI nie.
- **Usunięcie konta MG** kończy najpierw trwającą sesję zwykłą drogą (powód `deleted`), potem
  kasuje kampanie (kaskada), konta graczy należących wyłącznie do nich, sesje logowania
  i katalogi `uploads/campaigns/<id>`. Dziennik sesji zostaje z nazwami.
- **Instancja E2E** zakłada `admin-e2e` z hasłem tymczasowym z `E2E_ADMIN_TEMP_PASSWORD`
  i każdy start cofa je flagą `VTT_ADMIN_RESET_PASSWORD=1` — punkt kontrolny z innego przebiegu
  niósłby konto z nieznanym hasłem.
- **Zapomniane hasło administratora:** `VTT_ADMIN_RESET_PASSWORD=1` na jeden start (hasło wraca
  do `VTT_ADMIN_PASSWORD`, znów tymczasowe), potem zdjąć flagę.

## Poza zakresem

Zakładanie kont MG przez administratora (decyzja MG 17.10), wgląd w czat i rzuty sesji z dziennika,
druga rola administratora, 2FA, e-mail.

## Kryteria ukończenia

- [x] `pantosz` loguje się hasłem tymczasowym i musi ustawić własne, zanim zobaczy panel.
- [x] Administrator ustawia MG hasło tymczasowe, MG musi je zmienić przy wejściu.
- [x] Panel pokazuje trwające sesje z graczami przy stole, kończy sesję i prowadzi dziennik.
- [x] Zgoda na AI z panelu (także bez prośby), „Udostępniam AI”, „Przejmij AI”.
- [x] Konto MG właściciela nie ma już panelu kont, znaczka „AI” ani kopii całej bazy.
- [x] Testy jednostkowe zielone, `tsc` i ESLint czyste, oględziny w Firefoksie.
