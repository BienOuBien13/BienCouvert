const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://remijolivalt:Remi1982@52.143.159.51:5432/assurclair',
  ssl: { rejectUnauthorized: false }
});

// Deduplicated pairs
const pairs = [
  ['AG201','AUT01'],['AG201','SAN01'],['AG201','VIE01'],['AG201','HAB01'],['AG201','PRE01'],
  ['AGP01','AUT01'],['AGP01','VIE01'],['AGP01','EMP01'],['AGP01','HAB01'],['AGP01','JUR01'],['AGP01','PRE01'],['AGP01','SAN01'],
  ['ANI01','ANI01'],
  ['AXA01','ANI01'],['AXA01','AUT01'],['AXA01','VIE01'],['AXA01','EMP01'],['AXA01','HAB01'],['AXA01','JUR01'],['AXA01','LOI01'],['AXA01','PRO01'],['AXA01','SAN01'],['AXA01','VOY01'],
  ['BAN01','AUT01'],['BAN01','VIE01'],['BAN01','HAB01'],
  ['BAN02','AUT01'],['BAN02','PRO01'],['BAN02','HAB01'],['BAN02','SAN01'],
  ['BNP01','AUT01'],['BNP01','HAB01'],
  ['BOU01','APP01'],
  ['CNP01','EMP01'],['CNP01','SAN01'],
  ['DIR01','AUT01'],['DIR01','HAB01'],['DIR01','JUR01'],['DIR01','SAN01'],
  ['FNA01','APP01'],
  ['MAA01','AUT01'],['MAA01','VIE01'],['MAA01','HAB01'],['MAA01','PRE01'],['MAA01','PRO01'],['MAA01','SAN01'],
  ['MAC01','ANI01'],['MAC01','AUT01'],['MAC01','VIE01'],['MAC01','HAB01'],['MAC01','JUR01'],['MAC01','PRE01'],['MAC01','SAN01'],
  ['MAI01','AUT01'],['MAI01','VIE01'],['MAI01','HAB01'],['MAI01','JUR01'],['MAI01','PRE01'],['MAI01','PRO01'],['MAI01','SAN01'],
  ['MAL01','VIE01'],['MAL01','EMP01'],['MAL01','PRE01'],['MAL01','SAN01'],
  ['MAT01','ANI01'],['MAT01','AUT01'],['MAT01','VIE01'],['MAT01','HAB01'],['MAT01','JUR01'],['MAT01','PRE01'],['MAT01','PRO01'],['MAT01','SAN01'],
  ['MGE01','ANI01'],['MGE01','VIE01'],['MGE01','SAN01'],['MGE01','VOY01'],
  ['MMA01','AUT01'],['MMA01','VIE01'],['MMA01','HAB01'],['MMA01','JUR01'],['MMA01','PRE01'],['MMA01','PRO01'],['MMA01','SAN01'],
  ['SOL01','ANI01'],['SOL01','AUT01'],['SOL01','EMP01'],['SOL01','HAB01'],['SOL01','SAN01'],
];

async function run() {
  const client = await pool.connect();
  try {
    // Check columns
    const cols = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='insurers_insurance_types' ORDER BY ordinal_position"
    );
    console.log('Columns:', cols.rows.map(r => r.column_name).join(', '));

    await client.query('BEGIN');

    let inserted = 0, skipped = 0;
    for (const [insurer_code, insurance_type_code] of pairs) {
      const r = await client.query(
        `INSERT INTO insurers_insurance_types(insurer_code, insurance_type_code)
         VALUES($1, $2)
         ON CONFLICT DO NOTHING`,
        [insurer_code, insurance_type_code]
      );
      if (r.rowCount > 0) inserted++; else skipped++;
    }

    await client.query('COMMIT');
    console.log(`Inserted: ${inserted}, Already existed: ${skipped}`);

    const count = await client.query('SELECT COUNT(*) FROM insurers_insurance_types');
    console.log('Total insurers_insurance_types now:', count.rows[0].count);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Error:', e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
