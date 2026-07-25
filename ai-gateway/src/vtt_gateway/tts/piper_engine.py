"""Adapter Pipera (VITS/ONNX, CPU).

Wybrany domyślnym silnikiem w etapie 12 — pomiary w `ai-gateway/README.md`.
Dwie rzeczy, których nie ma żaden inny kandydat w tym budżecie:

1. **0 GB VRAM** — cała karta zostaje dla LLM i (od etapu 21) whispera,
2. **alignment fonemów** — model załadowany z `include_alignments=True` oddaje
   liczbę próbek audio przypadającą na każdy fonem, więc granice słów są
   dokładne, a nie szacowane. To one napędzają ujawnianie tekstu w rytmie mowy.

Piper nie ma sterowania wysokością głosu, ale da się je złożyć z dwóch rzeczy,
które ma: syntezujemy wolniej o współczynnik `pitch`, a odtwarzamy z próbkowaniem
przemnożonym przez ten sam współczynnik. Tempo wychodzi bez zmian, barwa idzie
w górę lub w dół — dzięki temu z pięciu modeli robi się kilkanaście głosów.
"""

from __future__ import annotations

import logging
import threading
from pathlib import Path

from .base import SynthesisParams, TtsEngine, TtsError, TtsResult, VoiceInfo, wav_bytes
from .text import normalize_for_speech
from .timing import build_reveal

log = logging.getLogger(__name__)

# Ile modeli głosu trzymamy naraz w RAM (63 MB każdy, karta ich nie dotyka).
_VOICE_CACHE_LIMIT = 4


class PiperEngine(TtsEngine):
    name = "piper"

    def __init__(
        self,
        voices_dir: Path,
        *,
        default_voice: str = "",
        abbreviations: dict[str, str] | None = None,
    ) -> None:
        self._voices_dir = voices_dir
        self._default_voice = default_voice
        self._abbreviations = abbreviations or {}
        self._cache: dict[str, object] = {}
        self._lock = threading.Lock()

    @property
    def available(self) -> bool:
        try:
            import piper  # noqa: F401
        except ImportError:
            return False
        return bool(self._models())

    @property
    def loaded(self) -> bool:
        return bool(self._cache)

    @property
    def device(self) -> str:
        return "cpu"

    def _models(self) -> dict[str, Path]:
        if not self._voices_dir.is_dir():
            return {}
        return {path.stem: path for path in sorted(self._voices_dir.glob("*.onnx"))}

    def voices(self) -> list[VoiceInfo]:
        infos: list[VoiceInfo] = []
        for name, path in self._models().items():
            quality = name.rsplit("-", 1)[-1] if "-" in name else None
            infos.append(
                VoiceInfo(
                    id=name,
                    name=name,
                    engine=self.name,
                    quality=quality,
                    clonable=False,
                    sample_rate=_sample_rate_from_config(path),
                )
            )
        return infos

    def _voice(self, voice_id: str):
        from piper import PiperVoice

        models = self._models()
        name = voice_id or self._default_voice
        if name not in models:
            fallback = self._default_voice if self._default_voice in models else None
            if fallback is None and models:
                fallback = next(iter(models))
            if fallback is None:
                raise TtsError(f"brak modeli głosu w {self._voices_dir}")
            log.warning("nieznany głos %r — używam %r", voice_id, fallback)
            name = fallback

        with self._lock:
            cached = self._cache.get(name)
            if cached is not None:
                return cached
            log.info("ładuję głos Pipera: %s", name)
            voice = PiperVoice.load(models[name], include_alignments=True)
            if len(self._cache) >= _VOICE_CACHE_LIMIT:
                self._cache.pop(next(iter(self._cache)))
            self._cache[name] = voice
            return voice

    def synthesize(self, text: str, voice: str, params: SynthesisParams) -> TtsResult:
        from piper import SynthesisConfig

        speech = normalize_for_speech(text, self._abbreviations)
        if not speech.spoken.strip():
            raise TtsError("po normalizacji nie zostało nic do wypowiedzenia")

        piper_voice = self._voice(voice)
        speed = _clamp(params.speed, 0.5, 2.0)
        pitch = _clamp(params.pitch, 0.7, 1.4)
        config = SynthesisConfig(
            length_scale=pitch / speed,
            speaker_id=params.speaker_id,
            normalize_audio=True,
        )

        chunks = list(piper_voice.synthesize(speech.spoken, config, include_alignments=True))
        if not chunks:
            raise TtsError("silnik nie zwrócił audio")

        native_rate = chunks[0].sample_rate
        pcm = b"".join(chunk.audio_int16_bytes for chunk in chunks)
        word_times = _word_times(chunks, native_rate, pitch)

        # Odtwarzanie z podbitym próbkowaniem podnosi barwę; wydłużona synteza
        # (length_scale * pitch) oddaje z powrotem tempo.
        output_rate = int(round(native_rate * pitch))
        duration_ms = int(len(pcm) / 2 / output_rate * 1000)

        return TtsResult(
            audio=wav_bytes(pcm, output_rate),
            sample_rate=output_rate,
            duration_ms=duration_ms,
            reveal=build_reveal(speech, word_times, duration_ms),
            engine=self.name,
            voice=voice,
            spoken_text=speech.spoken,
        )

    def unload(self) -> None:
        with self._lock:
            self._cache.clear()


def _word_times(chunks: list, native_rate: int, pitch: float) -> list[tuple[float, float]] | None:
    """Granice słów z alignmentu fonemów. None = model bez alignmentu."""
    times: list[tuple[float, float]] = []
    offset = 0.0
    for chunk in chunks:
        alignments = chunk.phoneme_alignments
        chunk_seconds = len(chunk.audio_int16_bytes) / 2 / native_rate / pitch
        if not alignments:
            return None
        elapsed = 0.0
        start: float | None = None
        for alignment in alignments:
            duration = alignment.num_samples / native_rate / pitch
            phoneme = alignment.phoneme
            if phoneme.isspace():
                if start is not None:
                    times.append((offset + start, offset + elapsed))
                    start = None
            elif phoneme not in ("^", "$"):
                if start is None:
                    start = elapsed
            elapsed += duration
        if start is not None:
            times.append((offset + start, offset + elapsed))
        offset += chunk_seconds
    return times or None


def _sample_rate_from_config(model_path: Path) -> int | None:
    import json

    config_path = model_path.with_suffix(".onnx.json")
    if not config_path.is_file():
        return None
    try:
        data = json.loads(config_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    audio = data.get("audio")
    return audio.get("sample_rate") if isinstance(audio, dict) else None


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))
