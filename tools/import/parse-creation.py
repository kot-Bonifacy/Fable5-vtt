"""Polish core rulebook -> character-creation data (stage 25a).

Reads the two chapters the creator needs — „Dusza i nowa maszyna" (s. 27–42,
the three methods) and „Wyposażony na Przyszłość" (s. 71–90, stats and skills) —
and writes one file the wizard reads at runtime:

    data/private/cpred/creation.json

The file is gitignored, like everything else derived from the rulebook. The
repo keeps this parser and a made-up sample in `data/public/cpred/creation.json`
so a fresh clone still has a working creator.

Two tables carry the whole stage and both arrive glued by the PDF dump:

  * **Stat templates** (s. 74–77) survive as a digit stream:
    `RzutINTREFZWTECHCHASWSZRUCHBCEMP1 7665687738 2 3777767758 …`, with row
    numbers sometimes swallowed by the neighbouring value. Whitespace is
    therefore thrown away and the stream is read as „row number 1…10, then
    exactly ten stat digits" — that parse has no ambiguity left in it.

  * **Role skill lists** (s. 88–89) survive as one run of names with no
    separators at all: `AtletykaAtletykaAtletyka…`. They are tokenised against
    the known skill vocabulary (`terms.SKILLS`), and the five columns are
    recovered from two invariants the book obeys: every column is sorted
    alphabetically and every role lists exactly twenty skills. Where the dump
    dropped a cell, the gap position is searched for and the missing name comes
    from the worked example printed on the same page.

Run:
    python tools/import/parse-creation.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from terms import (  # noqa: E402
    MANUAL_ROLE_NAMES,
    MANUAL_SKILL_ALIASES,
    SKILLS,
    STAT_IDS,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
MANUAL_DIR = REPO_ROOT / "data" / "private" / "rulebook" / "manual" / "CPRED-podrecznik"
OVERRIDES_PATH = REPO_ROOT / "data" / "private" / "rulebook" / "manual" / "manual-overrides.json"
CPRED_DIR = REPO_ROOT / "data" / "private" / "cpred"

CHAPTER_ROLES = "04-dusza-i-nowa-maszyna.md"
CHAPTER_GEAR = "06-wyposazony-na-przyszlosc.md"

SOURCE = "Cyberpunk RED — podręcznik główny (wydanie polskie)"
SCHEMA_VERSION = 1

STAT_ORDER = ["INT", "REF", "ZW", "TECH", "CHA", "SW", "SZ", "RUCH", "BC", "EMP"]
STAT_HEADER = "Rzut" + "".join(STAT_ORDER)
TEMPLATE_ROWS = 10
SKILLS_PER_ROLE = 20
COLUMNS = 5

warnings: list[str] = []


def warn(message: str) -> None:
    warnings.append(message)


def load_chapter(name: str) -> str:
    path = MANUAL_DIR / name
    if not path.exists():
        raise SystemExit(f"Brak rozdziału {path} — materiały prywatne są poza repo.")
    return path.read_text(encoding="utf8")


def clean(text: str) -> str:
    """Collapses the dump's one-sentence-per-line layout into flowing text."""
    text = text.replace("­", "").replace("®", "").replace("™", "")
    text = re.sub(r"<!--.*?-->", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def write(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf8")


def load_overrides() -> dict:
    if not OVERRIDES_PATH.exists():
        return {}
    return json.loads(OVERRIDES_PATH.read_text(encoding="utf8"))


# ─────────────────────────────── szablony Cech ───────────────────────────────


def parse_stat_templates(chapter: str) -> dict[str, list[list[int]]]:
    """Ten 1k10 rows of ten stats for each Role (s. 74–77)."""
    flat = clean(chapter)
    templates: dict[str, list[list[int]]] = {}
    for label, role_id in MANUAL_ROLE_NAMES.items():
        rows = find_template(flat, label)
        if rows is None:
            warn(f"Nie znalazłem szablonu Cech dla Roli {label}")
            continue
        templates[role_id] = rows
    return templates


def find_template(flat: str, label: str) -> list[list[int]] | None:
    """First `<ROLE> Rzut…` table after the sentence that introduces them all.

    Anchoring on the role name (and not on the header alone) skips the two
    copies of the Solo table the worked examples print on s. 73 and s. 77.
    """
    start = flat.find("Poniżej przedstawiono szablon dla każdej Roli")
    if start == -1:
        return None
    for match in re.finditer(re.escape(label), flat[start:]):
        tail = flat[start + match.end() :]
        header = tail.find(STAT_HEADER)
        # The name must sit right on top of its table, not three pages above it.
        if header == -1 or header > 4:
            continue
        rows = read_digit_rows(tail[header + len(STAT_HEADER) :])
        if rows is not None:
            return rows
    return None


def read_digit_rows(tail: str) -> list[list[int]] | None:
    """Reads `1` + ten digits, `2` + ten digits … `10` + ten digits.

    Whitespace carries no information here (the dump glues `…684 67765…`), so
    it is dropped and the stream is read purely by shape.
    """
    stream = re.sub(r"\s+", "", tail)
    rows: list[list[int]] = []
    at = 0
    for expected in range(1, TEMPLATE_ROWS + 1):
        marker = str(expected)
        if not stream.startswith(marker, at):
            return None
        at += len(marker)
        digits = stream[at : at + len(STAT_ORDER)]
        if len(digits) < len(STAT_ORDER) or not digits.isdigit():
            return None
        at += len(STAT_ORDER)
        rows.append([int(char) for char in digits])
    return rows


# ────────────────────────── listy umiejętności Ról ──────────────────────────


def skill_lookup() -> dict[str, str]:
    """Normalised surface form -> skill id, longest form first when matching."""
    lookup: dict[str, str] = {}
    for name, skill_id in SKILLS.items():
        lookup[normalise_skill(name)] = skill_id
    for alias, name in MANUAL_SKILL_ALIASES.items():
        if name not in SKILLS:
            warn(f"Alias {alias!r} wskazuje na nieznaną umiejętność {name!r}")
            continue
        lookup[normalise_skill(alias)] = SKILLS[name]
    return lookup


def normalise_skill(text: str, drop_digits: bool = False) -> str:
    """Drops case, whitespace and every „(…)" qualifier.

    That is what makes „Odporność na tortury/ narkotyki", „Nauka (wybierz 1)"
    and „Ogień ciągły (×2)" the same token as their entry on the main list.
    `drop_digits` additionally throws away the levels printed between names in
    the Ulicznik table („Atletyka 2 Bijatyka 6").
    """
    without_qualifiers = re.sub(r"\([^)]*\)", "", text)
    if drop_digits:
        without_qualifiers = re.sub(r"[0-9,]+", "", without_qualifiers)
    return re.sub(r"\s+", "", without_qualifiers).lower()


def tokenise_skills(
    run: str, lookup: dict[str, str], drop_digits: bool = False
) -> tuple[list[str], str]:
    """Greedy longest-match over a run of glued skill names.

    Returns the ids found and whatever tail stopped the scan — the caller uses
    the tail to notice that a table ended somewhere unexpected.
    """
    stream = normalise_skill(run, drop_digits)
    names = sorted(lookup, key=len, reverse=True)
    found: list[str] = []
    at = 0
    while at < len(stream):
        for name in names:
            if stream.startswith(name, at):
                found.append(lookup[name])
                at += len(name)
                break
        else:
            return found, stream[at:]
    return found, ""


def parse_role_skills(chapter: str, basic: list[str], overrides: dict) -> dict[str, list[str]]:
    """Twenty skills per Role: thirteen basic ones plus seven professional."""
    flat = clean(chapter)
    lookup = skill_lookup()
    professional: dict[str, list[str]] = {}
    for labels in (
        ["ROCKER", "SOLO", "NETRUNNER", "TECHNIK", "MEDYK"],
        ["MEDIA", "STRÓŻ PRAWA", "KORPO", "FIXER", "NOMADA"],
    ):
        header = "".join(f"{title(label)}Umiejętności" for label in labels)
        columns = parse_skill_table(flat, header, labels, basic, lookup, overrides)
        for label, ids in zip(labels, columns, strict=True):
            professional[MANUAL_ROLE_NAMES[label]] = ids
    return {
        role_id: basic + professional.get(role_id, [])
        for role_id in MANUAL_ROLE_NAMES.values()
        if role_id in professional
    }


def title(label: str) -> str:
    """`STRÓŻ PRAWA` -> `Stróż Prawa`, the casing the table header uses."""
    return " ".join(word.capitalize() for word in label.split())


def parse_skill_table(
    flat: str,
    header: str,
    labels: list[str],
    basic: list[str],
    lookup: dict[str, str],
    overrides: dict,
) -> list[list[str]]:
    start = flat.find(header)
    if start == -1:
        warn(f"Nie znalazłem tabeli umiejętności: {header[:40]}…")
        return [[] for _ in labels]
    run = flat[start + len(header) :]
    found, _ = tokenise_skills(run, lookup)
    basic_set = set(basic)
    per_role = SKILLS_PER_ROLE - len(basic)
    professional = professional_block(found, basic_set)[: COLUMNS * per_role]

    columns = split_columns(
        professional,
        per_role,
        labels,
        lookup,
        flat,
        basic_set,
        first_row_hint(flat, labels, basic_set, lookup),
    )
    for label, ids in zip(labels, columns, strict=True):
        override = (overrides.get("roleSkills") or {}).get(MANUAL_ROLE_NAMES[label])
        if override:
            ids[:] = [SKILLS[name] if name in SKILLS else name for name in override]
        if len(ids) != per_role:
            warn(f"Rola {label}: {len(ids)} z {per_role} umiejętności zawodowych")
    return columns


def professional_block(found: list[str], basic: set[str]) -> list[str]:
    """Everything from the first non-basic token on.

    The basic block repeats the same thirteen skills for every Role, so it
    carries no information the rules text has not already stated in words.
    """
    first = next((i for i, skill in enumerate(found) if skill not in basic), len(found))
    return found[first:]


def first_row_hint(
    flat: str, labels: list[str], basic: set[str], lookup: dict[str, str]
) -> list[str] | None:
    """First professional row as the Ulicznik table (s. 86–87) prints it.

    Both tables list the same skills for the same Roles in the same order, so
    the one that survived the dump intact settles the row the other one lost a
    cell from. Only the first row is trusted: further down the Ulicznik dump is
    the more damaged of the two.
    """
    header = "".join(title(label) for label in labels)
    start = flat.find(header)
    if start == -1:
        return None
    # The Ulicznik table repeats „UmiejętnośćPoz." once per column under its
    # role names; the scan has to start below that second header line.
    at = start + len(header)
    column_header = "UmiejętnośćPoz."
    below = flat[at : at + 200].rfind(column_header)
    if below != -1:
        at += below + len(column_header)
    found, _ = tokenise_skills(flat[at:], lookup, drop_digits=True)
    row = professional_block(found, basic)[:COLUMNS]
    return row if len(row) == COLUMNS else None


def split_columns(
    professional: list[str],
    per_role: int,
    labels: list[str],
    lookup: dict[str, str],
    flat: str,
    basic: set[str],
    hint: list[str] | None,
) -> list[list[str]]:
    """Recovers the five columns from a row-major run that may be missing cells.

    A complete run splits trivially. A short one is repaired by trying every
    position the dump could have dropped a cell at, keeping the placements that
    leave all five columns alphabetically sorted, and asking the worked example
    on the same page which of them is the real one. One cell short of a full
    table there is exactly one such placement — the two invariants (sorted
    column, seven entries) pin it down without anybody guessing.
    """
    names = {skill_id: name for name, skill_id in lookup.items()}
    full = COLUMNS * per_role
    if len(professional) == full:
        columns = deal(professional, [], per_role)
        if not all(sorted_by_name(column, names) for column in columns):
            warn("Kolumny umiejętności nie wychodzą alfabetycznie — sprawdź zrzut tabeli")
        return columns

    lost = full - len(professional)
    examples = {
        label: [skill for skill in (worked_example(flat, label, lookup) or []) if skill not in basic]
        for label in labels
    }
    solutions: list[tuple[int, list[list[str]]]] = []
    for gap in range(full):
        columns = deal(professional, [gap], per_role)
        short = gap % COLUMNS
        if len(columns[short]) != per_role - lost:
            continue
        if not all(sorted_by_name(column, names) for column in columns):
            continue
        example = examples.get(labels[short]) or []
        missing = [skill for skill in example if skill not in columns[short]]
        if len(missing) != lost or set(columns[short]) - set(example):
            continue
        columns[short] = sorted(columns[short] + missing, key=lambda id_: names.get(id_, id_))
        if hint is not None and [column[0] for column in columns] != hint:
            continue
        solutions.append((short, columns))

    if len(solutions) == 1:
        short, columns = solutions[0]
        warn(
            f"Zrzut tabeli zgubił {lost} komórkę(-i) w kolumnie {labels[short]}; "
            "uzupełnione z przykładu drukowanego na tej samej stronie"
        )
        return columns
    warn(
        f"Tabela umiejętności: {len(professional)} z {full} pozycji, "
        f"{len(solutions)} pasujących układów — potrzebny wpis w manual-overrides.json"
    )
    return deal(professional, [], per_role)


def deal(tokens: list[str], gaps: list[int], per_role: int) -> list[list[str]]:
    """Deals a row-major run into five columns, skipping the given slots."""
    columns: list[list[str]] = [[] for _ in range(COLUMNS)]
    at = 0
    for slot in range(COLUMNS * per_role):
        if slot in gaps:
            continue
        if at >= len(tokens):
            break
        columns[slot % COLUMNS].append(tokens[at])
        at += 1
    return columns


def sorted_by_name(column: list[str], names: dict[str, str]) -> bool:
    keys = [names.get(skill, skill) for skill in column]
    return keys == sorted(keys)


def worked_example(flat: str, label: str, lookup: dict[str, str]) -> list[str] | None:
    """The „Ten Solo ma poniższy zestaw Umiejętności: …" list, as skill ids."""
    marker = f"Ten {title(label)} ma poniższy zestaw Umiejętności:"
    start = flat.find(marker)
    if start == -1:
        return None
    sentence = flat[start + len(marker) :].split(".")[0]
    ids: list[str] = []
    for piece in sentence.split(","):
        found, _ = tokenise_skills(piece, lookup)
        ids.extend(found)
    return ids or None


# ─────────────────────── pule punktów, limity i minima ───────────────────────


def parse_basic_skills(chapter: str, lookup: dict[str, str]) -> list[str]:
    """The thirteen skills every character carries at level 2 or better."""
    flat = clean(chapter)
    marker = "Poniższe Umiejętności muszą być co najmniej na poziomie 2:"
    start = flat.find(marker)
    if start == -1:
        warn("Nie znalazłem listy umiejętności podstawowych")
        return []
    sentence = flat[start + len(marker) :].split(".")[0]
    ids: list[str] = []
    for piece in sentence.split(","):
        found, tail = tokenise_skills(piece, lookup)
        if tail:
            warn(f"Nierozpoznany fragment listy podstawowej: {piece.strip()!r}")
        ids.extend(found)
    if len(ids) != 13:
        warn(f"Umiejętności podstawowych: {len(ids)}, oczekiwane 13")
    return ids


def parse_limits(chapter: str) -> dict[str, int]:
    flat = clean(chapter)
    limits = {"statMin": 2, "statMax": 8, "skillMin": 2, "skillMax": 6}
    stat = re.search(r"żadna Cecha nie może być wyższa niż (\d+) ani niższa niż (\d+)", flat, re.I)
    if stat is None:
        stat = re.search(r"Żadna Cecha nie może przekraczać (\d+) ani być niższa od (\d+)", flat)
    if stat:
        limits["statMax"], limits["statMin"] = int(stat.group(1)), int(stat.group(2))
    else:
        warn("Nie znalazłem zdania o limitach Cech — zostają wartości domyślne")
    skill = re.search(
        r"Wybrana Umiejętność nie może być wyższa niż (\d+) i niższa niż (\d+)", flat
    )
    if skill:
        limits["skillMax"], limits["skillMin"] = int(skill.group(1)), int(skill.group(2))
    else:
        warn("Nie znalazłem zdania o limitach Umiejętności — zostają wartości domyślne")
    return limits


def parse_skill_points(chapter: str) -> int:
    flat = clean(chapter)
    match = re.search(r"dostają (\d+) punktów umiejętności", flat)
    if match is None:
        warn("Nie znalazłem puli punktów umiejętności — zostaje 86")
        return 86
    return int(match.group(1))


def parse_stat_ranks(chapter: str) -> list[dict]:
    """The „Ranga Postaci / Punkty Cech" table (s. 78)."""
    flat = clean(chapter)
    marker = "Ranga PostaciPunkty Cech"
    start = flat.find(marker)
    if start == -1:
        warn("Nie znalazłem tabeli rang Postaci — zostaje sama Postać początkująca")
        return [{"id": "starting", "name": "Postać początkująca", "points": 62}]
    tail = flat[start + len(marker) : start + len(marker) + 400]
    ranks: list[dict] = []
    for name, points in re.findall(r"([A-ZŻŹĆĄŚĘŁÓŃ][^0-9]*?)\s(\d{2})(?=\s|$)", tail):
        label = name.strip()
        if not label:
            continue
        ranks.append({"id": rank_id(label), "name": label, "points": int(points)})
        if len(ranks) == 5:
            break
    if len(ranks) != 5:
        warn(f"Rang Postaci: {len(ranks)}, oczekiwane 5")
    return ranks


RANK_IDS = {
    "Podrzędna postać tła": "minor-background",
    "Postać początkująca": "starting",
    "Ważna postać tła": "major-background",
    "Podrzędny bohater": "minor-hero",
    "Znaczący bohater": "major-hero",
}


def rank_id(label: str) -> str:
    return RANK_IDS.get(label, re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-"))


def parse_role_ability_start(chapter: str) -> int:
    flat = clean(chapter)
    match = re.search(r"Zdolności Specjalnej swojej Roli na (\d+)", flat)
    if match is None:
        warn("Nie znalazłem startowego poziomu Zdolności Specjalnej — zostaje 4")
        return 4
    return int(match.group(1))


def free_language(chapter: str) -> dict | None:
    """The Culture of Origin language: one skill, free, at level 4.

    Which language it is comes from the lifepath table (stage 25b); the sheet
    has one „Język" row and no place for the specialisation, so 25a only grants
    the level.
    """
    skill_id = SKILLS.get("Język")
    if skill_id is None:
        warn("Brak umiejętności „Język” w słowniku — darmowy język pominięty")
        return None
    flat = clean(chapter)
    match = re.search(r"zapisujesz jako Umiejętność na Poziomie (\d+)", flat)
    if match is None:
        warn("Nie znalazłem poziomu darmowego Języka — zostaje 4")
        return {"skillId": skill_id, "level": 4}
    return {"skillId": skill_id, "level": int(match.group(1))}


# ──────────────────────────────────── main ────────────────────────────────────


def main() -> int:
    roles_chapter = load_chapter(CHAPTER_ROLES)
    gear_chapter = load_chapter(CHAPTER_GEAR)
    overrides = load_overrides()
    lookup = skill_lookup()

    templates = parse_stat_templates(gear_chapter)
    basic = parse_basic_skills(gear_chapter, lookup)
    role_skills = parse_role_skills(gear_chapter, basic, overrides)
    limits = parse_limits(gear_chapter)

    roles = []
    for label, role_id in MANUAL_ROLE_NAMES.items():
        rows = templates.get(role_id, [])
        skills = role_skills.get(role_id, [])
        for row in rows:
            out_of_range = [value for value in row if not 1 <= value <= 10]
            if out_of_range:
                warn(f"Rola {label}: wartość Cechy poza zakresem {out_of_range}")
        unknown = [skill for skill in skills if skill not in SKILLS.values()]
        if unknown:
            warn(f"Rola {label}: nieznane umiejętności {unknown}")
        roles.append({"id": role_id, "statTemplates": rows, "skills": skills})

    payload = {
        "schemaVersion": SCHEMA_VERSION,
        "source": SOURCE,
        "statOrder": [STAT_IDS[abbr] for abbr in STAT_ORDER],
        "limits": limits,
        "skillPoints": parse_skill_points(gear_chapter),
        "statRanks": parse_stat_ranks(gear_chapter),
        "defaultStatRankId": "starting",
        "roleAbilityStart": parse_role_ability_start(roles_chapter),
        "basicSkills": basic,
        "freeLanguage": free_language(roles_chapter),
        "roles": roles,
    }
    write(CPRED_DIR / "creation.json", payload)

    complete = sum(1 for role in roles if len(role["statTemplates"]) == TEMPLATE_ROWS)
    listed = sum(1 for role in roles if len(role["skills"]) == SKILLS_PER_ROLE)
    print(f"Szablony Cech:      {complete}/{len(roles)} ról po {TEMPLATE_ROWS} rzutów")
    print(f"Listy umiejętności: {listed}/{len(roles)} ról po {SKILLS_PER_ROLE} pozycji")
    print(f"Podstawowe:         {len(basic)}")
    print(f"Pule:               Cechy {payload['statRanks']}, umiejętności {payload['skillPoints']}")
    if warnings:
        print(f"\nOstrzeżenia ({len(warnings)}):")
        for message in warnings:
            print(f"  ! {message}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
