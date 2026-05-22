"""observe-me: LLM observability and tracing SDK."""

from __future__ import annotations

from typing import Optional

from .client import ObserveMeClient
from .context import get_context, set_session_id, set_user_id, set_conversation_id, trace_context
from .decorators import trace_llm
from .tracer import Trace

__version__ = "0.1.0"
__all__ = [
    "ObserveMeClient",
    "Trace",
    "trace_llm",
    "configure",
    "get_client",
    "start_trace",
    "get_context",
    "set_session_id",
    "set_user_id",
    "set_conversation_id",
    "trace_context",
]

_client: Optional[ObserveMeClient] = None


def configure(
    endpoint: str,
    api_key: Optional[str] = None,
    enabled: bool = True,
) -> ObserveMeClient:
    """Create and register the global SDK client instance."""
    global _client
    _client = ObserveMeClient(endpoint=endpoint, api_key=api_key, enabled=enabled)
    return _client


def get_client() -> Optional[ObserveMeClient]:
    return _client


def start_trace(**kwargs) -> Optional[Trace]:
    """Shortcut for ``get_client().start_trace(**kwargs)``."""
    c = get_client()
    return c.start_trace(**kwargs) if c else None
