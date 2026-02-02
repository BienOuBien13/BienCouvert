const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const client = new Client({
  host: '52.143.159.51',
  port: 5432,
  database: 'assurclair',
  user: 'remijolivalt',
  password: 'Remi1982',
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
  try {
    await client.connect();
    console.log('✅ Connexion établie\n');
    
    const migrationFile = path.join(__dirname, 'migrations', '005_convert_coverage_to_varchar.sql');
    const sql = fs.readFileSync(migrationFile, 'utf8');
    
    console.log('📝 Exécution de la migration 005...');
    await client.query(sql);
    console.log('✅ Migration 005 terminée\n');
    
    // Vérifier le type
    const check = await client.query(`
      SELECT column_name, data_type, character_maximum_length 
      FROM information_schema.columns 
      WHERE table_name = 'policies' AND column_name = 'coverage'
    `);
    
    console.log('Colonne coverage:');
    console.log(check.rows[0]);
    
    await client.end();
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    await client.end();
    process.exit(1);
  }
}

runMigration();
