"""Vehicle catalogue (stage 65a): rulebook markdown -> compendium JSON.

The three vehicle tables of s. 190-191 (land, water, air) come out of the
markdown dump as one run of text per table — the columns glued together:

    Motocykl Zwykły motocykl napędzany CHOOH².
    352 Ruch 20 100 M/h161 km/h 20 000 ed(Superluksusowy) Supermotocykl …

„352” is PUK 35 and 2 seats (seats are always one digit), so each row is read
from its name up to the first „<PUK><seats> Ruch <n> … km/h <price> ed”. The
names, kinds and the Family Motorpool threshold (s. 162) are listed here —
they are what the VTT needs to tell a motorcycle from a jetski, not text
lifted from the book. Everything this script writes is rulebook-derived and
lands in `data/private/` (gitignored).

Output:
    data/private/cpred/compendium/vehicles.json

Run:
    python tools/import/parse-vehicles.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
MANUAL = (
    REPO_ROOT
    / "data"
    / "private"
    / "rulebook"
    / "manual"
    / "CPRED-podrecznik"
    / "10-strzelanina-piatkowej-nocy.md"
)
OUT_PATH = REPO_ROOT / "data" / "private" / "cpred" / "compendium" / "vehicles.json"

# (name as printed, kind, Family Motorpool level from s. 162, PUK/seats per cabin, page)
VEHICLES = [
    ("Motocykl", "motorcycle", 1, False, 190),
    ("Supermotocykl", "motorcycle", 7, False, 190),
    ("Samochód kompaktowy", "car", 1, False, 190),
    ("Samochód sportowy", "car", 5, False, 190),
    ("Supersamochód", "car", 9, False, 190),
    ("Skuter wodny", "jetski", 1, False, 190),
    ("Motorówka", "boat", 5, False, 190),
    ("Łódź kabinowa", "boat", 7, True, 190),
    ("Jacht", "boat", 9, True, 190),
    ("Żyrokopter", "gyro", 1, False, 191),
    ("Helikopter", "aircraft", 5, False, 191),
    ("Wielozadaniowa aerodyna AV-4", "aircraft", 7, False, 191),
    ("Superaerodyna AV-9", "aircraft", 9, False, 191),
    ("Aerozep", "aircraft", 9, True, 191),
]

COST_CATEGORIES = {
    "superluksusowy": "superLuxury",
    "superluksusowa": "superLuxury",
    "luksusowy": "luxury",
    "luksusowa": "luxury",
}

ROW = re.compile(
    r"(?P<desc>.*?)\s*(?P<hp>\d+?)(?P<seats>\d)\s+(?:na\s+\w+\s+)?Ruch\s+(?P<move>\d+)\s+"
    r"\d+\s*M/h\s*(?P<kmh>\d+)\s*km/h\s+(?P<cost>\d[\d ]*?)\s*ed\s*\(?\s*(?P<band>\w+)",
    re.DOTALL,
)

PL_TRANSLITERATION = str.maketrans(
    {"ą": "a", "ć": "c", "ę": "e", "ł": "l", "ń": "n", "ó": "o", "ś": "s", "ź": "z", "ż": "z"}
)


def slugify(value: str) -> str:
    """Same slug rules as `shared/systems/cpred/ids.ts`."""
    lowered = value.lower().translate(PL_TRANSLITERATION)
    return re.sub(r"[^a-z0-9]+", "-", lowered).strip("-")


def section(text: str) -> str:
    start = text.index("### POJAZDY LĄDOWE")
    end = text.index("### PUNKTY USZKODZEŃ KADŁUBA")
    return text[start:end]


def parse(text: str) -> list[dict]:
    block = section(text)
    entries = []
    for name, kind, moto_level, per_room, page in VEHICLES:
        # Bez granicy słowa z przodu: nagłówek tabeli skleja się z pierwszym
        # wierszem („CenaMotocykl”). Wielka litera wystarcza — „Supermotocykl”
        # ma w środku małe „m”.
        found = re.search(rf"{re.escape(name)} ", block)
        if not found:
            raise SystemExit(f"vehicle not found in the table: {name}")
        row = ROW.match(block, found.end())
        if not row:
            raise SystemExit(f"stats not found after: {name}")
        description = " ".join(row["desc"].split())
        band = COST_CATEGORIES.get(row["band"].lower())
        entry = {
            "id": f"vehicle.{slugify(name)}",
            "category": "vehicle",
            "name": name,
            "description": description,
            "cost": int(row["cost"].replace(" ", "")),
            "vehicleKind": kind,
            "hp": int(row["hp"]),
            "seats": int(row["seats"]),
            "move": int(row["move"]),
            "speedKmh": int(row["kmh"]),
            "motoLevel": moto_level,
            "source": f"Cyberpunk RED (PL), s. {page}",
        }
        if band:
            entry["costCategory"] = band
        if per_room:
            entry["perRoom"] = True
        entries.append(entry)
    return entries


def main() -> None:
    if not MANUAL.exists():
        sys.exit(f"missing rulebook dump: {MANUAL} (see tools/rulebook/README.md)")
    entries = parse(MANUAL.read_text(encoding="utf-8"))
    payload = {
        "schemaVersion": 1,
        "source": "Cyberpunk RED (PL) — tabele pojazdów, s. 190–191",
        "entries": entries,
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    for entry in entries:
        print(
            f"{entry['name']:<30} {entry['vehicleKind']:<10} PUK {entry['hp']:>3}"
            f"  fotele {entry['seats']}  Ruch {entry['move']:>2}  {entry['cost']:>7} ed"
        )
    print(f"-> {OUT_PATH.relative_to(REPO_ROOT)} ({len(entries)} pojazdów)")


if __name__ == "__main__":
    main()
