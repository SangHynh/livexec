import sessionService from '../../services/session.service.js';
import asyncHandler from '../../core/asyncHandler.js';
import { CreatedResponse, OkResponse } from '../../core/ApiResponse.js';
import { BadRequestError } from '../../core/ApiError.js';
import config from '../../config/index.js';

/**
 * Create a new code session
 */
export const createSession = asyncHandler(async (req, res) => {
  const { language, source_code } = req.body;

  if (!language) {
    throw new BadRequestError('Language is required');
  }

  if (!config.ALLOWED_LANGUAGES.includes(language)) {
    throw new BadRequestError(`Language "${language}" is not supported. Supported: ${config.ALLOWED_LANGUAGES.join(', ')}`);
  }

  const session = await sessionService.createSession(language, source_code);
  
  return new CreatedResponse(session, 'Session created successfully').send(res);
});

/**
 * Get session details
 */
export const getSession = asyncHandler(async (req, res) => {
  const { session_id } = req.params;
  const session = await sessionService.getSession(session_id);
  
  return new OkResponse(session).send(res);
});

/**
 * Update session code or language
 */
export const updateSession = asyncHandler(async (req, res) => {
  const { session_id } = req.params;
  const { language, source_code, status } = req.body;

  if (language && !config.ALLOWED_LANGUAGES.includes(language)) {
    throw new BadRequestError(`Language "${language}" is not supported`);
  }

  const session = await sessionService.updateSession(session_id, {
    language,
    source_code,
    status,
  });

  return new OkResponse(session, 'Session updated successfully').send(res);
});
