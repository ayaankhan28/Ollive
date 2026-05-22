"""Global SSE event registry — broadcasts new trace events to all subscribed clients."""

import asyncio
from typing import Set

_subscribers: Set[asyncio.Queue] = set()


async def broadcast(payload: dict) -> None:
    dead: Set[asyncio.Queue] = set()
    for q in _subscribers:
        try:
            q.put_nowait(payload)
        except asyncio.QueueFull:
            dead.add(q)
    _subscribers.difference_update(dead)


def subscribe() -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue(maxsize=100)
    _subscribers.add(q)
    return q


def unsubscribe(q: asyncio.Queue) -> None:
    _subscribers.discard(q)
