import logging

from fastapi import APIRouter, HTTPException

from app.redis_client import get_redis, STREAM_TRACES
from app.schemas.ingest import TraceIngest, TraceIngestResponse

logger = logging.getLogger(__name__)
router = APIRouter()

# Trim stream to this many messages (~Kafka-style retention)
_STREAM_MAXLEN = 100_000


@router.post("/ingest/trace", response_model=TraceIngestResponse, status_code=202)
async def ingest_trace(payload: TraceIngest):
    """
    Publish validated telemetry to the Redis stream and return 202 immediately.
    DB persistence is handled asynchronously by the redis_consumer worker —
    this endpoint never blocks on PostgreSQL.
    """
    try:
        redis = get_redis()
        await redis.xadd(
            STREAM_TRACES,
            {"payload": payload.model_dump_json()},
            maxlen=_STREAM_MAXLEN,
            approximate=True,
        )
        return TraceIngestResponse(trace_id=payload.trace_id)
    except Exception as exc:
        logger.error("Failed to enqueue trace %s: %s", payload.trace_id, exc)
        raise HTTPException(status_code=503, detail="Queue unavailable — try again shortly")
