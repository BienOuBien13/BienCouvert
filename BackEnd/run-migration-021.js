// run-migration-021.js — Ajoute colonne source_cg_filename + jeu de test Matmut HAB01
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
    const sql = fs.readFileSync(path.join(__dirname, 'migrations', '021_coverage_control_matmut.sql'), 'utf8');
    console.log('[021] Running migration: add source_cg_filename + seed Matmut HAB01 control data...');
    await client.query(sql);
    console.log('[021] ✅ Migration completed successfully');
  } catch (err) {
    console.error('[021] ❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
