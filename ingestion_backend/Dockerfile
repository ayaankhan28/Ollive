FROM python:3.10-slim

WORKDIR /app

RUN pip install --no-cache-dir \
    fastapi==0.115.0 \
    "uvicorn[standard]==0.30.0" \
    "sqlalchemy==2.0.36" \
    "alembic==1.13.3" \
    asyncpg==0.29.0 \
    psycopg2-binary==2.9.9 \
    python-dotenv==1.0.0 \
    "pydantic[email]==2.9.2" \
    "pydantic-settings==2.5.2" \
    "redis[hiredis]>=5.0.0"

COPY ingestion_backend/. .

EXPOSE 8001

ENTRYPOINT ["sh", "entrypoint.sh"]
