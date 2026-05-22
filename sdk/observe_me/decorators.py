"""
@trace_llm — decorator-based LLM instrumentation.

On BaseLLMProvider methods:
    @trace_llm
    async def stream_chat(self, messages, system=""):
        async for chunk in self._do_stream(messages, system):
            yield chunk

Standalone:
    @trace_llm(provider="openai", model="gpt-4o")
    async def call_gpt(messages):
        async for chunk in client.stream(...): yield chunk
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
    span_type: str = "generation",
):
    """
    Decorator that instruments any async-generator LLM function.

    - Reads self.name / self.model from the instance (if available)
    - Auto-parents to the currently active span via context var
    - Sets itself as the active span while running (for nested tracing)
    - Reads self._last_usage = (prompt_tokens, completion_tokens) after stream
    """
    def decorator(fn: Any) -> Any:
        if not inspect.isasyncgenfunction(fn):
            raise TypeError(
                f"@trace_llm requires an async generator function (async def … yield). Got: {fn!r}"
            )

        @functools.wraps(fn)
        async def wrapper(*args: Any, **kwargs: Any):
            try:
                from observe_me import get_client, get_context
                from observe_me.context import get_active_trace_id, active_span
                obs = get_client()
                ctx = get_context()
            except ImportError:
                obs = None
                ctx = {}

            instance = args[0] if args else None
            _provider = provider or (getattr(instance, "name", None) if instance else None) or "unknown"
            _model = model or (getattr(instance, "model", None) if instance else None) or "unknown"
            _max_t = max_tokens or (getattr(instance, "max_tokens", None) if instance else None)

            _args_without_self = args[1:] if (instance is not None and hasattr(instance, "name")) else args
            _messages = _args_without_self[0] if _args_without_self else kwargs.get("messages", [])
            input_preview: str | None = None
            if isinstance(_messages, list) and _messages:
                last = _messages[-1]
                input_preview = str(last.get("content", ""))[:500] if isinstance(last, dict) else None

            trace = obs.start_trace(
                provider=_provider,
                model=_model,
                name=f"{span_type}.{_provider}",
                span_type=span_type,
                max_tokens=_max_t,
                input_preview=input_preview,
                **ctx,
            ) if obs else None

            try:
                # Set this trace as active parent for any nested spans
                if trace:
                    _tok = active_span.__wrapped__ if hasattr(active_span, '__wrapped__') else None
                    from observe_me.context import _active_trace_id
                    _active_tok = _active_trace_id.set(trace.trace_id)

                async for chunk in fn(*args, **kwargs):
                    if trace:
                        trace.on_chunk(chunk)
                    yield chunk

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
                    # Restore previous active span
                    from observe_me.context import _active_trace_id
                    try:
                        _active_trace_id.reset(_active_tok)
                    except Exception:
                        pass
                    trace.emit_nowait()

        return wrapper

    if _fn is not None:
        return decorator(_fn)
    return decorator
