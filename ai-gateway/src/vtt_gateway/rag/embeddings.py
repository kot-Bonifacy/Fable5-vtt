"""Embeddingi na CPU przez onnxruntime.

**Dlaczego CPU, a nie GPU** (decyzja MG, etap 19a): model embeddingów na GPU
zjadłby rezerwę, która trzyma kontekst 32k przy życiu. Na CPU kosztuje kilka
minut jednorazowego indeksowania i ułamek sekundy na zapytanie — przy limicie
15 s na odpowiedź to nie jest wąskie gardło.

**Dlaczego nie sentence-transformers:** ciągnie za sobą torch (setki MB), a oba
kandydujące modele mają na HuggingFace gotowy eksport ONNX, więc wystarczy
`onnxruntime`, tokenizer i klient HF.
"""

from __future__ import annotations

import logging
import threading
import time
from pathlib import Path

import numpy as np

from .models import EmbeddingModelSpec

log = logging.getLogger(__name__)


class EmbeddingError(RuntimeError):
    """Model embeddingów niedostępny — RAG ma się wyłączyć, nie wywrócić gatewaya."""


class OnnxEmbedder:
    """Leniwie ładowany model embeddingów. Ładowanie i liczenie są blokujące —
    wołający owija je w `asyncio.to_thread`."""

    def __init__(
        self,
        spec: EmbeddingModelSpec,
        *,
        cache_dir: Path | None = None,
        threads: int = 0,
        batch_size: int = 8,
    ) -> None:
        self.spec = spec
        self._cache_dir = cache_dir
        self._threads = threads
        self._batch_size = max(1, batch_size)
        self._lock = threading.Lock()
        self._session: object | None = None
        self._tokenizer: object | None = None
        self._counter: object | None = None
        self._input_names: tuple[str, ...] = ()
        self._load_ms: int | None = None
        self._last_error: str | None = None

    # --- stan ----------------------------------------------------------------

    @property
    def loaded(self) -> bool:
        return self._session is not None

    @property
    def dim(self) -> int:
        return self.spec.dim

    @property
    def last_error(self) -> str | None:
        return self._last_error

    @property
    def load_ms(self) -> int | None:
        return self._load_ms

    # --- ładowanie -----------------------------------------------------------

    def load(self) -> None:
        if self._session is not None:
            return
        with self._lock:
            if self._session is not None:
                return
            started = time.perf_counter()
            try:
                model_path, tokenizer_path = self._download()
                self._tokenizer = self._build_tokenizer(tokenizer_path)
                self._session = self._build_session(model_path)
            except EmbeddingError:
                raise
            except Exception as exc:  # ImportError, sieć, uszkodzony plik…
                self._last_error = f"{type(exc).__name__}: {exc}"
                raise EmbeddingError(
                    f"nie udało się wczytać modelu {self.spec.id}: {exc}"
                ) from exc
            self._load_ms = int((time.perf_counter() - started) * 1000)
            self._last_error = None
            log.info(
                "model embeddingów %s gotowy (%d ms, CPU, %d wymiarów)",
                self.spec.id,
                self._load_ms,
                self.spec.dim,
            )

    def unload(self) -> None:
        with self._lock:
            self._session = None
            self._tokenizer = None
            self._counter = None
            self._input_names = ()

    def count_tokens(self, text: str) -> int:
        """Prawdziwa długość tekstu w tokenach modelu — miara dla chunkera.

        Osobna instancja tokenizera, bo ta używana do liczenia embeddingów ma
        włączone obcinanie do `max_tokens` i odpowiadałaby „512" na wszystko
        dłuższe. Chunker musi wiedzieć, że fragment ma 900 tokenów, żeby go
        podzielić, zanim obcinanie wejdzie w grę.
        """
        counter = self._counter
        if counter is None:
            from tokenizers import Tokenizer

            counter = Tokenizer.from_file(str(self._tokenizer_path()))
            self._counter = counter
        return len(counter.encode(text).ids)  # type: ignore[attr-defined]

    def _tokenizer_path(self) -> Path:
        from huggingface_hub import hf_hub_download

        kwargs = {"repo_id": self.spec.repo}
        if self._cache_dir is not None:
            kwargs["cache_dir"] = str(self._cache_dir)
        return Path(hf_hub_download(filename=self.spec.tokenizer_file, **kwargs))

    def _download(self) -> tuple[Path, Path]:
        try:
            from huggingface_hub import hf_hub_download
        except ImportError as exc:  # pragma: no cover - zależność jest w pyproject
            raise EmbeddingError("brak pakietu huggingface_hub") from exc

        kwargs = {"repo_id": self.spec.repo}
        if self._cache_dir is not None:
            kwargs["cache_dir"] = str(self._cache_dir)

        # Wagi zewnętrzne (`model.onnx_data`) muszą wylądować obok grafu — hf_hub_download
        # odtwarza układ katalogów repozytorium, więc wystarczy pobrać oba pliki.
        model_path = Path(hf_hub_download(filename=self.spec.onnx_file, **kwargs))
        for extra in self.spec.extra_files:
            hf_hub_download(filename=extra, **kwargs)
        tokenizer_path = Path(hf_hub_download(filename=self.spec.tokenizer_file, **kwargs))
        return model_path, tokenizer_path

    def _build_tokenizer(self, path: Path) -> object:
        from tokenizers import Tokenizer

        tokenizer = Tokenizer.from_file(str(path))
        tokenizer.enable_truncation(max_length=self.spec.max_tokens)
        tokenizer.enable_padding(pad_id=self._pad_id(tokenizer), pad_token="<pad>")
        return tokenizer

    @staticmethod
    def _pad_id(tokenizer: object) -> int:
        for token in ("<pad>", "[PAD]"):
            found = tokenizer.token_to_id(token)  # type: ignore[attr-defined]
            if found is not None:
                return int(found)
        return 0

    def _build_session(self, path: Path) -> object:
        import onnxruntime as ort

        options = ort.SessionOptions()
        if self._threads > 0:
            options.intra_op_num_threads = self._threads
        options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        session = ort.InferenceSession(
            str(path), sess_options=options, providers=["CPUExecutionProvider"]
        )
        self._input_names = tuple(item.name for item in session.get_inputs())
        return session

    # --- liczenie ------------------------------------------------------------

    def encode_queries(self, texts: list[str]) -> np.ndarray:
        return self._encode([self.spec.query_prefix + text for text in texts])

    def encode_passages(self, texts: list[str]) -> np.ndarray:
        return self._encode([self.spec.passage_prefix + text for text in texts])

    def _encode(self, texts: list[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, self.spec.dim), dtype=np.float32)
        self.load()
        chunks = [
            self._encode_batch(texts[start : start + self._batch_size])
            for start in range(0, len(texts), self._batch_size)
        ]
        return np.vstack(chunks)

    def _encode_batch(self, texts: list[str]) -> np.ndarray:
        assert self._tokenizer is not None and self._session is not None
        encodings = self._tokenizer.encode_batch(texts)  # type: ignore[attr-defined]
        input_ids = np.array([item.ids for item in encodings], dtype=np.int64)
        attention = np.array([item.attention_mask for item in encodings], dtype=np.int64)

        feeds: dict[str, np.ndarray] = {}
        if "input_ids" in self._input_names:
            feeds["input_ids"] = input_ids
        if "attention_mask" in self._input_names:
            feeds["attention_mask"] = attention
        if "token_type_ids" in self._input_names:
            feeds["token_type_ids"] = np.zeros_like(input_ids)

        outputs = self._session.run(None, feeds)  # type: ignore[attr-defined]
        hidden = self._pick_output(outputs)
        pooled = self._pool(hidden, attention)
        return _l2_normalize(pooled)

    @staticmethod
    def _pick_output(outputs: list[np.ndarray]) -> np.ndarray:
        """Eksporty ONNX różnią się liczbą i kolejnością wyjść.

        Bierzemy pierwsze trójwymiarowe `(batch, tokeny, wymiar)` — z niego umiemy
        zrobić oba poolingi. Gotowe wektory zdaniowe `(batch, wymiar)` przyjmujemy
        tylko wtedy, gdy nic innego nie ma, bo nie wiadomo, jaki pooling zastosował
        eksporter.
        """
        for output in outputs:
            if getattr(output, "ndim", 0) == 3:
                return output
        for output in outputs:
            if getattr(output, "ndim", 0) == 2:
                return output[:, None, :]
        raise EmbeddingError("model ONNX nie zwrócił rozpoznawalnego wyjścia")

    def _pool(self, hidden: np.ndarray, attention: np.ndarray) -> np.ndarray:
        if hidden.shape[1] == 1:
            return hidden[:, 0, :].astype(np.float32)
        if self.spec.pooling == "cls":
            return hidden[:, 0, :].astype(np.float32)
        mask = attention.astype(np.float32)[:, : hidden.shape[1], None]
        summed = (hidden.astype(np.float32) * mask).sum(axis=1)
        counts = np.clip(mask.sum(axis=1), 1e-9, None)
        return summed / counts


def _l2_normalize(matrix: np.ndarray) -> np.ndarray:
    """Po normalizacji kosinus to zwykły iloczyn skalarny — magazyn na tym stoi."""
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    return (matrix / np.clip(norms, 1e-12, None)).astype(np.float32)
