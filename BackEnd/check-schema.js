const { Pool } = require('pg');

const pool = new Pool({
  host: '52.143.159.51',
  port: 5432,
  database: 'assurclair',
  user: 'remijolivalt',
  password: 'Remi1982'
});

async function checkSchema() {
  try {
    // Vérifier la structure de la table users
    const usersSchema = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      ORDER BY ordinal_position
    `);
    
    console.log('\n=== Structure table USERS ===');
    usersSchema.rows.forEach(col => {
      console.log(`  ${col.column_name}: ${col.data_type}`);
    });
    
    // Vérifier la structure de la table policies
    const policiesSchema = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'policies' 
      ORDER BY ordinal_position
    `);
    
    console.log('\n=== Structure table POLICIES ===');
    policiesSchema.rows.forEach(col => {
      console.log(`  ${col.column_name}: ${col.data_type}`);
    });
    
    // Vérifier la structure de la table central_cg
    const centralCgSchema = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'central_cg' 
      ORDER BY ordinal_position
    `);
    
    console.log('\n=== Structure table CENTRAL_CG ===');
    centralCgSchema.rows.forEach(col => {
      console.log(`  ${col.column_name}: ${col.data_type}`);
    });
    
  } catch (err) {
    console.error('Erreur:', err);
  } finally {
    await pool.end();
  }
}

checkSchema();
