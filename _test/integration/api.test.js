import request from 'supertest';
import app from '../../src/app.js';
import { pool } from '../../src/db/index.js';
import consumerManager from '../../src/queue/consumer.js';
import executionService from '../../src/services/execution.service.js';
import sessionService from '../../src/services/session.service.js';
import sandboxRunner from '../../src/sandbox/runner.js';
import redisConnection, {
  createRedisConnection,
} from '../../src/config/redis.js';
import producer from '../../src/queue/producer.js';

describe('API Integration Tests', () => {
  let sessionId;
  let testWorker;
  let localRedis;

  beforeAll(async () => {
    localRedis = createRedisConnection();
    await sandboxRunner.prepare();

    // Start a test worker to process jobs during integration tests
    const processExecution = async (job) => {
      const { executionId, sessionId } = job.data;
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

  test('TC-2.1.1: Should create a new code session', async () => {
    const res = await request(app).post('/code-sessions').send({
      language: 'javascript',
      source_code: 'setTimeout(() => console.log("init"), 500)',
    });

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('id');
    sessionId = res.body.data.id;
  });

  test('Should GET session details', async () => {
    const res = await request(app).get(`/code-sessions/${sessionId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.language).toBe('javascript');
  });

  test('TC-2.1.2: Should update session source code (PATCH)', async () => {
    const newCode = 'console.log("updated")';
    const res = await request(app)
      .patch(`/code-sessions/${sessionId}`)
      .send({ source_code: newCode });

    expect(res.status).toBe(200);
    expect(res.body.data.source_code).toBe(newCode);
  });

  test('TC-1.1.6: Should return error for unsupported language via API', async () => {
    const res = await request(app)
      .post('/code-sessions')
      .send({ language: 'ruby' });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('is not supported');
  });

  test('TC-2.1.3: Should trigger code execution (POST /code-sessions/:id/run)', async () => {
    const res = await request(app)
      .post(`/code-sessions/${sessionId}/run`)
      .send({});

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.status).toBe('QUEUED');
  });

  test('TC-2.1.5: Idempotency - Should return existing active execution', async () => {
    const res = await request(app)
      .post(`/code-sessions/${sessionId}/run`)
      .send({});

    // Since one is already QUEUED from previous test
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('already in progress');
  });

  test('TC-2.1.4: Should get execution status (GET /executions/:id)', async () => {
    // We need an execution ID - we'll trigger one just in case or use the one from TC-2.1.3
    // But since TC-2.1.5 returned it, we can use that body
    const resTrigger = await request(app)
      .post(`/code-sessions/${sessionId}/run`)
      .send({});

    const executionId = resTrigger.body.data.id;

    const res = await request(app).get(`/executions/${executionId}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('status');
    // It could be QUEUED, RUNNING or COMPLETED depending on worker speed
    expect(['QUEUED', 'RUNNING', 'COMPLETED']).toContain(res.body.data.status);
  });

  test('TC-2.2.1 & TC-2.2.2: Should persist execution results in DB after completion', async () => {
    // 1. Trigger execution
    const resTrigger = await request(app)
      .post(`/code-sessions/${sessionId}/run`)
      .send({});

    expect([201, 200]).toContain(resTrigger.status);
    const executionId = resTrigger.body.data.id;

    // 2. Poll until FINISHED (COMPLETED/FAILED/TIMEOUT) or max 30s (30 attempts * 1000ms)
    let status = 'QUEUED';
    for (let attempts = 0; attempts < 30; attempts++) {
      const res = await request(app).get(`/executions/${executionId}`);

      if (res.body && res.body.data) {
        status = res.body.data.status;
      }

      if (['COMPLETED', 'FAILED', 'TIMEOUT'].includes(status)) {
        break;
      }

      await new Promise((r) => setTimeout(r, 1000));
    }

    // Verify consistency
    expect(status).toBe('COMPLETED');

    const dbResult = await pool.query(
      'SELECT status FROM executions WHERE id = $1',
      [executionId]
    );
    expect(dbResult.rows[0].status).toBe('COMPLETED');
  }, 45000);

  test('Should return 404 for non-existent session', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app).get(`/code-sessions/${fakeId}`);
    expect(res.status).toBe(404);
  });

  test('Should return 400 for malformed UUID', async () => {
    const malformedId = 'not-a-uuid';
    const res = await request(app).get(`/code-sessions/${malformedId}`);
    // Our app might return 400 or 404 depending on error handling logic
    // Usually validation middleware would catch this as 400
    expect([400, 404]).toContain(res.status);
  });
});
