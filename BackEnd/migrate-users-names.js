/**
 * Script de migration : name → firstName + lastName
 * Transforme la colonne "name" en deux colonnes "first_name" et "last_name"
 */

const { Pool } = require('pg');

const pool = new Pool({
  host: '52.143.159.51',
  port: 5432,
  database: 'assurclair',
  user: 'remijolivalt',
  password: 'Remi1982'
});

async function migrateUsers() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Début de la migration users...');
    
    // 1. Ajouter les colonnes first_name et last_name
    console.log('📝 Ajout des colonnes first_name et last_name...');
    await client.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS first_name TEXT,
      ADD COLUMN IF NOT EXISTS last_name TEXT
    `);
    
    // 2. Récupérer tous les utilisateurs
    console.log('📊 Lecture des utilisateurs existants...');
    const result = await client.query('SELECT id, name FROM users WHERE name IS NOT NULL');
    console.log(`✅ ${result.rows.length} utilisateurs trouvés`);
    
    // 3. Migrer les données
    for (const user of result.rows) {
      const nameParts = user.name.split(' ');
      const firstName = nameParts[0] || 'Utilisateur';
      const lastName = nameParts.slice(1).join(' ') || '';
      
      await client.query(
        'UPDATE users SET first_name = $1, last_name = $2 WHERE id = $3',
        [firstName, lastName, user.id]
      );
      
      console.log(`✅ Migré: "${user.name}" → firstName: "${firstName}", lastName: "${lastName}"`);
    }
    
    // 4. Vérifier que tous les utilisateurs ont été migrés
    const checkResult = await client.query('SELECT COUNT(*) FROM users WHERE first_name IS NULL OR first_name = \'\'');
    if (parseInt(checkResult.rows[0].count) > 0) {
      console.warn(`⚠️  ${checkResult.rows[0].count} utilisateurs n'ont pas été migrés !`);
    } else {
      console.log('✅ Tous les utilisateurs ont été migrés avec succès');
    }
    
    // 5. Optionnel: Supprimer l'ancienne colonne name après vérification
    console.log('⚠️  L\'ancienne colonne "name" est conservée pour rollback si nécessaire');
    console.log('💡 Pour la supprimer définitivement, exécutez: ALTER TABLE users DROP COLUMN name;');
    
    console.log('🎉 Migration terminée avec succès !');
    
  } catch (err) {
    console.error('❌ Erreur lors de la migration:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrateUsers();
