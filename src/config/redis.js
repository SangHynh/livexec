import Redis from 'ioredis';
import config from './index.js';

const redisConnection = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null, // Essential for BullMQ
});

redisConnection.on('error', (error) => {
  console.error('Redis connection error:', error.message);
});

redisConnection.on('connect', () => {
  console.log('Connected to Redis');
});

export default redisConnection;
