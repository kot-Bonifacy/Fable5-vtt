"""Kontrakt HTTP między serwerem VTT a gatewayem.

Pola `bot_id` / `purpose` są tu od początku — etapy 10–11 (edytor botów, boty na
czacie) wypełnią je sensownymi wartościami, gateway już teraz loguje je i używa
do priorytetyzacji w kolejce (FIFO, ale z rozróżnieniem w statusie).
"""

from __future__ import annotations

from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, Field


class Purpose(StrEnum):
    """Do czego służy żądanie — wpływa na domyślne ustawienia (np. reasoning)."""

    NPC = "npc"
    """Bot NPC odzywający się na czacie — priorytet na czas odpowiedzi."""
    GM_ASSISTANT = "gm_assistant"
    """Asystent MG — jedyny przypadek, w którym domyślnie włączamy bloki think."""
    TEST = "test"
    """Ekran testowy MG / diagnostyka."""


class Message(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    messages: list[Message] = Field(min_length=1)
    bot_id: str | None = None
    purpose: Purpose = Purpose.TEST
    # None = domyślne dla purpose (gm_assistant → True, reszta → False).
    reasoning: bool | None = None
    max_tokens: int | None = None
    temperature: float | None = None
    top_p: float | None = None
    top_k: int | None = None
    stop: list[str] | None = None
    # Ziarno dla powtarzalności w testach; None = losowe.
    seed: int | None = None
    # Etap 20a: structured output. Schemat JSON, do którego llama.cpp kompiluje
    # gramatykę GBNF — model fizycznie nie może wypisać niczego innego. Używa go
    # przebieg decyzyjny bota (maszyna-do-maszyny); wypowiedzi NPC-ów jadą dalej
    # swobodnym tekstem, bo gramatyka psuje polszczyznę i wyklucza streaming
    # zdaniami, na którym stoi TTS z etapu 12.
    json_schema: dict[str, Any] | None = None

    def wants_reasoning(self) -> bool:
        # Gramatyka i rozumowanie wykluczają się u nas z jednego powodu: budżet
        # think jest w llama-server nieegzekwowalny (patrz `build_payload`), więc
        # model potrafi przemyśleć cały `max_tokens` i oddać pustą odpowiedź —
        # a pusta odpowiedź w przebiegu decyzyjnym to akcja, której nie ma.
        if self.json_schema is not None:
            return False
        if self.reasoning is not None:
            return self.reasoning
        return self.purpose is Purpose.GM_ASSISTANT


class LlamaStatus(StrEnum):
    STARTING = "starting"
    READY = "ready"
    UNHEALTHY = "unhealthy"
    STOPPED = "stopped"
    EXTERNAL = "external"
    """Gateway nie zarządza procesem — wskazuje na llama-server uruchomiony osobno."""


class GpuInfo(BaseModel):
    name: str
    memory_total_mb: int
    memory_used_mb: int


class TtsStatusInfo(BaseModel):
    """Stan silnika mowy. Serwer VTT pokazuje całość wyłącznie MG."""

    engine: str
    device: str
    available: bool
    loaded: bool
    queue_length: int = 0
    busy: bool = False
    voices: int = 0
    syntheses: int = 0
    last_synth_ms: int | None = None
    vram_mb: int | None = None


class RagHealthInfo(BaseModel):
    """Skrót stanu RAG w `/health` — pełny obraz daje `GET /rag/status`.

    `ready` to jedyne pole, którego potrzebuje UI, żeby zdecydować, czy pytanie o
    zasady ma sens: silnik działa, indeks istnieje i zbudowano go tym modelem.
    """

    enabled: bool = False
    ready: bool = False
    model: str | None = None
    device: str = "cpu"
    loaded: bool = False
    chunks: int = 0
    indexing: bool = False
    reason: str | None = None


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    llama: LlamaStatus
    model: str | None = None
    context_size: int | None = None
    queue_length: int = 0
    busy: bool = False
    managed: bool = False
    restarts: int = 0
    last_error: str | None = None
    gpu: GpuInfo | None = None
    tts: TtsStatusInfo | None = None
    rag: RagHealthInfo | None = None


class ChatUsage(BaseModel):
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    generation_ms: int | None = None
    tokens_per_second: float | None = None


class TokenizeRequest(BaseModel):
    """Pomiar długości tekstu tokenizerem modelu (budżet kontekstu botów)."""

    text: str


class TokenizeResponse(BaseModel):
    count: int
    context_size: int | None = None


class TtsRequest(BaseModel):
    """Synteza jednej wypowiedzi bota."""

    text: str = Field(min_length=1)
    voice: str = ""
    speed: float = 1.0
    pitch: float = 1.0
    expressiveness: float = 0.5
    speaker_id: int | None = None
    # Klonowanie głosu: `reference_id` to hash próbki. Gateway trzyma ją u siebie,
    # więc serwer VTT dosyła `reference_audio_base64` tylko przy pierwszym użyciu
    # (albo po restarcie gatewaya, gdy dostanie z powrotem 409).
    reference_id: str | None = None
    reference_audio_base64: str | None = None
    bot_id: str | None = None


class RevealPointInfo(BaseModel):
    """„W tej milisekundzie widocznych jest tyle pierwszych znaków wypowiedzi”."""

    ms: int
    chars: int


class TtsResponse(BaseModel):
    audio_base64: str
    format: Literal["wav"] = "wav"
    sample_rate: int
    duration_ms: int
    reveal: list[RevealPointInfo] = Field(default_factory=list)
    engine: str
    voice: str
    synth_ms: int = 0
    spoken_text: str = ""


class VoiceInfoResponse(BaseModel):
    id: str
    name: str
    engine: str
    sample_rate: int | None = None
    quality: str | None = None
    clonable: bool = False


class VoicesResponse(BaseModel):
    engine: str
    available: bool
    voices: list[VoiceInfoResponse] = Field(default_factory=list)


# --- RAG (etap 19a) ---------------------------------------------------------


class RagSearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    collection: str = "rulebook"
    # Etap 19c: bot czyta bazę wiedzy i dziennik naraz. Kilka kolekcji w jednym
    # zapytaniu, a nie kilka zapytań — inaczej trzeba by scalać dwa rankingi RRF,
    # których pozycje nie znaczą tego samego. Puste = sama `collection`.
    collections: list[str] = Field(default_factory=list, max_length=8)
    top_k: int | None = Field(default=None, ge=1, le=20)
    # Uprawnienia wołającego (etap 19b). Pusta lista = bez ograniczeń w tym
    # wymiarze — tak wygląda pytanie MG o zasady.
    tags: list[str] = Field(default_factory=list, max_length=32)
    visibility: list[str] = Field(default_factory=list, max_length=8)


class RagHit(BaseModel):
    """Jeden fragment materiału. `chapter`/`section`/`page` niosą cytat —
    bez nich odpowiedź asystenta byłaby niesprawdzalna."""

    chunk_id: int
    text: str
    source: str
    title: str = ""
    chapter: str = ""
    section: str = ""
    page: int | None = None
    page_end: int | None = None
    tokens: int = 0
    score: float = 0.0
    dense_rank: int | None = None
    fts_rank: int | None = None


class RagSearchResponse(BaseModel):
    collection: str
    query: str
    hits: list[RagHit] = Field(default_factory=list)
    took_ms: int = 0


class RagIndexDocument(BaseModel):
    source: str = Field(min_length=1, max_length=300)
    text: str = Field(min_length=1)
    title: str = ""
    format: Literal["markdown", "text"] = "markdown"
    # Filtry uprawnień zapisywane razem z fragmentami (etap 19b).
    tags: list[str] = Field(default_factory=list, max_length=32)
    visibility: str = Field(default="", max_length=32)
    meta: dict[str, str] = Field(default_factory=dict)


class RagIndexRequest(BaseModel):
    collection: str = Field(min_length=1, max_length=64)
    documents: list[RagIndexDocument] = Field(min_length=1)


class RagForgetRequest(BaseModel):
    """Skasowanie pojedynczych dokumentów — wpis usunięty w edytorze MG."""

    collection: str = Field(min_length=1, max_length=64)
    sources: list[str] = Field(min_length=1, max_length=500)


class RagIndexResponse(BaseModel):
    collection: str
    documents: int
    chunks: int
    duration_ms: int | None = None
    error: str | None = None


class RagCollectionInfo(BaseModel):
    name: str
    documents: int
    chunks: int
    tokens: int
    indexed_at: str | None = None


class RagIndexingInfo(BaseModel):
    running: bool = False
    collection: str | None = None
    done: int = 0
    total: int = 0
    chunks: int = 0
    error: str | None = None
    finished_at: str | None = None
    duration_ms: int | None = None


class RagStatusResponse(BaseModel):
    enabled: bool
    reason: str | None = None
    model: str | None = None
    dim: int | None = None
    device: str = "cpu"
    loaded: bool = False
    load_ms: int | None = None
    last_error: str | None = None
    indexed_model: str | None = None
    model_mismatch: bool = False
    collections: list[RagCollectionInfo] = Field(default_factory=list)
    indexing: RagIndexingInfo = Field(default_factory=RagIndexingInfo)
