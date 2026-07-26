"""Terminology bridge between the English source material and the Polish UI.

Only mappings that are confirmed by a source we actually hold are listed here.
Two independent confirmations exist for several rows, e.g. Easy Mode PL gives
"Lekka kurtka kuloodporna OB 11" while the English statblocks give
"Light Armorjack SP 11" — same object, same number, two languages.

Nothing in this file is rulebook content: it is a name dictionary plus the
skill each weapon type rolls with, the same category of data as
`data/public/cpred/skills.json` (stage 07).
"""

from __future__ import annotations

# English base weapon type -> (Polish name, skill id from skills.json, melee?)
WEAPON_TYPES: dict[str, tuple[str, str, bool]] = {
    "light pistol": ("Lekki pistolet", "handgun", False),
    "medium pistol": ("Średni pistolet", "handgun", False),
    "heavy pistol": ("Ciężki pistolet", "handgun", False),
    "very heavy pistol": ("Bardzo ciężki pistolet", "handgun", False),
    "submachine gun": ("Pistolet maszynowy", "handgun", False),
    "heavy submachine gun": ("Ciężki pistolet maszynowy", "handgun", False),
    "shotgun": ("Strzelba", "shoulder-arms", False),
    "assault rifle": ("Karabin szturmowy", "shoulder-arms", False),
    "sniper rifle": ("Karabin snajperski", "shoulder-arms", False),
    "heavy rifle": ("Karabin ciężki", "shoulder-arms", False),
    "bow": ("Łuk", "archery", False),
    "crossbow": ("Kusza", "archery", False),
    "grenade launcher": ("Granatnik", "heavy-weapons", False),
    "rocket launcher": ("Wyrzutnia rakiet", "heavy-weapons", False),
    "light melee": ("Mała broń biała", "melee-weapon", True),
    "medium melee": ("Średnia broń biała", "melee-weapon", True),
    "heavy melee": ("Duża broń biała", "melee-weapon", True),
    "very heavy melee": ("Bardzo duża broń biała", "melee-weapon", True),
    "brawling": ("Bijatyka", "brawling", True),
    "martial arts": ("Sztuki walki", "martial-arts", True),
}

# Weapon types whose damage scales with the wielder (BODY for brawling, the
# skill rank for martial arts), so a single dominant value would be wrong.
VARIABLE_DAMAGE_TYPES = {"brawling", "martial arts"}

# Statblock spellings that mean the same base type.
WEAPON_ALIASES: dict[str, str] = {
    "brawling attack": "brawling",
    "vh pistol": "very heavy pistol",
    "vhp": "very heavy pistol",
    "smg": "submachine gun",
    "heavy smg": "heavy submachine gun",
    "hsmg": "heavy submachine gun",
    "assault rifle w/ grenade launcher": "assault rifle",
    "melee weapon": "medium melee",
}

# English armor -> Polish name. "Lekka kurtka kuloodporna" is the Easy Mode PL
# wording for what the English statblocks call Light Armorjack.
ARMOR_NAMES: dict[str, str] = {
    "leathers": "Kurtka skórzana",
    "kevlar": "Kevlar",
    "light armorjack": "Lekka kurtka kuloodporna",
    "medium armorjack": "Średnia kurtka kuloodporna",
    "heavy armorjack": "Ciężka kurtka kuloodporna",
    "bodyweight suit": "Kombinezon opancerzony",
    "flak": "Kamizelka przeciwodłamkowa",
    "metalgear": "Metalgear",
    "subdermal armor": "Pancerz podskórny",
    "bulletproof shield": "Tarcza kuloodporna",
}

# Cost bands as printed in the DLCs ("Cost: 100eb (Premium)").
COST_BANDS: dict[str, str] = {
    "cheap": "cheap",
    "everyday": "everyday",
    "costly": "costly",
    "premium": "premium",
    "expensive": "expensive",
    "very expensive": "veryExpensive",
    "luxury": "luxury",
    "super luxury": "superLuxury",
}

QUALITY_WORDS: dict[str, str] = {
    "poor": "poor",
    "pq": "poor",
    "standard": "standard",
    "sq": "standard",
    "excellent": "excellent",
    "eq": "excellent",
}


def normalise(text: str) -> str:
    """Lowercases and strips the small-caps damage that PDF extraction leaves."""
    cleaned = text.replace("®", " ").replace("™", " ").replace("’", "'")
    cleaned = cleaned.replace(" ", " ")
    return " ".join(cleaned.lower().split())


def resolve_weapon_type(raw: str) -> str | None:
    """Maps a statblock weapon label onto a base type id, or None if unknown."""
    key = normalise(raw)
    key = key.removeprefix("pq ").removeprefix("eq ").removeprefix("sq ")
    key = key.replace("weapon", "").strip()
    if key in WEAPON_ALIASES:
        key = WEAPON_ALIASES[key]
    if key in WEAPON_TYPES:
        return key
    # "poor quality shotgun" and friends
    for prefix in ("poor quality ", "standard quality ", "excellent quality "):
        if key.startswith(prefix):
            rest = key[len(prefix) :]
            rest = WEAPON_ALIASES.get(rest, rest)
            if rest in WEAPON_TYPES:
                return rest
    return None


def resolve_armor(raw: str) -> str | None:
    """Armor labels arrive with noise around them ("wearing Heavy Armorjack",
    "Body: Kevlar®"), so match the longest known name the label ends with."""
    key = normalise(raw)
    for prefix in ("poor quality ", "standard quality ", "excellent quality "):
        key = key.removeprefix(prefix)
    if key in ARMOR_NAMES:
        return key
    for name in sorted(ARMOR_NAMES, key=len, reverse=True):
        if key.endswith(name):
            return name
    return None
