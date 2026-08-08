# AI Gateway

Usługa Python 3.12 + FastAPI spinająca lokalne AI dla VTT:

- **LLM** — Qwythos-9B-v2 (GGUF Q8_0) przez `llama-server` (llama.cpp), API zgodne z OpenAI — **działa od etapu 09**,
- **RAG** — pamięć botów i wiedza z kompendium — **działa od etapu 19**.

Głosu tu nie ma: TTS (etap 12) i STT (etap 21) zostały wycofane 09.08.2026 — patrz
`docs/etapy/archiwum/wycofane/`.

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

| Endpoint                              | Opis                                                                                                                                                            |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health`                         | status llama-server, długość kolejki, VRAM (`nvidia-smi`), restarty                                                                                             |
| `POST /chat`                          | generacja ze strumieniowaniem SSE                                                                                                                               |
| `GET /rag/status`                     | model embeddingów, kolekcje, postęp indeksowania (etap 19a)                                                                                                     |
| `POST /rag/search`                    | wyszukiwanie hybrydowe → fragmenty z cytatem; `tags` i `visibility` filtrują uprawnieniami (19b); `collections` obejmuje kilka kolekcji jednym rankingiem (19c) |
| `POST /rag/index`                     | indeksowanie dokumentów przysłanych przez serwer VTT (baza wiedzy kampanii)                                                                                     |
| `POST /rag/index/rulebook`            | indeksowanie podręcznika i zrzutów PDF z **lokalnego dysku gatewaya** (w tle)                                                                                   |
| `POST /rag/forget`                    | zapomnienie wskazanych dokumentów (wpis skasowany w edytorze MG)                                                                                                |
| `GET /rag/collections/{name}/sources` | co kolekcja ma zaindeksowane — po tym poznaje się sieroty                                                                                                       |
| `DELETE /rag/collections/{name}`      | skasowanie kolekcji                                                                                                                                             |
| `POST /admin/restart`                 | ręczny restart llama-server (diagnostyka)                                                                                                                       |

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

**Domyślny kontekst to 32 768** i po wycofaniu głosu (09.08.2026) te ~4,0 GB wolnego VRAM nie są już nikomu obiecane — embeddingi RAG liczą się na CPU, więc na karcie stoi wyłącznie llama-server. Gdyby przyszło dołożyć coś na GPU, kolejność cięć bez zmian: kontekst 16k → `--cache-type-k q8_0 --cache-type-v q8_0`.

## Mowa botów (etap 12) — wycofana 09.08.2026

Gateway syntezował wypowiedzi NPC-ów Piperem (CPU, 0 GB VRAM) i oddawał rytm ujawniania tekstu
liczony z alignmentu fonemów. Cały moduł został usunięty razem z decyzją o rezygnacji z głosu —
pomiary, wybór silnika i uzasadnienia są w historii gita oraz w
`docs/etapy/archiwum/wycofane/`. Zwolniona rezerwa VRAM wraca do puli opisanej wyżej.

## RAG — pamięć długoterminowa (etap 19a, zmierzone 2026-08-08)

Embeddingi liczą się **na CPU** przez `onnxruntime`: model na GPU zabrałby połowę rezerwy, która trzyma kontekst 32k przy życiu, a indeksowanie i tak jest jednorazowe. Zmierzone na żywym gatewayu: zajęcie VRAM w trakcie indeksowania **nie drgnęło** (12,5 GB przed i po, czyli sam llama-server z pulpitem).

### Wybór modelu

Oba kandydatury mają na HuggingFace gotowy eksport ONNX, więc `torch` nie był potrzebny. Zestaw: 10 pytań MG zadanych naturalną polszczyzną, oczekiwana strona podręcznika (`data/private/rag/bench-questions.json`, poza repo — próbka o tym samym kształcie w `data/public/rag/`). Skrypt: `uv run python scripts/bench-embeddings.py`.

| Tryb wyszukiwania         | bge-m3              | multilingual-e5-large |
| ------------------------- | ------------------- | --------------------- |
| same wektory              | 9/10 · MRR 0,900    | 10/10 · MRR 0,717     |
| sam pełny tekst (FTS5)    | 7/10 · MRR 0,415    | 7/10 · MRR 0,415      |
| hybryda 1,0 / 0,15        | 9/10 · MRR 0,783    | 9/10 · MRR 0,775      |
| **hybryda 1,0 / 0,30**    | **10/10 · 0,770**   | 9/10 · MRR 0,703      |
| hybryda 1,0 / 0,50        | 10/10 · MRR 0,770   | 9/10 · MRR 0,637      |
| hybryda 1,0 / 0,70        | 10/10 · MRR 0,595   | 9/10 · MRR 0,587      |
| indeksowanie (1264 frag.) | 409 s (3,1 frag./s) | 490 s (2,6 frag./s)   |
| zapytanie (mediana)       | 38 ms               | 36 ms                 |

**Wybrany: bge-m3, wagi 1,0 / 0,3.** Jako jedyny dochodzi do kompletu trafień, indeksuje o 20% szybciej i nie wymaga prefiksów `query:`/`passage:` (jeden sposób mniej, żeby się pomylić).

Trzy rzeczy widać w tabeli i warto o nich pamiętać:

- **Hybryda naprawdę dokłada trafienie** — bge-m3 sam z wektorów daje 9/10, dopiero pełny tekst dociąga pytanie, w którym liczy się nazwa własna zasady. Uzasadnienie decyzji z opisu etapu jest zmierzone, nie założone.
- **Za duża waga słów psuje kolejność.** Przy 0,7 trafień jest tyle samo co przy 0,3, ale właściwy fragment ląduje niżej w prompcie (MRR 0,595 vs 0,770). Dla modelu 9B to różnica między odpowiedzią z fragmentu 1 a z fragmentu 4.
- **Dla e5 hybryda pogarsza wynik** (10/10 → 9/10): fuzja potrafi wypchnąć z piątki trafienie, które miały same wektory. Wagi są zestrojone pod wybrany model i po jego zmianie trzeba je przemierzyć.

### Chunkowanie i magazyn

Podręcznik z etapu 13 (21 plików MD) daje **1264 fragmenty** po 300–600 tokenów liczonych tokenizerem modelu. Nagłówek zaczyna nowy fragment, tabela jedzie w całości, a pierwsza linia fragmentu to jego ścieżka („rozdział › sekcja (s. N)") — dzięki temu cytat bierze się z materiału, a FTS5 łapie nazwę sekcji tak samo jak słowa z akapitu.

**Nie ma tu sqlite-vec ani Chromy.** Przy 1264 fragmentach po 1024 wymiary cała kolekcja to macierz 5 MB, a kosinus „każdy z każdym" to jedno mnożenie — zmierzone **38 ms na całe zapytanie razem z embeddingiem pytania**. Indeks ANN kupowałby zero, a kosztował natywne rozszerzenie SQLite, którego `enable_load_extension` nie musi być dostępne w każdej instalacji Pythona.

Zmiana `GATEWAY_RAG_MODEL` unieważnia indeks (wektory dwóch modeli nie leżą w jednej przestrzeni): gateway wykrywa to, mówi o tym w `/rag/status`, a przy najbliższym indeksowaniu czyści kolekcje i buduje je od nowa.

### Płaski tekst i uprawnienia (etap 19b, zmierzone 2026-08-08)

Doszedł **drugi tryb chunkowania**: zrzuty PDF-a bez nagłówków (`chunk_plain_text`). Strony rozpoznaje po `=== page N ===`, skleja przeniesione wyrazy (`zauwa-` + `żymy`) i wyrzuca żywą paginę — linię powtórzoną na co najmniej połowie stron, bo taka trafiałaby we **wszystkie** zapytania o cokolwiek z tego dokumentu. Cytat schodzi tu do „tytuł, s. N", bo więcej z materiału nie da się uczciwie wyczytać.

Które pliki wchodzą, mówi `GATEWAY_RAG_TEXT_FILES` (pary `plik.txt|Tytuł`). Domyślnie tylko materiały polskie — FAQ i dwa DLC. Angielskie dodatki są świadomie poza: w wyszukiwaniu pełnotekstowym przebijałyby polskie akapity, a ich statbloki są spoza kanonu kampanii. Zmierzone: podręcznik + trzy zrzuty = **24 dokumenty, 1297 fragmentów, 367 s** indeksowania na CPU.

Uprawnienia botów są **filtrem SQL przed mnożeniem wektorów**, nie obcięciem wyników po fakcie: `visibility` siedzi w kolumnie `chunks`, tagi w indeksowanej tabeli `chunk_tags`, a `/rag/search` przyjmuje jedno i drugie. Kolekcja, do której bot nie ma prawa, nie kosztuje go ani jednego mnożenia.

Zmierzone na kolekcji kampanii (8 wpisów, `pnpm --filter @vtt/server exec tsx scripts/bot-context-budget.ts`):

| Co                                           | Ile                                   |
| -------------------------------------------- | ------------------------------------- |
| indeksowanie 8 wpisów bazy wiedzy            | 738 ms                                |
| wyszukiwanie dla bota (mediana z 5)          | 60 ms                                 |
| prompt bota: profil + 18 wypowiedzi historii | 1252 tok                              |
| ten sam prompt z 3 fragmentami               | 1677 tok (**+425**, ~142 na fragment) |
| cała tura (wyszukiwanie + generacja)         | mediana 0,62 s, najgorsza 1,14 s      |

Limit z etapu 11 to 20 s, więc RAG zjada z niego ~0,3%. Na żywej kampanii (`bot:trace`) wyszukiwanie mieści się w **33–51 ms** — kolekcja kampanii ma kilka fragmentów, więc kosztuje ją wyłącznie embedding pytania.

### Dziennik jako trzecia kolekcja (etap 19c)

Kolekcje są trzy: `rulebook` (asystent zasad), `campaign:<id>` (baza wiedzy) i `journal:<id>`
(streszczenia sesji). Bot czyta te, na które MG mu pozwolił — i czyta je **jednym zapytaniem**:
`/rag/search` przyjmuje `collections`, a `WHERE c.collection IN (…)` obejmuje je wszystkie przed
mnożeniem wektorów. Dwa osobne wyszukiwania dałyby dwa rankingi RRF, których pozycji nie ma jak
uczciwie zesłać (pozycja 1 w kolekcji o pięciu fragmentach nie znaczy tego samego co w kolekcji
o tysiącu), i drugi przebieg embeddera na CPU. Fragmenty z obu źródeł mają konkurować o te same
trzy miejsca w prompcie, a nie dostać po trzy każde.

Streszczanie sesji jest po stronie serwera VTT (`realtime/journal.ts`), nie gatewaya: to zwykły
ciąg wywołań `/chat` — jedno na porcję zapisu (mapowanie), potem składanie (redukcja) i jedno na
propozycje relacji. Gateway nie musi wiedzieć, czym jest sesja.

## Structured output — decyzje botów (etap 20a, zmierzone 2026-08-08)

`POST /chat` przyjmuje opcjonalne `json_schema`. Gateway przekłada je na `response_format`
llama-servera, a llama.cpp kompiluje schemat do gramatyki GBNF i próbkuje **wyłącznie tokeny,
które ją spełniają**. Dla botów znaczy to jedno: lista dozwolonych umiejętności wpisana w `enum`
jest gwarancją, a nie kontrolą — model nie ma jak wypisać nazwy, której na liście nie ma.

Gramatyka **wyłącza rozumowanie**, niezależnie od tego, o co poprosił wołający. Powód jest
w sekcji o `reasoning_budget` niżej: budżet think jest nieegzekwowalny, więc model potrafi
przemyśleć cały `max_tokens` i oddać pustą odpowiedź — a pusta odpowiedź w przebiegu decyzyjnym
to akcja, której nie ma.

| Co                                              | Wynik                              |
| ----------------------------------------------- | ---------------------------------- |
| Decyzja bota (schemat z 8 opcjami, 160 tokenów) | **0,50–1,10 s** (mediana ~0,9 s)   |
| Ta sama decyzja bez gramatyki                   | 0,50–0,64 s                        |
| Dopłata do zwykłej wypowiedzi NPC-a (etap 11)   | +~0,9 s, tylko na liniach z prośbą |

Dwie rzeczy zmierzone na żywym modelu, które kosztowałyby dzień szukania:

1. **Pole opcjonalne 9B po prostu pomija.** Przy `required: ["akcja", "powod"]` model odpowiadał
   `{"akcja":"rzut","powod":"…"}` — bez wskazania umiejętności, czyli każdy rzut wracał jako
   odrzucony. Pole musi być w `required` **zawsze**, gdy menu istnieje, i być ignorowane przy
   decyzji „rozmowa". Warunku nie da się tu wyrazić: konwerter JSON Schema → GBNF w llama.cpp nie
   obsługuje `if`/`then`.
2. **Bez przykładu model wpisuje w pole tekstowe arytmetykę.** Uzasadnienie wychodziło jako
   „Percepcja (0) + INT (5) = 5" zamiast zdania. Jedna linijka przykładu w prompcie to naprawia.

### Uwaga o `reasoning_budget` (znalezione 08.08)

`llama-server` **przyjmuje** dowolną liczbę w `reasoning_budget` bez błędu, ale egzekwuje wyłącznie `0` (wyłącz rozumowanie) i `-1` (bez limitu). Nasze `640` nie robi nic. Skutek zaobserwowany na żywym modelu: przy pytaniu o osłony model wygenerował **1536 tokenów samego rozumowania i pustą odpowiedź** — przy komplecie poprawnych cytatów. Komentarz w `llama_client.py` obiecywał coś przeciwnego od etapu 09; jest poprawiony. Wołający musi mieć własną ścieżkę na pustą odpowiedź — serwer VTT powtarza wtedy pytanie raz, bez rozumowania (`realtime/rules.ts`).

## Nadzór nad llama-server

Gateway pilnuje procesu i podnosi go po padzie: health-check co 5 s, natychmiastowa reakcja na zakończenie procesu, restart po 3 nieudanych sprawdzeniach. Zmierzone: po `taskkill /IM llama-server.exe /F` gateway zauważył pad w ~5 s i miał model z powrotem w gotowości po kolejnych ~4 s (licznik `restarts` w `/health` rośnie).

Kolejka jest po stronie gatewaya (FIFO, jedna generacja naraz, `--parallel 1` w llama-server) — dzięki temu znamy pozycję każdego żądania i możemy ją pokazać w UI.

## Znane ograniczenia

- **Model zmyśla zasady Cyberpunk RED, gdy pyta się go bez RAG** (np. „Sztuka Klatki (Parkour), DC 15–16” zamiast Atletyki i DV). Dotyczy to wolnego pytania z zakładki „AI”. Zakładka „Zasady” (etap 19a) odpowiada wyłącznie z zaindeksowanych fragmentów i podaje przy każdym twierdzeniu numer cytatu.
- **Pierwsze uruchomienie RAG pobiera ~2,3 GB wag** modelu embeddingów z HuggingFace, a pierwsze indeksowanie podręcznika trwa ~7 minut na CPU. Panel „Zasady” pokazuje postęp rozdziałami.
- `llama-server` startuje z otwartym CORS i bez własnego klucza API, ale słucha tylko na `127.0.0.1` — z zewnątrz jest nieosiągalny. Nie wystawiaj jego portu.
