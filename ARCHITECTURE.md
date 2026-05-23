# Architecture Notes — observe-me

> A detailed technical explanation of how the system works, why each decision was made, and what the failure assumptions are.

---

## Ingestion Flow

### End-to-end path of a single LLM call

```
1. User sends message in chat UI
         │
         ▼
2. Chat backend receives WebSocket message
         │
         ▼
3. LLM provider stream begins (Anthropic / OpenAI / Gemini)
   The @trace_llm decorator on BaseLLMProvider.stream_chat() starts a Trace span:
     - records started_at
     - sets trace as the active span in contextvars
         │
         ▼
4. Tokens stream to the browser (WebSocket chunks)
   on_chunk() is called per token:
     - records first_chunk_at on first token
     - appends to _chunks list (for output_preview)
     - records StreamEvent (up to 200 per trace)
         │
         ▼
5. Stream completes
   complete(prompt_tokens, completion_tokens) is called:
     - computes latency_ms, first_token_latency_ms
     - computes estimated_cost_usd via pricing.py lookup table
     - truncates input_preview and output_preview to 500 chars
     - runs redact() on both previews (PII masking)
         │
         ▼
6. Trace.emit_nowait() is called (non-blocking)
   asyncio.get_running_loop().create_task(client._enqueue(payload))
   The chat response has already been sent — this does not block the user.
         │
         ▼
7. TelemetryEmitter picks up from asyncio.Queue(maxsize=1000)
   Background worker loop: _process_queue()
   Retries with exponential backoff (0.5s, 1.0s) before dropping.
         │
         ▼
8. HTTP POST /api/v1/ingest/trace → ingestion backend
   Payload: JSON-serialised TraceIngest (Pydantic-validated)
         │
         ▼
9. Ingest endpoint: XADD traces.raw {"payload": json}
   Returns 202 Accepted immediately.
   No database write in the HTTP handler.
         │
         ▼
10. Redis consumer worker (redis_consumer.py):
    XREADGROUP ingestion-workers <hostname> traces.raw > count=10 block=2000
         │
    ┌────┴────┐
    │ success │──→ ingest_service.ingest_trace() writes to PostgreSQL
    │         │    asyncio.create_task(broadcast(...)) → SSE clients (admin panel)
    │         │──→ XACK traces.raw ingestion-workers <msg_id>
    └─────────┘
    │ failure │──→ retry (attempt 1: sleep 1s, attempt 2: sleep 2s)
    │         │──→ after 3 failures: XADD traces.dlq + XACK (leaves PEL)
    └─────────┘
```

### Why the split between the SDK queue and Redis

The system has two queues in series, each solving a different problem:

**SDK-side asyncio.Queue (in chat backend process)**
- Decouples the LLM stream completion from the HTTP POST
- If the ingestion backend is slow or temporarily unavailable, the chat response is already sent
- Bounded at 1000 entries — drops on overflow rather than back-pressuring the chat

**Redis Stream (server-side, shared across all ingestion pods)**
- Decouples the HTTP acceptance (202) from the PostgreSQL write
- Survives ingestion backend pod restarts — messages stay in the stream
- Enables horizontal scaling: 3 pods form a consumer group, each processing a partition
- Provides a durable record of all messages — replay is possible by resetting the consumer group's last-delivered-id

---

## Logging Strategy

### What is captured

Every LLM call through the `@trace_llm` decorator produces one root `Trace` span plus N child spans (one per tool call or nested LLM call). This creates a complete span tree per agent turn:

```
agent-turn (span_type=trace, root)
├── llm.anthropic (span_type=generation)
├── tool.web_search (span_type=tool)
├── llm.anthropic (span_type=generation)
└── llm.anthropic (span_type=generation)
```

Each span records:

| Field | How captured |
|-------|-------------|
| `provider`, `model` | Extracted from the class instance by `@trace_llm` |
| `latency_ms` | `completed_at - started_at` |
| `first_token_latency_ms` | `first_chunk_at - started_at` |
| `prompt_tokens`, `completion_tokens` | Set via `self._last_usage = (p, c)` inside `_do_stream()` |
| `estimated_cost_usd` | `pricing.py` lookup table (Anthropic, OpenAI, Gemini per-model rates) |
| `input_preview` | First 500 chars of the prompt, PII-redacted |
| `output_preview` | First 500 chars of the response, PII-redacted |
| `status` | `success` / `error` / `cancelled` |
| `session_id`, `user_id`, `conversation_id` | Context vars set by `chat_service.py` before the LLM call |

### What is NOT captured

- Full prompt or response content (never stored, only previews)
- Raw tool inputs/outputs beyond 500-char preview
- User IP addresses
- Request headers

### PII Redaction

Runs on `input_preview` and `output_preview` before the payload leaves the SDK:

```python
# sdk/observe_me/redactor.py
patterns:
  email:    \b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b   → [email]
  phone:    US/intl phone formats                                      → [phone]
  OpenAI:   sk-[A-Za-z0-9]{20,}                                       → [api-key]
  Anthropic: sk-ant-[A-Za-z0-9\-_]{20,}                               → [api-key]
  Google:   AIza[0-9A-Za-z\-_]{35}                                    → [api-key]
  GitHub:   ghp_[A-Za-z0-9]{36}                                       → [api-key]
  Bearer:   Bearer\s+[A-Za-z0-9\-._~+/]+=*                           → Bearer [token]
  Generic:  (api_key|secret|password|token)[:=]<value>                → key=[redacted]
```

Redaction happens **in the SDK** before the payload is serialised and sent. The ingestion backend never sees raw PII. This means even if the ingestion backend is compromised, user data is already masked.

### Span hierarchy

`parent_trace_id` links child spans to their root. The admin panel uses this to render the span tree — it loads the root trace and all children in two queries, then assembles the tree client-side.

The `sequence` field preserves insertion order within a parent, since database commit order is not guaranteed when multiple child spans are written in rapid succession.

### Safe logging

- No middleware logs request bodies
- Uvicorn access logs record path and status only
- The `obs_stream_events` table stores raw chunk content, but only up to 200 events per trace, with each chunk being a small token fragment (< 10 chars typically)
- All previews are explicitly named `_preview` to signal they are truncated

---

## Scaling Considerations

### Current architecture (single node, K3s)

```
1 backend pod           (stateless, chat sessions in PostgreSQL)
3 ingestion pods        (stateless, form a Redis consumer group)
1 Redis pod             (AOF persistence, single shard)
1 PostgreSQL pod        (single primary, PVC-backed)
```

The 3 ingestion replicas are the only horizontal scale in the current setup. Each pod registers under its pod hostname in the `ingestion-workers` consumer group. Redis distributes messages across them automatically — no coordination needed at the application level.

### Bottlenecks and how to address them

**PostgreSQL write throughput**

Currently the bottleneck. Each trace produces 1 `INSERT` into `obs_traces` and N `INSERTs` into `obs_stream_events`. At 100 req/s with 5 spans each, that's 500+ writes/s — approaching single-instance limits.

Mitigations in order of complexity:
1. **Batch writes**: accumulate 50-100 traces in the consumer and use `executemany()` or `INSERT ... VALUES (…),(…)` — reduces round-trips by 50-100×
2. **Read replica**: route analytics queries to a read replica, keeping the primary for writes only
3. **Partitioning**: partition `obs_traces` by `created_at` (monthly). Queries scoped to the last 24h never touch older partitions.
4. **TimescaleDB**: drop-in PostgreSQL extension that turns `obs_traces` into a hypertable with automatic partitioning and compression

**Redis single shard**

Redis Streams are single-threaded per key. At ~50,000 XADD/s a single shard saturates.

Mitigations:
1. **Increase batch size**: `count=100` in XREADGROUP reduces Redis roundtrips per consumer iteration
2. **Shard by provider**: separate streams per provider (`traces.anthropic`, `traces.openai`) — each gets its own consumer group
3. **Redis Cluster**: hash-slots distribute streams across nodes — transparent to the application with minor client config changes
4. **Migrate to Kafka**: identical consumer group semantics, designed for millions of messages/day. The application code change is minimal (`XADD` → Kafka producer, `XREADGROUP` → Kafka consumer)

**Ingestion backend CPU**

Each consumer worker is a single coroutine doing one DB write at a time. To increase throughput:
1. **More replicas**: 3 → 10 pods, zero code change
2. **Async batching**: accumulate messages in-memory for 100ms, then bulk-insert. Reduces DB connections but adds latency.
3. **Separate worker process**: split the FastAPI server (HTTP) from the Redis consumer (worker) into separate deployments — scale them independently

**Frontend / admin panel**

Both are static Next.js exports (or Netlify serverless). The admin panel fetches data client-side directly from the ingestion backend — no Netlify hop. The only scaling concern is WebSocket connection limits on the chat backend.

The chat backend currently uses `uvicorn --workers 1` in production. For WebSocket scaling:
- Multiple workers share no state (WebSocket connections are per-process)
- A sticky load balancer (by session cookie) routes a user's connections to the same worker
- Alternatively, use a shared pub/sub (Redis) to broadcast events across workers

### K8s HorizontalPodAutoscaler

The ingestion backend is a good HPA candidate:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ingestion-hpa
  namespace: ollive
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ingestion
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 60
```

Each new pod automatically joins the `ingestion-workers` consumer group. Redis rebalances the PEL across the expanded group.

---

## Failure Handling Assumptions

### SDK failures

| Scenario | Behaviour | Assumption |
|----------|-----------|------------|
| Ingestion backend unreachable | SDK retries 2× with 0.5s/1.0s backoff, then drops the trace | Acceptable for observability: losing a trace is better than slowing chat |
| SDK asyncio.Queue full (1000 entries) | New traces are dropped with a warning log | If the queue is full for >1000 traces, the ingestion backend is down — operator should be paged |
| SDK emitter crashes | `asyncio.CancelledError` is caught and logged; the emitter task is cancelled cleanly on shutdown | The chat backend continues serving — telemetry failure is never user-visible |

### Ingestion backend failures

| Scenario | Behaviour | Assumption |
|----------|-----------|------------|
| Pod crash mid-processing | Message stays in PEL (pending entry list). On next pod start, `XAUTOCLAIM` reclaims messages idle for >5 min | At-least-once delivery: a trace may be processed twice if a pod crashes after DB write but before `XACK`. Duplicate traces are visible in the dashboard but do not cause data loss — `trace_id` is a unique constraint, so the second insert fails gracefully |
| PostgreSQL unavailable | Consumer retries 3× with exponential backoff, then routes to DLQ. When PostgreSQL recovers, DLQ can be replayed | Short outages (< 3 attempts × backoff) are transparent. Longer outages require manual DLQ replay |
| Redis unavailable | HTTP ingest endpoint returns 503. SDK receives 503 and drops the trace after 2 retries | Redis is the only hard dependency of the ingest endpoint. If Redis is down, traces are lost for that window |
| DLQ growth | Operator inspects `traces.dlq` stream, fixes the root cause (bad payload, schema mismatch), and replays by creating a temporary consumer that XREADs from `traces.dlq` and posts to `traces.raw` | There is no automated DLQ replay — it is a manual recovery operation |

### Database failures

| Scenario | Behaviour | Assumption |
|----------|-----------|------------|
| PostgreSQL restart | Alembic migrations run on pod startup — they are idempotent and safe to run on an already-migrated database | Downtime during restart is accepted. No hot standby in the current single-node setup |
| Schema migration failure | Deployment fails to start (alembic returns non-zero). Kubernetes rolls back to the previous image | Migrations must be backward-compatible — new columns are nullable, old columns are never dropped in the same migration as a rollout |
| Connection pool exhaustion | `asyncpg` raises `TooManyConnectionsError`. FastAPI returns 500 | Current pool size is 5 (max_overflow 10). Each ingestion pod uses one connection per active consumer task. 3 pods × 1 consumer = 3 connections, well within limits |

### Consumer group failure modes

| Scenario | Behaviour |
|----------|-----------|
| Consumer crashes before XACK | Message stays in PEL. XAUTOCLAIM on the next consumer start reclaims it after 5 minutes |
| All consumers crash simultaneously | Messages accumulate in `traces.raw`. `lag` counter in `XINFO GROUPS` tracks the backlog. When consumers restart, they drain the backlog before processing new messages |
| Message is malformed (Pydantic validation fails) | Goes to DLQ after 3 retries. Upstream SDK change introduced a schema break — requires DLQ inspection and SDK rollback |
| Consumer processes duplicate (crash after write, before XACK) | Second `ingest_service.ingest_trace()` call fails with a unique constraint violation on `trace_id`. This is caught and logged as a warning — the trace is already in the database from the first attempt. XACK proceeds. |

### Network and SSL

| Scenario | Behaviour |
|----------|-----------|
| Caddy can't renew Let's Encrypt cert | Caddy retries automatically with exponential backoff. Cert is valid for 90 days — renewal failures are not immediately visible |
| nip.io DNS unreachable | nip.io is a DNS-over-IP service with no SLA. Production deployments should use a real domain with Cloudflare or Route53 |
| DO droplet restart | K3s starts automatically via systemd. All pods restart from their manifests. Caddy starts automatically. AOF-persisted Redis and PVC-backed PostgreSQL retain their data |

---

## Component Interaction Summary

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           Failure boundaries                             │
│                                                                          │
│  Chat backend ──→ SDK queue ──→ HTTP ──→ Ingest endpoint                 │
│  [fire-and-forget]          [retry 2×]  [returns 202]                   │
│                                               │                          │
│                                          XADD → Redis                   │
│                                          [durable]                       │
│                                               │                          │
│                                    XREADGROUP → Consumer                 │
│                                    [at-least-once]                       │
│                                               │                          │
│                                    INSERT → PostgreSQL                   │
│                                    [idempotent on duplicate trace_id]    │
│                                               │                          │
│                               SSE broadcast → Admin panel               │
│                               [best-effort, never blocks ingestion]      │
└──────────────────────────────────────────────────────────────────────────┘
```

The key design invariant: **a failure at any layer after step 1 (chat response sent) is never visible to the user.** Observability data loss is acceptable; chat availability is not.
