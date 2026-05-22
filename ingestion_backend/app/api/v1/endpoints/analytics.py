import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_db
from app.schemas.analytics import (
    MetricsResponse,
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
    db: AsyncSession = Depends(get_db),
):
    return await analytics_service.list_traces(db, page=page, limit=limit, session_id=session_id, user_id=user_id, status=status, provider=provider)


@router.get("/analytics/traces/{trace_id}", response_model=TraceDetail)
async def get_trace(trace_id: str, db: AsyncSession = Depends(get_db)):
    trace = await analytics_service.get_trace(db, trace_id)
    if not trace:
        raise HTTPException(status_code=404, detail="Trace not found")
    return trace


@router.get("/analytics/metrics", response_model=MetricsResponse)
async def get_metrics(hours: int = Query(default=24, ge=1, le=168), db: AsyncSession = Depends(get_db)):
    return await analytics_service.get_metrics(db, hours=hours)


@router.get("/analytics/sessions", response_model=SessionListResponse)
async def get_sessions(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    return await analytics_service.get_sessions_analytics(db, page=page, limit=limit)
