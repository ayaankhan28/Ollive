"""Create observability tables

Revision ID: 001
Revises:
Create Date: 2025-01-01 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "obs_traces",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("trace_id", sa.String(64), nullable=False, unique=True),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("model", sa.String(100), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        # Context references — stored as UUIDs, no FK constraint to avoid cross-service coupling
        sa.Column("session_id", UUID(as_uuid=True), nullable=True),
        sa.Column("user_id", UUID(as_uuid=True), nullable=True),
        sa.Column("conversation_id", UUID(as_uuid=True), nullable=True),
        # Timing
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("latency_ms", sa.Integer, nullable=True),
        sa.Column("first_token_latency_ms", sa.Integer, nullable=True),
        # Model parameters
        sa.Column("temperature", sa.Float, nullable=True),
        sa.Column("max_tokens", sa.Integer, nullable=True),
        # Usage
        sa.Column("prompt_tokens", sa.Integer, nullable=True),
        sa.Column("completion_tokens", sa.Integer, nullable=True),
        sa.Column("total_tokens", sa.Integer, nullable=True),
        sa.Column("estimated_cost_usd", sa.Numeric(12, 8), nullable=True),
        # Content previews
        sa.Column("input_preview", sa.Text, nullable=True),
        sa.Column("output_preview", sa.Text, nullable=True),
        # Errors
        sa.Column("error_type", sa.String(100), nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_obs_traces_trace_id", "obs_traces", ["trace_id"])
    op.create_index("ix_obs_traces_session_id", "obs_traces", ["session_id"])
    op.create_index("ix_obs_traces_user_id", "obs_traces", ["user_id"])
    op.create_index("ix_obs_traces_status", "obs_traces", ["status"])
    op.create_index("ix_obs_traces_created_at", "obs_traces", ["created_at"])
    op.create_index("ix_obs_traces_provider", "obs_traces", ["provider"])

    op.create_table(
        "obs_stream_events",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("trace_id", sa.String(64), sa.ForeignKey("obs_traces.trace_id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("sequence_number", sa.Integer, nullable=False),
        sa.Column("content", sa.Text, nullable=True),
        sa.Column("latency_from_start_ms", sa.Integer, nullable=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_obs_stream_events_trace_id", "obs_stream_events", ["trace_id"])


def downgrade() -> None:
    op.drop_table("obs_stream_events")
    op.drop_table("obs_traces")
