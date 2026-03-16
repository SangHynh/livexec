import { rateLimit } from 'express-rate-limit';
import { ApiError } from '../../core/ApiError.js';

export const executionRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  handler: (req, res, next) => {
    throw new ApiError(
      429,
      'Too many execution requests, please try again after a minute'
    );
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const sessionRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  handler: (req, res, next) => {
    throw new ApiError(
      429,
      'Too many session requests, please try again after a minute'
    );
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const globalRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  handler: (req, res, next) => {
    throw new ApiError(429, 'Too many requests, please try again later');
  },
  standardHeaders: true,
  legacyHeaders: false,
});
