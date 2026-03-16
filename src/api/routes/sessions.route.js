import { Router } from 'express';
import * as sessionsController from '../controllers/sessions.controller.js';
import { validateUuid, limitSourceCodeSize, detectDangerousPatterns } from '../middlewares/validation.middleware.js';
import { sessionRateLimit } from '../middlewares/rate-limit.middleware.js';

const router = Router();

router.use(sessionRateLimit);

router.post('/', limitSourceCodeSize(50), detectDangerousPatterns, sessionsController.createSession);
router.get('/:session_id', validateUuid(['session_id']), sessionsController.getSession);
router.patch('/:session_id', validateUuid(['session_id']), limitSourceCodeSize(50), detectDangerousPatterns, sessionsController.updateSession);

export default router;
