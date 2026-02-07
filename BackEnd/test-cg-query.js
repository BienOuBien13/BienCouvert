// Test direct de la requête SQL
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://remijolivalt:Remi1982@52.143.159.51:5432/assurclair',
  ssl: {
    rejectUnauthorized: false
  }
});

async function testQuery() {
  try {
    console.log('Test 1: Vérifier les types d\'assurance');
    const types = await pool.query('SELECT code, label_fr FROM insurance_types ORDER BY code');
    console.log('Types d\'assurance:', types.rows);

    console.log('\nTest 2: Vérifier les assureurs');
    const insurers = await pool.query('SELECT code, label FROM insurers ORDER BY code LIMIT 10');
    console.log('Assureurs:', insurers.rows);

    console.log('\nTest 3: Vérifier les données central_cg');
    const cg = await pool.query(`
      SELECT insurance_type_code, insurer_code, COUNT(*) as count
      FROM central_cg 
      WHERE status = 'active'
      GROUP BY insurance_type_code, insurer_code
      ORDER BY insurance_type_code, insurer_code
      LIMIT 10
    `);
    console.log('Données central_cg:', cg.rows);

    console.log('\nTest 4: Tester la requête spécifique avec AUTO + MAA01');
    const specific = await pool.query(`
      SELECT id, insurer_code, insurance_type_code, version, status, 
             metadata->>'formules' as formules,
             metadata->>'resume_court' as resume_court
      FROM central_cg
      WHERE insurance_type_code = $1 AND insurer_code = $2 AND status = 'active'
      ORDER BY version DESC
      LIMIT 1
    `, ['AUTO', 'MAA01']);
    console.log('Résultat pour AUTO + MAA01:', JSON.stringify(specific.rows, null, 2));

    console.log('\nTest 5: Chercher MAA%');
    const maa = await pool.query(`
      SELECT DISTINCT insurer_code
      FROM central_cg
      WHERE insurer_code LIKE 'MAA%'
    `);
    console.log('Codes assureurs commençant par MAA:', maa.rows);

  } catch (error) {
    console.error('Erreur:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await pool.end();
  }
}

testQuery();
