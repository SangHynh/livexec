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
  const { session_id } = req.params;

  // 1. Verify session exists
  const session = await sessionService.getSession(session_id);

  // 2. Idempotency Check: Check if there's already an active execution for this session
  const activeExecution = await executionService.getActiveExecutionBySession(
    session.id
  );
  if (activeExecution) {
    const data = { ...activeExecution, queued_at: activeExecution.created_at };
    return new OkResponse(data, 'Execution already in progress').send(res);
  }

  // 2.5 Execution Limit Check: max 50 per session
  const totalExecutions = await executionService.getExecutionCountBySession(
    session.id
  );
  if (totalExecutions >= 50) {
    throw new BadRequestError(
      'Maximum execution limit (50) reached for this session'
    );
  }

  // 3. Create execution record in DB (status: QUEUED)
  const execution = await executionService.createExecution(session.id);

  // 4. Send task to BullMQ queue for processing
  await producer.enqueueExecution(execution.id, session.id);

  const data = { ...execution, queued_at: execution.created_at };
  return new CreatedResponse(data, 'Execution queued').send(res);
});

/**
 * Get execution result/status
 */
export const getExecution = asyncHandler(async (req, res) => {
  const { execution_id } = req.params;
  const execution = await executionService.getExecution(execution_id);

  return new OkResponse(execution).send(res);
});
