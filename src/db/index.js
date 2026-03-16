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
 * Ensure the database exists by connecting to the default 'postgres' database
 */
const ensureDatabaseExists = async () => {
  if (!config.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined in environment variables');
  }
  const dbName = config.DATABASE_URL.split('/').pop().split('?')[0];
  const rootUrl = config.DATABASE_URL.replace(`/${dbName}`, '/postgres');
  
  const tempPool = new Pool({ connectionString: rootUrl });
  
  try {
    const result = await tempPool.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName]
    );

    if (result.rowCount === 0) {
      console.log(`Database "${dbName}" not found. Creating...`);
      // CREATE DATABASE cannot be run in a transaction, so we use the root connection
      await tempPool.query(`CREATE DATABASE ${dbName}`);
      console.log(`Database "${dbName}" created successfully.`);
    }
  } catch (error) {
    console.error('Error ensuring database exists:', error);
  } finally {
    await tempPool.end();
  }
};

/**
 * Execute all SQL migrations in the migrations directory
 */
const runMigrations = async () => {
  await ensureDatabaseExists();
  
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
      console.error(`Error executing migration ${file}:`, error);
      throw error;
    }
  }
  
  console.log('All migrations completed');
};

export { pool, runMigrations };
export const query = (text, params) => pool.query(text, params);
