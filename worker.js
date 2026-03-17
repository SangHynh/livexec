import dotenv from 'dotenv';
import { runMigrations } from './src/db/index.js';
import consumerManager from './src/queue/consumer.js';
import executionService from './src/services/execution.service.js';
import sessionService from './src/services/session.service.js';
import sandboxRunner from './src/sandbox/runner.js';
import config from './src/config/index.js';

dotenv.config();

const startWorker = async () => {
  // console.log('Worker process starting...');

  try {
    // 1. Prepare sandbox environment
    await sandboxRunner.prepare();

    // 2. Database setup (ensure it's ready)
    await runMigrations();

    // 3. Job processor logic
    const processExecution = async (job) => {
      const { executionId, sessionId } = job.data;
      const jobTimestamp = job.timestamp;
      const ageMs = Date.now() - jobTimestamp;
      const ttlMs = config.QUEUE?.JOB_TTL_MS || 60000;

      /* console.log(
        `Processing execution ${executionId} (Session: ${sessionId}). Age: ${ageMs}ms`
      ); */

      // --- Security/Resilience Layer: Job Expiration Check ---
      if (ageMs > ttlMs) {
        console.warn(`[EXPIRED] Job ${executionId} is too old. Skipping.`);
        await executionService.updateExecution(executionId, {
          status: 'FAILED',
          error_message: `Queue timeout: Execution skipped because it was pending for too long (${ageMs}ms).`,
          completed_at: true,
        });
        return;
      }

      try {
        // Step A: Update status to RUNNING
        await executionService.updateExecution(executionId, {
          status: 'RUNNING',
          started_at: true,
        });

        const session = await sessionService.getSession(sessionId);

        // Step B: REAL Sandbox Execution
        console.log(`[SANDBOX] Running ${session.language} code...`);
        const result = await sandboxRunner.run(
          session.language,
          session.source_code
        );

        // Step C: Update status and results
        await executionService.updateExecution(executionId, {
          status: result.status,
          stdout: result.stdout,
          stderr: result.stderr,
          execution_time_ms: result.execution_time_ms,
          completed_at: true,
        });

        /* console.log(
          `Execution ${executionId} finished with status: ${result.status}`
        ); */
      } catch (error) {
        console.error(`Execution processing error:`, error.message);
        await executionService.updateExecution(executionId, {
          status: 'FAILED',
          error_message: error.message,
          completed_at: true,
        });
        throw error; // Re-throw to allow BullMQ to handle retries
      }
    };

    // 3. Initialize the BullMQ consumer
    consumerManager.initConsumer(processExecution);

    // console.log('Worker is now live and waiting for tasks!');
  } catch (error) {
    console.error('Failed to start worker:', error.message);
    process.exit(1);
  }
};

startWorker();
