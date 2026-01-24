const { Pool } = require('pg');

const pool = new Pool({
  host: '52.143.159.51',
  port: 5432,
  database: 'assurclair',
  user: 'remijolivalt',
  password: 'Remi1982',
  ssl: false
});

async function testCentralCgQuery() {
  try {
    // Voir toutes les données
    console.log('📋 Toutes les CdG indexées:\n');
    const all = await pool.query('SELECT id, insurer, metadata FROM central_cg ORDER BY insurer, id');
    all.rows.forEach(row => {
      const meta = row.metadata || {};
      console.log(`ID ${row.id}: ${row.insurer} (${meta.type || 'NO TYPE'})`);
      if (meta.indexedFormulas && meta.indexedFormulas.length > 0) {
        console.log(`  Formules: ${meta.indexedFormulas.slice(0, 3).join(', ')}${meta.indexedFormulas.length > 3 ? '...' : ''}`);
      }
      if (meta.indexedOptions && meta.indexedOptions.length > 0) {
        console.log(`  Options: ${meta.indexedOptions.slice(0, 3).join(', ')}${meta.indexedOptions.length > 3 ? '...' : ''}`);
      }
      console.log('');
    });

    // Test de filtre comme le fait le frontend
    console.log('\n🔍 Test requête: insurer=AXA, type=bancaire');
    const testInsurer = 'AXA';
    const testType = 'bancaire';
    
    const filtered = all.rows.filter(row => {
      const matchInsurer = row.insurer.toLowerCase().includes(testInsurer.toLowerCase());
      const matchType = row.metadata?.type === testType;
      console.log(`  ${row.insurer} (${row.metadata?.type}) - Insurer match: ${matchInsurer}, Type match: ${matchType}`);
      return matchInsurer && matchType;
    });
    
    console.log(`\n✅ Résultats: ${filtered.length} entrée(s)`);

  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await pool.end();
  }
}

testCentralCgQuery();
