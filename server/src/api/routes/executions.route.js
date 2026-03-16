import { Router } from 'express';
import * as executionsController from '../controllers/executions.controller.js';

const router = Router();

router.post('/', executionsController.executeCode);
router.get('/:execution_id', executionsController.getExecution);

export default router;
