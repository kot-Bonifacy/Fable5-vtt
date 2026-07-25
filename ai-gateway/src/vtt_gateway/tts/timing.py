"""Znaczniki czasu: kiedy który fragment tekstu ma się pojawić na czacie.

Wypowiedź bota z włączonym głosem nie pojawia się na czacie w całości — dopisuje
się słowo po słowie w rytmie mowy, jakby ktoś przy stole zapisywał to, co NPC
mówi. Kontrakt z klientem jest celowo prymitywny: lista punktów
`{ms, chars}` = „w tej milisekundzie widocznych jest tyle pierwszych znaków".
Klient nie musi wiedzieć nic o fonemach, a wyciszony gracz odtwarza ten sam
rytm bez dźwięku.

Źródło czasów zależy od silnika:
- Piper wystawia alignment fonemów (dokładne granice słów),
- silniki bez alignmentu dostają estymację sylabiczną — błąd nie kumuluje się,
  bo syntezujemy zdaniami i każde zdanie jest kotwicą.
"""

from __future__ import annotations

from dataclasses import dataclass

from .text import SpeechText

_VOWELS = set("aąeęioóuyáàâäåæéèêëíìîïòôöøúùûüAĄEĘIOÓUYÁÀÂÄÅÆÉÈÊËÍÌÎÏÒÔÖØÚÙÛÜ")
_PAUSE_CHARS = set(".!?…:;,")


@dataclass(frozen=True)
class RevealPoint:
    ms: int
    chars: int


def syllable_weight(word: str) -> float:
    """Przybliżona długość słowa w mowie: liczba samogłosek + narzut na pauzę."""
    vowels = sum(1 for char in word if char in _VOWELS)
    weight = float(max(vowels, 1))
    if word and word[-1] in _PAUSE_CHARS:
        weight += 1.2 if word[-1] in ".!?…" else 0.5
    return weight


def build_reveal(
    speech: SpeechText,
    word_times: list[tuple[float, float]] | None,
    duration_ms: int,
) -> list[RevealPoint]:
    """Buduje punkty ujawniania tekstu.

    `word_times` to czasy (start, koniec) w sekundach dla kolejnych **słów
    mówionych**; None = brak alignmentu, szacujemy z wag sylabicznych.
    Słowo ujawnia się w chwili, gdy zaczyna być wypowiadane — dzięki temu tekst
    nigdy nie zostaje w tyle za dźwiękiem.
    """
    speakable = [token for token in speech.tokens if token.spoken_words]
    if not speakable:
        return [RevealPoint(ms=0, chars=len(speech.display))]

    starts_ms = _word_start_times(speech, word_times, duration_ms)

    points: list[RevealPoint] = []
    consumed = 0
    for token in speakable:
        start_ms = starts_ms[consumed] if consumed < len(starts_ms) else duration_ms
        consumed += len(token.spoken_words)
        chars = token.end
        if points and points[-1].chars >= chars:
            continue
        if points and start_ms <= points[-1].ms:
            start_ms = points[-1].ms + 1
        points.append(RevealPoint(ms=min(start_ms, duration_ms), chars=chars))

    if points[-1].chars < len(speech.display):
        points.append(RevealPoint(ms=duration_ms, chars=len(speech.display)))
    return points


def _word_start_times(
    speech: SpeechText,
    word_times: list[tuple[float, float]] | None,
    duration_ms: int,
) -> list[int]:
    """Czas startu każdego słowa mówionego, w milisekundach."""
    spoken_words = [word for token in speech.tokens for word in token.spoken_words]

    if word_times and len(word_times) == len(spoken_words):
        return [int(start * 1000) for start, _ in word_times]

    if word_times:
        # Silnik podzielił tekst inaczej, niż my policzyliśmy słowa (np. rozwinął
        # skrót po swojemu). Rozciągamy dostępne czasy proporcjonalnie zamiast
        # ryzykować rozjazd o kilka słów.
        scale = len(word_times) / len(spoken_words)
        return [int(word_times[min(int(index * scale), len(word_times) - 1)][0] * 1000)
                for index in range(len(spoken_words))]

    weights = [syllable_weight(word) for word in spoken_words]
    total = sum(weights) or 1.0
    starts: list[int] = []
    elapsed = 0.0
    for weight in weights:
        starts.append(int(elapsed / total * duration_ms))
        elapsed += weight
    return starts
