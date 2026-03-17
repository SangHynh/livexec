# LIVEXEC Test Plan — Source of Truth

> Objective: Ensure the reliability, security, and resilience of the Execution-as-a-Service system.
>
> All tests pass as of Mar 2026. Run with `npm test` to verify.

---

## 1. Unit Testing (`_test/unit/sandbox.test.js`)

Tests the `SandboxRunner` class in isolation — no HTTP, no queue, no DB. Calls `runner.run()` directly and asserts on the returned result object.

- [x] **TC-1.1.1** — **JS Execution**: Runs `console.log("hello")` in Node.js, asserts `status: COMPLETED` and `stdout` contains `"hello"`.
- [x] **TC-1.1.2** — **Python Execution**: Runs `print("hello")` via `python3`, asserts `status: COMPLETED` and correct `stdout`.
- [x] **TC-1.1.3** — **Syntax Error Capture**: Submits malformed JS (`const x = {`), asserts `status: FAILED` and `stderr` contains the syntax error message.
- [x] **TC-1.1.4** — **Timeout Kill**: Submits `while(true){}`, asserts `status: TIMEOUT` and `stderr` contains `"timed out"` after 5s. Verifies the process group is killed, not just the parent.
- [x] **TC-1.1.5** — **Temp Directory Cleanup**: After any execution (success or failure), asserts the working directory under `temp/executions/{uuid}/` no longer exists.
- [x] **TC-1.1.6** — **Language Whitelist**: Calls `runner.run('ruby', ...)`, asserts `status: FAILED` and a clean error message — no crash.

---

## 2. API Integration Testing (`_test/integration/api.test.js`)

End-to-end tests over HTTP using Supertest. Spins up a real BullMQ worker inside `beforeAll` to process jobs, so executions run to completion within the test suite.

- [x] **TC-2.1.1** — **Create Session**: `POST /code-sessions` with `language: javascript` and `source_code`. Asserts `201`, response contains `id`, `language`, `source_code`, `status: ACTIVE`.
- [x] **TC-2.1.2** — **Autosave Code**: `PATCH /code-sessions/:id` with new `source_code`. Asserts `200` and the updated code is reflected in the response.
- [x] **TC-2.1.3** — **Trigger Execution**: `POST /code-sessions/:id/run`. Asserts `201` and `status: QUEUED` returned immediately — does not wait for execution.
- [x] **TC-2.1.4** — **Poll Status**: `GET /executions/:id` immediately after triggering. Asserts `200` and `status` is one of `QUEUED`, `RUNNING`, or `COMPLETED` depending on worker speed.
- [x] **TC-2.1.5** — **Idempotency**: Calls `POST /code-sessions/:id/run` twice in rapid succession. Second call must return `200` with the existing execution and message `"already in progress"` — no duplicate created.
- [x] **TC-2.2.1/2** — **DB Persistence**: Triggers execution and polls until `COMPLETED` (up to 30s). Then queries PostgreSQL directly and asserts `status: COMPLETED` in the DB matches the API response.
- [x] **TC-1.1.6 (API)** — **Unsupported Language via API**: `POST /code-sessions` with `language: ruby`. Asserts `400` and `errorCode: LANGUAGE_NOT_SUPPORTED`.
- [x] **Error Handling** — `GET /code-sessions/{nil-uuid}` returns `404`. `GET /code-sessions/not-a-uuid` returns `400` with `errorCode: INVALID_UUID`.

---

## 3. Security & Hardening (`_test/integration/security.test.js`)

Tests the `detectDangerousPatterns` middleware and rate limiting. All checks happen at the API layer before any execution is created.

- [x] **TC-3.1.1** — **Size Limit**: Sends `source_code` of 51KB. Asserts `400` with `errorCode: SOURCE_CODE_TOO_LARGE`.
- [x] **TC-3.1.2** — **Dangerous Pattern — fs**: Submits `const fs = require('fs')`. Asserts `400` with `errorCode: DANGEROUS_CODE_DETECTED` and message mentions `fs`.
- [x] **TC-3.1.3** — **Case Insensitivity**: Submits `reQUIre('fS')` (mixed case). Asserts blocked — the middleware lowercases before matching.
- [x] **TC-3.1.4** — **Commented Patterns**: Submits `// require('fs')` inside a comment. Asserts still blocked — safer to over-block than miss.
- [x] **TC-3.1.5** — **Concatenation Bypass**: Submits `'re' + 'quire'`. Asserts blocked — the middleware strips operators and quotes before matching.
- [x] **TC-3.1.6** — **Unicode Bypass**: Submits `r\u0065quire` (`\u0065` = `e`). Asserts blocked — middleware unescapes Unicode sequences before matching.
- [x] **TC-3.2.1** — **Rate Limit**: Sends 35 rapid `POST /code-sessions/:id/run` requests via `Promise.all`. Asserts at least one returns `429`.
- [x] **TC-3.2.2** — **Session Quota**: Inserts 50 `COMPLETED` execution records directly into DB for a fresh session, then tries to trigger the 51st via API. Asserts `400` with `errorCode: EXECUTION_LIMIT_REACHED`.

---

## 4. Resilience & Resource Limits (`_test/integration/resilience.test.js`)

Tests sandbox behavior under adversarial conditions. Each test waits 2s before starting to avoid rate limiting from previous tests. All use a 60s poll timeout to account for BullMQ retry delays.

- [x] **TC-4.1.1** — **Memory Bomb**: Submits `const arr = []; while(true) { arr.push(new Array(1000000)); }`. Asserts `TIMEOUT` or `FAILED` — the 128MB V8 heap limit triggers OOM before exhausting server RAM, and the 5s timeout kills anything that survives.
- [x] **TC-4.1.2** — **Stdout Flood**: Submits `while(true) { console.log('x'.repeat(1000)); }`. Asserts `FAILED` or `TIMEOUT` and `stderr` contains `"truncated"` — the 1MB stdout cap kills the process before Redis or the DB are flooded.
- [x] **TC-4.1.3** — **CPU Bomb**: Submits `while(true){}`. Asserts `status: TIMEOUT` and `stderr` contains `"timed out"` — pure CPU loop is killed after 5s.
- [x] **TC-4.1.4** — **Stack Overflow**: Submits `function f(){return f()} f()`. Asserts `status: FAILED` and `stderr` contains `"stack"`. Test timeout is 90s to allow for BullMQ's 3 retry attempts with exponential backoff before the job is permanently marked FAILED.
- [x] **TC-4.1.5** — **Queue TTL**: Manually inserts a job into BullMQ with a timestamp 2 minutes in the past. Asserts the worker skips it and marks the execution `FAILED` with `error_message` containing `"Queue timeout"` — stale jobs are never executed.

---

## 5. Tooling

| Tool | Purpose |
|---|---|
| Jest | Test runner and assertion framework |
| Supertest | HTTP integration testing against Express app |
| pg (direct) | DB state verification in integration tests |
| BullMQ Worker (inline) | Spun up inside `beforeAll` to process jobs during API/resilience tests |

---

## 6. How to Run

```bash
# Run all suites in order
npm test

# Run individual suites
npm run test:unit
npm run test:api
npm run test:security
npm run test:resilience
```

> **Note:** Run suites individually when iterating — running all together can cause rate limiter state from one suite to bleed into the next.

---

*LIVEXEC Test Plan — Sang | Mar 2026*