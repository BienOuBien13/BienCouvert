// Script pour vectoriser un CG page par page avec extraction tableaux
const { pool } = require('./dist/db');
const { vectorizeCgByPages } = require('./dist/services/pageVectorizationService');

const cgId = process.argv[2] ? parseInt(process.argv[2]) : null;

if (!cgId) {
  console.log('Usage: node vectorize-cg-pages.js <central_cg_id>');
  console.log('Exemple: node vectorize-cg-pages.js 100');
  process.exit(1);
}

async function main() {
  try {
    console.log(`\n🚀 Vectorisation page par page du CG ${cgId}...`);
    
    const result = await vectorizeCgByPages(pool, cgId, '');
    
    console.log('\n✅ Vectorisation terminée:');
    console.log(`   Pages: ${result.pagesProcessed}`);
    console.log(`   Tableaux: ${result.tablesExtracted}`);
    console.log(`   Faits: ${result.factsCreated}`);
    
    // Afficher un aperçu des faits créés
    console.log('\n📊 Aperçu des faits de couverture créés:\n');
    const facts = await pool.query(`
      SELECT 
        guarantee_label,
        formula_label,
        coverage_status,
        source_page_number
      FROM coverage_facts
      WHERE central_cg_id = $1
      ORDER BY guarantee_label, formula_label
      LIMIT 10
    `, [cgId]);
    
    console.table(facts.rows);
    
    if (facts.rows.length === 10) {
      const total = await pool.query(
        'SELECT COUNT(*) as total FROM coverage_facts WHERE central_cg_id = $1',
        [cgId]
      );
      console.log(`... et ${total.rows[0].total - 10} autres faits`);
    }
    
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
