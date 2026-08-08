"""Magazyn fragmentów i wyszukiwanie hybrydowe."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from vtt_gateway.config import Settings
from vtt_gateway.rag.service import RagDocument, RagError, RagService
from vtt_gateway.rag.store import RagStore, SearchFilter, fts_query

from .fake_embedder import FakeEmbedder

ROZDZIAL = """# Zasady Testowe

<!-- s. 3 -->

## Ablacja pancerza

Po każdym trafieniu wartość pancerza spada o jeden punkt.

## Uniki i zasłony

Postać może zejść z linii strzału, korzystając z przeszkody terenowej.
"""

DRUGI = """# Ekwipunek Testowy

<!-- s. 40 -->

## Kamizelka

Kamizelka daje ochronę, którą trzeba naprawiać u rusznikarza.
"""


def make_service(tmp_path: Path, **overrides: object) -> RagService:
    settings = Settings(
        rag_db_path=tmp_path / "rag.sqlite3",
        rag_model="bge-m3",
        rag_chunk_tokens=200,
        rag_chunk_overlap=20,
        rag_top_k=3,
        **overrides,  # type: ignore[arg-type]
    )
    service = RagService(settings, embedder=FakeEmbedder())  # type: ignore[arg-type]
    # Atrapa udaje skonfigurowany model, żeby kontrola zgodności nie wywalała testów.
    service.spec = FakeEmbedder.spec
    return service


async def index(service: RagService, *documents: tuple[str, str]) -> None:
    await service.index_documents(
        "rulebook",
        [RagDocument(source=source, text=text) for source, text in documents],
    )


# --- zapytanie pełnotekstowe -------------------------------------------------


def test_fts_query_przycina_koncowki_fleksyjne() -> None:
    """Polski nie ma stemmera w FTS5 — „ablacja" i „ablację" muszą trafić w to samo."""
    assert fts_query("ablacja") == fts_query("ablację") == "abla*"
    assert "panc" in fts_query("co robi pancerz")


def test_fts_query_pomija_krotkie_slowa_i_puste_pytania() -> None:
    assert fts_query("") == ""
    assert fts_query("a i w") == ""


# --- magazyn -----------------------------------------------------------------


def test_ponowne_indeksowanie_nie_dubluje(tmp_path: Path) -> None:
    store = RagStore(tmp_path / "rag.sqlite3")
    rows = [("Pierwszy fragment.", {"page": 1}, 3)]
    vectors = np.ones((1, 4), dtype=np.float32)

    store.replace_document("rulebook", "plik.md", "Plik", rows, vectors)
    store.replace_document("rulebook", "plik.md", "Plik", rows, vectors)

    stats = store.collections()
    assert [(item.name, item.documents, item.chunks) for item in stats] == [("rulebook", 1, 1)]
    # Kopia w indeksie pełnotekstowym też ma być jedna.
    assert len(store.search_fts("rulebook", "pierw*", 10)) == 1
    store.close()


def test_usuniecie_kolekcji_czysci_takze_fts(tmp_path: Path) -> None:
    store = RagStore(tmp_path / "rag.sqlite3")
    store.replace_document(
        "rulebook", "plik.md", "Plik", [("Fragment o pancerzu.", {}, 3)], None
    )
    assert store.delete_collection("rulebook") == 1
    assert store.collections() == []
    assert store.search_fts("rulebook", "pancer*", 10) == []
    store.close()


# --- wyszukiwanie ------------------------------------------------------------


async def test_wyszukiwanie_zwraca_cytat_z_metadanymi(tmp_path: Path) -> None:
    service = make_service(tmp_path)
    await index(service, ("01-zasady.md", ROZDZIAL))

    hits = await service.search("ablacja pancerza")

    assert hits
    best = hits[0]
    assert best.chapter == "Zasady Testowe"
    assert best.section == "Ablacja pancerza"
    assert best.page == 3
    assert best.source == "01-zasady.md"
    service.close()


async def test_pelny_tekst_dociaga_to_czego_wektory_nie_znajduja(tmp_path: Path) -> None:
    """Kluczowy test hybrydy: atrapa embeddera nie zna semantyki, więc trafienie w
    nazwę własną zasady może przyjść WYŁĄCZNIE z części pełnotekstowej."""
    service = make_service(tmp_path)
    await index(service, ("01-zasady.md", ROZDZIAL), ("02-ekwipunek.md", DRUGI))

    hits = await service.search("ablacja")

    assert hits[0].section == "Ablacja pancerza"
    assert hits[0].fts_rank == 1
    service.close()


async def test_puste_pytanie_nie_szuka(tmp_path: Path) -> None:
    service = make_service(tmp_path)
    await index(service, ("01-zasady.md", ROZDZIAL))
    assert await service.search("   ") == []
    service.close()


async def test_zmiana_modelu_uniewaznia_indeks(tmp_path: Path) -> None:
    service = make_service(tmp_path)
    await index(service, ("01-zasady.md", ROZDZIAL))
    assert not service.model_mismatch()

    # Ten sam plik bazy, inny model — wektory przestają być porównywalne.
    reopened = make_service(tmp_path)
    reopened.spec = FakeEmbedder.spec
    reopened.store.set_meta("embedding_model", "inny-model")

    assert reopened.model_mismatch()
    with pytest.raises(RagError, match="zaindeksuj ponownie"):
        await reopened.search("ablacja")

    # Ponowne indeksowanie czyści stare wektory i odblokowuje wyszukiwanie.
    await index(reopened, ("01-zasady.md", ROZDZIAL))
    assert not reopened.model_mismatch()
    assert await reopened.search("ablacja")
    service.close()
    reopened.close()


async def test_wylaczony_rag_mowi_dlaczego(tmp_path: Path) -> None:
    settings = Settings(rag_enabled=False, rag_db_path=tmp_path / "rag.sqlite3")
    service = RagService(settings)

    assert not service.enabled
    assert service.disabled_reason is not None
    with pytest.raises(RagError):
        await service.search("cokolwiek")
    assert service.status()["collections"] == []


async def test_status_liczy_fragmenty_i_dokumenty(tmp_path: Path) -> None:
    service = make_service(tmp_path)
    await index(service, ("01-zasady.md", ROZDZIAL), ("02-ekwipunek.md", DRUGI))

    status = service.status()
    collections = status["collections"]
    assert isinstance(collections, list) and len(collections) == 1
    assert collections[0]["name"] == "rulebook"
    assert collections[0]["documents"] == 2
    # Dwie sekcje w pierwszym rozdziale, jedna w drugim; sam nagłówek rozdziału
    # bez treści nie tworzy fragmentu.
    assert collections[0]["chunks"] == 3
    service.close()


# --- uprawnienia (etap 19b) --------------------------------------------------

WPIS_KLUB = """# Klub Afterlife

Bar w centrum, w którym solówki szukają zleceń.
"""

WPIS_GANG = """# Gang Maelstrom

Cybergang z Watson, poznawalny po chromie zamiast twarzy.
"""

WPIS_SEKRET = """# Kto sypie ekipę

Fixer Rogue sprzedaje ekipę korporacji.
"""


async def index_knowledge(service: RagService) -> None:
    await service.index_documents(
        "campaign",
        [
            RagDocument(
                source="entry:klub",
                text=WPIS_KLUB,
                title="Klub Afterlife",
                meta={"tags": ["miejsca"], "visibility": "bots"},
            ),
            RagDocument(
                source="entry:gang",
                text=WPIS_GANG,
                title="Gang Maelstrom",
                meta={"tags": ["gangi"], "visibility": "bots"},
            ),
            RagDocument(
                source="entry:sekret",
                text=WPIS_SEKRET,
                title="Kto sypie ekipę",
                meta={"tags": ["miejsca", "gangi"], "visibility": "gm"},
            ),
        ],
    )


async def test_filtr_tagow_odcina_wpis_spoza_uprawnien(tmp_path: Path) -> None:
    service = make_service(tmp_path)
    await index_knowledge(service)

    hits = await service.search(
        "gang",
        collection="campaign",
        filters=SearchFilter(tags_any=("miejsca",), visibility=("bots",)),
    )

    assert hits
    assert all("Maelstrom" not in hit.text for hit in hits)
    service.close()


async def test_filtr_widocznosci_nie_wypuszcza_sekretu_mg(tmp_path: Path) -> None:
    """Kryterium etapu: wpis „tylko MG" nie ma prawa trafić do promptu bota."""
    service = make_service(tmp_path)
    await index_knowledge(service)

    for bot in await service.search(
        "kto sypie ekipę",
        collection="campaign",
        filters=SearchFilter(visibility=("bots",)),
    ):
        assert "Rogue" not in bot.text

    # MG szuka bez filtra i sekret znajduje.
    gm = await service.search("kto sypie ekipę", collection="campaign")
    assert any("Rogue" in hit.text for hit in gm)
    service.close()


async def test_kolekcje_sa_rozlaczne(tmp_path: Path) -> None:
    service = make_service(tmp_path)
    await index(service, ("01-zasady.md", ROZDZIAL))
    await index_knowledge(service)

    # Atrapa embeddera nie zna semantyki, więc wyszukiwanie zawsze coś zwróci —
    # sprawdzamy, że z kolekcji podręcznika nie wypada ani jeden wpis kampanii.
    rulebook = await service.search("Afterlife", collection="rulebook")
    assert rulebook and all("Afterlife" not in hit.text for hit in rulebook)
    assert {stats.name for stats in service.store.collections()} == {"rulebook", "campaign"}
    service.close()


async def test_zapomnienie_wpisu_zabiera_go_z_indeksu(tmp_path: Path) -> None:
    service = make_service(tmp_path)
    await index_knowledge(service)

    assert service.delete_documents("campaign", ["entry:klub"]) > 0
    assert "entry:klub" not in service.collection_sources("campaign")
    left = await service.search("Afterlife", collection="campaign")
    assert all("Afterlife" not in hit.text for hit in left)
    service.close()


async def test_reindeks_wpisu_nie_dubluje_fragmentow(tmp_path: Path) -> None:
    service = make_service(tmp_path)
    await index_knowledge(service)
    before = service.store.collections()

    await index_knowledge(service)
    after = service.store.collections()

    assert [(item.name, item.documents, item.chunks) for item in before] == [
        (item.name, item.documents, item.chunks) for item in after
    ]
    service.close()


async def test_zmiana_wpisu_widac_bez_restartu(tmp_path: Path) -> None:
    """Kryterium etapu: wpis poprawiony w edytorze działa od razu."""
    service = make_service(tmp_path)
    await index_knowledge(service)

    await service.index_documents(
        "campaign",
        [
            RagDocument(
                source="entry:klub",
                text="# Klub Afterlife\n\nLokal spłonął w zeszłym tygodniu.\n",
                title="Klub Afterlife",
                meta={"tags": ["miejsca"], "visibility": "bots"},
            )
        ],
    )

    hits = await service.search("Afterlife", collection="campaign")
    assert any("spłonął" in hit.text for hit in hits)
    assert all("szukają zleceń" not in hit.text for hit in hits)
    service.close()
