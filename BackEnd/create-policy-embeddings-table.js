const { Client } = require('pg');

const client = new Client({
  host: '52.143.159.51',
  port: 5432,
  database: 'assurclair',
  user: 'remijolivalt',
  password: 'Remi1982'
});

async function createPolicyEmbeddingsTable() {
  try {
    await client.connect();
    console.log('📊 Création de la table policy_embeddings...\n');

    // Créer la table
    await client.query(`
      CREATE TABLE IF NOT EXISTS policy_embeddings (
        id SERIAL PRIMARY KEY,
        policy_id INTEGER NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
        chunk_text TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        embedding VECTOR(768),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Table policy_embeddings créée');

    // Créer l'index pour les recherches vectorielles
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_policy_embeddings_vector 
      ON policy_embeddings 
      USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100);
    `);
    console.log('✅ Index vectoriel créé (ivfflat)');

    // Créer un index sur policy_id pour les jointures
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_policy_embeddings_policy_id 
      ON policy_embeddings (policy_id);
    `);
    console.log('✅ Index policy_id créé');

    // Vérifier
    const result = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'policy_embeddings'
      ORDER BY ordinal_position;
    `);
    
    console.log('\n📋 Structure de policy_embeddings:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });

    console.log('\n✅ Table prête pour la vectorisation RAG!');

  } catch (error) {
    console.error('❌ Erreur:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

createPolicyEmbeddingsTable();
