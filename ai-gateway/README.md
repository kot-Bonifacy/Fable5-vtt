# AI Gateway

Usługa Python 3.12 + FastAPI spinająca lokalne AI dla VTT:

- **LLM** — Qwythos-9B-v2 (GGUF Q8_0) przez `llama-server` (llama.cpp), API zgodne z OpenAI,
- **STT** — faster-whisper (polecenia głosowe),
- **RAG** — pamięć botów i wiedza z kompendium.

Uruchamiana na PC z GPU (RTX 5070 Ti), nie na VPS. Implementacja zaczyna się w **etapie 09** (`docs/etapy/etap-09-ai-gateway.md`).
