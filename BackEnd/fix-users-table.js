const { Pool } = require('pg');

const pool = new Pool({
  host: '52.143.159.51',
  port: 5432,
  database: 'assurclair',
  user: 'remijolivalt',
  password: 'Remi1982',
  ssl: false
});

async function fixUsersTable() {
  try {
    console.log('🔧 Modification de la table users...\n');

    // 1. Rendre la colonne 'name' nullable
    console.log('1️⃣ Rendre la colonne "name" nullable...');
    await pool.query('ALTER TABLE users ALTER COLUMN name DROP NOT NULL');
    console.log('✅ "name" est maintenant nullable');

    // 2. Pour les utilisateurs existants sans first_name/last_name, les remplir depuis name
    console.log('\n2️⃣ Migration des données existantes...');
    const result = await pool.query(`
      UPDATE users 
      SET first_name = COALESCE(first_name, SPLIT_PART(name, ' ', 1)),
          last_name = COALESCE(last_name, SPLIT_PART(name, ' ', 2))
      WHERE first_name IS NULL OR last_name IS NULL
      RETURNING id, email, first_name, last_name
    `);
    console.log(`✅ ${result.rowCount} utilisateur(s) migré(s)`);
    
    if (result.rows.length > 0) {
      result.rows.forEach(row => {
        console.log(`   - ${row.email}: ${row.first_name} ${row.last_name}`);
      });
    }

    // 3. Rendre first_name et last_name NOT NULL
    console.log('\n3️⃣ Rendre first_name et last_name obligatoires...');
    await pool.query('ALTER TABLE users ALTER COLUMN first_name SET NOT NULL');
    await pool.query('ALTER TABLE users ALTER COLUMN last_name SET NOT NULL');
    console.log('✅ first_name et last_name sont maintenant NOT NULL');

    console.log('\n✅ Migration terminée avec succès!');

  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await pool.end();
  }
}

fixUsersTable();
