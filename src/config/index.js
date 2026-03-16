import dotenv from 'dotenv';

dotenv.config({ override: true });

const config = {
  PORT: process.env.PORT || 3000,
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  SANDBOX_TIMEOUT_MS: parseInt(process.env.SANDBOX_TIMEOUT_MS || '5000', 10),
  SANDBOX_MEMORY_LIMIT_MB: parseInt(
    process.env.SANDBOX_MEMORY_LIMIT_MB || '128',
    10
  ),
  MAX_EXECUTIONS_PER_MINUTE: parseInt(
    process.env.MAX_EXECUTIONS_PER_MINUTE || '10',
    10
  ),
  ALLOWED_LANGUAGES: (
    process.env.ALLOWED_LANGUAGES || 'javascript,python'
  ).split(','),

  // Queue configuration
  QUEUE: {
    CONCURRENCY: 5,
    ATTEMPTS: 3,
    BACKOFF_DELAY: 1000,
    REMOVE_ON_COMPLETE: 100,
    REMOVE_ON_FAIL: 500,
  },
};

export default config;
