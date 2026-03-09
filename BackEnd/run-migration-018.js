// run-migration-018.js — Ajoute messages JSONB à claim_sessions
require('dotenv').config({ path: '.env.production' });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function run() {
  const client = await pool.connect();
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'migrations', '018_claim_sessions_messages.sql'), 'utf8');
    console.log('[018] Running migration: add messages column to claim_sessions...');
    await client.query(sql);
    console.log('[018] ✅ Migration completed successfully');
  } catch (err) {
    console.error('[018] ❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
