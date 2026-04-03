import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

/**
 * Shared PostgreSQL connection pool.
 * All services import this instance — no need to manage connections individually.
 */
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,               // max concurrent connections
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

/**
 * Convenience wrapper: run a parameterized query.
 * @param {string} text - SQL query with $1, $2, ... placeholders
 * @param {any[]}  params - parameter values
 */
export async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log(`[DB] query executed in ${duration}ms | rows: ${res.rowCount}`);
    return res;
  } catch (err) {
    console.error('[DB] Query error:', err.message, '| SQL:', text);
    throw err;
  }
}
