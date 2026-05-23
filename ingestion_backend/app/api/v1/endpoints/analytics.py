import asyncio
import json
import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_db
from app.schemas.analytics import (
    ErrorRatePoint,
    ErrorRateResponse,
    MetricsResponse,
    SessionDetailResponse,
    SessionListResponse,
    SummaryResponse,
    TraceDetail,
    TraceListResponse,
)
from app.services import analytics_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/analytics/summary", response_model=SummaryResponse)
async def summary(db: AsyncSession = Depends(get_db)):
    return await analytics_service.get_summary(db)


@router.get("/analytics/traces", response_model=TraceListResponse)
async def list_traces(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    session_id: Optional[UUID] = Query(default=None),
    user_id: Optional[UUID] = Query(default=None),
    status: Optional[str] = Query(default=None),
    provider: Optional[str] = Query(default=None),
    roots_only: bool = Query(default=True, description="Only return root spans (parent_trace_id IS NULL)"),
    db: AsyncSession = Depends(get_db),
):
    return await analytics_service.list_traces(
        db, page=page, limit=limit,
        session_id=session_id, user_id=user_id,
        status=status, provider=provider,
        roots_only=roots_only,
    )


@router.get("/analytics/traces/{trace_id}", response_model=TraceDetail)
async def get_trace(trace_id: str, db: AsyncSession = Depends(get_db)):
    trace = await analytics_service.get_trace(db, trace_id)
    if not trace:
        raise HTTPException(status_code=404, detail="Trace not found")
    return trace


@router.get("/analytics/metrics", response_model=MetricsResponse)
async def get_metrics(hours: int = Query(default=24, ge=1, le=168), db: AsyncSession = Depends(get_db)):
    return await analytics_service.get_metrics(db, hours=hours)


@router.get("/analytics/errors", response_model=ErrorRateResponse)
async def get_error_rate(
    hours: int = Query(default=24, ge=1, le=168),
    db: AsyncSession = Depends(get_db),
):
    data = await analytics_service.get_error_rate_timeseries(db, hours=hours)
    return ErrorRateResponse(
        data=[ErrorRatePoint(**point) for point in data],
        hours=hours,
    )


@router.get("/analytics/sessions", response_model=SessionListResponse)
async def get_sessions(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    return await analytics_service.get_sessions_analytics(db, page=page, limit=limit)


@router.get("/analytics/sessions/{session_id}", response_model=SessionDetailResponse)
async def get_session_detail(session_id: UUID, db: AsyncSession = Depends(get_db)):
    return await analytics_service.get_session_detail(db, session_id)


@router.get("/events/traces")
async def trace_event_stream():
    """
    Server-Sent Events endpoint. Admin panel subscribes here to receive
    each new trace as it arrives, without polling.
    """
    from app.events import subscribe, unsubscribe

    queue = subscribe()

    async def generate():
        try:
            yield "event: connected\ndata: {}\n\n"
            while True:
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=25)
                    yield f"data: {json.dumps(payload)}\n\n"
                except asyncio.TimeoutError:
                    # Keep-alive ping so the connection stays open
                    yield "event: ping\ndata: {}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            unsubscribe(queue)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
