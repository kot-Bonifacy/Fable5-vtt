#!/usr/bin/env python3
"""Tabele Spotkań Losowych z podręcznika -> JSON tabel losowych (etap 34).

Czyta markdownowy zrzut podręcznika (`tools/rulebook/build-manual.mjs`) i wyciąga
trzy tabele procentowe z rozdziału „Prowadzenie Cyberpunka" (s. 417–421):
dzienne, wieczorne i nocne spotkania w Night City.

**W repo są tylko skrypty — nigdy treść.** Wynik ląduje w `data/private/cpred/tables/`
(gitignore), bo podręcznik jest objęty prawem autorskim (patrz `CLAUDE.md`).

Kształt wiersza w podręczniku:

    DZIENNE SPOTKANIA W NIGHT CITY (1–5) Patrol miejscowej policji: Funkcjonariusze…
    (6–11) Patrol korpogliniarzy: Szeregowi strażnicy…
    47–57 Złomiarze: Straszliwie biedni złomiarze…
    (95–00) Drużyna Solo: …

Nawiasy bywają zgubione w zrzucie, więc dopuszczamy obie postacie. `00` znaczy 100.
Podrzuty wewnątrz opisu („Rzuć 1k10. 1–2: wnoszą…") **nie** są wierszami tabeli
i odróżnia je dwukropek tuż po liczbie — po zakresie wiersza stoi nazwa.

Skrypt **nie zgaduje**: wypisuje pokrycie zakresów i zostawia poprawki
człowiekowi, bo serwer i tak odmówi zapisu tabeli z dziurą. Jedynym wyjątkiem
jest lista `KNOWN_FIXES` — errata polskiego wydania, wypisana z nazwiskiem
wiersza i uzasadnieniem, żeby kolejny przebieg nie kasował poprawki.

Użycie:

    python tools/import/parse-encounters.py
    python tools/import/parse-encounters.py --manual <ścieżka> --out <katalog>
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MANUAL = (
    ROOT / "data/private/rulebook/manual/CPRED-podrecznik/18-prowadzenie-cyberpunka.md"
)
DEFAULT_OUT = ROOT / "data/private/cpred/tables"

# Nagłówek tabeli -> nazwa i opis w VTT.
SECTIONS = [
    (
        "DZIENNE SPOTKANIA W NIGHT CITY",
        "Spotkania dzienne w Night City",
        "Rzut procentowy na spotkanie za dnia (podręcznik, s. 417–419).",
    ),
    (
        "WIECZORNE SPOTKANIA W NIGHT CITY",
        "Spotkania wieczorne w Night City",
        "Rzut procentowy na spotkanie wieczorem (podręcznik, s. 419–420).",
    ),
    (
        "NOCNE SPOTKANIA W NIGHT CITY",
        "Spotkania nocne w Night City",
        "Rzut procentowy na spotkanie nocą (podręcznik, s. 420–421).",
    ),
]

# Zakres wiersza. Dwie postacie, obie wąskie — zrzut podręcznika jest pełen
# liczb, a każda złapana za dużo staje się wierszem widmem („dziura 101–417"
# brała się ze „STR. 417"):
#
#   * w nawiasie: „(1–5) ", „(00) " — tak wygląda większość wierszy,
#   * bez nawiasu, ale **na początku linii** i z prawdziwym zakresem:
#     „47–57 Złomiarze:" — tak wyglądają te, którym zrzut zgubił nawiasy.
#
# Podrzut w opisie („1–2: wnoszą skrzynię") odpada w obu przypadkach: po jego
# liczbie stoi dwukropek, a nie spacja.
PAREN_RE = re.compile(r"\((\d{1,3})(?:\s*[–—-]\s*(\d{1,3}))?\)(?=\s)")
BARE_RE = re.compile(
    r"^(\d{1,3})\s*[–—-]\s*(\d{1,3})(?=\s+[A-ZŁŚŻŹĆŃÓĄĘ])",
    re.M,
)
# Po zakresie stoi krótka nazwa zakończona dwukropkiem („Patrol korpogliniarzy:").
# To ostatnie sito: bez niego „(3 funkcjonariuszy)" bywa wierszem.
NAME_RE = re.compile(r"^\s*[^.:;]{2,60}:")

# Śmieci zrzutu: znaczniki stron i pasek żywej paginy wchodzący w środek zdania.
PAGE_RE = re.compile(r"<!--.*?-->", re.S)
RUNNING_HEAD_RE = re.compile(
    r"[:\s]*(?:[A-ZŁŚŻŹĆŃÓĄĘ]\s){3,}[A-ZŁŚŻŹĆŃÓĄĘ]*\s*(?:JAK PROWADZIĆ CYBERPUNKA)?"
)


def clean(text: str) -> str:
    text = PAGE_RE.sub(" ", text)
    text = RUNNING_HEAD_RE.sub(" ", text)
    return re.sub(r"\s+", " ", text).strip()


def to_bound(raw: str) -> int:
    """`00` na końcu tabeli procentowej znaczy 100."""
    value = int(raw)
    return 100 if value == 0 else value


def parse_section(body: str) -> list[dict[str, object]]:
    found: dict[int, tuple[int, int, int]] = {}
    for regex in (PAREN_RE, BARE_RE):
        for match in regex.finditer(body):
            if not NAME_RE.match(body[match.end() : match.end() + 80]):
                continue
            low = to_bound(match.group(1))
            high = to_bound(match.group(2)) if match.group(2) else low
            found[match.start()] = (match.end(), low, high)

    rows: list[dict[str, object]] = []
    positions = sorted(found)
    for index, position in enumerate(positions):
        start, low, high = found[position]
        end = positions[index + 1] if index + 1 < len(positions) else len(body)
        rows.append({"min": low, "max": high, "text": clean(body[start:end])})
    return rows


# Errata polskiego wydania. Wiersz „(70-72) Druzyna Solo" i nastepny po nim
# „(72-77) Cybergang" dziela liczbe 72 - w druku, nie w zrzucie. Sasiedztwo nie
# zostawia watpliwosci (64-69, potem 72-77), wiec pierwszy konczy sie na 71.
#
# Poprawka siedzi tutaj, a nie w recznie edytowanym JSON-ie, bo JSON jest
# **wynikiem** i kolejny przebieg parsera skasowalby poprawke bez sladu.
KNOWN_FIXES: dict[str, list[tuple[int, int, int, int]]] = {
    "Spotkania wieczorne w Night City": [(70, 72, 70, 71)],
}


def apply_fixes(name: str, rows: list[dict[str, object]]) -> int:
    applied = 0
    for low, high, new_low, new_high in KNOWN_FIXES.get(name, []):
        for row in rows:
            if row["min"] == low and row["max"] == high:
                row["min"], row["max"] = new_low, new_high
                applied += 1
    return applied


def coverage_report(rows: list[dict[str, object]]) -> list[str]:
    """To samo pytanie, które zada serwer przy zapisie: czy 1–100 jest pokryte."""
    problems: list[str] = []
    cursor = 1
    for row in sorted(rows, key=lambda entry: (entry["min"], entry["max"])):
        low, high = int(row["min"]), int(row["max"])
        if low > cursor:
            problems.append(f"dziura {cursor}-{low - 1}")
        elif low < cursor:
            problems.append(f"zachodzenie przy {low}")
        cursor = max(cursor, high + 1)
    if cursor <= 100:
        problems.append(f"dziura {cursor}-100")
    return problems


def slugify(name: str) -> str:
    table = str.maketrans("ąćęłńóśżź", "acelnoszz")
    ascii_name = name.lower().translate(table)
    return re.sub(r"[^a-z0-9]+", "-", ascii_name).strip("-")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manual", type=Path, default=DEFAULT_MANUAL)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    if not args.manual.exists():
        print(f"Brak zrzutu podrecznika: {args.manual}", file=sys.stderr)
        print("Zbuduj go najpierw - patrz tools/rulebook/README.md.", file=sys.stderr)
        return 1

    source = args.manual.read_text(encoding="utf-8")
    args.out.mkdir(parents=True, exist_ok=True)

    bounds = []
    for header, name, description in SECTIONS:
        position = source.find(header)
        if position < 0:
            print(f"Nie znalazlem sekcji: {header}", file=sys.stderr)
            return 1
        bounds.append((position, position + len(header), name, description))

    failed = False
    for index, (_start, body_start, name, description) in enumerate(bounds):
        end = bounds[index + 1][0] if index + 1 < len(bounds) else len(source)
        rows = parse_section(source[body_start:end])
        fixes = apply_fixes(name, rows)
        problems = coverage_report(rows)
        table = {
            "name": name,
            "formula": "1d100",
            "description": description,
            "visibility": "gm",
            "rows": rows,
        }
        path = args.out / f"{slugify(name)}.json"
        path.write_text(
            json.dumps(table, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        longest = max((len(str(row["text"])) for row in rows), default=0)
        status = "OK" if not problems else "; ".join(problems)
        errata = f", errata: {fixes}" if fixes else ""
        print(
            f"{path.name}: {len(rows)} wierszy, najdluzszy {longest} znakow{errata} - {status}"
        )
        if problems:
            failed = True

    if failed:
        print(
            "\nZakresy nie pokrywaja 1-100 - popraw JSON recznie przed importem:\n"
            "serwer odmowi zapisu tabeli z dziura.",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
