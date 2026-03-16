import dotenv from 'dotenv';
import { runMigrations } from './src/db/index.js';
import consumerManager from './src/queue/consumer.js';
import executionService from './src/services/execution.service.js';
import sessionService from './src/services/session.service.js';

dotenv.config();

const startWorker = async () => {
  console.log('Worker process starting...');

  try {
    // 1. Database setup (ensure it's ready)
    await runMigrations();

    // 2. Job processor logic
    const processExecution = async (job) => {
      const { executionId, sessionId } = job.data;
      console.log(`Processing execution ${executionId} (Session: ${sessionId})`);

      try {
        // Step A: Update status to RUNNING
        await executionService.updateExecution(executionId, {
          status: 'RUNNING',
          started_at: true
        });

        const session = await sessionService.getSession(sessionId);

        // Step B: Placeholder for Sandbox Execution (PHASE 4)
        console.log(`[SANDBOX] Simulating run for ${session.language}...`);
        
        // Simulating 2 seconds of work
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Step C: Update status to COMPLETED (Dummy results for now)
        await executionService.updateExecution(executionId, {
          status: 'COMPLETED',
          stdout: `Successfully simulated ${session.language} execution.\nCode: ${session.source_code}`,
          execution_time_ms: 2000,
          completed_at: true
        });

      } catch (error) {
        console.error(`Execution processing error:`, error.message);
        await executionService.updateExecution(executionId, {
          status: 'FAILED',
          error_message: error.message,
          completed_at: true
        });
        throw error; // Re-throw to allow BullMQ to handle retries
      }
    };

    // 3. Initialize the BullMQ consumer
    consumerManager.initConsumer(processExecution);

    console.log('Worker is now live and waiting for tasks!');

  } catch (error) {
    console.error('Failed to start worker:', error.message);
    process.exit(1);
  }
};

startWorker();
