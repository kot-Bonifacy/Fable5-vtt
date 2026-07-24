"""Klient llama-server (API zgodne z OpenAI).

Streaming zwraca zdarzenia w jednej z trzech postaci:
- ("think", tekst)  — fragment bloku rozumowania (tylko gdy żądanie o niego prosiło),
- ("delta", tekst)  — fragment właściwej odpowiedzi,
- ("usage", dane)   — statystyki na koniec.

Rozdzielenie think/content robi sam llama-server (`--reasoning-format deepseek`
wystawia rozumowanie w `reasoning_content`), dzięki czemu tekst dla użytkownika
nigdy nie zawiera bloków `<think>` — nie wycinamy ich regexem po fakcie.
"""

from __future__ import annotations

import json
import logging
import time
from collections.abc import AsyncIterator
from typing import Any

import httpx

from .config import Settings
from .schemas import ChatRequest

log = logging.getLogger(__name__)

StreamEvent = tuple[str, Any]


class LlamaError(RuntimeError):
    pass


def build_payload(request: ChatRequest, settings: Settings) -> dict[str, Any]:
    reasoning = request.wants_reasoning()
    default_max_tokens = settings.reasoning_max_tokens if reasoning else settings.default_max_tokens
    payload: dict[str, Any] = {
        "messages": [message.model_dump() for message in request.messages],
        "max_tokens": request.max_tokens or default_max_tokens,
        "temperature": (
            request.temperature if request.temperature is not None else settings.default_temperature
        ),
        "top_p": request.top_p if request.top_p is not None else settings.default_top_p,
        "top_k": request.top_k if request.top_k is not None else settings.default_top_k,
        "stream": True,
        "stream_options": {"include_usage": True},
        # Bez tego llama-server nie wyliczy `timings` w ostatniej porcji streamu.
        "timings_per_token": True,
    }
    if request.stop:
        payload["stop"] = request.stop
    if request.seed is not None:
        payload["seed"] = request.seed
    if not reasoning:
        # Dwa niezależne mechanizmy, bo modele różnie reagują:
        # 1) budżet 0 — llama.cpp natychmiast zamyka blok think,
        # 2) enable_thinking — flaga szablonu czatu Qwen.
        payload["reasoning_budget"] = 0
        payload["chat_template_kwargs"] = {"enable_thinking": False}
    else:
        # Bez ograniczenia model potrafi przemyśleć cały limit tokenów i oddać
        # pustą odpowiedź — budżet gwarantuje, że coś zostanie na treść.
        payload["reasoning_budget"] = settings.reasoning_budget
    return payload


async def stream_chat(
    client: httpx.AsyncClient,
    settings: Settings,
    request: ChatRequest,
) -> AsyncIterator[StreamEvent]:
    payload = build_payload(request, settings)
    url = f"{settings.llama_url}/v1/chat/completions"
    started = time.monotonic()
    completion_tokens = 0
    usage: dict[str, Any] = {}

    async with client.stream(
        "POST",
        url,
        json=payload,
        timeout=httpx.Timeout(settings.generation_timeout, connect=10.0),
    ) as response:
        if response.status_code != 200:
            body = (await response.aread()).decode("utf-8", errors="replace")
            raise LlamaError(f"llama-server HTTP {response.status_code}: {body[:500]}")

        async for line in response.aiter_lines():
            if not line.startswith("data:"):
                continue
            data = line[5:].strip()
            if not data or data == "[DONE]":
                continue
            try:
                chunk = json.loads(data)
            except json.JSONDecodeError:
                log.warning("nieparsowalna porcja streamu: %r", data[:200])
                continue

            for choice in chunk.get("choices") or []:
                delta = choice.get("delta") or {}
                thinking = delta.get("reasoning_content")
                if thinking:
                    yield "think", thinking
                content = delta.get("content")
                if content:
                    completion_tokens += 1
                    yield "delta", content

            chunk_usage = chunk.get("usage")
            if isinstance(chunk_usage, dict):
                usage = chunk_usage
            timings = chunk.get("timings")
            if isinstance(timings, dict):
                usage.setdefault("timings", timings)

    elapsed_ms = int((time.monotonic() - started) * 1000)
    completion = usage.get("completion_tokens") or completion_tokens
    timings = usage.get("timings") or {}
    tokens_per_second = timings.get("predicted_per_second")
    if tokens_per_second is None and elapsed_ms > 0 and completion:
        tokens_per_second = completion * 1000 / elapsed_ms
    yield (
        "usage",
        {
            "prompt_tokens": usage.get("prompt_tokens"),
            "completion_tokens": completion,
            "generation_ms": elapsed_ms,
            "tokens_per_second": round(tokens_per_second, 2) if tokens_per_second else None,
        },
    )
