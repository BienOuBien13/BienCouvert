const { query } = require('./dist/db');

async function checkMaifContent() {
  const result = await query(
    `SELECT insurer, product_name, 
     LEFT(content_text, 1000) as preview, 
     LENGTH(content_text) as total_length,
     POSITION('assistance' IN LOWER(content_text)) as assistance_pos,
     POSITION('déplacement' IN LOWER(content_text)) as deplacement_pos
     FROM central_cg 
     WHERE insurer = 'MAIF' OR insurer_code = 'MAIF'`
  );
  
  if (result.rows.length === 0) {
    console.log('❌ Aucun document MAIF trouvé');
    process.exit(1);
  }
  
  const doc = result.rows[0];
  console.log('📄 Document MAIF AUTO:');
  console.log(`   Longueur totale: ${doc.total_length} caractères`);
  console.log(`   Position "assistance": ${doc.assistance_pos || 'NON TROUVÉ'}`);
  console.log(`   Position "déplacement": ${doc.deplacement_pos || 'NON TROUVÉ'}`);
  console.log('\n📖 1000 premiers caractères:');
  console.log(doc.preview);
  
  if (doc.assistance_pos > 0) {
    console.log(`\n✅ Le mot "assistance" est trouvé à la position ${doc.assistance_pos}`);
    const extractResult = await query(
      `SELECT SUBSTRING(content_text, $1, 500) as extract
       FROM central_cg 
       WHERE insurer = 'MAIF' OR insurer_code = 'MAIF'`,
      [Math.max(1, doc.assistance_pos - 100)]
    );
    console.log('\n📝 Extrait autour de "assistance":');
    console.log(extractResult.rows[0].extract);
  }
  
  process.exit(0);
}

checkMaifContent().catch(err => {
  console.error('❌ Erreur:', err);
  process.exit(1);
});
