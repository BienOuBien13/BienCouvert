// Script pour créer le schéma complet de la base de données assurclair
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Configuration de connexion
const config = {
  host: '52.143.159.51',
  port: 5432,
  database: 'assurclair',
  user: 'remijolivalt',
  password: 'Remi1982',
  ssl: false,
  connectionTimeoutMillis: 5000,
};

async function createSchema() {
  const client = new Client(config);
  
  try {
    console.log('🔌 Connexion à PostgreSQL...');
    await client.connect();
    console.log('✅ Connecté!\n');
    
    // Lire le fichier schema.sql
    const schemaPath = path.join(__dirname, 'schema.sql');
    console.log('📖 Lecture du fichier schema.sql...');
    const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
    
    // Exécuter le script SQL
    console.log('🚀 Création du schéma...\n');
    await client.query(schemaSql);
    
    console.log('✅ Schéma créé avec succès!\n');
    
    // Vérifier les tables créées
    console.log('📊 Tables créées:');
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    result.rows.forEach(row => {
      console.log(`   ✓ ${row.table_name}`);
    });
    
    console.log('\n🎉 Base de données assurclair prête à l\'emploi!');
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    if (error.position) {
      console.error('   Position:', error.position);
    }
  } finally {
    await client.end();
    console.log('\n🔌 Connexion fermée.');
  }
}

createSchema();
