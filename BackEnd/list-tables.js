const { Pool } = require('pg');
const p = new Pool({
  connectionString: 'postgresql://remijolivalt:Remi1982@52.143.159.51:5432/assurclair',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const r = await p.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
  console.log(r.rows.map(x => x.table_name).join('\n'));
  await p.end();
}
run().catch(e => { console.error(e.message); p.end(); });
