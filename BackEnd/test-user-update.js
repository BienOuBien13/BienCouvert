/**
 * Test de mise à jour d'utilisateur
 */
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function testUserUpdate() {
  const client = new Client({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'assurclair',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD,
  });

  try {
    await client.connect();
    console.log('✅ Connecté à PostgreSQL\n');

    // 1. Récupérer un utilisateur
    console.log('📋 Récupération des utilisateurs...');
    const usersResult = await client.query('SELECT * FROM users ORDER BY id LIMIT 1');
    
    if (usersResult.rows.length === 0) {
      console.log('⚠️ Aucun utilisateur trouvé. Création d\'un utilisateur de test...');
      
      const hashedPassword = await bcrypt.hash('test123', 10);
      const insertResult = await client.query(
        `INSERT INTO users (email, name, password, profile, is_admin)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        ['test@example.com', 'Test User', hashedPassword, JSON.stringify({ adultsCount: 1 }), false]
      );
      
      var user = insertResult.rows[0];
      console.log('✅ Utilisateur créé:', user);
    } else {
      var user = usersResult.rows[0];
      console.log('✅ Utilisateur trouvé:', { id: user.id, name: user.name, email: user.email });
    }

    // 2. Tester la mise à jour
    console.log('\n📝 Test de mise à jour du nom...');
    const newName = `Updated Name ${Date.now()}`;
    
    const updateResult = await client.query(
      `UPDATE users 
       SET name = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [newName, user.id]
    );

    if (updateResult.rows.length === 0) {
      console.error('❌ UPDATE n\'a retourné aucune ligne !');
      return;
    }

    console.log('✅ UPDATE réussi, lignes retournées:', updateResult.rows.length);
    console.log('📄 Données retournées:', updateResult.rows[0]);

    // 3. Vérifier avec un SELECT
    console.log('\n🔍 Vérification avec SELECT...');
    const checkResult = await client.query('SELECT * FROM users WHERE id = $1', [user.id]);
    
    if (checkResult.rows.length === 0) {
      console.error('❌ Utilisateur introuvable après UPDATE !');
      return;
    }

    const updatedUser = checkResult.rows[0];
    console.log('✅ Données vérifiées:', { id: updatedUser.id, name: updatedUser.name, email: updatedUser.email });

    if (updatedUser.name === newName) {
      console.log('\n✅✅✅ SUCCÈS ! Le nom a bien été mis à jour.');
    } else {
      console.error('\n❌ ÉCHEC ! Le nom n\'a pas été mis à jour.');
      console.error('  Attendu:', newName);
      console.error('  Reçu:', updatedUser.name);
    }

    // 4. Test avec le profil
    console.log('\n📝 Test de mise à jour du profil...');
    const newProfile = { adultsCount: 2, childrenCount: 1, testField: 'test value' };
    
    const profileUpdateResult = await client.query(
      `UPDATE users 
       SET profile = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, name, email, profile`,
      [JSON.stringify(newProfile), user.id]
    );

    console.log('✅ Profil mis à jour:', profileUpdateResult.rows[0]);

    // Vérification finale
    const finalCheck = await client.query('SELECT * FROM users WHERE id = $1', [user.id]);
    const finalUser = finalCheck.rows[0];
    
    console.log('\n📊 État final de l\'utilisateur:');
    console.log('  ID:', finalUser.id);
    console.log('  Name:', finalUser.name);
    console.log('  Email:', finalUser.email);
    console.log('  Profile:', finalUser.profile);
    console.log('  Updated at:', finalUser.updated_at);

  } catch (error) {
    console.error('\n❌ Erreur:', error);
    throw error;
  } finally {
    await client.end();
  }
}

testUserUpdate().catch(console.error);
