import uuid
from datetime import datetime
from typing import Optional

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class StreamEvent(Base):
    __tablename__ = "obs_stream_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=sa.text("gen_random_uuid()"))
    trace_id: Mapped[str] = mapped_column(sa.String(64), sa.ForeignKey("obs_traces.trace_id", ondelete="CASCADE"), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(sa.String(50), nullable=False)
    sequence_number: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    content: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)
    latency_from_start_ms: Mapped[Optional[int]] = mapped_column(sa.Integer, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False)

    trace: Mapped["Trace"] = relationship("Trace", back_populates="stream_events")  # noqa: F821

    def __repr__(self) -> str:
        return f"<StreamEvent trace_id={self.trace_id} seq={self.sequence_number} type={self.event_type}>"
