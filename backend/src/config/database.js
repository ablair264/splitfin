import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('Missing DATABASE_URL environment variable');
}

if (!process.env.COMPANY_ID) {
  throw new Error('Missing COMPANY_ID environment variable');
}

export const COMPANY_ID = process.env.COMPANY_ID;

// Neon PostgreSQL connection pool
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Log pool errors
pool.on('error', (err) => {
  console.error('[Database] Unexpected pool error:', err.message);
});

/**
 * Execute a parameterized query.
 * @param {string} text - SQL query with $1, $2, etc. placeholders
 * @param {any[]} params - Parameter values
 * @returns {Promise<pg.QueryResult>}
 */
export async function query(text, params = []) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;

  if (duration > 1000) {
    console.warn(`[Database] Slow query (${duration}ms):`, text.substring(0, 100));
  }

  return result;
}

/**
 * Get a single row by ID from a table.
 * @param {string} table - Table name
 * @param {string|number} id - Row ID
 * @returns {Promise<object|null>}
 */
export async function getById(table, id) {
  const { rows } = await query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
  return rows[0] || null;
}

/**
 * Insert a row and return the inserted record.
 * @param {string} table - Table name
 * @param {object} data - Column-value pairs
 * @returns {Promise<object>}
 */
export async function insert(table, data) {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  const columns = keys.join(', ');

  const { rows } = await query(
    `INSERT INTO ${table} (${columns}) VALUES (${placeholders}) RETURNING *`,
    values
  );
  return rows[0];
}

/**
 * Update a row by ID and return the updated record.
 * @param {string} table - Table name
 * @param {string|number} id - Row ID
 * @param {object} data - Column-value pairs to update
 * @returns {Promise<object|null>}
 */
export async function update(table, id, data) {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');

  const { rows } = await query(
    `UPDATE ${table} SET ${setClause}, updated_at = NOW() WHERE id = $${keys.length + 1} RETURNING *`,
    [...values, id]
  );
  return rows[0] || null;
}

/**
 * Delete a row by ID.
 * @param {string} table - Table name
 * @param {string|number} id - Row ID
 * @returns {Promise<boolean>}
 */
export async function remove(table, id) {
  const { rowCount } = await query(`DELETE FROM ${table} WHERE id = $1`, [id]);
  return rowCount > 0;
}

/**
 * Execute a query within a transaction.
 * @param {function} callback - Receives a client, should return a promise
 * @returns {Promise<any>}
 */
export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Health check - verify database connectivity.
 * @returns {Promise<boolean>}
 */
export async function healthCheck() {
  try {
    const { rows } = await query('SELECT 1 AS ok');
    return rows[0]?.ok === 1;
  } catch {
    return false;
  }
}
