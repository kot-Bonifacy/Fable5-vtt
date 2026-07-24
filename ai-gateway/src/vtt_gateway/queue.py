"""Kolejka FIFO — jedna generacja naraz.

llama-server startuje z `--parallel 1`, więc równoległe żądania i tak by się na
nim ustawiły w kolejce. Trzymamy ją tutaj, żeby znać pozycję każdego żądania
i móc ją raportować do UI (etap 11: „bot X czeka na swoją kolej").
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator


class QueueFull(Exception):
    """Za dużo żądań czeka — odrzucamy zamiast kazać czekać w nieskończoność."""


class Ticket:
    """Miejsce w kolejce. Pozycja 0 = trwa generacja."""

    def __init__(self, queue: RequestQueue, label: str) -> None:
        self._queue = queue
        self.label = label
        self._updates: asyncio.Queue[int] = asyncio.Queue()
        self._released = False
        self._active = False

    async def positions(self) -> AsyncIterator[int]:
        """Kolejne pozycje w kolejce; kończy się, gdy żądanie dostanie slot."""
        while True:
            position = await self._updates.get()
            if position == 0:
                self._active = True
                return
            yield position

    def notify(self, position: int) -> None:
        self._updates.put_nowait(position)

    def release(self) -> None:
        if self._released:
            return
        self._released = True
        self._queue._release(self, was_active=self._active)


class RequestQueue:
    def __init__(self, max_length: int) -> None:
        self._max_length = max_length
        self._waiting: list[Ticket] = []
        self._active: Ticket | None = None

    @property
    def length(self) -> int:
        """Liczba żądań czekających (bez tego, które właśnie się generuje)."""
        return len(self._waiting)

    @property
    def busy(self) -> bool:
        return self._active is not None

    def enqueue(self, label: str = "") -> Ticket:
        if len(self._waiting) >= self._max_length:
            raise QueueFull(f"kolejka pełna ({self._max_length} oczekujących)")
        ticket = Ticket(self, label)
        if self._active is None:
            self._active = ticket
            ticket.notify(0)
        else:
            self._waiting.append(ticket)
            ticket.notify(len(self._waiting))
        return ticket

    def _release(self, ticket: Ticket, *, was_active: bool) -> None:
        if not was_active:
            # Klient rozłączył się czekając w kolejce — pozostali przesuwają się w górę.
            if ticket in self._waiting:
                self._waiting.remove(ticket)
                self._renumber()
            return
        if self._active is ticket:
            self._active = None
        self._promote_next()

    def _promote_next(self) -> None:
        if self._active is not None or not self._waiting:
            return
        self._active = self._waiting.pop(0)
        self._active.notify(0)
        self._renumber()

    def _renumber(self) -> None:
        for index, waiting in enumerate(self._waiting, start=1):
            waiting.notify(index)
