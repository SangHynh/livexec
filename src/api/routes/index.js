import { Router } from 'express';
import sessionsRouter from './sessions.route.js';
import executionsRouter from './executions.route.js';
import { NotFoundError } from '../../core/ApiError.js';

const router = Router();

/**
 * Health check route
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date(),
    uptime: process.uptime(),
  });
});

/**
 * API Routes
 */
router.use('/code-sessions', sessionsRouter);
router.use('/executions', executionsRouter);

/**
 * Catch-all for undefined routes
 */
router.use((req, res, next) => {
  next(new NotFoundError(`Route ${req.originalUrl} not found`));
});

export default router;
