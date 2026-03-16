import { query } from '../db/index.js';
import { NotFoundError } from '../core/ApiError.js';

/**
 * Create a new code session
 * @param {string} language - Programming language
 * @param {string} sourceCode - Initial source code
 * @returns {Promise<Object>} The created session
 */
const createSession = async (language, sourceCode = '') => {
  const result = await query(
    'INSERT INTO code_sessions (language, source_code) VALUES ($1, $2) RETURNING *',
    [language, sourceCode]
  );
  return result.rows[0];
};

/**
 * Get a session by ID
 * @param {string} id - Session UUID
 * @returns {Promise<Object>} The session or throws NotFoundError
 */
const getSession = async (id) => {
  const result = await query('SELECT * FROM code_sessions WHERE id = $1', [id]);

  if (result.rowCount === 0) {
    throw new NotFoundError('Code session not found');
  }

  return result.rows[0];
};

/**
 * Update session source code
 * @param {string} id - Session UUID
 * @param {Object} updates - { language, source_code, status }
 * @returns {Promise<Object>} The updated session
 */
const updateSession = async (id, { language, source_code, status }) => {
  // Build dynamic UPDATE query
  const fields = [];
  const values = [];
  let index = 1;

  if (language) {
    fields.push(`language = $${index++}`);
    values.push(language);
  }
  if (source_code !== undefined) {
    fields.push(`source_code = $${index++}`);
    values.push(source_code);
  }
  if (status) {
    fields.push(`status = $${index++}`);
    values.push(status);
  }

  if (fields.length === 0) return await getSession(id);

  fields.push(`updated_at = NOW()`);
  values.push(id);

  const sql = `UPDATE code_sessions SET ${fields.join(', ')} WHERE id = $${index} RETURNING *`;
  const result = await query(sql, values);

  if (result.rowCount === 0) {
    throw new NotFoundError('Code session not found');
  }

  return result.rows[0];
};

export default {
  createSession,
  getSession,
  updateSession,
};
