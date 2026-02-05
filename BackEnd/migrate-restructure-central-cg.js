const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env.production') });

// Configuration de la base de données
const pool = new Pool({
  host: process.env.POSTGRES_HOST || process.env.DB_HOST || '52.143.159.51',
  port: process.env.POSTGRES_PORT || process.env.DB_PORT || 5432,
  database: process.env.POSTGRES_DB || process.env.DB_NAME || 'assurclair',
  user: process.env.POSTGRES_USER || process.env.DB_USER || 'assurclair_user',
  password: process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Début de la migration de restructuration de central_cg...\n');
    
    // Vérifier la structure actuelle
    console.log('📊 Structure actuelle de la table central_cg:');
    const currentStructure = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'central_cg'
      ORDER BY ordinal_position
    `);
    
    console.table(currentStructure.rows);
    
    // Compter les enregistrements
    const countResult = await client.query('SELECT COUNT(*) FROM central_cg');
    console.log(`\n📈 Nombre d'enregistrements à migrer: ${countResult.rows[0].count}\n`);
    
    // Vérifier si la migration a déjà été effectuée
    const checkColumn = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'central_cg' AND column_name = 'insurance_type_code'
    `);
    
    if (checkColumn.rows.length > 0) {
      console.log('✅ La migration a déjà été effectuée (colonne insurance_type_code existe)');
      console.log('   Rien à faire.\n');
      return;
    }
    
    console.log('⚙️  Exécution de la migration par étapes...\n');
    
    // Lire et exécuter le script de migration par commandes
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'migrations', '007_restructure_central_cg.sql'),
      'utf8'
    );
    
    // Exécuter la migration en une seule transaction
    await client.query('BEGIN');
    
    try {
      // Diviser et exécuter les commandes SQL
      const commands = migrationSQL.split(';').filter(cmd => cmd.trim().length > 0);
      
      for (let i = 0; i < commands.length; i++) {
        const cmd = commands[i].trim();
        if (cmd && !cmd.startsWith('--') && cmd !== 'BEGIN' && cmd !== 'COMMIT') {
          console.log(`   Étape ${i + 1}/${commands.length}...`);
          await client.query(cmd);
        }
      }
      
      await client.query('COMMIT');
      console.log('\n✅ Migration terminée avec succès!\n');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    
    console.log('✅ Migration terminée avec succès!\n');
    
    // Vérifier la nouvelle structure
    console.log('📊 Nouvelle structure de la table central_cg:');
    const newStructure = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'central_cg'
      ORDER BY ordinal_position
    `);
    
    console.table(newStructure.rows);
    
    // Vérifier le nombre d'enregistrements après migration
    const newCountResult = await client.query('SELECT COUNT(*) FROM central_cg');
    console.log(`\n📈 Nombre d'enregistrements après migration: ${newCountResult.rows[0].count}`);
    
    // Afficher quelques exemples
    console.log('\n📋 Aperçu des données migrées:');
    const sampleData = await client.query('SELECT * FROM central_cg LIMIT 3');
    console.table(sampleData.rows);
    
  } catch (error) {
    console.error('❌ Erreur lors de la migration:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Exécuter la migration
runMigration()
  .then(() => {
    console.log('\n✨ Restructuration de central_cg terminée avec succès!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Échec de la migration:', error.message);
    process.exit(1);
  });
