"""Polish core rulebook -> gear compendium entries (stage 25c).

Until this stage the catalogue had 103 weapons, 11 armours, 96 pieces of
cyberware — and five items of gear. That was survivable while shopping meant
„the GM adds a rifle to your sheet", and stops being survivable the moment the
character creator opens a shop: a starting kit with no Agent, no flashlight and
no medtech bag is not a kit.

Source: chapter „Nowa Ekonomia Uliczna", section „GŁÓWNA LISTA OSPRZĘTU"
(s. 351–356). Two halves of the same section, and the parser needs both:

  * the **price table** survives the dump as one long line of
    `Nazwa CENA ed (Pasmo)` with no separators — but every name is followed by
    a price, so the price *is* the separator. Nothing here is ambiguous.
  * the **descriptions** are printed as prose, `Nazwa: opis`, right below the
    table. Having just read the names out of the price table, the parser knows
    exactly which words start a description, so the prose splits on the names
    it already trusts rather than on a guess about capital letters.

The two halves cross-check each other: a name in the table with no paragraph
below it, or a price that does not match its band on the rulebook's own ladder
(10 Tanie, 20 Codzienne, 50 Drogie, …), is reported as a warning.

Output (gitignored, rulebook-derived):
    data/private/cpred/compendium/gear.json

Run:
    python tools/import/parse-gear.py
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
OUT_DIR = REPO_ROOT / "data" / "private" / "cpred" / "compendium"

CHAPTER = "17-nowa-ekonomia-uliczna.md"
SECTION = "GŁÓWNA LISTA OSPRZĘTU"
SOURCE = "Cyberpunk RED — podręcznik główny (wydanie polskie), s. 351–356"

# The compendium refuses anything longer (COMPENDIUM_DESCRIPTION_MAX_LENGTH).
DESCRIPTION_MAX = 1000

# „100 ed (Premium)" — the price is the separator, and the name is whatever
# stands between two of them. Matching the *name* instead would be a guess:
# „Cyberdek (doskonałej jakości)" carries brackets of its own.
PRICE_RE = re.compile(r"\s*(\d[\d\s ]*)\s*ed\s*\(([^)]+)\)\s*")

# „MODA NogiTułówKurtka…" — the header row of the clothing matrix that follows
# the gear list without a heading of its own.
FASHION_TABLE_RE = re.compile(r"\bMODA\s+Nogi")

# „Ten cyberdek ma 9 gniazd na Programy i ulepszenia sprzętowe" (stage 26a).
# Chapter 11 prints the same three numbers as a column, but this chapter owns
# the deck rows — name, price and description — so the slot count is read here
# too rather than patched in from `parse-netrunning.py`: one owner per entry.
DECK_SLOTS_RE = re.compile(r"(\d+)\s+gniazd\w*\s+na\s+Programy")

# Bands as the Polish edition inflects them; the longer prefixes must be tested
# first, or „B. kosztowny" reads as „Kosztowny" and the item gets the wrong rung.
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


def section_of(chapter: str) -> str:
    """The one section between its own heading and the next one."""
    start = chapter.find(SECTION)
    if start == -1:
        raise SystemExit(f"Nie znalazłem sekcji „{SECTION}” w {CHAPTER}.")
    rest = chapter[start + len(SECTION) :]
    end = rest.find("\n### ")
    return rest if end == -1 else rest[:end]


def clean(text: str) -> str:
    """Collapses the dump's one-sentence-per-line layout into flowing text."""
    text = text.replace("­", "").replace("®", "").replace("™", "")
    text = re.sub(r"<!--.*?-->", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def band_of(label: str) -> str | None:
    key = clean(label).lower()
    for prefix, band in BAND_PREFIXES:
        if key.startswith(prefix):
            return band
    return None


# ────────────────────────────── tabela z cenami ──────────────────────────────


def price_table(section: str) -> list[tuple[str, int, str]]:
    """Every `Nazwa CENA ed (Pasmo)` of the section's price table, in order."""
    lines = [line for line in section.splitlines() if line.lstrip().startswith("PrzedmiotCena")]
    if not lines:
        raise SystemExit("Nie znalazłem tabeli cen — zrzut PDF-a zmienił kształt.")
    # The table runs over two columns and the header repeats at the top of the
    # second; dropping it leaves one continuous stream of name–price pairs.
    flat = clean(" ".join(lines)).replace("PrzedmiotCena", " ")

    # [nazwa, cena, pasmo, nazwa, cena, pasmo, …, ogon] — the tail after the last
    # price is whatever prose the table ran into and is dropped.
    parts = PRICE_RE.split(flat)
    rows: list[tuple[str, int, str]] = []
    for index in range(0, len(parts) - 2, 3):
        name = clean(parts[index])
        price = int(re.sub(r"\D", "", parts[index + 1]))
        label = parts[index + 2]
        if not name:
            warn(f"Cena {price} ed bez nazwy przedmiotu — wpis pominięty")
            continue
        band = band_of(label)
        if band is None:
            warn(f"{name}: nieznane pasmo ceny „{label}” — wpis pominięty")
            continue
        expected = COST_BAND_BY_PRICE.get(price)
        if expected is not None and expected != band:
            warn(f"{name}: cena {price} ed nie pasuje do pasma „{label}”")
        rows.append((name, price, band))
    return rows


# ───────────────────────────────── opisy ─────────────────────────────────


def descriptions(section: str, names: list[str]) -> dict[str, str]:
    """Splits the prose under the table on the names the table just gave us."""
    flat = clean(section)
    # The fashion matrix (s. 356) starts inside this section with no heading of
    # its own, so without a stop marker the last item's description swallows
    # nine columns of clothing prices.
    stop = FASHION_TABLE_RE.search(flat)
    if stop is None:
        warn("Nie znalazłem początku tabeli Mody — ostatni opis może być za długi")
    else:
        flat = flat[: stop.start()]
    # Longest first: „Cyberdek (zwykłej jakości):" must win over „Cyberdek:".
    ordered = sorted(names, key=len, reverse=True)
    pattern = re.compile(
        r"(?:(?<=^)|(?<=[\s.:;!?]))(" + "|".join(re.escape(name) for name in ordered) + r")\s*:\s*"
    )

    hits = [(match.group(1), match.end()) for match in pattern.finditer(flat)]
    starts = [match.start() for match in pattern.finditer(flat)]
    found: dict[str, str] = {}
    for index, (name, body_start) in enumerate(hits):
        body_end = starts[index + 1] if index + 1 < len(starts) else len(flat)
        body = flat[body_start:body_end].strip(" .;")
        if not body:
            continue
        # A first paragraph is a description; the whole rules essay behind the
        # Agent is a chapter. Cut on a sentence boundary so nothing ends mid-word.
        if len(body) > DESCRIPTION_MAX:
            cut = body.rfind(". ", 0, DESCRIPTION_MAX)
            body = body[: cut + 1] if cut > 200 else body[: DESCRIPTION_MAX - 1] + "…"
        # The table lists an item once; the prose may mention it again later.
        found.setdefault(name, body)
    return found


# ──────────────────────────────────── main ────────────────────────────────────


def main() -> int:
    section = section_of(load_chapter())
    rows = price_table(section)
    if not rows:
        raise SystemExit("Tabela cen jest pusta — sprawdź zrzut rozdziału 17.")

    texts = descriptions(section, [name for name, _, _ in rows])

    entries = []
    seen: set[str] = set()
    for name, price, band in rows:
        entry_id = f"gear.{slugify(name)}"
        if entry_id in seen:
            warn(f"{name}: powtórzony identyfikator {entry_id} — drugi wpis pominięty")
            continue
        seen.add(entry_id)
        description = texts.get(name)
        if description is None:
            warn(f"{name}: brak akapitu z opisem")
        slots = DECK_SLOTS_RE.search(description or "")
        entries.append(
            {
                "id": entry_id,
                "category": "gear",
                "name": name,
                "cost": price,
                "costCategory": band,
                **({"deckSlots": int(slots.group(1))} if slots else {}),
                **({"description": description} if description else {}),
            }
        )

    payload = {"source": SOURCE, "entries": entries}
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / "gear.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf8")

    described = sum(1 for entry in entries if "description" in entry)
    print(f"Sprzęt:  {len(entries)} wpisów ({described} z opisem) -> {path}")
    if warnings:
        print(f"\nOstrzeżenia ({len(warnings)}):")
        for message in warnings:
            print(f"  ! {message}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
