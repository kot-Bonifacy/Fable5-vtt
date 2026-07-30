"""Polish core rulebook -> compendium data (completes stage 13).

Stage 13 was closed on the free material (Easy Mode + RTG DLCs), which has no
summary tables at all: base weapon rows had to be inferred from NPC statblocks,
armor had no prices, and the skill list stayed at the 41 of Easy Mode because
the statblocks name skills without ever naming the stat they roll with. The
core rulebook has all of it, so this script replaces guesswork with the tables.

Input is the markdown rebuilt by `tools/rulebook/build-manual.mjs`, not the PDF:
the dump is deterministic, diffable and already fixes the ligatures, hyphens and
small caps. What it does *not* fix is table layout — columns arrive glued into
one string (`3k68(C. Pistolet)21TAK100 ed(Premium)`) — so every table here is
parsed by anchoring on its row labels and reading the run of values between two
anchors. Anchors for the rulebook's own classifications live in `terms.py`
(names of weapon types, armor and skills); anchors that are product names, and
any value the regexes cannot reach, live in `manual-overrides.json` under
`data/private/`, because that file may hold rulebook content and the repo may
not.

Everything this script writes is gitignored. Outputs:
    data/private/cpred/skills.json                       (66 skills, 9 groups)
    data/private/cpred/compendium/weapon-types.json      (base weapon rows)
    data/private/cpred/compendium/weapons-base.json      (buyable base + exotic)
    data/private/cpred/compendium/armor.json
    data/private/cpred/compendium/critical-injuries.json (both tables, official)
    data/private/cpred/compendium/import-report-manual.json

Run:
    python tools/import/parse-manual.py
"""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from terms import (  # noqa: E402
    ARMOR_LOCATIONS_BY_NAME,
    COST_BAND_BY_PRICE,
    MANUAL_ARMOR_ROWS,
    MANUAL_AUTOFIRE_ROWS,
    MANUAL_RANGE_ROWS,
    MANUAL_SHARED_ROWS,
    MANUAL_WEAPON_SKILLS,
    MANUAL_WEAPON_TYPES,
    SKILL_GROUPS,
    SKILLS,
    STAT_IDS,
    WEAPON_TYPES,
    cost_band,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
MANUAL_DIR = REPO_ROOT / "data" / "private" / "rulebook" / "manual" / "CPRED-podrecznik"
OVERRIDES_PATH = REPO_ROOT / "data" / "private" / "rulebook" / "manual" / "manual-overrides.json"
COMPENDIUM_DIR = REPO_ROOT / "data" / "private" / "cpred" / "compendium"
CPRED_DIR = REPO_ROOT / "data" / "private" / "cpred"

CHAPTER_ROLES = "04-dusza-i-nowa-maszyna.md"
CHAPTER_GEAR = "06-wyposazony-na-przyszlosc.md"
CHAPTER_COMBAT = "10-strzelanina-piatkowej-nocy.md"
CHAPTER_MARKET = "17-nowa-ekonomia-uliczna.md"

SOURCE = "Cyberpunk RED — podręcznik główny (wydanie polskie)"

SCHEMA_VERSION = 1
DESCRIPTION_MAX = 1000  # COMPENDIUM_DESCRIPTION_MAX_LENGTH in compendium.ts
RANGE_BANDS = 8  # CPRED_RANGE_BANDS in compendium.ts
AUTOFIRE_BANDS = 5  # CPRED_AUTOFIRE_RANGE_BANDS in attacks.ts — the table stops at 100 m
ROLL_MIN, ROLL_MAX = 2, 12

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


def clean(text: str) -> str:
    """Collapses the dump's one-sentence-per-line layout into flowing text."""
    text = text.replace("­", "").replace("®", "").replace("™", "")
    text = re.sub(r"<!--.*?-->", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def load_chapter(name: str) -> str:
    path = MANUAL_DIR / name
    if not path.exists():
        raise SystemExit(f"Brak rozdziału {path} — materiały prywatne są poza repo.")
    return path.read_text(encoding="utf8")


def page_of(chapter: str, index: int) -> int | None:
    """Page number of the nearest `<!-- s. N -->` anchor above `index`."""
    pages = [int(m.group(1)) for m in re.finditer(r"<!--\s*s\.\s*(\d+)\s*-->", chapter[:index])]
    return pages[-1] if pages else None


def section(chapter: str, start: str, end: str) -> tuple[str, int]:
    """Text between two literal markers, plus the offset it started at."""
    begin = chapter.find(start)
    if begin == -1:
        raise SystemExit(f"Nie znalazłem fragmentu: {start!r}")
    stop = chapter.find(end, begin + len(start))
    if stop == -1:
        stop = len(chapter)
    return chapter[begin:stop], begin


def table_line(chapter: str, marker: str) -> tuple[str, int]:
    """
    The single dump line a glued table lives on.

    `build-manual.mjs` breaks text at sentence ends, and a table has no
    sentences, so it survives as one long line. Bounding a table by its line is
    safer than by the next heading: several tables are followed by prose that
    repeats the same words the heading would match on.
    """
    begin = chapter.find(marker)
    if begin == -1:
        raise SystemExit(f"Nie znalazłem tabeli: {marker!r}")
    start = chapter.rfind("\n", 0, begin) + 1
    stop = chapter.find("\n", begin)
    return chapter[start : stop if stop != -1 else len(chapter)], begin


def mend_glue(text: str) -> str:
    """Puts back the spaces the PDF lost between two cells („usuwaEfekt")."""
    text = re.sub(r"(?<=[a-ząćęłńóśźż])(?=PT\b)", " ", text)
    return re.sub(r"(?<=[a-ząćęłńóśźż])(?=[A-ZŁŚŻĆÓĘĄŃ])", " ", text)


def split_on_anchors(text: str, labels: list[str]) -> list[tuple[str, str]]:
    """
    Cuts a glued table into (row label, row body) pairs.

    Longest label first, so „Ciężki pistolet maszynowy" wins over the „Ciężki
    pistolet" hiding inside it.
    """
    pattern = "|".join(re.escape(label) for label in sorted(labels, key=len, reverse=True))
    matches = list(re.finditer(pattern, text))
    rows: list[tuple[str, str]] = []
    for index, match in enumerate(matches):
        stop = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        rows.append((match.group(0), text[match.end() : stop]))
    return rows


def price(raw_cost: str, raw_band: str, what: str) -> tuple[int, str | None]:
    """Reads „5000 ed (Luksusowy)" and checks the two halves against each other."""
    cost = int(re.sub(r"\s", "", raw_cost))
    band = cost_band(raw_band)
    expected = COST_BAND_BY_PRICE.get(cost)
    if band is None:
        warn(f"{what}: nieznana kategoria cenowa „{raw_band}”")
        band = expected
    elif expected and band != expected:
        warn(f"{what}: cena {cost} ed nie pasuje do kategorii „{raw_band}” (oczekiwano {expected})")
    return cost, band


# --- skills ------------------------------------------------------------------

SKILL_ANCHOR = re.compile(
    r"(?P<name>[^.\n]{3,60}?)\s*(?P<mult>\(×2\))?\s*\.{3,}\s*"
    r"(?P<stat>INT|REF|ZW|TECH|CHA|SW|SZ|BC|EMP)\b"
)

# Sidebar art and cross-references that sit inside the skill list.
SKILL_NOISE = re.compile(r"(Więcej o |Opisy Umiejętności|Następny krok|^-\s*\w+\s+Więcej)")


def looks_like_sidebar(line: str) -> bool:
    """The dump keeps the hand-lettered margin quotes; they shout in capitals."""
    letters = [char for char in line if char.isalpha()]
    if len(letters) < 12:
        return False
    upper = sum(1 for char in letters if char.isupper())
    return upper / len(letters) > 0.4


def clean_skill_description(text: str) -> str:
    lines: list[str] = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or stripped.startswith("<!--"):
            continue
        if stripped == ":" or looks_like_sidebar(stripped):
            continue
        if SKILL_NOISE.search(stripped):
            stripped = SKILL_NOISE.split(stripped)[0]
        if stripped:
            lines.append(stripped)
    return clean(" ".join(lines))[:DESCRIPTION_MAX].strip()


def parse_skills(gear: str) -> list[dict]:
    text, offset = section(gear, "SPOSTRZEGAWCZOŚĆ Czytanie", "JAK OTRZYMUJĘ UMIEJĘTNOŚCI")
    page = page_of(gear, offset)

    # Group headings are matched away first: they are printed inline („…zawodowe.
    # SPOSTRZEGAWCZOŚĆ Czytanie z ruchu warg…") and would otherwise be swallowed
    # into the name of the skill that follows them.
    marks: list[tuple[int, str]] = []
    for group, heading in SKILL_GROUPS:
        found = text.find(heading)
        if found == -1:
            warn(f"umiejętności: brak nagłówka kategorii „{heading}”")
            continue
        marks.append((found, group))
        text = text[:found] + "\n" * len(heading) + text[found + len(heading) :]
    marks.sort()

    def group_at(index: int) -> str | None:
        current = None
        for position, group in marks:
            if position <= index:
                current = group
            else:
                break
        return current

    anchors = list(SKILL_ANCHOR.finditer(text))
    skills: list[dict] = []
    seen: set[str] = set()
    for index, match in enumerate(anchors):
        name = " ".join(match.group("name").split())
        skill_id = SKILLS.get(name)
        if skill_id is None:
            warn(f"umiejętności: „{name}” nie ma w słowniku terms.SKILLS — pominięta")
            continue
        stat = STAT_IDS[match.group("stat")]
        stop = anchors[index + 1].start() if index + 1 < len(anchors) else len(text)
        entry: dict = {
            "id": skill_id,
            "name": name,
            "stat": stat,
            "group": group_at(match.start()) or "awareness",
        }
        if match.group("mult"):
            entry["multiplier"] = 2
        description = clean_skill_description(text[match.end() : stop])
        if description:
            entry["description"] = description
        if skill_id in seen:
            warn(f"umiejętności: „{name}” występuje dwa razy")
            continue
        seen.add(skill_id)
        skills.append(entry)

    missing = [name for name in SKILLS if SKILLS[name] not in seen]
    for name in missing:
        warn(f"umiejętności: „{name}” nie znaleziona w tekście")
    if page:
        for skill in skills:
            skill["source"] = f"{SOURCE}, s. {page}"
    return skills


# --- weapon types ------------------------------------------------------------

MELEE_ROW = re.compile(
    r"Zależnie od rodzaju\s*(?P<dmg>\d)[kd]6\s*(?P<rof>\d)\s*(?P<conceal>TAK|NIE)\s*"
    r"(?P<cost>\d[\d\s]*)\s*e[db]\s*\(\s*(?P<band>[^)]+)\)"
)

RANGED_ROW = re.compile(
    r"(?P<skill>Broń krótka|Broń długa|Broń ciężka|Łucznictwo)\s*(?P<dmg>\d)[kd]6\s*"
    r"(?P<mag>\d+|Nd\.)\s*\((?P<ammo>[^)]*)\)\s*(?P<nums>\d{0,2})\s*(?P<conceal>TAK|NIE)\s*"
    r"(?P<cost>\d[\d\s]*)\s*e[db]\s*\(\s*(?P<band>[^)]+)\)"
)


def base_type(key: str, page: int | None, **fields) -> dict:
    name, skill_id, melee = WEAPON_TYPES[key]
    entry = {
        "id": f"weapon-type.{slugify(key)}",
        "name": name,
        "nameOriginal": key.title(),
        "skillId": skill_id,
        "melee": melee,
        "source": f"{SOURCE}, s. {page}" if page else SOURCE,
    }
    entry.update(fields)
    return entry


def parse_melee_types(combat: str) -> dict[str, dict]:
    text, offset = section(
        combat, "Typ broni białej Przykłady broni białej", "### PRZYKŁAD WALKI W ZWARCIU"
    )
    page = page_of(combat, offset)
    labels = [label for label in MANUAL_WEAPON_TYPES if WEAPON_TYPES[MANUAL_WEAPON_TYPES[label]][2]]

    types: dict[str, dict] = {}
    for label, body in split_on_anchors(clean(text), labels):
        match = MELEE_ROW.search(body)
        if not match:
            warn(f"broń biała „{label}”: nie odczytałem wiersza tabeli")
            continue
        key = MANUAL_WEAPON_TYPES[label]
        cost, band = price(match.group("cost"), match.group("band"), f"broń biała „{label}”")
        types[key] = base_type(
            key,
            page,
            name=label,
            damage=f"{match.group('dmg')}k6",
            magazine=None,
            rof=int(match.group("rof")),
            concealable=match.group("conceal") == "TAK",
            cost=cost,
            costCategory=band,
        )
    return types


def parse_ranged_types(gear: str) -> dict[str, dict]:
    text, offset = section(
        gear, "Typ broniUmiejętność Obrażenia od 1 strzału", "### AMUNICJA DO BRONI DYSTANSOWEJ"
    )
    page = page_of(gear, offset)
    labels = [
        label for label in MANUAL_WEAPON_TYPES if not WEAPON_TYPES[MANUAL_WEAPON_TYPES[label]][2]
    ]
    labels += list(MANUAL_SHARED_ROWS)

    types: dict[str, dict] = {}
    for label, body in split_on_anchors(clean(text), labels):
        match = RANGED_ROW.search(body)
        if not match:
            warn(f"broń dystansowa „{label}”: nie odczytałem wiersza tabeli")
            continue
        skill_id = MANUAL_WEAPON_SKILLS[match.group("skill")]
        magazine = None if match.group("mag") == "Nd." else int(match.group("mag"))
        nums = match.group("nums")
        if len(nums) == 2:
            rof, hands = int(nums[0]), int(nums[1])
        else:
            # One digit where two columns should be: the dump lost a column
            # separator. Take it as the rate of fire and leave hands to the
            # overrides rather than invent the missing value.
            rof, hands = int(nums or 1), None
            warn(
                f"broń dystansowa „{label}”: w zrzucie jest jedna cyfra zamiast LA i liczby rąk "
                f"— przyjęto LA {rof}, liczba rąk z overrides"
            )
        cost, band = price(match.group("cost"), match.group("band"), f"broń „{label}”")
        features = [
            part.strip(" -–—")
            for part in re.split(
                r"\s+-\s+", body.split("cechy specjalne:", 1)[-1] if "cechy specjalne:" in body else ""
            )
            if part.strip(" -–—") and part.strip(" -–—").lower() != "brak"
        ]

        for key in MANUAL_SHARED_ROWS.get(label, [MANUAL_WEAPON_TYPES.get(label, "")]):
            if key not in WEAPON_TYPES:
                warn(f"broń dystansowa „{label}”: nieznany typ bazowy")
                continue
            entry = base_type(
                key,
                page,
                skillId=skill_id,
                damage=f"{match.group('dmg')}k6",
                magazine=magazine,
                rof=rof,
                concealable=match.group("conceal") == "TAK",
                attachmentSlots=3,  # RAW: every non-exotic ranged weapon has 3
                cost=cost,
                costCategory=band,
                ammunition=match.group("ammo").strip(),
            )
            if hands is not None:
                entry["hands"] = hands
            if features:
                entry["features"] = features
            # Fire modes are a property of the type, not of the branded copy:
            # every SMG fires bursts, and the DV table is keyed by type.
            autofire_max, suppressive = fire_modes(features)
            if autofire_max is not None:
                entry["autofireMax"] = autofire_max
            if suppressive:
                entry["suppressive"] = True
            if label in MANUAL_SHARED_ROWS:
                entry["source"] = (
                    f"{SOURCE}, s. {page} — wiersz „{label}” obejmuje oba typy"
                    if page
                    else f"{SOURCE} — wiersz „{label}”"
                )
            types[key] = entry
    return types


def parse_range_dv(combat: str) -> dict[str, list[int | None]]:
    text, _ = section(combat, "### PT POJEDYNCZEGO STRZAŁU", "### INNE TRYBY OGNIA")
    tables: dict[str, list[int | None]] = {}
    for label, body in split_on_anchors(clean(text), list(MANUAL_RANGE_ROWS)):
        row = re.match(r"[\s–-]*((?:\d{2}|Nd\.|\s)+)", body)
        if not row:
            warn(f"tabela PT: nie odczytałem wiersza „{label}”")
            continue
        values = re.findall(r"Nd\.|\d{2}", row.group(1))
        if len(values) != RANGE_BANDS:
            warn(f"tabela PT „{label}”: {len(values)} wartości zamiast {RANGE_BANDS}")
            continue
        parsed = [None if value == "Nd." else int(value) for value in values]
        for key in MANUAL_RANGE_ROWS[label]:
            tables[key] = parsed
    return tables


def parse_autofire_dv(combat: str) -> dict[str, list[int | None]]:
    """
    The autofire DV table (s. 173). It is a table of its own — autofire never
    reads the single-shot row — and it only reaches 100 m, so the five values
    are padded with `null` up to the eight bands the schema uses.
    """
    text, _ = section(combat, "### PT OGNIA CIĄGŁEGO", "### PRZYKŁAD OGNIA CIĄGŁEGO")
    tables: dict[str, list[int | None]] = {}
    for label, body in split_on_anchors(clean(text), list(MANUAL_AUTOFIRE_ROWS)):
        row = re.match(r"[\s–-]*((?:\d{2}|Nd\.|\s)+)", body)
        if not row:
            warn(f"tabela PT ognia ciągłego: nie odczytałem wiersza „{label}”")
            continue
        values = re.findall(r"Nd\.|\d{2}", row.group(1))
        if len(values) != AUTOFIRE_BANDS:
            warn(f"tabela PT ognia ciągłego „{label}”: {len(values)} wartości zamiast {AUTOFIRE_BANDS}")
            continue
        parsed: list[int | None] = [None if value == "Nd." else int(value) for value in values]
        parsed += [None] * (RANGE_BANDS - AUTOFIRE_BANDS)
        for key in MANUAL_AUTOFIRE_ROWS[label]:
            tables[key] = parsed
    return tables


AUTOFIRE_FEATURE = re.compile(r"Ogień ciągły\s*\((?P<max>\d+)\)", re.IGNORECASE)


def fire_modes(features: list[str]) -> tuple[int | None, bool]:
    """Reads „Ogień ciągły (4)" and „ogień zaporowy" out of a weapon's features."""
    autofire_max: int | None = None
    suppressive = False
    for feature in features:
        match = AUTOFIRE_FEATURE.search(feature)
        if match:
            autofire_max = int(match.group("max"))
        if "zaporow" in feature.lower():
            suppressive = True
    return autofire_max, suppressive


UNARMED_TABLE = re.compile(r"Budowa Ciała[^O]*?Obrażenia\s*(?P<damage>(?:\dk6\s*){2,})")


def parse_unarmed(combat: str) -> list[str]:
    """
    The BODY -> damage ladder that brawling and martial arts share.

    Only the damage column is read here. The BODY thresholds print as
    „7 – 1011 lub więcej" — two cells with no separator between them and no way
    to tell where one ends — so the readable sentence comes from the overrides
    file instead of a regex that would have to guess.
    """
    match = UNARMED_TABLE.search(clean(combat))
    if not match:
        warn("bijatyka: nie znalazłem tabeli obrażeń zależnych od Budowy Ciała")
        return []
    return re.findall(r"\dk6", match.group("damage"))


# --- armor -------------------------------------------------------------------

ARMOR_ROW = re.compile(
    r"^\s*(?P<sp>\d+)\s*(?P<penalty>Brak|-\d)[^0-9]*?(?P<cost>\d[\d\s]*)\s*ed\s*\(\s*(?P<band>[^)]+)\)"
)
SHIELD_ROW = re.compile(
    r"^\s*(?P<sp>\d+)\s*PW[^0-9]*?(?P<cost>\d[\d\s]*)\s*ed\s*\(\s*(?P<band>[^)]+)\)"
)


def parse_armor(market: str) -> list[dict]:
    text, offset = section(market, "Typ pancerzaOdporność balistyczna", "Skóry: ")
    page = page_of(market, offset)
    flat = clean(text)

    # Descriptions follow the table as „Nazwa: opis" paragraphs. Two of them
    # carry a registered mark („Kevlar ®: …") that `clean` strips, leaving the
    # space in front of the colon behind.
    prose, _ = section(market, "Skóry: ", "### GŁÓWNA LISTA OSPRZĘTU")
    prose_flat = re.sub(r"\s+:", ":", clean(prose))
    descriptions: dict[str, str] = {}
    for label, body in split_on_anchors(prose_flat, [f"{label}:" for label in MANUAL_ARMOR_ROWS]):
        descriptions[label.rstrip(":")] = body.strip()[:DESCRIPTION_MAX].strip()

    entries: list[dict] = []
    for label, body in split_on_anchors(flat, list(MANUAL_ARMOR_ROWS)):
        key = MANUAL_ARMOR_ROWS[label]
        match = ARMOR_ROW.match(body) or SHIELD_ROW.match(body)
        if not match:
            warn(f"pancerz „{label}”: nie odczytałem wiersza tabeli")
            continue
        cost, band = price(match.group("cost"), match.group("band"), f"pancerz „{label}”")
        entry: dict = {
            "id": f"armor.{slugify(key)}",
            "category": "armor",
            "name": label,
            "nameOriginal": key.title(),
            "sp": int(match.group("sp")),
            "locations": ARMOR_LOCATIONS_BY_NAME.get(key, ["head", "body"]),
            "cost": cost,
            "source": f"{SOURCE}, s. {page}" if page else SOURCE,
        }
        if band:
            entry["costCategory"] = band
        penalty = match.groupdict().get("penalty")
        if penalty and penalty != "Brak":
            entry["penalty"] = int(penalty)
        if label in descriptions:
            entry["description"] = descriptions[label]
        entries.append(entry)
    return entries


# --- weapons you can buy -----------------------------------------------------

QUALITY_PRICES = re.compile(
    r"Cena broni zwykłej jakościCena broni niskiej jakościCena broni doskonałej jakości\s*"
    r"(?P<rows>(?:\d[\d\s]*\s*ed\s*\([^)]+\)\s*){3,})"
)

EXOTIC_PRICE = re.compile(r"\s*(?P<cost>\d[\d\s]*)\s*ed\s*\(\s*(?P<band>[^)]+)\)")


def parse_quality_prices(market: str) -> dict[int, dict[str, int]]:
    """Standard price -> the price of the poor and excellent version."""
    match = QUALITY_PRICES.search(clean(market))
    if not match:
        warn("ceny jakości: nie znalazłem tabeli cen broni niskiej/doskonałej jakości")
        return {}
    values = re.findall(r"(\d[\d\s]*)\s*ed\s*\(\s*([^)]+)\)", match.group("rows"))
    ladder: dict[int, dict[str, int]] = {}
    for index in range(0, len(values) - 2, 3):
        standard = int(re.sub(r"\s", "", values[index][0]))
        poor = int(re.sub(r"\s", "", values[index + 1][0]))
        excellent = int(re.sub(r"\s", "", values[index + 2][0]))
        ladder[standard] = {"poor": poor, "standard": standard, "excellent": excellent}
    return ladder


def base_weapon_entries(types: dict[str, dict], page: int | None) -> list[dict]:
    """
    A buyable entry per base weapon type.

    The compendium panel lists entries, not types, so without these you could
    look up a „Militech Ronin" but not the plain „Karabin szturmowy" that the
    starting-gear tables actually hand out.
    """
    entries: list[dict] = []
    for key, weapon_type in types.items():
        if weapon_type.get("cost") is None:
            continue
        entry = {
            "id": f"weapon.{slugify(key)}",
            "category": "weapon",
            "name": weapon_type["name"],
            "nameOriginal": weapon_type.get("nameOriginal"),
            "weaponTypeId": weapon_type["id"],
            "quality": "standard",
            "cost": weapon_type["cost"],
            "source": weapon_type.get("source") or (f"{SOURCE}, s. {page}" if page else SOURCE),
        }
        if weapon_type.get("costCategory"):
            entry["costCategory"] = weapon_type["costCategory"]
        if weapon_type.get("features"):
            entry["features"] = weapon_type["features"]
        # The ammunition type is printed under the magazine size and is what a
        # player actually has to buy, but it is not a weapon-type field.
        if weapon_type.get("ammunition"):
            entry["description"] = f"Standardowa amunicja: {weapon_type['ammunition']}."
        entries.append({key: value for key, value in entry.items() if value is not None})
    return entries


def parse_exotics(market: str, gear: str, overrides: dict) -> list[dict]:
    """
    The exotic weapon table (s. 95) and its price list (s. 348).

    Driven by the names in `manual-overrides.json`, not by a regex over the
    price list: half of these are product names with digits in them („Malorian
    Arms 3516", „Rhinemetall EMG-86"), so no pattern can tell where the name
    ends and the price begins. They are also the one class of name that would
    be pure rulebook content in the repo, which is exactly what the private
    overrides file is for. Prices and descriptions still come from the book —
    the overrides only say which weapon to look for and what base type it
    behaves like.
    """
    price_line, offset = table_line(market, "BrońCenaPistolet")
    page = page_of(market, offset)
    flat = clean(price_line).replace("BrońCena", " ")
    prose, _ = section(gear, "BrońOpis i informacjeCena", "### DODATKI DO BRONI")
    prose_flat = clean(prose)

    mapping: dict[str, dict] = overrides.get("exoticWeapons", {})
    if not mapping:
        warn("broń egzotyczna: manual-overrides.json nie zawiera sekcji exoticWeapons")
    # The s. 95 table spells two of these differently from the price list, so
    # the cell boundaries have to be looked for under the spelling it uses.
    names = [rule.get("descriptionName", name) for name, rule in mapping.items()]

    entries: list[dict] = []
    for name, rule in mapping.items():
        found = flat.find(name)
        if found == -1:
            warn(f"broń egzotyczna „{name}”: nie ma jej w cenniku podręcznika — pominięta")
            continue
        match = EXOTIC_PRICE.match(flat, found + len(name))
        if not match:
            warn(f"broń egzotyczna „{name}”: nie odczytałem ceny — pominięta")
            continue
        cost, band = price(match.group("cost"), match.group("band"), f"broń egzotyczna „{name}”")
        category = rule.get("category", "weapon")
        entry: dict = {
            "id": f"{category if category != 'criticalInjury' else 'injury'}.{slugify(name)}",
            "category": category,
            "name": name,
            "cost": cost,
            "source": f"{SOURCE}, s. {page}" if page else SOURCE,
        }
        if category == "weapon":
            entry["weaponTypeId"] = rule.get("weaponTypeId")
            entry["quality"] = rule.get("quality", "standard")
            # RAW: „nie da się ich wyposażyć w Dodatki ani załadować amunicją
            # inną niż podstawowa" — exotics have no attachment slots at all.
            entry["attachmentSlots"] = rule.get("attachmentSlots", 0)
        if band:
            entry["costCategory"] = band
        for field in ("damage", "rof", "hands", "magazine", "concealable", "features"):
            if field in rule:
                entry[field] = rule[field]
        description = describe_exotic(prose_flat, rule.get("descriptionName", name), names)
        if description:
            entry["description"] = description
        entries.append(entry)
    return entries


def describe_exotic(prose: str, name: str, names: list[str]) -> str | None:
    """Text between this weapon's name and the next one in the s. 95 table."""
    start = prose.find(name)
    if start == -1:
        return None
    start += len(name)
    stops = [
        found for other in names if other != name and (found := prose.find(other, start)) != -1
    ]
    stop = min(stops) if stops else len(prose)
    # The s. 95 table prints the price at the end of every cell.
    body = re.sub(r"\d[\d\s]*\s*ed\s*\([^)]*\)\s*$", "", prose[start:stop]).strip(" .,–—")
    return clean(body)[:DESCRIPTION_MAX] or None


# --- critical injuries -------------------------------------------------------

QUICK_FIX = r"Nd\.|Pierwsza pomoc lub Ratownictwo medyczne\s*PT\s*\d+|Ratownictwo medyczne\s*PT\s*\d+"
TREATMENT = (
    r"Ratownictwo medyczne PT \d+ lub Chirurgia PT \d+|Ratownictwo medyczne lub Chirurgia PT \d+"
    r"|Chirurgia PT \d+|Łatanie trwale usuwa\s*Efekt tej Rany\.?"
)
INJURY_TAIL = re.compile(rf"\s*(?P<quick>{QUICK_FIX})\s*(?P<treat>{TREATMENT})\s*$")
DEATH_SAVE_PENALTY = re.compile(
    r"\+(\d)\s+do\s+podstawowej\s+trudności\s+Testu\s+Przeżywalności", re.IGNORECASE
)
# „-4 do Ruchu (minimum 1)" -> movePenalty: -4 (stage 14c): the turn budget
# enforces it, so it has to be a number rather than a sentence.
MOVE_PENALTY = re.compile(r"[-−–]\s*(\d)\s+do\s+Ruchu", re.IGNORECASE)
# The injury name is glued to its effect. The effect always starts with a
# capital („rękaRęka zostaje"), a signed modifier („płuco-2 do Ruchu") or a
# space before either of those.
NAME_END = re.compile(r"(?<=[a-ząćęłńóśźż])(?=[A-ZŁŚŻĆÓĘĄŃ])|(?<=[a-ząćęłńóśźż])(?=[-+]\d)|\s(?=[A-ZŁŚŻĆÓĘĄŃ+-])")


def parse_injury_table(chapter: str, start: str, end: str, table: str) -> list[dict]:
    text, offset = section(chapter, start, end)
    page = page_of(chapter, offset)
    flat = clean(text)

    positions: list[tuple[int, int]] = []
    cursor = 0
    for roll in range(ROLL_MIN, ROLL_MAX + 1):
        match = re.compile(rf"(?<!\d){roll}\s(?=[A-ZŁŚŻĆÓĘĄŃ])").search(flat, cursor)
        if not match:
            warn(f"rany krytyczne ({table}): brak wiersza dla wyniku {roll}")
            continue
        positions.append((roll, match.end()))
        cursor = match.end()

    injuries: list[dict] = []
    for index, (roll, begin) in enumerate(positions):
        stop = positions[index + 1][1] - 3 if index + 1 < len(positions) else len(flat)
        body = flat[begin:stop].strip()
        tail = INJURY_TAIL.search(body)
        quick_fix = treatment = None
        if tail:
            quick_fix = mend_glue(clean(tail.group("quick")))
            treatment = mend_glue(clean(tail.group("treat")))
            body = body[: tail.start()].strip()
        else:
            warn(f"rany krytyczne ({table}, {roll}): nie odczytałem Łatania i Leczenia")

        split = NAME_END.search(body, 3)
        if not split:
            warn(f"rany krytyczne ({table}, {roll}): nie rozdzieliłem nazwy od efektu")
            continue
        name = body[: split.start()].strip()
        effect = body[split.start() :].strip()
        entry: dict = {
            "id": f"injury.{table}-{slugify(name)}",
            "category": "criticalInjury",
            "name": name,
            "table": table,
            "roll": roll,
            "description": effect[:DESCRIPTION_MAX],
            "cost": None,
            "source": f"{SOURCE}, s. {page}" if page else SOURCE,
        }
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


# --- roles -------------------------------------------------------------------


def role_abilities(chapter: str) -> dict[str, str]:
    """Reads the „Zdolnością Specjalną X jest Y" sentences for the report."""
    found: dict[str, str] = {}
    for match in re.finditer(
        r"Zdolnością Specjalną (?P<role>[^.]{3,20}?) (?:jest|są) (?P<ability>[^.]{3,40})\.", chapter
    ):
        found[" ".join(match.group("role").split())] = " ".join(match.group("ability").split())
    return found


# --- output ------------------------------------------------------------------


def write(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf8")


def apply_overrides(entries: list[dict], overrides: dict, key: str) -> list[dict]:
    """Hand-read values win over the regexes; each carries its own `source`."""
    patches: dict[str, dict] = overrides.get(key, {})
    by_id = {entry["id"]: entry for entry in entries}
    for entry_id, patch in patches.items():
        if entry_id in by_id:
            by_id[entry_id].update(patch)
        else:
            warn(f"overrides.{key}: brak wpisu o id „{entry_id}”")
    return entries


def main() -> int:
    overrides: dict = {}
    if OVERRIDES_PATH.exists():
        overrides = json.loads(OVERRIDES_PATH.read_text(encoding="utf8"))

    gear = load_chapter(CHAPTER_GEAR)
    combat = load_chapter(CHAPTER_COMBAT)
    market = load_chapter(CHAPTER_MARKET)
    roles = load_chapter(CHAPTER_ROLES)

    skills = parse_skills(gear)
    write(
        CPRED_DIR / "skills.json",
        {
            "$comment": (
                "Pełna lista umiejętności CP RED z podręcznika głównego (wyd. polskie). "
                "Plik prywatny — nadpisuje data/public/cpred/skills.json. "
                "Generowany przez tools/import/parse-manual.py."
            ),
            "source": SOURCE,
            "skills": skills,
        },
    )

    types = parse_melee_types(combat)
    types.update(parse_ranged_types(gear))
    range_dv = parse_range_dv(combat)
    autofire_dv = parse_autofire_dv(combat)
    unarmed = parse_unarmed(combat)

    for key, table in range_dv.items():
        if key in types:
            types[key]["rangeDv"] = table
        elif key not in ("light pistol", "heavy rifle"):
            warn(f"tabela PT: typ „{key}” nie ma wiersza w tabeli broni")

    # Autofire needs both halves: the multiplier cap from the weapon's features
    # and its own DV table. A type with only one of them is a parsing failure,
    # not a weapon that fires half a burst.
    for key, table in autofire_dv.items():
        if key not in types:
            warn(f"tabela PT ognia ciągłego: typ „{key}” nie ma wiersza w tabeli broni")
            continue
        autofire_max = types[key].pop("autofireMax", None)
        if autofire_max is None:
            warn(f"ogień ciągły: typ „{key}” ma tabelę PT, ale nie ma cechy „Ogień ciągły (N)”")
            continue
        types[key]["autofire"] = {"max": autofire_max, "rangeDv": table}
    for key, weapon_type in types.items():
        if weapon_type.pop("autofireMax", None) is not None:
            warn(f"ogień ciągły: typ „{key}” ma cechę „Ogień ciągły (N)”, ale nie ma tabeli PT")

    # Brawling and martial arts are unarmed, so they have no row in the weapon
    # tables at all — the rules give them a BODY-based damage ladder instead.
    # The middle rung is the entry's damage and the ladder goes in the note.
    if unarmed and unarmed != ["1k6", "2k6", "3k6", "4k6"]:
        warn(f"bijatyka: nieoczekiwana drabinka obrażeń {unarmed}")
    for key in ("brawling", "martial arts"):
        types[key] = base_type(
            key,
            page_of(combat, combat.find("Budowa Ciała")),
            damage=unarmed[1] if len(unarmed) > 1 else "2k6",
            magazine=None,
            rof=2,
            hands=1,
            concealable=False,
            cost=None,
        )

    ordered = dict(sorted(types.items(), key=lambda item: item[1]["name"]))
    weapon_types = list(ordered.values())
    apply_overrides(weapon_types, overrides, "weaponTypes")
    for weapon_type in weapon_types:
        weapon_type.setdefault("hands", 2 if not weapon_type["melee"] else 1)
        # `cost` and `costCategory` are not part of the weapon type schema;
        # they travel to the buyable entry instead. `ammunition` stays: the
        # sheet copies the cartridge onto the weapon row (stage 16).
    page_gear = page_of(gear, gear.find("Typ broniUmiejętność"))
    entries = base_weapon_entries(ordered, page_gear)
    entries += parse_exotics(market, gear, overrides)
    apply_overrides(entries, overrides, "weapons")

    # Only reported, not written: the schema stores one price per entry, and a
    # poor/excellent copy of a weapon is something the GM mints in the editor.
    quality = parse_quality_prices(market)

    schema_fields = {
        "id", "name", "nameOriginal", "skillId", "damage", "magazine", "rof", "hands",
        "concealable", "attachmentSlots", "melee", "rangeDv", "autofire", "suppressive",
        "ammunition", "description", "source", "incomplete",
    }
    write(
        COMPENDIUM_DIR / "weapon-types.json",
        {
            "schemaVersion": SCHEMA_VERSION,
            "source": SOURCE,
            "weaponTypes": [
                {key: value for key, value in entry.items() if key in schema_fields}
                for entry in weapon_types
            ],
        },
    )
    write(
        COMPENDIUM_DIR / "weapons-base.json",
        {"schemaVersion": SCHEMA_VERSION, "source": SOURCE, "entries": entries},
    )

    armor = apply_overrides(parse_armor(market), overrides, "armor")
    write(
        COMPENDIUM_DIR / "armor.json",
        {"schemaVersion": SCHEMA_VERSION, "source": SOURCE, "entries": armor},
    )

    injuries = parse_injury_table(
        combat, "### RANY KRYTYCZNE CIAŁA", "### RANY KRYTYCZNE GŁOWY", "body"
    )
    injuries += parse_injury_table(
        combat, "### RANY KRYTYCZNE GŁOWY", "Śmiertelnie Ranny Gdy", "head"
    )
    apply_overrides(injuries, overrides, "criticalInjuries")
    write(
        COMPENDIUM_DIR / "critical-injuries.json",
        {"schemaVersion": SCHEMA_VERSION, "source": SOURCE, "entries": injuries},
    )

    report = {
        "source": SOURCE,
        "counts": {
            "skills": len(skills),
            "skillGroups": len({skill["group"] for skill in skills}),
            "weaponTypes": len(weapon_types),
            "weapons": len(entries),
            "armor": len(armor),
            "criticalInjuries": len(injuries),
        },
        "roleAbilities": role_abilities(roles),
        "qualityPrices": quality,
        "warnings": warnings,
    }
    write(COMPENDIUM_DIR / "import-report-manual.json", report)

    print(f"Umiejętności:     {len(skills)}")
    print(f"Typy broni:       {len(weapon_types)}")
    print(f"Bronie (wpisy):   {len(entries)}")
    print(f"Pancerze:         {len(armor)}")
    print(f"Rany krytyczne:   {len(injuries)}")
    if warnings:
        print(f"\nOstrzeżenia ({len(warnings)}):")
        for message in warnings:
            print(f"  ! {message}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
