# DESIGN.md — livexec

> Technical design document for the livexec Execution-as-a-Service backend.
> Covers architecture decisions, data flow, trade-offs, and production readiness gaps.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture Diagram](#2-architecture-diagram)
3. [Component Breakdown](#3-component-breakdown)
4. [Database Schema](#4-database-schema)
5. [API Design](#5-api-design)
6. [Execution Lifecycle & State Machine](#6-execution-lifecycle--state-machine)
7. [Queue Design — BullMQ + Redis](#7-queue-design--bullmq--redis)
8. [Sandbox Approach](#8-sandbox-approach)
9. [Polling vs WebSocket vs SSE](#9-polling-vs-websocket-vs-sse)
10. [Idempotency](#10-idempotency)
11. [Security & Hardening](#11-security--hardening)
12. [Scalability Considerations](#12-scalability-considerations)
13. [System Configuration Reference](#13-system-configuration-reference)
14. [Production Readiness Gaps](#14-production-readiness-gaps)

---

## 1. System Overview

livexec is a backend service that lets clients submit source code and receive execution results asynchronously. It is designed as an **Execution-as-a-Service** system with the following core properties:

- **Non-blocking API** — The `/run` endpoint returns immediately with a job ID. Clients poll for results separately.
- **Decoupled execution** — Code runs in a separate worker process, isolated from the API server.
- **Resilient queue** — BullMQ handles job persistence, retry, and dead-letter logic via Redis.
- **Stateful sessions** — Code is autosaved per session so the worker always has the latest source at execution time.

**Supported languages:** JavaScript (Node.js), Python 3

---

## 2. Architecture Diagram

```
                        ┌─────────────────────────────────────────────┐
                        │                  CLIENT                      │
                        │  (Browser / API Consumer / Monaco IDE)       │
                        └────────────────┬────────────────────────────┘
                                         │ HTTP
                                         ▼
                        ┌─────────────────────────────────────────────┐
                        │             API SERVER (Express)             │
                        │                                             │
                        │  POST /code-sessions        → create session │
                        │  PATCH /code-sessions/:id   → autosave code  │
                        │  POST /code-sessions/:id/run → enqueue job   │
                        │  GET  /executions/:id        → poll status   │
                        │                                             │
                        │  Middleware stack:                           │
                        │    globalRateLimit → cors → json →           │
                        │    validateUuid → detectDangerousPatterns →  │
                        │    limitSourceCodeSize → controller          │
                        └────────┬────────────────────┬───────────────┘
                                 │                    │
                          Enqueue job            Read/Write
                                 │                    │
                                 ▼                    ▼
                   ┌─────────────────────┐   ┌───────────────────┐
                   │   Redis (BullMQ)    │   │    PostgreSQL      │
                   │                     │   │                   │
                   │  Queue: code-exec   │   │  code_sessions    │
                   │  - jobId=execId     │   │  executions       │
                   │  - attempts: 3      │   │                   │
                   │  - backoff: exp     │   └───────────────────┘
                   └─────────┬───────────┘            ▲
                             │ Pick up job             │
                             ▼                        │ Write result
                   ┌──────────────────────────────────┴──────────┐
                   │              WORKER PROCESS                  │
                   │                                             │
                   │  BullMQ Worker (concurrency: 5)             │
                   │    1. Mark execution RUNNING in DB           │
                   │    2. Fetch session source_code from DB      │
                   │    3. Write code to temp file                │
                   │    4. Spawn child_process (node / python3)   │
                   │    5. Wait for exit or timeout (5s)          │
                   │    6. Capture stdout / stderr                │
                   │    7. Write result back to DB                │
                   │    8. Cleanup temp directory                 │
                   └─────────────────────────────────────────────┘
```

---

## 3. Component Breakdown

### 3.1 API Server (`server.js` + `src/`)

The Express server exposes 4 REST endpoints and serves the static Monaco IDE from `public/`. It handles:

- Input validation (UUID format, code size, language whitelist, dangerous pattern detection)
- Rate limiting (global, per-route)
- Session and execution CRUD via PostgreSQL
- Job enqueueing via BullMQ producer

The server does **not** execute any code. It returns as fast as possible after enqueuing.

### 3.2 Worker Process (`worker.js`)

A separate Node.js process that consumes jobs from the BullMQ queue. It:

- Runs independently from the API server (separate container in Docker)
- Can be horizontally scaled — multiple workers consume from the same Redis queue
- Handles the full execution lifecycle: RUNNING → sandbox → result → DB write

### 3.3 Redis (BullMQ backbone)

Redis serves as the message broker. BullMQ uses Redis sorted sets and lists to implement reliable queuing with:

- Job persistence across restarts
- Exponential backoff retry (3 attempts, 1s base delay)
- Automatic job cleanup (`removeOnComplete: 100`, `removeOnFail: 500`)
- Deduplication via `jobId = executionId`

### 3.4 PostgreSQL (source of truth)

PostgreSQL stores all persistent state. Two tables:

- `code_sessions` — tracks language, source code, and session status
- `executions` — tracks job status, stdout, stderr, timing, and retry count

The DB is the single source of truth for execution results. Redis/BullMQ is only the transport layer.

### 3.5 Sandbox (`src/sandbox/runner.js`)

The sandbox runs user code using Node.js `child_process.spawn` with:

- `detached: true` to create a process group, enabling group-level kill
- `--max-old-space-size=128` to soft-limit V8 heap for JavaScript
- A 5-second timeout after which the entire process group is killed (`SIGKILL`)
- stdout/stderr capture with a 1MB cap per stream
- Isolated temporary directory per execution, cleaned up after completion

---

## 4. Database Schema

```sql
-- Sessions: the stateful container for a coding workspace
CREATE TABLE code_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  language    VARCHAR(50) NOT NULL,         -- 'javascript' | 'python'
  source_code TEXT DEFAULT '',             -- autosaved on every PATCH
  status      VARCHAR(20) DEFAULT 'ACTIVE', -- 'ACTIVE' | 'CLOSED'
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Executions: one record per run attempt
CREATE TABLE executions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID REFERENCES code_sessions(id) ON DELETE CASCADE,
  status            VARCHAR(20) DEFAULT 'QUEUED',  -- see state machine below
  stdout            TEXT,
  stderr            TEXT,
  execution_time_ms INTEGER,
  error_message     TEXT,
  retry_count       INTEGER DEFAULT 0,
  queued_at         TIMESTAMPTZ DEFAULT NOW(),
  started_at        TIMESTAMPTZ,                   -- set when worker picks up job
  completed_at      TIMESTAMPTZ                    -- set when terminal state reached
);

-- Indexes for hot query paths
CREATE INDEX idx_executions_session_id ON executions(session_id);
CREATE INDEX idx_executions_status     ON executions(status);
```

**Design decision — source code on session, not execution:**
The source code is stored on the session and fetched by the worker at execution time. This means the worker always runs the **latest autosaved version**, which is the expected behavior for an IDE-like experience. An alternative would be to snapshot the code at enqueue time onto the execution record — this would make executions fully immutable but add payload size to the queue.

---

## 5. API Design

All endpoints follow a consistent JSON envelope:

```json
{ "success": true, "message": "...", "data": { ... } }
```

### `POST /code-sessions`

Creates a new session with a language and optional initial source code.

**Request:**
```json
{ "language": "javascript", "source_code": "console.log('hello')" }
```

**Response `201`:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "language": "javascript",
    "source_code": "console.log('hello')",
    "status": "ACTIVE",
    "created_at": "...",
    "updated_at": "..."
  }
}
```

---

### `PATCH /code-sessions/:id`

Autosaves the source code. Called on every keystroke (debounced client-side). Rate limited to 60 req/min per IP.

**Request:**
```json
{ "source_code": "console.log('updated')" }
```

**Response `200`:** Updated session object.

---

### `POST /code-sessions/:id/run`

Triggers code execution. Returns immediately with a job reference — does **not** wait for execution to complete.

**Idempotency:** If an execution is already `QUEUED` or `RUNNING` for this session, returns the existing execution with `200 OK` instead of creating a duplicate.

**Response `201`:**
```json
{
  "success": true,
  "data": {
    "id": "execution-uuid",
    "session_id": "session-uuid",
    "status": "QUEUED",
    "queued_at": "..."
  }
}
```

---

### `GET /executions/:id`

Polls for execution status and result. Clients call this repeatedly until status reaches a terminal state.

**Terminal states:** `COMPLETED`, `FAILED`, `TIMEOUT`

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "id": "execution-uuid",
    "session_id": "session-uuid",
    "status": "COMPLETED",
    "stdout": "Hello, World!\n",
    "stderr": "",
    "execution_time_ms": 47,
    "queued_at": "...",
    "started_at": "...",
    "completed_at": "..."
  }
}
```

---

## 6. Execution Lifecycle & State Machine

Every execution transitions through the following states:

```
                   POST /run
                       │
                       ▼
                  ┌─────────┐
                  │ QUEUED  │  ← job is in Redis queue, waiting for worker
                  └────┬────┘
                       │  Worker picks up job
                       ▼
                  ┌─────────┐
                  │ RUNNING │  ← worker is executing sandbox
                  └────┬────┘
                       │
            ┌──────────┼──────────┐
            ▼          ▼          ▼
       ┌─────────┐ ┌────────┐ ┌─────────┐
       │COMPLETED│ │ FAILED │ │ TIMEOUT │
       └─────────┘ └────────┘ └─────────┘
```

**QUEUED** — Execution record created in DB. Job added to BullMQ queue with `jobId = executionId`.

**RUNNING** — Worker has dequeued the job and called `updateExecution(id, { status: 'RUNNING', started_at: true })`.

**COMPLETED** — Code ran to completion with exit code 0. `stdout`, `stderr`, and `execution_time_ms` are populated.

**FAILED** — One of: non-zero exit code, runtime error, dangerous pattern blocked pre-queue, max retries exhausted, or job TTL exceeded (60s in queue without being picked up).

**TIMEOUT** — The sandbox killed the process after 5 seconds. `stderr` includes the timeout message.

**Dead-letter handling:** After 3 retry attempts with exponential backoff, the BullMQ `failed` event fires. The consumer marks the execution `FAILED` with a descriptive error message. No job is permanently stuck.

---

## 7. Queue Design — BullMQ + Redis

### Why a queue instead of direct execution?

Direct execution (synchronous) would block the HTTP server thread for the full sandbox duration (up to 5s). Under concurrent load, this would exhaust the server's connection pool and cause timeouts for all other requests — including simple autosave calls.

A queue decouples ingestion from processing:

```
API Server throughput:  ~500 req/min (global rate limit)
Worker throughput:      5 concurrent executions × N worker instances
```

### BullMQ configuration

| Parameter | Value | Reason |
|---|---|---|
| `concurrency` | 5 | Limits parallel sandbox processes per worker |
| `attempts` | 3 | Retry transient failures (DB blip, startup error) |
| `backoff.type` | exponential | Avoids thundering herd on retry |
| `backoff.delay` | 1000ms | Base delay; doubles each retry |
| `removeOnComplete` | 100 | Keep last 100 completed jobs in Redis for inspection |
| `removeOnFail` | 500 | Keep last 500 failed jobs for debugging |
| `jobId` | executionId | Deduplication — BullMQ rejects duplicate jobIds |
| `JOB_TTL_MS` | 60000 | Jobs older than 60s in queue are skipped by worker |

### Job TTL (expiration guard)

The worker checks job age before processing:

```javascript
const ageMs = Date.now() - job.timestamp;
if (ageMs > ttlMs) {
  // Mark FAILED and skip — don't execute stale code
}
```

This prevents stale executions from running if the queue backed up (e.g., worker was restarted) and the user has since closed their session.

### Why not a simple in-memory queue?

In-memory queues (e.g., `p-queue`) do not survive process restarts and cannot be consumed by multiple worker instances. BullMQ + Redis gives us persistence and horizontal scalability with minimal additional complexity.

---

## 8. Sandbox Approach

### Current: `child_process.spawn` (development-grade)

The sandbox uses Node.js `child_process.spawn` with the following safety measures:

**Process group isolation:**
```javascript
child = spawn(cmd, args, { detached: true }); // Creates a new process group
process.kill(-child.pid, 'SIGKILL');           // Kills the entire group on timeout
```
This ensures that if user code spawns child processes (e.g., `child_process.exec` inside Node), they are all killed together when the timeout fires.

**Memory soft limit (JavaScript only):**
```
node --max-old-space-size=128 solution.js
```
Limits the V8 JavaScript heap to 128MB. If user code allocates beyond this, Node.js throws an OOM error before exhausting server RAM. This does not limit native (C++) memory or child processes.

**stdout/stderr cap:**
Both streams are capped at 1MB. If exceeded, the stream is truncated and a warning appended to stderr. This prevents I/O flood attacks (`while(true) console.log(...)`) from consuming server memory.

**Execution timeout:**
A 5-second `setTimeout` fires `SIGKILL` against the process group if the execution has not completed.

**Temp directory isolation:**
Each execution gets a unique directory under `temp/executions/{uuid}/`. The directory is deleted in a `finally` block with retry logic (needed on Windows due to file lock timing).

### Target: Docker container pool (production-grade)

The `child_process` approach has fundamental limitations that only Docker can address:

| Attack vector | `child_process` mitigation | Docker mitigation |
|---|---|---|
| Memory bomb | `--max-old-space-size` (soft, JS only) | `--memory 128m` (hard, all processes) |
| Fork bomb | Timeout only | `--pids-limit 64` |
| Network exfil | Pattern detection only | `--network none` |
| Filesystem access | Pattern detection only | `--read-only --tmpfs /tmp` |
| CPU starvation | Timeout only | `--cpus 0.5` |

**Target Docker command per execution:**
```bash
docker run --rm \
  --network none \
  --memory 128m \
  --cpus 0.5 \
  --pids-limit 64 \
  --read-only \
  --tmpfs /tmp \
  -v /tmp/livexec/{id}:/code:ro \
  node:20-alpine \
  node /code/solution.js
```

**Performance consideration:** Cold-starting a Docker container per execution adds ~1–2 seconds of latency. Production systems use a **pre-warmed container pool** — a fixed set of containers waiting in a ready state, with the code injected at execution time rather than at container start.

---

## 9. Polling vs WebSocket vs SSE

The client obtains execution results by polling `GET /executions/:id`. This was a deliberate choice with trade-offs.

### Comparison

| Approach | Latency | Complexity | Infrastructure | Client support |
|---|---|---|---|---|
| **Polling** (current) | Medium (~500ms average) | Low | Stateless HTTP | Universal |
| **WebSocket** | Low (~50ms) | High | Stateful connections, sticky sessions | Good |
| **SSE (Server-Sent Events)** | Low (~50ms) | Medium | Stateful, one-way | Good |

### Why polling for this implementation

1. **Scope fit** — The assignment spec explicitly describes a polling model (`GET /executions/:id`). Implementing it correctly is the primary goal.

2. **Stateless API server** — Polling keeps the API server completely stateless. Any server instance can answer any poll request by querying PostgreSQL. WebSocket and SSE require connection state pinned to a specific server instance (or a pub/sub layer like Redis Pub/Sub to fan out notifications).

3. **Reliability** — If a WebSocket connection drops mid-execution, the client must implement reconnect and state-recovery logic. With polling, the client simply retries.

4. **Execution time** — Sandbox executions complete in 50ms–5000ms. At 500ms polling intervals, the user sees results within 500ms of completion — acceptable for a coding simulation tool.

### Production upgrade path

For lower latency result delivery, the recommended path is **SSE**:

```
Client opens GET /executions/:id/stream
Server keeps connection open
Worker publishes result to Redis Pub/Sub
API server subscribes and pushes event to client
```

SSE is simpler than WebSocket (unidirectional, HTTP-native, built-in browser reconnect) and pairs naturally with a Redis Pub/Sub notification layer.

---

## 10. Idempotency

Two layers of idempotency prevent duplicate executions:

### Layer 1: API-level check (before enqueue)

Before creating an execution record, the controller queries for any `QUEUED` or `RUNNING` execution for the same session:

```javascript
const activeExecution = await executionService.getActiveExecutionBySession(session.id);
if (activeExecution) {
  return new OkResponse(activeExecution).send(res); // Return existing, don't create new
}
```

This handles the common case where a user double-clicks the Run button.

### Layer 2: BullMQ job deduplication (after enqueue)

The execution UUID is used as the BullMQ `jobId`:

```javascript
await executionQueue.add('run-code', payload, { jobId: executionId });
```

BullMQ rejects any `add()` call for a jobId that already exists in the queue. This is a second safety net in case two concurrent requests pass the API-level check simultaneously (race condition window).

**Together**, these two layers ensure that under all normal and concurrent conditions, a session cannot have more than one active execution at a time.

---

## 11. Security & Hardening

Security is applied as a **defense-in-depth** stack. Each layer catches different attack vectors.

### 11.1 Input Validation

| Check | Where | Config |
|---|---|---|
| UUID format on all params | `validateUuid` middleware | All routes |
| Language whitelist | `sessions.controller` | `javascript`, `python` |
| Source code size limit | `limitSourceCodeSize` middleware | Max 50KB |
| Max executions per session | `executions.controller` | Max 50 |

### 11.2 Dangerous Pattern Detection

Applied via `detectDangerousPatterns` middleware before the execution record is created.

**Detection pipeline:**

1. **Unicode unescape** — Convert `\u0066s` → `fs` to catch Unicode encoding bypass attempts.
2. **Normalization** — Strip whitespace, quotes, backticks, operators, and separators to collapse concatenation-based bypasses (e.g., `'re' + 'quire'`).
3. **Normalized pattern match** — Check the collapsed string against a blocklist of dangerous API combinations.
4. **Combination detection** — Check for `require` co-occurring with `fs`, `child_process`, `vm`, `net`, `os`.
5. **Plain keyword match** — Check the original (Unicode-decoded) code for high-signal keywords.

**Blocked patterns include:**
`require('fs')`, `require('child_process')`, `require('vm')`, `require('net')`, `require('os')`, `process.exit`, `process.env`, `process.binding`, `process.mainModule`, `eval(`, `Function(`, `vm.runInNewContext`, `__import__`, `subprocess.*`, `wget`, `curl`, and more.

**Known limitations:**
- Deep obfuscation (base64-encoded payloads decoded at runtime) is not caught.
- Dynamic property access (`process['en'+'v']`) may bypass normalization.
- This layer is best-effort. Docker isolation (see §8) is required for production-grade guarantees.

### 11.3 Rate Limiting

| Endpoint | Limit | Rationale |
|---|---|---|
| `POST /code-sessions/:id/run` | 30 req/min per IP | Prevent execution flooding |
| `PATCH /code-sessions/:id` | 60 req/min per IP | Throttle autosave |
| Global (all routes) | 500 req/min per IP | Baseline DoS protection |

### 11.4 Sandbox-level Controls

- **5s execution timeout** with SIGKILL to process group
- **128MB V8 heap limit** for JavaScript (`--max-old-space-size`)
- **1MB stdout/stderr cap** per stream
- **Temp directory cleanup** in `finally` block — no file persistence between executions

---

## 12. Scalability Considerations

### Horizontal API scaling

The API server is fully stateless. Multiple instances can run behind a load balancer with no shared in-memory state. All state lives in PostgreSQL and Redis.

### Horizontal worker scaling

Multiple worker instances consume from the same BullMQ queue. Scaling workers increases execution throughput linearly (up to the DB connection pool limit).

```
1 worker × concurrency 5 = 5 parallel executions
4 workers × concurrency 5 = 20 parallel executions
```

### Bottlenecks

| Component | Bottleneck | Mitigation |
|---|---|---|
| PostgreSQL | Connection pool exhaustion | PgBouncer connection pooler |
| Redis | Single-threaded throughput | Redis Cluster for very high volume |
| Worker sandbox | CPU/memory per execution | Container resource limits + autoscaling |
| Rate limiter | In-memory per-instance | Redis-backed rate limiter for multi-instance |

**Note:** The current `express-rate-limit` uses in-memory storage, which means limits are per-instance, not global. In a multi-instance deployment, each instance would enforce its own limit independently. A Redis store (e.g., `rate-limit-redis`) would enforce global limits across all instances.

---

## 13. System Configuration Reference

All runtime configuration is in `src/config/index.js`. Hardcoded values are intentional — they are security-sensitive constraints that should not be changeable via environment variables without code review.

| Key | Value | Description |
|---|---|---|
| `PORT` | `3000` | API server port |
| `SANDBOX.TIMEOUT_MS` | `5000` | Max execution duration (ms) |
| `SANDBOX.MEMORY_LIMIT_MB` | `128` | Node.js V8 heap soft limit (MB) |
| `SANDBOX.MAX_OUTPUT_SIZE` | `1048576` | Max stdout/stderr per stream (1MB) |
| `SANDBOX.MAX_SOURCE_CODE_SIZE_KB` | `50` | Max source code input (KB) |
| `RATE_LIMIT.EXECUTIONS_PER_MINUTE` | `30` | Per-IP execution rate |
| `RATE_LIMIT.SESSIONS_PER_MINUTE` | `60` | Per-IP autosave rate |
| `RATE_LIMIT.GLOBAL_PER_MINUTE` | `500` | Per-IP global rate |
| `RATE_LIMIT.MAX_EXECUTIONS_PER_SESSION` | `50` | Lifetime execution cap per session |
| `QUEUE.CONCURRENCY` | `5` | Parallel executions per worker |
| `QUEUE.ATTEMPTS` | `3` | BullMQ retry attempts |
| `QUEUE.BACKOFF_DELAY` | `1000` | Base backoff delay (ms, exponential) |
| `QUEUE.JOB_TTL_MS` | `60000` | Max queue wait before job is skipped (ms) |
| `ALLOWED_LANGUAGES` | `javascript,python` | Language whitelist |

---

## 14. Production Readiness Gaps

The following gaps are acknowledged and documented. They represent the difference between the current development-grade implementation and a production-ready system.

### P0 — Security Critical

| Gap | Current state | Production fix |
|---|---|---|
| Hard memory limit | `--max-old-space-size` (JS only, soft) | Docker `--memory 128m` |
| Network isolation | Pattern detection only | Docker `--network none` |
| Filesystem isolation | Temp dir only | Docker `--read-only --tmpfs /tmp` |
| Fork bomb | Timeout only | Docker `--pids-limit 64` |
| CPU isolation | Timeout only | Docker `--cpus 0.5` |

### P1 — Reliability

| Gap | Current state | Production fix |
|---|---|---|
| Rate limiter scope | Per-instance (in-memory) | Redis-backed global rate limiter |
| Execution result delivery | Polling (500ms latency) | SSE or WebSocket with Redis Pub/Sub |
| DB connection pooling | Direct pg pool | PgBouncer |
| Worker crash recovery | BullMQ retry handles transient failures | Process supervisor (PM2 / Kubernetes liveness probe) |

### P2 — Observability

| Gap | Current state | Production fix |
|---|---|---|
| Logging | `console.log` | Structured logging (Winston/Pino) to stdout |
| Metrics | None | Prometheus counters (executions/s, latency p95, error rate) |
| Tracing | None | OpenTelemetry trace IDs propagated from API → queue → worker |
| Alerting | None | Alert on execution error rate > 5%, queue depth > 100 |

### P3 — Developer Experience

| Gap | Current state | Production fix |
|---|---|---|
| Python execution | `py` / `python3` (host binary) | Pre-installed in Docker image |
| Language support | JavaScript, Python only | Add Go, Ruby, etc. via Docker image variants |
| Session expiry | Sessions live forever | TTL-based expiry + cleanup job |
| Execution history | All executions persisted | Configurable retention policy |

---

*DESIGN.md — sanghynh | Mar 2026*
