"""Nadzór nad procesem llama-server.

Odpowiedzialności:
- start procesu z argumentami z konfiguracji (albo tryb „external" — proces stoi obok),
- cykliczny health-check (`GET /health` llama-server),
- restart po padzie procesu lub po serii nieudanych health-checków,
- raportowanie statusu dla `GET /health` gatewaya.
"""

from __future__ import annotations

import asyncio
import logging
import shlex
import subprocess
import sys
import time
from contextlib import suppress

import httpx

from .config import Settings
from .schemas import LlamaStatus

log = logging.getLogger(__name__)


class LlamaSupervisor:
    def __init__(self, settings: Settings, client: httpx.AsyncClient) -> None:
        self._settings = settings
        self._client = client
        self._process: subprocess.Popen[bytes] | None = None
        self._status = LlamaStatus.STOPPED
        self._monitor: asyncio.Task[None] | None = None
        self._consecutive_failures = 0
        self._restarts = 0
        self._last_error: str | None = None
        self._model_name: str | None = None
        self._context_size: int | None = None
        # Zamknięcie gatewaya nie może wyglądać jak pad procesu.
        self._shutting_down = False

    # --- stan ---

    @property
    def status(self) -> LlamaStatus:
        return self._status

    @property
    def restarts(self) -> int:
        return self._restarts

    @property
    def last_error(self) -> str | None:
        return self._last_error

    @property
    def model_name(self) -> str | None:
        return self._model_name

    @property
    def context_size(self) -> int | None:
        return self._context_size

    @property
    def is_ready(self) -> bool:
        return self._status in (LlamaStatus.READY, LlamaStatus.EXTERNAL)

    # --- cykl życia ---

    async def start(self) -> None:
        self._shutting_down = False
        if self._settings.manages_llama:
            self._spawn()
            self._status = LlamaStatus.STARTING
        else:
            # Proces zewnętrzny: nie startujemy, tylko sprawdzamy czy odpowiada.
            self._status = LlamaStatus.UNHEALTHY
        self._monitor = asyncio.create_task(self._monitor_loop(), name="llama-monitor")

    async def stop(self) -> None:
        self._shutting_down = True
        if self._monitor is not None:
            self._monitor.cancel()
            with suppress(asyncio.CancelledError):
                await self._monitor
            self._monitor = None
        self._terminate()
        self._status = LlamaStatus.STOPPED

    async def wait_until_ready(self, timeout: float | None = None) -> bool:
        """Czeka aż llama-server odpowie na health-check. False = przekroczono limit."""
        limit = timeout if timeout is not None else self._settings.llama_startup_timeout
        deadline = time.monotonic() + limit
        while time.monotonic() < deadline:
            if self.is_ready:
                return True
            await asyncio.sleep(0.5)
        return False

    # --- proces ---

    def _build_command(self) -> list[str]:
        s = self._settings
        assert s.llama_binary is not None and s.llama_model is not None
        host, port = _split_url(s.llama_url)
        cmd = [
            str(s.llama_binary),
            "--model",
            str(s.llama_model),
            "--host",
            host,
            "--port",
            str(port),
            "--ctx-size",
            str(s.llama_ctx_size),
            "--n-gpu-layers",
            str(s.llama_gpu_layers),
            # Kolejkę trzymamy w gatewayu — llama-server obsługuje jedno żądanie naraz.
            "--parallel",
            "1",
            # Bloki think sterowane per żądanie (chat_template_kwargs), nie globalnie.
            "--jinja",
            "--reasoning-format",
            "deepseek",
        ]
        if s.llama_flash_attn:
            cmd += ["--flash-attn", "on"]
        if s.llama_extra_args.strip():
            cmd += shlex.split(s.llama_extra_args)
        return cmd

    def _spawn(self) -> None:
        cmd = self._build_command()
        log.info("uruchamiam llama-server: %s", " ".join(cmd))
        creation_flags = 0
        if sys.platform == "win32":
            # Własna grupa procesów: Ctrl+C w konsoli gatewaya nie ubija llama-server
            # w pół zdania, zamykamy go świadomie w _terminate().
            creation_flags = subprocess.CREATE_NEW_PROCESS_GROUP
        self._process = subprocess.Popen(  # noqa: S603 - polecenie z zaufanej konfiguracji
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creation_flags,
        )

    def _terminate(self) -> None:
        proc = self._process
        if proc is None:
            return
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=15)
            except subprocess.TimeoutExpired:
                proc.kill()
        self._process = None

    # --- monitor ---

    async def _monitor_loop(self) -> None:
        while True:
            try:
                await self._tick()
            except asyncio.CancelledError:
                raise
            except Exception:  # pragma: no cover - monitor nigdy nie może się wywrócić
                log.exception("błąd w pętli monitorującej llama-server")
            await asyncio.sleep(self._settings.health_interval)

    async def _tick(self) -> None:
        if self._shutting_down:
            return

        # Pad procesu wykrywamy natychmiast, bez czekania na serię health-checków.
        if self._settings.manages_llama and self._process is not None:
            code = self._process.poll()
            if code is not None:
                self._last_error = f"llama-server zakończył się kodem {code}"
                log.warning("%s — restartuję", self._last_error)
                await self._restart()
                return

        healthy = await self._check_health()
        if healthy:
            self._consecutive_failures = 0
            self._status = (
                LlamaStatus.READY if self._settings.manages_llama else LlamaStatus.EXTERNAL
            )
            return

        self._consecutive_failures += 1
        if self._status is LlamaStatus.READY or self._status is LlamaStatus.EXTERNAL:
            self._status = LlamaStatus.UNHEALTHY
        if (
            self._settings.manages_llama
            and self._consecutive_failures >= self._settings.health_failures_before_restart
        ):
            log.warning(
                "llama-server nie odpowiada (%d nieudanych sprawdzeń) — restartuję",
                self._consecutive_failures,
            )
            await self._restart()

    async def _check_health(self) -> bool:
        try:
            response = await self._client.get(
                f"{self._settings.llama_url}/health",
                timeout=httpx.Timeout(5.0),
            )
        except httpx.HTTPError as exc:
            self._last_error = str(exc)
            return False
        if response.status_code != 200:
            self._last_error = f"health-check llama-server: HTTP {response.status_code}"
            return False
        self._last_error = None
        if self._model_name is None:
            await self._load_model_info()
        return True

    async def _load_model_info(self) -> None:
        """Pobiera nazwę modelu i rozmiar kontekstu z llama-server (best effort)."""
        try:
            response = await self._client.get(
                f"{self._settings.llama_url}/props",
                timeout=httpx.Timeout(5.0),
            )
            data = response.json()
        except (httpx.HTTPError, ValueError):
            return
        model_path = data.get("model_path") or data.get("model")
        if isinstance(model_path, str):
            self._model_name = model_path.replace("\\", "/").rsplit("/", 1)[-1]
        ctx = data.get("n_ctx") or data.get("default_generation_settings", {}).get("n_ctx")
        if isinstance(ctx, int):
            self._context_size = ctx

    async def _restart(self) -> None:
        self._consecutive_failures = 0
        self._model_name = None
        self._context_size = None
        self._terminate()
        if not self._settings.manages_llama:
            self._status = LlamaStatus.UNHEALTHY
            return
        self._restarts += 1
        self._status = LlamaStatus.STARTING
        self._spawn()


def _split_url(url: str) -> tuple[str, int]:
    """http://127.0.0.1:8080 → ("127.0.0.1", 8080)."""
    without_scheme = url.split("://", 1)[-1].rstrip("/")
    host, _, port = without_scheme.partition(":")
    return host or "127.0.0.1", int(port or 8080)
