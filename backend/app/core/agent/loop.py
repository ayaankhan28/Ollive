"""
Agentic loop with tool calling and nested observe-me tracing.

Trace tree produced per agent turn:

    agent-turn  (span_type="trace")  ← root
    ├── llm.anthropic  (span_type="generation", sequence=0)
    ├── tool.web_search  (span_type="tool", sequence=1)
    ├── tool.calculator  (span_type="tool", sequence=2)
    └── llm.anthropic  (span_type="generation", sequence=3)  ← final streamed response
"""

import asyncio
import json
import logging
from typing import AsyncIterator, Dict, Any, List, Optional

import anthropic

from app.core.config import settings
from app.core.llm.manager import SYSTEM_PROMPT
from app.core.tools import ANTHROPIC_TOOL_DEFS, execute_tool

logger = logging.getLogger(__name__)

_MAX_TOOL_ROUNDS = 5


def _msg_preview(messages: List[Dict[str, Any]]) -> Optional[str]:
    """Extract a string preview from the last message, regardless of content type."""
    if not messages:
        return None
    content = messages[-1].get("content", "")
    if isinstance(content, str):
        return content[:200] or None
    return str(content)[:200] or None


async def run_agent_turn(
    messages: List[Dict[str, Any]],
    session_id: Optional[str] = None,
    user_id: Optional[str] = None,
    conversation_id: Optional[str] = None,
    cancel_event: Optional[asyncio.Event] = None,
) -> AsyncIterator[Dict[str, Any]]:
    """
    Run one full agent turn (possibly multiple tool calls) and yield WS events:

    - {"type": "tool_start", "tool_name": ..., "tool_input": {...}}
    - {"type": "tool_end",   "tool_name": ..., "tool_result": "..."}
    - {"type": "chunk",      "content": "..."}   (true streaming from LLM)
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

    _active_tok = None
    if obs and root_trace and _active_trace_id is not None:
        _active_tok = _active_trace_id.set(root_trace.trace_id)

    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    current_messages = list(messages)
    sequence = 0

    try:
        for round_num in range(_MAX_TOOL_ROUNDS + 1):
            if cancel_event and cancel_event.is_set():
                return

            gen_trace = obs.start_trace(
                provider="anthropic",
                model=settings.ANTHROPIC_MODEL,
                name="llm.anthropic",
                span_type="generation",
                parent_trace_id=root_trace.trace_id if root_trace else None,
                sequence=sequence,
                input_preview=_msg_preview(current_messages),
                session_id=session_id,
                user_id=user_id,
            ) if obs else None
            sequence += 1

            # ── True streaming LLM call ──────────────────────────────────
            # content_blocks accumulates the full response as dicts so we can
            # pass them back for tool-use rounds without needing SDK objects.
            content_blocks: List[Dict[str, Any]] = []
            tool_json_parts: Dict[int, List[str]] = {}
            stop_reason: Optional[str] = None
            cancelled_mid_stream = False

            async with client.messages.stream(
                model=settings.ANTHROPIC_MODEL,
                max_tokens=settings.ANTHROPIC_MAX_TOKENS,
                system=SYSTEM_PROMPT,
                tools=ANTHROPIC_TOOL_DEFS,
                messages=current_messages,
            ) as stream:
                async for event in stream:
                    if cancel_event and cancel_event.is_set():
                        cancelled_mid_stream = True
                        break

                    if event.type == "content_block_start":
                        cb = event.content_block
                        if cb.type == "text":
                            content_blocks.append({"type": "text", "text": ""})
                        elif cb.type == "tool_use":
                            content_blocks.append({
                                "type": "tool_use",
                                "id": cb.id,
                                "name": cb.name,
                                "input": {},
                            })
                            tool_json_parts[event.index] = []

                    elif event.type == "content_block_delta":
                        delta = event.delta
                        if delta.type == "text_delta":
                            text = delta.text
                            if event.index < len(content_blocks):
                                content_blocks[event.index]["text"] += text
                            yield {"type": "chunk", "content": text}
                        elif delta.type == "input_json_delta":
                            if event.index in tool_json_parts:
                                tool_json_parts[event.index].append(delta.partial_json)

                    elif event.type == "content_block_stop":
                        idx = event.index
                        if idx in tool_json_parts:
                            try:
                                content_blocks[idx]["input"] = json.loads(
                                    "".join(tool_json_parts[idx])
                                )
                            except Exception:
                                content_blocks[idx]["input"] = {}

                # Only fetch final message when the stream was fully consumed.
                if not cancelled_mid_stream:
                    final_message = await stream.get_final_message()
                    stop_reason = final_message.stop_reason

            if cancelled_mid_stream:
                return

            # ── Tracing ──────────────────────────────────────────────────
            if gen_trace:
                output_parts: list[str] = []
                for block in content_blocks:
                    if block["type"] == "text" and block.get("text"):
                        output_parts.append(block["text"])
                    elif block["type"] == "tool_use":
                        output_parts.append(
                            f"[tool_use: {block['name']} | input: {str(block.get('input', {}))[:120]}]"
                        )
                if output_parts:
                    gen_trace._chunks = output_parts
                gen_trace.complete(
                    prompt_tokens=final_message.usage.input_tokens,
                    completion_tokens=final_message.usage.output_tokens,
                )
                gen_trace.emit_nowait()

            # ── end_turn: text was already streamed chunk by chunk above ──
            if stop_reason == "end_turn":
                break

            # ── tool_use: execute tools then loop ─────────────────────────
            if stop_reason == "tool_use":
                tool_results: List[Dict[str, Any]] = []

                for block in content_blocks:
                    if block["type"] != "tool_use":
                        continue

                    tool_input = block.get("input", {})

                    yield {
                        "type": "tool_start",
                        "tool_name": block["name"],
                        "tool_input": tool_input,
                    }

                    tool_trace = obs.start_trace(
                        provider="tool",
                        model=block["name"],
                        name=f"tool.{block['name']}",
                        span_type="tool",
                        parent_trace_id=root_trace.trace_id if root_trace else None,
                        sequence=sequence,
                        input_preview=str(tool_input)[:200],
                        session_id=session_id,
                        user_id=user_id,
                    ) if obs else None
                    sequence += 1

                    try:
                        result = await execute_tool(block["name"], tool_input)
                        if tool_trace:
                            tool_trace._chunks = [result[:200]]
                            tool_trace.complete()
                            tool_trace.emit_nowait()
                    except Exception as tool_err:
                        result = f"Tool error: {tool_err}"
                        if tool_trace:
                            tool_trace._chunks = [result[:200]]
                            tool_trace.fail(tool_err)
                            tool_trace.emit_nowait()

                    yield {
                        "type": "tool_end",
                        "tool_name": block["name"],
                        "tool_result": result[:600],
                    }

                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block["id"],
                        "content": result,
                    })

                current_messages = current_messages + [
                    {"role": "assistant", "content": content_blocks},
                    {"role": "user", "content": tool_results},
                ]
                continue

            logger.warning("Unexpected stop_reason: %s", stop_reason)
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
