"""Zarządzanie silnikiem mowy: leniwe ładowanie, własna kolejka, wyładowanie po bezczynności.

Kolejka TTS jest **niezależna od kolejki LLM** — synteza nie może blokować
generacji ani odwrotnie. Model ładuje się dopiero przy pierwszym żądaniu i
znika po `tts_idle_unload_s` bezczynności; przy Piperze na CPU to kwestia RAM-u,
przy silniku na GPU — warunek współistnienia z llama-serverem.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass

from ..config import Settings
from .base import SynthesisParams, TtsEngine, TtsError, TtsResult, VoiceInfo

log = logging.getLogger(__name__)


class TtsBusy(TtsError):
    """Kolejka syntezy pełna — wypowiedź pójdzie bez audio."""


@dataclass
class TtsStatus:
    engine: str
    device: str
    available: bool
    loaded: bool
    queue_length: int
    busy: bool
    voices: int
    syntheses: int
    last_synth_ms: int | None
    vram_mb: int | None


class TtsManager:
    def __init__(self, settings: Settings, engine: TtsEngine | None = None) -> None:
        self._settings = settings
        self._engine = engine if engine is not None else build_engine(settings)
        self._semaphore = asyncio.Semaphore(1)
        self._waiting = 0
        self._busy = False
        self._syntheses = 0
        self._last_synth_ms: int | None = None
        self._last_used = 0.0
        self._vram_mb: int | None = None
        self._idle_task: asyncio.Task[None] | None = None

    @property
    def engine_name(self) -> str:
        return self._engine.name

    @property
    def available(self) -> bool:
        return self._engine.available

    def voices(self) -> list[VoiceInfo]:
        return self._engine.voices() if self._engine.available else []

    def status(self) -> TtsStatus:
        return TtsStatus(
            engine=self._engine.name,
            device=self._engine.device,
            available=self._engine.available,
            loaded=self._engine.loaded,
            queue_length=self._waiting,
            busy=self._busy,
            voices=len(self.voices()),
            syntheses=self._syntheses,
            last_synth_ms=self._last_synth_ms,
            vram_mb=self._vram_mb,
        )

    async def synthesize(self, text: str, voice: str, params: SynthesisParams) -> TtsResult:
        if not self._engine.available:
            raise TtsError(f"silnik {self._engine.name} niedostępny")
        if len(text) > self._settings.tts_max_chars:
            raise TtsError(
                f"tekst za długi ({len(text)} znaków, limit {self._settings.tts_max_chars})"
            )
        if self._waiting >= self._settings.tts_max_queue_length:
            raise TtsBusy(f"kolejka syntezy pełna ({self._settings.tts_max_queue_length})")

        self._waiting += 1
        waiting = True
        try:
            async with self._semaphore:
                self._waiting -= 1
                waiting = False
                self._busy = True
                cold_start = not self._engine.loaded
                started = time.perf_counter()
                try:
                    result = await asyncio.wait_for(
                        asyncio.to_thread(self._engine.synthesize, text, voice, params),
                        timeout=self._settings.tts_timeout,
                    )
                except TimeoutError as exc:
                    raise TtsError(
                        f"synteza przekroczyła {self._settings.tts_timeout:.0f} s"
                    ) from exc
                finally:
                    self._busy = False

                result.synth_ms = int((time.perf_counter() - started) * 1000)
                self._syntheses += 1
                self._last_synth_ms = result.synth_ms
                self._last_used = time.monotonic()
                if cold_start:
                    await self._measure_vram()
                self._ensure_idle_watch()
                return result
        finally:
            if waiting:
                self._waiting -= 1

    async def _measure_vram(self) -> None:
        """Ile karty zjada silnik — mierzone raz, po pierwszym załadowaniu."""
        if self._engine.device != "cuda":
            self._vram_mb = 0
            return
        from ..gpu import read_gpu_info

        info = await read_gpu_info()
        self._vram_mb = info.memory_used_mb if info else None

    def _ensure_idle_watch(self) -> None:
        if self._settings.tts_idle_unload_s <= 0:
            return
        if self._idle_task is None or self._idle_task.done():
            self._idle_task = asyncio.create_task(self._idle_unload_loop())

    async def _idle_unload_loop(self) -> None:
        idle_after = self._settings.tts_idle_unload_s
        while True:
            await asyncio.sleep(max(1.0, idle_after / 4))
            if self._busy or self._waiting:
                continue
            if time.monotonic() - self._last_used < idle_after:
                continue
            if not self._engine.loaded:
                return
            log.info("TTS bezczynny %.0f s — zwalniam model", idle_after)
            await asyncio.to_thread(self._engine.unload)
            self._vram_mb = None
            return

    async def shutdown(self) -> None:
        if self._idle_task is not None:
            self._idle_task.cancel()
            self._idle_task = None
        if self._engine.loaded:
            await asyncio.to_thread(self._engine.unload)


def build_engine(settings: Settings) -> TtsEngine:
    """Fabryka silnika z konfiguracji. Nieznana nazwa = silnik pusty, nie wyjątek."""
    choice = (settings.tts_engine or "none").strip().lower()
    if choice == "piper":
        from .piper_engine import PiperEngine

        return PiperEngine(
            settings.tts_voices_dir,
            default_voice=settings.tts_default_voice,
        )
    if choice == "chatterbox":
        from .chatterbox_engine import ChatterboxEngine

        return ChatterboxEngine(device=settings.tts_device)
    if choice not in ("none", ""):
        log.warning("nieznany silnik TTS %r — mowa botów wyłączona", choice)
    return NullEngine()


class NullEngine(TtsEngine):
    name = "none"

    @property
    def available(self) -> bool:
        return False

    def voices(self) -> list[VoiceInfo]:
        return []

    def synthesize(self, text: str, voice: str, params: SynthesisParams) -> TtsResult:
        raise TtsError("mowa botów jest wyłączona (GATEWAY_TTS_ENGINE=none)")
