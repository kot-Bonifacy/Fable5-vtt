"""Głos botów: normalizacja tekstu, synteza, znaczniki czasu ujawniania."""

from .base import SynthesisParams, TtsEngine, TtsError, TtsResult, VoiceInfo
from .manager import TtsBusy, TtsManager, TtsStatus, build_engine
from .text import SpeechText, normalize_for_speech
from .timing import RevealPoint, build_reveal

__all__ = [
    "RevealPoint",
    "SpeechText",
    "SynthesisParams",
    "TtsBusy",
    "TtsEngine",
    "TtsError",
    "TtsManager",
    "TtsResult",
    "TtsStatus",
    "VoiceInfo",
    "build_engine",
    "build_reveal",
    "normalize_for_speech",
]
