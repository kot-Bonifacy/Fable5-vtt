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

# The Polish rulebook prints one price per band, so the number identifies the
# band on its own. Used to cross-check every parsed "500 ed (Kosztowna)".
COST_BAND_BY_PRICE: dict[int, str] = {
    10: "cheap",
    20: "everyday",
    50: "costly",
    100: "premium",
    500: "expensive",
    1000: "veryExpensive",
    5000: "luxury",
    10000: "superLuxury",
}

# Band names as printed in the Polish edition. The adjective agrees with the
# noun it follows ("Droga" for a weapon, "Drogie" for armor), so match on the
# stem. Order matters: the first stem that the label starts with wins, and
# "bardzo kosztown" has to be tried before "kosztown".
COST_BAND_STEMS: list[tuple[str, str]] = [
    ("tan", "cheap"),
    ("codzien", "everyday"),
    ("drog", "costly"),
    ("premium", "premium"),
    ("bardzo kosztown", "veryExpensive"),
    ("b. kosztown", "veryExpensive"),
    ("kosztown", "expensive"),
    ("superluksusow", "superLuxury"),
    ("luksusow", "luxury"),
]

QUALITY_WORDS: dict[str, str] = {
    "poor": "poor",
    "pq": "poor",
    "standard": "standard",
    "sq": "standard",
    "excellent": "excellent",
    "eq": "excellent",
}


# --- Polish core rulebook (`parse-manual.py`) --------------------------------
#
# The DLC dictionaries above go English -> Polish because the statblocks are
# English. The core rulebook is the Polish edition, so its tables need the
# opposite direction. Both sides key on the same English name, which is what
# keeps compendium ids stable (`weapon-type.heavy-pistol`) no matter which
# source a row came from.

# Row label of the melee/ranged weapon tables -> key of WEAPON_TYPES.
MANUAL_WEAPON_TYPES: dict[str, str] = {
    "Lekka broń biała": "light melee",
    "Średnia broń biała": "medium melee",
    "Duża broń biała": "heavy melee",
    "Bardzo duża broń biała": "very heavy melee",
    "Średni pistolet": "medium pistol",
    "Ciężki pistolet maszynowy": "heavy submachine gun",
    "Ciężki pistolet": "heavy pistol",
    "Bardzo ciężki pistolet": "very heavy pistol",
    "Pistolet maszynowy": "submachine gun",
    "Strzelba": "shotgun",
    "Karabin szturmowy": "assault rifle",
    "Karabin snajperski": "sniper rifle",
    "Granatnik": "grenade launcher",
    "Wyrzutnia rakiet": "rocket launcher",
}

# „Kusze i łuki" is one row of the weapon table but two entries here, because
# the DLC branded weapons reference a bow and a crossbow separately.
MANUAL_SHARED_ROWS: dict[str, list[str]] = {
    "Kusze i łuki": ["bow", "crossbow"],
}

# Row label of the range DV table -> the weapon types that read from it.
MANUAL_RANGE_ROWS: dict[str, list[str]] = {
    "Pistolety": ["light pistol", "medium pistol", "heavy pistol", "very heavy pistol"],
    "PM-y": ["submachine gun", "heavy submachine gun"],
    "Strzelba (pocisk)": ["shotgun"],
    "Karabiny szturmowe": ["assault rifle"],
    "Karabiny snajperskie": ["sniper rifle", "heavy rifle"],
    "Łuki i kusze": ["bow", "crossbow"],
    "Granatniki": ["grenade launcher"],
    "Wyrzutnie Rakiet": ["rocket launcher"],
}

# The Polish edition names two armor pieces differently from the DLC glossary
# above („Skóry" vs „Kurtka skórzana"); the rulebook wording wins on the card.
MANUAL_ARMOR_ROWS: dict[str, str] = {
    "Skóry": "leathers",
    "Kevlar": "kevlar",
    "Lekka kurtka kuloodporna": "light armorjack",
    "Kombinezon Bodyweight": "bodyweight suit",
    "Średnia kurtka kuloodporna": "medium armorjack",
    "Ciężka kurtka kuloodporna": "heavy armorjack",
    "Ubiór kuloodporny": "flak",
    "Metalgear": "metalgear",
    "Tarcza kuloodporna": "bulletproof shield",
}

# The shield is not worn: it is held, so it protects nothing on its own.
ARMOR_LOCATIONS_BY_NAME: dict[str, list[str]] = {
    "bulletproof shield": ["shield"],
}

# The nine skill categories of the rulebook, in the order it prints them.
# The value is the heading the dump carries, matched case-insensitively.
SKILL_GROUPS: list[tuple[str, str]] = [
    ("awareness", "SPOSTRZEGAWCZOŚĆ"),
    ("body", "UMIEJĘTNOŚCI ZWIĄZANE Z CIAŁEM"),
    ("control", "UMIEJĘTNOŚCI ZWIĄZANE Z KONTROLĄ"),
    ("education", "UMIEJĘTNOŚCI ZWIĄZANE Z EDUKACJĄ"),
    ("melee", "UMIEJĘTNOŚCI ZWIĄZANE Z WALKĄ WRĘCZ"),
    ("performance", "UMIEJĘTNOŚCI ZWIĄZANE Z WYSTĘPAMI"),
    ("ranged", "UMIEJĘTNOŚCI ZWIĄZANE Z BRONIĄ DYST"),
    ("social", "UMIEJĘTNOŚCI SPOŁECZNE"),
    ("technique", "UMIEJĘTNOŚCI ZWIĄZANE Z TECHNIKĄ"),
]

# Skill name in the Polish edition -> id used by sheets, rolls and weapon
# types. Ids are the English rulebook names, like every other id in the repo;
# 41 of them already ship in `data/public/cpred/skills.json` (stage 07) and
# must not change, or existing sheets would lose their levels.
#
# The stat and the (×2) cost multiplier are NOT here on purpose: those are
# rulebook values and the parser reads them from the book itself.
SKILLS: dict[str, str] = {
    # Spostrzegawczość
    "Czytanie z ruchu warg": "lip-reading",
    "Koncentracja": "concentration",
    "Percepcja": "perception",
    "Tropienie": "tracking",
    "Ukrycie/Znalezienie przedmiotu": "conceal-reveal-object",
    # Ciało
    "Atletyka": "athletics",
    "Człowiek guma": "contortionist",
    "Odporność na tortury/narkotyki": "resist-torture-drugs",
    "Skradanie się": "stealth",
    "Taniec": "dance",
    "Wytrwałość": "endurance",
    # Kontrola
    "Jeździectwo": "riding",
    "Pilotowanie": "pilot-air-vehicle",
    "Prowadzenie pojazdów": "driving",
    "Żegluga": "pilot-sea-vehicle",
    # Edukacja
    "Biurokracja": "bureaucracy",
    "Dedukcja": "deduction",
    "Hazard": "gamble",
    "Język": "language",
    "Komponowanie": "composition",
    "Kryminologia": "criminology",
    "Kryptografia": "cryptography",
    "Księgowość": "accounting",
    "Nauka": "science",
    "Opieka nad zwierzętami": "animal-handling",
    "Przeszukiwanie baz danych": "library-search",
    "Robienie interesów": "business",
    "Sztuka przetrwania": "wilderness-survival",
    "Taktyka": "tactics",
    "Wiedza lokalna": "local-expert",
    "Wykształcenie": "education",
    # Walka wręcz
    "Bijatyka": "brawling",
    "Broń biała": "melee-weapon",
    "Sztuki walki": "martial-arts",
    "Unik": "evasion",
    # Występy
    "Aktorstwo": "acting",
    "Gra na instrumencie": "play-instrument",
    # Broń dystansowa
    "Broń ciężka": "heavy-weapons",
    "Broń długa": "shoulder-arms",
    "Broń krótka": "handgun",
    "Łucznictwo": "archery",
    "Ogień ciągły": "autofire",
    # Społeczne
    "Atrakcyjność": "personal-grooming",
    "Handel": "trading",
    "Konwersacja": "conversation",
    "Moda i styl": "wardrobe-style",
    "Odczytywanie emocji": "human-perception",
    "Perswazja": "persuasion",
    "Przekupstwo": "bribery",
    "Przesłuchiwanie": "interrogation",
    "Znajomość półświatka": "streetwise",
    # Technika
    "Cyberinżynieria": "cybertech",
    "Elektronika i zabezpieczenia": "electronics-security",
    "Fałszerstwo": "forgery",
    "Fotografia/Film": "photography-film",
    "Kieszonkostwo": "pick-pocket",
    "Malowanie/rysowanie/rzeźbienie": "paint-draw-sculpt",
    "Materiały wybuchowe": "demolitions",
    "Naprawa broni": "weaponstech",
    "Naprawa pojazdów lądowych": "land-vehicle-tech",
    "Naprawa pojazdów wodnych": "sea-vehicle-tech",
    "Naprawa statków powietrznych": "air-vehicle-tech",
    "Otwieranie zamków": "pick-lock",
    "Pierwsza pomoc": "first-aid",
    "Podstawowe naprawy": "basic-tech",
    "Ratownictwo medyczne": "paramedic",
}

# Stat abbreviations of the Polish sheet -> stat ids of `stats.ts`.
STAT_IDS: dict[str, str] = {
    "INT": "int",
    "REF": "ref",
    "ZW": "dex",
    "TECH": "tech",
    "CHA": "cool",
    "SW": "will",
    "SZ": "luck",
    "RUCH": "move",
    "BC": "body",
    "EMP": "emp",
}

# Weapon skill named in the ranged weapon table -> skill id.
MANUAL_WEAPON_SKILLS: dict[str, str] = {
    "Broń krótka": "handgun",
    "Broń długa": "shoulder-arms",
    "Broń ciężka": "heavy-weapons",
    "Łucznictwo": "archery",
}


def cost_band(label: str) -> str | None:
    """Maps „(Bardzo kosztowna)" onto a COST_CATEGORIES id."""
    key = " ".join(label.lower().split())
    for stem, band in COST_BAND_STEMS:
        if key.startswith(stem):
            return band
    return None


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
