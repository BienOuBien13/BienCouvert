const { Pool } = require('pg');

const pool = new Pool({
  host: '52.143.159.51',
  port: 5432,
  database: 'assurclair',
  user: 'remijolivalt',
  password: 'Remi1982',
  ssl: false
});

async function checkTables() {
  try {
    console.log('📊 Vérification des tables...\n');
    
    // Check policy_embeddings
    const res1 = await pool.query(`
      SELECT column_name, data_type, character_maximum_length 
      FROM information_schema.columns 
      WHERE table_name = 'policy_embeddings'
      ORDER BY ordinal_position
    `);
    
    console.log('✅ Table policy_embeddings:');
    console.log(res1.rows);
    
    // Check central_cg structure
    const res2 = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'central_cg'
      ORDER BY ordinal_position
    `);
    
    console.log('\n✅ Table central_cg:');
    console.log(res2.rows);
    
    // Check if central_cg has embeddings column
    const res3 = await pool.query(`
      SELECT id, insurer, metadata->>'type' as type, 
             CASE WHEN embedding IS NOT NULL THEN 'OUI' ELSE 'NON' END as has_embedding
      FROM central_cg
    `);
    
    console.log('\n📋 État des embeddings dans central_cg:');
    console.log(res3.rows);
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await pool.end();
  }
}

checkTables();
