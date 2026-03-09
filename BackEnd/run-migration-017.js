const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env.production') });

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: process.env.POSTGRES_PORT,
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000,
});

async function run() {
  const client = await pool.connect();
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'migrations', '017_claim_sessions.sql'), 'utf8');
    const statements = sql
      .split(';')
      .map(s => s.replace(/--.*$/gm, '').trim())
      .filter(s => s.length > 0);
    console.log(`🔄 Exécution de ${statements.length} statements...`);
    for (const stmt of statements) {
      console.log(`  ▶ ${stmt.slice(0, 80).replace(/\s+/g, ' ')}...`);
      await client.query(stmt);
      console.log(`  ✅ OK`);
    }
    console.log('\n✅ Migration 017 terminée — table claim_sessions créée');
  } catch (err) {
    console.error('❌ Erreur migration:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
