# VTT — Cyberpunk RED Virtual Tabletop

VTT dla jednej grupy RPG (Cyberpunk RED): mapa + tokeny, interaktywne karty postaci, kości d10 wg zasad CP RED, boty LLM na lokalnym modelu, polecenia głosowe (STT), czat głosowy (WebRTC). Interfejs wzorowany na Foundry VTT. Właściciel projektu jest MG i zaawansowanym full-stack developerem; gra też solo z botami.

Pełna wizja i decyzje: `docs/etapy/00-przeglad.md`. Źródłowa ankieta: `vtt-ankieta-podsumowanie.md`.

## Jak pracujemy (WAŻNE — przeczytaj na starcie każdej sesji)

1. Projekt jest realizowany w 27 etapach — **jeden etap = jedna sesja pracy**. Opisy etapów: `docs/etapy/etap-NN-*.md`.
2. Na początku sesji przeczytaj `docs/etapy/POSTEP.md` (co ukończone, co w toku) oraz plik bieżącego etapu. Nie zaczynaj etapu, którego zależności nie są ukończone.
3. **Trzymaj się zakresu etapu.** Pomysły spoza zakresu dopisuj do `docs/etapy/POMYSLY.md` zamiast implementować.
4. Etap jest ukończony, gdy spełnione są wszystkie jego **Kryteria ukończenia**. Wtedy zaktualizuj `POSTEP.md` (status, data, odstępstwa od planu) i odhacz checklisty w pliku etapu.
5. Przed zakończeniem sesji: testy przechodzą, aplikacja się uruchamia, zmiany zacommitowane. Jeśli etap nie został dokończony — zapisz w `POSTEP.md` dokładnie, co zostało i od czego zacząć.
6. Jeśli w trakcie etapu okaże się, że plan wymaga korekty (np. podziału etapu na dwa) — zaproponuj zmianę użytkownikowi i po akceptacji zaktualizuj pliki etapów.

## Stack (decyzje ostateczne — nie zmieniaj bez uzgodnienia)

| Warstwa           | Technologia                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| Frontend          | React + TypeScript + Vite; Pixi.js v8 (renderer mapy); zustand (stan)                                     |
| Backend VTT       | Node.js (LTS) + TypeScript, Fastify + Socket.IO                                                           |
| Baza danych       | SQLite + Prisma (migracje w repo)                                                                         |
| Kod współdzielony | `packages/shared` — typy + silnik zasad CP RED (czysta logika, testy vitest)                              |
| AI Gateway        | Python 3.12 + FastAPI w `ai-gateway/` — spina llama-server, faster-whisper i RAG                          |
| LLM               | Qwythos-9B-v2 GGUF Q8_0 przez `llama-server` (llama.cpp), API zgodne z OpenAI, RTX 5070 Ti na lokalnym PC |
| STT               | faster-whisper (medium; fallback: small lub CPU int8, jeśli zabraknie VRAM)                               |
| Głos graczy       | WebRTC mesh P2P, signaling przez Socket.IO, coturn na VPS                                                 |
| Deploy            | Docker Compose na VPS (Ubuntu 24.04, home.pl), Caddy (HTTPS), Tailscale dla kanału VPS↔PC                 |

## Struktura repo

```
packages/client/      # React + Pixi.js
packages/server/      # Fastify + Socket.IO + Prisma
packages/shared/      # typy, silnik kości i zasad CP RED (bez zależności od IO)
ai-gateway/           # Python: LLM, STT, RAG (uruchamiany na PC z GPU)
data/public/          # dane własne / wolne od praw autorskich (w repo)
data/private/         # dane z podręcznika CP RED — GITIGNORE, nigdy w repo
docs/etapy/           # plan projektu: przegląd, etapy, postęp
uploads/              # mapy, tokeny, handouty użytkownika — GITIGNORE
```

## Zasady architektury

- **Serwer jest autorytatywny.** Klient wysyła intencje, serwer waliduje, aktualizuje stan i broadcastuje. Rzuty kości wykonują się WYŁĄCZNIE na serwerze (animacje 3D u klienta tylko wizualizują wynik serwera).
- **Dane niewidoczne dla gracza nie opuszczają serwera.** Ukryte tokeny, warstwa MG, nieodsłonięty fog of war, cudze szepty — filtrowane przed wysyłką, nie ukrywane w CSS.
- **Mechanika CP RED tylko w `packages/shared`** — czyste funkcje, deterministyczny RNG wstrzykiwany z zewnątrz, obowiązkowe testy jednostkowe. Serwer i boty wywołują ten sam kod.
- **Separacja rdzeń/system:** rdzeń VTT (mapa, tokeny, czat, sceny) nie importuje niczego z modułów CP RED (`shared/systems/cpred`). W przyszłości dojdą inne systemy RPG.
- **Boty degradują się łagodnie:** AI Gateway offline ⇒ boty oznaczone jako niedostępne, cała reszta VTT działa normalnie. Każda funkcja AI musi mieć ścieżkę degradacji.
- **Skala: jedna aktywna sesja, kilku graczy.** Nie optymalizuj pod multi-tenant ani tysiące użytkowników — prostota > skalowalność.

## Licencja i dane (KRYTYCZNE)

Repozytorium GitHub jest **publiczne**, a treści podręcznika Cyberpunk RED są objęte prawem autorskim (użytek wyłącznie prywatny):

- Wypełnione dane z podręcznika trzymamy tylko w `data/private/` (gitignore). W repo mogą być **schematy i parsery**, nigdy treść.
- Przed każdym commitem dotykającym danych sprawdź, czy nic z `data/private/` ani `uploads/` nie trafia do stage'a.
- Przykładowe dane do testów w `data/public/` — wymyślone lub własnego autorstwa.

## Język i konwencje

- Rozmowa z użytkownikiem, dokumentacja projektu i UI: **polski** (z poprawnymi znakami diakrytycznymi). Kod, identyfikatory, commity: **angielski**.
- Boty mówią naturalną polszczyzną — to wymóg produktu, testuj jakość językową promptów.
- TypeScript `strict`; ESLint + Prettier; conventional commits.
- Zdarzenia Socket.IO: `domena:czynnosc` (np. `token:move`, `chat:message`, `dice:roll`).
- Testy: obowiązkowe dla silnika zasad w `shared`; API serwera — testy dymne kluczowych ścieżek; UI — bez wymogu, chyba że etap stanowi inaczej.

## Komendy

```
pnpm install    # instalacja zależności (pnpm workspaces)
pnpm dev        # klient (localhost:5173) + serwer (localhost:3001) równolegle
pnpm test       # testy wszystkich pakietów (vitest)
pnpm lint       # ESLint (flat config w korzeniu repo)
pnpm build      # build produkcyjny (client: vite, server: tsup, shared: tsc --noEmit)
pnpm format     # Prettier
```

Uwaga: `@vtt/shared` jest konsumowany jako źródła TS (bez kroku build w dev) — patrz „Decyzje techniczne" w README.

## Środowisko

- Dev: Windows 11, ten sam komputer hostuje llama-server i faster-whisper (RTX 5070 Ti, 16 GB VRAM). Wszystko na localhost.
- Prod (etap 27): VPS home.pl (8 GB RAM / 4 vCPU / Ubuntu 24.04), domena `vtt.tatanga.eu` (tymczasowo `http://217.154.210.181:8088`), kanał VPS↔PC przez Tailscale.
- Budżet VRAM jest ciasny (model Q8_0 ~9,5 GB + KV cache + whisper). Jeśli coś się nie mieści — patrz sekcja „Ryzyka" w `docs/etapy/00-przeglad.md`.
