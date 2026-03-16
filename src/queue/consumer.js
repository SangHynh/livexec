import { Worker } from 'bullmq';
import redisConnection from '../config/redis.js';
import executionService from '../services/execution.service.js';
import config from '../config/index.js';

const EXECUTION_QUEUE_NAME = 'code-execution';

/**
 * Initialize the consumer to process jobs from the queue
 * @param {Function} processor - The function that handles each job
 */
const initConsumer = (processor) => {
  const worker = new Worker(EXECUTION_QUEUE_NAME, processor, {
    connection: redisConnection,
    concurrency: config.QUEUE?.CONCURRENCY || 5, // Fallback to 5
  });

  worker.on('completed', (job) => {
    console.log(`Job ${job.id} completed successfully`);
  });

  worker.on('failed', async (job, error) => {
    console.error(`Job ${job.id} failed with error: ${error.message}`);

    // If all attempts failed, update status in DB
    if (job.attemptsMade >= job.opts.attempts) {
      console.log(`Job ${job.id} reached max retries. Marking as FAILED.`);
      await executionService.updateExecution(job.data.executionId, {
        status: 'FAILED',
        error_message: `Fatal error after ${job.opts.attempts} retries: ${error.message}`,
        completed_at: true,
      });
    }
  });

  console.log('BullMQ Consumer initialized and listening for jobs...');
  return worker;
};

export default {
  initConsumer,
};
