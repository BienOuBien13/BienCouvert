const { Client } = require('pg');
const c = new Client({
  host:'52.143.159.51',
  port:5432,
  database:'assurclair',
  user:'remijolivalt',
  password:'Remi1982',
  ssl:{rejectUnauthorized:false}
});

c.connect()
  .then(() => c.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'central_cg' AND column_name LIKE '%insurer%'"))
  .then(r => {
    console.log('Colonnes insurer dans central_cg:');
    r.rows.forEach(row => console.log('  -', row.column_name));
    c.end();
  })
  .catch(e => {
    console.error(e.message);
    c.end();
  });
