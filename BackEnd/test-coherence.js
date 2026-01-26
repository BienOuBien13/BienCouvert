const { Pool } = require('pg');
const config = require('./test-config');

const pool = new Pool(config.dbConfig);

async function testCoherence() {
  try {
    console.log('🧪 TEST DE COHÉRENCE DE L\'APPLICATION\n');
    console.log('═'.repeat(60));

    // 1. Vérifier les types dans central_cg
    console.log('\n1️⃣  Types dans central_cg:');
    const cgTypes = await pool.query(`
      SELECT insurer, metadata->>'type' as type, COUNT(*) as count
      FROM central_cg 
      GROUP BY insurer, metadata->>'type'
      ORDER BY insurer, type
    `);
    cgTypes.rows.forEach(row => {
      const status = row.type === row.type.toLowerCase() ? '✅' : '❌';
      console.log(`   ${status} ${row.insurer} (${row.type}): ${row.count} entrée(s)`);
    });

    // 2. Vérifier les types dans policies
    console.log('\n2️⃣  Types dans policies:');
    const polTypes = await pool.query(`
      SELECT type, COUNT(*) as count
      FROM policies
      GROUP BY type
      ORDER BY type
    `);
    polTypes.rows.forEach(row => {
      const status = row.type === row.type.toLowerCase() ? '✅' : '❌';
      console.log(`   ${status} ${row.type}: ${row.count} contrat(s)`);
    });

    // 3. Vérifier la structure users
    console.log('\n3️⃣  Structure users:');
    const users = await pool.query(`
      SELECT id, email, first_name, last_name, name
      FROM users
      LIMIT 3
    `);
    users.rows.forEach(row => {
      const hasNames = row.first_name && row.last_name;
      const status = hasNames ? '✅' : '❌';
      console.log(`   ${status} ${row.email}: ${row.first_name} ${row.last_name}${row.name ? ` (legacy: ${row.name})` : ''}`);
    });

    // 4. Test requête comme le frontend
    console.log('\n4️⃣  Test requête API (AXA + bancaire):');
    const testQuery = await pool.query(`
      SELECT id, insurer, metadata->>'type' as type
      FROM central_cg
      WHERE LOWER(insurer) LIKE LOWER('%AXA%')
        AND LOWER(metadata->>'type') = 'bancaire'
    `);
    if (testQuery.rows.length > 0) {
      console.log(`   ✅ ${testQuery.rows.length} résultat(s) trouvé(s)`);
      testQuery.rows.forEach(row => {
        console.log(`      - ID ${row.id}: ${row.insurer} (${row.type})`);
      });
    } else {
      console.log('   ❌ Aucun résultat (problème de recherche)');
    }

    // 5. Vérifier les formules indexées
    console.log('\n5️⃣  Formules indexées (échantillon):');
    const formulas = await pool.query(`
      SELECT insurer, metadata->>'type' as type, 
             jsonb_array_length(metadata->'indexedFormulas') as formula_count,
             jsonb_array_length(metadata->'indexedOptions') as option_count
      FROM central_cg
      LIMIT 5
    `);
    formulas.rows.forEach(row => {
      console.log(`   📋 ${row.insurer} (${row.type}): ${row.formula_count || 0} formule(s), ${row.option_count || 0} option(s)`);
    });

    console.log('\n' + '═'.repeat(60));
    console.log('✅ Test de cohérence terminé!');

  } catch (error) {
    console.error('\n❌ Erreur:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

testCoherence();
