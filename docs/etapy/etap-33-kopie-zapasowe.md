# Etap 33 — Kopie zapasowe, eksport i import

**Faza:** I — Wykończenie · **Wymaga etapów:** 02 (baza), 04 (sceny), 07 (karta postaci)
· **Przed:** 28 (wdrożenie na VPS)

> **Pochodzenie:** przegląd z 02.09.2026 „czego brakuje względem innych VTT". Foundry eksportuje
> świat, aktora i scenę do JSON, Roll20 trzyma vault. To jedyna pozycja z tamtej listy, której
> brak może kosztować pracę **nie do odtworzenia**.

## Cel sesji

`CLAUDE.md` mówi „Backup = kopia pliku wg harmonogramu", ale harmonogramu nie ma nigdzie w repo:
`scripts/` trzyma dwa generatory testowe, a jedyna kopia, jaka do dziś powstała
(`data/private/backups/characters-2026-09-02.json`), została zrobiona ręcznie w trakcie sesji,
bo akurat było trzeba. Cała kampania — sześć tygodni pracy — siedzi w jednym pliku
`packages/server/dev.db` (1 MB) plus 14 MB w `uploads/`.

Etap dokłada trzy rzeczy: **automatyczny snapshot z rotacją**, **eksport i import pojedynczych
rzeczy** (postać, scena, tabela, kompendium) oraz **zrzut całej kampanii do jednego pliku**.
Przed etapem 28, bo VPS mnoży egzemplarze stanu przez dwa i pytanie „która kopia jest prawdziwa"
robi się wtedy realne.

## Rozstrzygnięte z MG (05.09.2026)

1. **Czat wchodzi do zrzutu, ale przełącznikiem** — domyślnie tak, MG może go odkliknąć,
   a manifest wtedy o tym mówi. Zmierzone przed decyzją: czat to **411 KB z 502 KB** całego
   tekstu w bazie (82 %), a gotowy zrzut waży **659 KB z czatem i 60 KB bez**.
2. **Kopia przy starcie serwera i co godzinę; zostaje 24 ostatnich i 14 dób wstecz.** Kopia
   startowa jest tą, po którą sięga się najczęściej — łapie stan sprzed sesji, czyli to samo,
   co przez dwa miesiące robiła ręka (`dev.db.bak-*`).
3. **`uploads/` idą do KAŻDEJ kopii** (decyzja MG: „każda kopia samowystarczalna"). Zrobione
   **twardym dowiązaniem**, nie kopiowaniem: katalog kopii ma komplet plików, a 14 MB grafik
   nie mnoży się przez trzydzieści osiem. Bezpieczne wyłącznie dlatego, że plik w `uploads/`
   jest niezmienny — trasy `/api/uploads/*` zapisują go raz pod losową nazwą.
4. **Gdzie kopia ląduje po etapie 28 — odłożone do etapu 28.** Dziś katalog lokalny
   (`BACKUP_DIR`), więc przeniesienie na VPS jest zmianą jednej zmiennej środowiskowej.

## Zakres

- [x] `packages/server/scripts/snapshot.ts` — snapshot bazy przez `VACUUM INTO` (spójny bez
      zatrzymywania serwera), nazwa z datą, rotacja wg ustawień, katalog poza repo
      (`data/private/backups/`). **Nie `scripts/backup.mjs`** — patrz „Odstępstwa" niżej
- [x] Wywołanie snapshotu z serwera na timerze (start + co godzinę) + `archive:snapshot`
      (GM only) i zakładka MG „Kopie" z listą kopii (nazwa, chwila, rozmiar, liczba plików)
      — bez przywracania z UI
- [x] `GET /api/archive/campaign?chat=0|1` — zrzut kampanii do jednego JSON-a z manifestem
      (wersja schematu, data, liczby wierszy, lista plików `uploads/`, zdania „czego tu nie ma")
- [x] `GET /api/archive/character/:id` i `GET /api/archive/scene/:id` — pojedyncza rzecz do pliku
- [x] `archive:character` / `archive:scene` — wczytanie pliku: **nowe id**, świadome przypisanie
      właściciela i kampanii, odmowa przy niezgodnej wersji schematu
- [x] `packages/server/scripts/restore.ts` — przywrócenie snapshotu przy **zatrzymanym** serwerze
      (odmowa przez próbę wyłącznej blokady SQLite), z kopią bezpieczeństwa stanu sprzed
      przywrócenia pod nazwą, której rotacja nie rozpoznaje
- [x] Testy: 25 w `shared` (odmowy, nazwa kopii, plan rotacji), 14 dymnych na dysku
      (`snapshots.test.ts`), 16 na szwie (`archive.test.ts`)

## Poza zakresem

- **Przywracanie z UI** — przywrócenie kasuje bieżący stan; jeden klik obok „Zapisz" to
  za mała odległość od nieodwracalnej operacji. Robi to skrypt przy wyłączonym serwerze
- **Kopia poza maszynę** (S3, dysk sieciowy, rsync na VPS) — należy do etapu 28
- **Wersjonowanie i różnice między kopiami** — snapshot ma być prosty jak plik
- **Import ze świata Foundry ani z Roll20** — inny model danych, osobna robota

## Kryteria ukończenia

- [x] Serwer zostawia komplet snapshotów zgodny z ustawioną rotacją — sprawdzone testem
      (`rotateSnapshots` kasuje najstarszą, kopia przemianowana ręką przeżywa każdą rotację)
      i na żywo: trzy starty serwera = trzy kopie w `data/private/backups/`
- [x] Zatrzymanie serwera, `restore` i ponowny start przywracają stan sprzed snapshotu —
      odklikane na Poligonie w obie strony (9 kart → 10 → 9)
- [x] Postać wyeksportowana do pliku wraca importem do tej samej kampanii jako druga karta
      (nowe id, ekwipunek, PD i cyborgizacje bez zmian). **Round-trip nie jest bajt w bajt
      i to jest zamierzone** — patrz „Odstępstwa"
- [x] Zrzut kampanii otwiera się w edytorze tekstu (wcięcie dwóch spacji, kolumny JSON-owe jako
      prawdziwy JSON) i niesie manifest z listą zdań „czego tu nie ma"
- [x] Nic z `data/private/` ani `uploads/` nie trafia do repo — `git status` przed commitem
      pokazuje wyłącznie pliki kodu i dokumentacji

## Odstępstwa od planu (05.09.2026)

- **Nazwa: `archive`, nie `backup`.** `realtime/backup.ts` na serwerze i `BackupPanel.tsx`
  u klienta to od etapu 30c Zdolność Roli **Wsparcie** (ang. _Backup_). Stąd `snapshot:*`
  w kodzie snapshotów i `archive:*` w plikach wymiany.
- **Skrypty w `packages/server/scripts/` jako TypeScript, nie `scripts/*.mjs` w korzeniu.**
  Muszą czytać `loadConfig` i `@vtt/shared` — oba w TS, oba uruchamiane przez `tsx`, który stoi
  w zależnościach serwera.
- **Eksport jest trasą REST, nie zdarzeniem gniazda.** Umowa projektu brzmi „REST wydaje pliki,
  gniazdo zmienia stan stołu"; dochodzi twardy powód: zrzut z czatem to dziś 659 KB, a Socket.IO
  ma domyślny limit wiadomości 1 MB. Import został zdarzeniem — bo zmienia stan.
- **Eksport wypisuje wiersze z wypisanymi kolumnami, nie widoki.** Opis etapu proponował widoki;
  widok jest jednak tym, co wolno pokazać komuś przy stole (`toTokenView` podmienia nazwę figury
  na `publicName`), a kopia gubiąca prawdziwą nazwę żetonu nie jest kopią.
- **Round-trip karty nie jest bajt w bajt.** Eksport daje surową kolumnę `data` (prawda o bazie),
  import przepuszcza ją przez `parseCharacterData` (karta ma się dać otworzyć), więc karta
  zapisana przed etapem 30b wraca z dopisanymi domyślnymi polami. Nic nie ginie.

## Wskazówki techniczne

- **`VACUUM INTO` zamiast kopiowania pliku** — SQLite w trybie WAL trzyma część stanu poza
  `.db`, więc `cp dev.db` w trakcie zapisu potrafi dać kopię niespójną.
- **Eksport idzie przez widoki, nie przez wiersze Prismy.** `toCharacterView`, `toSceneView`
  i reszta rodziny to jedyne miejsce, które wie, co znaczy `data: String` w bazie — plik zapisany
  wprost z wiersza zamarzłby na kształcie tabeli, nie na kształcie karty.
- **Wersja schematu w manifeście jest obowiązkowa.** `CpredCharacterData` ma już wersjonowanie
  (uwaga „Version 2 (stage 15)" w `shared/src/systems/cpred/character.ts`) — import musi
  odmówić, gdy zobaczy plik nowszy, niż potrafi przeczytać.
- **Import nigdy nie odtwarza cudzych id.** Postać z pliku dostaje nowe `cuid`, a `ownerId`
  ustawia się świadomie: id użytkownika z innej instalacji nie znaczy tu nic.
