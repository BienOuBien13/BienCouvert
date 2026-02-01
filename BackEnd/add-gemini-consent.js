const { Client } = require('pg');
const config = require('./test-config');

const client = new Client(config.dbConfig);

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
