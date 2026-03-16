import { Router } from 'express';
import * as executionsController from '../controllers/executions.controller.js';
import { validateUuid } from '../middlewares/validation.middleware.js';
import { executionRateLimit } from '../middlewares/rate-limit.middleware.js';

const router = Router();

router.use(executionRateLimit);

router.get(
  '/:execution_id',
  validateUuid(['execution_id']),
  executionsController.getExecution
);

router.post('/:id/run', executionRateLimit, executionsController.executeCode);

export default router;
