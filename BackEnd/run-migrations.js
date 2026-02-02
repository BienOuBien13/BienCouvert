/**
 * Script d'exécution des migrations SQL
 * Usage: node run-migrations.js
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { query } = require('./dist/db');

async function runMigrations() {
  console.log('🚀 Démarrage des migrations...\n');

  const migrationsDir = path.join(__dirname, 'migrations');
  
  // Créer la table de suivi des migrations si elle n'existe pas
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      migration_name VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Lire tous les fichiers de migration
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log(`📋 ${files.length} migration(s) trouvée(s)\n`);

  for (const file of files) {
    const migrationName = file.replace('.sql', '');
    
    // Vérifier si déjà exécutée
    const result = await query(
      'SELECT id FROM schema_migrations WHERE migration_name = $1',
      [migrationName]
    );

    if (result.rows.length > 0) {
      console.log(`⏭️  ${migrationName} - Déjà exécutée`);
      continue;
    }

    console.log(`🔄 Exécution: ${migrationName}...`);

    try {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      
      // Exécuter la migration
      await query(sql);
      
      // Enregistrer l'exécution
      await query(
        'INSERT INTO schema_migrations (migration_name) VALUES ($1)',
        [migrationName]
      );
      
      console.log(`✅ ${migrationName} - OK\n`);
    } catch (error) {
      console.error(`❌ ${migrationName} - ERREUR:`);
      console.error(error.message);
      console.error('\n⚠️  Migration interrompue\n');
      process.exit(1);
    }
  }

  console.log('✅ Toutes les migrations ont été exécutées avec succès!\n');
  process.exit(0);
}

runMigrations().catch(error => {
  console.error('❌ Erreur lors des migrations:', error);
  process.exit(1);
});
