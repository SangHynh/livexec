# PROCESS.md — How livexec Was Built

> This document covers the problem analysis, architecture decisions, AI workflow, and key discoveries made during the 2-day build of livexec.

---

## 1. Problem Analysis

Before writing any code, I read the assignment spec carefully and identified the core tension:

**The hard part is not the API — it's the execution model.**

A naive implementation would execute code synchronously inside the request handler. This works for a single user but collapses under concurrency: each execution blocks a server thread for up to 5 seconds, and with enough concurrent users the server stops responding to everything — including simple autosave requests.

The real challenge is designing a system where:
- The API stays fast and non-blocking regardless of how many executions are running
- Code execution is isolated — one user's infinite loop cannot affect another user's session
- The system is resilient — worker crashes, Redis restarts, and transient DB errors should not permanently lose jobs

This shaped every major architecture decision.

---

## 2. Architecture Decisions

### Decision 1: Separate API server and worker process

Early option was to run execution inside the API process using a thread pool. Rejected because:
- Node.js is single-threaded — CPU-bound child processes still affect event loop responsiveness
- Cannot scale execution capacity independently from API capacity
- Worker crashes would take down the API

Final approach: two separate processes, two separate containers in Docker. The API only enqueues and answers polls. The worker only executes.

### Decision 2: BullMQ over a simple in-memory queue

Options considered: `p-queue` (in-memory), `bull` (older), `BullMQ` (current).

In-memory queues don't survive process restarts and can't be shared across multiple worker instances. BullMQ on Redis gives persistence, retry logic, deduplication, and horizontal scaling — all things needed for a production-grade system — with minimal extra complexity.

### Decision 3: Polling over WebSocket

WebSocket would give real-time results but requires the API server to maintain stateful connections. That means sticky sessions under a load balancer, or a Redis Pub/Sub layer to fan out notifications across multiple API instances.

Polling keeps the API completely stateless. For execution times of 50ms–5s, 500ms polling intervals are acceptable. The upgrade path to SSE + Redis Pub/Sub is documented in DESIGN.md and is a clear next step.

### Decision 4: `child_process.spawn` with process group kill

The key insight: `child_process.exec` only kills the parent process. If user code spawns its own children (`child_process.exec` inside the submitted code), those survive the timeout.

`spawn` with `detached: true` creates a new process group. `process.kill(-child.pid, 'SIGKILL')` kills the entire group — parent and all descendants.

### Decision 5: Source code on session, not snapshotted on execution

The worker fetches the latest autosaved source code from the session at execution time. This mirrors IDE behavior — run always reflects your current code.

The alternative (snapshot code onto the execution record at enqueue time) makes executions fully immutable but adds payload to the queue and changes the expected UX. Documented as a trade-off in DESIGN.md.

---

## 3. AI Workflow

This project was built using a two-tier AI workflow:

**Claude Sonnet 4.6** — architecture discussion, solution design, code review, and complex problem solving. Used for:
- Discussing the async execution model and trade-offs before writing any code
- Reviewing security hardening approach (pattern detection pipeline, process group kill)
- Debugging non-obvious issues (BullMQ retry behavior, Redis connection sharing, test environment isolation)
- Generating prompts for the execution agent

**Gemini 2.0 Flash via Antigravity Agents** — code execution and implementation. Used for:
- Writing boilerplate from architecture specs
- Implementing test files following existing patterns
- Iterating on bug fixes based on error output

The workflow was roughly: **discuss with Claude → generate spec/prompt → delegate to agent → review output → iterate**.

One practical discovery: when Claude's server went down mid-session, the conversation context was lost. The workaround was to have the agent annotate all generated code with detailed comments explaining intent and design decisions. When the session resumed, the comments served as a context bridge — Claude could read the codebase and reconstruct full understanding without needing the chat history. This turned out to be good practice regardless: the comments made the code self-documenting and reduced onboarding friction.

This is not "use AI to write everything" — it's using AI as a thinking partner for design decisions and a delegation layer for implementation. The critical judgment calls (what to build, how to structure it, what trade-offs to accept) remained mine.

---

## 4. Key Discoveries

**BullMQ requires separate Redis connections per instance.**
BullMQ's `Worker` uses blocking Redis commands (`BRPOP`) that cannot share a connection with other operations. Using a singleton Redis instance caused `ECONNRESET` errors in tests when multiple BullMQ instances shared one connection. Fix: factory function `createRedisConnection()` so each Queue, Worker, and test suite creates its own connection.

**`child_process.exec` vs `spawn` for process group kill.**
Initial implementation used `exec`. Discovered during security testing that exec-spawned processes only kill the parent on timeout — child processes spawned by user code survive. Switched to `spawn` with `detached: true` and `process.kill(-child.pid)`.

**Test environment pollution from shared rate limiter state.**
The in-memory rate limiter persists across test suites in the same Jest run. Running security tests (which intentionally trigger 429s) before API tests caused the API tests to see unexpected 429s. Fixed by running suites in isolation and adding delays between tests.

**Stack overflow retry timing.**
Stack overflow crashes in ~50ms but BullMQ retries the job 3 times with exponential backoff before marking it FAILED in DB. Test needed a 90s timeout to account for retry delay, not the crash time. This revealed the difference between "how fast the sandbox responds" and "how fast the DB reflects the final state."

**Job TTL as a resilience layer.**
Added a job age check in the worker: if a job has been queued for longer than 60 seconds, skip it and mark FAILED. This prevents stale executions from running if the queue backed up during a worker restart — the user has likely already moved on.

---

## 5. What I'd Do Differently

**Start with Docker sandbox from day one.**
The `child_process` sandbox works but requires documenting all the security gaps. Starting with Docker containers would have produced a more production-honest implementation from the beginning, at the cost of more setup time.

**Redis-backed rate limiter from the start.**
The in-memory rate limiter caused test isolation issues and won't work correctly in a multi-instance deployment. A Redis store is a 2-line config change — should have been the default.

**Structured logging earlier.**
`console.log` throughout made debugging harder than necessary. Winston or Pino with structured JSON output and trace IDs would have made the queue → worker → DB flow much easier to follow.

---

*PROCESS.md — sanghynh | Mar 2026*