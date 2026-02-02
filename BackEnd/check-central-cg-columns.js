// check-central-cg-columns.js
// Vérifier les colonnes de la table central_cg

const { Client } = require('pg');

async function checkColumns() {
  const client = new Client({
    host: '52.143.159.51',
    port: 5432,
    database: 'assurclair',
    user: 'assurclair',
    password: 'MotDePasseSecurise2024!',
  });

  try {
    await client.connect();
    
    const result = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'central_cg'
      ORDER BY ordinal_position
    `);
    
    console.log('📋 Colonnes de central_cg:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name} (${row.data_type})`);
    });
    
    await client.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
}

checkColumns();
