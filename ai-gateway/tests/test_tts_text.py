"""Normalizacja tekstu i budowa znaczników ujawniania."""

from __future__ import annotations

from vtt_gateway.tts.text import normalize_for_speech, number_to_words
from vtt_gateway.tts.timing import build_reveal


def spoken(text: str) -> str:
    return normalize_for_speech(text).spoken


def test_liczebniki_po_polsku() -> None:
    assert number_to_words(0) == "zero"
    assert number_to_words(12) == "dwanaście"
    assert number_to_words(21) == "dwadzieścia jeden"
    assert number_to_words(250) == "dwieście pięćdziesiąt"
    assert number_to_words(1000) == "tysiąc"
    assert number_to_words(2137) == "dwa tysiące sto trzydzieści siedem"
    assert number_to_words(5000) == "pięć tysięcy"
    assert number_to_words(1_000_000) == "milion"


def test_liczby_w_zdaniu_rozwijaja_sie() -> None:
    assert spoken("Za 250 eddiesów.") == "Za dwieście pięćdziesiąt eddiesów."


def test_skroty_mechaniki_czytane_literami() -> None:
    assert spoken("DV wynosi 15") == "de fau wynosi piętnaście"
    assert spoken("Masz 12 PW") == "Masz dwanaście pe wu"


def test_notacja_kosci() -> None:
    assert spoken("rzuć 1k10") == "rzuć jeden ka dziesięć"
    assert spoken("2d6 obrażeń") == "dwa ka sześć obrażeń"


def test_emoji_i_markdown_nie_ida_do_mowy() -> None:
    assert spoken("**Chodź** tu 🔥") == "Chodź tu"


def test_interpunkcja_zostaje_przy_slowie() -> None:
    # Kropka i przecinek niosą intonację — silnik musi je dostać.
    assert spoken("Nie! Nie ruszaj tego?") == "Nie! Nie ruszaj tego?"


def test_tokeny_wskazuja_na_tekst_widoczny() -> None:
    speech = normalize_for_speech("Za 250 eddiesów")
    display_tokens = [speech.display[token.start : token.end] for token in speech.tokens]
    assert display_tokens == ["Za", "250", "eddiesów"]
    # Jedno widoczne słowo „250" to dwa słowa mówione.
    assert speech.tokens[1].spoken_words == ("dwieście", "pięćdziesiąt")
    assert speech.spoken_word_count == 4


def test_reveal_z_alignmentu_idzie_slowo_po_slowie() -> None:
    speech = normalize_for_speech("Chodź tu zaraz")
    times = [(0.0, 0.4), (0.4, 0.6), (0.6, 1.2)]
    points = build_reveal(speech, times, duration_ms=1200)

    assert [point.chars for point in points] == [5, 8, 14]
    assert [point.ms for point in points] == [0, 400, 600]
    assert points[-1].chars == len(speech.display)


def test_reveal_bez_alignmentu_szacuje_i_nie_cofa_sie() -> None:
    speech = normalize_for_speech("Arasaka nie wybacza nikomu.")
    points = build_reveal(speech, None, duration_ms=3000)

    assert [point.chars for point in points] == [7, 11, 19, 27]
    assert all(
        earlier.ms < later.ms and earlier.chars < later.chars
        for earlier, later in zip(points, points[1:], strict=False)
    )
    assert points[-1].ms <= 3000


def test_reveal_gdy_silnik_podzielil_tekst_inaczej() -> None:
    """Liczba słów z silnika nie zgadza się z naszą — rozciągamy zamiast rozjeżdżać."""
    speech = normalize_for_speech("Za 250 eddiesów")  # 4 słowa mówione
    points = build_reveal(speech, [(0.0, 1.0), (1.0, 2.0)], duration_ms=2000)

    assert [point.chars for point in points] == [2, 6, 15]
    assert points[0].ms == 0
    assert points[-1].ms <= 2000


def test_sam_emoji_nie_wywraca_budowania() -> None:
    speech = normalize_for_speech("🔥🔥")
    assert speech.spoken == ""
    points = build_reveal(speech, None, duration_ms=0)
    assert points == [type(points[0])(ms=0, chars=2)]
