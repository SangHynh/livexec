import request from 'supertest';
import app from '../../src/app.js';
import { pool } from '../../src/db/index.js';
import redisConnection, {
  createRedisConnection,
} from '../../src/config/redis.js';
import producer from '../../src/queue/producer.js';
import consumerManager from '../../src/queue/consumer.js';
import executionService from '../../src/services/execution.service.js';
import sessionService from '../../src/services/session.service.js';
import sandboxRunner from '../../src/sandbox/runner.js';
import config from '../../src/config/index.js';

const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 30000;

/**
 * Poll an execution until it reaches a terminal state or times out.
 */
const pollExecution = async (executionId, timeoutLimit = POLL_TIMEOUT_MS) => {
  const start = Date.now();
  while (Date.now() - start < timeoutLimit) {
    const res = await request(app).get(`/executions/${executionId}`);
    const status = res.body?.data?.status;
    if (['COMPLETED', 'FAILED', 'TIMEOUT'].includes(status)) {
      return res.body.data;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return null;
};

describe('Resilience & Resource Limits Tests', () => {
  let testWorker;
  let localRedis;

  beforeAll(async () => {
    localRedis = createRedisConnection();
    await sandboxRunner.prepare();

    const processExecution = async (job) => {
      const { executionId, sessionId } = job.data;
      const jobTimestamp = job.timestamp;
      const ageMs = Date.now() - jobTimestamp;
      const ttlMs = config.QUEUE?.JOB_TTL_MS || 60000;

      // --- Security/Resilience Layer: Job Expiration Check ---
      if (ageMs > ttlMs) {
        await executionService.updateExecution(executionId, {
          status: 'FAILED',
          error_message: `Queue timeout: Execution skipped because it was pending for too long (${ageMs}ms).`,
          completed_at: true,
        });
        return;
      }

      try {
        await executionService.updateExecution(executionId, {
          status: 'RUNNING',
          started_at: true,
        });
        const session = await sessionService.getSession(sessionId);
        const result = await sandboxRunner.run(
          session.language,
          session.source_code
        );
        await executionService.updateExecution(executionId, {
          status: result.status,
          stdout: result.stdout,
          stderr: result.stderr,
          execution_time_ms: result.execution_time_ms,
          completed_at: true,
        });
      } catch (error) {
        await executionService.updateExecution(executionId, {
          status: 'FAILED',
          error_message: error.message,
          completed_at: true,
        });
      }
    };

    testWorker = consumerManager.initConsumer(processExecution);
  });

  afterAll(async () => {
    if (testWorker) await testWorker.close();
    await producer.executionQueue.close();
    await new Promise((r) => setTimeout(r, 500));
    await pool.end();
    await localRedis.quit();
    await redisConnection.quit();
  }, 15000);

  // Test cases are run sequentially by default in Jest to avoid rate limiting
  test('TC-4.1.1: Memory bomb — killed by limit or timeout', async () => {
    await new Promise((r) => setTimeout(r, 2000));
    const sessionRes = await request(app).post('/code-sessions').send({
      language: 'javascript',
      source_code:
        'const arr = []; while(true) { arr.push(new Array(1000000)); }',
    });

    expect(sessionRes.status).toBe(201);
    const sessionId = sessionRes.body.data.id;

    const runRes = await request(app)
      .post(`/code-sessions/${sessionId}/run`)
      .send({});
    expect(runRes.status).toBe(201);

    const result = await pollExecution(runRes.body.data.id, 60000);
    expect(result).not.toBeNull();
    expect(['TIMEOUT', 'FAILED']).toContain(result.status);
  }, 30000);

  test('TC-4.1.2: Stdout flood — killed when output exceeds 1MB', async () => {
    await new Promise((r) => setTimeout(r, 2000));
    const sessionRes = await request(app).post('/code-sessions').send({
      language: 'javascript',
      source_code: "while(true) { console.log('x'.repeat(1000)); }",
    });

    expect(sessionRes.status).toBe(201);
    const sessionId = sessionRes.body.data.id;

    const runRes = await request(app)
      .post(`/code-sessions/${sessionId}/run`)
      .send({});
    expect(runRes.status).toBe(201);

    const result = await pollExecution(runRes.body.data.id, 60000);
    expect(result).not.toBeNull();
    expect(['TIMEOUT', 'FAILED']).toContain(result.status);
    expect(result.stderr).toContain('truncated');
  }, 20000);

  test('TC-4.1.3: CPU bomb — infinite loop returns TIMEOUT after limit', async () => {
    await new Promise((r) => setTimeout(r, 2000));
    const sessionRes = await request(app).post('/code-sessions').send({
      language: 'javascript',
      source_code: 'while(true){}',
    });

    expect(sessionRes.status).toBe(201);
    const sessionId = sessionRes.body.data.id;

    const runRes = await request(app)
      .post(`/code-sessions/${sessionId}/run`)
      .send({});
    expect(runRes.status).toBe(201);

    const result = await pollExecution(runRes.body.data.id, 60000);
    expect(result).not.toBeNull();
    expect(result.status).toBe('TIMEOUT');
    expect(result.stderr).toContain('timed out');
  }, 20000);

  test('TC-4.1.4: Stack overflow — recursive bomb returns FAILED', async () => {
    await new Promise((r) => setTimeout(r, 2000));
    const sessionRes = await request(app).post('/code-sessions').send({
      language: 'javascript',
      source_code: 'function f(){return f()} f();',
    });

    expect(sessionRes.status).toBe(201);
    const sessionId = sessionRes.body.data.id;

    const runRes = await request(app)
      .post(`/code-sessions/${sessionId}/run`)
      .send({});
    expect(runRes.status).toBe(201);

    const result = await pollExecution(runRes.body.data.id, 60000);
    expect(result).not.toBeNull();
    expect(result.status).toBe('FAILED');
    expect(result.stderr.toLowerCase()).toContain('stack');
  }, 90000);

  test('TC-4.1.5: Queue TTL — skip jobs older than limit', async () => {
    // 1. Create a session
    const sessionRes = await request(app).post('/code-sessions').send({
      language: 'javascript',
      source_code: 'console.log("wonky")',
    });
    const sessionId = sessionRes.body.data.id;

    // 2. Create an execution record in DB first
    const execution = await executionService.createExecution(sessionId);

    // 3. Manually add to queue with an OLD timestamp (2 minutes ago)
    const oldTimestamp = Date.now() - 120 * 1000;
    await producer.executionQueue.add(
      'run-code',
      { executionId: execution.id, sessionId },
      { jobId: execution.id, timestamp: oldTimestamp }
    );

    // 4. Poll and verify it was failed by the TTL logic
    const result = await pollExecution(execution.id, 60000);
    expect(result).not.toBeNull();
    expect(result.status).toBe('FAILED');
    expect(result.error_message).toContain('Queue timeout');
  }, 90000);
});
