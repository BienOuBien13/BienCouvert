const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env.production') });

const pool = new Pool({
  host: process.env.POSTGRES_HOST || '52.143.159.51',
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB || 'assurclair',
  user: process.env.POSTGRES_USER || 'remijolivalt',
  password: process.env.POSTGRES_PASSWORD
});

async function migrate() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Début de la migration centrale_cg...\n');
    
    // Vérifier si déjà migrée
    const check = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'central_cg' AND column_name = 'insurance_type_code'
    `);
    
    if (check.rows.length > 0) {
      console.log('✅ La migration a déjà été effectuée.');
      return;
    }
    
    console.log('📊 Structure actuelle:');
    const current = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'central_cg'
      ORDER BY ordinal_position
    `);
    console.table(current.rows);
    
    const count = await client.query('SELECT COUNT(*) FROM central_cg');
    console.log(`\n📈 ${count.rows[0].count} enregistrement(s) à migrer\n`);
    
    await client.query('BEGIN');
    
    try {
      console.log('1️⃣  Création table temporaire...');
      await client.query(`
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
        )
      `);
      
      console.log('2️⃣  Migration des données...');
      await client.query(`
        INSERT INTO central_cg_new (
          id, insurer_code, insurance_type_code, version, type, owner, 
          detail, url, target_filename, status, content_text, embedding, 
          metadata, created_at, updated_at
        )
        SELECT 
          id,
          COALESCE(insurer_code, insurer) as insurer_code,
          COALESCE(type_code, 'AUTRE') as insurance_type_code,
          version,
          NULL as type,
          NULL as owner,
          NULL as detail,
          document_url as url,
          NULL as target_filename,
          'active' as status,
          content_text,
          embedding,
          jsonb_build_object(
            'document_hash', document_hash,
            'productName', product_name
          ) || COALESCE(metadata, '{}'::jsonb) as metadata,
          created_at,
          updated_at
        FROM central_cg
      `);
      
      console.log('3️⃣  Suppression ancienne table...');
      await client.query('DROP TABLE IF EXISTS central_cg CASCADE');
      
      console.log('4️⃣  Renommage nouvelle table...');
      await client.query('ALTER TABLE central_cg_new RENAME TO central_cg');
      
      console.log('5️⃣  Création des index...');
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_central_cg_embedding ON central_cg 
          USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_central_cg_insurer_type 
        ON central_cg(insurer_code, insurance_type_code)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_central_cg_status ON central_cg(status)
      `);
      
      console.log('6️⃣  Ajout des contraintes FK (si tables existent)...');
      
      // Vérifier si insurers existe
      const insurersCheck = await client.query(`
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'insurers'
      `);
      
      if (insurersCheck.rows.length > 0) {
        await client.query(`
          ALTER TABLE central_cg 
          ADD CONSTRAINT fk_central_cg_insurer_code 
          FOREIGN KEY (insurer_code) REFERENCES insurers(code)
        `);
        console.log('   ✓ FK vers insurers ajoutée');
      }
      
      // Vérifier si insurance_types existe
      const typesCheck = await client.query(`
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'insurance_types'
      `);
      
      if (typesCheck.rows.length > 0) {
        await client.query(`
          ALTER TABLE central_cg 
          ADD CONSTRAINT fk_central_cg_insurance_type 
          FOREIGN KEY (insurance_type_code) REFERENCES insurance_types(code)
        `);
        console.log('   ✓ FK vers insurance_types ajoutée');
      }
      
      console.log('7️⃣  Réinitialisation séquence...');
      await client.query(`
        SELECT setval('central_cg_id_seq', (SELECT MAX(id) FROM central_cg))
      `);
      
      await client.query('COMMIT');
      
      console.log('\n✅ Migration terminée avec succès!\n');
      
      // Vérifier la nouvelle structure
      console.log('📊 Nouvelle structure:');
      const newStructure = await client.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'central_cg'
        ORDER BY ordinal_position
      `);
      console.table(newStructure.rows);
      
      const newCount = await client.query('SELECT COUNT(*) FROM central_cg');
      console.log(`\n📈 ${newCount.rows[0].count} enregistrement(s) après migration\n`);
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate()
  .then(() => {
    console.log('✨ Migration terminée!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Échec:', error.message);
    process.exit(1);
  });
