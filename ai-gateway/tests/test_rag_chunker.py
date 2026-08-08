"""Chunker podręcznika.

Materiał w testach jest **wymyślony** — repozytorium jest publiczne, a treść
podręcznika objęta prawem autorskim (CLAUDE.md). Sprawdzamy kształt cięcia, nie
zawartość książki.
"""

from __future__ import annotations

from vtt_gateway.rag.chunker import chunk_markdown, estimate_tokens

MANUAL = """# Rozdział Testowy

> Notka wstępna rozdziału.

<!-- s. 10 -->

Akapit otwierający rozdział, jeszcze przed pierwszą sekcją.

## Pierwsza sekcja

Treść pierwszej sekcji.

### Podsekcja alfa

Treść podsekcji alfa.

<!-- s. 11 -->

Dalszy ciąg podsekcji alfa, już na następnej stronie.

## Druga sekcja

| Kolumna A | Kolumna B |
| --------- | --------- |
| wartość 1 | wartość 2 |

Akapit pod tabelą.
"""


def test_naglowek_zaczyna_nowy_fragment() -> None:
    chunks = chunk_markdown(MANUAL, target_tokens=1000)
    sections = [chunk.section for chunk in chunks]
    assert sections == [
        "",
        "Pierwsza sekcja",
        "Pierwsza sekcja › Podsekcja alfa",
        "Druga sekcja",
    ]
    assert {chunk.chapter for chunk in chunks} == {"Rozdział Testowy"}


def test_numer_strony_jedzie_z_fragmentem() -> None:
    chunks = chunk_markdown(MANUAL, target_tokens=1000)
    alfa = next(chunk for chunk in chunks if chunk.section.endswith("Podsekcja alfa"))
    # Podsekcja zaczyna się na 10, kończy na 11 — cytat musi pokazać zakres.
    assert (alfa.page, alfa.page_end) == (10, 11)
    assert alfa.citation == "Rozdział Testowy › Pierwsza sekcja › Podsekcja alfa (s. 10–11)"


def test_fragment_niesie_swoja_sciezke_w_tresci() -> None:
    """Embedding i FTS mają widzieć temat, nie sam akapit wyrwany z kontekstu."""
    chunks = chunk_markdown(MANUAL, target_tokens=1000)
    first = chunks[1]
    assert first.text.startswith("Rozdział Testowy › Pierwsza sekcja (s. 10)")
    assert "Treść pierwszej sekcji." in first.text


def test_tabela_zostaje_w_calosci() -> None:
    chunks = chunk_markdown(MANUAL, target_tokens=1000)
    table_chunk = next(chunk for chunk in chunks if "Kolumna A" in chunk.text)
    assert "| wartość 1 | wartość 2 |" in table_chunk.text
    assert table_chunk.text.count("| --------- |") == 1


def test_dluga_sekcja_dzieli_sie_z_zakladka() -> None:
    body = "\n\n".join(f"Zdanie numer {index} w długiej sekcji." for index in range(40))
    markdown = f"# Rozdział\n\n<!-- s. 5 -->\n\n## Długa sekcja\n\n{body}\n"
    chunks = chunk_markdown(markdown, target_tokens=80, overlap_tokens=30)

    assert len(chunks) > 2
    assert all(chunk.section == "Długa sekcja" for chunk in chunks)
    # Zakładka: koniec fragmentu N musi wrócić na początku fragmentu N+1.
    tail = chunks[0].text.strip().splitlines()[-1]
    assert tail in chunks[1].text


def test_tabela_wieksza_od_budzetu_nie_jest_ciachana() -> None:
    rows = "\n".join(f"| pozycja {index} | {index * 3} |" for index in range(60))
    markdown = f"# Rozdział\n\n## Tabela\n\n| Nazwa | Liczba |\n| --- | --- |\n{rows}\n"
    chunks = chunk_markdown(markdown, target_tokens=50)

    table_chunks = [chunk for chunk in chunks if "pozycja 0" in chunk.text]
    assert len(table_chunks) == 1
    assert "pozycja 59" in table_chunks[0].text


def test_liczenie_tokenow_da_sie_podmienic() -> None:
    """Indekser wstrzykuje prawdziwy tokenizer modelu — heurystyka jest domyślna."""
    calls: list[str] = []

    def counter(text: str) -> int:
        calls.append(text)
        return 1

    chunks = chunk_markdown(MANUAL, count_tokens=counter)
    assert calls
    assert all(chunk.tokens == 1 for chunk in chunks)


def test_heurystyka_dlugosci_jest_dodatnia() -> None:
    assert estimate_tokens("") == 1
    assert estimate_tokens("a" * 360) == 100
