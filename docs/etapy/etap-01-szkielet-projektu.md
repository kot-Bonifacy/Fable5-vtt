# Etap 01 — Szkielet projektu i środowisko

**Faza:** A — Fundament · **Wymaga etapów:** brak

## Cel sesji

Działające monorepo z klientem, serwerem i pakietem współdzielonym, połączone przez Socket.IO, z toolingiem i repozytorium na GitHubie.

## Zakres

- [x] `git init`, publiczne repo na GitHubie, `.gitignore` (node_modules, `data/private/`, `uploads/`, `.env*`, pliki SQLite)
- [x] Monorepo pnpm workspaces: `packages/client`, `packages/server`, `packages/shared`
- [x] `packages/client`: Vite + React + TypeScript strict, pusty layout aplikacji (górny pasek, obszar mapy, panel boczny — placeholdery)
- [x] `packages/server`: Fastify + Socket.IO + TypeScript, endpoint `GET /health`, obsługa `.env` (port, ścieżki)
- [x] `packages/shared`: pakiet TS z przykładowym typem współdzielonym importowanym przez klienta i serwer
- [x] Klient łączy się z serwerem przez Socket.IO i pokazuje status połączenia (zielona/czerwona kropka)
- [x] ESLint + Prettier wspólne dla workspace'ów; vitest skonfigurowany w `shared` z jednym przykładowym testem
- [x] Skrypty root: `pnpm dev` (klient+serwer równolegle), `pnpm test`, `pnpm build`, `pnpm lint`
- [x] Szkielet katalogów: `ai-gateway/` (pusty z README), `data/public/`, `data/private/` (z `.gitkeep` poza gitignore? — nie: README w `data/` wyjaśnia zasady), `uploads/`
- [x] README projektu (skrót wizji, jak uruchomić) + uzupełnienie sekcji „Komendy" w CLAUDE.md

## Poza zakresem

- Docker (wraca w etapie 27 — dev działa natywnie na Windows)
- Jakakolwiek logika gry, baza danych, autoryzacja

## Kryteria ukończenia

- `pnpm dev` uruchamia klienta i serwer jedną komendą; klient pokazuje „połączono" po starcie serwera i „rozłączono" po jego ubiciu
- `pnpm test` i `pnpm lint` przechodzą czysto
- Repo wypchnięte na GitHub; w repo nie ma nic z `data/private/` ani `uploads/`

## Wskazówki techniczne

- Node LTS + pnpm; na Windows uważaj na skrypty — używaj cross-platformowych (`concurrently`, nie `&&` z bashowym zachowaniem)
- Socket.IO client z auto-reconnect (domyślne) — status połączenia trzymaj w zustand
- `shared` budowany jako czysty ESM TS konsumowany przez oba pakiety (ścieżki przez `tsconfig` references albo bundling po stronie konsumenta — wybierz prostsze i zapisz decyzję w README)
