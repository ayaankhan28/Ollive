"""
Redis Streams consumer — reads from traces.raw, writes to PostgreSQL.

Flow:
  HTTP ingest endpoint  →  XADD traces.raw
                                  ↓
              XREADGROUP (consumer group: ingestion-workers)
                                  ↓
              ingest_service.ingest_trace()  →  PostgreSQL
              success → XACK
              failure (3 attempts) → XADD traces.dlq  →  XACK
"""

from __future__ import annotations

import asyncio
import json
import logging
import socket
from typing import Optional

from app.db.base import get_session_factory
from app.redis_client import (
    CONSUMER_GROUP,
    STREAM_DLQ,
    STREAM_TRACES,
    get_redis,
)
from app.schemas.ingest import TraceIngest
from app.services import ingest_service

logger = logging.getLogger(__name__)

# Unique name per replica so each pod gets its own slice of the stream
CONSUMER_NAME = socket.gethostname()

# Messages sitting in PEL for this long are assumed orphaned (prior consumer crashed)
_STALE_PENDING_MS = 5 * 60 * 1000  # 5 minutes

# How many messages to fetch per XREADGROUP call
_BATCH_SIZE = 10

_worker_task: Optional[asyncio.Task] = None


# ── Lifecycle ────────────────────────────────────────────────────────────────

async def start() -> None:
    global _worker_task
    _worker_task = asyncio.create_task(_run(), name="redis-consumer")
    logger.info(
        "Redis consumer started  stream=%s  group=%s  consumer=%s",
        STREAM_TRACES, CONSUMER_GROUP, CONSUMER_NAME,
    )


async def stop() -> None:
    global _worker_task
    if _worker_task:
        _worker_task.cancel()
        try:
            await _worker_task
        except asyncio.CancelledError:
            pass
    logger.info("Redis consumer stopped")


# ── Main loop ────────────────────────────────────────────────────────────────

async def _run() -> None:
    backoff = 1
    while True:
        try:
            redis = get_redis()
            await _ensure_consumer_group(redis)
            await _reclaim_stale_pending(redis)
            backoff = 1  # reset after a clean connection

            while True:
                # ">" = deliver only messages not yet delivered to this group
                entries = await redis.xreadgroup(
                    groupname=CONSUMER_GROUP,
                    consumername=CONSUMER_NAME,
                    streams={STREAM_TRACES: ">"},
                    count=_BATCH_SIZE,
                    block=2000,  # ms — avoids a busy-loop while idle
                )
                if not entries:
                    continue

                # entries: [(stream_name, [(msg_id, {field: val}), ...])]
                for _stream_name, messages in entries:
                    for msg_id, fields in messages:
                        await _process_message(redis, msg_id, fields)

        except asyncio.CancelledError:
            return
        except Exception as exc:
            logger.error(
                "Redis consumer error — retrying in %ds: %s", backoff, exc,
            )
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 60)


# ── Setup helpers ────────────────────────────────────────────────────────────

async def _ensure_consumer_group(redis) -> None:
    """Create consumer group if absent. MKSTREAM also creates the stream itself."""
    try:
        # id="$" → only consume messages published after the group is created.
        # Existing messages already in the stream are NOT replayed; they are
        # recovered via XAUTOCLAIM if they were stuck in a PEL from a prior crash.
        await redis.xgroup_create(STREAM_TRACES, CONSUMER_GROUP, id="$", mkstream=True)
        logger.info("Created consumer group '%s' on '%s'", CONSUMER_GROUP, STREAM_TRACES)
    except Exception as exc:
        if "BUSYGROUP" in str(exc):
            pass  # Already exists — normal on every restart after the first
        else:
            raise


async def _reclaim_stale_pending(redis) -> None:
    """
    On startup, take ownership of messages that were delivered to a now-dead
    consumer but never ACK'd (i.e. they sat in the PEL past _STALE_PENDING_MS).
    This is the Redis Streams equivalent of Kafka consumer group rebalancing.
    """
    try:
        result = await redis.xautoclaim(
            STREAM_TRACES,
            CONSUMER_GROUP,
            CONSUMER_NAME,
            min_idle_time=_STALE_PENDING_MS,
            start_id="0-0",
            count=100,
        )
        # redis-py v5 returns (next_start_id, [(msg_id, fields), ...], [deleted])
        messages = result[1] if isinstance(result, (list, tuple)) and len(result) > 1 else []
        if messages:
            logger.info("Reclaimed %d stale pending messages from PEL", len(messages))
            for msg_id, fields in messages:
                await _process_message(redis, msg_id, fields)
    except Exception as exc:
        logger.warning("Could not reclaim pending messages: %s", exc)


# ── Message processing ───────────────────────────────────────────────────────

async def _process_message(redis, msg_id: str, fields: dict) -> None:
    """
    Process one stream message:
      - Deserialise JSON payload → TraceIngest
      - Write to PostgreSQL via ingest_service
      - XACK on success
      - After 3 failed attempts: XADD to DLQ then XACK (so it leaves the PEL)
    """
    raw = fields.get("payload", "")

    for attempt in range(3):
        try:
            data = json.loads(raw)
            payload = TraceIngest.model_validate(data)

            factory = get_session_factory()
            async with factory() as db:
                await ingest_service.ingest_trace(db, payload)

            await redis.xack(STREAM_TRACES, CONSUMER_GROUP, msg_id)
            logger.debug("ACK  %s  trace=%s", msg_id, payload.trace_id)
            return

        except asyncio.CancelledError:
            raise
        except Exception as exc:
            if attempt < 2:
                wait = 2 ** attempt  # 1 s, 2 s
                logger.warning(
                    "Message %s attempt %d/3 failed (%s) — retrying in %ds",
                    msg_id, attempt + 1, exc, wait,
                )
                await asyncio.sleep(wait)
            else:
                logger.error(
                    "Message %s failed after 3 attempts — routing to DLQ: %s",
                    msg_id, exc,
                )
                await _send_to_dlq(redis, msg_id, raw, str(exc))
                await redis.xack(STREAM_TRACES, CONSUMER_GROUP, msg_id)


async def _send_to_dlq(redis, original_id: str, payload: str, error: str) -> None:
    """Append a failed message to the dead-letter stream for later inspection."""
    try:
        await redis.xadd(
            STREAM_DLQ,
            {
                "original_id": original_id,
                "payload": payload,
                "error": error[:500],
            },
            maxlen=10_000,
            approximate=True,
        )
        logger.info("DLQ  original_id=%s", original_id)
    except Exception as exc:
        logger.error("Could not write to DLQ stream: %s", exc)
