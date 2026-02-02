/**
 * Vérifier les noms dans central_cg
 */

require('dotenv').config();
const { query } = require('./dist/db');

async function checkNames() {
  try {
    const result = await query(
      `SELECT id, insurer, product_name, metadata->>'type' as type, metadata->>'indexedFormulas' as formulas
       FROM central_cg 
       ORDER BY id DESC`
    );

    console.log('\n📋 Détails des CG:\n');
    
    result.rows.forEach(row => {
      console.log(`ID ${row.id}:`);
      console.log(`  Insurer: "${row.insurer}"`);
      console.log(`  Product: "${row.product_name}"`);
      console.log(`  Type: "${row.type}"`);
      console.log(`  Formulas: ${row.formulas}`);
      console.log('');
    });
    
    console.log('💡 Le frontend cherche avec:');
    console.log('  - insurerName.toLowerCase() === doc.insurer.toLowerCase()');
    console.log('  - policyType.toLowerCase() === doc.type.toLowerCase()');
    console.log('\n💡 Exemple: "MAIF".toLowerCase() = "maif", "Automobile".toLowerCase() = "automobile"');
    console.log('💡 Le type sélectionné dans le frontend est: "auto", "habitation", etc.');
    console.log('\n⚠️  PROBLÈME DÉTECTÉ: Le type stocké est "Automobile" mais le frontend cherche "auto"!\n');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
}

checkNames();
