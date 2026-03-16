import { query } from '../db/index.js';
import { NotFoundError } from '../core/ApiError.js';

/**
 * Create a new execution record
 * @param {string} sessionId - Session UUID
 * @returns {Promise<Object>} Created execution
 */
const createExecution = async (sessionId) => {
  const result = await query(
    'INSERT INTO executions (session_id) VALUES ($1) RETURNING *',
    [sessionId]
  );
  return result.rows[0];
};

/**
 * Get execution by ID
 * @param {string} id - Execution UUID
 * @returns {Promise<Object>} Execution record
 */
const getExecution = async (id) => {
  const result = await query('SELECT * FROM executions WHERE id = $1', [id]);
  
  if (result.rowCount === 0) {
    throw new NotFoundError('Execution not found');
  }
  
  return result.rows[0];
};

/**
 * Update execution status and results
 * @param {string} id - Execution UUID
 * @param {Object} updates - { status, stdout, stderr, execution_time_ms, error_message, started_at, completed_at }
 * @returns {Promise<Object>} Updated execution
 */
const updateExecution = async (id, { 
  status, 
  stdout, 
  stderr, 
  execution_time_ms, 
  error_message,
  started_at,
  completed_at
}) => {
  const fields = [];
  const values = [];
  let index = 1;

  const params = { status, stdout, stderr, execution_time_ms, error_message, started_at, completed_at };

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      if ((key === 'started_at' || key === 'completed_at') && value === true) {
        fields.push(`${key} = NOW()`);
      } else {
        fields.push(`${key} = $${index++}`);
        values.push(value);
      }
    }
  }

  if (fields.length === 0) return await getExecution(id);

  values.push(id);
  const sql = `UPDATE executions SET ${fields.join(', ')} WHERE id = $${index} RETURNING *`;
  const result = await query(sql, values);

  if (result.rowCount === 0) {
    throw new NotFoundError('Execution not found');
  }

  return result.rows[0];
};

/**
 * Find any active execution (QUEUED or RUNNING) for a session
 * @param {string} sessionId 
 * @returns {Promise<Object|null>}
 */
const getActiveExecutionBySession = async (sessionId) => {
  const result = await query(
    'SELECT * FROM executions WHERE session_id = $1 AND status IN ($2, $3) LIMIT 1',
    [sessionId, 'QUEUED', 'RUNNING']
  );
  return result.rows.length > 0 ? result.rows[0] : null;
};

export default {
  createExecution,
  getActiveExecutionBySession,
  getExecution,
  updateExecution,
};
