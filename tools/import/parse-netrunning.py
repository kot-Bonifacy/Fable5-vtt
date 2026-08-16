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


# ─────────────────────── mechanika efektu Programu (etap 26c) ───────────────────────
#
# The „Efekt" column is one Polish sentence per Program, and stage 26c has to
# act on it. Reading that sentence in code would mean a `switch` over names in
# a game module; instead the sentence stays the entry's description and the
# numbers it implies are written down here, keyed by the slug the row gets.
#
# What lives in this table is arithmetic and hook names — our own reading of the
# rules, not the rulebook's text, which (like every other entry field) is written
# only to the gitignored `data/private`.
PROGRAM_EFFECTS: dict[str, dict] = {
    # Dopalacze (s. 203)
    "program.gumka": {"boost": {"value": 2, "abilities": ["cloak"]}},
    "program.mam-cie": {"boost": {"value": 2, "abilities": ["scout"]}},
    "program.szybki-bil": {"boost": {"value": 2, "speed": True}},
    "program.robak": {"boost": {"value": 2, "abilities": ["backdoor"]}},
    # Obrońcy (s. 203)
    "program.pancerz": {
        "guard": {"kind": "armour", "value": 4},
        "singleCopy": True,
        "oncePerEntry": True,
    },
    "program.powloka": {"guard": {"kind": "shell"}, "singleCopy": True, "oncePerEntry": True},
    "program.tarcza": {"guard": {"kind": "shield"}, "singleCopy": True, "oncePerEntry": True},
    # Agresorzy (s. 203–204)
    "program.mlot-na-wroga": {"vsProgram": 3, "vsBlackIce": 2},
    "program.miecz": {"vsProgram": 2, "vsBlackIce": 3},
    "program.dekkrash": {"hooks": ["eject"]},
    "program.piekielny-pocisk": {"vsBrain": 2, "hooks": ["burn"]},
    "program.nerwosol": {"hooks": ["statDrain"]},
    "program.trujacy-zgon": {"hooks": ["destroyProgram"]},
    "program.superklej": {"hooks": ["glue"], "glue": "d6rounds", "oncePerEntry": True},
    "program.mozgoklep": {"vsBrain": 1, "hooks": ["stealNetAction"]},
    # Czarny LOD (s. 204–207)
    "program.zmija": {"hooks": ["destroyProgram"]},
    "program.olbrzym": {"vsBrain": 3, "hooks": ["eject"]},
    "program.piekielny-ogar": {"vsBrain": 2, "hooks": ["burn"]},
    "program.kraken": {"vsBrain": 3, "hooks": ["glue"], "glue": "nextTurn"},
    "program.lisz": {"hooks": ["statDrain"]},
    "program.kruk": {"vsBrain": 1, "hooks": ["derezDefender"]},
    "program.skorpion": {"hooks": ["moveDrain"]},
    "program.skunks": {"hooks": ["slidePenalty"]},
    "program.bledny-ognik": {"vsBrain": 1, "hooks": ["stealNetAction"]},
    "program.smok": {"vsProgram": 6, "vsBlackIce": 6, "destroys": True},
    "program.zabojca": {"vsProgram": 4, "vsBlackIce": 4, "destroys": True},
    "program.szablozab": {"vsProgram": 6, "vsBlackIce": 6, "destroys": True},
}


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
        **(
            {"effects": PROGRAM_EFFECTS[f"program.{slugify(record['name'])}"]}
            if f"program.{slugify(record['name'])}" in PROGRAM_EFFECTS
            else {}
        ),
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


# --------------------- systemy obronne (etap 26d) ---------------------

# Trzy tabele z s. 213-216. Zrzut PDF-a skleja je w jeden ciag, ale kazdy wiersz
# ma dokladnie jeden bezwarunkowy anchor - zdanie o unieszkodliwieniu Testem
# Elektroniki i zabezpieczen - i to ono tnie strumien na wiersze. Reszta kolumn
# („Inne") to liczby z etykieta, wiec czyta sie je regexem, a nie pozycja.
#
# Nazwa wiersza to jedyne miejsce, gdzie trzeba zgadywac: lezy miedzy ogonem
# kolumny „Inne" poprzedniego wiersza a jego wlasnym opisem. Ratuje ja to, ze
# nazwy w tych tabelach pisane sa wielka litera tylko na poczatku („Pajeczy dron
# naziemny"), a opis zaczyna sie od kolejnej wielkiej litery. Wiersze rozdziela
# powtarzalna komorka „Granica bronionej strefy"; tam, gdzie jej nie ma, wchodzi
# heurystyka wielkich liter.

DEFENSE_SECTIONS: list[tuple[str, str, str]] = [
    ("drone", "AKTYWNE SYSTEMY OBRONNE", "STANOWISKA OBRONNE"),
    ("emplacement", "STANOWISKA OBRONNE", "SYSTEMY OBRONY ŚRODOWISKOWEJ"),
    ("environment", "SYSTEMY OBRONY ŚRODOWISKOWEJ", "Bezpieczny dom"),
]

DEFENSE_HEADER = re.compile(
    r"(?::\s*NETRUNNER\s*)?Typ\s*Opis\s*Standardowa\s+[Aa]ktywacja\s*Inne"
)
DEFENSE_ANCHOR = re.compile(
    r"PT (\d+) Elektronika i zabezpieczenia,\s*(\d+)\s*minut\w*,\s*by unieszkodliwić\."
)
# Powtarzalna komorka kolumny „Inne" - granica wiersza, nie tresc.
DEFENSE_ZONE = "Granica bronionej strefy"
DEFENSE_MARKERS = [
    re.compile(r"RUCH\s*\d+"),
    re.compile(r"\d+\s*PW"),
    re.compile(r"Percepcja PT\s*\d+,\s*by zauważyć"),
    re.compile(r"\bLA\s*\d+"),
    re.compile(r"Wartość bojowa\s*\d+"),
]
CAPITAL = re.compile(r"^[A-ZĄĆĘŁŃÓŚŹŻ]")


def defense_numbers(tail: str) -> dict[str, int]:
    """Kolumna „Inne": RUCH, PW, PT zauwazenia i Wartosc bojowa."""
    out: dict[str, int] = {}
    move = re.search(r"RUCH\s*(\d+)", tail)
    if move:
        out["move"] = int(move.group(1))
    hp = re.search(r"(\d+)\s*PW", tail)
    if hp:
        out["hp"] = int(hp.group(1))
    spot = re.search(r"Percepcja PT\s*(\d+)", tail)
    if spot:
        out["spotDv"] = int(spot.group(1))
    combat = re.search(r"Wartość bojowa\s*(\d+)", tail)
    if combat:
        # „Wartosc bojowa 1425 PW" - zrzut skleja Wartosc bojowa z PW. Jest
        # dokladnie jeden podzial, przy ktorym obie liczby maja sens.
        digits = combat.group(1)
        split = None
        for cut in range(1, len(digits)):
            left, right = int(digits[:cut]), int(digits[cut:])
            if 1 <= left <= 30 and 1 <= right <= 300:
                split = (left, right)
        if split:
            out["combatValue"], out["hp"] = split
        else:
            out["combatValue"] = int(digits)
    return out


# ─────────────────────── efekt systemu obronnego (etap 26f) ───────────────────────
#
# Kolumna „Opis" jest proza i taka zostaje - ale zdania, ktorymi ta proza opisuje
# MECHANIKE, powtarzaja sie w calej tabeli doslownie. Osiemnascie wierszy uzywa
# szesciu konstrukcji („zadaje 6k6 obrazen cialu", „udany Test X o PT N",
# „redukujac RUCH o 2k6", „Przewroci sie", „staje sie Nieprzytomny", „na koniec
# swojej kolejnej Tury"), wiec parser wyciaga wlasnie je, a nie probuje rozumiec
# zdania. Czego nie zlapie, to zostaje przy MG: formularz w kompendium ma komplet
# pol, a wiersz bez `effects` zachowuje sie tak, jak zachowywal sie przed 26f.

# Nazwa umiejetnosci wypada w tabeli raz w dopelniaczu („Test Atletyki"), raz
# w mianowniku („rzut na Odpornosc"), wiec obie formy sa kluczami. Trzecia
# pozycja to Cecha, na ktorej test sie odbywa, gdy kampania NIE MA tej
# umiejetnosci w rejestrze - „Czlowiek guma" nie nalezy do 41 umiejetnosci Easy
# Mode, wiec bez tego rzucaloby sie na SW zamiast na ZR.
DEFENSE_SKILLS: dict[str, tuple[str, str, str]] = {
    "atletyki": ("athletics", "Atletyka", "dex"),
    "atletyka": ("athletics", "Atletyka", "dex"),
    "odporności na tortury/narkotyki": (
        "resist-torture-drugs",
        "Odporność na tortury/narkotyki",
        "will",
    ),
    "odporność na tortury/narkotyki": (
        "resist-torture-drugs",
        "Odporność na tortury/narkotyki",
        "will",
    ),
    "człowiek guma": ("human-rubber", "Człowiek guma", "dex"),
}
DEFENSE_CHECK_RE = re.compile(
    r"(?:Test(?:u)?|rzut na)\s+(?:Umiejętności\s+)?(.+?)\s+o\s+PT\s*(\d+)", re.IGNORECASE
)
DEFENSE_DAMAGE_RE = re.compile(r"(\d+k\d+)\s+obrażeń")
DEFENSE_MOVE_DRAIN_RE = re.compile(r"RUCH\s*o\s*(\d+k\d+)")
DEFENSE_INJURY_IDS: dict[str, str] = {
    "uraz ucha": "injury.head-uraz-ucha",
    "uraz oka": "injury.head-uraz-oka",
}
# „Kontakt z wiazka traktuje sie tak, jakby cel otrzymal cios w cialo Bardzo duza
# bronia biala" - jedyny wiersz, ktory zamiast liczby podaje typ broni.
DEFENSE_MELEE_DAMAGE: dict[str, str] = {
    "bardzo dużą bronią białą": "4k6",
    "dużą bronią białą": "3k6",
}


def defense_effects(description: str, trigger: str) -> dict:
    """Mechaniczna polowa kolumny „Opis" - tyle, ile da sie wylowic ze zdan."""
    text = clean(description)
    low = text.lower()
    out: dict = {}

    # Kiedy. Winda z gazem bierze wlasne miejsce w Kolejce; Slizgawka i Siatka
    # laserowa reaguja na ruch WEWNATRZ obszaru, nie na samo wejscie.
    if "kolejce inicjatywy" in low:
        out["when"] = "turn"
    elif "akcję ruchu na tym obszarze" in low or "przemieszcza się o 2 metry" in (
        trigger or ""
    ).lower():
        out["when"] = "move"

    check = DEFENSE_CHECK_RE.search(text)
    if check:
        skill = clean(check.group(1)).strip(" ,.").lower()
        known = DEFENSE_SKILLS.get(skill)
        if known:
            out["check"] = {
                "skillId": known[0],
                "skillLabel": known[1],
                "statId": known[2],
                "dv": int(check.group(2)),
            }
            # „Osoba, ktora WIDZI wiazki laserowe, moze przejsc przez broniony
            # obszar" (s. 216) - jedyny test w tabeli zarezerwowany dla tego, kto
            # pulapke zauwazyl. Reszta rzuca niezaleznie od tego, czy wie.
            if "która widzi" in low:
                out["awareOnly"] = True
            # „Wszystkie stworzenia biologiczne w Somie" (krwawy roj, s. 215).
            # VTT nie wie, kto jest z miesa - flaga pisze uwage na karcie, tak
            # samo jak przy biotoksynie z 16h.
            if "biologiczn" in low:
                out["check"]["biologicalOnly"] = True

    damage = DEFENSE_DAMAGE_RE.search(text)
    if damage:
        out["damage"] = damage.group(1)
    else:
        for phrase, dice in DEFENSE_MELEE_DAMAGE.items():
            if phrase in low:
                out["damage"] = dice
                break

    if "bezpośrednio w pw" in low or "obrażeń bezpośrednich" in low:
        out["direct"] = True
    if "nie ulega uszkodzeniu" in low:
        out["noAblation"] = True
    if "kolejnej tury" in low:
        out["repeats"] = True

    drain = DEFENSE_MOVE_DRAIN_RE.search(text)
    if drain:
        out["moveDrain"] = drain.group(1)

    statuses: list[str] = []
    if "przewróci się" in low:
        statuses.append("prone")
    if "nieprzytomny" in low:
        statuses.append("unconscious")
    if statuses:
        out["statuses"] = statuses

    injuries = [id for phrase, id in DEFENSE_INJURY_IDS.items() if phrase in low]
    if injuries:
        out["injuries"] = injuries
    if "przez następną minutę" in low:
        out["durationS"] = 60
    if "nie otrzymują obrażeń dodatkowych" in low:
        out["noBonusDamage"] = True

    return out


def defense_trigger(tail: str) -> str:
    """„Standardowa aktywacja" - pierwsze zdanie ogona wiersza."""
    body = DEFENSE_HEADER.sub(" ", tail).strip()
    stop = body.find(".")
    return clean(body[: stop + 1] if stop != -1 else body)


def defense_strip(tail: str) -> str:
    """Ogon wiersza bez aktywacji i bez liczb - zostaje „Inne", nazwa i opis."""
    body = DEFENSE_HEADER.sub(" ", tail).strip()
    stop = body.find(".")
    if stop != -1:
        body = body[stop + 1 :]
    for pattern in DEFENSE_MARKERS:
        body = pattern.sub(" ", body)
    return re.sub(r"\s+", " ", re.sub(r"\s*[-–]\s*", " ", body)).strip()


def defense_leading_name(text: str) -> tuple[str, str]:
    """„Pajeczy dron naziemny Drony pajecze..." -> (nazwa, opis)."""
    words = text.split(" ")
    if not words or not CAPITAL.match(words[0]):
        return "", text
    index = 1
    while index < len(words) and not CAPITAL.match(words[index]):
        index += 1
    return " ".join(words[:index]).strip(" ,.;:"), " ".join(words[index:]).strip()


def defense_guess_name(text: str) -> tuple[str, str]:
    """Ostatni ciag „Wielka + male" przed koncem pierwszego zdania."""
    words = text.split(" ")
    end = len(words)
    for index, word in enumerate(words):
        if word.endswith(".") or word.endswith(":"):
            end = index + 1
            break
    best: tuple[int, int] | None = None
    for index, word in enumerate(words):
        if not CAPITAL.match(word):
            continue
        after = index + 1
        while after < len(words) and not CAPITAL.match(words[after]):
            after += 1
        # Ostro mniejsze: wielka litera stojaca dokladnie na koncu zdania
        # otwiera juz opis, a nie kolejna nazwe.
        if after < len(words) and after < end:
            best = (index, after)
    if best is None:
        return "", text
    start, after = best
    return " ".join(words[start:after]).strip(" ,.;:"), " ".join(words[after:]).strip()


def defense_prices(chapter: str) -> dict[int, tuple[int, str | None]]:
    """„PT 9 500 ed(Kosztowne)..." (s. 218) - cena zalezy od PT unieszkodliwienia."""
    stream = clean(
        slice_between(
            chapter,
            "PT unieszkodliwienia Testem Elektroniki i zabezpieczeń",
            "PRZYKŁADOWY",
            "ceny systemów obronnych",
        )
    )
    prices: dict[int, tuple[int, str | None]] = {}
    for match in re.finditer(r"PT\s*(\d+)\s*(\d[\d\s ]*)\s*ed\s*\(([^)]+)\)", stream):
        prices[int(match.group(1))] = (
            int(re.sub(r"\D", "", match.group(2))),
            band_of(match.group(3)),
        )
    if not prices:
        warn("systemy obronne: nie odczytałem tabeli cen (s. 218)")
    return prices


def parse_defenses(chapter: str) -> list[dict]:
    prices = defense_prices(chapter)
    entries: list[dict] = []
    for kind, start, end in DEFENSE_SECTIONS:
        blob = clean(slice_between(chapter, start, end, f"systemy obronne: {kind}"))
        # Naglowek tabeli wraca po kazdym lamaniu strony, wiec pierwszy kawalek
        # to wstep, a wszystkie nastepne - dalsze wiersze tej samej tabeli.
        pieces = DEFENSE_HEADER.split(blob)
        if len(pieces) < 2:
            warn(f"systemy obronne: nie znalazłem nagłówka tabeli ({kind})")
            continue
        body = " ".join(piece.strip() for piece in pieces[1:])
        parts = DEFENSE_ANCHOR.split(body)
        rows = (len(parts) - 1) // 3
        if rows == 0:
            warn(f"systemy obronne: tabela {kind} nie ma ani jednego wiersza")
            continue
        for row in range(rows):
            chunk = parts[3 * row] if row == 0 else defense_strip(parts[3 * row])
            if row == 0:
                name, description = defense_leading_name(clean(chunk))
            elif DEFENSE_ZONE in chunk:
                after = chunk[chunk.rindex(DEFENSE_ZONE) + len(DEFENSE_ZONE) :]
                name, description = defense_leading_name(after.strip())
            else:
                name, description = defense_guess_name(chunk)
            if not name:
                warn(f"systemy obronne ({kind}): wiersz {row + 1} bez nazwy — pominięty")
                continue
            disable_dv = int(parts[3 * row + 1])
            minutes = int(parts[3 * row + 2])
            tail = parts[3 * (row + 1)] if 3 * (row + 1) < len(parts) else ""
            cost, band = prices.get(disable_dv, (None, None))
            trigger = defense_trigger(tail)
            numbers = defense_numbers(tail)
            effects = defense_effects(description, trigger)
            # „W czasie samodzielnego dzialania systemy obronne okreslaja
            # skutecznosc swoich dzialan, wykonujac Test Wartosci bojowej + 1k10"
            # (s. 214). Stanowisko, ktore ma ta liczbe i nie ma wlasnych obrazen
            # w opisie, strzela - a czym, mowi zeton zwiazany ze strefa.
            if kind == "emplacement" and "combatValue" in numbers and "damage" not in effects:
                effects["fires"] = True
            entries.append(
                {
                    "id": f"defense.{slugify(name)}",
                    "category": "netDefense",
                    "defenseKind": kind,
                    "name": name,
                    "description": trimmed(clean(description)),
                    "disableDv": disable_dv,
                    "disableMinutes": minutes,
                    **numbers,
                    **({"trigger": trigger} if trigger else {}),
                    **({"effects": effects} if effects else {}),
                    **({"cost": cost} if cost is not None else {}),
                    **({"costCategory": band} if band else {}),
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
    defenses = parse_defenses(chapter)
    hardware = parse_hardware(chapter)

    ice_ids = {slugify(entry["name"]): entry["id"] for entry in black_ice}
    lobby = parse_lobby_table(chapter, ice_ids)
    content = parse_content_table(chapter, ice_ids)
    ladder = parse_difficulty_ladder(chapter)
    net_actions = parse_net_actions(chapter)

    entries = programs + black_ice + demons + defenses + hardware
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
        f"{len(demons)} Demonów, {len(defenses)} systemów obronnych, "
        f"{len(hardware)} ulepszeń -> {compendium_path}"
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
