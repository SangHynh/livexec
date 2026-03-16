import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../config/index.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: config.DATABASE_URL,
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Execute all SQL migrations in the migrations directory
 */
const runMigrations = async () => {
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  console.log('Running database migrations...');

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');
    
    try {
      await pool.query(sql);
      console.log(`Migration ${file} executed successfully`);
    } catch (error) {
      console.error(`Error executing migration ${file}:`, error.message);
      throw error;
    }
  }
  
  console.log('All migrations completed');
};

export { pool, runMigrations };
export const query = (text, params) => pool.query(text, params);
