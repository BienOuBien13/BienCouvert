const { Client } = require('pg');

const client = new Client({
  host: '52.143.159.51',
  port: 5432,
  database: 'assurclair',
  user: 'remijolivalt',
  password: 'Remi1982'
});

async function fixUsersNameColumn() {
  try {
    await client.connect();
    console.log('✅ Connecté à PostgreSQL');

    // Vérifier si la colonne name existe
    const checkColumn = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'name'
    `);

    if (checkColumn.rows.length === 0) {
      console.log('ℹ️  La colonne "name" n\'existe déjà plus dans users');
      return;
    }

    console.log('🔧 Suppression de la colonne "name" (redondante avec first_name/last_name)...');
    
    await client.query(`
      ALTER TABLE users DROP COLUMN IF EXISTS name;
    `);

    console.log('✅ Colonne "name" supprimée avec succès');
    
    // Vérifier la structure finale
    const finalSchema = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `);
    
    console.log('\n📋 Structure finale de users:');
    finalSchema.rows.forEach(col => console.log(`  - ${col.column_name}`));

  } catch (err) {
    console.error('❌ Erreur:', err.message);
  } finally {
    await client.end();
  }
}

fixUsersNameColumn();
