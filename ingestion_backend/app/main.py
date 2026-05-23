import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.config import settings
from app.db.base import close_db, init_db
from app.redis_client import close_redis
from app.workers import redis_consumer

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting observe-me ingestion backend...")
    await init_db()
    await redis_consumer.start()
    yield
    logger.info("Shutting down observe-me ingestion backend...")
    await redis_consumer.stop()
    await close_redis()
    await close_db()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="observe-me LLM observability ingestion and analytics API",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    ms = (time.time() - start) * 1000
    logger.debug("%s %s → %d (%.0fms)", request.method, request.url.path, response.status_code, ms)
    return response


app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get("/")
async def root():
    return JSONResponse(content={"status": "ok", "service": "observe-me-ingestion", "version": settings.VERSION, "docs": "/docs"})
