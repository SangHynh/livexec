import { Router } from 'express';
import * as executionsController from '../controllers/executions.controller.js';
import { validateUuid } from '../middlewares/validation.middleware.js';
import { executionRateLimit } from '../middlewares/rate-limit.middleware.js';

const router = Router();

router.use(executionRateLimit);

router.get('/:execution_id', validateUuid(['execution_id']), executionsController.getExecution);

export default router;
