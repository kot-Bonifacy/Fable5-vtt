"""Endpointy TTS — na podstawionym silniku, bez dotykania modeli na dysku."""

from __future__ import annotations

import base64

import httpx
import pytest
from asgi_lifespan import LifespanManager

from tests.test_app import FakeLlama, _settings
from vtt_gateway.app import create_app
from vtt_gateway.tts.base import (
    SynthesisParams,
    TtsEngine,
    TtsError,
    TtsResult,
    VoiceInfo,
    wav_bytes,
)
from vtt_gateway.tts.manager import TtsManager
from vtt_gateway.tts.timing import RevealPoint


class FakeEngine(TtsEngine):
    name = "fake"

    def __init__(self, *, available: bool = True, fail: bool = False) -> None:
        self._available = available
        self._fail = fail
        self._loaded = False
        self.calls: list[tuple[str, str, SynthesisParams]] = []

    @property
    def available(self) -> bool:
        return self._available

    @property
    def loaded(self) -> bool:
        return self._loaded

    def voices(self) -> list[VoiceInfo]:
        return [VoiceInfo(id="testowy", name="Testowy", engine=self.name, sample_rate=22050)]

    def synthesize(self, text: str, voice: str, params: SynthesisParams) -> TtsResult:
        self.calls.append((text, voice, params))
        if self._fail:
            raise TtsError("silnik padł")
        self._loaded = True
        pcm = b"\x00\x00" * 2205  # 0,1 s ciszy
        return TtsResult(
            audio=wav_bytes(pcm, 22050),
            sample_rate=22050,
            duration_ms=100,
            reveal=[RevealPoint(ms=0, chars=len(text))],
            engine=self.name,
            voice=voice,
            spoken_text=text,
        )

    def unload(self) -> None:
        self._loaded = False


@pytest.fixture
async def client_with(tmp_path):
    """Gateway z podstawionym silnikiem mowy i podstawionym llama-server.

    Prawdziwy `httpx.AsyncClient` jest tu pułapką: supervisor pinguje wtedy
    `127.0.0.1:8080`, więc test zależy od tego, czy akurat działa llama-server,
    a zamykanie aplikacji potrafi zawisnąć na otwartym połączeniu.
    """
    started: list[tuple] = []

    async def _make(engine: TtsEngine):
        settings = _settings(tts_samples_dir=tmp_path / "samples")
        llama = FakeLlama()
        app = create_app(
            settings,
            client_factory=lambda: httpx.AsyncClient(
                transport=httpx.MockTransport(llama.handler)
            ),
        )
        manager = LifespanManager(app)
        await manager.__aenter__()
        # Silnik podmieniamy po starcie — fabryka wybrałaby prawdziwego Pipera.
        app.state.tts = TtsManager(settings, engine=engine)
        client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        )
        started.append((client, manager))
        return client, app, manager

    yield _make

    for client, manager in started:
        await client.aclose()
        await manager.__aexit__(None, None, None)


async def test_synteza_zwraca_audio_i_znaczniki(client_with) -> None:
    client, _app, _manager = await client_with(FakeEngine())
    response = await client.post("/tts", json={"text": "Chodź tu", "voice": "testowy"})
    assert response.status_code == 200
    body = response.json()
    assert base64.b64decode(body["audio_base64"]).startswith(b"RIFF")
    assert body["duration_ms"] == 100
    assert body["reveal"] == [{"ms": 0, "chars": 8}]
    assert body["engine"] == "fake"


async def test_silnik_niedostepny_daje_503(client_with) -> None:
    client, _app, _manager = await client_with(FakeEngine(available=False))
    response = await client.post("/tts", json={"text": "Cokolwiek"})
    assert response.status_code == 503


async def test_blad_syntezy_daje_503_a_nie_wyjatek(client_with) -> None:
    client, _app, _manager = await client_with(FakeEngine(fail=True))
    response = await client.post("/tts", json={"text": "Cokolwiek"})
    assert response.status_code == 503
    assert "padł" in response.json()["detail"]


async def test_za_dlugi_tekst_odrzucony(client_with) -> None:
    client, _app, _manager = await client_with(FakeEngine())
    response = await client.post("/tts", json={"text": "a" * 5000})
    assert response.status_code == 503
    assert "za długi" in response.json()["detail"]


async def test_nieznana_probka_glosu_daje_409(client_with) -> None:
    client, _app, _manager = await client_with(FakeEngine())
    response = await client.post(
        "/tts", json={"text": "Chodź", "reference_id": "nieznana-probka-123"}
    )
    assert response.status_code == 409


async def test_probka_zapisuje_sie_i_jest_pamietana(client_with) -> None:
    engine = FakeEngine()
    client, _app, _manager = await client_with(engine)
    sample = base64.b64encode(wav_bytes(b"\x00\x00" * 100, 22050)).decode()
    first = await client.post(
        "/tts",
        json={"text": "Chodź", "reference_id": "probka-abc12345",
              "reference_audio_base64": sample},
    )
    assert first.status_code == 200
    # Drugie żądanie bez danych — gateway ma już próbkę u siebie.
    second = await client.post(
        "/tts", json={"text": "Chodź", "reference_id": "probka-abc12345"}
    )
    assert second.status_code == 200
    assert engine.calls[-1][2].reference_audio is not None


async def test_probka_musi_byc_wavem(client_with) -> None:
    client, _app, _manager = await client_with(FakeEngine())
    response = await client.post(
        "/tts",
        json={
            "text": "Chodź",
            "reference_id": "probka-xyz98765",
            "reference_audio_base64": base64.b64encode(b"to nie jest wav").decode(),
        },
    )
    assert response.status_code == 400


async def test_health_i_lista_glosow_pokazuja_silnik(client_with) -> None:
    client, _app, _manager = await client_with(FakeEngine())
    health = (await client.get("/health")).json()
    assert health["tts"]["engine"] == "fake"
    assert health["tts"]["available"] is True
    assert health["tts"]["loaded"] is False

    voices = (await client.get("/tts/voices")).json()
    assert voices["engine"] == "fake"
    assert [voice["id"] for voice in voices["voices"]] == ["testowy"]

    await client.post("/tts", json={"text": "Chodź"})
    health_after = (await client.get("/health")).json()
    assert health_after["tts"]["loaded"] is True
    assert health_after["tts"]["syntheses"] == 1
