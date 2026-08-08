# Etap 12 — TTS: głos botów

> ⛔ **ETAP WYCOFANY 09.08.2026.** Był ukończony 26.07.2026 (Piper na CPU), ale mowa botów wypadła
> z projektu razem z całą fazą G. **Kod został usunięty z repozytorium** — opis poniżej zostaje
> wyłącznie jako zapis tego, co istniało, i nie jest planem pracy. Szczegóły: `README.md` w tym
> katalogu. Z etapu przetrwało jedno zachowanie: wypowiedź NPC-a dopisuje się na czacie słowo po
> słowie, ale rytm liczy dziś klient (`packages/client/src/typewriter.ts`), nie synteza mowy.

**Faza:** C — Boty MVP · **Wymaga etapów:** 11

## Cel sesji

Boty mówią po polsku. Głos wybierany w profilu bota (preset albo własna próbka), synteza w AI Gateway w twardym budżecie **≤ 3 GB VRAM**, automatyczne odtwarzanie przy stole i pełna degradacja do samego tekstu, gdy TTS jest niedostępny.

## Zakres

- [x] **Sesja pomiarowa i wybór silnika (pierwsze zadanie etapu).** Ten sam zestaw 5 kwestii PL (krótka odzywka, dłuższy opis, emocje, nazwy własne — „Night City", „Arasaka", „ripperdoc", liczby i skróty mechaniki) przepuszczony przez dwóch kandydatów:
  - **Piper** — VITS/ONNX, głosy `pl_PL-darkman`, `pl_PL-gosia`, `pl_PL-mc_speech`; działa na CPU szybciej niż realtime, **0 GB VRAM**, brak klonowania głosu
  - **Chatterbox Multilingual** (Resemble AI, 0.5B, MIT) — polski w oficjalnym zestawie języków, zero-shot klonowanie z krótkiej próbki, kontrola ekspresji, GPU ~2–3 GB
  - Kryteria oceny: naturalność polszczyzny, poprawność akcentu i liczebników, czas do pierwszego dźwięku, VRAM pod obciążeniem, stabilność (urwane/halucynowane końcówki)
  - Wynik odsłuchu i wybór trafiają do `ai-gateway/README.md` oraz `POSTEP.md`. Jeśli Chatterbox nie mieści się w budżecie razem z LLM i rezerwą na whisper — **Piper zostaje domyślny**, Chatterbox jako tryb opcjonalny
- [x] **Abstrakcja silnika w gatewayu:** interfejs `synthesize(text, voice, lang) -> audio` + adaptery per silnik, wybór przez `GATEWAY_TTS_ENGINE` (`piper` | `chatterbox` | `none`). Brak silnika to `available: false`, nigdy wyjątek — podmiana modelu w przyszłości ma być zmianą jednego adaptera
- [x] **Zarządzanie VRAM:** `GATEWAY_TTS_DEVICE` (`cuda` | `cpu`), leniwe ładowanie przy pierwszym żądaniu, wyładowanie po `GATEWAY_TTS_IDLE_UNLOAD_S` bezczynności; `GET /health` raportuje `tts: { engine, device, loaded, vram_mb }` (pełne dane tylko dla MG, jak reszta statusu z etapu 09)
- [x] **Czasowe współdzielenie VRAM — NIEPOTRZEBNE, potwierdzone pomiarem.** Piper liczy na CPU i zajmuje 0 GB VRAM, więc rezerwa na whispera (~4,0 GB) została nietknięta. Arbiter zasobów GPU nie powstał i nie powstanie, dopóki ktoś świadomie nie włączy Chatterboksa. Pierwotny plan poniżej — zostaje jako opis furtek na tamten wypadek:
  <!-- prettier-ignore -->
  > **Czasowe współdzielenie VRAM — tylko jeśli pomiar pokaże, że brakuje pamięci.** Modele nie muszą stać w karcie jednocześnie; synteza trwa sekundy i nie zbiega się z innymi zadaniami. Furtki w kolejności rosnącego kosztu:
  1. **whisper wyładowywany na czas syntezy** (STT jest bezczynne, gdy bot mówi; przeładowanie modelu to ~1–2 s)
  2. **llama-server zatrzymywany na czas syntezy** i podnoszony po niej — gateway już to potrafi (nadzór z etapu 09, wczytanie modelu ~3,5 s). Warunek twardy: **nigdy, gdy w kolejce LLM coś czeka**, i nigdy w środku generacji
  - Realizacja: mały arbiter zasobów GPU w gatewayu (priorytety + kto komu może kazać zwolnić pamięć), histereza (żadnego przeładowania częściej niż co N sekund), licznik przeładowań widoczny w `/health` — jeśli rośnie szybko, konfiguracja jest zła i trzeba zejść z TTS na CPU
  - **Domyślnie wyłączone.** Włączamy dopiero, gdy pomiar udowodni, że bez tego się nie mieści — przeładowywanie modeli przy każdej wypowiedzi bota psuje tempo rozmowy bardziej niż lektorski głos Pipera
- [x] **Endpoint `POST /tts`** (tekst + głos → audio) z **własną kolejką, niezależną od kolejki LLM** — synteza nie blokuje generacji i odwrotnie; limit długości tekstu, twardy timeout, format wyjściowy ustalony po pomiarze rozmiaru (WAV domyślnie; Opus, jeśli waga plików okaże się problemem przy zdalnej grze)
- [x] **Katalog głosów:** `data/public/tts-voices/voices.json` — 6–10 presetów PL pokrywających archetypy CP RED (fixer, ripperdoc, bramkarz, korpo, dzieciak ulicy, nomada…): id, nazwa PL, charakterystyka, silnik, parametry (speaker / próbka referencyjna, tempo, ekspresja). Same pliki modeli **nie idą do repo** — manifest z URL-ami i sumami kontrolnymi, pobranie skryptem
- [x] **Własne próbki głosu:** MG wgrywa 6–15 s audio w edytorze bota → `uploads/voices/` (gitignore), walidacja formatu/długości/rozmiaru; próbka staje się głosem klonowanym. Przy silniku bez klonowania pole jest wyszarzone z wyjaśnieniem, nie znika
- [x] **Rozszerzenie `BotProfile` (z etapu 10) o sekcję „Głos":** włącznik mowy per bot, wybór presetu albo własnej próbki, tempo/wysokość, przycisk „posłuchaj" (test syntezy w edytorze, poza sesją)
- [x] **Serwer VTT:** moduł proxy do `/tts`, cache audio per wypowiedź (klucz = hash tekstu + głosu + parametrów) w `uploads/tts-cache/`, serwowanie pod `/api/tts/<id>`, sprzątanie cache po przekroczeniu rozmiaru; wiadomość bota dostaje w payloadzie `audioUrl` **wraz z rytmem ujawniania tekstu** — **ODSTĘPSTWO na życzenie użytkownika:** tekst NIE jedzie przed audio. Wypowiedź z głosem czeka na syntezę (0,1–0,5 s przy Piperze) i pojawia się na czacie dopiero wtedy, gdy NPC zaczyna mówić, dopisując się słowo po słowie w tempie mowy. Bez głosu i przy awarii syntezy zachowanie jest stare: cały tekst od razu
- [x] **Uprawnienia i degradacja:** globalny przełącznik „mowa botów" per sesja u MG (wzorzec uprawnień STT z etapu 21); gateway lub TTS offline → wiadomości bez `audioUrl`, dyskretna informacja w UI, czat i boty działają normalnie
- [x] **Klient:** automatyczne odtwarzanie wypowiedzi bota z **kolejką** (dwa boty nie mówią naraz), wyciszenie mowy botów i suwak głośności w ustawieniach użytkownika (zapamiętane), ikona głośnika przy wiadomości = odtwórz ponownie, odblokowanie kontekstu audio przy pierwszej interakcji ze stroną

## Poza zakresem

- ~~Synteza zdaniami w trakcie generacji LLM~~ — **zmierzone i odrzucone jako zbędne:** Piper syntezuje 30 s mowy w 0,45 s, więc dzielenie na zdania oszczędziłoby ułamek sekundy kosztem ciągłości prozodii
- Czytanie na głos wypowiedzi MG i graczy, lip-sync i animowane awatary, muzyka/ambient (ankieta: poza platformą)
- STT — polecenia głosowe (etap 21), czat głosowy graczy (etap 22)

## Kryteria ukończenia

- Bot z ustawionym głosem odpowiada na czacie, a jego wypowiedź odtwarza się automatycznie u MG i u gracza w **≤ 3 s** — mierzone jako **czas do rozpoczęcia mowy**, nie do jej końca (kwestia może trwać i 20 s, to normalne). Polskie nazwy własne i liczebniki brzmią poprawnie
- Dwa boty odpowiadające po sobie mówią po kolei, nie równocześnie
- Gracz z wyciszoną mową widzi tekst i nie słyszy nic; wyłączenie mowy przez MG wycisza wszystkich
- Gateway/TTS offline: bot odpowiada tekstem, żaden błąd nie przerywa czatu ani generacji
- Zmierzone i zapisane w `ai-gateway/README.md`: VRAM TTS w spoczynku i pod obciążeniem, czas syntezy 3-zdaniowej kwestii, **łączny bilans VRAM: LLM + TTS + rezerwa pod whisper z etapu 21**
- **Bilans mieści się w karcie:** LLM + TTS + planowany whisper ≤ ~13,2 GB (16 GB minus ~2,8 GB na Windows). Jeśli pomiar pokaże brak, etap kończy się **jedną wybraną furtką** (kolejność: leniwe ładowanie TTS → zwalnianie whispera na czas syntezy → kontekst 16k / KV cache q8_0 → zatrzymywanie llama-server na czas syntezy → whisper `small` → TTS na CPU) opisaną w README i w `00-przeglad.md`

## Wskazówki techniczne

- **Zmierz, zanim zaczniesz ciąć.** Liczby sprzed pomiaru („TTS 2–3 GB", „whisper 1,5–2 GB") to górne widełki z dokumentacji, prawie na pewno zawyżone: Chatterbox to model 0.5B, a przy krótkich kwestiach szczyt zużycia jest chwilowy. Dziś wolne przy kontekście 32k to ~4,0 GB — możliwe, że wszystko zmieści się bez żadnych sztuczek. Pierwszy pomiar etapu ma to rozstrzygnąć, a tabela w `ai-gateway/README.md` — przyjąć realne wartości
- Gdyby jednak zabrakło: pamiętaj, że **te trzy modele nie muszą stać w karcie jednocześnie**. Bot mówi wtedy, gdy LLM już skończył generować, a mikrofon milczy — dlatego zwolnienie whispera (a w ostateczności llama-servera) na czas syntezy jest tańsze niż degradacja jakości głosu. Kosztem jest czas przeładowania (~1–2 s whisper, ~3,5 s model LLM) i to on decyduje, czy furtka jest opłacalna
- Piper: pakiet `piper-tts` (ONNX Runtime), głosy `.onnx` + `.onnx.json` z `rhasspy/piper-voices`; sprawdź licencję każdego głosu osobno — repo jest publiczne
- Chatterbox: wagi `ResembleAI/chatterbox` (MIT), wbudowany watermark Perth zostaw w spokoju
- **XTTS-v2 odrzucony jako domyślny:** licencja CPML jest niekomercyjna, a upstream Coqui martwy (żyje fork `idiap/coqui-ai-TTS`). Prywatnie wolno go użyć jako planu B, ale nie wpinaj go jako domyślnego silnika w publicznym repo
- Qwen3-TTS (Apache 2.0) i Kokoro odpadają — nie mają polskiego w oficjalnym zestawie języków
- Normalizuj tekst przed syntezą: liczby, skróty mechaniki (`PW`, `DV`, `1k10`), markdown, emoji — inaczej silnik przeczyta je dosłownie albo po angielsku
- Audio trzymaj na dysku, nie w bazie; wypowiedzi botów są krótkie, cache po hashu wystarcza i zeruje koszt powtórek
- Autoplay: przeglądarka zablokuje dźwięk bez wcześniejszej interakcji użytkownika — odblokuj kontekst audio przy pierwszym kliknięciu w aplikacji (ten sam problem rozwiązuje już dźwięk kości z etapu 06)
- Prompt bota a mowa: instrukcja „mów krótko, 1–4 zdania" z etapu 11 działa tu podwójnie — długie odpowiedzi to długa synteza i martwa cisza przy stole
