import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_db
from app.schemas.ingest import TraceIngest, TraceIngestResponse
from app.services import ingest_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/ingest/trace", response_model=TraceIngestResponse, status_code=202)
async def ingest_trace(payload: TraceIngest, db: AsyncSession = Depends(get_db)):
    try:
        await ingest_service.ingest_trace(db, payload)
        return TraceIngestResponse(trace_id=payload.trace_id)
    except Exception as e:
        logger.error("Ingest error for trace %s: %s", payload.trace_id, e)
        raise HTTPException(status_code=500, detail="Ingestion failed")
