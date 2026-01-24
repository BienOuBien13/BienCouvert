const { Pool } = require('pg');

const pool = new Pool({
  host: '52.143.159.51',
  port: 5432,
  database: 'assurclair',
  user: 'remijolivalt',
  password: 'Remi1982',
  ssl: false
});

async function testRegister() {
  try {
    // Vérifier la structure de la table
    console.log('📋 Structure de la table users:');
    const cols = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      ORDER BY ordinal_position
    `);
    cols.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type} ${row.is_nullable === 'NO' ? '(NOT NULL)' : ''}`);
    });

    // Tester une insertion
    console.log('\n🧪 Test insertion utilisateur...');
    const testEmail = `test_${Date.now()}@example.com`;
    const result = await pool.query(`
      INSERT INTO users (email, first_name, last_name, password, profile, is_admin)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [testEmail, 'Test', 'User', 'hashed_password', null, false]);
    
    console.log('✅ Insertion réussie! ID:', result.rows[0].id);

    // Supprimer le test
    await pool.query('DELETE FROM users WHERE email = $1', [testEmail]);
    console.log('🗑️ Test supprimé');

  } catch (error) {
    console.error('❌ Erreur:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await pool.end();
  }
}

testRegister();
