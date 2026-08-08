# AI Gateway

Usługa Python 3.12 + FastAPI spinająca lokalne AI dla VTT:

- **LLM** — Qwythos-9B-v2 (GGUF Q8_0) przez `llama-server` (llama.cpp), API zgodne z OpenAI — **działa od etapu 09**,
- **TTS** — głos botów po polsku (Piper na CPU, 0 GB VRAM) — **działa od etapu 12**,
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

| Endpoint              | Opis                                                                      |
| --------------------- | ------------------------------------------------------------------------- |
| `GET /health`         | status llama-server i TTS, długość kolejki, VRAM (`nvidia-smi`), restarty |
| `POST /chat`          | generacja ze strumieniowaniem SSE                                         |
| `POST /tts`           | synteza jednej wypowiedzi → audio WAV + rytm ujawniania tekstu (`reveal`) |
| `GET /tts/voices`     | modele głosu, które silnik faktycznie ma na dysku                         |
| `GET /rag/status`     | model embeddingów, kolekcje, postęp indeksowania (etap 19a)               |
| `POST /rag/search`    | wyszukiwanie hybrydowe → fragmenty z cytatem (rozdział, sekcja, strona)   |
| `POST /rag/index`     | indeksowanie dokumentów przysłanych przez serwer VTT                      |
| `POST /rag/index/rulebook` | indeksowanie podręcznika z **lokalnego dysku gatewaya** (w tle)      |
| `DELETE /rag/collections/{name}` | skasowanie kolekcji                                             |
| `POST /admin/restart` | ręczny restart llama-server (diagnostyka)                                 |

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

## TTS — głos botów (etap 12, zmierzone 2026-07-25)

**Wybrany silnik: Piper** (VITS/ONNX, CPU, MIT). Decyzja zapadła na pomiarach, nie na dokumentacji.

| Kryterium                                 | **Piper (CPU)**                  | Chatterbox Multilingual (GPU) |
| ----------------------------------------- | -------------------------------- | ----------------------------- |
| VRAM ponad llama-server                   | **0 GB**                         | +3,3 GB, szczyt **+3,7 GB**   |
| Zajęcie karty łącznie (z LLM @32k)        | **12,3 GB / 16,3 GB**            | **15,7 GB / 16,3 GB**         |
| Czas do pierwszego dźwięku, kwestia ~5 s  | **0,08 s**                       | 3,6–9,5 s                     |
| Czas do pierwszego dźwięku, monolog ~30 s | **0,45 s**                       | ~21 s (ekstrapolacja RTF)     |
| RTF (czas syntezy / długość mowy)         | **0,012–0,06**                   | 0,71                          |
| Ładowanie modelu                          | 1,1–1,4 s                        | 5,8 s                         |
| Znaczniki czasu słów                      | **dokładne** (alignment fonemów) | brak — tylko estymacja        |
| Klonowanie głosu z próbki                 | nie                              | **tak**                       |
| Głosy PL                                  | 5 modeli × tempo/wysokość        | 1 wbudowany + klonowane       |

**Miarą jest czas do rozpoczęcia mowy, nie długość wypowiedzi.** Kwestia może trwać 20 s i to jest w porządku — liczy się, po ilu sekundach NPC się odezwie. Piper syntezuje całość, zanim zacznie mówić, i nawet przy półminutowym monologu kosztuje to 0,45 s, więc synteza zdaniami (POMYSLY.md) jest zbędna. Przy Chatterboksie ten sam monolog oznaczałby ~21 s ciszy — stąd odrzucenie, niezależnie od jakości głosu.

Chatterbox zostaje jako tryb opcjonalny (`GATEWAY_TTS_ENGINE=chatterbox`): daje klonowanie głosu, ale wymaga instalacji `chatterbox-tts` z torchem **cu128** (pin `torch==2.6.0` w pakiecie nie obsługuje Blackwella sm_120) oraz `setuptools<81` (nowsze nie mają `pkg_resources`, bez którego watermarker Perth cicho przestaje istnieć i model nie wstaje).

### Bilans VRAM po etapie 12

| Składnik                    | VRAM        |
| --------------------------- | ----------- |
| Windows z pulpitem          | ~2,8 GB     |
| llama-server (kontekst 32k) | ~9,2 GB     |
| **TTS (Piper, CPU)**        | **0 GB**    |
| Zajęte razem                | **12,3 GB** |
| Wolne na whispera (etap 21) | **~4,0 GB** |

Rezerwa na STT nie zmalała o ani jeden megabajt, więc **żadna z furtek z planu etapu nie była potrzebna** — ani wyładowywanie whispera na czas syntezy, ani zatrzymywanie llama-servera, ani schodzenie z kontekstu. Arbiter zasobów GPU pozostaje niezaimplementowany i niepotrzebny; wraca do rozważenia dopiero, gdyby ktoś świadomie włączył Chatterboksa.

Leniwe ładowanie i wyładowanie po bezczynności (`GATEWAY_TTS_IDLE_UNLOAD_S`, domyślnie 600 s) jest mimo to zaimplementowane — przy Piperze chodzi o RAM (63 MB na model głosu), a przy silniku na GPU byłoby warunkiem współistnienia z LLM.

### Głosy

Pięć polskich modeli, wszystkie wolne licencyjnie (CC0 ×3, Apache-2.0, CC BY 4.0 — szczegóły i wymagana atrybucja w `data/public/tts-voices/ATTRIBUTION.md`). Pobranie: `node scripts/download-tts-voices.mjs` (370 MB, poza repo, sumy kontrolne w `models.json`).

Z pięciu modeli robi się dwanaście presetów archetypów (`voices.json`), bo Piper dostał sterowanie wysokością głosu, którego natywnie nie ma: syntezujemy wolniej o współczynnik `pitch`, a odtwarzamy z częstotliwością próbkowania przemnożoną przez ten sam współczynnik. Tempo wychodzi bez zmian, barwa się przesuwa.

### Rytm ujawniania tekstu

Model załadowany z `include_alignments=True` oddaje liczbę próbek audio przypadającą na każdy fonem, a fonemy espeak są rozdzielone spacjami — z tego składamy dokładne granice słów. Gateway zwraca je jako `reveal`: listę punktów „w tej milisekundzie widocznych jest tyle pierwszych znaków wypowiedzi". Dzięki temu kwestia NPC-a dopisuje się na czacie w rytmie mowy, a nie pojawia w całości, i wyciszony gracz widzi dokładnie to samo tempo co słuchający.

Normalizacja przed syntezą (`tts/text.py`) jest częścią tego mechanizmu: „250" czyta się jako dwa słowa, a widoczne jest jako jeden token, więc każdy token pamięta, ile słów mówionych mu odpowiada. Przy okazji rozwijamy skróty mechaniki tak, jak mówi się je przy stole („DV" → „de fau", „1k10" → „jeden ka dziesięć").

## RAG — pamięć długoterminowa (etap 19a, zmierzone 2026-08-08)

Embeddingi liczą się **na CPU** przez `onnxruntime` — dokładnie tak jak Piper w etapie 12 i z tego samego powodu: rezerwa karty (~4,0 GB) należy do faster-whispera z etapu 21, a model embeddingów zabrałby jej połowę. Zmierzone na żywym gatewayu: zajęcie VRAM w trakcie indeksowania **nie drgnęło** (12,5 GB przed i po, czyli sam llama-server z pulpitem).

### Wybór modelu

Oba kandydatury mają na HuggingFace gotowy eksport ONNX, więc `torch` nie był potrzebny. Zestaw: 10 pytań MG zadanych naturalną polszczyzną, oczekiwana strona podręcznika (`data/private/rag/bench-questions.json`, poza repo — próbka o tym samym kształcie w `data/public/rag/`). Skrypt: `uv run python scripts/bench-embeddings.py`.

| Tryb wyszukiwania         | bge-m3            | multilingual-e5-large |
| ------------------------- | ----------------- | --------------------- |
| same wektory              | 9/10 · MRR 0,900  | 10/10 · MRR 0,717     |
| sam pełny tekst (FTS5)    | 7/10 · MRR 0,415  | 7/10 · MRR 0,415      |
| hybryda 1,0 / 0,15        | 9/10 · MRR 0,783  | 9/10 · MRR 0,775      |
| **hybryda 1,0 / 0,30**    | **10/10 · 0,770** | 9/10 · MRR 0,703      |
| hybryda 1,0 / 0,50        | 10/10 · MRR 0,770 | 9/10 · MRR 0,637      |
| hybryda 1,0 / 0,70        | 10/10 · MRR 0,595 | 9/10 · MRR 0,587      |
| indeksowanie (1264 frag.) | 409 s (3,1 frag./s) | 490 s (2,6 frag./s) |
| zapytanie (mediana)       | 38 ms             | 36 ms                 |

**Wybrany: bge-m3, wagi 1,0 / 0,3.** Jako jedyny dochodzi do kompletu trafień, indeksuje o 20% szybciej i nie wymaga prefiksów `query:`/`passage:` (jeden sposób mniej, żeby się pomylić).

Trzy rzeczy widać w tabeli i warto o nich pamiętać:

- **Hybryda naprawdę dokłada trafienie** — bge-m3 sam z wektorów daje 9/10, dopiero pełny tekst dociąga pytanie, w którym liczy się nazwa własna zasady. Uzasadnienie decyzji z opisu etapu jest zmierzone, nie założone.
- **Za duża waga słów psuje kolejność.** Przy 0,7 trafień jest tyle samo co przy 0,3, ale właściwy fragment ląduje niżej w prompcie (MRR 0,595 vs 0,770). Dla modelu 9B to różnica między odpowiedzią z fragmentu 1 a z fragmentu 4.
- **Dla e5 hybryda pogarsza wynik** (10/10 → 9/10): fuzja potrafi wypchnąć z piątki trafienie, które miały same wektory. Wagi są zestrojone pod wybrany model i po jego zmianie trzeba je przemierzyć.

### Chunkowanie i magazyn

Podręcznik z etapu 13 (21 plików MD) daje **1264 fragmenty** po 300–600 tokenów liczonych tokenizerem modelu. Nagłówek zaczyna nowy fragment, tabela jedzie w całości, a pierwsza linia fragmentu to jego ścieżka („rozdział › sekcja (s. N)") — dzięki temu cytat bierze się z materiału, a FTS5 łapie nazwę sekcji tak samo jak słowa z akapitu.

**Nie ma tu sqlite-vec ani Chromy.** Przy 1264 fragmentach po 1024 wymiary cała kolekcja to macierz 5 MB, a kosinus „każdy z każdym" to jedno mnożenie — zmierzone **38 ms na całe zapytanie razem z embeddingiem pytania**. Indeks ANN kupowałby zero, a kosztował natywne rozszerzenie SQLite, którego `enable_load_extension` nie musi być dostępne w każdej instalacji Pythona.

Zmiana `GATEWAY_RAG_MODEL` unieważnia indeks (wektory dwóch modeli nie leżą w jednej przestrzeni): gateway wykrywa to, mówi o tym w `/rag/status`, a przy najbliższym indeksowaniu czyści kolekcje i buduje je od nowa.

### Uwaga o `reasoning_budget` (znalezione 08.08)

`llama-server` **przyjmuje** dowolną liczbę w `reasoning_budget` bez błędu, ale egzekwuje wyłącznie `0` (wyłącz rozumowanie) i `-1` (bez limitu). Nasze `640` nie robi nic. Skutek zaobserwowany na żywym modelu: przy pytaniu o osłony model wygenerował **1536 tokenów samego rozumowania i pustą odpowiedź** — przy komplecie poprawnych cytatów. Komentarz w `llama_client.py` obiecywał coś przeciwnego od etapu 09; jest poprawiony. Wołający musi mieć własną ścieżkę na pustą odpowiedź — serwer VTT powtarza wtedy pytanie raz, bez rozumowania (`realtime/rules.ts`).

## Nadzór nad llama-server

Gateway pilnuje procesu i podnosi go po padzie: health-check co 5 s, natychmiastowa reakcja na zakończenie procesu, restart po 3 nieudanych sprawdzeniach. Zmierzone: po `taskkill /IM llama-server.exe /F` gateway zauważył pad w ~5 s i miał model z powrotem w gotowości po kolejnych ~4 s (licznik `restarts` w `/health` rośnie).

Kolejka jest po stronie gatewaya (FIFO, jedna generacja naraz, `--parallel 1` w llama-server) — dzięki temu znamy pozycję każdego żądania i możemy ją pokazać w UI.

## Znane ograniczenia

- **Model zmyśla zasady Cyberpunk RED, gdy pyta się go bez RAG** (np. „Sztuka Klatki (Parkour), DC 15–16” zamiast Atletyki i DV). Dotyczy to wolnego pytania z zakładki „AI”. Zakładka „Zasady” (etap 19a) odpowiada wyłącznie z zaindeksowanych fragmentów i podaje przy każdym twierdzeniu numer cytatu.
- **Pierwsze uruchomienie RAG pobiera ~2,3 GB wag** modelu embeddingów z HuggingFace, a pierwsze indeksowanie podręcznika trwa ~7 minut na CPU. Panel „Zasady” pokazuje postęp rozdziałami.
- `llama-server` startuje z otwartym CORS i bez własnego klucza API, ale słucha tylko na `127.0.0.1` — z zewnątrz jest nieosiągalny. Nie wystawiaj jego portu.
