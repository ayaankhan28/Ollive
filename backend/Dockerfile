FROM python:3.10-slim

WORKDIR /app

RUN pip install --no-cache-dir poetry
RUN poetry config virtualenvs.create false

# Install the observe-me SDK from the repo root (build context = repo root)
COPY sdk /sdk
RUN pip install --no-cache-dir /sdk

# Install backend dependencies
# poetry lock --no-update regenerates the lock file when pyproject.toml changes
# without upgrading already-locked packages.
COPY backend/pyproject.toml backend/poetry.lock* ./
RUN poetry lock --no-interaction --no-ansi \
 && poetry install --only main --no-interaction --no-ansi --no-root

# Copy backend source
COPY backend/. .

EXPOSE 8000

ENTRYPOINT ["sh", "entrypoint.sh"]
