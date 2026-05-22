#!/bin/sh
set -e

echo "Running observability schema migrations..."
alembic upgrade head

echo "Starting observe-me ingestion backend..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
