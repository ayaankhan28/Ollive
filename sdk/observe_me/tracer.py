"""Core Trace object — records all LLM call metadata and stream events."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional
from uuid import uuid4

from .pricing import estimate_cost

if TYPE_CHECKING:
    from .client import ObserveMeClient

logger = logging.getLogger(__name__)

_MAX_STREAM_EVENTS = 200
_PREVIEW_MAX = 500


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Trace:
    """Represents a single LLM inference trace."""

    def __init__(
        self,
        client: "ObserveMeClient",
        provider: str,
        model: str,
        session_id: Optional[str] = None,
        user_id: Optional[str] = None,
        conversation_id: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        input_preview: Optional[str] = None,
    ) -> None:
        self._client = client
        self.trace_id = str(uuid4())
        self.provider = provider
        self.model = model
        self.session_id = session_id
        self.user_id = user_id
        self.conversation_id = conversation_id
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.input_preview = input_preview[:_PREVIEW_MAX] if input_preview else None

        self.started_at: datetime = _utcnow()
        self.completed_at: Optional[datetime] = None
        self.status: str = "pending"

        self.prompt_tokens: Optional[int] = None
        self.completion_tokens: Optional[int] = None
        self.total_tokens: Optional[int] = None
        self.estimated_cost_usd: Optional[float] = None

        self.error_type: Optional[str] = None
        self.error_message: Optional[str] = None

        self._first_chunk_at: Optional[datetime] = None
        self._chunks: list[str] = []
        self._stream_events: list[dict] = []
        self._sequence: int = 0

    # ------------------------------------------------------------------
    # Stream instrumentation
    # ------------------------------------------------------------------

    def on_chunk(self, text: str) -> None:
        now = _utcnow()
        if self._first_chunk_at is None:
            self._first_chunk_at = now
        self._chunks.append(text)
        if len(self._stream_events) < _MAX_STREAM_EVENTS:
            elapsed_ms = int((now - self.started_at).total_seconds() * 1000)
            self._stream_events.append({
                "event_type": "chunk",
                "sequence_number": self._sequence,
                "content": text,
                "latency_from_start_ms": elapsed_ms,
                "timestamp": now.isoformat(),
            })
        self._sequence += 1

    # ------------------------------------------------------------------
    # Terminal states
    # ------------------------------------------------------------------

    def complete(self, prompt_tokens: Optional[int] = None, completion_tokens: Optional[int] = None) -> None:
        self.completed_at = _utcnow()
        self.status = "success"
        if prompt_tokens is not None:
            self.prompt_tokens = prompt_tokens
        if completion_tokens is not None:
            self.completion_tokens = completion_tokens
        if self.prompt_tokens and self.completion_tokens:
            self.total_tokens = self.prompt_tokens + self.completion_tokens
            self.estimated_cost_usd = estimate_cost(
                self.provider, self.model, self.prompt_tokens, self.completion_tokens
            )

    def fail(self, error: Exception) -> None:
        self.completed_at = _utcnow()
        self.status = "error"
        self.error_type = type(error).__name__
        self.error_message = str(error)[:1000]

    def cancel(self) -> None:
        self.completed_at = _utcnow()
        self.status = "cancelled"

    # ------------------------------------------------------------------
    # Emission
    # ------------------------------------------------------------------

    def emit_nowait(self) -> None:
        """Schedule background emission. Safe to call from sync or async code."""
        payload = self._build_payload()
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(self._client._enqueue(payload))
        except RuntimeError:
            pass  # No running loop — skip emission silently

    def _build_payload(self) -> dict:
        latency_ms = None
        first_token_ms = None
        if self.completed_at:
            latency_ms = int((self.completed_at - self.started_at).total_seconds() * 1000)
        if self._first_chunk_at:
            first_token_ms = int((self._first_chunk_at - self.started_at).total_seconds() * 1000)

        output_preview = "".join(self._chunks)[:_PREVIEW_MAX] if self._chunks else None

        return {
            "trace_id": self.trace_id,
            "provider": self.provider,
            "model": self.model,
            "status": self.status,
            "session_id": self.session_id,
            "user_id": self.user_id,
            "conversation_id": self.conversation_id,
            "started_at": self.started_at.isoformat(),
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "latency_ms": latency_ms,
            "first_token_latency_ms": first_token_ms,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
            "total_tokens": self.total_tokens,
            "estimated_cost_usd": self.estimated_cost_usd,
            "input_preview": self.input_preview,
            "output_preview": output_preview,
            "error_type": self.error_type,
            "error_message": self.error_message,
            "stream_events": self._stream_events,
        }
