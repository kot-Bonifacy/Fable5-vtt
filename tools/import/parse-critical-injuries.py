"""Critical Injury table (stage 15): Easy Mode PDF -> compendium JSON.

Why coordinates instead of the extracted text: the table is a five-column grid
whose effect cell wraps *around* the row line, so the flat text interleaves
three rows' worth of columns per line (the „Ratownictwo" of the Łatanie column
lands at the end of the effect line). Reading pdfplumber's word boxes and
bucketing them by column x-range and row y-band gives clean cells instead.

The free Easy Mode carries **only the body table** — it says so itself („Ta
lista zawiera w sobie jedynie połowę Ran Krytycznych opisanych w podręczniku
głównym"). The head table has no free source at all, so the GM types it into
the compendium editor; nothing here invents it.

**Ścieżka awaryjna, nie podstawowa (ustalone 27.08).** Mając podręcznik główny,
obie tabele czyta `parse-manual.py` i to jego wynik stoi dziś w kompendium
(11 ran korpusu + 11 głowy, s. 187–188). Ten skrypt jest dla kogoś, kto ma sam
Easy Mode — i pisze **do tego samego pliku**, więc uruchomiony po `parse-manual.py`
podmieniłby oficjalne wpisy na uboższe. Stąd bezpiecznik niżej: skrypt odmawia
nadpisania cudzej roboty bez `--force`.

Output (gitignored, rulebook-derived):
    data/private/cpred/compendium/critical-injuries.json

Run:
    uv run --with pdfplumber python tools/import/parse-critical-injuries.py
"""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
PDF_PATH = REPO_ROOT / "data" / "private" / "rulebook" / "pdf" / "CRED-EasyMode.pdf"
OUT_PATH = REPO_ROOT / "data" / "private" / "cpred" / "compendium" / "critical-injuries.json"

# Optional hand-kept markdown with the head table (see `parse_markdown_table`).
MANUAL_PATH = REPO_ROOT / "data" / "private" / "rulebook" / "manual" / "tabela-ran-krytycznych.md"

SOURCE = "Cyberpunk RED — Easy Mode (PL), s. 22"
MANUAL_SOURCE = "Materiały własne MG — tabela nieoficjalna, do weryfikacji z podręcznikiem"

# Wzór formatu ręcznej tabeli — w repo, bo nie ma w nim treści podręcznika.
TEMPLATE_PATH = REPO_ROOT / "data" / "public" / "cpred" / "tabela-ran-krytycznych.wzor.md"

# Column x-ranges of the table, read off the header row ("Rzut / Rana / Efekt
# rany / Łatanie / Leczenie"). The sidebar note sits at x < 60 and is excluded
# by the first range starting at 70.
COLUMNS = {
    "roll": (70.0, 105.0),
    "name": (105.0, 175.0),
    "effect": (175.0, 415.0),
    # The gap between „Łatanie" and „Leczenie" is narrow: the widest quick-fix
    # cell ends at x=461 and the treatment column starts at x=468.
    "quickFix": (415.0, 465.0),
    "treatment": (465.0, 545.0),
}

ROLL_MIN, ROLL_MAX = 2, 12

# „+1 do podstawowej trudności Testu Przeżywalności" -> deathSavePenalty: 1.
DEATH_SAVE_PENALTY = re.compile(
    r"\+(\d)\s+do\s+podstawowej\s+trudności\s+Testu\s+Przeżywalności", re.IGNORECASE
)

# „-4 do Ruchu (minimum 1)" -> movePenalty: -4 (stage 14c). The tracker enforces
# whatever the table says, so the number has to leave the prose and become data.
MOVE_PENALTY = re.compile(r"[-−–]\s*(\d)\s+do\s+Ruchu", re.IGNORECASE)

PL_TRANSLITERATION = str.maketrans(
    {"ą": "a", "ć": "c", "ę": "e", "ł": "l", "ń": "n", "ó": "o", "ś": "s", "ź": "z", "ż": "z"}
)


def slugify(value: str) -> str:
    """Same slug rules as `shared/systems/cpred/ids.ts`."""
    lowered = value.lower().translate(PL_TRANSLITERATION)
    stripped = "".join(
        char for char in unicodedata.normalize("NFD", lowered) if not unicodedata.combining(char)
    )
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", stripped))


def column_of(x0: float, x1: float) -> str | None:
    centre = (x0 + x1) / 2
    for name, (start, end) in COLUMNS.items():
        if start <= centre < end:
            return name
    return None


def find_table_page(pdf):
    for page in pdf.pages:
        text = page.extract_text() or ""
        if "RANY" in text and "KRYTYCZNE" in text and "Łatanie" in text:
            return page
    return None


def cell_text(words: list[dict]) -> str:
    """Joins words in reading order, mending words split across a line break."""
    ordered = sorted(words, key=lambda w: (round(w["top"], 1), w["x0"]))
    text = " ".join(word["text"] for word in ordered)
    text = re.sub(r"(\w)-\s+(\w)", r"\1\2", text)  # "com- monly" -> "commonly"
    # The PDF prints one cell as „NW swojej kolejnej Turze" — a stray capital
    # glued to the one-letter word „W". Drop a leading capital that is followed
    # by another capital standing alone; nothing else in the table looks so.
    text = re.sub(r"^[A-ZŁŚŻĆÓĘĄŃ](?=[A-ZŁŚŻĆÓĘĄŃ]\s)", "", text)
    return re.sub(r"\s+", " ", text).strip()


def parse(page) -> list[dict]:
    words = [w for w in page.extract_words() if column_of(w["x0"], w["x1"])]

    anchors = []
    for word in words:
        if column_of(word["x0"], word["x1"]) != "roll":
            continue
        if not word["text"].isdigit():
            continue
        roll = int(word["text"])
        if ROLL_MIN <= roll <= ROLL_MAX:
            anchors.append((roll, word["top"]))
    anchors.sort(key=lambda item: item[1])
    if not anchors:
        return []

    # Rows are evenly spaced; the band reaches halfway to the neighbours, which
    # is what catches the effect lines printed above and below the row line.
    spacing = (
        (anchors[-1][1] - anchors[0][1]) / (len(anchors) - 1) if len(anchors) > 1 else 28.0
    )
    half = spacing / 2

    injuries = []
    for roll, top in anchors:
        band = [w for w in words if top - half < w["top"] < top + half]
        cells = {name: [] for name in COLUMNS}
        for word in band:
            column = column_of(word["x0"], word["x1"])
            if column and column != "roll":
                cells[column].append(word)

        name = cell_text(cells["name"])
        effect = cell_text(cells["effect"])
        if not name or not effect:
            print(f"  ! pominięto rzut {roll}: brak nazwy albo efektu", file=sys.stderr)
            continue

        entry = {
            "id": f"injury.{slugify(name)}",
            "category": "criticalInjury",
            "name": name,
            "table": "body",
            "roll": roll,
            "description": effect,
            "cost": None,
        }
        quick_fix = cell_text(cells["quickFix"])
        treatment = cell_text(cells["treatment"])
        if quick_fix:
            entry["quickFix"] = quick_fix
        if treatment:
            entry["treatment"] = treatment
        penalty = DEATH_SAVE_PENALTY.search(effect)
        if penalty:
            entry["deathSavePenalty"] = int(penalty.group(1))
        slowed = MOVE_PENALTY.search(effect)
        if slowed:
            entry["movePenalty"] = -int(slowed.group(1))
        injuries.append(entry)
    return injuries


def clean_markdown(cell: str) -> str:
    """Strips the markdown emphasis and escapes a hand-written table carries."""
    text = re.sub(r"\*+", "", cell)
    text = text.replace("\\+", "+").replace("\\-", "-").replace("\\!", "!")
    return re.sub(r"\s+", " ", text).strip()


def parse_markdown_table(path: Path, heading: str, table: str) -> list[dict]:
    """
    Reads one „| 2k6 | Rana | Efekt | Szybka pomoc | Chirurgia |" table from a
    markdown file kept by hand.

    This exists for the **head** table only: the free material has no head
    injuries at all, so without it a called shot to the head can never draw
    one. Whatever is in that file is marked with its own `source` — it did not
    come out of an official PDF and must be checked against the rulebook.
    """
    if not path.exists():
        return []
    lines = path.read_text(encoding="utf8").splitlines()
    injuries: list[dict] = []
    in_section = False
    for line in lines:
        if line.lstrip().startswith("#"):
            in_section = heading.lower() in clean_markdown(line).lower()
            continue
        if not in_section or not line.strip().startswith("|"):
            continue
        cells = [clean_markdown(cell) for cell in line.strip().strip("|").split("|")]
        if len(cells) < 3 or not cells[0].isdigit():
            continue
        roll = int(cells[0])
        if not (ROLL_MIN <= roll <= ROLL_MAX):
            continue
        name, effect = cells[1], cells[2]
        if not name or not effect:
            continue
        entry = {
            "id": f"injury.{table}-{slugify(name)}",
            "category": "criticalInjury",
            "name": name,
            "table": table,
            "roll": roll,
            "description": effect,
            "cost": None,
            "source": MANUAL_SOURCE,
        }
        if len(cells) > 3 and cells[3] and cells[3].lower() != "brak":
            entry["quickFix"] = cells[3]
        if len(cells) > 4 and cells[4] and cells[4].lower() != "brak":
            entry["treatment"] = cells[4]
        penalty = DEATH_SAVE_PENALTY.search(effect)
        if penalty:
            entry["deathSavePenalty"] = int(penalty.group(1))
        slowed = MOVE_PENALTY.search(effect)
        if slowed:
            entry["movePenalty"] = -int(slowed.group(1))
        injuries.append(entry)
    return injuries


def existing_source(path: Path) -> str | None:
    """`source` pliku, który już leży pod adresem wyjściowym (albo None)."""
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf8")).get("source")
    except (json.JSONDecodeError, OSError):
        return None


def main() -> int:
    force = "--force" in sys.argv
    previous = existing_source(OUT_PATH)
    if previous and "Easy Mode" not in previous and not force:
        for line in (
            f"Odmowa: {OUT_PATH.name} pochodzi z innego źródła niż Easy Mode",
            f'  („{previous}")',
            "  — to zwykle wynik `parse-manual.py`, który czyta OBIE tabele",
            "  z podręcznika głównego i jest lepszym źródłem niż ten skrypt.",
            "  Nadpisanie go zubożyłoby kompendium. Powtórz z --force, jeśli wiesz, co robisz.",
        ):
            print(line, file=sys.stderr)
        return 1
    if not PDF_PATH.exists():
        print(f"Brak pliku {PDF_PATH} — materiały prywatne są poza repo.", file=sys.stderr)
        return 1
    import pdfplumber

    with pdfplumber.open(str(PDF_PATH)) as pdf:
        page = find_table_page(pdf)
        if page is None:
            print("Nie znalazłem strony z tabelą Ran Krytycznych.", file=sys.stderr)
            return 1
        injuries = parse(page)

    # The body table is the official one; the head table can only come from the
    # GM's own notes, so it is kept apart and labelled with its own source.
    head = parse_markdown_table(MANUAL_PATH, "głowy", "head")
    missing = [
        roll for roll in range(ROLL_MIN, ROLL_MAX + 1) if not any(i["roll"] == roll for i in injuries)
    ]
    payload = {
        "schemaVersion": 1,
        "source": SOURCE,
        "entries": injuries + head,
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf8")

    template = TEMPLATE_PATH.relative_to(REPO_ROOT)
    print(f"Zapisano {len(injuries)} ran krytycznych (tabela: korpus) -> {OUT_PATH}")
    if missing:
        print(f"  ! brak wyników 2k6: {missing}")
    if head:
        print(f"  + {len(head)} ran z tabeli głowy ({MANUAL_PATH.name}) — źródło NIEOFICJALNE")
    elif MANUAL_PATH.exists():
        print(f"  ! {MANUAL_PATH.name} istnieje, ale nie wyczytałem z niego ani jednego wiersza.")
        print(f'    Sprawdź nagłówek („głowy") i kolumny wg wzoru: {template}')
    else:
        # Do 27.08 brak pliku przechodził bez słowa: kompendium wychodziło
        # z samym korpusem, a strzał w głowę nie miał czego wylosować. Cisza
        # w tym miejscu wygląda jak zepsuty kod — więc jej tu nie ma.
        print("  ! Tabeli dla głowy nie ma w darmowych materiałach, a ręcznej też nie:")
        print(f"    {MANUAL_PATH}")
        print(f"    Wzór formatu: {template}")
        print("    Alternatywa: wpisz tabelę w edytorze kompendium MG.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
