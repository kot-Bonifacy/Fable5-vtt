"""Uruchomienie gatewaya: `uv run vtt-gateway` albo `python -m vtt_gateway`."""

from __future__ import annotations

import logging

import uvicorn

from .app import create_app
from .config import load_settings


def main() -> None:
    settings = load_settings()
    logging.basicConfig(
        level=settings.log_level.upper(),
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
    )
    uvicorn.run(
        create_app(settings),
        host=settings.host,
        port=settings.port,
        log_level=settings.log_level.lower(),
    )


if __name__ == "__main__":
    main()
