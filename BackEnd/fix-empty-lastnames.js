const { Pool } = require('pg');

const pool = new Pool({
  host: '52.143.159.51',
  port: 5432,
  database: 'assurclair',
  user: 'remijolivalt',
  password: 'Remi1982',
  ssl: false
});

async function fixEmptyLastNames() {
  try {
    const result = await pool.query(`
      UPDATE users 
      SET last_name = 'User' 
      WHERE last_name IS NULL OR TRIM(last_name) = ''
      RETURNING email
    `);
    
    console.log(`✅ ${result.rowCount} utilisateur(s) corrigé(s)`);
    result.rows.forEach(row => console.log(`   - ${row.email}`));
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await pool.end();
  }
}

fixEmptyLastNames();
