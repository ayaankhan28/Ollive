"""Add span hierarchy fields to obs_traces

Revision ID: 002
Revises: 001
Create Date: 2025-01-02 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("obs_traces", sa.Column("name",            sa.String(200), nullable=True))
    op.add_column("obs_traces", sa.Column("span_type",       sa.String(20),  nullable=True, server_default="generation"))
    op.add_column("obs_traces", sa.Column("parent_trace_id", sa.String(64),  nullable=True))
    op.add_column("obs_traces", sa.Column("sequence",        sa.Integer,     nullable=True, server_default="0"))

    op.create_index("ix_obs_traces_parent_trace_id", "obs_traces", ["parent_trace_id"])

    # Backfill name for existing rows
    op.execute("UPDATE obs_traces SET name = 'llm.' || provider WHERE name IS NULL")
    op.execute("UPDATE obs_traces SET span_type = 'generation' WHERE span_type IS NULL")


def downgrade() -> None:
    op.drop_index("ix_obs_traces_parent_trace_id", "obs_traces")
    op.drop_column("obs_traces", "sequence")
    op.drop_column("obs_traces", "parent_trace_id")
    op.drop_column("obs_traces", "span_type")
    op.drop_column("obs_traces", "name")
