"""Polish core rulebook -> Lifepath tables (stage 25b).

Reads the chapter „Uliczne opowieści" (s. 43–70) and writes one file the
creator's Lifepath step reads at runtime:

    data/private/cpred/lifepath.json

The file is gitignored, like everything else derived from the rulebook. The
repo keeps this parser and a made-up sample in `data/public/cpred/lifepath.json`
so a fresh clone still has a working Lifepath.

The dump glues every table into one run of text:

    WynikTyp1 Muzyk 2 Slam poeta … 10 Idoru Gdzie występujesz?

Four things have to be recovered from that:

  * **Where a table starts.** The word „Wynik" — the header of the roll column —
    and nothing else. Anchoring on the „Rzuć 1k10 lub wybierz…" sentence instead
    looks tidier and silently loses the Enemies table, which the book introduces
    with „rzucając raz w każdej kolumnie poniższej tabeli".

  * **The rows.** Roll markers are read *in order* — first the `1`, then the `2`
    after it, and so on — and each must be followed by a capital letter. Ordered
    scanning is what keeps „(1k6/2) przyjaciółmi" and „odejmij 7, by sprawdzić"
    from being mistaken for row numbers, and the capital is what the book's own
    typography guarantees. The scan stops when the next number is missing, so
    a d6 table needs nobody to say it is a d6.

  * **The columns.** A multi-column table prints two or three cells per row with
    nothing between them, so they are split on the lowercase→uppercase seam
    („Dawny przyjacielStrata twarzy" → „Dawny przyjaciel" + „Strata twarzy").
    Where the dump left a space instead of gluing, the seam is widened — but
    only as far as it must be, because a greedy rule cuts „Przedstawiciel Korpo"
    in half. How wide each table is, and which end of the row its seams sit at,
    is stated in `GENERAL_SPECS`; guessing it per row is what fails.

  * **The end of the last row.** The run keeps going into whatever the page
    printed next — the following question, a role name in capitals, a
    letter-spaced sidebar tab (`z e s p ó ł`), a „patrz str. 329" note. Those are
    trimmed by shape; whatever the shapes miss is listed as a warning and
    repaired by hand in `manual-overrides.json`, exactly as stage 25a repairs
    the Role skill columns.

Run:
    python tools/import/parse-lifepath.py
"""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from terms import MANUAL_ROLE_NAMES  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
MANUAL_DIR = REPO_ROOT / "data" / "private" / "rulebook" / "manual" / "CPRED-podrecznik"
OVERRIDES_PATH = REPO_ROOT / "data" / "private" / "rulebook" / "manual" / "manual-overrides.json"
CPRED_DIR = REPO_ROOT / "data" / "private" / "cpred"

CHAPTER = "05-uliczne-opowiesci.md"

SOURCE = "Cyberpunk RED — podręcznik główny (wydanie polskie), „Uliczne opowieści” s. 43–70"
SCHEMA_VERSION = 1

MAX_SIDES = 10

# Where each Role's own Lifepath starts, straight off the book's own index
# („MEDIA STRONA 62KORPO STRONA 63…" on s. 53). A table belongs to the Role
# whose block its page falls in; that is far steadier than the ALL-CAPS role
# banners, which the dump prints *after* the first table of the block.
ROLE_PAGES: list[tuple[int, str]] = [
    (54, "ROCKER"),
    (55, "SOLO"),
    (56, "NETRUNNER"),
    (58, "TECHNIK"),
    (60, "MEDYK"),
    (62, "MEDIA"),
    (63, "KORPO"),
    (65, "STRÓŻ PRAWA"),
    (66, "FIXER"),
    (68, "NOMADA"),
]
ROLE_SECTION_FIRST_PAGE = ROLE_PAGES[0][0]

warnings: list[str] = []


def warn(message: str) -> None:
    warnings.append(message)


# ──────────────────────────── wejście i porządki ────────────────────────────


def load_chapter() -> str:
    path = MANUAL_DIR / CHAPTER
    if not path.exists():
        raise SystemExit(f"Brak rozdziału {path} — materiały prywatne są poza repo.")
    return path.read_text(encoding="utf8")


def load_overrides() -> dict:
    if not OVERRIDES_PATH.exists():
        return {}
    return json.loads(OVERRIDES_PATH.read_text(encoding="utf8"))


def write(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf8")


def collapse(text: str) -> str:
    text = text.replace("­", "").replace("®", "").replace("™", "")
    text = re.sub(r"<!--.*?-->", " ", text)
    text = re.sub(r"^#+\s*", " ", text, flags=re.MULTILINE)
    return re.sub(r"\s+", " ", text)


def page_index(raw: str) -> list[tuple[int, int]]:
    """(offset in the flattened text, page number) for every `<!-- s. N -->`."""
    marks: list[tuple[int, int]] = []
    flat_at = 0
    at = 0
    for match in re.finditer(r"<!--\s*s\.\s*(\d+)\s*-->", raw):
        flat_at += len(collapse(raw[at : match.start()]))
        marks.append((flat_at, int(match.group(1))))
        at = match.end()
    return marks


def page_at(marks: list[tuple[int, int]], offset: int) -> int:
    page = 0
    for at, number in marks:
        if at <= offset:
            page = number
        else:
            break
    return page


# ─────────────────────────── obcinanie śmieci strony ───────────────────────────

ROLE_BANNERS = sorted(MANUAL_ROLE_NAMES, key=len, reverse=True)

CAPITAL = re.compile(r"(?:(?<=\s)|^)[A-ZĄĆĘŁŃÓŚŹŻ]")

# How a question of this chapter opens. Matching one of these is what tells
# „…w Sieci Skąd bierzesz Programy?" to break before „Skąd" and not before
# „Programy", which is capitalised because it is a game term.
INTERROGATIVE = re.compile(
    r"(?:Jak|Jaki|Jakie|Jakiego|Jakim|Jakiej|Gdzie|Kto|Kim|Kiedy|Dlaczego|Czy|Skąd|Ile|Który|"
    r"Która|Co|Czego|Komu|Masz|Jeśli|Działasz|Pracujesz|Dla jakiej|W jakim|W jakich)\b"
)

# The sentences that tell the reader to roll. They are not part of any answer,
# and they are not the question either.
INSTRUCTION = re.compile(
    r"(?:W każdej kolumnie r|R)zuć 1k(?:6|10)[^.]*\.|"
    r"(?:Najpierw|Następnie|Dla każdego|I wreszcie|Poniższa tabela|Wybierz) [^.]*\."
)

JUNK_PATTERNS: list[re.Pattern[str]] = [
    # A Role banner in capitals („… solowej z e s p ó ł ROCKER Jakiego …").
    re.compile(r"(?:" + "|".join(re.escape(name) for name in ROLE_BANNERS) + r")\b"),
    # Any other display type: one long capitalised word, or two short ones in a row.
    re.compile(r"\b[A-ZĄĆĘŁŃÓŚŹŻ]{5,}\b|\b[A-ZĄĆĘŁŃÓŚŹŻ]{2,}\b[ ,]+[A-ZĄĆĘŁŃÓŚŹŻ]{2,}\b"),
    # Letter-spaced sidebar tabs: `z e s p ó ł`, `m am p ar t n er a`, `l ą d o w i`.
    # Three short tokens in a row is the threshold: two of them („a i tak") is
    # ordinary Polish.
    re.compile(r"(?:\b\w{1,2}\b ){3,}"),
    # The sentence that introduces the *next* table, and the instructions around it.
    INSTRUCTION,
    # Marginal notes pointing at another page, and the chapter's named sidebars.
    re.compile(r"Więcej (?:informacji|o )|Sieciowaniu poświęcono|[Pp]atrz str\."),
    re.compile(r"Trauma Team:|Nocny Market:|Przykładowe (?:watahy|grupy)|Ścieżki życia ról"),
]


def question_spans(text: str) -> list[tuple[int, int]]:
    """Where each question in the text begins and ends.

    A question opens at a capitalised word before its question mark, and which
    one matters twice over: the span is both the question the wizard shows and
    the piece that gets cut off the table row above it. The **last capital that
    starts an interrogative** wins, so „…w Sieci Skąd bierzesz Programy?" breaks
    at „Skąd" — „Programy" is capitalised because it is a game term, not because
    a sentence starts there. With no interrogative in sight the last capital is
    taken instead: that keeps a heading like „Obecne stosunki z szefostwem" out
    of the row without risking the row itself.
    """
    spans: list[tuple[int, int]] = []
    for mark in re.finditer(r"\?", text):
        opens = max((text.rfind(char, 0, mark.start()) for char in ".?!"), default=-1)
        segment = text[opens + 1 : mark.start()]
        capitals = [match.start() for match in CAPITAL.finditer(segment)]
        if not capitals:
            continue
        asking = [at for at in capitals if INTERROGATIVE.match(segment, at)]
        spans.append((opens + 1 + (asking or capitals)[-1], mark.end()))
    return spans


def trim(text: str) -> str:
    """Cuts the page furniture off the right-hand end of a run of table text."""
    text = text.strip()
    cut = len(text)
    for pattern in JUNK_PATTERNS:
        match = pattern.search(text)
        if match and match.start() < cut:
            cut = match.start()
    # The *first* question is where the table stops; a row is never a bare
    # question, so a span opening at nought is the row itself and is left alone.
    for start, _ in question_spans(text):
        if 0 < start < cut:
            cut = start
    # A lone capital left hanging is the first letter of the display type the
    # cut above stopped in front of („…zasoby i części O MIEJSCACH PRACY").
    return re.sub(r"\s+[A-ZĄĆĘŁŃÓŚŹŻ]$", "", text[:cut].strip(" .:;,–—"))


# ──────────────────────────── znajdowanie tabel ────────────────────────────

DECLARED_SIDES = re.compile(r"\b1k(6|10)\b")


def find_tables(flat: str) -> list[dict]:
    """Every table of the chapter, in the order the book prints them.

    The tables are read in one pass because each one hands the next its
    question: what a table's last row leaves behind — the layout's tabs,
    banners and margin notes — ends with the heading of the table that follows.
    """
    anchors = [match.start() for match in re.finditer(r"\bWynik", flat)]
    tables: list[dict] = []
    leftover = flat[: anchors[0]] if anchors else ""
    for index, at in enumerate(anchors):
        stop = anchors[index + 1] if index + 1 < len(anchors) else len(flat)
        parsed = read_table(flat[at:stop], declared_sides(leftover))
        question = read_question(leftover)
        if parsed is None:
            warn(f"Nie odczytałem tabeli po pytaniu {question!r}")
            leftover = flat[at:stop]
            continue
        label, rolls, rows, leftover = parsed
        tables.append(
            {
                "at": at,
                "question": question,
                "label": label,
                "rolls": rolls,
                "rows": rows,
                "sides": rolls[-1][1],
            }
        )
    return tables


def declared_sides(before: str) -> int:
    """The `1k6` / `1k10` the text names just above the table, when it names one."""
    matches = DECLARED_SIDES.findall(before[-400:])
    return int(matches[-1]) if matches else MAX_SIDES


def read_table(
    run: str, sides: int
) -> tuple[str, list[tuple[int, int]], list[str], str] | None:
    """`WynikNagłówek1 …2 …` -> (header, roll ranges, rows, page furniture left)."""
    body = run[len("Wynik") :]
    spans: list[tuple[int, int, int, int]] = []  # (start, end, roll from, roll to)
    cursor = 0
    expected = 1
    while expected <= sides:
        # The first marker may be glued straight onto the header („WynikTyp1 Muzyk”);
        # every later one is preceded by a space, which is what keeps „(1k6/2)”
        # and „odejmij 7, by…” out of the scan.
        prefix = r"" if expected == 1 else r"(?<=\s)"
        pattern = re.compile(prefix + rf"{expected}(?:-(\d+))?\s+(?=[A-ZĄĆĘŁŃÓŚŹŻ„\"])")
        match = pattern.search(body, cursor)
        if match is None:
            break
        upper = int(match.group(1) or expected)
        spans.append((match.start(), match.end(), expected, upper))
        cursor = match.end()
        expected = upper + 1
    if len(spans) < 2:
        return None

    header = body[: spans[0][0]].strip()
    rows: list[str] = []
    for index, (_, end, _, _) in enumerate(spans):
        next_start = spans[index + 1][0] if index + 1 < len(spans) else len(body)
        rows.append(body[end:next_start].strip())
    # Only the last row runs off the edge of the table into the page around it.
    tail = rows[-1]
    rows[-1] = trim(tail)
    leftover = tail[len(rows[-1]) :]
    return header, [(low, high) for _, _, low, high in spans], rows, leftover


def read_question(before: str) -> str:
    """The sentence that introduces a table, cleaned of page furniture.

    The dump glues the question to whatever the layout printed beside it, so it
    is read from the *right* end („… z e s p ó ł ROCKER Jakiego rodzaju Rockerem
    jesteś?" → „Jakiego rodzaju Rockerem jesteś?"). Tables whose prompt is a
    heading rather than a question („Cele życiowe") fall back to the last
    sentence, which is what the heading is glued to.
    """
    text = re.sub(r"\s+", " ", INSTRUCTION.sub(" ", before)).strip()
    # Whatever the layout printed beside the table sits to the *left* of the
    # question, so the scan starts after the last piece of it.
    at = 0
    for pattern in JUNK_PATTERNS:
        for match in pattern.finditer(text):
            at = max(at, match.end())
    text = text[at:].strip(" .:;,–—")
    spans = question_spans(text)
    if spans:
        # The last one, because the question sits directly above its table.
        start, end = spans[-1]
        return text[start:end].strip()
    sentence = re.split(r"(?<=[.?!])\s+", text)[-1] if text else ""
    return sentence[-80:].strip(" .:;,–—")


# ─────────────────────────── rozdzielanie kolumn ───────────────────────────

SEAM_GLUED = re.compile(r"(?<=[a-ząćęłńóśźż])(?=[A-ZĄĆĘŁŃÓŚŹŻ])")
SEAM_SPACED = re.compile(r"(?<=[a-ząćęłńóśźż)”\"])\s(?=[A-ZĄĆĘŁŃÓŚŹŻ])")


def split_row(row: str, width: int, prefer_last: bool) -> list[str] | None:
    """Cuts one row into `width` cells at the seams between them.

    Glued seams („…przyjacielStrata…") are trusted first and alone: they cannot
    occur inside ordinary prose. Only when there are too few of them are spaced
    seams added, and then the table says which end of the row to cut from —
    „Ubiór i styl" holds its short cell last, everything else holds it first.
    """
    if width == 1:
        return [row]
    glued = [match.start() for match in SEAM_GLUED.finditer(row)]
    seams = glued
    if len(glued) < width - 1:
        seams = sorted(glued + [match.start() for match in SEAM_SPACED.finditer(row)])
    if len(seams) < width - 1:
        return None
    chosen = seams[-(width - 1) :] if prefer_last else seams[: width - 1]
    cells: list[str] = []
    at = 0
    for seam in chosen:
        cells.append(row[at:seam].strip())
        at = seam
    cells.append(row[at:].strip())
    return cells


# ───────────────────────── tabele ogólne: nazwy pól ─────────────────────────

# The general Lifepath, anchored on the header the book prints after „Wynik".
# `column` picks a cell out of a multi-column table; `detail` names the column
# that describes the same answer, and `options` the one holding a list to pick
# from (the languages of a Culture of Origin).
GENERAL_SPECS: list[dict] = [
    {"id": "culture", "label": "Kultura pochodzenia", "anchor": "Kultura pochodzenia",
     "width": 2, "options": 1},
    {"id": "personality", "label": "Osobowość", "anchor": "Jaki jesteś?"},
    {"id": "clothing", "label": "Ubiór i styl", "anchor": "Styl ubioru",
     "width": 2, "last": True},
    {"id": "hair", "label": "Fryzura", "anchor": "Styl ubioru",
     "width": 2, "last": True, "column": 1},
    {"id": "affectation", "label": "Znak szczególny", "anchor": "Znaki szczególne"},
    {"id": "mostValuedPerson", "label": "Najważniejsza osoba",
     "anchor": "Najważniejsza osoba w twoim życiu?"},
    {"id": "valueMost", "label": "Co cenisz najbardziej", "anchor": "Co cenisz najbardziej?",
     "width": 2},
    {"id": "feelingsAboutPeople", "label": "Stosunek do ludzi",
     "anchor": "Co cenisz najbardziej?", "width": 2, "column": 1},
    {"id": "mostValuedPossession", "label": "Najważniejszy przedmiot",
     "anchor": "Najważniejszy posiadany przedmiot?"},
    {"id": "familyBackground", "label": "Tło rodzinne", "anchor": "Tło rodzinne",
     "width": 2, "detail": 1},
    {"id": "familyCrisis", "label": "Kryzys rodzinny", "anchor": "Historia"},
    {"id": "childhoodEnvironment", "label": "Środowisko", "anchor": "Środowisko rodzinne"},
    {"id": "friend", "label": "Przyjaciel jest dla ciebie…",
     "anchor": "Przyjaciel jest dla ciebie"},
    {"id": "enemyWho", "label": "Kim jest wróg", "anchor": "WrógPrzyczyna", "width": 3},
    {"id": "enemyCause", "label": "Przyczyna konfliktu", "anchor": "WrógPrzyczyna",
     "width": 3, "column": 1},
    {"id": "enemyResources", "label": "Czym dysponuje poszkodowany", "anchor": "WrógPrzyczyna",
     "width": 3, "column": 2},
    {"id": "revenge", "label": "Słodka zemsta", "anchor": "W przypadku spotkania"},
    {"id": "tragicLove", "label": "Jak skończyła się miłość", "anchor": "Co się stało?"},
    {"id": "lifeGoal", "label": "Cel życiowy", "anchor": "Cele życiowe"},
]


def slug(text: str) -> str:
    plain = text.replace("ł", "l").replace("Ł", "L")
    stripped = "".join(
        char for char in unicodedata.normalize("NFKD", plain) if not unicodedata.combining(char)
    )
    return re.sub(r"[^a-z0-9]+", "-", stripped.lower()).strip("-") or "tabela"


def to_entries(spec: dict, table: dict) -> list[dict]:
    width = spec.get("width", 1)
    column = spec.get("column", 0)
    prefer_last = bool(spec.get("last"))
    entries: list[dict] = []
    for index, row in enumerate(table["rows"]):
        cells = split_row(row, width, prefer_last)
        if cells is None:
            warn(
                f"Tabela {spec['id']}, wiersz {index + 1}: nie widzę {width} kolumn "
                f"w „{row[:70]}…” — potrzebny wpis w manual-overrides.json"
            )
            cells = [row] + [""] * (width - 1)
        low, high = table["rolls"][index]
        entry: dict = {"roll": low, "text": cells[column]}
        if high != low:
            entry["rollMax"] = high
        detail = spec.get("detail")
        if detail is not None and cells[detail]:
            entry["detail"] = cells[detail]
        options = spec.get("options")
        if options is not None and cells[options]:
            entry["options"] = split_options(cells[options])
        entries.append(entry)
    return entries


def split_options(text: str) -> list[str]:
    """„Angielski, Chiński … Włoski Norweski" -> one language per item.

    The dump drops some of the commas, and every language on the list is a
    single word, so a capital letter after a space starts a new one just as a
    comma does.
    """
    parts: list[str] = []
    for chunk in text.split(","):
        parts.extend(re.split(r"\s+(?=[A-ZĄĆĘŁŃÓŚŹŻ])", chunk.strip()))
    return [part.strip() for part in parts if part.strip()]


def build_general(tables: list[dict]) -> list[dict]:
    result: list[dict] = []
    for spec in GENERAL_SPECS:
        match = next(
            (t for t in tables if spec["anchor"].lower() in t["label"].lower()),
            None,
        )
        if match is None:
            warn(f"Nie znalazłem tabeli ogólnej {spec['id']} (kotwica {spec['anchor']!r})")
            continue
        entries = to_entries(spec, match)
        if match["sides"] != MAX_SIDES:
            warn(f"Tabela {spec['id']}: najwyższy wynik {match['sides']}, oczekiwane 10")
        # No `question` here on purpose: the general tables are fields of the
        # sheet („Fryzura", „Cel życiowy"), and the book's own prompt for them
        # is a paragraph of prose rather than a question. The Role tables are
        # the other way round and keep theirs.
        result.append(
            {
                "id": spec["id"],
                "label": spec["label"],
                "sides": match["sides"],
                "entries": entries,
            }
        )
    return result


def build_roles(tables: list[dict], marks: list[tuple[int, int]]) -> list[dict]:
    """Role Lifepaths, grouped by the page their table sits on."""
    by_role: dict[str, list[dict]] = {role_id: [] for role_id in MANUAL_ROLE_NAMES.values()}
    for table in tables:
        page = page_at(marks, table["at"])
        if page < ROLE_SECTION_FIRST_PAGE:
            continue
        banner = role_of_page(page)
        if banner is None:
            continue
        role_id = MANUAL_ROLE_NAMES[banner]
        table_id = f"{role_id}.{slug(table['label'])}"
        taken = {entry["id"] for entry in by_role[role_id]}
        if table_id in taken:
            table_id = f"{table_id}-{sum(1 for i in taken if i.startswith(table_id)) + 1}"
        by_role[role_id].append(
            {
                "id": table_id,
                "label": table["label"],
                # Two Role tables are introduced by a heading rather than a
                # question („Ogólna filozofia watahy"), and the heading is glued
                # to the row above it. Those fall back to the column header,
                # which says the same thing in one word.
                "question": table["question"] or table["label"],
                "sides": table["sides"],
                "entries": to_entries({"id": table_id}, table),
            }
        )
    result = []
    for banner, role_id in MANUAL_ROLE_NAMES.items():
        if not by_role[role_id]:
            warn(f"Rola {banner}: nie znalazłem ani jednej tabeli Ścieżki Życia")
        result.append({"roleId": role_id, "tables": by_role[role_id]})
    return result


def role_of_page(page: int) -> str | None:
    banner = None
    for start, name in ROLE_PAGES:
        if page >= start:
            banner = name
        else:
            break
    return banner


# ───────────────────────────────── nadpisania ─────────────────────────────────


def all_tables(payload: dict) -> list[dict]:
    return list(payload["general"]) + [t for role in payload["roles"] for t in role["tables"]]


def apply_overrides(payload: dict, overrides: dict) -> None:
    """`manual-overrides.json` → `lifepath` → tableId → roll → replacement.

    The dump loses a seam here and there and the trimming heuristics cannot see
    everything; this is where the operator repairs it by hand, exactly as
    `roleSkills` repairs the creation tables of stage 25a. A string replaces the
    row's text; an object is merged into the row.
    """
    fixes = (overrides.get("lifepath") or {}) if isinstance(overrides, dict) else {}
    if not fixes:
        return
    index = {table["id"]: table for table in all_tables(payload)}
    for table_id, rows in fixes.items():
        if table_id.startswith("$"):  # `$comment` and friends
            continue
        table = index.get(table_id)
        if table is None:
            warn(f"Nadpisanie dla nieznanej tabeli {table_id!r}")
            continue
        for roll, replacement in rows.items():
            entry = next((e for e in table["entries"] if str(e["roll"]) == str(roll)), None)
            if entry is None:
                warn(f"Nadpisanie {table_id}/{roll}: nie ma takiego wiersza")
                continue
            if isinstance(replacement, dict):
                entry.update(replacement)
            else:
                entry["text"] = replacement


def report_suspects(payload: dict) -> None:
    """Names last rows far longer than the rest of their table.

    Only the last row is measured, because that is the only one the page
    furniture can reach: every other row is fenced in by the next roll number.
    """
    for table in all_tables(payload):
        entries = table["entries"]
        for entry in entries:
            if not entry["text"]:
                warn(f"Pusty wiersz {table['id']}/{entry['roll']}")
        if len(entries) < 3:
            continue
        others = sorted(len(entry["text"]) for entry in entries[:-1])
        typical = others[len(others) // 2]
        last = entries[-1]
        if len(last["text"]) > max(70, typical * 2):
            warn(
                f"Podejrzanie długi ostatni wiersz {table['id']}/{last['roll']}: "
                f"„{last['text'][:90]}…”"
            )


# ──────────────────────────────────── main ────────────────────────────────────


def main() -> int:
    raw = load_chapter()
    flat = collapse(raw).strip()
    marks = page_index(raw)
    overrides = load_overrides()

    tables = find_tables(flat)
    general_tables = [t for t in tables if page_at(marks, t["at"]) < ROLE_SECTION_FIRST_PAGE]

    payload = {
        "schemaVersion": SCHEMA_VERSION,
        "source": SOURCE,
        # 1k10 − 7, minimum 0 (s. 50–52): the same throw decides how many
        # friends, how many enemies and how many tragic loves, so it is one
        # number here rather than three.
        "groupRoll": {"sides": 10, "modifier": -7, "min": 0},
        "general": build_general(general_tables),
        "roles": build_roles(tables, marks),
    }
    apply_overrides(payload, overrides)
    report_suspects(payload)
    write(CPRED_DIR / "lifepath.json", payload)

    role_tables = sum(len(role["tables"]) for role in payload["roles"])
    print(f"Tabele ogólne:  {len(payload['general'])} z {len(GENERAL_SPECS)}")
    print(f"Tabele Ról:     {role_tables} w {len(payload['roles'])} Rolach")
    for role in payload["roles"]:
        print(f"  {role['roleId']:<10} {len(role['tables'])}")
    if warnings:
        print(f"\nOstrzeżenia ({len(warnings)}):")
        for message in warnings:
            print(f"  ! {message}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
