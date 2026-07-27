"""Step 2 of the compendium pipeline: extracted text -> compendium JSON.

The free material never prints one tidy weapons table, so this script harvests
*evidence* instead of parsing a table: every NPC statblock in the DLCs states
its weapons ("PQ Heavy Pistol (ROF2) 3d6") and armor ("Body: Kevlar SP 7").
Collecting those across ~60 statblocks and keeping the dominant value per base
type gives numbers that are sourced, countable and auditable — the report says
how many statblocks back each row and which files they came from.

Named weapons from the gear DLCs ("An Excellent Quality Heavy Pistol",
"Cost: 550eb (Expensive)") become compendium entries pointing at those base
types, so a single confirmed base row feeds dozens of concrete items.

Output (gitignored, rulebook-derived):
    data/private/cpred/compendium/weapon-types.json
    data/private/cpred/compendium/armor.json
    data/private/cpred/compendium/weapons.json
    data/private/cpred/compendium/import-report.json

Run:
    uv run --with pdfplumber python tools/import/parse-compendium.py
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from terms import (  # noqa: E402
    ARMOR_NAMES,
    COST_BANDS,
    QUALITY_WORDS,
    VARIABLE_DAMAGE_TYPES,
    WEAPON_TYPES,
    normalise,
    resolve_armor,
    resolve_weapon_type,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
TEXT_DIR = REPO_ROOT / "data" / "private" / "rulebook" / "text"
PDF_DIR = REPO_ROOT / "data" / "private" / "rulebook" / "pdf"
OUT_DIR = REPO_ROOT / "data" / "private" / "cpred" / "compendium"
MANUAL_DIR = REPO_ROOT / "data" / "private" / "rulebook" / "manual"

# Gear DLCs whose named weapons we turn into compendium entries. Two-column
# layout, so each page is cropped down the middle before extraction.
NAMED_WEAPON_SOURCES = {
    "RTG-CPR-DLC-TogglesTemplev1.1.pdf": "Toggle's Temple (DLC)",
    "RTG-CPR-DLC-WoodchippersGaragev1.01.pdf": "Woodchipper's Garage (DLC)",
    "RTG-CPR-TwelveDaysofGunmasv1.3.pdf": "12 Days of Gunmas (DLC)",
}

SOURCE_LABELS = {
    "CRED-EasyMode": "Cyberpunk RED Easy Mode (PL)",
    "CPRED-DLC_01_Stara-giwera": "Stara giwera nigdy nie umiera (DLC PL)",
    "RTG-CPR-DLC-EverydayPeoplev1.01": "Everyday People (DLC)",
    "RTG-CPR-DLC-GangGuide": "Night City Gang Guide (DLC)",
    "RTG-CPR-HardenedMooks": "Hardened Mooks (DLC)",
    "RTG-CPR-HardenedLTs": "Hardened Lieutenants (DLC)",
    "RTG-CPR-DLC-HardenedMB": "Hardened Mini Bosses (DLC)",
    "RTG-CPR-DLC-12DaysofREDmas": "12 Days of REDmas (DLC)",
    "RTG-CPR-DLC-TogglesTemplev1.1": "Toggle's Temple (DLC)",
    "RTG-CPR-DLC-WoodchippersGaragev1.01": "Woodchipper's Garage (DLC)",
    "RTG-CPR-TwelveDaysofGunmasv1.3": "12 Days of Gunmas (DLC)",
}

# "PQ Heavy Pistol (ROF2) 3d6" — quality prefix and ROF are both optional.
ATTACK_RE = re.compile(
    r"\b((?:PQ|SQ|EQ|Poor Quality|Standard Quality|Excellent Quality)\s+)?"
    r"([A-Za-z][A-Za-z /'\-]{2,34}?)\s*\(\s*ro\s*F\s*(\d)\s*\)\s*(\d{1,2})\s?d\s?6",
    re.IGNORECASE,
)
# "Body: Kevlar® SP 7" / "Head: NoNe —"
ARMOR_RE = re.compile(
    r"\b(Head|Body)\s*:\s*([A-Za-z®™'’ \-]{3,30}?)\s+s\s?P\s*(\d{1,2})",
    re.IGNORECASE,
)
# The Hardened DLCs write it inline instead: "Heavy Armorjack (SP13) Body Armor"
ARMOR_PAREN_RE = re.compile(r"\b([A-Za-z][A-Za-z ]{2,24}?)\s*\(\s*SP\s*(\d{1,2})\s*\)")
# "An Excellent Quality Heavy Pistol." / "A Poor Quality Shotgun with ..."
NAMED_TYPE_RE = re.compile(
    r"\bAn?\s+(Poor|Standard|Excellent)\s+Quality\s+([A-Za-z][A-Za-z /\-]{2,30}?)\s*(?:[.,]|\swith\b|\sthat\b|\scomes\b|\sIt\b)",
    re.IGNORECASE,
)
COST_RE = re.compile(r"Cost:\s*([\d,]+)\s*eb(?:\s*\((.*?)\))?", re.IGNORECASE)
SLOTS_RE = re.compile(r"Slots:\s*(\d)", re.IGNORECASE)


@dataclass
class Evidence:
    """Values seen for one base type, with the files that stated them."""

    damage: Counter[str] = field(default_factory=Counter)
    rof: Counter[int] = field(default_factory=Counter)
    sources: set[str] = field(default_factory=set)
    count: int = 0

    def best_damage(self) -> str | None:
        return self.damage.most_common(1)[0][0] if self.damage else None

    def best_rof(self) -> int | None:
        return self.rof.most_common(1)[0][0] if self.rof else None

    def conflicts(self) -> bool:
        return len(self.damage) > 1


def source_label(stem: str) -> str:
    return SOURCE_LABELS.get(stem, stem)


def harvest_statblocks() -> tuple[dict[str, Evidence], dict[str, Evidence], list[str]]:
    """Scans every extracted text for weapon attacks and armor lines."""
    weapons: dict[str, Evidence] = defaultdict(Evidence)
    armor: dict[str, Evidence] = defaultdict(Evidence)
    warnings: list[str] = []

    for path in sorted(TEXT_DIR.glob("*.txt")):
        text = path.read_text(encoding="utf-8")
        label = source_label(path.stem)

        for match in ATTACK_RE.finditer(text):
            type_id = resolve_weapon_type(match.group(2))
            if type_id is None:
                continue
            evidence = weapons[type_id]
            evidence.damage[f"{int(match.group(4))}k6"] += 1
            evidence.rof[int(match.group(3))] += 1
            evidence.sources.add(label)
            evidence.count += 1

        for match in ARMOR_RE.finditer(text):
            armor_id = resolve_armor(match.group(2))
            if armor_id is None:
                continue
            evidence = armor[armor_id]
            evidence.damage[match.group(3)] += 1  # reuse counter for SP
            evidence.sources.add(label)
            evidence.count += 1

        for match in ARMOR_PAREN_RE.finditer(text):
            armor_id = resolve_armor(match.group(1))
            if armor_id is None:
                continue
            evidence = armor[armor_id]
            evidence.damage[match.group(2)] += 1
            evidence.sources.add(label)
            evidence.count += 1

    for type_id, evidence in weapons.items():
        if type_id in VARIABLE_DAMAGE_TYPES:
            continue  # damage scales with the wielder — reported, not resolved
        if evidence.conflicts():
            warnings.append(
                f"broń {type_id}: rozbieżne obrażenia {dict(evidence.damage)} — wybrano {evidence.best_damage()}"
            )
    for armor_id, evidence in armor.items():
        if evidence.conflicts():
            warnings.append(
                f"pancerz {armor_id}: rozbieżne OB {dict(evidence.damage)} — wybrano {evidence.best_damage()}"
            )
    return weapons, armor, warnings


def parse_easy_mode_ranges() -> tuple[dict[str, list[int | None]], list[str]]:
    """Reads the ranged-combat DV table (Easy Mode, Polish)."""
    path = TEXT_DIR / "CRED-EasyMode.txt"
    if not path.exists():
        return {}, ["brak CRED-EasyMode.txt — tabela PT zasięgów pominięta"]
    text = path.read_text(encoding="utf-8")
    rows = {
        "Pistolety": "handguns",
        "Strzelby": "shotgun",
        "Karabiny": "assault rifle",
    }
    table: dict[str, list[int | None]] = {}
    warnings: list[str] = []
    for label, target in rows.items():
        match = re.search(
            rf"^\s*{label}\s+((?:(?:\d+|Nd\.)\s+){{6,8}})",
            text,
            re.MULTILINE,
        )
        if not match:
            warnings.append(f"tabela PT: nie znaleziono wiersza „{label}”")
            continue
        values: list[int | None] = []
        for token in match.group(1).split():
            values.append(None if token.startswith("Nd") else int(token))
        while len(values) < 8:
            values.append(None)
        table[target] = values[:8]
    return table, warnings


def load_manual_overrides() -> dict:
    """Hand-checked values that no regex can reach (e.g. the rotated Easy Mode
    character-sheet pages). Lives in data/private — never in the repository."""
    path = MANUAL_DIR / "overrides.json"
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def build_weapon_types(
    evidence: dict[str, Evidence],
    ranges: dict[str, list[int | None]],
    overrides: dict,
) -> tuple[list[dict], list[str]]:
    notes: list[str] = []
    manual_types = overrides.get("weaponTypes", {})
    result: list[dict] = []

    for type_id in sorted(set(evidence) | set(manual_types)):
        if type_id not in WEAPON_TYPES:
            notes.append(f"pominięto nieznany typ broni: {type_id}")
            continue
        name_pl, skill_id, melee = WEAPON_TYPES[type_id]
        seen = evidence.get(type_id, Evidence())
        manual = manual_types.get(type_id, {})

        damage = manual.get("damage") or seen.best_damage()
        if not damage:
            notes.append(f"pominięto {type_id}: brak obrażeń w materiałach")
            continue
        rof = manual.get("rof") or seen.best_rof() or 1
        slug = type_id.replace(" ", "-")
        entry: dict = {
            "id": f"weapon-type.{slug}",
            "name": name_pl,
            "nameOriginal": type_id.title(),
            "skillId": skill_id,
            "damage": damage,
            "magazine": manual.get("magazine"),
            "rof": rof,
            "hands": manual.get("hands", 2 if type_id in {"shotgun", "assault rifle", "sniper rifle", "heavy rifle"} else 1),
            "concealable": manual.get("concealable", False),
            "melee": melee,
            "source": manual.get("source") or ", ".join(sorted(seen.sources)) or "uzupełnienie ręczne",
        }
        if type_id in VARIABLE_DAMAGE_TYPES:
            seen_values = ", ".join(sorted(seen.damage)) or damage
            entry["description"] = (
                f"Obrażenia zależą od postaci — w materiałach spotykane: {seen_values}."
            )
            entry["incomplete"] = True

        if not melee:
            entry["attachmentSlots"] = manual.get("attachmentSlots", 3)
            # Easy Mode prints one row for "Pistolety"; SMGs have their own row
            # in the full rulebook, so we do not borrow the pistol DVs for them.
            range_key = "handguns" if "pistol" in type_id else type_id
            dv = manual.get("rangeDv") or ranges.get(range_key)
            if dv:
                entry["rangeDv"] = dv
            else:
                entry["incomplete"] = True
                notes.append(f"{type_id}: brak tabeli PT zasięgów w materiałach")
        if entry["magazine"] is None and not melee:
            entry["incomplete"] = True
        result.append(entry)
    return result, notes


def build_armor(evidence: dict[str, Evidence], overrides: dict) -> list[dict]:
    manual_armor = overrides.get("armor", {})
    result: list[dict] = []
    for armor_id in sorted(set(evidence) | set(manual_armor)):
        if armor_id not in ARMOR_NAMES:
            continue
        seen = evidence.get(armor_id, Evidence())
        manual = manual_armor.get(armor_id, {})
        sp_raw = manual.get("sp") or (int(seen.best_damage()) if seen.best_damage() else None)
        if sp_raw is None:
            continue
        entry: dict = {
            "id": f"armor.{armor_id.replace(' ', '-')}",
            "category": "armor",
            "name": ARMOR_NAMES[armor_id],
            "nameOriginal": armor_id.title(),
            "sp": int(sp_raw),
            "locations": manual.get("locations", ["head", "body"]),
            "cost": manual.get("cost"),
            "source": manual.get("source") or ", ".join(sorted(seen.sources)) or "uzupełnienie ręczne",
        }
        if manual.get("penalty"):
            entry["penalty"] = manual["penalty"]
        if manual.get("costCategory"):
            entry["costCategory"] = manual["costCategory"]
        if not manual.get("cost"):
            entry["incomplete"] = True
        result.append(entry)
    return result


def extract_columns(page) -> str:
    """Two-column DLC pages: crop each half so entries stay in reading order."""
    width, height = page.width, page.height
    halves = []
    for x0, x1 in ((0, width / 2), (width / 2, width)):
        crop = page.crop((x0, 0, x1, height))
        halves.append(crop.extract_text(layout=False) or "")
    return "\n".join(halves)


def parse_named_weapons() -> tuple[list[dict], list[str]]:
    """Named weapons from the gear DLCs, pointing at their base type."""
    try:
        import pdfplumber
    except ImportError:  # pragma: no cover - tooling only
        return [], ["pdfplumber niedostępny — pominięto broń markową"]

    entries: list[dict] = []
    notes: list[str] = []
    seen_ids: set[str] = set()

    for filename, label in NAMED_WEAPON_SOURCES.items():
        path = PDF_DIR / filename
        if not path.exists():
            notes.append(f"brak {filename} — pominięto")
            continue
        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                text = extract_columns(page)
                for block in split_named_blocks(text):
                    entry = parse_named_block(block, label, seen_ids)
                    if entry:
                        entries.append(entry)
    return entries, notes


def split_named_blocks(text: str) -> list[str]:
    """Splits a column into per-weapon blocks; DLC entries start with a bullet."""
    blocks: list[str] = []
    current: list[str] = []
    for line in text.splitlines():
        if line.strip().startswith(("▶", "X ", "»")):
            if current:
                blocks.append("\n".join(current))
            current = [line.strip().lstrip("▶X»").strip()]
        elif current:
            current.append(line.strip())
    if current:
        blocks.append("\n".join(current))
    return blocks


def strip_pdf_artefacts(text: str) -> str:
    """Drops words mangled by the DLCs' decorative pull-quotes.

    Those are typeset with doubled glyphs, so extraction yields things like
    "FFiirreePPoowweerr uunnttiill iitt". A real word almost never contains two
    doubled letter pairs, so that is the signal used to throw one away.
    """
    # Column breaks hyphenate words: "com- monly" -> "commonly".
    text = re.sub(r"(\w)-\s+(\w)", r"\1\2", text)

    # The next section's heading and the page's pull-quote sit in the same
    # column, so extraction glues them onto the last entry's description.
    text = re.sub(
        r"\s*(?:very\s+|heavy\s+|light\s+|medium\s+|exotic\s+)?"
        r"(?:pistols|smgs|shotguns|rifles|melee\s+weapons|grenades|bows)\s*$",
        "",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r"\s*Listen Up YoU primitive screwheads\s*$", "", text, flags=re.IGNORECASE)

    # "An Excellent Quality Heavy Pistol." is already parsed into `quality` and
    # `weaponTypeId`, and the card shows both. Leaving it in the description
    # duplicates the stats — and, once translated, invited the model to rename
    # the weapon type ("ciężki pistolet" for an SMG). Structured data wins.
    #
    # Only the standalone sentence goes: when the phrase carries a subordinate
    # clause ("... Assault Rifle that deals 4d6 damage"), removing it would
    # leave a dangling fragment, so that variant is left for the translator.
    text = re.sub(
        r"\s*\bAn?\s+(?:Poor|Standard|Excellent)\s+Quality\s+[A-Za-z /\-]{2,30}?[.,]",
        "",
        text,
        flags=re.IGNORECASE,
    )

    # Page furniture that shares the column: running heads and page numbers.
    # Swept last, because dropping the type sentence is what exposes them.
    text = re.sub(
        r"\s*(?:TOGGLE.S TEMPLE|WOODCHIPPER.S GARAGE|sniPer|assault|very|\d{2,8}:*)\s*$",
        "",
        text,
        flags=re.IGNORECASE,
    )

    doubled = re.compile(r"([A-Za-z])\1")
    repeated_only = re.compile(r"^([A-Za-z'’])\1+$")
    kept: list[str] = []
    for word in text.split():
        if len(word) > 3 and len(doubled.findall(word)) >= 2:
            continue
        # Leftovers of the same quote: "ee", "MM", "’’".
        if repeated_only.match(word):
            continue
        # Punctuation-only debris: ",,", "..", "——", "™™..".
        if len(word) > 1 and not re.search(r"[A-Za-z0-9ąćęłńóśźż]", word):
            continue
        kept.append(word)
    cleaned = [w for w in kept if len(w) > 1 or w.lower() in {"a", "i", "o", "w", "z"}]
    result = " ".join(cleaned).strip()

    # Word filtering can uncover furniture that was not last before it ran
    # (a page number followed by other debris), so sweep the tail once more.
    return re.sub(r"\s*(?:\d{2,8}:*|[—–-])\s*$", "", result).strip()


def clean_name(raw: str) -> str:
    """PDF small-caps arrive mangled ('NoMad .357 MagnuM', 'towa tyPe-12').

    Segments that are pure acronyms or numbers are left alone; anything that
    mixes upper- and lowercase mid-word is a small-caps artefact and gets
    normalised to title case.
    """

    def fix_segment(segment: str) -> str:
        if not segment or segment.isupper() or segment.isdigit():
            return segment
        if re.fullmatch(r"[A-Z0-9&/.']+", segment):
            return segment
        if re.fullmatch(r"(?:i{1,3}|iv|vi{0,3}|ix|xi{0,2})", segment, re.IGNORECASE):
            return segment.upper()  # model numbers: Mark II, Mark IV
        return segment[:1].upper() + segment[1:].lower()

    words = [w for w in re.split(r"\s+", raw.strip()) if w]
    fixed = ["-".join(fix_segment(part) for part in word.split("-")) for word in words]
    return " ".join(fixed)[:80]


def parse_named_block(block: str, label: str, seen_ids: set[str]) -> dict | None:
    lines = [line for line in block.splitlines() if line.strip()]
    if not lines:
        return None
    name = clean_name(lines[0])
    if len(name) < 3 or not re.search(r"[A-Za-z]", name):
        return None
    body = "\n".join(lines[1:])

    cost_match = COST_RE.search(body)
    type_match = NAMED_TYPE_RE.search(body)
    if not type_match:
        return None
    type_id = resolve_weapon_type(type_match.group(2))
    if type_id is None:
        return None

    slug = re.sub(r"[^a-z0-9]+", "-", normalise(name)).strip("-")
    entry_id = f"weapon.{slug}"
    if not slug or entry_id in seen_ids:
        return None
    seen_ids.add(entry_id)

    entry: dict = {
        "id": entry_id,
        "category": "weapon",
        "name": name,
        "weaponTypeId": f"weapon-type.{type_id.replace(' ', '-')}",
        "quality": QUALITY_WORDS.get(type_match.group(1).lower(), "standard"),
        "cost": int(cost_match.group(1).replace(",", "")) if cost_match else None,
        "source": label,
    }
    if cost_match and cost_match.group(2):
        band = COST_BANDS.get(normalise(cost_match.group(2)))
        if band:
            entry["costCategory"] = band
    slots_match = SLOTS_RE.search(body)
    if slots_match:
        entry["attachmentSlots"] = int(slots_match.group(1))

    description = strip_pdf_artefacts(
        " ".join(
            line for line in lines[1:] if not COST_RE.match(line) and not SLOTS_RE.match(line)
        )
    )
    if description:
        entry["description"] = description[:1000]
    features = extract_features(body)
    if features:
        entry["features"] = features
    return entry


def extract_features(body: str) -> list[str]:
    features: list[str] = []
    for pattern, feature in (
        (r"smartgun link", "Złącze smartguna"),
        (r"extended magazine", "Wydłużony magazynek"),
        (r"drum magazine", "Magazynek bębnowy"),
        (r"infrared nightvision scope", "Celownik na podczerwień"),
        (r"sniping scope", "Celownik snajperski"),
        (r"underbarrel grenade launcher", "Podwieszany granatnik"),
        (r"\bexotic\b", "Broń egzotyczna"),
    ):
        if re.search(pattern, body, re.IGNORECASE):
            features.append(feature)
    return features[:12]


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_rulebook_tables() -> tuple[list[dict], list[dict]]:
    """The base tables `parse-manual.py` wrote, if the rulebook was imported."""
    types_path = OUT_DIR / "weapon-types.json"
    armor_path = OUT_DIR / "armor.json"
    types = armor = []
    if types_path.exists():
        types = json.loads(types_path.read_text(encoding="utf-8")).get("weaponTypes", [])
    if armor_path.exists():
        armor = json.loads(armor_path.read_text(encoding="utf-8")).get("entries", [])
    return types, armor


def compare_with_rulebook(
    inferred_types: list[dict],
    inferred_armor: list[dict],
    rulebook_types: list[dict],
    rulebook_armor: list[dict],
) -> list[str]:
    """
    Statblock evidence vs. the rulebook tables.

    A mismatch is not automatically an error — an NPC may carry a poor quality
    weapon, and the Hardened DLCs do print the odd typo — but it is the one
    signal that either the free-material import or the rulebook parse went
    wrong somewhere, so it belongs in the report.
    """
    differences: list[str] = []
    by_id = {entry["id"]: entry for entry in rulebook_types}
    for entry in inferred_types:
        official = by_id.get(entry["id"])
        if not official:
            continue
        for field, label in (("damage", "obrażenia"), ("rof", "LA"), ("magazine", "magazynek")):
            mine, theirs = entry.get(field), official.get(field)
            if mine is not None and theirs is not None and mine != theirs:
                differences.append(
                    f"{entry['id']}: {label} ze statbloków {mine}, z podręcznika {theirs}"
                )
    armor_by_id = {entry["id"]: entry for entry in rulebook_armor}
    for entry in inferred_armor:
        official = armor_by_id.get(entry["id"])
        if official and entry.get("sp") != official.get("sp"):
            differences.append(
                f"{entry['id']}: OB ze statbloków {entry.get('sp')}, "
                f"z podręcznika {official.get('sp')}"
            )
    return differences


def main() -> int:
    if not TEXT_DIR.is_dir():
        print(f"brak {TEXT_DIR} — uruchom najpierw extract-pdf-text.py", file=sys.stderr)
        return 1

    weapon_evidence, armor_evidence, warnings = harvest_statblocks()
    ranges, range_warnings = parse_easy_mode_ranges()
    warnings.extend(range_warnings)
    overrides = load_manual_overrides()

    weapon_types, type_notes = build_weapon_types(weapon_evidence, ranges, overrides)
    armor_entries = build_armor(armor_evidence, overrides)
    named_weapons, named_notes = parse_named_weapons()
    warnings.extend(type_notes)
    warnings.extend(named_notes)

    # The base tables now come from the core rulebook (`parse-manual.py`), which
    # prints them outright instead of leaving them to be inferred. This script
    # keeps its aggregate only to cross-check it and to know which base types
    # exist — branded weapons whose type is missing are dropped.
    rulebook_types, rulebook_armor = load_rulebook_tables()
    known_types = {entry["id"] for entry in rulebook_types} or {
        entry["id"] for entry in weapon_types
    }
    kept_weapons = [w for w in named_weapons if w["weaponTypeId"] in known_types]
    dropped_types = Counter(
        w["weaponTypeId"] for w in named_weapons if w["weaponTypeId"] not in known_types
    )
    if dropped_types:
        detail = ", ".join(f"{k} ×{v}" for k, v in dropped_types.most_common())
        warnings.append(f"broń markowa bez typu bazowego: {detail}")
    if not rulebook_types:
        warnings.append(
            "brak weapon-types.json z podręcznika — uruchom najpierw parse-manual.py, "
            "inaczej broń markowa opiera się na typach wywnioskowanych ze statbloków"
        )

    differences = compare_with_rulebook(weapon_types, armor_entries, rulebook_types, rulebook_armor)

    write_json(
        OUT_DIR / "weapons.json",
        {
            "schemaVersion": 1,
            "source": "Cyberpunk RED — darmowe DLC ze sprzętem",
            "entries": kept_weapons,
        },
    )

    report = {
        "weaponTypes": {
            type_id: {
                "damage": dict(ev.damage),
                "rof": {str(k): v for k, v in ev.rof.items()},
                "statblocks": ev.count,
                "sources": sorted(ev.sources),
            }
            for type_id, ev in sorted(weapon_evidence.items())
        },
        "armor": {
            armor_id: {
                "sp": dict(ev.damage),
                "statblocks": ev.count,
                "sources": sorted(ev.sources),
            }
            for armor_id, ev in sorted(armor_evidence.items())
        },
        "counts": {
            "weaponTypesInferred": len(weapon_types),
            "armorInferred": len(armor_entries),
            "namedWeapons": len(kept_weapons),
        },
        "rulebookDifferences": differences,
        "warnings": warnings,
    }
    write_json(OUT_DIR / "import-report.json", report)

    print(f"broń markowa:    {len(kept_weapons)}")
    print(f"typy z podręcz.: {len(rulebook_types)} (tabele bazowe pisze parse-manual.py)")
    print(f"rozbieżności:    {len(differences)}")
    for difference in differences:
        print(f"  ~ {difference}")
    print(f"ostrzeżenia:     {len(warnings)}")
    for warning in warnings[:15]:
        print(f"  - {warning}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
