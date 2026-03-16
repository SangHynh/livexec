# LIVEXEC Test Plan - Source of Truth

> Objective: Ensure the reliability, security, and resilience of the Execution-as-a-Service system.

## 1. Unit Testing (`_test/unit/sandbox.test.js`)

- [x] **TC-1.1.1**: Successful JavaScript execution with correct `stdout`.
- [x] **TC-1.1.2**: Successful Python execution with correct `stdout`.
- [x] **TC-1.1.3**: Proper capture of Syntax Errors returning in `stderr`.
- [x] **TC-1.1.4**: Timeout handling (e.g., infinite `while(true)`) - Must kill the process and return `TIMEOUT`.
- [x] **TC-1.1.5**: Filesystem cleanup - Ensure temporary directories are deleted after execution.
- [x] **TC-1.1.6**: Language whitelist - Submit invalid language, verify clean error.

---

## 2. API Integration Testing (`_test/integration/api.test.js`)

- [x] **TC-2.1.1**: `POST /code-sessions` -> Create session with initial source code.
- [x] **TC-2.1.2**: `PATCH /code-sessions/:id` -> Update session source code.
- [x] **TC-2.1.3**: `POST /code-sessions/:id/run` -> Trigger execution, verify `QUEUED` status.
- [x] **TC-2.1.4**: `GET /executions/:id` -> Retrieve status and eventual results.
- [x] **TC-2.1.5**: Idempotency - Verify multiple run requests for the same session don't create multiple active jobs.
- [x] **TC-1.1.6 (API)**: Unsupported language via API returns 400.
- [x] **TC-2.2.1/2**: DB Persistence - Verify results (stdout/stderr/time) are saved correctly in Postgres.
- [x] **Session Error Handling**: Verify 404 for missing sessions and 400 for malformed UUIDs.

---

## 3. Security & Hardening (`_test/integration/security.test.js`)

- [x] **TC-3.1.1**: Source Code Size Limit - Reject code > 50KB.
- [x] **TC-3.1.2**: Dangerous Patterns - Block `require('fs')`.
- [x] **TC-3.1.3**: Case Sensitivity - Block `reQUIre('fS')`.
- [x] **TC-3.1.4**: Commented Patterns - Block dangerous patterns even inside comments.
- [x] **TC-3.1.5**: Obfuscation Bypass - Block concatenation attempts like `'re' + 'quire'`.
- [x] **TC-3.1.6**: Unicode Bypass - Block escaped sequences like `r\u0065quire`.
- [x] **TC-3.2.1**: Rate Limiting - Trigger 429 error after exceeding global/endpoint frequency.
- [x] **TC-3.2.2**: Session Quota - Enforce maximum 50 executions per session.

---

## 4. Resilience & Resource Limits (`_test/integration/resilience.test.js`)

- [x] **TC-4.1.1**: Memory Limit - Kill process attempting to consume excessive RAM.
- [x] **TC-4.1.2**: Stdout Limit - Kill process attempting to flood the log with massive output (> 1MB).
- [x] **TC-4.1.3**: CPU Limit - Kill infinite loops causing high CPU usage.
- [x] **TC-4.1.4**: Stack Limit - Catch stack overflow errors from deep recursion.
- [ ] **TC-4.1.5**: Queue TTL - Ensure jobs pending for too long in the queue are skipped/failed.

---

## 5. How to Run

```bash
# Run all tests
npm test

# Run specific categories
npm run test:unit
npm run test:api
npm run test:security
npm run test:resilience
```
