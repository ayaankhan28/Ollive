"""
Agentic loop with tool calling and nested observe-me tracing.

Trace tree produced per agent turn:

    agent-turn  (span_type="trace")  ← root
    ├── llm.anthropic  (span_type="generation", sequence=0)
    ├── tool.web_search  (span_type="tool", sequence=1)
    ├── tool.calculator  (span_type="tool", sequence=2)
    └── llm.anthropic  (span_type="generation", sequence=3)  ← final streamed response
"""

import logging
from typing import AsyncIterator, Dict, Any, List, Optional

import anthropic

from app.core.config import settings
from app.core.llm.manager import SYSTEM_PROMPT
from app.core.tools import ANTHROPIC_TOOL_DEFS, execute_tool

logger = logging.getLogger(__name__)

_MAX_TOOL_ROUNDS = 5


async def run_agent_turn(
    messages: List[Dict[str, Any]],
    session_id: Optional[str] = None,
    user_id: Optional[str] = None,
    conversation_id: Optional[str] = None,
) -> AsyncIterator[Dict[str, Any]]:
    """
    Run one full agent turn (possibly multiple tool calls) and yield WS events:

    - {"type": "tool_start", "tool_name": ..., "tool_input": {...}}
    - {"type": "tool_end",   "tool_name": ..., "tool_result": "..."}
    - {"type": "chunk",      "content": "..."}   (streaming final response)
    """
    # ── Observability setup ──────────────────────────────────────────────────
    try:
        import observe_me
        from observe_me.context import _active_trace_id
        obs = observe_me.get_client()
    except ImportError:
        obs = None
        _active_trace_id = None

    root_trace = obs.start_trace(
        provider="anthropic",
        model=settings.ANTHROPIC_MODEL,
        name="agent-turn",
        span_type="trace",
        session_id=session_id,
        user_id=user_id,
        conversation_id=conversation_id,
        input_preview=messages[-1].get("content", "")[:300] if messages else None,
    ) if obs else None

    # Set root as active so child spans auto-parent to it
    _active_tok = None
    if obs and root_trace and _active_trace_id is not None:
        _active_tok = _active_trace_id.set(root_trace.trace_id)

    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    current_messages = list(messages)
    sequence = 0

    try:
        for round_num in range(_MAX_TOOL_ROUNDS + 1):
            # ── Non-streaming LLM call with tool definitions ─────────────
            gen_trace = obs.start_trace(
                provider="anthropic",
                model=settings.ANTHROPIC_MODEL,
                name="llm.anthropic",
                span_type="generation",
                parent_trace_id=root_trace.trace_id if root_trace else None,
                sequence=sequence,
                input_preview=current_messages[-1].get("content", "")[:200] if current_messages else None,
                session_id=session_id,
                user_id=user_id,
            ) if obs else None
            sequence += 1

            response = await client.messages.create(
                model=settings.ANTHROPIC_MODEL,
                max_tokens=settings.ANTHROPIC_MAX_TOKENS,
                system=SYSTEM_PROMPT,
                tools=ANTHROPIC_TOOL_DEFS,
                messages=current_messages,
            )

            if gen_trace:
                gen_trace.complete(
                    prompt_tokens=response.usage.input_tokens,
                    completion_tokens=response.usage.output_tokens,
                )
                gen_trace.emit_nowait()

            # ── end_turn: stream final response ──────────────────────────
            if response.stop_reason == "end_turn":
                # Stream the response for good UX (chunk by character)
                for block in response.content:
                    if hasattr(block, "text") and block.text:
                        # Emit as small chunks to simulate streaming
                        text = block.text
                        step = 6
                        for i in range(0, len(text), step):
                            yield {"type": "chunk", "content": text[i:i + step]}
                break

            # ── tool_use: execute each tool then continue ─────────────────
            if response.stop_reason == "tool_use":
                tool_results: List[Dict[str, Any]] = []

                for block in response.content:
                    if not hasattr(block, "type") or block.type != "tool_use":
                        continue

                    tool_input = block.input if isinstance(block.input, dict) else {}

                    # Notify client the tool is starting
                    yield {
                        "type": "tool_start",
                        "tool_name": block.name,
                        "tool_input": tool_input,
                    }

                    # Tool trace (child of root)
                    tool_trace = obs.start_trace(
                        provider="tool",
                        model=block.name,
                        name=f"tool.{block.name}",
                        span_type="tool",
                        parent_trace_id=root_trace.trace_id if root_trace else None,
                        sequence=sequence,
                        input_preview=str(tool_input)[:200],
                        session_id=session_id,
                        user_id=user_id,
                    ) if obs else None
                    sequence += 1

                    result = await execute_tool(block.name, tool_input)

                    if tool_trace:
                        tool_trace._chunks = [result[:200]]
                        tool_trace.complete()
                        tool_trace.emit_nowait()

                    yield {
                        "type": "tool_end",
                        "tool_name": block.name,
                        "tool_result": result[:600],
                    }

                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result,
                    })

                current_messages = current_messages + [
                    {"role": "assistant", "content": list(response.content)},
                    {"role": "user", "content": tool_results},
                ]
                continue

            # Unexpected stop reason
            logger.warning("Unexpected stop_reason: %s", response.stop_reason)
            break

        if root_trace:
            root_trace.complete()

    except Exception as e:
        logger.error("Agent loop error: %s", e, exc_info=True)
        if root_trace:
            root_trace.fail(e)
        raise
    finally:
        if obs and _active_trace_id is not None and _active_tok is not None:
            try:
                _active_trace_id.reset(_active_tok)
            except Exception:
                pass
        if root_trace:
            root_trace.emit_nowait()
