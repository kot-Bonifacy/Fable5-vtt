"""Endpointy `/rag/*` — na atrapie embeddera, bez pobierania modelu."""

from __future__ import annotations

import httpx
import pytest
from asgi_lifespan import LifespanManager

from tests.fake_embedder import FakeEmbedder
from tests.test_app import FakeLlama, _settings
from vtt_gateway.app import create_app
from vtt_gateway.rag.service import RagService

ROZDZIAL = """# Zasady Testowe

<!-- s. 7 -->

## Ablacja pancerza

Po każdym trafieniu wartość pancerza spada o jeden punkt.

## Odskok

Postać z wysokim refleksem może odskoczyć od wybuchu.
"""


@pytest.fixture
async def client(tmp_path):
    settings = _settings(
        rag_enabled=True,
        rag_db_path=tmp_path / "rag.sqlite3",
        rag_rulebook_dir=tmp_path / "manual",
        rag_top_k=3,
    )
    llama = FakeLlama()
    app = create_app(
        settings,
        client_factory=lambda: httpx.AsyncClient(transport=httpx.MockTransport(llama.handler)),
    )
    async with LifespanManager(app):
        # Embedder podmieniamy po starcie — prawdziwy chciałby 2 GB wag z HuggingFace.
        rag = RagService(settings, embedder=FakeEmbedder())  # type: ignore[arg-type]
        rag.spec = FakeEmbedder.spec
        app.state.rag = rag
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as http:
            yield http, app
        rag.close()


async def index_chapter(http: httpx.AsyncClient) -> httpx.Response:
    return await http.post(
        "/rag/index",
        json={
            "collection": "rulebook",
            "documents": [{"source": "01-zasady.md", "text": ROZDZIAL}],
        },
    )


async def test_status_pustego_indeksu(client) -> None:
    http, _app = client
    body = (await http.get("/rag/status")).json()

    assert body["enabled"] is True
    assert body["device"] == "cpu"
    assert body["collections"] == []
    assert body["indexing"]["running"] is False


async def test_indeksowanie_i_wyszukiwanie(client) -> None:
    http, _app = client

    indexed = await index_chapter(http)
    assert indexed.status_code == 200
    assert indexed.json()["documents"] == 1
    assert indexed.json()["chunks"] == 2

    found = await http.post("/rag/search", json={"query": "ablacja pancerza"})
    assert found.status_code == 200
    body = found.json()
    hit = body["hits"][0]
    assert hit["section"] == "Ablacja pancerza"
    assert hit["page"] == 7
    assert hit["source"] == "01-zasady.md"
    assert "spada o jeden punkt" in hit["text"]


async def test_zdrowie_pokazuje_rag_bez_vram(client) -> None:
    """Kryterium etapu: embeddingi nie zajmują karty — `/health` ma to mówić wprost."""
    http, _app = client
    await index_chapter(http)

    rag = (await http.get("/health")).json()["rag"]
    assert rag["enabled"] is True
    assert rag["ready"] is True
    assert rag["device"] == "cpu"
    assert rag["chunks"] == 2


async def test_zdrowie_mowi_ze_indeks_jest_pusty(client) -> None:
    http, _app = client
    rag = (await http.get("/health")).json()["rag"]
    assert rag["enabled"] is True
    # Silnik działa, ale nie ma czego szukać — UI musi je rozróżnić.
    assert rag["ready"] is False
    assert rag["chunks"] == 0


async def test_usuniecie_kolekcji(client) -> None:
    http, _app = client
    await index_chapter(http)

    removed = await http.delete("/rag/collections/rulebook")
    assert removed.json() == {"removed": 2}
    assert (await http.get("/rag/status")).json()["collections"] == []


async def test_indeksowanie_podrecznika_z_lokalnego_katalogu(client, tmp_path) -> None:
    """Treść podręcznika nie przechodzi przez sieć — gateway czyta ją z dysku."""
    http, app = client
    manual = tmp_path / "manual"
    manual.mkdir()
    (manual / "01-zasady.md").write_text(ROZDZIAL, encoding="utf-8")

    started = await http.post("/rag/index/rulebook")
    assert started.status_code == 202
    await app.state.rag_task

    status = (await http.get("/rag/status")).json()
    assert status["collections"][0]["name"] == "rulebook"
    assert status["collections"][0]["chunks"] == 2
    assert status["indexing"]["error"] is None


async def test_brak_katalogu_podrecznika_nie_wywraca_gatewaya(client) -> None:
    http, app = client
    assert (await http.post("/rag/index/rulebook")).status_code == 202
    await app.state.rag_task

    status = (await http.get("/rag/status")).json()
    assert "nie znaleziono katalogu" in (status["indexing"]["error"] or "")
    assert status["collections"] == []


async def test_wylaczony_rag_odmawia_wyszukiwania(tmp_path) -> None:
    settings = _settings(rag_enabled=False, rag_db_path=tmp_path / "rag.sqlite3")
    llama = FakeLlama()
    app = create_app(
        settings,
        client_factory=lambda: httpx.AsyncClient(transport=httpx.MockTransport(llama.handler)),
    )
    async with LifespanManager(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as http:
            assert (await http.get("/health")).json()["rag"]["enabled"] is False
            refused = await http.post("/rag/search", json={"query": "cokolwiek"})
            assert refused.status_code == 503
            assert "GATEWAY_RAG_ENABLED" in refused.json()["detail"]
