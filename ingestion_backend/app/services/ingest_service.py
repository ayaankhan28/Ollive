import asyncio
import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.traces import Trace
from app.db.models.stream_events import StreamEvent
from app.schemas.ingest import TraceIngest

logger = logging.getLogger(__name__)


async def ingest_trace(db: AsyncSession, payload: TraceIngest) -> Trace:
    trace = Trace(
        trace_id=payload.trace_id,
        name=payload.name or f"{payload.span_type}.{payload.provider}",
        span_type=payload.span_type,
        parent_trace_id=payload.parent_trace_id,
        sequence=payload.sequence,
        provider=payload.provider,
        model=payload.model,
        status=payload.status,
        session_id=payload.session_id,
        user_id=payload.user_id,
        conversation_id=payload.conversation_id,
        started_at=payload.started_at,
        completed_at=payload.completed_at,
        latency_ms=payload.latency_ms,
        first_token_latency_ms=payload.first_token_latency_ms,
        temperature=payload.temperature,
        max_tokens=payload.max_tokens,
        prompt_tokens=payload.prompt_tokens,
        completion_tokens=payload.completion_tokens,
        total_tokens=payload.total_tokens,
        estimated_cost_usd=payload.estimated_cost_usd,
        input_preview=payload.input_preview,
        output_preview=payload.output_preview,
        error_type=payload.error_type,
        error_message=payload.error_message,
    )
    db.add(trace)
    await db.flush()

    for ev in payload.stream_events:
        db.add(StreamEvent(
            trace_id=payload.trace_id,
            event_type=ev.event_type,
            sequence_number=ev.sequence_number,
            content=ev.content,
            latency_from_start_ms=ev.latency_from_start_ms,
            timestamp=ev.timestamp,
        ))

    await db.commit()
    logger.info(
        "Ingested %s %s [%s] parent=%s tokens=%s",
        payload.span_type, payload.name, payload.status,
        payload.parent_trace_id or "root", payload.total_tokens,
    )

    # Broadcast to any SSE subscribers (admin panel live feed)
    try:
        from app.events import broadcast
        asyncio.create_task(broadcast({
            "trace_id": payload.trace_id,
            "name": payload.name or f"{payload.span_type}.{payload.provider}",
            "span_type": payload.span_type,
            "provider": payload.provider,
            "model": payload.model,
            "status": payload.status,
            "latency_ms": payload.latency_ms,
            "first_token_latency_ms": payload.first_token_latency_ms,
            "total_tokens": payload.total_tokens,
            "prompt_tokens": payload.prompt_tokens,
            "completion_tokens": payload.completion_tokens,
            "estimated_cost_usd": float(payload.estimated_cost_usd) if payload.estimated_cost_usd else None,
            "input_preview": payload.input_preview,
            "output_preview": payload.output_preview,
            "started_at": payload.started_at.isoformat() if payload.started_at else None,
            "completed_at": payload.completed_at.isoformat() if payload.completed_at else None,
            "session_id": str(payload.session_id) if payload.session_id else None,
            "user_id": str(payload.user_id) if payload.user_id else None,
            "parent_trace_id": payload.parent_trace_id,
            "sequence": payload.sequence,
            "error_type": payload.error_type,
        }))
    except Exception:
        pass  # SSE broadcast is best-effort, never block ingestion

    return trace
