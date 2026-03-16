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

## 3. Tooling & Environment
- **Framework**: Jest (`npm install --save-dev jest`)
- **API Testing**: Supertest (`npm install --save-dev supertest`)
- **Database**: Mock PostgreSQL using `jest.mock` or a dedicated test database container.
- **Queue**: Mock BullMQ for isolated unit tests.

---

## 4. How to Run
```bash
npm test
```
