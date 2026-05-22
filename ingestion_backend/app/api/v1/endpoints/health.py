from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.config import settings

router = APIRouter()


@router.get("/health")
async def health():
    return JSONResponse(content={"status": "ok", "service": "observe-me-ingestion", "version": settings.VERSION})
