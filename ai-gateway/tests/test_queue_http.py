"""Kryterium etapu 09: drugie równoległe żądanie czeka w kolejce, nie zwiera modelu.

Testy jadą przez prawdziwy serwer uvicorn na losowym porcie — `httpx.ASGITransport`
zbiera całą odpowiedź przed jej zwróceniem, więc na nim nie da się sprawdzić SSE
w trakcie generacji.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
import uvicorn
from fastapi import FastAPI

from tests.test_app import _settings
from vtt_gateway.app import create_app


class HeldStream(httpx.AsyncByteStream):
    """Strumień, który zatrzymuje się w połowie, dopóki test go nie zwolni."""

    def __init__(self, release: asyncio.Event, started: asyncio.Event) -> None:
        self._release = release
        self._started = started

    async def __aiter__(self):
        yield b'data: {"choices":[{"delta":{"content":"pierwsza "}}]}\n\n'
        self._started.set()
        await self._release.wait()
        yield b'data: {"choices":[{"delta":{"content":"odpowiedz"}}]}\n\n'
        yield b"data: [DONE]\n\n"


@asynccontextmanager
async def running(app: FastAPI) -> AsyncIterator[str]:
    config = uvicorn.Config(app, host="127.0.0.1", port=0, log_level="warning")
    server = uvicorn.Server(config)
    task = asyncio.create_task(server.serve())
    try:
        for _ in range(200):
            if server.started:
                break
            await asyncio.sleep(0.02)
        else:  # pragma: no cover
            raise RuntimeError("uvicorn nie wystartował")
        port = server.servers[0].sockets[0].getsockname()[1]
        yield f"http://127.0.0.1:{port}"
    finally:
        server.should_exit = True
        await asyncio.wait_for(task, timeout=10)


async def _read_events(response: httpx.Response, sink: list[tuple[str, dict]]) -> None:
    name: str | None = None
    async for line in response.aiter_lines():
        if line.startswith("event: "):
            name = line[7:]
        elif line.startswith("data: ") and name is not None:
            sink.append((name, json.loads(line[6:])))
            name = None


async def _wait_for(condition, timeout: float = 5.0) -> None:
    deadline = asyncio.get_running_loop().time() + timeout
    while asyncio.get_running_loop().time() < deadline:
        if condition():
            return
        await asyncio.sleep(0.02)
    raise AssertionError("warunek nie został spełniony w zadanym czasie")


async def _wait_until_ready(client: httpx.AsyncClient) -> None:
    """Czeka, aż supervisor zaliczy pierwszy health-check podstawionego llama-server."""

    async def ready() -> bool:
        return (await client.get("/health")).json()["status"] == "ok"

    deadline = asyncio.get_running_loop().time() + 5
    while asyncio.get_running_loop().time() < deadline:
        if await ready():
            return
        await asyncio.sleep(0.05)
    raise AssertionError("gateway nie zgłosił gotowości")


def _build_app(handler) -> FastAPI:
    return create_app(
        _settings(),
        client_factory=lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    )


async def test_second_request_waits_for_the_first():
    release = asyncio.Event()
    first_started = asyncio.Event()
    generations = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal generations
        if request.url.path == "/health":
            return httpx.Response(200, json={"status": "ok"})
        if request.url.path == "/props":
            return httpx.Response(200, json={"model_path": "test.gguf", "n_ctx": 8192})
        generations += 1
        return httpx.Response(
            200,
            stream=HeldStream(release, first_started),
            headers={"content-type": "text/event-stream"},
        )

    async with running(_build_app(handler)) as base_url:
        async with httpx.AsyncClient(base_url=base_url, timeout=15) as client:
            await _wait_until_ready(client)
            body = {"messages": [{"role": "user", "content": "Cześć"}], "purpose": "npc"}

            first_events: list[tuple[str, dict]] = []
            second_events: list[tuple[str, dict]] = []

            async with client.stream("POST", "/chat", json=body) as first:
                assert first.status_code == 200
                first_reader = asyncio.create_task(_read_events(first, first_events))
                await asyncio.wait_for(first_started.wait(), timeout=5)

                async with client.stream("POST", "/chat", json=body) as second:
                    second_reader = asyncio.create_task(_read_events(second, second_events))
                    await _wait_for(lambda: bool(second_events))

                    assert second_events[0] == ("queue", {"position": 1})
                    assert generations == 1, (
                        "drugie żądanie nie może ruszyć przed zwolnieniem slotu"
                    )

                    health = (await client.get("/health")).json()
                    assert health["busy"] is True
                    assert health["queue_length"] == 1

                    release.set()
                    await asyncio.wait_for(first_reader, timeout=10)
                    await asyncio.wait_for(second_reader, timeout=10)

    assert generations == 2, "po zwolnieniu slotu drugie żądanie trafia do modelu"
    assert [name for name, _ in second_events][:2] == ["queue", "start"]
    assert "done" in [name for name, _ in second_events]
    first_text = "".join(data["text"] for name, data in first_events if name == "delta")
    assert first_text == "pierwsza odpowiedz"


async def test_health_answers_while_model_is_generating():
    """Health-check nie może blokować się za kolejką — UI odpytuje go w trakcie generacji."""
    release = asyncio.Event()
    started = asyncio.Event()

    async def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/health":
            return httpx.Response(200, json={"status": "ok"})
        if request.url.path == "/props":
            return httpx.Response(200, json={"model_path": "test.gguf", "n_ctx": 8192})
        return httpx.Response(
            200,
            stream=HeldStream(release, started),
            headers={"content-type": "text/event-stream"},
        )

    async with running(_build_app(handler)) as base_url:
        async with httpx.AsyncClient(base_url=base_url, timeout=15) as client:
            await _wait_until_ready(client)
            body = {"messages": [{"role": "user", "content": "Cześć"}], "purpose": "npc"}
            events: list[tuple[str, dict]] = []
            async with client.stream("POST", "/chat", json=body) as response:
                reader = asyncio.create_task(_read_events(response, events))
                await asyncio.wait_for(started.wait(), timeout=5)

                health = await asyncio.wait_for(client.get("/health"), timeout=3)
                assert health.json()["status"] == "ok"
                assert health.json()["busy"] is True

                release.set()
                await asyncio.wait_for(reader, timeout=10)
