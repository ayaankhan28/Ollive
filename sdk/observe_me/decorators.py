"""
@trace_llm — decorator-based LLM instrumentation.

Usage on BaseLLMProvider subclasses (provider/model read from self):
    @trace_llm
    async def stream_chat(self, messages, system=""):
        async for chunk in self._do_stream(messages, system):
            yield chunk

Standalone usage (explicit provider/model):
    @trace_llm(provider="openai", model="gpt-4o")
    async def call_gpt(messages):
        async for chunk in openai_client.stream(...):
            yield chunk
"""

from __future__ import annotations

import functools
import inspect
import logging
from typing import Any

logger = logging.getLogger(__name__)


def trace_llm(
    _fn=None,
    *,
    provider: str | None = None,
    model: str | None = None,
    max_tokens: int | None = None,
):
    """
    Decorator that automatically instruments any async-generator LLM function.

    When decorating a method on a class that exposes `.name` and `.model`
    attributes (e.g. BaseLLMProvider), the provider/model are read from the
    instance — no arguments needed.

    After the stream is exhausted the decorator checks ``instance._last_usage``
    (tuple[int, int] — prompt_tokens, completion_tokens) to report accurate
    token counts. Providers set this inside ``_do_stream``; if absent the trace
    is still recorded without token data.
    """
    def decorator(fn: Any) -> Any:
        if not inspect.isasyncgenfunction(fn):
            raise TypeError(
                f"@trace_llm requires an async generator function (async def … yield). "
                f"Got: {fn!r}"
            )

        @functools.wraps(fn)
        async def wrapper(*args: Any, **kwargs: Any):
            # ── Resolve observability client ──────────────────────────────
            try:
                from observe_me import get_client, get_context
                obs = get_client()
                ctx = get_context()
            except ImportError:
                obs = None
                ctx = {}

            # ── Resolve provider / model from instance or decorator args ──
            instance = args[0] if args else None
            _provider = provider or (getattr(instance, "name", None) if instance else None) or "unknown"
            _model = model or (getattr(instance, "model", None) if instance else None) or "unknown"
            _max_t = max_tokens or (getattr(instance, "max_tokens", None) if instance else None)

            # ── Extract input preview from first messages argument ────────
            # Handles both method (args = self, messages, ...) and function calls
            _args_without_self = args[1:] if (instance is not None and hasattr(instance, "name")) else args
            _messages = _args_without_self[0] if _args_without_self else kwargs.get("messages", [])
            input_preview: str | None = None
            if isinstance(_messages, list) and _messages:
                last = _messages[-1]
                input_preview = str(last.get("content", ""))[:500] if isinstance(last, dict) else None

            # ── Start trace ───────────────────────────────────────────────
            trace = obs.start_trace(
                provider=_provider,
                model=_model,
                max_tokens=_max_t,
                input_preview=input_preview,
                **ctx,
            ) if obs else None

            # ── Stream ────────────────────────────────────────────────────
            try:
                async for chunk in fn(*args, **kwargs):
                    if trace:
                        trace.on_chunk(chunk)
                    yield chunk

                # After stream exhausted — pick up usage set by provider
                if trace:
                    usage: tuple[int, int] | None = getattr(instance, "_last_usage", None) if instance else None
                    if usage and len(usage) == 2:
                        trace.complete(prompt_tokens=usage[0], completion_tokens=usage[1])
                    else:
                        trace.complete()

            except Exception as exc:
                if trace:
                    trace.fail(exc)
                raise
            finally:
                if trace:
                    trace.emit_nowait()

        return wrapper

    # Support both @trace_llm and @trace_llm(provider=...) forms
    if _fn is not None:
        return decorator(_fn)
    return decorator
