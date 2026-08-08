"""Aplikacja FastAPI gatewaya."""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import time
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
from .rag.service import RagDocument, RagError, RagService
from .rag.store import SearchFilter
from .schemas import (
    ChatRequest,
    HealthResponse,
    LlamaStatus,
    RagForgetRequest,
    RagHealthInfo,
    RagIndexRequest,
    RagIndexResponse,
    RagSearchRequest,
    RagSearchResponse,
    RagStatusResponse,
    TokenizeRequest,
    TokenizeResponse,
    TtsRequest,
    TtsResponse,
    TtsStatusInfo,
    VoicesResponse,
)
from .supervisor import LlamaSupervisor
from .tts.base import SynthesisParams, TtsError
from .tts.manager import TtsBusy, TtsManager
from .tts.samples import SampleStore, UnknownSample

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
        app.state.tts = TtsManager(settings)
        app.state.samples = SampleStore(settings.tts_samples_dir)
        app.state.rag = RagService(settings)
        # Indeksowanie podręcznika chodzi w tle (kilka minut na CPU) — trzymamy
        # referencję, żeby pętla zdarzeń nie zebrała zadania w połowie.
        app.state.rag_task = None
        await supervisor.start()
        try:
            yield
        finally:
            await supervisor.stop()
            await app.state.tts.shutdown()
            app.state.rag.close()
            await client.aclose()

    app = FastAPI(title="VTT AI Gateway", version="0.1.0", lifespan=lifespan)

    async def require_api_key(x_api_key: str | None = Header(default=None)) -> None:
        if settings.api_key and x_api_key != settings.api_key:
            raise HTTPException(status_code=401, detail="Nieprawidłowy klucz API")

    @app.get("/health", response_model=HealthResponse)
    async def health(request: Request) -> HealthResponse:
        supervisor: LlamaSupervisor = request.app.state.supervisor
        queue: RequestQueue = request.app.state.queue
        tts: TtsManager = request.app.state.tts
        rag: RagService = request.app.state.rag
        tts_status = tts.status()
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
            tts=TtsStatusInfo(**vars(tts_status)),
            rag=_rag_health(rag),
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

    @app.get("/tts/voices", response_model=VoicesResponse)
    async def tts_voices(request: Request) -> VoicesResponse:
        """Głosy, które silnik faktycznie ma na dysku — katalog presetów po
        stronie VTT mapuje na te identyfikatory."""
        tts: TtsManager = request.app.state.tts
        return VoicesResponse(
            engine=tts.engine_name,
            available=tts.available,
            voices=[vars(voice) for voice in tts.voices()],  # type: ignore[arg-type]
        )

    @app.post("/tts", response_model=TtsResponse, dependencies=[Depends(require_api_key)])
    async def tts_synthesize(request: Request, body: TtsRequest) -> TtsResponse:
        """Synteza jednej wypowiedzi. Każdy błąd to czysty status HTTP —
        serwer VTT ma z niego wyprowadzić wypowiedź bez audio, nigdy wyjątek
        przerywający czat."""
        tts: TtsManager = request.app.state.tts
        samples: SampleStore = request.app.state.samples

        try:
            reference = samples.resolve(body.reference_id, body.reference_audio_base64)
        except UnknownSample as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except Exception as exc:  # InvalidSample i wszystko, co przyjdzie z dysku
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        params = SynthesisParams(
            speed=body.speed,
            pitch=body.pitch,
            expressiveness=body.expressiveness,
            speaker_id=body.speaker_id,
            reference_audio=reference,
        )
        try:
            result = await tts.synthesize(body.text, body.voice, params)
        except TtsBusy as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except TtsError as exc:
            log.warning("synteza nieudana (bot=%s): %s", body.bot_id, exc)
            raise HTTPException(status_code=503, detail=str(exc)) from exc

        return TtsResponse(
            audio_base64=base64.b64encode(result.audio).decode("ascii"),
            sample_rate=result.sample_rate,
            duration_ms=result.duration_ms,
            reveal=[{"ms": point.ms, "chars": point.chars} for point in result.reveal],
            engine=result.engine,
            voice=result.voice,
            synth_ms=result.synth_ms,
            spoken_text=result.spoken_text,
        )

    @app.get("/rag/status", response_model=RagStatusResponse)
    async def rag_status(request: Request) -> RagStatusResponse:
        rag: RagService = request.app.state.rag
        return RagStatusResponse(**rag.status())  # type: ignore[arg-type]

    @app.post(
        "/rag/search",
        response_model=RagSearchResponse,
        dependencies=[Depends(require_api_key)],
    )
    async def rag_search(request: Request, body: RagSearchRequest) -> RagSearchResponse:
        """Wyszukiwanie hybrydowe. Treść materiału wraca do wołającego — to jedyna
        droga, którą podręcznik opuszcza gateway, i idzie wyłącznie do MG."""
        rag: RagService = request.app.state.rag
        started = time.perf_counter()
        filters = SearchFilter(
            tags_any=tuple(sorted({tag.strip().lower() for tag in body.tags if tag.strip()})),
            visibility=tuple(sorted({name.strip() for name in body.visibility if name.strip()})),
        )
        scope = body.collections or [body.collection]
        try:
            hits = await rag.search(
                body.query,
                collection=scope,
                top_k=body.top_k,
                filters=filters,
            )
        except RagError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        return RagSearchResponse(
            collection=",".join(scope),
            query=body.query,
            hits=[vars(hit) for hit in hits],  # type: ignore[arg-type]
            took_ms=int((time.perf_counter() - started) * 1000),
        )

    @app.post(
        "/rag/index",
        response_model=RagIndexResponse,
        dependencies=[Depends(require_api_key)],
    )
    async def rag_index(request: Request, body: RagIndexRequest) -> RagIndexResponse:
        """Indeksowanie dokumentów przysłanych przez serwer VTT (etap 19b:
        baza wiedzy kampanii). Krótkie, więc rozliczane synchronicznie."""
        rag: RagService = request.app.state.rag
        documents = [
            RagDocument(
                source=doc.source,
                text=doc.text,
                title=doc.title,
                fmt=doc.format,
                meta={
                    **doc.meta,
                    "tags": [tag.strip().lower() for tag in doc.tags if tag.strip()],
                    "visibility": doc.visibility,
                },
            )
            for doc in body.documents
        ]
        try:
            progress = await rag.index_documents(body.collection, documents)
        except RagError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        return RagIndexResponse(
            collection=body.collection,
            documents=progress.done,
            chunks=progress.chunks,
            duration_ms=progress.duration_ms,
            error=progress.error,
        )

    @app.post("/rag/index/rulebook", dependencies=[Depends(require_api_key)], status_code=202)
    async def rag_index_rulebook(request: Request) -> dict[str, object]:
        """Indeksowanie podręcznika z **lokalnego katalogu gatewaya**.

        Tekst nie przechodzi przez serwer VTT ani przez sieć — gateway czyta pliki
        z dysku maszyny, na której stoi. To jest realizacja kryterium etapu
        „indeksowanie odbywa się wyłącznie lokalnie".
        """
        rag: RagService = request.app.state.rag
        if not rag.enabled:
            raise HTTPException(status_code=503, detail=rag.disabled_reason or "RAG niedostępny")
        if rag.progress().running:
            raise HTTPException(status_code=409, detail="indeksowanie już trwa")

        async def run() -> None:
            try:
                await rag.index_rulebook()
            except RagError as exc:
                log.warning("indeksowanie podręcznika nieudane: %s", exc)
                rag.progress().error = str(exc)

        request.app.state.rag_task = asyncio.create_task(run())
        return {"status": "started"}

    @app.post("/rag/forget", dependencies=[Depends(require_api_key)])
    async def rag_forget(request: Request, body: RagForgetRequest) -> dict[str, int]:
        """Zapomina wskazane dokumenty (wpis skasowany albo osierocony w VTT)."""
        rag: RagService = request.app.state.rag
        if not rag.enabled:
            raise HTTPException(status_code=503, detail=rag.disabled_reason or "RAG niedostępny")
        return {"removed": rag.delete_documents(body.collection, body.sources)}

    @app.get("/rag/collections/{name}/sources", dependencies=[Depends(require_api_key)])
    async def rag_collection_sources(request: Request, name: str) -> dict[str, list[str]]:
        """Co kolekcja ma zaindeksowane — serwer VTT rozpoznaje po tym sieroty."""
        rag: RagService = request.app.state.rag
        return {"sources": rag.collection_sources(name)}

    @app.delete("/rag/collections/{name}", dependencies=[Depends(require_api_key)])
    async def rag_delete_collection(request: Request, name: str) -> dict[str, int]:
        rag: RagService = request.app.state.rag
        if not rag.enabled:
            raise HTTPException(status_code=503, detail=rag.disabled_reason or "RAG niedostępny")
        return {"removed": rag.delete_collection(name)}

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


def _rag_health(rag: RagService) -> RagHealthInfo:
    status = rag.status()
    collections = status["collections"]
    chunks = sum(int(item["chunks"]) for item in collections)  # type: ignore[index,union-attr]
    indexing = bool(status["indexing"]["running"])  # type: ignore[index]
    return RagHealthInfo(
        enabled=bool(status["enabled"]),
        ready=bool(status["enabled"]) and chunks > 0 and not status["model_mismatch"],
        model=status["model"],  # type: ignore[arg-type]
        device="cpu",
        loaded=bool(status["loaded"]),
        chunks=chunks,
        indexing=indexing,
        reason=status["reason"],  # type: ignore[arg-type]
    )
