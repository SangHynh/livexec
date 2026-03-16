import { Router } from 'express';
import * as sessionsController from '../controllers/sessions.controller.js';
import * as executionsController from '../controllers/executions.controller.js';
import { validateUuid, limitSourceCodeSize, detectDangerousPatterns } from '../middlewares/validation.middleware.js';
import { sessionRateLimit, executionRateLimit } from '../middlewares/rate-limit.middleware.js';

const router = Router();

router.post('/', sessionRateLimit, limitSourceCodeSize(50), detectDangerousPatterns, sessionsController.createSession);
router.get('/:session_id', sessionRateLimit, validateUuid(['session_id']), sessionsController.getSession);
router.patch('/:session_id', sessionRateLimit, validateUuid(['session_id']), limitSourceCodeSize(50), detectDangerousPatterns, sessionsController.updateSession);
router.post('/:session_id/run', executionRateLimit, validateUuid(['session_id']), executionsController.executeCode);

export default router;
