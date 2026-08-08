"""Konfiguracja gatewaya — wszystko przez zmienne środowiskowe / plik .env."""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="GATEWAY_",
        extra="ignore",
    )

    # --- gateway ---
    host: str = "127.0.0.1"
    port: int = 8100
    # Klucz wymagany w nagłówku X-API-Key. Pusty = brak autoryzacji (tylko dev na localhost).
    api_key: str = ""
    log_level: str = "INFO"

    # --- llama-server ---
    # Pusta ścieżka binarki = gateway nie zarządza procesem, tylko łączy się z llama_url.
    llama_binary: Path | None = None
    llama_model: Path | None = None
    llama_url: str = "http://127.0.0.1:8080"
    # 32k mieści się w 16 GB VRAM razem z rezerwą na whisper — pomiary w README.
    llama_ctx_size: int = 32768
    llama_gpu_layers: int = 999
    llama_flash_attn: bool = True
    # Dodatkowe argumenty llama-server, rozdzielone spacją (np. "--cache-type-k q8_0").
    llama_extra_args: str = ""
    # Ile sekund czekać na wstanie llama-server po starcie/restarcie.
    llama_startup_timeout: float = 180.0
    # Co ile sekund odpytywać llama-server o zdrowie.
    health_interval: float = 5.0
    # Po ilu nieudanych health-checkach uznajemy proces za martwy i restartujemy.
    health_failures_before_restart: int = 3

    # --- generacja ---
    default_max_tokens: int = 512
    # Rozumowanie zjada ten sam budżet co odpowiedź, więc żądania z think dostają
    # wyższy limit — inaczej model „przemyśli" całą pulę i odda pustą odpowiedź.
    reasoning_max_tokens: int = 1536
    # Twardy limit tokenów samego bloku think (llama.cpp domyka go po jego przekroczeniu).
    reasoning_budget: int = 640
    default_temperature: float = 0.6
    default_top_p: float = 0.95
    default_top_k: int = 20
    # Twardy limit czasu pojedynczej generacji (sekundy).
    generation_timeout: float = 120.0
    # Ile żądań może czekać w kolejce zanim gateway zacznie odrzucać (503).
    max_queue_length: int = 16

    # --- TTS (głos botów) ---
    # piper | chatterbox | none. Piper wybrany po pomiarach etapu 12: 0 GB VRAM,
    # synteza ~50x szybsza niż realtime i alignment fonemów (rytm ujawniania tekstu).
    tts_engine: str = "piper"
    # cpu | cuda — dotyczy tylko silników, które w ogóle mogą pójść na GPU.
    tts_device: str = "cpu"
    tts_voices_dir: Path = Path("C:/AI/tts/piper-voices")
    tts_default_voice: str = "pl_PL-darkman-medium"
    # Katalog na próbki głosu do klonowania (przysyłane przez serwer VTT).
    tts_samples_dir: Path = Path("C:/AI/tts/voice-samples")
    # Po ilu sekundach bezczynności zwolnić model. 0 = trzymaj w pamięci.
    tts_idle_unload_s: float = 600.0
    # Twardy limit długości pojedynczej wypowiedzi (znaki).
    tts_max_chars: int = 1200
    tts_timeout: float = 60.0
    tts_max_queue_length: int = 8

    # --- RAG (pamięć długoterminowa, etap 19a) ---
    rag_enabled: bool = True
    # bge-m3 | multilingual-e5-large. Wybór zapadł pomiarem, nie z dokumentacji:
    # na 10 polskich pytaniach o zasady bge-m3 daje 10/10 trafień w top-5, e5 — 9/10.
    # Pełna tabela w README („Pomiary RAG").
    rag_model: str = "bge-m3"
    # Embeddingi liczą się na CPU: 0 GB VRAM, bo rezerwa karty jest przypisana
    # whisperowi z etapu 21. Decyzja MG z 08.08 — uzasadnienie w opisie etapu 19a.
    # 0 = domyślna liczba wątków onnxruntime.
    rag_threads: int = 0
    rag_batch_size: int = 8
    # Baza wektorowa jest pochodną materiału źródłowego — nie backupujemy jej.
    rag_db_path: Path = Path("C:/AI/vtt-rag/rag.sqlite3")
    # Pusty = domyślny cache HuggingFace (~/.cache/huggingface).
    rag_cache_dir: Path | None = None
    # Ścieżka względna wobec katalogu ai-gateway (stamtąd startuje skrypt).
    rag_rulebook_dir: Path = Path("../data/private/rulebook/manual/CPRED-podrecznik")
    # Zrzuty PDF-a (etap 19b) — płaski tekst bez nagłówków, cytowany jako „tytuł, s. N".
    rag_text_dir: Path = Path("../data/private/rulebook/text")
    # `plik.txt|Tytuł`, rozdzielone przecinkami. Domyślnie tylko materiały polskie:
    # angielskie DLC przebijają polskie akapity w wyszukiwaniu pełnotekstowym
    # (decyzja MG z 08.08), a karta postaci to formularz bez treści zasad.
    rag_text_files: str = (
        "CPRED-FAQ_1.txt|Cyberpunk RED FAQ,"
        "CPRED-DLC_01_Stara-giwera.txt|DLC: Stara giwera nigdy nie umiera,"
        "CPRED-DLC_02_Czerwony-chrom.txt|DLC: Czerwony chrom"
    )
    # Fragmenty 300–600 tokenów z zakładką — liczone tokenizerem modelu, nie na oko.
    rag_chunk_tokens: int = 420
    rag_chunk_overlap: int = 60
    rag_top_k: int = 5
    # Wagi fuzji RRF. Semantyka prowadzi, pełny tekst dokłada nazwy własne zasad.
    # 0,3 zmierzone: przy 0,15 znika trafienie, które daje tylko pełny tekst
    # (9/10), a przy 0,7 trafień jest tyle samo co przy 0,3, ale właściwy fragment
    # ląduje niżej w prompcie (MRR 0,595 vs 0,770).
    rag_dense_weight: float = 1.0
    rag_keyword_weight: float = 0.3

    @property
    def manages_llama(self) -> bool:
        """Czy gateway sam uruchamia llama-server."""
        return self.llama_binary is not None and self.llama_model is not None

    @property
    def rag_text_sources(self) -> list[tuple[str, str]]:
        """`rag_text_files` rozłożone na pary (plik, tytuł do cytatu)."""
        sources: list[tuple[str, str]] = []
        for item in self.rag_text_files.split(","):
            entry = item.strip()
            if not entry:
                continue
            name, _, title = entry.partition("|")
            sources.append((name.strip(), title.strip() or Path(name.strip()).stem))
        return sources


def load_settings() -> Settings:
    return Settings()
