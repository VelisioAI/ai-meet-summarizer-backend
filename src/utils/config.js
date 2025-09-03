// utils/config.js
const pg = require('pg');
require('dotenv').config();

const { Pool } = pg;

// Tip: if you use Supabase pooled (pgBouncer) connection strings,
// you can set DATABASE_URL and just pass connectionString below.
const pool = new Pool({
  host: process.env.SUPABASE_DB_HOST,
  port: Number(process.env.SUPABASE_DB_PORT || 5432),
  database: process.env.SUPABASE_DB_NAME,
  user: process.env.SUPABASE_DB_USER,
  password: process.env.SUPABASE_DB_PASSWORD,
  ssl: process.env.PGSSLMODE === 'require'
    ? { rejectUnauthorized: false }
    : { rejectUnauthorized: false }, // tighten in prod with a CA bundle if available
  max: Number(process.env.PG_POOL_MAX || 20),
  idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
  connectionTimeoutMillis: Number(process.env.PG_CONN_TIMEOUT_MS || 10000),
  keepAlive: true
});

pool.on('error', (err) => {
  console.error('[pg] Unexpected error on idle client', err);
});

/**
 * Optional eager connection test during boot.
 * NOTE: Do NOT exit the process here. Let the pool connect lazily if this fails.
 */
const connectDB = async () => {
  try {
    const client = await pool.connect();
    console.log('Connected to PostgreSQL database');
    client.release();
  } catch (error) {
    console.error('Error connecting to PostgreSQL database (startup test):', error);
    // You can optionally retry once:
    // try {
    //   const client = await pool.connect();
    //   console.log('Connected to PostgreSQL database (retry)');
    //   client.release();
    // } catch (e2) {
    //   console.error('Retry failed:', e2);
    // }
  }
};

const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Error executing query', { text, error });
    throw error;
  }
};

const getClient = async () => {
  const client = await pool.connect();
  const originalQuery = client.query.bind(client);
  const originalRelease = client.release.bind(client);

  const timeout = setTimeout(() => {
    console.error('A client has been checked out for more than 5 seconds!');
    console.error(`The last executed query on this client was: ${client.lastQuery}`);
  }, 5000);

  client.query = (...args) => {
    client.lastQuery = args[0];
    return originalQuery(...args);
  };

  client.release = () => {
    clearTimeout(timeout);
    client.query = originalQuery;
    client.release = originalRelease;
    return originalRelease();
  };

  return client;
};

const PORT = process.env.PORT || 3001;

module.exports = {
  connectDB,
  query,
  getClient,
  PORT
};
