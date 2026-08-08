"""Pamięć długoterminowa gatewaya: chunkowanie, embeddingi i wyszukiwanie hybrydowe.

Moduł jest świadomie niezależny od reszty gatewaya — nie wie nic o llama-serverze
ani o kolejce żądań. Wchodzi się tu przez `RagService`, a wszystko poniżej (chunker, magazyn,
embedder) da się testować osobno i bez GPU.
"""

from .chunker import Chunk, chunk_markdown, estimate_tokens
from .models import EMBEDDING_MODELS, EmbeddingModelSpec, resolve_model
from .service import IndexProgress, RagService, SearchHit
from .store import CollectionStats, RagStore, StoredChunk

__all__ = [
    "EMBEDDING_MODELS",
    "Chunk",
    "CollectionStats",
    "EmbeddingModelSpec",
    "IndexProgress",
    "RagService",
    "RagStore",
    "SearchHit",
    "StoredChunk",
    "chunk_markdown",
    "estimate_tokens",
    "resolve_model",
]
