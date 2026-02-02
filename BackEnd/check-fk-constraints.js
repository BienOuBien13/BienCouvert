const { Client } = require('pg');

const client = new Client({
  host: '52.143.159.51',
  port: 5432,
  database: 'assurclair',
  user: 'remijolivalt',
  password: 'Remi1982',
  ssl: { rejectUnauthorized: false }
});

async function checkFKs() {
  try {
    await client.connect();
    
    const result = await client.query(`
      SELECT 
        conname AS constraint_name,
        conrelid::regclass AS table_name,
        confrelid::regclass AS referenced_table
      FROM pg_constraint
      WHERE conname LIKE '%type_code%' OR conname LIKE '%insurer_code%'
      ORDER BY conname
    `);
    
    console.log('Contraintes FK trouvées:');
    console.log(result.rows);
    
    await client.end();
  } catch (error) {
    console.error('Erreur:', error.message);
    await client.end();
  }
}

checkFKs();
