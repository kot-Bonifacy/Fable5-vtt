"""Testy dymne gatewaya na podstawionym llama-server (httpx.MockTransport)."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator

import httpx
import pytest
from asgi_lifespan import LifespanManager

from vtt_gateway.app import create_app
from vtt_gateway.config import Settings


def _settings(**overrides) -> Settings:
    base = {
        "llama_url": "http://llama.test",
        "llama_binary": None,
        "llama_model": None,
        "health_interval": 0.05,
        "api_key": "",
        # Testy, które nie dotyczą RAG, nie mają zakładać bazy wektorowej na
        # prawdziwej ścieżce z konfiguracji.
        "rag_enabled": False,
    }
    base.update(overrides)
    return Settings(**base)


def _sse_body(chunks: list[dict]) -> bytes:
    lines = [f"data: {json.dumps(chunk)}\n\n" for chunk in chunks]
    lines.append("data: [DONE]\n\n")
    return "".join(lines).encode()


def _delta(content: str | None = None, reasoning: str | None = None) -> dict:
    delta: dict[str, str] = {}
    if content is not None:
        delta["content"] = content
    if reasoning is not None:
        delta["reasoning_content"] = reasoning
    return {"choices": [{"delta": delta}]}


class FakeLlama:
    """Minimalny llama-server: /health, /props, /v1/chat/completions."""

    def __init__(self, *, healthy: bool = True) -> None:
        self.healthy = healthy
        self.requests: list[dict] = []
        self.chunks: list[dict] = [
            _delta(reasoning="zastanawiam się "),
            _delta(reasoning="nad odpowiedzią"),
            _delta(content="Cześć, "),
            _delta(content="tu Vex."),
            {"choices": [], "usage": {"prompt_tokens": 12, "completion_tokens": 4}},
        ]

    def handler(self, request: httpx.Request) -> httpx.Response:
        if request.url.path == "/health":
            if not self.healthy:
                return httpx.Response(503, json={"error": "loading model"})
            return httpx.Response(200, json={"status": "ok"})
        if request.url.path == "/props":
            return httpx.Response(
                200,
                json={"model_path": "C:/models/Qwythos-9B-v2-Q8_0.gguf", "n_ctx": 16384},
            )
        if request.url.path == "/tokenize":
            content = json.loads(request.content).get("content", "")
            # llama-server oddaje listę identyfikatorów tokenów; do pomiaru
            # długości liczy się tylko jej rozmiar.
            return httpx.Response(200, json={"tokens": list(range(len(content.split())))})
        if request.url.path == "/v1/chat/completions":
            self.requests.append(json.loads(request.content))
            return httpx.Response(
                200,
                content=_sse_body(self.chunks),
                headers={"content-type": "text/event-stream"},
            )
        return httpx.Response(404)


async def _client(app) -> AsyncIterator[httpx.AsyncClient]:
    async with LifespanManager(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://gateway.test") as c:
            yield c


async def _wait_for_ready(client: httpx.AsyncClient, attempts: int = 40) -> dict:
    import asyncio

    payload: dict = {}
    for _ in range(attempts):
        payload = (await client.get("/health")).json()
        if payload["llama"] != "stopped" and payload["status"] == "ok":
            return payload
        await asyncio.sleep(0.05)
    return payload


def _parse_sse(text: str) -> list[tuple[str, dict]]:
    events: list[tuple[str, dict]] = []
    for block in text.strip().split("\n\n"):
        name = data = None
        for line in block.splitlines():
            if line.startswith("event: "):
                name = line[7:]
            elif line.startswith("data: "):
                data = json.loads(line[6:])
        if name is not None:
            events.append((name, data or {}))
    return events


async def test_health_reports_external_llama_and_gpu_shape():
    fake = FakeLlama()
    app = create_app(
        _settings(),
        client_factory=lambda: httpx.AsyncClient(transport=httpx.MockTransport(fake.handler)),
    )
    async for client in _client(app):
        payload = await _wait_for_ready(client)
        assert payload["status"] == "ok"
        assert payload["llama"] == "external"
        assert payload["model"] == "Qwythos-9B-v2-Q8_0.gguf"
        assert payload["context_size"] == 16384
        assert payload["managed"] is False
        assert payload["queue_length"] == 0


async def test_chat_streams_content_and_hides_thinking_from_npc():
    fake = FakeLlama()
    app = create_app(
        _settings(),
        client_factory=lambda: httpx.AsyncClient(transport=httpx.MockTransport(fake.handler)),
    )
    async for client in _client(app):
        await _wait_for_ready(client)
        response = await client.post(
            "/chat",
            json={
                "messages": [{"role": "user", "content": "Cześć"}],
                "bot_id": "vex",
                "purpose": "npc",
            },
        )
        assert response.status_code == 200
        events = _parse_sse(response.text)
        kinds = [name for name, _ in events]

        assert "think" not in kinds, "rozumowanie nie może wyciec do bota NPC"
        text = "".join(data["text"] for name, data in events if name == "delta")
        assert text == "Cześć, tu Vex."
        done = next(data for name, data in events if name == "done")
        assert done["usage"]["completion_tokens"] == 4

        sent = fake.requests[-1]
        assert sent["reasoning_budget"] == 0
        assert sent["chat_template_kwargs"] == {"enable_thinking": False}


async def test_gm_assistant_receives_thinking():
    fake = FakeLlama()
    app = create_app(
        _settings(),
        client_factory=lambda: httpx.AsyncClient(transport=httpx.MockTransport(fake.handler)),
    )
    async for client in _client(app):
        await _wait_for_ready(client)
        response = await client.post(
            "/chat",
            json={
                "messages": [{"role": "user", "content": "Jaka jest DV skoku?"}],
                "purpose": "gm_assistant",
            },
        )
        events = _parse_sse(response.text)
        thinking = "".join(data["text"] for name, data in events if name == "think")
        assert thinking == "zastanawiam się nad odpowiedzią"

        sent = fake.requests[-1]
        # Rozumowanie dostaje własny budżet i wyższy limit odpowiedzi — inaczej
        # model przemyśla całą pulę tokenów i zwraca pustą treść.
        assert sent["reasoning_budget"] > 0
        assert sent["max_tokens"] == 1536
        assert "chat_template_kwargs" not in sent


async def test_chat_refuses_when_llama_is_down():
    fake = FakeLlama(healthy=False)
    app = create_app(
        _settings(),
        client_factory=lambda: httpx.AsyncClient(transport=httpx.MockTransport(fake.handler)),
    )
    async for client in _client(app):
        health = (await client.get("/health")).json()
        assert health["status"] == "degraded"

        response = await client.post(
            "/chat",
            json={"messages": [{"role": "user", "content": "Cześć"}], "purpose": "npc"},
        )
        assert response.status_code == 503
        assert "niedostępny" in response.json()["detail"]


async def test_api_key_is_enforced():
    fake = FakeLlama()
    app = create_app(
        _settings(api_key="sekret"),
        client_factory=lambda: httpx.AsyncClient(transport=httpx.MockTransport(fake.handler)),
    )
    async for client in _client(app):
        await _wait_for_ready(client)
        body = {"messages": [{"role": "user", "content": "Cześć"}], "purpose": "npc"}

        assert (await client.post("/chat", json=body)).status_code == 401
        ok = await client.post("/chat", json=body, headers={"X-API-Key": "sekret"})
        assert ok.status_code == 200
        # /health zostaje bez klucza — serwer VTT odpytuje go cyklicznie do statusu botów.
        assert (await client.get("/health")).status_code == 200


async def test_tokenize_measures_text_with_the_model_tokenizer():
    fake = FakeLlama()
    app = create_app(
        _settings(),
        client_factory=lambda: httpx.AsyncClient(transport=httpx.MockTransport(fake.handler)),
    )
    async for client in _client(app):
        await _wait_for_ready(client)
        response = await client.post("/tokenize", json={"text": "Czas to eddiesy skarbie"})
        assert response.status_code == 200
        payload = response.json()
        assert payload["count"] == 4
        # Serwer VTT liczy z tego budżet kontekstu — okno musi przyjechać razem.
        assert payload["context_size"] == 16384

        empty = await client.post("/tokenize", json={"text": ""})
        assert empty.json()["count"] == 0


async def test_tokenize_refuses_when_llama_is_down():
    fake = FakeLlama(healthy=False)
    app = create_app(
        _settings(),
        client_factory=lambda: httpx.AsyncClient(transport=httpx.MockTransport(fake.handler)),
    )
    async for client in _client(app):
        # 503, nie 500: serwer VTT ma wtedy oszacować długość po znakach i mimo
        # wszystko wypuścić wypowiedź bota.
        response = await client.post("/tokenize", json={"text": "cokolwiek"})
        assert response.status_code == 503


@pytest.mark.parametrize("purpose", ["npc", "test"])
async def test_reasoning_flag_overrides_purpose_default(purpose: str):
    fake = FakeLlama()
    app = create_app(
        _settings(),
        client_factory=lambda: httpx.AsyncClient(transport=httpx.MockTransport(fake.handler)),
    )
    async for client in _client(app):
        await _wait_for_ready(client)
        response = await client.post(
            "/chat",
            json={
                "messages": [{"role": "user", "content": "Cześć"}],
                "purpose": purpose,
                "reasoning": True,
            },
        )
        events = _parse_sse(response.text)
        assert any(name == "think" for name, _ in events)
