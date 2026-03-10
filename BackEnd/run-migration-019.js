// run-migration-019.js — Élargit guarantee_label / formula_label / keys en TEXT
// Corrige l'erreur: "value too long for type character varying(150)"
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
    const sql = fs.readFileSync(path.join(__dirname, 'migrations', '019_widen_guarantee_labels.sql'), 'utf8');
    console.log('[019] Running migration: widen guarantee_label / formula_label columns to TEXT...');
    await client.query(sql);
    console.log('[019] ✅ Migration completed successfully');
  } catch (err) {
    console.error('[019] ❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
