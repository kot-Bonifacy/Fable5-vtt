# Fable5-vtt — Cyberpunk RED Virtual Tabletop

VTT dla jednej grupy RPG grającej w Cyberpunk RED: mapa z tokenami (Pixi.js), interaktywne karty postaci, kości d10 wg zasad CP RED, boty NPC na lokalnym LLM, polecenia głosowe (STT) i czat głosowy (WebRTC). Interfejs wzorowany na Foundry VTT. Projekt prywatny, realizowany etapami — plan w [`docs/etapy/`](docs/etapy/00-przeglad.md), postęp w [`docs/etapy/POSTEP.md`](docs/etapy/POSTEP.md).

## Struktura

```
packages/client/   # React + TypeScript + Vite + Pixi.js (frontend)
packages/server/   # Fastify + Socket.IO + Prisma (backend, autorytatywny)
packages/shared/   # typy + silnik zasad CP RED (czysta logika, vitest)
ai-gateway/        # Python + FastAPI: LLM, STT, RAG (na PC z GPU)
data/public/       # dane przykładowe wolne od praw autorskich
data/private/      # dane z podręcznika CP RED — gitignore, nigdy w repo
docs/etapy/        # plan projektu (27 etapów)
```

## Wymagania

- Node.js ≥ 22 (LTS) + pnpm (`npm i -g pnpm`)

## Uruchomienie

```bash
pnpm install
cp packages/server/.env.example packages/server/.env   # ustaw GM_PASSWORD i COOKIE_SECRET
pnpm --filter @vtt/server exec prisma migrate dev      # utworzenie/aktualizacja bazy SQLite
pnpm dev        # serwer (http://localhost:3001) + klient (http://localhost:5173)
```

Logowanie: MG loguje się hasłem z `GM_PASSWORD` (konto tworzy się automatycznie przy starcie serwera); gracze wchodzą linkiem zaproszenia generowanym w Panelu MG (`/join/<token>`). Konfiguracja serwera przez zmienne środowiskowe — patrz `packages/server/.env.example`.

Pozostałe komendy:

```bash
pnpm test       # testy (vitest)
pnpm lint       # ESLint
pnpm build      # build produkcyjny wszystkich pakietów
pnpm format     # Prettier
```

## Decyzje techniczne

- **`@vtt/shared` konsumowany jako źródła TS** (`exports` wskazuje na `src/index.ts`): Vite (klient) i tsx (serwer dev) czytają TS bezpośrednio, bez osobnego kroku budowania; build produkcyjny serwera bundluje shared przez tsup. Prostsze niż project references — bez pilnowania kolejności budowania w dev.
- Serwer jest autorytatywny; mechanika CP RED wyłącznie w `packages/shared` jako czyste funkcje z testami. Szczegóły architektury: [`CLAUDE.md`](CLAUDE.md).
- **Prisma 7 + SQLite przez driver adapter `better-sqlite3`**: klient Prisma generowany do `packages/server/src/generated/` (gitignore), konfiguracja CLI w `prisma.config.ts`, migracje w repo (`prisma/migrations/`).
- **Sesje w podpisanym cookie httpOnly** (`@fastify/cookie`), rekordy sesji w bazie; Socket.IO uwierzytelniany tym samym cookie przy handshake'u. W dev klient i serwer są same-origin dzięki proxy Vite (`/api`, `/socket.io`) — bez CORS; prod powtórzy to przez Caddy (etap 27).

## Licencja danych

Repo jest publiczne. Treści podręcznika Cyberpunk RED (© R. Talsorian Games) trzymane są wyłącznie lokalnie w `data/private/` (gitignore) — w repo są tylko schematy i parsery. Zasady: [`data/README.md`](data/README.md).
