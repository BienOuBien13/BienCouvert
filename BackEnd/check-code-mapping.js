// Vérifier la correspondance des codes
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://remijolivalt:Remi1982@52.143.159.51:5432/assurclair',
  ssl: { rejectUnauthorized: false }
});

async function checkMapping() {
  // Codes dans central_cg
  const cgCodes = await pool.query(`
    SELECT DISTINCT insurer_code FROM central_cg ORDER BY insurer_code
  `);
  console.log('Codes assureurs dans central_cg:');
  console.log(cgCodes.rows.map(r => r.insurer_code).join(', '));

  // Codes dans insurers
  const insurerCodes = await pool.query(`
    SELECT code, label FROM insurers ORDER BY code
  `);
  console.log('\nCodes assureurs dans insurers:');
  insurerCodes.rows.forEach(r => console.log(`  ${r.code} = ${r.label}`));

  // Trouver les codes CG qui n'existent pas dans insurers
  const missing = await pool.query(`
    SELECT DISTINCT cg.insurer_code
    FROM central_cg cg
    LEFT JOIN insurers i ON cg.insurer_code = i.code
    WHERE i.code IS NULL
  `);
  console.log('\nCodes CG sans correspondance dans insurers:');
  console.log(missing.rows.map(r => r.insurer_code).join(', '));

  await pool.end();
}

checkMapping();
