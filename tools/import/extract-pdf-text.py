"""Step 1 of the compendium pipeline: PDF -> plain text.

Reads every PDF in `data/private/rulebook/pdf/` and writes a UTF-8 text file per
source into `data/private/rulebook/text/`, with `=== page N ===` markers so the
parsers in step 2 can report where a bad entry came from.

The rulebook is copyrighted: both directories are gitignored and only the
scripts live in the repository. Run with no local Python setup required:

    uv run --with pdfplumber python tools/import/extract-pdf-text.py

Options:
    --layout   keep pdfplumber's layout mode (columns aligned with spaces).
               Slower, but tables survive; this is the default.
    --raw      plain reading-order extraction (useful when layout mangles text).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
PDF_DIR = REPO_ROOT / "data" / "private" / "rulebook" / "pdf"
TEXT_DIR = REPO_ROOT / "data" / "private" / "rulebook" / "text"


def extract(pdf_path: Path, layout: bool) -> str:
    import pdfplumber

    chunks: list[str] = []
    with pdfplumber.open(pdf_path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            text = page.extract_text(layout=layout, x_density=6, y_density=12) or ""
            chunks.append(f"=== page {number} ===\n{text.rstrip()}\n")
    return "\n".join(chunks)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw", action="store_true", help="disable layout mode")
    args = parser.parse_args()

    if not PDF_DIR.is_dir():
        print(f"missing {PDF_DIR} — put the source PDFs there first", file=sys.stderr)
        return 1

    TEXT_DIR.mkdir(parents=True, exist_ok=True)
    pdfs = sorted(PDF_DIR.glob("*.pdf"))
    if not pdfs:
        print(f"no PDFs in {PDF_DIR}", file=sys.stderr)
        return 1

    for pdf_path in pdfs:
        text = extract(pdf_path, layout=not args.raw)
        out = TEXT_DIR / f"{pdf_path.stem}.txt"
        out.write_text(text, encoding="utf-8")
        print(f"{pdf_path.name} -> {out.relative_to(REPO_ROOT)} ({len(text)} chars)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
