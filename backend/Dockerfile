FROM python:3.10-slim

WORKDIR /app

# Install poetry
RUN pip install --no-cache-dir poetry

# Don't create a virtualenv — we're already isolated in Docker
RUN poetry config virtualenvs.create false

# Copy dependency files first so this layer is cached unless deps change
COPY pyproject.toml poetry.lock* ./

# Install only production dependencies
RUN poetry install --only main --no-interaction --no-ansi --no-root

# Copy application source
COPY . .

EXPOSE 8000

ENTRYPOINT ["sh", "entrypoint.sh"]
