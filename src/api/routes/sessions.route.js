import { Router } from 'express';
import * as sessionsController from '../controllers/sessions.controller.js';

const router = Router();

router.post('/', sessionsController.createSession);
router.get('/:session_id', sessionsController.getSession);
router.patch('/:session_id', sessionsController.updateSession);

export default router;
