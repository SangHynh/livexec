import { rateLimit } from 'express-rate-limit';
import { TooManyRequestsError } from '../../core/ApiError.js';
import config from '../../config/index.js';

export const executionRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: config.RATE_LIMIT?.EXECUTIONS_PER_MINUTE || 10,
  handler: (_req, _res, _next) => {
    throw new TooManyRequestsError(
      'Too many execution requests, please try again after a minute'
    );
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const sessionRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: config.RATE_LIMIT?.SESSIONS_PER_MINUTE || 60,
  handler: (_req, _res, _next) => {
    throw new TooManyRequestsError(
      'Too many session requests, please try again after a minute'
    );
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const globalRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: config.RATE_LIMIT?.GLOBAL_PER_MINUTE || 100,
  handler: (_req, _res, _next) => {
    throw new TooManyRequestsError('Too many requests, please try again later');
  },
  standardHeaders: true,
  legacyHeaders: false,
});
