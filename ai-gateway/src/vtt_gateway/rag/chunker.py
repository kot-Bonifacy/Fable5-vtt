"""Cięcie materiału na fragmenty nadające się do cytowania.

Są dwa tryby, bo są dwa rodzaje materiału.

**Markdown** (etap 19a) — podręcznik z etapu 13 (`tools/rulebook/build-manual.mjs`)
ma trzy rzeczy, na których opiera się połowa tego pliku: nagłówki `#`/`##`/`###`,
znaczniki stron w komentarzach `<!-- s. N -->` i tabele w składni pipe. Dzięki nim
cytat „rozdział · sekcja · s. N" bierze się z materiału, a nie ze zgadywania.

**Płaski tekst** (etap 19b) — FAQ i dodatki DLC są zrzutami z PDF-a: żadnych
nagłówków, znaczniki stron `=== page N ===`, akapity porozrywane na linie i
przenoszone z dzieleniem wyrazu. Cytat schodzi tu do „tytuł, s. N", bo więcej z
materiału nie da się uczciwie wyczytać.

Wspólne trzy zasady cięcia:
 1. **Nagłówek zawsze zaczyna nowy fragment.** Sekcja jest jednostką sensu i
    jednostką cytatu — sklejenie dwóch sekcji dałoby cytat wskazujący nie to miejsce.
    (W płaskim tekście nagłówków nie ma, więc granicą jest sam budżet tokenów.)
 2. **Tabela jedzie w całości.** Pół tabeli obrażeń to gorzej niż brak tabeli.
 3. **Fragment nosi swoją ścieżkę w treści.** Pierwsza linia to „rozdział › sekcja
    (s. N)", więc embedding widzi temat, a wyszukiwanie pełnotekstowe łapie nazwę
    sekcji tak samo jak słowa z akapitu.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from collections.abc import Callable, Iterable, Iterator
from dataclasses import dataclass

PAGE_MARKER = re.compile(r"^<!--\s*s\.\s*(\d+)\s*-->\s*$")
HEADING = re.compile(r"^(#{1,6})\s+(.*\S)\s*$")
# Ostatnia linia rozdziału z build-manual.mjs bywa czystym znacznikiem HTML-owym.
HTML_COMMENT = re.compile(r"^<!--.*-->\s*$")

# Znacznik strony w zrzutach z PDF-a (`tools/rulebook/*` i pdftotext -layout).
PLAIN_PAGE_MARKER = re.compile(r"^=+\s*page\s+(\d+)\s*=+$", re.IGNORECASE)
# Przeniesienie wyrazu na koniec linii: „zauwa-" + „żymy" → „zauważymy".
LINE_HYPHEN = re.compile(r"(\w)[-‐‑]$")

# ~3,6 znaku na token to ta sama stała, której używa podgląd promptu w edytorze
# botów (`estimatePromptTokens` w packages/shared) — pomiary etapu 09 na polskim.
CHARS_PER_TOKEN = 3.6


def estimate_tokens(text: str) -> int:
    """Zgrubna miara długości. Prawdziwy tokenizer wstrzykuje indekser."""
    return max(1, round(len(text) / CHARS_PER_TOKEN))


TokenCounter = Callable[[str], int]


@dataclass(frozen=True)
class Chunk:
    text: str
    ordinal: int
    chapter: str
    section: str
    page: int | None
    page_end: int | None
    tokens: int

    @property
    def citation(self) -> str:
        where = " › ".join(part for part in (self.chapter, self.section) if part)
        if self.page is None:
            return where
        pages = (
            f"s. {self.page}"
            if self.page == self.page_end
            else f"s. {self.page}–{self.page_end}"
        )
        return f"{where} ({pages})" if where else pages


@dataclass
class _Block:
    """Akapit albo tabela razem z miejscem, w którym się zaczyna."""

    text: str
    chapter: str
    section: str
    page: int | None
    is_table: bool


def _iter_blocks(markdown: str) -> Iterator[_Block]:
    chapter = ""
    stack: list[str] = []
    page: int | None = None
    paragraph: list[str] = []
    table: list[str] = []

    def section() -> str:
        return " › ".join(stack)

    def flush_paragraph() -> Iterator[_Block]:
        nonlocal paragraph
        if paragraph:
            text = "\n".join(paragraph).strip()
            paragraph = []
            if text:
                yield _Block(text, chapter, section(), page, is_table=False)

    def flush_table() -> Iterator[_Block]:
        nonlocal table
        if table:
            text = "\n".join(table).strip()
            table = []
            if text:
                yield _Block(text, chapter, section(), page, is_table=True)

    for raw in markdown.splitlines():
        line = raw.rstrip()

        marker = PAGE_MARKER.match(line)
        if marker:
            # Numer strony zmienia się MIĘDZY blokami — akapit rozpoczęty na
            # poprzedniej stronie zostaje przypisany do niej.
            yield from flush_paragraph()
            yield from flush_table()
            page = int(marker.group(1))
            continue

        if HTML_COMMENT.match(line):
            continue

        heading = HEADING.match(line)
        if heading:
            yield from flush_paragraph()
            yield from flush_table()
            level = len(heading.group(1))
            title = heading.group(2)
            if level == 1:
                chapter = title
                stack = []
            else:
                del stack[level - 2 :]
                stack.append(title)
            continue

        is_table_row = line.lstrip().startswith("|")
        if is_table_row:
            yield from flush_paragraph()
            table.append(line)
            continue
        yield from flush_table()

        if not line.strip():
            yield from flush_paragraph()
            continue
        paragraph.append(line)

    yield from flush_paragraph()
    yield from flush_table()


def _header_line(chapter: str, section: str, page: int | None) -> str:
    where = " › ".join(part for part in (chapter, section) if part)
    if page is not None:
        where = f"{where} (s. {page})" if where else f"(s. {page})"
    return where


def _emit(
    blocks: list[_Block],
    ordinal: int,
    count_tokens: TokenCounter,
) -> Chunk:
    first = blocks[0]
    pages = [block.page for block in blocks if block.page is not None]
    header = _header_line(first.chapter, first.section, first.page)
    body = "\n\n".join(block.text for block in blocks)
    text = f"{header}\n\n{body}" if header else body
    return Chunk(
        text=text,
        ordinal=ordinal,
        chapter=first.chapter,
        section=first.section,
        page=min(pages) if pages else None,
        page_end=max(pages) if pages else None,
        tokens=count_tokens(text),
    )


def _overlap_tail(blocks: list[_Block], budget: int, count_tokens: TokenCounter) -> list[_Block]:
    """Ostatnie akapity poprzedniego fragmentu, mieszczące się w zakładce.

    Tabeli nie powtarzamy: jest duża, a jej sens nie wycieka na sąsiedni fragment.
    """
    if budget <= 0:
        return []
    tail: list[_Block] = []
    used = 0
    for block in reversed(blocks):
        if block.is_table:
            break
        cost = count_tokens(block.text)
        if used + cost > budget:
            break
        tail.insert(0, block)
        used += cost
    return tail


def chunk_markdown(
    markdown: str,
    *,
    target_tokens: int = 450,
    overlap_tokens: int = 60,
    count_tokens: TokenCounter | None = None,
) -> list[Chunk]:
    """Tnie jeden rozdział podręcznika na fragmenty gotowe do zaindeksowania."""
    return _assemble(
        _iter_blocks(markdown),
        target_tokens=target_tokens,
        overlap_tokens=overlap_tokens,
        counter=count_tokens or estimate_tokens,
    )


def _assemble(
    blocks: Iterable[_Block],
    *,
    target_tokens: int,
    overlap_tokens: int,
    counter: TokenCounter,
) -> list[Chunk]:
    """Skleja bloki we fragmenty mieszczące się w budżecie tokenów."""
    chunks: list[Chunk] = []
    current: list[_Block] = []
    used = 0
    context: tuple[str, str] | None = None

    def flush() -> None:
        nonlocal current, used
        if current:
            chunks.append(_emit(current, len(chunks), counter))
        current = []
        used = 0

    for block in blocks:
        cost = counter(block.text)
        here = (block.chapter, block.section)

        if context is not None and here != context:
            # Zasada 1: nagłówek zawsze zaczyna nowy fragment — bez zakładki,
            # bo sąsiednia sekcja jest o czym innym.
            flush()
        elif current and used + cost > target_tokens:
            previous = current
            flush()
            current = _overlap_tail(previous, overlap_tokens, counter)
            used = sum(counter(item.text) for item in current)

        context = here
        current.append(block)
        used += cost

        # Zasada 2: tabela większa od budżetu i tak jedzie w całości — po niej
        # domykamy fragment, żeby nie doklejać do niej niezwiązanego akapitu.
        if block.is_table and used >= target_tokens:
            flush()

    flush()
    # Numeracja musi być ciągła po odrzuceniu pustych fragmentów.
    return [
        Chunk(
            text=chunk.text,
            ordinal=index,
            chapter=chunk.chapter,
            section=chunk.section,
            page=chunk.page,
            page_end=chunk.page_end,
            tokens=chunk.tokens,
        )
        for index, chunk in enumerate(chunks)
        if chunk.text.strip()
    ]


def chunk_documents(
    documents: Iterable[tuple[str, str]],
    **kwargs: object,
) -> Iterator[tuple[str, list[Chunk]]]:
    """`(źródło, markdown)` → `(źródło, fragmenty)`. Wygoda dla indeksera."""
    for source, markdown in documents:
        yield source, chunk_markdown(markdown, **kwargs)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Płaski tekst (etap 19b)
# ---------------------------------------------------------------------------


def _split_pages(text: str) -> list[tuple[int | None, list[str]]]:
    """Rozbija zrzut na strony po znacznikach `=== page N ===`."""
    pages: list[tuple[int | None, list[str]]] = []
    number: int | None = None
    lines: list[str] = []
    for raw in text.splitlines():
        marker = PLAIN_PAGE_MARKER.match(raw.strip())
        if marker:
            if lines:
                pages.append((number, lines))
            number = int(marker.group(1))
            lines = []
            continue
        lines.append(raw.rstrip())
    if lines:
        pages.append((number, lines))
    return pages


def _running_lines(pages: list[tuple[int | None, list[str]]]) -> set[str]:
    """Żywa pagina i stopka — linie powtarzające się na większości stron.

    Nagłówek „CYBERPUNK RED FAQ" wklejony na każdej z 30 stron jest w indeksie
    czystym szumem: trafia we WSZYSTKIE zapytania o cokolwiek z tego dokumentu.
    Wykrywanie po częstości jest ogólne — nie trzeba znać żadnego z dokumentów.
    """
    if len(pages) < 4:
        return set()
    counts: Counter[str] = Counter()
    for _, lines in pages:
        # Unikaty w obrębie strony: powtórzenie w tabeli nie może udawać paginy.
        counts.update({line.strip() for line in lines if line.strip()})
    limit = max(3, math.ceil(len(pages) * 0.5))
    return {line for line, seen in counts.items() if seen >= limit and len(line) <= 120}


def _join_run(lines: list[str]) -> str:
    """Skleja linie jednego akapitu, zdejmując przeniesienia wyrazów."""
    text = ""
    for line in lines:
        piece = line.strip()
        if not text:
            text = piece
            continue
        hyphen = LINE_HYPHEN.search(text)
        # „zauwa-" + „żymy" to jedno słowo; „ZASADY-" + „Ogólne" (wersalik po
        # myślniku) to dwie rzeczy, których nie wolno skleić.
        if hyphen and piece[:1].islower():
            text = f"{text[:-1]}{piece}"
        else:
            text = f"{text} {piece}"
    return text


def _iter_plain_blocks(text: str, title: str) -> Iterator[_Block]:
    pages = _split_pages(text)
    skip = _running_lines(pages)
    for page, lines in pages:
        run: list[str] = []
        for line in lines:
            stripped = line.strip()
            # Sam numer strony w stopce nie niesie treści, a wygląda jak akapit.
            if not stripped or stripped in skip or stripped.isdigit():
                if run:
                    yield _Block(_join_run(run), title, "", page, is_table=False)
                    run = []
                continue
            run.append(stripped)
        if run:
            yield _Block(_join_run(run), title, "", page, is_table=False)


def chunk_plain_text(
    text: str,
    *,
    title: str,
    target_tokens: int = 450,
    overlap_tokens: int = 60,
    count_tokens: TokenCounter | None = None,
) -> list[Chunk]:
    """Tnie zrzut PDF-a na fragmenty. `title` staje się „rozdziałem" w cytacie.

    Strona **nie** domyka fragmentu: akapit rozpoczęty na dole strony ma sens
    razem z dalszym ciągiem, a zakres `s. N–M` i tak jedzie w cytacie.
    """
    return _assemble(
        _iter_plain_blocks(text, title.strip()),
        target_tokens=target_tokens,
        overlap_tokens=overlap_tokens,
        counter=count_tokens or estimate_tokens,
    )
