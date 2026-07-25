"""Normalizacja tekstu przed syntezą.

Silnik czyta dosłownie to, co dostanie: „DV 15" wyjdzie jako „de-fau piętnaście"
tylko wtedy, gdy sami to rozwiniemy, a „1k10" bez pomocy zabrzmi jak angielskie
„one kay ten". Przy okazji rozwiązujemy drugi problem: **tekst mówiony i tekst
pokazywany na czacie to nie to samo**. Gracz widzi „250 eddiesów", a bot mówi
„dwieście pięćdziesiąt eddiesów" (dwa słowa zamiast jednego). Żeby dało się
ujawniać tekst w rytmie mowy, każdy widoczny token pamięta, ile słów mówionych
mu odpowiada — resztę robi `timing.py`.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

# Skróty czytane po polsku literami — tak, jak mówi się je przy stole
# („de-fau piętnaście", „pe-wu dwanaście"). Klucz jest porównywany bez zmiany
# wielkości liter, ale tylko dla tokenów zapisanych WERSALIKAMI.
DEFAULT_ABBREVIATIONS: dict[str, str] = {
    "PW": "pe wu",
    "DV": "de fau",
    "SP": "es pe",
    "NPC": "en pe ce",
    "MG": "em gie",
    "HP": "ha pe",
    "AI": "a i",
    "SI": "es i",
    "REF": "ref",
    "INT": "int",
    "EMP": "emp",
    "TECH": "tech",
    "BC": "be ce",
    "SW": "es wu",
    "ZW": "ze wu",
    "CHA": "cha",
    "SZ": "es zet",
    "RUCH": "ruch",
    "AV": "a fau",
    "EB": "eurodolarów",
}

_UNITS = [
    "zero", "jeden", "dwa", "trzy", "cztery", "pięć", "sześć", "siedem", "osiem", "dziewięć",
    "dziesięć", "jedenaście", "dwanaście", "trzynaście", "czternaście", "piętnaście",
    "szesnaście", "siedemnaście", "osiemnaście", "dziewiętnaście",
]
_TENS = [
    "", "", "dwadzieścia", "trzydzieści", "czterdzieści", "pięćdziesiąt",
    "sześćdziesiąt", "siedemdziesiąt", "osiemdziesiąt", "dziewięćdziesiąt",
]
_HUNDREDS = [
    "", "sto", "dwieście", "trzysta", "czterysta", "pięćset",
    "sześćset", "siedemset", "osiemset", "dziewięćset",
]

# Token widoczny na czacie: słowo albo znak interpunkcyjny wraz z tym, co po nim.
_TOKEN_RE = re.compile(r"\S+")
_DICE_RE = re.compile(r"^(\d+)[kdKD](\d+)$")
_NUMBER_RE = re.compile(r"\d+")
_MARKDOWN_RE = re.compile(r"[*_`~#>]+")


@dataclass(frozen=True)
class SpeechToken:
    """Fragment widocznego tekstu razem z jego odpowiednikiem w mowie."""

    display: str
    start: int
    """Offset początku w tekście widocznym."""
    end: int
    """Offset końca w tekście widocznym (ekskluzywnie)."""
    spoken_words: tuple[str, ...]
    """Słowa, na które token rozpada się w mowie (puste = token niemy, np. emoji)."""


@dataclass
class SpeechText:
    display: str
    spoken: str
    tokens: list[SpeechToken] = field(default_factory=list)

    @property
    def spoken_word_count(self) -> int:
        return sum(len(token.spoken_words) for token in self.tokens)


def number_to_words(value: int) -> str:
    """Liczebnik główny w mianowniku (0–999 999 999). Poza zakresem: cyfra po cyfrze."""
    if value < 0:
        return "minus " + number_to_words(-value)
    if value < 20:
        return _UNITS[value]
    if value < 100:
        tens, rest = divmod(value, 10)
        return _TENS[tens] + (f" {_UNITS[rest]}" if rest else "")
    if value < 1000:
        hundreds, rest = divmod(value, 100)
        return _HUNDREDS[hundreds] + (f" {number_to_words(rest)}" if rest else "")
    if value < 1_000_000:
        thousands, rest = divmod(value, 1000)
        head = _thousands_phrase(thousands)
        return head + (f" {number_to_words(rest)}" if rest else "")
    if value < 1_000_000_000:
        millions, rest = divmod(value, 1_000_000)
        head = _millions_phrase(millions)
        return head + (f" {number_to_words(rest)}" if rest else "")
    return " ".join(_UNITS[int(digit)] for digit in str(value))


def _thousands_phrase(count: int) -> str:
    if count == 1:
        return "tysiąc"
    return f"{number_to_words(count)} {_plural(count, 'tysiące', 'tysięcy')}"


def _millions_phrase(count: int) -> str:
    if count == 1:
        return "milion"
    return f"{number_to_words(count)} {_plural(count, 'miliony', 'milionów')}"


def _plural(count: int, few: str, many: str) -> str:
    """Polska liczba mnoga: 2–4 (poza 12–14) → `few`, reszta → `many`."""
    last, last_two = count % 10, count % 100
    if 2 <= last <= 4 and not 12 <= last_two <= 14:
        return few
    return many


def _is_speakable(char: str) -> bool:
    """Emoji i symbole graficzne wypadają z mowy — silnik i tak by je przemilczał
    albo (gorzej) odczytał nazwę znaku."""
    if char.isalnum() or char.isspace():
        return True
    category = unicodedata.category(char)
    return category.startswith("P")  # interpunkcja zostaje, So/Sk/Sm (emoji, symbole) nie


def _spoken_words_for(raw: str, abbreviations: dict[str, str]) -> tuple[str, ...]:
    """Zamienia jeden widoczny token na słowa do wypowiedzenia."""
    cleaned = _MARKDOWN_RE.sub("", raw)
    cleaned = "".join(char for char in cleaned if _is_speakable(char))
    if not cleaned.strip():
        return ()

    # Interpunkcja trzyma się słowa (jest nośnikiem intonacji i pauzy).
    core = cleaned.strip()
    lead = core[: len(core) - len(core.lstrip(".,!?…:;-—\"'()"))]
    tail = core[len(core.rstrip(".,!?…:;-—\"'()")) :]
    body = core[len(lead) : len(core) - len(tail)]

    if not body:
        # Sam znak interpunkcyjny — dokleja się do poprzedniego słowa przez `spoken`,
        # ale własnym słowem nie jest.
        return (core,) if core else ()

    dice = _DICE_RE.match(body)
    if dice:
        count, sides = int(dice.group(1)), int(dice.group(2))
        expanded = f"{number_to_words(count)} ka {number_to_words(sides)}"
    elif body.isupper() and body in abbreviations:
        expanded = abbreviations[body]
    elif _NUMBER_RE.fullmatch(body):
        expanded = number_to_words(int(body))
    elif _NUMBER_RE.search(body):
        expanded = _NUMBER_RE.sub(lambda m: f" {number_to_words(int(m.group()))} ", body)
    else:
        expanded = body

    words = [word for word in expanded.split() if word]
    if not words:
        return ()
    words[0] = lead + words[0]
    words[-1] = words[-1] + tail
    return tuple(words)


def normalize_for_speech(
    text: str, abbreviations: dict[str, str] | None = None
) -> SpeechText:
    """Rozbija tekst na tokeny widoczne i buduje z nich tekst do syntezy."""
    table = {**DEFAULT_ABBREVIATIONS, **(abbreviations or {})}
    tokens: list[SpeechToken] = []
    spoken_parts: list[str] = []

    for match in _TOKEN_RE.finditer(text):
        raw = match.group()
        words = _spoken_words_for(raw, table)
        tokens.append(
            SpeechToken(display=raw, start=match.start(), end=match.end(), spoken_words=words)
        )
        spoken_parts.extend(words)

    return SpeechText(display=text, spoken=" ".join(spoken_parts), tokens=tokens)
