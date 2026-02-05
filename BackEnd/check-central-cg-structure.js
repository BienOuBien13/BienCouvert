const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env.production') });

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: process.env.POSTGRES_PORT,
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD
});

async function check() {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'central_cg'
      ORDER BY ordinal_position
    `);
    
    console.log('✅ Structure de la table central_cg:\n');
    console.table(result.rows);
    
    const count = await pool.query('SELECT COUNT(*) FROM central_cg');
    console.log(`\n📊 Nombre d'enregistrements: ${count.rows[0].count}\n`);
    
    const sample = await pool.query('SELECT * FROM central_cg LIMIT 1');
    if (sample.rows.length > 0) {
      console.log('📄 Exemple d\'enregistrement:');
      console.log(JSON.stringify(sample.rows[0], null, 2));
    }
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await pool.end();
  }
}

check();
