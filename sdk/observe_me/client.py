"""ObserveMeClient — main entry point for the SDK."""

from __future__ import annotations

import logging
from typing import Optional

from .context import get_context
from .emitter import TelemetryEmitter
from .tracer import Trace

logger = logging.getLogger(__name__)


class ObserveMeClient:
    """
    Central SDK client.

    Usage::

        client = ObserveMeClient(endpoint="http://localhost:8001")
        await client.start()   # call on app startup

        trace = client.start_trace(provider="anthropic", model="claude-sonnet-4-6")
        ...
        trace.emit_nowait()

        await client.stop()    # call on app shutdown
    """

    def __init__(
        self,
        endpoint: str,
        api_key: Optional[str] = None,
        enabled: bool = True,
    ) -> None:
        self.endpoint = endpoint
        self.enabled = enabled
        self._emitter = TelemetryEmitter(endpoint=endpoint, api_key=api_key)

    async def start(self) -> None:
        if self.enabled:
            await self._emitter.start()

    async def stop(self) -> None:
        if self.enabled:
            await self._emitter.stop()

    def start_trace(
        self,
        provider: str,
        model: str,
        session_id: Optional[str] = None,
        user_id: Optional[str] = None,
        conversation_id: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        input_preview: Optional[str] = None,
    ) -> Trace:
        """Create and return a new Trace. Enriches with context vars if not supplied."""
        if session_id is None or user_id is None or conversation_id is None:
            ctx = get_context()
            session_id = session_id or ctx.get("session_id")
            user_id = user_id or ctx.get("user_id")
            conversation_id = conversation_id or ctx.get("conversation_id")

        return Trace(
            client=self,
            provider=provider,
            model=model,
            session_id=session_id,
            user_id=user_id,
            conversation_id=conversation_id,
            temperature=temperature,
            max_tokens=max_tokens,
            input_preview=input_preview,
        )

    async def _enqueue(self, payload: dict) -> None:
        if self.enabled:
            await self._emitter.enqueue(payload)
