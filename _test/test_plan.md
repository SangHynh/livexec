# LIVEXEC Test Plan

> Objective: Ensure the reliability and security of the Execution-as-a-Service system.

## 1. Unit Testing (Component Level)

### 1.1 Sandbox Runner (`src/sandbox/runner.js`)
- [x] **TC-1.1.1**: Successful JavaScript execution with correct `stdout`.
- [ ] **TC-1.1.2**: Successful Python execution with correct `stdout`. *(Skipped locally, verified in Docker)*
- [x] **TC-1.1.3**: Proper capture of Syntax Errors returning in `stderr`.
- [x] **TC-1.1.4**: Timeout handling (e.g., infinite `while(true)`) - Must kill the process and return `TIMEOUT` status.
- [x] **TC-1.1.5**: Filesystem cleanup - Ensure temporary directories are deleted after execution (on both success and failure).
- [x] **TC-1.1.6**: Language whitelist - Submit code with an invalid language (e.g., ruby), verify it returns a clean error and doesn't crash the runner.

### 1.2 Queue System (`src/queue/`)
- [x] **TC-1.2.1**: Producer adds jobs to the queue with the correct payload format.
- [x] **TC-1.2.2**: Consumer (Worker) retrieves jobs, updates DB status to `RUNNING`, and invokes the Sandbox.
- [ ] **TC-1.2.3**: Graceful error handling in case of Redis connection loss.

---

## 2. Integration Testing (End-to-End Flows)

### 2.1 API Endpoints (`src/api/routes/`)
- [x] **TC-2.1.1**: `POST /code-sessions` -> Create session, verify DB record.
- [x] **TC-2.1.2**: `PATCH /code-sessions/:id` -> Update session source code.
- [x] **TC-2.1.3**: `POST /executions` -> Trigger execution, verify job ID response.
- [x] **TC-2.1.4**: `GET /executions/:id` -> Poll status flow: `QUEUED` -> `RUNNING` -> `COMPLETED`.
- [x] **TC-2.1.5**: Idempotency test - `POST /executions` twice with the same session, verify it doesn't create duplicate executions if one is already pending.

### 2.2 Database Persistence (`src/db/`)
- [x] **TC-2.2.1**: Accurate storage of `stdout`, `stderr`, and `execution_time_ms` in the `executions` table.
- [x] **TC-2.2.2**: State consistency between the Worker's output and the final DB status.

---

## 3. Hardening & Security

### 3.1 Validation & Filtering
- [ ] **TC-3.1.1**: Source Code Size Limit - Send code > 50KB, verify 400 error.
- [ ] **TC-3.1.2**: Dangerous Patterns - Block `require('fs')`, `process.exit`, etc.
- [ ] **TC-3.1.3 (Edge Case)**: Case Sensitivity - Verify `rEquire('fS')` is also blocked.
- [ ] **TC-3.1.4 (Edge Case)**: Commented-out patterns - Verify patterns inside comments are still blocked (safer default).

### 3.2 Rate Limiting & Abuse Prevention
- [ ] **TC-3.2.1**: Execution Frequency - Send > 10 req/min, verify 429 error.
- [ ] **TC-3.2.2**: Max Executions per Session - Send 51st request for one session, verify 400 error.
- [ ] **TC-3.2.3**: Active Execution Lock - Try to run code while one is already `QUEUED`, verify it returns the active one (Idempotency focus).

### 3.3 Sandbox Integrity
- [ ] **TC-3.3.1**: Process Group Kill - Code that spawns a sub-process; verify both are killed on timeout (Spawn + Detached mode).

---

## 4. Tooling & Environment
- **Framework**: Jest (`npm install --save-dev jest`)
- **API Testing**: Supertest (`npm install --save-dev supertest`)
- **Rate Limit Testing**: Requires multiple rapid requests using `Promise.all`.

---

## 5. How to Run
```bash
npm test
```
