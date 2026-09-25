# VTT — Cyberpunk RED Virtual Tabletop

VTT dla jednej grupy RPG (Cyberpunk RED): mapa + tokeny, interaktywne karty postaci, kości d10 wg zasad CP RED, boty LLM na lokalnym modelu (rozmawiające po polsku, wyłącznie tekstem). Interfejs wzorowany na Foundry VTT. Właściciel projektu jest MG i zaawansowanym full-stack developerem; gra też solo z botami.

**Głos jest poza zakresem projektu (decyzja z 09.08.2026).** Ani mowa botów (TTS), ani polecenia głosowe (STT), ani czat głosowy graczy (WebRTC) — cała faza G została wycofana, a kod TTS z etapu 12 usunięty. Rozmowa z botami odbywa się na czacie; głos przy stole załatwia osobne narzędzie (Discord itp.). Nie proponuj wracania do żadnej z tych funkcji.

Pełna wizja i decyzje: `docs/etapy/00-przeglad.md`. Źródłowa ankieta: `vtt-ankieta-podsumowanie.md`.

## Jak pracujemy (WAŻNE — przeczytaj na starcie każdej sesji)

1. Projekt jest realizowany w 28 etapach — **jeden etap = jedna sesja pracy**. Opisy etapów: `docs/etapy/etap-NN-*.md`.
2. Na początku sesji przeczytaj `docs/etapy/POSTEP.md` (co ukończone, co w toku) oraz plik bieżącego etapu. Nie zaczynaj etapu, którego zależności nie są ukończone.
3. **Trzymaj się zakresu etapu.** Pomysły spoza zakresu dopisuj do `docs/etapy/POMYSLY.md` zamiast implementować.
4. Etap jest ukończony, gdy spełnione są wszystkie jego **Kryteria ukończenia**. Wtedy zaktualizuj `POSTEP.md` (status, data, odstępstwa od planu) i odhacz checklisty w pliku etapu.
5. **`POSTEP.md` musi zostać krótki — czytasz go w całości na starcie każdej sesji (decyzje z 22.08, 10.09 i 18.09.2026).** Trzyma **wyłącznie**: trzy wiersze stanu etapów, „Od czego zacząć" **opisujące stan na dziś, a nie historię etapów**, tabelę obszarów („Zanim dotkniesz obszaru") i **pełne notatki najwyżej dwóch ostatnich sesji**. Wszystko inne mieszka w plikach obok i **czyta się je na żądanie, nigdy rutynowo** — spis plików z „kiedy czytać" stoi na górze `POSTEP.md`. Umowy kodu i pułapki dev są pocięte na sekcje obszarów z własnym indeksem: czytaj **jedną sekcję**, nie plik (`grep -n '^## <obszar>' docs/etapy/umowy-kodu.md docs/etapy/pulapki-dev.md`).

   Kończąc sesję: notatka na górę sekcji notatek, a wyparta z dwójki **w całości i bez zmian** na górę `archiwum/dziennik-sesji.md` (bez skrótu w `POSTEP.md`); nowa zaległość do `zaleglosci.md`; **nowa umowa lub pułapka do sekcji swojego obszaru** (wiersz na górę indeksu, pełny wpis pod spodem), w `POSTEP.md` najwyżej licznik w tabeli obszarów; nowy etap do `archiwum/tabela-etapow.md`; akapit „Od czego zacząć" o domkniętym etapie — do `archiwum/od-czego-zaczac.md`, gdy przestaje być stanem na dziś.

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
| LLM               | Qwen3.8-27B GGUF UD-Q3_K_XL przez `llama-server` (llama.cpp build 10735), API zgodne z OpenAI, RTX 5070 Ti na lokalnym PC (od 24.09.2026; wcześniej Qwythos-9B-v2 Q8_0) |
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

## Oględziny w przeglądarce — dwa narzędzia, dobieraj do zadania

Masz **dwa** sposoby oglądania VTT i korzystasz z obu, a nie z jednego z przyzwyczajenia (decyzja z 25.09.2026):

| Narzędzie                                                                   | Kiedy                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **claude-in-chrome** (`mcp__claude-in-chrome__*`)                           | Prawdziwy Chrome MG z jego profilem i rozszerzeniami, praca na tym, co MG ma właśnie otwarte, nagrania GIF, szybki rzut oka na żywy stół.                                                                                                                                                                                                                                             |
| **Playwright MCP** (`mcp__playwright-firefox__*`, `mcp__playwright-chromium__*`) | **Firefox** — wszystko, co ma działać u graczy spoza Chrome (CSS, `@container`, WebGL Pixi, kości 3D, pełny ekran). **Czysty Chromium** — powtarzalne oględziny bez profilu MG, karta zawsze na wierzchu (brak dławienia timerów z „Pułapek dev”), gracz obok MG w **innym silniku** niż Chrome MG. Klikanie po płótnie mapy: `browser_mouse_*_xy`. |
| **Biblioteka `playwright`** (skrypt `node` w scratchpadzie)                  | Scenariusze wielu sesji naraz (osobne `browser.newContext()` = osobne ciasteczka, np. MG + dwóch graczy w jednym przebiegu), pomiary w pętli, porównanie Firefox ↔ Chromium tym samym skryptem. Import przez `createRequire('C:/AI/web/VTT/package.json')`.                                                                                                                                    |

- **Oględziny zmiany UI domyka co najmniej jedna przeglądarka inna niż Chrome MG** (Firefox z Playwright), chyba że zmiana nie dotyka wyglądu ani zachowania przeglądarki. W notatce sesji pisz, w czym oglądano.
- **Hasło MG:** wpisz w pole hasła dosłownie `VTT_GM_PASSWORD` (`browser_type`). Serwer MCP podstawi wartość z `.playwright-mcp/secrets.env` (gitignore; wypełnia MG) i wytnie ją z odpowiedzi. Nie proś MG o hasło na czacie i nie czytaj tego pliku. Pusty plik = MG loguje się ręką w oknie Playwrighta; ciasteczko zostaje w profilu `.playwright-mcp/profile-*`.
- Karty jednego serwera Playwright MCP dzielą ciasteczka, więc sztuczka `localhost` / `[::1]` z „Pułapek dev” dalej obowiązuje. Prościej: MG w jednym narzędziu, gracz w drugim.
- Wersja `playwright` w `package.json` jest **przypięta do tej, której używa `@playwright/mcp`** (jeden komplet przeglądarek w `%LOCALAPPDATA%\ms-playwright`). Aktualizujesz jedną, aktualizujesz obie, potem `pnpm exec playwright install firefox chromium`.
- Pułapki obu narzędzi: sekcja `ogledziny` w `docs/etapy/pulapki-dev.md`.

Uwaga: `@vtt/shared` jest konsumowany jako źródła TS (bez kroku build w dev) — patrz „Decyzje techniczne" w README.

## Środowisko

- Dev: Windows 11, ten sam komputer hostuje llama-server (RTX 5070 Ti, 16 GB VRAM). Wszystko na localhost.
- Prod (etap 28): VPS home.pl (8 GB RAM / 4 vCPU / Ubuntu 24.04), domena `vtt.tatanga.eu` (tymczasowo `http://217.154.210.181:8088`), kanał VPS↔PC przez Tailscale.
- **Budżet VRAM jest ciasny (od 24.09.2026):** Qwen3.8-27B UD-Q3_K_XL (13,1 GB) z KV cache 32k zajmuje kartę do ~15,5 / 16,3 GB, a embeddingi RAG liczą się na CPU. Na GPU nie dokładamy nic. Przed dołożeniem czegokolwiek na GPU sprawdź bilans w „Ryzyka" w `docs/etapy/00-przeglad.md` i pomiary w `ai-gateway/README.md`.
