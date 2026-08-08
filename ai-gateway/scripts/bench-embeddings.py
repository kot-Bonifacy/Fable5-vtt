"""Porównanie modeli embeddingów na polskich pytaniach o zasady (etap 19a).

    cd ai-gateway
    uv run python scripts/bench-embeddings.py
    uv run python scripts/bench-embeddings.py --questions ../data/public/rag/bench-questions.json

Dla każdego modelu: indeksuje podręcznik do osobnego pliku bazy, zadaje zestaw pytań
i liczy, jak często oczekiwana sekcja znalazła się w wynikach. Mierzy też czas
indeksowania i czas zapytania — bo „lepszy model" wolniejszy o rząd wielkości
przestaje być lepszy przy limicie 15 s na odpowiedź.

Osobno raportuje trzy tryby: same wektory, sam pełny tekst i hybrydę — to jest
dowód (albo kontrdowód) na decyzję z rozstrzygnięcia 2 opisu etapu.

Zestaw pytań odwołujący się do prawdziwego podręcznika trzymamy w
`data/private/rag/bench-questions.json` (poza repo — prawa autorskie). W repo
leży próbka o tym samym kształcie.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from dataclasses import dataclass
from pathlib import Path

from vtt_gateway.config import Settings
from vtt_gateway.rag.models import EMBEDDING_MODELS
from vtt_gateway.rag.service import RagDocument, RagService

DEFAULT_QUESTIONS = [
    Path("../data/private/rag/bench-questions.json"),
    Path("../data/public/rag/bench-questions.json"),
]

# Tryb, którego pierwsze trafienie wypisujemy przy każdym pytaniu i którego czas
# mierzymy. To ustawienie produkcyjne — reszta trybów jest tu dla porównania.
REPORTED_MODE = "hybryda 1,0/0,30"


@dataclass
class Question:
    query: str
    section: str | None
    chapter: str | None
    pages: tuple[int, ...]

    def matches(self, hit: object) -> bool:
        if self.section and self.section.lower() in str(getattr(hit, "section", "")).lower():
            return True
        if self.chapter and self.chapter.lower() in str(getattr(hit, "chapter", "")).lower():
            return True
        # Numer strony jest odporniejszy od tytułu sekcji: zrzut podręcznika bywa
        # przekręcony przez OCR („ANY I ŚMIERĆ" zamiast „RANY I ŚMIERĆ"), a strona
        # zawsze się zgadza.
        start = getattr(hit, "page", None)
        end = getattr(hit, "page_end", None) or start
        if start is not None:
            return any(start <= page <= end for page in self.pages)
        return False


def load_questions(path: Path) -> tuple[str, list[Question]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    questions = []
    for item in data["questions"]:
        expect = item.get("expect", {})
        pages = expect.get("pages") or ([expect["page"]] if "page" in expect else [])
        questions.append(
            Question(
                query=item["query"],
                section=expect.get("section"),
                chapter=expect.get("chapter"),
                pages=tuple(pages),
            )
        )
    return data.get("collection", "rulebook"), questions


def find_questions(explicit: Path | None) -> Path:
    if explicit is not None:
        return explicit
    for candidate in DEFAULT_QUESTIONS:
        if candidate.exists():
            return candidate
    known = ", ".join(str(path) for path in DEFAULT_QUESTIONS)
    raise SystemExit(f"nie znalazłem zestawu pytań (szukałem: {known})")


@dataclass
class ModeScore:
    hits: int = 0
    reciprocal: float = 0.0

    def add(self, rank: int | None) -> None:
        if rank is not None:
            self.hits += 1
            self.reciprocal += 1 / rank

    def line(self, total: int) -> str:
        return f"trafień {self.hits}/{total}  MRR {self.reciprocal / max(total, 1):.3f}"


async def bench_model(
    model_id: str,
    manual_dir: Path,
    db_dir: Path,
    collection: str,
    questions: list[Question],
    top_k: int,
    reuse: bool,
) -> None:
    settings = Settings(
        rag_model=model_id,
        rag_db_path=db_dir / f"bench-{model_id}.sqlite3",
        rag_rulebook_dir=manual_dir,
        rag_top_k=top_k,
    )
    service = RagService(settings)
    print(f"\n=== {model_id} ===")

    existing = next((item for item in service.collections() if item.name == collection), None)
    if reuse and existing and not service.model_mismatch():
        print(f"  indeks: {existing.chunks} fragmentów (gotowy, pomijam indeksowanie)")
    else:
        started = time.perf_counter()
        files = sorted(manual_dir.glob("*.md"))
        documents = [
            RagDocument(source=path.name, text=path.read_text(encoding="utf-8")) for path in files
        ]
        progress = await service.index_documents(collection, documents)
        if progress.error:
            print(f"  BŁĄD indeksowania: {progress.error}")
            service.close()
            return
        index_s = time.perf_counter() - started
        print(
            f"  indeks: {progress.chunks} fragmentów z {progress.done} plików"
            f" w {index_s:.1f} s ({progress.chunks / max(index_s, 0.001):.1f} frag./s)"
        )

    # Każdy tryb to OSOBNE wyszukiwanie z własnymi wagami — inaczej „same wektory"
    # znaczyłoby tylko „przestaw kolejność w piątce, którą wybrała hybryda", a to
    # mierzy co innego niż się wydaje.
    modes: list[tuple[str, tuple[float, float]]] = [
        ("same wektory", (1.0, 0.0)),
        ("sam FTS", (0.0, 1.0)),
        *(
            (f"hybryda 1,0/{weight:.2f}".replace(".", ","), (1.0, weight))
            for weight in (0.15, 0.3, 0.5, 0.7)
        ),
    ]
    scores = {name: ModeScore() for name, _ in modes}
    latencies: list[float] = []

    for question in questions:
        best_line = "—"
        for name, weights in modes:
            query_started = time.perf_counter()
            hits = await service.search(
                question.query, collection=collection, top_k=top_k, weights=weights
            )
            if name == REPORTED_MODE:
                latencies.append((time.perf_counter() - query_started) * 1000)
                best = hits[0] if hits else None
                best_line = f"{best.chapter} › {best.section}" if best else "—"
                mark = "✓" if hits and question.matches(hits[0]) else " "
            scores[name].add(_first_match(question, hits))
        print(f"  {mark} {question.query[:52]:<52} → {best_line[:56]}")

    total = len(questions)
    for name, _ in modes:
        print(f"  {name:<16} {scores[name].line(total)}")
    latencies.sort()
    print(
        f"  zapytanie: mediana {latencies[len(latencies) // 2]:.0f} ms,"
        f" najwolniejsze {latencies[-1]:.0f} ms"
    )
    service.close()


def _first_match(question: Question, hits: list) -> int | None:
    """Pozycja pierwszego trafnego wyniku (1-based) albo None, gdy nie ma go w top-k."""
    for position, hit in enumerate(hits, start=1):
        if question.matches(hit):
            return position
    return None


async def main() -> None:
    # Konsola Windows przekierowana do pliku ma kodowanie cp1250 i wywraca się na
    # strzałce w wyniku. Raport jest po polsku, więc UTF-8 nie podlega negocjacji.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--questions", type=Path, default=None)
    parser.add_argument(
        "--manual",
        type=Path,
        default=Path("../data/private/rulebook/manual/CPRED-podrecznik"),
    )
    parser.add_argument("--db-dir", type=Path, default=Path("../.rag-bench"))
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument("--models", nargs="*", default=sorted(EMBEDDING_MODELS))
    parser.add_argument(
        "--reuse",
        action="store_true",
        help="nie indeksuj ponownie, jeśli baza dla modelu już istnieje"
        " (indeksowanie na CPU to kilka minut na model)",
    )
    args = parser.parse_args()

    if not args.manual.is_dir():
        raise SystemExit(f"nie znalazłem katalogu podręcznika: {args.manual}")
    collection, questions = load_questions(find_questions(args.questions))
    args.db_dir.mkdir(parents=True, exist_ok=True)

    print(f"Zestaw: {len(questions)} pytań · top-k {args.top_k} · kolekcja {collection}")
    for model_id in args.models:
        await bench_model(
            model_id, args.manual, args.db_dir, collection, questions, args.top_k, args.reuse
        )


if __name__ == "__main__":
    asyncio.run(main())
