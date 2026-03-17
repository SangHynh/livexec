import dotenv from 'dotenv';

dotenv.config({ override: true });

const config = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  DATABASE_URL:
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/livexec',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',

  // Sandbox constraints (Hardcoded as not in .env.example)
  SANDBOX: {
    TIMEOUT_MS: 5000,
    MEMORY_LIMIT_MB: 128,
    MAX_OUTPUT_SIZE: 1024 * 1024, // 1MB
    MAX_SOURCE_CODE_SIZE_KB: 50,
  },

  // Rate limiting (Hardcoded as not in .env.example)
  RATE_LIMIT: {
    EXECUTIONS_PER_MINUTE: 30,
    SESSIONS_PER_MINUTE: 60,
    GLOBAL_PER_MINUTE: 500,
    MAX_EXECUTIONS_PER_SESSION: 50,
  },

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
    JOB_TTL_MS: 60000, // 1 minute execution TTL in queue
  },

  // Keep alive configuration
  APP_URL: process.env.APP_URL || null,
  KEEP_ALIVE_INTERVAL_MS: 8 * 60 * 1000, // 8 minutes
};

export default config;
