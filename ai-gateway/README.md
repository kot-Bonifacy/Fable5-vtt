# AI Gateway

Usługa Python 3.12 + FastAPI spinająca lokalne AI dla VTT:

- **LLM** — Qwythos-9B-v2 (GGUF Q8_0) przez `llama-server` (llama.cpp), API zgodne z OpenAI — **działa od etapu 09**,
- **TTS** — głos botów po polsku (opcjonalny, ≤ 3 GB VRAM) — etap 12,
- **STT** — faster-whisper (polecenia głosowe) — etap 21,
- **RAG** — pamięć botów i wiedza z kompendium — etap 19.

Uruchamiana na PC z GPU (RTX 5070 Ti), nie na VPS. Serwer VTT łączy się z nią po HTTP; gdy gateway nie odpowiada, VTT działa normalnie, a funkcje botów są wyszarzone.

## Szybki start

```powershell
# jednorazowo: uv (menedżer środowiska i zależności Pythona)
winget install astral-sh.uv

cp ai-gateway/.env.example ai-gateway/.env   # i popraw ścieżki do llama-server oraz modelu
pwsh ai-gateway/scripts/start-gateway.ps1    # ściąga Pythona 3.12, zależności i startuje wszystko
```

Skrypt uruchamia gateway, a ten sam startuje i nadzoruje `llama-server` (o ile w `.env` są `GATEWAY_LLAMA_BINARY` i `GATEWAY_LLAMA_MODEL`). Zostaw te pola puste, jeśli wolisz odpalać `llama-server` osobno — gateway wtedy tylko się do niego podłączy (status `external`).

Testy: `uv run pytest` (w katalogu `ai-gateway/`).

## Czego potrzebujesz na dysku

| Element   | Skąd                                                                                                                      | Domyślna ścieżka w `.env`                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| llama.cpp | [releases](https://github.com/ggml-org/llama.cpp/releases) — `bin-win-cuda-13.3-x64` + `cudart-*`                         | `C:/AI/llm/llama.cpp/llama-server.exe`     |
| Model     | [empero-ai/Qwythos-9B-v2-GGUF](https://huggingface.co/empero-ai/Qwythos-9B-v2-GGUF) → `Qwythos-9B-v2-Q8_0.gguf` (9,53 GB) | `C:/AI/llm/models/Qwythos-9B-v2-Q8_0.gguf` |

Wersję CUDA dobierz do sterownika (`nvidia-smi` → „CUDA UMD Version”). Wariant `-MTP-` modelu pomijamy — llama.cpp nie korzysta z głowicy multi-token prediction.

## API

| Endpoint              | Opis                                                                        |
| --------------------- | --------------------------------------------------------------------------- |
| `GET /health`         | status llama-server, długość kolejki, VRAM (`nvidia-smi`), liczba restartów |
| `POST /chat`          | generacja ze strumieniowaniem SSE                                           |
| `POST /admin/restart` | ręczny restart llama-server (diagnostyka)                                   |

`POST /chat` przyjmuje `messages`, `purpose` (`npc` \| `gm_assistant` \| `test`), `bot_id`, `reasoning`, `max_tokens`, `temperature`, `top_p`, `top_k`, `seed`. Odpowiada zdarzeniami SSE:

| Zdarzenie | Dane          | Kiedy                                            |
| --------- | ------------- | ------------------------------------------------ |
| `queue`   | `{position}`  | żądanie czeka w kolejce (pozycja maleje do 1)    |
| `start`   | `{reasoning}` | model zaczyna generować                          |
| `think`   | `{text}`      | fragment rozumowania — **tylko gdy `reasoning`** |
| `delta`   | `{text}`      | fragment odpowiedzi                              |
| `done`    | `{usage}`     | koniec + tokeny/s, czas, liczba tokenów          |
| `error`   | `{message}`   | błąd generacji                                   |

Nagłówek `X-API-Key` jest wymagany, gdy ustawisz `GATEWAY_API_KEY` (obowiązkowe po etapie 28 — gateway będzie osiągalny z VPS przez Tailscale). `GET /health` celowo zostaje bez klucza: serwer VTT odpytuje go cyklicznie, żeby pokazywać status botów.

## Bloki `think`

Model **domyślnie zawsze** otwiera odpowiedź blokiem rozumowania. Gateway steruje tym per żądanie:

- `reasoning: false` (domyślne dla `npc` i `test`) → `reasoning_budget: 0` + `chat_template_kwargs.enable_thinking = false`; blok think w ogóle nie powstaje,
- `reasoning: true` (domyślne dla `gm_assistant`) → budżet `GATEWAY_REASONING_BUDGET` tokenów na myślenie i wyższy limit odpowiedzi (`GATEWAY_REASONING_MAX_TOKENS`).

Rozdzielenie budżetów jest konieczne: przy wspólnym limicie 400 tokenów model przemyślał całą pulę i zwrócił **pustą** odpowiedź. Rozumowanie nigdy nie trafia do `content` — llama-server wystawia je osobno (`--reasoning-format deepseek`), więc nie wycinamy go regexem.

Uwaga: model rozumuje po angielsku, nawet gdy odpowiada po polsku. To wyłącznie treść pod przyciskiem „Pokaż rozumowanie” w panelu MG.

## Pomiary (2026-07-24, RTX 5070 Ti 16 GB, sterownik 610.62, llama.cpp b10107, CUDA 13.3)

Generacja: **~80 tokenów/s** (76–83 w kilkunastu próbach), prompt processing **~1440 tok/s**. Wczytanie modelu: ~3,5 s. Typowa odpowiedź bota NPC (35–85 tokenów) wraca w **0,5–1,5 s** — z zapasem poniżej limitu 15 s z ankiety. Odpowiedź asystenta MG z rozumowaniem (848 tokenów łącznie): ~10,5 s.

VRAM (całkowite zajęcie karty; sam Windows z pulpitem zajmuje ~2,8 GB):

| Kontekst | Karta łącznie | Sam llama-server | Wolne   |
| -------- | ------------- | ---------------- | ------- |
| 16 384   | 11,7 GB       | ~8,7 GB          | ~4,5 GB |
| 32 768   | 12,3 GB       | ~9,2 GB          | ~4,0 GB |
| 65 536   | 13,3 GB       | ~10,3 GB         | ~3,0 GB |

KV cache jest zaskakująco tani — ~32 MB na 1000 tokenów kontekstu — bo model ma architekturę hybrydową (3:1 bloki Gated-DeltaNet SSM do bloków pełnej uwagi). Dzięki temu podniesienie kontekstu z 16k do 64k kosztuje tylko ~1,6 GB.

**Decyzja na etap 21 (STT):** domyślny kontekst **32 768** zostawia ~4,0 GB wolnego VRAM. faster-whisper `medium` w float16 potrzebuje ~1,5–2 GB, więc mieści się bez schodzenia na `small` ani na CPU. Gdyby zabrakło (np. po dołożeniu RAG), kolejność cięć: kontekst 16k → `--cache-type-k q8_0 --cache-type-v q8_0` → whisper `small`.

### Rezerwa na TTS (etap 12) — bilans do przeliczenia

Do tych samych ~4,0 GB pretenduje głos botów. **Uwaga: poniższe liczby dla TTS i STT to górne widełki z dokumentacji, nie pomiary** — prawdopodobnie zawyżone (Chatterbox to model 0.5B, a szczyt zużycia przy krótkich kwestiach jest chwilowy). Możliwe, że wszystko zmieści się bez żadnych zabiegów; rozstrzygnie to pomiar w etapie 12, który ma zastąpić tę tabelę realnymi wartościami.

| Wariant                                            | LLM | TTS           | STT  | Suma z Windows   |
| -------------------------------------------------- | --- | ------------- | ---- | ---------------- |
| TTS na CPU (Piper)                                 | 9,2 | 0             | 2,0  | ~14,0 GB ✅      |
| TTS na GPU rezydentny, kontekst 32k                | 9,2 | 2,0–3,0       | 2,0  | ~16–17 GB ⚠️     |
| TTS na GPU, kontekst 16k + whisper `small`         | 8,7 | 2,0–3,0       | ~1,0 | ~14,5–15,5 GB ✅ |
| TTS ładowany leniwie, wyładowywany po bezczynności | 9,2 | 0 w spoczynku | 2,0  | ~14,0 GB ✅      |

**Jeśli pomiar pokaże brak pamięci: modele nie muszą stać w karcie jednocześnie.** Synteza trwa sekundy i przypada na moment, w którym LLM już skończył generować, a mikrofon milczy. Furtki w kolejności rosnącego kosztu:

1. leniwe ładowanie TTS + wyładowanie po bezczynności (koszt: pierwsze zdanie po przerwie wolniejsze),
2. **wyładowanie whispera na czas syntezy** (przeładowanie ~1–2 s, STT i tak bezczynne, gdy bot mówi),
3. kontekst LLM 32k→16k albo `--cache-type-k/v q8_0`,
4. **zatrzymanie `llama-server` na czas syntezy** i podniesienie po niej — nadzór już to potrafi, wczytanie modelu to ~3,5 s; **tylko przy pustej kolejce LLM i nigdy w środku generacji**,
5. whisper `small`, ostatecznie TTS na CPU.

Punkty 2 i 4 wymagają arbitra zasobów GPU po stronie gatewaya (priorytety, histereza, licznik przeładowań w `/health`). Domyślnie mają być **wyłączone** — przeładowywanie modeli przy każdej wypowiedzi bota psuje tempo rozmowy bardziej niż gorszy głos.

## Nadzór nad llama-server

Gateway pilnuje procesu i podnosi go po padzie: health-check co 5 s, natychmiastowa reakcja na zakończenie procesu, restart po 3 nieudanych sprawdzeniach. Zmierzone: po `taskkill /IM llama-server.exe /F` gateway zauważył pad w ~5 s i miał model z powrotem w gotowości po kolejnych ~4 s (licznik `restarts` w `/health` rośnie).

Kolejka jest po stronie gatewaya (FIFO, jedna generacja naraz, `--parallel 1` w llama-server) — dzięki temu znamy pozycję każdego żądania i możemy ją pokazać w UI.

## Znane ograniczenia

- **Model zmyśla zasady Cyberpunk RED** (np. „Sztuka Klatki (Parkour), DC 15–16” zamiast Atletyki i DV). Bez RAG na podręczniku to normalne — naprawia to etap 19. Do tego czasu asystent MG jest wyłącznie zabawką diagnostyczną.
- `llama-server` startuje z otwartym CORS i bez własnego klucza API, ale słucha tylko na `127.0.0.1` — z zewnątrz jest nieosiągalny. Nie wystawiaj jego portu.
