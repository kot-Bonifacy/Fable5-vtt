# VTT — Cyberpunk RED Virtual Tabletop

VTT dla jednej grupy RPG (Cyberpunk RED): mapa + tokeny, interaktywne karty postaci, kości d10 wg zasad CP RED, boty LLM na lokalnym modelu (rozmawiające po polsku, wyłącznie tekstem). Interfejs wzorowany na Foundry VTT. Właściciel projektu jest MG i zaawansowanym full-stack developerem; gra też solo z botami.

**Głos jest poza zakresem projektu (decyzja z 09.08.2026).** Ani mowa botów (TTS), ani polecenia głosowe (STT), ani czat głosowy graczy (WebRTC) — cała faza G została wycofana, a kod TTS z etapu 12 usunięty. Rozmowa z botami odbywa się na czacie; głos przy stole załatwia osobne narzędzie (Discord itp.). Nie proponuj wracania do żadnej z tych funkcji.

Pełna wizja i decyzje: `docs/etapy/00-przeglad.md`. Źródłowa ankieta: `vtt-ankieta-podsumowanie.md`.

## Jak pracujemy (WAŻNE — przeczytaj na starcie każdej sesji)

1. Projekt jest realizowany w 28 etapach — **jeden etap = jedna sesja pracy**. Opisy etapów: `docs/etapy/etap-NN-*.md`.
2. Na początku sesji przeczytaj `docs/etapy/POSTEP.md` (co ukończone, co w toku) oraz plik bieżącego etapu. Nie zaczynaj etapu, którego zależności nie są ukończone.
3. **Trzymaj się zakresu etapu.** Pomysły spoza zakresu dopisuj do `docs/etapy/POMYSLY.md` zamiast implementować.
4. Etap jest ukończony, gdy spełnione są wszystkie jego **Kryteria ukończenia**. Wtedy zaktualizuj `POSTEP.md` (status, data, odstępstwa od planu) i odhacz checklisty w pliku etapu.
5. **`POSTEP.md` musi zostać krótki — czytasz go w całości na starcie każdej sesji (decyzja z 22.08.2026, zastępuje wcześniejszą).** Trzyma **wyłącznie**: tabelę etapów (numer, nazwa, status, data — bez kolumny „Uwagi"), „Od czego zacząć", jednolinijkowe indeksy umów kodu i pułapek dev oraz **pełne notatki najwyżej dwóch ostatnich sesji**. Wszystko inne mieszka w plikach obok i **czyta się je na żądanie, nigdy rutynowo** (spis z „kiedy czytać" jest na górze `POSTEP.md`):
   - `docs/etapy/zaleglosci.md` — otwarte zaległości; `archiwum/zamkniete-zaleglosci.md` — zamknięte,
   - `docs/etapy/umowy-kodu.md` i `docs/etapy/pulapki-dev.md` — pełne wersje wpisów z indeksów,
   - `docs/etapy/poligon.md` — stan sceny testowej,
   - `docs/etapy/archiwum/dziennik-sesji.md` — pełne notatki starszych sesji; `archiwum/uwagi-etapow.md` — jednozdaniowe „co było w etapie N".

   Kończąc sesję: dopisz notatkę na górę sekcji notatek, a notatkę wypartą z dwójki przenieś **w całości i bez zmian** na górę `dziennik-sesji.md` — **bez zostawiania skrótu** w `POSTEP.md`. Nowa zaległość idzie od razu do `zaleglosci.md`, nowa umowa lub pułapka — do swojego pliku plus jeden wiersz indeksu.

6. Przed zakończeniem sesji: testy przechodzą, aplikacja się uruchamia, zmiany zacommitowane. Jeśli etap nie został dokończony — zapisz w `POSTEP.md` dokładnie, co zostało i od czego zacząć.
7. Jeśli w trakcie etapu okaże się, że plan wymaga korekty (np. podziału etapu na dwa) — zaproponuj zmianę użytkownikowi i po akceptacji zaktualizuj pliki etapów.

## Stack (decyzje ostateczne — nie zmieniaj bez uzgodnienia)

| Warstwa           | Technologia                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| Frontend          | React + TypeScript + Vite; Pixi.js v8 (renderer mapy); zustand (stan)                                     |
| Backend VTT       | Node.js (LTS) + TypeScript, Fastify + Socket.IO                                                           |
| Baza danych       | SQLite + Prisma (migracje w repo)                                                                         |
| Kod współdzielony | `packages/shared` — typy + silnik zasad CP RED (czysta logika, testy vitest)                              |
| AI Gateway        | Python 3.12 + FastAPI w `ai-gateway/` — spina llama-server i RAG                                          |
| LLM               | Qwythos-9B-v2 GGUF Q8_0 przez `llama-server` (llama.cpp), API zgodne z OpenAI, RTX 5070 Ti na lokalnym PC |
| Głos              | brak — TTS, STT i WebRTC wycofane 09.08.2026 (patrz akapit nad tabelą)                                    |
| Deploy            | Docker Compose na VPS (Ubuntu 24.04, home.pl), Caddy (HTTPS), Tailscale dla kanału VPS↔PC                 |

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

AI Gateway (osobny proces na PC z GPU, wymaga `uv`):

```
pwsh ai-gateway/scripts/start-gateway.ps1   # gateway (:8100) + llama-server (:8080)
cd ai-gateway && uv run pytest              # testy gatewaya
cd ai-gateway && uv run ruff check .        # lint Pythona
```

Uwaga: `@vtt/shared` jest konsumowany jako źródła TS (bez kroku build w dev) — patrz „Decyzje techniczne" w README.

## Środowisko

- Dev: Windows 11, ten sam komputer hostuje llama-server (RTX 5070 Ti, 16 GB VRAM). Wszystko na localhost.
- Prod (etap 28): VPS home.pl (8 GB RAM / 4 vCPU / Ubuntu 24.04), domena `vtt.tatanga.eu` (tymczasowo `http://217.154.210.181:8088`), kanał VPS↔PC przez Tailscale.
- Po wycofaniu głosu budżet VRAM jest luźny: na karcie stoi wyłącznie model Q8_0 (~9,5 GB) z KV cache, a embeddingi RAG liczą się na CPU. Przed dołożeniem czegokolwiek na GPU sprawdź bilans w „Ryzyka" w `docs/etapy/00-przeglad.md` i pomiary w `ai-gateway/README.md`.
