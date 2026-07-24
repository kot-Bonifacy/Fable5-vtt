import asyncio

import pytest

from vtt_gateway.queue import QueueFull, RequestQueue


async def _drain(ticket) -> list[int]:
    """Zbiera pozycje raportowane do momentu otrzymania slotu."""
    seen: list[int] = []
    async for position in ticket.positions():
        seen.append(position)
    return seen


async def test_first_request_starts_immediately():
    queue = RequestQueue(max_length=4)
    ticket = queue.enqueue("bot-a")
    assert queue.busy is True  # slot przydzielony już przy wejściu do kolejki
    positions = await _drain(ticket)
    assert positions == []  # od razu slot, żadnego czekania
    assert queue.busy is True
    assert queue.length == 0


async def test_second_request_waits_in_line():
    queue = RequestQueue(max_length=4)
    first = queue.enqueue("bot-a")
    await _drain(first)

    second = queue.enqueue("bot-b")
    assert queue.length == 1

    waiter = asyncio.create_task(_drain(second))
    await asyncio.sleep(0)
    assert not waiter.done(), "drugie żądanie nie może ruszyć przed zwolnieniem slotu"

    first.release()
    positions = await asyncio.wait_for(waiter, timeout=1)
    assert positions == [1], "przed startem żądanie widziało pozycję 1"
    assert queue.length == 0


async def test_positions_shift_up_when_queue_advances():
    queue = RequestQueue(max_length=4)
    first = queue.enqueue("a")
    await _drain(first)
    second = queue.enqueue("b")
    third = queue.enqueue("c")

    third_task = asyncio.create_task(_drain(third))
    await asyncio.sleep(0)

    first.release()  # b wchodzi na slot, c przesuwa się z 2 na 1
    second_positions = await asyncio.wait_for(_drain(second), timeout=1)
    assert second_positions == [1]

    second.release()
    assert await asyncio.wait_for(third_task, timeout=1) == [2, 1]


async def test_abandoned_ticket_frees_the_line():
    queue = RequestQueue(max_length=4)
    first = queue.enqueue("a")
    await _drain(first)
    second = queue.enqueue("b")
    third = queue.enqueue("c")

    second.release()  # klient rozłączył się czekając w kolejce
    assert queue.length == 1

    third_task = asyncio.create_task(_drain(third))
    first.release()
    assert await asyncio.wait_for(third_task, timeout=1) == [2, 1]


async def test_queue_rejects_when_full():
    queue = RequestQueue(max_length=1)
    active = queue.enqueue("a")
    await _drain(active)
    queue.enqueue("b")
    with pytest.raises(QueueFull):
        queue.enqueue("c")
