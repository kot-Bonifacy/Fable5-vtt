"""Aplikacja FastAPI gatewaya."""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from typing import Any

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import StreamingResponse

from .config import Settings, load_settings
from .gpu import read_gpu_info
from .llama_client import LlamaError, count_tokens, stream_chat
from .queue import QueueFull, RequestQueue
from .schemas import (
    ChatRequest,
    HealthResponse,
    LlamaStatus,
    TokenizeRequest,
    TokenizeResponse,
)
from .supervisor import LlamaSupervisor

log = logging.getLogger(__name__)


def create_app(
    settings: Settings | None = None,
    client_factory: Callable[[], httpx.AsyncClient] | None = None,
) -> FastAPI:
    """`client_factory` pozwala testom podstawić transport zamiast prawdziwego llama-server."""
    settings = settings or load_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        client = client_factory() if client_factory else httpx.AsyncClient()
        supervisor = LlamaSupervisor(settings, client)
        app.state.settings = settings
        app.state.client = client
        app.state.supervisor = supervisor
        app.state.queue = RequestQueue(settings.max_queue_length)
        await supervisor.start()
        try:
            yield
        finally:
            await supervisor.stop()
            await client.aclose()

    app = FastAPI(title="VTT AI Gateway", version="0.1.0", lifespan=lifespan)

    async def require_api_key(x_api_key: str | None = Header(default=None)) -> None:
        if settings.api_key and x_api_key != settings.api_key:
            raise HTTPException(status_code=401, detail="Nieprawidłowy klucz API")

    @app.get("/health", response_model=HealthResponse)
    async def health(request: Request) -> HealthResponse:
        supervisor: LlamaSupervisor = request.app.state.supervisor
        queue: RequestQueue = request.app.state.queue
        return HealthResponse(
            status="ok" if supervisor.is_ready else "degraded",
            llama=supervisor.status,
            model=supervisor.model_name,
            context_size=supervisor.context_size,
            queue_length=queue.length,
            busy=queue.busy,
            managed=settings.manages_llama,
            restarts=supervisor.restarts,
            last_error=supervisor.last_error,
            gpu=await read_gpu_info(),
        )

    @app.post("/chat", dependencies=[Depends(require_api_key)])
    async def chat(request: Request, body: ChatRequest) -> StreamingResponse:
        supervisor: LlamaSupervisor = request.app.state.supervisor
        queue: RequestQueue = request.app.state.queue
        client: httpx.AsyncClient = request.app.state.client

        if not supervisor.is_ready:
            raise HTTPException(
                status_code=503,
                detail=f"Model niedostępny (status: {supervisor.status.value})",
            )
        try:
            ticket = queue.enqueue(body.bot_id or body.purpose.value)
        except QueueFull as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

        async def event_stream() -> AsyncIterator[bytes]:
            reasoning = body.wants_reasoning()
            try:
                async for position in ticket.positions():
                    yield _sse("queue", {"position": position})
                    if await request.is_disconnected():
                        return

                yield _sse("start", {"reasoning": reasoning})
                async for kind, data in stream_chat(client, settings, body):
                    if kind == "think":
                        # Rozumowanie wysyłamy tylko wtedy, gdy żądanie o nie prosiło —
                        # dla botów NPC nie może przeciec do UI ani do historii czatu.
                        if reasoning:
                            yield _sse("think", {"text": data})
                    elif kind == "delta":
                        yield _sse("delta", {"text": data})
                    elif kind == "usage":
                        yield _sse("done", {"usage": data})
            except LlamaError as exc:
                log.warning("błąd generacji (bot=%s): %s", body.bot_id, exc)
                yield _sse("error", {"message": str(exc)})
            except httpx.HTTPError as exc:
                log.warning("llama-server nieosiągalny (bot=%s): %s", body.bot_id, exc)
                yield _sse("error", {"message": f"llama-server nieosiągalny: {exc}"})
            finally:
                ticket.release()

        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    @app.post("/tokenize", response_model=TokenizeResponse, dependencies=[Depends(require_api_key)])
    async def tokenize(request: Request, body: TokenizeRequest) -> TokenizeResponse:
        """Pomiar długości promptu tokenizerem modelu (budżet kontekstu botów)."""
        supervisor: LlamaSupervisor = request.app.state.supervisor
        client: httpx.AsyncClient = request.app.state.client
        if not supervisor.is_ready:
            raise HTTPException(
                status_code=503,
                detail=f"Model niedostępny (status: {supervisor.status.value})",
            )
        try:
            count = await count_tokens(client, settings, body.text)
        except (LlamaError, httpx.HTTPError) as exc:
            # Serwer VTT ma fallback na oszacowanie po znakach — nie wywracamy
            # z tego powodu wypowiedzi bota, oddajemy czysty błąd.
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        return TokenizeResponse(count=count, context_size=supervisor.context_size)

    @app.post("/admin/restart", dependencies=[Depends(require_api_key)])
    async def restart(request: Request) -> dict[str, str]:
        """Ręczny restart llama-server (diagnostyka z ekranu testowego MG)."""
        supervisor: LlamaSupervisor = request.app.state.supervisor
        if not settings.manages_llama:
            raise HTTPException(
                status_code=400,
                detail="Gateway nie zarządza procesem llama-server",
            )
        await supervisor.stop()
        await supervisor.start()
        return {"status": LlamaStatus.STARTING.value}

    return app


def _sse(event: str, data: dict[str, Any]) -> bytes:
    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event}\ndata: {payload}\n\n".encode()
