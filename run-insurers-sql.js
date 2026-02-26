const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const client = new Client({
  host: '52.143.159.51',
  port: 5432,
  user: 'remijolivalt',
  password: 'Remi1982',
  database: 'assurclair',
  ssl: { rejectUnauthorized: false }
});

const sql = fs.readFileSync(path.join(__dirname, 'truncate_insert_insurers.sql'), 'utf8');

(async () => {
  await client.connect();
  try {
    await client.query(sql);
    console.log('Done: TRUNCATE + INSERT 97 rows OK');
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
