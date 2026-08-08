"""Embedder-atrapa: liczy wektory bez modelu i bez sieci.

Worek słów rzutowany na 32 wymiary przez hash. To nie udaje semantyki — ma
tylko dawać powtarzalne, sensownie uporządkowane odległości, żeby testy magazynu
i fuzji rankingów nie zależały od pobrania 2 GB wag z HuggingFace.
"""

from __future__ import annotations

import re
import zlib

import numpy as np

from vtt_gateway.rag.models import EmbeddingModelSpec

FAKE_SPEC = EmbeddingModelSpec(
    id="fake",
    repo="local/fake",
    onnx_file="model.onnx",
    tokenizer_file="tokenizer.json",
    pooling="mean",
    dim=32,
    max_tokens=512,
)

WORD = re.compile(r"\w+", re.UNICODE)


class FakeEmbedder:
    spec = FAKE_SPEC
    dim = FAKE_SPEC.dim

    def __init__(self) -> None:
        self.loaded = False
        self.load_ms: int | None = None
        self.last_error: str | None = None
        self.encoded_passages = 0

    def load(self) -> None:
        self.loaded = True
        self.load_ms = 0

    def unload(self) -> None:
        self.loaded = False

    def count_tokens(self, text: str) -> int:
        return max(1, len(WORD.findall(text)))

    def encode_queries(self, texts: list[str]) -> np.ndarray:
        return self._encode(texts)

    def encode_passages(self, texts: list[str]) -> np.ndarray:
        self.encoded_passages += len(texts)
        return self._encode(texts)

    def _encode(self, texts: list[str]) -> np.ndarray:
        matrix = np.zeros((len(texts), self.dim), dtype=np.float32)
        for row, text in enumerate(texts):
            for word in WORD.findall(text.lower()):
                # crc32, nie `hash()` — wbudowany hash łańcuchów jest losowany
                # per proces, więc kolejność wyników zmieniałaby się między
                # uruchomieniami testów.
                matrix[row, zlib.crc32(word.encode("utf-8")) % self.dim] += 1.0
        norms = np.linalg.norm(matrix, axis=1, keepdims=True)
        return matrix / np.clip(norms, 1e-12, None)
