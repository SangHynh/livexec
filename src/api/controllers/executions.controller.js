import executionService from '../../services/execution.service.js';
import sessionService from '../../services/session.service.js';
import producer from '../../queue/producer.js';
import asyncHandler from '../../core/asyncHandler.js';
import { CreatedResponse, OkResponse } from '../../core/ApiResponse.js';
import { BadRequestError } from '../../core/ApiError.js';

/**
 * Trigger code execution for a session
 */
export const executeCode = asyncHandler(async (req, res) => {
  const { session_id } = req.body;

  if (!session_id) {
    throw new BadRequestError('Session ID is required');
  }

  // 1. Verify session exists
  const session = await sessionService.getSession(session_id);

  // 2. Create execution record in DB (status: QUEUED)
  const execution = await executionService.createExecution(session.id);

  // 3. Send task to BullMQ queue for processing
  await producer.enqueueExecution(execution.id, session.id);

  return new CreatedResponse(execution, 'Execution queued').send(res);
});

/**
 * Get execution result/status
 */
export const getExecution = asyncHandler(async (req, res) => {
  const { execution_id } = req.params;
  const execution = await executionService.getExecution(execution_id);
  
  return new OkResponse(execution).send(res);
});
