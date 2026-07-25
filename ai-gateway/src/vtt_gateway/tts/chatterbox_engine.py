"""Adapter Chatterbox Multilingual (Resemble AI, 0.5B, MIT) — tryb opcjonalny.

Zmierzony w etapie 12 i **nie wybrany domyślnym**: +3,7 GB VRAM w szczycie ponad
llama-server (15,7 z 16,3 GB w karcie — bez miejsca na whispera z etapu 21)
i 3,6–9,5 s na kwestię, przy kryterium ≤ 3 s do pierwszego dźwięku. Zostaje
włączany świadomie przez `GATEWAY_TTS_ENGINE=chatterbox`, bo daje jedyną rzecz,
której Piper nie ma: klonowanie głosu z krótkiej próbki.

Import torcha jest leniwy — gateway bez zainstalowanego Chatterboksa ma po
prostu `available: false`, nigdy wyjątek.
"""

from __future__ import annotations

import logging
import threading

from .base import SynthesisParams, TtsEngine, TtsError, TtsResult, VoiceInfo, wav_bytes
from .text import normalize_for_speech
from .timing import build_reveal

log = logging.getLogger(__name__)

# Głos wbudowany w checkpoint; własne próbki podaje się przez reference_audio.
BUILTIN_VOICE = "chatterbox-default"


class ChatterboxEngine(TtsEngine):
    name = "chatterbox"

    def __init__(self, device: str = "cuda", abbreviations: dict[str, str] | None = None) -> None:
        self._device = device
        self._abbreviations = abbreviations or {}
        self._model = None
        self._lock = threading.Lock()

    @property
    def available(self) -> bool:
        try:
            import chatterbox.mtl_tts  # noqa: F401
        except ImportError:
            return False
        return True

    @property
    def loaded(self) -> bool:
        return self._model is not None

    @property
    def device(self) -> str:
        return self._device

    def voices(self) -> list[VoiceInfo]:
        if not self.available:
            return []
        return [
            VoiceInfo(
                id=BUILTIN_VOICE,
                name="Chatterbox (wbudowany)",
                engine=self.name,
                sample_rate=24000,
                clonable=True,
            )
        ]

    def _ensure_model(self):
        with self._lock:
            if self._model is not None:
                return self._model
            from chatterbox.mtl_tts import ChatterboxMultilingualTTS

            log.info("ładuję Chatterbox na %s", self._device)
            self._model = ChatterboxMultilingualTTS.from_pretrained(device=self._device)
            return self._model

    def synthesize(self, text: str, voice: str, params: SynthesisParams) -> TtsResult:
        import numpy as np

        speech = normalize_for_speech(text, self._abbreviations)
        if not speech.spoken.strip():
            raise TtsError("po normalizacji nie zostało nic do wypowiedzenia")

        model = self._ensure_model()
        kwargs = {"language_id": "pl", "exaggeration": _clamp(params.expressiveness, 0.25, 1.0)}
        if params.reference_audio:
            kwargs["audio_prompt_path"] = params.reference_audio

        try:
            wav = model.generate(speech.spoken, **kwargs)
        except Exception as exc:  # noqa: BLE001 — cudza biblioteka, każdy błąd = brak audio
            raise TtsError(f"synteza nie powiodła się: {exc}") from exc

        audio = wav.squeeze(0).detach().cpu().numpy()
        pcm = (np.clip(audio, -1.0, 1.0) * 32767).astype("<i2").tobytes()
        sample_rate = int(model.sr / _clamp(params.speed, 0.5, 2.0))
        duration_ms = int(len(pcm) / 2 / sample_rate * 1000)

        return TtsResult(
            audio=wav_bytes(pcm, sample_rate),
            sample_rate=sample_rate,
            duration_ms=duration_ms,
            # Bez alignmentu — rytm ujawniania tekstu szacujemy sylabicznie.
            reveal=build_reveal(speech, None, duration_ms),
            engine=self.name,
            voice=voice or BUILTIN_VOICE,
            spoken_text=speech.spoken,
        )

    def unload(self) -> None:
        with self._lock:
            if self._model is None:
                return
            self._model = None
            try:
                import gc

                import torch

                gc.collect()
                torch.cuda.empty_cache()
            except ImportError:
                pass


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))
