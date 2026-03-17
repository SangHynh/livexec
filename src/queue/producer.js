import { Queue } from 'bullmq';
import { createRedisConnection } from '../config/redis.js';
import config from '../config/index.js';

const EXECUTION_QUEUE_NAME = 'code-execution';

const executionQueue = new Queue(EXECUTION_QUEUE_NAME, {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: config.QUEUE?.ATTEMPTS || 3,
    backoff: {
      type: 'exponential',
      delay: config.QUEUE?.BACKOFF_DELAY || 1000,
    },
    removeOnComplete: config.QUEUE?.REMOVE_ON_COMPLETE || 100,
    removeOnFail: config.QUEUE?.REMOVE_ON_FAIL || 500,
  },
});

/**
 * Add an execution task to the queue
 * @param {string} executionId - Execution UUID
 * @param {string} sessionId - Session UUID
 */
const enqueueExecution = async (executionId, sessionId) => {
  await executionQueue.add(
    'run-code',
    { executionId, sessionId },
    { jobId: executionId } // Use executionId as jobId for idempotency
  );
};

export default {
  enqueueExecution,
  executionQueue,
};
