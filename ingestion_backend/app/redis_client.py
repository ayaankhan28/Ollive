"""Redis connection singleton shared across the ingestion backend."""

from __future__ import annotations

import logging
from typing import Optional

import redis.asyncio as aioredis

from app.config import settings

logger = logging.getLogger(__name__)

# Stream / group names — treat like Kafka topic names
STREAM_TRACES = "traces.raw"
STREAM_DLQ    = "traces.dlq"
CONSUMER_GROUP = "ingestion-workers"

_redis: Optional[aioredis.Redis] = None


def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
        )
    return _redis


async def close_redis() -> None:
    global _redis
    if _redis is not None:
        await _redis.aclose()
        _redis = None
        logger.info("Redis connection closed")
