/**
 * create-embedding-indexes.js
 * Recrée les index ivfflat sur les colonnes embedding après chargement des données.
 * À exécuter après bulk-upload-with-pages.js.
 */
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env.production') });

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: process.env.POSTGRES_PORT,
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 60000,
  statement_timeout: 300000, // 5 minutes pour la création d'index
});

const indexes = [
  {
    name: 'idx_central_cg_embedding',
    sql: 'CREATE INDEX IF NOT EXISTS idx_central_cg_embedding ON central_cg USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)',
    count_sql: 'SELECT COUNT(*) FROM central_cg WHERE embedding IS NOT NULL'
  },
  {
    name: 'idx_cg_pages_embedding',
    sql: 'CREATE INDEX IF NOT EXISTS idx_cg_pages_embedding ON central_cg_pages USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)',
    count_sql: 'SELECT COUNT(*) FROM central_cg_pages WHERE embedding IS NOT NULL'
  },
  {
    name: 'idx_user_cg_embedding',
    sql: 'CREATE INDEX IF NOT EXISTS idx_user_cg_embedding ON user_cg USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50)',
    count_sql: 'SELECT COUNT(*) FROM user_cg WHERE embedding IS NOT NULL'
  },
  {
    name: 'idx_user_cg_pages_embedding',
    sql: 'CREATE INDEX IF NOT EXISTS idx_user_cg_pages_embedding ON user_cg_pages USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50)',
    count_sql: 'SELECT COUNT(*) FROM user_cg_pages WHERE embedding IS NOT NULL'
  }
];

async function run() {
  const client = await pool.connect();
  try {
    for (const idx of indexes) {
      const countRes = await client.query(idx.count_sql);
      const count = parseInt(countRes.rows[0].count);
      console.log(`\n📊 ${idx.name}: ${count} lignes avec embedding`);
      if (count === 0) {
        console.log(`  ⏭  Table vide, index ignoré`);
        continue;
      }
      console.log(`  🔨 Création de l'index...`);
      await client.query(idx.sql);
      console.log(`  ✅ Index créé`);
    }
    console.log('\n✅ Terminé');
  } catch (err) {
    console.error('❌ Erreur:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
