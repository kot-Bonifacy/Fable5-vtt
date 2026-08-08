"""Katalog modeli embeddingów.

Wszystkie kandydatury muszą spełniać trzy warunki etapu 19a: wielojęzyczność z
sensownym polskim, **eksport ONNX na HuggingFace** (liczymy na CPU, więc nie
wchodzimy w torch) i wymiar, który zmieści się w jednym pliku SQLite.

Różnice między modelami sprowadzają się do trzech rzeczy — poolingu, prefiksów i
wymiaru — więc trzymamy je jako dane, a nie jako gałęzie w kodzie embeddera.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal


@dataclass(frozen=True)
class EmbeddingModelSpec:
    id: str
    """Krótki klucz z konfiguracji (`GATEWAY_RAG_MODEL`)."""
    repo: str
    onnx_file: str
    tokenizer_file: str
    pooling: Literal["cls", "mean"]
    dim: int
    max_tokens: int
    query_prefix: str = ""
    passage_prefix: str = ""
    extra_files: tuple[str, ...] = field(default_factory=tuple)
    """Pliki, które muszą wylądować obok modelu (wagi zewnętrzne ONNX)."""
    note: str = ""

    @property
    def download_patterns(self) -> list[str]:
        return [self.onnx_file, self.tokenizer_file, *self.extra_files]


BGE_M3 = EmbeddingModelSpec(
    id="bge-m3",
    repo="BAAI/bge-m3",
    onnx_file="onnx/model.onnx",
    tokenizer_file="tokenizer.json",
    extra_files=("onnx/model.onnx_data",),
    pooling="cls",
    dim=1024,
    # Model umie 8192, ale fragmenty mają 300–600 tokenów — dłuższe okno kosztowałoby
    # czas na CPU i niczego nie wnosi.
    max_tokens=512,
    note="XLM-RoBERTa large, CLS pooling, bez prefiksów.",
)

MULTILINGUAL_E5_LARGE = EmbeddingModelSpec(
    id="multilingual-e5-large",
    repo="intfloat/multilingual-e5-large",
    onnx_file="onnx/model.onnx",
    tokenizer_file="tokenizer.json",
    extra_files=("onnx/model.onnx_data",),
    pooling="mean",
    dim=1024,
    max_tokens=512,
    # Bez tych prefiksów model traci wyraźnie na trafności — są częścią jego treningu,
    # nie ozdobnikiem.
    query_prefix="query: ",
    passage_prefix="passage: ",
    note="XLM-RoBERTa large, mean pooling, wymaga prefiksów query:/passage:.",
)

EMBEDDING_MODELS: dict[str, EmbeddingModelSpec] = {
    spec.id: spec for spec in (BGE_M3, MULTILINGUAL_E5_LARGE)
}


class UnknownEmbeddingModel(ValueError):
    pass


def resolve_model(model_id: str) -> EmbeddingModelSpec:
    spec = EMBEDDING_MODELS.get(model_id.strip())
    if spec is None:
        known = ", ".join(sorted(EMBEDDING_MODELS))
        raise UnknownEmbeddingModel(f"nieznany model embeddingów {model_id!r} (znane: {known})")
    return spec
