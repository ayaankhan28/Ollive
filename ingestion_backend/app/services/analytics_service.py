import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.traces import Trace
from app.schemas.analytics import (
    MetricsResponse,
    ProviderBreakdown,
    SessionAnalytics,
    SessionListResponse,
    StatusBreakdown,
    SummaryResponse,
    TimeSeriesPoint,
    TraceDetail,
    TraceListResponse,
    TraceOut,
)

logger = logging.getLogger(__name__)


async def get_summary(db: AsyncSession) -> SummaryResponse:
    now = datetime.now(timezone.utc)
    last_24h = now - timedelta(hours=24)
    last_7d = now - timedelta(days=7)

    total_q = await db.execute(sa.select(sa.func.count()).select_from(Trace))
    total = total_q.scalar_one()

    success_q = await db.execute(sa.select(sa.func.count()).select_from(Trace).where(Trace.status == "success"))
    successful = success_q.scalar_one()

    failed_q = await db.execute(sa.select(sa.func.count()).select_from(Trace).where(Trace.status == "error"))
    failed = failed_q.scalar_one()

    tokens_q = await db.execute(sa.select(sa.func.coalesce(sa.func.sum(Trace.total_tokens), 0)).select_from(Trace))
    total_tokens = tokens_q.scalar_one() or 0

    cost_q = await db.execute(sa.select(sa.func.coalesce(sa.func.sum(sa.cast(Trace.estimated_cost_usd, sa.Float)), 0.0)).select_from(Trace))
    total_cost = float(cost_q.scalar_one() or 0.0)

    avg_lat_q = await db.execute(sa.select(sa.func.avg(Trace.latency_ms)).select_from(Trace).where(Trace.status == "success"))
    avg_lat = avg_lat_q.scalar_one()

    p95_lat_q = await db.execute(
        sa.text(
            "SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) "
            "FROM obs_traces WHERE status = 'success' AND latency_ms IS NOT NULL"
        )
    )
    p95_lat = p95_lat_q.scalar_one()

    last_24h_q = await db.execute(sa.select(sa.func.count()).select_from(Trace).where(Trace.created_at >= last_24h))
    traces_24h = last_24h_q.scalar_one()

    last_7d_q = await db.execute(sa.select(sa.func.count()).select_from(Trace).where(Trace.created_at >= last_7d))
    traces_7d = last_7d_q.scalar_one()

    provider_q = await db.execute(
        sa.select(
            Trace.provider,
            sa.func.count().label("count"),
            sa.func.coalesce(sa.func.sum(Trace.total_tokens), 0).label("total_tokens"),
            sa.func.coalesce(sa.func.sum(sa.cast(Trace.estimated_cost_usd, sa.Float)), 0.0).label("total_cost"),
        ).group_by(Trace.provider)
    )
    by_provider = [
        ProviderBreakdown(provider=row.provider, count=row.count, total_tokens=row.total_tokens, total_cost_usd=float(row.total_cost))
        for row in provider_q.all()
    ]

    status_q = await db.execute(sa.select(Trace.status, sa.func.count().label("count")).group_by(Trace.status))
    by_status = [StatusBreakdown(status=row.status, count=row.count) for row in status_q.all()]

    return SummaryResponse(
        total_traces=total,
        successful_traces=successful,
        failed_traces=failed,
        success_rate=round(successful / total, 4) if total > 0 else 0.0,
        total_tokens=total_tokens,
        total_cost_usd=total_cost,
        avg_latency_ms=float(avg_lat) if avg_lat else None,
        p95_latency_ms=int(p95_lat) if p95_lat else None,
        traces_last_24h=traces_24h,
        traces_last_7d=traces_7d,
        by_provider=by_provider,
        by_status=by_status,
    )


async def list_traces(
    db: AsyncSession,
    page: int = 1,
    limit: int = 20,
    session_id: Optional[UUID] = None,
    user_id: Optional[UUID] = None,
    status: Optional[str] = None,
    provider: Optional[str] = None,
) -> TraceListResponse:
    offset = (page - 1) * limit
    query = sa.select(Trace)
    count_query = sa.select(sa.func.count()).select_from(Trace)

    filters = []
    if session_id:
        filters.append(Trace.session_id == session_id)
    if user_id:
        filters.append(Trace.user_id == user_id)
    if status:
        filters.append(Trace.status == status)
    if provider:
        filters.append(Trace.provider == provider)

    if filters:
        query = query.where(*filters)
        count_query = count_query.where(*filters)

    count_result = await db.execute(count_query)
    total = count_result.scalar_one()

    result = await db.execute(query.order_by(Trace.created_at.desc()).offset(offset).limit(limit))
    traces = result.scalars().all()

    return TraceListResponse(
        traces=[TraceOut.model_validate(t) for t in traces],
        total=total,
        page=page,
        limit=limit,
    )


async def get_trace(db: AsyncSession, trace_id: str) -> Optional[TraceDetail]:
    result = await db.execute(sa.select(Trace).where(Trace.trace_id == trace_id))
    trace = result.scalar_one_or_none()
    if not trace:
        return None
    return TraceDetail.model_validate(trace)


async def get_metrics(db: AsyncSession, hours: int = 24) -> MetricsResponse:
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    # Use raw SQL so date_trunc('hour', ...) is a SQL literal, not a bind param.
    # SQLAlchemy parameterizes the 'hour' string which confuses PostgreSQL's
    # GROUP BY matching, causing a GroupingError.
    result = await db.execute(
        sa.text("""
            SELECT
                date_trunc('hour', created_at)           AS hour,
                avg(latency_ms)                           AS avg_latency,
                coalesce(sum(total_tokens), 0)            AS tokens,
                count(*)                                  AS requests,
                sum(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errors
            FROM obs_traces
            WHERE created_at >= :since
            GROUP BY date_trunc('hour', created_at)
            ORDER BY date_trunc('hour', created_at)
        """),
        {"since": since},
    )
    rows = result.all()

    def fmt(dt) -> str:
        return dt.isoformat() if dt else ""

    return MetricsResponse(
        latency=[TimeSeriesPoint(timestamp=fmt(r.hour), value=float(r.avg_latency or 0)) for r in rows],
        tokens=[TimeSeriesPoint(timestamp=fmt(r.hour), value=float(r.tokens)) for r in rows],
        requests=[TimeSeriesPoint(timestamp=fmt(r.hour), value=float(r.requests)) for r in rows],
        errors=[TimeSeriesPoint(timestamp=fmt(r.hour), value=float(r.errors)) for r in rows],
    )


async def get_sessions_analytics(db: AsyncSession, page: int = 1, limit: int = 20) -> SessionListResponse:
    offset = (page - 1) * limit

    count_q = await db.execute(
        sa.select(sa.func.count(sa.func.distinct(Trace.session_id))).where(Trace.session_id.isnot(None))
    )
    total = count_q.scalar_one()

    result = await db.execute(
        sa.select(
            Trace.session_id,
            sa.func.count().label("trace_count"),
            sa.func.coalesce(sa.func.sum(Trace.total_tokens), 0).label("total_tokens"),
            sa.func.coalesce(sa.func.sum(sa.cast(Trace.estimated_cost_usd, sa.Float)), 0.0).label("total_cost"),
            sa.func.avg(Trace.latency_ms).label("avg_latency"),
            sa.func.max(Trace.created_at).label("last_trace_at"),
        )
        .where(Trace.session_id.isnot(None))
        .group_by(Trace.session_id)
        .order_by(sa.func.max(Trace.created_at).desc())
        .offset(offset)
        .limit(limit)
    )
    rows = result.all()

    sessions = [
        SessionAnalytics(
            session_id=r.session_id,
            trace_count=r.trace_count,
            total_tokens=r.total_tokens,
            total_cost_usd=float(r.total_cost),
            avg_latency_ms=float(r.avg_latency or 0),
            last_trace_at=r.last_trace_at,
        )
        for r in rows
    ]
    return SessionListResponse(sessions=sessions, total=total)
