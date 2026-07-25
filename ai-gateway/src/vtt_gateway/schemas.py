"""Kontrakt HTTP między serwerem VTT a gatewayem.

Pola `bot_id` / `purpose` są tu od początku — etapy 10–11 (edytor botów, boty na
czacie) wypełnią je sensownymi wartościami, gateway już teraz loguje je i używa
do priorytetyzacji w kolejce (FIFO, ale z rozróżnieniem w statusie).
"""

from __future__ import annotations

from enum import StrEnum
from typing import Literal

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

    def wants_reasoning(self) -> bool:
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
