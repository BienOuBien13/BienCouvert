// Script pour appliquer la migration 011 - Table user_analysis_profiles
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // Zscaler

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000
});

async function runMigration() {
  try {
    console.log('🚀 Application de la migration 011 - user_analysis_profiles\n');

    const migrationPath = path.join(__dirname, 'migrations', '011_user_analysis_profiles.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('📝 Exécution du SQL...');
    await pool.query(sql);

    console.log('\n✅ Migration 011 appliquée avec succès !');
    console.log('\nTable créée : user_analysis_profiles');
    console.log('  - Liée à users(id) par clé étrangère (ON DELETE CASCADE)');
    console.log('  - UPSERT via /api/auth/me/analysis-profile (PUT)');
    console.log('  - Lecture via /api/auth/me/analysis-profile (GET)');
  } catch (error) {
    console.error('❌ Erreur migration:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
