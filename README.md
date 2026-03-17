# livexec

> Execution-as-a-Service backend for the Live Code Execution feature.

livexec lets a platform embed a live coding experience directly inside any task: write code, hit run, get results — no external tools, no context switching.

---

## What It Does

- **Session management** — create and autosave a coding workspace per learner
- **Async execution** — submit code and get results without blocking the UI
- **Queue-based worker** — BullMQ + Redis decouples ingestion from execution
- **Sandbox isolation** — each execution runs in its own process with timeout, memory, and output limits
- **Security hardening** — dangerous pattern detection, rate limiting, UUID validation, execution quotas
- **Monaco IDE** — bonus browser UI served at `localhost:8386` for demo purposes

**Supported languages:** JavaScript (Node.js 20), Python 3

---

## Quick Start

### Option 1 — Docker (recommended)
```bash
git clone https://github.com/sanghynh/livexec
cd livexec

# Linux/Mac
cp .env.example .env
# Windows
copy .env.example .env

# Edit .env with your DB and Redis URLs (see Environment Variables below)

docker-compose up --build
```

Then visit `http://localhost:8386` — the IDE is live.

### Option 2 — Local Dev

**Prerequisites:** Node.js 20+, PostgreSQL 15, Redis 6+
```bash
git clone https://github.com/sanghynh/livexec
cd livexec

# Linux/Mac
cp .env.example .env
# Windows
copy .env.example .env

# Edit .env with your local DB and Redis URLs

npm install
npm run dev
```

This starts both the API server and worker concurrently with hot reload.

---

## Environment Variables
```env
PORT=8386
DATABASE_URL=postgresql://<user>:<password>@db:5432/livexec
REDIS_URL=redis://localhost:6379
ALLOWED_LANGUAGES=javascript,python

POSTGRES_USER=user
POSTGRES_PASSWORD=password
POSTGRES_DB=livexec
```

See `.env.example` for the full list.
---

## API Reference

All responses follow the envelope format:

```json
{ "success": true, "message": "...", "data": { ... } }
```

Error responses include an `errorCode` field for programmatic handling:

```json
{ "success": false, "message": "...", "errorCode": "DANGEROUS_CODE_DETECTED" }
```

---

### `POST /code-sessions`

Create a new live coding session.

**Request:**
```json
{
  "language": "javascript",
  "source_code": "console.log('hello')"
}
```

**Response `201`:**
```json
{
  "success": true,
  "data": {
    "id": "3f7a1b2c-...",
    "language": "javascript",
    "source_code": "console.log('hello')",
    "status": "ACTIVE",
    "created_at": "2026-03-17T10:00:00Z",
    "updated_at": "2026-03-17T10:00:00Z"
  }
}
```

---

### `PATCH /code-sessions/:id`

Autosave the learner's current source code. Called on every keystroke (debounced client-side). Rate limited to 60 req/min per IP.

**Request:**
```json
{ "source_code": "console.log('updated')" }
```

**Response `200`:** Updated session object.

---

### `POST /code-sessions/:id/run`

Trigger code execution. Returns **immediately** with a job reference — does not wait for the code to finish running.

**Response `201`:**
```json
{
  "success": true,
  "data": {
    "id": "8a2b3c4d-...",
    "session_id": "3f7a1b2c-...",
    "status": "QUEUED",
    "queued_at": "2026-03-17T10:00:01Z"
  }
}
```

> If an execution is already running for this session, returns `200` with the existing execution instead of creating a duplicate.

---

### `GET /executions/:id`

Poll for execution status and result. Call repeatedly until `status` reaches a terminal state.

**Terminal states:** `COMPLETED` · `FAILED` · `TIMEOUT`

**Response `200` (completed):**
```json
{
  "success": true,
  "data": {
    "id": "8a2b3c4d-...",
    "session_id": "3f7a1b2c-...",
    "status": "COMPLETED",
    "stdout": "hello\n",
    "stderr": "",
    "execution_time_ms": 47,
    "queued_at": "...",
    "started_at": "...",
    "completed_at": "..."
  }
}
```

---

### Error Codes

| Code | HTTP | Meaning |
|---|---|---|
| `INVALID_UUID` | 400 | Malformed UUID in path param |
| `LANGUAGE_NOT_SUPPORTED` | 400 | Language not in whitelist |
| `SOURCE_CODE_TOO_LARGE` | 400 | Source code exceeds 50KB |
| `DANGEROUS_CODE_DETECTED` | 400 | Blocked system access pattern |
| `EXECUTION_LIMIT_REACHED` | 400 | Session hit 50 execution cap |
| `TOO_MANY_REQUESTS` | 429 | Rate limit exceeded |
| `NOT_FOUND` | 404 | Resource does not exist |

---

## Architecture Overview

```
Client → API Server (Express)
              ↓ enqueue
         Redis (BullMQ)
              ↓ dequeue
           Worker Process
              ↓ spawn
         Sandbox (child_process)
              ↓ result
         PostgreSQL
              ↑ poll
Client → GET /executions/:id
```

The API server and worker run as **separate processes** (separate containers in Docker). The API never executes code — it only enqueues jobs and answers poll requests. This keeps the API fast and stateless regardless of execution load.

See [DESIGN.md](./docs/DESIGN.md) for the full architecture diagram, state machine, queue design, sandbox approach, and production readiness gaps.

---

## Design Decisions

**Why BullMQ + Redis?**
Async queue decouples the API from execution time (up to 5s per job). Direct execution would block the server thread under concurrency. BullMQ adds persistence, retry with exponential backoff, and deduplication via `jobId = executionId`.

**Why polling instead of WebSocket?**
Keeps the API fully stateless — any server instance can answer any poll. WebSocket requires sticky sessions or a pub/sub layer. For execution times of 50ms–5s, 500ms polling intervals give acceptable UX. See DESIGN.md §9 for the full trade-off analysis and SSE upgrade path.

**Why `child_process` instead of Docker?**
Appropriate for this scope. Docker adds 1–2s cold-start latency per execution and requires privileged container access to run. The current sandbox enforces timeout (5s), memory (128MB V8 heap), output cap (1MB), and process group kill. See DESIGN.md §8 for the production Docker upgrade path.

**Why source code on session, not execution?**
The worker fetches the latest autosaved code at execution time — consistent with IDE behavior where run always reflects your current code. An alternative is snapshotting code onto the execution record for full immutability.

---

## Trade-offs

| What was optimized | What was traded off |
|---|---|
| API response time (non-blocking) | Result delivery latency (polling ~500ms) |
| Simplicity (child_process sandbox) | Hard security isolation (needs Docker in prod) |
| Stateless API (easy to scale) | Real-time push (needs Redis Pub/Sub for SSE) |
| Resilience (BullMQ retry + TTL) | Complexity vs simple in-memory queue |

---

## What I'd Improve With More Time

**Security (P0):**
- Replace `child_process` with Docker containers per execution — enforces hard memory, CPU, network, and filesystem limits that pattern detection alone cannot guarantee
- Pre-warm a container pool to eliminate cold-start latency

**Reliability (P1):**
- Switch to Redis-backed rate limiter for global limits across multiple API instances
- Add SSE or WebSocket result push via Redis Pub/Sub — eliminates polling latency
- Add PgBouncer for PostgreSQL connection pooling under high concurrency

**Observability (P2):**
- Structured logging (Winston/Pino) with execution trace IDs propagated from API → queue → worker
- Prometheus metrics: executions/s, queue depth, execution latency p95, error rate
- Alerting on error rate > 5% or queue backlog > 100

---

## Testing

```bash
npm run test:unit        # Sandbox runner unit tests
npm run test:api         # API integration tests (end-to-end with real worker)
npm run test:security    # Dangerous pattern detection, rate limiting, quotas
npm run test:resilience  # Memory bomb, stdout flood, CPU bomb, stack overflow, queue TTL

npm test                 # All suites in order
```

See [TEST_PLAN.md](./docs/TEST_PLAN.md) for full test case descriptions and methodology.

**Test results (Mar 2026):**
- Unit: 6/6 ✓
- API: 10/10 ✓
- Security: 8/8 ✓
- Resilience: 5/5 ✓

---

## Project Structure

```
livexec/
├── src/
│   ├── api/
│   │   ├── controllers/     # sessions, executions
│   │   ├── middlewares/     # validation, rate-limit, error
│   │   └── routes/
│   ├── config/              # env config, redis factory
│   ├── core/                # ApiError, ApiResponse, asyncHandler
│   ├── db/                  # pg pool, migrations
│   ├── queue/               # BullMQ producer + consumer
│   ├── sandbox/             # child_process runner
│   └── services/            # session, execution business logic
├── public/                  # Monaco IDE (bonus UI)
├── docs/
│   ├── DESIGN.md            # architecture, decisions, trade-offs
│   ├── TEST_PLAN.md         # test cases, methodology, results
│   ├── PROCESS.md           # problem analysis, AI workflow, key discoveries
│   └── PLAN.md              # phase-by-phase task plan and progress tracking
├── _test/
│   ├── unit/
│   └── integration/
├── server.js                # API server entry
├── worker.js                # Worker process entry
├── Dockerfile
└── docker-compose.yml
```

---

*livexec — Sang | Mar 2026*