"""Wspólny kontrakt silników mowy.

Podmiana silnika ma być zmianą jednego adaptera — reszta gatewaya i cały serwer
VTT widzą wyłącznie ten interfejs. Synteza jest blokująca (ONNX / torch), więc
manager woła ją przez `asyncio.to_thread`; adaptery piszemy synchronicznie.
"""

from __future__ import annotations

import io
import wave
from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from .timing import RevealPoint


class TtsError(Exception):
    """Błąd syntezy — nigdy nie przerywa czatu, kończy się brakiem audio."""


@dataclass(frozen=True)
class VoiceInfo:
    id: str
    name: str
    engine: str
    sample_rate: int | None = None
    quality: str | None = None
    clonable: bool = False


@dataclass(frozen=True)
class SynthesisParams:
    """Parametry per wypowiedź. Zakresy są celowo wąskie — skrajne wartości
    brzmią jak awaria, a nie jak charakter postaci."""

    speed: float = 1.0
    """1.0 = tempo głosu bazowego; <1 wolniej, >1 szybciej."""
    pitch: float = 1.0
    """Wysokość: mnożnik częstotliwości próbkowania przy odtwarzaniu (Piper nie
    ma sterowania pitchem, więc realizujemy je przez resampling)."""
    expressiveness: float = 0.5
    """Ekspresja/temperatura — używana tylko przez silniki, które ją mają."""
    speaker_id: int | None = None
    reference_audio: str | None = None
    """Ścieżka do próbki głosu (klonowanie); ignorowana przez silniki bez klonowania."""


@dataclass
class TtsResult:
    audio: bytes
    """Kompletny plik WAV (PCM 16-bit mono)."""
    sample_rate: int
    duration_ms: int
    reveal: list[RevealPoint] = field(default_factory=list)
    engine: str = ""
    voice: str = ""
    synth_ms: int = 0
    spoken_text: str = ""
    """Tekst po normalizacji — do diagnostyki („dlaczego bot to tak przeczytał")."""


class TtsEngine(ABC):
    name: str = "none"

    @property
    @abstractmethod
    def available(self) -> bool:
        """Czy silnik da się w ogóle użyć (biblioteka + modele na dysku)."""

    @property
    def loaded(self) -> bool:
        return False

    @property
    def device(self) -> str:
        return "cpu"

    @abstractmethod
    def voices(self) -> list[VoiceInfo]:
        ...

    @abstractmethod
    def synthesize(self, text: str, voice: str, params: SynthesisParams) -> TtsResult:
        ...

    def unload(self) -> None:
        """Zwolnienie modelu z pamięci. Silnik bez stanu nie ma czego zwalniać."""
        return None


def wav_bytes(pcm: bytes, sample_rate: int) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm)
    return buffer.getvalue()
