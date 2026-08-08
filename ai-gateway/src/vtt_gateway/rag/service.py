"""Spięcie chunkera, embeddera i magazynu w jedną usługę.

Tu mieszka jedyna nieoczywista rzecz etapu: **fuzja dwóch rankingów**. Wyszukiwanie
wektorowe rozumie pytanie („co się dzieje z pancerzem po trafieniu"), a
pełnotekstowe trafia w nazwę własną („ablacja"). Każde z osobna gubi połowę pytań
MG, więc łączymy je metodą RRF (Reciprocal Rank Fusion): liczy się **pozycja**
w każdym rankingu, nie jego surowa punktacja — a to jedyny uczciwy sposób
połączenia kosinusa z BM25, bo te dwie liczby nie są w tej samej skali.
"""

from __future__ import annotations

import asyncio
import logging
import threading
import time
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

from ..config import Settings
from .chunker import chunk_markdown
from .embeddings import EmbeddingError, OnnxEmbedder
from .models import EmbeddingModelSpec, resolve_model
from .store import CollectionStats, RagStore, fts_query

log = logging.getLogger(__name__)

RULEBOOK_COLLECTION = "rulebook"
META_MODEL = "embedding_model"

# Stała z pracy o RRF (Cormack i in.). Tłumi wpływ ogona rankingu: różnica między
# pozycją 1 a 2 waży dużo, między 40 a 41 — prawie nic.
RRF_K = 60


class RagError(RuntimeError):
    """Nazwany powód, dla którego wyszukiwanie nie może się odbyć."""


@dataclass(frozen=True)
class SearchHit:
    chunk_id: int
    text: str
    source: str
    title: str
    chapter: str
    section: str
    page: int | None
    page_end: int | None
    tokens: int
    score: float
    dense_rank: int | None
    fts_rank: int | None


@dataclass
class IndexProgress:
    running: bool = False
    collection: str | None = None
    done: int = 0
    total: int = 0
    chunks: int = 0
    started_at: str | None = None
    finished_at: str | None = None
    error: str | None = None
    duration_ms: int | None = None


@dataclass
class RagDocument:
    """Jeden dokument do zaindeksowania — tekst w markdownie."""

    source: str
    text: str
    title: str = ""
    meta: dict[str, object] = field(default_factory=dict)


def _rrf(ranked: Sequence[Sequence[int]], weights: Sequence[float]) -> dict[int, float]:
    scores: dict[int, float] = {}
    for ids, weight in zip(ranked, weights, strict=True):
        for position, chunk_id in enumerate(ids, start=1):
            scores[chunk_id] = scores.get(chunk_id, 0.0) + weight / (RRF_K + position)
    return scores


class RagService:
    def __init__(self, settings: Settings, embedder: OnnxEmbedder | None = None) -> None:
        self.settings = settings
        self.spec: EmbeddingModelSpec | None = None
        self._store: RagStore | None = None
        self._embedder = embedder
        self._progress = IndexProgress()
        self._index_lock = threading.Lock()
        self._disabled_reason: str | None = None

        if not settings.rag_enabled:
            self._disabled_reason = "RAG wyłączony w konfiguracji (GATEWAY_RAG_ENABLED=0)"
            return
        try:
            self.spec = resolve_model(settings.rag_model)
        except ValueError as exc:
            self._disabled_reason = str(exc)
            return
        if embedder is None:
            self._embedder = OnnxEmbedder(
                self.spec,
                cache_dir=settings.rag_cache_dir,
                threads=settings.rag_threads,
                batch_size=settings.rag_batch_size,
            )

    # --- stan ----------------------------------------------------------------

    @property
    def enabled(self) -> bool:
        return (
            self._disabled_reason is None
            and self.spec is not None
            and self._embedder is not None
        )

    @property
    def disabled_reason(self) -> str | None:
        return self._disabled_reason

    @property
    def store(self) -> RagStore:
        """Plik bazy powstaje przy pierwszym użyciu, nie przy starcie gatewaya.

        Gateway wstaje też tam, gdzie nikt RAG-a nie tknie (i w testach) — nie ma
        powodu zakładać wtedy katalogu i pliku SQLite.
        """
        if self._store is None:
            if not self.enabled:
                raise RagError(self._disabled_reason or "RAG niedostępny")
            try:
                self._store = RagStore(Path(self.settings.rag_db_path))
            except Exception as exc:  # dysk tylko do odczytu, zła ścieżka…
                self._disabled_reason = f"nie udało się otworzyć bazy RAG: {exc}"
                raise RagError(self._disabled_reason) from exc
        return self._store

    @property
    def embedder(self) -> OnnxEmbedder:
        if self._embedder is None:
            raise RagError(self._disabled_reason or "RAG niedostępny")
        return self._embedder

    def _opened_store(self) -> RagStore | None:
        """Magazyn, ale wyłącznie jeśli już istnieje — do odczytu stanu."""
        if self._store is not None:
            return self._store
        if not self.enabled or not Path(self.settings.rag_db_path).exists():
            return None
        try:
            return self.store
        except RagError:
            return None

    def collections(self) -> list[CollectionStats]:
        store = self._opened_store()
        return store.collections() if store else []

    def indexed_model(self) -> str | None:
        store = self._opened_store()
        return store.get_meta(META_MODEL) if store else None

    def model_mismatch(self) -> bool:
        """Indeks zbudowany innym modelem jest bezużyteczny — wektory nie leżą w
        tej samej przestrzeni. Lepiej powiedzieć to wprost niż zwracać bzdury."""
        if self.spec is None or self._opened_store() is None:
            return False
        indexed = self.indexed_model()
        return bool(indexed) and indexed != self.spec.id and bool(self.collections())

    def progress(self) -> IndexProgress:
        return self._progress

    def status(self) -> dict[str, object]:
        return {
            "enabled": self.enabled,
            "reason": self._disabled_reason,
            "model": self.spec.id if self.spec else None,
            "dim": self.spec.dim if self.spec else None,
            "device": "cpu",
            "loaded": bool(self._embedder and self._embedder.loaded),
            "load_ms": self._embedder.load_ms if self._embedder else None,
            "last_error": self._embedder.last_error if self._embedder else None,
            "indexed_model": self.indexed_model(),
            "model_mismatch": self.model_mismatch(),
            "collections": [
                {
                    "name": stats.name,
                    "documents": stats.documents,
                    "chunks": stats.chunks,
                    "tokens": stats.tokens,
                    "indexed_at": stats.indexed_at,
                }
                for stats in self.collections()
            ],
            "indexing": {
                "running": self._progress.running,
                "collection": self._progress.collection,
                "done": self._progress.done,
                "total": self._progress.total,
                "chunks": self._progress.chunks,
                "error": self._progress.error,
                "finished_at": self._progress.finished_at,
                "duration_ms": self._progress.duration_ms,
            },
        }

    # --- wyszukiwanie --------------------------------------------------------

    async def search(
        self,
        query: str,
        *,
        collection: str = RULEBOOK_COLLECTION,
        top_k: int | None = None,
        weights: tuple[float, float] | None = None,
    ) -> list[SearchHit]:
        """`weights` to (semantyka, pełny tekst) — nadpisanie konfiguracji.

        Istnieje wyłącznie dla skryptu pomiarowego: żeby porównać hybrydę z samą
        semantyką, trzeba naprawdę wykonać dwa różne wyszukiwania, a nie przestawić
        kolejność w jednej piątce wyników. Pierwsza wersja pomiaru robiła to drugie
        i pokazywała nieprawdę.
        """
        if not self.enabled:
            raise RagError(self._disabled_reason or "RAG niedostępny")
        if self.model_mismatch():
            raise RagError(
                f"indeks zbudowano modelem {self.indexed_model()},"
                f" a skonfigurowany jest {self.spec.id if self.spec else '?'}"
                " — zaindeksuj ponownie"
            )
        text = query.strip()
        if not text:
            return []
        limit = top_k or self.settings.rag_top_k
        chosen = weights or (self.settings.rag_dense_weight, self.settings.rag_keyword_weight)
        return await asyncio.to_thread(self._search_blocking, text, collection, limit, chosen)

    def _search_blocking(
        self,
        query: str,
        collection: str,
        top_k: int,
        weights: tuple[float, float],
    ) -> list[SearchHit]:
        # Pula kandydatów jest szersza od wyniku: fuzja ma co łączyć, a koszt to
        # kilka milisekund na mnożeniu macierzy.
        pool = max(top_k * 4, 20)
        dense_weight, keyword_weight = weights

        dense_ids: list[int] = []
        if dense_weight > 0:
            ids, matrix = self.store.load_vectors(collection, self.embedder.dim)
            if ids:
                vector = self.embedder.encode_queries([query])[0]
                scores = matrix @ vector
                order = np.argsort(-scores)[:pool]
                dense_ids = [ids[int(index)] for index in order]

        fts_ids: list[int] = []
        if keyword_weight > 0:
            fts_ids = [
                chunk_id
                for chunk_id, _ in self.store.search_fts(collection, fts_query(query), pool)
            ]

        fused = _rrf((dense_ids, fts_ids), (dense_weight, keyword_weight))
        best = sorted(fused.items(), key=lambda item: -item[1])[:top_k]
        stored = self.store.fetch([chunk_id for chunk_id, _ in best])

        hits: list[SearchHit] = []
        for chunk_id, score in best:
            chunk = stored.get(chunk_id)
            if chunk is None:
                continue
            meta = chunk.meta
            hits.append(
                SearchHit(
                    chunk_id=chunk_id,
                    text=chunk.text,
                    source=chunk.source,
                    title=chunk.title,
                    chapter=str(meta.get("chapter", "")),
                    section=str(meta.get("section", "")),
                    page=_as_int(meta.get("page")),
                    page_end=_as_int(meta.get("page_end")),
                    tokens=chunk.tokens,
                    score=round(score, 6),
                    dense_rank=_rank_of(chunk_id, dense_ids),
                    fts_rank=_rank_of(chunk_id, fts_ids),
                )
            )
        return hits

    # --- indeksowanie --------------------------------------------------------

    async def index_documents(
        self, collection: str, documents: Iterable[RagDocument]
    ) -> IndexProgress:
        if not self.enabled:
            raise RagError(self._disabled_reason or "RAG niedostępny")
        docs = list(documents)
        if not self._index_lock.acquire(blocking=False):
            raise RagError("indeksowanie już trwa")
        try:
            return await asyncio.to_thread(self._index_blocking, collection, docs)
        finally:
            self._index_lock.release()

    async def index_rulebook(self) -> IndexProgress:
        directory = Path(self.settings.rag_rulebook_dir)
        if not directory.is_dir():
            raise RagError(f"nie znaleziono katalogu podręcznika: {directory}")
        files = sorted(directory.glob("*.md"))
        if not files:
            raise RagError(f"w katalogu {directory} nie ma plików .md")
        documents = [
            RagDocument(source=path.name, text=path.read_text(encoding="utf-8"))
            for path in files
        ]
        return await self.index_documents(RULEBOOK_COLLECTION, documents)

    def _index_blocking(self, collection: str, documents: list[RagDocument]) -> IndexProgress:
        started = time.perf_counter()
        self._progress = IndexProgress(
            running=True,
            collection=collection,
            total=len(documents),
            started_at=datetime.now(UTC).isoformat(timespec="seconds"),
        )
        try:
            self.embedder.load()
            self._reset_on_model_change()
            for document in documents:
                self._index_one(collection, document)
                self._progress.done += 1
        except EmbeddingError as exc:
            self._progress.error = str(exc)
            log.warning("indeksowanie przerwane: %s", exc)
        except Exception as exc:
            self._progress.error = f"{type(exc).__name__}: {exc}"
            log.exception("indeksowanie przerwane")
        finally:
            self._progress.running = False
            self._progress.finished_at = datetime.now(UTC).isoformat(timespec="seconds")
            self._progress.duration_ms = int((time.perf_counter() - started) * 1000)
        return self._progress

    def _index_one(self, collection: str, document: RagDocument) -> None:
        chunks = chunk_markdown(
            document.text,
            target_tokens=self.settings.rag_chunk_tokens,
            overlap_tokens=self.settings.rag_chunk_overlap,
            count_tokens=self.embedder.count_tokens,
        )
        if not chunks:
            self.store.delete_document(collection, document.source)
            return
        vectors = self.embedder.encode_passages([chunk.text for chunk in chunks])
        rows = [
            (
                chunk.text,
                {
                    "chapter": chunk.chapter,
                    "section": chunk.section,
                    "page": chunk.page,
                    "page_end": chunk.page_end,
                    "citation": chunk.citation,
                    **document.meta,
                },
                chunk.tokens,
            )
            for chunk in chunks
        ]
        title = document.title or (chunks[0].chapter if chunks else document.source)
        self.store.replace_document(collection, document.source, title, rows, vectors)
        self._progress.chunks += len(chunks)

    def _reset_on_model_change(self) -> None:
        """Zmiana modelu unieważnia wszystkie wektory naraz.

        Indeks jest pochodną materiału źródłowego, nie danymi samymi w sobie —
        odtwarza się jednym przebiegiem, więc kasujemy go głośno zamiast trzymać
        dwie nieporównywalne przestrzenie w jednym pliku.
        """
        assert self.spec is not None
        indexed = self.indexed_model()
        if indexed and indexed != self.spec.id:
            log.warning(
                "model embeddingów zmieniony (%s → %s) — czyszczę indeks", indexed, self.spec.id
            )
            for stats in self.collections():
                self.store.delete_collection(stats.name)
        self.store.set_meta(META_MODEL, self.spec.id)

    def delete_collection(self, collection: str) -> int:
        store = self._opened_store()
        return store.delete_collection(collection) if store else 0

    def close(self) -> None:
        if self._store is not None:
            self._store.close()
            self._store = None
        if self._embedder is not None:
            self._embedder.unload()


def _rank_of(chunk_id: int, ids: list[int]) -> int | None:
    try:
        return ids.index(chunk_id) + 1
    except ValueError:
        return None


def _as_int(value: object) -> int | None:
    return int(value) if isinstance(value, int | float) else None
