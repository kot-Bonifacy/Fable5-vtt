"""Odczyt zajętości VRAM przez nvidia-smi (best effort — brak GPU nie jest błędem)."""

from __future__ import annotations

import asyncio
import logging

from .schemas import GpuInfo

log = logging.getLogger(__name__)

_QUERY = "name,memory.total,memory.used"


async def read_gpu_info(timeout: float = 3.0) -> GpuInfo | None:
    try:
        process = await asyncio.create_subprocess_exec(
            "nvidia-smi",
            f"--query-gpu={_QUERY}",
            "--format=csv,noheader,nounits",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
    except (FileNotFoundError, OSError):
        return None
    try:
        stdout, _ = await asyncio.wait_for(process.communicate(), timeout=timeout)
    except TimeoutError:
        process.kill()
        return None
    if process.returncode != 0:
        return None

    first_line = stdout.decode("utf-8", errors="replace").strip().splitlines()
    if not first_line:
        return None
    parts = [part.strip() for part in first_line[0].split(",")]
    if len(parts) < 3:
        return None
    try:
        return GpuInfo(
            name=parts[0],
            memory_total_mb=int(float(parts[1])),
            memory_used_mb=int(float(parts[2])),
        )
    except ValueError:
        return None
