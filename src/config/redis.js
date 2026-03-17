import Redis from 'ioredis';
import config from './index.js';

export const createRedisConnection = () => {
  const conn = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
  });
  conn.on('error', (err) =>
    console.error('Redis connection error:', err.message)
  );
  conn.on('connect', () => console.log('Connected to Redis'));
  return conn;
};

export default createRedisConnection();
