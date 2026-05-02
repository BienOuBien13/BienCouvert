// run-migration-024.js — Ajout insurance_sub_type_code à document_catalogue
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
    const sql = fs.readFileSync(path.join(__dirname, 'migrations', '024_document_catalogue_subtype.sql'), 'utf8');
    console.log('[024] Running migration: insurance_sub_type_code + new unique index...');
    await client.query(sql);
    console.log('[024] ✅ Migration completed successfully');
  } catch (err) {
    console.error('[024] ❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
