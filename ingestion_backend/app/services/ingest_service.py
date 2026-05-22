import logging
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.traces import Trace
from app.db.models.stream_events import StreamEvent
from app.schemas.ingest import TraceIngest

logger = logging.getLogger(__name__)


async def ingest_trace(db: AsyncSession, payload: TraceIngest) -> Trace:
    trace = Trace(
        trace_id=payload.trace_id,
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
    await db.flush()  # get the trace_id persisted before adding events

    for ev in payload.stream_events:
        event = StreamEvent(
            trace_id=payload.trace_id,
            event_type=ev.event_type,
            sequence_number=ev.sequence_number,
            content=ev.content,
            latency_from_start_ms=ev.latency_from_start_ms,
            timestamp=ev.timestamp,
        )
        db.add(event)

    await db.commit()
    logger.info("Ingested trace %s — provider=%s model=%s status=%s tokens=%s",
                payload.trace_id, payload.provider, payload.model, payload.status, payload.total_tokens)
    return trace
