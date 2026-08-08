"""Magazyn fragmentów: jeden plik SQLite na wszystko.

**Dlaczego nie sqlite-vec ani Chroma** (wbrew pierwotnej wskazówce etapu 19):
przy jednej kampanii i kilku tysiącach fragmentów wyszukiwanie kosinusowe „każdy
z każdym" to jedno mnożenie macierzy — kilka milisekund na CPU. Indeks ANN
kupowałby zero, a kosztowałby ładowaną w locie bibliotekę natywną, której
`enable_load_extension` nie musi być dostępne w każdej instalacji Pythona.
Skala projektu jest znana i mała (CLAUDE.md: „prostota > skalowalność").

Wektory leżą w kolumnie BLOB jako `float32` znormalizowane do długości 1 — dzięki
temu kosinus to zwykły iloczyn skalarny, a `numpy` czyta całą kolekcję jednym
`frombuffer` bez pętli po wierszach.

Obok wektorów żyje **FTS5** z tym samym tekstem. To nie jest duplikat dla wygody:
pytania MG zawierają nazwy własne zasad („ablacja pancerza", „Ludzka tarcza"),
których model embeddingów nie odróżni od sąsiedniego akapitu o tym samym
temacie — dopiero fuzja obu rang trafia w to konkretne miejsce.
"""

from __future__ import annotations

import json
import re
import sqlite3
import threading
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

SCHEMA = """
CREATE TABLE IF NOT EXISTS documents (
  id          INTEGER PRIMARY KEY,
  collection  TEXT NOT NULL,
  source      TEXT NOT NULL,
  title       TEXT NOT NULL DEFAULT '',
  indexed_at  TEXT NOT NULL,
  UNIQUE (collection, source)
);

CREATE TABLE IF NOT EXISTS chunks (
  id          INTEGER PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  collection  TEXT NOT NULL,
  ordinal     INTEGER NOT NULL,
  text        TEXT NOT NULL,
  meta        TEXT NOT NULL DEFAULT '{}',
  tokens      INTEGER NOT NULL DEFAULT 0,
  vector      BLOB
);

CREATE INDEX IF NOT EXISTS chunks_by_collection ON chunks (collection);

-- Samodzielna tabela FTS (nie `content=`): kasujemy i wstawiamy całe dokumenty,
-- więc synchronizacja po rowid jest prostsza niż triggery na tabeli źródłowej.
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  text,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TABLE IF NOT EXISTS store_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
"""

WORD = re.compile(r"\w+", re.UNICODE)
# Polski jest fleksyjny, a FTS5 nie ma dla niego stemmera. Przycięcie końcówki i
# dopisanie `*` robi za ubogiego stemmera: „ablacja", „ablację" i „ablacji" trafiają
# na ten sam przedrostek. To celowo tępe narzędzie — od precyzji jest druga połowa
# hybrydy.
STEM_TRIM = 3
STEM_MIN = 4


@dataclass(frozen=True)
class StoredChunk:
    id: int
    collection: str
    source: str
    title: str
    ordinal: int
    text: str
    meta: dict[str, object]
    tokens: int


@dataclass(frozen=True)
class CollectionStats:
    name: str
    documents: int
    chunks: int
    tokens: int
    indexed_at: str | None


def fts_query(question: str, *, max_terms: int = 12) -> str:
    """Zapytanie FTS5 z pytania w naturalnym języku.

    Zwraca pusty łańcuch, gdy nie ma z czego zbudować zapytania — wołający ma
    wtedy pominąć część pełnotekstową, a nie wysyłać do SQLite śmieci.
    """
    terms: list[str] = []
    for match in WORD.finditer(question.lower()):
        word = match.group(0)
        if len(word) < 3 or word.isdigit() and len(word) < 2:
            continue
        stem = word[: max(STEM_MIN, len(word) - STEM_TRIM)]
        term = f"{stem}*" if len(stem) < len(word) else word
        if term not in terms:
            terms.append(term)
        if len(terms) >= max_terms:
            break
    return " OR ".join(terms)


class RagStore:
    """Cienka warstwa nad SQLite. Wątkobezpieczna przez jeden zamek — indeksowanie
    chodzi w wątku roboczym, a `/rag/search` w pętli zdarzeń."""

    def __init__(self, path: Path) -> None:
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._db = sqlite3.connect(path, check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        with self._lock:
            self._db.execute("PRAGMA journal_mode = WAL")
            self._db.execute("PRAGMA foreign_keys = ON")
            self._db.executescript(SCHEMA)
            self._db.commit()

    def close(self) -> None:
        with self._lock:
            self._db.close()

    # --- metadane magazynu ---------------------------------------------------

    def get_meta(self, key: str) -> str | None:
        with self._lock:
            row = self._db.execute("SELECT value FROM store_meta WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else None

    def set_meta(self, key: str, value: str) -> None:
        with self._lock:
            self._db.execute(
                "INSERT INTO store_meta (key, value) VALUES (?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, value),
            )
            self._db.commit()

    # --- zapis ---------------------------------------------------------------

    def replace_document(
        self,
        collection: str,
        source: str,
        title: str,
        chunks: list[tuple[str, dict[str, object], int]],
        vectors: np.ndarray | None,
    ) -> int:
        """Wstawia dokument, zastępując poprzednią wersję.

        Ponowne indeksowanie tego samego pliku ma dawać ten sam wynik, a nie drugi
        komplet fragmentów — stąd kasowanie po `(kolekcja, źródło)`, nie po id.
        """
        if vectors is not None and len(vectors) != len(chunks):
            raise ValueError("liczba wektorów nie zgadza się z liczbą fragmentów")

        now = datetime.now(UTC).isoformat(timespec="seconds")
        with self._lock:
            self.delete_document(collection, source, commit=False)
            cursor = self._db.execute(
                "INSERT INTO documents (collection, source, title, indexed_at) VALUES (?, ?, ?, ?)",
                (collection, source, title, now),
            )
            document_id = int(cursor.lastrowid or 0)
            for index, (text, meta, tokens) in enumerate(chunks):
                blob = (
                    np.asarray(vectors[index], dtype=np.float32).tobytes()
                    if vectors is not None
                    else None
                )
                chunk_cursor = self._db.execute(
                    "INSERT INTO chunks"
                    " (document_id, collection, ordinal, text, meta, tokens, vector)"
                    " VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (
                        document_id,
                        collection,
                        index,
                        text,
                        json.dumps(meta, ensure_ascii=False),
                        tokens,
                        blob,
                    ),
                )
                self._db.execute(
                    "INSERT INTO chunks_fts (rowid, text) VALUES (?, ?)",
                    (chunk_cursor.lastrowid, text),
                )
            self._db.commit()
        return document_id

    def delete_document(self, collection: str, source: str, *, commit: bool = True) -> int:
        with self._lock:
            rows = self._db.execute(
                "SELECT id FROM chunks WHERE collection = ? AND document_id IN"
                " (SELECT id FROM documents WHERE collection = ? AND source = ?)",
                (collection, collection, source),
            ).fetchall()
            for row in rows:
                self._db.execute("DELETE FROM chunks_fts WHERE rowid = ?", (row["id"],))
            self._db.execute(
                "DELETE FROM documents WHERE collection = ? AND source = ?", (collection, source)
            )
            if commit:
                self._db.commit()
        return len(rows)

    def delete_collection(self, collection: str) -> int:
        with self._lock:
            rows = self._db.execute(
                "SELECT id FROM chunks WHERE collection = ?", (collection,)
            ).fetchall()
            for row in rows:
                self._db.execute("DELETE FROM chunks_fts WHERE rowid = ?", (row["id"],))
            self._db.execute("DELETE FROM documents WHERE collection = ?", (collection,))
            self._db.commit()
        return len(rows)

    # --- odczyt --------------------------------------------------------------

    def collections(self) -> list[CollectionStats]:
        with self._lock:
            rows = self._db.execute(
                "SELECT c.collection AS name,"
                "       COUNT(DISTINCT c.document_id) AS documents,"
                "       COUNT(*) AS chunks,"
                "       COALESCE(SUM(c.tokens), 0) AS tokens,"
                "       MAX(d.indexed_at) AS indexed_at"
                "  FROM chunks c JOIN documents d ON d.id = c.document_id"
                " GROUP BY c.collection ORDER BY c.collection",
            ).fetchall()
        return [
            CollectionStats(
                name=row["name"],
                documents=row["documents"],
                chunks=row["chunks"],
                tokens=row["tokens"],
                indexed_at=row["indexed_at"],
            )
            for row in rows
        ]

    def load_vectors(self, collection: str, dim: int) -> tuple[list[int], np.ndarray]:
        """Cała kolekcja jako jedna macierz. Przy 4 000 fragmentów to 16 MB."""
        with self._lock:
            rows = self._db.execute(
                "SELECT id, vector FROM chunks WHERE collection = ? AND vector IS NOT NULL"
                " ORDER BY id",
                (collection,),
            ).fetchall()
        if not rows:
            return [], np.zeros((0, dim), dtype=np.float32)
        ids = [int(row["id"]) for row in rows]
        matrix = np.frombuffer(b"".join(row["vector"] for row in rows), dtype=np.float32)
        return ids, matrix.reshape(len(ids), dim)

    def search_fts(self, collection: str, query: str, limit: int) -> list[tuple[int, float]]:
        """Identyfikatory posortowane po BM25 (im mniej, tym lepiej u SQLite)."""
        if not query:
            return []
        with self._lock:
            try:
                rows = self._db.execute(
                    "SELECT f.rowid AS id, bm25(chunks_fts) AS score"
                    "  FROM chunks_fts f JOIN chunks c ON c.id = f.rowid"
                    " WHERE chunks_fts MATCH ? AND c.collection = ?"
                    " ORDER BY score LIMIT ?",
                    (query, collection, limit),
                ).fetchall()
            except sqlite3.OperationalError:
                # Nieparsowalne zapytanie FTS nie może wywrócić wyszukiwania —
                # zostaje sama część wektorowa.
                return []
        return [(int(row["id"]), float(row["score"])) for row in rows]

    def fetch(self, ids: list[int]) -> dict[int, StoredChunk]:
        if not ids:
            return {}
        placeholders = ",".join("?" * len(ids))
        with self._lock:
            rows = self._db.execute(
                "SELECT c.id, c.collection, c.ordinal, c.text, c.meta, c.tokens,"
                "       d.source, d.title"
                "  FROM chunks c JOIN documents d ON d.id = c.document_id"
                f" WHERE c.id IN ({placeholders})",
                ids,
            ).fetchall()
        return {
            int(row["id"]): StoredChunk(
                id=int(row["id"]),
                collection=row["collection"],
                source=row["source"],
                title=row["title"],
                ordinal=int(row["ordinal"]),
                text=row["text"],
                meta=json.loads(row["meta"]),
                tokens=int(row["tokens"]),
            )
            for row in rows
        }
