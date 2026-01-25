const { Client } = require('pg');

const client = new Client({
  host: '52.143.159.51',
  port: 5432,
  user: 'remijolivalt',
  password: 'Remi1982',
  database: 'assurclair'
});

async function addGeminiConsentColumn() {
  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL');
    
    // Ajout de la colonne gemini_ai_consent
    await client.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS gemini_ai_consent BOOLEAN DEFAULT false
    `);
    
    console.log('✅ Column gemini_ai_consent added successfully');
    
    // Vérification
    const result = await client.query(`
      SELECT column_name, data_type, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'gemini_ai_consent'
    `);
    
    console.log('✅ Column info:', result.rows[0]);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

addGeminiConsentColumn();
