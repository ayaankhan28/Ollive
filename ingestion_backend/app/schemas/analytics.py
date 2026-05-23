from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class StreamEventOut(BaseModel):
    event_type: str
    sequence_number: int
    content: Optional[str] = None
    latency_from_start_ms: Optional[int] = None
    timestamp: datetime
    model_config = {"from_attributes": True}


class TraceOut(BaseModel):
    id: UUID
    trace_id: str
    name: Optional[str] = None
    span_type: str = "generation"
    parent_trace_id: Optional[str] = None
    sequence: int = 0
    provider: str
    model: str
    status: str
    session_id: Optional[UUID] = None
    user_id: Optional[UUID] = None
    conversation_id: Optional[UUID] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    latency_ms: Optional[int] = None
    first_token_latency_ms: Optional[int] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    total_tokens: Optional[int] = None
    estimated_cost_usd: Optional[float] = None
    input_preview: Optional[str] = None
    output_preview: Optional[str] = None
    error_type: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime
    model_config = {"from_attributes": True}


class TraceDetail(TraceOut):
    stream_events: list[StreamEventOut] = []
    children: list[TraceOut] = []   # child spans ordered by sequence


class TraceListResponse(BaseModel):
    traces: list[TraceOut]
    total: int
    page: int
    limit: int


class ProviderBreakdown(BaseModel):
    provider: str
    count: int
    total_tokens: Optional[int] = None
    total_cost_usd: Optional[float] = None


class StatusBreakdown(BaseModel):
    status: str
    count: int


class SummaryResponse(BaseModel):
    total_traces: int
    successful_traces: int
    failed_traces: int
    success_rate: float
    total_tokens: int
    total_cost_usd: float
    avg_latency_ms: Optional[float] = None
    p95_latency_ms: Optional[int] = None
    traces_last_24h: int
    traces_last_7d: int
    by_provider: list[ProviderBreakdown]
    by_status: list[StatusBreakdown]


class TimeSeriesPoint(BaseModel):
    timestamp: str
    value: float


class MetricsResponse(BaseModel):
    latency: list[TimeSeriesPoint]
    tokens: list[TimeSeriesPoint]
    requests: list[TimeSeriesPoint]
    errors: list[TimeSeriesPoint]


class ErrorRatePoint(BaseModel):
    timestamp: str
    errors: int
    total: int
    error_rate: float  # 0–100 percentage


class ErrorRateResponse(BaseModel):
    data: list[ErrorRatePoint]
    hours: int


class SessionAnalytics(BaseModel):
    session_id: UUID
    trace_count: int
    total_tokens: int
    total_cost_usd: float
    avg_latency_ms: float
    last_trace_at: Optional[datetime] = None


class SessionListResponse(BaseModel):
    sessions: list[SessionAnalytics]
    total: int


class SessionDetailResponse(BaseModel):
    """All agent turns for one session, with child spans included."""
    session_id: UUID
    turns: list[TraceDetail]       # root traces oldest → newest, each with .children
    total_turns: int
    total_tokens: int
    total_cost_usd: float
