import { Router } from 'express';
import * as sessionsController from '../controllers/sessions.controller.js';
import { validateUuid, limitSourceCodeSize } from '../middlewares/validation.middleware.js';

const router = Router();

router.post('/', limitSourceCodeSize(50), sessionsController.createSession);
router.get('/:session_id', validateUuid(['session_id']), sessionsController.getSession);
router.patch('/:session_id', validateUuid(['session_id']), limitSourceCodeSize(50), sessionsController.updateSession);

export default router;
