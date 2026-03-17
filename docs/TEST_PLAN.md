# 🧪 LIVEXEC Test Plan — Source of Truth

> **Objective:** Ensure the reliability, security, and resilience of the Execution-as-a-Service system.
>
> All tests pass as of Mar 2026. Run with `npm test` to verify.

---

## 🛠️ 1. Unit Testing (`_test/unit/sandbox.test.js`)
*Tests the `SandboxRunner` class in isolation — no HTTP, no queue, no DB. Calls `runner.run()` directly and asserts on the returned result object.*

| ID | Test Case | Technical Description | Status |
|:---|:---|:---|:---:|
| **TC-1.1.1** | JavaScript Execution | Runs `console.log("hello")` in Node.js, asserts `status: COMPLETED` and `stdout` contains `"hello"`. | ✅ |
| **TC-1.1.2** | Python Execution | Runs `print("hello")` via `python3`, asserts `status: COMPLETED` and correct `stdout`. | ✅ |
| **TC-1.1.3** | Syntax Error Capture | Submits malformed JS (`const x = {`), asserts `status: FAILED` and `stderr` contains message. | ✅ |
| **TC-1.1.4** | Timeout Protection | Submits `while(true){}`, asserts `status: TIMEOUT` after 5s. Verifies process group is killed. | ✅ |
| **TC-1.1.5** | Directory Cleanup | Asserts the working directory under `temp/executions/{uuid}/` no longer exists after exit. | ✅ |
| **TC-1.1.6** | Language Whitelist | Calls `runner.run('ruby', ...)`, asserts `status: FAILED` and a clean unsupported error. | ✅ |

---

## 🌐 2. API Integration Testing (`_test/integration/api.test.js`)
*End-to-end tests over HTTP using Supertest. Spins up a real BullMQ worker inside `beforeAll` to process jobs.*

| ID | Test Case | Technical Description | Status |
|:---|:---|:---|:---:|
| **TC-2.1.1** | Create Session | `POST /code-sessions` returns 201, valid UUID, and `status: ACTIVE`. | ✅ |
| **TC-2.1.2** | Autosave Code | `PATCH /code-sessions/:id` updates source code and reflects in immediate response. | ✅ |
| **TC-2.1.3** | Trigger Execution | `POST /code-sessions/:id/run` returns 201 and `status: QUEUED` immediately. | ✅ |
| **TC-2.1.4** | Status Polling | `GET /executions/:id` returns `QUEUED`, `RUNNING`, or `COMPLETED` based on worker. | ✅ |
| **TC-2.1.5** | Idempotency | Rapid double-trigger return 200 with message `"already in progress"` for second call. | ✅ |
| **TC-2.2.1/2** | DB Persistence | Polls until finish, then queries PostgreSQL to verify DB status matches API. | ✅ |
| **TC-1.1.6 (API)** | Unsupported Language | `POST /code-sessions` with `language: ruby` returns 400 `LANGUAGE_NOT_SUPPORTED`. | ✅ |
| **Error Handling** | UUID Validation | Invalid UUIDs return 400 `INVALID_UUID`; missing UUIDs return 404. | ✅ |

---

## 🛡️ 3. Security & Hardening (`_test/integration/security.test.js`)
*Tests the `detectDangerousPatterns` middleware and rate limiting at the API layer.*

| ID | Test Case | Technical Description | Status |
|:---|:---|:---|:---:|
| **TC-3.1.1** | Size Limit | Rejects `source_code` > 50KB with 400 `SOURCE_CODE_TOO_LARGE`. | ✅ |
| **TC-3.1.2** | Pattern: `fs` | Blocks `require('fs')` with 400 `DANGEROUS_CODE_DETECTED`. | ✅ |
| **TC-3.1.3** | Case Insensitivity | Submits `reQUIre('fS')`. Asserts blocked (middleware lowercases matches). | ✅ |
| **TC-3.1.4** | Comment Bypass | Submits `// require('fs')`. Asserts blocked (safety over-blocking). | ✅ |
| **TC-3.1.5** | Concat Bypass | Submits `'re' + 'quire'`. Asserts blocked (middleware strips operators/quotes). | ✅ |
| **TC-3.1.6** | Unicode Bypass | Submits `r\u0065quire`. Asserts blocked (middleware unescapes Unicode). | ✅ |
| **TC-3.2.1** | Rate Limit | 35 rapid requests via `Promise.all`. Asserts at least one returns 429. | ✅ |
| **TC-3.2.2** | Session Quota | Rejects 51st execution for a single session with `EXECUTION_LIMIT_REACHED`. | ✅ |

---

## ⚡ 4. Resilience & Resource Limits (`_test/integration/resilience.test.js`)
*Tests sandbox behavior under adversarial conditions using 60s poll timeouts.*

| ID | Test Case | Technical Description | Status |
|:---|:---|:---|:---:|
| **TC-4.1.1** | Memory Bomb | Process killed when exceeding 128MB V8 heap limit or 5s system timeout. | ✅ |
| **TC-4.1.2** | Stdout Flooding | Process killed when logs exceed 1MB buffer. `stderr` contains `"truncated"`. | ✅ |
| **TC-4.1.3** | CPU Exhaustion | Infinite CPU loops (`while(true){}`) terminated by sandbox after 5s. | ✅ |
| **TC-4.1.4** | Stack Overflow | Deep recursion caught. Job marked `FAILED` after 3 retries (90s test timeout). | ✅ |
| **TC-4.1.5** | Queue TTL | Jobs stale by > 60s skipped by worker and marked `FAILED` in DB. | ✅ |

---

## 🧰 5. Tooling

| Tool | Purpose |
|:---|:---|
| **Jest** | Test runner and assertion framework |
| **Supertest** | HTTP integration testing against Express app |
| **pg (direct)** | DB state verification in integration tests |
| **BullMQ Worker** | Spun up inside `beforeAll` to process jobs during integration tests |

---

## 🚀 6. How to Run

```bash
# Run all suites in order
npm test

# Run individual suites
npm run test:unit
npm run test:api
npm run test:security
npm run test:resilience
```

> [!NOTE]
> Run suites individually when iterating — running all together can cause rate limiter state from one suite to bleed into the next.

---

*TEST_PLAN.md — sanghynh | Mar 2026*