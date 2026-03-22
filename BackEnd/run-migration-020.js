// run-migration-020.js — Crée la table coverage_facts_control et charge le jeu de données de référence
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
    const sql = fs.readFileSync(path.join(__dirname, 'migrations', '020_coverage_control.sql'), 'utf8');
    console.log('[020] Running migration: create coverage_facts_control + seed data...');
    await client.query(sql);
    console.log('[020] ✅ Migration completed successfully');
  } catch (err) {
    console.error('[020] ❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
