# LIVEXEC — TASK PLAN

**Deadline**: Wed Mar 18, 2026 EoD
**Stack**: Express + BullMQ + Redis + PostgreSQL + Docker

---

## PHASE 0 — SETUP ✅ DONE

- [x] **0.1** Khởi tạo project — `npm init -y`, `git init`
- [x] **0.2** Cài dependencies — express, pg, bullmq, ioredis, uuid, dotenv, cors + dev tools
- [x] **0.3** Cấu trúc thư mục
- [x] **0.4** Setup `.env.example`
- [x] **0.5** Setup `docker-compose.yml` — postgres, redis, server, worker
- [x] **0.6** Setup linting — ESLint + Prettier + concurrently
- [x] **0.7** Core utilities — `ApiError`, `ApiResponse`, `asyncHandler`

---

## PHASE 0.5 — BOOTSTRAP SERVER ✅ DONE

- [x] `src/config/index.js` — load env, export all config
- [x] `src/app.js` — Express setup, middleware, routes
- [x] `server.js` — entry point, listen, graceful shutdown
- [x] Verify: `node server.js` → "Server running on port 3000"

---

## PHASE 1 — DATABASE ✅ DONE

- [x] `src/db/migrations/001_init.sql` — `code_sessions` + `executions` tables + indexes
- [x] `src/db/index.js` — pg pool, `runMigrations()`
- [x] Auto-create DB if not exists on startup
- [x] Verify: migrations run cleanly on server start

---

## PHASE 2 — API LAYER ✅ DONE

- [x] `src/services/session.service.js` — createSession, getSession, updateSession
- [x] `src/services/execution.service.js` — createExecution, getExecution, updateExecution, getActiveBySession, getCountBySession
- [x] `src/api/controllers/sessions.controller.js`
- [x] `src/api/controllers/executions.controller.js`
- [x] `src/api/routes/` — sessions.route.js, executions.route.js, index.js
- [x] Verify 4 endpoints: POST /code-sessions, PATCH /:id, POST /:id/run, GET /executions/:id

---

## PHASE 3 — QUEUE & WORKER ✅ DONE

- [x] `src/config/redis.js` — factory pattern `createRedisConnection()` (separate connection per instance)
- [x] `src/queue/producer.js` — BullMQ Queue, `enqueueExecution(executionId, sessionId)`
- [x] `src/queue/consumer.js` — BullMQ Worker, concurrency 5, dead-letter on max retries
- [x] `worker.js` — entry point, sandbox prepare, DB setup, initConsumer, graceful shutdown
- [x] Job TTL check in worker — skip jobs older than 60s, mark FAILED
- [x] Verify: enqueue → worker picks up → RUNNING → COMPLETED

---

## PHASE 4 — SANDBOX RUNNER ✅ DONE

- [x] `src/sandbox/runner.js` — `child_process.spawn` with `detached: true`
- [x] Language support: javascript (`node --max-old-space-size=128`), python (`python3`)
- [x] Timeout: 5s SIGKILL on process group (`process.kill(-child.pid)`)
- [x] stdout/stderr cap: 1MB per stream
- [x] Temp directory isolation per execution, cleanup in `finally`
- [x] Verify: Hello World JS/Python ✓, infinite loop killed after 5s ✓

---

## PHASE 5 — CLIENT UI ✅ DONE

- [x] Monaco Editor dark mode, single `public/index.html`
- [x] Auto-create session on load, autosave on change, poll results
- [x] `express.static('public')` — served from API server
- [x] Verify: `http://localhost:3000` loads IDE, JS/Python execution works

---

## PHASE 6 — TESTING ✅ DONE

- [x] `_test/unit/sandbox.test.js` — 6 unit tests, all pass
- [x] `_test/integration/api.test.js` — 10 integration tests, all pass
- [x] `_test/integration/security.test.js` — 8 security tests, all pass
- [x] `_test/integration/resilience.test.js` — 5 resilience tests, all pass
- [x] `docs/TEST_PLAN.md` — full test plan with descriptions

**Test results:**
| Suite | Tests | Status |
|---|---|---|
| Unit | 6/6 | ✅ |
| API Integration | 10/10 | ✅ |
| Security | 8/8 | ✅ |
| Resilience | 5/5 | ✅ |

---

## PHASE 7 — HARDENING & SECURITY ✅ DONE

- [x] `src/api/middlewares/validation.middleware.js`:
  - UUID format validation on all path params (`INVALID_UUID`)
  - Source code size limit 50KB (`SOURCE_CODE_TOO_LARGE`)
  - Dangerous pattern detection pipeline (`DANGEROUS_CODE_DETECTED`):
    - Unicode unescape → normalize → blocklist match → combination check → plain keyword check
- [x] `src/api/middlewares/rate-limit.middleware.js`:
  - Global: 500 req/min
  - Autosave: 60 req/min
  - Execution: 30 req/min
- [x] `src/core/ApiError.js` — error codes: `LANGUAGE_NOT_SUPPORTED`, `EXECUTION_LIMIT_REACHED`, `INVALID_UUID`, `SOURCE_CODE_TOO_LARGE`, `DANGEROUS_CODE_DETECTED`
- [x] Max 50 executions per session (`EXECUTION_LIMIT_REACHED`)
- [x] Idempotency: reject duplicate active executions
- [x] Production gaps documented in `docs/DESIGN.md` §14

---

## PHASE 8 — DOCKERIZATION ✅ DONE

- [x] `Dockerfile` — node:20-alpine + python3, multi-service single image
- [x] `docker-compose.yml`:
  - `db`: postgres:15-alpine + healthcheck `pg_isready`
  - `redis`: redis:7-alpine + healthcheck `redis-cli ping`
  - `server`: depends_on db+redis healthy, `npm run start`
  - `worker`: depends_on db+redis healthy, `npm run worker:start`
- [x] Verify: `docker-compose up --build` → all services healthy → UI at `localhost:3000`

---

## PHASE 9 — DOCS ✅ DONE

- [x] `README.md` — overview, quick start (Docker + local), API reference, architecture, decisions, trade-offs, what I'd improve, test results, project structure
- [x] `docs/DESIGN.md` — 14 sections: architecture diagram, state machine, queue design, sandbox approach, polling vs SSE vs WS, idempotency, security, scalability, config reference, production gaps
- [x] `docs/TEST_PLAN.md` — 4 suites, 29 test cases with descriptions, tooling, how to run
- [x] `docs/PROCESS.md` — problem analysis, architecture decisions, AI workflow, key discoveries, what I'd do differently
- [x] `docs/PLAN.md` — this file

---

## PHASE 10 — PDF SLIDES

- [x] PDF slides 10-15 pages exported

---

## SUBMIT CHECKLIST

- [x] GitHub repo public
- [x] `docker-compose up --build` one command, no errors
- [x] 4 API endpoints working
- [x] UI demo at `http://localhost:8386`
- [x] `docs/DESIGN.md` complete
- [x] `docs/PROCESS.md` complete
- [x] `docs/TEST_PLAN.md` complete
- [x] PDF slides 10-15 pages exported
- [x] `README.md` complete
- [x] `docs/PLAN.md` complete

---

*PLAN.md — sanghynh | Mar 2026*