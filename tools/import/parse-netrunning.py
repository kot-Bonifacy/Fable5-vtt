"""Polish core rulebook -> netrunning data (stage 26a).

Source: chapter „Netrunner" (s. 195–218). Two outputs, because the chapter
carries two different kinds of thing:

  * **compendium entries** — Programs (Boosters, Defenders, Aggressors), Black
    ICE, Demons, the three cyberdecks and the six hardware upgrades. These are
    catalogue rows: they have a price, a description and a GM who may want to
    invent one more.
  * **rules tables** — the architecture ladder (s. 210), the Lobby and Content
    tables the GM rolls on, and the Interface -> Net Actions ladder (s. 198).
    These are data the engine reads, like `creation.json` from stage 25a.

How the dump has to be read
---------------------------
The PDF's tables survive as one unbroken line per table with the header glued
to the first cell, so the parser anchors on the only thing that is
unambiguous — the *numbers*:

  „Gumka Dopalacz 007 +2 do Testów Maskowania…20 ed(Codzienne) Ikona: …"
                    ^^^ ATK 0, OBR 0, REZ 7

Every Program row is `Nazwa KLASA <cyfry> Efekt CENA ed(Pasmo) Ikona: …`, so
the class keyword plus its digit run splits the stream into records. The name
of the *next* record is whatever trails the previous record's icon sentence —
icons always end in a full stop, names never contain one.

Black ICE adds two columns (PER, PRĘ) and a two-digit REZ, so its digit run is
six long instead of three: „462215" is PER 4, PRĘ 6, ATK 2, OBR 2, REZ 15.

Ownership note
--------------
The three cyberdecks are *not* here: chapter 17's gear list already owns those
rows, with better names and fuller descriptions, and states the slot count in
its own prose („Ten cyberdek ma 9 gniazd na Programy"). `parse-gear.py` reads
it from there — one owner per entry, no cross-parser patching.

Output (gitignored, rulebook-derived):
    data/private/cpred/compendium/netrunning.json
    data/private/cpred/netrunning.json

Run:
    python tools/import/parse-netrunning.py
"""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from terms import COST_BAND_BY_PRICE  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
MANUAL_DIR = REPO_ROOT / "data" / "private" / "rulebook" / "manual" / "CPRED-podrecznik"
COMPENDIUM_DIR = REPO_ROOT / "data" / "private" / "cpred" / "compendium"
CPRED_DIR = REPO_ROOT / "data" / "private" / "cpred"

CHAPTER = "11-netrunner.md"
SOURCE = "Cyberpunk RED — podręcznik główny (wydanie polskie), s. 195–218"

DESCRIPTION_MAX = 1000

PRICE_RE = re.compile(r"(\d[\d\s ]*)\s*ed\s*\(([^)]+)\)")

BAND_PREFIXES: list[tuple[str, str]] = [
    ("superluksusow", "superLuxury"),
    ("b. kosztow", "veryExpensive"),
    ("bardzo kosztow", "veryExpensive"),
    ("luksusow", "luxury"),
    ("kosztow", "expensive"),
    ("premium", "premium"),
    ("drog", "costly"),
    ("codzienn", "everyday"),
    ("tan", "cheap"),
]

PL_TRANSLITERATION = str.maketrans(
    {"ą": "a", "ć": "c", "ę": "e", "ł": "l", "ń": "n", "ó": "o", "ś": "s", "ź": "z", "ż": "z"}
)

# Column headers and marginalia the dump leaves inside the tables. Each one is
# deleted before the records are split; a pattern that stops matching is
# reported, because a silently changed dump is how a table loses a row.
NOISE_PATTERNS: list[tuple[str, str]] = [
    ("nagłówek tabeli Programów", r"NazwaKlasaATKDEFREZEfektCena"),
    ("nagłówek tabeli Czarnego LOD-u", r"NazwaKlasaPERPRĘATKDEFREZEfektCena"),
    ("nagłówek tabeli Demonów", r"NazwaREZInterfejsAkcje Sieciowe Wartość bojowa"),
    ("nagłówek tabeli ulepszeń", r"NazwaOpisCena"),
    ("stopka strony", r":\s*\d+\s*NETRUNNER"),
    ("śródtytuł DOPALACZE", r"\bDOPALACZE\b"),
    ("śródtytuł OBROŃCY", r"\bO\s+BROŃCY\b"),
    ("śródtytuł AGRESORZY", r"\bA\s+GRESORZY\b"),
    ("marginalia REDEYE", r"NAJBARDZIEJ ZNIENAWIDZONY CZARNY LOD\?.*?—\s*REDEYE"),
]

# Program classes, longest first so „Agresor przeciwbiałkowy" wins over a bare
# „Agresor". The digit run that follows is ATK/OBR/REZ, one digit each.
PROGRAM_CLASSES: list[tuple[str, str, str | None]] = [
    ("Agresor przeciwprogramowy", "attacker", "antiProgram"),
    ("Agresor przeciwbiałkowy", "attacker", "antiPersonnel"),
    ("Dopalacz", "booster", None),
    ("Obrońca", "defender", None),
]

ICE_CLASSES: list[tuple[str, str]] = [
    ("Przeciwbiałkowy Czarny LOD", "antiPersonnel"),
    ("Przeciwprogramowy Czarny LOD", "antiProgram"),
]

DIFFICULTIES = ["basic", "standard", "high", "advanced"]

warnings: list[str] = []


def warn(message: str) -> None:
    warnings.append(message)


def slugify(value: str) -> str:
    """Same slug rules as `shared/systems/cpred/ids.ts`."""
    lowered = value.lower().translate(PL_TRANSLITERATION)
    stripped = "".join(
        char for char in unicodedata.normalize("NFD", lowered) if not unicodedata.combining(char)
    )
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", stripped))


def load_chapter() -> str:
    path = MANUAL_DIR / CHAPTER
    if not path.exists():
        raise SystemExit(f"Brak rozdziału {path} — materiały prywatne są poza repo.")
    return path.read_text(encoding="utf8")


def clean(text: str) -> str:
    text = text.replace("­", "").replace("®", "").replace("™", "")
    text = re.sub(r"<!--.*?-->", " ", text)
    # Markdown headings whose title is noise („### A GRESORZY") lose the title
    # in `denoise` and would otherwise leave their hashes glued to the next name.
    text = re.sub(r"(?m)^#{1,6}\s*", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def slice_between(chapter: str, start: str, end: str, label: str) -> str:
    begin = chapter.find(start)
    if begin == -1:
        raise SystemExit(f"Nie znalazłem początku sekcji „{label}” ({start!r}).")
    rest = chapter[begin + len(start) :]
    stop = rest.find(end)
    if stop == -1:
        warn(f"{label}: nie znalazłem końca sekcji ({end!r}) — biorę resztę rozdziału")
        return rest
    return rest[:stop]


def denoise(text: str) -> str:
    """Strips table headers and marginalia, reporting patterns that went quiet."""
    for label, pattern in NOISE_PATTERNS:
        text, hits = re.subn(pattern, " ", text, flags=re.DOTALL)
        if hits == 0 and label.startswith("nagłówek"):
            continue  # Not every header belongs to every slice.
    return re.sub(r"\s+", " ", text).strip()


def band_of(label: str) -> str | None:
    key = clean(label).lower()
    for prefix, band in BAND_PREFIXES:
        if key.startswith(prefix):
            return band
    return None


def split_price(chunk: str, name: str) -> tuple[str, int | None, str | None, str]:
    """`Efekt CENA ed(Pasmo) Ikona: …` -> (efekt, cena, pasmo, ogon)."""
    match = PRICE_RE.search(chunk)
    if match is None:
        warn(f"{name}: brak ceny w wierszu")
        return chunk.strip(), None, None, ""
    effect = chunk[: match.start()].strip(" .;")
    price = int(re.sub(r"\D", "", match.group(1)))
    band = band_of(match.group(2))
    if band is None:
        warn(f"{name}: nieznane pasmo ceny „{match.group(2)}”")
    expected = COST_BAND_BY_PRICE.get(price)
    if band is not None and expected is not None and expected != band:
        warn(f"{name}: cena {price} ed nie pasuje do pasma „{match.group(2)}”")
    return effect, price, band, chunk[match.end() :]


def split_icon(tail: str) -> tuple[str | None, str]:
    """`Ikona: … . NastępnaNazwa` -> (ikona, nazwa następnego wpisu).

    Icons are always full sentences and names never carry a full stop, so the
    text after the last one belongs to the row below.
    """
    tail = tail.strip()
    marker = tail.find("Ikona:")
    if marker == -1:
        return None, tail.strip(" .;")
    body = tail[marker + len("Ikona:") :].strip()
    cut = body.rfind(".")
    if cut == -1:
        return body.strip(" .;") or None, ""
    icon = body[: cut + 1].strip()
    return icon or None, body[cut + 1 :].strip()


def trimmed(text: str) -> str:
    if len(text) <= DESCRIPTION_MAX:
        return text
    cut = text.rfind(". ", 0, DESCRIPTION_MAX)
    return text[: cut + 1] if cut > 200 else text[: DESCRIPTION_MAX - 1] + "…"


# ─────────────────────────────── Programy i LOD ───────────────────────────────


def parse_records(
    text: str, anchors: list[tuple[str, re.Pattern[str]]], first_name: str | None
) -> list[dict]:
    """Splits a table stream on class keywords, carrying names across records.

    `anchors` pairs a class keyword with the digit-run pattern that follows it.
    The name of record *n+1* falls out of record *n*'s tail (see `split_icon`),
    which is why the caller only has to supply the very first one.
    """
    pattern = re.compile(
        "|".join(f"(?:{re.escape(keyword)})\\s*({digits.pattern})" for keyword, digits in anchors)
    )
    keyword_re = re.compile("|".join(re.escape(keyword) for keyword, _ in anchors))

    matches = list(pattern.finditer(text))
    if not matches:
        return []

    records: list[dict] = []
    pending = first_name if first_name is not None else text[: matches[0].start()].strip()
    for index, match in enumerate(matches):
        keyword_match = keyword_re.search(text, match.start(), match.end())
        keyword = keyword_match.group(0) if keyword_match else ""
        digits = next(group for group in match.groups() if group)
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        chunk = text[match.end() : end]
        name = clean(pending)
        effect, price, band, tail = split_price(chunk, name or "?")
        icon, pending = split_icon(tail)
        if not name:
            warn(f"wiersz z klasą „{keyword}” bez nazwy — pominięty")
            continue
        records.append(
            {
                "name": name,
                "keyword": keyword,
                "digits": digits,
                "effect": effect,
                "cost": price,
                "band": band,
                "icon": icon,
            }
        )
    return records


def parse_programs(chapter: str) -> list[dict]:
    stream = denoise(clean(slice_between(chapter, "DOPALACZE", "Czarny lod Czarny LOD", "Programy")))
    anchors = [(keyword, re.compile(r"\d{3}")) for keyword, _, _ in PROGRAM_CLASSES]
    by_keyword = {keyword: (cls, target) for keyword, cls, target in PROGRAM_CLASSES}

    entries: list[dict] = []
    for record in parse_records(stream, anchors, None):
        program_class, target = by_keyword[record["keyword"]]
        atk, defence, rez = (int(char) for char in record["digits"])
        entries.append(
            program_entry(record, program_class, target, atk, defence, rez, black_ice=False)
        )
    return entries


def parse_black_ice(chapter: str) -> list[dict]:
    stream = denoise(
        clean(slice_between(chapter, "NazwaKlasaPERPRĘATKDEFREZEfektCena", "Inne ulepszenia", "LOD"))
    )
    anchors = [(keyword, re.compile(r"\d{6}")) for keyword, _ in ICE_CLASSES]
    by_keyword = dict(ICE_CLASSES)

    entries: list[dict] = []
    for record in parse_records(stream, anchors, None):
        target = by_keyword[record["keyword"]]
        digits = record["digits"]
        per, speed, atk, defence = (int(char) for char in digits[:4])
        rez = int(digits[4:])
        entry = program_entry(record, "attacker", target, atk, defence, rez, black_ice=True)
        entry["per"] = per
        entry["speed"] = speed
        entries.append(entry)
    return entries


def program_entry(
    record: dict,
    program_class: str,
    target: str | None,
    atk: int,
    defence: int,
    rez: int,
    *,
    black_ice: bool,
) -> dict:
    return {
        "id": f"program.{slugify(record['name'])}",
        "category": "program",
        "name": record["name"],
        "programClass": program_class,
        **({"target": target} if target else {}),
        **({"blackIce": True} if black_ice else {}),
        "atk": atk,
        "def": defence,
        "rez": rez,
        "slots": 2 if black_ice else 1,
        "cost": record["cost"],
        **({"costCategory": record["band"]} if record["band"] else {}),
        **({"description": trimmed(record["effect"])} if record["effect"] else {}),
        **({"icon": trimmed(record["icon"])} if record["icon"] else {}),
    }


# ───────────────────────────────── Demony ─────────────────────────────────


def parse_demons(chapter: str) -> list[dict]:
    stream = denoise(
        clean(
            slice_between(
                chapter,
                "DEMONY NazwaREZInterfejsAkcje Sieciowe Wartość bojowa",
                "JAK ROZUMIEĆ TABELE SYSTEMÓW OBRONY",
                "Demony",
            )
        )
    )
    # „Diablik 153214" — REZ 15, Interfejs 3, Akcje Sieciowe 2, Wartość bojowa 14.
    matches = list(re.finditer(r"(?<![\d])(\d{6})(?![\d])", stream))
    if not matches:
        raise SystemExit("Nie znalazłem wierszy Demonów — zrzut rozdziału zmienił kształt.")

    prices = demon_prices(chapter)
    entries: list[dict] = []
    pending = stream[: matches[0].start()]
    for index, match in enumerate(matches):
        digits = match.group(1)
        end = matches[index + 1].start() if index + 1 < len(matches) else len(stream)
        name = clean(pending)
        # The tail carries this row's icon and the *next* row's name.
        icon, pending = split_icon(stream[match.end() : end])
        if not name:
            warn("wiersz Demona bez nazwy — pominięty")
            continue
        cost, band = prices.get(name, (None, None))
        if cost is None:
            warn(f"{name}: brak ceny w tabeli Demonów (s. 218)")
        entries.append(
            {
                "id": f"demon.{slugify(name)}",
                "category": "netDefense",
                "defenseKind": "demon",
                "name": name,
                "rez": int(digits[:2]),
                "interfaceRank": int(digits[2]),
                "netActions": int(digits[3]),
                "combatValue": int(digits[4:]),
                "cost": cost,
                **({"costCategory": band} if band else {}),
                **({"icon": trimmed(icon)} if icon else {}),
            }
        )
    return entries


def demon_prices(chapter: str) -> dict[str, tuple[int, str | None]]:
    stream = clean(
        slice_between(chapter, "DemonyCena", "INSTALACJA SYSTEMÓW OBRONNYCH", "ceny Demonów")
    )
    prices: dict[str, tuple[int, str | None]] = {}
    parts = PRICE_RE.split(stream)
    for index in range(0, len(parts) - 2, 3):
        name = clean(parts[index])
        if not name:
            continue
        prices[name] = (int(re.sub(r"\D", "", parts[index + 1])), band_of(parts[index + 2]))
    return prices


# ─────────────────────────── ulepszenia sprzętowe ───────────────────────────

# Names here run `Nazwa Opis…`, with no punctuation between them. A name keeps
# going while the words are lowercase or acronyms; the first ordinary capital
# starts the description („Bariera Cyberdek z tym ulepszeniem…" -> „Bariera").
NAME_WORD_RE = re.compile(r"^(?:[a-ząćęłńóśźż0-9-]+|[A-ZĄĆĘŁŃÓŚŹŻ]{2,})$")
NAME_WORDS_MAX = 4


def split_name(chunk: str) -> tuple[str, str]:
    words = chunk.split()
    if not words:
        return "", ""
    taken = 1
    while taken < min(len(words), NAME_WORDS_MAX) and NAME_WORD_RE.match(words[taken]):
        taken += 1
    return " ".join(words[:taken]), " ".join(words[taken:])


def parse_hardware(chapter: str) -> list[dict]:
    section = slice_between(chapter, "ULEPSZENIA SPRZĘTOWE CYBERDEKU", "Sieciowanie", "ulepszenia")
    # Two paragraphs of prose stand between the heading and the table; without
    # cutting them the first row's name would be „Gniazda cyberdeku mogą…".
    table = slice_between(section, "NazwaOpisCena", "\n## ", "tabela ulepszeń")
    parts = PRICE_RE.split(denoise(clean(table)))
    entries: list[dict] = []
    for index in range(0, len(parts) - 2, 3):
        name, description = split_name(clean(parts[index]))
        if not name:
            continue
        cost = int(re.sub(r"\D", "", parts[index + 1]))
        band = band_of(parts[index + 2])
        slots = 2 if re.search(r"Zajmuje 2 gniazda", description) else 1
        entries.append(
            {
                "id": f"gear.{slugify(name)}",
                "category": "gear",
                "name": name,
                "cost": cost,
                **({"costCategory": band} if band else {}),
                "deckSlotCost": slots,
                **({"description": trimmed(description)} if description else {}),
            }
        )
    return entries


# ───────────────────────────── tabele architektury ─────────────────────────────

FLOOR_RE = re.compile(r"(Hasło|Plik|Węzeł kontrolny)\s*PT\s*(\d+)", re.IGNORECASE)


def floor_content(text: str, ice_ids: dict[str, str]) -> dict:
    """One cell of the content tables: a DV row, or one-or-more Black ICE."""
    text = clean(text).strip(" .")
    hit = FLOOR_RE.search(text)
    if hit:
        kind = {"hasło": "password", "plik": "file", "węzeł kontrolny": "controlNode"}[
            hit.group(1).lower()
        ]
        return {"kind": kind, "dv": int(hit.group(2))}

    programs: list[str] = []
    for part in text.split(","):
        part = part.strip()
        if not part:
            continue
        repeat = 1
        times = re.search(r"\bx\s*(\d+)$", part)
        if times:
            repeat = int(times.group(1))
            part = part[: times.start()].strip()
        program_id = ice_ids.get(slugify(part))
        if program_id is None:
            warn(f"tabela architektury: nie znam Programu „{part}”")
            continue
        programs.extend([program_id] * repeat)
    if not programs:
        warn(f"tabela architektury: nie rozumiem pola „{text}”")
        return {"kind": "empty"}
    return {"kind": "ice", "programIds": programs}


def parse_lobby_table(chapter: str, ice_ids: dict[str, str]) -> list[dict]:
    stream = clean(
        slice_between(
            chapter, "PIERWSZE DWA PIĘTRA (LOBBY) RzutPiętro lobby", "ARCHITEKTURA SIECIOWA:", "lobby"
        )
    )
    rows = split_numbered(stream, range(1, 7), "tabela Lobby")
    return [{"roll": roll, **floor_content(cell, ice_ids)} for roll, cell in rows]


def parse_content_table(chapter: str, ice_ids: dict[str, str]) -> list[dict]:
    stream = clean(
        slice_between(
            chapter,
            "Rzut (3k6)Podstawowa TrudnośćStandardowa TrudnośćWysoka TrudnośćZaawansowana Trudność",
            "<!-- s. 212 -->",
            "tabela zawartości",
        )
    )
    rows = split_numbered(stream, range(3, 19), "tabela zawartości")
    table: list[dict] = []
    for roll, cell in rows:
        columns = split_columns(cell)
        if len(columns) != 4:
            warn(f"tabela zawartości, rzut {roll}: {len(columns)} kolumn zamiast 4 — wiersz pominięty")
            continue
        table.append(
            {
                "roll": roll,
                **{
                    difficulty: floor_content(column, ice_ids)
                    for difficulty, column in zip(DIFFICULTIES, columns)
                },
            }
        )
    return table


def split_numbered(stream: str, rolls: range, label: str) -> list[tuple[int, str]]:
    """`1 …cell… 2 …cell… 3 …` -> [(1, cell), (2, cell), …] for the given rolls.

    A roll number stands alone between spaces, which is what separates it from
    the numbers *inside* a cell: „Hasło PT 12" glues its DV to the word before
    it („PT 6Hasło") or carries a `PT` right in front, and both are excluded.
    """
    rows: list[tuple[int, str]] = []
    positions: list[tuple[int, int, int]] = []
    cursor = 0
    for roll in rolls:
        hit = re.compile(rf"(?:^|(?<=\s))(?<!PT ){roll}(?=\s)").search(stream, cursor)
        if hit is None:
            warn(f"{label}: brak wiersza {roll}")
            continue
        positions.append((roll, hit.start(), hit.end()))
        cursor = hit.end()
    for index, (roll, _, end) in enumerate(positions):
        stop = positions[index + 1][1] if index + 1 < len(positions) else len(stream)
        rows.append((roll, stream[end:stop]))
    return rows


# Column boundaries inside a content-table row: the dump glues four cells
# together, and the only seam is „…LODcapital" or „…PT 8Hasło".
COLUMN_SEAM_RE = re.compile(r"(?<=[a-ząćęłńóśźż0-9])(?=[A-ZĄĆĘŁŃÓŚŹŻ])")


def split_columns(cell: str) -> list[str]:
    parts = [part.strip() for part in COLUMN_SEAM_RE.split(clean(cell)) if part.strip()]
    return merge_columns(parts)


def merge_columns(parts: list[str]) -> list[str]:
    """Rejoins pieces the seam rule over-split („Piekielny ogar" is one cell)."""
    merged: list[str] = []
    for part in parts:
        if merged and needs_join(merged[-1], part):
            merged[-1] = f"{merged[-1]} {part}"
        else:
            merged.append(part)
    return merged


def needs_join(previous: str, part: str) -> bool:
    # A cell that ends in a comma is waiting for its second Program, and a cell
    # made of one capitalised word („Skunks") never starts with a lone „x2".
    return previous.rstrip().endswith(",") or part.startswith("x")


def parse_difficulty_ladder(chapter: str) -> list[dict]:
    stream = clean(
        slice_between(chapter, "PT hasła/Pliku/węzła kontrolnego", "KROK 1:", "poziomy trudności")
    )
    dvs = [int(value) for value in re.findall(r"PT\s*(\d+)", stream)]
    ranks = re.search(r"sukces\s*((?:\d\s*){4})", stream)
    if len(dvs) != 4 or ranks is None:
        warn("poziomy trudności: nie odczytałem tabeli — zostaje domyślna drabina")
        return []
    suggested = [int(char) for char in re.sub(r"\D", "", ranks.group(1))]
    return [
        {"id": difficulty, "dv": dv, "suggestedInterface": rank}
        for difficulty, dv, rank in zip(DIFFICULTIES, dvs, suggested)
    ]


def parse_bands(text: str, wanted: int) -> list[tuple[int, int]]:
    """`1–34–67–910` -> [(1, 3), (4, 6), (7, 9), (10, 10)].

    The dump drops every separator *between* bands, so „34" could be one number
    or the end of one band and the start of the next. What resolves it without
    guessing is that the bands are contiguous: each one starts exactly where the
    previous one stopped. Reading a digit at a time and backtracking whenever
    that rule breaks leaves exactly one way to read the string.
    """
    digits = re.sub(r"[^\d–-]", "", text)

    def walk(pos: int, expected_min: int, taken: list[tuple[int, int]]):
        if len(taken) == wanted:
            return taken if pos == len(digits) else None
        for low_len in (1, 2):
            low = digits[pos : pos + low_len]
            if not low.isdigit() or int(low) != expected_min:
                continue
            after = pos + low_len
            if after < len(digits) and digits[after] in "–-":
                for high_len in (1, 2):
                    high = digits[after + 1 : after + 1 + high_len]
                    if not high.isdigit() or int(high) < int(low):
                        continue
                    found = walk(
                        after + 1 + high_len,
                        int(high) + 1,
                        [*taken, (int(low), int(high))],
                    )
                    if found:
                        return found
            found = walk(after, int(low) + 1, [*taken, (int(low), int(low))])
            if found:
                return found
        return None

    return walk(0, 1, []) or []


def parse_net_actions(chapter: str) -> list[dict]:
    stream = clean(slice_between(chapter, "Poziom Interfejsu", "Zatem Netrunner", "Akcje Sieciowe"))
    counts = re.search(r"Akcje Sieciowe\s*(\d+)", stream)
    if counts is None:
        warn("Akcje Sieciowe: nie odczytałem tabeli — zostaje domyślna drabina")
        return []
    digits = [int(char) for char in counts.group(1)]
    ranges = parse_bands(stream[: counts.start()], len(digits))
    if len(ranges) != len(digits):
        warn("Akcje Sieciowe: liczba pasm nie zgadza się z liczbą wartości")
        return []
    return [
        {"min": low, "max": high, "actions": actions}
        for (low, high), actions in zip(ranges, digits)
    ]


# ──────────────────────────────────── main ────────────────────────────────────


def main() -> int:
    chapter = load_chapter()

    programs = parse_programs(chapter)
    black_ice = parse_black_ice(chapter)
    demons = parse_demons(chapter)
    hardware = parse_hardware(chapter)

    ice_ids = {slugify(entry["name"]): entry["id"] for entry in black_ice}
    lobby = parse_lobby_table(chapter, ice_ids)
    content = parse_content_table(chapter, ice_ids)
    ladder = parse_difficulty_ladder(chapter)
    net_actions = parse_net_actions(chapter)

    entries = programs + black_ice + demons + hardware
    seen: set[str] = set()
    unique: list[dict] = []
    for entry in entries:
        if entry["id"] in seen:
            warn(f"{entry['name']}: powtórzony identyfikator {entry['id']} — drugi wpis pominięty")
            continue
        seen.add(entry["id"])
        unique.append(entry)

    COMPENDIUM_DIR.mkdir(parents=True, exist_ok=True)
    compendium_path = COMPENDIUM_DIR / "netrunning.json"
    compendium_path.write_text(
        json.dumps({"source": SOURCE, "entries": unique}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf8",
    )

    CPRED_DIR.mkdir(parents=True, exist_ok=True)
    rules_path = CPRED_DIR / "netrunning.json"
    rules_path.write_text(
        json.dumps(
            {
                "source": SOURCE,
                "netActions": net_actions,
                "difficulties": ladder,
                "lobbyTable": lobby,
                "contentTable": content,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf8",
    )

    print(
        f"Sieć: {len(programs)} Programów, {len(black_ice)} Czarnych LOD-ów, "
        f"{len(demons)} Demonów, {len(hardware)} ulepszeń -> {compendium_path}"
    )
    print(
        f"      lobby {len(lobby)} wierszy, zawartość {len(content)} wierszy, "
        f"{len(ladder)} poziomów trudności -> {rules_path}"
    )
    if warnings:
        print(f"\nOstrzeżenia ({len(warnings)}):")
        for message in warnings:
            print(f"  ! {message}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
