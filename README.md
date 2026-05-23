# Ollive — LLM Observability Platform

A full-stack LLM inference logging and observability system. Built around a multi-provider chatbot with a custom SDK that captures every inference call, an event-driven ingestion pipeline, a real-time analytics dashboard, and a production Kubernetes deployment.

---

## What This Is

Ollive is two products in one repo:

1. **Ollive Chat** — a production chatbot (Anthropic + OpenAI + Gemini) with WebSocket streaming, tool use, and session management.
2. **observe-me** — a Langfuse/Helicone-style observability layer: a pip SDK, an ingestion backend, and an admin dashboard that shows real-time traces, latency, cost, and error rates.

The chatbot is the demo client that uses the SDK. The SDK is the product.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser                                                            │
│  ┌──────────────────┐      ┌─────────────────────────────────────┐ │
│  │  Ollive Chat UI  │      │  observe-me Admin Panel             │ │
│  │  (ollivechat.    │      │  (observe-me.netlify.app)           │ │
│  │   netlify.app)   │      │  Traces / Sessions / Metrics        │ │
│  └────────┬─────────┘      └──────────────┬────────────────────┘ │
└───────────┼────────────────────────────────┼────────────────────────┘
            │ WSS / HTTPS                    │ HTTPS (direct browser call)
            ▼                                ▼
┌───────────────────────┐      ┌──────────────────────────────────────┐
│  Chat Backend         │      │  Ingestion Backend                   │
│  FastAPI + WebSocket  │      │  FastAPI                             │
│  Port 8000 / 30800    │      │  Port 8001 / 30801                   │
│                       │      │                                      │
│  Providers:           │      │  POST /ingest/trace → XADD           │
│  Anthropic ──┐        │      │  GET  /analytics/*                   │
│  OpenAI   ──▶│@trace  │ HTTP │  GET  /events/traces (SSE)           │
│  Gemini   ──┘  _llm   │─────▶│                                      │
│               ↓       │      └──────────────┬───────────────────────┘
│         observe-me    │                     │ XREADGROUP
│            SDK        │                     ▼
└───────────────────────┘      ┌──────────────────────────────────────┐
                               │  Redis Streams                       │
                               │  traces.raw   ← XADD (202 returned) │
                               │  traces.dlq   ← failed after 3x     │
                               └──────────────┬───────────────────────┘
                                              │ XREADGROUP
                                              │ ingestion-workers group
                                              │ (3 consumers = 3 pods)
                                              ▼
                               ┌──────────────────────────────────────┐
                               │  PostgreSQL                          │
                               │  users / sessions / conversations    │
                               │  obs_traces / obs_stream_events      │
                               └──────────────────────────────────────┘
```

### Ingestion Flow Detail

```
SDK (in chat backend)
  └─ @trace_llm decorator wraps every LLM call
      └─ on completion → asyncio.Queue (non-blocking)
          └─ TelemetryEmitter worker → HTTP POST /api/v1/ingest/trace
                                             │
                                       XADD traces.raw   → 202 returned immediately
                                             │
                               XREADGROUP (block 2s, batch 10)
                                             │
                                   ingest_service.ingest_trace()
                                             │
                                   ┌─── success ──→ XACK
                                   └─── fail ─────→ retry (1s, 2s)
                                                      └─ fail 3x → XADD traces.dlq → XACK
```

---

## Repository Structure

```
Ollive/
├── backend/                  # Chat backend (FastAPI, WebSocket, LLM providers)
│   ├── app/
│   │   ├── api/v1/endpoints/ # chat.py, sessions.py, users.py, health.py
│   │   ├── core/llm/         # anthropic_provider.py, openai_provider.py, gemini_provider.py
│   │   ├── db/               # SQLAlchemy models, migrations
│   │   └── services/         # chat_service.py, session_service.py
│   ├── docker-compose.yml    # One-command local setup (all services)
│   └── Dockerfile
│
├── ingestion_backend/        # observe-me ingestion & analytics (FastAPI)
│   ├── app/
│   │   ├── api/v1/endpoints/ # ingest.py, analytics.py, health.py
│   │   ├── db/models/        # traces.py, stream_events.py
│   │   ├── services/         # ingest_service.py, analytics_service.py
│   │   ├── workers/          # redis_consumer.py (XREADGROUP loop)
│   │   └── redis_client.py   # Stream names, consumer group, singleton
│   └── Dockerfile
│
├── sdk/                      # observe-me Python SDK
│   └── observe_me/
│       ├── client.py         # ObserveMeClient
│       ├── tracer.py         # Trace span object
│       ├── emitter.py        # Async HTTP emitter + queue
│       ├── decorators.py     # @trace_llm
│       ├── redactor.py       # PII masking (email, phone, API keys)
│       ├── pricing.py        # Cost estimation (Anthropic, OpenAI, Gemini)
│       └── context.py        # Context vars for session/user propagation
│
├── frontend/                 # Ollive Chat UI (Next.js 14)
│   └── components/chat/      # ChatInterface, ChatInput, ChatMessage, ChatSidebar
│
├── admin_panel/              # observe-me Dashboard (Next.js 15)
│   ├── app/dashboard/        # Overview, Traces, Sessions, Metrics pages
│   └── components/           # ErrorRateChart, LiveTraceFeed, LiveSpanTree
│
├── k8s/                      # Kubernetes manifests (K3s single-node)
│   ├── 00-namespace.yaml
│   ├── 01-configmap.yaml
│   ├── 02-secrets.example.yaml
│   ├── 03-postgres.yaml
│   ├── 04-redis.yaml
│   ├── 05-ingestion.yaml     # 3 replicas → 3 Redis consumers
│   └── 06-backend.yaml
│
└── .github/workflows/
    ├── ci.yml                # Syntax check + Docker build on PR
    └── deploy.yml            # Build → push ghcr.io → kubectl rollout on main
```

---

## Local Setup — One Command

### Prerequisites

- Docker Desktop
- At least one LLM API key (Anthropic, OpenAI, or Gemini)

### 1. Clone and configure

```bash
git clone https://github.com/ayaankhan28/Ollive.git
cd Ollive

cp backend/.env.example backend/.env
```

Edit `backend/.env`:

```env
ANTHROPIC_API_KEY=sk-ant-your-key-here   # required for Anthropic
GEMINI_API_KEY=AIza-your-key-here         # required for Gemini
OPENAI_API_KEY=sk-your-key-here           # required for OpenAI
TAVILY_API_KEY=tvly-your-key-here         # optional, enables web search tool
```

### 2. Start everything

```bash
cd backend
docker-compose up
```

This starts:

| Service | URL | What it is |
|---------|-----|------------|
| Chat backend | http://localhost:8000 | FastAPI + WebSocket |
| Ingestion backend | http://localhost:8001 | FastAPI + Redis consumer |
| PostgreSQL | localhost:5433 | Database |
| Redis | localhost:6379 | Event stream |

### 3. Start frontends

```bash
# Chat UI
cd frontend
cp .env.example .env.local   # or create with:
echo "NEXT_PUBLIC_BACKEND_WS_URL=ws://localhost:8000
NEXT_PUBLIC_BACKEND_HTTP_URL=http://localhost:8000" > .env.local
npm install && npm run dev    # http://localhost:3000

# Admin panel (separate terminal)
cd admin_panel
echo "NEXT_PUBLIC_INGESTION_URL=http://localhost:8001" > .env.local
pnpm install && pnpm run dev  # http://localhost:3001
```

### 4. Send a message in the chat UI

Every LLM call creates a trace automatically. Open the admin panel at http://localhost:3001 to see it.

---

## SDK Usage

The `observe-me` SDK instruments any Python LLM call with one decorator:

```python
from observe_me import ObserveMeClient, trace_llm

client = ObserveMeClient(endpoint="http://localhost:8001")
await client.start()

class MyLLMProvider:
    @trace_llm
    async def stream_chat(self, messages, system=""):
        async for chunk in openai_client.stream(...):
            yield chunk
        self._last_usage = (prompt_tokens, completion_tokens)
```

The decorator captures:
- Provider and model name (inferred from class)
- Total latency and first-token latency
- Token counts and estimated cost
- Input/output preview (truncated to 500 chars, PII-redacted)
- Errors and cancellations
- Streaming chunk events

**PII redaction** runs automatically on all preview fields before storage:

```
user@email.com    → [email]
415-555-1234      → [phone]
sk-abc123...      → [api-key]
Bearer eyJhb...   → Bearer [token]
```

**Async, non-blocking.** Telemetry is enqueued to an `asyncio.Queue` and emitted in a background task. Chat response time is never affected.

---

## Database Schema

Two sets of tables in one PostgreSQL database (`ollive_chat`):

### Chat tables (backend)

```sql
users         (id UUID, name, email UNIQUE, created_at, updated_at)
sessions      (id UUID, user_id FK, title, created_at, updated_at)
conversations (id UUID, session_id FK, user_id FK, role, content TEXT, created_at)
```

### Observability tables (ingestion backend, prefixed `obs_`)

```sql
obs_traces (
  id UUID, trace_id VARCHAR(64) UNIQUE,
  name, span_type,           -- 'trace' | 'generation' | 'tool' | 'span'
  parent_trace_id,           -- links child spans to root
  sequence INT,
  provider, model, status,   -- 'success' | 'error' | 'cancelled'
  session_id FK, user_id FK, conversation_id FK,
  started_at, completed_at,
  latency_ms, first_token_latency_ms,
  temperature, max_tokens,
  prompt_tokens, completion_tokens, total_tokens,
  estimated_cost_usd NUMERIC,
  input_preview VARCHAR(500),   -- truncated + PII-redacted
  output_preview VARCHAR(500),  -- truncated + PII-redacted
  error_type, error_message,
  created_at
)

obs_stream_events (
  id UUID, trace_id VARCHAR(64) FK,
  event_type, sequence_number,
  content, latency_from_start_ms, timestamp
)
```

**Schema decisions:**
- Metrics (tokens, cost, latency) are embedded in `obs_traces` rather than separate tables. This avoids joins for the common query path (list traces with metrics). A separate `usage_metrics` table would only pay off at 100M+ rows with heavy aggregation workloads.
- `parent_trace_id` enables arbitrary span depth without a separate `spans` table. A root agent turn (`span_type='trace'`) has multiple child generations and tool calls.
- `input_preview` / `output_preview` are capped at 500 chars. Full prompt/response is never stored — safe by default.

---

## API Reference

### Chat Backend (port 8000)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/users` | Create or retrieve user by email |
| `GET` | `/api/v1/sessions/user/{user_id}` | List all sessions |
| `POST` | `/api/v1/sessions` | Create session |
| `DELETE` | `/api/v1/sessions/{id}` | Delete session |
| `GET` | `/api/v1/sessions/{id}/messages` | Get message history |
| `WS` | `/api/v1/ws/chat/{client_id}` | Streaming chat WebSocket |

**WebSocket message format:**
```json
// Client → Server
{"type": "chat", "message": "Hello", "session_id": null, "user_id": "uuid"}
{"type": "stop"}

// Server → Client
{"type": "session_info", "session_id": "uuid", "title": "..."}
{"type": "chunk", "content": "Hello"}
{"type": "tool_start", "tool_name": "web_search", "tool_input": {...}}
{"type": "done", "session_id": "uuid"}
{"type": "error", "message": "..."}
```

### Ingestion Backend (port 8001)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/ingest/trace` | Ingest trace (returns 202 immediately) |
| `GET` | `/api/v1/analytics/summary` | Overall stats |
| `GET` | `/api/v1/analytics/traces` | List traces (paginated, filterable) |
| `GET` | `/api/v1/analytics/traces/{id}` | Trace detail with child spans |
| `GET` | `/api/v1/analytics/metrics?hours=24` | Latency/throughput/error time-series |
| `GET` | `/api/v1/analytics/errors?hours=24` | Error rate time-series |
| `GET` | `/api/v1/analytics/sessions` | List sessions |
| `GET` | `/api/v1/analytics/sessions/{id}` | Session detail |
| `GET` | `/api/v1/events/traces` | SSE stream for real-time traces |

---

## Multi-Provider Support

Three LLM providers are supported with automatic fallback:

```
Anthropic → OpenAI → Gemini
```

If Anthropic fails, the request falls through to OpenAI, then Gemini. The first success wins. The provider and model that served the request are stored on every trace.

**Default models:**
- Anthropic: `claude-sonnet-4-6`
- OpenAI: `gpt-4o-mini`
- Gemini: `gemini-2.5-flash`

---

## Event-Driven Architecture

Redis Streams are used as the message bus between the HTTP ingest endpoint and the database writer — the same role Kafka plays at larger scale.

**Why Redis Streams over Kafka:**
- Same semantics (consumer groups, ACK, dead-letter, replay by offset) with 1/10th the operational overhead
- Kafka becomes appropriate at 10M+ events/day or when multiple independent consumer services need the same stream
- AOF persistence (`--appendonly yes`) survives Redis restarts without message loss

**Why Redis Streams over asyncio.Queue:**
- `asyncio.Queue` is in-process — two replicas = two queues = messages split across instances
- Redis Streams are shared across all replicas; consumer group ensures each message is processed exactly once
- Messages survive pod restarts

**Consumer group behaviour:**
- Group name: `ingestion-workers`
- Consumer name: `socket.gethostname()` — unique per K8s pod automatically
- On startup, `XAUTOCLAIM` recovers messages stuck in PEL for >5 minutes (prior consumer crashed)
- `XACK` on success; `XADD traces.dlq` + `XACK` after 3 failures

---

## Kubernetes Deployment

Deployed on K3s (single-node) on a DigitalOcean droplet. SSL termination via Caddy.

```
Internet → Caddy (SSL) → NodePort 30800 → backend pod
                       → NodePort 30801 → ingestion pod ×3
```

### First deploy

```bash
# 1. Install K3s on your server
curl -sfL https://get.k3s.io | sh -

# 2. Copy kubeconfig to local machine
# Replace 127.0.0.1 with your server IP in the file

# 3. Build and push images
docker build --platform linux/amd64 -f backend/Dockerfile \
  -t ghcr.io/YOUR_USERNAME/ollive-backend:latest .
docker push ghcr.io/YOUR_USERNAME/ollive-backend:latest

docker build --platform linux/amd64 -f ingestion_backend/Dockerfile \
  -t ghcr.io/YOUR_USERNAME/ollive-ingestion:latest .
docker push ghcr.io/YOUR_USERNAME/ollive-ingestion:latest

# 4. Deploy
export KUBECONFIG=~/.kube/your-config
kubectl apply -f k8s/00-namespace.yaml
kubectl apply -f k8s/01-configmap.yaml
cp k8s/02-secrets.example.yaml k8s/02-secrets.yaml
# Fill in real API keys in 02-secrets.yaml
kubectl apply -f k8s/02-secrets.yaml
kubectl apply -f k8s/03-postgres.yaml
kubectl apply -f k8s/04-redis.yaml
kubectl wait --for=condition=ready pod -l app=postgres -n ollive --timeout=60s
kubectl wait --for=condition=ready pod -l app=redis -n ollive --timeout=60s
kubectl apply -f k8s/05-ingestion.yaml
kubectl apply -f k8s/06-backend.yaml

# 5. Add image pull secret for ghcr.io
kubectl create secret docker-registry ghcr-secret \
  --docker-server=ghcr.io \
  --docker-username=YOUR_USERNAME \
  --docker-password=YOUR_PAT \
  --namespace=ollive
```

### Verify

```bash
kubectl get pods -n ollive
# Expected: backend ×1, ingestion ×3, postgres ×1, redis ×1 — all Running

# Check Redis consumer group
kubectl exec -n ollive $(kubectl get pod -n ollive -l app=redis -o name | head -1) \
  -- redis-cli XINFO GROUPS traces.raw
# Expected: consumers=3, pending=0, lag=0
```

### CI/CD

Every push to `main`:
1. Build `ollive-backend` and `ollive-ingestion` images for `linux/amd64`
2. Tag with `latest` and `sha-<7-char-commit>`
3. Push to `ghcr.io`
4. Run `kubectl set image` on both deployments
5. Wait for rollout (120s timeout)

**GitHub secrets required:**
- `KUBE_CONFIG` — base64-encoded kubeconfig (`cat ~/.kube/config | base64`)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Chat backend | Python 3.10, FastAPI 0.115, SQLAlchemy 2.0, Alembic, asyncpg |
| Ingestion backend | Python 3.10, FastAPI 0.115, SQLAlchemy 2.0, redis-py 5.0 |
| SDK | Python 3.10, httpx 0.27, pydantic 2.5 |
| Chat frontend | Next.js 14, Zustand, react-markdown, Tailwind CSS |
| Admin panel | Next.js 15, Recharts, Tailwind CSS |
| Database | PostgreSQL 16 |
| Message queue | Redis 7 (Streams) |
| Container runtime | Docker / containerd (K3s) |
| Kubernetes | K3s v1.35 |
| SSL proxy | Caddy 2 |
| CI/CD | GitHub Actions |
| Registry | GitHub Container Registry (ghcr.io) |

---

## Design Decisions & Tradeoffs

### Why one PostgreSQL database for both services?

Both the chat backend and ingestion backend use the same PostgreSQL instance but separate table namespaces (`obs_` prefix for observability tables). In production, these would be separate databases — the ingestion backend treats `user_id` as an opaque string and has no FK dependency on the chat backend's `users` table.

The single-DB shortcut was chosen to keep `docker-compose up` truly one command. In a multi-tenant SaaS setup, the ingestion backend would have its own `sdk_clients` table (companies using the SDK) and the `user_id` on traces would be an opaque identifier passed by the SDK client.

### Why Redis Streams over Kafka?

Kafka provides identical semantics (consumer groups, ACK, DLQ, offset replay) but requires Zookeeper/KRaft and complex StatefulSet configuration in Kubernetes. For this throughput (~thousands of traces/day), Redis Streams with AOF persistence provides the same guarantees with a single pod. The switchover to Kafka is a config change: replace `XADD` with a Kafka producer and `XREADGROUP` with a Kafka consumer group.

### Why embed metrics in `obs_traces` instead of separate tables?

The most common query is "give me traces with their metrics for this session." A separate `usage_metrics` table would require a join on every request. At this scale, denormalization is cheaper. If the table grows beyond ~50M rows, partitioning by `created_at` is the first optimization, not normalization.

### Why asyncio.Queue in the SDK if Redis is the queue?

The SDK-side `asyncio.Queue` is a local buffer: it prevents the LLM response from being blocked if the HTTP POST to the ingestion endpoint is slow. The queue drains in a background task. If the ingestion backend is down, the SDK retries with exponential backoff before dropping. Redis is the queue on the **server side** — between receiving the HTTP POST and writing to PostgreSQL.

### Why not publish the SDK to PyPI yet?

The SDK is installed from source (`COPY sdk /sdk && pip install /sdk`) in both local and CI Docker builds. Publishing to PyPI requires classifiers, a changelog, and a release workflow. The one-line change when ready: replace the `COPY` lines in `Dockerfile` with `RUN pip install observe-me==0.1.0`.

---

## What I Would Improve With More Time

1. **Tests.** Zero test coverage is the biggest production risk. Priority: SDK unit tests (`tracer.py`, `pricing.py`, `redactor.py`) and ingestion API integration tests with a test database.

2. **SDK on PyPI.** Publish `observe-me` as a proper package. Add classifiers, changelog, and a `release.yml` workflow that publishes on tag push.

3. **Ingestion backend authentication.** The ingest endpoint accepts payloads from anyone. A simple `X-API-Key` header check against an env var is 10 lines of code and prevents fake traces.

4. **Dead-letter replay UI.** Messages in `traces.dlq` are visible in Redis but not in the admin panel. A simple endpoint to list DLQ entries and replay them would complete the reliability story.

5. **P50/P99 latency.** The analytics service has P95 but not P50 or P99. Both are single `percentile_cont` additions to the existing query.

6. **OpenTelemetry compatibility.** The current span hierarchy (`parent_trace_id`) is a custom format. Emitting W3C `traceparent` headers and OTEL-compatible spans would allow traces to be visualized in Jaeger or Grafana Tempo.

7. **Horizontal autoscaling.** The ingestion backend is stateless and Kafka-ready. A `HorizontalPodAutoscaler` on CPU/memory would let it scale automatically during traffic spikes.

---

## Live Demo

- **Chat:** https://ollivechat.netlify.app
- **Admin:** https://observe-me.netlify.app
- **API:** https://api.143.110.252.141.nip.io
- **Ingestion:** https://ingest.143.110.252.141.nip.io
