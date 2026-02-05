const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env.production') });

const pool = new Pool({
  host: process.env.POSTGRES_HOST || '52.143.159.51',
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB || 'assurclair',
  user: process.env.POSTGRES_USER || 'remijolivalt',
  password: process.env.POSTGRES_PASSWORD,
  connectionTimeoutMillis: 30000,
  idleTimeoutMillis: 30000,
  statement_timeout: 60000
});

async function migrate() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Migration centrale_cg - Version Direct SQL\n');
    
    // Vérifier si déjà migrée
    const check = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'central_cg' AND column_name = 'insurance_type_code'
    `);
    
    if (check.rows.length > 0) {
      console.log('✅ Migration déjà effectuée.');
      return;
    }
    
    const count = await client.query('SELECT COUNT(*) FROM central_cg');
    console.log(`📊 ${count.rows[0].count} enregistrement(s) à migrer\n`);
    
    console.log('Exécution de la migration...\n');
    
    // Transaction unique avec toutes les commandes
    await client.query(`
      BEGIN;
      
      -- 1. Créer nouvelle table
      CREATE TABLE central_cg_new (
        id SERIAL PRIMARY KEY,
        insurer_code VARCHAR(50) NOT NULL,
        insurance_type_code VARCHAR(50) NOT NULL,
        version VARCHAR(50),
        type VARCHAR(100),
        owner VARCHAR(255),
        detail TEXT,
        url TEXT,
        target_filename VARCHAR(255),
        status VARCHAR(50) DEFAULT 'active',
        content_text TEXT,
        embedding vector(768),
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      -- 2. Copier données
      INSERT INTO central_cg_new (
        id, insurer_code, insurance_type_code, version, type, owner, 
        detail, url, target_filename, status, content_text, embedding, 
        metadata, created_at, updated_at
      )
      SELECT 
        id,
        COALESCE(insurer_code, insurer),
        COALESCE(type_code, 'AUTRE'),
        version,
        NULL,
        NULL,
        NULL,
        document_url,
        NULL,
        'active',
        content_text,
        embedding,
        jsonb_build_object(
          'document_hash', document_hash,
          'productName', product_name
        ) || COALESCE(metadata, '{}'::jsonb),
        created_at,
        updated_at
      FROM central_cg;
      
      -- 3. Supprimer ancienne
      DROP TABLE central_cg CASCADE;
      
      -- 4. Renommer
      ALTER TABLE central_cg_new RENAME TO central_cg;
      
      -- 5. Renommer la séquence
      ALTER SEQUENCE central_cg_new_id_seq RENAME TO central_cg_id_seq;
      
      -- 6. Index basiques
      CREATE INDEX idx_central_cg_insurer_type ON central_cg(insurer_code, insurance_type_code);
      CREATE INDEX idx_central_cg_status ON central_cg(status);
      
      -- 7. Réinitialiser séquence
      SELECT setval('central_cg_id_seq', (SELECT COALESCE(MAX(id), 1) FROM central_cg));
      
      COMMIT;
    `);
    
    console.log('✅ Migration réussie!\n');
    
    // Vérifier résultat
    const newStructure = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'central_cg'
      ORDER BY ordinal_position
    `);
    
    console.log('📋 Nouvelle structure:');
    console.table(newStructure.rows);
    
    const newCount = await client.query('SELECT COUNT(*) FROM central_cg');
    console.log(`\n✅ ${newCount.rows[0].count} enregistrement(s) migrés\n`);
    
    // Essayer d'ajouter l'index vectoriel séparément
    console.log('Tentative d\'ajout de l\'index vectoriel...');
    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_central_cg_embedding ON central_cg 
        USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)
      `);
      console.log('✅ Index vectoriel créé\n');
    } catch (err) {
      console.log('⚠️  Index vectoriel non créé (pgvector peut-être absent):', err.message);
      console.log('   → Ce n\'est pas bloquant, les recherches sémantiques fonctionneront quand même.\n');
    }
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    console.error(error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate()
  .then(() => {
    console.log('✨ Migration terminée avec succès!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Échec de la migration');
    process.exit(1);
  });
