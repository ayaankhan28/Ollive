"""Async HTTP emitter — sends telemetry payloads to the ingestion backend."""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

logger = logging.getLogger(__name__)

_BATCH_ENDPOINT = "/api/v1/ingest/trace"
_RETRY_ATTEMPTS = 2


class TelemetryEmitter:
    """Background queue-based emitter. Must be started/stopped with the app lifecycle."""

    def __init__(self, endpoint: str, api_key: Optional[str] = None) -> None:
        self.endpoint = endpoint.rstrip("/")
        self.api_key = api_key
        self._queue: asyncio.Queue = asyncio.Queue(maxsize=1000)
        self._worker_task: Optional[asyncio.Task] = None
        self._http: Optional[object] = None  # httpx.AsyncClient, imported lazily

    async def start(self) -> None:
        import httpx
        self._http = httpx.AsyncClient(timeout=10.0)
        self._worker_task = asyncio.create_task(self._process_queue(), name="observe-me-emitter")
        logger.info("observe-me emitter started → %s", self.endpoint)

    async def stop(self) -> None:
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass
        if self._http:
            await self._http.aclose()
        logger.info("observe-me emitter stopped")

    async def enqueue(self, payload: dict) -> None:
        try:
            self._queue.put_nowait(payload)
        except asyncio.QueueFull:
            logger.warning("observe-me queue full — dropping trace %s", payload.get("trace_id"))

    async def _process_queue(self) -> None:
        while True:
            try:
                payload = await self._queue.get()
                await self._send_with_retry(payload)
                self._queue.task_done()
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.debug("observe-me emit error: %s", exc)

    async def _send_with_retry(self, payload: dict) -> None:
        import httpx
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["X-API-Key"] = self.api_key
        url = f"{self.endpoint}{_BATCH_ENDPOINT}"
        for attempt in range(_RETRY_ATTEMPTS):
            try:
                resp = await self._http.post(url, json=payload, headers=headers)
                if resp.status_code < 500:
                    return
            except (httpx.ConnectError, httpx.TimeoutException):
                if attempt == _RETRY_ATTEMPTS - 1:
                    return
                await asyncio.sleep(0.5 * (attempt + 1))
            except Exception:
                return
