import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Trace(Base):
    __tablename__ = "obs_traces"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=sa.text("gen_random_uuid()"))
    trace_id: Mapped[str] = mapped_column(sa.String(64), nullable=False, unique=True, index=True)

    # Span hierarchy
    name: Mapped[Optional[str]] = mapped_column(sa.String(200), nullable=True)
    span_type: Mapped[str] = mapped_column(sa.String(20), nullable=False, default="generation")
    parent_trace_id: Mapped[Optional[str]] = mapped_column(sa.String(64), nullable=True, index=True)
    sequence: Mapped[int] = mapped_column(sa.Integer, nullable=False, default=0)

    provider: Mapped[str] = mapped_column(sa.String(50), nullable=False)
    model: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    status: Mapped[str] = mapped_column(sa.String(20), nullable=False, default="pending")

    session_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    conversation_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)

    started_at: Mapped[Optional[datetime]] = mapped_column(sa.DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(sa.DateTime(timezone=True), nullable=True)
    latency_ms: Mapped[Optional[int]] = mapped_column(sa.Integer, nullable=True)
    first_token_latency_ms: Mapped[Optional[int]] = mapped_column(sa.Integer, nullable=True)

    temperature: Mapped[Optional[float]] = mapped_column(sa.Float, nullable=True)
    max_tokens: Mapped[Optional[int]] = mapped_column(sa.Integer, nullable=True)

    prompt_tokens: Mapped[Optional[int]] = mapped_column(sa.Integer, nullable=True)
    completion_tokens: Mapped[Optional[int]] = mapped_column(sa.Integer, nullable=True)
    total_tokens: Mapped[Optional[int]] = mapped_column(sa.Integer, nullable=True)
    estimated_cost_usd: Mapped[Optional[Decimal]] = mapped_column(sa.Numeric(12, 8), nullable=True)

    input_preview: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)
    output_preview: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)

    error_type: Mapped[Optional[str]] = mapped_column(sa.String(100), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc), server_default=sa.text("now()"),
    )

    stream_events: Mapped[list["StreamEvent"]] = relationship(  # noqa: F821
        "StreamEvent", back_populates="trace", cascade="all, delete-orphan", lazy="selectin"
    )
