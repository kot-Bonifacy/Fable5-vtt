from pathlib import Path

import httpx

from vtt_gateway.config import Settings
from vtt_gateway.supervisor import LlamaSupervisor


def _command(**overrides: object) -> list[str]:
    settings = Settings(
        llama_binary=Path("llama-server"),
        llama_model=Path("model.gguf"),
        **overrides,  # type: ignore[arg-type]
    )
    return LlamaSupervisor(settings, httpx.AsyncClient())._build_command()


def _arg(cmd: list[str], flag: str) -> str:
    return cmd[cmd.index(flag) + 1]


def test_prompt_cache_in_ram_is_capped_by_default() -> None:
    # Domyślne 8 GB llama-server dusiło PC razem z przeglądarkami E2E (T6c, 01.10.2026).
    assert _arg(_command(), "--cache-ram") == "2048"


def test_prompt_cache_in_ram_follows_settings() -> None:
    assert _arg(_command(llama_cache_ram_mb=0), "--cache-ram") == "0"


def test_weights_are_not_memory_mapped_by_default() -> None:
    # mmap trzymał ~11 GB GGUF-a w pamięci rezydentnej przy modelu na GPU (03.10.2026).
    assert _arg(_command(), "--load-mode") == "none"


def test_empty_load_mode_leaves_llama_default() -> None:
    assert "--load-mode" not in _command(llama_load_mode="")
