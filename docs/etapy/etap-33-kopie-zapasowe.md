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

## Do rozstrzygnięcia z MG przed kodem

1. **Czy czat wchodzi do zrzutu kampanii?** Log rośnie najszybciej ze wszystkiego i jest
   najmniej potrzebny do odtworzenia stanu — ale to on niesie historię sesji.
2. **Ile snapshotów trzymać i jak często?** Propozycja: co godzinę przy uruchomionym serwerze,
   ostatnie 24 plus jeden dzienny z ostatnich 14 dni.
3. **Czy `uploads/` (14 MB) idzie do kopii?** Propozycja: nie do snapshotu (kopiuje się rzadko
   i osobno), tak do zrzutu kampanii jako lista plików w manifeście.
4. **Gdzie ląduje kopia po etapie 28** — na VPS obok bazy, czy ściągana na PC.

## Zakres

- [ ] `scripts/backup.mjs` — snapshot bazy przez `VACUUM INTO` (spójny bez zatrzymywania
      serwera), nazwa z datą, rotacja wg ustawień, katalog poza repo (`data/private/backups/`)
- [ ] Wywołanie snapshotu z serwera na timerze + `backup:now` (GM only) i wiersz w panelu MG
      z listą kopii (nazwa, rozmiar, data) — bez przywracania z UI (patrz „Poza zakresem")
- [ ] `campaign:export` — zrzut kampanii do jednego JSON-a z manifestem (wersja schematu, data,
      liczby wierszy, lista plików `uploads/`)
- [ ] `character:export` / `scene:export` — pojedyncza rzecz do pliku, wzorem Foundry
- [ ] `character:import` / `scene:import` — wczytanie pliku: **nowe id**, świadome przypisanie
      właściciela i kampanii, odmowa przy niezgodnej wersji schematu
- [ ] `scripts/restore.mjs` — przywrócenie snapshotu przy **zatrzymanym** serwerze, z kopią
      bezpieczeństwa stanu sprzed przywrócenia
- [ ] Testy dymne: round-trip postaci (eksport → import → ta sama karta, inne id), rotacja kasuje
      najstarszy plik, import pliku z przyszłą wersją schematu odmawia z czytelnym zdaniem

## Poza zakresem

- **Przywracanie z UI** — przywrócenie kasuje bieżący stan; jeden klik obok „Zapisz" to
  za mała odległość od nieodwracalnej operacji. Robi to skrypt przy wyłączonym serwerze
- **Kopia poza maszynę** (S3, dysk sieciowy, rsync na VPS) — należy do etapu 28
- **Wersjonowanie i różnice między kopiami** — snapshot ma być prosty jak plik
- **Import ze świata Foundry ani z Roll20** — inny model danych, osobna robota

## Kryteria ukończenia

- [ ] Serwer uruchomiony przez dobę zostawia komplet snapshotów zgodny z ustawioną rotacją
- [ ] Zatrzymanie serwera, `restore.mjs` i ponowny start przywracają stan sprzed snapshotu
- [ ] Postać wyeksportowana do pliku wraca importem do tej samej kampanii jako druga karta
      (nowe id, ekwipunek, PD i cyborgizacje bez zmian)
- [ ] Zrzut kampanii otwiera się w edytorze tekstu i niesie manifest, po którym widać, czego
      w nim nie ma (np. czatu, jeśli MG go wyłączył)
- [ ] Nic z `data/private/` ani `uploads/` nie trafia do repo — sprawdzone `git status` przed
      commitem (zasada z `CLAUDE.md`)

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
