from fastapi import APIRouter

from app.api.v1.endpoints import analytics, health, ingest

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(ingest.router, tags=["ingest"])
api_router.include_router(analytics.router, tags=["analytics"])
