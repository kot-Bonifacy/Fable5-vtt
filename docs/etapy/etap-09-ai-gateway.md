# Etap 09 — AI Gateway: fundament botów

**Faza:** C — Boty MVP · **Wymaga etapów:** 03

## Cel sesji

Serwis `ai-gateway/` (Python/FastAPI) na PC z GPU: zarządza llama-server, kolejkuje żądania (jeden bot naraz), a serwer VTT umie z niego korzystać i łagodnie przeżyć jego brak.

## Zakres

- [ ] `ai-gateway/`: projekt FastAPI (zarządzanie zależnościami przez `uv`), konfiguracja w `.env` (ścieżka GGUF, port, rozmiar kontekstu)
- [ ] Uruchamianie i nadzór `llama-server` (Qwythos-9B-v2 Q8_0): start jako podproces lub obok (skrypt startowy), health-check, restart po padzie
- [ ] Endpoint `POST /chat`: przyjmuje wiadomości + parametry, przekazuje do llama-server (API OpenAI-compatible), zwraca odpowiedź ze streamingiem (SSE)
- [ ] Sterowanie blokami `think` per żądanie (parametr `reasoning: bool`) — zgodnie z ankietą: włączone tylko dla asystenta MG; upewnij się, że bloki think są odfiltrowane z odpowiedzi widocznej dla użytkownika
- [ ] Kolejka FIFO: jedno żądanie generacji naraz, pozycja w kolejce raportowana; limity czasu i max tokenów dobrane pod odpowiedź ≤ ~15 s (zmierz tokens/s i zapisz w README gatewaya)
- [ ] `GET /health`: status llama-server, długość kolejki, użycie VRAM (nvidia-smi)
- [ ] Serwer VTT: moduł `ai-client` (adres gatewaya z env — dziś localhost, po etapie 27 adres w tailnecie), health-check cykliczny, status botów w UI (dostępne/offline)
- [ ] Degradacja: gateway offline ⇒ funkcje botów wyszarzone z komunikatem, zero błędów w reszcie aplikacji
- [ ] Prosty ekran testowy dla MG („zadaj pytanie modelowi") do weryfikacji całego łańcucha

## Poza zakresem

- Profile botów (etap 10), boty na czacie sesji (etap 11), RAG i STT (etapy 18, 20)

## Kryteria ukończenia

- Pytanie po polsku z ekranu testowego wraca po polsku, streamowane, w sensownym czasie; drugi równoległy request czeka w kolejce (potwierdzone logami)
- Zabicie llama-server → gateway raportuje degradację i podnosi go z powrotem; zabicie gatewaya → VTT działa dalej, UI pokazuje boty offline, po powrocie status sam wraca
- Pomiar: tokens/s i zużycie VRAM zapisane w `ai-gateway/README.md` (decyzja nt. rezerwy pod whisper w etapie 20)

## Wskazówki techniczne

- llama-server ma własny slot-based parallelism — ustaw `--parallel 1`, kolejkę trzymaj w gatewayu (pełna kontrola, statusy dla UI)
- Dobierz rozmiar kontekstu świadomie: KV cache zjada VRAM; zacznij od 8–16k i zmierz
- Windows: llama.cpp z buildów CUDA; skrypt startowy `.ps1` lub `.bat` uruchamiający gateway + llama-server jedną komendą
- Format żądań między VTT a gatewayem zaprojektuj z polem `botId`/`purpose` już teraz — etapy 10–11 go wypełnią
