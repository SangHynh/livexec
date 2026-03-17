import request from 'supertest';
import app from '../../src/app.js';
import { pool } from '../../src/db/index.js';
import { v4 as uuidv4 } from 'uuid';
import redisConnection, { createRedisConnection } from '../../src/config/redis.js';
import producer from '../../src/queue/producer.js';

describe('Security and Hardening Integration Tests', () => {
  let sessionId;
  let localRedis;

  beforeAll(async () => {
    localRedis = createRedisConnection();
    const res = await request(app)
      .post('/code-sessions')
      .send({
        language: 'javascript',
        source_code: '// security test session',
      });
    sessionId = res.body.data.id;
  });

  afterAll(async () => {
    await producer.executionQueue.close();
    await new Promise((r) => setTimeout(r, 500));
    await pool.end();
    await localRedis.quit();
    await redisConnection.quit();
  }, 15000);

  describe('3.1 Validation & Filtering', () => {
    test('TC-3.1.1: Should reject source code > 50KB', async () => {
      const largeCode = 'a'.repeat(51 * 1024); // 51KB
      const res = await request(app)
        .post('/code-sessions')
        .send({ language: 'javascript', source_code: largeCode });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('exceeds limit');
    });

    test('TC-3.1.2: Should block dangerous patterns (fs)', async () => {
      const res = await request(app)
        .post('/code-sessions')
        .send({
          language: 'javascript',
          source_code: "const fs = require('fs');",
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('dangerous code detected');
      expect(res.body.message).toContain('fs');
    });

    test('TC-3.1.3: Should be case-insensitive for dangerous patterns', async () => {
      const res = await request(app)
        .patch(`/code-sessions/${sessionId}`)
        .send({ source_code: "const x = reQUIre('fS');" });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('dangerous code detected');
    });

    test('TC-3.1.4: Should block dangerous patterns inside comments', async () => {
      const res = await request(app)
        .post('/code-sessions')
        .send({
          language: 'javascript',
          source_code: "// I am not dangerous: require('fs')",
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('dangerous code detected');
    });

    test('TC-3.1.5 (Edge Case): Obfuscation attempt 1 (concatenation)', async () => {
      // Now should be BLOCKED by normalization logic
      const res = await request(app)
        .post('/code-sessions')
        .send({
          language: 'javascript',
          source_code: "const r = 're' + 'quire'; const fs = r('fs');",
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('dangerous code detected');
    });

    test('TC-3.1.6 (Edge Case): Unicode/Normalization bypass attempt', async () => {
      // Now should be BLOCKED by unescape logic
      const code = "const fs = r\\u0065quire('fs');";
      const res = await request(app)
        .post('/code-sessions')
        .send({ language: 'javascript', source_code: code });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('dangerous code detected');
    });
  });

  describe('3.2 Rate Limiting & Abuse Prevention', () => {
    test('TC-3.2.2: Should enforce max executions (50) per session', async () => {
      // 1. Create a fresh session to avoid pollution
      const freshSessionRes = await request(app)
        .post('/code-sessions')
        .send({
          language: 'javascript',
          source_code: 'console.log("limit test")',
        });
      const freshId = freshSessionRes.body.data.id;

      // 2. Manually insert 50 completed executions into DB for this session
      // This is faster than hitting the API 50 times (and avoids rate limits during test)
      for (let i = 0; i < 50; i++) {
        await pool.query(
          'INSERT INTO executions (session_id, status) VALUES ($1, $2)',
          [freshId, 'COMPLETED']
        );
      }

      // 3. Try to trigger the 51st execution via API
      const res = await request(app)
        .post(`/code-sessions/${freshId}/run`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toContain(
        'Maximum execution limit (50) reached'
      );
    });

    test('TC-3.2.1: Should trigger rate limiting after multiple requests', async () => {
      // Note: This test might fail if the rate limit store is shared or if IP is blocked
      // We'll try hitting the health check or a simple endpoint multiple times
      // Since our limit is 100/min global, we need 101 requests.
      // For/executions it's 10/min. Let's try /executions

      const promises = [];
      for (let i = 0; i < 35; i++) {
        promises.push(
          request(app).post(`/code-sessions/${sessionId}/run`).send({})
        );
      }

      const results = await Promise.all(promises);
      const rateLimited = results.some((r) => r.status === 429);

      // We skip strict assertion here because in some environments (Docker/Local)
      // the IP might be detected differently or middleware might not be active in test agent
      // But we check if at least one returned 429
      expect(rateLimited).toBe(true);
    }, 20000);
  });
});
