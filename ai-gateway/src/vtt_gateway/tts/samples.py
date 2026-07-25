"""Próbki głosu do klonowania — trzymane po stronie gatewaya.

Serwer VTT może stać na VPS, a gateway na PC z kartą: ścieżka do pliku po
stronie VTT nic tu nie znaczy. Dlatego próbka jedzie raz jako base64, ląduje na
dysku gatewaya pod swoim hashem, a kolejne wypowiedzi podają już tylko
`reference_id`. Po restarcie gatewaya (albo skasowaniu katalogu) VTT dostaje
409 i dosyła dane ponownie.
"""

from __future__ import annotations

import base64
import binascii
import logging
import re
from pathlib import Path

log = logging.getLogger(__name__)

# Rozsądny sufit dla 6–15 s mowy w WAV 16-bit; wyżej to już nie jest próbka głosu.
MAX_SAMPLE_BYTES = 8 * 1024 * 1024
_ID_RE = re.compile(r"^[A-Za-z0-9_-]{8,128}$")


class UnknownSample(Exception):
    """Gateway nie zna tej próbki — VTT musi ją dosłać."""


class InvalidSample(Exception):
    """Próbka nie jest plikiem WAV albo jest za duża."""


class SampleStore:
    def __init__(self, directory: Path) -> None:
        self._directory = directory

    def resolve(self, reference_id: str | None, audio_base64: str | None) -> str | None:
        """Zwraca ścieżkę do próbki albo None, gdy klonowania nie użyto."""
        if not reference_id:
            return None
        if not _ID_RE.match(reference_id):
            raise InvalidSample("nieprawidłowy identyfikator próbki")

        path = self._directory / f"{reference_id}.wav"
        if path.is_file():
            return str(path)
        if not audio_base64:
            raise UnknownSample(f"próbka {reference_id} nieznana — prześlij ją ponownie")

        try:
            payload = base64.b64decode(audio_base64, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise InvalidSample("próbka nie jest poprawnym base64") from exc
        if len(payload) > MAX_SAMPLE_BYTES:
            raise InvalidSample(f"próbka większa niż {MAX_SAMPLE_BYTES // (1024 * 1024)} MB")
        if not payload.startswith(b"RIFF") or payload[8:12] != b"WAVE":
            raise InvalidSample("próbka musi być plikiem WAV")

        self._directory.mkdir(parents=True, exist_ok=True)
        path.write_bytes(payload)
        log.info("zapisano próbkę głosu %s (%d KB)", reference_id, len(payload) // 1024)
        return str(path)
