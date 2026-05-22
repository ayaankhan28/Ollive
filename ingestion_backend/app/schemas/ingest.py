from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class StreamEventPayload(BaseModel):
    event_type: str
    sequence_number: int
    content: Optional[str] = None
    latency_from_start_ms: Optional[int] = None
    timestamp: datetime


class TraceIngest(BaseModel):
    trace_id: str = Field(..., min_length=1, max_length=64)
    name: Optional[str] = None
    span_type: str = "generation"
    parent_trace_id: Optional[str] = None
    sequence: int = 0

    provider: str = Field(..., min_length=1, max_length=50)
    model: str = Field(..., min_length=1, max_length=100)
    status: str = "success"

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

    stream_events: list[StreamEventPayload] = Field(default_factory=list)


class TraceIngestResponse(BaseModel):
    trace_id: str
    status: str = "accepted"
